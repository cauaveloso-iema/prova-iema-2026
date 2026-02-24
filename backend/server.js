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
require('./email-service-resend');  // Fix para Render
const multer = require('multer');
const fs = require('fs');
const Groq = require("groq-sdk");
const http = require('http'); // <-- LINHA ADICIONADA


// ============ CRIAR DIRETÓRIOS NECESSÁRIOS PRIMEIRO ============
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

// Logo após require('dotenv')
console.log('📁 Diretório atual:', __dirname);
console.log('🔍 Procurando .env em:', path.join(__dirname, '..', '.env'));
console.log('🔑 Chave encontrada?:', process.env.OPENROUTER_API_KEY ? '✅ Sim' : '❌ Não');
console.log('🔑 OpenRouter API Key:', process.env.OPENROUTER_API_KEY ? '✅ Configurada' : '❌ Não configurada');

// ============ CRIAR INSTÂNCIA DO EXPRESS ============
const app = express();
const PORT = process.env.PORT || 10000;

// ============ CRIAR SERVIDOR HTTP ============
const server = http.createServer(app); // <-- LINHA ADICIONADA

// ============ IMPORTAR ROTAS (DEPOIS DE CRIAR O APP) ============
const monitoramentoRoutes = require('./routes/monitoramento');

// ============ IMPORTAR SERVIÇO DE LOGS ============
const LoggerService = require('./services/logger-service'); // <-- LINHA ADICIONADA

// ============ INICIALIZAR LOGGER SERVICE ============
const loggerService = new LoggerService(server); // <-- LINHA ADICIONADA

// IMPORTE O EMAIL SERVICE
const EmailService = require('./email-service-resend');
const emailService = new EmailService();

// IMPORTE MATRICULA AUTORIZADAS
const matriculasManager = require('./matriculas-autorizados');

// ============ MIDDLEWARES DE SEGURANÇA ============
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
app.use(express.json());

// ============ REGISTRAR ROTAS DE MONITORAMENTO (DEPOIS DOS MIDDLEWARES) ============
app.use('/api/admin/monitoramento', monitoramentoRoutes);

// ============ SESSÃO COM MONGODB ============
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

// ============ IMPORTAR MODELOS ============
const User = require('./models/User');
const Prova = require('./models/Prova');
const Turma = require('./models/Turma');

// ============ CONFIGURAÇÃO GROQ ============
let groq;
if (process.env.GROQ_API_KEY) {
  groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
  });
  console.log('✅ Groq configurado com sucesso');
} else {
  console.warn('⚠️  Groq API key não configurada');
}

// ============ CRIAR MODELOS INLINE (SE NÃO EXISTIREM COMO ARQUIVOS) ============

// 1. MODELO Resultado
let Resultado;
try {
  Resultado = mongoose.model('Resultado');
} catch {
  const ResultadoSchema = new mongoose.Schema({
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    provaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Prova',
      required: true
    },
    alunoNome: {
      type: String,
      required: true
    },
    respostas: {
      type: [String],
      default: []
    },
    nota: {
      type: Number,
      default: null
    },
    acertos: {
      type: Number,
      default: 0
    },
    total: {
      type: Number,
      required: true
    },
    porcentagem: {
      type: String,
      default: '0.0'
    },
    tempoGasto: {
      type: Number,
      default: 0
    },
    resultadoDetalhado: {
      type: [Object],
      default: []
    },
    dataCriacao: {
      type: Date,
      default: Date.now
    },
    notaLiberada: {
      type: Boolean,
      default: false
    },
    cancelada: {
      type: Boolean,
      default: false
    },
    motivoCancelamento: {
      type: String,
      default: null
    },
    flagViolacao: {
      type: Boolean,
      default: false
    },
    estatisticasCancelamento: {
      type: Object,
      default: null
    },
    motivoCancelamentoTipo: {
      type: String,
      enum: ['violacao', 'prazo_expirado', 'outro', null],
      default: null
    },
    status: {
      type: String,
      enum: ['pendente', 'corrigida', 'cancelada', null],
      default: null
    }
  }, {
    timestamps: true
  });

  ResultadoSchema.index({ userId: 1, provaId: 1 }, { unique: true });
  Resultado = mongoose.model('Resultado', ResultadoSchema);
}

// 2. MODELO ProvaRealizada
let ProvaRealizada;
try {
  ProvaRealizada = mongoose.model('ProvaRealizada');
} catch {
  const ProvaRealizadaSchema = new mongoose.Schema({
    provaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Prova',
      required: true
    },
    alunoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    respostas: {
      type: [String],
      default: []
    },
    nota: {
      type: Number,
      default: null
    },
    tempoGasto: {
      type: Number,
      default: 0
    },
    dataRealizacao: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['pendente', 'em_andamento', 'finalizada', 'corrigida', 'cancelada'],
      default: 'pendente'
    },
    notaLiberada: {
      type: Boolean,
      default: false
    },
    resultadoDetalhado: {
      type: [Object],
      default: []
    },
    cancelada: {
      type: Boolean,
      default: false
    },
    motivoCancelamento: {
      type: String,
      default: null
    },
    flagViolacao: {
      type: Boolean,
      default: false
    },
    estatisticasCancelamento: {
      type: Object,
      default: null
    },
    motivoCancelamentoTipo: {
      type: String,
      enum: ['violacao', 'prazo_expirado', 'outro', null],
      default: null
    },
    sincronizadoEm: {
      type: Date,
      default: null
    }
  }, {
    timestamps: true
  });

  ProvaRealizadaSchema.index({ provaId: 1, alunoId: 1 }, { unique: true });
  ProvaRealizada = mongoose.model('ProvaRealizada', ProvaRealizadaSchema);
}

// ============ FUNÇÃO PARA TESTAR MODELOS GROQ ============
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
        console.log(`  ⚠️  ${modelo} - Erro: ${error.message.substring(0, 50)}`);
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

// ============ CONEXÃO COM MONGODB ============
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
    console.log('⚙️  Usando configuração padrão do .env');
  }
  
  const safeUri = connectionUri ? connectionUri.replace(/\/\/[^@]+@/, '//***@') : 'Não configurada';
  console.log(`🗄️  URI: ${safeUri}`);
  console.log(`📊 Tipo: ${databaseType}`);
  console.log('='.repeat(60));
  
  const options = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 10000,
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
    
    // Testar modelos após conectar
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

// Conectar ao banco de dados
connectToDatabase();

// ============ MIDDLEWARE DE AUTENTICAÇÃO ============
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ 
      success: false, 
      error: 'Acesso negado. Token não fornecido.' 
    });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ 
        success: false, 
        error: 'Token inválido ou expirado.' 
      });
    }
    
    req.userId = user.id;
    req.userRole = user.role;
    req.userNome = user.nome;
    next();
  });
};

// Middleware para validar inputs
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

