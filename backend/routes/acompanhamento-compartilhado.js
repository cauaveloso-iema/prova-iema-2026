// ============================================================================
// ROTA: /api/acompanhamento-compartilhado
// Agrega dados de TODOS os setores para a aba compartilhada
// ============================================================================

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const User = require('../models/User');

// ============================================================================
// MODELOS OPCIONAIS (carregamento seguro)
// ============================================================================
let Atraso = null;
let AtendimentoAssistenteSocial = null;
let AtendimentoPsicologia = null;
let AtendimentoSupervisao = null;

try { Atraso = require('../models/Atraso'); } catch (e) {}
try { AtendimentoAssistenteSocial = require('../models/AtendimentoAssistenteSocial'); } catch (e) {}
try { AtendimentoPsicologia = require('../models/AtendimentoPsicologia'); } catch (e) {}
try { AtendimentoSupervisao = require('../models/AtendimentoSupervisao'); } catch (e) {}

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

// Permite TODOS os setores de acompanhamento
const verificarAcesso = (req, res, next) => {
  const allowedRoles = [
    'gestao_geral', 'assistente-social', 'psicologia', 'supervisao',
    'super_admin', 'admin'
  ];
  if (!allowedRoles.includes(req.userRole)) {
    return res.status(403).json({
      success: false,
      error: 'Acesso restrito a setores de acompanhamento'
    });
  }
  next();
};

// ============================================================================
// HELPERS: Timezone Brasil (UTC-3)
// ============================================================================
function inicioDoDiaBrasil(dataStr) {
  return new Date(dataStr + 'T00:00:00.000-03:00');
}
function fimDoDiaBrasil(dataStr) {
  return new Date(dataStr + 'T23:59:59.999-03:00');
}

// ============================================================================
// HELPER: Resumo do dia atual
// ============================================================================
async function getResumoDia() {
  const hojeStr = new Date().toISOString().split('T')[0];
  const inicio = inicioDoDiaBrasil(hojeStr);
  const fim = fimDoDiaBrasil(hojeStr);

  const resumo = {
    gestao: { total: 0, motivos: [] },
    assistente_social: { total: 0, tipos: [] },
    psicologia: { total: 0, tipos: [] },
    supervisao: { total: 0, motivos: [] },
    alunosUnicos: 0
  };

  const alunosSet = new Set();
  const motivosGestao = {};
  const tiposAS = {};
  const tiposPsico = {};
  const motivosSupervisao = {};

  // ===== GESTÃO (Atrasos) =====
  if (Atraso) {
    try {
      const atrasos = await Atraso.find({ dataHora: { $gte: inicio, $lte: fim } }).lean();
      resumo.gestao.total = atrasos.length;
      atrasos.forEach(a => {
        const label = Atraso.getMotivoLabel(a.motivo);
        motivosGestao[label] = (motivosGestao[label] || 0) + 1;
        if (a.alunoId) alunosSet.add(a.alunoId.toString());
      });
    } catch (e) { console.error('Erro gestão:', e.message); }
  }

  // ===== ASSISTENTE SOCIAL =====
  if (AtendimentoAssistenteSocial) {
    try {
      const atends = await AtendimentoAssistenteSocial.find({
        'entrada.dataHora': { $gte: inicio, $lte: fim }
      }).lean();
      resumo.assistente_social.total = atends.length;
      atends.forEach(a => {
        const label = AtendimentoAssistenteSocial.getTipoTarefaLabel(a.tipoTarefa);
        tiposAS[label] = (tiposAS[label] || 0) + 1;
        if (a.alunoId) alunosSet.add(a.alunoId.toString());
      });
    } catch (e) { console.error('Erro AS:', e.message); }
  }

  // ===== PSICOLOGIA =====
  if (AtendimentoPsicologia) {
    try {
      const atends = await AtendimentoPsicologia.find({
        'entrada.dataHora': { $gte: inicio, $lte: fim }
      }).lean();
      resumo.psicologia.total = atends.length;
      atends.forEach(a => {
        const label = AtendimentoPsicologia.getTipoTarefaLabel(a.tipoTarefa);
        tiposPsico[label] = (tiposPsico[label] || 0) + 1;
        if (a.alunoId) alunosSet.add(a.alunoId.toString());
      });
    } catch (e) { console.error('Erro Psico:', e.message); }
  }

  // ===== SUPERVISÃO =====
  if (AtendimentoSupervisao) {
    try {
      const atends = await AtendimentoSupervisao.find({
        'entrada.dataHora': { $gte: inicio, $lte: fim }
      }).lean();
      resumo.supervisao.total = atends.length;
      atends.forEach(a => {
        const label = AtendimentoSupervisao.getTipoTarefaLabel(a.tipoTarefa);
        motivosSupervisao[label] = (motivosSupervisao[label] || 0) + 1;
        if (a.alunoId) alunosSet.add(a.alunoId.toString());
      });
    } catch (e) { console.error('Erro Supervisão:', e.message); }
  }

  const toArray = (obj) => Object.entries(obj)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  resumo.gestao.motivos = toArray(motivosGestao);
  resumo.assistente_social.tipos = toArray(tiposAS);
  resumo.psicologia.tipos = toArray(tiposPsico);
  resumo.supervisao.motivos = toArray(motivosSupervisao);
  resumo.alunosUnicos = alunosSet.size;

  return resumo;
}

