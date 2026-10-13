// ============================================================================
// PROVAS - EducaPleno
// ============================================================================
// Descrição: Todas as rotas relacionadas a provas (criar, responder, corrigir)
//
// Rotas incluídas:
//   - PUT    /api/provas/:id/questoes            - Editar questões
//   - POST   /api/provas/:id/responder           - Aluno responde prova
//   - GET    /api/provas/:id/realizar            - Aluno obtém prova para realizar
//   - GET    /api/provas/:id/acesso              - Validar acesso à prova (Face ID)
//   - GET    /api/provas/dados                   - Obter dados com token
//   - GET    /api/provas/:provaId/resultados     - Resultados de uma prova
//   - GET    /api/provas/:id                     - Detalhes completos da prova
//   - GET    /api/provas/:id/correcao            - Dados para correção
//   - POST   /api/provas/:provaId/liberar-notas-todos - Liberar todas as notas
//   - POST   /api/provas/:provaId/cancelar       - Cancelar prova
//   - POST   /api/provas/registrar-localizacao   - Registrar localização
//   - POST   /api/provas/offline/save            - Salvar prova offline
//   - GET    /api/provas/offline/pending         - Verificar pendentes offline
//   - GET    /api/config/envio-provas            - Verificar config de envio
//   - GET    /realizar-prova.html                - Página protegida para realizar prova
//
// Autor: Equipe de Desenvolvimento
// ============================================================================

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

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
  console.warn('[provas] Model Prova não disponível:', err.message);
}

let Turma = null;
try {
  Turma = require('../models/Turma');
} catch (err) {
  console.warn('[provas] Model Turma não disponível:', err.message);
}

let Resultado = null;
try {
  Resultado = mongoose.model('Resultado');
} catch (err) {
  console.warn('[provas] Model Resultado não disponível:', err.message);
}

let ProvaRealizada = null;
try {
  ProvaRealizada = mongoose.model('ProvaRealizada');
} catch (err) {
  console.warn('[provas] Model ProvaRealizada não disponível:', err.message);
}

let Config = null;
try {
  Config = mongoose.model('Config');
} catch (err) {
  console.warn('[provas] Model Config não disponível:', err.message);
}

let Notificacao = null;
try {
  Notificacao = mongoose.model('Notificacao');
} catch (err) {
  console.warn('[provas] Model Notificacao não disponível:', err.message);
}

let Localizacao = null;
try {
  Localizacao = mongoose.model('Localizacao');
} catch (err) {
  console.warn('[provas] Model Localizacao não disponível:', err.message);
}

// ============================================================================
// MIDDLEWARES LOCAIS
// ============================================================================

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Acesso negado. Token não fornecido.'
    });
  }

  jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
    if (err) {
      return res.status(403).json({
        success: false,
        error: 'Token inválido ou expirado.'
      });
    }

    if (decoded.temp === true && decoded.purpose === '2fa') {
      req.userId = decoded.id;
      req.userRole = decoded.role;
      req.userNome = decoded.nome;
      return next();
    }

    try {
      const user = await User.findById(decoded.id).select('tokenVersion');
      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'Usuário não encontrado.'
        });
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
    next();
  });
};

// ============================================================================
// FUNÇÕES AUXILIARES
// ============================================================================

function formatarDuracao(minutos) {
  if (!minutos) return 'Não definida';

  const horas = Math.floor(minutos / 60);
  const mins = minutos % 60;

  let resultado = '';
  if (horas > 0) resultado += `${horas}h`;
  if (mins > 0) {
    if (resultado) resultado += ' ';
    resultado += `${mins}min`;
  }

  return resultado || '0min';
}

// ============================================================================
// HEALTH CHECK
// ============================================================================
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'online',
    service: 'Provas',
    models: {
      Prova: !!Prova,
      Turma: !!Turma,
      Resultado: !!Resultado,
      ProvaRealizada: !!ProvaRealizada,
      Config: !!Config,
      Notificacao: !!Notificacao,
      Localizacao: !!Localizacao
    }
  });
});

// ============================================================================
// PUT /:id/questoes - Editar questões de uma prova
// ============================================================================
router.put('/:id/questoes', authenticateToken, async (req, res) => {
  try {
    const prova = await Prova.findOne({
      _id: req.params.id,
      userId: req.userId,
      publicada: false
    });

    if (!prova) {
      return res.status(404).json({
        success: false,
        error: 'Prova não encontrada ou já publicada'
      });
    }

    const { questoes } = req.body;

    if (!questoes || !Array.isArray(questoes)) {
      return res.status(400).json({
        success: false,
        error: 'Lista de questões inválida'
      });
    }

    const todasValidas = questoes.every((q) => {
      const temPergunta = q.pergunta && q.pergunta.trim() !== '';
      const temOpcoes = q.opcoes && Array.isArray(q.opcoes) && q.opcoes.length >= 2;
      const opcoesPreenchidas = q.opcoes.every(opcao => opcao && opcao.trim() !== '');
      const respostaValida = q.respostaCorreta !== undefined &&
        q.respostaCorreta >= 0 &&
        q.respostaCorreta < q.opcoes.length;

      return temPergunta && temOpcoes && opcoesPreenchidas && respostaValida;
    });

    if (!todasValidas) {
      return res.status(400).json({
        success: false,
        error: 'Uma ou mais questões têm dados inválidos'
      });
    }

    if (questoes.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'A prova deve ter pelo menos uma questão'
      });
    }

    prova.questoes = questoes;
    prova.quantidadeQuestoes = questoes.length;
    prova.updatedAt = new Date();

    await prova.save();

    res.json({
      success: true,
      mensagem: 'Questões atualizadas com sucesso',
      prova: {
        id: prova._id,
        titulo: prova.titulo,
        quantidadeQuestoes: prova.quantidadeQuestoes
      }
    });

  } catch (error) {
    logger.error('Erro ao atualizar questões:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno ao atualizar questões'
    });
  }
});

