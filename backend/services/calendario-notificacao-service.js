// ============================================================================
// SERVIÇO DE NOTIFICAÇÕES DO CALENDÁRIO
// ============================================================================
// MATRIZ DE NOTIFICAÇÃO:
//   admin / super_admin  → alunos (se turma) + todos os setores adm
//   professor            → alunos (se turma) + admin/super_admin
//   setor_pedagogico     → professores + admin/super_admin + gestao_geral
//   gestao_geral         → TODOS os setores adm (inclui recepcao)
//   outros setores adm   → admin/super_admin + gestao_geral
// Regra geral: ninguém se auto-notifica.
// ============================================================================

const mongoose = require('mongoose');
const Evento = require('../models/Evento');
const Notificacao = require('../models/Notificacao');
const User = require('../models/User');
const Turma = require('../models/Turma');

const PERFIS_ADM_PADRAO = [
    'admin', 'super_admin', 'setor_pedagogico', 'gestao_geral',
    'supervisao', 'coordenacao_patio', 'secretaria', 'recepcao',
    'enfermaria', 'cozinha', 'assistente-social', 'psicologia',
    'protagonismo', 'biblioteca'
];

function getConfigModel() {
    try {
        return mongoose.model('Config');
    } catch (error) {
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

    async obterPerfisAdministrativos() {
        let perfis = [...PERFIS_ADM_PADRAO];

        try {
            const Config = getConfigModel();
            const config = await Config.findOne({ chave: 'sistema.perfisAdministrativos' });

            if (config && Array.isArray(config.valor) && config.valor.length > 0) {
                perfis = [...new Set([...config.valor, ...PERFIS_ADM_PADRAO])];
            }
        } catch (error) {
            console.warn('[Perfis] Erro ao buscar config, usando padrão:', error.message);
        }

        return perfis;
    }

    async _resolverUsuariosEvento(evento) {
        let usuario = evento.usuarioId;
        if (usuario && !usuario.role) {
            usuario = await User.findById(usuario).select('nome email role');
        }

        let criador = evento.criadoPor;
        if (criador && !criador.role) {
            criador = await User.findById(criador).select('nome email role');
        }

        return { usuario, criador };
    }

    async determinarDestinatarios(evento) {
        const perfisAdministrativos = await this.obterPerfisAdministrativos();
        const { usuario, criador } = await this._resolverUsuariosEvento(evento);

        const roleCriador = usuario?.role || criador?.role;
        const idProfessorResponsavel = usuario?._id?.toString() || usuario?.toString();
        const idCriador = criador?._id?.toString() || criador?.toString() || idProfessorResponsavel;

        const destinatarios = new Set();

        if (!roleCriador) {
            console.error('[determinarDestinatarios] roleCriador undefined para evento', evento._id);
            return [];
        }

        // Alunos (se turma)
        const rolesQueNotificamAlunos = ['admin', 'super_admin', 'professor', 'setor_pedagogico', 'gestao_geral'];
        if (rolesQueNotificamAlunos.includes(roleCriador) && evento.turmaId) {
            try {
                const turmaId = evento.turmaId?._id || evento.turmaId;
                const turma = await Turma.findById(turmaId).populate('alunos', '_id');
                if (turma && Array.isArray(turma.alunos)) {
                    turma.alunos.forEach(aluno => {
                        if (aluno && aluno._id) destinatarios.add(aluno._id.toString());
                    });
                }
            } catch (err) {
                console.error('[determinarDestinatarios] Erro ao buscar alunos:', err.message);
            }
        }

        if (roleCriador === 'admin' || roleCriador === 'super_admin') {
            const usuarios = await User.find({
                role: { $in: perfisAdministrativos }
            }).select('_id');
            usuarios.forEach(u => destinatarios.add(u._id.toString()));
        }
        else if (roleCriador === 'professor') {
            const admins = await User.find({
                role: { $in: ['admin', 'super_admin'] }
            }).select('_id');
            admins.forEach(a => destinatarios.add(a._id.toString()));
        }
        else if (roleCriador === 'setor_pedagogico') {
            const professores = await User.find({ role: 'professor' }).select('_id');
            professores.forEach(p => destinatarios.add(p._id.toString()));

            const admins = await User.find({
                role: { $in: ['admin', 'super_admin'] }
            }).select('_id');
            admins.forEach(a => destinatarios.add(a._id.toString()));

            const gestao = await User.find({ role: 'gestao_geral' }).select('_id');
            gestao.forEach(g => destinatarios.add(g._id.toString()));
        }
        else if (roleCriador === 'gestao_geral') {
            const usuarios = await User.find({
                role: { $in: perfisAdministrativos }
            }).select('_id');
            usuarios.forEach(u => destinatarios.add(u._id.toString()));
        }
        else if (perfisAdministrativos.includes(roleCriador)) {
            const admins = await User.find({
                role: { $in: ['admin', 'super_admin'] }
            }).select('_id');
            admins.forEach(a => destinatarios.add(a._id.toString()));

            const gestao = await User.find({ role: 'gestao_geral' }).select('_id');
            gestao.forEach(g => destinatarios.add(g._id.toString()));
        }
        else {
            const admins = await User.find({
                role: { $in: ['admin', 'super_admin'] }
            }).select('_id');
            admins.forEach(a => destinatarios.add(a._id.toString()));
        }

        if (idCriador) destinatarios.delete(idCriador);

        return Array.from(destinatarios);
    }

    async verificarNotificacoesCalendario() {
        try {
            const agora = new Date();

            const eventos = await Evento.find({
                notificacaoAtivada: true,
                'notificacoes.enviada': false,
                dataInicio: { $gte: agora }
            }).populate('usuarioId', 'nome email role')
              .populate({
                  path: 'turmaId',
                  populate: { path: 'alunos', select: 'nome email' }
              });

            let notificacoesEnviadas = 0;

            for (const evento of eventos) {
                for (const notif of evento.notificacoes) {
                    if (notif.enviada) continue;

                    const dataEvento = new Date(evento.dataInicio);
                    const dataNotificar = new Date(dataEvento);
                    dataNotificar.setMinutes(dataNotificar.getMinutes() - notif.minutosAntes);

                    if (agora < dataNotificar) continue;

                    notif.enviada = true;
                    notif.enviadaEm = agora;

                    const professor = await User.findById(evento.usuarioId._id).select('nome');
                    const nomeProfessor = professor?.nome || 'Professor';

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

                    if (evento.turmaId && evento.turmaId.alunos && evento.turmaId.alunos.length > 0) {
                        const mensagemTurma = this.construirMensagemParaTurma(evento, notif.minutosAntes, nomeProfessor);

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
            console.error('❌ Erro ao verificar notificações:', error);
            return { success: false, error: error.message };
        }
    }

    async notificarEventoAtualizado(evento, editorId, camposAlterados) {
        try {
            const editor = await User.findById(editorId).select('nome role');
            const professor = await User.findById(evento.usuarioId).select('nome');

            if (!editor || !professor) {
                return { success: false };
            }

            const nomeEditor = editor.nome;
            const nomeProfessor = professor.nome;
            const cargoEditor = (editor.role === 'admin' || editor.role === 'super_admin')
                ? 'Administrador'
                : (editor.role || 'Usuário');

            const camposTexto = (camposAlterados || []).map(campo => {
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

            const destinatarios = await this.determinarDestinatarios(evento);
            const destinatariosFiltrados = destinatarios.filter(id => id !== editorId.toString());

            const idsAlunos = new Set();
            if (evento.turmaId) {
                try {
                    const turmaId = evento.turmaId?._id || evento.turmaId;
                    const turma = await Turma.findById(turmaId).populate('alunos', '_id');
                    if (turma && Array.isArray(turma.alunos)) {
                        turma.alunos.forEach(a => {
                            if (a && a._id) idsAlunos.add(a._id.toString());
                        });
                    }
                } catch (err) {
                    console.error('[notificarEventoAtualizado] Erro ao identificar alunos:', err.message);
                }
            }

            let notificacoesEnviadas = 0;

            for (const destId of destinatariosFiltrados) {
                const isProfessor = destId === evento.usuarioId.toString();
                const isAluno = idsAlunos.has(destId);

                let titulo, icone, link, prioridade, mensagem;

                if (isProfessor) {
                    titulo = '📅 Seu Evento Foi Atualizado';
                    icone = '✏️';
                    link = `/calendario.html?evento=${evento._id}&editavel=true`;
                    prioridade = 3;
                    mensagem = `O evento "${evento.titulo}" foi atualizado por ${nomeEditor} (${cargoEditor}).\nCampos alterados: ${camposTexto || 'diversos'}`;
                } else if (isAluno) {
                    titulo = `📅 ${evento.titulo} - Atualizado`;
                    icone = '🏫';
                    link = `/calendario.html?evento=${evento._id}&visualizar=true`;
                    prioridade = 2;
                    mensagem = `O evento "${evento.titulo}" foi atualizado por ${nomeEditor}.\nCampos alterados: ${camposTexto || 'diversos'}`;
                } else {
                    titulo = '📅 Evento Atualizado';
                    icone = '✏️';
                    link = `/calendario.html?evento=${evento._id}&visualizar=true`;
                    prioridade = 2;
                    mensagem = `O evento "${evento.titulo}" foi atualizado por ${nomeEditor} (${cargoEditor}).\nCampos alterados: ${camposTexto || 'diversos'}`;
                }

                const notificacao = new Notificacao({
                    usuarioId: destId,
                    tipo: 'sistema',
                    titulo,
                    mensagem,
                    icone,
                    cor: '#f59e0b',
                    link,
                    prioridade,
                    dados: {
                        eventoId: evento._id,
                        evento: evento.titulo,
                        camposAlterados: camposAlterados || [],
                        editorId,
                        editorNome: nomeEditor,
                        editorCargo: cargoEditor,
                        professor: nomeProfessor
                    }
                });

                await notificacao.save();
                notificacoesEnviadas++;
            }

            return { success: true, notificacoesEnviadas };

        } catch (error) {
            console.error('[notificarEventoAtualizado] Erro:', error);
            return { success: false, error: error.message };
        }
    }

    construirMensagemParaProfessor(evento, minutosAntes) {
        const dataFormatada = new Date(evento.dataInicio).toLocaleDateString('pt-BR');
        const horaFormatada = evento.horarioInicio ? ` às ${evento.horarioInicio}` : '';

        let mensagem = `📌 ${evento.titulo}`;

        if (evento.descricao) mensagem += `\n📝 ${evento.descricao}`;

        mensagem += `\n📅 Data: ${dataFormatada}${horaFormatada}`;

        if (evento.local) mensagem += `\n📍 Local: ${evento.local}`;

        const avisos = {
            0: '\n🔔 Este evento começa AGORA!',
            5: '\n⏰ Faltam 5 minutos para começar!',
            15: '\n⏰ Faltam 15 minutos para começar!',
            30: '\n⏰ Faltam 30 minutos para começar!',
            60: '\n⏰ Falta 1 hora para começar!',
            120: '\n⏰ Faltam 2 horas para começar!',
            1440: '\n📅 Este evento será amanhã!'
        };
        if (avisos[minutosAntes]) mensagem += avisos[minutosAntes];

        return mensagem;
    }

    construirMensagemParaTurma(evento, minutosAntes, nomeProfessor) {
        const dataFormatada = new Date(evento.dataInicio).toLocaleDateString('pt-BR');
        const horaFormatada = evento.horarioInicio ? ` às ${evento.horarioInicio}` : '';

        let mensagem = `👨‍🏫 Professor: ${nomeProfessor}\n\n${evento.titulo}`;

        if (evento.descricao) mensagem += `\n${evento.descricao}`;

        mensagem += `\n📅 Data: ${dataFormatada}${horaFormatada}`;

        if (evento.local) mensagem += `\n📍 Local: ${evento.local}`;

        const avisos = {
            0: '\n🔔 Começa AGORA!',
            5: '\n⏰ Começa em 5 minutos',
            15: '\n⏰ Começa em 15 minutos',
            30: '\n⏰ Começa em 30 minutos',
            60: '\n⏰ Começa em 1 hora',
            120: '\n⏰ Começa em 2 horas',
            1440: '\n📅 Amanhã'
        };
        if (avisos[minutosAntes]) mensagem += avisos[minutosAntes];

        return mensagem;
    }

    async notificarEventoCriado(evento, criadorId, criadorNome) {
        try {
            const eventoPopulado = await Evento.findById(evento._id)
                .populate('usuarioId', 'nome email role')
                .populate('criadoPor', 'nome email role')
                .populate({
                    path: 'turmaId',
                    populate: { path: 'alunos', select: 'nome email' }
                });

            if (!eventoPopulado) {
                return { success: false, error: 'Evento não encontrado' };
            }

            const criador = await User.findById(criadorId).select('nome role');
            const professorResponsavel = eventoPopulado.usuarioId;

            if (!professorResponsavel || !professorResponsavel.role) {
                return { success: false, error: 'Professor não encontrado' };
            }

            const nomeProfessor = professorResponsavel.nome;
            const nomeCriador = criador?.nome || criadorNome || 'Sistema';
            const cargoCriador = (criador?.role === 'admin' || criador?.role === 'super_admin')
                ? 'Administrador'
                : (criador?.role || 'Usuário');

            const destinatarios = await this.determinarDestinatarios(eventoPopulado);
            const destinatariosFiltrados = destinatarios.filter(id => id !== criadorId.toString());

            const usuariosRecepcao = await User.find({
                role: 'recepcao',
                ativo: { $ne: false }
            }).select('_id');
            const recepcaoIds = usuariosRecepcao.map(u => u._id.toString());

            const dataFormatada = new Date(eventoPopulado.dataInicio).toLocaleDateString('pt-BR');
            const horaFormatada = eventoPopulado.horarioInicio ? ` às ${eventoPopulado.horarioInicio}` : '';

            let mensagemBase = `📌 ${eventoPopulado.titulo}`;
            if (eventoPopulado.descricao) mensagemBase += `\n📝 ${eventoPopulado.descricao}`;
            mensagemBase += `\n📅 Data: ${dataFormatada}${horaFormatada}`;
            if (eventoPopulado.local) mensagemBase += `\n📍 Local: ${eventoPopulado.local}`;

            const idsAlunos = new Set();
            if (eventoPopulado.turmaId && eventoPopulado.turmaId.alunos) {
                eventoPopulado.turmaId.alunos.forEach(a => {
                    if (a && a._id) idsAlunos.add(a._id.toString());
                });
            }

            let enviadas = 0;
            let erros = 0;

            for (const destId of destinatariosFiltrados) {
                try {
                    const isProfessor = destId === professorResponsavel._id.toString();
                    const isAluno = idsAlunos.has(destId);
                    const isRecepcao = recepcaoIds.includes(destId);

                    let titulo, icone, cor, link, prioridade, mensagem;

                    if (isProfessor) {
                        titulo = '📅 Novo Evento Criado para Você';
                        icone = '👤'; cor = '#8b5cf6';
                        link = `/calendario.html?evento=${eventoPopulado._id}&editavel=true`;
                        prioridade = 3;
                        mensagem = `${nomeCriador} (${cargoCriador}) criou um evento em seu nome:\n\n${mensagemBase}`;
                    } else if (isAluno) {
                        titulo = `📅 ${eventoPopulado.titulo} - ${nomeProfessor}`;
                        icone = '🏫'; cor = eventoPopulado.cor || '#10b981';
                        link = `/calendario.html?evento=${eventoPopulado._id}&visualizar=true`;
                        prioridade = 2;
                        mensagem = `👨‍🏫 Professor: ${nomeProfessor}\n\n${mensagemBase}`;
                    } else {
                        titulo = '📅 Novo Evento no Calendário';
                        icone = '📅'; cor = eventoPopulado.cor || '#3b82f6';
                        link = `/calendario.html?evento=${eventoPopulado._id}&visualizar=true`;
                        prioridade = 2;
                        mensagem = `${nomeCriador} (${cargoCriador}) criou um novo evento:\n\n${mensagemBase}`;
                    }

                    await new Notificacao({
                        usuarioId: destId,
                        tipo: 'sistema',
                        titulo,
                        mensagem,
                        icone,
                        cor,
                        link,
                        prioridade,
                        dados: {
                            eventoId: eventoPopulado._id,
                            evento: eventoPopulado.titulo,
                            descricao: eventoPopulado.descricao,
                            tipo: eventoPopulado.tipo,
                            dataEvento: eventoPopulado.dataInicio,
                            horarioInicio: eventoPopulado.horarioInicio,
                            local: eventoPopulado.local,
                            professor: nomeProfessor,
                            criadoPor: nomeCriador,
                            criadoPorCargo: cargoCriador,
                            podeEditar: isProfessor,
                            isRecepcao
                        }
                    }).save();

                    enviadas++;
                } catch (err) {
                    console.error(`[notificarEventoCriado] Erro ao notificar ${destId}:`, err.message);
                    erros++;
                }
            }

            return { success: true, notificacoesEnviadas: enviadas, erros };

        } catch (error) {
            console.error('[notificarEventoCriado] Erro geral:', error);
            return { success: false, error: error.message };
        }
    }

    async forcarNotificacaoEvento(eventoId) {
        try {
            const evento = await Evento.findById(eventoId)
                .populate('usuarioId', 'nome email role')
                .populate('criadoPor', 'nome email role')
                .populate({
                    path: 'turmaId',
                    populate: { path: 'alunos', select: 'nome email' }
                });

            if (!evento) {
                return { success: false, error: 'Evento não encontrado' };
            }

            return await this.notificarEventoCriado(
                evento,
                evento.criadoPor?._id || evento.criadoPor || evento.usuarioId._id,
                'Sistema'
            );

        } catch (error) {
            console.error('[forcarNotificacaoEvento] Erro:', error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = CalendarioNotificacaoService;