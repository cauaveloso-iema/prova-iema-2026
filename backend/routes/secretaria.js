// backend/routes/secretaria.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Autorizacao = require('../models/Autorizacao');

// ============================================
// MIDDLEWARES DE AUTENTICAÇÃO
// ============================================
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

const verificarSecretaria = (req, res, next) => {
  const allowedRoles = ['secretaria', 'super_admin', 'admin'];
  if (!allowedRoles.includes(req.userRole)) {
    return res.status(403).json({
      success: false,
      error: 'Acesso permitido apenas para Secretaria'
    });
  }
  next();
};

// ============================================
// HELPERS
// ============================================
const getMotivoLabel = (motivo) => {
  const labels = {
    'problemas_pessoais': 'Problemas Pessoais',
    'problemas_saude': 'Problemas de Saúde',
    'problemas_saude_responsavel_buscou': 'Problemas de Saúde (Responsável veio buscar)',
    'problemas_saude_responsavel_whatsapp': 'Problemas de Saúde (Responsável via WhatsApp)',
    'necessita_ausentar_retornar': 'Necessita se ausentar e retornar',
    'viagens': 'Viagens',
    'consultas': 'Consultas',
    'viagem': 'Viagem',
    'outros': 'Outros'
  };
  return labels[motivo] || motivo;
};

// Constrói o range de datas considerando timezone Brasil (UTC-3)
function construirRangeData(dataInicio, dataFim) {
  const inicio = new Date(dataInicio + 'T00:00:00.000-03:00');
  const fimStr = dataFim || dataInicio;
  const fim = new Date(fimStr + 'T23:59:59.999-03:00');
  return { inicio, fim, fimStr };
}

// 🔥 CONSTRÓI A CONDIÇÃO DE OVERLAP DE INTERVALOS
// Um registro deve aparecer se o período de falta dele SOBREPÕE
// o intervalo buscado. Fórmula:
//   periodoFaltaInicio <= fimBusca  E  periodoFaltaFim >= inicioBusca
function construirFiltroData(inicio, fim) {
  return {
    $or: [
      // Caso 1: tem início E fim → overlap completo
      {
        periodoFaltaInicio: { $lte: fim },
        periodoFaltaFim: { $gte: inicio }
      },
      // Caso 2: tem início, fim vazio/nulo → o início deve estar no range
      {
        periodoFaltaInicio: { $gte: inicio, $lte: fim },
        $or: [
          { periodoFaltaFim: null },
          { periodoFaltaFim: { $exists: false } }
        ]
      },
      // Caso 3: não tem periodoFaltaInicio → cai pra "data" (compatibilidade com registros antigos)
      {
        $or: [
          { periodoFaltaInicio: null },
          { periodoFaltaInicio: { $exists: false } }
        ],
        data: { $gte: inicio, $lte: fim }
      }
    ]
  };
}

// 🔥 Formata período da falta
function getPeriodoFaltaFormatado(doc) {
  if (!doc || !doc.periodoFaltaInicio) return null;
  
  const ini = new Date(doc.periodoFaltaInicio);
  const fim = doc.periodoFaltaFim ? new Date(doc.periodoFaltaFim) : ini;
  
  const iniDia = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate());
  const fimDia = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate());
  
  const fmt = (d) => d.toLocaleDateString('pt-BR');
  
  if (iniDia.getTime() === fimDia.getTime()) return fmt(iniDia);
  return `${fmt(iniDia)} a ${fmt(fimDia)}`;
}

// 🔥 Formata tipo de prova
function getTipoProvaPerdidaFormatado(doc) {
  if (!doc || !doc.tipoProvaPerdida) return null;
  if (doc.tipoProvaPerdida === 'Outros' && doc.tipoProvaPerdidaOutros) {
    return `Outros (${doc.tipoProvaPerdidaOutros})`;
  }
  return doc.tipoProvaPerdida;
}

