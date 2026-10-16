// ============================================================================
// PROFESSOR - EducaPleno
// ============================================================================
// Descrição: Todas as rotas relacionadas ao professor, incluindo:
//            - Gerenciamento de provas (criar, editar, publicar, excluir)
//            - Correção de provas (automática e manual)
//            - Liberação de notas
//            - Resultados e desempenho dos alunos
//            - Notificações de cancelamento
//            - Detalhes de cancelamento (visão professor)
//            - Listagem de turmas e eixos do professor
//
// Rotas incluídas:
//   - POST   /api/professor/provas/:provaId/publicar
//   - PUT    /api/professor/provas/:id
//   - GET    /api/professor/turmas
//   - GET    /api/professor/eixos
//   - GET    /api/professor/provas
//   - GET    /api/professor/provas/pendentes-correcao
//   - POST   /api/professor/provas/:provaId/corrigir
//   - POST   /api/professor/provas/:provaId/liberar-notas
//   - POST   /api/professor/provas/:provaId/nota-manual
//   - GET    /api/professor/resultados
//   - GET    /api/professor/resultados/notas-alunos
//   - GET    /api/professor/provas/:provaId/cancelamento-detailed
//   - DELETE /api/professor/provas/:provaId
//   - GET    /api/professor/notificacoes/cancelamentos
// ============================================================================

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

// 🔥 Logger
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
  console.log('✅ [professor] Model Prova carregado');
} catch (err) {
  console.warn('⚠️ [professor] Prova não disponível:', err.message);
}

let Turma = null;
try {
  Turma = require('../models/Turma');
  console.log('✅ [professor] Model Turma carregado');
} catch (err) {
  console.warn('⚠️ [professor] Turma não disponível:', err.message);
}

let Eixo = null;
try {
  Eixo = require('../models/Eixo');
  console.log('✅ [professor] Model Eixo carregado');
} catch (err) {
  console.warn('⚠️ [professor] Eixo não disponível:', err.message);
}

let Resultado = null;
try {
  Resultado = mongoose.model('Resultado');
  console.log('✅ [professor] Model Resultado carregado via mongoose.model');
} catch (err) {
  console.warn('⚠️ [professor] Resultado não disponível:', err.message);
}

let ProvaRealizada = null;
try {
  ProvaRealizada = mongoose.model('ProvaRealizada');
  console.log('✅ [professor] Model ProvaRealizada carregado via mongoose.model');
} catch (err) {
  console.warn('⚠️ [professor] ProvaRealizada não disponível:', err.message);
}

let Config = null;
try {
  Config = mongoose.model('Config');
  console.log('✅ [professor] Model Config carregado via mongoose.model');
} catch (err) {
  console.warn('⚠️ [professor] Config não disponível:', err.message);
}

let Notificacao = null;
try {
  Notificacao = mongoose.model('Notificacao');
  console.log('✅ [professor] Model Notificacao carregado via mongoose.model');
} catch (err) {
  console.warn('⚠️ [professor] Notificacao não disponível:', err.message);
}

// ============================================
// CONSTANTES
// ============================================

// 🔥 CAMPOS COMPLETOS DO ALUNO PARA POPULATE
// Todos os campos que devem ser retornados quando populamos
// a referência de alunos em turmas
const CAMPOS_ALUNO_POPULATE = [
  'nome',
  'email',
  'matricula',
  'cpf',
  'telefone',
  'curso',
  'turma',
  'eixo',
  'ativo',
  'precisaAcessibilidade',
  'condicaoAcessibilidade',
  'perfilAlimentar',
  'refeicoesQueParticipa',
  'onesignalPlayerId',
  'createdAt',
  'updatedAt'
].join(' ');

const PALAVRAS_VIOLACAO = [
  'violação', 'violacao', 'violou', 'viola', 'multiplas', 'múltiplas',
  'regras', 'monitoramento', 'trapaça', 'trapaca', 'fraude'
];

// ============================================
// HELPERS
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
      logger.error('❌ Erro ao verificar tokenVersion:', dbError);
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

const verificarProfessor = (req, res, next) => {
  const isAdmin = req.userRole === 'admin' || req.userRole === 'super_admin';

  if (!isAdmin && req.userRole !== 'professor') {
    return res.status(403).json({
      success: false,
      error: 'Apenas professores e administradores podem acessar esta rota'
    });
  }

  req.isAdmin = isAdmin;
  next();
};

function determinarTipoCancelamento(motivo, flagViolacao, estatisticas) {
  const motivoLower = (motivo || '').toLowerCase();

  const isViolacao = PALAVRAS_VIOLACAO.some(palavra => motivoLower.includes(palavra)) ||
    flagViolacao ||
    (estatisticas && estatisticas.avisos > 0);

  if (isViolacao) {
    return {
      tipo: 'violacao',
      icone: 'user-slash',
      corPrincipal: '#dc2626',
      corFundo: '#fee2e2',
      tituloStatus: 'CANCELADA - VIOLAÇÃO'
    };
  }

  if (motivoLower.includes('prazo') || motivoLower.includes('expirado') || motivoLower.includes('data limite')) {
    return {
      tipo: 'prazo',
      icone: 'clock',
      corPrincipal: '#f59e0b',
      corFundo: '#fef3c7',
      tituloStatus: 'CANCELADA - PRAZO'
    };
  }

  return {
    tipo: 'outro',
    icone: 'ban',
    corPrincipal: '#ef4444',
    corFundo: '#fef2f2',
    tituloStatus: 'CANCELADA'
  };
}

// ============================================================================
// HEALTH CHECK
// ============================================================================
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'online',
    service: 'Professor',
    models: {
      Prova: !!Prova,
      Turma: !!Turma,
      Eixo: !!Eixo,
      Resultado: !!Resultado,
      ProvaRealizada: !!ProvaRealizada,
      Config: !!Config,
      Notificacao: !!Notificacao
    }
  });
});

// ============================================================================
// GET /api/professor/turmas
// ============================================================================
// 🔥 CORRIGIDO: Agora retorna TODOS os campos do aluno (via CAMPOS_ALUNO_POPULATE),
//              incluindo precisaAcessibilidade, condicaoAcessibilidade, etc.
//              Também adiciona o campo calculado "alunosComAcessibilidade".
// ============================================================================
router.get('/turmas', authenticateTokenLocal, verificarProfessor, async (req, res) => {
  try {
    const professorId = req.userId;
    const isAdmin = req.isAdmin;

    logger.info(`📚 Professor ${professorId} buscando suas turmas`);

    if (!Turma) {
      return res.status(500).json({
        success: false,
        error: 'Model Turma não disponível'
      });
    }

    let query = {};
    if (!isAdmin) {
      query = {
        $or: [
          { professorId: professorId },
          { 'professor.id': professorId },
          { 'professor._id': professorId },
          { criadoPor: professorId }
        ]
      };
    }

    const turmas = await Turma.find(query)
      .populate('alunos', CAMPOS_ALUNO_POPULATE)
      .sort({ nome: 1 })
      .lean();

    const turmasFormatadas = turmas.map(turma => {
      const alunos = turma.alunos || [];
      const alunosComAcessibilidade = alunos.filter(
        aluno => aluno && aluno.precisaAcessibilidade === true
      ).length;

      return {
        id: turma._id,
        nome: turma.nome || 'Turma sem nome',
        disciplina: turma.disciplina || '',
        eixo: turma.eixo || 'sem-eixo',
        codigo: turma.codigo || '',
        descricao: turma.descricao || '',
        ativa: turma.ativa !== false,
        totalAlunos: alunos.length,
        totalProvas: turma.provas ? turma.provas.length : 0,
        alunosComAcessibilidade: alunosComAcessibilidade,
        dataCriacao: turma.createdAt,
        professorId: turma.professorId || turma.criadoPor || null,
        alunos: alunos
      };
    });

    logger.info(`✅ ${turmasFormatadas.length} turmas encontradas para o professor`);

    res.json({
      success: true,
      turmas: turmasFormatadas,
      total: turmasFormatadas.length
    });

  } catch (error) {
    logger.error('❌ Erro ao buscar turmas do professor:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno ao buscar turmas: ' + error.message
    });
  }
});

