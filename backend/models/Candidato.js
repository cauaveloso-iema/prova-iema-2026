const mongoose = require('mongoose');

const CandidatoSchema = new mongoose.Schema({
  // Candidato (aluno)
  alunoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  nome: {
    type: String,
    required: true
  },
  
  matricula: {
    type: String,
    default: ''
  },
  
  fotoPerfil: {
    type: String,
    default: ''
  },
  
  // Qual turma esse candidato pertence
  turma: {
    type: String,
    required: true
  },
  
  curso: {
    type: String,
    default: ''
  },
  
  // Cargo que está disputando
  cargo: {
    type: String,
    enum: ['lider', 'vice_lider'],
    required: true
  },
  
  // Proposta de campanha
  proposta: {
    type: String,
    default: ''
  },
  
  slogan: {
    type: String,
    default: ''
  },
  
  votos: {
    type: Number,
    default: 0
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
CandidatoSchema.index({ turma: 1, cargo: 1, ativo: 1 });
CandidatoSchema.index({ alunoId: 1, turma: 1, cargo: 1 }, { unique: true });

// Buscar candidatos por turma e cargo
CandidatoSchema.statics.buscarPorTurmaCargo = async function(turma, cargo) {
  return await this.find({ turma, cargo, ativo: true }).sort({ nome: 1 });
};

// Incrementar voto
CandidatoSchema.statics.registrarVoto = async function(candidatoId) {
  return await this.findByIdAndUpdate(
    candidatoId,
    { $inc: { votos: 1 } },
    { new: true }
  );
};

module.exports = mongoose.model('Candidato', CandidatoSchema);