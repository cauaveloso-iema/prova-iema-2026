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
  
  // 🔐 Criptografados
  motivoRemarcacao: { 
    type: String, 
    required: true, 
    trim: true,
    set: criptografar,
    get: descriptografar
  },
  observacoesRemarcacao: { 
    type: String, 
    default: '', 
    trim: true,
    set: criptografar,
    get: descriptografar
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
// SCHEMA PRINCIPAL: ATENDIMENTO PSICOLOGIA
// ============================================
const AtendimentoPsicologiaSchema = new mongoose.Schema({
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
    
    // 🔐 Criptografados
    descricao: { 
      type: String, 
      required: true,
      set: criptografar,
      get: descriptografar
    },
    observacoes: { 
      type: String,
      set: criptografar,
      get: descriptografar
    },
    
    gravidade: {
      type: String,
      enum: ['baixa', 'media', 'alta', 'critica'],
      default: 'media'
    },
    registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    registradoPorNome: String,
    
    // 🔐 Criptografado (dado biométrico - LGPD crítica!)
    assinaturaBase64: {
      type: String,
      default: '',
      set: criptografar,
      get: descriptografar
    },
    
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
    assinadaPorNome: { type: String, default: null },
    
    // Sessão de assinatura vinculada
    sessaoAssinaturaId: { type: String, default: null }
  },
  
  // 🔐 Todos os campos sensíveis criptografados
  detalhes: {
    contextoFamiliar: { type: String, set: criptografar, get: descriptografar },
    historicoAnterior: { type: String, set: criptografar, get: descriptografar },
    profissionaisEnvolvidos: { 
      type: [String],
      set: (arr) => Array.isArray(arr) ? arr.map(criptografar) : arr,
      get: (arr) => Array.isArray(arr) ? arr.map(descriptografar) : arr
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
      set: (arr) => Array.isArray(arr) ? arr.map(criptografar) : arr,
      get: (arr) => Array.isArray(arr) ? arr.map(descriptografar) : arr
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
    proximosPassos: { type: String, set: criptografar, get: descriptografar }
  },
  
  saida: {
    dataHora: Date,
    resultado: {
      type: String,
      enum: ['resolvido', 'em_acompanhamento', 'reincidente', 'encaminhado', 'pendente'],
      required: false
    },
    
    // 🔐 Criptografados
    resultadoTexto: { type: String, set: criptografar, get: descriptografar },
    observacoesFinais: { type: String, set: criptografar, get: descriptografar },
    
    registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    registradoPorNome: String
  },
  
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
}, {
  toJSON: { getters: true },
  toObject: { getters: true }
});

// ============================================
// ÍNDICES
// ============================================
AtendimentoPsicologiaSchema.index({ alunoId: 1, status: 1 });
AtendimentoPsicologiaSchema.index({ tipoTarefa: 1, createdAt: -1 });
AtendimentoPsicologiaSchema.index({ alunoTurma: 1, createdAt: -1 });
AtendimentoPsicologiaSchema.index({ createdAt: -1 });
AtendimentoPsicologiaSchema.index({ temRemarcacaoPendente: 1, status: 1 });
AtendimentoPsicologiaSchema.index({ 'remarcacoes.status': 1 });
AtendimentoPsicologiaSchema.index({ 'entrada.statusAssinatura': 1, createdAt: -1 });

// ============================================
// MIDDLEWARE: PRE-SAVE
// ============================================
AtendimentoPsicologiaSchema.pre('save', function(next) {
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
AtendimentoPsicologiaSchema.statics.alunoEmAtendimento = async function(alunoId) {
  const atendimento = await this.findOne({ alunoId, status: 'em_andamento' });
  return !!atendimento;
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

// ============================================
// MÉTODOS DE INSTÂNCIA
// ============================================
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

// ============================================
// EXPORT — força o nome EXATO da coleção
// ============================================
module.exports = mongoose.model(
  'AtendimentoPsicologia',
  AtendimentoPsicologiaSchema,
  'atendimentopsicologias'  // ⚠️ CONFIRME o nome no passo anterior!
);