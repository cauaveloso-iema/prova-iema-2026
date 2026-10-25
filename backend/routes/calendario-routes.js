// ============================================================================
// CALENDÁRIO ACADÊMICO - BACKEND (VERSÃO FINAL CORRIGIDA)
// ============================================================================

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

const Evento = require('../models/Evento');
const Prova = require('../models/Prova');
const Turma = require('../models/Turma');
const User = require('../models/User');
const PermissaoModulo = require('../models/PermissaoModulo');

const CalendarioNotificacaoService = require('../services/calendario-notificacao-service');
const calendarioNotificacaoService = new CalendarioNotificacaoService();

const SETORES_ADM_EXTRA = [
    'supervisao', 'coordenacao_patio', 'secretaria', 'recepcao',
    'enfermaria', 'cozinha', 'assistente-social', 'psicologia',
    'protagonismo', 'biblioteca','gestao-adm'
];

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, error: 'Token não fornecido' });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ success: false, error: 'Token inválido ou expirado' });
        req.userId = user.id;
        req.userRole = user.role;
        req.userNome = user.nome;
        next();
    });
};

const verificarPermissaoCriacao = async (req, res, next) => {
    try {
        const role = req.userRole;
        if (role === 'admin' || role === 'super_admin' || role === 'professor') return next();

        const user = await User.findById(req.userId).select('email');
        if (!user || !user.email) return res.status(403).json({ success: false, error: 'Email não encontrado' });

        const permissao = await PermissaoModulo.findOne({
            modulo: 'calendario_setor_pedagogico', ativo: true
        });
        if (!permissao) return res.status(403).json({ success: false, error: 'Módulo não configurado' });

        const emails = (permissao.emailsAutorizados || []).map(e => e.trim().toLowerCase());
        const emailUser = user.email.trim().toLowerCase();
        if (emails.includes(emailUser)) return next();

        return res.status(403).json({ success: false, error: 'Sem permissão para criar eventos' });
    } catch (error) {
        console.error('[verificarPermissaoCriacao] Erro:', error);
        return res.status(500).json({ success: false, error: 'Erro interno' });
    }
};

// ============================================================================
// Resolve setorDestino (role) → primeiro usuário ATIVO daquele setor
// ============================================================================
async function resolverUsuarioDoSetor(roleSetor) {
    if (!roleSetor || typeof roleSetor !== 'string') return null;

    const usuarioDoSetor = await User.findOne({
        role: roleSetor,
        ativo: { $ne: false }
    }).select('_id nome role');

    return usuarioDoSetor || null;
}

router.get('/teste', (req, res) => res.json({ success: true, message: 'OK', timestamp: new Date() }));

