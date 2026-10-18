// ============================================================================
// SERVIDOR EDUCAPLENO 2026
// ============================================================================
// Descrição: Backend principal do EducaPleno (rotas NÃO migradas)
// Versão:    1.3 (LGPD: CPF removido de /auth/me e /perfil/me)
//
// ⚠️ Todas as rotas migradas estão em routes/*.js
//    Este arquivo contém APENAS as rotas remanescentes.
//
// Autor: Equipe de Desenvolvimento
// ============================================================================

// ============================================================================
// FORÇAR FUSO HORÁRIO (PRIMEIRA COISA)
// ============================================================================
process.env.TZ = 'America/Sao_Paulo';

// ============================================================================
// IMPORTS PRINCIPAIS
// ============================================================================
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const http = require('http');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const Groq = require('groq-sdk');

// ============================================================================
// CARREGAR VARIÁVEIS DE AMBIENTE
// ============================================================================
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// ============================================================================
// LOGGER
// ============================================================================
const logger = require('./utils/logger');

// ============================================================================
// SERVIÇOS
// ============================================================================
const EmailService = require('./services/email-service');
const LoggerService = require('./services/logger-service');
const OneSignalAdminService = require('./services/onesignal-admin-service');
const matriculasManager = require('./matriculas');

// ============================================================================
// APP EXPRESS + SERVIDOR HTTP
// ============================================================================
const app = express();
const PORT = process.env.PORT || 10000;
const server = http.createServer(app);

// ============================================================================
// LOGGER SERVICE (primeiro serviço a iniciar)
// ============================================================================
const loggerService = new LoggerService(server);

logger.info('🌍 FUSO HORÁRIO FORÇADO PARA:', process.env.TZ);
logger.info('🕒 HORA ATUAL DO SERVIDOR:', new Date().toString());
logger.info('🚀 Servidor iniciando...');
logger.info('='.repeat(60));

// ============================================================================
// CONFIGURAÇÕES DO AMBIENTE
// ============================================================================
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const IS_DEVELOPMENT = process.env.NODE_ENV === 'development';

// ============================================================================
// CRIAÇÃO DE DIRETÓRIOS NECESSÁRIOS
// ============================================================================
const dirs = [
  path.join(__dirname, 'logs'),
  path.join(__dirname, 'backups'),
  path.join(__dirname, 'uploads'),
  path.join(__dirname, 'uploads', 'imagens-questoes'),
  path.join(__dirname, 'debug_omr'),
  path.join(__dirname, '..', 'frontend')
];

dirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    logger.info(`📁 Diretório criado: ${dir}`);
  }
});

// ============================================================================
// LOGS INICIAIS DE DEPURAÇÃO
// ============================================================================
logger.info('📁 Diretório atual:', __dirname);
logger.info('🔍 .env em:', path.join(__dirname, '..', '.env'));
logger.info('🔑 OpenRouter API Key:', process.env.OPENROUTER_API_KEY ? '✅' : '❌');
logger.info('🔑 Groq API Key:', process.env.GROQ_API_KEY ? '✅' : '❌');

// ============================================================================
// GROQ (IA)
// ============================================================================
let groq = null;
if (process.env.GROQ_API_KEY) {
  groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  logger.info('✅ Groq configurado');
} else {
  logger.warn('⚠️ Groq API key não configurada');
}

// ============================================================================
// QR CODE (para gerar QR codes de usuário)
// ============================================================================
const QRCode = require('qrcode');

// ============================================================================
// MIDDLEWARES GLOBAIS
// ============================================================================

// Body parsers (limites altos)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Helmet (iframes permitidos do mesmo domínio)
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false,
  frameguard: false
}));

// Forçar X-Frame-Options correto
app.use((req, res, next) => {
  res.removeHeader('X-Frame-Options');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.removeHeader('Content-Security-Policy');
  next();
});

// Compressão
app.use(compression());

// Cookies
app.use(cookieParser());

// ============================================================================
// CORS
// ============================================================================
const origensPermitidas = [
  'https://prova-iema-2026.onrender.com',
  'https://www.educapleno.com',
  'https://educapleno.com',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (origensPermitidas.includes(origin)) return callback(null, true);
    logger.warn(`🚫 CORS bloqueado: ${origin}`);
    return callback(new Error('Origem não permitida pelo CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// ============================================================================
// HEADERS DE SEGURANÇA LGPD
// ============================================================================
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(self), microphone=()');
  next();
});

// ============================================================================
// FORÇAR HTTPS EM PRODUÇÃO
// ============================================================================
if (IS_PRODUCTION) {
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https') {
      return res.redirect(`https://${req.header('host')}${req.url}`);
    }
    next();
  });
}

// ============================================================================
// RAW BODY CAPTURE
// ============================================================================
app.use((req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    req.rawBody = JSON.stringify(req.body);
  }
  next();
});

// ============================================================================
// SESSÃO
// ============================================================================
app.use(session({
  secret: process.env.SESSION_SECRET || 'sessao_secreta_provisoria',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI || 'mongodb://localhost:27017/provas_online',
    ttl: 24 * 60 * 60
  }),
  cookie: {
    secure: IS_PRODUCTION,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// ============================================================================
// MULTER — UPLOADS
// ============================================================================
const uploadStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'uploads');
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

const uploadMiddleware = multer({
  storage: uploadStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt/;
    const ext = path.extname(file.originalname).toLowerCase();
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype || allowedTypes.test(ext)) {
      return cb(null, true);
    }
    cb(new Error('Tipo de arquivo não permitido'));
  }
});

// ============================================================================
// MODELOS IMPORTADOS DIRETAMENTE
// ============================================================================
const User = require('./models/User');
const Prova = require('./models/Prova');
const Turma = require('./models/Turma');
const Notificacao = require('./models/Notificacao');
const Eixo = require('./models/Eixo');
const Curso = require('./models/Cursos');
const AuditoriaVisita = require('./models/AuditoriaVisita');
const ConsentimentoLGPD = require('./models/ConsentimentoLGPD');

// ============================================================================
// MODELOS INLINE (Config, Resultado, ProvaRealizada, FaceID, Localizacao)
// ============================================================================

// ---------- Config ----------
let Config;
try {
  Config = mongoose.model('Config');
} catch {
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

  ConfigSchema.index({ chave: 1 }, { unique: true });
  ConfigSchema.index({ categoria: 1 });
  ConfigSchema.index({ atualizadoEm: -1 });

  Config = mongoose.model('Config', ConfigSchema);
  logger.info('✅ Modelo Config criado');
}

// ---------- Resultado ----------
let Resultado;
try {
  Resultado = mongoose.model('Resultado');
} catch {
  const ResultadoSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    provaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Prova', required: true },
    alunoNome: { type: String, required: true },
    respostas: { type: [String], default: [] },
    nota: { type: Number, default: null },
    acertos: { type: Number, default: 0 },
    total: { type: Number, required: true },
    porcentagem: { type: String, default: '0.0' },
    tempoGasto: { type: Number, default: 0 },
    resultadoDetalhado: { type: [Object], default: [] },
    notaLiberada: { type: Boolean, default: false },
    notaManual: { type: Number, default: null, min: 0, max: 10 },
    notaManualLiberada: { type: Boolean, default: false },
    notaManualObservacao: { type: String, default: null },
    notaManualData: { type: Date, default: null },
    notaManualAtribuidaPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    resultadoDetalhadoManual: { type: [Object], default: [] },
    tipoNota: { type: String, enum: ['automatica', 'manual', 'ambas'], default: 'automatica' },
    cancelada: { type: Boolean, default: false },
    motivoCancelamento: { type: String, default: null },
    flagViolacao: { type: Boolean, default: false },
    estatisticasCancelamento: { type: Object, default: null },
    motivoCancelamentoTipo: { type: String, enum: ['violacao', 'prazo_expirado', 'outro', null], default: null },
    status: { type: String, enum: ['pendente', 'corrigida', 'cancelada', null], default: null }
  }, { timestamps: true });

  ResultadoSchema.index({ userId: 1, provaId: 1 }, { unique: true });
  Resultado = mongoose.model('Resultado', ResultadoSchema);
}

// ---------- ProvaRealizada ----------
if (mongoose.models.ProvaRealizada) {
  delete mongoose.models.ProvaRealizada;
}

const ProvaRealizadaSchema = new mongoose.Schema({
  provaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Prova', required: true },
  alunoId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  respostas: { type: [String], default: [] },
  nota: { type: Number, default: null },
  tempoGasto: { type: Number, default: 0 },
  dataRealizacao: { type: Date, default: Date.now },
  status: { type: String, enum: ['pendente', 'em_andamento', 'finalizada', 'corrigida', 'cancelada'], default: 'pendente' },
  notaLiberada: { type: Boolean, default: false },
  resultadoDetalhado: { type: [Object], default: [] },
  notaManual: { type: Number, default: null },
  notaManualLiberada: { type: Boolean, default: false },
  notaManualObservacao: { type: String, default: null },
  notaManualData: { type: Date, default: null },
  notaManualAtribuidaPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  resultadoDetalhadoManual: { type: [Object], default: [] },
  tipoNota: { type: String, enum: ['automatica', 'manual', 'ambas'], default: 'automatica' },
  cancelada: { type: Boolean, default: false },
  motivoCancelamento: { type: String, default: null },
  flagViolacao: { type: Boolean, default: false },
  estatisticasCancelamento: { type: Object, default: null },
  motivoCancelamentoTipo: { type: String, enum: ['violacao', 'prazo_expirado', 'outro', null], default: null },
  sincronizadoEm: { type: Date, default: null }
}, { timestamps: true });

ProvaRealizadaSchema.index({ provaId: 1, alunoId: 1 }, { unique: true });
ProvaRealizadaSchema.index({ notaManual: 1 });
ProvaRealizadaSchema.index({ tipoNota: 1 });

