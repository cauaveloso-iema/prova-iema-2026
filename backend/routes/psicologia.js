const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AtendimentoPsicologia = require('../models/AtendimentoPsicologia');

// Middleware de autenticação
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, error: 'Token não fornecido.' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ success: false, error: 'Token inválido.' });
    }
    req.userId = decoded.id;
    req.userRole = decoded.role;
    req.userNome = decoded.nome;
    next();
  });
};

const verificarPsicologia = (req, res, next) => {
  const allowedRoles = ['psicologia', 'super_admin', 'admin'];
  if (!allowedRoles.includes(req.userRole)) {
    return res.status(403).json({
      success: false,
      error: 'Acesso permitido apenas para Psicologia'
    });
  }
  next();
};

// ============================================
// HEALTH CHECK
// ============================================
router.get('/health', (req, res) => {
  res.json({ success: true, status: 'online', service: 'Psicologia' });
});

// ============================================
// LISTAR TURMAS DISPONÍVEIS
// ============================================
router.get('/turmas', authenticateToken, verificarPsicologia, async (req, res) => {
  try {
    const turmas = await User.distinct('turma', { 
      role: 'aluno', 
      ativo: true, 
      turma: { $nin: [null, '', 'Não informada'] } 
    });
    
    res.json({ success: true, turmas: turmas.sort() });
  } catch (error) {
    console.error('Erro ao listar turmas:', error);
    res.status(500).json({ success: false, error: 'Erro ao listar turmas: ' + error.message });
  }
});

// ============================================
// LISTAR ALUNOS POR TURMA
// ============================================
router.get('/alunos-por-turma', authenticateToken, verificarPsicologia, async (req, res) => {
  try {
    const { turma } = req.query;
    if (!turma) return res.status(400).json({ success: false, error: 'Turma é obrigatória' });
    
    const alunos = await User.find({ 
      role: 'aluno', 
      ativo: true, 
      turma 
    })
    .select('nome matricula turma curso fotoPerfil')
    .sort({ nome: 1 });
    
    res.json({
      success: true,
      total: alunos.length,
      alunos: alunos.map(a => ({
        id: a._id,
        nome: a.nome,
        matricula: a.matricula,
        turma: a.turma,
        curso: a.curso,
        fotoPerfil: a.fotoPerfil
      }))
    });
  } catch (error) {
    console.error('Erro ao listar alunos por turma:', error);
    res.status(500).json({ success: false, error: 'Erro ao listar alunos: ' + error.message });
  }
});

// ============================================
// BUSCAR ALUNO POR ID (QR CODE)
// ============================================
router.get('/aluno/:id', authenticateToken, verificarPsicologia, async (req, res) => {
  try {
    const aluno = await User.findOne({ 
      _id: req.params.id, 
      ativo: true 
    }).select('nome email matricula curso turma fotoPerfil role');
    
    if (!aluno) {
      return res.status(404).json({ success: false, error: 'Aluno não encontrado' });
    }
    
    if (aluno.role !== 'aluno') {
      return res.status(400).json({ success: false, error: 'Usuário não é um aluno' });
    }
    
    const atendimentosAtivos = await AtendimentoPsicologia.find({
      alunoId: aluno._id,
      status: 'em_andamento'
    }).sort({ createdAt: -1 });
    
    const historicoRecente = await AtendimentoPsicologia.find({
      alunoId: aluno._id,
      status: 'finalizado'
    }).sort({ createdAt: -1 }).limit(5);
    
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
      atendimentosAtivos: atendimentosAtivos.map(a => ({
        id: a._id,
        tipoTarefa: a.tipoTarefa,
        tipoTarefaLabel: AtendimentoPsicologia.getTipoTarefaLabel(a.tipoTarefa),
        descricao: a.entrada.descricao,
        dataHoraEntrada: a.entrada.dataHora,
        prioridade: a.prioridade
      })),
      historicoRecente: historicoRecente.map(a => ({
        id: a._id,
        tipoTarefa: a.tipoTarefa,
        tipoTarefaLabel: AtendimentoPsicologia.getTipoTarefaLabel(a.tipoTarefa),
        descricao: a.entrada.descricao,
        dataHora: a.entrada.dataHora,
        resultado: a.saida?.resultado
      }))
    });
    
  } catch (error) {
    console.error('Erro ao buscar aluno:', error);
    res.status(500).json({ success: false, error: 'Erro ao buscar aluno: ' + error.message });
  }
});

