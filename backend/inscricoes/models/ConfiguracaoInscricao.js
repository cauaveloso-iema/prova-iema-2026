// ============================================================================
// backend/inscricoes/models/ConfiguracaoInscricao.js
// Configuração global (singleton) do processo de inscrição socioeconômica
// ============================================================================
'use strict';

const mongoose = require('mongoose');

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

const ConfiguracaoInscricaoSchema = new mongoose.Schema({
    chave: { type: String, default: 'principal', unique: true, index: true },

    anoLetivo: { type: Number, default: () => new Date().getFullYear() },
    serie: { type: String, default: '1ª Série do Ensino Médio' },

    titulo: {
        type: String,
        default: 'Instituto de Educação, Ciência e Tecnologia do Maranhão — IEMA'
    },
    subtitulo: { type: String, default: '1ª Série do Ensino Médio' },
    objetivo: {
        type: String,
        default: 'Este formulário tem como objetivo coletar informações socioeconômicas dos alunos e de suas famílias ' +
                 'para subsidiar o planejamento pedagógico e assistencial da instituição.'
    },

    dataInicio: { type: Date, default: () => new Date() },
    dataFim: {
        type: Date,
        default: () => { const d = new Date(); d.setMonth(d.getMonth() + 2); return d; }
    },

    vagas: { type: Number, default: 0, min: 0 },          // 0 = ilimitado
    ativo: { type: Boolean, default: true },

    bloquearDuplicadas: { type: Boolean, default: true },  // 1 inscrição por CPF/ano
    permiteConsultaPublica: { type: Boolean, default: true },

    versaoTermo: { type: String, default: '1.0' },

    mensagemEncerrado: {
        type: String,
        default: 'As inscrições para este processo estão encerradas. Procure a secretaria da unidade.'
    },
    mensagemTopo: {
        type: String,
        default: 'Preencha com atenção. Você receberá um protocolo ao final para acompanhar sua inscrição.'
    }
}, { timestamps: true });

/**
 * Obtém (ou cria atomicamente) o singleton de configuração.
 * Usa findOneAndUpdate + upsert para evitar E11000 duplicate key
 * em requests simultâneos quando a config ainda não existe.
 */
ConfiguracaoInscricaoSchema.statics.obter = async function () {
    try {
        const cfg = await this.findOneAndUpdate(
            { chave: 'principal' },
            { $setOnInsert: { chave: 'principal' } },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );
        return cfg;
    } catch (err) {
        // Fallback: se por algum motivo o upsert falhar, tenta ler/criar
        let cfg = await this.findOne({ chave: 'principal' });
        if (!cfg) cfg = await this.create({ chave: 'principal' });
        return cfg;
    }
};

ConfiguracaoInscricaoSchema.methods.estaAberto = function () {
    const agora = new Date();
    return !!this.ativo && agora >= new Date(this.dataInicio) && agora <= new Date(this.dataFim);
};

const ConfiguracaoInscricao = mongoose.models.ConfiguracaoInscricao
    || mongoose.model('ConfiguracaoInscricao', ConfiguracaoInscricaoSchema);

ConfiguracaoInscricao.ESCOLARIDADES = ESCOLARIDADES;
ConfiguracaoInscricao.FAIXAS_RENDA = FAIXAS_RENDA;
ConfiguracaoInscricao.PROGRAMAS_SOCIAIS = PROGRAMAS_SOCIAIS;
ConfiguracaoInscricao.GRAUS_PARENTESCO = GRAUS_PARENTESCO;

module.exports = ConfiguracaoInscricao;