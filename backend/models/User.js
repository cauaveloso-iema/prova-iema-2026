// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  nome: {
    type: String,
    required: [true, 'Nome é obrigatório'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email é obrigatório'],
    unique: true,
    lowercase: true,
    trim: true,
    validate: {
      validator: function(v) {
        return v.endsWith('@iemasaoluiscentro.net');
      },
      message: 'Email deve ser institucional (@iemasaoluiscentro.net)'
    }
  },
  cpf: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    validate: {
      validator: function(v) {
        if (!v) return true;
        const cpfNumeros = v.replace(/\D/g, '');
        return cpfNumeros.length === 11;
      },
      message: 'CPF deve ter 11 dígitos'
    }
  },
  telefone: {
    type: String,
    required: [true, 'Telefone é obrigatório'],
    trim: true,
    validate: {
      validator: function(v) {
        if (!v) return false;
        const telefoneNumeros = v.replace(/\D/g, '');
        return telefoneNumeros.length === 10 || telefoneNumeros.length === 11;
      },
      message: 'Telefone inválido. Deve ter 10 ou 11 dígitos (com DDD)'
    }
  },
  password: {
    type: String,
    required: [true, 'Senha é obrigatória'],
    minlength: 6,
    select: false
  },

  ativo: {
    type: Boolean,
    default: true,
    description: 'Indica se o usuário está ativo no sistema'
  },

  passwordChangedAt: {
      type: Date,
      default: null
  },
  
  forcePasswordChange: {
      type: Boolean,
      default: false
  },

  onesignalPlayerId: {
    type: String,
    default: null
  },
  ultimaValidacaoPush: {
    type: Date,
    default: null
  },
  
  role: {
    type: String,
    enum: ['aluno', 'professor', 'admin', 'super_admin', 'setor_pedagogico','coordenacao_patio','cozinha', 'gestao_geral', 'enfermaria','supervisao','psicologia','assistente-social','protagonismo','biblioteca', 'secretaria','recepcao'],
    default: 'aluno'
  },

  tokenExpired: { type: Boolean, default: false },

  // ========== CAMPOS DE PERFIL COMPLETO ==========
  fotoPerfil: {
    type: String,
    default: null,
    description: 'URL da foto de perfil do usuário (armazenada em Base64)'
  },
  
  fotoPerfilTipo: {
    type: String,
    default: null,
    description: 'Tipo da imagem (image/jpeg, image/png, etc)'
  },
  
  bio: {
    type: String,
    default: null,
    trim: true,
    maxlength: 500
  },
  
  dataNascimento: {
    type: Date,
    default: null
  },
  
  genero: {
    type: String,
    enum: ['masculino', 'feminino', 'outro', null],
    default: null,
    set: v => (v === '' || v === undefined) ? null : v
  },
  
  endereco: {
    type: String,
    default: null,
    trim: true
  },
  
  cidade: {
    type: String,
    default: null,
    trim: true
  },
  
  estado: {
    type: String,
    default: null,
    trim: true,
    uppercase: true,
    maxlength: 2
  },
  
  cep: {
    type: String,
    default: null,
    trim: true
  },
  
  instagram: {
    type: String,
    default: null,
    trim: true
  },
  
  linkedin: {
    type: String,
    default: null,
    trim: true
  },
  
  website: {
    type: String,
    default: null,
    trim: true
  },
  
  interesses: {
    type: [String],
    default: []
  },
  
  preferenciasNotificacao: {
    type: Object,
    default: {
      email: true,
      push: true,
      whatsapp: false,
      lembreteProvas: true,
      resultadoProvas: true,
      novidades: false
    }
  },
  
  ultimaAtualizacaoPerfil: {
    type: Date,
    default: null
  },
  
  ultimoLoginDispositivo: {
    type: String,
    default: null
  },

  // ========== QR CODE DO USUÁRIO ==========
  qrCodeUsuario: {
    type: String,
    default: null,
    select: false
  },
  
  qrCodeUsuarioGeradoEm: {
    type: Date,
    default: null
  },
  
  qrCodeUsuarioTipo: {
    type: String,
    enum: ['aluno', 'professor', 'admin', 'super_admin', 'setor_pedagogico', 'coordenacao_patio', 'cozinha', 'gestao_geral', 'enfermaria','supervisao','psicologia','assistente-social','protagonismo','biblioteca', 'secretaria', 'recepcao', null],
    default: null,
    set: v => (v === '' || v === undefined) ? null : v
  },

  // ========== PERFIL ALIMENTAR ==========
  perfilAlimentar: {
      type: String,
      enum: ['sempre', 'as_vezes', 'nunca', 'nao_informado'],
      default: 'nao_informado',
      set: v => (v === '' || v === undefined) ? 'nao_informado' : v
  },
  refeicoesQueParticipa: {
      type: [String],
      enum: ['manha', 'almoco', 'tarde'],
      default: []
  },

  // ========== CAMPOS DE SUPERUSUÁRIO ==========
  isSuperUser: {
    type: Boolean,
    default: false
  },
  superUserPermissions: {
    type: [String],
    enum: [
      'manage_users',
      'manage_professors',
      'manage_turmas',
      'manage_provas',
      'view_logs',
      'manage_backups',
      'manage_system',
      'manage_acessibilidade'
    ],
    default: []
  },
  superUserCreatedAt: {
    type: Date
  },
  superUserCreatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  superUserApprovedAt: {
    type: Date
  },
  superUserApprovedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  superUserLastAction: {
    type: Date
  },
  
  // ========== EIXO DINÂMICO (SEM ENUM) ==========
  eixo: {
    type: String,
    default: null,
    trim: true,
    set: v => (v === '' || v === undefined) ? null : v
  },
  
  matricula: {
    type: String,
    unique: true,
    sparse: true
  },
  
  turma: {
    type: String,
    default: null,
    set: v => (v === '' || v === undefined) ? null : v
  },
  
  turmas: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Turma'
  }],
  
  // ========== CAMPOS DE ACESSIBILIDADE ==========
  precisaAcessibilidade: {
    type: Boolean,
    default: false
  },
  
  // 🔥 CORREÇÃO: Aceita null E converte '' automaticamente para null
  condicaoAcessibilidade: {
    type: String,
    enum: ['visual', 'auditiva', 'motora', 'intelectual', 'dislexia', 'tdah', 'outra', null],
    default: null,
    set: v => (v === '' || v === undefined) ? null : v
  },
  
  outraCondicao: {
    type: String,
    default: null,
    trim: true,
    set: v => (v === '' || v === undefined) ? null : v
  },
  
  dataSolicitacaoAcessibilidade: {
    type: Date,
    default: null
  },
  
  acessibilidadeAprovadaPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  curso: {
    type: String,
    default: null,
    set: v => (v === '' || v === undefined) ? null : v
  },
  
  periodo: {
    type: String,
    default: null,
    set: v => (v === '' || v === undefined) ? null : v
  },
  
  departamento: {
    type: String,
    default: null,
    set: v => (v === '' || v === undefined) ? null : v
  },
  
  titulacao: {
    type: String,
    default: null,
    set: v => (v === '' || v === undefined) ? null : v
  },
  
  atribuicoes: {
    type: String,
    default: null,
    set: v => (v === '' || v === undefined) ? null : v
  },
  
  // ========== CAMPOS ADICIONAIS PARA PERFIS ESPECÍFICOS ==========
  especialidade: {
    type: String,
    default: null,
    set: v => (v === '' || v === undefined) ? null : v
  },
  
  crp: {
    type: String,
    default: null,
    set: v => (v === '' || v === undefined) ? null : v
  },
  
  cress: {
    type: String,
    default: null,
    set: v => (v === '' || v === undefined) ? null : v
  },
  
  coren: {
    type: String,
    default: null,
    set: v => (v === '' || v === undefined) ? null : v
  },
  
  // ========== CAMPOS DE CONTROLE DE LOGIN E 2FA ==========
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: {
    type: Date
  },
  lastLogin: {
    type: Date
  },
  
  // 🔥 NOVO: Última vez que o usuário teve atividade (atualizado a cada requisição)
  lastActive: {
    type: Date,
    default: null
  },
  
  // 🔥 NOVO: Último logout EXPLÍCITO (só quando o usuário clica em "Sair")
  ultimoLogout: {
    type: Date,
    default: null
  },
  
  // 🔥 NOVO: Contador de versão do token (para reset global)
  tokenVersion: {
    type: Number,
    default: 0
  },
  
  // ========== CAMPOS PARA 2FA ==========
  telefoneVerificado: {
    type: Boolean,
    default: false
  },
  
  twoFactorEnabled: {
    type: Boolean,
    default: false
  },
  
  twoFactorSecret: {
    type: String,
    select: false
  },
  
  twoFactorBackupCodes: {
    type: [String],
    select: false
  },

  twoFactorBackupCodesShown: {
    type: Boolean,
    default: false
  },
  
  twoFactorTempSecret: {
    type: String,
    select: false
  },

  // 🔥 NOVO: Código SMS atual (separado do twoFactorTempSecret para
  //    não sobrescrever o secret TOTP quando o usuário ativa os dois)
  twoFactorSecretSms: {
    type: String,
    select: false
  },
  
  lastOtpRequest: {
    type: Date,
    default: null
  },
  
  otpRequestCount: {
    type: Number,
    default: 0
  },
  
  dataAtivacao2FA: {
    type: Date,
    default: null
  },
  
  dataCadastro: {
    type: Date,
    default: Date.now
  },

  // ========== CONSENTIMENTO LGPD ==========
  lgpdConsent: {
    type: Boolean,
    default: false,
    description: 'Indica se o usuário aceitou a Política de Privacidade (LGPD)'
  },

  lgpdConsentAt: {
    type: Date,
    default: null,
    description: 'Data/hora em que o consentimento LGPD foi registrado'
  },

  lgpdConsentIp: {
    type: String,
    default: null,
    description: 'Endereço IP do usuário no momento do consentimento LGPD (auditoria)'
  }
}, {
  timestamps: true
});


