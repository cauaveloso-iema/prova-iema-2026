// ============================================================================
// backend/eventos/models/ParticipanteEvento.js
// ============================================================================
// Professor participante (única conta do módulo de eventos).
// Dados sensíveis (CPF, RG, telefone, email) criptografados (AES-256-GCM).
// ============================================================================

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

let cryptoUtils = null;
try { cryptoUtils = require('../../utils/crypto-utils'); }
catch (err) {
    console.warn('⚠️ [EVENTOS] crypto-utils não encontrado:', err.message);
    cryptoUtils = {
        encrypt: (v) => v,
        decrypt: (v) => v,
        hash: (v) => v ? String(v) : null,
        mascararCPF: (v) => v ? `***.***.${String(v).slice(-5, -2)}-${String(v).slice(-2)}` : null,
        mascararRG: (v) => v ? `***${String(v).slice(-3)}` : null,
        mascararTelefone: (v) => v ? `(**) *****-${String(v).slice(-4)}` : null,
        mascararEmail: (v) => {
            if (!v || !v.includes('@')) return v;
            const [u, d] = v.split('@');
            return `${u[0]}***@${d}`;
        }
    };
}

const ParticipanteEventoSchema = new mongoose.Schema({
    // ========== LOGIN ==========
    emailHash: { type: String, required: true, unique: true, index: true },
    emailCriptografado: { type: String, required: true },
    senhaHash: { type: String, required: true, select: false },

    // ========== DADOS PESSOAIS (professor) ==========
    nomeCompleto: { type: String, required: true, trim: true },
    dataNascimento: { type: Date, default: null },
    genero: {
        type: String,
        enum: ['masculino', 'feminino', 'outro', 'prefiro_nao_informar', null],
        default: null
    },

    // 🔥 Dados sensíveis: só existem em formato criptografado
    cpfCriptografado: { type: String, default: null },
    cpfHash: { type: String, default: null, index: true },
    rgCriptografado: { type: String, default: null },
    telefoneCriptografado: { type: String, default: null },

    // ========== DADOS PROFISSIONAIS (professor) ==========
    instituicao: { type: String, default: null, trim: true },
    funcao: { type: String, default: null, trim: true },
    serieEstudantes: { type: String, default: null, trim: true },

    // ========== ENDEREÇO ==========
    endereco: {
        cep: { type: String, default: null },
        logradouro: { type: String, default: null },
        numero: { type: String, default: null },
        complemento: { type: String, default: null },
        bairro: { type: String, default: null },
        cidade: { type: String, default: null },
        estado: { type: String, default: null }
    },

    // ========== LGPD ==========
    consentimentoLGPD: {
        aceito: { type: Boolean, default: false },
        dataAceite: { type: Date, default: null },
        versaoTermo: { type: String, default: '1.0' }
    },

    ativo: { type: Boolean, default: true }
}, { timestamps: true, strictPopulate: false });

// ---- Setters / Getters ----
ParticipanteEventoSchema.methods.setCPF = function (cpf) {
    if (!cpf) { this.cpfCriptografado = null; this.cpfHash = null; return; }
    const limpo = String(cpf).replace(/\D/g, '');
    if (limpo.length !== 11) throw new Error('CPF inválido (11 dígitos)');
    this.cpfCriptografado = cryptoUtils.encrypt(limpo);
    this.cpfHash = cryptoUtils.hash(limpo);
};

ParticipanteEventoSchema.methods.getCPF = function () {
    return this.cpfCriptografado ? cryptoUtils.decrypt(this.cpfCriptografado) : null;
};

ParticipanteEventoSchema.methods.getCPFMascarado = function () {
    const cpf = this.getCPF();
    return cpf ? cryptoUtils.mascararCPF(cpf) : null;
};

ParticipanteEventoSchema.methods.setRG = function (rg) {
    this.rgCriptografado = rg ? cryptoUtils.encrypt(String(rg).trim()) : null;
};

ParticipanteEventoSchema.methods.getRG = function () {
    return this.rgCriptografado ? cryptoUtils.decrypt(this.rgCriptografado) : null;
};

ParticipanteEventoSchema.methods.getRGMascarado = function () {
    const rg = this.getRG();
    return rg ? cryptoUtils.mascararRG(rg) : null;
};