const ProvaRealizada = mongoose.model('ProvaRealizada', ProvaRealizadaSchema);

// ---------- FaceID ----------
let FaceID;
try {
  FaceID = require('./models/FaceID');
} catch {
  const FaceIDSchema = new mongoose.Schema({
    usuarioId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    imagemBase64: { type: String, required: true },
    imagemHash: { type: String, required: true },
    faceDescriptor: { type: [Number], required: false },
    dataCadastro: { type: Date, default: Date.now },
    ultimaValidacao: { type: Date },
    totalValidacoes: { type: Number, default: 0 },
    ativo: { type: Boolean, default: true }
  }, { timestamps: true });

  FaceID = mongoose.models.FaceID || mongoose.model('FaceID', FaceIDSchema);
}

// ---------- Localizacao ----------
const LocalizacaoSchema = new mongoose.Schema({
  alunoId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  provaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Prova' },
  latitude: { type: Number },
  longitude: { type: Number },
  accuracy: { type: Number },
  timestamp: { type: Date, default: Date.now, index: true },
  tipoRefeicao: { type: String, enum: ['manha', 'almoco', 'tarde', null], default: null },
  registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  registradoPorNome: { type: String }
}, { timestamps: true });

LocalizacaoSchema.index({ alunoId: 1, timestamp: -1 });
LocalizacaoSchema.index({ timestamp: -1 });
LocalizacaoSchema.index({ tipoRefeicao: 1, timestamp: -1 });

const Localizacao = mongoose.models.Localizacao || mongoose.model('Localizacao', LocalizacaoSchema);

// ============================================================================
// SERVIÇOS INICIALIZADOS
// ============================================================================
const emailService = new EmailService();
const oneSignalAdmin = new OneSignalAdminService();

logger.info('✅ Serviços inicializados: Email, OneSignal Admin');

// ============================================================================
// MIDDLEWARES DE AUTENTICAÇÃO E PERMISSÃO
// ============================================================================

// ---------- Autenticação JWT com verificação de tokenVersion ----------
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
      req.tokenTemp = true;
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

const isSuperAdmin = (req, res, next) => {
  if (req.userRole !== 'admin' && req.userRole !== 'super_admin') {
    return res.status(403).json({
      success: false,
      error: 'Acesso negado. Apenas administradores podem acessar esta rota.'
    });
  }
  next();
};

const verificarPermissaoSetorPedagogico = (req, res, next) => {
  const allowedRoles = ['setor_pedagogico', 'admin', 'super_admin'];

  if (!allowedRoles.includes(req.userRole)) {
    return res.status(403).json({
      success: false,
      error: 'Acesso negado. Apenas o Setor Pedagógico pode acessar esta área.'
    });
  }

  req.isSetorPedagogico = true;
  next();
};

// ============================================================================
// FUNÇÕES AUXILIARES
// ============================================================================

function generateBackupCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function sanitizarJwtExpiracao(valor) {
  const padrao = '24h';

  if (valor === undefined || valor === null || valor === '') return padrao;

  if (typeof valor === 'number') {
    if (valor <= 0 || valor > 8760) return padrao;
    return `${valor}h`;
  }

  if (typeof valor === 'string') {
    const trimmed = valor.trim();

    if (/^\d+$/.test(trimmed)) {
      const num = parseInt(trimmed);
      if (num <= 0 || num > 8760) return padrao;
      return `${num}h`;
    }

    if (/^\d+(\.\d+)?(ms|s|m|h|d|w|y)$/i.test(trimmed)) {
      return trimmed;
    }
  }

  logger.warn(`⚠️ jwtExpiracao inválido: "${valor}". Usando padrão "${padrao}"`);
  return padrao;
}

function parseJwtExpiration(expiration) {
  if (typeof expiration === 'number') return expiration;
  const match = expiration.match(/^(\d+)([hH])$/);
  if (match) {
    return parseInt(match[1]) * 60 * 60;
  }
  return 24 * 60 * 60;
}

async function processarAnexosParaIA(anexos) {
  try {
    if (!anexos || anexos.length === 0) {
      return "Nenhum anexo fornecido.";
    }

    logger.info(`📂 Processando ${anexos.length} anexos para IA...`);

    let contextoFormatado = `## 📎 INFORMAÇÕES DOS ANEXOS FORNECIDOS:\n\n`;

    for (let i = 0; i < anexos.length; i++) {
      const anexo = anexos[i];
      contextoFormatado += `### ANEXO ${i + 1}: ${anexo.titulo || 'Sem título'}\n`;
      contextoFormatado += `- **Tipo:** ${anexo.tipo}\n`;

      if (anexo.tipo === 'texto' && anexo.conteudo) {
        const conteudoLimitado = anexo.conteudo.length > 5000
          ? anexo.conteudo.substring(0, 5000) + "... [conteúdo truncado]"
          : anexo.conteudo;

        contextoFormatado += `- **Conteúdo:**\n${conteudoLimitado}\n\n`;
      } else if (anexo.tipo === 'pdf' || anexo.tipo === 'outro') {
        contextoFormatado += `- **Arquivo:** ${anexo.nomeArquivo}\n`;
        contextoFormatado += `- **URL:** ${anexo.url || 'N/A'}\n\n`;
      } else if (anexo.tipo === 'link') {
        contextoFormatado += `- **Link:** ${anexo.url || anexo.conteudo}\n\n`;
      } else if (anexo.tipo === 'imagem') {
        contextoFormatado += `- **Imagem:** ${anexo.nomeArquivo}\n\n`;
      }

      contextoFormatado += `---\n\n`;
    }

    contextoFormatado += `## 📝 INSTRUÇÕES:\n\n`;
    contextoFormatado += `1. ANALISE os anexos - Eles mostram o ESTILO de questão desejado\n`;
    contextoFormatado += `2. COPIE a ESTRUTURA - Use o mesmo formato\n`;
    contextoFormatado += `3. USE os CONCEITOS apresentados\n`;
    contextoFormatado += `4. NÃO copie exatamente - Crie variações\n\n`;

    return contextoFormatado;
  } catch (error) {
    logger.error('❌ Erro ao processar anexos:', error);
    return "Erro ao processar anexos fornecidos.";
  }
}