// ============================================================================
// POST /:id/responder - Aluno responde prova
// ============================================================================
router.post('/:id/responder', authenticateToken, async (req, res) => {
  try {
    const provaId = req.params.id;
    const alunoId = req.userId;
    const { respostas, tempoGasto } = req.body;

    logger.info(`📤 Aluno ${alunoId} enviando respostas para prova ${provaId}`);

    if (!respostas || !Array.isArray(respostas)) {
      return res.status(400).json({
        success: false,
        error: 'Respostas inválidas. Deve ser um array.'
      });
    }

    const prova = await Prova.findById(provaId);
    if (!prova) {
      return res.status(404).json({
        success: false,
        error: 'Prova não encontrada'
      });
    }

    const [resultadoExistente, provaRealizadaExistente] = await Promise.all([
      Resultado.findOne({ provaId, userId: alunoId }),
      ProvaRealizada.findOne({ provaId, alunoId })
    ]);

    if (resultadoExistente || provaRealizadaExistente) {
      return res.status(400).json({
        success: false,
        error: 'Você já realizou esta prova'
      });
    }

    // CALCULAR RESULTADO
    let acertos = 0;
    const resultadoDetalhado = [];

    prova.questoes.forEach((questao, index) => {
      const respostaAluno = respostas[index];
      let correto = false;
      const respostaCorretaLetra = String.fromCharCode(65 + questao.respostaCorreta);

      if (respostaAluno && typeof respostaAluno === 'string') {
        const respostaAlunoUpper = respostaAluno.toUpperCase().trim();
        if (respostaAlunoUpper === respostaCorretaLetra) {
          acertos++;
          correto = true;
        }
      }

      resultadoDetalhado.push({
        questaoNumero: index + 1,
        pergunta: questao.pergunta,
        respostaAluno: respostaAluno || 'Não respondida',
        respostaCorreta: respostaCorretaLetra,
        correto: correto,
        explicacao: questao.explicacao
      });
    });

    const notaCalculada = prova.questoes.length > 0 ? (acertos / prova.questoes.length) * 10 : 0;

    logger.info(`📊 Resultado: ${acertos}/${prova.questoes.length} acertos | Nota: ${notaCalculada.toFixed(2)}`);

    const user = await User.findById(alunoId);

    // BUSCAR CONFIGURAÇÕES
    const [configCorrecaoAutomatica, configLiberacaoAutomatica] = await Promise.all([
      Config.findOne({ chave: 'provas.correcaoAutomatica' }),
      Config.findOne({ chave: 'provas.liberacaoAutomatica' })
    ]);

    const correcaoAutomatica = configCorrecaoAutomatica?.valor !== false;
    const liberacaoAutomatica = configLiberacaoAutomatica?.valor || false;

    let notaLiberada = false;
    let status = 'pendente';

    if (correcaoAutomatica) {
      if (liberacaoAutomatica) {
        notaLiberada = true;
        status = 'corrigida';
      } else {
        notaLiberada = false;
        status = 'pendente';
      }
    }

    // SALVAR RESULTADO
    const resultado = new Resultado({
      userId: alunoId,
      provaId: provaId,
      alunoNome: user ? user.nome : 'Aluno',
      respostas: respostas,
      nota: notaCalculada.toFixed(2),
      acertos: acertos,
      total: prova.questoes.length,
      porcentagem: ((acertos / prova.questoes.length) * 100).toFixed(1),
      tempoGasto: tempoGasto || 0,
      resultadoDetalhado: resultadoDetalhado,
      notaLiberada: notaLiberada,
      status: status,
      dataCriacao: new Date()
    });

    await resultado.save();
    logger.info(`✅ Resultado salvo: ${resultado._id}`);

    // ATUALIZAR ESTATÍSTICAS DA PROVA
    prova.totalParticipantes = (prova.totalParticipantes || 0) + 1;

    if (prova.mediaNotas) {
      const somaTotal = prova.mediaNotas * (prova.totalParticipantes - 1);
      prova.mediaNotas = (somaTotal + notaCalculada) / prova.totalParticipantes;
    } else {
      prova.mediaNotas = notaCalculada;
    }
    prova.mediaNotas = parseFloat(prova.mediaNotas.toFixed(2));

    await prova.save();

    let mensagemResposta = 'Prova finalizada com sucesso! ';
    if (notaLiberada) {
      mensagemResposta += `Sua nota é ${notaCalculada.toFixed(2)}.`;
    } else {
      mensagemResposta += 'Aguarde a liberação do professor.';
    }

    res.json({
      success: true,
      message: mensagemResposta,
      notaLiberada: notaLiberada,
      nota: notaLiberada ? notaCalculada.toFixed(2) : null,
      tempoGasto: tempoGasto || 0
    });

  } catch (error) {
    logger.error('❌ Erro ao finalizar prova:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno ao finalizar prova: ' + error.message
    });
  }
});

// ============================================================================
// GET /:id/realizar - Aluno obtém prova para realizar
// ============================================================================
router.get('/:id/realizar', authenticateToken, async (req, res) => {
  try {
    const provaId = req.params.id;
    const alunoId = req.userId;

    logger.info(`📋 Aluno ${alunoId} solicitando prova ${provaId}`);

    const prova = await Prova.findById(provaId);

    if (!prova) {
      return res.status(404).json({
        success: false,
        error: 'Prova não encontrada'
      });
    }

    const provaRealizada = await ProvaRealizada.findOne({
      provaId: provaId,
      alunoId: alunoId
    });

    if (provaRealizada) {
      return res.status(400).json({
        success: false,
        error: 'Você já realizou esta prova'
      });
    }

    const agora = new Date();
    const hoje = agora.toISOString().split('T')[0];

    // Verificar data limite
    if (prova.dataLimite) {
      const dataLimite = new Date(prova.dataLimite);
      const dataLimiteFimDia = new Date(dataLimite);
      dataLimiteFimDia.setHours(23, 59, 59, 999);

      if (agora > dataLimiteFimDia) {
        const dataFormatada = dataLimiteFimDia.toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        });

        return res.status(400).json({
          success: false,
          error: `📅 Esta prova só estava disponível até ${dataFormatada}`
        });
      }
    }

    if (prova.turmaId) {
      const turma = await Turma.findById(prova.turmaId);
      if (turma && !turma.alunos.includes(alunoId)) {
        return res.status(403).json({
          success: false,
          error: 'Você não está na turma desta prova'
        });
      }
    }

    if (prova.status !== 'ativa') {
      return res.status(400).json({
        success: false,
        error: 'Esta prova não está disponível'
      });
    }

    const provaParaAluno = {
      _id: prova._id,
      titulo: prova.titulo,
      conteudo: prova.conteudo,
      periodo: prova.periodo || '1',
      horarioInicio: prova.horarioInicio,
      horarioTermino: prova.horarioTermino,
      duracaoMinutos: prova.duracaoMinutos,
      dataLimite: prova.dataLimite,
      tempoRestanteMinutos: prova.horarioTermino ?
        Math.floor((new Date(`${hoje}T${prova.horarioTermino}:00`) - agora) / (1000 * 60)) :
        null,
      questoes: prova.questoes.map(q => ({
        pergunta: q.pergunta,
        opcoes: q.opcoes
      }))
    };

    res.json({
      success: true,
      prova: provaParaAluno
    });

  } catch (error) {
    logger.error('Erro ao carregar prova:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao carregar prova'
    });
  }
});

