// ============================================================================
// TURMAS - EducaPleno
// ============================================================================
// Descrição: Rotas gerais de turmas (usadas por alunos, professores).
//
// ⚠️ IMPORTANTE: As rotas ADMIN de turmas (CRUD, alunos) já estão em
//    routes/admin.js. Aqui só ficam as rotas de uso geral/professor/aluno.
//
// Rotas incluídas:
//   - GET    /api/turmas              - Listar turmas do usuário logado
//   - POST   /api/turmas              - Criar turma (professor/admin)
//   - POST   /api/turmas/entrar       - Aluno entra por código
//   - GET    /api/turmas/:id          - Buscar turma específica
//   - DELETE /api/turmas/:id          - Excluir turma (professor/admin)
//   - GET    /api/turmas/:id/alunos   - Listar alunos da turma
//   - GET    /api/turmas/:id/provas   - Listar provas da turma
//   - POST   /api/turmas/:id/prova-v2 - Criar prova com IA (Groq)
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
  console.warn('[turmas] Model Prova não disponível:', err.message);
}

let Turma = null;
try {
  Turma = require('../models/Turma');
} catch (err) {
  console.warn('[turmas] Model Turma não disponível:', err.message);
}

let Eixo = null;
try {
  Eixo = require('../models/Eixo');
} catch (err) {
  console.warn('[turmas] Model Eixo não disponível:', err.message);
}

let Curso = null;
try {
  Curso = require('../models/Cursos');
} catch (err) {
  console.warn('[turmas] Model Curso não disponível:', err.message);
}

let Resultado = null;
try {
  Resultado = mongoose.model('Resultado');
} catch (err) {
  console.warn('[turmas] Model Resultado não disponível:', err.message);
}

let ProvaRealizada = null;
try {
  ProvaRealizada = mongoose.model('ProvaRealizada');
} catch (err) {
  console.warn('[turmas] Model ProvaRealizada não disponível:', err.message);
}

let Config = null;
try {
  Config = mongoose.model('Config');
} catch (err) {
  console.warn('[turmas] Model Config não disponível:', err.message);
}

let Notificacao = null;
try {
  Notificacao = mongoose.model('Notificacao');
} catch (err) {
  console.warn('[turmas] Model Notificacao não disponível:', err.message);
}

// ============================================================================
// MULTER PARA UPLOAD DA CRIAÇÃO DE PROVAS
// ============================================================================

const multer = require('multer');

const uploadStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) return cb(null, true);
    cb(new Error('Tipo de arquivo não permitido'));
  }
});

const uploadMultiple = upload.fields([
  { name: 'arquivos', maxCount: 10 },
  { name: 'imagens', maxCount: 10 }
]);

// ============================================================================
// GROQ (IA) - Instância local
// ============================================================================

let groq = null;
try {
  const Groq = require('groq-sdk');
  if (process.env.GROQ_API_KEY) {
    groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
} catch (err) {
  console.warn('[turmas] Groq SDK não disponível:', err.message);
}

// ============================================================================
// MIDDLEWARES LOCAIS
// ============================================================================

const authenticateTokenLocal = (req, res, next) => {
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
    next();
  });
};

// ============================================================================
// FUNÇÃO AUXILIAR: processar anexos para IA
// ============================================================================
async function processarAnexosParaIA(anexos) {
  try {
    if (!anexos || anexos.length === 0) {
      return "Nenhum anexo fornecido.";
    }

    let contextoFormatado = `## 📎 ANEXOS:\n\n`;

    for (let i = 0; i < anexos.length; i++) {
      const anexo = anexos[i];
      contextoFormatado += `### ANEXO ${i + 1}: ${anexo.titulo || 'Sem título'}\n`;
      contextoFormatado += `- **Tipo:** ${anexo.tipo}\n`;

      if (anexo.tipo === 'texto' && anexo.conteudo) {
        const conteudoLimitado = anexo.conteudo.length > 5000
          ? anexo.conteudo.substring(0, 5000) + "... [truncado]"
          : anexo.conteudo;
        contextoFormatado += `- **Conteúdo:**\n${conteudoLimitado}\n\n`;
      } else {
        contextoFormatado += `- **Arquivo:** ${anexo.nomeArquivo}\n\n`;
      }
    }

    return contextoFormatado;
  } catch (error) {
    logger.error('❌ Erro ao processar anexos:', error);
    return "Erro ao processar anexos.";
  }
}

// ============================================================================
// HEALTH CHECK
// ============================================================================
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'online',
    service: 'Turmas',
    models: {
      Turma: !!Turma,
      Prova: !!Prova,
      Eixo: !!Eixo,
      Curso: !!Curso,
      Resultado: !!Resultado,
      ProvaRealizada: !!ProvaRealizada,
      Config: !!Config,
      Notificacao: !!Notificacao,
      Groq: !!groq
    }
  });
});

// ============================================================================
// ⚠️ ROTAS ESPECÍFICAS (SEM :id) — DEVEM VIR ANTES DE /:id
// ============================================================================

// ============================================================================
// POST /api/turmas/entrar - Aluno entra na turma por código
// ============================================================================
router.post('/entrar', authenticateTokenLocal, async (req, res) => {
  try {
    const { codigo } = req.body;

    if (!codigo) {
      return res.status(400).json({
        success: false,
        error: 'Código da turma é obrigatório'
      });
    }

    const turma = await Turma.findOne({ codigo: codigo.toUpperCase() });

    if (!turma) {
      return res.status(404).json({
        success: false,
        error: 'Turma não encontrada'
      });
    }

    if (turma.alunos.includes(req.userId)) {
      return res.status(400).json({
        success: false,
        error: 'Você já está nesta turma'
      });
    }

    turma.alunos.push(req.userId);
    await turma.save();

    res.json({
      success: true,
      message: 'Entrou na turma com sucesso',
      turma: {
        id: turma._id,
        nome: turma.nome,
        disciplina: turma.disciplina,
        codigo: turma.codigo
      }
    });

  } catch (error) {
    logger.error('Erro ao entrar na turma:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao entrar na turma'
    });
  }
});

