// ============================================================================
// ADMIN - EducaPleno
// ============================================================================
// Descrição: Todas as rotas relacionadas ao administrador.
//
// CORREÇÕES APLICADAS:
//   - Ordem correta: /usuarios/estatisticas ANTES de /usuarios/:id
//   - Removida duplicata /faces/:usuarioId
//   - Todos os path.join ajustados para '..' (arquivo em routes/)
//
// Rotas incluídas (resumo):
//   - Dashboard, Usuários Online, Usuários App
//   - CRUD de Usuários (listar, criar, editar, reset senha, toggle, excluir)
//   - Turmas (CRUD + alunos)
//   - Provas (listar, editar, resultados)
//   - Resultados (listar, salvar, editar, excluir, cancelamento)
//   - Backups (listar, criar, restaurar, download, excluir)
//   - Monitoramento (violações)
//   - Matrículas Autorizadas
//   - Professores (listar, toggle, excluir, reativar, cadastrados)
//   - Configurações (CRUD)
//   - Email (testes, boas-vindas)
//   - 2FA Backup Codes
//   - Reset Access
//   - Eixos, Cursos, Turmas de Cursos
//   - Faces (Face ID)
//   - Localizações
//   - OneSignal (dispositivos, vínculos, testes, massa)
//   - OMR (imagens de debug)
//
// Autor: Equipe de Desenvolvimento
// ============================================================================

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const unlink = promisify(fs.unlink);

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
try { Prova = require('../models/Prova'); } catch (err) {
  console.warn('[admin] Model Prova não disponível:', err.message);
}

let Turma = null;
try { Turma = require('../models/Turma'); } catch (err) {
  console.warn('[admin] Model Turma não disponível:', err.message);
}

let Eixo = null;
try { Eixo = require('../models/Eixo'); } catch (err) {
  console.warn('[admin] Model Eixo não disponível:', err.message);
}

let Curso = null;
try { Curso = require('../models/Cursos'); } catch (err) {
  console.warn('[admin] Model Curso não disponível:', err.message);
}

let Resultado = null;
try {
  Resultado = mongoose.model('Resultado');
} catch (err) {
  console.warn('[admin] Model Resultado não disponível:', err.message);
}

let ProvaRealizada = null;
try {
  ProvaRealizada = mongoose.model('ProvaRealizada');
} catch (err) {
  console.warn('[admin] Model ProvaRealizada não disponível:', err.message);
}

let Config = null;
try {
  Config = mongoose.model('Config');
} catch (err) {
  console.warn('[admin] Model Config não disponível:', err.message);
}

let Notificacao = null;
try {
  Notificacao = mongoose.model('Notificacao');
} catch (err) {
  console.warn('[admin] Model Notificacao não disponível:', err.message);
}

let FaceID = null;
try {
  FaceID = mongoose.model('FaceID');
} catch (err) {
  console.warn('[admin] Model FaceID não disponível:', err.message);
}

let Localizacao = null;
try {
  Localizacao = mongoose.model('Localizacao');
} catch (err) {
  console.warn('[admin] Model Localizacao não disponível:', err.message);
}

// ============================================================================
// SERVIÇOS
// ============================================================================

let matriculasManager = null;
try {
  matriculasManager = require('../matriculas');
} catch (err) {
  console.warn('[admin] matriculasManager não disponível:', err.message);
}

let OneSignalAdminService = null;
try {
  OneSignalAdminService = require('../services/onesignal-admin-service');
} catch (err) {
  console.warn('[admin] OneSignalAdminService não disponível:', err.message);
}

const EmailService = require('../services/email-service');

let oneSignalAdmin = null;
try {
  if (OneSignalAdminService) {
    oneSignalAdmin = new OneSignalAdminService();
  }
} catch (err) {
  console.warn('[admin] Erro ao instanciar OneSignalAdminService:', err.message);
}

// ============================================================================
// CONSTANTES
// ============================================================================

const OMR_DEBUG_FOLDER = path.join(__dirname, '..', 'debug_omr');

if (!fs.existsSync(OMR_DEBUG_FOLDER)) {
  fs.mkdirSync(OMR_DEBUG_FOLDER, { recursive: true });
  logger.info('📁 Pasta debug_omr criada em:', OMR_DEBUG_FOLDER);
}

// ============================================================================
// MIDDLEWARES LOCAIS
// ============================================================================

// ============================================================================
// MIDDLEWARE DE AUTENTICAÇÃO (atualiza lastActive automaticamente)
// ============================================================================

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

      // 🔥 ATUALIZAR lastActive A CADA REQUISIÇÃO (não bloqueia a resposta)
      User.findByIdAndUpdate(decoded.id, { 
        lastActive: new Date() 
      }).catch(() => {});

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

const isSuperAdmin = (req, res, next) => {
  if (req.userRole !== 'admin' && req.userRole !== 'super_admin') {
    return res.status(403).json({
      success: false,
      error: 'Acesso negado. Apenas administradores podem acessar esta rota.'
    });
  }
  next();
};

const verificarPermissaoSuperAdmin = async (req, res, next) => {
  try {
    if (req.userRole === 'super_admin') return next();

    if (req.userRole === 'admin') {
      const targetUserId = req.params.id || req.body.userId;

      if (targetUserId) {
        const targetUser = await User.findById(targetUserId).select('role');
        if (targetUser && targetUser.role === 'super_admin') {
          return res.status(403).json({
            success: false,
            error: 'Administradores não podem modificar dados de Super Admins'
          });
        }
      }
    }
    next();
  } catch (error) {
    logger.error('❌ Erro na verificação de permissão:', error);
    next();
  }
};

// ============================================================================
// FUNÇÕES AUXILIARES LOCAIS
// ============================================================================

function generateBackupCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function formatarBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
  return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
}

function determinarTipoImagem(nomeArquivo) {
  const nome = nomeArquivo.toLowerCase();
  if (nome.includes('original') || nome === '0_original.jpg') return 'original';
  if (nome.includes('binary') || nome === '1_binary.jpg') return 'processada';
  if (nome.includes('resultado') || nome === '2_resultado.jpg') return 'resultado';
  if (nome.includes('processed')) return 'processada';
  return 'outro';
}

function extrairInfoDoNome(nomeArquivo) {
  const info = { prova: null, aluno: null, respostas: null, nota: null };
  const respostaMatch = nomeArquivo.match(/respostas?_([A-E]+)/i);
  if (respostaMatch) info.respostas = respostaMatch[1].split('');
  const notaMatch = nomeArquivo.match(/nota_([\d.]+)/i);
  if (notaMatch) info.nota = parseFloat(notaMatch[1]);
  return info;
}

// ============================================================================
// HEALTH CHECK
// ============================================================================
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'online',
    service: 'Admin',
    models: {
      User: !!User,
      Prova: !!Prova,
      Turma: !!Turma,
      Eixo: !!Eixo,
      Curso: !!Curso,
      Resultado: !!Resultado,
      ProvaRealizada: !!ProvaRealizada,
      Config: !!Config,
      Notificacao: !!Notificacao,
      FaceID: !!FaceID,
      Localizacao: !!Localizacao
    }
  });
});

// ============================================================================
// DASHBOARD
// ============================================================================

// ============================================================================
// DASHBOARD
// ============================================================================

router.get('/dashboard', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const userCounts = await User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]);

    const stats = {
      totalUsuarios: 0,
      usuariosOnline: 0,
      usuariosComApp: 0,
      usuariosOnlineApp: 0,
      totalAlunos: 0,
      totalProfessores: 0,
      totalAdmins: 0,
      totalSuperAdmins: 0,
      totalSetorPedagogico: 0,
      totalCoordenacaoPatio: 0,
      totalCozinha: 0,
      totalGestaoGeral: 0,
      totalEnfermaria: 0,
      totalSupervisao: 0,
      totalPsicologia: 0,
      totalAssistenteSocial: 0,
      totalProtagonismo: 0,
      totalBiblioteca: 0,
      totalSecretaria: 0,
      totalTurmas: 0,
      turmasAtivas: 0,
      totalProvas: 0,
      totalQuestoes: 0,
      totalResultados: 0,
      alunosComAcessibilidade: 0,
      provasPorStatus: {},
      usuariosPorMes: [],
      atividadesRecentes: []
    };

    userCounts.forEach(item => {
      const role = item._id;
      const count = item.count;
      stats.totalUsuarios += count;

      switch (role) {
        case 'aluno': stats.totalAlunos = count; break;
        case 'professor': stats.totalProfessores = count; break;
        case 'admin': stats.totalAdmins += count; break;
        case 'super_admin':
          stats.totalSuperAdmins = count;
          stats.totalAdmins += count;
          break;
        case 'setor_pedagogico': stats.totalSetorPedagogico = count; break;
        case 'coordenacao_patio': stats.totalCoordenacaoPatio = count; break;
        case 'cozinha': stats.totalCozinha = count; break;
        case 'gestao_geral': stats.totalGestaoGeral = count; break;
        case 'enfermaria': stats.totalEnfermaria = count; break;
        case 'supervisao': stats.totalSupervisao = count; break;
        case 'biblioteca': stats.totalBiblioteca = count; break;
        case 'psicologia': stats.totalPsicologia = count; break;
        case 'assistente-social': stats.totalAssistenteSocial = count; break;
        case 'protagonismo': stats.totalProtagonismo = count; break;
        case 'secretaria': stats.totalSecretaria = count; break;
        default:
          logger.info(`   ⚠️ Role não mapeado: ${role} (${count} usuários)`);
      }
    });

    // 🔥 ATUALIZAR lastActive DO PRÓPRIO ADMIN (garante que ele conte como online)
    await User.findByIdAndUpdate(req.userId, {
      lastActive: new Date()
    });

    // 🔥 Janela de 30 minutos
    const trintaMinutosAtras = new Date(Date.now() - 30 * 60 * 1000);
    stats.usuariosOnline = await User.countDocuments({
      ativo: true,
      $or: [
        { lastActive: { $gte: trintaMinutosAtras } },
        { lastLogin: { $gte: trintaMinutosAtras } },
        { _id: req.userId } // 🔥 Inclui o próprio admin
      ]
    });

    stats.usuariosComApp = await User.countDocuments({
      ativo: true,
      onesignalPlayerId: { $exists: true, $nin: [null, ''] }
    });

    const quinzeMinAtras = new Date(Date.now() - 15 * 60 * 1000);
    stats.usuariosOnlineApp = await User.countDocuments({
      ativo: true,
      onesignalPlayerId: { $exists: true, $nin: [null, ''] },
      ultimaValidacaoPush: { $gte: quinzeMinAtras }
    });

    const [
      totalTurmas, turmasAtivas, totalProvas, totalQuestoes,
      totalResultados, alunosComAcessibilidade, usuariosPorMes, provasPorStatus
    ] = await Promise.all([
      Turma.countDocuments(),
      Turma.countDocuments({ ativa: true }),
      Prova.countDocuments(),
      Prova.aggregate([
        { $project: { count: { $size: "$questoes" } } },
        { $group: { _id: null, total: { $sum: "$count" } } }
      ]),
      Resultado.countDocuments(),
      User.countDocuments({ precisaAcessibilidade: true, role: 'aluno' }),
      User.aggregate([
        { $group: { _id: { $month: "$createdAt" }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      Prova.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }])
    ]);

    stats.totalTurmas = totalTurmas;
    stats.turmasAtivas = turmasAtivas;
    stats.totalProvas = totalProvas;
    stats.totalQuestoes = totalQuestoes[0]?.total || 0;
    stats.totalResultados = totalResultados;
    stats.alunosComAcessibilidade = alunosComAcessibilidade;
    stats.usuariosPorMes = usuariosPorMes.map(item => ({ mes: item._id, total: item.count }));
    stats.provasPorStatus = provasPorStatus.reduce((acc, item) => ({
      ...acc, [item._id]: item.count
    }), {});

    const [resultadosRecentes, provasRealizadasRecentes] = await Promise.all([
      Resultado.find().sort({ createdAt: -1 }).limit(5)
        .populate('userId', 'nome').populate('provaId', 'titulo').lean(),
      ProvaRealizada.find().sort({ dataRealizacao: -1 }).limit(5)
        .populate('alunoId', 'nome').populate('provaId', 'titulo').lean()
    ]);

    const recentes = [...resultadosRecentes, ...provasRealizadasRecentes]
      .sort((a, b) => {
        const dataA = new Date(a.createdAt || a.dataRealizacao);
        const dataB = new Date(b.createdAt || b.dataRealizacao);
        return dataB - dataA;
      })
      .slice(0, 10);

    stats.atividadesRecentes = recentes.map(r => ({
      id: r._id,
      tipo: r.userId ? 'resultado' : 'prova_realizada',
      usuario: r.userId?.nome || r.alunoId?.nome || 'Desconhecido',
      acao: r.userId ? 'finalizou a prova' : 'realizou a prova',
      prova: r.provaId?.titulo || 'Prova',
      data: r.createdAt || r.dataRealizacao
    }));

    res.json({ success: true, data: stats });

  } catch (error) {
    logger.error('❌ Erro no dashboard admin:', error);
    res.status(500).json({ success: false, error: 'Erro ao carregar dados do dashboard: ' + error.message });
  }
});

// ============================================================================
// USUÁRIOS ONLINE
// ============================================================================

// ============================================================================
// USUÁRIOS ONLINE (janela de 30min + inclui o próprio admin)
// ============================================================================

router.get('/usuarios-online', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    // 🔥 Janela de 30 minutos
    const trintaMinutosAtras = new Date(Date.now() - 30 * 60 * 1000);

    // 🔥 GARANTIR QUE O PRÓPRIO ADMIN ESTEJA SEMPRE NA LISTA
    await User.findByIdAndUpdate(req.userId, {
      lastActive: new Date()
    });

    const usuariosOnline = await User.find({
      ativo: true,
      $or: [
        { lastActive: { $gte: trintaMinutosAtras } },
        { lastLogin: { $gte: trintaMinutosAtras } },
        { _id: req.userId } // 🔥 Sempre inclui o próprio admin
      ]
    })
      .select('nome email role matricula turma curso eixo departamento ultimaAtualizacaoPerfil lastActive lastLogin fotoPerfil qrCodeUsuario onesignalPlayerId')
      .sort({ lastActive: -1, lastLogin: -1 })
      .lean();

    const usuariosFormatados = usuariosOnline.map(u => ({
      id: u._id,
      _id: u._id,
      nome: u.nome || 'Sem nome',
      email: u.email || '',
      role: u.role || 'desconhecido',
      matricula: u.matricula || null,
      turma: u.turma || null,
      curso: u.curso || null,
      eixo: u.eixo || null,
      departamento: u.departamento || null,
      fotoPerfil: u.fotoPerfil || null,
      temPush: !!(u.onesignalPlayerId),
      ultimaAtividade: u.lastActive || u.lastLogin,
      tempoOnline: u.lastActive
        ? Math.floor((Date.now() - new Date(u.lastActive).getTime()) / 60000)
        : (u.lastLogin ? Math.floor((Date.now() - new Date(u.lastLogin).getTime()) / 60000) : 0)
    }));

    const porPerfil = usuariosFormatados.reduce((acc, u) => {
      acc[u.role] = (acc[u.role] || 0) + 1;
      return acc;
    }, {});

    res.json({
      success: true,
      total: usuariosFormatados.length,
      usuarios: usuariosFormatados,
      porPerfil,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('❌ Erro ao listar usuários online:', error);
    res.status(500).json({ success: false, error: 'Erro ao listar usuários online: ' + error.message });
  }
});

// ============================================================================
// USUÁRIOS COM APP
// ============================================================================

router.get('/usuarios-app', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const usuarios = await User.find({
      onesignalPlayerId: { $exists: true, $nin: [null, ''] }
    })
      .select('nome email role matricula turma curso eixo departamento fotoPerfil ultimaValidacaoPush onesignalPlayerId ativo lastActive lastLogin')
      .sort({ ultimaValidacaoPush: -1 })
      .lean();

    const usuariosFormatados = usuarios.map(u => {
      const ultimaAtividade = u.ultimaValidacaoPush || u.lastActive || u.lastLogin;
      let estaOnline = false;
      let tempoOnline = 0;

      if (ultimaAtividade) {
        const diffMs = Date.now() - new Date(ultimaAtividade).getTime();
        tempoOnline = Math.floor(diffMs / 60000);
        estaOnline = diffMs < (15 * 60 * 1000);
      }

      return {
        id: u._id,
        nome: u.nome || 'Sem nome',
        email: u.email || '',
        role: u.role || 'desconhecido',
        matricula: u.matricula || null,
        turma: u.turma || null,
        curso: u.curso || null,
        eixo: u.eixo || null,
        departamento: u.departamento || null,
        fotoPerfil: u.fotoPerfil || null,
        ultimoAcesso: ultimaAtividade,
        estaOnline,
        tempoOnline,
        temApp: true
      };
    });

    const onlineAgora = usuariosFormatados.filter(u => u.estaOnline).length;

    res.json({
      success: true,
      total: usuariosFormatados.length,
      onlineAgora,
      usuarios: usuariosFormatados,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('❌ Erro ao listar usuários do app:', error);
    res.status(500).json({ success: false, error: 'Erro ao listar usuários do app: ' + error.message });
  }
});

// ============================================================================
// USUÁRIOS — ROTAS ESPECÍFICAS PRIMEIRO (estatisticas, professores-lista, alunos-lista)
// ============================================================================

router.get('/usuarios/estatisticas', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const [total, ativos, inativos, com2FA, comAcessibilidade] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ ativo: true }),
      User.countDocuments({ ativo: false }),
      User.countDocuments({ twoFactorEnabled: true }),
      User.countDocuments({ precisaAcessibilidade: true })
    ]);

    res.json({
      success: true,
      estatisticas: {
        total, ativos, inativos, com2FA, comAcessibilidade,
        porRole: {
          alunos: await User.countDocuments({ role: 'aluno' }),
          professores: await User.countDocuments({ role: 'professor' }),
          admins: await User.countDocuments({ role: { $in: ['admin', 'super_admin'] } })
        }
      }
    });

  } catch (error) {
    logger.error('❌ Erro ao buscar estatísticas:', error);
    res.status(500).json({ success: false, error: 'Erro ao buscar estatísticas: ' + error.message });
  }
});

router.get('/professores-lista', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    logger.info(`📋 Admin ${req.userId} buscando lista de professores`);

    const professores = await User.find({ role: 'professor', ativo: true })
      .select('nome email matricula')
      .sort({ nome: 1 })
      .lean();

    res.json({
      success: true,
      professores: professores.map(p => ({
        id: p._id,
        nome: p.nome,
        email: p.email,
        matricula: p.matricula
      }))
    });

  } catch (error) {
    logger.error('❌ Erro ao buscar professores:', error);
    res.status(500).json({ success: false, error: 'Erro ao buscar professores: ' + error.message });
  }
});

router.get('/alunos-lista', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { turmaId, curso } = req.query;

    let query = { role: 'aluno', ativo: true };
    if (turmaId) query.turma = turmaId;
    if (curso) query.curso = curso;

    const alunos = await User.find(query)
      .select('nome email matricula turma curso')
      .sort({ nome: 1 })
      .lean();

    res.json({
      success: true,
      alunos: alunos.map(a => ({
        id: a._id,
        nome: a.nome,
        email: a.email,
        matricula: a.matricula,
        turma: a.turma,
        curso: a.curso
      }))
    });

  } catch (error) {
    logger.error('❌ Erro ao buscar alunos:', error);
    res.status(500).json({ success: false, error: 'Erro ao buscar alunos: ' + error.message });
  }
});

