const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const RodizioRefeicao = require('../models/RodizioRefeicao');
const Refeicao = require('../models/Refeicao');

// Middleware de autenticação (igual ao do server.js)
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ 
      success: false, 
      error: 'Acesso negado. Token não fornecido.' 
    });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ 
        success: false, 
        error: 'Token inválido ou expirado.' 
      });
    }
    req.userId = decoded.id;
    req.userRole = decoded.role;
    req.userNome = decoded.nome;
    next();
  });
};

// Middleware específico para gestão geral
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
// 🏥 HEALTH CHECK - Rota de teste
// ============================================
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'online',
    service: 'Gestão Geral - Rodízio de Refeições',
    timestamp: new Date().toISOString()
  });
});

// ============================================
// 📋 LISTAR TODOS OS RODÍZIOS
// ============================================
router.get('/rodizios',
  authenticateToken,
  verificarGestaoGeral,
  async (req, res) => {
    try {
      const rodizios = await RodizioRefeicao.find().sort({ turma: 1 });
      
      const todasTurmas = await User.distinct('turma', { 
        role: 'aluno', 
        ativo: true, 
        turma: { $ne: null, $ne: '' } 
      });
      
      res.json({
        success: true,
        rodizios,
        todasTurmas,
        total: rodizios.length
      });
    } catch (error) {
      console.error('Erro ao listar rodízios:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao listar rodízios: ' + error.message
      });
    }
  }
);

// ============================================
// 🔍 BUSCAR RODÍZIO POR TURMA
// ============================================
router.get('/rodizios/:turma',
  authenticateToken,
  verificarGestaoGeral,
  async (req, res) => {
    try {
      const { turma } = req.params;
      const rodizio = await RodizioRefeicao.findOne({ turma });
      
      res.json({
        success: true,
        rodizio: rodizio || null
      });
    } catch (error) {
      console.error('Erro ao buscar rodízio:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao buscar rodízio: ' + error.message
      });
    }
  }
);

// ============================================
// ➕ CRIAR/ATUALIZAR RODÍZIO
// ============================================
router.post('/rodizios',
  authenticateToken,
  verificarGestaoGeral,
  async (req, res) => {
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
        
        await rodizio.save();
        
        res.json({
          success: true,
          message: 'Rodízio atualizado com sucesso!',
          rodizio
        });
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
        
        await rodizio.save();
        
        res.json({
          success: true,
          message: 'Rodízio criado com sucesso!',
          rodizio
        });
      }
    } catch (error) {
      console.error('Erro ao salvar rodízio:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao salvar rodízio: ' + error.message
      });
    }
  }
);

// ============================================
// 🗑️ EXCLUIR RODÍZIO
// ============================================
router.delete('/rodizios/:turma',
  authenticateToken,
  verificarGestaoGeral,
  async (req, res) => {
    try {
      const { turma } = req.params;
      const result = await RodizioRefeicao.deleteOne({ turma });
      
      if (result.deletedCount === 0) {
        return res.status(404).json({ success: false, error: 'Rodízio não encontrado' });
      }
      
      res.json({
        success: true,
        message: 'Rodízio excluído com sucesso!'
      });
    } catch (error) {
      console.error('Erro ao excluir rodízio:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao excluir rodízio: ' + error.message
      });
    }
  }
);

// ============================================
// 📊 ESTATÍSTICAS DOS RODÍZIOS
// ============================================
router.get('/estatisticas',
  authenticateToken,
  verificarGestaoGeral,
  async (req, res) => {
    try {
      const totalRodizios = await RodizioRefeicao.countDocuments();
      const rodiziosAtivos = await RodizioRefeicao.countDocuments({ ativo: true });
      const rodiziosInativos = totalRodizios - rodiziosAtivos;
      
      const todasTurmas = await User.distinct('turma', { 
        role: 'aluno', 
        ativo: true, 
        turma: { $ne: null, $ne: '' } 
      });
      
      const turmasComRodizio = await RodizioRefeicao.distinct('turma', { ativo: true });
      const turmasSemRodizio = todasTurmas.filter(t => !turmasComRodizio.includes(t));
      
      res.json({
        success: true,
        estatisticas: {
          totalRodizios,
          rodiziosAtivos,
          rodiziosInativos,
          totalTurmas: todasTurmas.length,
          turmasComRodizio: turmasComRodizio.length,
          turmasSemRodizio: turmasSemRodizio.length,
          turmasSemRodizioLista: turmasSemRodizio
        }
      });
    } catch (error) {
      console.error('Erro ao buscar estatísticas:', error);
      res.status(500).json({
        success: false,
        error: 'Erro ao buscar estatísticas: ' + error.message
      });
    }
  }
);

module.exports = router;