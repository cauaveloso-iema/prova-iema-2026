// backend/routes/permissao-modulos-routes.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

// 🔥 IMPORTANTE: NÃO importar o modelo no topo!
// Vamos usar lazy loading para evitar conflito com a conexão do MongoDB

// Função helper para pegar o modelo (só quando precisar)
function getPermissaoModulo() {
    return require('../models/PermissaoModulo');
}

// ============================================
// MIDDLEWARES
// ============================================
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ success: false, error: 'Token não fornecido' });
    }
    
    jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
        if (err) {
            console.error('❌ Token inválido:', err.message);
            return res.status(403).json({ success: false, error: 'Token inválido' });
        }
        
        try {
            // 🔥 CORREÇÃO: Buscar email do banco de dados
            const User = require('../models/User');
            const user = await User.findById(decoded.id).select('email nome role');
            
            if (!user) {
                return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
            }
            
            req.userId = user._id;
            req.userRole = user.role;
            req.userNome = user.nome;
            req.userEmail = user.email;  // ✅ Email vem do BANCO
            
            next();
        } catch (dbError) {
            console.error('❌ Erro ao buscar usuário:', dbError);
            return res.status(500).json({ success: false, error: 'Erro ao autenticar' });
        }
    });
};

// Apenas admin e super_admin
const apenasAdmins = (req, res, next) => {
    const rolesPermitidos = ['admin', 'super_admin'];
    if (!rolesPermitidos.includes(req.userRole)) {
        return res.status(403).json({
            success: false,
            error: 'Acesso permitido apenas para administradores'
        });
    }
    next();
};

// ============================================
// CONSTANTES: Módulos disponíveis
// ============================================
const MODULOS_DISPONIVEIS = {
    'segunda_chamada_setor_pedagogico': {
        nomeAmigavel: '2ª Chamada - Setor Pedagógico',
        descricao: 'Permite que usuários específicos do Setor Pedagógico registrem 2ª Chamada'
    },
    'relatorios_setor_pedagogico': {
        nomeAmigavel: 'Relatórios - Setor Pedagógico',
        descricao: 'Permite que usuários específicos do Setor Pedagógico gerem relatórios'
    },
    'exportar_dados_setor_pedagogico': {
        nomeAmigavel: 'Exportar Dados - Setor Pedagógico',
        descricao: 'Permite exportar dados de alunos AEE'
    },
    'substituicao_professores_setor_pedagogico': {
        nomeAmigavel: 'Substituição de Professores',
        descricao: 'Permite registrar substituições de professores quando há ausências'
    },
    // 🔥 NOVO MÓDULO
    'autorizacao_visitas': {
        nomeAmigavel: 'Autorização de Visitas',
        descricao: 'Permite criar e gerenciar termos de visita técnica e autorizações de responsáveis'
    }
};

// ============================================
// HEALTH CHECK
// ============================================
router.get('/health', (req, res) => {
    res.json({ success: true, status: 'online', service: 'Permissões de Módulos' });
});

