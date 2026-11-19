// ============================================================================
// backend/inscricoes/models/Formulario.js
// Inscrição socioeconômica (aluno + responsável + família)
//
// NOTA: o model foi renomeado de "Inscricao" para "Formulario" para evitar
// colisão com o model "Inscricao" do módulo de eventos (que exige
// eventoId/participanteId). A coleção permanece "inscricaos" para preservar
// dados existentes.
// ============================================================================
'use strict';

const mongoose = require('mongoose');
const crypto = require('crypto');

// ---- Require defensivo dos helpers de segurança -----------------------------
let seguranca;
try {
    seguranca = require('../utils/seguranca');
} catch (err) {
    console.error('⚠️ [INSCRIÇÕES] utils/seguranca não carregado, usando fallback inline:', err.message);
    const PEPPER = process.env.INSCRICOES_HASH_PEPPER
        || process.env.JWT_SECRET
        || 'educapleno::inscricoes::pepper';
    seguranca = {
        soDigitos: (v) => String(v == null ? '' : v).replace(/\D+/g, ''),
        hashCPF: (cpf) => {
            const d = String(cpf == null ? '' : cpf).replace(/\D+/g, '');
            if (d.length !== 11) return null;
            return crypto.createHmac('sha256', PEPPER).update(d).digest('hex');
        }
    };
}

const { hashCPF, soDigitos } = seguranca;

const ESCOLARIDADES = [
    'Ensino Fundamental Incompleto',
    'Ensino Fundamental Completo',
    'Ensino Médio Incompleto',
    'Ensino Médio Completo',
    'Ensino Superior Incompleto',
    'Ensino Superior Completo',
    'Não Alfabetizado',
    'Não sei informar'
];

const FAIXAS_RENDA = [
    'Até 1 salário mínimo',
    'De 1 a 2 salários mínimos',
    'De 2 a 3 salários mínimos',
    'Acima de 3 salários mínimos'
];

const PROGRAMAS_SOCIAIS = ['Bolsa Família', 'Auxílio Brasil', 'Nenhum', 'Outro'];

const GRAUS_PARENTESCO = [
    'Pai', 'Mãe', 'Padrasto/Madrasta', 'Avô/Avó',
    'Irmãos', 'Tios', 'Primos', 'Filhos', 'Outros'
];

const VINCULOS_RESPONSAVEL = [
    'Mãe', 'Pai', 'Avó/Avô', 'Tia/Tio', 'Irmã/Irmão',
    'Tutor(a) legal', 'Outro'
];

const SEXOS = ['Masculino', 'Feminino', 'Outro', 'Prefiro não informar'];

const STATUS = ['Pendente', 'Em análise', 'Aprovada', 'Concluída', 'Cancelada'];

// ---------------------------------------------------------------- Aluno
const AlunoSchema = new mongoose.Schema({
    nomeCompleto: { type: String, required: true, trim: true },
    dataNascimento: { type: Date, required: true },
    cpf: { type: String, required: true },
    cpfHash: { type: String, index: true },
    email: { type: String, default: '', lowercase: true, trim: true },
    sexo: { type: String, enum: [...SEXOS, ''], default: '' },
    rg: { type: String, default: '' },
    temCadUnico: { type: Boolean, default: false },
    nis: { type: String, default: '' },
    telefone: { type: String, required: true }
}, { _id: false });

// ---------------------------------------------------------------- Responsável
const ResponsavelSchema = new mongoose.Schema({
    nomeCompleto: { type: String, required: true, trim: true },
    dataNascimento: { type: Date, required: true },
    cpf: { type: String, required: true },
    email: { type: String, default: '', lowercase: true, trim: true },
    sexo: { type: String, enum: [...SEXOS, ''], default: '' },
    rg: { type: String, default: '' },
    grauParentesco: { type: String, enum: [...VINCULOS_RESPONSAVEL, ''], default: '' },
    temCadUnico: { type: Boolean, default: false },
    nis: { type: String, default: '' },
    telefone: { type: String, required: true }
}, { _id: false });

// ---------------------------------------------------------------- Endereço
const EnderecoSchema = new mongoose.Schema({
    cep: { type: String, default: '' },
    logradouro: { type: String, default: '' },
    numero: { type: String, default: '' },
    complemento: { type: String, default: '' },
    bairro: { type: String, default: '' },
    cidade: { type: String, default: '' },
    estado: { type: String, default: '' }
}, { _id: false });

// ---------------------------------------------------------------- Composição familiar
const ComposicaoFamiliarSchema = new mongoose.Schema({
    pessoasResidem: { type: Number, default: 1, min: 0 },
    grausParentesco: { type: [String], default: [] },
    dependentesMenores: { type: Number, default: 0, min: 0 },
    escolaridadePai: { type: String, enum: [...ESCOLARIDADES, ''], default: '' },
    escolaridadeMae: { type: String, enum: [...ESCOLARIDADES, ''], default: '' },
    ocupacaoPai: { type: String, default: '' },
    ocupacaoMae: { type: String, default: '' }
}, { _id: false });