ParticipanteEventoSchema.methods.setTelefone = function (tel) {
    this.telefoneCriptografado = tel ? cryptoUtils.encrypt(String(tel).trim()) : null;
};

ParticipanteEventoSchema.methods.getTelefone = function () {
    return this.telefoneCriptografado ? cryptoUtils.decrypt(this.telefoneCriptografado) : null;
};

ParticipanteEventoSchema.methods.getTelefoneMascarado = function () {
    const tel = this.getTelefone();
    return tel ? cryptoUtils.mascararTelefone(tel) : null;
};

ParticipanteEventoSchema.methods.setEmail = function (email) {
    if (!email) throw new Error('E-mail é obrigatório');
    const normalizado = String(email).trim().toLowerCase();
    this.emailCriptografado = cryptoUtils.encrypt(normalizado);
    this.emailHash = cryptoUtils.hash(normalizado);
};

ParticipanteEventoSchema.methods.getEmail = function () {
    return this.emailCriptografado ? cryptoUtils.decrypt(this.emailCriptografado) : null;
};

ParticipanteEventoSchema.methods.getEmailMascarado = function () {
    const email = this.getEmail();
    return email ? cryptoUtils.mascararEmail(email) : null;
};

// ---- Senha ----
ParticipanteEventoSchema.methods.setSenha = async function (senhaPlana) {
    if (!senhaPlana || senhaPlana.length < 6) {
        throw new Error('Senha deve ter no mínimo 6 caracteres');
    }
    const salt = await bcrypt.genSalt(10);
    this.senhaHash = await bcrypt.hash(senhaPlana, salt);
};

ParticipanteEventoSchema.methods.verificarSenha = async function (senhaPlana) {
    if (!this.senhaHash) return false;
    return bcrypt.compare(senhaPlana, this.senhaHash);
};

// ---- Serialização segura ----
ParticipanteEventoSchema.methods.toSafeJSON = function (opcoes = {}) {
    const { incluirSensiveis = false } = opcoes;
    const base = {
        _id: this._id,
        nomeCompleto: this.nomeCompleto,
        dataNascimento: this.dataNascimento,
        genero: this.genero,
        instituicao: this.instituicao,
        funcao: this.funcao,
        serieEstudantes: this.serieEstudantes,
        endereco: this.endereco,
        consentimentoLGPD: this.consentimentoLGPD,
        ativo: this.ativo,
        createdAt: this.createdAt,
        updatedAt: this.updatedAt,
        cpfMascarado: this.getCPFMascarado(),
        rgMascarado: this.getRGMascarado(),
        telefoneMascarado: this.getTelefoneMascarado(),
        emailMascarado: this.getEmailMascarado()
    };
    if (incluirSensiveis) {
        base.cpf = this.getCPF();
        base.rg = this.getRG();
        base.telefone = this.getTelefone();
        base.email = this.getEmail();
    }
    return base;
};

// ============================================================================
// 🔥 GATILHO DE SEGURANÇA (PRE-SAVE)
// ============================================================================
// Impede que dados sensíveis sejam salvos em texto puro.
// Se alguém esquecer de chamar setCPF(), o gatilho criptografa automaticamente.
ParticipanteEventoSchema.pre('save', async function (next) {
    // Se o CPF foi definido em texto puro direto no objeto, corrige
    if (this.cpf && !this.cpfCriptografado) {
        try {
            this.setCPF(this.cpf);
            this.cpf = undefined;
        } catch (e) { return next(e); }
    }
    
    // Se o RG foi definido em texto puro, corrige
    if (this.rg && !this.rgCriptografado) {
        this.setRG(this.rg);
        this.rg = undefined;
    }
    
    // Se o telefone foi definido em texto puro, corrige
    if (this.telefone && !this.telefoneCriptografado) {
        this.setTelefone(this.telefone);
        this.telefone = undefined;
    }
    
    // Se o email foi definido em texto puro, corrige
    if (this.email && !this.emailCriptografado) {
        this.setEmail(this.email);
        this.email = undefined;
    }

    next();
});

module.exports = mongoose.models.ParticipanteEvento
    || mongoose.model('ParticipanteEvento', ParticipanteEventoSchema);