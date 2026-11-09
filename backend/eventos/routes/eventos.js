// ============================================================================
// backend/eventos/routes/eventos.js
// Base: /api/eventos/eventos
// ============================================================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

let logger = console;
try { logger = require('../../../utils/logger'); } catch (_) {}

const Evento = require('../models/Evento');
const ModeloEvento = require('../models/ModeloEvento');
const Inscricao = require('../models/Inscricao');
const Avaliador = require('../models/Avaliador');
const Avaliacao = require('../models/Avaliacao');
const EventoConfigAvaliacao = require('../models/EventoConfigAvaliacao');
const { authenticateToken, isSuperAdmin, authenticateAvaliador, isCoordenadorEvento } = require('../middlewares/auth-eventos');

function gerarSlug(texto) {
    return String(texto)
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
}

async function gerarSlugUnico(titulo, idAtual = null) {
    const base = gerarSlug(titulo) || 'evento';
    let slug = base;
    let i = 1;
    while (await Evento.findOne({ slug, ...(idAtual ? { _id: { $ne: idAtual } } : {}) })) {
        slug = `${base}-${i}`;
        i++;
    }
    return slug;
}

async function resolverCoordenadores(emails) {
    if (!emails || !Array.isArray(emails)) return [];
    const ids = [];
    for (const email of emails) {
        if (!email) continue;
        const av = await Avaliador.findOne({ email: String(email).trim().toLowerCase() });
        if (av) ids.push(av._id);
    }
    return ids;
}

// ============================================================================
// 🔥 NOVO: cria a EventoConfigAvaliacao herdando do modelo
// ============================================================================
async function criarConfigAvaliacaoSeNecessario(evento, modelo) {
    try {
        if (!modelo) return;
        const anexoAv = (modelo.anexos || []).find(a => a.isAvaliativo);
        if (!anexoAv) return;

        const existe = await EventoConfigAvaliacao.findOne({ eventoId: evento._id });
        if (existe) return;

        await EventoConfigAvaliacao.create({
            eventoId: evento._id,
            numAvaliadores: Math.max(1, parseInt(anexoAv.numAvaliadores) || 1),
            modoDistribuicao: ['aleatorio', 'manual'].includes(anexoAv.modoDistribuicao)
                ? anexoAv.modoDistribuicao
                : 'aleatorio',
            calcularMedia: anexoAv.calcularMedia !== false,
            tipoMedia: anexoAv.tipoMedia || 'aritmetica',
            exigeAssinaturaAvaliador: anexoAv.exigeAssinaturaAvaliador === true
        });
        logger.info(`⚙️ [EVENTOS] Config de avaliação criada para evento ${evento._id}`);
    } catch (err) {
        logger.warn('⚠️ [EVENTOS] Falha ao criar EventoConfigAvaliacao:', err.message);
    }
}

