// backend/routes/protocolo-provas-routes.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

// Lazy loading do model
function getProtocoloProva() {
    return require('../models/ProtocoloProva');
}

// ============================================
// MIDDLEWARE DE AUTENTICAÇÃO
// ============================================
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, error: 'Token não fornecido' });
    }

    jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
        if (err) {
            return res.status(403).json({ success: false, error: 'Token inválido' });
        }

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
            console.error('❌ Erro ao buscar usuário:', dbError);
            return res.status(500).json({ success: false, error: 'Erro ao autenticar' });
        }
    });
};

// Middleware: apenas setor_pedagogico, admin ou super_admin
const apenasSetorPedagogico = (req, res, next) => {
    const rolesPermitidos = ['setor_pedagogico', 'admin', 'super_admin'];
    if (!rolesPermitidos.includes(req.userRole)) {
        return res.status(403).json({
            success: false,
            error: 'Acesso permitido apenas para o Setor Pedagógico'
        });
    }
    next();
};

// ============================================
// CONSTANTES
// ============================================
const TIPOS_PROVA = ['AV1', 'AV2', 'AV3', 'AV4', '2CHAMADA', 'RECUPERACAO', 'FINAL', 'OUTROS'];
const PERIODOS = [1, 2, 3, 4];

// ============================================
// HEALTH CHECK
// ============================================
router.get('/health', (req, res) => {
    res.json({ success: true, status: 'online', service: 'Protocolo de Provas' });
});

