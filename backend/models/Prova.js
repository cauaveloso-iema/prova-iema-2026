const mongoose = require('mongoose');

const QuestaoSchema = new mongoose.Schema({
  pergunta: {
    type: String,
    required: true,
    trim: true
  },
  opcoes: [{
    type: String,
    required: true
  }],
  respostaCorreta: {
    type: Number,
    required: true,
    min: 0,
    max: 3
  },
  explicacao: {
    type: String,
    default: ''
  }
}, { _id: false }); // REMOVA O _id automático das questões

const ProvaSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  turmaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Turma',
    required: false // Alterado para false pois pode ser prova independente
  },
  titulo: {
    type: String,
    required: true,
    trim: true
  },
  conteudo: {
    type: String,
    required: true,
    trim: true
  },
  questoes: [QuestaoSchema],
  quantidadeQuestoes: {
    type: Number,
    required: true,
    min: 1,
    max: 50
  },
  dificuldade: {
    type: String,
    enum: ['facil', 'media', 'dificil'],
    default: 'media'
  },
  dataLimite: {
    type: Date,
    required: false
  },
  duracao: {
    type: Number,
    default: 60, // minutos
    min: 5
  },
  codigo: {
    type: String,
    unique: true,
    uppercase: true
  },
  status: {
    type: String,
    enum: ['ativa', 'concluida', 'pendente'],
    default: 'ativa'
  },
  alunosAtribuidos: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  totalParticipantes: {
    type: Number,
    default: 0
  },
  mediaNotas: {
    type: Number,
    default: 0
  },
  dataCriacao: {
    type: Date,
    default: Date.now
  },
  ultimaAtualizacao: {
    type: Date,
    default: Date.now
  }
});

// Gerar código único antes de salvar
ProvaSchema.pre('save', async function(next) {
  if (!this.codigo) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    this.codigo = code;
  }
  
  // Atualizar data de atualização
  this.ultimaAtualizacao = new Date();
  
  next();
});

module.exports = mongoose.model('Prova', ProvaSchema);