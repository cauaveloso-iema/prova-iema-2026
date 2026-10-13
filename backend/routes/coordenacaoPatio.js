// ============================================================================
// COORDENAÇÃO DE PÁTIO - EducaPleno
// ============================================================================
// Descrição: Rotas para controle de refeições dos alunos
//
// Rotas incluídas:
//   - GET  /api/coordenacao-patio/health
//   - GET  /api/coordenacao-patio/turmas
//   - GET  /api/coordenacao-patio/alunos
//   - GET  /api/coordenacao-patio/aluno/:id
//   - POST /api/coordenacao-patio/registrar-refeicao
//   - GET  /api/coordenacao-patio/registros-hoje
//   - GET  /api/coordenacao-patio/registros/:data
//   - GET  /api/coordenacao-patio/estatisticas
//   - GET  /api/coordenacao-patio/relatorio
//
// Autor: Equipe de Desenvolvimento
// ============================================================================

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

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

let Refeicao = null;
try {
  Refeicao = require('../models/Refeicao');
} catch (err) {
  console.warn('[coordenacao-patio] Model Refeicao não disponível:', err.message);
}

let RodizioRefeicao = null;
try {
  RodizioRefeicao = require('../models/RodizioRefeicao');
} catch (err) {
  console.warn('[coordenacao-patio] Model RodizioRefeicao não disponível:', err.message);
}

let Turma = null;
try {
  Turma = require('../models/Turma');
} catch (err) {
  console.warn('[coordenacao-patio] Model Turma não disponível:', err.message);
}

// ============================================
// MIDDLEWARES
// ============================================

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Acesso negado. Token não fornecido.'
    });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({
        success: false,
        error: 'Token inválido ou expirado.'
      });
    }
    req.userId = decoded.id;
    req.userRole = decoded.role;
    req.userNome = decoded.nome;
    next();
  });
};

const verificarCoordenacaoPatio = (req, res, next) => {
  const allowedRoles = ['coordenacao_patio', 'super_admin', 'admin'];

  if (!allowedRoles.includes(req.userRole)) {
    return res.status(403).json({
      success: false,
      error: 'Acesso permitido apenas para Coordenação de Pátio'
    });
  }
  next();
};

// ============================================
// 🏥 HEALTH CHECK - Rota de teste
// ============================================
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'online',
    service: 'Coordenação do Pátio',
    models: {
      Refeicao: !!Refeicao,
      RodizioRefeicao: !!RodizioRefeicao,
      Turma: !!Turma,
      User: !!User
    },
    timestamp: new Date().toISOString()
  });
});

