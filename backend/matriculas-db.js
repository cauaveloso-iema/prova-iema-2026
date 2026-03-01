// ============================================================================
// MATRÍCULAS AUTORIZADAS PARA PROFESSORES (VERSÃO ALTERNATIVA)
// ============================================================================
const crypto = require('crypto');

// Usar as variáveis do seu .env
const ENCRYPTION_KEY = process.env.AUTH_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
const MATRICULAS_DATA = process.env.ENCRYPTED_MATRICULAS;

/**
 * Descriptografa os dados das matrículas
 */
function decrypt(text) {
    try {
        const [iv, encrypted] = text.split(':');
        const decipher = crypto.createDecipheriv('aes-256-cbc', 
            Buffer.from(ENCRYPTION_KEY, 'hex'), 
            Buffer.from(iv, 'hex')
        );
        const decrypted = Buffer.concat([
            decipher.update(Buffer.from(encrypted, 'hex')),
            decipher.final()
        ]);
        return JSON.parse(decrypted.toString());
    } catch (error) {
        console.error('❌ Erro ao descriptografar matrículas:', error.message);
        return [];
    }
}

// Carregar matrículas (com fallback)
let matriculas = [];

if (ENCRYPTION_KEY && MATRICULAS_DATA) {
    try {
        matriculas = decrypt(MATRICULAS_DATA);
        console.log(`✅ ${matriculas.length} matrículas autorizadas carregadas`);
        if (matriculas.length > 0) {
            console.log('📋 Amostra:', matriculas.slice(0, 3).map(m => m.matricula));
        }
    } catch (error) {
        console.error('❌ Erro ao processar matrículas:', error);
        matriculas = [];
    }
} else {
    console.warn('⚠️ Variáveis de matrículas não configuradas, usando lista vazia');
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