// ============================================================================
// LISTAR EVENTOS
// ============================================================================
router.get('/eventos', authenticateToken, async (req, res) => {
    try {
        const { mes, ano, tipo, turmaId, professorId, inicio, fim, limit = 100 } = req.query;
        let query = {};

        if (req.userRole === 'aluno') {
            const aluno = await User.findById(req.userId);
            const turmaAluno = aluno?.turma;
            let turmaIds = [];
            if (turmaAluno) {
                const t = await Turma.findOne({ nome: turmaAluno });
                if (t) turmaIds.push(t._id);
            }
            if (turmaIds.length === 0) {
                const ts = await Turma.find({ alunos: req.userId });
                turmaIds = ts.map(t => t._id);
            }
            if (turmaIds.length === 0) {
                return res.json({
                    success: true, eventos: [], total: 0,
                    role: req.userRole, usuarioId: req.userId, modoLeitura: true
                });
            }
            query.turmaId = { $in: turmaIds };
        }
        else if (req.userRole === 'professor') {
            const us = await User.find({
                role: { $in: ['admin', 'super_admin', 'setor_pedagogico'] }
            }).select('_id');
            const ids = us.map(u => u._id);
            ids.push(req.userId);
            query.usuarioId = { $in: ids };
        }
        else if (req.userRole === 'setor_pedagogico') {
            const us = await User.find({
                role: { $in: ['admin', 'super_admin', 'gestao_geral', 'setor_pedagogico'] }
            }).select('_id');
            const ids = us.map(u => u._id);
            ids.push(req.userId);
            query.usuarioId = { $in: ids };
        }
        else if (req.userRole === 'gestao_geral') {
            const us = await User.find({
                role: { $in: ['admin', 'super_admin', 'setor_pedagogico'] }
            }).select('_id');
            const ids = us.map(u => u._id);
            ids.push(req.userId);
            query.usuarioId = { $in: ids };
        }
        else if (SETORES_ADM_EXTRA.includes(req.userRole)) {
            const us = await User.find({
                role: { $in: ['admin', 'super_admin', 'gestao_geral'] }
            }).select('_id');
            const ids = us.map(u => u._id);
            ids.push(req.userId);
            query.usuarioId = { $in: ids };
        }
        else if (req.userRole === 'admin' || req.userRole === 'super_admin') {
            if (professorId && professorId !== 'todos' && professorId !== '') {
                query.usuarioId = professorId;
            }
        }

        if (mes && ano) {
            const di = new Date(ano, mes - 1, 1);
            const df = new Date(ano, mes, 0, 23, 59, 59);
            query.dataInicio = { $gte: di, $lte: df };
        }
        if (inicio && fim) {
            query.dataInicio = {
                $gte: new Date(inicio + 'T00:00:00-03:00'),
                $lte: new Date(fim + 'T23:59:59-03:00')
            };
        }
        if (tipo && tipo !== 'todos') query.tipo = tipo;

        if (turmaId && turmaId !== 'todas') {
            if (req.userRole === 'aluno') {
                const permitidas = query.turmaId.$in.map(id => id.toString());
                if (permitidas.includes(turmaId.toString())) query.turmaId = turmaId;
            } else {
                query.turmaId = turmaId;
            }
        }

        const eventos = await Evento.find(query)
            .populate('usuarioId', 'nome email role')
            .populate('criadoPor', 'nome email role')
            .populate('turmaId', 'nome disciplina')
            .populate('provaId', 'titulo')
            .sort({ dataInicio: 1 })
            .limit(parseInt(limit))
            .lean();

        if (['admin', 'super_admin', 'setor_pedagogico'].includes(req.userRole) && eventos.length > 0) {
            const ids = eventos.map(e => e._id);
            await Evento.updateMany(
                { _id: { $in: ids } },
                { $push: { 'monitoramento.visualizacoes': { usuarioId: req.userId, visualizadoEm: new Date() } } }
            );
        }

        const formatados = eventos.map(e => {
            const isAdmin = ['admin', 'super_admin'].includes(req.userRole);
            const isCriador = (
                (e.criadoPor && e.criadoPor._id && e.criadoPor._id.toString() === req.userId) ||
                (e.usuarioId && e.usuarioId._id && e.usuarioId._id.toString() === req.userId)
            );
            const podeEditar = isAdmin || isCriador;
            const criador = e.criadoPor || e.usuarioId;

            return {
                id: e._id,
                title: e.titulo,
                start: e.dataInicio,
                end: e.dataFim || e.dataInicio,
                allDay: e.diaInteiro,
                tipo: e.tipo,
                cor: e.cor,
                descricao: e.descricao,
                local: e.local,
                horarioInicio: e.horarioInicio,
                horarioFim: e.horarioFim,
                turma: e.turmaId ? { id: e.turmaId._id, nome: e.turmaId.nome } : null,
                prova: e.provaId ? { id: e.provaId._id, titulo: e.provaId.titulo } : null,
                criadoPor: criador ? {
                    id: criador._id,
                    nome: criador.nome,
                    email: criador.email,
                    role: criador.role
                } : null,
                // 🔥 NOVO: destinatário real
                usuarioId: e.usuarioId ? {
                    id: e.usuarioId._id,
                    nome: e.usuarioId.nome,
                    email: e.usuarioId.email,
                    role: e.usuarioId.role
                } : null,
                notificacaoAtivada: e.notificacaoAtivada,
                status: e.status,
                notificacoes: e.notificacoes,
                permissoes: {
                    podeEditar,
                    podeExcluir: podeEditar,
                    podeVisualizar: true
                }
            };
        });

        res.json({
            success: true,
            eventos: formatados,
            total: eventos.length,
            role: req.userRole,
            usuarioId: req.userId,
            modoLeitura: req.userRole === 'aluno'
        });
    } catch (error) {
        console.error('❌ Erro ao listar eventos:', error);
        res.status(500).json({ success: false, error: 'Erro ao listar eventos: ' + error.message });
    }
});