// ---------------------------------------------------------------- Condição de moradia
const CondicaoMoradiaSchema = new mongoose.Schema({
    aguaEncanada: { type: Boolean, default: false },
    energiaEletrica: { type: Boolean, default: false },
    esgotoSanitario: { type: Boolean, default: false },
    internetBandaLarga: { type: Boolean, default: false }
}, { _id: false });

// ---------------------------------------------------------------- Renda familiar
const RendaFamiliarSchema = new mongoose.Schema({
    faixaRenda: { type: String, enum: [...FAIXAS_RENDA, ''], default: '' },
    programasSociais: { type: [String], default: [] },
    programaOutro: { type: String, default: '' }
}, { _id: false });

// ---------------------------------------------------------------- Informações adicionais
const InformacoesAdicionaisSchema = new mongoose.Schema({
    possuiDeficiencia: { type: Boolean, default: false },
    deficienciaQual: { type: String, default: '' },
    acessoDispositivos: { type: Boolean, default: false }
}, { _id: false });

// ---------------------------------------------------------------- LGPD
const LgpdSchema = new mongoose.Schema({
    aceito: { type: Boolean, default: false },
    aceitoEm: { type: Date, default: null },
    versaoTermo: { type: String, default: '' },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' }
}, { _id: false });

// ---------------------------------------------------------------- Histórico
const HistoricoSchema = new mongoose.Schema({
    status: { type: String, default: '' },
    em: { type: Date, default: Date.now },
    por: { type: String, default: 'Sistema' },
    observacao: { type: String, default: '' }
}, { _id: false });

// ================================================================ SCHEMA
const FormularioSchema = new mongoose.Schema({
    protocolo: { type: String, required: true, unique: true, index: true },

    anoLetivo: { type: Number, required: true, index: true },
    serie: { type: String, default: '1ª Série do Ensino Médio' },

    origem: { type: String, enum: ['Publico', 'Manual', 'Importacao'], default: 'Publico' },

    aluno: { type: AlunoSchema, required: true },
    responsavel: { type: ResponsavelSchema, required: true },
    endereco: { type: EnderecoSchema, default: () => ({}) },
    composicaoFamiliar: { type: ComposicaoFamiliarSchema, default: () => ({}) },
    condicaoMoradia: { type: CondicaoMoradiaSchema, default: () => ({}) },
    rendaFamiliar: { type: RendaFamiliarSchema, default: () => ({}) },
    informacoesAdicionais: { type: InformacoesAdicionaisSchema, default: () => ({}) },

    lgpd: { type: LgpdSchema, default: () => ({}) },

    status: { type: String, enum: STATUS, default: 'Pendente', index: true },
    observacoesAdmin: { type: String, default: '' },

    historico: { type: [HistoricoSchema], default: [] }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    // ⚠️ IMPORTANTE: mantém a coleção original "inscricaos" para preservar
    // dados já gravados antes da renomeação do model.
    collection: 'inscricaos'
});

// Índices compostos úteis
FormularioSchema.index({ anoLetivo: 1, status: 1 });
FormularioSchema.index({ cpfHash: 1, anoLetivo: 1 });
FormularioSchema.index({ createdAt: -1 });
FormularioSchema.index({ 'aluno.nomeCompleto': 'text', 'responsavel.nomeCompleto': 'text' });

// ---------------------------------------------------------------- Hooks
FormularioSchema.pre('save', function (next) {
    try {
        if (this.aluno) {
            if (this.aluno.cpf) this.aluno.cpf = soDigitos(this.aluno.cpf);
            if (this.aluno.telefone) this.aluno.telefone = soDigitos(this.aluno.telefone);
            if (this.aluno.nis) this.aluno.nis = soDigitos(this.aluno.nis);
            this.aluno.cpfHash = hashCPF(this.aluno.cpf);
        }
        if (this.responsavel) {
            if (this.responsavel.cpf) this.responsavel.cpf = soDigitos(this.responsavel.cpf);
            if (this.responsavel.telefone) this.responsavel.telefone = soDigitos(this.responsavel.telefone);
            if (this.responsavel.nis) this.responsavel.nis = soDigitos(this.responsavel.nis);
        }
        if (this.endereco && this.endereco.cep) {
            this.endereco.cep = soDigitos(this.endereco.cep);
        }
    } catch (_) { /* nunca bloqueia o save por causa do hash */ }
    next();
});

FormularioSchema.methods.registrarStatus = function (novoStatus, por, observacao) {
    this.status = novoStatus;
    this.historico.push({
        status: novoStatus,
        em: new Date(),
        por: por || 'Sistema',
        observacao: observacao || ''
    });
};

// ⚠️ Nome do model: 'Formulario' (único, sem colisão com 'Inscricao' de eventos)
const Formulario = mongoose.models.Formulario
    || mongoose.model('Formulario', FormularioSchema);

Formulario.ESCOLARIDADES = ESCOLARIDADES;
Formulario.FAIXAS_RENDA = FAIXAS_RENDA;
Formulario.PROGRAMAS_SOCIAIS = PROGRAMAS_SOCIAIS;
Formulario.GRAUS_PARENTESCO = GRAUS_PARENTESCO;
Formulario.VINCULOS_RESPONSAVEL = VINCULOS_RESPONSAVEL;
Formulario.SEXOS = SEXOS;
Formulario.STATUS = STATUS;

module.exports = Formulario;