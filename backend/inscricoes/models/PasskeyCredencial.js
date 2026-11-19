// ============================================================================
// backend/inscricoes/models/PasskeyCredencial.js
//
// Armazena as credenciais WebAuthn (passkeys) dos responsáveis.
// Criadas durante a inscrição. A autenticação virá depois.
// ============================================================================
'use strict';

const mongoose = require('mongoose');

const PasskeyCredencialSchema = new mongoose.Schema({
    responsavelCpfHash: { type: String, required: true, index: true },
    responsavelNome: { type: String, default: '' },

    credentialId: { type: String, required: true, unique: true, index: true },
    publicKeyJwk: { type: mongoose.Schema.Types.Mixed, required: true },
    alg: { type: Number, default: -7 },
    counter: { type: Number, default: 0 },

    transports: { type: [String], default: [] },
    aaguid: { type: String, default: '' },
    attestationType: { type: String, default: 'none' },
    userVerification: { type: String, default: 'required' },

    inscricaoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Formulario', default: null },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },

    ativo: { type: Boolean, default: true, index: true },
    ultimoUsoEm: { type: Date, default: null }
}, {
    timestamps: true,
    collection: 'passkeycredenciais'
});

PasskeyCredencialSchema.index({ responsavelCpfHash: 1, ativo: 1 });

const PasskeyCredencial = mongoose.models.PasskeyCredencial
    || mongoose.model('PasskeyCredencial', PasskeyCredencialSchema);

module.exports = PasskeyCredencial;