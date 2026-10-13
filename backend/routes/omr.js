// ============================================================================
// OMR - Optical Mark Recognition (Reconhecimento Óptico de Marcas)
// ============================================================================
// Descrição: Rotas para correção automática de provas impressas via OMR
//
// ⚠️ IMPORTANTE:
//   Este router é montado em /api no server.js:
//     app.use('/api', omrRoutes);
//
//   Por isso, TODAS as rotas públicas usam o prefixo /omr:
//     /api/omr/health
//     /api/omr/status
//     /api/omr/detect
//     /api/omr/test
//
//   E as rotas admin usam o prefixo /admin/omr:
//     /api/admin/omr/imagens
//     /api/admin/omr/imagens/:nomeArquivo
//     /api/admin/omr/limpar
//
// Autor: Equipe de Desenvolvimento
// ============================================================================

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

// Promisify para operações assíncronas de fs
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

// ============================================================================
// CONFIGURAÇÃO DE PASTAS
// ============================================================================

// Caminho do script Python (relativo à pasta backend/)
const OMR_SCRIPT_PATH = path.join(__dirname, '..', 'omr_server.py');

// Pasta onde o OMR salva as imagens de debug
const OMR_DEBUG_FOLDER = path.join(__dirname, '..', 'debug_omr');

// Garantir que a pasta existe
if (!fs.existsSync(OMR_DEBUG_FOLDER)) {
  fs.mkdirSync(OMR_DEBUG_FOLDER, { recursive: true });
  logger.info('📁 Pasta debug_omr criada em:', OMR_DEBUG_FOLDER);
} else {
  logger.info('📁 Pasta debug_omr encontrada em:', OMR_DEBUG_FOLDER);
}

// ============================================================================
// ESTADO DO SERVIDOR OMR PYTHON
// ============================================================================

let pythonProcess = null;
let omrServerReady = false;

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

const isSuperAdmin = (req, res, next) => {
  if (req.userRole !== 'admin' && req.userRole !== 'super_admin') {
    return res.status(403).json({
      success: false,
      error: 'Acesso negado. Apenas administradores podem acessar esta rota.'
    });
  }
  next();
};

// ============================================================================
// SERVIÇO PYTHON OMR - INICIALIZAÇÃO
// ============================================================================

function iniciarServidorOMR() {
  logger.info('='.repeat(60));
  logger.info('🐍 Iniciando servidor OMR Python...');
  logger.info('📁 Caminho:', OMR_SCRIPT_PATH);

  if (!fs.existsSync(OMR_SCRIPT_PATH)) {
    logger.error('❌ Arquivo omr_server.py não encontrado em:', OMR_SCRIPT_PATH);
    logger.info('💡 Certifique-se de que o arquivo está em backend/omr_server.py');
    return;
  }

  try {
    const { PythonShell } = require('python-shell');

    const options = {
      mode: 'text',
      pythonOptions: ['-u'],
      scriptArgs: ['--port', '5001'],
      pythonPath: 'python'
    };

    pythonProcess = new PythonShell(OMR_SCRIPT_PATH, options);

    pythonProcess.on('message', function (message) {
      const cleanMsg = message.toString().trim();
      if (cleanMsg) {
        logger.info('   [OMR]', cleanMsg);

        if (
          cleanMsg.includes('Running on http://127.0.0.1:5001') ||
          cleanMsg.includes('Running on http://localhost:5001') ||
          cleanMsg.includes('Pronto para receber requisicoes')
        ) {
          omrServerReady = true;
          logger.info('✅ Servidor OMR Python iniciado e pronto!');
        }
      }
    });

    pythonProcess.stderr.on('data', function (data) {
      const errorMsg = data.toString().trim();
      if (errorMsg) {
        logger.error('   [OMR ERROR]', errorMsg);
      }
    });

    pythonProcess.on('error', function (err) {
      logger.error('❌ Erro no servidor OMR:', err.message);
      omrServerReady = false;
    });

    pythonProcess.on('close', function (code) {
      logger.info(`⚠️ Servidor OMR fechado (código: ${code})`);
      omrServerReady = false;
      pythonProcess = null;
    });

    logger.info('✅ Servidor OMR Python iniciado (aguardando inicialização...)');

    setTimeout(() => {
      if (omrServerReady) {
        logger.info('✅ Servidor OMR pronto para uso!');
      } else {
        logger.info('⚠️ Servidor OMR ainda não respondeu, mas continuará tentando...');
      }
    }, 5000);
  } catch (error) {
    logger.error('❌ Falha ao iniciar servidor OMR:', error.message);
  }
}

