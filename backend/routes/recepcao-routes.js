// backend/routes/recepcao-routes.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

// ============================================
// LAZY LOADING
// ============================================
function getUser() { return require('../models/User'); }
function getAutorizacao() { return require('../models/Autorizacao'); }
function getSessaoAssinatura() { return require('../models/SessaoAssinatura'); }
function getAtraso() { return require('../models/Atraso'); }

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
function formatarPeriodo(inicio, fim) {
    if (!inicio) return null;
    const ini = new Date(inicio);
    const f = fim ? new Date(fim) : ini;
    const iniDia = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate());
    const fimDia = new Date(f.getFullYear(), f.getMonth(), f.getDate());
    const fmt = (d) => d.toLocaleDateString('pt-BR');
    if (iniDia.getTime() === fimDia.getTime()) return fmt(iniDia);
    return `${fmt(iniDia)} a ${fmt(fimDia)}`;
}
function getPeriodoFaltaFormatado(doc) {
    return formatarPeriodo(doc?.periodoFaltaInicio, doc?.periodoFaltaFim);
}
function getUniformePeriodoFormatado(doc) {
    return formatarPeriodo(doc?.uniformePeriodoInicio, doc?.uniformePeriodoFim);
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
function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
// 5. VERIFICAR AUTORIZAÇÃO (AGRUPADA + HISTÓRICO COM FILTROS)
// ============================================
router.get('/verificar/:alunoId', authenticateToken, verificarRecepcao, async (req, res) => {
    try {
        const Autorizacao = getAutorizacao();
        const User = getUser();
        const { alunoId } = req.params;
        const {
            data,
            // 🆕 Filtros do histórico de atrasos
            atrasoMotivo,
            atrasoBusca,
            atrasoDataInicio,
            atrasoDataFim
        } = req.query;

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
            ativo: true,
            tipo: { $in: ['autorizacao', 'uniforme'] },
            $or: [
                { data: { $gte: inicio, $lte: fim } },
                { periodoFaltaInicio: { $lte: fim }, periodoFaltaFim: { $gte: inicio } },
                {
                    periodoFaltaInicio: { $gte: inicio, $lte: fim },
                    $or: [
                        { periodoFaltaFim: null },
                        { periodoFaltaFim: { $exists: false } }
                    ]
                },
                { uniformePeriodoInicio: { $lte: fim }, uniformePeriodoFim: { $gte: inicio } },
                {
                    uniformePeriodoInicio: { $gte: inicio, $lte: fim },
                    $or: [
                        { uniformePeriodoFim: null },
                        { uniformePeriodoFim: { $exists: false } }
                    ]
                }
            ]
        }).sort({ data: -1 });

        // ============================================
        // 🆕 HISTÓRICO DE ATRASOS COM FILTROS
        // ============================================
        let atrasos = [];
        let totalAtrasosSemFiltro = 0;
        try {
            const Atraso = getAtraso();

            // Query base (sem filtros) para contar total
            const queryBase = { alunoId: alunoId, ativo: { $ne: false } };
            totalAtrasosSemFiltro = await Atraso.countDocuments(queryBase);

            // Aplica filtros
            const query = { ...queryBase };

            if (atrasoMotivo && atrasoMotivo !== 'todos') {
                query.$or = [
                    { motivos: atrasoMotivo },
                    { motivo: atrasoMotivo }
                ];
            }

            if (atrasoBusca && atrasoBusca.trim()) {
                const regex = new RegExp(escapeRegex(atrasoBusca.trim()), 'i');
                const buscaOr = [
                    { descricao: regex },
                    { observacoes: regex }
                ];
                // Combina com $or existente (motivo) usando $and
                if (query.$or) {
                    query.$and = [
                        { $or: query.$or },
                        { $or: buscaOr }
                    ];
                    delete query.$or;
                } else {
                    query.$or = buscaOr;
                }
            }

            if (atrasoDataInicio || atrasoDataFim) {
                query.dataHora = {};
                if (atrasoDataInicio) query.dataHora.$gte = inicioDoDiaBrasil(atrasoDataInicio);
                if (atrasoDataFim) query.dataHora.$lte = fimDoDiaBrasil(atrasoDataFim);
            }

            atrasos = await Atraso.find(query)
                .sort({ dataHora: -1 })
                .limit(100)
                .lean();
        } catch (err) {
            console.warn('⚠️ Erro ao buscar atrasos:', err.message);
            atrasos = [];
        }

        const formatarAutorizacao = (a) => ({
            id: a._id,
            tipo: a.tipo,
            data: a.data,
            dataFormatada: new Date(a.data).toLocaleDateString('pt-BR'),
            periodoFaltaInicio: a.periodoFaltaInicio,
            periodoFaltaFim: a.periodoFaltaFim,
            periodoFaltaFormatado: getPeriodoFaltaFormatado(a),
            uniformePeriodoInicio: a.uniformePeriodoInicio || null,
            uniformePeriodoFim: a.uniformePeriodoFim || null,
            uniformePeriodoFormatado: getUniformePeriodoFormatado(a),
            dataEntrada: a.dataEntrada,
            dataSaida: a.dataSaida,
            dataEntradaFormatada: a.dataEntrada ? new Date(a.dataEntrada).toLocaleDateString('pt-BR') : null,
            dataSaidaFormatada: a.dataSaida ? new Date(a.dataSaida).toLocaleDateString('pt-BR') : null,
            entradaCompleta: getEntradaCompleta(a),
            saidaCompleta: getSaidaCompleta(a),
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
        });

        const formatadas = autorizacoes.map(formatarAutorizacao);

        const autorizacoesArr = formatadas.filter(a => a.tipo === 'autorizacao');
        const uniformesArr = formatadas.filter(a => a.tipo === 'uniforme');

        const motivosLabels = {
            onibus: 'Ônibus', transito: 'Trânsito',
            problemas_pessoais: 'Problemas Pessoais', fardamento: 'Fardamento', outros: 'Outros'
        };
        const atrasosFormatados = (atrasos || []).map(a => {
            const motivosArr = Array.isArray(a.motivos) && a.motivos.length > 0
                ? a.motivos
                : (a.motivo ? [a.motivo] : []);
            return {
                id: a._id,
                dataHora: a.dataHora,
                dataHoraFormatada: a.dataHora ? new Date(a.dataHora).toLocaleString('pt-BR') : '-',
                dataFormatada: a.dataHora ? new Date(a.dataHora).toLocaleDateString('pt-BR') : '-',
                horaFormatada: a.dataHora ? new Date(a.dataHora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-',
                motivos: motivosArr,
                motivosLabel: motivosArr.map(m => motivosLabels[m] || m).join(' + '),
                descricao: a.descricao || '',
                observacoes: a.observacoes || '',
                temAssinatura: !!a.temAssinatura,
                registradoPor: a.registradoPor || a.registradoPorNome || '-'
            };
        });

        // Contagem por motivo (para os chips de filtro)
        let contagemPorMotivo = {};
        try {
            const Atraso = getAtraso();
            const agg = await Atraso.aggregate([
                { $match: { alunoId: new (require('mongoose').Types.ObjectId)(alunoId), ativo: { $ne: false } } },
                { $unwind: { path: '$motivos', preserveNullAndEmptyArrays: true } },
                { $group: { _id: { $ifNull: ['$motivos', '$motivo'] }, count: { $sum: 1 } } }
            ]);
            agg.forEach(item => {
                if (item._id) contagemPorMotivo[item._id] = item.count;
            });
        } catch (err) {
            console.warn('Erro na contagem por motivo:', err.message);
        }

        res.json({
            success: true,
            aluno: {
                id: aluno._id, nome: aluno.nome, matricula: aluno.matricula,
                turma: aluno.turma, curso: aluno.curso, fotoPerfil: aluno.fotoPerfil || null
            },
            dataConsulta: dataBusca,
            dataConsultaFormatada: new Date(dataBusca + 'T12:00:00').toLocaleDateString('pt-BR'),
            temAutorizacao: formatadas.length > 0,
            totalAutorizacoes: formatadas.length,
            agrupado: {
                autorizacoes: autorizacoesArr,
                uniforme: uniformesArr
            },
            totalPorModulo: {
                autorizacoes: autorizacoesArr.length,
                uniforme: uniformesArr.length
            },
            autorizacoes: formatadas,
            totalAtrasos: totalAtrasosSemFiltro,
            atrasosFiltrados: atrasosFormatados.length,
            atrasos: atrasosFormatados,
            contagemPorMotivo
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
                uniformePeriodoInicio: a.uniformePeriodoInicio || null,
                uniformePeriodoFim: a.uniformePeriodoFim || null,
                uniformePeriodoFormatado: getUniformePeriodoFormatado(a),
                dataEntrada: a.dataEntrada,
                dataSaida: a.dataSaida,
                dataEntradaFormatada: a.dataEntrada ? new Date(a.dataEntrada).toLocaleDateString('pt-BR') : null,
                dataSaidaFormatada: a.dataSaida ? new Date(a.dataSaida).toLocaleDateString('pt-BR') : null,
                entradaCompleta: getEntradaCompleta(a),
                saidaCompleta: getSaidaCompleta(a),
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
// 6.1 ATUALIZAR ASSINATURA
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

        autorizacao.assinaturaBase64 = assinaturaBase64;
        autorizacao.temAssinatura = true;
        autorizacao.statusAssinatura = 'assinada';
        autorizacao.assinadaEm = new Date();
        autorizacao.assinadaPor = req.userId;
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
// 6.2 REMOVER ASSINATURA
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
        autorizacao.statusAssinatura = 'pendente';
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
// 6.3 CRIAR SESSÃO DE ASSINATURA
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
                alunoId, alunoNome, alunoTurma, alunoMatricula, alunoCurso,
                responsavelNome, tipoAssinante: 'responsavel'
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
// 6.4 CONSULTAR SESSÃO
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
// 6.5 CANCELAR SESSÃO
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
// 7. LISTAR AUTORIZAÇÕES DO DIA (COM FILTROS)
// ============================================
router.get('/autorizacoes-do-dia', authenticateToken, verificarRecepcao, async (req, res) => {
    try {
        const Autorizacao = getAutorizacao();
        const {
            data,
            turma,
            tipo,        // 🆕 'todos' | 'autorizacao' | 'uniforme'
            busca,       // 🆕 nome ou matrícula
            page = 1,
            limit = 10
        } = req.query;

        const dataBusca = data || getDataLocalISO();
        const inicio = inicioDoDiaBrasil(dataBusca);
        const fim = fimDoDiaBrasil(dataBusca);

        const pageNum = Math.max(1, parseInt(page) || 1);
        const limitNum = Math.min(100, Math.max(5, parseInt(limit) || 10));
        const skip = (pageNum - 1) * limitNum;

        // Filtro de tipo
        let tipos = ['autorizacao', 'uniforme'];
        if (tipo && tipo !== 'todos') {
            tipos = [tipo];
        }

        let query = {
            ativo: true,
            tipo: { $in: tipos },
            $or: [
                { data: { $gte: inicio, $lte: fim } },
                { periodoFaltaInicio: { $lte: fim }, periodoFaltaFim: { $gte: inicio } },
                { uniformePeriodoInicio: { $lte: fim }, uniformePeriodoFim: { $gte: inicio } }
            ]
        };

        if (turma && turma !== 'todas') query.alunoTurma = turma;

        // 🆕 Busca por nome ou matrícula
        if (busca && busca.trim()) {
            const regex = new RegExp(escapeRegex(busca.trim()), 'i');
            const buscaOr = [
                { alunoNome: regex },
                { alunoMatricula: regex }
            ];
            if (query.$or) {
                query.$and = [
                    { $or: query.$or },
                    { $or: buscaOr }
                ];
                delete query.$or;
            } else {
                query.$or = buscaOr;
            }
        }

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
                tipo: a.tipo,
                alunoNome: a.alunoNome,
                alunoMatricula: a.alunoMatricula,
                alunoTurma: a.alunoTurma,
                entradaCompleta: getEntradaCompleta(a),
                saidaCompleta: getSaidaCompleta(a),
                horarioEntrada: a.horarioEntrada,
                horarioSaida: a.horarioSaida,
                periodoFaltaFormatado: getPeriodoFaltaFormatado(a),
                uniformePeriodoFormatado: getUniformePeriodoFormatado(a),
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
            ativo: true,
            tipo: { $in: ['autorizacao', 'uniforme'] },
            $or: [
                { data: { $gte: inicio, $lte: fim } },
                { periodoFaltaInicio: { $lte: fim }, periodoFaltaFim: { $gte: inicio } },
                { uniformePeriodoInicio: { $lte: fim }, uniformePeriodoFim: { $gte: inicio } }
            ]
        };

        const [total, comAssinatura, porTurma, porMotivo, porTipo] = await Promise.all([
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
            ]),
            Autorizacao.aggregate([
                { $match: matchStage },
                { $group: { _id: '$tipo', count: { $sum: 1 } } }
            ])
        ]);

        res.json({
            success: true,
            data: dataBusca,
            dataFormatada: new Date(dataBusca + 'T12:00:00').toLocaleDateString('pt-BR'),
            estatisticas: { total, comAssinatura, semAssinatura: total - comAssinatura },
            porTurma: porTurma.map(t => ({ turma: t._id || 'Sem turma', count: t.count })),
            porTipo: porTipo.map(t => ({ tipo: t._id, count: t.count })),
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