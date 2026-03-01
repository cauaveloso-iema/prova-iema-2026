// backend/security/professor-auth.js
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

class ProfessorAuthSystem {
  constructor() {
    console.log('='.repeat(60));
    console.log('🔐 INICIALIZANDO SISTEMA DE AUTENTICAÇÃO DE PROFESSORES');
    console.log('='.repeat(60));
    
    // Tenta carregar variáveis de várias formas
    this.loadEnvironmentVariables();
    
    this.encryptionKey = process.env.AUTH_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
    this.hashSalt = process.env.AUTH_HASH_SALT;
    this.encryptedData = process.env.ENCRYPTED_MATRICULAS;
    
    console.log('\n📊 VERIFICANDO VARIÁVEIS DE AMBIENTE:');
    console.log(`   AUTH_ENCRYPTION_KEY: ${this.encryptionKey ? '✅' : '❌'} ${this.encryptionKey ? '(' + this.encryptionKey.length + ' chars)' : ''}`);
    console.log(`   AUTH_HASH_SALT: ${this.hashSalt ? '✅' : '❌'} ${this.hashSalt ? '(' + this.hashSalt.length + ' chars)' : ''}`);
    console.log(`   ENCRYPTED_MATRICULAS: ${this.encryptedData ? '✅' : '❌'} ${this.encryptedData ? '(' + this.encryptedData.length + ' chars)' : ''}`);
    
    this.authorizedMatriculas = null;
    
    this.initialize();
  }
  
