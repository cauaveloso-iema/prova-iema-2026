// ============================================================================
// backend/eventos/models/Avaliacao.js
// ============================================================================

const mongoose = require('mongoose');

const AvaliacaoSchema = new mongoose.Schema({
    eventoId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Evento',
        required: true,
        index: true
    },
    inscricaoId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Inscricao',
        required: true,
        index: true
    },
    avaliadorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Avaliador',
        required: true,
        index: true
    },

    notas: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },

    parecer: {
        type: String,
        default: ''
    },

    notaFinal: {
        type: Number,
        min: 0,
        max: 100,
        default: null
    },

    notaFinalCalculada: {
        type: Number,
        default: null
    },

    ehConsolidacao: {
        type: Boolean,
        default: false,
        index: true
    },

    modoDistribuicaoAplicado: {
        type: String,
        enum: ['aleatorio', 'manual', null],
        default: null
    },

    atribuicao: {
        type: String,
        enum: ['aleatorio', 'manual', null],
        default: null
    },

    assinaturaAvaliadorBase64: {
        type: String,
        default: null
    },

    status: {
        type: String,
        enum: ['Pendente', 'Em Andamento', 'Concluída'],
        default: 'Concluída'
    },

    dataInicio: { type: Date, default: null },
    dataConclusao: { type: Date, default: null }
}, {
    timestamps: true,
    minimize: false
});

// Índice parcial: garante que um avaliador só avalie a mesma inscrição UMA VEZ
// quando NÃO for um registro de consolidação.
AvaliacaoSchema.index(
    { eventoId: 1, inscricaoId: 1, avaliadorId: 1 },
    { 
        unique: true, 
        partialFilterExpression: { ehConsolidacao: false } 
    }
);

// Índice para consultas de consolidação
AvaliacaoSchema.index({ inscricaoId: 1, ehConsolidacao: 1 });

module.exports = mongoose.models.Avaliacao || mongoose.model('Avaliacao', AvaliacaoSchema);