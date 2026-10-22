// backend/models/SessaoAssinatura.js
const mongoose = require('mongoose');

const SessaoAssinaturaSchema = new mongoose.Schema({
    sessaoId: { 
        type: String, 
        required: true, 
        unique: true, 
        index: true 
    },
    tipo: { 
        type: String, 
        enum: [
            'autorizacao', 
            'justificativa', 
            'segunda_chamada', 
            'uniforme',
            'atraso',
            'atraso_aluno',
            'atendimento',
            'atendimento_aluno',
            'psicologia',
            'assistente_social',
            'supervisao',
            'supervisao_participante',
            'biblioteca'
        ],
        required: true 
    },
    status: {
        type: String,
        enum: ['aguardando', 'assinado', 'cancelado'],
        default: 'aguardando',
        index: true
    },
    
    // 🆕 MUDANÇA CRUCIAL: O Mixed aceita TUDO
    dadosAtendimento: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    
    assinaturaBase64: { type: String, default: '' },
    assinadaEm: { type: Date, default: null },
    assinadaPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    assinadaPorNome: { type: String, default: null },
    
    criadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    criadoPorNome: String,
    criadoEm: { type: Date, default: Date.now },
    expiraEm: { type: Date, required: true }
});

SessaoAssinaturaSchema.index({ expiraEm: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('SessaoAssinatura', SessaoAssinaturaSchema);