// routes/gestao-atendimento.js
// ============================================
// ROTAS: ATENDIMENTOS - GESTÃO GERAL
// Atendimento ao Aluno + Atendimento aos Pais/Responsáveis
// + Multi-seleção de motivos/providências
// + Dados opcionais do responsável em atendimento ao aluno
// ============================================

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const AtendimentoGestaoGeral = require('../models/AtendimentoGestaoGeral');
const SessaoAssinatura = require('../models/SessaoAssinatura');

// ============================================
// MIDDLEWARES
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
    service: 'Atendimentos - Gestão Geral',
    versao: '1.1-multi-select',
    timestamp: new Date().toISOString()
  });
});

// ============================================
// 📚 TURMAS
// ============================================
router.get('/turmas', authenticateToken, verificarGestaoGeral, async (req, res) => {
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

// ============================================
// 👥 ALUNOS POR TURMA
// ============================================
router.get('/alunos-por-turma', authenticateToken, verificarGestaoGeral, async (req, res) => {
  try {
    const { turma } = req.query;
    if (!turma) {
      return res.status(400).json({ success: false, error: 'Turma é obrigatória' });
    }

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
// 👤 BUSCAR ALUNO POR ID
// ============================================
router.get('/aluno/:id', authenticateToken, verificarGestaoGeral, async (req, res) => {
  try {
    const aluno = await User.findOne({ _id: req.params.id, ativo: true })
      .select('nome email matricula curso turma fotoPerfil role');

    if (!aluno) {
      return res.status(404).json({ success: false, error: 'Aluno não encontrado' });
    }
    if (aluno.role !== 'aluno') {
      return res.status(400).json({ success: false, error: 'Usuário não é aluno' });
    }

    const ultimosAtendimentos = await AtendimentoGestaoGeral.find({ alunoId: aluno._id })
      .select('-assinaturaBase64 -assinaturaAlunoBase64')
      .sort({ dataAtendimento: -1 })
      .limit(5);

    const totalAtendimentos = await AtendimentoGestaoGeral.countDocuments({ alunoId: aluno._id });

    // 🆕 Busca o último responsável de QUALQUER atendimento que tenha dados preenchidos
    const ultimoAtendResponsavel = await AtendimentoGestaoGeral.findOne({
      alunoId: aluno._id,
      responsavelNome: { $ne: '' }
    })
      .sort({ dataAtendimento: -1 })
      .select('responsavelNome responsavelCPF responsavelTelefone responsavelParentesco');

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
      estatisticas: { totalAtendimentos },
      historicoRecente: ultimosAtendimentos.map(a => ({
        id: a._id,
        tipoAtendimento: a.tipoAtendimento,
        motivo: a.motivo,
        motivoLabel: AtendimentoGestaoGeral.getMotivoLabel(a.motivo),
        dataAtendimento: a.dataAtendimento
      })),
      ultimoResponsavel: ultimoAtendResponsavel ? {
        nome: ultimoAtendResponsavel.responsavelNome,
        cpf: ultimoAtendResponsavel.responsavelCPF,
        telefone: ultimoAtendResponsavel.responsavelTelefone,
        parentesco: ultimoAtendResponsavel.responsavelParentesco
      } : null
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 📝 REGISTRAR ATENDIMENTO
// 🆕 Aceita multi-seleção + responsável em qualquer tipo
// ============================================
router.post('/registrar', authenticateToken, verificarGestaoGeral, async (req, res) => {
  try {
    const {
      tipoAtendimento,
      alunoId,
      responsavelNome = '',
      responsavelCPF = '',
      responsavelTelefone = '',
      responsavelParentesco = '',
      dataAtendimento,
      // 🆕 multi-seleção
      motivos,
      motivo,
      descricaoMotivo,
      providenciasList,
      providencias,
      descricaoProvidencias,
      observacoes = '',
      precisaAssinatura = false,
      assinaturaBase64 = '',
      sessaoAssinaturaId = null,
      precisaAssinaturaAluno = false,
      assinaturaAlunoBase64 = '',
      sessaoAssinaturaAlunoId = null
    } = req.body;

    if (!tipoAtendimento || !['aluno', 'responsavel'].includes(tipoAtendimento)) {
      return res.status(400).json({ success: false, error: 'Tipo de atendimento inválido' });
    }
    if (!alunoId) {
      return res.status(400).json({ success: false, error: 'Aluno é obrigatório' });
    }

    // 🆕 Normaliza motivos
    let motivosFinal = Array.isArray(motivos) && motivos.length > 0
      ? motivos
      : (motivo ? [motivo] : []);
    motivosFinal = [...new Set(motivosFinal.filter(Boolean))];

    if (motivosFinal.length === 0) {
      return res.status(400).json({ success: false, error: 'Selecione pelo menos um motivo' });
    }

    const motivosValidos = [
      'comportamento', 'desempenho_academico', 'frequencia', 'relacionamento',
      'saude', 'familia', 'disciplina', 'orientacao', 'outros'
    ];
    for (const m of motivosFinal) {
      if (!motivosValidos.includes(m)) {
        return res.status(400).json({ success: false, error: `Motivo inválido: ${m}` });
      }
    }

    // 🆕 Normaliza providências
    let providenciasFinal = Array.isArray(providenciasList) && providenciasList.length > 0
      ? providenciasList
      : (providencias ? [providencias] : []);
    providenciasFinal = [...new Set(providenciasFinal.filter(Boolean))];

    if (providenciasFinal.length === 0) {
      return res.status(400).json({ success: false, error: 'Selecione pelo menos uma providência' });
    }

    const providenciasValidas = [
      'orientacao_verbal', 'advertencia_verbal', 'advertencia_escrita',
      'notificacao_responsavel', 'reuniao_responsavel', 'encaminhamento_psicologia',
      'encaminhamento_assistente_social', 'acompanhamento_pedagogico', 'suspensao', 'outros'
    ];
    for (const p of providenciasFinal) {
      if (!providenciasValidas.includes(p)) {
        return res.status(400).json({ success: false, error: `Providência inválida: ${p}` });
      }
    }

    if (!descricaoMotivo || descricaoMotivo.trim() === '') {
      return res.status(400).json({ success: false, error: 'Descrição do motivo é obrigatória' });
    }
    if (!descricaoProvidencias || descricaoProvidencias.trim() === '') {
      return res.status(400).json({ success: false, error: 'Descrição das providências é obrigatória' });
    }

    const aluno = await User.findById(alunoId);
    if (!aluno || aluno.role !== 'aluno') {
      return res.status(404).json({ success: false, error: 'Aluno não encontrado' });
    }

    const gestor = await User.findById(req.userId).select('nome');

    let dataFinal = new Date();
    if (dataAtendimento) {
      const parsed = new Date(dataAtendimento + 'T12:00:00');
      if (!isNaN(parsed.getTime())) dataFinal = parsed;
    }

    // 🆕 Nome do responsável é obrigatório APENAS quando o tipo é "responsavel"
    if (tipoAtendimento === 'responsavel') {
      if (!responsavelNome || responsavelNome.trim() === '') {
        return res.status(400).json({
          success: false,
          error: 'Nome do responsável é obrigatório para atendimento ao responsável'
        });
      }
    }

    // ---------- ASSINATURA DO RESPONSÁVEL ----------
    let assinaturaValida = '';
    let assinadaPorNome = null;
    let assinadaEm = null;

    if (assinaturaBase64 && typeof assinaturaBase64 === 'string') {
      if (assinaturaBase64.startsWith('data:image/png;base64,')) {
        if (assinaturaBase64.length > 500 * 1024) {
          return res.status(400).json({ success: false, error: 'Assinatura muito grande (máx 500KB)' });
        }
        assinaturaValida = assinaturaBase64;
        assinadaPorNome = responsavelNome || gestor?.nome || req.userNome || 'Responsável';
        assinadaEm = new Date();
      }
    }

    if (sessaoAssinaturaId && !assinaturaValida) {
      try {
        const sessao = await SessaoAssinatura.findOne({
          sessaoId: sessaoAssinaturaId,
          status: 'assinado'
        });

        if (sessao && sessao.assinaturaBase64) {
          assinaturaValida = sessao.assinaturaBase64;
          assinadaPorNome = sessao.assinadaPorNome || responsavelNome || 'Responsável';
          assinadaEm = sessao.assinadaEm;

          sessao.status = 'cancelado';
          await sessao.save();

          console.log(`✅ [ATENDIMENTO] Assinatura do RESPONSÁVEL da sessão ${sessaoAssinaturaId} aplicada`);
        }
      } catch (e) {
        console.warn('Erro ao buscar assinatura da sessão (responsável):', e.message);
      }
    }

    const statusAssinatura = assinaturaValida.length > 100
      ? 'assinada'
      : (precisaAssinatura ? 'pendente' : 'nao_necessaria');

    // ---------- ASSINATURA DO ALUNO ----------
    let assinaturaAlunoValida = '';
    let assinadaPorNomeAluno = null;
    let assinadaEmAluno = null;

    if (assinaturaAlunoBase64 && typeof assinaturaAlunoBase64 === 'string') {
      if (assinaturaAlunoBase64.startsWith('data:image/png;base64,')) {
        if (assinaturaAlunoBase64.length > 500 * 1024) {
          return res.status(400).json({ success: false, error: 'Assinatura do aluno muito grande (máx 500KB)' });
        }
        assinaturaAlunoValida = assinaturaAlunoBase64;
        assinadaPorNomeAluno = aluno.nome;
        assinadaEmAluno = new Date();
      }
    }

    if (sessaoAssinaturaAlunoId && !assinaturaAlunoValida) {
      try {
        const sessaoAluno = await SessaoAssinatura.findOne({
          sessaoId: sessaoAssinaturaAlunoId,
          status: 'assinado'
        });

        if (sessaoAluno && sessaoAluno.assinaturaBase64) {
          assinaturaAlunoValida = sessaoAluno.assinaturaBase64;
          assinadaPorNomeAluno = sessaoAluno.assinadaPorNome || aluno.nome;
          assinadaEmAluno = sessaoAluno.assinadaEm;

          sessaoAluno.status = 'cancelado';
          await sessaoAluno.save();

          console.log(`✅ [ATENDIMENTO] Assinatura do ALUNO da sessão ${sessaoAssinaturaAlunoId} aplicada`);
        }
      } catch (e) {
        console.warn('Erro ao buscar assinatura da sessão (aluno):', e.message);
      }
    }

    const statusAssinaturaAluno = assinaturaAlunoValida.length > 100
      ? 'assinada'
      : (precisaAssinaturaAluno ? 'pendente' : 'nao_necessaria');

    // ---------- CRIA O REGISTRO ----------
    const atendimento = new AtendimentoGestaoGeral({
      tipoAtendimento,
      alunoId: aluno._id,
      alunoNome: aluno.nome,
      alunoMatricula: aluno.matricula || '',
      alunoTurma: aluno.turma || 'Não informada',
      alunoCurso: aluno.curso || '',
      alunoFoto: aluno.fotoPerfil || '',

      // 🆕 Dados do responsável SEMPRE podem ser preenchidos
      responsavelNome: (responsavelNome || '').trim(),
      responsavelCPF: (responsavelCPF || '').trim(),
      responsavelTelefone: (responsavelTelefone || '').trim(),
      responsavelParentesco: (responsavelParentesco || '').trim(),

      dataAtendimento: dataFinal,
      motivo: motivosFinal[0],
      motivos: motivosFinal,
      motivoLabel: AtendimentoGestaoGeral.getMotivosLabels(motivosFinal),
      descricaoMotivo: descricaoMotivo.trim(),
      providencias: providenciasFinal[0],
      providenciasList: providenciasFinal,
      providenciasLabel: AtendimentoGestaoGeral.getProvidenciasLabels(providenciasFinal),
      descricaoProvidencias: descricaoProvidencias.trim(),
      observacoes: observacoes || '',

      precisaAssinatura: !!precisaAssinatura,
      assinaturaBase64: assinaturaValida,
      temAssinatura: assinaturaValida.length > 100,
      statusAssinatura,
      assinadaEm,
      assinadaPorNome,

      precisaAssinaturaAluno: !!precisaAssinaturaAluno,
      assinaturaAlunoBase64: assinaturaAlunoValida,
      temAssinaturaAluno: assinaturaAlunoValida.length > 100,
      statusAssinaturaAluno,
      assinadaEmAluno,
      assinadaPorNomeAluno,

      registradoPor: req.userId,
      registradoPorNome: gestor?.nome || req.userNome || 'Gestão Geral'
    });

    await atendimento.save();

    const dataFormatada = dataFinal.toLocaleDateString('pt-BR');
    let msgExtras = '';
    if (statusAssinatura === 'pendente') msgExtras += ' — aguardando assinatura do responsável';
    if (statusAssinaturaAluno === 'pendente') msgExtras += ' — aguardando assinatura do aluno';

    res.json({
      success: true,
      message: `Atendimento (${tipoAtendimento === 'aluno' ? 'Aluno' : 'Responsável'}) de ${dataFormatada} registrado para ${aluno.nome}${msgExtras}`,
      atendimento: {
        id: atendimento._id,
        tipoAtendimento: atendimento.tipoAtendimento,
        motivo: atendimento.motivo,
        motivos: atendimento.motivos,
        motivoLabel: atendimento.motivoLabel,
        providencias: atendimento.providencias,
        providenciasList: atendimento.providenciasList,
        providenciasLabel: atendimento.providenciasLabel,
        dataAtendimento: atendimento.dataAtendimento,
        dataAtendimentoFormatada: dataFormatada,
        temAssinatura: atendimento.temAssinatura,
        statusAssinatura: atendimento.statusAssinatura,
        temAssinaturaAluno: atendimento.temAssinaturaAluno,
        statusAssinaturaAluno: atendimento.statusAssinaturaAluno
      }
    });
  } catch (error) {
    console.error('Erro ao registrar atendimento:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 📋 LISTAR ATENDIMENTOS (COM PAGINAÇÃO + FILTROS)
// ============================================
router.get('/listar', authenticateToken, verificarGestaoGeral, async (req, res) => {
  try {
    const {
      limit = 10,
      page = 1,
      tipoAtendimento,
      alunoNome,
      turma,
      motivo,
      dataInicio,
      dataFim
    } = req.query;

    let query = {};

    if (tipoAtendimento && tipoAtendimento !== 'todos') {
      query.tipoAtendimento = tipoAtendimento;
    }

    if (turma && turma !== 'todas') {
      query.alunoTurma = turma;
    }

    // 🆕 Busca no array de motivos
    if (motivo && motivo !== 'todos') {
      query.motivos = motivo;
    }

    if (alunoNome && alunoNome.trim()) {
      const termo = alunoNome.trim();
      query.$or = [
        { alunoNome: { $regex: termo, $options: 'i' } },
        { alunoMatricula: { $regex: termo, $options: 'i' } },
        { responsavelNome: { $regex: termo, $options: 'i' } }
      ];
    }

    if (dataInicio || dataFim) {
      query.dataAtendimento = {};
      if (dataInicio) query.dataAtendimento.$gte = new Date(dataInicio + 'T00:00:00.000-03:00');
      if (dataFim) query.dataAtendimento.$lte = new Date(dataFim + 'T23:59:59.999-03:00');
    }

    const limitNum = parseInt(limit) || 10;
    const pageNum = parseInt(page) || 1;
    const skip = (pageNum - 1) * limitNum;

    const [atendimentos, total] = await Promise.all([
      AtendimentoGestaoGeral.find(query)
        .select('-assinaturaBase64 -assinaturaAlunoBase64')
        .sort({ dataAtendimento: -1, criadoEm: -1 })
        .skip(skip)
        .limit(limitNum),
      AtendimentoGestaoGeral.countDocuments(query)
    ]);

    res.json({
      success: true,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
      atendimentos: atendimentos.map(a => {
        const motivosArr = (a.motivos && a.motivos.length > 0) ? a.motivos : [a.motivo];
        const providenciasArr = (a.providenciasList && a.providenciasList.length > 0) ? a.providenciasList : [a.providencias];
        return {
          id: a._id,
          tipoAtendimento: a.tipoAtendimento,
          alunoId: a.alunoId,
          alunoNome: a.alunoNome,
          alunoMatricula: a.alunoMatricula,
          alunoTurma: a.alunoTurma,
          alunoCurso: a.alunoCurso,
          responsavelNome: a.responsavelNome,
          responsavelCPF: a.responsavelCPF,
          responsavelTelefone: a.responsavelTelefone,
          responsavelParentesco: a.responsavelParentesco,
          motivo: a.motivo,
          motivos: motivosArr,
          motivoLabel: AtendimentoGestaoGeral.getMotivosLabels(motivosArr),
          providencias: a.providencias,
          providenciasList: providenciasArr,
          providenciasLabel: AtendimentoGestaoGeral.getProvidenciasLabels(providenciasArr),
          dataAtendimento: a.dataAtendimento,
          dataFormatada: new Date(a.dataAtendimento).toLocaleDateString('pt-BR'),
          registradoPor: a.registradoPorNome,
          temAssinatura: a.temAssinatura,
          statusAssinatura: a.statusAssinatura,
          temAssinaturaAluno: a.temAssinaturaAluno,
          statusAssinaturaAluno: a.statusAssinaturaAluno,
          criadoEm: a.criadoEm
        };
      })
    });
  } catch (error) {
    console.error('Erro ao listar atendimentos:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 📊 DASHBOARD
// ============================================
router.get('/dashboard', authenticateToken, verificarGestaoGeral, async (req, res) => {
  try {
    const { tipoAtendimento } = req.query;

    const hoje = new Date();
    const hojeStr = hoje.toISOString().split('T')[0];
    const inicioSemana = new Date(hoje);
    inicioSemana.setDate(hoje.getDate() - hoje.getDay());
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const ultimos30Dias = new Date();
    ultimos30Dias.setDate(ultimos30Dias.getDate() - 30);

    const matchTipo = tipoAtendimento && tipoAtendimento !== 'todos'
      ? { tipoAtendimento }
      : {};

    const [totalHoje, totalSemana, totalMes, totalGeral] = await Promise.all([
      AtendimentoGestaoGeral.countDocuments({
        ...matchTipo,
        dataAtendimento: {
          $gte: new Date(hojeStr),
          $lt: new Date(new Date(hojeStr).setDate(new Date(hojeStr).getDate() + 1))
        }
      }),
      AtendimentoGestaoGeral.countDocuments({
        ...matchTipo,
        dataAtendimento: { $gte: inicioSemana }
      }),
      AtendimentoGestaoGeral.countDocuments({
        ...matchTipo,
        dataAtendimento: { $gte: inicioMes }
      }),
      AtendimentoGestaoGeral.countDocuments(matchTipo)
    ]);

    // 🆕 Agrupa pelo array de motivos
    const porMotivo = await AtendimentoGestaoGeral.aggregate([
      { $match: { ...matchTipo, dataAtendimento: { $gte: ultimos30Dias } } },
      {
        $project: {
          motivosEfetivos: {
            $cond: [
              { $gt: [{ $size: { $ifNull: ['$motivos', []] } }, 0] },
              '$motivos',
              ['$motivo']
            ]
          }
        }
      },
      { $unwind: '$motivosEfetivos' },
      { $group: { _id: '$motivosEfetivos', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    const porTipo = await AtendimentoGestaoGeral.aggregate([
      { $match: { dataAtendimento: { $gte: ultimos30Dias } } },
      { $group: { _id: '$tipoAtendimento', count: { $sum: 1 } } },
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

      const count = await AtendimentoGestaoGeral.countDocuments({
        ...matchTipo,
        dataAtendimento: { $gte: inicio, $lt: fim }
      });

      ultimos7Dias.push({
        data: dataStr,
        dia: data.toLocaleDateString('pt-BR', { weekday: 'short' }),
        atendimentos: count
      });
    }

    const porTurma = await AtendimentoGestaoGeral.aggregate([
      { $match: { ...matchTipo, dataAtendimento: { $gte: ultimos30Dias } } },
      { $group: { _id: '$alunoTurma', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 8 }
    ]);

    const alunosReincidentes = await AtendimentoGestaoGeral.aggregate([
      { $match: { ...matchTipo, dataAtendimento: { $gte: ultimos30Dias } } },
      {
        $group: {
          _id: '$alunoId',
          alunoNome: { $first: '$alunoNome' },
          alunoTurma: { $first: '$alunoTurma' },
          count: { $sum: 1 }
        }
      },
      { $match: { count: { $gte: 3 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    res.json({
      success: true,
      metricas: {
        hoje: totalHoje,
        semana: totalSemana,
        mes: totalMes,
        total: totalGeral
      },
      porMotivo: porMotivo.map(m => ({
        motivo: m._id,
        label: AtendimentoGestaoGeral.getMotivoLabel(m._id),
        count: m.count
      })),
      porTipo: porTipo.map(t => ({
        tipo: t._id,
        label: t._id === 'aluno' ? 'Aluno' : 'Responsável',
        count: t.count
      })),
      tendencias: {
        ultimos7Dias,
        porTurma: porTurma.map(t => ({ turma: t._id || 'Sem turma', count: t.count })),
        alunosReincidentes
      }
    });
  } catch (error) {
    console.error('Erro no dashboard de atendimentos:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 📈 RELATÓRIOS
// ============================================

// Relatório geral
router.get('/relatorio/geral', authenticateToken, verificarGestaoGeral, async (req, res) => {
  try {
    const { dataInicio, dataFim, turma, tipoAtendimento } = req.query;

    let query = {};
    if (turma && turma !== 'todas') query.alunoTurma = turma;
    if (tipoAtendimento && tipoAtendimento !== 'todos') query.tipoAtendimento = tipoAtendimento;

    if (dataInicio || dataFim) {
      query.dataAtendimento = {};
      if (dataInicio) query.dataAtendimento.$gte = new Date(dataInicio + 'T00:00:00.000-03:00');
      if (dataFim) query.dataAtendimento.$lte = new Date(dataFim + 'T23:59:59.999-03:00');
    }

    const atendimentos = await AtendimentoGestaoGeral.find(query)
      .select('-assinaturaBase64 -assinaturaAlunoBase64')
      .sort({ dataAtendimento: -1 });

    const porTurma = {};
    const porMotivo = {};
    const porTipo = {};
    const porProvidencia = {};

    atendimentos.forEach(a => {
      if (!porTurma[a.alunoTurma]) {
        porTurma[a.alunoTurma] = { turma: a.alunoTurma, total: 0, alunos: new Set() };
      }
      porTurma[a.alunoTurma].total++;
      porTurma[a.alunoTurma].alunos.add(a.alunoId.toString());

      // 🆕 Conta TODOS os motivos
      const motivosArr = (a.motivos && a.motivos.length > 0) ? a.motivos : [a.motivo];
      motivosArr.forEach(m => {
        porMotivo[m] = (porMotivo[m] || 0) + 1;
      });

      porTipo[a.tipoAtendimento] = (porTipo[a.tipoAtendimento] || 0) + 1;

      // 🆕 Conta TODAS as providências
      const providenciasArr = (a.providenciasList && a.providenciasList.length > 0)
        ? a.providenciasList
        : [a.providencias];
      providenciasArr.forEach(p => {
        porProvidencia[p] = (porProvidencia[p] || 0) + 1;
      });
    });

    Object.values(porTurma).forEach(t => {
      t.totalAlunos = t.alunos.size;
      delete t.alunos;
    });

    const turmasAtendimento = await AtendimentoGestaoGeral.distinct('alunoTurma');
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
      filtros: { dataInicio, dataFim, turma, tipoAtendimento },
      turmasDisponiveis: turmas,
      totalRegistros: atendimentos.length,
      porTurma: Object.values(porTurma).sort((a, b) => b.total - a.total),
      porMotivo: Object.entries(porMotivo).map(([m, c]) => ({
        motivo: m,
        label: AtendimentoGestaoGeral.getMotivoLabel(m),
        count: c
      })).sort((a, b) => b.count - a.count),
      porTipo: Object.entries(porTipo).map(([t, c]) => ({
        tipo: t,
        label: t === 'aluno' ? 'Aluno' : 'Responsável',
        count: c
      })),
      porProvidencia: Object.entries(porProvidencia).map(([p, c]) => ({
        providencia: p,
        label: AtendimentoGestaoGeral.getProvidenciaLabel(p),
        count: c
      })).sort((a, b) => b.count - a.count),
      registros: atendimentos.slice(0, 100).map(a => {
        const motivosArr = (a.motivos && a.motivos.length > 0) ? a.motivos : [a.motivo];
        const providenciasArr = (a.providenciasList && a.providenciasList.length > 0) ? a.providenciasList : [a.providencias];
        return {
          id: a._id,
          tipoAtendimento: a.tipoAtendimento,
          alunoNome: a.alunoNome,
          alunoTurma: a.alunoTurma,
          responsavelNome: a.responsavelNome,
          motivo: a.motivo,
          motivos: motivosArr,
          motivoLabel: AtendimentoGestaoGeral.getMotivosLabels(motivosArr),
          providenciasLabel: AtendimentoGestaoGeral.getProvidenciasLabels(providenciasArr),
          dataAtendimento: a.dataAtendimento,
          dataFormatada: new Date(a.dataAtendimento).toLocaleDateString('pt-BR'),
          registradoPor: a.registradoPorNome,
          temAssinatura: a.temAssinatura,
          temAssinaturaAluno: a.temAssinaturaAluno,
          criadoEm: a.criadoEm
        };
      })
    });
  } catch (error) {
    console.error('Erro no relatório geral:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Relatório por turma
router.get('/relatorio/turma/:turma', authenticateToken, verificarGestaoGeral, async (req, res) => {
  try {
    const { dataInicio, dataFim, tipoAtendimento } = req.query;
    const turma = req.params.turma;

    let query = { alunoTurma: turma };
    if (tipoAtendimento && tipoAtendimento !== 'todos') query.tipoAtendimento = tipoAtendimento;
    if (dataInicio || dataFim) {
      query.dataAtendimento = {};
      if (dataInicio) query.dataAtendimento.$gte = new Date(dataInicio + 'T00:00:00.000-03:00');
      if (dataFim) query.dataAtendimento.$lte = new Date(dataFim + 'T23:59:59.999-03:00');
    }

    const atendimentos = await AtendimentoGestaoGeral.find(query)
      .select('-assinaturaBase64 -assinaturaAlunoBase64')
      .sort({ dataAtendimento: -1 });

    const porAluno = {};
    const porMotivo = {};

    atendimentos.forEach(a => {
      const key = a.alunoId.toString();
      if (!porAluno[key]) {
        porAluno[key] = {
          alunoId: a.alunoId,
          alunoNome: a.alunoNome,
          alunoMatricula: a.alunoMatricula,
          total: 0,
          motivos: {}
        };
      }
      porAluno[key].total++;

      // 🆕 Conta todos os motivos
      const motivosArr = (a.motivos && a.motivos.length > 0) ? a.motivos : [a.motivo];
      motivosArr.forEach(m => {
        porAluno[key].motivos[m] = (porAluno[key].motivos[m] || 0) + 1;
        porMotivo[m] = (porMotivo[m] || 0) + 1;
      });
    });

    res.json({
      success: true,
      turma,
      periodo: { dataInicio, dataFim },
      estatisticas: {
        totalRegistros: atendimentos.length,
        totalAlunos: Object.keys(porAluno).length
      },
      porAluno: Object.values(porAluno).sort((a, b) => b.total - a.total),
      porMotivo: Object.entries(porMotivo).map(([m, c]) => ({
        motivo: m,
        label: AtendimentoGestaoGeral.getMotivoLabel(m),
        count: c
      })).sort((a, b) => b.count - a.count),
      registros: atendimentos.slice(0, 100).map(a => {
        const motivosArr = (a.motivos && a.motivos.length > 0) ? a.motivos : [a.motivo];
        const providenciasArr = (a.providenciasList && a.providenciasList.length > 0) ? a.providenciasList : [a.providencias];
        return {
          id: a._id,
          tipoAtendimento: a.tipoAtendimento,
          alunoNome: a.alunoNome,
          alunoMatricula: a.alunoMatricula,
          motivoLabel: AtendimentoGestaoGeral.getMotivosLabels(motivosArr),
          providenciasLabel: AtendimentoGestaoGeral.getProvidenciasLabels(providenciasArr),
          dataAtendimento: a.dataAtendimento,
          dataFormatada: new Date(a.dataAtendimento).toLocaleDateString('pt-BR'),
          registradoPor: a.registradoPorNome
        };
      })
    });
  } catch (error) {
    console.error('Erro no relatório por turma:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Relatório por aluno
router.get('/relatorio/aluno/:alunoId', authenticateToken, verificarGestaoGeral, async (req, res) => {
  try {
    const { dataInicio, dataFim, tipoAtendimento } = req.query;
    const alunoId = req.params.alunoId;

    let query = { alunoId };
    if (tipoAtendimento && tipoAtendimento !== 'todos') query.tipoAtendimento = tipoAtendimento;
    if (dataInicio || dataFim) {
      query.dataAtendimento = {};
      if (dataInicio) query.dataAtendimento.$gte = new Date(dataInicio + 'T00:00:00.000-03:00');
      if (dataFim) query.dataAtendimento.$lte = new Date(dataFim + 'T23:59:59.999-03:00');
    }

    const atendimentos = await AtendimentoGestaoGeral.find(query)
      .select('-assinaturaBase64 -assinaturaAlunoBase64')
      .sort({ dataAtendimento: -1 });

    const aluno = await User.findById(alunoId).select('nome matricula turma curso');

    const porMotivo = {};
    atendimentos.forEach(a => {
      const motivosArr = (a.motivos && a.motivos.length > 0) ? a.motivos : [a.motivo];
      motivosArr.forEach(m => {
        porMotivo[m] = (porMotivo[m] || 0) + 1;
      });
    });

    res.json({
      success: true,
      aluno: aluno ? {
        id: aluno._id,
        nome: aluno.nome,
        matricula: aluno.matricula,
        turma: aluno.turma,
        curso: aluno.curso
      } : null,
      periodo: { dataInicio, dataFim },
      estatisticas: {
        totalRegistros: atendimentos.length,
        porMotivo: Object.entries(porMotivo).map(([m, c]) => ({
          motivo: m,
          label: AtendimentoGestaoGeral.getMotivoLabel(m),
          count: c
        }))
      },
      registros: atendimentos.map(a => {
        const motivosArr = (a.motivos && a.motivos.length > 0) ? a.motivos : [a.motivo];
        const providenciasArr = (a.providenciasList && a.providenciasList.length > 0) ? a.providenciasList : [a.providencias];
        return {
          id: a._id,
          tipoAtendimento: a.tipoAtendimento,
          motivoLabel: AtendimentoGestaoGeral.getMotivosLabels(motivosArr),
          providenciasLabel: AtendimentoGestaoGeral.getProvidenciasLabels(providenciasArr),
          descricaoMotivo: a.descricaoMotivo,
          descricaoProvidencias: a.descricaoProvidencias,
          dataAtendimento: a.dataAtendimento,
          dataFormatada: new Date(a.dataAtendimento).toLocaleDateString('pt-BR'),
          registradoPor: a.registradoPorNome,
          temAssinatura: a.temAssinatura,
          temAssinaturaAluno: a.temAssinaturaAluno
        };
      })
    });
  } catch (error) {
    console.error('Erro no relatório por aluno:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 🔍 BUSCAR ATENDIMENTO POR ID
// ⚠️ ESTA ROTA DEVE SER A ÚLTIMA — captura qualquer /:id
// ============================================
router.get('/:id', authenticateToken, verificarGestaoGeral, async (req, res) => {
  try {
    const rotasReservadas = [
      'listar', 'dashboard', 'registrar', 'turmas',
      'alunos-por-turma', 'relatorio', 'health', 'aluno'
    ];
    if (rotasReservadas.includes(req.params.id)) {
      return res.status(404).json({ success: false, error: 'Rota não encontrada' });
    }
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, error: 'ID inválido' });
    }

    const a = await AtendimentoGestaoGeral.findById(req.params.id);
    if (!a) {
      return res.status(404).json({ success: false, error: 'Atendimento não encontrado' });
    }

    const motivosArr = (a.motivos && a.motivos.length > 0) ? a.motivos : [a.motivo];
    const providenciasArr = (a.providenciasList && a.providenciasList.length > 0) ? a.providenciasList : [a.providencias];

    res.json({
      success: true,
      atendimento: {
        id: a._id,
        tipoAtendimento: a.tipoAtendimento,
        alunoId: a.alunoId,
        alunoNome: a.alunoNome,
        alunoMatricula: a.alunoMatricula,
        alunoTurma: a.alunoTurma,
        alunoCurso: a.alunoCurso,
        alunoFoto: a.alunoFoto,
        responsavelNome: a.responsavelNome,
        responsavelCPF: a.responsavelCPF,
        responsavelTelefone: a.responsavelTelefone,
        responsavelParentesco: a.responsavelParentesco,
        dataAtendimento: a.dataAtendimento,
        dataFormatada: new Date(a.dataAtendimento).toLocaleDateString('pt-BR'),
        motivo: a.motivo,
        motivos: motivosArr,
        motivoLabel: AtendimentoGestaoGeral.getMotivosLabels(motivosArr),
        descricaoMotivo: a.descricaoMotivo,
        providencias: a.providencias,
        providenciasList: providenciasArr,
        providenciasLabel: AtendimentoGestaoGeral.getProvidenciasLabels(providenciasArr),
        descricaoProvidencias: a.descricaoProvidencias,
        observacoes: a.observacoes,
        registradoPor: a.registradoPorNome,

        precisaAssinatura: a.precisaAssinatura || false,
        assinaturaBase64: a.assinaturaBase64 || '',
        temAssinatura: a.temAssinatura || false,
        statusAssinatura: a.statusAssinatura,
        assinadaEm: a.assinadaEm,
        assinadaPorNome: a.assinadaPorNome,

        precisaAssinaturaAluno: a.precisaAssinaturaAluno || false,
        assinaturaAlunoBase64: a.assinaturaAlunoBase64 || '',
        temAssinaturaAluno: a.temAssinaturaAluno || false,
        statusAssinaturaAluno: a.statusAssinaturaAluno,
        assinadaEmAluno: a.assinadaEmAluno,
        assinadaPorNomeAluno: a.assinadaPorNomeAluno,

        criadoEm: a.criadoEm,
        atualizadoEm: a.atualizadoEm
      }
    });
  } catch (error) {
    console.error('Erro ao buscar atendimento:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ✏️ EDITAR ATENDIMENTO
// ============================================
router.put('/:id', authenticateToken, verificarGestaoGeral, async (req, res) => {
  try {
    const {
      responsavelNome,
      responsavelCPF,
      responsavelTelefone,
      responsavelParentesco,
      dataAtendimento,
      motivos,
      motivo,
      descricaoMotivo,
      providenciasList,
      providencias,
      descricaoProvidencias,
      observacoes
    } = req.body;

    const atendimento = await AtendimentoGestaoGeral.findById(req.params.id);
    if (!atendimento) {
      return res.status(404).json({ success: false, error: 'Atendimento não encontrado' });
    }

    // 🆕 Normaliza motivos
    let motivosFinal = null;
    if (Array.isArray(motivos) && motivos.length > 0) {
      motivosFinal = [...new Set(motivos.filter(Boolean))];
    } else if (motivo) {
      motivosFinal = [motivo];
    }

    if (motivosFinal && motivosFinal.length > 0) {
      atendimento.motivos = motivosFinal;
      atendimento.motivo = motivosFinal[0];
      atendimento.motivoLabel = AtendimentoGestaoGeral.getMotivosLabels(motivosFinal);
    }

    // 🆕 Normaliza providências
    let providenciasFinal = null;
    if (Array.isArray(providenciasList) && providenciasList.length > 0) {
      providenciasFinal = [...new Set(providenciasList.filter(Boolean))];
    } else if (providencias) {
      providenciasFinal = [providencias];
    }

    if (providenciasFinal && providenciasFinal.length > 0) {
      atendimento.providenciasList = providenciasFinal;
      atendimento.providencias = providenciasFinal[0];
      atendimento.providenciasLabel = AtendimentoGestaoGeral.getProvidenciasLabels(providenciasFinal);
    }

    if (descricaoMotivo !== undefined) {
      if (!descricaoMotivo.trim()) {
        return res.status(400).json({ success: false, error: 'Descrição do motivo é obrigatória' });
      }
      atendimento.descricaoMotivo = descricaoMotivo.trim();
    }
    if (descricaoProvidencias !== undefined) {
      if (!descricaoProvidencias.trim()) {
        return res.status(400).json({ success: false, error: 'Descrição das providências é obrigatória' });
      }
      atendimento.descricaoProvidencias = descricaoProvidencias.trim();
    }
    if (observacoes !== undefined) atendimento.observacoes = observacoes;

    if (dataAtendimento) {
      const parsed = new Date(dataAtendimento + 'T12:00:00');
      if (!isNaN(parsed.getTime())) atendimento.dataAtendimento = parsed;
    }

    // 🆕 Dados do responsável agora sempre podem ser editados
    if (responsavelNome !== undefined) atendimento.responsavelNome = (responsavelNome || '').trim();
    if (responsavelCPF !== undefined) atendimento.responsavelCPF = (responsavelCPF || '').trim();
    if (responsavelTelefone !== undefined) atendimento.responsavelTelefone = (responsavelTelefone || '').trim();
    if (responsavelParentesco !== undefined) atendimento.responsavelParentesco = (responsavelParentesco || '').trim();

    // Valida obrigatoriedade do responsável apenas se tipo = responsavel
    if (atendimento.tipoAtendimento === 'responsavel') {
      if (!atendimento.responsavelNome || atendimento.responsavelNome.trim() === '') {
        return res.status(400).json({ success: false, error: 'Nome do responsável é obrigatório' });
      }
    }

    atendimento.atualizadoEm = new Date();
    await atendimento.save();

    console.log(`✏️ Atendimento editado: ${atendimento.alunoNome} (${atendimento._id}) por ${req.userNome}`);

    const motivosArr = (atendimento.motivos && atendimento.motivos.length > 0)
      ? atendimento.motivos
      : [atendimento.motivo];
    const providenciasArr = (atendimento.providenciasList && atendimento.providenciasList.length > 0)
      ? atendimento.providenciasList
      : [atendimento.providencias];

    res.json({
      success: true,
      message: 'Atendimento atualizado com sucesso!',
      atendimento: {
        id: atendimento._id,
        motivo: atendimento.motivo,
        motivos: motivosArr,
        motivoLabel: AtendimentoGestaoGeral.getMotivosLabels(motivosArr),
        providencias: atendimento.providencias,
        providenciasList: providenciasArr,
        providenciasLabel: AtendimentoGestaoGeral.getProvidenciasLabels(providenciasArr),
        dataAtendimento: atendimento.dataAtendimento,
        dataFormatada: new Date(atendimento.dataAtendimento).toLocaleDateString('pt-BR')
      }
    });
  } catch (error) {
    console.error('Erro ao editar atendimento:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 🗑️ EXCLUIR ATENDIMENTO
// ============================================
router.delete('/:id', authenticateToken, verificarGestaoGeral, async (req, res) => {
  try {
    const atendimento = await AtendimentoGestaoGeral.findByIdAndDelete(req.params.id);
    if (!atendimento) {
      return res.status(404).json({ success: false, error: 'Atendimento não encontrado' });
    }
    console.log(`🗑️ Atendimento excluído: ${atendimento.alunoNome} (${atendimento._id}) por ${req.userNome}`);
    res.json({ success: true, message: 'Atendimento excluído com sucesso' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;