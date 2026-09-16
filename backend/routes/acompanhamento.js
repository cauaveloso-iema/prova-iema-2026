// ============================================================================
// ROTAS DE ACOMPANHAMENTO DE ALUNOS
// Mostra ao professor ONDE cada aluno está em atendimento (sem detalhes)
// ============================================================================

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const User = require('../models/User');
const AtendimentoEnfermaria = require('../models/AtendimentoEnfermaria');

// ============================================================================
// MODELOS OPCIONAIS
// ============================================================================
let AtendimentoPsicologia = null;
let AtendimentoAssistenteSocial = null;
let AtendimentoSupervisao = null;
let Turma = null;

try { AtendimentoPsicologia = require('../models/AtendimentoPsicologia'); } catch (e) {}
try { AtendimentoAssistenteSocial = require('../models/AtendimentoAssistenteSocial'); } catch (e) {}
try { AtendimentoSupervisao = require('../models/AtendimentoSupervisao'); } catch (e) {}
try { Turma = require('../models/Turma'); } catch (e) {}

// ============================================================================
// MIDDLEWARES
// ============================================================================
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, error: 'Token não fornecido' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({ success: false, error: 'Token inválido ou expirado' });
        }
        req.userId = decoded.id;
        req.userRole = decoded.role;
        req.userNome = decoded.nome;
        next();
    });
};

const verificarProfessor = (req, res, next) => {
    const allowedRoles = ['professor', 'admin', 'super_admin'];
    if (!allowedRoles.includes(req.userRole)) {
        return res.status(403).json({ success: false, error: 'Acesso restrito a professores e admins' });
    }
    next();
};

// ============================================================================
// HELPER: extrair valor com fallback
// ============================================================================
function pegar(obj, ...caminhos) {
    if (!obj) return undefined;
    for (const caminho of caminhos) {
        const valor = caminho.split('.').reduce((o, k) => o?.[k], obj);
        if (valor !== undefined && valor !== null && valor !== '') {
            return valor;
        }
    }
    return undefined;
}

// ============================================================================
// HELPER: buscar TODOS os alunos do banco
// ============================================================================
async function getAlunosDoProfessor(professorId) {
    const alunosIds = new Set();
    const turmasPorAluno = {};

    try {
        const alunos = await User.find({
            role: 'aluno',
            ativo: true,
            turma: { $nin: [null, '', 'Não informada'] }
        })
        .select('_id nome matricula turma curso')
        .lean();

        alunos.forEach(aluno => {
            const idStr = aluno._id.toString();
            alunosIds.add(idStr);
            
            if (!turmasPorAluno[idStr]) turmasPorAluno[idStr] = [];
            
            if (aluno.turma) {
                if (!turmasPorAluno[idStr].some(t => t.nome === aluno.turma)) {
                    turmasPorAluno[idStr].push({
                        id: aluno.turma,
                        nome: aluno.turma,
                        disciplina: aluno.curso || null
                    });
                }
            }
        });
    } catch (e) {
        console.error('❌ Erro ao buscar alunos:', e.message);
    }

    const turmas = [];
    try {
        const turmasNomes = await User.distinct('turma', {
            role: 'aluno',
            ativo: true,
            turma: { $nin: [null, '', 'Não informada'] }
        });
        
        turmasNomes.sort().forEach(nome => {
            const count = Array.from(alunosIds).filter(id => 
                turmasPorAluno[id]?.some(t => t.nome === nome)
            ).length;
            
            turmas.push({
                id: nome,
                nome: nome,
                disciplina: null,
                totalAlunos: count
            });
        });
    } catch (e) {
        console.error('❌ Erro ao buscar turmas:', e.message);
    }

    return {
        turmas,
        alunosIds: Array.from(alunosIds),
        turmasPorAluno
    };
}

// ============================================================================
// HELPER: normalizar atendimento (SEM DADOS SENSÍVEIS)
// ============================================================================
function normalizarAtendimento(doc, config) {
    const alunoId = pegar(doc, 'alunoId', 'aluno', 'userId');
    const alunoNome = pegar(doc, 'alunoNome', 'nomeAluno', 'aluno.nome') || 'Aluno';
    const alunoMatricula = pegar(doc, 'alunoMatricula', 'matriculaAluno', 'aluno.matricula') || '';
    const alunoTurma = pegar(doc, 'alunoTurma', 'turmaAluno', 'aluno.turma') || '';

    const dataHoraInicio = pegar(
        doc,
        config.campoData,
        'entrada.dataHora',
        'dataHoraEntrada',
        'dataInicio',
        'createdAt',
        'created_at',
        'dataCriacao'
    );

    return {
        setor: config.setor,
        setorLabel: config.setorLabel,
        setorIcone: config.setorIcone,
        setorCor: config.setorCor,
        atendimentoId: doc._id.toString(),
        alunoId: alunoId ? alunoId.toString() : null,
        alunoNome,
        alunoMatricula,
        alunoTurma,
        dataHoraInicio
    };
}

