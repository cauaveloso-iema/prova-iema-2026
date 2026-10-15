// ============================================================================
// AEE - ATENDIMENTO EDUCACIONAL ESPECIALIZADO - EducaPleno
// ============================================================================
// Descrição: Rotas exclusivas do módulo AEE do Setor Pedagógico.
//
// Rotas:
//   - GET  /api/aee/health
//   - GET  /api/aee/dashboard
//   - GET  /api/aee/alunos
//   - GET  /api/aee/alunos/:id
//   - POST /api/aee/alunos/:id/condicao
//   - PUT  /api/aee/alunos/:id/condicao
//   - GET  /api/aee/provas
//   - GET  /api/aee/provas/:id
//   - GET  /api/aee/relatorio
//   - GET  /api/aee/relatorio/turma/:turma
//   - GET  /api/aee/relatorio/aluno/:id
//   - POST /api/aee/relatorio/exportar
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
  console.warn('[aee] Model Prova não disponível:', err.message);
}

let Turma = null;
try {
  Turma = require('../models/Turma');
} catch (err) {
  console.warn('[aee] Model Turma não disponível:', err.message);
}

let Resultado = null;
try {
  Resultado = mongoose.model('Resultado');
} catch (err) {
  console.warn('[aee] Model Resultado não disponível:', err.message);
}

// ============================================================================
// FUNÇÕES AUXILIARES
// ============================================================================

function obterLabelCondicao(condicao) {
  const labels = {
    'visual': 'Deficiência Visual',
    'auditiva': 'Deficiência Auditiva',
    'motora': 'Deficiência Motora',
    'intelectual': 'Deficiência Intelectual',
    'dislexia': 'Dislexia',
    'tdah': 'TDAH',
    'tea': 'Transtorno do Espectro Autista (TEA)',
    'altas_habilidades': 'Altas Habilidades/Superdotação',
    'deficiencia_multipla': 'Deficiência Múltipla',
    'surdocegueira': 'Surdocegueira',
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
    { valor: 'tea', label: 'Transtorno do Espectro Autista (TEA)' },
    { valor: 'altas_habilidades', label: 'Altas Habilidades/Superdotação' },
    { valor: 'deficiencia_multipla', label: 'Deficiência Múltipla' },
    { valor: 'surdocegueira', label: 'Surdocegueira' },
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
      req.userEmail = decoded.email;
      req.tokenTemp = true;
      return next();
    }

    try {
      const user = await User.findById(decoded.id).select('tokenVersion email');
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

      req.userEmail = user.email;
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

const verificarPermissaoAEE = async (req, res, next) => {
  try {
    // Admin e super_admin sempre têm acesso
    if (req.userRole === 'admin' || req.userRole === 'super_admin') {
      req.isAEE = true;
      return next();
    }

    // Apenas setor_pedagogico pode acessar
    if (req.userRole !== 'setor_pedagogico') {
      return res.status(403).json({
        success: false,
        error: 'Acesso negado. Apenas o Setor Pedagógico pode acessar o AEE.'
      });
    }

    // Verificar permissão específica do módulo AEE
    let PermissaoModulo;
    try {
      PermissaoModulo = require('../models/PermissaoModulo');
    } catch (e) {
      return res.status(500).json({ success: false, error: 'Model PermissaoModulo não encontrado' });
    }

    const permissao = await PermissaoModulo.findOne({
      modulo: 'aee_setor_pedagogico',
      ativo: true
    });

    if (!permissao) {
      return res.status(403).json({
        success: false,
        error: 'Módulo AEE não configurado'
      });
    }

    const emailNormalizado = (req.userEmail || '').trim().toLowerCase();
    const emailsAutorizados = (permissao.emailsAutorizados || []).map(e => (e || '').trim().toLowerCase());

    if (!emailsAutorizados.includes(emailNormalizado)) {
      return res.status(403).json({
        success: false,
        error: 'Acesso negado ao módulo AEE'
      });
    }

    req.isAEE = true;
    next();
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ============================================================================
// HEALTH CHECK
// ============================================================================
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'online',
    service: 'AEE - Atendimento Educacional Especializado',
    models: {
      Prova: !!Prova,
      Turma: !!Turma,
      Resultado: !!Resultado
    }
  });
});