// ============================================
// 📋 LISTAR TURMAS (para filtros)
// ============================================
router.get('/turmas',
  authenticateToken,
  verificarCoordenacaoPatio,
  async (req, res) => {
    try {
      if (!Turma) {
        return res.status(503).json({
          success: false,
          error: 'Modelo Turma não disponível'
        });
      }

      const turmas = await Turma.find({ ativa: true })
        .populate('alunos', 'nome email matricula curso turma fotoPerfil precisaAcessibilidade')
        .select('nome disciplina codigo eixo')
        .lean();

      const nomesTurmas = [...new Set(turmas.map(t => t.nome))];

      res.json({
        success: true,
        turmas: nomesTurmas,
        turmasCompletas: turmas
      });

    } catch (error) {
      logger.error('❌ Erro ao listar turmas:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// ============================================
// 📋 LISTAR TODOS OS ALUNOS
// ============================================
router.get('/alunos',
  authenticateToken,
  verificarCoordenacaoPatio,
  async (req, res) => {
    try {
      const { turma, curso, search } = req.query;

      let query = { role: 'aluno', ativo: true };

      // Filtros opcionais
      if (turma) query.turma = turma;
      if (curso) query.curso = curso;
      if (search) {
        query.$or = [
          { nome: { $regex: search, $options: 'i' } },
          { matricula: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ];
      }

      const alunos = await User.find(query)
        .select('_id nome email matricula curso turma fotoPerfil precisaAcessibilidade perfilAlimentar refeicoesQueParticipa')
        .sort({ nome: 1 })
        .lean();

      // Obter turmas únicas para filtro
      const turmas = await User.distinct('turma', {
        role: 'aluno',
        ativo: true,
        turma: { $ne: null, $ne: '' }
      });
      const cursos = await User.distinct('curso', {
        role: 'aluno',
        ativo: true,
        curso: { $ne: null, $ne: '' }
      });

      res.json({
        success: true,
        total: alunos.length,
        turmas: turmas.filter(t => t),
        cursos: cursos.filter(c => c),
        alunos: alunos.map(a => ({
          id: a._id,
          nome: a.nome,
          email: a.email,
          matricula: a.matricula,
          curso: a.curso,
          turma: a.turma,
          fotoPerfil: a.fotoPerfil || null,
          precisaAcessibilidade: a.precisaAcessibilidade || false,
          perfilAlimentar: a.perfilAlimentar || 'nao_informado',
          refeicoesQueParticipa: a.refeicoesQueParticipa || []
        }))
      });
    } catch (error) {
      logger.error('❌ Erro ao listar alunos:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao listar alunos: ' + error.message
      });
    }
  }
);

// ============================================
// 🔍 BUSCAR ALUNO POR QR CODE (ID) - COM VERIFICAÇÃO DE RODÍZIO
// ============================================
router.get('/aluno/:id',
  authenticateToken,
  verificarCoordenacaoPatio,
  async (req, res) => {
    try {
      const alunoId = req.params.id;

      // Validar se o ID é válido (24 caracteres hexadecimais)
      if (!alunoId || !alunoId.match(/^[0-9a-fA-F]{24}$/)) {
        logger.info(`❌ ID inválido: ${alunoId}`);
        return res.status(400).json({
          success: false,
          error: 'ID de usuário inválido'
        });
      }

      const aluno = await User.findOne({
        _id: alunoId,
        ativo: true
      }).select('nome email matricula curso turma fotoPerfil role precisaAcessibilidade perfilAlimentar refeicoesQueParticipa');

      if (!aluno) {
        return res.status(404).json({
          success: false,
          error: 'Usuário não encontrado'
        });
      }

      // Se não for aluno, retornar mensagem amigável
      if (aluno.role !== 'aluno') {
        logger.info(`⚠️ Usuário ${aluno.nome} não é aluno (role: ${aluno.role})`);
        return res.status(400).json({
          success: false,
          error: `Este QR Code pertence a um ${aluno.role === 'professor' ? 'professor' : 'funcionário'}. Apenas alunos podem registrar refeições.`
        });
      }

      // 🔥 VERIFICAR RODÍZIO DE ALMOÇO (se for aluno)
      let podeAlmocarRodizio = true;
      let mensagemRodizio = '';

      if (RodizioRefeicao && aluno.turma) {
        try {
          const rodizioCheck = await RodizioRefeicao.turmaPodeAlmocarHoje(aluno.turma);
          podeAlmocarRodizio = rodizioCheck.pode;
          mensagemRodizio = rodizioCheck.motivo;

          logger.info(`🍽️ Verificação de rodízio para turma ${aluno.turma}: ${podeAlmocarRodizio ? '✅ PODE almoçar' : '❌ NÃO PODE almoçar'} - ${mensagemRodizio}`);
        } catch (err) {
          logger.warn('⚠️ Erro ao verificar rodízio:', err.message);
          podeAlmocarRodizio = true;
          mensagemRodizio = 'Não foi possível verificar o rodízio';
        }
      }

      const agora = new Date();
      const horaAtual = agora.getHours();
      const dataAtual = agora.toISOString().split('T')[0];

      let tipoRefeicao = null;
      let horarioPermitido = false;
      let mensagemHorario = '';
      let isObrigatorio = false;

      if (horaAtual >= 8 && horaAtual <= 10) {
        tipoRefeicao = 'manha';
        horarioPermitido = true;
        mensagemHorario = '☀️ Lanche da Manhã (8h-10h)';
        isObrigatorio = false;
      } else if (horaAtual >= 11 && horaAtual <= 13) {
        tipoRefeicao = 'almoco';
        horarioPermitido = true;
        mensagemHorario = '🍽️ Almoço (11h-13h) - OBRIGATÓRIO';
        isObrigatorio = true;
      } else if (horaAtual >= 14 && horaAtual <= 16) {
        tipoRefeicao = 'tarde';
        horarioPermitido = true;
        mensagemHorario = '🌙 Lanche da Tarde (14h-16h)';
        isObrigatorio = false;
      } else {
        horarioPermitido = false;
        mensagemHorario = '❌ Fora do horário de refeições (Refeições: 8h-10h, 11h-13h, 14h-16h)';
      }

      // 🔥 SE FOR ALMOÇO E NÃO PODE PELO RODÍZIO, BLOQUEAR
      if (tipoRefeicao === 'almoco' && !podeAlmocarRodizio) {
        horarioPermitido = false;
        mensagemHorario = `❌ ${mensagemRodizio}`;
      }

      // 🔥 VERIFICAR PERFIL ALIMENTAR
      const perfilAlimentar = aluno.perfilAlimentar || 'nao_informado';
      const refeicoesPermitidas = aluno.refeicoesQueParticipa || [];

      if (tipoRefeicao) {
        if (perfilAlimentar === 'nunca') {
          horarioPermitido = false;
          mensagemHorario = '❌ Aluno não participa das refeições';
        } else if (perfilAlimentar === 'as_vezes' && !refeicoesPermitidas.includes(tipoRefeicao)) {
          horarioPermitido = false;
          const nomeRefeicao = tipoRefeicao === 'manha' ? 'Lanche da Manhã' : tipoRefeicao === 'almoco' ? 'Almoço' : 'Lanche da Tarde';
          mensagemHorario = `⚠️ Aluno não participa do ${nomeRefeicao}`;
        }
      }

      let jaComeu = false;
      let mensagemRefeicao = '';

      if (tipoRefeicao && Refeicao) {
        try {
          jaComeu = await Refeicao.alunoJaComeu(aluno._id, tipoRefeicao, dataAtual);
        } catch (err) {
          logger.warn('⚠️ Erro ao verificar refeição:', err.message);
          jaComeu = false;
        }

        if (jaComeu) {
          mensagemRefeicao = `⚠️ Aluno já registrou ${tipoRefeicao === 'manha' ? 'LANCHE DA MANHÃ' : tipoRefeicao === 'almoco' ? 'ALMOÇO' : 'LANCHE DA TARDE'} hoje`;
        } else {
          mensagemRefeicao = `📝 Aluno pode registrar ${tipoRefeicao === 'manha' ? 'LANCHE DA MANHÃ' : tipoRefeicao === 'almoco' ? 'ALMOÇO' : 'LANCHE DA TARDE'}`;
        }
      }

      let refeicoesHoje = 0;
      if (Refeicao) {
        try {
          refeicoesHoje = await Refeicao.countDocuments({
            alunoId: aluno._id,
            data: dataAtual
          });
        } catch (err) {
          logger.warn('⚠️ Erro ao contar refeições:', err.message);
        }
      }

      const podeRegistrar = horarioPermitido && !jaComeu && refeicoesHoje < 3;

      res.json({
        success: true,
        aluno: {
          id: aluno._id,
          nome: aluno.nome,
          matricula: aluno.matricula,
          turma: aluno.turma,
          curso: aluno.curso,
          fotoPerfil: aluno.fotoPerfil || null,
          role: aluno.role,
          precisaAcessibilidade: aluno.precisaAcessibilidade || false,
          perfilAlimentar: perfilAlimentar,
          refeicoesQueParticipa: refeicoesPermitidas
        },
        horario: {
          atual: horaAtual,
          tipoRefeicao,
          horarioPermitido,
          mensagem: mensagemHorario,
          podeRegistrar,
          jaComeu,
          refeicoesHoje,
          limiteDiario: 3,
          isObrigatorio
        },
        rodizio: {
          verificado: tipoRefeicao === 'almoco',
          podeAlmocar: podeAlmocarRodizio,
          mensagem: mensagemRodizio
        },
        mensagemRefeicao
      });

    } catch (error) {
      logger.error('❌ Erro ao buscar aluno:', error);
      logger.error('Stack:', error.stack);
      res.status(500).json({
        success: false,
        error: 'Erro ao buscar aluno: ' + error.message
      });
    }
  }
);

// ============================================
// 📝 REGISTRAR REFEIÇÃO DO ALUNO
// ============================================
router.post('/registrar-refeicao',
  authenticateToken,
  verificarCoordenacaoPatio,
  async (req, res) => {
    try {
      const { alunoId, tipoRefeicao, observacao } = req.body;

      if (!alunoId || !tipoRefeicao) {
        return res.status(400).json({
          success: false,
          error: 'alunoId e tipoRefeicao são obrigatórios'
        });
      }

      const agora = new Date();
      const horaAtual = agora.getHours();
      const dataAtual = agora.toISOString().split('T')[0];

      // Validar tipo de refeição
      if (!['manha', 'almoco', 'tarde'].includes(tipoRefeicao)) {
        return res.status(400).json({
          success: false,
          error: 'Tipo de refeição inválido'
        });
      }

      // Validar horário
      let horarioPermitido = false;
      if (tipoRefeicao === 'manha' && horaAtual >= 8 && horaAtual <= 10) horarioPermitido = true;
      if (tipoRefeicao === 'almoco' && horaAtual >= 11 && horaAtual <= 13) horarioPermitido = true;
      if (tipoRefeicao === 'tarde' && horaAtual >= 14 && horaAtual <= 16) horarioPermitido = true;

      if (!horarioPermitido) {
        return res.status(400).json({
          success: false,
          error: `Horário não permitido para ${tipoRefeicao === 'manha' ? 'LANCHE DA MANHÃ' : tipoRefeicao === 'almoco' ? 'ALMOÇO' : 'LANCHE DA TARDE'}`
        });
      }

      // Buscar aluno
      const aluno = await User.findById(alunoId)
        .select('nome turma matricula fotoPerfil perfilAlimentar refeicoesQueParticipa role');

      if (!aluno || aluno.role !== 'aluno') {
        return res.status(404).json({
          success: false,
          error: 'Aluno não encontrado'
        });
      }

      // 🔥 VERIFICAR PERFIL ALIMENTAR
      const perfilAlimentar = aluno.perfilAlimentar || 'nao_informado';
      const refeicoesPermitidas = aluno.refeicoesQueParticipa || [];

      if (perfilAlimentar === 'nunca') {
        return res.status(400).json({
          success: false,
          error: 'Aluno não participa das refeições'
        });
      }

      if (perfilAlimentar === 'as_vezes' && !refeicoesPermitidas.includes(tipoRefeicao)) {
        const nomeRefeicao = tipoRefeicao === 'manha' ? 'Lanche da Manhã' : tipoRefeicao === 'almoco' ? 'Almoço' : 'Lanche da Tarde';
        return res.status(400).json({
          success: false,
          error: `Aluno não participa do ${nomeRefeicao}`
        });
      }

      // 🔥 NOVA VERIFICAÇÃO: Verificar rodízio para ALMOÇO
      if (tipoRefeicao === 'almoco' && aluno.turma && RodizioRefeicao) {
        try {
          const rodizioCheck = await RodizioRefeicao.turmaPodeAlmocarHoje(aluno.turma);

          if (!rodizioCheck.pode) {
            return res.status(400).json({
              success: false,
              error: rodizioCheck.motivo,
              rodizio: {
                verificado: true,
                pode: false,
                mensagem: rodizioCheck.motivo
              }
            });
          }

          logger.info(`🍽️ Rodízio VERIFICADO para turma ${aluno.turma}: ${rodizioCheck.pode ? '✅ APROVADO' : '❌ BLOQUEADO'}`);
        } catch (err) {
          logger.warn('⚠️ Erro ao verificar rodízio:', err.message);
        }
      }

      // Verificar se já registrou esta refeição hoje
      const jaComeu = await Refeicao.alunoJaComeu(alunoId, tipoRefeicao, dataAtual);
      if (jaComeu) {
        return res.status(400).json({
          success: false,
          error: 'Aluno já registrou esta refeição hoje'
        });
      }

      // Verificar limite diário
      const refeicoesHoje = await Refeicao.countDocuments({
        alunoId,
        data: dataAtual
      });

      if (refeicoesHoje >= 3) {
        return res.status(400).json({
          success: false,
          error: 'Aluno já atingiu o limite de 3 refeições hoje'
        });
      }

      // Buscar dados do coordenador
      const coordenador = await User.findById(req.userId).select('nome');

      // Registrar refeição
      const refeicao = new Refeicao({
        alunoId: aluno._id,
        alunoNome: aluno.nome,
        alunoTurma: aluno.turma || 'Não informada',
        alunoFoto: aluno.fotoPerfil,
        tipoRefeicao,
        horario: agora,
        data: dataAtual,
        validadoPor: req.userId,
        validadoPorNome: coordenador?.nome || req.userNome || 'Coordenador',
        horarioPermitido,
        observacao: observacao || ''
      });

      await refeicao.save();

      logger.info(`✅ Refeição registrada: ${aluno.nome} - ${tipoRefeicao}`);

      res.json({
        success: true,
        message: `${aluno.nome} registrou ${tipoRefeicao === 'manha' ? 'LANCHE DA MANHÃ' : tipoRefeicao === 'almoco' ? 'ALMOÇO' : 'LANCHE DA TARDE'} com sucesso!`,
        refeicao: {
          id: refeicao._id,
          tipo: refeicao.tipoRefeicao,
          horario: refeicao.horario,
          refeicoesHoje: refeicoesHoje + 1
        },
        rodizio: tipoRefeicao === 'almoco' ? {
          verificado: true,
          autorizado: true
        } : undefined
      });

    } catch (error) {
      logger.error('❌ Erro ao registrar refeição:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao registrar refeição: ' + error.message
      });
    }
  }
);

// ============================================
// 📊 CONSULTAR REGISTROS DO DIA
// ============================================
router.get('/registros-hoje',
  authenticateToken,
  verificarCoordenacaoPatio,
  async (req, res) => {
    try {
      const dataAtual = new Date().toISOString().split('T')[0];

      const registros = await Refeicao.find({ data: dataAtual })
        .sort({ horario: -1 })
        .limit(50)
        .lean();

      const contagem = {
        manha: await Refeicao.countDocuments({ data: dataAtual, tipoRefeicao: 'manha' }),
        almoco: await Refeicao.countDocuments({ data: dataAtual, tipoRefeicao: 'almoco' }),
        tarde: await Refeicao.countDocuments({ data: dataAtual, tipoRefeicao: 'tarde' }),
        total: await Refeicao.countDocuments({ data: dataAtual })
      };

      res.json({
        success: true,
        data: dataAtual,
        contagem,
        registros: registros.map(r => ({
          id: r._id,
          alunoNome: r.alunoNome,
          alunoMatricula: r.alunoId,
          alunoTurma: r.alunoTurma,
          tipoRefeicao: r.tipoRefeicao,
          horario: r.horario,
          validadoPorNome: r.validadoPorNome,
          observacao: r.observacao
        }))
      });

    } catch (error) {
      logger.error('❌ Erro ao buscar registros:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao buscar registros: ' + error.message
      });
    }
  }
);

// ============================================
// 📊 CONSULTAR REGISTROS POR DATA
// ============================================
router.get('/registros/:data',
  authenticateToken,
  verificarCoordenacaoPatio,
  async (req, res) => {
    try {
      const { data } = req.params;

      // Validar formato da data (YYYY-MM-DD)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
        return res.status(400).json({
          success: false,
          error: 'Formato de data inválido. Use YYYY-MM-DD'
        });
      }

      const registros = await Refeicao.find({ data })
        .sort({ horario: -1 })
        .lean();

      const contagem = {
        manha: await Refeicao.countDocuments({ data, tipoRefeicao: 'manha' }),
        almoco: await Refeicao.countDocuments({ data, tipoRefeicao: 'almoco' }),
        tarde: await Refeicao.countDocuments({ data, tipoRefeicao: 'tarde' }),
        total: await Refeicao.countDocuments({ data })
      };

      res.json({
        success: true,
        data,
        contagem,
        registros: registros.map(r => ({
          id: r._id,
          alunoNome: r.alunoNome,
          alunoTurma: r.alunoTurma,
          tipoRefeicao: r.tipoRefeicao,
          horario: r.horario,
          validadoPorNome: r.validadoPorNome
        }))
      });

    } catch (error) {
      logger.error('❌ Erro ao buscar registros por data:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao buscar registros: ' + error.message
      });
    }
  }
);

