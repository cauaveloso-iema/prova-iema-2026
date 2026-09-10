const mongoose = require('mongoose');

const TutorSchema = new mongoose.Schema({
  nomeProfessor: {
    type: String,
    required: true,
    trim: true
  },
  
  professorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  area: {
    type: String,
    required: true,
    trim: true
  },
  
  curso: {
    type: String,
    required: true
  },
  
  turma: {
    type: String,
    required: true
  },
  
  observacoes: {
    type: String,
    default: ''
  },
  
  ativo: {
    type: Boolean,
    default: true
  },
  
  criadoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Índices
TutorSchema.index({ turma: 1, ativo: 1 });
TutorSchema.index({ professorId: 1 });
TutorSchema.index({ area: 1 });

// Contar tutores ativos de uma turma
TutorSchema.statics.contarTutoresTurma = async function(turma) {
  return await this.countDocuments({ turma, ativo: true });
};

// Verificar se já existem 2 tutores na turma
TutorSchema.statics.limiteAtingido = async function(turma) {
  const total = await this.contarTutoresTurma(turma);
  return total >= 2;
};

module.exports = mongoose.model('Tutor', TutorSchema);