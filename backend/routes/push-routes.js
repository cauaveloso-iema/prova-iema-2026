const express = require('express');
const router = express.Router();
const PushService = require('../services/push-service');
const authenticateToken = require('../middleware/auth');

const pushService = new PushService();

// Inicializar configurações push
pushService.initSettings();

// ===== ROTA PÚBLICA: OBTER CHAVE PÚBLICA =====
router.get('/vapid-public-key', (req, res) => {
    try {
        res.json({
            success: true,
            publicKey: pushService.getPublicKey()
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===== ROTA PÚBLICA: OBTER STATUS DO PUSH (se está ativado) =====
router.get('/status', async (req, res) => {
    try {
        const status = await pushService.getPushStatus();
        res.json({
            success: true,
            ...status
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===== ROTA PARA ADMIN: ATIVAR/DESATIVAR PUSH GLOBAL =====
router.post('/admin/toggle', authenticateToken, async (req, res) => {
    try {
        // Verificar se é admin
        if (req.userRole !== 'admin' && req.userRole !== 'super_admin') {
            return res.status(403).json({
                success: false,
                error: 'Apenas administradores podem ativar/desativar o push global'
            });
        }

        const { ativar } = req.body;
        
        const result = await pushService.setPushAtivado(ativar === true, req.userId);
        
        res.json({
            success: true,
            pushAtivado: result.pushAtivado,
            message: `Push ${ativar ? 'ativado' : 'desativado'} globalmente`
        });

    } catch (error) {
        console.error('❌ Erro ao alterar push:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===== ROTA PARA USUÁRIO: SALVAR SUBSCRIÇÃO =====
router.post('/subscribe', authenticateToken, async (req, res) => {
    try {
        const { subscription, userAgent, deviceInfo } = req.body;
        
        if (!subscription || !subscription.endpoint) {
            return res.status(400).json({
                success: false,
                error: 'Subscription inválida'
            });
        }

        const result = await pushService.salvarSubscription(
            req.userId,
            subscription,
            userAgent || req.headers['user-agent'],
            deviceInfo || ''
        );

        res.json(result);

    } catch (error) {
        console.error('❌ Erro ao salvar subscription:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===== ROTA PARA USUÁRIO: REMOVER SUBSCRIÇÃO =====
router.post('/unsubscribe', authenticateToken, async (req, res) => {
    try {
        const { endpoint } = req.body;
        const result = await pushService.removerSubscription(endpoint);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ===== ROTA PARA ADMIN: TESTAR ENVIO =====
router.post('/testar/:usuarioId', authenticateToken, async (req, res) => {
    try {
        if (req.userRole !== 'admin' && req.userRole !== 'super_admin') {
            return res.status(403).json({
                success: false,
                error: 'Apenas administradores podem testar push'
            });
        }

        const { usuarioId } = req.params;
        const { titulo, mensagem } = req.body;

        const payload = {
            title: titulo || '🔔 Teste de Notificação',
            body: mensagem || 'Esta é uma notificação de teste',
            icon: '/icon-192x192.png',
            data: { url: '/', type: 'teste' }
        };

        const result = await pushService.enviarParaUsuario(usuarioId, payload);
        res.json(result);

    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;