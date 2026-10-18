// ============================================================================
// models/WebAuthnCredential.js
// ============================================================================
// Descrição: Credenciais WebAuthn (biometria) registradas por usuário.
//            A biometria NUNCA sai do dispositivo — aqui só guardamos a
//            chave pública e o contador anti-replay.
// ============================================================================

const mongoose = require('mongoose');

const WebAuthnCredentialSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // ID da credencial (base64url) — único globalmente
  credentialId: {
    type: String,
    required: true,
    unique: true
  },

  // Chave pública (Buffer) — usada para verificar assinaturas
  publicKey: {
    type: Buffer,
    required: true
  },

  // Contador anti-replay (incrementa a cada uso)
  counter: {
    type: Number,
    default: 0
  },

  // Transportes suportados (usb, nfc, ble, internal, hybrid)
  transports: {
    type: [String],
    default: []
  },

  // Rótulo amigável (ex: "iPhone do João", "Windows Hello")
  deviceLabel: {
    type: String,
    default: null,
    trim: true
  },

  // Metadados de auditoria
  createdAt: { type: Date, default: Date.now },
  lastUsedAt: { type: Date, default: null },
  userAgent: { type: String, default: null },
  ipAddress: { type: String, default: null }
}, {
  timestamps: true
});

WebAuthnCredentialSchema.index({ userId: 1, createdAt: -1 });
WebAuthnCredentialSchema.index({ lastUsedAt: -1 });

module.exports = mongoose.model('WebAuthnCredential', WebAuthnCredentialSchema);