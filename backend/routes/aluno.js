// ============================================================================
// ALUNO - EducaPleno
// ============================================================================
// Descrição: Todas as rotas relacionadas ao aluno.
//
// Rotas incluídas:
//   - GET /api/aluno/health
//   - GET /api/aluno/provas/pendentes
//   - GET /api/aluno/provas
//   - GET /api/aluno/provas/:provaId/correcao-detalhada
//   - GET /api/aluno/provas/:provaId/cancelamento-detailed
//   - GET /api/aluno/provas/:provaId/detalhes-cancelamento
//   - GET /api/aluno/provas/:provaId/resultado
//   - GET /api/aluno/resultados
//   - GET /api/aluno/curso-completo
//   - GET /api/aluno/meu-eixo-turmas
//   - GET /api/aluno/qrcode/:alunoId
//
// Autor: Equipe de Desenvolvimento
// ============================================================================

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const QRCode = require('qrcode');

// Logger
let logger;
try {
  logger = require('../utils/logger');
} catch (err) {
  logger = console;
}

// ============================================================================
// IMPORTAÇÃO DE MODELOS
// ============================================================================

const User = require('../models/User');

let Prova = null;
try {
  Prova = require('../models/Prova');
} catch (err) {
  console.warn('[aluno] Model Prova não disponível:', err.message);
}

let Turma = null;
try {
  Turma = require('../models/Turma');
} catch (err) {
  console.warn('[aluno] Model Turma não disponível:', err.message);
}

let Resultado = null;
try {
  Resultado = mongoose.model('Resultado');
} catch (err) {
  console.warn('[aluno] Model Resultado não disponível:', err.message);
}

let ProvaRealizada = null;
try {
  ProvaRealizada = mongoose.model('ProvaRealizada');
} catch (err) {
  console.warn('[aluno] Model ProvaRealizada não disponível:', err.message);
}

let Eixo = null;
try {
  Eixo = require('../models/Eixo');
} catch (err) {
  console.warn('[aluno] Model Eixo não disponível:', err.message);
}

let Curso = null;
try {
  Curso = require('../models/Cursos');
} catch (err) {
  console.warn('[aluno] Model Curso não disponível:', err.message);
}

let Config = null;
try {
  Config = mongoose.model('Config');
} catch (err) {
  console.warn('[aluno] Model Config não disponível:', err.message);
}

let Notificacao = null;
try {
  Notificacao = mongoose.model('Notificacao');
} catch (err) {
  console.warn('[aluno] Model Notificacao não disponível:', err.message);
}

// ============================================
// CONSTANTES
// ============================================
const PERFIS_QRCODE_AUTORIZADOS = [
  'admin',
  'super_admin',
  'professor',
  'setor_pedagogico',
  'supervisao',
  'psicologia',
  'assistente-social',
  'enfermaria',
  'coordenacao_patio',
  'biblioteca',
  'protagonismo',
  'secretaria',
  'gestao_geral',
  'cozinha'
];

// Eixos comuns da BNCC (sempre fixos no sistema)
const EIXOS_COMUNS_BNCC = [
  {
    nome: 'natureza',
    label: '🔬 Natureza e Matemática',
    cor: '#10b981',
    icone: 'fa-flask',
    fixo: true
  },
  {
    nome: 'humanas',
    label: '🏛️ Humanas',
    cor: '#8b5cf6',
    icone: 'fa-landmark',
    fixo: true
  },
  {
    nome: 'linguagens',
    label: '🎭 Linguagens',
    cor: '#f59e0b',
    icone: 'fa-language',
    fixo: true
  }
];

// ============================================
// MIDDLEWARES
// ============================================

const authenticateTokenLocal = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, error: 'Acesso negado. Token não fornecido.' });
  }

  jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
    if (err) {
      return res.status(403).json({ success: false, error: 'Token inválido ou expirado.' });
    }

    if (decoded.temp === true && decoded.purpose === '2fa') {
      req.userId = decoded.id;
      req.userRole = decoded.role;
      req.userNome = decoded.nome;
      req.tokenTemp = true;
      return next();
    }

    try {
      const user = await User.findById(decoded.id).select('tokenVersion');
      if (!user) {
        return res.status(401).json({ success: false, error: 'Usuário não encontrado.' });
      }

      if ((user.tokenVersion || 0) !== (decoded.tokenVersion || 0)) {
        return res.status(401).json({
          success: false,
          error: '🔐 Sua sessão foi encerrada pelo administrador. Faça login novamente.',
          motivo: 'reset_global',
          precisaLogin: true
        });
      }
    } catch (dbError) {
      logger.error('Erro ao verificar tokenVersion:', dbError);
    }

    req.userId = decoded.id;
    req.userRole = decoded.role;
    req.userNome = decoded.nome;
    req.userTwoFactorEnabled = decoded.twoFactorEnabled || false;
    req.tokenVersion = decoded.tokenVersion;
    req.tokenTemp = false;

    next();
  });
};