// ============================================
// BUSCAR ALUNO POR NOME/MATRÍCULA
// ============================================
router.get('/buscar-aluno', authenticateToken, verificarPsicologia, async (req, res) => {
  try {
    const { termo } = req.query;
    
    if (!termo || termo.length < 2) {
      return res.status(400).json({ success: false, error: 'Digite pelo menos 2 caracteres' });
    }
    
    const alunos = await User.find({
      role: 'aluno',
      ativo: true,
      $or: [
        { nome: { $regex: termo, $options: 'i' } },
        { matricula: { $regex: termo, $options: 'i' } }
      ]
    })
    .select('nome matricula turma curso fotoPerfil')
    .limit(20)
    .sort({ nome: 1 });
    
    res.json({
      success: true,
      total: alunos.length,
      alunos: alunos.map(a => ({
        id: a._id,
        nome: a.nome,
        matricula: a.matricula,
        turma: a.turma,
        curso: a.curso,
        fotoPerfil: a.fotoPerfil
      }))
    });
    
  } catch (error) {
    console.error('Erro na busca:', error);
    res.status(500).json({ success: false, error: 'Erro na busca: ' + error.message });
  }
});

// ============================================
// REGISTRAR NOVO ATENDIMENTO
// ============================================
router.post('/registrar', authenticateToken, verificarPsicologia, async (req, res) => {
  try {
    const { alunoId, tipoTarefa, descricao, observacoes, gravidade, prioridade, detalhes } = req.body;
    
    if (!descricao || descricao.trim() === '') {
      return res.status(400).json({ success: false, error: 'A descrição é obrigatória' });
    }
    
    const tiposValidos = [
        'escuta_acolhimento',
        'manejo_crises_emocionais',
        'atividades_grupos',
        'acoes_atividades_saude',
        'acoes_socioemocionais_culturais',
        'outros'
    ];
    
    if (!tiposValidos.includes(tipoTarefa)) {
      return res.status(400).json({ success: false, error: 'Tipo de tarefa inválido' });
    }
    
    const aluno = await User.findById(alunoId);
    if (!aluno || aluno.role !== 'aluno') {
      return res.status(404).json({ success: false, error: 'Aluno não encontrado' });
    }
    
    const psicologo = await User.findById(req.userId).select('nome');
    
    const atendimento = new AtendimentoPsicologia({
      alunoId: aluno._id,
      alunoNome: aluno.nome,
      alunoMatricula: aluno.matricula,
      alunoTurma: aluno.turma || 'Não informada',
      alunoCurso: aluno.curso || 'Não informado',
      alunoFoto: aluno.fotoPerfil,
      tipoTarefa,
      entrada: {
        dataHora: new Date(),
        descricao: descricao.trim(),
        observacoes: observacoes || '',
        gravidade: gravidade || 'media',
        registradoPor: req.userId,
        registradoPorNome: psicologo?.nome || req.userNome || 'Psicólogo'
      },
      detalhes: detalhes || {},
      prioridade: prioridade || 'normal',
      status: 'em_andamento'
    });
    
    await atendimento.save();
    
    res.json({
      success: true,
      message: `${AtendimentoPsicologia.getTipoTarefaLabel(tipoTarefa)} registrado para ${aluno.nome}`,
      atendimento: {
        id: atendimento._id,
        tipoTarefa: atendimento.tipoTarefa,
        tipoTarefaLabel: AtendimentoPsicologia.getTipoTarefaLabel(tipoTarefa),
        status: atendimento.status,
        dataHora: atendimento.entrada.dataHora
      }
    });
    
  } catch (error) {
    console.error('Erro ao registrar:', error);
    res.status(500).json({ success: false, error: 'Erro ao registrar: ' + error.message });
  }
});

