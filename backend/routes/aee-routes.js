// ============================================================================
// AEE - ATENDIMENTO EDUCACIONAL ESPECIALIZADO - EducaPleno
// ============================================================================
// VERSÃO 2.5 - Correções:
//   - Retorna a condição EXATA salva no banco (texto livre)
//   - Removido controle de "status pendente/aprovado"
//   - Dashboard sem métricas de aprovação de cadastro
//   - Rota PUT aceita texto livre para a condição
// ============================================================================

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

let logger;
try { logger = require('../utils/logger'); } catch (err) { logger = console; }

// ============================================================================
// MODELOS
// ============================================================================
const User = require('../models/User');

let Prova = null;
try { Prova = require('../models/Prova'); } catch (err) { console.warn('[aee] Prova:', err.message); }

let Turma = null;
try { Turma = require('../models/Turma'); } catch (err) { console.warn('[aee] Turma:', err.message); }

let Resultado = null;
try { Resultado = mongoose.model('Resultado'); } catch (err) { console.warn('[aee] Resultado:', err.message); }

let ProvaRealizada = null;
try { ProvaRealizada = mongoose.model('ProvaRealizada'); } catch (err) { console.warn('[aee] ProvaRealizada:', err.message); }

// ============================================================================
// HELPERS — Fonte única de verdade das condições de acessibilidade
// ============================================================================
const {
  CONDICOES_LISTA,
  CONDICOES_VALORES,
  CONDICOES_LABELS,
  obterLabelCondicao
} = require('../constants/acessibilidade');

function escaparRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================================
// HELPERS DE PROVAS AEE
// ============================================================================
function filtroProvaAdaptada() {
  return {
    $or: [
      { tipoProva: 'adaptada' },
      { adaptada: true },
      { alternativas: 3 }
    ]
  };
}

async function obterTurmasComAlunosAEE() {
  const alunosAEE = await User.find({
    role: 'aluno',
    precisaAcessibilidade: true,
    ativo: true
  }).select('_id turmaId').lean();

  const alunosAEEIds = alunosAEE.map(a => a._id);

  const turmaIdsViaUser = alunosAEE
    .map(a => a.turmaId)
    .filter(Boolean)
    .map(id => id.toString());

  let turmaIdsViaTurma = [];
  if (Turma && alunosAEEIds.length > 0) {
    const turmas = await Turma.find({ alunos: { $in: alunosAEEIds } })
      .select('_id')
      .lean();
    turmaIdsViaTurma = turmas.map(t => t._id.toString());
  }

  const uniao = new Set([...turmaIdsViaUser, ...turmaIdsViaTurma]);

  return {
    turmaIds: Array.from(uniao).map(id => new mongoose.Types.ObjectId(id)),
    alunosAEEIds
  };
}

// ============================================================================
// HELPERS DE NORMALIZAÇÃO (notas)
// ============================================================================
function extrairNota(doc) {
  if (!doc) return null;
  if (doc.notaManual !== null && doc.notaManual !== undefined) {
    const n = parseFloat(doc.notaManual);
    if (!isNaN(n)) return n;
  }
  if (doc.nota !== null && doc.nota !== undefined) {
    const n = parseFloat(doc.nota);
    if (!isNaN(n)) return n;
  }
  return null;
}

function extrairNotaLiberada(doc) {
  if (!doc) return false;
  return doc.notaLiberada === true || doc.notaManualLiberada === true;
}

function calcularStatus(nota, notaLiberada, cancelada) {
  if (cancelada) return 'cancelada';
  if (!notaLiberada || nota === null) return 'pendente';
  if (nota >= 7) return 'aprovado';
  return 'reprovado';
}

// ============================================================================
// MIDDLEWARES
// ============================================================================
const authenticateTokenLocal = (req, res, next) => {
  let token = null;
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) token = authHeader.substring(7);
  if (!token && req.query?.token) token = req.query.token;
  if (!token && req.body?.token) token = req.body.token;

  if (!token) return res.status(401).json({ success: false, error: 'Acesso negado. Token não fornecido.' });

  jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
    if (err) return res.status(403).json({ success: false, error: 'Token inválido ou expirado.' });

    if (decoded.temp === true && decoded.purpose === '2fa') {
      req.userId = decoded.id;
      req.userRole = decoded.role;
      req.userNome = decoded.nome;
      req.userEmail = decoded.email;
      return next();
    }

    try {
      const user = await User.findById(decoded.id).select('tokenVersion email');
      if (!user) return res.status(401).json({ success: false, error: 'Usuário não encontrado.' });

      if ((user.tokenVersion || 0) !== (decoded.tokenVersion || 0)) {
        return res.status(401).json({
          success: false,
          error: '🔐 Sua sessão foi encerrada. Faça login novamente.',
          motivo: 'reset_global',
          precisaLogin: true
        });
      }
      req.userEmail = user.email;
    } catch (e) { logger.error('tokenVersion:', e); }

    req.userId = decoded.id;
    req.userRole = decoded.role;
    req.userNome = decoded.nome;
    next();
  });
};

