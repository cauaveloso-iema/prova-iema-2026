// ============================================================================
// COZINHA - EducaPleno
// ============================================================================
// Rotas incluídas:
//   - GET    /api/cozinha/health
//   - GET    /api/cozinha/dashboard
//   - GET    /api/cozinha/turmas-cursos
//   - GET    /api/cozinha/analise-turmas
//   - GET    /api/cozinha/faltantes
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
function resolverPeriodo(periodo) {
  const hoje = new Date();
  switch (periodo) {
    case 'hoje':   return { dataUnica: hoje.toISOString().split('T')[0] };
    case 'ontem': {
      const d = new Date(hoje); d.setDate(d.getDate() - 1);
      return { dataUnica: d.toISOString().split('T')[0] };
    }
    case 'semana': {
      const d = new Date(hoje); d.setDate(d.getDate() - 7);
      return { dataInicio: d.toISOString().split('T')[0] };
    }
    case 'mes': {
      const d = new Date(hoje); d.setMonth(d.getMonth() - 1);
      return { dataInicio: d.toISOString().split('T')[0] };
    }
    case 'todos': default: return null;
  }
}

function filtroDataMongo(periodo) {
  const p = resolverPeriodo(periodo);
  if (!p) return {};
  const hoje = new Date().toISOString().split('T')[0];
  if (p.dataUnica) return { data: p.dataUnica };
  if (p.dataInicio) return { data: { $gte: p.dataInicio, $lte: hoje } };
  return {};
}