// ============================================
// FINALIZAR ATENDIMENTO
// ============================================
router.post('/finalizar', authenticateToken, verificarPsicologia, async (req, res) => {
  try {
    const { atendimentoId, resultado, resultadoTexto, observacoesFinais } = req.body;
    
    const resultadosValidos = ['resolvido', 'em_acompanhamento', 'reincidente', 'encaminhado', 'pendente'];
    if (!resultadosValidos.includes(resultado)) {
      return res.status(400).json({ success: false, error: 'Resultado inválido' });
    }
    
    const atendimento = await AtendimentoPsicologia.findById(atendimentoId);
    if (!atendimento) {
      return res.status(404).json({ success: false, error: 'Atendimento não encontrado' });
    }
    
    if (atendimento.status === 'finalizado') {
      return res.status(400).json({ success: false, error: 'Atendimento já finalizado' });
    }
    
    const psicologo = await User.findById(req.userId).select('nome');
    
    atendimento.saida = {
      dataHora: new Date(),
      resultado,
      resultadoTexto: resultadoTexto || '',
      observacoesFinais: observacoesFinais || '',
      registradoPor: req.userId,
      registradoPorNome: psicologo?.nome || req.userNome || 'Psicólogo'
    };
    atendimento.status = 'finalizado';
    atendimento.updatedAt = new Date();
    
    await atendimento.save();
    
    const resultadoLabel = {
      'resolvido': 'Resolvido',
      'em_acompanhamento': 'Em Acompanhamento',
      'reincidente': 'Reincidente',
      'encaminhado': 'Encaminhado',
      'pendente': 'Pendente'
    }[resultado];
    
    res.json({
      success: true,
      message: `Atendimento finalizado. Resultado: ${resultadoLabel}`,
      atendimento: {
        id: atendimento._id,
        status: atendimento.status,
        resultado: resultadoLabel,
        dataHoraSaida: atendimento.saida.dataHora
      }
    });
    
  } catch (error) {
    console.error('Erro ao finalizar:', error);
    res.status(500).json({ success: false, error: 'Erro ao finalizar: ' + error.message });
  }
});

