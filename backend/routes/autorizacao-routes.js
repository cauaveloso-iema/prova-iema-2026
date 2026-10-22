// backend/routes/autorizacao-routes.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

// ============================================
// 🔥 LAZY LOADING
// ============================================
function getUser() { return require('../models/User'); }
function getAutorizacao() { return require('../models/Autorizacao'); }

// ============================================
// 🔥 HELPERS
// ============================================
function inicioDoDiaBrasil(dataStr) {
    return new Date(dataStr + 'T00:00:00.000-03:00');
}

function fimDoDiaBrasil(dataStr) {
    return new Date(dataStr + 'T23:59:59.999-03:00');
}

function construirFiltroOverlap(inicio, fim) {
    return {
        $or: [
            {
                periodoFaltaInicio: { $lte: fim },
                periodoFaltaFim: { $gte: inicio }
            },
            {
                periodoFaltaInicio: { $gte: inicio, $lte: fim },
                $or: [
                    { periodoFaltaFim: null },
                    { periodoFaltaFim: { $exists: false } }
                ]
            },
            {
                $or: [
                    { periodoFaltaInicio: null },
                    { periodoFaltaInicio: { $exists: false } }
                ],
                data: { $gte: inicio, $lte: fim }
            }
        ]
    };
}

function construirFiltroOverlapUniforme(inicio, fim) {
    return {
        $or: [
            {
                uniformePeriodoInicio: { $lte: fim },
                uniformePeriodoFim: { $gte: inicio }
            },
            {
                uniformePeriodoInicio: { $gte: inicio, $lte: fim },
                $or: [
                    { uniformePeriodoFim: null },
                    { uniformePeriodoFim: { $exists: false } }
                ]
            },
            {
                $or: [
                    { uniformePeriodoInicio: null },
                    { uniformePeriodoInicio: { $exists: false } }
                ],
                data: { $gte: inicio, $lte: fim }
            }
        ]
    };
}

function construirFiltroData(dataInicio, dataFim, filtrarPorPeriodoFalta, tipo = null) {
    if (!dataInicio && !dataFim) return null;
    
    const inicio = dataInicio ? inicioDoDiaBrasil(dataInicio) : new Date('1970-01-01');
    const fim = dataFim ? fimDoDiaBrasil(dataFim) : new Date();
    
    if (tipo === 'uniforme' && filtrarPorPeriodoFalta === 'true') {
        return construirFiltroOverlapUniforme(inicio, fim);
    }
    
    if (filtrarPorPeriodoFalta === 'true') {
        return construirFiltroOverlap(inicio, fim);
    }
    
    return {
        data: {
            $gte: inicio,
            $lte: fim
        }
    };
}

function getPeriodoFaltaFormatado(doc) {
    if (!doc || !doc.periodoFaltaInicio) return null;
    
    const ini = new Date(doc.periodoFaltaInicio);
    const fim = doc.periodoFaltaFim ? new Date(doc.periodoFaltaFim) : ini;
    
    const iniDia = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate());
    const fimDia = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate());
    
    const fmt = (d) => d.toLocaleDateString('pt-BR');
    
    if (iniDia.getTime() === fimDia.getTime()) return fmt(iniDia);
    return `${fmt(iniDia)} a ${fmt(fimDia)}`;
}

function getTipoProvaPerdidaFormatado(doc) {
    if (!doc || !doc.tipoProvaPerdida) return null;
    if (doc.tipoProvaPerdida === 'Outros' && doc.tipoProvaPerdidaOutros) {
        return `Outros (${doc.tipoProvaPerdidaOutros})`;
    }
    return doc.tipoProvaPerdida;
}

function getPeriodoProvaFormatado(doc) {
    if (!doc || !doc.periodoProva) return null;
    return doc.periodoProva;
}

function getUniformePeriodoFormatado(doc) {
    if (!doc || !doc.uniformePeriodoInicio) return null;
    const ini = new Date(doc.uniformePeriodoInicio);
    const fim = doc.uniformePeriodoFim ? new Date(doc.uniformePeriodoFim) : ini;
    const iniDia = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate());
    const fimDia = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate());
    const fmt = (d) => d.toLocaleDateString('pt-BR');
    if (iniDia.getTime() === fimDia.getTime()) return fmt(iniDia);
    return `${fmt(iniDia)} a ${fmt(fimDia)}`;
}

function getEntradaCompleta(doc) {
    if (!doc) return null;
    const temData = !!doc.dataEntrada;
    const temHora = !!(doc.horarioEntrada && doc.horarioEntrada.trim());
    if (!temData && !temHora) return null;
    const partes = [];
    if (temData) partes.push(new Date(doc.dataEntrada).toLocaleDateString('pt-BR'));
    if (temHora) partes.push(temData ? `às ${doc.horarioEntrada}` : doc.horarioEntrada);
    return partes.join(' ');
}

function getSaidaCompleta(doc) {
    if (!doc) return null;
    const temData = !!doc.dataSaida;
    const temHora = !!(doc.horarioSaida && doc.horarioSaida.trim());
    if (!temData && !temHora) return null;
    const partes = [];
    if (temData) partes.push(new Date(doc.dataSaida).toLocaleDateString('pt-BR'));
    if (temHora) partes.push(temData ? `às ${doc.horarioSaida}` : doc.horarioSaida);
    return partes.join(' ');
}

function extrairPeriodoFalta(body) {
    const { periodoFaltaInicio, periodoFaltaFim } = body;
    
    let dataInicio = null;
    let dataFim = null;
    
    if (periodoFaltaInicio) {
        dataInicio = new Date(periodoFaltaInicio + 'T12:00:00.000-03:00');
        if (isNaN(dataInicio.getTime())) return { error: 'Data inicial da falta inválida' };
    }
    
    if (periodoFaltaFim) {
        dataFim = new Date(periodoFaltaFim + 'T12:00:00.000-03:00');
        if (isNaN(dataFim.getTime())) return { error: 'Data final da falta inválida' };
    }
    
    if (dataInicio && dataFim && dataFim < dataInicio) {
        return { error: 'Data final não pode ser anterior à data inicial' };
    }
    
    if (dataInicio && !dataFim) dataFim = dataInicio;
    
    return { dataInicio, dataFim };
}

function extrairPeriodoUniforme(body) {
    const { uniformePeriodoInicio, uniformePeriodoFim } = body;
    
    let dataInicio = null;
    let dataFim = null;
    
    if (uniformePeriodoInicio) {
        dataInicio = new Date(uniformePeriodoInicio + 'T12:00:00.000-03:00');
        if (isNaN(dataInicio.getTime())) return { error: 'Data inicial do uniforme inválida' };
    }
    
    if (uniformePeriodoFim) {
        dataFim = new Date(uniformePeriodoFim + 'T12:00:00.000-03:00');
        if (isNaN(dataFim.getTime())) return { error: 'Data final do uniforme inválida' };
    }
    
    if (dataInicio && dataFim && dataFim < dataInicio) {
        return { error: 'Data final do uniforme não pode ser anterior à data inicial' };
    }
    
    if (dataInicio && !dataFim) dataFim = dataInicio;
    
    return { dataInicio, dataFim };
}

function extrairDatasEntradaSaida(body) {
    const { dataEntrada, dataSaida } = body;
    
    let dataEntradaFinal = null;
    let dataSaidaFinal = null;
    
    if (dataEntrada) {
        const d = new Date(dataEntrada + 'T12:00:00.000-03:00');
        if (!isNaN(d.getTime())) dataEntradaFinal = d;
    }
    
    if (dataSaida) {
        const d = new Date(dataSaida + 'T12:00:00.000-03:00');
        if (!isNaN(d.getTime())) dataSaidaFinal = d;
    }
    
    return { dataEntradaFinal, dataSaidaFinal };
}

function validarCPF(cpf) {
    if (!cpf || typeof cpf !== 'string') return { valido: false, erro: 'CPF não informado' };
    
    const cpfLimpo = cpf.replace(/\D/g, '');
    
    if (cpfLimpo.length !== 11) {
        return { valido: false, erro: 'CPF deve conter 11 dígitos' };
    }
    
    if (/^(\d)\1{10}$/.test(cpfLimpo)) {
        return { valido: false, erro: 'CPF inválido' };
    }
    
    return { valido: true, cpfLimpo };
}

function tipoExigeCPF(tipo) {
    return tipo === 'justificativa' || tipo === 'segunda_chamada';
}

// ============================================
// MIDDLEWARES
// ============================================
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.status(401).json({ success: false, error: 'Token não fornecido.' });
    
    jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
        if (err) return res.status(403).json({ success: false, error: 'Token inválido.' });
        
        try {
            const User = require('../models/User');
            const user = await User.findById(decoded.id).select('email nome role');
            if (!user) return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
            
            req.userId = user._id;
            req.userRole = user.role;
            req.userNome = user.nome;
            req.userEmail = user.email;
            next();
        } catch (dbError) {
            return res.status(500).json({ success: false, error: 'Erro ao autenticar' });
        }
    });
};