// ============================================================================
// GET /api/turmas - Listar turmas do usuário logado
// ============================================================================
router.get('/', authenticateTokenLocal, async (req, res) => {
  try {
    let query = {};
    let eixoDoAluno = null;

    if (req.userRole === 'professor') {
      query.professorId = req.userId;
    } else if (req.userRole === 'aluno') {
      const aluno = await User.findById(req.userId).select('curso');

      if (aluno && aluno.curso) {
        const curso = await Curso.findOne({ nome: aluno.curso }).populate('eixoId');
        if (curso && curso.eixoId) {
          eixoDoAluno = curso.eixoId.nome;
          logger.info(`🎯 Eixo do aluno: ${eixoDoAluno}`);
        }
      }

      query.alunos = req.userId;
    }

    const turmas = await Turma.find(query)
      .populate('professorId', 'nome email')
      .populate('alunos', 'nome email')
      .sort({ createdAt: -1 });

    const turmasComInfo = await Promise.all(turmas.map(async (t) => {
      let eixoInfo = null;

      if (t.eixo) {
        const eixo = await Eixo.findOne({ nome: t.eixo });
        if (eixo) {
          eixoInfo = {
            id: eixo._id,
            nome: eixo.nome,
            label: eixo.label,
            cor: eixo.cor,
            icone: eixo.icone
          };
        }
      }

      return {
        id: t._id,
        nome: t.nome,
        disciplina: t.disciplina,
        descricao: t.descricao,
        codigo: t.codigo,
        eixo: t.eixo,
        eixoInfo: eixoInfo,
        professor: t.professorId ? {
          id: t.professorId._id,
          nome: t.professorId.nome,
          email: t.professorId.email
        } : null,
        totalAlunos: t.alunos ? t.alunos.length : 0,
        totalProvas: t.provas ? t.provas.length : 0,
        dataCriacao: t.createdAt || t.dataCriacao,
        ativa: t.ativa !== false,
        isDoEixoDoAluno: eixoDoAluno ? t.eixo === eixoDoAluno : false
      };
    }));

    res.json({
      success: true,
      turmas: turmasComInfo
    });

  } catch (error) {
    logger.error('❌ Erro ao listar turmas:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// POST /api/turmas - Criar turma (professor/admin)
// ============================================================================
router.post('/', authenticateTokenLocal, async (req, res) => {
  try {
    const isAdmin = req.userRole === 'admin' || req.userRole === 'super_admin';
    if (!isAdmin && req.userRole !== 'professor') {
      return res.status(403).json({
        success: false,
        error: 'Apenas professores e administradores podem criar turmas'
      });
    }

    const { nome, disciplina, eixo, descricao } = req.body;

    const eixoExistente = await Eixo.findOne({ nome: eixo });
    if (!eixoExistente) {
      return res.status(400).json({
        success: false,
        error: 'Eixo não encontrado no sistema'
      });
    }

    const turma = new Turma({
      nome,
      disciplina,
      eixo: eixo,
      eixoId: eixoExistente._id,
      descricao,
      professorId: req.userId
    });

    await turma.save();

    res.status(201).json({
      success: true,
      turma: {
        id: turma._id,
        nome: turma.nome,
        disciplina: turma.disciplina,
        eixo: turma.eixo,
        codigo: turma.codigo,
        professorId: turma.professorId
      }
    });

  } catch (error) {
    logger.error('Erro ao criar turma:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao criar turma'
    });
  }
});

// ============================================================================
// GET /api/turmas/:id - Buscar turma específica
// ============================================================================
router.get('/:id', authenticateTokenLocal, async (req, res) => {
  try {
    const turmaId = req.params.id;
    const userId = req.userId;
    const userRole = req.userRole;

    logger.info(`🔍 Buscando turma: ${turmaId} para usuário: ${userId} (${userRole})`);

    const isPermitted = userRole === 'professor' ||
      userRole === 'admin' ||
      userRole === 'super_admin' ||
      userRole === 'setor_pedagogico';

    if (!isPermitted) {
      return res.status(403).json({
        success: false,
        error: 'Você não tem permissão para ver esta turma'
      });
    }

    const turma = await Turma.findById(turmaId)
      .populate('professorId', 'nome email')
      .populate('alunos', 'nome email matricula')
      .lean();

    if (!turma) {
      return res.status(404).json({
        success: false,
        error: 'Turma não encontrada'
      });
    }

    // Para setor_pedagogico, não precisa verificar se é o professor da turma
    if (userRole !== 'setor_pedagogico' && turma.professorId._id.toString() !== userId && userRole !== 'admin' && userRole !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Você não tem permissão para ver esta turma'
      });
    }

    const provas = await Prova.find({ turmaId: turmaId })
      .select('titulo status quantidadeQuestoes dataLimite')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      turma: {
        id: turma._id,
        nome: turma.nome,
        disciplina: turma.disciplina,
        eixo: turma.eixo,
        codigo: turma.codigo,
        descricao: turma.descricao,
        dataCriacao: turma.dataCriacao,
        ativa: turma.ativa,
        professor: turma.professorId ? {
          nome: turma.professorId.nome,
          email: turma.professorId.email
        } : null,
        totalAlunos: turma.alunos ? turma.alunos.length : 0,
        totalProvas: provas.length,
        alunos: turma.alunos ? turma.alunos.map(a => ({
          id: a._id,
          nome: a.nome,
          email: a.email,
          matricula: a.matricula
        })) : [],
        provas: provas.map(p => ({
          id: p._id,
          titulo: p.titulo,
          status: p.status,
          quantidadeQuestoes: p.quantidadeQuestoes,
          dataLimite: p.dataLimite
        }))
      }
    });

  } catch (error) {
    logger.error('❌ Erro ao buscar turma:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno ao buscar turma: ' + error.message
    });
  }
});

// ============================================================================
// DELETE /api/turmas/:id - Excluir turma (professor/admin)
// ============================================================================
router.delete('/:id', authenticateTokenLocal, async (req, res) => {
  try {
    const turmaId = req.params.id;
    const usuarioId = req.userId;
    const usuarioRole = req.userRole;

    logger.info(`🗑️ Tentativa de exclusão da turma ${turmaId} pelo usuário ${usuarioId} (${usuarioRole})`);

    const turma = await Turma.findById(turmaId);
    if (!turma) {
      return res.status(404).json({
        success: false,
        error: 'Turma não encontrada'
      });
    }

    logger.info('📊 Dados da turma encontrada:');
    logger.info('   professorId:', turma.professorId);
    logger.info('   usuarioId:', usuarioId);

    const isAdmin = usuarioRole === 'admin' || usuarioRole === 'super_admin';

    let isProfessorDaTurma = false;

    if (turma.professorId) {
      const professorIdStr = turma.professorId.toString();
      const usuarioIdStr = usuarioId.toString();
      isProfessorDaTurma = professorIdStr === usuarioIdStr;
    }

    if (!isProfessorDaTurma && turma.professorId && turma.professorId._id) {
      isProfessorDaTurma = turma.professorId._id.toString() === usuarioId.toString();
    }

    if (!isProfessorDaTurma && turma.professor) {
      if (typeof turma.professor === 'string') {
        isProfessorDaTurma = turma.professor === usuarioId.toString();
      } else if (turma.professor.id) {
        isProfessorDaTurma = turma.professor.id.toString() === usuarioId.toString();
      } else if (turma.professor._id) {
        isProfessorDaTurma = turma.professor._id.toString() === usuarioId.toString();
      }
    }

    logger.info(`📊 Resultado: Admin: ${isAdmin}, Professor: ${isProfessorDaTurma}`);

    if (!isAdmin && !isProfessorDaTurma) {
      return res.status(403).json({
        success: false,
        error: 'Você não tem permissão para excluir esta turma'
      });
    }

    const provasAssociadas = await Prova.find({ turmaId: turmaId });

    if (isAdmin) {
      logger.info(`🔧 Admin removendo ${provasAssociadas.length} provas associadas...`);

      for (const prova of provasAssociadas) {
        await Resultado.deleteMany({ provaId: prova._id });
        await ProvaRealizada.deleteMany({ provaId: prova._id });
        await Prova.findByIdAndDelete(prova._id);
      }
    } else if (provasAssociadas.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Esta turma possui provas associadas. Exclua as provas primeiro.',
        detalhes: { totalProvas: provasAssociadas.length }
      });
    }

    if (turma.alunos && turma.alunos.length > 0) {
      await User.updateMany(
        { _id: { $in: turma.alunos } },
        { $pull: { turmas: turmaId } }
      );
    }

    await Turma.findByIdAndDelete(turmaId);

    logger.info(`✅ Turma ${turmaId} excluída com sucesso`);

    res.json({
      success: true,
      message: 'Turma excluída com sucesso!',
      detalhes: {
        provasRemovidas: isAdmin ? provasAssociadas.length : 0,
        alunosRemovidos: turma.alunos?.length || 0
      }
    });

  } catch (error) {
    logger.error('❌ Erro ao excluir turma:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno ao excluir turma: ' + error.message
    });
  }
});

// ============================================================================
// GET /api/turmas/:id/alunos - Listar alunos da turma
// ============================================================================
router.get('/:id/alunos', authenticateTokenLocal, async (req, res) => {
  try {
    const turmaId = req.params.id;
    const userId = req.userId;
    const userRole = req.userRole;

    const isPermitted = userRole === 'professor' ||
      userRole === 'admin' ||
      userRole === 'super_admin' ||
      userRole === 'setor_pedagogico';

    if (!isPermitted) {
      return res.status(403).json({
        success: false,
        error: 'Você não tem permissão para ver os alunos desta turma'
      });
    }

    const turma = await Turma.findById(turmaId)
      .populate('alunos', 'nome email matricula');

    if (!turma) {
      return res.status(404).json({
        success: false,
        error: 'Turma não encontrada'
      });
    }

    if (userRole !== 'setor_pedagogico' && turma.professorId.toString() !== userId && userRole !== 'admin' && userRole !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Você não tem permissão para ver os alunos desta turma'
      });
    }

    const alunos = turma.alunos ? turma.alunos.map(aluno => ({
      id: aluno._id,
      nome: aluno.nome,
      email: aluno.email,
      matricula: aluno.matricula
    })) : [];

    res.json({
      success: true,
      alunos
    });

  } catch (error) {
    logger.error('❌ Erro ao buscar alunos:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno ao buscar alunos'
    });
  }
});