// ============================================================================
// HELPER: Agrega dados por aluno
// ============================================================================
async function agregarPorAluno(filtros = {}) {
  const { turma, dataInicio, dataFim, alunoId } = filtros;

  const matchAluno = {};
  if (alunoId && mongoose.Types.ObjectId.isValid(alunoId)) {
    matchAluno.alunoId = new mongoose.Types.ObjectId(alunoId);
  }
  if (turma) matchAluno.alunoTurma = turma;

  const matchData = {};
  const temFiltroData = dataInicio || dataFim;
  if (temFiltroData) {
    if (dataInicio) matchData.$gte = inicioDoDiaBrasil(dataInicio);
    if (dataFim) matchData.$lte = fimDoDiaBrasil(dataFim);
  }

  const alunosMap = new Map();

  function getOrCreate(alunoId, alunoNome, alunoTurma, alunoCurso, alunoMatricula) {
    const key = alunoId.toString();
    if (!alunosMap.has(key)) {
      alunosMap.set(key, {
        alunoId: key,
        alunoNome: alunoNome || 'Aluno',
        alunoTurma: alunoTurma || 'Sem turma',
        alunoCurso: alunoCurso || 'Não informado',
        alunoMatricula: alunoMatricula || '',
        gestao: { total: 0, motivos: {}, registros: [] },
        assistente_social: { total: 0, tipos: {}, registros: [] },
        psicologia: { total: 0, tipos: {}, registros: [] },
        supervisao: { total: 0, motivos: {}, registros: [] },
        totalGeral: 0,
        ultimaAtualizacao: null
      });
    }
    return alunosMap.get(key);
  }

  // ===== GESTÃO (Atrasos) =====
  if (Atraso) {
    try {
      const query = { ...matchAluno };
      if (temFiltroData) query.dataHora = matchData;

      const atrasos = await Atraso.find(query).sort({ dataHora: -1 }).lean();

      atrasos.forEach(a => {
        const aluno = getOrCreate(a.alunoId, a.alunoNome, a.alunoTurma, a.alunoCurso, a.alunoMatricula);
        const motivoLabel = Atraso.getMotivoLabel(a.motivo);
        aluno.gestao.total++;
        aluno.gestao.motivos[motivoLabel] = (aluno.gestao.motivos[motivoLabel] || 0) + 1;
        aluno.gestao.registros.push({
          id: a._id,
          data: a.dataHora,
          motivo: a.motivo,
          motivoLabel,
          descricao: a.descricao,
          registradoPor: a.registradoPorNome
        });
        aluno.totalGeral++;
        if (a.dataHora && (!aluno.ultimaAtualizacao || new Date(a.dataHora) > new Date(aluno.ultimaAtualizacao))) {
          aluno.ultimaAtualizacao = a.dataHora;
        }
      });
    } catch (e) { console.error('Erro agregar gestão:', e.message); }
  }

  // ===== ASSISTENTE SOCIAL =====
  if (AtendimentoAssistenteSocial) {
    try {
      const query = { ...matchAluno };
      if (temFiltroData) query['entrada.dataHora'] = matchData;

      const atends = await AtendimentoAssistenteSocial.find(query)
        .sort({ 'entrada.dataHora': -1 }).lean();

      atends.forEach(a => {
        const aluno = getOrCreate(a.alunoId, a.alunoNome, a.alunoTurma, a.alunoCurso, a.alunoMatricula);
        const tipoLabel = AtendimentoAssistenteSocial.getTipoTarefaLabel(a.tipoTarefa);
        aluno.assistente_social.total++;
        aluno.assistente_social.tipos[tipoLabel] = (aluno.assistente_social.tipos[tipoLabel] || 0) + 1;
        aluno.assistente_social.registros.push({
          id: a._id,
          data: a.entrada?.dataHora,
          tipoTarefa: a.tipoTarefa,
          tipoTarefaLabel: tipoLabel,
          descricao: a.entrada?.descricao,
          status: a.status,
          gravidade: a.entrada?.gravidade,
          temAssinatura: !!(a.entrada?.assinaturaBase64),
          temRemarcacao: !!a.temRemarcacaoPendente
        });
        aluno.totalGeral++;
        if (a.entrada?.dataHora && (!aluno.ultimaAtualizacao || new Date(a.entrada.dataHora) > new Date(aluno.ultimaAtualizacao))) {
          aluno.ultimaAtualizacao = a.entrada.dataHora;
        }
      });
    } catch (e) { console.error('Erro agregar AS:', e.message); }
  }

  // ===== PSICOLOGIA =====
  if (AtendimentoPsicologia) {
    try {
      const query = { ...matchAluno };
      if (temFiltroData) query['entrada.dataHora'] = matchData;

      const atends = await AtendimentoPsicologia.find(query)
        .sort({ 'entrada.dataHora': -1 }).lean();

      atends.forEach(a => {
        const aluno = getOrCreate(a.alunoId, a.alunoNome, a.alunoTurma, a.alunoCurso, a.alunoMatricula);
        const tipoLabel = AtendimentoPsicologia.getTipoTarefaLabel(a.tipoTarefa);
        aluno.psicologia.total++;
        aluno.psicologia.tipos[tipoLabel] = (aluno.psicologia.tipos[tipoLabel] || 0) + 1;
        aluno.psicologia.registros.push({
          id: a._id,
          data: a.entrada?.dataHora,
          tipoTarefa: a.tipoTarefa,
          tipoTarefaLabel: tipoLabel,
          descricao: a.entrada?.descricao,
          status: a.status,
          gravidade: a.entrada?.gravidade,
          temAssinatura: !!(a.entrada?.assinaturaBase64),
          temRemarcacao: !!a.temRemarcacaoPendente
        });
        aluno.totalGeral++;
        if (a.entrada?.dataHora && (!aluno.ultimaAtualizacao || new Date(a.entrada.dataHora) > new Date(aluno.ultimaAtualizacao))) {
          aluno.ultimaAtualizacao = a.entrada.dataHora;
        }
      });
    } catch (e) { console.error('Erro agregar Psico:', e.message); }
  }

  // ===== SUPERVISÃO =====
  if (AtendimentoSupervisao) {
    try {
      const query = { ...matchAluno };
      if (temFiltroData) query['entrada.dataHora'] = matchData;

      const atends = await AtendimentoSupervisao.find(query)
        .sort({ 'entrada.dataHora': -1 }).lean();

      atends.forEach(a => {
        const aluno = getOrCreate(a.alunoId, a.alunoNome, a.alunoTurma, a.alunoCurso, a.alunoMatricula);
        const tipoLabel = AtendimentoSupervisao.getTipoTarefaLabel(a.tipoTarefa);
        aluno.supervisao.total++;
        aluno.supervisao.motivos[tipoLabel] = (aluno.supervisao.motivos[tipoLabel] || 0) + 1;
        aluno.supervisao.registros.push({
          id: a._id,
          data: a.entrada?.dataHora,
          tipoTarefa: a.tipoTarefa,
          tipoTarefaLabel: tipoLabel,
          descricao: a.entrada?.descricao,
          status: a.status,
          gravidade: a.entrada?.gravidade,
          temAssinatura: !!(a.entrada?.assinaturaBase64),
          temRemarcacao: !!a.temRemarcacaoPendente
        });
        aluno.totalGeral++;
        if (a.entrada?.dataHora && (!aluno.ultimaAtualizacao || new Date(a.entrada.dataHora) > new Date(aluno.ultimaAtualizacao))) {
          aluno.ultimaAtualizacao = a.entrada.dataHora;
        }
      });
    } catch (e) { console.error('Erro agregar Supervisão:', e.message); }
  }

  const alunos = Array.from(alunosMap.values());
  alunos.sort((a, b) => b.totalGeral - a.totalGeral);

  return alunos;
}