async function testarModelosDisponiveis(groqInstance) {
  if (!groqInstance) {
    logger.error('❌ Groq não inicializado');
    return [];
  }

  const modelosParaTestar = [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "qwen/qwen3-32b",
    "moonshotai/kimi-k2-instruct",
    "gemma2-9b-it",
    "allam-2-7b"
  ];

  logger.info('🔍 Testando modelos disponíveis na Groq...');
  logger.info('='.repeat(50));

  const modelosFuncionais = [];
  const modelosDescontinuados = [];
  const modelosErro = [];

  for (const modelo of modelosParaTestar) {
    try {
      logger.info(`  Testando: ${modelo}`);

      const completion = await groqInstance.chat.completions.create({
        model: modelo,
        messages: [{ role: "user", content: "Olá, teste rápido" }],
        max_tokens: 5,
        temperature: 0.1
      });

      if (completion.choices && completion.choices.length > 0) {
        modelosFuncionais.push(modelo);
        logger.info(`  ✅ ${modelo} - Disponível`);
      } else {
        modelosErro.push(modelo);
      }
    } catch (error) {
      const errorMsg = error.message || '';

      if (errorMsg.includes('decommissioned') || errorMsg.includes('discontinued')) {
        modelosDescontinuados.push(modelo);
        logger.info(`  ❌ ${modelo} - Descontinuado`);
      } else if (errorMsg.includes('not found') || errorMsg.includes('404')) {
        modelosErro.push(modelo);
        logger.info(`  ❌ ${modelo} - Não encontrado`);
      } else if (errorMsg.includes('rate limit') || errorMsg.includes('429')) {
        logger.info(`  ⏳ ${modelo} - Rate limit, pulando...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        modelosErro.push(modelo);
        logger.info(`  ⚠️ ${modelo} - Erro`);
      }
    }

    await new Promise(resolve => setTimeout(resolve, 250));
  }

  logger.info('='.repeat(50));
  logger.info(`📈 Funcionais: ${modelosFuncionais.length} | Descontinuados: ${modelosDescontinuados.length} | Erros: ${modelosErro.length}`);
  logger.info('='.repeat(50));

  return modelosFuncionais;
}

logger.info('✅ Middlewares e funções auxiliares configurados');

// ============================================================================
// CONEXÃO COM MONGODB
// ============================================================================
mongoose.set('bufferTimeoutMS', 60000);

const connectToDatabase = async () => {
  const ENV = process.env.NODE_ENV || 'development';
  const isProd = ENV === 'production';
  const isDev = ENV === 'development';

  logger.info('='.repeat(60));
  logger.info(`🚀 AMBIENTE: ${ENV.toUpperCase()}`);

  let connectionUri;
  let databaseType = 'Desconhecido';

  if (isProd) {
    connectionUri = process.env.MONGODB_ATLAS_URI || process.env.MONGODB_URI;
    databaseType = 'MongoDB Atlas (NUVEM)';
    logger.info('🌐 PRODUÇÃO: MongoDB Atlas');
  } else if (isDev) {
    connectionUri = process.env.MONGODB_LOCAL_URI || 'mongodb://localhost:27017/provas_online';
    databaseType = 'MongoDB Local';
    logger.info('💻 DESENVOLVIMENTO: MongoDB Local');
  } else {
    connectionUri = process.env.MONGODB_URI;
    databaseType = 'Padrão';
    logger.info('⚙️ Configuração padrão');
  }

  const safeUri = connectionUri ? connectionUri.replace(/\/\/[^@]+@/, '//***@') : 'Não configurada';
  logger.info(`🗄️ URI: ${safeUri}`);
  logger.info(`📊 Tipo: ${databaseType}`);
  logger.info('='.repeat(60));

  const options = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 60000,
    socketTimeoutMS: 90000,
    connectTimeoutMS: 60000,
    maxPoolSize: 10,
    minPoolSize: 1,
    maxIdleTimeMS: 30000,
    retryWrites: true,
    retryReads: true,
    w: 'majority',
    heartbeatFrequencyMS: 10000,
    family: 4
  };

  const tentarConectar = async (uri, tentativa = 1, maxTentativas = 3) => {
    try {
      logger.info(`🔄 Tentativa ${tentativa}/${maxTentativas}...`);
      await mongoose.connect(uri, options);
      return true;
    } catch (error) {
      logger.error(`❌ Tentativa ${tentativa} falhou: ${error.message}`);

      if (tentativa < maxTentativas) {
        const espera = tentativa * 3000;
        logger.info(`⏳ Aguardando ${espera}ms...`);
        await new Promise(resolve => setTimeout(resolve, espera));
        return tentarConectar(uri, tentativa + 1, maxTentativas);
      }
      throw error;
    }
  };

  try {
    logger.info('🔄 Iniciando conexão...');
    await tentarConectar(connectionUri, 1, 3);

    const db = mongoose.connection.db;
    const host = mongoose.connection.host;
    const isAtlas = host.includes('mongodb.net');

    logger.info('='.repeat(60));
    logger.info('✅ CONEXÃO ESTABELECIDA!');
    logger.info(`📁 Banco: ${db.databaseName}`);
    logger.info(`📍 Host: ${host}`);
    logger.info(`🌍 Tipo: ${isAtlas ? 'MongoDB Atlas' : 'MongoDB Local'}`);
    logger.info('='.repeat(60));

    try {
      const retencaoService = require('./services/retencao-visitas');
      retencaoService.iniciarCronJobs();
    } catch (error) {
      logger.warn('⚠️ Erro ao iniciar cron jobs LGPD:', error.message);
    }

    let reconectando = false;

    mongoose.connection.on('disconnected', () => {
      if (reconectando) return;
      reconectando = true;
      logger.info('⚠️ MongoDB desconectado! Tentando reconectar em 5s...');

      setTimeout(async () => {
        try {
          await mongoose.connect(connectionUri, options);
          logger.info('✅ Reconexão bem-sucedida!');
        } catch (err) {
          logger.error('❌ Falha na reconexão:', err.message);
        } finally {
          reconectando = false;
        }
      }, 5000);
    });

    mongoose.connection.on('error', (err) => {
      logger.error('❌ Erro no MongoDB:', err.message);
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('✅ MongoDB reconectado!');
      reconectando = false;
    });

    try {
      await matriculasManager.importarDadosIniciais();
    } catch (error) {
      logger.warn('⚠️ Erro ao importar matrículas:', error.message);
    }

    if (groq) {
      setTimeout(() => {
        testarModelosDisponiveis(groq).catch(err => {
          logger.warn('⚠️ Erro ao testar modelos Groq:', err.message);
        });
      }, 5000);
    }

    return true;

  } catch (error) {
    logger.error('='.repeat(60));
    logger.error('❌ ERRO NA CONEXÃO:', error.message);
    logger.error('='.repeat(60));

    if (isDev) {
      logger.info('🔄 Tentando fallback...');
      try {
        const fallbackUri = process.env.MONGODB_ATLAS_URI || process.env.MONGODB_URI;
        if (!fallbackUri) throw new Error('URI de fallback não configurada');

        await mongoose.connect(fallbackUri, options);
        logger.info('✅ Fallback bem-sucedido');
        return true;
      } catch (fallbackError) {
        logger.error('❌ Fallbacks falharam:', fallbackError.message);
        logger.warn('⚠️ Servidor continuará SEM banco');
        return false;
      }
    }

    if (isProd) {
      logger.error('❌ PRODUÇÃO: Conexão falhou!');
      logger.warn('⚠️ Servidor continuará rodando.');
      return false;
    }
  }
};

let databaseReady = false;
let databaseConnectionPromise = null;

const iniciarConexaoComRetry = async () => {
  const MAX_TENTATIVAS = 5;
  const INTERVALO = 5000;

  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    logger.info(`\n🔁 Tentativa inicial ${tentativa}/${MAX_TENTATIVAS}...`);

    const sucesso = await connectToDatabase();

    if (sucesso) {
      databaseReady = true;
      logger.info('✅ Banco pronto!');
      return true;
    }

    if (tentativa < MAX_TENTATIVAS) {
      logger.info(`⏳ Aguardando ${INTERVALO / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, INTERVALO));
    }
  }

  logger.error('❌ Todas as tentativas falharam!');
  logger.warn('⚠️ Servidor continuará rodando.');
  return false;
};

databaseConnectionPromise = iniciarConexaoComRetry();

global.isDatabaseReady = () => databaseReady;
global.waitForDatabase = () => databaseConnectionPromise;

logger.info('✅ Módulo de conexão MongoDB configurado');

// ============================================================================
// ROTAS PÚBLICAS (DEVEM VIR ANTES DE TUDO QUE EXIGE AUTH!)
// ============================================================================
logger.info('📌 Registrando rotas públicas (health, cursos, eixos)...');

// ---------- Health checks ----------
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'online',
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    memory: {
      usage: process.memoryUsage(),
      heapMB: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)
    }
  });
});

app.get('/api/health-check', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const stats = await db.stats();

    res.json({
      success: true,
      status: 'online',
      timestamp: new Date().toISOString(),
      database: {
        name: db.databaseName,
        type: mongoose.connection.host.includes('mongodb.net') ? 'MongoDB Atlas' : 'MongoDB Local',
        collections: stats.collections,
        documents: stats.objects,
        dataSizeMB: (stats.dataSize / 1024 / 1024).toFixed(2),
        storageSizeMB: (stats.storageSize / 1024 / 1024).toFixed(2),
        connected: mongoose.connection.readyState === 1
      },
      connection: {
        host: mongoose.connection.host,
        port: mongoose.connection.port,
        atlas: mongoose.connection.host.includes('mongodb.net')
      },
      message: '✅ Sistema online'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      status: 'error',
      error: error.message
    });
  }
});

