const mongoose = require('mongoose');

const MatriculaAutorizadaSchema = new mongoose.Schema({
    matricula: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        minlength: 6,
        maxlength: 6,
        match: /^[0-9]{6}$/
    },
    nome: {
        type: String,
        required: true,
        trim: true
    },
    criadoPor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    criadoEm: {
        type: Date,
        default: Date.now
    },
    atualizadoPor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    atualizadoEm: {
        type: Date
    },
    ativo: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Índice para busca rápida
MatriculaAutorizadaSchema.index({ matricula: 1 });
MatriculaAutorizadaSchema.index({ nome: 'text' });

const MatriculaAutorizada = mongoose.model('MatriculaAutorizada', MatriculaAutorizadaSchema);
module.exports = MatriculaAutorizada;