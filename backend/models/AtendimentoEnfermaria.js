const mongoose = require('mongoose');

const AtendimentoEnfermariaSchema = new mongoose.Schema({
  alunoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  alunoNome: {
    type: String,
    required: true
  },
  alunoMatricula: String,
  alunoTurma: String,
  alunoCurso: String,
  alunoFoto: String,
  
  // Dados da entrada
  entrada: {
    dataHora: { type: Date, default: Date.now },
    queixa: { type: String, required: true },
    observacoes: String,
    registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    registradoPorNome: String
  },
  
  // Dados da saída (preenchido quando finalizado)
  saida: {
    dataHora: Date,
    desfecho: {
      type: String,
      enum: ['retornou_sala', 'encaminhado_gestao', 'liberado_responsavel', 'liberado_coordenador', 'outros'],
      required: false
    },
    desfechoOutrosTexto: String,
    coordenadorPatioNome: String, // Nome do coordenador de pátio quando liberado com ele
    observacoes: String,
    registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    registradoPorNome: String
  },
  
  // Status do atendimento
  status: {
    type: String,
    enum: ['em_atendimento', 'finalizado'],
    default: 'em_atendimento'
  },
  
  // Metadados
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Índices para buscas eficientes
AtendimentoEnfermariaSchema.index({ alunoId: 1, status: 1 });
AtendimentoEnfermariaSchema.index({ alunoTurma: 1, createdAt: -1 });
AtendimentoEnfermariaSchema.index({ createdAt: -1 });

// Método para verificar se aluno está em atendimento
AtendimentoEnfermariaSchema.statics.alunoEmAtendimento = async function(alunoId) {
  const atendimento = await this.findOne({ 
    alunoId, 
    status: 'em_atendimento' 
  });
  return !!atendimento;
};

// Método para buscar atendimento ativo de um aluno
AtendimentoEnfermariaSchema.statics.getAtendimentoAtivo = async function(alunoId) {
  return await this.findOne({ 
    alunoId, 
    status: 'em_atendimento' 
  }).sort({ createdAt: -1 });
};

module.exports = mongoose.model('AtendimentoEnfermaria', AtendimentoEnfermariaSchema);