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

    modoDistribuicao: {
        type: String,
        enum: ['aleatorio', 'manual'],
        default: 'aleatorio'
    },

    calcularMedia: { type: Boolean, default: true },

    tipoMedia: {
        type: String,
        enum: ['aritmetica', 'ponderada'],
        default: 'aritmetica'
    },

    exigeAssinaturaAvaliador: { type: Boolean, default: false },

    criteriosAvaliacao: { type: [CriterioAvaliacaoSchema], default: [] },

    informacoesDocumento: { type: String, default: '' },

    legendasNotas: { type: [LegendaNotaSchema], default: [] }
}, { _id: true });

// 🔥 NOVO: Schema para Anexos Extras (Passo 1.5)
const AnexoExtraSchema = new mongoose.Schema({
    label: { type: String, required: true, trim: true },
    obrigatorio: { type: Boolean, default: false },
    ajuda: { type: String, default: '' }
}, { _id: true });

// 🔥 NOVO: Schema para Categorias/Modalidades
const CategoriaSchema = new mongoose.Schema({
    label: { type: String, required: true, trim: true }
}, { _id: true });

const ModeloEventoSchema = new mongoose.Schema({
    nomeModelo: { type: String, required: true, trim: true },
    descricao: { type: String, default: '' },
    anexos: { type: [AnexoSchema], default: [] },
    camposDinamicos: { type: [CampoSchema], default: [] },
    
    // 🔥 Documentos extras que o participante deve anexar
    anexosExtras: { type: [AnexoExtraSchema], default: [] },

    // 🔥 NOVO: Categorias/Modalidades
    usarCategorias: { type: Boolean, default: false },
    labelCategorias: { type: String, default: 'Categoria / Modalidade' },
    categorias: { type: [CategoriaSchema], default: [] },
    categoriaObrigatoria: { type: Boolean, default: true },

    ativo: { type: Boolean, default: true },
    criadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    requerAvaliacao: { type: Boolean, default: false },
    permiteMultiplasInscricoes: { type: Boolean, default: false },

    usarSistemaCotas: { type: Boolean, default: false },
    publicoLaudoCotas: {
        type: String,
        enum: ['professor', 'aluno', 'ambos'],
        default: 'professor'
    },
    labelLaudoCotas: { type: String, default: 'Laudo Médico' },
    laudoCotasObrigatorio: { type: Boolean, default: true }
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