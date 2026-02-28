// ============================================================================
// SERVIÇO DE NOTIFICAÇÕES - SISTEMA DE PROVAS IEMA 2026
// ============================================================================
// Gerencia todas as notificações do sistema respeitando as configurações
// do painel admin (Canais: Email, Sistema, Push, WhatsApp)
// ============================================================================

const mongoose = require('mongoose');
const Notificacao = require('../models/Notificacao');
const EmailService = require('./email-service-resend');
const emailService = new EmailService();

// ============ MODELO CONFIG INLINE (para evitar erro de import) ============
let Config;
try {
    Config = mongoose.model('Config');
    console.log('✅ Modelo Config já existe');
} catch {
    const ConfigSchema = new mongoose.Schema({
        chave: { 
            type: String, 
            required: true, 
            unique: true, 
            trim: true 
        },
        valor: { 
            type: mongoose.Schema.Types.Mixed, 
            required: true 
        },
        tipo: { 
            type: String, 
            enum: ['string', 'number', 'boolean', 'object', 'array'], 
            default: 'string' 
        },
        descricao: { 
            type: String, 
            default: '' 
        },
        categoria: { 
            type: String, 
            enum: ['geral', 'sistema', 'seguranca', 'provas', 'email', 'backups', 'logs', 'aparencia'], 
            default: 'geral' 
        },
        publico: { 
            type: Boolean, 
            default: false 
        },
        editavel: { 
            type: Boolean, 
            default: true 
        },
        atualizadoPor: { 
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'User' 
        },
        atualizadoEm: { 
            type: Date, 
            default: Date.now 
        }
    }, { 
        timestamps: true 
    });

    ConfigSchema.index({ chave: 1 }, { unique: true });
    ConfigSchema.index({ categoria: 1 });
    ConfigSchema.index({ atualizadoEm: -1 });

    Config = mongoose.model('Config', ConfigSchema);
    console.log('✅ Modelo Config criado com sucesso (inline)!');
}

class NotificationService {
    
    // ===== BUSCAR CONFIGURAÇÕES DE NOTIFICAÇÃO DO BANCO =====
    async getConfiguracoes() {
        try {
            const configDoc = await Config.findOne({ chave: 'notificacoes' });
            const configGeral = configDoc ? configDoc.valor : {};
            
            return {
                email: configGeral.email !== false,
                sistema: configGeral.sistema !== false,
                push: configGeral.push === true,
                whatsapp: configGeral.whatsapp === true,
                lembreteProva: configGeral.lembreteProva || 24,
                lembreteCorrecao: configGeral.lembreteCorrecao !== false,
                notificarResultado: configGeral.notificarResultado !== false,
                notificarCancelamento: configGeral.notificarCancelamento !== false
            };
        } catch (error) {
            console.error('❌ Erro ao buscar configurações de notificação:', error);
            // Valores padrão em caso de erro
            return {
                email: true,
                sistema: true,
                push: false,
                whatsapp: false,
                lembreteProva: 24,
                lembreteCorrecao: true,
                notificarResultado: true,
                notificarCancelamento: true
            };
        }
    }

    // ===== VERIFICAR SE PODE NOTIFICAR POR TIPO =====
    async podeNotificar(tipo) {
        const config = await this.getConfiguracoes();
        
        switch(tipo) {
            case 'sistema':
                return config.sistema;
            case 'resultado':
                return config.sistema && config.notificarResultado;
            case 'cancelamento':
                return config.sistema && config.notificarCancelamento;
            case 'correcao':
                return config.sistema && config.lembreteCorrecao;
            case 'email':
                return config.email;
            case 'push':
                return config.push;
            case 'whatsapp':
                return config.whatsapp;
            default:
                return true;
        }
    }