// ============================================================================
// BUSCAR POR ID
// ============================================================================
router.get('/eventos/:id', authenticateToken, async (req, res) => {
    try {
        const evento = await Evento.findById(req.params.id)
            .populate('usuarioId', 'nome email role')
            .populate('criadoPor', 'nome email role')
            .populate('turmaId', 'nome disciplina')
            .populate('provaId', 'titulo')
            .populate('participantes', 'nome email');

        if (!evento) return res.status(404).json({ success: false, error: 'Evento não encontrado' });

        if (req.userRole === 'aluno') {
            if (!evento.turmaId) return res.status(403).json({ success: false, error: 'Sem permissão' });
            const aluno = await User.findById(req.userId);
            const turmaEvento = await Turma.findById(evento.turmaId);
            if (!turmaEvento || turmaEvento.nome !== aluno?.turma) {
                return res.status(403).json({ success: false, error: 'Sem permissão' });
            }
        }
        if (req.userRole === 'professor') {
            const role = evento.usuarioId?.role;
            const isProprio = evento.usuarioId._id.toString() === req.userId ||
                              (evento.criadoPor && evento.criadoPor._id.toString() === req.userId);
            if (!['admin', 'super_admin', 'setor_pedagogico'].includes(role) && !isProprio) {
                return res.status(403).json({ success: false, error: 'Sem permissão' });
            }
        }
        if (req.userRole === 'setor_pedagogico') {
            const role = evento.usuarioId?.role;
            const isProprio = evento.usuarioId._id.toString() === req.userId ||
                              (evento.criadoPor && evento.criadoPor._id.toString() === req.userId);
            if (!['admin', 'super_admin', 'setor_pedagogico', 'gestao_geral'].includes(role) && !isProprio) {
                return res.status(403).json({ success: false, error: 'Sem permissão' });
            }
        }
        if (req.userRole === 'gestao_geral') {
            const role = evento.usuarioId?.role;
            const isProprio = evento.usuarioId._id.toString() === req.userId ||
                              (evento.criadoPor && evento.criadoPor._id.toString() === req.userId);
            if (!['admin', 'super_admin', 'setor_pedagogico'].includes(role) && !isProprio) {
                return res.status(403).json({ success: false, error: 'Sem permissão' });
            }
        }
        if (SETORES_ADM_EXTRA.includes(req.userRole)) {
            const role = evento.usuarioId?.role;
            const isProprio = evento.usuarioId._id.toString() === req.userId ||
                              (evento.criadoPor && evento.criadoPor._id.toString() === req.userId);
            if (!['admin', 'super_admin', 'gestao_geral'].includes(role) && !isProprio) {
                return res.status(403).json({ success: false, error: 'Sem permissão' });
            }
        }

        res.json({
            success: true,
            evento: {
                id: evento._id,
                titulo: evento.titulo,
                descricao: evento.descricao,
                tipo: evento.tipo,
                cor: evento.cor,
                dataInicio: evento.dataInicio,
                dataFim: evento.dataFim,
                horarioInicio: evento.horarioInicio,
                horarioFim: evento.horarioFim,
                diaInteiro: evento.diaInteiro,
                local: evento.local,
                turma: evento.turmaId,
                prova: evento.provaId,
                notificacaoAtivada: evento.notificacaoAtivada,
                notificacoes: evento.notificacoes,
                repetir: evento.repetir,
                repetirAte: evento.repetirAte,
                participantes: evento.participantes,
                status: evento.status,

                // 🔥 Criador e destinatário SEPARADOS
                criadoPor: evento.criadoPor ? {
                    id: evento.criadoPor._id,
                    nome: evento.criadoPor.nome,
                    email: evento.criadoPor.email,
                    role: evento.criadoPor.role
                } : null,
                usuarioId: evento.usuarioId ? {
                    id: evento.usuarioId._id,
                    nome: evento.usuarioId.nome,
                    email: evento.usuarioId.email,
                    role: evento.usuarioId.role
                } : null,

                createdAt: evento.createdAt
            }
        });
    } catch (error) {
        console.error('❌ Erro ao buscar evento:', error);
        res.status(500).json({ success: false, error: 'Erro: ' + error.message });
    }
});