// ============ ROTA DE REGISTRO CORRIGIDA ============
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
        const autorizada = matriculasManager.verificarMatricula(matriculaNumeros);
        const nomeProfessor = autorizada ? matriculasManager.obterNome(matriculaNumeros) : null;
        
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
    
    // CRIAR USUÁRIO COM TODOS OS CAMPOS
    const user = new User({
      nome,
      email,
      password,
      cpf: cpfNumeros,
      telefone: telefoneNumeros,
      matricula: matricula || undefined,
      ativo: true,
      forcePasswordChange: false, // Registro normal não força troca de senha
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
      dataSolicitacaoAcessibilidade: role === 'aluno' && precisaAcessibilidade ? new Date() : null
      
    });
    
    await user.save();
    
    console.log('✅ Usuário criado com sucesso!');
    console.log(`   📚 Curso: ${user.curso}`);
    console.log(`   🏫 Turma: ${user.turma}`);     
    console.log(`   🎯 Eixo: ${user.eixo}`);
    console.log(`   ♿ Acessibilidade: ${user.precisaAcessibilidade ? 'Sim' : 'Não'}`);
    
    const token = jwt.sign(
      { 
        id: user._id, 
        role: user.role,
        eixo: user.eixo,
        nome: user.nome,
        cpf: user.cpf,
        precisaAcessibilidade: user.precisaAcessibilidade === true,
        condicaoAcessibilidade: user.condicaoAcessibilidade
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );
    
    // 🔴 CORREÇÃO: Usar 'user' em vez de 'userCompleto'
    const redirectTo = user.role === 'admin' || user.role === 'super_admin' 
        ? '/admin.html' 
        : (user.role === 'professor' ? '/index.html' : '/aluno.html');
    
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

// ============ ROTA PARA OBTER DADOS DO USUÁRIO LOGADO - CORRIGIDA COM TURMA! ============
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    // 🔥 BUSCAR TODOS OS CAMPOS, INCLUINDO ACESSIBILIDADE
    const user = await User.findById(req.userId)
      .select('+precisaAcessibilidade +condicaoAcessibilidade +outraCondicao +dataSolicitacaoAcessibilidade +acessibilidadeAprovadaPor');
    
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
        dataSolicitacaoAcessibilidade: user.dataSolicitacaoAcessibilidade
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


// ========== ROTA DE LOGIN CORRIGIDA (VERSÃO FINAL) ==========
// ========== ROTA DE LOGIN - VERSÃO FINAL LIMPA ==========
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password, cpf } = req.body;
    
    let user;
    
    if (email) {
      user = await User.findOne({ email })
        .select('+password +forcePasswordChange +passwordChangedAt +ativo');
    } else if (cpf) {
      const cpfNumeros = cpf.replace(/\D/g, '');
      user = await User.findOne({ cpf: cpfNumeros })
        .select('+password +forcePasswordChange +passwordChangedAt +ativo');
    } else {
      return res.status(400).json({ success: false, error: 'Email ou CPF é obrigatório' });
    }
    
    if (!user) {
      return res.status(401).json({ success: false, error: 'Email/CPF ou senha incorretos' });
    }
    
    // Verificar se usuário está ativo
    if (!user.ativo) {
      return res.status(401).json({ 
        success: false, 
        error: 'Usuário inativo. Entre em contato com a administração.' 
      });
    }
    
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Email/CPF ou senha incorretos' });
    }
    
    user.lastLogin = new Date();
    await user.save();
    
    // Verificar se precisa trocar a senha
    const precisaTrocarSenha = user.forcePasswordChange === true;
    
    const token = jwt.sign(
      { 
        id: user._id, 
        role: user.role,
        eixo: user.eixo,
        nome: user.nome,
        cpf: user.cpf,
        precisaAcessibilidade: user.precisaAcessibilidade === true,
        condicaoAcessibilidade: user.condicaoAcessibilidade,
        forcePasswordChange: precisaTrocarSenha
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );
    
    // Redirecionamento baseado na necessidade de trocar senha
    let redirectTo = '';
    
    if (precisaTrocarSenha) {
      redirectTo = '/trocar-senha.html';
    } else if (user.role === 'admin' || user.role === 'super_admin') {
      redirectTo = '/admin.html';
    } else if (user.role === 'professor') {
      redirectTo = '/index.html';
    } else if (user.role === 'aluno') {
      redirectTo = '/aluno.html';
    } else {
      redirectTo = '/login.html';
    }
    
    res.json({
      success: true,
      token,
      precisaTrocarSenha: precisaTrocarSenha,
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
        precisaAcessibilidade: user.precisaAcessibilidade === true,
        condicaoAcessibilidade: user.condicaoAcessibilidade,
        ativo: user.ativo,
        forcePasswordChange: precisaTrocarSenha
      },
      redirectTo: redirectTo
    });
    
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ success: false, error: 'Erro no servidor: ' + error.message });
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

// ============ FUNÇÃO PARA CARREGAR ANEXOS DE REFERÊNCIA ============
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

