// models/GestaoProfessor.js
// Model para Gestão de Professores - Setor Pedagógico
// ⚠️ VERSÃO 2.0 — Aulas vinculadas a PERÍODO (select) + Turma + Disciplina
const mongoose = require('mongoose');

// ============================================
// SCHEMA: COMPONENTE CURRICULAR
// (1 componente = 1 disciplina + 1 turma + 1 período + N aulas)
// ============================================
const ComponenteCurricularSchema = new mongoose.Schema({
    // Referência ao componente curricular do banco (se existir)
    componenteCurricularId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ComponenteCurricular',
        default: null
    },
    
    // Nome da disciplina/componente
    nome: {
        type: String,
        required: [true, 'Nome do componente é obrigatório'],
        trim: true
    },
    
    // Eixo (Linguagens, Matemática, etc)
    eixo: {
        type: String,
        trim: true,
        default: null
    },
    
    // Turma vinculada
    turma: {
        type: String,
        required: [true, 'Turma é obrigatória'],
        trim: true
    },
    
    // Curso da turma (preenchido automaticamente)
    curso: {
        type: String,
        trim: true,
        default: null
    },
    
    // 🆕 PERÍODO (select: "1", "2", "3", "4" ou outro ID de período letivo)
    periodo: {
        type: String,
        trim: true,
        default: null
    },
    
    // 🆕 NÚMERO DE AULAS REGISTRADAS NO PERÍODO (número único)
    // ⚠️ Aceita também o formato ANTIGO { periodo1..4 } para compatibilidade.
    //    Os helpers da rota normalizam antes de gravar, mas deixamos o Mixed
    //    aqui para não quebrar registros antigos caso alguém grave direto pelo banco.
    aulasRegistradas: {
        type: mongoose.Schema.Types.Mixed,
        default: 0
    },
    
    // Carga horária anual (digitado)
    cargaHorariaAnual: {
        type: Number,
        default: 0,
        min: 0
    },
    
    // Carga horária semanal (digitado)
    cargaHorariaSemanal: {
        type: Number,
        default: 0,
        min: 0
    },
    
    // Observações, sugestões, metas, prós e contras
    observacoes: {
        type: String,
        trim: true,
        default: ''
    }
}, { _id: true });

// ============================================
// SCHEMA PRINCIPAL: GESTÃO DE PROFESSOR
// ============================================
const GestaoProfessorSchema = new mongoose.Schema({
    // ========== PROFESSOR ==========
    professorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Professor é obrigatório']
    },
    
    // Snapshot dos dados do professor (para histórico)
    professorNome: {
        type: String,
        required: true,
        trim: true
    },
    professorEmail: {
        type: String,
        trim: true,
        default: ''
    },
    professorMatricula: {
        type: String,
        trim: true,
        default: ''
    },
    professorEixo: {
        type: String,
        trim: true,
        default: ''
    },
    professorTelefone: {
        type: String,
        trim: true,
        default: ''
    },
    professorCPF: {
        type: String,
        trim: true,
        default: ''
    },
    professorDepartamento: {
        type: String,
        trim: true,
        default: ''
    },
    professorTitulacao: {
        type: String,
        trim: true,
        default: ''
    },
    
    // ========== TURMAS VINCULADAS ==========
    turmasVinculadas: [{
        turma: { type: String, trim: true },
        curso: { type: String, trim: true, default: '' }
    }],
    
    // ========== COMPONENTES CURRICULARES ==========
    componentes: [ComponenteCurricularSchema],
    
    // ========== DATA DA COLETA ==========
    dataColeta: {
        type: Date,
        required: [true, 'Data da coleta é obrigatória'],
        default: Date.now
    },
    
    // ========== OBSERVAÇÕES GERAIS ==========
    observacoesGerais: {
        type: String,
        trim: true,
        default: ''
    },
    
    // ========== CONTROLE ==========
    ativo: {
        type: Boolean,
        default: true
    },
    
    registradoPor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    registradoPorNome: {
        type: String,
        trim: true,
        default: ''
    },
    registradoPorEmail: {
        type: String,
        trim: true,
        default: ''
    },
    registradoEm: {
        type: Date,
        default: Date.now
    },
    
    editadoPor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    editadoPorNome: {
        type: String,
        trim: true,
        default: ''
    },
    editadoEm: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

// ============================================
// ÍNDICES
// ============================================
GestaoProfessorSchema.index({ professorId: 1 });
GestaoProfessorSchema.index({ professorNome: 1 });
GestaoProfessorSchema.index({ dataColeta: -1 });
GestaoProfessorSchema.index({ ativo: 1 });
GestaoProfessorSchema.index({ 'componentes.eixo': 1 });
GestaoProfessorSchema.index({ 'componentes.turma': 1 });
GestaoProfessorSchema.index({ 'componentes.periodo': 1 });   // 🆕

// ============================================
// MÉTODOS ESTÁTICOS
// ============================================
GestaoProfessorSchema.statics.buscarPorProfessor = async function(professorId) {
    return this.find({ professorId, ativo: true })
        .sort({ dataColeta: -1 })
        .lean();
};

GestaoProfessorSchema.statics.buscarPorEixo = async function(eixo) {
    return this.find({ 'componentes.eixo': eixo, ativo: true })
        .sort({ dataColeta: -1 })
        .lean();
};

// 🆕 Busca por período
GestaoProfessorSchema.statics.buscarPorPeriodo = async function(periodo) {
    return this.find({ 'componentes.periodo': String(periodo), ativo: true })
        .sort({ dataColeta: -1 })
        .lean();
};

// ============================================
// HELPERS (usados pelos virtuais)
// ============================================
// Normaliza aulas: se for objeto antigo { periodo1..4 }, soma; se for número, retorna.
function normalizarAulasValor(aulas) {
    if (aulas === null || aulas === undefined) return 0;
    if (typeof aulas === 'number') return isNaN(aulas) ? 0 : aulas;
    if (typeof aulas === 'string') {
        const n = parseInt(aulas, 10);
        return isNaN(n) ? 0 : n;
    }
    if (typeof aulas === 'object') {
        return (
            (parseInt(aulas.periodo1, 10) || 0) +
            (parseInt(aulas.periodo2, 10) || 0) +
            (parseInt(aulas.periodo3, 10) || 0) +
            (parseInt(aulas.periodo4, 10) || 0)
        );
    }
    return 0;
}

// ============================================
// VIRTUALS
// ============================================
GestaoProfessorSchema.virtual('totalComponentes').get(function() {
    return this.componentes ? this.componentes.length : 0;
});

// 🆕 Total de aulas (funciona nos dois formatos)
GestaoProfessorSchema.virtual('totalAulasRegistradas').get(function() {
    if (!this.componentes) return 0;
    return this.componentes.reduce((total, c) => {
        return total + normalizarAulasValor(c.aulasRegistradas);
    }, 0);
});

// ============================================
// TO JSON / TO OBJECT
// ============================================
GestaoProfessorSchema.set('toJSON', { virtuals: true });
GestaoProfessorSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('GestaoProfessor', GestaoProfessorSchema);