// ============================================================================
// FUNÇÕES AUXILIARES
// ============================================================================

/**
 * Obtém um módulo fetch (nativo Node 18+ ou node-fetch como fallback)
 */
async function obterFetch() {
  try {
    // Tentar fetch nativo (Node 18+)
    if (global.fetch) {
      return global.fetch;
    }
    // Fallback para node-fetch
    const nodeFetch = require('node-fetch');
    return nodeFetch;
  } catch (e) {
    const nodeFetch = require('node-fetch');
    return nodeFetch;
  }
}

/**
 * Formata bytes para exibição humana
 */
function formatarBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
  return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
}

/**
 * Determina o tipo da imagem pelo nome do arquivo
 */
function determinarTipoImagem(nomeArquivo) {
  const nome = nomeArquivo.toLowerCase();
  if (nome.includes('original') || nome === '0_original.jpg') {
    return 'original';
  } else if (nome.includes('binary') || nome === '1_binary.jpg') {
    return 'processada';
  } else if (nome.includes('resultado') || nome === '2_resultado.jpg') {
    return 'resultado';
  } else if (nome.includes('processed')) {
    return 'processada';
  }
  return 'outro';
}

/**
 * Extrai informações do nome do arquivo (respostas, nota, etc)
 */
function extrairInfoDoNome(nomeArquivo) {
  const info = {
    prova: null,
    aluno: null,
    respostas: null,
    nota: null
  };

  // Tentar extrair respostas (ex: respostas_ABCDE)
  const respostaMatch = nomeArquivo.match(/respostas?_([A-E]+)/i);
  if (respostaMatch) {
    info.respostas = respostaMatch[1].split('');
  }

  // Tentar extrair nota (ex: nota_7.5)
  const notaMatch = nomeArquivo.match(/nota_([\d.]+)/i);
  if (notaMatch) {
    info.nota = parseFloat(notaMatch[1]);
  }

  return info;
}

// ============================================================================
// ROTAS PÚBLICAS (prefixo /omr)
// ============================================================================

// ---------- GET /api/omr/health - Health check do OMR ----------
router.get('/omr/health', (req, res) => {
  res.json({
    success: true,
    status: 'online',
    service: 'OMR - Reconhecimento Óptico de Marcas',
    omr: {
      running: omrServerReady,
      port: 5001,
      pid: pythonProcess ? pythonProcess.childProcess.pid : null,
      scriptPath: OMR_SCRIPT_PATH,
      debugFolder: OMR_DEBUG_FOLDER
    },
    timestamp: new Date().toISOString()
  });
});

// ---------- GET /api/omr/status - Status do servidor OMR Python ----------
router.get('/omr/status', (req, res) => {
  res.json({
    success: true,
    running: omrServerReady,
    port: 5001,
    pid: pythonProcess ? pythonProcess.childProcess.pid : null
  });
});