// ============================================================================
// CRIAR
// ============================================================================
router.post('/eventos', authenticateToken, verificarPermissaoCriacao, async (req, res) => {
    try {
        const {
            titulo, descricao, tipo, dataInicio, dataFim,
            horarioInicio, horarioFim, diaInteiro, local, turmaId,
            provaId, notificacaoAtivada, notificacoes, repetir,
            repetirAte, participantes, cor, usuarioId
        } = req.body;

        if (!titulo || titulo.trim().length < 3) {
            return res.status(400).json({ success: false, error: 'Título obrigatório (mín. 3)' });
        }
        if (!dataInicio) {
            return res.status(400).json({ success: false, error: 'Data obrigatória' });
        }

        if (turmaId && !['professor', 'admin', 'super_admin', 'setor_pedagogico'].includes(req.userRole)) {
            const turma = await Turma.findById(turmaId);
            if (!turma || turma.professorId?.toString() !== req.userId) {
                return res.status(403).json({ success: false, error: 'Sem permissão para esta turma' });
            }
        }

        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const userAgent = req.headers['user-agent'];

        let criadorId = req.userId;
        let professorDestinoId = criadorId;

        // 🔥 Resolve setorDestino → primeiro usuário ativo do setor
        if ((req.userRole === 'admin' || req.userRole === 'super_admin') && req.body.setorDestino) {
            const usuarioDoSetor = await resolverUsuarioDoSetor(req.body.setorDestino);

            if (!usuarioDoSetor) {
                return res.status(400).json({
                    success: false,
                    error: `Nenhum usuário ativo encontrado no setor "${req.body.setorDestino}"`
                });
            }

            professorDestinoId = usuarioDoSetor._id.toString();
        }
        // Admin pode criar em nome de outro usuário via usuarioId direto
        else if ((req.userRole === 'admin' || req.userRole === 'super_admin') && usuarioId) {
            const usuarioExiste = await User.findById(usuarioId);
            if (usuarioExiste) professorDestinoId = usuarioId;
        }

        let dataInicioObj;
        let dataFimObj = null;

        if (horarioInicio && !diaInteiro) {
            dataInicioObj = new Date(`${dataInicio}T${horarioInicio}:00-03:00`);
        } else {
            dataInicioObj = new Date(`${dataInicio}T12:00:00-03:00`);
        }

        if (dataFim) {
            if (horarioFim && !diaInteiro) {
                dataFimObj = new Date(`${dataFim}T${horarioFim}:00-03:00`);
            } else {
                dataFimObj = new Date(`${dataFim}T12:00:00-03:00`);
            }
        }

        const evento = new Evento({
            usuarioId: professorDestinoId,
            criadoPor: criadorId,
            titulo: titulo.trim(),
            descricao: descricao?.trim(),
            tipo: tipo || 'personalizado',
            cor,
            dataInicio: dataInicioObj,
            dataFim: dataFimObj,
            horarioInicio: diaInteiro ? null : horarioInicio,
            horarioFim: diaInteiro ? null : horarioFim,
            diaInteiro: diaInteiro || false,
            local: local?.trim(),
            turmaId,
            provaId,
            notificacaoAtivada: notificacaoAtivada !== false,
            repetir: repetir || 'nao',
            repetirAte: repetirAte ? new Date(`${repetirAte}T12:00:00-03:00`) : null,
            participantes: participantes || [],
            monitoramento: {
                ipCriacao: ip,
                userAgentCriacao: userAgent,
                logs: [{
                    acao: 'criar',
                    usuarioId: criadorId,
                    detalhes: { titulo, tipo, dataInicio, criadoPara: professorDestinoId, criadoPor: criadorId }
                }]
            }
        });

        const valoresPermitidos = [0, 5, 15, 30, 60, 120, 1440];

        if (notificacoes && Array.isArray(notificacoes)) {
            const validas = notificacoes.filter(n => valoresPermitidos.includes(n.minutosAntes));
            if (validas.length > 0) {
                evento.notificacoes = validas.map(n => ({
                    minutosAntes: n.minutosAntes,
                    tipo: n.tipo || 'sistema',
                    enviada: false
                }));
            } else if (notificacaoAtivada) {
                evento.notificacoes = [{ minutosAntes: 30, tipo: 'sistema', enviada: false }];
            }
        } else if (notificacaoAtivada) {
            evento.notificacoes = [{ minutosAntes: 30, tipo: 'sistema', enviada: false }];
        }

        await evento.save();

        if (provaId) {
            await Prova.findByIdAndUpdate(provaId, { eventoId: evento._id });
        }

        const eventoPopulado = await Evento.findById(evento._id)
            .populate('usuarioId', 'nome email role')
            .populate('criadoPor', 'nome email role')
            .populate({
                path: 'turmaId',
                populate: { path: 'alunos', select: 'nome email' }
            });

        await calendarioNotificacaoService.notificarEventoCriado(
            eventoPopulado,
            criadorId,
            req.userNome
        );

        res.status(201).json({
            success: true,
            message: 'Evento criado com sucesso!',
            evento: {
                id: evento._id,
                titulo: evento.titulo,
                descricao: evento.descricao,
                dataInicio: evento.dataInicio,
                horarioInicio: evento.horarioInicio,
                local: evento.local,
                tipo: evento.tipo,
                notificacoes: evento.notificacoes,
                criadoPara: professorDestinoId,
                criadoPor: criadorId
            }
        });
    } catch (error) {
        console.error('❌ Erro ao criar evento:', error);
        res.status(500).json({ success: false, error: 'Erro ao criar evento: ' + error.message });
    }
});

