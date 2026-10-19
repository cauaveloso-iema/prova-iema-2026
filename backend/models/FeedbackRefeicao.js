const mongoose = require('mongoose');

const FeedbackRefeicaoSchema = new mongoose.Schema({
  alunoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  alunoNome: {
    type: String,
    required: true,
    trim: true
  },
  alunoTurma: {
    type: String,
    default: '',
    trim: true
  },
  alunoCurso: {
    type: String,
    default: '',
    trim: true
  },
  tipoRefeicao: {
    type: String,
    enum: ['manha', 'almoco', 'tarde'],
    required: true,
    index: true
  },
  data: {
    type: String,
    default: () => new Date().toISOString().split('T')[0],
    index: true
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
    default: '',
    trim: true
  },
  gostou: {
    type: String,
    enum: ['sim', 'mais_ou_menos', 'nao', null],
    default: null
  },
  sugestao: {
    type: String,
    maxlength: 300,
    default: '',
    trim: true
  },
  anonimo: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

FeedbackRefeicaoSchema.index({ data: -1, tipoRefeicao: 1 });
FeedbackRefeicaoSchema.index({ alunoId: 1, createdAt: -1 });
FeedbackRefeicaoSchema.index({ createdAt: -1 });

module.exports = mongoose.model('FeedbackRefeicao', FeedbackRefeicaoSchema);