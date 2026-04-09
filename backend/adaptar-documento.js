// backend/adaptar-documento.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const GoogleDocsOAuth2 = require('./google-docs-oauth2');

const router = express.Router();

// Criar pasta de uploads temporários
const tempDir = path.join(__dirname, 'uploads', 'temp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

// Configurar multer
const upload = multer({ 
    dest: tempDir,
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['.docx', '.doc', '.pdf'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Apenas arquivos DOCX, DOC ou PDF são suportados'));
        }
    }
});

const googleDocs = new GoogleDocsOAuth2();

// ============ ROTA DE TESTE ============
router.get('/adaptar-documento/teste', (req, res) => {
    res.json({ success: true, message: 'API funcionando!' });
});

// ============ ROTA DE AUTENTICAÇÃO ============
router.get('/google/auth', (req, res) => {
    res.redirect(googleDocs.getAuthUrl());
});

// ============ CALLBACK ============
router.get('/google/callback', async (req, res) => {
    const { code } = req.query;
    try {
        await googleDocs.setTokensFromCode(code);
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Autenticação concluída</title>
                <style>
                    body { font-family: Arial; text-align: center; padding: 50px; background: linear-gradient(135deg, #667eea, #764ba2); }
                    .card { background: white; padding: 40px; border-radius: 20px; display: inline-block; }
                    .success { color: #10b981; font-size: 64px; }
                    button { background: #10b981; color: white; border: none; padding: 12px 30px; border-radius: 8px; cursor: pointer; margin-top: 20px; }
                </style>
            </head>
            <body>
                <div class="card">
                    <div class="success">✅</div>
                    <h1>Autenticação concluída!</h1>
                    <p>O sistema está autorizado a acessar o Google Drive e Google Docs.</p>
                    <button onclick="window.close()">Fechar</button>
                </div>
                <script>
                    if (window.opener) {
                        window.opener.postMessage({ type: 'google-auth-success' }, '*');
                    }
                </script>
            </body>
            </html>
        `);
    } catch (error) {
        res.status(500).send(`Erro: ${error.message}`);
    }
});

// ============ VERIFICAR STATUS ============
router.get('/google/status', async (req, res) => {
    const authed = await googleDocs.isAuthenticated();
    res.json({ authenticated: authed });
});

// ============ ROTA PRINCIPAL ============
router.post('/adaptar-documento', upload.single('arquivo'), async (req, res) => {
    console.log('\n🔵 ===== ADAPTAR DOCUMENTO =====');
    
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado' });
        }
        
        console.log(`📄 Arquivo: ${req.file.originalname}`);
        console.log(`📏 Tamanho: ${req.file.size} bytes`);
        
        // Parse das opções
        let opcoes = {};
        if (req.body.opcoes) {
            try {
                opcoes = typeof req.body.opcoes === 'string' ? JSON.parse(req.body.opcoes) : req.body.opcoes;
            } catch (e) {
                opcoes = req.body.opcoes;
            }
        }
        
        // Garantir valores padrão
        opcoes = {
            tamanho_fonte: opcoes.tamanho_fonte || 12,
            caixa_alta: opcoes.caixa_alta || false,
            negrito: opcoes.negrito || opcoes.negrito_global || false,
            alto_contraste: opcoes.alto_contraste || false,
            fonte_dislexia: opcoes.fonte_dislexia || false
        };
        
        console.log(`🎨 Opções:`, opcoes);
        
        // Verificar autenticação
        const isAuthed = await googleDocs.isAuthenticated();
        if (!isAuthed) {
            return res.status(401).json({ 
                success: false, 
                error: 'Google Drive não autenticado',
                authUrl: '/api/google/auth',
                precisaAuth: true
            });
        }
        
        // Ler arquivo
        const buffer = fs.readFileSync(req.file.path);
        
        // Processar documento
        const resultado = await googleDocs.processarDocumento(buffer, req.file.originalname, opcoes);
        
        // Limpar arquivo temporário
        fs.unlinkSync(req.file.path);
        
        console.log(`✅ Documento processado! Tamanho do PDF: ${resultado.pdfBase64.length} caracteres`);
        
        res.json({
            success: true,
            pdf: resultado.pdfBase64,
            nome: `adaptado_${req.file.originalname.replace(/\.\w+$/, '.pdf')}`,
            message: 'Documento processado com sucesso!'
        });
        
    } catch (error) {
        console.error('❌ Erro:', error.message);
        
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        
        res.status(500).json({ 
            success: false, 
            error: error.message
        });
    }
});

module.exports = router;