const verificarAluno = (req, res, next) => {
  if (req.userRole !== 'aluno') {
    return res.status(403).json({
      success: false,
      error: 'Apenas alunos podem acessar esta rota'
    });
  }
  next();
};

// ============================================================================
// HEALTH CHECK
// ============================================================================
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'online',
    service: 'Aluno',
    models: {
      Prova: !!Prova,
      Turma: !!Turma,
      Resultado: !!Resultado,
      ProvaRealizada: !!ProvaRealizada,
      Eixo: !!Eixo,
      Curso: !!Curso,
      Config: !!Config,
      Notificacao: !!Notificacao
    }
  });
});

// ============================================================================
// GET /api/aluno/provas/pendentes
// ============================================================================
router.get('/provas/pendentes', authenticateTokenLocal, verificarAluno, async (req, res) => {
  try {
    const alunoId = req.userId;

    const aluno = await User.findById(alunoId).select(
      'precisaAcessibilidade condicaoAcessibilidade role nome email'
    );

    if (!aluno) {
      return res.status(404).json({ success: false, error: 'Aluno não encontrado' });
    }

    const precisaAcessibilidade = aluno.precisaAcessibilidade === true;

    const turmas = await Turma.find({ alunos: alunoId });
    const turmaIds = turmas.map(t => t._id);

    if (turmaIds.length === 0) {
      return res.json({
        success: true,
        provas: [],
        count: 0,
        mensagem: 'Você não está matriculado em nenhuma turma'
      });
    }

    const provas = await Prova.find({
      turmaId: { $in: turmaIds },
      status: 'ativa',
      publicada: true,
      enviadaParaAlunos: true
    })
      .populate('turmaId', 'nome disciplina ativa')
      .populate('userId', 'nome')
      .select(
        '+tipoProva +adaptada +alternativas +titulo +conteudo +duracaoMinutos ' +
        '+dataLimite +horarioInicio +horarioTermino +quantidadeQuestoes ' +
        '+dificuldade +codigo +enviadaParaAlunos'
      )
      .lean();

    const provasPendentes = [];
    const hoje = new Date();

    for (const prova of provas) {
      const turmaAtiva = prova.turmaId ? prova.turmaId.ativa : true;
      if (!turmaAtiva) continue;

      const isAdaptada =
        prova.tipoProva === 'adaptada' ||
        prova.adaptada === true ||
        prova.adaptada === 'true' ||
        (prova.tipoProva && prova.tipoProva.toLowerCase() === 'adaptada') ||
        prova.alternativas === 3 ||
        false;

      if (isAdaptada && !precisaAcessibilidade) continue;
      if (!isAdaptada && precisaAcessibilidade) continue;

      const provaRealizada = await ProvaRealizada.findOne({
        provaId: prova._id,
        alunoId: alunoId
      });

      const resultado = await Resultado.findOne({
        provaId: prova._id,
        userId: alunoId
      });

      if (!provaRealizada && !resultado) {
        let disponivel = true;

        if (prova.dataLimite) {
          const dataLimite = new Date(prova.dataLimite);
          const dataLimiteFimDia = new Date(dataLimite);
          dataLimiteFimDia.setHours(23, 59, 59, 999);
          disponivel = hoje <= dataLimiteFimDia;
        }

        if (disponivel) {
          let diasRestantes = null;
          if (prova.dataLimite) {
            const dataLimite = new Date(prova.dataLimite);
            const dataLimiteFimDia = new Date(dataLimite);
            dataLimiteFimDia.setHours(23, 59, 59, 999);
            const diffMs = dataLimiteFimDia - hoje;
            diasRestantes = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
            if (diasRestantes < 0) diasRestantes = 0;
          }

          provasPendentes.push({
            _id: prova._id,
            id: prova._id,
            titulo: prova.titulo,
            periodo: prova.periodo || '1',
            eixo: prova.eixo,
            disciplina: prova.disciplina,
            conteudo: prova.conteudo,
            duracao: prova.duracao,
            duracaoMinutos: prova.duracaoMinutos,
            dataLimite: prova.dataLimite,
            horarioInicio: prova.horarioInicio,
            horarioTermino: prova.horarioTermino,
            quantidadeQuestoes: prova.quantidadeQuestoes,
            dificuldade: prova.dificuldade,
            turma: prova.turmaId ? {
              id: prova.turmaId._id,
              nome: prova.turmaId.nome,
              disciplina: prova.turmaId.disciplina,
              ativa: prova.turmaId.ativa
            } : null,
            professor: prova.userId ? prova.userId.nome : 'Professor',
            codigo: prova.codigo,
            adaptada: isAdaptada,
            tipoProva: isAdaptada ? 'adaptada' : (prova.tipoProva || 'simples'),
            alternativas: isAdaptada ? 3 : (prova.alternativas || 5),
            diasRestantes: diasRestantes,
            expiraHoje: diasRestantes === 0,
            turmaAtiva: turmaAtiva,
            enviadaParaAlunos: prova.enviadaParaAlunos
          });
        }
      }
    }

    res.json({
      success: true,
      provas: provasPendentes,
      count: provasPendentes.length,
      aluno: {
        id: aluno._id,
        nome: aluno.nome,
        precisaAcessibilidade: precisaAcessibilidade,
        condicaoAcessibilidade: aluno.condicaoAcessibilidade
      },
      mensagem: `Encontradas ${provasPendentes.length} provas pendentes`
    });

  } catch (error) {
    logger.error('Erro ao listar provas pendentes:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao listar provas pendentes: ' + error.message
    });
  }
});

