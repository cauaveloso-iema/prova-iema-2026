// ============================================================================
// backend/eventos/models/ModeloEvento.js
// ============================================================================

const mongoose = require('mongoose');

const CampoSchema = new mongoose.Schema({
    label: { type: String, required: true },
    tipo: {
        type: String,
        enum: ['text', 'date', 'number', 'email', 'tel', 'cpf', 'rg', 'textarea', 'select'],
        default: 'text'
    },
    opcoes: [{ type: String }],
    obrigatorio: { type: Boolean, default: false },
    placeholder: { type: String, default: '' },
    ajuda: { type: String, default: '' },
    origemIA: { type: Boolean, default: false }
}, { _id: true });

// 🔥 Critério de avaliação
const CriterioAvaliacaoSchema = new mongoose.Schema({
    label: { type: String, required: true, trim: true },
    descricao: { type: String, default: '' },
    notaMaxima: { type: Number, default: 5, min: 0 },
    obrigatorio: { type: Boolean, default: true },
    origemIA: { type: Boolean, default: false }
}, { _id: true });

// 🔥 Legenda de notas
const LegendaNotaSchema = new mongoose.Schema({
    valor: { type: Number, required: true },
    label: { type: String, required: true, trim: true }
}, { _id: false });

const AnexoSchema = new mongoose.Schema({
    tipo: {
        type: String,
        enum: ['edital', 'formulario', 'termo_lgpd', 'termo_imagem', 'outro', 'ficha_avaliacao'],
        default: 'outro'
    },
    labelCustom: { type: String, default: '' },
    nomeOriginal: { type: String, required: true },
    arquivo: { type: String, required: true },
    mimetype: { type: String, default: null },
    tamanho: { type: Number, default: 0 },

    campos: { type: [CampoSchema], default: [] },

    // Repetíveis (por aluno)
    repetivel: { type: Boolean, default: false },
    labelGrupoRepetivel: { type: String, default: '' },
    camposRepetiveis: { type: [CampoSchema], default: [] },
    quantidadePadrao: { type: Number, default: 1, min: 1, max: 50 },
    maxRepeticoes: { type: Number, default: 10, min: 1, max: 50 },

    // Assinatura e Leitura
    exigeAssinatura: { type: Boolean, default: false },
    exibeModalLeitura: { type: Boolean, default: true },
    tipoDadosTermo: {
        type: String,
        enum: ['auto', 'professor', 'estudante'],
        default: 'auto'
    },

    // Solicitação de anexo pelo participante
    solicitaAnexo: { type: Boolean, default: false },
    labelSolicitacaoAnexo: { type: String, default: '' },
    anexoSolicitacaoObrigatorio: { type: Boolean, default: false },

    // ============================================================
    // Configuração de Avaliação
    // ============================================================
    isAvaliativo: { type: Boolean, default: false },
    numAvaliadores: { type: Number, default: 1, min: 1 },

    // 🔥 NOVO: Como as avaliações são distribuídas
    //  'aleatorio' = o sistema sorteia automaticamente os avaliadores
    //                (o avaliador vinculado vê a inscrição na lista de pendentes)
    //  'manual'    = o coordenador/admin precisa atribuir cada avaliação
    modoDistribuicao: {
        type: String,
        enum: ['aleatorio', 'manual'],
        default: 'aleatorio'
    },

    // 🔥 NOVO: Se deve calcular a média final automaticamente
    calcularMedia: { type: Boolean, default: true },

    // 🔥 NOVO: Tipo de média
    //  'aritmetica' = soma das notas / quantidade
    //  'ponderada'  = (reservado para o futuro)
    tipoMedia: {
        type: String,
        enum: ['aritmetica', 'ponderada'],
        default: 'aritmetica'
    },

    // 🔥 NOVO: Exige assinatura do avaliador ao emitir parecer
    exigeAssinaturaAvaliador: { type: Boolean, default: false },

    // 🔥 Critérios de avaliação
    criteriosAvaliacao: { type: [CriterioAvaliacaoSchema], default: [] },

    // 🔥 Informações do documento
    informacoesDocumento: { type: String, default: '' },

    // 🔥 Legenda de notas
    legendasNotas: { type: [LegendaNotaSchema], default: [] }
}, { _id: true });

const ModeloEventoSchema = new mongoose.Schema({
    nomeModelo: { type: String, required: true, trim: true },
    descricao: { type: String, default: '' },
    anexos: { type: [AnexoSchema], default: [] },
    camposDinamicos: { type: [CampoSchema], default: [] },
    ativo: { type: Boolean, default: true },
    criadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // Configuração geral de avaliação
    requerAvaliacao: { type: Boolean, default: false },

    // Define se o participante pode se inscrever mais de uma vez
    permiteMultiplasInscricoes: { type: Boolean, default: false }
}, { timestamps: true, strictPopulate: false });

ModeloEventoSchema.pre('save', function (next) {
    const todos = [];
    const vistos = new Set();
    for (const anexo of (this.anexos || [])) {
        for (const c of (anexo.campos || [])) {
            const chave = String(c.label || '').toLowerCase().trim();
            if (!chave || vistos.has(chave)) continue;
            vistos.add(chave);
            todos.push(c);
        }
    }
    this.camposDinamicos = todos;
    next();
});

module.exports = mongoose.models.ModeloEvento
    || mongoose.model('ModeloEvento', ModeloEventoSchema);