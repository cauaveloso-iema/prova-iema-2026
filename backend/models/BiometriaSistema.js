// ============================================================================
// MODELS/BIOMETRIASISTEMA.JS
// ============================================================================
// Descrição: Modelo centralizado das passkeys de LOGIN (WebAuthn/2FA).
// Usado por routes/biometria.js e pelo painel administrativo.
//
// Diferença para PasskeyCredencial (módulo de inscrições):
//   - PasskeyCredencial → vincula CPF de responsável + inscrição/matrícula
//   - BiometriaSistema  → vincula userId do JWT (usuário do sistema)
//
// Regras de unicidade:
//   - credentialId é único global (mesma passkey não pode existir 2x)
//   - 1 usuário pode ter N dispositivos (N passkeys ativas)
//   - o mesmo userId não pode duplicar o mesmo credentialId
//
// ⚠️ IMPORTANTE:
//   - SEM enum no userRole (aceita qualquer role do sistema sem quebrar)
//   - SEM índice composto redundante (evita conflito de criação)
// ============================================================================

const mongoose = require('mongoose');

const BiometriaSistemaSchema = new mongoose.Schema({
    // 🔥 Vínculo com o usuário do sistema (id do JWT)
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },

    // Cache de identidade (evita JOIN no admin e nos logs)
    userNome: { type: String, default: '', maxlength: 200 },

    // 🔥 SEM ENUM — aceita qualquer role do sistema sem quebrar
    userRole: { type: String, default: '', maxlength: 60 },

    // 🔑 Credencial WebAuthn
    credentialId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    publicKeyJwk: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    alg: { type: Number, default: -7 },
    counter: { type: Number, default: 0 },

    // Metadados do autenticador
    transports: { type: [String], default: [] },
    aaguid: { type: String, default: '' },
    attestationType: { type: String, default: 'none' },
    userVerification: { type: String, default: 'required' },

    // Rótulo amigável: "iPhone do João", "Windows Hello — Notebook"
    deviceLabel: { type: String, default: 'Dispositivo', maxlength: 120 },

    // Challenge persistido (opcional — o fluxo atual usa eco via frontend)
    challengeAtual: { type: String, default: null },
    challengeExpiraEm: { type: Date, default: null },

    // Auditoria
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },

    ativo: { type: Boolean, default: true, index: true },
    ultimoUsoEm: { type: Date, default: null }
}, {
    timestamps: true,
    collection: 'biometrias_sistema'
});

// Índice composto para consultas do admin (userId + ativo).
// ⚠️ NÃO criamos índice { userId, credentialId } porque
// `credentialId` já é `unique: true` globalmente — criar os dois
// gera conflito em algumas versões do MongoDB.
BiometriaSistemaSchema.index({ userId: 1, ativo: 1 });

module.exports = mongoose.models.BiometriaSistema
    || mongoose.model('BiometriaSistema', BiometriaSistemaSchema);