// ============================================================================
// GET /api/aluno/provas
// ============================================================================
router.get('/provas', authenticateTokenLocal, verificarAluno, async (req, res) => {
  try {
    const alunoId = req.userId;

    const turmas = await Turma.find({ alunos: alunoId });
    const turmaIds = turmas.map(t => t._id);

    const provas = await Prova.find({
      turmaId: { $in: turmaIds },
      status: 'ativa'
    })
      .populate('turmaId', 'nome disciplina')
      .populate('userId', 'nome')
      .sort({ createdAt: -1 });

    if (provas.length === 0) {
      return res.json({
        success: true,
        provas: [],
        mensagem: 'Você não está em nenhuma turma com provas ativas'
      });
    }

    const provasComStatus = [];
    const provasProcessadas = new Set();

    for (const prova of provas) {
      const provaRealizada = await ProvaRealizada.findOne({
        provaId: prova._id,
        alunoId: alunoId
      }).lean();

      let resultado = await Resultado.findOne({
        provaId: prova._id,
        userId: alunoId
      }).lean();

      const chaveProva = prova._id.toString();
      if (provasProcessadas.has(chaveProva)) continue;
      provasProcessadas.add(chaveProva);

      let provaCancelada = false;
      let motivoCancelamento = null;
      let flagViolacao = false;
      let estatisticasCancelamento = null;
      let nota = null;
      let tempoGasto = 0;
      let dataRealizacao = null;
      let statusExibicao = 'aguardando_correcao';
      let statusCorrecao = 'pendente';
      let notaLiberada = false;

      if (provaRealizada) {
        provaCancelada = provaRealizada.cancelada || provaRealizada.status === 'cancelada';
        motivoCancelamento = provaRealizada.motivoCancelamento;
        flagViolacao = provaRealizada.flagViolacao || false;
        estatisticasCancelamento = provaRealizada.estatisticasCancelamento;
        nota = provaRealizada.nota;
        tempoGasto = provaRealizada.tempoGasto || 0;
        dataRealizacao = provaRealizada.dataRealizacao;
        notaLiberada = provaRealizada.notaLiberada === true;
      }

      if (resultado) {
        if (!motivoCancelamento) motivoCancelamento = resultado.motivoCancelamento;
        if (!flagViolacao) flagViolacao = resultado.flagViolacao || false;
        if (!estatisticasCancelamento) estatisticasCancelamento = resultado.estatisticasCancelamento;
        if (nota === null || nota === undefined) nota = resultado.nota;
        if (!tempoGasto) tempoGasto = resultado.tempoGasto || 0;
        if (!dataRealizacao) dataRealizacao = resultado.createdAt;

        if (!provaCancelada) {
          provaCancelada = resultado.cancelada || resultado.status === 'cancelada';
        }

        if (resultado.notaLiberada === true) notaLiberada = true;
      }

      if (provaCancelada) {
        statusExibicao = 'cancelada';

        if (flagViolacao ||
          (motivoCancelamento &&
            (motivoCancelamento.toLowerCase().includes('violação') ||
              motivoCancelamento.toLowerCase().includes('violacao') ||
              motivoCancelamento.toLowerCase().includes('multiplas') ||
              motivoCancelamento.toLowerCase().includes('múltiplas')))) {
          statusExibicao = 'cancelada_violacao';
        } else if (motivoCancelamento &&
          (motivoCancelamento.toLowerCase().includes('prazo') ||
            motivoCancelamento.toLowerCase().includes('expirado') ||
            motivoCancelamento.toLowerCase().includes('data limite'))) {
          statusExibicao = 'cancelada_prazo';
        }

        nota = 0;
        statusCorrecao = 'cancelada';
        notaLiberada = true;
      }
      else if (notaLiberada && nota !== null) {
        statusCorrecao = 'corrigida';
        statusExibicao = 'concluida';
      } else {
        statusCorrecao = 'pendente';
        statusExibicao = 'aguardando_correcao';
      }

      provasComStatus.push({
        id: prova._id,
        _id: prova._id,
        titulo: prova.titulo,
        periodo: prova.periodo || '1',
        eixo: prova.eixo,
        disciplina: prova.disciplina,
        conteudo: prova.conteudo,
        quantidadeQuestoes: prova.quantidadeQuestoes,
        dificuldade: prova.dificuldade,
        dataLimite: prova.dataLimite,
        duracaoMinutos: prova.duracaoMinutos,
        horarioInicio: prova.horarioInicio,
        horarioTermino: prova.duracaoTermino,
        turma: prova.turmaId ? {
          nome: prova.turmaId.nome,
          disciplina: prova.turmaId.disciplina
        } : null,
        professor: prova.userId ? prova.userId.nome : 'Professor',
        status: statusExibicao,
        nota: nota,
        statusCorrecao: statusCorrecao,
        notaLiberada: notaLiberada,
        cancelada: provaCancelada,
        motivoCancelamento: motivoCancelamento,
        flagViolacao: flagViolacao,
        estatisticasCancelamento: estatisticasCancelamento,
        dataRealizacao: dataRealizacao,
        tempoGasto: tempoGasto,
        _fonte: provaRealizada ? 'ProvaRealizada' : 'Resultado'
      });
    }

    const provasCanceladas = provasComStatus.filter(p => p.cancelada);

    res.json({
      success: true,
      provas: provasComStatus,
      mensagem: `Encontradas ${provasComStatus.length} provas (${provasCanceladas.length} canceladas)`,
      estatisticas: {
        total: provasComStatus.length,
        canceladas: provasCanceladas.length,
        concluidas: provasComStatus.filter(p => !p.cancelada && p.notaLiberada).length
      }
    });

  } catch (error) {
    logger.error('Erro detalhado ao listar provas do aluno:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao listar provas: ' + error.message
    });
  }
});

