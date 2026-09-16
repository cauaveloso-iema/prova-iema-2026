// backend/routes/autorizacao-routes.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

// ============================================
// 🔥 LAZY LOADING
// ============================================
function getUser() {
    return require('../models/User');
}

function getAutorizacao() {
    return require('../models/Autorizacao');
}

// ============================================
// 🔥 HELPER: Timezone Brasil (UTC-3) com TOLERÂNCIA
// ============================================
function inicioDoDiaBrasil(dataStr) {
    const d = new Date(dataStr + 'T00:00:00.000-03:00');
    d.setDate(d.getDate() - 1);
    return d;
}

function fimDoDiaBrasil(dataStr) {
    const d = new Date(dataStr + 'T23:59:59.999-03:00');
    d.setDate(d.getDate() + 1);
    return d;
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
            
            if (!user) {
                return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
            }
            
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
        'problemas_pessoais',
        'problemas_saude_responsavel_buscou',
        'problemas_saude_responsavel_whatsapp',
        'necessita_ausentar_retornar',
        'viagens',
        'consultas',
        'outros'
    ],
    'justificativa': ['problemas_pessoais', 'problemas_saude', 'viagem', 'outros'],
    'segunda_chamada': ['problemas_pessoais', 'problemas_saude', 'viagem', 'outros']
};