// ============================================================================
// GET /api/aee/dashboard
// Dashboard do AEE
// ============================================================================
router.get('/dashboard', authenticateTokenLocal, verificarPermissaoAEE, async (req, res) => {
  try {
    logger.info(`📋 AEE - Dashboard acessado por ${req.userId}`);

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
        acessibilidadeAprovadaPor: { $exists: false }
      }),
      User.countDocuments({
        role: 'aluno',
        precisaAcessibilidade: true,
        ativo: true,
        acessibilidadeAprovadaPor: { $exists: true }
      })
    ]);

    const taxaAcessibilidade = totalAlunos > 0
      ? ((totalAlunosComAcessibilidade / totalAlunos) * 100).toFixed(1)
      : 0;

    // Distribuição por tipo de condição
    const distribuicaoCondicoes = await User.aggregate([
      { $match: { role: 'aluno', precisaAcessibilidade: true, ativo: true } },
      { $group: { _id: '$condicaoAcessibilidade', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // Distribuição por turma
    const distribuicaoTurmas = await User.aggregate([
      { $match: { role: 'aluno', precisaAcessibilidade: true, ativo: true } },
      { $group: { _id: '$turma', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    // Alunos recentes (últimos cadastros com acessibilidade)
    const alunosRecentes = await User.find({
      role: 'aluno',
      precisaAcessibilidade: true,
      ativo: true
    })
      .select('nome matricula turma condicaoAcessibilidade dataSolicitacaoAcessibilidade')
      .sort({ dataSolicitacaoAcessibilidade: -1, createdAt: -1 })
      .limit(5)
      .lean();

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
        distribuicaoCondicoes: distribuicaoCondicoes.map(c => ({
          condicao: c._id || 'não especificada',
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
          condicao: obterLabelCondicao(a.condicaoAcessibilidade),
          dataSolicitacao: a.dataSolicitacaoAcessibilidade
        }))
      }
    });

  } catch (error) {
    logger.error('❌ Erro no dashboard do AEE:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// GET /api/aee/alunos
// Listar alunos com necessidades de acessibilidade (AEE)
// ============================================================================
router.get('/alunos', authenticateTokenLocal, verificarPermissaoAEE, async (req, res) => {
  try {
    const { condicao, turma, curso, status, busca, page = 1, limit = 50 } = req.query;

    let query = {
      role: 'aluno',
      precisaAcessibilidade: true,
      ativo: true
    };

    if (condicao && condicao !== 'todos') query.condicaoAcessibilidade = condicao;
    if (turma) query.turma = turma;
    if (curso) query.curso = curso;

    if (status === 'aprovada') {
      query.acessibilidadeAprovadaPor = { $exists: true };
    } else if (status === 'pendente') {
      query.acessibilidadeAprovadaPor = { $exists: false };
    }

    if (busca) {
      query.$or = [
        { nome: { $regex: busca, $options: 'i' } },
        { matricula: { $regex: busca, $options: 'i' } },
        { email: { $regex: busca, $options: 'i' } }
      ];
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

    // Filtros disponíveis
    const turmas = await User.distinct('turma', {
      role: 'aluno', ativo: true,
      turma: { $ne: null, $exists: true, $ne: '' }
    });

    const cursos = await User.distinct('curso', {
      role: 'aluno',
      curso: { $ne: null, $exists: true, $ne: '' }
    });

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
        turmas: turmas.filter(t => t).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })),
        cursos: cursos.filter(c => c)
      }
    });

  } catch (error) {
    logger.error('❌ Erro ao listar alunos do AEE:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// GET /api/aee/alunos/:id
// Detalhes de um aluno específico (AEE)
// ============================================================================
router.get('/alunos/:id', authenticateTokenLocal, verificarPermissaoAEE, async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ success: false, error: 'ID inválido' });
    }

    const aluno = await User.findOne({ _id: id, role: 'aluno' })
      .select('nome email matricula turma curso condicaoAcessibilidade outraCondicao dataSolicitacaoAcessibilidade acessibilidadeAprovadaPor preferenciasNotificacao fotoPerfil')
      .lean();

    if (!aluno) {
      return res.status(404).json({ success: false, error: 'Aluno não encontrado' });
    }

    let provasRealizadas = [];
    if (Resultado) {
      const resultados = await Resultado.find({ userId: id })
        .populate('provaId', 'titulo tipoProva adaptada')
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();

      provasRealizadas = resultados.map(r => ({
        provaId: r.provaId?._id,
        provaTitulo: r.provaId?.titulo,
        tipoProva: r.provaId?.tipoProva,
        adaptada: r.provaId?.adaptada,
        nota: r.nota,
        dataRealizacao: r.createdAt,
        notaLiberada: r.notaLiberada
      }));
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
        fotoPerfil: aluno.fotoPerfil,
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
    logger.error('❌ Erro ao buscar detalhes do aluno AEE:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// POST /api/aee/alunos/:id/condicao
// Criar/atualizar condição de acessibilidade do aluno
// ============================================================================
router.post('/alunos/:id/condicao', authenticateTokenLocal, verificarPermissaoAEE, async (req, res) => {
  try {
    const { id } = req.params;
    const { condicao, outraCondicao, aprovada } = req.body;

    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ success: false, error: 'ID inválido' });
    }

    if (!condicao) {
      return res.status(400).json({ success: false, error: 'Condição é obrigatória' });
    }

    const condicoesValidas = obterListaCondicoes().map(c => c.valor);
    if (!condicoesValidas.includes(condicao)) {
      return res.status(400).json({ success: false, error: 'Condição inválida' });
    }

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
      .select('nome email matricula turma curso condicaoAcessibilidade outraCondicao acessibilidadeAprovadaPor');

    if (!aluno) {
      return res.status(404).json({ success: false, error: 'Aluno não encontrado' });
    }

    logger.info(`✅ Condição AEE atualizada para aluno ${aluno.nome}: ${condicao}`);

    res.json({
      success: true,
      message: 'Condição de acessibilidade atualizada',
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
    logger.error('❌ Erro ao atualizar condição AEE:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// PUT /api/aee/alunos/:id/condicao
// ============================================================================
router.put('/alunos/:id/condicao', authenticateTokenLocal, verificarPermissaoAEE, async (req, res) => {
  try {
    const { id } = req.params;
    const { condicao, outraCondicao, aprovada } = req.body;

    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ success: false, error: 'ID inválido' });
    }

    const updateData = {};

    if (condicao) {
      const condicoesValidas = obterListaCondicoes().map(c => c.valor);
      if (!condicoesValidas.includes(condicao)) {
        return res.status(400).json({ success: false, error: 'Condição inválida' });
      }
      updateData.condicaoAcessibilidade = condicao;
      updateData.outraCondicao = condicao === 'outra' ? (outraCondicao || '') : '';
    }

    if (aprovada === true) {
      updateData.acessibilidadeAprovadaPor = req.userId;
      updateData.acessibilidadeAprovadaEm = new Date();
    } else if (aprovada === false) {
      updateData.acessibilidadeAprovadaPor = undefined;
      updateData.acessibilidadeAprovadaEm = undefined;
    }

    const aluno = await User.findByIdAndUpdate(id, updateData, { new: true })
      .select('nome email matricula turma curso condicaoAcessibilidade outraCondicao acessibilidadeAprovadaPor');

    if (!aluno) {
      return res.status(404).json({ success: false, error: 'Aluno não encontrado' });
    }

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
    logger.error('❌ Erro ao atualizar condição AEE:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// GET /api/aee/provas
// Listar provas (todas, mas com foco nas adaptadas)
// ============================================================================
router.get('/provas', authenticateTokenLocal, verificarPermissaoAEE, async (req, res) => {
  try {
    if (!Prova) {
      return res.status(503).json({ success: false, error: 'Módulo de provas indisponível' });
    }

    const { turma, tipo, page = 1, limit = 50 } = req.query;

    let query = { publicada: true };

    // tipo === 'adaptada' → só adaptadas
    // tipo === 'todas' ou ausente → todas
    if (tipo === 'adaptada') {
      query.$or = [
        { tipoProva: 'adaptada' },
        { adaptada: true },
        { alternativas: 3 }
      ];
    }

    if (turma) query.turmaId = turma;

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
      const isAdaptada = prova.tipoProva === 'adaptada'
        || prova.adaptada === true
        || prova.alternativas === 3;

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
    logger.error('❌ Erro ao listar provas do AEE:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// GET /api/aee/provas/:id
// Visualizar prova completa (para impressão)
// ============================================================================
router.get('/provas/:id', authenticateTokenLocal, verificarPermissaoAEE, async (req, res) => {
  try {
    if (!Prova) {
      return res.status(503).json({ success: false, error: 'Módulo de provas indisponível' });
    }

    const provaId = req.params.id;

    const prova = await Prova.findById(provaId)
      .populate('turmaId', 'nome disciplina codigo')
      .populate('userId', 'nome email')
      .lean();

    if (!prova) {
      return res.status(404).json({ success: false, error: 'Prova não encontrada' });
    }

    const isAdaptada = prova.tipoProva === 'adaptada'
      || prova.adaptada === true
      || prova.alternativas === 3;

    const questoes = (prova.questoes || []).map((q, index) => ({
      numero: index + 1,
      pergunta: q.pergunta,
      opcoes: q.opcoes,
      respostaCorreta: null, // Não mostrar gabarito na visualização
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
        questoes,
        configuracaoImpressao: {
          mostrarGabarito: false,
          cabecalho: `Prova ${isAdaptada ? 'Adaptada' : 'Normal'} - ${prova.titulo}`,
          rodape: `Código: ${prova.codigo} | Turma: ${prova.turmaId?.nome || 'Não especificada'}`
        }
      }
    });

  } catch (error) {
    logger.error('❌ Erro ao visualizar prova no AEE:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// GET /api/aee/relatorio
// Gerar relatório geral de alunos com acessibilidade
// ============================================================================
router.get('/relatorio', authenticateTokenLocal, verificarPermissaoAEE, async (req, res) => {
  try {
    const { turma, curso, condicao, status } = req.query;

    let query = {
      role: 'aluno',
      precisaAcessibilidade: true,
      ativo: true
    };

    if (condicao && condicao !== 'todos') query.condicaoAcessibilidade = condicao;
    if (turma) query.turma = turma;
    if (curso) query.curso = curso;

    if (status === 'aprovada') {
      query.acessibilidadeAprovadaPor = { $exists: true };
    } else if (status === 'pendente') {
      query.acessibilidadeAprovadaPor = { $exists: false };
    }

    const alunos = await User.find(query)
      .select('nome email matricula turma curso condicaoAcessibilidade outraCondicao dataSolicitacaoAcessibilidade acessibilidadeAprovadaPor')
      .sort({ turma: 1, nome: 1 })
      .lean();

    // Agrupar por turma
    const porTurma = {};
    alunos.forEach(aluno => {
      const turmaNome = aluno.turma || 'Sem turma';
      if (!porTurma[turmaNome]) porTurma[turmaNome] = [];
      porTurma[turmaNome].push({
        id: aluno._id,
        nome: aluno.nome,
        matricula: aluno.matricula,
        condicao: obterLabelCondicao(aluno.condicaoAcessibilidade),
        condicaoTipo: aluno.condicaoAcessibilidade,
        detalhes: aluno.outraCondicao,
        dataSolicitacao: aluno.dataSolicitacaoAcessibilidade,
        status: aluno.acessibilidadeAprovadaPor ? 'aprovada' : 'pendente'
      });
    });

    // Estatísticas por condição
    const porCondicao = {};
    alunos.forEach(aluno => {
      const cond = aluno.condicaoAcessibilidade || 'nao_especificada';
      const label = obterLabelCondicao(cond);
      porCondicao[label] = (porCondicao[label] || 0) + 1;
    });

    const aprovados = alunos.filter(a => a.acessibilidadeAprovadaPor).length;
    const pendentes = alunos.length - aprovados;

    res.json({
      success: true,
      relatorio: {
        dataGeracao: new Date(),
        totalAlunos: alunos.length,
        totalAprovados: aprovados,
        totalPendentes: pendentes,
        porCondicao: Object.entries(porCondicao).map(([cond, count]) => ({
          condicao: cond,
          total: count
        })),
        porTurma: Object.entries(porTurma).map(([turmaNome, alunosLista]) => ({
          turma: turmaNome,
          total: alunosLista.length,
          alunos: alunosLista
        }))
      }
    });

  } catch (error) {
    logger.error('❌ Erro ao gerar relatório AEE:', error);
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
      role: 'aluno',
      precisaAcessibilidade: true,
      ativo: true,
      turma: turma
    })
      .select('nome email matricula curso condicaoAcessibilidade outraCondicao dataSolicitacaoAcessibilidade acessibilidadeAprovadaPor')
      .sort({ nome: 1 })
      .lean();

    const alunosFormatados = alunos.map(aluno => ({
      id: aluno._id,
      nome: aluno.nome,
      email: aluno.email,
      matricula: aluno.matricula,
      curso: aluno.curso,
      condicao: obterLabelCondicao(aluno.condicaoAcessibilidade),
      condicaoTipo: aluno.condicaoAcessibilidade,
      detalhes: aluno.outraCondicao,
      status: aluno.acessibilidadeAprovadaPor ? 'aprovada' : 'pendente'
    }));

    res.json({
      success: true,
      turma,
      total: alunos.length,
      alunos: alunosFormatados
    });

  } catch (error) {
    logger.error('❌ Erro ao gerar relatório por turma:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// GET /api/aee/relatorio/aluno/:id
// ============================================================================
router.get('/relatorio/aluno/:id', authenticateTokenLocal, verificarPermissaoAEE, async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ success: false, error: 'ID inválido' });
    }

    const aluno = await User.findOne({ _id: id, role: 'aluno' })
      .select('nome email matricula turma curso condicaoAcessibilidade outraCondicao dataSolicitacaoAcessibilidade acessibilidadeAprovadaPor')
      .lean();

    if (!aluno) {
      return res.status(404).json({ success: false, error: 'Aluno não encontrado' });
    }

    let provas = [];
    if (Resultado) {
      const resultados = await Resultado.find({ userId: id })
        .populate('provaId', 'titulo tipoProva adaptada codigo')
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();

      provas = resultados.map(r => ({
        provaTitulo: r.provaId?.titulo,
        provaCodigo: r.provaId?.codigo,
        tipoProva: r.provaId?.tipoProva,
        adaptada: r.provaId?.adaptada,
        nota: r.nota,
        data: r.createdAt
      }));
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
    logger.error('❌ Erro ao gerar relatório do aluno:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// POST /api/aee/relatorio/exportar
// Exportar relatório em CSV
// ============================================================================
router.post('/relatorio/exportar', authenticateTokenLocal, verificarPermissaoAEE, async (req, res) => {
  try {
    const { formato = 'csv', filtros = {} } = req.body;

    let query = {
      role: 'aluno',
      precisaAcessibilidade: true,
      ativo: true
    };

    if (filtros.condicao && filtros.condicao !== 'todos') query.condicaoAcessibilidade = filtros.condicao;
    if (filtros.turma) query.turma = filtros.turma;
    if (filtros.curso) query.curso = filtros.curso;

    const alunos = await User.find(query)
      .select('nome email matricula turma curso condicaoAcessibilidade outraCondicao dataSolicitacaoAcessibilidade acessibilidadeAprovadaPor')
      .sort({ turma: 1, nome: 1 })
      .lean();

    if (formato === 'csv') {
      let csv = 'Turma,Nome,Matrícula,Email,Curso,Condição,Detalhes,Status,Data Solicitação\n';

      alunos.forEach(aluno => {
        const status = aluno.acessibilidadeAprovadaPor ? 'Aprovada' : 'Pendente';
        const dataSolicitacao = aluno.dataSolicitacaoAcessibilidade
          ? new Date(aluno.dataSolicitacaoAcessibilidade).toLocaleDateString('pt-BR')
          : '';

        csv += [
          `"${(aluno.turma || 'Sem turma').replace(/"/g, '""')}"`,
          `"${(aluno.nome || '').replace(/"/g, '""')}"`,
          `"${(aluno.matricula || '').replace(/"/g, '""')}"`,
          `"${(aluno.email || '').replace(/"/g, '""')}"`,
          `"${(aluno.curso || '').replace(/"/g, '""')}"`,
          `"${obterLabelCondicao(aluno.condicaoAcessibilidade).replace(/"/g, '""')}"`,
          `"${(aluno.outraCondicao || '').replace(/"/g, '""')}"`,
          `"${status}"`,
          `"${dataSolicitacao}"`
        ].join(',') + '\n';
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=aee_relatorio_${new Date().toISOString().split('T')[0]}.csv`);
      res.send('\uFEFF' + csv);
    } else {
      res.json({
        success: true,
        formato: 'json',
        total: alunos.length,
        alunos: alunos.map(a => ({
          nome: a.nome,
          matricula: a.matricula,
          turma: a.turma,
          condicao: obterLabelCondicao(a.condicaoAcessibilidade),
          status: a.acessibilidadeAprovadaPor ? 'aprovada' : 'pendente'
        }))
      });
    }

  } catch (error) {
    logger.error('❌ Erro ao exportar relatório AEE:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// EXPORTAR ROUTER
// ============================================================================
module.exports = router;