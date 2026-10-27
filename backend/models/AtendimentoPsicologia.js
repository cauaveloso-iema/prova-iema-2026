const mongoose = require('mongoose');
const { criptografar, descriptografar } = require('../utils/criptografia');

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
  
  motivoRemarcacao: { 
    type: String, required: true, trim: true,
    set: criptografar, get: descriptografar
  },
  observacoesRemarcacao: { 
    type: String, default: '', trim: true,
    set: criptografar, get: descriptografar
  },
  
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
}, { 
  _id: false,
  toJSON: { getters: true },
  toObject: { getters: true }
});

// ============================================
// 🆕 SUB-SCHEMA: DETALHES (corrige criptografia dupla)
// ============================================
const DetalhesSchema = new mongoose.Schema({
  contextoFamiliar: { type: String, set: criptografar, get: descriptografar },
  historicoAnterior: { type: String, set: criptografar, get: descriptografar },
  profissionaisEnvolvidos: { 
    type: [String],
    set: (arr) => Array.isArray(arr) ? arr.map(v => v ? criptografar(v) : v) : arr,
    get: (arr) => Array.isArray(arr) ? arr.map(v => v ? descriptografar(v) : v) : arr
  },
  
  // Escuta de Acolhimento
  tipoEscuta: { type: String, set: criptografar, get: descriptografar },
  duracaoEscuta: Number,
  
  // Manejo de Crises Emocionais
  tipoCrise: { type: String, set: criptografar, get: descriptografar },
  acoesTomadas: { type: String, set: criptografar, get: descriptografar },
  encaminhamentoEmergencial: { type: String, set: criptografar, get: descriptografar },
  
  // Atividades em Grupos
  nomeAtividade: { type: String, set: criptografar, get: descriptografar },
  participantesAtividade: { 
    type: [String],
    set: (arr) => Array.isArray(arr) ? arr.map(v => v ? criptografar(v) : v) : arr,
    get: (arr) => Array.isArray(arr) ? arr.map(v => v ? descriptografar(v) : v) : arr
  },
  localAtividade: { type: String, set: criptografar, get: descriptografar },
  duracaoAtividade: Number,
  
  // Ações e Atividades em Saúde
  temaAcao: { type: String, set: criptografar, get: descriptografar },
  publicoAlvo: { type: String, set: criptografar, get: descriptografar },
  localAcao: { type: String, set: criptografar, get: descriptografar },
  
  // Ações e Atividades Socioemocionais e Culturais
  temaSocioemocional: { type: String, set: criptografar, get: descriptografar },
  tipoAtividadeCultural: { type: String, set: criptografar, get: descriptografar },
  parceria: { type: String, set: criptografar, get: descriptografar },
  
  // Outros
  tipoTarefaOutros: { type: String, set: criptografar, get: descriptografar },
  
  // Comuns finais
  providenciasTomadas: { type: String, set: criptografar, get: descriptografar },
  proximosPassos: { type: String, set: criptografar, get: descriptografar },
  
  // 🆕 Tipos adicionais (para multi-tipo)
  tiposTarefaAdicionais: { type: [String], default: [] }
}, {
  _id: false,
  toJSON: { getters: true },
  toObject: { getters: true }
});

