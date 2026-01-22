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
    trim: true
  },
  // ADICIONE ESTE CAMPO CPF
  cpf: {
    type: String,
    unique: true,
    sparse: true, // Permite null, mas mantém único para valores não-nulos
    trim: true,
    validate: {
      validator: function(v) {
        // Validação opcional - só valida se CPF for fornecido
        if (!v) return true; // Permite null/vazio
        const cpfNumeros = v.replace(/\D/g, '');
        return cpfNumeros.length === 11;
      },
      message: 'CPF deve ter 11 dígitos'
    }
  },
  password: {
    type: String,
    required: [true, 'Senha é obrigatória'],
    minlength: 6,
    select: false
  },
  role: {
    type: String,
    enum: ['aluno', 'professor', 'admin'],
    default: 'aluno'
  },
  eixo: {
    type: String,
    enum: ['natureza', 'humanas', null],
    default: null
  },
  matricula: {
    type: String,
    unique: true,
    sparse: true // Permite null, mas mantém único para valores não-nulos
  },
  turmas: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Turma'
  }],
  // Para alunos
  curso: String,
  periodo: String,
  // Para professores
  departamento: String,
  titulacao: String,
  
  // Controle de login
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
  dataCadastro: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true // Adicione timestamps para created_at e updated_at
});

// Middleware para formatar CPF antes de salvar (remove formatação)
UserSchema.pre('save', async function(next) {
  // Format CPF (remove qualquer caractere não numérico)
  if (this.cpf) {
    this.cpf = this.cpf.replace(/\D/g, '');
  }
  
  // Criptografar senha antes de salvar
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Método para comparar senha
UserSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Verificar se conta está bloqueada
UserSchema.methods.isLocked = function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

// Incrementar tentativas de login
UserSchema.methods.incLoginAttempts = async function() {
  // Se o tempo de bloqueio já passou, resetar
  if (this.lockUntil && this.lockUntil < Date.now()) {
    this.loginAttempts = 1;
    this.lockUntil = undefined;
    return await this.save();
  }
  
  this.loginAttempts += 1;
  
  // Se excedeu 5 tentativas, bloquear por 15 minutos
  if (this.loginAttempts >= 5) {
    this.lockUntil = Date.now() + 15 * 60 * 1000; // 15 minutos
  }
  
  return await this.save();
};

// Método estático para buscar por CPF
UserSchema.statics.findByCPF = async function(cpf) {
  const cpfNumeros = cpf.replace(/\D/g, '');
  return await this.findOne({ cpf: cpfNumeros });
};

// Virtual para CPF formatado
UserSchema.virtual('cpfFormatado').get(function() {
  if (!this.cpf) return '';
  
  const cpf = this.cpf.replace(/\D/g, '');
  if (cpf.length !== 11) return cpf;
  
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
});

// Configurar para incluir virtuais no JSON
UserSchema.set('toJSON', { virtuals: true });
UserSchema.set('toObject', { virtuals: true });

// Índices para melhor performance
UserSchema.index({ email: 1 });
UserSchema.index({ cpf: 1 });
UserSchema.index({ matricula: 1 });
UserSchema.index({ role: 1 });

module.exports = mongoose.model('User', UserSchema);