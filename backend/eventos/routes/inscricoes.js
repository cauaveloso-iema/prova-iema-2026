// ============================================================================
// backend/eventos/routes/inscricoes.js
// Base: /api/eventos/inscricoes
// ============================================================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

let logger = console;
try { logger = require('../../../utils/logger'); } catch (_) {}

const Inscricao = require('../models/Inscricao');
const Evento = require('../models/Evento');
const { authenticateToken, isSuperAdmin } = require('../middlewares/auth-eventos');

// ---- /minhas — participante autenticado vê suas inscrições ----
router.get('/minhas', async (req, res) => {
    try {
        const auth = req.headers['authorization'];
        const token = auth && auth.split(' ')[1];
        if (!token) return res.status(401).json({ success: false, error: 'Token não fornecido' });

        let participanteId;
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            if (decoded.type !== 'participante_eventos') {
                return res.status(403).json({ success: false, error: 'Token inválido' });
            }
            participanteId = decoded.id;
        } catch (e) {
            return res.status(403).json({ success: false, error: 'Token inválido ou expirado' });
        }

        const inscricoes = await Inscricao.find({ participanteId })
            .sort({ createdAt: -1 })
            .populate({
                path: 'eventoId',
                select: 'titulo slug status dataInicioInscricao dataFimInscricao dataInicioEvento dataFimEvento vagas totalParticipantes local descricaoPublica'
            })
            .lean();

        const agora = new Date();
        const resultado = inscricoes
            .filter(i => i.eventoId)
            .map(i => {
                const ev = i.eventoId;
                let categoria = 'encerradas';
                if (ev.status === 'Publicado' && ev.dataFimInscricao && agora <= new Date(ev.dataFimInscricao)) {
                    categoria = 'abertas';
                } else if (ev.status === 'Encerrado' || (ev.dataFimEvento && agora > new Date(ev.dataFimEvento))) {
                    categoria = 'concluidas';
                }
                return {
                    _id: i._id,
                    protocolo: i.protocolo,
                    status: i.status,
                    createdAt: i.createdAt,
                    dadosPreenchidos: Object.fromEntries(
                        Object.entries(i.dadosPreenchidos || {}).filter(([k]) => k !== '__assinaturas')
                    ),
                    anexosParticipante: i.anexosParticipante || {},
                    temAssinatura: !!i.assinaturaBase64,
                    categoria,
                    evento: {
                        _id: ev._id,
                        titulo: ev.titulo,
                        slug: ev.slug,
                        status: ev.status,
                        local: ev.local,
                        dataInicioInscricao: ev.dataInicioInscricao,
                        dataFimInscricao: ev.dataFimInscricao,
                        dataInicioEvento: ev.dataInicioEvento,
                        dataFimEvento: ev.dataFimEvento
                    }
                };
            });

        res.json({ success: true, inscricoes: resultado });
    } catch (error) {
        logger.error('❌ [EVENTOS] Erro em /minhas:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ---- Rotas admin (abaixo) ----

router.get('/', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { eventoId, status } = req.query;
        if (!eventoId || !mongoose.Types.ObjectId.isValid(eventoId)) {
            return res.status(400).json({ success: false, error: 'eventoId inválido' });
        }
        const filtro = { eventoId };
        if (status) filtro.status = status;

        const inscricoes = await Inscricao.find(filtro)
            .sort({ createdAt: -1 })
            .populate('participanteId', 'nomeCompleto dataNascimento genero endereco instituicao funcao serieEstudantes')
            .lean();

        const lista = inscricoes.map(i => {
            const p = i.participanteId || {};
            return {
                _id: i._id,
                protocolo: i.protocolo,
                status: i.status,
                dadosPreenchidos: i.dadosPreenchidos,
                anexosParticipante: i.anexosParticipante || {},
                observacoesAdmin: i.observacoesAdmin,
                createdAt: i.createdAt,
                temAssinatura: !!i.assinaturaBase64,
                participante: p._id ? {
                    _id: p._id,
                    nomeCompleto: p.nomeCompleto,
                    dataNascimento: p.dataNascimento,
                    genero: p.genero,
                    endereco: p.endereco,
                    instituicao: p.instituicao,
                    funcao: p.funcao,
                    serieEstudantes: p.serieEstudantes
                } : null
            };
        });

        res.json({ success: true, inscricoes: lista });
    } catch (error) {
        logger.error('❌ [EVENTOS] Erro ao listar inscrições:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/:id', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ success: false, error: 'ID inválido' });
        const i = await Inscricao.findById(req.params.id).populate('participanteId', 'nomeCompleto dataNascimento genero endereco instituicao funcao serieEstudantes').lean();
        if (!i) return res.status(404).json({ success: false, error: 'Inscrição não encontrada' });
        const p = i.participanteId || {};
        const inscricao = {
            _id: i._id,
            protocolo: i.protocolo,
            status: i.status,
            dadosPreenchidos: i.dadosPreenchidos,
            anexosParticipante: i.anexosParticipante || {},
            observacoesAdmin: i.observacoesAdmin,
            createdAt: i.createdAt,
            temAssinatura: !!i.assinaturaBase64,
            assinaturaBase64: i.assinaturaBase64,
            participante: p._id ? {
                _id: p._id,
                nomeCompleto: p.nomeCompleto,
                dataNascimento: p.dataNascimento,
                genero: p.genero,
                endereco: p.endereco,
                instituicao: p.instituicao,
                funcao: p.funcao,
                serieEstudantes: p.serieEstudantes
            } : null
        };
        res.json({ success: true, inscricao });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.put('/:id', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ success: false, error: 'ID inválido' });
        const { status, observacoesAdmin, dadosPreenchidos } = req.body;
        const update = {};
        if (status) {
            const validos = ['Pendente', 'Confirmada', 'Cancelada', 'Presente', 'Ausente'];
            if (!validos.includes(status)) return res.status(400).json({ success: false, error: 'Status inválido' });
            update.status = status;
        }
        if (observacoesAdmin !== undefined) update.observacoesAdmin = observacoesAdmin;
        if (dadosPreenchidos && typeof dadosPreenchidos === 'object') update.dadosPreenchidos = dadosPreenchidos;

        const inscricao = await Inscricao.findByIdAndUpdate(req.params.id, update, { new: true })
            .populate('participanteId', 'nomeCompleto');
        if (!inscricao) return res.status(404).json({ success: false, error: 'Inscrição não encontrada' });
        res.json({ success: true, inscricao });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.put('/:id/status', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { status, observacoesAdmin } = req.body;
        const validos = ['Pendente', 'Confirmada', 'Cancelada', 'Presente', 'Ausente'];
        if (!validos.includes(status)) {
            return res.status(400).json({ success: false, error: 'Status inválido' });
        }
        const inscricao = await Inscricao.findByIdAndUpdate(
            req.params.id,
            { status, ...(observacoesAdmin !== undefined ? { observacoesAdmin } : {}) },
            { new: true }
        ).populate('participanteId', 'nomeCompleto');
        if (!inscricao) return res.status(404).json({ success: false, error: 'Inscrição não encontrada' });
        res.json({ success: true, inscricao });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/:id', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const inscricao = await Inscricao.findByIdAndDelete(req.params.id);
        if (!inscricao) return res.status(404).json({ success: false, error: 'Inscrição não encontrada' });
        await Evento.findByIdAndUpdate(inscricao.eventoId, { $inc: { totalParticipantes: -1 } });
        res.json({ success: true, mensagem: 'Inscrição removida' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;