app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: 'API está funcionando!',
    database: mongoose.connection.readyState === 1 ? '✅ Conectado' : '❌ Desconectado',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/database-info', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const stats = await db.stats();

    res.json({
      success: true,
      database: {
        name: db.databaseName,
        type: 'MongoDB Atlas',
        collections: stats.collections,
        documents: stats.objects,
        dataSize: (stats.dataSize / 1024 / 1024).toFixed(2) + ' MB',
        storageSize: (stats.storageSize / 1024 / 1024).toFixed(2) + ' MB',
        connected: mongoose.connection.readyState === 1
      },
      connection: {
        host: mongoose.connection.host,
        port: mongoose.connection.port,
        atlas: mongoose.connection.host.includes('mongodb.net')
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/sistema/status', async (req, res) => {
  try {
    const [configManutencao, configMensagem] = await Promise.all([
      Config.findOne({ chave: 'sistema.modoManutencao' }),
      Config.findOne({ chave: 'sistema.manutencaoMensagem' })
    ]);

    res.json({
      success: true,
      modoManutencao: configManutencao ? configManutencao.valor : false,
      mensagem: configMensagem ? configMensagem.valor : 'Sistema em manutenção. Volte mais tarde.',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('❌ Erro ao verificar status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

try {
  const turmasRouter = require('./routes/turmas');
  app.use('/api/turmas', turmasRouter);
  app.use('/api', turmasRouter.publicoRouter);
  logger.info('✅ Rotas públicas de turmas/cursos/eixos registradas');
} catch (error) {
  logger.error('❌ Erro ao registrar turmasRouter:', error.message);
}

try {
  app.use('/api', require('./routes/login'));
  logger.info('✅ Rotas de login registradas');
} catch (error) {
  logger.error('❌ Erro ao registrar login:', error.message);
}

// ============================================================================
// ROUTERS MIGRADOS
// ============================================================================
logger.info('📌 Registrando routers autenticados...');

app.use('/api/admin/monitoramento', require('./routes/monitoramento'));

try {
  app.use('/api', require('./adaptar-documento'));
  logger.info('✅ adaptar-documento registrado');
} catch (error) {
  logger.error('❌ Erro ao registrar adaptar-documento:', error.message);
}

app.use('/api/push', require('./routes/push-routes'));
app.use('/api/admin', require('./routes/admin-config'));
app.use('/api/calendario', require('./routes/calendario-routes'));
app.use('/api/coordenacao-patio', require('./routes/coordenacaoPatio'));
app.use('/api/cozinha', require('./routes/cozinha'));
app.use('/api/monitoramento-cozinha', require('./routes/monitoramento-cozinha'));
app.use('/api/feedback-cozinha', require('./routes/feedback-cozinha'));
app.use('/api/gestao-geral', require('./routes/gestaoGeral'));
app.use('/api/enfermaria', require('./routes/enfermaria'));
app.use('/api/rodizio', require('./routes/rodizioRefeicao'));
app.use('/api/supervisao', require('./routes/supervisao'));
app.use('/api/psicologia', require('./routes/psicologia'));
app.use('/api/assistente-social', require('./routes/assistente-social'));
app.use('/api/protagonismo', require('./routes/protagonismo'));
app.use('/api/protagonismo-publico', require('./routes/protagonismo-publico'));
app.use('/api/setor-pedagogico/visitas', require('./routes/visitas'));
app.use('/api/visitas-publico', require('./routes/visitas-publico'));
app.use('/api/gestao-geral/autorizacao', require('./routes/autorizacao-routes'));
app.use('/api/admin/permissoes-modulos', require('./routes/permissao-modulos-routes'));
app.use('/api/acompanhamento', require('./routes/acompanhamento'));
app.use('/api/acompanhamento-compartilhado', require('./routes/acompanhamento-compartilhado'));
app.use('/api/substituicao-professor', require('./routes/substituicao-professor-routes'));
app.use('/api/gestao-professores', require('./routes/gestao-professores-routes'));

const aeeRoutes = require('./routes/aee-routes');
app.use('/api/aee', aeeRoutes);

const atrasoProfessorRoutes = require('./routes/atraso-professor-routes');
app.use('/api/atraso-professor', atrasoProfessorRoutes);

app.use('/api/lgpd', require('./routes/lgpd'));
app.use('/api/admin/banco-dados', require('./routes/admin-banco-dados'));
app.use('/api/aluno', require('./routes/aluno'));
app.use('/api/professor', require('./routes/professor'));
app.use('/api/biblioteca', require('./routes/biblioteca'));
app.use('/api/biblioteca-publica', require('./routes/biblioteca-publica'));
app.use('/api/secretaria', require('./routes/secretaria'));

const recepcaoRoutes = require('./routes/recepcao-routes');
app.use('/api/recepcao', recepcaoRoutes);

app.use('/api/sessoes-assinatura', require('./routes/sessao-assinatura-routes'));
app.use('/api/provas', require('./routes/provas'));
app.use('/api/notificacoes', require('./routes/notificacoes'));

const oneSignalRoutes = require('./routes/onesignal');
app.use('/api/onesignal', oneSignalRoutes);
app.use('/api/usuario', oneSignalRoutes);

app.use('/api/chatbot', require('./routes/chatbot'));
app.use('/api/setor-pedagogico', require('./routes/setor-pedagogico'));
// Cadastro (LGPD + aluno/professor + social) — DEVE vir ANTES do face-id
app.use('/api/auth', require('./routes/auth'));

// Face ID (cadastrar-face, verificar-face, validar-camera, etc.)
app.use('/api/auth', require('./routes/face-id'));

// WebAuthn (biometria FIDO2) — registro e login biométrico
app.use('/api', require('./routes/webauthn'));

const omrRoutes = require('./routes/omr');
app.use('/api', omrRoutes);

app.use('/api/admin', require('./routes/admin'));

logger.info('✅ Todos os routers migrados foram registrados');

// ============================================================================
// MIDDLEWARE DE RASTREAMENTO DE ATIVIDADE
// ============================================================================
const rastrearAtividade = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      if (!decoded.temp && decoded.id) {
        User.findByIdAndUpdate(decoded.id, {
          lastActive: new Date()
        }).catch(() => {});
      }
    } catch (err) { /* ignora */ }
  }

  next();
};

app.use('/api', rastrearAtividade);

// ============================================================================
// MIDDLEWARE DE MODO MANUTENÇÃO
// ============================================================================
const manutencaoMiddleware = async (req, res, next) => {
  const rotasPublicas = [
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/reset-password',
    '/api/health',
    '/api/test',
    '/api/health-check',
    '/api/matriculas-autorizadas/verificar',
    '/api/sistema/status',
    '/api/cursos',
    '/api/eixos',
    '/login.html',
    '/register.html',
    '/recuperar-senha.html',
    '/trocar-senha.html',
    '/manutencao.html',
    '/css/',
    '/js/',
    '/uploads/'
  ];

  if (rotasPublicas.some(rota => req.path.startsWith(rota))) {
    return next();
  }

  try {
    const configManutencao = await Config.findOne({ chave: 'sistema.modoManutencao' });
    const modoManutencao = configManutencao ? configManutencao.valor : false;

    if (!modoManutencao) return next();

    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.role === 'admin' || decoded.role === 'super_admin') {
          req.userId = decoded.id;
          req.userRole = decoded.role;
          req.userNome = decoded.nome;
          return next();
        }
      } catch (err) { /* ignora */ }
    }

    const cookieToken = req.cookies?.auth_token;
    if (cookieToken) {
      try {
        const decoded = jwt.verify(cookieToken, process.env.JWT_SECRET);
        if (decoded.role === 'admin' || decoded.role === 'super_admin') {
          req.userId = decoded.id;
          req.userRole = decoded.role;
          req.userNome = decoded.nome;
          return next();
        }
      } catch (err) { /* ignora */ }
    }

    if (req.session?.userId) {
      try {
        const user = await User.findById(req.session.userId).select('role nome');
        if (user && (user.role === 'admin' || user.role === 'super_admin')) {
          req.userId = user._id;
          req.userRole = user.role;
          req.userNome = user.nome;
          return next();
        }
      } catch (err) { /* ignora */ }
    }

    const configMensagem = await Config.findOne({ chave: 'sistema.manutencaoMensagem' });
    const mensagem = configMensagem ? configMensagem.valor : 'Sistema em manutenção. Volte mais tarde.';

    if (req.path.startsWith('/api/')) {
      return res.status(503).json({
        success: false,
        error: mensagem,
        modoManutencao: true
      });
    }

    return res.redirect('/manutencao.html');
  } catch (error) {
    logger.error('❌ Erro no middleware de manutenção:', error);
    next();
  }
};

app.use(manutencaoMiddleware);

// ============================================================================
// MIDDLEWARE DE MODO DEBUG
// ============================================================================
app.use(async (req, res, next) => {
  try {
    const configDebug = await Config.findOne({ chave: 'sistema.modoDebug' });
    const modoDebug = configDebug ? configDebug.valor : false;

    if (!modoDebug) return next();

    if (req.path.startsWith('/api/')) {
      const start = Date.now();
      const requestId = Math.random().toString(36).substring(7);

      logger.info(`\n🔍 [DEBUG-${requestId}] ${req.method} ${req.path}`);
      logger.info(`   👤 Usuário: ${req.userId || 'Não autenticado'} (${req.userRole || 'N/A'})`);
      logger.info(`   📦 Query:`, req.query);

      if (!req.path.includes('/upload/') && req.body && Object.keys(req.body).length > 0) {
        const bodyCopy = { ...req.body };
        if (bodyCopy.password) bodyCopy.password = '***';
        if (bodyCopy.token) bodyCopy.token = '***';
        if (bodyCopy.authorization) bodyCopy.authorization = '***';
        logger.info(`   📝 Body:`, bodyCopy);
      }

      const originalJson = res.json;
      res.json = function (data) {
        const duration = Date.now() - start;
        const statusColor = res.statusCode >= 400 ? '\x1b[31m' : '\x1b[32m';
        logger.info(`   ${statusColor}✅ Resposta (${duration}ms) - Status: ${res.statusCode}\x1b[0m`);

        if (res.statusCode >= 400 || (data && JSON.stringify(data).length < 500)) {
          logger.info(`   📤 Dados:`, data);
        } else {
          logger.info(`   📤 Resposta grande (${JSON.stringify(data).length} bytes)`);
        }

        logger.info(`🔍 [DEBUG-${requestId}] Fim da requisição\n`);
        return originalJson.call(this, data);
      };
    }

    next();
  } catch (error) {
    logger.error('❌ Erro no middleware de debug:', error);
    next();
  }
});

logger.info('✅ Middlewares especiais configurados');

// ============================================================================
// ROTAS REMANESCENTES - AUTENTICADAS
// ============================================================================

// ---------- /api/config/envio-provas ----------
app.get('/api/config/envio-provas', authenticateToken, async (req, res) => {
  try {
    const config = await Config.findOne({ chave: 'provas.habilitarEnvioProva' });
    const habilitarEnvio = config ? config.valor : true;

    res.json({
      success: true,
      habilitarEnvio: habilitarEnvio,
      mensagem: habilitarEnvio ? 'Envio de provas HABILITADO' : 'Envio de provas DESABILITADO'
    });
  } catch (error) {
    logger.error('❌ Erro ao buscar configuração de envio:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar configuração: ' + error.message
    });
  }
});

// ============================================================================
// 🔒 LGPD: /api/auth/me — SEM CPF (minimização de dados)
// ============================================================================
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .select('+precisaAcessibilidade +condicaoAcessibilidade +outraCondicao +dataSolicitacaoAcessibilidade +acessibilidadeAprovadaPor +telefone +twoFactorEnabled');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuário não encontrado'
      });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        nome: user.nome,
        email: user.email,
        // 🔒 LGPD: NÃO retorna CPF aqui (minimização de dados)
        role: user.role,
        eixo: user.eixo,
        matricula: user.matricula,
        curso: user.curso,
        turma: user.turma,
        periodo: user.periodo,
        departamento: user.departamento,
        titulacao: user.titulacao,
        precisaAcessibilidade: user.precisaAcessibilidade === true,
        condicaoAcessibilidade: user.condicaoAcessibilidade,
        outraCondicao: user.outraCondicao,
        dataSolicitacaoAcessibilidade: user.dataSolicitacaoAcessibilidade,
        telefone: user.telefone,
        twoFactorEnabled: user.twoFactorEnabled
      }
    });
  } catch (error) {
    logger.error('Erro ao buscar usuário:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar informações do usuário'
    });
  }
});

// ============================================================================
// 🔒 LGPD: /api/auth/me/dados-sensiveis — rota dedicada para CPF do próprio usuário
// (rejeita token temporário de 2FA; só retorna CPF do próprio req.userId)
// ============================================================================
app.get('/api/auth/me/dados-sensiveis', authenticateToken, async (req, res) => {
  try {
    if (req.tokenTemp === true) {
      return res.status(403).json({
        success: false,
        error: 'Complete a verificação 2FA primeiro.',
        codigo: 'NEED_2FA',
        precisa2FA: true
      });
    }

    const user = await User.findById(req.userId).select('cpf');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuário não encontrado'
      });
    }

    res.json({
      success: true,
      cpf: user.cpf || null
    });
  } catch (error) {
    logger.error('Erro ao buscar dados sensíveis:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno'
    });
  }
});

