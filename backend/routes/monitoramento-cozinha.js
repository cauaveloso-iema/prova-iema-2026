const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Refeicao = require('../models/Refeicao');
const RodizioRefeicao = require('../models/RodizioRefeicao');

// Middleware de autenticação
const authenticateToken = (req, res, next) => {
  // 🔥 CORREÇÃO: Aceitar token via query string para SSE
  let token = req.headers.authorization?.split(' ')[1];
  
  if (!token && req.query.token) {
    token = req.query.token;
  }
  
  if (!token) {
    return res.status(401).json({ success: false, error: 'Token não fornecido' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ success: false, error: 'Token inválido' });
    }
    req.userId = decoded.id;
    req.userRole = decoded.role;
    req.userNome = decoded.nome;
    next();
  });
};

// Verificar permissão de admin
const verificarAdmin = (req, res, next) => {
  const allowedRoles = ['admin', 'super_admin', 'gestao_geral'];
  
  if (!allowedRoles.includes(req.userRole)) {
    return res.status(403).json({
      success: false,
      error: 'Acesso permitido apenas para Administradores e Gestão Geral'
    });
  }
  next();
};

// ============================================
// 🏥 HEALTH CHECK
// ============================================
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'online',
    service: 'Cozinha Monitoramento',
    timestamp: new Date().toISOString()
  });
});

