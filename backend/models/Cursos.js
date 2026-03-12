const mongoose = require('mongoose');

const TurmaSchema = new mongoose.Schema({
    codigo: { 
        type: String, 
        required: true,
        uppercase: true,
        trim: true
    },
    periodo: { 
        type: String, 
        enum: ['1', '2', '3', '4'],
        required: true 
    },
    vagas: { 
        type: Number, 
        default: 40,
        min: 1,
        max: 100
    },
    ativa: { 
        type: Boolean, 
        default: true 
    }
}, { 
    timestamps: true // Adiciona createdAt e updatedAt para cada turma
});

const CursoSchema = new mongoose.Schema({
    nome: { 
        type: String, 
        required: true, 
        unique: true,
        uppercase: true,
        trim: true
    },
    eixoId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Eixo',
        required: true,
        index: true
    },
    turmas: [TurmaSchema],
    ativo: { 
        type: Boolean, 
        default: true 
    }
}, { 
    timestamps: true // Adiciona createdAt e updatedAt automaticamente
});

// Índices para melhor performance
CursoSchema.index({ nome: 1 });
CursoSchema.index({ eixoId: 1 });
CursoSchema.index({ ativo: 1 });

// Middleware para garantir que o eixo existe antes de salvar
CursoSchema.pre('save', async function(next) {
    try {
        const Eixo = mongoose.model('Eixo');
        const eixoExiste = await Eixo.findById(this.eixoId);
        
        if (!eixoExiste) {
            throw new Error('Eixo não encontrado');
        }
        
        next();
    } catch (error) {
        next(error);
    }
});

module.exports = mongoose.model('Curso', CursoSchema);