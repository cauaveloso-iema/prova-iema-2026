// ============================================================================
// CARDÁPIO - BACKEND UNIFICADO
// ============================================================================

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

const Cardapio = require('../models/Cardapio');

// ============================================================================
// MIDDLEWARES
// ============================================================================

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

const verificarPermissaoGestao = (req, res, next) => {
    const permitidos = ['gestao-adm', 'admin', 'super_admin'];
    if (permitidos.includes(req.userRole)) return next();
    return res.status(403).json({ success: false, error: 'Sem permissão para esta ação' });
};

// ============================================================================
// HELPERS
// ============================================================================

function calcularSemanaLabel(data) {
    const d = new Date(data);
    const dia = d.getDate();
    if (dia <= 7)  return 'SEMANA 1';
    if (dia <= 14) return 'SEMANA 2';
    if (dia <= 21) return 'SEMANA 3';
    if (dia <= 28) return 'SEMANA 4';
    return 'SEMANA 5';
}

function formatarCardapio(c) {
    if (!c) return null;
    return {
        id: c._id,
        dataReferencia: c.dataReferencia,
        semanaLabel: c.semanaLabel,
        lancamentoManha: c.lancamentoManha,
        almoco: c.almoco,
        lancamentoTarde: c.lancamentoTarde,
        informacoesNutricionais: c.informacoesNutricionais || {},
        cor: c.cor || '#0f766e',
        notificacaoAtivada: c.notificacaoAtivada,
        notificacoes: c.notificacoes || [],
        criadoPor: c.criadoPor ? {
            id: c.criadoPor._id || c.criadoPor.id,
            nome: c.criadoPor.nome,
            email: c.criadoPor.email,
            role: c.criadoPor.role
        } : null,
        atualizadoPor: c.atualizadoPor ? {
            id: c.atualizadoPor._id || c.atualizadoPor.id,
            nome: c.atualizadoPor.nome
        } : null,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt
    };
}

