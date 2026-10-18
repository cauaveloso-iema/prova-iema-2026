// ============================================================================
// routes/webauthn.js — Biometria WebAuthn (FIDO2)
// ============================================================================

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const crypto = require('crypto');

let logger;
try { logger = require('../utils/logger'); } catch { logger = console; }

// Carrega SimpleWebAuthn
let swaServer;
try {
  swaServer = require('@simplewebauthn/server');
} catch (err) {
  logger.error('❌ @simplewebauthn/server não instalado.');
  throw err;
}

const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} = swaServer;

const User = require('../models/User');
const WebAuthnCredential = require('../models/WebAuthnCredential');

const RP_NAME = process.env.WEBAUTHN_RP_NAME || 'EducaPleno';
const RP_ID = process.env.WEBAUTHN_RP_ID || (process.env.NODE_ENV === 'production' ? 'educapleno.com' : 'localhost');
const ORIGIN = process.env.WEBAUTHN_ORIGIN || (process.env.NODE_ENV === 'production' ? 'https://educapleno.com' : 'http://localhost:3000');
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

const challengeCache = new Map();

function setChallenge(userId, challenge, type) {
  challengeCache.set(String(userId), { challenge, type, expiresAt: Date.now() + CHALLENGE_TTL_MS });
}

function getChallenge(userId, type) {
  const entry = challengeCache.get(String(userId));
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) { challengeCache.delete(String(userId)); return null; }
  if (entry.type !== type) return null;
  return entry.challenge;
}

function deleteChallenge(userId) { challengeCache.delete(String(userId)); }

// Converte string Base64URL para Buffer/ArrayBuffer (seguro para SimpleWebAuthn v9)
function toBuffer(str) {
  if (typeof str !== 'string') return str;
  return Buffer.from(str, 'base64url');
}

// Middleware de Auth (aceita token normal e token temporário 2FA)
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ success: false, error: 'Token não fornecido' });

  jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
    if (err) return res.status(403).json({ success: false, error: 'Token inválido' });

    if (decoded.temp === true && decoded.purpose === '2fa') {
      req.userId = decoded.id; req.userRole = decoded.role; req.userNome = decoded.nome;
      req.tokenTemp = true; return next();
    }

    try {
      const user = await User.findById(decoded.id).select('tokenVersion');
      if (!user) return res.status(401).json({ success: false, error: 'Usuário não encontrado' });
      if ((user.tokenVersion || 0) !== (decoded.tokenVersion || 0)) {
        return res.status(401).json({ success: false, error: 'Sessão encerrada' });
      }
    } catch (dbErr) {}

    req.userId = decoded.id; req.userRole = decoded.role; req.userNome = decoded.nome;
    req.tokenTemp = false; next();
  });
};

// ============================================================================
// ROTAS
// ============================================================================

router.get('/auth/webauthn/health', (req, res) => {
  res.json({ success: true, rpID: RP_ID, origin: ORIGIN });
});

