const mongoose = require('mongoose');

const NotificacaoSchema = new mongoose.Schema({
    // Quem recebe a notificação
    usuarioId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    
    // Tipo de notificação
    tipo: {
        type: String,
        enum: ['resultado_liberado', 'resultado_editado', 'prova_corrigida', 'sistema', 'cancelamento'],
        required: true
    },
    
    // Título da notificação
    titulo: {
        type: String,
        required: true
    },
    
    // Mensagem da notificação
    mensagem: {
        type: String,
        required: true
    },
    
    // Dados adicionais
    dados: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    
    // Links relacionados
    link: {
        type: String,
        default: null
    },
    
    // Ícone/emoji para exibir
    icone: {
        type: String,
        default: '📋'
    },
    
    // Cor de destaque
    cor: {
        type: String,
        default: '#0d6efd'
    },
    
    // Status da notificação
    lida: {
        type: Boolean,
        default: false
    },
    
    // Data de leitura
    lidaEm: {
        type: Date,
        default: null
    },
    
    // Prioridade (1 = baixa, 5 = alta)
    prioridade: {
        type: Number,
        min: 1,
        max: 5,
        default: 3
    }
}, {
    timestamps: true
});

// Índices para consultas rápidas
NotificacaoSchema.index({ usuarioId: 1, createdAt: -1 });
NotificacaoSchema.index({ usuarioId: 1, lida: 1 });

const Notificacao = mongoose.model('Notificacao', NotificacaoSchema);
module.exports = Notificacao;