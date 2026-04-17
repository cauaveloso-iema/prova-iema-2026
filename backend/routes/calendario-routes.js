// ============================================================================
// CALENDÁRIO ACADÊMICO - BACKEND (VERSÃO COMPLETA E CORRIGIDA)
// Alunos podem VISUALIZAR eventos (somente leitura)
// Professores e Admins podem CRIAR, EDITAR e EXCLUIR
// ============================================================================

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

// Importações dos modelos
const Evento = require('../models/Evento');
const Prova = require('../models/Prova');
const Turma = require('../models/Turma');
const User = require('../models/User');

// Importar serviço de notificações
const CalendarioNotificacaoService = require('../services/calendario-notificacao-service');
const calendarioNotificacaoService = new CalendarioNotificacaoService();

// ============ MIDDLEWARE DE AUTENTICAÇÃO ============
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({
            success: false,
            error: 'Token não fornecido'
        });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({
                success: false,
                error: 'Token inválido ou expirado'
            });
        }
        req.userId = user.id;
        req.userRole = user.role;
        req.userNome = user.nome;
        next();
    });
};

// ============ MIDDLEWARE PARA VERIFICAR PERMISSÃO DE ESCRITA ============
const verificarPermissaoEscrita = (req, res, next) => {
    // Apenas professores e admins podem criar/editar/excluir
    if (req.userRole !== 'admin' && req.userRole !== 'super_admin' && req.userRole !== 'professor') {
        return res.status(403).json({
            success: false,
            error: 'Apenas professores e administradores podem modificar eventos'
        });
    }
    next();
};

// ============ TESTE - ROTA PÚBLICA ============
router.get('/teste', (req, res) => {
    res.json({
        success: true,
        message: 'Rota do calendário funcionando!',
        timestamp: new Date().toISOString()
    });
});

// ============================================
// ROTAS DE LEITURA (TODOS OS USUÁRIOS AUTENTICADOS)
// ============================================