// ============================================
// 🏥 HEALTH
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
// 🆕 TURMAS + CURSOS
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
// 📊 DASHBOARD
// ============================================
router.get('/dashboard', authenticateToken, verificarCozinha, async (req, res) => {
  try {
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

    const refeicoesHoje = await Refeicao.find({ data: hoje });
    const registrosReais = {
      manha: refeicoesHoje.filter(r => r.tipoRefeicao === 'manha').length,
      almoco: refeicoesHoje.filter(r => r.tipoRefeicao === 'almoco').length,
      tarde: refeicoesHoje.filter(r => r.tipoRefeicao === 'tarde').length,
      total: refeicoesHoje.length,
      pessoasUnicas: new Set(refeicoesHoje.map(r => r.alunoId.toString())).size
    };

    const usuariosQueDisseram = await User.find({
      ativo: true, perfilAlimentar: { $in: ['sempre', 'as_vezes'] }
    }).select('_id nome perfilAlimentar');

    const usuariosQueComeram = new Set(refeicoesHoje.map(r => r.alunoId.toString()));

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

      const comeramHoje = alunosTurma.filter(a =>
        usuariosQueComeram.has(a._id.toString())
      ).length;

      const taxaTurma = dizemQueComem > 0 ? (comeramHoje / dizemQueComem) * 100 : 0;

      const cursosTurma = Array.from(new Set(
        alunosTurma.map(a => a.curso).filter(Boolean)
      ));

      analisePorTurma.push({
        turma,
        cursos: cursosTurma,
        totalAlunos: alunosTurma.length,
        dizemQueComem,
        comeramHoje,
        taxaAdesao: Math.round(taxaTurma),
        faltantes: dizemQueComem - comeramHoje
      });
    }
    analisePorTurma.sort((a, b) => a.taxaAdesao - b.taxaAdesao);

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
    if (taxaAdesao < 50) {
      insights.push({
        tipo: 'warning',
        titulo: '⚠️ Baixa adesão às refeições',
        mensagem: `Apenas ${Math.round(taxaAdesao)}% das pessoas que disseram que comem realmente vieram.`,
        acao: 'Conversar com coordenação de pátio'
      });
    } else if (taxaAdesao > 80) {
      insights.push({
        tipo: 'success',
        titulo: '✅ Alta adesão às refeições',
        mensagem: `${Math.round(taxaAdesao)}% das pessoas que disseram que comem realmente vieram.`,
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
        titulo: '👤 Pessoas que não vieram hoje',
        mensagem: `${faltantesLista.length} pessoas que disseram que comeriam não vieram hoje.`,
        acao: 'Verificar se estão presentes na escola'
      });
    }

    const tendencia = {
      manha: mediaHistorica.manha > previsao.manha.pessoas ? 'diminuindo' : 'crescendo',
      almoco: mediaHistorica.almoco > previsao.almoco.pessoas ? 'diminuindo' : 'crescendo',
      tarde: mediaHistorica.tarde > previsao.tarde.pessoas ? 'diminuindo' : 'crescendo'
    };

    res.json({
      success: true, data: hoje, horaAtual, refeicaoAtual,
      perfis, registrosReais,
      analiseAdesao: {
        totalQueDisseramQueComem: usuariosQueDisseram.length,
        compareceram: aderentes, faltaram: faltantes,
        taxaAdesao: Math.round(taxaAdesao),
        faltantesLista: faltantesLista.slice(0, 10)
      },
      analisePorTurma, previsao, mediaHistorica, tendencia, insights,
      sugestaoAtual: (() => {
        if (!refeicaoAtual) return { mensagem: 'Fora do horário de refeição', acao: 'Prepare-se para o próximo horário' };
        const p = previsao[refeicaoAtual];
        const r = registrosReais[refeicaoAtual];
        if (r > 0) {
          const pct = (r / p.pessoas) * 100;
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
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 🆕 ANÁLISE POR TURMA COM FILTROS + META
// ============================================
router.get('/analise-turmas', authenticateToken, verificarCozinha, async (req, res) => {
  try {
    const {
      turma: filtroTurma,
      curso: filtroCurso,
      periodo = 'hoje',
      refeicao: filtroRefeicao
    } = req.query;

    const filtroAluno = { role: 'aluno', ativo: true };
    if (filtroTurma && filtroTurma !== 'todas') filtroAluno.turma = filtroTurma;
    if (filtroCurso && filtroCurso !== 'todos') filtroAluno.curso = filtroCurso;

    const filtroRefeicaoMongo = {};
    if (filtroRefeicao && filtroRefeicao !== 'todas') {
      filtroRefeicaoMongo.tipoRefeicao = filtroRefeicao;
    }
    Object.assign(filtroRefeicaoMongo, filtroDataMongo(periodo));

    const refeicoesFiltradas = await Refeicao.find(filtroRefeicaoMongo);
    const alunosQueComeram = new Set(refeicoesFiltradas.map(r => r.alunoId.toString()));

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

      const comeramHoje = alunosTurma.filter(a =>
        alunosQueComeram.has(a._id.toString())
      ).length;

      const taxaTurma = dizemQueComem > 0 ? (comeramHoje / dizemQueComem) * 100 : 0;

      const cursosTurma = Array.from(new Set(
        alunosTurma.map(a => a.curso).filter(Boolean)
      ));

      analisePorTurma.push({
        turma,
        cursos: cursosTurma,
        totalAlunos: alunosTurma.length,
        dizemQueComem,
        comeramHoje,
        taxaAdesao: Math.round(taxaTurma),
        faltantes: dizemQueComem - comeramHoje
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
      filtrosAplicados: {
        turma: filtroTurma || 'todas',
        curso: filtroCurso || 'todos',
        periodo,
        refeicao: filtroRefeicao || 'todas'
      },
      total: analisePorTurma.length,
      analisePorTurma,
      meta: {
        totalAlunosNoFiltro: totalAlunos,
        totalQueDisseramComer: totalDizemQueComem,
        totalQueComeram: totalComeram,
        taxaAdesaoGeral: taxaGeral
      }
    });

  } catch (error) {
    logger.error('❌ Erro em /analise-turmas:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 📊 FALTANTES
// ============================================
router.get('/faltantes', authenticateToken, verificarCozinha, async (req, res) => {
  try {
    const { data, turma } = req.query;
    const dataConsulta = data || new Date().toISOString().split('T')[0];

    let query = { ativo: true, perfilAlimentar: { $in: ['sempre', 'as_vezes'] } };
    if (turma) query.turma = turma;

    const usuariosQueDisseram = await User.find(query)
      .select('_id nome turma perfilAlimentar refeicoesQueParticipa');

    const refeicoes = await Refeicao.find({ data: dataConsulta });
    const quemComeu = new Set(refeicoes.map(r => r.alunoId.toString()));

    const faltantes = [];
    for (const u of usuariosQueDisseram) {
      if (!quemComeu.has(u._id.toString())) {
        faltantes.push({
          id: u._id, nome: u.nome, turma: u.turma || 'N/A',
          perfil: u.perfilAlimentar,
          refeicoesQueParticipa: u.refeicoesQueParticipa || []
        });
      }
    }

    res.json({
      success: true,
      data: dataConsulta,
      turma: turma || 'Todas',
      totalQueDisseramQueComem: usuariosQueDisseram.length,
      totalQueComeram: quemComeu.size,
      totalFaltantes: faltantes.length,
      faltantes
    });

  } catch (error) {
    logger.error('❌ Erro ao listar faltantes:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 📊 ANÁLISE SEMANAL
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
// 📋 REGISTRO :id — GET / PUT / DELETE
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