// ---------- /api/users/me ----------
app.put('/api/users/me', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const { precisaAcessibilidade, condicaoAcessibilidade, outraCondicao } = req.body;

    logger.info(`🔄 Atualizando usuário ${userId}:`, {
      precisaAcessibilidade,
      condicaoAcessibilidade,
      outraCondicao
    });

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuário não encontrado'
      });
    }

    if (precisaAcessibilidade !== undefined) {
      user.precisaAcessibilidade = precisaAcessibilidade === true || precisaAcessibilidade === 'true';

      if (user.precisaAcessibilidade) {
        user.condicaoAcessibilidade = condicaoAcessibilidade || user.condicaoAcessibilidade;
        user.outraCondicao = outraCondicao || user.outraCondicao;
        user.dataSolicitacaoAcessibilidade = user.dataSolicitacaoAcessibilidade || new Date();
      } else {
        user.condicaoAcessibilidade = null;
        user.outraCondicao = null;
      }
    }

    await user.save();

    res.json({
      success: true,
      message: 'Dados atualizados com sucesso',
      user: {
        id: user._id,
        nome: user.nome,
        email: user.email,
        role: user.role,
        precisaAcessibilidade: user.precisaAcessibilidade,
        condicaoAcessibilidade: user.condicaoAcessibilidade,
        outraCondicao: user.outraCondicao
      }
    });
  } catch (error) {
    logger.error('❌ Erro ao atualizar usuário:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao atualizar usuário: ' + error.message
    });
  }
});

// ---------- /api/auth/trocar-senha ----------
app.post('/api/auth/trocar-senha', authenticateToken, async (req, res) => {
  try {
    const { senhaAtual, novaSenha } = req.body;
    const userId = req.userId;

    if (!senhaAtual || !novaSenha) {
      return res.status(400).json({
        success: false,
        error: 'Senha atual e nova senha são obrigatórias'
      });
    }

    const user = await User.findById(userId).select('+password +forcePasswordChange');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuário não encontrado'
      });
    }

    const isMatch = await user.comparePassword(senhaAtual);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'Senha atual incorreta'
      });
    }

    if (senhaAtual === novaSenha) {
      return res.status(400).json({
        success: false,
        error: 'A nova senha deve ser diferente da senha atual'
      });
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

    if (novaSenha.length < tamanhoMinimo) {
      return res.status(400).json({
        success: false,
        error: `A nova senha deve ter no mínimo ${tamanhoMinimo} caracteres`
      });
    }

    if (exigirMaiuscula && !/[A-Z]/.test(novaSenha)) {
      return res.status(400).json({
        success: false,
        error: 'A nova senha deve conter pelo menos uma letra maiúscula'
      });
    }

    if (exigirNumero && !/[0-9]/.test(novaSenha)) {
      return res.status(400).json({
        success: false,
        error: 'A nova senha deve conter pelo menos um número'
      });
    }

    if (exigirEspecial && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(novaSenha)) {
      return res.status(400).json({
        success: false,
        error: 'A nova senha deve conter pelo menos um caractere especial'
      });
    }

    user.password = novaSenha;
    user.forcePasswordChange = false;
    user.passwordChangedAt = new Date();

    await user.save();

    logger.info(`✅ Senha alterada para: ${user.email}`);

    res.json({
      success: true,
      message: 'Senha alterada com sucesso!',
      passwordChangedAt: user.passwordChangedAt
    });
  } catch (error) {
    logger.error('❌ Erro ao trocar senha:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno ao trocar senha: ' + error.message
    });
  }
});

// ============================================================================
// 🔒 LGPD: /api/perfil/me — SEM CPF
// ============================================================================
app.get('/api/perfil/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .select('-password -twoFactorSecret -twoFactorBackupCodes -twoFactorTempSecret -twoFactorSecretSms');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuário não encontrado'
      });
    }

    let dataNascimentoFormatada = null;
    if (user.dataNascimento) {
      const data = new Date(user.dataNascimento);
      dataNascimentoFormatada = data.toISOString().split('T')[0];
    }

    const perfilBase = {
      id: user._id,
      nome: user.nome,
      email: user.email,
      // 🔒 LGPD: NÃO retorna CPF aqui (usar /api/auth/me/dados-sensiveis)
      telefone: user.telefone,
      role: user.role,
      ativo: user.ativo,
      fotoPerfil: user.fotoPerfil,
      fotoPerfilTipo: user.fotoPerfilTipo,
      bio: user.bio,
      dataNascimento: dataNascimentoFormatada,
      genero: user.genero,
      endereco: user.endereco,
      cidade: user.cidade,
      estado: user.estado,
      cep: user.cep,
      instagram: user.instagram,
      linkedin: user.linkedin,
      website: user.website,
      interesses: user.interesses || [],
      preferenciasNotificacao: user.preferenciasNotificacao || {
        email: true,
        push: true,
        whatsapp: false,
        lembreteProvas: true,
        resultadoProvas: true,
        novidades: false
      },
      precisaAcessibilidade: user.precisaAcessibilidade,
      condicaoAcessibilidade: user.condicaoAcessibilidade,
      dataCadastro: user.createdAt,
      ultimaAtualizacaoPerfil: user.ultimaAtualizacaoPerfil,
      twoFactorEnabled: user.twoFactorEnabled,
      perfilAlimentar: user.perfilAlimentar || 'nao_informado',
      refeicoesQueParticipa: user.refeicoesQueParticipa || []
    };

    const dadosEspecificos = {};

    if (user.role === 'aluno') {
      dadosEspecificos.curso = user.curso;
      dadosEspecificos.turma = user.turma;
      dadosEspecificos.periodo = user.periodo;
      dadosEspecificos.matricula = user.matricula;
    } else if (user.role === 'professor') {
      dadosEspecificos.eixo = user.eixo;
      dadosEspecificos.departamento = user.departamento;
      dadosEspecificos.titulacao = user.titulacao;
      dadosEspecificos.matricula = user.matricula;
    } else if (user.role === 'admin' || user.role === 'super_admin') {
      dadosEspecificos.departamento = user.departamento;
      dadosEspecificos.nivel = user.role === 'super_admin' ? 'Super Administrador' : 'Administrador';
    } else {
      dadosEspecificos.departamento = user.departamento;
    }

    res.json({
      success: true,
      perfil: {
        ...perfilBase,
        ...dadosEspecificos
      }
    });
  } catch (error) {
    logger.error('❌ Erro ao buscar perfil:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar perfil: ' + error.message
    });
  }
});

app.put('/api/perfil/me', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const updates = req.body;

    logger.info(`✏️ Usuário ${userId} (${req.userRole}) atualizando perfil`);
    logger.info('📦 Dados recebidos:', updates);

    const camposPermitidos = [
      'nome', 'telefone', 'bio', 'dataNascimento', 'genero',
      'endereco', 'cidade', 'estado', 'cep',
      'instagram', 'linkedin', 'website', 'interesses',
      'preferenciasNotificacao', 'fotoPerfil', 'fotoPerfilTipo',
      'perfilAlimentar', 'refeicoesQueParticipa'
    ];

    if (req.userRole === 'aluno') {
      camposPermitidos.push('curso', 'turma', 'periodo');
    } else if (req.userRole === 'professor') {
      camposPermitidos.push('eixo', 'departamento', 'titulacao');
    } else if (req.userRole === 'admin' || req.userRole === 'super_admin') {
      camposPermitidos.push('departamento');
    } else {
      camposPermitidos.push('departamento', 'atribuicoes');
    }

    const dadosAtualizar = {};
    for (const campo of camposPermitidos) {
      if (updates[campo] !== undefined) {
        dadosAtualizar[campo] = updates[campo];
      }
    }

    if (dadosAtualizar.estado) {
      dadosAtualizar.estado = dadosAtualizar.estado.toUpperCase().substring(0, 2);
    }

    if (dadosAtualizar.website && dadosAtualizar.website.trim()) {
      if (!dadosAtualizar.website.startsWith('http')) {
        dadosAtualizar.website = 'https://' + dadosAtualizar.website;
      }
    }

    if (dadosAtualizar.instagram && dadosAtualizar.instagram.trim()) {
      dadosAtualizar.instagram = dadosAtualizar.instagram.replace(/^@/, '');
    }

    if (dadosAtualizar.linkedin && dadosAtualizar.linkedin.trim()) {
      if (!dadosAtualizar.linkedin.includes('linkedin.com')) {
        dadosAtualizar.linkedin = 'https://linkedin.com/in/' + dadosAtualizar.linkedin.replace(/^\/+/, '');
      }
    }

    if (dadosAtualizar.perfilAlimentar) {
      const valoresPermitidos = ['sempre', 'as_vezes', 'nunca', 'nao_informado'];
      if (!valoresPermitidos.includes(dadosAtualizar.perfilAlimentar)) {
        return res.status(400).json({
          success: false,
          error: 'Valor inválido para perfilAlimentar'
        });
      }
    }

    if (dadosAtualizar.refeicoesQueParticipa) {
      const refeicoesPermitidas = ['manha', 'almoco', 'tarde'];
      for (const ref of dadosAtualizar.refeicoesQueParticipa) {
        if (!refeicoesPermitidas.includes(ref)) {
          return res.status(400).json({
            success: false,
            error: `Valor inválido para refeicoesQueParticipa: ${ref}`
          });
        }
      }
    }

    dadosAtualizar.ultimaAtualizacaoPerfil = new Date();

    const user = await User.findByIdAndUpdate(
      userId,
      dadosAtualizar,
      { new: true, runValidators: true }
    ).select('-password -twoFactorSecret -twoFactorBackupCodes -twoFactorTempSecret -twoFactorSecretSms -cpf');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuário não encontrado'
      });
    }

    logger.info(`✅ Perfil do usuário ${user.email} atualizado`);

    res.json({
      success: true,
      message: 'Perfil atualizado com sucesso!',
      perfil: user
    });
  } catch (error) {
    logger.error('❌ Erro ao atualizar perfil:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao atualizar perfil: ' + error.message
    });
  }
});

