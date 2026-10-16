// ============================================================================
// AEE - ATENDIMENTO EDUCACIONAL ESPECIALIZADO - EducaPleno
// ============================================================================
// VERSÃO 2.2 - Reescrito com:
//   - Dashboard corrigido (dados reais agregados)
//   - Filtros dinâmicos (vêm do banco)
//   - Rotas: /api/aee/notas (histórico de notas)
//   - Rotas: /api/aee/notas/:id (detalhes da nota)
//   - Rotas: /api/aee/respostas/:provaId/:alunoId (NOVO - respostas do aluno)
//   - Provas com filtros e paginação
//   - Relatórios no padrão Setor Pedagógico
//   - Status duplo: cadastro AEE + notas liberadas
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
// HELPERS
// ============================================================================
const CONDICOES_LABELS = {
  'visual': 'Deficiência Visual',
  'baixa_visao': 'Baixa Visão',
  'cegueira': 'Cegueira',
  'auditiva': 'Deficiência Auditiva',
  'deficiencia_auditiva': 'Deficiência Auditiva',
  'motora': 'Deficiência Motora',
  'deficiencia_fisica': 'Deficiência Física',
  'intelectual': 'Deficiência Intelectual',
  'dislexia': 'Dislexia',
  'discalculia': 'Discalculia',
  'tdah': 'TDAH',
  'tea': 'Transtorno do Espectro Autista (TEA)',
  'altas_habilidades': 'Altas Habilidades/Superdotação',
  'deficiencia_multipla': 'Deficiência Múltipla',
  'surdocegueira': 'Surdocegueira',
  'outra': 'Outra Condição',
  null: 'Não especificada',
  'nao_especificada': 'Não especificada'
};

const CONDICOES_LISTA = [
  { valor: 'visual', label: 'Deficiência Visual' },
  { valor: 'baixa_visao', label: 'Baixa Visão' },
  { valor: 'cegueira', label: 'Cegueira' },
  { valor: 'auditiva', label: 'Deficiência Auditiva' },
  { valor: 'deficiencia_auditiva', label: 'Deficiência Auditiva' },
  { valor: 'motora', label: 'Deficiência Motora' },
  { valor: 'deficiencia_fisica', label: 'Deficiência Física' },
  { valor: 'intelectual', label: 'Deficiência Intelectual' },
  { valor: 'dislexia', label: 'Dislexia' },
  { valor: 'discalculia', label: 'Discalculia' },
  { valor: 'tdah', label: 'TDAH' },
  { valor: 'tea', label: 'Transtorno do Espectro Autista (TEA)' },
  { valor: 'altas_habilidades', label: 'Altas Habilidades/Superdotação' },
  { valor: 'deficiencia_multipla', label: 'Deficiência Múltipla' },
  { valor: 'surdocegueira', label: 'Surdocegueira' },
  { valor: 'outra', label: 'Outra Condição' }
];

function obterLabelCondicao(c) { return CONDICOES_LABELS[c] || 'Condição Especial'; }

function escaparRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================================
// HELPERS DE NORMALIZAÇÃO
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
    service: 'AEE v2.2',
    models: { Prova: !!Prova, Turma: !!Turma, Resultado: !!Resultado, ProvaRealizada: !!ProvaRealizada }
  });
});