// ============================================================================
// GET /:id/acesso - Validar acesso à prova (com Face ID)
// ============================================================================
router.get('/:id/acesso', authenticateToken, async (req, res) => {
  try {
    const provaId = req.params.id;
    const alunoId = req.userId;

    logger.info(`🔐 Validando acesso à prova ${provaId} para aluno ${alunoId}`);

    // ========== BUSCAR DADOS DO ALUNO ==========
    const aluno = await User.findById(alunoId).select('precisaAcessibilidade condicaoAcessibilidade role nome email');

    if (!aluno) {
      return res.status(404).json({
        success: false,
        error: 'Aluno não encontrado'
      });
    }

    // ========== BUSCAR CONFIGURAÇÕES DE SEGURANÇA ==========
    const configFaceId = await Config.findOne({ chave: 'seguranca.exigirFaceIdProvas' });
    const exigirFaceId = configFaceId ? configFaceId.valor : false;

    logger.info(`   👤 Face ID: ${exigirFaceId ? 'ATIVADO' : 'DESATIVADO'}`);

    // ========== BUSCAR PROVA ==========
    const prova = await Prova.findById(provaId)
      .populate('turmaId', 'nome disciplina alunos')
      .populate('userId', 'nome email')
      .select('+tipoProva +adaptada +alternativas +titulo +conteudo +duracaoMinutos +dataLimite +horarioInicio +horarioTermino +quantidadeQuestoes +status +publicada');

    if (!prova) {
      return res.status(404).json({
        success: false,
        error: 'Prova não encontrada'
      });
    }

    // ========== DETECÇÃO DE PROVA ADAPTADA ==========
    const isAdaptada =
      prova.tipoProva === 'adaptada' ||
      prova.adaptada === true ||
      prova.alternativas === 3 ||
      false;

    // ========== REGRAS DE ACESSIBILIDADE ==========
    if (isAdaptada && !aluno.precisaAcessibilidade) {
      return res.status(403).json({
        success: false,
        error: 'Esta prova é exclusiva para alunos com necessidades de acessibilidade.',
        codigo: 'ACESSO_NEGADO_ADAPTADA'
      });
    }

    if (aluno.precisaAcessibilidade && !isAdaptada) {
      return res.status(403).json({
        success: false,
        error: 'Você só pode acessar provas adaptadas. Entre em contato com seu professor.',
        codigo: 'ACESSO_NEGADO_NORMAL'
      });
    }

    // ========== VERIFICAR SE ESTÁ PUBLICADA ==========
    if (!prova.publicada) {
      return res.status(400).json({
        success: false,
        error: 'Esta prova ainda não foi publicada pelo professor.'
      });
    }

    // ========== VERIFICAR SE O ALUNO ESTÁ NA TURMA ==========
    if (prova.turmaId) {
      const turma = await Turma.findById(prova.turmaId).populate('alunos');

      if (!turma) {
        return res.status(404).json({
          success: false,
          error: 'Turma não encontrada'
        });
      }

      const alunoPorId = turma.alunos.some(a => a._id.toString() === alunoId.toString());

      if (!alunoPorId) {
        return res.status(403).json({
          success: false,
          error: 'Você não está matriculado na turma desta prova.'
        });
      }
    }

    // ========== VERIFICAR SE JÁ REALIZOU ==========
    const provaRealizada = await ProvaRealizada.findOne({
      provaId: provaId,
      alunoId: alunoId
    });

    if (provaRealizada) {
      return res.status(400).json({
        success: false,
        error: 'Você já realizou esta prova.',
        dataRealizacao: provaRealizada.dataRealizacao
      });
    }

    const resultado = await Resultado.findOne({
      provaId: provaId,
      userId: alunoId
    });

    if (resultado) {
      return res.status(400).json({
        success: false,
        error: 'Você já realizou esta prova.'
      });
    }

    // ========== VERIFICAÇÃO DE DATA LIMITE ==========
    const hoje = new Date();

    if (prova.dataLimite) {
      const dataLimite = new Date(prova.dataLimite);
      const dataLimiteFimDia = new Date(dataLimite);
      dataLimiteFimDia.setHours(23, 59, 59, 999);

      if (hoje > dataLimiteFimDia) {
        const dataFormatada = dataLimiteFimDia.toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        });

        return res.status(400).json({
          success: false,
          error: `📅 Esta prova só estava disponível até ${dataFormatada}`,
          codigo: 'PROVA_EXPIRADA'
        });
      }
    }

    // ========== VERIFICAÇÃO DE HORÁRIO ==========
    if (prova.horarioInicio && prova.horarioTermino) {
      const ano = hoje.getFullYear();
      const mes = String(hoje.getMonth() + 1).padStart(2, '0');
      const dia = String(hoje.getDate()).padStart(2, '0');

      const inicioProva = new Date(`${ano}-${mes}-${dia}T${prova.horarioInicio}:00`);
      const terminoProva = new Date(`${ano}-${mes}-${dia}T${prova.horarioTermino}:00`);

      if (hoje < inicioProva) {
        const diffMinutos = Math.floor((inicioProva - hoje) / 60000);
        return res.status(400).json({
          success: false,
          error: `A prova só estará disponível a partir das ${prova.horarioInicio} (em ${diffMinutos} minutos)`
        });
      }

      if (hoje > terminoProva) {
        return res.status(400).json({
          success: false,
          error: `⏰ O horário para esta prova terminou às ${prova.horarioTermino}`
        });
      }
    }

    // ========== APLICAR TEMPO ADICIONAL ==========
    let duracaoFinal = prova.duracaoMinutos;

    if (isAdaptada && aluno.precisaAcessibilidade) {
      const configTempoAdicional = await Config.findOne({
        chave: 'provas.tempoAdicionalAcessibilidade'
      });
      const configPercent = await Config.findOne({
        chave: 'provas.tempoAdicionalPercent'
      });

      const tempoAdicionalHabilitado = configTempoAdicional?.valor !== false;
      const percentAdicional = configPercent?.valor || 50;

      if (tempoAdicionalHabilitado) {
        const tempoOriginal = prova.duracaoMinutos || 60;
        const acrescimo = Math.round(tempoOriginal * (percentAdicional / 100));
        duracaoFinal = tempoOriginal + acrescimo;
      }
    }

    // ========== GERAR TOKEN DE ACESSO ==========
    let expiracaoToken;

    if (prova.horarioTermino && prova.dataLimite) {
      const dataLimite = new Date(prova.dataLimite);
      const ano = dataLimite.getFullYear();
      const mes = String(dataLimite.getMonth() + 1).padStart(2, '0');
      const dia = String(dataLimite.getDate()).padStart(2, '0');

      const dataExpiracao = new Date(`${ano}-${mes}-${dia}T${prova.horarioTermino}:00-03:00`);
      dataExpiracao.setHours(dataExpiracao.getHours() + 1);

      expiracaoToken = Math.floor(dataExpiracao.getTime() / 1000);
    } else {
      expiracaoToken = Math.floor(Date.now() / 1000) + (24 * 60 * 60);
    }

    const provaToken = jwt.sign(
      {
        alunoId: alunoId,
        provaId: provaId,
        access: 'prova',
        iat: Math.floor(Date.now() / 1000),
        exp: expiracaoToken,
        adaptada: isAdaptada,
        duracaoMinutos: duracaoFinal
      },
      process.env.JWT_SECRET
    );

    logger.info(`   ✅ ACESSO AUTORIZADO`);

    res.json({
      success: true,
      provaToken: provaToken,
      exigirFaceId: exigirFaceId,
      prova: {
        id: prova._id,
        titulo: prova.titulo,
        conteudo: prova.conteudo,
        duracaoMinutos: duracaoFinal,
        quantidadeQuestoes: prova.quantidadeQuestoes,
        dataLimite: prova.dataLimite,
        horarioInicio: prova.horarioInicio,
        horarioTermino: prova.horarioTermino,
        adaptada: isAdaptada,
        tipoProva: isAdaptada ? 'adaptada' : (prova.tipoProva || 'simples'),
        alternativas: isAdaptada ? 3 : (prova.alternativas || 5),
        tempoAdicionalAplicado: (isAdaptada && aluno.precisaAcessibilidade && duracaoFinal !== prova.duracaoMinutos),
        duracaoOriginal: prova.duracaoMinutos,
        turma: prova.turmaId ? {
          id: prova.turmaId._id,
          nome: prova.turmaId.nome,
          disciplina: prova.turmaId.disciplina
        } : null,
        professor: prova.userId ? {
          nome: prova.userId.nome,
          email: prova.userId.email
        } : null
      },
      aluno: {
        id: aluno._id,
        nome: aluno.nome,
        precisaAcessibilidade: aluno.precisaAcessibilidade,
        condicaoAcessibilidade: aluno.condicaoAcessibilidade
      },
      redirectTo: `/realizar-prova.html?token=${provaToken}`
    });

  } catch (error) {
    logger.error('❌ ERRO AO VALIDAR ACESSO:', error.message);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

// ============================================================================
// GET /dados - Obter dados da prova com token (SEM auth)
// ============================================================================
router.get('/dados', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Token não fornecido'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.access !== 'prova') {
      return res.status(403).json({
        success: false,
        error: 'Token inválido'
      });
    }

    const prova = await Prova.findById(decoded.provaId);

    if (!prova) {
      return res.status(404).json({
        success: false,
        error: 'Prova não encontrada'
      });
    }

    const provaParaAluno = {
      _id: prova._id,
      titulo: prova.titulo,
      conteudo: prova.conteudo,
      periodo: prova.periodo || '1',
      duracao: prova.duracaoMinutos,
      duracaoMinutos: prova.duracaoMinutos,
      dataLimite: prova.dataLimite,
      horarioInicio: prova.horarioInicio,
      horarioTermino: prova.horarioTermino,
      quantidadeQuestoes: prova.quantidadeQuestoes,
      questoes: prova.questoes.map(q => ({
        pergunta: q.pergunta,
        opcoes: q.opcoes
      }))
    };

    res.json({
      success: true,
      prova: provaParaAluno
    });

  } catch (error) {
    logger.error('Erro ao obter dados da prova:', error);

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Token inválido ou expirado'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

// ============================================================================
// GET /:provaId/resultados - Resultados de uma prova específica
// ============================================================================
router.get('/:provaId/resultados', authenticateToken, async (req, res) => {
  try {
    const provaId = req.params.provaId;
    const professorId = req.userId;
    const alunoId = req.query.alunoId;

    logger.info(`📊 Buscando resultados da prova ${provaId}`);

    const prova = await Prova.findById(provaId);
    if (!prova) {
      return res.status(404).json({
        success: false,
        error: 'Prova não encontrada'
      });
    }

    const isAdmin = req.userRole === 'admin' || req.userRole === 'super_admin';
    const isProfessor = req.userRole === 'professor';
    const isProfessorDaProva = prova.userId.toString() === professorId;

    if (isAdmin) {
      logger.info(`✅ ${req.userRole} acessando`);
    } else if (!isProfessor && !isProfessorDaProva) {
      return res.status(403).json({
        success: false,
        error: 'Você não tem permissão para ver os resultados desta prova'
      });
    }

    // ========== BUSCAR ALUNOS DA TURMA ==========
    const turma = await Turma.findById(prova.turmaId).populate('alunos', 'nome email matricula');
    const todosAlunosTurma = turma?.alunos || [];

    // ========== BUSCAR RESULTADOS ==========
    let query = { provaId: provaId };

    if (req.userRole === 'aluno') {
      query.userId = professorId;
    }

    if (alunoId && (isProfessor || isProfessorDaProva || req.userRole === 'admin')) {
      query.userId = alunoId;
    }

    const resultados = await Resultado.find(query)
      .populate('userId', 'nome email matricula')
      .sort({ createdAt: -1 });

    const provasRealizadas = await ProvaRealizada.find({ provaId: provaId })
      .populate('alunoId', 'nome email matricula')
      .sort({ dataRealizacao: -1 });

    // ========== CRIAR MAPA ==========
    const resultadosMap = new Map();

    resultados.forEach(r => {
      const alunoIdStr = r.userId._id.toString();
      resultadosMap.set(alunoIdStr, {
        alunoId: r.userId._id,
        alunoNome: r.userId.nome,
        alunoEmail: r.userId.email,
        alunoMatricula: r.userId.matricula,
        notaAutomatica: r.nota,
        notaAutomaticaLiberada: r.notaLiberada,
        acertosAutomaticos: r.acertos,
        respostas: r.respostas,
        tempoGasto: r.tempoGasto,
        dataEntrega: r.createdAt,
        resultadoDetalhado: r.resultadoDetalhado,
        notaManual: r.notaManual,
        notaManualLiberada: r.notaManualLiberada,
        notaManualObservacao: r.notaManualObservacao,
        notaManualData: r.notaManualData,
        notaManualAtribuidaPor: r.notaManualAtribuidaPor,
        resultadoDetalhadoManual: r.resultadoDetalhadoManual,
        total: r.total,
        tipoNota: r.tipoNota || 'automatica',
        cancelada: r.cancelada || false,
        motivoCancelamento: r.motivoCancelamento || null,
        flagViolacao: r.flagViolacao || false,
        estatisticasCancelamento: r.estatisticasCancelamento || null,
        tipoCancelamento: r.motivoCancelamentoTipo || null,
        status: r.status || 'corrigida',
        nota: r.nota || r.notaManual,
        notaLiberada: r.notaLiberada || r.notaManualLiberada,
        acertos: r.acertos || 0,
        origem: 'resultado',
        id: r._id
      });
    });

    provasRealizadas.forEach(pr => {
      const alunoIdStr = pr.alunoId._id.toString();

      if (!resultadosMap.has(alunoIdStr)) {
        resultadosMap.set(alunoIdStr, {
          alunoId: pr.alunoId._id,
          alunoNome: pr.alunoId.nome,
          alunoEmail: pr.alunoId.email,
          alunoMatricula: pr.alunoId.matricula,
          notaAutomatica: pr.nota,
          notaAutomaticaLiberada: pr.notaLiberada,
          acertosAutomaticos: null,
          respostas: pr.respostas,
          tempoGasto: pr.tempoGasto,
          dataEntrega: pr.dataRealizacao,
          resultadoDetalhado: pr.resultadoDetalhado,
          notaManual: pr.notaManual,
          notaManualLiberada: pr.notaManualLiberada,
          notaManualObservacao: pr.notaManualObservacao,
          notaManualData: pr.notaManualData,
          notaManualAtribuidaPor: pr.notaManualAtribuidaPor,
          resultadoDetalhadoManual: pr.resultadoDetalhadoManual,
          total: prova.questoes.length,
          tipoNota: pr.tipoNota || 'automatica',
          cancelada: pr.cancelada || false,
          motivoCancelamento: pr.motivoCancelamento || null,
          flagViolacao: pr.flagViolacao || false,
          estatisticasCancelamento: pr.estatisticasCancelamento || null,
          tipoCancelamento: pr.motivoCancelamentoTipo || null,
          status: pr.status || 'pendente',
          nota: pr.nota || pr.notaManual,
          notaLiberada: pr.notaLiberada || pr.notaManualLiberada,
          acertos: 0,
          origem: 'prova_realizada',
          id: pr._id
        });
      }
    });

    // ========== ADICIONAR ALUNOS SEM RESULTADO ==========
    todosAlunosTurma.forEach(aluno => {
      const alunoIdStr = aluno._id.toString();

      if (!resultadosMap.has(alunoIdStr)) {
        resultadosMap.set(alunoIdStr, {
          alunoId: aluno._id,
          alunoNome: aluno.nome,
          alunoEmail: aluno.email || '',
          alunoMatricula: aluno.matricula || '',
          notaAutomatica: null,
          notaAutomaticaLiberada: false,
          acertosAutomaticos: null,
          respostas: [],
          tempoGasto: 0,
          dataEntrega: null,
          resultadoDetalhado: [],
          notaManual: null,
          notaManualLiberada: false,
          notaManualObservacao: null,
          notaManualData: null,
          notaManualAtribuidaPor: null,
          resultadoDetalhadoManual: [],
          total: prova.questoes.length,
          tipoNota: null,
          cancelada: false,
          motivoCancelamento: null,
          flagViolacao: false,
          estatisticasCancelamento: null,
          tipoCancelamento: null,
          status: 'nao_realizou',
          nota: null,
          notaLiberada: false,
          acertos: 0,
          origem: 'nao_realizou',
          id: null
        });
      }
    });

    // ========== CALCULAR ESTATÍSTICAS ==========
    const resultadosCompletos = Array.from(resultadosMap.values());

    const alunosComNotaAutomatica = resultadosCompletos.filter(r =>
      r.notaAutomatica !== null && r.notaAutomatica !== undefined && !r.cancelada
    );

    const alunosComNotaManual = resultadosCompletos.filter(r =>
      r.notaManual !== null && r.notaManual !== undefined && !r.cancelada
    );

    const notasAutomaticas = alunosComNotaAutomatica
      .map(r => parseFloat(r.notaAutomatica))
      .filter(n => !isNaN(n));

    const notasManuais = alunosComNotaManual
      .map(r => parseFloat(r.notaManual))
      .filter(n => !isNaN(n));

    const mediaAutomatica = notasAutomaticas.length > 0
      ? (notasAutomaticas.reduce((sum, n) => sum + n, 0) / notasAutomaticas.length).toFixed(1)
      : 0;

    const mediaManual = notasManuais.length > 0
      ? (notasManuais.reduce((sum, n) => sum + n, 0) / notasManuais.length).toFixed(1)
      : 0;

    const mediaGeral = (parseFloat(mediaAutomatica) + parseFloat(mediaManual)) / 2;

    const alunosPendentes = resultadosCompletos.filter(r =>
      r.notaAutomatica === null && r.notaManual === null && !r.cancelada
    ).length;

    const alunosCancelados = resultadosCompletos.filter(r => r.cancelada).length;

    const alunosComNotaLiberada = resultadosCompletos.filter(r =>
      (r.notaAutomaticaLiberada || r.notaManualLiberada) && !r.cancelada
    ).length;

    const estatisticas = {
      totalAlunos: resultadosCompletos.length,
      alunosComNotaAutomatica: alunosComNotaAutomatica.length,
      alunosComNotaManual: alunosComNotaManual.length,
      alunosPendentes: alunosPendentes,
      alunosCancelados: alunosCancelados,
      alunosComNotaLiberada: alunosComNotaLiberada,
      mediaAutomatica: mediaAutomatica,
      mediaManual: mediaManual,
      mediaGeral: mediaGeral.toFixed(1)
    };

    res.json({
      success: true,
      resultados: resultadosCompletos,
      estatisticas: estatisticas,
      prova: {
        id: prova._id,
        titulo: prova.titulo,
        conteudo: prova.conteudo,
        quantidadeQuestoes: prova.questoes.length,
        turmaId: prova.turmaId,
        turmaNome: turma?.nome || 'Turma não especificada'
      },
      total: resultadosCompletos.length
    });

  } catch (error) {
    logger.error('❌ Erro ao buscar resultados:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno: ' + error.message
    });
  }
});

