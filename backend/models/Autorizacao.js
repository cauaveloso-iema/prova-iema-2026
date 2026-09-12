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
    
    // ===== PERÍODO =====
    data: { type: Date, required: true, default: Date.now },
    horarioEntrada: String,
    horarioSaida: String,
    
    // ===== RESPONSÁVEL =====
    responsavelNome: String,
    responsavelCPF: String,
    responsavelTelefone: String,
    
    // ===== ASSINATURA DIGITAL (Base64 PNG) =====
    // Armazena a imagem da assinatura capturada via canvas (touch/mouse)
    assinaturaBase64: { type: String, default: '' },
    // Flag para consulta rápida sem carregar o base64 completo
    temAssinatura: { type: Boolean, default: false, index: true },
    
    // ===== MOTIVO =====
    motivo: { type: String, required: true },
    
    // ===== CAMPOS ESPECÍFICOS =====
    motivoOutros: String,
    horarioAusencia: String,
    horarioRetorno: String,
    
    // ===== OBSERVAÇÕES =====
    observacoes: String,
    
    // ===== ORIGEM (integração automática entre módulos) =====
    // Ex: uma justificativa pode ter sido criada automaticamente por uma autorização
    origemTipo: {
        type: String,
        enum: [
            'autorizacao', 
            'segunda_chamada', 
            'justificativa', 
            'manual', 
            'setor_pedagogico_2chamada',
            null
        ],
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
AutorizacaoSchema.index({ motivo: 1 });
AutorizacaoSchema.index({ origemTipo: 1, origemId: 1 });

// ============================================
// MIDDLEWARE: Atualiza temAssinatura e updatedAt automaticamente
// ============================================
AutorizacaoSchema.pre('save', function(next) {
    // Atualiza a flag temAssinatura com base no conteúdo do base64
    this.temAssinatura = !!(this.assinaturaBase64 && this.assinaturaBase64.length > 100);
    this.updatedAt = new Date();
    next();
});

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

module.exports = mongoose.model('Autorizacao', AutorizacaoSchema);