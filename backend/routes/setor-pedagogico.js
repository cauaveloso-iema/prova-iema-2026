// ============================================================================
// SETOR PEDAGÓGICO - EducaPleno
// ============================================================================
// Descrição: Todas as rotas relacionadas ao Setor Pedagógico.
//
// Rotas incluídas:
//   - GET /api/setor-pedagogico/health
//   - GET /api/setor-pedagogico/dashboard
//   - GET /api/setor-pedagogico/alunos-acessibilidade
//   - GET /api/setor-pedagogico/aluno/:id
//   - GET /api/setor-pedagogico/provas
//   - GET /api/setor-pedagogico/provas/:id/visualizar
//   - GET /api/setor-pedagogico/relatorio/acessibilidade
//
// Autor: Equipe de Desenvolvimento
// ============================================================================

const express = require('express');
const router = express.Router();
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
  console.warn('[setor-pedagogico] Model Prova não disponível:', err.message);
}

let Turma = null;
try {
  Turma = require('../models/Turma');
} catch (err) {
  console.warn('[setor-pedagogico] Model Turma não disponível:', err.message);
}

let Resultado = null;
try {
  Resultado = mongoose.model('Resultado');
} catch (err) {
  console.warn('[setor-pedagogico] Model Resultado não disponível:', err.message);
}

let Eixo = null;
try {
  Eixo = require('../models/Eixo');
} catch (err) {
  console.warn('[setor-pedagogico] Model Eixo não disponível:', err.message);
}

let Curso = null;
try {
  Curso = require('../models/Cursos');
} catch (err) {
  console.warn('[setor-pedagogico] Model Curso não disponível:', err.message);
}

// ============================================================================
// FUNÇÕES AUXILIARES PARA LABELS DE CONDIÇÕES
// ============================================================================

function obterLabelCondicao(condicao) {
  const labels = {
    'visual': 'Deficiência Visual',
    'auditiva': 'Deficiência Auditiva',
    'motora': 'Deficiência Motora',
    'intelectual': 'Deficiência Intelectual',
    'dislexia': 'Dislexia',
    'tdah': 'TDAH',
    'outra': 'Outra Condição',
    null: 'Não especificada',
    'nao_especificada': 'Não especificada'
  };
  return labels[condicao] || 'Condição Especial';
}

function obterListaCondicoes() {
  return [
    { valor: 'visual', label: 'Deficiência Visual' },
    { valor: 'auditiva', label: 'Deficiência Auditiva' },
    { valor: 'motora', label: 'Deficiência Motora' },
    { valor: 'intelectual', label: 'Deficiência Intelectual' },
    { valor: 'dislexia', label: 'Dislexia' },
    { valor: 'tdah', label: 'TDAH' },
    { valor: 'outra', label: 'Outra Condição' }
  ];
}

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

const verificarPermissaoSetorPedagogicoLocal = (req, res, next) => {
  const allowedRoles = ['setor_pedagogico', 'admin', 'super_admin'];

  if (!allowedRoles.includes(req.userRole)) {
    return res.status(403).json({
      success: false,
      error: 'Acesso negado. Apenas o Setor Pedagógico pode acessar esta área.'
    });
  }

  // Marcar no req que é do setor pedagógico (útil para filtros)
  req.isSetorPedagogico = true;
  next();
};

// ============================================================================
// HEALTH CHECK
// ============================================================================
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'online',
    service: 'Setor Pedagógico',
    models: {
      Prova: !!Prova,
      Turma: !!Turma,
      Resultado: !!Resultado,
      Eixo: !!Eixo,
      Curso: !!Curso
    }
  });
});

