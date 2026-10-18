// ============================================================================
// routes/webauthn.js — Biometria WebAuthn (FIDO2)
// ============================================================================
// Descrição: Registro e autenticação por biometria (Touch ID, Face ID,
//            Windows Hello, Android fingerprint, PIN do dispositivo).
// ============================================================================

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

let logger;
try {
  logger = require('../utils/logger');
} catch (err) {
  logger = console;
}

// ============================================================================
// CARREGAR @simplewebauthn/server
// ============================================================================
let swaServer;
try {
  swaServer = require('@simplewebauthn/server');
} catch (err) {
  logger.error('❌ @simplewebauthn/server não instalado. Execute: npm install @simplewebauthn/server');
  throw err;
}

const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} = swaServer;

// ============================================================================
// MODELOS
// ============================================================================
const User = require('../models/User');
const WebAuthnCredential = require('../models/WebAuthnCredential');

// ============================================================================
// CONSTANTES
// ============================================================================
const RP_NAME = process.env.WEBAUTHN_RP_NAME || 'EducaPleno';
const RP_ID = process.env.WEBAUTHN_RP_ID || (
  process.env.NODE_ENV === 'production'
    ? 'educapleno.com'
    : 'localhost'
);
const ORIGIN = process.env.WEBAUTHN_ORIGIN || (
  process.env.NODE_ENV === 'production'
    ? 'https://educapleno.com'
    : 'http://localhost:3000'
);

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutos

// ============================================================================
// CACHE DE CHALLENGES
// ============================================================================
const challengeCache = new Map();

function setChallenge(userId, challenge, type) {
  challengeCache.set(String(userId), {
    challenge,
    type,
    expiresAt: Date.now() + CHALLENGE_TTL_MS
  });

  if (challengeCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of challengeCache.entries()) {
      if (v.expiresAt < now) challengeCache.delete(k);
    }
  }
}

function getChallenge(userId, type) {
  const entry = challengeCache.get(String(userId));
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    challengeCache.delete(String(userId));
    return null;
  }
  if (entry.type !== type) return null;
  return entry.challenge;
}

function deleteChallenge(userId) {
  challengeCache.delete(String(userId));
}

// ============================================================================
// HELPERS
// ============================================================================
function base64urlToUint8Array(base64url) {
  if (!base64url) return new Uint8Array(0);
  if (base64url instanceof Uint8Array) return base64url;
  
  const pad = base64url.length % 4;
  const padded = base64url.replace(/-/g, '+').replace(/_/g, '/') + (pad ? '='.repeat(4 - pad) : '');
  return new Uint8Array(Buffer.from(padded, 'base64'));
}

function uint8ArrayToBase64url(u8) {
  if (typeof u8 === 'string') return u8; // fallback
  return Buffer.from(u8).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function obterDestinoPorPerfil(role) {
  const redirectMap = {
    'super_admin': '/admin.html',
    'admin': '/admin-simples.html',
    'professor': '/index.html',
    'setor_pedagogico': '/setor-pedagogico.html',
    'coordenacao_patio': '/coordenacao-patio.html',
    'cozinha': '/cozinha-dashboard.html',
    'gestao_geral': '/gestao-geral.html',
    'enfermaria': '/enfermaria.html',
    'supervisao': '/supervisao.html',
    'biblioteca': '/biblioteca.html',
    'psicologia': '/psicologia.html',
    'assistente-social': '/assistente-social.html',
    'protagonismo': '/protagonismo.html',
    'secretaria': '/secretaria.html',
    'recepcao': '/recepcao.html',
    'aluno': '/aluno.html'
  };
  return redirectMap[role] || '/login.html';
}

async function obterJwtExpiracao(Config) {
  const padrao = process.env.JWT_EXPIRES_IN || '24h';
  if (!Config) return padrao;
  try {
    const cfg = await Config.findOne({ chave: 'seguranca.jwtExpiracao' });
    if (cfg && cfg.valor) {
      const v = cfg.valor;
      if (typeof v === 'number' && v > 0 && v <= 8760) return `${v}h`;
      if (typeof v === 'string' && /^\d+(\.\d+)?(ms|s|m|h|d|w|y)$/i.test(v.trim())) return v.trim();
    }
  } catch (err) {
    logger.warn('⚠️ Erro ao buscar JWT expiração:', err.message);
  }
  return padrao;
}

function parseJwtExpiration(expiration) {
  if (typeof expiration === 'number') return expiration;
  const match = String(expiration).match(/^(\d+)([hH])$/);
  if (match) return parseInt(match[1]) * 60 * 60;
  return 24 * 60 * 60;
}

// ============================================================================
// MIDDLEWARE DE AUTH
// ============================================================================
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, error: 'Token não fornecido' });
  }

  jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
    if (err) {
      return res.status(403).json({ success: false, error: 'Token inválido ou expirado' });
    }

    if (decoded.temp === true && decoded.purpose === '2fa') {
      req.userId = decoded.id;
      req.userRole = decoded.role;
      req.userNome = decoded.nome;
      req.tokenTemp = true;
      return next();
    }

    try {
      const user = await User.findById(decoded.id).select('tokenVersion');
      if (!user) {
        return res.status(401).json({ success: false, error: 'Usuário não encontrado' });
      }
      if ((user.tokenVersion || 0) !== (decoded.tokenVersion || 0)) {
        return res.status(401).json({
          success: false,
          error: 'Sessão encerrada. Faça login novamente.',
          motivo: 'reset_global',
          precisaLogin: true
        });
      }
    } catch (dbErr) {
      logger.error('❌ Erro ao verificar tokenVersion:', dbErr);
    }

    req.userId = decoded.id;
    req.userRole = decoded.role;
    req.userNome = decoded.nome;
    req.tokenTemp = false;
    next();
  });
};