// ============================================
// 📚 BUSCAR PROFESSORES (para o select)
// GET /api/protocolo-provas/professores
// ============================================
router.get('/professores', authenticateToken, apenasSetorPedagogico, async (req, res) => {
    try {
        const User = require('../models/User');

        const professores = await User.find({
            role: 'professor',
            ativo: { $ne: false }
        })
        .select('_id nome email matricula cpf telefone eixo departamento titulacao fotoPerfil')
        .sort({ nome: 1 })
        .lean();

        res.json({
            success: true,
            professores: professores.map(p => ({
                id: p._id,
                nome: p.nome,
                email: p.email,
                matricula: p.matricula,
                cpf: p.cpf,
                telefone: p.telefone,
                eixo: p.eixo,
                departamento: p.departamento,
                titulacao: p.titulacao,
                fotoPerfil: p.fotoPerfil
            })),
            total: professores.length
        });
    } catch (error) {
        console.error('❌ Erro ao buscar professores:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 🏫 BUSCAR TURMAS (para o select)
// GET /api/protocolo-provas/turmas
// ============================================
router.get('/turmas', authenticateToken, apenasSetorPedagogico, async (req, res) => {
    try {
        const User = require('../models/User');

        // Buscar turmas únicas dos alunos
        const alunos = await User.find({
            role: 'aluno',
            ativo: { $ne: false },
            turma: { $exists: true, $ne: '' }
        })
        .select('turma')
        .lean();

        const turmasSet = new Set();
        alunos.forEach(a => {
            if (a.turma && a.turma.trim()) {
                turmasSet.add(a.turma.trim());
            }
        });

        const turmas = Array.from(turmasSet).sort();

        res.json({
            success: true,
            turmas,
            total: turmas.length
        });
    } catch (error) {
        console.error('❌ Erro ao buscar turmas:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 👨‍🎓 BUSCAR ALUNOS DE UMA TURMA
// GET /api/protocolo-provas/alunos-por-turma?turma=103
// ============================================
router.get('/alunos-por-turma', authenticateToken, apenasSetorPedagogico, async (req, res) => {
    try {
        const { turma } = req.query;

        if (!turma) {
            return res.status(400).json({ success: false, error: 'Turma não informada' });
        }

        const User = require('../models/User');

        const alunos = await User.find({
            role: 'aluno',
            turma: turma.trim(),
            ativo: { $ne: false }
        })
        .select('_id nome matricula curso turma fotoPerfil')
        .sort({ nome: 1 })
        .lean();

        res.json({
            success: true,
            turma,
            alunos: alunos.map(a => ({
                id: a._id,
                nome: a.nome,
                matricula: a.matricula,
                curso: a.curso,
                turma: a.turma,
                fotoPerfil: a.fotoPerfil
            })),
            total: alunos.length
        });
    } catch (error) {
        console.error('❌ Erro ao buscar alunos:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 📋 LISTAR PROTOCOLOS (com filtros e paginação)
// GET /api/protocolo-provas/listar?page=1&limit=10&...
// ============================================
router.get('/listar', authenticateToken, apenasSetorPedagogico, async (req, res) => {
    try {
        const ProtocoloProva = getProtocoloProva();
        
        const {
            page = 1,
            limit = 10,
            professorId,
            professorNome,
            tipoProva,
            periodo,
            dataInicio,
            dataFim,
            turma,
            busca
        } = req.query;

        const filtro = { ativo: true };

        if (professorId) filtro.professorId = professorId;
        if (tipoProva && tipoProva !== 'todos') filtro.tipoProva = tipoProva;
        if (periodo && periodo !== 'todos') filtro.periodo = parseInt(periodo);
        if (turma) filtro['turmas.turma'] = turma;

        if (professorNome) {
            filtro.professorNome = { $regex: professorNome, $options: 'i' };
        }

        if (busca) {
            filtro.$or = [
                { codigo: { $regex: busca, $options: 'i' } },
                { professorNome: { $regex: busca, $options: 'i' } },
                { 'turmas.turma': { $regex: busca, $options: 'i' } }
            ];
        }

        if (dataInicio || dataFim) {
            filtro.dataRecebimento = {};
            if (dataInicio) {
                const inicio = new Date(dataInicio + 'T00:00:00');
                filtro.dataRecebimento.$gte = inicio;
            }
            if (dataFim) {
                const fim = new Date(dataFim + 'T23:59:59');
                filtro.dataRecebimento.$lte = fim;
            }
        }

        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const skip = (pageNum - 1) * limitNum;

        const [protocolos, total] = await Promise.all([
            ProtocoloProva.find(filtro)
                .sort({ dataRecebimento: -1, createdAt: -1 })
                .skip(skip)
                .limit(limitNum)
                .lean(),
            ProtocoloProva.countDocuments(filtro)
        ]);

        const protocolosFormatados = protocolos.map(p => ({
            id: p._id,
            codigo: p.codigo,
            professorId: p.professorId,
            professorNome: p.professorNome,
            professorEmail: p.professorEmail,
            professorMatricula: p.professorMatricula,
            professorFotoPerfil: p.professorFotoPerfil,
            dataRecebimento: p.dataRecebimento,
            dataFormatada: new Date(p.dataRecebimento).toLocaleDateString('pt-BR'),
            diaSemana: new Date(p.dataRecebimento).toLocaleDateString('pt-BR', { weekday: 'long' }),
            tipoProva: p.tipoProva,
            tipoProvaOutros: p.tipoProvaOutros,
            tipoProvaFormatado: p.tipoProva === 'OUTROS' && p.tipoProvaOutros 
                ? `OUTROS (${p.tipoProvaOutros})` 
                : p.tipoProva,
            periodo: p.periodo,
            periodoFormatado: `${p.periodo}º Período`,
            turmas: p.turmas || [],
            turmasResumo: (p.turmas || []).map(t => `${t.turma} (${t.quantidadeProvas})`).join(', '),
            totalProvas: p.totalProvas || 0,
            observacoes: p.observacoes,
            temAssinatura: p.temAssinatura,
            assinaturaBase64: p.assinaturaBase64,
            assinadaEm: p.assinadaEm,
            assinadaPorNome: p.assinadaPorNome,
            registradoPorNome: p.registradoPorNome,
            createdAt: p.createdAt
        }));

        res.json({
            success: true,
            protocolos: protocolosFormatados,
            pagination: {
                total,
                page: pageNum,
                limit: limitNum,
                pages: Math.ceil(total / limitNum)
            }
        });
    } catch (error) {
        console.error('❌ Erro ao listar protocolos:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 🔍 BUSCAR UM PROTOCOLO POR ID
// GET /api/protocolo-provas/:id
// ============================================
router.get('/:id', authenticateToken, apenasSetorPedagogico, async (req, res) => {
    try {
        const ProtocoloProva = getProtocoloProva();

        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, error: 'ID inválido' });
        }

        const protocolo = await ProtocoloProva.findById(req.params.id).lean();

        if (!protocolo) {
            return res.status(404).json({ success: false, error: 'Protocolo não encontrado' });
        }

        res.json({
            success: true,
            protocolo: {
                ...protocolo,
                id: protocolo._id,
                dataFormatada: new Date(protocolo.dataRecebimento).toLocaleDateString('pt-BR'),
                diaSemana: new Date(protocolo.dataRecebimento).toLocaleDateString('pt-BR', { weekday: 'long' }),
                tipoProvaFormatado: protocolo.tipoProva === 'OUTROS' && protocolo.tipoProvaOutros 
                    ? `OUTROS (${protocolo.tipoProvaOutros})` 
                    : protocolo.tipoProva,
                periodoFormatado: `${protocolo.periodo}º Período`,
                turmasResumo: (protocolo.turmas || []).map(t => `${t.turma} (${t.quantidadeProvas})`).join(', ')
            }
        });
    } catch (error) {
        console.error('❌ Erro ao buscar protocolo:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// ✅ REGISTRAR NOVO PROTOCOLO
// POST /api/protocolo-provas/registrar
// ============================================
router.post('/registrar', authenticateToken, apenasSetorPedagogico, async (req, res) => {
    try {
        const ProtocoloProva = getProtocoloProva();
        const User = require('../models/User');

        const {
            professorId,
            dataRecebimento,
            tipoProva,
            tipoProvaOutros,
            periodo,
            turmas,
            observacoes,
            assinaturaBase64
        } = req.body;

        // ===== VALIDAÇÕES =====
        if (!professorId) {
            return res.status(400).json({ success: false, error: 'Professor é obrigatório' });
        }

        if (!mongoose.Types.ObjectId.isValid(professorId)) {
            return res.status(400).json({ success: false, error: 'ID do professor inválido' });
        }

        if (!dataRecebimento) {
            return res.status(400).json({ success: false, error: 'Data de recebimento é obrigatória' });
        }

        if (!tipoProva || !TIPOS_PROVA.includes(tipoProva)) {
            return res.status(400).json({ success: false, error: 'Tipo de prova inválido' });
        }

        if (tipoProva === 'OUTROS' && !tipoProvaOutros) {
            return res.status(400).json({ success: false, error: 'Especifique o tipo de prova (Outros)' });
        }

        if (!periodo || !PERIODOS.includes(parseInt(periodo))) {
            return res.status(400).json({ success: false, error: 'Período inválido' });
        }

        if (!turmas || !Array.isArray(turmas) || turmas.length === 0) {
            return res.status(400).json({ success: false, error: 'Selecione pelo menos uma turma' });
        }

        // Validar cada turma
        for (const t of turmas) {
            if (!t.turma) {
                return res.status(400).json({ success: false, error: 'Nome da turma é obrigatório' });
            }
            if (!t.quantidadeProvas || t.quantidadeProvas < 1) {
                return res.status(400).json({ success: false, error: `Quantidade inválida para a turma ${t.turma}` });
            }
            if (!t.alunos || !Array.isArray(t.alunos) || t.alunos.length !== t.quantidadeProvas) {
                return res.status(400).json({ 
                    success: false, 
                    error: `A turma ${t.turma} precisa ter exatamente ${t.quantidadeProvas} aluno(s) selecionado(s). Foram selecionados: ${(t.alunos || []).length}` 
                });
            }
        }

        // ===== BUSCAR PROFESSOR =====
        const professor = await User.findById(professorId).lean();

        if (!professor) {
            return res.status(404).json({ success: false, error: 'Professor não encontrado' });
        }

        if (professor.role !== 'professor') {
            return res.status(400).json({ success: false, error: 'Usuário não é um professor' });
        }

        // ===== VERIFICAR DUPLICATA =====
        // Mesmo professor + mesma data + mesmo tipo + mesmo período
        const dataInicio = new Date(dataRecebimento + 'T00:00:00');
        const dataFim = new Date(dataRecebimento + 'T23:59:59');

        const duplicado = await ProtocoloProva.findOne({
            professorId: professorId,
            tipoProva,
            periodo: parseInt(periodo),
            dataRecebimento: { $gte: dataInicio, $lte: dataFim },
            ativo: true
        });

        if (duplicado) {
            return res.status(409).json({
                success: false,
                error: `Já existe um protocolo registrado para este professor com o mesmo tipo de prova (${tipoProva}) e período (${periodo}º) nesta data.`,
                duplicado: {
                    id: duplicado._id,
                    codigo: duplicado.codigo,
                    registradoPor: duplicado.registradoPorNome,
                    data: duplicado.dataRecebimento
                }
            });
        }

        // ===== CRIAR PROTOCOLO =====
        const novoProtocolo = new ProtocoloProva({
            professorId: professor._id,
            professorNome: professor.nome,
            professorEmail: professor.email,
            professorMatricula: professor.matricula,
            professorCpf: professor.cpf,
            professorTelefone: professor.telefone,
            professorEixo: professor.eixo,
            professorFotoPerfil: professor.fotoPerfil,

            dataRecebimento: new Date(dataRecebimento + 'T12:00:00'),
            tipoProva,
            tipoProvaOutros: tipoProva === 'OUTROS' ? tipoProvaOutros : null,
            periodo: parseInt(periodo),

            turmas: turmas.map(t => ({
                turma: t.turma,
                turmaId: t.turmaId || null,
                quantidadeProvas: t.quantidadeProvas,
                alunos: t.alunos.map(a => ({
                    alunoId: a.id || a.alunoId,
                    nome: a.nome,
                    matricula: a.matricula,
                    curso: a.curso
                }))
            })),

            observacoes: observacoes || '',
            assinaturaBase64: assinaturaBase64 || null,
            assinadaEm: assinaturaBase64 ? new Date() : null,
            assinadaPorNome: assinaturaBase64 ? professor.nome : null,

            registradoPor: req.userId,
            registradoPorNome: req.userNome
        });

        await novoProtocolo.save();

        console.log(`✅ Protocolo criado: ${novoProtocolo.codigo} | ${professor.nome} | ${tipoProva} | ${novoProtocolo.totalProvas} provas`);

        res.status(201).json({
            success: true,
            message: `Protocolo ${novoProtocolo.codigo} registrado com sucesso!`,
            protocolo: {
                id: novoProtocolo._id,
                codigo: novoProtocolo.codigo,
                totalProvas: novoProtocolo.totalProvas,
                professorNome: novoProtocolo.professorNome,
                dataRecebimento: novoProtocolo.dataRecebimento
            }
        });

    } catch (error) {
        console.error('❌ Erro ao registrar protocolo:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// ✏️ EDITAR PROTOCOLO
// PUT /api/protocolo-provas/:id
// ============================================
router.put('/:id', authenticateToken, apenasSetorPedagogico, async (req, res) => {
    try {
        const ProtocoloProva = getProtocoloProva();

        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, error: 'ID inválido' });
        }

        const protocolo = await ProtocoloProva.findById(req.params.id);

        if (!protocolo) {
            return res.status(404).json({ success: false, error: 'Protocolo não encontrado' });
        }

        const {
            dataRecebimento,
            tipoProva,
            tipoProvaOutros,
            periodo,
            turmas,
            observacoes
        } = req.body;

        // Validações (apenas se vierem)
        if (tipoProva && !TIPOS_PROVA.includes(tipoProva)) {
            return res.status(400).json({ success: false, error: 'Tipo de prova inválido' });
        }

        if (tipoProva === 'OUTROS' && tipoProvaOutros !== undefined && !tipoProvaOutros) {
            return res.status(400).json({ success: false, error: 'Especifique o tipo de prova (Outros)' });
        }

        if (periodo && !PERIODOS.includes(parseInt(periodo))) {
            return res.status(400).json({ success: false, error: 'Período inválido' });
        }

        if (turmas && Array.isArray(turmas)) {
            for (const t of turmas) {
                if (!t.turma) {
                    return res.status(400).json({ success: false, error: 'Nome da turma é obrigatório' });
                }
                if (!t.quantidadeProvas || t.quantidadeProvas < 1) {
                    return res.status(400).json({ success: false, error: `Quantidade inválida para a turma ${t.turma}` });
                }
                if (!t.alunos || t.alunos.length !== t.quantidadeProvas) {
                    return res.status(400).json({ 
                        success: false, 
                        error: `A turma ${t.turma} precisa ter exatamente ${t.quantidadeProvas} aluno(s) selecionado(s)` 
                    });
                }
            }
        }

        // Aplicar alterações
        if (dataRecebimento) {
            protocolo.dataRecebimento = new Date(dataRecebimento + 'T12:00:00');
        }
        if (tipoProva) protocolo.tipoProva = tipoProva;
        if (tipoProvaOutros !== undefined) {
            protocolo.tipoProvaOutros = tipoProva === 'OUTROS' ? tipoProvaOutros : null;
        }
        if (periodo) protocolo.periodo = parseInt(periodo);
        if (observacoes !== undefined) protocolo.observacoes = observacoes;
        if (turmas && Array.isArray(turmas)) {
            protocolo.turmas = turmas.map(t => ({
                turma: t.turma,
                turmaId: t.turmaId || null,
                quantidadeProvas: t.quantidadeProvas,
                alunos: t.alunos.map(a => ({
                    alunoId: a.id || a.alunoId,
                    nome: a.nome,
                    matricula: a.matricula,
                    curso: a.curso
                }))
            }));
        }

        protocolo.atualizadoEm = new Date();
        protocolo.atualizadoPor = req.userId;
        protocolo.atualizadoPorNome = req.userNome;

        await protocolo.save();

        console.log(`✅ Protocolo atualizado: ${protocolo.codigo}`);

        res.json({
            success: true,
            message: 'Protocolo atualizado com sucesso!',
            protocolo: {
                id: protocolo._id,
                codigo: protocolo.codigo
            }
        });

    } catch (error) {
        console.error('❌ Erro ao editar protocolo:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 🗑️ EXCLUIR PROTOCOLO (soft delete)
// DELETE /api/protocolo-provas/:id
// ============================================
router.delete('/:id', authenticateToken, apenasSetorPedagogico, async (req, res) => {
    try {
        const ProtocoloProva = getProtocoloProva();

        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, error: 'ID inválido' });
        }

        // 🔥 EXCLUSÃO REAL DO BANCO DE DADOS
        const protocolo = await ProtocoloProva.findByIdAndDelete(req.params.id);

        if (!protocolo) {
            return res.status(404).json({ success: false, error: 'Protocolo não encontrado' });
        }

        console.log(`🗑️ Protocolo EXCLUÍDO PERMANENTEMENTE do banco: ${protocolo.codigo}`);

        res.json({
            success: true,
            message: `Protocolo ${protocolo.codigo} excluído permanentemente com sucesso!`
        });

    } catch (error) {
        console.error('❌ Erro ao excluir protocolo:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 📊 ESTATÍSTICAS / DASHBOARD
// GET /api/protocolo-provas/dashboard
// ============================================
router.get('/dashboard/resumo', authenticateToken, apenasSetorPedagogico, async (req, res) => {
    try {
        const ProtocoloProva = getProtocoloProva();

        const { mes } = req.query;
        const mesRef = mes || new Date().toISOString().substring(0, 7);

        const [ano, mesNum] = mesRef.split('-').map(Number);
        const inicioMes = new Date(ano, mesNum - 1, 1);
        const fimMes = new Date(ano, mesNum, 0, 23, 59, 59);

        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const inicioSemana = new Date(hoje);
        inicioSemana.setDate(hoje.getDate() - 7);

        // Estatísticas gerais
        const [totalGeral, totalMes, totalSemana, totalHoje] = await Promise.all([
            ProtocoloProva.countDocuments({ ativo: true }),
            ProtocoloProva.countDocuments({ ativo: true, dataRecebimento: { $gte: inicioMes, $lte: fimMes } }),
            ProtocoloProva.countDocuments({ ativo: true, dataRecebimento: { $gte: inicioSemana } }),
            ProtocoloProva.countDocuments({ ativo: true, dataRecebimento: { $gte: hoje } })
        ]);

        // Total de provas no mês
        const provasMes = await ProtocoloProva.aggregate([
            { $match: { ativo: true, dataRecebimento: { $gte: inicioMes, $lte: fimMes } } },
            { $group: { _id: null, total: { $sum: '$totalProvas' } } }
        ]);

        // Por tipo de prova
        const porTipo = await ProtocoloProva.aggregate([
            { $match: { ativo: true, dataRecebimento: { $gte: inicioMes, $lte: fimMes } } },
            { $group: { _id: '$tipoProva', count: { $sum: 1 }, provas: { $sum: '$totalProvas' } } },
            { $sort: { count: -1 } }
        ]);

        // Por período
        const porPeriodo = await ProtocoloProva.aggregate([
            { $match: { ativo: true, dataRecebimento: { $gte: inicioMes, $lte: fimMes } } },
            { $group: { _id: '$periodo', count: { $sum: 1 }, provas: { $sum: '$totalProvas' } } },
            { $sort: { _id: 1 } }
        ]);

        // Por professor (top 5)
        const porProfessor = await ProtocoloProva.aggregate([
            { $match: { ativo: true, dataRecebimento: { $gte: inicioMes, $lte: fimMes } } },
            { $group: { 
                _id: '$professorId', 
                nome: { $first: '$professorNome' },
                count: { $sum: 1 },
                provas: { $sum: '$totalProvas' }
            }},
            { $sort: { count: -1 } },
            { $limit: 5 }
        ]);

        // Por turma
        const porTurma = await ProtocoloProva.aggregate([
            { $match: { ativo: true, dataRecebimento: { $gte: inicioMes, $lte: fimMes } } },
            { $unwind: '$turmas' },
            { $group: { 
                _id: '$turmas.turma', 
                count: { $sum: 1 },
                provas: { $sum: '$turmas.quantidadeProvas' }
            }},
            { $sort: { provas: -1 } },
            { $limit: 10 }
        ]);

        // Últimos protocolos
        const ultimos = await ProtocoloProva.find({ ativo: true })
            .sort({ createdAt: -1 })
            .limit(5)
            .lean();

        res.json({
            success: true,
            mes: mesRef,
            resumo: {
                totalGeral,
                totalMes,
                totalSemana,
                totalHoje,
                totalProvasMes: provasMes[0]?.total || 0
            },
            porTipo: porTipo.map(t => ({
                tipo: t._id,
                count: t.count,
                provas: t.provas
            })),
            porPeriodo: porPeriodo.map(p => ({
                periodo: p._id,
                count: p.count,
                provas: p.provas
            })),
            porProfessor: porProfessor.map(p => ({
                professorId: p._id,
                nome: p.nome,
                count: p.count,
                provas: p.provas
            })),
            porTurma: porTurma.map(t => ({
                turma: t._id,
                count: t.count,
                provas: t.provas
            })),
            ultimos: ultimos.map(u => ({
                id: u._id,
                codigo: u.codigo,
                professorNome: u.professorNome,
                dataFormatada: new Date(u.dataRecebimento).toLocaleDateString('pt-BR'),
                tipoProva: u.tipoProva,
                periodo: u.periodo,
                totalProvas: u.totalProvas
            }))
        });
    } catch (error) {
        console.error('❌ Erro no dashboard:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// ✍️ ATUALIZAR ASSINATURA
// PUT /api/protocolo-provas/:id/assinatura
// ============================================
router.put('/:id/assinatura', authenticateToken, apenasSetorPedagogico, async (req, res) => {
    try {
        const ProtocoloProva = getProtocoloProva();

        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, error: 'ID inválido' });
        }

        const { assinaturaBase64, assinadaPorNome } = req.body;

        if (!assinaturaBase64) {
            return res.status(400).json({ success: false, error: 'Assinatura não fornecida' });
        }

        const protocolo = await ProtocoloProva.findById(req.params.id);

        if (!protocolo) {
            return res.status(404).json({ success: false, error: 'Protocolo não encontrado' });
        }

        protocolo.assinaturaBase64 = assinaturaBase64;
        protocolo.temAssinatura = true;
        protocolo.assinadaEm = new Date();
        protocolo.assinadaPorNome = assinadaPorNome || protocolo.professorNome;
        protocolo.atualizadoEm = new Date();
        protocolo.atualizadoPor = req.userId;
        protocolo.atualizadoPorNome = req.userNome;

        await protocolo.save();

        res.json({
            success: true,
            message: 'Assinatura registrada com sucesso!'
        });
    } catch (error) {
        console.error('❌ Erro ao atualizar assinatura:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 📄 DADOS PARA IMPRESSÃO
// GET /api/protocolo-provas/:id/imprimir
// ============================================
router.get('/:id/imprimir', authenticateToken, apenasSetorPedagogico, async (req, res) => {
    try {
        const ProtocoloProva = getProtocoloProva();

        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, error: 'ID inválido' });
        }

        const protocolo = await ProtocoloProva.findById(req.params.id).lean();

        if (!protocolo) {
            return res.status(404).json({ success: false, error: 'Protocolo não encontrado' });
        }

        const data = new Date(protocolo.dataRecebimento);

        res.json({
            success: true,
            protocolo: {
                ...protocolo,
                id: protocolo._id,
                dataFormatada: data.toLocaleDateString('pt-BR'),
                dataExtenso: data.toLocaleDateString('pt-BR', { 
                    day: '2-digit', 
                    month: 'long', 
                    year: 'numeric' 
                }),
                diaSemana: data.toLocaleDateString('pt-BR', { weekday: 'long' }),
                tipoProvaFormatado: protocolo.tipoProva === 'OUTROS' && protocolo.tipoProvaOutros 
                    ? `OUTROS (${protocolo.tipoProvaOutros})` 
                    : protocolo.tipoProva,
                periodoFormatado: `${protocolo.periodo}º Período`,
                totalAlunos: (protocolo.turmas || []).reduce((acc, t) => acc + (t.alunos?.length || 0), 0)
            }
        });
    } catch (error) {
        console.error('❌ Erro ao buscar dados para impressão:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;