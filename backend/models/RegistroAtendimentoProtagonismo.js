// models/RegistroAtendimentoProtagonismo.js
const mongoose = require('mongoose');

const RegistroAtendimentoProtagonismoSchema = new mongoose.Schema({
  // Código gerado automaticamente (ex: ATP-20261126-001)
  codigoProtocolo: { type: String, unique: true },
  
  // Quem registrou
  registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  registradoPorNome: { type: String, required: true },

  // Dados do Aluno Atendido
  alunoId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  alunoNome: { type: String, required: true },
  alunoMatricula: { type: String, default: '' },
  alunoTurma: { type: String, default: '' },
  alunoCurso: { type: String, default: '' },

  // Detalhes do Atendimento
  dataAtendimento: { type: Date, required: true },
  categoriaAtendimento: { 
    type: String, 
    enum: ['pedagogico', 'disciplinar', 'orientacao', 'acolhimento', 'outros'],
    required: true 
  },
  categoriaOutrosDescricao: { type: String, default: '' },
  
  motivoPrincipal: { type: String, required: true },
  encaminhamentoRealizado: { type: String, default: '' },
  observacoesAdicionais: { type: String, default: '' },

  // Assinatura do Aluno (ou Responsável)
  assinaturaDigitalBase64: { type: String, default: null },
  assinadoPorNome: { type: String, default: '' },
  assinadoEm: { type: Date, default: null },

  // Controle de status
  statusRegistro: { type: String, enum: ['aberto', 'finalizado', 'cancelado'], default: 'finalizado' },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

RegistroAtendimentoProtagonismoSchema.index({ alunoId: 1, dataAtendimento: -1 });
RegistroAtendimentoProtagonismoSchema.index({ registradoPor: 1, dataAtendimento: -1 });
RegistroAtendimentoProtagonismoSchema.index({ dataAtendimento: -1 });

module.exports = mongoose.model('RegistroAtendimentoProtagonismo', RegistroAtendimentoProtagonismoSchema);