// ============================================================================
// ATUALIZAR
// ============================================================================
router.put('/eventos/:id', authenticateToken, verificarPermissaoCriacao, async (req, res) => {
    try {
        const evento = await Evento.findById(req.params.id);
        if (!evento) return res.status(404).json({ success: false, error: 'Evento não encontrado' });

        const isAdmin = req.userRole === 'admin' || req.userRole === 'super_admin';
        const isCriador = (evento.criadoPor && evento.criadoPor.toString() === req.userId) ||
                          evento.usuarioId.toString() === req.userId;

        if (!isAdmin && !isCriador) {
            return res.status(403).json({ success: false, error: 'Sem permissão' });
        }

        const updates = req.body;
        const camposAlterados = [];
        const valoresPermitidos = [0, 5, 15, 30, 60, 120, 1440];

        if (updates.titulo !== undefined && evento.titulo !== updates.titulo) {
            camposAlterados.push('titulo'); evento.titulo = updates.titulo.trim();
        }
        if (updates.descricao !== undefined && evento.descricao !== updates.descricao) {
            camposAlterados.push('descricao'); evento.descricao = updates.descricao?.trim() || '';
        }
        if (updates.tipo !== undefined && evento.tipo !== updates.tipo) {
            camposAlterados.push('tipo'); evento.tipo = updates.tipo;
        }
        if (updates.cor !== undefined && evento.cor !== updates.cor) {
            camposAlterados.push('cor'); evento.cor = updates.cor;
        }
        if (updates.dataInicio !== undefined) {
            const novaData = updates.horarioInicio
                ? new Date(`${updates.dataInicio}T${updates.horarioInicio}:00-03:00`)
                : new Date(`${updates.dataInicio}T12:00:00-03:00`);
            if (evento.dataInicio.getTime() !== novaData.getTime()) {
                camposAlterados.push('dataInicio'); evento.dataInicio = novaData;
            }
        }
        if (updates.dataFim !== undefined) {
            if (updates.dataFim) {
                const novaData = updates.horarioFim
                    ? new Date(`${updates.dataFim}T${updates.horarioFim}:00-03:00`)
                    : new Date(`${updates.dataFim}T12:00:00-03:00`);
                if (!evento.dataFim || evento.dataFim.getTime() !== novaData.getTime()) {
                    camposAlterados.push('dataFim'); evento.dataFim = novaData;
                }
            } else if (evento.dataFim) {
                camposAlterados.push('dataFim'); evento.dataFim = null;
            }
        }
        if (updates.horarioInicio !== undefined && evento.horarioInicio !== updates.horarioInicio) {
            camposAlterados.push('horarioInicio'); evento.horarioInicio = updates.horarioInicio;
        }
        if (updates.horarioFim !== undefined && evento.horarioFim !== updates.horarioFim) {
            camposAlterados.push('horarioFim'); evento.horarioFim = updates.horarioFim;
        }
        if (updates.diaInteiro !== undefined && evento.diaInteiro !== updates.diaInteiro) {
            camposAlterados.push('diaInteiro'); evento.diaInteiro = updates.diaInteiro;
        }
        if (updates.local !== undefined && evento.local !== updates.local) {
            camposAlterados.push('local'); evento.local = updates.local?.trim() || '';
        }
        if (updates.turmaId !== undefined) {
            const novo = updates.turmaId || null;
            if ((evento.turmaId?.toString() || '') !== (novo?.toString() || '')) {
                camposAlterados.push('turmaId'); evento.turmaId = novo;
            }
        }
        if (updates.notificacaoAtivada !== undefined && evento.notificacaoAtivada !== updates.notificacaoAtivada) {
            camposAlterados.push('notificacaoAtivada'); evento.notificacaoAtivada = updates.notificacaoAtivada;
        }
        if (updates.notificacoes !== undefined && Array.isArray(updates.notificacoes)) {
            const enviadas = evento.notificacoes.filter(n => n.enviada === true);
            const novas = updates.notificacoes
                .filter(n => valoresPermitidos.includes(n.minutosAntes))
                .map(n => ({ minutosAntes: n.minutosAntes, tipo: n.tipo || 'sistema', enviada: false }));
            if (novas.length > 0) {
                evento.notificacoes = [...enviadas, ...novas];
                camposAlterados.push('notificacoes');
            }
        }

        // 🔥 Resolve setorDestino no PUT
        if (isAdmin && updates.setorDestino) {
            const usuarioDoSetor = await resolverUsuarioDoSetor(updates.setorDestino);
            if (usuarioDoSetor && usuarioDoSetor._id.toString() !== evento.usuarioId.toString()) {
                camposAlterados.push('usuarioId');
                evento.usuarioId = usuarioDoSetor._id;
            }
        }

        if (!evento.monitoramento) evento.monitoramento = {};
        if (!evento.monitoramento.edicoes) evento.monitoramento.edicoes = [];
        if (!evento.monitoramento.logs) evento.monitoramento.logs = [];

        if (camposAlterados.length > 0) {
            evento.monitoramento.edicoes.push({ usuarioId: req.userId, editadoEm: new Date(), camposAlterados });
            evento.monitoramento.logs.push({
                acao: 'editar', usuarioId: req.userId,
                timestamp: new Date(), detalhes: { campos: camposAlterados }
            });
        }

        evento.atualizadoPor = req.userId;
        evento.updatedAt = new Date();
        await evento.save();

        if (camposAlterados.length > 0 && evento.usuarioId.toString() !== req.userId) {
            const eventoPopulado = await Evento.findById(evento._id)
                .populate('usuarioId', 'nome email role')
                .populate('criadoPor', 'nome email role')
                .populate({
                    path: 'turmaId',
                    populate: { path: 'alunos', select: 'nome email' }
                });

            await calendarioNotificacaoService.notificarEventoAtualizado(
                eventoPopulado, req.userId, camposAlterados
            );
        }

        const atualizado = await Evento.findById(req.params.id)
            .populate('usuarioId', 'nome email role')
            .populate('criadoPor', 'nome email role')
            .populate('turmaId', 'nome disciplina');

        res.json({
            success: true,
            message: 'Evento atualizado com sucesso!',
            evento: {
                id: atualizado._id,
                titulo: atualizado.titulo,
                descricao: atualizado.descricao,
                dataInicio: atualizado.dataInicio,
                horarioInicio: atualizado.horarioInicio,
                local: atualizado.local,
                tipo: atualizado.tipo,
                notificacoes: atualizado.notificacoes,
                criadoPor: atualizado.criadoPor ? {
                    id: atualizado.criadoPor._id,
                    nome: atualizado.criadoPor.nome,
                    role: atualizado.criadoPor.role
                } : null,
                usuarioId: atualizado.usuarioId ? {
                    id: atualizado.usuarioId._id,
                    nome: atualizado.usuarioId.nome,
                    role: atualizado.usuarioId.role
                } : null
            }
        });
    } catch (error) {
        console.error('❌ Erro ao atualizar evento:', error);
        res.status(500).json({ success: false, error: 'Erro: ' + error.message });
    }
});

