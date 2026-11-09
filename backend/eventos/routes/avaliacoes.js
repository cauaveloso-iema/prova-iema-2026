// ============================================================================
// backend/eventos/routes/avaliacoes.js
// Base: /api/eventos/avaliacoes
// ============================================================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

let logger = console;
try { logger = require('../../../utils/logger'); } catch (_) {}

const Evento = require('../models/Evento');
const Inscricao = require('../models/Inscricao');
const Avaliacao = require('../models/Avaliacao');
const Avaliador = require('../models/Avaliador');
const ModeloEvento = require('../models/ModeloEvento');
const EventoConfigAvaliacao = require('../models/EventoConfigAvaliacao');
const { authenticateAvaliador } = require('../middlewares/auth-eventos');

// ============================================================================
// HELPERS
// ============================================================================

async function obterConfigEvento(evento, modelo) {
    const anexoAv = modelo?.anexos?.find(a => a.isAvaliativo);

    const defaults = {
        eventoId: evento._id,
        numAvaliadores: Math.max(1, parseInt(anexoAv?.numAvaliadores) || 1),
        modoDistribuicao: ['aleatorio', 'manual'].includes(anexoAv?.modoDistribuicao)
            ? anexoAv.modoDistribuicao
            : 'aleatorio',
        calcularMedia: anexoAv?.calcularMedia !== false,
        tipoMedia: anexoAv?.tipoMedia || 'aritmetica',
        exigeAssinaturaAvaliador: anexoAv?.exigeAssinaturaAvaliador === true
    };

    return EventoConfigAvaliacao.findOneAndUpdate(
        { eventoId: evento._id },
        { $setOnInsert: defaults },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
}

async function podeGerenciar(avaliadorId, evento) {
    const av = await Avaliador.findById(avaliadorId).select('isCoordenador').lean();
    if (av?.isCoordenador) return true;
    return (evento.coordenadores || []).some(id => String(id) === String(avaliadorId));
}

/**
 * Recalcula a média de uma inscrição.
 * 🔥 CORRIGIDO: apenas atualiza notaFinalCalculada. NÃO cria registro de consolidação.
 * Isso elimina o erro E11000 e o 500 de vez.
 */
async function recalcularMediaInscricao(inscricaoId) {
    const avaliacoes = await Avaliacao.find({
        inscricaoId,
        ehConsolidacao: false,
        status: 'Concluída'
    }).lean();

    if (avaliacoes.length === 0) return null;

    const soma = avaliacoes.reduce((acc, a) => acc + (Number(a.notaFinal) || 0), 0);
    const media = parseFloat((soma / avaliacoes.length).toFixed(2));

    await Avaliacao.updateMany(
        { inscricaoId, ehConsolidacao: false },
        { $set: { notaFinalCalculada: media } }
    );

    return media;
}

// ============================================================================
// GET /minhas-avaliacoes
// ============================================================================
router.get('/minhas-avaliacoes', authenticateAvaliador, async (req, res) => {
    try {
        const avaliadorId = req.avaliadorId;

        const avaliador = await Avaliador.findById(avaliadorId).select('eventos isCoordenador').lean();
        if (!avaliador) {
            return res.status(404).json({ success: false, error: 'Avaliador não encontrado' });
        }

        const eventosVinculadosIds = avaliador.eventos || [];
        const eventosCoordenados = await Evento.find({ coordenadores: avaliadorId }).select('_id').lean();
        const todosEventosIds = [...new Set([
            ...eventosVinculadosIds.map(id => String(id)),
            ...eventosCoordenados.map(e => String(e._id))
        ])].map(id => new mongoose.Types.ObjectId(id));

        if (todosEventosIds.length === 0) {
            return res.json({ success: true, pendentes: [] });
        }

        const eventos = await Evento.find({ _id: { $in: todosEventosIds } })
            .populate({ path: 'modeloId', select: 'nomeModelo anexos requerAvaliacao' })
            .lean();

        const inscricoes = await Inscricao.find({
            eventoId: { $in: todosEventosIds },
            status: { $in: ['Pendente', 'Confirmada'] }
        })
        .populate('participanteId', 'nomeCompleto email')
        .lean();

        const avaliacoesDoAvaliador = await Avaliacao.find({
            avaliadorId,
            ehConsolidacao: false,
            inscricaoId: { $in: inscricoes.map(i => i._id) }
        }).select('inscricaoId status').lean();

        const concluidasPorMim = new Set(
            avaliacoesDoAvaliador.filter(a => a.status === 'Concluída').map(a => String(a.inscricaoId))
        );
        const atribuidasParaMim = new Set(
            avaliacoesDoAvaliador.filter(a => a.status === 'Pendente').map(a => String(a.inscricaoId))
        );

        const contagem = await Avaliacao.aggregate([
            {
                $match: {
                    inscricaoId: { $in: inscricoes.map(i => i._id) },
                    ehConsolidacao: false,
                    status: 'Concluída'
                }
            },
            { $group: { _id: '$inscricaoId', total: { $sum: 1 } } }
        ]);
        const totalPorInscricao = {};
        contagem.forEach(c => { totalPorInscricao[String(c._id)] = c.total; });

        const pendentes = [];

        for (const inscricao of inscricoes) {
            const inscIdStr = String(inscricao._id);
            if (concluidasPorMim.has(inscIdStr)) continue;

            const evento = eventos.find(e => String(e._id) === String(inscricao.eventoId));
            if (!evento) continue;
            const modelo = evento.modeloId;
            if (!modelo) continue;

            const anexoAvaliativo = (modelo.anexos || []).find(a => a.isAvaliativo);
            if (!anexoAvaliativo) continue;

            const cfg = await obterConfigEvento(evento, modelo);
            const jaAvaliada = totalPorInscricao[inscIdStr] || 0;

            if (cfg.modoDistribuicao === 'manual') {
                if (!atribuidasParaMim.has(inscIdStr)) continue;
                if (jaAvaliada >= cfg.numAvaliadores) continue;
            } else {
                if (atribuidasParaMim.has(inscIdStr)) {
                    if (jaAvaliada >= cfg.numAvaliadores) continue;
                } else if (cfg.sorteioExecutadoEm) {
                    continue;
                } else if (jaAvaliada >= cfg.numAvaliadores) {
                    continue;
                }
            }

            const criterios = (anexoAvaliativo.criteriosAvaliacao || []).map(c => ({
                label: c.label,
                descricao: c.descricao || '',
                notaMaxima: c.notaMaxima || 5
            }));

            const camposAvaliativos = criterios.length > 0
                ? []
                : (anexoAvaliativo.campos || []).map(c => ({ label: c.label, tipo: c.tipo }));

            pendentes.push({
                eventoId: evento._id,
                eventoNome: evento.titulo,
                modeloNome: modelo.nomeModelo,
                anexoLabel: anexoAvaliativo.labelCustom || anexoAvaliativo.nomeOriginal || 'Ficha de Avaliação',
                inscricaoId: inscricao._id,
                protocolo: inscricao.protocolo,
                participante: inscricao.participanteId?.nomeCompleto || '—',
                participanteEmail: inscricao.participanteId?.email || '',
                dadosPreenchidos: inscricao.dadosPreenchidos || {},
                assinaturaBase64: inscricao.assinaturaBase64 || null,
                anexosParticipante: inscricao.anexosParticipante || {},
                criteriosAvaliacao: criterios,
                camposAvaliativos: camposAvaliativos,
                informacoesDocumento: anexoAvaliativo.informacoesDocumento || '',
                legendasNotas: anexoAvaliativo.legendasNotas || [],
                exigeAssinaturaAvaliador: cfg.exigeAssinaturaAvaliador === true,
                numAvaliadores: cfg.numAvaliadores,
                modoDistribuicao: cfg.modoDistribuicao,
                calcularMedia: cfg.calcularMedia,
                tipoMedia: cfg.tipoMedia,
                avaliacoesJaFeitas: jaAvaliada,
                atribuidoAMim: atribuidasParaMim.has(inscIdStr)
            });
        }

        res.json({ success: true, pendentes });
    } catch (error) {
        logger.error('❌ [AVALIACOES] Erro em /minhas-avaliacoes:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// POST / — Salvar avaliação
// ============================================================================
router.post('/', authenticateAvaliador, async (req, res) => {
    try {
        const { eventoId, inscricaoId, notas, parecer, notaFinal, assinaturaAvaliadorBase64 } = req.body;

        if (!eventoId || !inscricaoId) {
            return res.status(400).json({ success: false, error: 'eventoId e inscricaoId são obrigatórios' });
        }
        if (isNaN(parseFloat(notaFinal))) {
            return res.status(400).json({ success: false, error: 'Nota Final é obrigatória' });
        }

        const avaliador = await Avaliador.findById(req.avaliadorId);
        if (!avaliador) return res.status(404).json({ success: false, error: 'Avaliador não encontrado' });

        const evento = await Evento.findById(eventoId).populate('modeloId');
        if (!evento) return res.status(404).json({ success: false, error: 'Evento não encontrado' });

        const vinculado = (avaliador.eventos || []).some(id => String(id) === String(eventoId))
            || (evento.coordenadores || []).some(id => String(id) === String(req.avaliadorId));
        if (!vinculado) {
            return res.status(403).json({ success: false, error: 'Você não está vinculado a este evento' });
        }

        const inscricao = await Inscricao.findOne({ _id: inscricaoId, eventoId });
        if (!inscricao) return res.status(404).json({ success: false, error: 'Inscrição não encontrada' });

        const existenteConcluida = await Avaliacao.findOne({
            avaliadorId: req.avaliadorId,
            inscricaoId,
            ehConsolidacao: false,
            status: 'Concluída'
        });
        if (existenteConcluida) {
            return res.status(409).json({ success: false, error: 'Você já avaliou esta inscrição' });
        }

        const cfg = await obterConfigEvento(evento, evento.modeloId);

        const jaAvaliadas = await Avaliacao.countDocuments({
            inscricaoId,
            ehConsolidacao: false,
            status: 'Concluída'
        });
        if (jaAvaliadas >= cfg.numAvaliadores) {
            return res.status(409).json({
                success: false,
                error: `Esta inscrição já recebeu o número máximo de ${cfg.numAvaliadores} avaliação(ões).`
            });
        }

        if (cfg.exigeAssinaturaAvaliador) {
            if (!assinaturaAvaliadorBase64 || !String(assinaturaAvaliadorBase64).startsWith('data:image/')) {
                return res.status(400).json({
                    success: false,
                    error: 'Este termo exige a assinatura do avaliador. Assine antes de salvar.'
                });
            }
        }

        const notasSanitizadas = {};
        if (notas && typeof notas === 'object') {
            for (const [label, valor] of Object.entries(notas)) {
                const num = parseFloat(valor);
                if (!isNaN(num)) notasSanitizadas[String(label).trim()] = num;
            }
        }

        // 🔥 Atômico: cria se não existir, atualiza se já existir
        const av = await Avaliacao.findOneAndUpdate(
            { eventoId, inscricaoId, avaliadorId: req.avaliadorId },
            {
                $set: {
                    notas: notasSanitizadas,
                    parecer: (parecer || '').trim(),
                    notaFinal: parseFloat(notaFinal),
                    assinaturaAvaliadorBase64: assinaturaAvaliadorBase64 || null,
                    status: 'Concluída',
                    dataConclusao: new Date(),
                    modoDistribuicaoAplicado: cfg.modoDistribuicao,
                    atribuicao: cfg.modoDistribuicao === 'manual' ? 'manual' : 'aleatorio'
                }
            },
            { upsert: true, new: true }
        );

        let media = null;
        if (cfg.calcularMedia) {
            media = await recalcularMediaInscricao(inscricaoId);
        }

        res.status(201).json({
            success: true,
            mensagem: 'Avaliação salva com sucesso!',
            avaliacao: {
                _id: av._id,
                notaFinal: av.notaFinal,
                notaFinalCalculada: media,
                createdAt: av.createdAt
            }
        });
    } catch (error) {
        logger.error('❌ [AVALIACOES] Erro ao salvar:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// GET /configuracao/:eventoId
// ============================================================================
router.get('/configuracao/:eventoId', authenticateAvaliador, async (req, res) => {
    try {
        const { eventoId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(eventoId)) {
            return res.status(400).json({ success: false, error: 'ID inválido' });
        }

        const evento = await Evento.findById(eventoId).populate('modeloId');
        if (!evento) return res.status(404).json({ success: false, error: 'Evento não encontrado' });

        if (!(await podeGerenciar(req.avaliadorId, evento))) {
            return res.status(403).json({ success: false, error: 'Acesso negado' });
        }

        const anexoAv = (evento.modeloId?.anexos || []).find(a => a.isAvaliativo);
        if (!anexoAv) {
            return res.json({ success: true, configuracao: null, temAnexoAvaliativo: false });
        }

        const cfg = await obterConfigEvento(evento, evento.modeloId);

        res.json({
            success: true,
            configuracao: {
                numAvaliadores: cfg.numAvaliadores,
                modoDistribuicao: cfg.modoDistribuicao,
                calcularMedia: cfg.calcularMedia,
                tipoMedia: cfg.tipoMedia,
                exigeAssinaturaAvaliador: cfg.exigeAssinaturaAvaliador,
                sorteioExecutadoEm: cfg.sorteioExecutadoEm,
                sorteioExecutadoPor: cfg.sorteioExecutadoPor
            },
            temAnexoAvaliativo: true
        });
    } catch (error) {
        logger.error('❌ [AVALIACOES] Erro em GET /configuracao:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// PUT /configuracao/:eventoId
// ============================================================================
router.put('/configuracao/:eventoId', authenticateAvaliador, async (req, res) => {
    try {
        const { eventoId } = req.params;
        const {
            numAvaliadores, modoDistribuicao, calcularMedia, tipoMedia, exigeAssinaturaAvaliador
        } = req.body;

        if (!mongoose.Types.ObjectId.isValid(eventoId)) {
            return res.status(400).json({ success: false, error: 'ID inválido' });
        }

        const evento = await Evento.findById(eventoId).populate('modeloId');
        if (!evento) return res.status(404).json({ success: false, error: 'Evento não encontrado' });

        if (!(await podeGerenciar(req.avaliadorId, evento))) {
            return res.status(403).json({ success: false, error: 'Acesso negado' });
        }

        const anexoAv = (evento.modeloId?.anexos || []).find(a => a.isAvaliativo);
        if (!anexoAv) {
            return res.status(400).json({ success: false, error: 'Modelo não possui anexo avaliativo' });
        }

        const cfg = await obterConfigEvento(evento, evento.modeloId);

        if (typeof numAvaliadores !== 'undefined') {
            cfg.numAvaliadores = Math.max(1, Math.min(20, parseInt(numAvaliadores) || 1));
        }
        if (typeof modoDistribuicao !== 'undefined') {
            if (!['aleatorio', 'manual'].includes(modoDistribuicao)) {
                return res.status(400).json({ success: false, error: 'modoDistribuicao inválido' });
            }
            cfg.modoDistribuicao = modoDistribuicao;
        }
        if (typeof calcularMedia !== 'undefined') {
            cfg.calcularMedia = calcularMedia !== false;
        }
        if (typeof tipoMedia !== 'undefined') {
            if (!['aritmetica', 'ponderada'].includes(tipoMedia)) {
                return res.status(400).json({ success: false, error: 'tipoMedia inválido' });
            }
            cfg.tipoMedia = tipoMedia;
        }
        if (typeof exigeAssinaturaAvaliador !== 'undefined') {
            cfg.exigeAssinaturaAvaliador = exigeAssinaturaAvaliador === true;
        }

        await cfg.save();

        const verificado = await EventoConfigAvaliacao.findOne({ eventoId: evento._id }).lean();
        if (!verificado) {
            logger.error('❌ [AVALIACOES] Config desapareceu após save()');
            return res.status(500).json({ success: false, error: 'Erro ao salvar configuração' });
        }
        if (typeof modoDistribuicao !== 'undefined' && verificado.modoDistribuicao !== modoDistribuicao) {
            logger.error('❌ [AVALIACOES] modoDistribuicao não persistiu', {
                esperado: modoDistribuicao,
                obtido: verificado.modoDistribuicao
            });
            return res.status(500).json({
                success: false,
                error: 'Configuração não foi salva corretamente. Tente novamente.'
            });
        }

        res.json({
            success: true,
            mensagem: 'Configuração atualizada',
            configuracao: {
                numAvaliadores: verificado.numAvaliadores,
                modoDistribuicao: verificado.modoDistribuicao,
                calcularMedia: verificado.calcularMedia,
                tipoMedia: verificado.tipoMedia,
                exigeAssinaturaAvaliador: verificado.exigeAssinaturaAvaliador
            }
        });
    } catch (error) {
        logger.error('❌ [AVALIACOES] Erro em PUT /configuracao:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// POST /sortear/:eventoId
// ============================================================================
router.post('/sortear/:eventoId', authenticateAvaliador, async (req, res) => {
    try {
        const { eventoId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(eventoId)) {
            return res.status(400).json({ success: false, error: 'ID inválido' });
        }

        const evento = await Evento.findById(eventoId).populate('modeloId');
        if (!evento) return res.status(404).json({ success: false, error: 'Evento não encontrado' });

        if (!(await podeGerenciar(req.avaliadorId, evento))) {
            return res.status(403).json({ success: false, error: 'Acesso negado' });
        }

        const anexoAv = (evento.modeloId?.anexos || []).find(a => a.isAvaliativo);
        if (!anexoAv) {
            return res.status(400).json({ success: false, error: 'Modelo não possui anexo avaliativo' });
        }

        const cfg = await obterConfigEvento(evento, evento.modeloId);
        if (cfg.modoDistribuicao !== 'aleatorio') {
            return res.status(400).json({
                success: false,
                error: 'Sorteio só está disponível no modo aleatório. Altere o modo na configuração.'
            });
        }

        const avaliadores = await Avaliador.find({
            eventos: eventoId,
            status: 'Ativo',
            isCoordenador: false
        }).select('_id nomeCompleto email').lean();

        if (avaliadores.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Nenhum avaliador ativo vinculado a este evento.'
            });
        }

        const inscricoes = await Inscricao.find({
            eventoId,
            status: { $in: ['Pendente', 'Confirmada'] }
        }).select('_id').lean();

        if (inscricoes.length === 0) {
            return res.json({ success: true, mensagem: 'Nenhuma inscrição para sortear.', criadas: 0 });
        }

        let criadas = 0;
        const jaAtribuidas = [];
        const semSorteio = [];

        for (const inscricao of inscricoes) {
            const existentes = await Avaliacao.find({
                inscricaoId: inscricao._id,
                ehConsolidacao: false
            }).select('avaliadorId status').lean();

            const concluidas = existentes.filter(e => e.status === 'Concluída');
            const pendentes = existentes.filter(e => e.status === 'Pendente');
            const faltam = cfg.numAvaliadores - concluidas.length - pendentes.length;

            if (faltam <= 0) {
                jaAtribuidas.push(inscricao._id);
                continue;
            }

            const idsJaVinculados = new Set(existentes.map(e => String(e.avaliadorId)));
            const candidatos = avaliadores.filter(a => !idsJaVinculados.has(String(a._id)));

            if (candidatos.length < faltam) {
                semSorteio.push({ inscricaoId: inscricao._id, faltam, disponiveis: candidatos.length });
            }

            const sorteados = candidatos
                .sort(() => Math.random() - 0.5)
                .slice(0, faltam);

            for (const av of sorteados) {
                await Avaliacao.findOneAndUpdate(
                    { eventoId, inscricaoId: inscricao._id, avaliadorId: av._id },
                    {
                        $setOnInsert: {
                            notas: {}, parecer: '', notaFinal: null,
                            status: 'Pendente',
                            modoDistribuicaoAplicado: 'aleatorio',
                            atribuicao: 'aleatorio',
                            ehConsolidacao: false
                        }
                    },
                    { upsert: true }
                );
                criadas++;
            }
        }

        cfg.sorteioExecutadoEm = new Date();
        cfg.sorteioExecutadoPor = req.avaliadorId;
        await cfg.save();

        res.json({
            success: true,
            mensagem: `Sorteio concluído: ${criadas} atribuição(ões) criada(s).`,
            criadas,
            jaAtribuidas: jaAtribuidas.length,
            semSorteio: semSorteio.length,
            detalhes: semSorteio
        });
    } catch (error) {
        logger.error('❌ [AVALIACOES] Erro em /sortear:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// POST /limpar-sorteio/:eventoId
// ============================================================================
router.post('/limpar-sorteio/:eventoId', authenticateAvaliador, async (req, res) => {
    try {
        const { eventoId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(eventoId)) {
            return res.status(400).json({ success: false, error: 'ID inválido' });
        }

        const evento = await Evento.findById(eventoId).populate('modeloId');
        if (!evento) return res.status(404).json({ success: false, error: 'Evento não encontrado' });

        if (!(await podeGerenciar(req.avaliadorId, evento))) {
            return res.status(403).json({ success: false, error: 'Acesso negado' });
        }

        const resultado = await Avaliacao.deleteMany({
            eventoId,
            ehConsolidacao: false,
            status: 'Pendente',
            atribuicao: 'aleatorio'
        });

        const cfg = await obterConfigEvento(evento, evento.modeloId);
        cfg.sorteioExecutadoEm = null;
        cfg.sorteioExecutadoPor = null;
        await cfg.save();

        res.json({
            success: true,
            mensagem: `${resultado.deletedCount} atribuição(ões) removida(s).`,
            removidas: resultado.deletedCount
        });
    } catch (error) {
        logger.error('❌ [AVALIACOES] Erro em /limpar-sorteio:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// GET /pendentes-coordenador/:eventoId
// ============================================================================
router.get('/pendentes-coordenador/:eventoId', authenticateAvaliador, async (req, res) => {
    try {
        const { eventoId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(eventoId)) {
            return res.status(400).json({ success: false, error: 'ID inválido' });
        }

        const evento = await Evento.findById(eventoId).populate('modeloId');
        if (!evento) return res.status(404).json({ success: false, error: 'Evento não encontrado' });

        if (!(await podeGerenciar(req.avaliadorId, evento))) {
            return res.status(403).json({ success: false, error: 'Acesso negado' });
        }

        const inscricoes = await Inscricao.find({
            eventoId,
            status: { $in: ['Pendente', 'Confirmada'] }
        })
        .populate('participanteId', 'nomeCompleto email')
        .sort({ createdAt: 1 })
        .lean();

        const todasAvaliacoes = await Avaliacao.find({ eventoId, ehConsolidacao: false })
            .populate('avaliadorId', 'nomeCompleto email')
            .lean();

        const porInscricao = {};
        todasAvaliacoes.forEach(a => {
            const k = String(a.inscricaoId);
            if (!porInscricao[k]) porInscricao[k] = [];
            porInscricao[k].push(a);
        });

        const cfg = await obterConfigEvento(evento, evento.modeloId);

        const pendentes = inscricoes.map(i => {
            const avs = porInscricao[String(i._id)] || [];
            const concluidas = avs.filter(a => a.status === 'Concluída');
            const pendentesAtribuidas = avs.filter(a => a.status === 'Pendente');
            return {
                inscricaoId: i._id,
                protocolo: i.protocolo,
                participante: i.participanteId?.nomeCompleto || '—',
                participanteEmail: i.participanteId?.email || '',
                totalAvaliacoes: avs.length,
                concluidas: concluidas.length,
                pendentesAtribuidas: pendentesAtribuidas.length,
                faltamAtribuir: Math.max(0, cfg.numAvaliadores - avs.length),
                avaliadores: avs.map(a => ({
                    avaliacaoId: a._id,
                    avaliadorId: a.avaliadorId?._id,
                    nome: a.avaliadorId?.nomeCompleto || '—',
                    email: a.avaliadorId?.email || '',
                    status: a.status,
                    nota: a.notaFinal,
                    atribuicao: a.atribuicao
                }))
            };
        });

        res.json({
            success: true,
            pendentes,
            configuracao: {
                numAvaliadores: cfg.numAvaliadores,
                modoDistribuicao: cfg.modoDistribuicao,
                calcularMedia: cfg.calcularMedia,
                tipoMedia: cfg.tipoMedia,
                exigeAssinaturaAvaliador: cfg.exigeAssinaturaAvaliador,
                sorteioExecutadoEm: cfg.sorteioExecutadoEm
            }
        });
    } catch (error) {
        logger.error('❌ [AVALIACOES] Erro em /pendentes-coordenador:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// POST /atribuir-manual
// ============================================================================
router.post('/atribuir-manual', authenticateAvaliador, async (req, res) => {
    try {
        const { eventoId, inscricaoId, avaliadorId } = req.body;

        if (!eventoId || !inscricaoId || !avaliadorId) {
            return res.status(400).json({ success: false, error: 'eventoId, inscricaoId e avaliadorId são obrigatórios' });
        }

        const evento = await Evento.findById(eventoId).populate('modeloId');
        if (!evento) return res.status(404).json({ success: false, error: 'Evento não encontrado' });

        if (!(await podeGerenciar(req.avaliadorId, evento))) {
            return res.status(403).json({ success: false, error: 'Acesso negado' });
        }

        const inscricao = await Inscricao.findById(inscricaoId);
        if (!inscricao) return res.status(404).json({ success: false, error: 'Inscrição não encontrada' });

        const avaliadorDestino = await Avaliador.findById(avaliadorId);
        if (!avaliadorDestino) return res.status(404).json({ success: false, error: 'Avaliador não encontrado' });

        const existente = await Avaliacao.findOne({
            avaliadorId,
            inscricaoId,
            ehConsolidacao: false
        });
        if (existente) {
            return res.status(409).json({ success: false, error: 'Este avaliador já foi atribuído/avaliou esta inscrição' });
        }

        const pendente = new Avaliacao({
            avaliadorId,
            eventoId,
            inscricaoId,
            notas: {},
            parecer: '',
            notaFinal: null,
            status: 'Pendente',
            modoDistribuicaoAplicado: 'manual',
            atribuicao: 'manual',
            ehConsolidacao: false
        });
        await pendente.save();

        res.json({ success: true, mensagem: 'Avaliador atribuído com sucesso', avaliacao: pendente });
    } catch (error) {
        logger.error('❌ [AVALIACOES] Erro em /atribuir-manual:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// POST /atribuir-manual-lote
// ============================================================================
router.post('/atribuir-manual-lote', authenticateAvaliador, async (req, res) => {
    try {
        const { eventoId, inscricaoId, avaliadoresIds } = req.body;

        if (!eventoId || !inscricaoId || !Array.isArray(avaliadoresIds) || avaliadoresIds.length === 0) {
            return res.status(400).json({ success: false, error: 'eventoId, inscricaoId e avaliadoresIds são obrigatórios' });
        }

        const evento = await Evento.findById(eventoId).populate('modeloId');
        if (!evento) return res.status(404).json({ success: false, error: 'Evento não encontrado' });

        if (!(await podeGerenciar(req.avaliadorId, evento))) {
            return res.status(403).json({ success: false, error: 'Acesso negado' });
        }

        const inscricao = await Inscricao.findById(inscricaoId);
        if (!inscricao) return res.status(404).json({ success: false, error: 'Inscrição não encontrada' });

        const cfg = await obterConfigEvento(evento, evento.modeloId);

        const jaAtribuidas = await Avaliacao.countDocuments({
            inscricaoId,
            ehConsolidacao: false
        });

        const criadas = [];
        const erros = [];

        for (const avId of avaliadoresIds) {
            if (jaAtribuidas + criadas.length >= cfg.numAvaliadores) {
                erros.push({ avaliadorId: avId, erro: `Limite de ${cfg.numAvaliadores} avaliação(ões) já atingido` });
                continue;
            }

            const avaliadorDestino = await Avaliador.findById(avId);
            if (!avaliadorDestino) {
                erros.push({ avaliadorId: avId, erro: 'Avaliador não encontrado' });
                continue;
            }

            const existente = await Avaliacao.findOne({
                avaliadorId: avId,
                inscricaoId,
                ehConsolidacao: false
            });
            if (existente) {
                erros.push({ avaliadorId: avId, erro: 'Já atribuído/avaliou' });
                continue;
            }

            const pendente = new Avaliacao({
                avaliadorId: avId,
                eventoId,
                inscricaoId,
                notas: {},
                parecer: '',
                notaFinal: null,
                status: 'Pendente',
                modoDistribuicaoAplicado: 'manual',
                atribuicao: 'manual',
                ehConsolidacao: false
            });
            await pendente.save();
            criadas.push(pendente._id);
        }

        res.json({
            success: true,
            mensagem: `${criadas.length} atribuição(ões) criada(s)`,
            criadas,
            erros
        });
    } catch (error) {
        logger.error('❌ [AVALIACOES] Erro em /atribuir-manual-lote:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// DELETE /atribuir-manual/:avaliacaoId
// ============================================================================
router.delete('/atribuir-manual/:avaliacaoId', authenticateAvaliador, async (req, res) => {
    try {
        const { avaliacaoId } = req.params;

        const avaliacao = await Avaliacao.findById(avaliacaoId).populate('eventoId');
        if (!avaliacao) return res.status(404).json({ success: false, error: 'Avaliação não encontrada' });

        if (avaliacao.status !== 'Pendente') {
            return res.status(400).json({ success: false, error: 'Só é possível remover atribuições pendentes' });
        }

        const evento = avaliacao.eventoId;
        if (!(await podeGerenciar(req.avaliadorId, evento))) {
            return res.status(403).json({ success: false, error: 'Acesso negado' });
        }

        await Avaliacao.findByIdAndDelete(avaliacaoId);
        res.json({ success: true, mensagem: 'Atribuição removida' });
    } catch (error) {
        logger.error('❌ [AVALIACOES] Erro ao remover atribuição:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// GET /coordenador-relatorio/:eventoId
// ============================================================================
router.get('/coordenador-relatorio/:eventoId', authenticateAvaliador, async (req, res) => {
    try {
        const { eventoId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(eventoId)) {
            return res.status(400).json({ success: false, error: 'ID inválido' });
        }

        const evento = await Evento.findById(eventoId).populate('modeloId');
        if (!evento) return res.status(404).json({ success: false, error: 'Evento não encontrado' });

        if (!(await podeGerenciar(req.avaliadorId, evento))) {
            return res.status(403).json({ success: false, error: 'Acesso negado' });
        }

        const cfg = await obterConfigEvento(evento, evento.modeloId);

        const avaliacoes = await Avaliacao.find({
            eventoId,
            ehConsolidacao: false,
            status: 'Concluída'
        })
            .populate({
                path: 'inscricaoId',
                populate: { path: 'participanteId', select: 'nomeCompleto email' }
            })
            .populate('avaliadorId', 'nomeCompleto email')
            .lean();

        const porInscricao = {};
        for (const av of avaliacoes) {
            const inscId = String(av.inscricaoId?._id || av.inscricaoId);
            if (!porInscricao[inscId]) {
                porInscricao[inscId] = { inscricao: av.inscricaoId, avaliacoes: [], somaNotas: 0 };
            }
            porInscricao[inscId].avaliacoes.push(av);
            porInscricao[inscId].somaNotas += (av.notaFinal || 0);
        }

        const relatorio = Object.values(porInscricao).map(item => {
            const quantidade = item.avaliacoes.length;
            const mediaFinal = quantidade > 0 ? (item.somaNotas / quantidade).toFixed(2) : '—';
            return {
                inscricao: item.inscricao,
                notas: item.avaliacoes.map(a => ({
                    avaliador: a.avaliadorId?.nomeCompleto || '—',
                    notaFinal: a.notaFinal,
                    notaFinalCalculada: a.notaFinalCalculada,
                    parecer: a.parecer,
                    createdAt: a.createdAt,
                    notas: a.notas || {},
                    assinaturaAvaliadorBase64: a.assinaturaAvaliadorBase64 || null,
                    atribuicao: a.atribuicao
                })),
                mediaFinal,
                quantidadeAvaliacoes: quantidade
            };
        });

        res.json({
            success: true,
            relatorio,
            configuracao: {
                numAvaliadores: cfg.numAvaliadores,
                modoDistribuicao: cfg.modoDistribuicao,
                calcularMedia: cfg.calcularMedia,
                tipoMedia: cfg.tipoMedia,
                exigeAssinaturaAvaliador: cfg.exigeAssinaturaAvaliador
            }
        });
    } catch (error) {
        logger.error('❌ [AVALIACOES] Erro em /coordenador-relatorio:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// GET /estatisticas/:eventoId
// ============================================================================
router.get('/estatisticas/:eventoId', authenticateAvaliador, async (req, res) => {
    try {
        const { eventoId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(eventoId)) {
            return res.status(400).json({ success: false, error: 'ID inválido' });
        }

        const evento = await Evento.findById(eventoId).populate('modeloId');
        if (!evento) return res.status(404).json({ success: false, error: 'Evento não encontrado' });

        if (!(await podeGerenciar(req.avaliadorId, evento))) {
            return res.status(403).json({ success: false, error: 'Acesso negado' });
        }

        const cfg = await obterConfigEvento(evento, evento.modeloId);

        const inscricoes = await Inscricao.find({
            eventoId,
            status: { $in: ['Pendente', 'Confirmada'] }
        })
            .populate('participanteId', 'nomeCompleto email')
            .sort({ createdAt: 1 })
            .lean();

        const avaliacoes = await Avaliacao.find({
            eventoId,
            ehConsolidacao: false
        })
            .populate('avaliadorId', 'nomeCompleto email')
            .lean();

        const porInscricao = {};
        avaliacoes.forEach(a => {
            const k = String(a.inscricaoId);
            if (!porInscricao[k]) porInscricao[k] = [];
            porInscricao[k].push(a);
        });

        const detalhes = inscricoes.map(i => {
            const avs = porInscricao[String(i._id)] || [];
            const concluidas = avs.filter(a => a.status === 'Concluída');
            const pendentes = avs.filter(a => a.status === 'Pendente');
            const somaNotas = concluidas.reduce((acc, a) => acc + (a.notaFinal || 0), 0);
            const media = concluidas.length > 0 ? parseFloat((somaNotas / concluidas.length).toFixed(2)) : null;
            const completo = concluidas.length >= cfg.numAvaliadores;

            return {
                inscricaoId: i._id,
                protocolo: i.protocolo,
                participante: i.participanteId?.nomeCompleto || '—',
                participanteEmail: i.participanteId?.email || '',
                statusInscricao: i.status,
                totalAvaliadores: concluidas.length,
                pendentes: pendentes.length,
                faltam: Math.max(0, cfg.numAvaliadores - concluidas.length),
                media,
                completo,
                avaliacoes: avs.map(a => ({
                    avaliacaoId: a._id,
                    avaliador: a.avaliadorId?.nomeCompleto || '—',
                    avaliadorEmail: a.avaliadorId?.email || '',
                    status: a.status,
                    notaFinal: a.notaFinal,
                    parecer: a.parecer || '',
                    notas: a.notas || {},
                    assinaturaAvaliadorBase64: a.assinaturaAvaliadorBase64 || null,
                    atribuicao: a.atribuicao,
                    createdAt: a.createdAt
                }))
            };
        });

        const totalInscricoes = detalhes.length;
        const comMedia = detalhes.filter(d => d.media !== null);
        const medias = comMedia.map(d => d.media);
        const somaMedias = medias.reduce((a, b) => a + b, 0);
        const mediaGeral = medias.length > 0 ? parseFloat((somaMedias / medias.length).toFixed(2)) : null;
        const maiorNota = medias.length > 0 ? Math.max(...medias) : null;
        const menorNota = medias.length > 0 ? Math.min(...medias) : null;

        const completaAvaliacoes = detalhes.filter(d => d.completo).length;
        const pendentesAvaliacao = detalhes.filter(d => !d.completo && d.totalAvaliadores > 0).length;
        const semAvaliacao = detalhes.filter(d => d.totalAvaliadores === 0).length;
        const totalAvaliacoesConcluidas = detalhes.reduce((acc, d) => acc + d.totalAvaliadores, 0);
        const totalAvaliacoesPendentes = detalhes.reduce((acc, d) => acc + d.pendentes, 0);

        res.json({
            success: true,
            resumo: {
                totalInscricoes,
                completaAvaliacoes,
                pendentesAvaliacao,
                semAvaliacao,
                totalAvaliacoesConcluidas,
                totalAvaliacoesPendentes,
                mediaGeral,
                maiorNota,
                menorNota
            },
            configuracao: {
                numAvaliadores: cfg.numAvaliadores,
                modoDistribuicao: cfg.modoDistribuicao,
                calcularMedia: cfg.calcularMedia,
                tipoMedia: cfg.tipoMedia,
                exigeAssinaturaAvaliador: cfg.exigeAssinaturaAvaliador,
                sorteioExecutadoEm: cfg.sorteioExecutadoEm
            },
            detalhes
        });
    } catch (error) {
        logger.error('❌ [AVALIACOES] Erro em /estatisticas:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;