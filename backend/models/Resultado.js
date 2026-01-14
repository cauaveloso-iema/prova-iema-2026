const mongoose = require('mongoose');

const resultadoSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,  // CORREÇÃO: "Types" não "Tia"
    ref: 'User',
    required: true
  },
  
  provaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Prova',
    required: true
  },
  
  alunoNome: String,
  
  respostas: [Number],
  
  nota: {
    type: Number,
    required: true
  },
  
  acertos: Number,
  total: Number,
  
  porcentagem: Number,
  
  tempoGasto: Number, // em segundos
  
  detalhes: [{
    pergunta: String,
    respostaAluno: Number,
    respostaCorreta: Number,
    explicacao: String,
    acertou: Boolean,
    opcoes: [String]
  }],
  
  ipAddress: String,
  
  userAgent: String,
  
  inicioProva: Date,
  
  fimProva: Date,
  
  tempoExcedido: {
    type: Boolean,
    default: false
  },
  
  tentativaNumero: {
    type: Number,
    default: 1
  },
  
  isValidado: {
    type: Boolean,
    default: false
  },
  
  observacoes: String,
  
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Índices para performance
resultadoSchema.index({ userId: 1, provaId: 1 });
resultadoSchema.index({ provaId: 1, nota: -1 });
resultadoSchema.index({ createdAt: -1 });

const Resultado = mongoose.model('Resultado', resultadoSchema);

module.exports = Resultado;