// ---------- POST /api/omr/detect - Proxy para o servidor OMR Python ----------
router.post('/omr/detect', express.json({ limit: '50mb' }), async (req, res) => {
  try {
    if (!omrServerReady) {
      return res.status(503).json({
        success: false,
        error: 'Servidor OMR não está pronto. Aguarde alguns segundos.'
      });
    }

    logger.info('📤 Enviando requisição para servidor OMR Python...');

    const fetchModule = await obterFetch();

    const response = await fetchModule('http://localhost:5001/detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();
    logger.info('✅ Resposta recebida do OMR');
    res.json(data);
  } catch (error) {
    logger.error('❌ Erro no proxy OMR:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ---------- GET /api/omr/test - Testar comunicação com o servidor Python ----------
router.get('/omr/test', async (req, res) => {
  try {
    const fetchModule = await obterFetch();

    const response = await fetchModule('http://localhost:5001/health');
    const data = await response.json();

    res.json({
      success: true,
      omr: data,
      ready: omrServerReady
    });
  } catch (error) {
    res.json({
      success: false,
      error: error.message,
      ready: omrServerReady
    });
  }
});

// ============================================================================
// ROTAS ADMIN - DEBUG OMR (imagens geradas pelo OMR)
// ============================================================================

// ---------- GET /api/admin/omr/imagens - Listar todas as imagens OMR ----------
router.get('/admin/omr/imagens', authenticateToken, isSuperAdmin, async (req, res) => {
  try {
    logger.info(`📋 Admin ${req.userId} listando imagens OMR da pasta: ${OMR_DEBUG_FOLDER}`);

    // Verificar se a pasta existe
    if (!fs.existsSync(OMR_DEBUG_FOLDER)) {
      return res.json({
        success: true,
        imagens: [],
        total: 0,
        estatisticas: { total: 0, originais: 0, processadas: 0, resultados: 0 }
      });
    }

    const files = await readdir(OMR_DEBUG_FOLDER);

    // Filtrar apenas arquivos de imagem
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
    const imageFiles = files.filter(file =>
      imageExtensions.includes(path.extname(file).toLowerCase())
    );

    logger.info(`📊 Encontrados ${imageFiles.length} arquivos de imagem`);

    // Obter informações detalhadas de cada arquivo
    const imagens = await Promise.all(
      imageFiles.map(async (file) => {
        const filePath = path.join(OMR_DEBUG_FOLDER, file);
        const fileStat = await stat(filePath);

        // Determinar o tipo da imagem
        const tipo = determinarTipoImagem(file);
        const info = extrairInfoDoNome(file);

        // Ler o arquivo e converter para base64 para exibição
        const imageBuffer = fs.readFileSync(filePath);
        const base64Image = imageBuffer.toString('base64');
        const mimeType = `image/${path.extname(file).substring(1)}`;
        const dataUrl = `data:${mimeType};base64,${base64Image}`;

        return {
          id: file,
          nome: file,
          url: dataUrl,
          thumbnail: dataUrl,
          tipo: tipo,
          data: fileStat.mtime,
          tamanho: formatarBytes(fileStat.size),
          respostas: info.respostas,
          nota: info.nota,
          prova: info.prova,
          aluno: info.aluno
        };
      })
    );

    // Ordenar por data (mais recentes primeiro)
    imagens.sort((a, b) => new Date(b.data) - new Date(a.data));

    // Calcular estatísticas
    const estatisticas = {
      total: imagens.length,
      originais: imagens.filter(i => i.tipo === 'original').length,
      processadas: imagens.filter(i => i.tipo === 'processada').length,
      resultados: imagens.filter(i => i.tipo === 'resultado').length
    };

    logger.info(
      `✅ Retornando ${imagens.length} imagens (${estatisticas.originais} originais, ${estatisticas.processadas} processadas, ${estatisticas.resultados} com resultado)`
    );

    res.json({
      success: true,
      imagens: imagens,
      total: imagens.length,
      estatisticas: estatisticas
    });
  } catch (error) {
    logger.error('❌ Erro ao listar imagens OMR:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao listar imagens: ' + error.message
    });
  }
});

// ---------- DELETE /api/admin/omr/imagens/:nomeArquivo - Excluir imagem específica ----------
router.delete('/admin/omr/imagens/:nomeArquivo', authenticateToken, isSuperAdmin, async (req, res) => {
  try {
    const { nomeArquivo } = req.params;

    logger.info(`🗑️ Admin ${req.userId} excluindo imagem OMR: ${nomeArquivo}`);

    // Validar nome do arquivo (segurança - path traversal)
    if (nomeArquivo.includes('..') || nomeArquivo.includes('/') || nomeArquivo.includes('\\')) {
      return res.status(400).json({
        success: false,
        error: 'Nome de arquivo inválido'
      });
    }

    const filePath = path.join(OMR_DEBUG_FOLDER, nomeArquivo);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        error: 'Arquivo não encontrado'
      });
    }

    fs.unlinkSync(filePath);

    logger.info(`✅ Imagem ${nomeArquivo} excluída com sucesso`);

    res.json({
      success: true,
      message: 'Imagem excluída com sucesso!'
    });
  } catch (error) {
    logger.error('❌ Erro ao excluir imagem:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao excluir imagem: ' + error.message
    });
  }
});

// ---------- DELETE /api/admin/omr/limpar - Limpar TODAS as imagens ----------
router.delete('/admin/omr/limpar', authenticateToken, isSuperAdmin, async (req, res) => {
  try {
    logger.info(`🗑️ Admin ${req.userId} limpando TODAS as imagens OMR`);

    if (!fs.existsSync(OMR_DEBUG_FOLDER)) {
      return res.json({
        success: true,
        message: '0 imagens excluídas (pasta não existe)',
        total: 0
      });
    }

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
    res.status(500).json({
      success: false,
      error: 'Erro ao limpar imagens: ' + error.message
    });
  }
});

// ============================================================================
// EXPORTAR
// ============================================================================

// Exportar router + funções auxiliares para o server.js
module.exports = router;
module.exports.iniciarServidorOMR = iniciarServidorOMR;
module.exports.obterStatusOMR = () => ({
  running: omrServerReady,
  pid: pythonProcess ? pythonProcess.childProcess.pid : null
});