// ============================================================================
// GET /api/setor-pedagogico/dashboard
// Dashboard do setor pedagógico
// ============================================================================
router.get('/dashboard', authenticateTokenLocal, verificarPermissaoSetorPedagogicoLocal, async (req, res) => {
  try {
    logger.info(`📋 Setor Pedagógico ${req.userId} acessando dashboard`);

    // Estatísticas gerais
    const [totalAlunos, totalAlunosComAcessibilidade, totalProfessores, totalTurmas, totalProvas] = await Promise.all([
      User.countDocuments({ role: 'aluno', ativo: true }),
      User.countDocuments({ role: 'aluno', precisaAcessibilidade: true, ativo: true }),
      User.countDocuments({ role: 'professor', ativo: true }),
      Turma.countDocuments({ ativa: true }),
      Prova.countDocuments({ publicada: true })
    ]);

    // Proporção de alunos com acessibilidade
    const taxaAcessibilidade = totalAlunos > 0
      ? ((totalAlunosComAcessibilidade / totalAlunos) * 100).toFixed(1)
      : 0;

    // Distribuição por tipo de condição
    const distribuicaoCondicoes = await User.aggregate([
      { $match: { role: 'aluno', precisaAcessibilidade: true, ativo: true } },
      { $group: { _id: '$condicaoAcessibilidade', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    res.json({
      success: true,
      dashboard: {
        totalAlunos,
        totalAlunosComAcessibilidade,
        taxaAcessibilidade: parseFloat(taxaAcessibilidade),
        totalProfessores,
        totalTurmas,
        totalProvas,
        distribuicaoCondicoes: distribuicaoCondicoes.map(c => ({
          condicao: c._id || 'não especificada',
          label: obterLabelCondicao(c._id),
          count: c.count
        }))
      }
    });

  } catch (error) {
    logger.error('❌ Erro no dashboard do setor pedagógico:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// GET /api/setor-pedagogico/alunos-acessibilidade
// Listar alunos com necessidades de acessibilidade (dados para AEE)
// ============================================================================
router.get('/alunos-acessibilidade', authenticateTokenLocal, verificarPermissaoSetorPedagogicoLocal, async (req, res) => {
  try {
    const { condicao, turma, curso, page = 1, limit = 20 } = req.query;

    let query = {
      role: 'aluno',
      precisaAcessibilidade: true,
      ativo: true
    };

    if (condicao && condicao !== 'todos') {
      query.condicaoAcessibilidade = condicao;
    }

    if (turma) {
      query.turma = turma;
    }

    if (curso) {
      query.curso = curso;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [alunos, total] = await Promise.all([
      User.find(query)
        .select('nome email matricula turma curso condicaoAcessibilidade outraCondicao dataSolicitacaoAcessibilidade acessibilidadeAprovadaPor')
        .sort({ nome: 1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      User.countDocuments(query)
    ]);

    // Buscar turmas para filtro
    const turmas = await Turma.find({ ativa: true }).select('nome codigo').lean();

    // Buscar cursos distintos
    const cursos = await User.distinct('curso', { role: 'aluno', curso: { $ne: null } });

    const alunosFormatados = alunos.map(aluno => ({
      id: aluno._id,
      nome: aluno.nome,
      email: aluno.email,
      matricula: aluno.matricula || 'Não informada',
      turma: aluno.turma,
      curso: aluno.curso,
      condicao: {
        tipo: aluno.condicaoAcessibilidade,
        label: obterLabelCondicao(aluno.condicaoAcessibilidade),
        descricao: aluno.outraCondicao || null
      },
      dataSolicitacao: aluno.dataSolicitacaoAcessibilidade,
      status: aluno.acessibilidadeAprovadaPor ? 'aprovada' : 'pendente'
    }));

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
        condicoes: obterListaCondicoes(),
        turmas: turmas.map(t => ({ id: t._id, nome: t.nome, codigo: t.codigo })),
        cursos: cursos.filter(c => c)
      }
    });

  } catch (error) {
    logger.error('❌ Erro ao listar alunos com acessibilidade:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// GET /api/setor-pedagogico/aluno/:id
// Detalhes de um aluno específico (para AEE/psicopedagogo)
// ============================================================================
router.get('/aluno/:id', authenticateTokenLocal, verificarPermissaoSetorPedagogicoLocal, async (req, res) => {
  try {
    const { id } = req.params;

    const aluno = await User.findOne({ _id: id, role: 'aluno' })
      .select('nome email matricula turma curso condicaoAcessibilidade outraCondicao dataSolicitacaoAcessibilidade acessibilidadeAprovadaPor preferenciasNotificacao')
      .lean();

    if (!aluno) {
      return res.status(404).json({
        success: false,
        error: 'Aluno não encontrado'
      });
    }

    // Buscar provas realizadas pelo aluno (apenas para ver desempenho)
    const resultados = await Resultado.find({ userId: id })
      .populate('provaId', 'titulo tipoProva adaptada')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    const provasRealizadas = resultados.map(r => ({
      provaId: r.provaId?._id,
      provaTitulo: r.provaId?.titulo,
      tipoProva: r.provaId?.tipoProva,
      adaptada: r.provaId?.adaptada,
      nota: r.nota,
      dataRealizacao: r.createdAt,
      notaLiberada: r.notaLiberada
    }));

    res.json({
      success: true,
      aluno: {
        id: aluno._id,
        nome: aluno.nome,
        email: aluno.email,
        matricula: aluno.matricula,
        turma: aluno.turma,
        curso: aluno.curso,
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
        preferenciasNotificacao: aluno.preferenciasNotificacao,
        provasRealizadas
      }
    });

  } catch (error) {
    logger.error('❌ Erro ao buscar detalhes do aluno:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// GET /api/setor-pedagogico/provas
// Listar provas (com foco em provas adaptadas e impressão)
// ============================================================================
router.get('/provas', authenticateTokenLocal, verificarPermissaoSetorPedagogicoLocal, async (req, res) => {
  try {
    const { tipo, turma, status, page = 1, limit = 20 } = req.query;

    let query = { publicada: true };

    if (tipo === 'adaptada') {
      query.$or = [
        { tipoProva: 'adaptada' },
        { adaptada: true },
        { alternativas: 3 }
      ];
    } else if (tipo === 'normal') {
      query.tipoProva = { $ne: 'adaptada' };
      query.adaptada = { $ne: true };
    }

    if (turma) {
      query.turmaId = turma;
    }

    if (status === 'ativa') {
      query.status = 'ativa';
    } else if (status === 'encerrada') {
      query.dataLimite = { $lt: new Date() };
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

    // Buscar turmas para filtro
    const turmas = await Turma.find({ ativa: true }).select('nome disciplina').lean();

    const provasFormatadas = provas.map(prova => {
      const isAdaptada = prova.tipoProva === 'adaptada' || prova.adaptada === true;

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
        horarioInicio: prova.horarioInicio,
        horarioTermino: prova.horarioTermino,
        publicada: prova.publicada,
        status: prova.status
      };
    });

    res.json({
      success: true,
      provas: provasFormatadas,
      total,
      paginacao: {
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      },
      filtros: {
        turmas: turmas.map(t => ({ id: t._id, nome: t.nome, disciplina: t.disciplina }))
      }
    });

  } catch (error) {
    logger.error('❌ Erro ao listar provas:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// GET /api/setor-pedagogico/provas/:id/visualizar
// Visualizar prova completa (para impressão)
// ============================================================================
router.get('/provas/:id/visualizar', authenticateTokenLocal, verificarPermissaoSetorPedagogicoLocal, async (req, res) => {
  try {
    const provaId = req.params.id;

    const prova = await Prova.findById(provaId)
      .populate('turmaId', 'nome disciplina codigo')
      .populate('userId', 'nome email')
      .lean();

    if (!prova) {
      return res.status(404).json({
        success: false,
        error: 'Prova não encontrada'
      });
    }

    const isAdaptada = prova.tipoProva === 'adaptada' || prova.adaptada === true;

    // Formatar questões para impressão
    const questoes = prova.questoes.map((q, index) => ({
      numero: index + 1,
      pergunta: q.pergunta,
      opcoes: q.opcoes,
      respostaCorreta: isAdaptada ? null : String.fromCharCode(65 + q.respostaCorreta),
      explicacao: q.explicacao
    }));

    res.json({
      success: true,
      prova: {
        id: prova._id,
        titulo: prova.titulo,
        codigo: prova.codigo,
        conteudo: prova.conteudo,
        tipo: isAdaptada ? 'adaptada' : (prova.tipoProva || 'normal'),
        alternativas: isAdaptada ? 3 : (prova.alternativas || 5),
        quantidadeQuestoes: prova.questoes.length,
        turma: prova.turmaId ? {
          nome: prova.turmaId.nome,
          disciplina: prova.turmaId.disciplina,
          codigo: prova.turmaId.codigo
        } : null,
        professor: prova.userId?.nome || 'Professor',
        dataCriacao: prova.createdAt,
        dataLimite: prova.dataLimite,
        duracaoMinutos: prova.duracaoMinutos,
        questoes: questoes,
        // Para impressão em PDF
        configuracaoImpressao: {
          mostrarGabarito: false, // Não mostrar gabarito na impressão para alunos
          mostrarRespostas: false,
          cabecalho: `Prova ${isAdaptada ? 'Adaptada' : 'Normal'} - ${prova.titulo}`,
          rodape: `Código: ${prova.codigo} | Turma: ${prova.turmaId?.nome || 'Não especificada'}`
        }
      }
    });

  } catch (error) {
    logger.error('❌ Erro ao visualizar prova:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// GET /api/setor-pedagogico/relatorio/acessibilidade
// Gerar relatório de alunos com acessibilidade (para impressão/PDF)
// ============================================================================
router.get('/relatorio/acessibilidade', authenticateTokenLocal, verificarPermissaoSetorPedagogicoLocal, async (req, res) => {
  try {
    const { turma, curso, condicao, formato = 'json' } = req.query;

    let query = {
      role: 'aluno',
      precisaAcessibilidade: true,
      ativo: true
    };

    if (condicao && condicao !== 'todos') {
      query.condicaoAcessibilidade = condicao;
    }

    if (turma) {
      query.turma = turma;
    }

    if (curso) {
      query.curso = curso;
    }

    const alunos = await User.find(query)
      .select('nome email matricula turma curso condicaoAcessibilidade outraCondicao dataSolicitacaoAcessibilidade')
      .sort({ turma: 1, nome: 1 })
      .lean();

    // Agrupar por turma
    const porTurma = {};
    alunos.forEach(aluno => {
      const turmaNome = aluno.turma || 'Sem turma';
      if (!porTurma[turmaNome]) {
        porTurma[turmaNome] = [];
      }
      porTurma[turmaNome].push({
        nome: aluno.nome,
        matricula: aluno.matricula,
        condicao: obterLabelCondicao(aluno.condicaoAcessibilidade),
        detalhes: aluno.outraCondicao,
        dataSolicitacao: aluno.dataSolicitacaoAcessibilidade
      });
    });

    // Estatísticas por condição
    const porCondicao = {};
    alunos.forEach(aluno => {
      const cond = aluno.condicaoAcessibilidade || 'nao_especificada';
      const label = obterLabelCondicao(cond);
      if (!porCondicao[label]) {
        porCondicao[label] = 0;
      }
      porCondicao[label]++;
    });

    res.json({
      success: true,
      relatorio: {
        dataGeracao: new Date(),
        totalAlunos: alunos.length,
        porCondicao: Object.entries(porCondicao).map(([cond, count]) => ({ condicao: cond, total: count })),
        porTurma: Object.entries(porTurma).map(([turmaNome, alunosLista]) => ({
          turma: turmaNome,
          total: alunosLista.length,
          alunos: alunosLista
        }))
      }
    });

  } catch (error) {
    logger.error('❌ Erro ao gerar relatório:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// EXPORTAR ROUTER
// ============================================================================
module.exports = router;