// ---- GET /dashboard ----
router.get('/dashboard', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const [totalModelos, totalEventos, publicados, rascunhos, encerrados, totalInscricoes, ultimosEventos] = await Promise.all([
            ModeloEvento.countDocuments({ ativo: true }),
            Evento.countDocuments(),
            Evento.countDocuments({ status: 'Publicado' }),
            Evento.countDocuments({ status: 'Rascunho' }),
            Evento.countDocuments({ status: 'Encerrado' }),
            Inscricao.countDocuments(),
            Evento.find().sort({ createdAt: -1 }).limit(5).populate('modeloId', 'nomeModelo').lean()
        ]);
        res.json({
            success: true,
            resumo: { totalModelos, totalEventos, publicados, rascunhos, encerrados, totalInscricoes },
            ultimosEventos
        });
    } catch (error) {
        logger.error('❌ [EVENTOS] Erro no dashboard:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ---- GET / (Admin) ----
router.get('/', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const filtro = {};
        if (req.query.status) filtro.status = req.query.status;
        const eventos = await Evento.find(filtro)
            .sort({ createdAt: -1 })
            .populate('modeloId', 'nomeModelo')
            .populate('criadoPor', 'nome email')
            .populate('coordenadores', 'nomeCompleto email');
        res.json({ success: true, eventos });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ---- GET /coordenador-meus ----
router.get('/coordenador-meus', authenticateAvaliador, async (req, res) => {
    try {
        let filtro = {};
        if (!req.avaliador.isCoordenador) {
            filtro = { $or: [{ criadoPor: req.avaliadorId }, { coordenadores: req.avaliadorId }] };
        }
        const eventos = await Evento.find(filtro).sort({ createdAt: -1 }).populate('modeloId', 'nomeModelo');
        res.json({ success: true, eventos });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// 👥 GESTÃO DE USUÁRIOS (Avaliadores / Coordenadores) — ADMIN
// ATENÇÃO: rotas /admin/* ANTES da rota /:id para não colidir
// ============================================================================

// ---- GET /admin/usuarios ----
router.get('/admin/usuarios', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { busca, status, tipo } = req.query;
        const filtro = {};

        if (busca && String(busca).trim()) {
            const termo = String(busca).trim();
            const regex = new RegExp(termo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            filtro.$or = [{ nomeCompleto: regex }, { email: regex }];
        }

        if (status && ['Pendente', 'Ativo', 'Inativo', 'Bloqueado'].includes(status)) {
            filtro.status = status;
        }

        if (tipo === 'coordenador') filtro.isCoordenador = true;
        if (tipo === 'avaliador') filtro.isCoordenador = { $ne: true };

        const usuarios = await Avaliador.find(filtro)
            .select('-senha -__v')
            .sort({ createdAt: -1 })
            .populate('eventos', 'titulo slug status')
            .lean();

        const [total, pendentes, ativos, coordenadores] = await Promise.all([
            Avaliador.countDocuments(),
            Avaliador.countDocuments({ status: 'Pendente' }),
            Avaliador.countDocuments({ status: 'Ativo' }),
            Avaliador.countDocuments({ isCoordenador: true })
        ]);

        res.json({
            success: true,
            usuarios,
            totalFiltrado: usuarios.length,
            estatisticas: { total, pendentes, ativos, coordenadores }
        });
    } catch (error) {
        logger.error('❌ [USUARIOS] Erro ao listar:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ---- GET /admin/usuarios/:id ----
router.get('/admin/usuarios/:id', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, error: 'ID inválido' });
        }

        const usuario = await Avaliador.findById(req.params.id)
            .select('-senha -__v')
            .populate('eventos', 'titulo slug status dataInicioInscricao dataFimInscricao')
            .lean();

        if (!usuario) {
            return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
        }

        const [totalAvaliacoes, totalAtribuicoesPendentes] = await Promise.all([
            Avaliacao.countDocuments({ avaliadorId: usuario._id }),
            Avaliacao.countDocuments({ avaliadorId: usuario._id, status: 'Pendente' })
        ]);

        res.json({
            success: true,
            usuario: {
                ...usuario,
                estatisticas: {
                    totalAvaliacoes,
                    totalAtribuicoesPendentes,
                    totalEventos: (usuario.eventos || []).length
                }
            }
        });
    } catch (error) {
        logger.error('❌ [USUARIOS] Erro ao buscar:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ---- PUT /admin/usuarios/:id ----
router.put('/admin/usuarios/:id', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, error: 'ID inválido' });
        }

        const usuario = await Avaliador.findById(req.params.id);
        if (!usuario) {
            return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
        }

        const { nomeCompleto, email, isCoordenador, status } = req.body;

        if (email && String(email).trim().toLowerCase() !== usuario.email) {
            const novoEmail = String(email).trim().toLowerCase();
            const existe = await Avaliador.findOne({ email: novoEmail, _id: { $ne: usuario._id } });
            if (existe) {
                return res.status(409).json({ success: false, error: 'Já existe outro usuário com este e-mail' });
            }
            usuario.email = novoEmail;
        }

        if (nomeCompleto !== undefined && String(nomeCompleto).trim()) {
            usuario.nomeCompleto = String(nomeCompleto).trim();
        }
        if (isCoordenador !== undefined) {
            usuario.isCoordenador = !!isCoordenador;
        }
        if (status && ['Pendente', 'Ativo', 'Inativo', 'Bloqueado'].includes(status)) {
            usuario.status = status;
        }

        await usuario.save();

        logger.info(`✏️ [USUARIOS] Usuário atualizado: ${usuario.email}`);

        res.json({
            success: true,
            usuario: {
                _id: usuario._id,
                nomeCompleto: usuario.nomeCompleto,
                email: usuario.email,
                isCoordenador: usuario.isCoordenador,
                status: usuario.status
            }
        });
    } catch (error) {
        logger.error('❌ [USUARIOS] Erro ao atualizar:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ---- PUT /admin/usuarios/:id/resetar-senha ----
// ---- PUT /admin/usuarios/:id/resetar-senha ----
router.put('/admin/usuarios/:id/resetar-senha', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, error: 'ID inválido' });
        }

        const usuario = await Avaliador.findById(req.params.id);
        if (!usuario) {
            return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
        }

        let { novaSenha } = req.body;

        // Se não informada, gera uma senha temporária forte
        if (!novaSenha) {
            const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
            novaSenha = '';
            for (let i = 0; i < 10; i++) {
                novaSenha += chars.charAt(Math.floor(Math.random() * chars.length));
            }
        }

        if (String(novaSenha).length < 6) {
            return res.status(400).json({ success: false, error: 'A senha deve ter no mínimo 6 caracteres' });
        }

        // 🔥 AQUI ESTÁ A CORREÇÃO: Usa o método do model para gerar o hash corretamente
        await usuario.setSenha(novaSenha);
        usuario.senhaTemporaria = true;
        usuario.senhaTemporariaEm = new Date();
        await usuario.save();

        logger.info(`🔑 [USUARIOS] Senha resetada para: ${usuario.email}`);

        res.json({
            success: true,
            mensagem: 'Senha resetada com sucesso',
            novaSenha // retorna para o admin repassar ao usuário
        });
    } catch (error) {
        logger.error('❌ [USUARIOS] Erro ao resetar senha:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ---- DELETE /admin/usuarios/:id ----
router.delete('/admin/usuarios/:id', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, error: 'ID inválido' });
        }

        const usuario = await Avaliador.findById(req.params.id);
        if (!usuario) {
            return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
        }

        const tinhaAvaliacoes = await Avaliacao.countDocuments({ avaliadorId: usuario._id });

        await Promise.all([
            Avaliacao.deleteMany({ avaliadorId: usuario._id }),
            Evento.updateMany(
                { coordenadores: usuario._id },
                { $pull: { coordenadores: usuario._id } }
            )
        ]);

        await Avaliador.findByIdAndDelete(usuario._id);

        logger.info(`🗑️ [USUARIOS] Usuário removido: ${usuario.email} | avaliações apagadas: ${tinhaAvaliacoes}`);

        res.json({
            success: true,
            mensagem: 'Usuário removido',
            avaliacoesRemovidas: tinhaAvaliacoes
        });
    } catch (error) {
        logger.error('❌ [USUARIOS] Erro ao remover:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ---- GET /:id (Admin) — DEPOIS das rotas /admin/* ----
router.get('/:id', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, error: 'ID inválido' });
        }
        const evento = await Evento.findById(req.params.id)
            .populate('modeloId')
            .populate('criadoPor', 'nome email')
            .populate('coordenadores', 'nomeCompleto email');
        if (!evento) return res.status(404).json({ success: false, error: 'Evento não encontrado' });
        res.json({ success: true, evento });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ---- POST / (Admin) ----
router.post('/', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { titulo, modeloId, descricaoPublica, local, publicoAlvo, dataInicioInscricao, dataFimInscricao, dataInicioEvento, dataFimEvento, vagas, status, coordenadoresEmails } = req.body;
        if (!titulo || !titulo.trim()) return res.status(400).json({ success: false, error: 'Título é obrigatório' });
        if (!modeloId || !mongoose.Types.ObjectId.isValid(modeloId)) return res.status(400).json({ success: false, error: 'Modelo inválido' });
        if (!dataInicioInscricao || !dataFimInscricao) return res.status(400).json({ success: false, error: 'Datas de inscrição são obrigatórias' });

        const modelo = await ModeloEvento.findById(modeloId);
        if (!modelo || !modelo.ativo) return res.status(404).json({ success: false, error: 'Modelo não encontrado ou inativo' });

        const inicio = new Date(dataInicioInscricao);
        const fim = new Date(dataFimInscricao);
        if (isNaN(inicio) || isNaN(fim)) return res.status(400).json({ success: false, error: 'Datas inválidas' });
        if (fim <= inicio) return res.status(400).json({ success: false, error: 'Data fim deve ser depois da data início' });

        const slug = await gerarSlugUnico(titulo);
        const coordenadoresIds = await resolverCoordenadores(coordenadoresEmails);

        const novoEvento = new Evento({
            titulo: titulo.trim(),
            modeloId,
            slug,
            descricaoPublica: descricaoPublica || '',
            local: local || '',
            publicoAlvo: publicoAlvo || '',
            dataInicioInscricao: inicio,
            dataFimInscricao: fim,
            dataInicioEvento: dataInicioEvento ? new Date(dataInicioEvento) : null,
            dataFimEvento: dataFimEvento ? new Date(dataFimEvento) : null,
            vagas: (vagas === '' || vagas === null || vagas === undefined) ? null : Number(vagas),
            status: ['Rascunho', 'Publicado', 'Encerrado', 'Cancelado'].includes(status) ? status : 'Rascunho',
            criadoPor: req.userId,
            criadoPorModel: 'User',
            coordenadores: coordenadoresIds,
            permiteMultiplasInscricoes: !!modelo.permiteMultiplasInscricoes,
            totalParticipantes: 0
        });

        await novoEvento.save();
        await criarConfigAvaliacaoSeNecessario(novoEvento, modelo);

        logger.info(`✅ [EVENTOS] Evento criado: ${novoEvento.titulo} (${slug}) | múltiplas: ${novoEvento.permiteMultiplasInscricoes}`);
        res.status(201).json({ success: true, evento: novoEvento });
    } catch (error) {
        logger.error('❌ [EVENTOS] Erro ao criar evento:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ---- POST /coordenador-novo ----
router.post('/coordenador-novo', authenticateAvaliador, async (req, res) => {
    if (!req.avaliador.isCoordenador) return res.status(403).json({ success: false, error: 'Apenas coordenadores.' });
    try {
        const { titulo, modeloId, descricaoPublica, local, publicoAlvo, dataInicioInscricao, dataFimInscricao, dataInicioEvento, dataFimEvento, vagas, status, coordenadoresEmails } = req.body;
        const modelo = await ModeloEvento.findById(modeloId);
        if (!modelo) return res.status(404).json({ success: false, error: 'Modelo não encontrado' });

        const slug = await gerarSlugUnico(titulo);
        const coordenadoresIds = await resolverCoordenadores(coordenadoresEmails);

        const novoEvento = new Evento({
            titulo: titulo.trim(), modeloId, slug,
            descricaoPublica: descricaoPublica || '',
            local: local || '', publicoAlvo: publicoAlvo || '',
            dataInicioInscricao: new Date(dataInicioInscricao),
            dataFimInscricao: new Date(dataFimInscricao),
            dataInicioEvento: dataInicioEvento ? new Date(dataInicioEvento) : null,
            dataFimEvento: dataFimEvento ? new Date(dataFimEvento) : null,
            vagas: (vagas === '' || vagas === null) ? null : Number(vagas),
            status: ['Rascunho', 'Publicado'].includes(status) ? status : 'Rascunho',
            criadoPor: req.avaliadorId,
            criadoPorModel: 'Avaliador',
            coordenadores: coordenadoresIds,
            permiteMultiplasInscricoes: !!modelo.permiteMultiplasInscricoes,
            totalParticipantes: 0
        });
        await novoEvento.save();
        await criarConfigAvaliacaoSeNecessario(novoEvento, modelo);

        res.status(201).json({ success: true, evento: novoEvento });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ---- PUT /:id (Admin) ----
router.put('/:id', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, error: 'ID inválido' });
        }
        const evento = await Evento.findById(req.params.id);
        if (!evento) return res.status(404).json({ success: false, error: 'Evento não encontrado' });

        const { titulo, modeloId, descricaoPublica, local, publicoAlvo, dataInicioInscricao, dataFimInscricao, dataInicioEvento, dataFimEvento, vagas, status, coordenadoresEmails } = req.body;

        if (titulo && titulo.trim() && titulo.trim() !== evento.titulo) {
            evento.titulo = titulo.trim();
            evento.slug = await gerarSlugUnico(evento.titulo, evento._id);
        }
        if (modeloId && mongoose.Types.ObjectId.isValid(modeloId)) {
            evento.modeloId = modeloId;
            const novoModelo = await ModeloEvento.findById(modeloId);
            if (novoModelo) evento.permiteMultiplasInscricoes = !!novoModelo.permiteMultiplasInscricoes;
        }
        if (descricaoPublica !== undefined) evento.descricaoPublica = descricaoPublica;
        if (local !== undefined) evento.local = local;
        if (publicoAlvo !== undefined) evento.publicoAlvo = publicoAlvo;
        if (dataInicioInscricao) evento.dataInicioInscricao = new Date(dataInicioInscricao);
        if (dataFimInscricao) evento.dataFimInscricao = new Date(dataFimInscricao);
        if (dataInicioEvento !== undefined) evento.dataInicioEvento = dataInicioEvento ? new Date(dataInicioEvento) : null;
        if (dataFimEvento !== undefined) evento.dataFimEvento = dataFimEvento ? new Date(dataFimEvento) : null;
        if (vagas !== undefined) evento.vagas = (vagas === '' || vagas === null) ? null : Number(vagas);
        if (status && ['Rascunho', 'Publicado', 'Encerrado', 'Cancelado'].includes(status)) evento.status = status;
        if (coordenadoresEmails) evento.coordenadores = await resolverCoordenadores(coordenadoresEmails);

        await evento.save();

        if (modeloId) {
            const modelo = await ModeloEvento.findById(evento.modeloId);
            await criarConfigAvaliacaoSeNecessario(evento, modelo);
        }

        logger.info(`✏️ [EVENTOS] Evento atualizado: ${evento.titulo}`);
        res.json({ success: true, evento });
    } catch (error) {
        logger.error('❌ [EVENTOS] Erro ao atualizar evento:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ---- PUT /coordenador-editar/:id ----
router.put('/coordenador-editar/:id', authenticateAvaliador, isCoordenadorEvento, async (req, res) => {
    try {
        const evento = await Evento.findById(req.params.id);
        if (!evento) return res.status(404).json({ success: false, error: 'Evento não encontrado' });

        const { titulo, coordenadoresEmails, modeloId, ...resto } = req.body;
        if (titulo) { evento.titulo = titulo; evento.slug = await gerarSlugUnico(titulo, evento._id); }
        if (coordenadoresEmails) evento.coordenadores = await resolverCoordenadores(coordenadoresEmails);
        if (modeloId && mongoose.Types.ObjectId.isValid(modeloId)) {
            evento.modeloId = modeloId;
            const novoModelo = await ModeloEvento.findById(modeloId);
            if (novoModelo) evento.permiteMultiplasInscricoes = !!novoModelo.permiteMultiplasInscricoes;
        }

        Object.assign(evento, resto);
        await evento.save();
        res.json({ success: true, evento });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============================================================================
// POST /:id/recalcular-total
// ============================================================================
router.post('/:id/recalcular-total', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, error: 'ID inválido' });
        }

        const evento = await Evento.findById(req.params.id);
        if (!evento) return res.status(404).json({ success: false, error: 'Evento não encontrado' });

        const totalReal = await Inscricao.countDocuments({ eventoId: evento._id });
        const antes = evento.totalParticipantes;

        evento.totalParticipantes = totalReal;
        await evento.save();

        logger.info(`🔄 [EVENTOS] Contador recalculado: ${evento.titulo} | ${antes} → ${totalReal}`);

        res.json({
            success: true,
            mensagem: `Contador recalculado: ${antes} → ${totalReal}`,
            antes,
            depois: totalReal,
            evento: {
                _id: evento._id,
                titulo: evento.titulo,
                slug: evento.slug,
                totalParticipantes: evento.totalParticipantes
            }
        });
    } catch (error) {
        logger.error('❌ [EVENTOS] Erro ao recalcular contador:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// POST /recalcular-todos
// ============================================================================
router.post('/recalcular-todos', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const eventos = await Evento.find().select('_id titulo totalParticipantes').lean();
        const resultados = [];

        for (const ev of eventos) {
            const totalReal = await Inscricao.countDocuments({ eventoId: ev._id });
            if (totalReal !== ev.totalParticipantes) {
                await Evento.updateOne({ _id: ev._id }, { $set: { totalParticipantes: totalReal } });
                resultados.push({
                    _id: ev._id,
                    titulo: ev.titulo,
                    antes: ev.totalParticipantes,
                    depois: totalReal
                });
            }
        }

        logger.info(`🔄 [EVENTOS] Recalcular todos: ${resultados.length} evento(s) corrigido(s)`);

        res.json({
            success: true,
            mensagem: `${resultados.length} evento(s) corrigido(s)`,
            totalVerificados: eventos.length,
            corrigidos: resultados
        });
    } catch (error) {
        logger.error('❌ [EVENTOS] Erro ao recalcular todos:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ---- DELETE /:id (Admin) ----
router.delete('/:id', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, error: 'ID inválido' });
        }
        const evento = await Evento.findById(req.params.id);
        if (!evento) return res.status(404).json({ success: false, error: 'Evento não encontrado' });

        await Promise.all([
            Inscricao.deleteMany({ eventoId: evento._id }),
            Avaliacao.deleteMany({ eventoId: evento._id }),
            EventoConfigAvaliacao.deleteOne({ eventoId: evento._id }),
            Avaliador.updateMany(
                { eventos: evento._id },
                { $pull: { eventos: evento._id } }
            )
        ]);

        await Evento.findByIdAndDelete(evento._id);

        logger.info(`🗑️ [EVENTOS] Evento removido: ${evento.titulo}`);
        res.json({ success: true, mensagem: 'Evento e inscrições removidos' });
    } catch (error) {
        logger.error('❌ [EVENTOS] Erro ao remover evento:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;