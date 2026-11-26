// models/Acolhedor.js
const mongoose = require('mongoose');

// ============================================
// MODEL: ACOLHEDOR (Protagonismo)
// Alunos inscritos para serem acolhedores
// ============================================

const AcolhedorSchema = new mongoose.Schema({
  // Vínculo com aluno cadastrado
  alunoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  // Dados pessoais
  nomeCompleto: { type: String, required: true },
  dataNascimento: { type: Date, required: true },
  matricula: { type: String, default: '' },
  turma: { type: String, required: true },
  curso: { type: String, required: true },
  fotoPerfil: { type: String, default: '' },

  // Contato
  email: { type: String, default: '' },
  telefone: { type: String, default: '' },
  whatsapp: { type: String, default: '' },

  // Responsável (se menor)
  menorDeIdade: { type: Boolean, default: false },
  responsavelNome: { type: String, default: '' },
  responsavelTelefone: { type: String, default: '' },
  responsavelParentesco: { type: String, default: '' },

  // Motivação / disponibilidade
  porqueSerAcolhedor: { type: String, default: '' },
  disponibilidade: {
    type: [String],
    default: [] // ['manha', 'tarde', 'noite', 'integral']
  },
  aceitaTermos: { type: Boolean, required: true, default: false },
  aceitaLgpd: { type: Boolean, required: true, default: false },

  // Assinaturas digitais (base64 do canvas)
  assinatura: {
    aluno: { type: String, default: '' },
    responsavel: { type: String, default: '' },
    dataAssinatura: { type: Date, default: null }
  },

  // Status
  status: {
    type: String,
    enum: ['pendente', 'aprovado', 'rejeitado', 'cancelado'],
    default: 'pendente'
  },
  aprovadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  aprovadoPorNome: { type: String, default: '' },
  aprovadoEm: { type: Date, default: null },
  motivoRejeicao: { type: String, default: '' },

  // Origem
  origem: {
    type: String,
    enum: ['publico', 'painel'],
    default: 'publico'
  },
  ipRegistro: { type: String, default: '' },
  userAgent: { type: String, default: '' },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Índices
AcolhedorSchema.index({ alunoId: 1, status: 1 });
AcolhedorSchema.index({ turma: 1, status: 1 });
AcolhedorSchema.index({ curso: 1, status: 1 });
AcolhedorSchema.index({ status: 1, createdAt: -1 });
AcolhedorSchema.index({ nomeCompleto: 'text', turma: 'text', curso: 'text' });

// Estáticos
AcolhedorSchema.statics.jaInscrito = async function(alunoId) {
  if (!alunoId) return null;
  return this.findOne({
    alunoId,
    status: { $in: ['pendente', 'aprovado'] }
  });
};

AcolhedorSchema.statics.getStatusLabel = function(status) {
  const labels = {
    pendente: 'Pendente',
    aprovado: 'Aprovado',
    rejeitado: 'Rejeitado',
    cancelado: 'Cancelado'
  };
  return labels[status] || status;
};

AcolhedorSchema.statics.getDisponibilidadeLabel = function(valor) {
  const labels = {
    manha: 'Manhã',
    tarde: 'Tarde',
    noite: 'Noite',
    integral: 'Integral'
  };
  return labels[valor] || valor;
};

// Instância
AcolhedorSchema.methods.aprovar = async function(usuarioId, usuarioNome) {
  this.status = 'aprovado';
  this.aprovadoPor = usuarioId || null;
  this.aprovadoPorNome = usuarioNome || '';
  this.aprovadoEm = new Date();
  this.updatedAt = new Date();
  return this.save();
};

AcolhedorSchema.methods.rejeitar = async function(usuarioId, usuarioNome, motivo) {
  this.status = 'rejeitado';
  this.aprovadoPor = usuarioId || null;
  this.aprovadoPorNome = usuarioNome || '';
  this.aprovadoEm = new Date();
  this.motivoRejeicao = motivo || '';
  this.updatedAt = new Date();
  return this.save();
};

module.exports = mongoose.model('Acolhedor', AcolhedorSchema);