app.post('/api/perfil/upload-foto', authenticateToken, uploadMiddleware.single('foto'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Nenhuma imagem enviada'
      });
    }

    const file = req.file;

    const tiposPermitidos = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!tiposPermitidos.includes(file.mimetype)) {
      fs.unlinkSync(file.path);
      return res.status(400).json({
        success: false,
        error: 'Tipo de imagem não suportado. Use JPEG, PNG, GIF ou WebP.'
      });
    }

    if (file.size > 2 * 1024 * 1024) {
      fs.unlinkSync(file.path);
      return res.status(400).json({
        success: false,
        error: 'Imagem muito grande. Máximo 2MB.'
      });
    }

    const imageBuffer = fs.readFileSync(file.path);
    const base64Image = imageBuffer.toString('base64');
    const dataUrl = `data:${file.mimetype};base64,${base64Image}`;

    const user = await User.findByIdAndUpdate(
      req.userId,
      {
        fotoPerfil: dataUrl,
        fotoPerfilTipo: file.mimetype,
        ultimaAtualizacaoPerfil: new Date()
      },
      { new: true }
    ).select('fotoPerfil fotoPerfilTipo nome email');

    fs.unlinkSync(file.path);

    logger.info(`✅ Foto de perfil atualizada: ${user.nome} (${user.email})`);

    res.json({
      success: true,
      message: 'Foto de perfil atualizada com sucesso!',
      fotoPerfil: user.fotoPerfil,
      fotoPerfilTipo: user.fotoPerfilTipo
    });
  } catch (error) {
    logger.error('❌ Erro no upload da foto:', error);
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({
      success: false,
      error: 'Erro ao fazer upload da foto: ' + error.message
    });
  }
});

app.delete('/api/perfil/remover-foto', authenticateToken, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.userId,
      {
        fotoPerfil: null,
        fotoPerfilTipo: null,
        ultimaAtualizacaoPerfil: new Date()
      },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuário não encontrado'
      });
    }

    logger.info(`🗑️ Foto de perfil removida: ${user.nome}`);

    res.json({
      success: true,
      message: 'Foto de perfil removida com sucesso!'
    });
  } catch (error) {
    logger.error('❌ Erro ao remover foto:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao remover foto de perfil: ' + error.message
    });
  }
});

app.get('/api/perfil/publico/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id).select(
      'nome email fotoPerfil bio role eixo curso turma dataCadastro'
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuário não encontrado'
      });
    }

    res.json({
      success: true,
      perfil: {
        id: user._id,
        nome: user.nome,
        email: user.email,
        fotoPerfil: user.fotoPerfil,
        bio: user.bio,
        role: user.role,
        eixo: user.eixo,
        curso: user.curso,
        turma: user.turma,
        dataCadastro: user.dataCadastro
      }
    });
  } catch (error) {
    logger.error('❌ Erro ao buscar perfil público:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar perfil: ' + error.message
    });
  }
});

// ============================================================================
// ROTAS DE UPLOAD
// ============================================================================

app.post('/api/upload/temp', authenticateToken, uploadMiddleware.single('arquivo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Nenhum arquivo enviado'
      });
    }

    const file = req.file;
    const fileUrl = `/uploads/${file.filename}`;

    let fileType = 'outro';
    const ext = path.extname(file.originalname).toLowerCase();

    if (['.pdf'].includes(ext)) fileType = 'pdf';
    else if (['.jpg', '.jpeg', '.png', '.gif'].includes(ext)) fileType = 'imagem';
    else if (['.txt', '.doc', '.docx'].includes(ext)) fileType = 'texto';

    res.json({
      success: true,
      file: {
        nome: file.originalname,
        nomeArquivo: file.filename,
        tamanho: file.size,
        tipo: fileType,
        url: fileUrl,
        mimetype: file.mimetype
      }
    });
  } catch (error) {
    logger.error('❌ Erro no upload:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao fazer upload: ' + error.message
    });
  }
});

app.post('/api/upload/imagem', authenticateToken, async (req, res) => {
  try {
    const isAdmin = req.userRole === 'admin' || req.userRole === 'super_admin';
    if (!isAdmin && req.userRole !== 'professor') {
      return res.status(403).json({
        success: false,
        error: 'Apenas professores e administradores podem enviar imagens'
      });
    }

    if (!req.files || !req.files.imagem) {
      return res.status(400).json({
        success: false,
        error: 'Nenhuma imagem enviada'
      });
    }

    const imagem = req.files.imagem;

    const tiposPermitidos = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!tiposPermitidos.includes(imagem.mimetype)) {
      return res.status(400).json({
        success: false,
        error: 'Tipo de imagem não suportado. Use JPEG, PNG, GIF ou WebP.'
      });
    }

    if (imagem.size > 5 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        error: 'Imagem muito grande. Máximo 5MB.'
      });
    }

    const uploadDir = path.join(__dirname, 'uploads/imagens-questoes');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const safeName = imagem.name.replace(/[^a-zA-Z0-9.]/g, '_');
    const fileName = `questao_img_${Date.now()}_${safeName}`;
    const filePath = path.join(uploadDir, fileName);

    await imagem.mv(filePath);

    const imageUrl = `/uploads/imagens-questoes/${fileName}`;

    logger.info(`✅ Imagem salva: ${imageUrl}`);

    res.json({
      success: true,
      url: imageUrl,
      nome: imagem.name,
      nomeArquivo: fileName,
      tipo: imagem.mimetype,
      tamanho: imagem.size,
      dataUpload: new Date().toISOString()
    });
  } catch (error) {
    logger.error('❌ Erro no upload de imagem:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao processar imagem'
    });
  }
});

app.delete('/api/upload/limpar-imagens', authenticateToken, async (req, res) => {
  try {
    if (req.userRole !== 'admin' && req.userRole !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'Apenas administradores podem limpar imagens'
      });
    }

    logger.info(`🧹 Admin ${req.userId} iniciando limpeza de imagens`);

    const uploadsDir = path.join(__dirname, 'uploads');
    const imagensDir = path.join(__dirname, 'uploads', 'imagens-questoes');

    const imagensEmUso = new Set();

    const provas = await Prova.find({
      $or: [
        { 'questoes.imagens': { $exists: true, $ne: [] } },
        { anexos: { $exists: true, $ne: [] } }
      ]
    }).select('questoes anexos').lean();

    provas.forEach(prova => {
      if (prova.questoes) {
        prova.questoes.forEach(q => {
          if (q.imagens && Array.isArray(q.imagens)) {
            q.imagens.forEach(img => {
              if (img.url) imagensEmUso.add(img.url.split('/').pop());
              if (img.nomeArquivo) imagensEmUso.add(img.nomeArquivo);
            });
          }
        });
      }
      if (prova.anexos) {
        prova.anexos.forEach(anexo => {
          if (anexo.url) imagensEmUso.add(anexo.url.split('/').pop());
          if (anexo.nomeArquivo) imagensEmUso.add(anexo.nomeArquivo);
        });
      }
    });

    const extensoesImagem = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
    const arquivosParaDeletar = [];
    let totalArquivos = 0;
    let tamanhoTotalLiberado = 0;

    const verificarPasta = (pasta, nomePasta) => {
      if (!fs.existsSync(pasta)) return;

      const arquivos = fs.readdirSync(pasta);
      for (const arquivo of arquivos) {
        const filePath = path.join(pasta, arquivo);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) continue;

        const ext = path.extname(arquivo).toLowerCase();
        if (!extensoesImagem.includes(ext)) continue;

        totalArquivos++;

        if (!imagensEmUso.has(arquivo)) {
          arquivosParaDeletar.push({
            caminho: filePath,
            nome: arquivo,
            tamanho: stat.size,
            pasta: nomePasta
          });
          tamanhoTotalLiberado += stat.size;
        }
      }
    };

    verificarPasta(uploadsDir, 'uploads');
    verificarPasta(imagensDir, 'imagens-questoes');

    let deletados = 0;
    for (const arquivo of arquivosParaDeletar) {
      try {
        fs.unlinkSync(arquivo.caminho);
        deletados++;
      } catch (error) {
        logger.error(`❌ Erro ao deletar ${arquivo.nome}:`, error.message);
      }
    }

    const formatarBytes = (bytes) => {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    logger.info(`✅ Limpeza: ${deletados} deletados`);

    res.json({
      success: true,
      message: `${deletados} imagem(ns) removida(s)!`,
      estatisticas: {
        totalArquivos,
        arquivosEmUso: imagensEmUso.size,
        deletados,
        espacoLiberado: formatarBytes(tamanhoTotalLiberado)
      }
    });
  } catch (error) {
    logger.error('❌ Erro na limpeza:', error);
    res.status(500).json({
      success: false,
      error: 'Erro na limpeza: ' + error.message
    });
  }
});