// ============================================================================
// EXCLUIR
// ============================================================================
router.delete('/eventos/:id', authenticateToken, verificarPermissaoCriacao, async (req, res) => {
    try {
        const evento = await Evento.findById(req.params.id);
        if (!evento) return res.status(404).json({ success: false, error: 'Evento não encontrado' });

        const isAdmin = req.userRole === 'admin' || req.userRole === 'super_admin';
        const isCriador = (evento.criadoPor && evento.criadoPor.toString() === req.userId) ||
                          evento.usuarioId.toString() === req.userId;

        if (!isAdmin && !isCriador) {
            return res.status(403).json({ success: false, error: 'Sem permissão' });
        }

        await Evento.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Evento excluído com sucesso!' });
    } catch (error) {
        console.error('❌ Erro ao excluir evento:', error);
        res.status(500).json({ success: false, error: 'Erro: ' + error.message });
    }
});

// ============================================================================
// FORÇAR NOTIFICAÇÃO
// ============================================================================
router.post('/eventos/:id/forcar-notificacao', authenticateToken, async (req, res) => {
    try {
        if (!['admin', 'super_admin'].includes(req.userRole)) {
            return res.status(403).json({ success: false, error: 'Apenas administradores' });
        }
        const r = await calendarioNotificacaoService.forcarNotificacaoEvento(req.params.id);
        res.json(r);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// VERIFICAR NOTIFICAÇÕES (CRON)
// ============================================================================
router.post('/notificacoes/verificar', async (req, res) => {
    try {
        const r = await calendarioNotificacaoService.verificarNotificacoesCalendario();
        res.json(r);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// IMPORTAR PROVAS
// ============================================================================
router.post('/importar-provas', authenticateToken, verificarPermissaoCriacao, async (req, res) => {
    try {
        if (!['professor', 'admin', 'super_admin', 'setor_pedagogico'].includes(req.userRole)) {
            return res.status(403).json({ success: false, error: 'Sem permissão' });
        }
        const { turmaId } = req.body;
        const query = { userId: req.userId };
        if (turmaId) query.turmaId = turmaId;

        const provas = await Prova.find(query).populate('turmaId', 'nome disciplina').where('dataLimite').ne(null);
        let criados = 0, ignorados = 0;

        for (const prova of provas) {
            const existe = await Evento.findOne({ provaId: prova._id });
            if (!existe && prova.dataLimite) {
                const dataStr = new Date(prova.dataLimite).toISOString().split('T')[0];
                const evento = new Evento({
                    usuarioId: req.userId, criadoPor: req.userId,
                    titulo: `📝 ${prova.titulo}`,
                    descricao: prova.conteudo || 'Prova agendada',
                    tipo: 'prova', cor: '#ef4444',
                    dataInicio: new Date(`${dataStr}T12:00:00-03:00`),
                    diaInteiro: false,
                    horarioInicio: prova.horarioInicio || '08:00',
                    horarioFim: prova.horarioTermino || '10:00',
                    local: 'Sala de aula',
                    turmaId: prova.turmaId?._id, provaId: prova._id,
                    notificacaoAtivada: true,
                    notificacoes: [
                        { minutosAntes: 1440, tipo: 'sistema' },
                        { minutosAntes: 60, tipo: 'sistema' }
                    ],
                    monitoramento: {
                        logs: [{ acao: 'importar_prova', usuarioId: req.userId, timestamp: new Date(), detalhes: { provaId: prova._id } }]
                    }
                });
                await evento.save();
                criados++;
            } else {
                ignorados++;
            }
        }
        res.json({ success: true, message: `${criados} eventos criados`, estatisticas: { criados, ignorados, total: provas.length } });
    } catch (error) {
        console.error('❌ Erro ao importar provas:', error);
        res.status(500).json({ success: false, error: 'Erro: ' + error.message });
    }
});

module.exports = router;