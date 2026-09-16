// backend/models/SubstituicaoProfessor.js
const mongoose = require('mongoose');

const SubstituicaoProfessorSchema = new mongoose.Schema({
    // Professor Ausente
    professorAusenteId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    professorAusenteNome: { type: String, required: true },
    professorAusenteEmail: { type: String, default: '' },
    professorAusenteTelefone: { type: String, default: '' },
    professorAusenteEixo: { type: String, default: '' },
    
    // Professor Substituto
    professorSubstitutoId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    professorSubstitutoNome: { type: String, required: true },
    professorSubstitutoEmail: { type: String, default: '' },
    professorSubstitutoTelefone: { type: String, default: '' },
    professorSubstitutoEixo: { type: String, default: '' },
    
    // Aula
    turma: { type: String, required: true },
    horario: { type: Number, required: true, min: 1, max: 9 },
    data: { type: String, required: true },
    diaSemana: { type: String, default: '' },
    
    // Motivo
    motivo: {
        type: String,
        required: true,
        enum: ['falta_professor', 'licenca_medica', 'licenca_maternidade_paternidade',
               'capacitacao_formacao', 'reuniao_externa', 'problema_pessoal', 'atestado', 'outros']
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

module.exports = mongoose.model('SubstituicaoProfessor', SubstituicaoProfessorSchema);