// ============================================
// 📊 ESTATÍSTICAS DO DIA
// ============================================
router.get('/estatisticas',
  authenticateToken,
  verificarCoordenacaoPatio,
  async (req, res) => {
    try {
      const dataAtual = new Date().toISOString().split('T')[0];

      // Total de alunos ativos
      const totalAlunos = await User.countDocuments({ role: 'aluno', ativo: true });

      // Refeições registradas hoje
      const refeicoesHoje = await Refeicao.find({ data: dataAtual }).lean();

      const refeicoesPorTurma = {};
      refeicoesHoje.forEach(r => {
        if (!refeicoesPorTurma[r.alunoTurma]) {
          refeicoesPorTurma[r.alunoTurma] = { manha: 0, almoco: 0, tarde: 0, total: 0 };
        }
        refeicoesPorTurma[r.alunoTurma][r.tipoRefeicao]++;
        refeicoesPorTurma[r.alunoTurma].total++;
      });

      // Alunos que já comeram pelo menos uma refeição hoje
      const alunosQueComeram = new Set(refeicoesHoje.map(r => r.alunoId.toString()));

      res.json({
        success: true,
        data: dataAtual,
        totalAlunos,
        alunosQueComeram: alunosQueComeram.size,
        refeicoesHoje: refeicoesHoje.length,
        refeicoesPorTurma,
        porcentagem: totalAlunos > 0 ? ((alunosQueComeram.size / totalAlunos) * 100).toFixed(1) : 0
      });

    } catch (error) {
      logger.error('❌ Erro ao buscar estatísticas:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao buscar estatísticas: ' + error.message
      });
    }
  }
);

