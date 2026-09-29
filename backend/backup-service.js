const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

class BackupService {
    constructor() {
        this.backupDir = path.join(__dirname, 'backups');
        this.syncQueueDir = path.join(__dirname, 'sync-queue');
        this.ensureDirs();
        this.online = true;
        this.checkConnection();
    }
    
    ensureDirs() {
        [this.backupDir, this.syncQueueDir].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
    }
    
    async checkConnection() {
        // Verificar conexão periodicamente
        if (typeof fetch !== 'undefined') {
            setInterval(async () => {
                try {
                    await fetch('http://localhost:3000/api/health', { timeout: 5000 });
                    this.online = true;
                    // Tentar sincronizar quando voltar online
                    await this.processSyncQueue();
                } catch (error) {
                    this.online = false;
                }
            }, 10000); // Verificar a cada 10 segundos
        }
    }
    
    async connectDB() {
        try {
            await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/provas_online', {
                maxPoolSize: 10,
                serverSelectionTimeoutMS: 5000,
            });
            console.log('✅ Conectado ao MongoDB para backup');
        } catch (error) {
            console.error('❌ Erro ao conectar:', error);
            throw error;
        }
    }
    
    // ============ SISTEMA DE SINCRONIZAÇÃO OFFLINE ============
    
    async queueForSync(collection, action, data) {
        try {
            const syncId = crypto.randomBytes(8).toString('hex');
            const timestamp = Date.now();
            const syncItem = {
                id: syncId,
                collection,
                action, // 'create', 'update', 'delete'
                data,
                timestamp,
                attempts: 0,
                status: 'pending'
            };
            
            const syncFile = path.join(this.syncQueueDir, `sync-${syncId}.json`);
            fs.writeFileSync(syncFile, JSON.stringify(syncItem, null, 2));
            
            console.log(`📋 Item adicionado à fila de sincronização: ${collection}.${action}`);
            
            return syncId;
        } catch (error) {
            console.error('❌ Erro ao enfileirar:', error);
            throw error;
        }
    }
    
    async processSyncQueue() {
        if (!this.online) return;
        
        try {
            const syncFiles = fs.readdirSync(this.syncQueueDir)
                .filter(f => f.startsWith('sync-') && f.endsWith('.json'));
            
            if (syncFiles.length === 0) return;
            
            console.log(`🔄 Processando ${syncFiles.length} itens na fila de sincronização`);
            
            for (const file of syncFiles) {
                await this.processSyncItem(path.join(this.syncQueueDir, file));
            }
        } catch (error) {
            console.error('❌ Erro processando fila:', error);
        }
    }
    
    async processSyncItem(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const item = JSON.parse(content);
            
            // Limitar tentativas
            if (item.attempts >= 5) {
                console.log(`❌ Item ${item.id} excedeu tentativas, movendo para falhas`);
                const failedDir = path.join(this.syncQueueDir, 'failed');
                if (!fs.existsSync(failedDir)) fs.mkdirSync(failedDir, { recursive: true });
                fs.renameSync(filePath, path.join(failedDir, path.basename(filePath)));
                return;
            }
            
            item.attempts += 1;
            item.lastAttempt = Date.now();
            
            // Tentar sincronizar com o servidor
            const success = await this.syncToServer(item);
            
            if (success) {
                // Remover da fila se bem-sucedido
                fs.unlinkSync(filePath);
                console.log(`✅ Sincronizado: ${item.collection}.${item.action} (${item.id})`);
            } else {
                // Salvar tentativa
                fs.writeFileSync(filePath, JSON.stringify(item, null, 2));
                console.log(`⚠️ Falha na sincronização, tentativa ${item.attempts}/5`);
            }
        } catch (error) {
            console.error(`❌ Erro processando item:`, error);
        }
    }
    
    async syncToServer(syncItem) {
        try {
            const apiUrl = process.env.API_URL || 'http://localhost:3000';
            
            const response = await fetch(`${apiUrl}/api/sync/${syncItem.collection}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: syncItem.action,
                    data: syncItem.data,
                    syncId: syncItem.id
                }),
                timeout: 10000
            });
            
            return response.ok;
        } catch (error) {
            return false;
        }
    }
    
    // ============ BACKUP DE DADOS ============
    
    async backupCollections() {
        try {
            const db = mongoose.connection.db;
            const collections = await db.listCollections().toArray();
            const backupData = {
                timestamp: new Date().toISOString(),
                collections: {}
            };
            
            // Coleções importantes para backup
            const importantCollections = ['provas', 'alunos', 'respostas', 'turmas', 'usuarios'];
            
            for (const collection of collections) {
                if (importantCollections.includes(collection.name)) {
                    try {
                        const data = await db.collection(collection.name).find({}).toArray();
                        backupData.collections[collection.name] = data;
                        console.log(`📦 ${collection.name}: ${data.length} documentos`);
                    } catch (err) {
                        console.warn(`⚠️ Erro ao fazer backup de ${collection.name}:`, err.message);
                    }
                }
            }
            
            // Salvar como JSON
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFile = path.join(this.backupDir, `backup-${timestamp}.json`);
            fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));
            
            // Salvar também um backup resumido
            const summary = {
                timestamp: backupData.timestamp,
                counts: Object.keys(backupData.collections).reduce((acc, key) => {
                    acc[key] = backupData.collections[key].length;
                    return acc;
                }, {})
            };
            
            const summaryFile = path.join(this.backupDir, `summary-${timestamp}.json`);
            fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
            
            console.log(`✅ Backup salvo em: ${backupFile}`);
            console.log(`📊 Resumo:`, summary.counts);
            
            this.cleanOldBackups();
            
            return { backupFile, summary };
        } catch (error) {
            console.error('❌ Erro no backup:', error);
            throw error;
        }
    }
    
    cleanOldBackups() {
        try {
            // Limpar backups completos (mantém últimos 7)
            const backupFiles = fs.readdirSync(this.backupDir)
                .filter(f => f.startsWith('backup-') && f.endsWith('.json'))
                .map(f => ({
                    name: f,
                    path: path.join(this.backupDir, f),
                    time: fs.statSync(path.join(this.backupDir, f)).mtime.getTime()
                }))
                .sort((a, b) => b.time - a.time);
            
            if (backupFiles.length > 7) {
                backupFiles.slice(7).forEach(file => {
                    fs.unlinkSync(file.path);
                    console.log(`🗑️  Removido backup antigo: ${file.name}`);
                });
            }
            
            // Limpar sumários (mantém últimos 30)
            const summaryFiles = fs.readdirSync(this.backupDir)
                .filter(f => f.startsWith('summary-') && f.endsWith('.json'))
                .map(f => ({
                    name: f,
                    path: path.join(this.backupDir, f),
                    time: fs.statSync(path.join(this.backupDir, f)).mtime.getTime()
                }))
                .sort((a, b) => b.time - a.time);
            
            if (summaryFiles.length > 30) {
                summaryFiles.slice(30).forEach(file => {
                    fs.unlinkSync(file.path);
                    console.log(`🗑️  Removido sumário antigo: ${file.name}`);
                });
            }
            
        } catch (error) {
            console.error('❌ Erro limpando arquivos:', error);
        }
    }
    
    // ============ RESTAURAÇÃO ============
    
    async restoreFromBackup(backupFile) {
        try {
            if (!fs.existsSync(backupFile)) {
                throw new Error('Arquivo de backup não encontrado');
            }
            
            const backupData = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
            const db = mongoose.connection.db;
            
            console.log(`🔄 Restaurando backup de ${backupData.timestamp}`);
            
            for (const [collectionName, documents] of Object.entries(backupData.collections)) {
                try {
                    // Verificar se a coleção existe
                    const collectionExists = await db.listCollections({ name: collectionName }).toArray();
                    
                    if (collectionExists.length === 0) {
                        console.log(`⚠️ Coleção ${collectionName} não existe, criando...`);
                        await db.createCollection(collectionName);
                    }
                    
                    // Limpar coleção existente
                    await db.collection(collectionName).deleteMany({});
                    
                    // Inserir documentos
                    if (documents.length > 0) {
                        await db.collection(collectionName).insertMany(documents);
                    }
                    
                    console.log(`✅ Restaurado ${collectionName}: ${documents.length} documentos`);
                } catch (err) {
                    console.error(`❌ Erro restaurando ${collectionName}:`, err.message);
                }
            }
            
            console.log('🎉 Restauração concluída com sucesso!');
            return true;
        } catch (error) {
            console.error('❌ Erro na restauração:', error);
            throw error;
        }
    }
    
    // ============ UTILITÁRIOS ============
    
    getSyncQueueStatus() {
        try {
            if (!fs.existsSync(this.syncQueueDir)) {
                return {
                    pending: 0,
                    online: this.online,
                    lastCheck: new Date().toISOString()
                };
            }
            
            const files = fs.readdirSync(this.syncQueueDir)
                .filter(f => f.startsWith('sync-') && f.endsWith('.json'));
            
            return {
                pending: files.length,
                online: this.online,
                lastCheck: new Date().toISOString()
            };
        } catch (error) {
            return { 
                pending: 0,
                online: false,
                error: error.message,
                lastCheck: new Date().toISOString()
            };
        }
    }
    
    listBackups() {
        try {
            if (!fs.existsSync(this.backupDir)) {
                return [];
            }
            
            return fs.readdirSync(this.backupDir)
                .filter(f => f.startsWith('backup-') && f.endsWith('.json'))
                .map(f => {
                    const filePath = path.join(this.backupDir, f);
                    const stats = fs.statSync(filePath);
                    return {
                        name: f,
                        size: (stats.size / 1024 / 1024).toFixed(2) + ' MB',
                        modified: stats.mtime,
                        created: stats.birthtime
                    };
                })
                .sort((a, b) => new Date(b.modified) - new Date(a.modified));
        } catch (error) {
            console.error('❌ Erro ao listar backups:', error);
            return [];
        }
    }
}

module.exports = BackupService;