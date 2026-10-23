// ============================================================================
// ROTAS DE CONFIGURAÇÕES DO ADMIN
// ============================================================================
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose'); // 🔥 IMPORTANTE
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

// ============================================================================
// 🔥 FUNÇÃO AUXILIAR: OBTER O MODELO CONFIG (REGISTRADO PELO SERVER.JS)
// ============================================================================
function getConfigModel() {
    try {
        return mongoose.model('Config');
    } catch (error) {
        // Se o modelo não existir, cria um fallback (para evitar crash)
        console.warn('⚠️ Modelo Config não encontrado. Criando fallback...');
        
        const ConfigSchema = new mongoose.Schema({
            chave: { type: String, required: true, unique: true, trim: true },
            valor: { type: mongoose.Schema.Types.Mixed, required: true },
            tipo: { type: String, enum: ['string', 'number', 'boolean', 'object', 'array'], default: 'string' },
            descricao: { type: String, default: '' },
            categoria: { type: String, enum: ['geral', 'sistema', 'seguranca', 'provas', 'email', 'backups', 'logs', 'aparencia'], default: 'geral' },
            publico: { type: Boolean, default: false },
            editavel: { type: Boolean, default: true },
            atualizadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            atualizadoEm: { type: Date, default: Date.now }
        }, { timestamps: true });

        return mongoose.model('Config', ConfigSchema);
    }
}

// ============================================================================
// 🔥 ROTAS ESPECÍFICAS PRIMEIRO (ANTES DAS ROTAS GENÉRICAS)
// ============================================================================

// ===== OBTER CONFIGURAÇÕES DE NOTIFICAÇÕES =====
router.get('/configuracoes/notificacoes', authenticateToken, async (req, res) => {
    try {
        const result = await configService.getConfiguracoesNotificacoes();
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// ROTAS PARA GERENCIAR PERFIS ADMINISTRATIVOS DO CALENDÁRIO
// ============================================================================

const PERFIS_ADMIN_PADRAO = [
    'admin', 'super_admin', 'setor_pedagogico', 'gestao_geral',
    'supervisao', 'coordenacao_patio', 'secretaria', 'recepcao',
    'enfermaria', 'cozinha', 'assistente-social', 'psicologia',
    'protagonismo', 'biblioteca'
];

// GET - Listar todos os perfis administrativos configurados
router.get('/configuracoes/perfis-administrativos', authenticateToken, async (req, res) => {
    try {
        const Config = getConfigModel(); // 🔥 USA A FUNÇÃO AUXILIAR
        const config = await Config.findOne({ chave: 'sistema.perfisAdministrativos' });
        
        const perfis = (config && Array.isArray(config.valor) && config.valor.length > 0) 
            ? config.valor 
            : PERFIS_ADMIN_PADRAO;
        
        res.json({ success: true, perfis, origem: config ? 'banco' : 'padrao' });
    } catch (error) {
        console.error('❌ Erro ao buscar perfis administrativos:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST - Adicionar um perfil à lista
router.post('/configuracoes/perfis-administrativos', authenticateToken, async (req, res) => {
    try {
        const { perfil } = req.body;
        const Config = getConfigModel(); // 🔥 USA A FUNÇÃO AUXILIAR
        
        if (!perfil || typeof perfil !== 'string') {
            return res.status(400).json({ success: false, error: 'Perfil é obrigatório' });
        }
        
        const perfilLimpo = perfil.trim().toLowerCase();
        
        let config = await Config.findOne({ chave: 'sistema.perfisAdministrativos' });
        
        if (!config) {
            config = new Config({
                chave: 'sistema.perfisAdministrativos',
                valor: [...PERFIS_ADMIN_PADRAO],
                tipo: 'array',
                categoria: 'sistema',
                descricao: 'Perfis administrativos com acesso ao calendário'
            });
        }
        
        if (config.valor.includes(perfilLimpo)) {
            return res.status(400).json({ success: false, error: 'Perfil já está na lista' });
        }
        
        config.valor.push(perfilLimpo);
        await config.save();
        
        res.json({ success: true, perfis: config.valor });
    } catch (error) {
        console.error('❌ Erro ao adicionar perfil:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE - Remover um perfil da lista
router.delete('/configuracoes/perfis-administrativos/:perfil', authenticateToken, async (req, res) => {
    try {
        const { perfil } = req.params;
        const Config = getConfigModel(); // 🔥 USA A FUNÇÃO AUXILIAR
        
        let config = await Config.findOne({ chave: 'sistema.perfisAdministrativos' });
        
        if (!config) {
            return res.status(404).json({ success: false, error: 'Configuração não encontrada' });
        }
        
        config.valor = config.valor.filter(p => p !== perfil.toLowerCase());
        await config.save();
        
        res.json({ success: true, perfis: config.valor });
    } catch (error) {
        console.error('❌ Erro ao remover perfil:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// 🔥 ROTAS GENÉRICAS POR ÚLTIMO
// ============================================================================

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

// ===== OBTER CONFIGURAÇÃO ESPECÍFICA (GENÉRICA) =====
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

// ===== ATUALIZAR CONFIGURAÇÃO ESPECÍFICA (GENÉRICA) =====
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

module.exports = router;