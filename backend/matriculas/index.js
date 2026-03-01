// backend/matriculas/index.js
const fs = require('fs');
const path = require('path');
const { decryptData, encryptData } = require('./crypto-utils');

console.log('='.repeat(60));
console.log('🔐 INICIALIZANDO GERENCIADOR DE MATRÍCULAS');
console.log('='.repeat(60));

const DATA_FILE = path.join(__dirname, 'data', 'matriculas-data.json');

// Garantir que a pasta data existe
if (!fs.existsSync(path.join(__dirname, 'data'))) {
    fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
}

function carregarDados() {
    // PRIORIDADE 1: Arquivo local
    try {
        if (fs.existsSync(DATA_FILE)) {
            console.log('📁 Carregando matrículas do arquivo local...');
            const data = fs.readFileSync(DATA_FILE, 'utf8');
            const matriculas = JSON.parse(data);
            console.log(`✅ ${matriculas.length} matrículas carregadas do arquivo`);
            return matriculas;
        }
    } catch (error) {
        console.error('⚠️ Erro ao carregar arquivo:', error.message);
    }
    
    // PRIORIDADE 2: .env criptografado
    try {
        if (process.env.ENCRYPTED_MATRICULAS) {
            console.log('🔐 Carregando matrículas criptografadas do .env...');
            const decrypted = decryptData(process.env.ENCRYPTED_MATRICULAS);
            if (decrypted && Array.isArray(decrypted)) {
                console.log(`✅ ${decrypted.length} matrículas carregadas do .env`);
                // Salvar no arquivo para cache
                salvarDados(decrypted);
                return decrypted;
            } else {
                console.error('❌ Falha na descriptografia - dados inválidos');
            }
        }
    } catch (error) {
        console.error('❌ Erro ao descriptografar:', error.message);
    }
    
    // Se chegou aqui, não há dados disponíveis
    console.error('❌❌❌ ERRO CRÍTICO: Nenhuma matrícula encontrada!');
    return [];
}

function salvarDados(matriculas) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(matriculas, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('❌ Erro ao salvar:', error.message);
        return false;
    }
}

class MatriculasManager {
    constructor() {
        this.matriculas = carregarDados();
        console.log(`📊 Total de matrículas carregadas: ${this.matriculas.length}`);
        if (this.matriculas.length === 0) {
            console.error('⚠️ ATENÇÃO: Nenhuma matrícula carregada!');
            console.error('   Nenhum professor poderá se cadastrar no sistema.');
        }
        console.log('='.repeat(60));
    }
    
    listar() {
        return this.matriculas;
    }
    
    verificar(matricula) {
        if (!this.matriculas || this.matriculas.length === 0) {
            return false;
        }
        return this.matriculas.some(item => item.matricula === matricula);
    }
    
    obterNome(matricula) {
        if (!this.matriculas || this.matriculas.length === 0) return null;
        const item = this.matriculas.find(m => m.matricula === matricula);
        return item ? item.nome : null;
    }
    
    adicionar(matricula, nome) {
        if (!this.matriculas) this.matriculas = [];
        
        if (this.verificar(matricula)) {
            return { success: false, error: 'Matrícula já existe' };
        }
        
        this.matriculas.push({ matricula, nome: nome || 'Novo Professor' });
        salvarDados(this.matriculas);
        return { success: true, matricula, nome };
    }
    
    editar(matriculaAntiga, novaMatricula, novoNome) {
        const index = this.matriculas.findIndex(m => m.matricula === matriculaAntiga);
        if (index === -1) {
            return { success: false, error: 'Matrícula não encontrada' };
        }
        
        if (matriculaAntiga !== novaMatricula && this.verificar(novaMatricula)) {
            return { success: false, error: 'Nova matrícula já existe' };
        }
        
        this.matriculas[index] = {
            matricula: novaMatricula,
            nome: novoNome || this.matriculas[index].nome
        };
        
        salvarDados(this.matriculas);
        return { success: true, matricula: novaMatricula };
    }
    
    excluir(matricula) {
        const index = this.matriculas.findIndex(m => m.matricula === matricula);
        if (index === -1) {
            return { success: false, error: 'Matrícula não encontrada' };
        }
        
        this.matriculas.splice(index, 1);
        salvarDados(this.matriculas);
        return { success: true };
    }
    
    buscar(termo) {
        if (!termo) return this.matriculas;
        const termoLower = termo.toLowerCase();
        return this.matriculas.filter(m => 
            m.matricula.includes(termo) || 
            (m.nome && m.nome.toLowerCase().includes(termoLower))
        );
    }
}

module.exports = new MatriculasManager();