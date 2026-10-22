// backend/models/Autorizacao.js
const mongoose = require('mongoose');

const AutorizacaoSchema = new mongoose.Schema({
    tipo: {
        type: String,
        enum: ['autorizacao', 'justificativa', 'segunda_chamada', 'uniforme'],
        default: 'autorizacao',
        required: true
    },
    
    alunoId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    alunoNome: { type: String, required: true },
    alunoMatricula: String,
    alunoTurma: { type: String, required: true },
    alunoCurso: String,
    alunoFoto: String,
    
    data: { type: Date, required: true, default: Date.now },
    horarioEntrada: String,
    horarioSaida: String,
    
    // 🆕 DATAS DE ENTRADA/SAÍDA (quando o aluno efetivamente entra/sai)
    // Ex.: aluno vai entrar amanhã (23/10) às 10h
    //      dataEntrada = 2025-10-23 | horarioEntrada = "10:00"
    dataEntrada: { type: Date, default: null },
    dataSaida:   { type: Date, default: null },
    
    periodoFaltaInicio: { type: Date, default: null },
    periodoFaltaFim: { type: Date, default: null },
    
    // 🆕 PERÍODO DA AUTORIZAÇÃO DE UNIFORME
    uniformePeriodoInicio: { type: Date, default: null },
    uniformePeriodoFim: { type: Date, default: null },
    
    responsavelNome: String,
    responsavelCPF: String,
    responsavelTelefone: String,
    
    // ===== ASSINATURA DIGITAL =====
    assinaturaBase64: { type: String, default: '' },
    temAssinatura: { type: Boolean, default: false, index: true },
    
    // 🆕 STATUS DE ASSINATURA
    statusAssinatura: {
        type: String,
        enum: ['nao_necessaria', 'pendente', 'assinada'],
        default: 'nao_necessaria',
        index: true
    },
    assinadaEm: { type: Date, default: null },
    assinadaPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    assinadaPorNome: { type: String, default: null },
    
    // 🆕 CONTROLE DE VISTO PELA SECRETARIA
    vistoSecretaria: { type: Boolean, default: false, index: true },
    vistoSecretariaPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    vistoSecretariaPorNome: { type: String, default: null },
    vistoSecretariaEm: { type: Date, default: null },
    
    motivo: { type: String, required: true },
    motivoOutros: String,
    
    tipoProvaPerdida: {
        type: String,
        enum: ['AV1', 'AV2', 'AV3', 'AV4', 'Recuperação', 'Outros', null],
        default: null
    },
    tipoProvaPerdidaOutros: String,
    
    // 🆕 PERÍODO DA PROVA (2ª Chamada)
    periodoProva: {
        type: String,
        enum: ['1º Período', '2º Período', '3º Período', '4º Período', null],
        default: null
    },
    
    horarioAusencia: String,
    horarioRetorno: String,
    
    observacoes: String,
    
    atualizadoEm: { type: Date, default: null },
    atualizadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    atualizadoPorNome: { type: String, default: null },
    
    origemTipo: {
        type: String,
        enum: ['autorizacao', 'segunda_chamada', 'justificativa', 'manual', 'setor_pedagogico_2chamada', 'uniforme', null],
        default: 'manual'
    },
    origemId: { type: mongoose.Schema.Types.ObjectId, default: null },
    
    registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    registradoPorNome: String,
    
    ativo: { type: Boolean, default: true },
    
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// ============================================
// ÍNDICES
// ============================================
AutorizacaoSchema.index({ tipo: 1, createdAt: -1 });
AutorizacaoSchema.index({ alunoId: 1, createdAt: -1 });
AutorizacaoSchema.index({ alunoTurma: 1, createdAt: -1 });
AutorizacaoSchema.index({ data: -1 });
AutorizacaoSchema.index({ dataEntrada: -1 });
AutorizacaoSchema.index({ dataSaida: -1 });
AutorizacaoSchema.index({ periodoFaltaInicio: -1 });
AutorizacaoSchema.index({ periodoFaltaFim: -1 });
AutorizacaoSchema.index({ uniformePeriodoInicio: -1 });
AutorizacaoSchema.index({ uniformePeriodoFim: -1 });
AutorizacaoSchema.index({ motivo: 1 });
AutorizacaoSchema.index({ tipoProvaPerdida: 1 });
AutorizacaoSchema.index({ periodoProva: 1 });
AutorizacaoSchema.index({ origemTipo: 1, origemId: 1 });
AutorizacaoSchema.index({ statusAssinatura: 1, createdAt: -1 });
AutorizacaoSchema.index({ vistoSecretaria: 1, createdAt: -1 });

// ============================================
// MIDDLEWARE
// ============================================
AutorizacaoSchema.pre('save', function(next) {
    this.temAssinatura = !!(this.assinaturaBase64 && this.assinaturaBase64.length > 100);
    
    if (this.temAssinatura) {
        this.statusAssinatura = 'assinada';
    } else if (this.statusAssinatura !== 'pendente') {
        this.statusAssinatura = 'nao_necessaria';
    }
    
    if (this.periodoFaltaInicio && !this.periodoFaltaFim) {
        this.periodoFaltaFim = this.periodoFaltaInicio;
    }
    if (!this.periodoFaltaInicio && this.periodoFaltaFim) {
        this.periodoFaltaFim = null;
    }
    
    if (this.uniformePeriodoInicio && !this.uniformePeriodoFim) {
        this.uniformePeriodoFim = this.uniformePeriodoInicio;
    }
    if (!this.uniformePeriodoInicio && this.uniformePeriodoFim) {
        this.uniformePeriodoFim = null;
    }
    
    // 🆕 Se tem hora de entrada mas não tem data, herda a data do registro
    if (this.horarioEntrada && !this.dataEntrada && this.data) {
        this.dataEntrada = this.data;
    }
    if (this.horarioSaida && !this.dataSaida && this.data) {
        this.dataSaida = this.data;
    }
    
    this.updatedAt = new Date();
    next();
});

// ============================================
// MÉTODOS DE INSTÂNCIA
// ============================================
AutorizacaoSchema.methods.getPeriodoFaltaFormatado = function() {
    if (!this.periodoFaltaInicio) return null;
    const ini = new Date(this.periodoFaltaInicio);
    const fim = this.periodoFaltaFim ? new Date(this.periodoFaltaFim) : ini;
    const iniDia = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate());
    const fimDia = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate());
    const fmt = (d) => d.toLocaleDateString('pt-BR');
    if (iniDia.getTime() === fimDia.getTime()) return fmt(iniDia);
    return `${fmt(iniDia)} a ${fmt(fimDia)}`;
};