// ============================================================================
// GET /api/professor/eixos
// ============================================================================
// 🔥 CORRIGIDO: Busca SEMPRE do banco de dados. Sem fallback hardcoded.
//              Se o model Eixo não existir OU se o banco estiver vazio,
//              retorna ERRO explícito para o frontend tratar.
// ============================================================================
router.get('/eixos', authenticateTokenLocal, verificarProfessor, async (req, res) => {
  try {
    logger.info(`📚 Professor ${req.userId} buscando eixos do banco`);

    // 🔥 Se o model não existe, retorna erro (não fallback)
    if (!Eixo) {
      logger.error('❌ Model Eixo não disponível no servidor');
      return res.status(500).json({
        success: false,
        error: 'Model Eixo não disponível no servidor. Verifique se o model está registrado.',
        eixos: [],
        total: 0
      });
    }

    // 🔥 Buscar SEMPRE do banco
    const eixos = await Eixo.find().sort({ nome: 1 }).lean();

    logger.info(`✅ ${eixos.length} eixos encontrados no banco`);

    // 🔥 Se o banco estiver vazio, retorna aviso (não fallback)
    if (eixos.length === 0) {
      logger.warn('⚠️ Nenhum eixo cadastrado no banco de dados');
      return res.json({
        success: true,
        eixos: [],
        total: 0,
        aviso: 'Nenhum eixo cadastrado. Cadastre eixos na área administrativa.'
      });
    }

    const eixosFormatados = eixos.map(e => ({
      _id: e._id,
      nome: e.nome,
      label: e.label || e.nome,
      cor: e.cor || '#667eea',
      icone: e.icone || 'fa-graduation-cap',
      descricao: e.descricao || ''
    }));

    res.json({
      success: true,
      eixos: eixosFormatados,
      total: eixosFormatados.length
    });

  } catch (error) {
    logger.error('❌ Erro ao buscar eixos do banco:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno ao buscar eixos: ' + error.message,
      eixos: [],
      total: 0
    });
  }
});

// ============================================================================
// POST /api/professor/provas/:provaId/publicar
// ============================================================================
router.post('/provas/:provaId/publicar', authenticateTokenLocal, verificarProfessor, async (req, res) => {
  try {
    const provaId = req.params.provaId;
    const usuarioId = req.userId;
    const usuarioRole = req.userRole;

    logger.info(`📤 Usuário ${usuarioId} (${usuarioRole}) solicitando publicação da prova ${provaId}`);

    const isAdmin = req.isAdmin;

    const prova = await Prova.findById(provaId);
    if (!prova) {
      return res.status(404).json({
        success: false,
        error: 'Prova não encontrada'
      });
    }

    if (!isAdmin && prova.userId.toString() !== usuarioId) {
      return res.status(403).json({
        success: false,
        error: 'Você não é o professor desta prova'
      });
    }

    if (prova.publicada) {
      return res.status(400).json({
        success: false,
        error: 'Esta prova já está publicada'
      });
    }

    if (!prova.questoes || prova.questoes.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'A prova não tem questões. Adicione questões antes de publicar.'
      });
    }

    let habilitarEnvio = true;

    if (Config) {
      try {
        const config = await Config.findOne({ chave: 'provas.habilitarEnvioProva' });
        if (config && typeof config.valor !== 'undefined') {
          habilitarEnvio = config.valor;
        }
      } catch (configErr) {
        logger.warn('⚠️ Erro ao buscar configuração de envio, usando padrão true:', configErr.message);
      }
    }

    logger.info(`📢 Configuração de envio: ${habilitarEnvio ? 'HABILITADO' : 'DESABILITADO'}`);

    prova.publicada = true;
    prova.dataPublicacao = new Date();

    if (habilitarEnvio) {
      prova.enviadaParaAlunos = true;
      prova.status = 'ativa';
      await prova.save();

      logger.info(`✅ Prova ${provaId} publicada e ENVIADA para alunos!`);

      let turma = null;
      let alunos = [];

      if (prova.turmaId) {
        turma = await Turma.findById(prova.turmaId).populate('alunos', 'nome email onesignalPlayerId');
        alunos = turma?.alunos || [];
      }

      if (alunos.length > 0 && Notificacao) {
        let pushAtivado = false;

        if (Config) {
          try {
            const configDoc = await Config.findOne({ chave: 'notificacoes' });
            pushAtivado = configDoc?.valor?.push === true;
          } catch (err) {
            logger.warn('⚠️ Erro ao buscar config de notificações:', err.message);
          }
        }

        let oneSignal = null;
        if (pushAtivado) {
          try {
            const OneSignalService = require('../services/onesignal-service');
            oneSignal = new OneSignalService();
          } catch (err) {
            logger.warn('⚠️ OneSignalService não disponível:', err.message);
          }
        }

        for (const aluno of alunos) {
          try {
            const notificacao = new Notificacao({
              usuarioId: aluno._id,
              tipo: 'sistema',
              titulo: '📝 Nova Prova Publicada',
              mensagem: `A prova "${prova.titulo}" foi publicada na turma ${turma?.nome || 'sua turma'}.`,
              icone: '📚',
              cor: '#10b981',
              link: `/aluno.html`,
              prioridade: 3,
              dados: {
                provaId: prova._id,
                provaTitulo: prova.titulo,
                turmaId: turma?._id,
                tipo: 'nova_prova'
              }
            });

            await notificacao.save();

            if (pushAtivado && oneSignal && aluno.onesignalPlayerId) {
              await oneSignal.enviarPush(
                aluno._id,
                '📝 Nova Prova',
                `Prova "${prova.titulo}" publicada em ${turma?.nome || 'sua turma'}`,
                {
                  tipo: 'nova_prova',
                  provaId: prova._id,
                  provaTitulo: prova.titulo
                }
              );
            }
          } catch (notifError) {
            logger.error(`⚠️ Erro ao notificar aluno ${aluno._id}:`, notifError.message);
          }
        }

        logger.info(`✅ ${alunos.length} alunos notificados sobre nova prova`);
      }

      return res.json({
        success: true,
        message: 'Prova publicada e enviada para os alunos!',
        enviada: true,
        prova: {
          id: prova._id,
          titulo: prova.titulo,
          codigo: prova.codigo,
          publicada: prova.publicada,
          enviadaParaAlunos: prova.enviadaParaAlunos,
          status: prova.status
        }
      });

    } else {
      prova.enviadaParaAlunos = false;
      prova.status = 'rascunho';
      await prova.save();

      logger.info(`⚠️ Prova ${provaId} publicada mas NÃO ENVIADA (envio desabilitado)`);

      return res.json({
        success: true,
        message: '⚠️ Prova publicada, mas NÃO ENVIADA para os alunos',
        enviada: false,
        motivo: 'envio_desabilitado',
        prova: {
          id: prova._id,
          titulo: prova.titulo,
          codigo: prova.codigo,
          publicada: prova.publicada,
          enviadaParaAlunos: prova.enviadaParaAlunos,
          status: prova.status
        }
      });
    }

  } catch (error) {
    logger.error('❌ Erro ao publicar prova:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao publicar prova: ' + error.message
    });
  }
});

