// backend/google-docs-oauth2.js
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

class GoogleDocsOAuth2 {
    constructor() {
        // REMOVER o caminho do arquivo - NÃO vamos mais usar arquivo
        // this.tokensPath = path.join(__dirname, 'google-tokens.json'); // <-- REMOVER
        
        this.CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
        this.CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
        
        this.isProduction = process.env.NODE_ENV === 'production';
        this.REDIRECT_URI = this.isProduction 
            ? process.env.GOOGLE_REDIRECT_URI_PROD 
            : process.env.GOOGLE_REDIRECT_URI_LOCAL;
        
        console.log('\n🔧 GoogleDocsOAuth2 inicializado');
        console.log(`   🌍 Ambiente: ${this.isProduction ? 'PRODUÇÃO' : 'DESENVOLVIMENTO'}`);
        console.log(`   🔗 Redirect URI: ${this.REDIRECT_URI}`);
        console.log(`   💾 Tokens serão salvos APENAS no MongoDB (seguro)`);
        
        this.init();
    }
    
    init() {
        this.oauth2Client = new google.auth.OAuth2(
            this.CLIENT_ID,
            this.CLIENT_SECRET,
            this.REDIRECT_URI
        );
        
        // Carregar tokens APENAS do MongoDB
        this.carregarTokensDoMongoDB();
        
        this.drive = google.drive({ version: 'v3', auth: this.oauth2Client });
        this.docs = google.docs({ version: 'v1', auth: this.oauth2Client });
    }
    