const verificarGestaoGeral = (req, res, next) => {
    const allowedRoles = ['gestao_geral', 'super_admin', 'admin', 'setor_pedagogico'];
    if (!allowedRoles.includes(req.userRole)) {
        return res.status(403).json({ success: false, error: 'Acesso permitido apenas para Gestão Geral' });
    }
    next();
};

const MOTIVOS_POR_TIPO = {
    'autorizacao': [
        'problemas_pessoais', 'problemas_saude_responsavel_buscou',
        'problemas_saude_responsavel_whatsapp', 'necessita_ausentar_retornar',
        'viagens', 'consultas', 'outros'
    ],
    'justificativa': ['problemas_pessoais', 'problemas_saude', 'viagem', 'outros'],
    'segunda_chamada': ['problemas_pessoais', 'problemas_saude', 'viagem', 'outros'],
    'uniforme': ['problemas_saude', 'problemas_pessoais', 'tratamento_medico', 'outros']
};

const TIPOS_PROVA_VALIDOS = ['AV1', 'AV2', 'AV3', 'AV4', 'Recuperação', 'Outros'];
const PERIODOS_PROVA_VALIDOS = ['1º Período', '2º Período', '3º Período', '4º Período'];

// ============================================
// 1. HEALTH
// ============================================
router.get('/health', (req, res) => {
    res.json({ success: true, status: 'online', service: 'Autorização/Justificativa/2ª Chamada/Uniforme' });
});

