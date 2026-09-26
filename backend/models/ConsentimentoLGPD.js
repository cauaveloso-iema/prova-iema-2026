// models/ConsentimentoLGPD.js
const mongoose = require('mongoose');

const ConsentimentoLGPDSchema = new mongoose.Schema({
  titular: {
    nome: String,
    cpf: String,           // Armazenado já criptografado pelo caller
    cpfHash: { type: String, index: true },
    email: String,
    telefone: String
  },
  
  tipo: {
    type: String,
    required: true,
    index: true
  },
  
  finalidade: String,
  baseLegal: { type: String, default: 'consentimento' },
  
  versaoPolitica: String,
  
  ip: String,
  userAgent: String,
  
  geolocalizacao: {
    latitude: Number,
    longitude: Number
  },
  
  termoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TermoVisita',
    index: true
  },
  
  status: {
    type: String,
    default: 'ativo',
    index: true
  },
  
  revogadoEm: Date,
  motivoRevogacao: String,
  
  expiraEm: Date,
  
  assinaturaBase64: String,
  
  metadata: mongoose.Schema.Types.Mixed
  
}, { timestamps: true });

ConsentimentoLGPDSchema.index({ 'titular.cpfHash': 1, status: 1 });
ConsentimentoLGPDSchema.index({ termoId: 1, tipo: 1 });

module.exports = mongoose.model('ConsentimentoLGPD', ConsentimentoLGPDSchema);