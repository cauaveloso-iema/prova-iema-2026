const mongoose = require('mongoose');

const ClubeSchema = new mongoose.Schema({
  nome: {
    type: String,
    required: true,
    trim: true
  },
  
  descricao: {
    type: String,
    required: true
  },
  
  lider: {
    nome: { type: String, default: '' },
    alunoId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
  },
  
  viceLider: {
    nome: { type: String, default: '' },
    alunoId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
  },
  
  vagas: {
    type: Number,
    required: true,
    default: 30,
    min: 1
  },
  
  vagasOcupadas: {
    type: Number,
    default: 0
  },
  
  local: {
    type: String,
    default: ''
  },
  
  horario: {
    type: String,
    default: ''
  },
  
  diaSemana: {
    type: String,
    default: ''
  },
  
  imagemUrl: {
    type: String,
    default: ''
  },
  
  cor: {
    type: String,
    default: '#f97316'
  },
  
  ativo: {
    type: Boolean,
    default: true
  },
  
  inscricoesAbertas: {
    type: Boolean,
    default: false
  },
  
  criadoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Índices
ClubeSchema.index({ nome: 1 });
ClubeSchema.index({ ativo: 1, inscricoesAbertas: 1 });

// Virtual para vagas restantes
ClubeSchema.virtual('vagasRestantes').get(function() {
  return Math.max(0, this.vagas - this.vagasOcupadas);
});

ClubeSchema.set('toJSON', { virtuals: true });
ClubeSchema.set('toObject', { virtuals: true });

// Métodos estáticos
ClubeSchema.statics.temVagasDisponiveis = async function(clubeId) {
  const clube = await this.findById(clubeId);
  if (!clube) return false;
  return clube.vagasOcupadas < clube.vagas;
};

ClubeSchema.statics.incrementarVaga = async function(clubeId) {
  return await this.findByIdAndUpdate(
    clubeId,
    { $inc: { vagasOcupadas: 1 } },
    { new: true }
  );
};

ClubeSchema.statics.decrementarVaga = async function(clubeId) {
  return await this.findByIdAndUpdate(
    clubeId,
    { $inc: { vagasOcupadas: -1 } },
    { new: true }
  );
};

module.exports = mongoose.model('Clube', ClubeSchema);