// ============================================
// 2. TURMAS
// ============================================
router.get('/turmas', authenticateToken, verificarGestaoGeral, async (req, res) => {
    try {
        const User = getUser();
        const turmas = await User.distinct('turma', {
            role: 'aluno', ativo: true,
            turma: { $nin: [null, '', 'Não informada'] }
        });
        res.json({ success: true, turmas: turmas.sort() });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 3. ALUNOS POR TURMA
// ============================================
router.get('/alunos-por-turma', authenticateToken, verificarGestaoGeral, async (req, res) => {
    try {
        const User = getUser();
        const { turma } = req.query;
        if (!turma) return res.status(400).json({ success: false, error: 'Turma é obrigatória' });

        const alunos = await User.find({ role: 'aluno', ativo: true, turma })
            .select('nome matricula turma curso fotoPerfil').sort({ nome: 1 });

        res.json({
            success: true,
            total: alunos.length,
            alunos: alunos.map(a => ({
                id: a._id, nome: a.nome, matricula: a.matricula,
                turma: a.turma, curso: a.curso, fotoPerfil: a.fotoPerfil
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 4. DASHBOARD
// ============================================
router.get('/dashboard', authenticateToken, verificarGestaoGeral, async (req, res) => {
    try {
        const Autorizacao = getAutorizacao();
        const { tipo = 'autorizacao' } = req.query;
        const hoje = new Date();
        const hojeStr = hoje.toISOString().split('T')[0];
        const inicioSemana = new Date(hoje);
        inicioSemana.setDate(hoje.getDate() - hoje.getDay());
        const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        const ultimos30Dias = new Date();
        ultimos30Dias.setDate(ultimos30Dias.getDate() - 30);

        let hojeCount;
        if (tipo === 'uniforme') {
            hojeCount = await Autorizacao.countDocuments({
                tipo,
                uniformePeriodoInicio: { $ne: null },
                uniformePeriodoFim: { $ne: null },
                uniformePeriodoInicio: { $lte: fimDoDiaBrasil(hojeStr) },
                uniformePeriodoFim: { $gte: inicioDoDiaBrasil(hojeStr) }
            });
        } else {
            hojeCount = await Autorizacao.countDocuments({
                tipo,
                data: { $gte: inicioDoDiaBrasil(hojeStr), $lte: fimDoDiaBrasil(hojeStr) }
            });
        }

        const [semanaCount, mesCount, total, comAssinatura] = await Promise.all([
            Autorizacao.countDocuments({ tipo, data: { $gte: inicioSemana } }),
            Autorizacao.countDocuments({ tipo, data: { $gte: inicioMes } }),
            Autorizacao.countDocuments({ tipo }),
            Autorizacao.countDocuments({ tipo, temAssinatura: true })
        ]);

        const porMotivo = await Autorizacao.aggregate([
            { $match: { tipo, data: { $gte: ultimos30Dias } } },
            { $group: { _id: '$motivo', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        let porTipoProva = [];
        let porPeriodoProva = [];
        let porPeriodoUniforme = [];

        if (tipo === 'segunda_chamada') {
            porTipoProva = await Autorizacao.aggregate([
                { $match: { tipo, data: { $gte: ultimos30Dias }, tipoProvaPerdida: { $ne: null } } },
                { $group: { _id: '$tipoProvaPerdida', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]);
            porPeriodoProva = await Autorizacao.aggregate([
                { $match: { tipo, data: { $gte: ultimos30Dias }, periodoProva: { $ne: null } } },
                { $group: { _id: '$periodoProva', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]);
        }

        if (tipo === 'uniforme') {
            porPeriodoUniforme = await Autorizacao.aggregate([
                { 
                    $match: { 
                        tipo, 
                        data: { $gte: ultimos30Dias },
                        uniformePeriodoInicio: { $ne: null }
                    } 
                },
                {
                    $group: {
                        _id: {
                            ano: { $year: '$uniformePeriodoInicio' },
                            mes: { $month: '$uniformePeriodoInicio' }
                        },
                        count: { $sum: 1 }
                    }
                },
                { $sort: { '_id.ano': -1, '_id.mes': -1 } }
            ]);
        }

        const ultimos7Dias = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const diaStr = d.toISOString().split('T')[0];

            const count = await Autorizacao.countDocuments({
                tipo,
                data: { $gte: inicioDoDiaBrasil(diaStr), $lte: fimDoDiaBrasil(diaStr) }
            });

            ultimos7Dias.push({
                dia: d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' }),
                data: diaStr,
                atrasos: count
            });
        }

        const porTurma = await Autorizacao.aggregate([
            { $match: { tipo, data: { $gte: ultimos30Dias } } },
            { $group: { _id: '$alunoTurma', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);

        const alunosReincidentes = await Autorizacao.aggregate([
            { $match: { tipo, data: { $gte: ultimos30Dias } } },
            {
                $group: {
                    _id: '$alunoId',
                    alunoNome: { $first: '$alunoNome' },
                    alunoTurma: { $first: '$alunoTurma' },
                    count: { $sum: 1 }
                }
            },
            { $match: { count: { $gte: 3 } } },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);

        res.json({
            success: true,
            tipo,
            metricas: { hoje: hojeCount, semana: semanaCount, mes: mesCount, total, comAssinatura },
            porMotivo: porMotivo.map(m => ({
                motivo: m._id,
                label: Autorizacao.getMotivoLabel(m._id, tipo),
                count: m.count
            })),
            porTipoProva: porTipoProva.map(t => ({
                tipoProva: t._id, label: t._id, count: t.count
            })),
            porPeriodoProva: porPeriodoProva.map(p => ({
                periodoProva: p._id, label: p._id, count: p.count
            })),
            porPeriodoUniforme: porPeriodoUniforme.map(p => {
                const mes = String(p._id.mes).padStart(2, '0');
                return {
                    periodo: `${mes}/${p._id.ano}`,
                    label: `${mes}/${p._id.ano}`,
                    count: p.count
                };
            }),
            tendencias: {
                ultimos7Dias,
                porTurma: porTurma.map(t => ({ turma: t._id || 'Sem turma', count: t.count })),
                alunosReincidentes: alunosReincidentes.map(a => ({
                    alunoNome: a.alunoNome, alunoTurma: a.alunoTurma, count: a.count
                }))
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 5. RELATÓRIO GERAL
// ============================================
router.get('/relatorio/geral', authenticateToken, verificarGestaoGeral, async (req, res) => {
    try {
        const Autorizacao = getAutorizacao();
        const { 
            tipo = 'autorizacao', 
            dataInicio, 
            dataFim, 
            filtrarPorPeriodoFalta, 
            tipoProvaPerdida, 
            periodoProva 
        } = req.query;

        let matchStage = { tipo };
        
        const filtroData = construirFiltroData(dataInicio, dataFim, filtrarPorPeriodoFalta, tipo);
        if (filtroData) {
            Object.assign(matchStage, filtroData);
        }
        
        if (tipoProvaPerdida && tipoProvaPerdida !== 'todos') {
            matchStage.tipoProvaPerdida = tipoProvaPerdida;
        }
        if (periodoProva && periodoProva !== 'todos') {
            matchStage.periodoProva = periodoProva;
        }

        const [total, comAssinatura, porMotivo, porTurma, registros] = await Promise.all([
            Autorizacao.countDocuments(matchStage),
            Autorizacao.countDocuments({ ...matchStage, temAssinatura: true }),
            Autorizacao.aggregate([
                { $match: matchStage },
                { $group: { _id: '$motivo', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]),
            Autorizacao.aggregate([
                { $match: matchStage },
                {
                    $group: {
                        _id: '$alunoTurma',
                        total: { $sum: 1 },
                        alunos: { $addToSet: '$alunoId' }
                    }
                },
                { $sort: { total: -1 } }
            ]),
            Autorizacao.find(matchStage)
                .select('-assinaturaBase64')
                .sort({ data: -1 })
                .limit(1000)
        ]);

        let porTipoProva = [];
        let porPeriodoProva = [];
        let porPeriodoUniforme = [];

        if (tipo === 'segunda_chamada') {
            porTipoProva = await Autorizacao.aggregate([
                { $match: { ...matchStage, tipoProvaPerdida: { $ne: null } } },
                { $group: { _id: '$tipoProvaPerdida', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]);
            porPeriodoProva = await Autorizacao.aggregate([
                { $match: { ...matchStage, periodoProva: { $ne: null } } },
                { $group: { _id: '$periodoProva', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]);
        }

        if (tipo === 'uniforme') {
            porPeriodoUniforme = await Autorizacao.aggregate([
                { $match: { ...matchStage, uniformePeriodoInicio: { $ne: null } } },
                {
                    $group: {
                        _id: {
                            ano: { $year: '$uniformePeriodoInicio' },
                            mes: { $month: '$uniformePeriodoInicio' }
                        },
                        count: { $sum: 1 }
                    }
                },
                { $sort: { '_id.ano': -1, '_id.mes': -1 } }
            ]);
        }

        res.json({
            success: true,
            tipo,
            totalRegistros: total,
            comAssinatura,
            porMotivo: porMotivo.map(m => ({
                motivo: m._id,
                label: Autorizacao.getMotivoLabel(m._id, tipo),
                count: m.count
            })),
            porTipoProva: porTipoProva.map(t => ({
                tipoProva: t._id, label: t._id, count: t.count
            })),
            porPeriodoProva: porPeriodoProva.map(p => ({
                periodoProva: p._id, label: p._id, count: p.count
            })),
            porPeriodoUniforme: porPeriodoUniforme.map(p => {
                const mes = String(p._id.mes).padStart(2, '0');
                return {
                    periodo: `${mes}/${p._id.ano}`,
                    label: `${mes}/${p._id.ano}`,
                    count: p.count
                };
            }),
            porTurma: porTurma.map(t => ({
                turma: t._id || 'Sem turma',
                total: t.total,
                totalAlunos: t.alunos.length
            })),
            registros: registros.map(a => ({
                id: a._id,
                tipo: a.tipo,
                alunoNome: a.alunoNome,
                alunoMatricula: a.alunoMatricula,
                alunoTurma: a.alunoTurma,
                alunoCurso: a.alunoCurso,
                data: a.data,
                dataFormatada: new Date(a.data).toLocaleDateString('pt-BR'),
                dataEntrada: a.dataEntrada,
                dataSaida: a.dataSaida,
                dataEntradaFormatada: a.dataEntrada ? new Date(a.dataEntrada).toLocaleDateString('pt-BR') : null,
                dataSaidaFormatada: a.dataSaida ? new Date(a.dataSaida).toLocaleDateString('pt-BR') : null,
                entradaCompleta: getEntradaCompleta(a),
                saidaCompleta: getSaidaCompleta(a),
                horarioEntrada: a.horarioEntrada,
                horarioSaida: a.horarioSaida,
                periodoFaltaInicio: a.periodoFaltaInicio,
                periodoFaltaFim: a.periodoFaltaFim,
                periodoFaltaFormatado: getPeriodoFaltaFormatado(a),
                uniformePeriodoInicio: a.uniformePeriodoInicio,
                uniformePeriodoFim: a.uniformePeriodoFim,
                uniformePeriodoFormatado: getUniformePeriodoFormatado(a),
                tipoProvaPerdida: a.tipoProvaPerdida,
                tipoProvaPerdidaOutros: a.tipoProvaPerdidaOutros,
                tipoProvaPerdidaFormatado: getTipoProvaPerdidaFormatado(a),
                periodoProva: a.periodoProva,
                periodoProvaFormatado: getPeriodoProvaFormatado(a),
                horarioAusencia: a.horarioAusencia,
                horarioRetorno: a.horarioRetorno,
                motivo: a.motivo,
                motivoLabel: Autorizacao.getMotivoLabel(a.motivo, a.tipo),
                motivoOutros: a.motivoOutros,
                responsavelNome: a.responsavelNome,
                responsavelCPF: a.responsavelCPF,
                responsavelTelefone: a.responsavelTelefone,
                observacoes: a.observacoes,
                temAssinatura: a.temAssinatura,
                registradoPorNome: a.registradoPorNome,
                createdAt: a.createdAt
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 6. RELATÓRIO POR TURMA
// ============================================
router.get('/relatorio/turma/:turma', authenticateToken, verificarGestaoGeral, async (req, res) => {
    try {
        const Autorizacao = getAutorizacao();
        const { turma } = req.params;
        const { 
            tipo = 'autorizacao', 
            dataInicio, 
            dataFim, 
            filtrarPorPeriodoFalta, 
            tipoProvaPerdida, 
            periodoProva 
        } = req.query;

        let matchStage = { tipo, alunoTurma: turma };
        
        const filtroData = construirFiltroData(dataInicio, dataFim, filtrarPorPeriodoFalta, tipo);
        if (filtroData) {
            Object.assign(matchStage, filtroData);
        }
        
        if (tipoProvaPerdida && tipoProvaPerdida !== 'todos') {
            matchStage.tipoProvaPerdida = tipoProvaPerdida;
        }
        if (periodoProva && periodoProva !== 'todos') {
            matchStage.periodoProva = periodoProva;
        }

        const [total, porAluno, porMotivo, registros] = await Promise.all([
            Autorizacao.countDocuments(matchStage),
            Autorizacao.aggregate([
                { $match: matchStage },
                {
                    $group: {
                        _id: '$alunoId',
                        alunoNome: { $first: '$alunoNome' },
                        alunoMatricula: { $first: '$alunoMatricula' },
                        total: { $sum: 1 }
                    }
                },
                { $sort: { total: -1 } }
            ]),
            Autorizacao.aggregate([
                { $match: matchStage },
                { $group: { _id: '$motivo', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]),
            Autorizacao.find(matchStage)
                .select('-assinaturaBase64')
                .sort({ data: -1 })
                .limit(200)
        ]);

        res.json({
            success: true,
            turma,
            tipo,
            estatisticas: {
                totalRegistros: total,
                totalAlunos: porAluno.length
            },
            porAluno: porAluno.map(a => ({
                alunoId: a._id,
                alunoNome: a.alunoNome,
                alunoMatricula: a.alunoMatricula,
                total: a.total
            })),
            porMotivo: porMotivo.map(m => ({
                motivo: m._id,
                label: Autorizacao.getMotivoLabel(m._id, tipo),
                count: m.count
            })),
            registros: registros.map(a => ({
                id: a._id,
                data: a.data,
                dataFormatada: new Date(a.data).toLocaleDateString('pt-BR'),
                dataEntrada: a.dataEntrada,
                dataSaida: a.dataSaida,
                dataEntradaFormatada: a.dataEntrada ? new Date(a.dataEntrada).toLocaleDateString('pt-BR') : null,
                dataSaidaFormatada: a.dataSaida ? new Date(a.dataSaida).toLocaleDateString('pt-BR') : null,
                entradaCompleta: getEntradaCompleta(a),
                saidaCompleta: getSaidaCompleta(a),
                horarioEntrada: a.horarioEntrada,
                horarioSaida: a.horarioSaida,
                periodoFaltaInicio: a.periodoFaltaInicio,
                periodoFaltaFim: a.periodoFaltaFim,
                periodoFaltaFormatado: getPeriodoFaltaFormatado(a),
                uniformePeriodoInicio: a.uniformePeriodoInicio,
                uniformePeriodoFim: a.uniformePeriodoFim,
                uniformePeriodoFormatado: getUniformePeriodoFormatado(a),
                tipoProvaPerdida: a.tipoProvaPerdida,
                tipoProvaPerdidaOutros: a.tipoProvaPerdidaOutros,
                tipoProvaPerdidaFormatado: getTipoProvaPerdidaFormatado(a),
                periodoProva: a.periodoProva,
                periodoProvaFormatado: getPeriodoProvaFormatado(a),
                alunoNome: a.alunoNome,
                alunoMatricula: a.alunoMatricula,
                motivo: a.motivo,
                motivoLabel: Autorizacao.getMotivoLabel(a.motivo, a.tipo),
                responsavelNome: a.responsavelNome,
                observacoes: a.observacoes,
                temAssinatura: a.temAssinatura,
                createdAt: a.createdAt
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 7. RELATÓRIO POR ALUNO
// ============================================
router.get('/relatorio/aluno/:alunoId', authenticateToken, verificarGestaoGeral, async (req, res) => {
    try {
        const User = getUser();
        const Autorizacao = getAutorizacao();
        const { alunoId } = req.params;
        const { 
            tipo = 'autorizacao', 
            dataInicio, 
            dataFim, 
            filtrarPorPeriodoFalta, 
            tipoProvaPerdida, 
            periodoProva 
        } = req.query;

        let matchStage = { tipo, alunoId };
        
        const filtroData = construirFiltroData(dataInicio, dataFim, filtrarPorPeriodoFalta, tipo);
        if (filtroData) {
            Object.assign(matchStage, filtroData);
        }
        
        if (tipoProvaPerdida && tipoProvaPerdida !== 'todos') {
            matchStage.tipoProvaPerdida = tipoProvaPerdida;
        }
        if (periodoProva && periodoProva !== 'todos') {
            matchStage.periodoProva = periodoProva;
        }

        const [aluno, total, porMotivo, registros] = await Promise.all([
            User.findById(alunoId).select('nome matricula turma curso fotoPerfil'),
            Autorizacao.countDocuments(matchStage),
            Autorizacao.aggregate([
                { $match: matchStage },
                { $group: { _id: '$motivo', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]),
            Autorizacao.find(matchStage)
                .select('-assinaturaBase64')
                .sort({ data: -1 })
        ]);

        if (!aluno) {
            return res.status(404).json({ success: false, error: 'Aluno não encontrado' });
        }

        res.json({
            success: true,
            aluno: {
                id: aluno._id,
                nome: aluno.nome,
                matricula: aluno.matricula,
                turma: aluno.turma,
                curso: aluno.curso,
                fotoPerfil: aluno.fotoPerfil
            },
            tipo,
            estatisticas: { totalRegistros: total },
            porMotivo: porMotivo.map(m => ({
                motivo: m._id,
                label: Autorizacao.getMotivoLabel(m._id, tipo),
                count: m.count
            })),
            registros: registros.map(a => ({
                id: a._id,
                data: a.data,
                dataFormatada: new Date(a.data).toLocaleDateString('pt-BR'),
                dataEntrada: a.dataEntrada,
                dataSaida: a.dataSaida,
                dataEntradaFormatada: a.dataEntrada ? new Date(a.dataEntrada).toLocaleDateString('pt-BR') : null,
                dataSaidaFormatada: a.dataSaida ? new Date(a.dataSaida).toLocaleDateString('pt-BR') : null,
                entradaCompleta: getEntradaCompleta(a),
                saidaCompleta: getSaidaCompleta(a),
                horarioEntrada: a.horarioEntrada,
                horarioSaida: a.horarioSaida,
                periodoFaltaInicio: a.periodoFaltaInicio,
                periodoFaltaFim: a.periodoFaltaFim,
                periodoFaltaFormatado: getPeriodoFaltaFormatado(a),
                uniformePeriodoInicio: a.uniformePeriodoInicio,
                uniformePeriodoFim: a.uniformePeriodoFim,
                uniformePeriodoFormatado: getUniformePeriodoFormatado(a),
                tipoProvaPerdida: a.tipoProvaPerdida,
                tipoProvaPerdidaOutros: a.tipoProvaPerdidaOutros,
                tipoProvaPerdidaFormatado: getTipoProvaPerdidaFormatado(a),
                periodoProva: a.periodoProva,
                periodoProvaFormatado: getPeriodoProvaFormatado(a),
                horarioAusencia: a.horarioAusencia,
                horarioRetorno: a.horarioRetorno,
                motivo: a.motivo,
                motivoLabel: Autorizacao.getMotivoLabel(a.motivo, a.tipo),
                responsavelNome: a.responsavelNome,
                observacoes: a.observacoes,
                temAssinatura: a.temAssinatura,
                registradoPorNome: a.registradoPorNome,
                createdAt: a.createdAt
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 8. ESTATÍSTICAS DE ASSINATURA
// ============================================
router.get('/estatisticas/assinatura', authenticateToken, verificarGestaoGeral, async (req, res) => {
    try {
        const Autorizacao = getAutorizacao();
        const tipos = ['autorizacao', 'justificativa', 'segunda_chamada', 'uniforme'];
        const stats = {};
        
        for (const tipo of tipos) {
            const [total, comAssinatura] = await Promise.all([
                Autorizacao.countDocuments({ tipo }),
                Autorizacao.countDocuments({ tipo, temAssinatura: true })
            ]);
            stats[tipo] = {
                total,
                comAssinatura,
                semAssinatura: total - comAssinatura,
                percentual: total > 0 ? Math.round((comAssinatura / total) * 100) : 0
            };
        }

        res.json({ success: true, estatisticas: stats });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 9. LISTAR
// ============================================
router.get('/listar', authenticateToken, verificarGestaoGeral, async (req, res) => {
    try {
        const Autorizacao = getAutorizacao();
        const { 
            tipo = 'autorizacao', limit = 100, page = 1, 
            motivo, turma, dataInicio, dataFim, alunoNome,
            filtrarPorPeriodoFalta,
            tipoProvaPerdida,
            periodoProva
        } = req.query;

        let query = { tipo };
        if (motivo && motivo !== 'todos') query.motivo = motivo;
        if (turma && turma !== 'todas') query.alunoTurma = turma;
        if (alunoNome) query.alunoNome = { $regex: alunoNome, $options: 'i' };
        
        if (tipoProvaPerdida && tipoProvaPerdida !== 'todos') {
            query.tipoProvaPerdida = tipoProvaPerdida;
        }
        if (periodoProva && periodoProva !== 'todos') {
            query.periodoProva = periodoProva;
        }
        
        const filtroData = construirFiltroData(dataInicio, dataFim, filtrarPorPeriodoFalta, tipo);
        if (filtroData) {
            Object.assign(query, filtroData);
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const [autorizacoes, total] = await Promise.all([
            Autorizacao.find(query)
                .select('-assinaturaBase64')
                .sort({ data: -1, createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            Autorizacao.countDocuments(query)
        ]);

        res.json({
            success: true, 
            total, 
            page: parseInt(page),
            totalPages: Math.ceil(total / parseInt(limit)),
            autorizacoes: autorizacoes.map(a => ({
                id: a._id,
                tipo: a.tipo,
                alunoId: a.alunoId,
                alunoNome: a.alunoNome,
                alunoMatricula: a.alunoMatricula,
                alunoTurma: a.alunoTurma,
                alunoCurso: a.alunoCurso,
                data: a.data,
                dataFormatada: new Date(a.data).toLocaleDateString('pt-BR'),
                dataEntrada: a.dataEntrada,
                dataSaida: a.dataSaida,
                dataEntradaFormatada: a.dataEntrada ? new Date(a.dataEntrada).toLocaleDateString('pt-BR') : null,
                dataSaidaFormatada: a.dataSaida ? new Date(a.dataSaida).toLocaleDateString('pt-BR') : null,
                entradaCompleta: getEntradaCompleta(a),
                saidaCompleta: getSaidaCompleta(a),
                horarioEntrada: a.horarioEntrada,
                horarioSaida: a.horarioSaida,
                periodoFaltaInicio: a.periodoFaltaInicio,
                periodoFaltaFim: a.periodoFaltaFim,
                periodoFaltaFormatado: getPeriodoFaltaFormatado(a),
                uniformePeriodoInicio: a.uniformePeriodoInicio,
                uniformePeriodoFim: a.uniformePeriodoFim,
                uniformePeriodoFormatado: getUniformePeriodoFormatado(a),
                tipoProvaPerdida: a.tipoProvaPerdida,
                tipoProvaPerdidaOutros: a.tipoProvaPerdidaOutros,
                tipoProvaPerdidaFormatado: getTipoProvaPerdidaFormatado(a),
                periodoProva: a.periodoProva,
                periodoProvaFormatado: getPeriodoProvaFormatado(a),
                responsavelNome: a.responsavelNome,
                responsavelCPF: a.responsavelCPF,
                responsavelTelefone: a.responsavelTelefone,
                motivo: a.motivo,
                motivoLabel: Autorizacao.getMotivoLabel(a.motivo, a.tipo),
                motivoOutros: a.motivoOutros,
                horarioAusencia: a.horarioAusencia,
                horarioRetorno: a.horarioRetorno,
                observacoes: a.observacoes,
                temAssinatura: a.temAssinatura,
                statusAssinatura: a.statusAssinatura,
                origemTipo: a.origemTipo,
                origemId: a.origemId,
                registradoPorNome: a.registradoPorNome,
                createdAt: a.createdAt,
                createdAtFormatado: new Date(a.createdAt).toLocaleString('pt-BR')
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 10. BUSCAR ALUNO POR ID
// ============================================
router.get('/aluno/:id', authenticateToken, verificarGestaoGeral, async (req, res) => {
    try {
        const User = getUser();
        const Autorizacao = getAutorizacao();
        
        const aluno = await User.findOne({ _id: req.params.id, ativo: true })
            .select('nome email matricula curso turma fotoPerfil role');

        if (!aluno) return res.status(404).json({ success: false, error: 'Aluno não encontrado' });
        if (aluno.role !== 'aluno') return res.status(400).json({ success: false, error: 'Usuário não é aluno' });

        const ultimosRegistros = await Autorizacao.find({ alunoId: aluno._id })
            .select('-assinaturaBase64')
            .sort({ createdAt: -1 })
            .limit(5);

        res.json({
            success: true,
            aluno: {
                id: aluno._id, nome: aluno.nome, matricula: aluno.matricula,
                turma: aluno.turma, curso: aluno.curso, fotoPerfil: aluno.fotoPerfil || null
            },
            ultimasAutorizacoes: ultimosRegistros.map(a => ({
                id: a._id, tipo: a.tipo, motivo: a.motivo,
                motivoLabel: Autorizacao.getMotivoLabel(a.motivo, a.tipo),
                data: a.data,
                dataEntrada: a.dataEntrada,
                dataSaida: a.dataSaida,
                entradaCompleta: getEntradaCompleta(a),
                saidaCompleta: getSaidaCompleta(a),
                horarioEntrada: a.horarioEntrada, horarioSaida: a.horarioSaida,
                periodoFaltaFormatado: getPeriodoFaltaFormatado(a),
                uniformePeriodoInicio: a.uniformePeriodoInicio,
                uniformePeriodoFim: a.uniformePeriodoFim,
                uniformePeriodoFormatado: getUniformePeriodoFormatado(a),
                tipoProvaPerdida: a.tipoProvaPerdida,
                tipoProvaPerdidaFormatado: getTipoProvaPerdidaFormatado(a),
                periodoProva: a.periodoProva,
                periodoProvaFormatado: getPeriodoProvaFormatado(a),
                statusAssinatura: a.statusAssinatura
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 11. REGISTRAR
// ============================================
router.post('/registrar', authenticateToken, verificarGestaoGeral, async (req, res) => {
    try {
        const User = getUser();
        const Autorizacao = getAutorizacao();
        
        const {
            tipo = 'autorizacao',
            alunoId, data, horarioEntrada, horarioSaida,
            dataEntrada = null,
            dataSaida = null,
            responsavelNome, responsavelCPF, responsavelTelefone,
            motivo, motivoOutros, horarioAusencia, horarioRetorno, observacoes,
            assinaturaBase64 = '',
            origemTipo = 'manual',
            origemId = null,
            tipoProvaPerdida = null,
            tipoProvaPerdidaOutros = '',
            periodoProva = null,
            precisaAssinatura = false
        } = req.body;

        if (!alunoId) return res.status(400).json({ success: false, error: 'Aluno é obrigatório' });
        if (!motivo) return res.status(400).json({ success: false, error: 'Motivo é obrigatório' });
        if (!data) return res.status(400).json({ success: false, error: 'Data é obrigatória' });

        const motivosValidos = MOTIVOS_POR_TIPO[tipo] || MOTIVOS_POR_TIPO['autorizacao'];
        if (!motivosValidos.includes(motivo)) {
            return res.status(400).json({ success: false, error: `Motivo inválido para o tipo "${tipo}"` });
        }

        if (motivo === 'outros' && (!motivoOutros || motivoOutros.trim() === '')) {
            return res.status(400).json({ success: false, error: 'Especifique o motivo quando selecionar "Outros"' });
        }

        if (motivo === 'necessita_ausentar_retornar') {
            if (!horarioAusencia || !horarioRetorno) {
                return res.status(400).json({ success: false, error: 'Informe os horários de ausência e retorno' });
            }
        }

        // Validação de CPF
        const cpfPreenchido = responsavelCPF && responsavelCPF.trim() !== '';
        const cpfObrigatorio = tipoExigeCPF(tipo);

        if (cpfObrigatorio && !cpfPreenchido) {
            return res.status(400).json({ 
                success: false, 
                error: 'CPF do responsável é obrigatório para ' + 
                       (tipo === 'justificativa' ? 'Justificativa de Falta' : '2ª Chamada')
            });
        }

        if (cpfPreenchido) {
            const validacaoCPF = validarCPF(responsavelCPF);
            if (!validacaoCPF.valido) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'CPF do responsável inválido. ' + (validacaoCPF.erro || '')
                });
            }
        }

        // Período da falta
        let periodoFaltaInicio = null;
        let periodoFaltaFim = null;
        
        if (tipo === 'justificativa' || tipo === 'segunda_chamada') {
            const { periodoFaltaInicio: pIni } = req.body;
            
            if (!pIni) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Data da falta é obrigatória para justificativa e 2ª chamada' 
                });
            }
            
            const resultado = extrairPeriodoFalta(req.body);
            if (resultado.error) {
                return res.status(400).json({ success: false, error: resultado.error });
            }
            
            periodoFaltaInicio = resultado.dataInicio;
            periodoFaltaFim = resultado.dataFim;
        }

        // Período do uniforme
        let uniformePeriodoInicio = null;
        let uniformePeriodoFim = null;

        if (tipo === 'uniforme') {
            const { uniformePeriodoInicio: uIni } = req.body;
            
            if (!uIni) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Data de início da autorização de uniforme é obrigatória' 
                });
            }
            
            const resultadoUniforme = extrairPeriodoUniforme(req.body);
            if (resultadoUniforme.error) {
                return res.status(400).json({ success: false, error: resultadoUniforme.error });
            }
            
            uniformePeriodoInicio = resultadoUniforme.dataInicio;
            uniformePeriodoFim = resultadoUniforme.dataFim;
        }

        // DATAS DE ENTRADA/SAÍDA (só para autorização)
        let dataEntradaFinal = null;
        let dataSaidaFinal = null;
        
        if (tipo === 'autorizacao') {
            const { dataEntradaFinal: dE, dataSaidaFinal: dS } = extrairDatasEntradaSaida(req.body);
            dataEntradaFinal = dE;
            dataSaidaFinal = dS;
            
            if (horarioEntrada && !dataEntradaFinal) {
                dataEntradaFinal = data ? new Date(data + 'T12:00:00.000-03:00') : new Date();
            }
            if (horarioSaida && !dataSaidaFinal) {
                dataSaidaFinal = data ? new Date(data + 'T12:00:00.000-03:00') : new Date();
            }
        }

        // Validação tipo de prova + período (2ª chamada)
        if (tipo === 'segunda_chamada') {
            if (!tipoProvaPerdida) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Informe o tipo de prova perdida (AV1, AV2, AV3, AV4, Recuperação ou Outros)' 
                });
            }
            if (!TIPOS_PROVA_VALIDOS.includes(tipoProvaPerdida)) {
                return res.status(400).json({ success: false, error: 'Tipo de prova perdida inválido' });
            }
            if (tipoProvaPerdida === 'Outros' && (!tipoProvaPerdidaOutros || !tipoProvaPerdidaOutros.trim())) {
                return res.status(400).json({ success: false, error: 'Especifique o tipo de prova perdida' });
            }
            if (!periodoProva) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Informe o período da prova (1º, 2º, 3º ou 4º Período)' 
                });
            }
            if (!PERIODOS_PROVA_VALIDOS.includes(periodoProva)) {
                return res.status(400).json({ success: false, error: 'Período da prova inválido' });
            }
        }

        // Duplicidade (2ª chamada)
        if (tipo === 'segunda_chamada') {
            const cpfResponsavelLimpo = (responsavelCPF || '').replace(/\D/g, '');
            
            const candidatos = await Autorizacao.find({
                tipo: 'segunda_chamada',
                alunoId: alunoId,
                periodoFaltaInicio: periodoFaltaInicio,
                periodoFaltaFim: periodoFaltaFim,
                tipoProvaPerdida: tipoProvaPerdida,
                periodoProva: periodoProva,
                motivo: motivo,
                ativo: true
            });
            
            const duplicado = candidatos.find(c => {
                const cpfExistente = (c.responsavelCPF || '').replace(/\D/g, '');
                return cpfExistente === cpfResponsavelLimpo;
            });
            
            if (duplicado) {
                return res.status(409).json({
                    success: false,
                    error: 'Já existe uma 2ª Chamada registrada para este aluno com o mesmo período, tipo de prova, motivo e CPF do responsável. Altere algum campo para registrar.',
                    duplicado: {
                        id: duplicado._id,
                        data: duplicado.data,
                        registradoPor: duplicado.registradoPorNome,
                        responsavelCPF: duplicado.responsavelCPF,
                        createdAt: duplicado.createdAt
                    }
                });
            }
        }

        // Assinatura
        let assinaturaValida = '';
        if (assinaturaBase64 && typeof assinaturaBase64 === 'string') {
            if (assinaturaBase64.startsWith('data:image/png;base64,')) {
                if (assinaturaBase64.length > 500 * 1024) {
                    return res.status(400).json({ success: false, error: 'Assinatura muito grande (máx 500KB)' });
                }
                assinaturaValida = assinaturaBase64;
            }
        }

        const statusAssinatura = precisaAssinatura && !assinaturaValida
            ? 'pendente'
            : (assinaturaValida.length > 100 ? 'assinada' : 'nao_necessaria');

        const aluno = await User.findById(alunoId);
        if (!aluno || aluno.role !== 'aluno') {
            return res.status(404).json({ success: false, error: 'Aluno não encontrado' });
        }

        const gestor = await User.findById(req.userId).select('nome');

        let dataFinal;
        if (data) {
            if (data.length === 10) {
                dataFinal = new Date(data + 'T12:00:00.000-03:00');
            } else {
                dataFinal = new Date(data);
            }
        } else {
            dataFinal = new Date();
        }

        const autorizacao = new Autorizacao({
            tipo,
            alunoId: aluno._id,
            alunoNome: aluno.nome,
            alunoMatricula: aluno.matricula,
            alunoTurma: aluno.turma || 'Não informada',
            alunoCurso: aluno.curso || 'Não informado',
            alunoFoto: aluno.fotoPerfil,
            
            data: dataFinal,
            
            dataEntrada: dataEntradaFinal,
            dataSaida: dataSaidaFinal,
            horarioEntrada, horarioSaida,
            
            periodoFaltaInicio,
            periodoFaltaFim,
            uniformePeriodoInicio,
            uniformePeriodoFim,
            responsavelNome: responsavelNome || undefined,
            responsavelCPF: responsavelCPF || undefined,
            responsavelTelefone: responsavelTelefone || undefined,
            motivo,
            motivoOutros: motivo === 'outros' ? motivoOutros : undefined,
            tipoProvaPerdida: tipo === 'segunda_chamada' ? tipoProvaPerdida : null,
            tipoProvaPerdidaOutros: (tipo === 'segunda_chamada' && tipoProvaPerdida === 'Outros') ? tipoProvaPerdidaOutros.trim() : undefined,
            periodoProva: tipo === 'segunda_chamada' ? periodoProva : null,
            horarioAusencia: motivo === 'necessita_ausentar_retornar' ? horarioAusencia : undefined,
            horarioRetorno: motivo === 'necessita_ausentar_retornar' ? horarioRetorno : undefined,
            observacoes: observacoes || '',
            assinaturaBase64: assinaturaValida,
            temAssinatura: assinaturaValida.length > 100,
            statusAssinatura: statusAssinatura,
            assinadaEm: assinaturaValida.length > 100 ? new Date() : null,
            assinadaPor: assinaturaValida.length > 100 ? req.userId : null,

            // ============================================
            // ✅ CORREÇÃO: quem assinou é o RESPONSÁVEL, não o gestor
            // ============================================
            assinadaPorNome: assinaturaValida.length > 100 
                ? (responsavelNome && String(responsavelNome).trim() 
                    ? String(responsavelNome).trim() 
                    : 'Responsável') 
                : null,

            origemTipo: origemTipo || 'manual',
            origemId: origemId || null,

            // ============================================
            // ✅ Quem registrou é SEMPRE o gestor logado
            // ============================================
            registradoPor: req.userId,
            registradoPorNome: gestor?.nome || req.userNome || 'Gestão Geral'
        });

        await autorizacao.save();

        // ============================================================
        // 🆕 LEMBRETE DE RETROATIVIDADE (Só para Justificativas)
        // ============================================================
        if (tipo === 'justificativa' && periodoFaltaInicio) {
            const hoje = new Date();
            hoje.setHours(0, 0, 0, 0);
            const dataFalta = new Date(periodoFaltaInicio);
            dataFalta.setHours(0, 0, 0, 0);

            console.log(`🔍 [Debug Lembrete] Data Falta: ${dataFalta.toISOString()} | Hoje: ${hoje.toISOString()}`);

            if (dataFalta < hoje) {
                try {
                    const Notificacao = require('../models/Notificacao');
                    
                    const diffTime = Math.abs(hoje - dataFalta);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    
                    const secretarios = await User.find({ role: 'secretaria' }).select('_id nome ativo');
                    
                    console.log(`🔍 [Debug Lembrete] Secretários encontrados:`, secretarios);

                    if (secretarios.length > 0) {
                        // 🆕 Data ISO para usar em query string / deep link
                        const dataFaltaISO = dataFalta.toISOString().split('T')[0]; // YYYY-MM-DD

                        const notificacoes = secretarios.map(sec => ({
                            usuarioId: sec._id,
                            titulo: '⚠️ Justificativa Retroativa',
                            mensagem: `Uma justificativa para o dia ${dataFalta.toLocaleDateString('pt-BR')} (há ${diffDays} dia${diffDays > 1 ? 's' : ''}) foi adicionada por ${req.userNome || 'Gestão'}. Toque para ver o registro.`,
                            tipo: 'lembrete',
                            icone: '📅',
                            cor: '#f59e0b',

                            // 🆕 Deep-link direto para a aba "Por Data"
                            link: `/secretaria.html?tab=por-data&dataInicio=${dataFaltaISO}&dataFim=${dataFaltaISO}&autorizacaoId=${autorizacao._id}`,

                            // 🆕 Campos dedicados (indexados)
                            autorizacaoId: autorizacao._id,
                            alunoId: autorizacao.alunoId,
                            dataFalta: dataFalta,

                            // 🆕 Metadados no campo `dados` (Mixed) — usado pelo frontend
                            dados: {
                                origem: 'lembrete_retroativo',
                                autorizacaoId: String(autorizacao._id),
                                alunoId: String(autorizacao.alunoId),
                                alunoNome: autorizacao.alunoNome,
                                alunoMatricula: autorizacao.alunoMatricula,
                                alunoTurma: autorizacao.alunoTurma,
                                dataFaltaISO,
                                dataFaltaFormatada: dataFalta.toLocaleDateString('pt-BR'),
                                motivo: autorizacao.motivo,
                                motivoLabel: Autorizacao.getMotivoLabel(autorizacao.motivo, 'justificativa'),
                                registradoPorNome: req.userNome || 'Gestão',
                                diffDias: diffDays
                            }
                        }));
                        
                        await Notificacao.insertMany(notificacoes);
                        console.log(`🔔 [Lembrete] Criado com sucesso para ${secretarios.length} secretário(s).`);
                    } else {
                        console.warn('⚠️ [Lembrete] Nenhum usuário com role "secretaria" encontrado no banco!');
                    }
                } catch (errLembrete) {
                    console.error('❌ [Lembrete] ERRO AO CRIAR:', errLembrete);
                }
            } else {
                console.log('ℹ️ [Lembrete] Data não é retroativa, ignorando.');
            }
        }

        const logFalta = periodoFaltaInicio 
            ? ` (falta: ${periodoFaltaInicio.toLocaleDateString('pt-BR')} a ${periodoFaltaFim.toLocaleDateString('pt-BR')})` 
            : '';
        const logUniforme = uniformePeriodoInicio
            ? ` (uniforme: ${uniformePeriodoInicio.toLocaleDateString('pt-BR')} a ${uniformePeriodoFim.toLocaleDateString('pt-BR')})`
            : '';
        const logEntrada = dataEntradaFinal 
            ? ` (entrada: ${dataEntradaFinal.toLocaleDateString('pt-BR')} ${horarioEntrada || ''})`
            : '';
        console.log(`✅ ${tipo} registrado: ${aluno.nome} - registro: ${dataFinal.toLocaleDateString('pt-BR')}${logEntrada}${logFalta}${logUniforme}`);

        res.json({
            success: true,
            message: `Registro salvo para ${aluno.nome}${statusAssinatura === 'pendente' ? ' — aguardando assinatura' : ''}`,
            autorizacao: {
                id: autorizacao._id,
                tipo: autorizacao.tipo,
                alunoNome: autorizacao.alunoNome,
                motivo: autorizacao.motivo,
                motivoLabel: Autorizacao.getMotivoLabel(autorizacao.motivo, autorizacao.tipo),
                data: autorizacao.data,
                dataFormatada: new Date(autorizacao.data).toLocaleDateString('pt-BR'),
                dataEntrada: autorizacao.dataEntrada,
                dataSaida: autorizacao.dataSaida,
                dataEntradaFormatada: autorizacao.dataEntrada ? new Date(autorizacao.dataEntrada).toLocaleDateString('pt-BR') : null,
                dataSaidaFormatada: autorizacao.dataSaida ? new Date(autorizacao.dataSaida).toLocaleDateString('pt-BR') : null,
                entradaCompleta: getEntradaCompleta(autorizacao),
                saidaCompleta: getSaidaCompleta(autorizacao),
                horarioEntrada: autorizacao.horarioEntrada,
                horarioSaida: autorizacao.horarioSaida,
                periodoFaltaInicio: autorizacao.periodoFaltaInicio,
                periodoFaltaFim: autorizacao.periodoFaltaFim,
                periodoFaltaFormatado: getPeriodoFaltaFormatado(autorizacao),
                uniformePeriodoInicio: autorizacao.uniformePeriodoInicio,
                uniformePeriodoFim: autorizacao.uniformePeriodoFim,
                uniformePeriodoFormatado: getUniformePeriodoFormatado(autorizacao),
                tipoProvaPerdida: autorizacao.tipoProvaPerdida,
                tipoProvaPerdidaOutros: autorizacao.tipoProvaPerdidaOutros,
                tipoProvaPerdidaFormatado: getTipoProvaPerdidaFormatado(autorizacao),
                periodoProva: autorizacao.periodoProva,
                periodoProvaFormatado: getPeriodoProvaFormatado(autorizacao),
                temAssinatura: autorizacao.temAssinatura,
                statusAssinatura: autorizacao.statusAssinatura
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 12. BUSCAR POR ID
// ============================================
router.get('/:id', authenticateToken, verificarGestaoGeral, async (req, res) => {
    try {
        const Autorizacao = getAutorizacao();
        
        if (!req.params.id.match(/^[a-f0-9]{24}$/i)) {
            return res.status(400).json({ success: false, error: 'ID inválido' });
        }

        const a = await Autorizacao.findById(req.params.id);
        if (!a) return res.status(404).json({ success: false, error: 'Registro não encontrado' });

        res.json({
            success: true,
            autorizacao: {
                id: a._id,
                tipo: a.tipo,
                alunoId: a.alunoId,
                alunoNome: a.alunoNome,
                alunoMatricula: a.alunoMatricula,
                alunoTurma: a.alunoTurma,
                alunoCurso: a.alunoCurso,
                alunoFoto: a.alunoFoto,
                data: a.data,
                dataFormatada: new Date(a.data).toLocaleDateString('pt-BR'),
                dataEntrada: a.dataEntrada,
                dataSaida: a.dataSaida,
                dataEntradaFormatada: a.dataEntrada ? new Date(a.dataEntrada).toLocaleDateString('pt-BR') : null,
                dataSaidaFormatada: a.dataSaida ? new Date(a.dataSaida).toLocaleDateString('pt-BR') : null,
                entradaCompleta: getEntradaCompleta(a),
                saidaCompleta: getSaidaCompleta(a),
                horarioEntrada: a.horarioEntrada,
                horarioSaida: a.horarioSaida,
                periodoFaltaInicio: a.periodoFaltaInicio,
                periodoFaltaFim: a.periodoFaltaFim,
                periodoFaltaFormatado: getPeriodoFaltaFormatado(a),
                uniformePeriodoInicio: a.uniformePeriodoInicio,
                uniformePeriodoFim: a.uniformePeriodoFim,
                uniformePeriodoFormatado: getUniformePeriodoFormatado(a),
                tipoProvaPerdida: a.tipoProvaPerdida,
                tipoProvaPerdidaOutros: a.tipoProvaPerdidaOutros,
                tipoProvaPerdidaFormatado: getTipoProvaPerdidaFormatado(a),
                periodoProva: a.periodoProva,
                periodoProvaFormatado: getPeriodoProvaFormatado(a),
                responsavelNome: a.responsavelNome,
                responsavelCPF: a.responsavelCPF,
                responsavelTelefone: a.responsavelTelefone,
                motivo: a.motivo,
                motivoLabel: Autorizacao.getMotivoLabel(a.motivo, a.tipo),
                motivoOutros: a.motivoOutros,
                horarioAusencia: a.horarioAusencia,
                horarioRetorno: a.horarioRetorno,
                observacoes: a.observacoes,
                assinaturaBase64: a.assinaturaBase64 || '',
                temAssinatura: a.temAssinatura,
                statusAssinatura: a.statusAssinatura,
                assinadaEm: a.assinadaEm,
                assinadaPorNome: a.assinadaPorNome,
                origemTipo: a.origemTipo,
                origemId: a.origemId,

                // ============================================
                // ✅ CORREÇÃO: fallback robusto
                // registradoPorNome = SEMPRE o gestor que registrou
                // ============================================
                registradoPor: a.registradoPor || null,
                registradoPorNome: a.registradoPorNome || 
                    (a.registradoPor && typeof a.registradoPor === 'object' ? a.registradoPor.nome : null) || 
                    'Sistema',

                createdAt: a.createdAt
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 12.5. EDITAR
// ============================================
router.put('/:id', authenticateToken, verificarGestaoGeral, async (req, res) => {
    try {
        const Autorizacao = getAutorizacao();
        
        if (!req.params.id.match(/^[a-f0-9]{24}$/i)) {
            return res.status(400).json({ success: false, error: 'ID inválido' });
        }

        const a = await Autorizacao.findById(req.params.id);
        if (!a) return res.status(404).json({ success: false, error: 'Registro não encontrado' });

        const {
            data,
            horarioEntrada,
            horarioSaida,
            dataEntrada,
            dataSaida,
            horarioAusencia,
            horarioRetorno,
            motivo,
            motivoOutros,
            responsavelNome,
            responsavelCPF,
            responsavelTelefone,
            observacoes,
            periodoFaltaInicio,
            periodoFaltaFim,
            tipoProvaPerdida,
            tipoProvaPerdidaOutros,
            periodoProva,
            uniformePeriodoInicio,
            uniformePeriodoFim
        } = req.body;

        if (motivo) {
            const motivosValidos = MOTIVOS_POR_TIPO[a.tipo] || MOTIVOS_POR_TIPO['autorizacao'];
            if (!motivosValidos.includes(motivo)) {
                return res.status(400).json({ success: false, error: 'Motivo inválido' });
            }
            a.motivo = motivo;
        }

        if (data) {
            let dataFinal;
            if (data.length === 10) {
                dataFinal = new Date(data + 'T12:00:00.000-03:00');
            } else {
                dataFinal = new Date(data);
            }
            if (isNaN(dataFinal.getTime())) {
                return res.status(400).json({ success: false, error: 'Data inválida' });
            }
            a.data = dataFinal;
        }

        if (a.tipo === 'autorizacao') {
            if (dataEntrada !== undefined) {
                a.dataEntrada = dataEntrada ? new Date(dataEntrada + 'T12:00:00.000-03:00') : null;
            }
            if (dataSaida !== undefined) {
                a.dataSaida = dataSaida ? new Date(dataSaida + 'T12:00:00.000-03:00') : null;
            }
        }

        if (a.tipo === 'justificativa' || a.tipo === 'segunda_chamada') {
            if (periodoFaltaInicio !== undefined || periodoFaltaFim !== undefined) {
                const iniStr = periodoFaltaInicio !== undefined 
                    ? periodoFaltaInicio 
                    : (a.periodoFaltaInicio ? new Date(a.periodoFaltaInicio).toISOString().split('T')[0] : null);
                
                const fimStr = periodoFaltaFim !== undefined 
                    ? periodoFaltaFim 
                    : (a.periodoFaltaFim ? new Date(a.periodoFaltaFim).toISOString().split('T')[0] : null);
                
                if (!iniStr) {
                    return res.status(400).json({ success: false, error: 'Data inicial da falta é obrigatória' });
                }
                
                const resultado = extrairPeriodoFalta({ periodoFaltaInicio: iniStr, periodoFaltaFim: fimStr });
                if (resultado.error) {
                    return res.status(400).json({ success: false, error: resultado.error });
                }
                
                a.periodoFaltaInicio = resultado.dataInicio;
                a.periodoFaltaFim = resultado.dataFim;
            }
        }

        if (a.tipo === 'uniforme') {
            if (uniformePeriodoInicio !== undefined || uniformePeriodoFim !== undefined) {
                const iniStr = uniformePeriodoInicio !== undefined 
                    ? uniformePeriodoInicio 
                    : (a.uniformePeriodoInicio ? new Date(a.uniformePeriodoInicio).toISOString().split('T')[0] : null);
                
                const fimStr = uniformePeriodoFim !== undefined 
                    ? uniformePeriodoFim 
                    : (a.uniformePeriodoFim ? new Date(a.uniformePeriodoFim).toISOString().split('T')[0] : null);
                
                if (!iniStr) {
                    return res.status(400).json({ success: false, error: 'Data inicial do uniforme é obrigatória' });
                }
                
                const resultadoU = extrairPeriodoUniforme({ 
                    uniformePeriodoInicio: iniStr, 
                    uniformePeriodoFim: fimStr 
                });
                
                if (resultadoU.error) {
                    return res.status(400).json({ success: false, error: resultadoU.error });
                }
                
                a.uniformePeriodoInicio = resultadoU.dataInicio;
                a.uniformePeriodoFim = resultadoU.dataFim;
            }
        }

        if (a.tipo === 'segunda_chamada') {
            if (tipoProvaPerdida !== undefined) {
                if (!TIPOS_PROVA_VALIDOS.includes(tipoProvaPerdida)) {
                    return res.status(400).json({ success: false, error: 'Tipo de prova perdida inválido' });
                }
                a.tipoProvaPerdida = tipoProvaPerdida;
                
                if (tipoProvaPerdida === 'Outros') {
                    if (!tipoProvaPerdidaOutros || !tipoProvaPerdidaOutros.trim()) {
                        return res.status(400).json({ success: false, error: 'Especifique o tipo de prova perdida' });
                    }
                    a.tipoProvaPerdidaOutros = tipoProvaPerdidaOutros.trim();
                } else {
                    a.tipoProvaPerdidaOutros = undefined;
                }
            }

            if (periodoProva !== undefined) {
                if (!PERIODOS_PROVA_VALIDOS.includes(periodoProva)) {
                    return res.status(400).json({ success: false, error: 'Período da prova inválido' });
                }
                a.periodoProva = periodoProva;
            }
        }

        const motivoAtual = a.motivo;
        if (motivoAtual === 'outros') {
            const mOutros = (motivoOutros || a.motivoOutros || '').trim();
            if (!mOutros) {
                return res.status(400).json({ success: false, error: 'Especifique o motivo "Outros"' });
            }
            a.motivoOutros = mOutros;
        } else if (motivoOutros !== undefined) {
            a.motivoOutros = undefined;
        }

        if (motivoAtual === 'necessita_ausentar_retornar') {
            const hA = horarioAusencia || a.horarioAusencia;
            const hR = horarioRetorno || a.horarioRetorno;
            if (!hA || !hR) {
                return res.status(400).json({ success: false, error: 'Informe ausência e retorno' });
            }
            a.horarioAusencia = hA;
            a.horarioRetorno = hR;
        }

        const cpfParaValidar = responsavelCPF !== undefined ? responsavelCPF : a.responsavelCPF;
        const cpfPreenchido = cpfParaValidar && cpfParaValidar.trim() !== '';
        const cpfObrigatorio = tipoExigeCPF(a.tipo);

        if (cpfObrigatorio && !cpfPreenchido) {
            return res.status(400).json({ 
                success: false, 
                error: 'CPF do responsável é obrigatório para ' + 
                       (a.tipo === 'justificativa' ? 'Justificativa de Falta' : '2ª Chamada')
            });
        }

        if (cpfPreenchido) {
            const validacaoCPF = validarCPF(cpfParaValidar);
            if (!validacaoCPF.valido) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'CPF do responsável inválido. ' + (validacaoCPF.erro || '')
                });
            }
            if (responsavelCPF !== undefined) {
                a.responsavelCPF = responsavelCPF;
            }
        } else if (responsavelCPF !== undefined && !cpfObrigatorio) {
            a.responsavelCPF = undefined;
        }

        if (horarioEntrada !== undefined) a.horarioEntrada = horarioEntrada;
        if (horarioSaida !== undefined) a.horarioSaida = horarioSaida;
        if (responsavelNome !== undefined) a.responsavelNome = responsavelNome;
        if (responsavelTelefone !== undefined) a.responsavelTelefone = responsavelTelefone;
        if (observacoes !== undefined) a.observacoes = observacoes;

        // Duplicidade na edição
        if (a.tipo === 'segunda_chamada') {
            const cpfResponsavelLimpo = (a.responsavelCPF || '').replace(/\D/g, '');
            
            const candidatos = await Autorizacao.find({
                _id: { $ne: a._id },
                tipo: 'segunda_chamada',
                alunoId: a.alunoId,
                periodoFaltaInicio: a.periodoFaltaInicio,
                periodoFaltaFim: a.periodoFaltaFim,
                tipoProvaPerdida: a.tipoProvaPerdida,
                periodoProva: a.periodoProva,
                motivo: a.motivo,
                ativo: true
            });
            
            const duplicado = candidatos.find(c => {
                const cpfExistente = (c.responsavelCPF || '').replace(/\D/g, '');
                return cpfExistente === cpfResponsavelLimpo;
            });
            
            if (duplicado) {
                return res.status(409).json({
                    success: false,
                    error: 'Já existe outra 2ª Chamada registrada para este aluno com o mesmo período, tipo de prova, motivo e CPF do responsável. Altere algum campo para salvar.',
                    duplicado: {
                        id: duplicado._id,
                        data: duplicado.data,
                        registradoPor: duplicado.registradoPorNome,
                        responsavelCPF: duplicado.responsavelCPF,
                        createdAt: duplicado.createdAt
                    }
                });
            }
        }

        a.atualizadoEm = new Date();
        a.atualizadoPor = req.userId;
        a.atualizadoPorNome = req.userNome;

        await a.save();

        console.log(`✏️ ${a.tipo} editado: ${a.alunoNome} (${a._id}) por ${req.userNome}`);

        res.json({
            success: true,
            message: 'Registro atualizado com sucesso!',
            autorizacao: {
                id: a._id,
                tipo: a.tipo,
                alunoNome: a.alunoNome,
                motivo: a.motivo,
                motivoLabel: Autorizacao.getMotivoLabel(a.motivo, a.tipo),
                data: a.data,
                dataFormatada: new Date(a.data).toLocaleDateString('pt-BR'),
                dataEntrada: a.dataEntrada,
                dataSaida: a.dataSaida,
                entradaCompleta: getEntradaCompleta(a),
                saidaCompleta: getSaidaCompleta(a),
                horarioEntrada: a.horarioEntrada,
                horarioSaida: a.horarioSaida,
                periodoFaltaFormatado: getPeriodoFaltaFormatado(a),
                uniformePeriodoInicio: a.uniformePeriodoInicio,
                uniformePeriodoFim: a.uniformePeriodoFim,
                uniformePeriodoFormatado: getUniformePeriodoFormatado(a),
                tipoProvaPerdida: a.tipoProvaPerdida,
                tipoProvaPerdidaFormatado: getTipoProvaPerdidaFormatado(a),
                periodoProva: a.periodoProva,
                periodoProvaFormatado: getPeriodoProvaFormatado(a),
                observacoes: a.observacoes,
                statusAssinatura: a.statusAssinatura
            }
        });

    } catch (error) {
        console.error('Erro ao editar:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 13. EXCLUIR (COM CASCATA)
// ============================================
router.delete('/:id', authenticateToken, verificarGestaoGeral, async (req, res) => {
    try {
        const Autorizacao = getAutorizacao();
        
        if (!req.params.id.match(/^[a-f0-9]{24}$/i)) {
            return res.status(400).json({ success: false, error: 'ID inválido' });
        }

        const a = await Autorizacao.findByIdAndDelete(req.params.id);
        if (!a) return res.status(404).json({ success: false, error: 'Registro não encontrado' });
        
        let justificativasExcluidas = 0;
        if (a.tipo === 'segunda_chamada') {
            const result = await Autorizacao.deleteMany({
                tipo: 'justificativa',
                origemTipo: 'segunda_chamada',
                origemId: a._id
            });
            justificativasExcluidas = result.deletedCount || 0;
            
            if (justificativasExcluidas > 0) {
                console.log(`🗑️ Cascata: ${justificativasExcluidas} justificativa(s) excluída(s) junto com 2ª chamada ${a._id}`);
            }
        }
        
        console.log(`🗑️ ${a.tipo} excluído: ${a.alunoNome} (${a._id}) por ${req.userNome}`);
        
        res.json({ 
            success: true, 
            message: justificativasExcluidas > 0 
                ? `Registro excluído + ${justificativasExcluidas} justificativa(s) vinculada(s)`
                : 'Registro excluído com sucesso',
            cascata: {
                justificativasExcluidas
            }
        });
    } catch (error) {
        console.error('Erro ao excluir:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;