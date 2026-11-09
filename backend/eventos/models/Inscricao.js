// ============================================================================
// backend/eventos/models/Inscricao.js
// ============================================================================

const mongoose = require('mongoose');

const InscricaoSchema = new mongoose.Schema({
    participanteId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ParticipanteEvento',
        required: true,
        index: true
    },
    eventoId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Evento',
        required: true,
        index: true
    },

    // 🔥 Mixed para aceitar chaves dinâmicas com '.' '[' ']' sem cast errors
    dadosPreenchidos: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },

    protocolo: {
        type: String,
        required: true,
        unique: true,
        index: true
    },

    status: {
        type: String,
        enum: ['Pendente', 'Confirmada', 'Cancelada', 'Presente', 'Ausente'],
        default: 'Pendente',
        index: true
    },

    observacoesAdmin: {
        type: String,
        default: ''
    },

    assinaturaBase64: {
        type: String,
        default: null
    },

    assinaturasPorAnexo: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },

    anexosParticipante: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },

    ipInscricao: {
        type: String,
        default: null
    },
    userAgent: {
        type: String,
        default: null
    }
}, {
    timestamps: true,
    minimize: false
});

// 🔥 CORREÇÃO: índice NÃO-único composto.
// A unicidade (quando `permiteMultiplasInscricoes === false`) é garantida
// pela aplicação em `publico.js`. Este índice apenas acelera a busca.
InscricaoSchema.index({ participanteId: 1, eventoId: 1 });

// ⚠️ IMPORTANTE: se você JÁ tinha o índice único criado no banco,
// ele CONTINUA lá mesmo após remover a linha do schema. Para removê-lo,
// rode uma única vez no Mongo shell / Compass:
//
//   db.inscricaos.dropIndex('participanteId_1_eventoId_1')
//
// Depois disso, o índice não-único será recriado automaticamente.

module.exports = mongoose.model('Inscricao', InscricaoSchema);