// ============================================
// 1. HEALTH CHECK
// ============================================
router.get('/health', (req, res) => {
    res.json({ success: true, status: 'online', service: 'Autorização/Justificativa/2ª Chamada' });
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

        const [hojeCount, semanaCount, mesCount, total, comAssinatura] = await Promise.all([
            Autorizacao.countDocuments({
                tipo,
                data: {
                    $gte: inicioDoDiaBrasil(hojeStr),
                    $lte: fimDoDiaBrasil(hojeStr)
                }
            }),
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

        const ultimos7Dias = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const diaStr = d.toISOString().split('T')[0];

            const count = await Autorizacao.countDocuments({
                tipo,
                data: { 
                    $gte: inicioDoDiaBrasil(diaStr), 
                    $lte: fimDoDiaBrasil(diaStr) 
                }
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
            metricas: {
                hoje: hojeCount,
                semana: semanaCount,
                mes: mesCount,
                total,
                comAssinatura
            },
            porMotivo: porMotivo.map(m => ({
                motivo: m._id,
                label: Autorizacao.getMotivoLabel(m._id, tipo),
                count: m.count
            })),
            tendencias: {
                ultimos7Dias,
                porTurma: porTurma.map(t => ({ turma: t._id || 'Sem turma', count: t.count })),
                alunosReincidentes: alunosReincidentes.map(a => ({
                    alunoNome: a.alunoNome,
                    alunoTurma: a.alunoTurma,
                    count: a.count
                }))
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 5. RELATÓRIO GERAL — 🔥 AGORA COM `registros`
// ============================================
router.get('/relatorio/geral', authenticateToken, verificarGestaoGeral, async (req, res) => {
    try {
        const Autorizacao = getAutorizacao();
        const { tipo = 'autorizacao', dataInicio, dataFim } = req.query;

        let matchStage = { tipo };
        
        if (dataInicio || dataFim) {
            matchStage.data = {};
            if (dataInicio) matchStage.data.$gte = inicioDoDiaBrasil(dataInicio);
            if (dataFim) matchStage.data.$lte = fimDoDiaBrasil(dataFim);
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
            // 🔥 NOVO: registros detalhados para CSV
            Autorizacao.find(matchStage)
                .select('-assinaturaBase64')
                .sort({ data: -1 })
                .limit(1000)
        ]);

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
            porTurma: porTurma.map(t => ({
                turma: t._id || 'Sem turma',
                total: t.total,
                totalAlunos: t.alunos.length
            })),
            // 🔥 NOVO: array com todos os registros
            registros: registros.map(a => ({
                id: a._id,
                tipo: a.tipo,
                alunoNome: a.alunoNome,
                alunoMatricula: a.alunoMatricula,
                alunoTurma: a.alunoTurma,
                alunoCurso: a.alunoCurso,
                data: a.data,
                dataFormatada: new Date(a.data).toLocaleDateString('pt-BR'),
                horarioEntrada: a.horarioEntrada,
                horarioSaida: a.horarioSaida,
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
                registradoPorNome: a.registradoPorNome
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
        const { tipo = 'autorizacao', dataInicio, dataFim } = req.query;

        let matchStage = { tipo, alunoTurma: turma };
        
        if (dataInicio || dataFim) {
            matchStage.data = {};
            if (dataInicio) matchStage.data.$gte = inicioDoDiaBrasil(dataInicio);
            if (dataFim) matchStage.data.$lte = fimDoDiaBrasil(dataFim);
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
                alunoNome: a.alunoNome,
                alunoMatricula: a.alunoMatricula,
                motivo: a.motivo,
                motivoLabel: Autorizacao.getMotivoLabel(a.motivo, a.tipo),
                horarioEntrada: a.horarioEntrada,
                horarioSaida: a.horarioSaida,
                responsavelNome: a.responsavelNome,
                observacoes: a.observacoes,
                temAssinatura: a.temAssinatura
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
        const { tipo = 'autorizacao', dataInicio, dataFim } = req.query;

        let matchStage = { tipo, alunoId };
        
        if (dataInicio || dataFim) {
            matchStage.data = {};
            if (dataInicio) matchStage.data.$gte = inicioDoDiaBrasil(dataInicio);
            if (dataFim) matchStage.data.$lte = fimDoDiaBrasil(dataFim);
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
            estatisticas: {
                totalRegistros: total
            },
            porMotivo: porMotivo.map(m => ({
                motivo: m._id,
                label: Autorizacao.getMotivoLabel(m._id, tipo),
                count: m.count
            })),
            registros: registros.map(a => ({
                id: a._id,
                data: a.data,
                dataFormatada: new Date(a.data).toLocaleDateString('pt-BR'),
                motivo: a.motivo,
                motivoLabel: Autorizacao.getMotivoLabel(a.motivo, a.tipo),
                horarioEntrada: a.horarioEntrada,
                horarioSaida: a.horarioSaida,
                horarioAusencia: a.horarioAusencia,
                horarioRetorno: a.horarioRetorno,
                responsavelNome: a.responsavelNome,
                observacoes: a.observacoes,
                temAssinatura: a.temAssinatura,
                registradoPorNome: a.registradoPorNome
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
        const tipos = ['autorizacao', 'justificativa', 'segunda_chamada'];
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
// 9. LISTAR POR TIPO (COM FILTROS)
// ============================================
router.get('/listar', authenticateToken, verificarGestaoGeral, async (req, res) => {
    try {
        const Autorizacao = getAutorizacao();
        const { 
            tipo = 'autorizacao', limit = 100, page = 1, 
            motivo, turma, dataInicio, dataFim, alunoNome 
        } = req.query;

        let query = { tipo };
        if (motivo && motivo !== 'todos') query.motivo = motivo;
        if (turma && turma !== 'todas') query.alunoTurma = turma;
        if (alunoNome) query.alunoNome = { $regex: alunoNome, $options: 'i' };
        
        if (dataInicio || dataFim) {
            query.data = {};
            if (dataInicio) query.data.$gte = inicioDoDiaBrasil(dataInicio);
            if (dataFim) query.data.$lte = fimDoDiaBrasil(dataFim);
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
                horarioEntrada: a.horarioEntrada,
                horarioSaida: a.horarioSaida,
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
// 10. BUSCAR ALUNO POR ID (QR CODE)
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
                data: a.data, horarioEntrada: a.horarioEntrada, horarioSaida: a.horarioSaida
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 11. REGISTRAR (POST)
// ============================================
router.post('/registrar', authenticateToken, verificarGestaoGeral, async (req, res) => {
    try {
        const User = getUser();
        const Autorizacao = getAutorizacao();
        
        const {
            tipo = 'autorizacao',
            alunoId, data, horarioEntrada, horarioSaida,
            responsavelNome, responsavelCPF, responsavelTelefone,
            motivo, motivoOutros, horarioAusencia, horarioRetorno, observacoes,
            assinaturaBase64 = '',
            origemTipo = 'manual',
            origemId = null
        } = req.body;

        if (!alunoId) return res.status(400).json({ success: false, error: 'Aluno é obrigatório' });
        if (!motivo) return res.status(400).json({ success: false, error: 'Motivo é obrigatório' });
        if (!data) return res.status(400).json({ success: false, error: 'Data é obrigatória' });

        const motivosValidos = MOTIVOS_POR_TIPO[tipo] || MOTIVOS_POR_TIPO['autorizacao'];
        if (!motivosValidos.includes(motivo)) {
            return res.status(400).json({ success: false, error: `Motivo inválido para o tipo "${tipo}"` });
        }

        if (tipo === 'autorizacao') {
            if (!horarioEntrada || !horarioSaida) {
                return res.status(400).json({ success: false, error: 'Horários de entrada e saída são obrigatórios' });
            }
        }

        if (motivo === 'outros' && (!motivoOutros || motivoOutros.trim() === '')) {
            return res.status(400).json({ success: false, error: 'Especifique o motivo quando selecionar "Outros"' });
        }

        if (motivo === 'necessita_ausentar_retornar') {
            if (!horarioAusencia || !horarioRetorno) {
                return res.status(400).json({ success: false, error: 'Informe os horários de ausência e retorno' });
            }
        }

        let assinaturaValida = '';
        if (assinaturaBase64 && typeof assinaturaBase64 === 'string') {
            if (assinaturaBase64.startsWith('data:image/png;base64,')) {
                if (assinaturaBase64.length > 500 * 1024) {
                    return res.status(400).json({ success: false, error: 'Assinatura muito grande (máx 500KB)' });
                }
                assinaturaValida = assinaturaBase64;
            }
        }

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
            horarioEntrada, horarioSaida,
            responsavelNome: responsavelNome || undefined,
            responsavelCPF: responsavelCPF || undefined,
            responsavelTelefone: responsavelTelefone || undefined,
            motivo,
            motivoOutros: motivo === 'outros' ? motivoOutros : undefined,
            horarioAusencia: motivo === 'necessita_ausentar_retornar' ? horarioAusencia : undefined,
            horarioRetorno: motivo === 'necessita_ausentar_retornar' ? horarioRetorno : undefined,
            observacoes: observacoes || '',
            assinaturaBase64: assinaturaValida,
            temAssinatura: assinaturaValida.length > 100,
            origemTipo: origemTipo || 'manual',
            origemId: origemId || null,
            registradoPor: req.userId,
            registradoPorNome: gestor?.nome || req.userNome || 'Gestão Geral'
        });

        await autorizacao.save();

        res.json({
            success: true,
            message: `Registro salvo para ${aluno.nome}`,
            autorizacao: {
                id: autorizacao._id,
                tipo: autorizacao.tipo,
                alunoNome: autorizacao.alunoNome,
                motivo: autorizacao.motivo,
                motivoLabel: Autorizacao.getMotivoLabel(autorizacao.motivo, autorizacao.tipo),
                data: autorizacao.data,
                horarioEntrada: autorizacao.horarioEntrada,
                horarioSaida: autorizacao.horarioSaida,
                temAssinatura: autorizacao.temAssinatura
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
                horarioEntrada: a.horarioEntrada,
                horarioSaida: a.horarioSaida,
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
                origemTipo: a.origemTipo,
                origemId: a.origemId,
                registradoPorNome: a.registradoPorNome,
                createdAt: a.createdAt
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 13. EXCLUIR
// ============================================
router.delete('/:id', authenticateToken, verificarGestaoGeral, async (req, res) => {
    try {
        const Autorizacao = getAutorizacao();
        
        if (!req.params.id.match(/^[a-f0-9]{24}$/i)) {
            return res.status(400).json({ success: false, error: 'ID inválido' });
        }

        const a = await Autorizacao.findByIdAndDelete(req.params.id);
        if (!a) return res.status(404).json({ success: false, error: 'Registro não encontrado' });
        res.json({ success: true, message: 'Registro excluído com sucesso' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;