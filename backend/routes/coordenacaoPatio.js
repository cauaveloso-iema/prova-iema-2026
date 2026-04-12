const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Refeicao = require('../models/Refeicao');

// Middleware de autenticação (igual ao do server.js)
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

// Middleware específico para coordenação de pátio
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
    timestamp: new Date().toISOString()
  });
});

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
        .select('_id nome email matricula curso turma fotoPerfil')
        .sort({ nome: 1 });
      
      // Obter turmas únicas para filtro
      const turmas = await User.distinct('turma', { role: 'aluno', ativo: true, turma: { $ne: null, $ne: '' } });
      const cursos = await User.distinct('curso', { role: 'aluno', ativo: true, curso: { $ne: null, $ne: '' } });
      
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
          fotoPerfil: a.fotoPerfil || null
        }))
      });
    } catch (error) {
      console.error('Erro ao listar alunos:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao listar alunos: ' + error.message
      });
    }
  }
);

// ============================================
// 🔍 BUSCAR ALUNO POR QR CODE (ID)
// ============================================
router.get('/aluno/:id', 
  authenticateToken, 
  verificarCoordenacaoPatio, 
  async (req, res) => {
    try {
      const alunoId = req.params.id;
      
      const aluno = await User.findOne({ 
        _id: alunoId, 
        role: 'aluno',
        ativo: true 
      }).select('nome email matricula curso turma fotoPerfil');
      
      if (!aluno) {
        return res.status(404).json({
          success: false,
          error: 'Aluno não encontrado'
        });
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
      
      let jaComeu = false;
      let mensagemRefeicao = '';
      
      if (tipoRefeicao) {
        jaComeu = await Refeicao.alunoJaComeu(aluno._id, tipoRefeicao, dataAtual);
        
        if (jaComeu) {
          mensagemRefeicao = `⚠️ Aluno já registrou ${tipoRefeicao === 'manha' ? 'LANCHE DA MANHÃ' : tipoRefeicao === 'almoco' ? 'ALMOÇO' : 'LANCHE DA TARDE'} hoje`;
        } else {
          mensagemRefeicao = `📝 Aluno pode registrar ${tipoRefeicao === 'manha' ? 'LANCHE DA MANHÃ' : tipoRefeicao === 'almoco' ? 'ALMOÇO' : 'LANCHE DA TARDE'}`;
        }
      }
      
      const refeicoesHoje = await Refeicao.countDocuments({
        alunoId: aluno._id,
        data: dataAtual
      });
      
      const podeRegistrar = horarioPermitido && !jaComeu && refeicoesHoje < 3;
      
      res.json({
        success: true,
        aluno: {
          id: aluno._id,
          nome: aluno.nome,
          matricula: aluno.matricula,
          turma: aluno.turma,
          curso: aluno.curso,
          fotoPerfil: aluno.fotoPerfil || null
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
        mensagemRefeicao
      });
      
    } catch (error) {
      console.error('Erro ao buscar aluno:', error);
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
      const aluno = await User.findById(alunoId);
      if (!aluno || aluno.role !== 'aluno') {
        return res.status(404).json({
          success: false,
          error: 'Aluno não encontrado'
        });
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
      
      res.json({
        success: true,
        message: `${aluno.nome} registrou ${tipoRefeicao === 'manha' ? 'LANCHE DA MANHÃ' : tipoRefeicao === 'almoco' ? 'ALMOÇO' : 'LANCHE DA TARDE'} com sucesso!`,
        refeicao: {
          id: refeicao._id,
          tipo: refeicao.tipoRefeicao,
          horario: refeicao.horario,
          refeicoesHoje: refeicoesHoje + 1
        }
      });
      
    } catch (error) {
      console.error('Erro ao registrar refeição:', error);
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
        .limit(50);
      
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
          alunoTurma: r.alunoTurma,
          tipoRefeicao: r.tipoRefeicao,
          horario: r.horario,
          validadoPorNome: r.validadoPorNome,
          observacao: r.observacao
        }))
      });
      
    } catch (error) {
      console.error('Erro ao buscar registros:', error);
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
        .sort({ horario: -1 });
      
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
      console.error('Erro ao buscar registros por data:', error);
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
      const refeicoesHoje = await Refeicao.find({ data: dataAtual });
      
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
      console.error('Erro ao buscar estatísticas:', error);
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
      
      const registros = await Refeicao.find(query).sort({ data: -1, horario: -1 });
      
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
      console.error('Erro ao gerar relatório:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao gerar relatório: ' + error.message
      });
    }
  }
);

module.exports = router;