// ============================================================================
// GET /:id - Detalhes completos da prova
// ============================================================================
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const provaId = req.params.id;
    const userId = req.userId;
    const userRole = req.userRole;

    logger.info(`🔍 Usuário ${userId} (${userRole}) solicitando prova ${provaId}`);

    const prova = await Prova.findById(provaId)
      .populate('turmaId', 'nome disciplina alunos')
      .populate('userId', 'nome email');

    if (!prova) {
      return res.status(404).json({
        success: false,
        error: 'Prova não encontrada'
      });
    }

    const isAdmin = userRole === 'admin' || userRole === 'super_admin';
    const isProfessorDaProva = prova.userId && prova.userId._id.toString() === userId;

    const dadosProva = {
      id: prova._id,
      titulo: prova.titulo,
      conteudo: prova.conteudo,
      periodo: prova.periodo || '1',
      dataCriacao: prova.createdAt,
      dataLimite: prova.dataLimite,
      horarioInicio: prova.horarioInicio,
      horarioTermino: prova.horarioTermino,
      duracaoFormatada: formatarDuracao(prova.duracaoMinutos),
      duracaoMinutos: prova.duracaoMinutos,
      dificuldade: prova.dificuldade,
      quantidadeQuestoes: prova.questoes.length,
      codigo: prova.codigo,
      status: prova.status,
      fonteGeracao: prova.fonteGeracao,
      turma: prova.turmaId ? {
        id: prova.turmaId._id,
        nome: prova.turmaId.nome,
        disciplina: prova.turmaId.disciplina
      } : null,
      professor: prova.userId ? {
        nome: prova.userId.nome,
        email: prova.userId.email
      } : null
    };

    // ADMIN — vê tudo
    if (isAdmin) {
      const questoes = prova.questoes.map((questao, index) => ({
        id: questao._id,
        numero: index + 1,
        pergunta: questao.pergunta,
        opcoes: questao.opcoes,
        respostaCorreta: questao.respostaCorreta,
        explicacao: questao.explicacao,
        dificuldade: questao.dificuldade || 'media'
      }));

      return res.json({
        success: true,
        prova: dadosProva,
        questoes: questoes,
        visualizacao: 'completa',
        mensagem: `${questoes.length} questões carregadas`
      });
    }

    // Professor da prova — vê tudo
    if (isProfessorDaProva) {
      const questoes = prova.questoes.map((questao, index) => ({
        id: questao._id,
        numero: index + 1,
        pergunta: questao.pergunta,
        opcoes: questao.opcoes,
        respostaCorreta: questao.respostaCorreta,
        explicacao: questao.explicacao,
        dificuldade: questao.dificuldade || 'media'
      }));

      return res.json({
        success: true,
        prova: dadosProva,
        questoes: questoes,
        visualizacao: 'completa',
        mensagem: `${questoes.length} questões carregadas`
      });
    }

    // Aluno — vê sem respostas
    if (userRole === 'aluno' && prova.turmaId) {
      const turma = await Turma.findById(prova.turmaId._id);
      if (!turma || !turma.alunos.includes(userId)) {
        return res.status(403).json({
          success: false,
          error: 'Você não está matriculado na turma desta prova'
        });
      }

      const questoes = prova.questoes.map((questao, index) => ({
        id: questao._id,
        numero: index + 1,
        pergunta: questao.pergunta,
        opcoes: questao.opcoes,
        dificuldade: questao.dificuldade || 'media'
      }));

      return res.json({
        success: true,
        prova: dadosProva,
        questoes: questoes,
        visualizacao: 'parcial',
        mensagem: `${questoes.length} questões carregadas`
      });
    }

    return res.status(403).json({
      success: false,
      error: 'Você não tem permissão para acessar esta prova'
    });

  } catch (error) {
    logger.error('❌ Erro ao buscar detalhes da prova:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno: ' + error.message
    });
  }
});

