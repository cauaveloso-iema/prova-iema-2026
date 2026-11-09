// ============================================================================
// CARDÁPIO - BACKEND UNIFICADO (🆕 CORRIGIDO — FUSO BRASÍLIA)
// ============================================================================

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

const Cardapio = require('../models/Cardapio');

// ============================================================================
// 🆕 HELPERS DE FUSO HORÁRIO BRASÍLIA (UTC-3)
// ============================================================================
/**
 * Retorna a data ATUAL no fuso de Brasília no formato YYYY-MM-DD.
 */
function getDataHojeBR() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date());
}

/**
 * Retorna a data de N dias atrás no fuso de Brasília (YYYY-MM-DD).
 */
function getDataNDiasBR(n) {
    const agora = new Date();
    const deslocada = new Date(agora.getTime() + n * 24 * 60 * 60 * 1000);
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(deslocada);
}

/**
 * Converte "YYYY-MM-DD" em Date no início do dia BRT (00:00 BRT = 03:00 UTC).
 */
function inicioDiaBR(dataStr) {
    return new Date(dataStr + 'T00:00:00.000-03:00');
}

/**
 * Converte "YYYY-MM-DD" em Date no fim do dia BRT (23:59:59 BRT = 02:59:59 UTC do dia seguinte).
 */
function fimDiaBR(dataStr) {
    return new Date(dataStr + 'T23:59:59.999-03:00');
}

/**
 * Calcula a segunda-feira e o domingo da semana BRT que contém a data dada.
 * @param {string} dataBR - "YYYY-MM-DD"
 * @returns { start: Date, end: Date, inicioStr: string, fimStr: string }
 */
function getSemanaBR(dataBR) {
    const base = inicioDiaBR(dataBR);
    const diaSemana = base.getUTCDay(); // 0=dom, 1=seg, ...
    const diasParaSegunda = diaSemana === 0 ? 6 : diaSemana - 1;

    const segunda = new Date(base.getTime() - diasParaSegunda * 24 * 60 * 60 * 1000);
    const domingo = new Date(segunda.getTime() + 6 * 24 * 60 * 60 * 1000);

    const segundaStr = segunda.toISOString().split('T')[0];
    const domingoStr = domingo.toISOString().split('T')[0];

    return {
        inicioStr: segundaStr,
        fimStr: domingoStr,
        start: inicioDiaBR(segundaStr),
        end: fimDiaBR(domingoStr)
    };
}

/**
 * Retorna o primeiro e o último dia do mês em BRT.
 */
