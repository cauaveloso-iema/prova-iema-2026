const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AtendimentoAssistenteSocial = require('../models/AtendimentoAssistenteSocial');

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

const verificarAssistenteSocial = (req, res, next) => {
  const allowedRoles = ['assistente-social', 'super_admin', 'admin'];
  if (!allowedRoles.includes(req.userRole)) {
    return res.status(403).json({
      success: false,
      error: 'Acesso permitido apenas para Assistente Social'
    });
  }
  next();
};

// ============================================
// 🔥 HELPER: Timezone Brasil (UTC-3)
// ============================================
function inicioDoDiaBrasil(dataStr) {
  return new Date(dataStr + 'T00:00:00.000-03:00');
}
function fimDoDiaBrasil(dataStr) {
  return new Date(dataStr + 'T23:59:59.999-03:00');
}

// ============================================
// HEALTH CHECK
// ============================================
router.get('/health', (req, res) => {
  res.json({ success: true, status: 'online', service: 'Assistente Social' });
});

// ============================================
// LISTAR TURMAS
// ============================================
router.get('/turmas', authenticateToken, verificarAssistenteSocial, async (req, res) => {
  try {
    const turmas = await User.distinct('turma', { 
      role: 'aluno', ativo: true, 
      turma: { $nin: [null, '', 'Não informada'] } 
    });
    res.json({ success: true, turmas: turmas.sort() });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro: ' + error.message });
  }
});

