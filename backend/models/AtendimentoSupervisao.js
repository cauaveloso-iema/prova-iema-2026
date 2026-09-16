const mongoose = require('mongoose');

// ============================================
// SUB-SCHEMA: REMARCAÇÃO
// ============================================
const RemarcacaoSchema = new mongoose.Schema({
  id: {
    type: mongoose.Schema.Types.ObjectId,
    default: () => new mongoose.Types.ObjectId()
  },
  dataRemarcacao: { type: String, required: true },
  horarioRemarcacao: { type: String, required: true },
  motivoRemarcacao: { type: String, required: true, trim: true },
  observacoesRemarcacao: { type: String, default: '', trim: true },
  status: {
    type: String,
    enum: ['pendente', 'realizado', 'cancelado'],
    default: 'pendente'
  },
  criadaEm: { type: Date, default: Date.now },
  criadaPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  criadaPorNome: { type: String, default: '' },
  finalizadaEm: { type: Date, default: null },
  finalizadaPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { _id: false });

const AtendimentoSupervisaoSchema = new mongoose.Schema({
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
  
  tipoTarefa: {
    type: String,
    enum: [
      'advertencia_verbal',
      'advertencia_escrita',
      'atendimento_aluno',
      'atendimento_responsavel',
      'atendimento_professor',
      'suspensao',
      'encaminhamento',
      'outros'
    ],
    required: true
  },
  
  entrada: {
    dataHora: { type: Date, default: Date.now },
    descricao: { type: String, required: true },
    observacoes: String,
    gravidade: {
      type: String,
      enum: ['baixa', 'media', 'alta', 'critica'],
      default: 'media'
    },
    registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    registradoPorNome: String,
    // 🔥 Assinatura digital
    assinaturaBase64: {
      type: String,
      default: ''
    }
  },
  
  detalhes: {
    testemunhas: [String],
    descricaoOcorrido: String,
    nomeResponsavel: String,
    parentescoResponsavel: String,
    telefoneResponsavel: String,
    compareceu: { type: Boolean, default: false },
    nomeProfessor: String,
    disciplina: String,
    dataInicioSuspensao: Date,
    dataFimSuspensao: Date,
    diasSuspensao: Number,
    encaminhadoPara: String,
    motivoEncaminhamento: String,
    agendadoPara: Date,
    tipoTarefaOutros: String,
    providenciasTomadas: String,
    proximosPassos: String
  },
  
  saida: {
    dataHora: Date,
    resultado: {
      type: String,
      enum: ['resolvido', 'em_acompanhamento', 'reincidente', 'encaminhado', 'pendente'],
      required: false
    },
    resultadoTexto: String,
    observacoesFinais: String,
    registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    registradoPorNome: String
  },
  
  // 🔥 Remarcações
  remarcacoes: {
    type: [RemarcacaoSchema],
    default: []
  },
  temRemarcacaoPendente: {
    type: Boolean,
    default: false
  },
  
  anexos: [{
    nome: String,
    url: String,
    tipo: String,
    uploadedAt: { type: Date, default: Date.now }
  }],
  
  status: {
    type: String,
    enum: ['em_andamento', 'finalizado', 'arquivado'],
    default: 'em_andamento'
  },
  
  prioridade: {
    type: String,
    enum: ['baixa', 'normal', 'alta', 'urgente'],
    default: 'normal'
  },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Índices
AtendimentoSupervisaoSchema.index({ alunoId: 1, status: 1 });
AtendimentoSupervisaoSchema.index({ tipoTarefa: 1, createdAt: -1 });
AtendimentoSupervisaoSchema.index({ alunoTurma: 1, createdAt: -1 });
AtendimentoSupervisaoSchema.index({ createdAt: -1 });
AtendimentoSupervisaoSchema.index({ temRemarcacaoPendente: 1, status: 1 });
AtendimentoSupervisaoSchema.index({ 'remarcacoes.status': 1 });

// Métodos estáticos
AtendimentoSupervisaoSchema.statics.alunoEmAtendimento = async function(alunoId) {
  const atendimento = await this.findOne({ alunoId, status: 'em_andamento' });
  return !!atendimento;
};

AtendimentoSupervisaoSchema.statics.getAtendimentoAtivo = async function(alunoId) {
  return await this.findOne({ alunoId, status: 'em_andamento' }).sort({ createdAt: -1 });
};

AtendimentoSupervisaoSchema.statics.getTipoTarefaLabel = function(tipo) {
  const labels = {
    'advertencia_verbal': 'Advertência Verbal',
    'advertencia_escrita': 'Advertência Escrita',
    'atendimento_aluno': 'Atendimento Aluno',
    'atendimento_responsavel': 'Atendimento Responsável',
    'atendimento_professor': 'Atendimento Professor',
    'suspensao': 'Suspensão',
    'encaminhamento': 'Encaminhamento',
    'outros': 'Outros'
  };
  return labels[tipo] || tipo;
};

// Método para adicionar remarcação
AtendimentoSupervisaoSchema.methods.adicionarRemarcacao = function(dados) {
  if (!this.remarcacoes) this.remarcacoes = [];
  
  this.remarcacoes.push({
    id: new mongoose.Types.ObjectId(),
    dataRemarcacao: dados.dataRemarcacao,
    horarioRemarcacao: dados.horarioRemarcacao,
    motivoRemarcacao: dados.motivoRemarcacao,
    observacoesRemarcacao: dados.observacoesRemarcacao || '',
    status: 'pendente',
    criadaEm: new Date(),
    criadaPor: dados.criadaPor,
    criadaPorNome: dados.criadaPorNome || ''
  });
  
  this.temRemarcacaoPendente = true;
  this.updatedAt = new Date();
  return this.save();
};

module.exports = mongoose.model('AtendimentoSupervisao', AtendimentoSupervisaoSchema);