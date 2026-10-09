// backend/models/Autorizacao.js
const mongoose = require('mongoose');

const AutorizacaoSchema = new mongoose.Schema({
    // ===== TIPO =====
    tipo: {
        type: String,
        enum: ['autorizacao', 'justificativa', 'segunda_chamada'],
        default: 'autorizacao',
        required: true
    },
    
    // ===== DADOS DO ALUNO =====
    alunoId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    alunoNome: { type: String, required: true },
    alunoMatricula: String,
    alunoTurma: { type: String, required: true },
    alunoCurso: String,
    alunoFoto: String,
    
    // ===== PERÍODO DO REGISTRO =====
    data: { type: Date, required: true, default: Date.now },
    horarioEntrada: String,
    horarioSaida: String,
    
    // ===== PERÍODO DA FALTA JUSTIFICADA =====
    periodoFaltaInicio: { type: Date, default: null },
    periodoFaltaFim: { type: Date, default: null },
    
    // ===== RESPONSÁVEL =====
    responsavelNome: String,
    responsavelCPF: String,
    responsavelTelefone: String,
    
    // ===== ASSINATURA DIGITAL =====
    assinaturaBase64: { type: String, default: '' },
    temAssinatura: { type: Boolean, default: false, index: true },
    
    // ===== MOTIVO =====
    motivo: { type: String, required: true },
    motivoOutros: String,
    
    // 🆕 TIPO DE PROVA PERDIDA (apenas segunda_chamada)
    tipoProvaPerdida: {
        type: String,
        enum: ['AV1', 'AV2', 'AV3', 'AV4', 'Recuperação', 'Outros', null],
        default: null
    },
    tipoProvaPerdidaOutros: String,
    
    // ===== CAMPOS ESPECÍFICOS =====
    horarioAusencia: String,
    horarioRetorno: String,
    
    // ===== OBSERVAÇÕES =====
    observacoes: String,
    
    // ===== AUDITORIA DE EDIÇÃO =====
    atualizadoEm: { type: Date, default: null },
    atualizadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    atualizadoPorNome: { type: String, default: null },
    
    // ===== ORIGEM =====
    origemTipo: {
        type: String,
        enum: ['autorizacao', 'segunda_chamada', 'justificativa', 'manual', 'setor_pedagogico_2chamada', null],
        default: 'manual'
    },
    origemId: { type: mongoose.Schema.Types.ObjectId, default: null },
    
    // ===== AUDITORIA =====
    registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    registradoPorNome: String,
    
    // ===== STATUS =====
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
AutorizacaoSchema.index({ periodoFaltaInicio: -1 });
AutorizacaoSchema.index({ periodoFaltaFim: -1 });
AutorizacaoSchema.index({ motivo: 1 });
AutorizacaoSchema.index({ tipoProvaPerdida: 1 });   // 🆕
AutorizacaoSchema.index({ origemTipo: 1, origemId: 1 });

// ============================================
// MIDDLEWARE
// ============================================
AutorizacaoSchema.pre('save', function(next) {
    this.temAssinatura = !!(this.assinaturaBase64 && this.assinaturaBase64.length > 100);
    
    // Normaliza período da falta
    if (this.periodoFaltaInicio && !this.periodoFaltaFim) {
        this.periodoFaltaFim = this.periodoFaltaInicio;
    }
    if (!this.periodoFaltaInicio && this.periodoFaltaFim) {
        this.periodoFaltaFim = null;
    }
    
    this.updatedAt = new Date();
    next();
});

// ============================================
// MÉTODO DE INSTÂNCIA: Formata o período da falta
// ============================================
AutorizacaoSchema.methods.getPeriodoFaltaFormatado = function() {
    if (!this.periodoFaltaInicio) return null;
    
    const ini = new Date(this.periodoFaltaInicio);
    const fim = this.periodoFaltaFim ? new Date(this.periodoFaltaFim) : ini;
    
    const iniDia = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate());
    const fimDia = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate());
    
    const fmt = (d) => d.toLocaleDateString('pt-BR');
    
    if (iniDia.getTime() === fimDia.getTime()) {
        return fmt(iniDia);
    }
    return `${fmt(iniDia)} a ${fmt(fimDia)}`;
};

// ============================================
// MÉTODO DE INSTÂNCIA: Formata tipo de prova perdida
// ============================================
AutorizacaoSchema.methods.getTipoProvaPerdidaFormatado = function() {
    if (!this.tipoProvaPerdida) return null;
    if (this.tipoProvaPerdida === 'Outros' && this.tipoProvaPerdidaOutros) {
        return `Outros (${this.tipoProvaPerdidaOutros})`;
    }
    return this.tipoProvaPerdida;
};

// ============================================
// MÉTODO ESTÁTICO: Label amigável do motivo
// ============================================
AutorizacaoSchema.statics.getMotivoLabel = function(motivo, tipo = 'autorizacao') {
    const labels = {
        // AUTORIZAÇÃO
        'problemas_pessoais': 'Problemas Pessoais',
        'problemas_saude_responsavel_buscou': 'Problemas de Saúde (Responsável veio buscar)',
        'problemas_saude_responsavel_whatsapp': 'Problemas de Saúde (Responsável via WhatsApp)',
        'necessita_ausentar_retornar': 'Necessita se ausentar e retornar',
        'viagens': 'Viagens',
        'consultas': 'Consultas',
        'outros': 'Outros',
        // JUSTIFICATIVA / 2ª CHAMADA
        'problemas_saude': 'Problemas de Saúde',
        'viagem': 'Viagem'
    };
    return labels[motivo] || motivo;
};

// ============================================
// MÉTODO ESTÁTICO: Motivos que geram justificativa automática
// ============================================
AutorizacaoSchema.statics.getMotivosQueGeramJustificativa = function() {
    return [
        'problemas_saude_responsavel_buscou',
        'problemas_saude_responsavel_whatsapp',
        'consultas',
        'necessita_ausentar_retornar'
    ];
};

// ============================================
// MÉTODO ESTÁTICO: Helper para formatar período
// ============================================
AutorizacaoSchema.statics.getPeriodoFaltaFormatado = function(doc) {
    if (!doc || !doc.periodoFaltaInicio) return null;
    
    const ini = new Date(doc.periodoFaltaInicio);
    const fim = doc.periodoFaltaFim ? new Date(doc.periodoFaltaFim) : ini;
    
    const iniDia = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate());
    const fimDia = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate());
    
    const fmt = (d) => d.toLocaleDateString('pt-BR');
    
    if (iniDia.getTime() === fimDia.getTime()) {
        return fmt(iniDia);
    }
    return `${fmt(iniDia)} a ${fmt(fimDia)}`;
};

// ============================================
// MÉTODO ESTÁTICO: Helper para formatar tipo de prova
// ============================================
AutorizacaoSchema.statics.getTipoProvaPerdidaFormatado = function(doc) {
    if (!doc || !doc.tipoProvaPerdida) return null;
    if (doc.tipoProvaPerdida === 'Outros' && doc.tipoProvaPerdidaOutros) {
        return `Outros (${doc.tipoProvaPerdidaOutros})`;
    }
    return doc.tipoProvaPerdida;
};

module.exports = mongoose.model('Autorizacao', AutorizacaoSchema);