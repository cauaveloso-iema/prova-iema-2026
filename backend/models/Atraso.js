const mongoose = require('mongoose');

const AtrasoSchema = new mongoose.Schema({
  alunoId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  alunoNome: { type: String, required: true },
  alunoMatricula: String,
  alunoTurma: String,
  alunoCurso: String,
  alunoFoto: String,
  
  // Motivo principal (compatibilidade com filtros/relatórios antigos)
  motivo: {
    type: String,
    enum: ['onibus', 'transito', 'problemas_pessoais', 'fardamento', 'outros'],
    required: true
  },
  
  // 🆕 TODOS os motivos selecionados (multi-seleção)
  motivos: {
    type: [String],
    enum: ['onibus', 'transito', 'problemas_pessoais', 'fardamento', 'outros'],
    default: []
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
  
  // ============================================
  // 🆕 DADOS DO RESPONSÁVEL (opcionais)
  // Mesmo padrão da Autorização
  // ============================================
  responsavelNome: { type: String, default: '' },
  responsavelCPF: { type: String, default: '' },
  responsavelTelefone: { type: String, default: '' },
  
  registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  registradoPorNome: String,
  
  // Assinatura do Responsável
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
  
  // Assinatura do Aluno
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

AtrasoSchema.index({ alunoId: 1, dataHora: -1 });
AtrasoSchema.index({ motivo: 1, dataHora: -1 });
AtrasoSchema.index({ motivos: 1, dataHora: -1 });
AtrasoSchema.index({ alunoTurma: 1, dataHora: -1 });
AtrasoSchema.index({ dataHora: -1 });
AtrasoSchema.index({ statusAssinatura: 1, createdAt: -1 });
AtrasoSchema.index({ statusAssinaturaAluno: 1, createdAt: -1 });

AtrasoSchema.pre('save', function(next) {
  if (this.motivo && (!Array.isArray(this.motivos) || this.motivos.length === 0)) {
    this.motivos = [this.motivo];
  }
  if (Array.isArray(this.motivos) && this.motivos.length > 0 && !this.motivo) {
    this.motivo = this.motivos[0];
  }
  if (Array.isArray(this.motivos)) {
    this.motivos = [...new Set(this.motivos)];
  }
  
  this.temAssinatura = !!(this.assinaturaBase64 && this.assinaturaBase64.length > 100);
  if (this.temAssinatura) {
    this.statusAssinatura = 'assinada';
  } else if (this.precisaAssinatura && this.statusAssinatura !== 'pendente') {
    this.statusAssinatura = 'pendente';
  } else if (!this.precisaAssinatura) {
    this.statusAssinatura = 'nao_necessaria';
  }
  
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

AtrasoSchema.statics.getMotivosLabels = function(motivos) {
  if (!Array.isArray(motivos) || motivos.length === 0) return '';
  return motivos.map(m => this.getMotivoLabel(m)).join(' + ');
};

AtrasoSchema.virtual('motivoLabelCompleto').get(function() {
  const motivos = this.motivos && this.motivos.length > 0 ? this.motivos : [this.motivo];
  return AtrasoSchema.statics.getMotivosLabels(motivos);
});

AtrasoSchema.set('toJSON', { getters: true, virtuals: true });
AtrasoSchema.set('toObject', { getters: true, virtuals: true });

module.exports = mongoose.model('Atraso', AtrasoSchema);