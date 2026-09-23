// backend/models/SubstituicaoProfessor.js
const mongoose = require('mongoose');

const SubstituicaoProfessorSchema = new mongoose.Schema({
    // Professor Ausente (SEMPRE obrigatório)
    professorAusenteId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    professorAusenteNome: { type: String, required: true },
    professorAusenteEmail: { type: String, default: '' },
    professorAusenteTelefone: { type: String, default: '' },
    professorAusenteEixo: { type: String, default: '' },
    
    // Professor Substituto (OPCIONAL — pode ser null quando não há substituto)
    professorSubstitutoId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false, default: null },
    professorSubstitutoNome: { type: String, default: '' },
    professorSubstitutoEmail: { type: String, default: '' },
    professorSubstitutoTelefone: { type: String, default: '' },
    professorSubstitutoEixo: { type: String, default: '' },
    
    // Ausência do Substituto
    substitutoAusente: { type: Boolean, default: false },
    substitutoAusenteMotivo: { type: String, default: '' },
    substitutoAusenteObservacoes: { type: String, default: '' },
    
    // Aula
    turma: { type: String, required: true },
    
    // ⭐ NOVO: array de horários (1 a 9) — suporta múltiplos horários consecutivos
    horarios: { 
        type: [Number], 
        default: [],
        validate: {
            validator: arr => arr.every(h => h >= 1 && h <= 9),
            message: 'Horário deve ser entre 1 e 9'
        }
    },
    
    // 🔁 MANTIDO para compatibilidade com registros antigos
    horario: { type: Number, required: false, min: 1, max: 9, default: null },
    
    data: { type: String, required: true },
    diaSemana: { type: String, default: '' },
    
    // Motivo — inclui 'sem_substituto'
    motivo: {
        type: String,
        required: true,
        enum: [
            'falta_professor',
            'licenca_medica',
            'licenca_maternidade_paternidade',
            'capacitacao_formacao',
            'reuniao_externa',
            'problema_pessoal',
            'atestado',
            'outros',
            'sem_substituto'
        ]
    },
    motivoDetalhes: { type: String, default: '' },
    observacoes: { type: String, default: '' },
    
    // Metadados
    mesReferencia: { type: String, required: true },
    registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    registradoPorNome: { type: String, required: true },
    registradoPorEmail: { type: String, required: true },
    registradoEm: { type: Date, default: Date.now },
    
    ativo: { type: Boolean, default: true },
    editadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    editadoPorNome: { type: String, default: '' },
    editadoEm: { type: Date, default: null }
}, {
    timestamps: true,
    collection: 'substituicoes_professores'
});

SubstituicaoProfessorSchema.index({ mesReferencia: 1, data: -1 });
SubstituicaoProfessorSchema.index({ professorAusenteId: 1 });
SubstituicaoProfessorSchema.index({ turma: 1, data: 1 });
SubstituicaoProfessorSchema.index({ substitutoAusente: 1 });

module.exports = mongoose.model('SubstituicaoProfessor', SubstituicaoProfessorSchema);