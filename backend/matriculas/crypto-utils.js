// backend/matriculas/crypto-utils.js
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

console.log('🔍 [crypto-utils] Iniciando...');

// Carregar .env manualmente com caminho absoluto
try {
    const envPath = path.resolve(__dirname, '..', '..', '.env');
    console.log(`📁 [crypto-utils] Tentando carregar .env de: ${envPath}`);
    
    if (fs.existsSync(envPath)) {
        require('dotenv').config({ path: envPath });
        console.log('✅ [crypto-utils] .env carregado com sucesso');
    } else {
        console.error(`❌ [crypto-utils] Arquivo .env não encontrado em: ${envPath}`);
    }
} catch (e) {
    console.error('❌ [crypto-utils] Erro ao carregar .env:', e.message);
}

// Verificar variáveis disponíveis
console.log('\n📊 [crypto-utils] Variáveis disponíveis:');
console.log(`   ENCRYPTION_KEY: ${process.env.ENCRYPTION_KEY ? '✅ Presente' : '❌ Ausente'}`);
console.log(`   AUTH_ENCRYPTION_KEY: ${process.env.AUTH_ENCRYPTION_KEY ? '✅ Presente' : '❌ Ausente'}`);

// Usar ENCRYPTION_KEY (que sabemos que existe)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

if (ENCRYPTION_KEY) {
    console.log(`\n🔑 [crypto-utils] Chave encontrada:`);
    console.log(`   Tamanho: ${ENCRYPTION_KEY.length} caracteres`);
    console.log(`   Preview: ${ENCRYPTION_KEY.substring(0, 10)}...`);
    console.log(`   Hex válido: ${/^[0-9a-f]+$/i.test(ENCRYPTION_KEY) ? '✅ Sim' : '❌ Não'}`);
} else {
    console.error('\n❌ [crypto-utils] ERRO CRÍTICO: Nenhuma chave de criptografia encontrada!');
    console.error('   Valores disponíveis:', Object.keys(process.env).filter(k => k.includes('KEY')).join(', '));
}

function decryptData(encryptedData) {
    try {
        if (!encryptedData) {
            console.error('❌ [crypto-utils] encryptedData vazio');
            return null;
        }
        
        if (!ENCRYPTION_KEY) {
            console.error('❌ [crypto-utils] Sem chave de criptografia');
            return null;
        }
        
        const parts = encryptedData.split(':');
        if (parts.length !== 3) {
            console.error('❌ [crypto-utils] Formato inválido. Esperado iv:encrypted:authTag');
            return null;
        }
        
        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = Buffer.from(parts[1], 'hex');
        const authTag = Buffer.from(parts[2], 'hex');
        
        const key = Buffer.from(ENCRYPTION_KEY, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);
        
        let decrypted = decipher.update(encrypted);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        
        return JSON.parse(decrypted.toString('utf8'));
    } catch (error) {
        console.error('❌ [crypto-utils] Erro ao descriptografar:', error.message);
        return null;
    }
}

function encryptData(data) {
    try {
        if (!ENCRYPTION_KEY) {
            console.error('❌ [crypto-utils] Sem chave de criptografia');
            return null;
        }
        
        const iv = crypto.randomBytes(16);
        const key = Buffer.from(ENCRYPTION_KEY, 'hex');
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        
        let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        const authTag = cipher.getAuthTag();
        
        return `${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`;
    } catch (error) {
        console.error('❌ [crypto-utils] Erro ao criptografar:', error.message);
        return null;
    }
}

module.exports = { decryptData, encryptData };