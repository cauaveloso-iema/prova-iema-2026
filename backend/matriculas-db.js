// ============================================================================
// MATRÍCULAS AUTORIZADAS PARA PROFESSORES (VERSÃO CORRIGIDA)
// ============================================================================
const crypto = require('crypto');

// Usar as variáveis do seu .env
const ENCRYPTION_KEY = process.env.AUTH_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
const MATRICULAS_DATA = process.env.ENCRYPTED_MATRICULAS;

// 🔥 LISTA DE MATRÍCULAS AUTORIZADAS (FALLBACK)
const MATRICULAS_FALLBACK = [
    { matricula: '110102', nome: 'PROFESSOR AUTORIZADO' },
    { matricula: '110103', nome: 'PROFESSOR EXEMPLO' },
    { matricula: '110006', nome: 'PROFESSOR TESTE' },
    { matricula: '110104', nome: 'MARIA DA SILVA' },
    { matricula: '110105', nome: 'JOAO PEREIRA' },
    { matricula: '110106', nome: 'ANA SANTOS' }
];

/**
 * Descriptografa os dados das matrículas com tratamento de erro
 */
function decrypt(text) {
    if (!text || !text.includes(':')) {
        console.error('❌ Formato de dados inválido');
        return [];
    }
    
    try {
        const [iv, encrypted] = text.split(':');
        
        // Validar se iv e encrypted existem
        if (!iv || !encrypted) {
            console.error('❌ IV ou dados encriptados ausentes');
            return [];
        }
        
        const decipher = crypto.createDecipheriv('aes-256-cbc', 
            Buffer.from(ENCRYPTION_KEY, 'hex'), 
            Buffer.from(iv, 'hex')
        );
        
        const decrypted = Buffer.concat([
            decipher.update(Buffer.from(encrypted, 'hex')),
            decipher.final()
        ]);
        
        const resultado = JSON.parse(decrypted.toString());
        console.log(`✅ ${resultado.length} matrículas descriptografadas com sucesso`);
        return resultado;
        
    } catch (error) {
        console.error('❌ Erro ao descriptografar matrículas:', error.message);
        console.log('📋 Usando lista FALLBACK de matrículas');
        return MATRICULAS_FALLBACK;
    }
}

// Carregar matrículas (com fallback)
let matriculas = [];

if (ENCRYPTION_KEY && MATRICULAS_DATA) {
    matriculas = decrypt(MATRICULAS_DATA);
} else {
    console.warn('⚠️ Variáveis de matrículas não configuradas, usando lista fallback');
    matriculas = MATRICULAS_FALLBACK;
}

// Garantir que matriculas é um array
if (!Array.isArray(matriculas) || matriculas.length === 0) {
    console.warn('⚠️ Nenhuma matrícula carregada, usando fallback');
    matriculas = MATRICULAS_FALLBACK;
}

console.log(`✅ Total de matrículas disponíveis: ${matriculas.length}`);
if (matriculas.length > 0) {
    console.log('📋 Amostra:', matriculas.slice(0, 3).map(m => m.matricula));
}

/**
 * Lista todas as matrículas autorizadas
 */
function listar() {
    return matriculas;
}

/**
 * Verifica se uma matrícula está autorizada
 */
function verificarMatricula(matricula) {
    if (!matricula) return false;
    const matriculaStr = matricula.toString().padStart(6, '0').replace(/\D/g, '');
    return matriculas.some(m => m.matricula === matriculaStr);
}

/**
 * Obtém o nome do professor pela matrícula
 */
function obterNome(matricula) {
    if (!matricula) return null;
    const matriculaStr = matricula.toString().padStart(6, '0').replace(/\D/g, '');
    const professor = matriculas.find(m => m.matricula === matriculaStr);
    return professor ? professor.nome : null;
}

/**
 * Busca matrículas por termo (nome ou matrícula)
 */
function buscar(termo) {
    if (!termo) return matriculas;
    const termoLower = termo.toLowerCase();
    return matriculas.filter(m => 
        m.matricula.includes(termo) || 
        (m.nome && m.nome.toLowerCase().includes(termoLower))
    );
}

module.exports = {
    listar,
    verificarMatricula,
    obterNome,
    buscar
};