  loadEnvironmentVariables() {
    // Lista de possíveis locais do .env
    const possiblePaths = [
      path.join(process.cwd(), '.env'),           // Raiz do projeto
      path.join(__dirname, '..', '..', '.env'),   // Raiz (backend/../.env)
      path.join(__dirname, '..', '.env'),         // Pai direto (backend/.env)
      path.join(__dirname, '.env')                // Mesma pasta
    ];
    
    let envLoaded = false;
    
    for (const envPath of possiblePaths) {
      try {
        if (fs.existsSync(envPath)) {
          console.log(`\n📁 Encontrado .env em: ${envPath}`);
          
          const envContent = fs.readFileSync(envPath, 'utf8');
          const lines = envContent.split('\n');
          let count = 0;
          
          lines.forEach(line => {
            line = line.trim();
            if (line && !line.startsWith('#')) {
              const equalsIndex = line.indexOf('=');
              if (equalsIndex !== -1) {
                const key = line.substring(0, equalsIndex).trim();
                const value = line.substring(equalsIndex + 1).trim();
                
                // Remove aspas se houver
                const cleanValue = value.replace(/^['"]|['"]$/g, '');
                
                // Só define se não existir
                if (!process.env[key]) {
                  process.env[key] = cleanValue;
                  count++;
                }
              }
            }
          });
          
          envLoaded = true;
          console.log(`✅ ${count} variáveis carregadas de: ${envPath}`);
          break;
        }
      } catch (error) {
        console.log(`⚠️  Não pude ler ${envPath}:`, error.message);
      }
    }
    
    if (!envLoaded) {
      console.error('\n❌❌❌ ERRO CRÍTICO: NENHUM ARQUIVO .env ENCONTRADO!');
      console.log('📋 Locais verificados:', possiblePaths);
    }
  }
  
  initialize() {
    console.log('\n🎯 INICIALIZANDO LISTA DE MATRÍCULAS AUTORIZADAS...');
    
    // 🔥 VERIFICAÇÃO CRÍTICA: Sem as variáveis, o sistema NÃO funciona
    if (!this.encryptionKey || !this.encryptedData) {
      console.error('\n❌❌❌ ERRO CRÍTICO: Variáveis de ambiente não carregadas!');
      console.error('   ⚠️  O sistema NÃO pode funcionar sem as matrículas autorizadas.');
      console.error('   ⚠️  Nenhum professor poderá se cadastrar no sistema.');
      console.error('\n   📌 Verifique se o arquivo .env contém:');
      console.error('   - AUTH_ENCRYPTION_KEY ou ENCRYPTION_KEY');
      console.error('   - ENCRYPTED_MATRICULAS');
      console.error('   - AUTH_HASH_SALT (opcional, mas recomendado)');
      
      // Array vazio - nenhum professor conseguirá se cadastrar
      this.authorizedMatriculas = [];
      console.log('='.repeat(60));
      return;
    }
    
    try {
      // Tenta descriptografar
      console.log('\n🔓 Tentando descriptografar matrículas...');
      this.authorizedMatriculas = this.decryptMatriculas();
      
      if (this.authorizedMatriculas && this.authorizedMatriculas.length > 0) {
        console.log(`\n✅ SUCESSO! ${this.authorizedMatriculas.length} matrículas carregadas!`);
        console.log('📋 Amostra (primeiras 3):', this.authorizedMatriculas.slice(0, 3));
      } else {
        console.error('\n❌❌❌ ERRO CRÍTICO: Lista vazia após descriptografia!');
        console.error('   Verifique o formato de ENCRYPTED_MATRICULAS no .env');
        console.error('   Deve ser um array JSON de objetos {matricula, nome} criptografado');
        this.authorizedMatriculas = [];
      }
      
    } catch (error) {
      console.error('\n❌❌❌ ERRO CRÍTICO NA DESCRIPTOGRAFIA:', error.message);
      console.error('   ⚠️  O sistema NÃO pode funcionar sem as matrículas autorizadas.');
      console.error('   ⚠️  Nenhum professor poderá se cadastrar no sistema.');
      console.error('\n   📌 Verifique se:');
      console.error('   1. A ENCRYPTION_KEY está correta (32 bytes em hex)');
      console.error('   2. A ENCRYPTED_MATRICULAS está no formato iv:encrypted:authTag');
      console.error('   3. A chave corresponde aos dados criptografados');
      
      this.authorizedMatriculas = [];
    }
    
    console.log('='.repeat(60));
  }
  
  decryptMatriculas() {
    // Formato esperado: iv:encrypted:authTag
    const parts = this.encryptedData.split(':');
    
    if (parts.length !== 3) {
      throw new Error('Formato inválido de ENCRYPTED_MATRICULAS. Deve ser iv:encrypted:authTag');
    }
    
    const [ivHex, encryptedHex, authTagHex] = parts;
    
    // Converte para buffers
    const key = Buffer.from(this.encryptionKey, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    
    // Descriptografa
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    // Parse como JSON para obter array de objetos
    const parsed = JSON.parse(decrypted);
    
    // Se for array de objetos, extrair apenas as matrículas
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].matricula) {
      return parsed.map(item => item.matricula);
    }
    
    // Se for array de strings, retorna diretamente
    if (Array.isArray(parsed)) {
      return parsed;
    }
    
    throw new Error('Formato de dados inválido após descriptografia');
  }
  
  isProfessorAuthorized(matricula) {
    const matriculaStr = matricula.toString().trim();
    
    if (!this.authorizedMatriculas || this.authorizedMatriculas.length === 0) {
      console.error(`\n🚫 BLOQUEADO: Sistema sem matrículas autorizadas!`);
      console.error(`   Matrícula ${matriculaStr} NÃO pode ser cadastrada.`);
      return false;
    }
    
    const autorizado = this.authorizedMatriculas.includes(matriculaStr);
    
    if (autorizado) {
      console.log(`\n✅ ${matriculaStr} - AUTORIZADO`);
    } else {
      console.log(`\n❌ ${matriculaStr} - NÃO AUTORIZADO`);
    }
    
    return autorizado;
  }
  
  getStats() {
    return {
      totalMatriculas: this.authorizedMatriculas ? this.authorizedMatriculas.length : 0,
      systemStatus: this.authorizedMatriculas && this.authorizedMatriculas.length > 0 ? 'active' : 'error',
      hasEncryptionKey: !!this.encryptionKey,
      hasEncryptedData: !!this.encryptedData,
      hasHashSalt: !!this.hashSalt
    };
  }
}

// Instância única
const instance = new ProfessorAuthSystem();
module.exports = instance;