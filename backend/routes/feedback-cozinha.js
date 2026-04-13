const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const FeedbackRefeicao = require('../models/FeedbackRefeicao');
const User = require('../models/User');

// Middleware de autenticação
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, error: 'Token não fornecido' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ success: false, error: 'Token inválido' });
    }
    req.userId = decoded.id;
    req.userRole = decoded.role;
    req.userNome = decoded.nome;
    next();
  });
};

// Verificar permissão para cozinha/admin
const verificarPermissao = (req, res, next) => {
  const allowedRoles = ['cozinha', 'admin', 'super_admin', 'gestao_geral'];
  if (!allowedRoles.includes(req.userRole)) {
    return res.status(403).json({ success: false, error: 'Acesso negado' });
  }
  next();
};

// ============================================
// 🏥 HEALTH CHECK
// ============================================
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'online',
    service: 'Feedback Cozinha',
    timestamp: new Date().toISOString()
  });
});

// ============================================
// 📝 ALUNO ENVIA FEEDBACK
// ============================================
router.post('/enviar', authenticateToken, async (req, res) => {
  try {
    const { tipoRefeicao, nota, comentario, gostou, sugestao, anonimo } = req.body;
    
    const aluno = await User.findById(req.userId);
    if (!aluno) {
      return res.status(404).json({ success: false, error: 'Aluno não encontrado' });
    }
    
    const feedback = new FeedbackRefeicao({
      alunoId: req.userId,
      alunoNome: anonimo ? 'Anônimo' : aluno.nome,
      alunoTurma: anonimo ? '' : aluno.turma,
      tipoRefeicao,
      nota,
      comentario: comentario || '',
      gostou: gostou || null,
      sugestao: sugestao || '',
      anonimo: anonimo || false
    });
    
    await feedback.save();
    
    res.json({
      success: true,
      message: 'Obrigado pelo seu feedback! Sua opinião é muito importante.',
      feedback
    });
    
  } catch (error) {
    console.error('Erro ao salvar feedback:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 📊 COZINHA - ESTATÍSTICAS DOS FEEDBACKS
// ============================================
router.get('/estatisticas', authenticateToken, verificarPermissao, async (req, res) => {
  try {
    const { data, tipoRefeicao } = req.query;
    const hoje = data || new Date().toISOString().split('T')[0];
    
    const filtro = { data: hoje };
    if (tipoRefeicao && tipoRefeicao !== 'todos') {
      filtro.tipoRefeicao = tipoRefeicao;
    }
    
    const feedbacks = await FeedbackRefeicao.find(filtro).sort({ createdAt: -1 });
    
    const notas = feedbacks.filter(f => f.nota).map(f => f.nota);
    const mediaNotas = notas.length > 0 ? (notas.reduce((a,b) => a+b, 0) / notas.length).toFixed(1) : 0;
    
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
    
    res.json({
      success: true,
      estatisticas: {
        total: feedbacks.length,
        mediaNotas,
        distribuicaoNotas,
        gostouStats,
        porRefeicao: {
          manha: feedbacks.filter(f => f.tipoRefeicao === 'manha').length,
          almoco: feedbacks.filter(f => f.tipoRefeicao === 'almoco').length,
          tarde: feedbacks.filter(f => f.tipoRefeicao === 'tarde').length
        }
      },
      ultimosFeedbacks: feedbacks.slice(0, 20),
      data: hoje
    });
    
  } catch (error) {
    console.error('Erro ao buscar estatísticas:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 📋 LISTAR FEEDBACKS
// ============================================
router.get('/listar', authenticateToken, verificarPermissao, async (req, res) => {
  try {
    const { data, tipoRefeicao, limit = 50 } = req.query;
    const filtro = {};
    
    if (data) filtro.data = data;
    if (tipoRefeicao && tipoRefeicao !== 'todos') filtro.tipoRefeicao = tipoRefeicao;
    
    const feedbacks = await FeedbackRefeicao.find(filtro)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));
    
    res.json({
      success: true,
      feedbacks,
      total: feedbacks.length
    });
    
  } catch (error) {
    console.error('Erro ao listar feedbacks:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;