// ============================================
// LISTAR ALUNOS POR TURMA
// ============================================
router.get('/alunos-por-turma', authenticateToken, verificarAssistenteSocial, async (req, res) => {
  try {
    const { turma } = req.query;
    if (!turma) return res.status(400).json({ success: false, error: 'Turma é obrigatória' });
    
    const alunos = await User.find({ role: 'aluno', ativo: true, turma })
      .select('nome matricula turma curso fotoPerfil')
      .sort({ nome: 1 });
    
    res.json({
      success: true,
      total: alunos.length,
      alunos: alunos.map(a => ({
        id: a._id, nome: a.nome, matricula: a.matricula,
        turma: a.turma, curso: a.curso, fotoPerfil: a.fotoPerfil
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro: ' + error.message });
  }
});

// ============================================
// BUSCAR ALUNO POR ID
// ============================================
router.get('/aluno/:id', authenticateToken, verificarAssistenteSocial, async (req, res) => {
  try {
    const aluno = await User.findOne({ _id: req.params.id, ativo: true })
      .select('nome email matricula curso turma fotoPerfil role');
    
    if (!aluno) return res.status(404).json({ success: false, error: 'Aluno não encontrado' });
    if (aluno.role !== 'aluno') return res.status(400).json({ success: false, error: 'Usuário não é aluno' });
    
    const atendimentosAtivos = await AtendimentoAssistenteSocial.find({
      alunoId: aluno._id, status: 'em_andamento'
    }).sort({ createdAt: -1 });
    
    const historicoRecente = await AtendimentoAssistenteSocial.find({
      alunoId: aluno._id, status: 'finalizado'
    }).sort({ createdAt: -1 }).limit(5);
    
    res.json({
      success: true,
      aluno: {
        id: aluno._id, nome: aluno.nome, matricula: aluno.matricula,
        turma: aluno.turma, curso: aluno.curso, fotoPerfil: aluno.fotoPerfil || null
      },
      atendimentosAtivos: atendimentosAtivos.map(a => ({
        id: a._id, tipoTarefa: a.tipoTarefa,
        tipoTarefaLabel: AtendimentoAssistenteSocial.getTipoTarefaLabel(a.tipoTarefa),
        descricao: a.entrada.descricao, dataHoraEntrada: a.entrada.dataHora, prioridade: a.prioridade
      })),
      historicoRecente: historicoRecente.map(a => ({
        id: a._id, tipoTarefa: a.tipoTarefa,
        tipoTarefaLabel: AtendimentoAssistenteSocial.getTipoTarefaLabel(a.tipoTarefa),
        descricao: a.entrada.descricao, dataHora: a.entrada.dataHora, resultado: a.saida?.resultado
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro: ' + error.message });
  }
});

// ============================================
// BUSCAR ALUNO POR NOME/MATRÍCULA
// ============================================
router.get('/buscar-aluno', authenticateToken, verificarAssistenteSocial, async (req, res) => {
  try {
    const { termo } = req.query;
    if (!termo || termo.length < 2) {
      return res.status(400).json({ success: false, error: 'Digite pelo menos 2 caracteres' });
    }
    
    const alunos = await User.find({
      role: 'aluno', ativo: true,
      $or: [
        { nome: { $regex: termo, $options: 'i' } },
        { matricula: { $regex: termo, $options: 'i' } }
      ]
    })
    .select('nome matricula turma curso fotoPerfil')
    .limit(20).sort({ nome: 1 });
    
    res.json({
      success: true,
      total: alunos.length,
      alunos: alunos.map(a => ({
        id: a._id, nome: a.nome, matricula: a.matricula,
        turma: a.turma, curso: a.curso, fotoPerfil: a.fotoPerfil
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro: ' + error.message });
  }
});

// ============================================
// REGISTRAR NOVO ATENDIMENTO
// ============================================
router.post('/registrar', authenticateToken, verificarAssistenteSocial, async (req, res) => {
  try {
    const { 
      alunoId, tipoTarefa, descricao, observacoes, gravidade, prioridade, detalhes, 
      assinaturaBase64 
    } = req.body;
    
    if (!descricao || descricao.trim() === '') {
      return res.status(400).json({ success: false, error: 'A descrição é obrigatória' });
    }
    
    const tiposValidos = [
      'evasao_escolar', 'desinteresse_aprendizado', 'problemas_disciplina',
      'insubordinacao_limites', 'vulnerabilidade_drogas', 'atitudes_agressivas',
      'baixo_rendimento', 'encaminhamento', 'intervencao', 'atendimento', 'outros'
    ];
    
    if (!tiposValidos.includes(tipoTarefa)) {
      return res.status(400).json({ success: false, error: 'Tipo de tarefa inválido' });
    }
    
    const aluno = await User.findById(alunoId);
    if (!aluno || aluno.role !== 'aluno') {
      return res.status(404).json({ success: false, error: 'Aluno não encontrado' });
    }
    
    const assistente = await User.findById(req.userId).select('nome');
    
    let assinaturaValida = '';
    if (assinaturaBase64 && typeof assinaturaBase64 === 'string') {
      if (assinaturaBase64.startsWith('data:image/') && assinaturaBase64.length < 500000) {
        assinaturaValida = assinaturaBase64;
      }
    }
    
    const atendimento = new AtendimentoAssistenteSocial({
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
        registradoPorNome: assistente?.nome || req.userNome || 'Assistente Social',
        assinaturaBase64: assinaturaValida
      },
      detalhes: detalhes || {},
      prioridade: prioridade || 'normal',
      status: 'em_andamento'
    });
    
    await atendimento.save();
    
    res.json({
      success: true,
      message: `${AtendimentoAssistenteSocial.getTipoTarefaLabel(tipoTarefa)} registrado para ${aluno.nome}`,
      atendimento: {
        id: atendimento._id,
        tipoTarefa: atendimento.tipoTarefa,
        tipoTarefaLabel: AtendimentoAssistenteSocial.getTipoTarefaLabel(tipoTarefa),
        status: atendimento.status,
        dataHora: atendimento.entrada.dataHora,
        temAssinatura: !!assinaturaValida
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao registrar: ' + error.message });
  }
});

// ============================================
// FINALIZAR ATENDIMENTO
// ============================================
router.post('/finalizar', authenticateToken, verificarAssistenteSocial, async (req, res) => {
  try {
    const { atendimentoId, resultado, resultadoTexto, observacoesFinais } = req.body;
    
    const resultadosValidos = ['resolvido', 'em_acompanhamento', 'reincidente', 'encaminhado', 'pendente'];
    if (!resultadosValidos.includes(resultado)) {
      return res.status(400).json({ success: false, error: 'Resultado inválido' });
    }
    
    const atendimento = await AtendimentoAssistenteSocial.findById(atendimentoId);
    if (!atendimento) return res.status(404).json({ success: false, error: 'Atendimento não encontrado' });
    if (atendimento.status === 'finalizado') {
      return res.status(400).json({ success: false, error: 'Atendimento já finalizado' });
    }
    
    const assistente = await User.findById(req.userId).select('nome');
    
    atendimento.saida = {
      dataHora: new Date(),
      resultado,
      resultadoTexto: resultadoTexto || '',
      observacoesFinais: observacoesFinais || '',
      registradoPor: req.userId,
      registradoPorNome: assistente?.nome || req.userNome || 'Assistente Social'
    };
    atendimento.status = 'finalizado';
    atendimento.updatedAt = new Date();
    
    await atendimento.save();
    
    const resultadoLabel = {
      'resolvido': 'Resolvido', 'em_acompanhamento': 'Em Acompanhamento',
      'reincidente': 'Reincidente', 'encaminhado': 'Encaminhado', 'pendente': 'Pendente'
    }[resultado];
    
    res.json({
      success: true,
      message: `Atendimento finalizado. Resultado: ${resultadoLabel}`,
      atendimento: {
        id: atendimento._id, status: atendimento.status,
        resultado: resultadoLabel, dataHoraSaida: atendimento.saida.dataHora
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro: ' + error.message });
  }
});

// ============================================
// REMARCAR ATENDIMENTO
// ============================================
router.post('/remarcar', authenticateToken, verificarAssistenteSocial, async (req, res) => {
  try {
    const { atendimentoId, dataRemarcacao, horarioRemarcacao, motivoRemarcacao, observacoesRemarcacao } = req.body;
    
    if (!atendimentoId) return res.status(400).json({ success: false, error: 'ID obrigatório' });
    if (!dataRemarcacao) return res.status(400).json({ success: false, error: 'Data obrigatória' });
    if (!horarioRemarcacao) return res.status(400).json({ success: false, error: 'Horário obrigatório' });
    if (!motivoRemarcacao) return res.status(400).json({ success: false, error: 'Motivo obrigatório' });
    
    const atendimento = await AtendimentoAssistenteSocial.findById(atendimentoId);
    if (!atendimento) return res.status(404).json({ success: false, error: 'Atendimento não encontrado' });
    
    const dataObj = new Date(dataRemarcacao + 'T00:00:00');
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    if (dataObj < hoje) {
      return res.status(400).json({ success: false, error: 'A data deve ser hoje ou futura' });
    }
    
    const assistente = await User.findById(req.userId).select('nome');
    
    const remarcacao = {
      id: new (require('mongoose').Types.ObjectId)(),
      dataRemarcacao,
      horarioRemarcacao,
      motivoRemarcacao,
      observacoesRemarcacao: observacoesRemarcacao || '',
      status: 'pendente',
      criadaEm: new Date(),
      criadaPor: req.userId,
      criadaPorNome: assistente?.nome || req.userNome || 'Assistente Social'
    };
    
    if (!atendimento.remarcacoes) atendimento.remarcacoes = [];
    atendimento.remarcacoes.push(remarcacao);
    atendimento.temRemarcacaoPendente = true;
    atendimento.updatedAt = new Date();
    
    await atendimento.save();
    
    res.json({
      success: true,
      message: `Atendimento remarcado para ${dataObj.toLocaleDateString('pt-BR')} às ${horarioRemarcacao}`,
      remarcacao: {
        id: remarcacao.id,
        atendimentoId: atendimento._id,
        dataRemarcacao, horarioRemarcacao, motivoRemarcacao,
        observacoesRemarcacao: remarcacao.observacoesRemarcacao,
        status: 'pendente'
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao remarcar: ' + error.message });
  }
});

// ============================================
// LISTAR REMARCAÇÕES PENDENTES
// ============================================
router.get('/remarcacoes/pendentes', authenticateToken, verificarAssistenteSocial, async (req, res) => {
  try {
    const atendimentos = await AtendimentoAssistenteSocial.find({
      'remarcacoes.status': 'pendente',
      status: { $ne: 'cancelado' }
    }).sort({ 'remarcacoes.dataRemarcacao': 1 });
    
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    const remarcacoes = [];
    
    atendimentos.forEach(atendimento => {
      (atendimento.remarcacoes || []).forEach(rem => {
        if (rem.status !== 'pendente') return;
        
        const dataRem = new Date(rem.dataRemarcacao + 'T00:00:00');
        const atrasado = dataRem < hoje;
        const ehHoje = dataRem.getTime() === hoje.getTime();
        
        remarcacoes.push({
          id: rem.id.toString(),
          atendimentoId: atendimento._id,
          alunoId: atendimento.alunoId,
          alunoNome: atendimento.alunoNome,
          alunoTurma: atendimento.alunoTurma,
          alunoFoto: atendimento.alunoFoto,
          tipoTarefa: atendimento.tipoTarefa,
          tipoTarefaLabel: AtendimentoAssistenteSocial.getTipoTarefaLabel(atendimento.tipoTarefa),
          dataRemarcacao: rem.dataRemarcacao,
          horarioRemarcacao: rem.horarioRemarcacao,
          motivoRemarcacao: rem.motivoRemarcacao,
          observacoesRemarcacao: rem.observacoesRemarcacao,
          status: rem.status,
          atrasado, hoje: ehHoje,
          criadaEm: rem.criadaEm,
          criadaPorNome: rem.criadaPorNome
        });
      });
    });
    
    remarcacoes.sort((a, b) => {
      if (a.atrasado && !b.atrasado) return -1;
      if (!a.atrasado && b.atrasado) return 1;
      if (a.hoje && !b.hoje) return -1;
      if (!a.hoje && b.hoje) return 1;
      return new Date(a.dataRemarcacao) - new Date(b.dataRemarcacao);
    });
    
    res.json({ success: true, total: remarcacoes.length, remarcacoes });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro: ' + error.message });
  }
});

// ============================================
// BUSCAR REMARCAÇÃO POR ID
// ============================================
router.get('/remarcacoes/:id', authenticateToken, verificarAssistenteSocial, async (req, res) => {
  try {
    const atendimento = await AtendimentoAssistenteSocial.findOne({
      'remarcacoes.id': req.params.id
    });
    
    if (!atendimento) return res.status(404).json({ success: false, error: 'Remarcação não encontrada' });
    
    const remarcacao = atendimento.remarcacoes.find(r => r.id.toString() === req.params.id);
    if (!remarcacao) return res.status(404).json({ success: false, error: 'Remarcação não encontrada' });
    
    res.json({
      success: true,
      remarcacao: {
        id: remarcacao.id.toString(),
        atendimentoId: atendimento._id,
        alunoId: atendimento.alunoId,
        alunoNome: atendimento.alunoNome,
        alunoTurma: atendimento.alunoTurma,
        dataRemarcacao: remarcacao.dataRemarcacao,
        horarioRemarcacao: remarcacao.horarioRemarcacao,
        motivoRemarcacao: remarcacao.motivoRemarcacao,
        observacoesRemarcacao: remarcacao.observacoesRemarcacao,
        status: remarcacao.status,
        criadaEm: remarcacao.criadaEm
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro: ' + error.message });
  }
});

// ============================================
// FINALIZAR REMARCAÇÃO
// ============================================
router.post('/remarcacoes/finalizar', authenticateToken, verificarAssistenteSocial, async (req, res) => {
  try {
    const { remarcacaoId, acao } = req.body;
    
    if (!remarcacaoId) return res.status(400).json({ success: false, error: 'ID obrigatório' });
    if (!['realizado', 'cancelado'].includes(acao)) {
      return res.status(400).json({ success: false, error: 'Ação inválida' });
    }
    
    const atendimento = await AtendimentoAssistenteSocial.findOne({
      'remarcacoes.id': remarcacaoId
    });
    
    if (!atendimento) return res.status(404).json({ success: false, error: 'Remarcação não encontrada' });
    
    const remarcacao = atendimento.remarcacoes.find(r => r.id.toString() === remarcacaoId);
    if (!remarcacao) return res.status(404).json({ success: false, error: 'Remarcação não encontrada' });
    
    remarcacao.status = acao === 'realizado' ? 'realizado' : 'cancelado';
    remarcacao.finalizadaEm = new Date();
    remarcacao.finalizadaPor = req.userId;
    
    const temPendente = (atendimento.remarcacoes || []).some(r => r.status === 'pendente');
    atendimento.temRemarcacaoPendente = temPendente;
    
    if (acao === 'realizado' && atendimento.status === 'em_andamento') {
      atendimento.status = 'finalizado';
      atendimento.saida = {
        dataHora: new Date(),
        resultado: 'resolvido',
        resultadoTexto: 'Atendimento remarcado e realizado',
        observacoesFinais: `Remarcação realizada em ${new Date().toLocaleString('pt-BR')}`,
        registradoPor: req.userId,
        registradoPorNome: req.userNome
      };
    }
    
    atendimento.updatedAt = new Date();
    await atendimento.save();
    
    const mensagem = acao === 'realizado' 
      ? '✅ Remarcação marcada como realizada!' 
      : '❌ Remarcação cancelada.';
    
    res.json({ success: true, message: mensagem });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro: ' + error.message });
  }
});

// ============================================
// DASHBOARD
// ============================================
router.get('/dashboard', authenticateToken, verificarAssistenteSocial, async (req, res) => {
  try {
    const hoje = new Date();
    const hojeStr = hoje.toISOString().split('T')[0];
    const inicioSemana = new Date(hoje);
    inicioSemana.setDate(hoje.getDate() - hoje.getDay());
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const ultimos30Dias = new Date();
    ultimos30Dias.setDate(ultimos30Dias.getDate() - 30);
    
    const [atendimentosHoje, atendimentosSemana, atendimentosMes, total] = await Promise.all([
      AtendimentoAssistenteSocial.countDocuments({
        'entrada.dataHora': {
          $gte: inicioDoDiaBrasil(hojeStr),
          $lte: fimDoDiaBrasil(hojeStr)
        }
      }),
      AtendimentoAssistenteSocial.countDocuments({ 'entrada.dataHora': { $gte: inicioSemana } }),
      AtendimentoAssistenteSocial.countDocuments({ 'entrada.dataHora': { $gte: inicioMes } }),
      AtendimentoAssistenteSocial.countDocuments()
    ]);
    
    const emAndamento = await AtendimentoAssistenteSocial.countDocuments({ status: 'em_andamento' });
    const finalizadosHoje = await AtendimentoAssistenteSocial.countDocuments({
      status: 'finalizado',
      'saida.dataHora': {
        $gte: inicioDoDiaBrasil(hojeStr),
        $lte: fimDoDiaBrasil(hojeStr)
      }
    });
    
    const porTipo = await AtendimentoAssistenteSocial.aggregate([
      { $match: { 'entrada.dataHora': { $gte: ultimos30Dias } } },
      { $group: { _id: '$tipoTarefa', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    const porGravidade = await AtendimentoAssistenteSocial.aggregate([
      { $match: { 'entrada.dataHora': { $gte: ultimos30Dias } } },
      { $group: { _id: '$entrada.gravidade', count: { $sum: 1 } } }
    ]);
    
    const resultados = await AtendimentoAssistenteSocial.aggregate([
      { $match: { status: 'finalizado', 'saida.resultado': { $exists: true }, 'entrada.dataHora': { $gte: ultimos30Dias } } },
      { $group: { _id: '$saida.resultado', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    const ultimos7Dias = [];
    for (let i = 6; i >= 0; i--) {
      const data = new Date();
      data.setDate(data.getDate() - i);
      const dataStr = data.toISOString().split('T')[0];
      
      const count = await AtendimentoAssistenteSocial.countDocuments({
        'entrada.dataHora': { $gte: inicioDoDiaBrasil(dataStr), $lte: fimDoDiaBrasil(dataStr) }
      });
      
      ultimos7Dias.push({
        data: dataStr,
        dia: data.toLocaleDateString('pt-BR', { weekday: 'short' }),
        atendimentos: count
      });
    }
    
    const porTurma = await AtendimentoAssistenteSocial.aggregate([
      { $match: { 'entrada.dataHora': { $gte: ultimos30Dias } } },
      { $group: { _id: '$alunoTurma', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 8 }
    ]);
    
    const alunosReincidentes = await AtendimentoAssistenteSocial.aggregate([
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
    
    const porHora = await AtendimentoAssistenteSocial.aggregate([
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
        label: AtendimentoAssistenteSocial.getTipoTarefaLabel(t._id),
        count: t.count
      })),
      porGravidade: porGravidade.map(g => ({ gravidade: g._id, count: g.count })),
      resultados: resultados.map(r => ({
        resultado: r._id,
        label: {
          'resolvido': 'Resolvido', 'em_acompanhamento': 'Em Acompanhamento',
          'reincidente': 'Reincidente', 'encaminhado': 'Encaminhado', 'pendente': 'Pendente'
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
    res.status(500).json({ success: false, error: 'Erro: ' + error.message });
  }
});

// ============================================
// LISTAR ATENDIMENTOS ATIVOS
// ============================================
router.get('/atendimentos-ativos', authenticateToken, verificarAssistenteSocial, async (req, res) => {
  try {
    const atendimentos = await AtendimentoAssistenteSocial.find({ status: 'em_andamento' })
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
        tipoTarefaLabel: AtendimentoAssistenteSocial.getTipoTarefaLabel(a.tipoTarefa),
        descricao: a.entrada.descricao,
        gravidade: a.entrada.gravidade,
        prioridade: a.prioridade,
        dataHoraEntrada: a.entrada.dataHora,
        tempoAtendimento: Math.floor((new Date() - new Date(a.entrada.dataHora)) / 60000),
        temRemarcacaoPendente: a.temRemarcacaoPendente || false,
        temAssinatura: !!(a.entrada?.assinaturaBase64)
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro: ' + error.message });
  }
});

// ============================================
// LISTAR TODOS OS ATENDIMENTOS (COM FILTROS) — 🔥 CORRIGIDO
// ============================================
router.get('/atendimentos', authenticateToken, verificarAssistenteSocial, async (req, res) => {
  try {
    const { limit = 100, page = 1, tipo, status, turma, dataInicio, dataFim } = req.query;
    
    let query = {};
    if (tipo && tipo !== 'todos') query.tipoTarefa = tipo;
    if (status && status !== 'todos') query.status = status;
    if (turma && turma !== 'todas') query.alunoTurma = turma;
    
    // 🔥 CORRIGIDO: Timezone Brasil UTC-3
    if (dataInicio || dataFim) {
      query['entrada.dataHora'] = {};
      if (dataInicio) query['entrada.dataHora'].$gte = inicioDoDiaBrasil(dataInicio);
      if (dataFim) query['entrada.dataHora'].$lte = fimDoDiaBrasil(dataFim);
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [atendimentos, total] = await Promise.all([
      AtendimentoAssistenteSocial.find(query)
        .sort({ 'entrada.dataHora': -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      AtendimentoAssistenteSocial.countDocuments(query)
    ]);
    
    const turmasAtendimento = await AtendimentoAssistenteSocial.distinct('alunoTurma');
    const turmasAlunos = await User.distinct('turma', { 
      role: 'aluno', ativo: true, 
      turma: { $nin: [null, '', 'Não informada'] } 
    });

    const turmasDisponiveis = [...new Set([
      ...turmasAtendimento.filter(t => t && t !== 'Não informada'),
      ...turmasAlunos
    ])].sort();
    
    res.json({
      success: true,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit)),
      turmasDisponiveis,
      atendimentos: atendimentos.map(a => ({
        id: a._id,
        alunoId: a.alunoId,
        alunoNome: a.alunoNome,
        alunoMatricula: a.alunoMatricula,
        alunoTurma: a.alunoTurma,
        alunoCurso: a.alunoCurso,
        tipoTarefa: a.tipoTarefa,
        tipoTarefaLabel: AtendimentoAssistenteSocial.getTipoTarefaLabel(a.tipoTarefa),
        descricao: a.entrada.descricao,
        gravidade: a.entrada.gravidade,
        prioridade: a.prioridade,
        status: a.status,
        dataEntrada: a.entrada.dataHora,
        dataEntradaFormatada: new Date(a.entrada.dataHora).toLocaleString('pt-BR'),
        registradoPor: a.entrada.registradoPorNome,
        temAssinatura: !!(a.entrada?.assinaturaBase64),
        saida: a.saida ? {
          dataHora: a.saida.dataHora,
          dataHoraFormatada: new Date(a.saida.dataHora).toLocaleString('pt-BR'),
          resultado: a.saida.resultado,
          resultadoTexto: {
            'resolvido': 'Resolvido', 'em_acompanhamento': 'Em Acompanhamento',
            'reincidente': 'Reincidente', 'encaminhado': 'Encaminhado', 'pendente': 'Pendente'
          }[a.saida.resultado] || a.saida.resultado,
          observacoesFinais: a.saida.observacoesFinais,
          registradoPor: a.saida.registradoPorNome
        } : null,
        createdAt: a.createdAt
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro: ' + error.message });
  }
});

// ============================================
// BUSCAR ATENDIMENTO POR ID
// ============================================
router.get('/atendimento/:id', authenticateToken, verificarAssistenteSocial, async (req, res) => {
  try {
    const atendimento = await AtendimentoAssistenteSocial.findById(req.params.id);
    if (!atendimento) return res.status(404).json({ success: false, error: 'Atendimento não encontrado' });
    
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
        tipoTarefaLabel: AtendimentoAssistenteSocial.getTipoTarefaLabel(atendimento.tipoTarefa),
        entrada: {
          dataHora: atendimento.entrada.dataHora,
          dataHoraFormatada: new Date(atendimento.entrada.dataHora).toLocaleString('pt-BR'),
          descricao: atendimento.entrada.descricao,
          observacoes: atendimento.entrada.observacoes,
          gravidade: atendimento.entrada.gravidade,
          registradoPor: atendimento.entrada.registradoPorNome,
          temAssinatura: !!(atendimento.entrada?.assinaturaBase64),
          assinaturaBase64: atendimento.entrada?.assinaturaBase64 || null
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
        remarcacoes: atendimento.remarcacoes || [],
        temRemarcacaoPendente: atendimento.temRemarcacaoPendente || false,
        anexos: atendimento.anexos,
        createdAt: atendimento.createdAt
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro: ' + error.message });
  }
});

// ============================================
// EDITAR ATENDIMENTO
// ============================================
router.put('/atendimento/:id', authenticateToken, verificarAssistenteSocial, async (req, res) => {
  try {
    const { descricao, observacoes, gravidade, prioridade, detalhes, status, saida } = req.body;
    const atendimento = await AtendimentoAssistenteSocial.findById(req.params.id);
    if (!atendimento) return res.status(404).json({ success: false, error: 'Atendimento não encontrado' });
    
    if (descricao) atendimento.entrada.descricao = descricao;
    if (observacoes !== undefined) atendimento.entrada.observacoes = observacoes;
    if (gravidade) atendimento.entrada.gravidade = gravidade;
    if (prioridade) atendimento.prioridade = prioridade;
    if (detalhes) atendimento.detalhes = { ...atendimento.detalhes, ...detalhes };
    if (status) atendimento.status = status;
    
    if (saida) {
      atendimento.saida = { ...atendimento.saida, ...saida, registradoPor: req.userId, registradoPorNome: req.userNome };
    }
    
    atendimento.updatedAt = new Date();
    await atendimento.save();
    
    res.json({ success: true, message: 'Atendimento atualizado com sucesso', atendimento: { id: atendimento._id } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro: ' + error.message });
  }
});

// ============================================
// EXCLUIR ATENDIMENTO
// ============================================
router.delete('/atendimento/:id', authenticateToken, verificarAssistenteSocial, async (req, res) => {
  try {
    const atendimento = await AtendimentoAssistenteSocial.findByIdAndDelete(req.params.id);
    if (!atendimento) return res.status(404).json({ success: false, error: 'Atendimento não encontrado' });
    console.log(`🗑️ Atendimento excluído: ${atendimento.alunoNome} (${atendimento._id})`);
    res.json({ success: true, message: 'Atendimento excluído com sucesso' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro: ' + error.message });
  }
});

// ============================================
// EXCLUSÃO EM MASSA
// ============================================
router.post('/atendimentos/exclusao-massa', authenticateToken, verificarAssistenteSocial, async (req, res) => {
  try {
    const { dataCorte, status = 'finalizado', confirmacao } = req.body;
    if (confirmacao !== 'CONFIRMAR') {
      return res.status(400).json({ success: false, error: 'Confirmação inválida' });
    }
    if (!dataCorte) return res.status(400).json({ success: false, error: 'Data de corte é obrigatória' });

    const dataObj = fimDoDiaBrasil(dataCorte);
    if (isNaN(dataObj.getTime())) {
      return res.status(400).json({ success: false, error: 'Data de corte inválida' });
    }

    const filtro = { status, 'saida.dataHora': { $lt: dataObj } };
    const totalAntes = await AtendimentoAssistenteSocial.countDocuments(filtro);

    if (totalAntes === 0) {
      return res.json({ success: true, message: 'Nenhum atendimento encontrado', excluidos: 0 });
    }

    const resultado = await AtendimentoAssistenteSocial.deleteMany(filtro);
    console.log(`🗑️ EXCLUSÃO EM MASSA: ${resultado.deletedCount} excluídos`);

    res.json({
      success: true,
      message: `${resultado.deletedCount} atendimento(s) excluído(s)`,
      excluidos: resultado.deletedCount,
      dataCorte, status
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao excluir: ' + error.message });
  }
});

// ============================================
// RELATÓRIO POR ALUNO — 🔥 CORRIGIDO
// ============================================
router.get('/relatorio/aluno/:alunoId', authenticateToken, verificarAssistenteSocial, async (req, res) => {
  try {
    const { dataInicio, dataFim } = req.query;
    
    let query = { alunoId: req.params.alunoId };
    if (dataInicio || dataFim) {
      query['entrada.dataHora'] = {};
      if (dataInicio) query['entrada.dataHora'].$gte = inicioDoDiaBrasil(dataInicio);
      if (dataFim) query['entrada.dataHora'].$lte = fimDoDiaBrasil(dataFim);
    }
    
    const atendimentos = await AtendimentoAssistenteSocial.find(query).sort({ 'entrada.dataHora': -1 });
    const aluno = await User.findById(req.params.alunoId).select('nome matricula turma curso');
    
    const porTipo = {};
    const porGravidade = {};
    
    atendimentos.forEach(a => {
      porTipo[a.tipoTarefa] = (porTipo[a.tipoTarefa] || 0) + 1;
      porGravidade[a.entrada.gravidade] = (porGravidade[a.entrada.gravidade] || 0) + 1;
    });
    
    res.json({
      success: true,
      aluno: { id: aluno._id, nome: aluno.nome, matricula: aluno.matricula, turma: aluno.turma, curso: aluno.curso },
      periodo: { dataInicio, dataFim },
      estatisticas: {
        totalAtendimentos: atendimentos.length,
        porTipo: Object.entries(porTipo).map(([tipo, count]) => ({
          tipo, label: AtendimentoAssistenteSocial.getTipoTarefaLabel(tipo), count
        })),
        porGravidade,
        emAndamento: atendimentos.filter(a => a.status === 'em_andamento').length,
        finalizados: atendimentos.filter(a => a.status === 'finalizado').length
      },
      atendimentos: atendimentos.map(a => ({
        id: a._id, tipoTarefa: a.tipoTarefa,
        tipoTarefaLabel: AtendimentoAssistenteSocial.getTipoTarefaLabel(a.tipoTarefa),
        dataEntrada: a.entrada.dataHora, descricao: a.entrada.descricao,
        gravidade: a.entrada.gravidade, status: a.status,
        dataSaida: a.saida?.dataHora || null, resultado: a.saida?.resultado || null,
        temAssinatura: !!(a.entrada?.assinaturaBase64)
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro: ' + error.message });
  }
});

// ============================================
// RELATÓRIO POR TURMA — 🔥 CORRIGIDO
// ============================================
router.get('/relatorio/turma/:turma', authenticateToken, verificarAssistenteSocial, async (req, res) => {
  try {
    const { dataInicio, dataFim } = req.query;
    
    let query = { alunoTurma: req.params.turma };
    if (dataInicio || dataFim) {
      query['entrada.dataHora'] = {};
      if (dataInicio) query['entrada.dataHora'].$gte = inicioDoDiaBrasil(dataInicio);
      if (dataFim) query['entrada.dataHora'].$lte = fimDoDiaBrasil(dataFim);
    }
    
    const atendimentos = await AtendimentoAssistenteSocial.find(query).sort({ 'entrada.dataHora': -1 });
    
    const porAluno = {};
    const porTipo = {};
    
    atendimentos.forEach(a => {
      const key = a.alunoId.toString();
      if (!porAluno[key]) {
        porAluno[key] = { alunoId: a.alunoId, alunoNome: a.alunoNome, alunoMatricula: a.alunoMatricula, total: 0, tipos: {} };
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
          tipo, label: AtendimentoAssistenteSocial.getTipoTarefaLabel(tipo), count
        }))
      },
      porAluno: Object.values(porAluno).sort((a, b) => b.total - a.total),
      atendimentos: atendimentos.map(a => ({
        id: a._id, alunoNome: a.alunoNome,
        tipoTarefa: a.tipoTarefa,
        tipoTarefaLabel: AtendimentoAssistenteSocial.getTipoTarefaLabel(a.tipoTarefa),
        dataEntrada: a.entrada.dataHora, descricao: a.entrada.descricao,
        gravidade: a.entrada.gravidade, status: a.status
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro: ' + error.message });
  }
});


// ============================================
// RELATÓRIO GERAL — 🔥 COM REGISTROS
// ============================================
router.get('/relatorio/geral', authenticateToken, verificarAssistenteSocial, async (req, res) => {
  try {
    const { dataInicio, dataFim, turma, tipo } = req.query;
    
    let query = {};
    if (turma && turma !== 'todas') query.alunoTurma = turma;
    if (tipo && tipo !== 'todos') query.tipoTarefa = tipo;
    
    if (dataInicio || dataFim) {
      query['entrada.dataHora'] = {};
      if (dataInicio) query['entrada.dataHora'].$gte = inicioDoDiaBrasil(dataInicio);
      if (dataFim) query['entrada.dataHora'].$lte = fimDoDiaBrasil(dataFim);
    }
    
    const [atendimentos, total, comAssinatura] = await Promise.all([
      AtendimentoAssistenteSocial.find(query).sort({ 'entrada.dataHora': -1 }).limit(1000),
      AtendimentoAssistenteSocial.countDocuments(query),
      AtendimentoAssistenteSocial.countDocuments({ ...query, 'entrada.assinaturaBase64': { $exists: true, $ne: '' } })
    ]);
    
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
    
    const turmasAtendimento = await AtendimentoAssistenteSocial.distinct('alunoTurma');
    const turmasAlunos = await User.distinct('turma', { 
      role: 'aluno', ativo: true,
      turma: { $nin: [null, '', 'Não informada'] } 
    });

    const turmas = [...new Set([
      ...turmasAtendimento.filter(t => t && t !== 'Não informada'),
      ...turmasAlunos
    ])].sort();
    
    res.json({
      success: true,
      filtros: { dataInicio, dataFim, turma, tipo },
      turmasDisponiveis: turmas,
      totalAtendimentos: total,
      comAssinatura,
      porTurma: Object.values(porTurma).sort((a, b) => b.total - a.total),
      porTipo: Object.entries(porTipo).map(([t, count]) => ({
        tipo: t,
        label: AtendimentoAssistenteSocial.getTipoTarefaLabel(t),
        count
      })).sort((a, b) => b.count - a.count),
      porGravidade,
      // 🔥 NOVO: registros detalhados para CSV
      registros: atendimentos.map(a => ({
        id: a._id,
        alunoNome: a.alunoNome,
        alunoMatricula: a.alunoMatricula,
        alunoTurma: a.alunoTurma,
        tipoTarefa: a.tipoTarefa,
        tipoTarefaLabel: AtendimentoAssistenteSocial.getTipoTarefaLabel(a.tipoTarefa),
        dataEntrada: a.entrada.dataHora,
        dataFormatada: new Date(a.entrada.dataHora).toLocaleDateString('pt-BR'),
        descricao: a.entrada.descricao,
        gravidade: a.entrada.gravidade,
        prioridade: a.prioridade,
        status: a.status,
        temAssinatura: !!(a.entrada?.assinaturaBase64),
        registradoPorNome: a.entrada?.registradoPorNome
      })),
      // Retrocompatibilidade: mantém atendimentos
      atendimentos: atendimentos.slice(0, 100).map(a => ({
        id: a._id, alunoNome: a.alunoNome, alunoTurma: a.alunoTurma,
        tipoTarefa: a.tipoTarefa,
        tipoTarefaLabel: AtendimentoAssistenteSocial.getTipoTarefaLabel(a.tipoTarefa),
        dataEntrada: a.entrada.dataHora,
        descricao: a.entrada.descricao.substring(0, 100),
        gravidade: a.entrada.gravidade, status: a.status,
        temAssinatura: !!(a.entrada?.assinaturaBase64)
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro: ' + error.message });
  }
});

module.exports = router;