// ============================================================================
// HELPER: buscar atendimentos ativos em todos os setores
// ============================================================================
async function buscarAtendimentosAtivos(alunosIds) {
    if (!alunosIds || alunosIds.length === 0) return [];

    const objectIds = alunosIds
        .filter(id => mongoose.Types.ObjectId.isValid(id))
        .map(id => new mongoose.Types.ObjectId(id));

    const todos = [];

    // ========== ENFERMARIA ==========
    try {
        const docs = await AtendimentoEnfermaria.find({
            alunoId: { $in: objectIds },
            status: 'em_atendimento'
        }).lean();

        docs.forEach(doc => {
            todos.push(normalizarAtendimento(doc, {
                setor: 'enfermaria',
                setorLabel: 'Enfermaria',
                setorIcone: '🏥',
                setorCor: '#10b981',
                campoData: 'entrada.dataHora'
            }));
        });
    } catch (e) {
        console.error('❌ Erro Enfermaria:', e.message);
    }

    // ========== PSICOLOGIA ==========
    if (AtendimentoPsicologia) {
        try {
            const docs = await AtendimentoPsicologia.find({
                alunoId: { $in: objectIds },
                $or: [
                    { status: 'em_andamento' },
                    { status: 'em_atendimento' },
                    { status: 'ativo' }
                ]
            }).lean();

            docs.forEach(doc => {
                todos.push(normalizarAtendimento(doc, {
                    setor: 'psicologia',
                    setorLabel: 'Psicologia',
                    setorIcone: '🧠',
                    setorCor: '#14b8a6',
                    campoData: 'entrada.dataHora'
                }));
            });
        } catch (e) {
            console.error('❌ Erro Psicologia:', e.message);
        }
    }

    // ========== ASSISTENTE SOCIAL ==========
    if (AtendimentoAssistenteSocial) {
        try {
            const docs = await AtendimentoAssistenteSocial.find({
                alunoId: { $in: objectIds },
                $or: [
                    { status: 'em_andamento' },
                    { status: 'em_atendimento' },
                    { status: 'ativo' }
                ]
            }).lean();

            docs.forEach(doc => {
                todos.push(normalizarAtendimento(doc, {
                    setor: 'assistente_social',
                    setorLabel: 'Assistente Social',
                    setorIcone: '🤝',
                    setorCor: '#7c3aed',
                    campoData: 'entrada.dataHora'
                }));
            });
        } catch (e) {
            console.error('❌ Erro Assistente Social:', e.message);
        }
    }

    // ========== SUPERVISÃO ==========
    if (AtendimentoSupervisao) {
        try {
            const docs = await AtendimentoSupervisao.find({
                alunoId: { $in: objectIds },
                $or: [
                    { status: 'em_andamento' },
                    { status: 'em_atendimento' },
                    { status: 'ativo' },
                    { status: 'pendente' }
                ]
            }).lean();

            docs.forEach(doc => {
                todos.push(normalizarAtendimento(doc, {
                    setor: 'supervisao',
                    setorLabel: 'Supervisão',
                    setorIcone: '🛡️',
                    setorCor: '#1e3a8a',
                    campoData: 'dataHoraEntrada'
                }));
            });
        } catch (e) {
            console.error('❌ Erro Supervisão:', e.message);
        }
    }

    return todos;
}

// ============================================================================
// HELPER: calcular tempo
// ============================================================================
function calcularTempoMinutos(dataInicio) {
    if (!dataInicio) return 0;
    return Math.max(0, Math.floor((Date.now() - new Date(dataInicio).getTime()) / 60000));
}

function formatarTempo(minutos) {
    if (minutos < 1) return 'agora mesmo';
    if (minutos < 60) return `${minutos} min`;
    const horas = Math.floor(minutos / 60);
    const mins = minutos % 60;
    if (horas < 24) return mins > 0 ? `${horas}h ${mins}min` : `${horas}h`;
    const dias = Math.floor(horas / 24);
    return `${dias}d ${horas % 24}h`;
}

// ============================================================================
// ROTA: /api/acompanhamento/health
// ============================================================================
router.get('/health', (req, res) => {
    res.json({
        success: true,
        service: 'Acompanhamento',
        status: 'online',
        modelos: {
            enfermaria: !!AtendimentoEnfermaria,
            psicologia: !!AtendimentoPsicologia,
            assistenteSocial: !!AtendimentoAssistenteSocial,
            supervisao: !!AtendimentoSupervisao,
            turma: !!Turma
        },
        timestamp: new Date().toISOString()
    });
});