AutorizacaoSchema.methods.getTipoProvaPerdidaFormatado = function() {
    if (!this.tipoProvaPerdida) return null;
    if (this.tipoProvaPerdida === 'Outros' && this.tipoProvaPerdidaOutros) {
        return `Outros (${this.tipoProvaPerdidaOutros})`;
    }
    return this.tipoProvaPerdida;
};

AutorizacaoSchema.methods.getPeriodoProvaFormatado = function() {
    if (!this.periodoProva) return null;
    return this.periodoProva;
};

// 🆕 Período do uniforme formatado
AutorizacaoSchema.methods.getUniformePeriodoFormatado = function() {
    if (!this.uniformePeriodoInicio) return null;
    const ini = new Date(this.uniformePeriodoInicio);
    const fim = this.uniformePeriodoFim ? new Date(this.uniformePeriodoFim) : ini;
    const iniDia = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate());
    const fimDia = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate());
    const fmt = (d) => d.toLocaleDateString('pt-BR');
    if (iniDia.getTime() === fimDia.getTime()) return fmt(iniDia);
    return `${fmt(iniDia)} a ${fmt(fimDia)}`;
};

// 🆕 Entrada completa formatada — "23/10/2025 às 10:00"
AutorizacaoSchema.methods.getEntradaCompleta = function() {
    const temData = !!this.dataEntrada;
    const temHora = !!(this.horarioEntrada && this.horarioEntrada.trim());
    
    if (!temData && !temHora) return null;
    
    const partes = [];
    if (temData) {
        partes.push(new Date(this.dataEntrada).toLocaleDateString('pt-BR'));
    }
    if (temHora) {
        partes.push(temData ? `às ${this.horarioEntrada}` : this.horarioEntrada);
    }
    return partes.join(' ');
};

// 🆕 Saída completa formatada — "23/10/2025 às 15:00"
AutorizacaoSchema.methods.getSaidaCompleta = function() {
    const temData = !!this.dataSaida;
    const temHora = !!(this.horarioSaida && this.horarioSaida.trim());
    
    if (!temData && !temHora) return null;
    
    const partes = [];
    if (temData) {
        partes.push(new Date(this.dataSaida).toLocaleDateString('pt-BR'));
    }
    if (temHora) {
        partes.push(temData ? `às ${this.horarioSaida}` : this.horarioSaida);
    }
    return partes.join(' ');
};

