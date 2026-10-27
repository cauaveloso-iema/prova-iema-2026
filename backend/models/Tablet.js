// ============================================================================
// MODEL - Tablet
// ============================================================================
// Descrição: Registro de tablets entregues aos responsáveis/setores
// ============================================================================

const mongoose = require('mongoose');

const tabletSchema = new mongoose.Schema({
  // ========== IDENTIFICAÇÃO DO TABLET ==========
  numero: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  
  marca: {
    type: String,
    trim: true,
    default: ''
  },
  
  modelo: {
    type: String,
    trim: true,
    default: ''
  },
  
  imei: {
    type: String,
    trim: true,
    default: ''
  },
  
  patrimonio: {
    type: String,
    trim: true,
    default: ''
  },
  
  // ========== SETOR / RESPONSÁVEL ==========
  setor: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  
  setorLabel: {
    type: String,
    trim: true,
    default: ''
  },
  
  // ========== RESPONSÁVEL (quem recebe) ==========
  responsavelId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  responsavelNome: {
    type: String,
    required: true,
    trim: true
  },
  
  responsavelEmail: {
    type: String,
    trim: true,
    default: ''
  },
  
  responsavelMatricula: {
    type: String,
    trim: true,
    default: ''
  },
  
  responsavelRole: {
    type: String,
    trim: true,
    default: ''
  },
  
  responsavelCargo: {
    type: String,
    trim: true,
    default: ''
  },
  
  // ========== STATUS ==========
  status: {
    type: String,
    enum: ['pendente', 'entregue', 'devolvido', 'manutencao', 'perdido'],
    default: 'pendente',
    index: true
  },
  
  // ========== TERMO DE ENTREGA / ASSINATURA ==========
  termo: {
    sessaoId: { type: String, default: null, index: true },
    assinaturaBase64: { type: String, default: null },
    assinadaPorNome: { type: String, default: null },
    assinadaPorCpf: { type: String, default: null },
    assinadaEm: { type: Date, default: null },
    temAssinatura: { type: Boolean, default: false },
    aceiteTermo: { type: Boolean, default: false },
    dataAceite: { type: Date, default: null },
    ipAceite: { type: String, default: null },
    userAgentAceite: { type: String, default: null }
  },
  
  // ========== IMPRESSÃO ==========
  solicitouImpressao: {
    type: Boolean,
    default: false,
    index: true
  },
  
  impressoEm: {
    type: Date,
    default: null
  },
  
  impressoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  impressoPorNome: {
    type: String,
    default: null
  },
  
  totalImpressoes: {
    type: Number,
    default: 0
  },
  
  // ========== ENTREGA ==========
  dataEntrega: {
    type: Date,
    default: null,
    index: true
  },
  
  entreguePor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  entreguePorNome: {
    type: String,
    default: null
  },
  
  // ========== DEVOLUÇÃO ==========
  dataDevolucao: {
    type: Date,
    default: null
  },
  
  devolvidoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  devolvidoPorNome: {
    type: String,
    default: null
  },
  
  motivoDevolucao: {
    type: String,
    trim: true,
    default: ''
  },
  
  // ========== OBSERVAÇÕES ==========
  observacoes: {
    type: String,
    trim: true,
    default: ''
  },
  
  // ========== AUDITORIA ==========
  registradoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  registradoPorNome: {
    type: String,
    required: true
  },
  
  atualizadoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  atualizadoPorNome: {
    type: String,
    default: null
  }
  
}, {
  timestamps: true,
  collection: 'tablets'
});

// ========== ÍNDICES ==========
tabletSchema.index({ numero: 1, setor: 1 });
tabletSchema.index({ responsavelId: 1, status: 1 });
tabletSchema.index({ 'termo.temAssinatura': 1, status: 1 });
tabletSchema.index({ createdAt: -1 });

// ========== MÉTODOS ==========
tabletSchema.methods.registrarAssinatura = function(dados) {
  this.termo = {
    ...this.termo,
    ...dados,
    temAssinatura: true,
    assinadaEm: dados.assinadaEm || new Date()
  };
  
  if (this.status === 'pendente') {
    this.status = 'entregue';
    this.dataEntrega = this.dataEntrega || new Date();
  }
  
  return this.save();
};

tabletSchema.methods.registrarImpressao = function(usuarioId, usuarioNome) {
  this.solicitouImpressao = true;
  this.impressoEm = new Date();
  this.impressoPor = usuarioId;
  this.impressoPorNome = usuarioNome;
  this.totalImpressoes = (this.totalImpressoes || 0) + 1;
  return this.save();
};

// ========== EXPORT ==========
module.exports = mongoose.model('Tablet', tabletSchema);