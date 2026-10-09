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

// Turmas disponíveis
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

// Alunos por turma
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

// Buscar aluno por ID (QR Code)
router.get('/justificativa/aluno/:id', authenticateToken, verificarSecretaria, async (req, res) => {
  try {
    const aluno = await User.findOne({ _id: req.params.id, ativo: true })
      .select('nome email matricula curso turma fotoPerfil role');

    if (!aluno) {
      return res.status(404).json({ success: false, error: 'Aluno não encontrado' });
    }
    if (aluno.role !== 'aluno') {
      return res.status(400).json({ success: false, error: 'Usuário não é aluno' });
    }

    // Estatísticas de justificativas
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
        justificativasUltimos30
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Buscar justificativas de um aluno específico (com filtros adicionais)
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

    if (dataInicio || dataFim) {
      query.data = {};
      if (dataInicio) query.data.$gte = new Date(dataInicio);
      if (dataFim) query.data.$lte = new Date(dataFim + 'T23:59:59');
    }

    const registros = await Autorizacao.find(query).sort({ data: -1 });

    const getLabel = (motivo) => {
      const labels = {
        'problemas_pessoais': 'Problemas Pessoais',
        'problemas_saude': 'Problemas de Saúde',
        'viagem': 'Viagem',
        'outros': 'Outros'
      };
      return labels[motivo] || motivo;
    };

    res.json({
      success: true,
      total: registros.length,
      registros: registros.map(a => ({
        id: a._id,
        alunoId: a.alunoId,
        alunoNome: a.alunoNome,
        alunoMatricula: a.alunoMatricula,
        alunoTurma: a.alunoTurma,
        alunoCurso: a.alunoCurso,
        data: a.data,
        dataFormatada: new Date(a.data).toLocaleDateString('pt-BR'),
        motivo: a.motivo,
        motivoLabel: getLabel(a.motivo),
        motivoOutros: a.motivoOutros,
        observacoes: a.observacoes,
        responsavelNome: a.responsavelNome,
        responsavelCPF: a.responsavelCPF,
        responsavelTelefone: a.responsavelTelefone,
        temAssinatura: !!(a.assinaturaBase64 && a.assinaturaBase64.length > 50),
        origemTipo: a.origemTipo || null,
        registradoPor: a.registradoPorNome,
        createdAt: a.createdAt
      }))
    });
  } catch (error) {
    console.error('Erro ao buscar justificativas do aluno:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Listar justificativas com filtros (para relatórios)
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
    if (dataInicio || dataFim) {
      query.data = {};
      if (dataInicio) query.data.$gte = new Date(dataInicio);
      if (dataFim) query.data.$lte = new Date(dataFim + 'T23:59:59');
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [registros, total] = await Promise.all([
      Autorizacao.find(query)
        .sort({ data: -1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Autorizacao.countDocuments(query)
    ]);

    const getLabel = (motivo) => {
      const labels = {
        'problemas_pessoais': 'Problemas Pessoais',
        'problemas_saude': 'Problemas de Saúde',
        'viagem': 'Viagem',
        'outros': 'Outros'
      };
      return labels[motivo] || motivo;
    };

    res.json({
      success: true,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      registros: registros.map(a => ({
        id: a._id,
        alunoId: a.alunoId,
        alunoNome: a.alunoNome,
        alunoMatricula: a.alunoMatricula,
        alunoTurma: a.alunoTurma,
        alunoCurso: a.alunoCurso,
        data: a.data,
        dataFormatada: new Date(a.data).toLocaleDateString('pt-BR'),
        motivo: a.motivo,
        motivoLabel: getLabel(a.motivo),
        motivoOutros: a.motivoOutros,
        observacoes: a.observacoes,
        responsavelNome: a.responsavelNome,
        responsavelCPF: a.responsavelCPF,
        responsavelTelefone: a.responsavelTelefone,
        temAssinatura: !!(a.assinaturaBase64 && a.assinaturaBase64.length > 50),
        origemTipo: a.origemTipo || null,
        registradoPor: a.registradoPorNome,
        createdAt: a.createdAt
      }))
    });
  } catch (error) {
    console.error('Erro ao listar justificativas:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Buscar justificativa por ID
router.get('/justificativa/:id', authenticateToken, verificarSecretaria, async (req, res) => {
  try {
    if (['listar', 'turmas', 'dashboard', 'alunos-por-turma'].includes(req.params.id)) {
      return res.status(404).json({ success: false, error: 'Rota não encontrada' });
    }

    const registro = await Autorizacao.findById(req.params.id);

    if (!registro) {
      return res.status(404).json({ success: false, error: 'Justificativa não encontrada' });
    }

    if (registro.tipo !== 'justificativa') {
      return res.status(403).json({
        success: false,
        error: 'Acesso negado: este registro não é uma justificativa'
      });
    }

    const getLabel = (motivo) => {
      const labels = {
        'problemas_pessoais': 'Problemas Pessoais',
        'problemas_saude': 'Problemas de Saúde',
        'viagem': 'Viagem',
        'outros': 'Outros'
      };
      return labels[motivo] || motivo;
    };

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
        motivo: registro.motivo,
        motivoLabel: getLabel(registro.motivo),
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

// Buscar alunos (autocomplete para relatórios)
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
// 📊 RELATÓRIOS
// ============================================

router.get('/justificativa/relatorio/geral', authenticateToken, verificarSecretaria, async (req, res) => {
  try {
    const { dataInicio, dataFim, turma, motivo } = req.query;

    let query = { tipo: 'justificativa' };
    if (turma && turma !== 'todas') query.alunoTurma = turma;
    if (motivo && motivo !== 'todos') query.motivo = motivo;
    if (dataInicio || dataFim) {
      query.data = {};
      if (dataInicio) query.data.$gte = new Date(dataInicio);
      if (dataFim) query.data.$lte = new Date(dataFim + 'T23:59:59');
    }

    const registros = await Autorizacao.find(query).sort({ data: -1 });

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

    const getLabel = (motivo) => {
      const labels = {
        'problemas_pessoais': 'Problemas Pessoais',
        'problemas_saude': 'Problemas de Saúde',
        'viagem': 'Viagem',
        'outros': 'Outros'
      };
      return labels[motivo] || motivo;
    };

    res.json({
      success: true,
      filtros: { dataInicio, dataFim, turma, motivo },
      totalRegistros: registros.length,
      porTurma: Object.values(porTurma).sort((a, b) => b.total - a.total),
      porMotivo: Object.entries(porMotivo).map(([m, c]) => ({
        motivo: m,
        label: getLabel(m),
        count: c
      })).sort((a, b) => b.count - a.count),
      registros: registros.slice(0, 100).map(a => ({
        id: a._id,
        alunoNome: a.alunoNome,
        alunoMatricula: a.alunoMatricula,
        alunoTurma: a.alunoTurma,
        data: a.data,
        dataFormatada: new Date(a.data).toLocaleDateString('pt-BR'),
        motivo: a.motivo,
        motivoLabel: getLabel(a.motivo),
        observacoes: a.observacoes,
        createdAt: a.createdAt
      }))
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

    if (dataInicio || dataFim) {
      query.data = {};
      if (dataInicio) query.data.$gte = new Date(dataInicio);
      if (dataFim) query.data.$lte = new Date(dataFim + 'T23:59:59');
    }

    const registros = await Autorizacao.find(query).sort({ data: -1 });

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

    const getLabel = (motivo) => {
      const labels = {
        'problemas_pessoais': 'Problemas Pessoais',
        'problemas_saude': 'Problemas de Saúde',
        'viagem': 'Viagem',
        'outros': 'Outros'
      };
      return labels[motivo] || motivo;
    };

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
        label: getLabel(m),
        count: c
      })).sort((a, b) => b.count - a.count),
      registros: registros.slice(0, 100).map(a => ({
        id: a._id,
        alunoNome: a.alunoNome,
        alunoMatricula: a.alunoMatricula,
        alunoTurma: a.alunoTurma,
        data: a.data,
        dataFormatada: new Date(a.data).toLocaleDateString('pt-BR'),
        motivo: a.motivo,
        motivoLabel: getLabel(a.motivo),
        observacoes: a.observacoes,
        createdAt: a.createdAt
      }))
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

    if (dataInicio || dataFim) {
      query.data = {};
      if (dataInicio) query.data.$gte = new Date(dataInicio);
      if (dataFim) query.data.$lte = new Date(dataFim + 'T23:59:59');
    }

    const registros = await Autorizacao.find(query).sort({ data: -1 });
    const aluno = await User.findById(req.params.alunoId).select('nome matricula turma curso');

    if (!aluno) {
      return res.status(404).json({ success: false, error: 'Aluno não encontrado' });
    }

    const porMotivo = {};
    registros.forEach(a => {
      const motivoKey = a.motivo || 'outros';
      porMotivo[motivoKey] = (porMotivo[motivoKey] || 0) + 1;
    });

    const getLabel = (motivo) => {
      const labels = {
        'problemas_pessoais': 'Problemas Pessoais',
        'problemas_saude': 'Problemas de Saúde',
        'viagem': 'Viagem',
        'outros': 'Outros'
      };
      return labels[motivo] || motivo;
    };

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
        label: getLabel(m),
        count: c
      })).sort((a, b) => b.count - a.count),
      registros: registros.map(a => ({
        id: a._id,
        alunoNome: a.alunoNome,
        alunoMatricula: a.alunoMatricula,
        alunoTurma: a.alunoTurma,
        data: a.data,
        dataFormatada: new Date(a.data).toLocaleDateString('pt-BR'),
        motivo: a.motivo,
        motivoLabel: getLabel(a.motivo),
        observacoes: a.observacoes,
        responsavelNome: a.responsavelNome,
        createdAt: a.createdAt
      }))
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
          $gte: new Date(hoje.toISOString().split('T')[0]),
          $lt: new Date(new Date(hoje.toISOString().split('T')[0]).setDate(hoje.getDate() + 1))
        }
      })
    ]);

    const porMotivo = await Autorizacao.aggregate([
      { $match: { tipo: 'justificativa', data: { $gte: ultimos30Dias } } },
      { $group: { _id: '$motivo', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    const getLabel = (motivo) => {
      const labels = {
        'problemas_pessoais': 'Problemas Pessoais',
        'problemas_saude': 'Problemas de Saúde',
        'viagem': 'Viagem',
        'outros': 'Outros'
      };
      return labels[motivo] || motivo;
    };

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
        label: getLabel(m._id),
        count: m.count
      }))
    });
  } catch (error) {
    console.error('Erro no dashboard:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;