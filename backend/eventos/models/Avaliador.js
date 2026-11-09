// ============================================================================
// backend/eventos/models/Avaliador.js
// ============================================================================
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const AvaliadorSchema = new mongoose.Schema({
    nomeCompleto: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    senhaHash: { type: String, required: true, select: false },

    eventos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Evento' }],

    // 🔥 especialidades (usado para filtro na atribuição manual)
    // ex: ['robótica', 'ciências', 'matemática']
    especialidades: { type: [String], default: [] },

    status: {
        type: String,
        enum: ['Ativo', 'Inativo', 'Pendente'],
        default: 'Pendente'
    },

    isCoordenador: { type: Boolean, default: false },

    ultimoAcesso: { type: Date, default: null },

    // 🔑 SENHA TEMPORÁRIA / TROCA OBRIGATÓRIA
    senhaTemporaria:   { type: Boolean, default: false },
    senhaTemporariaEm: { type: Date,    default: null  },
    ultimaTrocaSenha:  { type: Date,    default: null  }
}, { timestamps: true });

AvaliadorSchema.methods.setSenha = async function (senha) {
    if (!senha || senha.length < 6) throw new Error('Senha deve ter no mínimo 6 caracteres');
    const salt = await bcrypt.genSalt(10);
    this.senhaHash = await bcrypt.hash(senha, salt);
};

AvaliadorSchema.methods.verificarSenha = async function (senha) {
    if (!this.senhaHash) return false;
    return bcrypt.compare(senha, this.senhaHash);
};

AvaliadorSchema.methods.toSafeJSON = function () {
    return {
        _id: this._id,
        nomeCompleto: this.nomeCompleto,
        email: this.email,
        eventos: this.eventos,
        especialidades: this.especialidades || [],
        status: this.status,
        isCoordenador: this.isCoordenador,
        senhaTemporaria: this.senhaTemporaria === true,
        ultimoAcesso: this.ultimoAcesso,
        ultimaTrocaSenha: this.ultimaTrocaSenha,
        createdAt: this.createdAt
    };
};

module.exports = mongoose.models.Avaliador || mongoose.model('Avaliador', AvaliadorSchema);