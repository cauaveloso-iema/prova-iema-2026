// backend/routes/recepcao-routes.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

// ============================================
// LAZY LOADING
// ============================================
function getUser() { return require('../models/User'); }
function getAutorizacao() { return require('../models/Autorizacao'); }
function getSessaoAssinatura() { return require('../models/SessaoAssinatura'); }

// ============================================
// HELPERS DE DATA (BRASIL)
// ============================================
function inicioDoDiaBrasil(dataStr) {
    return new Date(dataStr + 'T00:00:00.000-03:00');
}
function fimDoDiaBrasil(dataStr) {
    return new Date(dataStr + 'T23:59:59.999-03:00');
}
function getDataLocalISO(dateObj) {
    const d = dateObj || new Date();
    return d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');
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

const verificarRecepcao = (req, res, next) => {
    const allowedRoles = ['recepcao', 'gestao_geral', 'super_admin', 'admin'];
    if (!allowedRoles.includes(req.userRole)) {
        return res.status(403).json({ success: false, error: 'Acesso permitido apenas para Recepção' });
    }
    next();
};

// ============================================
// 1. HEALTH CHECK
// ============================================
router.get('/health', (req, res) => {
    res.json({ success: true, status: 'online', service: 'Recepção - Verificação de Autorizações' });
});

// ============================================
// 2. TURMAS
// ============================================
router.get('/turmas', authenticateToken, verificarRecepcao, async (req, res) => {
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
router.get('/alunos-por-turma', authenticateToken, verificarRecepcao, async (req, res) => {
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
// 4. BUSCAR ALUNO POR ID
// ============================================
router.get('/aluno/:id', authenticateToken, verificarRecepcao, async (req, res) => {
    try {
        const User = getUser();
        if (!req.params.id.match(/^[a-f0-9]{24}$/i)) {
            return res.status(400).json({ success: false, error: 'ID inválido' });
        }
        const aluno = await User.findOne({ _id: req.params.id, ativo: true })
            .select('nome email matricula curso turma fotoPerfil role');
        if (!aluno) return res.status(404).json({ success: false, error: 'Aluno não encontrado' });
        if (aluno.role !== 'aluno') return res.status(400).json({ success: false, error: 'Usuário não é aluno' });
        res.json({
            success: true,
            aluno: {
                id: aluno._id, nome: aluno.nome, matricula: aluno.matricula,
                turma: aluno.turma, curso: aluno.curso, fotoPerfil: aluno.fotoPerfil || null
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 5. VERIFICAR AUTORIZAÇÃO
// ============================================
router.get('/verificar/:alunoId', authenticateToken, verificarRecepcao, async (req, res) => {
    try {
        const Autorizacao = getAutorizacao();
        const User = getUser();
        const { alunoId } = req.params;
        const { data } = req.query;

        if (!alunoId.match(/^[a-f0-9]{24}$/i)) {
            return res.status(400).json({ success: false, error: 'ID do aluno inválido' });
        }

        const aluno = await User.findOne({ _id: alunoId, ativo: true })
            .select('nome matricula turma curso fotoPerfil');
        if (!aluno) {
            return res.status(404).json({ success: false, error: 'Aluno não encontrado' });
        }

        const dataBusca = data || getDataLocalISO();
        const inicio = inicioDoDiaBrasil(dataBusca);
        const fim = fimDoDiaBrasil(dataBusca);

        const autorizacoes = await Autorizacao.find({
            alunoId: alunoId,
            tipo: 'autorizacao',
            ativo: true,
            $or: [
                { data: { $gte: inicio, $lte: fim } },
                { periodoFaltaInicio: { $lte: fim }, periodoFaltaFim: { $gte: inicio } },
                {
                    periodoFaltaInicio: { $gte: inicio, $lte: fim },
                    $or: [
                        { periodoFaltaFim: null },
                        { periodoFaltaFim: { $exists: false } }
                    ]
                }
            ]
        }).sort({ data: -1 });

        const autorizacoesFormatadas = autorizacoes.map(a => ({
            id: a._id,
            tipo: a.tipo,
            data: a.data,
            dataFormatada: new Date(a.data).toLocaleDateString('pt-BR'),
            periodoFaltaInicio: a.periodoFaltaInicio,
            periodoFaltaFim: a.periodoFaltaFim,
            periodoFaltaFormatado: getPeriodoFaltaFormatado(a),
            horarioEntrada: a.horarioEntrada,
            horarioSaida: a.horarioSaida,
            motivo: a.motivo,
            motivoLabel: Autorizacao.getMotivoLabel(a.motivo, a.tipo),
            motivoOutros: a.motivoOutros,
            horarioAusencia: a.horarioAusencia,
            horarioRetorno: a.horarioRetorno,
            responsavelNome: a.responsavelNome,
            responsavelCPF: a.responsavelCPF,
            responsavelTelefone: a.responsavelTelefone,
            observacoes: a.observacoes,
            temAssinatura: a.temAssinatura,
            statusAssinatura: a.statusAssinatura,
            registradoPorNome: a.registradoPorNome,
            createdAt: a.createdAt,
            createdAtFormatado: new Date(a.createdAt).toLocaleString('pt-BR')
        }));

        res.json({
            success: true,
            aluno: {
                id: aluno._id, nome: aluno.nome, matricula: aluno.matricula,
                turma: aluno.turma, curso: aluno.curso, fotoPerfil: aluno.fotoPerfil || null
            },
            dataConsulta: dataBusca,
            dataConsultaFormatada: new Date(dataBusca + 'T12:00:00').toLocaleDateString('pt-BR'),
            temAutorizacao: autorizacoesFormatadas.length > 0,
            totalAutorizacoes: autorizacoesFormatadas.length,
            autorizacoes: autorizacoesFormatadas
        });
    } catch (error) {
        console.error('Erro ao verificar autorização:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 6. BUSCAR AUTORIZAÇÃO POR ID
// ============================================
router.get('/autorizacao/:id', authenticateToken, verificarRecepcao, async (req, res) => {
    try {
        const Autorizacao = getAutorizacao();
        if (!req.params.id.match(/^[a-f0-9]{24}$/i)) {
            return res.status(400).json({ success: false, error: 'ID inválido' });
        }
        const a = await Autorizacao.findById(req.params.id);
        if (!a) return res.status(404).json({ success: false, error: 'Autorização não encontrada' });

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
                periodoFaltaInicio: a.periodoFaltaInicio,
                periodoFaltaFim: a.periodoFaltaFim,
                periodoFaltaFormatado: getPeriodoFaltaFormatado(a),
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
                statusAssinatura: a.statusAssinatura,
                assinadaEm: a.assinadaEm,
                assinadaPorNome: a.assinadaPorNome,
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
// 🔥 6.1. ATUALIZAR ASSINATURA DA AUTORIZAÇÃO
// Enum correto do schema: 'nao_necessaria' | 'pendente' | 'assinada'
// ============================================
router.put('/autorizacao/:id/assinatura', authenticateToken, verificarRecepcao, async (req, res) => {
    try {
        const Autorizacao = getAutorizacao();
        const { id } = req.params;
        const { assinaturaBase64, assinanteNome } = req.body;

        if (!id.match(/^[a-f0-9]{24}$/i)) {
            return res.status(400).json({ success: false, error: 'ID inválido' });
        }
        if (!assinaturaBase64 || typeof assinaturaBase64 !== 'string' || assinaturaBase64.length < 100) {
            return res.status(400).json({ success: false, error: 'Assinatura inválida (base64 muito curto ou vazio)' });
        }
        if (assinaturaBase64.length > 5 * 1024 * 1024) {
            return res.status(413).json({ success: false, error: 'Assinatura muito grande (máx 5MB)' });
        }

        const autorizacao = await Autorizacao.findById(id);
        if (!autorizacao) {
            return res.status(404).json({ success: false, error: 'Autorização não encontrada' });
        }

        // ✅ Enum correto do schema: 'nao_necessaria' | 'pendente' | 'assinada'
        autorizacao.assinaturaBase64 = assinaturaBase64;
        autorizacao.temAssinatura = true;
        autorizacao.statusAssinatura = 'assinada';      // ← FEMININO (correto)
        autorizacao.assinadaEm = new Date();
        autorizacao.assinadaPor = req.userId;           // ← campo correto do schema
        autorizacao.assinadaPorNome = (assinanteNome || req.userNome || 'Recepção').toString().slice(0, 120);

        await autorizacao.save();

        console.log(`✅ [Recepção] Assinatura salva na autorização ${id} por ${req.userNome}`);

        res.json({
            success: true,
            message: 'Assinatura salva com sucesso',
            assinadaEm: autorizacao.assinadaEm,
            assinadaPorNome: autorizacao.assinadaPorNome,
            statusAssinatura: autorizacao.statusAssinatura
        });
    } catch (error) {
        console.error('❌ Erro ao salvar assinatura (Recepção):', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 🔥 6.2. REMOVER ASSINATURA DA AUTORIZAÇÃO
// ============================================
router.delete('/autorizacao/:id/assinatura', authenticateToken, verificarRecepcao, async (req, res) => {
    try {
        const Autorizacao = getAutorizacao();
        const { id } = req.params;

        if (!id.match(/^[a-f0-9]{24}$/i)) {
            return res.status(400).json({ success: false, error: 'ID inválido' });
        }

        const autorizacao = await Autorizacao.findById(id);
        if (!autorizacao) {
            return res.status(404).json({ success: false, error: 'Autorização não encontrada' });
        }

        autorizacao.assinaturaBase64 = '';
        autorizacao.temAssinatura = false;
        autorizacao.statusAssinatura = 'pendente';      // volta ao enum válido
        autorizacao.assinadaEm = null;
        autorizacao.assinadaPor = null;
        autorizacao.assinadaPorNome = null;

        await autorizacao.save();

        console.log(`🗑️ [Recepção] Assinatura removida da autorização ${id} por ${req.userNome}`);

        res.json({ success: true, message: 'Assinatura removida' });
    } catch (error) {
        console.error('❌ Erro ao remover assinatura (Recepção):', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 🔥 6.3. CRIAR SESSÃO DE ASSINATURA (QR CODE)
// ============================================
router.post('/sessoes-assinatura', authenticateToken, verificarRecepcao, async (req, res) => {
    try {
        const SessaoAssinatura = getSessaoAssinatura();
        const {
            sessaoId, autorizacaoId, alunoId, alunoNome, alunoTurma,
            alunoMatricula, alunoCurso, responsavelNome
        } = req.body;

        if (!sessaoId || !autorizacaoId || !alunoId) {
            return res.status(400).json({
                success: false,
                error: 'sessaoId, autorizacaoId e alunoId são obrigatórios'
            });
        }

        const existente = await SessaoAssinatura.findOne({ sessaoId });
        if (existente) {
            return res.json({
                success: true,
                sessaoId: existente.sessaoId,
                expiraEm: existente.expiraEm,
                jaExistia: true
            });
        }

        const expiraEm = new Date(Date.now() + 30 * 60 * 1000);

        const sessao = new SessaoAssinatura({
            sessaoId,
            tipo: 'autorizacao',
            status: 'aguardando',
            dadosAtendimento: {
                alunoId,
                alunoNome,
                alunoTurma,
                alunoMatricula,
                alunoCurso,
                responsavelNome,
                tipoAssinante: 'responsavel'
            },
            criadoPor: req.userId,
            criadoPorNome: req.userNome,
            expiraEm
        });

        await sessao.save();

        console.log(`📱 [Recepção] Sessão de assinatura criada: ${sessaoId} (expira em 30min)`);

        res.json({ success: true, sessaoId, expiraEm });
    } catch (error) {
        console.error('❌ Erro ao criar sessão:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 🔥 6.4. CONSULTAR SESSÃO (polling da Recepção)
// ============================================
router.get('/sessoes-assinatura/:sessaoId', authenticateToken, verificarRecepcao, async (req, res) => {
    try {
        const SessaoAssinatura = getSessaoAssinatura();
        const { sessaoId } = req.params;

        const sessao = await SessaoAssinatura.findOne({ sessaoId });
        if (!sessao) {
            return res.status(404).json({ success: false, error: 'Sessão não encontrada ou expirada' });
        }

        if (sessao.status === 'aguardando' && sessao.expiraEm && new Date() > sessao.expiraEm) {
            sessao.status = 'cancelado';
            await sessao.save();
        }

        res.json({
            success: true,
            sessao: {
                sessaoId: sessao.sessaoId,
                status: sessao.status,
                assinaturaBase64: sessao.assinaturaBase64 || '',
                assinadaPorNome: sessao.assinadaPorNome || '',
                assinadaEm: sessao.assinadaEm,
                expiraEm: sessao.expiraEm,
                dadosAtendimento: sessao.dadosAtendimento
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 🔥 6.5. CANCELAR SESSÃO
// ============================================
router.delete('/sessoes-assinatura/:sessaoId', authenticateToken, verificarRecepcao, async (req, res) => {
    try {
        const SessaoAssinatura = getSessaoAssinatura();
        const { sessaoId } = req.params;

        const sessao = await SessaoAssinatura.findOneAndUpdate(
            { sessaoId },
            { status: 'cancelado' },
            { new: true }
        );

        if (!sessao) {
            return res.status(404).json({ success: false, error: 'Sessão não encontrada' });
        }

        res.json({ success: true, message: 'Sessão cancelada' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 7. LISTAR AUTORIZAÇÕES DO DIA (COM PAGINAÇÃO)
// ============================================
router.get('/autorizacoes-do-dia', authenticateToken, verificarRecepcao, async (req, res) => {
    try {
        const Autorizacao = getAutorizacao();
        const { data, turma, page = 1, limit = 10 } = req.query;

        const dataBusca = data || getDataLocalISO();
        const inicio = inicioDoDiaBrasil(dataBusca);
        const fim = fimDoDiaBrasil(dataBusca);

        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.min(100, Math.max(5, parseInt(limit) || 10));
        const skip = (pageNum - 1) * limitNum;

        let query = {
            tipo: 'autorizacao',
            ativo: true,
            $or: [
                { data: { $gte: inicio, $lte: fim } },
                { periodoFaltaInicio: { $lte: fim }, periodoFaltaFim: { $gte: inicio } }
            ]
        };

        if (turma && turma !== 'todas') query.alunoTurma = turma;

        const [total, autorizacoes] = await Promise.all([
            Autorizacao.countDocuments(query),
            Autorizacao.find(query)
                .select('-assinaturaBase64')
                .sort({ alunoNome: 1 })
                .skip(skip)
                .limit(limitNum)
        ]);

        const totalPages = Math.ceil(total / limitNum);

        res.json({
            success: true,
            data: dataBusca,
            dataFormatada: new Date(dataBusca + 'T12:00:00').toLocaleDateString('pt-BR'),
            total,
            page: pageNum,
            limit: limitNum,
            totalPages,
            autorizacoes: autorizacoes.map(a => ({
                id: a._id,
                alunoNome: a.alunoNome,
                alunoMatricula: a.alunoMatricula,
                alunoTurma: a.alunoTurma,
                horarioEntrada: a.horarioEntrada,
                horarioSaida: a.horarioSaida,
                motivoLabel: Autorizacao.getMotivoLabel(a.motivo, a.tipo),
                temAssinatura: a.temAssinatura
            }))
        });
    } catch (error) {
        console.error('Erro ao listar autorizações do dia:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 8. ESTATÍSTICAS DO DIA
// ============================================
router.get('/estatisticas-dia', authenticateToken, verificarRecepcao, async (req, res) => {
    try {
        const Autorizacao = getAutorizacao();
        const { data } = req.query;

        const dataBusca = data || getDataLocalISO();
        const inicio = inicioDoDiaBrasil(dataBusca);
        const fim = fimDoDiaBrasil(dataBusca);

        const matchStage = {
            tipo: 'autorizacao',
            ativo: true,
            $or: [
                { data: { $gte: inicio, $lte: fim } },
                { periodoFaltaInicio: { $lte: fim }, periodoFaltaFim: { $gte: inicio } }
            ]
        };

        const [total, comAssinatura, porTurma, porMotivo] = await Promise.all([
            Autorizacao.countDocuments(matchStage),
            Autorizacao.countDocuments({ ...matchStage, temAssinatura: true }),
            Autorizacao.aggregate([
                { $match: matchStage },
                { $group: { _id: '$alunoTurma', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]),
            Autorizacao.aggregate([
                { $match: matchStage },
                { $group: { _id: '$motivo', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ])
        ]);

        res.json({
            success: true,
            data: dataBusca,
            dataFormatada: new Date(dataBusca + 'T12:00:00').toLocaleDateString('pt-BR'),
            estatisticas: { total, comAssinatura, semAssinatura: total - comAssinatura },
            porTurma: porTurma.map(t => ({ turma: t._id || 'Sem turma', count: t.count })),
            porMotivo: porMotivo.map(m => ({
                motivo: m._id,
                label: Autorizacao.getMotivoLabel(m._id, 'autorizacao'),
                count: m.count
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;