// ============================================
// MIDDLEWARE: Formatar CPF e TELEFONE antes de salvar
// ============================================
UserSchema.pre('save', async function(next) {
  if (this.cpf) {
    this.cpf = this.cpf.replace(/\D/g, '');
  }
  
  if (this.telefone) {
    this.telefone = this.telefone.replace(/\D/g, '');
  }
  
  if (this.email) {
    this.email = this.email.toLowerCase().trim();
    
    if (!this.email.includes('@')) {
      this.email = this.email + '@iemasaoluiscentro.net';
    }
  }
  
  // 🔥 LIMPEZA GERAL: Converter strings vazias em null para campos opcionais
  const camposOpcionais = [
    'condicaoAcessibilidade',
    'outraCondicao',
    'genero',
    'eixo',
    'turma',
    'curso',
    'periodo',
    'departamento',
    'titulacao',
    'atribuicoes',
    'especialidade',
    'crp',
    'cress',
    'coren',
    'fotoPerfil',
    'fotoPerfilTipo',
    'bio',
    'endereco',
    'cidade',
    'estado',
    'cep',
    'instagram',
    'linkedin',
    'website',
    'ultimoLoginDispositivo',
    'lgpdConsentIp'
  ];
  
  camposOpcionais.forEach(campo => {
    if (this[campo] === '') {
      this[campo] = null;
    }
  });
  
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// ============================================
// MÉTODO: Comparar senha
// ============================================
UserSchema.methods.comparePassword = async function(candidatePassword) {
    try {
        if (!candidatePassword || typeof candidatePassword !== 'string') {
            console.error('❌ comparePassword: candidatePassword inválido:', candidatePassword);
            return false;
        }
        
        if (!this.password) {
            console.error('❌ comparePassword: this.password não existe');
            return false;
        }
        
        return await bcrypt.compare(candidatePassword, this.password);
    } catch (error) {
        console.error('❌ Erro em comparePassword:', error);
        return false;
    }
};

// ============================================
// MÉTODO: Verificar se conta está bloqueada
// ============================================
UserSchema.methods.isLocked = function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

// ============================================
// MÉTODO: Incrementar tentativas de login
// ============================================
UserSchema.methods.incLoginAttempts = async function() {
  if (this.lockUntil && this.lockUntil < Date.now()) {
    this.loginAttempts = 1;
    this.lockUntil = undefined;
    return await this.save();
  }
  
  this.loginAttempts += 1;
  
  if (this.loginAttempts >= 5) {
    this.lockUntil = Date.now() + 15 * 60 * 1000;
  }
  
  return await this.save();
};

// ============================================
// MÉTODO ESTÁTICO: Buscar por CPF
// ============================================
UserSchema.statics.findByCPF = async function(cpf) {
  const cpfNumeros = cpf.replace(/\D/g, '');
  return await this.findOne({ cpf: cpfNumeros });
};

// ============================================
// MÉTODO ESTÁTICO: Buscar por Telefone
// ============================================
UserSchema.statics.findByTelefone = async function(telefone) {
  const telefoneNumeros = telefone.replace(/\D/g, '');
  return await this.findOne({ telefone: telefoneNumeros });
};

// ============================================
// VIRTUAL: CPF formatado
// ============================================
UserSchema.virtual('cpfFormatado').get(function() {
  if (!this.cpf) return '';
  
  const cpf = this.cpf.replace(/\D/g, '');
  if (cpf.length !== 11) return cpf;
  
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
});

// ============================================
// VIRTUAL: Telefone formatado
// ============================================
UserSchema.virtual('telefoneFormatado').get(function() {
  if (!this.telefone) return '';
  
  const telefone = this.telefone.replace(/\D/g, '');
  
  if (telefone.length === 10) {
    return telefone.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  } else if (telefone.length === 11) {
    return telefone.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  }
  
  return telefone;
});

// ============================================
// CONFIGURAÇÃO: Incluir virtuais no JSON
// ============================================
UserSchema.set('toJSON', { virtuals: true });
UserSchema.set('toObject', { virtuals: true });

// ============================================
// ÍNDICES para melhor performance
// ============================================
UserSchema.index({ email: 1 });
UserSchema.index({ cpf: 1 });
UserSchema.index({ telefone: 1 });
UserSchema.index({ matricula: 1 });
UserSchema.index({ role: 1 });
UserSchema.index({ precisaAcessibilidade: 1 });
UserSchema.index({ eixo: 1 });
UserSchema.index({ lastActive: -1 });
UserSchema.index({ lastLogin: -1 });
UserSchema.index({ lgpdConsent: 1 });
UserSchema.index({ lgpdConsentAt: -1 });

module.exports = mongoose.model('User', UserSchema);