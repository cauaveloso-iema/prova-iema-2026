// routes/visitas-professor.js
// Acompanhamento de Visitas do Professor
// Mostra APENAS os termos onde o professor está como coordenador

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const TermoVisita = require('../models/TermoVisita');
const User = require('../models/User');

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

const verificarProfessor = (req, res, next) => {
  const allowedRoles = ['professor', 'admin', 'super_admin'];
  if (!allowedRoles.includes(req.userRole)) {
    return res.status(403).json({ success: false, error: 'Acesso restrito a professores' });
  }
  next();
};

// ============================================
// HEALTH
// ============================================
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'Acompanhamento de Visitas - Professor',
    status: 'online',
    timestamp: new Date().toISOString()
  });
});

// ============================================
// LISTAR VISITAS DO PROFESSOR
// Retorna apenas termos onde o professor está no array `professores`
// ============================================
router.get('/minhas-visitas', authenticateToken, verificarProfessor, async (req, res) => {
  try {
    const professorId = req.userId;
    const { status, turma, busca, page = 1, limit = 50 } = req.query;

    // Converter para ObjectId
    let objectIdProfessor;
    try {
      objectIdProfessor = new mongoose.Types.ObjectId(professorId);
    } catch (e) {
      return res.status(400).json({ success: false, error: 'ID de professor inválido' });
    }

    // 🔥 QUERY PRINCIPAL: apenas visitas onde o professor está como coordenador
    let query = {
      ativo: true,
      'professores.professorId': objectIdProfessor
    };

    if (status && status !== 'todos') {
      query.status = status;
    }

    if (turma && turma !== 'todas' && turma !== '') {
      query.turmaPrincipal = turma;
    }

    if (busca && busca.trim() !== '') {
      const termoBusca = busca.trim();
      query.$or = [
        { 'alunos.nome': { $regex: termoBusca, $options: 'i' } },
        { 'alunos.matricula': { $regex: termoBusca, $options: 'i' } },
        { codigo: { $regex: termoBusca, $options: 'i' } },
        { atividade: { $regex: termoBusca, $options: 'i' } },
        { local: { $regex: termoBusca, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [termosRaw, total] = await Promise.all([
      TermoVisita.find(query)
        .sort({ dataVisita: 1, createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      TermoVisita.countDocuments(query)
    ]);

    console.log(`   ✅ ${termosRaw.length} termo(s) encontrado(s)`);

    // Normalizar
    const termos = termosRaw.map(t => {
      const primeiroAluno = t.alunos?.[0];
      const nomeAluno = t.alunos?.length > 1
        ? `${primeiroAluno?.nome || 'Aluno'} + ${t.alunos.length - 1}`
        : (primeiroAluno?.nome || 'Aluno');

      const responsaveis = t.responsaveis || [];
      const autorizados = responsaveis.filter(r => r.status === 'autorizado').length;
      const recusados = responsaveis.filter(r => r.status === 'recusado').length;
      const pendentes = responsaveis.filter(r => r.status === 'pendente' || !r.status).length;

      return {
        _id: t._id,
        id: t._id,
        codigo: t.codigo,
        atividade: t.atividade,
        descricaoAtividade: t.descricaoAtividade || '',
        local: t.local,
        localizacao: t.localizacao,
        dataVisita: t.dataVisita,
        periodo: t.periodo,
        horario: t.horario,
        cidade: t.cidade,
        status: t.status,
        statusData: t.statusData,

        // Alunos
        alunoNome: nomeAluno,
        alunoTurma: primeiroAluno?.turma || t.turmaPrincipal || 'N/A',
        alunoCurso: primeiroAluno?.curso || t.cursoPrincipal || 'N/A',
        alunos: (t.alunos || []).map(a => ({
          alunoId: a.alunoId,
          nome: a.nome,
          matricula: a.matricula,
          turma: a.turma,
          curso: a.curso
        })),
        totalAlunos: t.alunos?.length || 1,

        // Professores
        professores: (t.professores || []).map(p => ({
          professorId: p.professorId,
          nome: p.nome,
          matricula: p.matricula,
          eixo: p.eixo
        })),
        totalProfessores: t.professores?.length || 1,

        // Responsáveis (resumo, SEM dados sensíveis)
        responsaveis: responsaveis.map(r => ({
          alunoId: r.alunoId,
          alunoNome: r.alunoNome,
          nome: r.nome ? r.nome.split(' ')[0] + ' ***' : 'Aguardando',
          status: r.status || 'pendente',
          lgpdAceito: r.lgpdAceito || false,
          assinaturaData: r.assinaturaData || null,
          recusaData: r.recusaData || null,
          motivoRecusa: r.motivoRecusa || null
        })),
        totalResponsaveis: responsaveis.length,
        responsaveisAutorizados: autorizados,
        responsaveisRecusados: recusados,
        responsaveisPendentes: pendentes,
        progressoAutorizacao: responsaveis.length > 0
          ? Math.round((autorizados / responsaveis.length) * 100)
          : 0,

        createdAt: t.createdAt,
        updatedAt: t.updatedAt
      };
    });

    // Estatísticas gerais do professor
    const [totalGeral, pendentesGeral, parciaisGeral, autorizadosGeral, recusadosGeral] = await Promise.all([
      TermoVisita.countDocuments({ ativo: true, 'professores.professorId': objectIdProfessor }),
      TermoVisita.countDocuments({ ativo: true, 'professores.professorId': objectIdProfessor, status: 'pendente' }),
      TermoVisita.countDocuments({ ativo: true, 'professores.professorId': objectIdProfessor, status: 'parcialmente_autorizado' }),
      TermoVisita.countDocuments({ ativo: true, 'professores.professorId': objectIdProfessor, status: 'autorizado' }),
      TermoVisita.countDocuments({ ativo: true, 'professores.professorId': objectIdProfessor, status: 'recusado' })
    ]);

    // Turmas do professor (para o filtro)
    const turmasRaw = await TermoVisita.distinct('turmaPrincipal', {
      ativo: true,
      'professores.professorId': objectIdProfessor,
      turmaPrincipal: { $nin: [null, '', 'N/A'] }
    });

    const turmas = (turmasRaw || []).filter(Boolean).sort();

    res.json({
      success: true,
      termos,
      total,
      paginacao: {
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      },
      estatisticas: {
        total: totalGeral,
        pendentes: pendentesGeral,
        parciais: parciaisGeral,
        autorizados: autorizadosGeral,
        recusados: recusadosGeral
      },
      turmas,
      professorId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ [VISITAS-PROFESSOR] Erro:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// DETALHES DE UMA VISITA ESPECÍFICA
// Só permite se o professor estiver vinculado
// ============================================
router.get('/minhas-visitas/:id', authenticateToken, verificarProfessor, async (req, res) => {
  try {
    const professorId = req.userId;
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, error: 'ID inválido' });
    }

    const objectIdProfessor = new mongoose.Types.ObjectId(professorId);

    // 🔥 Busca apenas se o professor estiver vinculado
    const termo = await TermoVisita.findOne({
      _id: id,
      ativo: true,
      'professores.professorId': objectIdProfessor
    }).lean();

    if (!termo) {
      return res.status(404).json({
        success: false,
        error: 'Visita não encontrada ou você não tem acesso a ela'
      });
    }

    const primeiroAluno = termo.alunos?.[0];
    const responsaveis = termo.responsaveis || [];
    const autorizados = responsaveis.filter(r => r.status === 'autorizado').length;
    const recusados = responsaveis.filter(r => r.status === 'recusado').length;
    const pendentes = responsaveis.filter(r => r.status === 'pendente' || !r.status).length;

    const normalizado = {
      _id: termo._id,
      id: termo._id,
      codigo: termo.codigo,
      atividade: termo.atividade,
      descricaoAtividade: termo.descricaoAtividade || '',
      local: termo.local,
      localizacao: termo.localizacao,
      dataVisita: termo.dataVisita,
      periodo: termo.periodo,
      horario: termo.horario,
      cidade: termo.cidade,
      status: termo.status,
      statusData: termo.statusData,

      alunoNome: termo.alunos?.length > 1
        ? `${primeiroAluno?.nome || 'Aluno'} + ${termo.alunos.length - 1}`
        : (primeiroAluno?.nome || 'Aluno'),
      alunoTurma: primeiroAluno?.turma || termo.turmaPrincipal || 'N/A',
      alunoCurso: primeiroAluno?.curso || termo.cursoPrincipal || 'N/A',
      alunos: (termo.alunos || []).map(a => ({
        alunoId: a.alunoId,
        nome: a.nome,
        matricula: a.matricula,
        turma: a.turma,
        curso: a.curso
      })),
      totalAlunos: termo.alunos?.length || 1,

      professores: (termo.professores || []).map(p => ({
        professorId: p.professorId,
        nome: p.nome,
        matricula: p.matricula,
        eixo: p.eixo
      })),
      totalProfessores: termo.professores?.length || 1,

      responsaveis: responsaveis.map(r => ({
        alunoId: r.alunoId,
        alunoNome: r.alunoNome,
        nome: r.nome || 'Aguardando',
        status: r.status || 'pendente',
        autenticado: r.autenticado || false,
        lgpdAceito: r.lgpdAceito || false,
        lgpdAceitoData: r.lgpdAceitoData || null,
        assinaturaData: r.assinaturaData || null,
        recusaData: r.recusaData || null,
        motivoRecusa: r.motivoRecusa || null,
        localizacaoAssinatura: r.localizacaoAssinatura || null
      })),
      totalResponsaveis: responsaveis.length,
      responsaveisAutorizados: autorizados,
      responsaveisRecusados: recusados,
      responsaveisPendentes: pendentes,
      progressoAutorizacao: responsaveis.length > 0
        ? Math.round((autorizados / responsaveis.length) * 100)
        : 0,

      assinaturaGestor: termo.assinaturaGestor ? {
        nome: termo.assinaturaGestor.nome,
        cargo: termo.assinaturaGestor.cargo,
        data: termo.assinaturaGestor.data
      } : null,

      createdAt: termo.createdAt,
      updatedAt: termo.updatedAt
    };

    res.json({ success: true, termo: normalizado });

  } catch (error) {
    console.error('❌ [VISITAS-PROFESSOR] Erro no detalhe:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;