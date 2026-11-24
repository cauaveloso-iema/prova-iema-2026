// ============================================================================
// ROUTES/BIOMETRIA.JS
// ============================================================================
// Descrição: Rotas do sistema de biometria por passkey (WebAuthn) usado no 2FA
//
// Fluxo:
//   1) Login por senha → backend emite "2fa_token" (JWT temporário)
//   2) Frontend /validar-2fa chama /autenticar/iniciar  → recebe challenge
//   3) Usuário confirma com digital/rosto/PIN no dispositivo
//   4) Frontend chama /autenticar/concluir  → servidor valida assinatura
//      e devolve JWT final (mesmo formato do login normal)
//
// ⚠️ IMPORTANTE:
//   - Este módulo NÃO substitui o 2FA por código (SMS/QR/backup).
//   - Ele é um ATALHO opcional para o usuário que já cadastrou a passkey.
//   - As rotas /admin/* são restritas a admin e super_admin.
//
// Model:  models/BiometriaSistema.js
// Utils:  utils/passkeyCrypto.js
// Autor:  Equipe de Desenvolvimento
// ============================================================================
'use strict';

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

// ============================================================================
// IMPORTS COM FALLBACK SEGURO
// ============================================================================

// Model de biometria (obrigatório — sem ele o router não funciona)
let BiometriaSistema;
try {
    BiometriaSistema = require('../models/BiometriaSistema');
} catch (err) {
    console.error('❌ [BIOMETRIA] Não foi possível carregar models/BiometriaSistema.js:');
    console.error('   ', err.message);
    throw err;
}

// Model de usuário (opcional — fallback silencioso)
let User = null;
try {
    User = require('../models/User');
} catch (_) {
    try {
        User = require('../models/Usuario');
    } catch (_) {
        console.warn('⚠️ [BIOMETRIA] Model de usuário não encontrado (User/Usuario). Usando apenas dados do JWT.');
        User = null;
    }
}

// Utilitário de crypto WebAuthn (com fallback para inscricoes/utils)
let passkeyCrypto;
try {
    passkeyCrypto = require('../utils/passkeyCrypto');
} catch (_) {
    try {
        passkeyCrypto = require('../inscricoes/utils/passkeyCrypto');
    } catch (err) {
        console.error('❌ [BIOMETRIA] passkeyCrypto não encontrado em:');
        console.error('   - utils/passkeyCrypto.js');
        console.error('   - inscricoes/utils/passkeyCrypto.js');
        throw err;
    }
}

// Logger com fallback para console
let logger;
try {
    logger = require('../utils/logger');
} catch (_) {
    logger = {
        info: (...a) => console.log('ℹ️', ...a),
        warn: (...a) => console.warn('⚠️', ...a),
        error: (...a) => console.error('❌', ...a)
    };
}

// ============================================================================
// CONFIGURAÇÕES
// ============================================================================
const JWT_SECRET = process.env.JWT_SECRET || 'troque-este-secret';
const TOKEN_FINAL_TTL = '7d';

/**
 * Retorna o RP ID (domínio) usado na validação WebAuthn.
 */
function obterRpId(req) {
    return process.env.WEBAUTHN_RP_ID
        || req.headers.host?.split(':')[0]
        || 'localhost';
}

/**
 * Retorna a origin exata (protocolo + host) para validação do clientDataJSON.
 */
function obterOrigin(req) {
    return process.env.WEBAUTHN_ORIGIN
        || `${req.protocol}://${req.headers.host}`;
}

/**
 * Retorna o nome amigável do RP exibido no dispositivo do usuário.
 */
function obterRpName() {
    return process.env.WEBAUTHN_RP_NAME || 'IEMA EducaPleno';
}

// ============================================================================
// MIDDLEWARES
// ============================================================================

/**
 * Autentica um JWT "normal" (login completo).
 * Coloca o payload em req.user.
 */
function autenticarJWT(req, res, next) {
    try {
        const auth = req.headers.authorization || '';
        const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;

        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'Token ausente.'
            });
        }

        const payload = jwt.verify(token, JWT_SECRET);
        req.user = payload;
        next();
    } catch (_) {
        return res.status(401).json({
            success: false,
            error: 'Token inválido ou expirado.'
        });
    }
}

