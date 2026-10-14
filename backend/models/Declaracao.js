// backend/models/Declaracao.js
const mongoose = require('mongoose');

const DeclaracaoSchema = new mongoose.Schema({
    tipo: {
        type: String,
        enum: ['aluno', 'responsavel', 'professor_bolsista'],
        required: true,
        index: true
    },
    
    usuarioId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    
    dados: {
        // Comuns
        nome: { type: String, required: true },
        cpf: { type: String, default: null },
        rg: { type: String, default: null },
        matricula: { type: String, default: null },
        
        // Aluno
        curso: { type: String, default: null },
        anosCursados: { type: String, default: null },
        anoConclusao: { type: String, default: null },
        
        // Responsável
        nomeAluno: { type: String, default: null },
        cpfAluno: { type: String, default: null },
        turmaAluno: { type: String, default: null },
        cursoAluno: { type: String, default: null },
        alunoId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        parentesco: { type: String, default: null },
        motivoDeclaracao: { type: String, default: null },
        motivoOutros: { type: String, default: null },
        
        // Professor
        cargo: { type: String, default: null },
        cargoOutros: { type: String, default: null },
        funcao: { type: String, default: null },
        funcaoOutros: { type: String, default: null },
        disciplina: { type: String, default: null },
        departamento: { type: String, default: null },
        titulacao: { type: String, default: null },
        cargaHoraria: { type: String, default: null },
        dataInicio: { type: String, default: null },
        
        // Extras
        textoAdicional: { type: String, default: null },
        
        cidade: { type: String, default: 'São Luís' },
        dataEmissao: { type: String, default: null }
    },
    
    emitidoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    emitidoPorNome: { type: String, required: true },
    
    numero: { type: String, default: null },
    
    impresso: { type: Boolean, default: false, index: true },
    impressoEm: { type: Date, default: null },
    impressoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    impressoPorNome: { type: String, default: null },
    
    observacoes: { type: String, default: null },
    ativo: { type: Boolean, default: true },
    
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

DeclaracaoSchema.index({ tipo: 1, createdAt: -1 });
DeclaracaoSchema.index({ 'dados.nome': 1 });
DeclaracaoSchema.index({ 'dados.nomeAluno': 1 });
DeclaracaoSchema.index({ usuarioId: 1, createdAt: -1 });
DeclaracaoSchema.index({ emitidoPor: 1, createdAt: -1 });

DeclaracaoSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

module.exports = mongoose.model('Declaracao', DeclaracaoSchema);