// ============================================================================
// ROTA PRINCIPAL: /api/acompanhamento/ativos
// ============================================================================
router.get('/ativos', authenticateToken, verificarProfessor, async (req, res) => {
    try {
        const professorId = req.userId;
        const { turmaId, setor, busca } = req.query;

        const { alunosIds, turmasPorAluno, turmas } = await getAlunosDoProfessor(professorId);

        if (alunosIds.length === 0) {
            return res.json({
                success: true,
                total: 0,
                alunosUnicos: 0,
                atendimentos: [],
                estatisticas: { total: 0, alunosUnicos: 0, porSetor: {} },
                turmas: [],
                timestamp: new Date().toISOString()
            });
        }

        let atendimentos = await buscarAtendimentosAtivos(alunosIds);

        // Enriquecer com dados do aluno (se faltar nome/turma)
        atendimentos = await Promise.all(atendimentos.map(async (a) => {
            if (!a.alunoNome || a.alunoNome === 'Aluno') {
                try {
                    const user = await User.findById(a.alunoId).select('nome matricula turma').lean();
                    if (user) {
                        a.alunoNome = user.nome || 'Aluno';
                        a.alunoMatricula = a.alunoMatricula || user.matricula || '';
                        a.alunoTurma = a.alunoTurma || user.turma || '';
                    }
                } catch (e) {
                    // Ignora
                }
            }

            const alunoIdStr = a.alunoId;
            const turmasDoAluno = turmasPorAluno[alunoIdStr] || [];
            const tempoMin = calcularTempoMinutos(a.dataHoraInicio);

            return {
                ...a,
                turmas: turmasDoAluno,
                turmaPrincipal: turmasDoAluno[0]?.nome || a.alunoTurma || 'Sem turma',
                tempoMinutos: tempoMin,
                tempoFormatado: formatarTempo(tempoMin)
            };
        }));

        // Filtros
        if (turmaId) {
            atendimentos = atendimentos.filter(a => a.turmas.some(t => t.id === turmaId));
        }

        if (setor && setor !== 'todos') {
            atendimentos = atendimentos.filter(a => a.setor === setor);
        }

        if (busca) {
            const termo = String(busca).toLowerCase();
            atendimentos = atendimentos.filter(a =>
                (a.alunoNome || '').toLowerCase().includes(termo) ||
                (a.alunoMatricula || '').toLowerCase().includes(termo)
            );
        }

        atendimentos.sort((a, b) => b.tempoMinutos - a.tempoMinutos);

        const porSetor = {};
        const alunosUnicos = new Set();

        atendimentos.forEach(a => {
            porSetor[a.setor] = (porSetor[a.setor] || 0) + 1;
            if (a.alunoId) alunosUnicos.add(a.alunoId);
        });

        res.json({
            success: true,
            total: atendimentos.length,
            alunosUnicos: alunosUnicos.size,
            atendimentos,
            estatisticas: {
                total: atendimentos.length,
                alunosUnicos: alunosUnicos.size,
                porSetor
            },
            turmas,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Erro no acompanhamento:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================================================
// ROTA: /api/acompanhamento/notificacoes
// ============================================================================
router.get('/notificacoes', authenticateToken, verificarProfessor, async (req, res) => {
    try {
        const professorId = req.userId;
        const { desde } = req.query;

        const dataCorte = desde
            ? new Date(desde)
            : new Date(Date.now() - 5 * 60 * 1000);

        const { alunosIds, turmasPorAluno } = await getAlunosDoProfessor(professorId);

        if (alunosIds.length === 0) {
            return res.json({ success: true, novos: [], total: 0, timestamp: new Date().toISOString() });
        }

        const atendimentos = await buscarAtendimentosAtivos(alunosIds);

        const novos = atendimentos
            .filter(a => a.dataHoraInicio && new Date(a.dataHoraInicio) > dataCorte)
            .map(a => {
                const turmasDoAluno = turmasPorAluno[a.alunoId] || [];
                const tempoMin = calcularTempoMinutos(a.dataHoraInicio);
                return {
                    ...a,
                    turmaPrincipal: turmasDoAluno[0]?.nome || a.alunoTurma || 'Sem turma',
                    tempoMinutos: tempoMin,
                    tempoFormatado: formatarTempo(tempoMin)
                };
            });

        res.json({
            success: true,
            novos,
            total: novos.length,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Erro ao buscar notificações:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;