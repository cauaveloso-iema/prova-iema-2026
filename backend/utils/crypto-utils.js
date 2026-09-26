// utils/crypto-utils.js
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_HEX = process.env.ENCRYPTION_KEY;

let KEY = null;
if (KEY_HEX && KEY_HEX.length === 64) {
  KEY = Buffer.from(KEY_HEX, 'hex');
} else {
  console.warn('⚠️ ENCRYPTION_KEY inválida ou ausente. Criptografia desabilitada.');
}

/**
 * Criptografa string simples
 */
function encrypt(text) {
  if (!text) return text;
  if (typeof text !== 'string') text = String(text);
  if (!KEY) return text;
  if (isEncrypted(text)) return text;
  
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${encrypted}:${authTag}`;
  } catch (err) {
    console.error('❌ Erro ao criptografar:', err.message);
    return text;
  }
}

/**
 * Descriptografa
 */
function decrypt(encrypted) {
  if (!encrypted) return encrypted;
  if (typeof encrypted !== 'string') return encrypted;
  if (!KEY) return encrypted;
  if (!isEncrypted(encrypted)) return encrypted;
  
  try {
    const [ivHex, encryptedHex, authTagHex] = encrypted.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const encryptedBuf = Buffer.from(encryptedHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedBuf);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    console.error('❌ Erro ao descriptografar:', err.message);
    return encrypted;
  }
}

/**
 * Detecta se já está criptografado
 */
function isEncrypted(text) {
  if (!text || typeof text !== 'string') return false;
  const parts = text.split(':');
  if (parts.length !== 3) return false;
  const [iv, data, tag] = parts;
  return (
    iv.length === IV_LENGTH * 2 &&
    tag.length === AUTH_TAG_LENGTH * 2 &&
    data.length > 0 &&
    /^[0-9a-f]+$/i.test(iv) &&
    /^[0-9a-f]+$/i.test(data) &&
    /^[0-9a-f]+$/i.test(tag)
  );
}

/**
 * Hash determinístico (SHA-256) para busca
 */
function hash(text) {
  if (!text || typeof text !== 'string') return text;
  const salt = process.env.AUTH_HASH_SALT || 'educapleno-visitas-2026';
  return crypto.createHash('sha256').update(salt + text).digest('hex');
}

/**
 * Mascara CPF: ***.***.789-01
 */
function mascararCPF(cpf) {
  if (!cpf) return '';
  const limpo = String(cpf).replace(/\D/g, '');
  if (limpo.length !== 11) return cpf;
  return `***.***.${limpo.slice(6, 9)}-${limpo.slice(9)}`;
}

function mascararRG(rg) {
  if (!rg) return '';
  const str = String(rg).trim();
  if (str.length < 3) return str;
  return `***${str.slice(-3)}`;
}

function mascararTelefone(tel) {
  if (!tel) return '';
  const limpo = String(tel).replace(/\D/g, '');
  if (limpo.length < 4) return tel;
  return `(**) *****-${limpo.slice(-4)}`;
}

function mascararEmail(email) {
  if (!email || !email.includes('@')) return email || '';
  const [user, domain] = email.split('@');
  const userMascarado = user.length <= 2 ? user : `${user[0]}***`;
  return `${userMascarado}@${domain}`;
}

module.exports = {
  encrypt,
  decrypt,
  hash,
  isEncrypted,
  mascararCPF,
  mascararRG,
  mascararTelefone,
  mascararEmail
};