// ============================================
// 📊 RELATÓRIO POR PERÍODO
// ============================================
router.get('/relatorio',
  authenticateToken,
  verificarCoordenacaoPatio,
  async (req, res) => {
    try {
      const { dataInicio, dataFim, turma } = req.query;

      let query = {};

      if (dataInicio && dataFim) {
        query.data = { $gte: dataInicio, $lte: dataFim };
      } else if (dataInicio) {
        query.data = { $gte: dataInicio };
      } else if (dataFim) {
        query.data = { $lte: dataFim };
      } else {
        // Últimos 7 dias por padrão
        const seteDiasAtras = new Date();
        seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);
        query.data = { $gte: seteDiasAtras.toISOString().split('T')[0] };
      }

      if (turma) {
        query.alunoTurma = turma;
      }

      const registros = await Refeicao.find(query)
        .sort({ data: -1, horario: -1 })
        .lean();

      // Agrupar por data e tipo
      const porData = {};
      registros.forEach(r => {
        if (!porData[r.data]) {
          porData[r.data] = { manha: 0, almoco: 0, tarde: 0, total: 0 };
        }
        porData[r.data][r.tipoRefeicao]++;
        porData[r.data].total++;
      });

      res.json({
        success: true,
        filtros: { dataInicio, dataFim, turma },
        totalRegistros: registros.length,
        porData,
        registros: registros.slice(0, 100).map(r => ({
          data: r.data,
          alunoNome: r.alunoNome,
          alunoTurma: r.alunoTurma,
          tipoRefeicao: r.tipoRefeicao,
          horario: r.horario,
          validadoPorNome: r.validadoPorNome
        }))
      });

    } catch (error) {
      logger.error('❌ Erro ao gerar relatório:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao gerar relatório: ' + error.message
      });
    }
  }
);

// ============================================================================
// EXPORTAR ROUTER
// ============================================================================
module.exports = router;