// ============================================
// SCHEMA PRINCIPAL
// ============================================
const AtendimentoPsicologiaSchema = new mongoose.Schema({
  alunoId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  alunoNome: { type: String, required: true },
  alunoMatricula: String,
  alunoTurma: String,
  alunoCurso: String,
  alunoFoto: String,
  
  tipoTarefa: {
    type: String,
    enum: [
      'escuta_acolhimento',
      'manejo_crises_emocionais',
      'atividades_grupos',
      'acoes_atividades_saude',
      'acoes_socioemocionais_culturais',
      'outros'
    ],
    required: true
  },
  
  entrada: {
    dataHora: { type: Date, default: Date.now },
    descricao: { type: String, required: true, set: criptografar, get: descriptografar },
    observacoes: { type: String, set: criptografar, get: descriptografar },
    gravidade: {
      type: String,
      enum: ['baixa', 'media', 'alta', 'critica'],
      default: 'media'
    },
    registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    registradoPorNome: String,
    assinaturaBase64: {
      type: String, default: '',
      set: criptografar, get: descriptografar
    },
    temAssinatura: { type: Boolean, default: false, index: true },
    statusAssinatura: {
      type: String,
      enum: ['nao_necessaria', 'pendente', 'assinada'],
      default: 'nao_necessaria',
      index: true
    },
    assinadaEm: { type: Date, default: null },
    assinadaPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    assinadaPorNome: { type: String, default: null },
    sessaoAssinaturaId: { type: String, default: null }
  },
  
  // 🆕 SubSchema real (era objeto inline)
  detalhes: { type: DetalhesSchema, default: () => ({}) },
  
  saida: {
    dataHora: Date,
    resultado: {
      type: String,
      enum: ['resolvido', 'em_acompanhamento', 'reincidente', 'encaminhado', 'pendente'],
      required: false
    },
    resultadoTexto: { type: String, set: criptografar, get: descriptografar },
    observacoesFinais: { type: String, set: criptografar, get: descriptografar },
    registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    registradoPorNome: String
  },
  
  remarcacoes: { type: [RemarcacaoSchema], default: [] },
  temRemarcacaoPendente: { type: Boolean, default: false },
  
  ultimoAlerta24h: { type: Date, default: null, index: true },
  totalAlertas24h: { type: Number, default: 0 },
  alerta24hReconhecido: { type: Boolean, default: false },
  
  anexos: [{
    nome: String, url: String, tipo: String,
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
}, {
  toJSON: { getters: true, virtuals: true },
  toObject: { getters: true, virtuals: true }
});

// Virtual
AtendimentoPsicologiaSchema.virtual('tiposTarefaCompleto').get(function() {
  const adicionais = this.detalhes?.tiposTarefaAdicionais || [];
  return [this.tipoTarefa, ...adicionais].filter(Boolean);
});

// Índices
AtendimentoPsicologiaSchema.index({ alunoId: 1, status: 1 });
AtendimentoPsicologiaSchema.index({ tipoTarefa: 1, createdAt: -1 });
AtendimentoPsicologiaSchema.index({ alunoTurma: 1, createdAt: -1 });
AtendimentoPsicologiaSchema.index({ createdAt: -1 });
AtendimentoPsicologiaSchema.index({ temRemarcacaoPendente: 1, status: 1 });
AtendimentoPsicologiaSchema.index({ 'remarcacoes.status': 1 });
AtendimentoPsicologiaSchema.index({ 'entrada.statusAssinatura': 1, createdAt: -1 });
AtendimentoPsicologiaSchema.index({ status: 1, 'entrada.dataHora': 1, ultimoAlerta24h: 1 });

// Pre-save
AtendimentoPsicologiaSchema.pre('save', function(next) {
  if (this.entrada) {
    const temAssinaturaReal = !!(this.entrada.assinaturaBase64 && this.entrada.assinaturaBase64.length > 100);
    this.entrada.temAssinatura = temAssinaturaReal;
    
    if (temAssinaturaReal) {
      this.entrada.statusAssinatura = 'assinada';
      if (!this.entrada.assinadaEm) this.entrada.assinadaEm = new Date();
    } else if (this.entrada.statusAssinatura !== 'pendente') {
      this.entrada.statusAssinatura = 'nao_necessaria';
    }
  }
  
  this.updatedAt = new Date();
  next();
});

// Métodos estáticos
AtendimentoPsicologiaSchema.statics.alunoEmAtendimento = async function(alunoId) {
  return !!(await this.findOne({ alunoId, status: 'em_andamento' }));
};

AtendimentoPsicologiaSchema.statics.getAtendimentoAtivo = async function(alunoId) {
  return await this.findOne({ alunoId, status: 'em_andamento' }).sort({ createdAt: -1 });
};

AtendimentoPsicologiaSchema.statics.getTipoTarefaLabel = function(tipo) {
  const labels = {
    'escuta_acolhimento': 'Escutas de Acolhimento',
    'manejo_crises_emocionais': 'Manejo de Crises Emocionais',
    'atividades_grupos': 'Atividades em Grupos',
    'acoes_atividades_saude': 'Ações e Atividades em Saúde',
    'acoes_socioemocionais_culturais': 'Ações e Atividades Socioemocionais e Culturais',
    'outros': 'Outros'
  };
  return labels[tipo] || tipo;
};

AtendimentoPsicologiaSchema.statics.getTiposLabels = function(tipos) {
  if (!Array.isArray(tipos) || tipos.length === 0) return '';
  return tipos.map(t => this.getTipoTarefaLabel(t)).join(' + ');
};

AtendimentoPsicologiaSchema.statics.buscarAtendimentosParaAlerta = async function() {
  const agora = new Date();
  const limite24h = new Date(agora.getTime() - 24 * 60 * 60 * 1000);
  const intervaloAlerta = new Date(agora.getTime() - 20 * 60 * 1000);
  
  return await this.find({
    status: 'em_andamento',
    alerta24hReconhecido: false,
    'entrada.dataHora': { $lte: limite24h },
    $or: [
      { ultimoAlerta24h: null },
      { ultimoAlerta24h: { $lte: intervaloAlerta } }
    ]
  }).populate('entrada.registradoPor', 'nome email');
};

AtendimentoPsicologiaSchema.methods.adicionarRemarcacao = function(dados) {
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

module.exports = mongoose.model(
  'AtendimentoPsicologia',
  AtendimentoPsicologiaSchema,
  'atendimentopsicologias'
);