// ============================================================================
// backend/eventos/models/Evento.js
// ============================================================================

const mongoose = require('mongoose');

const EventoSchema = new mongoose.Schema({
    titulo: { type: String, required: true, trim: true },
    modeloId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ModeloEvento',
        required: true,
        index: true
    },
    slug: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        index: true
    },

    // ========== CONFIGURAÇÃO DO EVENTO ==========
    descricaoPublica: { type: String, default: '' },
    local: { type: String, default: '' },
    publicoAlvo: { type: String, default: '' },
    imagemBanner: { type: String, default: null },

    // ========== DATAS ==========
    dataInicioInscricao: { type: Date, required: true },
    dataFimInscricao: { type: Date, required: true },
    dataInicioEvento: { type: Date, default: null },
    dataFimEvento: { type: Date, default: null },

    // ========== VAGAS ==========
    vagas: { type: Number, default: null },
    totalParticipantes: { type: Number, default: 0 },

    // ========== STATUS ==========
    status: {
        type: String,
        enum: ['Rascunho', 'Publicado', 'Encerrado', 'Cancelado'],
        default: 'Rascunho'
    },

    // ========== DADOS PRÉ-PREENCHIDOS ==========
    dadosPreenchidos: { type: Map, of: String, default: {} },

    // Criadores
    criadoPor: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'criadoPorModel' },
    criadoPorModel: { type: String, required: true, enum: ['User', 'Avaliador'], default: 'User' },

    // Coordenadores (Avaliadores)
    coordenadores: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Avaliador' }],

    // 🔥 NOVO: Snapshot do flag do modelo no momento da criação/edição do evento.
    //    Motivo: se o modelo for editado depois, o comportamento do evento
    //    existente NÃO muda — evita inscrições quebrarem retroativamente.
    permiteMultiplasInscricoes: { type: Boolean, default: false }
}, { timestamps: true, strictPopulate: false });

EventoSchema.index({ status: 1 });
EventoSchema.index({ criadoPor: 1 });
EventoSchema.index({ createdAt: -1 });

// Virtual: inscrição está aberta agora?
EventoSchema.virtual('inscricaoAberta').get(function () {
    const agora = new Date();
    if (this.status !== 'Publicado') return false;
    if (!this.dataInicioInscricao || !this.dataFimInscricao) return false;
    if (agora < this.dataInicioInscricao) return false;
    if (agora > this.dataFimInscricao) return false;
    if (this.vagas !== null && this.totalParticipantes >= this.vagas) return false;
    return true;
});

EventoSchema.set('toJSON', { virtuals: true });
EventoSchema.set('toObject', { virtuals: true });

let EventoModel;
if (mongoose.models.Evento) {
    const paths = Object.keys(mongoose.models.Evento.schema.paths || {});
    if (!paths.includes('modeloId') || !paths.includes('slug') || !paths.includes('criadoPorModel') || !paths.includes('permiteMultiplasInscricoes')) {
        console.warn('⚠️ [EVENTOS] Model Evento em cache desatualizado. Recriando...');
        delete mongoose.models.Evento;
    }
}
EventoModel = mongoose.models.Evento || mongoose.model('Evento', EventoSchema);

module.exports = EventoModel;