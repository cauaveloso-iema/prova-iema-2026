// utils/criptografia.js
// ============================================
// 🔐 CRIPTOGRAFIA AES-256-GCM PARA ATENDIMENTOS
// ============================================
// Usa uma chave DEDICADA (ATENDIMENTO_ENCRYPTION_KEY)
// para não conflitar com a chave da autenticação de professores
// ============================================

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

// 🔑 Usa uma chave DIFERENTE da autenticação
const KEY_HEX = process.env.ATENDIMENTO_ENCRYPTION_KEY;

if (!KEY_HEX) {
  console.error('❌ ERRO CRÍTICO: ATENDIMENTO_ENCRYPTION_KEY não definida no .env');
  console.error('   Adicione: ATENDIMENTO_ENCRYPTION_KEY=<64 caracteres hex>');
  process.exit(1);
}

if (KEY_HEX.length !== 64) {
  console.error('❌ ERRO CRÍTICO: ATENDIMENTO_ENCRYPTION_KEY deve ter 64 caracteres hex');
  console.error(`   Atual: ${KEY_HEX.length} caracteres`);
  process.exit(1);
}

const KEY = Buffer.from(KEY_HEX, 'hex');

// ============================================
// 🔒 CRIPTOGRAFAR
// ============================================
function criptografar(texto) {
  if (typeof texto !== 'string' || texto.length === 0) {
    return texto;
  }
  
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
    
    let encrypted = cipher.update(texto, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag().toString('hex');
    
    // Formato: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  } catch (error) {
    console.error('❌ Erro ao criptografar:', error.message);
    throw error;
  }
}

// ============================================
// 🔓 DESCRIPTOGRAFAR
// ============================================
function descriptografar(hash) {
  if (typeof hash !== 'string' || hash.length === 0) {
    return hash;
  }
  
  const partes = hash.split(':');
  
  if (partes.length !== 3) {
    return hash;  // dado antigo não criptografado
  }
  
  const [ivHex, authTagHex, encrypted] = partes;
  
  if (!/^[0-9a-f]+$/i.test(ivHex) || 
      !/^[0-9a-f]+$/i.test(authTagHex) || 
      !/^[0-9a-f]+$/i.test(encrypted)) {
    return hash;
  }
  
  if (ivHex.length !== 32 || authTagHex.length !== 32) {
    return hash;
  }
  
  try {
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.warn('⚠️ Falha ao descriptografar:', error.message);
    return hash;
  }
}

// ============================================
// 🧪 VERIFICAR SE ESTÁ CRIPTOGRAFADO
// ============================================
function estaCriptografado(valor) {
  if (typeof valor !== 'string') return false;
  
  const partes = valor.split(':');
  if (partes.length !== 3) return false;
  
  const [iv, tag, dados] = partes;
  
  return (
    iv.length === 32 &&
    tag.length === 32 &&
    dados.length > 0 &&
    /^[0-9a-f]+$/i.test(iv) &&
    /^[0-9a-f]+$/i.test(tag) &&
    /^[0-9a-f]+$/i.test(dados)
  );
}

module.exports = {
  criptografar,
  descriptografar,
  estaCriptografado
};