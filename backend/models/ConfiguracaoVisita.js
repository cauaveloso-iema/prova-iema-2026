const mongoose = require('mongoose');

const ConfiguracaoVisitaSchema = new mongoose.Schema({
  chave: {
    type: String,
    default: 'config_global_visitas',
    unique: true
  },
  
  visitasAbertas: {
    type: Boolean,
    default: false
  },
  
  dataAbertura: Date,
  dataFechamento: Date,
  
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

ConfiguracaoVisitaSchema.statics.getConfig = async function() {
  let config = await this.findOne({ chave: 'config_global_visitas' });
  if (!config) {
    config = await this.create({ chave: 'config_global_visitas' });
  }
  return config;
};

module.exports = mongoose.model('ConfiguracaoVisita', ConfiguracaoVisitaSchema);