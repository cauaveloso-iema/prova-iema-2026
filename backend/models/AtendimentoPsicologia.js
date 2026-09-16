const mongoose = require('mongoose');

// ============================================
// SUB-SCHEMA: REMARCAÇÃO
// ============================================
const RemarcacaoSchema = new mongoose.Schema({
  id: {
    type: mongoose.Schema.Types.ObjectId,
    default: () => new mongoose.Types.ObjectId()
  },
  dataRemarcacao: {
    type: String,  // Formato YYYY-MM-DD
    required: true
  },
  horarioRemarcacao: {
    type: String,  // Formato HH:MM
    required: true
  },
  motivoRemarcacao: {
    type: String,
    required: true,
    trim: true
  },
  observacoesRemarcacao: {
    type: String,
    default: '',
    trim: true
  },
  status: {
    type: String,
    enum: ['pendente', 'realizado', 'cancelado'],
    default: 'pendente'
  },
  criadaEm: {
    type: Date,
    default: Date.now
  },
  criadaPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  criadaPorNome: {
    type: String,
    default: ''
  },
  finalizadaEm: {
    type: Date,
    default: null
  },
  finalizadaPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, { _id: false });

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
  
  // Tipo de tarefa de psicologia
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
    descricao: { type: String, required: true },
    observacoes: String,
    gravidade: {
      type: String,
      enum: ['baixa', 'media', 'alta', 'critica'],
      default: 'media'
    },
    registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    registradoPorNome: String,
    // 🔥 NOVO: Assinatura digital
    assinaturaBase64: {
      type: String,
      default: ''
    }
  },
  
  detalhes: {
    contextoFamiliar: String,
    historicoAnterior: String,
    profissionaisEnvolvidos: [String],
    
    // Escuta de Acolhimento
    tipoEscuta: String,
    duracaoEscuta: Number,
    
    // Manejo de Crises Emocionais
    tipoCrise: String,
    acoesTomadas: String,
    encaminhamentoEmergencial: String,
    
    // Atividades em Grupos
    nomeAtividade: String,
    participantesAtividade: [String],
    localAtividade: String,
    duracaoAtividade: Number,
    
    // Ações e Atividades em Saúde
    temaAcao: String,
    publicoAlvo: String,
    localAcao: String,
    
    // Ações e Atividades Socioemocionais e Culturais
    temaSocioemocional: String,
    tipoAtividadeCultural: String,
    parceria: String,
    
    // Outros
    tipoTarefaOutros: String,
    
    // Comuns finais
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
  
  // 🔥 NOVO: Remarcações
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
AtendimentoPsicologiaSchema.index({ alunoId: 1, status: 1 });
AtendimentoPsicologiaSchema.index({ tipoTarefa: 1, createdAt: -1 });
AtendimentoPsicologiaSchema.index({ alunoTurma: 1, createdAt: -1 });
AtendimentoPsicologiaSchema.index({ createdAt: -1 });
AtendimentoPsicologiaSchema.index({ temRemarcacaoPendente: 1, status: 1 }); // 🔥 NOVO
AtendimentoPsicologiaSchema.index({ 'remarcacoes.status': 1 }); // 🔥 NOVO

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

// 🔥 NOVO: Método para adicionar remarcação
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

module.exports = mongoose.model('AtendimentoPsicologia', AtendimentoPsicologiaSchema);