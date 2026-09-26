// models/TermoVisita.js
const mongoose = require('mongoose');

const TermoVisitaSchema = new mongoose.Schema({
  // ============ IDENTIFICAÇÃO ============
  codigo: {
    type: String,
    unique: true,
    required: true,
    index: true
  },
  
  // ============ ALUNOS ============
  alunos: [{
    alunoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    nome: String,
    matricula: String,
    turma: String,
    curso: String,
    fotoPerfil: String
  }],
  
  totalAlunos: { type: Number, default: 1 },
  turmaPrincipal: String,
  cursoPrincipal: String,
  
  // ============ ATIVIDADE ============
  atividade: {
    type: String,
    required: true
  },
  
  // ============ PROFESSORES ============
  professores: [{
    professorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    nome: String,
    matricula: String,
    eixo: String
  }],
  
  // ============ PERÍODO E HORÁRIO ============
  periodo: { type: String, required: true },
  horario: { type: String, required: true },
  
  // ============ LOCAL ============
  local: { type: String, required: true },
  localizacao: {
    enderecoCompleto: String,
    latitude: Number,
    longitude: Number,
    placeId: String,
    cidade: String,
    estado: String
  },
  
  // ============ DATA ============
  dataVisita: { type: Date, required: true },
  cidade: { type: String, default: 'São Luís' },
  
  // ============ TOTP ============
  totpSecret: { type: String, default: null },
  totpVerified: { type: Boolean, default: false },
  totpVerifiedAt: { type: Date, default: null },
  totpCreatedAt: { type: Date, default: null },
  
  // ============ SMS (futuro) ============
  smsCode: { type: String, default: null },
  smsCodeExpiresAt: { type: Date, default: null },
  smsVerified: { type: Boolean, default: false },
  smsVerifiedAt: { type: Date, default: null },
  
  // ============ RESPONSÁVEIS ============
  // Dados já chegam aqui CRIPTOGRAFADOS do backend.
  // Não há set/get automático — quem criptografa é a rota.
  responsaveis: [{
    alunoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    alunoNome: String,
    
    nome: String,
    
    // 🔐 Já chegam criptografados aqui
    rg: String,
    cpf: String,
    telefone: String,
    email: String,
    
    // 🔍 Hash para busca
    cpfHash: { type: String, index: true },
    
    autenticado: { type: Boolean, default: false },
    autenticacaoData: Date,
    autenticacaoMetodo: {
      type: String,
      enum: ['sms', 'totp', 'ambos', null],
      default: null
    },
    
    codigoTemp: String,
    codigoExpira: Date,
    autenticacaoSMS: { type: Boolean, default: false },
    autenticacaoSMSData: Date,
    
    // 🔐 Já chega criptografado
    assinaturaBase64: String,
    assinaturaData: Date,
    
    // LGPD - Consentimento
    lgpdAceito: { type: Boolean, default: false },
    lgpdAceitoData: Date,
    lgpdVersao: { type: String, default: '1.0' },
    lgpdIp: String,
    lgpdUserAgent: String,
    
    // Geolocalização minimizada
    localizacaoAssinatura: {
      latitude: Number,
      longitude: Number,
      endereco: String,
      cidade: String,
      estado: String,
      accuracy: Number,
      timestamp: Date
    },
    
    status: {
      type: String,
      enum: ['pendente', 'autorizado', 'recusado'],
      default: 'pendente'
    },
    recusaData: Date,
    motivoRecusa: String
  }],
  
  // ============ STATUS GERAL ============
  status: {
    type: String,
    enum: ['pendente', 'parcialmente_autorizado', 'autorizado', 'recusado', 'expirado'],
    default: 'pendente',
    index: true
  },
  statusData: Date,
  
  // ============ ASSINATURA DO GESTOR ============
  assinaturaGestor: {
    base64: String,     // 🔐 Já criptografado
    nome: String,
    cargo: String,
    data: Date
  },
  
  // ============ CONTROLE ============
  criadoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  ativo: { type: Boolean, default: true },
  
  // ============ RETENÇÃO LGPD ============
  expiraEm: {
    type: Date,
    default: function() {
      const anos = parseInt(process.env.RETENCAO_VISITAS_ANOS || '2');
      const d = new Date();
      d.setFullYear(d.getFullYear() + anos);
      return d;
    },
    index: true
  },
  
  anonimizado: { type: Boolean, default: false, index: true },
  anonimizadoEm: Date
  
}, { timestamps: true });

// ============================================
// ÍNDICES
// ============================================
TermoVisitaSchema.index({ 'alunos.alunoId': 1, status: 1 });
TermoVisitaSchema.index({ status: 1, createdAt: -1 });
TermoVisitaSchema.index({ codigo: 1 });
TermoVisitaSchema.index({ 'responsaveis.cpfHash': 1 });
TermoVisitaSchema.index({ expiraEm: 1, anonimizado: 1 });

// ============================================
// MÉTODOS ESTÁTICOS
// ============================================
TermoVisitaSchema.statics.gerarCodigo = async function() {
  const ano = new Date().getFullYear();
  let tentativas = 0;
  
  while (tentativas < 10) {
    const random = Math.floor(1000 + Math.random() * 9000);
    const codigo = `VIS-${ano}-${random}`;
    
    const existe = await this.findOne({ codigo });
    if (!existe) return codigo;
    
    tentativas++;
  }
  
  return `VIS-${ano}-${Date.now()}`;
};

// ============================================
// MÉTODOS DE INSTÂNCIA
// ============================================
TermoVisitaSchema.methods.atualizarStatusGeral = function() {
  if (!this.responsaveis || this.responsaveis.length === 0) {
    this.status = 'pendente';
    this.statusData = new Date();
    return;
  }
  
  const autorizados = this.responsaveis.filter(r => r.status === 'autorizado').length;
  const recusados = this.responsaveis.filter(r => r.status === 'recusado').length;
  const total = this.responsaveis.length;
  
  if (autorizados === total) {
    this.status = 'autorizado';
  } else if (autorizados + recusados === total) {
    if (autorizados > 0) {
      this.status = 'parcialmente_autorizado';
    } else {
      this.status = 'recusado';
    }
  } else {
    this.status = 'pendente';
  }
  
  this.statusData = new Date();
};

TermoVisitaSchema.methods.anonimizar = function() {
  this.responsaveis.forEach(r => {
    r.nome = 'ANONIMIZADO';
    r.rg = null;
    r.cpf = null;
    r.cpfHash = null;
    r.telefone = null;
    r.email = null;
    r.assinaturaBase64 = null;
    r.localizacaoAssinatura = null;
    r.lgpdIp = null;
    r.lgpdUserAgent = null;
  });
  
  this.assinaturaGestor = null;
  this.anonimizado = true;
  this.anonimizadoEm = new Date();
  
  return this;
};

module.exports = mongoose.model('TermoVisita', TermoVisitaSchema);