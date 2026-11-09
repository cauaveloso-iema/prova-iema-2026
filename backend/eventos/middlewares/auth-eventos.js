// ============================================================================
// backend/eventos/middlewares/auth-eventos.js
// ============================================================================
let jwt, User, Avaliador, Evento;
let logger = console;

try { jwt = require('jsonwebtoken'); } catch (err) { console.error('❌ [EVENTOS] jsonwebtoken não instalado:', err.message); }
try { User = require('../../models/User'); } catch (err) { console.warn('⚠️ [EVENTOS] Model User não encontrado:', err.message); }
try { Avaliador = require('../models/Avaliador'); } catch (err) { console.warn('⚠️ [EVENTOS] Model Avaliador não encontrado'); }
try { Evento = require('../models/Evento'); } catch (err) { console.warn('⚠️ [EVENTOS] Model Evento não encontrado'); }
try { logger = require('../../utils/logger'); } catch (_) { }

// ---- ORIGINAIS (MANTIDOS) ----
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
                logger.warn('⚠️ [EVENTOS] Erro ao validar tokenVersion:', dbError.message);
            }
        }

        req.userId = decoded.id;
        req.userRole = decoded.role;
        req.userNome = decoded.nome;
        req.tokenTemp = false;
        next();
    });
};

const isSuperAdmin = (req, res, next) => {
    if (req.userRole !== 'admin' && req.userRole !== 'super_admin') {
        return res.status(403).json({
            success: false,
            error: 'Acesso negado. Apenas administradores podem acessar este módulo.'
        });
    }
    next();
};

// ---- NOVOS (AVALIADOR E COORDENADOR) ----
const authenticateAvaliador = (req, res, next) => {
    if (!jwt) return res.status(500).json({ success: false, error: 'jsonwebtoken não configurado' });
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, error: 'Acesso negado.' });

    jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
        if (err) return res.status(403).json({ success: false, error: 'Token inválido.' });
        if (decoded.type !== 'avaliador_eventos') return res.status(403).json({ success: false, error: 'Token inválido.' });

        try {
            const avaliador = await Avaliador.findById(decoded.id);
            if (!avaliador || avaliador.status !== 'Ativo') {
                return res.status(403).json({ success: false, error: 'Avaliador inativo ou não encontrado.' });
            }
            req.avaliadorId = avaliador._id.toString(); // 🔥 Correção: Garante string para comparação
            req.avaliador = avaliador;
            next();
        } catch (error) { res.status(500).json({ success: false, error: error.message }); }
    });
};

const isCoordenadorEvento = async (req, res, next) => {
    try {
        // Admin tem passe livre
        if (req.userRole === 'admin' || req.userRole === 'super_admin') return next();
        
        if (!req.avaliador || !req.avaliador.isCoordenador) {
            return res.status(403).json({ success: false, error: 'Acesso negado. Apenas coordenadores ou admins.' });
        }

        // Busca o eventoId em todas as fontes possíveis (params, body, query)
        const eventoId = req.params.id || req.params.eventoId || req.body.eventoId || req.query.eventoId;
        
        if (eventoId) {
            const evento = await Evento.findById(eventoId);
            if (!evento) return res.status(404).json({ success: false, error: 'Evento não encontrado.' });
            
            // 🔥 Correção: Verifica se é o criador (criadoPor) ou está na lista de coordenadores
            const isCriador = evento.criadoPor && evento.criadoPor.toString() === req.avaliadorId;
            const isCoord = evento.coordenadores && evento.coordenadores.some(id => id.toString() === req.avaliadorId);
            
            if (!isCriador && !isCoord) {
                return res.status(403).json({ success: false, error: 'Acesso negado a este evento.' });
            }
            req.evento = evento;
        }
        next();
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
};

module.exports = { authenticateToken, isSuperAdmin, authenticateAvaliador, isCoordenadorEvento };