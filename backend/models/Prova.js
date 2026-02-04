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
    max: 4
  },
  explicacao: {
    type: String,
    default: ''
  }
  // REMOVI: { _id: false } - deixa o mongoose criar _id normalmente
});

const ProvaSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  turmaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Turma',
    required: false
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
  horarioInicio: {
    type: String, // Formato HH:mm (ex: "08:30")
    required: true,
    default: "08:00",
    validate: {
      validator: function(v) {
        return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: props => `${props.value} não é um horário válido! Use HH:mm`
    }
  },
  horarioTermino: {
    type: String, // Formato HH:mm (ex: "10:00")
    required: true,
    default: "09:30",
    validate: {
      validator: function(v) {
        return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(v);
      },
      message: props => `${props.value} não é um horário válido! Use HH:mm`
    }
  },
  duracaoMinutos: {
    type: Number,
    default: 60,
    min: 10,
    max: 480 // 8 horas máximo
  },
  codigo: {
    type: String,
    unique: true,
    uppercase: true
  },
  status: {
    type: String,
    enum: ['rascunho', 'ativa', 'concluida', 'pendente'],
    default: 'rascunho' // ALTERADO: inicia como rascunho
  },
  
  // === NOVOS CAMPOS PARA CONTROLE DE PUBLICAÇÃO ===
  publicada: {
    type: Boolean,
    default: false // Não publicada por padrão
  },
  dataPublicacao: {
    type: Date,
    default: null
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
  fonteGeracao: {
    type: String,
    default: 'manual'
  }
}, {
  timestamps: true
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
  
  next();
});

// Validar que horário de término é depois do início
ProvaSchema.pre('save', function(next) {
  if (this.horarioInicio && this.horarioTermino) {
    const [h1, m1] = this.horarioInicio.split(':').map(Number);
    const [h2, m2] = this.horarioTermino.split(':').map(Number);
    
    const inicioMinutos = h1 * 60 + m1;
    const terminoMinutos = h2 * 60 + m2;
    
    if (terminoMinutos <= inicioMinutos) {
      next(new Error('Horário de término deve ser depois do horário de início'));
    } else {
      // Calcular duração automaticamente
      this.duracaoMinutos = terminoMinutos - inicioMinutos;
      next();
    }
  } else {
    next();
  }
});

module.exports = mongoose.model('Prova', ProvaSchema);