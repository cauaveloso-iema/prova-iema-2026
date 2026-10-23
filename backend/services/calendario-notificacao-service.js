// ============================================================================
// SERVIÇO DE NOTIFICAÇÕES DO CALENDÁRIO (VERSÃO COMPLETA E CORRIGIDA)
// Notifica todos os perfis que têm permissão de visualizar o evento,
// de acordo com a matriz de visibilidade.
// ============================================================================

const mongoose = require('mongoose');
const Evento = require('../models/Evento');
const Notificacao = require('../models/Notificacao');
const User = require('../models/User');
const Turma = require('../models/Turma');

// 🔥 FUNÇÃO AUXILIAR: OBTER O MODELO CONFIG (REGISTRADO PELO SERVER.JS)
function getConfigModel() {
    try {
        return mongoose.model('Config');
    } catch (error) {
        // Se o modelo não existir, cria um fallback (para evitar crash)
        const ConfigSchema = new mongoose.Schema({
            chave: { type: String, required: true, unique: true, trim: true },
            valor: { type: mongoose.Schema.Types.Mixed, required: true },
            tipo: { type: String, enum: ['string', 'number', 'boolean', 'object', 'array'], default: 'string' },
            descricao: { type: String, default: '' },
            categoria: { type: String, default: 'geral' },
            publico: { type: Boolean, default: false },
            editavel: { type: Boolean, default: true },
            atualizadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            atualizadoEm: { type: Date, default: Date.now }
        }, { timestamps: true });

        return mongoose.model('Config', ConfigSchema);
    }
}

class CalendarioNotificacaoService {

    // ============ FUNÇÃO AUXILIAR: BUSCAR PERFIS ADMINISTRATIVOS DO BANCO ============
    async obterPerfisAdministrativos() {
        try {
            const Config = getConfigModel();
            const config = await Config.findOne({ chave: 'sistema.perfisAdministrativos' });
            if (config && Array.isArray(config.valor) && config.valor.length > 0) {
                return config.valor;
            }
            return [
                'admin', 'super_admin', 'setor_pedagogico', 'gestao_geral',
                'supervisao', 'coordenacao_patio', 'secretaria', 'recepcao',
                'enfermaria', 'cozinha', 'assistente-social', 'psicologia',
                'protagonismo', 'biblioteca'
            ];
        } catch (error) {
            console.error('⚠️ Erro ao buscar perfis administrativos, usando padrão:', error.message);
            return [
                'admin', 'super_admin', 'setor_pedagogico', 'gestao_geral',
                'supervisao', 'coordenacao_patio', 'secretaria', 'recepcao',
                'enfermaria', 'cozinha', 'assistente-social', 'psicologia',
                'protagonismo', 'biblioteca'
            ];
        }
    }

    // ============ FUNÇÃO AUXILIAR: DETERMINAR QUEM DEVE SER NOTIFICADO ============
    async determinarDestinatarios(evento) {
        const perfisAdministrativos = await this.obterPerfisAdministrativos();
        const roleCriador = evento.usuarioId?.role;
        const idCriador = evento.usuarioId?._id?.toString() || evento.usuarioId?.toString();

        let destinatarios = new Set();

        if (roleCriador === 'admin' || roleCriador === 'super_admin') {
            if (evento.turmaId) {
                const turma = await Turma.findById(evento.turmaId).populate('alunos', '_id');
                if (turma && turma.alunos) {
                    turma.alunos.forEach(aluno => destinatarios.add(aluno._id.toString()));
                }
            }
            if (evento.usuarioId && evento.usuarioId._id) {
                destinatarios.add(evento.usuarioId._id.toString());
            }
        }
        else if (roleCriador === 'professor') {
            const admins = await User.find({ role: { $in: ['admin', 'super_admin'] } }).select('_id');
            admins.forEach(admin => destinatarios.add(admin._id.toString()));
        }
        else if (roleCriador === 'setor_pedagogico') {
            const usuarios = await User.find({ role: { $in: ['admin', 'super_admin', 'setor_pedagogico'] } }).select('_id');
            usuarios.forEach(u => destinatarios.add(u._id.toString()));
        }
        else if (perfisAdministrativos.includes(roleCriador)) {
            const usuarios = await User.find({ role: { $in: perfisAdministrativos } }).select('_id');
            usuarios.forEach(u => destinatarios.add(u._id.toString()));
        }
        else {
            const admins = await User.find({ role: { $in: ['admin', 'super_admin'] } }).select('_id');
            admins.forEach(admin => destinatarios.add(admin._id.toString()));
        }

        if (idCriador) {
            destinatarios.delete(idCriador);
        }

        return Array.from(destinatarios);
    }

