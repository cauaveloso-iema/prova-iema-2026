const mongoose = require('mongoose');

const PushSubscriptionSchema = new mongoose.Schema({
    usuarioId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    endpoint: {
        type: String,
        required: true,
        unique: true
    },
    keys: {
        auth: { type: String, required: true },
        p256dh: { type: String, required: true }
    },
    userAgent: {
        type: String,
        default: ''
    },
    deviceInfo: {
        type: String,
        default: ''
    },
    ativo: {
        type: Boolean,
        default: true
    },
    ultimoUso: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Índices para consultas rápidas
PushSubscriptionSchema.index({ usuarioId: 1, ativo: 1 });
PushSubscriptionSchema.index({ endpoint: 1 }, { unique: true });

module.exports = mongoose.model('PushSubscription', PushSubscriptionSchema);