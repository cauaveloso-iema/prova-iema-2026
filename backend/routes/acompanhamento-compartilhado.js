// ============================================================================
// ROTA: /api/acompanhamento-compartilhado
// Agrega dados de TODOS os setores (incluindo BIBLIOTECA)
// v2.0 - OTIMIZADO: Aggregations no MongoDB, sem loops pesados em memória
// ============================================================================

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const User = require('../models/User');
const AtendimentoBiblioteca = require('../models/AtendimentoBiblioteca');

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

console.log('📚 [acompanhamento-compartilhado] Models carregados:');
console.log('   - Atraso:', !!Atraso);
console.log('   - AssistenteSocial:', !!AtendimentoAssistenteSocial);
console.log('   - Psicologia:', !!AtendimentoPsicologia);
console.log('   - Supervisao:', !!AtendimentoSupervisao);
console.log('   - Biblioteca:', !!AtendimentoBiblioteca);

// ============================================================================
// MIDDLEWARES
// ============================================================================
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ success: false, error: 'Token não fornecido' });

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ success: false, error: 'Token inválido ou expirado' });
    req.userId = decoded.id;
    req.userRole = decoded.role;
    req.userNome = decoded.nome;
    next();
  });
};

const verificarAcesso = (req, res, next) => {
  const allowedRoles = [
    'gestao_geral', 'assistente-social', 'psicologia', 'supervisao',
    'biblioteca', 'professor', 'super_admin', 'admin'
  ];
  if (!allowedRoles.includes(req.userRole)) {
    return res.status(403).json({ success: false, error: 'Acesso restrito a setores de acompanhamento' });
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

function getMotivoBibliotecaLabel(motivo, motivoOutros) {
  const labels = {
    'ler_livro': 'Ler um Livro',
    'pegar_livro_emprestado': 'Pegar um Livro Emprestado',
    'participar_atividade_leitura': 'Participar de Atividade de Leitura',
    'fazer_pesquisa': 'Fazer Pesquisa',
    'outros': motivoOutros ? `Outros: ${motivoOutros}` : 'Outros'
  };
  return labels[motivo] || 'Consulta';
}

// ============================================================================
// HELPER: Resumo do dia atual (COM BIBLIOTECA) - Rápido pois busca só do dia
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
    biblioteca: { total: 0, motivos: [] },
    alunosUnicos: 0
  };

  const alunosSet = new Set();
  const motivosGestao = {};
  const tiposAS = {};
  const tiposPsico = {};
  const motivosSupervisao = {};
  const motivosBiblioteca = {};

  // Busca tudo em paralelo
  const [atrasos, atendsAS, atendsPsi, atendsSup, visitasBib] = await Promise.all([
    Atraso ? Atraso.find({ dataHora: { $gte: inicio, $lte: fim } }).lean() : [],
    AtendimentoAssistenteSocial ? AtendimentoAssistenteSocial.find({ 'entrada.dataHora': { $gte: inicio, $lte: fim } }).lean() : [],
    AtendimentoPsicologia ? AtendimentoPsicologia.find({ 'entrada.dataHora': { $gte: inicio, $lte: fim } }).lean() : [],
    AtendimentoSupervisao ? AtendimentoSupervisao.find({ 'entrada.dataHora': { $gte: inicio, $lte: fim } }).lean() : [],
    AtendimentoBiblioteca ? AtendimentoBiblioteca.find({ 'entrada.dataHora': { $gte: inicio, $lte: fim } }).lean() : []
  ]);

  atrasos.forEach(a => {
    const label = Atraso.getMotivoLabel(a.motivo);
    motivosGestao[label] = (motivosGestao[label] || 0) + 1;
    if (a.alunoId) alunosSet.add(a.alunoId.toString());
  });
  resumo.gestao.total = atrasos.length;

  atendsAS.forEach(a => {
    const label = AtendimentoAssistenteSocial.getTipoTarefaLabel(a.tipoTarefa);
    tiposAS[label] = (tiposAS[label] || 0) + 1;
    if (a.alunoId) alunosSet.add(a.alunoId.toString());
  });
  resumo.assistente_social.total = atendsAS.length;

  atendsPsi.forEach(a => {
    const label = AtendimentoPsicologia.getTipoTarefaLabel(a.tipoTarefa);
    tiposPsico[label] = (tiposPsico[label] || 0) + 1;
    if (a.alunoId) alunosSet.add(a.alunoId.toString());
  });
  resumo.psicologia.total = atendsPsi.length;

  atendsSup.forEach(a => {
    const label = AtendimentoSupervisao.getTipoTarefaLabel(a.tipoTarefa);
    motivosSupervisao[label] = (motivosSupervisao[label] || 0) + 1;
    if (a.alunoId) alunosSet.add(a.alunoId.toString());
  });
  resumo.supervisao.total = atendsSup.length;

  visitasBib.forEach(v => {
    const label = getMotivoBibliotecaLabel(v.motivoVisita, v.motivoOutros);
    motivosBiblioteca[label] = (motivosBiblioteca[label] || 0) + 1;
    if (v.alunoId) alunosSet.add(v.alunoId.toString());
  });
  resumo.biblioteca.total = visitasBib.length;

  const toArray = (obj) => Object.entries(obj)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  resumo.gestao.motivos = toArray(motivosGestao);
  resumo.assistente_social.tipos = toArray(tiposAS);
  resumo.psicologia.tipos = toArray(tiposPsico);
  resumo.supervisao.motivos = toArray(motivosSupervisao);
  resumo.biblioteca.motivos = toArray(motivosBiblioteca);
  resumo.alunosUnicos = alunosSet.size;

  return resumo;
}

