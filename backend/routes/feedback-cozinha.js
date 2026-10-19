// ============================================================================
// FEEDBACK COZINHA - EducaPleno
// ============================================================================
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const FeedbackRefeicao = require('../models/FeedbackRefeicao');
const User = require('../models/User');

// ============================================================================
// MIDDLEWARES
// ============================================================================
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, error: 'Token não fornecido' });
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ success: false, error: 'Token inválido' });
    req.userId = decoded.id;
    req.userRole = decoded.role;
    req.userNome = decoded.nome;
    next();
  });
};

const verificarPermissao = (req, res, next) => {
  const allowedRoles = ['cozinha', 'admin', 'super_admin', 'gestao_geral'];
  if (!allowedRoles.includes(req.userRole)) {
    return res.status(403).json({ success: false, error: 'Acesso negado' });
  }
  next();
};

// ============================================================================
// 🏥 HEALTH CHECK
// ============================================================================
router.get('/health', (req, res) => {
  res.json({ success: true, status: 'online', service: 'Feedback Cozinha', timestamp: new Date().toISOString() });
});

// ============================================================================
// 🌐 PÚBLICA: CURSOS E TURMAS
// ============================================================================
router.get('/publico/cursos-turmas', async (req, res) => {
  try {
    const alunos = await User.find({ role: 'aluno', ativo: true }).select('curso turma').lean();
    const cursosMap = {};
    alunos.forEach(aluno => {
      const curso = (aluno.curso || '').trim();
      const turma = (aluno.turma || '').trim();
      if (!curso || !turma) return;
      if (!cursosMap[curso]) cursosMap[curso] = new Set();
      cursosMap[curso].add(turma);
    });
    const cursos = Object.entries(cursosMap)
      .map(([curso, turmasSet]) => ({ curso, turmas: Array.from(turmasSet).sort() }))
      .sort((a, b) => a.curso.localeCompare(b.curso));
    res.json({ success: true, total: cursos.length, cursos });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// 🌐 PÚBLICA: ALUNOS DE UMA TURMA
// ============================================================================
router.get('/publico/alunos-turma', async (req, res) => {
  try {
    const { turma, curso } = req.query;
    if (!turma) return res.status(400).json({ success: false, error: 'Parâmetro "turma" é obrigatório' });

    const query = { role: 'aluno', ativo: true, turma: turma.trim() };
    if (curso) query.curso = curso.trim();

    const alunos = await User.find(query).select('_id nome matricula').sort({ nome: 1 }).lean();
    res.json({ success: true, total: alunos.length, alunos });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// 📝 PÚBLICA: ENVIAR FEEDBACK
// ============================================================================
router.post('/enviar', async (req, res) => {
  try {
    let usuarioLogado = null;
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        usuarioLogado = await User.findById(decoded.id).select('nome curso turma');
      } catch (err) { }
    }

    const { tipoRefeicao, nota, comentario, gostou, sugestao, anonimo, nome, curso, turma, alunoId } = req.body;

    if (!tipoRefeicao || !['manha', 'almoco', 'tarde'].includes(tipoRefeicao)) {
      return res.status(400).json({ success: false, error: 'Tipo de refeição inválido' });
    }
    if (!nota || nota < 1 || nota > 5) {
      return res.status(400).json({ success: false, error: 'Nota deve ser entre 1 e 5' });
    }
    if (!anonimo && (!nome || !curso || !turma)) {
      return res.status(400).json({ success: false, error: 'Nome, curso e turma são obrigatórios' });
    }

    let nomeFinal, cursoFinal, turmaFinal, idFinal;
    if (anonimo) {
      nomeFinal = 'Anônimo';
      cursoFinal = '';
      turmaFinal = '';
      idFinal = new mongoose.Types.ObjectId();
    } else {
      nomeFinal = nome.trim();
      cursoFinal = curso.trim();
      turmaFinal = turma.trim();
      idFinal = alunoId || (usuarioLogado ? usuarioLogado._id : new mongoose.Types.ObjectId());
    }

    const novoFeedback = new FeedbackRefeicao({
      alunoId: idFinal,
      alunoNome: nomeFinal,
      alunoTurma: turmaFinal,
      alunoCurso: cursoFinal,
      tipoRefeicao,
      nota,
      comentario: (comentario || '').trim(),
      gostou: gostou || null,
      sugestao: (sugestao || '').trim(),
      anonimo: !!anonimo
    });

    await novoFeedback.save();

    res.json({
      success: true,
      message: anonimo ? 'Obrigado pelo seu feedback anônimo!' : 'Obrigado pelo seu feedback!'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// 📊 ESTATÍSTICAS
// ============================================================================
router.get('/estatisticas', authenticateToken, verificarPermissao, async (req, res) => {
  try {
    const { data, tipoRefeicao } = req.query;
    const hoje = data || new Date().toISOString().split('T')[0];

    const filtro = { data: hoje };
    if (tipoRefeicao && tipoRefeicao !== 'todos') filtro.tipoRefeicao = tipoRefeicao;

    const feedbacks = await FeedbackRefeicao.find(filtro).sort({ createdAt: -1 });
    const notas = feedbacks.filter(f => f.nota).map(f => f.nota);
    const mediaNotas = notas.length > 0 ? (notas.reduce((a, b) => a + b, 0) / notas.length).toFixed(1) : 0;

    const distribuicaoNotas = {
      1: feedbacks.filter(f => f.nota === 1).length,
      2: feedbacks.filter(f => f.nota === 2).length,
      3: feedbacks.filter(f => f.nota === 3).length,
      4: feedbacks.filter(f => f.nota === 4).length,
      5: feedbacks.filter(f => f.nota === 5).length
    };

    const gostouStats = {
      sim: feedbacks.filter(f => f.gostou === 'sim').length,
      mais_ou_menos: feedbacks.filter(f => f.gostou === 'mais_ou_menos').length,
      nao: feedbacks.filter(f => f.gostou === 'nao').length
    };

    const porRefeicao = {
      manha: feedbacks.filter(f => f.tipoRefeicao === 'manha').length,
      almoco: feedbacks.filter(f => f.tipoRefeicao === 'almoco').length,
      tarde: feedbacks.filter(f => f.tipoRefeicao === 'tarde').length
    };

    const anonimos = feedbacks.filter(f => f.anonimo === true).length;
    const identificados = feedbacks.length - anonimos;

    res.json({
      success: true,
      estatisticas: {
        total: feedbacks.length,
        mediaNotas,
        distribuicaoNotas,
        gostouStats,
        porRefeicao,
        anonimos,
        identificados
      },
      ultimosFeedbacks: feedbacks.slice(0, 50),
      data: hoje
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// 📋 LISTAR FEEDBACKS
// ============================================================================
router.get('/listar', authenticateToken, verificarPermissao, async (req, res) => {
  try {
    const { data, tipoRefeicao, limit = 50 } = req.query;
    const filtro = {};
    if (data) filtro.data = data;
    if (tipoRefeicao && tipoRefeicao !== 'todos') filtro.tipoRefeicao = tipoRefeicao;

    const feedbacks = await FeedbackRefeicao.find(filtro).sort({ createdAt: -1 }).limit(parseInt(limit));
    res.json({ success: true, feedbacks, total: feedbacks.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// 👁️ VER FEEDBACK ESPECÍFICO
// ============================================================================
router.get('/:id', authenticateToken, verificarPermissao, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, error: 'ID inválido' });
    }
    const feedback = await FeedbackRefeicao.findById(req.params.id);
    if (!feedback) {
      return res.status(404).json({ success: false, error: 'Feedback não encontrado' });
    }
    res.json({ success: true, feedback });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// ✏️ EDITAR FEEDBACK
// ============================================================================
router.put('/:id', authenticateToken, verificarPermissao, async (req, res) => {
  try {
    const { nota, comentario, sugestao, gostou, tipoRefeicao, alunoNome, alunoTurma, alunoCurso } = req.body;

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, error: 'ID inválido' });
    }

    const feedback = await FeedbackRefeicao.findById(req.params.id);
    if (!feedback) {
      return res.status(404).json({ success: false, error: 'Feedback não encontrado' });
    }

    if (nota !== undefined && (nota < 1 || nota > 5)) {
      return res.status(400).json({ success: false, error: 'Nota deve ser entre 1 e 5' });
    }

    if (nota !== undefined) feedback.nota = nota;
    if (comentario !== undefined) feedback.comentario = (comentario || '').trim();
    if (sugestao !== undefined) feedback.sugestao = (sugestao || '').trim();
    if (gostou !== undefined) feedback.gostou = gostou || null;
    if (tipoRefeicao) feedback.tipoRefeicao = tipoRefeicao;
    if (alunoNome !== undefined) feedback.alunoNome = alunoNome.trim();
    if (alunoTurma !== undefined) feedback.alunoTurma = alunoTurma.trim();
    if (alunoCurso !== undefined) feedback.alunoCurso = alunoCurso.trim();

    await feedback.save();

    res.json({ success: true, message: 'Feedback atualizado com sucesso!', feedback });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// 🗑️ EXCLUIR FEEDBACK
// ============================================================================
router.delete('/:id', authenticateToken, verificarPermissao, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, error: 'ID inválido' });
    }
    const feedback = await FeedbackRefeicao.findByIdAndDelete(req.params.id);
    if (!feedback) {
      return res.status(404).json({ success: false, error: 'Feedback não encontrado' });
    }
    res.json({ success: true, message: 'Feedback excluído com sucesso!' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;