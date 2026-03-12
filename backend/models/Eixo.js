const mongoose = require('mongoose');

const EixoSchema = new mongoose.Schema({
    nome: { 
        type: String, 
        required: true, 
        unique: true
        // ENUM REMOVIDO - Agora o Super Admin pode criar qualquer eixo pelo painel
    },
    label: { 
        type: String, 
        required: true 
    },
    icone: { 
        type: String,
        default: 'fa-graduation-cap'
    },
    cor: {
        type: String,
        default: '#667eea'
    },
    descricao: String,
    ativo: { 
        type: Boolean, 
        default: true 
    }
}, { 
    timestamps: true // Adiciona createdAt e updatedAt automaticamente
});

// Índices para melhor performance
EixoSchema.index({ nome: 1 });
EixoSchema.index({ ativo: 1 });

module.exports = mongoose.model('Eixo', EixoSchema);