const verificarPermissaoAEE = async (req, res, next) => {
  try {
    if (req.userRole === 'admin' || req.userRole === 'super_admin') {
      req.isAEE = true;
      return next();
    }
    if (req.userRole !== 'setor_pedagogico') {
      return res.status(403).json({ success: false, error: 'Acesso negado. Apenas Setor Pedagógico ou Admin.' });
    }
    let PermissaoModulo;
    try { PermissaoModulo = require('../models/PermissaoModulo'); }
    catch (e) { return res.status(500).json({ success: false, error: 'PermissaoModulo não encontrado' }); }

    const permissao = await PermissaoModulo.findOne({ modulo: 'aee_setor_pedagogico', ativo: true });
    if (!permissao) return res.status(403).json({ success: false, error: 'Módulo AEE não configurado' });

    const emailNorm = (req.userEmail || '').trim().toLowerCase();
    const emailsAuth = (permissao.emailsAutorizados || []).map(e => (e || '').trim().toLowerCase());

    if (!emailsAuth.includes(emailNorm)) {
      return res.status(403).json({ success: false, error: 'Acesso negado ao módulo AEE' });
    }
    req.isAEE = true;
    next();
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ============================================================================
// HEALTH
// ============================================================================
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'online',
    service: 'AEE v2.5',
    models: { Prova: !!Prova, Turma: !!Turma, Resultado: !!Resultado, ProvaRealizada: !!ProvaRealizada }
  });
});