// ============ LISTAR EVENTOS ============
router.get('/eventos', authenticateToken, async (req, res) => {
    try {
        const { 
            mes, 
            ano, 
            tipo, 
            turmaId,
            professorId,
            inicio, 
            fim,
            limit = 100 
        } = req.query;

        let query = {};

        // 🔥 REGRAS DE PERMISSÃO:
        // - Admin/Super Admin: vê TODOS os eventos
        // - Professor: vê APENAS seus próprios eventos
        // - Aluno: vê eventos das suas turmas
        
        if (req.userRole === 'admin' || req.userRole === 'super_admin') {
            // Admin pode ver todos ou filtrar por professor
            if (professorId && professorId !== 'todos' && professorId !== '') {
                query.usuarioId = professorId;
            }
            console.log(`👑 Admin ${req.userId} listando eventos` + (professorId ? ` do professor ${professorId}` : ''));
            
        } else if (req.userRole === 'professor') {
            // Professor vê apenas seus eventos
            query.usuarioId = req.userId;
            console.log(`👨‍🏫 Professor ${req.userId} listando seus eventos`);
            
        } else if (req.userRole === 'aluno') {
            // Aluno vê eventos das suas turmas
            const aluno = await User.findById(req.userId);
            const turmaAluno = aluno?.turma;
            
            if (turmaAluno) {
                // Buscar turma pelo nome
                const turma = await Turma.findOne({ nome: turmaAluno });
                if (turma) {
                    query.turmaId = turma._id;
                }
            }
            
            // Se não encontrar turma, buscar por turmaId em eventos
            if (!query.turmaId) {
                const turmasDoAluno = await Turma.find({ alunos: req.userId });
                const turmaIds = turmasDoAluno.map(t => t._id);
                if (turmaIds.length > 0) {
                    query.turmaId = { $in: turmaIds };
                }
            }
            
            console.log(`👨‍🎓 Aluno ${req.userId} listando eventos da turma:`, query.turmaId);
        }

        // Filtrar por mês/ano
        if (mes && ano) {
            const dataInicio = new Date(ano, mes - 1, 1);
            const dataFim = new Date(ano, mes, 0, 23, 59, 59);
            query.dataInicio = { $gte: dataInicio, $lte: dataFim };
        }

        // Filtrar por período personalizado
        if (inicio && fim) {
            query.dataInicio = {
                $gte: new Date(inicio + 'T00:00:00-03:00'),
                $lte: new Date(fim + 'T23:59:59-03:00')
            };
        }

        // Filtrar por tipo
        if (tipo && tipo !== 'todos') {
            query.tipo = tipo;
        }

        // Filtrar por turma
        if (turmaId && turmaId !== 'todas') {
            query.turmaId = turmaId;
        }

        const eventos = await Evento.find(query)
            .populate('usuarioId', 'nome email')
            .populate('turmaId', 'nome disciplina')
            .populate('provaId', 'titulo')
            .populate('participantes', 'nome email')
            .sort({ dataInicio: 1 })
            .limit(parseInt(limit))
            .lean();

        // Registrar visualizações para monitoramento (apenas admin)
        if (req.userRole === 'admin' || req.userRole === 'super_admin') {
            const eventoIds = eventos.map(e => e._id);
            await Evento.updateMany(
                { _id: { $in: eventoIds } },
                { $push: { 'monitoramento.visualizacoes': { usuarioId: req.userId, visualizadoEm: new Date() } } }
            );
        }

        // Formatar para o frontend, incluindo permissões
        const eventosFormatados = eventos.map(e => ({
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
            turma: e.turmaId ? {
                id: e.turmaId._id,
                nome: e.turmaId.nome
            } : null,
            prova: e.provaId ? {
                id: e.provaId._id,
                titulo: e.provaId.titulo
            } : null,
            criadoPor: e.usuarioId ? {
                id: e.usuarioId._id,
                nome: e.usuarioId.nome,
                email: e.usuarioId.email
            } : null,
            notificacaoAtivada: e.notificacaoAtivada,
            status: e.status,
            notificacoes: e.notificacoes,
            // 🔥 Permissões baseadas no role
            permissoes: {
                podeEditar: req.userRole === 'admin' || req.userRole === 'super_admin' || (req.userRole === 'professor' && req.userId === e.usuarioId?._id?.toString()),
                podeExcluir: req.userRole === 'admin' || req.userRole === 'super_admin' || (req.userRole === 'professor' && req.userId === e.usuarioId?._id?.toString()),
                podeVisualizar: true
            }
        }));

        res.json({
            success: true,
            eventos: eventosFormatados,
            total: eventos.length,
            role: req.userRole,
            usuarioId: req.userId,
            modoLeitura: req.userRole === 'aluno'
        });

    } catch (error) {
        console.error('❌ Erro ao listar eventos:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao listar eventos: ' + error.message
        });
    }
});

// ============ BUSCAR EVENTO POR ID ============
router.get('/eventos/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const evento = await Evento.findById(id)
            .populate('usuarioId', 'nome email')
            .populate('turmaId', 'nome disciplina')
            .populate('provaId', 'titulo')
            .populate('participantes', 'nome email');

        if (!evento) {
            return res.status(404).json({
                success: false,
                error: 'Evento não encontrado'
            });
        }

        // 🔥 Alunos só podem ver eventos da sua turma
        if (req.userRole === 'aluno') {
            const aluno = await User.findById(req.userId);
            const turmaAluno = aluno?.turma;
            
            if (evento.turmaId) {
                const turmaEvento = await Turma.findById(evento.turmaId);
                if (!turmaEvento || turmaEvento.nome !== turmaAluno) {
                    return res.status(403).json({
                        success: false,
                        error: 'Você não tem permissão para ver este evento'
                    });
                }
            }
        }

        // Professores só podem ver seus próprios eventos (ou eventos das suas turmas)
        if (req.userRole === 'professor' && evento.usuarioId._id.toString() !== req.userId) {
            // Verificar se o evento é de uma turma que o professor leciona
            if (evento.turmaId) {
                const turma = await Turma.findById(evento.turmaId);
                if (turma && turma.professorId && turma.professorId.toString() !== req.userId) {
                    return res.status(403).json({
                        success: false,
                        error: 'Você não tem permissão para ver este evento'
                    });
                }
            } else {
                return res.status(403).json({
                    success: false,
                    error: 'Você não tem permissão para ver este evento'
                });
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
                criadoPor: evento.usuarioId,
                createdAt: evento.createdAt
            }
        });

    } catch (error) {
        console.error('❌ Erro ao buscar evento:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao buscar evento: ' + error.message
        });
    }
});

