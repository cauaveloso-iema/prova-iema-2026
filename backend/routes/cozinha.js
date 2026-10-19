// ============================================================================
// COZINHA - EducaPleno
// ============================================================================
// Rotas:
//   - GET    /api/cozinha/health
//   - GET    /api/cozinha/dashboard        (aceita ?data, ?dataInicio/?dataFim, ?todos)
//   - GET    /api/cozinha/turmas-cursos
//   - GET    /api/cozinha/analise-turmas   (aceita ?data, ?dataInicio/?dataFim, ?todos, ?ano)
//   - GET    /api/cozinha/faltantes        (aceita ?data, ?dataInicio/?dataFim, ?todos)
//   - GET    /api/cozinha/analise-semanal
//   - GET    /api/cozinha/registro/:id
//   - PUT    /api/cozinha/registro/:id
//   - DELETE /api/cozinha/registro/:id
// ============================================================================

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

let logger;
try { logger = require('../utils/logger'); } catch (err) { logger = console; }

const User = require('../models/User');

let Refeicao = null;
try { Refeicao = require('../models/Refeicao'); }
catch (err) { console.warn('[cozinha] Model Refeicao não disponível:', err.message); }

// ============================================
// MIDDLEWARES
// ============================================
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, error: 'Token não fornecido.' });

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ success: false, error: 'Token inválido ou expirado.' });
    req.userId = decoded.id;
    req.userRole = decoded.role;
    req.userNome = decoded.nome;
    next();
  });
};

const verificarCozinha = (req, res, next) => {
  const allowed = ['cozinha', 'super_admin', 'admin'];
  if (!allowed.includes(req.userRole)) {
    return res.status(403).json({ success: false, error: 'Acesso permitido apenas para Cozinha e Administradores' });
  }
  next();
};

// ============================================
// HELPERS DE PERÍODO
// ============================================
function isDataValida(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/**
 * Constrói o filtro de data para o Mongo + metadados amigáveis.
 * Aceita (em ordem de prioridade):
 *  1) ?todos=true|1                  → sem filtro
 *  2) ?dataInicio + ?dataFim         → intervalo
 *  3) ?data=YYYY-MM-DD               → dia único
 *  4) ?periodo=hoje|ontem|semana|mes|ano|todos
 *  5) (nenhum)                       → hoje
 */
function montarFiltroData(query) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const iso = (d) => d.toISOString().split('T')[0];
  const hojeStr = iso(hoje);

  const { data, dataInicio, dataFim, todos, periodo } = query;

  // 1) TODOS
  if (todos === 'true' || todos === '1' || periodo === 'todos') {
    return {
      filtro: {},
      infoData: { tipo: 'todos', dataAtual: hojeStr, dataVisualizada: null, isHistorico: true, label: 'Todo o período' }
    };
  }

  // 2) INTERVALO EXPLÍCITO
  if (dataInicio || dataFim) {
    const ini = isDataValida(dataInicio) ? dataInicio : '1900-01-01';
    const fim = isDataValida(dataFim) ? dataFim : hojeStr;
    return {
      filtro: { data: { $gte: ini, $lte: fim } },
      infoData: {
        tipo: 'intervalo',
        dataAtual: hojeStr,
        dataInicio: ini,
        dataFim: fim,
        isHistorico: true,
        label: `${new Date(ini + 'T00:00:00').toLocaleDateString('pt-BR')} a ${new Date(fim + 'T00:00:00').toLocaleDateString('pt-BR')}`
      }
    };
  }

  // 3) DIA ESPECÍFICO
  if (data) {
    if (!isDataValida(data)) {
      const err = new Error('Formato de data inválido. Use YYYY-MM-DD');
      err.status = 400;
      throw err;
    }
    return {
      filtro: { data },
      infoData: {
        tipo: 'dia',
        dataAtual: hojeStr,
        dataVisualizada: data,
        isHistorico: data !== hojeStr,
        label: new Date(data + 'T00:00:00').toLocaleDateString('pt-BR')
      }
    };
  }

  // 4) PERÍODO NOMEADO
  if (periodo) {
    const p = periodo;
    if (p === 'hoje') {
      return {
        filtro: { data: hojeStr },
        infoData: { tipo: 'hoje', dataAtual: hojeStr, dataVisualizada: hojeStr, isHistorico: false, label: 'Hoje' }
      };
    }
    if (p === 'ontem') {
      const d = new Date(hoje); d.setDate(d.getDate() - 1);
      const ds = iso(d);
      return {
        filtro: { data: ds },
        infoData: { tipo: 'dia', dataAtual: hojeStr, dataVisualizada: ds, isHistorico: true, label: new Date(ds + 'T00:00:00').toLocaleDateString('pt-BR') }
      };
    }
    if (p === 'semana' || p === 'mes' || p === 'ano') {
      const d = new Date(hoje);
      if (p === 'semana') d.setDate(d.getDate() - 7);
      else if (p === 'mes') d.setMonth(d.getMonth() - 1);
      else d.setFullYear(d.getFullYear() - 1);
      const ini = iso(d);
      return {
        filtro: { data: { $gte: ini, $lte: hojeStr } },
        infoData: {
          tipo: 'intervalo',
          dataAtual: hojeStr,
          dataInicio: ini,
          dataFim: hojeStr,
          isHistorico: true,
          label: `${new Date(ini + 'T00:00:00').toLocaleDateString('pt-BR')} a ${new Date(hojeStr + 'T00:00:00').toLocaleDateString('pt-BR')}`
        }
      };
    }
  }

  // 5) PADRÃO: HOJE
  return {
    filtro: { data: hojeStr },
    infoData: { tipo: 'hoje', dataAtual: hojeStr, dataVisualizada: hojeStr, isHistorico: false, label: 'Hoje' }
  };
}

