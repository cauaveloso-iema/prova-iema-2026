const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const AtendimentoEnfermaria = require('../models/AtendimentoEnfermaria');
const User = require('../models/User');

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
// 📊 DASHBOARD - ESTATÍSTICAS DA ENFERMARIA
// ============================================
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
      
      // Atendimentos em andamento
      const emAndamento = await AtendimentoEnfermaria.countDocuments({ status: 'em_atendimento' });
      
      // Finalizados hoje
      const finalizadosHoje = await AtendimentoEnfermaria.countDocuments({
        'saida.dataHora': {
          $gte: new Date(hojeStr),
          $lt: new Date(new Date(hojeStr).setDate(new Date(hojeStr).getDate() + 1))
        }
      });
      
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
          emAndamento: emAndamento,
          finalizadosHoje: finalizadosHoje,
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
// ✏️ ATUALIZAR ATENDIMENTO
// ============================================
router.put('/atendimento/:id',
  authenticateToken,
  verificarEnfermaria,
  async (req, res) => {
    try {
      const { queixa, observacoesEntrada, dataEntrada, status, saida } = req.body;
      
      const atendimento = await AtendimentoEnfermaria.findById(req.params.id);
      
      if (!atendimento) {
        return res.status(404).json({
          success: false,
          error: 'Atendimento não encontrado'
        });
      }
      
      // Atualizar dados da entrada
      if (queixa) atendimento.entrada.queixa = queixa;
      if (observacoesEntrada !== undefined) atendimento.entrada.observacoes = observacoesEntrada;
      if (dataEntrada) atendimento.entrada.dataHora = new Date(dataEntrada);
      
      // Atualizar status
      if (status) {
        atendimento.status = status;
        
        // Se foi finalizado e tem dados de saída
        if (status === 'finalizado' && saida) {
          atendimento.saida = {
            dataHora: saida.dataHora ? new Date(saida.dataHora) : new Date(),
            desfecho: saida.desfecho,
            desfechoOutrosTexto: saida.desfechoOutrosTexto,
            coordenadorPatioNome: saida.coordenadorPatioNome,
            observacoes: saida.observacoes,
            registradoPor: req.userId,
            registradoPorNome: req.userNome
          };
        } else if (status === 'em_atendimento') {
          // Se voltou para em atendimento, remover dados de saída
          atendimento.saida = undefined;
        }
      }
      
      atendimento.updatedAt = new Date();
      await atendimento.save();
      
      res.json({
        success: true,
        message: 'Atendimento atualizado com sucesso',
        atendimento
      });
      
    } catch (error) {
      console.error('Erro ao atualizar atendimento:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao atualizar atendimento: ' + error.message
      });
    }
  }
);

// ============================================
// 📋 LISTAR ATENDIMENTOS (COM FILTROS)
// ============================================
router.get('/atendimentos',
  authenticateToken,
  verificarEnfermaria,
  async (req, res) => {
    try {
      const { status, tipo, turma, dataInicio, dataFim, search, page = 1, limit = 20 } = req.query;
      
      let query = {};
      
      // Filtro por status
      if (status && status !== 'todos') {
        query.status = status;
      }
      
      // Filtro por tipo de desfecho
      if (tipo && tipo !== 'todos') {
        query['saida.desfecho'] = tipo;
      }
      
      // Filtro por turma
      if (turma && turma !== 'todas') {
        query.alunoTurma = turma;
      }
      
      // Filtro por período
      if (dataInicio || dataFim) {
        query['entrada.dataHora'] = {};
        if (dataInicio) query['entrada.dataHora'].$gte = new Date(dataInicio);
        if (dataFim) query['entrada.dataHora'].$lte = new Date(dataFim + 'T23:59:59');
      }
      
      // Filtro por busca (nome do aluno)
      if (search && search.trim() !== '') {
        query.alunoNome = { $regex: search, $options: 'i' };
      }
      
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      const [atendimentos, total] = await Promise.all([
        AtendimentoEnfermaria.find(query)
          .sort({ 'entrada.dataHora': -1 })
          .skip(skip)
          .limit(parseInt(limit)),
        AtendimentoEnfermaria.countDocuments(query)
      ]);
      
      // Turmas disponíveis para filtro
      const turmas = await AtendimentoEnfermaria.distinct('alunoTurma');
      
      res.json({
        success: true,
        atendimentos: atendimentos.map(a => ({
          id: a._id,
          alunoId: a.alunoId,
          alunoNome: a.alunoNome,
          alunoMatricula: a.alunoMatricula,
          alunoTurma: a.alunoTurma,
          alunoFoto: a.alunoFoto,
          queixa: a.entrada.queixa,
          observacoesEntrada: a.entrada.observacoes,
          dataEntrada: a.entrada.dataHora,
          registradoPor: a.entrada.registradoPorNome,
          status: a.status,
          saida: a.saida ? {
            dataHora: a.saida.dataHora,
            desfecho: a.saida.desfecho,
            desfechoTexto: {
              'retornou_sala': 'Retornou para Sala de Aula',
              'encaminhado_gestao': 'Encaminhado para Gestão Geral',
              'liberado_responsavel': 'Liberado com o Responsável',
              'liberado_coordenador': `Liberado com Coordenador${a.saida.coordenadorPatioNome ? ` (${a.saida.coordenadorPatioNome})` : ''}`,
              'outros': `Outros: ${a.saida.desfechoOutrosTexto}`
            }[a.saida.desfecho],
            observacoes: a.saida.observacoes,
            registradoPor: a.saida.registradoPorNome
          } : null,
          tempoAtendimento: a.status === 'finalizado' && a.saida?.dataHora 
            ? Math.round((new Date(a.saida.dataHora) - new Date(a.entrada.dataHora)) / 60000)
            : null
        })),
        paginacao: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit))
        },
        turmasDisponiveis: turmas.filter(t => t && t !== 'Não informada')
      });
      
    } catch (error) {
      console.error('Erro ao listar atendimentos:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao listar atendimentos: ' + error.message
      });
    }
  }
);

