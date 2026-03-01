// ============================================================================
// MODELO DE EVENTOS DO CALENDÁRIO ACADÊMICO (VERSÃO FINAL)
// ============================================================================
const mongoose = require('mongoose');

const EventoSchema = new mongoose.Schema({
    usuarioId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    
    titulo: { 
        type: String, 
        required: true,
        trim: true,
        maxlength: 200
    },
    
    descricao: { 
        type: String, 
        trim: true,
        maxlength: 1000
    },
    
    tipo: { 
        type: String, 
        enum: [
            'prova', 
            'lembrete', 
            'feriado', 
            'reuniao', 
            'prazo', 
            'evento', 
            'personalizado'
        ],
        default: 'evento'
    },
    
    cor: { 
        type: String,
        default: function() {
            const cores = {
                'prova': '#ef4444',
                'lembrete': '#3b82f6',
                'feriado': '#10b981',
                'reuniao': '#8b5cf6',
                'prazo': '#f59e0b',
                'evento': '#6b7280',
                'personalizado': '#4f46e5'
            };
            return cores[this.tipo] || '#4f46e5';
        }
    },
    
    dataInicio: { 
        type: Date, 
        required: true 
    },
    
    dataFim: { 
        type: Date 
    },
    
    horarioInicio: { 
        type: String,
        match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
    },
    
    horarioFim: { 
        type: String,
        match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
    },
    
    diaInteiro: { 
        type: Boolean, 
        default: false 
    },
    
    local: { 
        type: String,
        trim: true
    },
    
    turmaId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Turma' 
    },
    
    provaId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Prova' 
    },
    
    notificacoes: [{
        minutosAntes: { 
            type: Number,
            enum: [0, 5, 15, 30, 60, 120, 1440],
            default: 30
        },
        enviada: { 
            type: Boolean, 
            default: false 
        },
        enviadaEm: { 
            type: Date 
        },
        tipo: {
            type: String,
            enum: ['email', 'push', 'sistema'],
            default: 'sistema'
        }
    }],
    
    notificacaoAtivada: {
        type: Boolean,
        default: true
    },
    
    repetir: {
        type: String,
        enum: ['nao', 'diario', 'semanal', 'mensal', 'anual'],
        default: 'nao'
    },
    
    repetirAte: {
        type: Date
    },
    
    participantes: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    
    anexos: [{
        nome: String,
        url: String,
        tipo: String,
        tamanho: Number
    }],
    
    status: {
        type: String,
        enum: ['agendado', 'concluido', 'cancelado', 'adiado'],
        default: 'agendado'
    },
    
    motivoCancelamento: String,
    
    monitoramento: {
        criadoEm: { type: Date, default: Date.now },
        
        visualizacoes: [{
            usuarioId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            visualizadoEm: { type: Date, default: Date.now }
        }],
        
        edicoes: [{
            usuarioId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            editadoEm: { type: Date, default: Date.now },
            camposAlterados: [String]
        }],
        
        excluidoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        excluidoEm: Date,
        
        ipCriacao: String,
        userAgentCriacao: String,
        
        logs: [{
            acao: { 
                type: String, 
                enum: [
                    'criar', 
                    'editar', 
                    'visualizar', 
                    'concluir', 
                    'cancelar', 
                    'notificar', 
                    'excluir'
                ] 
            },
            usuarioId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            timestamp: { type: Date, default: Date.now },
            detalhes: mongoose.Schema.Types.Mixed
        }]
    }
}, { 
    timestamps: true 
});

// Índices para consultas rápidas
EventoSchema.index({ usuarioId: 1, dataInicio: -1 });
EventoSchema.index({ turmaId: 1, dataInicio: -1 });
EventoSchema.index({ tipo: 1, dataInicio: -1 });

// Virtual: duração em minutos
EventoSchema.virtual('duracaoMinutos').get(function() {
    if (!this.horarioInicio || !this.horarioFim || this.diaInteiro) return null;
    
    const [h1, m1] = this.horarioInicio.split(':').map(Number);
    const [h2, m2] = this.horarioFim.split(':').map(Number);
    
    return (h2 * 60 + m2) - (h1 * 60 + m1);
});

// Método para verificar se precisa notificar
EventoSchema.methods.precisaNotificar = function() {
    if (!this.notificacaoAtivada) return false;
    
    const agora = new Date();
    const dataEvento = new Date(this.dataInicio);
    
    if (agora > dataEvento) return false;
    
    for (const notif of this.notificacoes) {
        if (notif.enviada) continue;
        
        const dataNotificar = new Date(dataEvento);
        dataNotificar.setMinutes(dataNotificar.getMinutes() - notif.minutosAntes);
        
        if (agora >= dataNotificar) {
            return notif;
        }
    }
    
    return false;
};

// Middleware pre-save
EventoSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    
    // Adicionar notificação padrão se não houver nenhuma
    if (this.notificacoes.length === 0 && this.notificacaoAtivada) {
        this.notificacoes.push({
            minutosAntes: 30,
            enviada: false,
            tipo: 'sistema'
        });
    }
    
    next();
});

const Evento = mongoose.model('Evento', EventoSchema);
module.exports = Evento;