// ============================================================================
// GET /semana?mes=X&ano=Y
// ============================================================================
router.get('/semana', authenticateToken, async (req, res) => {
    try {
        const { mes, ano } = req.query;
        const hoje = new Date();
        const mesAtual = hoje.getMonth() + 1;
        const anoAtual = hoje.getFullYear();

        let referencia;
        let semanaDoMesAtual;

        if (mes && ano) {
            const mesNum = parseInt(mes, 10);
            const anoNum = parseInt(ano, 10);
            semanaDoMesAtual = (mesNum === mesAtual && anoNum === anoAtual);
            referencia = semanaDoMesAtual
                ? new Date(hoje)
                : new Date(anoNum, mesNum - 1, 1);
        } else {
            referencia = new Date(hoje);
            semanaDoMesAtual = true;
        }

        const diaSemana = referencia.getDay();
        const diasDesdeSegunda = diaSemana === 0 ? 6 : diaSemana - 1;

        const segunda = new Date(referencia);
        segunda.setDate(referencia.getDate() - diasDesdeSegunda);
        segunda.setUTCHours(0, 0, 0, 0);

        const domingo = new Date(segunda);
        domingo.setUTCDate(segunda.getUTCDate() + 6);
        domingo.setUTCHours(23, 59, 59, 999);

        const cardapios = await Cardapio.find({
            dataReferencia: { $gte: segunda, $lte: domingo }
        })
            .populate('criadoPor', 'nome email role')
            .sort({ dataReferencia: 1 })
            .lean();

        res.json({
            success: true,
            cardapios: cardapios.map(formatarCardapio),
            periodo: { inicio: segunda, fim: domingo },
            semanaDoMesAtual
        });
    } catch (error) {
        console.error('❌ [cardapio/semana]', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// GET /hoje
// ============================================================================
router.get('/hoje', authenticateToken, async (req, res) => {
    try {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const amanha = new Date(hoje);
        amanha.setDate(hoje.getDate() + 1);

        const cardapio = await Cardapio.findOne({
            dataReferencia: { $gte: hoje, $lt: amanha }
        })
            .populate('criadoPor', 'nome email role')
            .lean();

        res.json({
            success: true,
            cardapio: cardapio ? formatarCardapio(cardapio) : null
        });
    } catch (error) {
        console.error('❌ [cardapio/hoje]', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// GET /lista?mes=X&ano=Y
// ============================================================================
router.get('/lista', authenticateToken, async (req, res) => {
    try {
        const { mes, ano, limit = 300 } = req.query;
        const query = {};

        if (mes && ano) {
            const mesNum = parseInt(mes, 10);
            const anoNum = parseInt(ano, 10);
            const inicio = new Date(anoNum, mesNum - 1, 1, 0, 0, 0);
            const fim = new Date(anoNum, mesNum, 0, 23, 59, 59, 999);
            query.dataReferencia = { $gte: inicio, $lte: fim };
        }

        const cardapios = await Cardapio.find(query)
            .populate('criadoPor', 'nome email role')
            .populate('atualizadoPor', 'nome email')
            .sort({ dataReferencia: 1 })
            .limit(parseInt(limit, 10))
            .lean();

        res.json({
            success: true,
            cardapios: cardapios.map(formatarCardapio),
            total: cardapios.length
        });
    } catch (error) {
        console.error('❌ [cardapio/lista]', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// GET /admin/listar
// ============================================================================
router.get('/admin/listar', authenticateToken, verificarPermissaoGestao, async (req, res) => {
    try {
        const { mes, ano, limit = 300 } = req.query;
        const query = {};

        if (mes && ano) {
            const mesNum = parseInt(mes, 10);
            const anoNum = parseInt(ano, 10);
            const inicio = new Date(anoNum, mesNum - 1, 1, 0, 0, 0);
            const fim = new Date(anoNum, mesNum, 0, 23, 59, 59, 999);
            query.dataReferencia = { $gte: inicio, $lte: fim };
        }

        const cardapios = await Cardapio.find(query)
            .populate('criadoPor', 'nome email role')
            .populate('atualizadoPor', 'nome email')
            .sort({ dataReferencia: 1 })
            .limit(parseInt(limit, 10))
            .lean();

        res.json({
            success: true,
            cardapios: cardapios.map(formatarCardapio),
            total: cardapios.length
        });
    } catch (error) {
        console.error('❌ [cardapio/admin/listar]', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// POST /admin
// ============================================================================
router.post('/admin', authenticateToken, verificarPermissaoGestao, async (req, res) => {
    try {
        const {
            dataReferencia, semanaLabel, lancamentoManha,
            almoco, lancamentoTarde, informacoesNutricionais
        } = req.body;

        if (!dataReferencia || !lancamentoManha || !almoco || !lancamentoTarde) {
            return res.status(400).json({
                success: false,
                error: 'Preencha os campos obrigatórios: data, manhã, almoço, tarde'
            });
        }

        const dataRef = new Date(dataReferencia);
        dataRef.setHours(0, 0, 0, 0);

        const semanaFinal = semanaLabel || calcularSemanaLabel(dataRef);

        const existente = await Cardapio.findOne({ dataReferencia: dataRef });
        if (existente) {
            return res.status(409).json({
                success: false,
                error: 'Já existe um cardápio cadastrado para esta data'
            });
        }

        const cardapio = await Cardapio.create({
            dataReferencia: dataRef,
            semanaLabel: semanaFinal,
            lancamentoManha: lancamentoManha.trim(),
            almoco: almoco.trim(),
            lancamentoTarde: lancamentoTarde.trim(),
            informacoesNutricionais: informacoesNutricionais || {},
            criadoPor: req.userId,
            monitoramento: {
                logs: [{
                    acao: 'criar',
                    usuarioId: req.userId,
                    timestamp: new Date(),
                    detalhes: { dataReferencia, semanaLabel: semanaFinal }
                }]
            }
        });

        const populado = await Cardapio.findById(cardapio._id)
            .populate('criadoPor', 'nome email role')
            .lean();

        res.status(201).json({
            success: true,
            message: 'Cardápio criado com sucesso!',
            cardapio: formatarCardapio(populado)
        });
    } catch (error) {
        console.error('❌ [POST cardapio/admin]', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// PUT /admin/:id
// ============================================================================
router.put('/admin/:id', authenticateToken, verificarPermissaoGestao, async (req, res) => {
    try {
        const cardapio = await Cardapio.findById(req.params.id);
        if (!cardapio) {
            return res.status(404).json({ success: false, error: 'Cardápio não encontrado' });
        }

        const {
            dataReferencia, semanaLabel, lancamentoManha,
            almoco, lancamentoTarde, informacoesNutricionais
        } = req.body;

        if (dataReferencia) {
            const novaData = new Date(dataReferencia);
            novaData.setHours(0, 0, 0, 0);

            if (novaData.getTime() !== cardapio.dataReferencia.getTime()) {
                const conflito = await Cardapio.findOne({
                    dataReferencia: novaData,
                    _id: { $ne: cardapio._id }
                });
                if (conflito) {
                    return res.status(409).json({
                        success: false,
                        error: 'Já existe outro cardápio nesta data'
                    });
                }
            }
            cardapio.dataReferencia = novaData;
        }

        if (semanaLabel) cardapio.semanaLabel = semanaLabel;
        if (lancamentoManha !== undefined) cardapio.lancamentoManha = lancamentoManha.trim();
        if (almoco !== undefined) cardapio.almoco = almoco.trim();
        if (lancamentoTarde !== undefined) cardapio.lancamentoTarde = lancamentoTarde.trim();
        if (informacoesNutricionais !== undefined) cardapio.informacoesNutricionais = informacoesNutricionais;

        cardapio.atualizadoPor = req.userId;
        if (!cardapio.monitoramento) cardapio.monitoramento = { logs: [] };
        cardapio.monitoramento.logs.push({
            acao: 'editar',
            usuarioId: req.userId,
            timestamp: new Date(),
            detalhes: { campos: Object.keys(req.body) }
        });

        await cardapio.save();

        const populado = await Cardapio.findById(cardapio._id)
            .populate('criadoPor', 'nome email role')
            .populate('atualizadoPor', 'nome email')
            .lean();

        res.json({
            success: true,
            message: 'Cardápio atualizado!',
            cardapio: formatarCardapio(populado)
        });
    } catch (error) {
        console.error('❌ [PUT cardapio/admin]', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// DELETE /admin/:id
// ============================================================================
router.delete('/admin/:id', authenticateToken, verificarPermissaoGestao, async (req, res) => {
    try {
        const cardapio = await Cardapio.findByIdAndDelete(req.params.id);
        if (!cardapio) {
            return res.status(404).json({ success: false, error: 'Cardápio não encontrado' });
        }
        res.json({ success: true, message: 'Cardápio excluído!' });
    } catch (error) {
        console.error('❌ [DELETE cardapio/admin]', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// GET /:id (última)
// ============================================================================
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        if (['semana', 'hoje', 'lista', 'admin'].includes(req.params.id)) {
            return res.status(400).json({ success: false, error: 'Rota inválida' });
        }

        const cardapio = await Cardapio.findById(req.params.id)
            .populate('criadoPor', 'nome email role')
            .populate('atualizadoPor', 'nome email')
            .lean();

        if (!cardapio) {
            return res.status(404).json({ success: false, error: 'Cardápio não encontrado' });
        }

        res.json({ success: true, cardapio: formatarCardapio(cardapio) });
    } catch (error) {
        console.error('❌ [cardapio/:id]', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;