// ============================================
// 📊 DASHBOARD - COZINHA + GESTÃO GERAL
// ============================================
router.get('/dashboard', authenticateToken, verificarAdmin, async (req, res) => {
  try {
    const hoje = new Date().toISOString().split('T')[0];
    const agora = new Date();
    const horaAtual = agora.getHours();
    
    // ========== 1. DADOS DA COZINHA ==========
    
    const totalPessoas = await User.countDocuments({ ativo: true });
    
    const totalPorTipo = {
      alunos: await User.countDocuments({ role: 'aluno', ativo: true }),
      professores: await User.countDocuments({ role: 'professor', ativo: true }),
      servidores: await User.countDocuments({ 
        role: { $in: ['admin', 'super_admin', 'setor_pedagogico', 'coordenacao_patio', 'cozinha', 'gestao_geral'] }, 
        ativo: true 
      })
    };
    
    const refeicoesHoje = await Refeicao.find({ data: hoje });
    
    const contagemRefeicoes = {
      manha: refeicoesHoje.filter(r => r.tipoRefeicao === 'manha').length,
      almoco: refeicoesHoje.filter(r => r.tipoRefeicao === 'almoco').length,
      tarde: refeicoesHoje.filter(r => r.tipoRefeicao === 'tarde').length,
      total: refeicoesHoje.length,
      pessoasUnicas: new Set(refeicoesHoje.map(r => r.alunoId.toString())).size
    };
    
    const perfisAlimentares = {
      sempre: await User.countDocuments({ ativo: true, perfilAlimentar: 'sempre' }),
      as_vezes: await User.countDocuments({ ativo: true, perfilAlimentar: 'as_vezes' }),
      nunca: await User.countDocuments({ ativo: true, perfilAlimentar: 'nunca' }),
      nao_informado: await User.countDocuments({ 
        ativo: true, 
        $or: [
          { perfilAlimentar: 'nao_informado' },
          { perfilAlimentar: { $exists: false } },
          { perfilAlimentar: null }
        ]
      })
    };
    
    perfisAlimentares.que_comem = perfisAlimentares.sempre + perfisAlimentares.as_vezes;
    
    const pesoPorRefeicao = 0.3;
    const previsaoComida = {
      manha: Math.ceil(contagemRefeicoes.manha * pesoPorRefeicao * 1.1),
      almoco: Math.ceil(contagemRefeicoes.almoco * pesoPorRefeicao * 1.15),
      tarde: Math.ceil(contagemRefeicoes.tarde * pesoPorRefeicao * 1.1),
      total: Math.ceil(contagemRefeicoes.total * pesoPorRefeicao * 1.1),
      unidade: 'kg'
    };
    
    const refeicoesPorTurma = {};
    refeicoesHoje.forEach(r => {
      if (!refeicoesPorTurma[r.alunoTurma]) {
        refeicoesPorTurma[r.alunoTurma] = { manha: 0, almoco: 0, tarde: 0, total: 0, alunos: new Set() };
      }
      refeicoesPorTurma[r.alunoTurma][r.tipoRefeicao]++;
      refeicoesPorTurma[r.alunoTurma].total++;
      refeicoesPorTurma[r.alunoTurma].alunos.add(r.alunoId.toString());
    });
    
    const turmasArray = Object.entries(refeicoesPorTurma).map(([nome, dados]) => ({
      turma: nome,
      manha: dados.manha,
      almoco: dados.almoco,
      tarde: dados.tarde,
      total: dados.total,
      alunosQueComeram: dados.alunos.size
    }));
    
    const ultimosRegistros = await Refeicao.find({ data: hoje })
      .sort({ horario: -1 })
      .limit(15);
    
    // ========== 2. DADOS DA GESTÃO GERAL (RODÍZIO) ==========
    
    const rodizios = await RodizioRefeicao.find({ ativo: true }).sort({ turma: 1 });
    const todasTurmas = await User.distinct('turma', { 
      role: 'aluno', 
      ativo: true, 
      turma: { $ne: null, $ne: '' } 
    });
    
    const turmasComRodizio = rodizios.map(r => r.turma);
    const turmasSemRodizio = todasTurmas.filter(t => !turmasComRodizio.includes(t));
    
    const diaSemana = agora.getDay();
    const diaMes = agora.getDate();
    const semanaMes = Math.ceil(diaMes / 7);
    const diasNomes = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    
    const statusRodizioHoje = rodizios.map(rodizio => {
      let podeHoje = false;
      let motivo = '';
      
      if (rodizio.tipoRodizio === 'semanal' || rodizio.tipoRodizio === 'ambos') {
        if (rodizio.diasSemana.includes(diaSemana)) {
          podeHoje = true;
          motivo = `Dia permitido (${diasNomes[diaSemana]})`;
        }
      }
      
      if (!podeHoje && (rodizio.tipoRodizio === 'mensal' || rodizio.tipoRodizio === 'ambos')) {
        if (rodizio.diasMes.includes(diaMes)) {
          podeHoje = true;
          motivo = `Dia ${diaMes} do mês permitido`;
        } else if (rodizio.semanasMes.includes(semanaMes)) {
          podeHoje = true;
          motivo = `${semanaMes}ª semana do mês permitida`;
        }
      }
      
      return {
        turma: rodizio.turma,
        tipo: rodizio.tipoRodizio,
        diasSemana: rodizio.diasSemana.map(d => diasNomes[d]),
        podeHoje,
        motivo: motivo || 'Fora do rodízio hoje',
        horario: `${rodizio.horarioInicio} - ${rodizio.horarioFim}`
      };
    });
    
    // ========== 3. ALERTAS ==========
    const alertas = [];
    
    const percentualAdesao = totalPessoas > 0 ? (contagemRefeicoes.pessoasUnicas / totalPessoas) * 100 : 0;
    if (percentualAdesao < 20 && contagemRefeicoes.total > 0) {
      alertas.push({
        tipo: 'warning',
        titulo: '⚠️ Baixa adesão às refeições',
        mensagem: `Apenas ${percentualAdesao.toFixed(1)}% das pessoas comeram hoje.`,
        sugestao: 'Verificar qualidade da comida ou divulgação'
      });
    }
    
    if (contagemRefeicoes.almoco > 100) {
      alertas.push({
        tipo: 'info',
        titulo: '📈 Alta demanda no almoço',
        mensagem: `${contagemRefeicoes.almoco} pessoas já almoçaram.`,
        sugestao: 'Preparar comida extra se necessário'
      });
    }
    
    if (turmasSemRodizio.length > 0) {
      alertas.push({
        tipo: 'warning',
        titulo: '📋 Turmas sem rodízio configurado',
        mensagem: `${turmasSemRodizio.length} turmas não possuem rodízio de almoço.`,
        sugestao: 'Acessar Gestão Geral para configurar os rodízios'
      });
    }
    
    // ========== 4. RESPOSTA ==========
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      horaAtual,
      cozinha: {
        totalPessoas,
        totalPorTipo,
        contagemRefeicoes,
        perfisAlimentares,
        previsaoComida,
        refeicoesPorTurma: turmasArray,
        ultimosRegistros: ultimosRegistros.map(r => ({
          id: r._id,
          alunoNome: r.alunoNome,
          alunoTurma: r.alunoTurma,
          tipoRefeicao: r.tipoRefeicao,
          horario: r.horario,
          validadoPor: r.validadoPorNome
        }))
      },
      gestaoGeral: {
        totalRodizios: rodizios.length,
        turmasComRodizio: turmasComRodizio.length,
        turmasSemRodizio: turmasSemRodizio.length,
        turmasSemRodizioLista: turmasSemRodizio,
        rodizios: statusRodizioHoje,
        hoje: {
          data: hoje,
          diaSemana: diasNomes[diaSemana],
          diaMes,
          semanaMes
        }
      },
      alertas
    });
    
  } catch (error) {
    console.error('Erro no dashboard:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 📡 EVENTOS SSE (Server-Sent Events) - CORRIGIDO
// ============================================
router.get('/eventos', authenticateToken, verificarAdmin, async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  let ultimoTotal = 0;
  
  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  
  // Enviar heartbeat inicial
  sendEvent({ type: 'heartbeat', timestamp: new Date().toISOString() });
  
  const heartbeat = setInterval(() => {
    sendEvent({ type: 'heartbeat', timestamp: new Date().toISOString() });
  }, 30000);
  
  const checkInterval = setInterval(async () => {
    try {
      const hoje = new Date().toISOString().split('T')[0];
      const novoTotal = await Refeicao.countDocuments({ data: hoje });
      
      if (novoTotal !== ultimoTotal) {
        ultimoTotal = novoTotal;
        
        // Buscar também total do almoço para enviar
        const almocoTotal = await Refeicao.countDocuments({ 
          data: hoje, 
          tipoRefeicao: 'almoco' 
        });
        
        sendEvent({
          type: 'nova-refeicao',
          total: novoTotal,
          almoco: almocoTotal,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Erro no intervalo SSE:', error);
    }
  }, 5000);
  
  req.on('close', () => {
    clearInterval(checkInterval);
    clearInterval(heartbeat);
  });
});

module.exports = router;