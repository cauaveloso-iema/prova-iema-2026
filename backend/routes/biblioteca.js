const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AtendimentoBiblioteca = require('../models/AtendimentoBiblioteca');

// ============================================
// MIDDLEWARES
// ============================================
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

const verificarBiblioteca = (req, res, next) => {
  const allowedRoles = ['biblioteca', 'super_admin', 'admin'];
  if (!allowedRoles.includes(req.userRole)) {
    return res.status(403).json({
      success: false,
      error: 'Acesso permitido apenas para Biblioteca'
    });
  }
  next();
};

// ============================================
// HELPER: FILTRO DE DATA COM TIMEZONE DE BRASÍLIA
// ============================================
/**
 * Monta o filtro de data considerando o timezone de Brasília (GMT-3).
 * Evita o bug de `new Date('YYYY-MM-DD')` que é interpretado como UTC.
 */
function montarFiltroData(dataInicio, dataFim) {
  const filtro = {};

  if (dataInicio) {
    // Se já vier com T (ISO completo), usa direto. Senão, força 00:00:00 de Brasília
    const inicioFormatado = dataInicio.includes('T')
      ? dataInicio
      : `${dataInicio}T00:00:00.000-03:00`;
    filtro.$gte = new Date(inicioFormatado);
  }

  if (dataFim) {
    // Se já vier com T (ISO completo), usa direto. Senão, força 23:59:59.999 de Brasília
    const fimFormatado = dataFim.includes('T')
      ? dataFim
      : `${dataFim}T23:59:59.999-03:00`;
    filtro.$lte = new Date(fimFormatado);
  }

  return filtro;
}

// ============================================
// HEALTH CHECK
// ============================================
router.get('/health', (req, res) => {
  res.json({ success: true, status: 'online', service: 'Biblioteca' });
});