// ============================================================================
// GET /api/aluno/provas/:provaId/correcao-detalhada
// ============================================================================
router.get('/provas/:provaId/correcao-detalhada', authenticateTokenLocal, verificarAluno, async (req, res) => {
  try {
    const provaId = req.params.provaId;
    const alunoId = req.userId;

    const prova = await Prova.findById(provaId).select('titulo conteudo questoes');
    if (!prova) {
      return res.status(404).json({ success: false, error: 'Prova não encontrada' });
    }

    const resultado = await Resultado.findOne({ provaId: provaId, userId: alunoId });
    const provaRealizada = await ProvaRealizada.findOne({ provaId: provaId, alunoId: alunoId });

    if (!resultado && !provaRealizada) {
      return res.status(404).json({ success: false, error: 'Você ainda não realizou esta prova' });
    }

    const notaLiberada = (resultado && resultado.notaLiberada) ||
      (provaRealizada && provaRealizada.notaLiberada);

    if (!notaLiberada) {
      return res.status(403).json({
        success: false,
        error: 'A correção ainda não foi liberada pelo professor'
      });
    }

    res.json({
      success: true,
      prova: {
        id: prova._id,
        titulo: prova.titulo,
        conteudo: prova.conteudo
      },
      questoes: prova.questoes.map(q => ({
        pergunta: q.pergunta,
        opcoes: q.opcoes,
        respostaCorreta: q.respostaCorreta,
        explicacao: q.explicacao
      })),
      nota: resultado ? resultado.nota : provaRealizada.nota,
      acertos: resultado ? resultado.acertos : null,
      total: resultado ? resultado.total : prova.questoes.length,
      respostasAluno: resultado ? resultado.respostas : provaRealizada.respostas,
      resultadoDetalhado: resultado ? resultado.resultadoDetalhado : provaRealizada.resultadoDetalhado,
      notaLiberada: true,
      dataCorrecao: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Erro ao buscar correção detalhada:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno ao buscar correção: ' + error.message
    });
  }
});

