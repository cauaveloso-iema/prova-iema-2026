// backend/routes/sessao-assinatura-routes.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

function getUser() { return require('../models/User'); }
function getSessao() { return require('../models/SessaoAssinatura'); }

// ============================================
// MIDDLEWARES
// ============================================
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.status(401).json({ success: false, error: 'Token não fornecido.' });
    
    jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
        if (err) return res.status(403).json({ success: false, error: 'Token inválido.' });
        
        try {
            const User = getUser();
            const user = await User.findById(decoded.id).select('email nome role');
            if (!user) return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
            
            req.userId = user._id;
            req.userRole = user.role;
            req.userNome = user.nome;
            next();
        } catch (dbError) {
            return res.status(500).json({ success: false, error: 'Erro ao autenticar' });
        }
    });
};

// ============================================
// 🆕 ROLES QUE PODEM CRIAR/ASSINAR SESSÕES
// ⚠️ IMPORTANTE: Aceita BOTH formas (com hífen E com underscore)
// ============================================
const verificarGestaoGeral = (req, res, next) => {
    const allowedRoles = [
        // Gestão
        'gestao_geral',
        'gestao-geral',           // 🆕 com hífen
        'super_admin',
        'super-admin',            // 🆕 com hífen
        'admin',
        
        // Setor Pedagógico
        'setor_pedagogico',
        'setor-pedagogico',       // 🆕 com hífen
        
        // Psicologia
        'psicologia',
        'psicologo',
        'psicologa',
        
        // Assistente Social (as duas formas!)
        'assistente_social',      // com underscore
        'assistente-social',      // 🆕 com hífen ← ESSA É A CORREÇÃO!
        
        // Supervisão
        'supervisao',
        'supervisão',
        
        // Biblioteca
        'biblioteca'
    ];
    
    if (!allowedRoles.includes(req.userRole)) {
        console.warn(`⚠️ Acesso negado em /sessoes-assinatura para role: "${req.userRole}"`);
        return res.status(403).json({ 
            success: false, 
            error: `Acesso negado. Role "${req.userRole}" não autorizada.`,
            roleRecebida: req.userRole,
            rolesPermitidas: allowedRoles
        });
    }
    next();
};

// ============================================
// ⚠️ IMPORTANTE: A ORDEM IMPORTA!
// Rotas fixas (sem parâmetro) devem vir ANTES das rotas com /:param
// ============================================

// ============================================
// HEALTH CHECK
// ============================================
router.get('/health', (req, res) => {
    res.json({ 
        success: true, 
        status: 'online', 
        service: 'Sessões de Assinatura (QR Code)',
        timestamp: new Date().toISOString()
    });
});