/**
 * Restringe o acesso a admin e super_admin.
 * Deve ser usado DEPOIS de autenticarJWT.
 */
function exigirAdmin(req, res, next) {
    const role = req.user?.role;
    if (role !== 'admin' && role !== 'super_admin') {
        return res.status(403).json({
            success: false,
            error: 'Acesso restrito a administradores.'
        });
    }
    next();
}

/**
 * Verifica se um JWT é um "2fa_token" (temporário) válido.
 * Coloca o payload em req.twoFA.
 */
function autenticar2FA(req, res, next) {
    try {
        const auth = req.headers.authorization || '';
        const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;

        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'Token 2FA ausente.'
            });
        }

        let payload;
        try {
            payload = jwt.verify(token, JWT_SECRET);
        } catch (_) {
            return res.status(401).json({
                success: false,
                error: 'Token 2FA inválido/expirado.'
            });
        }

        if (!payload.id) {
            return res.status(400).json({
                success: false,
                error: 'userId ausente no token.'
            });
        }

        req.twoFA = payload;
        next();
    } catch (err) {
        logger.error('❌ [BIOMETRIA] autenticar2FA:', err);
        return res.status(500).json({
            success: false,
            error: 'Falha ao validar token 2FA.'
        });
    }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Extrai o origin do clientDataJSON e valida contra o esperado.
 * @returns {{ ok: boolean, clientData?: object, error?: string }}
 */
function validarClientData(req, credentialResponse, tipoEsperado, challengeEsperado) {
    let clientData;
    try {
        const buf = passkeyCrypto.b64urlDecode(credentialResponse.clientDataJSON);
        clientData = JSON.parse(buf.toString('utf8'));
    } catch (_) {
        return { ok: false, error: 'clientDataJSON inválido.' };
    }

    if (clientData.type !== tipoEsperado) {
        return { ok: false, error: `Tipo de cerimônia inválido (esperado ${tipoEsperado}).` };
    }
    if (clientData.challenge !== challengeEsperado) {
        return { ok: false, error: 'Challenge não confere.' };
    }
    if (clientData.origin !== obterOrigin(req)) {
        return { ok: false, error: 'Origin não confere.' };
    }

    return { ok: true, clientData };
}

/**
 * Monta o redirect final baseado no role do usuário.
 */
function calcularRedirect(role) {
    if (role === 'super_admin') return '/admin.html';
    if (role === 'admin') return '/admin-simples.html';
    if (role === 'professor') return '/index.html';
    if (role === 'aluno') return '/aluno.html';
    return '/login.html';
}

// ============================================================================
// ROTA: CADASTRAR BIOMETRIA — INICIAR
// ============================================================================
/**
 * POST /api/biometria/registrar/iniciar
 * Requer: JWT completo (Authorization: Bearer <token>)
 *
 * Retorna as opções WebAuthn (challenge, rp, user, pubKeyCredParams).
 * O frontend chama navigator.credentials.create() e depois /concluir.
 */
router.post('/registrar/iniciar', autenticarJWT, async (req, res) => {
    try {
        const userId = req.user.id;
        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'userId ausente no token.'
            });
        }

        const challenge = passkeyCrypto.gerarChallenge();

        // user.id deve ser um Buffer de 32 bytes. ObjectId tem 12 bytes (24 hex),
        // então completamos com zero à direita para ficar determinístico.
        const userIdBuf = Buffer.from(String(userId).padEnd(24, '0').slice(0, 24), 'hex');

        const userNome = req.user.nome || 'Usuário';
        const userEmail = req.user.email || '';

        // Exclui credenciais já cadastradas para este usuário (evita duplicar)
        const credenciaisExistentes = await BiometriaSistema
            .find({ userId, ativo: true })
            .select('credentialId')
            .lean();

        logger.info(`🔐 [BIOMETRIA] Registro iniciado — user ${userNome} (${userId})`);

        res.json({
            success: true,
            opcoes: {
                challenge,
                rp: {
                    name: obterRpName(),
                    id: obterRpId(req)
                },
                user: {
                    id: passkeyCrypto.b64urlEncode(userIdBuf),
                    name: userEmail || String(userId),
                    displayName: userNome
                },
                pubKeyCredParams: [
                    { type: 'public-key', alg: -7 },   // ES256
                    { type: 'public-key', alg: -257 }  // RS256
                ],
                authenticatorSelection: {
                    userVerification: 'required',
                    residentKey: 'required',
                    requireResidentKey: true
                },
                timeout: 60000,
                attestation: 'none',
                excludeCredentials: credenciaisExistentes.map(c => ({
                    id: c.credentialId,
                    type: 'public-key'
                }))
            },
            _challenge: challenge
        });
    } catch (err) {
        logger.error('❌ [BIOMETRIA] registrar/iniciar:', err);
        res.status(500).json({
            success: false,
            error: 'Falha ao iniciar cadastro de biometria.'
        });
    }
});