// ============================================================================
// HELPER: Agrega dados por aluno — OTIMIZADO PARA O MONGO
// ============================================================================
async function agregarPorAluno(filtros = {}) {
  const { turma, dataInicio, dataFim, alunoId } = filtros;

  const matchBase = {};
  if (alunoId && mongoose.Types.ObjectId.isValid(alunoId)) {
    matchBase.alunoId = new mongoose.Types.ObjectId(alunoId);
  }
  if (turma) matchBase.alunoTurma = turma;

  const matchData = {};
  const temFiltroData = dataInicio || dataFim;
  if (temFiltroData) {
    if (dataInicio) matchData.$gte = inicioDoDiaBrasil(dataInicio);
    if (dataFim) matchData.$lte = fimDoDiaBrasil(dataFim);
  }

  // Função auxiliar para rodar aggregations em paralelo
  const runAgg = async (Model, dateField, typeField, labelFn) => {
    if (!Model) return [];
    const match = { ...matchBase };
    if (temFiltroData) match[dateField] = matchData;

    const pipeline = [
      { $match: match },
      { $sort: { [dateField]: -1 } },
      { $group: {
          _id: '$alunoId',
          alunoNome: { $first: '$alunoNome' },
          alunoTurma: { $first: '$alunoTurma' },
          alunoCurso: { $first: '$alunoCurso' },
          alunoMatricula: { $first: '$alunoMatricula' },
          total: { $sum: 1 },
          ultimaAtualizacao: { $max: `$${dateField}` },
          registros: { $push: '$$ROOT' }
      }}
    ];
    return await Model.aggregate(pipeline);
  };

  // Executa todos os aggregates em paralelo
  const [aggGestao, aggAS, aggPsi, aggSup, aggBib] = await Promise.all([
    runAgg(Atraso, 'dataHora', 'motivo'),
    runAgg(AtendimentoAssistenteSocial, 'entrada.dataHora', 'tipoTarefa'),
    runAgg(AtendimentoPsicologia, 'entrada.dataHora', 'tipoTarefa'),
    runAgg(AtendimentoSupervisao, 'entrada.dataHora', 'tipoTarefa'),
    runAgg(AtendimentoBiblioteca, 'entrada.dataHora', 'motivoVisita')
  ]);

  const alunosMap = new Map();

  function getOrCreate(id, nome, turma, curso, matricula) {
    const key = id.toString();
    if (!alunosMap.has(key)) {
      alunosMap.set(key, {
        alunoId: key,
        alunoNome: nome || 'Aluno',
        alunoTurma: turma || 'Sem turma',
        alunoCurso: curso || 'Não informado',
        alunoMatricula: matricula || '',
        gestao: { total: 0, motivos: {}, registros: [] },
        assistente_social: { total: 0, tipos: {}, registros: [] },
        psicologia: { total: 0, tipos: {}, registros: [] },
        supervisao: { total: 0, motivos: {}, registros: [] },
        biblioteca: { total: 0, motivos: {}, registros: [] },
        totalGeral: 0,
        ultimaAtualizacao: null
      });
    }
    return alunosMap.get(key);
  }

  function updateUltima(aluno, data) {
    if (data && (!aluno.ultimaAtualizacao || new Date(data) > new Date(aluno.ultimaAtualizacao))) {
      aluno.ultimaAtualizacao = data;
    }
  }

  // Processa Gestão
  aggGestao.forEach(g => {
    const aluno = getOrCreate(g._id, g.alunoNome, g.alunoTurma, g.alunoCurso, g.alunoMatricula);
    aluno.gestao.total = g.total;
    g.registros.forEach(r => {
      const label = Atraso.getMotivoLabel(r.motivo);
      aluno.gestao.motivos[label] = (aluno.gestao.motivos[label] || 0) + 1;
      aluno.gestao.registros.push({
        id: r._id, data: r.dataHora, motivo: r.motivo, motivoLabel: label,
        descricao: r.descricao, registradoPor: r.registradoPorNome
      });
    });
    aluno.totalGeral += g.total;
    updateUltima(aluno, g.ultimaAtualizacao);
  });

  // Processa AS
  aggAS.forEach(g => {
    const aluno = getOrCreate(g._id, g.alunoNome, g.alunoTurma, g.alunoCurso, g.alunoMatricula);
    aluno.assistente_social.total = g.total;
    g.registros.forEach(r => {
      const label = AtendimentoAssistenteSocial.getTipoTarefaLabel(r.tipoTarefa);
      aluno.assistente_social.tipos[label] = (aluno.assistente_social.tipos[label] || 0) + 1;
      aluno.assistente_social.registros.push({
        id: r._id, data: r.entrada?.dataHora, tipoTarefa: r.tipoTarefa, tipoTarefaLabel: label,
        descricao: r.entrada?.descricao, status: r.status, gravidade: r.entrada?.gravidade,
        temAssinatura: !!(r.entrada?.assinaturaBase64), temRemarcacao: !!r.temRemarcacaoPendente
      });
    });
    aluno.totalGeral += g.total;
    updateUltima(aluno, g.ultimaAtualizacao);
  });

  // Processa Psi
  aggPsi.forEach(g => {
    const aluno = getOrCreate(g._id, g.alunoNome, g.alunoTurma, g.alunoCurso, g.alunoMatricula);
    aluno.psicologia.total = g.total;
    g.registros.forEach(r => {
      const label = AtendimentoPsicologia.getTipoTarefaLabel(r.tipoTarefa);
      aluno.psicologia.tipos[label] = (aluno.psicologia.tipos[label] || 0) + 1;
      aluno.psicologia.registros.push({
        id: r._id, data: r.entrada?.dataHora, tipoTarefa: r.tipoTarefa, tipoTarefaLabel: label,
        descricao: r.entrada?.descricao, status: r.status, gravidade: r.entrada?.gravidade,
        temAssinatura: !!(r.entrada?.assinaturaBase64), temRemarcacao: !!r.temRemarcacaoPendente
      });
    });
    aluno.totalGeral += g.total;
    updateUltima(aluno, g.ultimaAtualizacao);
  });

  // Processa Sup
  aggSup.forEach(g => {
    const aluno = getOrCreate(g._id, g.alunoNome, g.alunoTurma, g.alunoCurso, g.alunoMatricula);
    aluno.supervisao.total = g.total;
    g.registros.forEach(r => {
      const label = AtendimentoSupervisao.getTipoTarefaLabel(r.tipoTarefa);
      aluno.supervisao.motivos[label] = (aluno.supervisao.motivos[label] || 0) + 1;
      aluno.supervisao.registros.push({
        id: r._id, data: r.entrada?.dataHora, tipoTarefa: r.tipoTarefa, tipoTarefaLabel: label,
        descricao: r.entrada?.descricao, status: r.status, gravidade: r.entrada?.gravidade,
        temAssinatura: !!(r.entrada?.assinaturaBase64), temRemarcacao: !!r.temRemarcacaoPendente
      });
    });
    aluno.totalGeral += g.total;
    updateUltima(aluno, g.ultimaAtualizacao);
  });

  // Processa Bib
  aggBib.forEach(g => {
    const aluno = getOrCreate(g._id, g.alunoNome, g.alunoTurma, g.alunoCurso, g.alunoMatricula);
    aluno.biblioteca.total = g.total;
    g.registros.forEach(r => {
      const label = getMotivoBibliotecaLabel(r.motivoVisita, r.motivoOutros);
      aluno.biblioteca.motivos[label] = (aluno.biblioteca.motivos[label] || 0) + 1;
      let duracao = 0;
      if (r.entrada?.dataHora && r.saida?.dataHora) {
        duracao = Math.round((new Date(r.saida.dataHora) - new Date(r.entrada.dataHora)) / 60000);
      } else if (r.duracaoMinutos) duracao = r.duracaoMinutos;

      aluno.biblioteca.registros.push({
        id: r._id, data: r.entrada?.dataHora, dataSaida: r.saida?.dataHora || null,
        motivo: r.motivoVisita, motivoLabel: label, atividades: r.atividades || [],
        duracao, status: r.status, observacoes: r.entrada?.observacoes || ''
      });
    });
    aluno.totalGeral += g.total;
    updateUltima(aluno, g.ultimaAtualizacao);
  });

  const alunos = Array.from(alunosMap.values());
  alunos.sort((a, b) => b.totalGeral - a.totalGeral);
  return alunos;
}