// ============================================================================
// GET /api/aluno/provas/:provaId/cancelamento-detailed
// ============================================================================
router.get('/provas/:provaId/cancelamento-detailed', authenticateTokenLocal, verificarAluno, async (req, res) => {
  try {
    const provaId = req.params.provaId;
    const alunoId = req.userId;

    const provaRealizada = await ProvaRealizada.findOne({
      provaId: provaId,
      alunoId: alunoId,
      $or: [{ status: 'cancelada' }, { cancelada: true }]
    })
      .populate('provaId', 'titulo conteudo')
      .populate('alunoId', 'nome email');

    const resultado = await Resultado.findOne({
      provaId: provaId,
      userId: alunoId,
      $or: [{ status: 'cancelada' }, { cancelada: true }]
    })
      .populate('provaId', 'titulo conteudo');

    if (!provaRealizada && !resultado) {
      return res.status(404).json({
        success: false,
        error: 'Prova cancelada não encontrada'
      });
    }

    const dadosCancelamento = provaRealizada || resultado;
    const prova = dadosCancelamento.provaId;
    const aluno = provaRealizada?.alunoId || await User.findById(alunoId);

    const motivo = dadosCancelamento.motivoCancelamento || '';
    const motivoLower = motivo.toLowerCase();

    let tipoCancelamento = 'outro';
    let icone = 'ban';
    let corPrincipal = '#ef4444';
    let corFundo = '#fef2f2';
    let tituloStatus = 'CANCELADA';

    const palavrasViolacao = [
      'violação', 'violacao', 'violou', 'viola', 'multiplas', 'múltiplas',
      'regras', 'monitoramento', 'trapaça', 'trapaca', 'fraude'
    ];

    const isViolacao = palavrasViolacao.some(palavra => motivoLower.includes(palavra)) ||
      dadosCancelamento.flagViolacao ||
      (dadosCancelamento.estatisticasCancelamento &&
        dadosCancelamento.estatisticasCancelamento.avisos > 0);

    if (isViolacao) {
      tipoCancelamento = 'violacao';
      icone = 'user-slash';
      corPrincipal = '#dc2626';
      corFundo = '#fee2e2';
      tituloStatus = 'CANCELADA - VIOLAÇÃO';
    } else if (motivoLower.includes('prazo') || motivoLower.includes('expirado') || motivoLower.includes('data limite')) {
      tipoCancelamento = 'prazo';
      icone = 'clock';
      corPrincipal = '#f59e0b';
      corFundo = '#fef3c7';
      tituloStatus = 'CANCELADA - PRAZO';
    }

    let estatisticas = dadosCancelamento.estatisticasCancelamento || {};
    if (!estatisticas.timestamp && dadosCancelamento.createdAt) {
      estatisticas.timestamp = dadosCancelamento.createdAt;
    }

    let professor = null;
    if (prova?.userId) {
      professor = await User.findById(prova.userId).select('nome email');
    }

    res.json({
      success: true,
      tipo: 'cancelada',
      tipoCancelamento: tipoCancelamento,
      tituloStatus: tituloStatus,
      icone: icone,
      corPrincipal: corPrincipal,
      corFundo: corFundo,
      prova: {
        id: prova?._id,
        titulo: prova?.titulo || 'Prova não encontrada',
        conteudo: prova?.conteudo || 'Conteúdo não especificado'
      },
      aluno: {
        id: alunoId,
        nome: aluno?.nome || 'Aluno',
        email: aluno?.email || 'Não informado'
      },
      cancelamento: {
        motivo: motivo,
        data: dadosCancelamento.dataRealizacao || dadosCancelamento.createdAt,
        nota: dadosCancelamento.nota || 0,
        tempoGasto: dadosCancelamento.tempoGasto || 0
      },
      estatisticas: estatisticas,
      professor: professor ? { nome: professor.nome, email: professor.email } : null,
      logTimestamp: estatisticas.timestamp || new Date().toISOString(),
      mensagem: tipoCancelamento === 'violacao'
        ? 'Esta prova foi cancelada por violação das regras estabelecidas para realização da avaliação.'
        : 'Esta prova foi cancelada automaticamente por expiração do prazo de entrega.',
      recomendacao: tipoCancelamento === 'violacao'
        ? 'Para evitar cancelamentos futuros, respeite as regras da prova: mantenha a tela cheia, não saia da página e não use atalhos durante a realização.'
        : 'Para evitar cancelamentos futuros, realize as provas dentro do prazo estabelecido.'
    });

  } catch (error) {
    logger.error('Erro ao buscar detalhes de cancelamento:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno ao buscar detalhes do cancelamento: ' + error.message
    });
  }
});

