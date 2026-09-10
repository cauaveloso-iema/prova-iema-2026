const mongoose = require('mongoose');

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
  
  // Tipo de tarefa de supervisão
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

AtendimentoSupervisaoSchema.index({ alunoId: 1, status: 1 });
AtendimentoSupervisaoSchema.index({ tipoTarefa: 1, createdAt: -1 });
AtendimentoSupervisaoSchema.index({ alunoTurma: 1, createdAt: -1 });
AtendimentoSupervisaoSchema.index({ createdAt: -1 });

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

module.exports = mongoose.model('AtendimentoSupervisao', AtendimentoSupervisaoSchema);