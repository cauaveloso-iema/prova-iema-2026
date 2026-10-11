const mongoose = require('mongoose');
const { criptografar, descriptografar } = require('../utils/criptografia');

const AtendimentoEnfermariaSchema = new mongoose.Schema({
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
  
  // ============================================
  // DADOS DA ENTRADA
  // ============================================
  entrada: {
    dataHora: { type: Date, default: Date.now },
    
    // 🔐 Criptografados
    queixa: { 
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
    
    registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    registradoPorNome: String,
    
    // Auditoria de edição
    editadoEm: { type: Date, default: null },
    editadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    editadoPorNome: { type: String, default: null }
  },
  
  // ============================================
  // DADOS DA SAÍDA
  // ============================================
  saida: {
    dataHora: Date,
    desfecho: {
      type: String,
      enum: ['retornou_sala', 'encaminhado_gestao', 'liberado_responsavel', 'liberado_coordenador', 'outros'],
      required: false
    },
    desfechoOutrosTexto: String,
    coordenadorPatioNome: String,
    
    // 🔐 Criptografado
    observacoes: { 
      type: String,
      set: criptografar,
      get: descriptografar
    },
    
    registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    registradoPorNome: String,
    
    // Auditoria de edição
    editadoEm: { type: Date, default: null },
    editadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    editadoPorNome: { type: String, default: null }
  },
  
  // Status do atendimento
  status: {
    type: String,
    enum: ['em_atendimento', 'finalizado'],
    default: 'em_atendimento'
  },
  
  // ============================================
  // 🆕 CONTROLE DE ALERTAS DE 24H
  // ============================================
  ultimoAlerta24h: {
    type: Date,
    default: null,
    index: true
  },
  totalAlertas24h: {
    type: Number,
    default: 0
  },
  alerta24hReconhecido: {
    type: Boolean,
    default: false
  },
  
  // Metadados
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  // 🔑 ESSENCIAL para descriptografar automaticamente
  toJSON: { getters: true },
  toObject: { getters: true }
});

// ============================================
// ÍNDICES
// ============================================
AtendimentoEnfermariaSchema.index({ alunoId: 1, status: 1 });
AtendimentoEnfermariaSchema.index({ alunoTurma: 1, createdAt: -1 });
AtendimentoEnfermariaSchema.index({ createdAt: -1 });
// 🆕 Índice para busca de atendimentos antigos
AtendimentoEnfermariaSchema.index({ status: 1, 'entrada.dataHora': 1, ultimoAlerta24h: 1 });

// ============================================
// MÉTODOS ESTÁTICOS
// ============================================
AtendimentoEnfermariaSchema.statics.alunoEmAtendimento = async function(alunoId) {
  const atendimento = await this.findOne({ alunoId, status: 'em_atendimento' });
  return !!atendimento;
};

AtendimentoEnfermariaSchema.statics.getAtendimentoAtivo = async function(alunoId) {
  return await this.findOne({ alunoId, status: 'em_atendimento' }).sort({ createdAt: -1 });
};

// ============================================
// 🆕 BUSCAR ATENDIMENTOS QUE PRECISAM DE ALERTA 24H
// ============================================
AtendimentoEnfermariaSchema.statics.buscarAtendimentosParaAlerta = async function() {
  const agora = new Date();
  const limite24h = new Date(agora.getTime() - 24 * 60 * 60 * 1000);
  const intervaloAlerta = new Date(agora.getTime() - 20 * 60 * 1000);
  
  return await this.find({
    status: 'em_atendimento',
    alerta24hReconhecido: false,
    'entrada.dataHora': { $lte: limite24h },
    $or: [
      { ultimoAlerta24h: null },
      { ultimoAlerta24h: { $lte: intervaloAlerta } }
    ]
  });
};

module.exports = mongoose.model('AtendimentoEnfermaria', AtendimentoEnfermariaSchema);