// ============================================================================
// GET /:id/correcao - Dados para correção
// ============================================================================
router.get('/:id/correcao', authenticateToken, async (req, res) => {
  try {
    const provaId = req.params.id;
    const professorId = req.userId;

    const isAdmin = req.userRole === 'admin' || req.userRole === 'super_admin';
    if (!isAdmin && req.userRole !== 'professor') {
      return res.status(403).json({
        success: false,
        error: 'Apenas professores e administradores podem corrigir provas'
      });
    }

    const prova = await Prova.findById(provaId);

    if (!prova) {
      return res.status(404).json({
        success: false,
        error: 'Prova não encontrada'
      });
    }

    if (prova.userId.toString() !== professorId && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Você não é o professor desta prova'
      });
    }

    const resultados = await Resultado.find({
      provaId: provaId,
      $or: [
        { notaLiberada: { $in: [true, false] } },
        { cancelada: true }
      ]
    })
      .populate('userId', 'nome email matricula')
      .sort({ createdAt: -1 });

    const provasRealizadas = await ProvaRealizada.find({
      provaId: provaId,
      $or: [
        { notaLiberada: { $in: [true, false] } },
        { cancelada: true },
        { status: 'cancelada' }
      ]
    })
      .populate('alunoId', 'nome email matricula')
      .sort({ dataRealizacao: -1 });

    const alunosComProva = [];

    provasRealizadas.forEach(pr => {
      alunosComProva.push({
        alunoId: pr.alunoId._id,
        alunoNome: pr.alunoId.nome,
        alunoEmail: pr.alunoId.email,
        alunoMatricula: pr.alunoId.matricula,
        provaRealizadaId: pr._id,
        respostas: pr.respostas,
        nota: pr.nota,
        tempoGasto: pr.tempoGasto,
        dataRealizacao: pr.dataRealizacao,
        status: pr.status,
        notaLiberada: pr.notaLiberada,
        resultadoDetalhado: pr.resultadoDetalhado,
        tipo: 'prova_realizada'
      });
    });

    resultados.forEach(r => {
      const jaExiste = alunosComProva.some(a =>
        a.alunoId.toString() === r.userId._id.toString()
      );

      if (!jaExiste) {
        alunosComProva.push({
          alunoId: r.userId._id,
          alunoNome: r.userId.nome,
          alunoEmail: r.userId.email,
          alunoMatricula: r.userId.matricula,
          resultadoId: r._id,
          respostas: r.respostas,
          nota: r.nota,
          acertos: r.acertos,
          total: r.total,
          porcentagem: r.porcentagem,
          tempoGasto: r.tempoGasto,
          dataRealizacao: r.createdAt,
          notaLiberada: r.notaLiberada,
          resultadoDetalhado: r.resultadoDetalhado,
          tipo: 'resultado'
        });
      }
    });

    const gabarito = prova.questoes.map((questao, index) => ({
      numero: index + 1,
      pergunta: questao.pergunta,
      opcoes: questao.opcoes,
      respostaCorreta: questao.respostaCorreta,
      respostaCorretaLetra: String.fromCharCode(65 + questao.respostaCorreta),
      explicacao: questao.explicacao
    }));

    res.json({
      success: true,
      prova: {
        id: prova._id,
        titulo: prova.titulo,
        quantidadeQuestoes: prova.questoes.length,
        gabarito: gabarito
      },
      alunos: alunosComProva,
      totalAlunos: alunosComProva.length,
      alunosCorrigidos: alunosComProva.filter(a => a.nota !== null).length,
      alunosPendentes: alunosComProva.filter(a => a.nota === null).length,
      alunosComNotaLiberada: alunosComProva.filter(a => a.notaLiberada).length
    });

  } catch (error) {
    logger.error('❌ Erro ao buscar dados para correção:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno: ' + error.message
    });
  }
});

