// ============================================
// MODEL - Configuração da Biblioteca
// ============================================
const mongoose = require('mongoose');

const ConfiguracaoBibliotecaSchema = new mongoose.Schema({
  // 🔓 Controle de visitas (checkbox principal)
  visitasAbertas: {
    type: Boolean,
    default: true
  },
  
  // 💬 Mensagem exibida quando as visitas estão fechadas
  mensagemFechado: {
    type: String,
    default: 'A biblioteca está temporariamente fechada para novas visitas. Volte mais tarde!'
  },
  
  // 🕒 Horário de funcionamento
  horarioAbertura: {
    type: String,
    default: '07:00'
  },
  horarioFechamento: {
    type: String,
    default: '17:00'
  },
  
  // 👤 Auditoria
  atualizadoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  atualizadoPorNome: {
    type: String,
    default: ''
  },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// ============================================
// MÉTODO ESTÁTICO: pega config única (singleton)
// ============================================
ConfiguracaoBibliotecaSchema.statics.getConfig = async function() {
  let config = await this.findOne();
  if (!config) {
    config = await this.create({});
  }
  return config;
};

module.exports = mongoose.model('ConfiguracaoBiblioteca', ConfiguracaoBibliotecaSchema);