// ============================================================================
// GET /api/aee/dashboard
// ============================================================================
router.get('/dashboard', authenticateTokenLocal, verificarPermissaoAEE, async (req, res) => {
  try {
    logger.info(`📋 AEE Dashboard - user ${req.userId}`);

    const [
      totalAlunos,
      totalAlunosComAcessibilidade,
      totalTurmas,
      totalProvasAdaptadas,
      alunosPendentes,
      alunosAprovados
    ] = await Promise.all([
      User.countDocuments({ role: 'aluno', ativo: true }),
      User.countDocuments({ role: 'aluno', precisaAcessibilidade: true, ativo: true }),
      Turma ? Turma.countDocuments({ ativa: true }) : 0,
      Prova ? Prova.countDocuments({
        publicada: true,
        $or: [{ tipoProva: 'adaptada' }, { adaptada: true }, { alternativas: 3 }]
      }) : 0,
      User.countDocuments({
        role: 'aluno',
        precisaAcessibilidade: true,
        ativo: true,
        $or: [{ acessibilidadeAprovadaPor: { $exists: false } }, { acessibilidadeAprovadaPor: null }]
      }),
      User.countDocuments({
        role: 'aluno',
        precisaAcessibilidade: true,
        ativo: true,
        acessibilidadeAprovadaPor: { $exists: true, $ne: null }
      })
    ]);

    const taxaAcessibilidade = totalAlunos > 0
      ? ((totalAlunosComAcessibilidade / totalAlunos) * 100).toFixed(1)
      : 0;

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
      .select('nome matricula turma condicaoAcessibilidade dataSolicitacaoAcessibilidade')
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

    if (Resultado) {
      const alunosAEEIds = await User.find({ role: 'aluno', precisaAcessibilidade: true, ativo: true }).distinct('_id');

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
        alunosPendentes,
        alunosAprovados,
        totalResultados,
        totalProvasRealizadas,
        mediaGeral,
        taxaAprovacao,
        distribuicaoCondicoes: distribuicaoCondicoes.map(c => ({
          condicao: c._id || 'nao_especificada',
          label: obterLabelCondicao(c._id),
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
          condicaoLabel: obterLabelCondicao(a.condicaoAcessibilidade),
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
// 🔥 NOVO: retorna statusCadastro E statusNotas
// ============================================================================
router.get('/alunos', authenticateTokenLocal, verificarPermissaoAEE, async (req, res) => {
  try {
    const { condicao, turma, curso, periodo, status, busca, page = 1, limit = 20 } = req.query;

    let query = { role: 'aluno', precisaAcessibilidade: true, ativo: true };

    if (condicao && condicao !== 'todos') query.condicaoAcessibilidade = condicao;
    if (turma && turma !== 'todas') query.turma = turma;
    if (curso && curso !== 'todos') query.curso = curso;
    if (periodo && periodo !== 'todos') query.periodo = periodo;

    if (status === 'aprovada') {
      query.acessibilidadeAprovadaPor = { $exists: true, $ne: null };
    } else if (status === 'pendente') {
      query.$or = [
        { acessibilidadeAprovadaPor: { $exists: false } },
        { acessibilidadeAprovadaPor: null }
      ];
    }

    if (busca) {
      const buscaRegex = new RegExp(escaparRegex(busca), 'i');
      const buscaOr = [
        { nome: buscaRegex },
        { matricula: buscaRegex },
        { email: buscaRegex }
      ];
      if (query.$or) {
        query.$and = [{ $or: query.$or }, { $or: buscaOr }];
        delete query.$or;
      } else {
        query.$or = buscaOr;
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [alunos, total] = await Promise.all([
      User.find(query)
        .select('nome email matricula turma curso periodo condicaoAcessibilidade outraCondicao dataSolicitacaoAcessibilidade acessibilidadeAprovadaPor')
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

    // 🔥 Conta notas liberadas por aluno
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

      // 🔥 Chave composta alunoId_provaId para evitar deduplicação errada
      const provasContadas = new Set();

      // Primeiro, conta resultados
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

      // Depois, conta provas realizadas (sem duplicar)
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
          label: obterLabelCondicao(aluno.condicaoAcessibilidade),
          descricao: aluno.outraCondicao || null
        },
        dataSolicitacao: aluno.dataSolicitacaoAcessibilidade,
        // 🔥 Status do cadastro AEE
        statusCadastro: aluno.acessibilidadeAprovadaPor ? 'aprovada' : 'pendente',
        // 🔥 Status das notas
        statusNotas: {
          total: stats.total,
          liberadas: stats.liberadas,
          pendentes: stats.pendentes,
          todasLiberadas: stats.total > 0 && stats.pendentes === 0,
          temNotas: stats.total > 0,
          temPendentes: stats.pendentes > 0
        },
        // 🔥 Compatibilidade com código antigo
        status: aluno.acessibilidadeAprovadaPor ? 'aprovada' : 'pendente'
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
      .select('nome email matricula turma curso periodo condicaoAcessibilidade outraCondicao dataSolicitacaoAcessibilidade acessibilidadeAprovadaPor')
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
            label: obterLabelCondicao(aluno.condicaoAcessibilidade),
            detalhes: aluno.outraCondicao
          },
          dataSolicitacao: aluno.dataSolicitacaoAcessibilidade,
          status: aluno.acessibilidadeAprovadaPor ? 'aprovada' : 'pendente'
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
// 🔥 NOVO: GET /api/aee/respostas/:provaId/:alunoId
// Retorna as respostas que o aluno marcou na prova
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

    // Busca a prova
    const prova = await Prova.findById(provaId)
      .populate('turmaId', 'nome disciplina')
      .lean();

    if (!prova) {
      return res.status(404).json({ success: false, error: 'Prova não encontrada' });
    }

    // Busca o aluno
    const aluno = await User.findById(alunoId)
      .select('nome matricula turma curso')
      .lean();

    if (!aluno) {
      return res.status(404).json({ success: false, error: 'Aluno não encontrado' });
    }

    // 🔥 Busca a resposta do aluno (tenta Resultado primeiro)
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

    // 🔥 Monta a lista de questões com as respostas do aluno
    const questoes = (prova.questoes || []).map((q, index) => {
      const respostaAluno = doc.respostas?.[index] || null;
      const respostaCorretaIndex = q.respostaCorreta;
      const letrasUsadas = ['A', 'B', 'C', 'D', 'E'];
      const respostaCorretaLetra = letrasUsadas[respostaCorretaIndex] || '?';

      // Normaliza a resposta do aluno (pode vir como "A" ou índice)
      let respostaAlunoLetra = null;
      if (respostaAluno !== null && respostaAluno !== undefined) {
        if (typeof respostaAluno === 'number') {
          respostaAlunoLetra = letrasUsadas[respostaAluno] || null;
        } else if (typeof respostaAluno === 'string') {
          respostaAlunoLetra = respostaAluno.trim().toUpperCase();
        }
      }

      const correta = respostaAlunoLetra === respostaCorretaLetra;

      // Limpa prefixo das opções
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

    // Estatísticas
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
// GET /api/aee/provas - COM FILTROS
// ============================================================================
router.get('/provas', authenticateTokenLocal, verificarPermissaoAEE, async (req, res) => {
  try {
    if (!Prova) return res.status(503).json({ success: false, error: 'Módulo de provas indisponível' });

    const { busca, turma, tipo, periodo, page = 1, limit = 20 } = req.query;

    let query = { publicada: true };

    if (tipo === 'adaptada') {
      query.$or = [{ tipoProva: 'adaptada' }, { adaptada: true }, { alternativas: 3 }];
    } else if (tipo === 'normal') {
      query.$nor = [{ tipoProva: 'adaptada' }, { adaptada: true }, { alternativas: 3 }];
    }

    if (turma && turma !== 'todas') query.turmaId = turma;
    if (periodo && periodo !== 'todos') query.periodo = periodo;

    if (busca) {
      const r = new RegExp(escaparRegex(busca), 'i');
      query.$or = query.$or
        ? [{ $and: [{ $or: query.$or }, { $or: [{ titulo: r }, { codigo: r }, { conteudo: r }] }] }]
        : [{ titulo: r }, { codigo: r }, { conteudo: r }];
      if (query.$or.length === 1 && query.$or[0].$and) query.$or = query.$or[0].$and;
    }

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

    const turmas = Turma ? await Turma.find({ ativa: true }).select('nome disciplina').lean() : [];

    const provasFormatadas = provas.map(prova => {
      const isAdaptada = prova.tipoProva === 'adaptada' || prova.adaptada === true || prova.alternativas === 3;
      return {
        id: prova._id,
        titulo: prova.titulo,
        codigo: prova.codigo,
        tipo: isAdaptada ? 'adaptada' : (prova.tipoProva || 'normal'),
        alternativas: isAdaptada ? 3 : (prova.alternativas || 5),
        quantidadeQuestoes: prova.questoes?.length || 0,
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
// GET /api/aee/provas/:id
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
        tipo: isAdaptada ? 'adaptada' : (prova.tipoProva || 'normal'),
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
router.get('/relatorio', authenticateTokenLocal, verificarPermissaoAEE, async (req, res) => {
  try {
    const { turma, curso, condicao, status, periodo } = req.query;

    let query = { role: 'aluno', precisaAcessibilidade: true, ativo: true };
    if (condicao && condicao !== 'todos') query.condicaoAcessibilidade = condicao;
    if (turma && turma !== 'todas') query.turma = turma;
    if (curso && curso !== 'todos') query.curso = curso;
    if (periodo && periodo !== 'todos') query.periodo = periodo;

    if (status === 'aprovada') query.acessibilidadeAprovadaPor = { $exists: true, $ne: null };
    else if (status === 'pendente') query.$or = [
      { acessibilidadeAprovadaPor: { $exists: false } },
      { acessibilidadeAprovadaPor: null }
    ];

    const alunos = await User.find(query)
      .select('nome email matricula turma curso periodo condicaoAcessibilidade outraCondicao dataSolicitacaoAcessibilidade acessibilidadeAprovadaPor')
      .sort({ turma: 1, nome: 1 })
      .lean();

    const porTurma = {};
    alunos.forEach(aluno => {
      const t = aluno.turma || 'Sem turma';
      if (!porTurma[t]) porTurma[t] = [];
      porTurma[t].push({
        id: aluno._id,
        nome: aluno.nome,
        matricula: aluno.matricula,
        curso: aluno.curso,
        condicao: obterLabelCondicao(aluno.condicaoAcessibilidade),
        condicaoTipo: aluno.condicaoAcessibilidade,
        detalhes: aluno.outraCondicao,
        status: aluno.acessibilidadeAprovadaPor ? 'aprovada' : 'pendente'
      });
    });

    const porCondicao = {};
    alunos.forEach(a => {
      const c = obterLabelCondicao(a.condicaoAcessibilidade);
      porCondicao[c] = (porCondicao[c] || 0) + 1;
    });

    const aprovados = alunos.filter(a => a.acessibilidadeAprovadaPor).length;

    res.json({
      success: true,
      relatorio: {
        dataGeracao: new Date(),
        totalAlunos: alunos.length,
        totalAprovados: aprovados,
        totalPendentes: alunos.length - aprovados,
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
// GET /api/aee/relatorio/turma/:turma
// ============================================================================
router.get('/relatorio/turma/:turma', authenticateTokenLocal, verificarPermissaoAEE, async (req, res) => {
  try {
    const { turma } = req.params;

    const alunos = await User.find({
      role: 'aluno', precisaAcessibilidade: true, ativo: true, turma
    })
      .select('nome email matricula curso condicaoAcessibilidade outraCondicao acessibilidadeAprovadaPor')
      .sort({ nome: 1 })
      .lean();

    res.json({
      success: true,
      turma,
      total: alunos.length,
      alunos: alunos.map(a => ({
        id: a._id,
        nome: a.nome,
        email: a.email,
        matricula: a.matricula,
        curso: a.curso,
        condicao: obterLabelCondicao(a.condicaoAcessibilidade),
        condicaoTipo: a.condicaoAcessibilidade,
        detalhes: a.outraCondicao,
        status: a.acessibilidadeAprovadaPor ? 'aprovada' : 'pendente'
      }))
    });

  } catch (error) {
    logger.error('❌ AEE relatorio turma:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// GET /api/aee/relatorio/aluno/:id
// ============================================================================
router.get('/relatorio/aluno/:id', authenticateTokenLocal, verificarPermissaoAEE, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id.match(/^[0-9a-fA-F]{24}$/)) return res.status(400).json({ success: false, error: 'ID inválido' });

    const aluno = await User.findOne({ _id: id, role: 'aluno' })
      .select('nome email matricula turma curso condicaoAcessibilidade outraCondicao acessibilidadeAprovadaPor')
      .lean();

    if (!aluno) return res.status(404).json({ success: false, error: 'Aluno não encontrado' });

    let provas = [];
    if (Resultado) {
      const resultados = await Resultado.find({ userId: id })
        .populate('provaId', 'titulo tipoProva adaptada')
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();

      provas = resultados.map(r => {
        const nota = extrairNota(r);
        const notaLiberada = extrairNotaLiberada(r);

        return {
          provaTitulo: r.provaId?.titulo,
          adaptada: r.provaId?.adaptada || r.provaId?.tipoProva === 'adaptada',
          nota: notaLiberada ? nota : null,
          data: r.createdAt
        };
      });
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
        condicao: {
          tipo: aluno.condicaoAcessibilidade,
          label: obterLabelCondicao(aluno.condicaoAcessibilidade),
          detalhes: aluno.outraCondicao
        },
        dataSolicitacao: aluno.dataSolicitacaoAcessibilidade,
        status: aluno.acessibilidadeAprovadaPor ? 'aprovada' : 'pendente'
      },
      provasRealizadas: provas
    });

  } catch (error) {
    logger.error('❌ AEE relatorio aluno:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// POST /api/aee/alunos/:id/condicao
// ============================================================================
router.post('/alunos/:id/condicao', authenticateTokenLocal, verificarPermissaoAEE, async (req, res) => {
  try {
    const { id } = req.params;
    const { condicao, outraCondicao, aprovada } = req.body;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) return res.status(400).json({ success: false, error: 'ID inválido' });
    if (!condicao) return res.status(400).json({ success: false, error: 'Condição é obrigatória' });

    const condicoesValidas = CONDICOES_LISTA.map(c => c.valor);
    if (!condicoesValidas.includes(condicao)) return res.status(400).json({ success: false, error: 'Condição inválida' });

    const updateData = {
      precisaAcessibilidade: true,
      condicaoAcessibilidade: condicao,
      outraCondicao: condicao === 'outra' ? (outraCondicao || '') : '',
      dataSolicitacaoAcessibilidade: new Date()
    };

    if (aprovada !== false) {
      updateData.acessibilidadeAprovadaPor = req.userId;
      updateData.acessibilidadeAprovadaEm = new Date();
    }

    const aluno = await User.findByIdAndUpdate(id, updateData, { new: true })
      .select('nome email matricula turma condicaoAcessibilidade outraCondicao acessibilidadeAprovadaPor');

    if (!aluno) return res.status(404).json({ success: false, error: 'Aluno não encontrado' });

    res.json({
      success: true,
      message: 'Condição atualizada',
      aluno: {
        id: aluno._id,
        nome: aluno.nome,
        condicao: {
          tipo: aluno.condicaoAcessibilidade,
          label: obterLabelCondicao(aluno.condicaoAcessibilidade),
          detalhes: aluno.outraCondicao
        },
        status: aluno.acessibilidadeAprovadaPor ? 'aprovada' : 'pendente'
      }
    });

  } catch (error) {
    logger.error('❌ AEE condicao:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;