    // ===== NOTIFICAÇÃO PARA ALUNO (RESULTADO LIBERADO/EDITADO) =====
    async notificarAlunoResultado(aluno, prova, resultado, admin, tipoAcao = 'liberada') {
        try {
            // VERIFICAR CONFIGURAÇÕES
            const config = await this.getConfiguracoes();
            
            // Só notificar se notificações do sistema estiverem habilitadas
            if (!config.sistema) {
                console.log('🔕 Notificações do sistema desabilitadas - ignorando notificação para aluno');
                return { success: true, ignorado: true };
            }
            
            // Só notificar se notificação de resultado estiver habilitada
            if (!config.notificarResultado) {
                console.log('🔕 Notificações de resultado desabilitadas - ignorando notificação para aluno');
                return { success: true, ignorado: true };
            }

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

            // SE EMAIL ESTIVER HABILITADO, ENVIAR EMAIL
            if (config.email) {
                try {
                    const emailResult = await emailService.sendResultadoLiberado(
                        aluno.email,
                        aluno.nome,
                        prova.titulo,
                        resultado.nota,
                        resultado.acertos,
                        resultado.total
                    );
                    
                    if (emailResult.success) {
                        console.log(`📧 Email enviado para ${aluno.email} sobre resultado`);
                    } else {
                        console.warn(`⚠️ Falha no email para ${aluno.email}:`, emailResult.error);
                    }
                } catch (emailError) {
                    console.error('❌ Erro ao enviar email:', emailError.message);
                }
            }

            // SE PUSH ESTIVER HABILITADO (futuro)
            if (config.push) {
                console.log(`📱 Notificação push seria enviada para ${aluno.nome}`);
            }

            // SE WHATSAPP ESTIVER HABILITADO (futuro)
            if (config.whatsapp) {
                console.log(`💬 WhatsApp seria enviado para ${aluno.telefone || 'telefone não disponível'}`);
            }

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

    // ===== NOTIFICAÇÃO PARA PROFESSOR (RESULTADO LIBERADO/EDITADO) =====
    async notificarProfessorResultado(professor, aluno, prova, resultado, admin, tipoAcao = 'liberada') {
        try {
            // VERIFICAR CONFIGURAÇÕES
            const config = await this.getConfiguracoes();
            
            // Só notificar se notificações do sistema estiverem habilitadas
            if (!config.sistema) {
                console.log('🔕 Notificações do sistema desabilitadas - ignorando notificação para professor');
                return { success: true, ignorado: true };
            }

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

            // SE EMAIL ESTIVER HABILITADO E LEMBRETE DE CORREÇÃO ATIVO
            if (config.email && config.lembreteCorrecao) {
                console.log(`📧 Email seria enviado para ${professor.email || 'email não disponível'} sobre resultado ${tipoAcao}`);
            }

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

    // ===== NOTIFICAÇÃO DE PROVA CANCELADA (PARA PROFESSOR) =====
    async notificarCancelamento(professor, aluno, prova, motivo, isViolacao = false) {
        try {
            // VERIFICAR CONFIGURAÇÕES
            const config = await this.getConfiguracoes();
            
            if (!config.sistema) {
                console.log('🔕 Notificações do sistema desabilitadas - ignorando cancelamento');
                return { success: true, ignorado: true };
            }
            
            if (!config.notificarCancelamento) {
                console.log('🔕 Notificações de cancelamento desabilitadas - ignorando');
                return { success: true, ignorado: true };
            }

            const titulo = isViolacao ? '🚫 Prova Cancelada - Violação' : '⚠️ Prova Cancelada - Prazo';
            const cor = isViolacao ? '#dc2626' : '#ef4444';
            const icone = isViolacao ? '🚫' : '⚠️';

            const notificacao = new Notificacao({
                usuarioId: professor._id || professor.id,
                tipo: 'cancelamento',
                titulo: titulo,
                mensagem: `O aluno ${aluno.nome} teve a prova "${prova.titulo}" cancelada. Motivo: ${motivo}`,
                dados: {
                    alunoId: aluno._id || aluno.id,
                    alunoNome: aluno.nome,
                    provaId: prova._id || prova.id,
                    provaTitulo: prova.titulo,
                    motivo: motivo,
                    isViolacao: isViolacao
                },
                link: `/professor.html#/provas/${prova._id || prova.id}`,
                icone: icone,
                cor: cor,
                prioridade: 5
            });

            await notificacao.save();

            console.log(`✅ Notificação de cancelamento criada para professor ${professor.nome} (ID: ${notificacao._id})`);

            if (config.email) {
                console.log(`📧 Email de cancelamento seria enviado para ${professor.email || 'email não disponível'}`);
            }

            return {
                success: true,
                notificacao: notificacao
            };

        } catch (error) {
            console.error('❌ Erro ao notificar cancelamento:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ===== NOTIFICAÇÃO DE LEMBRETE DE PROVA (PARA ALUNO) =====
    async notificarLembreteProva(aluno, prova, horasAntes) {
        try {
            // VERIFICAR CONFIGURAÇÕES
            const config = await this.getConfiguracoes();
            
            if (!config.sistema) {
                console.log('🔕 Notificações do sistema desabilitadas - ignorando lembrete');
                return { success: true, ignorado: true };
            }

            const notificacao = new Notificacao({
                usuarioId: aluno._id || aluno.id,
                tipo: 'sistema',
                titulo: '📅 Lembrete de Prova',
                mensagem: `A prova "${prova.titulo}" começará em ${horasAntes} horas. Prepare-se!`,
                dados: {
                    provaId: prova._id || prova.id,
                    provaTitulo: prova.titulo,
                    horasAntes: horasAntes,
                    dataInicio: prova.dataInicio
                },
                link: `/aluno.html`,
                icone: '📅',
                cor: '#f59e0b',
                prioridade: 2
            });

            await notificacao.save();

            console.log(`✅ Lembrete de prova criado para aluno ${aluno.nome} (ID: ${notificacao._id})`);

            // SE EMAIL ESTIVER HABILITADO, ENVIAR LEMBRETE
            if (config.email) {
                try {
                    const emailResult = await emailService.sendLembreteProva(
                        aluno.email,
                        aluno.nome,
                        prova.titulo,
                        horasAntes,
                        prova.dataInicio
                    );
                    
                    if (emailResult.success) {
                        console.log(`📧 Lembrete enviado para ${aluno.email}`);
                    }
                } catch (emailError) {
                    console.error('❌ Erro ao enviar lembrete:', emailError.message);
                }
            }

            return {
                success: true,
                notificacao: notificacao
            };

        } catch (error) {
            console.error('❌ Erro ao enviar lembrete de prova:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ===== NOTIFICAÇÃO DE LEMBRETE DE CORREÇÃO (PARA PROFESSOR) =====
    async notificarLembreteCorrecao(professor, provasPendentes) {
        try {
            // VERIFICAR CONFIGURAÇÕES
            const config = await this.getConfiguracoes();
            
            if (!config.sistema) {
                console.log('🔕 Notificações do sistema desabilitadas - ignorando lembrete de correção');
                return { success: true, ignorado: true };
            }
            
            if (!config.lembreteCorrecao) {
                console.log('🔕 Lembretes de correção desabilitados - ignorando');
                return { success: true, ignorado: true };
            }

            const quantidade = provasPendentes.length;
            const titulo = quantidade === 1 
                ? '📝 1 prova aguardando correção' 
                : `📝 ${quantidade} provas aguardando correção`;

            const notificacao = new Notificacao({
                usuarioId: professor._id || professor.id,
                tipo: 'sistema',
                titulo: titulo,
                mensagem: `Você tem ${quantidade} prova(s) pendente(s) de correção. Acesse o painel para corrigir.`,
                dados: {
                    quantidade: quantidade,
                    provasPendentes: provasPendentes.map(p => ({
                        id: p._id,
                        titulo: p.titulo,
                        aluno: p.alunoNome
                    }))
                },
                link: `/professor.html#/correcoes`,
                icone: '📝',
                cor: '#3b82f6',
                prioridade: 3
            });

            await notificacao.save();

            console.log(`✅ Lembrete de correção criado para professor ${professor.nome} (ID: ${notificacao._id})`);

            if (config.email) {
                console.log(`📧 Email de lembrete de correção seria enviado para ${professor.email || 'email não disponível'}`);
            }

            return {
                success: true,
                notificacao: notificacao
            };

        } catch (error) {
            console.error('❌ Erro ao enviar lembrete de correção:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ===== NOTIFICAÇÃO DE NOVA PROVA PARA CORRIGIR (APÓS ALUNO FINALIZAR) =====
    async notificarNovaProvaParaCorrigir(professorId, alunoNome, provaTitulo, provaId) {
        try {
            // VERIFICAR CONFIGURAÇÕES
            const config = await this.getConfiguracoes();
            
            if (!config.sistema) {
                return { success: true, ignorado: true };
            }
            
            if (!config.lembreteCorrecao) {
                return { success: true, ignorado: true };
            }

            const notificacao = new Notificacao({
                usuarioId: professorId,
                tipo: 'sistema',
                titulo: '📝 Nova prova para corrigir',
                mensagem: `O aluno ${alunoNome} finalizou a prova "${provaTitulo}"`,
                dados: {
                    alunoNome: alunoNome,
                    provaId: provaId,
                    provaTitulo: provaTitulo
                },
                link: `/professor.html#/provas/${provaId}`,
                icone: '📝',
                cor: '#3b82f6',
                prioridade: 3
            });

            await notificacao.save();

            console.log(`✅ Notificação de nova prova criada para professor ${professorId}`);

            return {
                success: true,
                notificacao: notificacao
            };

        } catch (error) {
            console.error('❌ Erro ao notificar nova prova:', error);
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

    // ===== MARCAR NOTIFICAÇÃO COMO LIDA =====
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

    // ===== MARCAR TODAS AS NOTIFICAÇÕES COMO LIDAS =====
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

    // ===== CONTAR NOTIFICAÇÕES NÃO LIDAS =====
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

    // ===== DELETAR TODAS AS NOTIFICAÇÕES DO USUÁRIO =====
    async deletarTodasDoUsuario(usuarioId) {
        try {
            const resultado = await Notificacao.deleteMany({
                usuarioId: usuarioId
            });

            return {
                success: true,
                deletados: resultado.deletedCount
            };

        } catch (error) {
            console.error('❌ Erro ao deletar notificações do usuário:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = NotificationService;