// ============================================
// 🔍 BUSCAR ATENDIMENTO POR ID
// ============================================
router.get('/atendimento/:id',
  authenticateToken,
  verificarEnfermaria,
  async (req, res) => {
    try {
      const atendimento = await AtendimentoEnfermaria.findById(req.params.id);
      
      if (!atendimento) {
        return res.status(404).json({
          success: false,
          error: 'Atendimento não encontrado'
        });
      }
      
      res.json({
        success: true,
        atendimento: {
          id: atendimento._id,
          alunoId: atendimento.alunoId,
          alunoNome: atendimento.alunoNome,
          alunoMatricula: atendimento.alunoMatricula,
          alunoTurma: atendimento.alunoTurma,
          alunoCurso: atendimento.alunoCurso,
          alunoFoto: atendimento.alunoFoto,
          entrada: {
            dataHora: atendimento.entrada.dataHora,
            queixa: atendimento.entrada.queixa,
            observacoes: atendimento.entrada.observacoes,
            registradoPor: atendimento.entrada.registradoPorNome,
            registradoPorId: atendimento.entrada.registradoPor
          },
          saida: atendimento.saida ? {
            dataHora: atendimento.saida.dataHora,
            desfecho: atendimento.saida.desfecho,
            desfechoOutrosTexto: atendimento.saida.desfechoOutrosTexto,
            coordenadorPatioNome: atendimento.saida.coordenadorPatioNome,
            observacoes: atendimento.saida.observacoes,
            registradoPor: atendimento.saida.registradoPorNome
          } : null,
          status: atendimento.status,
          createdAt: atendimento.createdAt,
          updatedAt: atendimento.updatedAt
        }
      });
      
    } catch (error) {
      console.error('Erro ao buscar atendimento:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao buscar atendimento: ' + error.message
      });
    }
  }
);

// ============================================
// 📊 RELATÓRIO POR ALUNO
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
      
      const aluno = await User.findById(alunoId).select('nome matricula turma curso');
      
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
      
      res.json({
        success: true,
        aluno: {
          id: aluno._id,
          nome: aluno.nome,
          matricula: aluno.matricula,
          turma: aluno.turma,
          curso: aluno.curso
        },
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
          observacoesSaida: a.saida?.observacoes || ''
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

// ============================================
// 🗑️ EXCLUIR ATENDIMENTO
// ============================================
router.delete('/atendimento/:id',
  authenticateToken,
  verificarEnfermaria,
  async (req, res) => {
    try {
      const atendimento = await AtendimentoEnfermaria.findById(req.params.id);
      
      if (!atendimento) {
        return res.status(404).json({
          success: false,
          error: 'Atendimento não encontrado'
        });
      }
      
      await atendimento.deleteOne();
      
      res.json({
        success: true,
        message: 'Atendimento excluído com sucesso'
      });
      
    } catch (error) {
      console.error('Erro ao excluir atendimento:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao excluir atendimento: ' + error.message
      });
    }
  }
);

// ============================================
// 📈 ESTATÍSTICAS DETALHADAS
// ============================================
router.get('/estatisticas',
  authenticateToken,
  verificarEnfermaria,
  async (req, res) => {
    try {
      const totalAtendimentos = await AtendimentoEnfermaria.countDocuments();
      const emAndamento = await AtendimentoEnfermaria.countDocuments({ status: 'em_atendimento' });
      const finalizados = await AtendimentoEnfermaria.countDocuments({ status: 'finalizado' });
      
      const desfechos = await AtendimentoEnfermaria.aggregate([
        { $match: { 'saida.desfecho': { $exists: true } } },
        { $group: { _id: '$saida.desfecho', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]);
      
      const turmas = await AtendimentoEnfermaria.aggregate([
        { $group: { _id: '$alunoTurma', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]);
      
      res.json({
        success: true,
        estatisticas: {
          total: totalAtendimentos,
          emAndamento,
          finalizados,
          desfechos,
          turmas
        }
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

module.exports = router;