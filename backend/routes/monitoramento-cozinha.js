const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Refeicao = require('../models/Refeicao');
const RodizioRefeicao = require('../models/RodizioRefeicao');

// ============================================
// 🆕 HELPERS DE FUSO HORÁRIO BRASÍLIA (UTC-3)
// ============================================
function getDataHojeBR() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

function getHoraAtualBR() {
  return parseInt(new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit', hour12: false
  }).format(new Date()), 10);
}

function getDataISOdoHorarioBR(horario) {
  // 🆕 Converte qualquer Date para YYYY-MM-DD em BRT
  const d = new Date(horario);
  if (isNaN(d.getTime())) return getDataHojeBR();
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(d);
}

function getDataNDiasBR(n) {
  const agora = new Date();
  const deslocada = new Date(agora.getTime() - n * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(deslocada);
}

function getDataNDiasAtrasDateBR(n) {
  // 🆕 Retorna Date BRT
  const agora = new Date();
  const deslocada = new Date(agora.getTime() - n * 24 * 60 * 60 * 1000);
  return deslocada;
}

// ============================================
// MIDDLEWARES
// ============================================
const authenticateToken = (req, res, next) => {
  let token = req.headers.authorization?.split(' ')[1];

  if (!token && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ success: false, error: 'Token não fornecido' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ success: false, error: 'Token inválido' });
    }
    req.userId = decoded.id;
    req.userRole = decoded.role;
    req.userNome = decoded.nome;
    next();
  });
};

const verificarAdmin = (req, res, next) => {
  const allowedRoles = ['admin', 'super_admin', 'gestao_geral'];

  if (!allowedRoles.includes(req.userRole)) {
    return res.status(403).json({
      success: false,
      error: 'Acesso permitido apenas para Administradores e Gestão Geral'
    });
  }
  next();
};

// ============================================
// HELPERS DE DATA (🆕 BRT)
// ============================================
function isDataValida(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

/**
 * Constrói o filtro de data para o Mongo + metadados amigáveis.
 * Modos aceitos (em ordem de prioridade):
 *   1) ?todos=true|1          → sem filtro
 *   2) ?dataInicio + ?dataFim → intervalo
 *   3) ?data=YYYY-MM-DD       → dia único
 *   4) (nenhum)               → hoje
 * 🆕 Todos os cálculos usam BRT
 */
function montarFiltroData(query) {
  const hoje = getDataHojeBR();
  const { data, dataInicio, dataFim, todos } = query;

  if (todos === 'true' || todos === '1') {
    return {
      filtro: {},
      infoData: {
        tipo: 'todos',
        dataAtual: hoje,
        dataVisualizada: null,
        isHistorico: true,
        label: 'Todo o período'
      }
    };
  }

  if (dataInicio || dataFim) {
    const ini = isDataValida(dataInicio) ? dataInicio : '1900-01-01';
    const fim = isDataValida(dataFim) ? dataFim : hoje;

    const labelIni = new Date(ini + 'T12:00:00.000-03:00').toLocaleDateString('pt-BR');
    const labelFim = new Date(fim + 'T12:00:00.000-03:00').toLocaleDateString('pt-BR');

    return {
      filtro: { data: { $gte: ini, $lte: fim } },
      infoData: {
        tipo: 'intervalo',
        dataAtual: hoje,
        dataInicio: ini,
        dataFim: fim,
        isHistorico: true,
        label: `${labelIni} a ${labelFim}`
      }
    };
  }

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
        dataAtual: hoje,
        dataVisualizada: data,
        isHistorico: data !== hoje,
        label: new Date(data + 'T12:00:00.000-03:00').toLocaleDateString('pt-BR')
      }
    };
  }

  return {
    filtro: { data: hoje },
    infoData: {
      tipo: 'hoje',
      dataAtual: hoje,
      dataVisualizada: hoje,
      isHistorico: false,
      label: 'Hoje'
    }
  };
}

// ============================================
// 🏥 HEALTH CHECK
// ============================================
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'online',
    service: 'Cozinha Monitoramento',
    versao: '2.0-fuso-br',
    _debug: {
      hojeBR: getDataHojeBR(),
      horaBR: getHoraAtualBR(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    },
    timestamp: new Date().toISOString()
  });
});