    // ============ VERIFICAR NOTIFICAÇÕES PENDENTES DO CALENDÁRIO ============
    async verificarNotificacoesCalendario() {
        try {            
            const agora = new Date();
            
            const eventos = await Evento.find({
                notificacaoAtivada: true,
                'notificacoes.enviada': false,
                dataInicio: { $gte: agora }
            }).populate('usuarioId', 'nome email')
              .populate({
                  path: 'turmaId',
                  populate: { path: 'alunos', select: 'nome email' }
              });

            let notificacoesEnviadas = 0;

            for (const evento of eventos) {
                for (const notif of evento.notificacoes) {
                    if (notif.enviada) {
                        continue;
                    }

                    const dataEvento = new Date(evento.dataInicio);
                    const dataNotificar = new Date(dataEvento);
                    dataNotificar.setMinutes(dataNotificar.getMinutes() - notif.minutosAntes);

                    if (agora >= dataNotificar) {
                        console.log(`      ✅ HORA DE NOTIFICAR!`);
                        
                        notif.enviada = true;
                        notif.enviadaEm = agora;

                        const professor = await User.findById(evento.usuarioId._id).select('nome');
                        const nomeProfessor = professor?.nome || 'Professor';

                        // 🔥 NOTIFICAR O PROFESSOR
                        const mensagemProfessor = this.construirMensagemParaProfessor(evento, notif.minutosAntes);
                        
                        const notificacaoProfessor = new Notificacao({
                            usuarioId: evento.usuarioId._id,
                            tipo: 'sistema',
                            titulo: '📅 Lembrete de Evento',
                            mensagem: mensagemProfessor,
                            icone: '📅',
                            cor: evento.cor || '#3b82f6',
                            link: `/calendario.html?evento=${evento._id}&editavel=true`,
                            prioridade: notif.minutosAntes === 0 ? 5 : 3,
                            dados: {
                                eventoId: evento._id,
                                evento: evento.titulo,
                                descricao: evento.descricao,
                                tipo: evento.tipo,
                                minutosAntes: notif.minutosAntes,
                                dataEvento: evento.dataInicio,
                                horarioInicio: evento.horarioInicio,
                                local: evento.local,
                                professor: nomeProfessor,
                                podeEditar: true
                            }
                        });

                        await notificacaoProfessor.save();
                        notificacoesEnviadas++;
                        console.log(`      ✅ Notificação criada para professor ${nomeProfessor} (ID: ${notificacaoProfessor._id})`);

                        // 🔥 NOTIFICAR A TURMA (se houver)
                        if (evento.turmaId && evento.turmaId.alunos && evento.turmaId.alunos.length > 0) {
                            const mensagemTurma = this.construirMensagemParaTurma(evento, notif.minutosAntes, nomeProfessor);
                            
                            console.log(`      📢 Enviando para turma ${evento.turmaId.nome} (${evento.turmaId.alunos.length} alunos)`);
                            
                            for (const aluno of evento.turmaId.alunos) {
                                if (aluno._id.toString() === evento.usuarioId._id.toString()) continue;
                                
                                const notificacaoAluno = new Notificacao({
                                    usuarioId: aluno._id,
                                    tipo: 'sistema',
                                    titulo: `📅 ${evento.titulo} - ${nomeProfessor}`,
                                    mensagem: mensagemTurma,
                                    icone: '🏫',
                                    cor: evento.cor || '#10b981',
                                    link: `/calendario.html?evento=${evento._id}&visualizar=true`,
                                    prioridade: 2,
                                    dados: {
                                        eventoId: evento._id,
                                        evento: evento.titulo,
                                        descricao: evento.descricao,
                                        turmaId: evento.turmaId._id,
                                        turmaNome: evento.turmaId.nome,
                                        minutosAntes: notif.minutosAntes,
                                        dataEvento: evento.dataInicio,
                                        horarioInicio: evento.horarioInicio,
                                        local: evento.local,
                                        professor: nomeProfessor,
                                        podeEditar: false
                                    }
                                });

                                await notificacaoAluno.save();
                                notificacoesEnviadas++;
                            }
                            
                            console.log(`      ✅ Notificações enviadas para ${evento.turmaId.alunos.length} alunos`);
                        }
                    } else {
                        const diffMin = Math.round((dataNotificar - agora) / 60000);
                    }
                }

                await evento.save();
            }
            
            return {
                success: true,
                notificacoesEnviadas,
                timestamp: agora
            };

        } catch (error) {
            console.error('❌ Erro ao verificar notificações do calendário:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ============ NOTIFICAÇÃO DE EVENTO ATUALIZADO ============
    async notificarEventoAtualizado(evento, editorId, camposAlterados) {
        try {
            const editor = await User.findById(editorId).select('nome role');
            const professor = await User.findById(evento.usuarioId).select('nome');
            
            if (!editor || !professor) {
                console.log('❌ Editor ou professor não encontrado');
                return { success: false };
            }

            const nomeEditor = editor.nome;
            const nomeProfessor = professor.nome;
            const cargoEditor = editor.role === 'admin' || editor.role === 'super_admin' ? 'Administrador' : 'Professor';

            if (evento.usuarioId.toString() !== editorId) {
                const camposTexto = camposAlterados.map(campo => {
                    const nomes = {
                        'titulo': 'título',
                        'descricao': 'descrição',
                        'dataInicio': 'data',
                        'horarioInicio': 'horário',
                        'local': 'local',
                        'tipo': 'tipo'
                    };
                    return nomes[campo] || campo;
                }).join(', ');
                
                console.log(`👤 ${cargoEditor} ${nomeEditor} editou evento do professor ${nomeProfessor}`);
                
                const notificacao = new Notificacao({
                    usuarioId: evento.usuarioId,
                    tipo: 'sistema',
                    titulo: '📅 Evento Atualizado',
                    mensagem: `O evento "${evento.titulo}" foi atualizado por ${nomeEditor} (${cargoEditor}).\nCampos alterados: ${camposTexto}`,
                    icone: '✏️',
                    cor: '#f59e0b',
                    link: `/calendario.html?evento=${evento._id}&editavel=true`,
                    prioridade: 3,
                    dados: {
                        eventoId: evento._id,
                        evento: evento.titulo,
                        camposAlterados,
                        editorId,
                        editorNome: nomeEditor,
                        editorCargo: cargoEditor,
                        professor: nomeProfessor
                    }
                });

                await notificacao.save();
                console.log(`✅ Notificação de atualização enviada para professor ${nomeProfessor} (ID: ${notificacao._id})`);
            }

            return { success: true };

        } catch (error) {
            console.error('❌ Erro ao notificar evento atualizado:', error);
            return { success: false, error: error.message };
        }
    }

    // ============ CONSTRUIR MENSAGEM PARA O PROFESSOR ============
    construirMensagemParaProfessor(evento, minutosAntes) {
        const dataFormatada = new Date(evento.dataInicio).toLocaleDateString('pt-BR');
        const horaFormatada = evento.horarioInicio ? ` às ${evento.horarioInicio}` : '';
        
        let mensagem = `📌 ${evento.titulo}`;
        
        if (evento.descricao) {
            mensagem += `\n📝 ${evento.descricao}`;
        }
        
        mensagem += `\n📅 Data: ${dataFormatada}${horaFormatada}`;
        
        if (evento.local) {
            mensagem += `\n📍 Local: ${evento.local}`;
        }
        
        if (minutosAntes === 0) {
            mensagem += `\n🔔 Este evento começa AGORA!`;
        } else if (minutosAntes === 5) {
            mensagem += `\n⏰ Faltam 5 minutos para começar!`;
        } else if (minutosAntes === 15) {
            mensagem += `\n⏰ Faltam 15 minutos para começar!`;
        } else if (minutosAntes === 30) {
            mensagem += `\n⏰ Faltam 30 minutos para começar!`;
        } else if (minutosAntes === 60) {
            mensagem += `\n⏰ Falta 1 hora para começar!`;
        } else if (minutosAntes === 120) {
            mensagem += `\n⏰ Faltam 2 horas para começar!`;
        } else if (minutosAntes === 1440) {
            mensagem += `\n📅 Este evento será amanhã!`;
        }
        
        return mensagem;
    }

    // ============ CONSTRUIR MENSAGEM PARA A TURMA ============
    construirMensagemParaTurma(evento, minutosAntes, nomeProfessor) {
        const dataFormatada = new Date(evento.dataInicio).toLocaleDateString('pt-BR');
        const horaFormatada = evento.horarioInicio ? ` às ${evento.horarioInicio}` : '';
        
        let mensagem = `👨‍🏫 Professor: ${nomeProfessor}\n\n`;
        mensagem += `${evento.titulo}`;
        
        if (evento.descricao) {
            mensagem += `\n${evento.descricao}`;
        }
        
        mensagem += `\n📅 Data: ${dataFormatada}${horaFormatada}`;
        
        if (evento.local) {
            mensagem += `\n📍 Local: ${evento.local}`;
        }
        
        if (minutosAntes === 0) {
            mensagem += `\n🔔 Começa AGORA!`;
        } else if (minutosAntes === 5) {
            mensagem += `\n⏰ Começa em 5 minutos`;
        } else if (minutosAntes === 15) {
            mensagem += `\n⏰ Começa em 15 minutos`;
        } else if (minutosAntes === 30) {
            mensagem += `\n⏰ Começa em 30 minutos`;
        } else if (minutosAntes === 60) {
            mensagem += `\n⏰ Começa em 1 hora`;
        } else if (minutosAntes === 120) {
            mensagem += `\n⏰ Começa em 2 horas`;
        } else if (minutosAntes === 1440) {
            mensagem += `\n📅 Amanhã`;
        }
        
        return mensagem;
    }

    // ============ NOTIFICAÇÃO DE EVENTO CRIADO ============
    async notificarEventoCriado(evento, criadorId, criadorNome) {
        try {
            const criador = await User.findById(criadorId).select('nome role');
            const professorResponsavel = await User.findById(evento.usuarioId).select('nome email');
            
            if (!professorResponsavel) {
                console.log('❌ Professor responsável não encontrado');
                return { success: false };
            }

            const nomeProfessor = professorResponsavel.nome;
            const nomeCriador = criador?.nome || criadorNome || 'Administrador';
            const cargoCriador = criador?.role === 'admin' || criador?.role === 'super_admin' ? 'Administrador' : 'Professor';

            if (criadorId !== evento.usuarioId.toString()) {
                console.log(`👤 ${cargoCriador} ${nomeCriador} criou evento para professor ${nomeProfessor}`);
                
                const dataFormatada = new Date(evento.dataInicio).toLocaleDateString('pt-BR');
                const horaFormatada = evento.horarioInicio ? ` às ${evento.horarioInicio}` : '';
                
                let mensagem = `📌 ${evento.titulo}`;
                if (evento.descricao) mensagem += `\n📝 ${evento.descricao}`;
                mensagem += `\n📅 Data: ${dataFormatada}${horaFormatada}`;
                if (evento.local) mensagem += `\n📍 Local: ${evento.local}`;
                
                const notificacao = new Notificacao({
                    usuarioId: professorResponsavel._id,
                    tipo: 'sistema',
                    titulo: '📅 Novo Evento Criado para Você',
                    mensagem: `${nomeCriador} (${cargoCriador}) criou um evento em seu nome:\n\n${mensagem}`,
                    icone: '👤',
                    cor: '#8b5cf6',
                    link: `/calendario.html?evento=${evento._id}&editavel=true`,
                    prioridade: 3,
                    dados: {
                        eventoId: evento._id,
                        evento: evento.titulo,
                        professor: nomeProfessor,
                        criadoPor: nomeCriador,
                        criadoPorCargo: cargoCriador
                    }
                });

                await notificacao.save();
                console.log(`✅ Notificação enviada para professor ${nomeProfessor} (ID: ${notificacao._id})`);
            }

            return { success: true };

        } catch (error) {
            console.error('❌ Erro ao notificar evento criado:', error);
            return { success: false };
        }
    }

    // ============ FORÇAR NOTIFICAÇÃO DE UM EVENTO (PARA TESTES) ============
    async forcarNotificacaoEvento(eventoId) {
        try {
            const evento = await Evento.findById(eventoId)
                .populate('usuarioId', 'nome email')
                .populate({
                    path: 'turmaId',
                    populate: { path: 'alunos', select: 'nome email' }
                });
            
            if (!evento) {
                return { success: false, error: 'Evento não encontrado' };
            }
            
            console.log(`🚀 Forçando notificação para evento ${evento.titulo}`);
            
            const professor = await User.findById(evento.usuarioId._id).select('nome');
            const nomeProfessor = professor?.nome || 'Professor';
            
            let notificacoesEnviadas = 0;
            
            const mensagemProf = this.construirMensagemParaProfessor(evento, 5);
            
            const notifProf = new Notificacao({
                usuarioId: evento.usuarioId._id,
                tipo: 'sistema',
                titulo: '🔔 Lembrete de Evento',
                mensagem: mensagemProf,
                icone: '📅',
                cor: evento.cor || '#3b82f6',
                link: `/calendario.html?evento=${evento._id}&editavel=true`,
                prioridade: 3,
                dados: {
                    eventoId: evento._id,
                    evento: evento.titulo,
                    professor: nomeProfessor
                }
            });
            
            await notifProf.save();
            notificacoesEnviadas++;
            
            if (evento.turmaId && evento.turmaId.alunos) {
                const mensagemTurma = this.construirMensagemParaTurma(evento, 5, nomeProfessor);
                
                for (const aluno of evento.turmaId.alunos) {
                    if (aluno._id.toString() === evento.usuarioId._id.toString()) continue;
                    
                    const notifAluno = new Notificacao({
                        usuarioId: aluno._id,
                        tipo: 'sistema',
                        titulo: `📅 ${evento.titulo} - ${nomeProfessor}`,
                        mensagem: mensagemTurma,
                        icone: '🏫',
                        cor: '#10b981',
                        link: `/calendario.html?evento=${evento._id}&visualizar=true`,
                        prioridade: 2,
                        dados: {
                            eventoId: evento._id,
                            evento: evento.titulo,
                            professor: nomeProfessor
                        }
                    });
                    
                    await notifAluno.save();
                    notificacoesEnviadas++;
                }
            }
            
            return {
                success: true,
                notificacoesEnviadas,
                evento: evento.titulo
            };
            
        } catch (error) {
            console.error('❌ Erro ao forçar notificação:', error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = CalendarioNotificacaoService;