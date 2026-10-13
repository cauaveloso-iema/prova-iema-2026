// ============================================================================
// MODELS/FACEID.JS
// ============================================================================
// Modelo centralizado do Face ID (reconhecimento facial).
// Usado por routes/face-id.js, routes/admin.js, e outros módulos.
// ============================================================================

const mongoose = require('mongoose');

const FaceIDSchema = new mongoose.Schema({
    usuarioId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    imagemBase64: { type: String, required: true },
    imagemHash: { type: String, required: true },
    faceDescriptor: { type: [Number], required: false },
    dataCadastro: { type: Date, default: Date.now },
    ultimaValidacao: { type: Date },
    totalValidacoes: { type: Number, default: 0 },
    ativo: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.models.FaceID || mongoose.model('FaceID', FaceIDSchema);