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
  // CAMPO CPF
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
  // CAMPO TELEFONE
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
      default: false  // false = não precisa trocar senha no login
  },

  onesignalPlayerId: {
    type: String,
    default: null
},

role: {
  type: String,
  enum: ['aluno', 'professor', 'admin', 'super_admin'], // <-- ADICIONADO super_admin
  default: 'aluno'
},

tokenExpired: { type: Boolean, default: false },

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
  
  // ========== ✅ EIXO CORRIGIDO COM TODOS OS VALORES ==========
  eixo: {
    type: String,
    enum: [
      'natureza',
      'humanas', 
      'linguagens',
      'desenvolvimento',
      'gestao',
      'producao',
      'turismo',
      'ambiente',
      null
    ],
    default: null
  },
  
  matricula: {
    type: String,
    unique: true,
    sparse: true
  },
  turma: {
    type: String,
    default: null
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
  
  condicaoAcessibilidade: {
    type: String,
    enum: ['visual', 'auditiva', 'motora', 'intelectual', 'dislexia', 'tdah', 'outra', null],
    default: null
  },
  
  outraCondicao: {
    type: String,
    default: null,
    trim: true
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
  
  // Para alunos
  curso: String,
  periodo: String,
  
  // Para professores
  departamento: String,
  titulacao: String,
  
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
  
  // ========== NOVOS CAMPOS PARA 2FA (ADICIONAR AQUI) ==========
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
    select: false  // Não retornar por padrão
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
    select: false  // Para ativação temporária
  },
  
  lastOtpRequest: {
    type: Date,
    default: null
  },
  
  otpRequestCount: {
    type: Number,
    default: 0
  },
  
  dataCadastro: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});


// Middleware para formatar CPF e TELEFONE antes de salvar
UserSchema.pre('save', async function(next) {
  // Format CPF
  if (this.cpf) {
    this.cpf = this.cpf.replace(/\D/g, '');
  }
  
  // Format Telefone
  if (this.telefone) {
    this.telefone = this.telefone.replace(/\D/g, '');
  }
  
  // VALIDAÇÃO: Converter email para lowercase e garantir domínio correto
  if (this.email) {
    this.email = this.email.toLowerCase().trim();
    
    // Adicionar domínio se não tiver (opcional)
    if (!this.email.includes('@')) {
      this.email = this.email + '@iemasaoluiscentro.net';
    }
  }
  
  // Criptografar senha
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// ====== MÉTODO PARA COMPARAR SENHA ======
UserSchema.methods.comparePassword = async function(candidatePassword) {
    try {
        // Verificar se candidatePassword é válido
        if (!candidatePassword || typeof candidatePassword !== 'string') {
            console.error('❌ comparePassword: candidatePassword inválido:', candidatePassword);
            return false;
        }
        
        // Verificar se this.password existe
        if (!this.password) {
            console.error('❌ comparePassword: this.password não existe');
            return false;
        }
        
        // Comparar senhas
        return await bcrypt.compare(candidatePassword, this.password);
    } catch (error) {
        console.error('❌ Erro em comparePassword:', error);
        return false;
    }
};

// Verificar se conta está bloqueada
UserSchema.methods.isLocked = function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

// Incrementar tentativas de login
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

// Método estático para buscar por CPF
UserSchema.statics.findByCPF = async function(cpf) {
  const cpfNumeros = cpf.replace(/\D/g, '');
  return await this.findOne({ cpf: cpfNumeros });
};

// Método estático para buscar por Telefone
UserSchema.statics.findByTelefone = async function(telefone) {
  const telefoneNumeros = telefone.replace(/\D/g, '');
  return await this.findOne({ telefone: telefoneNumeros });
};

// Virtual para CPF formatado
UserSchema.virtual('cpfFormatado').get(function() {
  if (!this.cpf) return '';
  
  const cpf = this.cpf.replace(/\D/g, '');
  if (cpf.length !== 11) return cpf;
  
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
});

// Virtual para Telefone formatado
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

// Configurar para incluir virtuais no JSON
UserSchema.set('toJSON', { virtuals: true });
UserSchema.set('toObject', { virtuals: true });

// Índices para melhor performance
UserSchema.index({ email: 1 });
UserSchema.index({ cpf: 1 });
UserSchema.index({ telefone: 1 });
UserSchema.index({ matricula: 1 });
UserSchema.index({ role: 1 });
UserSchema.index({ precisaAcessibilidade: 1 }); // NOVO ÍNDICE

module.exports = mongoose.model('User', UserSchema);