// ============================================
// MÉTODOS ESTÁTICOS
// ============================================
AutorizacaoSchema.statics.getMotivoLabel = function(motivo, tipo = 'autorizacao') {
    const labels = {
        'problemas_pessoais': 'Problemas Pessoais',
        'problemas_saude_responsavel_buscou': 'Problemas de Saúde (Responsável veio buscar)',
        'problemas_saude_responsavel_whatsapp': 'Problemas de Saúde (Responsável via WhatsApp)',
        'necessita_ausentar_retornar': 'Necessita se ausentar e retornar',
        'viagens': 'Viagens',
        'consultas': 'Consultas',
        'outros': 'Outros',
        'problemas_saude': 'Problemas de Saúde',
        'viagem': 'Viagem',
        'tratamento_medico': 'Tratamento Médico'
    };
    return labels[motivo] || motivo;
};

AutorizacaoSchema.statics.getMotivosQueGeramJustificativa = function() {
    return [
        'problemas_saude_responsavel_buscou',
        'problemas_saude_responsavel_whatsapp',
        'consultas',
        'necessita_ausentar_retornar'
    ];
};

AutorizacaoSchema.statics.getPeriodoFaltaFormatado = function(doc) {
    if (!doc || !doc.periodoFaltaInicio) return null;
    const ini = new Date(doc.periodoFaltaInicio);
    const fim = doc.periodoFaltaFim ? new Date(doc.periodoFaltaFim) : ini;
    const iniDia = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate());
    const fimDia = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate());
    const fmt = (d) => d.toLocaleDateString('pt-BR');
    if (iniDia.getTime() === fimDia.getTime()) return fmt(iniDia);
    return `${fmt(iniDia)} a ${fmt(fimDia)}`;
};

AutorizacaoSchema.statics.getTipoProvaPerdidaFormatado = function(doc) {
    if (!doc || !doc.tipoProvaPerdida) return null;
    if (doc.tipoProvaPerdida === 'Outros' && doc.tipoProvaPerdidaOutros) {
        return `Outros (${doc.tipoProvaPerdidaOutros})`;
    }
    return doc.tipoProvaPerdida;
};

AutorizacaoSchema.statics.getPeriodoProvaFormatado = function(doc) {
    if (!doc || !doc.periodoProva) return null;
    return doc.periodoProva;
};

// 🆕 Período do uniforme formatado (estático)
AutorizacaoSchema.statics.getUniformePeriodoFormatado = function(doc) {
    if (!doc || !doc.uniformePeriodoInicio) return null;
    const ini = new Date(doc.uniformePeriodoInicio);
    const fim = doc.uniformePeriodoFim ? new Date(doc.uniformePeriodoFim) : ini;
    const iniDia = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate());
    const fimDia = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate());
    const fmt = (d) => d.toLocaleDateString('pt-BR');
    if (iniDia.getTime() === fimDia.getTime()) return fmt(iniDia);
    return `${fmt(iniDia)} a ${fmt(fimDia)}`;
};

// 🆕 Entrada formatada (estático)
AutorizacaoSchema.statics.getEntradaCompleta = function(doc) {
    if (!doc) return null;
    const temData = !!doc.dataEntrada;
    const temHora = !!(doc.horarioEntrada && doc.horarioEntrada.trim());
    if (!temData && !temHora) return null;
    const partes = [];
    if (temData) partes.push(new Date(doc.dataEntrada).toLocaleDateString('pt-BR'));
    if (temHora) partes.push(temData ? `às ${doc.horarioEntrada}` : doc.horarioEntrada);
    return partes.join(' ');
};

// 🆕 Saída formatada (estático)
AutorizacaoSchema.statics.getSaidaCompleta = function(doc) {
    if (!doc) return null;
    const temData = !!doc.dataSaida;
    const temHora = !!(doc.horarioSaida && doc.horarioSaida.trim());
    if (!temData && !temHora) return null;
    const partes = [];
    if (temData) partes.push(new Date(doc.dataSaida).toLocaleDateString('pt-BR'));
    if (temHora) partes.push(temData ? `às ${doc.horarioSaida}` : doc.horarioSaida);
    return partes.join(' ');
};

module.exports = mongoose.model('Autorizacao', AutorizacaoSchema);