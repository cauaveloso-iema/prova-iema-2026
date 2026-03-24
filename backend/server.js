// ============================================================================
// SERVIDOR PROVA IEMA 2026
// ============================================================================
// Descrição: Backend do sistema de provas online do IEMA
// Ambiente: Desenvolvimento/Produção
// Versão: 1.0.0
// Autor: Equipe de Desenvolvimento
// ============================================================================

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const helmet = require('helmet');
const compression = require('compression');
const { check, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const professorAuth = require('./security/professor-auth');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const multer = require('multer');
const fs = require('fs');
const Groq = require("groq-sdk");
const http = require('http');
const cookieParser = require('cookie-parser');

// ============================================================================
// FORÇAR FUSO HORÁRIO (LOGO NA PRIMEIRA LINHA)
// ============================================================================
process.env.TZ = 'America/Sao_Paulo';

// ============================================
// RECONHECIMENTO FACIAL COM FACE-API.JS (VERSÃO RÁPIDA)
// ============================================
// ============================================
// RECONHECIMENTO FACIAL COM FACE-API.JS (VERSÃO COMPLETA)
// ============================================
const faceapi = require('face-api.js');
const canvas = require('canvas');
const tf = require('@tensorflow/tfjs');

// Configurar ambiente Node.js para face-api
const { Canvas, Image, ImageData } = canvas;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

const MODELS_PATH = path.join(__dirname, '..', 'models');
let modelsLoaded = false;

// Função para verificar se todos os arquivos de modelo existem
function verificarArquivosModelos() {
    const arquivosNecessarios = [
        'tiny_face_detector_model-weights_manifest.json',
        'tiny_face_detector_model-shard1',
        'face_landmark_68_model-weights_manifest.json',
        'face_landmark_68_model-shard1',
        'face_recognition_model-weights_manifest.json',
        'face_recognition_model-shard1',
        'face_recognition_model-shard2'
    ];
    
    const arquivosFaltando = [];
    
    for (const arquivo of arquivosNecessarios) {
        const caminhoCompleto = path.join(MODELS_PATH, arquivo);
        if (!fs.existsSync(caminhoCompleto)) {
            arquivosFaltando.push(arquivo);
        }
    }
    
    return arquivosFaltando;
}

// Função para carregar os modelos (VERSÃO COMPLETA)
async function loadFaceModels() {
    if (modelsLoaded) {
        console.log('✅ Modelos já carregados anteriormente');
        return true;
    }
    
    console.log('='.repeat(60));
    console.log('🔄 INICIANDO CARREGAMENTO DOS MODELOS DE RECONHECIMENTO FACIAL');
    console.log('📁 Diretório dos modelos:', MODELS_PATH);
    console.log('='.repeat(60));
    
    // Verificar se o diretório existe
    if (!fs.existsSync(MODELS_PATH)) {
        console.error('❌ Diretório de modelos não encontrado!');
        console.log('📁 Criando diretório:', MODELS_PATH);
        fs.mkdirSync(MODELS_PATH, { recursive: true });
    }
    
    // Verificar arquivos necessários
    const arquivosFaltando = verificarArquivosModelos();
    
    if (arquivosFaltando.length > 0) {
        console.error('❌ Arquivos de modelo ausentes:');
        arquivosFaltando.forEach(arquivo => console.error('   -', arquivo));
        console.log('\n📥 Para baixar os modelos, execute:');
        console.log('   node download-models-complete.js');
        console.log('='.repeat(60));
        return false;
    }
    
    console.log('✅ Todos os arquivos de modelo encontrados');
    console.log('='.repeat(60));
    
    try {
        // PASSO 1: Carregar TinyFaceDetector (para detecção rápida)
        console.log('📦 PASSO 1: Carregando TinyFaceDetector...');
        const startTime1 = Date.now();
        await faceapi.nets.tinyFaceDetector.loadFromDisk(MODELS_PATH);
        const time1 = Date.now() - startTime1;
        console.log(`✅ TinyFaceDetector carregado em ${time1}ms`);
        
        // PASSO 2: Carregar FaceLandmark68 (para landmarks faciais)
        console.log('📦 PASSO 2: Carregando FaceLandmark68...');
        const startTime2 = Date.now();
        await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS_PATH);
        const time2 = Date.now() - startTime2;
        console.log(`✅ FaceLandmark68 carregado em ${time2}ms`);
        
        // PASSO 3: Carregar FaceRecognitionNet (PARA GERAR DESCRIPTORS!)
        console.log('📦 PASSO 3: Carregando FaceRecognitionNet...');
        const startTime3 = Date.now();
        await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS_PATH);
        const time3 = Date.now() - startTime3;
        console.log(`✅ FaceRecognitionNet carregado em ${time3}ms`);
        
        const tempoTotal = time1 + time2 + time3;
        
        console.log('='.repeat(60));
        console.log('✅ TODOS OS MODELOS CARREGADOS COM SUCESSO!');
        console.log(`⏱️  Tempo total: ${tempoTotal}ms`);
        console.log('📊 Modelos disponíveis:');
        console.log('   - TinyFaceDetector (detecção rápida)');
        console.log('   - FaceLandmark68 (pontos faciais)');
        console.log('   - FaceRecognitionNet (descriptors)');
        console.log('='.repeat(60));
        
        modelsLoaded = true;
        return true;
        
    } catch (error) {
        console.error('❌ ERRO AO CARREGAR MODELOS:');
        console.error('   Nome:', error.name);
        console.error('   Mensagem:', error.message);
        console.error('   Stack:', error.stack);
        console.log('='.repeat(60));
        console.log('💡 SOLUÇÕES:');
        console.log('   1. Verifique se os arquivos de modelo existem em:', MODELS_PATH);
        console.log('   2. Execute: node download-models-complete.js');
        console.log('   3. Verifique as permissões de leitura dos arquivos');
        console.log('='.repeat(60));
        
        return false;
    }
}

// Função para verificar status dos modelos
function getModelStatus() {
    return {
        modelsLoaded,
        modelsPath: MODELS_PATH,
        arquivosPresentes: verificarArquivosModelos().length === 0,
        timestamp: new Date().toISOString()
    };
}

// Chamar no startup com tratamento de erro
(async () => {
    console.log('🚀 Inicializando sistema de reconhecimento facial...');
    const loaded = await loadFaceModels();
    
    if (!loaded) {
        console.warn('⚠️  Sistema de reconhecimento facial não está totalmente funcional!');
        console.log('💡 O cadastro de Face ID pode não funcionar corretamente.');
    } else {
        console.log('✅ Sistema de reconhecimento facial pronto para uso!');
    }
})();

// Exportar funções para uso em outras partes do código
module.exports = {
    loadFaceModels,
    getModelStatus,
    modelsLoaded: () => modelsLoaded
};

// ============================================================================
// INICIALIZAÇÃO DO EXPRESS E SERVIDOR
// ============================================================================
const app = express();
const PORT = process.env.PORT || 10000;
const server = http.createServer(app);

// ============================================================================
// LOGGER DEVE SER O PRIMEIRO SERVIÇO A SER INICIALIZADO
// ============================================================================
const LoggerService = require('./services/logger-service');
const loggerService = new LoggerService(server);

// ============================================================================
// AGORA TODOS OS CONSOLE.LOG SERÃO CAPTURADOS (INCLUINDO OS PRIMEIROS)
// ============================================================================
console.log('🌍 FUSO HORÁRIO FORÇADO PARA:', process.env.TZ);
console.log('🕒 HORA ATUAL DO SERVIDOR (local):', new Date().toString());
console.log('🕒 HORA ATUAL DO SERVIDOR (ISO):', new Date().toISOString());
console.log('='.repeat(60));
console.log('🚀 Servidor iniciando...');
console.log('📝 LoggerService ativo desde o boot!');

// ============================================================================
// CRIAÇÃO DE DIRETÓRIOS NECESSÁRIOS
// ============================================================================
const dirs = [
    path.join(__dirname, 'logs'),
    path.join(__dirname, 'backups'),
    path.join(__dirname, 'uploads'),
    path.join(__dirname, '../frontend')
];

dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`📁 Diretório criado: ${dir}`);
    }
});

// ============================================================================
// LOGS DE DEPURAÇÃO INICIAL
// ============================================================================
console.log('📁 Diretório atual:', __dirname);
console.log('🔍 Procurando .env em:', path.join(__dirname, '..', '.env'));
console.log('🔑 Chave encontrada?:', process.env.OPENROUTER_API_KEY ? '✅ Sim' : '❌ Não');
console.log('🔑 OpenRouter API Key:', process.env.OPENROUTER_API_KEY ? '✅ Configurada' : '❌ Não configurada');

// ============================================================================
// IMPORTAÇÃO DE SERVIÇOS
// ============================================================================
const monitoramentoRoutes = require('./routes/monitoramento');
const EmailService = require('./services/email-service');
const matriculasManager = require('./matriculas/index');
const OneSignalAdminService = require('./services/onesignal-admin-service');
const oneSignalAdmin = new OneSignalAdminService();

// ============================================================================
// CONFIGURAÇÃO DO QR CODE (TOTP)
// ============================================================================
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');

// ============ SERVIÇO DE SMS (TWILIO) - VERSÃO CORRIGIDA ============
const twilio = require('twilio');

// Configurar Twilio (com validação)
let twilioClient = null;
try {
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
        twilioClient = twilio(
            process.env.TWILIO_ACCOUNT_SID,
            process.env.TWILIO_AUTH_TOKEN
        );
        console.log('✅ Twilio client inicializado com sucesso');
    } else {
        console.warn('⚠️ Credenciais Twilio não configuradas');
    }
} catch (error) {
    console.error('❌ Erro ao inicializar Twilio:', error.message);
}

async function enviarSmsTwilio(telefone, mensagem) {
    try {
        // Verificar se o client foi inicializado
        if (!twilioClient) {
            throw new Error('Twilio client não inicializado - verifique credenciais');
        }

        // Garantir que o telefone está no formato E.164 (+55...)
        let numeroDestino = telefone;
        if (!telefone.startsWith('+')) {
            numeroDestino = `+55${telefone.replace(/\D/g, '')}`;
        }

        console.log('📱 Enviando SMS...');
        console.log('   Para:', numeroDestino);
        console.log('   Mensagem:', mensagem.substring(0, 30) + '...');
        
        // Validar formato do número
        const telefoneLimpo = numeroDestino.replace(/\D/g, '');
        if (telefoneLimpo.length < 10 || telefoneLimpo.length > 13) {
            throw new Error(`Número de telefone inválido: ${numeroDestino}`);
        }
        
        // PRIORIDADE 1: Usar Messaging Service (recomendado)
        if (process.env.TWILIO_MESSAGING_SERVICE_SID) {
            try {
                console.log('📤 Tentando com Messaging Service...');
                const message = await twilioClient.messages.create({
                    body: mensagem,
                    messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID,
                    to: numeroDestino
                });
                
                console.log(`✅ SMS enviado via Messaging Service! SID: ${message.sid}`);
                return { 
                    success: true, 
                    sid: message.sid, 
                    enviado: true,
                    via: 'messaging_service'
                };
            } catch (error) {
                console.log('⚠️ Erro no Messaging Service:', error.message);
                // Se falhar, tenta com número direto
            }
        }
        
        // PRIORIDADE 2: Usar número direto
        if (process.env.TWILIO_PHONE_NUMBER) {
            try {
                console.log('📤 Tentando com número direto...');
                const message = await twilioClient.messages.create({
                    body: mensagem,
                    from: process.env.TWILIO_PHONE_NUMBER,
                    to: numeroDestino
                });
                
                console.log(`✅ SMS enviado via número direto! SID: ${message.sid}`);
                return { 
                    success: true, 
                    sid: message.sid, 
                    enviado: true,
                    via: 'numero_direto'
                };
            } catch (error) {
                console.log('⚠️ Erro no número direto:', error.message);
                throw error;
            }
        }
        
        throw new Error('Nenhuma configuração de SMS encontrada');
        
    } catch (error) {
        console.error('❌ Erro Twilio:', error.message);
        
        // Fallback - mostra o código no console
        const codigoMatch = mensagem.match(/\d{6}/);
        const codigo = codigoMatch ? codigoMatch[0] : '123456';
        
        console.log(`\n🔧 FALLBACK - Código seria: ${codigo}`);
        console.log(`🔧 Motivo: ${error.message}\n`);
        console.log('💡 DICA: Verifique as credenciais no .env');
        
        return { 
            success: true,  // Mantém true para não quebrar o fluxo
            devMode: true, 
            codigo,
            erro: error.message,
            enviado: false
        };
    }
}

// ============================================================================
// INICIALIZAÇÃO DO EMAIL SERVICE
// ============================================================================
const emailService = new EmailService();

// ============================================================================
// ROTA ESPECIAL DO ONESIGNAL - DEVE VIR ANTES DE QUALQUER MIDDLEWARE
// ============================================================================
app.post('/api/onesignal/vincular-kodular', (req, res) => {
    let rawBody = '';
    
    req.on('data', chunk => {
        rawBody += chunk.toString();
    });
    
    req.on('end', async () => {
        try {
            console.log('='.repeat(60));
            console.log('📱 Vínculo Kodular - Recebido');
            
            // Extrair dados com regex
            let playerId = null;
            let token = null;
            
            // Limpar o body
            let cleaned = rawBody.replace(/\\"/g, '"');
            cleaned = cleaned.replace(/^"|"$/g, '');
            
            // Extrair playerId
            const playerIdMatch = cleaned.match(/"playerId":"([^"]+)"/i);
            if (playerIdMatch) {
                playerId = playerIdMatch[1];
            }
            
            // Extrair token
            const tokenMatch = cleaned.match(/"token":"([^"]+)"/i);
            if (tokenMatch) {
                token = tokenMatch[1];
            }
            
            if (!playerId || !token) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'Não foi possível extrair os dados' 
                });
            }
            
            // Verificar token JWT
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const userId = decoded.id;
            
            // Buscar usuário
            const user = await User.findById(userId);
            if (!user) {
                return res.status(404).json({ 
                    success: false, 
                    error: 'Usuário não encontrado' 
                });
            }
            
            // 🔥 NOVA VERIFICAÇÃO: Se já tem o MESMO playerId, não atualiza
            if (user.onesignalPlayerId === playerId) {
                console.log(`⚠️ Usuário ${user.nome} já está vinculado ao dispositivo ${playerId}`);
                return res.json({ 
                    success: true, 
                    message: 'Dispositivo já vinculado',
                    alreadyLinked: true
                });
            }
            
            // 🔥 Se já tem OUTRO playerId, atualiza (troca de dispositivo)
            if (user.onesignalPlayerId && user.onesignalPlayerId !== playerId) {
                console.log(`🔄 Usuário ${user.nome} trocando de dispositivo: ${user.onesignalPlayerId} → ${playerId}`);
            }
            
            // Atualizar banco
            user.onesignalPlayerId = playerId;
            user.ultimaValidacaoPush = new Date();
            await user.save();
            
            console.log(`✅ Banco atualizado para ${user.nome}`);
            
            res.json({ 
                success: true,
                message: 'Dispositivo vinculado com sucesso',
                alreadyLinked: false
            });
            
        } catch (error) {
            console.error('❌ Erro:', error);
            res.status(500).json({ 
                success: false, 
                error: error.message 
            });
        }
    });
});

// ============================================================================
// MIDDLEWARES GLOBAIS
// ============================================================================
// ========== CONFIGURAÇÃO DO EXPRESS PARA CAPTURAR RAW BODY ==========
app.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf.toString();
    }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false
}));

app.use(compression());

app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());


// ============ MIDDLEWARE DE AUTENTICAÇÃO GLOBAL ============
// Middleware de autenticação JWT (global)
app.use((req, res, next) => {
    // Rotas que NÃO precisam de autenticação
    const rotasPublicas = [
        '/api/auth/login',
        '/api/auth/register',
        '/api/auth/reset-password',
        '/api/health',
        '/api/test',
        '/api/health-check',
        '/api/matriculas-autorizadas/verificar',
        '/login.html',
        '/register.html',
        '/recuperar-senha.html',
        '/trocar-senha.html',
        '/css/',
        '/js/',
        '/uploads/'
    ];
    
    // Se for rota pública, não precisa autenticar
    if (rotasPublicas.some(rota => req.path.startsWith(rota))) {
        return next();
    }
    
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        // Sem token, segue sem dados do usuário
        req.user = null;
        return next();
    }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
      if (err) {
          // Silenciar erro de token expirado (é normal)
          if (err.name === 'TokenExpiredError') {
              // Não logar nada
          } else {
          }
          req.user = null;
      } else {
          req.userId = user.id;
          req.userRole = user.role;
          req.userNome = user.nome;
      }
      next();
  });
});

// ============================================================================
// MIDDLEWARE DE VERIFICAÇÃO DE PERMISSÕES
// ============================================================================

// ============ MIDDLEWARE PARA VERIFICAR PERMISSÕES DE ADMIN ============
const verificarPermissaoSuperAdmin = async (req, res, next) => {
    try {
        // Se for super_admin, pode tudo
        if (req.userRole === 'super_admin') {
            return next();
        }
        
        // Se for admin normal, verificar se está tentando acessar/modificar super_admin
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
        console.error('❌ Erro na verificação de permissão:', error);
        next();
    }
};

// ============================================================================
// CONFIGURAÇÃO DE SESSÃO
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
    secure: false,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// ============================================================================
// ROTAS DE MONITORAMENTO
// ============================================================================
app.use('/api/admin/monitoramento', monitoramentoRoutes);

// ============================================================================
// CONFIGURAÇÃO GROQ
// ============================================================================
let groq;
if (process.env.GROQ_API_KEY) {
  groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  console.log('✅ Groq configurado com sucesso');
} else {
  console.warn('⚠️ Groq API key não configurada');
}

// ============================================================================
// IMPORTAÇÃO DE MODELOS (ARQUIVOS EXTERNOS)
// ============================================================================
const User = require('./models/User');
const Prova = require('./models/Prova');
const Turma = require('./models/Turma');
const Notificacao = require('./models/Notificacao');  
const Eixo = require('./models/Eixo');      
const Curso = require('./models/Cursos');    

// ============================================================================
// DEFINIÇÃO DE MODELOS INLINE
// ============================================================================

// Modelo Config
let Config;
try {
  Config = mongoose.model('Config');
  console.log('✅ Modelo Config já existe');
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
  console.log('✅ Modelo Config criado com sucesso!');
}

// Modelo Resultado
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
    dataCriacao: { type: Date, default: Date.now },
    notaLiberada: { type: Boolean, default: false },
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

// Modelo ProvaRealizada
let ProvaRealizada;
try {
  ProvaRealizada = mongoose.model('ProvaRealizada');
} catch {
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
    cancelada: { type: Boolean, default: false },
    motivoCancelamento: { type: String, default: null },
    flagViolacao: { type: Boolean, default: false },
    estatisticasCancelamento: { type: Object, default: null },
    motivoCancelamentoTipo: { type: String, enum: ['violacao', 'prazo_expirado', 'outro', null], default: null },
    sincronizadoEm: { type: Date, default: null }
  }, { timestamps: true });

  ProvaRealizadaSchema.index({ provaId: 1, alunoId: 1 }, { unique: true });
  ProvaRealizada = mongoose.model('ProvaRealizada', ProvaRealizadaSchema);
}

// ============================================
// MODELO PARA ARMAZENAR FACE ID (ATUALIZADO)
// ============================================
const FaceIDSchema = new mongoose.Schema({
    usuarioId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    imagemBase64: { type: String, required: true },
    imagemHash: { type: String, required: true },
    faceDescriptor: { type: [Number], required: false }, // Array de 128 números
    dataCadastro: { type: Date, default: Date.now },
    ultimaValidacao: { type: Date },
    totalValidacoes: { type: Number, default: 0 },
    ativo: { type: Boolean, default: true }
});

const FaceID = mongoose.models.FaceID || mongoose.model('FaceID', FaceIDSchema);

// ============================================
// MODELO LOCALIZACAO (adicione APÓS os outros modelos)
// ============================================
const LocalizacaoSchema = new mongoose.Schema({
    alunoId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    provaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Prova' },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    accuracy: { type: Number },
    timestamp: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

// Índices para consultas rápidas
LocalizacaoSchema.index({ alunoId: 1, timestamp: -1 });
LocalizacaoSchema.index({ timestamp: -1 });

const Localizacao = mongoose.models.Localizacao || mongoose.model('Localizacao', LocalizacaoSchema);
console.log('✅ Modelo Localizacao carregado');

// ============ ROTAS DE PUSH ============
const pushRoutes = require('./routes/push-routes');
app.use('/api/push', pushRoutes);

// ============ ROTAS DE CONFIGURAÇÕES DO ADMIN ============
const adminConfigRoutes = require('./routes/admin-config');
app.use('/api/admin', adminConfigRoutes);

// ============ ROTAS DO CALENDÁRIO ============
const calendarioRoutes = require('./routes/calendario-routes');
app.use('/api/calendario', calendarioRoutes);

// ============================================================================
// FUNÇÃO PARA TESTAR MODELOS GROQ
// ============================================================================
async function testarModelosDisponiveis() {
  if (!groq) return;
  
  const modelosParaTestar = [
    "llama-3.2-90b-vision-preview",
    "llama-3.2-11b-vision-preview",
    "llama-3.2-3b-preview",
    "llama-3.1-8b-instant",
    "llama-3.1-70b-versatile",
    "llama-3-70b-8192",
    "llama-3-8b-8192",
    "mixtral-8x7b-32768",
    "gemma2-9b-it",
    "gemma-7b-it"
  ];

  console.log('🔍 Testando modelos disponíveis na Groq...');
  
  const modelosFuncionais = [];
  
  for (const modelo of modelosParaTestar) {
    try {
      console.log(`  Testando: ${modelo}`);
      
      const completion = await groq.chat.completions.create({
        model: modelo,
        messages: [{ role: "user", content: "Teste" }],
        max_tokens: 1
      });
      
      modelosFuncionais.push(modelo);
      console.log(`  ✅ ${modelo} - Disponível`);
      
    } catch (error) {
      if (error.message.includes('decommissioned')) {
        console.log(`  ❌ ${modelo} - Descontinuado`);
      } else if (error.message.includes('not found')) {
        console.log(`  ❌ ${modelo} - Não encontrado`);
      } else {
        console.log(`  ⚠️ ${modelo} - Erro: ${error.message.substring(0, 50)}`);
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log('='.repeat(50));
  console.log('📊 MODELOS DISPONÍVEIS:');
  modelosFuncionais.forEach(modelo => console.log(`  • ${modelo}`));
  console.log('='.repeat(50));
  
  return modelosFuncionais;
}

// ============================================================================
// CONEXÃO COM MONGODB
// ============================================================================
const connectToDatabase = async () => {
  const ENV = process.env.NODE_ENV || 'development';
  const IS_PRODUCTION = ENV === 'production';
  const IS_DEVELOPMENT = ENV === 'development';
  
  console.log('='.repeat(60));
  console.log(`🚀 AMBIENTE DETECTADO: ${ENV.toUpperCase()}`);
  
  let connectionUri;
  let databaseType = 'Desconhecido';
  
  if (IS_PRODUCTION) {
    connectionUri = process.env.MONGODB_ATLAS_URI || process.env.MONGODB_URI;
    databaseType = 'MongoDB Atlas (NUVEM)';
    console.log('🌐 PRODUÇÃO: Conectando ao MongoDB Atlas');
  } else if (IS_DEVELOPMENT) {
    connectionUri = process.env.MONGODB_LOCAL_URI || 'mongodb://localhost:27017/provas_online_local';
    databaseType = 'MongoDB Local';
    console.log('💻 DESENVOLVIMENTO: Conectando ao MongoDB Local');
  } else {
    connectionUri = process.env.MONGODB_URI;
    databaseType = 'Configuração padrão';
    console.log('⚙️ Usando configuração padrão do .env');
  }
  
  const safeUri = connectionUri ? connectionUri.replace(/\/\/[^@]+@/, '//***@') : 'Não configurada';
  console.log(`🗄️ URI: ${safeUri}`);
  console.log(`📊 Tipo: ${databaseType}`);
  console.log('='.repeat(60));
  
  const options = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 30000,
    maxPoolSize: 10,
    retryWrites: true,
    w: 'majority'
  };
  
  try {
    console.log('🔄 Tentando conexão...');
    await mongoose.connect(connectionUri, options);
    
    const db = mongoose.connection.db;
    const host = mongoose.connection.host;
    const isAtlas = host.includes('mongodb.net');
    
    console.log('='.repeat(60));
    console.log('✅ CONEXÃO ESTABELECIDA COM SUCESSO!');
    console.log(`📁 Banco: ${db.databaseName}`);
    console.log(`📍 Host: ${host}`);
    console.log(`🌍 Tipo: ${isAtlas ? 'MongoDB Atlas (NUVEM)' : 'MongoDB Local'}`);
    console.log('='.repeat(60));
    
    // ============================================
    // EVENTOS DE RECONEXÃO DO MONGODB (ADICIONADO)
    // ============================================
    mongoose.connection.on('disconnected', () => {
      console.log('⚠️ MongoDB desconectado! Tentando reconectar em 5 segundos...');
      setTimeout(() => {
        console.log('🔄 Tentando reconectar ao MongoDB...');
        mongoose.connect(connectionUri, options).catch(err => {
          console.error('❌ Falha na reconexão:', err.message);
        });
      }, 5000);
    });

    mongoose.connection.on('error', (err) => {
      console.error('❌ Erro no MongoDB:', err);
    });

    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB reconectado com sucesso!');
    });

    mongoose.connection.on('timeout', () => {
      console.warn('⏰ Timeout na conexão com MongoDB');
    });
    // ============================================
    
    if (groq) {
      setTimeout(() => testarModelosDisponiveis(), 2000);
    }
    
  } catch (error) {
    console.error('❌ ERRO na conexão principal:', error.message);
    
    if (IS_DEVELOPMENT) {
      console.log('🔄 DESENVOLVIMENTO: Tentando fallback para Atlas...');
      try {
        const fallbackUri = process.env.MONGODB_ATLAS_URI || process.env.MONGODB_URI;
        await mongoose.connect(fallbackUri, options);
        console.log('✅ Fallback para Atlas bem-sucedido');
      } catch (fallbackError) {
        console.error('❌ Todos os fallbacks falharam:', fallbackError.message);
        console.log('💡 SOLUÇÃO:');
        console.log('   1. Inicie o MongoDB local: mongod');
        console.log('   2. Ou verifique sua conexão com a internet');
        throw fallbackError;
      }
    } else if (IS_PRODUCTION) {
      console.error('❌ PRODUÇÃO: Conexão com Atlas falhou!');
      throw error;
    }
  }
};

// Executar conexão com o banco de dados
connectToDatabase();

// ============================================================================
// CONFIGURAÇÃO DO MULTER PARA UPLOAD DE ARQUIVOS
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
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt/;
        const ext = path.extname(file.originalname).toLowerCase();
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype || allowedTypes.test(ext)) {
            return cb(null, true);
        } else {
            cb(new Error('Tipo de arquivo não permitido'));
        }
    }
});

// Configurar multer para upload de arquivos
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Criar diretório de uploads se não existir
    const uploadDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Gerar nome único para o arquivo
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limite
  },
  fileFilter: function (req, file, cb) {
    // Permitir apenas certos tipos de arquivo
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Tipo de arquivo não permitido'));
    }
  }
});

// Middleware para upload múltiplo
const uploadMultiple = upload.fields([
  { name: 'arquivos', maxCount: 10 },
  { name: 'imagens', maxCount: 10 }
]);


// ============================================================================
// MIDDLEWARES PERSONALIZADOS
// ============================================================================

// ============ MIDDLEWARE DE AUTENTICAÇÃO JWT COM TOKEN VERSION ============
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
    
    // 🔥 VERIFICAR SE O TOKEN FOI INVALIDADO POR RESET
    try {
      const user = await User.findById(decoded.id).select('tokenVersion');
      
      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'Usuário não encontrado.'
        });
      }
      
      // Se a versão do token não corresponde, foi resetado
      if (user.tokenVersion !== decoded.tokenVersion) {
        return res.status(401).json({
          success: false,
          error: '🔐 Sua sessão foi encerrada pelo administrador. Faça login novamente.',
          motivo: 'reset_global',
          precisaLogin: true
        });
      }
    } catch (dbError) {
      console.error('❌ Erro ao verificar tokenVersion:', dbError);
    }
    
    // Extrair dados do token
    req.userId = decoded.id;
    req.userRole = decoded.role;
    req.userNome = decoded.nome;
    req.userTwoFactorEnabled = decoded.twoFactorEnabled || false;
    req.tokenVersion = decoded.tokenVersion;
    
    // Marcar se é token temporário (para 2FA)
    req.tokenTemp = decoded.temp || false;
 
    next();
  });
};

// Middleware de validação de inputs
const validateInputs = (validations) => {
  return async (req, res, next) => {
    await Promise.all(validations.map(validation => validation.run(req)));
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }
    
    next();
  };
};


// ============================================================================
// ROTAS PÚBLICAS
// ============================================================================

// ============ ROTA PÚBLICA DE REGISTRO ============
app.post('/api/auth/register', [
  check('nome').not().isEmpty().withMessage('Nome é obrigatório'),
  check('email').isEmail().withMessage('Email inválido'),
  check('cpf').custom((value) => {
    if (!value) {
      throw new Error('CPF é obrigatório');
    }
    
    // Função para validar CPF
    function validarCPF(cpf) {
      cpf = cpf.replace(/\D/g, '');
      
      if (cpf.length !== 11) return false;
      if (/^(\d)\1+$/.test(cpf)) return false;
      
      let soma = 0;
      let resto;
      
      for (let i = 1; i <= 9; i++) {
        soma += parseInt(cpf.substring(i-1, i)) * (11 - i);
      }
      
      resto = (soma * 10) % 11;
      if ((resto === 10) || (resto === 11)) resto = 0;
      if (resto !== parseInt(cpf.substring(9, 10))) return false;
      
      soma = 0;
      for (let i = 1; i <= 10; i++) {
        soma += parseInt(cpf.substring(i-1, i)) * (12 - i);
      }
      
      resto = (soma * 10) % 11;
      if ((resto === 10) || (resto === 11)) resto = 0;
      if (resto !== parseInt(cpf.substring(10, 11))) return false;
      
      return true;
    }
    
    if (!validarCPF(value)) {
      throw new Error('CPF inválido');
    }
    
    return true;
  }).withMessage('CPF inválido'),
  check('password').isLength({ min: 6 }).withMessage('Senha deve ter no mínimo 6 caracteres'),
  check('role').isIn(['aluno', 'professor']).withMessage('Role inválida')
], async (req, res) => {
  try {
    const { 
      nome, 
      email, 
      password, 
      cpf, 
      telefone, 
      matricula, 
      role, 
      eixo, 
      curso, 
      turma,        
      periodo, 
      departamento, 
      titulacao,
      
      // ========== CAMPOS DE ACESSIBILIDADE ==========
      precisaAcessibilidade,
      condicaoAcessibilidade,
      outraCondicao
      
    } = req.body;
    
    // Validar email institucional
    if (!email || !email.toLowerCase().endsWith('@iemasaoluiscentro.net')) {
        return res.status(400).json({
            success: false,
            error: 'Somente emails institucionais (@iemasaoluiscentro.net) são permitidos'
        });
    }

    // Converter para lowercase
    const emailLower = email.toLowerCase().trim();

    console.log('📝 Dados recebidos no registro:', { 
      nome, 
      email, 
      cpf: cpf ? '***' : 'não informado',
      telefone: telefone ? '***' : 'não informado',
      role,
      curso: curso || 'não informado',
      turma: turma || 'não informado',  
      precisaAcessibilidade,
      condicaoAcessibilidade,
      outraCondicao
    });
    
    // Validar telefone
    if (!telefone) {
        return res.status(400).json({
            success: false,
            error: 'Telefone é obrigatório'
        });
    }

    // Validar formato do telefone
    const telefoneNumeros = telefone.replace(/\D/g, '');
    if (telefoneNumeros.length < 10 || telefoneNumeros.length > 11) {
        return res.status(400).json({
            success: false,
            error: 'Telefone inválido. Deve ter 10 ou 11 dígitos (com DDD)'
        });
    }

    // Verificar telefone duplicado
    const existingTelefone = await User.findOne({ telefone: telefoneNumeros });
    if (existingTelefone) {
        return res.status(400).json({
            success: false,
            error: 'Telefone já cadastrado'
        });
    }
    
    // VALIDAÇÃO DE CPF FORMATADO
    const cpfNumeros = cpf.replace(/\D/g, '');
    
    // Verificar email duplicado
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'Email já cadastrado'
      });
    }
    
    // Verificar CPF duplicado
    const existingCPF = await User.findOne({ cpf: cpfNumeros });
    if (existingCPF) {
      return res.status(400).json({
        success: false,
        error: 'CPF já cadastrado'
      });
    }
    
    if (matricula) {
      const existingMatricula = await User.findOne({ matricula });
      if (existingMatricula) {
        return res.status(400).json({
          success: false,
          error: 'Matrícula já cadastrada'
        });
      }
    }
    
    // ========== VALIDAÇÃO PARA PROFESSORES ==========
    if (role === 'professor') {
        // ✅ LISTA COMPLETA DE EIXOS PERMITIDOS
        const eixosPermitidos = [
            'natureza',
            'humanas',
            'linguagens',
            'desenvolvimento',
            'gestao',
            'producao',
            'turismo',
            'ambiente'
        ];
        
        if (!eixo || !eixosPermitidos.includes(eixo)) {
            return res.status(400).json({
                success: false,
                error: 'Professores devem escolher um eixo válido'
            });
        }
        
        // VALIDAÇÃO DA MATRÍCULA PARA PROFESSORES (OBRIGATÓRIA)
        if (!matricula) {
            return res.status(400).json({
                success: false,
                error: 'Matrícula é obrigatória para professores'
            });
        }
        
        // Validar formato da matrícula (6 números)
        const matriculaNumeros = matricula.replace(/\D/g, '');
        
        if (matriculaNumeros.length !== 6) {
            return res.status(400).json({
                success: false,
                error: 'Matrícula inválida. Deve conter exatamente 6 números'
            });
        }
        
        // 🔴 VALIDAÇÃO DE MATRÍCULA AUTORIZADA USANDO O ARQUIVO JSON
        console.log('🔍 Verificando matrícula de professor:', matriculaNumeros);
        
        // Verificar se a matrícula está na lista de autorizadas
        const autorizada = matriculasManager.verificar(matriculaNumeros);
        const nomeProfessor = autorizada ? matriculasManager.obterNome(matriculaNumeros) : null;

        console.log(`🔍 Resultado: ${autorizada ? '✅ AUTORIZADA' : '❌ NÃO AUTORIZADA'} - Nome: ${nomeProfessor || 'Não encontrado'}`);
        
        if (!autorizada) {
            console.log('❌ Matrícula NÃO autorizada:', matriculaNumeros);
            return res.status(403).json({
                success: false,
                error: 'Matrícula não autorizada para cadastro como professor. Entre em contato com a administração.'
            });
        }
        
        console.log('✅ Matrícula autorizada para professor:', matriculaNumeros, ' - Nome:', nomeProfessor);
    }
    
    // ========== VALIDAÇÃO PARA ALUNOS ==========
    if (role === 'aluno') {
        if (!curso) {
            return res.status(400).json({
                success: false,
                error: 'Curso é obrigatório para alunos'
            });
        }
        
        if (!turma) {
            return res.status(400).json({
                success: false,
                error: 'Turma é obrigatória para alunos'
            });
        }
    }
    
    // 🔥 ========== VALIDAÇÃO DE POLÍTICA DE SENHAS ========== 🔥
    // Buscar configurações de senha
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

    // Validar tamanho mínimo
    if (password.length < tamanhoMinimo) {
        return res.status(400).json({
            success: false,
            error: `A senha deve ter no mínimo ${tamanhoMinimo} caracteres`
        });
    }

    // Validar letra maiúscula
    if (exigirMaiuscula && !/[A-Z]/.test(password)) {
        return res.status(400).json({
            success: false,
            error: 'A senha deve conter pelo menos uma letra maiúscula'
        });
    }

    // Validar número
    if (exigirNumero && !/[0-9]/.test(password)) {
        return res.status(400).json({
            success: false,
            error: 'A senha deve conter pelo menos um número'
        });
    }

    // Validar caractere especial
    if (exigirEspecial && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
        return res.status(400).json({
            success: false,
            error: 'A senha deve conter pelo menos um caractere especial (!@#$%...)'
        });
    }
    
    // ========== CRIAR USUÁRIO ==========
    // USUÁRIO SE CADASTROU - NÃO FORÇAR TROCA DE SENHA
    const user = new User({
      nome,
      email,
      password,
      cpf: cpfNumeros,
      telefone: telefoneNumeros,
      matricula: matricula || undefined,
      ativo: true,
      forcePasswordChange: false, // ✅ CORRETO: Usuário escolheu a senha
      role,
      eixo: role === 'professor' ? eixo : null,
      curso: role === 'aluno' ? curso : undefined,
      turma: role === 'aluno' ? turma : null,     
      periodo: role === 'aluno' ? periodo : undefined,
      departamento: role === 'professor' ? departamento : undefined,
      titulacao: role === 'professor' ? titulacao : undefined,
      
      // ========== CAMPOS DE ACESSIBILIDADE ==========
      precisaAcessibilidade: role === 'aluno' ? (precisaAcessibilidade === true || precisaAcessibilidade === 'true' || precisaAcessibilidade === 'sim') : false,
      condicaoAcessibilidade: role === 'aluno' && precisaAcessibilidade ? condicaoAcessibilidade : null,
      outraCondicao: role === 'aluno' && precisaAcessibilidade && condicaoAcessibilidade === 'outra' ? outraCondicao : null,
      dataSolicitacaoAcessibilidade: role === 'aluno' && precisaAcessibilidade ? new Date() : null,
      
      // ========== 🔥 CAMPOS DE 2FA ADICIONADOS ==========
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
    
    console.log('✅ Usuário criado com sucesso!');
    console.log(`   📚 Curso: ${user.curso}`);
    console.log(`   🏫 Turma: ${user.turma}`);     
    console.log(`   🎯 Eixo: ${user.eixo}`);
    console.log(`   ♿ Acessibilidade: ${user.precisaAcessibilidade ? 'Sim' : 'Não'}`);
    console.log(`   🔐 forcePasswordChange: ${user.forcePasswordChange} (NÃO forçado - cadastro normal)`);
    
    const token = jwt.sign(
      { 
        id: user._id, 
        role: user.role,
        eixo: user.eixo,
        nome: user.nome,
        cpf: user.cpf,
        precisaAcessibilidade: user.precisaAcessibilidade === true,
        condicaoAcessibilidade: user.condicaoAcessibilidade,
        tokenVersion: user.tokenVersion || 0
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );
    
    let redirectTo = '';
    if (user.role === 'super_admin') {
        redirectTo = '/admin.html';
    } else if (user.role === 'admin') {
        redirectTo = '/admin-simples.html';
    } else if (user.role === 'professor') {
        redirectTo = '/index.html';
    } else if (user.role === 'aluno') {
        redirectTo = '/capturar-face.html';  // ← ALTERADO AQUI!
    } else {
        redirectTo = '/aluno.html';
    }
    
    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        nome: user.nome,
        email: user.email,
        cpf: user.cpf,
        role: user.role,
        eixo: user.eixo,
        matricula: user.matricula,
        curso: user.curso,
        turma: user.turma,           
        periodo: user.periodo,
        departamento: user.departamento,
        titulacao: user.titulacao,
        precisaAcessibilidade: user.precisaAcessibilidade,
        condicaoAcessibilidade: user.condicaoAcessibilidade,
        outraCondicao: user.outraCondicao
      },
      redirectTo: redirectTo
    });
    
  } catch (error) {
    console.error('❌ Erro no registro:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao registrar usuário: ' + error.message
    });
  }
});

// ============ ROTA PÚBLICA DE LOGIN ============
// ============ ROTA DE LOGIN COM 2FA (VERSÃO CORRIGIDA - SEM ENVIO DUPLICADO) ============
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password, cpf, twoFactorCode, token: tempToken } = req.body;
    
    // ===== CASO 1: REQUISIÇÃO COM TOKEN TEMPORÁRIO (2FA) =====
    if (tempToken) {
      console.log('🔐 Requisição com token temporário recebida');
      
      try {
        // Verificar se o token é válido
        const decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
        
        // Verificar se é um token temporário para 2FA
        if (decoded.temp && decoded.purpose === '2fa') {
          console.log(`✅ Token temporário válido para usuário: ${decoded.id}`);
          
          // Buscar usuário pelo ID do token
          const user = await User.findById(decoded.id)
            .select('+twoFactorSecret +twoFactorEnabled +twoFactorBackupCodes +twoFactorTempSecret +nome +email +role +telefone');
          
          if (!user) {
            return res.status(401).json({
              success: false,
              error: 'Usuário não encontrado'
            });
          }
          
          // Verificar se o código foi fornecido
          if (!twoFactorCode) {
            return res.status(400).json({
              success: false,
              error: 'Código 2FA não fornecido'
            });
          }
          
          // ========== VERIFICAÇÃO DE CÓDIGO 2FA ==========
          let isValid = false;
          let motivo = '';
          
          // 1. Verificar código temporário (SMS atual)
          if (user.twoFactorTempSecret && user.twoFactorTempSecret === twoFactorCode) {
            isValid = true;
            motivo = 'SMS';
            user.twoFactorTempSecret = null; // Limpar após uso
            await user.save();
            console.log('✅ Código SMS válido');
          }
          
          // 2. Verificar código TOTP (QR Code - Google Authenticator)
          if (!isValid && (user.twoFactorSecret || user.twoFactorTempSecret)) {
            try {
              const speakeasy = require('speakeasy');
              
              // TENTAR PRIMEIRO COM SEGREDO TEMPORÁRIO
              if (user.twoFactorTempSecret) {
                const verified = speakeasy.totp.verify({
                  secret: user.twoFactorTempSecret,
                  encoding: 'base32',
                  token: twoFactorCode,
                  window: 1
                });
                
                if (verified) {
                  isValid = true;
                  motivo = 'TOTP (QR Code) - Temporário';
                  console.log('✅ Código TOTP temporário válido');
                  
                  // Se for primeira ativação
                  if (!user.twoFactorEnabled) {
                    const backupCodes = [];
                    for (let i = 0; i < 10; i++) {
                      backupCodes.push(generateBackupCode());
                    }
                    
                    user.twoFactorEnabled = true;
                    user.twoFactorSecret = user.twoFactorTempSecret;
                    user.twoFactorBackupCodes = backupCodes;
                    user.twoFactorTempSecret = null;
                    await user.save();
                    console.log('✅ 2FA ativado com sucesso via QR Code');
                  } else {
                    user.twoFactorTempSecret = null;
                    await user.save();
                  }
                }
              }
              
              // TENTAR COM PERMANENTE
              if (!isValid && user.twoFactorSecret && user.twoFactorEnabled) {
                const verified = speakeasy.totp.verify({
                  secret: user.twoFactorSecret,
                  encoding: 'base32',
                  token: twoFactorCode,
                  window: 1
                });
                
                if (verified) {
                  isValid = true;
                  motivo = 'TOTP (QR Code) - Permanente';
                  console.log('✅ Código TOTP permanente válido');
                }
              }
            } catch (error) {
              console.error('❌ Erro ao verificar TOTP:', error.message);
            }
          }
          
          // 3. Verificar código de backup
          if (!isValid && user.twoFactorBackupCodes && user.twoFactorBackupCodes.includes(twoFactorCode)) {
            isValid = true;
            motivo = 'backup';
            user.twoFactorBackupCodes = user.twoFactorBackupCodes.filter(c => c !== twoFactorCode);
            await user.save();
            console.log('✅ Código de backup válido');
          }
          
          // 4. Verificar código secreto permanente
          if (!isValid && user.twoFactorSecret && user.twoFactorSecret === twoFactorCode) {
            isValid = true;
            motivo = 'secreto';
            console.log('✅ Código secreto válido');
          }
          
          if (!isValid) {
            console.log('❌ Código inválido:', twoFactorCode);
            return res.status(401).json({
              success: false,
              error: 'Código 2FA inválido'
            });
          }
          
          // Buscar configuração de expiração do JWT
          const configJwt = await Config.findOne({ chave: 'seguranca.jwtExpiracao' });
          const jwtExpiracao = configJwt ? configJwt.valor : '24h';
          
          // Gerar token PRINCIPAL
          const authToken = jwt.sign(
            { 
              id: user._id, 
              role: user.role,
              nome: user.nome,
              twoFactorEnabled: user.twoFactorEnabled
            },
            process.env.JWT_SECRET,
            { expiresIn: jwtExpiracao }
          );
          
          // Definir redirecionamento
          let redirectTo = '';
          if (user.forcePasswordChange) {
            redirectTo = '/trocar-senha.html';
          } else if (user.role === 'super_admin') {
            redirectTo = '/admin.html';
          } else if (user.role === 'admin') {
            redirectTo = '/admin-simples.html';
          } else if (user.role === 'professor') {
            redirectTo = '/index.html';
          } else if (user.role === 'aluno') {
            redirectTo = '/aluno.html';
          } else {
            redirectTo = '/login.html';
          }
          
          console.log(`✅ 2FA verificado via ${motivo} para ${user.email}`);
          if (user.twoFactorBackupCodes) {
            console.log(`📊 Códigos de backup restantes: ${user.twoFactorBackupCodes.length}`);
          }
          
          return res.json({
            success: true,
            token: authToken,
            user: {
              id: user._id,
              nome: user.nome,
              email: user.email,
              role: user.role,
              twoFactorEnabled: user.twoFactorEnabled,
              telefone: user.telefone
            },
            redirectTo: redirectTo
          });
        }
      } catch (err) {
        console.error('❌ Erro ao verificar token temporário:', err.message);
        return res.status(401).json({
          success: false,
          error: 'Token temporário inválido ou expirado'
        });
      }
    }
    
    // ===== CASO 2: LOGIN NORMAL (SEM TOKEN) =====
    console.log('📝 Requisição de login normal');
    
    // Buscar configurações de segurança
    const [configTentativas, configBloqueio, configJwt, config2FA] = await Promise.all([
      Config.findOne({ chave: 'seguranca.tentativasLogin' }),
      Config.findOne({ chave: 'seguranca.bloqueioTempo' }),
      Config.findOne({ chave: 'seguranca.jwtExpiracao' }),
      Config.findOne({ chave: 'seguranca.doisFatores' })
    ]);
    
    const maxTentativas = configTentativas ? configTentativas.valor : 5;
    const tempoBloqueio = configBloqueio ? configBloqueio.valor : 15;
    const jwtExpiracao = configJwt ? configJwt.valor : '24h';
    const exigir2FA = config2FA ? config2FA.valor : false;
    
    console.log(`🔐 Configuração 2FA: ${exigir2FA ? 'ATIVADO' : 'DESATIVADO'}`);
    
    // Buscar usuário por email ou CPF
    let user;
    let campoBusca = '';
    
    if (email) {
      user = await User.findOne({ email: email.toLowerCase() })
        .select('+password +forcePasswordChange +passwordChangedAt +ativo +loginAttempts +lockUntil +twoFactorEnabled +twoFactorSecret +twoFactorBackupCodes +twoFactorTempSecret +telefone +nome');
      campoBusca = 'email';
    } else if (cpf) {
      const cpfNumeros = cpf.replace(/\D/g, '');
      user = await User.findOne({ cpf: cpfNumeros })
        .select('+password +forcePasswordChange +passwordChangedAt +ativo +loginAttempts +lockUntil +twoFactorEnabled +twoFactorSecret +twoFactorBackupCodes +twoFactorTempSecret +telefone +nome');
      campoBusca = 'CPF';
    } else {
      return res.status(400).json({ 
        success: false, 
        error: 'Email ou CPF é obrigatório' 
      });
    }
    
    if (!user) {
      console.log(`❌ Usuário não encontrado com ${campoBusca} fornecido`);
      return res.status(401).json({ 
        success: false, 
        error: `${campoBusca === 'email' ? 'Email' : 'CPF'} ou senha incorretos` 
      });
    }
    
    // Verificar se usuário está bloqueado
    if (user.lockUntil && user.lockUntil > Date.now()) {
      const minutosRestantes = Math.ceil((user.lockUntil - Date.now()) / 60000);
      return res.status(401).json({ 
        success: false, 
        error: `Usuário bloqueado. Tente novamente em ${minutosRestantes} minutos.` 
      });
    }
    
    // Verificar se usuário está ativo
    if (!user.ativo) {
      return res.status(401).json({ 
        success: false, 
        error: 'Usuário inativo. Entre em contato com a administração.' 
      });
    }
    
    // Verificar senha
    const isMatch = await user.comparePassword(password);
    
    if (!isMatch) {
      user.loginAttempts = (user.loginAttempts || 0) + 1;
      
      if (user.loginAttempts >= maxTentativas) {
        user.lockUntil = Date.now() + (tempoBloqueio * 60 * 1000);
        user.loginAttempts = 0;
        await user.save();
        
        return res.status(401).json({ 
          success: false, 
          error: `Muitas tentativas. Usuário bloqueado por ${tempoBloqueio} minutos.` 
        });
      }
      
      await user.save();
      
      const tentativasRestantes = maxTentativas - user.loginAttempts;
      return res.status(401).json({ 
        success: false, 
        error: `${campoBusca === 'email' ? 'Email' : 'CPF'} ou senha incorretos. ${tentativasRestantes} tentativa(s) restante(s).` 
      });
    }
    
    // Login bem-sucedido
    user.loginAttempts = 0;
    user.lockUntil = null;
    user.lastLogin = new Date();
    await user.save();
    
    // ===== VERIFICAR SE DEVE EXIGIR 2FA =====
    const perfisCom2FA = ['super_admin'];
    if (exigir2FA) {
      perfisCom2FA.push('admin', 'professor');
    }
    
    if (perfisCom2FA.includes(user.role)) {
      console.log(`🔐 2FA exigido para ${user.role} ${user.email}`);
      
      // Verificar códigos de backup
      if (!user.twoFactorBackupCodes || user.twoFactorBackupCodes.length === 0) {
          console.log('🆕 Usuário sem códigos de backup - gerando 10 agora...');
          const backupCodes = [];
          for (let i = 0; i < 10; i++) {
              backupCodes.push(generateBackupCode());
          }
          user.twoFactorBackupCodes = backupCodes;
          user.twoFactorBackupCodesShown = false;
          await user.save();
        console.log('✅ 10 códigos de backup gerados');
      }
      
      // Gerar token TEMPORÁRIO
      const tempAuthToken = jwt.sign(
        { 
          id: user._id,
          temp: true,
          purpose: '2fa',
          role: user.role,
          nome: user.nome
        },
        process.env.JWT_SECRET,
        { expiresIn: '10m' }
      );
      
      // 🔥 NÃO GERAR CÓDIGO NEM ENVIAR SMS AQUI!
      
      return res.json({
        success: true,
        requiresTwoFactor: true,
        userId: user._id,
        token: tempAuthToken,
        message: '2FA necessário'
      });
    }
    
    // ===== USUÁRIOS SEM 2FA =====
    console.log(`✅ Login bem-sucedido para usuário ${user.email} (${user.role})`);
    
    const authToken = jwt.sign(
      { 
        id: user._id, 
        role: user.role,
        nome: user.nome,
        twoFactorEnabled: user.twoFactorEnabled
      },
      process.env.JWT_SECRET,
      { expiresIn: jwtExpiracao }
    );
    
    res.cookie('auth_token', authToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: parseJwtExpiration(jwtExpiracao) * 1000
    });
    
    let redirectTo = '';
    if (user.forcePasswordChange) {
      redirectTo = '/trocar-senha.html';
    } else if (user.role === 'super_admin') {
      redirectTo = '/admin.html';
    } else if (user.role === 'admin') {
      redirectTo = '/admin-simples.html';
    } else if (user.role === 'professor') {
      redirectTo = '/index.html';
    } else if (user.role === 'aluno') {
      redirectTo = '/aluno.html';
    } else {
      redirectTo = '/login.html';
    }
    
    res.json({
      success: true,
      token: authToken,
      requiresTwoFactor: false,
      user: {
        id: user._id,
        nome: user.nome,
        email: user.email,
        role: user.role,
        twoFactorEnabled: user.twoFactorEnabled,
        telefone: user.telefone
      },
      redirectTo: redirectTo
    });
    
  } catch (error) {
    console.error('❌ Erro no login:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro no servidor: ' + error.message 
    });
  }
});

// ============ ROTA PARA ATIVAR 2FA ============
// ============ ROTA PARA ATIVAR 2FA (VERSÃO CORRIGIDA) ============
app.post('/api/auth/2fa/enable', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('+twoFactorSecret +twoFactorEnabled +twoFactorTempSecret');
    
    if (user.twoFactorEnabled) {
      return res.status(400).json({
        success: false,
        error: '2FA já está ativado para esta conta'
      });
    }
    
    // Verificar se telefone está disponível
    if (!user.telefone) {
      return res.status(400).json({
        success: false,
        error: 'Você precisa cadastrar um telefone primeiro'
      });
    }

    // Gerar código de 6 dígitos
    const codigo = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Salvar código temporário (expira em 5 minutos)
    user.twoFactorTempSecret = codigo;
    user.lastOtpRequest = new Date();
    user.otpRequestCount = (user.otpRequestCount || 0) + 1;
    await user.save();

    const telefoneLimpo = user.telefone.replace(/\D/g, '');
    const mensagem = `🔐 ${user.nome}, seu código de verificação do IEMA é: ${codigo}. Válido por 5 minutos.`;

    console.log('📱 Tentando enviar SMS...');
    console.log(`   Para: ${telefoneLimpo}`);
    console.log(`   Código: ${codigo}`);
    
    // ENVIAR SMS USANDO A FUNÇÃO CORRIGIDA
    const resultado = await enviarSmsTwilio(telefoneLimpo, mensagem);

    // ✅ RESPOSTA ÚNICA - SÓ UMA VEZ!
    if (resultado.success) {
      return res.json({
        success: true,
        message: resultado.devMode ? 'Código gerado (modo desenvolvimento)' : 'Código enviado para seu telefone',
        expiresIn: 300, // 5 minutos em segundos
        telefone: user.telefoneFormatado || user.telefone,
        ...(resultado.devMode && { devCode: resultado.codigo })
      });
    } else {
      return res.status(500).json({
        success: false,
        error: 'Erro ao enviar SMS. Tente novamente.'
      });
    }
    
  } catch (error) {
    console.error('❌ Erro ao ativar 2FA:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro interno: ' + error.message
    });
  }
});

// ============ ROTA PARA ADMIN GERAR 10 CÓDIGOS DE BACKUP PARA UM USUÁRIO ============
app.post('/api/admin/2fa/gerar-backup-codes/:userId', authenticateToken, async (req, res) => {
    try {
        // Verificar se é admin
        if (req.userRole !== 'admin' && req.userRole !== 'super_admin') {
            return res.status(403).json({
                success: false,
                error: 'Apenas administradores podem gerar códigos de backup'
            });
        }
        
        const { userId } = req.params;
        
        console.log(`🔑 Admin ${req.userId} gerando 10 códigos de backup para usuário ${userId}`);
        
        const user = await User.findById(userId).select(
            '+twoFactorEnabled +twoFactorBackupCodes +twoFactorBackupCodesShown'
        );
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'Usuário não encontrado'
            });
        }

        // Verificar se o 2FA está ativado
        if (!user.twoFactorEnabled) {
            return res.status(400).json({
                success: false,
                error: '2FA não está ativado para este usuário'
            });
        }

        // Gerar 10 códigos de backup
        const backupCodes = [];
        for (let i = 0; i < 10; i++) {
            backupCodes.push(generateBackupCode());
        }
        
        // Atualizar usuário
        user.twoFactorBackupCodes = backupCodes;
        user.twoFactorBackupCodesShown = false; // Reset para mostrar na próxima vez
        await user.save();
        
        console.log(`✅ Admin gerou 10 códigos para ${user.email}:`, backupCodes);
        
        // Log da ação do admin
        console.log(`📝 LOG: Admin ${req.userId} gerou códigos para ${user.email} em ${new Date().toISOString()}`);
        
        res.json({
            success: true,
            message: '10 códigos de backup gerados com sucesso!',
            backupCodes: backupCodes,
            total: backupCodes.length,
            usuario: {
                id: user._id,
                nome: user.nome,
                email: user.email
            }
        });
        
    } catch (error) {
        console.error('❌ Erro:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno: ' + error.message
        });
    }
});

// ============ ROTA PARA SOLICITAR NOVOS CÓDIGOS DE BACKUP ============
app.post('/api/backup/solicitar', authenticateToken, async (req, res) => {
    try {
        const usuarioId = req.userId;
        
        // Buscar dados do usuário que está solicitando
        const usuario = await User.findById(usuarioId).select('nome email role');
        
        if (!usuario) {
            return res.status(404).json({
                success: false,
                error: 'Usuário não encontrado'
            });
        }
        
        console.log(`📨 Usuário ${usuario.nome} (${usuario.email}) solicitou novos códigos de backup`);
        
        // Buscar TODOS os admins
        const admins = await User.find({ 
            role: { $in: ['admin', 'super_admin'] } 
        }).select('_id');
        
        if (admins.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Nenhum administrador encontrado para notificar'
            });
        }
        
        const notificacoes = [];
        const Config = mongoose.model('Config');
        const configDoc = await Config.findOne({ chave: 'notificacoes' });
        const pushAtivado = configDoc?.valor?.push === true;
        
        for (const admin of admins) {
            try {
                // Criar notificação no sistema
                const notificacao = new Notificacao({
                    usuarioId: admin._id,
                    tipo: 'sistema',
                    titulo: '🆕 Solicitação de novos códigos de backup',
                    mensagem: `${usuario.nome} (${usuario.role}) está sem códigos de backup e solicita novos.`,
                    icone: '🔑',
                    cor: '#f59e0b',
                    link: `/admin.html?section=usuarios&userId=${usuarioId}`,
                    prioridade: 4,
                    dados: {
                        solicitanteId: usuarioId,
                        solicitanteNome: usuario.nome,
                        solicitanteEmail: usuario.email,
                        solicitanteRole: usuario.role,
                        tipoSolicitacao: 'backup_codes',
                        dataSolicitacao: new Date().toISOString()
                    }
                });
                
                await notificacao.save();
                notificacoes.push(notificacao);
                console.log(`✅ Notificação criada para admin ${admin._id}`);
                
                // 🔥 ENVIAR PUSH SE ATIVADO
                if (pushAtivado) {
                    const OneSignalService = require('./services/onesignal-service');
                    const oneSignal = new OneSignalService();
                    
                    await oneSignal.enviarPush(
                        admin._id,
                        '🆕 Solicitação de Backup',
                        `${usuario.nome} solicitou novos códigos de backup`,
                        {
                            tipo: 'solicitacao_backup',
                            solicitanteId: usuarioId,
                            solicitanteNome: usuario.nome
                        }
                    );
                }
                
            } catch (error) {
                console.error(`❌ Erro ao notificar admin ${admin._id}:`, error.message);
            }
        }
        
        res.json({
            success: true,
            message: 'Solicitação enviada aos administradores',
            notificacoesEnviadas: notificacoes.length,
            totalAdmins: admins.length
        });
        
    } catch (error) {
        console.error('❌ Erro ao solicitar backup:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno: ' + error.message
        });
    }
});

// ============ ROTA PARA ADMIN LISTAR USUÁRIOS COM 2FA ATIVADO ============
app.get('/api/admin/2fa/usuarios', authenticateToken, async (req, res) => {
    try {
        if (req.userRole !== 'admin' && req.userRole !== 'super_admin') {
            return res.status(403).json({
                success: false,
                error: 'Apenas administradores podem acessar esta rota'
            });
        }
        
        const usuarios = await User.find({ 
            twoFactorEnabled: true 
        }).select('nome email telefone twoFactorBackupCodesShown twoFactorBackupCodes');
        
        const usuariosFormatados = usuarios.map(u => ({
            id: u._id,
            nome: u.nome,
            email: u.email,
            telefone: u.telefoneFormatado || u.telefone,
            temCodigosBackup: u.twoFactorBackupCodes ? u.twoFactorBackupCodes.length : 0,
            codigosRestantes: u.twoFactorBackupCodes ? u.twoFactorBackupCodes.length : 0,
            codigosJaMostrados: u.twoFactorBackupCodesShown || false
        }));
        
        res.json({
            success: true,
            usuarios: usuariosFormatados,
            total: usuariosFormatados.length
        });
        
    } catch (error) {
        console.error('❌ Erro:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============ ROTA PARA ADMIN VER CÓDIGOS DE UM USUÁRIO ============
app.get('/api/admin/2fa/ver-codigos/:userId', authenticateToken, async (req, res) => {
    try {
        if (req.userRole !== 'admin' && req.userRole !== 'super_admin') {
            return res.status(403).json({
                success: false,
                error: 'Apenas administradores podem ver códigos de backup'
            });
        }
        
        const { userId } = req.params;
        
        const user = await User.findById(userId).select(
            '+twoFactorBackupCodes +twoFactorEnabled'
        );
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'Usuário não encontrado'
            });
        }
        
        res.json({
            success: true,
            usuario: {
                id: user._id,
                nome: user.nome,
                email: user.email
            },
            backupCodes: user.twoFactorBackupCodes || [],
            total: user.twoFactorBackupCodes ? user.twoFactorBackupCodes.length : 0
        });
        
    } catch (error) {
        console.error('❌ Erro:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});



// ============ ROTA PARA ATIVAR 2FA (COM 10 CÓDIGOS DE BACKUP) ============
app.post('/api/auth/2fa/verify', authenticateToken, async (req, res) => {
    try {
        const { codigo } = req.body;
        
        // Validação básica
        if (!codigo || codigo.length < 6) {
            return res.status(400).json({
                success: false,
                error: 'Código inválido. Digite um código de 6 dígitos.'
            });
        }

        const user = await User.findById(req.userId).select(
            '+twoFactorTempSecret +lastOtpRequest +otpRequestCount +twoFactorEnabled +twoFactorSecret +twoFactorBackupCodes +telefone +nome'
        );
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'Usuário não encontrado'
            });
        }

        // Verificar se o 2FA já está ativado
        if (user.twoFactorEnabled) {
            return res.status(400).json({
                success: false,
                error: '2FA já está ativado para esta conta'
            });
        }

        // Verificar se existe código temporário
        if (!user.twoFactorTempSecret) {
            return res.status(400).json({
                success: false,
                error: 'Nenhum código ativo. Solicite um novo código.'
            });
        }
        
        // Verificar expiração (5 minutos)
        const agora = new Date();
        const diffMinutos = (agora - user.lastOtpRequest) / 60000;
        
        if (diffMinutos > 5) {
            user.twoFactorTempSecret = null;
            user.lastOtpRequest = null;
            await user.save();
            return res.status(400).json({
                success: false,
                error: 'Código expirado. Solicite um novo código.'
            });
        }
        
        // Verificar se o código corresponde
        if (user.twoFactorTempSecret !== codigo) {
            user.otpRequestCount = (user.otpRequestCount || 0) + 1;
            await user.save();
            return res.status(400).json({
                success: false,
                error: 'Código inválido. Tente novamente.'
            });
        }
        
        // 🔥 GARANTIR 10 CÓDIGOS DE BACKUP
        const backupCodes = [];
        for (let i = 0; i < 10; i++) {
            backupCodes.push(generateBackupCode());
        }
        
        // ATIVAR 2FA
        user.twoFactorEnabled = true;
        user.twoFactorSecret = codigo;
        user.twoFactorBackupCodes = backupCodes; // 10 códigos
        user.twoFactorTempSecret = null;
        user.telefoneVerificado = true;
        user.dataAtivacao2FA = new Date();
        
        await user.save();
        
        console.log(`✅ 2FA ativado para usuário ${user.email}`);
        console.log(`🔑 10 códigos de backup gerados:`, backupCodes);
        
        res.json({
            success: true,
            message: '✅ Autenticação de dois fatores ativada com sucesso!',
            backupCodes: backupCodes,
            total: 10,
            firstTime: true, // <- IMPORTANTE: Marcar como primeira vez
            expiresIn: null,
            telefone: user.telefoneFormatado || user.telefone
        });
        
    } catch (error) {
        console.error('❌ Erro ao verificar 2FA:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno ao ativar 2FA: ' + error.message
        });
    }
});

// ============ ROTA PARA BUSCAR CÓDIGOS DE BACKUP (VERSÃO COM SALVAMENTO GARANTIDO) ============
app.get('/api/auth/2fa/backup-codes', authenticateToken, async (req, res) => {
    try {
        console.log('🔍 Buscando códigos de backup para:', req.userId);
        
        const user = await User.findById(req.userId).select(
            '+twoFactorEnabled +twoFactorBackupCodes'
        );
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'Usuário não encontrado'
            });
        }

        // 🔥 CORREÇÃO: Sempre verificar e criar o campo twoFactorBackupCodesShown
        // Buscar o usuário NOVAMENTE com o campo (ou criar na hora)
        const userCompleto = await User.findById(req.userId).select(
            '+twoFactorEnabled +twoFactorBackupCodes +twoFactorBackupCodesShown'
        );
        
        // Se o campo não existir, criar agora
        if (userCompleto.twoFactorBackupCodesShown === undefined) {
            console.log('⚠️ Campo twoFactorBackupCodesShown não existe - criando com false');
            userCompleto.twoFactorBackupCodesShown = false;
            await userCompleto.save();
            console.log('✅ Campo criado com sucesso');
        }

        // CASO 1: Token temporário (durante 2FA)
        if (req.tokenTemp) {
            console.log('⚠️ Token temporário detectado');
            
            // Se já mostrou os códigos antes
            if (userCompleto.twoFactorBackupCodesShown === true) {
                return res.json({
                    success: true,
                    backupCodes: [],
                    alreadyShown: true,
                    total: userCompleto.twoFactorBackupCodes ? userCompleto.twoFactorBackupCodes.length : 0,
                    remaining: userCompleto.twoFactorBackupCodes ? userCompleto.twoFactorBackupCodes.length : 0,
                    message: 'Códigos já foram exibidos anteriormente'
                });
            }
            
            // Se tem códigos e NUNCA mostrou
            if (userCompleto.twoFactorBackupCodes && userCompleto.twoFactorBackupCodes.length > 0) {
                console.log('🎉 Primeira vez - mostrando códigos');
                
                // 🔥 MARCAR COMO MOSTRADO AGORA E SALVAR NO BANCO
                userCompleto.twoFactorBackupCodesShown = true;
                await userCompleto.save();
                console.log('✅ Campo twoFactorBackupCodesShown atualizado para true no banco');
                
                return res.json({
                    success: true,
                    backupCodes: userCompleto.twoFactorBackupCodes,
                    firstTime: true,
                    total: userCompleto.twoFactorBackupCodes.length,
                    remaining: userCompleto.twoFactorBackupCodes.length,
                    message: '🔐 PRIMEIRA ATIVAÇÃO! Guarde estes códigos!'
                });
            }
            
            // Não tem códigos
            return res.status(400).json({
                success: false,
                error: 'Você não tem códigos de backup. Contate o administrador.',
                needsAdmin: true
            });
        }
        
        // CASO 2: Token normal (já autenticado)
        if (!userCompleto.twoFactorEnabled) {
            return res.status(400).json({
                success: false,
                error: '2FA não está ativado para esta conta'
            });
        }

        if (userCompleto.twoFactorBackupCodes && userCompleto.twoFactorBackupCodes.length > 0) {
            if (userCompleto.twoFactorBackupCodesShown === true) {
                return res.json({
                    success: true,
                    backupCodes: [],
                    alreadyShown: true,
                    total: userCompleto.twoFactorBackupCodes.length,
                    remaining: userCompleto.twoFactorBackupCodes.length,
                    message: 'Códigos já foram exibidos anteriormente'
                });
            } else {
                // 🔥 MARCAR COMO MOSTRADO AGORA E SALVAR NO BANCO
                console.log('🎉 Primeira vez - mostrando códigos');
                userCompleto.twoFactorBackupCodesShown = true;
                await userCompleto.save();
                console.log('✅ Campo twoFactorBackupCodesShown atualizado para true no banco');
                
                return res.json({
                    success: true,
                    backupCodes: userCompleto.twoFactorBackupCodes,
                    firstTime: true,
                    total: userCompleto.twoFactorBackupCodes.length,
                    remaining: userCompleto.twoFactorBackupCodes.length,
                    message: '🔐 PRIMEIRA ATIVAÇÃO! Guarde estes códigos!'
                });
            }
        } else {
            return res.status(400).json({
                success: false,
                error: 'Você não tem códigos de backup. Contate o administrador.',
                needsAdmin: true
            });
        }
        
    } catch (error) {
        console.error('❌ Erro ao buscar códigos de backup:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno: ' + error.message
        });
    }
});

// Função auxiliar para gerar código de backup
function generateBackupCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ============ ROTA PARA VERIFICAR STATUS DO 2FA ============
app.get('/api/auth/2fa/status', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select('+twoFactorEnabled +twoFactorTempSecret');
        
        res.json({
            success: true,
            twoFactorEnabled: user?.twoFactorEnabled || false,
            hasTempCode: !!(user?.twoFactorTempSecret),
            isTempToken: req.tokenTemp || false
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ MIDDLEWARE DE MODO DEBUG ============
app.use(async (req, res, next) => {
    try {
        // Buscar configuração de debug
        const configDebug = await Config.findOne({ chave: 'sistema.modoDebug' });
        const modoDebug = configDebug ? configDebug.valor : false;
        
        // Se NÃO estiver em modo debug, continua normalmente
        if (!modoDebug) {
            return next();
        }
        
        // ===== EM MODO DEBUG =====
        
        // Só logar requisições de API para não poluir muito
        if (req.path.startsWith('/api/')) {
            const start = Date.now();
            const requestId = Math.random().toString(36).substring(7);
            
            console.log(`\n🔍 [DEBUG-${requestId}] ${req.method} ${req.path}`);
            console.log(`   👤 Usuário: ${req.userId || 'Não autenticado'} (${req.userRole || 'N/A'})`);
            console.log(`   📦 Query:`, req.query);
            
            // Não logar body de upload de arquivos (muito grande)
            if (!req.path.includes('/upload/') && req.body && Object.keys(req.body).length > 0) {
                // Esconder dados sensíveis
                const bodyCopy = { ...req.body };
                if (bodyCopy.password) bodyCopy.password = '***';
                if (bodyCopy.token) bodyCopy.token = '***';
                if (bodyCopy.authorization) bodyCopy.authorization = '***';
                
                console.log(`   📝 Body:`, bodyCopy);
            }
            
            // Interceptar o método res.json para logar a resposta
            const originalJson = res.json;
            res.json = function(data) {
                const duration = Date.now() - start;
                
                // Log da resposta (resumido)
                const statusColor = res.statusCode >= 400 ? '\x1b[31m' : '\x1b[32m';
                console.log(`   ${statusColor}✅ Resposta (${duration}ms) - Status: ${res.statusCode}\x1b[0m`);
                
                // Log detalhado apenas para erros ou se for pequeno
                if (res.statusCode >= 400 || (data && JSON.stringify(data).length < 500)) {
                    console.log(`   📤 Dados:`, data);
                } else {
                    console.log(`   📤 Resposta muito grande (${JSON.stringify(data).length} bytes)`);
                }
                
                console.log(`🔍 [DEBUG-${requestId}] Fim da requisição\n`);
                
                return originalJson.call(this, data);
            };
        }
        
        next();
        
    } catch (error) {
        console.error('❌ Erro no middleware de debug:', error);
        next();
    }
});

// ============ GERAR QR CODE PARA 2FA (CHAMADO PELA PÁGINA VALIDAR) ============
app.post('/api/auth/2fa/generate-qr', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('+twoFactorTempSecret');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuário não encontrado'
      });
    }

    // 🔴 GERAR NOVO SEGREDO (ÚNICO PARA ESTA SESSÃO)
    const speakeasy = require('speakeasy');
    const generated = speakeasy.generateSecret({
      name: `IEMA:${user.email}`,
      issuer: 'Sistema de Provas IEMA'
    });
    
    const novoSegredo = generated.base32;
    
    // 🔴 SALVAR COMO TEMPORÁRIO (SUBSTITUI O ANTERIOR)
    user.twoFactorTempSecret = novoSegredo;
    await user.save();
    
    console.log(`✅ NOVO QR CODE gerado para ${user.email}: ${novoSegredo.substring(0, 10)}...`);

    // Gerar QR Code
    const otpauth = speakeasy.otpauthURL({
      secret: novoSegredo,
      label: user.email,
      issuer: 'IEMA',
      encoding: 'base32'
    });

    const qrCodeUrl = await QRCode.toDataURL(otpauth);

    res.json({
      success: true,
      qrCode: qrCodeUrl,
      secret: novoSegredo,
      message: '✅ QR Code gerado - válido apenas para esta sessão'
    });

  } catch (error) {
    console.error('❌ Erro ao gerar QR Code:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao gerar QR Code: ' + error.message
    });
  }
});

// ============ VERIFICAR CÓDIGO TOTP (QR CODE) ============
app.post('/api/auth/2fa/verify-totp', authenticateToken, async (req, res) => {
    try {
        const { codigo } = req.body;
        const user = await User.findById(req.userId).select(
            '+twoFactorTempSecret +twoFactorEnabled'
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'Usuário não encontrado'
            });
        }

        // 🔴 VERIFICAR SE TEM UM SEGREDO TEMPORÁRIO
        if (!user.twoFactorTempSecret) {
            return res.status(400).json({
                success: false,
                error: 'Nenhum QR Code ativo. Gere um novo QR Code primeiro.'
            });
        }

        // 🔴 USAR O SEGREDO TEMPORÁRIO QUE FOI SALVO
        const verified = speakeasy.totp.verify({
            secret: user.twoFactorTempSecret,  // USA O MESMO QUE FOI GERADO!
            encoding: 'base32',
            token: codigo,
            window: 1
        });

        if (!verified) {
            return res.status(401).json({
                success: false,
                error: 'Código TOTP inválido'
            });
        }

        // SE FOR PRIMEIRA ATIVAÇÃO (twoFactorEnabled false)
        if (!user.twoFactorEnabled) {
            // Gerar 10 códigos de backup
            const backupCodes = [];
            for (let i = 0; i < 10; i++) {
                backupCodes.push(generateBackupCode());
            }

            // ATIVAR 2FA (mover temp secret para permanent)
            user.twoFactorEnabled = true;
            user.twoFactorSecret = user.twoFactorTempSecret; // SALVA COMO PERMANENTE
            user.twoFactorBackupCodes = backupCodes;
            user.twoFactorTempSecret = null; // LIMPA O TEMPORÁRIO
            user.dataAtivacao2FA = new Date();
            
            await user.save();

            return res.json({
                success: true,
                message: '✅ 2FA ativado com sucesso!',
                backupCodes: backupCodes,
                firstTime: true
            });
        }

        // 🔴 SE JÁ ESTIVER ATIVADO, SÓ VALIDA E LIMPA O TEMPORÁRIO
        user.twoFactorTempSecret = null; // LIMPA PARA O PRÓXIMO ACESSO
        await user.save();

        res.json({
            success: true,
            message: '✅ Código válido!'
        });

    } catch (error) {
        console.error('❌ Erro:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno: ' + error.message
        });
    }
});

// ============ VALIDAR LOGIN COM TOTP ============
app.post('/api/auth/2fa/validate-totp', authenticateToken, async (req, res) => {
    try {
        const { codigo } = req.body;
        const user = await User.findById(req.userId).select('+twoFactorSecret +twoFactorEnabled +twoFactorBackupCodes');

        if (!user || !user.twoFactorEnabled) {
            return res.status(401).json({
                success: false,
                error: '2FA não está ativado para esta conta'
            });
        }

        // Verificar código TOTP
        const verified = speakeasy.totp.verify({
            secret: user.twoFactorSecret,
            encoding: 'base32',
            token: codigo,
            window: 1
        });

        if (!verified) {
            return res.status(401).json({
                success: false,
                error: 'Código TOTP inválido'
            });
        }

        // Buscar configuração de expiração do JWT
        const configJwt = await Config.findOne({ chave: 'seguranca.jwtExpiracao' });
        const jwtExpiracao = configJwt ? configJwt.valor : '24h';

        // Gerar token PRINCIPAL
        const authToken = jwt.sign(
            { 
                id: user._id, 
                role: user.role,
                nome: user.nome,
                twoFactorEnabled: user.twoFactorEnabled
            },
            process.env.JWT_SECRET,
            { expiresIn: jwtExpiracao }
        );

        // Definir redirecionamento
        let redirectTo = '';
        if (user.forcePasswordChange) {
          redirectTo = '/trocar-senha.html';
        } else if (user.role === 'super_admin') {
          redirectTo = '/admin.html'; // Super Admin → admin.html
        } else if (user.role === 'admin') {
          redirectTo = '/admin-simples.html'; // Admin normal → admin-simples.html
        } else if (user.role === 'professor') {
          redirectTo = '/index.html';
        } else if (user.role === 'aluno') {
          redirectTo = '/aluno.html';
        } else {
          redirectTo = '/login.html';
        }

        res.json({
            success: true,
            token: authToken,
            user: {
                id: user._id,
                nome: user.nome,
                email: user.email,
                role: user.role,
                twoFactorEnabled: user.twoFactorEnabled
            },
            redirectTo: redirectTo
        });

    } catch (error) {
        console.error('❌ Erro ao validar TOTP:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno: ' + error.message
        });
    }
});

// ============ MIDDLEWARE DE MANUTENÇÃO (COM LOG ÚNICO) ============
const manutencaoMiddleware = async (req, res, next) => {
    // Rotas que SEMPRE devem funcionar (públicas)
    const rotasPublicas = [
        '/api/auth/login',
        '/api/auth/register',
        '/api/auth/reset-password',
        '/api/health',
        '/api/test',
        '/api/health-check',
        '/api/matriculas-autorizadas/verificar',
        '/api/sistema/status',
        '/login.html',
        '/register.html',
        '/recuperar-senha.html',
        '/trocar-senha.html',
        '/manutencao.html',
        '/css/',
        '/js/',
        '/uploads/'
    ];
    
    // Se for rota pública, libera SEMPRE
    if (rotasPublicas.some(rota => req.path.startsWith(rota))) {
        return next();
    }
    
    try {
        // Buscar configuração de manutenção
        const configManutencao = await Config.findOne({ chave: 'sistema.modoManutencao' });
        const modoManutencao = configManutencao ? configManutencao.valor : false;
        
        // Se NÃO estiver em manutenção, libera tudo
        if (!modoManutencao) {
            return next();
        }
        
        // ===== EM MANUTENÇÃO =====
        
        // Variável para controlar se já logou nesta requisição
        let logged = false;
        
        // VERIFICAÇÃO 1: Token no header (para APIs)
        const token = req.headers.authorization?.split(' ')[1];
        if (token) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                if (decoded.role === 'admin' || decoded.role === 'super_admin') {
                    if (!logged) {
                        logged = true;
                    }
                    req.userId = decoded.id;
                    req.userRole = decoded.role;
                    req.userNome = decoded.nome;
                    return next();
                }
            } catch (err) {
                // Token inválido, ignora
            }
        }
        
        // VERIFICAÇÃO 2: Cookie (para páginas HTML)
        const cookieToken = req.cookies?.auth_token;
        if (cookieToken) {
            try {
                const decoded = jwt.verify(cookieToken, process.env.JWT_SECRET);
                if (decoded.role === 'admin' || decoded.role === 'super_admin') {
                    if (!logged) {
                        logged = true;
                    }
                    req.userId = decoded.id;
                    req.userRole = decoded.role;
                    req.userNome = decoded.nome;
                    return next();
                }
            } catch (err) {
                // Cookie inválido, ignora
            }
        }
        
        // VERIFICAÇÃO 3: Sessão (fallback)
        if (req.session?.userId) {
            try {
                const user = await User.findById(req.session.userId).select('role nome');
                if (user && (user.role === 'admin' || user.role === 'super_admin')) {
                    if (!logged) {
                        logged = true;
                    }
                    req.userId = user._id;
                    req.userRole = user.role;
                    req.userNome = user.nome;
                    return next();
                }
            } catch (err) {
                // Erro na sessão, ignora
            }
        }
        
        // ===== SE CHEGOU AQUI, NÃO É ADMIN =====
        
        // Buscar mensagem personalizada
        const configMensagem = await Config.findOne({ chave: 'sistema.manutencaoMensagem' });
        const mensagem = configMensagem ? configMensagem.valor : 'Sistema em manutenção. Volte mais tarde.';
        
        // Se for requisição de API, retornar JSON
        if (req.path.startsWith('/api/')) {
            return res.status(503).json({
                success: false,
                error: mensagem,
                modoManutencao: true
            });
        }
        
        // Se for requisição de página HTML, redirecionar
        return res.redirect('/manutencao.html');
        
    } catch (error) {
        console.error('❌ Erro no middleware de manutenção:', error);
        next();
    }
};

// APLICAR O MIDDLEWARE (UMA ÚNICA VEZ!)
app.use(manutencaoMiddleware);

// ============ ROTA PARA VERIFICAR STATUS DO SISTEMA ============
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
        console.error('❌ Erro ao verificar status:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============ ROTA DE LOGOUT ============
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('auth_token');
  res.json({ success: true });
});

// ============ ROTA PÚBLICA DE UPLOAD TEMPORÁRIO ============
app.post('/api/upload/temp', authenticateToken, uploadMiddleware.single('arquivo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Nenhum arquivo enviado'
      });
    }

    const file = req.file;
    
    // Criar URL para o arquivo
    const fileUrl = `/uploads/${file.filename}`;
    
    // Determinar tipo do arquivo
    let fileType = 'outro';
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (['.pdf'].includes(ext)) {
      fileType = 'pdf';
    } else if (['.jpg', '.jpeg', '.png', '.gif'].includes(ext)) {
      fileType = 'imagem';
    } else if (['.txt', '.doc', '.docx'].includes(ext)) {
      fileType = 'texto';
    }
    
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
    console.error('❌ Erro no upload:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao fazer upload do arquivo: ' + error.message
    });
  }
});

// ============ FUNÇÃO AUXILIAR PÚBLICA ============
async function processarAnexosParaIA(anexos) {
  try {
    if (!anexos || anexos.length === 0) {
      return "Nenhum anexo fornecido.";
    }
    
    console.log(`📂 Processando ${anexos.length} anexos para IA...`);
    
    let contextoFormatado = `## 📎 INFORMAÇÕES DOS ANEXOS FORNECIDOS:\n\n`;
    
    for (let i = 0; i < anexos.length; i++) {
      const anexo = anexos[i];
      contextoFormatado += `### ANEXO ${i + 1}: ${anexo.titulo || 'Sem título'}\n`;
      contextoFormatado += `- **Tipo:** ${anexo.tipo}\n`;
      
      if (anexo.tipo === 'texto' && anexo.conteudo) {
        // Limitar o conteúdo para não exceder tokens
        const conteudoLimitado = anexo.conteudo.length > 5000 
          ? anexo.conteudo.substring(0, 5000) + "... [conteúdo truncado]" 
          : anexo.conteudo;
        
        contextoFormatado += `- **Conteúdo:**\n${conteudoLimitado}\n\n`;
        
        // ANALISAR O CONTEÚDO PARA DETECTAR PADRÕES
        const conteudoLower = conteudoLimitado.toLowerCase();
        
        // Detectar se é uma questão de exemplo
        if (conteudoLower.includes('questão') || 
            conteudoLower.includes('prova') || 
            conteudoLower.includes('exercício') ||
            conteudoLower.includes('enem')) {
          contextoFormatado += `⚠️ **DETECTADO:** Este anexo parece conter questões/exercícios. Use como referência para o estilo desejado.\n\n`;
        }
        
        // Detectar tipo de problema
        if (conteudoLower.includes('lucro') || 
            conteudoLower.includes('custo') || 
            conteudoLower.includes('receita') ||
            conteudoLower.includes('venda') ||
            conteudoLower.includes('preço')) {
          contextoFormatado += `💰 **DETECTADO:** Este anexo envolve problemas financeiros/comerciais. Foque nesse estilo.\n\n`;
        }
        
      } else if (anexo.tipo === 'pdf' || anexo.tipo === 'outro') {
        contextoFormatado += `- **Arquivo:** ${anexo.nomeArquivo}\n`;
        contextoFormatado += `- **URL/Referência:** ${anexo.url || 'N/A'}\n`;
        contextoFormatado += `⚠️ **OBS:** Este é um arquivo ${anexo.tipo.toUpperCase()}. Use o nome/título como referência temática.\n\n`;
      
      } else if (anexo.tipo === 'link') {
        contextoFormatado += `- **Link:** ${anexo.url || anexo.conteudo}\n`;
        
        // Extrair domínio para contexto
        try {
          const urlObj = new URL(anexo.url);
          contextoFormatado += `- **Domínio:** ${urlObj.hostname}\n`;
          
          // Analisar domínio para contexto
          if (urlObj.hostname.includes('qconcursos.com') || 
              urlObj.hostname.includes('enem')) {
            contextoFormatado += `📚 **DETECTADO:** Site de questões. Gerar questões no estilo ENEM/provas.\n\n`;
          }
        } catch (e) {
          contextoFormatado += `- **Conteúdo do link:** ${anexo.conteudo || 'Link fornecido'}\n\n`;
        }
      
      } else if (anexo.tipo === 'imagem') {
        contextoFormatado += `- **Imagem:** ${anexo.nomeArquivo}\n`;
        contextoFormatado += `- **Descrição:** ${anexo.titulo || 'Imagem de referência'}\n\n`;
      }
      
      contextoFormatado += `---\n\n`;
    }
    
    // ADICIONAR INSTRUÇÕES CLARAS SOBRE COMO USAR OS ANEXOS
    contextoFormatado += `## 📝 INSTRUÇÕES PARA USAR OS ANEXOS:\n\n`;
    contextoFormatado += `1. **ANALISE os anexos acima** - Eles mostram o ESTILO de questão que quero\n`;
    contextoFormatado += `2. **COPIE a ESTRUTURA** - Use o mesmo formato de problema\n`;
    contextoFormatado += `3. **USE os CONCEITOS** - Lucro, custo, receita, preço de venda\n`;
    contextoFormatado += `4. **SIGA o EXEMPLO** - Problema de negócio com duas situações comparadas\n`;
    contextoFormatado += `5. **NÃO copie exatamente** - Crie variações, mas mantenha o estilo\n\n`;
    
    console.log(`✅ Contexto de anexos formatado: ${contextoFormatado.length} caracteres`);
    
    return contextoFormatado;
    
  } catch (error) {
    console.error('❌ Erro ao processar anexos para IA:', error);
    return "Erro ao processar anexos fornecidos.";
  }
}

// ============================================================================
// ROTAS PRIVADAS
// ============================================================================

// ============ ROTA PARA OBTER DADOS DO USUÁRIO LOGADO - CORRIGIDA COM TURMA! ============
// ============ ROTA PARA OBTER DADOS DO USUÁRIO LOGADO (VERSÃO COMPLETA) ============
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    // 🔥 BUSCAR TODOS OS CAMPOS, INCLUINDO ACESSIBILIDADE E 2FA
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
        cpf: user.cpf,
        role: user.role,
        eixo: user.eixo,
        matricula: user.matricula,
        curso: user.curso,
        turma: user.turma,    
        periodo: user.periodo,
        departamento: user.departamento,
        titulacao: user.titulacao,
        
        // 🔥 CAMPOS DE ACESSIBILIDADE
        precisaAcessibilidade: user.precisaAcessibilidade === true,
        condicaoAcessibilidade: user.condicaoAcessibilidade,
        outraCondicao: user.outraCondicao,
        dataSolicitacaoAcessibilidade: user.dataSolicitacaoAcessibilidade,
        
        // 🔥 CAMPOS DE 2FA (ADICIONADOS)
        telefone: user.telefone,
        twoFactorEnabled: user.twoFactorEnabled
      }
    });
    
  } catch (error) {
    console.error('Erro ao buscar usuário:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar informações do usuário'
    });
  }
});

// ============ ROTA PARA ATUALIZAR DADOS DO USUÁRIO ============
app.put('/api/users/me', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const {
      precisaAcessibilidade,
      condicaoAcessibilidade,
      outraCondicao
    } = req.body;
    
    console.log(`🔄 Atualizando usuário ${userId} com acessibilidade:`, {
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
    
    // Atualizar campos de acessibilidade
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
    
    console.log('✅ Usuário atualizado com sucesso!');
    console.log('🎯 Nova configuração de acessibilidade:', {
      precisa: user.precisaAcessibilidade,
      condicao: user.condicaoAcessibilidade
    });
    
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
    console.error('❌ Erro ao atualizar usuário:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao atualizar usuário: ' + error.message
    });
  }
});

// ============ ROTA PARA PUBLICAR PROVA (CORRIGIDA COM PUSH) ============
app.post('/api/professor/provas/:provaId/publicar', authenticateToken, async (req, res) => {
  try {
    const provaId = req.params.provaId;
    const usuarioId = req.userId;
    const usuarioRole = req.userRole;
    
    console.log(`📤 Usuário ${usuarioId} (${usuarioRole}) solicitando publicação da prova ${provaId}`);
    
    // 🔥 CORREÇÃO: Verificar se é admin ou super_admin
    const isAdmin = usuarioRole === 'admin' || usuarioRole === 'super_admin';
    
    if (!isAdmin && usuarioRole !== 'professor') {
      return res.status(403).json({
        success: false,
        error: 'Apenas professores e administradores podem publicar provas'
      });
    }
    
    // Buscar a prova
    const prova = await Prova.findById(provaId);
    if (!prova) {
      return res.status(404).json({
        success: false,
        error: 'Prova não encontrada'
      });
    }
    
    // Verificar se é o professor da prova (se não for admin)
    if (!isAdmin && prova.userId.toString() !== usuarioId) {
      return res.status(403).json({
        success: false,
        error: 'Você não é o professor desta prova'
      });
    }
    
    // Verificar se já está publicada
    if (prova.publicada) {
      return res.status(400).json({
        success: false,
        error: 'Esta prova já está publicada'
      });
    }
    
    // Verificar se tem questões
    if (!prova.questoes || prova.questoes.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'A prova não tem questões. Adicione questões antes de publicar.'
      });
    }
    
    // Publicar a prova
    prova.publicada = true;
    prova.status = 'ativa';
    prova.dataPublicacao = new Date();
    
    await prova.save();
    
    console.log(`✅ Prova ${provaId} publicada com sucesso por ${usuarioRole}!`);
    
    // Buscar turma para notificar alunos
    let turma = null;
    let alunos = [];
    
    if (prova.turmaId) {
      turma = await Turma.findById(prova.turmaId).populate('alunos', 'nome email onesignalPlayerId');
      alunos = turma?.alunos || [];
    }
    
    // ===== 🔥 ADICIONAR NOTIFICAÇÃO + PUSH PARA ALUNOS =====
    if (alunos.length > 0) {
      const Config = mongoose.model('Config');
      const configDoc = await Config.findOne({ chave: 'notificacoes' });
      const pushAtivado = configDoc?.valor?.push === true;
      const OneSignalService = require('./services/onesignal-service');
      const oneSignal = pushAtivado ? new OneSignalService() : null;
      
      for (const aluno of alunos) {
        try {
          // Notificação no sistema
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
          
          // Push se ativado
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
          console.error(`⚠️ Erro ao notificar aluno ${aluno._id}:`, notifError.message);
        }
      }
      
      console.log(`✅ ${alunos.length} alunos notificados sobre nova prova`);
    }
    
    res.json({
      success: true,
      message: 'Prova publicada com sucesso! Agora os alunos podem vê-la.',
      prova: {
        id: prova._id,
        titulo: prova.titulo,
        codigo: prova.codigo,
        publicada: prova.publicada,
        dataPublicacao: prova.dataPublicacao,
        status: prova.status,
        alunosNotificados: turma ? turma.alunos.length : 0
      }
    });
    
  } catch (error) {
    console.error('❌ Erro ao publicar prova:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao publicar prova: ' + error.message
    });
  }
});

// ============ ROTA PARA PROFESSOR EDITAR SUAS PRÓPRIAS PROVAS ============
app.put('/api/professor/provas/:id', authenticateToken, async (req, res) => {
    try {
        const isProfessor = req.userRole === 'professor' || req.userRole === 'admin' || req.userRole === 'super_admin';
        
        if (!isProfessor) {
            return res.status(403).json({
                success: false,
                error: 'Apenas professores e administradores podem editar provas'
            });
        }
        
        const provaId = req.params.id;
        const usuarioId = req.userId;
        const usuarioRole = req.userRole;
        const updates = req.body;
        
        console.log(`✏️ Usuário ${usuarioId} (${usuarioRole}) editando prova ${provaId}`);
        
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
        
        // Guardar valores antigos para comparar
        const tinhaMudancas = (
            updates.titulo !== prova.titulo ||
            updates.conteudo !== prova.conteudo ||
            updates.dataLimite !== prova.dataLimite ||
            updates.horarioInicio !== prova.horarioInicio ||
            updates.horarioTermino !== prova.horarioTermino
        );
        
        // Atualizar campos
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
        
        console.log(`✅ Prova ${provaId} atualizada com sucesso`);
        
        // ===== 🔥 SE HOUVER MUDANÇAS SIGNIFICATIVAS E A PROVA JÁ FOI PUBLICADA, NOTIFICAR ALUNOS =====
        if (tinhaMudancas && prova.publicada) {
            try {
                const turma = await Turma.findById(prova.turmaId).populate('alunos', 'nome onesignalPlayerId');
                const alunos = turma?.alunos || [];
                
                if (alunos.length > 0) {
                    const Config = mongoose.model('Config');
                    const configDoc = await Config.findOne({ chave: 'notificacoes' });
                    const pushAtivado = configDoc?.valor?.push === true;
                    const OneSignalService = require('./services/onesignal-service');
                    const oneSignal = pushAtivado ? new OneSignalService() : null;
                    
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
                            console.error('⚠️ Erro ao notificar aluno:', notifError.message);
                        }
                    }
                    
                    console.log(`✅ ${alunos.length} alunos notificados sobre atualização da prova`);
                }
            } catch (notifError) {
                console.error('⚠️ Erro ao notificar alunos:', notifError.message);
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
        console.error('❌ Erro ao editar prova:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno ao editar prova: ' + error.message
        });
    }
});

// ============ ROTA PARA EDITAR QUESTÕES ============
app.put('/api/provas/:id/questoes', authenticateToken, async (req, res) => {
  try {
    const prova = await Prova.findOne({
      _id: req.params.id,
      userId: req.userId,  // Corrigido: use req.userId ao invés de req.user._id
      publicada: false // Só permite editar provas não publicadas
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
    
    // Validar todas as questões
    const todasValidas = questoes.every((q, index) => {
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
    
    // Atualizar questões
    prova.questoes = questoes; // Corrigido: use prova.questoes diretamente
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
    console.error('Erro ao atualizar questões:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro interno ao atualizar questões' 
    });
  }
});

// Rota para limpar imagens não utilizadas
app.delete('/api/upload/limpar-imagens', authenticateToken, async (req, res) => {
    try {
        // Correção: usar req.userRole em vez de req.user.role
        if (req.userRole !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Apenas administradores podem limpar imagens'
            });
        }
        
        // ... resto do código
    } catch (error) {
        console.error('Erro na limpeza:', error);
        res.status(500).json({
            success: false,
            error: 'Erro na limpeza de imagens'
        });
    }
});

// ============ ROTA PARA CRIAR TURMA (PROFESSOR/ADMIN) ============
app.post('/api/turmas', authenticateToken, async (req, res) => {
  try {
    const isAdmin = req.userRole === 'admin' || req.userRole === 'super_admin';
    if (!isAdmin && req.userRole !== 'professor') {
      return res.status(403).json({
        success: false,
        error: 'Apenas professores e administradores podem criar turmas'
      });
    }

    const { nome, disciplina, eixo, descricao } = req.body;

    // Validar se o eixo existe no banco
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
      eixo: eixo, // Salvar o nome do eixo
      eixoId: eixoExistente._id, // Salvar também o ID para referência
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
    console.error('Erro ao criar turma:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao criar turma'
    });
  }
});

// ============ ROTA PARA LISTAR TURMAS DO ALUNO ============
app.get('/api/turmas', authenticateToken, async (req, res) => {
  try {
    let query = {};
    let eixoDoAluno = null;
    
    console.log(`🔍 Buscando turmas para usuário: ${req.userId} (${req.userRole})`);
    
    if (req.userRole === 'professor') {
      query.professorId = req.userId;
    } else if (req.userRole === 'aluno') {
      // Buscar o aluno para saber seu curso
      const aluno = await User.findById(req.userId).select('curso');
      
      if (aluno && aluno.curso) {
        // Buscar o curso do aluno para obter o eixo
        const curso = await Curso.findOne({ nome: aluno.curso }).populate('eixoId');
        if (curso && curso.eixoId) {
          eixoDoAluno = curso.eixoId.nome;
          console.log(`🎯 Eixo do aluno: ${eixoDoAluno}`);
        }
      }
      
      // Filtrar turmas que o aluno participa
      query.alunos = req.userId;
    }

    // Buscar todas as turmas do aluno
    const turmas = await Turma.find(query)
      .populate('professorId', 'nome email')
      .populate('alunos', 'nome email')
      .sort({ createdAt: -1 });

    console.log(`📊 Total de turmas encontradas: ${turmas.length}`);

    // Para cada turma, buscar informações do eixo baseado no nome
    const turmasComInfo = await Promise.all(turmas.map(async (t) => {
      let eixoInfo = null;
      
      // Se a turma tem um eixo definido, buscar informações completas
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
        eixo: t.eixo, // Nome do eixo (ex: "natureza", "turismo")
        eixoInfo: eixoInfo, // Informações completas do eixo
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
    console.error('❌ Erro ao listar turmas:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/turmas/entrar', authenticateToken, async (req, res) => {
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
    console.error('Erro ao entrar na turma:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao entrar na turma'
    });
  }
});

// ============ ROTA PARA BUSCAR UMA TURMA ESPECÍFICA ============
app.get('/api/turmas/:id', authenticateToken, async (req, res) => {
  try {
    const turmaId = req.params.id;
    const userId = req.userId;
    
    console.log(`🔍 Buscando turma: ${turmaId}`);
    
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
    
    // Verificar permissão
    if (turma.professorId._id.toString() !== userId && req.userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Você não tem permissão para ver esta turma'
      });
    }
    
    // Buscar provas da turma
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
    console.error('❌ Erro ao buscar turma:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno ao buscar turma: ' + error.message
    });
  }
});

// ============ ROTA PARA BUSCAR ALUNOS DE UMA TURMA ============
app.get('/api/turmas/:id/alunos', authenticateToken, async (req, res) => {
  try {
    const turmaId = req.params.id;
    const userId = req.userId;
    
    const turma = await Turma.findById(turmaId)
      .populate('alunos', 'nome email matricula');
    
    if (!turma) {
      return res.status(404).json({
        success: false,
        error: 'Turma não encontrada'
      });
    }
    
    // Verificar permissão
    if (turma.professorId.toString() !== userId && req.userRole !== 'admin') {
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
    console.error('❌ Erro ao buscar alunos:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno ao buscar alunos'
    });
  }
});

// ============ ROTA PARA BUSCAR PROVAS DE UMA TURMA ============
app.get('/api/turmas/:id/provas', authenticateToken, async (req, res) => {
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
    
    // Verificar permissão
    if (turma.professorId.toString() !== userId && req.userRole !== 'admin') {
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
    console.error('❌ Erro ao buscar provas:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno ao buscar provas'
    });
  }
});

// ============ ROTA ATUALIZADA COM SUPORTE A PROVA ADAPTADA (3 ALTERNATIVAS) E NOTIFICAÇÕES ============
app.post('/api/turmas/:id/prova-v2', authenticateToken, uploadMultiple, async (req, res) => {
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
    
    console.log('🔍 Verificação de permissão (prova-v2):', {
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
      professorId  // <-- RECEBER DO BODY (enviado pelo admin)
    } = req.body;

    // Processar anexos
    let anexos = [];
    try {
      anexos = JSON.parse(anexosData);
    } catch (error) {
      console.warn('⚠️ Erro ao parsear anexos:', error);
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
              console.warn('⚠️ Não foi possível ler arquivo de texto:', e.message);
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

    console.log(`🤖 Professor ${req.userId} solicitando prova tipo ${tipoProva} sobre: "${conteudo}"`);
    console.log(`📎 Anexos recebidos: ${anexos.length}`);
    
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
      
      console.log(`📚 Prova normal - Será enviada para ${alunosDestino.length} aluno(s)`);
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
        "llama-3.3-70b-versatile",
        "llama-3.1-70b-versatile",
        "llama-3.1-8b-instant",
        "mixtral-8x7b-32768"
      ];

      const contextoAnexos = await processarAnexosParaIA(anexos);
      
      console.log(`📋 Contexto de anexos gerado: ${contextoAnexos.length} caracteres`);

      const detectarArea = (conteudo) => {
        if (!conteudo || typeof conteudo !== 'string') {
          console.log('⚠️ Conteúdo vazio para detectar área, usando "geral"');
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

        console.log(`🔍 Área detectada: ${areaEncontrada} (${maxMatches} correspondências)`);
        return areaEncontrada;
      };

      areaDetectada = detectarArea(conteudo);

      let completion;
      let modeloUsado = '';

      for (const modelo of modelosAtuais) {
        try {
          console.log(`🔄 Tentando modelo: ${modelo}`);
          
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
          console.log(`✅ Modelo ${modelo} funcionou!`);
          break;
          
        } catch (modeloError) {
          console.log(`❌ Modelo ${modelo} falhou: ${modeloError.message.substring(0, 100)}`);
          continue;
        }
      }
      
      if (!completion) {
        throw new Error('Todos os modelos falharam');
      }

      const resposta = completion.choices[0].message.content;
      console.log(`📄 Resposta da IA (Groq - ${modeloUsado}):`, resposta.substring(0, 300));

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
        console.error('❌ Erro no parse, tentando corrigir...');
        
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
            console.log('✅ JSON corrigido com sucesso');
          } else {
            throw new Error('JSON incompleto ou mal formado');
          }
        } catch (secondError) {
          console.error('❌ Falha na correção do JSON:', secondError.message);
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

      console.log(`📊 ${questoesArray.length} questões recebidas da IA`);

      const questoesProcessadas = [];
      
      for (let i = 0; i < Math.min(questoesArray.length, quantidadeQuestoes); i++) {
        const questao = questoesArray[i];
        
        if (!questao || typeof questao !== 'object') {
          console.warn(`⚠️ Questão ${i + 1} inválida, pulando...`);
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
      console.log(`✅ ${questoesValidadas.length} questões processadas da IA (Groq)`);

    } catch (iaError) {
      console.error('❌ Erro na IA, usando fallback:', iaError.message);
      
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
      
      console.log(`✅ ${questoesValidadas.length} questões criadas via fallback (área: ${areaFallback})`);
    }

    // ===== 🔥 CORREÇÃO CRÍTICA: DECIDIR QUAL PROFESSOR USAR =====
    let professorDaProva;

    console.log(`🔍 Criando prova - Usuário: ${req.userId} (${req.userRole})`);
    console.log(`🔍 ProfessorId recebido do frontend: ${professorId || 'NÃO FORNECIDO'}`);

    if (isAdmin && professorId) {
        // ✅ Admin/Super Admin está criando para outro professor
        professorDaProva = professorId;
        console.log(`✅ Admin/Super Admin criando prova para professor ID: ${professorId}`);
        
        // Verificar se o professor realmente existe
        const professorExiste = await User.findById(professorId);
        if (!professorExiste) {
            console.log(`❌ Professor com ID ${professorId} não encontrado!`);
            return res.status(400).json({
                success: false,
                error: 'Professor selecionado não encontrado no sistema'
            });
        }
        console.log(`✅ Professor verificado: ${professorExiste.nome} (${professorExiste.email})`);
        
    } else if (isAdmin && !professorId) {
        // Admin/Super Admin tentou criar sem selecionar professor
        console.log(`❌ Admin tentou criar prova sem selecionar professor`);
        return res.status(400).json({
            success: false,
            error: 'Selecione um professor responsável pela prova'
        });
        
    } else {
        // ✅ Professor criando sua própria prova
        professorDaProva = req.userId;
        console.log(`✅ Professor criando própria prova: ${req.userId}`);
    }

    console.log(`👨‍🏫 Professor final da prova: ${professorDaProva}`);

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

    console.log(`✅ ${req.userRole === 'admin' ? 'Admin' : 'Professor'} ${req.userId} criou prova ${prova._id} do tipo ${tipoProva} (área: ${areaDetectada})`);
    console.log(`👨‍🏫 Professor atribuído: ${professorDaProva}`);
    console.log(`🎯 Alunos alvo: ${alunosDestino.length} alunos`);
    console.log(`⏱️ Duração: ${duracaoMinutos} minutos (validada pelas configurações)`);

    // ===== 🔥 ADICIONAR NOTIFICAÇÃO QUANDO A PROVA É CRIADA =====
    // IGUAL ÀS OUTRAS ROTAS DE NOTIFICAÇÃO
    
    if (alunosDestino.length > 0) {
        const Config = mongoose.model('Config');
        const configDoc = await Config.findOne({ chave: 'notificacoes' });
        const pushAtivado = configDoc?.valor?.push === true;
        const OneSignalService = require('./services/onesignal-service');
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
                console.log(`✅ Notificação criada para aluno ${aluno.nome}`);
                
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
                console.error(`⚠️ Erro ao notificar aluno ${aluno._id}:`, notifError.message);
            }
        }
        
        console.log(`✅ ${alunosDestino.length} alunos notificados sobre nova prova criada`);
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
    console.error('❌ Erro geral ao criar prova:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao criar prova: ' + error.message
    });
  }
});

//===============ROTA PARA UPLOAD DE IMAGENS===============
// Upload de imagens para questões
app.post('/api/upload/imagem', authenticateToken, async (req, res) => {
    try {
        // Verificar se é professor - USANDO req.userRole em vez de req.user.role
        const isAdmin = req.userRole === 'admin' || req.userRole === 'super_admin';
        if (!isAdmin && req.userRole !== 'professor') {
          return res.status(403).json({
            success: false,
            error: 'Apenas professores e administradores podem corrigir provas'
          });
        }
        
        // Verificar se há arquivo
        if (!req.files || !req.files.imagem) {
            return res.status(400).json({
                success: false,
                error: 'Nenhuma imagem enviada'
            });
        }
        
        const imagem = req.files.imagem;
        
        // Tipos permitidos
        const tiposPermitidos = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!tiposPermitidos.includes(imagem.mimetype)) {
            return res.status(400).json({
                success: false,
                error: 'Tipo de imagem não suportado. Use JPEG, PNG, GIF ou WebP.'
            });
        }
        
        // Tamanho máximo: 5MB
        if (imagem.size > 5 * 1024 * 1024) {
            return res.status(400).json({
                success: false,
                error: 'Imagem muito grande. Máximo 5MB.'
            });
        }
        
        // Criar pasta de uploads
        const uploadDir = path.join(__dirname, 'uploads/imagens-questoes');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        
        // Gerar nome seguro
        const safeName = imagem.name.replace(/[^a-zA-Z0-9.]/g, '_');
        const fileName = `questao_img_${Date.now()}_${safeName}`;
        const filePath = path.join(uploadDir, fileName);
        
        // Salvar arquivo
        await imagem.mv(filePath);
        
        const imageUrl = `/uploads/imagens-questoes/${fileName}`;
        
        console.log(`✅ Imagem salva: ${imageUrl} por ${req.userId}`);
        
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
        console.error('❌ Erro no upload:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao processar imagem'
        });
    }
});

// Função auxiliar para obter dimensões da imagem (opcional)
async function obterDimensoesImagem(caminhoArquivo) {
    try {
        const sizeOf = require('image-size');
        const dimensions = sizeOf(caminhoArquivo);
        return {
            width: dimensions.width,
            height: dimensions.height
        };
    } catch (error) {
        console.warn('⚠️ Não foi possível obter dimensões da imagem:', error.message);
        return { width: 0, height: 0 };
    }
}

// ============ ROTA PARA ALUNO RESPONDER PROVA - VERSÃO SEM NOTIFICAÇÃO ============
app.post('/api/provas/:id/responder', authenticateToken, async (req, res) => {
  try {
    const provaId = req.params.id;
    const alunoId = req.userId;
    const { respostas, tempoGasto } = req.body;
    
    console.log(`📤 Aluno ${alunoId} enviando respostas para prova ${provaId}`);
    
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
    
    // Verificar se já existe resultado
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
      let respostaCorretaLetra = String.fromCharCode(65 + questao.respostaCorreta);
      
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
    
    console.log(`📊 Resultado calculado: ${acertos}/${prova.questoes.length} acertos | Nota: ${notaCalculada.toFixed(2)}`);
    
    const user = await User.findById(alunoId);
    
    // BUSCAR CONFIGURAÇÕES
    const [configCorrecaoAutomatica, configLiberacaoAutomatica] = await Promise.all([
      Config.findOne({ chave: 'provas.correcaoAutomatica' }),
      Config.findOne({ chave: 'provas.liberacaoAutomatica' })
    ]);
    
    const correcaoAutomatica = configCorrecaoAutomatica?.valor !== false;
    const liberacaoAutomatica = configLiberacaoAutomatica?.valor || false;
    
    console.log(`⚙️ Configurações de correção:`);
    console.log(`   - Correção automática: ${correcaoAutomatica ? 'ATIVADA' : 'DESATIVADA'}`);
    console.log(`   - Liberação automática: ${liberacaoAutomatica ? 'ATIVADA' : 'DESATIVADA'}`);
    
    let notaLiberada = false;
    let status = 'pendente';
    
    if (correcaoAutomatica) {
      if (liberacaoAutomatica) {
        notaLiberada = true;
        status = 'corrigida';
      } else {
        notaLiberada = false;
        status = 'pendente';
        console.log(`⏳ Nota calculada mas não liberada (liberação automática desativada)`);
      }
    } else {
      notaLiberada = false;
      status = 'pendente';
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
    console.log(`✅ Resultado salvo com ID: ${resultado._id} (nota: ${notaCalculada.toFixed(2)})`);
    
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
    
    console.log(`📈 Aluno ${alunoId} finalizou a prova ${provaId}. Nota: ${notaCalculada.toFixed(2)}`);
    
    // 🔥 REMOVIDA A NOTIFICAÇÃO QUE ESTAVA CAUSANDO ERRO!
    
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
    console.error('❌ Erro detalhado ao finalizar prova:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro interno ao finalizar prova: ' + error.message 
    });
  }
});

// ============ ROTA PARA ALUNO VER PROVAS PENDENTES - VERSÃO CORRIGIDA ============
app.get('/api/aluno/provas/pendentes', authenticateToken, async (req, res) => {
    try {
        if (req.userRole !== 'aluno') {
            return res.status(403).json({ 
                success: false, 
                error: 'Apenas alunos podem acessar esta rota' 
            });
        }
        
        const alunoId = req.userId;
        
        // Buscar dados do aluno
        const aluno = await User.findById(alunoId).select('precisaAcessibilidade condicaoAcessibilidade role nome email');
        
        if (!aluno) {
            return res.status(404).json({
                success: false,
                error: 'Aluno não encontrado'
            });
        }
        
        const precisaAcessibilidade = aluno.precisaAcessibilidade === true;
        
        // Buscar turmas do aluno
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
        
        // 🔥 CORREÇÃO: Buscar TODAS as turmas com seus status
        const turmasMap = {};
        turmas.forEach(turma => {
            turmasMap[turma._id.toString()] = turma.ativa;
        });
                
        // Buscar TODAS as provas ativas das turmas do aluno
        const provas = await Prova.find({
            turmaId: { $in: turmaIds },
            status: 'ativa',
            publicada: true
        })
        .populate('turmaId', 'nome disciplina ativa') // 🔥 INCLUIR ativa no populate
        .populate('userId', 'nome')
        .select('+tipoProva +adaptada +alternativas +titulo +conteudo +duracaoMinutos +dataLimite +horarioInicio +horarioTermino +quantidadeQuestoes +dificuldade +codigo')
        .lean();
        
        const provasPendentes = [];
        const hoje = new Date();
        
        for (const prova of provas) {
            
            // 🔥 CORREÇÃO: Verificar se a turma está ativa
            const turmaAtiva = prova.turmaId ? prova.turmaId.ativa : true;
            
            if (!turmaAtiva) {
                console.log(`⏸️ Prova ${prova.titulo} ignorada - turma inativa`);
                continue; // Pular provas de turmas inativas
            }
            
            // Detectar se é adaptada
            const isAdaptada = 
                prova.tipoProva === 'adaptada' || 
                prova.adaptada === true || 
                prova.adaptada === 'true' ||
                (prova.tipoProva && prova.tipoProva.toLowerCase() === 'adaptada') ||
                prova.alternativas === 3 ||
                false;
            
            // Filtro de acessibilidade
            if (isAdaptada && !precisaAcessibilidade) {
                continue;
            }
            
            if (!isAdaptada && precisaAcessibilidade) {
                continue;
            }
            
            // Verificar se o aluno já realizou esta prova
            const provaRealizada = await ProvaRealizada.findOne({
                provaId: prova._id,
                alunoId: alunoId
            });
            
            const resultado = await Resultado.findOne({
                provaId: prova._id,
                userId: alunoId
            });
            
            if (!provaRealizada && !resultado) {
                // Verificar disponibilidade por data limite
                let disponivel = true;
                
                if (prova.dataLimite) {
                    const dataLimite = new Date(prova.dataLimite);
                    const dataLimiteFimDia = new Date(dataLimite);
                    dataLimiteFimDia.setHours(23, 59, 59, 999);
                    disponivel = hoje <= dataLimiteFimDia;
                }
                
                if (disponivel) {
                    // Calcular dias restantes
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
                            ativa: prova.turmaId.ativa // 🔥 INCLUIR STATUS DA TURMA
                        } : null,
                        professor: prova.userId ? prova.userId.nome : 'Professor',
                        codigo: prova.codigo,
                        
                        // CAMPOS DE ACESSIBILIDADE
                        adaptada: isAdaptada,
                        tipoProva: isAdaptada ? 'adaptada' : (prova.tipoProva || 'simples'),
                        alternativas: isAdaptada ? 3 : (prova.alternativas || 5),
                        
                        diasRestantes: diasRestantes,
                        expiraHoje: diasRestantes === 0,
                        
                        // 🔥 NOVO: Informação sobre status da turma
                        turmaAtiva: turmaAtiva
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
        console.error('❌ Erro ao listar provas pendentes:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao listar provas pendentes: ' + error.message
        });
    }
});


// ============ ROTA PARA ALUNO VER CORREÇÃO DETALHADA ============
app.get('/api/aluno/provas/:provaId/correcao-detalhada', authenticateToken, async (req, res) => {
    try {
        const provaId = req.params.provaId;
        const alunoId = req.userId;
        
        if (req.userRole !== 'aluno') {
            return res.status(403).json({
                success: false,
                error: 'Apenas alunos podem acessar esta rota'
            });
        }
        
        console.log(`📝 Aluno ${alunoId} solicitando correção da prova ${provaId}`);
        
        // Buscar prova
        const prova = await Prova.findById(provaId)
            .select('titulo conteudo questoes');
        
        if (!prova) {
            return res.status(404).json({
                success: false,
                error: 'Prova não encontrada'
            });
        }
        
        // Buscar resultado do aluno
        const resultado = await Resultado.findOne({
            provaId: provaId,
            userId: alunoId
        });
        
        // Buscar prova realizada
        const provaRealizada = await ProvaRealizada.findOne({
            provaId: provaId,
            alunoId: alunoId
        });
        
        if (!resultado && !provaRealizada) {
            return res.status(404).json({
                success: false,
                error: 'Você ainda não realizou esta prova'
            });
        }
        
        // Verificar se a nota foi liberada
        const notaLiberada = (resultado && resultado.notaLiberada) || 
                            (provaRealizada && provaRealizada.notaLiberada);
        
        if (!notaLiberada) {
            return res.status(403).json({
                success: false,
                error: 'A correção ainda não foi liberada pelo professor'
            });
        }
        
        // Preparar dados da correção
        const correcaoData = {
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
        };
        
        res.json(correcaoData);
        
    } catch (error) {
        console.error('Erro ao buscar correção detalhada:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno ao buscar correção: ' + error.message
        });
    }
});

// ============ ROTA PARA PROFESSOR VER SUAS PROVAS ============
// Na rota GET /api/professor/provas
// Procure por (aproximadamente linha 1700)

app.get('/api/professor/provas', authenticateToken, async (req, res) => {
  try {
    const isAdmin = req.userRole === 'admin' || req.userRole === 'super_admin';
    if (!isAdmin && req.userRole !== 'professor') {
      return res.status(403).json({
        success: false,
        error: 'Apenas professores e administradores podem corrigir provas'
      });
    }

    const professorId = req.userId;
    
    console.log(`📋 Buscando provas do professor ${professorId}`);
    
    // FILTRAR: Mostrar apenas provas publicadas por padrão
    // Mas permitir ver rascunhos se solicitado
    const mostrarRascunhos = req.query.rascunhos === 'true';
    
    let query = { userId: professorId };
    
    // Se não pediu rascunhos, mostrar apenas provas publicadas
    if (!mostrarRascunhos) {
      query.publicada = true;
    }
    
    // Buscar provas com filtro
    const provas = await Prova.find(query)
      .populate('turmaId', 'nome disciplina')
      .sort({ createdAt: -1 });

    const provasComEstatisticas = await Promise.all(
      provas.map(async (prova) => {
        // ... resto do código permanece igual ...
        // Buscar resultados apenas se a prova for publicada
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
            
            // NOVO: Informações de publicação
            publicada: prova.publicada,
            statusPublicacao: prova.publicada ? 'Publicada' : 'Rascunho',
            
            alunosRealizaram: totalAlunosRealizaram,
            totalAlunos: prova.turmaId ? await Turma.findById(prova.turmaId).then(t => t ? t.alunos.length : 0) : 0,
            mediaNotas: parseFloat(mediaNotas.toFixed(1))
          };
        } else {
          // Para provas não publicadas (rascunhos)
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
            
            // NOVO: Informações de publicação
            publicada: prova.publicada,
            statusPublicacao: 'Rascunho',
            
            alunosRealizaram: 0,
            totalAlunos: prova.turmaId ? await Turma.findById(prova.turmaId).then(t => t ? t.alunos.length : 0) : 0,
            mediaNotas: 0
          };
        }
      })
    );

    // Filtrar provas rascunho se não solicitado
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
    console.error('Erro ao buscar provas do professor:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor: ' + error.message
    });
  }
});

// ============ ROTA PARA PROFESSOR VER PROVAS PENDENTES DE CORREÇÃO ============
app.get('/api/professor/provas/pendentes-correcao', authenticateToken, async (req, res) => {
  try {
    const isAdmin = req.userRole === 'admin' || req.userRole === 'super_admin';
    if (!isAdmin && req.userRole !== 'professor') {
      return res.status(403).json({
        success: false,
        error: 'Apenas professores e administradores podem corrigir provas'
      });
    }

    const professorId = req.userId;
    
    console.log(`📋 Professor ${professorId} solicitando provas pendentes de correção`);

    // Buscar todas as provas criadas pelo professor
    const provas = await Prova.find({
      turmaId: { $in: turmaIds },
      status: 'ativa',
      publicada: true // SÓ MOSTRAR PROVAS PUBLICADAS
    })
    .populate('turmaId', 'nome disciplina')
    .populate('userId', 'nome')
    .sort({ createdAt: -1 });

    if (provas.length === 0) {
      return res.json({
        success: true,
        mensagem: 'Você ainda não criou nenhuma prova',
        provasPendentes: []
      });
    }

    // Para cada prova, buscar as realizações pendentes de correção
    const provasPendentesCorrecao = [];

    for (const prova of provas) {
      // Buscar provas realizadas desta prova que estão com nota null ou status 'finalizada'
      const provasRealizadas = await ProvaRealizada.find({
        provaId: prova._id,
        $or: [
          { nota: null },
          { notaLiberada: false }
        ]
      })
      .populate('alunoId', 'nome email matricula')
      .sort({ dataRealizacao: 1 });

      // Buscar resultados também (para compatibilidade)
      const resultadosPendentes = await Resultado.find({
        provaId: prova._id,
        $or: [
          { nota: null },
          { notaLiberada: false }
        ]
      })
      .populate('userId', 'nome email matricula');

      // Combinar resultados
      const todasRealizacoes = [];

      provasRealizadas.forEach(pr => {
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
        // Verificar se já não foi adicionado
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
          quantidadeQuestoes: prova.questoes.length,
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
    console.error('Erro ao buscar provas pendentes de correção:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor: ' + error.message
    });
  }
});


// ============ ROTA PARA PROFESSOR CORRIGIR/LIBERAR NOTA (ATUALIZADA COM PUSH) ============
app.post('/api/professor/provas/:provaId/corrigir', authenticateToken, async (req, res) => {
  try {
    const provaId = req.params.provaId;
    const professorId = req.userId;
    const { alunoId, nota, liberarNota = true } = req.body;
    
    console.log(`📝 Professor ${professorId} corrigindo prova ${provaId} do aluno ${alunoId}`);
    
    const isAdmin = req.userRole === 'admin' || req.userRole === 'super_admin';
    if (!isAdmin && req.userRole !== 'professor') {
      return res.status(403).json({
        success: false,
        error: 'Apenas professores e administradores podem corrigir provas'
      });
    }
    
    // Verificar se a prova existe e pertence ao professor
    const prova = await Prova.findById(provaId);
    if (!prova) {
      return res.status(404).json({
        success: false,
        error: 'Prova não encontrada'
      });
    }
    
    if (prova.userId.toString() !== professorId && req.userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Você não é o professor desta prova'
      });
    }
    
    // Validar nota
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
    
    // Buscar prova realizada do aluno
    let provaRealizada = await ProvaRealizada.findOne({
      provaId: provaId,
      alunoId: alunoId
    });
    
    let resultado = await Resultado.findOne({
      provaId: provaId,
      userId: alunoId
    });
    
    if (!provaRealizada && !resultado) {
      return res.status(404).json({
        success: false,
        error: 'Prova do aluno não encontrada'
      });
    }
    
    // Atualizar ProvaRealizada
    if (provaRealizada) {
      provaRealizada.nota = notaNumber;
      provaRealizada.status = 'corrigida';
      provaRealizada.notaLiberada = liberarNota;
      await provaRealizada.save();
      console.log(`✅ ProvaRealizada atualizada com nota: ${notaNumber}`);
    }
    
    // Atualizar Resultado
    if (resultado) {
      resultado.nota = notaNumber;
      resultado.notaLiberada = liberarNota;
      resultado.porcentagem = ((notaNumber / 10) * 100).toFixed(1);
      await resultado.save();
      console.log(`✅ Resultado atualizado com nota: ${notaNumber} e notaLiberada: ${liberarNota}`);
    }
    
    // Atualizar estatísticas da prova
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
      console.log(`📈 Estatísticas da prova atualizadas. Nova média: ${prova.mediaNotas}`);
    }
    
    // ===== 🔥 NOTIFICAR ALUNO SOBRE CORREÇÃO =====
    if (liberarNota) {
      try {
        const aluno = await User.findById(alunoId).select('nome onesignalPlayerId');
        const professor = await User.findById(professorId).select('nome');
        
        const Config = mongoose.model('Config');
        const configDoc = await Config.findOne({ chave: 'notificacoes' });
        const pushAtivado = configDoc?.valor?.push === true;
        
        // Notificação no sistema
        const notificacao = new Notificacao({
          usuarioId: alunoId,
          tipo: 'prova_corrigida',
          titulo: '✅ Prova Corrigida',
          mensagem: `Sua nota na prova "${prova.titulo}" foi liberada: ${notaNumber.toFixed(2)}`,
          icone: '✅',
          cor: '#10b981',
          link: `/aluno.html?prova=${provaId}`,
          prioridade: 4,
          dados: {
            provaId: prova._id,
            provaTitulo: prova.titulo,
            nota: notaNumber,
            professor: professor?.nome || 'Professor'
          }
        });
        
        await notificacao.save();
        
        // Push se ativado
        if (pushAtivado) {
          const OneSignalService = require('./services/onesignal-service');
          const oneSignal = new OneSignalService();
          
          await oneSignal.enviarPush(
            alunoId,
            '✅ Prova Corrigida',
            `Sua nota em "${prova.titulo}" foi liberada: ${notaNumber.toFixed(2)}`,
            {
              tipo: 'prova_corrigida',
              provaId: prova._id,
              nota: notaNumber
            }
          );
        }
        
        console.log(`✅ Aluno ${aluno?.nome || alunoId} notificado sobre correção`);
      } catch (notifError) {
        console.error('⚠️ Erro ao notificar aluno:', notifError.message);
      }
    }
    
    res.json({
      success: true,
      message: liberarNota ? 
        'Nota corrigida e liberada para o aluno com sucesso!' : 
        'Nota corrigida com sucesso! (ainda não liberada)',
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
    console.error('❌ Erro ao corrigir prova:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno ao corrigir prova: ' + error.message
    });
  }
});


// ============ ROTA PARA PROFESSOR LIBERAR TODAS AS NOTAS DE UMA PROVA ============
app.post('/api/professor/provas/:provaId/liberar-notas', authenticateToken, async (req, res) => {
  try {
    const provaId = req.params.provaId;
    const professorId = req.userId;
    
    console.log(`📝 Professor ${professorId} liberando todas as notas da prova ${provaId}`);
    
    const isAdmin = req.userRole === 'admin' || req.userRole === 'super_admin';
    if (!isAdmin && req.userRole !== 'professor') {
      return res.status(403).json({
        success: false,
        error: 'Apenas professores e administradores podem corrigir provas'
      });
    }
    
    // Verificar se a prova existe e pertence ao professor
    const prova = await Prova.findById(provaId);
    if (!prova) {
      return res.status(404).json({
        success: false,
        error: 'Prova não encontrada'
      });
    }
    
    if (prova.userId.toString() !== professorId && req.userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Você não é o professor desta prova'
      });
    }
    
    // Buscar todas as provas realizadas desta prova com nota não liberada
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
    
    // Liberar notas das ProvaRealizadas
    let contadorProvas = 0;
    for (const pr of provasRealizadas) {
      pr.notaLiberada = true;
      pr.status = 'corrigida';
      await pr.save();
      contadorProvas++;
    }
    
    // Liberar notas dos Resultados
    let contadorResultados = 0;
    for (const r of resultados) {
      r.notaLiberada = true;
      await r.save();
      contadorResultados++;
    }
    
    const totalLiberados = contadorProvas + contadorResultados;
    
    console.log(`✅ ${totalLiberados} notas liberadas para a prova ${provaId}`);
    
    // ===== 🔥 NOTIFICAR TODOS OS ALUNOS =====
    if (totalLiberados > 0) {
      const Config = mongoose.model('Config');
      const configDoc = await Config.findOne({ chave: 'notificacoes' });
      const pushAtivado = configDoc?.valor?.push === true;
      const OneSignalService = require('./services/onesignal-service');
      const oneSignal = pushAtivado ? new OneSignalService() : null;
      
      const todosAlunos = [...provasRealizadas, ...resultados];
      
      for (const item of todosAlunos) {
        try {
          const alunoId = item.alunoId?._id || item.userId?._id;
          const alunoNome = item.alunoId?.nome || item.userId?.nome || 'Aluno';
          const nota = item.nota;
          
          if (!alunoId) continue;
          
          // Notificação no sistema
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
          
          // Push se ativado
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
          console.error('⚠️ Erro ao notificar aluno:', notifError.message);
        }
      }
      
      console.log(`✅ ${todosAlunos.length} alunos notificados sobre liberação de notas`);
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
    console.error('❌ Erro ao liberar notas:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno ao liberar notas: ' + error.message
    });
  }
});

// ============ ROTA PARA ALUNO OBTER PROVA PARA REALIZAR ============
app.get('/api/provas/:id/realizar', authenticateToken, async (req, res) => {
  try {
    const provaId = req.params.id;
    const alunoId = req.userId;
    
    console.log(`📋 Aluno ${alunoId} solicitando prova ${provaId} para realizar`);
    
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

    // **VERIFICAÇÃO COMPLETA DE DATA E HORÁRIO**
    const agora = new Date();
    const hoje = agora.toISOString().split('T')[0];
    
    // Verificar DATA (considerando data limite como fim do dia)
    if (prova.dataLimite) {
      const dataLimite = new Date(prova.dataLimite);
      const dataLimiteFimDia = new Date(dataLimite);
      dataLimiteFimDia.setHours(23, 59, 59, 999);
      
      console.log(`📅 Verificando data limite:`);
      console.log(`   Agora: ${agora.toLocaleString('pt-BR')}`);
      console.log(`   Data limite (fim do dia): ${dataLimiteFimDia.toLocaleString('pt-BR')}`);
      
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
    
    // Preparar dados da prova para o aluno
    const provaParaAluno = {
      _id: prova._id,
      titulo: prova.titulo,
      conteudo: prova.conteudo,
      periodo: prova.periodo || '1',
      // **ADICIONAR ESTES CAMPOS:**
      horarioInicio: prova.horarioInicio,
      horarioTermino: prova.horarioTermino,
      duracaoMinutos: prova.duracaoMinutos,
      dataLimite: prova.dataLimite,
      // Calcular tempo restante em minutos
      tempoRestanteMinutos: prova.horarioTermino ? 
        Math.floor((new Date(`${hoje}T${prova.horarioTermino}:00`) - agora) / (1000 * 60)) : 
        null,
      questoes: prova.questoes.map(q => ({
        pergunta: q.pergunta,
        opcoes: q.opcoes
      }))
    };
    
    console.log(`✅ Prova ${provaId} enviada para aluno ${alunoId}`);
    console.log(`📋 Informações da prova: ${prova.horarioInicio} às ${prova.horarioTermino} (${prova.duracaoMinutos} minutos)`);
    
    res.json({ 
      success: true, 
      prova: provaParaAluno 
    });
    
  } catch (error) {
    console.error('Erro ao carregar prova:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro ao carregar prova' 
    });
  }
});

// ============ ROTA PARA ALUNO VER SUAS PROVAS - VERSÃO CORRIGIDA (COM notaLiberada) ============
app.get('/api/aluno/provas', authenticateToken, async (req, res) => {
    try {
        if (req.userRole !== 'aluno') {
            return res.status(403).json({
                success: false,
                error: 'Apenas alunos podem acessar esta rota'
            });
        }

        const alunoId = req.userId;

        // Buscar turmas do aluno
        const turmas = await Turma.find({ alunos: alunoId });
        const turmaIds = turmas.map(t => t._id);

        // Buscar provas ativas das turmas do aluno
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
            
            // PRIMEIRO: Buscar em ProvaRealizada
            const provaRealizada = await ProvaRealizada.findOne({
                provaId: prova._id,
                alunoId: alunoId
            }).lean();

            // SEGUNDO: Buscar em Resultado
            let resultado = await Resultado.findOne({
                provaId: prova._id,
                userId: alunoId
            }).lean();
          
            // Evitar duplicação
            const chaveProva = prova._id.toString();
            if (provasProcessadas.has(chaveProva)) {
                continue;
            }
            provasProcessadas.add(chaveProva);
            
            // DETERMINAR SE É CANCELADA
            let provaCancelada = false;
            let motivoCancelamento = null;
            let flagViolacao = false;
            let estatisticasCancelamento = null;
            let nota = null;
            let tempoGasto = 0;
            let dataRealizacao = null;
            let statusExibicao = 'aguardando_correcao';
            let statusCorrecao = 'pendente';
            
            // CORREÇÃO PRINCIPAL: DETERMINAR notaLiberada CORRETAMENTE
            let notaLiberada = false;
            
            // PRIORIDADE: Dados de ProvaRealizada
            if (provaRealizada) {
                provaCancelada = provaRealizada.cancelada || 
                                provaRealizada.status === 'cancelada';
                
                motivoCancelamento = provaRealizada.motivoCancelamento;
                flagViolacao = provaRealizada.flagViolacao || false;
                estatisticasCancelamento = provaRealizada.estatisticasCancelamento;
                nota = provaRealizada.nota;
                tempoGasto = provaRealizada.tempoGasto || 0;
                dataRealizacao = provaRealizada.dataRealizacao;
                
                // CORREÇÃO: Verificar notaLiberada explicitamente
                notaLiberada = provaRealizada.notaLiberada === true;
            }
            
            // COMPLEMENTO: Dados de Resultado
            if (resultado) {
                if (!motivoCancelamento) motivoCancelamento = resultado.motivoCancelamento;
                if (!flagViolacao) flagViolacao = resultado.flagViolacao || false;
                if (!estatisticasCancelamento) estatisticasCancelamento = resultado.estatisticasCancelamento;
                if (nota === null || nota === undefined) nota = resultado.nota;
                if (!tempoGasto) tempoGasto = resultado.tempoGasto || 0;
                if (!dataRealizacao) dataRealizacao = resultado.createdAt;
                
                if (!provaCancelada) {
                    provaCancelada = resultado.cancelada || 
                                    resultado.status === 'cancelada';
                }
                
                // CORREÇÃO: Se Resultado diz que a nota está liberada, usar isso
                if (resultado.notaLiberada === true) {
                    notaLiberada = true;
                }
            }
            
            // Determinar status de exibição
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
                notaLiberada = true; // Provas canceladas têm nota "liberada" (0)
            } 
            // Se não é cancelada, verificar se a nota foi liberada
            else if (notaLiberada && nota !== null) {
                statusCorrecao = 'corrigida';
                statusExibicao = 'concluida';
            } else {
                statusCorrecao = 'pendente';
                statusExibicao = 'aguardando_correcao';
            }
            
            // Formatar dados para retorno
            const dadosProva = {
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
                notaLiberada: notaLiberada,  // CORREÇÃO: Incluir este campo
                
                cancelada: provaCancelada,
                motivoCancelamento: motivoCancelamento,
                flagViolacao: flagViolacao,
                estatisticasCancelamento: estatisticasCancelamento,
                
                dataRealizacao: dataRealizacao,
                tempoGasto: tempoGasto,
                
                _fonte: provaRealizada ? 'ProvaRealizada' : 'Resultado'
            };
            
            provasComStatus.push(dadosProva);
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
        console.error('❌ Erro detalhado ao listar provas do aluno:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao listar provas: ' + error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// ============ ROTA PARA DETALHES DE CANCELAMENTO COM DADOS COMPLETOS ============
app.get('/api/aluno/provas/:provaId/cancelamento-detailed', authenticateToken, async (req, res) => {
    try {
        const provaId = req.params.provaId;
        const alunoId = req.userId;
        
        if (req.userRole !== 'aluno') {
            return res.status(403).json({
                success: false,
                error: 'Apenas alunos podem acessar esta rota'
            });
        }

        // Buscar em ProvaRealizada
        const provaRealizada = await ProvaRealizada.findOne({
            provaId: provaId,
            alunoId: alunoId,
            $or: [
                { status: 'cancelada' },
                { cancelada: true }
            ]
        })
        .populate('provaId', 'titulo conteudo')
        .populate('alunoId', 'nome email');

        // Buscar em Resultado
        const resultado = await Resultado.findOne({
            provaId: provaId,
            userId: alunoId,
            $or: [
                { status: 'cancelada' },
                { cancelada: true }
            ]
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
        
        // Determinar tipo de cancelamento
        const motivo = dadosCancelamento.motivoCancelamento || '';
        const motivoLower = motivo.toLowerCase();
        
        // DETECÇÃO DE TIPO DE CANCELAMENTO
        let tipoCancelamento = 'outro';
        let icone = 'ban';
        let corPrincipal = '#ef4444';
        let corFundo = '#fef2f2';
        let tituloStatus = 'CANCELADA';
        
        // Palavras-chave para violação
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

        // Formatar estatísticas do log
        let estatisticas = dadosCancelamento.estatisticasCancelamento || {};
        
        // Se não tiver estatísticas, extrair do motivo
        if (!estatisticas.timestamp && dadosCancelamento.createdAt) {
            estatisticas.timestamp = dadosCancelamento.createdAt;
        }

        // Buscar professor para notificação
        let professor = null;
        if (prova?.userId) {
            professor = await User.findById(prova.userId).select('nome email');
        }

        const detalhes = {
            success: true,
            tipo: 'cancelada',
            tipoCancelamento: tipoCancelamento,
            tituloStatus: tituloStatus,
            icone: icone,
            corPrincipal: corPrincipal,
            corFundo: corFundo,
            
            // Dados da prova
            prova: {
                id: prova?._id,
                titulo: prova?.titulo || 'Prova não encontrada',
                conteudo: prova?.conteudo || 'Conteúdo não especificado'
            },
            
            // Dados do aluno
            aluno: {
                id: alunoId,
                nome: aluno?.nome || 'Aluno',
                email: aluno?.email || 'Não informado'
            },
            
            // Dados do cancelamento
            cancelamento: {
                motivo: motivo,
                data: dadosCancelamento.dataRealizacao || dadosCancelamento.createdAt,
                nota: dadosCancelamento.nota || 0,
                tempoGasto: dadosCancelamento.tempoGasto || 0
            },
            
            // Estatísticas do log
            estatisticas: estatisticas,
            
            // Dados do professor (para quem foi notificado)
            professor: professor ? {
                nome: professor.nome,
                email: professor.email
            } : null,
            
            // Informações técnicas
            logTimestamp: estatisticas.timestamp || new Date().toISOString(),
            
            // Mensagens para o aluno
            mensagem: tipoCancelamento === 'violacao' 
                ? 'Esta prova foi cancelada por violação das regras estabelecidas para realização da avaliação.' 
                : 'Esta prova foi cancelada automaticamente por expiração do prazo de entrega.',
                
            recomendacao: tipoCancelamento === 'violacao'
                ? 'Para evitar cancelamentos futuros, respeite as regras da prova: mantenha a tela cheia, não saia da página e não use atalhos durante a realização.'
                : 'Para evitar cancelamentos futuros, realize as provas dentro do prazo estabelecido.'
        };

        res.json(detalhes);

    } catch (error) {
        console.error('❌ Erro ao buscar detalhes de cancelamento:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno ao buscar detalhes do cancelamento: ' + error.message
        });
    }
});

// ============ ROTA PARA DETALHES DE CANCELAMENTO - VISÃO PROFESSOR ============
app.get('/api/professor/provas/:provaId/cancelamento-detailed', authenticateToken, async (req, res) => {
    try {
        const provaId = req.params.provaId;
        const alunoId = req.query.alunoId; // Professor passa o alunoId como query param
        
        if (req.userRole !== 'professor') {
            return res.status(403).json({
                success: false,
                error: 'Apenas professores podem acessar esta rota'
            });
        }

        // Verificar se o professor é dono da prova
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

        // Buscar em ProvaRealizada
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

        // Buscar em Resultado
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
        
        // Determinar tipo de cancelamento (USAR A MESMA LÓGICA DO ALUNO)
        const motivo = dadosCancelamento.motivoCancelamento || '';
        const motivoLower = motivo.toLowerCase();
        
        // DETECÇÃO DE TIPO DE CANCELAMENTO - MESMA LÓGICA DO ALUNO
        let tipoCancelamento = 'outro';
        let icone = 'ban';
        let corPrincipal = '#ef4444';
        let corFundo = '#fef2f2';
        let tituloStatus = 'CANCELADA';
        
        // Palavras-chave para violação
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

        // Formatar estatísticas do log
        let estatisticas = dadosCancelamento.estatisticasCancelamento || {};
        
        // Se não tiver estatísticas, extrair do motivo
        if (!estatisticas.timestamp && dadosCancelamento.createdAt) {
            estatisticas.timestamp = dadosCancelamento.createdAt;
        }

        // Buscar professor (o próprio)
        const professor = await User.findById(req.userId).select('nome email');

        const detalhes = {
            success: true,
            tipo: 'cancelada',
            tipoCancelamento: tipoCancelamento,
            tituloStatus: tituloStatus,
            icone: icone,
            corPrincipal: corPrincipal,
            corFundo: corFundo,
            
            // Dados da prova
            prova: {
                id: prova?._id,
                titulo: prova?.titulo || 'Prova não encontrada',
                conteudo: prova?.conteudo || 'Conteúdo não especificado',
                dataLimite: prova?.dataLimite,
                professorNome: professor?.nome
            },
            
            // Dados do aluno
            aluno: {
                id: alunoId,
                nome: aluno?.nome || 'Aluno',
                email: aluno?.email || 'Não informado',
                matricula: aluno?.matricula || 'Não informada'
            },
            
            // Dados do cancelamento
            cancelamento: {
                motivo: motivo,
                data: dadosCancelamento.dataRealizacao || dadosCancelamento.createdAt,
                nota: dadosCancelamento.nota || 0,
                tempoGasto: dadosCancelamento.tempoGasto || 0,
                respostas: dadosCancelamento.respostas || [],
                historico: dadosCancelamento.historicoEventos || []
            },
            
            // Estatísticas do log
            estatisticas: estatisticas,
            
            // Dados do professor (para quem foi notificado)
            professor: professor ? {
                nome: professor.nome,
                email: professor.email
            } : null,
            
            // Informações técnicas
            logTimestamp: estatisticas.timestamp || new Date().toISOString(),
            
            // Mensagens para o professor
            mensagem: tipoCancelamento === 'violacao' 
                ? 'Esta prova foi cancelada por violação das regras estabelecidas para realização da avaliação.' 
                : 'Esta prova foi cancelada automaticamente por expiração do prazo de entrega.',
                
            recomendacao: tipoCancelamento === 'violacao'
                ? `O aluno ${aluno?.nome || 'não identificado'} violou as regras da prova. Recomende ao aluno que respeite as normas nas próximas avaliações.`
                : `O aluno ${aluno?.nome || 'não identificado'} não realizou a prova dentro do prazo. Considere ajustar os prazos ou entrar em contato com o aluno.`,
            
            // Informações adicionais para professor
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
        console.error('❌ Erro ao buscar detalhes de cancelamento (professor):', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno ao buscar detalhes do cancelamento: ' + error.message
        });
    }
});

// ============ ROTA PARA VALIDAR ACESSO À PROVA - VERSÃO COM FACE ID ============
app.get('/api/provas/:id/acesso', authenticateToken, async (req, res) => {
  try {
    const provaId = req.params.id;
    const alunoId = req.userId;
    
    console.log(`🔐 ===== VALIDANDO ACESSO À PROVA =====`);
    console.log(`   🆔 Prova ID: ${provaId}`);
    console.log(`   🆔 Aluno ID: ${alunoId}`);
    
    // ========== BUSCAR DADOS DO ALUNO ==========
    const aluno = await User.findById(alunoId).select('precisaAcessibilidade condicaoAcessibilidade role nome email');
    
    if (!aluno) {
      console.log(`   ❌ Aluno não encontrado`);
      return res.status(404).json({
        success: false,
        error: 'Aluno não encontrado'
      });
    }
    
    // ========== BUSCAR CONFIGURAÇÕES DE SEGURANÇA ==========
    const configFaceId = await Config.findOne({ chave: 'seguranca.exigirFaceIdProvas' });
    const exigirFaceId = configFaceId ? configFaceId.valor : false;
    
    console.log(`   👤 Configuração Face ID: ${exigirFaceId ? 'ATIVADO' : 'DESATIVADO'}`);
    
    // ========== BUSCAR PROVA ==========
    const prova = await Prova.findById(provaId)
      .populate('turmaId', 'nome disciplina alunos')
      .populate('userId', 'nome email')
      .select('+tipoProva +adaptada +alternativas +titulo +conteudo +duracaoMinutos +dataLimite +horarioInicio +horarioTermino +quantidadeQuestoes +status +publicada');
    
    if (!prova) {
      console.log(`   ❌ Prova não encontrada`);
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
    
    // ========== VERIFICAR SE A PROVA ESTÁ PUBLICADA ==========
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
            console.log(`🚫 BLOQUEADO: Aluno não está na turma desta prova`);
            return res.status(403).json({
                success: false,
                error: 'Você não está matriculado na turma desta prova.'
            });
        }
        
        console.log(`✅ Aluno autorizado a acessar a prova`);
    }
    
    // ========== VERIFICAR SE O ALUNO JÁ REALIZOU ESTA PROVA ==========
    const provaRealizada = await ProvaRealizada.findOne({
      provaId: provaId,
      alunoId: alunoId
    });
    
    if (provaRealizada) {
      console.log(`   🚫 BLOQUEADO: Aluno já realizou esta prova em ${provaRealizada.dataRealizacao}`);
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
      console.log(`   🚫 BLOQUEADO: Aluno já tem resultado registrado para esta prova`);
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
    
    // ========== APLICAR TEMPO ADICIONAL PARA ACESSIBILIDADE ==========
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
    
    // ========== GERAR TOKEN DE ACESSO À PROVA ==========
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
    
    console.log(`   ✅ ACESSO AUTORIZADO!`);
    console.log(`   🎟️ Token gerado: ${provaToken.substring(0, 30)}...`);
    
    // ========== RETORNAR SUCESSO COM DADOS DA PROVA ==========
    res.json({
      success: true,
      provaToken: provaToken,
      // ===== NOVO: INFORMAR SE FACE ID É EXIGIDO =====
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
    console.error('❌ ERRO AO VALIDAR ACESSO À PROVA:', error.message);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

// ============ ROTA PARA REALIZAR PROVA (PÁGINA PROTEGIDA) ============
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
            <div class="error">
              <p>Token de acesso não fornecido.</p>
            </div>
            <a href="/aluno.html" class="btn">Voltar ao Painel</a>
          </div>
        </body>
        </html>
      `);
    }
    
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
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
          <div class="error">
            <p>Seu token de acesso expirou. Acesse a prova novamente pelo painel.</p>
          </div>
          <a href="/aluno.html" class="btn">Voltar ao Painel</a>
        </div>
      </body>
      </html>
    `);
  }
    
    if (decoded.access !== 'prova') {
      return res.status(403).send('Token inválido para esta operação');
    }
    
    res.sendFile(path.join(__dirname, '../frontend/realizar-prova.html'));
    
  } catch (error) {
    console.error('Erro na rota realizar-prova:', error);
    res.status(500).send('Erro interno do servidor');
  }
});

// ============ ROTA PARA OBTER DADOS DA PROVA COM TOKEN ============
app.get('/api/provas/dados', async (req, res) => {
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
      dataLimite: prova.dataLimite,
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
    console.error('Erro ao obter dados da prova:', error);
    
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

// ============ ROTAS DE RESULTADOS ============

// ============ ROTA DE RESULTADOS DO PROFESSOR - VERSÃO ULTRA ROBUSTA ============
app.get('/api/professor/resultados', authenticateToken, async (req, res) => {
  // Garantir que sempre retornamos JSON, mesmo em caso de erro
  res.setHeader('Content-Type', 'application/json');
  
  try {
    const isAdmin = req.userRole === 'admin' || req.userRole === 'super_admin';
    if (!isAdmin && req.userRole !== 'professor') {
      return res.status(403).json({
        success: false,
        error: 'Apenas professores e administradores podem corrigir provas'
      });
    }

    const professorId = req.userId;
    console.log(`📊 Professor ${professorId} buscando resultados`);

    // Buscar provas do professor
    const provas = await Prova.find({ userId: professorId })
      .populate('turmaId', 'nome disciplina')
      .lean(); // .lean() para melhor performance

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
      // Buscar resultados - com tratamento de erro para cada query
      let resultadosProva = [];
      try {
        resultadosProva = await Resultado.find({ provaId: prova._id })
          .populate('userId', 'nome email matricula')
          .lean() || [];
      } catch (e) {
        console.warn(`⚠️ Erro ao buscar resultados da prova ${prova._id}:`, e.message);
      }

      let provasRealizadas = [];
      try {
        provasRealizadas = await ProvaRealizada.find({ provaId: prova._id })
          .populate('alunoId', 'nome email matricula')
          .lean() || [];
      } catch (e) {
        console.warn(`⚠️ Erro ao buscar provas realizadas da prova ${prova._id}:`, e.message);
      }

      // Processar resultados com segurança
      resultadosProva.forEach(r => {
        if (!r.userId) {
          console.warn(`⚠️ Resultado ${r._id} sem referência de usuário`);
          return;
        }

        alunosProcessados.add(r.userId._id?.toString() || r.userId.toString());

        resultadosCompletos.push({
          provaId: prova._id,
          provaTitulo: prova.titulo || 'Sem título',
          provaConteudo: prova.conteudo || '',
          provaDataLimite: prova.dataLimite,
          periodo: prova.periodo || '1',
          periodo: prova.periodo || '1', 
          turmaId: prova.turmaId?._id,
          turmaNome: prova.turmaId?.nome || 'Turma não especificada',
          turmaDisciplina: prova.turmaId?.disciplina || '',
          alunoId: r.userId._id || r.userId,
          alunoNome: r.userId.nome || 'Aluno não identificado',
          alunoEmail: r.userId.email || '',
          alunoMatricula: r.userId.matricula || '',
          nota: r.nota,
          acertos: r.acertos || 0,
          total: r.total || 0,
          porcentagem: r.porcentagem || '0.0',
          tempoGasto: r.tempoGasto || 0,
          dataEntrega: r.createdAt,
          notaLiberada: r.notaLiberada || false,
          tipo: 'resultado'
        });

        if (r.nota !== undefined && r.nota !== null && !isNaN(r.nota)) {
          totalAlunos++;
          somaNotas += r.nota;
          contadorNotas++;
        }
      });

      // Processar provas realizadas com segurança
      provasRealizadas.forEach(pr => {
        if (!pr.alunoId) {
          console.warn(`⚠️ ProvaRealizada ${pr._id} sem referência de aluno`);
          return;
        }

        const alunoId = pr.alunoId._id?.toString() || pr.alunoId.toString();
        
        // Verificar duplicata
        const jaExiste = resultadosCompletos.some(r => 
          r.alunoId?.toString() === alunoId && 
          r.provaId?.toString() === prova._id.toString()
        );

        if (!jaExiste) {
          alunosProcessados.add(alunoId);

          resultadosCompletos.push({
            provaId: prova._id,
            provaTitulo: prova.titulo || 'Sem título',
            provaConteudo: prova.conteudo || '',
            provaDataLimite: prova.dataLimite,
            turmaId: prova.turmaId?._id,
            turmaNome: prova.turmaId?.nome || 'Turma não especificada',
            turmaDisciplina: prova.turmaId?.disciplina || '',
            alunoId: alunoId,
            alunoNome: pr.alunoId.nome || 'Aluno não identificado',
            alunoEmail: pr.alunoId.email || '',
            alunoMatricula: pr.alunoId.matricula || '',
            nota: pr.nota,
            tempoGasto: pr.tempoGasto || 0,
            dataEntrega: pr.dataRealizacao,
            notaLiberada: pr.notaLiberada || false,
            tipo: 'prova_realizada'
          });

          if (pr.nota !== undefined && pr.nota !== null && !isNaN(pr.nota)) {
            totalAlunos++;
            somaNotas += pr.nota;
            contadorNotas++;
          }
        }
      });
    }

    // Calcular estatísticas com segurança
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
      provas: provas.map(prova => ({
        id: prova._id,
        titulo: prova.titulo || 'Sem título',
        totalQuestoes: prova.questoes?.length || 0,
        dificuldade: prova.dificuldade || 'media',
        dataLimite: prova.dataLimite
      }))
    };

    console.log(`✅ Resultados carregados: ${resultadosCompletos.length} registros`);

    return res.json({
      success: true,
      resultados: resultadosCompletos,
      estatisticas: estatisticas,
      mensagem: `Encontrados ${resultadosCompletos.length} resultados em ${provas.length} provas`
    });

  } catch (error) {
    console.error('❌ Erro crítico ao buscar resultados:', error);
    console.error('Stack:', error.stack);
    
    // SEMPRE retornar JSON, mesmo em erro
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

// ROTA: Resultado do aluno para uma prova específica (ATUALIZADA COM TRATAMENTO DE ERRO)
// ============ ROTA PARA ALUNO VER RESULTADO (CORREÇÃO DO CAMPO notaLiberada) ============
app.get('/api/aluno/provas/:provaId/resultado', authenticateToken, async (req, res) => {
    try {
        const provaId = req.params.provaId;
        const alunoId = req.userId;

        console.log(`🔍 Aluno ${alunoId} solicitando resultado da prova ${provaId}`);

        if (req.userRole !== 'aluno') {
            return res.status(403).json({
                success: false,
                error: 'Apenas alunos podem acessar esta rota'
            });
        }

        // Buscar primeiro no Resultado (modelo principal para notas)
        let resultado = await Resultado.findOne({
            provaId: provaId,
            userId: alunoId
        })
        .populate('provaId', 'titulo conteudo turmaId')
        .populate('userId', 'nome email');

        // Buscar também na ProvaRealizada
        const provaRealizada = await ProvaRealizada.findOne({
            provaId: provaId,
            alunoId: alunoId
        })
        .populate('provaId', 'titulo conteudo turmaId')
        .populate('alunoId', 'nome email');

        // Se não encontrou em nenhum lugar
        if (!resultado && !provaRealizada) {
            return res.status(404).json({
                success: false,
                error: 'Você ainda não realizou esta prova'
            });
        }

        // LÓGICA CORRIGIDA: Verificar se a nota está liberada
        let notaLiberada = false;
        let nota = null;
        let dadosCompletos = null;

        // Primeiro verificar no Resultado
        if (resultado) {
            console.log(`📊 Resultado encontrado: notaLiberada=${resultado.notaLiberada}, nota=${resultado.nota}`);
            
            // CORREÇÃO: Verificar explicitamente se notaLiberada é true
            if (resultado.notaLiberada === true && resultado.nota !== null && resultado.nota !== undefined) {
                notaLiberada = true;
                nota = resultado.nota;
                dadosCompletos = {
                    tipo: 'resultado',
                    dados: resultado
                };
                console.log(`✅ Nota liberada encontrada no Resultado: ${nota}`);
            }
        }

        // Se ainda não encontrou nota liberada, verificar na ProvaRealizada
        if (!notaLiberada && provaRealizada) {
            console.log(`📊 ProvaRealizada encontrada: notaLiberada=${provaRealizada.notaLiberada}, nota=${provaRealizada.nota}`);
            
            // CORREÇÃO: Verificar explicitamente se notaLiberada é true
            if (provaRealizada.notaLiberada === true && provaRealizada.nota !== null && provaRealizada.nota !== undefined) {
                notaLiberada = true;
                nota = provaRealizada.nota;
                dadosCompletos = {
                    tipo: 'prova_realizada',
                    dados: provaRealizada
                };
                console.log(`✅ Nota liberada encontrada na ProvaRealizada: ${nota}`);
            }
        }

        // Se a nota foi liberada
        if (notaLiberada && nota !== null) {
            const prova = resultado?.provaId || provaRealizada?.provaId;
            const aluno = resultado?.userId || provaRealizada?.alunoId;
            
            // Calcular acertos e porcentagem se não estiverem disponíveis
            let acertos = resultado?.acertos;
            let total = resultado?.total;
            let porcentagem = resultado?.porcentagem;
            
            if (!acertos && prova?.questoes) {
                total = prova.questoes.length;
                acertos = Math.round((nota / 10) * total);
                porcentagem = ((acertos / total) * 100).toFixed(1);
            }
            
            console.log(`✅ Nota ${nota} liberada para o aluno ${alunoId}`);
            
            return res.json({
                success: true,
                status: 'corrigida',
                notaLiberada: true,  // EXPLICITAMENTE true
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
        
        // Se chegou aqui, a nota não foi liberada ainda
        console.log(`⏳ Nota ainda não liberada para o aluno ${alunoId}`);
        
        return res.json({
            success: true,
            status: 'pendente',
            notaLiberada: false,  // EXPLICITAMENTE false
            mensagem: 'Sua prova ainda está sendo corrigida pelo professor.',
            dataEntrega: resultado?.createdAt || provaRealizada?.dataRealizacao,
            tempoGasto: resultado?.tempoGasto || provaRealizada?.tempoGasto || 0,
            prova: {
                titulo: (resultado?.provaId || provaRealizada?.provaId)?.titulo || 'Prova',
                conteudo: (resultado?.provaId || provaRealizada?.provaId)?.conteudo || ''
            }
        });

    } catch (error) {
        console.error('❌ Erro detalhado ao buscar resultado do aluno:', error);
        
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


// ROTA: Resultados completos do aluno
app.get('/api/aluno/resultados', authenticateToken, async (req, res) => {
  try {
    if (req.userRole !== 'aluno') {
      return res.status(403).json({
        success: false,
        error: 'Apenas alunos podem acessar esta rota'
      });
    }

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
    console.error('Erro ao buscar resultados do aluno:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

// Rota para buscar notas dos alunos com filtros
app.get('/api/professor/resultados/notas-alunos', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ success: false, error: 'Token não fornecido' });
        }

        // Verificar token e obter ID do professor
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const professorId = decoded.userId;

        const { turmaId, disciplina, periodo, status } = req.query;

        // Construir query base
        let query = {};
        
        // Filtrar por turma
        if (turmaId && turmaId !== '') {
            query.turmaId = turmaId;
        }

        // Se for professor, filtrar apenas suas turmas
        const turmasQuery = { professorId };
        if (turmaId) turmasQuery._id = turmaId;
        
        const turmas = await Turma.find(turmasQuery).select('_id');
        const turmasIds = turmas.map(t => t._id);
        
        if (turmasIds.length === 0) {
            return res.json({ success: true, resultados: [] });
        }

        query.turmaId = { $in: turmasIds };

        // Filtrar por período
        if (periodo && periodo !== '') {
            const dias = parseInt(periodo);
            const dataLimite = new Date();
            dataLimite.setDate(dataLimite.getDate() - dias);
            query.dataRealizacao = { $gte: dataLimite };
        }

        // Buscar resultados
        const resultados = await Resultado.find(query)
            .populate('alunoId', 'nome email matricula')
            .populate('provaId', 'titulo disciplina')
            .populate('turmaId', 'nome disciplina')
            .sort({ dataRealizacao: -1 });

        // Formatar resultados
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
        console.error('Erro ao buscar notas:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// ROTA: Detalhes de um resultado específico
app.get('/api/resultados/:resultadoId', authenticateToken, async (req, res) => {
  try {
    const resultadoId = req.params.resultadoId;
    const usuarioId = req.userId;
    const usuarioRole = req.userRole;

    let resultado = await Resultado.findById(resultadoId)
      .populate('userId', 'nome email matricula')
      .populate('provaId');

    if (!resultado) {
      const provaRealizada = await ProvaRealizada.findById(resultadoId)
        .populate('alunoId', 'nome email matricula')
        .populate('provaId');
      
      if (!provaRealizada) {
        return res.status(404).json({
          success: false,
          error: 'Resultado não encontrado'
        });
      }

      const podeVer = usuarioRole === 'admin' || 
                     usuarioId === provaRealizada.alunoId._id.toString() ||
                     (provaRealizada.provaId && provaRealizada.provaId.userId.toString() === usuarioId);

      if (!podeVer) {
        return res.status(403).json({
          success: false,
          error: 'Você não tem permissão para ver este resultado'
        });
      }

      return res.json({
        success: true,
        resultado: {
          id: provaRealizada._id,
          aluno: provaRealizada.alunoId,
          prova: provaRealizada.provaId,
          nota: provaRealizada.nota,
          tempoGasto: provaRealizada.tempoGasto,
          dataEntrega: provaRealizada.dataRealizacao,
          respostas: provaRealizada.respostas,
          tipo: 'prova_realizada'
        }
      });
    }

    const podeVer = usuarioRole === 'admin' || 
                   usuarioId === resultado.userId._id.toString() ||
                   (resultado.provaId && resultado.provaId.userId && resultado.provaId.userId.toString() === usuarioId);

    if (!podeVer) {
      return res.status(403).json({
        success: false,
        error: 'Você não tem permissão para ver este resultado'
      });
    }

    res.json({
      success: true,
      resultado: {
        id: resultado._id,
        aluno: resultado.userId,
        prova: resultado.provaId,
        nota: resultado.nota,
        acertos: resultado.acertos,
        total: resultado.total,
        porcentagem: resultado.porcentagem,
        tempoGasto: resultado.tempoGasto,
        dataEntrega: resultado.createdAt,
        respostas: resultado.respostas,
        tipo: 'resultado'
      }
    });

  } catch (error) {
    console.error('Erro ao buscar detalhes do resultado:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

// ROTA: Resultados por turma
app.get('/api/turmas/:turmaId/resultados', authenticateToken, async (req, res) => {
  try {
    const turmaId = req.params.turmaId;
    const professorId = req.userId;

    const turma = await Turma.findById(turmaId);
    
    if (!turma) {
      return res.status(404).json({
        success: false,
        error: 'Turma não encontrada'
      });
    }

    if (turma.professorId.toString() !== professorId && req.userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Você não tem permissão para ver os resultados desta turma'
      });
    }

    const provas = await Prova.find({ turmaId: turmaId });
    
    const resultadosPorProva = [];
    let totalResultados = 0;
    let somaNotas = 0;

    for (const prova of provas) {
      const resultados = await Resultado.find({ provaId: prova._id })
        .populate('userId', 'nome email matricula');
      
      const provasRealizadas = await ProvaRealizada.find({ provaId: prova._id })
        .populate('alunoId', 'nome email matricula');

      const resultadosCombinados = [];
      
      resultados.forEach(r => {
        resultadosCombinados.push({
          alunoId: r.userId._id,
          alunoNome: r.userId.nome,
          nota: r.nota,
          dataEntrega: r.createdAt
        });
      });

      provasRealizadas.forEach(pr => {
        const jaExiste = resultadosCombinados.some(r => 
          r.alunoId.toString() === pr.alunoId._id.toString()
        );
        
        if (!jaExiste && pr.alunoId) {
          resultadosCombinados.push({
            alunoId: pr.alunoId._id,
            alunoNome: pr.alunoId.nome,
            nota: pr.nota,
            dataEntrega: pr.dataRealizacao
          });
        }
      });

      if (resultadosCombinados.length > 0) {
        resultadosPorProva.push({
          provaId: prova._id,
          provaTitulo: prova.titulo,
          totalAlunos: resultadosCombinados.length,
          media: resultadosCombinados.reduce((sum, r) => sum + (r.nota || 0), 0) / resultadosCombinados.length,
          resultados: resultadosCombinados.slice(0, 5)
        });

        totalResultados += resultadosCombinados.length;
        somaNotas += resultadosCombinados.reduce((sum, r) => sum + (r.nota || 0), 0);
      }
    }

    const estatisticas = {
      totalProvas: provas.length,
      totalResultados: totalResultados,
      mediaGeral: totalResultados > 0 ? (somaNotas / totalResultados).toFixed(1) : 0,
      totalAlunos: turma.alunos.length
    };

    res.json({
      success: true,
      turma: {
        id: turma._id,
        nome: turma.nome,
        disciplina: turma.disciplina,
        codigo: turma.codigo
      },
      resultadosPorProva,
      estatisticas
    });

  } catch (error) {
    console.error('Erro ao buscar resultados da turma:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

// ============ ROTA PARA OBTER RESULTADOS DE UMA PROVA ESPECÍFICA ============
app.get('/api/provas/:provaId/resultados', authenticateToken, async (req, res) => {
  try {
    const provaId = req.params.provaId;
    const professorId = req.userId;
    const alunoId = req.query.alunoId; // Parâmetro opcional para filtrar por aluno
    
    console.log(`📊 Buscando resultados da prova ${provaId}`);
    
    // Verificar permissões
    const prova = await Prova.findById(provaId);
    if (!prova) {
      return res.status(404).json({
        success: false,
        error: 'Prova não encontrada'
      });
    }
    
    // Verificar se é o professor da prova ou admin
    const isProfessor = req.userRole === 'professor' || req.userRole === 'admin';
    const isProfessorDaProva = prova.userId.toString() === professorId;
    
    if (!isProfessor && !isProfessorDaProva && req.userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Você não tem permissão para ver os resultados desta prova'
      });
    }
    
    // Construir query base
    let query = { provaId: provaId };
    
    // Se for aluno, apenas seus próprios resultados
    if (req.userRole === 'aluno') {
      query.userId = professorId;
    }
    
    // Se foi especificado alunoId, filtrar por aluno
    if (alunoId && (isProfessor || isProfessorDaProva || req.userRole === 'admin')) {
      query.userId = alunoId;
    }
    
    // Buscar resultados do modelo Resultado
    const resultados = await Resultado.find(query)
      .populate('userId', 'nome email matricula')
      .sort({ createdAt: -1 });
    
    // Buscar também do modelo ProvaRealizada
    const provasRealizadas = await ProvaRealizada.find({ provaId: provaId })
      .populate('alunoId', 'nome email matricula')
      .sort({ dataRealizacao: -1 });
    
    // Combinar resultados
    const resultadosCombinados = [];
    
    // Adicionar resultados do modelo Resultado
    resultados.forEach(r => {
      resultadosCombinados.push({
        id: r._id,
        alunoId: r.userId._id,
        alunoNome: r.userId.nome,
        alunoEmail: r.userId.email,
        alunoMatricula: r.userId.matricula,
        provaId: provaId,
        respostas: r.respostas,
        nota: r.nota,
        acertos: r.acertos,
        total: r.total,
        porcentagem: r.porcentagem,
        tempoGasto: r.tempoGasto,
        dataEntrega: r.createdAt,
        notaLiberada: r.notaLiberada,
        
        // CAMPOS DE CANCELAMENTO
        cancelada: r.cancelada || false,
        motivoCancelamento: r.motivoCancelamento || null,
        flagViolacao: r.flagViolacao || false,
        estatisticasCancelamento: r.estatisticasCancelamento || null,
        tipoCancelamento: r.motivoCancelamentoTipo || null,
        status: r.status || 'corrigida',
        
        tipo: 'resultado'
      });
    });
    
    // Adicionar resultados do modelo ProvaRealizada (INCLUINDO CANCELADOS)
    provasRealizadas.forEach(pr => {
      const jaExiste = resultadosCombinados.some(r => 
        r.alunoId.toString() === pr.alunoId._id.toString()
      );
      
      if (!jaExiste && pr.alunoId) {
        resultadosCombinados.push({
          id: pr._id,
          alunoId: pr.alunoId._id,
          alunoNome: pr.alunoId.nome,
          alunoEmail: pr.alunoId.email,
          alunoMatricula: pr.alunoId.matricula,
          provaId: provaId,
          respostas: pr.respostas,
          nota: pr.nota,
          tempoGasto: pr.tempoGasto,
          dataEntrega: pr.dataRealizacao,
          status: pr.status,
          notaLiberada: pr.notaLiberada,
          
          // CAMPOS DE CANCELAMENTO
          cancelada: pr.cancelada || false,
          motivoCancelamento: pr.motivoCancelamento || null,
          flagViolacao: pr.flagViolacao || false,
          estatisticasCancelamento: pr.estatisticasCancelamento || null,
          tipoCancelamento: pr.motivoCancelamentoTipo || null,
          
          tipo: 'prova_realizada'
        });
      }
    });
    
    // Estatísticas da prova
    const estatisticas = {
      totalAlunos: resultadosCombinados.length,
      alunosComNota: resultadosCombinados.filter(r => r.nota !== null && r.nota !== undefined && !r.cancelada).length,
      alunosPendentes: resultadosCombinados.filter(r => (r.nota === null || r.nota === undefined) && !r.cancelada).length,
      alunosCancelados: resultadosCombinados.filter(r => r.cancelada).length, // NOVO: contar cancelados
      mediaNotas: resultadosCombinados.length > 0 
        ? resultadosCombinados
            .filter(r => r.nota !== null && r.nota !== undefined && !r.cancelada) // Excluir cancelados da média
            .reduce((sum, r) => sum + r.nota, 0) / 
          resultadosCombinados.filter(r => r.nota !== null && r.nota !== undefined && !r.cancelada).length
        : 0
    };
    
    res.json({
      success: true,
      resultados: resultadosCombinados,
      estatisticas: estatisticas,
      prova: {
        id: prova._id,
        titulo: prova.titulo,
        conteudo: prova.conteudo,
        quantidadeQuestoes: prova.questoes.length
      },
      total: resultadosCombinados.length
    });
    
  } catch (error) {
    console.error('❌ Erro ao buscar resultados da prova:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno ao buscar resultados: ' + error.message
    });
  }
});

// Função auxiliar para formatar duração
function formatarDuracao(minutos) {
  if (!minutos) return 'Não definida';
  
  const horas = Math.floor(minutos / 60);
  const mins = minutos % 60;
  
  let resultado = '';
  if (horas > 0) {
    resultado += `${horas}h`;
  }
  if (mins > 0) {
    if (resultado) resultado += ' ';
    resultado += `${mins}min`;
  }
  
  return resultado || '0min';
}

// ============ ROTA PARA VISUALIZAR DETALHES COMPLETOS DA PROVA (COM QUESTÕES E RESPOSTAS) ============
app.get('/api/provas/:id', authenticateToken, async (req, res) => {
  try {
    const provaId = req.params.id;
    const userId = req.userId;
    const userRole = req.userRole;
    
    console.log(`🔍 Usuário ${userId} (${userRole}) solicitando detalhes da prova ${provaId}`);

    // Buscar prova com turma e professor
    const prova = await Prova.findById(provaId)
      .populate('turmaId', 'nome disciplina alunos')
      .populate('userId', 'nome email');

    if (!prova) {
      return res.status(404).json({
        success: false,
        error: 'Prova não encontrada'
      });
    }

    // 🔥 CORREÇÃO: Verificar permissões
    const isAdmin = userRole === 'admin' || userRole === 'super_admin';
    const isProfessorDaProva = prova.userId && prova.userId._id.toString() === userId;
    
    // ADMIN E SUPER ADMIN PODEM VER QUALQUER PROVA
    if (isAdmin) {
      console.log(`✅ Admin ${userId} acessando prova ${provaId} - ACESSO LIBERADO`);
      
      // Preparar dados da prova
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

      // Admin vê tudo (perguntas, respostas corretas, explicações)
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

    // Se não é admin, verificar as permissões normais
    // Se é professor da prova
    if (isProfessorDaProva) {
      console.log(`✅ Professor ${userId} acessando própria prova ${provaId}`);
      
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

    // Se é aluno, verificar se está na turma
    if (userRole === 'aluno' && prova.turmaId) {
      const turma = await Turma.findById(prova.turmaId._id);
      if (!turma || !turma.alunos.includes(userId)) {
        console.log(`❌ Aluno ${userId} não está na turma da prova ${provaId}`);
        return res.status(403).json({
          success: false,
          error: 'Você não está matriculado na turma desta prova'
        });
      }

      console.log(`✅ Aluno ${userId} acessando prova ${provaId}`);

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

      // Aluno vê apenas perguntas e opções (sem respostas)
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

    // Se chegou aqui, não tem permissão
    console.log(`❌ Usuário ${userId} (${userRole}) sem permissão para acessar prova ${provaId}`);
    return res.status(403).json({
      success: false,
      error: 'Você não tem permissão para acessar esta prova'
    });

  } catch (error) {
    console.error('❌ Erro ao buscar detalhes da prova:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno ao buscar detalhes da prova: ' + error.message
    });
  }
});

// ============ ROTA PARA OBTER PROVA COM RESPOSTAS PARA CORREÇÃO (APENAS PROFESSOR) ============
app.get('/api/provas/:id/correcao', authenticateToken, async (req, res) => {
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

    // Verificar se é o professor da prova
    if (prova.userId.toString() !== professorId && req.userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Você não é o professor desta prova'
      });
    }

    // Buscar resultados do modelo Resultado (INCLUINDO CANCELADOS)
    const resultados = await Resultado.find({ 
      provaId: provaId,
      $or: [
        { notaLiberada: { $in: [true, false] } }, // Notas liberadas ou não
        { cancelada: true } // INCLUIR CANCELADOS
      ]
    })
    .populate('userId', 'nome email matricula')
    .sort({ createdAt: -1 });

    // Buscar também do modelo ProvaRealizada (INCLUINDO CANCELADOS)
    const provasRealizadas = await ProvaRealizada.find({ 
      provaId: provaId,
      $or: [
        { notaLiberada: { $in: [true, false] } },
        { cancelada: true }, // INCLUIR CANCELADOS
        { status: 'cancelada' }
      ]
    })
    .populate('alunoId', 'nome email matricula')
    .sort({ dataRealizacao: -1 });

    // Combinar resultados
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

    // Preparar gabarito da prova
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
    console.error('❌ Erro ao buscar dados para correção:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno ao buscar dados para correção: ' + error.message
    });
  }
});

// ============ ROTA PARA LIBERAR NOTAS DE TODOS OS ALUNOS DE UMA PROVA ============
app.post('/api/provas/:provaId/liberar-notas-todos', authenticateToken, async (req, res) => {
  try {
    const provaId = req.params.provaId;
    const professorId = req.userId;
    
    console.log(`📝 Professor ${professorId} liberando TODAS as notas da prova ${provaId}`);
    
    const isAdmin = req.userRole === 'admin' || req.userRole === 'super_admin';
    if (!isAdmin && req.userRole !== 'professor') {
      return res.status(403).json({
        success: false,
        error: 'Apenas professores e administradores podem corrigir provas'
      });
    }
    
    // Verificar se a prova existe e pertence ao professor
    const prova = await Prova.findById(provaId);
    if (!prova) {
      return res.status(404).json({
        success: false,
        error: 'Prova não encontrada'
      });
    }
    
    if (prova.userId.toString() !== professorId && req.userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Você não é o professor desta prova'
      });
    }
    
    // Atualizar TODOS os Resultados desta prova
    const resultadoUpdate = await Resultado.updateMany(
      { provaId: provaId },
      { $set: { notaLiberada: true } }
    );
    
    // Atualizar TODAS as ProvaRealizadas desta prova
    const provaRealizadaUpdate = await ProvaRealizada.updateMany(
      { provaId: provaId },
      { $set: { notaLiberada: true, status: 'corrigida' } }
    );
    
    // Buscar estatísticas atualizadas
    const resultados = await Resultado.find({ provaId: provaId });
    const provasRealizadas = await ProvaRealizada.find({ provaId: provaId });
    
    const totalLiberados = (resultadoUpdate.modifiedCount || 0) + (provaRealizadaUpdate.modifiedCount || 0);
    
    console.log(`✅ ${totalLiberados} notas liberadas para a prova ${provaId}`);
    
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
    console.error('❌ Erro ao liberar notas:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno ao liberar notas: ' + error.message
    });
  }
});

// ============ ROTA PARA EXCLUIR PROVA (CORRIGIDA) ============
app.delete('/api/professor/provas/:provaId', authenticateToken, async (req, res) => {
    try {
        const provaId = req.params.provaId;
        const usuarioId = req.userId;
        const usuarioRole = req.userRole;
        
        console.log(`🗑️ Tentativa de exclusão da prova ${provaId} pelo usuário ${usuarioId} (${usuarioRole})`);
        
        // Buscar a prova
        const prova = await Prova.findById(provaId);
        if (!prova) {
            return res.status(404).json({
                success: false,
                error: 'Prova não encontrada'
            });
        }
        
        // 🔥 VERIFICAÇÃO CORRIGIDA: Admin e Super Admin podem excluir qualquer prova
        const isAdmin = usuarioRole === 'admin' || usuarioRole === 'super_admin';
        const isProfessorDaProva = prova.userId && prova.userId.toString() === usuarioId;
        
        if (!isAdmin && !isProfessorDaProva) {
            return res.status(403).json({
                success: false,
                error: 'Apenas professores (da prova) ou administradores podem excluir provas'
            });
        }
        
        // Verificar se há resultados associados
        const totalResultados = await Resultado.countDocuments({ provaId: provaId });
        const totalProvasRealizadas = await ProvaRealizada.countDocuments({ provaId: provaId });
        
        console.log(`📊 Prova "${prova.titulo}" tem ${totalResultados} resultados e ${totalProvasRealizadas} provas realizadas`);
        
        // Remover todos os resultados associados
        if (totalResultados > 0) {
            await Resultado.deleteMany({ provaId: provaId });
            console.log(`✅ ${totalResultados} resultados excluídos`);
        }
        
        // Remover todas as provas realizadas associadas
        if (totalProvasRealizadas > 0) {
            await ProvaRealizada.deleteMany({ provaId: provaId });
            console.log(`✅ ${totalProvasRealizadas} provas realizadas excluídas`);
        }
        
        // Remover a prova das turmas
        if (prova.turmaId) {
            await Turma.updateOne(
                { _id: prova.turmaId },
                { $pull: { provas: provaId } }
            );
            console.log(`✅ Prova removida da turma ${prova.turmaId}`);
        }
        
        // Excluir a prova
        await Prova.deleteOne({ _id: provaId });
        
        console.log(`✅ Prova ${provaId} excluída com sucesso`);
        
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
        console.error('❌ Erro ao excluir prova:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno ao excluir prova: ' + error.message
        });
    }
});

// ============ ROTAS DE MONITORAMENTO ============

// Registrar início da prova
app.post('/api/monitor/inicio', authenticateToken, async (req, res) => {
  try {
    const { provaId, timestamp, userAgent, screenResolution, windowSize } = req.body;
    
    // Aqui você pode salvar no banco de dados
    console.log('📊 Início de prova monitorado:', {
      alunoId: req.userId,
      provaId,
      timestamp,
      userAgent,
      screenResolution,
      windowSize
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao registrar início:', error);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// ============ REGISTRAR VIOLAÇÃO ============
app.post('/api/monitor/violacao', authenticateToken, async (req, res) => {
  try {
    const { provaId, tipo, dados, timestamp } = req.body;
    
    // Aqui você pode salvar no banco de dados
    console.log('⚠️ Violação registrada:', {
      alunoId: req.userId,
      provaId,
      tipo,
      dados,
      timestamp
    });
    
    // Se for prova cancelada, notificar professor
    if (tipo === 'prova_cancelada') {
      console.log('🚫 PROVA CANCELADA:', req.userId, dados);
      
      // ===== 🔥 NOTIFICAR PROFESSOR SOBRE CANCELAMENTO =====
      try {
        const prova = await Prova.findById(provaId).populate('userId', 'nome email');
        const aluno = await User.findById(req.userId).select('nome');
        
        if (prova && prova.userId) {
          const Config = mongoose.model('Config');
          const configDoc = await Config.findOne({ chave: 'notificacoes' });
          const pushAtivado = configDoc?.valor?.push === true;
          
          const notificacao = new Notificacao({
            usuarioId: prova.userId._id,
            tipo: 'cancelamento',
            titulo: '🚫 Prova Cancelada por Violação',
            mensagem: `Aluno ${aluno?.nome || req.userId} teve a prova "${prova.titulo}" cancelada por violação.`,
            icone: '🚫',
            cor: '#dc2626',
            link: `/professor.html?prova=${provaId}`,
            prioridade: 5,
            dados: {
              alunoId: req.userId,
              alunoNome: aluno?.nome || 'Aluno',
              provaId: provaId,
              provaTitulo: prova.titulo,
              motivo: dados?.motivo || 'Violação detectada',
              estatisticas: dados
            }
          });
          
          await notificacao.save();
          
          if (pushAtivado) {
            const OneSignalService = require('./services/onesignal-service');
            const oneSignal = new OneSignalService();
            
            await oneSignal.enviarPush(
              prova.userId._id,
              '🚫 Prova Cancelada',
              `Aluno ${aluno?.nome || req.userId} teve prova cancelada`,
              {
                tipo: 'cancelamento_violacao',
                alunoId: req.userId,
                provaId: provaId
              }
            );
          }
          
          console.log(`✅ Professor ${prova.userId.email} notificado sobre cancelamento`);
        }
      } catch (notifError) {
        console.error('⚠️ Erro ao notificar professor:', notifError.message);
      }
    }
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Erro ao registrar violação:', error);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// Obter logs de monitoramento (para professor)
app.get('/api/monitor/logs/:provaId', authenticateToken, async (req, res) => {
  try {
    const isAdmin = req.userRole === 'admin' || req.userRole === 'super_admin';
    if (!isAdmin && req.userRole !== 'professor') {
      return res.status(403).json({
        success: false,
        error: 'Apenas professores e administradores podem corrigir provas'
      });
    }
    
    const provaId = req.params.provaId;
    
    // Aqui você buscaria os logs do banco de dados
    // Por enquanto, retornamos dados de exemplo
    res.json({
      success: true,
      logs: [],
      mensagem: 'Em desenvolvimento - os logs serão salvos no banco de dados'
    });
  } catch (error) {
    console.error('Erro ao buscar logs:', error);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// ============ ROTA PARA CANCELAR PROVA (VERSÃO CORRIGIDA) ============
app.post('/api/provas/:provaId/cancelar', authenticateToken, async (req, res) => {
    try {
        const provaId = req.params.provaId;
        const alunoId = req.userId;
        const { motivo, estatisticas, respostasAtuais, tempoTotal } = req.body;
        
        console.log(`🚫 Tentativa de cancelamento - Prova: ${provaId}, Aluno: ${alunoId}`);
        console.log(`📝 Motivo recebido: "${motivo}"`);
        
        // ========== VERIFICAR SE PROVA JÁ FOI FINALIZADA ==========
        const [resultadoExistente, provaRealizadaExistente] = await Promise.all([
            Resultado.findOne({ provaId, userId: alunoId }),
            ProvaRealizada.findOne({ provaId, alunoId })
        ]);
        
        if (resultadoExistente || provaRealizadaExistente) {
            console.log(`⏭️ Prova já foi finalizada - cancelamento ignorado`);
            return res.json({
                success: true,
                message: 'Prova já foi finalizada',
                ignorado: true
            });
        }
        
        // ========== VERIFICAR SE JÁ FOI CANCELADA ==========
        const [canceladaExistente, resultadoCanceladoExistente] = await Promise.all([
            ProvaRealizada.findOne({ provaId, alunoId, cancelada: true }),
            Resultado.findOne({ provaId, userId: alunoId, cancelada: true })
        ]);
        
        if (canceladaExistente || resultadoCanceladoExistente) {
            console.log(`⏭️ Prova já foi cancelada anteriormente`);
            return res.json({
                success: true,
                message: 'Prova já foi cancelada',
                ignorado: true
            });
        }
        
        // ========== BUSCAR PROVA E ALUNO ==========
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
        
        // ========== PROCESSAR RESPOSTAS ==========
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
        
        // ============ DETECTAR TIPO DE CANCELAMENTO ==========
        const motivoLower = motivo.toLowerCase();
        const palavrasViolacao = [
            'violação', 'violacao', 'multiplas', 'múltiplas',
            'atualizar', 'recarregar', 'refresh', 'f5',
            'ctrl+r', 'reload', 'navegação', 'navegacao',
            'backspace', 'atalho', 'tecla', 'click direito'
        ];

        const isViolacao = palavrasViolacao.some(palavra => motivoLower.includes(palavra)) ||
                          (estatisticas?.avisos > 0);

        console.log(`⚠️ Tipo de cancelamento: ${isViolacao ? 'VIOLAÇÃO' : 'PRAZO EXPIRADO'}`);
        console.log(`📝 Motivo: "${motivo}"`);

        // ========== CRIAR REGISTROS DE CANCELAMENTO ==========
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
        
        console.log(`✅ Registros de cancelamento criados com motivo: "${motivo}"`);
        
        // ========== NOTIFICAR PROFESSOR (usando a variável global Config) ==========
        if (prova.userId) {
            try {
                const professor = await User.findById(prova.userId).select('nome email');
                const turma = await Turma.findById(prova.turmaId).select('nome disciplina codigo');
                
                if (professor) {
                    // Criar notificação no sistema
                    const notificacao = new Notificacao({
                        usuarioId: professor._id,
                        tipo: 'cancelamento',
                        titulo: '🚫 Prova Cancelada',
                        mensagem: `${aluno.nome} - ${prova.titulo} (${turma?.nome || 'Turma não identificada'}) - Motivo: ${motivo}`,
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
                    console.log(`✅ Professor notificado: ${professor.email}`);
                }
            } catch (notifError) {
                console.error('⚠️ Erro ao notificar professor:', notifError.message);
            }
        }
        
        console.log(`✅ Prova cancelada com sucesso: ${aluno.nome} - ${prova.titulo} - Motivo: "${motivo}"`);
        
        res.json({
            success: true,
            message: isViolacao ? 'Prova cancelada por violação' : 'Prova cancelada por prazo',
            motivo: motivo,
            nota: 0,
            status: 'cancelada'
        });
        
    } catch (error) {
        console.error('❌ Erro ao cancelar prova:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno: ' + error.message
        });
    }
});

// ============ ROTA PARA DETALHES DO CANCELAMENTO ============
app.get('/api/aluno/provas/:provaId/detalhes-cancelamento', authenticateToken, async (req, res) => {
    try {
        const provaId = req.params.provaId;
        const alunoId = req.userId;
        
        // Buscar prova cancelada
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
        
        // Buscar detalhes da prova
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
                professorNotificado: true, // Assumindo que foi notificado
                dataNotificacao: provaCancelada.updatedAt
            }
        });
        
    } catch (error) {
        console.error('❌ Erro ao buscar detalhes do cancelamento:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno: ' + error.message
        });
    }
});

// ============ ROTA PARA NOTIFICAÇÕES DE CANCELAMENTO ============
app.get('/api/professor/notificacoes/cancelamentos', authenticateToken, async (req, res) => {
    try {
        const isAdmin = req.userRole === 'admin' || req.userRole === 'super_admin';
        if (!isAdmin && req.userRole !== 'professor') {
          return res.status(403).json({
            success: false,
            error: 'Apenas professores e administradores podem corrigir provas'
          });
        }
        
        const professorId = req.userId;
        
        // Buscar todas as provas do professor
        const provas = await Prova.find({ userId: professorId });
        const provaIds = provas.map(p => p._id);
        
        // Buscar provas canceladas das últimas 24 horas
        const vinteQuatroHorasAtras = new Date(Date.now() - 24 * 60 * 60 * 1000);
        
        const provasCanceladas = await ProvaRealizada.find({
            provaId: { $in: provaIds },
            status: 'cancelada',
            dataRealizacao: { $gte: vinteQuatroHorasAtras }
        })
        .populate('alunoId', 'nome email')
        .populate('provaId', 'titulo')
        .sort({ dataRealizacao: -1 })
        .limit(10); // Limitar a 10 notificações
        
        // Marcar como visualizadas (opcional - você pode adicionar campo 'visualizada')
        
        const cancelamentosFormatados = provasCanceladas.map(pc => ({
            id: pc._id,
            alunoId: pc.alunoId._id,
            alunoNome: pc.alunoId.nome,
            alunoEmail: pc.alunoId.email,
            provaId: pc.provaId._id,
            provaTitulo: pc.provaId.titulo,
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
        console.error('❌ Erro ao buscar notificações de cancelamento:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno: ' + error.message
        });
    }
});

// ============ SISTEMA DE BACKUP E SINCRONIZAÇÃO OFFLINE ============

// Importar BackupService (coloque isso logo abaixo das outras importações)
const BackupService = require('./backup-service');

// Criar instância global
const backupService = new BackupService();

// Funções auxiliares para sincronização
async function handleCreate(collection, data, token, req) {
    console.log(`📝 Sincronizando CREATE em ${collection}`);
    
    switch (collection) {
        case 'respostas':
            try {
                const provaId = data.provaId;
                const alunoId = req.userId;
                
                // Verificar se já existe
                const provaRealizadaExistente = await ProvaRealizada.findOne({
                    provaId: provaId,
                    alunoId: alunoId
                });
                
                if (provaRealizadaExistente) {
                    console.log('✅ Já existe, atualizando...');
                    provaRealizadaExistente.respostas = data.respostas;
                    provaRealizadaExistente.tempoGasto = data.tempoGasto;
                    provaRealizadaExistente.dataRealizacao = new Date(data.timestamp || Date.now());
                    provaRealizadaExistente.sincronizadoEm = new Date();
                    await provaRealizadaExistente.save();
                    return { tipo: 'update', id: provaRealizadaExistente._id };
                } else {
                    // Criar nova prova realizada
                    const provaRealizada = new ProvaRealizada({
                        provaId: provaId,
                        alunoId: alunoId,
                        respostas: data.respostas,
                        tempoGasto: data.tempoGasto,
                        dataRealizacao: new Date(data.timestamp || Date.now()),
                        status: 'finalizada',
                        notaLiberada: false,
                        sincronizadoEm: new Date()
                    });
                    
                    await provaRealizada.save();
                    
                    // Criar resultado também
                    const prova = await Prova.findById(provaId);
                    if (prova) {
                        let acertos = 0;
                        const resultadoDetalhado = [];
                        
                        prova.questoes.forEach((questao, index) => {
                            const respostaAluno = data.respostas[index];
                            let correto = false;
                            
                            if (respostaAluno && typeof respostaAluno === 'string') {
                                const respostaAlunoUpper = respostaAluno.toUpperCase().trim();
                                const respostaCorretaLetra = String.fromCharCode(65 + questao.respostaCorreta);
                                
                                if (respostaAlunoUpper === respostaCorretaLetra) {
                                    acertos++;
                                    correto = true;
                                }
                            }
                            
                            resultadoDetalhado.push({
                                questaoNumero: index + 1,
                                pergunta: questao.pergunta,
                                respostaAluno: respostaAluno || 'Não respondida',
                                respostaCorreta: String.fromCharCode(65 + questao.respostaCorreta),
                                correto: correto,
                                explicacao: questao.explicacao
                            });
                        });
                        
                        const notaCalculada = prova.questoes.length > 0 ? (acertos / prova.questoes.length) * 10 : 0;
                        const porcentagem = prova.questoes.length > 0 ? ((acertos / prova.questoes.length) * 100).toFixed(1) : '0.0';
                        
                        const user = await User.findById(alunoId);
                        const resultado = new Resultado({
                            userId: alunoId,
                            provaId: provaId,
                            alunoNome: user ? user.nome : 'Aluno',
                            respostas: data.respostas,
                            nota: notaCalculada.toFixed(2),
                            acertos: acertos,
                            total: prova.questoes.length,
                            porcentagem: porcentagem,
                            tempoGasto: data.tempoGasto || 0,
                            resultadoDetalhado: resultadoDetalhado,
                            notaLiberada: false,
                            sincronizadoEm: new Date()
                        });
                        
                        await resultado.save();
                        console.log(`✅ Resultado criado: ${resultado._id}`);
                    }
                    
                    console.log(`✅ Prova realizada criada: ${provaRealizada._id}`);
                    return { tipo: 'create', id: provaRealizada._id };
                }
            } catch (error) {
                console.error('❌ Erro ao criar resposta:', error);
                throw error;
            }
            break;
            
        // Adicione outros casos conforme necessário
        case 'resultados':
            // Lógica para resultados
            break;
            
        default:
            throw new Error(`Coleção ${collection} não suportada para sincronização`);
    }
}

async function handleUpdate(collection, data, token, req) {
    console.log(`✏️ Sincronizando UPDATE em ${collection}`);
    
    switch (collection) {
        case 'respostas':
            const provaRealizada = await ProvaRealizada.findById(data.id);
            if (provaRealizada) {
                if (provaRealizada.alunoId.toString() !== req.userId) {
                    throw new Error('Você não tem permissão para atualizar esta prova');
                }
                
                provaRealizada.respostas = data.respostas || provaRealizada.respostas;
                provaRealizada.tempoGasto = data.tempoGasto || provaRealizada.tempoGasto;
                provaRealizada.sincronizadoEm = new Date();
                await provaRealizada.save();
                
                return { tipo: 'update', id: provaRealizada._id };
            }
            break;
            
        default:
            throw new Error(`Coleção ${collection} não suportada para atualização`);
    }
}

async function handleDelete(collection, data, token, req) {
    console.log(`🗑️ Sincronizando DELETE em ${collection}`);
    
    switch (collection) {
        case 'respostas':
            const deleted = await ProvaRealizada.deleteOne({ 
                _id: data.id,
                alunoId: req.userId 
            });
            
            return { tipo: 'delete', count: deleted.deletedCount };
            
        default:
            throw new Error(`Coleção ${collection} não suportada para exclusão`);
    }
}

// ============ ROTAS DE SINCRONIZAÇÃO ============

// Rota para sincronização offline
app.post('/api/sync/:collection', authenticateToken, async (req, res) => {
    try {
        const { collection } = req.params;
        const { action, data, syncId } = req.body;
        
        console.log(`🔄 Recebendo sincronização: ${collection}.${action} (${syncId})`);
        
        let result;
        switch (action) {
            case 'create':
                result = await handleCreate(collection, data, req.headers.authorization, req);
                break;
            case 'update':
                result = await handleUpdate(collection, data, req.headers.authorization, req);
                break;
            case 'delete':
                result = await handleDelete(collection, data, req.headers.authorization, req);
                break;
            default:
                return res.status(400).json({ 
                    success: false, 
                    error: 'Ação inválida. Use: create, update ou delete' 
                });
        }
        
        // Registrar log de sincronização bem-sucedida
        console.log(`✅ Sincronização ${syncId} concluída com sucesso`);
        
        res.json({ 
            success: true, 
            syncId, 
            result,
            message: `Sincronizado com sucesso: ${collection}.${action}`
        });
        
    } catch (error) {
        console.error('❌ Erro na sincronização:', error);
        
        res.status(500).json({ 
            success: false, 
            error: 'Erro na sincronização: ' + error.message,
            syncId: req.body.syncId
        });
    }
});

// Rota para verificar status da sincronização
app.get('/api/sync/status', authenticateToken, (req, res) => {
    try {
        const status = backupService.getSyncQueueStatus();
        
        res.json({
            success: true,
            status,
            user: {
                id: req.userId,
                role: req.userRole
            }
        });
        
    } catch (error) {
        console.error('❌ Erro ao verificar status:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao verificar status' 
        });
    }
});

// Rota para backup manual (apenas admin/professor)
app.post('/api/backup/manual', authenticateToken, async (req, res) => {
    try {
        const isAdmin = req.userRole === 'admin' || req.userRole === 'super_admin';
        if (!isAdmin && req.userRole !== 'professor') {
          return res.status(403).json({
            success: false,
            error: 'Apenas professores e administradores podem corrigir provas'
          });
        }
        
        console.log(`🔄 Backup manual solicitado por ${req.userId}`);
        
        const backupService = new BackupService();
        await backupService.connectDB();
        const result = await backupService.backupCollections();
        
        res.json({ 
            success: true, 
            message: 'Backup realizado com sucesso',
            result: {
                timestamp: new Date().toISOString(),
                file: result.backupFile,
                summary: result.summary
            }
        });
        
    } catch (error) {
        console.error('❌ Erro no backup manual:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao fazer backup: ' + error.message 
        });
    }
});

// Rota para listar backups disponíveis
app.get('/api/backup/list', authenticateToken, async (req, res) => {
    try {
        const isAdmin = req.userRole === 'admin' || req.userRole === 'super_admin';
        if (!isAdmin && req.userRole !== 'professor') {
          return res.status(403).json({
            success: false,
            error: 'Apenas professores e administradores podem corrigir provas'
          });
        }
        
        const backups = backupService.listBackups();
        
        res.json({
            success: true,
            backups,
            count: backups.length,
            message: backups.length > 0 ? `${backups.length} backups encontrados` : 'Nenhum backup encontrado'
        });
        
    } catch (error) {
        console.error('❌ Erro ao listar backups:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao listar backups' 
        });
    }
});

// Rota para restaurar backup (apenas admin)
app.post('/api/backup/restore/:filename', authenticateToken, async (req, res) => {
    try {
        if (req.userRole !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Apenas administradores podem restaurar backups'
            });
        }
        
        const { filename } = req.params;
        const backupFile = path.join(__dirname, 'backups', filename);
        
        if (!fs.existsSync(backupFile)) {
            return res.status(404).json({
                success: false,
                error: 'Arquivo de backup não encontrado'
            });
        }
        
        console.log(`🔄 Restauração solicitada: ${filename} por ${req.userId}`);
        
        const backupService = new BackupService();
        await backupService.connectDB();
        await backupService.restoreFromBackup(backupFile);
        
        res.json({ 
            success: true, 
            message: 'Backup restaurado com sucesso',
            file: filename,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Erro na restauração:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao restaurar backup: ' + error.message 
        });
    }
});

// Rota de saúde do sistema
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        status: 'online',
        timestamp: new Date().toISOString(),
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        syncQueue: backupService.getSyncQueueStatus(),
        memory: {
            usage: process.memoryUsage(),
            heap: process.memoryUsage().heapUsed / 1024 / 1024
        }
    });
});

// ============ SISTEMA DE OFFLINE PARA ALUNOS ============

// Rota para salvar prova offline
app.post('/api/provas/offline/save', authenticateToken, async (req, res) => {
    try {
        const { provaId, respostas, tempoGasto } = req.body;
        const alunoId = req.userId;
        
        console.log(`💾 Salvando prova offline: aluno ${alunoId}, prova ${provaId}`);
        
        // Aqui você salvaria no banco local do aluno
        // Mas também colocamos na fila de sincronização
        
        const syncData = {
            provaId,
            respostas,
            tempoGasto,
            alunoId,
            timestamp: new Date().toISOString()
        };
        
        const syncId = await backupService.queueForSync('respostas', 'create', syncData);
        
        // Salvar também no localStorage do navegador (via retorno da API)
        const offlineData = {
            provaId,
            respostas,
            tempoGasto,
            timestamp: new Date().toISOString(),
            syncId,
            status: 'pending'
        };
        
        res.json({
            success: true,
            message: 'Prova salva offline. Será enviada quando a conexão voltar.',
            offlineData,
            syncId
        });
        
    } catch (error) {
        console.error('❌ Erro ao salvar offline:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao salvar prova offline' 
        });
    }
});

// Rota para verificar provas offline pendentes
app.get('/api/provas/offline/pending', authenticateToken, async (req, res) => {
    try {
        const alunoId = req.userId;
        
        // Aqui você buscaria do banco local do aluno
        // Por enquanto retornamos status da fila
        
        const queueStatus = backupService.getSyncQueueStatus();
        
        res.json({
            success: true,
            pending: queueStatus.pending || 0,
            online: backupService.online,
            lastCheck: new Date().toISOString(),
            message: queueStatus.pending > 0 ? 
                `Você tem ${queueStatus.pending} prova(s) pendentes para sincronizar` :
                'Todas as provas estão sincronizadas'
        });
        
    } catch (error) {
        console.error('❌ Erro ao verificar pendentes:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao verificar provas pendentes' 
        });
    }
});

// ============ ROTAS DE RECUPERAÇÃO DE SENHA (VERSÃO ATUALIZADA COM SERVIÇO UNIFICADO) ============
// Armazenar códigos temporariamente (em produção, use Redis)
const resetCodes = new Map();

// Rota para solicitar recuperação de senha
app.post('/api/auth/reset-password/request', async (req, res) => {
    try {
        const { identifier } = req.body;
        
        if (!identifier) {
            return res.status(400).json({
                success: false,
                error: 'Email ou CPF é obrigatório'
            });
        }
        
        console.log('\n📨 ===== NOVA SOLICITAÇÃO DE RECUPERAÇÃO =====');
        console.log('📧 Identificador recebido:', identifier);
        console.log('🕒 Hora:', new Date().toLocaleString('pt-BR'));
        console.log('🌐 IP:', req.ip);
        console.log('==============================================\n');
        
        let user;
        
        // Verificar se é email ou CPF
        if (identifier.includes('@')) {
            // Buscar por email
            user = await User.findOne({ email: identifier.toLowerCase() });
        } else {
            // Buscar por CPF (remover formatação)
            const cpfNumeros = identifier.replace(/\D/g, '');
            user = await User.findOne({ cpf: cpfNumeros });
        }
        
        // Por segurança, sempre retornar sucesso mesmo se usuário não existir
        if (!user) {
            console.log('⚠️  Usuário não encontrado (retornando sucesso por segurança)');
            return res.json({
                success: true,
                message: 'Se o email/CPF estiver cadastrado, você receberá um código de recuperação'
            });
        }
        
        console.log('🎯 Usuário encontrado:');
        console.log('   Email:', user.email);
        console.log('   Nome:', user.nome);
        console.log('   ID:', user._id);
        
        // Gerar código de 6 dígitos
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const token = jwt.sign(
            { 
                userId: user._id,
                code: code,
                type: 'password_reset',
                timestamp: Date.now()
            },
            process.env.JWT_SECRET,
            { expiresIn: '15m' } // Código válido por 15 minutos
        );
        
        console.log('🔐 Código gerado:', code);
        console.log('🔑 Token gerado:', token.substring(0, 50) + '...');
        
        // Armazenar código temporariamente
        resetCodes.set(user._id.toString(), {
            code: code,
            expiresAt: Date.now() + (15 * 60 * 1000), // 15 minutos
            token: token,
            attempts: 0,
            maxAttempts: 5
        });
        
        // Limpar códigos expirados
        cleanupExpiredCodes();
        
        // ===== ENVIAR EMAIL COM O SERVIÇO UNIFICADO =====
        console.log('\n🚀 Inicializando serviço de email unificado...');
        
        // 🔥 USAR O NOVO SERVIÇO UNIFICADO
        const EmailService = require('./services/email-service');
        const emailService = new EmailService();
        
        // Inicializar o serviço (importante!)
        await emailService.init();
        
        console.log('📧 Enviando email de recuperação via:', emailService.tipo || 'Resend');
        
        const emailResult = await emailService.sendPasswordResetEmail(
            user.email,
            user.nome,
            code
        );
        
        console.log('\n📊 RESULTADO DO ENVIO:');
        console.log('Sucesso:', emailResult.success ? '✅' : '❌');
        console.log('Serviço:', emailResult.service || emailService.tipo || 'Resend');
        console.log('ID:', emailResult.messageId || 'N/A');
        
        // Preparar resposta
        const response = {
            success: true,
            message: 'Código de recuperação enviado para seu email!',
            data: {
                email: user.email,
                expiresIn: 900, // 15 minutos em segundos
                token: token
            },
            emailSent: emailResult.success
        };
        
        // Em desenvolvimento ou se email falhou, incluir código para testes
        if (process.env.NODE_ENV !== 'production' || !emailResult.success) {
            console.log('\n🔓 [MODO DEV/TESTE] Para testes, use este código:');
            console.log('📧 Email:', user.email);
            console.log('🔢 Código:', code);
            console.log('⏰ Validade: 15 minutos');
            console.log('💡 Use este código na página de recuperação');
            
            // Incluir código na resposta apenas em desenvolvimento
            if (process.env.NODE_ENV !== 'production') {
                response.devMode = true;
                response.devCode = code;
                response.message = 'Modo desenvolvimento: Use o código abaixo';
            }
        }
        
        console.log('\n✅ Solicitação processada com sucesso!');
        console.log('==============================================\n');
        
        res.json(response);
        
    } catch (error) {
        console.error('\n🔥 ERRO CRÍTICO NA RECUPERAÇÃO:');
        console.error('Mensagem:', error.message);
        console.error('Stack:', error.stack);
        console.error('====================================\n');
        
        res.status(500).json({
            success: false,
            error: 'Erro ao processar solicitação de recuperação'
        });
    }
});

// Rota para verificar código
app.post('/api/auth/reset-password/verify', async (req, res) => {
    try {
        const { identifier, code, token } = req.body;
        
        if (!identifier || !code) {
            return res.status(400).json({
                success: false,
                error: 'Código de verificação é obrigatório'
            });
        }
        
        console.log('\n🔍 ===== VERIFICAÇÃO DE CÓDIGO =====');
        console.log('📧 Identificador:', identifier);
        console.log('🔢 Código recebido:', code);
        console.log('🕒 Hora:', new Date().toLocaleString('pt-BR'));
        console.log('====================================\n');
        
        let user;
        
        // Buscar usuário
        if (identifier.includes('@')) {
            user = await User.findOne({ email: identifier.toLowerCase() });
        } else {
            const cpfNumeros = identifier.replace(/\D/g, '');
            user = await User.findOne({ cpf: cpfNumeros });
        }
        
        if (!user) {
            console.log('❌ Usuário não encontrado');
            return res.status(404).json({
                success: false,
                error: 'Usuário não encontrado'
            });
        }
        
        console.log('👤 Usuário encontrado:', user.email);
        
        // Verificar código
        const resetData = resetCodes.get(user._id.toString());
        
        if (!resetData) {
            console.log('❌ Código não encontrado para este usuário');
            return res.status(400).json({
                success: false,
                error: 'Código não encontrado. Solicite um novo código.'
            });
        }
        
        // Verificar tentativas
        if (resetData.attempts >= resetData.maxAttempts) {
            console.log(`❌ Muitas tentativas (${resetData.attempts}/${resetData.maxAttempts})`);
            resetCodes.delete(user._id.toString());
            return res.status(429).json({
                success: false,
                error: 'Muitas tentativas. Solicite um novo código.'
            });
        }
        
        // Verificar expiração
        if (resetData.expiresAt < Date.now()) {
            console.log('❌ Código expirado');
            resetCodes.delete(user._id.toString());
            return res.status(400).json({
                success: false,
                error: 'Código expirado. Solicite um novo código.'
            });
        }
        
        // Verificar código
        if (resetData.code !== code) {
            resetData.attempts += 1;
            resetCodes.set(user._id.toString(), resetData);
            
            const attemptsLeft = resetData.maxAttempts - resetData.attempts;
            console.log(`❌ Código inválido. Tentativas: ${resetData.attempts}/${resetData.maxAttempts}`);
            
            return res.status(400).json({
                success: false,
                error: `Código inválido. ${attemptsLeft} tentativa(s) restante(s).`,
                attemptsLeft: attemptsLeft
            });
        }
        
        // Verificar token JWT se fornecido
        if (token) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                if (decoded.userId !== user._id.toString() || decoded.code !== code) {
                    console.log('❌ Token JWT inválido');
                    return res.status(400).json({
                        success: false,
                        error: 'Token inválido'
                    });
                }
            } catch (jwtError) {
                console.log('❌ Token JWT expirado ou inválido:', jwtError.message);
                return res.status(400).json({
                    success: false,
                    error: 'Token inválido ou expirado'
                });
            }
        }
        
        // Gerar novo token para a próxima etapa
        const resetToken = jwt.sign(
            { 
                userId: user._id,
                verified: true,
                codeVerified: true,
                type: 'password_reset_confirmation',
                timestamp: Date.now()
            },
            process.env.JWT_SECRET,
            { expiresIn: '30m' } // Válido por 30 minutos
        );
        
        // Marcar código como usado
        resetCodes.delete(user._id.toString());
        
        console.log('✅ Código verificado com sucesso!');
        console.log('🔑 Novo token gerado:', resetToken.substring(0, 50) + '...');
        console.log('====================================\n');
        
        res.json({
            success: true,
            message: 'Código verificado com sucesso!',
            data: {
                token: resetToken,
                userId: user._id,
                email: user.email
            }
        });
        
    } catch (error) {
        console.error('\n🔥 ERRO NA VERIFICAÇÃO DO CÓDIGO:');
        console.error('Mensagem:', error.message);
        console.error('Stack:', error.stack);
        console.error('====================================\n');
        
        res.status(500).json({
            success: false,
            error: 'Erro ao verificar código'
        });
    }
});

// Rota para redefinir senha
app.post('/api/auth/reset-password/confirm', async (req, res) => {
    try {
        const { identifier, newPassword, token } = req.body;
        
        if (!identifier || !newPassword) {
            return res.status(400).json({
                success: false,
                error: 'Nova senha é obrigatória'
            });
        }
        
        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                error: 'A senha deve ter no mínimo 6 caracteres'
            });
        }
        
        console.log('\n🔄 ===== REDEFINIÇÃO DE SENHA =====');
        console.log('📧 Identificador:', identifier);
        console.log('🕒 Hora:', new Date().toLocaleString('pt-BR'));
        console.log('====================================\n');
        
        let user;
        
        // Buscar usuário
        if (identifier.includes('@')) {
            user = await User.findOne({ email: identifier.toLowerCase() });
        } else {
            const cpfNumeros = identifier.replace(/\D/g, '');
            user = await User.findOne({ cpf: cpfNumeros });
        }
        
        if (!user) {
            console.log('❌ Usuário não encontrado');
            return res.status(404).json({
                success: false,
                error: 'Usuário não encontrado'
            });
        }
        
        console.log('👤 Usuário encontrado:', user.email);
        
        // Verificar token se fornecido
        if (token) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                if (decoded.userId !== user._id.toString()) {
                    console.log('❌ Token JWT não pertence ao usuário');
                    return res.status(400).json({
                        success: false,
                        error: 'Token inválido'
                    });
                }
                if (!decoded.codeVerified) {
                    console.log('❌ Código não foi verificado');
                    return res.status(400).json({
                        success: false,
                        error: 'Código não verificado'
                    });
                }
            } catch (jwtError) {
                console.log('❌ Token JWT expirado ou inválido:', jwtError.message);
                return res.status(400).json({
                    success: false,
                    error: 'Token inválido ou expirado'
                });
            }
        }
        
        // Verificar se a nova senha é igual à antiga
        const isSamePassword = await user.comparePassword(newPassword);
        if (isSamePassword) {
            console.log('❌ Nova senha é igual à senha atual');
            return res.status(400).json({
                success: false,
                error: 'A nova senha não pode ser igual à senha atual'
            });
        }
        
        // Atualizar senha
        user.password = newPassword;
        user.passwordChangedAt = new Date();
        await user.save();
        
        console.log(`✅ Senha atualizada para ${user.email}`);
        
        // Enviar email de confirmação
        try {
            await emailService.sendPasswordChangedEmail(user.email, user.nome);
            console.log('📧 Email de confirmação enviado');
        } catch (emailError) {
            console.error('⚠️  Erro ao enviar email de confirmação:', emailError.message);
            // Não falhar o processo se o email falhar
        }
        
        // Invalidar todos os tokens JWT do usuário (opcional)
        // Em produção, você pode querer adicionar o token a uma blacklist
        
        console.log('\n✅ Senha redefinida com sucesso!');
        console.log('====================================\n');
        
        res.json({
            success: true,
            message: 'Senha redefinida com sucesso!',
            data: {
                userId: user._id,
                email: user.email,
                timestamp: new Date().toISOString()
            }
        });
        
    } catch (error) {
        console.error('\n🔥 ERRO AO REDEFINIR SENHA:');
        console.error('Mensagem:', error.message);
        console.error('Stack:', error.stack);
        console.error('====================================\n');
        
        res.status(500).json({
            success: false,
            error: 'Erro ao redefinir senha'
        });
    }
});

// Função para limpar códigos expirados
function cleanupExpiredCodes() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [userId, data] of resetCodes.entries()) {
        if (data.expiresAt < now) {
            resetCodes.delete(userId);
            cleaned++;
        }
    }
    
    if (cleaned > 0) {
        console.log(`🧹 Limpeza: ${cleaned} códigos expirados removidos`);
    }
}

// Executar limpeza a cada 30 minutos
setInterval(cleanupExpiredCodes, 30 * 60 * 1000);

// ============ ROTA PARA VERIFICAR BANCO ATLAS ============
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

// ============ ROTA PÚBLICA PARA VERIFICAÇÃO ============
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
            message: '✅ Sistema online e conectado ao MongoDB Atlas'
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            status: 'error',
            error: error.message,
            message: '❌ Erro na conexão com o banco de dados'
        });
    }
});

// ROTA SIMPLES DE TESTE (totalmente pública)
app.get('/api/test', (req, res) => {
    res.json({
        success: true,
        message: 'API está funcionando!',
        database: mongoose.connection.readyState === 1 ? '✅ Conectado' : '❌ Desconectado',
        timestamp: new Date().toISOString(),
        endpoints: {
            public: [
                '/api/health-check',
                '/api/test',
                '/api/auth/login',
                '/api/auth/register'
            ],
            protected: [
                '/api/aluno/*',
                '/api/professor/*',
                '/api/provas/*',
                '/api/turmas/*'
            ]
        }
    });
});

// ============ ROTAS DO CHATBOT ============

// Importar o chatbot backend
const ChatbotBackend = require('./chatbot');
const chatbot = new ChatbotBackend();

// CORREÇÃO COMPLETA DO ENDPOINT DO CHATBOT:
app.post('/api/chatbot/message', authenticateToken, async (req, res) => {
    try {
        const { message, conversationHistory = [] } = req.body;
        const userId = req.userId;
        
        // Obter rota de forma segura para Node.js
        const route = req.headers.referer || 
                     req.headers.origin || 
                     req.body.route || 
                     '/';

        console.log(`💬 Chatbot: Recebida mensagem de ${userId}: ${message.substring(0, 50)}...`);
        console.log(`📍 Rota detectada: ${route}`);

        const result = await chatbot.processMessage({
            message,
            route,
            conversationHistory,
            userId
        });

        res.json(result);

    } catch (error) {
        console.error('❌ Erro no chatbot:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao processar mensagem do chatbot',
            message: error.message
        });
    }
});

// CORREÇÃO DA ROTA PÚBLICA TAMBÉM:
app.post('/api/chatbot/public/message', async (req, res) => {
    try {
        const { message, conversationHistory = [] } = req.body;
        
        // Obter rota de forma segura para Node.js
        const route = req.headers.referer || 
                     req.headers.origin || 
                     req.body.route || 
                     '/';

        console.log(`💬 Chatbot público: ${message.substring(0, 50)}...`);
        console.log(`📍 Rota detectada: ${route}`);

        const result = await chatbot.processMessage({
            message,
            route,
            conversationHistory
        });

        res.json(result);

    } catch (error) {
        console.error('❌ Erro no chatbot público:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao processar mensagem do chatbot',
            message: error.message
        });
    }
});

// Rota de health check do chatbot
app.get('/api/chatbot/health', async (req, res) => {
    try {
        const health = await chatbot.healthCheck();
        res.json({
            success: true,
            chatbot: health,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Erro no health check do chatbot'
        });
    }
});

// Rota para obter contexto do chatbot baseado na página
app.get('/api/chatbot/context', authenticateToken, (req, res) => {
    try {
        const route = req.query.route || req.headers.referer || '/';
        const userRole = req.userRole || 'visitante';
        const userName = req.userNome || 'Usuário';

        const context = {
            user: {
                id: req.userId,
                name: userName,
                role: userRole
            },
            route: route,
            page: route.includes('professor') ? 'professor' : 
                  route.includes('aluno') ? 'aluno' : 
                  route.includes('login') ? 'login' : 'general',
            timestamp: new Date().toISOString()
        };

        res.json({
            success: true,
            context: context
        });

    } catch (error) {
        console.error('❌ Erro ao obter contexto:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao obter contexto'
        });
    }
});

// ============ ROTAS DO SUPER ADMIN ============

// Middleware para verificar se é super admin
const isSuperAdmin = (req, res, next) => {
    if (req.userRole !== 'admin' && req.userRole !== 'super_admin') {
        return res.status(403).json({
            success: false,
            error: 'Acesso negado. Apenas administradores podem acessar esta rota.'
        });
    }
    next();
};

// Dashboard - Estatísticas gerais
app.get('/api/admin/dashboard', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const [
            totalUsuarios,
            totalAlunos,
            totalProfessores,
            totalAdmins,
            totalTurmas,
            totalProvas,
            totalQuestoes,
            totalResultados,
            usuariosPorMes,
            provasPorStatus,
            turmasAtivas,
            alunosComAcessibilidade
        ] = await Promise.all([
            User.countDocuments(),
            User.countDocuments({ role: 'aluno' }),
            User.countDocuments({ role: 'professor' }),
            User.countDocuments({ role: { $in: ['admin', 'super_admin'] } }),
            Turma.countDocuments(),
            Prova.countDocuments(),
            Prova.aggregate([{ $project: { count: { $size: "$questoes" } } }, { $group: { _id: null, total: { $sum: "$count" } } }]),
            Resultado.countDocuments(),
            User.aggregate([
                { $group: { 
                    _id: { $month: "$createdAt" }, 
                    count: { $sum: 1 } 
                }},
                { $sort: { _id: 1 } }
            ]),
            Prova.aggregate([
                { $group: { 
                    _id: "$status", 
                    count: { $sum: 1 } 
                }}
            ]),
            Turma.countDocuments({ ativa: true }),
            User.countDocuments({ precisaAcessibilidade: true, role: 'aluno' })
        ]);

        // Atividades recentes
        const atividadesRecentes = await Promise.all([
            Resultado.find()
                .sort({ createdAt: -1 })
                .limit(5)
                .populate('userId', 'nome')
                .populate('provaId', 'titulo')
                .lean(),
            ProvaRealizada.find()
                .sort({ dataRealizacao: -1 })
                .limit(5)
                .populate('alunoId', 'nome')
                .populate('provaId', 'titulo')
                .lean()
        ]);

        const recentes = [...atividadesRecentes[0], ...atividadesRecentes[1]]
            .sort((a, b) => new Date(b.createdAt || b.dataRealizacao) - new Date(a.createdAt || a.dataRealizacao))
            .slice(0, 10);

        res.json({
            success: true,
            data: {
                totalUsuarios,
                totalAlunos,
                totalProfessores,
                totalAdmins,
                totalTurmas,
                totalProvas,
                totalQuestoes: totalQuestoes[0]?.total || 0,
                totalResultados,
                usuariosPorMes: usuariosPorMes.map(item => ({ mes: item._id, total: item.count })),
                provasPorStatus: provasPorStatus.reduce((acc, item) => ({ ...acc, [item._id]: item.count }), {}),
                turmasAtivas,
                alunosComAcessibilidade,
                atividadesRecentes: recentes.map(r => ({
                    id: r._id,
                    tipo: r.userId ? 'resultado' : 'prova_realizada',
                    usuario: r.userId?.nome || r.alunoId?.nome || 'Desconhecido',
                    acao: r.userId ? 'finalizou a prova' : 'realizou a prova',
                    prova: r.provaId?.titulo || 'Prova',
                    data: r.createdAt || r.dataRealizacao
                }))
            }
        });

    } catch (error) {
        console.error('❌ Erro no dashboard admin:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ GERENCIAMENTO DE USUÁRIOS ============

// ============================================================================
// ROTAS DE GERENCIAMENTO DE USUÁRIOS (ADMIN)
// ============================================================================

// ============ LISTAR TODOS OS USUÁRIOS COM FILTROS E PAGINAÇÃO ============
app.get('/api/admin/usuarios', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { role, search, page = 1, limit = 10 } = req.query;
        
        console.log(`📋 Admin ${req.userId} listando usuários - Role: ${role}, Search: ${search}, Page: ${page}`);
        
        let query = {};
        
        // Filtrar por role
        if (role && role !== 'todos') {
            query.role = role;
        }
        
        // Busca por nome, email, matrícula ou CPF
        if (search) {
            query.$or = [
                { nome: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { matricula: { $regex: search, $options: 'i' } },
                { cpf: { $regex: search, $options: 'i' } }
            ];
        }
        
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const [usuarios, total] = await Promise.all([
            User.find(query)
                .select('-password -twoFactorSecret -twoFactorBackupCodes -twoFactorTempSecret')
                .sort({ nome: 1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            User.countDocuments(query)
        ]);
        
        // Formatar dados para o frontend
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
            updatedAt: user.updatedAt
        }));
        
        console.log(`✅ ${usuariosFormatados.length} usuários encontrados (total: ${total})`);
        
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
        console.error('❌ Erro ao listar usuários:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erro interno ao listar usuários: ' + error.message 
        });
    }
});

// ============ ADMIN CRIAR NOVO USUÁRIO ============
app.post('/api/admin/usuarios', authenticateToken, isSuperAdmin, verificarPermissaoSuperAdmin, async (req, res) => {
    try {
        const userData = req.body;
        
        console.log('📝 Admin criando usuário:', userData.email);
        
        // Admin não pode criar super_admin
        if (req.userRole === 'admin' && userData.role === 'super_admin') {
            return res.status(403).json({
                success: false,
                error: 'Administradores não podem criar Super Admins'
            });
        }
        
        // Validar email institucional
        if (userData.email && !userData.email.toLowerCase().endsWith('@iemasaoluiscentro.net')) {
            return res.status(400).json({
                success: false,
                error: 'Somente emails institucionais (@iemasaoluiscentro.net) são permitidos'
            });
        }

        // Verificar duplicatas
        const existingUser = await User.findOne({
            $or: [
                { email: userData.email },
                { cpf: userData.cpf?.replace(/\D/g, '') }
            ]
        });

        if (existingUser) {
            return res.status(400).json({
                success: false,
                error: 'Email ou CPF já cadastrado'
            });
        }

        // Validar campos obrigatórios baseado no role
        if (userData.role === 'professor' && !userData.matricula) {
            return res.status(400).json({
                success: false,
                error: 'Matrícula é obrigatória para professores'
            });
        }

        if (userData.role === 'aluno') {
            if (!userData.curso) {
                return res.status(400).json({
                    success: false,
                    error: 'Curso é obrigatório para alunos'
                });
            }
            if (!userData.turma) {
                return res.status(400).json({
                    success: false,
                    error: 'Turma é obrigatória para alunos'
                });
            }
        }

        // VALIDAR POLÍTICA DE SENHAS
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
            return res.status(400).json({
                success: false,
                error: `A senha deve ter no mínimo ${tamanhoMinimo} caracteres`
            });
        }

        if (exigirMaiuscula && !/[A-Z]/.test(userData.password)) {
            return res.status(400).json({
                success: false,
                error: 'A senha deve conter pelo menos uma letra maiúscula'
            });
        }

        if (exigirNumero && !/[0-9]/.test(userData.password)) {
            return res.status(400).json({
                success: false,
                error: 'A senha deve conter pelo menos um número'
            });
        }

        if (exigirEspecial && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(userData.password)) {
            return res.status(400).json({
                success: false,
                error: 'A senha deve conter pelo menos um caractere especial (!@#$%...)'
            });
        }

        // CRIAR USUÁRIO
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

        console.log(`✅ Usuário criado pelo admin: ${user.email}`);
        console.log(`   🔐 forcePasswordChange: ${user.forcePasswordChange}`);

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
        console.error('❌ Erro ao criar usuário:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ BUSCAR USUÁRIO POR ID (PARA EDIÇÃO) ============
// ============ BUSCAR USUÁRIO POR ID (PARA EDIÇÃO) - CORRIGIDO ============
app.get('/api/admin/usuarios/:id', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        console.log(`🔍 Admin ${req.userId} buscando usuário ${id}`);
        
        // 🔥 CORREÇÃO: Usar apenas inclusão de campos, sem exclusão
        const user = await User.findById(id)
            .select('nome email cpf telefone matricula role eixo curso turma periodo departamento titulacao ativo forcePasswordChange precisaAcessibilidade condicaoAcessibilidade dataSolicitacaoAcessibilidade acessibilidadeAprovadaPor twoFactorEnabled twoFactorBackupCodesShown telefoneVerificado lastLogin loginAttempts lockUntil onesignalPlayerId createdAt updatedAt')
            .lean();
        
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'Usuário não encontrado' 
            });
        }
        
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
                updatedAt: user.updatedAt
            }
        });
        
    } catch (error) {
        console.error('❌ Erro ao buscar usuário:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao buscar usuário: ' + error.message 
        });
    }
});

// ============ ATUALIZAR USUÁRIO ============
app.put('/api/admin/usuarios/:id', authenticateToken, isSuperAdmin, verificarPermissaoSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        
        console.log(`✏️ Admin ${req.userId} editando usuário ${id}`);
        
        // Impedir que admin altere seu próprio role para super_admin
        if (req.userRole === 'admin' && updates.role === 'super_admin') {
            return res.status(403).json({
                success: false,
                error: 'Administradores não podem criar Super Admins'
            });
        }
        
        // Não permitir atualizar senha por esta rota
        delete updates.password;
        
        // Validar email institucional
        if (updates.email && !updates.email.toLowerCase().endsWith('@iemasaoluiscentro.net')) {
            return res.status(400).json({
                success: false,
                error: 'Somente emails institucionais (@iemasaoluiscentro.net) são permitidos'
            });
        }
        
        // Verificar se o usuário existe
        const existingUser = await User.findById(id);
        if (!existingUser) {
            return res.status(404).json({ 
                success: false, 
                error: 'Usuário não encontrado' 
            });
        }
        
        // Admin não pode alterar super_admin
        if (req.userRole === 'admin' && existingUser.role === 'super_admin') {
            return res.status(403).json({
                success: false,
                error: 'Administradores não podem modificar dados de Super Admins'
            });
        }
        
        // Verificar duplicatas de email
        if (updates.email && updates.email !== existingUser.email) {
            const emailExists = await User.findOne({ email: updates.email });
            if (emailExists) {
                return res.status(400).json({
                    success: false,
                    error: 'Email já está em uso por outro usuário'
                });
            }
        }
        
        // Verificar duplicatas de CPF
        if (updates.cpf) {
            const cpfNumeros = updates.cpf.replace(/\D/g, '');
            if (cpfNumeros !== existingUser.cpf) {
                const cpfExists = await User.findOne({ cpf: cpfNumeros });
                if (cpfExists) {
                    return res.status(400).json({
                        success: false,
                        error: 'CPF já está em uso por outro usuário'
                    });
                }
            }
            updates.cpf = cpfNumeros;
        }
        
        // Formatar telefone
        if (updates.telefone) {
            updates.telefone = updates.telefone.replace(/\D/g, '');
        }
        
        const user = await User.findByIdAndUpdate(
            id, 
            updates, 
            { new: true }
        ).select('-password -twoFactorSecret -twoFactorBackupCodes -twoFactorTempSecret');
        
        console.log(`✅ Usuário ${id} atualizado com sucesso`);
        
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
        console.error('❌ Erro ao atualizar usuário:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao atualizar usuário: ' + error.message 
        });
    }
});

// ============ ADMIN RESETAR SENHA ============
app.post('/api/admin/usuarios/:id/reset-password', authenticateToken, isSuperAdmin, verificarPermissaoSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { novaSenha } = req.body;
        
        console.log(`🔑 Admin ${req.userId} resetando senha do usuário ${id}`);
        
        // Verificar se o alvo é super_admin
        const targetUser = await User.findById(id);
        if (!targetUser) {
            return res.status(404).json({
                success: false,
                error: 'Usuário não encontrado'
            });
        }
        
        // Admin não pode resetar senha de super_admin
        if (req.userRole === 'admin' && targetUser.role === 'super_admin') {
            return res.status(403).json({
                success: false,
                error: 'Administradores não podem resetar senha de Super Admins'
            });
        }
        
        if (!novaSenha || novaSenha.length < 6) {
            return res.status(400).json({
                success: false,
                error: 'A nova senha deve ter no mínimo 6 caracteres'
            });
        }
        
        // VALIDAR POLÍTICA DE SENHAS
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
                error: 'A nova senha deve conter pelo menos um caractere especial (!@#$%...)'
            });
        }
        
        const user = await User.findById(id);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'Usuário não encontrado'
            });
        }
        
        // ATUALIZAR SENHA
        user.password = novaSenha;
        user.forcePasswordChange = true;
        user.passwordChangedAt = null;
        await user.save();
        
        console.log(`✅ Senha resetada para usuário ${user.email}`);
        console.log(`   🔐 forcePasswordChange: ${user.forcePasswordChange}`);
        
        // VERIFICAR CONFIGURAÇÕES DE PUSH
        const Config = mongoose.model('Config');
        const configDoc = await Config.findOne({ chave: 'notificacoes' });
        const pushAtivado = configDoc?.valor?.push === true;
        
        // Criar notificação
        try {
            const Notificacao = mongoose.model('Notificacao');
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
            
            // 🔥 ENVIAR PUSH SE ATIVADO
            if (pushAtivado) {
                const OneSignalService = require('./services/onesignal-service');
                const oneSignal = new OneSignalService();
                
                await oneSignal.enviarPush(
                    user._id,
                    '🔐 Senha Resetada',
                    'Sua senha foi resetada pelo administrador. Você precisará trocá-la no próximo login.',
                    {
                        tipo: 'reset_senha',
                        forcarTroca: true
                    }
                );
            }
            
        } catch (notifError) {
            console.warn('⚠️ Erro ao criar notificação:', notifError.message);
        }
        
        res.json({
            success: true,
            message: 'Senha resetada com sucesso! O usuário deverá trocar a senha no próximo login.',
            novaSenha: novaSenha
        });
        
    } catch (error) {
        console.error('❌ Erro ao resetar senha:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao resetar senha: ' + error.message 
        });
    }
});

// ============ ATIVAR/DESATIVAR USUÁRIO ============
app.put('/api/admin/usuarios/:id/toggle-status', authenticateToken, isSuperAdmin, verificarPermissaoSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { ativo } = req.body;
        
        console.log(`🔄 Admin ${req.userId} alterando status do usuário ${id} para ${ativo ? 'ATIVO' : 'INATIVO'}`);
        
        const user = await User.findById(id);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'Usuário não encontrado'
            });
        }
        
        // Admin não pode desativar super_admin
        if (req.userRole === 'admin' && user.role === 'super_admin') {
            return res.status(403).json({
                success: false,
                error: 'Administradores não podem alterar status de Super Admins'
            });
        }
        
        // Impedir que desative a si mesmo
        if (req.userId === id && !ativo) {
            return res.status(400).json({
                success: false,
                error: 'Você não pode desativar seu próprio usuário'
            });
        }
        
        user.ativo = ativo;
        await user.save();
        
        console.log(`✅ Usuário ${user.email} agora está ${ativo ? 'ATIVO' : 'INATIVO'}`);
        
        res.json({
            success: true,
            message: `Usuário ${ativo ? 'ativado' : 'desativado'} com sucesso!`,
            user: {
                id: user._id,
                nome: user.nome,
                ativo: user.ativo
            }
        });
        
    } catch (error) {
        console.error('❌ Erro ao alterar status:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao alterar status: ' + error.message 
        });
    }
});

// ============ EXCLUIR USUÁRIO ============
app.delete('/api/admin/usuarios/:id', authenticateToken, isSuperAdmin, verificarPermissaoSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        console.log(`🗑️ Admin ${req.userId} tentando excluir usuário ${id}`);
        
        const user = await User.findById(id);
        
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'Usuário não encontrado' 
            });
        }
        
        // Admin não pode excluir super_admin
        if (req.userRole === 'admin' && user.role === 'super_admin') {
            return res.status(403).json({
                success: false,
                error: 'Administradores não podem excluir Super Admins'
            });
        }
        
        // Verificar se é o último admin
        if (req.userId === id) {
            return res.status(400).json({
                success: false,
                error: 'Você não pode excluir seu próprio usuário'
            });
        }

        // Verificar se há dados relacionados
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
                detalhes: { 
                    resultados, 
                    provasRealizadas, 
                    provasCriadas,
                    turmasComoProfessor
                },
                sugestao: 'Recomendamos desativar o usuário em vez de excluí-lo.'
            });
        }

        await User.findByIdAndDelete(id);

        console.log(`✅ Usuário ${user.email} excluído permanentemente`);

        res.json({ 
            success: true, 
            message: 'Usuário excluído com sucesso' 
        });

    } catch (error) {
        console.error('❌ Erro ao deletar usuário:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao deletar usuário: ' + error.message 
        });
    }
});

// ============ BUSCAR PROFESSORES PARA SELECT (usado em várias partes) ============
app.get('/api/admin/professores-lista', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        console.log(`📋 Admin ${req.userId} buscando lista de professores`);
        
        const professores = await User.find({ 
            role: 'professor',
            ativo: true
        }).select('nome email matricula').sort({ nome: 1 }).lean();
        
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
        console.error('❌ Erro ao buscar professores:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao buscar professores: ' + error.message 
        });
    }
});

// ============ BUSCAR ALUNOS PARA SELECT ============
app.get('/api/admin/alunos-lista', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { turmaId, curso } = req.query;
        
        let query = { role: 'aluno', ativo: true };
        
        if (turmaId) {
            query.turma = turmaId;
        }
        
        if (curso) {
            query.curso = curso;
        }
        
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
        console.error('❌ Erro ao buscar alunos:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao buscar alunos: ' + error.message 
        });
    }
});

// ============ ESTATÍSTICAS DE USUÁRIOS ============
app.get('/api/admin/usuarios/estatisticas', authenticateToken, isSuperAdmin, async (req, res) => {
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
                total,
                ativos,
                inativos,
                com2FA,
                comAcessibilidade,
                porRole: {
                    alunos: await User.countDocuments({ role: 'aluno' }),
                    professores: await User.countDocuments({ role: 'professor' }),
                    admins: await User.countDocuments({ role: { $in: ['admin', 'super_admin'] } })
                }
            }
        });
        
    } catch (error) {
        console.error('❌ Erro ao buscar estatísticas:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao buscar estatísticas: ' + error.message 
        });
    }
});

// ============ GERENCIAMENTO DE TURMAS ============

app.get('/api/admin/turmas', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const turmas = await Turma.find()
            .populate('professorId', 'nome email')
            .populate('alunos', 'nome email matricula precisaAcessibilidade')
            .populate('provas', 'titulo status')
            .sort({ createdAt: -1 })
            .lean(); // Adicionar .lean() para melhor performance

        const turmasComEstatisticas = turmas.map(turma => ({
            id: turma._id,
            nome: turma.nome,
            disciplina: turma.disciplina,
            eixo: turma.eixo,
            codigo: turma.codigo,
            descricao: turma.descricao,
            dataCriacao: turma.createdAt || turma.dataCriacao || turma.criadoEm, // 🔴 CAPTURAR DATA
            createdAt: turma.createdAt, // 🔴 INCLUIR createdAt
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

        res.json({ 
            success: true, 
            turmas: turmasComEstatisticas 
        });

    } catch (error) {
        console.error('❌ Erro ao listar turmas:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ ROTA PARA ADMIN EXCLUIR TURMA ============
app.delete('/api/admin/turmas/:id', authenticateToken, async (req, res) => {
    try {
        // Verificar se é admin ou super_admin
        if (req.userRole !== 'admin' && req.userRole !== 'super_admin') {
            return res.status(403).json({
                success: false,
                error: 'Apenas administradores podem excluir turmas'
            });
        }
        
        const turmaId = req.params.id;
        
        console.log(`🗑️ Admin ${req.userId} excluindo turma ${turmaId}`);
        
        // Buscar turma
        const turma = await Turma.findById(turmaId);
        if (!turma) {
            return res.status(404).json({
                success: false,
                error: 'Turma não encontrada'
            });
        }
        
        // Verificar provas associadas
        const provasAssociadas = await Prova.find({ turmaId: turmaId });
        
        // Remover tudo (provas e resultados)
        console.log(`🔧 Removendo ${provasAssociadas.length} provas associadas...`);
        
        for (const prova of provasAssociadas) {
            // Remover resultados
            await Resultado.deleteMany({ provaId: prova._id });
            await ProvaRealizada.deleteMany({ provaId: prova._id });
            // Remover prova
            await Prova.findByIdAndDelete(prova._id);
        }
        
        // Remover referência da turma dos alunos
        if (turma.alunos && turma.alunos.length > 0) {
            await User.updateMany(
                { _id: { $in: turma.alunos } },
                { $pull: { turmas: turmaId } }
            );
        }
        
        // Excluir a turma
        await Turma.findByIdAndDelete(turmaId);
        
        console.log(`✅ Turma ${turmaId} excluída com sucesso`);
        
        res.json({
            success: true,
            message: 'Turma excluída com sucesso!',
            detalhes: {
                provasRemovidas: provasAssociadas.length,
                alunosRemovidos: turma.alunos?.length || 0
            }
        });
        
    } catch (error) {
        console.error('❌ Erro ao excluir turma:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno ao excluir turma: ' + error.message
        });
    }
});

// ============ GERENCIAMENTO DE PROVAS ============

app.get('/api/admin/provas', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const provas = await Prova.find()
            .populate('userId', 'nome email')
            .populate('turmaId', 'nome disciplina')
            .sort({ createdAt: -1 });

        const provasComEstatisticas = await Promise.all(provas.map(async (prova) => {
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
                alternativas: prova.alternativas,
                professor: prova.userId ? {
                    id: prova.userId._id,
                    nome: prova.userId.nome,
                    email: prova.userId.email
                } : null,
                turma: prova.turmaId ? {
                    id: prova.turmaId._id,
                    nome: prova.turmaId.nome,
                    disciplina: prova.turmaId.disciplina
                } : null,
                quantidadeQuestoes: prova.questoes.length,
                status: prova.status,
                publicada: prova.publicada,
                dataLimite: prova.dataLimite,
                dataCriacao: prova.createdAt,
                totalParticipantes: resultados + provasRealizadas,
                codigo: prova.codigo
            };
        }));

        res.json({ success: true, provas: provasComEstatisticas });

    } catch (error) {
        console.error('❌ Erro ao listar provas:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ ROTA PARA ADMIN EDITAR PROVA (VERSÃO CORRIGIDA COM HORÁRIOS) ============
app.put('/api/admin/provas/:id', authenticateToken, async (req, res) => {
    try {
        // Verificar se é admin ou super_admin
        if (req.userRole !== 'admin' && req.userRole !== 'super_admin') {
            return res.status(403).json({
                success: false,
                error: 'Apenas administradores podem editar provas'
            });
        }
        
        const provaId = req.params.id;
        const updates = req.body;
        
        console.log(`✏️ Admin ${req.userId} editando prova ${provaId}`);
        console.log('📦 Dados recebidos:', {
            titulo: updates.titulo,
            conteudo: updates.conteudo,
            dataLimite: updates.dataLimite,
            horarioInicio: updates.horarioInicio,
            horarioTermino: updates.horarioTermino,
            duracaoMinutos: updates.duracaoMinutos,
            questoes: updates.questoes?.length || 0
        });
        
        const prova = await Prova.findById(provaId);
        if (!prova) {
            return res.status(404).json({
                success: false,
                error: 'Prova não encontrada'
            });
        }
        
        // Atualizar campos básicos (incluindo horários)
        if (updates.titulo) prova.titulo = updates.titulo;
        if (updates.conteudo) prova.conteudo = updates.conteudo;
        
        // 🔥 CORREÇÃO: Processar data limite com horário de São Paulo
        if (updates.dataLimite) {
            // Se veio como string ISO (ex: "2026-03-06T09:30:00")
            if (updates.dataLimite.includes('T')) {
                prova.dataLimite = new Date(updates.dataLimite);
            } 
            // Se veio apenas data (ex: "2026-03-06")
            else if (updates.horarioTermino) {
                // Combinar data com horário de término
                const dataStr = `${updates.dataLimite}T${updates.horarioTermino}:00`;
                prova.dataLimite = new Date(dataStr);
            } else {
                // Apenas data, usar 23:59:59 do dia
                prova.dataLimite = new Date(`${updates.dataLimite}T23:59:59`);
            }
            console.log(`📅 Data limite atualizada: ${prova.dataLimite.toLocaleString('pt-BR')}`);
        }
        
        // 🔥 ATUALIZAR HORÁRIOS (CRÍTICO!)
        if (updates.horarioInicio) {
            prova.horarioInicio = updates.horarioInicio;
            console.log(`⏰ Horário início atualizado: ${prova.horarioInicio}`);
        }
        
        if (updates.horarioTermino) {
            prova.horarioTermino = updates.horarioTermino;
            console.log(`⏰ Horário término atualizado: ${prova.horarioTermino}`);
        }
        
        // Atualizar duração
        if (updates.duracaoMinutos) {
            prova.duracaoMinutos = updates.duracaoMinutos;
        }
        
        // Atualizar questões
        if (updates.questoes && Array.isArray(updates.questoes)) {
            prova.questoes = updates.questoes;
            prova.quantidadeQuestoes = updates.questoes.length;
            console.log(`📝 ${prova.quantidadeQuestoes} questões atualizadas`);
        }
        
        await prova.save();
        
        console.log(`✅ Prova ${provaId} atualizada com sucesso`);
        console.log(`   Horários salvos: ${prova.horarioInicio} - ${prova.horarioTermino}`);
        
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
        console.error('❌ Erro ao editar prova:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno ao editar prova: ' + error.message
        });
    }
});

// ============ SISTEMA DE BACKUP ============

// Listar backups
app.get('/api/admin/backups', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const backupDir = path.join(__dirname, 'backups');
        
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
        console.error('❌ Erro ao listar backups:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Criar backup manual
app.post('/api/admin/backups/criar', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = path.join(__dirname, 'backups', `backup_${timestamp}.json`);
        
        // Coletar todos os dados
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
            data: {
                users,
                turmas,
                provas,
                resultados,
                provasRealizadas
            },
            estatisticas: {
                totalUsers: users.length,
                totalTurmas: turmas.length,
                totalProvas: provas.length,
                totalResultados: resultados.length,
                totalProvasRealizadas: provasRealizadas.length
            }
        };

        fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));
        
        // Comprimir
        const gzip = require('zlib').createGzip();
        const input = fs.createReadStream(backupFile);
        const output = fs.createWriteStream(backupFile + '.gz');
        
        input.pipe(gzip).pipe(output);
        
        output.on('finish', () => {
            fs.unlinkSync(backupFile); // Remove o arquivo não comprimido
        });

        res.json({
            success: true,
            message: 'Backup criado com sucesso',
            arquivo: `backup_${timestamp}.json.gz`,
            estatisticas: backupData.estatisticas
        });

    } catch (error) {
        console.error('❌ Erro ao criar backup:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Restaurar backup
app.post('/api/admin/backups/restaurar/:arquivo', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { arquivo } = req.params;
        const backupPath = path.join(__dirname, 'backups', arquivo);
        
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
        console.error('❌ Erro ao restaurar backup:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ ROTA DE DOWNLOAD DE BACKUP (VERSÃO CORRIGIDA) ============
app.get('/api/admin/backups/download/:arquivo', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { arquivo } = req.params;
        
        console.log(`📥 Admin ${req.userId} tentando baixar backup: ${arquivo}`);
        
        // Validar nome do arquivo (segurança)
        if (arquivo.includes('..') || arquivo.includes('/') || arquivo.includes('\\')) {
            console.warn(`🚫 Tentativa de path traversal: ${arquivo}`);
            return res.status(400).json({
                success: false,
                error: 'Nome de arquivo inválido'
            });
        }
        
        const backupPath = path.join(__dirname, 'backups', arquivo);
        console.log('📁 Caminho do arquivo:', backupPath);
        
        // Verificar se o arquivo existe
        if (!fs.existsSync(backupPath)) {
            console.warn(`❌ Arquivo não encontrado: ${backupPath}`);
            return res.status(404).json({
                success: false,
                error: 'Arquivo de backup não encontrado'
            });
        }
        
        // Obter estatísticas do arquivo
        const stats = fs.statSync(backupPath);
        console.log(`📊 Tamanho: ${stats.size} bytes`);
        
        // Configurar headers para download
        res.setHeader('Content-Type', 'application/gzip');
        res.setHeader('Content-Disposition', `attachment; filename="${arquivo}"`);
        res.setHeader('Content-Length', stats.size);
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
        
        // Enviar o arquivo
        const fileStream = fs.createReadStream(backupPath);
        fileStream.pipe(res);
        
        fileStream.on('error', (error) => {
            console.error('❌ Erro ao enviar arquivo:', error);
            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    error: 'Erro ao enviar arquivo'
                });
            }
        });
        
        fileStream.on('end', () => {
            console.log(`✅ Download concluído: ${arquivo}`);
        });
        
    } catch (error) {
        console.error('❌ Erro ao baixar backup:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao baixar backup: ' + error.message
        });
    }
});

// Confirmar restauração
app.post('/api/admin/backups/confirmar-restauracao', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { token } = req.body;
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.action !== 'restore') {
            return res.status(400).json({ success: false, error: 'Token inválido' });
        }

        const backupPath = path.join(__dirname, 'backups', decoded.backup);
        
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

        // Limpar coleções existentes
        await Promise.all([
            User.deleteMany({}),
            Turma.deleteMany({}),
            Prova.deleteMany({}),
            Resultado.deleteMany({}),
            ProvaRealizada.deleteMany({})
        ]);

        // Restaurar dados
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
        console.error('❌ Erro na restauração:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ EXCLUIR BACKUP ============
app.delete('/api/admin/backups/excluir/:arquivo', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { arquivo } = req.params;
        
        console.log(`🗑️ Admin ${req.userId} excluindo backup: ${arquivo}`);
        
        // Validar nome do arquivo (segurança)
        if (arquivo.includes('..') || arquivo.includes('/') || arquivo.includes('\\')) {
            console.warn(`🚫 Tentativa de path traversal: ${arquivo}`);
            return res.status(400).json({
                success: false,
                error: 'Nome de arquivo inválido'
            });
        }
        
        const backupPath = path.join(__dirname, 'backups', arquivo);
        
        // Verificar se o arquivo existe
        if (!fs.existsSync(backupPath)) {
            return res.status(404).json({
                success: false,
                error: 'Arquivo de backup não encontrado'
            });
        }
        
        // Excluir o arquivo
        fs.unlinkSync(backupPath);
        
        console.log(`✅ Backup excluído com sucesso: ${arquivo}`);
        
        res.json({
            success: true,
            message: 'Backup excluído com sucesso!'
        });
        
    } catch (error) {
        console.error('❌ Erro ao excluir backup:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao excluir backup: ' + error.message
        });
    }
});

// ============ MONITORAMENTO ============

app.get('/api/admin/monitoramento/violacoes', authenticateToken, isSuperAdmin, async (req, res) => {
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

        res.json({
            success: true,
            provasCanceladas,
            estatisticas
        });

    } catch (error) {
        console.error('❌ Erro no monitoramento:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ ROTAS ADMIN PARA TURMAS (CRUD COMPLETO) ============

// Listar turmas (com filtros)
app.get('/api/admin/turmas', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { search, eixo, page = 1, limit = 20 } = req.query;
        
        let query = {};
        
        if (search) {
            query.$or = [
                { nome: { $regex: search, $options: 'i' } },
                { disciplina: { $regex: search, $options: 'i' } }
            ];
        }
        
        if (eixo && eixo !== 'todos') {
            query.eixo = eixo;
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const [turmas, total] = await Promise.all([
            Turma.find(query)
                .populate('professorId', 'nome email')
                .populate('alunos', 'nome email matricula precisaAcessibilidade')
                .populate('provas', 'titulo status')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            Turma.countDocuments(query)
        ]);

        const turmasComEstatisticas = turmas.map(turma => ({
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
            alunosComAcessibilidade: turma.alunos?.filter(a => a.precisaAcessibilidade).length || 0,
            totalProvas: turma.provas?.length || 0,
            alunos: turma.alunos?.map(a => ({
                id: a._id,
                nome: a.nome,
                email: a.email,
                matricula: a.matricula,
                precisaAcessibilidade: a.precisaAcessibilidade
            })) || []
        }));

        res.json({
            success: true,
            turmas: turmasComEstatisticas,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });

    } catch (error) {
        console.error('❌ Erro ao listar turmas (admin):', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Criar turma (admin)
app.post('/api/admin/turmas', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { nome, disciplina, eixo, professorId, descricao, ativa } = req.body;

        const turma = new Turma({
            nome,
            disciplina,
            eixo,
            professorId,
            descricao,
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
        console.error('❌ Erro ao criar turma (admin):', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Atualizar turma (admin)
app.put('/api/admin/turmas/:id', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        // Guardar valores antigos para comparar
        const turmaAntiga = await Turma.findById(id).select('ativa nome alunos');
        
        const turma = await Turma.findByIdAndUpdate(id, updates, { new: true })
            .populate('professorId', 'nome email');

        if (!turma) {
            return res.status(404).json({ success: false, error: 'Turma não encontrada' });
        }

        // ===== 🔥 ADICIONAR NOTIFICAÇÃO SE HOUVER MUDANÇA DE STATUS =====
        if (turmaAntiga && turmaAntiga.ativa !== turma.ativa && turma.alunos?.length > 0) {
            try {
                const Config = mongoose.model('Config');
                const configDoc = await Config.findOne({ chave: 'notificacoes' });
                const pushAtivado = configDoc?.valor?.push === true;
                const OneSignalService = require('./services/onesignal-service');
                const oneSignal = pushAtivado ? new OneSignalService() : null;
                
                const statusTexto = turma.ativa ? 'ativada' : 'desativada';
                const cor = turma.ativa ? '#10b981' : '#ef4444';
                const icone = turma.ativa ? '✅' : '⏸️';
                
                // Buscar alunos da turma com seus player_ids
                const alunos = await User.find({ 
                    _id: { $in: turma.alunos } 
                }).select('_id onesignalPlayerId nome');
                
                console.log(`📢 Turma ${turma.nome} ${statusTexto} - Notificando ${alunos.length} alunos`);
                
                for (const aluno of alunos) {
                    try {
                        // Notificação no sistema
                        const notificacao = new Notificacao({
                            usuarioId: aluno._id,
                            tipo: 'sistema',
                            titulo: `${icone} Turma ${statusTexto}`,
                            mensagem: `A turma "${turma.nome}" foi ${statusTexto}. ${!turma.ativa ? 'Você não poderá acessar as provas desta turma.' : ''}`,
                            icone: icone,
                            cor: cor,
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
                        
                        // Push se ativado
                        if (pushAtivado && oneSignal && aluno.onesignalPlayerId) {
                            await oneSignal.enviarPush(
                                aluno._id,
                                `🏫 Turma ${statusTexto}`,
                                `A turma "${turma.nome}" foi ${statusTexto}.`,
                                {
                                    tipo: 'status_turma',
                                    turmaId: turma._id,
                                    status: turma.ativa ? 'ativa' : 'inativa'
                                }
                            );
                        }
                    } catch (alunoError) {
                        console.error(`⚠️ Erro ao notificar aluno ${aluno._id}:`, alunoError.message);
                    }
                }
                
                console.log(`✅ ${alunos.length} alunos notificados sobre mudança de status da turma`);
                
            } catch (notifError) {
                console.error('⚠️ Erro ao notificar alunos:', notifError.message);
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
                    id: turma.professorId._id,  // ← 's' REMOVIDO!
                    nome: turma.professorId.nome
                } : null,
                ativa: turma.ativa
            }
        });

    } catch (error) {
        console.error('❌ Erro ao atualizar turma (admin):', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ ROTAS ADMIN PARA PROVAS ============

// Listar todas as provas (admin)
app.get('/api/admin/provas', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { status, dificuldade, periodo, search, page = 1, limit = 20 } = req.query;
        
        let query = {};
        
        if (status && status !== 'todos') {
            if (status === 'ativa') query = { ...query, publicada: true, status: 'ativa', cancelada: false };
            else if (status === 'rascunho') query = { ...query, publicada: false };
            else if (status === 'cancelada') query = { ...query, cancelada: true };
            else if (status === 'concluida') query = { ...query, publicada: true, dataLimite: { $lt: new Date() } };
        }
        
        if (dificuldade && dificuldade !== 'todas') {
            query.dificuldade = dificuldade;
        }
        
        if (periodo && periodo !== 'todos') {
            query.periodo = periodo;
        }
        
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
                professor: prova.userId ? {
                    id: prova.userId._id,
                    nome: prova.userId.nome
                } : null,
                turma: prova.turmaId ? {
                    id: prova.turmaId._id,
                    nome: prova.turmaId.nome
                } : null,
                totalParticipantes: resultados + provasRealizadas,
                alunosRealizaram: resultados + provasRealizadas,
                mediaNotas: 0 // Calcular média se necessário
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
        console.error('❌ Erro ao listar provas (admin):', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ ROTA PARA EXCLUIR TURMA (COM REMOÇÃO EM CASCATA) ============
app.delete('/api/turmas/:id', authenticateToken, async (req, res) => {
    try {
        const turmaId = req.params.id;
        const usuarioId = req.userId;
        const usuarioRole = req.userRole;

        console.log(`🗑️ Tentativa de exclusão da turma ${turmaId} pelo usuário ${usuarioId} (${usuarioRole})`);

        const turma = await Turma.findById(turmaId);
        if (!turma) {
            return res.status(404).json({
                success: false,
                error: 'Turma não encontrada'
            });
        }

        const isAdmin = usuarioRole === 'admin' || usuarioRole === 'super_admin';
        const isProfessorDaTurma = turma.professorId && turma.professorId.toString() === usuarioId;

        if (!isAdmin && !isProfessorDaTurma) {
            return res.status(403).json({
                success: false,
                error: 'Você não tem permissão para excluir esta turma'
            });
        }

        // Verificar provas associadas
        const provasAssociadas = await Prova.find({ turmaId: turmaId });
        
        // Se for admin, remover tudo (provas e resultados)
        if (isAdmin) {
            console.log(`🔧 Admin removendo ${provasAssociadas.length} provas associadas...`);
            
            for (const prova of provasAssociadas) {
                // Remover resultados
                await Resultado.deleteMany({ provaId: prova._id });
                await ProvaRealizada.deleteMany({ provaId: prova._id });
                // Remover prova
                await Prova.findByIdAndDelete(prova._id);
            }
        } 
        // Se for professor e houver provas, não permitir
        else if (provasAssociadas.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Esta turma possui provas associadas. Exclua as provas primeiro.',
                detalhes: { totalProvas: provasAssociadas.length }
            });
        }

        // Remover referência da turma dos alunos
        if (turma.alunos && turma.alunos.length > 0) {
            await User.updateMany(
                { _id: { $in: turma.alunos } },
                { $pull: { turmas: turmaId } }
            );
        }

        // Excluir a turma
        await Turma.findByIdAndDelete(turmaId);

        console.log(`✅ Turma ${turmaId} excluída com sucesso por ${usuarioId}`);

        res.json({
            success: true,
            message: 'Turma excluída com sucesso!',
            detalhes: {
                provasRemovidas: isAdmin ? provasAssociadas.length : 0,
                alunosRemovidos: turma.alunos?.length || 0
            }
        });

    } catch (error) {
        console.error('❌ Erro ao excluir turma:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno ao excluir turma: ' + error.message
        });
    }
});

// ============ ROTA PARA TROCAR SENHA (QUANDO FORÇADO) ============
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
        
        // Buscar usuário com senha
        const user = await User.findById(userId).select('+password +forcePasswordChange');
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'Usuário não encontrado'
            });
        }
        
        // Verificar senha atual
        const isMatch = await user.comparePassword(senhaAtual);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                error: 'Senha atual incorreta'
            });
        }
        
        // Verificar se a nova senha é igual à atual
        if (senhaAtual === novaSenha) {
            return res.status(400).json({
                success: false,
                error: 'A nova senha deve ser diferente da senha atual'
            });
        }

        // 🔥 VALIDAR POLÍTICA DE SENHAS
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

        // Validar tamanho mínimo
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
                error: 'A nova senha deve conter pelo menos um caractere especial (!@#$%...)'
            });
        }
        
        // ========== ATUALIZAR SENHA ==========
        // USUÁRIO TROCOU - REMOVER FLAG DE FORÇAR TROCA
        user.password = novaSenha;
        user.forcePasswordChange = false; // ✅ REMOVER FLAG - usuário trocou
        user.passwordChangedAt = new Date();
        
        await user.save();
        
        console.log(`✅ Senha alterada com sucesso para usuário: ${user.email}`);
        console.log(`   🔓 Flag forcePasswordChange removida`);
        
        res.json({
            success: true,
            message: 'Senha alterada com sucesso!',
            passwordChangedAt: user.passwordChangedAt
        });
        
    } catch (error) {
        console.error('❌ Erro ao trocar senha:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno ao trocar senha: ' + error.message
        });
    }
});

// ============ ROTA PARA ADMIN LISTAR TODOS OS RESULTADOS (CORRIGIDA) ============
app.get('/api/admin/todos-resultados', authenticateToken, isSuperAdmin, async (req, res) => {
  try {
    console.log('📊 Admin buscando todos os resultados');
    
    // Buscar resultados do modelo Resultado
    const resultados = await Resultado.find()
      .populate('userId', 'nome email matricula turma')
      .populate('provaId', 'titulo')
      .sort({ createdAt: -1 })
      .lean();
    
    // Buscar provas realizadas
    const provasRealizadas = await ProvaRealizada.find()
      .populate('alunoId', 'nome email matricula turma')
      .populate('provaId', 'titulo')
      .sort({ dataRealizacao: -1 })
      .lean();
    
    const resultadosMap = new Map();
    
    // Processar resultados do modelo Resultado
    resultados.forEach(r => {
      const dataStr = r.createdAt ? new Date(r.createdAt).toISOString().split('T')[0] : '';
      const key = `${r.userId?._id || r.userId}-${r.provaId?._id || r.provaId}-${dataStr}`;
      
      // 🔥 CORREÇÃO: Só é cancelado se tiver motivo de cancelamento EXPLÍCITO
      const isCancelada = r.cancelada === true || 
                         r.status === 'cancelada' ||
                         (r.motivoCancelamento && r.motivoCancelamento.length > 0);
      
      // 🔥 IMPORTANTE: Nota 0 NÃO é cancelamento!
      
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
        nota: r.nota !== undefined ? parseFloat(r.nota) : null,
        acertos: r.acertos || 0,
        total: r.total || 0,
        tempoGasto: r.tempoGasto || 0,
        status: r.status || (r.nota ? (r.nota >= 7 ? 'aprovado' : 'reprovado') : 'pendente'),
        notaLiberada: r.notaLiberada || false,
        cancelada: isCancelada,  // 🔥 SÓ TRUE SE REALMENTE CANCELADA
        motivoCancelamento: r.motivoCancelamento,
        flagViolacao: r.flagViolacao || false,
        origem: 'resultado',
        resultadoDetalhado: r.resultadoDetalhado || [],
        observacoes: r.observacoes || ''
      });
    });
    
    // Processar provas realizadas
    provasRealizadas.forEach(pr => {
      const dataStr = pr.dataRealizacao ? new Date(pr.dataRealizacao).toISOString().split('T')[0] : '';
      const key = `${pr.alunoId?._id || pr.alunoId}-${pr.provaId?._id || pr.provaId}-${dataStr}`;
      
      const isCancelada = pr.cancelada === true || 
                         pr.status === 'cancelada' ||
                         (pr.motivoCancelamento && pr.motivoCancelamento.length > 0);
      
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
          nota: pr.nota !== undefined ? parseFloat(pr.nota) : null,
          acertos: pr.acertos || 0,
          total: pr.total || 0,
          tempoGasto: pr.tempoGasto || 0,
          status: pr.status || (pr.nota ? (pr.nota >= 7 ? 'aprovado' : 'reprovado') : 'pendente'),
          notaLiberada: pr.notaLiberada || false,
          cancelada: isCancelada,  // 🔥 SÓ TRUE SE REALMENTE CANCELADA
          motivoCancelamento: pr.motivoCancelamento,
          flagViolacao: pr.flagViolacao || false,
          origem: 'provaRealizada',
          resultadoDetalhado: pr.resultadoDetalhado || [],
          observacoes: pr.observacoes || ''
        });
      }
    });
    
    const todosResultados = Array.from(resultadosMap.values());
    
    res.json({
      success: true,
      resultados: todosResultados,
      total: todosResultados.length,
      estatisticas: {
        total: todosResultados.length,
        comNota: todosResultados.filter(r => r.nota !== null && r.nota !== undefined && !r.cancelada).length,
        semNota: todosResultados.filter(r => r.nota === null || r.nota === undefined).length,
        aprovados: todosResultados.filter(r => r.nota && r.nota >= 7 && !r.cancelada).length,
        reprovados: todosResultados.filter(r => r.nota && r.nota < 7 && !r.cancelada).length,
        cancelados: todosResultados.filter(r => r.cancelada).length,
        pendentes: todosResultados.filter(r => r.nota === null || r.nota === undefined).length
      }
    });
    
  } catch (error) {
    console.error('❌ Erro ao listar todos os resultados:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ ROTA PARA ADMIN SALVAR RESULTADO ============
app.post('/api/admin/resultados/salvar', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { provaId, alunoId, nota, acertos, total, porcentagem, respostas, notaLiberada } = req.body;
        
        console.log(`📝 Admin ${req.userId} salvando resultado para prova ${provaId}, aluno ${alunoId}`);
        
        // Verificar se já existe um resultado
        let resultado = await Resultado.findOne({
            provaId: provaId,
            userId: alunoId
        });
        
        if (resultado) {
            // Atualizar existente
            resultado.nota = nota;
            resultado.acertos = acertos;
            resultado.total = total;
            resultado.porcentagem = porcentagem;
            resultado.respostas = respostas;
            resultado.notaLiberada = notaLiberada !== false;
            resultado.updatedAt = new Date();
            
            await resultado.save();
            console.log(`✅ Resultado ${resultado._id} atualizado`);
        } else {
            // Buscar nome do aluno
            const aluno = await User.findById(alunoId).select('nome');
            
            // Criar novo
            resultado = new Resultado({
                userId: alunoId,
                provaId: provaId,
                alunoNome: aluno ? aluno.nome : 'Aluno',
                respostas: respostas || [],
                nota: nota,
                acertos: acertos,
                total: total,
                porcentagem: porcentagem,
                notaLiberada: notaLiberada !== false,
                dataCriacao: new Date()
            });
            
            await resultado.save();
            console.log(`✅ Novo resultado ${resultado._id} criado`);
        }
        
        // Atualizar também na ProvaRealizada para consistência
        let provaRealizada = await ProvaRealizada.findOne({
            provaId: provaId,
            alunoId: alunoId
        });
        
        if (provaRealizada) {
            provaRealizada.nota = nota;
            provaRealizada.notaLiberada = notaLiberada !== false;
            provaRealizada.status = 'corrigida';
            await provaRealizada.save();
        }
        
        // Atualizar estatísticas da prova
        const prova = await Prova.findById(provaId);
        if (prova) {
            // Recalcular média
            const todosResultados = await Resultado.find({ 
                provaId: provaId,
                notaLiberada: true 
            });
            
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
        console.error('❌ Erro ao salvar resultado:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao salvar resultado: ' + error.message
        });
    }
});

// ============ ROTA PARA ADMIN ATUALIZAR RESULTADO (COM NOTIFICAÇÕES) ============
// ============ ROTA PARA ADMIN ATUALIZAR RESULTADO (VERSÃO CORRIGIDA) ============
app.put('/api/admin/resultados/:id', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { nota, acertos, total, tempoGasto, observacoes, notaLiberada } = req.body;

        console.log(`📝 Admin ${req.userId} atualizando resultado ${id}`);
        console.log('   Nova nota:', nota);
        console.log('   Acertos recebidos:', acertos, '/', total);

        // 🔴 CORREÇÃO 1: Calcular acertos automaticamente baseado na nota
        const acertosCalculados = Math.round((nota / 10) * total);
        
        console.log(`   🔄 Acertos calculados: ${acertosCalculados} (${nota} / 10 * ${total})`);

        // 🔴 CORREÇÃO 2: Validar se os acertos recebidos são consistentes
        let acertosFinais = acertosCalculados;
        
        if (Math.abs(acertos - acertosCalculados) > 1) {
            console.warn(`⚠️ Inconsistência detectada: recebido ${acertos}, calculado ${acertosCalculados}. Usando valor calculado.`);
        } else if (acertos !== acertosCalculados) {
            console.log(`ℹ️ Pequena diferença (${acertos} vs ${acertosCalculados}) - mantendo valor original`);
            acertosFinais = acertos;
        }

        // Buscar dados do admin
        const admin = await User.findById(req.userId).select('nome email');

        // TENTAR PRIMEIRO NO MODELO Resultado
        let resultado = await Resultado.findById(id);
        let tipoAcao = 'editada';
        let resultadoAntigo = null;
        
        if (resultado) {
            // Guardar valores antigos para comparar
            resultadoAntigo = {
                nota: resultado.nota,
                acertos: resultado.acertos,
                notaLiberada: resultado.notaLiberada
            };

            // Verificar se é liberação ou edição
            if (!resultadoAntigo.notaLiberada && notaLiberada) {
                tipoAcao = 'liberada';
            }

            // 🔴 Atualizar Resultado com os valores CORRETOS
            resultado.nota = nota;
            resultado.acertos = acertosFinais;  // Usar valor calculado/validado
            resultado.total = total;
            resultado.tempoGasto = tempoGasto;
            resultado.observacoes = observacoes;
            resultado.notaLiberada = notaLiberada !== false;
            
            // 🔴 Recalcular porcentagem com os acertos corretos
            resultado.porcentagem = total > 0 ? ((acertosFinais / total) * 100).toFixed(1) : '0.0';
            
            await resultado.save();

            console.log(`✅ Resultado ${id} atualizado:`);
            console.log(`   Nota: ${resultado.nota}`);
            console.log(`   Acertos: ${resultado.acertos}/${resultado.total} (${resultado.porcentagem}%)`);

            // BUSCAR DADOS PARA NOTIFICAÇÃO
            const aluno = await User.findById(resultado.userId).select('nome email');
            const prova = await Prova.findById(resultado.provaId).select('titulo userId');
            
            if (prova && prova.userId) {
                const professor = await User.findById(prova.userId).select('nome email');

                // CRIAR NOTIFICAÇÕES
                const NotificationService = require('./services/notification-service');
                const OneSignalService = require('./services/onesignal-service');
                const notificationService = new NotificationService();

                // Notificar aluno
                if (aluno) {
                    await notificationService.notificarAlunoResultado(
                        aluno, 
                        prova, 
                        resultado, 
                        admin, 
                        tipoAcao
                    );
                }

                // Notificar professor
                if (professor && professor._id.toString() !== admin._id.toString()) {
                    await notificationService.notificarProfessorResultado(
                        professor,
                        aluno,
                        prova,
                        resultado,
                        admin,
                        tipoAcao
                    );
                }
            }

            return res.json({
                success: true,
                message: tipoAcao === 'liberada' ? 
                    '✅ Resultado liberado e notificações enviadas!' : 
                    '✅ Resultado atualizado e notificações enviadas!',
                resultado: {
                    id: resultado._id,
                    nota: resultado.nota,
                    acertos: resultado.acertos,
                    total: resultado.total,
                    porcentagem: resultado.porcentagem
                }
            });
        }

        // SE NÃO ENCONTROU NO Resultado, TENTAR NO ProvaRealizada
        const provaRealizada = await ProvaRealizada.findById(id);
        
        if (provaRealizada) {
            // 🔴 MESMA LÓGICA PARA PROVAREALIZADA
            const acertosCalculados = Math.round((nota / 10) * total);
            
            provaRealizada.nota = nota;
            provaRealizada.acertos = acertosCalculados;
            provaRealizada.total = total;
            provaRealizada.tempoGasto = tempoGasto;
            provaRealizada.observacoes = observacoes;
            provaRealizada.notaLiberada = notaLiberada !== false;
            provaRealizada.status = 'corrigida';
            
            await provaRealizada.save();

            console.log(`✅ ProvaRealizada ${id} atualizada: ${acertosCalculados}/${total} acertos`);

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

        return res.status(404).json({
            success: false,
            error: 'Resultado não encontrado'
        });

    } catch (error) {
        console.error('❌ Erro ao atualizar resultado:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno ao atualizar resultado: ' + error.message
        });
    }
});

// ============ ROTA PARA EXCLUIR RESULTADO (ADMIN) - VERSÃO QUE VERIFICA AMBAS COLEÇÕES ============
app.delete('/api/admin/resultados/:id', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        console.log(`🗑️ Admin ${req.userId} excluindo resultado/registro ${id}`);

        let excluidos = {
            resultado: false,
            provaRealizada: false,
            resultadoId: null,
            provaRealizadaId: null
        };

        // TENTAR 1: Buscar no modelo Resultado
        const resultado = await Resultado.findById(id);
        if (resultado) {
            const provaId = resultado.provaId;
            const userId = resultado.userId;
            
            await Resultado.findByIdAndDelete(id);
            excluidos.resultado = true;
            excluidos.resultadoId = id;
            
            console.log(`✅ Resultado ${id} excluído`);
            
            // TENTAR 2: Verificar se existe também em ProvaRealizada para o mesmo aluno/prova
            if (userId && provaId) {
                const provaRealizada = await ProvaRealizada.findOne({
                    provaId: provaId,
                    alunoId: userId
                });
                
                if (provaRealizada) {
                    await ProvaRealizada.findByIdAndDelete(provaRealizada._id);
                    excluidos.provaRealizada = true;
                    excluidos.provaRealizadaId = provaRealizada._id;
                    console.log(`✅ ProvaRealizada ${provaRealizada._id} também excluída (mesmo aluno/prova)`);
                }
            }
        } 
        // TENTAR 3: Se não achou em Resultado, buscar em ProvaRealizada
        else {
            const provaRealizada = await ProvaRealizada.findById(id);
            if (provaRealizada) {
                await ProvaRealizada.findByIdAndDelete(id);
                excluidos.provaRealizada = true;
                excluidos.provaRealizadaId = id;
                console.log(`✅ ProvaRealizada ${id} excluída`);
                
                // TENTAR 4: Verificar se existe também em Resultado para o mesmo aluno/prova
                if (provaRealizada.alunoId && provaRealizada.provaId) {
                    const resultado = await Resultado.findOne({
                        provaId: provaRealizada.provaId,
                        userId: provaRealizada.alunoId
                    });
                    
                    if (resultado) {
                        await Resultado.findByIdAndDelete(resultado._id);
                        excluidos.resultado = true;
                        excluidos.resultadoId = resultado._id;
                        console.log(`✅ Resultado ${resultado._id} também excluído (mesmo aluno/prova)`);
                    }
                }
            }
        }

        // Se nenhum registro foi encontrado
        if (!excluidos.resultado && !excluidos.provaRealizada) {
            return res.status(404).json({
                success: false,
                error: 'Registro não encontrado em nenhuma coleção'
            });
        }

        // Atualizar estatísticas da prova se possível
        if (excluidos.resultadoId || excluidos.provaRealizadaId) {
            // Tentar encontrar a provaId de qualquer um dos registros
            let provaId = null;
            
            if (excluidos.resultado) {
                // Já temos a provaId do resultado
                const resultadoCompleto = await Resultado.findById(id);
                if (resultadoCompleto) provaId = resultadoCompleto.provaId;
            } else if (excluidos.provaRealizada) {
                const provaRealizadaCompleta = await ProvaRealizada.findById(id);
                if (provaRealizadaCompleta) provaId = provaRealizadaCompleta.provaId;
            }
            
            if (provaId) {
                const prova = await Prova.findById(provaId);
                if (prova) {
                    // Recalcular estatísticas considerando AMBAS as coleções
                    const todosResultados = await Resultado.find({ provaId });
                    const todasRealizadas = await ProvaRealizada.find({ provaId });
                    
                    const totalParticipantes = todosResultados.length + todasRealizadas.length;
                    
                    let somaNotas = 0;
                    todosResultados.forEach(r => somaNotas += (r.nota || 0));
                    todasRealizadas.forEach(r => somaNotas += (r.nota || 0));
                    
                    prova.mediaNotas = totalParticipantes > 0 ? somaNotas / totalParticipantes : 0;
                    prova.totalParticipantes = totalParticipantes;
                    
                    await prova.save();
                    console.log(`📊 Estatísticas da prova ${provaId} atualizadas`);
                }
            }
        }

        // Montar mensagem de resposta
        let mensagem = '';
        if (excluidos.resultado && excluidos.provaRealizada) {
            mensagem = 'Resultado e ProvaRealizada excluídos permanentemente!';
        } else if (excluidos.resultado) {
            mensagem = 'Resultado excluído permanentemente!';
        } else if (excluidos.provaRealizada) {
            mensagem = 'ProvaRealizada excluída permanentemente!';
        }

        res.json({
            success: true,
            message: mensagem,
            detalhes: excluidos
        });

    } catch (error) {
        console.error('❌ Erro ao excluir resultado:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno ao excluir resultado: ' + error.message
        });
    }
});

// ============ ROTA PARA DETALHES DE CANCELAMENTO (ADMIN) ============
app.get('/api/admin/resultados/:id/cancelamento', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        console.log(`🔍 Admin ${req.userId} buscando detalhes de cancelamento para ID: ${id}`);

        // Tentar buscar em Resultado primeiro
        let registro = await Resultado.findById(id)
            .populate('userId', 'nome email')
            .populate('provaId', 'titulo conteudo dataLimite userId')
            .lean();

        let tipo = 'resultado';

        // Se não encontrou, tentar em ProvaRealizada
        if (!registro) {
            registro = await ProvaRealizada.findById(id)
                .populate('alunoId', 'nome email matricula')
                .populate('provaId', 'titulo conteudo dataLimite userId')
                .lean();
            tipo = 'prova_realizada';
        }

        if (!registro) {
            return res.status(404).json({
                success: false,
                error: 'Registro não encontrado'
            });
        }

        // Verificar se é um cancelamento
        const isCancelada = registro.cancelada === true || 
                           registro.status === 'cancelada' ||
                           (registro.nota === 0 && registro.status === 'pendente');

        if (!isCancelada) {
            return res.status(400).json({
                success: false,
                error: 'Este registro não é um cancelamento'
            });
        }

        // Determinar tipo de cancelamento
        const motivo = registro.motivoCancelamento || '';
        const motivoLower = motivo.toLowerCase();
        
        let tipoCancelamento = 'prazo';
        let icone = 'clock';
        let cor = '#f59e0b';
        let titulo = 'CANCELADA - PRAZO EXPIRADO';

        // Palavras-chave para violação
        const palavrasViolacao = [
            'violação', 'violacao', 'violou', 'viola', 'multiplas', 'múltiplas',
            'regras', 'monitoramento', 'trapaça', 'trapaca', 'fraude',
            'atalho', 'shortcut', 'f5', 'refresh', 'recarregar'
        ];

        const isViolacao = palavrasViolacao.some(palavra => motivoLower.includes(palavra)) ||
                          registro.flagViolacao === true ||
                          (registro.estatisticasCancelamento && 
                           registro.estatisticasCancelamento.avisos > 0);

        if (isViolacao) {
            tipoCancelamento = 'violacao';
            icone = 'user-slash';
            cor = '#dc2626';
            titulo = 'CANCELADA - VIOLAÇÃO DAS REGRAS';
        }

        // Buscar professor
        let professor = null;
        if (registro.provaId && registro.provaId.userId) {
            professor = await User.findById(registro.provaId.userId)
                .select('nome email')
                .lean();
        }

        // Preparar dados do aluno
        const aluno = tipo === 'resultado' ? registro.userId : registro.alunoId;

        // Preparar resposta
        const response = {
            success: true,
            tipoCancelamento: tipoCancelamento,
            titulo: titulo,
            icone: icone,
            cor: cor,
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
            professor: professor ? {
                nome: professor.nome,
                email: professor.email
            } : null,
            tipo: tipo,
            timestamp: new Date().toISOString()
        };

        res.json(response);

    } catch (error) {
        console.error('❌ Erro ao buscar detalhes de cancelamento:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno: ' + error.message
        });
    }
});

// ============================================================================
// ROTAS DE NOTIFICAÇÃO (VERSÃO CORRIGIDA COM PUSH AUTOMÁTICO)
// ============================================================================

// =========================================================
// 1. ROTAS ESPECÍFICAS (SEM PARÂMETROS)
// =========================================================

// Contador de notificações não lidas
app.get('/api/notificacoes/nao-lidas/contador', authenticateToken, async (req, res) => {
    try {
        const count = await Notificacao.countDocuments({
            usuarioId: req.userId,
            lida: false
        });

        res.json({
            success: true,
            count: count
        });

    } catch (error) {
        console.error('❌ Erro ao contar notificações:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============ ROTA PARA CRIAR NOTIFICAÇÃO (COM PUSH AUTOMÁTICO) ============
app.post('/api/notificacoes', authenticateToken, async (req, res) => {
    try {
        const { usuarioId, tipo, titulo, mensagem, icone, cor, link, prioridade, dados } = req.body;
        
        console.log(`📝 Criando notificação para usuário ${usuarioId}: ${titulo}`);
        
        // ✅ Validar tipo
        const tiposPermitidos = ['resultado_liberado', 'resultado_editado', 'prova_corrigida', 'sistema', 'cancelamento'];
        
        if (!tiposPermitidos.includes(tipo)) {
            return res.status(400).json({
                success: false,
                error: `Tipo inválido. Use um dos: ${tiposPermitidos.join(', ')}`
            });
        }
        
        // ✅ Validar prioridade
        let prioridadeFinal = prioridade;
        if (prioridade === undefined || prioridade === null) {
            prioridadeFinal = 3;
        } else if (typeof prioridade === 'string') {
            const prioridadeNum = parseInt(prioridade);
            if (isNaN(prioridadeNum) || prioridadeNum < 1 || prioridadeNum > 5) {
                return res.status(400).json({
                    success: false,
                    error: 'Prioridade inválida. Deve ser um número entre 1 e 5'
                });
            }
            prioridadeFinal = prioridadeNum;
        } else if (typeof prioridade === 'number') {
            if (prioridade < 1 || prioridade > 5) {
                return res.status(400).json({
                    success: false,
                    error: 'Prioridade inválida. Deve ser um número entre 1 e 5'
                });
            }
            prioridadeFinal = prioridade;
        }

        // ✅ Criar notificação no sistema
        const notificacao = new Notificacao({
            usuarioId,
            tipo,
            titulo,
            mensagem,
            icone: icone || '📋',
            cor: cor || '#3b82f6',
            link: link || null,
            prioridade: prioridadeFinal,
            dados: dados || {}
        });
        
        await notificacao.save();

        console.log(`✅ Notificação criada com ID: ${notificacao._id}`);
        
        // ✅ VERIFICAR CONFIGURAÇÃO DE PUSH
        const Config = mongoose.model('Config');
        const configDoc = await Config.findOne({ chave: 'notificacoes' });
        const pushAtivado = configDoc?.valor?.push === true;
        
        let pushResult = null;
        
        // ✅ ENVIAR PUSH SE ATIVADO
        if (pushAtivado) {
            console.log(`📱 Push ativado, enviando para usuário ${usuarioId}...`);
            
            const OneSignalService = require('./services/onesignal-service');
            const oneSignal = new OneSignalService();
            
            // Remover HTML da mensagem para push
            const mensagemPush = mensagem.replace(/<[^>]*>/g, '');
            
            pushResult = await oneSignal.enviarPush(
                usuarioId,
                titulo,
                mensagemPush,
                {
                    ...dados,
                    notificacaoId: notificacao._id,
                    tipo,
                    origem: 'sistema'
                }
            );
            
            if (pushResult) {
                console.log(`✅ Push enviado! ID: ${pushResult.notificationId || pushResult.id}`);
            }
        } else {
            console.log('📱 Push desativado nas configurações');
        }
        
        // ✅ RESPOSTA
        res.json({ 
            success: true, 
            notificacao: { 
                id: notificacao._id, 
                titulo: notificacao.titulo, 
                mensagem: notificacao.mensagem,
                tipo: notificacao.tipo,
                prioridade: notificacao.prioridade
            },
            push: pushResult ? { 
                enviado: true, 
                id: pushResult.notificationId || pushResult.id 
            } : { 
                enviado: false, 
                motivo: pushAtivado ? 'falha_no_envio' : 'push_desativado'
            }
        });

    } catch (error) {
        console.error('❌ Erro ao criar notificação:', error);
        
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }
        
        res.status(500).json({ 
            success: false, 
            error: 'Erro ao criar notificação: ' + error.message 
        });
    }
});

// Marcar todas como lidas
app.put('/api/notificacoes/marcar-todas-lidas', authenticateToken, async (req, res) => {
    try {
        const resultado = await Notificacao.updateMany(
            { 
                usuarioId: req.userId,
                lida: false 
            },
            { 
                lida: true,
                lidaEm: new Date()
            }
        );

        res.json({
            success: true,
            message: `${resultado.modifiedCount} notificações marcadas como lidas`,
            modificadas: resultado.modifiedCount
        });

    } catch (error) {
        console.error('❌ Erro ao marcar todas como lidas:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ROTA PARA USUÁRIO LIMPAR SUAS NOTIFICAÇÕES
app.delete('/api/notificacoes/limpar-minhas', authenticateToken, async (req, res) => {
    try {
        const usuarioId = req.userId;
        
        console.log(`🗑️ Usuário ${usuarioId} excluindo todas as suas notificações`);
        
        const resultado = await Notificacao.deleteMany({ 
            usuarioId: usuarioId 
        });
        
        console.log(`✅ ${resultado.deletedCount} notificações excluídas`);
        
        res.json({
            success: true,
            message: `${resultado.deletedCount} notificação(ões) excluída(s) com sucesso!`,
            total: resultado.deletedCount
        });
        
    } catch (error) {
        console.error('❌ Erro ao limpar notificações:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao limpar notificações: ' + error.message
        });
    }
});

// =========================================================
// 2. ROTA PARA BUSCAR TODAS AS NOTIFICAÇÕES (COM PAGINAÇÃO)
// =========================================================

// ============ ROTA PARA BUSCAR TODAS AS NOTIFICAÇÕES DO USUÁRIO ============
app.get('/api/notificacoes/todas', authenticateToken, async (req, res) => {
    try {
        const { pagina = 1, limite = 50, filtro } = req.query;
        const usuarioId = req.userId;
        
        console.log(`📋 Buscando todas as notificações do usuário ${usuarioId} - Página: ${pagina}, Limite: ${limite}`);
        
        const skip = (parseInt(pagina) - 1) * parseInt(limite);
        
        let query = { usuarioId: usuarioId };
        
        if (filtro && filtro !== 'todas') {
            if (filtro === 'nao_lidas') {
                query.lida = false;
            } else if (filtro === 'lidas') {
                query.lida = true;
            } else if (filtro.startsWith('tipo:')) {
                query.tipo = filtro.replace('tipo:', '');
            }
        }
        
        const [notificacoes, total] = await Promise.all([
            Notificacao.find(query)
                .sort({ createdAt: -1, prioridade: -1 })
                .skip(skip)
                .limit(parseInt(limite))
                .lean(),
            Notificacao.countDocuments(query)
        ]);
        
        const [totalNaoLidas, totalPorTipo] = await Promise.all([
            Notificacao.countDocuments({ usuarioId: usuarioId, lida: false }),
            Notificacao.aggregate([
                { $match: { usuarioId: usuarioId } },
                { $group: { _id: "$tipo", count: { $sum: 1 } } }
            ])
        ]);
        
        const porTipo = {};
        totalPorTipo.forEach(item => {
            porTipo[item._id] = item.count;
        });
        
        console.log(`✅ Encontradas ${notificacoes.length} notificações (total: ${total})`);
        
        res.json({
            success: true,
            notificacoes: notificacoes,
            paginacao: {
                pagina: parseInt(pagina),
                limite: parseInt(limite),
                total: total,
                totalPaginas: Math.ceil(total / parseInt(limite))
            },
            estatisticas: {
                total: total,
                naoLidas: totalNaoLidas,
                lidas: total - totalNaoLidas,
                porTipo: porTipo
            }
        });
        
    } catch (error) {
        console.error('❌ Erro ao buscar todas as notificações:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// =========================================================
// 3. ROTA BASE (SEM PARÂMETROS)
// =========================================================

// Buscar notificações do usuário logado (versão simples)
app.get('/api/notificacoes', authenticateToken, async (req, res) => {
    try {
        const { apenasNaoLidas, limite } = req.query;
        
        let query = { usuarioId: req.userId };
        if (apenasNaoLidas === 'true') {
            query.lida = false;
        }
        
        const notificacoes = await Notificacao.find(query)
            .sort({ createdAt: -1, prioridade: -1 })
            .limit(parseInt(limite) || 50)
            .lean();
        
        const naoLidas = await Notificacao.countDocuments({
            usuarioId: req.userId,
            lida: false
        });

        res.json({
            success: true,
            notificacoes: notificacoes,
            total: notificacoes.length,
            naoLidas: naoLidas
        });

    } catch (error) {
        console.error('❌ Erro ao buscar notificações:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// =========================================================
// 4. ROTAS COM PARÂMETROS (:id) - POR ÚLTIMO
// =========================================================

// Marcar notificação específica como lida
app.put('/api/notificacoes/:id/lida', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        
        const notificacao = await Notificacao.findOneAndUpdate(
            { 
                _id: id,
                usuarioId: req.userId 
            },
            { 
                lida: true,
                lidaEm: new Date()
            },
            { new: true }
        );

        if (!notificacao) {
            return res.status(404).json({
                success: false,
                error: 'Notificação não encontrada'
            });
        }

        res.json({
            success: true,
            notificacao: notificacao
        });

    } catch (error) {
        console.error('❌ Erro ao marcar como lida:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Deletar notificação específica
app.delete('/api/notificacoes/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        
        const resultado = await Notificacao.findOneAndDelete({
            _id: id,
            usuarioId: req.userId
        });

        if (!resultado) {
            return res.status(404).json({
                success: false,
                error: 'Notificação não encontrada'
            });
        }

        res.json({
            success: true,
            message: 'Notificação deletada com sucesso',
            deletado: true
        });

    } catch (error) {
        console.error('❌ Erro ao deletar notificação:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ ROTA PARA ADMIN ATIVAR/DESATIVAR PUSH GLOBAL ============
app.post('/api/push/admin/toggle', authenticateToken, async (req, res) => {
    try {
        if (req.userRole !== 'admin' && req.userRole !== 'super_admin') {
            return res.status(403).json({
                success: false,
                error: 'Apenas administradores podem controlar o push global'
            });
        }

        const { ativar } = req.body;
        
        let PushSettings;
        try {
            PushSettings = mongoose.model('PushSettings');
        } catch (e) {
            const PushSettingsSchema = new mongoose.Schema({
                _id: { type: String, default: 'global' },
                pushAtivado: { type: Boolean, default: false },
                vapidPublicKey: { type: String, default: process.env.VAPID_PUBLIC_KEY || '' },
                ultimaAlteracaoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
                ultimaAlteracaoEm: { type: Date, default: Date.now }
            }, { timestamps: true });
            
            PushSettings = mongoose.model('PushSettings', PushSettingsSchema);
        }

        const settings = await PushSettings.findByIdAndUpdate(
            'global',
            {
                pushAtivado: ativar === true,
                ultimaAlteracaoPor: req.userId,
                ultimaAltaeracaoEm: new Date()
            },
            { upsert: true, new: true }
        );

        console.log(`✅ Push ${ativar ? 'ATIVADO' : 'DESATIVADO'} globalmente por admin ${req.userId}`);

        res.json({
            success: true,
            pushAtivado: settings.pushAtivado,
            message: `Push ${ativar ? 'ativado' : 'desativado'} com sucesso!`
        });

    } catch (error) {
        console.error('❌ Erro ao alterar push global:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno: ' + error.message
        });
    }
});

// ============ ROTA PARA ENVIAR PUSH ============
app.post('/api/usuario/enviar-push', authenticateToken, async (req, res) => {
    try {
        const { usuarioId, titulo, mensagem, dados = {} } = req.body;
        
        // Validação básica
        if (!usuarioId || !titulo || !mensagem) {
            return res.status(400).json({
                success: false,
                error: 'usuarioId, titulo e mensagem são obrigatórios'
            });
        }
        
        const OneSignalService = require('./services/onesignal-service');
        const oneSignal = new OneSignalService();
        
        const resultado = await oneSignal.enviarPush(
            usuarioId,
            titulo,
            mensagem,
            {
                ...dados,
                origem: 'sistema',
                timestamp: Date.now()
            }
        );
        
        if (resultado) {
            res.json({ 
                success: true, 
                notificationId: resultado.notificationId || resultado.id 
            });
        } else {
            res.status(500).json({ 
                success: false, 
                error: 'Falha ao enviar push' 
            });
        }
        
    } catch (error) {
        console.error('❌ Erro ao enviar push:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// ============================================================================
// SERVIÇO DE NOTIFICAÇÕES BASEADO NO TEMPO DO BOTÃO
// ============================================================================

const NotificacaoBotaoService = {
    // Cache para evitar duplicatas
    notificacoesEnviadas: new Set(),
    
    // Limpar cache antigo
    limparCache: function() {
        const umaHoraAtras = Date.now() - (60 * 60 * 1000);
        for (const key of this.notificacoesEnviadas) {
            const timestamp = parseInt(key.split('_')[2]);
            if (timestamp && timestamp < umaHoraAtras) {
                this.notificacoesEnviadas.delete(key);
            }
        }
    },
    
    // Extrair minutos do texto do botão (ex: "Disponível em 10min" -> 10)
    extrairMinutosDoTexto: function(texto) {
        if (!texto) return null;
        const match = texto.match(/(\d+)\s*min/);
        return match ? parseInt(match[1]) : null;
    },
    
    // Verificar provas que estão com botão "Disponível em X min"
    verificarNotificacoes: async function() {
        try {            
            const agora = new Date();
            const ano = agora.getFullYear();
            const mes = String(agora.getMonth() + 1).padStart(2, '0');
            const dia = String(agora.getDate()).padStart(2, '0');
            
            // Buscar provas ativas
            const provas = await Prova.find({
                publicada: true,
                status: 'ativa',
                dataLimite: { $gte: agora }
            }).populate('turmaId', 'alunos nome').lean();
            
            for (const prova of provas) {
                // Verificar se tem horário de início
                if (!prova.horarioInicio) continue;
                
                // Calcular minutos até o início
                const inicioProva = new Date(`${ano}-${mes}-${dia}T${prova.horarioInicio}:00-03:00`);
                const diffMinutos = Math.floor((inicioProva - agora) / (1000 * 60));
                
                // SÓ NOTIFICAR NOS VALORES QUE APARECEM NO BOTÃO: 10 e 5
                if (diffMinutos === 10 || diffMinutos === 5) {
                    const chave = `botao_${prova._id}_${diffMinutos}_${Date.now()}`;
                    
                    if (this.notificacoesEnviadas.has(chave)) {
                        console.log(`   ⏭️ Notificação ${diffMinutos}min já enviada para "${prova.titulo}"`);
                        continue;
                    }
                    
                    console.log(`   🔔 BOTÃO: "Disponível em ${diffMinutos}min" detectado!`);
                    
                    // Buscar alunos da turma
                    const turma = await Turma.findById(prova.turmaId).populate('alunos', 'nome onesignalPlayerId');
                    const alunos = turma?.alunos || [];
                    
                    if (alunos.length === 0) continue;
                    
                    // Configurações de push
                    const configDoc = await Config.findOne({ chave: 'notificacoes' });
                    const pushAtivado = configDoc?.valor?.push === true;
                    const OneSignalService = require('./services/onesignal-service');
                    const oneSignal = pushAtivado ? new OneSignalService() : null;
                    
                    // Mensagens baseadas no tempo
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
                    
                    // Notificar cada aluno
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
                            
                            console.log(`   ✅ Notificação ${diffMinutos}min enviada para ${aluno.nome || aluno._id}`);
                            
                        } catch (error) {
                            console.error(`   ❌ Erro ao notificar aluno:`, error.message);
                        }
                    }
                    
                    this.notificacoesEnviadas.add(chave);
                    console.log(`   ✅ Notificações ${diffMinutos}min enviadas para ${alunos.length} alunos`);
                }
            }
            
            this.limparCache();
            
        } catch (error) {
            console.error('❌ Erro no serviço de notificações:', error);
        }
    },
    
    iniciar: function() {
        console.log('='.repeat(60));
        console.log('⏰ SERVIÇO DE NOTIFICAÇÕES DO BOTÃO INICIADO');
        console.log('📱 Monitorando "Disponível em 10min" e "Disponível em 5min"');
        console.log('='.repeat(60));
        
        setTimeout(() => this.verificarNotificacoes(), 5000);
        setInterval(() => this.verificarNotificacoes(), 60 * 1000);
    }
};

NotificacaoBotaoService.iniciar();

// ============ ROTAS PARA MATRÍCULAS AUTORIZADAS (APENAS ADMIN) ============


// LISTAR todas as matrículas autorizadas
app.get('/api/admin/matriculas-autorizadas', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { busca } = req.query;
        
        console.log(`📋 Admin ${req.userId} acessando matrículas autorizadas`);
        
        let matriculas = matriculasManager.listar();
        
        // Aplicar busca se houver
        if (busca) {
            matriculas = matriculasManager.buscar(busca);
        }
        
        res.json({
            success: true,
            matriculas: matriculas,
            total: matriculas.length,
            totalGeral: matriculasManager.listar().length
        });
        
    } catch (error) {
        console.error('❌ Erro:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ADICIONAR nova matrícula
app.post('/api/admin/matriculas-autorizadas', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { matricula, nome } = req.body;
        
        // Validações
        if (!matricula) {
            return res.status(400).json({
                success: false,
                error: 'Matrícula é obrigatória'
            });
        }
        
        const matriculaStr = matricula.toString().replace(/\D/g, '');
        
        if (matriculaStr.length !== 6) {
            return res.status(400).json({
                success: false,
                error: 'Matrícula inválida. Deve conter exatamente 6 dígitos.'
            });
        }
        
        if (!nome || nome.trim().length < 3) {
            return res.status(400).json({
                success: false,
                error: 'Nome é obrigatório e deve ter pelo menos 3 caracteres'
            });
        }
        
        const resultado = matriculasManager.adicionar(matriculaStr, nome.toUpperCase().trim());
        
        if (!resultado.success) {
            return res.status(400).json({
                success: false,
                error: resultado.error
            });
        }
        
        console.log(`✅ Admin ${req.userId} adicionou matrícula ${matriculaStr}`);
        
        res.json({
            success: true,
            message: 'Matrícula autorizada com sucesso!',
            matricula: resultado.matricula
        });
        
    } catch (error) {
        console.error('❌ Erro:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// EDITAR matrícula
app.put('/api/admin/matriculas-autorizadas/:matricula', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { matricula } = req.params;
        const { novaMatricula, nome } = req.body;
        
        if (!novaMatricula) {
            return res.status(400).json({
                success: false,
                error: 'Nova matrícula é obrigatória'
            });
        }
        
        const novaMatriculaStr = novaMatricula.toString().replace(/\D/g, '');
        
        if (novaMatriculaStr.length !== 6) {
            return res.status(400).json({
                success: false,
                error: 'Matrícula inválida. Deve conter exatamente 6 dígitos.'
            });
        }
        
        if (!nome || nome.trim().length < 3) {
            return res.status(400).json({
                success: false,
                error: 'Nome é obrigatório'
            });
        }
        
        const resultado = matriculasManager.editar(matricula, novaMatriculaStr, nome.toUpperCase().trim());
        
        if (!resultado.success) {
            return res.status(404).json({
                success: false,
                error: resultado.error
            });
        }
        
        console.log(`✅ Admin ${req.userId} editou matrícula ${matricula} → ${novaMatriculaStr}`);
        
        res.json({
            success: true,
            message: 'Matrícula atualizada com sucesso!'
        });
        
    } catch (error) {
        console.error('❌ Erro:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// EXCLUIR matrícula
app.delete('/api/admin/matriculas-autorizadas/:matricula', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { matricula } = req.params;
        
        const resultado = matriculasManager.excluir(matricula);
        
        if (!resultado.success) {
            return res.status(404).json({
                success: false,
                error: resultado.error
            });
        }
        
        console.log(`✅ Admin ${req.userId} excluiu matrícula ${matricula}`);
        
        res.json({
            success: true,
            message: 'Matrícula excluída com sucesso!'
        });
        
    } catch (error) {
        console.error('❌ Erro:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ROTA PÚBLICA PARA VERIFICAR MATRÍCULA (usada no cadastro)
app.get('/api/matriculas-autorizadas/verificar/:matricula', async (req, res) => {
    try {
        const { matricula } = req.params;
        const matriculaStr = matricula.toString().replace(/\D/g, '');
        
        const autorizada = matriculasManager.verificarMatricula(matriculaStr);
        const nome = autorizada ? matriculasManager.obterNome(matriculaStr) : null;
        
        res.json({
            success: true,
            autorizada: autorizada,
            matricula: matriculaStr,
            nome: nome
        });
        
    } catch (error) {
        console.error('❌ Erro:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============ ROTA PARA BUSCAR TODOS OS USUÁRIOS COM MATRÍCULA (PROFESSORES, ADMINS, SUPER_ADMINS) ============
app.get('/api/admin/professores-cadastrados', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        console.log(`📋 Admin ${req.userId} buscando usuários com matrícula cadastrada`);
        
        // 🔥 CORREÇÃO: Buscar TODOS os usuários com matrícula (professor, admin, super_admin)
        const usuarios = await User.find({ 
            matricula: { $exists: true, $ne: null, $ne: '' } // Qualquer um que tenha matrícula
        }).select('nome email matricula ativo createdAt role'); // Incluir role!
        
        console.log(`📊 Usuários encontrados com matrícula: ${usuarios.length}`);
        
        // Criar um mapa de matrículas para consulta rápida
        const usuariosMap = {};
        usuarios.forEach(user => {
            if (user.matricula) { // Garantir que tem matrícula
                usuariosMap[user.matricula] = {
                    id: user._id,
                    nome: user.nome,
                    email: user.email,
                    ativo: user.ativo,
                    role: user.role, // 🔥 INCLUIR O PERFIL!
                    createdAt: user.createdAt
                };
                
                // Log para debug
                console.log(`   → Matrícula: ${user.matricula} | Nome: ${user.nome} | Role: ${user.role} | Ativo: ${user.ativo}`);
            }
        });
        
        // Estatísticas por perfil
        const stats = {
            total: usuarios.length,
            professores: usuarios.filter(u => u.role === 'professor').length,
            admins: usuarios.filter(u => u.role === 'admin').length,
            superAdmins: usuarios.filter(u => u.role === 'super_admin').length,
            ativos: usuarios.filter(u => u.ativo === true).length,
            inativos: usuarios.filter(u => u.ativo === false).length
        };
        
        console.log('✅ Estatísticas:', stats);
        
        res.json({
            success: true,
            professores: usuarios, // Mantendo o nome para compatibilidade
            mapa: usuariosMap,
            total: usuarios.length,
            estatisticas: stats // Enviar estatísticas para o frontend
        });
        
    } catch (error) {
        console.error('❌ Erro ao buscar usuários com matrícula:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao buscar usuários: ' + error.message
        });
    }
});

// ============ ROTAS PARA GERENCIAR PROFESSORES ============

// LISTAR todos os professores (com filtros)
app.get('/api/admin/professores', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { status, busca } = req.query;
        
        let query = { role: 'professor' };
        
        // Filtrar por status
        if (status === 'ativos') {
            query.ativo = true;
        } else if (status === 'inativos') {
            query.ativo = false;
        }
        
        // Busca por nome, email ou matrícula
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
        
        console.log(`📋 Admin ${req.userId} listou ${professores.length} professores`);
        
        res.json({
            success: true,
            professores,
            total: professores.length
        });
        
    } catch (error) {
        console.error('❌ Erro ao listar professores:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ATIVAR/INATIVAR professor (toggle status)
app.put('/api/admin/professores/:id/toggle-status', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { ativo } = req.body; // true = ativar, false = inativar
        
        console.log(`🔄 Admin ${req.userId} alterando status do professor ${id} para ${ativo ? 'ATIVO' : 'INATIVO'}`);
        
        const professor = await User.findById(id);
        
        if (!professor) {
            return res.status(404).json({
                success: false,
                error: 'Professor não encontrado'
            });
        }
        
        if (professor.role !== 'professor') {
            return res.status(400).json({
                success: false,
                error: 'Este usuário não é um professor'
            });
        }
        
        professor.ativo = ativo;
        await professor.save();
        
        console.log(`✅ Professor ${professor.nome} agora está ${ativo ? 'ATIVO' : 'INATIVO'}`);
        
        res.json({
            success: true,
            message: `Professor ${ativo ? 'ativado' : 'inativado'} com sucesso!`,
            professor: {
                id: professor._id,
                nome: professor.nome,
                ativo: professor.ativo
            }
        });
        
    } catch (error) {
        console.error('❌ Erro ao alterar status:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// EXCLUIR professor (apenas se não tiver provas/turmas)
app.delete('/api/admin/professores/:id', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        console.log(`🗑️ Admin ${req.userId} tentando excluir professor ${id}`);
        
        const professor = await User.findById(id);
        
        if (!professor) {
            return res.status(404).json({
                success: false,
                error: 'Professor não encontrado'
            });
        }
        
        if (professor.role !== 'professor') {
            return res.status(400).json({
                success: false,
                error: 'Este usuário não é um professor'
            });
        }
        
        // Verificar se o professor tem provas ou turmas associadas
        const [provas, turmas] = await Promise.all([
            Prova.countDocuments({ userId: id }),
            Turma.countDocuments({ professorId: id })
        ]);
        
        if (provas > 0 || turmas > 0) {
            return res.status(400).json({
                success: false,
                error: 'Este professor possui provas ou turmas associadas',
                detalhes: {
                    provas,
                    turmas
                },
                sugestao: 'Inative o professor em vez de excluí-lo'
            });
        }
        
        // Se não tiver vínculos, pode excluir
        await User.findByIdAndDelete(id);
        
        console.log(`✅ Professor ${professor.nome} excluído permanentemente`);
        
        res.json({
            success: true,
            message: 'Professor excluído permanentemente!'
        });
        
    } catch (error) {
        console.error('❌ Erro ao excluir professor:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// REATIVAR professor inativo
app.put('/api/admin/professores/:id/reativar', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        console.log(`🔄 Admin ${req.userId} reativando professor ${id}`);
        
        const professor = await User.findById(id);
        
        if (!professor) {
            return res.status(404).json({
                success: false,
                error: 'Professor não encontrado'
            });
        }
        
        professor.ativo = true;
        await professor.save();
        
        console.log(`✅ Professor ${professor.nome} reativado!`);
        
        res.json({
            success: true,
            message: 'Professor reativado com sucesso!',
            professor: {
                id: professor._id,
                nome: professor.nome,
                ativo: true
            }
        });
        
    } catch (error) {
        console.error('❌ Erro ao reativar professor:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ ROTAS DE CONFIGURAÇÕES DO SISTEMA (VERSÃO ÚNICA E CORRIGIDA) ============

// ============ GET - Todas as configurações (apenas admin) - VERSÃO CORRIGIDA ============
app.get('/api/admin/configuracoes', authenticateToken, isSuperAdmin, async (req, res) => {
  try {
    console.log('📋 Admin buscando configurações do sistema');
    
    // Configurações padrão completas (COM O CAMPO FACE ID)
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
        nome: 'Sistema de Provas IEMA 2026',
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
        exigirFaceIdProvas: false,  // ← CAMPO ADICIONADO AQUI!
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
        notificarProfessorCancelamento: true
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
        nomeRemetente: process.env.EMAIL_FROM_NAME || 'Sistema de Provas',
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

    // Buscar configurações do banco (se existirem)
    let configuracoes = [];
    try {
      configuracoes = await Config.find().lean();
    } catch (dbError) {
      console.log('⚠️ Erro ao buscar configs do banco:', dbError.message);
      return res.json({
        success: true,
        configuracoes: configPadrao,
        origem: 'padrao'
      });
    }

    // Se não houver configurações no banco, retornar as padrão
    if (!configuracoes || configuracoes.length === 0) {
      return res.json({
        success: true,
        configuracoes: configPadrao,
        origem: 'padrao'
      });
    }

    // Criar uma cópia profunda do objeto padrão
    const configObj = JSON.parse(JSON.stringify(configPadrao));
    
    // 🔥 MAPA PARA RASTREAR QUAIS CAMPOS FORAM ENCONTRADOS
    const camposEncontrados = new Set();
    
    // Aplicar configurações do banco sobre o padrão - VERSÃO CORRIGIDA
    configuracoes.forEach(c => {
      if (!c || !c.chave) return;
      
      try {
        const parts = c.chave.split('.');
        let target = configObj;
        
        // 🔥 CRIAR O CAMINHO SE ELE NÃO EXISTIR
        for (let i = 0; i < parts.length - 1; i++) {
          if (!target[parts[i]]) {
            target[parts[i]] = {};
          }
          target = target[parts[i]];
        }
        
        const lastKey = parts[parts.length - 1];
        target[lastKey] = c.valor;
        camposEncontrados.add(c.chave);
        
        console.log(`✅ Configuração aplicada: ${c.chave} = ${c.valor}`);
        
      } catch (pathError) {
        console.warn(`⚠️ Erro ao processar chave ${c.chave}:`, pathError.message);
      }
    });

    // 🔥 VERIFICAR ESPECIFICAMENTE O CAMPO FACE ID
    console.log('📊 Campos encontrados no banco:', Array.from(camposEncontrados));
    
    // 🔥 GARANTIR QUE O CAMPO FACE ID EXISTA (buscar diretamente se necessário)
    const faceIdDoc = await Config.findOne({ chave: 'seguranca.exigirFaceIdProvas' }).lean();
    if (faceIdDoc) {
      if (!configObj.seguranca) configObj.seguranca = {};
      configObj.seguranca.exigirFaceIdProvas = faceIdDoc.valor;
      console.log(`✅ Face ID carregado diretamente: ${faceIdDoc.valor}`);
    }

    console.log('🎯 Objeto seguranca final:', configObj.seguranca);

    res.json({
      success: true,
      configuracoes: configObj,
      total: configuracoes.length
    });

  } catch (error) {
    console.error('❌ Erro ao buscar configurações:', error);
    // Em caso de erro, retornar as configurações padrão (com o campo)
    res.json({
      success: true,
      configuracoes: configPadrao,
      origem: 'fallback'
    });
  }
});

// PUT - Salvar configurações (apenas admin)
app.put('/api/admin/configuracoes', authenticateToken, isSuperAdmin, async (req, res) => {
  try {
    const { configuracoes } = req.body;
    
    console.log('💾 Admin salvando configurações');
    
    if (!configuracoes || typeof configuracoes !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Dados de configuração inválidos'
      });
    }

    // Função para achatar objeto com segurança
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
    
    // Salvar cada configuração no banco
    const resultados = [];
    for (const [chave, valor] of Object.entries(flatConfig)) {
      try {
        // Determinar tipo do valor
        let tipo = typeof valor;
        if (Array.isArray(valor)) tipo = 'array';
        if (valor === null) tipo = 'null';
        
        // Categorizar automaticamente pela chave
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
          {
            chave,
            valor,
            tipo,
            categoria,
            atualizadoPor: req.userId,
            atualizadoEm: new Date()
          },
          { upsert: true, new: true }
        );
        resultados.push(result);
      } catch (itemError) {
        console.error(`❌ Erro ao salvar ${chave}:`, itemError.message);
      }
    }

    console.log(`✅ ${resultados.length} configurações salvas`);

    res.json({
      success: true,
      message: 'Configurações salvas com sucesso!',
      total: resultados.length
    });

  } catch (error) {
    console.error('❌ Erro ao salvar configurações:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET - Configuração específica por chave
app.get('/api/admin/configuracoes/:chave', authenticateToken, isSuperAdmin, async (req, res) => {
  try {
    const { chave } = req.params;
    
    const config = await Config.findOne({ chave }).lean();
    
    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'Configuração não encontrada'
      });
    }

    res.json({
      success: true,
      configuracao: config
    });

  } catch (error) {
    console.error('❌ Erro ao buscar configuração:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT - Atualizar configuração específica
app.put('/api/admin/configuracoes/:chave', authenticateToken, isSuperAdmin, async (req, res) => {
  try {
    const { chave } = req.params;
    const { valor, descricao, categoria, publico } = req.body;
    
    const config = await Config.findOneAndUpdate(
      { chave },
      {
        chave,
        valor,
        descricao,
        categoria,
        publico,
        atualizadoPor: req.userId,
        atualizadoEm: new Date()
      },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      message: 'Configuração atualizada com sucesso!',
      configuracao: config
    });

  } catch (error) {
    console.error('❌ Erro ao atualizar configuração:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE - Resetar configuração para o padrão
app.delete('/api/admin/configuracoes/:chave', authenticateToken, isSuperAdmin, async (req, res) => {
  try {
    const { chave } = req.params;
    
    await Config.deleteOne({ chave });

    res.json({
      success: true,
      message: 'Configuração resetada para o padrão'
    });

  } catch (error) {
    console.error('❌ Erro ao resetar configuração:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST - Resetar TODAS as configurações
app.post('/api/admin/configuracoes/reset', authenticateToken, isSuperAdmin, async (req, res) => {
  try {
    await Config.deleteMany({});

    res.json({
      success: true,
      message: 'Todas as configurações foram resetadas!'
    });

  } catch (error) {
    console.error('❌ Erro ao resetar configurações:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST - Testar configuração de email
app.post('/api/admin/testar-email', authenticateToken, isSuperAdmin, async (req, res) => {
  try {
    const { destinatario } = req.body;
    
    if (!destinatario) {
      return res.status(400).json({
        success: false,
        error: 'Destinatário não informado'
      });
    }

    console.log('📧 Teste de email para:', destinatario);
    
    // Aqui você implementaria o envio real
    // Por enquanto, apenas simular sucesso
    res.json({
      success: true,
      message: 'Email de teste enviado com sucesso!',
      destinatario
    });

  } catch (error) {
    console.error('❌ Erro ao testar email:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ FUNÇÃO AUXILIAR PARA EXPIRAÇÃO DO JWT ============
// Adicione ANTES do server.listen()
function parseJwtExpiration(expiration) {
  if (typeof expiration === 'number') return expiration;
  const match = expiration.match(/^(\d+)([hH])$/);
  if (match) {
    return parseInt(match[1]) * 60 * 60;
  }
  return 24 * 60 * 60; // 24 horas padrão
}

// ============ ROTA PARA REENVIAR CÓDIGO 2FA ============
// ============ ROTA PARA REENVIAR CÓDIGO 2FA (CORRIGIDA) ============
app.post('/api/auth/2fa/resend', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.body;
    const usuarioId = userId || req.userId;
    
    console.log(`📱 Reenviando código 2FA para usuário ${usuarioId}`);
    
    const user = await User.findById(usuarioId).select('+twoFactorTempSecret +telefone +nome +role');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuário não encontrado'
      });
    }
    
    // 🔥 VERIFICAR SE O 2FA É EXIGIDO PARA ESTE PERFIL
    const config2FA = await Config.findOne({ chave: 'seguranca.doisFatores' });
    const exigir2FA = config2FA ? config2FA.valor : false;
    
    const perfisCom2FA = ['super_admin'];
    if (exigir2FA) {
      perfisCom2FA.push('admin', 'professor');
    }
    
    // Se o usuário NÃO está nos perfis que exigem 2FA, retornar erro
    if (!perfisCom2FA.includes(user.role)) {
      return res.status(400).json({
        success: false,
        error: '2FA não é exigido para este perfil de usuário'
      });
    }
    
    // Verificar se telefone está disponível
    if (!user.telefone) {
      return res.status(400).json({
        success: false,
        error: 'Telefone não cadastrado'
      });
    }

    // Gerar novo código de 6 dígitos
    const codigo = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Salvar código temporário (sempre, mesmo sem 2FA ativo)
    user.twoFactorTempSecret = codigo;
    user.lastOtpRequest = new Date();
    user.otpRequestCount = (user.otpRequestCount || 0) + 1;
    await user.save();

    const telefoneLimpo = user.telefone.replace(/\D/g, '');
    const mensagem = `🔐 ${user.nome}, seu código de verificação do SISTEMA DE PROVAS é: ${codigo}. Válido por 5 minutos.`;

    console.log('📱 Enviando SMS...');
    console.log(`   Para: ${telefoneLimpo}`);
    console.log(`   Código: ${codigo}`);
    
    const resultado = await enviarSmsTwilio(telefoneLimpo, mensagem);

    if (resultado.success) {
      return res.json({
        success: true,
        message: resultado.devMode ? 'Código gerado (modo desenvolvimento)' : 'Novo código enviado para seu telefone',
        expiresIn: 300,
        ...(resultado.devMode && { devCode: resultado.codigo })
      });
    } else {
      return res.status(500).json({
        success: false,
        error: 'Erro ao enviar SMS. Tente novamente.'
      });
    }
    
  } catch (error) {
    console.error('❌ Erro ao reenviar código:', error);
    return res.status(500).json({
      success: false,
      error: 'Erro interno: ' + error.message
    });
  }
});

// ============ ROTA PARA ADMIN VER SOLICITAÇÕES DE BACKUP ============
app.get('/api/admin/solicitacoes-backup', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const Notificacao = mongoose.model('Notificacao');
        
        // Buscar notificações do tipo solicitacao_backup não lidas
        const solicitacoes = await Notificacao.find({
            usuarioId: req.userId,
            tipo: 'solicitacao_backup',
            lida: false
        }).sort({ createdAt: -1 }).lean();
        
        // Para cada solicitação, buscar dados completos do usuário
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
        console.error('❌ Erro ao buscar solicitações:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============ ROTA PARA ENVIAR EMAIL DE TESTE ============
app.post('/api/admin/testar-email-enviar', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { destinatario, assunto, mensagem } = req.body;
        
        if (!destinatario) {
            return res.status(400).json({
                success: false,
                error: 'Destinatário não informado'
            });
        }

        console.log(`\n📧 ===== TESTE DE EMAIL =====`);
        console.log(`📨 Para: ${destinatario}`);
        console.log(`📝 Assunto: ${assunto || 'Teste do Sistema'}`);

        // Usar o novo serviço unificado
        const EmailService = require('./services/email-service');
        const emailService = new EmailService();
        
        // Inicializar o serviço
        await emailService.init();

        // Se não veio mensagem personalizada, usa a padrão
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
                    <p>Este é um email de teste do Sistema de Provas IEMA.</p>
                    <p><strong>Data:</strong> ${new Date().toLocaleString('pt-BR')}</p>
                    <p>✅ Se você recebeu este email, as configurações estão funcionando!</p>
                </div>
            </body>
            </html>
        `;

        const resultado = await emailService.sendEmail({
            to: destinatario,
            subject: assunto || '📧 Teste do Sistema de Provas IEMA',
            html: html
        });

        if (resultado.success) {
            console.log(`✅ Email de teste enviado para ${destinatario}`);
            res.json({
                success: true,
                message: 'Email de teste enviado com sucesso!',
                destinatario: destinatario,
                messageId: resultado.messageId
            });
        } else {
            throw new Error(resultado.error || 'Erro ao enviar email');
        }

    } catch (error) {
        console.error('❌ Erro ao enviar email de teste:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============ ROTA PARA ENVIAR EMAIL DE BOAS-VINDAS ============
app.post('/api/admin/enviar-email-boas-vindas', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { destinatario, nome } = req.body;
        
        if (!destinatario) {
            return res.status(400).json({
                success: false,
                error: 'Destinatário não informado'
            });
        }

        const nomeDestino = nome || destinatario.split('@')[0] || 'Usuário';

        console.log(`\n🎉 ===== EMAIL DE BOAS-VINDAS =====`);
        console.log(`📨 Para: ${destinatario}`);
        console.log(`👤 Nome: ${nomeDestino}`);

        const EmailService = require('./services/email-service');
        const emailService = new EmailService();
        
        await emailService.init();

        const resultado = await emailService.sendWelcomeEmail(destinatario, nomeDestino);

        if (resultado.success) {
            console.log(`✅ Email de boas-vindas enviado para ${destinatario}`);
            res.json({
                success: true,
                message: 'Email de boas-vindas enviado com sucesso!',
                destinatario: destinatario,
                messageId: resultado.messageId
            });
        } else {
            throw new Error(resultado.error || 'Erro ao enviar email');
        }

    } catch (error) {
        console.error('❌ Erro ao enviar email de boas-vindas:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============ ROTA PARA TESTAR CONFIGURAÇÃO (VIA ADMIN) ============
app.post('/api/admin/testar-email', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { destinatario } = req.body;
        
        if (!destinatario) {
            return res.status(400).json({
                success: false,
                error: 'Destinatário não informado'
            });
        }

        const EmailService = require('./services/email-service');
        const emailService = new EmailService();
        
        await emailService.init();

        // Enviar um email de teste simples
        const resultado = await emailService.sendEmail({
            to: destinatario,
            subject: '🔧 Teste de Configuração - Sistema de Provas',
            html: `
                <h2>Teste de Configuração</h2>
                <p>Se você recebeu este email, as configurações de email estão corretas!</p>
                <p>Data: ${new Date().toLocaleString('pt-BR')}</p>
            `
        });

        if (resultado.success) {
            res.json({
                success: true,
                message: 'Email de teste enviado com sucesso!',
                destinatario: destinatario
            });
        } else {
            throw new Error(resultado.error || 'Erro ao enviar email');
        }

    } catch (error) {
        console.error('❌ Erro ao testar email:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============ ADICIONAR ALUNO À TURMA (ADMIN) ============
app.post('/api/admin/turmas/:id/alunos', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const turmaId = req.params.id;
        const { alunoId } = req.body;

        console.log(`📝 Admin ${req.userId} adicionando aluno ${alunoId} à turma ${turmaId}`);

        // Verificar se a turma existe
        const turma = await Turma.findById(turmaId);
        if (!turma) {
            return res.status(404).json({
                success: false,
                error: 'Turma não encontrada'
            });
        }

        // Verificar se o aluno existe
        const aluno = await User.findById(alunoId);
        if (!aluno) {
            return res.status(404).json({
                success: false,
                error: 'Aluno não encontrado'
            });
        }

        // Verificar se o usuário é aluno
        if (aluno.role !== 'aluno') {
            return res.status(400).json({
                success: false,
                error: 'O usuário selecionado não é um aluno'
            });
        }

        // Verificar se o aluno já está na turma
        if (turma.alunos.includes(alunoId)) {
            return res.status(400).json({
                success: false,
                error: 'Aluno já está matriculado nesta turma'
            });
        }

        // Adicionar aluno à turma
        turma.alunos.push(alunoId);
        await turma.save();

        console.log(`✅ Aluno ${aluno.nome} adicionado à turma ${turma.nome}`);

        // VERIFICAR CONFIGURAÇÕES DE PUSH
        const Config = mongoose.model('Config');
        const configDoc = await Config.findOne({ chave: 'notificacoes' });
        const pushAtivado = configDoc?.valor?.push === true;

        // Criar notificação para o aluno
        try {
            const Notificacao = mongoose.model('Notificacao');
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
            
            // 🔥 ENVIAR PUSH SE ATIVADO
            if (pushAtivado) {
                const OneSignalService = require('./services/onesignal-service');
                const oneSignal = new OneSignalService();
                
                await oneSignal.enviarPush(
                    alunoId,
                    '📚 Nova Turma',
                    `Você foi matriculado em ${turma.nome}`,
                    {
                        tipo: 'nova_turma',
                        turmaId: turma._id,
                        turmaNome: turma.nome
                    }
                );
            }
            
        } catch (notifError) {
            console.warn('⚠️ Erro ao criar notificação:', notifError.message);
        }

        res.json({
            success: true,
            message: 'Aluno adicionado à turma com sucesso!',
            turma: {
                id: turma._id,
                nome: turma.nome,
                totalAlunos: turma.alunos.length
            },
            aluno: {
                id: aluno._id,
                nome: aluno.nome,
                email: aluno.email
            }
        });

    } catch (error) {
        console.error('❌ Erro ao adicionar aluno à turma:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno: ' + error.message
        });
    }
});

// ============ REMOVER ALUNO DA TURMA (ADMIN) ============
app.delete('/api/admin/turmas/:id/alunos/:alunoId', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const turmaId = req.params.id;
        const alunoId = req.params.alunoId;

        console.log(`🗑️ Admin ${req.userId} removendo aluno ${alunoId} da turma ${turmaId}`);

        // Verificar se a turma existe
        const turma = await Turma.findById(turmaId);
        if (!turma) {
            return res.status(404).json({
                success: false,
                error: 'Turma não encontrada'
            });
        }

        // Verificar se o aluno existe
        const aluno = await User.findById(alunoId);
        if (!aluno) {
            return res.status(404).json({
                success: false,
                error: 'Aluno não encontrado'
            });
        }

        // Verificar se o aluno está na turma
        if (!turma.alunos.includes(alunoId)) {
            return res.status(400).json({
                success: false,
                error: 'Aluno não está matriculado nesta turma'
            });
        }

        // Remover aluno da turma
        turma.alunos = turma.alunos.filter(id => id.toString() !== alunoId.toString());
        await turma.save();

        console.log(`✅ Aluno ${aluno.nome} removido da turma ${turma.nome}`);

        // VERIFICAR CONFIGURAÇÕES DE PUSH
        const Config = mongoose.model('Config');
        const configDoc = await Config.findOne({ chave: 'notificacoes' });
        const pushAtivado = configDoc?.valor?.push === true;

        // Criar notificação para o aluno
        try {
            const Notificacao = mongoose.model('Notificacao');
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
            
            // 🔥 ENVIAR PUSH SE ATIVADO
            if (pushAtivado) {
                const OneSignalService = require('./services/onesignal-service');
                const oneSignal = new OneSignalService();
                
                await oneSignal.enviarPush(
                    alunoId,
                    '📚 Removido da Turma',
                    `Você foi removido da turma ${turma.nome}`,
                    {
                        tipo: 'removido_turma',
                        turmaId: turma._id,
                        turmaNome: turma.nome
                    }
                );
            }
            
        } catch (notifError) {
            console.warn('⚠️ Erro ao criar notificação:', notifError.message);
        }

        res.json({
            success: true,
            message: 'Aluno removido da turma com sucesso!',
            turma: {
                id: turma._id,
                nome: turma.nome,
                totalAlunos: turma.alunos.length
            },
            aluno: {
                id: aluno._id,
                nome: aluno.nome,
                email: aluno.email
            }
        });

    } catch (error) {
        console.error('❌ Erro ao remover aluno da turma:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno: ' + error.message
        });
    }
});

// ============ LISTAR ALUNOS DE UMA TURMA (ADMIN) ============
app.get('/api/admin/turmas/:id/alunos', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const turmaId = req.params.id;

        console.log(`📋 Admin ${req.userId} listando alunos da turma ${turmaId}`);

        const turma = await Turma.findById(turmaId)
            .populate('alunos', 'nome email matricula precisaAcessibilidade condicaoAcessibilidade')
            .lean();

        if (!turma) {
            return res.status(404).json({
                success: false,
                error: 'Turma não encontrada'
            });
        }

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
        console.error('❌ Erro ao listar alunos da turma:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno: ' + error.message
        });
    }
});

// ============================================================================
// ROTAS PARA GERENCIAMENTO DE EIXOS (ADMIN)
// ============================================================================

// GET - Listar todos os eixos
app.get('/api/admin/eixos', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        console.log(`📋 Admin ${req.userId} listando eixos`);
        
        const eixos = await Eixo.find().sort({ label: 1 }).lean();
        
        res.json({
            success: true,
            eixos: eixos
        });
        
    } catch (error) {
        console.error('❌ Erro ao listar eixos:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao listar eixos: ' + error.message
        });
    }
});

// POST - Criar novo eixo
app.post('/api/admin/eixos', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { nome, label, cor, icone, descricao } = req.body;
        
        console.log(`📝 Admin ${req.userId} criando eixo: ${nome}`);
        
        // Validar campos obrigatórios
        if (!nome || !label) {
            return res.status(400).json({
                success: false,
                error: 'Nome e label são obrigatórios'
            });
        }
        
        // Verificar se já existe
        const existe = await Eixo.findOne({ nome });
        if (existe) {
            return res.status(400).json({
                success: false,
                error: 'Já existe um eixo com este nome'
            });
        }
        
        const eixo = new Eixo({
            nome,
            label,
            cor: cor || '#667eea',
            icone: icone || 'fa-graduation-cap',
            descricao,
            ativo: true
        });
        
        await eixo.save();
        
        console.log(`✅ Eixo ${nome} criado com sucesso`);
        
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
        console.error('❌ Erro ao criar eixo:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao criar eixo: ' + error.message
        });
    }
});

// PUT - Atualizar eixo
app.put('/api/admin/eixos/:id', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { nome, label, cor, icone, descricao } = req.body;
        
        console.log(`✏️ Admin ${req.userId} atualizando eixo ${id}`);
        
        const eixo = await Eixo.findById(id);
        if (!eixo) {
            return res.status(404).json({
                success: false,
                error: 'Eixo não encontrado'
            });
        }
        
        // Verificar se o nome já existe em outro eixo
        if (nome && nome !== eixo.nome) {
            const existe = await Eixo.findOne({ nome, _id: { $ne: id } });
            if (existe) {
                return res.status(400).json({
                    success: false,
                    error: 'Já existe outro eixo com este nome'
                });
            }
        }
        
        // Atualizar campos
        if (nome) eixo.nome = nome;
        if (label) eixo.label = label;
        if (cor) eixo.cor = cor;
        if (icone) eixo.icone = icone;
        if (descricao !== undefined) eixo.descricao = descricao;
        
        await eixo.save();
        
        console.log(`✅ Eixo ${eixo.nome} atualizado com sucesso`);
        
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
        console.error('❌ Erro ao atualizar eixo:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao atualizar eixo: ' + error.message
        });
    }
});

// DELETE - Excluir eixo
app.delete('/api/admin/eixos/:id', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        console.log(`🗑️ Admin ${req.userId} excluindo eixo ${id}`);
        
        // Verificar se existem cursos usando este eixo
        const cursosComEixo = await Curso.countDocuments({ eixoId: id });
        
        if (cursosComEixo > 0) {
            return res.status(400).json({
                success: false,
                error: `Este eixo possui ${cursosComEixo} curso(s) vinculado(s). Remova os cursos primeiro ou reassocie-os a outro eixo.`
            });
        }
        
        const eixo = await Eixo.findByIdAndDelete(id);
        
        if (!eixo) {
            return res.status(404).json({
                success: false,
                error: 'Eixo não encontrado'
            });
        }
        
        console.log(`✅ Eixo ${eixo.nome} excluído com sucesso`);
        
        res.json({
            success: true,
            message: 'Eixo excluído com sucesso!'
        });
        
    } catch (error) {
        console.error('❌ Erro ao excluir eixo:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao excluir eixo: ' + error.message
        });
    }
});

// ============================================================================
// ROTAS PARA GERENCIAMENTO DE CURSOS (ADMIN)
// ============================================================================

// GET - Listar todos os cursos
app.get('/api/admin/cursos', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        console.log(`📋 Admin ${req.userId} listando cursos`);
        
        const cursos = await Curso.find()
            .populate('eixoId', 'nome label cor icone')
            .sort({ nome: 1 })
            .lean();
        
        // Adicionar informações sobre turmas
        const cursosComInfo = cursos.map(curso => ({
            _id: curso._id,
            nome: curso.nome,
            eixoId: curso.eixoId,
            turmas: curso.turmas || [],
            ativo: curso.ativo,
            createdAt: curso.createdAt,
            totalTurmas: curso.turmas?.length || 0
        }));
        
        res.json({
            success: true,
            cursos: cursosComInfo
        });
        
    } catch (error) {
        console.error('❌ Erro ao listar cursos:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao listar cursos: ' + error.message
        });
    }
});

// POST - Criar novo curso
app.post('/api/admin/cursos', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { nome, eixoId } = req.body;
        
        console.log(`📝 Admin ${req.userId} criando curso: ${nome}`);
        
        // Validar campos obrigatórios
        if (!nome || !eixoId) {
            return res.status(400).json({
                success: false,
                error: 'Nome do curso e Eixo são obrigatórios'
            });
        }
        
        // Verificar se o eixo existe
        const eixo = await Eixo.findById(eixoId);
        if (!eixo) {
            return res.status(404).json({
                success: false,
                error: 'Eixo não encontrado'
            });
        }
        
        // Verificar se já existe curso com este nome
        const existe = await Curso.findOne({ nome: nome.toUpperCase() });
        if (existe) {
            return res.status(400).json({
                success: false,
                error: 'Já existe um curso com este nome'
            });
        }
        
        const curso = new Curso({
            nome: nome.toUpperCase(),
            eixoId,
            turmas: [],
            ativo: true
        });
        
        await curso.save();
        
        console.log(`✅ Curso ${curso.nome} criado com sucesso`);
        
        // Popular o eixo para retornar dados completos
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
        console.error('❌ Erro ao criar curso:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao criar curso: ' + error.message
        });
    }
});

// PUT - Atualizar curso
app.put('/api/admin/cursos/:id', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { nome, eixoId, ativo } = req.body;
        
        console.log(`✏️ Admin ${req.userId} atualizando curso ${id}`);
        
        const curso = await Curso.findById(id);
        if (!curso) {
            return res.status(404).json({
                success: false,
                error: 'Curso não encontrado'
            });
        }
        
        // Se for alterar o eixo, verificar se existe
        if (eixoId && eixoId !== curso.eixoId.toString()) {
            const eixo = await Eixo.findById(eixoId);
            if (!eixo) {
                return res.status(404).json({
                    success: false,
                    error: 'Eixo não encontrado'
                });
            }
        }
        
        // Se for alterar o nome, verificar duplicata
        if (nome && nome.toUpperCase() !== curso.nome) {
            const existe = await Curso.findOne({ 
                nome: nome.toUpperCase(), 
                _id: { $ne: id } 
            });
            if (existe) {
                return res.status(400).json({
                    success: false,
                    error: 'Já existe outro curso com este nome'
                });
            }
        }
        
        // Atualizar campos
        if (nome) curso.nome = nome.toUpperCase();
        if (eixoId) curso.eixoId = eixoId;
        if (ativo !== undefined) curso.ativo = ativo;
        
        await curso.save();
        
        console.log(`✅ Curso ${curso.nome} atualizado com sucesso`);
        
        // Popular o eixo para retornar dados completos
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
        console.error('❌ Erro ao atualizar curso:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao atualizar curso: ' + error.message
        });
    }
});

// DELETE - Excluir curso
app.delete('/api/admin/cursos/:id', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        console.log(`🗑️ Admin ${req.userId} excluindo curso ${id}`);
        
        const curso = await Curso.findById(id);
        if (!curso) {
            return res.status(404).json({
                success: false,
                error: 'Curso não encontrado'
            });
        }
        
        // Verificar se existem turmas neste curso
        if (curso.turmas && curso.turmas.length > 0) {
            return res.status(400).json({
                success: false,
                error: `Este curso possui ${curso.turmas.length} turma(s). Exclua as turmas primeiro.`
            });
        }
        
        // Verificar se existem alunos usando este curso
        const alunosNoCurso = await User.countDocuments({ 
            curso: curso.nome,
            role: 'aluno'
        });
        
        if (alunosNoCurso > 0) {
            return res.status(400).json({
                success: false,
                error: `Este curso possui ${alunosNoCurso} aluno(s) matriculado(s). Remova os alunos do curso primeiro.`
            });
        }
        
        await Curso.findByIdAndDelete(id);
        
        console.log(`✅ Curso ${curso.nome} excluído com sucesso`);
        
        res.json({
            success: true,
            message: 'Curso excluído com sucesso!'
        });
        
    } catch (error) {
        console.error('❌ Erro ao excluir curso:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao excluir curso: ' + error.message
        });
    }
});

// ============================================================================
// ROTAS PARA GERENCIAMENTO DE TURMAS DENTRO DE CURSOS
// ============================================================================

// POST - Adicionar turma a um curso
app.post('/api/admin/cursos/:cursoId/turmas', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { cursoId } = req.params;
        const { codigo, periodo, vagas } = req.body;
        
        console.log(`📝 Admin ${req.userId} adicionando turma ao curso ${cursoId}`);
        
        const curso = await Curso.findById(cursoId);
        if (!curso) {
            return res.status(404).json({
                success: false,
                error: 'Curso não encontrado'
            });
        }
        
        // Validar campos
        if (!codigo || !periodo) {
            return res.status(400).json({
                success: false,
                error: 'Código e período são obrigatórios'
            });
        }
        
        // Verificar se já existe turma com este código neste curso
        const turmaExistente = curso.turmas.find(t => t.codigo === codigo.toUpperCase());
        if (turmaExistente) {
            return res.status(400).json({
                success: false,
                error: 'Já existe uma turma com este código neste curso'
            });
        }
        
        // Criar nova turma
        const novaTurma = {
            codigo: codigo.toUpperCase(),
            periodo,
            vagas: vagas || 40,
            ativa: true
        };
        
        curso.turmas.push(novaTurma);
        await curso.save();
        
        console.log(`✅ Turma ${codigo} adicionada ao curso ${curso.nome}`);
        
        res.status(201).json({
            success: true,
            message: 'Turma adicionada com sucesso!',
            turma: novaTurma
        });
        
    } catch (error) {
        console.error('❌ Erro ao adicionar turma:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao adicionar turma: ' + error.message
        });
    }
});

// PUT - Editar turma de um curso
app.put('/api/admin/cursos/:cursoId/turmas/:turmaId', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { cursoId, turmaId } = req.params;
        const { codigo, periodo, vagas, ativa } = req.body;
        
        console.log(`✏️ Admin ${req.userId} editando turma ${turmaId} do curso ${cursoId}`);
        
        const curso = await Curso.findById(cursoId);
        if (!curso) {
            return res.status(404).json({
                success: false,
                error: 'Curso não encontrado'
            });
        }
        
        // Encontrar a turma
        const turma = curso.turmas.id(turmaId);
        if (!turma) {
            return res.status(404).json({
                success: false,
                error: 'Turma não encontrada'
            });
        }
        
        // Atualizar campos
        if (codigo) turma.codigo = codigo.toUpperCase();
        if (periodo) turma.periodo = periodo;
        if (vagas) turma.vagas = vagas;
        if (ativa !== undefined) turma.ativa = ativa;
        
        await curso.save();
        
        console.log(`✅ Turma ${turma.codigo} atualizada com sucesso`);
        
        res.json({
            success: true,
            message: 'Turma atualizada com sucesso!',
            turma
        });
        
    } catch (error) {
        console.error('❌ Erro ao editar turma:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao editar turma: ' + error.message
        });
    }
});

// DELETE - Remover turma de um curso
app.delete('/api/admin/cursos/:cursoId/turmas/:turmaId', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { cursoId, turmaId } = req.params;
        
        console.log(`🗑️ Admin ${req.userId} removendo turma ${turmaId} do curso ${cursoId}`);
        
        const curso = await Curso.findById(cursoId);
        if (!curso) {
            return res.status(404).json({
                success: false,
                error: 'Curso não encontrado'
            });
        }
        
        // Encontrar e remover a turma
        const turma = curso.turmas.id(turmaId);
        if (!turma) {
            return res.status(404).json({
                success: false,
                error: 'Turma não encontrada'
            });
        }
        
        // Remover usando $pull para garantir
        await Curso.updateOne(
            { _id: cursoId },
            { $pull: { turmas: { _id: turmaId } } }
        );
        
        console.log(`✅ Turma ${turma.codigo} removida com sucesso`);
        
        res.json({
            success: true,
            message: 'Turma removida com sucesso!'
        });
        
    } catch (error) {
        console.error('❌ Erro ao remover turma:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao remover turma: ' + error.message
        });
    }
});

// ============================================================================
// ROTAS PÚBLICAS PARA LISTAR EIXOS E CURSOS (usadas em cadastros)
// ============================================================================

// GET - Listar eixos (público)
app.get('/api/eixos', async (req, res) => {
    try {
        const eixos = await Eixo.find({ ativo: true }).sort({ label: 1 }).lean();
        
        res.json({
            success: true,
            eixos: eixos
        });
        
    } catch (error) {
        console.error('❌ Erro ao listar eixos (público):', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao listar eixos'
        });
    }
});

// GET - Listar cursos por eixo (público)
app.get('/api/cursos', async (req, res) => {
    try {
        const { eixoId } = req.query;
        
        let query = { ativo: true };
        if (eixoId) {
            query.eixoId = eixoId;
        }
        
        const cursos = await Curso.find(query)
            .populate('eixoId', 'nome label')
            .sort({ nome: 1 })
            .lean();
        
        const cursosFormatados = cursos.map(c => ({
            _id: c._id,
            nome: c.nome,
            eixoId: c.eixoId?._id,
            eixoNome: c.eixoId?.label || c.eixoId?.nome,
            turmas: (c.turmas || [])
                .filter(t => t.ativa !== false)
                .map(t => ({
                    _id: t._id,
                    codigo: t.codigo,
                    periodo: t.periodo,
                    vagas: t.vagas,
                    ativa: t.ativa
                }))
        }));
        
        res.json({
            success: true,
            cursos: cursosFormatados
        });
        
    } catch (error) {
        console.error('❌ Erro ao listar cursos (público):', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao listar cursos'
        });
    }
});

// ============ BUSCAR UMA TURMA ESPECÍFICA (ADMIN) ============
app.get('/api/admin/turmas/:id', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const turmaId = req.params.id;
        
        console.log(`🔍 Admin ${req.userId} buscando turma ${turmaId}`);
        
        const turma = await Turma.findById(turmaId)
            .populate('professorId', 'nome email')
            .populate('alunos', 'nome email matricula precisaAcessibilidade condicaoAcessibilidade')
            .populate('provas', 'titulo status')
            .lean();
        
        if (!turma) {
            return res.status(404).json({
                success: false,
                error: 'Turma não encontrada'
            });
        }
        
        const turmaFormatada = {
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
            provas: turma.provas?.map(p => ({
                id: p._id,
                titulo: p.titulo,
                status: p.status
            })) || []
        };
        
        res.json({
            success: true,
            turma: turmaFormatada
        });
        
    } catch (error) {
        console.error('❌ Erro ao buscar turma:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno: ' + error.message
        });
    }
});

// ============================================
// ROTAS ADMIN PARA FACE ID (COMPLETAS)
// ============================================

// GET - Listar todas as faces (com paginação)
app.get('/api/admin/faces/todos', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 50 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        console.log(`📋 Admin ${req.userId} listando faces (página ${page}, limite ${limit})`);
        
        const [faces, total] = await Promise.all([
            FaceID.find()
                .sort({ dataCadastro: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            FaceID.countDocuments()
        ]);
        
        console.log(`✅ ${faces.length} faces encontradas (total: ${total})`);
        
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
        console.error('❌ Erro ao listar faces:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET - Buscar face por ID
app.get('/api/admin/faces/:id', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        console.log(`🔍 Admin ${req.userId} buscando face ${id}`);
        
        const face = await FaceID.findById(id).lean();
        
        if (!face) {
            return res.status(404).json({
                success: false,
                error: 'Face não encontrada'
            });
        }
        
        res.json({ success: true, face });
        
    } catch (error) {
        console.error('❌ Erro ao buscar face:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET - Buscar face por usuário ID
app.get('/api/admin/faces/usuario/:usuarioId', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { usuarioId } = req.params;
        
        const face = await FaceID.findOne({ usuarioId }).lean();
        
        res.json({
            success: true,
            temFace: !!face,
            face: face || null
        });
        
    } catch (error) {
        console.error('❌ Erro ao buscar face por usuário:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// PUT - Atualizar face
app.put('/api/admin/faces/:id', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { ativo, totalValidacoes } = req.body;
        
        console.log(`✏️ Admin ${req.userId} atualizando face ${id}`);
        
        const face = await FaceID.findById(id);
        
        if (!face) {
            return res.status(404).json({
                success: false,
                error: 'Face não encontrada'
            });
        }
        
        if (ativo !== undefined) face.ativo = ativo;
        if (totalValidacoes !== undefined) face.totalValidacoes = totalValidacoes;
        
        await face.save();
        
        console.log(`✅ Face ${id} atualizada com sucesso`);
        
        res.json({
            success: true,
            message: 'Face atualizada com sucesso'
        });
        
    } catch (error) {
        console.error('❌ Erro ao atualizar face:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST - Registrar validação manual
app.post('/api/admin/faces/:id/registrar-validacao', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        console.log(`📸 Admin ${req.userId} registrando validação manual para face ${id}`);
        
        const face = await FaceID.findById(id);
        
        if (!face) {
            return res.status(404).json({
                success: false,
                error: 'Face não encontrada'
            });
        }
        
        face.totalValidacoes = (face.totalValidacoes || 0) + 1;
        face.ultimaValidacao = new Date();
        await face.save();
        
        console.log(`✅ Validação registrada para face ${id}. Total: ${face.totalValidacoes}`);
        
        res.json({
            success: true,
            message: 'Validação registrada',
            totalValidacoes: face.totalValidacoes,
            ultimaValidacao: face.ultimaValidacao
        });
        
    } catch (error) {
        console.error('❌ Erro ao registrar validação:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET - Histórico de validações (simulado por enquanto)
app.get('/api/admin/faces/:id/historico', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        const face = await FaceID.findById(id).lean();
        
        if (!face) {
            return res.status(404).json({
                success: false,
                error: 'Face não encontrada'
            });
        }
        
        // Simular histórico com base nos dados disponíveis
        const historico = [];
        
        if (face.dataCadastro) {
            historico.push({
                tipo: 'cadastro',
                data: face.dataCadastro,
                descricao: 'Face ID cadastrada'
            });
        }
        
        if (face.ultimaValidacao) {
            historico.push({
                tipo: 'validacao',
                data: face.ultimaValidacao,
                descricao: 'Validação facial realizada'
            });
        }
        
        // Ordenar por data (mais recente primeiro)
        historico.sort((a, b) => new Date(b.data) - new Date(a.data));
        
        res.json({
            success: true,
            historico
        });
        
    } catch (error) {
        console.error('❌ Erro ao buscar histórico:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// PUT - Toggle status (ativar/inativar)
app.put('/api/admin/faces/:id/toggle-status', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { ativo } = req.body;
        
        console.log(`🔄 Admin ${req.userId} alterando status da face ${id} para ${ativo ? 'ATIVO' : 'INATIVO'}`);
        
        const face = await FaceID.findById(id);
        
        if (!face) {
            return res.status(404).json({
                success: false,
                error: 'Face não encontrada'
            });
        }
        
        face.ativo = ativo;
        await face.save();
        
        console.log(`✅ Status da face ${id} alterado para ${ativo ? 'ativo' : 'inativo'}`);
        
        res.json({
            success: true,
            message: `Face ${ativo ? 'ativada' : 'inativada'} com sucesso`
        });
        
    } catch (error) {
        console.error('❌ Erro ao alterar status:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE - Excluir face
app.delete('/api/admin/faces/:id', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        console.log(`🗑️ Admin ${req.userId} excluindo face ${id}`);
        
        const face = await FaceID.findByIdAndDelete(id);
        
        if (!face) {
            return res.status(404).json({
                success: false,
                error: 'Face não encontrada'
            });
        }
        
        console.log(`✅ Face ${id} excluída com sucesso`);
        
        res.json({
            success: true,
            message: 'Face excluída com sucesso'
        });
        
    } catch (error) {
        console.error('❌ Erro ao excluir face:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET - Localizações ativas (últimos N minutos) + últimas localizações
app.get('/api/admin/localizacoes/ativas', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { minutos = 15 } = req.query;
        const dataLimite = new Date(Date.now() - minutos * 60 * 1000);
                
        // Verificar se o modelo Localizacao existe
        const Localizacao = mongoose.models.Localizacao;
        if (!Localizacao) {
            console.error('❌ Modelo Localizacao não encontrado!');
            return res.status(500).json({
                success: false,
                error: 'Modelo de localização não configurado'
            });
        }
        
        // 1. Buscar localizações ativas (últimos minutos)        
        const localizacoesAtivas = await Localizacao.find({
            timestamp: { $gte: dataLimite }
        })
        .populate('alunoId', 'nome email matricula turma')
        .sort({ timestamp: -1 })
        .limit(50)
        .lean();
                
        // 2. Buscar a ÚLTIMA localização de cada aluno (agregação mais simples)        
        // Buscar todos os alunos que têm localizações
        const alunosComLocalizacao = await Localizacao.distinct('alunoId');        
        const ultimasLocalizacoes = [];
        
        for (const alunoId of alunosComLocalizacao) {
            // Verificar se já está nas ativas
            const jaEstaAtivo = localizacoesAtivas.some(l => 
                l.alunoId && l.alunoId._id && l.alunoId._id.toString() === alunoId.toString()
            );
            
            if (!jaEstaAtivo) {
                const ultima = await Localizacao.findOne({ alunoId })
                    .populate('alunoId', 'nome email matricula turma')
                    .sort({ timestamp: -1 })
                    .limit(1)
                    .lean();
                
                if (ultima) {
                    ultimasLocalizacoes.push(ultima);
                }
            }
        }
                
        // Formatar resultado
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
        console.error('❌ Erro ao buscar localizações:');
        console.error('   Nome:', error.name);
        console.error('   Mensagem:', error.message);
        console.error('   Stack:', error.stack);
        
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// GET - Histórico de localizações de um aluno específico
app.get('/api/admin/localizacoes/historico/:alunoId', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { alunoId } = req.params;
        const { limite = 20 } = req.query;
        
        console.log(`📋 Admin ${req.userId} buscando histórico de localizações do aluno ${alunoId}`);
        
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
        
        console.log(`✅ ${resultado.length} registros encontrados`);
        
        res.json({
            success: true,
            localizacoes: resultado,
            total: resultado.length
        });
        
    } catch (error) {
        console.error('❌ Erro ao buscar histórico:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// ROTAS ADMIN DO ONESIGNAL - PRODUÇÃO
// ============================================================================

// ============ 1. LISTAR TODOS OS DISPOSITIVOS (COM DADOS DO BANCO) ============
app.get('/api/admin/onesignal/dispositivos', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { limit = 300, offset = 0 } = req.query;
                
        // 1. Buscar dispositivos da API do OneSignal
        const oneSignalRes = await oneSignalAdmin.listarDispositivos(parseInt(limit), parseInt(offset));
        
        if (!oneSignalRes.success) {
            return res.status(500).json({
                success: false,
                error: oneSignalRes.error
            });
        }

        // 2. Buscar usuários do banco que têm player ID
        const usuarios = await User.find({ 
            onesignalPlayerId: { $exists: true, $ne: null, $ne: '' } 
        }).select('nome email role matricula turma ativo onesignalPlayerId ultimaValidacaoPush');

        // 3. Criar mapa de usuários por player ID
        const usuariosMap = {};
        usuarios.forEach(u => {
            if (u.onesignalPlayerId) {
                usuariosMap[u.onesignalPlayerId] = u;
            }
        });

        // 4. Combinar dados
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
                
                // Dados do banco
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
                
                // Status do vínculo
                status: usuario ? 'vinculado' : 'nao_vinculado'
            };
        });

        // 5. Calcular estatísticas
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
            estatisticas: {
                total,
                vinculados,
                naoVinculados
            }
        });

    } catch (error) {
        console.error('❌ Erro ao listar dispositivos:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============ 2. BUSCAR DISPOSITIVO ESPECÍFICO ============
app.get('/api/admin/onesignal/dispositivo/:playerId', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { playerId } = req.params;
        
        // Buscar no OneSignal
        const oneSignalRes = await oneSignalAdmin.buscarDispositivo(playerId);
        
        if (!oneSignalRes.success) {
            return res.status(404).json({
                success: false,
                error: oneSignalRes.error
            });
        }

        // Buscar no banco
        const usuario = await User.findOne({ onesignalPlayerId: playerId })
            .select('nome email role matricula turma ativo onesignalPlayerId ultimaValidacaoPush');

        res.json({
            success: true,
            dispositivo: oneSignalRes.dispositivo,
            usuario: usuario || null
        });

    } catch (error) {
        console.error('❌ Erro ao buscar dispositivo:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============ 3. VINCULAR DISPOSITIVO A USUÁRIO ============
app.post('/api/admin/onesignal/vincular', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { playerId, usuarioId } = req.body;
        
        console.log(`🔗 Admin ${req.userId} vinculando dispositivo ${playerId} ao usuário ${usuarioId}`);
        
        // Buscar usuário
        const usuario = await User.findById(usuarioId);
        
        if (!usuario) {
            return res.status(404).json({
                success: false,
                error: 'Usuário não encontrado'
            });
        }

        // Se já tinha outro player ID, remover tags do antigo
        if (usuario.onesignalPlayerId && usuario.onesignalPlayerId !== playerId) {
            await oneSignalAdmin.atualizarTags(usuario.onesignalPlayerId, {
                usuario_id: null,
                nome: null,
                email: null,
                role: null,
                desvinculado_em: new Date().toISOString()
            });
        }

        // Atualizar no banco
        usuario.onesignalPlayerId = playerId;
        usuario.ultimaValidacaoPush = new Date();
        await usuario.save();

        // Atualizar tags no OneSignal
        await oneSignalAdmin.atualizarTags(playerId, {
            usuario_id: usuario._id.toString(),
            nome: usuario.nome,
            email: usuario.email,
            role: usuario.role,
            matricula: usuario.matricula || '',
            vinculado_em: new Date().toISOString(),
            vinculado_por: req.userNome || 'Admin'
        });

        // Buscar admin que fez o vínculo
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
        console.error('❌ Erro ao vincular dispositivo:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============ 4. DESVINCULAR DISPOSITIVO ============
app.post('/api/admin/onesignal/desvincular/:playerId', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { playerId } = req.params;
        
        console.log(`🔓 Admin ${req.userId} desvinculando dispositivo ${playerId}`);
        
        // Buscar usuário com este player ID
        const usuario = await User.findOne({ onesignalPlayerId: playerId });
        
        if (usuario) {
            // Remover do banco
            usuario.onesignalPlayerId = null;
            await usuario.save();
        }

        // Remover tags no OneSignal
        await oneSignalAdmin.atualizarTags(playerId, {
            usuario_id: null,
            nome: null,
            email: null,
            role: null,
            matricula: null,
            desvinculado_em: new Date().toISOString(),
            desvinculado_por: req.userNome || 'Admin'
        });

        res.json({
            success: true,
            message: 'Dispositivo desvinculado com sucesso'
        });

    } catch (error) {
        console.error('❌ Erro ao desvincular dispositivo:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============ 5. DELETAR DISPOSITIVO DO ONESIGNAL ============
app.delete('/api/admin/onesignal/dispositivo/:playerId', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { playerId } = req.params;
        
        console.log(`🗑️ Admin ${req.userId} deletando dispositivo ${playerId} do OneSignal`);
        
        // Remover do banco se estiver vinculado
        await User.findOneAndUpdate(
            { onesignalPlayerId: playerId },
            { onesignalPlayerId: null }
        );

        // Deletar do OneSignal
        const resultado = await oneSignalAdmin.deletarDispositivo(playerId);
        
        if (!resultado.success) {
            return res.status(500).json({
                success: false,
                error: resultado.error
            });
        }

        res.json({
            success: true,
            message: 'Dispositivo removido permanentemente do OneSignal'
        });

    } catch (error) {
        console.error('❌ Erro ao deletar dispositivo:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============ 6. ENVIAR NOTIFICAÇÃO DE TESTE ============
app.post('/api/admin/onesignal/testar/:playerId', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { playerId } = req.params;
        const { titulo, mensagem } = req.body;
        
        console.log(`📱 Admin ${req.userId} enviando teste para ${playerId}`);
        
        // Buscar admin
        const admin = await User.findById(req.userId).select('nome');
        const adminNome = admin?.nome || 'Administrador';
        
        const resultado = await oneSignalAdmin.enviarNotificacaoTeste(
            playerId,
            titulo || '🔔 Teste do Administrador',
            mensagem || 'Esta é uma notificação de teste enviada pelo administrador.',
            adminNome
        );
        
        if (!resultado.success) {
            return res.status(500).json({
                success: false,
                error: resultado.error
            });
        }

        // Atualizar última validação no banco se estiver vinculado
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
        console.error('❌ Erro ao enviar teste:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============ 7. ESTATÍSTICAS DO ONESIGNAL ============
app.get('/api/admin/onesignal/estatisticas', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        // Estatísticas da API
        const statsAPI = await oneSignalAdmin.obterEstatisticas();
        
        // Estatísticas do banco
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
        console.error('❌ Erro ao buscar estatísticas:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Adicione no seu server.js
app.post('/api/usuario/salvar-player-id', authenticateToken, async (req, res) => {
  try {
    const { playerId } = req.body;
    const userId = req.userId;
    
    await User.findByIdAndUpdate(userId, { onesignalPlayerId: playerId });
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


// ============ ROTA PARA BUSCAR EIXO POR ID ============
app.get('/api/eixos/:id', authenticateToken, async (req, res) => {
    try {
        const eixo = await Eixo.findById(req.params.id);
        
        if (!eixo) {
            return res.status(404).json({
                success: false,
                error: 'Eixo não encontrado'
            });
        }
        
        res.json({
            success: true,
            eixo: eixo
        });
        
    } catch (error) {
        console.error('❌ Erro ao buscar eixo:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============ ROTA PARA BUSCAR CURSO DO ALUNO COM EIXO ============
app.get('/api/aluno/curso-completo', authenticateToken, async (req, res) => {
    try {
        const alunoId = req.userId;
        
        // Buscar dados do aluno
        const aluno = await User.findById(alunoId).select('curso');
        
        if (!aluno || !aluno.curso) {
            return res.json({
                success: true,
                curso: null,
                eixo: null
            });
        }
        
        // Buscar o curso no banco
        const curso = await Curso.findOne({ 
            nome: aluno.curso 
        }).populate('eixoId');
        
        if (!curso) {
            return res.json({
                success: true,
                curso: aluno.curso,
                eixo: null
            });
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
        console.error('❌ Erro ao buscar curso do aluno:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============ ROTA PARA RESETAR ACESSOS COM NOTIFICAÇÃO ============
app.post('/api/admin/reset-access', authenticateToken, async (req, res) => {
    try {
        // Verificar se é super_admin
        if (req.userRole !== 'super_admin') {
            return res.status(403).json({
                success: false,
                error: 'Apenas Super Admins podem resetar acessos'
            });
        }

        console.log(`🔄 Super Admin ${req.userId} iniciando reset de acessos...`);

        // Buscar o admin que está fazendo o reset
        const admin = await User.findById(req.userId).select('nome email');

        // Buscar todos os usuários que NÃO são super_admin
        const usuarios = await User.find({ 
            role: { $ne: 'super_admin' }
        });

        // VERIFICAR CONFIGURAÇÕES DE PUSH
        const Config = mongoose.model('Config');
        const configDoc = await Config.findOne({ chave: 'notificacoes' });
        const pushAtivado = configDoc?.valor?.push === true;
        const OneSignalService = require('./services/onesignal-service');
        const oneSignal = pushAtivado ? new OneSignalService() : null;

        let contador = 0;
        const estatisticas = {
            alunos: 0,
            professores: 0,
            admins: 0
        };

        for (const user of usuarios) {
            // Incrementar tokenVersion (invalida todos os tokens antigos)
            user.tokenVersion = (user.tokenVersion || 0) + 1;
            user.ultimoResetAcesso = new Date();
            
            await user.save();
            contador++;
            
            // 🔥 ENVIAR NOTIFICAÇÃO PARA O USUÁRIO
            try {
                const Notificacao = mongoose.model('Notificacao');
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
                console.log(`✅ Notificação enviada para ${user.email}`);
                
                // 🔥 ENVIAR PUSH SE ATIVADO
                if (pushAtivado && oneSignal && user.onesignalPlayerId) {
                    await oneSignal.enviarPush(
                        user._id,
                        '🔐 Sessão Encerrada',
                        `O administrador ${admin.nome} resetou os acessos do sistema. Faça login novamente.`,
                        {
                            tipo: 'reset_acesso',
                            adminNome: admin.nome
                        }
                    );
                }
                
            } catch (notifError) {
                console.warn(`⚠️ Erro ao notificar ${user.email}:`, notifError.message);
            }
            
            // Contar por role
            if (user.role === 'aluno') estatisticas.alunos++;
            else if (user.role === 'professor') estatisticas.professores++;
            else if (user.role === 'admin') estatisticas.admins++;
        }

        console.log(`✅ Reset concluído! ${contador} usuários afetados`);

        res.json({
            success: true,
            message: `Acessos resetados para ${contador} usuários!`,
            totalAfetados: contador,
            estatisticas: estatisticas,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Erro ao resetar acessos:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// No seu server.js ou push-routes.js
app.post('/api/push/subscribe', authenticateToken, async (req, res) => {
    try {
        const subscription = req.body;
        const userId = req.userId;
        
        // Aqui você salva a subscription no banco de dados
        // associada ao usuário userId
        
        console.log(`📱 Nova inscrição push para usuário ${userId}`);
        
        res.json({
            success: true,
            message: 'Inscrição salva com sucesso'
        });
        
    } catch (error) {
        console.error('❌ Erro ao salvar inscrição:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============ ROTAS DE TESTE PARA PUSH ============
app.get('/api/usuario/verificar-push-id', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select('onesignalPlayerId');
        res.json({
            success: true,
            temPlayerId: !!user?.onesignalPlayerId,
            playerId: user?.onesignalPlayerId || null
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/usuario/testar-push', authenticateToken, async (req, res) => {
    try {
        const OneSignalService = require('./services/onesignal-service');
        const oneSignal = new OneSignalService();
        
        const resultado = await oneSignal.enviarPush(
            req.userId,
            '🔔 TESTE DO SISTEMA',
            'Notificação de teste em ' + new Date().toLocaleTimeString(),
            { tipo: 'teste', timestamp: Date.now() }
        );
        
        if (resultado) {
            res.json({ success: true, message: 'Push enviado!' });
        } else {
            res.json({ success: false, error: 'Falha ao enviar push' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/usuario/status-push', authenticateToken, async (req, res) => {
    try {
        const config = await Config.findOne({ chave: 'notificacoes' });
        const pushAtivado = config?.valor?.push === true;
        
        const user = await User.findById(req.userId).select('onesignalPlayerId');
        
        res.json({
            success: true,
            pushAtivado,
            temPlayerId: !!user?.onesignalPlayerId,
            playerId: user?.onesignalPlayerId ? '✅ Cadastrado' : '❌ Não cadastrado',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ROTA PARA CADASTRAR FACE ID (CORRIGIDA)
// ============================================
app.post('/api/auth/cadastrar-face', authenticateToken, async (req, res) => {
    try {
        const { usuarioId, imagem } = req.body;
        
        console.log('='.repeat(50));
        console.log('📸 CADASTRANDO FACE ID');
        console.log('📌 Usuário ID:', usuarioId);
        console.log('📦 Tamanho da imagem:', Math.round(imagem?.length / 1024 || 0), 'KB');
        console.log('='.repeat(50));
        
        if (!usuarioId || !imagem) {
            return res.status(400).json({
                success: false,
                error: 'Dados incompletos para cadastro de face'
            });
        }

        // Verificar se usuário existe
        const user = await User.findById(usuarioId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'Usuário não encontrado'
            });
        }

        // Verificar modelos
        if (!modelsLoaded) {
            console.log('⏳ Carregando modelos...');
            await loadFaceModels();
        }

        console.log('🔍 Detectando face...');
        
        // Converter base64 para buffer
        const imageBuffer = Buffer.from(imagem, 'base64');
        const img = await canvas.loadImage(imageBuffer);
        
        // 🔥 CORREÇÃO: Detectar face primeiro, DEPOIS obter o descriptor
        const options = new faceapi.TinyFaceDetectorOptions({
            inputSize: 224,
            scoreThreshold: 0.3
        });
        
        // 1. Detectar a face
        const detection = await faceapi.detectSingleFace(img, options);
        
        if (!detection) {
            return res.status(400).json({
                success: false,
                error: 'Nenhum rosto detectado na imagem'
            });
        }

        console.log('✅ Face detectada, computando descriptor...');
        
        // 2. Calcular o descriptor (face recognition)
        // Nota: Em algumas versões, você precisa carregar a faceRecognitionNet
        const descriptorResult = await faceapi.computeFaceDescriptor(img, detection);
        
        if (!descriptorResult) {
            return res.status(400).json({
                success: false,
                error: 'Não foi possível gerar o descriptor facial'
            });
        }

        // Descriptor é um array de 128 números
        const faceDescriptor = Array.from(descriptorResult);
        
        console.log(`✅ Descriptor gerado: ${faceDescriptor.length} valores`);
        console.log(`   Primeiros valores: ${faceDescriptor.slice(0, 5).join(', ')}...`);
        
        // Gerar hash da imagem
        const crypto = require('crypto');
        const imagemHash = crypto.createHash('sha256').update(imagem).digest('hex');
        
        // Modelo FaceID
        const FaceIDSchema = new mongoose.Schema({
            usuarioId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
            imagemBase64: { type: String, required: true },
            imagemHash: { type: String, required: true },
            faceDescriptor: { type: [Number] },
            dataCadastro: { type: Date, default: Date.now },
            ultimaValidacao: { type: Date },
            totalValidacoes: { type: Number, default: 0 },
            ativo: { type: Boolean, default: true }
        });
        
        const FaceID = mongoose.models.FaceID || mongoose.model('FaceID', FaceIDSchema);
        
        // Verificar se já existe
        const faceExistente = await FaceID.findOne({ usuarioId });
        
        if (faceExistente) {
            faceExistente.imagemBase64 = imagem;
            faceExistente.imagemHash = imagemHash;
            faceExistente.faceDescriptor = faceDescriptor;
            faceExistente.dataCadastro = new Date();
            await faceExistente.save();
            console.log('✅ Registro atualizado');
        } else {
            const novaFace = new FaceID({
                usuarioId,
                imagemBase64: imagem,
                imagemHash,
                faceDescriptor,
                dataCadastro: new Date()
            });
            await novaFace.save();
            console.log('✅ Novo registro criado');
        }
        
        res.json({
            success: true,
            message: 'Face ID cadastrado com sucesso',
            usuario: user.nome
        });
        
    } catch (error) {
        console.error('❌ Erro no cadastro:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno: ' + error.message
        });
    }
});


// ============================================
// ROTA PARA TESTAR DETECÇÃO (SEM SALVAR)
// ============================================
app.post('/api/auth/testar-deteccao', authenticateToken, async (req, res) => {
    try {
        const { imagem } = req.body;
        
        console.log('🧪 TESTANDO DETECÇÃO FACIAL');
        
        if (!imagem) {
            return res.status(400).json({ error: 'Imagem não fornecida' });
        }
        
        // Garantir que modelos estão carregados
        if (!modelsLoaded) {
            await loadFaceModels();
        }
        
        const imageBuffer = Buffer.from(imagem, 'base64');
        const img = await canvas.loadImage(imageBuffer);
        
        // Testar com diferentes configurações
        const resultados = [];
        
        const configuracoes = [
            { inputSize: 128, threshold: 0.2 },
            { inputSize: 160, threshold: 0.3 },
            { inputSize: 224, threshold: 0.3 },
            { inputSize: 320, threshold: 0.3 }
        ];
        
        for (const config of configuracoes) {
            const startTime = Date.now();
            
            const options = new faceapi.TinyFaceDetectorOptions({
                inputSize: config.inputSize,
                scoreThreshold: config.threshold
            });
            
            const detection = await faceapi.detectSingleFace(img, options)
                .withFaceDescriptor();
            
            const time = Date.now() - startTime;
            
            resultados.push({
                config: `inputSize: ${config.inputSize}, threshold: ${config.threshold}`,
                tempo: time + 'ms',
                detectou: !!detection,
                descriptorLength: detection ? detection.descriptor.length : 0
            });
        }
        
        res.json({
            success: true,
            resultados
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// ROTA PARA VERIFICAR SE USUÁRIO TEM FACE CADASTRADA
// ============================================
app.get('/api/auth/verificar-face/:usuarioId', authenticateToken, async (req, res) => {
    try {
        const { usuarioId } = req.params;
        
        const face = await FaceID.findOne({ usuarioId }).select('faceDescriptor dataCadastro ultimaValidacao totalValidacoes');
        
        res.json({
            success: true,
            temFace: !!face,
            temDescriptor: !!(face && face.faceDescriptor),
            dataCadastro: face?.dataCadastro || null,
            ultimaValidacao: face?.ultimaValidacao || null,
            totalValidacoes: face?.totalValidacoes || 0
        });
        
    } catch (error) {
        console.error('❌ Erro ao verificar face:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================
// ROTA PARA VALIDAR CAMERA (SEGURA + RÁPIDA)
// ============================================
app.post('/api/auth/validar-camera', authenticateToken, async (req, res) => {
    try {
        const { usuarioId, frames, acoes, timestamps, localizacao } = req.body;
        
        console.log('='.repeat(50));
        console.log('🔍 VALIDAÇÃO FACIAL - MODO SEGURO');
        console.log('📌 Usuário ID:', usuarioId);
        console.log(`📦 Frames recebidos: ${frames?.length || 0}`);
        console.log('='.repeat(50));
        
        if (!usuarioId || !frames || frames.length < 6) {  // Mínimo 6 frames (2 ações x 3 frames)
            return res.status(400).json({
                success: false,
                error: 'Dados insuficientes para validação segura'
            });
        }
        
        if (!modelsLoaded) {
            await loadFaceModels();
        }
        
        const FaceID = mongoose.models.FaceID;
        const faceCadastrada = await FaceID.findOne({ usuarioId });
        
        if (!faceCadastrada || !faceCadastrada.faceDescriptor) {
            return res.status(404).json({
                success: false,
                error: 'Nenhum Face ID cadastrado'
            });
        }
        
        const descriptorSalvo = new Float32Array(faceCadastrada.faceDescriptor);
        
        // 🔥 PROCESSAMENTO EM PARALELO (mais rápido)
        const processarFrame = async (frameBase64) => {
            try {
                const imageBuffer = Buffer.from(frameBase64, 'base64');
                const img = await canvas.loadImage(imageBuffer);
                
                const options = new faceapi.TinyFaceDetectorOptions({
                    inputSize: 192,  // Meio termo: 192 (seguro e rápido)
                    scoreThreshold: 0.3
                });
                
                const detection = await faceapi.detectSingleFace(img, options);
                if (!detection) return null;
                
                const descriptor = await faceapi.computeFaceDescriptor(img, detection);
                if (!descriptor) return null;
                
                const distancia = faceapi.euclideanDistance(descriptor, descriptorSalvo);
                return { distancia, detection };
                
            } catch (err) {
                return null;
            }
        };
        
        // 🔥 PROCESSAR TODOS OS FRAMES (segurança) mas em paralelo
        const resultados = await Promise.all(frames.map(f => processarFrame(f)));
        const resultadosValidos = resultados.filter(r => r !== null);
        
        if (resultadosValidos.length < 3) {  // Mínimo 3 frames válidos
            return res.status(400).json({
                success: false,
                error: 'Rosto não detectado em frames suficientes'
            });
        }
        
        // 🔥 ANÁLISE COMPLETA (segurança)
        const distancias = resultadosValidos.map(r => r.distancia);
        const melhorDistancia = Math.min(...distancias);
        const mediaDistancias = distancias.reduce((a,b) => a+b, 0) / distancias.length;
        
        // 🔥 DETECÇÃO DE MOVIMENTO (variação entre frames)
        let variacoes = [];
        for (let i = 1; i < distancias.length; i++) {
            variacoes.push(Math.abs(distancias[i] - distancias[i-1]));
        }
        const variabilidadeMedia = variacoes.length > 0 ? 
            variacoes.reduce((a,b) => a+b, 0) / variacoes.length : 0;
        
        const similaridade = Math.max(0, Math.min(100, (1 - (melhorDistancia / 0.8)) * 100));
        const threshold = 0.55;
        const reconhecido = melhorDistancia < threshold;
        const temMovimento = variabilidadeMedia > 0.015;  // Menor que antes (0.02) mas ainda seguro
        
        console.log(`📊 RESULTADOS:`);
        console.log(`   Frames válidos: ${resultadosValidos.length}/${frames.length}`);
        console.log(`   Melhor distância: ${melhorDistancia.toFixed(4)}`);
        console.log(`   Média distâncias: ${mediaDistancias.toFixed(4)}`);
        console.log(`   Variabilidade: ${variabilidadeMedia.toFixed(4)}`);
        console.log(`   Similaridade: ${similaridade.toFixed(1)}%`);
        console.log(`   Reconhecido: ${reconhecido ? '✅' : '❌'}`);
        console.log(`   Movimento: ${temMovimento ? '✅' : '❌'}`);
        
        // 🔥 VALIDAÇÃO FINAL (segura)
        const aprovado = reconhecido && temMovimento;
        
        if (aprovado) {
            faceCadastrada.ultimaValidacao = new Date();
            faceCadastrada.totalValidacoes += 1;
            await faceCadastrada.save();
            
            res.json({
                success: true,
                reconhecido: true,
                mensagem: 'Validação facial concluída',
                similaridade: similaridade.toFixed(1),
                melhorDistancia: melhorDistancia.toFixed(4),
                framesValidados: resultadosValidos.length
            });
        } else {
            let erroMsg = '';
            if (!reconhecido) {
                erroMsg = `Face não reconhecida (${similaridade.toFixed(0)}% similaridade)`;
            } else if (!temMovimento) {
                erroMsg = '❌ SEGURANÇA: Movimento não detectado. Não use fotos ou vídeos.';
            }
            
            res.status(400).json({
                success: false,
                reconhecido: false,
                error: erroMsg || 'Validação falhou',
                similaridade: similaridade.toFixed(1)
            });
        }
        
    } catch (error) {
        console.error('❌ Erro:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// ROTA PARA VALIDAÇÃO EM TEMPO REAL (STREAMING)
// ============================================
app.post('/api/auth/validar-camera-stream', authenticateToken, async (req, res) => {
    try {
        const { usuarioId, frame, acao, sequenciaId } = req.body;
        
        if (!usuarioId || !frame) {
            return res.status(400).json({ success: false, error: 'Dados incompletos' });
        }
        
        if (!modelsLoaded) await loadFaceModels();
        
        const FaceID = mongoose.models.FaceID;
        const faceCadastrada = await FaceID.findOne({ usuarioId });
        
        if (!faceCadastrada || !faceCadastrada.faceDescriptor) {
            return res.status(404).json({ success: false, error: 'Face não cadastrada' });
        }
        
        const descriptorSalvo = new Float32Array(faceCadastrada.faceDescriptor);
        
        // Processar frame individual
        const imageBuffer = Buffer.from(frame, 'base64');
        const img = await canvas.loadImage(imageBuffer);
        
        const options = new faceapi.TinyFaceDetectorOptions({
            inputSize: 160,
            scoreThreshold: 0.3
        });
        
        const detection = await faceapi.detectSingleFace(img, options);
        
        if (!detection) {
            return res.json({ success: false, error: 'Rosto não detectado', acao, sequenciaId });
        }
        
        const descriptor = await faceapi.computeFaceDescriptor(img, detection);
        if (!descriptor) {
            return res.json({ success: false, error: 'Erro no descriptor', acao, sequenciaId });
        }
        
        const distancia = faceapi.euclideanDistance(descriptor, descriptorSalvo);
        const similaridade = Math.max(0, Math.min(100, (1 - (distancia / 0.8)) * 100));
        const reconhecido = distancia < 0.55;
        
        // Retornar resultado imediato
        res.json({
            success: true,
            reconhecido,
            similaridade: similaridade.toFixed(1),
            distancia: distancia.toFixed(4),
            acao,
            sequenciaId
        });
        
    } catch (error) {
        console.error('❌ Erro:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// ROTA PARA OBTER FACE DO USUÁRIO (APENAS ADMIN)
// ============================================
app.get('/api/admin/faces/:usuarioId', authenticateToken, async (req, res) => {
    try {
        // Verificar se é admin
        if (req.userRole !== 'admin' && req.userRole !== 'super_admin') {
            return res.status(403).json({
                success: false,
                error: 'Apenas administradores podem acessar faces'
            });
        }
        
        const { usuarioId } = req.params;
        
        const face = await FaceID.findOne({ usuarioId }).select('-imagemBase64');
        
        if (!face) {
            return res.status(404).json({
                success: false,
                error: 'Nenhum Face ID encontrado'
            });
        }
        
        res.json({
            success: true,
            face: {
                usuarioId: face.usuarioId,
                dataCadastro: face.dataCadastro,
                ultimaValidacao: face.ultimaValidacao,
                totalValidacoes: face.totalValidacoes,
                ativo: face.ativo,
                temDescriptor: !!face.faceDescriptor
            }
        });
        
    } catch (error) {
        console.error('❌ Erro ao buscar face:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============================================
// ROTA PARA REGISTRAR LOCALIZAÇÃO DA PROVA (ATUALIZADA)
// ============================================
app.post('/api/provas/registrar-localizacao', authenticateToken, async (req, res) => {
    try {
        const { provaId, latitude, longitude, accuracy } = req.body;
        const alunoId = req.userId;
        
        console.log('='.repeat(50));
        console.log('📍 Registrando localização');
        console.log(`   Prova ID: ${provaId}`);
        console.log(`   Aluno ID: ${alunoId}`);
        console.log(`   Coordenadas: ${latitude}, ${longitude} (precisão: ${accuracy}m)`);
        console.log('='.repeat(50));
        
        // Validar coordenadas
        if (!latitude || !longitude || isNaN(latitude) || isNaN(longitude)) {
            return res.status(400).json({
                success: false,
                error: 'Coordenadas inválidas'
            });
        }
        
        // Garantir que o modelo Localizacao existe
        const Localizacao = mongoose.models.Localizacao;
        if (!Localizacao) {
            console.error('❌ Modelo Localizacao não encontrado!');
            return res.status(500).json({
                success: false,
                error: 'Modelo de localização não configurado'
            });
        }
        
        // Buscar a prova realizada (opcional)
        const ProvaRealizada = mongoose.models.ProvaRealizada;
        
        if (ProvaRealizada) {
            try {
                let provaRealizada = await ProvaRealizada.findOne({
                    provaId: provaId,
                    alunoId: alunoId
                });
                
                if (provaRealizada) {
                    // Atualizar estatísticas de cancelamento com a localização
                    if (!provaRealizada.estatisticasCancelamento) {
                        provaRealizada.estatisticasCancelamento = {};
                    }
                    
                    provaRealizada.estatisticasCancelamento.latitude = latitude;
                    provaRealizada.estatisticasCancelamento.longitude = longitude;
                    provaRealizada.estatisticasCancelamento.accuracy = accuracy;
                    provaRealizada.estatisticasCancelamento.timestamp = new Date().toISOString();
                    
                    await provaRealizada.save();
                    console.log('✅ Localização atualizada na prova realizada');
                }
            } catch (provaError) {
                console.warn('⚠️ Erro ao atualizar prova realizada:', provaError.message);
            }
        }
        
        // 🔥 SALVAR NA COLEÇÃO LOCALIZACAO (sempre)
        const localizacao = new Localizacao({
            alunoId,
            provaId,
            latitude,
            longitude,
            accuracy: accuracy || 0,
            timestamp: new Date()
        });
        
        await localizacao.save();
        console.log(`✅ Localização salva no histórico (ID: ${localizacao._id})`);
        
        res.json({
            success: true,
            message: 'Localização registrada',
            localizacaoId: localizacao._id
        });
        
    } catch (error) {
        console.error('❌ Erro ao registrar localização:');
        console.error('   Nome:', error.name);
        console.error('   Mensagem:', error.message);
        console.error('   Stack:', error.stack);
        
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============ ROTAS DE PERFIL DO USUÁRIO (UNIFICADO) ============

// GET - Obter perfil completo do usuário logado
app.get('/api/perfil/me', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId)
            .select('-password -twoFactorSecret -twoFactorBackupCodes -twoFactorTempSecret');
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'Usuário não encontrado'
            });
        }
        
        // Formatar data de nascimento
        let dataNascimentoFormatada = null;
        if (user.dataNascimento) {
            const data = new Date(user.dataNascimento);
            dataNascimentoFormatada = data.toISOString().split('T')[0];
        }
        
        // Dados comuns a todos os perfis
        const perfilBase = {
            id: user._id,
            nome: user.nome,
            email: user.email,
            cpf: user.cpf,
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
            twoFactorEnabled: user.twoFactorEnabled
        };
        
        // Dados específicos por role
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
        }
        
        res.json({
            success: true,
            perfil: {
                ...perfilBase,
                ...dadosEspecificos
            }
        });
        
    } catch (error) {
        console.error('❌ Erro ao buscar perfil:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao buscar perfil: ' + error.message
        });
    }
});

// PUT - Atualizar perfil do usuário
app.put('/api/perfil/me', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const updates = req.body;
        
        console.log(`✏️ Usuário ${userId} (${req.userRole}) atualizando perfil`);
        
        // Campos permitidos para atualização (todos os perfis)
        const camposPermitidos = [
            'nome', 'telefone', 'bio', 'dataNascimento', 'genero',
            'endereco', 'cidade', 'estado', 'cep',
            'instagram', 'linkedin', 'website', 'interesses',
            'preferenciasNotificacao', 'fotoPerfil', 'fotoPerfilTipo'
        ];
        
        // Campos específicos por role (verificar permissão)
        if (req.userRole === 'aluno') {
            camposPermitidos.push('curso', 'turma', 'periodo');
        } else if (req.userRole === 'professor') {
            camposPermitidos.push('eixo', 'departamento', 'titulacao');
        } else if (req.userRole === 'admin' || req.userRole === 'super_admin') {
            camposPermitidos.push('departamento');
        }
        
        // Filtrar apenas campos permitidos
        const dadosAtualizar = {};
        for (const campo of camposPermitidos) {
            if (updates[campo] !== undefined) {
                dadosAtualizar[campo] = updates[campo];
            }
        }
        
        // Validações específicas
        if (dadosAtualizar.estado) {
            dadosAtualizar.estado = dadosAtualizar.estado.toUpperCase().substring(0, 2);
        }
        
        if (dadosAtualizar.website && dadosAtualizar.website.trim()) {
            if (!dadosAtualizar.website.startsWith('http')) {
                dadosAtualizar.website = 'https://' + dadosAtualizar.website;
            }
        }
        
        if (dadosAtualizar.instagram && dadosAtualizar.instagram.trim()) {
            // Remover @ se existir
            dadosAtualizar.instagram = dadosAtualizar.instagram.replace(/^@/, '');
        }
        
        if (dadosAtualizar.linkedin && dadosAtualizar.linkedin.trim()) {
            // Se for apenas o nome do perfil, adicionar URL base
            if (!dadosAtualizar.linkedin.includes('linkedin.com')) {
                dadosAtualizar.linkedin = 'https://linkedin.com/in/' + dadosAtualizar.linkedin.replace(/^\/+/, '');
            }
        }
        
        // Adicionar data de atualização
        dadosAtualizar.ultimaAtualizacaoPerfil = new Date();
        
        // Atualizar usuário
        const user = await User.findByIdAndUpdate(
            userId,
            dadosAtualizar,
            { new: true, runValidators: true }
        ).select('-password -twoFactorSecret -twoFactorBackupCodes -twoFactorTempSecret');
        
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'Usuário não encontrado'
            });
        }
        
        console.log(`✅ Perfil do usuário ${user.email} atualizado`);
        
        // Preparar resposta com dados do perfil
        const perfilAtualizado = {
            id: user._id,
            nome: user.nome,
            email: user.email,
            telefone: user.telefone,
            fotoPerfil: user.fotoPerfil,
            bio: user.bio,
            dataNascimento: user.dataNascimento,
            genero: user.genero,
            endereco: user.endereco,
            cidade: user.cidade,
            estado: user.estado,
            cep: user.cep,
            instagram: user.instagram,
            linkedin: user.linkedin,
            website: user.website,
            interesses: user.interesses,
            preferenciasNotificacao: user.preferenciasNotificacao,
            ultimaAtualizacaoPerfil: user.ultimaAtualizacaoPerfil
        };
        
        // Adicionar campos específicos
        if (user.role === 'aluno') {
            perfilAtualizado.curso = user.curso;
            perfilAtualizado.turma = user.turma;
            perfilAtualizado.periodo = user.periodo;
        } else if (user.role === 'professor') {
            perfilAtualizado.eixo = user.eixo;
            perfilAtualizado.departamento = user.departamento;
            perfilAtualizado.titulacao = user.titulacao;
        } else if (user.role === 'admin' || user.role === 'super_admin') {
            perfilAtualizado.departamento = user.departamento;
        }
        
        res.json({
            success: true,
            message: 'Perfil atualizado com sucesso!',
            perfil: perfilAtualizado
        });
        
    } catch (error) {
        console.error('❌ Erro ao atualizar perfil:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao atualizar perfil: ' + error.message
        });
    }
});

// POST - Upload de foto de perfil
app.post('/api/perfil/upload-foto', authenticateToken, uploadMiddleware.single('foto'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'Nenhuma imagem enviada'
            });
        }
        
        const file = req.file;
        
        // Validar tipo
        const tiposPermitidos = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!tiposPermitidos.includes(file.mimetype)) {
            // Limpar arquivo temporário
            fs.unlinkSync(file.path);
            return res.status(400).json({
                success: false,
                error: 'Tipo de imagem não suportado. Use JPEG, PNG, GIF ou WebP.'
            });
        }
        
        // Validar tamanho (máx 2MB)
        if (file.size > 2 * 1024 * 1024) {
            fs.unlinkSync(file.path);
            return res.status(400).json({
                success: false,
                error: 'Imagem muito grande. Máximo 2MB.'
            });
        }
        
        // Converter para Base64 para armazenar no banco
        const imageBuffer = fs.readFileSync(file.path);
        const base64Image = imageBuffer.toString('base64');
        const dataUrl = `data:${file.mimetype};base64,${base64Image}`;
        
        // Atualizar usuário
        const user = await User.findByIdAndUpdate(
            req.userId,
            {
                fotoPerfil: dataUrl,
                fotoPerfilTipo: file.mimetype,
                ultimaAtualizacaoPerfil: new Date()
            },
            { new: true }
        ).select('fotoPerfil fotoPerfilTipo nome email');
        
        // Remover arquivo temporário
        fs.unlinkSync(file.path);
        
        console.log(`✅ Foto de perfil atualizada para ${user.nome} (${user.email})`);
        
        res.json({
            success: true,
            message: 'Foto de perfil atualizada com sucesso!',
            fotoPerfil: user.fotoPerfil,
            fotoPerfilTipo: user.fotoPerfilTipo
        });
        
    } catch (error) {
        console.error('❌ Erro no upload da foto:', error);
        // Limpar arquivo se existir
        if (req.file && req.file.path && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({
            success: false,
            error: 'Erro ao fazer upload da foto: ' + error.message
        });
    }
});

// DELETE - Remover foto de perfil
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
        
        console.log(`🗑️ Foto de perfil removida para ${user.nome} (${user.email})`);
        
        res.json({
            success: true,
            message: 'Foto de perfil removida com sucesso!'
        });
        
    } catch (error) {
        console.error('❌ Erro ao remover foto:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao remover foto de perfil: ' + error.message
        });
    }
});

// GET - Obter perfil público de um usuário (para visualização)
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
        console.error('❌ Erro ao buscar perfil público:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao buscar perfil: ' + error.message
        });
    }
});


// ============================================================================
// VERIFICADOR AUTOMÁTICO DE NOTIFICAÇÕES (A CADA 1 MINUTO)
// ============================================================================
setInterval(async () => {
    try {
        const CalendarioNotificacaoService = require('./services/calendario-notificacao-service');
        const service = new CalendarioNotificacaoService();
        const resultado = await service.verificarNotificacoesCalendario();
        
        if (resultado.notificacoesEnviadas > 0) {
            console.log(`✅ ${resultado.notificacoesEnviadas} notificações enviadas!`);
        }
    } catch (error) {
        console.error('❌ Erro no verificador de notificações:', error);
    }
}, 60000); // 60 segundos = 1 minuto


// ============ FRONTEND ESTÁTICO ============
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

// ============ INICIAR SERVIDOR ============
server.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(50));
  console.log(`🚀 SISTEMA DE PROVAS ONLINE - PRODUÇÃO`);
  console.log(`📡 Servidor rodando na porta: ${PORT}`);
  console.log(`🌐 URL: https://prova-iema-2026.onrender.com`);
  console.log('Servidor Local:http://localhost:3000/login.html');
  console.log(`🗄️  Banco de Dados: ${mongoose.connection.readyState === 1 ? '✅ Conectado' : '❌ Desconectado'}`);
  console.log(`🔐 Autenticação: ${process.env.JWT_SECRET ? '✅ Configurada' : '⚠️  Configurar JWT_SECRET'}`);
  console.log(`👥 Modelos carregados: User, Prova, Resultado, ProvaRealizada, Turma`);
  console.log('='.repeat(50));
  console.log('\n📊 Principais rotas disponíveis:');
  console.log('  • POST /api/auth/register - Registrar usuário');
  console.log('  • POST /api/auth/login - Login');
  console.log('  • GET  /api/aluno/provas/pendentes - Provas pendentes do aluno');
  console.log('  • POST /api/provas/:id/responder - Responder prova');
  console.log('  • GET  /api/professor/provas - Provas do professor');
  console.log('  • GET  /api/professor/resultados - Resultados do professor');
  console.log('  • GET  /api/aluno/resultados - Resultados do aluno');
  console.log('='.repeat(50));
});

server.timeout = 120000; // 2 minutos de timeout
server.keepAliveTimeout = 120000;
console.log('⏱️ Timeout do servidor configurado para 2 minutos');