// ============================================================================
// ROTAS
// ============================================================================
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'Acompanhamento Compartilhado',
    modelos: {
      atraso: !!Atraso, assistenteSocial: !!AtendimentoAssistenteSocial,
      psicologia: !!AtendimentoPsicologia, supervisao: !!AtendimentoSupervisao,
      biblioteca: !!AtendimentoBiblioteca
    },
    timestamp: new Date().toISOString()
  });
});

router.get('/resumo-dia', authenticateToken, verificarAcesso, async (req, res) => {
  try {
    const resumo = await getResumoDia();
    res.json({ success: true, resumo, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('❌ Erro resumo-dia:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/alunos', authenticateToken, verificarAcesso, async (req, res) => {
  try {
    const { turma, dataInicio, dataFim, alunoId, busca, limit = 100 } = req.query;
    let alunos = await agregarPorAluno({ turma, dataInicio, dataFim, alunoId });

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

    const stats = {
      totalAlunos: total,
      totalOcorrencias: alunos.reduce((s, a) => s + a.totalGeral, 0),
      porSetor: {
        gestao: alunos.reduce((s, a) => s + a.gestao.total, 0),
        assistente_social: alunos.reduce((s, a) => s + a.assistente_social.total, 0),
        psicologia: alunos.reduce((s, a) => s + a.psicologia.total, 0),
        supervisao: alunos.reduce((s, a) => s + a.supervisao.total, 0),
        biblioteca: alunos.reduce((s, a) => s + a.biblioteca.total, 0)
      }
    };

    res.json({ success: true, total, stats, alunos: alunosPaginados, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('❌ Erro /alunos:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

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

router.get('/turmas', authenticateToken, verificarAcesso, async (req, res) => {
  try {
    const turmasSet = new Set();
    const turmasAlunos = await User.distinct('turma', {
      role: 'aluno', ativo: true, turma: { $nin: [null, '', 'Não informada'] }
    });
    turmasAlunos.forEach(t => turmasSet.add(t));

    const models = [
      { m: Atraso, campo: 'alunoTurma' }, { m: AtendimentoAssistenteSocial, campo: 'alunoTurma' },
      { m: AtendimentoPsicologia, campo: 'alunoTurma' }, { m: AtendimentoSupervisao, campo: 'alunoTurma' },
      { m: AtendimentoBiblioteca, campo: 'alunoTurma' }
    ];
    for (const { m, campo } of models) {
      if (!m) continue;
      const turmas = await m.distinct(campo);
      turmas.filter(t => t && t !== 'Não informada').forEach(t => turmasSet.add(t));
    }

    res.json({ success: true, turmas: Array.from(turmasSet).sort() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/ranking', authenticateToken, verificarAcesso, async (req, res) => {
  try {
    const { limit = 10, dataInicio, dataFim } = req.query;
    const alunos = await agregarPorAluno({ dataInicio, dataFim });
    const top = alunos.slice(0, parseInt(limit));
    res.json({
      success: true, total: alunos.length,
      ranking: top.map((a, i) => ({
        posicao: i + 1, alunoId: a.alunoId, alunoNome: a.alunoNome, alunoTurma: a.alunoTurma,
        alunoCurso: a.alunoCurso, totalGeral: a.totalGeral,
        porSetor: {
          gestao: a.gestao.total, assistente_social: a.assistente_social.total,
          psicologia: a.psicologia.total, supervisao: a.supervisao.total, biblioteca: a.biblioteca.total
        }
      }))
    });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/estatisticas', authenticateToken, verificarAcesso, async (req, res) => {
  try {
    const { dataInicio, dataFim } = req.query;
    const alunos = await agregarPorAluno({ dataInicio, dataFim });
    const motivosGestao = {}, tiposAS = {}, tiposPsico = {}, motivosSupervisao = {}, motivosBiblioteca = {}, porTurma = {};

    alunos.forEach(a => {
      Object.entries(a.gestao.motivos).forEach(([k, v]) => { motivosGestao[k] = (motivosGestao[k] || 0) + v; });
      Object.entries(a.assistente_social.tipos).forEach(([k, v]) => { tiposAS[k] = (tiposAS[k] || 0) + v; });
      Object.entries(a.psicologia.tipos).forEach(([k, v]) => { tiposPsico[k] = (tiposPsico[k] || 0) + v; });
      Object.entries(a.supervisao.motivos).forEach(([k, v]) => { motivosSupervisao[k] = (motivosSupervisao[k] || 0) + v; });
      Object.entries(a.biblioteca.motivos).forEach(([k, v]) => { motivosBiblioteca[k] = (motivosBiblioteca[k] || 0) + v; });
      const t = a.alunoTurma || 'Sem turma';
      porTurma[t] = (porTurma[t] || 0) + a.totalGeral;
    });

    const toArray = (obj) => Object.entries(obj).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);

    res.json({
      success: true,
      estatisticas: {
        gestao: { motivos: toArray(motivosGestao) }, assistente_social: { tipos: toArray(tiposAS) },
        psicologia: { tipos: toArray(tiposPsico) }, supervisao: { motivos: toArray(motivosSupervisao) },
        biblioteca: { motivos: toArray(motivosBiblioteca) }, porTurma: toArray(porTurma)
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

module.exports = router;