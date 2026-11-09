const mongoose = require('mongoose');

const SessaoAssinaturaEventoSchema = new mongoose.Schema({
    sessaoId: { type: String, required: true, unique: true, index: true },
    tipo: { 
        type: String, 
        required: true,
        enum: ['supervisao', 'supervisao_participante', 'evento_termo'] 
    },
    dadosAtendimento: { type: Object, default: {} },
    status: { 
        type: String, 
        enum: ['aguardando', 'assinado', 'cancelado'], 
        default: 'aguardando' 
    },
    assinaturaBase64: { type: String, default: null },
    assinadaPorNome: { type: String, default: null },
    assinadaEm: { type: Date, default: null },
    expiraEm: { type: Date, default: () => new Date(Date.now() + 30 * 60 * 1000) }
}, { timestamps: true });

module.exports = mongoose.models.SessaoAssinaturaEvento
    || mongoose.model('SessaoAssinaturaEvento', SessaoAssinaturaEventoSchema, 'sessoes_assinatura');