// ============================================================================
// USUÁRIOS — LISTAR / CRIAR
// ============================================================================

router.get('/usuarios', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { role, search, status, turma, page = 1, limit = 10 } = req.query;

    let query = {};
    if (role && role !== 'todos') query.role = role;
    if (status && status !== 'todos') query.ativo = status === 'ativo';
    if (turma && turma !== 'todas' && turma !== '') query.turma = turma;

    if (search && search.trim() !== '') {
      query.$or = [
        { nome: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { matricula: { $regex: search, $options: 'i' } },
        { cpf: { $regex: search, $options: 'i' } }
      ];
      logger.info(`   🔍 Buscando por: "${search}"`);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [usuarios, total] = await Promise.all([
      User.find(query)
        .select('nome email cpf telefone matricula role eixo curso turma periodo departamento titulacao ativo forcePasswordChange precisaAcessibilidade condicaoAcessibilidade dataSolicitacaoAcessibilidade twoFactorEnabled telefoneVerificado createdAt updatedAt qrCodeUsuario qrCodeUsuarioGeradoEm qrCodeUsuarioTipo')
        .sort({ nome: 1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      User.countDocuments(query)
    ]);

    const usuariosFormatados = usuarios.map(user => ({
      _id: user._id,
      id: user._id,
      nome: user.nome || '',
      email: user.email || '',
      cpf: user.cpf || '',
      telefone: user.telefone || '',
      matricula: user.matricula || '',
      role: user.role || 'aluno',
      eixo: user.eixo || null,
      curso: user.curso || null,
      turma: user.turma || null,
      periodo: user.periodo || null,
      departamento: user.departamento || null,
      titulacao: user.titulacao || null,
      ativo: user.ativo !== false,
      forcePasswordChange: user.forcePasswordChange || false,
      precisaAcessibilidade: user.precisaAcessibilidade || false,
      condicaoAcessibilidade: user.condicaoAcessibilidade || null,
      dataSolicitacaoAcessibilidade: user.dataSolicitacaoAcessibilidade || null,
      twoFactorEnabled: user.twoFactorEnabled || false,
      telefoneVerificado: user.telefoneVerificado || false,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      qrCodeUsuario: user.qrCodeUsuario || null,
      qrCodeUsuarioGeradoEm: user.qrCodeUsuarioGeradoEm || null,
      qrCodeUsuarioTipo: user.qrCodeUsuarioTipo || null
    }));

    res.json({
      success: true,
      usuarios: usuariosFormatados,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    logger.error('❌ Erro ao listar usuários:', error);
    res.status(500).json({ success: false, error: 'Erro interno ao listar usuários: ' + error.message });
  }
});

router.post('/usuarios', authenticateTokenLocal, isSuperAdmin, verificarPermissaoSuperAdmin, async (req, res) => {
  try {
    const userData = req.body;

    logger.info('📝 Admin criando usuário:', userData.email);

    if (req.userRole === 'admin' && userData.role === 'super_admin') {
      return res.status(403).json({ success: false, error: 'Administradores não podem criar Super Admins' });
    }

    if (userData.email && !userData.email.toLowerCase().endsWith('@iemasaoluiscentro.net')) {
      return res.status(400).json({ success: false, error: 'Somente emails institucionais (@iemasaoluiscentro.net) são permitidos' });
    }

    const existingUser = await User.findOne({
      $or: [
        { email: userData.email },
        { cpf: userData.cpf?.replace(/\D/g, '') }
      ]
    });

    if (existingUser) {
      return res.status(400).json({ success: false, error: 'Email ou CPF já cadastrado' });
    }

    if (userData.role === 'professor' && !userData.matricula) {
      return res.status(400).json({ success: false, error: 'Matrícula é obrigatória para professores' });
    }

    if (userData.role === 'aluno') {
      if (!userData.curso) return res.status(400).json({ success: false, error: 'Curso é obrigatório para alunos' });
      if (!userData.turma) return res.status(400).json({ success: false, error: 'Turma é obrigatória para alunos' });
    }

    const [configSenhaTamanho, configSenhaMaiuscula, configSenhaNumero, configSenhaEspecial] = await Promise.all([
      Config.findOne({ chave: 'seguranca.senha.tamanhoMinimo' }),
      Config.findOne({ chave: 'seguranca.senha.exigirMaiuscula' }),
      Config.findOne({ chave: 'seguranca.senha.exigirNumero' }),
      Config.findOne({ chave: 'seguranca.senha.exigirEspecial' })
    ]);

    const tamanhoMinimo = configSenhaTamanho?.valor || 6;
    const exigirMaiuscula = configSenhaMaiuscula?.valor || false;
    const exigirNumero = configSenhaNumero?.valor || false;
    const exigirEspecial = configSenhaEspecial?.valor || false;

    if (userData.password.length < tamanhoMinimo) {
      return res.status(400).json({ success: false, error: `A senha deve ter no mínimo ${tamanhoMinimo} caracteres` });
    }
    if (exigirMaiuscula && !/[A-Z]/.test(userData.password)) {
      return res.status(400).json({ success: false, error: 'A senha deve conter pelo menos uma letra maiúscula' });
    }
    if (exigirNumero && !/[0-9]/.test(userData.password)) {
      return res.status(400).json({ success: false, error: 'A senha deve conter pelo menos um número' });
    }
    if (exigirEspecial && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(userData.password)) {
      return res.status(400).json({ success: false, error: 'A senha deve conter pelo menos um caractere especial (!@#$%...)' });
    }

    const user = new User({
      ...userData,
      cpf: userData.cpf?.replace(/\D/g, ''),
      telefone: userData.telefone?.replace(/\D/g, ''),
      ativo: true,
      forcePasswordChange: true,
      passwordChangedAt: null,
      loginAttempts: 0,
      lockUntil: null,
      twoFactorEnabled: false,
      twoFactorBackupCodes: [],
      twoFactorBackupCodesShown: false,
      twoFactorSecret: null,
      twoFactorTempSecret: null,
      telefoneVerificado: false,
      lastOtpRequest: null,
      otpRequestCount: 0
    });

    await user.save();

    logger.info(`✅ Usuário criado pelo admin: ${user.email}`);
    logger.info(`   🔐 forcePasswordChange: ${user.forcePasswordChange}`);

    res.status(201).json({
      success: true,
      message: 'Usuário criado com sucesso! Ele deverá trocar a senha no primeiro login.',
      user: {
        id: user._id,
        nome: user.nome,
        email: user.email,
        role: user.role,
        ativo: user.ativo,
        forcePasswordChange: user.forcePasswordChange
      }
    });

  } catch (error) {
    logger.error('❌ Erro ao criar usuário:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// USUÁRIOS — :id (SEMPRE POR ÚLTIMO)
// ============================================================================

router.get('/usuarios/:id', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    logger.info(`🔍 Admin ${req.userId} buscando usuário ${id}`);

    const user = await User.findById(id)
      .select('nome email cpf telefone matricula role eixo curso turma periodo departamento titulacao ativo forcePasswordChange precisaAcessibilidade condicaoAcessibilidade dataSolicitacaoAcessibilidade acessibilidadeAprovadaPor twoFactorEnabled twoFactorBackupCodesShown telefoneVerificado lastLogin loginAttempts lockUntil onesignalPlayerId createdAt updatedAt fotoPerfil fotoPerfilTipo bio endereco numero complemento bairro cidade estado cep dataNascimento genero instagram linkedin website interesses ultimaAtualizacaoPerfil qrCodeUsuario qrCodeUsuarioGeradoEm qrCodeUsuarioTipo')
      .lean();

    if (!user) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    }

    logger.info('📦 Dados do usuário retornados:', {
      nome: user.nome,
      email: user.email,
      fotoPerfil: user.fotoPerfil ? '✅ EXISTE' : '❌ NÃO',
      endereco: user.endereco || '—',
      cidade: user.cidade || '—',
      temQRCode: !!user.qrCodeUsuario,
      qrCodeLength: user.qrCodeUsuario ? user.qrCodeUsuario.length : 0
    });

    res.json({
      success: true,
      user: {
        _id: user._id,
        id: user._id,
        nome: user.nome || '',
        email: user.email || '',
        cpf: user.cpf || '',
        telefone: user.telefone || '',
        matricula: user.matricula || '',
        role: user.role || 'aluno',
        eixo: user.eixo || null,
        curso: user.curso || null,
        turma: user.turma || null,
        periodo: user.periodo || null,
        departamento: user.departamento || null,
        titulacao: user.titulacao || null,
        ativo: user.ativo !== false,
        forcePasswordChange: user.forcePasswordChange || false,
        precisaAcessibilidade: user.precisaAcessibilidade || false,
        condicaoAcessibilidade: user.condicaoAcessibilidade || null,
        dataSolicitacaoAcessibilidade: user.dataSolicitacaoAcessibilidade || null,
        twoFactorEnabled: user.twoFactorEnabled || false,
        twoFactorBackupCodesShown: user.twoFactorBackupCodesShown || false,
        telefoneVerificado: user.telefoneVerificado || false,
        lastLogin: user.lastLogin,
        onesignalPlayerId: user.onesignalPlayerId || null,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        fotoPerfil: user.fotoPerfil || null,
        fotoPerfilTipo: user.fotoPerfilTipo || null,
        bio: user.bio || '',
        endereco: user.endereco || '',
        numero: user.numero || '',
        complemento: user.complemento || '',
        bairro: user.bairro || '',
        cidade: user.cidade || '',
        estado: user.estado || '',
        cep: user.cep || '',
        dataNascimento: user.dataNascimento || null,
        genero: user.genero || '',
        instagram: user.instagram || '',
        linkedin: user.linkedin || '',
        website: user.website || '',
        interesses: user.interesses || [],
        ultimaAtualizacaoPerfil: user.ultimaAtualizacaoPerfil || null,
        qrCodeUsuario: user.qrCodeUsuario || null,
        qrCodeUsuarioGeradoEm: user.qrCodeUsuarioGeradoEm || null,
        qrCodeUsuarioTipo: user.qrCodeUsuarioTipo || null
      }
    });

  } catch (error) {
    logger.error('❌ Erro ao buscar usuário:', error);
    res.status(500).json({ success: false, error: 'Erro ao buscar usuário: ' + error.message });
  }
});

router.put('/usuarios/:id', authenticateTokenLocal, isSuperAdmin, verificarPermissaoSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    logger.info(`✏️ Admin ${req.userId} editando usuário ${id}`);

    if (req.userRole === 'admin' && updates.role === 'super_admin') {
      return res.status(403).json({ success: false, error: 'Administradores não podem criar Super Admins' });
    }

    delete updates.password;

    if (updates.email && !updates.email.toLowerCase().endsWith('@iemasaoluiscentro.net')) {
      return res.status(400).json({ success: false, error: 'Somente emails institucionais (@iemasaoluiscentro.net) são permitidos' });
    }

    const existingUser = await User.findById(id);
    if (!existingUser) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    }

    if (req.userRole === 'admin' && existingUser.role === 'super_admin') {
      return res.status(403).json({ success: false, error: 'Administradores não podem modificar dados de Super Admins' });
    }

    if (updates.email && updates.email !== existingUser.email) {
      const emailExists = await User.findOne({ email: updates.email });
      if (emailExists) {
        return res.status(400).json({ success: false, error: 'Email já está em uso por outro usuário' });
      }
    }

    if (updates.cpf) {
      const cpfNumeros = updates.cpf.replace(/\D/g, '');
      if (cpfNumeros !== existingUser.cpf) {
        const cpfExists = await User.findOne({ cpf: cpfNumeros });
        if (cpfExists) {
          return res.status(400).json({ success: false, error: 'CPF já está em uso por outro usuário' });
        }
      }
      updates.cpf = cpfNumeros;
    }

    if (updates.telefone) {
      updates.telefone = updates.telefone.replace(/\D/g, '');
    }

    const user = await User.findByIdAndUpdate(id, updates, { new: true })
      .select('-password -twoFactorSecret -twoFactorBackupCodes -twoFactorTempSecret');

    logger.info(`✅ Usuário ${id} atualizado com sucesso`);

    res.json({
      success: true,
      message: 'Usuário atualizado com sucesso!',
      user: {
        id: user._id,
        nome: user.nome,
        email: user.email,
        role: user.role,
        ativo: user.ativo
      }
    });

  } catch (error) {
    logger.error('❌ Erro ao atualizar usuário:', error);
    res.status(500).json({ success: false, error: 'Erro ao atualizar usuário: ' + error.message });
  }
});

router.post('/usuarios/:id/reset-password', authenticateTokenLocal, isSuperAdmin, verificarPermissaoSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { novaSenha } = req.body;

    logger.info(`🔑 Admin ${req.userId} resetando senha do usuário ${id}`);

    const targetUser = await User.findById(id);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    }

    if (req.userRole === 'admin' && targetUser.role === 'super_admin') {
      return res.status(403).json({ success: false, error: 'Administradores não podem resetar senha de Super Admins' });
    }

    if (!novaSenha || novaSenha.length < 6) {
      return res.status(400).json({ success: false, error: 'A nova senha deve ter no mínimo 6 caracteres' });
    }

    let ConfigModel;
    try {
      ConfigModel = mongoose.model('Config');
    } catch (e) {
      const ConfigSchema = new mongoose.Schema({
        chave: { type: String, required: true, unique: true, trim: true },
        valor: { type: mongoose.Schema.Types.Mixed, required: true },
        tipo: { type: String, enum: ['string', 'number', 'boolean', 'object', 'array'], default: 'string' },
        descricao: { type: String, default: '' },
        categoria: { type: String, enum: ['geral', 'sistema', 'seguranca', 'provas', 'email', 'backups', 'logs', 'aparencia'], default: 'geral' },
        publico: { type: Boolean, default: false },
        editavel: { type: Boolean, default: true },
        atualizadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        atualizadoEm: { type: Date, default: Date.now }
      }, { timestamps: true });

      ConfigModel = mongoose.model('Config', ConfigSchema);
      logger.info('✅ Modelo Config criado dinamicamente na rota de reset');
    }

    const [configSenhaTamanho, configSenhaMaiuscula, configSenhaNumero, configSenhaEspecial] = await Promise.all([
      ConfigModel.findOne({ chave: 'seguranca.senha.tamanhoMinimo' }),
      ConfigModel.findOne({ chave: 'seguranca.senha.exigirMaiuscula' }),
      ConfigModel.findOne({ chave: 'seguranca.senha.exigirNumero' }),
      ConfigModel.findOne({ chave: 'seguranca.senha.exigirEspecial' })
    ]);

    const tamanhoMinimo = configSenhaTamanho?.valor || 6;
    const exigirMaiuscula = configSenhaMaiuscula?.valor || false;
    const exigirNumero = configSenhaNumero?.valor || false;
    const exigirEspecial = configSenhaEspecial?.valor || false;

    if (novaSenha.length < tamanhoMinimo) {
      return res.status(400).json({ success: false, error: `A nova senha deve ter no mínimo ${tamanhoMinimo} caracteres` });
    }
    if (exigirMaiuscula && !/[A-Z]/.test(novaSenha)) {
      return res.status(400).json({ success: false, error: 'A nova senha deve conter pelo menos uma letra maiúscula' });
    }
    if (exigirNumero && !/[0-9]/.test(novaSenha)) {
      return res.status(400).json({ success: false, error: 'A nova senha deve conter pelo menos um número' });
    }
    if (exigirEspecial && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(novaSenha)) {
      return res.status(400).json({ success: false, error: 'A nova senha deve conter pelo menos um caractere especial (!@#$%...)' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    }

    user.password = novaSenha;
    user.forcePasswordChange = true;
    user.passwordChangedAt = null;
    await user.save();

    logger.info(`✅ Senha resetada para usuário ${user.email}`);
    logger.info(`   🔐 forcePasswordChange: ${user.forcePasswordChange}`);

    const configDoc = await ConfigModel.findOne({ chave: 'notificacoes' });
    const pushAtivado = configDoc?.valor?.push === true;

    try {
      const notificacao = new Notificacao({
        usuarioId: user._id,
        tipo: 'sistema',
        titulo: '🔐 Senha resetada',
        mensagem: 'Sua senha foi resetada pelo administrador. Você precisará trocá-la no próximo login.',
        icone: '🔑',
        cor: '#f59e0b',
        link: '/trocar-senha.html',
        prioridade: 4
      });
      await notificacao.save();

      if (pushAtivado) {
        const OneSignalService = require('../services/onesignal-service');
        const oneSignal = new OneSignalService();

        await oneSignal.enviarPush(
          user._id,
          '🔐 Senha Resetada',
          'Sua senha foi resetada pelo administrador. Você precisará trocá-la no próximo login.',
          { tipo: 'reset_senha', forcarTroca: true }
        );
      }

    } catch (notifError) {
      logger.warn('⚠️ Erro ao criar notificação:', notifError.message);
    }

    res.json({
      success: true,
      message: 'Senha resetada com sucesso! O usuário deverá trocar a senha no próximo login.',
      novaSenha
    });

  } catch (error) {
    logger.error('❌ Erro ao resetar senha:', error);
    res.status(500).json({ success: false, error: 'Erro ao resetar senha: ' + error.message });
  }
});

router.put('/usuarios/:id/toggle-status', authenticateTokenLocal, isSuperAdmin, verificarPermissaoSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { ativo } = req.body;

    logger.info(`🔄 Admin ${req.userId} alterando status do usuário ${id} para ${ativo ? 'ATIVO' : 'INATIVO'}`);

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    }

    if (req.userRole === 'admin' && user.role === 'super_admin') {
      return res.status(403).json({ success: false, error: 'Administradores não podem alterar status de Super Admins' });
    }

    if (req.userId === id && !ativo) {
      return res.status(400).json({ success: false, error: 'Você não pode desativar seu próprio usuário' });
    }

    user.ativo = ativo;
    await user.save();

    logger.info(`✅ Usuário ${user.email} agora está ${ativo ? 'ATIVO' : 'INATIVO'}`);

    res.json({
      success: true,
      message: `Usuário ${ativo ? 'ativado' : 'desativado'} com sucesso!`,
      user: { id: user._id, nome: user.nome, ativo: user.ativo }
    });

  } catch (error) {
    logger.error('❌ Erro ao alterar status:', error);
    res.status(500).json({ success: false, error: 'Erro ao alterar status: ' + error.message });
  }
});

router.delete('/usuarios/:id', authenticateTokenLocal, isSuperAdmin, verificarPermissaoSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    logger.info(`🗑️ Admin ${req.userId} tentando excluir usuário ${id}`);

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    }

    if (req.userRole === 'admin' && user.role === 'super_admin') {
      return res.status(403).json({ success: false, error: 'Administradores não podem excluir Super Admins' });
    }

    if (req.userId === id) {
      return res.status(400).json({ success: false, error: 'Você não pode excluir seu próprio usuário' });
    }

    const [resultados, provasRealizadas, provasCriadas, turmasComoProfessor] = await Promise.all([
      Resultado.countDocuments({ userId: id }),
      ProvaRealizada.countDocuments({ alunoId: id }),
      Prova.countDocuments({ userId: id }),
      Turma.countDocuments({ professorId: id })
    ]);

    if (resultados > 0 || provasRealizadas > 0 || provasCriadas > 0 || turmasComoProfessor > 0) {
      return res.status(400).json({
        success: false,
        error: 'Este usuário possui dados associados. Não é possível excluir.',
        detalhes: { resultados, provasRealizadas, provasCriadas, turmasComoProfessor },
        sugestao: 'Recomendamos desativar o usuário em vez de excluí-lo.'
      });
    }

    await User.findByIdAndDelete(id);
    logger.info(`✅ Usuário ${user.email} excluído permanentemente`);

    res.json({ success: true, message: 'Usuário excluído com sucesso' });

  } catch (error) {
    logger.error('❌ Erro ao deletar usuário:', error);
    res.status(500).json({ success: false, error: 'Erro ao deletar usuário: ' + error.message });
  }
});

