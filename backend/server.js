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
require('dotenv').config({ path: '../.env' });

// Logo após require('dotenv')
console.log('📁 Diretório atual:', __dirname);
console.log('🔍 Procurando .env em:', path.resolve(__dirname, '..', '.env'));
console.log('🔑 Chave encontrada?:', process.env.OPENROUTER_API_KEY ? '✅ Sim' : '❌ Não');
console.log('🔑 OpenRouter API Key:', process.env.OPENROUTER_API_KEY ? '✅ Configurada' : '❌ Não configurada');

// Importar modelos - APENAS os que existem como arquivos separados
const User = require('./models/User');
const Prova = require('./models/Prova');
const Turma = require('./models/Turma');
// NÃO importar Resultado ou ProvaRealizada se forem criados inline

// ============ CRIAR MODELOS INLINE ============

// 1. CRIAR MODELO Resultado inline (ATUALIZADO)
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
    default: null, // Alterado para permitir null inicialmente
    required: false // Removido required: true
  },
  acertos: {
    type: Number,
    default: 0 // Alterado para default: 0
  },
  total: {
    type: Number,
    required: true
  },
  porcentagem: {
    type: String,
    default: '0.0' // Alterado para default
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
  notaLiberada: { // Adicionado campo notaLiberada
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

ResultadoSchema.index({ userId: 1, provaId: 1 }, { unique: true });
const Resultado = mongoose.model('Resultado', ResultadoSchema);

// 2. CRIAR MODELO ProvaRealizada inline
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
    default: null // Alterado para null (nota não liberada)
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
    enum: ['pendente', 'corrigida', 'finalizada'],
    default: 'finalizada' // Aluno finalizou, mas ainda não corrigida
  },
  notaLiberada: {
    type: Boolean,
    default: false // Professor liberou a nota?
  },
  resultadoDetalhado: {
    type: [Object],
    default: []
  }
}, {
  timestamps: true
});

ProvaRealizadaSchema.index({ provaId: 1, alunoId: 1 }, { unique: true });
const ProvaRealizada = mongoose.model('ProvaRealizada', ProvaRealizadaSchema);

// Configuração OpenRouter
const OpenAI = require('openai');
let openai;
if (process.env.OPENROUTER_API_KEY) {
  openai = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY,
    defaultHeaders: {
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "Sistema de Provas Online"
    }
  });
}

const app = express();
const PORT = process.env.PORT || 3000;

// ============ MIDDLEWARES DE SEGURANÇA ============
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false
}));

