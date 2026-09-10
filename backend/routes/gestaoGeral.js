const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const RodizioRefeicao = require('../models/RodizioRefeicao');
const Atraso = require('../models/Atraso');

// Middleware de autenticação
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, error: 'Acesso negado. Token não fornecido.' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ success: false, error: 'Token inválido ou expirado.' });
    }
    req.userId = decoded.id;
    req.userRole = decoded.role;
    req.userNome = decoded.nome;
    next();
  });
};

const verificarGestaoGeral = (req, res, next) => {
  const allowedRoles = ['gestao_geral', 'super_admin', 'admin'];
  if (!allowedRoles.includes(req.userRole)) {
    return res.status(403).json({
      success: false,
      error: 'Acesso permitido apenas para Gestão Geral'
    });
  }
  next();
};

// ============================================
// HEALTH CHECK
// ============================================
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'online',
    service: 'Gestão Geral',
    timestamp: new Date().toISOString()
  });
});

// ============================================
// 📅 RODÍZIOS
// ============================================
router.get('/rodizios', authenticateToken, verificarGestaoGeral, async (req, res) => {
  try {
    const rodizios = await RodizioRefeicao.find().sort({ turma: 1 });
    const todasTurmas = await User.distinct('turma', { 
      role: 'aluno', ativo: true, 
      turma: { $nin: [null, '', 'Não informada'] } 
    });
    
    res.json({ success: true, rodizios, todasTurmas, total: rodizios.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/rodizios/:turma', authenticateToken, verificarGestaoGeral, async (req, res) => {
  try {
    const rodizio = await RodizioRefeicao.findOne({ turma: req.params.turma });
    res.json({ success: true, rodizio: rodizio || null });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/rodizios', authenticateToken, verificarGestaoGeral, async (req, res) => {
  try {
    const { turma, tipoRodizio, diasSemana, diasMes, semanasMes, horarioInicio, horarioFim, ativo, descricao } = req.body;
    
    if (!turma) {
      return res.status(400).json({ success: false, error: 'Turma é obrigatória' });
    }
    
    let rodizio = await RodizioRefeicao.findOne({ turma });
    
    if (rodizio) {
      rodizio.tipoRodizio = tipoRodizio || rodizio.tipoRodizio;
      rodizio.diasSemana = diasSemana !== undefined ? diasSemana : rodizio.diasSemana;
      rodizio.diasMes = diasMes !== undefined ? diasMes : rodizio.diasMes;
      rodizio.semanasMes = semanasMes !== undefined ? semanasMes : rodizio.semanasMes;
      rodizio.horarioInicio = horarioInicio || rodizio.horarioInicio;
      rodizio.horarioFim = horarioFim || rodizio.horarioFim;
      rodizio.ativo = ativo !== undefined ? ativo : rodizio.ativo;
      rodizio.descricao = descricao || rodizio.descricao;
      rodizio.atualizadoEm = new Date();
    } else {
      rodizio = new RodizioRefeicao({
        turma,
        tipoRodizio: tipoRodizio || 'semanal',
        diasSemana: diasSemana || [1, 2, 3, 4, 5],
        diasMes: diasMes || [],
        semanasMes: semanasMes || [1, 2, 3, 4],
        horarioInicio: horarioInicio || '11:00',
        horarioFim: horarioFim || '13:00',
        ativo: ativo !== false,
        descricao: descricao || '',
        criadoPor: req.userId
      });
    }
    
    await rodizio.save();
    res.json({ success: true, message: 'Rodízio salvo com sucesso!', rodizio });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/rodizios/:turma', authenticateToken, verificarGestaoGeral, async (req, res) => {
  try {
    const result = await RodizioRefeicao.deleteOne({ turma: req.params.turma });
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, error: 'Rodízio não encontrado' });
    }
    res.json({ success: true, message: 'Rodízio excluído com sucesso!' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/estatisticas', authenticateToken, verificarGestaoGeral, async (req, res) => {
  try {
    const totalRodizios = await RodizioRefeicao.countDocuments();
    const rodiziosAtivos = await RodizioRefeicao.countDocuments({ ativo: true });
    const rodiziosInativos = totalRodizios - rodiziosAtivos;
    
    const todasTurmas = await User.distinct('turma', { 
      role: 'aluno', ativo: true, 
      turma: { $nin: [null, '', 'Não informada'] } 
    });
    
    const turmasComRodizio = await RodizioRefeicao.distinct('turma', { ativo: true });
    const turmasSemRodizio = todasTurmas.filter(t => !turmasComRodizio.includes(t));
    
    res.json({
      success: true,
      estatisticas: {
        totalRodizios, rodiziosAtivos, rodiziosInativos,
        totalTurmas: todasTurmas.length,
        turmasComRodizio: turmasComRodizio.length,
        turmasSemRodizio: turmasSemRodizio.length,
        turmasSemRodizioLista: turmasSemRodizio
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ⏰ ATRAZOS - MÓDULO
// ============================================

// Turmas disponíveis
router.get('/atraso/turmas', authenticateToken, verificarGestaoGeral, async (req, res) => {
  try {
    const turmas = await User.distinct('turma', { 
      role: 'aluno', ativo: true, 
      turma: { $nin: [null, '', 'Não informada'] } 
    });
    res.json({ success: true, turmas: turmas.sort() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Alunos por turma
router.get('/atraso/alunos-por-turma', authenticateToken, verificarGestaoGeral, async (req, res) => {
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
    res.status(500).json({ success: false, error: error.message });
  }
});

// Buscar aluno por ID (QR Code)
router.get('/atraso/aluno/:id', authenticateToken, verificarGestaoGeral, async (req, res) => {
  try {
    const aluno = await User.findOne({ _id: req.params.id, ativo: true })
      .select('nome email matricula curso turma fotoPerfil role');
    
    if (!aluno) return res.status(404).json({ success: false, error: 'Aluno não encontrado' });
    if (aluno.role !== 'aluno') return res.status(400).json({ success: false, error: 'Usuário não é aluno' });
    
    const historicoRecente = await Atraso.find({ alunoId: aluno._id })
      .sort({ dataHora: -1 }).limit(5);
    
    const totalAtrasos = await Atraso.countDocuments({ alunoId: aluno._id });
    
    const trintaDias = new Date();
    trintaDias.setDate(trintaDias.getDate() - 30);
    const atrasosUltimos30 = await Atraso.countDocuments({
      alunoId: aluno._id, dataHora: { $gte: trintaDias }
    });
    
    res.json({
      success: true,
      aluno: {
        id: aluno._id, nome: aluno.nome, matricula: aluno.matricula,
        turma: aluno.turma, curso: aluno.curso, fotoPerfil: aluno.fotoPerfil || null
      },
      estatisticas: { totalAtrasos, atrasosUltimos30 },
      historicoRecente: historicoRecente.map(a => ({
        id: a._id, motivo: a.motivo,
        motivoLabel: Atraso.getMotivoLabel(a.motivo),
        descricao: a.descricao, dataHora: a.dataHora
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Buscar aluno por nome/matrícula
router.get('/atraso/buscar-aluno', authenticateToken, verificarGestaoGeral, async (req, res) => {
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
    res.status(500).json({ success: false, error: error.message });
  }
});

// Registrar atraso
router.post('/atraso/registrar', authenticateToken, verificarGestaoGeral, async (req, res) => {
  try {
    const { alunoId, motivo, descricao, observacoes, detalhes } = req.body;
    
    if (!descricao || descricao.trim() === '') {
      return res.status(400).json({ success: false, error: 'A descrição é obrigatória' });
    }
    
    const motivosValidos = ['onibus', 'transito', 'problemas_pessoais', 'fardamento', 'outros'];
    if (!motivosValidos.includes(motivo)) {
      return res.status(400).json({ success: false, error: 'Motivo inválido' });
    }
    
    const aluno = await User.findById(alunoId);
    if (!aluno || aluno.role !== 'aluno') {
      return res.status(404).json({ success: false, error: 'Aluno não encontrado' });
    }
    
    const gestor = await User.findById(req.userId).select('nome');
    
    const atraso = new Atraso({
      alunoId: aluno._id,
      alunoNome: aluno.nome,
      alunoMatricula: aluno.matricula,
      alunoTurma: aluno.turma || 'Não informada',
      alunoCurso: aluno.curso || 'Não informado',
      alunoFoto: aluno.fotoPerfil,
      motivo,
      dataHora: new Date(),
      descricao: descricao.trim(),
      observacoes: observacoes || '',
      detalhes: detalhes || {},
      registradoPor: req.userId,
      registradoPorNome: gestor?.nome || req.userNome || 'Gestão Geral'
    });
    
    await atraso.save();
    
    res.json({
      success: true,
      message: `Atraso registrado para ${aluno.nome}`,
      atraso: {
        id: atraso._id,
        motivo: atraso.motivo,
        motivoLabel: Atraso.getMotivoLabel(motivo),
        dataHora: atraso.dataHora
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Dashboard de atrasos
router.get('/atraso/dashboard', authenticateToken, verificarGestaoGeral, async (req, res) => {
  try {
    const hoje = new Date();
    const hojeStr = hoje.toISOString().split('T')[0];
    const inicioSemana = new Date(hoje);
    inicioSemana.setDate(hoje.getDate() - hoje.getDay());
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const ultimos30Dias = new Date();
    ultimos30Dias.setDate(ultimos30Dias.getDate() - 30);
    
    const [atrasosHoje, atrasosSemana, atrasosMes, total] = await Promise.all([
      Atraso.countDocuments({
        dataHora: {
          $gte: new Date(hojeStr),
          $lt: new Date(new Date(hojeStr).setDate(new Date(hojeStr).getDate() + 1))
        }
      }),
      Atraso.countDocuments({ dataHora: { $gte: inicioSemana } }),
      Atraso.countDocuments({ dataHora: { $gte: inicioMes } }),
      Atraso.countDocuments()
    ]);
    
    const porMotivo = await Atraso.aggregate([
      { $match: { dataHora: { $gte: ultimos30Dias } } },
      { $group: { _id: '$motivo', count: { $sum: 1 } } },
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
      
      const count = await Atraso.countDocuments({ dataHora: { $gte: inicio, $lt: fim } });
      ultimos7Dias.push({
        data: dataStr,
        dia: data.toLocaleDateString('pt-BR', { weekday: 'short' }),
        atrasos: count
      });
    }
    
    const porTurma = await Atraso.aggregate([
      { $match: { dataHora: { $gte: ultimos30Dias } } },
      { $group: { _id: '$alunoTurma', count: { $sum: 1 } } },
      { $sort: { count: -1 } }, { $limit: 8 }
    ]);
    
    const alunosReincidentes = await Atraso.aggregate([
      { $match: { dataHora: { $gte: ultimos30Dias } } },
      { $group: {
        _id: '$alunoId',
        alunoNome: { $first: '$alunoNome' },
        alunoTurma: { $first: '$alunoTurma' },
        count: { $sum: 1 }
      }},
      { $match: { count: { $gte: 3 } } },
      { $sort: { count: -1 } }, { $limit: 10 }
    ]);
    
    res.json({
      success: true,
      metricas: { hoje: atrasosHoje, semana: atrasosSemana, mes: atrasosMes, total },
      porMotivo: porMotivo.map(m => ({
        motivo: m._id,
        label: Atraso.getMotivoLabel(m._id),
        count: m.count
      })),
      tendencias: {
        ultimos7Dias,
        porTurma: porTurma.map(t => ({ turma: t._id || 'Sem turma', count: t.count })),
        alunosReincidentes
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Listar atrasos
router.get('/atraso/listar', authenticateToken, verificarGestaoGeral, async (req, res) => {
  try {
    const { limit = 100, page = 1, motivo, turma, dataInicio, dataFim } = req.query;
    
    let query = {};
    if (motivo && motivo !== 'todos') query.motivo = motivo;
    if (turma && turma !== 'todas') query.alunoTurma = turma;
    if (dataInicio || dataFim) {
      query.dataHora = {};
      if (dataInicio) query.dataHora.$gte = new Date(dataInicio);
      if (dataFim) query.dataHora.$lte = new Date(dataFim + 'T23:59:59');
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [atrasos, total] = await Promise.all([
      Atraso.find(query).sort({ dataHora: -1 }).skip(skip).limit(parseInt(limit)),
      Atraso.countDocuments(query)
    ]);
    
    res.json({
      success: true,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      atrasos: atrasos.map(a => ({
        id: a._id,
        alunoId: a.alunoId,
        alunoNome: a.alunoNome,
        alunoMatricula: a.alunoMatricula,
        alunoTurma: a.alunoTurma,
        alunoCurso: a.alunoCurso,
        motivo: a.motivo,
        motivoLabel: Atraso.getMotivoLabel(a.motivo),
        descricao: a.descricao,
        observacoes: a.observacoes,
        dataHora: a.dataHora,
        dataHoraFormatada: new Date(a.dataHora).toLocaleString('pt-BR'),
        registradoPor: a.registradoPorNome
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Excluir atraso
router.delete('/atraso/:id', authenticateToken, verificarGestaoGeral, async (req, res) => {
  try {
    const atraso = await Atraso.findByIdAndDelete(req.params.id);
    if (!atraso) return res.status(404).json({ success: false, error: 'Atraso não encontrado' });
    res.json({ success: true, message: 'Atraso excluído com sucesso' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Relatório por aluno
router.get('/atraso/relatorio/aluno/:alunoId', authenticateToken, verificarGestaoGeral, async (req, res) => {
  try {
    const { dataInicio, dataFim } = req.query;
    
    let query = { alunoId: req.params.alunoId };
    if (dataInicio || dataFim) {
      query.dataHora = {};
      if (dataInicio) query.dataHora.$gte = new Date(dataInicio);
      if (dataFim) query.dataHora.$lte = new Date(dataFim + 'T23:59:59');
    }
    
    const atrasos = await Atraso.find(query).sort({ dataHora: -1 });
    const aluno = await User.findById(req.params.alunoId).select('nome matricula turma curso');
    
    const porMotivo = {};
    atrasos.forEach(a => {
      porMotivo[a.motivo] = (porMotivo[a.motivo] || 0) + 1;
    });
    
    res.json({
      success: true,
      aluno: { id: aluno._id, nome: aluno.nome, matricula: aluno.matricula,
        turma: aluno.turma, curso: aluno.curso },
      periodo: { dataInicio, dataFim },
      estatisticas: {
        totalAtrasos: atrasos.length,
        porMotivo: Object.entries(porMotivo).map(([m, c]) => ({
          motivo: m, label: Atraso.getMotivoLabel(m), count: c
        }))
      },
      atrasos: atrasos.map(a => ({
        id: a._id, motivo: a.motivo,
        motivoLabel: Atraso.getMotivoLabel(a.motivo),
        dataHora: a.dataHora, descricao: a.descricao,
        observacoes: a.observacoes, registradoPor: a.registradoPorNome
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Relatório por turma
router.get('/atraso/relatorio/turma/:turma', authenticateToken, verificarGestaoGeral, async (req, res) => {
  try {
    const { dataInicio, dataFim } = req.query;
    
    let query = { alunoTurma: req.params.turma };
    if (dataInicio || dataFim) {
      query.dataHora = {};
      if (dataInicio) query.dataHora.$gte = new Date(dataInicio);
      if (dataFim) query.dataHora.$lte = new Date(dataFim + 'T23:59:59');
    }
    
    const atrasos = await Atraso.find(query).sort({ dataHora: -1 });
    
    const porAluno = {};
    atrasos.forEach(a => {
      const key = a.alunoId.toString();
      if (!porAluno[key]) {
        porAluno[key] = {
          alunoId: a.alunoId, alunoNome: a.alunoNome,
          alunoMatricula: a.alunoMatricula, total: 0, motivos: {}
        };
      }
      porAluno[key].total++;
      porAluno[key].motivos[a.motivo] = (porAluno[key].motivos[a.motivo] || 0) + 1;
    });
    
    res.json({
      success: true,
      turma: req.params.turma,
      periodo: { dataInicio, dataFim },
      estatisticas: {
        totalAtrasos: atrasos.length,
        totalAlunos: Object.keys(porAluno).length
      },
      porAluno: Object.values(porAluno).sort((a, b) => b.total - a.total),
      atrasos: atrasos.slice(0, 100).map(a => ({
        id: a._id, alunoNome: a.alunoNome, motivo: a.motivo,
        motivoLabel: Atraso.getMotivoLabel(a.motivo),
        dataHora: a.dataHora, descricao: a.descricao
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Relatório geral
router.get('/atraso/relatorio/geral', authenticateToken, verificarGestaoGeral, async (req, res) => {
  try {
    const { dataInicio, dataFim, turma, motivo } = req.query;
    
    let query = {};
    if (turma && turma !== 'todas') query.alunoTurma = turma;
    if (motivo && motivo !== 'todos') query.motivo = motivo;
    if (dataInicio || dataFim) {
      query.dataHora = {};
      if (dataInicio) query.dataHora.$gte = new Date(dataInicio);
      if (dataFim) query.dataHora.$lte = new Date(dataFim + 'T23:59:59');
    }
    
    const atrasos = await Atraso.find(query).sort({ dataHora: -1 });
    
    const porTurma = {};
    const porMotivo = {};
    
    atrasos.forEach(a => {
      if (!porTurma[a.alunoTurma]) {
        porTurma[a.alunoTurma] = { turma: a.alunoTurma, total: 0, alunos: new Set() };
      }
      porTurma[a.alunoTurma].total++;
      porTurma[a.alunoTurma].alunos.add(a.alunoId.toString());
      
      porMotivo[a.motivo] = (porMotivo[a.motivo] || 0) + 1;
    });
    
    Object.values(porTurma).forEach(t => {
      t.totalAlunos = t.alunos.size;
      delete t.alunos;
    });
    
    const turmasAtendimento = await Atraso.distinct('alunoTurma');
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
      filtros: { dataInicio, dataFim, turma, motivo },
      turmasDisponiveis: turmas,
      totalAtrasos: atrasos.length,
      porTurma: Object.values(porTurma).sort((a, b) => b.total - a.total),
      porMotivo: Object.entries(porMotivo).map(([m, c]) => ({
        motivo: m, label: Atraso.getMotivoLabel(m), count: c
      })).sort((a, b) => b.count - a.count),
      atrasos: atrasos.slice(0, 100).map(a => ({
        id: a._id, alunoNome: a.alunoNome, alunoTurma: a.alunoTurma,
        motivo: a.motivo, motivoLabel: Atraso.getMotivoLabel(a.motivo),
        dataHora: a.dataHora, descricao: a.descricao.substring(0, 100),
        registradoPor: a.registradoPorNome
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;