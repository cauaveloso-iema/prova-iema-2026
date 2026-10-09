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

const AtendimentoAssistenteSocialSchema = new mongoose.Schema({
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
      'evasao_escolar',
      'desinteresse_aprendizado',
      'problemas_disciplina',
      'insubordinacao_limites',
      'vulnerabilidade_drogas',
      'atitudes_agressivas',
      'baixo_rendimento',
      'encaminhamento',
      'intervencao',
      'atendimento',
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
    },
    // 🆕 Assinatura via QR Code (sessão)
    temAssinatura: { 
      type: Boolean, 
      default: false, 
      index: true 
    },
    statusAssinatura: {
      type: String,
      enum: ['nao_necessaria', 'pendente', 'assinada'],
      default: 'nao_necessaria',
      index: true
    },
    assinadaEm: { type: Date, default: null },
    assinadaPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    assinadaPorNome: { type: String, default: null }
  },
  
  detalhes: {
    contextoFamiliar: String,
    historicoAnterior: String,
    profissionaisEnvolvidos: [String],
    condicaoSocial: String,
    
    encaminhadoPara: String,
    motivoEncaminhamento: String,
    agendadoPara: Date,
    
    tipoIntervencao: String,
    metodosUtilizados: String,
    duracaoSessao: Number,
    
    modalidadeAtendimento: String,
    participantesAtendimento: [String],
    
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

// ============================================
// ÍNDICES
// ============================================
AtendimentoAssistenteSocialSchema.index({ alunoId: 1, status: 1 });
AtendimentoAssistenteSocialSchema.index({ tipoTarefa: 1, createdAt: -1 });
AtendimentoAssistenteSocialSchema.index({ alunoTurma: 1, createdAt: -1 });
AtendimentoAssistenteSocialSchema.index({ createdAt: -1 });
AtendimentoAssistenteSocialSchema.index({ temRemarcacaoPendente: 1, status: 1 });
AtendimentoAssistenteSocialSchema.index({ 'remarcacoes.status': 1 });
AtendimentoAssistenteSocialSchema.index({ 'entrada.statusAssinatura': 1, createdAt: -1 });

// ============================================
// MIDDLEWARE: PRE-SAVE
// ============================================
AtendimentoAssistenteSocialSchema.pre('save', function(next) {
  // Sincroniza temAssinatura e statusAssinatura baseado no assinaturaBase64
  if (this.entrada) {
    const temAssinaturaReal = !!(this.entrada.assinaturaBase64 && this.entrada.assinaturaBase64.length > 100);
    this.entrada.temAssinatura = temAssinaturaReal;
    
    if (temAssinaturaReal) {
      this.entrada.statusAssinatura = 'assinada';
      if (!this.entrada.assinadaEm) {
        this.entrada.assinadaEm = new Date();
      }
    } else if (this.entrada.statusAssinatura !== 'pendente') {
      this.entrada.statusAssinatura = 'nao_necessaria';
    }
  }
  
  this.updatedAt = new Date();
  next();
});

// ============================================
// MÉTODOS ESTÁTICOS
// ============================================
AtendimentoAssistenteSocialSchema.statics.alunoEmAtendimento = async function(alunoId) {
  const atendimento = await this.findOne({ alunoId, status: 'em_andamento' });
  return !!atendimento;
};

AtendimentoAssistenteSocialSchema.statics.getAtendimentoAtivo = async function(alunoId) {
  return await this.findOne({ alunoId, status: 'em_andamento' }).sort({ createdAt: -1 });
};

AtendimentoAssistenteSocialSchema.statics.getTipoTarefaLabel = function(tipo) {
  const labels = {
    'evasao_escolar': 'Evasão Escolar',
    'desinteresse_aprendizado': 'Desinteresse pelo Aprendizado',
    'problemas_disciplina': 'Problemas com Disciplina',
    'insubordinacao_limites': 'Insubordinação a Limites/Regras',
    'vulnerabilidade_drogas': 'Vulnerabilidade às Drogas',
    'atitudes_agressivas': 'Atitudes Agressivas/Violentas',
    'baixo_rendimento': 'Baixo Rendimento Escolar',
    'encaminhamento': 'Encaminhamento',
    'intervencao': 'Intervenção',
    'atendimento': 'Atendimento',
    'outros': 'Outros'
  };
  return labels[tipo] || tipo;
};

// ============================================
// MÉTODOS DE INSTÂNCIA
// ============================================
AtendimentoAssistenteSocialSchema.methods.adicionarRemarcacao = function(dados) {
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

module.exports = mongoose.model('AtendimentoAssistenteSocial', AtendimentoAssistenteSocialSchema);