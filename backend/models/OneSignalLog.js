// ============================================================================
// backend/models/OneSignalLog.js
// Armazena os logs de debug do OneSignal enviados pelo WebView
// ============================================================================

const mongoose = require('mongoose');

const OneSignalLogSchema = new mongoose.Schema({
    usuarioId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    usuarioNome: String,
    usuarioEmail: String,
    usuarioRole: String,
    userAgent: String,
    plataforma: String,
    logs: [{
        timestamp: Date,
        tipo: String,
        mensagem: String,
        userAgent: String
    }],
    totalLogs: Number,
    origem: {
        type: String,
        enum: ['timeout_25s', 'beacon', 'manual'],
        default: 'timeout_25s'
    },
    playerIdDetectado: String,
    vinculouComSucesso: Boolean
}, {
    timestamps: true
});

// Índice para busca rápida
OneSignalLogSchema.index({ usuarioId: 1, createdAt: -1 });
OneSignalLogSchema.index({ createdAt: -1 });

// TTL: apaga logs com mais de 7 dias automaticamente
OneSignalLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

module.exports = mongoose.model('OneSignalLog', OneSignalLogSchema);