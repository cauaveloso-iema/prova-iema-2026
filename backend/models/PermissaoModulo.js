// backend/models/PermissaoModulo.js
const mongoose = require('mongoose');

const PermissaoModuloSchema = new mongoose.Schema({
    // Identificador do módulo (ex: 'segunda_chamada_setor_pedagogico')
    modulo: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    
    // Nome amigável para exibição
    nomeAmigavel: {
        type: String,
        required: true
    },
    
    // Descrição do que essa permissão faz
    descricao: {
        type: String,
        default: ''
    },
    
    // Lista de emails autorizados
    emailsAutorizados: [{
        type: String,
        lowercase: true,
        trim: true
    }],
    
    // Quem pode gerenciar essa permissão
    rolesPermitidos: [{
        type: String,
        enum: ['admin', 'super_admin'],
        default: ['admin', 'super_admin']
    }],
    
    // Status da permissão
    ativo: {
        type: Boolean,
        default: true
    },
    
    // Auditoria
    ultimaModificacaoPor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    ultimaModificacaoNome: String,
    
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Middleware para atualizar updatedAt
PermissaoModuloSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// ============================================
// MÉTODOS ESTÁTICOS
// ============================================

/**
 * Busca permissão por módulo, criando se não existir
 */
PermissaoModuloSchema.statics.buscarOuCriar = async function(modulo, nomeAmigavel, descricao = '') {
    let permissao = await this.findOne({ modulo });
    
    if (!permissao) {
        permissao = await this.create({
            modulo,
            nomeAmigavel,
            descricao,
            emailsAutorizados: []
        });
        console.log(`✅ Permissão criada: ${modulo}`);
    }
    
    return permissao;
};

/**
 */
/**
 * ✅ VERIFICA SE UM EMAIL TEM PERMISSÃO (VERSÃO CORRIGIDA)
 * - Aceita email com case diferente
 * - Faz trim automático
 * - Trata valores nulos
 */
PermissaoModuloSchema.statics.emailTemPermissao = async function(modulo, email) {
    if (!email || typeof email !== 'string') {
        return false;
    }
    
    const emailLimpo = email.trim().toLowerCase();
    
    if (!emailLimpo) {
        return false;
    }
    
    const permissao = await this.findOne({ modulo, ativo: true });
    if (!permissao) {
        return false;
    }
    
    // 🔥 Normalizar todos os emails antes de comparar
    const emailsNormalizados = (permissao.emailsAutorizados || []).map(e => 
        (e || '').trim().toLowerCase()
    );
    
    return emailsNormalizados.includes(emailLimpo);
};

/**
 * Adiciona um email à lista
 */
PermissaoModuloSchema.statics.adicionarEmail = async function(modulo, email, userInfo) {
    const permissao = await this.findOne({ modulo });
    if (!permissao) throw new Error('Permissão não encontrada');
    
    const emailLimpo = email.toLowerCase().trim();
    
    if (permissao.emailsAutorizados.includes(emailLimpo)) {
        throw new Error('Este email já está autorizado');
    }
    
    permissao.emailsAutorizados.push(emailLimpo);
    permissao.ultimaModificacaoPor = userInfo.userId;
    permissao.ultimaModificacaoNome = userInfo.nome;
    
    await permissao.save();
    return permissao;
};

/**
 * Remove um email da lista
 */
PermissaoModuloSchema.statics.removerEmail = async function(modulo, email, userInfo) {
    const permissao = await this.findOne({ modulo });
    if (!permissao) throw new Error('Permissão não encontrada');
    
    const emailLimpo = email.toLowerCase().trim();
    
    if (!permissao.emailsAutorizados.includes(emailLimpo)) {
        throw new Error('Este email não está autorizado');
    }
    
    permissao.emailsAutorizados = permissao.emailsAutorizados.filter(
        e => e !== emailLimpo
    );
    permissao.ultimaModificacaoPor = userInfo.userId;
    permissao.ultimaModificacaoNome = userInfo.nome;
    
    await permissao.save();
    return permissao;
};

module.exports = mongoose.model('PermissaoModulo', PermissaoModuloSchema);