// ============================================================================
// PUT /api/professor/provas/:id
// ============================================================================
router.put('/provas/:id', authenticateTokenLocal, verificarProfessor, async (req, res) => {
  try {
    const provaId = req.params.id;
    const usuarioId = req.userId;
    const usuarioRole = req.userRole;
    const updates = req.body;

    logger.info(`✏️ Usuário ${usuarioId} (${usuarioRole}) editando prova ${provaId}`);

    const prova = await Prova.findById(provaId);
    if (!prova) {
      return res.status(404).json({
        success: false,
        error: 'Prova não encontrada'
      });
    }

    if (usuarioRole === 'professor' && prova.userId.toString() !== usuarioId) {
      return res.status(403).json({
        success: false,
        error: 'Você só pode editar suas próprias provas'
      });
    }

    const tinhaMudancas = (
      updates.titulo !== prova.titulo ||
      updates.conteudo !== prova.conteudo ||
      updates.dataLimite !== prova.dataLimite ||
      updates.horarioInicio !== prova.horarioInicio ||
      updates.horarioTermino !== prova.horarioTermino
    );

    if (updates.titulo) prova.titulo = updates.titulo;
    if (updates.conteudo) prova.conteudo = updates.conteudo;

    if (updates.dataLimite) {
      if (updates.dataLimite.includes('T')) {
        prova.dataLimite = new Date(updates.dataLimite);
      } else if (updates.horarioTermino) {
        const dataStr = `${updates.dataLimite}T${updates.horarioTermino}:00`;
        prova.dataLimite = new Date(dataStr);
      } else {
        prova.dataLimite = new Date(`${updates.dataLimite}T23:59:59`);
      }
    }

    if (updates.horarioInicio) prova.horarioInicio = updates.horarioInicio;
    if (updates.horarioTermino) prova.horarioTermino = updates.horarioTermino;

    if (updates.duracaoMinutos) {
      prova.duracaoMinutos = updates.duracaoMinutos;
    } else if (updates.horarioInicio && updates.horarioTermino) {
      const [h1, m1] = updates.horarioInicio.split(':').map(Number);
      const [h2, m2] = updates.horarioTermino.split(':').map(Number);
      prova.duracaoMinutos = (h2 * 60 + m2) - (h1 * 60 + m1);
    }

    if (updates.questoes && Array.isArray(updates.questoes)) {
      prova.questoes = updates.questoes;
      prova.quantidadeQuestoes = updates.questoes.length;
    }

    await prova.save();

    logger.info(`✅ Prova ${provaId} atualizada com sucesso`);

    if (tinhaMudancas && prova.publicada && Notificacao) {
      try {
        const turma = await Turma.findById(prova.turmaId).populate('alunos', 'nome onesignalPlayerId');
        const alunos = turma?.alunos || [];

        if (alunos.length > 0) {
          let pushAtivado = false;

          if (Config) {
            try {
              const configDoc = await Config.findOne({ chave: 'notificacoes' });
              pushAtivado = configDoc?.valor?.push === true;
            } catch (err) {
              logger.warn('⚠️ Erro ao buscar config de notificações:', err.message);
            }
          }

          let oneSignal = null;
          if (pushAtivado) {
            try {
              const OneSignalService = require('../services/onesignal-service');
              oneSignal = new OneSignalService();
            } catch (err) {
              logger.warn('⚠️ OneSignalService não disponível:', err.message);
            }
          }

          for (const aluno of alunos) {
            try {
              const notificacao = new Notificacao({
                usuarioId: aluno._id,
                tipo: 'sistema',
                titulo: '✏️ Prova Atualizada',
                mensagem: `A prova "${prova.titulo}" foi atualizada. Verifique os detalhes.`,
                icone: '✏️',
                cor: '#ffc107',
                link: `/aluno.html?prova=${provaId}`,
                prioridade: 3,
                dados: {
                  provaId: prova._id,
                  provaTitulo: prova.titulo,
                  tipo: 'prova_atualizada'
                }
              });

              await notificacao.save();

              if (pushAtivado && oneSignal && aluno.onesignalPlayerId) {
                await oneSignal.enviarPush(
                  aluno._id,
                  '✏️ Prova Atualizada',
                  `A prova "${prova.titulo}" foi atualizada`,
                  {
                    tipo: 'prova_atualizada',
                    provaId: prova._id
                  }
                );
              }
            } catch (notifError) {
              logger.error('⚠️ Erro ao notificar aluno:', notifError.message);
            }
          }

          logger.info(`✅ ${alunos.length} alunos notificados sobre atualização da prova`);
        }
      } catch (notifError) {
        logger.error('⚠️ Erro ao notificar alunos:', notifError.message);
      }
    }

    res.json({
      success: true,
      message: 'Prova atualizada com sucesso!',
      prova: {
        id: prova._id,
        titulo: prova.titulo,
        dataLimite: prova.dataLimite,
        horarioInicio: prova.horarioInicio,
        horarioTermino: prova.horarioTermino,
        quantidadeQuestoes: prova.questoes.length
      }
    });

  } catch (error) {
    logger.error('❌ Erro ao editar prova:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno ao editar prova: ' + error.message
    });
  }
});

// ============================================================================
// GET /api/professor/provas/pendentes-correcao
// IMPORTANTE: Esta rota DEVE vir ANTES de GET /provas
// ============================================================================
router.get('/provas/pendentes-correcao', authenticateTokenLocal, verificarProfessor, async (req, res) => {
  try {
    const professorId = req.userId;
    const isAdmin = req.isAdmin;

    logger.info(`📋 Professor ${professorId} solicitando provas pendentes de correção`);

    const query = isAdmin ? { publicada: true } : { userId: professorId, publicada: true };

    const provas = await Prova.find(query)
      .populate('turmaId', 'nome disciplina')
      .populate('userId', 'nome')
      .sort({ createdAt: -1 });

    if (provas.length === 0) {
      return res.json({
        success: true,
        mensagem: 'Você ainda não criou nenhuma prova publicada',
        provasPendentes: [],
        total: 0
      });
    }

    const provasPendentesCorrecao = [];

    for (const prova of provas) {
      const provasRealizadas = await ProvaRealizada.find({
        provaId: prova._id,
        $or: [
          { nota: null },
          { notaLiberada: false }
        ]
      })
        .populate('alunoId', 'nome email matricula')
        .sort({ dataRealizacao: 1 });

      const resultadosPendentes = await Resultado.find({
        provaId: prova._id,
        $or: [
          { nota: null },
          { notaLiberada: false }
        ]
      })
        .populate('userId', 'nome email matricula');

      const todasRealizacoes = [];

      provasRealizadas.forEach(pr => {
        if (!pr.alunoId) return;
        todasRealizacoes.push({
          id: pr._id,
          alunoId: pr.alunoId._id,
          alunoNome: pr.alunoId.nome,
          alunoEmail: pr.alunoId.email,
          alunoMatricula: pr.alunoId.matricula,
          dataRealizacao: pr.dataRealizacao,
          tempoGasto: pr.tempoGasto,
          status: pr.status,
          notaLiberada: pr.notaLiberada,
          tipo: 'prova_realizada'
        });
      });

      resultadosPendentes.forEach(r => {
        if (!r.userId) return;

        const jaExiste = todasRealizacoes.some(tr =>
          tr.alunoId.toString() === r.userId._id.toString()
        );

        if (!jaExiste) {
          todasRealizacoes.push({
            id: r._id,
            alunoId: r.userId._id,
            alunoNome: r.userId.nome,
            alunoEmail: r.userId.email,
            alunoMatricula: r.userId.matricula,
            dataRealizacao: r.createdAt,
            tempoGasto: r.tempoGasto,
            status: 'pendente',
            notaLiberada: r.notaLiberada || false,
            tipo: 'resultado'
          });
        }
      });

      if (todasRealizacoes.length > 0) {
        provasPendentesCorrecao.push({
          provaId: prova._id,
          provaTitulo: prova.titulo,
          provaConteudo: prova.conteudo,
          turma: prova.turmaId ? {
            id: prova.turmaId._id,
            nome: prova.turmaId.nome,
            disciplina: prova.turmaId.disciplina
          } : null,
          quantidadeQuestoes: prova.questoes?.length || 0,
          totalPendentes: todasRealizacoes.length,
          realizacoes: todasRealizacoes
        });
      }
    }

    res.json({
      success: true,
      provasPendentes: provasPendentesCorrecao,
      total: provasPendentesCorrecao.length,
      mensagem: `Encontradas ${provasPendentesCorrecao.length} provas com correções pendentes`
    });

  } catch (error) {
    logger.error('❌ Erro ao buscar provas pendentes de correção:', error);
    logger.error('   Stack:', error.stack);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor: ' + error.message
    });
  }
});