// ============================================================================
// ROTA: CADASTRAR BIOMETRIA — CONCLUIR
// ============================================================================
/**
 * POST /api/biometria/registrar/concluir
 * Requer: JWT completo
 *
 * Body: { credential, challenge, deviceLabel? }
 * Salva a chave pública no banco e marca como ativa.
 */
router.post('/registrar/concluir', autenticarJWT, async (req, res) => {
    try {
        const userId = req.user.id;
        const { credential, challenge, deviceLabel } = req.body || {};

        if (!credential || !credential.response) {
            return res.status(400).json({
                success: false,
                error: 'Credencial ausente.'
            });
        }
        if (!challenge) {
            return res.status(400).json({
                success: false,
                error: 'Challenge ausente.'
            });
        }

        // Valida clientDataJSON (type, challenge, origin)
        const check = validarClientData(req, credential.response, 'webauthn.create', challenge);
        if (!check.ok) {
            return res.status(400).json({
                success: false,
                error: check.error
            });
        }

        // Extrai a chave pública da attestationObject
        let extraido;
        try {
            extraido = passkeyCrypto.extrairChavePublicaDaAttestation(
                credential.response.attestationObject
            );
        } catch (e) {
            return res.status(400).json({
                success: false,
                error: 'Attestation inválida: ' + e.message
            });
        }

        // Unicidade global do credentialId
        const existente = await BiometriaSistema
            .findOne({ credentialId: extraido.credentialId })
            .lean();

        if (existente) {
            return res.status(409).json({
                success: false,
                error: 'Esta passkey já está registrada.'
            });
        }

        const doc = new BiometriaSistema({
            userId,
            userNome: req.user.nome || '',
            userRole: req.user.role || '',
            credentialId: extraido.credentialId,
            publicKeyJwk: extraido.publicKeyJwk,
            alg: extraido.publicKeyJwk.alg || -7,
            counter: 0,
            transports: credential.response.transports || [],
            aaguid: extraido.aaguid || '',
            attestationType: 'none',
            userVerification: 'required',
            deviceLabel: (deviceLabel || 'Dispositivo').slice(0, 120),
            ip: req.ip || '',
            userAgent: req.headers['user-agent'] || ''
        });

        await doc.save();

        logger.info(`✅ [BIOMETRIA] Passkey cadastrada — ${req.user.nome} (${doc.deviceLabel})`);

        res.status(201).json({
            success: true,
            mensagem: 'Biometria cadastrada com sucesso!',
            credentialId: doc.credentialId
        });
    } catch (err) {
        if (err && (err.code === 11000 || /duplicate key/i.test(err.message || ''))) {
            return res.status(409).json({
                success: false,
                error: 'Credencial já registrada.'
            });
        }
        logger.error('❌ [BIOMETRIA] registrar/concluir:', err);
        res.status(500).json({
            success: false,
            error: 'Falha ao concluir cadastro de biometria.'
        });
    }
});

// ============================================================================
// ROTA: AUTENTICAR COM BIOMETRIA — INICIAR
// ============================================================================
/**
 * POST /api/biometria/autenticar/iniciar
 * Requer: 2fa_token (Authorization: Bearer <2fa_token>)
 *
 * Retorna o challenge + allowCredentials. Se o usuário não tiver
 * passkey ativa, devolve 404 com codigo: 'NO_CREDENTIALS'.
 */