// ============================================================================
// HEALTH CHECK
// ============================================================================
router.get('/auth/webauthn/health', (req, res) => {
  res.json({
    success: true,
    service: 'WebAuthn',
    rpID: RP_ID,
    origin: ORIGIN,
    challengesEmCache: challengeCache.size
  });
});

// ============================================================================
// POST /api/auth/webauthn/register-options
// ============================================================================
router.post('/auth/webauthn/register-options', authenticateToken, async (req, res) => {
  try {
    if (req.tokenTemp === true) {
      return res.status(403).json({
        success: false,
        error: 'Complete o 2FA antes de registrar biometria.',
        codigo: 'NEED_FULL_LOGIN'
      });
    }

    const user = await User.findById(req.userId).select('nome email');
    if (!user) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    }

    const existentes = await WebAuthnCredential.find({ userId: user._id })
      .select('credentialId transports');

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userID: Buffer.from(String(user._id)),
      userName: user.email,
      userDisplayName: user.nome || user.email,
      attestationType: 'none',
      excludeCredentials: existentes.map(c => ({
        id: base64urlToUint8Array(c.credentialId),
        type: 'public-key',
        transports: c.transports || []
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
        authenticatorAttachment: 'platform'
      },
      supportedAlgorithmIDs: [-7, -257]
    });

    setChallenge(req.userId, options.challenge, 'register');
    logger.info(`🔐 WebAuthn register-options gerado para ${user.email}`);

    res.json({ success: true, options });
  } catch (error) {
    logger.error('❌ Erro em register-options:', error);
    res.status(500).json({ success: false, error: 'Erro ao gerar opções: ' + error.message });
  }
});