// ============================================
// ROTAS DE ESCRITA (APENAS PROFESSORES E ADMINS)
// ============================================

// ============ CRIAR EVENTO ============
router.post('/eventos', authenticateToken, verificarPermissaoEscrita, async (req, res) => {
    try {
        const {
            titulo,
            descricao,
            tipo,
            dataInicio,
            dataFim,
            horarioInicio,
            horarioFim,
            diaInteiro,
            local,
            turmaId,
            provaId,
            notificacaoAtivada,
            notificacoes,
            repetir,
            repetirAte,
            participantes,
            cor,
            usuarioId
        } = req.body;

        // Validações básicas
        if (!titulo || titulo.trim().length < 3) {
            return res.status(400).json({
                success: false,
                error: 'Título é obrigatório (mínimo 3 caracteres)'
            });
        }

        if (!dataInicio) {
            return res.status(400).json({
                success: false,
                error: 'Data de início é obrigatória'
            });
        }

        // Verificar permissões para turma
        if (turmaId && req.userRole !== 'professor' && req.userRole !== 'admin') {
            const turma = await Turma.findById(turmaId);
            if (!turma || turma.professorId.toString() !== req.userId) {
                return res.status(403).json({
                    success: false,
                    error: 'Você não tem permissão para criar eventos nesta turma'
                });
            }
        }

        // Capturar IP e User Agent para auditoria
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const userAgent = req.headers['user-agent'];

        // Determinar o usuário que será o criador do evento
        let criadorId = req.userId;
        let professorDestinoId = criadorId;
        
        // Se for admin e forneceu um usuarioId, o evento será em nome desse professor
        if ((req.userRole === 'admin' || req.userRole === 'super_admin') && usuarioId) {
            const usuarioExiste = await User.findById(usuarioId);
            if (usuarioExiste) {
                professorDestinoId = usuarioId;
                console.log(`👤 Admin ${req.userNome} (${req.userId}) criando evento em nome do professor ${usuarioExiste.nome} (${usuarioId})`);
            }
        }

        // Criar evento - usando UTC-03:00 (Brasília)
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
            titulo: titulo.trim(),
            descricao: descricao?.trim(),
            tipo: tipo || 'personalizado',
            cor: cor,
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
                    detalhes: { 
                        titulo, 
                        tipo, 
                        dataInicio,
                        criadoPara: professorDestinoId,
                        criadoPor: criadorId
                    }
                }]
            }
        });

        // 🔥 Configurar notificações - APENAS VALORES VÁLIDOS!
        const valoresPermitidos = [0, 5, 15, 30, 60, 120, 1440];
        
        if (notificacoes && Array.isArray(notificacoes)) {
            const notificacoesValidas = notificacoes.filter(n => 
                valoresPermitidos.includes(n.minutosAntes)
            );
            
            if (notificacoesValidas.length > 0) {
                evento.notificacoes = notificacoesValidas.map(n => ({
                    minutosAntes: n.minutosAntes,
                    tipo: n.tipo || 'sistema',
                    enviada: false
                }));
            } else if (notificacaoAtivada) {
                evento.notificacoes = [{
                    minutosAntes: 30,
                    tipo: 'sistema',
                    enviada: false
                }];
            }
        } else if (notificacaoAtivada) {
            evento.notificacoes = [{
                minutosAntes: 30,
                tipo: 'sistema',
                enviada: false
            }];
        }

        await evento.save();

        if (provaId) {
            await Prova.findByIdAndUpdate(provaId, {
                eventoId: evento._id
            });
        }

        // Notificar APENAS o professor (se for admin criando para ele)
        await calendarioNotificacaoService.notificarEventoCriado(
            evento, 
            criadorId,
            req.userNome
        );

        console.log(`📅 Evento criado: ${evento.titulo} para professor ${professorDestinoId} por ${req.userId}`);

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
        res.status(500).json({
            success: false,
            error: 'Erro ao criar evento: ' + error.message
        });
    }
});