app.use(compression());
app.use(cors({
  origin: true,  // 👈 Permite TODAS as origens por enquanto
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());

// Sessão com MongoDB
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

// ============ CONEXÃO COM MONGODB ============
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000, // Timeout após 5 segundos
  socketTimeoutMS: 45000, // Fecha sockets após 45s de inatividade
})
.then(() => console.log('✅ MongoDB Atlas conectado com sucesso'))
.catch(err => {
  console.error('❌ Erro ao conectar com MongoDB Atlas:', err);
  console.log('⚠️  Tentando conexão local como fallback...');
  
  // Fallback para MongoDB local (se necessário)
  mongoose.connect('mongodb://localhost:27017/provas_online', {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
  .then(() => console.log('✅ MongoDB local conectado (fallback)'))
  .catch(fallbackErr => console.error('❌ Erro no fallback:', fallbackErr));
});

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

// ============ ROTAS DE AUTENTICAÇÃO ============
app.post('/api/auth/register', [
  check('nome').not().isEmpty().withMessage('Nome é obrigatório'),
  check('email').isEmail().withMessage('Email inválido'),
  check('password').isLength({ min: 6 }).withMessage('Senha deve ter no mínimo 6 caracteres'),
  check('role').isIn(['aluno', 'professor']).withMessage('Role inválida')
], async (req, res) => {
  try {
    const { nome, email, password, matricula, role, eixo, curso, periodo, departamento, titulacao } = req.body;
    
    console.log('📝 Dados recebidos no registro:', req.body);
    
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'Email já cadastrado'
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
    
    if (role === 'professor') {
      if (!eixo || !['natureza', 'humanas'].includes(eixo)) {
        return res.status(400).json({
          success: false,
          error: 'Professores devem escolher um eixo válido (natureza ou humanas)'
        });
      }
    }
    
    const user = new User({
      nome,
      email,
      password,
      matricula: matricula || undefined,
      role,
      eixo: role === 'professor' ? eixo : null,
      curso: role === 'aluno' ? curso : undefined,
      periodo: role === 'aluno' ? periodo : undefined,
      departamento: role === 'professor' ? departamento : undefined,
      titulacao: role === 'professor' ? titulacao : undefined
    });
    
    await user.save();
    
    const token = jwt.sign(
      { 
        id: user._id, 
        role: user.role,
        eixo: user.eixo,
        nome: user.nome 
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );
    
    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        nome: user.nome,
        email: user.email,
        role: user.role,
        eixo: user.eixo,
        matricula: user.matricula,
        curso: user.curso,
        periodo: user.periodo,
        departamento: user.departamento,
        titulacao: user.titulacao
      },
      redirectTo: role === 'professor' ? '/index.html' : '/aluno.html'
    });
    
  } catch (error) {
    console.error('Erro no registro:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao registrar usuário: ' + error.message
    });
  }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    
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
        role: user.role,
        eixo: user.eixo,
        matricula: user.matricula,
        curso: user.curso,
        periodo: user.periodo,
        departamento: user.departamento,
        titulacao: user.titulacao,
        dataCadastro: user.dataCadastro
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

app.post('/api/auth/login', [
  check('email').isEmail().withMessage('Email inválido'),
  check('password').not().isEmpty().withMessage('Senha é obrigatória')
], async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ email }).select('+password');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Email ou senha incorretos'
      });
    }
    
    if (user.isLocked()) {
      return res.status(423).json({
        success: false,
        error: 'Conta bloqueada. Tente novamente em 15 minutos.'
      });
    }
    
    const isMatch = await user.comparePassword(password);
    
    if (!isMatch) {
      await user.incLoginAttempts();
      return res.status(401).json({
        success: false,
        error: 'Email ou senha incorretos'
      });
    }
    
    user.loginAttempts = 0;
    user.lockUntil = undefined;
    user.lastLogin = new Date();
    await user.save();
    
    const token = jwt.sign(
      { 
        id: user._id, 
        role: user.role,
        eixo: user.eixo,
        nome: user.nome 
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );
    
    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        nome: user.nome,
        email: user.email,
        role: user.role,
        eixo: user.eixo,
        matricula: user.matricula,
        curso: user.curso,
        periodo: user.periodo,
        departamento: user.departamento,
        titulacao: user.titulacao
      },
      redirectTo: user.role === 'professor' ? '/index.html' : '/aluno.html'
    });
    
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({
      success: false,
      error: 'Erro no servidor'
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

    const { nome, disciplina, descricao } = req.body;

    const turma = new Turma({
      nome,
      disciplina,
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

app.delete('/api/turmas/:id', authenticateToken, async (req, res) => {
  try {
    const turma = await Turma.findById(req.params.id);

    if (!turma) {
      return res.status(404).json({
        success: false,
        error: 'Turma não encontrada'
      });
    }

    if (turma.professorId.toString() !== req.userId && req.userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Apenas o professor desta turma pode excluí-la'
      });
    }

    await turma.deleteOne();

    res.json({
      success: true,
      message: 'Turma excluída com sucesso'
    });

  } catch (error) {
    console.error('Erro ao excluir turma:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao excluir turma'
    });
  }
});

// ============ CRIAR PROVA PARA TURMA ============
app.post('/api/turmas/:id/prova', authenticateToken, async (req, res) => {
  try {
    const turma = await Turma.findById(req.params.id);

    if (!turma) {
      return res.status(404).json({
        success: false,
        error: 'Turma não encontrada'
      });
    }

    if (turma.professorId.toString() !== req.userId && req.userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Apenas o professor desta turma pode criar provas'
      });
    }

    const { titulo, conteudo, quantidadeQuestoes = 10, dificuldade = 'media', dataLimite, duracao } = req.body;

    console.log('🤖 Solicitando IA para gerar questões...');

    const prompt = `Você é um professor especialista. Crie EXATAMENTE ${quantidadeQuestoes} questões de múltipla escolha sobre: "${conteudo}"

CRITÉRIOS OBRIGATÓRIOS:
1. Cada questão deve ter EXATAMENTE 4 opções (A, B, C, D)
2. A resposta correta deve ser um número: 0 para A, 1 para B, 2 para C, 3 para D
3. Inclua uma explicação clara para cada resposta
4. As opções devem ser claras e distintas entre si
5. Use temas variados dentro do assunto

RETORNE APENAS JSON NO SEGUINTE FORMATO:
{
  "questoes": [
    {
      "pergunta": "Texto da pergunta?",
      "opcoes": ["A) Texto opção A", "B) Texto opção B", "C) Texto opção C", "D) Texto opção D"],
      "respostaCorreta": 0,
      "explicacao": "Explicação detalhada"
    }
  ]
}`;

    let questoesValidadas = [];
    
    try {
      const completion = await openai.chat.completions.create({
        model: "mistralai/mistral-7b-instruct:free",
        messages: [
          { role: "system", content: "Você é um professor especialista. Sempre retorne JSON válido." },
          { role: "user", content: prompt }
        ],
        max_tokens: 3000,
        temperature: 0.7
      });

      const resposta = completion.choices[0].message.content;
      console.log('📄 Resposta da IA:', resposta.substring(0, 300));

      let jsonString = resposta;
      
      const codeMatch = resposta.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeMatch && codeMatch[1]) {
        jsonString = codeMatch[1].trim();
        console.log('✅ JSON encontrado entre ```');
      } else {
        const jsonMatch = resposta.match(/\{[\s\S]*\}/);
        if (jsonMatch && jsonMatch[0]) {
          jsonString = jsonMatch[0].trim();
          console.log('✅ JSON encontrado entre { }');
        }
      }

      console.log('📊 JSON extraído:', jsonString.substring(0, 200));

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
          
          if (cleanedJson.includes('{') && cleanedJson.includes('}')) {
            const start = cleanedJson.indexOf('{');
            const end = cleanedJson.lastIndexOf('}') + 1;
            const finalJson = cleanedJson.substring(start, end);
            dados = JSON.parse(finalJson);
            console.log('✅ JSON corrigido com sucesso');
          } else {
            throw new Error('JSON incompleto');
          }
        } catch (secondError) {
          console.error('❌ Falha na correção do JSON');
          throw new Error('IA não retornou JSON válido após tentativas de correção');
        }
      }

      if (!dados || typeof dados !== 'object') {
        throw new Error('Dados inválidos da IA');
      }

      if (Array.isArray(dados)) {
        dados = { questoes: dados };
      }

      if (!dados.questoes || !Array.isArray(dados.questoes) || dados.questoes.length === 0) {
        throw new Error('Nenhuma questão encontrada na resposta da IA');
      }

      const questoesProcessadas = [];
      for (let i = 0; i < Math.min(dados.questoes.length, quantidadeQuestoes); i++) {
        const questao = dados.questoes[i];
        
        if (!questao || typeof questao !== 'object') {
          console.warn(`⚠️ Questão ${i + 1} inválida, pulando...`);
          continue;
        }

        const pergunta = questao.pergunta || questao.question || questao.text || 
                        `Questão ${i + 1} sobre ${conteudo}`;
        
        let opcoes = questao.opcoes || questao.options || questao.alternatives || 
                     questao.alternativas || questao.choices || [];
        
        if (typeof opcoes === 'string') {
          opcoes = opcoes.split('\n').filter(o => o.trim().length > 0);
        }
        
        if (!Array.isArray(opcoes) || opcoes.length === 0) {
          opcoes = [
            `A) Conceito importante sobre ${conteudo}`,
            `B) Aplicação prática de ${conteudo}`,
            `C) Exemplo de ${conteudo}`,
            `D) Todas as anteriores`
          ];
        }
        
        while (opcoes.length < 4) {
          opcoes.push(`${String.fromCharCode(65 + opcoes.length)}) Opção ${String.fromCharCode(65 + opcoes.length)}`);
        }
        opcoes = opcoes.slice(0, 4);
        
        let respostaCorreta = questao.respostaCorreta !== undefined ? questao.respostaCorreta : 
                             questao.correctAnswer !== undefined ? questao.correctAnswer :
                             questao.correct !== undefined ? questao.correct : 0;
        
        if (typeof respostaCorreta === 'string') {
          if (/^[0-3]$/.test(respostaCorreta)) {
            respostaCorreta = parseInt(respostaCorreta);
          } else if (/^[A-D]$/i.test(respostaCorreta)) {
            respostaCorreta = respostaCorreta.toUpperCase().charCodeAt(0) - 65;
          } else {
            respostaCorreta = 0;
          }
        }
        
        respostaCorreta = Math.max(0, Math.min(3, parseInt(respostaCorreta) || 0));
        
        const explicacao = questao.explicacao || questao.explanation || 
                          questao.justificativa || `Resposta correta: ${opcoes[respostaCorreta]}`;
        
        questoesProcessadas.push({
          pergunta: pergunta.trim(),
          opcoes: opcoes.map(o => o.toString().trim()),
          respostaCorreta: respostaCorreta,
          explicacao: explicacao.trim()
        });
      }

      if (questoesProcessadas.length === 0) {
        throw new Error('Nenhuma questão válida processada');
      }

      questoesValidadas = questoesProcessadas;
      console.log(`✅ ${questoesValidadas.length} questões processadas da IA`);

    } catch (iaError) {
      console.error('❌ Erro na IA, usando fallback:', iaError.message);
      
      console.log('🔄 Usando fallback manual...');
      questoesValidadas = [];
      
      for (let i = 1; i <= quantidadeQuestoes; i++) {
        questoesValidadas.push({
          pergunta: `Questão ${i}: Qual é a importância de "${conteudo}"?`,
          opcoes: [
            `A) ${conteudo} é fundamental para o entendimento do assunto`,
            `B) ${conteudo} possui diversas aplicações práticas`,
            `C) O estudo de ${conteudo} desenvolve habilidades importantes`,
            `D) Todas as alternativas anteriores estão corretas`
          ],
          respostaCorreta: 3,
          explicacao: `A alternativa D está correta, pois ${conteudo} é de fato fundamental, possui aplicações práticas e desenvolve habilidades importantes.`
        });
      }
    }

    const prova = new Prova({
      userId: req.userId,
      turmaId: turma._id,
      titulo: titulo || `Prova: ${conteudo.substring(0, 50)}`,
      conteudo: conteudo,
      questoes: questoesValidadas,
      quantidadeQuestoes: questoesValidadas.length,
      dificuldade: dificuldade,
      dataLimite: dataLimite ? new Date(dataLimite) : null,
      duracao: duracao || 60,
      status: 'ativa',
      alunosAtribuidos: turma.alunos,
      fonteGeracao: questoesValidadas.length > 0 ? 'IA com fallback' : 'Fallback manual'
    });

    await prova.save();

    turma.provas.push(prova._id);
    await turma.save();

    console.log(`✅ Professor ${req.userId} criou prova ${prova._id} para turma ${turma.nome}`);

    res.json({
      success: true,
      provaId: prova._id,
      codigo: prova.codigo,
      mensagem: `Prova criada e enviada para ${turma.alunos.length} alunos`,
      prova: {
        id: prova._id,
        titulo: prova.titulo,
        codigo: prova.codigo,
        quantidadeQuestoes: prova.quantidadeQuestoes,
        dataLimite: prova.dataLimite,
        duracao: prova.duracao,
        dificuldade: prova.dificuldade,
        fonteGeracao: prova.fonteGeracao
      },
      questoes: prova.questoes.slice(0, 5)
    });

  } catch (error) {
    console.error('❌ Erro geral ao criar prova:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao criar prova: ' + error.message,
      sugestao: 'Tente novamente com um conteúdo mais específico ou menos questões'
    });
  }
});

