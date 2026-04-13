const mongoose = require('mongoose');

const rodizioRefeicaoSchema = new mongoose.Schema({
  turma: {
    type: String,
    required: true,
    index: true
  },
  tipoRodizio: {
    type: String,
    enum: ['semanal', 'mensal', 'ambos'],
    required: true,
    default: 'semanal'
  },
  // Para rodízio semanal (dias da semana que a turma almoça)
  diasSemana: {
    type: [Number], // 0=domingo, 1=segunda, ..., 6=sábado
    default: [1, 2, 3, 4, 5] // Segunda a Sexta por padrão
  },
  // Para rodízio mensal (dias do mês que a turma almoça)
  diasMes: {
    type: [Number], // 1 a 31
    default: []
  },
  // Semanas do mês (1=primeira, 2=segunda, 3=terceira, 4=quarta)
  semanasMes: {
    type: [Number],
    default: [1, 2, 3, 4]
  },
  horarioInicio: {
    type: String,
    default: '11:00'
  },
  horarioFim: {
    type: String,
    default: '13:00'
  },
  ativo: {
    type: Boolean,
    default: true
  },
  descricao: {
    type: String,
    default: ''
  },
  criadoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  criadoEm: {
    type: Date,
    default: Date.now
  },
  atualizadoEm: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Índices
rodizioRefeicaoSchema.index({ turma: 1, tipoRodizio: 1 });
rodizioRefeicaoSchema.index({ ativo: 1 });

// ============================================
// MÉTODOS ESTÁTICOS
// ============================================

// Verificar se a turma pode almoçar hoje
rodizioRefeicaoSchema.statics.turmaPodeAlmocarHoje = async function(turma) {
  const hoje = new Date();
  const diaSemana = hoje.getDay(); // 0=domingo, 1=segunda...
  const diaMes = hoje.getDate();
  const semanaMes = Math.ceil(diaMes / 7); // 1-4
  
  // Buscar configuração de rodízio para a turma
  const config = await this.findOne({ turma, ativo: true });
  
  if (!config) {
    // Se não tem configuração, permite por padrão
    return { pode: true, motivo: 'Sem restrição configurada' };
  }
  
  let podeAlmocar = false;
  let motivo = '';
  
  // Verificar por tipo de rodízio
  if (config.tipoRodizio === 'semanal' || config.tipoRodizio === 'ambos') {
    if (config.diasSemana.includes(diaSemana)) {
      podeAlmocar = true;
      motivo = 'Rodízio semanal - dia permitido';
    }
  }
  
  if (!podeAlmocar && (config.tipoRodizio === 'mensal' || config.tipoRodizio === 'ambos')) {
    // Verificar se o dia do mês está permitido
    if (config.diasMes.includes(diaMes)) {
      podeAlmocar = true;
      motivo = 'Rodízio mensal - dia do mês permitido';
    }
    // Verificar se a semana do mês está permitida
    else if (config.semanasMes.includes(semanaMes)) {
      podeAlmocar = true;
      motivo = 'Rodízio mensal - semana do mês permitida';
    }
  }
  
  // Verificar horário
  if (podeAlmocar) {
    const agora = new Date();
    const horaAtual = agora.getHours();
    const minutosAtual = agora.getMinutes();
    const [horaInicio, minInicio] = config.horarioInicio.split(':').map(Number);
    const [horaFim, minFim] = config.horarioFim.split(':').map(Number);
    
    const minutosAtualTotal = horaAtual * 60 + minutosAtual;
    const minutosInicioTotal = horaInicio * 60 + minInicio;
    const minutosFimTotal = horaFim * 60 + minFim;
    
    if (minutosAtualTotal < minutosInicioTotal || minutosAtualTotal > minutosFimTotal) {
      podeAlmocar = false;
      motivo = `Fora do horário permitido (${config.horarioInicio} às ${config.horarioFim})`;
    } else {
      motivo = `${motivo} - Horário permitido`;
    }
  } else {
    motivo = `Turma não está no rodízio de hoje. Dias permitidos: ${config.diasSemana.map(d => this.getDiaSemanaNome(d)).join(', ')}`;
  }
  
  return { pode: podeAlmocar, motivo, config };
};

// Obter nome do dia da semana
rodizioRefeicaoSchema.statics.getDiaSemanaNome = function(dia) {
  const dias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  return dias[dia] || 'Desconhecido';
};

// Obter todas as turmas com rodízio ativo
rodizioRefeicaoSchema.statics.getTurmasComRodizio = async function() {
  return await this.find({ ativo: true }).sort({ turma: 1 });
};

module.exports = mongoose.model('RodizioRefeicao', rodizioRefeicaoSchema);