// ============================================
// DASHBOARD
// ============================================
router.get('/dashboard', authenticateToken, verificarPsicologia, async (req, res) => {
  try {
    const hoje = new Date();
    const hojeStr = hoje.toISOString().split('T')[0];
    const inicioSemana = new Date(hoje);
    inicioSemana.setDate(hoje.getDate() - hoje.getDay());
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const ultimos30Dias = new Date();
    ultimos30Dias.setDate(ultimos30Dias.getDate() - 30);
    
    const [atendimentosHoje, atendimentosSemana, atendimentosMes, total] = await Promise.all([
      AtendimentoPsicologia.countDocuments({
        'entrada.dataHora': {
          $gte: new Date(hojeStr),
          $lt: new Date(new Date(hojeStr).setDate(new Date(hojeStr).getDate() + 1))
        }
      }),
      AtendimentoPsicologia.countDocuments({ 'entrada.dataHora': { $gte: inicioSemana } }),
      AtendimentoPsicologia.countDocuments({ 'entrada.dataHora': { $gte: inicioMes } }),
      AtendimentoPsicologia.countDocuments()
    ]);
    
    const emAndamento = await AtendimentoPsicologia.countDocuments({ status: 'em_andamento' });
    const finalizadosHoje = await AtendimentoPsicologia.countDocuments({
      status: 'finalizado',
      'saida.dataHora': {
        $gte: new Date(hojeStr),
        $lt: new Date(new Date(hojeStr).setDate(new Date(hojeStr).getDate() + 1))
      }
    });
    
    const porTipo = await AtendimentoPsicologia.aggregate([
      { $match: { 'entrada.dataHora': { $gte: ultimos30Dias } } },
      { $group: { _id: '$tipoTarefa', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    const porGravidade = await AtendimentoPsicologia.aggregate([
      { $match: { 'entrada.dataHora': { $gte: ultimos30Dias } } },
      { $group: { _id: '$entrada.gravidade', count: { $sum: 1 } } }
    ]);
    
    const resultados = await AtendimentoPsicologia.aggregate([
      { $match: { status: 'finalizado', 'saida.resultado': { $exists: true }, 'entrada.dataHora': { $gte: ultimos30Dias } } },
      { $group: { _id: '$saida.resultado', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    const ultimos7Dias = [];
    for (let i = 6; i >= 0; i--) {
      const data = new Date();
      data.setDate(data.getDate() - i);
      const dataStr = data.toISOString().split('T')[0];
      const inicio = new Date(dataStr);
      const fim = new Date(dataStr);
      fim.setDate(fim.getDate() + 1);
      
      const count = await AtendimentoPsicologia.countDocuments({
        'entrada.dataHora': { $gte: inicio, $lt: fim }
      });
      
      ultimos7Dias.push({
        data: dataStr,
        dia: data.toLocaleDateString('pt-BR', { weekday: 'short' }),
        atendimentos: count
      });
    }
    
    const porTurma = await AtendimentoPsicologia.aggregate([
      { $match: { 'entrada.dataHora': { $gte: ultimos30Dias } } },
      { $group: { _id: '$alunoTurma', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 8 }
    ]);
    
    const alunosReincidentes = await AtendimentoPsicologia.aggregate([
      { $match: { 'entrada.dataHora': { $gte: ultimos30Dias } } },
      { $group: { 
        _id: '$alunoId', 
        alunoNome: { $first: '$alunoNome' },
        alunoTurma: { $first: '$alunoTurma' },
        count: { $sum: 1 } 
      }},
      { $match: { count: { $gte: 2 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);
    
    const porHora = await AtendimentoPsicologia.aggregate([
      { $match: { 'entrada.dataHora': { $gte: ultimos30Dias } } },
      { $group: { _id: { $hour: '$entrada.dataHora' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    
    const horasDistribuicao = Array(24).fill(0);
    porHora.forEach(h => { horasDistribuicao[h._id] = h.count; });
    
    res.json({
      success: true,
      metricas: {
        hoje: atendimentosHoje,
        semana: atendimentosSemana,
        mes: atendimentosMes,
        total,
        emAndamento,
        finalizadosHoje
      },
      porTipo: porTipo.map(t => ({
        tipo: t._id,
        label: AtendimentoPsicologia.getTipoTarefaLabel(t._id),
        count: t.count
      })),
      porGravidade: porGravidade.map(g => ({
        gravidade: g._id,
        count: g.count
      })),
      resultados: resultados.map(r => ({
        resultado: r._id,
        label: {
          'resolvido': 'Resolvido',
          'em_acompanhamento': 'Em Acompanhamento',
          'reincidente': 'Reincidente',
          'encaminhado': 'Encaminhado',
          'pendente': 'Pendente'
        }[r._id] || r._id,
        count: r.count
      })),
      tendencias: {
        ultimos7Dias,
        porTurma: porTurma.map(t => ({ turma: t._id || 'Sem turma', count: t.count })),
        alunosReincidentes,
        distribuicaoHoraria: horasDistribuicao
      }
    });
    
  } catch (error) {
    console.error('Erro no dashboard:', error);
    res.status(500).json({ success: false, error: 'Erro no dashboard: ' + error.message });
  }
});

// ============================================
// LISTAR ATENDIMENTOS ATIVOS
// ============================================
router.get('/atendimentos-ativos', authenticateToken, verificarPsicologia, async (req, res) => {
  try {
    const atendimentos = await AtendimentoPsicologia.find({ status: 'em_andamento' })
      .sort({ prioridade: -1, 'entrada.dataHora': -1 });
    
    res.json({
      success: true,
      total: atendimentos.length,
      atendimentos: atendimentos.map(a => ({
        id: a._id,
        alunoId: a.alunoId,
        alunoNome: a.alunoNome,
        alunoTurma: a.alunoTurma,
        alunoFoto: a.alunoFoto,
        tipoTarefa: a.tipoTarefa,
        tipoTarefaLabel: AtendimentoPsicologia.getTipoTarefaLabel(a.tipoTarefa),
        descricao: a.entrada.descricao,
        gravidade: a.entrada.gravidade,
        prioridade: a.prioridade,
        dataHoraEntrada: a.entrada.dataHora,
        tempoAtendimento: Math.floor((new Date() - new Date(a.entrada.dataHora)) / 60000)
      }))
    });
    
  } catch (error) {
    console.error('Erro ao buscar ativos:', error);
    res.status(500).json({ success: false, error: 'Erro: ' + error.message });
  }
});

// ============================================
// LISTAR TODOS OS ATENDIMENTOS
// ============================================
router.get('/atendimentos', authenticateToken, verificarPsicologia, async (req, res) => {
  try {
    const { limit = 100, page = 1, tipo, status, turma, dataInicio, dataFim } = req.query;
    
    let query = {};
    if (tipo && tipo !== 'todos') query.tipoTarefa = tipo;
    if (status && status !== 'todos') query.status = status;
    if (turma && turma !== 'todas') query.alunoTurma = turma;
    if (dataInicio || dataFim) {
      query['entrada.dataHora'] = {};
      if (dataInicio) query['entrada.dataHora'].$gte = new Date(dataInicio);
      if (dataFim) query['entrada.dataHora'].$lte = new Date(dataFim + 'T23:59:59');
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [atendimentos, total] = await Promise.all([
      AtendimentoPsicologia.find(query)
        .sort({ 'entrada.dataHora': -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      AtendimentoPsicologia.countDocuments(query)
    ]);
    
    const turmasDisponiveis = await AtendimentoPsicologia.distinct('alunoTurma');
    
    res.json({
      success: true,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit)),
      turmasDisponiveis: turmasDisponiveis.filter(t => t && t !== 'Não informada'),
      atendimentos: atendimentos.map(a => ({
        id: a._id,
        alunoId: a.alunoId,
        alunoNome: a.alunoNome,
        alunoMatricula: a.alunoMatricula,
        alunoTurma: a.alunoTurma,
        alunoCurso: a.alunoCurso,
        tipoTarefa: a.tipoTarefa,
        tipoTarefaLabel: AtendimentoPsicologia.getTipoTarefaLabel(a.tipoTarefa),
        descricao: a.entrada.descricao,
        gravidade: a.entrada.gravidade,
        prioridade: a.prioridade,
        status: a.status,
        dataEntrada: a.entrada.dataHora,
        dataEntradaFormatada: new Date(a.entrada.dataHora).toLocaleString('pt-BR'),
        registradoPor: a.entrada.registradoPorNome,
        saida: a.saida ? {
          dataHora: a.saida.dataHora,
          dataHoraFormatada: new Date(a.saida.dataHora).toLocaleString('pt-BR'),
          resultado: a.saida.resultado,
          resultadoTexto: {
            'resolvido': 'Resolvido',
            'em_acompanhamento': 'Em Acompanhamento',
            'reincidente': 'Reincidente',
            'encaminhado': 'Encaminhado',
            'pendente': 'Pendente'
          }[a.saida.resultado] || a.saida.resultado,
          observacoesFinais: a.saida.observacoesFinais,
          registradoPor: a.saida.registradoPorNome
        } : null,
        createdAt: a.createdAt
      }))
    });
    
  } catch (error) {
    console.error('Erro ao listar:', error);
    res.status(500).json({ success: false, error: 'Erro: ' + error.message });
  }
});

// ============================================
// BUSCAR ATENDIMENTO POR ID
// ============================================
router.get('/atendimento/:id', authenticateToken, verificarPsicologia, async (req, res) => {
  try {
    const atendimento = await AtendimentoPsicologia.findById(req.params.id);
    
    if (!atendimento) {
      return res.status(404).json({ success: false, error: 'Atendimento não encontrado' });
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
        tipoTarefa: atendimento.tipoTarefa,
        tipoTarefaLabel: AtendimentoPsicologia.getTipoTarefaLabel(atendimento.tipoTarefa),
        entrada: {
          dataHora: atendimento.entrada.dataHora,
          dataHoraFormatada: new Date(atendimento.entrada.dataHora).toLocaleString('pt-BR'),
          descricao: atendimento.entrada.descricao,
          observacoes: atendimento.entrada.observacoes,
          gravidade: atendimento.entrada.gravidade,
          registradoPor: atendimento.entrada.registradoPorNome
        },
        detalhes: atendimento.detalhes,
        saida: atendimento.saida ? {
          dataHora: atendimento.saida.dataHora,
          dataHoraFormatada: new Date(atendimento.saida.dataHora).toLocaleString('pt-BR'),
          resultado: atendimento.saida.resultado,
          resultadoTexto: atendimento.saida.resultadoTexto,
          observacoesFinais: atendimento.saida.observacoesFinais,
          registradoPor: atendimento.saida.registradoPorNome
        } : null,
        status: atendimento.status,
        prioridade: atendimento.prioridade,
        anexos: atendimento.anexos,
        createdAt: atendimento.createdAt
      }
    });
    
  } catch (error) {
    console.error('Erro ao buscar:', error);
    res.status(500).json({ success: false, error: 'Erro: ' + error.message });
  }
});

// ============================================
// EDITAR ATENDIMENTO
// ============================================
router.put('/atendimento/:id', authenticateToken, verificarPsicologia, async (req, res) => {
  try {
    const { descricao, observacoes, gravidade, prioridade, detalhes, status, saida } = req.body;
    
    const atendimento = await AtendimentoPsicologia.findById(req.params.id);
    if (!atendimento) {
      return res.status(404).json({ success: false, error: 'Atendimento não encontrado' });
    }
    
    if (descricao) atendimento.entrada.descricao = descricao;
    if (observacoes !== undefined) atendimento.entrada.observacoes = observacoes;
    if (gravidade) atendimento.entrada.gravidade = gravidade;
    if (prioridade) atendimento.prioridade = prioridade;
    if (detalhes) atendimento.detalhes = { ...atendimento.detalhes, ...detalhes };
    if (status) atendimento.status = status;
    
    if (saida) {
      atendimento.saida = {
        ...atendimento.saida,
        ...saida,
        registradoPor: req.userId,
        registradoPorNome: req.userNome
      };
    }
    
    atendimento.updatedAt = new Date();
    await atendimento.save();
    
    res.json({
      success: true,
      message: 'Atendimento atualizado com sucesso',
      atendimento: { id: atendimento._id }
    });
    
  } catch (error) {
    console.error('Erro ao editar:', error);
    res.status(500).json({ success: false, error: 'Erro: ' + error.message });
  }
});

// ============================================
// EXCLUIR ATENDIMENTO
// ============================================
router.delete('/atendimento/:id', authenticateToken, verificarPsicologia, async (req, res) => {
  try {
    const atendimento = await AtendimentoPsicologia.findByIdAndDelete(req.params.id);
    
    if (!atendimento) {
      return res.status(404).json({ success: false, error: 'Atendimento não encontrado' });
    }
    
    res.json({ success: true, message: 'Atendimento excluído com sucesso' });
    
  } catch (error) {
    console.error('Erro ao excluir:', error);
    res.status(500).json({ success: false, error: 'Erro: ' + error.message });
  }
});

// ============================================
// RELATÓRIO POR ALUNO
// ============================================
router.get('/relatorio/aluno/:alunoId', authenticateToken, verificarPsicologia, async (req, res) => {
  try {
    const { dataInicio, dataFim } = req.query;
    
    let query = { alunoId: req.params.alunoId };
    if (dataInicio || dataFim) {
      query['entrada.dataHora'] = {};
      if (dataInicio) query['entrada.dataHora'].$gte = new Date(dataInicio);
      if (dataFim) query['entrada.dataHora'].$lte = new Date(dataFim + 'T23:59:59');
    }
    
    const atendimentos = await AtendimentoPsicologia.find(query).sort({ 'entrada.dataHora': -1 });
    const aluno = await User.findById(req.params.alunoId).select('nome matricula turma curso');
    
    const porTipo = {};
    const porGravidade = {};
    
    atendimentos.forEach(a => {
      porTipo[a.tipoTarefa] = (porTipo[a.tipoTarefa] || 0) + 1;
      porGravidade[a.entrada.gravidade] = (porGravidade[a.entrada.gravidade] || 0) + 1;
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
      periodo: { dataInicio, dataFim },
      estatisticas: {
        totalAtendimentos: atendimentos.length,
        porTipo: Object.entries(porTipo).map(([tipo, count]) => ({
          tipo,
          label: AtendimentoPsicologia.getTipoTarefaLabel(tipo),
          count
        })),
        porGravidade,
        emAndamento: atendimentos.filter(a => a.status === 'em_andamento').length,
        finalizados: atendimentos.filter(a => a.status === 'finalizado').length
      },
      atendimentos: atendimentos.map(a => ({
        id: a._id,
        tipoTarefa: a.tipoTarefa,
        tipoTarefaLabel: AtendimentoPsicologia.getTipoTarefaLabel(a.tipoTarefa),
        dataEntrada: a.entrada.dataHora,
        descricao: a.entrada.descricao,
        gravidade: a.entrada.gravidade,
        status: a.status,
        dataSaida: a.saida?.dataHora || null,
        resultado: a.saida?.resultado || null
      }))
    });
    
  } catch (error) {
    console.error('Erro no relatório:', error);
    res.status(500).json({ success: false, error: 'Erro: ' + error.message });
  }
});

// ============================================
// RELATÓRIO POR TURMA
// ============================================
router.get('/relatorio/turma/:turma', authenticateToken, verificarPsicologia, async (req, res) => {
  try {
    const { dataInicio, dataFim } = req.query;
    
    let query = { alunoTurma: req.params.turma };
    if (dataInicio || dataFim) {
      query['entrada.dataHora'] = {};
      if (dataInicio) query['entrada.dataHora'].$gte = new Date(dataInicio);
      if (dataFim) query['entrada.dataHora'].$lte = new Date(dataFim + 'T23:59:59');
    }
    
    const atendimentos = await AtendimentoPsicologia.find(query).sort({ 'entrada.dataHora': -1 });
    
    const porAluno = {};
    const porTipo = {};
    
    atendimentos.forEach(a => {
      const key = a.alunoId.toString();
      if (!porAluno[key]) {
        porAluno[key] = {
          alunoId: a.alunoId,
          alunoNome: a.alunoNome,
          alunoMatricula: a.alunoMatricula,
          total: 0,
          tipos: {}
        };
      }
      porAluno[key].total++;
      porAluno[key].tipos[a.tipoTarefa] = (porAluno[key].tipos[a.tipoTarefa] || 0) + 1;
      porTipo[a.tipoTarefa] = (porTipo[a.tipoTarefa] || 0) + 1;
    });
    
    res.json({
      success: true,
      turma: req.params.turma,
      periodo: { dataInicio, dataFim },
      estatisticas: {
        totalAtendimentos: atendimentos.length,
        totalAlunosAtendidos: Object.keys(porAluno).length,
        porTipo: Object.entries(porTipo).map(([tipo, count]) => ({
          tipo,
          label: AtendimentoPsicologia.getTipoTarefaLabel(tipo),
          count
        }))
      },
      porAluno: Object.values(porAluno).sort((a, b) => b.total - a.total),
      atendimentos: atendimentos.map(a => ({
        id: a._id,
        alunoNome: a.alunoNome,
        tipoTarefa: a.tipoTarefa,
        tipoTarefaLabel: AtendimentoPsicologia.getTipoTarefaLabel(a.tipoTarefa),
        dataEntrada: a.entrada.dataHora,
        descricao: a.entrada.descricao,
        gravidade: a.entrada.gravidade,
        status: a.status
      }))
    });
    
  } catch (error) {
    console.error('Erro no relatório:', error);
    res.status(500).json({ success: false, error: 'Erro: ' + error.message });
  }
});

// ============================================
// RELATÓRIO GERAL
// ============================================
router.get('/relatorio/geral', authenticateToken, verificarPsicologia, async (req, res) => {
  try {
    const { dataInicio, dataFim, turma, tipo } = req.query;
    
    let query = {};
    if (turma && turma !== 'todas') query.alunoTurma = turma;
    if (tipo && tipo !== 'todos') query.tipoTarefa = tipo;
    if (dataInicio || dataFim) {
      query['entrada.dataHora'] = {};
      if (dataInicio) query['entrada.dataHora'].$gte = new Date(dataInicio);
      if (dataFim) query['entrada.dataHora'].$lte = new Date(dataFim + 'T23:59:59');
    }
    
    const atendimentos = await AtendimentoPsicologia.find(query).sort({ 'entrada.dataHora': -1 });
    
    const porTurma = {};
    const porTipo = {};
    const porGravidade = {};
    
    atendimentos.forEach(a => {
      if (!porTurma[a.alunoTurma]) {
        porTurma[a.alunoTurma] = { turma: a.alunoTurma, total: 0, alunos: new Set() };
      }
      porTurma[a.alunoTurma].total++;
      porTurma[a.alunoTurma].alunos.add(a.alunoId.toString());
      
      porTipo[a.tipoTarefa] = (porTipo[a.tipoTarefa] || 0) + 1;
      porGravidade[a.entrada.gravidade] = (porGravidade[a.entrada.gravidade] || 0) + 1;
    });
    
    Object.values(porTurma).forEach(t => {
      t.totalAlunos = t.alunos.size;
      delete t.alunos;
    });
    
    const turmas = await AtendimentoPsicologia.distinct('alunoTurma');
    
    res.json({
      success: true,
      filtros: { dataInicio, dataFim, turma, tipo },
      turmasDisponiveis: turmas.filter(t => t && t !== 'Não informada'),
      totalAtendimentos: atendimentos.length,
      porTurma: Object.values(porTurma).sort((a, b) => b.total - a.total),
      porTipo: Object.entries(porTipo).map(([t, count]) => ({
        tipo: t,
        label: AtendimentoPsicologia.getTipoTarefaLabel(t),
        count
      })).sort((a, b) => b.count - a.count),
      porGravidade,
      atendimentos: atendimentos.slice(0, 100).map(a => ({
        id: a._id,
        alunoNome: a.alunoNome,
        alunoTurma: a.alunoTurma,
        tipoTarefa: a.tipoTarefa,
        tipoTarefaLabel: AtendimentoPsicologia.getTipoTarefaLabel(a.tipoTarefa),
        dataEntrada: a.entrada.dataHora,
        descricao: a.entrada.descricao.substring(0, 100),
        gravidade: a.entrada.gravidade,
        status: a.status
      }))
    });
    
  } catch (error) {
    console.error('Erro no relatório:', error);
    res.status(500).json({ success: false, error: 'Erro: ' + error.message });
  }
});

module.exports = router;