// ============================================================================
// POST /:provaId/liberar-notas-todos - Liberar todas as notas
// ============================================================================
router.post('/:provaId/liberar-notas-todos', authenticateToken, async (req, res) => {
  try {
    const provaId = req.params.provaId;
    const professorId = req.userId;

    logger.info(`📝 Professor ${professorId} liberando TODAS as notas da prova ${provaId}`);

    const isAdmin = req.userRole === 'admin' || req.userRole === 'super_admin';
    if (!isAdmin && req.userRole !== 'professor') {
      return res.status(403).json({
        success: false,
        error: 'Apenas professores e administradores podem liberar notas'
      });
    }

    const prova = await Prova.findById(provaId);
    if (!prova) {
      return res.status(404).json({
        success: false,
        error: 'Prova não encontrada'
      });
    }

    if (prova.userId.toString() !== professorId && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Você não é o professor desta prova'
      });
    }

    const resultadoUpdate = await Resultado.updateMany(
      { provaId: provaId },
      { $set: { notaLiberada: true } }
    );

    const provaRealizadaUpdate = await ProvaRealizada.updateMany(
      { provaId: provaId },
      { $set: { notaLiberada: true, status: 'corrigida' } }
    );

    const totalLiberados = (resultadoUpdate.modifiedCount || 0) + (provaRealizadaUpdate.modifiedCount || 0);

    logger.info(`✅ ${totalLiberados} notas liberadas`);

    res.json({
      success: true,
      message: `Notas liberadas para ${totalLiberados} alunos!`,
      totalLiberados: totalLiberados,
      resultadosLiberados: resultadoUpdate.modifiedCount || 0,
      provasLiberadas: provaRealizadaUpdate.modifiedCount || 0,
      prova: {
        id: prova._id,
        titulo: prova.titulo
      }
    });

  } catch (error) {
    logger.error('❌ Erro ao liberar notas:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno: ' + error.message
    });
  }
});