// ============ ROTA PARA ALUNO RESPONDER PROVA (ATUALIZADA) ============
app.post('/api/provas/:id/responder', authenticateToken, async (req, res) => {
  try {
    const provaId = req.params.id;
    const alunoId = req.userId;
    const { respostas, tempoGasto } = req.body;
    
    console.log(`📤 Aluno ${alunoId} enviando respostas para prova ${provaId}`);
    console.log('📝 Respostas recebidas:', JSON.stringify(respostas));
    
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
    
    // Verificar se já realizou a prova
    const provaRealizadaExistente = await ProvaRealizada.findOne({
      provaId: provaId,
      alunoId: alunoId
    });
    
    if (provaRealizadaExistente) {
      return res.status(400).json({ 
        success: false, 
        error: 'Você já realizou esta prova' 
      });
    }
    
    // CALCULAR RESULTADO (mas NÃO mostrar para o aluno ainda)
    let acertos = 0;
    const resultadoDetalhado = [];
    
    prova.questoes.forEach((questao, index) => {
      const respostaAluno = respostas[index];
      let correto = false;
      let respostaLetra = null;
      let respostaCorretaLetra = String.fromCharCode(65 + questao.respostaCorreta);
      
      if (respostaAluno && typeof respostaAluno === 'string') {
        const respostaAlunoUpper = respostaAluno.toUpperCase().trim();
        respostaLetra = respostaAlunoUpper;
        
        if (respostaAlunoUpper === respostaCorretaLetra) {
          acertos++;
          correto = true;
        }
      }
      
      resultadoDetalhado.push({
        questaoNumero: index + 1,
        pergunta: questao.pergunta,
        respostaAluno: respostaLetra || 'Não respondida',
        respostaCorreta: respostaCorretaLetra,
        opcoes: questao.opcoes,
        correto: correto,
        explicacao: questao.explicacao
      });
    });
    
    // CALCULAR NOTA (mas NÃO liberar ainda)
    const notaCalculada = prova.questoes.length > 0 ? (acertos / prova.questoes.length) * 10 : 0;
    const porcentagem = prova.questoes.length > 0 ? ((acertos / prova.questoes.length) * 100).toFixed(1) : '0.0';
    
    console.log(`📊 Resultado calculado: ${acertos}/${prova.questoes.length} acertos | Nota: ${notaCalculada.toFixed(2)}`);
    
    // SALVAR PROVA REALIZADA (com nota NULL - não liberada para aluno)
    const provaRealizada = new ProvaRealizada({
      provaId: provaId,
      alunoId: alunoId,
      respostas: respostas,
      nota: null, // NOTA NÃO LIBERADA PARA O ALUNO
      tempoGasto: tempoGasto || 0,
      status: 'finalizada', // Aluno finalizou, mas nota não liberada
      notaLiberada: false, // Professor ainda não liberou a nota
      resultadoDetalhado: resultadoDetalhado
    });
    
    await provaRealizada.save();
    console.log(`✅ ProvaRealizada salva com ID: ${provaRealizada._id} (nota não liberada)`);
    
    // SALVAR RESULTADO TAMBÉM (para histórico, com nota calculada mas notaLiberada: false)
    const user = await User.findById(alunoId);
    const resultado = new Resultado({
      userId: alunoId,
      provaId: provaId,
      alunoNome: user ? user.nome : 'Aluno',
      respostas: respostas,
      nota: notaCalculada.toFixed(2), // Salva a nota calculada
      acertos: acertos,
      total: prova.questoes.length,
      porcentagem: porcentagem,
      tempoGasto: tempoGasto || 0,
      resultadoDetalhado: resultadoDetalhado,
      notaLiberada: false // IMPORTANTE: Nota NÃO está liberada para o aluno
    });
    
    await resultado.save();
    console.log(`✅ Resultado salvo com ID: ${resultado._id} (nota: ${notaCalculada.toFixed(2)}, notaLiberada: false)`);
    
    // ATUALIZAR ESTATÍSTICAS DA PROVA (somente para o professor)
    prova.totalParticipantes = (prova.totalParticipantes || 0) + 1;
    await prova.save();
    
    console.log(`📈 Aluno ${alunoId} finalizou a prova ${provaId}. Nota calculada: ${notaCalculada.toFixed(2)} (aguardando liberação do professor)`);
    
    // RETORNAR SUCESSO SEM NOTA PARA O ALUNO
    res.json({ 
      success: true, 
      message: 'Prova finalizada com sucesso! Aguarde a correção do professor.',
      // NÃO retornar nota, acertos, porcentagem para o aluno
      tempoGasto: tempoGasto || 0
    });
    
  } catch (error) {
    console.error('❌ Erro detalhado ao finalizar prova:', error);
    
    if (error.name === 'ValidationError') {
      const mensagensErro = Object.values(error.errors).map(e => e.message);
      console.error('Erros de validação:', mensagensErro);
      
      return res.status(400).json({
        success: false,
        error: 'Erro de validação nos dados: ' + mensagensErro.join(', '),
        detalhes: error.errors
      });
    }
    
    res.status(500).json({ 
      success: false, 
      error: 'Erro interno ao finalizar prova: ' + error.message
    });
  }
});

