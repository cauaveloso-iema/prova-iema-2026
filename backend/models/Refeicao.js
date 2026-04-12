const mongoose = require('mongoose');

const refeicaoSchema = new mongoose.Schema({
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
    required: true
  },
  alunoFoto: {
    type: String,
    default: null
  },
  tipoRefeicao: {
    type: String,
    enum: ['manha', 'almoco', 'tarde'],
    required: true
  },
  horario: {
    type: Date,
    default: Date.now
  },
  data: {
    type: String,
    required: true
  },
  validadoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  validadoPorNome: {
    type: String,
    required: true
  },
  horarioPermitido: {
    type: Boolean,
    default: true
  },
  observacao: {
    type: String,
    default: ''
  }
}, { timestamps: true });

// Índices compostos para buscas rápidas
refeicaoSchema.index({ alunoId: 1, data: 1, tipoRefeicao: 1 });
refeicaoSchema.index({ data: 1, tipoRefeicao: 1 });
refeicaoSchema.index({ alunoTurma: 1, data: 1 });

// Verificar se aluno já fez a refeição no dia
refeicaoSchema.statics.alunoJaComeu = async function(alunoId, tipoRefeicao, data) {
  const existing = await this.findOne({
    alunoId,
    tipoRefeicao,
    data
  });
  return !!existing;
};

// Contar refeições por turma e tipo
refeicaoSchema.statics.contarPorTurma = async function(turma, tipoRefeicao, data) {
  return await this.countDocuments({
    alunoTurma: turma,
    tipoRefeicao,
    data
  });
};

module.exports = mongoose.model('Refeicao', refeicaoSchema);