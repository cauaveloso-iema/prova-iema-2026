const mongoose = require('mongoose');

const TurmaSchema = new mongoose.Schema({
  nome: {
    type: String,
    required: true,
    trim: true
  },
  disciplina: {
    type: String,
    required: true
  },
  descricao: String,
  codigo: {
    type: String,
    unique: true,
    uppercase: true
  },
  professorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  alunos: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  provas: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Prova'
  }],
  // NOVO CAMPO: eixo da turma
  eixo: {
    type: String,
    enum: ['natureza', 'humanas', 'geral'],
    default: 'geral'
  },
  dataCriacao: {
    type: Date,
    default: Date.now
  },
  ativa: {
    type: Boolean,
    default: true
  }
});

// Gerar código único antes de salvar
TurmaSchema.pre('save', async function(next) {
  if (!this.codigo) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    this.codigo = code;
  }
  next();
});

module.exports = mongoose.model('Turma', TurmaSchema);