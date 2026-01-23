// backend/security/professor-auth.js
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

class ProfessorAuthSystem {
  constructor() {
    console.log('🔐 Inicializando sistema de autorização...');
    
    // Tenta carregar variáveis de várias formas
    this.loadEnvironmentVariables();
    
    this.encryptionKey = process.env.AUTH_ENCRYPTION_KEY;
    this.hashSalt = process.env.AUTH_HASH_SALT;
    this.encryptedData = process.env.ENCRYPTED_MATRICULAS;
    
    console.log('📊 Variáveis carregadas:', {
      key: this.encryptionKey ? `✅ (${this.encryptionKey.length} chars)` : '❌',
      salt: this.hashSalt ? `✅ (${this.hashSalt.length} chars)` : '❌',
      data: this.encryptedData ? `✅ (${this.encryptedData.length} chars)` : '❌'
    });
    
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
          console.log(`📁 Encontrado .env em: ${envPath}`);
          
          const envContent = fs.readFileSync(envPath, 'utf8');
          const lines = envContent.split('\n');
          
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
                }
              }
            }
          });
          
          envLoaded = true;
          console.log(`✅ .env carregado de: ${envPath}`);
          break;
        }
      } catch (error) {
        console.log(`⚠️  Não pude ler ${envPath}:`, error.message);
      }
    }
    
    if (!envLoaded) {
      console.error('❌ NÃO CONSEGUI CARREGAR NENHUM ARQUIVO .env!');
      console.log('📋 Locais verificados:', possiblePaths);
    }
  }
  
  initialize() {
    console.log('🎯 Inicializando lista de matrículas...');
    
    // SEÇÃO CRÍTICA: Se não carregou variáveis, usa fallback
    if (!this.encryptionKey || !this.encryptedData) {
      console.warn('⚠️  Variáveis não carregadas - usando FALLBACK');
      this.authorizedMatriculas = this.getFallbackMatriculas();
      console.log(`✅ ${this.authorizedMatriculas.length} matrículas (fallback)`);
      return;
    }
    
    try {
      // Tenta descriptografar
      console.log('🔓 Tentando descriptografar...');
      this.authorizedMatriculas = this.decryptMatriculas();
      
      if (this.authorizedMatriculas.length > 0) {
        console.log(`✅ ${this.authorizedMatriculas.length} matrículas carregadas`);
        console.log('📋 Amostra:', this.authorizedMatriculas.slice(0, 3));
      } else {
        console.error('❌ Descriptografou, mas lista vazia! Usando fallback...');
        this.authorizedMatriculas = this.getFallbackMatriculas();
      }
      
    } catch (error) {
      console.error('❌ Erro na descriptografia:', error.message);
      console.log('🔄 Usando fallback devido ao erro...');
      this.authorizedMatriculas = this.getFallbackMatriculas();
    }
  }
  
  decryptMatriculas() {
    // Formato: iv:encrypted:authTag
    const parts = this.encryptedData.split(':');
    
    if (parts.length !== 3) {
      console.log('📝 Formato simples (CSV) detectado');
      return this.encryptedData.split(',').map(m => m.trim());
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
    
    return decrypted.split(',').map(m => m.trim());
  }
  
  
  isProfessorAuthorized(matricula) {
    const matriculaStr = matricula.toString().trim();
    
    if (!this.authorizedMatriculas || this.authorizedMatriculas.length === 0) {
      console.error('🚨 CRÍTICO: Sistema sem matrículas autorizadas!');
      return false;
    }
    
    const autorizado = this.authorizedMatriculas.includes(matriculaStr);
    
    console.log(`🔐 ${matriculaStr} ${autorizado ? '✅' : '❌'} (${this.authorizedMatriculas.length} matrículas na lista)`);
    
    return autorizado;
  }
  
  getStats() {
    return {
      totalMatriculas: this.authorizedMatriculas ? this.authorizedMatriculas.length : 0,
      systemStatus: this.authorizedMatriculas && this.authorizedMatriculas.length > 0 ? 'active' : 'error',
      sampleMatriculas: this.authorizedMatriculas ? this.authorizedMatriculas.slice(0, 3) : []
    };
  }
}

module.exports = new ProfessorAuthSystem();