    getAuthUrl() {
        return this.oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: [
                'https://www.googleapis.com/auth/drive.file',
                'https://www.googleapis.com/auth/documents'
            ],
            prompt: 'consent'
        });
    }
    
    async setTokensFromCode(code) {
        const { tokens } = await this.oauth2Client.getToken(code);
        this.oauth2Client.setCredentials(tokens);
        
        // Salvar APENAS no MongoDB (NÃO salvar em arquivo)
        await this.salvarTokensNoMongoDB(tokens);
        
        console.log('   ✅ Tokens salvos no MongoDB');
        return tokens;
    }
    
    async isAuthenticated() {
        try {
            await this.oauth2Client.getAccessToken();
            return true;
        } catch {
            return false;
        }
    }
    
    bufferToStream(buffer) {
        const stream = new Readable();
        stream.push(buffer);
        stream.push(null);
        return stream;
    }
    
    async processarDocumento(fileBuffer, fileName, opcoes = {}) {
        let fileId = null;
        let docsId = null;
        
        try {
            console.log(`\n📄 Processando: ${fileName}`);
            console.log(`🎨 Adaptações:`, opcoes);
            
            const authed = await this.isAuthenticated();
            if (!authed) {
                const renovado = await this.renovarToken();
                if (!renovado) {
                    throw new Error('Google Drive não autenticado. Acesse /api/google/auth');
                }
            }
            
            const stream = this.bufferToStream(fileBuffer);
            const uploadResponse = await this.drive.files.create({
                requestBody: { name: fileName, parents: ['root'] },
                media: { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', body: stream },
                fields: 'id'
            });
            fileId = uploadResponse.data.id;
            console.log(`   ✅ Upload OK. ID: ${fileId}`);
            
            const copyResponse = await this.drive.files.copy({
                fileId: fileId,
                requestBody: { name: `temp_${fileName}`, mimeType: 'application/vnd.google-apps.document' }
            });
            docsId = copyResponse.data.id;
            console.log(`   ✅ Convertido. ID: ${docsId}`);
            
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            await this.aplicarAdaptacoesNoDocumento(docsId, opcoes);
            
            const pdfBuffer = await this.exportarComoPdf(docsId);
            
            await this.limparArquivos(fileId, docsId);
            
            return { pdfBase64: pdfBuffer.toString('base64') };
            
        } catch (error) {
            await this.limparArquivos(fileId, docsId);
            throw error;
        }
    }
    
    async renovarToken() {
        try {
            const credentials = this.oauth2Client.credentials;
            if (credentials && credentials.refresh_token) {
                this.oauth2Client.setCredentials({
                    refresh_token: credentials.refresh_token
                });
                const { credentials: novasCredenciais } = await this.oauth2Client.refreshAccessToken();
                this.oauth2Client.setCredentials(novasCredenciais);
                
                // Salvar tokens renovados no MongoDB
                await this.salvarTokensNoMongoDB(novasCredenciais);
                
                console.log('   ✅ Token renovado com sucesso');
                return true;
            }
        } catch (error) {
            console.log('   ❌ Erro ao renovar token:', error.message);
        }
        return false;
    }
    
    async aplicarAdaptacoesNoDocumento(documentId, opcoes) {
        console.log('   ✏️ Aplicando adaptações...');
        
        const document = await this.docs.documents.get({ documentId });
        const endIndex = document.data.body.content[document.data.body.content.length - 1]?.endIndex || 1;
        
        const requests = [];
        
        if (opcoes.negrito) {
            console.log('   🔤 Aplicando negrito global...');
            requests.push({
                updateTextStyle: {
                    range: { startIndex: 1, endIndex: endIndex },
                    textStyle: { bold: true },
                    fields: 'bold'
                }
            });
        }
        
        if (opcoes.tamanho_fonte && opcoes.tamanho_fonte > 12) {
            console.log(`   📏 Aplicando fonte ampliada (${opcoes.tamanho_fonte}pt)...`);
            requests.push({
                updateTextStyle: {
                    range: { startIndex: 1, endIndex: endIndex },
                    textStyle: {
                        fontSize: { magnitude: opcoes.tamanho_fonte, unit: 'PT' }
                    },
                    fields: 'fontSize'
                }
            });
        }
        
        if (requests.length > 0) {
            await this.docs.documents.batchUpdate({
                documentId: documentId,
                requestBody: { requests }
            });
            console.log(`   ✅ ${requests.length} modificações aplicadas`);
        }
        
        if (opcoes.caixa_alta) {
            console.log('   🔠 Aplicando caixa alta...');
            await this.aplicarCaixaAlta(documentId, document);
        }
        
        console.log('   ✅ Adaptações aplicadas com sucesso');
    }
    
    async aplicarCaixaAlta(documentId, document) {
        try {
            if (!document) {
                document = await this.docs.documents.get({ documentId });
            }
            
            const requests = [];
            
            function processElement(element, requests) {
                if (element.textRun && element.textRun.content) {
                    const originalText = element.textRun.content;
                    const upperText = originalText.toUpperCase();
                    
                    if (originalText !== upperText) {
                        const startIndex = element.startIndex;
                        const endIndex = element.endIndex;
                        
                        requests.push({
                            deleteContentRange: {
                                range: { startIndex: startIndex, endIndex: endIndex }
                            }
                        });
                        requests.push({
                            insertText: {
                                location: { index: startIndex },
                                text: upperText
                            }
                        });
                    }
                }
                
                if (element.paragraph) {
                    for (const child of element.paragraph.elements || []) {
                        processElement(child, requests);
                    }
                }
                
                if (element.table) {
                    for (const row of element.table.tableRows || []) {
                        for (const cell of row.tableCells || []) {
                            for (const content of cell.content || []) {
                                processElement(content, requests);
                            }
                        }
                    }
                }
            }
            
            for (const content of document.data.body.content || []) {
                processElement(content, requests);
            }
            
            const batchSize = 50;
            for (let i = 0; i < requests.length; i += batchSize) {
                const batch = requests.slice(i, i + batchSize);
                if (batch.length > 0) {
                    await this.docs.documents.batchUpdate({
                        documentId: documentId,
                        requestBody: { requests: batch }
                    });
                }
            }
            
            console.log(`   🔠 ${requests.length / 2} textos convertidos para maiúsculo`);
            
        } catch (error) {
            console.log('   ⚠️ Erro na caixa alta:', error.message);
            await this.aplicarCaixaAltaSimples(documentId);
        }
    }
    
    async aplicarCaixaAltaSimples(documentId) {
        try {
            const document = await this.docs.documents.get({ documentId });
            let fullText = '';
            
            function extractText(element) {
                if (element.textRun && element.textRun.content) {
                    fullText += element.textRun.content;
                }
                if (element.paragraph) {
                    for (const child of element.paragraph.elements || []) {
                        extractText(child);
                    }
                }
                if (element.table) {
                    for (const row of element.table.tableRows || []) {
                        for (const cell of row.tableCells || []) {
                            for (const content of cell.content || []) {
                                extractText(content);
                            }
                        }
                    }
                }
            }
            
            for (const content of document.data.body.content || []) {
                extractText(content);
            }
            
            if (fullText) {
                const upperText = fullText.toUpperCase();
                const endIndex = document.data.body.content[document.data.body.content.length - 1]?.endIndex || 1;
                
                await this.docs.documents.batchUpdate({
                    documentId: documentId,
                    requestBody: {
                        requests: [
                            {
                                deleteContentRange: {
                                    range: { startIndex: 1, endIndex: endIndex }
                                }
                            },
                            {
                                insertText: {
                                    location: { index: 1 },
                                    text: upperText
                                }
                            }
                        ]
                    }
                });
                console.log('   🔠 Texto completo convertido via fallback');
            }
        } catch (error) {
            console.log('   ❌ Erro no fallback da caixa alta:', error.message);
        }
    }
    
    async exportarComoPdf(documentId) {
        const response = await this.drive.files.export(
            { fileId: documentId, mimeType: 'application/pdf' },
            { responseType: 'arraybuffer' }
        );
        return Buffer.from(response.data);
    }
    
    async limparArquivos(fileId, docsId) {
        if (fileId || docsId) {
            setTimeout(async () => {
                try {
                    if (fileId) await this.drive.files.delete({ fileId: fileId });
                    if (docsId) await this.drive.files.delete({ fileId: docsId });
                    console.log('   🗑️ Arquivos temporários removidos');
                } catch (e) {}
            }, 60000);
        }
    }
    
    // ============================================
    // PERSISTÊNCIA NO MONGODB (APENAS)
    // ============================================
    
    async salvarTokensNoMongoDB(tokens) {
        try {
            const mongoose = require('mongoose');
            
            let Config;
            try {
                Config = mongoose.model('Config');
            } catch (e) {
                const ConfigSchema = new mongoose.Schema({
                    chave: { type: String, required: true, unique: true },
                    valor: { type: mongoose.Schema.Types.Mixed, required: true },
                    tipo: { type: String, default: 'object' },
                    categoria: { type: String, default: 'google' },
                    atualizadoEm: { type: Date, default: Date.now }
                });
                Config = mongoose.model('Config', ConfigSchema);
            }
            
            await Config.findOneAndUpdate(
                { chave: 'google_tokens' },
                { 
                    chave: 'google_tokens',
                    valor: tokens,
                    tipo: 'object',
                    categoria: 'google',
                    atualizadoEm: new Date()
                },
                { upsert: true }
            );
            console.log('   ✅ Tokens salvos no MongoDB');
            return true;
        } catch (error) {
            console.error('   ❌ Erro ao salvar tokens no MongoDB:', error.message);
            return false;
        }
    }
    
    async carregarTokensDoMongoDB() {
        try {
            const mongoose = require('mongoose');
            
            if (mongoose.connection.readyState !== 1) {
                console.log('   ⚠️ MongoDB não conectado, aguardando...');
                setTimeout(() => this.carregarTokensDoMongoDB(), 2000);
                return false;
            }
            
            let Config;
            try {
                Config = mongoose.model('Config');
            } catch (e) {
                const ConfigSchema = new mongoose.Schema({
                    chave: { type: String, required: true, unique: true },
                    valor: { type: mongoose.Schema.Types.Mixed, required: true }
                });
                Config = mongoose.model('Config', ConfigSchema);
            }
            
            const config = await Config.findOne({ chave: 'google_tokens' });
            if (config && config.valor) {
                this.oauth2Client.setCredentials(config.valor);
                console.log('   ✅ Tokens carregados do MongoDB');
                return true;
            } else {
                console.log('   ℹ️ Nenhum token encontrado no MongoDB');
            }
        } catch (error) {
            console.log('   ⚠️ Erro ao carregar tokens do MongoDB:', error.message);
        }
        return false;
    }
}

module.exports = GoogleDocsOAuth2;