// ============ ROTA PARA ALUNO VER PROVAS PENDENTES ============
app.get('/api/aluno/provas/pendentes', authenticateToken, async (req, res) => {
  try {
    if (req.userRole !== 'aluno') {
      return res.status(403).json({ 
        success: false, 
        error: 'Apenas alunos podem acessar esta rota' 
      });
    }
    
    const alunoId = req.userId;
    
    const turmas = await Turma.find({ alunos: alunoId });
    const turmaIds = turmas.map(t => t._id);
    
    console.log(`📚 Aluno ${alunoId} está em ${turmas.length} turmas`);
    
    const provas = await Prova.find({
      turmaId: { $in: turmaIds },
      status: 'ativa',
      dataLimite: { $gt: new Date() }
    })
    .populate('turmaId', 'nome disciplina')
    .populate('userId', 'nome')
    .sort({ createdAt: -1 });
    
    console.log(`📝 Encontradas ${provas.length} provas ativas`);
    
    const provasPendentes = [];
    
    for (const prova of provas) {
      const provaRealizada = await ProvaRealizada.findOne({
        provaId: prova._id,
        alunoId: alunoId
      });
      
      if (!provaRealizada) {
        provasPendentes.push({
          _id: prova._id,
          titulo: prova.titulo,
          conteudo: prova.conteudo,
          duracao: prova.duracao,
          dataLimite: prova.dataLimite,
          quantidadeQuestoes: prova.quantidadeQuestoes,
          dificuldade: prova.dificuldade,
          turma: prova.turmaId ? {
            id: prova.turmaId._id,
            nome: prova.turmaId.nome,
            disciplina: prova.turmaId.disciplina
          } : null,
          professor: prova.userId ? prova.userId.nome : 'Professor',
          codigo: prova.codigo
        });
      }
    }
    
    console.log(`✅ ${provasPendentes.length} provas pendentes para o aluno`);
    
    res.json({ 
      success: true, 
      provas: provasPendentes 
    });
    
  } catch (error) {
    console.error('Erro ao listar provas pendentes:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro ao listar provas pendentes' 
    });
  }
});

