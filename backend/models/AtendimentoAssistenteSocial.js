const mongoose = require('mongoose');

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
  
  // Tipo de tarefa de assistente social
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
  
  // Dados da entrada/registro
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
    registradoPorNome: String
  },
  
  // Campos específicos por tipo
  detalhes: {
    // Comuns
    contextoFamiliar: String,
    historicoAnterior: String,
    profissionaisEnvolvidos: [String],
    condicaoSocial: String,
    
    // Encaminhamento
    encaminhadoPara: String,
    motivoEncaminhamento: String,
    agendadoPara: Date,
    
    // Intervenção
    tipoIntervencao: String,
    metodosUtilizados: String,
    duracaoSessao: Number,
    
    // Atendimento
    modalidadeAtendimento: String,
    participantesAtendimento: [String],
    
    // Outros
    tipoTarefaOutros: String,
    
    // Comuns finais
    providenciasTomadas: String,
    proximosPassos: String
  },
  
  // Dados da saída/conclusão
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
AtendimentoAssistenteSocialSchema.index({ alunoId: 1, status: 1 });
AtendimentoAssistenteSocialSchema.index({ tipoTarefa: 1, createdAt: -1 });
AtendimentoAssistenteSocialSchema.index({ alunoTurma: 1, createdAt: -1 });
AtendimentoAssistenteSocialSchema.index({ createdAt: -1 });

// Métodos estáticos
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

module.exports = mongoose.model('AtendimentoAssistenteSocial', AtendimentoAssistenteSocialSchema);