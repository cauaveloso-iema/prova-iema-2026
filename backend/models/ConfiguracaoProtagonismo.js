// models/ConfiguracaoProtagonismo.js
const mongoose = require('mongoose');

const ConfiguracaoProtagonismoSchema = new mongoose.Schema({
  chave: {
    type: String,
    default: 'config_global',
    unique: true
  },

  inscricoesClubesAbertas: { type: Boolean, default: false },
  eleicaoLiderAberta: { type: Boolean, default: false },
  tutoriaVisivel: { type: Boolean, default: false },

  dataAberturaInscricoes: Date,
  dataFechamentoInscricoes: Date,
  dataAberturaEleicao: Date,
  dataFechamentoEleicao: Date,

  avisoPublico: { type: String, default: '' },

  aniversarios: {
    avisarNoDia: { type: Boolean, default: true },
    avisarAntecedencia: { type: Boolean, default: false },
    minutosAntecedencia: { type: Number, default: 60, min: 5, max: 10080 },
    horarioEnvioNoDia: { type: String, default: '08:00' },
    notificarAniversariante: { type: Boolean, default: true },
    notificarProtagonistas: { type: Boolean, default: true },
    notificarAdmins: { type: Boolean, default: false },
    enviarEmail: { type: Boolean, default: false },
    mensagemPadrao: {
      type: String,
      default: '🎉 Feliz aniversário, {nome}! Que seu dia seja especial e cheio de alegrias!'
    }
  },

  atualizadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedAt: { type: Date, default: Date.now }
});

ConfiguracaoProtagonismoSchema.statics.getConfig = async function() {
  let config = await this.findOne({ chave: 'config_global' });
  if (!config) {
    config = await this.create({ chave: 'config_global' });
  }
  if (!config.aniversarios) {
    config.aniversarios = {
      avisarNoDia: true,
      avisarAntecedencia: false,
      minutosAntecedencia: 60,
      horarioEnvioNoDia: '08:00',
      notificarAniversariante: true,
      notificarProtagonistas: true,
      notificarAdmins: false,
      enviarEmail: false,
      mensagemPadrao: '🎉 Feliz aniversário, {nome}! Que seu dia seja especial e cheio de alegrias!'
    };
    config.markModified('aniversarios');
    await config.save();
  }
  return config;
};

module.exports = mongoose.model('ConfiguracaoProtagonismo', ConfiguracaoProtagonismoSchema);