// ============ ROTA PARA PROFESSOR VER SUAS PROVAS ============
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

        const provas = await Prova.find({ userId: professorId })
            .populate('turmaId', 'nome disciplina')
            .sort({ createdAt: -1 });

        const provasComEstatisticas = await Promise.all(
            provas.map(async (prova) => {
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
                    turma: prova.turmaId ? {
                        id: prova.turmaId._id,
                        nome: prova.turmaId.nome,
                        disciplina: prova.turmaId.disciplina
                    } : 'Sem turma',
                    quantidadeQuestoes: prova.questoes.length,
                    dificuldade: prova.dificuldade,
                    dataCriacao: prova.createdAt,
                    dataLimite: prova.dataLimite,
                    duracao: prova.duracao,
                    status: prova.status,
                    codigo: prova.codigo,
                    fonteGeracao: prova.fonteGeracao,
                    alunosRealizaram: totalAlunosRealizaram,
                    totalAlunos: prova.turmaId ? await Turma.findById(prova.turmaId).then(t => t ? t.alunos.length : 0) : 0,
                    mediaNotas: parseFloat(mediaNotas.toFixed(1))
                };
            })
        );

        res.json({
            success: true,
            provas: provasComEstatisticas,
            total: provas.length,
            mensagem: `${provas.length} provas encontradas`
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
    const provas = await Prova.find({ userId: professorId })
      .populate('turmaId', 'nome disciplina')
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
    
    if (prova.dataLimite && new Date() > prova.dataLimite) {
      return res.status(400).json({ 
        success: false, 
        error: 'A data limite para esta prova já expirou' 
      });
    }
    
    const provaParaAluno = {
      _id: prova._id,
      titulo: prova.titulo,
      conteudo: prova.conteudo,
      duracao: prova.duracao,
      dataLimite: prova.dataLimite,
      tempoRestante: prova.dataLimite ? Math.floor((new Date(prova.dataLimite) - new Date()) / 60000) : null,
      questoes: prova.questoes.map(q => ({
        pergunta: q.pergunta,
        opcoes: q.opcoes
      }))
    };
    
    console.log(`✅ Prova ${provaId} enviada para aluno ${alunoId} com ${prova.questoes.length} questões`);
    
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

// ============ ROTA PARA ALUNO VER SUAS PROVAS ============
// ROTA PARA ALUNO VER SUAS PROVAS - VERIFIQUE SE ESTÁ RETORNANDO O ID CORRETAMENTE
app.get('/api/aluno/provas', authenticateToken, async (req, res) => {
    try {
        if (req.userRole !== 'aluno') {
            return res.status(403).json({
                success: false,
                error: 'Apenas alunos podem acessar esta rota'
            });
        }

        const turmas = await Turma.find({ alunos: req.userId });
        const turmaIds = turmas.map(t => t._id);

        const provas = await Prova.find({
            turmaId: { $in: turmaIds },
            status: 'ativa'
        })
        .populate('turmaId', 'nome disciplina')
        .populate('userId', 'nome')
        .sort({ createdAt: -1 });

        const provasComStatus = await Promise.all(
            provas.map(async (prova) => {
                const resultado = await Resultado.findOne({
                    userId: req.userId,
                    provaId: prova._id
                });

                const provaRealizada = await ProvaRealizada.findOne({
                    provaId: prova._id,
                    alunoId: req.userId
                });

                const realizada = !!resultado || !!provaRealizada;
                
                // Verificar se a nota está liberada
                let nota = null;
                let statusCorrecao = 'pendente';
                
                if (resultado && resultado.notaLiberada && resultado.nota !== null) {
                    nota = resultado.nota;
                    statusCorrecao = 'corrigida';
                } else if (provaRealizada && provaRealizada.notaLiberada && provaRealizada.nota !== null) {
                    nota = provaRealizada.nota;
                    statusCorrecao = 'corrigida';
                } else if (resultado || provaRealizada) {
                    statusCorrecao = 'aguardando_correcao';
                }

                return {
                    id: prova._id, // ← GARANTIR QUE ESTÁ RETORNANDO ._id
                    _id: prova._id, // ← TAMBÉM RETORNAR _id PARA COMPATIBILIDADE
                    titulo: prova.titulo,
                    conteudo: prova.conteudo,
                    turma: prova.turmaId ? {
                        nome: prova.turmaId.nome,
                        disciplina: prova.turmaId.disciplina
                    } : null,
                    quantidadeQuestoes: prova.quantidadeQuestoes,
                    dificuldade: prova.dificuldade,
                    dataLimite: prova.dataLimite,
                    duracao: prova.duracao,
                    status: realizada ? (statusCorrecao === 'corrigida' ? 'concluida' : 'aguardando_correcao') : 'pendente',
                    nota: nota,
                    statusCorrecao: statusCorrecao,
                    professor: prova.userId ? prova.userId.nome : 'Professor'
                };
            })
        );

        res.json({
            success: true,
            provas: provasComStatus
        });

    } catch (error) {
        console.error('Erro ao listar provas do aluno:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao listar provas'
        });
    }
});


// ============ ROTA PARA VALIDAR ACESSO À PROVA ============
app.get('/api/provas/:id/acesso', authenticateToken, async (req, res) => {
  try {
    const provaId = req.params.id;
    const alunoId = req.userId;
    
    console.log(`🔐 Validando acesso: Aluno ${alunoId} para prova ${provaId}`);
    
    if (!mongoose.Types.ObjectId.isValid(provaId)) {
      return res.status(400).json({
        success: false,
        error: 'ID da prova inválido'
      });
    }
    
    const prova = await Prova.findById(provaId);
    if (!prova) {
      return res.status(404).json({
        success: false,
        error: 'Prova não encontrada'
      });
    }
    
    if (prova.turmaId) {
      const turma = await Turma.findById(prova.turmaId);
      
      if (!turma) {
        return res.status(404).json({
          success: false,
          error: 'Turma da prova não encontrada'
        });
      }
      
      const alunoNaTurma = turma.alunos.some(aluno => 
        aluno.toString() === alunoId.toString()
      );
      
      if (!alunoNaTurma) {
        return res.status(403).json({
          success: false,
          error: 'Você não está matriculado na turma desta prova'
        });
      }
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
    
    if (prova.dataLimite && new Date() > prova.dataLimite) {
      return res.status(400).json({
        success: false,
        error: 'A data limite para esta prova já expirou'
      });
    }
    
    if (prova.status !== 'ativa') {
      return res.status(400).json({
        success: false,
        error: 'Esta prova não está disponível'
      });
    }
    
    const provaToken = jwt.sign(
      {
        alunoId: alunoId,
        provaId: provaId,
        access: 'prova',
        exp: Math.floor(Date.now() / 1000) + (60 * 60)
      },
      process.env.JWT_SECRET
    );
    
    console.log(`✅ Token gerado para aluno ${alunoId}`);
    
    res.json({
      success: true,
      provaToken: provaToken,
      prova: {
        id: prova._id,
        titulo: prova.titulo,
        duracao: prova.duracao,
        quantidadeQuestoes: prova.questoes.length
      },
      redirectTo: `/realizar-prova.html?token=${provaToken}`
    });
    
  } catch (error) {
    console.error('❌ Erro ao validar acesso à prova:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor: ' + error.message
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
      duracao: prova.duracao,
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

// ROTA: Resultados do professor
app.get('/api/professor/resultados', authenticateToken, async (req, res) => {
  try {
    if (req.userRole !== 'professor' && req.userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Apenas professores podem acessar estes resultados'
      });
    }

    const professorId = req.userId;

    const provas = await Prova.find({ userId: professorId })
      .sort({ createdAt: -1 });

    if (provas.length === 0) {
      return res.json({
        success: true,
        mensagem: 'Você ainda não criou nenhuma prova',
        resultados: [],
        estatisticas: {
          totalProvas: 0,
          totalAlunos: 0,
          mediaGeral: 0
        }
      });
    }

    const resultadosCompletos = [];
    let totalAlunos = 0;
    let somaNotas = 0;
    let contadorNotas = 0;

    for (const prova of provas) {
      const resultadosProva = await Resultado.find({ provaId: prova._id })
        .populate('userId', 'nome email matricula')
        .sort({ nota: -1 });

      const provasRealizadas = await ProvaRealizada.find({ provaId: prova._id })
        .populate('alunoId', 'nome email matricula');

      const todosResultados = [];

      resultadosProva.forEach(r => {
        todosResultados.push({
          alunoId: r.userId._id,
          alunoNome: r.userId.nome,
          alunoEmail: r.userId.email,
          alunoMatricula: r.userId.matricula,
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
          r.alunoId.toString() === pr.alunoId._id.toString()
        );
        
        if (!jaExiste && pr.alunoId) {
          todosResultados.push({
            alunoId: pr.alunoId._id,
            alunoNome: pr.alunoId.nome,
            alunoEmail: pr.alunoId.email,
            alunoMatricula: pr.alunoId.matricula,
            nota: pr.nota,
            tempoGasto: pr.tempoGasto,
            dataEntrega: pr.dataRealizacao,
            tipo: 'prova_realizada'
          });
        }
      });

      todosResultados.forEach(r => {
        resultadosCompletos.push({
          provaId: prova._id,
          provaTitulo: prova.titulo,
          provaConteudo: prova.conteudo,
          provaDataLimite: prova.dataLimite,
          ...r
        });

        if (r.nota !== undefined && !isNaN(r.nota)) {
          totalAlunos++;
          somaNotas += r.nota;
          contadorNotas++;
        }
      });
    }

    const estatisticas = {
      totalProvas: provas.length,
      totalAlunos: totalAlunos,
      mediaGeral: contadorNotas > 0 ? (somaNotas / contadorNotas).toFixed(1) : 0,
      provas: provas.map(prova => ({
        id: prova._id,
        titulo: prova.titulo,
        totalQuestoes: prova.questoes.length,
        dificuldade: prova.dificuldade,
        dataLimite: prova.dataLimite
      }))
    };

    res.json({
      success: true,
      resultados: resultadosCompletos,
      estatisticas: estatisticas,
      mensagem: `Encontrados ${resultadosCompletos.length} resultados em ${provas.length} provas`
    });

  } catch (error) {
    console.error('Erro ao buscar resultados do professor:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno ao buscar resultados'
    });
  }
});

// ROTA: Resultados específicos de uma prova (ATUALIZADA para professor ver todas as notas)
app.get('/api/provas/:provaId/resultados', authenticateToken, async (req, res) => {
  try {
    const provaId = req.params.provaId;
    const professorId = req.userId;

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
        error: 'Você não tem permissão para ver os resultados desta prova'
      });
    }

    // Buscar resultados (professor deve ver TODOS, mesmo notas não liberadas)
    const resultados = await Resultado.find({ provaId: provaId })
      .populate('userId', 'nome email matricula')
      .sort({ nota: -1 });

    const provasRealizadas = await ProvaRealizada.find({ provaId: provaId })
      .populate('alunoId', 'nome email matricula')
      .sort({ nota: -1 });

    const todosResultados = [];

    resultados.forEach(r => {
      // Professor sempre vê a nota, mesmo se não liberada para aluno
      todosResultados.push({
        alunoId: r.userId._id,
        alunoNome: r.userId.nome,
        alunoEmail: r.userId.email,
        alunoMatricula: r.userId.matricula,
        nota: r.nota, // Professor vê a nota mesmo se notaLiberada for false
        acertos: r.acertos,
        total: r.total,
        porcentagem: r.porcentagem,
        tempoGasto: r.tempoGasto,
        dataEntrega: r.createdAt,
        respostas: r.respostas,
        notaLiberada: r.notaLiberada, // Incluir status de liberação
        tipo: 'resultado'
      });
    });

    provasRealizadas.forEach(pr => {
      const jaExiste = todosResultados.some(r => 
        r.alunoId.toString() === pr.alunoId._id.toString()
      );
      
      if (!jaExiste && pr.alunoId) {
        todosResultados.push({
          alunoId: pr.alunoId._id,
          alunoNome: pr.alunoId.nome,
          alunoEmail: pr.alunoId.email,
          alunoMatricula: pr.alunoId.matricula,
          nota: pr.nota, // Professor vê a nota
          tempoGasto: pr.tempoGasto,
          dataEntrega: pr.dataRealizacao,
          respostas: pr.respostas,
          notaLiberada: pr.notaLiberada, // Incluir status de liberação
          tipo: 'prova_realizada'
        });
      }
    });

    // Estatísticas - considerar todas as notas que existem
    const resultadosComNota = todosResultados.filter(r => r.nota !== null && r.nota !== undefined);
    const totalAlunos = todosResultados.length;
    const alunosCompletaram = resultadosComNota.length;
    
    const mediaNotas = alunosCompletaram > 0 
      ? resultadosComNota.reduce((sum, r) => sum + (r.nota || 0), 0) / alunosCompletaram 
      : 0;
    
    const maiorNota = alunosCompletaram > 0 ? Math.max(...resultadosComNota.map(r => r.nota)) : 0;
    const menorNota = alunosCompletaram > 0 ? Math.min(...resultadosComNota.map(r => r.nota)) : 0;

    const distribuicao = {
      A: resultadosComNota.filter(r => r.nota >= 9.0).length,
      B: resultadosComNota.filter(r => r.nota >= 7.0 && r.nota < 9.0).length,
      C: resultadosComNota.filter(r => r.nota >= 5.0 && r.nota < 7.0).length,
      D: resultadosComNota.filter(r => r.nota < 5.0).length,
      'Sem nota': todosResultados.filter(r => r.nota === null || r.nota === undefined).length
    };

    res.json({
      success: true,
      prova: {
        _id: prova._id,
        titulo: prova.titulo,
        conteudo: prova.conteudo,
        quantidadeQuestoes: prova.questoes.length,
        dificuldade: prova.dificuldade,
        dataLimite: prova.dataLimite,
        duracao: prova.duracao,
        professorId: prova.userId
      },
      resultados: todosResultados,
      estatisticas: {
        totalAlunos,
        alunosCompletaram,
        alunosPendentes: totalAlunos - alunosCompletaram,
        mediaNotas: mediaNotas.toFixed(1),
        maiorNota: maiorNota.toFixed(1),
        menorNota: menorNota > 0 ? menorNota.toFixed(1) : '0.0',
        distribuicao
      },
      mensagem: `Foram encontrados ${totalAlunos} alunos, sendo ${alunosCompletaram} com nota calculada.`
    });

  } catch (error) {
    console.error('Erro ao buscar resultados da prova:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor: ' + error.message
    });
  }
});

