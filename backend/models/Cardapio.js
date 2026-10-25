const mongoose = require('mongoose');

const cardapioSchema = new mongoose.Schema({
    dataReferencia: {
        type: Date,
        required: true,
        unique: true
    },
    semanaLabel: {
        type: String,
        required: true,
        trim: true
    },
    lancamentoManha: {
        type: String,
        required: true,
        trim: true
    },
    almoco: {
        type: String,
        required: true,
        trim: true
    },
    lancamentoTarde: {
        type: String,
        required: true,
        trim: true
    },
    informacoesNutricionais: {
        energia:     { type: String, default: '' },
        ptn:         { type: String, default: '' },
        lpd:         { type: String, default: '' },
        saturados:   { type: String, default: '' },
        cho:         { type: String, default: '' },
        fibra:       { type: String, default: '' },
        ca:          { type: String, default: '' },
        mg:          { type: String, default: '' },
        fe:          { type: String, default: '' },
        zn:          { type: String, default: '' },
        vitA:        { type: String, default: '' },
        vitC:        { type: String, default: '' },
        na:          { type: String, default: '' },
        gorduraTotal:{ type: String, default: '' }
    },
    cor: {
        type: String,
        default: '#0f766e'
    },
    notificacaoAtivada: {
        type: Boolean,
        default: false
    },
    notificacoes: [{
        minutosAntes: Number,
        tipo: { type: String, default: 'sistema' },
        enviada: { type: Boolean, default: false },
        enviadaEm: Date
    }],
    criadoPor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    atualizadoPor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    monitoramento: {
        logs: [{
            acao: String,
            usuarioId: mongoose.Schema.Types.ObjectId,
            timestamp: { type: Date, default: Date.now },
            detalhes: mongoose.Schema.Types.Mixed
        }]
    }
}, { timestamps: true });

cardapioSchema.index({ dataReferencia: 1 });

module.exports = mongoose.model('Cardapio', cardapioSchema);