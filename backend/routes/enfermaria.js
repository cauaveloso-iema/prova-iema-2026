const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AtendimentoEnfermaria = require('../models/AtendimentoEnfermaria');

// Middleware de autenticação
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

// Middleware específico para enfermaria
const verificarEnfermaria = (req, res, next) => {
  const allowedRoles = ['enfermaria', 'super_admin', 'admin'];
  
  if (!allowedRoles.includes(req.userRole)) {
    return res.status(403).json({
      success: false,
      error: 'Acesso permitido apenas para Enfermaria'
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
    service: 'Enfermaria',
    timestamp: new Date().toISOString()
  });
});

// ============================================
// 📋 BUSCAR DADOS DO ALUNO POR QR CODE
// ============================================
router.get('/aluno/:id', 
  authenticateToken, 
  verificarEnfermaria, 
  async (req, res) => {
    try {
      const alunoId = req.params.id;
      
      const aluno = await User.findOne({ 
        _id: alunoId, 
        ativo: true 
      }).select('nome email matricula curso turma fotoPerfil role');
      
      if (!aluno) {
        return res.status(404).json({
          success: false,
          error: 'Aluno não encontrado'
        });
      }
      
      if (aluno.role !== 'aluno') {
        return res.status(400).json({
          success: false,
          error: 'Usuário não é um aluno'
        });
      }
      
      const emAtendimento = await AtendimentoEnfermaria.alunoEmAtendimento(alunoId);
      const atendimentoAtivo = emAtendimento ? await AtendimentoEnfermaria.getAtendimentoAtivo(alunoId) : null;
      
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
        emAtendimento,
        atendimentoAtivo: atendimentoAtivo ? {
          id: atendimentoAtivo._id,
          queixa: atendimentoAtivo.entrada.queixa,
          dataHoraEntrada: atendimentoAtivo.entrada.dataHora,
          status: atendimentoAtivo.status
        } : null
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
// 📝 REGISTRAR ENTRADA (QUEIXA)
// ============================================
router.post('/entrada',
  authenticateToken,
  verificarEnfermaria,
  async (req, res) => {
    try {
      const { alunoId, queixa, observacoes } = req.body;
      
      if (!queixa || queixa.trim() === '') {
        return res.status(400).json({
          success: false,
          error: 'A queixa é obrigatória'
        });
      }
      
      const aluno = await User.findById(alunoId);
      if (!aluno || aluno.role !== 'aluno') {
        return res.status(404).json({
          success: false,
          error: 'Aluno não encontrado'
        });
      }
      
      const emAtendimento = await AtendimentoEnfermaria.alunoEmAtendimento(alunoId);
      if (emAtendimento) {
        return res.status(400).json({
          success: false,
          error: 'Aluno já está em atendimento. Finalize o atendimento atual primeiro.'
        });
      }
      
      const enfermeiro = await User.findById(req.userId).select('nome');
      
      const atendimento = new AtendimentoEnfermaria({
        alunoId: aluno._id,
        alunoNome: aluno.nome,
        alunoMatricula: aluno.matricula,
        alunoTurma: aluno.turma || 'Não informada',
        alunoCurso: aluno.curso || 'Não informado',
        alunoFoto: aluno.fotoPerfil,
        entrada: {
          dataHora: new Date(),
          queixa: queixa.trim(),
          observacoes: observacoes || '',
          registradoPor: req.userId,
          registradoPorNome: enfermeiro?.nome || req.userNome || 'Enfermeiro'
        },
        status: 'em_atendimento'
      });
      
      await atendimento.save();
      
      res.json({
        success: true,
        message: `Atendimento registrado para ${aluno.nome}`,
        atendimento: {
          id: atendimento._id,
          status: atendimento.status,
          queixa: atendimento.entrada.queixa,
          dataHora: atendimento.entrada.dataHora
        }
      });
      
    } catch (error) {
      console.error('Erro ao registrar entrada:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao registrar atendimento: ' + error.message
      });
    }
  }
);

// ============================================
// 📤 REGISTRAR SAÍDA (DESFECHO)
// ============================================
router.post('/saida',
  authenticateToken,
  verificarEnfermaria,
  async (req, res) => {
    try {
      const { alunoId, desfecho, desfechoOutrosTexto, coordenadorPatioNome, observacoes } = req.body;
      
      const desfechosValidos = ['retornou_sala', 'encaminhado_gestao', 'liberado_responsavel', 'liberado_coordenador', 'outros'];
      if (!desfechosValidos.includes(desfecho)) {
        return res.status(400).json({
          success: false,
          error: 'Desfecho inválido'
        });
      }
      
      if (desfecho === 'outros' && (!desfechoOutrosTexto || desfechoOutrosTexto.trim() === '')) {
        return res.status(400).json({
          success: false,
          error: 'Por favor, descreva o desfecho no campo "outros"'
        });
      }
      
      const atendimento = await AtendimentoEnfermaria.findOne({
        alunoId,
        status: 'em_atendimento'
      });
      
      if (!atendimento) {
        return res.status(404).json({
          success: false,
          error: 'Nenhum atendimento ativo encontrado para este aluno. Registre a entrada primeiro.'
        });
      }
      
      const enfermeiro = await User.findById(req.userId).select('nome');
      
      atendimento.saida = {
        dataHora: new Date(),
        desfecho,
        desfechoOutrosTexto: desfecho === 'outros' ? desfechoOutrosTexto : undefined,
        coordenadorPatioNome: desfecho === 'liberado_coordenador' ? coordenadorPatioNome : undefined,
        observacoes: observacoes || '',
        registradoPor: req.userId,
        registradoPorNome: enfermeiro?.nome || req.userNome || 'Enfermeiro'
      };
      atendimento.status = 'finalizado';
      atendimento.updatedAt = new Date();
      
      await atendimento.save();
      
      const desfechoTexto = {
        'retornou_sala': 'Retornou para Sala de Aula',
        'encaminhado_gestao': 'Encaminhado para Gestão Geral',
        'liberado_responsavel': 'Liberado com o Responsável',
        'liberado_coordenador': `Liberado com o Coordenador de Pátio${coordenadorPatioNome ? ` (${coordenadorPatioNome})` : ''}`,
        'outros': `Outros: ${desfechoOutrosTexto}`
      }[desfecho];
      
      res.json({
        success: true,
        message: `Atendimento finalizado para ${atendimento.alunoNome}. Desfecho: ${desfechoTexto}`,
        atendimento: {
          id: atendimento._id,
          status: atendimento.status,
          desfecho: desfechoTexto,
          dataHoraSaida: atendimento.saida.dataHora
        }
      });
      
    } catch (error) {
      console.error('Erro ao registrar saída:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao registrar saída: ' + error.message
      });
    }
  }
);

// ============================================
// 📊 DASHBOARD - ESTATÍSTICAS
// ============================================

// Dashboard principal
router.get('/dashboard',
  authenticateToken,
  verificarEnfermaria,
  async (req, res) => {
    try {
      const hoje = new Date();
      const hojeStr = hoje.toISOString().split('T')[0];
      const inicioSemana = new Date(hoje);
      inicioSemana.setDate(hoje.getDate() - hoje.getDay());
      const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      
      // Atendimentos de hoje
      const atendimentosHoje = await AtendimentoEnfermaria.countDocuments({
        'entrada.dataHora': {
          $gte: new Date(hojeStr),
          $lt: new Date(new Date(hojeStr).setDate(new Date(hojeStr).getDate() + 1))
        }
      });
      
      // Atendimentos da semana
      const atendimentosSemana = await AtendimentoEnfermaria.countDocuments({
        'entrada.dataHora': { $gte: inicioSemana }
      });
      
      // Atendimentos do mês
      const atendimentosMes = await AtendimentoEnfermaria.countDocuments({
        'entrada.dataHora': { $gte: inicioMes }
      });
      
      // Total de atendimentos
      const totalAtendimentos = await AtendimentoEnfermaria.countDocuments();
      
      // Desfechos (últimos 30 dias)
      const ultimos30Dias = new Date();
      ultimos30Dias.setDate(ultimos30Dias.getDate() - 30);
      
      const desfechos = await AtendimentoEnfermaria.aggregate([
        { $match: { 'saida.desfecho': { $exists: true }, 'entrada.dataHora': { $gte: ultimos30Dias } } },
        { $group: { _id: '$saida.desfecho', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]);
      
      // Atendimentos por dia (últimos 7 dias)
      const ultimos7Dias = [];
      for (let i = 6; i >= 0; i--) {
        const data = new Date();
        data.setDate(data.getDate() - i);
        const dataStr = data.toISOString().split('T')[0];
        const inicio = new Date(dataStr);
        const fim = new Date(dataStr);
        fim.setDate(fim.getDate() + 1);
        
        const count = await AtendimentoEnfermaria.countDocuments({
          'entrada.dataHora': { $gte: inicio, $lt: fim }
        });
        
        ultimos7Dias.push({
          data: dataStr,
          dia: data.toLocaleDateString('pt-BR', { weekday: 'short' }),
          atendimentos: count
        });
      }
      
      // Atendimentos por turma (últimos 30 dias)
      const porTurma = await AtendimentoEnfermaria.aggregate([
        { $match: { 'entrada.dataHora': { $gte: ultimos30Dias } } },
        { $group: { _id: '$alunoTurma', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ]);
      
      // Queixas mais comuns
      const queixas = await AtendimentoEnfermaria.aggregate([
        { $match: { 'entrada.dataHora': { $gte: ultimos30Dias } } },
        { $group: { _id: '$entrada.queixa', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ]);
      
      // Atendimentos por hora do dia
      const porHora = await AtendimentoEnfermaria.aggregate([
        { $match: { 'entrada.dataHora': { $gte: ultimos30Dias } } },
        { $group: { _id: { $hour: '$entrada.dataHora' }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]);
      
      const horasDistribuicao = Array(24).fill(0);
      porHora.forEach(h => { horasDistribuicao[h._id] = h.count; });
      
      // Média de tempo de atendimento (minutos)
      const tempoMedio = await AtendimentoEnfermaria.aggregate([
        { $match: { 'saida.dataHora': { $exists: true } } },
        { $project: { tempo: { $subtract: ['$saida.dataHora', '$entrada.dataHora'] } } },
        { $group: { _id: null, media: { $avg: '$tempo' } } }
      ]);
      
      const mediaMinutos = tempoMedio.length > 0 ? Math.round(tempoMedio[0].media / 60000) : 0;
      
      res.json({
        success: true,
        periodo: {
          hoje: hojeStr,
          inicioSemana: inicioSemana.toISOString().split('T')[0],
          inicioMes: inicioMes.toISOString().split('T')[0]
        },
        metricas: {
          hoje: atendimentosHoje,
          semana: atendimentosSemana,
          mes: atendimentosMes,
          total: totalAtendimentos,
          tempoMedioMinutos: mediaMinutos
        },
        desfechos: desfechos.map(d => ({
          tipo: d._id,
          label: {
            'retornou_sala': 'Retornou à Sala',
            'encaminhado_gestao': 'Encaminhado à Gestão',
            'liberado_responsavel': 'Liberado com Responsável',
            'liberado_coordenador': 'Liberado com Coordenador',
            'outros': 'Outros'
          }[d._id] || d._id,
          count: d.count
        })),
        tendencias: {
          ultimos7Dias,
          porTurma: porTurma.map(t => ({ turma: t._id || 'Sem turma', count: t.count })),
          queixasComuns: queixas.map(q => ({ queixa: q._id.substring(0, 50), count: q.count })),
          distribuicaoHoraria: horasDistribuicao
        }
      });
      
    } catch (error) {
      console.error('Erro ao buscar dashboard:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao buscar estatísticas: ' + error.message
      });
    }
  }
);

// ============================================
// 📊 RELATÓRIOS
// ============================================

router.get('/relatorio/aluno/:alunoId',
  authenticateToken,
  verificarEnfermaria,
  async (req, res) => {
    try {
      const { alunoId } = req.params;
      const { dataInicio, dataFim } = req.query;
      
      let query = { alunoId };
      
      if (dataInicio || dataFim) {
        query['entrada.dataHora'] = {};
        if (dataInicio) query['entrada.dataHora'].$gte = new Date(dataInicio);
        if (dataFim) query['entrada.dataHora'].$lte = new Date(dataFim + 'T23:59:59');
      }
      
      const atendimentos = await AtendimentoEnfermaria.find(query)
        .sort({ 'entrada.dataHora': -1 });
      
      const totalAtendimentos = atendimentos.length;
      const desfechosCount = {};
      const queixasComuns = {};
      
      atendimentos.forEach(a => {
        const desfecho = a.saida?.desfecho || 'em_andamento';
        desfechosCount[desfecho] = (desfechosCount[desfecho] || 0) + 1;
        
        const palavras = a.entrada.queixa.toLowerCase().split(/\s+/);
        palavras.forEach(p => {
          if (p.length > 3) {
            queixasComuns[p] = (queixasComuns[p] || 0) + 1;
          }
        });
      });
      
      const aluno = await User.findById(alunoId).select('nome matricula turma curso');
      
      res.json({
        success: true,
        aluno: {
          id: aluno._id,
          nome: aluno.nome,
          matricula: aluno.matricula,
          turma: aluno.turma,
          curso: aluno.curso
        },
        periodo: { dataInicio, dataFim },
        estatisticas: {
          totalAtendimentos,
          desfechos: desfechosCount,
          principaisQueixas: Object.entries(queixasComuns)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([palavra, count]) => ({ palavra, count }))
        },
        atendimentos: atendimentos.map(a => ({
          id: a._id,
          dataEntrada: a.entrada.dataHora,
          queixa: a.entrada.queixa,
          observacoesEntrada: a.entrada.observacoes,
          registradoPor: a.entrada.registradoPorNome,
          dataSaida: a.saida?.dataHora || null,
          desfecho: a.saida?.desfecho || 'em_atendimento',
          desfechoTexto: a.saida?.desfecho ? {
            'retornou_sala': 'Retornou para Sala de Aula',
            'encaminhado_gestao': 'Encaminhado para Gestão Geral',
            'liberado_responsavel': 'Liberado com o Responsável',
            'liberado_coordenador': `Liberado com Coordenador${a.saida?.coordenadorPatioNome ? ` (${a.saida.coordenadorPatioNome})` : ''}`,
            'outros': `Outros: ${a.saida?.desfechoOutrosTexto}`
          }[a.saida.desfecho] : 'Em atendimento',
          observacoesSaida: a.saida?.observacoes || '',
          registradoPorSaida: a.saida?.registradoPorNome || null
        }))
      });
      
    } catch (error) {
      console.error('Erro ao gerar relatório do aluno:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao gerar relatório: ' + error.message
      });
    }
  }
);

router.get('/relatorio/turma/:turma',
  authenticateToken,
  verificarEnfermaria,
  async (req, res) => {
    try {
      const { turma } = req.params;
      const { dataInicio, dataFim } = req.query;
      
      let query = { alunoTurma: turma };
      
      if (dataInicio || dataFim) {
        query['entrada.dataHora'] = {};
        if (dataInicio) query['entrada.dataHora'].$gte = new Date(dataInicio);
        if (dataFim) query['entrada.dataHora'].$lte = new Date(dataFim + 'T23:59:59');
      }
      
      const atendimentos = await AtendimentoEnfermaria.find(query)
        .sort({ 'entrada.dataHora': -1 });
      
      const porAluno = {};
      atendimentos.forEach(a => {
        if (!porAluno[a.alunoId]) {
          porAluno[a.alunoId] = {
            alunoId: a.alunoId,
            alunoNome: a.alunoNome,
            alunoMatricula: a.alunoMatricula,
            total: 0,
            desfechos: {}
          };
        }
        porAluno[a.alunoId].total++;
        const desfecho = a.saida?.desfecho || 'em_andamento';
        porAluno[a.alunoId].desfechos[desfecho] = (porAluno[a.alunoId].desfechos[desfecho] || 0) + 1;
      });
      
      const desfechosCount = {};
      atendimentos.forEach(a => {
        const desfecho = a.saida?.desfecho || 'em_andamento';
        desfechosCount[desfecho] = (desfechosCount[desfecho] || 0) + 1;
      });
      
      const frequenciaSemanal = {};
      const frequenciaMensal = {};
      
      atendimentos.forEach(a => {
        const data = new Date(a.entrada.dataHora);
        const semana = `${data.getFullYear()}-W${Math.ceil(data.getDate() / 7)}`;
        const mes = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
        
        frequenciaSemanal[semana] = (frequenciaSemanal[semana] || 0) + 1;
        frequenciaMensal[mes] = (frequenciaMensal[mes] || 0) + 1;
      });
      
      res.json({
        success: true,
        turma,
        periodo: { dataInicio, dataFim },
        estatisticas: {
          totalAtendimentos: atendimentos.length,
          totalAlunosAtendidos: Object.keys(porAluno).length,
          desfechos: desfechosCount,
          frequenciaSemanal,
          frequenciaMensal
        },
        porAluno: Object.values(porAluno).sort((a, b) => b.total - a.total),
        ultimosAtendimentos: atendimentos.slice(0, 50).map(a => ({
          id: a._id,
          alunoNome: a.alunoNome,
          dataEntrada: a.entrada.dataHora,
          queixa: a.entrada.queixa,
          desfecho: a.saida?.desfecho || 'em_atendimento'
        }))
      });
      
    } catch (error) {
      console.error('Erro ao gerar relatório da turma:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao gerar relatório: ' + error.message
      });
    }
  }
);

router.get('/relatorio/geral',
  authenticateToken,
  verificarEnfermaria,
  async (req, res) => {
    try {
      const { dataInicio, dataFim, turma } = req.query;
      
      let query = {};
      
      if (dataInicio || dataFim) {
        query['entrada.dataHora'] = {};
        if (dataInicio) query['entrada.dataHora'].$gte = new Date(dataInicio);
        if (dataFim) query['entrada.dataHora'].$lte = new Date(dataFim + 'T23:59:59');
      }
      
      if (turma) {
        query.alunoTurma = turma;
      }
      
      const atendimentos = await AtendimentoEnfermaria.find(query)
        .sort({ 'entrada.dataHora': -1 });
      
      const porTurma = {};
      atendimentos.forEach(a => {
        if (!porTurma[a.alunoTurma]) {
          porTurma[a.alunoTurma] = {
            turma: a.alunoTurma,
            total: 0,
            alunos: new Set(),
            desfechos: {}
          };
        }
        porTurma[a.alunoTurma].total++;
        porTurma[a.alunoTurma].alunos.add(a.alunoId.toString());
        const desfecho = a.saida?.desfecho || 'em_andamento';
        porTurma[a.alunoTurma].desfechos[desfecho] = (porTurma[a.alunoTurma].desfechos[desfecho] || 0) + 1;
      });
      
      Object.values(porTurma).forEach(t => {
        t.totalAlunos = t.alunos.size;
        delete t.alunos;
      });
      
      const turmas = await AtendimentoEnfermaria.distinct('alunoTurma');
      
      res.json({
        success: true,
        filtros: { dataInicio, dataFim, turma },
        turmasDisponiveis: turmas.filter(t => t && t !== 'Não informada'),
        totalAtendimentos: atendimentos.length,
        porTurma: Object.values(porTurma).sort((a, b) => b.total - a.total),
        ultimosAtendimentos: atendimentos.slice(0, 30).map(a => ({
          id: a._id,
          alunoNome: a.alunoNome,
          alunoTurma: a.alunoTurma,
          dataEntrada: a.entrada.dataHora,
          queixa: a.entrada.queixa.substring(0, 50),
          status: a.status
        }))
      });
      
    } catch (error) {
      console.error('Erro ao gerar relatório geral:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao gerar relatório: ' + error.message
      });
    }
  }
);

// ============================================
// 📋 LISTAR ATENDIMENTOS ATIVOS
// ============================================
router.get('/atendimentos-ativos',
  authenticateToken,
  verificarEnfermaria,
  async (req, res) => {
    try {
      const atendimentos = await AtendimentoEnfermaria.find({ status: 'em_atendimento' })
        .sort({ 'entrada.dataHora': -1 });
      
      res.json({
        success: true,
        total: atendimentos.length,
        atendimentos: atendimentos.map(a => ({
          id: a._id,
          alunoId: a.alunoId,
          alunoNome: a.alunoNome,
          alunoTurma: a.alunoTurma,
          alunoFoto: a.alunoFoto,
          queixa: a.entrada.queixa,
          dataHoraEntrada: a.entrada.dataHora,
          tempoAtendimento: Math.floor((new Date() - new Date(a.entrada.dataHora)) / 60000)
        }))
      });
      
    } catch (error) {
      console.error('Erro ao buscar atendimentos ativos:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao buscar atendimentos: ' + error.message
      });
    }
  }
);

module.exports = router;