// ============================================
// MODEL: ACOMPANHAMENTO COMPARTILHADO
// Log de compartilhamento entre setores (opcional)
// ============================================
const mongoose = require('mongoose');

const AcompanhamentoCompartilhadoSchema = new mongoose.Schema({
  alunoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  alunoNome: { type: String, required: true },
  alunoMatricula: String,
  alunoTurma: String,
  alunoCurso: String,

  setorOrigem: {
    type: String,
    enum: ['gestao', 'assistente_social', 'psicologia', 'supervisao'],
    required: true,
    index: true
  },

  tipoRegistro: {
    type: String,
    enum: ['atraso', 'ocorrencia', 'atendimento', 'remarcacao'],
    required: true
  },

  resumo: {
    motivo: String,
    tipoTarefa: String,
    tipoTarefaLabel: String,
    data: Date,
    descricaoBreve: String,
    quantidade: Number,
    temAssinatura: Boolean,
    temRemarcacao: Boolean
  },

  referenciaId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  referenciaModel: {
    type: String,
    enum: ['Atraso', 'AtendimentoAssistenteSocial', 'AtendimentoPsicologia', 'AtendimentoSupervisao'],
    required: true
  },

  visualizadoPor: [{
    setor: String,
    userId: mongoose.Schema.Types.ObjectId,
    dataVisualizacao: { type: Date, default: Date.now }
  }],

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

AcompanhamentoCompartilhadoSchema.index({ alunoId: 1, createdAt: -1 });
AcompanhamentoCompartilhadoSchema.index({ setorOrigem: 1, createdAt: -1 });

module.exports = mongoose.model('AcompanhamentoCompartilhado', AcompanhamentoCompartilhadoSchema);