// ============================================================================
// TURMAS — ROTAS ESPECÍFICAS PRIMEIRO
// ============================================================================

router.get('/turmas/:id/alunos', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const turmaId = req.params.id;
    logger.info(`📋 Admin ${req.userId} listando alunos da turma ${turmaId}`);

    const turma = await Turma.findById(turmaId)
      .populate('alunos', 'nome email matricula precisaAcessibilidade condicaoAcessibilidade')
      .lean();

    if (!turma) return res.status(404).json({ success: false, error: 'Turma não encontrada' });

    const alunos = turma.alunos || [];

    res.json({
      success: true,
      alunos: alunos.map(a => ({
        id: a._id,
        nome: a.nome,
        email: a.email,
        matricula: a.matricula,
        precisaAcessibilidade: a.precisaAcessibilidade,
        condicaoAcessibilidade: a.condicaoAcessibilidade
      })),
      total: alunos.length,
      turma: {
        id: turma._id,
        nome: turma.nome,
        disciplina: turma.disciplina
      }
    });

  } catch (error) {
    logger.error('❌ Erro ao listar alunos da turma:', error);
    res.status(500).json({ success: false, error: 'Erro interno: ' + error.message });
  }
});

router.post('/turmas/:id/alunos', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const turmaId = req.params.id;
    const { alunoId } = req.body;

    logger.info(`📝 Admin ${req.userId} adicionando aluno ${alunoId} à turma ${turmaId}`);

    const turma = await Turma.findById(turmaId);
    if (!turma) return res.status(404).json({ success: false, error: 'Turma não encontrada' });

    const aluno = await User.findById(alunoId);
    if (!aluno) return res.status(404).json({ success: false, error: 'Aluno não encontrado' });

    if (aluno.role !== 'aluno') {
      return res.status(400).json({ success: false, error: 'O usuário selecionado não é um aluno' });
    }

    if (turma.alunos.includes(alunoId)) {
      return res.status(400).json({ success: false, error: 'Aluno já está matriculado nesta turma' });
    }

    turma.alunos.push(alunoId);
    await turma.save();

    logger.info(`✅ Aluno ${aluno.nome} adicionado à turma ${turma.nome}`);

    const configDoc = await Config.findOne({ chave: 'notificacoes' });
    const pushAtivado = configDoc?.valor?.push === true;

    try {
      const notificacao = new Notificacao({
        usuarioId: alunoId,
        tipo: 'sistema',
        titulo: '📚 Nova Turma',
        mensagem: `Você foi matriculado na turma ${turma.nome} - ${turma.disciplina}`,
        icone: '🏫',
        cor: '#10b981',
        link: '/aluno.html',
        prioridade: 3
      });
      await notificacao.save();

      if (pushAtivado) {
        const OneSignalService = require('../services/onesignal-service');
        const oneSignal = new OneSignalService();

        await oneSignal.enviarPush(
          alunoId,
          '📚 Nova Turma',
          `Você foi matriculado em ${turma.nome}`,
          { tipo: 'nova_turma', turmaId: turma._id, turmaNome: turma.nome }
        );
      }
    } catch (notifError) {
      logger.warn('⚠️ Erro ao criar notificação:', notifError.message);
    }

    res.json({
      success: true,
      message: 'Aluno adicionado à turma com sucesso!',
      turma: { id: turma._id, nome: turma.nome, totalAlunos: turma.alunos.length },
      aluno: { id: aluno._id, nome: aluno.nome, email: aluno.email }
    });

  } catch (error) {
    logger.error('❌ Erro ao adicionar aluno à turma:', error);
    res.status(500).json({ success: false, error: 'Erro interno: ' + error.message });
  }
});

router.delete('/turmas/:id/alunos/:alunoId', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const turmaId = req.params.id;
    const alunoId = req.params.alunoId;

    logger.info(`🗑️ Admin ${req.userId} removendo aluno ${alunoId} da turma ${turmaId}`);

    const turma = await Turma.findById(turmaId);
    if (!turma) return res.status(404).json({ success: false, error: 'Turma não encontrada' });

    const aluno = await User.findById(alunoId);
    if (!aluno) return res.status(404).json({ success: false, error: 'Aluno não encontrado' });

    if (!turma.alunos.includes(alunoId)) {
      return res.status(400).json({ success: false, error: 'Aluno não está matriculado nesta turma' });
    }

    turma.alunos = turma.alunos.filter(id => id.toString() !== alunoId.toString());
    await turma.save();

    logger.info(`✅ Aluno ${aluno.nome} removido da turma ${turma.nome}`);

    const configDoc = await Config.findOne({ chave: 'notificacoes' });
    const pushAtivado = configDoc?.valor?.push === true;

    try {
      const notificacao = new Notificacao({
        usuarioId: alunoId,
        tipo: 'sistema',
        titulo: '📚 Removido da Turma',
        mensagem: `Você foi removido da turma ${turma.nome} - ${turma.disciplina}`,
        icone: '🏫',
        cor: '#ef4444',
        link: '/aluno.html',
        prioridade: 3
      });
      await notificacao.save();

      if (pushAtivado) {
        const OneSignalService = require('../services/onesignal-service');
        const oneSignal = new OneSignalService();

        await oneSignal.enviarPush(
          alunoId,
          '📚 Removido da Turma',
          `Você foi removido da turma ${turma.nome}`,
          { tipo: 'removido_turma', turmaId: turma._id, turmaNome: turma.nome }
        );
      }
    } catch (notifError) {
      logger.warn('⚠️ Erro ao criar notificação:', notifError.message);
    }

    res.json({
      success: true,
      message: 'Aluno removido da turma com sucesso!',
      turma: { id: turma._id, nome: turma.nome, totalAlunos: turma.alunos.length },
      aluno: { id: aluno._id, nome: aluno.nome, email: aluno.email }
    });

  } catch (error) {
    logger.error('❌ Erro ao remover aluno da turma:', error);
    res.status(500).json({ success: false, error: 'Erro interno: ' + error.message });
  }
});

// ============================================================================
// TURMAS — :id
// ============================================================================

router.get('/turmas/:id', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const turmaId = req.params.id;
    logger.info(`🔍 Admin ${req.userId} buscando turma ${turmaId}`);

    const turma = await Turma.findById(turmaId)
      .populate('professorId', 'nome email')
      .populate('alunos', 'nome email matricula precisaAcessibilidade condicaoAcessibilidade')
      .populate('provas', 'titulo status')
      .lean();

    if (!turma) return res.status(404).json({ success: false, error: 'Turma não encontrada' });

    res.json({
      success: true,
      turma: {
        id: turma._id,
        nome: turma.nome,
        disciplina: turma.disciplina,
        eixo: turma.eixo,
        codigo: turma.codigo,
        descricao: turma.descricao,
        dataCriacao: turma.createdAt,
        ativa: turma.ativa,
        professor: turma.professorId ? {
          id: turma.professorId._id,
          nome: turma.professorId.nome,
          email: turma.professorId.email
        } : null,
        totalAlunos: turma.alunos?.length || 0,
        alunos: turma.alunos?.map(a => ({
          id: a._id,
          nome: a.nome,
          email: a.email,
          matricula: a.matricula,
          precisaAcessibilidade: a.precisaAcessibilidade || false,
          condicaoAcessibilidade: a.condicaoAcessibilidade
        })) || [],
        totalProvas: turma.provas?.length || 0,
        provas: turma.provas?.map(p => ({ id: p._id, titulo: p.titulo, status: p.status })) || []
      }
    });

  } catch (error) {
    logger.error('❌ Erro ao buscar turma:', error);
    res.status(500).json({ success: false, error: 'Erro interno: ' + error.message });
  }
});

// ============================================================================
// TURMAS — LISTAR / CRIAR
// ============================================================================

router.get('/turmas', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const turmas = await Turma.find()
      .populate('professorId', 'nome email')
      .populate('alunos', 'nome email matricula precisaAcessibilidade')
      .populate('provas', 'titulo status')
      .sort({ createdAt: -1 })
      .lean();

    const turmasComEstatisticas = turmas.map(turma => ({
      id: turma._id,
      nome: turma.nome,
      disciplina: turma.disciplina,
      eixo: turma.eixo,
      codigo: turma.codigo,
      descricao: turma.descricao,
      dataCriacao: turma.createdAt || turma.dataCriacao || turma.criadoEm,
      createdAt: turma.createdAt,
      ativa: turma.ativa,
      professor: turma.professorId ? {
        id: turma.professorId._id,
        nome: turma.professorId.nome,
        email: turma.professorId.email
      } : null,
      totalAlunos: turma.alunos?.length || 0,
      totalProvas: turma.provas?.length || 0,
      alunosComAcessibilidade: turma.alunos?.filter(a => a.precisaAcessibilidade).length || 0,
      alunos: turma.alunos?.map(a => ({
        id: a._id,
        nome: a.nome,
        email: a.email,
        matricula: a.matricula,
        precisaAcessibilidade: a.precisaAcessibilidade
      })) || []
    }));

    res.json({ success: true, turmas: turmasComEstatisticas });

  } catch (error) {
    logger.error('❌ Erro ao listar turmas:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/turmas', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { nome, disciplina, eixo, professorId, descricao, ativa } = req.body;

    const turma = new Turma({
      nome, disciplina, eixo, professorId, descricao,
      ativa: ativa !== false
    });

    await turma.save();

    res.status(201).json({
      success: true,
      turma: {
        id: turma._id,
        nome: turma.nome,
        codigo: turma.codigo,
        disciplina: turma.disciplina
      }
    });

  } catch (error) {
    logger.error('❌ Erro ao criar turma (admin):', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/turmas/:id', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const turmaAntiga = await Turma.findById(id).select('ativa nome alunos');

    const turma = await Turma.findByIdAndUpdate(id, updates, { new: true })
      .populate('professorId', 'nome email');

    if (!turma) {
      return res.status(404).json({ success: false, error: 'Turma não encontrada' });
    }

    if (turmaAntiga && turmaAntiga.ativa !== turma.ativa && turma.alunos?.length > 0) {
      try {
        const configDoc = await Config.findOne({ chave: 'notificacoes' });
        const pushAtivado = configDoc?.valor?.push === true;
        const OneSignalService = require('../services/onesignal-service');
        const oneSignal = pushAtivado ? new OneSignalService() : null;

        const statusTexto = turma.ativa ? 'ativada' : 'desativada';
        const cor = turma.ativa ? '#10b981' : '#ef4444';
        const icone = turma.ativa ? '✅' : '⏸️';

        const alunos = await User.find({ _id: { $in: turma.alunos } })
          .select('_id onesignalPlayerId nome');

        logger.info(`📢 Turma ${turma.nome} ${statusTexto} - Notificando ${alunos.length} alunos`);

        for (const aluno of alunos) {
          try {
            const notificacao = new Notificacao({
              usuarioId: aluno._id,
              tipo: 'sistema',
              titulo: `${icone} Turma ${statusTexto}`,
              mensagem: `A turma "${turma.nome}" foi ${statusTexto}. ${!turma.ativa ? 'Você não poderá acessar as provas desta turma.' : ''}`,
              icone,
              cor,
              link: '/aluno.html',
              prioridade: 3,
              dados: {
                turmaId: turma._id,
                turmaNome: turma.nome,
                status: turma.ativa ? 'ativa' : 'inativa',
                tipo: 'status_turma'
              }
            });

            await notificacao.save();

            if (pushAtivado && oneSignal && aluno.onesignalPlayerId) {
              await oneSignal.enviarPush(
                aluno._id,
                `🏫 Turma ${statusTexto}`,
                `A turma "${turma.nome}" foi ${statusTexto}.`,
                { tipo: 'status_turma', turmaId: turma._id, status: turma.ativa ? 'ativa' : 'inativa' }
              );
            }
          } catch (alunoError) {
            logger.error(`⚠️ Erro ao notificar aluno ${aluno._id}:`, alunoError.message);
          }
        }

        logger.info(`✅ ${alunos.length} alunos notificados sobre mudança de status da turma`);

      } catch (notifError) {
        logger.error('⚠️ Erro ao notificar alunos:', notifError.message);
      }
    }

    res.json({
      success: true,
      turma: {
        id: turma._id,
        nome: turma.nome,
        disciplina: turma.disciplina,
        eixo: turma.eixo,
        codigo: turma.codigo,
        professor: turma.professorId ? {
          id: turma.professorId._id,
          nome: turma.professorId.nome
        } : null,
        ativa: turma.ativa
      }
    });

  } catch (error) {
    logger.error('❌ Erro ao atualizar turma (admin):', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/turmas/:id', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const turmaId = req.params.id;
    logger.info(`🗑️ Admin ${req.userId} excluindo turma ${turmaId}`);

    const turma = await Turma.findById(turmaId);
    if (!turma) return res.status(404).json({ success: false, error: 'Turma não encontrada' });

    const provasAssociadas = await Prova.find({ turmaId });

    logger.info(`🔧 Removendo ${provasAssociadas.length} provas associadas...`);

    for (const prova of provasAssociadas) {
      await Resultado.deleteMany({ provaId: prova._id });
      await ProvaRealizada.deleteMany({ provaId: prova._id });
      await Prova.findByIdAndDelete(prova._id);
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
        provasRemovidas: provasAssociadas.length,
        alunosRemovidos: turma.alunos?.length || 0
      }
    });

  } catch (error) {
    logger.error('❌ Erro ao excluir turma:', error);
    res.status(500).json({ success: false, error: 'Erro interno ao excluir turma: ' + error.message });
  }
});

// ============================================================================
// PROVAS
// ============================================================================

router.get('/provas/:provaId/resultados', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const provaId = req.params.provaId;

    const prova = await Prova.findById(provaId);
    if (!prova) return res.status(404).json({ success: false, error: 'Prova não encontrada' });

    const resultados = await Resultado.find({ provaId }).populate('userId', 'nome email matricula').lean();
    const provasRealizadas = await ProvaRealizada.find({ provaId }).populate('alunoId', 'nome email matricula').lean();

    const resultadosCompletos = [];

    resultados.forEach(r => {
      resultadosCompletos.push({
        id: r._id,
        alunoId: r.userId?._id,
        alunoNome: r.userId?.nome || r.alunoNome || 'Aluno',
        alunoEmail: r.userId?.email || '',
        alunoMatricula: r.userId?.matricula || '',
        dataRealizacao: r.createdAt,
        nota: r.nota,
        acertos: r.acertos,
        total: r.total,
        tempoGasto: r.tempoGasto,
        notaLiberada: r.notaLiberada,
        cancelada: r.cancelada || false,
        resultadoDetalhado: r.resultadoDetalhado
      });
    });

    provasRealizadas.forEach(pr => {
      const jaExiste = resultadosCompletos.some(r =>
        r.alunoId?.toString() === pr.alunoId?._id?.toString()
      );

      if (!jaExiste) {
        resultadosCompletos.push({
          id: pr._id,
          alunoId: pr.alunoId?._id,
          alunoNome: pr.alunoId?.nome || 'Aluno',
          alunoEmail: pr.alunoId?.email || '',
          alunoMatricula: pr.alunoId?.matricula || '',
          dataRealizacao: pr.dataRealizacao,
          nota: pr.nota,
          acertos: pr.acertos,
          total: pr.total,
          tempoGasto: pr.tempoGasto,
          notaLiberada: pr.notaLiberada,
          cancelada: pr.cancelada || false,
          resultadoDetalhado: pr.resultadoDetalhado
        });
      }
    });

    res.json({
      success: true,
      resultados: resultadosCompletos,
      total: resultadosCompletos.length,
      prova: {
        id: prova._id,
        titulo: prova.titulo,
        quantidadeQuestoes: prova.questoes.length
      }
    });

  } catch (error) {
    logger.error('❌ Erro:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/provas/:id', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const provaId = req.params.id;
    const updates = req.body;

    logger.info(`✏️ Admin ${req.userId} editando prova ${provaId}`);
    logger.info('📦 Dados recebidos:', {
      titulo: updates.titulo,
      conteudo: updates.conteudo,
      dataLimite: updates.dataLimite,
      horarioInicio: updates.horarioInicio,
      horarioTermino: updates.horarioTermino,
      duracaoMinutos: updates.duracaoMinutos,
      questoes: updates.questoes?.length || 0
    });

    const prova = await Prova.findById(provaId);
    if (!prova) return res.status(404).json({ success: false, error: 'Prova não encontrada' });

    if (updates.titulo) prova.titulo = updates.titulo;
    if (updates.conteudo) prova.conteudo = updates.conteudo;

    if (updates.dataLimite) {
      if (updates.dataLimite.includes('T')) {
        prova.dataLimite = new Date(updates.dataLimite);
      } else if (updates.horarioTermino) {
        prova.dataLimite = new Date(`${updates.dataLimite}T${updates.horarioTermino}:00`);
      } else {
        prova.dataLimite = new Date(`${updates.dataLimite}T23:59:59`);
      }
      logger.info(`📅 Data limite atualizada: ${prova.dataLimite.toLocaleString('pt-BR')}`);
    }

    if (updates.horarioInicio) {
      prova.horarioInicio = updates.horarioInicio;
      logger.info(`⏰ Horário início atualizado: ${prova.horarioInicio}`);
    }

    if (updates.horarioTermino) {
      prova.horarioTermino = updates.horarioTermino;
      logger.info(`⏰ Horário término atualizado: ${prova.horarioTermino}`);
    }

    if (updates.duracaoMinutos) prova.duracaoMinutos = updates.duracaoMinutos;

    if (updates.questoes && Array.isArray(updates.questoes)) {
      prova.questoes = updates.questoes;
      prova.quantidadeQuestoes = updates.questoes.length;
      logger.info(`📝 ${prova.quantidadeQuestoes} questões atualizadas`);
    }

    await prova.save();

    logger.info(`✅ Prova ${provaId} atualizada com sucesso`);
    logger.info(`   Horários salvos: ${prova.horarioInicio} - ${prova.horarioTermino}`);

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
    res.status(500).json({ success: false, error: 'Erro interno ao editar prova: ' + error.message });
  }
});

