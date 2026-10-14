// backend/models/AtrasoProfessor.js
const mongoose = require('mongoose');

const AtrasoProfessorSchema = new mongoose.Schema({
    // Professor (SEMPRE obrigatório)
    professorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    professorNome: { type: String, required: true },
    professorEmail: { type: String, default: '' },
    professorTelefone: { type: String, default: '' },
    professorEixo: { type: String, default: '' },
    professorMatricula: { type: String, default: '' },
    
    // Dados do Atraso
    data: { type: String, required: true }, // YYYY-MM-DD
    diaSemana: { type: String, default: '' },
    horario: { type: Number, required: true, min: 1, max: 9 }, // 1º ao 9º horário
    horarioChegada: { type: String, default: '' }, // HH:MM (opcional, hora real que chegou)
    minutosAtraso: { type: Number, default: 0, min: 0 }, // Quantos minutos de atraso
    
    // Turma (opcional - caso o professor estivesse indo para alguma turma)
    turma: { type: String, default: '' },
    
    // Observações
    observacoes: { type: String, default: '' },
    
    // Motivo/Justificativa (opcional)
    motivo: {
        type: String,
        enum: [
            'problema_transporte',
            'problema_pessoal',
            'problema_saude',
            'transito',
            'clima',
            'outros',
            'nao_justificado'
        ],
        default: 'nao_justificado'
    },
    motivoDetalhes: { type: String, default: '' },
    
    // Metadados
    mesReferencia: { type: String, required: true }, // YYYY-MM
    
    registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    registradoPorNome: { type: String, required: true },
    registradoPorEmail: { type: String, required: true },
    registradoEm: { type: Date, default: Date.now },
    
    ativo: { type: Boolean, default: true },
    
    // Edição
    editadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    editadoPorNome: { type: String, default: '' },
    editadoEm: { type: Date, default: null }
}, {
    timestamps: true,
    collection: 'atrasos_professores'
});

// Índices para performance
AtrasoProfessorSchema.index({ mesReferencia: 1, data: -1 });
AtrasoProfessorSchema.index({ professorId: 1 });
AtrasoProfessorSchema.index({ data: -1, horario: 1 });
AtrasoProfessorSchema.index({ mesReferencia: 1, professorId: 1 });

module.exports = mongoose.model('AtrasoProfessor', AtrasoProfessorSchema);