// ============ ATUALIZAR EVENTO ============
router.put('/eventos/:id', authenticateToken, verificarPermissaoEscrita, async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        
        console.log(`📝 Tentativa de atualização do evento ${id} pelo usuário ${req.userId}`);

        const evento = await Evento.findById(id);

        if (!evento) {
            return res.status(404).json({
                success: false,
                error: 'Evento não encontrado'
            });
        }

        // Verificar permissão
        if (req.userRole === 'professor' && evento.usuarioId.toString() !== req.userId) {
            return res.status(403).json({
                success: false,
                error: 'Você não tem permissão para editar este evento'
            });
        }

        const camposAlterados = [];
        const valoresPermitidos = [0, 5, 15, 30, 60, 120, 1440];
        
        // Atualizar campos
        if (updates.titulo !== undefined && evento.titulo !== updates.titulo) {
            camposAlterados.push('titulo');
            evento.titulo = updates.titulo.trim();
        }
        
        if (updates.descricao !== undefined && evento.descricao !== updates.descricao) {
            camposAlterados.push('descricao');
            evento.descricao = updates.descricao?.trim() || '';
        }
        
        if (updates.tipo !== undefined && evento.tipo !== updates.tipo) {
            camposAlterados.push('tipo');
            evento.tipo = updates.tipo;
        }
        
        if (updates.cor !== undefined && evento.cor !== updates.cor) {
            camposAlterados.push('cor');
            evento.cor = updates.cor;
        }
        
        if (updates.dataInicio !== undefined) {
            const novaData = updates.horarioInicio 
                ? new Date(`${updates.dataInicio}T${updates.horarioInicio}:00-03:00`)
                : new Date(`${updates.dataInicio}T12:00:00-03:00`);
                
            if (evento.dataInicio.getTime() !== novaData.getTime()) {
                camposAlterados.push('dataInicio');
                evento.dataInicio = novaData;
            }
        }
        
        if (updates.dataFim !== undefined) {
            if (updates.dataFim) {
                const novaData = updates.horarioFim 
                    ? new Date(`${updates.dataFim}T${updates.horarioFim}:00-03:00`)
                    : new Date(`${updates.dataFim}T12:00:00-03:00`);
                    
                if (!evento.dataFim || evento.dataFim.getTime() !== novaData.getTime()) {
                    camposAlterados.push('dataFim');
                    evento.dataFim = novaData;
                }
            } else if (evento.dataFim) {
                camposAlterados.push('dataFim');
                evento.dataFim = null;
            }
        }
        
        if (updates.horarioInicio !== undefined && evento.horarioInicio !== updates.horarioInicio) {
            camposAlterados.push('horarioInicio');
            evento.horarioInicio = updates.horarioInicio;
        }
        
        if (updates.horarioFim !== undefined && evento.horarioFim !== updates.horarioFim) {
            camposAlterados.push('horarioFim');
            evento.horarioFim = updates.horarioFim;
        }
        
        if (updates.diaInteiro !== undefined && evento.diaInteiro !== updates.diaInteiro) {
            camposAlterados.push('diaInteiro');
            evento.diaInteiro = updates.diaInteiro;
        }
        
        if (updates.local !== undefined && evento.local !== updates.local) {
            camposAlterados.push('local');
            evento.local = updates.local?.trim() || '';
        }
        
        if (updates.turmaId !== undefined) {
            const novoTurmaId = updates.turmaId || null;
            if ((evento.turmaId?.toString() || '') !== (novoTurmaId?.toString() || '')) {
                camposAlterados.push('turmaId');
                evento.turmaId = novoTurmaId;
            }
        }
        
        if (updates.notificacaoAtivada !== undefined && evento.notificacaoAtivada !== updates.notificacaoAtivada) {
            camposAlterados.push('notificacaoAtivada');
            evento.notificacaoAtivada = updates.notificacaoAtivada;
        }
        
        // Atualizar notificações
        if (updates.notificacoes !== undefined && Array.isArray(updates.notificacoes)) {
            const notificacoesEnviadas = evento.notificacoes.filter(n => n.enviada === true);
            
            const novasNotificacoes = updates.notificacoes
                .filter(n => valoresPermitidos.includes(n.minutosAntes))
                .map(n => ({
                    minutosAntes: n.minutosAntes,
                    tipo: n.tipo || 'sistema',
                    enviada: false
                }));
            
            if (novasNotificacoes.length > 0) {
                evento.notificacoes = [...notificacoesEnviadas, ...novasNotificacoes];
                camposAlterados.push('notificacoes');
            }
        }

        if (!evento.monitoramento) evento.monitoramento = {};
        if (!evento.monitoramento.edicoes) evento.monitoramento.edicoes = [];
        if (!evento.monitoramento.logs) evento.monitoramento.logs = [];

        if (camposAlterados.length > 0) {
            evento.monitoramento.edicoes.push({
                usuarioId: req.userId,
                editadoEm: new Date(),
                camposAlterados
            });

            evento.monitoramento.logs.push({
                acao: 'editar',
                usuarioId: req.userId,
                timestamp: new Date(),
                detalhes: { campos: camposAlterados }
            });
        }

        evento.atualizadoPor = req.userId;
        evento.updatedAt = new Date();
        
        await evento.save();

        // Notificar o professor sobre a atualização
        if (camposAlterados.length > 0 && evento.usuarioId.toString() !== req.userId) {
            await calendarioNotificacaoService.notificarEventoAtualizado(evento, req.userId, camposAlterados);
        }

        const eventoAtualizado = await Evento.findById(id)
            .populate('usuarioId', 'nome email')
            .populate('turmaId', 'nome disciplina');

        res.json({
            success: true,
            message: 'Evento atualizado com sucesso!',
            evento: {
                id: eventoAtualizado._id,
                titulo: eventoAtualizado.titulo,
                descricao: eventoAtualizado.descricao,
                dataInicio: eventoAtualizado.dataInicio,
                horarioInicio: eventoAtualizado.horarioInicio,
                local: eventoAtualizado.local,
                tipo: eventoAtualizado.tipo,
                notificacoes: eventoAtualizado.notificacoes
            }
        });

    } catch (error) {
        console.error('❌ Erro ao atualizar evento:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao atualizar evento: ' + error.message
        });
    }
});

