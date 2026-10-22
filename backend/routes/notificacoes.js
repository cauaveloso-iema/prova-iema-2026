// ============================================================================
// ROUTES/NOTIFICACOES.JS
// ============================================================================
// Descrição: Rotas do sistema de notificações (usuário)
//
// ⚠️ IMPORTANTE:
//   - As rotas de PUSH (POST /api/push/admin/toggle, POST /api/usuario/enviar-push)
//     ficam em routes/onesignal.js
//   - As rotas ADMIN de notificação ficam em admin.js
//   - Serviços de background (NotificacaoBotaoService, CalendarioNotificacaoService)
//     ficam no server.js
//
// Autor: Equipe de Desenvolvimento
// ============================================================================

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const logger = require('../utils/logger');

const Notificacao = require('../models/Notificacao');

// ============================================================================
// MIDDLEWARE LOCAL DE AUTENTICAÇÃO
// ============================================================================
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
// 1. ROTAS ESPECÍFICAS (SEM PARÂMETROS)
// ============================================================================

// Contador de notificações não lidas
router.get('/nao-lidas/contador', authenticateTokenLocal, async (req, res) => {
    try {
        const count = await Notificacao.countDocuments({
            usuarioId: req.userId,
            lida: false
        });
        res.json({ success: true, count });
    } catch (error) {
        logger.error('❌ Erro ao contar notificações:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Criar notificação (com push automático)
router.post('/', authenticateTokenLocal, async (req, res) => {
    try {
        const { usuarioId, tipo, titulo, mensagem, icone, cor, link, prioridade, dados } = req.body;

        logger.info(`📝 Criando notificação para usuário ${usuarioId}: ${titulo}`);

        // 🆕 'lembrete' adicionado à lista de tipos permitidos
        const tiposPermitidos = ['resultado_liberado', 'resultado_editado', 'prova_corrigida', 'sistema', 'cancelamento', 'lembrete'];

        if (!tiposPermitidos.includes(tipo)) {
            return res.status(400).json({
                success: false,
                error: `Tipo inválido. Use um dos: ${tiposPermitidos.join(', ')}`
            });
        }

        // Validar prioridade
        let prioridadeFinal = prioridade ?? 3;
        if (typeof prioridadeFinal === 'string') prioridadeFinal = parseInt(prioridadeFinal);
        if (isNaN(prioridadeFinal) || prioridadeFinal < 1 || prioridadeFinal > 5) {
            return res.status(400).json({
                success: false,
                error: 'Prioridade inválida. Deve ser um número entre 1 e 5'
            });
        }

        const notificacao = new Notificacao({
            usuarioId,
            tipo,
            titulo,
            mensagem,
            icone: icone || '📋',
            cor: cor || '#3b82f6',
            link: link || null,
            prioridade: prioridadeFinal,
            dados: dados || {}
        });

        await notificacao.save();
        logger.info(`✅ Notificação criada com ID: ${notificacao._id}`);

        // Verificar config de push
        const Config = mongoose.model('Config');
        const configDoc = await Config.findOne({ chave: 'notificacoes' });
        const pushAtivado = configDoc?.valor?.push === true;

        let pushResult = null;

        if (pushAtivado) {
            const OneSignalService = require('../services/onesignal-service');
            const oneSignal = new OneSignalService();

            const mensagemPush = mensagem.replace(/<[^>]*>/g, '');

            pushResult = await oneSignal.enviarPush(
                usuarioId,
                titulo,
                mensagemPush,
                { ...dados, notificacaoId: notificacao._id, tipo, origem: 'sistema' }
            );

            if (pushResult) {
                logger.info(`✅ Push enviado! ID: ${pushResult.notificationId || pushResult.id}`);
            }
        }

        res.json({
            success: true,
            notificacao: {
                id: notificacao._id,
                titulo: notificacao.titulo,
                mensagem: notificacao.mensagem,
                tipo: notificacao.tipo,
                prioridade: notificacao.prioridade
            },
            push: pushResult ? {
                enviado: true,
                id: pushResult.notificationId || pushResult.id
            } : {
                enviado: false,
                motivo: pushAtivado ? 'falha_no_envio' : 'push_desativado'
            }
        });

    } catch (error) {
        logger.error('❌ Erro ao criar notificação:', error);
        if (error.name === 'ValidationError') {
            return res.status(400).json({ success: false, error: error.message });
        }
        res.status(500).json({
            success: false,
            error: 'Erro ao criar notificação: ' + error.message
        });
    }
});

// Marcar todas como lidas
router.put('/marcar-todas-lidas', authenticateTokenLocal, async (req, res) => {
    try {
        const resultado = await Notificacao.updateMany(
            { usuarioId: req.userId, lida: false },
            { lida: true, lidaEm: new Date() }
        );
        res.json({
            success: true,
            message: `${resultado.modifiedCount} notificações marcadas como lidas`,
            modificadas: resultado.modifiedCount
        });
    } catch (error) {
        logger.error('❌ Erro ao marcar todas como lidas:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Limpar todas as notificações do usuário logado
router.delete('/limpar-minhas', authenticateTokenLocal, async (req, res) => {
    try {
        const usuarioId = req.userId;
        logger.info(`🗑️ Usuário ${usuarioId} excluindo todas as suas notificações`);
        const resultado = await Notificacao.deleteMany({ usuarioId });
        logger.info(`✅ ${resultado.deletedCount} notificações excluídas`);
        res.json({
            success: true,
            message: `${resultado.deletedCount} notificação(ões) excluída(s) com sucesso!`,
            total: resultado.deletedCount
        });
    } catch (error) {
        logger.error('❌ Erro ao limpar notificações:', error);
        res.status(500).json({
            success: false,
            error: 'Erro ao limpar notificações: ' + error.message
        });
    }
});

// ============================================================================
// 2. LISTAGEM COM PAGINAÇÃO
// ============================================================================

router.get('/todas', authenticateTokenLocal, async (req, res) => {
    try {
        const { pagina = 1, limite = 50, filtro } = req.query;
        const usuarioId = req.userId;

        logger.info(`📋 Buscando todas as notificações do usuário ${usuarioId}`);

        const skip = (parseInt(pagina) - 1) * parseInt(limite);
        let query = { usuarioId };

        if (filtro && filtro !== 'todas') {
            if (filtro === 'nao_lidas') query.lida = false;
            else if (filtro === 'lidas') query.lida = true;
            else if (filtro.startsWith('tipo:')) query.tipo = filtro.replace('tipo:', '');
        }

        const [notificacoes, total] = await Promise.all([
            Notificacao.find(query)
                .sort({ createdAt: -1, prioridade: -1 })
                .skip(skip)
                .limit(parseInt(limite))
                .lean(),
            Notificacao.countDocuments(query)
        ]);

        const [totalNaoLidas, totalPorTipo] = await Promise.all([
            Notificacao.countDocuments({ usuarioId, lida: false }),
            Notificacao.aggregate([
                { $match: { usuarioId } },
                { $group: { _id: "$tipo", count: { $sum: 1 } } }
            ])
        ]);

        const porTipo = {};
        totalPorTipo.forEach(item => { porTipo[item._id] = item.count; });

        res.json({
            success: true,
            notificacoes,
            paginacao: {
                pagina: parseInt(pagina),
                limite: parseInt(limite),
                total,
                totalPaginas: Math.ceil(total / parseInt(limite))
            },
            estatisticas: {
                total,
                naoLidas: totalNaoLidas,
                lidas: total - totalNaoLidas,
                porTipo
            }
        });
    } catch (error) {
        logger.error('❌ Erro ao buscar todas as notificações:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// 3. ROTA BASE
// ============================================================================

router.get('/', authenticateTokenLocal, async (req, res) => {
    try {
        const { apenasNaoLidas, limite } = req.query;
        let query = { usuarioId: req.userId };
        if (apenasNaoLidas === 'true') query.lida = false;

        const notificacoes = await Notificacao.find(query)
            .sort({ createdAt: -1, prioridade: -1 })
            .limit(parseInt(limite) || 50)
            .lean();

        const naoLidas = await Notificacao.countDocuments({
            usuarioId: req.userId,
            lida: false
        });

        res.json({
            success: true,
            notificacoes,
            total: notificacoes.length,
            naoLidas
        });
    } catch (error) {
        logger.error('❌ Erro ao buscar notificações:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// 4. ROTAS COM :id — POR ÚLTIMO
// ============================================================================

router.put('/:id/lida', authenticateTokenLocal, async (req, res) => {
    try {
        const { id } = req.params;
        const notificacao = await Notificacao.findOneAndUpdate(
            { _id: id, usuarioId: req.userId },
            { lida: true, lidaEm: new Date() },
            { new: true }
        );

        if (!notificacao) {
            return res.status(404).json({
                success: false,
                error: 'Notificação não encontrada'
            });
        }

        res.json({ success: true, notificacao });
    } catch (error) {
        logger.error('❌ Erro ao marcar como lida:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/:id', authenticateTokenLocal, async (req, res) => {
    try {
        const { id } = req.params;
        const resultado = await Notificacao.findOneAndDelete({
            _id: id,
            usuarioId: req.userId
        });

        if (!resultado) {
            return res.status(404).json({
                success: false,
                error: 'Notificação não encontrada'
            });
        }

        res.json({
            success: true,
            message: 'Notificação deletada com sucesso',
            deletado: true
        });
    } catch (error) {
        logger.error('❌ Erro ao deletar notificação:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;