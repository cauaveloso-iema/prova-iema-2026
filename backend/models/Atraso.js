const mongoose = require('mongoose');

const AtrasoSchema = new mongoose.Schema({
  alunoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  alunoNome: { type: String, required: true },
  alunoMatricula: String,
  alunoTurma: String,
  alunoCurso: String,
  alunoFoto: String,
  
  motivo: {
    type: String,
    enum: ['onibus', 'transito', 'problemas_pessoais', 'fardamento', 'outros'],
    required: true
  },
  
  dataHora: { type: Date, default: Date.now },
  descricao: { type: String, required: true },
  observacoes: String,
  
  detalhes: {
    motivoOutros: String,
    horarioPrevisto: String,
    horarioChegada: String,
    tempoAtrasoMinutos: Number
  },
  
  registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  registradoPorNome: String,
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

AtrasoSchema.index({ alunoId: 1, dataHora: -1 });
AtrasoSchema.index({ motivo: 1, dataHora: -1 });
AtrasoSchema.index({ alunoTurma: 1, dataHora: -1 });
AtrasoSchema.index({ dataHora: -1 });

AtrasoSchema.statics.getMotivoLabel = function(motivo) {
  const labels = {
    'onibus': 'Ônibus',
    'transito': 'Trânsito',
    'problemas_pessoais': 'Problemas Pessoais',
    'fardamento': 'Fardamento',
    'outros': 'Outros'
  };
  return labels[motivo] || motivo;
};

module.exports = mongoose.model('Atraso', AtrasoSchema);