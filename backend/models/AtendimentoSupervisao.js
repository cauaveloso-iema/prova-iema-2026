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
// SUB-SCHEMA: PARTICIPANTE
// ============================================
const ParticipanteSchema = new mongoose.Schema({
  usuarioId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  usuarioNome: { type: String, required: true },
  usuarioMatricula: { type: String, default: null },
  usuarioFoto: { type: String, default: null },
  tipo: { type: String, required: true },
  tipoLabel: { type: String, required: true },
  turma: { type: String, default: null },
  eixo: { type: String, default: null },
  filtroValor: { type: String, default: '' },
  precisaAssinatura: { type: Boolean, default: false },
  assinaturaBase64: { 
    type: String, 
    default: '',
    set: criptografar,
    get: descriptografar
  },
  temAssinatura: { type: Boolean, default: false },
  assinadaEm: { type: Date, default: null },
  assinadaPorNome: { type: String, default: null },
  sessaoAssinaturaId: { type: String, default: null }
}, {
  _id: true,
  toJSON: { getters: true },
  toObject: { getters: true }
});

// ============================================
// 🆕 SUB-SCHEMA: DETALHES (SUBSTITUI O OBJETO INLINE)
// Isso é o que resolve o problema de criptografia
// ============================================
const DetalhesSchema = new mongoose.Schema({
  testemunhas: { 
    type: [String],
    set: (arr) => Array.isArray(arr) ? arr.map(v => v ? criptografar(v) : v) : arr,
    get: (arr) => Array.isArray(arr) ? arr.map(v => v ? descriptografar(v) : v) : arr
  },
  descricaoOcorrido: { type: String, set: criptografar, get: descriptografar },
  nomeResponsavel: { type: String, set: criptografar, get: descriptografar },
  parentescoResponsavel: { type: String, set: criptografar, get: descriptografar },
  telefoneResponsavel: { type: String, set: criptografar, get: descriptografar },
  compareceu: { type: Boolean, default: false },
  nomeProfessor: { type: String, set: criptografar, get: descriptografar },
  disciplina: { type: String, set: criptografar, get: descriptografar },
  dataInicioSuspensao: Date,
  dataFimSuspensao: Date,
  diasSuspensao: Number,
  encaminhadoPara: { type: String, set: criptografar, get: descriptografar },
  motivoEncaminhamento: { type: String, set: criptografar, get: descriptografar },
  agendadoPara: Date,
  tipoTarefaOutros: { type: String, set: criptografar, get: descriptografar },
  providenciasTomadas: { type: String, set: criptografar, get: descriptografar },
  proximosPassos: { type: String, set: criptografar, get: descriptografar },
  tiposTarefaAdicionais: { type: [String], default: [] }
}, {
  _id: false,
  toJSON: { getters: true },
  toObject: { getters: true }
});

// ============================================
// SCHEMA PRINCIPAL
// ============================================
const AtendimentoSupervisaoSchema = new mongoose.Schema({
  alunoId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  alunoNome: { type: String, required: true },
  alunoMatricula: String,
  alunoTurma: String,
  alunoCurso: String,
  alunoFoto: String,
  
  tipoTarefa: {
    type: String,
    enum: [
      'advertencia_verbal', 'advertencia_escrita', 'atendimento_aluno',
      'atendimento_responsavel', 'atendimento_professor', 'suspensao',
      'encaminhamento', 'outros'
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
    assinaturaBase64: { type: String, default: '', set: criptografar, get: descriptografar },
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
    sessaoAssinaturaId: { type: String, default: null },
    participantes: { type: [ParticipanteSchema], default: [] }
  },
  
  // 🆕 USO DO SUBSCHEMA DetalhesSchema (antes era objeto inline)
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
AtendimentoSupervisaoSchema.virtual('tiposTarefaCompleto').get(function() {
  const adicionais = this.detalhes?.tiposTarefaAdicionais || [];
  return [this.tipoTarefa, ...adicionais].filter(Boolean);
});

// Índices
AtendimentoSupervisaoSchema.index({ alunoId: 1, status: 1 });
AtendimentoSupervisaoSchema.index({ tipoTarefa: 1, createdAt: -1 });
AtendimentoSupervisaoSchema.index({ alunoTurma: 1, createdAt: -1 });
AtendimentoSupervisaoSchema.index({ createdAt: -1 });
AtendimentoSupervisaoSchema.index({ temRemarcacaoPendente: 1, status: 1 });
AtendimentoSupervisaoSchema.index({ 'remarcacoes.status': 1 });
AtendimentoSupervisaoSchema.index({ 'entrada.statusAssinatura': 1, createdAt: -1 });
AtendimentoSupervisaoSchema.index({ status: 1, 'entrada.dataHora': 1, ultimoAlerta24h: 1 });

// Pre-save
AtendimentoSupervisaoSchema.pre('save', function(next) {
  if (this.entrada) {
    const temAssinaturaReal = !!(this.entrada.assinaturaBase64 && this.entrada.assinaturaBase64.length > 100);
    this.entrada.temAssinatura = temAssinaturaReal;
    
    if (temAssinaturaReal) {
      this.entrada.statusAssinatura = 'assinada';
      if (!this.entrada.assinadaEm) this.entrada.assinadaEm = new Date();
    } else if (this.entrada.statusAssinatura !== 'pendente') {
      this.entrada.statusAssinatura = 'nao_necessaria';
    }
    
    if (Array.isArray(this.entrada.participantes)) {
      this.entrada.participantes.forEach(p => {
        const temAssinaturaPart = !!(p.assinaturaBase64 && p.assinaturaBase64.length > 100);
        p.temAssinatura = temAssinaturaPart;
        if (temAssinaturaPart && !p.assinadaEm) p.assinadaEm = new Date();
      });
    }
  }
  
  this.updatedAt = new Date();
  next();
});

// Métodos estáticos
AtendimentoSupervisaoSchema.statics.alunoEmAtendimento = async function(alunoId) {
  return !!(await this.findOne({ alunoId, status: 'em_andamento' }));
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

AtendimentoSupervisaoSchema.statics.buscarAtendimentosParaAlerta = async function() {
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
  });
};

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

module.exports = mongoose.model(
  'AtendimentoSupervisao',
  AtendimentoSupervisaoSchema,
  'atendimentosupervisaos'
);