// ============================================================================
// GET /api/professor/provas
// ============================================================================
router.get('/provas', authenticateTokenLocal, verificarProfessor, async (req, res) => {
  try {
    const professorId = req.userId;

    logger.info(`📋 Buscando provas do professor ${professorId}`);

    const mostrarRascunhos = req.query.rascunhos === 'true';

    let query = { userId: professorId };

    if (!mostrarRascunhos) {
      query.publicada = true;
    }

    const provas = await Prova.find(query)
      .populate('turmaId', 'nome disciplina')
      .sort({ createdAt: -1 });

    const provasComEstatisticas = await Promise.all(
      provas.map(async (prova) => {
        if (prova.publicada) {
          const resultados = await Resultado.find({ provaId: prova._id });
          const provasRealizadas = await ProvaRealizada.find({ provaId: prova._id });

          const totalAlunosRealizaram = [...new Set([
            ...resultados.map(r => r.userId.toString()),
            ...provasRealizadas.map(pr => pr.alunoId.toString())
          ])].length;

          let totalNotas = 0;
          let contador = 0;

          resultados.forEach(r => {
            if (r.nota !== undefined && !isNaN(r.nota)) {
              totalNotas += r.nota;
              contador++;
            }
          });

          provasRealizadas.forEach(pr => {
            if (pr.nota !== undefined && !isNaN(pr.nota)) {
              totalNotas += pr.nota;
              contador++;
            }
          });

          const mediaNotas = contador > 0 ? (totalNotas / contador) : 0;

          return {
            id: prova._id,
            titulo: prova.titulo,
            conteudo: prova.conteudo,
            periodo: prova.periodo || '1',
            turma: prova.turmaId ? {
              id: prova.turmaId._id,
              nome: prova.turmaId.nome,
              disciplina: prova.turmaId.disciplina
            } : null,
            quantidadeQuestoes: prova.questoes.length,
            dificuldade: prova.dificuldade,
            dataCriacao: prova.createdAt,
            dataLimite: prova.dataLimite,
            dataPublicacao: prova.dataPublicacao,
            duracao: prova.duracaoMinutos,
            status: prova.status,
            codigo: prova.codigo,
            fonteGeracao: prova.fonteGeracao,
            publicada: prova.publicada,
            enviadaParaAlunos: prova.enviadaParaAlunos,
            statusPublicacao: prova.publicada ? 'Publicada' : 'Rascunho',
            alunosRealizaram: totalAlunosRealizaram,
            totalAlunos: prova.turmaId ? await Turma.findById(prova.turmaId).then(t => t ? t.alunos.length : 0) : 0,
            mediaNotas: parseFloat(mediaNotas.toFixed(1))
          };
        } else {
          return {
            id: prova._id,
            titulo: prova.titulo,
            conteudo: prova.conteudo,
            turma: prova.turmaId ? {
              id: prova.turmaId._id,
              nome: prova.turmaId.nome,
              disciplina: prova.turmaId.disciplina
            } : null,
            quantidadeQuestoes: prova.questoes.length,
            dificuldade: prova.dificuldade,
            dataCriacao: prova.createdAt,
            dataLimite: prova.dataLimite,
            duracao: prova.duracaoMinutos,
            status: prova.status,
            codigo: prova.codigo,
            fonteGeracao: prova.fonteGeracao,
            publicada: prova.publicada,
            statusPublicacao: 'Rascunho',
            alunosRealizaram: 0,
            totalAlunos: prova.turmaId ? await Turma.findById(prova.turmaId).then(t => t ? t.alunos.length : 0) : 0,
            mediaNotas: 0
          };
        }
      })
    );

    const provasFiltradas = mostrarRascunhos
      ? provasComEstatisticas
      : provasComEstatisticas.filter(p => p.publicada);

    res.json({
      success: true,
      provas: provasFiltradas,
      total: provasFiltradas.length,
      totalRascunhos: provasComEstatisticas.filter(p => !p.publicada).length,
      mensagem: `Encontradas ${provasFiltradas.length} provas ${mostrarRascunhos ? '(incluindo rascunhos)' : '(apenas publicadas)'}`
    });

  } catch (error) {
    logger.error('Erro ao buscar provas do professor:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor: ' + error.message
    });
  }
});

// ============================================================================
// POST /api/professor/provas/:provaId/corrigir
// ============================================================================
router.post('/provas/:provaId/corrigir', authenticateTokenLocal, verificarProfessor, async (req, res) => {
  try {
    const provaId = req.params.provaId;
    const professorId = req.userId;
    const { alunoId, nota, liberarNota = true, motivo = null } = req.body;

    logger.info(`📝 Professor ${professorId} corrigindo prova ${provaId} do aluno ${alunoId}`);
    logger.info(`   Nota: ${nota} | Liberar: ${liberarNota} | Motivo: ${motivo || 'nenhum'}`);

    const isAdmin = req.isAdmin;

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

    if (nota === undefined || nota === null) {
      return res.status(400).json({
        success: false,
        error: 'Nota é obrigatória'
      });
    }

    const notaNumber = parseFloat(nota);
    if (isNaN(notaNumber) || notaNumber < 0 || notaNumber > 10) {
      return res.status(400).json({
        success: false,
        error: 'Nota inválida. Deve ser um número entre 0 e 10'
      });
    }

    let provaRealizada = await ProvaRealizada.findOne({ provaId, alunoId });
    let resultado = await Resultado.findOne({ provaId, userId: alunoId });

    if (!provaRealizada && !resultado) {
      return res.status(404).json({
        success: false,
        error: 'Prova do aluno não encontrada'
      });
    }

    const estavaLiberada = (provaRealizada?.notaLiberada === true) || (resultado?.notaLiberada === true);
    const notaAnterior = provaRealizada?.nota ?? resultado?.nota;

    const notaMudou = (notaAnterior !== null && notaAnterior !== undefined) &&
      Math.abs(parseFloat(notaAnterior) - notaNumber) > 0.001;

    logger.info(`   📊 Estado anterior:`);
    logger.info(`      - Estava liberada: ${estavaLiberada}`);
    logger.info(`      - Nota anterior: ${notaAnterior}`);
    logger.info(`      - Nota mudou: ${notaMudou}`);

    if (provaRealizada) {
      provaRealizada.nota = notaNumber;
      provaRealizada.status = 'corrigida';
      provaRealizada.notaLiberada = liberarNota;
      if (motivo) provaRealizada.notaManualObservacao = motivo;
      await provaRealizada.save();
      logger.info(`   ✅ ProvaRealizada atualizada`);
    }

    if (resultado) {
      resultado.nota = notaNumber;
      resultado.notaLiberada = liberarNota;
      resultado.porcentagem = ((notaNumber / 10) * 100).toFixed(1);
      if (motivo) resultado.observacoes = motivo;
      await resultado.save();
      logger.info(`   ✅ Resultado atualizado`);
    }

    if (liberarNota) {
      prova.totalParticipantes = (prova.totalParticipantes || 0) + 1;

      if (prova.mediaNotas) {
        const somaTotal = prova.mediaNotas * (prova.totalParticipantes - 1);
        prova.mediaNotas = (somaTotal + notaNumber) / prova.totalParticipantes;
      } else {
        prova.mediaNotas = notaNumber;
      }

      prova.mediaNotas = parseFloat(prova.mediaNotas.toFixed(2));
      await prova.save();
    }

    if (Notificacao) {
      try {
        const aluno = await User.findById(alunoId).select('nome onesignalPlayerId');
        const professor = await User.findById(professorId).select('nome');

        let pushAtivado = false;
        if (Config) {
          try {
            const configDoc = await Config.findOne({ chave: 'notificacoes' });
            pushAtivado = configDoc?.valor?.push === true;
          } catch (err) {
            logger.warn('⚠️ Erro ao buscar config de notificações:', err.message);
          }
        }

        let oneSignal = null;
        if (pushAtivado) {
          try {
            const OneSignalService = require('../services/onesignal-service');
            oneSignal = new OneSignalService();
          } catch (err) {
            logger.warn('⚠️ OneSignalService não disponível:', err.message);
          }
        }

        if (estavaLiberada && !liberarNota) {
          let titulo, mensagem, icone, cor;

          if (notaMudou) {
            titulo = '🔒 Nota Alterada';
            mensagem = `Sua nota em "${prova.titulo}" foi alterada e está temporariamente oculta. Aguarde nova liberação do professor.`;
            icone = '🔒';
            cor = '#f59e0b';
          } else {
            titulo = '🔒 Nota Ocultada';
            mensagem = `Sua nota em "${prova.titulo}" foi temporariamente ocultada pelo professor. Aguarde nova liberação.`;
            icone = '🔒';
            cor = '#f59e0b';
          }

          const notificacao = new Notificacao({
            usuarioId: alunoId,
            tipo: 'sistema',
            titulo: titulo,
            mensagem: mensagem,
            icone: icone,
            cor: cor,
            link: `/aluno.html`,
            prioridade: 3,
            dados: {
              provaId: prova._id,
              provaTitulo: prova.titulo,
              nota: notaNumber,
              notaAnterior: notaAnterior,
              motivo: motivo || null,
              professor: professor?.nome || 'Professor',
              tipo: 'nota_revogada'
            }
          });

          await notificacao.save();
          logger.info(`   ✅ Aluno ${aluno?.nome || alunoId} notificado sobre REVOGAÇÃO`);

          if (pushAtivado && oneSignal && aluno?.onesignalPlayerId) {
            await oneSignal.enviarPush(
              alunoId,
              titulo,
              mensagem,
              {
                tipo: 'nota_revogada',
                provaId: prova._id,
                nota: notaNumber
              }
            );
          }
        }

        else if (!estavaLiberada && liberarNota) {
          const notificacao = new Notificacao({
            usuarioId: alunoId,
            tipo: 'prova_corrigida',
            titulo: '✅ Prova Corrigida',
            mensagem: `Sua nota na prova "${prova.titulo}" foi liberada: ${notaNumber.toFixed(1)}`,
            icone: '✅',
            cor: '#10b981',
            link: `/aluno.html?prova=${provaId}`,
            prioridade: 4,
            dados: {
              provaId: prova._id,
              provaTitulo: prova.titulo,
              nota: notaNumber,
              professor: professor?.nome || 'Professor',
              tipo: 'nota_liberada'
            }
          });

          await notificacao.save();
          logger.info(`   ✅ Aluno ${aluno?.nome || alunoId} notificado sobre LIBERAÇÃO`);

          if (pushAtivado && oneSignal && aluno?.onesignalPlayerId) {
            await oneSignal.enviarPush(
              alunoId,
              '✅ Prova Corrigida',
              `Sua nota em "${prova.titulo}" foi liberada: ${notaNumber.toFixed(1)}`,
              {
                tipo: 'prova_corrigida',
                provaId: prova._id,
                nota: notaNumber
              }
            );
          }
        }

        else if (estavaLiberada && liberarNota && notaMudou) {
          const notificacao = new Notificacao({
            usuarioId: alunoId,
            tipo: 'sistema',
            titulo: '✏️ Nota Atualizada',
            mensagem: `Sua nota em "${prova.titulo}" foi atualizada: ${notaAnterior.toFixed(1)} → ${notaNumber.toFixed(1)}`,
            icone: '✏️',
            cor: '#3b82f6',
            link: `/aluno.html?prova=${provaId}`,
            prioridade: 4,
            dados: {
              provaId: prova._id,
              provaTitulo: prova.titulo,
              nota: notaNumber,
              notaAnterior: notaAnterior,
              motivo: motivo || null,
              professor: professor?.nome || 'Professor',
              tipo: 'nota_alterada'
            }
          });

          await notificacao.save();
          logger.info(`   ✅ Aluno ${aluno?.nome || alunoId} notificado sobre ALTERAÇÃO`);

          if (pushAtivado && oneSignal && aluno?.onesignalPlayerId) {
            await oneSignal.enviarPush(
              alunoId,
              '✏️ Nota Atualizada',
              `Sua nota em "${prova.titulo}" foi atualizada: ${notaNumber.toFixed(1)}`,
              {
                tipo: 'nota_alterada',
                provaId: prova._id,
                nota: notaNumber,
                notaAnterior: notaAnterior
              }
            );
          }
        }
      } catch (notifError) {
        logger.warn('⚠️ Erro ao notificar aluno:', notifError.message);
      }
    }

    let mensagemResposta = '';
    if (!liberarNota && estavaLiberada) {
      mensagemResposta = notaMudou
        ? 'Nota alterada e ocultada do aluno com sucesso!'
        : 'Nota ocultada do aluno com sucesso!';
    } else if (liberarNota) {
      mensagemResposta = 'Nota corrigida e liberada para o aluno com sucesso!';
    } else {
      mensagemResposta = 'Nota corrigida com sucesso!';
    }

    res.json({
      success: true,
      message: mensagemResposta,
      nota: notaNumber.toFixed(2),
      notaLiberada: liberarNota,
      aluno: {
        id: alunoId,
        nome: provaRealizada?.alunoId?.nome || resultado?.alunoNome || 'Aluno'
      },
      prova: {
        id: prova._id,
        titulo: prova.titulo
      }
    });

  } catch (error) {
    logger.error('❌ Erro ao corrigir prova:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno ao corrigir prova: ' + error.message
    });
  }
});