// ============================================
// 📊 DASHBOARD — data única / intervalo / todos
// ============================================
router.get('/dashboard', authenticateToken, verificarAdmin, async (req, res) => {
  try {
    const { filtro: filtroData, infoData } = montarFiltroData(req.query);

    // 🆕 Hora e data em BRT
    const horaAtual = getHoraAtualBR();
    const hoje = getDataHojeBR();

    // ========== 1. DADOS DA COZINHA ==========

    const totalPessoas = await User.countDocuments({ ativo: true });

    const totalPorTipo = {
      alunos: await User.countDocuments({ role: 'aluno', ativo: true }),
      professores: await User.countDocuments({ role: 'professor', ativo: true }),
      servidores: await User.countDocuments({
        role: {
          $in: ['admin', 'super_admin', 'setor_pedagogico', 'coordenacao_patio', 'cozinha', 'gestao_geral']
        },
        ativo: true
      })
    };

    const refeicoesFiltradas = await Refeicao.find(filtroData);

    const contagemRefeicoes = {
      manha: refeicoesFiltradas.filter(r => r.tipoRefeicao === 'manha').length,
      almoco: refeicoesFiltradas.filter(r => r.tipoRefeicao === 'almoco').length,
      tarde: refeicoesFiltradas.filter(r => r.tipoRefeicao === 'tarde').length,
      total: refeicoesFiltradas.length,
      pessoasUnicas: new Set(refeicoesFiltradas.map(r => r.alunoId?.toString()).filter(Boolean)).size
    };

    const perfisAlimentares = {
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
    perfisAlimentares.que_comem = perfisAlimentares.sempre + perfisAlimentares.as_vezes;

    const pesoPorRefeicao = 0.3;
    const previsaoComida = {
      manha: Math.ceil(contagemRefeicoes.manha * pesoPorRefeicao * 1.1),
      almoco: Math.ceil(contagemRefeicoes.almoco * pesoPorRefeicao * 1.15),
      tarde: Math.ceil(contagemRefeicoes.tarde * pesoPorRefeicao * 1.1),
      total: Math.ceil(contagemRefeicoes.total * pesoPorRefeicao * 1.1),
      unidade: 'kg'
    };

    const refeicoesPorTurma = {};
    refeicoesFiltradas.forEach(r => {
      const turma = r.alunoTurma || 'N/A';
      if (!refeicoesPorTurma[turma]) {
        refeicoesPorTurma[turma] = { manha: 0, almoco: 0, tarde: 0, total: 0, alunos: new Set() };
      }
      refeicoesPorTurma[turma][r.tipoRefeicao]++;
      refeicoesPorTurma[turma].total++;
      if (r.alunoId) refeicoesPorTurma[turma].alunos.add(r.alunoId.toString());
    });

    const turmasArray = Object.entries(refeicoesPorTurma).map(([nome, dados]) => ({
      turma: nome,
      manha: dados.manha,
      almoco: dados.almoco,
      tarde: dados.tarde,
      total: dados.total,
      alunosQueComeram: dados.alunos.size
    }));

    const ultimosRegistros = await Refeicao.find(filtroData)
      .sort({ horario: -1, _id: -1 })
      .limit(50);

    // ========== 2. GESTÃO GERAL (RODÍZIO) ==========

    const rodizios = await RodizioRefeicao.find({ ativo: true }).sort({ turma: 1 });
    const todasTurmas = await User.distinct('turma', {
      role: 'aluno',
      ativo: true,
      turma: { $nin: [null, ''] }
    });

    const turmasComRodizio = rodizios.map(r => r.turma);
    const turmasSemRodizio = todasTurmas.filter(t => !turmasComRodizio.includes(t));

    // 🆕 Dia da semana e dia do mês em BRT
    const agoraBR = new Date();
    const dataBRStr = getDataHojeBR();
    const dataBRObj = new Date(dataBRStr + 'T12:00:00.000-03:00');
    const diaSemana = dataBRObj.getUTCDay();
    const diaMes = parseInt(dataBRStr.substring(8, 10), 10);
    const semanaMes = Math.ceil(diaMes / 7);
    const diasNomes = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

    const statusRodizioHoje = rodizios.map(rodizio => {
      let podeHoje = false;
      let motivo = '';

      if (rodizio.tipoRodizio === 'semanal' || rodizio.tipoRodizio === 'ambos') {
        if ((rodizio.diasSemana || []).includes(diaSemana)) {
          podeHoje = true;
          motivo = `Dia permitido (${diasNomes[diaSemana]})`;
        }
      }

      if (!podeHoje && (rodizio.tipoRodizio === 'mensal' || rodizio.tipoRodizio === 'ambos')) {
        if ((rodizio.diasMes || []).includes(diaMes)) {
          podeHoje = true;
          motivo = `Dia ${diaMes} do mês permitido`;
        } else if ((rodizio.semanasMes || []).includes(semanaMes)) {
          podeHoje = true;
          motivo = `${semanaMes}ª semana do mês permitida`;
        }
      }

      return {
        turma: rodizio.turma,
        tipo: rodizio.tipoRodizio,
        diasSemana: (rodizio.diasSemana || []).map(d => diasNomes[d]),
        podeHoje,
        motivo: motivo || 'Fora do rodízio hoje',
        horario: `${rodizio.horarioInicio} - ${rodizio.horarioFim}`
      };
    });

    // ========== 3. ALERTAS ==========

    const alertas = [];

    const percentualAdesao = totalPessoas > 0
      ? (contagemRefeicoes.pessoasUnicas / totalPessoas) * 100
      : 0;

    if (percentualAdesao < 20 && contagemRefeicoes.total > 0) {
      alertas.push({
        tipo: 'warning',
        titulo: '⚠️ Baixa adesão às refeições',
        mensagem: `Apenas ${percentualAdesao.toFixed(1)}% das pessoas comeram no período (${infoData.label}).`,
        sugestao: 'Verificar qualidade da comida ou divulgação'
      });
    }

    if (contagemRefeicoes.almoco > 100) {
      alertas.push({
        tipo: 'info',
        titulo: '📈 Alta demanda no almoço',
        mensagem: `${contagemRefeicoes.almoco} pessoas almoçaram.`,
        sugestao: 'Preparar comida extra se necessário'
      });
    }

    if (turmasSemRodizio.length > 0) {
      alertas.push({
        tipo: 'warning',
        titulo: '📋 Turmas sem rodízio configurado',
        mensagem: `${turmasSemRodizio.length} turmas não possuem rodízio de almoço.`,
        sugestao: 'Acessar Gestão Geral para configurar os rodízios'
      });
    }

    if (infoData.isHistorico) {
      alertas.push({
        tipo: 'info',
        titulo: '📅 Visualizando dados históricos',
        mensagem: `Você está visualizando dados de ${infoData.label}.`,
        sugestao: 'Use os filtros para mudar o período ou voltar para hoje'
      });
    }

    // ========== 4. RESPOSTA ==========

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      horaAtual,
      infoData,
      _debug: {
        hojeBR: hoje,
        horaBR: horaAtual,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      },
      cozinha: {
        totalPessoas,
        totalPorTipo,
        contagemRefeicoes,
        perfisAlimentares,
        previsaoComida,
        refeicoesPorTurma: turmasArray,
        ultimosRegistros: ultimosRegistros.map(r => ({
          id: r._id,
          alunoNome: r.alunoNome,
          alunoTurma: r.alunoTurma,
          tipoRefeicao: r.tipoRefeicao,
          horario: r.horario,
          validadoPor: r.validadoPorNome,
          data: r.data
        }))
      },
      gestaoGeral: {
        totalRodizios: rodizios.length,
        turmasComRodizio: turmasComRodizio.length,
        turmasSemRodizio: turmasSemRodizio.length,
        turmasSemRodizioLista: turmasSemRodizio,
        rodizios: statusRodizioHoje,
        hoje: {
          data: hoje,
          diaSemana: diasNomes[diaSemana],
          diaMes,
          semanaMes
        }
      },
      alertas
    });

  } catch (error) {
    console.error('Erro no dashboard:', error);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

// ============================================
// 🔍 REGISTROS POR DATA / INTERVALO
// ============================================
router.get('/registros-por-data', authenticateToken, verificarAdmin, async (req, res) => {
  try {
    const { data, dataInicio, dataFim, todos, turma, tipo, limite = 100 } = req.query;

    const hoje = getDataHojeBR();

    let filtroData;
    if (todos === 'true' || todos === '1') {
      filtroData = {};
    } else if (dataInicio || dataFim) {
      const ini = isDataValida(dataInicio) ? dataInicio : '1900-01-01';
      const fim = isDataValida(dataFim) ? dataFim : hoje;
      filtroData = { data: { $gte: ini, $lte: fim } };
    } else if (data) {
      if (!isDataValida(data)) {
        return res.status(400).json({ success: false, error: 'Formato de data inválido. Use YYYY-MM-DD' });
      }
      filtroData = { data };
    } else {
      return res.status(400).json({
        success: false,
        error: 'Informe "data", "dataInicio"/"dataFim" ou "todos=true"'
      });
    }

    const query = { ...filtroData };
    if (turma && turma !== 'todas') query.alunoTurma = turma;
    if (tipo && tipo !== 'todas') query.tipoRefeicao = tipo;

    const registros = await Refeicao.find(query)
      .sort({ horario: -1, _id: -1 })
      .limit(parseInt(limite));

    res.json({
      success: true,
      filtro: filtroData,
      total: registros.length,
      registros: registros.map(r => ({
        id: r._id,
        alunoNome: r.alunoNome,
        alunoTurma: r.alunoTurma,
        tipoRefeicao: r.tipoRefeicao,
        horario: r.horario,
        data: r.data
      }))
    });
  } catch (error) {
    console.error('Erro ao buscar registros por data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 📝 CRUD DE REGISTROS
// ============================================

router.get('/registro/:id', authenticateToken, verificarAdmin, async (req, res) => {
  try {
    const registro = await Refeicao.findById(req.params.id);
    if (!registro) {
      return res.status(404).json({ success: false, error: 'Registro não encontrado' });
    }
    res.json({ success: true, registro });
  } catch (error) {
    console.error('Erro ao buscar registro:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/registro/:id', authenticateToken, verificarAdmin, async (req, res) => {
  try {
    const { tipoRefeicao, horario, observacao } = req.body;

    const registro = await Refeicao.findById(req.params.id);
    if (!registro) {
      return res.status(404).json({ success: false, error: 'Registro não encontrado' });
    }

    if (tipoRefeicao) registro.tipoRefeicao = tipoRefeicao;
    if (horario) {
      registro.horario = new Date(horario);
      // 🆕 Recalcula a data em BRT
      registro.data = getDataISOdoHorarioBR(horario);
    }
    if (observacao !== undefined) registro.observacao = observacao;

    registro.updatedAt = new Date();
    registro.validadoPorNome = req.userNome || 'Administrador';

    await registro.save();

    res.json({ success: true, registro });
  } catch (error) {
    console.error('Erro ao atualizar registro:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/registro/:id', authenticateToken, verificarAdmin, async (req, res) => {
  try {
    const registro = await Refeicao.findById(req.params.id);
    if (!registro) {
      return res.status(404).json({ success: false, error: 'Registro não encontrado' });
    }

    await registro.deleteOne();

    res.json({ success: true, message: 'Registro excluído com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir registro:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 🗑️ LIMPEZA DE REGISTROS ANTIGOS (🆕 data em BRT)
// ============================================
router.post('/limpar-registros-antigos', authenticateToken, verificarAdmin, async (req, res) => {
  try {
    const { meses = 1 } = req.body;

    // 🆕 Calcula o limite em BRT
    const hojeBR = getDataHojeBR();
    const hojeDate = new Date(hojeBR + 'T12:00:00.000-03:00');

    const dataLimiteDate = new Date(hojeDate);
    dataLimiteDate.setMonth(dataLimiteDate.getMonth() - meses);

    // 🆕 Converte de volta para YYYY-MM-DD em BRT
    const dataLimiteStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(dataLimiteDate);

    const resultado = await Refeicao.deleteMany({
      data: { $lt: dataLimiteStr }
    });

    res.json({
      success: true,
      deletados: resultado.deletedCount,
      mensagem: `${resultado.deletedCount} registros removidos com sucesso (anteriores a ${dataLimiteStr})`
    });
  } catch (error) {
    console.error('Erro na limpeza:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 📊 ESTATÍSTICAS GERAIS (🆕 BRT)
// ============================================
router.get('/estatisticas-registros', authenticateToken, verificarAdmin, async (req, res) => {
  try {
    const total = await Refeicao.countDocuments();

    // 🆕 Data 1 mês atrás em BRT
    const umMesAtrasDate = getDataNDiasAtrasDateBR(30);
    const umMesAtrasStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(umMesAtrasDate);

    const mesAtual = await Refeicao.countDocuments({ data: { $gte: umMesAtrasStr } });
    const mesAnterior = await Refeicao.countDocuments({ data: { $lt: umMesAtrasStr } });

    const ultimoRegistro = await Refeicao.findOne().sort({ data: -1, _id: -1 });

    res.json({
      success: true,
      estatisticas: {
        total,
        ultimoMes: mesAtual,
        anteriores: mesAnterior,
        ultimaData: ultimoRegistro?.data || null
      }
    });
  } catch (error) {
    console.error('Erro nas estatísticas:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 📡 EVENTOS SSE (🆕 data em BRT)
// ============================================
router.get('/eventos', authenticateToken, verificarAdmin, async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  let ultimoTotal = -1;

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  sendEvent({ type: 'heartbeat', timestamp: new Date().toISOString() });

  const heartbeat = setInterval(() => {
    sendEvent({ type: 'heartbeat', timestamp: new Date().toISOString() });
  }, 30000);

  const checkInterval = setInterval(async () => {
    try {
      // 🆕 Data em BRT
      const hoje = getDataHojeBR();
      const novoTotal = await Refeicao.countDocuments({ data: hoje });

      if (novoTotal !== ultimoTotal) {
        ultimoTotal = novoTotal;

        const almocoTotal = await Refeicao.countDocuments({
          data: hoje,
          tipoRefeicao: 'almoco'
        });

        sendEvent({
          type: 'nova-refeicao',
          total: novoTotal,
          almoco: almocoTotal,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Erro no intervalo SSE:', error);
    }
  }, 5000);

  req.on('close', () => {
    clearInterval(checkInterval);
    clearInterval(heartbeat);
  });
});

module.exports = router;