// ============================================
// TURMAS
// ============================================
router.get('/turmas', authenticateToken, verificarBiblioteca, async (req, res) => {
  try {
    const turmas = await User.distinct('turma', {
      role: 'aluno',
      ativo: true,
      turma: { $nin: [null, '', 'Não informada', 'Nao informada', 'não informada', 'nao informada'] }
    });

    const turmasLimpas = turmas
      .filter(t => t && String(t).trim() !== '')
      .map(t => String(t).trim())
      .sort();

    res.json({ success: true, turmas: turmasLimpas });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ALUNOS POR TURMA
// ============================================
router.get('/alunos-por-turma', authenticateToken, verificarBiblioteca, async (req, res) => {
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
        id: a._id,
        nome: a.nome,
        matricula: a.matricula,
        turma: a.turma,
        curso: a.curso,
        fotoPerfil: a.fotoPerfil
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// BUSCAR ALUNO
// ============================================
router.get('/aluno/:id', authenticateToken, verificarBiblioteca, async (req, res) => {
  try {
    const aluno = await User.findById(req.params.id)
      .select('nome matricula turma curso fotoPerfil role');

    if (!aluno) return res.status(404).json({ success: false, error: 'Aluno não encontrado' });

    const visitaAtiva = await AtendimentoBiblioteca.getVisitaAtiva(aluno._id);
    const totalVisitas = await AtendimentoBiblioteca.countDocuments({
      alunoId: aluno._id,
      status: 'finalizado'
    });
    const visitasMes = await AtendimentoBiblioteca.countDocuments({
      alunoId: aluno._id,
      status: 'finalizado',
      createdAt: {
        $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      }
    });

    res.json({
      success: true,
      aluno: {
        id: aluno._id,
        nome: aluno.nome,
        matricula: aluno.matricula,
        turma: aluno.turma,
        curso: aluno.curso,
        fotoPerfil: aluno.fotoPerfil
      },
      emVisita: !!visitaAtiva,
      visitaAtiva: visitaAtiva ? {
        id: visitaAtiva._id,
        dataHoraEntrada: visitaAtiva.entrada.dataHora,
        motivoVisita: visitaAtiva.motivoVisita,
        motivoVisitaLabel: AtendimentoBiblioteca.getMotivoLabel(visitaAtiva.motivoVisita),
        atividades: visitaAtiva.atividades,
        observacoes: visitaAtiva.entrada.observacoes
      } : null,
      estatisticas: { totalVisitas, visitasMes }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// REGISTRAR ENTRADA
// ============================================
router.post('/entrada', authenticateToken, verificarBiblioteca, async (req, res) => {
  try {
    const {
      alunoId,
      motivoVisita,
      motivoOutros,
      atividades,
      atividadesOutros,
      observacoes,
      visitanteExterno,
      visitanteNome,
      visitanteDocumento,
      visitanteInstituicao,
      dataEntrada
    } = req.body;

    if (!motivoVisita) {
      return res.status(400).json({ success: false, error: 'Motivo da visita é obrigatório' });
    }
    if (motivoVisita === 'outros' && !motivoOutros) {
      return res.status(400).json({ success: false, error: 'Especifique o motivo "Outros"' });
    }

    let alunoData = null;
    if (alunoId && !visitanteExterno) {
      alunoData = await User.findById(alunoId);
      if (!alunoData) return res.status(404).json({ success: false, error: 'Aluno não encontrado' });

      const visitaAtiva = await AtendimentoBiblioteca.getVisitaAtiva(alunoId);
      if (visitaAtiva) {
        return res.status(400).json({
          success: false,
          error: 'Este aluno já está registrado. Registre a saída primeiro.'
        });
      }
    } else if (visitanteExterno && !visitanteNome) {
      return res.status(400).json({ success: false, error: 'Nome do visitante é obrigatório' });
    } else if (!alunoId && !visitanteExterno) {
      return res.status(400).json({ success: false, error: 'Aluno ou visitante é obrigatório' });
    }

    const dataHoraEntrada = dataEntrada ? new Date(dataEntrada) : new Date();
    if (dataHoraEntrada > new Date()) {
      return res.status(400).json({ success: false, error: 'Data de entrada não pode ser futura' });
    }

    const atendimento = new AtendimentoBiblioteca({
      alunoId: alunoData ? alunoData._id : null,
      alunoNome: alunoData ? alunoData.nome : visitanteNome,
      alunoMatricula: alunoData ? (alunoData.matricula || '') : (visitanteDocumento || ''),
      alunoTurma: alunoData ? (alunoData.turma || '') : '',
      alunoCurso: alunoData ? (alunoData.curso || '') : '',
      alunoFoto: alunoData ? (alunoData.fotoPerfil || '') : '',
      visitanteExterno: !!visitanteExterno,
      visitanteDocumento: visitanteDocumento || '',
      visitanteInstituicao: visitanteInstituicao || '',
      motivoVisita,
      motivoOutros: motivoOutros || '',
      atividades: Array.isArray(atividades) ? atividades : [],
      atividadesOutros: atividadesOutros || '',
      entrada: {
        dataHora: dataHoraEntrada,
        registradoPor: req.userId,
        registradoPorNome: req.userNome || 'Biblioteca',
        observacoes: observacoes || ''
      },
      status: 'em_visita'
    });

    await atendimento.save();

    res.json({
      success: true,
      message: 'Entrada registrada com sucesso!',
      atendimento: {
        id: atendimento._id,
        alunoNome: atendimento.alunoNome,
        motivoVisita: AtendimentoBiblioteca.getMotivoLabel(atendimento.motivoVisita),
        dataHoraEntrada: atendimento.entrada.dataHora
      }
    });
  } catch (error) {
    console.error('Erro ao registrar entrada:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// REGISTRAR SAÍDA
// ============================================
router.post('/saida', authenticateToken, verificarBiblioteca, async (req, res) => {
  try {
    const {
      alunoId, atendimentoId, observacoes,
      livrosConsultados, livrosEmprestados,
      computadoresUsados, satisfacao
    } = req.body;

    let atendimento = null;
    if (atendimentoId) atendimento = await AtendimentoBiblioteca.findById(atendimentoId);
    else if (alunoId) atendimento = await AtendimentoBiblioteca.getVisitaAtiva(alunoId);

    if (!atendimento) {
      return res.status(404).json({ success: false, error: 'Nenhuma visita ativa encontrada' });
    }
    if (atendimento.status !== 'em_visita') {
      return res.status(400).json({ success: false, error: 'Esta visita já foi finalizada' });
    }

    await atendimento.finalizarVisita({
      registradoPor: req.userId,
      registradoPorNome: req.userNome || 'Biblioteca',
      observacoes: observacoes || '',
      livrosConsultados: livrosConsultados || [],
      livrosEmprestados: livrosEmprestados || [],
      computadoresUsados: computadoresUsados || 0,
      satisfacao: satisfacao || null
    });

    res.json({
      success: true,
      message: 'Saída registrada com sucesso!',
      atendimento: {
        id: atendimento._id,
        alunoNome: atendimento.alunoNome,
        duracaoMinutos: atendimento.duracaoMinutos,
        dataHoraSaida: atendimento.saida.dataHora
      }
    });
  } catch (error) {
    console.error('Erro ao registrar saída:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ATENDIMENTOS ATIVOS
// ============================================
router.get('/atendimentos-ativos', authenticateToken, verificarBiblioteca, async (req, res) => {
  try {
    const ativos = await AtendimentoBiblioteca.find({ status: 'em_visita' })
      .sort({ 'entrada.dataHora': -1 });
    const agora = new Date();

    res.json({
      success: true,
      total: ativos.length,
      atendimentos: ativos.map(a => {
        const minutos = Math.round((agora - new Date(a.entrada.dataHora)) / 60000);
        return {
          id: a._id,
          alunoId: a.alunoId,
          alunoNome: a.alunoNome,
          alunoMatricula: a.alunoMatricula,
          alunoTurma: a.alunoTurma,
          alunoFoto: a.alunoFoto,
          motivoVisita: a.motivoVisita,
          motivoLabel: AtendimentoBiblioteca.getMotivoLabel(a.motivoVisita),
          atividades: a.atividades.map(x => AtendimentoBiblioteca.getAtividadeLabel(x)),
          queixa: a.entrada.observacoes,
          dataHoraEntrada: a.entrada.dataHora,
          tempoAtendimento: minutos
        };
      })
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// LISTAR ATENDIMENTOS
// ============================================
router.get('/listar', authenticateToken, verificarBiblioteca, async (req, res) => {
  try {
    const {
      alunoNome, turma, motivo, status,
      dataInicio, dataFim,
      limit = 50, page = 1
    } = req.query;

    const query = {};

    if (alunoNome) query.alunoNome = { $regex: alunoNome, $options: 'i' };
    if (turma) query.alunoTurma = turma;
    if (motivo) query.motivoVisita = motivo;
    if (status) query.status = status;

    if (dataInicio || dataFim) {
      query['entrada.dataHora'] = montarFiltroData(dataInicio, dataFim);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await AtendimentoBiblioteca.countDocuments(query);

    const atendimentos = await AtendimentoBiblioteca.find(query)
      .sort({ 'entrada.dataHora': -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.json({
      success: true,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      atendimentos: atendimentos.map(a => ({
        id: a._id,
        alunoNome: a.alunoNome,
        alunoMatricula: a.alunoMatricula,
        alunoTurma: a.alunoTurma,
        alunoCurso: a.alunoCurso,
        alunoFoto: a.alunoFoto,
        motivoVisita: a.motivoVisita,
        motivoLabel: AtendimentoBiblioteca.getMotivoLabel(a.motivoVisita),
        motivoOutros: a.motivoOutros,
        atividades: a.atividades,
        atividadesLabels: a.atividades.map(x => AtendimentoBiblioteca.getAtividadeLabel(x)),
        dataHora: a.entrada.dataHora,
        dataHoraFormatada: new Date(a.entrada.dataHora).toLocaleString('pt-BR'),
        dataHoraSaida: a.saida?.dataHora || null,
        duracaoMinutos: a.duracaoMinutos,
        status: a.status,
        registradoPor: a.entrada.registradoPorNome
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// BUSCAR ATENDIMENTO
// ============================================
router.get('/atendimento/:id', authenticateToken, verificarBiblioteca, async (req, res) => {
  try {
    const a = await AtendimentoBiblioteca.findById(req.params.id);
    if (!a) return res.status(404).json({ success: false, error: 'Atendimento não encontrado' });

    res.json({
      success: true,
      atendimento: {
        id: a._id,
        alunoId: a.alunoId,
        alunoNome: a.alunoNome,
        alunoMatricula: a.alunoMatricula,
        alunoTurma: a.alunoTurma,
        alunoCurso: a.alunoCurso,
        alunoFoto: a.alunoFoto,
        status: a.status,
        motivoVisita: a.motivoVisita,
        motivoLabel: AtendimentoBiblioteca.getMotivoLabel(a.motivoVisita),
        motivoOutros: a.motivoOutros,
        atividades: a.atividades,
        atividadesLabels: a.atividades.map(x => AtendimentoBiblioteca.getAtividadeLabel(x)),
        entrada: {
          dataHora: a.entrada.dataHora,
          dataHoraFormatada: new Date(a.entrada.dataHora).toLocaleString('pt-BR'),
          registradoPorNome: a.entrada.registradoPorNome,
          observacoes: a.entrada.observacoes,
          editadoEm: a.entrada.editadoEm,
          editadoPorNome: a.entrada.editadoPorNome
        },
        saida: a.saida?.dataHora ? {
          dataHora: a.saida.dataHora,
          dataHoraFormatada: new Date(a.saida.dataHora).toLocaleString('pt-BR'),
          registradoPorNome: a.saida.registradoPorNome,
          observacoes: a.saida.observacoes,
          livrosConsultados: a.saida.livrosConsultados,
          livrosEmprestados: a.saida.livrosEmprestados,
          computadoresUsados: a.saida.computadoresUsados,
          satisfacao: a.saida.satisfacao
        } : null,
        duracaoMinutos: a.duracaoMinutos,
        createdAt: a.createdAt
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// EDITAR ATENDIMENTO
// ============================================
router.put('/atendimento/:id', authenticateToken, verificarBiblioteca, async (req, res) => {
  try {
    const atendimento = await AtendimentoBiblioteca.findById(req.params.id);
    if (!atendimento) return res.status(404).json({ success: false, error: 'Atendimento não encontrado' });

    const { motivoVisita, motivoOutros, atividades, atividadesOutros, observacoes, dataEntrada } = req.body;

    if (motivoVisita) atendimento.motivoVisita = motivoVisita;
    if (motivoOutros !== undefined) atendimento.motivoOutros = motivoOutros;
    if (atividades !== undefined) atendimento.atividades = atividades;
    if (atividadesOutros !== undefined) atendimento.atividadesOutros = atividadesOutros;
    if (observacoes !== undefined) atendimento.entrada.observacoes = observacoes;
    if (dataEntrada) {
      const novaData = new Date(dataEntrada);
      if (novaData > new Date()) {
        return res.status(400).json({ success: false, error: 'Data não pode ser futura' });
      }
      atendimento.entrada.dataHora = novaData;
    }

    atendimento.entrada.editadoEm = new Date();
    atendimento.entrada.editadoPor = req.userId;
    atendimento.entrada.editadoPorNome = req.userNome || 'Biblioteca';
    atendimento.updatedAt = new Date();

    await atendimento.save();
    res.json({ success: true, message: 'Atendimento atualizado', atendimento });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// EXCLUIR ATENDIMENTO
// ============================================
router.delete('/atendimento/:id', authenticateToken, verificarBiblioteca, async (req, res) => {
  try {
    const atendimento = await AtendimentoBiblioteca.findByIdAndDelete(req.params.id);
    if (!atendimento) return res.status(404).json({ success: false, error: 'Atendimento não encontrado' });
    res.json({ success: true, message: 'Atendimento excluído com sucesso' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// DASHBOARD
// ============================================
router.get('/dashboard', authenticateToken, verificarBiblioteca, async (req, res) => {
  try {
    const agora = new Date();
    const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
    const inicioSemana = new Date(agora); inicioSemana.setDate(agora.getDate() - 7);
    const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);

    const [hoje, semana, mes, total] = await Promise.all([
      AtendimentoBiblioteca.countDocuments({ 'entrada.dataHora': { $gte: inicioHoje } }),
      AtendimentoBiblioteca.countDocuments({ 'entrada.dataHora': { $gte: inicioSemana } }),
      AtendimentoBiblioteca.countDocuments({ 'entrada.dataHora': { $gte: inicioMes } }),
      AtendimentoBiblioteca.countDocuments()
    ]);

    const ultimos7Dias = await AtendimentoBiblioteca.aggregate([
      { $match: { 'entrada.dataHora': { $gte: inicioSemana } } },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$entrada.dataHora' } },
        visitas: { $sum: 1 }
      }},
      { $sort: { _id: 1 } }
    ]);

    const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const tendencias7Dias = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      const found = ultimos7Dias.find(x => x._id === key);
      tendencias7Dias.push({ dia: diasSemana[d.getDay()], visitas: found ? found.visitas : 0 });
    }

    const porMotivo = await AtendimentoBiblioteca.aggregate([
      { $match: { 'entrada.dataHora': { $gte: inicioMes } } },
      { $group: { _id: '$motivoVisita', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    const porTurma = await AtendimentoBiblioteca.aggregate([
      { $match: { 'entrada.dataHora': { $gte: inicioMes }, alunoTurma: { $ne: '' } } },
      { $group: { _id: '$alunoTurma', total: { $sum: 1 } } },
      { $sort: { total: -1 } },
      { $limit: 10 }
    ]);

    const visitasMes = await AtendimentoBiblioteca.find({
      'entrada.dataHora': { $gte: inicioMes }
    }).select('entrada.dataHora');

    const distribuicaoHoraria = new Array(24).fill(0);
    visitasMes.forEach(v => {
      const hora = new Date(v.entrada.dataHora).getHours();
      distribuicaoHoraria[hora]++;
    });

    const alunosFrequentes = await AtendimentoBiblioteca.aggregate([
      { $match: { 'entrada.dataHora': { $gte: inicioMes }, alunoId: { $ne: null } } },
      { $group: {
        _id: '$alunoId',
        alunoNome: { $first: '$alunoNome' },
        alunoTurma: { $first: '$alunoTurma' },
        count: { $sum: 1 }
      }},
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);

    res.json({
      success: true,
      metricas: { hoje, semana, mes, total },
      tendencias: {
        ultimos7Dias: tendencias7Dias,
        porMotivo: porMotivo.map(m => ({
          motivo: m._id,
          label: AtendimentoBiblioteca.getMotivoLabel(m._id),
          count: m.count
        })),
        porTurma: porTurma.map(t => ({ turma: t._id, total: t.total })),
        distribuicaoHoraria,
        alunosFrequentes
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// RELATÓRIO GERAL
// ============================================
router.get('/relatorio/geral', authenticateToken, verificarBiblioteca, async (req, res) => {
  try {
    const { dataInicio, dataFim } = req.query;
    const match = {};

    if (dataInicio || dataFim) {
      match['entrada.dataHora'] = montarFiltroData(dataInicio, dataFim);
    }

    const totalVisitas = await AtendimentoBiblioteca.countDocuments(match);
    const turmasDisponiveis = await User.distinct('turma', {
      role: 'aluno', ativo: true,
      turma: { $nin: [null, '', 'Não informada', 'Nao informada'] }
    });

    const porTurma = await AtendimentoBiblioteca.aggregate([
      { $match: { ...match, alunoTurma: { $ne: '' } } },
      { $group: {
        _id: '$alunoTurma',
        total: { $sum: 1 },
        alunos: { $addToSet: '$alunoId' }
      }},
      { $sort: { total: -1 } }
    ]);

    const porMotivo = await AtendimentoBiblioteca.aggregate([
      { $match: match },
      { $group: { _id: '$motivoVisita', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    const ultimos = await AtendimentoBiblioteca.find(match)
      .sort({ 'entrada.dataHora': -1 })
      .limit(20);

    res.json({
      success: true,
      totalAtendimentos: totalVisitas,
      turmasDisponiveis: turmasDisponiveis
        .filter(t => t && String(t).trim() !== '')
        .map(t => String(t).trim())
        .sort(),
      porTurma: porTurma.map(t => ({
        turma: t._id,
        total: t.total,
        totalAlunos: t.alunos.filter(x => x).length
      })),
      porMotivo: porMotivo.map(m => ({
        motivo: m._id,
        label: AtendimentoBiblioteca.getMotivoLabel(m._id),
        count: m.count
      })),
      ultimosAtendimentos: ultimos.map(a => ({
        id: a._id,
        alunoNome: a.alunoNome,
        alunoTurma: a.alunoTurma,
        motivoLabel: AtendimentoBiblioteca.getMotivoLabel(a.motivoVisita),
        dataEntrada: a.entrada.dataHora,
        status: a.status,
        duracao: a.duracaoMinutos
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// RELATÓRIO POR TURMA
// ============================================
router.get('/relatorio/turma/:turma', authenticateToken, verificarBiblioteca, async (req, res) => {
  try {
    const { turma } = req.params;
    const { dataInicio, dataFim } = req.query;
    const match = { alunoTurma: turma };

    if (dataInicio || dataFim) {
      match['entrada.dataHora'] = montarFiltroData(dataInicio, dataFim);
    }

    const total = await AtendimentoBiblioteca.countDocuments(match);
    const porAluno = await AtendimentoBiblioteca.aggregate([
      { $match: match },
      { $group: {
        _id: '$alunoId',
        alunoNome: { $first: '$alunoNome' },
        alunoMatricula: { $first: '$alunoMatricula' },
        total: { $sum: 1 }
      }},
      { $sort: { total: -1 } }
    ]);

    const ultimos = await AtendimentoBiblioteca.find(match)
      .sort({ 'entrada.dataHora': -1 })
      .limit(20);

    res.json({
      success: true,
      turma,
      estatisticas: { totalAtendimentos: total, totalAlunosAtendidos: porAluno.length },
      porAluno: porAluno.map(a => ({
        alunoNome: a.alunoNome,
        alunoMatricula: a.alunoMatricula,
        total: a.total
      })),
      ultimosAtendimentos: ultimos.map(a => ({
        alunoNome: a.alunoNome,
        dataEntrada: a.entrada.dataHora,
        motivo: AtendimentoBiblioteca.getMotivoLabel(a.motivoVisita),
        duracao: a.duracaoMinutos
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// RELATÓRIO POR ALUNO
// ============================================
router.get('/relatorio/aluno/:alunoId', authenticateToken, verificarBiblioteca, async (req, res) => {
  try {
    const { alunoId } = req.params;
    const { dataInicio, dataFim } = req.query;
    const match = { alunoId };

    if (dataInicio || dataFim) {
      match['entrada.dataHora'] = montarFiltroData(dataInicio, dataFim);
    }

    const aluno = await User.findById(alunoId).select('nome matricula turma curso');
    if (!aluno) return res.status(404).json({ success: false, error: 'Aluno não encontrado' });

    const atendimentos = await AtendimentoBiblioteca.find(match)
      .sort({ 'entrada.dataHora': -1 });

    const porMotivo = await AtendimentoBiblioteca.aggregate([
      { $match: match },
      { $group: { _id: '$motivoVisita', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    res.json({
      success: true,
      aluno: {
        id: aluno._id,
        nome: aluno.nome,
        matricula: aluno.matricula,
        turma: aluno.turma,
        curso: aluno.curso
      },
      estatisticas: { totalAtendimentos: atendimentos.length },
      porMotivo: porMotivo.map(m => ({
        label: AtendimentoBiblioteca.getMotivoLabel(m._id),
        count: m.count
      })),
      atendimentos: atendimentos.map(a => ({
        id: a._id,
        dataEntrada: a.entrada.dataHora,
        dataSaida: a.saida?.dataHora,
        motivo: AtendimentoBiblioteca.getMotivoLabel(a.motivoVisita),
        atividades: a.atividades.map(x => AtendimentoBiblioteca.getAtividadeLabel(x)),
        duracao: a.duracaoMinutos,
        observacoes: a.entrada.observacoes
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;