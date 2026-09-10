const mongoose = require('mongoose');

const VotoSchema = new mongoose.Schema({
  // Eleitor
  eleitorNome: {
    type: String,
    required: true
  },
  
  eleitorMatricula: {
    type: String,
    default: ''
  },
  
  eleitorTurma: {
    type: String,
    required: true
  },
  
  eleitorDataNascimento: {
    type: Date,
    required: true
  },
  
  // Candidato votado
  candidatoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Candidato',
    required: true
  },
  
  candidatoNome: {
    type: String,
    required: true
  },
  
  cargo: {
    type: String,
    enum: ['lider', 'vice_lider'],
    required: true
  },
  
  // Metadados
  ipVoto: String,
  userAgent: String,
  
  createdAt: { type: Date, default: Date.now }
});

// Índices
VotoSchema.index({ eleitorNome: 1, eleitorTurma: 1, cargo: 1 });
VotoSchema.index({ candidatoId: 1 });
VotoSchema.index({ eleitorTurma: 1, cargo: 1 });

// Verificar se já votou
VotoSchema.statics.jaVotou = async function(eleitorNome, eleitorDataNascimento, cargo) {
  const voto = await this.findOne({
    eleitorNome: { $regex: new RegExp(`^${eleitorNome}$`, 'i') },
    eleitorDataNascimento: new Date(eleitorDataNascimento),
    cargo
  });
  return !!voto;
};

// Contar votos por candidato
VotoSchema.statics.contarVotosCandidato = async function(candidatoId) {
  return await this.countDocuments({ candidatoId });
};

module.exports = mongoose.model('Voto', VotoSchema);