// 1. Gerar opções de registro
router.post('/auth/webauthn/register-options', authenticateToken, async (req, res) => {
  try {
    if (req.tokenTemp) return res.status(403).json({ success: false, error: 'Faça login completo primeiro' });

    const user = await User.findById(req.userId).select('nome email');
    if (!user) return res.status(404).json({ success: false, error: 'Usuário não encontrado' });

    const existentes = await WebAuthnCredential.find({ userId: user._id }).select('credentialId transports');

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userID: Buffer.from(String(user._id)),
      userName: user.email,
      userDisplayName: user.nome || user.email,
      attestationType: 'none',
      excludeCredentials: existentes.map(c => ({
        id: toBuffer(c.credentialId),
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
    res.json({ success: true, options });
  } catch (error) {
    logger.error('❌ Erro em register-options:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. Verificar e salvar registro
router.post('/auth/webauthn/register-verify', authenticateToken, async (req, res) => {
  try {
    if (req.tokenTemp) return res.status(403).json({ success: false, error: 'Faça login completo primeiro' });

    const { credential, deviceLabel } = req.body;
    if (!credential || !credential.id) return res.status(400).json({ success: false, error: 'Credencial inválida' });

    const expectedChallenge = getChallenge(req.userId, 'register');
    if (!expectedChallenge) return res.status(400).json({ success: false, error: 'Challenge expirado' });

    // Na v10+, a resposta deve ser passada diretamente, sem conversões manuais
    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true
    });

    deleteChallenge(req.userId);

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ success: false, error: 'Verificação falhou' });
    }

    // A v10+ retorna o objeto credential agregado
    const { credential: newCredential } = verification.registrationInfo;
    
    // O ID já vem como string Base64URL na v10+
    const credencialIdStr = newCredential.id;
    const publicKeyBuffer = Buffer.from(newCredential.publicKey);

    const jaExiste = await WebAuthnCredential.findOne({ credentialId: credencialIdStr });
    if (jaExiste) return res.status(409).json({ success: false, error: 'Credencial já registrada' });

    const nova = await WebAuthnCredential.create({
      userId: req.userId,
      credentialId: credencialIdStr,
      publicKey: publicKeyBuffer,
      counter: newCredential.counter || 0,
      transports: newCredential.transports || [],
      deviceLabel: deviceLabel || null,
      userAgent: req.headers['user-agent'] || null,
      ipAddress: req.ip || null
    });

    logger.info(`✅ Credencial WebAuthn registrada: ${credencialIdStr.substring(0, 10)}...`);

    res.json({
      success: true,
      message: '✅ Biometria ativada com sucesso!',
      credential: { id: nova.credentialId, deviceLabel: nova.deviceLabel, createdAt: nova.createdAt }
    });
  } catch (error) {
    logger.error('❌ Erro em register-verify:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 3. Gerar opções de autenticação
router.post('/auth/webauthn/authenticate-options', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('email');
    if (!user) return res.status(404).json({ success: false, error: 'Usuário não encontrado' });

    const credenciais = await WebAuthnCredential.find({ userId: user._id }).select('credentialId transports');
    if (credenciais.length === 0) {
      return res.status(404).json({ success: false, error: 'Nenhuma biometria registrada', codigo: 'NO_CREDENTIALS' });
    }

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      allowCredentials: credenciais.map(c => ({
        id: toBuffer(c.credentialId),
        type: 'public-key',
        transports: c.transports || []
      })),
      userVerification: 'preferred'
    });

    setChallenge(req.userId, options.challenge, 'authenticate');
    res.json({ success: true, options });
  } catch (error) {
    logger.error('❌ Erro em authenticate-options:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 4. Verificar autenticação
router.post('/auth/webauthn/authenticate-verify', authenticateToken, async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential || !credential.id) return res.status(400).json({ success: false, error: 'Credencial inválida' });

    const expectedChallenge = getChallenge(req.userId, 'authenticate');
    if (!expectedChallenge) return res.status(400).json({ success: false, error: 'Challenge expirado' });

    const credencialDb = await WebAuthnCredential.findOne({ credentialId: credential.id, userId: req.userId });
    if (!credencialDb) return res.status(404).json({ success: false, error: 'Credencial não encontrada' });

    const response = {
      id: credential.id,
      rawId: toBuffer(credential.rawId || credential.id),
      type: credential.type,
      response: {
        clientDataJSON: toBuffer(credential.response.clientDataJSON),
        authenticatorData: toBuffer(credential.response.authenticatorData),
        signature: toBuffer(credential.response.signature),
        userHandle: credential.response.userHandle ? toBuffer(credential.response.userHandle) : null
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
        credentialID: toBuffer(credencialDb.credentialId),
        credentialPublicKey: new Uint8Array(credencialDb.publicKey),
        counter: credencialDb.counter || 0
      },
      requireUserVerification: true
    });

    deleteChallenge(req.userId);
    if (!verification.verified) return res.status(401).json({ success: false, error: 'Verificação biométrica falhou' });

    credencialDb.counter = verification.authenticationInfo.newCounter;
    credencialDb.lastUsedAt = new Date();
    await credencialDb.save();

    const user = await User.findById(req.userId).select('+twoFactorEnabled +forcePasswordChange +nome +email +role +telefone +tokenVersion');
    if (!user) return res.status(404).json({ success: false, error: 'Usuário não encontrado' });

    user.lastActive = new Date(); user.lastLogin = new Date(); user.ultimoLogout = null;
    await user.save();

    let Config = null; try { Config = mongoose.model('Config'); } catch (_) {}
    const jwtExpiracao = '24h';

    const authToken = jwt.sign(
      { id: user._id, role: user.role, nome: user.nome, twoFactorEnabled: user.twoFactorEnabled, tokenVersion: user.tokenVersion || 0 },
      process.env.JWT_SECRET,
      { expiresIn: jwtExpiracao }
    );

    const redirectMap = {
      'super_admin': '/admin.html', 'admin': '/admin-simples.html', 'professor': '/index.html',
      'aluno': '/aluno.html', 'setor_pedagogico': '/setor-pedagogico.html'
    };
    const redirectTo = user.forcePasswordChange ? '/trocar-senha.html' : (redirectMap[user.role] || '/login.html');

    res.cookie('auth_token', authToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' });

    res.json({
      success: true,
      token: authToken,
      user: { id: user._id, nome: user.nome, email: user.email, role: user.role },
      redirectTo
    });
  } catch (error) {
    logger.error('❌ Erro em authenticate-verify:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;