// 🔥 Formata registro COMPLETO com todos os campos
function formatarRegistro(a) {
  const dataPrincipal = a.periodoFaltaInicio || a.data;
  
  return {
    id: a._id,
    alunoId: a.alunoId,
    alunoNome: a.alunoNome,
    alunoMatricula: a.alunoMatricula,
    alunoTurma: a.alunoTurma,
    alunoCurso: a.alunoCurso,
    
    data: a.data,
    dataFormatada: a.data ? new Date(a.data).toLocaleDateString('pt-BR') : '-',
    
    dataFalta: dataPrincipal,
    dataFaltaFormatada: dataPrincipal ? new Date(dataPrincipal).toLocaleDateString('pt-BR') : '-',
    
    periodoFaltaInicio: a.periodoFaltaInicio || null,
    periodoFaltaFim: a.periodoFaltaFim || null,
    periodoFaltaFormatado: getPeriodoFaltaFormatado(a),
    
    tipoProvaPerdida: a.tipoProvaPerdida || null,
    tipoProvaPerdidaOutros: a.tipoProvaPerdidaOutros || null,
    tipoProvaPerdidaFormatado: getTipoProvaPerdidaFormatado(a),
    
    motivo: a.motivo,
    motivoLabel: getMotivoLabel(a.motivo),
    motivoOutros: a.motivoOutros,
    observacoes: a.observacoes,
    responsavelNome: a.responsavelNome,
    responsavelCPF: a.responsavelCPF,
    responsavelTelefone: a.responsavelTelefone,
    temAssinatura: !!(a.assinaturaBase64 && a.assinaturaBase64.length > 50),
    origemTipo: a.origemTipo || null,
    origemId: a.origemId || null,
    registradoPor: a.registradoPorNome,
    registradoPorNome: a.registradoPorNome,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt
  };
}

// ============================================
// HEALTH CHECK
// ============================================
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'online',
    service: 'Secretaria',
    timestamp: new Date().toISOString()
  });
});

// ============================================
// 📋 CONSULTA DE JUSTIFICATIVAS
// ============================================

