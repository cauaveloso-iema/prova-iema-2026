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
});

// Criptografar senha antes de salvar
UserSchema.pre('save', async function(next) {
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
  const updates = { $inc: { loginAttempts: 1 } };
  
  if (this.loginAttempts + 1 >= 5) {
    updates.$set = { lockUntil: Date.now() + 15 * 60 * 1000 }; // 15 minutos
  }
  
  return await this.constructor.updateOne({ _id: this._id }, updates);
};

module.exports = mongoose.model('User', UserSchema);