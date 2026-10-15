// ============================================================================
// MODEL: Histórico de Conexão - EducaPleno
// ============================================================================
// Registra todas as conexões (logins) dos usuários no sistema
// ============================================================================

const mongoose = require('mongoose');

const HistoricoConexaoSchema = new mongoose.Schema({
  usuarioId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  usuarioNome: {
    type: String,
    required: true
  },
  usuarioEmail: {
    type: String,
    required: true
  },
  usuarioRole: {
    type: String,
    default: 'aluno'
  },
  usuarioMatricula: {
    type: String,
    default: null
  },
  usuarioTurma: {
    type: String,
    default: null
  },
  usuarioCurso: {
    type: String,
    default: null
  },
  usuarioFotoPerfil: {
    type: String,
    default: null
  },
  dataHora: {
    type: Date,
    default: Date.now,
    index: true
  },
  ip: {
    type: String,
    default: null
  },
  userAgent: {
    type: String,
    default: null
  },
  dispositivo: {
    type: String,
    enum: ['Desktop', 'Mobile', 'Tablet', 'Desconhecido'],
    default: 'Desconhecido'
  },
  origem: {
    type: String,
    enum: ['web', 'app', 'admin', 'login', 'google', 'microsoft', 'outro'],
    default: 'web'
  },
  sessionId: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Índices compostos para consultas rápidas
HistoricoConexaoSchema.index({ usuarioId: 1, dataHora: -1 });
HistoricoConexaoSchema.index({ dataHora: -1 });
HistoricoConexaoSchema.index({ usuarioRole: 1, dataHora: -1 });

module.exports = mongoose.model('HistoricoConexao', HistoricoConexaoSchema);