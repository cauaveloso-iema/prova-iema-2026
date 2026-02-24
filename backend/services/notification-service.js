// ============ backend/services/notification-service.js ============
const Notificacao = require('../models/Notificacao');

class NotificationService {
    
    // ===== NOTIFICAÇÃO PARA ALUNO =====
    async notificarAlunoResultado(aluno, prova, resultado, admin, tipoAcao = 'liberada') {
        try {
            console.log(`🔔 Criando notificação para aluno ${aluno.nome}...`);

            const notaFormatada = resultado.nota.toFixed(2);
            const status = resultado.nota >= 7 ? '✅ Aprovado' : '❌ Reprovado';
            const percentual = resultado.total > 0 ? 
                Math.round((resultado.acertos / resultado.total) * 100) : 0;

            let titulo, mensagem, icone, cor;

            if (tipoAcao === 'liberada') {
                titulo = '📊 Resultado Liberado!';
                mensagem = `Sua nota na prova "${prova.titulo}" foi liberada: <strong>${notaFormatada}</strong> (${percentual}% de acertos) - ${status}`;
                icone = '🎯';
                cor = '#28a745';
            } else {
                titulo = '✏️ Resultado Atualizado';
                mensagem = `O administrador <strong>${admin.nome}</strong> atualizou sua nota na prova "${prova.titulo}" para <strong>${notaFormatada}</strong> (${percentual}% de acertos) - ${status}`;
                icone = '📝';
                cor = '#ffc107';
            }

            const notificacao = new Notificacao({
                usuarioId: aluno._id || aluno.id,
                tipo: tipoAcao === 'liberada' ? 'resultado_liberado' : 'resultado_editado',
                titulo: titulo,
                mensagem: mensagem,
                dados: {
                    provaId: prova._id || prova.id,
                    provaTitulo: prova.titulo,
                    nota: resultado.nota,
                    acertos: resultado.acertos,
                    total: resultado.total,
                    percentual: percentual,
                    status: resultado.nota >= 7 ? 'aprovado' : 'reprovado',
                    adminId: admin._id || admin.id,
                    adminNome: admin.nome
                },
                link: `/aluno.html#/resultados/${prova._id || prova.id}`,
                icone: icone,
                cor: cor,
                prioridade: 4
            });

            await notificacao.save();

            console.log(`✅ Notificação criada para aluno ${aluno.nome} (ID: ${notificacao._id})`);

            return {
                success: true,
                notificacao: notificacao
            };

        } catch (error) {
            console.error('❌ Erro ao notificar aluno:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ===== NOTIFICAÇÃO PARA PROFESSOR =====
    async notificarProfessorResultado(professor, aluno, prova, resultado, admin, tipoAcao = 'liberada') {
        try {
            console.log(`🔔 Criando notificação para professor ${professor.nome}...`);

            const notaFormatada = resultado.nota.toFixed(2);
            const status = resultado.nota >= 7 ? 'Aprovado' : 'Reprovado';

            let titulo, mensagem, icone, cor;

            if (tipoAcao === 'liberada') {
                titulo = '📊 Resultado Liberado por Admin';
                mensagem = `O admin <strong>${admin.nome}</strong> liberou a nota do aluno <strong>${aluno.nome}</strong> na prova "${prova.titulo}": <strong>${notaFormatada}</strong> (${resultado.acertos}/${resultado.total} acertos) - ${status}`;
                icone = '👨‍🏫';
                cor = '#0d6efd';
            } else {
                titulo = '✏️ Resultado Editado por Admin';
                mensagem = `O admin <strong>${admin.nome}</strong> editou a nota do aluno <strong>${aluno.nome}</strong> na prova "${prova.titulo}" para <strong>${notaFormatada}</strong> (${resultado.acertos}/${resultado.total} acertos) - ${status}`;
                icone = '📝';
                cor = '#fd7e14';
            }

            const notificacao = new Notificacao({
                usuarioId: professor._id || professor.id,
                tipo: tipoAcao === 'liberada' ? 'resultado_liberado' : 'resultado_editado',
                titulo: titulo,
                mensagem: mensagem,
                dados: {
                    alunoId: aluno._id || aluno.id,
                    alunoNome: aluno.nome,
                    provaId: prova._id || prova.id,
                    provaTitulo: prova.titulo,
                    nota: resultado.nota,
                    acertos: resultado.acertos,
                    total: resultado.total,
                    status: resultado.nota >= 7 ? 'aprovado' : 'reprovado',
                    adminId: admin._id || admin.id,
                    adminNome: admin.nome
                },
                link: `/professor.html#/provas/${prova._id || prova.id}/resultados`,
                icone: icone,
                cor: cor,
                prioridade: 3
            });

            await notificacao.save();

            console.log(`✅ Notificação criada para professor ${professor.nome} (ID: ${notificacao._id})`);

            return {
                success: true,
                notificacao: notificacao
            };

        } catch (error) {
            console.error('❌ Erro ao notificar professor:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ===== BUSCAR NOTIFICAÇÕES DO USUÁRIO =====
    async buscarNotificacoes(usuarioId, apenasNaoLidas = false, limite = 50) {
        try {
            const query = { usuarioId: usuarioId };
            if (apenasNaoLidas) {
                query.lida = false;
            }

            const notificacoes = await Notificacao.find(query)
                .sort({ createdAt: -1, prioridade: -1 })
                .limit(limite)
                .lean();

            const naoLidas = await Notificacao.countDocuments({
                usuarioId: usuarioId,
                lida: false
            });

            return {
                success: true,
                notificacoes: notificacoes,
                total: notificacoes.length,
                naoLidas: naoLidas
            };

        } catch (error) {
            console.error('❌ Erro ao buscar notificações:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ===== MARCAR COMO LIDA =====
    async marcarComoLida(notificacaoId, usuarioId) {
        try {
            const notificacao = await Notificacao.findOneAndUpdate(
                { 
                    _id: notificacaoId,
                    usuarioId: usuarioId 
                },
                { 
                    lida: true,
                    lidaEm: new Date()
                },
                { new: true }
            );

            return {
                success: true,
                notificacao: notificacao
            };

        } catch (error) {
            console.error('❌ Erro ao marcar notificação como lida:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ===== MARCAR TODAS COMO LIDAS =====
    async marcarTodasComoLidas(usuarioId) {
        try {
            const resultado = await Notificacao.updateMany(
                { 
                    usuarioId: usuarioId,
                    lida: false 
                },
                { 
                    lida: true,
                    lidaEm: new Date()
                }
            );

            return {
                success: true,
                modificadas: resultado.modifiedCount
            };

        } catch (error) {
            console.error('❌ Erro ao marcar todas como lidas:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ===== CONTAR NÃO LIDAS =====
    async contarNaoLidas(usuarioId) {
        try {
            const count = await Notificacao.countDocuments({
                usuarioId: usuarioId,
                lida: false
            });

            return {
                success: true,
                count: count
            };

        } catch (error) {
            console.error('❌ Erro ao contar não lidas:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ===== DELETAR NOTIFICAÇÃO =====
    async deletarNotificacao(notificacaoId, usuarioId) {
        try {
            const resultado = await Notificacao.findOneAndDelete({
                _id: notificacaoId,
                usuarioId: usuarioId
            });

            return {
                success: true,
                deletado: !!resultado
            };

        } catch (error) {
            console.error('❌ Erro ao deletar notificação:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = NotificationService;