function getRangeMesBR(ano, mes) {
    const mesStr = String(mes).padStart(2, '0');
    const inicioStr = `${ano}-${mesStr}-01`;
    const ultimoDia = new Date(ano, mes, 0).getDate();
    const fimStr = `${ano}-${mesStr}-${String(ultimoDia).padStart(2, '0')}`;
    return {
        inicioStr,
        fimStr,
        start: inicioDiaBR(inicioStr),
        end: fimDiaBR(fimStr)
    };
}

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
// GET /semana?mes=X&ano=Y&data=YYYY-MM-DD
// ============================================================================
router.get('/semana', authenticateToken, async (req, res) => {
    try {
        const { mes, ano, data } = req.query;

        // 🆕 CORREÇÃO: usa data em BRT
        let dataReferenciaBR;
        let semanaDoMesAtual;

        const hojeBR = getDataHojeBR();

        if (data) {
            // Se o cliente passou uma data específica
            dataReferenciaBR = data.includes('T') ? data.split('T')[0] : data;
            const [anoRef, mesRef] = dataReferenciaBR.split('-');
            semanaDoMesAtual = (dataReferenciaBR.substring(0, 7) === hojeBR.substring(0, 7));
        } else if (mes && ano) {
            const mesNum = parseInt(mes, 10);
            const anoNum = parseInt(ano, 10);
            const mesStr = String(mesNum).padStart(2, '0');
            const [anoHoje, mesHoje] = hojeBR.split('-').map(Number);
            semanaDoMesAtual = (mesNum === mesHoje && anoNum === anoHoje);

            // Se é o mês atual, usa hoje. Senão usa o primeiro dia do mês.
            if (semanaDoMesAtual) {
                dataReferenciaBR = hojeBR;
            } else {
                dataReferenciaBR = `${anoNum}-${mesStr}-01`;
            }
        } else {
            dataReferenciaBR = hojeBR;
            semanaDoMesAtual = true;
        }

        // 🆕 Calcula segunda/domingo da semana em BRT
        const semana = getSemanaBR(dataReferenciaBR);

        const cardapios = await Cardapio.find({
            dataReferencia: { $gte: semana.start, $lte: semana.end }
        })
            .populate('criadoPor', 'nome email role')
            .sort({ dataReferencia: 1 })
            .lean();

        res.json({
            success: true,
            cardapios: cardapios.map(formatarCardapio),
            periodo: {
                inicio: semana.start,
                fim: semana.end,
                inicioFormatado: semana.inicioStr,
                fimFormatado: semana.fimStr
            },
            dataReferencia: dataReferenciaBR,
            semanaDoMesAtual,
            _debug: { hojeBR, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }
        });
    } catch (error) {
        console.error('❌ [cardapio/semana]', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// GET /hoje (🆕 CORRIGIDO — data BRT)
// ============================================================================
router.get('/hoje', authenticateToken, async (req, res) => {
    try {
        // 🆕 CORREÇÃO: "hoje" é o dia em BRT, não em UTC
        const hojeBR = getDataHojeBR();
        const inicioHoje = inicioDiaBR(hojeBR);
        const fimHoje = fimDiaBR(hojeBR);

        const cardapio = await Cardapio.findOne({
            dataReferencia: { $gte: inicioHoje, $lte: fimHoje }
        })
            .populate('criadoPor', 'nome email role')
            .lean();

        res.json({
            success: true,
            cardapio: cardapio ? formatarCardapio(cardapio) : null,
            dataReferencia: hojeBR,
            _debug: {
                hojeBR,
                inicioHoje: inicioHoje.toISOString(),
                fimHoje: fimHoje.toISOString()
            }
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
            // 🆕 CORREÇÃO: usa range em BRT
            const mesNum = parseInt(mes, 10);
            const anoNum = parseInt(ano, 10);
            const range = getRangeMesBR(anoNum, mesNum);
            query.dataReferencia = { $gte: range.start, $lte: range.end };
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
            // 🆕 CORREÇÃO: range em BRT
            const mesNum = parseInt(mes, 10);
            const anoNum = parseInt(ano, 10);
            const range = getRangeMesBR(anoNum, mesNum);
            query.dataReferencia = { $gte: range.start, $lte: range.end };
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
// POST /admin (🆕 CORRIGIDO — dataReferencia em BRT)
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

        // 🆕 CORREÇÃO: usa data pura (YYYY-MM-DD) em BRT meio-dia
        const dataStr = dataReferencia.includes('T') 
            ? dataReferencia.split('T')[0] 
            : dataReferencia;

        if (!/^\d{4}-\d{2}-\d{2}$/.test(dataStr)) {
            return res.status(400).json({ success: false, error: 'Data inválida. Use YYYY-MM-DD.' });
        }

        // Meio-dia BRT = 15:00 UTC (evita problema de virada de dia)
        const dataRef = new Date(dataStr + 'T12:00:00.000-03:00');

        if (isNaN(dataRef.getTime())) {
            return res.status(400).json({ success: false, error: 'Data inválida' });
        }

        const semanaFinal = semanaLabel || calcularSemanaLabel(dataRef);

        // Verifica duplicidade comparando por dia (range BRT)
        const inicioDia = inicioDiaBR(dataStr);
        const fimDia = fimDiaBR(dataStr);

        const existente = await Cardapio.findOne({
            dataReferencia: { $gte: inicioDia, $lte: fimDia }
        });

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
                    detalhes: { dataReferencia: dataStr, semanaLabel: semanaFinal }
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
// PUT /admin/:id (🆕 CORRIGIDO — dataReferencia em BRT)
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
            const dataStr = dataReferencia.includes('T') 
                ? dataReferencia.split('T')[0] 
                : dataReferencia;

            if (!/^\d{4}-\d{2}-\d{2}$/.test(dataStr)) {
                return res.status(400).json({ success: false, error: 'Data inválida' });
            }

            // 🆕 Meio-dia BRT
            const novaData = new Date(dataStr + 'T12:00:00.000-03:00');

            if (isNaN(novaData.getTime())) {
                return res.status(400).json({ success: false, error: 'Data inválida' });
            }

            // Verifica se mudou o dia (comparação por string YYYY-MM-DD em BRT)
            const dataAtualStr = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'America/Sao_Paulo',
                year: 'numeric', month: '2-digit', day: '2-digit'
            }).format(cardapio.dataReferencia);

            if (dataStr !== dataAtualStr) {
                // Verifica conflito em range BRT
                const inicio = inicioDiaBR(dataStr);
                const fim = fimDiaBR(dataStr);

                const conflito = await Cardapio.findOne({
                    dataReferencia: { $gte: inicio, $lte: fim },
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