// ROTA: Resultado do aluno para uma prova específica (ATUALIZADA COM TRATAMENTO DE ERRO)
app.get('/api/aluno/provas/:provaId/resultado', authenticateToken, async (req, res) => {
    try {
        const provaId = req.params.provaId;
        const alunoId = req.userId;

        console.log(`🔍 Buscando resultado: Aluno ${alunoId}, Prova ${provaId}`);

        // Validar provaId
        if (!provaId || provaId === 'undefined' || !mongoose.Types.ObjectId.isValid(provaId)) {
            return res.status(400).json({
                success: false,
                error: 'ID da prova inválido'
            });
        }

        if (req.userRole !== 'aluno') {
            return res.status(403).json({
                success: false,
                error: 'Apenas alunos podem acessar esta rota'
            });
        }

        // Buscar no modelo Resultado
        let resultado = await Resultado.findOne({
            provaId: provaId,
            userId: alunoId
        })
        .populate('provaId', 'titulo conteudo');

        // Se não encontrou, buscar no ProvaRealizada
        if (!resultado) {
            console.log('🔍 Não encontrado no Resultado, buscando em ProvaRealizada...');
            const provaRealizada = await ProvaRealizada.findOne({
                provaId: provaId,
                alunoId: alunoId
            })
            .populate('provaId', 'titulo conteudo');

            if (!provaRealizada) {
                return res.status(404).json({
                    success: false,
                    error: 'Você ainda não realizou esta prova'
                });
            }

            // Verificar se a nota foi liberada
            if (!provaRealizada.notaLiberada) {
                return res.json({
                    success: true,
                    status: 'pendente',
                    mensagem: 'Sua prova ainda está sendo corrigida pelo professor.',
                    dataEntrega: provaRealizada.dataRealizacao,
                    tempoGasto: provaRealizada.tempoGasto,
                    prova: {
                        titulo: provaRealizada.provaId ? provaRealizada.provaId.titulo : 'Prova',
                        conteudo: provaRealizada.provaId ? provaRealizada.provaId.conteudo : ''
                    }
                });
            }
            
            // Se a nota foi liberada, retornar
            return res.json({
                success: true,
                status: 'corrigida',
                nota: provaRealizada.nota,
                dataEntrega: provaRealizada.dataRealizacao,
                tempoGasto: provaRealizada.tempoGasto,
                prova: {
                    titulo: provaRealizada.provaId ? provaRealizada.provaId.titulo : 'Prova',
                    conteudo: provaRealizada.provaId ? provaRealizada.provaId.conteudo : ''
                },
                tipo: 'prova_realizada'
            });
        }

        // Verificar se a nota foi liberada no Resultado
        if (!resultado.notaLiberada) {
            return res.json({
                success: true,
                status: 'pendente',
                mensagem: 'Sua prova ainda está sendo corrigida pelo professor.',
                dataEntrega: resultado.createdAt,
                tempoGasto: resultado.tempoGasto,
                prova: {
                    titulo: resultado.provaId ? resultado.provaId.titulo : 'Prova',
                    conteudo: resultado.provaId ? resultado.provaId.conteudo : ''
                }
            });
        }

        // Retornar resultado do modelo Resultado (nota liberada)
        res.json({
            success: true,
            status: 'corrigida',
            nota: resultado.nota,
            acertos: resultado.acertos,
            total: resultado.total,
            porcentagem: resultado.porcentagem,
            tempoGasto: resultado.tempoGasto,
            dataEntrega: resultado.createdAt,
            prova: {
                titulo: resultado.provaId ? resultado.provaId.titulo : 'Prova',
                conteudo: resultado.provaId ? resultado.provaId.conteudo : ''
            },
            tipo: 'resultado'
        });

    } catch (error) {
        console.error('❌ Erro detalhado ao buscar resultado do aluno:', error);
        
        // Verificar se é erro de ObjectId
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

    // Preparar dados da prova
    const dadosProva = {
      id: prova._id,
      titulo: prova.titulo,
      conteudo: prova.conteudo,
      dataCriacao: prova.createdAt,
      dataLimite: prova.dataLimite,
      duracao: prova.duracao,
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

    // Buscar todos os alunos que realizaram esta prova
    const provasRealizadas = await ProvaRealizada.find({ provaId: provaId })
      .populate('alunoId', 'nome email matricula')
      .sort({ dataRealizacao: -1 });

    const resultados = await Resultado.find({ provaId: provaId })
      .populate('userId', 'nome email matricula')
      .sort({ createdAt: -1 });

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

app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(50));
  console.log(`🚀 SISTEMA DE PROVAS ONLINE - ${process.env.NODE_ENV || 'development'}`);
  console.log(`📡 Servidor rodando na porta: ${PORT}`);
  
  if (process.env.NODE_ENV === 'production') {
    console.log(`🌐 URL Pública: https://seu-app.onrender.com`);
  }
  
  console.log(`🗄️  Banco de Dados: ${mongoose.connection.readyState === 1 ? '✅ Conectado' : '❌ Desconectado'}`);
  console.log('='.repeat(50));
});

// ============ FRONTEND ESTÁTICO ============
app.use(express.static(path.join(__dirname, '../frontend')));

// Rota fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ============ INICIAR SERVIDOR ============
app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log(`🚀 SISTEMA DE PROVAS ONLINE - PRODUÇÃO`);
  console.log(`📡 Servidor: http://localhost:${PORT}`);
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