// backend/models/PushSettings.js
const mongoose = require('mongoose');

const PushSettingsSchema = new mongoose.Schema({
    _id: { type: String, default: 'global' },
    pushAtivado: { type: Boolean, default: false },
    vapidPublicKey: { type: String, default: process.env.VAPID_PUBLIC_KEY || '' },
    ultimaAlteracaoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    ultimaAlteracaoEm: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('PushSettings', PushSettingsSchema);