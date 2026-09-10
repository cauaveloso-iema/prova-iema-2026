const mongoose = require('mongoose');

const InscricaoClubeSchema = new mongoose.Schema({
  // Dados do aluno (podem vir de aluno logado OU de formulário público)
  alunoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  nomeCompleto: {
    type: String,
    required: true,
    trim: true
  },
  
  dataNascimento: {
    type: Date,
    required: true
  },
  
  curso: {
    type: String,
    required: true
  },
  
  turma: {
    type: String,
    required: true
  },
  
  matricula: {
    type: String,
    default: ''
  },
  
  // Clube escolhido
  clubeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Clube',
    required: true
  },
  
  clubeNome: {
    type: String,
    required: true
  },
  
  // Status
  status: {
    type: String,
    enum: ['ativa', 'cancelada', 'lista_espera'],
    default: 'ativa'
  },
  
  // Metadados
  ipInscricao: String,
  userAgent: String,
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Índices
InscricaoClubeSchema.index({ clubeId: 1, status: 1 });
InscricaoClubeSchema.index({ nomeCompleto: 1 });
InscricaoClubeSchema.index({ turma: 1 });
InscricaoClubeSchema.index({ alunoId: 1 });

// Verificar se aluno já está inscrito em algum clube
InscricaoClubeSchema.statics.alunoJaInscrito = async function(alunoId) {
  const inscricao = await this.findOne({ alunoId, status: 'ativa' });
  return !!inscricao;
};

// Verificar se uma pessoa (nome + data nascimento) já está inscrita
InscricaoClubeSchema.statics.pessoaJaInscrita = async function(nomeCompleto, dataNascimento) {
  const inscricao = await this.findOne({
    nomeCompleto: { $regex: new RegExp(`^${nomeCompleto}$`, 'i') },
    dataNascimento: new Date(dataNascimento),
    status: 'ativa'
  });
  return !!inscricao;
};

module.exports = mongoose.model('InscricaoClube', InscricaoClubeSchema);