// ============================================================================
// POST /api/auth/webauthn/register-verify
// ============================================================================
router.post('/auth/webauthn/register-verify', authenticateToken, async (req, res) => {
  try {
    if (req.tokenTemp === true) {
      return res.status(403).json({
        success: false,
        error: 'Complete o 2FA antes de registrar biometria.'
      });
    }

    const { credential, deviceLabel } = req.body;

    if (!credential || !credential.id || !credential.response) {
      return res.status(400).json({ success: false, error: 'Credencial inválida' });
    }

    const expectedChallenge = getChallenge(req.userId, 'register');
    if (!expectedChallenge) {
      return res.status(400).json({
        success: false,
        error: 'Challenge expirado ou inválido. Tente novamente.'
      });
    }

    const response = {
      id: credential.id,
      rawId: base64urlToUint8Array(credential.rawId || credential.id),
      type: credential.type,
      response: {
        clientDataJSON: base64urlToUint8Array(credential.response.clientDataJSON),
        attestationObject: base64urlToUint8Array(credential.response.attestationObject),
        transports: credential.response.transports || []
      },
      clientExtensionResults: credential.clientExtensionResults || {},
      authenticatorAttachment: credential.authenticatorAttachment || 'platform'
    };

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true
    });

    deleteChallenge(req.userId);

    if (!verification.verified || !verification.registrationInfo) {
      logger.warn(`⚠️ Registro WebAuthn não verificado para userId ${req.userId}`);
      return res.status(400).json({
        success: false,
        error: 'Verificação de registro falhou'
      });
    }

    // 🔥 CORREÇÃO: Tratando credentialID e credentialPublicKey (SimpleWebAuthn v9+)
    const { credentialID, credentialPublicKey, counter } = verification.registrationInfo;
    
    const credencialIdStr = uint8ArrayToBase64url(credentialID);
    const publicKeyBuffer = credentialPublicKey instanceof Uint8Array 
      ? Buffer.from(credentialPublicKey) 
      : Buffer.from(credentialPublicKey, 'base64url');

    const jaExiste = await WebAuthnCredential.findOne({ credentialId: credencialIdStr });
    if (jaExiste) {
      return res.status(409).json({
        success: false,
        error: 'Esta credencial já está registrada'
      });
    }

    const nova = await WebAuthnCredential.create({
      userId: req.userId,
      credentialId: credencialIdStr,
      publicKey: publicKeyBuffer,
      counter: counter || 0,
      transports: credential.response.transports || [],
      deviceLabel: deviceLabel || null,
      userAgent: req.headers['user-agent'] || null,
      ipAddress: req.ip || null
    });

    logger.info(`✅ Credencial WebAuthn registrada para userId ${req.userId}`);

    res.json({
      success: true,
      message: '✅ Biometria ativada com sucesso!',
      credential: {
        id: nova.credentialId,
        deviceLabel: nova.deviceLabel,
        createdAt: nova.createdAt
      }
    });
  } catch (error) {
    logger.error('❌ Erro em register-verify:', error);
    res.status(500).json({ success: false, error: 'Erro ao verificar registro: ' + error.message });
  }
});

// ============================================================================
// POST /api/auth/webauthn/authenticate-options
// ============================================================================
router.post('/auth/webauthn/authenticate-options', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('email');
    if (!user) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    }

    const credenciais = await WebAuthnCredential.find({ userId: user._id })
      .select('credentialId transports');

    if (credenciais.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Nenhuma biometria registrada neste dispositivo/conta',
        codigo: 'NO_CREDENTIALS'
      });
    }

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      allowCredentials: credenciais.map(c => ({
        id: base64urlToUint8Array(c.credentialId),
        type: 'public-key',
        transports: c.transports || []
      })),
      userVerification: 'preferred'
    });

    setChallenge(req.userId, options.challenge, 'authenticate');
    logger.info(`🔐 WebAuthn authenticate-options para ${user.email}`);

    res.json({ success: true, options });
  } catch (error) {
    logger.error('❌ Erro em authenticate-options:', error);
    res.status(500).json({ success: false, error: 'Erro ao gerar opções: ' + error.message });
  }
});