// ============================================================================
// GET /api/aluno/provas/:provaId/detalhes-cancelamento
// ============================================================================
router.get('/provas/:provaId/detalhes-cancelamento', authenticateTokenLocal, verificarAluno, async (req, res) => {
  try {
    const provaId = req.params.provaId;
    const alunoId = req.userId;

    const provaCancelada = await ProvaRealizada.findOne({
      provaId: provaId,
      alunoId: alunoId,
      status: 'cancelada'
    });

    if (!provaCancelada) {
      return res.status(404).json({
        success: false,
        error: 'Prova cancelada não encontrada'
      });
    }

    const prova = await Prova.findById(provaId);
    const aluno = await User.findById(alunoId);

    res.json({
      success: true,
      detalhes: {
        provaTitulo: prova ? prova.titulo : 'Prova não encontrada',
        alunoNome: aluno ? aluno.nome : 'Aluno não encontrado',
        dataCancelamento: provaCancelada.dataRealizacao,
        motivo: provaCancelada.motivoCancelamento || 'Violação das regras da prova',
        estatisticas: provaCancelada.estatisticasCancelamento || {},
        nota: provaCancelada.nota,
        tempoGasto: provaCancelada.tempoGasto,
        professorNotificado: true,
        dataNotificacao: provaCancelada.updatedAt
      }
    });

  } catch (error) {
    logger.error('Erro ao buscar detalhes do cancelamento:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno: ' + error.message
    });
  }
});

// ============================================================================
// GET /api/aluno/provas/:provaId/resultado
// ============================================================================
router.get('/provas/:provaId/resultado', authenticateTokenLocal, verificarAluno, async (req, res) => {
  try {
    const provaId = req.params.provaId;
    const alunoId = req.userId;

    let resultado = await Resultado.findOne({ provaId: provaId, userId: alunoId })
      .populate('provaId', 'titulo conteudo turmaId')
      .populate('userId', 'nome email');

    const provaRealizada = await ProvaRealizada.findOne({ provaId: provaId, alunoId: alunoId })
      .populate('provaId', 'titulo conteudo turmaId')
      .populate('alunoId', 'nome email');

    if (!resultado && !provaRealizada) {
      return res.status(404).json({
        success: false,
        error: 'Você ainda não realizou esta prova'
      });
    }

    let notaLiberada = false;
    let nota = null;
    let dadosCompletos = null;

    if (resultado) {
      if (resultado.notaLiberada === true && resultado.nota !== null && resultado.nota !== undefined) {
        notaLiberada = true;
        nota = resultado.nota;
        dadosCompletos = { tipo: 'resultado', dados: resultado };
      }
    }

    if (!notaLiberada && provaRealizada) {
      if (provaRealizada.notaLiberada === true && provaRealizada.nota !== null && provaRealizada.nota !== undefined) {
        notaLiberada = true;
        nota = provaRealizada.nota;
        dadosCompletos = { tipo: 'prova_realizada', dados: provaRealizada };
      }
    }

    if (notaLiberada && nota !== null) {
      const prova = resultado?.provaId || provaRealizada?.provaId;
      const aluno = resultado?.userId || provaRealizada?.alunoId;

      let acertos = resultado?.acertos;
      let total = resultado?.total;
      let porcentagem = resultado?.porcentagem;

      if (!acertos && prova?.questoes) {
        total = prova.questoes.length;
        acertos = Math.round((nota / 10) * total);
        porcentagem = ((acertos / total) * 100).toFixed(1);
      }

      return res.json({
        success: true,
        status: 'corrigida',
        notaLiberada: true,
        nota: nota,
        acertos: acertos,
        total: total,
        porcentagem: porcentagem,
        dataEntrega: resultado?.createdAt || provaRealizada?.dataRealizacao,
        tempoGasto: resultado?.tempoGasto || provaRealizada?.tempoGasto || 0,
        prova: {
          titulo: prova?.titulo || 'Prova',
          conteudo: prova?.conteudo || '',
          turma: prova?.turmaId ? {
            nome: prova.turmaId.nome,
            disciplina: prova.turmaId.disciplina
          } : null
        },
        aluno: {
          nome: aluno?.nome || 'Aluno',
          email: aluno?.email || ''
        },
        modelo: dadosCompletos?.tipo,
        mensagem: 'Nota disponível'
      });
    }

    return res.json({
      success: true,
      status: 'pendente',
      notaLiberada: false,
      mensagem: 'Sua prova ainda está sendo corrigida pelo professor.',
      dataEntrega: resultado?.createdAt || provaRealizada?.dataRealizacao,
      tempoGasto: resultado?.tempoGasto || provaRealizada?.tempoGasto || 0,
      prova: {
        titulo: (resultado?.provaId || provaRealizada?.provaId)?.titulo || 'Prova',
        conteudo: (resultado?.provaId || provaRealizada?.provaId)?.conteudo || ''
      }
    });

  } catch (error) {
    logger.error('Erro detalhado ao buscar resultado do aluno:', error);

    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        error: 'ID da prova inválido. Formato incorreto.'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor: ' + error.message
    });
  }
});