router.post('/autenticar/iniciar', autenticar2FA, async (req, res) => {
    try {
        const userId = req.twoFA.id;

        const creds = await BiometriaSistema
            .find({ userId, ativo: true })
            .select('credentialId transports')
            .lean();

        if (creds.length === 0) {
            return res.status(404).json({
                success: false,
                codigo: 'NO_CREDENTIALS',
                error: 'Nenhuma biometria cadastrada para esta conta.'
            });
        }

        const challenge = passkeyCrypto.gerarChallenge();

        res.json({
            success: true,
            opcoes: {
                challenge,
                rpId: obterRpId(req),
                timeout: 60000,
                userVerification: 'required',
                allowCredentials: creds.map(c => ({
                    id: c.credentialId,
                    type: 'public-key',
                    transports: c.transports || []
                }))
            },
            _challenge: challenge
        });
    } catch (err) {
        logger.error('❌ [BIOMETRIA] autenticar/iniciar:', err);
        res.status(500).json({
            success: false,
            error: 'Falha ao iniciar autenticação por biometria.'
        });
    }
});

// ============================================================================
// ROTA: AUTENTICAR COM BIOMETRIA — CONCLUIR
// ============================================================================
/**
 * POST /api/biometria/autenticar/concluir
 * Requer: 2fa_token
 *
 * Body: { credential, challenge }
 * Verifica a assinatura e emite o JWT final (mesmo formato do login normal).
 */
router.post('/autenticar/concluir', autenticar2FA, async (req, res) => {
    try {
        const userId = req.twoFA.id;
        const { credential, challenge } = req.body || {};

        if (!credential || !credential.response) {
            return res.status(400).json({
                success: false,
                error: 'Credencial ausente.'
            });
        }
        if (!challenge) {
            return res.status(400).json({
                success: false,
                error: 'Challenge ausente.'
            });
        }

        const credIdRaw = credential.rawId || credential.id;
        if (!credIdRaw) {
            return res.status(400).json({
                success: false,
                error: 'rawId ausente.'
            });
        }

        // Busca credencial ativa do usuário
        const doc = await BiometriaSistema.findOne({
            userId,
            credentialId: credIdRaw,
            ativo: true
        });

        if (!doc) {
            return res.status(404).json({
                success: false,
                codigo: 'NO_CREDENTIALS',
                error: 'Credencial não encontrada para este usuário.'
            });
        }

        // Valida clientDataJSON
        const check = validarClientData(req, credential.response, 'webauthn.get', challenge);
        if (!check.ok) {
            return res.status(400).json({
                success: false,
                error: check.error
            });
        }

        // Verifica assinatura
        const assinaturaOk = passkeyCrypto.verificarAssertion({
            publicKeyJwk: doc.publicKeyJwk,
            clientDataJSON: credential.response.clientDataJSON,
            authenticatorData: credential.response.authenticatorData,
            signature: credential.response.signature
        });

        if (!assinaturaOk) {
            return res.status(401).json({
                success: false,
                error: 'Assinatura inválida.'
            });
        }

        // Atualiza counter (anti-replay básico)
        try {
            const authDataBuf = passkeyCrypto.b64urlDecode(credential.response.authenticatorData);
            const novoCounter = authDataBuf.readUInt32BE(33);
            if (novoCounter > 0 && novoCounter <= doc.counter) {
                return res.status(401).json({
                    success: false,
                    error: 'Counter inválido (possível replay).'
                });
            }
            doc.counter = novoCounter;
        } catch (_) {
            // Alguns autenticadores (ex.: iCloud Keychain) não incrementam counter
        }

        doc.ultimoUsoEm = new Date();
        await doc.save();

        // Busca dados frescos do usuário (fallback para o que está no token)
        let userDoc = null;
        if (User) {
            try {
                userDoc = await User.findById(userId).lean();
            } catch (_) { /* silencioso */ }
        }

        const userRole = userDoc?.role || req.twoFA.role || 'aluno';
        const userNome = userDoc?.nome || req.twoFA.nome || 'Usuário';
        const userEmail = userDoc?.email || req.twoFA.email || '';

        const novoToken = jwt.sign(
            {
                id: String(userId),
                nome: userNome,
                email: userEmail,
                role: userRole
            },
            JWT_SECRET,
            { expiresIn: TOKEN_FINAL_TTL }
        );

        logger.info(`✅ [BIOMETRIA] Login por biometria — ${userNome} (${userRole})`);

        res.json({
            success: true,
            token: novoToken,
            user: {
                id: String(userId),
                nome: userNome,
                email: userEmail,
                role: userRole
            },
            redirectTo: calcularRedirect(userRole)
        });
    } catch (err) {
        logger.error('❌ [BIOMETRIA] autenticar/concluir:', err);
        res.status(500).json({
            success: false,
            error: 'Falha na autenticação por biometria.'
        });
    }
});

