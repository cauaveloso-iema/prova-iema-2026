// scripts/generate-production-keys.js
const crypto = require('crypto');

console.log('🔐 GERANDO CHAVES SEGURAS PARA PRODUÇÃO\n');

// 1. Gerar chaves únicas
const encryptionKey = crypto.randomBytes(32).toString('hex');
const hashSalt = crypto.randomBytes(16).toString('hex');

// 2. COLE SUAS MATRÍCULAS AQUI (do seu arquivo atual)
const matriculas = [
  '110102', '110103', '110006', '110042', '110100', 
  '110043', '110007', '110044', '110045', '110134',
  '110130', '110008', '110046', '110047', '110017',
  '110002', '110048', '110049', '110050', '110051',
  '110018', '110052', '110019', '110053', '110009',
  '110054', '110020', '110055', '110037', '110003',
  '110021', '110056', '110010', '110022', '110057',
  '110058', '110001', '110023', '110024', '110025',
  '110059', '110011', '110060', '110012', '110013',
  '110026', '110061', '110027', '110062', '110063',
  '110064', '110082', '110028', '110038', '110029',
  '110030', '110039', '110065', '110014', '110040',
  '110015', '110031', '110016', '110041', '110066',
  '110067', '110033', '110034', '110068', '110035',
  '110036', '110069'
];

// 3. Criptografar
function encryptData(text, key) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  
  return iv.toString('hex') + ':' + encrypted + ':' + authTag.toString('hex');
}

// 4. Gerar dados criptografados
const encryptedMatriculas = encryptData(matriculas.join(','), encryptionKey);

console.log('✅ COPIE ESTAS VARIÁVEIS PARA O RENDER:\n');
console.log('='.repeat(70));
console.log(`AUTH_ENCRYPTION_KEY=${encryptionKey}`);
console.log(`AUTH_HASH_SALT=${hashSalt}`);
console.log(`ENCRYPTED_MATRICULAS=${encryptedMatriculas}`);
console.log('='.repeat(70));

console.log('\n💾 Salve essas chaves em um local seguro!');