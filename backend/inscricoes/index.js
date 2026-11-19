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
// se algum model/middleware estiver ausente.
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
    // Fallback: responde 503 em todas as rotas do módulo para não travar o server
    router.use((req, res) => {
        res.status(503).json({
            success: false,
            error: 'Módulo de inscrições indisponível. Verifique os logs do servidor.'
        });
    });
}

module.exports = router;