// ============================================================================
// POST /api/professor/provas/:provaId/liberar-notas
// ============================================================================
router.post('/provas/:provaId/liberar-notas', authenticateTokenLocal, verificarProfessor, async (req, res) => {
  try {
    const provaId = req.params.provaId;
    const professorId = req.userId;
    const isAdmin = req.isAdmin;

    logger.info(`📝 Professor ${professorId} liberando todas as notas da prova ${provaId}`);

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

    const provasRealizadas = await ProvaRealizada.find({
      provaId: provaId,
      nota: { $ne: null },
      notaLiberada: false
    }).populate('alunoId', 'nome onesignalPlayerId');

    const resultados = await Resultado.find({
      provaId: provaId,
      nota: { $ne: null },
      notaLiberada: false
    }).populate('userId', 'nome onesignalPlayerId');

    let contadorProvas = 0;
    for (const pr of provasRealizadas) {
      pr.notaLiberada = true;
      pr.status = 'corrigida';
      await pr.save();
      contadorProvas++;
    }

    let contadorResultados = 0;
    for (const r of resultados) {
      r.notaLiberada = true;
      await r.save();
      contadorResultados++;
    }

    const totalLiberados = contadorProvas + contadorResultados;

    logger.info(`✅ ${totalLiberados} notas liberadas para a prova ${provaId}`);

    if (totalLiberados > 0 && Notificacao) {
      let pushAtivado = false;
      if (Config) {
        try {
          const configDoc = await Config.findOne({ chave: 'notificacoes' });
          pushAtivado = configDoc?.valor?.push === true;
        } catch (err) {
          logger.warn('⚠️ Erro ao buscar config de notificações:', err.message);
        }
      }

      let oneSignal = null;
      if (pushAtivado) {
        try {
          const OneSignalService = require('../services/onesignal-service');
          oneSignal = new OneSignalService();
        } catch (err) {
          logger.warn('⚠️ OneSignalService não disponível:', err.message);
        }
      }

      const todosAlunos = [...provasRealizadas, ...resultados];

      for (const item of todosAlunos) {
        try {
          const alunoId = item.alunoId?._id || item.userId?._id;
          const nota = item.nota;

          if (!alunoId) continue;

          const notificacao = new Notificacao({
            usuarioId: alunoId,
            tipo: 'resultado_liberado',
            titulo: '📊 Resultado Liberado!',
            mensagem: `Sua nota na prova "${prova.titulo}" foi liberada: ${nota.toFixed(2)}`,
            icone: '🎯',
            cor: '#28a745',
            link: `/aluno.html?prova=${provaId}`,
            prioridade: 4,
            dados: {
              provaId: prova._id,
              provaTitulo: prova.titulo,
              nota: nota
            }
          });

          await notificacao.save();

          if (pushAtivado && oneSignal) {
            const playerId = item.alunoId?.onesignalPlayerId || item.userId?.onesignalPlayerId;
            if (playerId) {
              await oneSignal.enviarPush(
                alunoId,
                '📊 Resultado Liberado!',
                `Sua nota em "${prova.titulo}" foi liberada: ${nota.toFixed(2)}`,
                {
                  tipo: 'resultado_liberado',
                  provaId: prova._id,
                  nota: nota
                }
              );
            }
          }
        } catch (notifError) {
          logger.error('⚠️ Erro ao notificar aluno:', notifError.message);
        }
      }

      logger.info(`✅ ${todosAlunos.length} alunos notificados sobre liberação de notas`);
    }

    res.json({
      success: true,
      message: `Notas liberadas para ${totalLiberados} alunos!`,
      totalLiberados: totalLiberados,
      provasLiberadas: contadorProvas,
      resultadosLiberados: contadorResultados,
      prova: {
        id: prova._id,
        titulo: prova.titulo,
        totalParticipantes: prova.totalParticipantes || 0
      }
    });

  } catch (error) {
    logger.error('❌ Erro ao liberar notas:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno ao liberar notas: ' + error.message
    });
  }
});

