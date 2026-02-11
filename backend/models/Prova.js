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
  imagens: [{
    url: String,
    nome: String,
    nomeArquivo: String,
    tipo: String,
    tamanho: Number,
    dataUpload: Date
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
  
  // ========== 🔴 CAMPOS DE TIPO DE PROVA (ADICIONADOS) ==========
  tipoProva: {
    type: String,
    enum: ['simples', 'enem', 'adaptada'],
    default: 'simples',
    required: true
  },
  
  adaptada: {
    type: Boolean,
    default: false
  },
  
  alternativas: {
    type: Number,
    default: 5,
    min: 3,
    max: 5
  },
  // ============================================================
  
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
    type: String,
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
    type: String,
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
    max: 480
  },
  codigo: {
    type: String,
    unique: true,
    uppercase: true
  },
  status: {
    type: String,
    enum: ['rascunho', 'ativa', 'concluida', 'pendente'],
    default: 'rascunho'
  },
  
  // === CAMPOS PARA CONTROLE DE PUBLICAÇÃO ===
  publicada: {
    type: Boolean,
    default: false
  },
  dataPublicacao: {
    type: Date,
    default: null
  },
  
  // ========== 🔴 CAMPOS DE ATRIBUIÇÃO DE ALUNOS (ADICIONADOS) ==========
  alunosAtribuidos: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  totalAlunosAlvo: {
    type: Number,
    default: 0
  },
  
  alunosComAcessibilidade: {
    type: Number,
    default: 0
  },
  
  recursosAcessibilidade: [{
    type: String,
    enum: ['fonte_ampliada', 'alto_contraste', 'leitor_tela', 'tempo_adicional', 'libras', 'ledor']
  }],
  // ================================================================
  
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
  
  // ========== 🔴 GARANTIR QUE alternativas SEJA 3 PARA PROVA ADAPTADA ==========
  if (this.tipoProva === 'adaptada' || this.adaptada === true) {
    this.alternativas = 3;
    this.adaptada = true;
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
      this.duracaoMinutos = terminoMinutos - inicioMinutos;
      next();
    }
  } else {
    next();
  }
});

// ============ MÉTODOS PARA EDIÇÃO DE QUESTÕES ============
ProvaSchema.methods.editarQuestao = function(questaoId, dadosAtualizados) {
  const questao = this.questoes.id(questaoId);
  if (questao) {
    if (dadosAtualizados.pergunta) questao.pergunta = dadosAtualizados.pergunta;
    if (dadosAtualizados.opcoes) questao.opcoes = dadosAtualizados.opcoes;
    if (dadosAtualizados.respostaCorreta !== undefined) {
      questao.respostaCorreta = dadosAtualizados.respostaCorreta;
    }
    if (dadosAtualizados.explicacao !== undefined) {
      questao.explicacao = dadosAtualizados.explicacao;
    }
    if (!questao.tipo || questao.tipo === 'ia') {
      questao.tipo = 'editada';
    }
  }
};

// Método para atualizar todas as questões de uma vez
ProvaSchema.methods.atualizarQuestoes = function(novasQuestoes) {
  if (Array.isArray(novasQuestoes)) {
    this.questoes = [];
    
    novasQuestoes.forEach((q, index) => {
      const novaQuestao = {
        pergunta: q.pergunta,
        opcoes: q.opcoes,
        respostaCorreta: q.respostaCorreta,
        explicacao: q.explicacao || '',
        tipo: q.tipo || 'editada'
      };
      
      if (q._id) {
        novaQuestao._id = q._id;
      }
      
      this.questoes.push(novaQuestao);
    });
    
    this.quantidadeQuestoes = this.questoes.length;
    this.fonteGeracao = 'mista';
  }
};

module.exports = mongoose.model('Prova', ProvaSchema);