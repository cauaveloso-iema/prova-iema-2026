// models/AuditoriaVisita.js
const mongoose = require('mongoose');

const AuditoriaVisitaSchema = new mongoose.Schema({
  usuarioId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  usuarioNome: String,
  usuarioRole: String,
  
  acao: String,
  
  termoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TermoVisita'
  },
  termoCodigo: String,
  
  dadosAcessados: [String],
  
  ip: String,
  userAgent: String,
  recurso: String,
  metodo: String,
  
  sucesso: { type: Boolean, default: true },
  erroMensagem: String,
  
  metadata: mongoose.Schema.Types.Mixed
  
}, { timestamps: true });

module.exports = mongoose.model('AuditoriaVisita', AuditoriaVisitaSchema);