// ============================================================================
// ROTA: QR CODE DO USUÁRIO LOGADO
// ============================================================================
app.get('/api/usuario/qrcode', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .select('+qrCodeUsuario qrCodeUsuarioGeradoEm qrCodeUsuarioTipo nome role');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuário não encontrado'
      });
    }

    if (!user.qrCodeUsuario) {
      const BASE_URL = IS_DEVELOPMENT
        ? 'http://localhost:3000'
        : (process.env.BASE_URL || 'https://seu-dominio.com');

      let paginaDestino = '';
      switch (user.role) {
        case 'aluno': paginaDestino = 'identificar-aluno'; break;
        case 'professor': paginaDestino = 'identificar-professor'; break;
        case 'admin':
        case 'super_admin': paginaDestino = 'identificar-admin'; break;
        case 'setor_pedagogico': paginaDestino = 'identificar-setor'; break;
        default: paginaDestino = 'identificar-usuario';
      }

      const usuarioUrl = `${BASE_URL}/${paginaDestino}.html?id=${user._id}`;
      const qrCodeDataUrl = await QRCode.toDataURL(usuarioUrl, {
        errorCorrectionLevel: 'H',
        margin: 1,
        width: 200
      });

      user.qrCodeUsuario = qrCodeDataUrl;
      user.qrCodeUsuarioGeradoEm = new Date();
      user.qrCodeUsuarioTipo = user.role;
      await user.save();
    }

    let paginaExibicao = '';
    let tituloExibicao = '';

    switch (user.role) {
      case 'aluno':
        paginaExibicao = 'aluno.html';
        tituloExibicao = 'Área do Aluno';
        break;
      case 'professor':
        paginaExibicao = 'index.html';
        tituloExibicao = 'Dashboard do Professor';
        break;
      case 'admin':
      case 'super_admin':
        paginaExibicao = 'admin.html';
        tituloExibicao = 'Painel Administrativo';
        break;
      case 'setor_pedagogico':
        paginaExibicao = 'setor-pedagogico.html';
        tituloExibicao = 'Setor Pedagógico';
        break;
      default:
        paginaExibicao = 'login.html';
        tituloExibicao = 'EducaPleno';
    }

    res.json({
      success: true,
      qrCode: user.qrCodeUsuario,
      geradoEm: user.qrCodeUsuarioGeradoEm,
      tipo: user.qrCodeUsuarioTipo,
      usuario: {
        id: user._id,
        nome: user.nome,
        role: user.role,
        paginaDestino: paginaExibicao,
        tituloDestino: tituloExibicao
      }
    });
  } catch (error) {
    logger.error('❌ Erro ao buscar QR Code:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// ROTA PÚBLICA: IDENTIFICAR USUÁRIO PELO QR CODE (sem CPF)
// ============================================================================
app.get('/api/identificar-usuario/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id)
      .select('nome email role matricula curso turma eixo departamento');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuário não encontrado'
      });
    }

    const dadosEspecificos = {};

    if (user.role === 'aluno') {
      dadosEspecificos.matricula = user.matricula;
      dadosEspecificos.curso = user.curso;
      dadosEspecificos.turma = user.turma;
    } else if (user.role === 'professor') {
      dadosEspecificos.matricula = user.matricula;
      dadosEspecificos.eixo = user.eixo;
      dadosEspecificos.departamento = user.departamento;
    } else if (user.role === 'setor_pedagogico') {
      dadosEspecificos.departamento = user.departamento;
    } else if (user.role === 'admin' || user.role === 'super_admin') {
      dadosEspecificos.departamento = user.departamento;
      dadosEspecificos.nivel = user.role === 'super_admin' ? 'Super Administrador' : 'Administrador';
    }

    res.json({
      success: true,
      usuario: {
        id: user._id,
        nome: user.nome,
        email: user.email,
        role: user.role,
        ...dadosEspecificos
      }
    });
  } catch (error) {
    logger.error('❌ Erro ao identificar usuário:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// ROTAS DE PÁGINAS HTML PROTEGIDAS
// ============================================================================

app.get('/realizar-prova.html', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(401).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Acesso Negado</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; text-align: center; }
            .container { max-width: 500px; margin: 0 auto; }
            .error { background: #ffecec; border: 1px solid #f5aca6; padding: 20px; border-radius: 5px; margin: 20px 0; }
            .btn { display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🔒 Acesso Negado</h1>
            <div class="error"><p>Token de acesso não fornecido.</p></div>
            <a href="/aluno.html" class="btn">Voltar ao Painel</a>
          </div>
        </body>
        </html>
      `);
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      if (decoded.access !== 'prova') {
        return res.status(403).send('Token inválido para esta operação');
      }

      res.sendFile(path.join(__dirname, '../frontend/realizar-prova.html'));
    } catch (error) {
      return res.status(401).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Token Expirado</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; text-align: center; }
            .container { max-width: 500px; margin: 0 auto; }
            .error { background: #fff3cd; border: 1px solid #ffeaa7; padding: 20px; border-radius: 5px; margin: 20px 0; }
            .btn { display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>⏰ Token Expirado</h1>
            <div class="error"><p>Seu token de acesso expirou. Acesse a prova novamente pelo painel.</p></div>
            <a href="/aluno.html" class="btn">Voltar ao Painel</a>
          </div>
        </body>
        </html>
      `);
    }
  } catch (error) {
    logger.error('Erro na rota realizar-prova:', error);
    res.status(500).send('Erro interno do servidor');
  }
});

