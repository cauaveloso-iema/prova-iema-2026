// backend/models/SessaoAssinatura.js
const mongoose = require('mongoose');

const SessaoAssinaturaSchema = new mongoose.Schema({
    sessaoId: { 
        type: String, 
        required: true, 
        unique: true, 
        index: true 
    },
    tipo: { 
        type: String, 
        enum: [
            'autorizacao', 
            'justificativa', 
            'segunda_chamada', 
            'atraso',
            'atraso_aluno',
            'psicologia',
            'assistente_social',
            'supervisao',
            'supervisao_participante',
            'biblioteca'
        ],
        required: true 
    },
    status: {
        type: String,
        enum: ['aguardando', 'assinado', 'cancelado'],
        default: 'aguardando',
        index: true
    },
    
    dadosAtendimento: {
        // Aluno
        alunoId: mongoose.Schema.Types.ObjectId,
        alunoNome: String,
        alunoMatricula: String,
        alunoTurma: String,
        alunoCurso: String,
        alunoFoto: String,
        
        // Genéricos (usado por vários setores)
        motivo: String,
        motivoLabel: String,
        descricao: String,
        observacoes: String,
        dataHora: Date,
        dataHoraFormatada: String,
        data: Date,
        
        // Justificativa / 2ª chamada
        periodoFaltaInicio: Date,
        periodoFaltaFim: Date,
        periodoFaltaFormatado: String,
        tipoProvaPerdida: String,
        tipoProvaPerdidaFormatado: String,
        responsavelNome: String,
        responsavelCPF: String,
        
        // Identifica quem assina: 'responsavel', 'aluno' ou 'participante'
        tipoAssinante: String,
        
        // Supervisão / Atendimentos
        tipoTarefa: String,
        tipoTarefaLabel: String,
        gravidade: String,
        prioridade: String,
        
        // 🆕 Participante da supervisão
        participanteNome: String,
        participanteTipo: String,
        tipoSessao: String, // 'participante' ou undefined
        participantes: [mongoose.Schema.Types.Mixed],
        
        // Detalhes livres (aceita qualquer estrutura)
        detalhes: mongoose.Schema.Types.Mixed,
        atendimentoId: mongoose.Schema.Types.ObjectId
    },
    
    assinaturaBase64: { type: String, default: '' },
    assinadaEm: { type: Date, default: null },
    assinadaPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    assinadaPorNome: { type: String, default: null },
    
    criadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    criadoPorNome: String,
    criadoEm: { type: Date, default: Date.now },
    expiraEm: { type: Date, required: true }
});

SessaoAssinaturaSchema.index({ expiraEm: 1 }, { expireAfterSeconds: 0 });

// ⚠️ ESSA É A LINHA CRÍTICA - PRECISA SER ASSIM
module.exports = mongoose.model('SessaoAssinatura', SessaoAssinaturaSchema);