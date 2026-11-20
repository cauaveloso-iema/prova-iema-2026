// ============================================================================
// backend/inscricoes/models/PasskeyCredencial.js
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

    // 🔥 CAMPOS DE VÍNCULO
    inscricaoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Formulario', default: null },
    matriculaId: { type: mongoose.Schema.Types.ObjectId, default: null }, // ID do User (aluno antigo)
    alunoNome: { type: String, default: '' }, // Nome do aluno salvo direto no cadastro
    alunoTurma: { type: String, default: '' }, // 🔥 NOVO: turma do aluno
    alunoCurso: { type: String, default: '' }, // 🔥 NOVO: curso do aluno
    alunoOrigem: { type: String, default: '' }, // 🔥 NOVO: 'Inscrição' | 'Matrícula'

    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },

    ativo: { type: Boolean, default: true, index: true },
    ultimoUsoEm: { type: Date, default: null }
}, {
    timestamps: true,
    collection: 'passkeycredenciais'
});

PasskeyCredencialSchema.index({ responsavelCpfHash: 1, ativo: 1 });
PasskeyCredencialSchema.index({ alunoNome: 'text' });
PasskeyCredencialSchema.index({ alunoTurma: 1 }); // 🔥 índice para filtro de turma

const PasskeyCredencial = mongoose.models.PasskeyCredencial
    || mongoose.model('PasskeyCredencial', PasskeyCredencialSchema);

module.exports = PasskeyCredencial;