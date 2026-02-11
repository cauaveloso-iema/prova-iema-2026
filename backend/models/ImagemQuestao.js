// models/ImagemQuestao.js
const mongoose = require('mongoose');

const ImagemQuestaoSchema = new mongoose.Schema({
    nomeArquivo: {
        type: String,
        required: true
    },
    caminho: {
        type: String,
        required: true
    },
    urlCompleta: {
        type: String,
        required: true
    },
    usuarioId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    usuarioNome: {
        type: String,
        required: true
    },
    tamanho: {
        type: Number,
        required: true
    },
    tipo: {
        type: String,
        required: true
    },
    questaoId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Questao'
    },
    provaId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Prova'
    },
    dataUpload: {
        type: Date,
        default: Date.now
    },
    dataUso: {
        type: Date
    }
});

module.exports = mongoose.model('ImagemQuestao', ImagemQuestaoSchema);