// ============================================================================
// GET /api/aluno/resultados
// ============================================================================
router.get('/resultados', authenticateTokenLocal, verificarAluno, async (req, res) => {
  try {
    const alunoId = req.userId;

    const resultados = await Resultado.find({ userId: alunoId })
      .populate('provaId', 'titulo conteudo turmaId')
      .sort({ createdAt: -1 });

    const provasRealizadas = await ProvaRealizada.find({ alunoId: alunoId })
      .populate('provaId', 'titulo conteudo turmaId')
      .sort({ dataRealizacao: -1 });

    const todosResultados = [];

    resultados.forEach(r => {
      todosResultados.push({
        id: r._id,
        provaId: r.provaId._id,
        provaTitulo: r.provaId.titulo,
        provaConteudo: r.provaId.conteudo,
        nota: r.nota,
        acertos: r.acertos,
        total: r.total,
        porcentagem: r.porcentagem,
        tempoGasto: r.tempoGasto,
        dataEntrega: r.createdAt,
        tipo: 'resultado'
      });
    });

    provasRealizadas.forEach(pr => {
      const jaExiste = todosResultados.some(r =>
        r.provaId.toString() === pr.provaId._id.toString()
      );

      if (!jaExiste && pr.provaId) {
        todosResultados.push({
          id: pr._id,
          provaId: pr.provaId._id,
          provaTitulo: pr.provaId.titulo,
          provaConteudo: pr.provaId.conteudo,
          nota: pr.nota,
          tempoGasto: pr.tempoGasto,
          dataEntrega: pr.dataRealizacao,
          tipo: 'prova_realizada'
        });
      }
    });

    const estatisticas = {
      totalProvas: todosResultados.length,
      mediaNotas: todosResultados.length > 0
        ? todosResultados.reduce((sum, r) => sum + (r.nota || 0), 0) / todosResultados.length
        : 0,
      totalAcertos: todosResultados.filter(r => r.acertos).reduce((sum, r) => sum + (r.acertos || 0), 0),
      totalQuestoes: todosResultados.filter(r => r.total).reduce((sum, r) => sum + (r.total || 0), 0)
    };

    res.json({
      success: true,
      resultados: todosResultados,
      estatisticas: estatisticas
    });

  } catch (error) {
    logger.error('Erro ao buscar resultados do aluno:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

// ============================================================================
// GET /api/aluno/curso-completo
// ============================================================================
router.get('/curso-completo', authenticateTokenLocal, async (req, res) => {
  try {
    const alunoId = req.userId;

    const aluno = await User.findById(alunoId).select('curso');

    if (!aluno || !aluno.curso) {
      return res.json({ success: true, curso: null, eixo: null });
    }

    const curso = await Curso.findOne({ nome: aluno.curso }).populate('eixoId');

    if (!curso) {
      return res.json({ success: true, curso: aluno.curso, eixo: null });
    }

    res.json({
      success: true,
      curso: curso.nome,
      cursoId: curso._id,
      eixo: curso.eixoId ? {
        id: curso.eixoId._id,
        nome: curso.eixoId.nome,
        label: curso.eixoId.label,
        cor: curso.eixoId.cor
      } : null
    });

  } catch (error) {
    logger.error('Erro ao buscar curso do aluno:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// GET /api/aluno/meu-eixo-turmas
// Retorna:
//   - 3 eixos COMUNS da BNCC (SEMPRE fixos, não dependem do banco)
//   - Eixo do CURSO do aluno (vindo do banco)
// ============================================================================
router.get('/meu-eixo-turmas', authenticateTokenLocal, verificarAluno, async (req, res) => {
  try {
    const alunoId = req.userId;

    // ============================================
    // 1. BUSCAR ALUNO
    // ============================================
    const aluno = await User.findById(alunoId)
      .select('curso turma nome email matricula');

    if (!aluno) {
      return res.status(404).json({ success: false, error: 'Aluno não encontrado' });
    }

    // ============================================
    // 2. BUSCAR EIXO DO CURSO DO ALUNO (vindo do BANCO)
    // ============================================
    let eixoCurso = null;
    let cursoCompleto = null;

    if (aluno.curso && Curso && Eixo) {
      try {
        cursoCompleto = await Curso.findOne({
          nome: { $regex: new RegExp(`^${aluno.curso.trim()}$`, 'i') }
        }).populate('eixoId');

        if (cursoCompleto && cursoCompleto.eixoId) {
          const eixoEncontrado = cursoCompleto.eixoId;

          // Verificar se o eixo do curso é um dos BNCC (evita duplicação)
          const jaEstaNosComuns = EIXOS_COMUNS_BNCC.some(e => e.nome === eixoEncontrado.nome);

          if (!jaEstaNosComuns) {
            eixoCurso = {
              _id: eixoEncontrado._id,
              nome: eixoEncontrado.nome,
              label: eixoEncontrado.label,
              cor: eixoEncontrado.cor || '#667eea',
              icone: eixoEncontrado.icone || 'fa-graduation-cap',
              descricao: eixoEncontrado.descricao || '',
              fixo: false
            };
          }
        }
      } catch (err) {
        logger.error('Erro ao buscar curso/eixo:', err.message);
      }
    }

    // ============================================
    // 3. BUSCAR TURMAS DO ALUNO
    // ============================================
    let turmasDoAluno = [];

    if (Turma) {
      try {
        turmasDoAluno = await Turma.find({ alunos: alunoId })
          .select('nome disciplina ativa eixo')
          .lean();
      } catch (err) {
        logger.error('Erro ao buscar turmas:', err.message);
      }
    }

    // ============================================
    // 4. RESPOSTA
    // ============================================
    res.json({
      success: true,

      aluno: {
        id: aluno._id,
        nome: aluno.nome,
        email: aluno.email,
        matricula: aluno.matricula,
        curso: aluno.curso,
        turma: aluno.turma
      },

      // Eixos comuns BNCC (SEMPRE presentes - fixos)
      eixosComuns: EIXOS_COMUNS_BNCC,

      // Eixo do curso do aluno (vindo do banco - pode ser null)
      eixo: eixoCurso,

      curso: cursoCompleto ? {
        _id: cursoCompleto._id,
        nome: cursoCompleto.nome
      } : null,

      // Turmas do aluno
      turmas: turmasDoAluno.map(t => ({
        id: t._id,
        nome: t.nome,
        disciplina: t.disciplina || 'Sem disciplina',
        ativa: t.ativa !== false,
        eixo: t.eixo || null
      })),

      totalEixosComuns: EIXOS_COMUNS_BNCC.length,
      totalTurmas: turmasDoAluno.length
    });

  } catch (error) {
    logger.error('Erro ao buscar eixo e turmas do aluno:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar eixo e turmas do aluno: ' + error.message
    });
  }
});

// ============================================================================
// GET /api/aluno/qrcode/:alunoId
// ============================================================================
router.get('/qrcode/:alunoId', authenticateTokenLocal, async (req, res) => {
  try {
    const { alunoId } = req.params;

    if (!PERFIS_QRCODE_AUTORIZADOS.includes(req.userRole)) {
      return res.status(403).json({
        success: false,
        error: 'Acesso negado. Seu perfil não tem permissão para visualizar QR Codes de alunos.'
      });
    }

    const aluno = await User.findById(alunoId)
      .select('+qrCodeUsuario qrCodeUsuarioGeradoEm nome email matricula role ativo');

    if (!aluno) {
      return res.status(404).json({ success: false, error: 'Aluno não encontrado' });
    }

    if (aluno.role !== 'aluno') {
      return res.status(400).json({
        success: false,
        error: 'O ID informado não pertence a um aluno'
      });
    }

    if (!aluno.qrCodeUsuario) {
      const IS_LOCALHOST = process.env.NODE_ENV === 'development';
      const BASE_URL = IS_LOCALHOST
        ? 'http://localhost:3000'
        : (process.env.BASE_URL || 'https://seu-dominio.com');

      const alunoUrl = `${BASE_URL}/identificar-aluno.html?id=${aluno._id}`;

      const qrCodeDataUrl = await QRCode.toDataURL(alunoUrl, {
        errorCorrectionLevel: 'H',
        margin: 1,
        width: 200,
        color: { dark: '#000000', light: '#ffffff' }
      });

      aluno.qrCodeUsuario = qrCodeDataUrl;
      aluno.qrCodeUsuarioGeradoEm = new Date();
      aluno.qrCodeUsuarioTipo = 'aluno';
      await aluno.save();
    }

    res.json({
      success: true,
      qrCode: aluno.qrCodeUsuario,
      geradoEm: aluno.qrCodeUsuarioGeradoEm,
      aluno: {
        id: aluno._id,
        nome: aluno.nome,
        email: aluno.email,
        matricula: aluno.matricula
      }
    });

  } catch (error) {
    logger.error('Erro ao buscar QR Code:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// EXPORTAR ROUTER
// ============================================================================
module.exports = router;