// ============ EXCLUIR EVENTO ============
router.delete('/eventos/:id', authenticateToken, verificarPermissaoEscrita, async (req, res) => {
    try {
        const { id } = req.params;
        
        const evento = await Evento.findById(id);

        if (!evento) {
            return res.status(404).json({
                success: false,
                error: 'Evento não encontrado'
            });
        }

        if (req.userRole === 'professor' && evento.usuarioId.toString() !== req.userId) {
            return res.status(403).json({
                success: false,
                error: 'Você não tem permissão para excluir este evento'
            });
        }

        console.log(`📝 Evento ${id} excluído por ${req.userId}`);

        await Evento.findByIdAndDelete(id);

        res.status(200).json({
            success: true,
            message: 'Evento excluído com sucesso!'
        });

    } catch (error) {
        console.error('❌ Erro ao excluir evento:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao excluir evento: ' + error.message
        });
    }
});

// ============================================
// ROTAS ADMINISTRATIVAS
// ============================================

// ============ FORÇAR NOTIFICAÇÃO DE UM EVENTO (APENAS ADMIN) ============
router.post('/eventos/:id/forcar-notificacao', authenticateToken, async (req, res) => {
    try {
        if (req.userRole !== 'admin' && req.userRole !== 'super_admin') {
            return res.status(403).json({
                success: false,
                error: 'Apenas administradores podem forçar notificações'
            });
        }
        
        const resultado = await calendarioNotificacaoService.forcarNotificacaoEvento(req.params.id);
        res.json(resultado);
        
    } catch (error) {
        console.error('❌ Erro ao forçar notificação:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ ROTA PARA VERIFICAR NOTIFICAÇÕES ============
router.post('/notificacoes/verificar', async (req, res) => {
    try {
        const resultado = await calendarioNotificacaoService.verificarNotificacoesCalendario();
        res.json(resultado);
    } catch (error) {
        console.error('❌ Erro na rota de verificação:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ IMPORTAR PROVAS PARA O CALENDÁRIO ============
router.post('/importar-provas', authenticateToken, verificarPermissaoEscrita, async (req, res) => {
    try {
        const { turmaId } = req.body;

        if (req.userRole !== 'professor' && req.userRole !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Apenas professores podem importar provas'
            });
        }

        let query = { userId: req.userId };
        if (turmaId) query.turmaId = turmaId;

        const provas = await Prova.find(query)
            .populate('turmaId', 'nome disciplina')
            .where('dataLimite').ne(null);

        let eventosCriados = 0;
        let eventosIgnorados = 0;

        for (const prova of provas) {
            const existe = await Evento.findOne({ provaId: prova._id });

            if (!existe && prova.dataLimite) {
                const dataLimite = new Date(prova.dataLimite);
                const dataStr = dataLimite.toISOString().split('T')[0];
                
                const evento = new Evento({
                    usuarioId: req.userId,
                    titulo: `📝 ${prova.titulo}`,
                    descricao: prova.conteudo || 'Prova agendada',
                    tipo: 'prova',
                    cor: '#ef4444',
                    dataInicio: new Date(`${dataStr}T12:00:00-03:00`),
                    diaInteiro: false,
                    horarioInicio: prova.horarioInicio || '08:00',
                    horarioFim: prova.horarioTermino || '10:00',
                    local: 'Sala de aula',
                    turmaId: prova.turmaId?._id,
                    provaId: prova._id,
                    notificacaoAtivada: true,
                    notificacoes: [
                        { minutosAntes: 1440, tipo: 'sistema' },
                        { minutosAntes: 60, tipo: 'sistema' }
                    ],
                    monitoramento: {
                        logs: [{
                            acao: 'importar_prova',
                            usuarioId: req.userId,
                            timestamp: new Date(),
                            detalhes: { provaId: prova._id, provaTitulo: prova.titulo }
                        }]
                    }
                });
                
                await evento.save();
                eventosCriados++;
            } else {
                eventosIgnorados++;
            }
        }

        res.json({
            success: true,
            message: `${eventosCriados} eventos criados com sucesso!`,
            estatisticas: {
                criados: eventosCriados,
                ignorados: eventosIgnorados,
                total: provas.length
            }
        });

    } catch (error) {
        console.error('❌ Erro ao importar provas:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao importar provas: ' + error.message
        });
    }
});

module.exports = router;