// ============================================
// LISTAR TODOS OS MÓDULOS COM PERMISSÕES
// ============================================
router.get('/modulos', authenticateToken, apenasAdmins, async (req, res) => {
    try {
        const PermissaoModulo = getPermissaoModulo();
        const modulos = [];
        
        for (const [modulo, config] of Object.entries(MODULOS_DISPONIVEIS)) {
            const permissao = await PermissaoModulo.buscarOuCriar(
                modulo,
                config.nomeAmigavel,
                config.descricao
            );
            
            modulos.push({
                modulo: permissao.modulo,
                nomeAmigavel: permissao.nomeAmigavel,
                descricao: permissao.descricao,
                emailsAutorizados: permissao.emailsAutorizados,
                totalEmails: permissao.emailsAutorizados.length,
                ativo: permissao.ativo,
                ultimaModificacaoNome: permissao.ultimaModificacaoNome,
                updatedAt: permissao.updatedAt
            });
        }
        
        res.json({ success: true, modulos });
        
    } catch (error) {
        console.error('❌ Erro ao listar módulos:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// OBTER PERMISSÃO DE UM MÓDULO ESPECÍFICO
// ============================================
router.get('/modulos/:modulo', authenticateToken, apenasAdmins, async (req, res) => {
    try {
        const PermissaoModulo = getPermissaoModulo();
        const { modulo } = req.params;
        
        if (!MODULOS_DISPONIVEIS[modulo]) {
            return res.status(404).json({
                success: false,
                error: 'Módulo não reconhecido'
            });
        }
        
        const config = MODULOS_DISPONIVEIS[modulo];
        const permissao = await PermissaoModulo.buscarOuCriar(
            modulo,
            config.nomeAmigavel,
            config.descricao
        );
        
        res.json({ success: true, permissao });
        
    } catch (error) {
        console.error('❌ Erro:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================
// ADICIONAR EMAIL A UM MÓDULO
// ============================================
router.post('/modulos/:modulo/emails', authenticateToken, apenasAdmins, async (req, res) => {
    try {
        const PermissaoModulo = getPermissaoModulo();
        const { modulo } = req.params;
        const { email } = req.body;
        
        if (!MODULOS_DISPONIVEIS[modulo]) {
            return res.status(404).json({
                success: false,
                error: 'Módulo não reconhecido'
            });
        }
        
        if (!email || !email.includes('@')) {
            return res.status(400).json({
                success: false,
                error: 'Email inválido'
            });
        }
        
        const config = MODULOS_DISPONIVEIS[modulo];
        
        await PermissaoModulo.buscarOuCriar(
            modulo,
            config.nomeAmigavel,
            config.descricao
        );
        
        const permissao = await PermissaoModulo.adicionarEmail(
            modulo,
            email,
            { userId: req.userId, nome: req.userNome }
        );
        
        console.log(`✅ Email ${email} adicionado ao módulo ${modulo} por ${req.userNome}`);
        
        res.json({
            success: true,
            message: `Email ${email} adicionado com sucesso`,
            permissao
        });
        
    } catch (error) {
        console.error('❌ Erro ao adicionar email:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================
// REMOVER EMAIL DE UM MÓDULO
// ============================================
router.delete('/modulos/:modulo/emails/:email', authenticateToken, apenasAdmins, async (req, res) => {
    try {
        const PermissaoModulo = getPermissaoModulo();
        const { modulo, email } = req.params;
        
        if (!MODULOS_DISPONIVEIS[modulo]) {
            return res.status(404).json({
                success: false,
                error: 'Módulo não reconhecido'
            });
        }
        
        const permissao = await PermissaoModulo.removerEmail(
            modulo,
            decodeURIComponent(email),
            { userId: req.userId, nome: req.userNome }
        );
        
        console.log(`🗑️ Email ${email} removido do módulo ${modulo} por ${req.userNome}`);
        
        res.json({
            success: true,
            message: `Email removido com sucesso`,
            permissao
        });
        
    } catch (error) {
        console.error('❌ Erro ao remover email:', error);
        res.status(400).json({ success: false, error: error.message });
    }
});

// ============================================
// ✅ VERIFICAR PERMISSÃO (VERSÃO CORRIGIDA)
// ============================================
router.get('/verificar/:modulo', authenticateToken, async (req, res) => {
    try {
        const PermissaoModulo = getPermissaoModulo();
        const { modulo } = req.params;
        
        // 🔥 CORREÇÃO PRINCIPAL:
        // Prioridade: query param > email do token
        const emailParaVerificar = (
            req.query.email || 
            req.userEmail || 
            ''
        ).trim().toLowerCase();
        
        // Admin e super_admin SEMPRE têm permissão
        if (req.userRole === 'admin' || req.userRole === 'super_admin') {
            console.log('✅ Admin/Super Admin - permissão concedida automaticamente');
            return res.json({
                success: true,
                temPermissao: true,
                modulo,
                email: emailParaVerificar,
                motivo: 'Usuário é admin/super_admin'
            });
        }
        
        // Buscar permissão no banco
        const permissao = await PermissaoModulo.findOne({ modulo });
        
        if (!permissao) {
            console.log('⚠️ Módulo não encontrado no banco');
            return res.json({
                success: true,
                temPermissao: false,
                modulo,
                email: emailParaVerificar,
                motivo: 'Módulo não configurado'
            });
        }
        
        if (!permissao.ativo) {
            console.log('⚠️ Módulo desativado');
            return res.json({
                success: true,
                temPermissao: false,
                modulo,
                email: emailParaVerificar,
                motivo: 'Módulo desativado'
            });
        }
        
        // 🔥 Comparação robusta: case-insensitive + trim
        const emailsNormalizados = permissao.emailsAutorizados.map(e => 
            (e || '').trim().toLowerCase()
        );
        
        const temPermissao = emailsNormalizados.includes(emailParaVerificar);
        
        res.json({
            success: true,
            temPermissao,
            modulo,
            email: emailParaVerificar,
            motivo: temPermissao ? 'Email autorizado' : 'Email não autorizado'
        });
        
    } catch (error) {
        console.error('❌ Erro ao verificar permissão:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// ============================================
// LISTAR EMAILS DE UM MÓDULO
// ============================================
router.get('/modulos/:modulo/emails', authenticateToken, apenasAdmins, async (req, res) => {
    try {
        const PermissaoModulo = getPermissaoModulo();
        const { modulo } = req.params;
        
        const permissao = await PermissaoModulo.findOne({ modulo });
        
        if (!permissao) {
            return res.json({ success: true, emails: [] });
        }
        
        res.json({
            success: true,
            emails: permissao.emailsAutorizados,
            total: permissao.emailsAutorizados.length
        });
        
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;