router.get('/justificativa/turmas', authenticateToken, verificarSecretaria, async (req, res) => {
  try {
    const turmas = await User.distinct('turma', {
      role: 'aluno',
      ativo: true,
      turma: { $nin: [null, '', 'Não informada'] }
    });
    res.json({ success: true, turmas: turmas.sort() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/justificativa/alunos-por-turma', authenticateToken, verificarSecretaria, async (req, res) => {
  try {
    const { turma } = req.query;
    if (!turma) {
      return res.status(400).json({ success: false, error: 'Turma é obrigatória' });
    }

    const alunos = await User.find({
      role: 'aluno',
      ativo: true,
      turma
    })
      .select('nome matricula turma curso fotoPerfil')
      .sort({ nome: 1 })
      .lean();

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

router.get('/justificativa/aluno/:id', authenticateToken, verificarSecretaria, async (req, res) => {
  try {
    const aluno = await User.findOne({ _id: req.params.id, ativo: true })
      .select('nome email matricula curso turma fotoPerfil role')
      .lean();

    if (!aluno) {
      return res.status(404).json({ success: false, error: 'Aluno não encontrado' });
    }
    if (aluno.role !== 'aluno') {
      return res.status(400).json({ success: false, error: 'Usuário não é aluno' });
    }

    const totalJustificativas = await Autorizacao.countDocuments({
      tipo: 'justificativa',
      alunoId: aluno._id
    });

    const trintaDias = new Date();
    trintaDias.setDate(trintaDias.getDate() - 30);
    const justificativasUltimos30 = await Autorizacao.countDocuments({
      tipo: 'justificativa',
      alunoId: aluno._id,
      data: { $gte: trintaDias }
    });

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
      estatisticas: {
        totalJustificativas,
        justificativosUltimos30: justificativasUltimos30,
        justificativasUltimos30
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 🔥 Buscar justificativas de um aluno (COM OVERLAP DE INTERVALO)
router.get('/justificativa/por-aluno/:alunoId', authenticateToken, verificarSecretaria, async (req, res) => {
  try {
    const { dataInicio, dataFim, motivo } = req.query;

    let query = {
      tipo: 'justificativa',
      alunoId: req.params.alunoId
    };

    if (motivo && motivo !== 'todos') {
      query.motivo = motivo;
    }

    // 🔥 Filtro por overlap de intervalo
    if (dataInicio || dataFim) {
      const { inicio, fim } = construirRangeData(dataInicio, dataFim);
      const filtroData = construirFiltroData(inicio, fim);
      
      // Mescla o $or do filtro com a query (se já tem $or, precisa combinar)
      Object.assign(query, filtroData);
    }

    const registros = await Autorizacao.find(query)
      .sort({ periodoFaltaInicio: -1, data: -1, createdAt: -1 })
      .lean();

    console.log(`🔍 [SECRETARIA] Justificativas do aluno ${req.params.alunoId}: ${registros.length} registros`);

    res.json({
      success: true,
      total: registros.length,
      registros: registros.map(formatarRegistro)
    });
  } catch (error) {
    console.error('Erro ao buscar justificativas do aluno:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/justificativa/listar', authenticateToken, verificarSecretaria, async (req, res) => {
  try {
    const {
      limit = 100,
      page = 1,
      alunoNome,
      turma,
      motivo,
      dataInicio,
      dataFim
    } = req.query;

    let query = { tipo: 'justificativa' };

    if (alunoNome && alunoNome.trim()) {
      query.alunoNome = { $regex: alunoNome.trim(), $options: 'i' };
    }
    if (turma && turma !== 'todas') {
      query.alunoTurma = turma;
    }
    if (motivo && motivo !== 'todos') {
      query.motivo = motivo;
    }

    // 🔥 Filtro por overlap de intervalo
    if (dataInicio || dataFim) {
      const { inicio, fim } = construirRangeData(dataInicio, dataFim);
      const filtroData = construirFiltroData(inicio, fim);
      Object.assign(query, filtroData);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [registros, total] = await Promise.all([
      Autorizacao.find(query)
        .sort({ periodoFaltaInicio: -1, data: -1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Autorizacao.countDocuments(query)
    ]);

    console.log(`📋 [SECRETARIA] Listando: ${total} registros`);

    res.json({
      success: true,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      registros: registros.map(formatarRegistro)
    });
  } catch (error) {
    console.error('Erro ao listar justificativas:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 🆕 BUSCAR JUSTIFICATIVAS POR DATA (COM OVERLAP DE INTERVALO)
// ============================================
router.get('/justificativa/por-data', authenticateToken, verificarSecretaria, async (req, res) => {
  try {
    const { dataInicio, dataFim, turma, motivo } = req.query;

    if (!dataInicio) {
      return res.status(400).json({ success: false, error: 'Data de início é obrigatória' });
    }

    const { inicio, fim, fimStr } = construirRangeData(dataInicio, dataFim);

    if (isNaN(inicio.getTime()) || isNaN(fim.getTime())) {
      return res.status(400).json({ success: false, error: 'Data inválida' });
    }

    if (fim < inicio) {
      return res.status(400).json({
        success: false,
        error: 'Data final não pode ser anterior à inicial'
      });
    }

    let query = { tipo: 'justificativa' };

    // 🔥 Filtro por overlap de intervalo
    const filtroData = construirFiltroData(inicio, fim);
    Object.assign(query, filtroData);

    if (turma && turma !== 'todas' && turma !== '') {
      query.alunoTurma = turma;
    }

    if (motivo && motivo !== 'todos' && motivo !== '') {
      query.motivo = motivo;
    }

    // 🔥 .lean() = SEMPRE dados frescos do banco (sem cache do Mongoose)
    const registros = await Autorizacao.find(query)
      .sort({ periodoFaltaInicio: -1, data: -1, createdAt: -1 })
      .limit(500)
      .lean();

    console.log(`📅 [SECRETARIA] Busca por data: ${dataInicio} a ${fimStr}`);
    console.log(`   → Encontrados: ${registros.length} registros`);

    res.json({
      success: true,
      total: registros.length,
      filtros: { dataInicio, dataFim: fimStr, turma: turma || null, motivo: motivo || null },
      registros: registros.map(formatarRegistro)
    });
  } catch (error) {
    console.error('Erro ao buscar por data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Buscar justificativa por ID
router.get('/justificativa/:id', authenticateToken, verificarSecretaria, async (req, res) => {
  try {
    const rotasReservadas = ['listar', 'turmas', 'dashboard', 'alunos-por-turma', 'por-data', 'buscar-alunos', 'relatorio'];
    if (rotasReservadas.includes(req.params.id)) {
      return res.status(404).json({ success: false, error: 'Rota não encontrada' });
    }

    if (!req.params.id.match(/^[a-f0-9]{24}$/i)) {
      return res.status(400).json({ success: false, error: 'ID inválido' });
    }

    const registro = await Autorizacao.findById(req.params.id).lean();

    if (!registro) {
      return res.status(404).json({ success: false, error: 'Justificativa não encontrada' });
    }

    if (registro.tipo !== 'justificativa') {
      return res.status(403).json({
        success: false,
        error: 'Acesso negado: este registro não é uma justificativa'
      });
    }

    res.json({
      success: true,
      autorizacao: {
        id: registro._id,
        tipo: registro.tipo,
        alunoId: registro.alunoId,
        alunoNome: registro.alunoNome,
        alunoMatricula: registro.alunoMatricula,
        alunoTurma: registro.alunoTurma,
        alunoCurso: registro.alunoCurso,
        alunoFoto: registro.alunoFoto,
        
        data: registro.data,
        dataFormatada: new Date(registro.data).toLocaleDateString('pt-BR'),
        
        periodoFaltaInicio: registro.periodoFaltaInicio || null,
        periodoFaltaFim: registro.periodoFaltaFim || null,
        periodoFaltaFormatado: getPeriodoFaltaFormatado(registro),
        
        tipoProvaPerdida: registro.tipoProvaPerdida || null,
        tipoProvaPerdidaOutros: registro.tipoProvaPerdidaOutros || null,
        tipoProvaPerdidaFormatado: getTipoProvaPerdidaFormatado(registro),
        
        motivo: registro.motivo,
        motivoLabel: getMotivoLabel(registro.motivo),
        motivoOutros: registro.motivoOutros,
        responsavelNome: registro.responsavelNome,
        responsavelCPF: registro.responsavelCPF,
        responsavelTelefone: registro.responsavelTelefone,
        observacoes: registro.observacoes,
        assinaturaBase64: registro.assinaturaBase64 || null,
        temAssinatura: !!(registro.assinaturaBase64 && registro.assinaturaBase64.length > 50),
        origemTipo: registro.origemTipo || null,
        origemId: registro.origemId || null,
        registradoPorNome: registro.registradoPorNome,
        createdAt: registro.createdAt,
        updatedAt: registro.updatedAt
      }
    });
  } catch (error) {
    console.error('Erro ao buscar justificativa:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/justificativa/buscar-alunos', authenticateToken, verificarSecretaria, async (req, res) => {
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
      .sort({ nome: 1 })
      .lean();

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
// 📊 RELATÓRIOS
// ============================================

router.get('/justificativa/relatorio/geral', authenticateToken, verificarSecretaria, async (req, res) => {
  try {
    const { dataInicio, dataFim, turma, motivo } = req.query;

    let query = { tipo: 'justificativa' };
    if (turma && turma !== 'todas') query.alunoTurma = turma;
    if (motivo && motivo !== 'todos') query.motivo = motivo;

    // 🔥 Filtro por overlap de intervalo
    if (dataInicio || dataFim) {
      const { inicio, fim } = construirRangeData(dataInicio, dataFim);
      const filtroData = construirFiltroData(inicio, fim);
      Object.assign(query, filtroData);
    }

    const registros = await Autorizacao.find(query).sort({ data: -1 }).lean();

    const porTurma = {};
    const porMotivo = {};

    registros.forEach(a => {
      const turmaKey = a.alunoTurma || 'Não informada';
      if (!porTurma[turmaKey]) {
        porTurma[turmaKey] = { turma: turmaKey, total: 0, alunos: new Set() };
      }
      porTurma[turmaKey].total++;
      porTurma[turmaKey].alunos.add(a.alunoId.toString());

      const motivoKey = a.motivo || 'outros';
      porMotivo[motivoKey] = (porMotivo[motivoKey] || 0) + 1;
    });

    Object.values(porTurma).forEach(t => {
      t.totalAlunos = t.alunos.size;
      delete t.alunos;
    });

    res.json({
      success: true,
      filtros: { dataInicio, dataFim, turma, motivo },
      totalRegistros: registros.length,
      porTurma: Object.values(porTurma).sort((a, b) => b.total - a.total),
      porMotivo: Object.entries(porMotivo).map(([m, c]) => ({
        motivo: m,
        label: getMotivoLabel(m),
        count: c
      })).sort((a, b) => b.count - a.count),
      registros: registros.slice(0, 100).map(formatarRegistro)
    });
  } catch (error) {
    console.error('Erro no relatório geral:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/justificativa/relatorio/turma/:turma', authenticateToken, verificarSecretaria, async (req, res) => {
  try {
    const { dataInicio, dataFim } = req.query;

    let query = {
      tipo: 'justificativa',
      alunoTurma: req.params.turma
    };

    // 🔥 Filtro por overlap de intervalo
    if (dataInicio || dataFim) {
      const { inicio, fim } = construirRangeData(dataInicio, dataFim);
      const filtroData = construirFiltroData(inicio, fim);
      Object.assign(query, filtroData);
    }

    const registros = await Autorizacao.find(query).sort({ data: -1 }).lean();

    const porAluno = {};
    const porMotivo = {};

    registros.forEach(a => {
      const key = a.alunoId.toString();
      if (!porAluno[key]) {
        porAluno[key] = {
          alunoId: a.alunoId,
          alunoNome: a.alunoNome,
          alunoMatricula: a.alunoMatricula,
          total: 0
        };
      }
      porAluno[key].total++;

      const motivoKey = a.motivo || 'outros';
      porMotivo[motivoKey] = (porMotivo[motivoKey] || 0) + 1;
    });

    res.json({
      success: true,
      turma: req.params.turma,
      periodo: { dataInicio, dataFim },
      estatisticas: {
        totalRegistros: registros.length,
        totalAlunos: Object.keys(porAluno).length
      },
      porAluno: Object.values(porAluno).sort((a, b) => b.total - a.total),
      porMotivo: Object.entries(porMotivo).map(([m, c]) => ({
        motivo: m,
        label: getMotivoLabel(m),
        count: c
      })).sort((a, b) => b.count - a.count),
      registros: registros.slice(0, 100).map(formatarRegistro)
    });
  } catch (error) {
    console.error('Erro no relatório por turma:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/justificativa/relatorio/aluno/:alunoId', authenticateToken, verificarSecretaria, async (req, res) => {
  try {
    const { dataInicio, dataFim } = req.query;

    let query = {
      tipo: 'justificativa',
      alunoId: req.params.alunoId
    };

    // 🔥 Filtro por overlap de intervalo
    if (dataInicio || dataFim) {
      const { inicio, fim } = construirRangeData(dataInicio, dataFim);
      const filtroData = construirFiltroData(inicio, fim);
      Object.assign(query, filtroData);
    }

    const registros = await Autorizacao.find(query).sort({ data: -1 }).lean();
    const aluno = await User.findById(req.params.alunoId)
      .select('nome matricula turma curso')
      .lean();

    if (!aluno) {
      return res.status(404).json({ success: false, error: 'Aluno não encontrado' });
    }

    const porMotivo = {};
    registros.forEach(a => {
      const motivoKey = a.motivo || 'outros';
      porMotivo[motivoKey] = (porMotivo[motivoKey] || 0) + 1;
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
        totalRegistros: registros.length
      },
      porMotivo: Object.entries(porMotivo).map(([m, c]) => ({
        motivo: m,
        label: getMotivoLabel(m),
        count: c
      })).sort((a, b) => b.count - a.count),
      registros: registros.map(formatarRegistro)
    });
  } catch (error) {
    console.error('Erro no relatório por aluno:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 📊 DASHBOARD
// ============================================
router.get('/dashboard', authenticateToken, verificarSecretaria, async (req, res) => {
  try {
    const hoje = new Date();
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const inicioSemana = new Date(hoje);
    inicioSemana.setDate(hoje.getDate() - hoje.getDay());
    const ultimos30Dias = new Date();
    ultimos30Dias.setDate(ultimos30Dias.getDate() - 30);

    const baseQuery = { tipo: 'justificativa' };

    const [totalGeral, totalMes, totalSemana, totalHoje] = await Promise.all([
      Autorizacao.countDocuments(baseQuery),
      Autorizacao.countDocuments({ ...baseQuery, data: { $gte: inicioMes } }),
      Autorizacao.countDocuments({ ...baseQuery, data: { $gte: inicioSemana } }),
      Autorizacao.countDocuments({
        ...baseQuery,
        data: {
          $gte: new Date(hoje.toISOString().split('T')[0] + 'T00:00:00.000-03:00'),
          $lte: new Date(hoje.toISOString().split('T')[0] + 'T23:59:59.999-03:00')
        }
      })
    ]);

    const porMotivo = await Autorizacao.aggregate([
      { $match: { tipo: 'justificativa', data: { $gte: ultimos30Dias } } },
      { $group: { _id: '$motivo', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    res.json({
      success: true,
      metricas: {
        total: totalGeral,
        mes: totalMes,
        semana: totalSemana,
        hoje: totalHoje
      },
      porMotivo: porMotivo.map(m => ({
        motivo: m._id,
        label: getMotivoLabel(m._id),
        count: m.count
      }))
    });
  } catch (error) {
    console.error('Erro no dashboard:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;