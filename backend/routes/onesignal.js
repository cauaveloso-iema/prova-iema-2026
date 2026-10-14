// ============================================================================
// ROUTES/ONESIGNAL.JS
// ============================================================================
// Descrição: Rotas NÃO-ADMIN do OneSignal (vínculo de usuário + push pessoal)
//
// ⚠️ IMPORTANTE:
//   - As rotas administrativas (/api/admin/onesignal/*) continuam em routes/admin.js
//   - Este arquivo trata APENAS as rotas públicas/de usuário + push individual
//   - A rota POST /subscribe fica em routes/push-routes.js (para não colidir)
//
// MONTAGEM no server.js:
//   app.use('/api/onesignal', oneSignalRoutes);
//   app.use('/api/usuario', oneSignalRoutes);
//   app.use('/api/push', oneSignalRoutes);
//
// Autor: Equipe de Desenvolvimento
// ============================================================================

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const logger = require('../utils/logger');

const User = require('../models/User');

// ============================================================================
// MIDDLEWARE LOCAL DE AUTENTICAÇÃO
// ============================================================================
/**
 * Valida o token JWT e popula req.userId, req.userRole, req.userNome.
 * Bloqueia a requisição se o token estiver ausente ou inválido.
 */
const authenticateTokenLocal = (req, res, next) => {
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

// ============================================================================
// ROTA: VÍNCULO KODULAR (app Android via token)
// ============================================================================
/**
 * POST /api/onesignal/vincular-kodular
 * Vincula um playerId a um usuário autenticado via token.
 * Usado pelo app nativo (Kodular) para vincular dispositivo.
 */
router.post('/vincular-kodular', async (req, res) => {
    try {
        logger.info('='.repeat(60));
        logger.info('📱 [KODULAR] Requisição de vínculo recebida');

        const { playerId, token } = req.body;

        if (!playerId) {
            return res.status(400).json({ success: false, error: 'playerId é obrigatório' });
        }
        if (!token) {
            return res.status(400).json({ success: false, error: 'token é obrigatório' });
        }

        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (jwtError) {
            return res.status(401).json({
                success: false,
                error: 'Token inválido ou expirado',
                motivo: jwtError.name
            });
        }

        const userId = decoded.id;
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
        }

        // Desvincular de outro usuário se necessário
        const outroUsuario = await User.findOne({
            onesignalPlayerId: playerId,
            _id: { $ne: userId }
        });

        if (outroUsuario) {
            logger.info(`   ⚠️ PlayerId já estava com ${outroUsuario.nome}. Desvinculando...`);
            await User.findByIdAndUpdate(outroUsuario._id, {
                $unset: { onesignalPlayerId: 1 }
            });
        }

        if (user.onesignalPlayerId === playerId) {
            return res.json({
                success: true,
                message: 'Dispositivo já estava vinculado',
                alreadyLinked: true,
                playerId,
                usuario: {
                    id: user._id,
                    nome: user.nome,
                    email: user.email,
                    role: user.role
                }
            });
        }

        user.onesignalPlayerId = playerId;
        user.ultimaValidacaoPush = new Date();
        await user.save();

        logger.info(`   ✅ VÍNCULO REALIZADO: ${user.nome}`);
        logger.info('='.repeat(60));

        res.json({
            success: true,
            message: 'Dispositivo vinculado com sucesso!',
            alreadyLinked: false,
            playerId,
            usuario: {
                id: user._id,
                nome: user.nome,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        logger.error('❌ Erro vínculo Kodular:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// ROTA: VERIFICAR VÍNCULO
// ============================================================================
/**
 * POST /api/onesignal/verificar-vinculo
 * Retorna se o playerId está vinculado e a qual usuário.
 */
router.post('/verificar-vinculo', async (req, res) => {
    try {
        const { playerId } = req.body;

        if (!playerId) {
            return res.status(400).json({ success: false, error: 'playerId é obrigatório' });
        }

        const usuario = await User.findOne({ onesignalPlayerId: playerId })
            .select('nome email role matricula');

        if (usuario) {
            return res.json({
                success: true,
                vinculado: true,
                usuario: {
                    id: usuario._id,
                    nome: usuario.nome,
                    email: usuario.email,
                    role: usuario.role
                }
            });
        }

        res.json({
            success: true,
            vinculado: false,
            mensagem: 'Dispositivo ainda não está vinculado a nenhum usuário'
        });
    } catch (error) {
        logger.error('❌ Erro ao verificar vínculo:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// ROTA: VINCULAR POR LINK (usuário clicou na notificação)
// ============================================================================
/**
 * POST /api/onesignal/vincular-por-link
 * Vincula dispositivo quando o usuário clica no link da notificação.
 */
router.post('/vincular-por-link', async (req, res) => {
    try {
        const { playerId, token } = req.body;

        logger.info(`🔗 [LINK] Vínculo por clique na notificação`);
        logger.info(`   📱 PlayerId: ${playerId?.substring(0, 20)}...`);

        if (!playerId) {
            return res.status(400).json({ success: false, error: 'Player ID é obrigatório' });
        }
        if (!token) {
            return res.status(400).json({ success: false, error: 'Você precisa estar logado para vincular' });
        }

        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (err) {
            return res.status(401).json({ success: false, error: 'Token inválido ou expirado' });
        }

        const userId = decoded.id;
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
        }

        const outroUsuario = await User.findOne({
            onesignalPlayerId: playerId,
            _id: { $ne: userId }
        });

        if (outroUsuario) {
            logger.info(`   🔄 Desvinculando de ${outroUsuario.nome}`);
            await User.findByIdAndUpdate(outroUsuario._id, {
                $unset: { onesignalPlayerId: 1, ultimaValidacaoPush: 1 }
            });
        }

        user.onesignalPlayerId = playerId;
        user.ultimaValidacaoPush = new Date();
        await user.save();

        logger.info(`   ✅ VÍNCULO REALIZADO: ${user.nome}`);

        // Notificação interna
        try {
            const Notificacao = mongoose.model('Notificacao');
            if (Notificacao) {
                await new Notificacao({
                    usuarioId: user._id,
                    tipo: 'sistema',
                    titulo: '📱 Dispositivo Vinculado!',
                    mensagem: 'Este dispositivo foi vinculado com sucesso à sua conta. Agora você receberá notificações!',
                    icone: '📱',
                    cor: '#10b981',
                    link: '/perfil',
                    prioridade: 2
                }).save();
            }
        } catch (notifErr) {
            logger.warn('   ⚠️ Erro ao criar notificação:', notifErr.message);
        }

        res.json({
            success: true,
            message: 'Dispositivo vinculado com sucesso!',
            usuario: {
                nome: user.nome,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        logger.error('❌ Erro:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// ROTA: SALVAR PLAYER-ID (usuário logado)
// ============================================================================
/**
 * POST /api/usuario/salvar-player-id
 * Salva o playerId do usuário autenticado.
 */
router.post('/salvar-player-id', authenticateTokenLocal, async (req, res) => {
    try {
        const { playerId } = req.body;
        await User.findByIdAndUpdate(req.userId, { onesignalPlayerId: playerId });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// ROTA: ENVIAR PUSH PARA USUÁRIO
// ============================================================================
/**
 * POST /api/usuario/enviar-push
 * Envia push para um usuário específico.
 */
router.post('/enviar-push', authenticateTokenLocal, async (req, res) => {
    try {
        const { usuarioId, titulo, mensagem, dados = {} } = req.body;

        if (!usuarioId || !titulo || !mensagem) {
            return res.status(400).json({
                success: false,
                error: 'usuarioId, titulo e mensagem são obrigatórios'
            });
        }

        const OneSignalService = require('../services/onesignal-service');
        const oneSignal = new OneSignalService();

        const resultado = await oneSignal.enviarPush(usuarioId, titulo, mensagem, {
            ...dados,
            origem: 'sistema',
            timestamp: Date.now()
        });

        if (resultado) {
            res.json({
                success: true,
                notificationId: resultado.notificationId || resultado.id
            });
        } else {
            res.status(500).json({ success: false, error: 'Falha ao enviar push' });
        }
    } catch (error) {
        logger.error('❌ Erro ao enviar push:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// ROTA: VERIFICAR PUSH-ID DO USUÁRIO LOGADO
// ============================================================================
/**
 * GET /api/usuario/verificar-push-id
 * Verifica se o usuário logado tem playerId cadastrado.
 */
router.get('/verificar-push-id', authenticateTokenLocal, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select('onesignalPlayerId');
        res.json({
            success: true,
            temPlayerId: !!user?.onesignalPlayerId,
            playerId: user?.onesignalPlayerId || null
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// ROTA: TESTAR PUSH
// ============================================================================
/**
 * POST /api/usuario/testar-push
 * Envia push de teste para o usuário logado.
 */
router.post('/testar-push', authenticateTokenLocal, async (req, res) => {
    try {
        const OneSignalService = require('../services/onesignal-service');
        const oneSignal = new OneSignalService();

        const resultado = await oneSignal.enviarPush(
            req.userId,
            '🔔 TESTE DO SISTEMA',
            'Notificação de teste em ' + new Date().toLocaleTimeString(),
            { tipo: 'teste', timestamp: Date.now() }
        );

        if (resultado) {
            res.json({ success: true, message: 'Push enviado!' });
        } else {
            res.json({ success: false, error: 'Falha ao enviar push' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// ROTA: STATUS DO PUSH
// ============================================================================
/**
 * GET /api/usuario/status-push
 * Retorna o status do push no sistema e para o usuário.
 */
router.get('/status-push', authenticateTokenLocal, async (req, res) => {
    try {
        const Config = mongoose.model('Config');
        const config = await Config.findOne({ chave: 'notificacoes' });
        const pushAtivado = config?.valor?.push === true;

        const user = await User.findById(req.userId).select('onesignalPlayerId');

        res.json({
            success: true,
            pushAtivado,
            temPlayerId: !!user?.onesignalPlayerId,
            playerId: user?.onesignalPlayerId ? '✅ Cadastrado' : '❌ Não cadastrado',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// ROTA: ADMIN ATIVAR/DESATIVAR PUSH GLOBAL
// ============================================================================
/**
 * POST /api/push/admin/toggle
 * Ativa ou desativa o push globalmente para todos os usuários.
 * Apenas admins e super_admins podem chamar.
 */
router.post('/admin/toggle', authenticateTokenLocal, async (req, res) => {
    try {
        // Verificar permissão
        if (req.userRole !== 'admin' && req.userRole !== 'super_admin') {
            return res.status(403).json({
                success: false,
                error: 'Apenas administradores podem controlar o push global'
            });
        }

        const { ativar } = req.body;

        // Obter ou criar modelo PushSettings
        let PushSettings;
        try {
            PushSettings = mongoose.model('PushSettings');
        } catch (e) {
            const PushSettingsSchema = new mongoose.Schema({
                _id: { type: String, default: 'global' },
                pushAtivado: { type: Boolean, default: false },
                vapidPublicKey: {
                    type: String,
                    default: process.env.VAPID_PUBLIC_KEY || ''
                },
                ultimaAlteracaoPor: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'User'
                },
                ultimaAlteracaoEm: { type: Date, default: Date.now }
            }, { timestamps: true });

            PushSettings = mongoose.model('PushSettings', PushSettingsSchema);
        }

        const settings = await PushSettings.findByIdAndUpdate(
            'global',
            {
                pushAtivado: ativar === true,
                ultimaAlteracaoPor: req.userId,
                ultimaAlteracaoEm: new Date()
            },
            { upsert: true, new: true }
        );

        logger.info(
            `✅ Push ${ativar ? 'ATIVADO' : 'DESATIVADO'} globalmente por admin ${req.userId}`
        );

        res.json({
            success: true,
            pushAtivado: settings.pushAtivado,
            message: `Push ${ativar ? 'ativado' : 'desativado'} com sucesso!`
        });

    } catch (error) {
        logger.error('❌ Erro ao alterar push global:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno: ' + error.message
        });
    }
});

// ============================================================================
// EXPORTAR ROUTER
// ============================================================================
module.exports = router;