const mongoose = require('mongoose');

const NotificacaoVisitaSchema = new mongoose.Schema({
  usuarioId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  tipo: {
    type: String,
    enum: ['solicitacao', 'autorizacao', 'recusa', 'lembrete', 'expiracao'],
    required: true
  },
  
  titulo: { type: String, required: true },
  mensagem: { type: String, required: true },
  
  termoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TermoVisita'
  },
  
  lida: { type: Boolean, default: false, index: true },
  lidaEm: Date
  
}, { timestamps: true });

NotificacaoVisitaSchema.index({ usuarioId: 1, lida: 1 });
NotificacaoVisitaSchema.index({ createdAt: -1 });

module.exports = mongoose.model('NotificacaoVisita', NotificacaoVisitaSchema);