// ============================================
// 1. CRIAR / ATUALIZAR SESSÃO
// ============================================
router.post('/', authenticateToken, verificarGestaoGeral, async (req, res) => {
    try {
        const Sessao = getSessao();
        const User = getUser();
        const { sessaoId, tipo, dadosAtendimento } = req.body;
        
        if (!sessaoId) return res.status(400).json({ success: false, error: 'sessaoId obrigatório' });
        if (!tipo) return res.status(400).json({ success: false, error: 'tipo obrigatório' });
        
        // Valida o tipo
        const tiposValidos = [
            'autorizacao', 'justificativa', 'segunda_chamada', 'atraso',
            'psicologia', 'assistente_social', 'supervisao', 'biblioteca'
        ];
        if (!tiposValidos.includes(tipo)) {
            return res.status(400).json({ 
                success: false, 
                error: `Tipo "${tipo}" inválido`,
                tiposPermitidos: tiposValidos
            });
        }
        
        // Se já existe uma sessão com esse ID e ainda está aguardando, atualiza
        const existente = await Sessao.findOne({ sessaoId });
        if (existente) {
            if (existente.status === 'aguardando') {
                existente.dadosAtendimento = dadosAtendimento || existente.dadosAtendimento;
                existente.expiraEm = new Date(Date.now() + 30 * 60 * 1000);
                await existente.save();
                return res.json({ success: true, sessaoId: existente.sessaoId, atualizada: true });
            }
            // Se já foi assinada ou cancelada, remove e cria nova
            await Sessao.deleteOne({ sessaoId });
        }
        
        const user = await User.findById(req.userId).select('nome');
        
        const sessao = new Sessao({
            sessaoId,
            tipo,
            status: 'aguardando',
            dadosAtendimento: dadosAtendimento || {},
            criadoPor: req.userId,
            criadoPorNome: user?.nome || req.userNome,
            expiraEm: new Date(Date.now() + 30 * 60 * 1000)
        });
        
        await sessao.save();
        console.log(`✅ Sessão criada: ${sessao.sessaoId} (${sessao.tipo}) por ${sessao.criadoPorNome}`);
        
        res.json({ success: true, sessaoId: sessao.sessaoId });
    } catch (error) {
        console.error('Erro ao criar sessão:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 2. LISTAR SESSÕES PENDENTES (antes de /:sessaoId!)
// ============================================
router.get('/pendentes', authenticateToken, verificarGestaoGeral, async (req, res) => {
    try {
        const Sessao = getSessao();
        const sessoes = await Sessao.find({ status: 'aguardando' })
            .sort({ criadoEm: -1 })
            .limit(200);
        
        res.json({
            success: true,
            total: sessoes.length,
            sessoes: sessoes.map(s => ({
                sessaoId: s.sessaoId,
                tipo: s.tipo,
                status: s.status,
                dadosAtendimento: s.dadosAtendimento,
                criadoEm: s.criadoEm,
                criadoPorNome: s.criadoPorNome,
                expiraEm: s.expiraEm
            }))
        });
    } catch (error) {
        console.error('Erro ao listar pendentes:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 3. CONTADOR DE PENDENTES (antes de /:sessaoId!)
// ============================================
router.get('/pendentes/contador', authenticateToken, verificarGestaoGeral, async (req, res) => {
    try {
        const Sessao = getSessao();
        const total = await Sessao.countDocuments({ status: 'aguardando' });
        res.json({ success: true, total });
    } catch (error) {
        console.error('Erro no contador:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 4. ATUALIZAR DADOS DA SESSÃO
// ============================================
router.put('/:sessaoId/dados', authenticateToken, verificarGestaoGeral, async (req, res) => {
    try {
        const Sessao = getSessao();
        const { dadosAtendimento } = req.body;
        
        const sessao = await Sessao.findOne({ 
            sessaoId: req.params.sessaoId,
            status: 'aguardando'
        });
        
        if (!sessao) {
            return res.status(404).json({ success: false, error: 'Sessão não encontrada ou já finalizada' });
        }
        
        sessao.dadosAtendimento = dadosAtendimento || sessao.dadosAtendimento;
        await sessao.save();
        
        res.json({ success: true });
    } catch (error) {
        console.error('Erro ao atualizar dados:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 5. BUSCAR SESSÃO POR ID
// ============================================
router.get('/:sessaoId', authenticateToken, verificarGestaoGeral, async (req, res) => {
    try {
        const Sessao = getSessao();
        const sessao = await Sessao.findOne({ sessaoId: req.params.sessaoId });
        
        if (!sessao) {
            return res.status(404).json({ success: false, error: 'Sessão não encontrada' });
        }
        
        res.json({
            success: true,
            sessao: {
                sessaoId: sessao.sessaoId,
                tipo: sessao.tipo,
                status: sessao.status,
                dadosAtendimento: sessao.dadosAtendimento,
                assinaturaBase64: sessao.assinaturaBase64,
                assinadaEm: sessao.assinadaEm,
                assinadaPorNome: sessao.assinadaPorNome,
                criadoEm: sessao.criadoEm,
                criadoPorNome: sessao.criadoPorNome,
                expiraEm: sessao.expiraEm
            }
        });
    } catch (error) {
        console.error('Erro ao buscar sessão:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 6. ASSINAR SESSÃO
// ============================================
router.put('/:sessaoId/assinar', authenticateToken, verificarGestaoGeral, async (req, res) => {
    try {
        const Sessao = getSessao();
        const User = getUser();
        const { assinaturaBase64 } = req.body;
        
        if (!assinaturaBase64 || typeof assinaturaBase64 !== 'string') {
            return res.status(400).json({ success: false, error: 'Assinatura é obrigatória' });
        }
        
        if (!assinaturaBase64.startsWith('data:image/png;base64,')) {
            return res.status(400).json({ success: false, error: 'Formato de assinatura inválido' });
        }
        
        if (assinaturaBase64.length > 500 * 1024) {
            return res.status(400).json({ success: false, error: 'Assinatura muito grande (máx 500KB)' });
        }
        
        const sessao = await Sessao.findOne({ 
            sessaoId: req.params.sessaoId,
            status: 'aguardando'
        });
        
        if (!sessao) {
            return res.status(404).json({ 
                success: false, 
                error: 'Sessão não encontrada ou já foi assinada' 
            });
        }
        
        const assinante = await User.findById(req.userId).select('nome');
        
        sessao.status = 'assinado';
        sessao.assinaturaBase64 = assinaturaBase64;
        sessao.assinadaEm = new Date();
        sessao.assinadaPor = req.userId;
        sessao.assinadaPorNome = assinante?.nome || req.userNome;
        
        await sessao.save();
        
        console.log(`✍️ Sessão ${sessao.sessaoId} assinada por ${sessao.assinadaPorNome}`);
        
        res.json({ 
            success: true, 
            message: 'Assinatura registrada!',
            sessao: {
                sessaoId: sessao.sessaoId,
                status: sessao.status,
                assinadaEm: sessao.assinadaEm,
                assinadaPorNome: sessao.assinadaPorNome
            }
        });
    } catch (error) {
        console.error('Erro ao assinar:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// 7. CANCELAR SESSÃO
// ============================================
router.delete('/:sessaoId', authenticateToken, verificarGestaoGeral, async (req, res) => {
    try {
        const Sessao = getSessao();
        
        const sessao = await Sessao.findOneAndUpdate(
            { sessaoId: req.params.sessaoId },
            { status: 'cancelado' },
            { new: true }
        );
        
        if (!sessao) {
            return res.status(404).json({ success: false, error: 'Sessão não encontrada' });
        }
        
        console.log(`❌ Sessão cancelada: ${sessao.sessaoId}`);
        res.json({ success: true });
    } catch (error) {
        console.error('Erro ao cancelar:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;