// ============================================================================
// GET /api/turmas/:id/provas - Listar provas de uma turma
// ============================================================================
router.get('/:id/provas', authenticateTokenLocal, async (req, res) => {
  try {
    const turmaId = req.params.id;
    const userId = req.userId;

    const turma = await Turma.findById(turmaId);

    if (!turma) {
      return res.status(404).json({
        success: false,
        error: 'Turma não encontrada'
      });
    }

    if (turma.professorId.toString() !== userId && req.userRole !== 'admin' && req.userRole !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Você não tem permissão para ver as provas desta turma'
      });
    }

    const provas = await Prova.find({ turmaId: turmaId })
      .select('titulo status quantidadeQuestoes dataLimite createdAt')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      provas: provas.map(p => ({
        id: p._id,
        titulo: p.titulo,
        status: p.status,
        quantidadeQuestoes: p.quantidadeQuestoes,
        dataLimite: p.dataLimite,
        dataCriacao: p.createdAt
      }))
    });

  } catch (error) {
    logger.error('❌ Erro ao buscar provas:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno ao buscar provas'
    });
  }
});

// ============================================================================
// POST /api/turmas/:id/prova-v2 - Criar prova com IA (Groq)
// ============================================================================
// ============ ROTA ATUALIZADA COM SUPORTE A PROVA ADAPTADA (3 ALTERNATIVAS) E NOTIFICAÇÕES ============
router.post('/:id/prova-v2', authenticateTokenLocal, uploadMultiple, async (req, res) => {
  try {
    const turma = await Turma.findById(req.params.id).populate('professorId', '_id nome email');

    if (!turma) {
      return res.status(404).json({
        success: false,
        error: 'Turma não encontrada'
      });
    }

    // ===== VERIFICAÇÃO DE PERMISSÃO CORRIGIDA =====
    const isAdmin = req.userRole === 'admin' || req.userRole === 'super_admin';

    let isProfessorDaTurma = false;

    // Verificar por professorId._id (após populate)
    if (turma.professorId && turma.professorId._id) {
      isProfessorDaTurma = turma.professorId._id.toString() === req.userId;
    }
    // Fallback: verificar se é o dono pelo ID direto
    else if (turma.professorId && typeof turma.professorId === 'object' && turma.professorId.toString) {
      isProfessorDaTurma = turma.professorId.toString() === req.userId;
    }
    // Fallback: verificar por professorId como string
    else if (turma.professorId) {
      isProfessorDaTurma = turma.professorId.toString() === req.userId;
    }

    logger.info('🔍 Verificação de permissão (prova-v2):', {
      isAdmin,
      isProfessorDaTurma,
      userId: req.userId,
      professorNaTurma: turma.professorId
    });

    if (!isAdmin && !isProfessorDaTurma) {
      return res.status(403).json({
        success: false,
        error: 'Apenas o professor desta turma pode criar provas'
      });
    }
    // ===== FIM DA CORREÇÃO =====

    const {
      titulo,
      conteudo,
      tipoProva = 'simples',
      quantidadeQuestoes = 10,
      dificuldade = 'media',
      periodo = '1',
      adaptada,
      alternativas,
      publicoAlvo,
      dataLimite,
      horarioInicio,
      horarioTermino,
      anexosData = '[]',
      recursosAcessibilidade,
      professorId // <-- RECEBER DO BODY (enviado pelo admin)
    } = req.body;

    // Processar anexos
    let anexos = [];
    try {
      anexos = JSON.parse(anexosData);
    } catch (error) {
      logger.warn('⚠️ Erro ao parsear anexos:', error);
    }

    // Processar arquivos enviados
    if (req.files) {
      if (req.files.arquivos) {
        req.files.arquivos.forEach(file => {
          const ext = path.extname(file.originalname).toLowerCase();
          let tipo = 'outro';

          if (['.pdf'].includes(ext)) {
            tipo = 'pdf';
          } else if (['.txt', '.doc', '.docx'].includes(ext)) {
            tipo = 'texto';
            try {
              const content = fs.readFileSync(file.path, 'utf8');
              anexos.push({
                tipo: 'texto',
                titulo: file.originalname,
                conteudo: content.substring(0, 50000),
                nomeArquivo: file.filename,
                tamanho: file.size,
                url: `/uploads/${file.filename}`
              });
              return;
            } catch (e) {
              logger.warn('⚠️ Não foi possível ler arquivo de texto:', e.message);
            }
          } else if (['.jpg', '.jpeg', '.png', '.gif'].includes(ext)) {
            tipo = 'imagem';
          }

          anexos.push({
            tipo: tipo,
            titulo: file.originalname,
            nomeArquivo: file.filename,
            tamanho: file.size,
            url: `/uploads/${file.filename}`,
            mimetype: file.mimetype
          });
        });
      }

      if (req.files.imagens) {
        req.files.imagens.forEach(file => {
          anexos.push({
            tipo: 'imagem',
            titulo: file.originalname,
            nomeArquivo: file.filename,
            tamanho: file.size,
            url: `/uploads/${file.filename}`,
            mimetype: file.mimetype
          });
        });
      }
    }

    // Validar horários
    if (!horarioInicio || !horarioTermino) {
      return res.status(400).json({
        success: false,
        error: 'Horário de início e término são obrigatórios'
      });
    }

    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(horarioInicio) || !timeRegex.test(horarioTermino)) {
      return res.status(400).json({
        success: false,
        error: 'Formato de horário inválido. Use HH:mm (ex: 08:30)'
      });
    }

    const calcularDuracaoMinutos = (inicio, termino) => {
      const [h1, m1] = inicio.split(':').map(Number);
      const [h2, m2] = termino.split(':').map(Number);
      return (h2 * 60 + m2) - (h1 * 60 + m1);
    };

    const duracaoMinutos = calcularDuracaoMinutos(horarioInicio, horarioTermino);

    if (duracaoMinutos <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Horário de término deve ser depois do horário de início'
      });
    }

    // 🔥 ========== VALIDAÇÕES DAS CONFIGURAÇÕES DE PROVAS ========== 🔥

    // Buscar configurações de tempo
    const [configTempoMax, configTempoMin, configQuestoesMin, configQuestoesMax] = await Promise.all([
      Config.findOne({ chave: 'provas.tempoMaximo' }),
      Config.findOne({ chave: 'provas.tempoMinimo' }),
      Config.findOne({ chave: 'provas.questoesMinimas' }),
      Config.findOne({ chave: 'provas.questoesMaximas' })
    ]);

    const tempoMaximo = configTempoMax?.valor || 240; // Padrão: 240 minutos (4 horas)
    const tempoMinimo = configTempoMin?.valor || 10;  // Padrão: 10 minutos
    const questoesMinimas = configQuestoesMin?.valor || 5;  // Padrão: 5 questões
    const questoesMaximas = configQuestoesMax?.valor || 50; // Padrão: 50 questões

    // Validar duração da prova
    if (duracaoMinutos < tempoMinimo) {
      return res.status(400).json({
        success: false,
        error: `A prova deve ter no mínimo ${tempoMinimo} minutos de duração (configurado pelo administrador)`
      });
    }

    if (duracaoMinutos > tempoMaximo) {
      return res.status(400).json({
        success: false,
        error: `A prova não pode ter mais que ${tempoMaximo} minutos de duração (configurado pelo administrador)`
      });
    }

    // Validar quantidade de questões
    if (quantidadeQuestoes < questoesMinimas) {
      return res.status(400).json({
        success: false,
        error: `A prova deve ter no mínimo ${questoesMinimas} questões (configurado pelo administrador)`
      });
    }

    if (quantidadeQuestoes > questoesMaximas) {
      return res.status(400).json({
        success: false,
        error: `A prova não pode ter mais que ${questoesMaximas} questões (configurado pelo administrador)`
      });
    }

    logger.info(`🤖 Professor ${req.userId} solicitando prova tipo ${tipoProva} sobre: "${conteudo}"`);
    logger.info(`📎 Anexos recebidos: ${anexos.length}`);

    // 🔥 FIM DAS VALIDAÇÕES - SE CHEGOU AQUI, PASSOU EM TODAS AS VALIDAÇÕES

    // ========== LÓGICA PARA PROVA ADAPTADA ==========
    let alunosDestino = [];

    if (tipoProva === 'adaptada' || adaptada === true) {
      alunosDestino = await User.find({
        role: 'aluno',
        _id: { $in: turma.alunos || [] },
        precisaAcessibilidade: true
      }).select('_id nome email matricula precisaAcessibilidade condicaoAcessibilidade onesignalPlayerId');

      if (alunosDestino.length === 0) {
        return res.status(400).json({
          success: false,
          error: '❌ Não há alunos com necessidades de acessibilidade nesta turma.',
          detalhes: 'Crie uma turma com alunos que selecionaram "Sim" no campo de acessibilidade do cadastro.'
        });
      }
    } else {
      alunosDestino = await User.find({
        role: 'aluno',
        _id: { $in: turma.alunos || [] }
      }).select('_id nome email matricula onesignalPlayerId');

      logger.info(`📚 Prova normal - Será enviada para ${alunosDestino.length} aluno(s)`);
    }

    let questoesValidadas = [];
    let areaDetectada = 'geral';

    const exemplosPorArea = {
      matematica: {
        titulo: "PROBLEMAS DE CONTAGEM E RACIOCÍNIO LÓGICO",
        exemplo1: {
          pergunta: "Uma lanchonete tem uma promoção de combo com preço reduzido em que o cliente pode escolher 4 tipos diferentes de sanduíches, 3 tipos de bebida e 2 tipos de sobremesa. Quantos combos diferentes os clientes podem montar?",
          opcoes: ["A) 30 combos", "B) 22 combos", "C) 34 combos", "D) 24 combos", "E) 25 combos"],
          respostaCorreta: 3,
          explicacao: "Pelo Princípio Fundamental da Contagem: 4 × 3 × 2 = 24 combos diferentes.",
          conceitos: ["Princípio Fundamental da Contagem", "Multiplicação"]
        },
        exemplo2: {
          pergunta: "Em uma sala há 10 homens e 8 mulheres. Quantos grupos de 4 pessoas podem ser formados se cada grupo deve ter pelo menos 2 mulheres?",
          opcoes: ["A) 1820 grupos", "B) 2100 grupos", "C) 2310 grupos", "D) 2520 grupos", "E) 2730 grupos"],
          respostaCorreta: 2,
          explicacao: "Casos: 2 mulheres/2 homens: C(8,2)×C(10,2)=28×45=1260; 3 mulheres/1 homem: C(8,3)×C(10,1)=56×10=560; 4 mulheres: C(8,4)=70. Total: 1260+560+70=1890.",
          conceitos: ["Combinações", "Casos possíveis"]
        }
      },
      portugues: {
        titulo: "INTERPRETAÇÃO DE TEXTO E GRAMÁTICA APLICADA",
        exemplo1: {
          pergunta: "Leia o trecho: 'O vento sussurrava segredos milenares aos ouvidos das montanhas, que guardavam em seu silêncio a memória dos tempos.' A figura de linguagem predominante no texto é:",
          opcoes: ["A) Metáfora", "B) Personificação", "C) Hipérbole", "D) Ironia", "E) Eufemismo"],
          respostaCorreta: 1,
          explicacao: "Personificação, pois atribui ações humanas (sussurrar, guardar memória) ao vento e às montanhas.",
          conceitos: ["Figuras de linguagem", "Personificação"]
        },
        exemplo2: {
          pergunta: "Qual alternativa apresenta erro de concordância verbal?",
          opcoes: [
            "A) Fazem dois anos que não o vejo.",
            "B) Haviam muitas pessoas na festa.",
            "C) É necessário que se faça silêncio.",
            "D) Choveram pedras durante a tempestade.",
            "E) Bastam cinco minutos para resolver."
          ],
          respostaCorreta: 0,
          explicacao: "'Fazem dois anos' está incorreto. O verbo 'fazer' (indicando tempo decorrido) é impessoal, deve ser usado no singular: 'Faz dois anos'.",
          conceitos: ["Concordância verbal", "Verbos impessoais"]
        }
      },
      historia: {
        titulo: "ANÁLISE HISTÓRICA E INTERPRETAÇÃO DE FONTES",
        exemplo1: {
          pergunta: "A Revolução Industrial trouxe mudanças significativas na organização do trabalho. Qual das alternativas melhor descreve uma consequência social desse processo?",
          opcoes: [
            "A) Aumento do trabalho artesanal e fortalecimento das guildas.",
            "B) Surgimento do proletariado urbano e das fábricas.",
            "C) Redução da migração do campo para a cidade.",
            "D) Diminuição da jornada de trabalho e aumento dos salários.",
            "E) Fortalecimento dos laços comunitários tradicionais."
          ],
          respostaCorreta: 1,
          explicacao: "A Revolução Industrial levou à formação do proletariado urbano (trabalhadores assalariados) e ao sistema fabril, alterando radicalmente as relações de trabalho.",
          conceitos: ["Revolução Industrial", "Transformações sociais"]
        }
      },
      biologia: {
        titulo: "PROBLEMAS DE GENÉTICA E ECOLOGIA",
        exemplo1: {
          pergunta: "Em uma população, a frequência do alelo dominante A é 0,6 e do alelo recessivo a é 0,4. Considerando o equilíbrio de Hardy-Weinberg, qual a frequência esperada de indivíduos heterozigotos?",
          opcoes: ["A) 0,16", "B) 0,24", "C) 0,36", "D) 0,48", "E) 0,64"],
          respostaCorreta: 3,
          explicacao: "Pela fórmula de Hardy-Weinberg: p² + 2pq + q² = 1. Heterozigotos = 2pq = 2 × 0,6 × 0,4 = 0,48.",
          conceitos: ["Genética de populações", "Equilíbrio de Hardy-Weinberg"]
        }
      },
      geral: {
        titulo: "PROBLEMAS DE RACIOCÍNIO LÓGICO E INTERPRETAÇÃO",
        exemplo1: {
          pergunta: "Três amigos - Ana, Bruno e Carla - têm idades diferentes. Sabe-se que: 1) Ana é mais velha que Bruno; 2) Carla é mais nova que Ana; 3) Bruno não é o mais novo. Qual a ordem correta das idades, do mais velho para o mais novo?",
          opcoes: [
            "A) Ana, Bruno, Carla",
            "B) Ana, Carla, Bruno",
            "C) Bruno, Ana, Carla",
            "D) Carla, Ana, Bruno",
            "E) Bruno, Carla, Ana"
          ],
          respostaCorreta: 0,
          explicacao: "Das informações: 1) Ana > Bruno; 2) Carla < Ana; 3) Bruno não é o mais novo → Bruno > Carla. Portanto: Ana > Bruno > Carla.",
          conceitos: ["Raciocínio lógico", "Ordenação"]
        }
      },
      adaptada: {
        titulo: "QUESTÕES ADAPTADAS - ACESSIBILIDADE",
        exemplo1: {
          pergunta: "João tem 24 balas e quer dividir igualmente entre seus 3 amigos. Quantas balas cada amigo receberá?",
          opcoes: [
            "A) 6 balas",
            "B) 8 balas",
            "C) 10 balas"
          ],
          respostaCorreta: 1,
          explicacao: "24 balas ÷ 3 amigos = 8 balas para cada amigo.",
          conceitos: ["Divisão", "Problemas matemáticos simples"]
        },
        exemplo2: {
          pergunta: "Qual destas palavras é um substantivo?",
          opcoes: [
            "A) Correr",
            "B) Casa",
            "C) Bonito"
          ],
          respostaCorreta: 1,
          explicacao: "Substantivo é a palavra que dá nome aos seres, objetos, lugares. 'Casa' é um substantivo.",
          conceitos: ["Classes gramaticais", "Substantivo"]
        },
        exemplo3: {
          pergunta: "Qual é a capital do Brasil?",
          opcoes: [
            "A) São Paulo",
            "B) Rio de Janeiro",
            "C) Brasília"
          ],
          respostaCorreta: 2,
          explicacao: "Brasília é a capital federal do Brasil desde 1960.",
          conceitos: ["Geografia", "Capitais brasileiras"]
        }
      }
    };

    try {
      if (!groq) {
        throw new Error('Groq não configurado');
      }

      const modelosAtuais = [
        "llama-3.3-70b-versatile",      // Melhor qualidade (se disponível)
        "llama-3.1-8b-instant",         // Rápido e confiável
        "openai/gpt-oss-120b",          // Alternativa OpenAI (Groq)
        "openai/gpt-oss-20b",           // Alternativa OpenAI menor
        "qwen/qwen3-32b",               // Alternativa Qwen
        "moonshotai/kimi-k2-instruct",  // Alternativa Moonshot
        "gemma2-9b-it",                 // Alternativa Google
        "allam-2-7b"                    // Fallback final
      ];

      const contextoAnexos = await processarAnexosParaIA(anexos);

      logger.info(`📋 Contexto de anexos gerado: ${contextoAnexos.length} caracteres`);

      const detectarArea = (conteudo) => {
        if (!conteudo || typeof conteudo !== 'string') {
          logger.info('⚠️ Conteúdo vazio para detectar área, usando "geral"');
          return 'geral';
        }

        const conteudoLower = conteudo.toLowerCase();

        const areas = {
          matematica: ['matemática', 'matematica', 'cálculo', 'calculo', 'álgebra', 'algebra', 'geometria', 'estatística', 'estatistica', 'número', 'numero', 'equação', 'equacao', 'função', 'funcao', 'trigonometria', 'logaritmo', 'derivada', 'integral', 'probabilidade', 'contagem', 'combinatória', 'combinatoria'],
          portugues: ['português', 'portugues', 'gramática', 'gramatica', 'literatura', 'redação', 'redacao', 'interpretação', 'interpretacao', 'texto', 'leitura', 'ortografia', 'sintaxe', 'semântica', 'semantica', 'figuras de linguagem', 'gêneros textuais', 'generos textuais', 'coesão', 'coesao', 'coerência', 'coerencia'],
          historia: ['história', 'historia', 'histórico', 'historico', 'guerra', 'revolução', 'revolucao', 'império', 'imperio', 'idade média', 'idade media', 'renascimento', 'independência', 'independencia', 'revolução industrial', 'revolucao industrial', 'brasil colônia', 'brasil colonia', 'república', 'republica', 'ditadura', 'democracia'],
          geografia: ['geografia', 'física', 'fisica', 'humana', 'cartografia', 'clima', 'vegetação', 'vegetacao', 'relevo', 'hidrografia', 'população', 'populacao', 'urbanização', 'urbanizacao', 'globalização', 'globalizacao', 'meio ambiente', 'sustentabilidade', 'recursos naturais', 'energia', 'transportes'],
          biologia: ['biologia', 'célula', 'celula', 'genética', 'genetica', 'evolução', 'evolucao', 'ecologia', 'anatomia', 'fisiologia', 'botânica', 'botanica', 'zoologia', 'microbiologia', 'bioquímica', 'bioquimica', 'DNA', 'RNA', 'fotossíntese', 'fotossintese', 'sistema digestório', 'sistema respiratório'],
          quimica: ['química', 'quimica', 'átomo', 'atom', 'molécula', 'molecula', 'tabela periódica', 'tabela periodica', 'reação', 'reacao', 'ácido', 'acido', 'base', 'pH', 'orgânica', 'organica', 'inorgânica', 'inorganica', 'estequiometria', 'termoquímica', 'termoquimica', 'eletroquímica', 'eletroquimica'],
          fisica: ['física', 'fisica', 'mecânica', 'mecanica', 'termodinâmica', 'termodinamica', 'óptica', 'optica', 'eletricidade', 'magnetismo', 'ondas', 'relatividade', 'quantica', 'quântica', 'cinemática', 'cinematica', 'dinâmica', 'dinamica', 'energia', 'trabalho', 'potência', 'potencia', 'calor'],
          filosofia: ['filosofia', 'ética', 'etica', 'moral', 'epistemologia', 'metafísica', 'metafisica', 'lógica', 'logica', 'razão', 'razao', 'existencialismo', 'estoicismo', 'racionalismo', 'empirismo', 'kant', 'platão', 'platao', 'aristóteles', 'aristoteles', 'sócrates', 'socrates'],
          sociologia: ['sociologia', 'sociedade', 'cultura', 'ideologia', 'poder', 'estado', 'classes sociais', 'trabalho', 'consumo', 'globalização', 'globalizacao', 'identidade', 'gênero', 'genero', 'etnia', 'raça', 'raca', 'movimentos sociais', 'capitalismo', 'socialismo', 'democracia'],
          ingles: ['inglês', 'ingles', 'english', 'vocabulary', 'grammar', 'reading', 'writing', 'listening', 'speaking', 'verb', 'tense', 'pronoun', 'adjective', 'adverb', 'preposition', 'conjunction', 'phrasal verb', 'idiom', 'comprehension', 'translation'],
          artes: ['artes', 'arte', 'música', 'musica', 'teatro', 'dança', 'danca', 'cinema', 'pintura', 'escultura', 'arquitetura', 'fotografia', 'desenho', 'história da arte', 'historia da arte', 'movimentos artísticos', 'movimentos artisticos', 'renascimento', 'barroco', 'modernismo', 'contemporâneo', 'contemporaneo']
        };

        let areaEncontrada = 'geral';
        let maxMatches = 0;

        for (const [area, palavras] of Object.entries(areas)) {
          const matches = palavras.filter(palavra => conteudoLower.includes(palavra)).length;
          if (matches > maxMatches) {
            maxMatches = matches;
            areaEncontrada = area;
          }
        }

        logger.info(`🔍 Área detectada: ${areaEncontrada} (${maxMatches} correspondências)`);
        return areaEncontrada;
      };

      areaDetectada = detectarArea(conteudo);

      let completion;
      let modeloUsado = '';

      for (const modelo of modelosAtuais) {
        try {
          logger.info(`🔄 Tentando modelo: ${modelo}`);

          let systemPrompt;

          if (tipoProva === 'adaptada' || adaptada === true) {
            systemPrompt = `Você é um especialista em criar questões ACESSÍVEIS e ADAPTADAS para alunos com necessidades especiais.

REGRAS OBRIGATÓRIAS PARA PROVA ADAPTADA:
1. CADA questão deve ter EXATAMENTE 3 alternativas (A, B, C)
2. Linguagem SIMPLES, CLARA e OBJETIVA
3. Frases CURTAS e diretas (máximo 2 linhas por enunciado)
4. Evitar palavras difíceis, termos técnicos complexos
5. Alternativas curtas e de fácil compreensão
6. Enunciados com VOCABULÁRIO ACESSÍVEL
7. Evitar pegadinhas e ambiguidades
8. Explicações DETALHADAS e PASSO A PASSO

FORMATO JSON EXIGIDO:
{
  "questoes": [
    {
      "pergunta": "Texto curto e claro da pergunta",
      "opcoes": [
        "A) Alternativa A - clara e direta",
        "B) Alternativa B - clara e direta", 
        "C) Alternativa C - clara e direta (RESPOSTA CORRETA)"
      ],
      "respostaCorreta": 2,
      "explicacao": "Explicação PASSO A PASSO, com linguagem simples",
      "dificuldade": "facil|media|dificil",
      "area": "área do conhecimento"
    }
  ]
}`;
          } else if (tipoProva === 'enem') {
            systemPrompt = `Você é um especialista em criar questões DESAFIADORAS de múltipla escolha no formato ENEM.

SEU OBJETIVO: Criar questões que:
1. São DESAFIADORAS mas JUSTAS
2. Exigem RACIOCÍNIO e não apenas memorização
3. Simulam PROBLEMAS DO MUNDO REAL ou situações complexas
4. Têm alternativas PLAUSÍVEIS que testam compreensão profunda
5. São CLARAS e BEM ESTRUTURADAS

FORMATO EXIGIDO (JSON):
{
  "questoes": [
    {
      "contexto": "Texto base para a questão",
      "pergunta": "Pergunta clara baseada no contexto",
      "opcoes": [
        "A) [Alternativa A]",
        "B) [Alternativa B]",
        "C) [Alternativa C - RESPOSTA CORRETA]",
        "D) [Alternativa D]",
        "E) [Alternativa E]"
      ],
      "respostaCorreta": 2,
      "explicacao": "Explicação detalhada",
      "competencia": "Competência do ENEM",
      "habilidade": "Habilidade específica"
    }
  ]
}`;
          } else {
            systemPrompt = `Você é um especialista em criar questões DESAFIADORAS de múltipla escolha para TODAS as áreas do conhecimento.

SEU OBJETIVO: Criar questões que:
1. São DESAFIADORAS mas JUSTAS
2. Exigem RACIOCÍNIO e não apenas memorização
3. Simulam PROBLEMAS DO MUNDO REAL ou situações complexas
4. Têm alternativas PLAUSÍVEIS que testam compreensão profunda
5. São CLARAS e BEM ESTRUTURADAS

FORMATO EXIGIDO (JSON):
{
  "questoes": [
    {
      "pergunta": "Texto COMPLETO da pergunta",
      "opcoes": [
        "A) [Alternativa A - distrator plausível]",
        "B) [Alternativa B - outro distrator]",
        "C) [Alternativa C - RESPOSTA CORRETA]",
        "D) [Alternativa D - distrator comum]",
        "E) [Alternativa E - distrator sutil]"
      ],
      "respostaCorreta": 2,
      "explicacao": "Explicação DETALHADA passo a passo",
      "dificuldade": "facil|media|dificil",
      "area": "área do conhecimento",
      "conceitosEnvolvidos": ["conceito1", "conceito2"]
    }
  ]
}`;
          }

          let exemplos;
          if (tipoProva === 'adaptada' || adaptada === true) {
            exemplos = exemplosPorArea.adaptada || exemplosPorArea.geral;
          } else {
            exemplos = exemplosPorArea[areaDetectada] || exemplosPorArea.geral;
          }

          let userPrompt = '';

          if (tipoProva === 'adaptada' || adaptada === true) {
            userPrompt = `CRIE ${quantidadeQuestoes} QUESTÕES ADAPTADAS SOBRE: "${conteudo}"
            
ÁREA: ${areaDetectada.toUpperCase()}

## EXEMPLOS DE QUESTÕES ADAPTADAS (3 ALTERNATIVAS):

EXEMPLO 1:
${exemplos.exemplo1.pergunta}
OPÇÕES: ${exemplos.exemplo1.opcoes.join(' | ')}
RESPOSTA CORRETA: ${String.fromCharCode(65 + exemplos.exemplo1.respostaCorreta)}
EXPLICAÇÃO: ${exemplos.exemplo1.explicacao}

${exemplos.exemplo2 ? `
EXEMPLO 2:
${exemplos.exemplo2.pergunta}
OPÇÕES: ${exemplos.exemplo2.opcoes.join(' | ')}
RESPOSTA CORRETA: ${String.fromCharCode(65 + exemplos.exemplo2.respostaCorreta)}
EXPLICAÇÃO: ${exemplos.exemplo2.explicacao}
` : ''}

## DIRETRIZES OBRIGATÓRIAS:
1. EXATAMENTE 3 alternativas por questão
2. Linguagem SIMPLES e ACESSÍVEL
3. Frases CURTAS (máximo 2 linhas)
4. Nível de dificuldade: ${dificuldade}
5. Contexto: ${contextoAnexos}

Agora crie ${quantidadeQuestoes} questões ADAPTADAS sobre "${conteudo}":`;
          } else if (tipoProva === 'enem') {
            userPrompt = `CRIE ${quantidadeQuestoes} QUESTÕES NO FORMATO ENEM SOBRE: "${conteudo}"
            
ÁREA DETECTADA: ${areaDetectada.toUpperCase()}

${contextoAnexos}

## DIRETRIZES:
1. Cada questão deve ter um TEXTO BASE (contexto)
2. 5 alternativas por questão
3. Incluir COMPETÊNCIA e HABILIDADE do ENEM
4. Nível de dificuldade: ${dificuldade}

Agora crie ${quantidadeQuestoes} questões ENEM sobre "${conteudo}":`;
          } else {
            userPrompt = `CRIE ${quantidadeQuestoes} QUESTÕES DESAFIADORAS SOBRE: "${conteudo}"
            
ÁREA DETECTADA: ${areaDetectada.toUpperCase()}

${contextoAnexos}

## EXEMPLOS DE REFERÊNCIA PARA ${areaDetectada.toUpperCase()}:

TÍTULO: ${exemplos.titulo}

EXEMPLO 1:
${exemplos.exemplo1.pergunta}
OPÇÕES: ${exemplos.exemplo1.opcoes.join(' | ')}
RESPOSTA: ${String.fromCharCode(65 + exemplos.exemplo1.respostaCorreta)}
EXPLICAÇÃO: ${exemplos.exemplo1.explicacao}
CONCEITOS: ${exemplos.exemplo1.conceitos.join(', ')}

${exemplos.exemplo2 ? `
EXEMPLO 2:
${exemplos.exemplo2.pergunta}
OPÇÕES: ${exemplos.exemplo2.opcoes.join(' | ')}
RESPOSTA: ${String.fromCharCode(65 + exemplos.exemplo2.respostaCorreta)}
EXPLICAÇÃO: ${exemplos.exemplo2.explicacao}
CONCEITOS: ${exemplos.exemplo2.conceitos.join(', ')}
` : ''}

## DIRETRIZES:
1. 5 alternativas por questão
2. TODAS as alternativas devem ser VEROSSÍMEIS
3. Resposta correta NÃO ÓBVIA
4. Explicação MOSTRANDO O PROCESSO
5. Nível de dificuldade: ${dificuldade}

Agora crie ${quantidadeQuestoes} questões DESAFIADORAS sobre "${conteudo}" (área: ${areaDetectada}):`;
          }

          completion = await groq.chat.completions.create({
            model: modelo,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt }
            ],
            temperature: tipoProva === 'adaptada' ? 0.5 : 0.7,
            max_tokens: 8000,
            top_p: 0.9,
            response_format: { type: "json_object" }
          });

          modeloUsado = modelo;
          logger.info(`✅ Modelo ${modelo} funcionou!`);
          break;

        } catch (modeloError) {
          logger.info(`❌ Modelo ${modelo} falhou: ${modeloError.message.substring(0, 100)}`);
          continue;
        }
      }

      if (!completion) {
        throw new Error('Todos os modelos falharam');
      }

      const resposta = completion.choices[0].message.content;
      logger.info(`📄 Resposta da IA (Groq - ${modeloUsado}):`, resposta.substring(0, 300));

      let jsonString = resposta;

      const codeMatch = resposta.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeMatch && codeMatch[1]) {
        jsonString = codeMatch[1].trim();
      } else {
        const jsonMatch = resposta.match(/\{[\s\S]*\}/);
        if (jsonMatch && jsonMatch[0]) {
          jsonString = jsonMatch[0].trim();
        }
      }

      let dados;
      try {
        jsonString = jsonString.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
        dados = JSON.parse(jsonString);
      } catch (parseError) {
        logger.error('❌ Erro no parse, tentando corrigir...');

        try {
          const cleanedJson = jsonString
            .replace(/[^\x20-\x7E\r\n]/g, '')
            .replace(/\s+/g, ' ')
            .trim();

          const startIndex = cleanedJson.indexOf('{');
          const endIndex = cleanedJson.lastIndexOf('}');

          if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
            const finalJson = cleanedJson.substring(startIndex, endIndex + 1);
            dados = JSON.parse(finalJson);
            logger.info('✅ JSON corrigido com sucesso');
          } else {
            throw new Error('JSON incompleto ou mal formado');
          }
        } catch (secondError) {
          logger.error('❌ Falha na correção do JSON:', secondError.message);
          throw new Error('IA não retornou JSON válido após tentativas de correção');
        }
      }

      if (!dados || typeof dados !== 'object') {
        throw new Error('Dados inválidos da IA');
      }

      let questoesArray = dados.questoes || dados.questions || dados;
      if (!Array.isArray(questoesArray)) {
        questoesArray = [questoesArray];
      }

      if (questoesArray.length === 0) {
        throw new Error('Nenhuma questão encontrada na resposta da IA');
      }

      logger.info(`📊 ${questoesArray.length} questões recebidas da IA`);

      const questoesProcessadas = [];

      for (let i = 0; i < Math.min(questoesArray.length, quantidadeQuestoes); i++) {
        const questao = questoesArray[i];

        if (!questao || typeof questao !== 'object') {
          logger.warn(`⚠️ Questão ${i + 1} inválida, pulando...`);
          continue;
        }

        if (tipoProva === 'adaptada' || adaptada === true) {
          const pergunta = questao.pergunta || questao.question || questao.text ||
            `Questão ${i + 1} sobre ${conteudo}`;

          let opcoes = questao.opcoes || questao.options || questao.alternatives || [];

          if (typeof opcoes === 'string') {
            opcoes = opcoes.split('\n').filter(o => o.trim().length > 0);
          }

          while (opcoes.length < 3) {
            const letra = String.fromCharCode(65 + opcoes.length);
            opcoes.push(`${letra}) Opção ${letra}`);
          }
          opcoes = opcoes.slice(0, 3);

          opcoes = opcoes.map((opcao, idx) => {
            const letra = String.fromCharCode(65 + idx);
            if (!opcao.trim().startsWith(`${letra})`)) {
              return `${letra}) ${opcao.trim()}`;
            }
            return opcao.trim();
          });

          let respostaCorreta = questao.respostaCorreta !== undefined ? questao.respostaCorreta : 0;

          if (typeof respostaCorreta === 'string') {
            if (/^[0-2]$/.test(respostaCorreta)) {
              respostaCorreta = parseInt(respostaCorreta);
            } else if (/^[A-C]$/i.test(respostaCorreta)) {
              respostaCorreta = respostaCorreta.toUpperCase().charCodeAt(0) - 65;
            } else {
              respostaCorreta = 0;
            }
          }

          respostaCorreta = Math.max(0, Math.min(2, parseInt(respostaCorreta) || 0));

          const explicacao = questao.explicacao || questao.explanation ||
            `Resposta correta: ${opcoes[respostaCorreta]}.`;

          questoesProcessadas.push({
            tipo: 'adaptada',
            pergunta: pergunta.trim(),
            opcoes: opcoes.map(o => o.toString().trim()),
            respostaCorreta: respostaCorreta,
            explicacao: explicacao.trim(),
            dificuldade: dificuldade,
            area: questao.area || areaDetectada,
            adaptada: true,
            alternativas: 3,
            recursosAcessibilidade: recursosAcessibilidade || [
              'fonte_ampliada',
              'alto_contraste',
              'leitor_tela'
            ]
          });

        } else if (tipoProva === 'enem') {
          const contexto = questao.contexto || questao.textoBase || questao.base || '';
          const enunciado = questao.enunciado || questao.pergunta || questao.question || '';

          let opcoes = questao.opcoes || questao.options || questao.alternatives || [];

          if (typeof opcoes === 'string') {
            opcoes = opcoes.split('\n').filter(o => o.trim().length > 0);
          }

          while (opcoes.length < 5) {
            const letra = String.fromCharCode(65 + opcoes.length);
            opcoes.push(`${letra}) Opção ${letra}`);
          }
          opcoes = opcoes.slice(0, 5);

          opcoes = opcoes.map((opcao, idx) => {
            const letra = String.fromCharCode(65 + idx);
            if (!opcao.trim().startsWith(`${letra})`)) {
              return `${letra}) ${opcao.trim()}`;
            }
            return opcao.trim();
          });

          let respostaCorreta = questao.respostaCorreta !== undefined ? questao.respostaCorreta : 0;

          if (typeof respostaCorreta === 'string') {
            if (/^[0-4]$/.test(respostaCorreta)) {
              respostaCorreta = parseInt(respostaCorreta);
            } else if (/^[A-E]$/i.test(respostaCorreta)) {
              respostaCorreta = respostaCorreta.toUpperCase().charCodeAt(0) - 65;
            } else {
              respostaCorreta = 0;
            }
          }

          respostaCorreta = Math.max(0, Math.min(4, parseInt(respostaCorreta) || 0));

          const explicacao = questao.explicacao || questao.explanation ||
            `Resposta correta: ${opcoes[respostaCorreta]}.`;

          questoesProcessadas.push({
            tipo: 'enem',
            contexto: contexto.trim(),
            pergunta: enunciado.trim(),
            opcoes: opcoes.map(o => o.toString().trim()),
            respostaCorreta: respostaCorreta,
            explicacao: explicacao.trim(),
            competencia: questao.competencia || questao.competence || '',
            habilidade: questao.habilidade || questao.skill || '',
            dificuldade: dificuldade,
            area: areaDetectada
          });

        } else {
          const pergunta = questao.pergunta || questao.question || questao.text ||
            `Questão ${i + 1} sobre ${conteudo}`;

          let opcoes = questao.opcoes || questao.options || questao.alternatives || [];

          if (typeof opcoes === 'string') {
            opcoes = opcoes.split('\n').filter(o => o.trim().length > 0);
          }

          while (opcoes.length < 5) {
            const letra = String.fromCharCode(65 + opcoes.length);
            opcoes.push(`${letra}) Opção ${letra}`);
          }
          opcoes = opcoes.slice(0, 5);

          opcoes = opcoes.map((opcao, idx) => {
            const letra = String.fromCharCode(65 + idx);
            if (!opcao.trim().startsWith(`${letra})`)) {
              return `${letra}) ${opcao.trim()}`;
            }
            return opcao.trim();
          });

          let respostaCorreta = questao.respostaCorreta !== undefined ? questao.respostaCorreta : 0;

          if (typeof respostaCorreta === 'string') {
            if (/^[0-4]$/.test(respostaCorreta)) {
              respostaCorreta = parseInt(respostaCorreta);
            } else if (/^[A-E]$/i.test(respostaCorreta)) {
              respostaCorreta = respostaCorreta.toUpperCase().charCodeAt(0) - 65;
            } else {
              respostaCorreta = 0;
            }
          }

          respostaCorreta = Math.max(0, Math.min(4, parseInt(respostaCorreta) || 0));

          const explicacao = questao.explicacao || questao.explanation ||
            `Resposta correta: ${opcoes[respostaCorreta]}.`;

          questoesProcessadas.push({
            tipo: 'simples',
            pergunta: pergunta.trim(),
            opcoes: opcoes.map(o => o.toString().trim()),
            respostaCorreta: respostaCorreta,
            explicacao: explicacao.trim(),
            dificuldade: dificuldade,
            area: questao.area || areaDetectada,
            conceitos: questao.conceitosEnvolvidos || [conteudo],
            tipoRaciocinio: questao.tipoRaciocinio || 'analitico'
          });
        }
      }

      if (questoesProcessadas.length === 0) {
        throw new Error('Nenhuma questão válida processada');
      }

      questoesValidadas = questoesProcessadas;
      logger.info(`✅ ${questoesValidadas.length} questões processadas da IA (Groq)`);

    } catch (iaError) {
      logger.error('❌ Erro na IA, usando fallback:', iaError.message);

      const areaFallback = areaDetectada && areaDetectada in exemplosPorArea ? areaDetectada : 'geral';

      for (let i = 0; i < quantidadeQuestoes; i++) {
        if (tipoProva === 'adaptada' || adaptada === true) {
          const exemplosAdaptados = exemplosPorArea.adaptada || exemplosPorArea.geral;
          const exemploBase = exemplosAdaptados.exemplo1;

          questoesValidadas.push({
            tipo: 'adaptada',
            pergunta: `Questão ${i + 1}: ${exemploBase.pergunta.replace('João', 'Maria').replace('24', '36').replace('3', '4')}`,
            opcoes: exemploBase.opcoes,
            respostaCorreta: exemploBase.respostaCorreta,
            explicacao: exemploBase.explicacao,
            dificuldade: dificuldade,
            area: areaFallback,
            adaptada: true,
            alternativas: 3
          });
        } else if (tipoProva === 'enem') {
          questoesValidadas.push({
            tipo: 'enem',
            contexto: `Contexto sobre ${conteudo}: análise e interpretação.`,
            pergunta: `Com base no contexto, analise a situação sobre ${conteudo}:`,
            opcoes: [
              "A) Análise superficial",
              "B) Interpretação incorreta",
              "C) Análise correta e completa",
              "D) Conclusão precipitada",
              "E) Interpretação parcial"
            ],
            respostaCorreta: 2,
            explicacao: `A alternativa C apresenta a análise mais completa e fundamentada sobre ${conteudo}.`,
            competencia: "Competência de área específica",
            habilidade: "Habilidade de análise",
            dificuldade: dificuldade,
            area: areaFallback
          });
        } else {
          const exemplos = exemplosPorArea[areaFallback] || exemplosPorArea.geral;
          const exemploBase = exemplos.exemplo1 || exemplosPorArea.geral.exemplo1;
          questoesValidadas.push({
            tipo: 'simples',
            pergunta: `Questão ${i + 1} sobre ${conteudo} (área: ${areaFallback}): ${exemploBase.pergunta}`,
            opcoes: exemploBase.opcoes,
            respostaCorreta: exemploBase.respostaCorreta,
            explicacao: exemploBase.explicacao + ` Aplicado ao tema: ${conteudo}.`,
            dificuldade: dificuldade,
            area: areaFallback,
            conceitos: exemploBase.conceitos || [areaFallback]
          });
        }
      }

      logger.info(`✅ ${questoesValidadas.length} questões criadas via fallback (área: ${areaFallback})`);
    }

    // ===== 🔥 CORREÇÃO CRÍTICA: DECIDIR QUAL PROFESSOR USAR =====
    let professorDaProva;

    logger.info(`🔍 Criando prova - Usuário: ${req.userId} (${req.userRole})`);
    logger.info(`🔍 ProfessorId recebido do frontend: ${professorId || 'NÃO FORNECIDO'}`);

    if (isAdmin && professorId) {
      // ✅ Admin/Super Admin está criando para outro professor
      professorDaProva = professorId;
      logger.info(`✅ Admin/Super Admin criando prova para professor ID: ${professorId}`);

      // Verificar se o professor realmente existe
      const professorExiste = await User.findById(professorId);
      if (!professorExiste) {
        logger.info(`❌ Professor com ID ${professorId} não encontrado!`);
        return res.status(400).json({
          success: false,
          error: 'Professor selecionado não encontrado no sistema'
        });
      }
      logger.info(`✅ Professor verificado: ${professorExiste.nome} (${professorExiste.email})`);

    } else if (isAdmin && !professorId) {
      // Admin/Super Admin tentou criar sem selecionar professor
      logger.info(`❌ Admin tentou criar prova sem selecionar professor`);
      return res.status(400).json({
        success: false,
        error: 'Selecione um professor responsável pela prova'
      });

    } else {
      // ✅ Professor criando sua própria prova
      professorDaProva = req.userId;
      logger.info(`✅ Professor criando própria prova: ${req.userId}`);
    }

    logger.info(`👨‍🏫 Professor final da prova: ${professorDaProva}`);

    // ========== CRIAR PROVA COM O PROFESSOR CORRETO ==========
    const prova = new Prova({
      userId: professorDaProva,  // <-- USAR O PROFESSOR CORRETO
      turmaId: turma._id,
      eixo: turma.eixo,
      disciplina: turma.disciplina,
      titulo: titulo || `Prova: ${conteudo.substring(0, 50)}`,
      conteudo: conteudo,
      tipoProva: tipoProva,
      periodo: periodo,
      adaptada: tipoProva === 'adaptada' || adaptada === true,
      alternativas: tipoProva === 'adaptada' || adaptada === true ? 3 : 5,
      anexos: anexos,
      questoes: questoesValidadas,
      quantidadeQuestoes: questoesValidadas.length,
      dificuldade: dificuldade,
      dataLimite: dataLimite ? new Date(dataLimite) : null,
      horarioInicio: horarioInicio,
      horarioTermino: horarioTermino,
      duracaoMinutos: duracaoMinutos,
      status: 'rascunho',
      alunosAtribuidos: alunosDestino.map(a => a._id),
      totalAlunosAlvo: alunosDestino.length,
      alunosComAcessibilidade: tipoProva === 'adaptada' ? alunosDestino.length : 0,
      recursosAcessibilidade: recursosAcessibilidade || [
        'fonte_ampliada',
        'alto_contraste',
        'leitor_tela',
        'tempo_adicional'
      ],
      fonteGeracao: `Groq AI - Área: ${areaDetectada}`,
      publicada: false,
      criadoPor: req.userId // Guardar quem criou (admin ou professor)
    });

    await prova.save();

    // Adicionar a prova à turma
    turma.provas.push(prova._id);
    await turma.save();

    logger.info(`✅ ${req.userRole === 'admin' ? 'Admin' : 'Professor'} ${req.userId} criou prova ${prova._id} do tipo ${tipoProva} (área: ${areaDetectada})`);
    logger.info(`👨‍🏫 Professor atribuído: ${professorDaProva}`);
    logger.info(`🎯 Alunos alvo: ${alunosDestino.length} alunos`);
    logger.info(`⏱️ Duração: ${duracaoMinutos} minutos (validada pelas configurações)`);

    // ===== 🔥 ADICIONAR NOTIFICAÇÃO QUANDO A PROVA É CRIADA =====

    if (alunosDestino.length > 0) {
      const configDoc = await Config.findOne({ chave: 'notificacoes' });
      const pushAtivado = configDoc?.valor?.push === true;
      const OneSignalService = require('../services/onesignal-service');
      const oneSignal = pushAtivado ? new OneSignalService() : null;

      // Buscar dados do criador
      const criador = await User.findById(req.userId).select('nome');

      for (const aluno of alunosDestino) {
        try {
          // Notificação no sistema
          const notificacao = new Notificacao({
            usuarioId: aluno._id,
            tipo: 'sistema',
            titulo: '📝 Nova Prova Criada',
            mensagem: `Uma nova prova "${prova.titulo}" foi criada na turma ${turma.nome}.`,
            icone: '📚',
            cor: '#3b82f6',
            link: `/aluno.html`,
            prioridade: 3,
            dados: {
              provaId: prova._id,
              provaTitulo: prova.titulo,
              turmaId: turma._id,
              turmaNome: turma.nome,
              criadoPor: criador?.nome || 'Professor',
              dataCriacao: new Date().toISOString(),
              tipo: 'nova_prova_criada',
              status: 'rascunho'
            }
          });

          await notificacao.save();
          logger.info(`✅ Notificação criada para aluno ${aluno.nome}`);

          // Push se ativado
          if (pushAtivado && oneSignal && aluno.onesignalPlayerId) {
            await oneSignal.enviarPush(
              aluno._id,
              '📝 Nova Prova',
              `Prova "${prova.titulo}" criada em ${turma.nome}`,
              {
                tipo: 'nova_prova_criada',
                provaId: prova._id,
                provaTitulo: prova.titulo
              }
            );
          }
        } catch (notifError) {
          logger.error(`⚠️ Erro ao notificar aluno ${aluno._id}:`, notifError.message);
        }
      }

      logger.info(`✅ ${alunosDestino.length} alunos notificados sobre nova prova criada`);
    }

    let mensagemSucesso = '';
    if (tipoProva === 'adaptada' || adaptada === true) {
      mensagemSucesso = `✅ Prova ADAPTADA criada com sucesso! 
        📝 Formato: 3 alternativas por questão
        👥 Público alvo: ${alunosDestino.length} aluno(s) com necessidades de acessibilidade
        🎯 Esta prova será visível APENAS para alunos que selecionaram "Sim" no cadastro.`;
    } else {
      mensagemSucesso = `✅ Prova tipo ${tipoProva} (área: ${areaDetectada}) criada e enviada para ${alunosDestino.length} alunos`;
    }

    res.json({
      success: true,
      provaId: prova._id,
      codigo: prova.codigo,
      mensagem: mensagemSucesso,
      prova: {
        id: prova._id,
        titulo: prova.titulo,
        codigo: prova.codigo,
        tipoProva: prova.tipoProva,
        adaptada: prova.adaptada,
        alternativas: prova.alternativas,
        areaDetectada: areaDetectada,
        quantidadeQuestoes: prova.quantidadeQuestoes,
        dataLimite: prova.dataLimite,
        duracao: prova.duracao,
        dificuldade: prova.dificuldade,
        fonteGeracao: prova.fonteGeracao,
        totalAlunosAlvo: alunosDestino.length,
        alunosComAcessibilidade: prova.alunosComAcessibilidade,
        professorId: professorDaProva
      },
      questoes: prova.questoes.slice(0, quantidadeQuestoes),
      notificacoes: {
        enviadas: alunosDestino.length,
        alunosNotificados: alunosDestino.length
      }
    });

  } catch (error) {
    logger.error('❌ Erro geral ao criar prova:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao criar prova: ' + error.message
    });
  }
});

// ============================================================================
// EXPORTAR ROUTER
// ============================================================================
module.exports = router;