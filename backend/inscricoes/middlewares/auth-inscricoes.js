// ============================================================================
// backend/inscricoes/middlewares/auth-inscricoes.js
// ============================================================================
'use strict';

let jwt, User;
let logger = console;

try { jwt = require('jsonwebtoken'); } catch (err) { console.error('❌ [INSCRIÇÕES] jsonwebtoken não instalado:', err.message); }
try { User = require('../../models/User'); } catch (err) { console.warn('⚠️ [INSCRIÇÕES] Model User não encontrado:', err.message); }
try { logger = require('../../../utils/logger'); } catch (_) {
    try { logger = require('../../utils/logger'); } catch (_) { }
}

// ---------------------------------------------------------------- authenticateToken
const authenticateToken = (req, res, next) => {
    if (!jwt) {
        return res.status(500).json({ success: false, error: 'jsonwebtoken não configurado' });
    }

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, error: 'Acesso negado. Token não fornecido.' });
    }

    jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
        if (err) {
            return res.status(403).json({ success: false, error: 'Token inválido ou expirado.' });
        }

        if (decoded.temp === true && decoded.purpose === '2fa') {
            req.userId = decoded.id;
            req.userRole = decoded.role;
            req.userNome = decoded.nome;
            req.tokenTemp = true;
            return next();
        }

        if (User) {
            try {
                const user = await User.findById(decoded.id).select('tokenVersion');
                if (!user) {
                    return res.status(401).json({ success: false, error: 'Usuário não encontrado.' });
                }
                if ((user.tokenVersion || 0) !== (decoded.tokenVersion || 0)) {
                    return res.status(401).json({
                        success: false,
                        error: '🔐 Sua sessão foi encerrada. Faça login novamente.',
                        motivo: 'reset_global',
                        precisaLogin: true
                    });
                }
            } catch (dbError) {
                logger.warn('⚠️ [INSCRIÇÕES] Erro ao validar tokenVersion:', dbError.message);
            }
        }

        req.userId = decoded.id;
        req.userRole = decoded.role;
        req.userNome = decoded.nome;
        req.tokenTemp = false;
        next();
    });
};

// ---------------------------------------------------------------- normalização de role
/**
 * Normaliza variações de role:
 *  'gestao_geral' → 'gestao'
 *  'gestao-geral' → 'gestao'
 *  'GESTAO_GERAL' → 'gestao'
 *  'super-admin'  → 'super_admin'
 *  'gestão geral' → 'gestao'
 */
function normalizarRole(role) {
    if (!role) return '';
    return String(role)
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '_')
        .replace(/-/g, '_')
        .replace(/_geral$/i, '')
        .replace(/^gestao_geral$/i, 'gestao');
}

// Conjuntos canônicos (já normalizados)
const ROLES_ADMIN = ['admin', 'super_admin'];
const ROLES_EDICAO = ['admin', 'super_admin', 'gestao'];
// Configuração do processo seletivo: admin + gestão
const ROLES_CONFIG = ['admin', 'super_admin', 'gestao'];
// Consulta: QUALQUER role autenticado que NÃO seja explicitamente bloqueado
const ROLES_CONSULTA = [
    'admin', 'super_admin',
    'gestao', 'assistente_social', 'pedagogico', 'secretaria',
    'professor', 'coordenador', 'diretor', 'orientador',
    'bibliotecario', 'nutricionista', 'psicologo', 'enfermeiro',
    'agente', 'funcionario', 'colaborador'
];

// ---------------------------------------------------------------- isAdmin
/** Somente admin / super_admin (exclusão, exportação de dados sensíveis) */
const isAdmin = (req, res, next) => {
    const role = normalizarRole(req.userRole);
    if (!ROLES_ADMIN.includes(role)) {
        return res.status(403).json({
            success: false,
            error: 'Acesso negado. Apenas administradores podem executar esta ação.',
            debug: { roleRecebido: req.userRole, roleNormalizado: role }
        });
    }
    next();
};

// ---------------------------------------------------------------- podeConsultar
/**
 * Consulta ampla: aceita qualquer role que NÃO seja explicitamente restrito.
 * Isso garante compatibilidade com 'gestao_geral', 'gestao', 'gestao-geral', etc.
 */
const podeConsultar = (req, res, next) => {
    const role = normalizarRole(req.userRole);
    if (!role) {
        return res.status(403).json({ success: false, error: 'Acesso negado a este recurso.' });
    }
    const BLOQUEADOS = ['aluno', 'responsavel', 'visitante', 'anonimo'];
    if (BLOQUEADOS.includes(role)) {
        return res.status(403).json({
            success: false,
            error: 'Acesso negado a este recurso.',
            debug: { roleRecebido: req.userRole, roleNormalizado: role }
        });
    }
    next();
};

// ---------------------------------------------------------------- podeEditar
/**
 * Edição de inscrições: admin, super_admin e gestao (inclui gestao_geral).
 */
const podeEditar = (req, res, next) => {
    const role = normalizarRole(req.userRole);
    if (!ROLES_EDICAO.includes(role)) {
        return res.status(403).json({
            success: false,
            error: 'Acesso negado. Seu perfil não pode editar inscrições.',
            debug: { roleRecebido: req.userRole, roleNormalizado: role }
        });
    }
    next();
};

// ---------------------------------------------------------------- podeConfigurar (NOVO)
/**
 * Configuração do processo seletivo (GET/PUT /admin/config).
 * Liberado para admin, super_admin e gestao.
 */
const podeConfigurar = (req, res, next) => {
    const role = normalizarRole(req.userRole);
    if (!ROLES_CONFIG.includes(role)) {
        return res.status(403).json({
            success: false,
            error: 'Acesso negado. Seu perfil não pode gerenciar a configuração de inscrições.',
            debug: { roleRecebido: req.userRole, roleNormalizado: role }
        });
    }
    next();
};

module.exports = {
    authenticateToken,
    isAdmin,
    podeConsultar,
    podeEditar,
    podeConfigurar,
    normalizarRole,
    ROLES_ADMIN,
    ROLES_EDICAO,
    ROLES_CONFIG
};