// ============================================================================
// ROTA: LISTAR MINHAS BIOMETRIAS
// ============================================================================
/**
 * GET /api/biometria/minhas
 * Requer: JWT completo
 */
router.get('/minhas', autenticarJWT, async (req, res) => {
    try {
        const lista = await BiometriaSistema
            .find({ userId: req.user.id })
            .select('-publicKeyJwk -challengeAtual -challengeExpiraEm')
            .sort({ createdAt: -1 })
            .lean();

        res.json({ success: true, biometrias: lista });
    } catch (err) {
        logger.error('❌ [BIOMETRIA] /minhas:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================================================
// ROTA: REVOGAR MINHA BIOMETRIA
// ============================================================================
/**
 * DELETE /api/biometria/:id
 * Requer: JWT completo — só pode revogar as próprias
 */
router.delete('/:id', autenticarJWT, async (req, res) => {
    try {
        const doc = await BiometriaSistema.findOneAndUpdate(
            { _id: req.params.id, userId: req.user.id },
            { ativo: false },
            { new: true }
        );

        if (!doc) {
            return res.status(404).json({
                success: false,
                error: 'Biometria não encontrada.'
            });
        }

        logger.info(`🔒 [BIOMETRIA] Revogada pelo próprio usuário — ${doc.userNome} (${doc.deviceLabel})`);

        res.json({ success: true, mensagem: 'Biometria revogada.' });
    } catch (err) {
        logger.error('❌ [BIOMETRIA] DELETE /:id:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================================================
// ADMIN — LISTAR TODAS AS BIOMETRIAS
// ============================================================================
/**
 * GET /api/biometria/admin
 * Requer: JWT de admin ou super_admin
 *
 * Query params:
 *   pagina (default 1), limite (default 20, max 100)
 *   busca  — nome, deviceLabel ou credentialId
 *   role   — filtrar por perfil
 *   ativo  — 'sim' | 'nao' (omitir = todos)
 */
router.get('/admin', autenticarJWT, exigirAdmin, async (req, res) => {
    try {
        const pagina = Math.max(1, parseInt(req.query.pagina, 10) || 1);
        const limite = Math.min(100, Math.max(5, parseInt(req.query.limite, 10) || 20));
        const filtro = {};

        if (req.query.busca) {
            const termo = String(req.query.busca).trim();
            const rx = new RegExp(termo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            filtro.$or = [
                { userNome: rx },
                { deviceLabel: rx },
                { credentialId: rx }
            ];
        }

        if (req.query.role && req.query.role !== 'todos') {
            filtro.userRole = req.query.role;
        }

        if (req.query.ativo === 'sim') filtro.ativo = true;
        if (req.query.ativo === 'nao') filtro.ativo = false;

        // Executa em paralelo: contagem, listagem paginada e estatísticas
        const [total, docs, stats] = await Promise.all([
            BiometriaSistema.countDocuments(filtro),
            BiometriaSistema.find(filtro)
                .sort({ createdAt: -1 })
                .skip((pagina - 1) * limite)
                .limit(limite)
                .select('-publicKeyJwk -challengeAtual -challengeExpiraEm')
                .lean(),
            (async () => {
                const [totalGeral, ativas, revogadas, usuariosUnicos] = await Promise.all([
                    BiometriaSistema.countDocuments({}),
                    BiometriaSistema.countDocuments({ ativo: true }),
                    BiometriaSistema.countDocuments({ ativo: false }),
                    BiometriaSistema.distinct('userId')
                ]);
                return {
                    total: totalGeral,
                    ativas,
                    revogadas,
                    usuariosComPasskey: usuariosUnicos.length
                };
            })()
        ]);

        const rolesDisponiveis = await BiometriaSistema.distinct('userRole', { userRole: { $ne: '' } });

        res.json({
            success: true,
            biometrias: docs.map(d => ({
                _id: d._id,
                userId: d.userId,
                userNome: d.userNome || '—',
                userRole: d.userRole || '—',
                deviceLabel: d.deviceLabel || 'Dispositivo',
                credentialId: d.credentialId,
                transports: d.transports || [],
                aaguid: d.aaguid || '',
                ativo: d.ativo,
                createdAt: d.createdAt,
                ultimoUsoEm: d.ultimoUsoEm,
                ip: d.ip || '',
                userAgent: d.userAgent || '',
                counter: d.counter || 0
            })),
            estatisticas: stats,
            opcoes: { roles: rolesDisponiveis.filter(Boolean).sort() },
            paginacao: {
                pagina,
                limite,
                total,
                totalPaginas: Math.max(1, Math.ceil(total / limite))
            }
        });
    } catch (error) {
        logger.error('❌ [BIOMETRIA-ADMIN] GET /admin:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// ADMIN — REVOGAR BIOMETRIA
// ============================================================================
/**
 * PUT /api/biometria/admin/:id/revogar
 * Requer: JWT de admin ou super_admin
 */
router.put('/admin/:id/revogar', autenticarJWT, exigirAdmin, async (req, res) => {
    try {
        const doc = await BiometriaSistema.findByIdAndUpdate(
            req.params.id,
            { ativo: false },
            { new: true }
        );

        if (!doc) {
            return res.status(404).json({ success: false, error: 'Biometria não encontrada.' });
        }

        logger.info(`🔒 [BIOMETRIA-ADMIN] Revogada por ${req.user.nome} — ${doc.userNome} (${doc.deviceLabel})`);

        res.json({ success: true, mensagem: 'Biometria revogada com sucesso.' });
    } catch (error) {
        logger.error('❌ [BIOMETRIA-ADMIN] revogar:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// ADMIN — REATIVAR BIOMETRIA
// ============================================================================
/**
 * PUT /api/biometria/admin/:id/reativar
 * Requer: JWT de admin ou super_admin
 */
router.put('/admin/:id/reativar', autenticarJWT, exigirAdmin, async (req, res) => {
    try {
        const doc = await BiometriaSistema.findByIdAndUpdate(
            req.params.id,
            { ativo: true },
            { new: true }
        );

        if (!doc) {
            return res.status(404).json({ success: false, error: 'Biometria não encontrada.' });
        }

        logger.info(`🔓 [BIOMETRIA-ADMIN] Reativada por ${req.user.nome} — ${doc.userNome}`);

        res.json({ success: true, mensagem: 'Biometria reativada com sucesso.' });
    } catch (error) {
        logger.error('❌ [BIOMETRIA-ADMIN] reativar:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// ADMIN — EXCLUIR BIOMETRIA (PERMANENTE)
// ============================================================================
/**
 * DELETE /api/biometria/admin/:id
 * Requer: JWT de admin ou super_admin
 */
router.delete('/admin/:id', autenticarJWT, exigirAdmin, async (req, res) => {
    try {
        const doc = await BiometriaSistema.findByIdAndDelete(req.params.id);

        if (!doc) {
            return res.status(404).json({ success: false, error: 'Biometria não encontrada.' });
        }

        logger.info(`🗑️ [BIOMETRIA-ADMIN] Excluída por ${req.user.nome} — ${doc.userNome}`);

        res.json({ success: true, mensagem: 'Biometria excluída permanentemente.' });
    } catch (error) {
        logger.error('❌ [BIOMETRIA-ADMIN] excluir:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// EXPORTAR
// ============================================================================
module.exports = router;