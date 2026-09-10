const mongoose = require('mongoose');

const ConfiguracaoProtagonismoSchema = new mongoose.Schema({
  // Chave única para o documento (singleton)
  chave: {
    type: String,
    default: 'config_global',
    unique: true
  },
  
  // Controle de funcionalidades
  inscricoesClubesAbertas: {
    type: Boolean,
    default: false
  },
  
  eleicaoLiderAberta: {
    type: Boolean,
    default: false
  },
  
  tutoriaVisivel: {
    type: Boolean,
    default: false
  },
  
  // Períodos (opcional)
  dataAberturaInscricoes: Date,
  dataFechamentoInscricoes: Date,
  dataAberturaEleicao: Date,
  dataFechamentoEleicao: Date,
  
  // Aviso/mensagem para a página pública
  avisoPublico: {
    type: String,
    default: ''
  },
  
  atualizadoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  updatedAt: { type: Date, default: Date.now }
});

// Método estático para pegar/criar a configuração
ConfiguracaoProtagonismoSchema.statics.getConfig = async function() {
  let config = await this.findOne({ chave: 'config_global' });
  if (!config) {
    config = await this.create({ chave: 'config_global' });
  }
  return config;
};

module.exports = mongoose.model('ConfiguracaoProtagonismo', ConfiguracaoProtagonismoSchema);