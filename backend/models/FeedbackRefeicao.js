const mongoose = require('mongoose');

const FeedbackRefeicaoSchema = new mongoose.Schema({
  alunoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  alunoNome: {
    type: String,
    required: true
  },
  alunoTurma: {
    type: String,
    default: ''
  },
  tipoRefeicao: {
    type: String,
    enum: ['manha', 'almoco', 'tarde'],
    required: true
  },
  data: {
    type: String,
    default: () => new Date().toISOString().split('T')[0]
  },
  nota: {
    type: Number,
    min: 1,
    max: 5,
    required: true
  },
  comentario: {
    type: String,
    maxlength: 500,
    default: ''
  },
  gostou: {
    type: String,
    enum: ['sim', 'mais_ou_menos', 'nao', null],
    default: null
  },
  sugestao: {
    type: String,
    maxlength: 300,
    default: ''
  },
  anonimo: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('FeedbackRefeicao', FeedbackRefeicaoSchema);