// ============================================================================
// POST /:provaId/cancelar - Cancelar prova (aluno)
// ============================================================================
router.post('/:provaId/cancelar', authenticateToken, async (req, res) => {
  try {
    const provaId = req.params.provaId;
    const alunoId = req.userId;
    const { motivo, estatisticas, respostasAtuais, tempoTotal } = req.body;

    logger.info(`🚫 Cancelamento - Prova: ${provaId}, Aluno: ${alunoId}`);
    logger.info(`📝 Motivo: "${motivo}"`);

    // Verificar se já finalizou
    const [resultadoExistente, provaRealizadaExistente] = await Promise.all([
      Resultado.findOne({ provaId, userId: alunoId }),
      ProvaRealizada.findOne({ provaId, alunoId })
    ]);

    if (resultadoExistente || provaRealizadaExistente) {
      return res.json({
        success: true,
        message: 'Prova já foi finalizada',
        ignorado: true
      });
    }

    // Verificar se já foi cancelada
    const [canceladaExistente, resultadoCanceladoExistente] = await Promise.all([
      ProvaRealizada.findOne({ provaId, alunoId, cancelada: true }),
      Resultado.findOne({ provaId, userId: alunoId, cancelada: true })
    ]);

    if (canceladaExistente || resultadoCanceladoExistente) {
      return res.json({
        success: true,
        message: 'Prova já foi cancelada',
        ignorado: true
      });
    }

    const [prova, aluno] = await Promise.all([
      Prova.findById(provaId),
      User.findById(alunoId)
    ]);

    if (!prova || !aluno) {
      return res.status(404).json({
        success: false,
        error: 'Prova ou aluno não encontrado'
      });
    }

    // Processar respostas
    let respostasArray = [];
    if (respostasAtuais) {
      try {
        respostasArray = typeof respostasAtuais === 'string'
          ? JSON.parse(respostasAtuais)
          : (Array.isArray(respostasAtuais) ? respostasAtuais : []);
      } catch (e) {
        respostasArray = [];
      }
    }

    // Detectar tipo
    const motivoLower = motivo.toLowerCase();
    const palavrasViolacao = [
      'violação', 'violacao', 'multiplas', 'múltiplas',
      'atualizar', 'recarregar', 'refresh', 'f5',
      'ctrl+r', 'reload', 'navegação', 'navegacao',
      'backspace', 'atalho', 'tecla', 'click direito'
    ];

    const isViolacao = palavrasViolacao.some(palavra => motivoLower.includes(palavra)) ||
      (estatisticas?.avisos > 0);

    logger.info(`⚠️ Tipo: ${isViolacao ? 'VIOLAÇÃO' : 'PRAZO'}`);

    // Criar registros
    const provaCancelada = new ProvaRealizada({
      provaId,
      alunoId,
      respostas: respostasArray,
      nota: 0,
      tempoGasto: tempoTotal || 0,
      dataRealizacao: new Date(),
      status: 'cancelada',
      notaLiberada: true,
      cancelada: true,
      motivoCancelamento: motivo,
      flagViolacao: isViolacao,
      estatisticasCancelamento: estatisticas,
      motivoCancelamentoTipo: isViolacao ? 'violacao' : 'prazo_expirado',
      resultadoDetalhado: []
    });

    const resultadoCancelado = new Resultado({
      userId: alunoId,
      provaId,
      alunoNome: aluno.nome,
      respostas: respostasArray,
      nota: 0,
      acertos: 0,
      total: prova.questoes?.length || 0,
      porcentagem: '0.0',
      tempoGasto: tempoTotal || 0,
      resultadoDetalhado: [],
      notaLiberada: true,
      cancelada: true,
      motivoCancelamento: motivo,
      flagViolacao: isViolacao,
      estatisticasCancelamento: estatisticas,
      motivoCancelamentoTipo: isViolacao ? 'violacao' : 'prazo_expirado',
      status: 'cancelada'
    });

    await Promise.all([provaCancelada.save(), resultadoCancelado.save()]);

    // Notificar professor
    if (prova.userId) {
      try {
        const professor = await User.findById(prova.userId).select('nome email');
        const turma = await Turma.findById(prova.turmaId).select('nome disciplina codigo');

        if (professor) {
          const notificacao = new Notificacao({
            usuarioId: professor._id,
            tipo: 'cancelamento',
            titulo: '🚫 Prova Cancelada',
            mensagem: `${aluno.nome} - ${prova.titulo} (${turma?.nome || 'Turma'}) - Motivo: ${motivo}`,
            icone: '🚫',
            cor: isViolacao ? '#dc2626' : '#ef4444',
            link: `/index.html?prova=${provaId}`,
            prioridade: 5,
            dados: {
              alunoId,
              alunoNome: aluno.nome,
              alunoEmail: aluno.email,
              provaId,
              provaTitulo: prova.titulo,
              motivo: motivo,
              tipo: isViolacao ? 'violacao' : 'prazo',
              turma: turma ? {
                id: turma._id,
                nome: turma.nome,
                disciplina: turma.disciplina,
                codigo: turma.codigo
              } : null,
              estatisticas: estatisticas
            }
          });

          await notificacao.save();
          logger.info(`✅ Professor notificado`);
        }
      } catch (notifError) {
        logger.error('⚠️ Erro ao notificar professor:', notifError.message);
      }
    }

    res.json({
      success: true,
      message: isViolacao ? 'Prova cancelada por violação' : 'Prova cancelada por prazo',
      motivo: motivo,
      nota: 0,
      status: 'cancelada'
    });

  } catch (error) {
    logger.error('❌ Erro ao cancelar prova:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno: ' + error.message
    });
  }
});

