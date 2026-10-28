// backend/models/ProtocoloProva.js
const mongoose = require('mongoose');

/**
 * MODELO: Protocolo de Provas
 * 
 * Registra o RECEBIMENTO de provas dos professores responsáveis.
 * Um protocolo pode conter MÚLTIPLAS turmas, e cada turma tem uma
 * quantidade específica de alunos que entregaram a prova.
 */
const ProtocoloProvaSchema = new mongoose.Schema({
    // ============================================
    // IDENTIFICAÇÃO ÚNICA
    // ============================================
    codigo: {
        type: String,
        unique: true,
        index: true,
        required: true
    },

    // ============================================
    // PROFESSOR QUE ENTREGOU AS PROVAS
    // ============================================
    professorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    professorNome: {
        type: String,
        required: true
    },
    professorEmail: String,
    professorMatricula: String,
    professorCpf: String,
    professorTelefone: String,
    professorEixo: String,
    professorFotoPerfil: String,

    // ============================================
    // DADOS DO RECEBIMENTO
    // ============================================
    dataRecebimento: {
        type: Date,
        required: true,
        default: Date.now,
        index: true
    },

    // Tipo de prova: AV1, AV2, AV3, AV4, 2CHAMADA, RECUPERACAO, FINAL, OUTROS
    tipoProva: {
        type: String,
        enum: ['AV1', 'AV2', 'AV3', 'AV4', '2CHAMADA', 'RECUPERACAO', 'FINAL', 'OUTROS'],
        required: true,
        index: true
    },
    tipoProvaOutros: {
        type: String,
        default: null
    },

    // Período: 1, 2, 3 ou 4
    periodo: {
        type: Number,
        enum: [1, 2, 3, 4],
        required: true,
        index: true
    },

    // ============================================
    // TURMAS E ALUNOS (pode ter várias turmas)
    // ============================================
    // Array com turmas. Cada item tem:
    //   - turma: nome (ex: "103")
    //   - quantidadeProvas: quantas provas dessa turma
    //   - alunos: array de alunos que entregaram (id, nome, matricula)
    turmas: [{
        turma: {
            type: String,
            required: true
        },
        turmaId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Turma'
        },
        quantidadeProvas: {
            type: Number,
            required: true,
            min: 0
        },
        alunos: [{
            alunoId: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
                required: true
            },
            nome: {
                type: String,
                required: true
            },
            matricula: String,
            curso: String
        }]
    }],

    // Total geral (soma de todas as turmas)
    totalProvas: {
        type: Number,
        default: 0,
        min: 0
    },

    // ============================================
    // OBSERVAÇÕES
    // ============================================
    observacoes: {
        type: String,
        default: ''
    },

    // ============================================
    // ASSINATURA DIGITAL DO PROFESSOR
    // ============================================
    assinaturaBase64: {
        type: String,
        default: null
    },
    temAssinatura: {
        type: Boolean,
        default: false,
        index: true
    },
    assinadaEm: {
        type: Date,
        default: null
    },
    assinadaPorNome: {
        type: String,
        default: null
    },

    // Sessão de assinatura (para QR Code)
    sessaoAssinaturaId: {
        type: String,
        default: null
    },

    // ============================================
    // AUDITORIA
    // ============================================
    registradoPor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    registradoPorNome: {
        type: String,
        required: true
    },

    atualizadoEm: {
        type: Date,
        default: null
    },
    atualizadoPor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    atualizadoPorNome: {
        type: String,
        default: null
    },

    // ============================================
    // CONTROLE
    // ============================================
    ativo: {
        type: Boolean,
        default: true,
        index: true
    },

    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// ============================================
// ÍNDICES
// ============================================
ProtocoloProvaSchema.index({ professorId: 1, dataRecebimento: -1 });
ProtocoloProvaSchema.index({ tipoProva: 1, periodo: 1 });
ProtocoloProvaSchema.index({ dataRecebimento: -1, createdAt: -1 });
ProtocoloProvaSchema.index({ 'turmas.turma': 1 });
ProtocoloProvaSchema.index({ codigo: 1 }, { unique: true });

// ============================================
// MIDDLEWARE - Gerar código e calcular total
// 🔥 CORRIGIDO: Usando pre('validate') para rodar ANTES da validação obrigatória
// ============================================
ProtocoloProvaSchema.pre('validate', function(next) {
    // Calcular total de provas
    if (this.turmas && this.turmas.length > 0) {
        this.totalProvas = this.turmas.reduce((acc, t) => acc + (t.quantidadeProvas || 0), 0);
    }
    
    // Gerar código único se não existir
    if (!this.codigo) {
        const ano = new Date().getFullYear();
        const mes = String(new Date().getMonth() + 1).padStart(2, '0');
        const random = Math.random().toString(36).substring(2, 8).toUpperCase();
        this.codigo = `PROT-${ano}${mes}-${random}`;
    }
    
    // Atualizar flag de assinatura
    this.temAssinatura = !!(this.assinaturaBase64 && this.assinaturaBase64.length > 100);
    
    this.updatedAt = new Date();
    next();
});

// ============================================
// MÉTODOS DE INSTÂNCIA
// ============================================
ProtocoloProvaSchema.methods.getTipoProvaFormatado = function() {
    if (this.tipoProva === 'OUTROS' && this.tipoProvaOutros) {
        return `OUTROS (${this.tipoProvaOutros})`;
    }
    return this.tipoProva;
};

ProtocoloProvaSchema.methods.getDataRecebimentoFormatada = function() {
    if (!this.dataRecebimento) return '-';
    return new Date(this.dataRecebimento).toLocaleDateString('pt-BR');
};

ProtocoloProvaSchema.methods.getTurmasResumo = function() {
    if (!this.turmas || this.turmas.length === 0) return '-';
    return this.turmas.map(t => `${t.turma} (${t.quantidadeProvas})`).join(', ');
};

// ============================================
// MÉTODOS ESTÁTICOS
// ============================================
ProtocoloProvaSchema.statics.getTiposProva = function() {
    return [
        { valor: 'AV1', label: 'AV1' },
        { valor: 'AV2', label: 'AV2' },
        { valor: 'AV3', label: 'AV3' },
        { valor: 'AV4', label: 'AV4' },
        { valor: '2CHAMADA', label: '2ª Chamada' },
        { valor: 'RECUPERACAO', label: 'Recuperação' },
        { valor: 'FINAL', label: 'Prova Final' },
        { valor: 'OUTROS', label: 'Outros' }
    ];
};

ProtocoloProvaSchema.statics.getPeriodos = function() {
    return [
        { valor: 1, label: '1º Período' },
        { valor: 2, label: '2º Período' },
        { valor: 3, label: '3º Período' },
        { valor: 4, label: '4º Período' }
    ];
};

module.exports = mongoose.model('ProtocoloProva', ProtocoloProvaSchema);