// ============================================================================
// ROTA: HEALTH
// ============================================================================
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'Acompanhamento Compartilhado',
    modelos: {
      atraso: !!Atraso,
      assistenteSocial: !!AtendimentoAssistenteSocial,
      psicologia: !!AtendimentoPsicologia,
      supervisao: !!AtendimentoSupervisao
    },
    timestamp: new Date().toISOString()
  });
});

// ============================================================================
// ROTA: RESUMO DO DIA
// GET /api/acompanhamento-compartilhado/resumo-dia
// ============================================================================
router.get('/resumo-dia', authenticateToken, verificarAcesso, async (req, res) => {
  try {
    const resumo = await getResumoDia();
    res.json({ success: true, resumo, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('❌ Erro resumo-dia:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// ROTA: LISTA DE ALUNOS AGREGADOS
// GET /api/acompanhamento-compartilhado/alunos
// Query: ?turma=X&dataInicio=YYYY-MM-DD&dataFim=YYYY-MM-DD&alunoId=X&busca=X&limit=100
// ============================================================================
router.get('/alunos', authenticateToken, verificarAcesso, async (req, res) => {
  try {
    const { turma, dataInicio, dataFim, alunoId, busca, limit = 100 } = req.query;

    let alunos = await agregarPorAluno({ turma, dataInicio, dataFim, alunoId });

    // Filtro de busca
    if (busca) {
      const termo = String(busca).toLowerCase();
      alunos = alunos.filter(a =>
        (a.alunoNome || '').toLowerCase().includes(termo) ||
        (a.alunoMatricula || '').toLowerCase().includes(termo)
      );
    }

    const total = alunos.length;
    const limitNum = parseInt(limit);
    const alunosPaginados = alunos.slice(0, limitNum);

    // Estatísticas gerais
    const stats = {
      totalAlunos: total,
      totalOcorrencias: alunos.reduce((s, a) => s + a.totalGeral, 0),
      porSetor: {
        gestao: alunos.reduce((s, a) => s + a.gestao.total, 0),
        assistente_social: alunos.reduce((s, a) => s + a.assistente_social.total, 0),
        psicologia: alunos.reduce((s, a) => s + a.psicologia.total, 0),
        supervisao: alunos.reduce((s, a) => s + a.supervisao.total, 0)
      }
    };

    res.json({
      success: true,
      total,
      stats,
      alunos: alunosPaginados,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Erro /alunos:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// ROTA: DETALHE DE UM ALUNO
// GET /api/acompanhamento-compartilhado/aluno/:alunoId
// ============================================================================
router.get('/aluno/:alunoId', authenticateToken, verificarAcesso, async (req, res) => {
  try {
    const { alunoId } = req.params;
    const { dataInicio, dataFim } = req.query;

    if (!mongoose.Types.ObjectId.isValid(alunoId)) {
      return res.status(400).json({ success: false, error: 'ID inválido' });
    }

    const alunos = await agregarPorAluno({ alunoId, dataInicio, dataFim });

    if (alunos.length === 0) {
      return res.status(404).json({ success: false, error: 'Aluno não encontrado' });
    }

    res.json({ success: true, aluno: alunos[0], timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('❌ Erro /aluno/:id:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// ROTA: TURMAS DISPONÍVEIS
// GET /api/acompanhamento-compartilhado/turmas
// ============================================================================
router.get('/turmas', authenticateToken, verificarAcesso, async (req, res) => {
  try {
    const turmasSet = new Set();

    // Turmas dos alunos cadastrados
    try {
      const turmasAlunos = await User.distinct('turma', {
        role: 'aluno', ativo: true,
        turma: { $nin: [null, '', 'Não informada'] }
      });
      turmasAlunos.forEach(t => turmasSet.add(t));
    } catch (e) {}

    // Turmas com registros nos setores
    const models = [
      { m: Atraso, campo: 'alunoTurma' },
      { m: AtendimentoAssistenteSocial, campo: 'alunoTurma' },
      { m: AtendimentoPsicologia, campo: 'alunoTurma' },
      { m: AtendimentoSupervisao, campo: 'alunoTurma' }
    ];

    for (const { m, campo } of models) {
      if (!m) continue;
      try {
        const turmas = await m.distinct(campo);
        turmas.filter(t => t && t !== 'Não informada').forEach(t => turmasSet.add(t));
      } catch (e) {}
    }

    const turmas = Array.from(turmasSet).sort();
    res.json({ success: true, turmas });
  } catch (error) {
    console.error('❌ Erro /turmas:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// ROTA: RANKING DE ALUNOS
// GET /api/acompanhamento-compartilhado/ranking?limit=10&dataInicio=&dataFim=
// ============================================================================
router.get('/ranking', authenticateToken, verificarAcesso, async (req, res) => {
  try {
    const { limit = 10, dataInicio, dataFim } = req.query;
    const alunos = await agregarPorAluno({ dataInicio, dataFim });
    const top = alunos.slice(0, parseInt(limit));

    res.json({
      success: true,
      total: alunos.length,
      ranking: top.map((a, i) => ({
        posicao: i + 1,
        alunoId: a.alunoId,
        alunoNome: a.alunoNome,
        alunoTurma: a.alunoTurma,
        alunoCurso: a.alunoCurso,
        totalGeral: a.totalGeral,
        porSetor: {
          gestao: a.gestao.total,
          assistente_social: a.assistente_social.total,
          psicologia: a.psicologia.total,
          supervisao: a.supervisao.total
        }
      }))
    });
  } catch (error) {
    console.error('❌ Erro /ranking:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// ROTA: ESTATÍSTICAS POR SETOR (gráficos)
// GET /api/acompanhamento-compartilhado/estatisticas?dataInicio=&dataFim=
// ============================================================================
router.get('/estatisticas', authenticateToken, verificarAcesso, async (req, res) => {
  try {
    const { dataInicio, dataFim } = req.query;
    const alunos = await agregarPorAluno({ dataInicio, dataFim });

    const motivosGestao = {};
    const tiposAS = {};
    const tiposPsico = {};
    const motivosSupervisao = {};
    const porTurma = {};

    alunos.forEach(a => {
      Object.entries(a.gestao.motivos).forEach(([k, v]) => {
        motivosGestao[k] = (motivosGestao[k] || 0) + v;
      });
      Object.entries(a.assistente_social.tipos).forEach(([k, v]) => {
        tiposAS[k] = (tiposAS[k] || 0) + v;
      });
      Object.entries(a.psicologia.tipos).forEach(([k, v]) => {
        tiposPsico[k] = (tiposPsico[k] || 0) + v;
      });
      Object.entries(a.supervisao.motivos).forEach(([k, v]) => {
        motivosSupervisao[k] = (motivosSupervisao[k] || 0) + v;
      });
      const t = a.alunoTurma || 'Sem turma';
      porTurma[t] = (porTurma[t] || 0) + a.totalGeral;
    });

    const toArray = (obj) => Object.entries(obj)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);

    res.json({
      success: true,
      estatisticas: {
        gestao: { motivos: toArray(motivosGestao) },
        assistente_social: { tipos: toArray(tiposAS) },
        psicologia: { tipos: toArray(tiposPsico) },
        supervisao: { motivos: toArray(motivosSupervisao) },
        porTurma: toArray(porTurma)
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Erro /estatisticas:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;