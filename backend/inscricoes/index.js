// ============================================================================
// backend/inscricoes/index.js
// Router agregador do módulo de Inscrições
//
// MONTAGEM NO SERVIDOR (server.js / app.js):
//   app.use('/api/inscricoes', require('./backend/inscricoes'));
// ============================================================================
'use strict';

const express = require('express');
const router = express.Router();

// Healthcheck PRIMEIRO — nunca depende do router de rotas
router.get('/health', (req, res) => {
    res.json({
        success: true,
        modulo: 'inscricoes',
        status: 'ok',
        timestamp: new Date().toISOString()
    });
});

// Rotas do módulo — carregadas em try/catch para NÃO derrubar o server
let rotasInscricoes;
try {
    rotasInscricoes = require('./routes/inscricoes');
} catch (err) {
    console.error('❌ [INSCRIÇÕES] Falha ao carregar routes/inscricoes.js:', err.message);
    console.error(err.stack);
}

if (rotasInscricoes) {
    router.use('/', rotasInscricoes);
} else {
    router.use((req, res) => {
        res.status(503).json({
            success: false,
            error: 'Módulo de inscrições indisponível. Verifique os logs do servidor.'
        });
    });
}

// 🆕 Autenticação por passkey (pública — usada por outros módulos, ex.: visitas)
let rotasPasskeysAuth;
try {
    rotasPasskeysAuth = require('./routes/passkeys-auth');
} catch (err) {
    console.error('❌ [INSCRIÇÕES] Falha ao carregar routes/passkeys-auth.js:', err.message);
    console.error(err.stack);
}

if (rotasPasskeysAuth) {
    router.use('/passkeys', rotasPasskeysAuth);
} else {
    router.use('/passkeys', (req, res) => {
        res.status(503).json({
            success: false,
            error: 'Módulo de autenticação por passkey indisponível.'
        });
    });
}

module.exports = router;