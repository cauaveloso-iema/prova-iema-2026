// ============================================================================
// backend/eventos/models/EventoConfigAvaliacao.js
// Configuração de avaliação POR EVENTO (independente do modelo)
// ============================================================================
const mongoose = require('mongoose');

const EventoConfigAvaliacaoSchema = new mongoose.Schema({
    eventoId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Evento',
        required: true,
        unique: true,
        index: true
    },

    numAvaliadores: { type: Number, default: 1, min: 1, max: 20 },

    modoDistribuicao: {
        type: String,
        enum: ['aleatorio', 'manual'],
        default: 'aleatorio'
    },

    calcularMedia: { type: Boolean, default: true },

    tipoMedia: {
        type: String,
        enum: ['aritmetica', 'ponderada'],
        default: 'aritmetica'
    },

    exigeAssinaturaAvaliador: { type: Boolean, default: false },

    // Sorteio automático executado? (evita re-sortear sem querer)
    sorteioExecutadoEm: { type: Date, default: null },
    sorteioExecutadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Avaliador', default: null },

    ativo: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.models.EventoConfigAvaliacao
    || mongoose.model('EventoConfigAvaliacao', EventoConfigAvaliacaoSchema);