router.get('/provas', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { status, dificuldade, periodo, search, page = 1, limit = 20 } = req.query;

    let query = {};
    if (status && status !== 'todos') {
      if (status === 'ativa') query = { ...query, publicada: true, status: 'ativa', cancelada: false };
      else if (status === 'rascunho') query = { ...query, publicada: false };
      else if (status === 'cancelada') query = { ...query, cancelada: true };
      else if (status === 'concluida') query = { ...query, publicada: true, dataLimite: { $lt: new Date() } };
    }

    if (dificuldade && dificuldade !== 'todas') query.dificuldade = dificuldade;
    if (periodo && periodo !== 'todos') query.periodo = periodo;

    if (search) {
      query.$or = [
        { titulo: { $regex: search, $options: 'i' } },
        { conteudo: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [provas, total] = await Promise.all([
      Prova.find(query)
        .populate('userId', 'nome email')
        .populate('turmaId', 'nome disciplina')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Prova.countDocuments(query)
    ]);

    const provasComInfo = await Promise.all(provas.map(async (prova) => {
      const [resultados, provasRealizadas] = await Promise.all([
        Resultado.countDocuments({ provaId: prova._id }),
        ProvaRealizada.countDocuments({ provaId: prova._id })
      ]);

      return {
        id: prova._id,
        titulo: prova.titulo,
        conteudo: prova.conteudo,
        tipoProva: prova.tipoProva,
        adaptada: prova.adaptada,
        periodo: prova.periodo,
        quantidadeQuestoes: prova.questoes?.length || 0,
        dificuldade: prova.dificuldade,
        dataCriacao: prova.createdAt,
        dataLimite: prova.dataLimite,
        publicada: prova.publicada,
        cancelada: prova.cancelada,
        status: prova.status,
        codigo: prova.codigo,
        professor: prova.userId ? { id: prova.userId._id, nome: prova.userId.nome } : null,
        turma: prova.turmaId ? { id: prova.turmaId._id, nome: prova.turmaId.nome } : null,
        totalParticipantes: resultados + provasRealizadas,
        alunosRealizaram: resultados + provasRealizadas,
        mediaNotas: 0
      };
    }));

    res.json({
      success: true,
      provas: provasComInfo,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    logger.error('❌ Erro ao listar provas (admin):', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// RESULTADOS
// ============================================================================

router.get('/resultados/:id/cancelamento', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    logger.info(`🔍 Admin ${req.userId} buscando detalhes de cancelamento para ID: ${id}`);

    let registro = await Resultado.findById(id)
      .populate('userId', 'nome email')
      .populate('provaId', 'titulo conteudo dataLimite userId')
      .lean();

    let tipo = 'resultado';

    if (!registro) {
      registro = await ProvaRealizada.findById(id)
        .populate('alunoId', 'nome email matricula')
        .populate('provaId', 'titulo conteudo dataLimite userId')
        .lean();
      tipo = 'prova_realizada';
    }

    if (!registro) {
      return res.status(404).json({ success: false, error: 'Registro não encontrado' });
    }

    const isCancelada = registro.cancelada === true ||
      registro.status === 'cancelada' ||
      (registro.nota === 0 && registro.status === 'pendente');

    if (!isCancelada) {
      return res.status(400).json({ success: false, error: 'Este registro não é um cancelamento' });
    }

    const motivo = registro.motivoCancelamento || '';
    const motivoLower = motivo.toLowerCase();

    let tipoCancelamento = 'prazo';
    let icone = 'clock';
    let cor = '#f59e0b';
    let titulo = 'CANCELADA - PRAZO EXPIRADO';

    const palavrasViolacao = [
      'violação', 'violacao', 'violou', 'viola', 'multiplas', 'múltiplas',
      'regras', 'monitoramento', 'trapaça', 'trapaca', 'fraude',
      'atalho', 'shortcut', 'f5', 'refresh', 'recarregar'
    ];

    const isViolacao = palavrasViolacao.some(palavra => motivoLower.includes(palavra)) ||
      registro.flagViolacao === true ||
      (registro.estatisticasCancelamento && registro.estatisticasCancelamento.avisos > 0);

    if (isViolacao) {
      tipoCancelamento = 'violacao';
      icone = 'user-slash';
      cor = '#dc2626';
      titulo = 'CANCELADA - VIOLAÇÃO DAS REGRAS';
    }

    let professor = null;
    if (registro.provaId && registro.provaId.userId) {
      professor = await User.findById(registro.provaId.userId).select('nome email').lean();
    }

    const aluno = tipo === 'resultado' ? registro.userId : registro.alunoId;

    res.json({
      success: true,
      tipoCancelamento,
      titulo,
      icone,
      cor,
      prova: {
        id: registro.provaId?._id,
        titulo: registro.provaId?.titulo || 'Prova não identificada',
        conteudo: registro.provaId?.conteudo || '',
        dataLimite: registro.provaId?.dataLimite
      },
      aluno: {
        id: aluno?._id,
        nome: aluno?.nome || 'Aluno não identificado',
        email: aluno?.email || '',
        matricula: aluno?.matricula || ''
      },
      cancelamento: {
        data: registro.dataRealizacao || registro.createdAt,
        motivo: registro.motivoCancelamento || 'Motivo não especificado',
        nota: registro.nota || 0,
        tempoGasto: registro.tempoGasto || 0,
        flagViolacao: registro.flagViolacao || false
      },
      estatisticas: registro.estatisticasCancelamento || {
        avisos: 0,
        tentativasAtalho: 0,
        capturasTela: 0,
        tempoFora: 0,
        timestamp: registro.createdAt
      },
      professor: professor ? { nome: professor.nome, email: professor.email } : null,
      tipo,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('❌ Erro ao buscar detalhes de cancelamento:', error);
    res.status(500).json({ success: false, error: 'Erro interno: ' + error.message });
  }
});

router.post('/resultados/salvar', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { provaId, alunoId, nota, acertos, total, porcentagem, respostas, notaLiberada } = req.body;

    logger.info(`📝 Admin ${req.userId} salvando resultado para prova ${provaId}, aluno ${alunoId}`);

    let resultado = await Resultado.findOne({ provaId, userId: alunoId });

    if (resultado) {
      resultado.nota = nota;
      resultado.acertos = acertos;
      resultado.total = total;
      resultado.porcentagem = porcentagem;
      resultado.respostas = respostas;
      resultado.notaLiberada = notaLiberada !== false;
      resultado.updatedAt = new Date();
      await resultado.save();
      logger.info(`✅ Resultado ${resultado._id} atualizado`);
    } else {
      const aluno = await User.findById(alunoId).select('nome');

      resultado = new Resultado({
        userId: alunoId,
        provaId,
        alunoNome: aluno ? aluno.nome : 'Aluno',
        respostas: respostas || [],
        nota,
        acertos,
        total,
        porcentagem,
        notaLiberada: notaLiberada !== false,
        dataCriacao: new Date()
      });

      await resultado.save();
      logger.info(`✅ Novo resultado ${resultado._id} criado`);
    }

    let provaRealizada = await ProvaRealizada.findOne({ provaId, alunoId });

    if (provaRealizada) {
      provaRealizada.nota = nota;
      provaRealizada.notaLiberada = notaLiberada !== false;
      provaRealizada.status = 'corrigida';
      await provaRealizada.save();
    }

    const prova = await Prova.findById(provaId);
    if (prova) {
      const todosResultados = await Resultado.find({ provaId, notaLiberada: true });
      const somaNotas = todosResultados.reduce((acc, r) => acc + (r.nota || 0), 0);
      prova.mediaNotas = todosResultados.length > 0 ? somaNotas / todosResultados.length : 0;
      await prova.save();
    }

    res.json({
      success: true,
      message: 'Resultado salvo com sucesso!',
      resultado: {
        id: resultado._id,
        nota: resultado.nota,
        acertos: resultado.acertos
      }
    });

  } catch (error) {
    logger.error('❌ Erro ao salvar resultado:', error);
    res.status(500).json({ success: false, error: 'Erro ao salvar resultado: ' + error.message });
  }
});

router.put('/resultados/:id', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { nota, acertos, total, tempoGasto, observacoes, notaLiberada } = req.body;

    logger.info(`📝 Admin ${req.userId} atualizando resultado ${id}`);
    logger.info('   Nova nota:', nota);
    logger.info('   Acertos recebidos:', acertos, '/', total);

    const acertosCalculados = Math.round((nota / 10) * total);
    logger.info(`   🔄 Acertos calculados: ${acertosCalculados} (${nota} / 10 * ${total})`);

    let acertosFinais = acertosCalculados;

    if (Math.abs(acertos - acertosCalculados) > 1) {
      logger.warn(`⚠️ Inconsistência detectada: recebido ${acertos}, calculado ${acertosCalculados}. Usando valor calculado.`);
    } else if (acertos !== acertosCalculados) {
      logger.info(`ℹ️ Pequena diferença (${acertos} vs ${acertosCalculados}) - mantendo valor original`);
      acertosFinais = acertos;
    }

    const admin = await User.findById(req.userId).select('nome email');

    let resultado = await Resultado.findById(id);
    let tipoAcao = 'editada';
    let resultadoAntigo = null;

    if (resultado) {
      resultadoAntigo = {
        nota: resultado.nota,
        acertos: resultado.acertos,
        notaLiberada: resultado.notaLiberada
      };

      if (!resultadoAntigo.notaLiberada && notaLiberada) tipoAcao = 'liberada';

      resultado.nota = nota;
      resultado.acertos = acertosFinais;
      resultado.total = total;
      resultado.tempoGasto = tempoGasto;
      resultado.observacoes = observacoes;
      resultado.notaLiberada = notaLiberada !== false;
      resultado.porcentagem = total > 0 ? ((acertosFinais / total) * 100).toFixed(1) : '0.0';

      await resultado.save();

      logger.info(`✅ Resultado ${id} atualizado:`);
      logger.info(`   Nota: ${resultado.nota}`);
      logger.info(`   Acertos: ${resultado.acertos}/${resultado.total} (${resultado.porcentagem}%)`);

      const aluno = await User.findById(resultado.userId).select('nome email');
      const prova = await Prova.findById(resultado.provaId).select('titulo userId');

      if (prova && prova.userId) {
        const professor = await User.findById(prova.userId).select('nome email');

        const NotificationService = require('../services/notification-service');
        const notificationService = new NotificationService();

        if (aluno) {
          await notificationService.notificarAlunoResultado(aluno, prova, resultado, admin, tipoAcao);
        }

        if (professor && professor._id.toString() !== admin._id.toString()) {
          await notificationService.notificarProfessorResultado(professor, aluno, prova, resultado, admin, tipoAcao);
        }
      }

      return res.json({
        success: true,
        message: tipoAcao === 'liberada'
          ? '✅ Resultado liberado e notificações enviadas!'
          : '✅ Resultado atualizado e notificações enviadas!',
        resultado: {
          id: resultado._id,
          nota: resultado.nota,
          acertos: resultado.acertos,
          total: resultado.total,
          porcentagem: resultado.porcentagem
        }
      });
    }

    const provaRealizada = await ProvaRealizada.findById(id);

    if (provaRealizada) {
      const acertosCalculados = Math.round((nota / 10) * total);

      provaRealizada.nota = nota;
      provaRealizada.acertos = acertosCalculados;
      provaRealizada.total = total;
      provaRealizada.tempoGasto = tempoGasto;
      provaRealizada.observacoes = observacoes;
      provaRealizada.notaLiberada = notaLiberada !== false;
      provaRealizada.status = 'corrigida';

      await provaRealizada.save();

      logger.info(`✅ ProvaRealizada ${id} atualizada: ${acertosCalculados}/${total} acertos`);

      return res.json({
        success: true,
        message: 'Resultado atualizado com sucesso!',
        resultado: {
          id: provaRealizada._id,
          nota: provaRealizada.nota,
          acertos: provaRealizada.acertos,
          total: provaRealizada.total
        }
      });
    }

    return res.status(404).json({ success: false, error: 'Resultado não encontrado' });

  } catch (error) {
    logger.error('❌ Erro ao atualizar resultado:', error);
    res.status(500).json({ success: false, error: 'Erro interno ao atualizar resultado: ' + error.message });
  }
});

router.delete('/resultados/:id', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    logger.info(`🗑️ Admin ${req.userId} excluindo resultado/registro ${id}`);

    let excluidos = {
      resultado: false,
      provaRealizada: false,
      resultadoId: null,
      provaRealizadaId: null
    };

    const resultado = await Resultado.findById(id);
    if (resultado) {
      const provaId = resultado.provaId;
      const userId = resultado.userId;

      await Resultado.findByIdAndDelete(id);
      excluidos.resultado = true;
      excluidos.resultadoId = id;
      logger.info(`✅ Resultado ${id} excluído`);

      if (userId && provaId) {
        const provaRealizada = await ProvaRealizada.findOne({ provaId, alunoId: userId });

        if (provaRealizada) {
          await ProvaRealizada.findByIdAndDelete(provaRealizada._id);
          excluidos.provaRealizada = true;
          excluidos.provaRealizadaId = provaRealizada._id;
          logger.info(`✅ ProvaRealizada ${provaRealizada._id} também excluída (mesmo aluno/prova)`);
        }
      }
    } else {
      const provaRealizada = await ProvaRealizada.findById(id);
      if (provaRealizada) {
        await ProvaRealizada.findByIdAndDelete(id);
        excluidos.provaRealizada = true;
        excluidos.provaRealizadaId = id;
        logger.info(`✅ ProvaRealizada ${id} excluída`);

        if (provaRealizada.alunoId && provaRealizada.provaId) {
          const resultado = await Resultado.findOne({
            provaId: provaRealizada.provaId,
            userId: provaRealizada.alunoId
          });

          if (resultado) {
            await Resultado.findByIdAndDelete(resultado._id);
            excluidos.resultado = true;
            excluidos.resultadoId = resultado._id;
            logger.info(`✅ Resultado ${resultado._id} também excluído (mesmo aluno/prova)`);
          }
        }
      }
    }

    if (!excluidos.resultado && !excluidos.provaRealizada) {
      return res.status(404).json({ success: false, error: 'Registro não encontrado em nenhuma coleção' });
    }

    if (excluidos.resultadoId || excluidos.provaRealizadaId) {
      let provaId = null;

      if (excluidos.resultado) {
        const resultadoCompleto = await Resultado.findById(id);
        if (resultadoCompleto) provaId = resultadoCompleto.provaId;
      } else if (excluidos.provaRealizada) {
        const provaRealizadaCompleta = await ProvaRealizada.findById(id);
        if (provaRealizadaCompleta) provaId = provaRealizadaCompleta.provaId;
      }

      if (provaId) {
        const prova = await Prova.findById(provaId);
        if (prova) {
          const todosResultados = await Resultado.find({ provaId });
          const todasRealizadas = await ProvaRealizada.find({ provaId });

          const totalParticipantes = todosResultados.length + todasRealizadas.length;

          let somaNotas = 0;
          todosResultados.forEach(r => somaNotas += (r.nota || 0));
          todasRealizadas.forEach(r => somaNotas += (r.nota || 0));

          prova.mediaNotas = totalParticipantes > 0 ? somaNotas / totalParticipantes : 0;
          prova.totalParticipantes = totalParticipantes;

          await prova.save();
          logger.info(`📊 Estatísticas da prova ${provaId} atualizadas`);
        }
      }
    }

    let mensagem = '';
    if (excluidos.resultado && excluidos.provaRealizada) mensagem = 'Resultado e ProvaRealizada excluídos permanentemente!';
    else if (excluidos.resultado) mensagem = 'Resultado excluído permanentemente!';
    else if (excluidos.provaRealizada) mensagem = 'ProvaRealizada excluída permanentemente!';

    res.json({ success: true, message: mensagem, detalhes: excluidos });

  } catch (error) {
    logger.error('❌ Erro ao excluir resultado:', error);
    res.status(500).json({ success: false, error: 'Erro interno ao excluir resultado: ' + error.message });
  }
});

router.get('/todos-resultados', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    logger.info('📊 Admin buscando todos os resultados (incluindo notas manuais)');

    const resultados = await Resultado.find()
      .populate('userId', 'nome email matricula turma')
      .populate('provaId', 'titulo')
      .sort({ createdAt: -1 })
      .lean();

    const provasRealizadas = await ProvaRealizada.find()
      .populate('alunoId', 'nome email matricula turma')
      .populate('provaId', 'titulo')
      .sort({ dataRealizacao: -1 })
      .lean();

    const resultadosMap = new Map();

    resultados.forEach(r => {
      const dataStr = r.createdAt ? new Date(r.createdAt).toISOString().split('T')[0] : '';
      const key = `${r.userId?._id || r.userId}-${r.provaId?._id || r.provaId}-${dataStr}`;

      const isCancelada = r.cancelada === true ||
        r.status === 'cancelada' ||
        (r.motivoCancelamento && r.motivoCancelamento.length > 0);

      resultadosMap.set(key, {
        id: r._id,
        alunoId: r.userId?._id,
        alunoNome: r.alunoNome || r.userId?.nome || 'Aluno',
        alunoEmail: r.userId?.email || '',
        alunoMatricula: r.userId?.matricula || '',
        alunoTurma: r.userId?.turma || '',
        provaId: r.provaId?._id,
        provaTitulo: r.provaId?.titulo || 'Prova',
        dataRealizacao: r.createdAt,
        notaAutomatica: r.nota !== undefined ? parseFloat(r.nota) : null,
        notaAutomaticaLiberada: r.notaLiberada || false,
        notaManual: null,
        notaManualLiberada: false,
        notaManualObservacao: null,
        notaManualData: null,
        notaManualAtribuidaPor: null,
        resultadoDetalhadoManual: [],
        nota: r.nota !== undefined ? parseFloat(r.nota) : null,
        acertos: r.acertos || 0,
        total: r.total || 0,
        tempoGasto: r.tempoGasto || 0,
        status: r.status || (r.nota ? (r.nota >= 7 ? 'aprovado' : 'reprovado') : 'pendente'),
        notaLiberada: r.notaLiberada || false,
        cancelada: isCancelada,
        motivoCancelamento: r.motivoCancelamento,
        flagViolacao: r.flagViolacao || false,
        tipoNota: 'automatica',
        origem: 'resultado',
        resultadoDetalhado: r.resultadoDetalhado || [],
        observacoes: r.observacoes || ''
      });
    });

    provasRealizadas.forEach(pr => {
      const dataStr = pr.dataRealizacao ? new Date(pr.dataRealizacao).toISOString().split('T')[0] : '';
      const key = `${pr.alunoId?._id || pr.alunoId}-${pr.provaId?._id || pr.provaId}-${dataStr}`;

      const isCancelada = pr.cancelada === true ||
        pr.status === 'cancelada' ||
        (pr.motivoCancelamento && pr.motivoCancelamento.length > 0);

      const temNotaManual = pr.notaManual !== null && pr.notaManual !== undefined;
      const temNotaAutomatica = pr.nota !== null && pr.nota !== undefined;

      let notaFinal = null;
      let notaLiberada = false;
      let tipoNota = 'automatica';
      let notaAutomatica = null;
      let notaManual = null;

      if (temNotaManual) {
        notaFinal = pr.notaManual;
        notaLiberada = true;
        tipoNota = 'manual';
        notaManual = pr.notaManual;
        notaAutomatica = pr.nota;
      } else if (temNotaAutomatica) {
        notaFinal = pr.nota;
        notaLiberada = pr.notaLiberada || false;
        tipoNota = 'automatica';
        notaAutomatica = pr.nota;
      }

      let status = 'pendente';
      if (isCancelada) status = 'cancelada';
      else if (notaFinal !== null) status = notaFinal >= 7 ? 'aprovado' : 'reprovado';

      if (!resultadosMap.has(key)) {
        resultadosMap.set(key, {
          id: pr._id,
          alunoId: pr.alunoId?._id,
          alunoNome: pr.alunoId?.nome || 'Aluno',
          alunoEmail: pr.alunoId?.email || '',
          alunoMatricula: pr.alunoId?.matricula || '',
          alunoTurma: pr.alunoId?.turma || '',
          provaId: pr.provaId?._id,
          provaTitulo: pr.provaId?.titulo || 'Prova',
          dataRealizacao: pr.dataRealizacao,
          notaAutomatica,
          notaAutomaticaLiberada: pr.notaLiberada || false,
          notaManual,
          notaManualLiberada: temNotaManual ? true : false,
          notaManualObservacao: pr.notaManualObservacao,
          notaManualData: pr.notaManualData,
          notaManualAtribuidaPor: pr.notaManualAtribuidaPor,
          resultadoDetalhadoManual: pr.resultadoDetalhadoManual || [],
          nota: notaFinal,
          acertos: pr.acertos || 0,
          total: pr.total || 0,
          tempoGasto: pr.tempoGasto || 0,
          status,
          notaLiberada,
          cancelada: isCancelada,
          motivoCancelamento: pr.motivoCancelamento,
          flagViolacao: pr.flagViolacao || false,
          tipoNota,
          origem: 'provaRealizada',
          resultadoDetalhado: pr.resultadoDetalhado || [],
          observacoes: pr.observacoes || ''
        });
      } else {
        const existing = resultadosMap.get(key);
        if (temNotaManual && existing.tipoNota !== 'manual') {
          existing.notaManual = notaManual;
          existing.notaManualLiberada = true;
          existing.tipoNota = 'manual';
          existing.nota = notaFinal;
          existing.notaLiberada = true;
          existing.status = notaFinal >= 7 ? 'aprovado' : 'reprovado';
          existing.notaManualObservacao = pr.notaManualObservacao;
          existing.notaManualData = pr.notaManualData;
          existing.notaManualAtribuidaPor = pr.notaManualAtribuidaPor;
          existing.resultadoDetalhadoManual = pr.resultadoDetalhadoManual || [];
          resultadosMap.set(key, existing);
        }
      }
    });

    const todosResultados = Array.from(resultadosMap.values());

    const aprovados = todosResultados.filter(r => r.status === 'aprovado' && !r.cancelada).length;
    const reprovados = todosResultados.filter(r => r.status === 'reprovado' && !r.cancelada).length;
    const pendentes = todosResultados.filter(r => r.status === 'pendente' && !r.cancelada).length;
    const cancelados = todosResultados.filter(r => r.cancelada).length;
    const notasManuais = todosResultados.filter(r => r.tipoNota === 'manual').length;
    const notasAutomaticas = todosResultados.filter(r => r.tipoNota === 'automatica' && r.nota !== null).length;

    const notasValidas = todosResultados
      .filter(r => r.nota !== null && r.nota !== undefined && !r.cancelada)
      .map(r => r.nota);

    const mediaGeral = notasValidas.length > 0
      ? (notasValidas.reduce((a, b) => a + b, 0) / notasValidas.length).toFixed(2)
      : '0.00';

    const taxaAprovacao = notasValidas.length > 0
      ? ((aprovados / notasValidas.length) * 100).toFixed(1)
      : '0.0';

    res.json({
      success: true,
      resultados: todosResultados,
      total: todosResultados.length,
      estatisticas: {
        total: todosResultados.length,
        comNota: todosResultados.filter(r => r.nota !== null && r.nota !== undefined && !r.cancelada).length,
        semNota: todosResultados.filter(r => r.nota === null || r.nota === undefined).length,
        aprovados,
        reprovados,
        cancelados,
        pendentes,
        notasManuais,
        notasAutomaticas,
        mediaGeral,
        taxaAprovacao
      }
    });

  } catch (error) {
    logger.error('❌ Erro ao listar todos os resultados:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// BACKUPS
// ============================================================================

router.get('/backups', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const backupDir = path.join(__dirname, '..', 'backups');

    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
      return res.json({ success: true, backups: [] });
    }

    const files = fs.readdirSync(backupDir)
      .filter(f => f.endsWith('.json') || f.endsWith('.gz'))
      .map(f => {
        const stats = fs.statSync(path.join(backupDir, f));
        return {
          nome: f,
          tamanho: (stats.size / 1024 / 1024).toFixed(2) + ' MB',
          data: stats.mtime,
          criadoEm: stats.birthtime
        };
      })
      .sort((a, b) => new Date(b.data) - new Date(a.data));

    res.json({ success: true, backups: files });

  } catch (error) {
    logger.error('❌ Erro ao listar backups:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/backups/criar', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(__dirname, '..', 'backups');

    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    const backupFile = path.join(backupDir, `backup_${timestamp}.json`);

    const [users, turmas, provas, resultados, provasRealizadas] = await Promise.all([
      User.find({}).lean(),
      Turma.find({}).populate('alunos professorId').lean(),
      Prova.find({}).lean(),
      Resultado.find({}).populate('userId provaId').lean(),
      ProvaRealizada.find({}).populate('alunoId provaId').lean()
    ]);

    const backupData = {
      timestamp: new Date().toISOString(),
      version: '1.0',
      data: { users, turmas, provas, resultados, provasRealizadas },
      estatisticas: {
        totalUsers: users.length,
        totalTurmas: turmas.length,
        totalProvas: provas.length,
        totalResultados: resultados.length,
        totalProvasRealizadas: provasRealizadas.length
      }
    };

    fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));

    const gzip = require('zlib').createGzip();
    const input = fs.createReadStream(backupFile);
    const output = fs.createWriteStream(backupFile + '.gz');

    input.pipe(gzip).pipe(output);

    output.on('finish', () => {
      fs.unlinkSync(backupFile);
    });

    res.json({
      success: true,
      message: 'Backup criado com sucesso',
      arquivo: `backup_${timestamp}.json.gz`,
      estatisticas: backupData.estatisticas
    });

  } catch (error) {
    logger.error('❌ Erro ao criar backup:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/backups/restaurar/:arquivo', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { arquivo } = req.params;
    const backupPath = path.join(__dirname, '..', 'backups', arquivo);

    if (!fs.existsSync(backupPath)) {
      return res.status(404).json({ success: false, error: 'Arquivo de backup não encontrado' });
    }

    let backupData;

    if (arquivo.endsWith('.gz')) {
      const zlib = require('zlib');
      const gunzip = zlib.createGunzip();
      const input = fs.createReadStream(backupPath);

      backupData = await new Promise((resolve, reject) => {
        let data = '';
        input.pipe(gunzip)
          .on('data', chunk => data += chunk)
          .on('end', () => resolve(JSON.parse(data)))
          .on('error', reject);
      });
    } else {
      backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    }

    res.json({
      success: true,
      message: 'Backup carregado. Iniciar restauração?',
      preview: {
        timestamp: backupData.timestamp,
        estatisticas: backupData.estatisticas,
        colecoes: Object.keys(backupData.data)
      },
      confirmToken: jwt.sign(
        { action: 'restore', backup: arquivo, timestamp: Date.now() },
        process.env.JWT_SECRET,
        { expiresIn: '5m' }
      )
    });

  } catch (error) {
    logger.error('❌ Erro ao restaurar backup:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/backups/download/:arquivo', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { arquivo } = req.params;
    logger.info(`📥 Admin ${req.userId} tentando baixar backup: ${arquivo}`);

    if (arquivo.includes('..') || arquivo.includes('/') || arquivo.includes('\\')) {
      logger.warn(`🚫 Tentativa de path traversal: ${arquivo}`);
      return res.status(400).json({ success: false, error: 'Nome de arquivo inválido' });
    }

    const backupPath = path.join(__dirname, '..', 'backups', arquivo);
    logger.info('📁 Caminho do arquivo:', backupPath);

    if (!fs.existsSync(backupPath)) {
      logger.warn(`❌ Arquivo não encontrado: ${backupPath}`);
      return res.status(404).json({ success: false, error: 'Arquivo de backup não encontrado' });
    }

    const stats = fs.statSync(backupPath);
    logger.info(`📊 Tamanho: ${stats.size} bytes`);

    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${arquivo}"`);
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

    const fileStream = fs.createReadStream(backupPath);
    fileStream.pipe(res);

    fileStream.on('error', (error) => {
      logger.error('❌ Erro ao enviar arquivo:', error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Erro ao enviar arquivo' });
      }
    });

    fileStream.on('end', () => logger.info(`✅ Download concluído: ${arquivo}`));

  } catch (error) {
    logger.error('❌ Erro ao baixar backup:', error);
    res.status(500).json({ success: false, error: 'Erro ao baixar backup: ' + error.message });
  }
});

router.post('/backups/confirmar-restauracao', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { token } = req.body;

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.action !== 'restore') {
      return res.status(400).json({ success: false, error: 'Token inválido' });
    }

    const backupPath = path.join(__dirname, '..', 'backups', decoded.backup);

    if (!fs.existsSync(backupPath)) {
      return res.status(404).json({ success: false, error: 'Arquivo de backup não encontrado' });
    }

    let backupData;

    if (decoded.backup.endsWith('.gz')) {
      const zlib = require('zlib');
      const gunzip = zlib.createGunzip();
      const input = fs.createReadStream(backupPath);

      backupData = await new Promise((resolve, reject) => {
        let data = '';
        input.pipe(gunzip)
          .on('data', chunk => data += chunk)
          .on('end', () => resolve(JSON.parse(data)))
          .on('error', reject);
      });
    } else {
      backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    }

    await Promise.all([
      User.deleteMany({}),
      Turma.deleteMany({}),
      Prova.deleteMany({}),
      Resultado.deleteMany({}),
      ProvaRealizada.deleteMany({})
    ]);

    await User.insertMany(backupData.data.users);
    await Turma.insertMany(backupData.data.turmas);
    await Prova.insertMany(backupData.data.provas);
    await Resultado.insertMany(backupData.data.resultados);
    await ProvaRealizada.insertMany(backupData.data.provasRealizadas);

    res.json({
      success: true,
      message: 'Backup restaurado com sucesso!',
      estatisticas: backupData.estatisticas
    });

  } catch (error) {
    logger.error('❌ Erro na restauração:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/backups/excluir/:arquivo', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { arquivo } = req.params;
    logger.info(`🗑️ Admin ${req.userId} excluindo backup: ${arquivo}`);

    if (arquivo.includes('..') || arquivo.includes('/') || arquivo.includes('\\')) {
      logger.warn(`🚫 Tentativa de path traversal: ${arquivo}`);
      return res.status(400).json({ success: false, error: 'Nome de arquivo inválido' });
    }

    const backupPath = path.join(__dirname, '..', 'backups', arquivo);

    if (!fs.existsSync(backupPath)) {
      return res.status(404).json({ success: false, error: 'Arquivo de backup não encontrado' });
    }

    fs.unlinkSync(backupPath);
    logger.info(`✅ Backup excluído com sucesso: ${arquivo}`);

    res.json({ success: true, message: 'Backup excluído com sucesso!' });

  } catch (error) {
    logger.error('❌ Erro ao excluir backup:', error);
    res.status(500).json({ success: false, error: 'Erro ao excluir backup: ' + error.message });
  }
});

