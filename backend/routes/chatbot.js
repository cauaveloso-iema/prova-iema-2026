// ============================================================================
// ROUTES/CHATBOT.JS
// ============================================================================
// Descrição: Rotas do chatbot (autenticadas e públicas)
// Autor:     Equipe de Desenvolvimento
// ============================================================================

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

// Importar backend do chatbot
const ChatbotBackend = require('../chatbot');
const chatbot = new ChatbotBackend();

// ============================================================================
// MIDDLEWARE DE AUTENTICAÇÃO OPCIONAL (para rotas protegidas)
// ============================================================================
/**
 * Middleware que valida o token JWT, mas NÃO bloqueia a requisição se ausente.
 * Popula req.userId, req.userRole e req.userNome se o token for válido.
 */
const autenticarOpcional = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        req.userId = null;
        req.userRole = null;
        req.userNome = null;
        return next();
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            req.userId = null;
            req.userRole = null;
            req.userNome = null;
        } else {
            req.userId = decoded.id;
            req.userRole = decoded.role;
            req.userNome = decoded.nome;
        }
        next();
    });
};

// ============================================================================
// ROTAS AUTENTICADAS
// ============================================================================

/**
 * POST /api/chatbot/message
 * Processa uma mensagem do usuário autenticado.
 */
router.post('/message', autenticarOpcional, async (req, res) => {
    try {
        const { message, sessionId, conversationHistory, context } = req.body;

        const result = await chatbot.processMessage({
            message,
            route: req.headers.referer || req.headers.origin || req.body.route || '/',
            conversationHistory: conversationHistory || [],
            userId: req.userId,
            context: context || {}
        });

        res.json(result);
    } catch (error) {
        logger.error('❌ Erro no chatbot:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao processar mensagem do chatbot',
            message: error.message
        });
    }
});

/**
 * GET /api/chatbot/context
 * Retorna o contexto do usuário para o chatbot.
 */
router.get('/context', autenticarOpcional, (req, res) => {
    try {
        const route = req.query.route || req.headers.referer || '/';
        const userRole = req.userRole || 'visitante';
        const userName = req.userNome || 'Usuário';

        const context = {
            user: {
                id: req.userId,
                name: userName,
                role: userRole
            },
            route,
            page: route.includes('professor') ? 'professor'
                : route.includes('aluno') ? 'aluno'
                : route.includes('login') ? 'login'
                : 'general',
            timestamp: new Date().toISOString()
        };

        res.json({
            success: true,
            context
        });
    } catch (error) {
        logger.error('❌ Erro ao obter contexto:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao obter contexto'
        });
    }
});

// ============================================================================
// ROTAS PÚBLICAS
// ============================================================================

/**
 * POST /api/chatbot/public/message
 * Processa mensagem sem autenticação.
 */
router.post('/public/message', async (req, res) => {
    try {
        const { message, sessionId, conversationHistory, context } = req.body;

        const result = await chatbot.processMessage({
            message,
            route: req.headers.referer || req.headers.origin || req.body.route || '/',
            conversationHistory: conversationHistory || [],
            context: context || {}
        });

        res.json(result);
    } catch (error) {
        logger.error('❌ Erro no chatbot público:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao processar mensagem do chatbot',
            message: error.message
        });
    }
});

/**
 * GET /api/chatbot/health
 * Health check do chatbot.
 */
router.get('/health', async (req, res) => {
    try {
        const health = await chatbot.healthCheck();
        res.json({
            success: true,
            chatbot: health,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Erro no health check do chatbot'
        });
    }
});

// ============================================================================
// EXPORTAR ROUTER
// ============================================================================
module.exports = router;