// ============================================================================
// POST /api/auth/webauthn/authenticate-verify
// ============================================================================
router.post('/auth/webauthn/authenticate-verify', authenticateToken, async (req, res) => {
  try {
    const { credential } = req.body;

    if (!credential || !credential.id || !credential.response) {
      return res.status(400).json({ success: false, error: 'Credencial inválida' });
    }

    const expectedChallenge = getChallenge(req.userId, 'authenticate');
    if (!expectedChallenge) {
      return res.status(400).json({
        success: false,
        error: 'Challenge expirado. Tente novamente.'
      });
    }

    const credencialDb = await WebAuthnCredential.findOne({
      credentialId: credential.id,
      userId: req.userId
    });

    if (!credencialDb) {
      return res.status(404).json({
        success: false,
        error: 'Credencial não encontrada para este usuário'
      });
    }

    const response = {
      id: credential.id,
      rawId: base64urlToUint8Array(credential.rawId || credential.id),
      type: credential.type,
      response: {
        clientDataJSON: base64urlToUint8Array(credential.response.clientDataJSON),
        authenticatorData: base64urlToUint8Array(credential.response.authenticatorData),
        signature: base64urlToUint8Array(credential.response.signature),
        userHandle: credential.response.userHandle
          ? base64urlToUint8Array(credential.response.userHandle)
          : null
      },
      clientExtensionResults: credential.clientExtensionResults || {},
      authenticatorAttachment: credential.authenticatorAttachment || 'platform'
    };

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      authenticator: {
        credentialID: base64urlToUint8Array(credencialDb.credentialId),
        credentialPublicKey: new Uint8Array(credencialDb.publicKey),
        counter: credencialDb.counter || 0
      },
      requireUserVerification: true
    });

    deleteChallenge(req.userId);

    if (!verification.verified) {
      logger.warn(`⚠️ Verificação biométrica falhou para userId ${req.userId}`);
      return res.status(401).json({
        success: false,
        error: 'Verificação biométrica falhou'
      });
    }

    credencialDb.counter = verification.authenticationInfo.newCounter;
    credencialDb.lastUsedAt = new Date();
    await credencialDb.save();

    const user = await User.findById(req.userId)
      .select('+twoFactorEnabled +forcePasswordChange +nome +email +role +telefone +tokenVersion');

    if (!user) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    }

    user.lastActive = new Date();
    user.lastLogin = new Date();
    user.ultimoLogout = null;
    await user.save();

    let Config = null;
    try { Config = mongoose.model('Config'); } catch (_) {}

    const jwtExpiracao = await obterJwtExpiracao(Config);

    const authToken = jwt.sign(
      {
        id: user._id,
        role: user.role,
        nome: user.nome,
        twoFactorEnabled: user.twoFactorEnabled,
        tokenVersion: user.tokenVersion || 0
      },
      process.env.JWT_SECRET,
      { expiresIn: jwtExpiracao }
    );

    const redirectTo = user.forcePasswordChange
      ? '/trocar-senha.html'
      : obterDestinoPorPerfil(user.role);

    res.cookie('auth_token', authToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: parseJwtExpiration(jwtExpiracao) * 1000
    });

    logger.info(`✅ Login biométrico OK para ${user.email}`);

    res.json({
      success: true,
      token: authToken,
      user: {
        id: user._id,
        nome: user.nome,
        email: user.email,
        role: user.role,
        twoFactorEnabled: user.twoFactorEnabled,
        telefone: user.telefone
      },
      redirectTo
    });
  } catch (error) {
    logger.error('❌ Erro em authenticate-verify:', error);
    res.status(500).json({ success: false, error: 'Erro ao verificar biometria: ' + error.message });
  }
});

// ============================================================================
// GET /api/auth/webauthn/credentials
// ============================================================================
router.get('/auth/webauthn/credentials', authenticateToken, async (req, res) => {
  try {
    if (req.tokenTemp === true) {
      return res.status(403).json({ success: false, error: 'Complete o 2FA primeiro' });
    }

    const credenciais = await WebAuthnCredential.find({ userId: req.userId })
      .select('credentialId deviceLabel transports createdAt lastUsedAt userAgent')
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      total: credenciais.length,
      credentials: credenciais.map(c => ({
        id: c.credentialId,
        deviceLabel: c.deviceLabel,
        transports: c.transports,
        createdAt: c.createdAt,
        lastUsedAt: c.lastUsedAt,
        userAgent: c.userAgent
      }))
    });
  } catch (error) {
    logger.error('❌ Erro ao listar credenciais:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// DELETE /api/auth/webauthn/credentials/:id
// ============================================================================
router.delete('/auth/webauthn/credentials/:id', authenticateToken, async (req, res) => {
  try {
    if (req.tokenTemp === true) {
      return res.status(403).json({ success: false, error: 'Complete o 2FA primeiro' });
    }

    const { id } = req.params;
    const resultado = await WebAuthnCredential.deleteOne({
      credentialId: id,
      userId: req.userId
    });

    if (resultado.deletedCount === 0) {
      return res.status(404).json({ success: false, error: 'Credencial não encontrada' });
    }

    logger.info(`🗑️ Credencial WebAuthn removida: ${id} (userId ${req.userId})`);

    res.json({ success: true, message: 'Credencial removida' });
  } catch (error) {
    logger.error('❌ Erro ao remover credencial:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;