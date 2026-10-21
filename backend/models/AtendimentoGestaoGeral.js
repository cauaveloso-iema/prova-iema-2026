// ============================================
// MODEL: Atendimento Gestão Geral
// Atendimentos ao Aluno e aos Pais/Responsáveis
// Com assinatura via QR Code (Responsável + Aluno)
// ============================================

const mongoose = require('mongoose');

const atendimentoSchema = new mongoose.Schema({
  // ============================================
  // TIPO DE ATENDIMENTO
  // ============================================
  tipoAtendimento: {
    type: String,
    enum: ['aluno', 'responsavel'],
    required: true,
    index: true
  },

  // ============================================
  // DADOS DO ALUNO (sempre preenchidos)
  // ============================================
  alunoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  alunoNome: { type: String, required: true },
  alunoMatricula: { type: String, default: '' },
  alunoTurma: { type: String, required: true, index: true },
  alunoCurso: { type: String, default: '' },
  alunoFoto: { type: String, default: '' },

  // ============================================
  // DADOS DO RESPONSÁVEL (só quando tipoAtendimento = 'responsavel')
  // ============================================
  responsavelNome: { type: String, default: '' },
  responsavelCPF: { type: String, default: '' },
  responsavelTelefone: { type: String, default: '' },
  responsavelParentesco: { type: String, default: '' },

  // ============================================
  // DADOS DO ATENDIMENTO
  // ============================================
  dataAtendimento: {
    type: Date,
    required: true,
    index: true,
    default: Date.now
  },

  motivo: {
    type: String,
    required: true,
    enum: [
      'comportamento',
      'desempenho_academico',
      'frequencia',
      'relacionamento',
      'saude',
      'familia',
      'disciplina',
      'orientacao',
      'outros'
    ]
  },
  motivoLabel: { type: String, default: '' },
  descricaoMotivo: { type: String, required: true },

  providencias: {
    type: String,
    required: true,
    enum: [
      'orientacao_verbal',
      'advertencia_verbal',
      'advertencia_escrita',
      'notificacao_responsavel',
      'reuniao_responsavel',
      'encaminhamento_psicologia',
      'encaminhamento_assistente_social',
      'acompanhamento_pedagogico',
      'suspensao',
      'outros'
    ]
  },
  providenciasLabel: { type: String, default: '' },
  descricaoProvidencias: { type: String, required: true },

  observacoes: { type: String, default: '' },

  // ============================================
  // ASSINATURA DO RESPONSÁVEL (QR Code)
  // ============================================
  precisaAssinatura: { type: Boolean, default: false },
  assinaturaBase64: { type: String, default: '' },
  temAssinatura: { type: Boolean, default: false },
  statusAssinatura: {
    type: String,
    enum: ['nao_necessaria', 'pendente', 'assinada'],
    default: 'nao_necessaria'
  },
  assinadaEm: { type: Date, default: null },
  assinadaPorNome: { type: String, default: null },

  // ============================================
  // ASSINATURA DO ALUNO (QR Code)
  // ============================================
  precisaAssinaturaAluno: { type: Boolean, default: false },
  assinaturaAlunoBase64: { type: String, default: '' },
  temAssinaturaAluno: { type: Boolean, default: false },
  statusAssinaturaAluno: {
    type: String,
    enum: ['nao_necessaria', 'pendente', 'assinada'],
    default: 'nao_necessaria'
  },
  assinadaEmAluno: { type: Date, default: null },
  assinadaPorNomeAluno: { type: String, default: null },

  // ============================================
  // AUDITORIA
  // ============================================
  registradoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  registradoPorNome: { type: String, default: '' },

  criadoEm: { type: Date, default: Date.now, index: true },
  atualizadoEm: { type: Date, default: Date.now }
});

// ============================================
// ÍNDICES COMPOSTOS PARA CONSULTAS RÁPIDAS
// ============================================
atendimentoSchema.index({ tipoAtendimento: 1, dataAtendimento: -1 });
atendimentoSchema.index({ alunoTurma: 1, dataAtendimento: -1 });
atendimentoSchema.index({ alunoId: 1, dataAtendimento: -1 });

// ============================================
// HOOKS
// ============================================
atendimentoSchema.pre('save', function (next) {
  this.atualizadoEm = new Date();
  next();
});

// ============================================
// MÉTODOS ESTÁTICOS: Labels
// ============================================
atendimentoSchema.statics.getMotivoLabel = function (motivo) {
  const labels = {
    comportamento: 'Comportamento',
    desempenho_academico: 'Desempenho Acadêmico',
    frequencia: 'Frequência',
    relacionamento: 'Relacionamento',
    saude: 'Saúde',
    familia: 'Família',
    disciplina: 'Disciplina',
    orientacao: 'Orientação',
    outros: 'Outros'
  };
  return labels[motivo] || motivo;
};

atendimentoSchema.statics.getProvidenciaLabel = function (providencia) {
  const labels = {
    orientacao_verbal: 'Orientação Verbal',
    advertencia_verbal: 'Advertência Verbal',
    advertencia_escrita: 'Advertência Escrita',
    notificacao_responsavel: 'Notificação ao Responsável',
    reuniao_responsavel: 'Reunião com Responsável',
    encaminhamento_psicologia: 'Encaminhamento à Psicologia',
    encaminhamento_assistente_social: 'Encaminhamento à Assistência Social',
    acompanhamento_pedagogico: 'Acompanhamento Pedagógico',
    suspensao: 'Suspensão',
    outros: 'Outros'
  };
  return labels[providencia] || providencia;
};

// ============================================
// MÉTODOS DE INSTÂNCIA
// ============================================
atendimentoSchema.methods.toJSONSafe = function () {
  const obj = this.toObject();
  obj.motivoLabel = this.constructor.getMotivoLabel(this.motivo);
  obj.providenciasLabel = this.constructor.getProvidenciaLabel(this.providencias);
  obj.dataAtendimentoFormatada = this.dataAtendimento
    ? new Date(this.dataAtendimento).toLocaleDateString('pt-BR')
    : '-';
  obj.criadoEmFormatado = this.criadoEm
    ? new Date(this.criadoEm).toLocaleString('pt-BR')
    : '-';
  return obj;
};

module.exports = mongoose.model('AtendimentoGestaoGeral', atendimentoSchema);