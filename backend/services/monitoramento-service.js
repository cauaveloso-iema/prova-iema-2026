// ============================================================================
// SERVIÇO DE MONITORAMENTO DO SISTEMA
// ============================================================================
const Evento = require('../models/Evento');
const Prova = require('../models/Prova');
const User = require('../models/User');
const Turma = require('../models/Turma');

class MonitoramentoService {
    
    async monitorarEventosProfessores(filtros = {}) {
        try {
            const { dataInicio, dataFim, professorId, tipo } = filtros;
            
            let query = {};
            
            if (dataInicio && dataFim) {
                query.dataInicio = { $gte: new Date(dataInicio), $lte: new Date(dataFim) };
            }
            
            if (professorId) {
                query.usuarioId = professorId;
            }
            
            if (tipo) {
                query.tipo = tipo;
            }
            
            const eventos = await Evento.find(query)
                .populate('usuarioId', 'nome email matricula')
                .populate('turmaId', 'nome disciplina')
                .populate('provaId', 'titulo')
                .populate('monitoramento.visualizacoes.usuarioId', 'nome email role')
                .populate('monitoramento.edicoes.usuarioId', 'nome email role')
                .sort({ dataInicio: -1 })
                .lean();
            
            const statsPorProfessor = {};
            
            eventos.forEach(evento => {
                const profId = evento.usuarioId?._id?.toString() || 'desconhecido';
                
                if (!statsPorProfessor[profId]) {
                    statsPorProfessor[profId] = {
                        professorId: profId,
                        professorNome: evento.usuarioId?.nome || 'Desconhecido',
                        professorEmail: evento.usuarioId?.email || '',
                        totalEventos: 0,
                        eventosPorTipo: {},
                        visualizacoes: 0,
                        edicoes: 0
                    };
                }
                
                statsPorProfessor[profId].totalEventos++;
                
                const tipo = evento.tipo || 'outro';
                statsPorProfessor[profId].eventosPorTipo[tipo] = 
                    (statsPorProfessor[profId].eventosPorTipo[tipo] || 0) + 1;
                
                statsPorProfessor[profId].visualizacoes += evento.monitoramento?.visualizacoes?.length || 0;
                statsPorProfessor[profId].edicoes += evento.monitoramento?.edicoes?.length || 0;
            });
            
            return {
                totalEventos: eventos.length,
                eventos,
                estatisticasPorProfessor: Object.values(statsPorProfessor),
                filtrosAplicados: filtros
            };
            
        } catch (error) {
            console.error('❌ Erro no monitoramento de eventos:', error);
            throw error;
        }
    }
    
    async monitorarProvasProfessores(filtros = {}) {
        try {
            const { dataInicio, dataFim, professorId, status } = filtros;
            
            let query = {};
            
            if (professorId) {
                query.userId = professorId;
            }
            
            if (status) {
                query.status = status;
            }
            
            const provas = await Prova.find(query)
                .populate('userId', 'nome email matricula')
                .populate('turmaId', 'nome disciplina')
                .sort({ createdAt: -1 })
                .lean();
            
            const statsPorProfessor = {};
            
            provas.forEach(prova => {
                const profId = prova.userId?._id?.toString() || 'desconhecido';
                
                if (!statsPorProfessor[profId]) {
                    statsPorProfessor[profId] = {
                        professorId: profId,
                        professorNome: prova.userId?.nome || 'Desconhecido',
                        professorEmail: prova.userId?.email || '',
                        totalProvas: 0,
                        provasPublicadas: 0,
                        provasRascunho: 0,
                        totalQuestoes: 0,
                        totalAlunos: 0
                    };
                }
                
                statsPorProfessor[profId].totalProvas++;
                
                if (prova.publicada) {
                    statsPorProfessor[profId].provasPublicadas++;
                } else {
                    statsPorProfessor[profId].provasRascunho++;
                }
                
                statsPorProfessor[profId].totalQuestoes += prova.questoes?.length || 0;
                statsPorProfessor[profId].totalAlunos += prova.totalAlunosAlvo || 0;
            });
            
            return {
                totalProvas: provas.length,
                provas,
                estatisticasPorProfessor: Object.values(statsPorProfessor)
            };
            
        } catch (error) {
            console.error('❌ Erro no monitoramento de provas:', error);
            throw error;
        }
    }
    
    async relatorioCompleto(periodo = 30) {
        try {
            const dataLimite = new Date();
            dataLimite.setDate(dataLimite.getDate() - periodo);
            
            const eventos = await Evento.find({
                createdAt: { $gte: dataLimite }
            }).populate('usuarioId', 'nome email role').lean();
            
            const provas = await Prova.find({
                createdAt: { $gte: dataLimite }
            }).populate('userId', 'nome email').lean();
            
            const atividadesPorProfessor = {};
            
            eventos.forEach(evento => {
                const profId = evento.usuarioId?._id?.toString();
                if (!profId) return;
                
                if (!atividadesPorProfessor[profId]) {
                    atividadesPorProfessor[profId] = {
                        professorId: profId,
                        professorNome: evento.usuarioId?.nome || 'Desconhecido',
                        professorEmail: evento.usuarioId?.email || '',
                        eventos: [],
                        provas: [],
                        totalEventos: 0,
                        totalProvas: 0
                    };
                }
                
                atividadesPorProfessor[profId].eventos.push({
                    id: evento._id,
                    titulo: evento.titulo,
                    tipo: evento.tipo,
                    dataInicio: evento.dataInicio,
                    dataCriacao: evento.createdAt
                });
                
                atividadesPorProfessor[profId].totalEventos++;
            });
            
            provas.forEach(prova => {
                const profId = prova.userId?._id?.toString();
                if (!profId) return;
                
                if (!atividadesPorProfessor[profId]) {
                    atividadesPorProfessor[profId] = {
                        professorId: profId,
                        professorNome: prova.userId?.nome || 'Desconhecido',
                        professorEmail: prova.userId?.email || '',
                        eventos: [],
                        provas: [],
                        totalEventos: 0,
                        totalProvas: 0
                    };
                }
                
                atividadesPorProfessor[profId].provas.push({
                    id: prova._id,
                    titulo: prova.titulo,
                    status: prova.status,
                    publicada: prova.publicada,
                    quantidadeQuestoes: prova.questoes?.length || 0,
                    dataCriacao: prova.createdAt
                });
                
                atividadesPorProfessor[profId].totalProvas++;
            });
            
            return {
                periodo: `${periodo} dias`,
                dataInicio: dataLimite,
                dataFim: new Date(),
                totalProfessores: Object.keys(atividadesPorProfessor).length,
                atividadesPorProfessor: Object.values(atividadesPorProfessor)
            };
            
        } catch (error) {
            console.error('❌ Erro no relatório completo:', error);
            throw error;
        }
    }
}

module.exports = MonitoramentoService;