// ============================================================================
// POST /api/professor/provas/:provaId/nota-manual
// ============================================================================
router.post('/provas/:provaId/nota-manual', authenticateTokenLocal, verificarProfessor, async (req, res) => {
  try {
    const { provaId } = req.params;
    const { alunoId, nota, observacao } = req.body;
    const professorId = req.userId;
    const isAdmin = req.isAdmin;

    logger.info(`📝 Professor ${professorId} atribuindo NOTA MANUAL para prova ${provaId}, aluno ${alunoId}, nota: ${nota}`);

    const notaNumber = parseFloat(nota);
    if (isNaN(notaNumber) || notaNumber < 0 || notaNumber > 10) {
      return res.status(400).json({
        success: false,
        error: 'Nota inválida. Deve ser entre 0 e 10'
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

    const aluno = await User.findById(alunoId);
    if (!aluno) {
      return res.status(404).json({
        success: false,
        error: 'Aluno não encontrado'
      });
    }

    let turma = null;
    let alunoNaTurma = false;

    if (prova.turmaId) {
      turma = await Turma.findById(prova.turmaId);

      if (turma) {
        logger.info(`🔍 Verificando turma: ${turma.nome}`);

        if (turma.alunos) {
          alunoNaTurma = turma.alunos.some(a => a.toString() === alunoId);
        }

        logger.info(`   Aluno ${aluno.nome} está na turma? ${alunoNaTurma ? 'SIM ✅' : 'NÃO ❌'}`);

        if (!alunoNaTurma) {
          logger.info(`➕ Adicionando aluno ${aluno.nome} (${alunoId}) à turma ${turma.nome}...`);

          turma.alunos = turma.alunos || [];
          turma.alunos.push(alunoId);
          await turma.save();

          alunoNaTurma = true;
          logger.info(`✅ Aluno adicionado à turma com sucesso!`);
          logger.info(`   Agora a turma tem ${turma.alunos.length} alunos`);
        }
      } else {
        logger.info(`⚠️ Turma não encontrada para a prova`);
      }
    }

    const totalQuestoes = prova.questoes.length;
    const acertos = Math.round((notaNumber / 10) * totalQuestoes);

    const resultadoDetalhadoManual = [];
    for (let i = 0; i < totalQuestoes; i++) {
      resultadoDetalhadoManual.push({
        questaoNumero: i + 1,
        pergunta: prova.questoes[i]?.pergunta || 'Questão não disponível',
        respostaAluno: `Prova Impressa - Correção Manual`,
        respostaCorreta: prova.questoes[i]?.respostaCorreta !== undefined
          ? ['A', 'B', 'C', 'D', 'E'][prova.questoes[i].respostaCorreta]
          : 'Não disponível',
        correto: false,
        explicacao: `Nota ${notaNumber} atribuída manualmente. Observação: ${observacao || 'Nenhuma'}`,
        tipo: 'manual'
      });
    }

    let provaRealizada = await ProvaRealizada.findOne({ provaId, alunoId });

    const dataAgora = new Date();

    if (provaRealizada) {
      logger.info(`📝 ProvaRealizada existente encontrada para aluno ${aluno.nome}`);

      provaRealizada.notaManual = notaNumber;
      provaRealizada.notaManualLiberada = true;
      provaRealizada.notaManualObservacao = observacao || `Nota manual atribuída em ${dataAgora.toLocaleDateString('pt-BR')}`;
      provaRealizada.notaManualData = dataAgora;
      provaRealizada.notaManualAtribuidaPor = professorId;
      provaRealizada.resultadoDetalhadoManual = resultadoDetalhadoManual;
      provaRealizada.status = 'corrigida';
      provaRealizada.tipoNota = provaRealizada.nota !== null && provaRealizada.nota !== undefined ? 'ambas' : 'manual';

      await provaRealizada.save();
      logger.info(`✅ ProvaRealizada atualizada com nota manual: ${notaNumber}`);
    } else {
      logger.info(`📝 Criando nova ProvaRealizada para aluno ${aluno.nome}`);

      const novaProvaRealizada = new ProvaRealizada({
        provaId: provaId,
        alunoId: alunoId,
        respostas: [],
        nota: null,
        notaManual: notaNumber,
        notaManualLiberada: true,
        notaManualObservacao: observacao || `Nota manual atribuída em ${dataAgora.toLocaleDateString('pt-BR')}`,
        notaManualData: dataAgora,
        notaManualAtribuidaPor: professorId,
        resultadoDetalhadoManual: resultadoDetalhadoManual,
        tempoGasto: 0,
        dataRealizacao: dataAgora,
        status: 'corrigida',
        notaLiberada: false,
        resultadoDetalhado: [],
        tipoNota: 'manual',
        origem: 'manual_impressa'
      });

      provaRealizada = await novaProvaRealizada.save();
      logger.info(`✅ Nova ProvaRealizada criada com nota manual: ${notaNumber}`);
    }

    const todasProvasRealizadas = await ProvaRealizada.find({ provaId });

    let somaNotasAutomaticas = 0;
    let somaNotasManuais = 0;
    let totalNotasAutomaticas = 0;
    let totalNotasManuais = 0;

    todasProvasRealizadas.forEach(pr => {
      if (pr.nota !== null && pr.nota !== undefined && !isNaN(pr.nota)) {
        somaNotasAutomaticas += pr.nota;
        totalNotasAutomaticas++;
      }
      if (pr.notaManual !== null && pr.notaManual !== undefined && !isNaN(pr.notaManual)) {
        somaNotasManuais += pr.notaManual;
        totalNotasManuais++;
      }
    });

    prova.mediaNotasAutomaticas = totalNotasAutomaticas > 0 ? somaNotasAutomaticas / totalNotasAutomaticas : 0;
    prova.mediaNotasManuais = totalNotasManuais > 0 ? somaNotasManuais / totalNotasManuais : 0;

    let totalNotas = 0;
    let countNotas = 0;

    if (totalNotasAutomaticas > 0) {
      totalNotas += somaNotasAutomaticas;
      countNotas += totalNotasAutomaticas;
    }
    if (totalNotasManuais > 0) {
      totalNotas += somaNotasManuais;
      countNotas += totalNotasManuais;
    }

    prova.mediaGeral = countNotas > 0 ? totalNotas / countNotas : 0;
    await prova.save();

    logger.info(`📊 Estatísticas atualizadas:`);
    logger.info(`   - Média automática: ${prova.mediaNotasAutomaticas.toFixed(2)} (${totalNotasAutomaticas} alunos)`);
    logger.info(`   - Média manual: ${prova.mediaNotasManuais.toFixed(2)} (${totalNotasManuais} alunos)`);
    logger.info(`   - Média geral: ${prova.mediaGeral.toFixed(2)} (${countNotas} notas)`);

    if (Notificacao) {
      try {
        const notificacao = new Notificacao({
          usuarioId: alunoId,
          tipo: 'sistema',
          titulo: '📝 Nota da Prova Impressa Liberada!',
          mensagem: `Sua nota da prova impressa "${prova.titulo}" foi registrada: ${notaNumber.toFixed(1)}`,
          icone: '📝',
          cor: '#f59e0b',
          link: `/aluno.html?prova=${provaId}`,
          prioridade: 4,
          dados: {
            provaId: prova._id,
            provaTitulo: prova.titulo,
            nota: notaNumber,
            tipo: 'manual'
          }
        });

        await notificacao.save();
        logger.info(`✅ Notificação salva para aluno ${aluno.nome}`);

      } catch (notifError) {
        logger.error('⚠️ Erro ao notificar aluno:', notifError.message);
      }
    }

    res.json({
      success: true,
      message: `Nota manual ${notaNumber.toFixed(1)} registrada para ${aluno.nome}!`,
      notaManual: notaNumber,
      provaRealizada: {
        id: provaRealizada._id,
        notaAutomatica: provaRealizada.nota,
        notaManual: provaRealizada.notaManual,
        tipoNota: provaRealizada.tipoNota
      },
      alunoAdicionado: !alunoNaTurma ? true : false,
      turma: turma ? {
        id: turma._id,
        nome: turma.nome,
        totalAlunos: turma.alunos.length
      } : null
    });

  } catch (error) {
    logger.error('❌ Erro ao atribuir nota manual:', error);
    logger.error('Stack trace:', error.stack);
    res.status(500).json({
      success: false,
      error: 'Erro interno ao atribuir nota manual: ' + error.message
    });
  }
});

// ============================================================================
// GET /api/professor/resultados
// ============================================================================
router.get('/resultados', authenticateTokenLocal, verificarProfessor, async (req, res) => {
  try {
    const professorId = req.userId;

    logger.info(`📊 Professor ${professorId} buscando resultados (ProvaRealizada + Resultado)`);

    const provas = await Prova.find({ userId: professorId })
      .populate('turmaId', 'nome disciplina')
      .lean();

    if (!provas || provas.length === 0) {
      return res.json({
        success: true,
        mensagem: 'Você ainda não criou nenhuma prova',
        resultados: [],
        estatisticas: {
          totalProvas: 0,
          totalAlunos: 0,
          mediaGeral: '0.0',
          taxaConclusao: 0
        }
      });
    }

    const resultadosCompletos = [];
    let totalAlunos = 0;
    let somaNotas = 0;
    let contadorNotas = 0;
    const alunosProcessados = new Set();

    for (const prova of provas) {
      const provasRealizadas = await ProvaRealizada.find({ provaId: prova._id })
        .populate('alunoId', 'nome email matricula')
        .lean();

      const resultados = await Resultado.find({ provaId: prova._id })
        .populate('userId', 'nome email matricula')
        .lean();

      logger.info(`   Prova "${prova.titulo}": ${provasRealizadas.length} em ProvaRealizada + ${resultados.length} em Resultado`);

      for (const pr of provasRealizadas) {
        if (!pr.alunoId) {
          logger.warn(`⚠️ ProvaRealizada ${pr._id} sem referência de aluno`);
          continue;
        }

        const alunoId = pr.alunoId._id.toString();

        const notaFinal = pr.notaManual !== null ? pr.notaManual : pr.nota;
        const notaLiberada = pr.notaManualLiberada || pr.notaLiberada;
        const tipoNota = pr.tipoNota || (pr.notaManual !== null ? 'manual' : 'automatica');

        if (!alunosProcessados.has(`${prova._id}-${alunoId}`)) {
          alunosProcessados.add(`${prova._id}-${alunoId}`);

          const totalQuestoes = prova.questoes?.length || 0;
          const acertos = notaFinal !== null ? Math.round((notaFinal / 10) * totalQuestoes) : 0;
          const porcentagem = notaFinal !== null ? ((acertos / totalQuestoes) * 100).toFixed(1) : '0.0';

          resultadosCompletos.push({
            provaId: prova._id,
            provaTitulo: prova.titulo || 'Sem título',
            provaConteudo: prova.conteudo || '',
            provaDataLimite: prova.dataLimite,
            periodo: prova.periodo || '1',
            turmaId: prova.turmaId?._id,
            turmaNome: prova.turmaId?.nome || 'Turma não especificada',
            turmaDisciplina: prova.turmaId?.disciplina || '',
            alunoId: alunoId,
            alunoNome: pr.alunoId.nome || 'Aluno não identificado',
            alunoEmail: pr.alunoId.email || '',
            alunoMatricula: pr.alunoId.matricula || '',
            nota: notaFinal,
            notaAutomatica: pr.nota,
            notaManual: pr.notaManual,
            tipoNota: tipoNota,
            acertos: acertos,
            total: totalQuestoes,
            porcentagem: porcentagem,
            tempoGasto: pr.tempoGasto || 0,
            dataEntrega: pr.dataRealizacao,
            notaLiberada: notaLiberada,
            status: pr.status || (notaFinal !== null ? 'corrigida' : 'pendente'),
            cancelada: pr.cancelada || false,
            origem: 'prova_realizada',
            id: pr._id
          });

          if (notaFinal !== null && !isNaN(notaFinal)) {
            totalAlunos++;
            somaNotas += notaFinal;
            contadorNotas++;
          }
        }
      }

      for (const r of resultados) {
        if (!r.userId) {
          logger.warn(`⚠️ Resultado ${r._id} sem referência de usuário`);
          continue;
        }

        const alunoId = r.userId._id.toString();

        const notaFinal = r.nota;
        const notaLiberada = r.notaLiberada;

        if (!alunosProcessados.has(`${prova._id}-${alunoId}`)) {
          alunosProcessados.add(`${prova._id}-${alunoId}`);

          const totalQuestoes = prova.questoes?.length || r.total || 0;
          const acertos = r.acertos || (notaFinal !== null ? Math.round((notaFinal / 10) * totalQuestoes) : 0);
          const porcentagem = notaFinal !== null ? ((acertos / totalQuestoes) * 100).toFixed(1) : '0.0';

          resultadosCompletos.push({
            provaId: prova._id,
            provaTitulo: prova.titulo || 'Sem título',
            provaConteudo: prova.conteudo || '',
            provaDataLimite: prova.dataLimite,
            periodo: prova.periodo || '1',
            turmaId: prova.turmaId?._id,
            turmaNome: prova.turmaId?.nome || 'Turma não especificada',
            turmaDisciplina: prova.turmaId?.disciplina || '',
            alunoId: alunoId,
            alunoNome: r.userId.nome || 'Aluno não identificado',
            alunoEmail: r.userId.email || '',
            alunoMatricula: r.userId.matricula || '',
            nota: notaFinal,
            notaAutomatica: notaFinal,
            notaManual: null,
            tipoNota: 'automatica',
            acertos: acertos,
            total: totalQuestoes,
            porcentagem: porcentagem,
            tempoGasto: r.tempoGasto || 0,
            dataEntrega: r.dataRealizacao || r.createdAt,
            notaLiberada: notaLiberada,
            status: r.status || (notaFinal !== null ? 'corrigida' : 'pendente'),
            cancelada: r.cancelada || false,
            origem: 'resultado',
            id: r._id
          });

          if (notaFinal !== null && !isNaN(notaFinal)) {
            totalAlunos++;
            somaNotas += notaFinal;
            contadorNotas++;
          }
        }
      }
    }

    const totalAlunosUnicos = alunosProcessados.size;
    const mediaGeral = contadorNotas > 0 ? (somaNotas / contadorNotas).toFixed(1) : '0.0';
    const taxaConclusao = totalAlunosUnicos > 0
      ? Math.round((totalAlunos / totalAlunosUnicos) * 100)
      : 0;

    const estatisticas = {
      totalProvas: provas.length,
      totalAlunos: totalAlunosUnicos,
      mediaGeral: mediaGeral,
      taxaConclusao: taxaConclusao,
      totalNotasManuais: resultadosCompletos.filter(r => r.tipoNota === 'manual').length,
      totalNotasAutomaticas: resultadosCompletos.filter(r => r.tipoNota === 'automatica').length,
      provas: provas.map(prova => ({
        id: prova._id,
        titulo: prova.titulo || 'Sem título',
        totalQuestoes: prova.questoes?.length || 0,
        dificuldade: prova.dificuldade || 'media',
        dataLimite: prova.dataLimite
      }))
    };

    logger.info(`✅ Resultados carregados: ${resultadosCompletos.length} registros`);

    return res.json({
      success: true,
      resultados: resultadosCompletos,
      estatisticas: estatisticas,
      mensagem: `Encontrados ${resultadosCompletos.length} resultados (${estatisticas.totalNotasManuais} manuais, ${estatisticas.totalNotasAutomaticas} automáticas)`
    });

  } catch (error) {
    logger.error('❌ Erro crítico ao buscar resultados:', error);
    logger.error('Stack:', error.stack);

    return res.status(500).json({
      success: false,
      error: 'Erro interno ao buscar resultados: ' + error.message,
      detalhes: process.env.NODE_ENV === 'development' ? {
        stack: error.stack,
        name: error.name
      } : undefined
    });
  }
});

// ============================================================================
// GET /api/professor/resultados/notas-alunos
// ============================================================================
router.get('/resultados/notas-alunos', authenticateTokenLocal, verificarProfessor, async (req, res) => {
  try {
    const professorId = req.userId;

    const { turmaId, disciplina, periodo, status } = req.query;

    let query = {};

    if (turmaId && turmaId !== '') {
      query.turmaId = turmaId;
    }

    const turmasQuery = { professorId };
    if (turmaId) turmasQuery._id = turmaId;

    const turmas = await Turma.find(turmasQuery).select('_id');
    const turmasIds = turmas.map(t => t._id);

    if (turmasIds.length === 0) {
      return res.json({ success: true, resultados: [] });
    }

    query.turmaId = { $in: turmasIds };

    if (periodo && periodo !== '') {
      const dias = parseInt(periodo);
      const dataLimite = new Date();
      dataLimite.setDate(dataLimite.getDate() - dias);
      query.dataRealizacao = { $gte: dataLimite };
    }

    const resultados = await Resultado.find(query)
      .populate('alunoId', 'nome email matricula')
      .populate('provaId', 'titulo disciplina')
      .populate('turmaId', 'nome disciplina')
      .sort({ dataRealizacao: -1 });

    const resultadosFormatados = resultados.map(r => ({
      alunoId: r.alunoId?._id,
      alunoNome: r.alunoId?.nome,
      alunoEmail: r.alunoId?.email,
      alunoMatricula: r.alunoId?.matricula,
      provaId: r.provaId?._id,
      provaTitulo: r.provaId?.titulo,
      turmaId: r.turmaId?._id,
      turmaNome: r.turmaId?.nome,
      turmaDisciplina: r.turmaId?.disciplina,
      disciplina: r.provaId?.disciplina || r.turmaId?.disciplina,
      dataRealizacao: r.dataRealizacao,
      nota: r.nota,
      acertos: r.acertos,
      total: r.total,
      status: r.status,
      notaLiberada: r.notaLiberada,
      cancelada: r.cancelada
    }));

    res.json({
      success: true,
      resultados: resultadosFormatados,
      total: resultadosFormatados.length
    });

  } catch (error) {
    logger.error('Erro ao buscar notas:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// GET /api/professor/provas/:provaId/cancelamento-detailed
// ============================================================================
router.get('/provas/:provaId/cancelamento-detailed', authenticateTokenLocal, verificarProfessor, async (req, res) => {
  try {
    const provaId = req.params.provaId;
    const alunoId = req.query.alunoId;

    const prova = await Prova.findById(provaId);
    if (!prova) {
      return res.status(404).json({
        success: false,
        error: 'Prova não encontrada'
      });
    }

    if (prova.userId.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        error: 'Você não tem permissão para acessar os detalhes desta prova'
      });
    }

    if (!alunoId) {
      return res.status(400).json({
        success: false,
        error: 'ID do aluno não especificado'
      });
    }

    const provaRealizada = await ProvaRealizada.findOne({
      provaId: provaId,
      alunoId: alunoId,
      $or: [
        { status: 'cancelada' },
        { cancelada: true }
      ]
    })
      .populate('provaId', 'titulo conteudo dataLimite userId')
      .populate('alunoId', 'nome email matricula');

    const resultado = await Resultado.findOne({
      provaId: provaId,
      userId: alunoId,
      $or: [
        { status: 'cancelada' },
        { cancelada: true }
      ]
    })
      .populate('provaId', 'titulo conteudo dataLimite userId');

    if (!provaRealizada && !resultado) {
      return res.status(404).json({
        success: false,
        error: 'Prova cancelada não encontrada para este aluno'
      });
    }

    const dadosCancelamento = provaRealizada || resultado;
    const aluno = provaRealizada?.alunoId || await User.findById(alunoId);

    const motivo = dadosCancelamento.motivoCancelamento || '';
    const tipoInfo = determinarTipoCancelamento(
      motivo,
      dadosCancelamento.flagViolacao,
      dadosCancelamento.estatisticasCancelamento
    );

    let estatisticas = dadosCancelamento.estatisticasCancelamento || {};

    if (!estatisticas.timestamp && dadosCancelamento.createdAt) {
      estatisticas.timestamp = dadosCancelamento.createdAt;
    }

    const professor = await User.findById(req.userId).select('nome email');

    const detalhes = {
      success: true,
      tipo: 'cancelada',
      tipoCancelamento: tipoInfo.tipo,
      tituloStatus: tipoInfo.tituloStatus,
      icone: tipoInfo.icone,
      corPrincipal: tipoInfo.corPrincipal,
      corFundo: tipoInfo.corFundo,
      prova: {
        id: prova?._id,
        titulo: prova?.titulo || 'Prova não encontrada',
        conteudo: prova?.conteudo || 'Conteúdo não especificado',
        dataLimite: prova?.dataLimite,
        professorNome: professor?.nome
      },
      aluno: {
        id: alunoId,
        nome: aluno?.nome || 'Aluno',
        email: aluno?.email || 'Não informado',
        matricula: aluno?.matricula || 'Não informada'
      },
      cancelamento: {
        motivo: motivo,
        data: dadosCancelamento.dataRealizacao || dadosCancelamento.createdAt,
        nota: dadosCancelamento.nota || 0,
        tempoGasto: dadosCancelamento.tempoGasto || 0,
        respostas: dadosCancelamento.respostas || [],
        historico: dadosCancelamento.historicoEventos || []
      },
      estatisticas: estatisticas,
      professor: professor ? {
        nome: professor.nome,
        email: professor.email
      } : null,
      logTimestamp: estatisticas.timestamp || new Date().toISOString(),
      mensagem: tipoInfo.tipo === 'violacao'
        ? 'Esta prova foi cancelada por violação das regras estabelecidas para realização da avaliação.'
        : 'Esta prova foi cancelada automaticamente por expiração do prazo de entrega.',
      recomendacao: tipoInfo.tipo === 'violacao'
        ? `O aluno ${aluno?.nome || 'não identificado'} violou as regras da prova. Recomende ao aluno que respeite as normas nas próximas avaliações.`
        : `O aluno ${aluno?.nome || 'não identificado'} não realizou a prova dentro do prazo. Considere ajustar os prazos ou entrar em contato com o aluno.`,
      informacoesTecnicas: {
        dataRealizacao: dadosCancelamento.dataRealizacao,
        duracaoProva: prova?.duracao,
        totalQuestoes: prova?.quantidadeQuestoes,
        porcentagemRealizada: dadosCancelamento.respostas ?
          Math.round((dadosCancelamento.respostas.filter(r => r !== null && r !== undefined).length / prova?.quantidadeQuestoes) * 100) : 0
      }
    };

    res.json(detalhes);

  } catch (error) {
    logger.error('❌ Erro ao buscar detalhes de cancelamento (professor):', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno ao buscar detalhes do cancelamento: ' + error.message
    });
  }
});

// ============================================================================
// DELETE /api/professor/provas/:provaId
// ============================================================================
router.delete('/provas/:provaId', authenticateTokenLocal, verificarProfessor, async (req, res) => {
  try {
    const provaId = req.params.provaId;
    const usuarioId = req.userId;
    const usuarioRole = req.userRole;
    const isAdmin = req.isAdmin;

    logger.info(`🗑️ Tentativa de exclusão da prova ${provaId} pelo usuário ${usuarioId} (${usuarioRole})`);

    const prova = await Prova.findById(provaId);
    if (!prova) {
      return res.status(404).json({
        success: false,
        error: 'Prova não encontrada'
      });
    }

    const isProfessorDaProva = prova.userId && prova.userId.toString() === usuarioId;

    if (!isAdmin && !isProfessorDaProva) {
      return res.status(403).json({
        success: false,
        error: 'Apenas professores (da prova) ou administradores podem excluir provas'
      });
    }

    const totalResultados = await Resultado.countDocuments({ provaId: provaId });
    const totalProvasRealizadas = await ProvaRealizada.countDocuments({ provaId: provaId });

    logger.info(`📊 Prova "${prova.titulo}" tem ${totalResultados} resultados e ${totalProvasRealizadas} provas realizadas`);

    if (totalResultados > 0) {
      await Resultado.deleteMany({ provaId: provaId });
      logger.info(`✅ ${totalResultados} resultados excluídos`);
    }

    if (totalProvasRealizadas > 0) {
      await ProvaRealizada.deleteMany({ provaId: provaId });
      logger.info(`✅ ${totalProvasRealizadas} provas realizadas excluídas`);
    }

    if (prova.turmaId) {
      await Turma.updateOne(
        { _id: prova.turmaId },
        { $pull: { provas: provaId } }
      );
      logger.info(`✅ Prova removida da turma ${prova.turmaId}`);
    }

    await Prova.deleteOne({ _id: provaId });

    logger.info(`✅ Prova ${provaId} excluída com sucesso`);

    res.json({
      success: true,
      message: `Prova "${prova.titulo}" excluída com sucesso!`,
      estatisticas: {
        provaExcluida: prova.titulo,
        resultadosExcluidos: totalResultados,
        provasRealizadasExcluidas: totalProvasRealizadas
      }
    });

  } catch (error) {
    logger.error('❌ Erro ao excluir prova:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno ao excluir prova: ' + error.message
    });
  }
});

// ============================================================================
// GET /api/professor/notificacoes/cancelamentos
// ============================================================================
router.get('/notificacoes/cancelamentos', authenticateTokenLocal, verificarProfessor, async (req, res) => {
  try {
    const professorId = req.userId;

    const provas = await Prova.find({ userId: professorId });
    const provaIds = provas.map(p => p._id);

    const vinteQuatroHorasAtras = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const provasCanceladas = await ProvaRealizada.find({
      provaId: { $in: provaIds },
      status: 'cancelada',
      dataRealizacao: { $gte: vinteQuatroHorasAtras }
    })
      .populate('alunoId', 'nome email')
      .populate('provaId', 'titulo')
      .sort({ dataRealizacao: -1 })
      .limit(10);

    const cancelamentosFormatados = provasCanceladas.map(pc => ({
      id: pc._id,
      alunoId: pc.alunoId?._id,
      alunoNome: pc.alunoId?.nome || 'Aluno',
      alunoEmail: pc.alunoId?.email || '',
      provaId: pc.provaId?._id,
      provaTitulo: pc.provaId?.titulo || 'Prova',
      motivo: pc.motivoCancelamento || 'Violação das regras',
      estatisticas: pc.estatisticasCancelamento || {},
      nota: pc.nota,
      dataCancelamento: pc.dataRealizacao,
      visualizada: pc.visualizada || false
    }));

    res.json({
      success: true,
      cancelamentos: cancelamentosFormatados,
      total: cancelamentosFormatados.length,
      mensagem: cancelamentosFormatados.length > 0 ?
        `${cancelamentosFormatados.length} prova(s) cancelada(s) nas últimas 24 horas` :
        'Nenhuma prova cancelada recentemente'
    });

  } catch (error) {
    logger.error('❌ Erro ao buscar notificações de cancelamento:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno: ' + error.message
    });
  }
});

// ============================================================================
// EXPORTAR ROUTER
// ============================================================================
module.exports = router;