// ============================================================================
// GET /api/aee/dashboard
// ============================================================================
router.get('/dashboard', authenticateTokenLocal, verificarPermissaoAEE, async (req, res) => {
  try {
    logger.info(`📋 AEE Dashboard - user ${req.userId}`);

    const { turmaIds, alunosAEEIds } = await obterTurmasComAlunosAEE();

    const [
      totalAlunos,
      totalAlunosComAcessibilidade,
      totalTurmas,
      totalProvasAdaptadas
    ] = await Promise.all([
      User.countDocuments({ role: 'aluno', ativo: true }),
      User.countDocuments({ role: 'aluno', precisaAcessibilidade: true, ativo: true }),
      Turma ? Turma.countDocuments({ ativa: true }) : 0,
      (Prova && turmaIds.length > 0)
        ? Prova.countDocuments({
            publicada: true,
            turmaId: { $in: turmaIds },
            ...filtroProvaAdaptada()
          })
        : 0
    ]);

    const taxaAcessibilidade = totalAlunos > 0
      ? ((totalAlunosComAcessibilidade / totalAlunos) * 100).toFixed(1)
      : 0;

    // 🔥 Agrupa pela condição exata do banco
    const distribuicaoCondicoes = await User.aggregate([
      { $match: { role: 'aluno', precisaAcessibilidade: true, ativo: true } },
      { $group: { _id: '$condicaoAcessibilidade', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    const distribuicaoTurmas = await User.aggregate([
      { $match: { role: 'aluno', precisaAcessibilidade: true, ativo: true } },
      { $group: { _id: '$turma', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    const alunosRecentes = await User.find({
      role: 'aluno',
      precisaAcessibilidade: true,
      ativo: true
    })
      .select('nome matricula turma condicaoAcessibilidade outraCondicao dataSolicitacaoAcessibilidade')
      .sort({ dataSolicitacaoAcessibilidade: -1, createdAt: -1 })
      .limit(5)
      .lean();

    const turmasDisponiveis = await User.distinct('turma', {
      role: 'aluno', ativo: true, precisaAcessibilidade: true,
      turma: { $ne: null, $exists: true, $nin: ['', null] }
    });

    const cursosDisponiveis = await User.distinct('curso', {
      role: 'aluno', ativo: true, precisaAcessibilidade: true,
      curso: { $ne: null, $exists: true, $nin: ['', null] }
    });

    let totalResultados = 0, totalProvasRealizadas = 0, mediaGeral = '0.0', taxaAprovacao = 0;

    if (Resultado && alunosAEEIds.length > 0) {
      const [resultados, provasRealizadas] = await Promise.all([
        Resultado.find({ userId: { $in: alunosAEEIds } }).lean(),
        ProvaRealizada ? ProvaRealizada.find({ alunoId: { $in: alunosAEEIds } }).lean() : []
      ]);

      totalResultados = resultados.length;
      totalProvasRealizadas = provasRealizadas.length;

      const notas = resultados
        .filter(r => extrairNotaLiberada(r) && extrairNota(r) !== null && !r.cancelada)
        .map(r => extrairNota(r));

      mediaGeral = notas.length > 0
        ? (notas.reduce((a, b) => a + b, 0) / notas.length).toFixed(1)
        : '0.0';

      taxaAprovacao = notas.length > 0
        ? Math.round((notas.filter(n => n >= 7).length / notas.length) * 100)
        : 0;
    }

    res.json({
      success: true,
      dashboard: {
        totalAlunos,
        totalAlunosComAcessibilidade,
        taxaAcessibilidade: parseFloat(taxaAcessibilidade),
        totalTurmas,
        totalProvasAdaptadas,
        totalResultados,
        totalProvasRealizadas,
        mediaGeral,
        taxaAprovacao,
        distribuicaoCondicoes: distribuicaoCondicoes.map(c => ({
          condicao: c._id || 'nao_especificada',
          // 🔥 Retorna o texto EXATO salvo no banco
          label: c._id || 'Não especificada',
          count: c.count
        })),
        distribuicaoTurmas: distribuicaoTurmas.map(t => ({
          turma: t._id || 'Sem turma',
          count: t.count
        })),
        alunosRecentes: alunosRecentes.map(a => ({
          id: a._id,
          nome: a.nome,
          matricula: a.matricula,
          turma: a.turma,
          condicao: a.condicaoAcessibilidade || 'nao_especificada',
          // 🔥 Se tiver detalhes (texto livre extra), junta com o tipo. Se não, mostra o tipo.
          condicaoLabel: a.outraCondicaao 
            ? `${a.condicaoAcessibilidade} - ${a.outraCondicao}` 
            : (a.condicaoAcessibilidade || 'Acessibilidade'),
          dataSolicitacao: a.dataSolicitacaoAcessibilidade
        })),
        filtrosDisponiveis: {
          condicoes: CONDICOES_LISTA,
          turmas: turmasDisponiveis.filter(t => t).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })),
          cursos: cursosDisponiveis.filter(c => c).sort()
        }
      }
    });

  } catch (error) {
    logger.error('❌ Dashboard AEE:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// GET /api/aee/alunos
// ============================================================================
router.get('/alunos', authenticateTokenLocal, verificarPermissaoAEE, async (req, res) => {
  try {
    const { condicao, turma, curso, periodo, busca, page = 1, limit = 20 } = req.query;

    let query = { role: 'aluno', precisaAcessibilidade: true, ativo: true };

    if (condicao && condicao !== 'todos') query.condicaoAcessibilidade = condicao;
    if (turma && turma !== 'todas') query.turma = turma;
    if (curso && curso !== 'todos') query.curso = curso;
    if (periodo && periodo !== 'todos') query.periodo = periodo;

    if (busca) {
      const buscaRegex = new RegExp(escaparRegex(busca), 'i');
      query.$or = [
        { nome: buscaRegex },
        { matricula: buscaRegex },
        { email: buscaRegex }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [alunos, total] = await Promise.all([
      User.find(query)
        .select('nome email matricula turma curso periodo condicaoAcessibilidade outraCondicao dataSolicitacaoAcessibilidade')
        .sort({ nome: 1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      User.countDocuments(query)
    ]);

    const turmas = await User.distinct('turma', {
      role: 'aluno', ativo: true, precisaAcessibilidade: true,
      turma: { $ne: null, $exists: true, $nin: ['', null] }
    });
    const cursos = await User.distinct('curso', {
      role: 'aluno', ativo: true, precisaAcessibilidade: true,
      curso: { $ne: null, $exists: true, $nin: ['', null] }
    });

    // Conta notas liberadas por aluno
    const alunosIds = alunos.map(a => a._id);
    const notasPorAluno = new Map();

    if (alunosIds.length > 0) {
      const promises = [];

      if (Resultado) {
        promises.push(
          Resultado.find({ userId: { $in: alunosIds } })
            .select('userId provaId nota notaManual notaLiberada notaManualLiberada cancelada')
            .lean()
            .then(rs => ({ tipo: 'resultado', dados: rs }))
        );
      }

      if (ProvaRealizada) {
        promises.push(
          ProvaRealizada.find({ alunoId: { $in: alunosIds } })
            .select('alunoId provaId nota notaManual notaLiberada notaManualLiberada cancelada')
            .lean()
            .then(prs => ({ tipo: 'prova_realizada', dados: prs }))
        );
      }

      const [resultadosPack, provasPack] = await Promise.all(promises);

      const provasContadas = new Set();

      if (resultadosPack) {
        resultadosPack.dados.forEach(r => {
          const alunoId = r.userId?.toString();
          const provaId = r.provaId?.toString();
          if (!alunoId) return;

          const chave = `${alunoId}_${provaId}`;
          if (provasContadas.has(chave)) return;
          provasContadas.add(chave);

          const notaLiberada = r.notaLiberada === true || r.notaManualLiberada === true;

          if (!notasPorAluno.has(alunoId)) {
            notasPorAluno.set(alunoId, { total: 0, liberadas: 0, pendentes: 0 });
          }

          const stats = notasPorAluno.get(alunoId);
          stats.total++;
          if (notaLiberada) stats.liberadas++;
          else stats.pendentes++;
        });
      }

      if (provasPack) {
        provasPack.dados.forEach(p => {
          const alunoId = p.alunoId?.toString();
          const provaId = p.provaId?.toString();
          if (!alunoId) return;

          const chave = `${alunoId}_${provaId}`;
          if (provasContadas.has(chave)) return;
          provasContadas.add(chave);

          const notaLiberada = p.notaLiberada === true || p.notaManualLiberada === true;

          if (!notasPorAluno.has(alunoId)) {
            notasPorAluno.set(alunoId, { total: 0, liberadas: 0, pendentes: 0 });
          }

          const stats = notasPorAluno.get(alunoId);
          stats.total++;
          if (notaLiberada) stats.liberadas++;
          else stats.pendentes++;
        });
      }
    }

    const alunosFormatados = alunos.map(aluno => {
      const stats = notasPorAluno.get(aluno._id.toString()) || { total: 0, liberadas: 0, pendentes: 0 };
      
      // 🔥 Monta o texto exato da condição
      let condLabel = aluno.condicaoAcessibilidade || 'Não especificada';
      if (aluno.outraCondicao) {
          condLabel = `${condLabel} - ${aluno.outraCondicao}`;
      }

      return {
        id: aluno._id,
        nome: aluno.nome,
        email: aluno.email,
        matricula: aluno.matricula || 'Não informada',
        turma: aluno.turma,
        curso: aluno.curso,
        periodo: aluno.periodo,
        condicao: {
          tipo: aluno.condicaoAcessibilidade,
          label: condLabel,
          descricao: aluno.outraCondicao || null
        },
        dataSolicitacao: aluno.dataSolicitacaoAcessibilidade,
        statusNotas: {
          total: stats.total,
          liberadas: stats.liberadas,
          pendentes: stats.pendentes,
          todasLiberadas: stats.total > 0 && stats.pendentes === 0,
          temNotas: stats.total > 0,
          temPendentes: stats.pendentes > 0
        }
      };
    });

    res.json({
      success: true,
      alunos: alunosFormatados,
      total,
      paginacao: {
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      },
      filtros: {
        condicoes: CONDICOES_LISTA,
        turmas: turmas.filter(t => t).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })),
        cursos: cursos.filter(c => c).sort()
      }
    });

  } catch (error) {
    logger.error('❌ AEE alunos:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// GET /api/aee/alunos/:id
// ============================================================================
router.get('/alunos/:id', authenticateTokenLocal, verificarPermissaoAEE, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ success: false, error: 'ID inválido' });
    }

    const aluno = await User.findOne({ _id: id, role: 'aluno' })
      .select('nome email matricula turma curso periodo condicaoAcessibilidade outraCondicao dataSolicitacaoAcessibilidade')
      .lean();

    if (!aluno) return res.status(404).json({ success: false, error: 'Aluno não encontrado' });

    let provasRealizadas = [];

    if (Resultado) {
      const resultados = await Resultado.find({ userId: id })
        .populate('provaId', 'titulo tipoProva adaptada')
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();

      provasRealizadas = resultados.map(r => {
        const nota = extrairNota(r);
        const notaLiberada = extrairNotaLiberada(r);

        return {
          provaId: r.provaId?._id,
          provaTitulo: r.provaId?.titulo,
          tipoProva: r.provaId?.tipoProva,
          adaptada: r.provaId?.adaptada || r.provaId?.tipoProva === 'adaptada',
          nota,
          notaLiberada,
          data: r.createdAt,
          origem: 'resultado'
        };
      });
    }

    if (ProvaRealizada) {
      const prs = await ProvaRealizada.find({ alunoId: id })
        .populate('provaId', 'titulo tipoProva adaptada')
        .sort({ dataRealizacao: -1 })
        .limit(20)
        .lean();

      const prFormatadas = prs.map(p => {
        const nota = extrairNota(p);
        const notaLiberada = extrairNotaLiberada(p);

        return {
          provaId: p.provaId?._id,
          provaTitulo: p.provaId?.titulo,
          tipoProva: p.provaId?.tipoProva,
          adaptada: p.provaId?.adaptada || p.provaId?.tipoProva === 'adaptada',
          nota,
          notaLiberada,
          data: p.dataRealizacao || p.createdAt,
          origem: 'prova_realizada'
        };
      });

      const ids = new Set(provasRealizadas.map(p => p.provaId?.toString()));
      prFormatadas.forEach(p => {
        if (!ids.has(p.provaId?.toString())) provasRealizadas.push(p);
      });
    }

    provasRealizadas.sort((a, b) => new Date(b.data) - new Date(a.data));

    const notasValidas = provasRealizadas.filter(p => p.notaLiberada && p.nota !== null);
    const estatisticas = {
      totalProvas: provasRealizadas.length,
      aprovacoes: notasValidas.filter(p => p.nota >= 7).length,
      reprovacoes: notasValidas.filter(p => p.nota < 7).length,
      media: notasValidas.length > 0
        ? (notasValidas.reduce((a, b) => a + b.nota, 0) / notasValidas.length).toFixed(1)
        : '0.0'
    };

    let condLabel = aluno.condicaoAcessibilidade || 'Não especificada';
    if (aluno.outraCondicao) {
        condLabel = `${condLabel} - ${aluno.outraCondicao}`;
    }

    res.json({
      success: true,
      aluno: {
        id: aluno._id,
        nome: aluno.nome,
        email: aluno.email,
        matricula: aluno.matricula,
        turma: aluno.turma,
        curso: aluno.curso,
        periodo: aluno.periodo,
        acessibilidade: {
          precisa: true,
          condicao: {
            tipo: aluno.condicaoAcessibilidade,
            label: condLabel,
            detalhes: aluno.outraCondicao
          },
          dataSolicitacao: aluno.dataSolicitacaoAcessibilidade
        },
        estatisticas,
        provasRealizadas
      }
    });

  } catch (error) {
    logger.error('❌ AEE aluno detalhes:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
// ============================================================================
// GET /api/aee/respostas/:provaId/:alunoId
// ============================================================================
router.get('/respostas/:provaId/:alunoId', authenticateTokenLocal, verificarPermissaoAEE, async (req, res) => {
  try {
    const { provaId, alunoId } = req.params;

    if (!provaId || !provaId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ success: false, error: 'ID da prova inválido' });
    }
    if (!alunoId || !alunoId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ success: false, error: 'ID do aluno inválido' });
    }

    const prova = await Prova.findById(provaId)
      .populate('turmaId', 'nome disciplina')
      .lean();

    if (!prova) {
      return res.status(404).json({ success: false, error: 'Prova não encontrada' });
    }

    const aluno = await User.findById(alunoId)
      .select('nome matricula turma curso')
      .lean();

    if (!aluno) {
      return res.status(404).json({ success: false, error: 'Aluno não encontrado' });
    }

    let doc = null;
    let origem = null;

    if (Resultado) {
      doc = await Resultado.findOne({ provaId, userId: alunoId }).lean();
      if (doc) origem = 'resultado';
    }

    if (!doc && ProvaRealizada) {
      doc = await ProvaRealizada.findOne({ provaId, alunoId }).lean();
      if (doc) origem = 'prova_realizada';
    }

    if (!doc) {
      return res.status(404).json({
        success: false,
        error: 'Este aluno ainda não realizou esta prova'
      });
    }

    const questoes = (prova.questoes || []).map((q, index) => {
      const respostaAluno = doc.respostas?.[index] || null;
      const respostaCorretaIndex = q.respostaCorreta;
      const letrasUsadas = ['A', 'B', 'C', 'D', 'E'];
      const respostaCorretaLetra = letrasUsadas[respostaCorretaIndex] || '?';

      let respostaAlunoLetra = null;
      if (respostaAluno !== null && respostaAluno !== undefined) {
        if (typeof respostaAluno === 'number') {
          respostaAlunoLetra = letrasUsadas[respostaAluno] || null;
        } else if (typeof respostaAluno === 'string') {
          respostaAlunoLetra = respostaAluno.trim().toUpperCase();
        }
      }

      const correta = respostaAlunoLetra === respostaCorretaLetra;

      const opcoes = (q.opcoes || []).map((opcao, optIdx) => {
        const letra = letrasUsadas[optIdx];
        let textoLimpo = String(opcao || '').trim();

        const padroes = [
          new RegExp(`^\\(${letra}\\)\\s*`, 'i'),
          new RegExp(`^${letra}\\)\\s*`, 'i'),
          new RegExp(`^${letra}\\.\\s*`, 'i'),
          new RegExp(`^${letra}\\s*-\\s*`, 'i'),
          new RegExp(`^${letra}:\\s*`, 'i'),
          new RegExp(`^${letra}\\s+`, 'i'),
        ];

        for (const padrao of padroes) {
          if (padrao.test(textoLimpo)) {
            textoLimpo = textoLimpo.replace(padrao, '').trim();
            break;
          }
        }

        return {
          letra,
          texto: textoLimpo || 'Opção não disponível',
          marcadaPeloAluno: letra === respostaAlunoLetra,
          correta: letra === respostaCorretaLetra
        };
      });

      return {
        numero: index + 1,
        pergunta: q.pergunta || 'Pergunta não disponível',
        opcoes,
        respostaAluno: respostaAlunoLetra,
        respostaCorreta: respostaCorretaLetra,
        correta,
        explicacao: q.explicacao || null
      };
    });

    const totalQuestoes = questoes.length;
    const acertos = questoes.filter(q => q.correta).length;
    const nota = extrairNota(doc);
    const notaLiberada = extrairNotaLiberada(doc);

    res.json({
      success: true,
      aluno: {
        id: aluno._id,
        nome: aluno.nome,
        matricula: aluno.matricula,
        turma: aluno.turma,
        curso: aluno.curso
      },
      prova: {
        id: prova._id,
        titulo: prova.titulo,
        codigo: prova.codigo,
        disciplina: prova.turmaId?.disciplina,
        turma: prova.turmaId?.nome,
        dataLimite: prova.dataLimite,
        quantidadeQuestoes: totalQuestoes
      },
      resultado: {
        origem,
        nota,
        notaLiberada,
        acertos,
        total: totalQuestoes,
        porcentagem: totalQuestoes > 0 ? Math.round((acertos / totalQuestoes) * 100) : 0,
        tempoGasto: doc.tempoGasto || 0,
        data: doc.createdAt || doc.dataRealizacao,
        cancelada: doc.cancelada || false,
        status: calcularStatus(nota, notaLiberada, doc.cancelada)
      },
      questoes
    });

  } catch (error) {
    logger.error('❌ AEE respostas:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// GET /api/aee/notas - Histórico de notas
// ============================================================================
router.get('/notas', authenticateTokenLocal, verificarPermissaoAEE, async (req, res) => {
  try {
    const { busca, turma, curso, periodo, status, ordenacao, page = 1, limit = 20 } = req.query;

    const alunosAEE = await User.find({
      role: 'aluno',
      precisaAcessibilidade: true,
      ativo: true
    }).select('nome matricula turma curso periodo').lean();

    const alunosMap = new Map();
    alunosAEE.forEach(a => alunosMap.set(a._id.toString(), a));
    const alunosIds = alunosAEE.map(a => a._id);

    if (alunosIds.length === 0) {
      return res.json({
        success: true,
        notas: [],
        total: 0,
        paginacao: { page: 1, limit, pages: 0 },
        estatisticas: { total: 0, aprovados: 0, reprovados: 0, pendentes: 0, media: '0.0' },
        filtros: { turmas: [], cursos: [] }
      });
    }

    const [resultados, provasRealizadas] = await Promise.all([
      Resultado ? Resultado.find({ userId: { $in: alunosIds } })
        .populate('provaId', 'titulo tipoProva adaptada')
        .lean() : [],
      ProvaRealizada ? ProvaRealizada.find({ alunoId: { $in: alunosIds } })
        .populate('provaId', 'titulo tipoProva adaptada')
        .lean() : []
    ]);

    const todasNotas = [];

    resultados.forEach(r => {
      const aluno = alunosMap.get(r.userId?.toString());
      if (!aluno) return;

      const nota = extrairNota(r);
      const notaLiberada = extrairNotaLiberada(r);

      todasNotas.push({
        id: `resultado_${r._id}`,
        _id: r._id,
        origem: 'resultado',
        alunoId: r.userId,
        alunoNome: aluno.nome,
        alunoMatricula: aluno.matricula,
        alunoTurma: aluno.turma,
        alunoCurso: aluno.curso,
        alunoPeriodo: aluno.periodo,
        provaId: r.provaId?._id,
        provaTitulo: r.provaId?.titulo || 'Prova',
        adaptada: r.provaId?.adaptada || r.provaId?.tipoProva === 'adaptada',
        nota,
        notaLiberada,
        tipoNota: r.tipoNota || (r.notaManual !== null ? 'manual' : 'automatica'),
        acertos: r.acertos || 0,
        total: r.total || 0,
        tempoGasto: r.tempoGasto || 0,
        data: r.createdAt,
        cancelada: r.cancelada || false,
        observacoes: r.observacoes || '',
        status: calcularStatus(nota, notaLiberada, r.cancelada)
      });
    });

    provasRealizadas.forEach(p => {
      const aluno = alunosMap.get(p.alunoId?.toString());
      if (!aluno) return;

      const jaTem = todasNotas.some(n =>
        n.origem === 'resultado' &&
        n.alunoId?.toString() === p.alunoId?.toString() &&
        n.provaId?.toString() === p.provaId?._id?.toString()
      );
      if (jaTem) return;

      const nota = extrairNota(p);
      const notaLiberada = extrairNotaLiberada(p);

      todasNotas.push({
        id: `pr_${p._id}`,
        _id: p._id,
        origem: 'prova_realizada',
        alunoId: p.alunoId,
        alunoNome: aluno.nome,
        alunoMatricula: aluno.matricula,
        alunoTurma: aluno.turma,
        alunoCurso: aluno.curso,
        alunoPeriodo: aluno.periodo,
        provaId: p.provaId?._id,
        provaTitulo: p.provaId?.titulo || 'Prova',
        adaptada: p.provaId?.adaptada || p.provaId?.tipoProva === 'adaptada',
        nota,
        notaLiberada,
        tipoNota: p.tipoNota || (p.notaManual !== null ? 'manual' : 'automatica'),
        acertos: p.acertos || 0,
        total: p.total || 0,
        tempoGasto: p.tempoGasto || 0,
        data: p.dataRealizacao || p.createdAt,
        cancelada: p.cancelada || false,
        observacoes: p.observacoes || '',
        status: calcularStatus(nota, notaLiberada, p.cancelada)
      });
    });

    let filtradas = [...todasNotas];

    if (busca) {
      const buscaLower = busca.toLowerCase();
      filtradas = filtradas.filter(n =>
        (n.alunoNome || '').toLowerCase().includes(buscaLower) ||
        (n.provaTitulo || '').toLowerCase().includes(buscaLower) ||
        (n.alunoMatricula || '').toLowerCase().includes(buscaLower)
      );
    }

    if (turma && turma !== 'todas') filtradas = filtradas.filter(n => n.alunoTurma === turma);
    if (curso && curso !== 'todos') filtradas = filtradas.filter(n => n.alunoCurso === curso);
    if (periodo && periodo !== 'todos') filtradas = filtradas.filter(n => String(n.alunoPeriodo) === String(periodo));
    if (status && status !== 'todos') filtradas = filtradas.filter(n => n.status === status);

    const ord = ordenacao || 'data_desc';
    filtradas.sort((a, b) => {
      switch (ord) {
        case 'data_asc': return new Date(a.data) - new Date(b.data);
        case 'nota_desc': return (b.nota ?? -1) - (a.nota ?? -1);
        case 'nota_asc': return (a.nota ?? 999) - (b.nota ?? 999);
        case 'nome_asc': return (a.alunoNome || '').localeCompare(b.alunoNome || '');
        default: return new Date(b.data) - new Date(a.data);
      }
    });

    const notasLiberadas = filtradas.filter(n => n.notaLiberada && n.nota !== null && !n.cancelada);
    const estatisticas = {
      total: filtradas.length,
      aprovados: notasLiberadas.filter(n => n.nota >= 7).length,
      reprovados: notasLiberadas.filter(n => n.nota < 7 && n.nota >= 0).length,
      pendentes: filtradas.filter(n => !n.notaLiberada).length,
      media: notasLiberadas.length > 0
        ? (notasLiberadas.reduce((a, b) => a + b.nota, 0) / notasLiberadas.length).toFixed(1)
        : '0.0'
    };

    const total = filtradas.length;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const paginadas = filtradas.slice(skip, skip + parseInt(limit));

    const turmas = [...new Set(alunosAEE.map(a => a.turma).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
    const cursos = [...new Set(alunosAEE.map(a => a.curso).filter(Boolean))].sort();

    res.json({
      success: true,
      notas: paginadas,
      total,
      estatisticas,
      paginacao: {
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      },
      filtros: { turmas, cursos }
    });

  } catch (error) {
    logger.error('❌ AEE notas:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// GET /api/aee/notas/:id
// ============================================================================
router.get('/notas/:id', authenticateTokenLocal, verificarPermissaoAEE, async (req, res) => {
  try {
    const { id } = req.params;
    const idLimpo = id.replace(/^(resultado_|pr_)/, '');

    if (!idLimpo.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ success: false, error: 'ID inválido' });
    }

    let doc = null;
    let origem = null;

    if (Resultado) {
      doc = await Resultado.findById(idLimpo).populate('provaId', 'titulo tipoProva adaptada').populate('userId', 'nome matricula turma curso').lean();
      if (doc) origem = 'resultado';
    }

    if (!doc && ProvaRealizada) {
      doc = await ProvaRealizada.findById(idLimpo).populate('provaId', 'titulo tipoProva adaptada').populate('alunoId', 'nome matricula turma curso').lean();
      if (doc) origem = 'prova_realizada';
    }

    if (!doc) return res.status(404).json({ success: false, error: 'Nota não encontrada' });

    const aluno = origem === 'resultado' ? doc.userId : doc.alunoId;

    const nota = extrairNota(doc);
    const notaLiberada = extrairNotaLiberada(doc);

    res.json({
      success: true,
      nota: {
        id: doc._id,
        alunoId: aluno?._id,
        alunoNome: aluno?.nome || 'Aluno',
        alunoMatricula: aluno?.matricula,
        alunoTurma: aluno?.turma,
        alunoCurso: aluno?.curso,
        provaTitulo: doc.provaId?.titulo,
        adaptada: doc.provaId?.adaptada || doc.provaId?.tipoProva === 'adaptada',
        nota,
        notaLiberada,
        tipoNota: doc.tipoNota || (doc.notaManual !== null ? 'manual' : 'automatica'),
        acertos: doc.acertos || 0,
        total: doc.total || 0,
        tempoGasto: doc.tempoGasto || 0,
        data: doc.createdAt || doc.dataRealizacao,
        cancelada: doc.cancelada || false,
        observacoes: doc.observacoes || '',
        status: calcularStatus(nota, notaLiberada, doc.cancelada)
      }
    });

  } catch (error) {
    logger.error('❌ AEE nota detalhes:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// GET /api/aee/provas — SOMENTE provas adaptadas de turmas com alunos AEE
// ============================================================================
router.get('/provas', authenticateTokenLocal, verificarPermissaoAEE, async (req, res) => {
  try {
    if (!Prova) return res.status(503).json({ success: false, error: 'Módulo de provas indisponível' });

    const { busca, turma, periodo, page = 1, limit = 20 } = req.query;

    const { turmaIds } = await obterTurmasComAlunosAEE();

    if (turmaIds.length === 0) {
      return res.json({
        success: true,
        provas: [],
        total: 0,
        paginacao: { page: 1, limit: parseInt(limit), pages: 0 },
        filtros: { turmas: [] },
        aviso: 'Nenhuma turma possui alunos AEE ativos no momento'
      });
    }

    const condicoes = [
      { publicada: true },
      { turmaId: { $in: turmaIds } },
      filtroProvaAdaptada()
    ];

    if (turma && turma !== 'todas' && mongoose.Types.ObjectId.isValid(turma)) {
      condicoes.push({ turmaId: new mongoose.Types.ObjectId(turma) });
    }
    if (periodo && periodo !== 'todos') {
      condicoes.push({ periodo });
    }
    if (busca) {
      const r = new RegExp(escaparRegex(busca), 'i');
      condicoes.push({ $or: [{ titulo: r }, { codigo: r }, { conteudo: r }, { disciplina: r }] });
    }

    const query = { $and: condicoes };
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [provas, total] = await Promise.all([
      Prova.find(query)
        .populate('turmaId', 'nome disciplina codigo')
        .populate('userId', 'nome')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Prova.countDocuments(query)
    ]);

    const turmas = Turma
      ? await Turma.find({ _id: { $in: turmaIds }, ativa: true })
          .select('nome disciplina')
          .lean()
      : [];

    const provasFormatadas = provas.map(prova => {
      const isAdaptada = prova.tipoProva === 'adaptada' || prova.adaptada === true || prova.alternativas === 3;
      return {
        id: prova._id,
        titulo: prova.titulo,
        codigo: prova.codigo,
        tipo: isAdaptada ? 'adaptada' : (prova.tipoProva || 'normal'),
        alternativas: isAdaptada ? 3 : (prova.alternativas || 5),
        quantidadeQuestoes: prova.questoes?.length || 0,
        disciplina: prova.disciplina || prova.turmaId?.disciplina || null,
        turma: prova.turmaId ? {
          id: prova.turmaId._id,
          nome: prova.turmaId.nome,
          disciplina: prova.turmaId.disciplina
        } : null,
        professor: prova.userId?.nome || 'Professor',
        dataCriacao: prova.createdAt,
        dataLimite: prova.dataLimite,
        publicada: prova.publicada
      };
    });

    res.json({
      success: true,
      provas: provasFormatadas,
      total,
      paginacao: { page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
      filtros: {
        turmas: turmas.map(t => ({ id: t._id, nome: t.nome, disciplina: t.disciplina }))
      }
    });

  } catch (error) {
    logger.error('❌ AEE provas:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// GET /api/aee/provas/:id — bloqueia provas não adaptadas / sem AEE
// ============================================================================
router.get('/provas/:id', authenticateTokenLocal, verificarPermissaoAEE, async (req, res) => {
  try {
    if (!Prova) return res.status(503).json({ success: false, error: 'Módulo de provas indisponível' });

    const prova = await Prova.findById(req.params.id)
      .populate('turmaId', 'nome disciplina codigo')
      .populate('userId', 'nome email')
      .lean();

    if (!prova) return res.status(404).json({ success: false, error: 'Prova não encontrada' });

    const isAdaptada = prova.tipoProva === 'adaptada' || prova.adaptada === true || prova.alternativas === 3;

    const { turmaIds } = await obterTurmasComAlunosAEE();
    const turmaDaProva = prova.turmaId?._id?.toString();
    const pertenceTurmaAEE = turmaDaProva && turmaIds.some(id => id.toString() === turmaDaProva);

    if (!isAdaptada || !pertenceTurmaAEE) {
      return res.status(403).json({
        success: false,
        error: 'Esta prova não é adaptada ou não pertence a uma turma com alunos AEE'
      });
    }

    const questoes = (prova.questoes || []).map((q, index) => ({
      numero: index + 1,
      pergunta: q.pergunta,
      opcoes: q.opcoes,
      explicacao: q.explicacao,
      dificuldade: q.dificuldade || 'media'
    }));

    res.json({
      success: true,
      prova: {
        id: prova._id,
        titulo: prova.titulo,
        codigo: prova.codigo,
        conteudo: prova.conteudo,
        periodo: prova.periodo,
        tipo: 'adaptada',
        alternativas: isAdaptada ? 3 : (prova.alternativas || 5),
        quantidadeQuestoes: questoes.length,
        turma: prova.turmaId ? {
          nome: prova.turmaId.nome,
          disciplina: prova.turmaId.disciplina,
          codigo: prova.turmaId.codigo
        } : null,
        professor: prova.userId?.nome || 'Professor',
        dataCriacao: prova.createdAt,
        dataLimite: prova.dataLimite,
        duracaoMinutos: prova.duracaoMinutos,
        questoes
      }
    });

  } catch (error) {
    logger.error('❌ AEE prova detalhes:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// GET /api/aee/relatorio
// ============================================================================
// ============================================================================
// GET /api/aee/relatorio
// ============================================================================
router.get('/relatorio', authenticateTokenLocal, verificarPermissaoAEE, async (req, res) => {
  try {
    const { turma, curso, condicao, periodo } = req.query;

    let query = { role: 'aluno', precisaAcessibilidade: true, ativo: true };
    if (condicao && condicao !== 'todos') query.condicaoAcessibilidade = condicao;
    if (turma && turma !== 'todas') query.turma = turma;
    if (curso && curso !== 'todos') query.curso = curso;
    if (periodo && periodo !== 'todos') query.periodo = periodo;

    const alunos = await User.find(query)
      .select('nome email matricula turma curso periodo condicaoAcessibilidade outraCondicao dataSolicitacaoAcessibilidade')
      .sort({ turma: 1, nome: 1 })
      .lean();

    const porTurma = {};
    alunos.forEach(aluno => {
      const t = aluno.turma || 'Sem turma';
      if (!porTurma[t]) porTurma[t] = [];
      
      // 🔥 AQUI ESTAVA O ERRO: Pega o texto exato do banco
      let condTexto = aluno.condicaoAcessibilidade || 'Acessibilidade';
      if (aluno.outraCondicao) {
          condTexto = `${condTexto} - ${aluno.outraCondicao}`;
      }

      porTurma[t].push({
        id: aluno._id,
        nome: aluno.nome,
        matricula: aluno.matricula,
        curso: aluno.curso,
        condicao: condTexto, // Retorna o texto exato
        condicaoTipo: aluno.condicaoAcessibilidade,
        detalhes: aluno.outraCondicao
      });
    });

    const porCondicao = {};
    alunos.forEach(a => {
      let condTexto = a.condicaoAcessibilidade || 'Não especificada';
      if (a.outraCondicao) {
        condTexto = `${condTexto} - ${a.outraCondicao}`;
      }
      porCondicao[condTexto] = (porCondicao[condTexto] || 0) + 1;
    });

    res.json({
      success: true,
      relatorio: {
        dataGeracao: new Date(),
        totalAlunos: alunos.length,
        porCondicao: Object.entries(porCondicao).map(([cond, count]) => ({ condicao: cond, total: count })),
        porTurma: Object.entries(porTurma).map(([t, lista]) => ({ turma: t, total: lista.length, alunos: lista }))
      }
    });

  } catch (error) {
    logger.error('❌ AEE relatorio:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// PUT /api/aee/alunos/:id (CORRIGIDO - Aceita Texto Livre)
// ============================================================================
router.put('/alunos/:id', authenticateTokenLocal, verificarPermissaoAEE, async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ success: false, error: 'ID inválido' });
    }

    const {
      nome,
      email,
      matricula,
      turma,
      curso,
      periodo,
      condicao,
      detalhes
    } = req.body;

    if (!nome || !nome.trim()) {
      return res.status(400).json({ success: false, error: 'Nome é obrigatório' });
    }

    if (!condicao) {
      return res.status(400).json({ success: false, error: 'Condição de acessibilidade é obrigatória' });
    }

    // 🔥 Não valida mais contra CONDICOES_VALORES. Aceita o texto que vier.
    
    const alunoAtual = await User.findById(id).lean();
    if (!alunoAtual || alunoAtual.role !== 'aluno') {
      return res.status(404).json({ success: false, error: 'Aluno não encontrado' });
    }

    if (email && email !== alunoAtual.email) {
      const emailEmUso = await User.findOne({
        email: email.toLowerCase(),
        _id: { $ne: id }
      }).lean();
      if (emailEmUso) {
        return res.status(400).json({
          success: false,
          error: 'Este email já está em uso por outro usuário'
        });
      }
    }

    const updateData = {
      nome: nome.trim().toUpperCase(),
      precisaAcessibilidade: true,
      condicaoAcessibilidade: condicao,
      outraCondicao: detalhes || ''
    };

    if (email && email.trim()) updateData.email = email.trim().toLowerCase();
    if (matricula !== undefined) updateData.matricula = (matricula || '').trim();
    if (turma !== undefined) updateData.turma = (turma || '').trim();
    if (curso !== undefined) updateData.curso = (curso || '').trim();
    if (periodo !== undefined) updateData.periodo = periodo || null;

    if (!alunoAtual.dataSolicitacaoAcessibilidade) {
      updateData.dataSolicitacaoAcessibilidade = new Date();
    }

    const alunoAtualizado = await User.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true
    })
      .select('nome email matricula turma curso periodo condicaoAcessibilidade outraCondicao dataSolicitacaoAcessibilidade')
      .lean();

    if (!alunoAtualizado) {
      return res.status(404).json({ success: false, error: 'Aluno não encontrado após atualização' });
    }

    logger.info(`✏️ AEE - Aluno ${alunoAtualizado.nome} editado por ${req.userNome}`);

    let condLabel = alunoAtualizado.condicaoAcessibilidade || 'Não especificada';
    if (alunoAtualizado.outraCondicao) {
        condLabel = `${condLabel} - ${alunoAtualizado.outraCondicao}`;
    }

    res.json({
      success: true,
      message: 'Aluno atualizado com sucesso',
      aluno: {
        id: alunoAtualizado._id,
        nome: alunoAtualizado.nome,
        email: alunoAtualizado.email,
        matricula: alunoAtualizado.matricula,
        turma: alunoAtualizado.turma,
        curso: alunoAtualizado.curso,
        periodo: alunoAtualizado.periodo,
        condicao: {
          tipo: alunoAtualizado.condicaoAcessibilidade,
          label: condLabel,
          detalhes: alunoAtualizado.outraCondicao
        },
        dataSolicitacao: alunoAtualizado.dataSolicitacaoAcessibilidade
      }
    });

  } catch (error) {
    logger.error('❌ AEE editar aluno:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;