// ============================================================================
// MONITORAMENTO
// ============================================================================

router.get('/monitoramento/violacoes', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { dias = 7 } = req.query;
    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - parseInt(dias));

    const provasCanceladas = await ProvaRealizada.find({
      status: 'cancelada',
      dataRealizacao: { $gte: dataLimite }
    })
      .populate('alunoId', 'nome email matricula')
      .populate('provaId', 'titulo turmaId')
      .sort({ dataRealizacao: -1 });

    const estatisticas = {
      total: provasCanceladas.length,
      porMotivo: provasCanceladas.reduce((acc, p) => {
        const motivo = p.flagViolacao ? 'violacao' : 'prazo';
        acc[motivo] = (acc[motivo] || 0) + 1;
        return acc;
      }, {}),
      porDia: provasCanceladas.reduce((acc, p) => {
        const dia = p.dataRealizacao.toISOString().split('T')[0];
        acc[dia] = (acc[dia] || 0) + 1;
        return acc;
      }, {})
    };

    res.json({ success: true, provasCanceladas, estatisticas });

  } catch (error) {
    logger.error('❌ Erro no monitoramento:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// MATRÍCULAS AUTORIZADAS
// ============================================================================

router.get('/matriculas-autorizadas', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { busca } = req.query;

    let matriculas;
    if (busca) {
      matriculas = await matriculasManager.buscar(busca);
    } else {
      matriculas = await matriculasManager.listarAsync();
    }

    res.json({
      success: true,
      matriculas,
      total: matriculas.length,
      totalGeral: await matriculasManager.contar()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/matriculas-autorizadas', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { matricula, nome } = req.body;

    if (!matricula) {
      return res.status(400).json({ success: false, error: 'Matrícula é obrigatória' });
    }

    const matriculaStr = matricula.toString().replace(/\D/g, '');

    if (matriculaStr.length !== 6) {
      return res.status(400).json({ success: false, error: 'Matrícula inválida. Deve conter exatamente 6 dígitos.' });
    }

    if (!nome || nome.trim().length < 3) {
      return res.status(400).json({ success: false, error: 'Nome é obrigatório e deve ter pelo menos 3 caracteres' });
    }

    const resultado = await matriculasManager.adicionar(matriculaStr, nome.toUpperCase().trim(), req.userId);

    if (!resultado.success) {
      return res.status(400).json({ success: false, error: resultado.error });
    }

    logger.info(`✅ Admin ${req.userId} adicionou matrícula ${matriculaStr}`);

    res.json({
      success: true,
      message: 'Matrícula autorizada com sucesso!',
      matricula: resultado.matricula
    });

  } catch (error) {
    logger.error('❌ Erro:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/matriculas-autorizadas/:matricula', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { matricula } = req.params;
    const { novaMatricula, nome } = req.body;

    if (!novaMatricula) {
      return res.status(400).json({ success: false, error: 'Nova matrícula é obrigatória' });
    }

    const novaMatriculaStr = novaMatricula.toString().replace(/\D/g, '');

    if (novaMatriculaStr.length !== 6) {
      return res.status(400).json({ success: false, error: 'Matrícula inválida. Deve conter exatamente 6 dígitos.' });
    }

    if (!nome || nome.trim().length < 3) {
      return res.status(400).json({ success: false, error: 'Nome é obrigatório' });
    }

    const resultado = await matriculasManager.editar(matricula, novaMatriculaStr, nome.toUpperCase().trim(), req.userId);

    if (!resultado.success) {
      return res.status(404).json({ success: false, error: resultado.error });
    }

    logger.info(`✅ Admin ${req.userId} editou matrícula ${matricula} → ${novaMatriculaStr}`);

    res.json({ success: true, message: 'Matrícula atualizada com sucesso!' });

  } catch (error) {
    logger.error('❌ Erro:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/matriculas-autorizadas/:matricula', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { matricula } = req.params;

    const resultado = await matriculasManager.excluir(matricula, req.userId);

    if (!resultado.success) {
      return res.status(404).json({ success: false, error: resultado.error });
    }

    logger.info(`✅ Admin ${req.userId} excluiu matrícula ${matricula}`);

    res.json({ success: true, message: 'Matrícula excluída com sucesso!' });

  } catch (error) {
    logger.error('❌ Erro:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// PROFESSORES (GESTÃO)
// ============================================================================

router.get('/professores-cadastrados', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const usuarios = await User.find({
      matricula: { $exists: true, $ne: null, $ne: '' }
    }).select('nome email matricula ativo createdAt role');

    const usuariosMap = {};
    usuarios.forEach(user => {
      if (user.matricula) {
        usuariosMap[user.matricula] = {
          id: user._id,
          nome: user.nome,
          email: user.email,
          ativo: user.ativo,
          role: user.role,
          createdAt: user.createdAt
        };
      }
    });

    const stats = {
      total: usuarios.length,
      professores: usuarios.filter(u => u.role === 'professor').length,
      admins: usuarios.filter(u => u.role === 'admin').length,
      superAdmins: usuarios.filter(u => u.role === 'super_admin').length,
      ativos: usuarios.filter(u => u.ativo === true).length,
      inativos: usuarios.filter(u => u.ativo === false).length
    };

    res.json({
      success: true,
      professores: usuarios,
      mapa: usuariosMap,
      total: usuarios.length,
      estatisticas: stats
    });

  } catch (error) {
    logger.error('❌ Erro ao buscar usuários com matrícula:', error);
    res.status(500).json({ success: false, error: 'Erro ao buscar usuários: ' + error.message });
  }
});

router.get('/professores', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { status, busca } = req.query;

    let query = { role: 'professor' };
    if (status === 'ativos') query.ativo = true;
    else if (status === 'inativos') query.ativo = false;

    if (busca) {
      query.$or = [
        { nome: { $regex: busca, $options: 'i' } },
        { email: { $regex: busca, $options: 'i' } },
        { matricula: { $regex: busca, $options: 'i' } }
      ];
    }

    const professores = await User.find(query)
      .select('nome email matricula eixo ativo createdAt ultimoAcesso')
      .sort({ nome: 1 });

    logger.info(`📋 Admin ${req.userId} listou ${professores.length} professores`);

    res.json({ success: true, professores, total: professores.length });

  } catch (error) {
    logger.error('❌ Erro ao listar professores:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/professores/:id/toggle-status', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { ativo } = req.body;

    logger.info(`🔄 Admin ${req.userId} alterando status do professor ${id} para ${ativo ? 'ATIVO' : 'INATIVO'}`);

    const professor = await User.findById(id);

    if (!professor) {
      return res.status(404).json({ success: false, error: 'Professor não encontrado' });
    }

    if (professor.role !== 'professor') {
      return res.status(400).json({ success: false, error: 'Este usuário não é um professor' });
    }

    professor.ativo = ativo;
    await professor.save();

    logger.info(`✅ Professor ${professor.nome} agora está ${ativo ? 'ATIVO' : 'INATIVO'}`);

    res.json({
      success: true,
      message: `Professor ${ativo ? 'ativado' : 'inativado'} com sucesso!`,
      professor: { id: professor._id, nome: professor.nome, ativo: professor.ativo }
    });

  } catch (error) {
    logger.error('❌ Erro ao alterar status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/professores/:id', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    logger.info(`🗑️ Admin ${req.userId} tentando excluir professor ${id}`);

    const professor = await User.findById(id);

    if (!professor) {
      return res.status(404).json({ success: false, error: 'Professor não encontrado' });
    }

    if (professor.role !== 'professor') {
      return res.status(400).json({ success: false, error: 'Este usuário não é um professor' });
    }

    const [provas, turmas] = await Promise.all([
      Prova.countDocuments({ userId: id }),
      Turma.countDocuments({ professorId: id })
    ]);

    if (provas > 0 || turmas > 0) {
      return res.status(400).json({
        success: false,
        error: 'Este professor possui provas ou turmas associadas',
        detalhes: { provas, turmas },
        sugestao: 'Inative o professor em vez de excluí-lo'
      });
    }

    await User.findByIdAndDelete(id);
    logger.info(`✅ Professor ${professor.nome} excluído permanentemente`);

    res.json({ success: true, message: 'Professor excluído permanentemente!' });

  } catch (error) {
    logger.error('❌ Erro ao excluir professor:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/professores/:id/reativar', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    logger.info(`🔄 Admin ${req.userId} reativando professor ${id}`);

    const professor = await User.findById(id);

    if (!professor) {
      return res.status(404).json({ success: false, error: 'Professor não encontrado' });
    }

    professor.ativo = true;
    await professor.save();

    logger.info(`✅ Professor ${professor.nome} reativado!`);

    res.json({
      success: true,
      message: 'Professor reativado com sucesso!',
      professor: { id: professor._id, nome: professor.nome, ativo: true }
    });

  } catch (error) {
    logger.error('❌ Erro ao reativar professor:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// CONFIGURAÇÕES DO SISTEMA
// ============================================================================

router.get('/configuracoes', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    logger.info('📋 Admin buscando configurações do sistema');

    const configPadrao = {
      aparencia: {
        corPrimaria: '#667eea',
        corSecundaria: '#764ba2',
        modoEscuro: false,
        tema: 'padrao',
        animacoes: true,
        arredondamento: true,
        logoUrl: '',
        faviconUrl: ''
      },
      sistema: {
        nome: 'EducaPleno',
        versao: '1.0.0',
        ambiente: process.env.NODE_ENV || 'development',
        urlBase: process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`,
        modoManutencao: false,
        modoDebug: process.env.NODE_ENV !== 'production',
        timeoutSessao: 60,
        manutencaoMensagem: 'Sistema em manutenção. Volte mais tarde.'
      },
      seguranca: {
        jwtExpiracao: process.env.JWT_EXPIRES_IN || '24h',
        tentativasLogin: 5,
        bloqueioTempo: 15,
        doisFatores: false,
        exigirFaceIdProvas: false,
        permitirMultiplosLogins: true,
        senha: {
          forcarTrocaInicial: true,
          tamanhoMinimo: 6,
          expiracaoDias: 90,
          exigirMaiuscula: false,
          exigirNumero: false,
          exigirEspecial: false
        }
      },
      provas: {
        tempoMaximo: 240,
        tempoMinimo: 10,
        tempoAdicionalAcessibilidade: true,
        tempoAdicionalPercent: 50,
        questoesMinimas: 5,
        questoesMaximas: 50,
        correcaoAutomatica: true,
        liberacaoAutomatica: false,
        permitirRevisao: true,
        mostrarGabarito: false,
        permitirCancelamento: true,
        notificarProfessorCancelamento: true,
        habilitarEnvioProva: true
      },
      notificacoes: {
        email: true,
        sistema: true,
        push: false,
        whatsapp: false,
        lembreteProva: 24,
        lembreteCorrecao: true,
        notificarResultado: true,
        notificarCancelamento: true
      },
      email: {
        servico: process.env.EMAIL_SERVICE || 'brevo',
        host: process.env.EMAIL_HOST || 'smtp-relay.brevo.com',
        porta: parseInt(process.env.EMAIL_PORT) || 587,
        seguranca: process.env.EMAIL_SECURITY || 'tls',
        usuario: process.env.EMAIL_USER || '',
        senha: process.env.EMAIL_PASS ? '********' : '',
        remetente: process.env.EMAIL_FROM || 'naoresponder@iemasaoluiscentro.net',
        nomeRemetente: process.env.EMAIL_FROM_NAME || 'EducaPleno',
        notificacoes: true,
        lembretes: true,
        resultados: true
      },
      logs: {
        nivel: process.env.LOG_LEVEL || 'info',
        retencaoDias: 30,
        console: true,
        arquivo: true,
        auditoria: true,
        nivelAuditoria: 'medio'
      },
      backups: {
        automatico: true,
        frequencia: 'daily',
        horario: '03:00',
        manterPor: 30,
        local: 'local',
        maxBackups: 50,
        incluirArquivos: true,
        compactar: true,
        ultimoBackup: null,
        espacoUtilizado: '0 MB'
      },
      desempenho: {
        cacheTempo: 300,
        paginacaoPadrao: 20,
        maxResultados: 1000,
        compressaoRespostas: true,
        timeoutRequisicao: 30,
        limiteArquivo: 10
      },
      api: {
        rateLimit: 100,
        versao: 'v1',
        documentacao: true,
        chaveObrigatoria: false,
        cors: true,
        dominiosPermitidos: ['localhost']
      }
    };

    let configuracoes = [];
    try {
      configuracoes = await Config.find().lean();
    } catch (dbError) {
      logger.info('⚠️ Erro ao buscar configs do banco:', dbError.message);
      return res.json({ success: true, configuracoes: configPadrao, origem: 'padrao' });
    }

    if (!configuracoes || configuracoes.length === 0) {
      return res.json({ success: true, configuracoes: configPadrao, origem: 'padrao' });
    }

    const configObj = JSON.parse(JSON.stringify(configPadrao));
    const camposEncontrados = new Set();

    configuracoes.forEach(c => {
      if (!c || !c.chave) return;

      try {
        const parts = c.chave.split('.');
        let target = configObj;

        for (let i = 0; i < parts.length - 1; i++) {
          if (!target[parts[i]]) target[parts[i]] = {};
          target = target[parts[i]];
        }

        const lastKey = parts[parts.length - 1];
        target[lastKey] = c.valor;
        camposEncontrados.add(c.chave);

        logger.info(`✅ Configuração aplicada: ${c.chave} = ${c.valor}`);
      } catch (pathError) {
        logger.warn(`⚠️ Erro ao processar chave ${c.chave}:`, pathError.message);
      }
    });

    logger.info('📊 Campos encontrados no banco:', Array.from(camposEncontrados));

    const faceIdDoc = await Config.findOne({ chave: 'seguranca.exigirFaceIdProvas' }).lean();
    if (faceIdDoc) {
      if (!configObj.seguranca) configObj.seguranca = {};
      configObj.seguranca.exigirFaceIdProvas = faceIdDoc.valor;
      logger.info(`✅ Face ID carregado diretamente: ${faceIdDoc.valor}`);
    }

    logger.info('🎯 Objeto seguranca final:', configObj.seguranca);

    res.json({ success: true, configuracoes: configObj, total: configuracoes.length });

  } catch (error) {
    logger.error('❌ Erro ao buscar configurações:', error);
    res.json({ success: true, configuracoes: {}, origem: 'fallback' });
  }
});

router.put('/configuracoes', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { configuracoes } = req.body;

    logger.info('💾 Admin salvando configurações');

    if (!configuracoes || typeof configuracoes !== 'object') {
      return res.status(400).json({ success: false, error: 'Dados de configuração inválidos' });
    }

    function flattenObject(obj, prefix = '') {
      return Object.keys(obj).reduce((acc, key) => {
        const pre = prefix.length ? prefix + '.' : '';
        if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
          Object.assign(acc, flattenObject(obj[key], pre + key));
        } else {
          acc[pre + key] = obj[key];
        }
        return acc;
      }, {});
    }

    const flatConfig = flattenObject(configuracoes);

    const resultados = [];
    for (const [chave, valor] of Object.entries(flatConfig)) {
      try {
        let tipo = typeof valor;
        if (Array.isArray(valor)) tipo = 'array';
        if (valor === null) tipo = 'null';

        let categoria = 'geral';
        if (chave.startsWith('sistema')) categoria = 'sistema';
        else if (chave.startsWith('seguranca')) categoria = 'seguranca';
        else if (chave.startsWith('provas')) categoria = 'provas';
        else if (chave.startsWith('notificacoes')) categoria = 'notificacoes';
        else if (chave.startsWith('email')) categoria = 'email';
        else if (chave.startsWith('logs')) categoria = 'logs';
        else if (chave.startsWith('backups')) categoria = 'backups';
        else if (chave.startsWith('aparencia')) categoria = 'aparencia';
        else if (chave.startsWith('desempenho')) categoria = 'desempenho';
        else if (chave.startsWith('api')) categoria = 'api';

        const result = await Config.findOneAndUpdate(
          { chave },
          { chave, valor, tipo, categoria, atualizadoPor: req.userId, atualizadoEm: new Date() },
          { upsert: true, new: true }
        );
        resultados.push(result);
      } catch (itemError) {
        logger.error(`❌ Erro ao salvar ${chave}:`, itemError.message);
      }
    }

    logger.info(`✅ ${resultados.length} configurações salvas`);

    res.json({ success: true, message: 'Configurações salvas com sucesso!', total: resultados.length });

  } catch (error) {
    logger.error('❌ Erro ao salvar configurações:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/configuracoes/:chave', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { chave } = req.params;
    const config = await Config.findOne({ chave }).lean();

    if (!config) {
      return res.status(404).json({ success: false, error: 'Configuração não encontrada' });
    }

    res.json({ success: true, configuracao: config });

  } catch (error) {
    logger.error('❌ Erro ao buscar configuração:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/configuracoes/:chave', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { chave } = req.params;
    const { valor, descricao, categoria, publico } = req.body;

    const config = await Config.findOneAndUpdate(
      { chave },
      { chave, valor, descricao, categoria, publico, atualizadoPor: req.userId, atualizadoEm: new Date() },
      { upsert: true, new: true }
    );

    res.json({ success: true, message: 'Configuração atualizada com sucesso!', configuracao: config });

  } catch (error) {
    logger.error('❌ Erro ao atualizar configuração:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/configuracoes/:chave', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { chave } = req.params;
    await Config.deleteOne({ chave });

    res.json({ success: true, message: 'Configuração resetada para o padrão' });

  } catch (error) {
    logger.error('❌ Erro ao resetar configuração:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/configuracoes/reset', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    await Config.deleteMany({});
    res.json({ success: true, message: 'Todas as configurações foram resetadas!' });

  } catch (error) {
    logger.error('❌ Erro ao resetar configurações:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// EMAIL (TESTES)
// ============================================================================

router.post('/testar-email', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { destinatario } = req.body;

    if (!destinatario) {
      return res.status(400).json({ success: false, error: 'Destinatário não informado' });
    }

    const emailService = new EmailService();
    await emailService.init();

    const resultado = await emailService.sendEmail({
      to: destinatario,
      subject: '🔧 Teste de Configuração - EducaPleno',
      html: `
        <h2>Teste de Configuração</h2>
        <p>Se você recebeu este email, as configurações de email estão corretas!</p>
        <p>Data: ${new Date().toLocaleString('pt-BR')}</p>
      `
    });

    if (resultado.success) {
      res.json({ success: true, message: 'Email de teste enviado com sucesso!', destinatario });
    } else {
      throw new Error(resultado.error || 'Erro ao enviar email');
    }

  } catch (error) {
    logger.error('❌ Erro ao testar email:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/testar-email-enviar', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { destinatario, assunto, mensagem } = req.body;

    if (!destinatario) {
      return res.status(400).json({ success: false, error: 'Destinatário não informado' });
    }

    logger.info(`\n📧 ===== TESTE DE EMAIL =====`);
    logger.info(`📨 Para: ${destinatario}`);
    logger.info(`📝 Assunto: ${assunto || 'Teste do Sistema'}`);

    const emailService = new EmailService();
    await emailService.init();

    const html = mensagem || `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="UTF-8">
          <style>
              body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
              .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          </style>
      </head>
      <body>
          <div class="header">
              <h1>📧 Teste de Email</h1>
          </div>
          <div class="content">
              <h2>Olá!</h2>
              <p>Este é um email de teste do EducaPleno.</p>
              <p><strong>Data:</strong> ${new Date().toLocaleString('pt-BR')}</p>
              <p>✅ Se você recebeu este email, as configurações estão funcionando!</p>
          </div>
      </body>
      </html>
    `;

    const resultado = await emailService.sendEmail({
      to: destinatario,
      subject: assunto || '📧 Teste do EducaPleno',
      html
    });

    if (resultado.success) {
      logger.info(`✅ Email de teste enviado para ${destinatario}`);
      res.json({
        success: true,
        message: 'Email de teste enviado com sucesso!',
        destinatario,
        messageId: resultado.messageId
      });
    } else {
      throw new Error(resultado.error || 'Erro ao enviar email');
    }

  } catch (error) {
    logger.error('❌ Erro ao enviar email de teste:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/enviar-email-boas-vindas', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { destinatario, nome } = req.body;

    if (!destinatario) {
      return res.status(400).json({ success: false, error: 'Destinatário não informado' });
    }

    const nomeDestino = nome || destinatario.split('@')[0] || 'Usuário';

    logger.info(`\n🎉 ===== EMAIL DE BOAS-VINDAS =====`);
    logger.info(`📨 Para: ${destinatario}`);
    logger.info(`👤 Nome: ${nomeDestino}`);

    const emailService = new EmailService();
    await emailService.init();

    const resultado = await emailService.sendWelcomeEmail(destinatario, nomeDestino);

    if (resultado.success) {
      logger.info(`✅ Email de boas-vindas enviado para ${destinatario}`);
      res.json({
        success: true,
        message: 'Email de boas-vindas enviado com sucesso!',
        destinatario,
        messageId: resultado.messageId
      });
    } else {
      throw new Error(resultado.error || 'Erro ao enviar email');
    }

  } catch (error) {
    logger.error('❌ Erro ao enviar email de boas-vindas:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// SOLICITAÇÕES DE BACKUP
// ============================================================================

router.get('/solicitacoes-backup', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const solicitacoes = await Notificacao.find({
      usuarioId: req.userId,
      tipo: 'solicitacao_backup',
      lida: false
    }).sort({ createdAt: -1 }).lean();

    const solicitacoesCompletas = await Promise.all(solicitacoes.map(async (sol) => {
      let usuario = null;
      if (sol.dados && sol.dados.solicitanteId) {
        usuario = await User.findById(sol.dados.solicitanteId)
          .select('nome email telefone twoFactorBackupCodes');
      }

      return {
        ...sol,
        usuario: usuario ? {
          id: usuario._id,
          nome: usuario.nome,
          email: usuario.email,
          telefone: usuario.telefoneFormatado || usuario.telefone,
          codigosAtuais: usuario.twoFactorBackupCodes ? usuario.twoFactorBackupCodes.length : 0
        } : null
      };
    }));

    res.json({
      success: true,
      solicitacoes: solicitacoesCompletas,
      total: solicitacoesCompletas.length
    });

  } catch (error) {
    logger.error('❌ Erro ao buscar solicitações:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// 2FA BACKUP CODES
// ============================================================================

router.post('/2fa/gerar-backup-codes/:userId', authenticateTokenLocal, async (req, res) => {
  try {
    if (req.userRole !== 'admin' && req.userRole !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Apenas administradores podem gerar códigos de backup'
      });
    }

    const { userId } = req.params;
    logger.info(`🔑 Admin ${req.userId} gerando 10 códigos de backup para usuário ${userId}`);

    const user = await User.findById(userId).select(
      '+twoFactorEnabled +twoFactorBackupCodes +twoFactorBackupCodesShown'
    );

    if (!user) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    }

    if (!user.twoFactorEnabled) {
      return res.status(400).json({ success: false, error: '2FA não está ativado para este usuário' });
    }

    const backupCodes = [];
    for (let i = 0; i < 10; i++) {
      backupCodes.push(generateBackupCode());
    }

    user.twoFactorBackupCodes = backupCodes;
    user.twoFactorBackupCodesShown = false;
    await user.save();

    logger.info(`✅ Admin gerou 10 códigos para ${user.email}:`, backupCodes);
    logger.info(`📝 LOG: Admin ${req.userId} gerou códigos para ${user.email} em ${new Date().toISOString()}`);

    res.json({
      success: true,
      message: '10 códigos de backup gerados com sucesso!',
      backupCodes,
      total: backupCodes.length,
      usuario: { id: user._id, nome: user.nome, email: user.email }
    });

  } catch (error) {
    logger.error('❌ Erro:', error);
    res.status(500).json({ success: false, error: 'Erro interno: ' + error.message });
  }
});

router.get('/2fa/usuarios', authenticateTokenLocal, async (req, res) => {
  try {
    if (req.userRole !== 'admin' && req.userRole !== 'super_admin') {
      return res.status(403).json({ success: false, error: 'Apenas administradores podem acessar esta rota' });
    }

    const usuarios = await User.find({ twoFactorEnabled: true })
      .select('nome email telefone twoFactorBackupCodesShown twoFactorBackupCodes');

    const usuariosFormatados = usuarios.map(u => ({
      id: u._id,
      nome: u.nome,
      email: u.email,
      telefone: u.telefoneFormatado || u.telefone,
      temCodigosBackup: u.twoFactorBackupCodes ? u.twoFactorBackupCodes.length : 0,
      codigosRestantes: u.twoFactorBackupCodes ? u.twoFactorBackupCodes.length : 0,
      codigosJaMostrados: u.twoFactorBackupCodesShown || false
    }));

    res.json({ success: true, usuarios: usuariosFormatados, total: usuariosFormatados.length });

  } catch (error) {
    logger.error('❌ Erro:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/2fa/ver-codigos/:userId', authenticateTokenLocal, async (req, res) => {
  try {
    if (req.userRole !== 'admin' && req.userRole !== 'super_admin') {
      return res.status(403).json({ success: false, error: 'Apenas administradores podem ver códigos de backup' });
    }

    const { userId } = req.params;

    const user = await User.findById(userId).select('+twoFactorBackupCodes +twoFactorEnabled');

    if (!user) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    }

    res.json({
      success: true,
      usuario: { id: user._id, nome: user.nome, email: user.email },
      backupCodes: user.twoFactorBackupCodes || [],
      total: user.twoFactorBackupCodes ? user.twoFactorBackupCodes.length : 0
    });

  } catch (error) {
    logger.error('❌ Erro:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// RESET ACCESS
// ============================================================================

router.post('/reset-access', authenticateTokenLocal, async (req, res) => {
  try {
    if (req.userRole !== 'super_admin') {
      return res.status(403).json({ success: false, error: 'Apenas Super Admins podem resetar acessos' });
    }

    logger.info(`🔄 Super Admin ${req.userId} iniciando reset de acessos...`);

    const admin = await User.findById(req.userId).select('nome email');

    const usuarios = await User.find({ role: { $ne: 'super_admin' } });

    const configDoc = await Config.findOne({ chave: 'notificacoes' });
    const pushAtivado = configDoc?.valor?.push === true;
    const OneSignalService = require('../services/onesignal-service');
    const oneSignal = pushAtivado ? new OneSignalService() : null;

    let contador = 0;
    const estatisticas = { alunos: 0, professores: 0, admins: 0 };

    for (const user of usuarios) {
      user.tokenVersion = (user.tokenVersion || 0) + 1;
      user.ultimoResetAcesso = new Date();

      await user.save();
      contador++;

      try {
        const notificacao = new Notificacao({
          usuarioId: user._id,
          tipo: 'sistema',
          titulo: '🔐 Sessão Encerrada',
          mensagem: `O administrador ${admin.nome} resetou os acessos do sistema. Faça login novamente para continuar.`,
          icone: '🔐',
          cor: '#dc2626',
          link: '/login.html',
          prioridade: 5,
          dados: {
            tipo: 'reset_acesso',
            motivo: 'reset_global',
            adminId: admin._id,
            adminNome: admin.nome,
            data: new Date().toISOString()
          }
        });

        await notificacao.save();
        logger.info(`✅ Notificação enviada para ${user.email}`);

        if (pushAtivado && oneSignal && user.onesignalPlayerId) {
          await oneSignal.enviarPush(
            user._id,
            '🔐 Sessão Encerrada',
            `O administrador ${admin.nome} resetou os acessos do sistema. Faça login novamente.`,
            { tipo: 'reset_acesso', adminNome: admin.nome }
          );
        }

      } catch (notifError) {
        logger.warn(`⚠️ Erro ao notificar ${user.email}:`, notifError.message);
      }

      if (user.role === 'aluno') estatisticas.alunos++;
      else if (user.role === 'professor') estatisticas.professores++;
      else if (user.role === 'admin') estatisticas.admins++;
    }

    logger.info(`✅ Reset concluído! ${contador} usuários afetados`);

    res.json({
      success: true,
      message: `Acessos resetados para ${contador} usuários!`,
      totalAfetados: contador,
      estatisticas,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('❌ Erro ao resetar acessos:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// EIXOS
// ============================================================================

router.get('/eixos', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    logger.info(`📋 Admin ${req.userId} listando eixos`);
    const eixos = await Eixo.find().sort({ label: 1 }).lean();
    res.json({ success: true, eixos });
  } catch (error) {
    logger.error('❌ Erro ao listar eixos:', error);
    res.status(500).json({ success: false, error: 'Erro ao listar eixos: ' + error.message });
  }
});

router.post('/eixos', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { nome, label, cor, icone, descricao } = req.body;
    logger.info(`📝 Admin ${req.userId} criando eixo: ${nome}`);

    if (!nome || !label) {
      return res.status(400).json({ success: false, error: 'Nome e label são obrigatórios' });
    }

    const existe = await Eixo.findOne({ nome });
    if (existe) {
      return res.status(400).json({ success: false, error: 'Já existe um eixo com este nome' });
    }

    const eixo = new Eixo({
      nome, label,
      cor: cor || '#667eea',
      icone: icone || 'fa-graduation-cap',
      descricao,
      ativo: true
    });

    await eixo.save();
    logger.info(`✅ Eixo ${nome} criado com sucesso`);

    res.status(201).json({
      success: true,
      message: 'Eixo criado com sucesso!',
      eixo: {
        _id: eixo._id,
        nome: eixo.nome,
        label: eixo.label,
        cor: eixo.cor,
        icone: eixo.icone,
        descricao: eixo.descricao
      }
    });

  } catch (error) {
    logger.error('❌ Erro ao criar eixo:', error);
    res.status(500).json({ success: false, error: 'Erro ao criar eixo: ' + error.message });
  }
});

router.put('/eixos/:id', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, label, cor, icone, descricao } = req.body;
    logger.info(`✏️ Admin ${req.userId} atualizando eixo ${id}`);

    const eixo = await Eixo.findById(id);
    if (!eixo) return res.status(404).json({ success: false, error: 'Eixo não encontrado' });

    if (nome && nome !== eixo.nome) {
      const existe = await Eixo.findOne({ nome, _id: { $ne: id } });
      if (existe) return res.status(400).json({ success: false, error: 'Já existe outro eixo com este nome' });
    }

    if (nome) eixo.nome = nome;
    if (label) eixo.label = label;
    if (cor) eixo.cor = cor;
    if (icone) eixo.icone = icone;
    if (descricao !== undefined) eixo.descricao = descricao;

    await eixo.save();
    logger.info(`✅ Eixo ${eixo.nome} atualizado com sucesso`);

    res.json({
      success: true,
      message: 'Eixo atualizado com sucesso!',
      eixo: {
        _id: eixo._id,
        nome: eixo.nome,
        label: eixo.label,
        cor: eixo.cor,
        icone: eixo.icone,
        descricao: eixo.descricao
      }
    });

  } catch (error) {
    logger.error('❌ Erro ao atualizar eixo:', error);
    res.status(500).json({ success: false, error: 'Erro ao atualizar eixo: ' + error.message });
  }
});

router.delete('/eixos/:id', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    logger.info(`🗑️ Admin ${req.userId} excluindo eixo ${id}`);

    const cursosComEixo = await Curso.countDocuments({ eixoId: id });
    if (cursosComEixo > 0) {
      return res.status(400).json({
        success: false,
        error: `Este eixo possui ${cursosComEixo} curso(s) vinculado(s). Remova os cursos primeiro ou reassocie-os a outro eixo.`
      });
    }

    const eixo = await Eixo.findByIdAndDelete(id);
    if (!eixo) return res.status(404).json({ success: false, error: 'Eixo não encontrado' });

    logger.info(`✅ Eixo ${eixo.nome} excluído com sucesso`);
    res.json({ success: true, message: 'Eixo excluído com sucesso!' });

  } catch (error) {
    logger.error('❌ Erro ao excluir eixo:', error);
    res.status(500).json({ success: false, error: 'Erro ao excluir eixo: ' + error.message });
  }
});

// ============================================================================
// CURSOS
// ============================================================================

router.get('/cursos', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    logger.info(`📋 Admin ${req.userId} listando cursos`);
    const cursos = await Curso.find()
      .populate('eixoId', 'nome label cor icone')
      .sort({ nome: 1 })
      .lean();

    const cursosComInfo = cursos.map(curso => ({
      _id: curso._id,
      nome: curso.nome,
      eixoId: curso.eixoId,
      turmas: curso.turmas || [],
      ativo: curso.ativo,
      createdAt: curso.createdAt,
      totalTurmas: curso.turmas?.length || 0
    }));

    res.json({ success: true, cursos: cursosComInfo });

  } catch (error) {
    logger.error('❌ Erro ao listar cursos:', error);
    res.status(500).json({ success: false, error: 'Erro ao listar cursos: ' + error.message });
  }
});

router.post('/cursos', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { nome, eixoId } = req.body;
    logger.info(`📝 Admin ${req.userId} criando curso: ${nome}`);

    if (!nome || !eixoId) {
      return res.status(400).json({ success: false, error: 'Nome do curso e Eixo são obrigatórios' });
    }

    const eixo = await Eixo.findById(eixoId);
    if (!eixo) return res.status(404).json({ success: false, error: 'Eixo não encontrado' });

    const existe = await Curso.findOne({ nome: nome.toUpperCase() });
    if (existe) return res.status(400).json({ success: false, error: 'Já existe um curso com este nome' });

    const curso = new Curso({
      nome: nome.toUpperCase(),
      eixoId,
      turmas: [],
      ativo: true
    });

    await curso.save();
    logger.info(`✅ Curso ${curso.nome} criado com sucesso`);

    const cursoCompleto = await Curso.findById(curso._id).populate('eixoId');

    res.status(201).json({
      success: true,
      message: 'Curso criado com sucesso!',
      curso: {
        _id: cursoCompleto._id,
        nome: cursoCompleto.nome,
        eixoId: cursoCompleto.eixoId,
        turmas: cursoCompleto.turmas,
        ativo: cursoCompleto.ativo
      }
    });

  } catch (error) {
    logger.error('❌ Erro ao criar curso:', error);
    res.status(500).json({ success: false, error: 'Erro ao criar curso: ' + error.message });
  }
});

router.put('/cursos/:id', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, eixoId, ativo } = req.body;
    logger.info(`✏️ Admin ${req.userId} atualizando curso ${id}`);

    const curso = await Curso.findById(id);
    if (!curso) return res.status(404).json({ success: false, error: 'Curso não encontrado' });

    if (eixoId && eixoId !== curso.eixoId.toString()) {
      const eixo = await Eixo.findById(eixoId);
      if (!eixo) return res.status(404).json({ success: false, error: 'Eixo não encontrado' });
    }

    if (nome && nome.toUpperCase() !== curso.nome) {
      const existe = await Curso.findOne({ nome: nome.toUpperCase(), _id: { $ne: id } });
      if (existe) return res.status(400).json({ success: false, error: 'Já existe outro curso com este nome' });
    }

    if (nome) curso.nome = nome.toUpperCase();
    if (eixoId) curso.eixoId = eixoId;
    if (ativo !== undefined) curso.ativo = ativo;

    await curso.save();
    logger.info(`✅ Curso ${curso.nome} atualizado com sucesso`);

    const cursoCompleto = await Curso.findById(curso._id).populate('eixoId');

    res.json({
      success: true,
      message: 'Curso atualizado com sucesso!',
      curso: {
        _id: cursoCompleto._id,
        nome: cursoCompleto.nome,
        eixoId: cursoCompleto.eixoId,
        turmas: cursoCompleto.turmas,
        ativo: cursoCompleto.ativo
      }
    });

  } catch (error) {
    logger.error('❌ Erro ao atualizar curso:', error);
    res.status(500).json({ success: false, error: 'Erro ao atualizar curso: ' + error.message });
  }
});

router.delete('/cursos/:id', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    logger.info(`🗑️ Admin ${req.userId} excluindo curso ${id}`);

    const curso = await Curso.findById(id);
    if (!curso) return res.status(404).json({ success: false, error: 'Curso não encontrado' });

    if (curso.turmas && curso.turmas.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Este curso possui ${curso.turmas.length} turma(s). Exclua as turmas primeiro.`
      });
    }

    const alunosNoCurso = await User.countDocuments({ curso: curso.nome, role: 'aluno' });
    if (alunosNoCurso > 0) {
      return res.status(400).json({
        success: false,
        error: `Este curso possui ${alunosNoCurso} aluno(s) matriculado(s). Remova os alunos do curso primeiro.`
      });
    }

    await Curso.findByIdAndDelete(id);
    logger.info(`✅ Curso ${curso.nome} excluído com sucesso`);

    res.json({ success: true, message: 'Curso excluído com sucesso!' });

  } catch (error) {
    logger.error('❌ Erro ao excluir curso:', error);
    res.status(500).json({ success: false, error: 'Erro ao excluir curso: ' + error.message });
  }
});

// ============================================================================
// CURSOS — TURMAS
// ============================================================================

router.post('/cursos/:cursoId/turmas', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { cursoId } = req.params;
    const { codigo, periodo, vagas } = req.body;
    logger.info(`📝 Admin ${req.userId} adicionando turma ao curso ${cursoId}`);

    const curso = await Curso.findById(cursoId);
    if (!curso) return res.status(404).json({ success: false, error: 'Curso não encontrado' });

    if (!codigo || !periodo) {
      return res.status(400).json({ success: false, error: 'Código e período são obrigatórios' });
    }

    const turmaExistente = curso.turmas.find(t => t.codigo === codigo.toUpperCase());
    if (turmaExistente) {
      return res.status(400).json({ success: false, error: 'Já existe uma turma com este código neste curso' });
    }

    const novaTurma = {
      codigo: codigo.toUpperCase(),
      periodo,
      vagas: vagas || 40,
      ativa: true
    };

    curso.turmas.push(novaTurma);
    await curso.save();

    logger.info(`✅ Turma ${codigo} adicionada ao curso ${curso.nome}`);

    res.status(201).json({ success: true, message: 'Turma adicionada com sucesso!', turma: novaTurma });

  } catch (error) {
    logger.error('❌ Erro ao adicionar turma:', error);
    res.status(500).json({ success: false, error: 'Erro ao adicionar turma: ' + error.message });
  }
});

router.put('/cursos/:cursoId/turmas/:turmaId', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { cursoId, turmaId } = req.params;
    const { codigo, periodo, vagas, ativa } = req.body;
    logger.info(`✏️ Admin ${req.userId} editando turma ${turmaId} do curso ${cursoId}`);

    const curso = await Curso.findById(cursoId);
    if (!curso) return res.status(404).json({ success: false, error: 'Curso não encontrado' });

    const turma = curso.turmas.id(turmaId);
    if (!turma) return res.status(404).json({ success: false, error: 'Turma não encontrada' });

    if (codigo) turma.codigo = codigo.toUpperCase();
    if (periodo) turma.periodo = periodo;
    if (vagas) turma.vagas = vagas;
    if (ativa !== undefined) turma.ativa = ativa;

    await curso.save();
    logger.info(`✅ Turma ${turma.codigo} atualizada com sucesso`);

    res.json({ success: true, message: 'Turma atualizada com sucesso!', turma });

  } catch (error) {
    logger.error('❌ Erro ao editar turma:', error);
    res.status(500).json({ success: false, error: 'Erro ao editar turma: ' + error.message });
  }
});

router.delete('/cursos/:cursoId/turmas/:turmaId', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { cursoId, turmaId } = req.params;
    logger.info(`🗑️ Admin ${req.userId} removendo turma ${turmaId} do curso ${cursoId}`);

    const curso = await Curso.findById(cursoId);
    if (!curso) return res.status(404).json({ success: false, error: 'Curso não encontrado' });

    const turma = curso.turmas.id(turmaId);
    if (!turma) return res.status(404).json({ success: false, error: 'Turma não encontrada' });

    await Curso.updateOne({ _id: cursoId }, { $pull: { turmas: { _id: turmaId } } });

    logger.info(`✅ Turma ${turma.codigo} removida com sucesso`);
    res.json({ success: true, message: 'Turma removida com sucesso!' });

  } catch (error) {
    logger.error('❌ Erro ao remover turma:', error);
    res.status(500).json({ success: false, error: 'Erro ao remover turma: ' + error.message });
  }
});

// ============================================================================
// FACES — ROTAS ESPECÍFICAS PRIMEIRO
// ============================================================================

router.get('/faces/todos', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    logger.info(`📋 Admin ${req.userId} listando faces (página ${page}, limite ${limit})`);

    const [faces, total] = await Promise.all([
      FaceID.find().sort({ dataCadastro: -1 }).skip(skip).limit(parseInt(limit)).lean(),
      FaceID.countDocuments()
    ]);

    logger.info(`✅ ${faces.length} faces encontradas (total: ${total})`);

    res.json({
      success: true,
      faces,
      total,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    logger.error('❌ Erro ao listar faces:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/faces/usuario/:usuarioId', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { usuarioId } = req.params;
    const face = await FaceID.findOne({ usuarioId }).lean();

    res.json({ success: true, temFace: !!face, face: face || null });

  } catch (error) {
    logger.error('❌ Erro ao buscar face por usuário:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// FACES — :id
// ============================================================================

router.get('/faces/:id', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    logger.info(`🔍 Admin ${req.userId} buscando face ${id}`);

    const face = await FaceID.findById(id).lean();
    if (!face) return res.status(404).json({ success: false, error: 'Face não encontrada' });

    res.json({ success: true, face });

  } catch (error) {
    logger.error('❌ Erro ao buscar face:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/faces/:id', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { ativo, totalValidacoes } = req.body;
    logger.info(`✏️ Admin ${req.userId} atualizando face ${id}`);

    const face = await FaceID.findById(id);
    if (!face) return res.status(404).json({ success: false, error: 'Face não encontrada' });

    if (ativo !== undefined) face.ativo = ativo;
    if (totalValidacoes !== undefined) face.totalValidacoes = totalValidacoes;

    await face.save();
    logger.info(`✅ Face ${id} atualizada com sucesso`);

    res.json({ success: true, message: 'Face atualizada com sucesso' });

  } catch (error) {
    logger.error('❌ Erro ao atualizar face:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/faces/:id/registrar-validacao', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    logger.info(`📸 Admin ${req.userId} registrando validação manual para face ${id}`);

    const face = await FaceID.findById(id);
    if (!face) return res.status(404).json({ success: false, error: 'Face não encontrada' });

    face.totalValidacoes = (face.totalValidacoes || 0) + 1;
    face.ultimaValidacao = new Date();
    await face.save();

    logger.info(`✅ Validação registrada para face ${id}. Total: ${face.totalValidacoes}`);

    res.json({
      success: true,
      message: 'Validação registrada',
      totalValidacoes: face.totalValidacoes,
      ultimaValidacao: face.ultimaValidacao
    });

  } catch (error) {
    logger.error('❌ Erro ao registrar validação:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/faces/:id/historico', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const face = await FaceID.findById(id).lean();
    if (!face) return res.status(404).json({ success: false, error: 'Face não encontrada' });

    const historico = [];
    if (face.dataCadastro) historico.push({ tipo: 'cadastro', data: face.dataCadastro, descricao: 'Face ID cadastrada' });
    if (face.ultimaValidacao) historico.push({ tipo: 'validacao', data: face.ultimaValidacao, descricao: 'Validação facial realizada' });

    historico.sort((a, b) => new Date(b.data) - new Date(a.data));

    res.json({ success: true, historico });

  } catch (error) {
    logger.error('❌ Erro ao buscar histórico:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/faces/:id/toggle-status', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { ativo } = req.body;
    logger.info(`🔄 Admin ${req.userId} alterando status da face ${id} para ${ativo ? 'ATIVO' : 'INATIVO'}`);

    const face = await FaceID.findById(id);
    if (!face) return res.status(404).json({ success: false, error: 'Face não encontrada' });

    face.ativo = ativo;
    await face.save();

    logger.info(`✅ Status da face ${id} alterado para ${ativo ? 'ativo' : 'inativo'}`);

    res.json({ success: true, message: `Face ${ativo ? 'ativada' : 'inativada'} com sucesso` });

  } catch (error) {
    logger.error('❌ Erro ao alterar status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/faces/:id', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    logger.info(`🗑️ Admin ${req.userId} excluindo face ${id}`);

    const face = await FaceID.findByIdAndDelete(id);
    if (!face) return res.status(404).json({ success: false, error: 'Face não encontrada' });

    logger.info(`✅ Face ${id} excluída com sucesso`);
    res.json({ success: true, message: 'Face excluída com sucesso' });

  } catch (error) {
    logger.error('❌ Erro ao excluir face:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// LOCALIZAÇÕES
// ============================================================================

router.get('/localizacoes/ativas', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { minutos = 15 } = req.query;
    const dataLimite = new Date(Date.now() - minutos * 60 * 1000);

    if (!Localizacao) {
      logger.error('❌ Modelo Localizacao não encontrado!');
      return res.status(500).json({ success: false, error: 'Modelo de localização não configurado' });
    }

    const localizacoesAtivas = await Localizacao.find({ timestamp: { $gte: dataLimite } })
      .populate('alunoId', 'nome email matricula turma')
      .sort({ timestamp: -1 })
      .limit(50)
      .lean();

    const alunosComLocalizacao = await Localizacao.distinct('alunoId');
    const ultimasLocalizacoes = [];

    for (const alunoId of alunosComLocalizacao) {
      const jaEstaAtivo = localizacoesAtivas.some(l =>
        l.alunoId && l.alunoId._id && l.alunoId._id.toString() === alunoId.toString()
      );

      if (!jaEstaAtivo) {
        const ultima = await Localizacao.findOne({ alunoId })
          .populate('alunoId', 'nome email matricula turma')
          .sort({ timestamp: -1 })
          .limit(1)
          .lean();

        if (ultima) ultimasLocalizacoes.push(ultima);
      }
    }

    const formatarLocalizacao = (l) => ({
      alunoId: l.alunoId?._id,
      alunoNome: l.alunoId?.nome || 'Aluno',
      alunoEmail: l.alunoId?.email,
      alunoMatricula: l.alunoId?.matricula,
      alunoTurma: l.alunoId?.turma,
      latitude: l.latitude,
      longitude: l.longitude,
      accuracy: l.accuracy,
      timestamp: l.timestamp
    });

    const ativas = localizacoesAtivas.map(formatarLocalizacao);
    const ultimas = ultimasLocalizacoes.map(formatarLocalizacao);

    res.json({
      success: true,
      localizacoes: ativas,
      ultimasLocalizacoes: ultimas,
      total: ativas.length + ultimas.length
    });

  } catch (error) {
    logger.error('❌ Erro ao buscar localizações:');
    logger.error('   Nome:', error.name);
    logger.error('   Mensagem:', error.message);
    logger.error('   Stack:', error.stack);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/localizacoes/historico/:alunoId', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { alunoId } = req.params;
    const { limite = 20 } = req.query;

    logger.info(`📋 Admin ${req.userId} buscando histórico de localizações do aluno ${alunoId}`);

    const localizacoes = await Localizacao.find({ alunoId })
      .populate('alunoId', 'nome email matricula turma')
      .sort({ timestamp: -1 })
      .limit(parseInt(limite))
      .lean();

    const resultado = localizacoes.map(l => ({
      alunoId: l.alunoId?._id,
      alunoNome: l.alunoId?.nome,
      alunoMatricula: l.alunoId?.matricula,
      latitude: l.latitude,
      longitude: l.longitude,
      accuracy: l.accuracy,
      timestamp: l.timestamp,
      provaId: l.provaId
    }));

    logger.info(`✅ ${resultado.length} registros encontrados`);

    res.json({ success: true, localizacoes: resultado, total: resultado.length });

  } catch (error) {
    logger.error('❌ Erro ao buscar histórico:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// ONESIGNAL (ADMIN)
// ============================================================================

router.get('/onesignal/dispositivos', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { limit = 300, offset = 0 } = req.query;

    const oneSignalRes = await oneSignalAdmin.listarDispositivos(parseInt(limit), parseInt(offset));

    if (!oneSignalRes.success) {
      return res.status(500).json({ success: false, error: oneSignalRes.error });
    }

    const usuarios = await User.find({
      onesignalPlayerId: { $exists: true, $ne: null, $ne: '' }
    }).select('nome email role matricula turma ativo onesignalPlayerId ultimaValidacaoPush');

    const usuariosMap = {};
    usuarios.forEach(u => {
      if (u.onesignalPlayerId) usuariosMap[u.onesignalPlayerId] = u;
    });

    const dispositivos = oneSignalRes.players.map(p => {
      const usuario = usuariosMap[p.id] || null;
      return {
        playerId: p.id,
        identifier: p.identifier || null,
        deviceType: p.device_type,
        deviceModel: p.device_model,
        deviceOs: p.device_os,
        createdAt: p.created_at,
        lastActive: p.last_active,
        language: p.language,
        timezone: p.timezone,
        tags: p.tags || {},
        testType: p.test_type,
        sessionCount: p.session_count,
        sdk: p.sdk,
        notificationTypes: p.notification_types,
        usuario: usuario ? {
          id: usuario._id,
          nome: usuario.nome,
          email: usuario.email,
          role: usuario.role,
          matricula: usuario.matricula,
          turma: usuario.turma,
          ativo: usuario.ativo,
          ultimaValidacao: usuario.ultimaValidacaoPush
        } : null,
        status: usuario ? 'vinculado' : 'nao_vinculado'
      };
    });

    const total = oneSignalRes.total;
    const vinculados = dispositivos.filter(d => d.status === 'vinculado').length;
    const naoVinculados = total - vinculados;

    res.json({
      success: true,
      dispositivos,
      paginacao: {
        total,
        offset: oneSignalRes.offset,
        limit: oneSignalRes.limit,
        temMais: (oneSignalRes.offset + oneSignalRes.limit) < total
      },
      estatisticas: { total, vinculados, naoVinculados }
    });

  } catch (error) {
    logger.error('❌ Erro ao listar dispositivos:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/onesignal/dispositivo/:playerId', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { playerId } = req.params;

    const oneSignalRes = await oneSignalAdmin.buscarDispositivo(playerId);

    if (!oneSignalRes.success) {
      return res.status(404).json({ success: false, error: oneSignalRes.error });
    }

    const usuario = await User.findOne({ onesignalPlayerId: playerId })
      .select('nome email role matricula turma ativo onesignalPlayerId ultimaValidacaoPush');

    res.json({
      success: true,
      dispositivo: oneSignalRes.dispositivo,
      usuario: usuario || null
    });

  } catch (error) {
    logger.error('❌ Erro ao buscar dispositivo:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/onesignal/vincular', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { playerId, usuarioId } = req.body;

    logger.info(`🔗 Admin ${req.userId} vinculando dispositivo ${playerId} ao usuário ${usuarioId}`);

    const usuario = await User.findById(usuarioId);
    if (!usuario) return res.status(404).json({ success: false, error: 'Usuário não encontrado' });

    if (usuario.onesignalPlayerId && usuario.onesignalPlayerId !== playerId) {
      await oneSignalAdmin.atualizarTags(usuario.onesignalPlayerId, {
        usuario_id: null, nome: null, email: null, role: null,
        desvinculado_em: new Date().toISOString()
      });
    }

    usuario.onesignalPlayerId = playerId;
    usuario.ultimaValidacaoPush = new Date();
    await usuario.save();

    await oneSignalAdmin.atualizarTags(playerId, {
      usuario_id: usuario._id.toString(),
      nome: usuario.nome,
      email: usuario.email,
      role: usuario.role,
      matricula: usuario.matricula || '',
      vinculado_em: new Date().toISOString(),
      vinculado_por: req.userNome || 'Admin'
    });

    const admin = await User.findById(req.userId).select('nome');

    res.json({
      success: true,
      message: 'Dispositivo vinculado com sucesso',
      usuario: {
        id: usuario._id,
        nome: usuario.nome,
        email: usuario.email,
        role: usuario.role
      },
      admin: admin?.nome || 'Administrador'
    });

  } catch (error) {
    logger.error('❌ Erro ao vincular dispositivo:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/onesignal/desvincular/:playerId', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { playerId } = req.params;
    logger.info(`🔓 Admin ${req.userId} desvinculando dispositivo ${playerId}`);

    const usuario = await User.findOne({ onesignalPlayerId: playerId });

    if (usuario) {
      usuario.onesignalPlayerId = null;
      await usuario.save();
    }

    await oneSignalAdmin.atualizarTags(playerId, {
      usuario_id: null, nome: null, email: null, role: null, matricula: null,
      desvinculado_em: new Date().toISOString(),
      desvinculado_por: req.userNome || 'Admin'
    });

    res.json({ success: true, message: 'Dispositivo desvinculado com sucesso' });

  } catch (error) {
    logger.error('❌ Erro ao desvincular dispositivo:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/onesignal/dispositivo/:playerId', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { playerId } = req.params;
    logger.info(`🗑️ Admin ${req.userId} deletando dispositivo ${playerId} do OneSignal`);

    await User.findOneAndUpdate({ onesignalPlayerId: playerId }, { onesignalPlayerId: null });

    const resultado = await oneSignalAdmin.deletarDispositivo(playerId);
    if (!resultado.success) return res.status(500).json({ success: false, error: resultado.error });

    res.json({ success: true, message: 'Dispositivo removido permanentemente do OneSignal' });

  } catch (error) {
    logger.error('❌ Erro ao deletar dispositivo:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/onesignal/testar/:playerId', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { playerId } = req.params;
    const { titulo, mensagem } = req.body;

    logger.info(`📱 Admin ${req.userId} enviando teste para ${playerId}`);

    const admin = await User.findById(req.userId).select('nome');
    const adminNome = admin?.nome || 'Administrador';

    const resultado = await oneSignalAdmin.enviarNotificacaoTeste(
      playerId,
      titulo || '🔔 Teste do Administrador',
      mensagem || 'Esta é uma notificação de teste enviada pelo administrador.',
      adminNome
    );

    if (!resultado.success) {
      return res.status(500).json({ success: false, error: resultado.error });
    }

    await User.findOneAndUpdate(
      { onesignalPlayerId: playerId },
      { ultimaValidacaoPush: new Date() }
    );

    res.json({
      success: true,
      message: 'Notificação de teste enviada com sucesso',
      notificationId: resultado.notificationId
    });

  } catch (error) {
    logger.error('❌ Erro ao enviar teste:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/onesignal/estatisticas', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const statsAPI = await oneSignalAdmin.obterEstatisticas();

    const [totalUsuarios, usuariosComPush] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ onesignalPlayerId: { $exists: true, $ne: null, $ne: '' } })
    ]);

    res.json({
      success: true,
      oneSignal: statsAPI.success ? statsAPI.estatisticas : null,
      banco: {
        totalUsuarios,
        usuariosComPush,
        taxaAdesao: totalUsuarios > 0 ? ((usuariosComPush / totalUsuarios) * 100).toFixed(1) : 0
      }
    });

  } catch (error) {
    logger.error('❌ Erro ao buscar estatísticas:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/onesignal/enviar-massa', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { playerIds, titulo, mensagem, dados = {} } = req.body;

    if (!playerIds || !Array.isArray(playerIds) || playerIds.length === 0) {
      return res.status(400).json({ success: false, error: 'Lista de playerIds é obrigatória' });
    }

    logger.info(`📤 Enviando push em massa para ${playerIds.length} dispositivos`);

    const axios = require('axios');

    const LOTE = 2000;
    let enviados = 0;
    let erros = 0;

    for (let i = 0; i < playerIds.length; i += LOTE) {
      const lote = playerIds.slice(i, i + LOTE);

      try {
        const payload = {
          app_id: process.env.ONESIGNAL_APP_ID,
          include_player_ids: lote,
          headings: { en: titulo, pt: titulo },
          contents: { en: mensagem, pt: mensagem },
          data: { ...dados, timestamp: Date.now() },
          android_sound: 'notification',
          android_led_color: 'FF0D6EFD',
          android_accent_color: 'FF0D6EFD',
          small_icon: 'ic_notification',
          priority: 10,
          ttl: 86400
        };

        const response = await axios.post(
          'https://onesignal.com/api/v1/notifications',
          payload,
          {
            headers: {
              'Authorization': `Basic ${process.env.ONESIGNAL_REST_API_KEY}`,
              'Content-Type': 'application/json'
            }
          }
        );

        if (response.data && response.data.id) {
          enviados += lote.length;
        } else {
          erros += lote.length;
        }

        if (i + LOTE < playerIds.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }

      } catch (error) {
        logger.error(`❌ Erro no lote ${i}-${i + LOTE}:`, error.message);
        erros += lote.length;
      }
    }

    res.json({ success: true, enviados, erros, total: playerIds.length });

  } catch (error) {
    logger.error('❌ Erro:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/onesignal/solicitar-vinculo-massa', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    logger.info('='.repeat(60));
    logger.info(`📨 Admin ${req.userId} solicitando vínculo em massa...`);
    logger.info('='.repeat(60));

    const dispositivosResp = await oneSignalAdmin.listarDispositivos(300, 0);

    if (!dispositivosResp.success) {
      throw new Error('Erro ao buscar dispositivos do OneSignal');
    }

    const todosDispositivos = dispositivosResp.players || dispositivosResp.dispositivos || [];
    logger.info(`📱 ${todosDispositivos.length} dispositivos no OneSignal`);

    const usuariosVinculados = await User.find({
      onesignalPlayerId: { $exists: true, $ne: null, $ne: '' }
    }).select('onesignalPlayerId');

    const playerIdsVinculados = new Set(usuariosVinculados.map(u => u.onesignalPlayerId));

    const dispositivosOrfaos = todosDispositivos.filter(d => {
      const pid = d.id || d.playerId;
      return pid && !playerIdsVinculados.has(pid);
    });

    logger.info(`📱 ${dispositivosOrfaos.length} órfãos encontrados`);

    if (dispositivosOrfaos.length === 0) {
      return res.json({
        success: true,
        message: 'Todos os dispositivos já estão vinculados',
        enviados: 0,
        notificacoesInternas: 0,
        erros: 0,
        total: 0
      });
    }

    const BASE_URL = process.env.NODE_ENV === 'development'
      ? 'http://localhost:3000'
      : 'https://www.educapleno.com';

    let enviados = 0;
    let erros = 0;
    const errosDetalhes = [];

    logger.info(`\n📱 ENVIANDO PUSH PARA ${dispositivosOrfaos.length} DISPOSITIVOS...`);

    for (const dispositivo of dispositivosOrfaos) {
      const playerId = dispositivo.id || dispositivo.playerId;

      if (!playerId) {
        erros++;
        continue;
      }

      try {
        const linkVinculo = `${BASE_URL}/vincular-dispositivo.html?playerId=${playerId}`;

        const resultado = await oneSignalAdmin.enviarNotificacaoTeste(
          playerId,
          '🔐 Vincular Dispositivo',
          'Toque para vincular este celular à sua conta',
          'EducaPleno',
          {
            url: linkVinculo,
            data: {
              tipo: 'vinculo_dispositivo',
              playerId: playerId,
              acao: 'abrir_link',
              link: linkVinculo,
              timestamp: Date.now()
            }
          }
        );

        if (resultado && resultado.success) {
          enviados++;
          logger.info(`   ✅ Push: ${playerId.substring(0, 20)}...`);
        } else {
          erros++;
          errosDetalhes.push({
            playerId: playerId.substring(0, 20) + '...',
            motivo: resultado?.error || 'Falha no envio'
          });
        }

        await new Promise(resolve => setTimeout(resolve, 150));

      } catch (error) {
        erros++;
        errosDetalhes.push({
          playerId: playerId.substring(0, 20) + '...',
          motivo: error.message
        });
      }
    }

    logger.info(`\n✅ Push: ${enviados} enviados | ${erros} erros`);

    logger.info(`\n🔔 CRIANDO NOTIFICAÇÕES INTERNAS...`);

    let notificacoesInternasCriadas = 0;
    let notificacoesComLinkEspecifico = 0;
    let notificacoesComLinkGenerico = 0;

    try {
      const usuariosParaNotificar = await User.find({
        ativo: true,
        _id: { $ne: req.userId }
      }).select('_id nome role onesignalPlayerId');

      logger.info(`   📋 ${usuariosParaNotificar.length} usuários ativos`);

      for (const u of usuariosParaNotificar) {
        try {
          let linkEspecifico = null;
          let tipoLink = '';

          if (u.onesignalPlayerId && u.onesignalPlayerId.length > 0) {
            linkEspecifico = `/vincular-dispositivo.html?playerId=${u.onesignalPlayerId}`;
            tipoLink = 'especifico';
            notificacoesComLinkEspecifico++;
          } else {
            linkEspecifico = `/vincular-dispositivo.html`;
            tipoLink = 'generico';
            notificacoesComLinkGenerico++;
          }

          const notificacao = new Notificacao({
            usuarioId: u._id,
            tipo: 'sistema',
            titulo: '🔐 Vincular Dispositivo',
            mensagem: u.onesignalPlayerId
              ? 'Sua solicitação de vínculo está pronta. Clique aqui para confirmar.'
              : 'Uma solicitação de vínculo foi enviada. Clique aqui para detectar seu dispositivo automaticamente.',
            icone: '🔐',
            cor: '#10b981',
            link: linkEspecifico,
            prioridade: 4,
            dados: {
              tipo: 'solicitacao_vinculo',
              origem: 'admin_envio_massa',
              enviadoPor: req.userId,
              totalDispositivos: dispositivosOrfaos.length,
              tipoLink: tipoLink,
              temPlayerId: !!u.onesignalPlayerId,
              data: new Date().toISOString()
            }
          });

          await notificacao.save();
          notificacoesInternasCriadas++;

        } catch (err) {
          logger.warn(`   ⚠️ Erro ao notificar ${u.nome}:`, err.message);
        }
      }

    } catch (notifErr) {
      logger.error('❌ Erro ao criar notificações internas:', notifErr);
    }

    res.json({
      success: true,
      message: `Push enviado para ${enviados} dispositivo(s). Notificação interna criada para ${notificacoesInternasCriadas} usuários.`,
      enviados,
      notificacoesInternas: notificacoesInternasCriadas,
      notificacoesEspecificas: notificacoesComLinkEspecifico,
      notificacoesGenericas: notificacoesComLinkGenerico,
      erros,
      total: dispositivosOrfaos.length
    });

  } catch (error) {
    logger.error('❌ Erro:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// OMR (IMAGENS DE DEBUG)
// ============================================================================

router.get('/omr/imagens', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    logger.info(`📋 Admin ${req.userId} listando imagens OMR da pasta: ${OMR_DEBUG_FOLDER}`);

    if (!fs.existsSync(OMR_DEBUG_FOLDER)) {
      return res.json({
        success: true,
        imagens: [],
        total: 0,
        estatisticas: { total: 0, originais: 0, processadas: 0, resultados: 0 }
      });
    }

    const files = await readdir(OMR_DEBUG_FOLDER);

    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
    const imageFiles = files.filter(file => imageExtensions.includes(path.extname(file).toLowerCase()));

    logger.info(`📊 Encontrados ${imageFiles.length} arquivos de imagem`);

    const imagens = await Promise.all(imageFiles.map(async (file) => {
      const filePath = path.join(OMR_DEBUG_FOLDER, file);
      const fileStat = await stat(filePath);

      const tipo = determinarTipoImagem(file);
      const info = extrairInfoDoNome(file);

      const imageBuffer = fs.readFileSync(filePath);
      const base64Image = imageBuffer.toString('base64');
      const mimeType = `image/${path.extname(file).substring(1)}`;
      const dataUrl = `data:${mimeType};base64,${base64Image}`;

      return {
        id: file,
        nome: file,
        url: dataUrl,
        thumbnail: dataUrl,
        tipo,
        data: fileStat.mtime,
        tamanho: formatarBytes(fileStat.size),
        respostas: info.respostas,
        nota: info.nota,
        prova: info.prova,
        aluno: info.aluno
      };
    }));

    imagens.sort((a, b) => new Date(b.data) - new Date(a.data));

    const estatisticas = {
      total: imagens.length,
      originais: imagens.filter(i => i.tipo === 'original').length,
      processadas: imagens.filter(i => i.tipo === 'processada').length,
      resultados: imagens.filter(i => i.tipo === 'resultado').length
    };

    logger.info(`✅ Retornando ${imagens.length} imagens`);

    res.json({ success: true, imagens, total: imagens.length, estatisticas });

  } catch (error) {
    logger.error('❌ Erro ao listar imagens OMR:', error);
    res.status(500).json({ success: false, error: 'Erro ao listar imagens: ' + error.message });
  }
});

router.delete('/omr/imagens/:nomeArquivo', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    const { nomeArquivo } = req.params;
    logger.info(`🗑️ Admin ${req.userId} excluindo imagem OMR: ${nomeArquivo}`);

    if (nomeArquivo.includes('..') || nomeArquivo.includes('/') || nomeArquivo.includes('\\')) {
      return res.status(400).json({ success: false, error: 'Nome de arquivo inválido' });
    }

    const filePath = path.join(OMR_DEBUG_FOLDER, nomeArquivo);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, error: 'Arquivo não encontrado' });
    }

    fs.unlinkSync(filePath);
    logger.info(`✅ Imagem ${nomeArquivo} excluída com sucesso`);

    res.json({ success: true, message: 'Imagem excluída com sucesso!' });

  } catch (error) {
    logger.error('❌ Erro ao excluir imagem:', error);
    res.status(500).json({ success: false, error: 'Erro ao excluir imagem: ' + error.message });
  }
});

router.delete('/omr/limpar', authenticateTokenLocal, isSuperAdmin, async (req, res) => {
  try {
    logger.info(`🗑️ Admin ${req.userId} limpando TODAS as imagens OMR`);

    const files = await readdir(OMR_DEBUG_FOLDER);
    let deletados = 0;

    for (const file of files) {
      const filePath = path.join(OMR_DEBUG_FOLDER, file);
      const statFile = await stat(filePath);

      if (statFile.isFile()) {
        fs.unlinkSync(filePath);
        deletados++;
      }
    }

    logger.info(`✅ ${deletados} arquivos excluídos da pasta debug_omr`);

    res.json({
      success: true,
      message: `${deletados} imagens excluídas com sucesso!`,
      total: deletados
    });

  } catch (error) {
    logger.error('❌ Erro ao limpar imagens:', error);
    res.status(500).json({ success: false, error: 'Erro ao limpar imagens: ' + error.message });
  }
});

// ============================================================================
// EXPORTAR ROUTER
// ============================================================================
module.exports = router;