// ============================================================================
// ROTAS DE CONFIGURAÇÕES DO ADMIN
// ============================================================================
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const ConfigService = require('../services/config-service');

const configService = new ConfigService();

// Middleware de autenticação
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ 
            success: false, 
            error: 'Token não fornecido' 
        });
    }
    
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ 
                success: false, 
                error: 'Token inválido' 
            });
        }
        
        if (user.role !== 'admin' && user.role !== 'super_admin') {
            return res.status(403).json({ 
                success: false, 
                error: 'Acesso negado. Apenas administradores podem acessar esta rota.' 
            });
        }
        
        req.userId = user.id;
        req.userRole = user.role;
        next();
    });
};

// ===== SALVAR TODAS AS CONFIGURAÇÕES =====
router.post('/configuracoes', authenticateToken, async (req, res) => {
    try {
        const { configuracoes } = req.body;
        
        if (!configuracoes) {
            return res.status(400).json({
                success: false,
                error: 'Dados de configuração não fornecidos'
            });
        }

        console.log('📦 Configurações recebidas:', JSON.stringify(configuracoes, null, 2));
        
        const result = await configService.salvarConfiguracoes(configuracoes, req.userId);
        
        res.json(result);

    } catch (error) {
        console.error('❌ Erro:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===== CARREGAR CONFIGURAÇÕES =====
router.get('/configuracoes', authenticateToken, async (req, res) => {
    try {
        const result = await configService.carregarConfiguracoes();
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===== OBTER CONFIGURAÇÃO ESPECÍFICA =====
router.get('/configuracoes/:chave', authenticateToken, async (req, res) => {
    try {
        const { chave } = req.params;
        const result = await configService.getConfiguracao(chave);
        
        if (!result.success) {
            return res.status(404).json(result);
        }
        
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===== ATUALIZAR CONFIGURAÇÃO ESPECÍFICA =====
router.put('/configuracoes/:chave', authenticateToken, async (req, res) => {
    try {
        const { chave } = req.params;
        const { valor, descricao, categoria, publico } = req.body;
        
        const result = await configService.atualizarConfiguracao(
            chave, valor, descricao, categoria, publico, req.userId
        );
        
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===== RESETAR CONFIGURAÇÃO =====
router.delete('/configuracoes/:chave', authenticateToken, async (req, res) => {
    try {
        const { chave } = req.params;
        const result = await configService.resetarConfiguracao(chave);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===== RESETAR TODAS CONFIGURAÇÕES =====
router.post('/configuracoes/reset', authenticateToken, async (req, res) => {
    try {
        const result = await configService.resetarTodasConfiguracoes();
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===== OBTER CONFIGURAÇÕES DE NOTIFICAÇÕES =====
router.get('/configuracoes/notificacoes', authenticateToken, async (req, res) => {
    try {
        const result = await configService.getConfiguracoesNotificacoes();
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;