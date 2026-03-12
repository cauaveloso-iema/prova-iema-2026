const mongoose = require('mongoose');

const TurmaSchema = new mongoose.Schema({
  // ===== CAMPOS PRINCIPAIS =====
  nome: {
    type: String,
    required: true,
    trim: true
  },
  codigo: {
    type: String,
    unique: true,
    uppercase: true,
    trim: true
  },
  
  // ===== RELACIONAMENTOS =====
  cursoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Curso',
    required: false,
    index: true
  },
  professorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // ===== CAMPOS ACADÊMICOS =====
  disciplina: {
    type: String,
    required: true
  },
  eixo: {
    type: String,
    required: true,
    enum: ['natureza', 'humanas', 'linguagens', 'desenvolvimento', 'redes', 'turismo', 'gestao', 'producao', 'ambiente']
  },
  periodo: {
    type: String,
    enum: ['1', '2', '3', '4'],
    default: '1'
  },
  vagas: {
    type: Number,
    default: 40,
    min: 1,
    max: 100
  },
  
  // ===== DESCRIÇÃO =====
  descricao: {
    type: String,
    default: ''
  },
  
  // ===== RELACIONAMENTOS COM USUÁRIOS =====
  alunos: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  provas: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Prova'
  }],
  
  // ===== STATUS =====
  ativa: {
    type: Boolean,
    default: true
  },
  
  // ===== TIMESTAMPS =====
  dataCriacao: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true // Adiciona createdAt e updatedAt automaticamente
});

// ===== ÍNDICES PARA MELHOR PERFORMANCE =====
TurmaSchema.index({ cursoId: 1, ativa: 1 });
TurmaSchema.index({ professorId: 1, ativa: 1 });
TurmaSchema.index({ eixo: 1 });
TurmaSchema.index({ codigo: 1 }, { unique: true });

// ===== GERAR CÓDIGO ÚNICO ANTES DE SALVAR =====
TurmaSchema.pre('save', async function(next) {
  try {
    // Só gerar código se não existir
    if (!this.codigo) {
      let codigoGerado = '';
      let existe = true;
      
      // Garantir que o código é único
      while (existe) {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        codigoGerado = '';
        for (let i = 0; i < 6; i++) {
          codigoGerado += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        
        // Verificar se já existe
        const Turma = mongoose.model('Turma');
        const turmaExistente = await Turma.findOne({ codigo: codigoGerado });
        existe = !!turmaExistente;
      }
      
      this.codigo = codigoGerado;
    }
    next();
  } catch (error) {
    next(error);
  }
});

// ===== MIDDLEWARE PARA POPULAR DADOS QUANDO NECESSÁRIO =====
TurmaSchema.pre(/^find/, function(next) {
  // Popular automaticamente em algumas queries
  this.populate({
    path: 'professorId',
    select: 'nome email'
  }).populate({
    path: 'alunos',
    select: 'nome email matricula'
  });
  next();
});

// ===== MÉTODOS ESTÁTICOS =====
TurmaSchema.statics.findByCurso = function(cursoId) {
  return this.find({ cursoId }).sort({ periodo: 1, codigo: 1 });
};

TurmaSchema.statics.findByProfessor = function(professorId) {
  return this.find({ professorId, ativa: true }).sort({ dataCriacao: -1 });
};

TurmaSchema.statics.findByEixo = function(eixo) {
  return this.find({ eixo, ativa: true }).sort({ nome: 1 });
};

// ===== MÉTODOS DE INSTÂNCIA =====
TurmaSchema.methods.adicionarAluno = async function(alunoId) {
  if (!this.alunos.includes(alunoId)) {
    this.alunos.push(alunoId);
    await this.save();
  }
  return this;
};

TurmaSchema.methods.removerAluno = async function(alunoId) {
  this.alunos = this.alunos.filter(id => id.toString() !== alunoId.toString());
  await this.save();
  return this;
};

TurmaSchema.methods.adicionarProva = async function(provaId) {
  if (!this.provas.includes(provaId)) {
    this.provas.push(provaId);
    await this.save();
  }
  return this;
};

// ===== VIRTUAIS =====
TurmaSchema.virtual('totalAlunos').get(function() {
  return this.alunos?.length || 0;
});

TurmaSchema.virtual('totalProvas').get(function() {
  return this.provas?.length || 0;
});

TurmaSchema.virtual('vagasDisponiveis').get(function() {
  return Math.max(0, (this.vagas || 40) - (this.alunos?.length || 0));
});

TurmaSchema.set('toJSON', { virtuals: true });
TurmaSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Turma', TurmaSchema);