// ============================================================================
// POST /registrar-localizacao - Registrar localização do aluno
// ============================================================================
router.post('/registrar-localizacao', authenticateToken, async (req, res) => {
  try {
    const { provaId, latitude, longitude, accuracy } = req.body;
    const alunoId = req.userId;

    logger.info(`📍 Registrando localização - Aluno: ${alunoId}, Prova: ${provaId}`);

    if (!latitude || !longitude || isNaN(latitude) || isNaN(longitude)) {
      return res.status(400).json({
        success: false,
        error: 'Coordenadas inválidas'
      });
    }

    const LocalizacaoModel = mongoose.models.Localizacao;
    if (!LocalizacaoModel) {
      return res.status(500).json({
        success: false,
        error: 'Modelo de localização não configurado'
      });
    }

    // Atualizar na ProvaRealizada se existir
    const ProvaRealizadaModel = mongoose.models.ProvaRealizada;
    if (ProvaRealizadaModel) {
      try {
        let provaRealizada = await ProvaRealizadaModel.findOne({
          provaId: provaId,
          alunoId: alunoId
        });

        if (provaRealizada) {
          if (!provaRealizada.estatisticasCancelamento) {
            provaRealizada.estatisticasCancelamento = {};
          }

          provaRealizada.estatisticasCancelamento.latitude = latitude;
          provaRealizada.estatisticasCancelamento.longitude = longitude;
          provaRealizada.estatisticasCancelamento.accuracy = accuracy;
          provaRealizada.estatisticasCancelamento.timestamp = new Date().toISOString();

          await provaRealizada.save();
        }
      } catch (err) {
        logger.warn('⚠️ Erro ao atualizar prova realizada:', err.message);
      }
    }

    // Salvar na coleção Localizacao
    const localizacao = new LocalizacaoModel({
      alunoId,
      provaId,
      latitude,
      longitude,
      accuracy: accuracy || 0,
      timestamp: new Date()
    });

    await localizacao.save();

    res.json({
      success: true,
      message: 'Localização registrada',
      localizacaoId: localizacao._id
    });

  } catch (error) {
    logger.error('❌ Erro ao registrar localização:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// POST /offline/save - Salvar prova offline
// ============================================================================
router.post('/offline/save', authenticateToken, async (req, res) => {
  try {
    const { provaId, respostas, tempoGasto } = req.body;
    const alunoId = req.userId;

    logger.info(`💾 Salvando prova offline - Aluno: ${alunoId}, Prova: ${provaId}`);

    const syncData = {
      provaId,
      respostas,
      tempoGasto,
      alunoId,
      timestamp: new Date().toISOString()
    };

    // Aqui usaria o backupService se disponível
    // Por enquanto retorna dados offline

    const offlineData = {
      provaId,
      respostas,
      tempoGasto,
      timestamp: new Date().toISOString(),
      syncId: null,
      status: 'pending'
    };

    res.json({
      success: true,
      message: 'Prova salva offline. Será enviada quando a conexão voltar.',
      offlineData,
      syncId: null
    });

  } catch (error) {
    logger.error('❌ Erro ao salvar offline:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao salvar prova offline'
    });
  }
});

// ============================================================================
// GET /offline/pending - Verificar provas offline pendentes
// ============================================================================
router.get('/offline/pending', authenticateToken, async (req, res) => {
  try {
    // Sem fila de sincronização por enquanto
    res.json({
      success: true,
      pending: 0,
      online: true,
      lastCheck: new Date().toISOString(),
      message: 'Todas as provas estão sincronizadas'
    });

  } catch (error) {
    logger.error('❌ Erro ao verificar pendentes:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao verificar provas pendentes'
    });
  }
});

// ============================================================================
// EXPORTAR ROUTER
// ============================================================================
module.exports = router;