// Rota para upload temporário de arquivos
app.post('/api/upload/temp', authenticateToken, upload.single('arquivo'), async (req, res) => {
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

// Configurar upload de arquivos com express-fileupload
const fileUpload = require('express-fileupload');
app.use(fileUpload({
    useTempFiles: false,
    createParentPath: true,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB
    },
    abortOnLimit: true,
    responseOnLimit: "Arquivo muito grande. Máximo 10MB."
}));

// ============ ROTA PARA PUBLICAR PROVA ============
app.post('/api/professor/provas/:provaId/publicar', authenticateToken, async (req, res) => {
  try {
    const provaId = req.params.provaId;
    const professorId = req.userId;
    
    console.log(`📤 Professor ${professorId} solicitando publicação da prova ${provaId}`);
    
    if (req.userRole !== 'professor' && req.userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Apenas professores podem publicar provas'
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
    
    // Verificar se é o professor da prova
    if (prova.userId.toString() !== professorId && req.userRole !== 'admin') {
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
    prova.status = 'ativa'; // Muda status para ativa
    prova.dataPublicacao = new Date();
    
    await prova.save();
    
    console.log(`✅ Prova ${provaId} publicada com sucesso!`);
    console.log(`   Título: ${prova.titulo}`);
    console.log(`   Turma: ${prova.turmaId}`);
    console.log(`   Data de publicação: ${prova.dataPublicacao}`);
    
    // Buscar turma para notificar alunos
    let turma = null;
    if (prova.turmaId) {
      turma = await Turma.findById(prova.turmaId);
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

// ============ ROTAS DE TURMA (PROFESSOR) ============
app.post('/api/turmas', authenticateToken, async (req, res) => {
  try {
    if (req.userRole !== 'professor' && req.userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Apenas professores podem criar turmas'
      });
    }

    const { nome, disciplina, eixo, descricao } = req.body;

    const turma = new Turma({
      nome,
      disciplina,
      eixo,
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
        eixo: turma.exito,
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

app.get('/api/turmas', authenticateToken, async (req, res) => {
  try {
    let query = {};
    
    if (req.userRole === 'professor') {
      query.professorId = req.userId;
    } else if (req.userRole === 'aluno') {
      query.alunos = req.userId;
    }

    const turmas = await Turma.find(query)
      .populate('professorId', 'nome email')
      .populate('alunos', 'nome email')
      .sort({ dataCriacao: -1 });

    res.json({
      success: true,
      turmas: turmas.map(t => ({
        id: t._id,
        nome: t.nome,
        disciplina: t.disciplina,
        descricao: t.descricao,
        codigo: t.codigo,
        professor: t.professorId ? {
          nome: t.professorId.nome,
          email: t.professorId.email
        } : null,
        totalAlunos: t.alunos.length,
        totalProvas: t.provas.length,
        dataCriacao: t.dataCriacao,
        ativa: t.ativa
      }))
    });

  } catch (error) {
    console.error('Erro ao listar turmas:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao listar turmas'
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

// ============ ROTA PARA EXCLUIR TURMA (ADMIN/PROFESSOR) ============
app.delete('/api/turmas/:id', authenticateToken, async (req, res) => {
    try {
        const turmaId = req.params.id;
        const usuarioId = req.userId;
        const usuarioRole = req.userRole;

        console.log(`🗑️ Tentativa de exclusão da turma ${turmaId} pelo usuário ${usuarioId} (${usuarioRole})`);

        // Buscar turma
        const turma = await Turma.findById(turmaId);
        if (!turma) {
            return res.status(404).json({
                success: false,
                error: 'Turma não encontrada'
            });
        }

        // Verificar permissão (admin ou professor da turma)
        const isAdmin = usuarioRole === 'admin' || usuarioRole === 'super_admin';
        const isProfessorDaTurma = turma.professorId && turma.professorId.toString() === usuarioId;

        if (!isAdmin && !isProfessorDaTurma) {
            return res.status(403).json({
                success: false,
                error: 'Você não tem permissão para excluir esta turma'
            });
        }

        // Verificar se há provas associadas
        const provasAssociadas = await Prova.countDocuments({ turmaId: turmaId });
        
        if (provasAssociadas > 0 && !isAdmin) {
            return res.status(400).json({
                success: false,
                error: 'Esta turma possui provas associadas. Exclua as provas primeiro.',
                detalhes: {
                    totalProvas: provasAssociadas
                }
            });
        }

        // Se for admin, remover referências das provas
        if (isAdmin && provasAssociadas > 0) {
            console.log(`🔧 Admin removendo ${provasAssociadas} provas associadas...`);
            await Prova.deleteMany({ turmaId: turmaId });
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
                provasRemovidas: isAdmin ? provasAssociadas : 0,
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

// ============ ROTA ATUALIZADA COM SUPORTE A PROVA ADAPTADA (3 ALTERNATIVAS) ============
app.post('/api/turmas/:id/prova-v2', authenticateToken, uploadMultiple, async (req, res) => {
  try {
    const turma = await Turma.findById(req.params.id);

    if (!turma) {
      return res.status(404).json({
        success: false,
        error: 'Turma não encontrada'
      });
    }

    // ===== CORREÇÃO: Permitir que admin crie prova para QUALQUER professor =====
    // Professores só podem criar nas suas próprias turmas
    // Admin pode criar em qualquer turma para qualquer professor
    if (req.userRole !== 'admin' && turma.professorId.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        error: 'Apenas o professor desta turma pode criar provas'
      });
    }

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

    console.log(`🤖 Professor ${req.userId} solicitando prova tipo ${tipoProva} sobre: "${conteudo}"`);
    console.log(`📎 Anexos recebidos: ${anexos.length}`);

    // ========== LÓGICA PARA PROVA ADAPTADA ==========
    let alunosDestino = [];
    
    if (tipoProva === 'adaptada' || adaptada === true) {
      alunosDestino = await User.find({
        role: 'aluno',
        _id: { $in: turma.alunos || [] },
        precisaAcessibilidade: true
      }).select('_id nome email matricula precisaAcessibilidade condicaoAcessibilidade');
      
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
      }).select('_id nome email matricula');
      
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
          explicacao: "A Revolução Industrial ledo à formação do proletariado urbano (trabalhadores assalariados) e ao sistema fabril, alterando radicalmente as relações de trabalho.",
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

    // ===== CORREÇÃO: DECIDIR QUAL PROFESSOR USAR =====
    const professorDaProva = req.userRole === 'admin' && professorId ? professorId : req.userId;
    
    console.log(`👨‍🏫 Professor da prova: ${professorDaProva} (${req.userRole === 'admin' ? 'Selecionado pelo admin' : 'Próprio professor'})`);

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
        professorId: professorDaProva // <-- RETORNAR NA RESPOSTA
      },
      questoes: prova.questoes.slice(0, quantidadeQuestoes)
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
        if (req.userRole !== 'professor' && req.userRole !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Apenas professores podem fazer upload de imagens'
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

// ============ ROTA PARA ALUNO RESPONDER PROVA (COM VERIFICAÇÃO DE DUPLICATA) ============
app.post('/api/provas/:id/responder', authenticateToken, async (req, res) => {
  try {
    const provaId = req.params.id;
    const alunoId = req.userId;
    const { respostas, tempoGasto } = req.body;
    
    console.log(`📤 Aluno ${alunoId} enviando respostas para prova ${provaId}`);
    
    // VALIDAR ENTRADA
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
    
    // Verificar se já existe QUALQUER registro (Resultado OU ProvaRealizada)
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
    
    // USAR TRANSAÇÃO PARA GARANTIR CONSISTÊNCIA
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      // SALVAR APENAS NO MODELO Resultado (principal)
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
        notaLiberada: false,
        dataCriacao: new Date()
      });
      
      await resultado.save({ session });
      console.log(`✅ Resultado salvo com ID: ${resultado._id} (nota: ${notaCalculada.toFixed(2)})`);
      
      // OPCIONAL: Salvar também em ProvaRealizada se necessário, mas vamos evitar duplicata
      // Se precisar manter compatibilidade, podemos salvar mas com flag
      
      await session.commitTransaction();
      
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
      
      res.json({ 
        success: true, 
        message: 'Prova finalizada com sucesso! Aguarde a liberação do professor.',
        tempoGasto: tempoGasto || 0
      });
      
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
    
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
        
        // ========== 🔴 BUSCAR DADOS DO ALUNO DIRETAMENTE DO BANCO ==========
        const aluno = await User.findById(alunoId).select('precisaAcessibilidade condicaoAcessibilidade role nome email');
        
        if (!aluno) {
            return res.status(404).json({
                success: false,
                error: 'Aluno não encontrado'
            });
        }
        
        // 🔥 PEGAR A FLAG DIRETAMENTE DO BANCO, NÃO DO TOKEN!
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
        
        // Buscar TODAS as provas ativas das turmas do aluno
        const provas = await Prova.find({
            turmaId: { $in: turmaIds },
            status: 'ativa',
            publicada: true
        })
        .populate('turmaId', 'nome disciplina')
        .populate('userId', 'nome')
        .select('+tipoProva +adaptada +alternativas +titulo +conteudo +duracaoMinutos +dataLimite +horarioInicio +horarioTermino +quantidadeQuestoes +dificuldade +codigo')
        .lean();
        
        const provasPendentes = [];
        const hoje = new Date();
        
        for (const prova of provas) {
            
            // Detectar se é adaptada
            const isAdaptada = 
                prova.tipoProva === 'adaptada' || 
                prova.adaptada === true || 
                prova.adaptada === 'true' ||
                (prova.tipoProva && prova.tipoProva.toLowerCase() === 'adaptada') ||
                prova.alternativas === 3 ||
                false;
            
            // 🔥 FILTRO USANDO A FLAG DO BANCO DE DADOS
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
                            disciplina: prova.turmaId.disciplina
                        } : null,
                        professor: prova.userId ? prova.userId.nome : 'Professor',
                        codigo: prova.codigo,
                        
                        // CAMPOS DE ACESSIBILIDADE
                        adaptada: isAdaptada,
                        tipoProva: isAdaptada ? 'adaptada' : (prova.tipoProva || 'simples'),
                        alternativas: isAdaptada ? 3 : (prova.alternativas || 5),
                        
                        diasRestantes: diasRestantes,
                        expiraHoje: diasRestantes === 0
                    });
                }
            }
        }
        
        // 🔥 INCLUIR DADOS DO ALUNO NA RESPOSTA
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
    if (req.userRole !== 'professor' && req.userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Apenas professores podem acessar esta rota'
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
    if (req.userRole !== 'professor' && req.userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Apenas professores podem acessar esta rota'
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


// ============ ROTA PARA PROFESSOR CORRIGIR/LIBERAR NOTA (ATUALIZADA) ============
app.post('/api/professor/provas/:provaId/corrigir', authenticateToken, async (req, res) => {
  try {
    const provaId = req.params.provaId;
    const professorId = req.userId;
    const { alunoId, nota, liberarNota = true } = req.body;
    
    console.log(`📝 Professor ${professorId} corrigindo prova ${provaId} do aluno ${alunoId}`);
    
    if (req.userRole !== 'professor' && req.userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Apenas professores podem corrigir provas'
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
      resultado.nota = notaNumber; // Atualiza a nota (já existe)
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
    
    if (req.userRole !== 'professor' && req.userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Apenas professores podem liberar notas'
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
    });
    
    const resultados = await Resultado.find({
      provaId: provaId,
      nota: { $ne: null },
      notaLiberada: false
    });
    
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
    
    res.json({
      success: true,
      message: `Notas liberadas para ${totalLiberados} alunos`,
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

// ============ ROTA PARA VALIDAR ACESSO À PROVA - VERSÃO COMPLETA E CORRIGIDA ============
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
    
    const precisaAcessibilidade = aluno.precisaAcessibilidade === true;
    
    console.log(`   👤 Aluno: ${aluno.nome} (${aluno.email})`);
    console.log(`   🎯 Precisa de acessibilidade: ${precisaAcessibilidade ? 'SIM' : 'NÃO'}`);
    console.log(`   📋 Condição: ${aluno.condicaoAcessibilidade || 'não especificada'}`);
    
    // ========== BUSCAR PROVA COM TODOS OS CAMPOS ==========
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
    
    // ========== DETECÇÃO ROBUSTA DE PROVA ADAPTADA ==========
    const isAdaptada = 
        // 1. Verificar campo tipoProva
        prova.tipoProva === 'adaptada' || 
        (prova.tipoProva && prova.tipoProva.toLowerCase() === 'adaptada') ||
        
        // 2. Verificar campo adaptada (booleano ou string)
        prova.adaptada === true || 
        prova.adaptada === 'true' || 
        prova.adaptada === 1 ||
        
        // 3. Verificar por alternativas
        prova.alternativas === 3 ||
        
        // 4. Fallback
        false;
    
    console.log(`   📋 Prova: "${prova.titulo}"`);
    console.log(`      ├─ tipoProva: ${prova.tipoProva || 'NÃO DEFINIDO'}`);
    console.log(`      ├─ adaptada: ${prova.adaptada !== undefined ? prova.adaptada : 'NÃO DEFINIDO'}`);
    console.log(`      ├─ alternativas: ${prova.alternativas || 'NÃO DEFINIDO'}`);
    console.log(`      └─ isAdaptada: ${isAdaptada ? 'SIM 🎯' : 'NÃO 📝'}`);
    
    // ========== REGRA 1: ALUNO SEM ACESSIBILIDADE NÃO PODE ACESSAR PROVA ADAPTADA ==========
    if (isAdaptada && !precisaAcessibilidade) {
      console.log(`   🚫 BLOQUEADO: Aluno SEM acessibilidade tentando acessar prova ADAPTADA`);
      return res.status(403).json({
        success: false,
        error: 'Esta prova é exclusiva para alunos com necessidades de acessibilidade.',
        codigo: 'ACESSO_NEGADO_ADAPTADA'
      });
    }
    
    // ========== REGRA 2: ALUNO COM ACESSIBILIDADE SÓ PODE ACESSAR PROVAS ADAPTADAS ==========
    if (precisaAcessibilidade && !isAdaptada) {
      console.log(`   🚫 BLOQUEADO: Aluno COM acessibilidade tentando acessar prova NORMAL`);
      return res.status(403).json({
        success: false,
        error: 'Você só pode acessar provas adaptadas. Entre em contato com seu professor.',
        codigo: 'ACESSO_NEGADO_NORMAL'
      });
    }
    
    // ========== VERIFICAR SE A PROVA ESTÁ PUBLICADA ==========
    if (!prova.publicada) {
      console.log(`   🚫 BLOQUEADO: Prova não foi publicada pelo professor`);
      return res.status(400).json({
        success: false,
        error: 'Esta prova ainda não foi publicada pelo professor.'
      });
    }
    
    // ========== VERIFICAR SE A PROVA ESTÁ ATIVA ==========
    if (prova.status !== 'ativa') {
      console.log(`   🚫 BLOQUEADO: Prova não está ativa (status: ${prova.status})`);
      return res.status(400).json({
        success: false,
        error: 'Esta prova não está disponível no momento.'
      });
    }
    
    // ========== VERIFICAR SE O ALUNO ESTÁ NA TURMA ==========
    if (prova.turmaId) {
      const turma = prova.turmaId;
      
      const alunoNaTurma = turma.alunos.some(a => 
        a.toString() === alunoId.toString()
      );
      
      if (!alunoNaTurma) {
        console.log(`   🚫 BLOQUEADO: Aluno não está na turma desta prova`);
        return res.status(403).json({
          success: false,
          error: 'Você não está matriculado na turma desta prova.'
        });
      }
      
      console.log(`   ✅ Aluno está na turma: ${turma.nome}`);
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
      
      console.log(`   📅 Data limite (fim do dia): ${dataLimiteFimDia.toLocaleString('pt-BR')}`);
      console.log(`   📅 Data atual: ${hoje.toLocaleString('pt-BR')}`);
      
      if (hoje > dataLimiteFimDia) {
        const dataFormatada = dataLimiteFimDia.toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        });
        
        console.log(`   🚫 BLOQUEADO: Prova expirada em ${dataFormatada}`);
        return res.status(400).json({
          success: false,
          error: `📅 Esta prova só estava disponível até ${dataFormatada}`,
          codigo: 'PROVA_EXPIRADA'
        });
      }
    }
    
    // VERIFICAÇÃO DE HORÁRIO - VERSÃO CORRIGIDA USANDO DATA LIMITE
    if (prova.horarioInicio && prova.horarioTermino) {
      // Usar data LOCAL, não UTC
      const agora = new Date();
      const ano = agora.getFullYear();
      const mes = String(agora.getMonth() + 1).padStart(2, '0');
      const dia = String(agora.getDate()).padStart(2, '0');
      
      const inicioProva = new Date(`${ano}-${mes}-${dia}T${prova.horarioInicio}:00`);
      const terminoProva = new Date(`${ano}-${mes}-${dia}T${prova.horarioTermino}:00`);
      
      console.log('📅 VERIFICAÇÃO DE HORÁRIO (BACKEND):');
      console.log(`   Data usada: ${ano}-${mes}-${dia}`);
      console.log(`   Início: ${inicioProva.toLocaleString('pt-BR')}`);
      console.log(`   Término: ${terminoProva.toLocaleString('pt-BR')}`);
      console.log(`   Agora: ${agora.toLocaleString('pt-BR')}`);
      
      if (agora < inicioProva) {
        const diffMinutos = Math.floor((inicioProva - agora) / 60000);
        return res.status(400).json({
          success: false,
          error: `A prova só estará disponível a partir das ${prova.horarioInicio} (em ${diffMinutos} minutos)`
        });
      }
      
      if (agora > terminoProva) {
        return res.status(400).json({
          success: false,
          error: `⏰ O horário para esta prova terminou às ${prova.horarioTermino}`
        });
      }
      
      // Se chegou aqui, a prova está disponível!
      console.log('✅ PROVA DISPONÍVEL!');
    }
    
    // ========== GERAR TOKEN ESPECÍFICO PARA A PROVA ==========
    // Calcular expiração baseada no término da prova
    let expiracaoToken;

    if (prova.horarioTermino && prova.dataLimite) {
      // Usar a data limite + horário de término
      const dataLimite = new Date(prova.dataLimite);
      const ano = dataLimite.getFullYear();
      const mes = String(dataLimite.getMonth() + 1).padStart(2, '0');
      const dia = String(dataLimite.getDate()).padStart(2, '0');
      
      // Criar data de expiração no fuso de Brasília
      const dataExpiracao = new Date(`${ano}-${mes}-${dia}T${prova.horarioTermino}:00-03:00`);
      
      // Adicionar 1 hora de margem após o término
      dataExpiracao.setHours(dataExpiracao.getHours() + 1);
      
      expiracaoToken = Math.floor(dataExpiracao.getTime() / 1000);
      console.log(`📅 Token expira em: ${dataExpiracao.toLocaleString('pt-BR')}`);
    } else {
      // Fallback: 24 horas
      expiracaoToken = Math.floor(Date.now() / 1000) + (24 * 60 * 60);
    }

    const provaToken = jwt.sign(
      {
        alunoId: alunoId,
        provaId: provaId,
        access: 'prova',
        iat: Math.floor(Date.now() / 1000),
        exp: expiracaoToken,
        adaptada: isAdaptada
      },
      process.env.JWT_SECRET
    );
    
    console.log(`   ✅ ACESSO AUTORIZADO!`);
    console.log(`   🎟️ Token gerado: ${provaToken.substring(0, 30)}...`);
    console.log(`   🔗 Redirect: /realizar-prova.html?token=${provaToken.substring(0, 20)}...`);
    console.log(`🔐 ===== FIM DA VALIDAÇÃO =====\n`);
    
    // ========== RETORNAR SUCESSO COM DADOS DA PROVA ==========
    res.json({
      success: true,
      provaToken: provaToken,
      prova: {
        id: prova._id,
        titulo: prova.titulo,
        conteudo: prova.conteudo,
        duracaoMinutos: prova.duracaoMinutos,
        quantidadeQuestoes: prova.quantidadeQuestoes,
        dataLimite: prova.dataLimite,
        horarioInicio: prova.horarioInicio,
        horarioTermino: prova.horarioTermino,
        
        // ========== CAMPOS DE ACESSIBILIDADE ==========
        adaptada: isAdaptada,
        tipoProva: isAdaptada ? 'adaptada' : (prova.tipoProva || 'simples'),
        alternativas: isAdaptada ? 3 : (prova.alternativas || 5),
        
        // ========== TEMPO RESTANTE ==========
        tempoRestanteMinutos: prova.horarioTermino ? 
          Math.floor((new Date(`${hoje.toISOString().split('T')[0]}T${prova.horarioTermino}:00`) - hoje) / (1000 * 60)) : 
          null,
        
        // ========== INFORMAÇÕES DA TURMA E PROFESSOR ==========
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
        precisaAcessibilidade: precisaAcessibilidade,
        condicaoAcessibilidade: aluno.condicaoAcessibilidade
      },
      redirectTo: `/realizar-prova.html?token=${provaToken}`
    });
    
  } catch (error) {
    console.error('❌ ERRO AO VALIDAR ACESSO À PROVA:');
    console.error(`   Mensagem: ${error.message}`);
    console.error(`   Stack: ${error.stack}`);
    
    // ========== TRATAMENTO DE ERROS ESPECÍFICOS ==========
    let mensagemErro = 'Erro interno do servidor';
    let statusCode = 500;
    let codigoErro = 'ERRO_INTERNO';
    
    if (error.name === 'CastError') {
      mensagemErro = 'ID da prova inválido. Formato incorreto.';
      statusCode = 400;
      codigoErro = 'ID_INVALIDO';
    } else if (error.name === 'JsonWebTokenError') {
      mensagemErro = 'Erro ao gerar token de acesso.';
      statusCode = 500;
      codigoErro = 'ERRO_TOKEN';
    } else if (error.message.includes('ECONNREFUSED')) {
      mensagemErro = 'Erro de conexão com o banco de dados.';
      statusCode = 503;
      codigoErro = 'BD_OFFLINE';
    }
    
    res.status(statusCode).json({
      success: false,
      error: mensagemErro,
      codigo: codigoErro,
      detalhe: process.env.NODE_ENV === 'development' ? error.message : undefined
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
    if (req.userRole !== 'professor' && req.userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Apenas professores podem acessar estes resultados'
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

// ============ ROTA PARA VISUALIZAR DETALHES COMPLETOS DA PROVA (COM QUESTÕES E RESPOSTAS) ============
app.get('/api/provas/:id', authenticateToken, async (req, res) => {
  try {
    const provaId = req.params.id;
    const userId = req.userId;
    const userRole = req.userRole;
    
    console.log(`🔍 Usuário ${userId} solicitando detalhes da prova ${provaId}`);

    // Buscar prova com turma e professor
    const prova = await Prova.findById(provaId)
      .populate('turmaId', 'nome disciplina')
      .populate('userId', 'nome email');

    if (!prova) {
      return res.status(404).json({
        success: false,
        error: 'Prova não encontrada'
      });
    }

    // Verificar permissões
    const isProfessor = userRole === 'professor' || userRole === 'admin';
    const isProfessorDaProva = prova.userId && prova.userId._id.toString() === userId;
    const isAlunoDaTurma = !isProfessor && prova.turmaId;

    // Se é aluno, verificar se está na turma da prova
    if (isAlunoDaTurma) {
      const turma = await Turma.findById(prova.turmaId._id);
      if (!turma || !turma.alunos.includes(userId)) {
        return res.status(403).json({
          success: false,
          error: 'Você não está matriculado na turma desta prova'
        });
      }
    }
    
    // Se não é professor nem professor da prova, negar acesso
    if (!isProfessor && !isProfessorDaProva && !isAlunoDaTurma) {
      return res.status(403).json({
        success: false,
        error: 'Você não tem permissão para visualizar esta prova'
      });
    }

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

    // Preparar dados da prova
    const dadosProva = {
          id: prova._id,
          titulo: prova.titulo,
          conteudo: prova.conteudo,
          periodo: prova.periodo || '1',
          dataCriacao: prova.createdAt,
          dataLimite: prova.dataLimite,
          // **ADICIONAR ESTES CAMPOS:**
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

    // Preparar questões
    let questoes = [];
    
    // Professor vê tudo (perguntas, respostas corretas, explicações)
    if (isProfessor || isProfessorDaProva) {
      questoes = prova.questoes.map((questao, index) => ({
        id: questao._id,
        numero: index + 1,
        pergunta: questao.pergunta,
        opcoes: questao.opcoes,
        respostaCorreta: questao.respostaCorreta,
        explicacao: questao.explicacao,
        dificuldade: questao.dificuldade || 'media'
      }));
    } 
    // Aluno vê apenas perguntas e opções (sem respostas)
    else {
      questoes = prova.questoes.map((questao, index) => ({
        id: questao._id,
        numero: index + 1,
        pergunta: questao.pergunta,
        opcoes: questao.opcoes,
        // Aluno não vê resposta correta
        dificuldade: questao.dificuldade || 'media'
      }));
    }

    // Buscar estatísticas (apenas para professor)
    let estatisticas = null;
    if (isProfessor || isProfessorDaProva) {
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

      estatisticas = {
        totalAlunos: prova.turmaId ? await Turma.findById(prova.turmaId).then(t => t ? t.alunos.length : 0) : 0,
        alunosRealizaram: totalAlunosRealizaram,
        mediaNotas: parseFloat(mediaNotas.toFixed(1)),
        taxaConclusao: prova.turmaId ? 
          (totalAlunosRealizaram / (await Turma.findById(prova.turmaId).then(t => t ? t.alunos.length : 1)) * 100).toFixed(1) : 
          '0.0'
      };
    }

    res.json({
      success: true,
      prova: dadosProva,
      questoes: questoes,
      estatisticas: estatisticas,
      visualizacao: isProfessor || isProfessorDaProva ? 'completa' : 'parcial',
      mensagem: `${questoes.length} questões carregadas`
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
    
    if (req.userRole !== 'professor' && req.userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Apenas professores podem acessar esta rota'
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
    
    if (req.userRole !== 'professor' && req.userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Apenas professores podem liberar notas'
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

// ============ ROTA PARA EXCLUIR PROVA (NOVA) ============
app.delete('/api/professor/provas/:provaId', authenticateToken, async (req, res) => {
    try {
        const provaId = req.params.provaId;
        const professorId = req.userId;
        
        console.log(`🗑️ Professor ${professorId} tentando excluir prova ${provaId}`);
        
        if (req.userRole !== 'professor' && req.userRole !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Apenas professores podem excluir provas'
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
        
        // Verificar se é o professor da prova
        if (prova.userId.toString() !== professorId && req.userRole !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Você não é o professor desta prova'
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

// Registrar violação
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
      // Aqui você pode enviar email/notificação para o professor
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
    if (req.userRole !== 'professor' && req.userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Apenas professores podem acessar logs'
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

// ============ ROTA PARA CANCELAR PROVA (AUTOMÁTICO) ============
app.post('/api/provas/:provaId/cancelar', authenticateToken, async (req, res) => {
    try {
        const provaId = req.params.provaId;
        const alunoId = req.userId;
        const { motivo, estatisticas, respostasAtuais, tempoTotal } = req.body;
        
        console.log(`🚫 Cancelando prova ${provaId} do aluno ${alunoId}`);
        console.log(`📝 Motivo: ${motivo}`);
        
        // Buscar prova
        const prova = await Prova.findById(provaId);
        if (!prova) {
            return res.status(404).json({
                success: false,
                error: 'Prova não encontrada'
            });
        }
        
        // Verificar se o aluno já realizou esta prova
        const provaRealizadaExistente = await ProvaRealizada.findOne({
            provaId: provaId,
            alunoId: alunoId
        });

        // Verificar se já existe registro cancelado
        const provaCanceladaExistente = await ProvaRealizada.findOne({
            provaId: provaId,
            alunoId: alunoId,
            cancelada: true
        });

        if (provaCanceladaExistente) {
            return res.status(400).json({
                success: false,
                error: 'Esta prova já foi cancelada anteriormente'
            });
        }

        const resultadoCanceladoExistente = await Resultado.findOne({
            provaId: provaId,
            userId: alunoId,
            cancelada: true
        });

        if (resultadoCanceladoExistente) {
            return res.status(400).json({
                success: false,
                error: 'Esta prova já foi cancelada anteriormente'
            });
        }
        
        const resultadoExistente = await Resultado.findOne({
            provaId: provaId,
            userId: alunoId
        });
        
        if (provaRealizadaExistente || resultadoExistente) {
            return res.status(400).json({
                success: false,
                error: 'Esta prova já foi finalizada'
            });
        }
        
        // Buscar dados do aluno
        const aluno = await User.findById(alunoId);
        if (!aluno) {
            return res.status(404).json({
                success: false,
                error: 'Aluno não encontrado'
            });
        }
        
        // CORREÇÃO 1: Garantir que respostas seja um array vazio, não string
        let respostasArray = [];
        if (respostasAtuais) {
            try {
                // Se for string JSON, parse
                if (typeof respostasAtuais === 'string') {
                    respostasArray = JSON.parse(respostasAtuais);
                } 
                // Se for array, usar diretamente
                else if (Array.isArray(respostasAtuais)) {
                    respostasArray = respostasAtuais;
                }
                // Garantir que seja array
                if (!Array.isArray(respostasArray)) {
                    respostasArray = [];
                }
            } catch (e) {
                console.error('Erro ao processar respostas:', e);
                respostasArray = [];
            }
        }
        
        // **CORREÇÃO MELHORADA**: Detectar violação de forma mais abrangente
        const motivoLower = motivo.toLowerCase();
        const isViolacao = motivoLower.includes('violação') || 
                          motivoLower.includes('violacao') ||
                          motivoLower.includes('violou') ||
                          motivoLower.includes('viola') ||
                          motivoLower.includes('multiplas') ||
                          motivoLower.includes('múltiplas') ||
                          (estatisticas?.motivo && estatisticas.motivo.includes('violacao')) ||
                          (estatisticas && estatisticas.avisos > 0);

        console.log(`⚠️  Tipo de cancelamento: ${isViolacao ? 'VIOLAÇÃO' : 'PRAZO EXPIRADO'}`);
        console.log(`📝 Motivo analisado: "${motivo}"`);
        console.log(`📊 Estatísticas:`, estatisticas);
        
        // Criar registro de prova CANCELADA com nota 0
        const provaCancelada = new ProvaRealizada({
            provaId: provaId,
            alunoId: alunoId,
            respostas: respostasArray,
            nota: 0, // NOTA ZERO POR CANCELAMENTO
            tempoGasto: tempoTotal || 0,
            dataRealizacao: new Date(),
            status: 'cancelada',
            notaLiberada: true,
            
            // USAR OS NOVOS CAMPOS
            cancelada: true,
            motivoCancelamento: motivo,
            flagViolacao: isViolacao,
            estatisticasCancelamento: estatisticas,
            motivoCancelamentoTipo: isViolacao ? 'violacao' : 'prazo_expirado',
            
            resultadoDetalhado: []
        });
        
        await provaCancelada.save();
        
        // Criar também no Resultado para consistência
        const resultadoCancelado = new Resultado({
            userId: alunoId,
            provaId: provaId,
            alunoNome: aluno.nome,
            respostas: respostasArray,
            nota: 0,
            acertos: 0,
            total: prova.questoes.length,
            porcentagem: '0.0',
            tempoGasto: tempoTotal || 0,
            resultadoDetalhado: [],
            notaLiberada: true,
            
            // USAR OS NOVOS CAMPOS
            cancelada: true,
            motivoCancelamento: motivo,
            flagViolacao: isViolacao,
            estatisticasCancelamento: estatisticas,
            motivoCancelamentoTipo: isViolacao ? 'violacao' : 'prazo_expirado',
            status: 'cancelada'
        });
        
        await resultadoCancelado.save();
        
        // Atualizar estatísticas da prova
        prova.totalParticipantes = (prova.totalParticipantes || 0) + 1;
        
        if (prova.mediaNotas) {
            const somaTotal = prova.mediaNotas * (prova.totalParticipantes - 1);
            prova.mediaNotas = (somaTotal + 0) / prova.totalParticipantes; // Adiciona nota 0
        } else {
            prova.mediaNotas = 0;
        }
        
        prova.mediaNotas = parseFloat(prova.mediaNotas.toFixed(2));
        await prova.save();
        
        // Buscar professor da prova para notificação
        const professor = await User.findById(prova.userId);
        
        console.log(`✅ Prova cancelada com sucesso! Nota: 0.0`);
        console.log(`📊 Aluno: ${aluno.nome} (${aluno.email})`);
        console.log(`📚 Prova: ${prova.titulo}`);
        console.log(`👨‍🏫 Professor: ${professor ? professor.nome : 'Não encontrado'}`);
        console.log(`⚠️  Tipo de cancelamento: ${isViolacao ? 'VIOLAÇÃO' : 'PRAZO EXPIRADO'}`);
  
        
        // Registrar log de cancelamento
        console.log(`📝 LOG DE CANCELAMENTO:`, {
            provaId: provaId,
            alunoId: alunoId,
            alunoNome: aluno.nome,
            alunoEmail: aluno.email,
            professorId: prova.userId,
            professorEmail: professor ? professor.email : null,
            motivo: motivo,
            tipoViolacao: isViolacao,
            estatisticas: estatisticas,
            nota: 0,
            timestamp: new Date().toISOString()
        });
        
        res.json({
            success: true,
            message: isViolacao ? 
                'Prova cancelada por violação das regras. Nota: 0.0' : 
                'Prova cancelada automaticamente por expiração do prazo. Nota: 0.0',
            nota: 0,
            status: 'cancelada',
            tipoViolacao: isViolacao,
            motivo: motivo,
            notificacaoEnviada: professor && professor.email ? true : false,
            dados: {
                aluno: {
                    nome: aluno.nome,
                    email: aluno.email
                },
                prova: {
                    titulo: prova.titulo,
                    id: prova._id
                },
                professor: professor ? {
                    nome: professor.nome,
                    email: professor.email
                } : null
            }
        });
        
    } catch (error) {
        console.error('❌ Erro ao cancelar prova:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno ao cancelar prova: ' + error.message
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
        if (req.userRole !== 'professor' && req.userRole !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Apenas professores podem acessar esta rota'
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
        if (req.userRole !== 'professor' && req.userRole !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Apenas professores e administradores podem fazer backup manual'
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
        if (req.userRole !== 'professor' && req.userRole !== 'admin') {
            return res.status(403).json({
                success: false,
                error: 'Apenas professores e administradores podem listar backups'
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

// ============ ROTAS DE RECUPERAÇÃO DE SENHA (VERSÃO ATUALIZADA COM BREVO) ============
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
        
        // ENVIAR EMAIL COM O NOVO SERVIÇO
        console.log('\n🚀 Enviando email via:', process.env.EMAIL_SERVICE || 'Brevo');
        const emailResult = await emailService.sendPasswordResetEmail(
            user.email,
            user.nome,
            code
        );
        
        console.log('\n📊 RESULTADO DO ENVIO:');
        console.log('Sucesso:', emailResult.success ? '✅' : '❌');
        console.log('Serviço:', emailResult.service);
        console.log('ID:', emailResult.messageId);
        
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

// ============ ROTA PARA CRIAR USUÁRIO (ADMIN) - VERSÃO CORRIGIDA ============
app.post('/api/admin/usuarios', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const userData = req.body;
        
        console.log('📝 Admin criando usuário:', userData.email);
        
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

        // 🔴 GARANTIR QUE TODOS OS CAMPOS IMPORTANTES ESTÃO PRESENTES
        const user = new User({
            ...userData,
            ativo: true,
            forcePasswordChange: true,  // <-- ISSO É CRÍTICO!
            passwordChangedAt: null,
            loginAttempts: 0,
            lockUntil: null
        });
        
        await user.save();

        console.log(`✅ Usuário criado: ${user.email}`);
        console.log(`   ativo: ${user.ativo}`);
        console.log(`   forcePasswordChange: ${user.forcePasswordChange}`); // Deve ser TRUE

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

// ============ ROTA PARA LISTAR USUÁRIOS (ADMIN) ============
app.get('/api/admin/usuarios', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { role, search, page = 1, limit = 20 } = req.query;
        
        let query = {};
        
        if (role && role !== 'todos') {
            query.role = role;
        }
        
        if (search) {
            query.$or = [
                { nome: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { matricula: { $regex: search, $options: 'i' } }
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const [usuarios, total] = await Promise.all([
            User.find(query)
                .select('-password') // NÃO remover os campos importantes
                .populate('turma', 'nome')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            User.countDocuments(query)
        ]);

        // Garantir que todos os campos importantes estejam presentes
        const usuariosFormatados = usuarios.map(user => ({
            ...user,
            id: user._id,
            _id: user._id,
            forcePasswordChange: user.forcePasswordChange !== undefined ? user.forcePasswordChange : false,
            passwordChangedAt: user.passwordChangedAt || null,
            ativo: user.ativo !== undefined ? user.ativo : true
        }));

        res.json({
            success: true,
            usuarios: usuariosFormatados,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });

    } catch (error) {
        console.error('❌ Erro ao listar usuários:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Atualizar usuário
app.put('/api/admin/usuarios/:id', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        
        // Não permitir atualizar senha por esta rota
        delete updates.password;
        
        const user = await User.findByIdAndUpdate(id, updates, { new: true })
            .select('-password');
        
        if (!user) {
            return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
        }

        res.json({ success: true, user });

    } catch (error) {
        console.error('❌ Erro ao atualizar usuário:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});


// Deletar usuário
app.delete('/api/admin/usuarios/:id', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        
        // Verificar se é o último admin
        if (req.userId === id) {
            return res.status(400).json({
                success: false,
                error: 'Você não pode excluir seu próprio usuário'
            });
        }

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
        }

        // Verificar se há dados relacionados
        const [resultados, provasRealizadas, provasCriadas] = await Promise.all([
            Resultado.countDocuments({ userId: id }),
            ProvaRealizada.countDocuments({ alunoId: id }),
            Prova.countDocuments({ userId: id })
        ]);

        if (resultados > 0 || provasRealizadas > 0 || provasCriadas > 0) {
            return res.status(400).json({
                success: false,
                error: 'Este usuário possui dados associados. Não é possível excluir.',
                estatisticas: { resultados, provasRealizadas, provasCriadas }
            });
        }

        await User.findByIdAndDelete(id);

        res.json({ success: true, message: 'Usuário excluído com sucesso' });

    } catch (error) {
        console.error('❌ Erro ao deletar usuário:', error);
        res.status(500).json({ success: false, error: error.message });
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

// ============ CONFIGURAÇÕES DO SISTEMA ============

app.get('/api/admin/configuracoes', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const Config = mongoose.model('Config') || mongoose.model('Config', new mongoose.Schema({
            chave: String,
            valor: mongoose.Schema.Types.Mixed,
            descricao: String,
            atualizadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            atualizadoEm: Date
        }));

        const configuracoes = await Config.find().lean();
        
        const configPadrao = {
            sistema: {
                nome: 'Sistema de Provas IEMA 2026',
                versao: '1.0.0',
                ambiente: process.env.NODE_ENV || 'development'
            },
            seguranca: {
                jwtExpiracao: process.env.JWT_EXPIRES_IN || '24h',
                tentativasLogin: 5,
                bloqueioTempo: 15 // minutos
            },
            provas: {
                tempoMaximo: 240, // minutos
                questoesMinimas: 5,
                questoesMaximas: 50,
                permitirCorrecaoAutomatica: true
            },
            backups: {
                automatico: true,
                frequencia: 'diario',
                manterPor: 30 // dias
            },
            email: {
                servico: process.env.EMAIL_SERVICE || 'brevo',
                remetente: 'naoresponder@iemasaoluiscentro.net'
            }
        };

        const configAtual = { ...configPadrao };
        
        configuracoes.forEach(c => {
            const keys = c.chave.split('.');
            let target = configAtual;
            for (let i = 0; i < keys.length - 1; i++) {
                target = target[keys[i]];
            }
            target[keys[keys.length - 1]] = c.valor;
        });

        res.json({ success: true, configuracoes: configAtual });

    } catch (error) {
        console.error('❌ Erro ao carregar configurações:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/admin/configuracoes', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { configuracoes } = req.body;
        const Config = mongoose.model('Config');
        
        const flattenObject = (obj, prefix = '') => {
            return Object.keys(obj).reduce((acc, key) => {
                const pre = prefix.length ? prefix + '.' : '';
                if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
                    Object.assign(acc, flattenObject(obj[key], pre + key));
                } else {
                    acc[pre + key] = obj[key];
                }
                return acc;
            }, {});
        };

        const flatConfig = flattenObject(configuracoes);
        
        await Promise.all(
            Object.entries(flatConfig).map(([chave, valor]) =>
                Config.findOneAndUpdate(
                    { chave },
                    { 
                        chave,
                        valor,
                        atualizadoPor: req.userId,
                        atualizadoEm: new Date()
                    },
                    { upsert: true }
                )
            )
        );

        res.json({ success: true, message: 'Configurações salvas com sucesso' });

    } catch (error) {
        console.error('❌ Erro ao salvar configurações:', error);
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

        const turma = await Turma.findByIdAndUpdate(id, updates, { new: true })
            .populate('professorId', 'nome email');

        if (!turma) {
            return res.status(404).json({ success: false, error: 'Turma não encontrada' });
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
        
        if (novaSenha.length < 6) {
            return res.status(400).json({
                success: false,
                error: 'A nova senha deve ter no mínimo 6 caracteres'
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
        
        // Atualizar senha
        user.password = novaSenha;
        user.forcePasswordChange = false; // <-- REMOVER A FLAG
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

// ============ ROTA PARA ADMIN LISTAR TODOS OS RESULTADOS (SEM DUPLICATAS) ============
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
    
    // Buscar atividades do dashboard (se houver)
    let dashboardAtividades = [];
    try {
      // Aqui você precisaria ter uma coleção de dashboard ou buscar de outro lugar
      // Por enquanto, vamos ignorar para evitar duplicatas
    } catch (e) {
      console.warn('⚠️ Erro ao buscar dashboard:', e.message);
    }
    
    // Usar um Map para garantir unicidade (chave: alunoId + provaId + data)
    const resultadosMap = new Map();
    
    // Processar resultados do modelo Resultado (prioridade mais alta)
    resultados.forEach(r => {
      const dataStr = r.createdAt ? new Date(r.createdAt).toISOString().split('T')[0] : '';
      const key = `${r.userId?._id || r.userId}-${r.provaId?._id || r.provaId}-${dataStr}`;
      
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
        status: r.nota ? (r.nota >= 7 ? 'aprovado' : 'reprovado') : 'pendente',
        notaLiberada: r.notaLiberada || false,
        origem: 'resultado',
        resultadoDetalhado: r.resultadoDetalhado || [],
        observacoes: r.observacoes || ''
      });
    });
    
    // Processar provas realizadas (só adicionar se não existir no Map)
    provasRealizadas.forEach(pr => {
      const dataStr = pr.dataRealizacao ? new Date(pr.dataRealizacao).toISOString().split('T')[0] : '';
      const key = `${pr.alunoId?._id || pr.alunoId}-${pr.provaId?._id || pr.provaId}-${dataStr}`;
      
      // Só adicionar se ainda não existir
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
          status: pr.nota ? (pr.nota >= 7 ? 'aprovado' : 'reprovado') : 'pendente',
          notaLiberada: pr.notaLiberada || false,
          origem: 'provaRealizada',
          resultadoDetalhado: pr.resultadoDetalhado || [],
          observacoes: pr.observacoes || ''
        });
      }
    });
    
    // Converter o Map de volta para array
    const todosResultados = Array.from(resultadosMap.values());
    
    // Ordenar por data (mais recentes primeiro)
    todosResultados.sort((a, b) => new Date(b.dataRealizacao) - new Date(a.dataRealizacao));
    
    console.log(`✅ Total de resultados únicos: ${todosResultados.length}`);
    
    res.json({
      success: true,
      resultados: todosResultados,
      total: todosResultados.length,
      estatisticas: {
        total: todosResultados.length,
        comNota: todosResultados.filter(r => r.nota !== null && r.nota !== undefined).length,
        semNota: todosResultados.filter(r => r.nota === null || r.nota === undefined).length,
        aprovados: todosResultados.filter(r => r.nota && r.nota >= 7).length,
        reprovados: todosResultados.filter(r => r.nota && r.nota < 7).length,
        pendentes: todosResultados.filter(r => !r.nota).length
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

// ============ ROTAS DE NOTIFICAÇÃO (ORDEM CORRETA) ============

// =========================================================
// 1. ROTAS ESPECÍFICAS (SEM PARÂMETROS)
// =========================================================

// Contador de notificações não lidas
app.get('/api/notificacoes/nao-lidas/contador', authenticateToken, async (req, res) => {
    try {
        const Notificacao = require('./models/Notificacao');
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

// Marcar todas como lidas
app.put('/api/notificacoes/marcar-todas-lidas', authenticateToken, async (req, res) => {
    try {
        const NotificationService = require('./services/notification-service');
        const notificationService = new NotificationService();
        const result = await notificationService.marcarTodasComoLidas(req.userId);
        res.json(result);
    } catch (error) {
        console.error('❌ Erro ao marcar todas como lidas:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ROTA PARA USUÁRIO LIMPAR SUAS NOTIFICAÇÕES
app.delete('/api/notificacoes/limpar-minhas', authenticateToken, async (req, res) => {
    try {
        const usuarioId = req.userId;
        const Notificacao = require('./models/Notificacao');
        
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
        // ✅ IMPORTAR O MODELO AQUI
        const Notificacao = require('./models/Notificacao');
        
        const { pagina = 1, limite = 50, filtro } = req.query;
        const usuarioId = req.userId;
        
        console.log(`📋 Buscando todas as notificações do usuário ${usuarioId} - Página: ${pagina}, Limite: ${limite}`);
        
        const skip = (parseInt(pagina) - 1) * parseInt(limite);
        
        // Construir query
        let query = { usuarioId: usuarioId };
        
        // Aplicar filtro se houver
        if (filtro && filtro !== 'todas') {
            if (filtro === 'nao_lidas') {
                query.lida = false;
            } else if (filtro === 'lidas') {
                query.lida = true;
            } else if (filtro.startsWith('tipo:')) {
                query.tipo = filtro.replace('tipo:', '');
            }
        }
        
        // Buscar notificações com paginação
        const [notificacoes, total] = await Promise.all([
            Notificacao.find(query)
                .sort({ createdAt: -1, prioridade: -1 })
                .skip(skip)
                .limit(parseInt(limite))
                .lean(),
            Notificacao.countDocuments(query)
        ]);
        
        // Buscar estatísticas
        const [totalNaoLidas, totalPorTipo] = await Promise.all([
            Notificacao.countDocuments({ usuarioId: usuarioId, lida: false }),
            Notificacao.aggregate([
                { $match: { usuarioId: usuarioId } },
                { $group: { _id: "$tipo", count: { $sum: 1 } } }
            ])
        ]);
        
        // Formatar estatísticas por tipo
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
        const NotificationService = require('./services/notification-service');
        const notificationService = new NotificationService();
        
        const result = await notificationService.buscarNotificacoes(
            req.userId, 
            apenasNaoLidas === 'true',
            parseInt(limite) || 50
        );

        res.json(result);

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
        const NotificationService = require('./services/notification-service');
        const notificationService = new NotificationService();
        const result = await notificationService.marcarComoLida(req.params.id, req.userId);
        res.json(result);
    } catch (error) {
        console.error('❌ Erro ao marcar como lida:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Deletar notificação específica
app.delete('/api/notificacoes/:id', authenticateToken, async (req, res) => {
    try {
        const NotificationService = require('./services/notification-service');
        const notificationService = new NotificationService();
        const result = await notificationService.deletarNotificacao(req.params.id, req.userId);
        res.json(result);
    } catch (error) {
        console.error('❌ Erro ao deletar notificação:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});


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

// ============ ROTA PARA BUSCAR PROFESSORES CADASTRADOS ============
app.get('/api/admin/professores-cadastrados', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        console.log(`📋 Admin ${req.userId} buscando professores cadastrados`);
        
        // Buscar todos os usuários com role = 'professor'
        const professores = await User.find({ 
            role: 'professor',
        }).select('nome email matricula ativo createdAt'); 
        
        // Criar um mapa de matrículas para consulta rápida
        const professoresMap = {};
        professores.forEach(prof => {
            professoresMap[prof.matricula] = {
                id: prof._id,
                nome: prof.nome,
                email: prof.email,
                ativo: prof.ativo,
                createdAt: prof.createdAt // 👈 INCLUIR DATA DE CRIAÇÃO
            };
        });
        
        console.log(`✅ Encontrados ${professores.length} professores`);
        
        res.json({
            success: true,
            professores: professores,
            mapa: professoresMap,
            total: professores.length
        });
        
    } catch (error) {
        console.error('❌ Erro ao buscar professores:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao buscar professores: ' + error.message
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