// ============================================
// HEALTH
// ============================================
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'online',
    service: 'Cozinha - Análise Inteligente',
    models: { Refeicao: !!Refeicao, User: !!User },
    timestamp: new Date().toISOString()
  });
});

// ============================================
// TURMAS + CURSOS
// ============================================
router.get('/turmas-cursos', authenticateToken, verificarCozinha, async (req, res) => {
  try {
    const turmasAgg = await User.aggregate([
      { $match: { role: 'aluno', ativo: true, turma: { $nin: [null, ''] } } },
      { $group: { _id: '$turma' } }
    ]);
    const cursosAgg = await User.aggregate([
      { $match: { role: 'aluno', ativo: true, curso: { $nin: [null, ''] } } },
      { $group: { _id: '$curso' } }
    ]);

    const turmas = turmasAgg.map(t => t._id).filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
    const cursos = cursosAgg.map(c => c._id).filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));

    res.json({ success: true, turmas, cursos, totalTurmas: turmas.length, totalCursos: cursos.length });
  } catch (error) {
    logger.error('❌ Erro em /turmas-cursos:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// DASHBOARD (aceita data / intervalo / todos / periodo)
// ============================================
router.get('/dashboard', authenticateToken, verificarCozinha, async (req, res) => {
  try {
    const { filtro: filtroData, infoData } = montarFiltroData(req.query);

    const hoje = new Date().toISOString().split('T')[0];
    const horaAtual = new Date().getHours();

    let refeicaoAtual = null;
    if (horaAtual >= 8 && horaAtual <= 10) refeicaoAtual = 'manha';
    else if (horaAtual >= 11 && horaAtual <= 13) refeicaoAtual = 'almoco';
    else if (horaAtual >= 14 && horaAtual <= 16) refeicaoAtual = 'tarde';

    const perfis = {
      sempre: await User.countDocuments({ ativo: true, perfilAlimentar: 'sempre' }),
      as_vezes: await User.countDocuments({ ativo: true, perfilAlimentar: 'as_vezes' }),
      nunca: await User.countDocuments({ ativo: true, perfilAlimentar: 'nunca' }),
      nao_informado: await User.countDocuments({
        ativo: true,
        $or: [
          { perfilAlimentar: 'nao_informado' },
          { perfilAlimentar: { $exists: false } },
          { perfilAlimentar: null }
        ]
      })
    };
    perfis.total = perfis.sempre + perfis.as_vezes + perfis.nunca + perfis.nao_informado;
    perfis.que_comem = perfis.sempre + perfis.as_vezes;

    // Registros do PERÍODO selecionado
    const refeicoesPeriodo = await Refeicao.find(filtroData);
    const registrosReais = {
      manha: refeicoesPeriodo.filter(r => r.tipoRefeicao === 'manha').length,
      almoco: refeicoesPeriodo.filter(r => r.tipoRefeicao === 'almoco').length,
      tarde: refeicoesPeriodo.filter(r => r.tipoRefeicao === 'tarde').length,
      total: refeicoesPeriodo.length,
      pessoasUnicas: new Set(refeicoesPeriodo.map(r => r.alunoId?.toString()).filter(Boolean)).size
    };

    const usuariosQueDisseram = await User.find({
      ativo: true, perfilAlimentar: { $in: ['sempre', 'as_vezes'] }
    }).select('_id nome perfilAlimentar');

    const usuariosQueComeram = new Set(
      refeicoesPeriodo.map(r => r.alunoId?.toString()).filter(Boolean)
    );

    let aderentes = 0, faltantes = 0;
    const faltantesLista = [];
    for (const u of usuariosQueDisseram) {
      if (usuariosQueComeram.has(u._id.toString())) {
        aderentes++;
      } else {
        faltantes++;
        faltantesLista.push({ id: u._id, nome: u.nome, perfil: u.perfilAlimentar });
      }
    }

    const taxaAdesao = usuariosQueDisseram.length > 0
      ? (aderentes / usuariosQueDisseram.length) * 100 : 0;

    // Análise por turma do PERÍODO
    const turmas = await User.distinct('turma', {
      role: 'aluno', ativo: true, turma: { $nin: [null, ''] }
    });

    const analisePorTurma = [];
    for (const turma of turmas) {
      const alunosTurma = await User.find({
        role: 'aluno', ativo: true, turma
      }).select('_id nome perfilAlimentar curso');

      const dizemQueComem = alunosTurma.filter(a =>
        a.perfilAlimentar === 'sempre' || a.perfilAlimentar === 'as_vezes'
      ).length;

      const comeramPeriodo = alunosTurma.filter(a =>
        usuariosQueComeram.has(a._id.toString())
      ).length;

      const taxaTurma = dizemQueComem > 0 ? (comeramPeriodo / dizemQueComem) * 100 : 0;
      const cursosTurma = Array.from(new Set(alunosTurma.map(a => a.curso).filter(Boolean)));

      analisePorTurma.push({
        turma,
        cursos: cursosTurma,
        totalAlunos: alunosTurma.length,
        dizemQueComem,
        comeramHoje: comeramPeriodo,
        taxaAdesao: Math.round(taxaTurma),
        faltantes: dizemQueComem - comeramPeriodo
      });
    }
    analisePorTurma.sort((a, b) => a.taxaAdesao - b.taxaAdesao);

    // Média histórica (sempre baseada em "hoje - 7*i", independente do período)
    const dataAtual = new Date(hoje);
    const datasHist = [];
    for (let i = 1; i <= 4; i++) {
      const d = new Date(dataAtual); d.setDate(dataAtual.getDate() - (7 * i));
      datasHist.push(d.toISOString().split('T')[0]);
    }
    const histManha = await Refeicao.countDocuments({ data: { $in: datasHist }, tipoRefeicao: 'manha' });
    const histAlmoco = await Refeicao.countDocuments({ data: { $in: datasHist }, tipoRefeicao: 'almoco' });
    const histTarde = await Refeicao.countDocuments({ data: { $in: datasHist }, tipoRefeicao: 'tarde' });

    const mediaHistorica = {
      manha: Math.round(histManha / 4),
      almoco: Math.round(histAlmoco / 4),
      tarde: Math.round(histTarde / 4)
    };

    const peso = 0.3;
    const previsao = {
      manha: { pessoas: Math.round(perfis.sempre * 0.3 + perfis.as_vezes * 0.1), kg: 0 },
      almoco: { pessoas: Math.round(perfis.sempre * 0.9 + perfis.as_vezes * 0.5), kg: 0 },
      tarde: { pessoas: Math.round(perfis.sempre * 0.2 + perfis.as_vezes * 0.05), kg: 0 }
    };
    if (mediaHistorica.manha > 0) previsao.manha.pessoas = Math.round(previsao.manha.pessoas * 0.7 + mediaHistorica.manha * 0.3);
    if (mediaHistorica.almoco > 0) previsao.almoco.pessoas = Math.round(previsao.almoco.pessoas * 0.7 + mediaHistorica.almoco * 0.3);
    if (mediaHistorica.tarde > 0) previsao.tarde.pessoas = Math.round(previsao.tarde.pessoas * 0.7 + mediaHistorica.tarde * 0.3);

    previsao.manha.kg = Math.ceil(previsao.manha.pessoas * peso * 1.1);
    previsao.almoco.kg = Math.ceil(previsao.almoco.pessoas * peso * 1.15);
    previsao.tarde.kg = Math.ceil(previsao.tarde.pessoas * peso * 1.1);

    const insights = [];
    if (taxaAdesao < 50 && registrosReais.total > 0) {
      insights.push({
        tipo: 'warning',
        titulo: '⚠️ Baixa adesão às refeições',
        mensagem: `Apenas ${Math.round(taxaAdesao)}% das pessoas que disseram que comem realmente vieram (${infoData.label}).`,
        acao: 'Conversar com coordenação de pátio'
      });
    } else if (taxaAdesao > 80) {
      insights.push({
        tipo: 'success',
        titulo: '✅ Alta adesão às refeições',
        mensagem: `${Math.round(taxaAdesao)}% das pessoas que disseram que comem realmente vieram (${infoData.label}).`,
        acao: 'Manter o padrão atual'
      });
    }
    const piores = analisePorTurma.filter(t => t.taxaAdesao < 50 && t.dizemQueComem > 0);
    if (piores.length > 0) {
      insights.push({
        tipo: 'danger',
        titulo: '📉 Turmas com baixa adesão',
        mensagem: piores.map(t => `${t.turma} (${t.taxaAdesao}%)`).join(', '),
        acao: 'Conversar com os professores destas turmas'
      });
    }
    if (faltantesLista.length > 10) {
      insights.push({
        tipo: 'info',
        titulo: '👤 Pessoas que não vieram no período',
        mensagem: `${faltantesLista.length} pessoas que disseram que comeriam não vieram (${infoData.label}).`,
        acao: 'Verificar se estão presentes na escola'
      });
    }
    if (infoData.isHistorico) {
      insights.push({
        tipo: 'info',
        titulo: '📅 Visualizando dados históricos',
        mensagem: `Você está visualizando dados de ${infoData.label}.`,
        acao: 'Use os filtros para mudar o período ou voltar para hoje'
      });
    }

    const tendencia = {
      manha: mediaHistorica.manha > previsao.manha.pessoas ? 'diminuindo' : 'crescendo',
      almoco: mediaHistorica.almoco > previsao.almoco.pessoas ? 'diminuindo' : 'crescendo',
      tarde: mediaHistorica.tarde > previsao.tarde.pessoas ? 'diminuindo' : 'crescendo'
    };

    res.json({
      success: true,
      data: hoje,
      dataFiltro: infoData.dataVisualizada || null,
      infoData,
      horaAtual,
      refeicaoAtual,
      perfis,
      registrosReais,
      analiseAdesao: {
        totalQueDisseramQueComem: usuariosQueDisseram.length,
        compareceram: aderentes,
        faltaram: faltantes,
        taxaAdesao: Math.round(taxaAdesao),
        faltantesLista: faltantesLista.slice(0, 10)
      },
      analisePorTurma,
      previsao,
      mediaHistorica,
      tendencia,
      insights,
      sugestaoAtual: (() => {
        if (!refeicaoAtual) return { mensagem: 'Fora do horário de refeição', acao: 'Prepare-se para o próximo horário' };
        const p = previsao[refeicaoAtual];
        const r = registrosReais[refeicaoAtual];
        if (r > 0) {
          const pct = (p.pessoas > 0) ? (r / p.pessoas) * 100 : 0;
          if (pct > 110) return { mensagem: `⚠️ Demanda ${Math.round(pct - 100)}% acima`, acao: 'Prepare comida extra' };
          if (pct < 70) return { mensagem: `📉 Demanda ${Math.round(100 - pct)}% abaixo`, acao: 'Reduza o preparo' };
          return { mensagem: `✅ Demanda dentro do esperado`, acao: 'Continue' };
        }
        return { mensagem: `📊 Previsto: ${p.pessoas} pessoas`, acao: `Prepare ${p.kg}kg` };
      })(),
      horariosRefeicoes: { manha: '8h - 10h', almoco: '11h - 13h', tarde: '14h - 16h' }
    });

  } catch (error) {
    logger.error('❌ Erro no dashboard da cozinha:', error);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

// ============================================
// ANÁLISE POR TURMA COM FILTROS + META
// ============================================
router.get('/analise-turmas', authenticateToken, verificarCozinha, async (req, res) => {
  try {
    const { turma: filtroTurma, curso: filtroCurso, refeicao: filtroRefeicao } = req.query;

    // Aceita ?periodo= ou ?data= ou ?dataInicio/?dataFim ou ?todos=
    const { filtro: filtroData, infoData } = montarFiltroData(req.query);

    const filtroAluno = { role: 'aluno', ativo: true };
    if (filtroTurma && filtroTurma !== 'todas') filtroAluno.turma = filtroTurma;
    if (filtroCurso && filtroCurso !== 'todos') filtroAluno.curso = filtroCurso;

    const filtroRefeicaoMongo = { ...filtroData };
    if (filtroRefeicao && filtroRefeicao !== 'todas') {
      filtroRefeicaoMongo.tipoRefeicao = filtroRefeicao;
    }

    const refeicoesFiltradas = await Refeicao.find(filtroRefeicaoMongo);
    const alunosQueComeram = new Set(refeicoesFiltradas.map(r => r.alunoId?.toString()).filter(Boolean));

    let listaTurmas;
    if (filtroTurma && filtroTurma !== 'todas') {
      listaTurmas = [filtroTurma];
    } else {
      listaTurmas = await User.distinct('turma', {
        role: 'aluno', ativo: true, turma: { $nin: [null, ''] }
      });
    }

    if (filtroCurso && filtroCurso !== 'todos') {
      const turmasComCurso = await User.distinct('turma', {
        role: 'aluno', ativo: true, curso: filtroCurso, turma: { $nin: [null, ''] }
      });
      listaTurmas = listaTurmas.filter(t => turmasComCurso.includes(t));
    }

    const analisePorTurma = [];
    for (const turma of listaTurmas) {
      const alunosTurma = await User.find({ ...filtroAluno, turma })
        .select('_id nome perfilAlimentar curso');

      const dizemQueComem = alunosTurma.filter(a =>
        a.perfilAlimentar === 'sempre' || a.perfilAlimentar === 'as_vezes'
      ).length;

      const comeram = alunosTurma.filter(a =>
        alunosQueComeram.has(a._id.toString())
      ).length;

      const taxaTurma = dizemQueComem > 0 ? (comeram / dizemQueComem) * 100 : 0;
      const cursosTurma = Array.from(new Set(alunosTurma.map(a => a.curso).filter(Boolean)));

      analisePorTurma.push({
        turma,
        cursos: cursosTurma,
        totalAlunos: alunosTurma.length,
        dizemQueComem,
        comeramHoje: comeram,
        taxaAdesao: Math.round(taxaTurma),
        faltantes: dizemQueComem - comeram
      });
    }

    analisePorTurma.sort((a, b) => a.taxaAdesao - b.taxaAdesao);

    const totalAlunos = analisePorTurma.reduce((s, t) => s + (t.totalAlunos || 0), 0);
    const totalDizemQueComem = analisePorTurma.reduce((s, t) => s + (t.dizemQueComem || 0), 0);
    const totalComeram = analisePorTurma.reduce((s, t) => s + (t.comeramHoje || 0), 0);
    const taxaGeral = totalDizemQueComem > 0
      ? Math.round((totalComeram / totalDizemQueComem) * 100) : 0;

    res.json({
      success: true,
      infoData,
      filtrosAplicados: {
        turma: filtroTurma || 'todas',
        curso: filtroCurso || 'todos',
        periodo: req.query.periodo || null,
        data: req.query.data || null,
        dataInicio: req.query.dataInicio || null,
        dataFim: req.query.dataFim || null,
        todos: req.query.todos === 'true' || req.query.todos === '1',
        refeicao: filtroRefeicao || 'todas'
      },
      total: analisePorTurma.length,
      analisePorTurma,
      meta: {
        totalAlunosNoFiltro: totalAlunos,
        totalQueDisseramComer: totalDizemQueComem,
        totalQueComeram: totalComeram,
        taxaAdesaoGeral: taxaGeral,
        totalRegistrosNoPeriodo: refeicoesFiltradas.length
      }
    });

  } catch (error) {
    logger.error('❌ Erro em /analise-turmas:', error);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

// ============================================
// FALTANTES (aceita data única, intervalo e todos)
// ============================================
router.get('/faltantes', authenticateToken, verificarCozinha, async (req, res) => {
  try {
    const { turma } = req.query;
    const { filtro: filtroData, infoData } = montarFiltroData(req.query);

    let query = { ativo: true, perfilAlimentar: { $in: ['sempre', 'as_vezes'] } };
    if (turma) query.turma = turma;

    const usuariosQueDisseram = await User.find(query)
      .select('_id nome turma perfilAlimentar refeicoesQueParticipa');

    const refeicoes = await Refeicao.find(filtroData);
    const quemComeu = new Set(refeicoes.map(r => r.alunoId?.toString()).filter(Boolean));

    const faltantes = [];
    for (const u of usuariosQueDisseram) {
      if (!quemComeu.has(u._id.toString())) {
        faltantes.push({
          id: u._id,
          nome: u.nome,
          turma: u.turma || 'N/A',
          perfil: u.perfilAlimentar,
          refeicoesQueParticipa: u.refeicoesQueParticipa || []
        });
      }
    }

    res.json({
      success: true,
      infoData,
      turma: turma || 'Todas',
      totalQueDisseramQueComem: usuariosQueDisseram.length,
      totalQueComeram: quemComeu.size,
      totalFaltantes: faltantes.length,
      faltantes
    });

  } catch (error) {
    logger.error('❌ Erro ao listar faltantes:', error);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

// ============================================
// ANÁLISE SEMANAL
// ============================================
router.get('/analise-semanal', authenticateToken, verificarCozinha, async (req, res) => {
  try {
    const hoje = new Date();
    const inicioSemana = new Date(hoje);
    inicioSemana.setDate(hoje.getDate() - hoje.getDay());
    const fimSemana = new Date(inicioSemana);
    fimSemana.setDate(inicioSemana.getDate() + 6);

    const dataInicio = inicioSemana.toISOString().split('T')[0];
    const dataFim = fimSemana.toISOString().split('T')[0];

    const registros = await Refeicao.find({
      data: { $gte: dataInicio, $lte: dataFim }
    }).sort({ data: 1 });

    const analiseDiaria = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date(inicioSemana); d.setDate(inicioSemana.getDate() + i);
      const ds = d.toISOString().split('T')[0];
      analiseDiaria[ds] = { manha: 0, almoco: 0, tarde: 0, total: 0 };
    }

    registros.forEach(r => {
      if (analiseDiaria[r.data]) {
        analiseDiaria[r.data][r.tipoRefeicao]++;
        analiseDiaria[r.data].total++;
      }
    });

    const totais = {
      manha: registros.filter(r => r.tipoRefeicao === 'manha').length,
      almoco: registros.filter(r => r.tipoRefeicao === 'almoco').length,
      tarde: registros.filter(r => r.tipoRefeicao === 'tarde').length,
      total: registros.length
    };

    let diaPico = null, maxRef = 0;
    for (const [d, v] of Object.entries(analiseDiaria)) {
      if (v.total > maxRef) { maxRef = v.total; diaPico = d; }
    }

    res.json({
      success: true,
      semana: { inicio: dataInicio, fim: dataFim },
      analiseDiaria, totais, diaPico,
      mediaDiaria: totais.total / 7
    });

  } catch (error) {
    logger.error('❌ Erro na análise semanal:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// REGISTRO :id — GET / PUT / DELETE
// ============================================
router.get('/registro/:id', authenticateToken, verificarCozinha, async (req, res) => {
  try {
    const RefeicaoModel = mongoose.model('Refeicao');
    const registro = await RefeicaoModel.findById(req.params.id).lean();
    if (!registro) return res.status(404).json({ success: false, error: 'Registro não encontrado' });

    const aluno = await User.findById(registro.alunoId).select('matricula fotoPerfil');
    res.json({
      success: true,
      registro: {
        ...registro,
        alunoMatricula: aluno?.matricula || '',
        fotoPerfil: aluno?.fotoPerfil || null
      }
    });
  } catch (error) {
    logger.error('❌ Erro ao buscar registro:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/registro/:id', authenticateToken, verificarCozinha, async (req, res) => {
  try {
    const { tipoRefeicao, horario, observacao } = req.body;
    const RefeicaoModel = mongoose.model('Refeicao');
    const registro = await RefeicaoModel.findById(req.params.id);
    if (!registro) return res.status(404).json({ success: false, error: 'Registro não encontrado' });

    if (tipoRefeicao) registro.tipoRefeicao = tipoRefeicao;
    if (horario) registro.horario = new Date(horario);
    if (observacao !== undefined) registro.observacao = observacao;
    registro.updatedAt = new Date();
    await registro.save();

    res.json({ success: true, message: 'Registro atualizado!', registro });
  } catch (error) {
    logger.error('❌ Erro ao atualizar registro:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/registro/:id', authenticateToken, verificarCozinha, async (req, res) => {
  try {
    const RefeicaoModel = mongoose.model('Refeicao');
    const registro = await RefeicaoModel.findByIdAndDelete(req.params.id);
    if (!registro) return res.status(404).json({ success: false, error: 'Registro não encontrado' });

    res.json({ success: true, message: 'Registro excluído!' });
  } catch (error) {
    logger.error('❌ Erro ao excluir registro:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;