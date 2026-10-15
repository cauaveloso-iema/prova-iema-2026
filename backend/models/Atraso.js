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
  
  // ============================================
  // ASSINATURA DO RESPONSÁVEL
  // ============================================
  precisaAssinatura: { type: Boolean, default: false },
  assinaturaBase64: { type: String, default: '' },
  temAssinatura: { type: Boolean, default: false, index: true },
  statusAssinatura: {
    type: String,
    enum: ['nao_necessaria', 'pendente', 'assinada'],
    default: 'nao_necessaria',
    index: true
  },
  assinadaEm: { type: Date, default: null },
  assinadaPorNome: { type: String, default: null },
  
  // 🆕 ============================================
  // ASSINATURA DO ALUNO
  // ============================================
  precisaAssinaturaAluno: { type: Boolean, default: false },
  assinaturaAlunoBase64: { type: String, default: '' },
  temAssinaturaAluno: { type: Boolean, default: false, index: true },
  statusAssinaturaAluno: {
    type: String,
    enum: ['nao_necessaria', 'pendente', 'assinada'],
    default: 'nao_necessaria',
    index: true
  },
  assinadaEmAluno: { type: Date, default: null },
  assinadaPorNomeAluno: { type: String, default: null },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// ============================================
// ÍNDICES
// ============================================
AtrasoSchema.index({ alunoId: 1, dataHora: -1 });
AtrasoSchema.index({ motivo: 1, dataHora: -1 });
AtrasoSchema.index({ alunoTurma: 1, dataHora: -1 });
AtrasoSchema.index({ dataHora: -1 });
AtrasoSchema.index({ statusAssinatura: 1, createdAt: -1 });
AtrasoSchema.index({ statusAssinaturaAluno: 1, createdAt: -1 });

// ============================================
// MIDDLEWARE
// ============================================
AtrasoSchema.pre('save', function(next) {
  // Responsável
  this.temAssinatura = !!(this.assinaturaBase64 && this.assinaturaBase64.length > 100);
  if (this.temAssinatura) {
    this.statusAssinatura = 'assinada';
  } else if (this.precisaAssinatura && this.statusAssinatura !== 'pendente') {
    this.statusAssinatura = 'pendente';
  } else if (!this.precisaAssinatura) {
    this.statusAssinatura = 'nao_necessaria';
  }
  
  // Aluno
  this.temAssinaturaAluno = !!(this.assinaturaAlunoBase64 && this.assinaturaAlunoBase64.length > 100);
  if (this.temAssinaturaAluno) {
    this.statusAssinaturaAluno = 'assinada';
  } else if (this.precisaAssinaturaAluno && this.statusAssinaturaAluno !== 'pendente') {
    this.statusAssinaturaAluno = 'pendente';
  } else if (!this.precisaAssinaturaAluno) {
    this.statusAssinaturaAluno = 'nao_necessaria';
  }
  
  this.updatedAt = new Date();
  next();
});

// ============================================
// MÉTODO ESTÁTICO
// ============================================
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