app.get('/corrigir-prova', async (req, res) => {
  try {
    const token = req.query.token || req.headers.authorization?.split(' ')[1];

    if (!token) {
      const returnUrl = encodeURIComponent(`/corrigir-prova?prova=${req.query.prova}`);
      return res.redirect(`/login.html?redirect=${returnUrl}`);
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      const returnUrl = encodeURIComponent(`/corrigir-prova?prova=${req.query.prova}`);
      return res.redirect(`/login.html?redirect=${returnUrl}`);
    }

    const user = await User.findById(decoded.id);
    if (!user || !user.ativo) {
      return res.redirect('/login.html');
    }

    const isAdmin = user.role === 'admin' || user.role === 'super_admin';
    const isProfessor = user.role === 'professor';

    if (!isAdmin && !isProfessor) {
      return res.status(403).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Acesso Negado</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
            .card { background: white; max-width: 500px; margin: 0 auto; padding: 30px; border-radius: 20px; }
            .error { color: #dc3545; }
            .btn { display: inline-block; padding: 10px 20px; background: #0d6efd; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1 class="error">⛔ Acesso Negado</h1>
            <p>Apenas professores e administradores podem acessar esta página.</p>
            <a href="/login.html" class="btn">Fazer Login</a>
          </div>
        </body>
        </html>
      `);
    }

    const provaId = req.query.prova;
    if (!provaId) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Parâmetro Inválido</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
            .card { background: white; max-width: 500px; margin: 0 auto; padding: 30px; border-radius: 20px; }
            .error { color: #dc3545; }
            .btn { display: inline-block; padding: 10px 20px; background: #0d6efd; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1 class="error">⚠️ Parâmetro Inválido</h1>
            <p>ID da prova não informado.</p>
            <a href="/admin.html" class="btn">Voltar</a>
          </div>
        </body>
        </html>
      `);
    }

    const prova = await Prova.findById(provaId);

    if (!prova) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Prova Não Encontrada</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
            .card { background: white; max-width: 500px; margin: 0 auto; padding: 30px; border-radius: 20px; }
            .error { color: #dc3545; }
            .btn { display: inline-block; padding: 10px 20px; background: #0d6efd; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1 class="error">🔍 Prova Não Encontrada</h1>
            <p>A prova que você está tentando corrigir não existe.</p>
            <a href="/admin.html" class="btn">Voltar</a>
          </div>
        </body>
        </html>
      `);
    }

    if (isProfessor && prova.userId.toString() !== user._id.toString()) {
      return res.status(403).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Acesso Negado</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
            .card { background: white; max-width: 500px; margin: 0 auto; padding: 30px; border-radius: 20px; }
            .error { color: #dc3545; }
            .btn { display: inline-block; padding: 10px 20px; background: #0d6efd; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1 class="error">⛔ Acesso Negado</h1>
            <p>Você só pode corrigir provas que você criou.</p>
            <a href="/index.html" class="btn">Voltar</a>
          </div>
        </body>
        </html>
      `);
    }

    const frontendPath = path.join(__dirname, '../frontend/corrigir-prova.html');

    if (!fs.existsSync(frontendPath)) {
      logger.error('❌ Arquivo corrigir-prova.html não encontrado:', frontendPath);
      return res.status(404).send('Página não encontrada');
    }

    let html = fs.readFileSync(frontendPath, 'utf8');

    html = html.replace('</head>', `
      <script>
        window.PROVA_ID = '${provaId}';
        window.USUARIO_ID = '${user._id}';
        window.USUARIO_ROLE = '${user.role}';
        window.USUARIO_NOME = '${user.nome || ''}';
        window.AUTH_TOKEN = '${token}';
      </script>
    </head>`);

    res.send(html);
  } catch (error) {
    logger.error('❌ Erro ao carregar página de correção:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Erro no Servidor</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
          .card { background: white; max-width: 500px; margin: 0 auto; padding: 30px; border-radius: 20px; }
          .error { color: #dc3545; }
          .btn { display: inline-block; padding: 10px 20px; background: #0d6efd; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1 class="error">❌ Erro no Servidor</h1>
          <p>Ocorreu um erro ao carregar a página de correção.</p>
          <a href="/admin.html" class="btn">Voltar</a>
        </div>
      </body>
      </html>
    `);
  }
});

logger.info('✅ Rotas remanescentes registradas');

// ============================================================================
// REGISTRO DE TIMERS (para encerramento correto)
// ============================================================================
const timersAtivos = [];

function registrarTimer(timerId) {
  timersAtivos.push(timerId);
  return timerId;
}

function limparTodosTimers() {
  let total = timersAtivos.length;
  timersAtivos.forEach(timerId => {
    try {
      clearInterval(timerId);
      clearTimeout(timerId);
    } catch (e) { /* ignora */ }
  });
  timersAtivos.length = 0;
  logger.info(`🧹 ${total} timers limpos`);
}

// ============================================================================
// SERVIÇO: NOTIFICAÇÃO BASEADA NO TEMPO DO BOTÃO
// ============================================================================
const NotificacaoBotaoService = {
  notificacoesEnviadas: new Set(),

  limparCache: function () {
    const umaHoraAtras = Date.now() - (60 * 60 * 1000);
    for (const key of this.notificacoesEnviadas) {
      const timestamp = parseInt(key.split('_')[2]);
      if (timestamp && timestamp < umaHoraAtras) {
        this.notificacoesEnviadas.delete(key);
      }
    }
  },

  verificarNotificacoes: async function () {
    try {
      const agora = new Date();
      const ano = agora.getFullYear();
      const mes = String(agora.getMonth() + 1).padStart(2, '0');
      const dia = String(agora.getDate()).padStart(2, '0');

      const provas = await Prova.find({
        publicada: true,
        status: 'ativa',
        dataLimite: { $gte: agora }
      }).populate('turmaId', 'alunos nome').lean();

      for (const prova of provas) {
        if (!prova.horarioInicio) continue;

        const inicioProva = new Date(`${ano}-${mes}-${dia}T${prova.horarioInicio}:00-03:00`);
        const diffMinutos = Math.floor((inicioProva - agora) / (1000 * 60));

        if (diffMinutos === 10 || diffMinutos === 5) {
          const chave = `botao_${prova._id}_${diffMinutos}_${Date.now()}`;

          if (this.notificacoesEnviadas.has(chave)) continue;

          logger.info(`   🔔 BOTÃO: "Disponível em ${diffMinutos}min" detectado!`);

          const turma = await Turma.findById(prova.turmaId)
            .populate('alunos', 'nome onesignalPlayerId');
          const alunos = turma?.alunos || [];

          if (alunos.length === 0) continue;

          const configDoc = await Config.findOne({ chave: 'notificacoes' });
          const pushAtivado = configDoc?.valor?.push === true;
          const OneSignalService = require('./services/onesignal-service');
          const oneSignal = pushAtivado ? new OneSignalService() : null;

          const mensagens = {
            10: {
              titulo: '⏰ 10 minutos para a prova!',
              mensagem: `A prova "${prova.titulo}" começa em 10 minutos. Prepare-se!`,
              cor: '#f59e0b',
              icone: '⏰'
            },
            5: {
              titulo: '🔥 5 minutos para a prova!',
              mensagem: `A prova "${prova.titulo}" começa em 5 minutos. Já está pronto?`,
              cor: '#ef4444',
              icone: '🔥'
            }
          };

          const msg = mensagens[diffMinutos];

          for (const aluno of alunos) {
            try {
              const notificacao = new Notificacao({
                usuarioId: aluno._id,
                tipo: 'lembrete_prova',
                titulo: msg.titulo,
                mensagem: msg.mensagem,
                icone: msg.icone,
                cor: msg.cor,
                link: `/aluno.html`,
                prioridade: diffMinutos === 5 ? 5 : 4,
                dados: {
                  provaId: prova._id,
                  provaTitulo: prova.titulo,
                  minutosRestantes: diffMinutos,
                  textoBotao: `Disponível em ${diffMinutos}min`,
                  tipo: 'notificacao_botao'
                }
              });

              await notificacao.save();

              if (pushAtivado && oneSignal && aluno.onesignalPlayerId) {
                await oneSignal.enviarPush(
                  aluno._id,
                  msg.titulo,
                  msg.mensagem,
                  {
                    tipo: 'lembrete_proximo',
                    provaId: prova._id,
                    minutos: diffMinutos
                  }
                );
              }
            } catch (error) {
              logger.error(`   ❌ Erro ao notificar aluno:`, error.message);
            }
          }

          this.notificacoesEnviadas.add(chave);
          logger.info(`   ✅ Notificações ${diffMinutos}min enviadas para ${alunos.length} alunos`);
        }
      }

      this.limparCache();
    } catch (error) {
      logger.error('❌ Erro no serviço de notificações:', error);
    }
  },

  iniciar: function () {
    logger.info('='.repeat(60));
    logger.info('⏰ SERVIÇO DE NOTIFICAÇÕES DO BOTÃO INICIADO');
    logger.info('📱 Monitorando "Disponível em 10min" e "Disponível em 5min"');
    logger.info('='.repeat(60));

    registrarTimer(setTimeout(() => this.verificarNotificacoes(), 5000));
    registrarTimer(setInterval(() => this.verificarNotificacoes(), 60 * 1000));
  }
};

NotificacaoBotaoService.iniciar();

// ============================================================================
// SERVIÇO: VERIFICADOR DE NOTIFICAÇÕES DO CALENDÁRIO (a cada 1 min)
// ============================================================================
registrarTimer(setInterval(async () => {
  try {
    const CalendarioNotificacaoService = require('./services/calendario-notificacao-service');
    const service = new CalendarioNotificacaoService();
    const resultado = await service.verificarNotificacoesCalendario();

    if (resultado.notificacoesEnviadas > 0) {
      logger.info(`✅ ${resultado.notificacoesEnviadas} notificações de calendário enviadas!`);
    }
  } catch (error) {
    logger.error('❌ Erro no verificador de notificações de calendário:', error);
  }
}, 60000));

// ============================================================================
// SERVIÇO: INICIALIZAR SERVIDOR OMR (PYTHON)
// ============================================================================
registrarTimer(setTimeout(() => {
  try {
    if (omrRoutes && typeof omrRoutes.iniciarServidorOMR === 'function') {
      omrRoutes.iniciarServidorOMR();
    }
  } catch (error) {
    logger.error('❌ Erro ao iniciar servidor OMR:', error.message);
  }
}, 2000));

// ============================================================================
// ROTA RAIZ INTELIGENTE
// ============================================================================
app.get('/', async (req, res) => {
  try {
    let token = req.cookies?.auth_token ||
                (req.headers.authorization?.split(' ')[1]);

    if (!token) {
      return res.redirect('/login.html');
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      const user = await User.findById(decoded.id).select('role ativo');

      if (!user || !user.ativo) {
        return res.redirect('/login.html');
      }

      const redirectMap = {
        'super_admin': '/admin.html',
        'admin': '/admin-simples.html',
        'professor': '/index.html',
        'setor_pedagogico': '/setor-pedagogico.html',
        'coordenacao_patio': '/coordenacao-patio.html',
        'cozinha': '/cozinha-dashboard.html',
        'gestao_geral': '/gestao-geral.html',
        'enfermaria': '/enfermaria.html',
        'supervisao': '/supervisao.html',
        'biblioteca': '/biblioteca.html',
        'psicologia': '/psicologia.html',
        'assistente-social': '/assistente-social.html',
        'protagonismo': '/protagonismo.html',
        'secretaria': '/secretaria.html',
        'aluno': '/aluno.html'
      };

      const destino = redirectMap[user.role] || '/login.html';
      return res.redirect(destino);

    } catch (jwtError) {
      res.clearCookie('auth_token');
      return res.redirect('/login.html');
    }
  } catch (error) {
    logger.error('❌ Erro na rota raiz:', error);
    return res.redirect('/login.html');
  }
});

// ============================================================================
// FRONTEND ESTÁTICO
// ============================================================================
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ============================================================================
// CATCH-ALL
// ============================================================================
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      success: false,
      error: 'Rota de API não encontrada'
    });
  }

  res.redirect('/login.html');
});

// ============================================================================
// INICIAR SERVIDOR
// ============================================================================
server.listen(PORT, '0.0.0.0', () => {
  logger.info('='.repeat(50));
  logger.info(`🚀 EDUCAPLENO ONLINE - PRODUÇÃO`);
  logger.info(`📡 Servidor rodando na porta: ${PORT}`);
  logger.info(`🌐 URL: https://prova-iema-2026.onrender.com`);
  logger.info(`💻 Local: http://localhost:3000/login.html`);
  logger.info(`🗄️  Banco: ${mongoose.connection.readyState === 1 ? '✅ Conectado' : '❌ Desconectado'}`);
  logger.info(`🔐 Autenticação: ${process.env.JWT_SECRET ? '✅ Configurada' : '⚠️  Configurar JWT_SECRET'}`);
  logger.info('🔐 ===== CONFORMIDADE LGPD =====');
  logger.info(`   • Criptografia: ${process.env.ENCRYPTION_KEY ? '✅' : '❌'} (AES-256-GCM)`);
  logger.info(`   • Retenção: ${process.env.RETENCAO_VISITAS_ANOS || 2} anos`);
  logger.info(`   • DPO: ${process.env.DPO_EMAIL || 'não configurado'}`);
  logger.info(`   • Cron jobs: ✅`);
  logger.info('=================================');
  logger.info(`👥 Modelos carregados: User, Prova, Resultado, ProvaRealizada, Turma`);
  logger.info('='.repeat(50));
});

// ============================================================================
// TIMEOUTS DO SERVIDOR
// ============================================================================
server.timeout = 120000;
server.keepAliveTimeout = 120000;
logger.info('⏱️ Timeout do servidor configurado para 2 minutos');

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================
let shuttingDown = false;

const gracefulShutdown = (sinal) => {
  if (shuttingDown) {
    logger.warn('⚠️ Já está encerrando. Forçando saída...');
    process.exit(1);
    return;
  }

  shuttingDown = true;
  logger.info(`⚠️ ${sinal} recebido. Encerrando servidor...`);

  try {
    limparTodosTimers();
  } catch (e) { /* ignora */ }

  const forceExit = setTimeout(() => {
    logger.warn('⚠️ Timeout de 5s. Forçando encerramento...');
    process.exit(1);
  }, 5000);

  server.close(async () => {
    logger.info('✅ Servidor HTTP encerrado.');

    try {
      await mongoose.connection.close(false);
      logger.info('✅ Conexão MongoDB encerrada.');
    } catch (err) {
      logger.error('❌ Erro ao fechar MongoDB:', err.message);
    }

    clearTimeout(forceExit);
    process.exit(0);
  });

  if (typeof server.closeAllConnections === 'function') {
    server.closeAllConnections();
  }

  if (typeof server.closeIdleConnections === 'function') {
    server.closeIdleConnections();
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  logger.error('❌ Exceção não capturada:', err);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  logger.error('❌ Promise rejeitada não tratada:', reason);
});

// ============================================================================
// FIM DO ARQUIVO
// ============================================================================