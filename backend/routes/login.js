// ============================================================================
// LOGIN - EducaPleno (Login Normal + 2FA + Login Social + Recuperação de Senha)
// ============================================================================
// Descrição: Todas as rotas de autenticação, 2FA, login social e recuperação
//            de senha do EducaPleno.
//
// ⚠️ IMPORTANTE:
//   O modelo Config é obtido via mongoose.model('Config'), pois está
//   registrado inline no server.js (não existe models/Config.js).
//
// Rotas incluídas:
//   - POST /api/auth/login (login normal + validação 2FA)
//   - POST /api/auth/logout
//   - POST /api/auth/2fa/enable
//   - POST /api/auth/2fa/verify
//   - POST /api/auth/2fa/resend
//   - POST /api/auth/2fa/generate-qr
//   - POST /api/auth/2fa/verify-totp
//   - POST /api/auth/2fa/validate-totp
//   - GET  /api/auth/2fa/status
//   - GET  /api/auth/2fa/backup-codes
//   - POST /api/backup/solicitar
//   - POST /api/auth/reset-password/request
//   - POST /api/auth/reset-password/verify
//   - POST /api/auth/reset-password/confirm
//   - POST /api/login-social/:provider (Google / Microsoft)
//
// Autor: Equipe de Desenvolvimento
// ============================================================================

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const mongoose = require('mongoose');

// Logger
let logger;
try {
  logger = require('../utils/logger');
} catch (err) {
  logger = console;
}

// ============================================================================
// IMPORTAÇÃO DE MODELOS
// ============================================================================

const User = require('../models/User');

// Config — obtido do mongoose (registrado inline no server.js)
let Config = null;
try {
  Config = mongoose.model('Config');
  console.log('✅ [login] Model Config carregado via mongoose');
} catch (err) {
  console.warn('⚠️ [login] Config não disponível:', err.message);
}

// Notificacao — preferir arquivo, fallback para mongoose
let Notificacao = null;
try {
  Notificacao = require('../models/Notificacao');
  console.log('✅ [login] Model Notificacao carregado');
} catch (err) {
  try {
    Notificacao = mongoose.model('Notificacao');
    console.log('✅ [login] Model Notificacao carregado via mongoose');
  } catch (err2) {
    console.warn('⚠️ [login] Notificacao não disponível:', err2.message);
  }
}

// EmailService
let EmailService = null;
try {
  EmailService = require('../services/email-service');
} catch (err) {
  console.warn('⚠️ [login] EmailService não disponível:', err.message);
}

// ============================================================================
// CONSTANTES
// ============================================================================
const DOMINIO_INSTITUCIONAL = '@iemasaoluiscentro.net';

// Cache de códigos de reset (em produção, use Redis)
const resetCodes = new Map();

// ============================================================================
// HELPERS
// ============================================================================

function sanitizarJwtExpiracao(valor) {
  const padrao = '24h';

  if (valor === undefined || valor === null || valor === '') return padrao;

  if (typeof valor === 'number') {
    if (valor <= 0 || valor > 8760) return padrao;
    return `${valor}h`;
  }

  if (typeof valor === 'string') {
    const trimmed = valor.trim();
    if (/^\d+$/.test(trimmed)) {
      const num = parseInt(trimmed);
      if (num <= 0 || num > 8760) return padrao;
      return `${num}h`;
    }
    if (/^\d+(\.\d+)?(ms|s|m|h|d|w|y)$/i.test(trimmed)) return trimmed;
  }

  return padrao;
}

async function obterJwtExpiracao() {
  const padrao = process.env.JWT_EXPIRES_IN || '24h';
  if (!Config) return padrao;

  try {
    const configJwt = await Config.findOne({ chave: 'seguranca.jwtExpiracao' });
    if (configJwt && configJwt.valor) {
      return sanitizarJwtExpiracao(configJwt.valor);
    }
  } catch (err) {
    console.warn('⚠️ [login] Erro ao buscar JWT expiração:', err.message);
  }
  return padrao;
}

async function obterConfig2FAGlobal() {
  if (!Config) return false;

  try {
    const config2FA = await Config.findOne({ chave: 'seguranca.doisFatores' });
    return config2FA ? config2FA.valor === true : false;
  } catch (err) {
    console.warn('⚠️ [login] Erro ao buscar config 2FA:', err.message);
    return false;
  }
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

function gerarBackupCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function parseJwtExpiration(expiration) {
  if (typeof expiration === 'number') return expiration;
  const match = expiration.match(/^(\d+)([hH])$/);
  if (match) {
    return parseInt(match[1]) * 60 * 60;
  }
  return 24 * 60 * 60;
}

async function enviarSmsTwilio(telefone, mensagem) {
  try {
    const twilio = require('twilio');
    let twilioClient = null;

    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      twilioClient = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
    }

    if (!twilioClient) {
      throw new Error('Twilio client não inicializado - verifique credenciais');
    }

    let numeroDestino = telefone;
    if (!telefone.startsWith('+')) {
      numeroDestino = `+55${telefone.replace(/\D/g, '')}`;
    }

    const telefoneLimpo = numeroDestino.replace(/\D/g, '');
    if (telefoneLimpo.length < 10 || telefoneLimpo.length > 13) {
      throw new Error(`Número de telefone inválido: ${numeroDestino}`);
    }

    if (process.env.TWILIO_MESSAGING_SERVICE_SID) {
      try {
        const message = await twilioClient.messages.create({
          body: mensagem,
          messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID,
          to: numeroDestino
        });
        logger.info(`✅ SMS enviado via Messaging Service! SID: ${message.sid}`);
        return { success: true, sid: message.sid, enviado: true, via: 'messaging_service' };
      } catch (error) {
        logger.info('⚠️ Erro no Messaging Service:', error.message);
      }
    }

    if (process.env.TWILIO_PHONE_NUMBER) {
      try {
        const message = await twilioClient.messages.create({
          body: mensagem,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: numeroDestino
        });
        logger.info(`✅ SMS enviado via número direto! SID: ${message.sid}`);
        return { success: true, sid: message.sid, enviado: true, via: 'numero_direto' };
      } catch (error) {
        logger.info('⚠️ Erro no número direto:', error.message);
        throw error;
      }
    }

    throw new Error('Nenhuma configuração de SMS encontrada');

  } catch (error) {
    logger.error('❌ Erro Twilio:', error.message);
    const codigoMatch = mensagem.match(/\d{6}/);
    const codigo = codigoMatch ? codigoMatch[0] : '123456';
    logger.info(`\n🔧 FALLBACK - Código seria: ${codigo}`);
    logger.info(`🔧 Motivo: ${error.message}\n`);
    return { success: true, devMode: true, codigo, erro: error.message, enviado: false };
  }
}

// Middleware de autenticação local
const authenticateTokenLocal = (req, res, next) => {
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

    try {
      const user = await User.findById(decoded.id).select('tokenVersion');
      if (!user) {
        return res.status(401).json({ success: false, error: 'Usuário não encontrado.' });
      }

      if ((user.tokenVersion || 0) !== (decoded.tokenVersion || 0)) {
        return res.status(401).json({
          success: false,
          error: '🔐 Sua sessão foi encerrada pelo administrador. Faça login novamente.',
          motivo: 'reset_global',
          precisaLogin: true
        });
      }
    } catch (dbError) {
      logger.error('❌ Erro ao verificar tokenVersion:', dbError);
    }

    req.userId = decoded.id;
    req.userRole = decoded.role;
    req.userNome = decoded.nome;
    req.userTwoFactorEnabled = decoded.twoFactorEnabled || false;
    req.tokenVersion = decoded.tokenVersion;
    req.tokenTemp = false;

    next();
  });
};

// ============================================================================
// HEALTH CHECK
// ============================================================================
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'online',
    service: 'Login (Auth + Social)',
    models: {
      Config: !!Config,
      Notificacao: !!Notificacao,
      EmailService: !!EmailService
    }
  });
});

// ============================================================================
// POST /api/auth/login - LOGIN NORMAL (com 2FA)
// ============================================================================
router.post('/auth/login', async (req, res) => {
  try {
    const { email, password, cpf, twoFactorCode, token: tempToken } = req.body;

    // ===== CASO 1: REQUISIÇÃO COM TOKEN TEMPORÁRIO (2FA) =====
    if (tempToken) {
      logger.info('🔐 Requisição com token temporário recebida');

      try {
        const decoded = jwt.verify(tempToken, process.env.JWT_SECRET);

        if (decoded.temp && decoded.purpose === '2fa') {
          logger.info(`✅ Token temporário válido para usuário: ${decoded.id}`);

          const user = await User.findById(decoded.id)
            .select('+twoFactorSecret +twoFactorEnabled +twoFactorBackupCodes +twoFactorTempSecret +nome +email +role +telefone +forcePasswordChange +tokenVersion');

          if (!user) {
            return res.status(401).json({ success: false, error: 'Usuário não encontrado' });
          }

          if (!twoFactorCode) {
            return res.status(400).json({ success: false, error: 'Código 2FA não fornecido' });
          }

          let isValid = false;
          let motivo = '';

          // 1. Código SMS temporário
          if (user.twoFactorTempSecret && user.twoFactorTempSecret === twoFactorCode) {
            isValid = true;
            motivo = 'SMS';
            user.twoFactorTempSecret = null;
            await user.save();
            logger.info('✅ Código SMS válido');
          }

          // 2. TOTP (QR Code)
          if (!isValid && (user.twoFactorSecret || user.twoFactorTempSecret)) {
            try {
              if (user.twoFactorTempSecret) {
                const verified = speakeasy.totp.verify({
                  secret: user.twoFactorTempSecret,
                  encoding: 'base32',
                  token: twoFactorCode,
                  window: 1
                });

                if (verified) {
                  isValid = true;
                  motivo = 'TOTP (QR Code) - Temporário';
                  logger.info('✅ Código TOTP temporário válido');

                  if (!user.twoFactorEnabled) {
                    const backupCodes = [];
                    for (let i = 0; i < 10; i++) backupCodes.push(gerarBackupCode());

                    user.twoFactorEnabled = true;
                    user.twoFactorSecret = user.twoFactorTempSecret;
                    user.twoFactorBackupCodes = backupCodes;
                    user.twoFactorTempSecret = null;
                    await user.save();
                    logger.info('✅ 2FA ativado com sucesso via QR Code');
                  } else {
                    user.twoFactorTempSecret = null;
                    await user.save();
                  }
                }
              }

              if (!isValid && user.twoFactorSecret && user.twoFactorEnabled) {
                const verified = speakeasy.totp.verify({
                  secret: user.twoFactorSecret,
                  encoding: 'base32',
                  token: twoFactorCode,
                  window: 1
                });

                if (verified) {
                  isValid = true;
                  motivo = 'TOTP (QR Code) - Permanente';
                  logger.info('✅ Código TOTP permanente válido');
                }
              }
            } catch (error) {
              logger.error('❌ Erro ao verificar TOTP:', error.message);
            }
          }

          // 3. Código de backup
          if (!isValid && user.twoFactorBackupCodes && user.twoFactorBackupCodes.includes(twoFactorCode)) {
            isValid = true;
            motivo = 'backup';
            user.twoFactorBackupCodes = user.twoFactorBackupCodes.filter(c => c !== twoFactorCode);
            await user.save();
            logger.info('✅ Código de backup válido');
          }

          // 4. Código secreto permanente
          if (!isValid && user.twoFactorSecret && user.twoFactorSecret === twoFactorCode) {
            isValid = true;
            motivo = 'secreto';
            logger.info('✅ Código secreto válido');
          }

          if (!isValid) {
            logger.info('❌ Código inválido:', twoFactorCode);
            return res.status(401).json({ success: false, error: 'Código 2FA inválido' });
          }

          // 🔥 ATUALIZAR lastActive e lastLogin após 2FA bem-sucedido
          user.lastActive = new Date();
          user.lastLogin = new Date();
          user.ultimoLogout = null;
          await user.save();

          const jwtExpiracao = await obterJwtExpiracao();

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

          logger.info(`✅ 2FA verificado via ${motivo} para ${user.email}`);

          return res.json({
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
        }
      } catch (err) {
        logger.error('❌ Erro ao verificar token temporário:', err.message);
        return res.status(401).json({
          success: false,
          error: 'Token temporário inválido ou expirado'
        });
      }
    }

    // ===== CASO 2: LOGIN NORMAL (SEM TOKEN) =====
    logger.info('📝 Requisição de login normal');

    let maxTentativas = 5, tempoBloqueio = 15, exigir2FA = false;
    if (Config) {
      const [configTentativas, configBloqueio, config2FA] = await Promise.all([
        Config.findOne({ chave: 'seguranca.tentativasLogin' }),
        Config.findOne({ chave: 'seguranca.bloqueioTempo' }),
        Config.findOne({ chave: 'seguranca.doisFatores' })
      ]);
      maxTentativas = configTentativas ? configTentativas.valor : 5;
      tempoBloqueio = configBloqueio ? configBloqueio.valor : 15;
      exigir2FA = config2FA ? config2FA.valor : false;
    }

    const jwtExpiracao = await obterJwtExpiracao();

    logger.info(`🔐 Configuração 2FA: ${exigir2FA ? 'ATIVADO' : 'DESATIVADO'}`);

    let user;
    let campoBusca = '';

    if (email) {
      user = await User.findOne({ email: email.toLowerCase() })
        .select('+password +forcePasswordChange +passwordChangedAt +ativo +loginAttempts +lockUntil +twoFactorEnabled +twoFactorSecret +twoFactorBackupCodes +twoFactorTempSecret +telefone +nome +tokenVersion');
      campoBusca = 'email';
    } else if (cpf) {
      const cpfNumeros = cpf.replace(/\D/g, '');
      user = await User.findOne({ cpf: cpfNumeros })
        .select('+password +forcePasswordChange +passwordChangedAt +ativo +loginAttempts +lockUntil +twoFactorEnabled +twoFactorSecret +twoFactorBackupCodes +twoFactorTempSecret +telefone +nome +tokenVersion');
      campoBusca = 'CPF';
    } else {
      return res.status(400).json({ success: false, error: 'Email ou CPF é obrigatório' });
    }

    if (!user) {
      logger.info(`❌ Usuário não encontrado com ${campoBusca} fornecido`);
      return res.status(401).json({
        success: false,
        error: `${campoBusca === 'email' ? 'Email' : 'CPF'} ou senha incorretos`
      });
    }

    if (user.lockUntil && user.lockUntil > Date.now()) {
      const minutosRestantes = Math.ceil((user.lockUntil - Date.now()) / 60000);
      return res.status(401).json({
        success: false,
        error: `Usuário bloqueado. Tente novamente em ${minutosRestantes} minutos.`
      });
    }

    if (!user.ativo) {
      return res.status(401).json({
        success: false,
        error: 'Usuário inativo. Entre em contato com a administração.'
      });
    }

    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      user.loginAttempts = (user.loginAttempts || 0) + 1;

      if (user.loginAttempts >= maxTentativas) {
        user.lockUntil = Date.now() + (tempoBloqueio * 60 * 1000);
        user.loginAttempts = 0;
        await user.save();
        return res.status(401).json({
          success: false,
          error: `Muitas tentativas. Usuário bloqueado por ${tempoBloqueio} minutos.`
        });
      }

      await user.save();
      const tentativasRestantes = maxTentativas - user.loginAttempts;
      return res.status(401).json({
        success: false,
        error: `${campoBusca === 'email' ? 'Email' : 'CPF'} ou senha incorretos. ${tentativasRestantes} tentativa(s) restante(s).`
      });
    }

    user.loginAttempts = 0;
    user.lockUntil = null;
    user.lastLogin = new Date();
    user.lastActive = new Date();  // 🔥 ATUALIZAR ATIVIDADE
    user.ultimoLogout = null;
    await user.save();

    // Verificar 2FA
    const perfisCom2FA = ['super_admin'];
    if (exigir2FA) {
      perfisCom2FA.push(
        'admin', 'professor', 'setor_pedagogico', 'coordenacao_patio',
        'cozinha', 'gestao_geral', 'enfermaria', 'supervisao',
        'psicologia', 'assistente-social', 'protagonismo',
        'biblioteca', 'secretaria','recepcao'
      );
    }

    if (perfisCom2FA.includes(user.role)) {
      logger.info(`🔐 2FA exigido para ${user.role} ${user.email}`);

      if (!user.twoFactorBackupCodes || user.twoFactorBackupCodes.length === 0) {
        logger.info('🆕 Usuário sem códigos de backup - gerando 10 agora...');
        const backupCodes = [];
        for (let i = 0; i < 10; i++) backupCodes.push(gerarBackupCode());
        user.twoFactorBackupCodes = backupCodes;
        user.twoFactorBackupCodesShown = false;
        await user.save();
        logger.info('✅ 10 códigos de backup gerados');
      }

      const tempAuthToken = jwt.sign(
        {
          id: user._id,
          temp: true,
          purpose: '2fa',
          role: user.role,
          nome: user.nome
        },
        process.env.JWT_SECRET,
        { expiresIn: '10m' }
      );

      return res.json({
        success: true,
        requiresTwoFactor: true,
        userId: user._id,
        token: tempAuthToken,
        message: '2FA necessário'
      });
    }

    // ===== USUÁRIOS SEM 2FA =====
    logger.info(`✅ Login bem-sucedido para usuário ${user.email} (${user.role})`);

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

    res.cookie('auth_token', authToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: parseJwtExpiration(jwtExpiracao) * 1000
    });

    const redirectTo = user.forcePasswordChange
      ? '/trocar-senha.html'
      : obterDestinoPorPerfil(user.role);

    res.json({
      success: true,
      token: authToken,
      requiresTwoFactor: false,
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
    logger.error('❌ Erro no login:', error);
    res.status(500).json({
      success: false,
      error: 'Erro no servidor: ' + error.message
    });
  }
});

// ============================================================================
// POST /api/auth/logout
// ============================================================================
// ============================================================================
// POST /api/auth/logout — Marca usuário como OFFLINE e registra logout explícito
// ============================================================================
router.post('/auth/logout', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if (decoded.id) {
          const agora = new Date();
          
          // 🔥 REGISTRAR LOGOUT EXPLÍCITO
          // - ultimoLogout: marca a hora exata do logout (usado para calcular duração)
          // - lastActive: mantém como referência (não zerar, senão perde o histórico)
          await User.findByIdAndUpdate(decoded.id, {
            ultimoLogout: agora,
            lastActive: agora
          });
          
          logger.info(`🚪 Logout explícito registrado para usuário ${decoded.id} às ${agora.toISOString()}`);
        }
      } catch (jwtError) {
        logger.info('⚠️ Logout com token inválido (ignorando)');
      }
    }

    res.clearCookie('auth_token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    });

    res.json({ success: true, message: 'Logout realizado com sucesso' });

  } catch (error) {
    logger.error('❌ Erro no logout:', error);
    res.clearCookie('auth_token');
    res.json({ success: true, message: 'Logout realizado' });
  }
});

// ============================================================================
// POST /api/auth/2fa/enable - Ativar 2FA (envia SMS)
// ============================================================================
router.post('/auth/2fa/enable', authenticateTokenLocal, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('+twoFactorSecret +twoFactorEnabled +twoFactorTempSecret +telefone +nome');

    if (user.twoFactorEnabled) {
      return res.status(400).json({ success: false, error: '2FA já está ativado para esta conta' });
    }

    if (!user.telefone) {
      return res.status(400).json({ success: false, error: 'Você precisa cadastrar um telefone primeiro' });
    }

    const codigo = Math.floor(100000 + Math.random() * 900000).toString();

    user.twoFactorTempSecret = codigo;
    user.lastOtpRequest = new Date();
    user.otpRequestCount = (user.otpRequestCount || 0) + 1;
    await user.save();

    const telefoneLimpo = user.telefone.replace(/\D/g, '');
    const mensagem = `🔐 ${user.nome}, seu código de verificação do EducaPleno é: ${codigo}. Válido por 5 minutos.`;

    logger.info('📱 Tentando enviar SMS...');
    logger.info(`   Para: ${telefoneLimpo}`);
    logger.info(`   Código: ${codigo}`);

    const resultado = await enviarSmsTwilio(telefoneLimpo, mensagem);

    if (resultado.success) {
      return res.json({
        success: true,
        message: resultado.devMode ? 'Código gerado (modo desenvolvimento)' : 'Código enviado para seu telefone',
        expiresIn: 300,
        telefone: user.telefone,
        ...(resultado.devMode && { devCode: resultado.codigo })
      });
    } else {
      return res.status(500).json({ success: false, error: 'Erro ao enviar SMS. Tente novamente.' });
    }

  } catch (error) {
    logger.error('❌ Erro ao ativar 2FA:', error);
    return res.status(500).json({ success: false, error: 'Erro interno: ' + error.message });
  }
});

// ============================================================================
// POST /api/auth/2fa/verify - Verificar código SMS e ativar 2FA
// ============================================================================
router.post('/auth/2fa/verify', authenticateTokenLocal, async (req, res) => {
  try {
    const { codigo } = req.body;

    if (!codigo || codigo.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Código inválido. Digite um código de 6 dígitos.'
      });
    }

    const user = await User.findById(req.userId).select(
      '+twoFactorTempSecret +lastOtpRequest +otpRequestCount +twoFactorEnabled +twoFactorSecret +twoFactorBackupCodes +telefone +nome'
    );

    if (!user) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    }

    if (user.twoFactorEnabled) {
      return res.status(400).json({ success: false, error: '2FA já está ativado para esta conta' });
    }

    if (!user.twoFactorTempSecret) {
      return res.status(400).json({ success: false, error: 'Nenhum código ativo. Solicite um novo código.' });
    }

    const agora = new Date();
    const diffMinutos = (agora - user.lastOtpRequest) / 60000;

    if (diffMinutos > 5) {
      user.twoFactorTempSecret = null;
      user.lastOtpRequest = null;
      await user.save();
      return res.status(400).json({ success: false, error: 'Código expirado. Solicite um novo código.' });
    }

    if (user.twoFactorTempSecret !== codigo) {
      user.otpRequestCount = (user.otpRequestCount || 0) + 1;
      await user.save();
      return res.status(400).json({ success: false, error: 'Código inválido. Tente novamente.' });
    }

    const backupCodes = [];
    for (let i = 0; i < 10; i++) backupCodes.push(gerarBackupCode());

    user.twoFactorEnabled = true;
    user.twoFactorSecret = codigo;
    user.twoFactorBackupCodes = backupCodes;
    user.twoFactorTempSecret = null;
    user.telefoneVerificado = true;
    user.dataAtivacao2FA = new Date();

    await user.save();

    logger.info(`✅ 2FA ativado para usuário ${user.email}`);

    res.json({
      success: true,
      message: '✅ Autenticação de dois fatores ativada com sucesso!',
      backupCodes,
      total: 10,
      firstTime: true,
      telefone: user.telefone
    });

  } catch (error) {
    logger.error('❌ Erro ao verificar 2FA:', error);
    res.status(500).json({ success: false, error: 'Erro interno ao ativar 2FA: ' + error.message });
  }
});

// ============================================================================
// POST /api/auth/2fa/resend - Reenviar código SMS
// ============================================================================
router.post('/auth/2fa/resend', authenticateTokenLocal, async (req, res) => {
  try {
    const { userId } = req.body;
    const usuarioId = userId || req.userId;

    logger.info(`📱 Reenviando código 2FA para usuário ${usuarioId}`);

    const user = await User.findById(usuarioId).select('+twoFactorTempSecret +telefone +nome +role');

    if (!user) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    }

    let exigir2FA = false;
    if (Config) {
      const config2FA = await Config.findOne({ chave: 'seguranca.doisFatores' });
      exigir2FA = config2FA ? config2FA.valor : false;
    }

    const perfisCom2FA = ['super_admin'];
    if (exigir2FA) perfisCom2FA.push('admin', 'professor');

    if (!perfisCom2FA.includes(user.role)) {
      return res.status(400).json({
        success: false,
        error: '2FA não é exigido para este perfil de usuário'
      });
    }

    if (!user.telefone) {
      return res.status(400).json({ success: false, error: 'Telefone não cadastrado' });
    }

    const codigo = Math.floor(100000 + Math.random() * 900000).toString();

    user.twoFactorTempSecret = codigo;
    user.lastOtpRequest = new Date();
    user.otpRequestCount = (user.otpRequestCount || 0) + 1;
    await user.save();

    const telefoneLimpo = user.telefone.replace(/\D/g, '');
    const mensagem = `🔐 ${user.nome}, seu código de verificação do EDUCAPLENO é: ${codigo}. Válido por 5 minutos.`;

    logger.info('📱 Enviando SMS...');
    logger.info(`   Para: ${telefoneLimpo}`);
    logger.info(`   Código: ${codigo}`);

    const resultado = await enviarSmsTwilio(telefoneLimpo, mensagem);

    if (resultado.success) {
      return res.json({
        success: true,
        message: resultado.devMode ? 'Código gerado (modo desenvolvimento)' : 'Novo código enviado para seu telefone',
        expiresIn: 300,
        ...(resultado.devMode && { devCode: resultado.codigo })
      });
    } else {
      return res.status(500).json({ success: false, error: 'Erro ao enviar SMS. Tente novamente.' });
    }

  } catch (error) {
    logger.error('❌ Erro ao reenviar código:', error);
    return res.status(500).json({ success: false, error: 'Erro interno: ' + error.message });
  }
});

// ============================================================================
// POST /api/auth/2fa/generate-qr - Gerar QR Code
// ============================================================================
router.post('/auth/2fa/generate-qr', authenticateTokenLocal, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('+twoFactorTempSecret +email');

    if (!user) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    }

    const generated = speakeasy.generateSecret({
      name: `EducaPleno:${user.email}`,
      issuer: 'EducaPleno'
    });

    const novoSegredo = generated.base32;

    user.twoFactorTempSecret = novoSegredo;
    await user.save();

    logger.info(`✅ NOVO QR CODE gerado para ${user.email}: ${novoSegredo.substring(0, 10)}...`);

    const otpauth = speakeasy.otpauthURL({
      secret: novoSegredo,
      label: user.email,
      issuer: 'EducaPleno',
      encoding: 'base32'
    });

    const qrCodeUrl = await QRCode.toDataURL(otpauth);

    res.json({
      success: true,
      qrCode: qrCodeUrl,
      secret: novoSegredo,
      message: '✅ QR Code gerado - válido apenas para esta sessão'
    });

  } catch (error) {
    logger.error('❌ Erro ao gerar QR Code:', error);
    res.status(500).json({ success: false, error: 'Erro ao gerar QR Code: ' + error.message });
  }
});

// ============================================================================
// POST /api/auth/2fa/verify-totp - Verificar código TOTP (QR Code)
// ============================================================================
router.post('/auth/2fa/verify-totp', authenticateTokenLocal, async (req, res) => {
  try {
    const { codigo } = req.body;
    const user = await User.findById(req.userId).select('+twoFactorTempSecret +twoFactorEnabled');

    if (!user) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    }

    if (!user.twoFactorTempSecret) {
      return res.status(400).json({
        success: false,
        error: 'Nenhum QR Code ativo. Gere um novo QR Code primeiro.'
      });
    }

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorTempSecret,
      encoding: 'base32',
      token: codigo,
      window: 1
    });

    if (!verified) {
      return res.status(401).json({ success: false, error: 'Código TOTP inválido' });
    }

    if (!user.twoFactorEnabled) {
      const backupCodes = [];
      for (let i = 0; i < 10; i++) backupCodes.push(gerarBackupCode());

      user.twoFactorEnabled = true;
      user.twoFactorSecret = user.twoFactorTempSecret;
      user.twoFactorBackupCodes = backupCodes;
      user.twoFactorTempSecret = null;
      user.dataAtivacao2FA = new Date();

      await user.save();

      return res.json({
        success: true,
        message: '✅ 2FA ativado com sucesso!',
        backupCodes,
        firstTime: true
      });
    }

    user.twoFactorTempSecret = null;
    await user.save();

    res.json({ success: true, message: '✅ Código válido!' });

  } catch (error) {
    logger.error('❌ Erro:', error);
    res.status(500).json({ success: false, error: 'Erro interno: ' + error.message });
  }
});

// ============================================================================
// POST /api/auth/2fa/validate-totp - Validar login TOTP
// ============================================================================
router.post('/auth/2fa/validate-totp', authenticateTokenLocal, async (req, res) => {
  try {
    const { codigo } = req.body;
    const user = await User.findById(req.userId).select('+twoFactorSecret +twoFactorEnabled +twoFactorBackupCodes +tokenVersion');

    if (!user || !user.twoFactorEnabled) {
      return res.status(401).json({ success: false, error: '2FA não está ativado para esta conta' });
    }

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: codigo,
      window: 1
    });

    if (!verified) {
      return res.status(401).json({ success: false, error: 'Código TOTP inválido' });
    }

    // 🔥 ATUALIZAR lastActive e lastLogin após validação TOTP
    user.lastActive = new Date();
    user.lastLogin = new Date();
    user.ultimoLogout = null;
    await user.save();

    const jwtExpiracao = await obterJwtExpiracao();

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

    res.json({
      success: true,
      token: authToken,
      user: {
        id: user._id,
        nome: user.nome,
        email: user.email,
        role: user.role,
        twoFactorEnabled: user.twoFactorEnabled
      },
      redirectTo
    });

  } catch (error) {
    logger.error('❌ Erro ao validar TOTP:', error);
    res.status(500).json({ success: false, error: 'Erro interno: ' + error.message });
  }
});

// ============================================================================
// GET /api/auth/2fa/status
// ============================================================================
router.get('/auth/2fa/status', authenticateTokenLocal, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('+twoFactorEnabled +twoFactorTempSecret');

    res.json({
      success: true,
      twoFactorEnabled: user?.twoFactorEnabled || false,
      hasTempCode: !!(user?.twoFactorTempSecret),
      isTempToken: req.tokenTemp || false
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// GET /api/auth/2fa/backup-codes
// ============================================================================
router.get('/auth/2fa/backup-codes', authenticateTokenLocal, async (req, res) => {
  try {
    logger.info('🔍 Buscando códigos de backup para:', req.userId, 'temp:', req.tokenTemp);

    const user = await User.findById(req.userId).select(
      '+twoFactorEnabled +twoFactorBackupCodes +twoFactorBackupCodesShown'
    );

    if (!user) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    }

    // CASO 1: Token TEMPORÁRIO (2FA) → sempre retornar
    if (req.tokenTemp === true) {
      if (!user.twoFactorBackupCodes || user.twoFactorBackupCodes.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Você não tem códigos de backup. Contate o administrador.',
          needsAdmin: true
        });
      }

      if (user.twoFactorBackupCodesShown !== true) {
        user.twoFactorBackupCodesShown = true;
        await user.save();

        return res.json({
          success: true,
          backupCodes: user.twoFactorBackupCodes,
          firstTime: true,
          total: user.twoFactorBackupCodes.length,
          message: '🔐 Primeira ativação! Guarde estes códigos!'
        });
      }

      return res.json({
        success: true,
        backupCodes: [],
        alreadyShown: true,
        total: user.twoFactorBackupCodes.length,
        message: 'Códigos já foram exibidos anteriormente'
      });
    }

    // CASO 2: Token NORMAL
    if (!user.twoFactorEnabled) {
      return res.status(400).json({ success: false, error: '2FA não está ativado para esta conta' });
    }

    if (!user.twoFactorBackupCodes || user.twoFactorBackupCodes.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Você não tem códigos de backup. Contate o administrador.',
        needsAdmin: true
      });
    }

    if (user.twoFactorBackupCodesShown === true) {
      return res.json({
        success: true,
        backupCodes: [],
        alreadyShown: true,
        total: user.twoFactorBackupCodes.length,
        message: 'Códigos já foram exibidos anteriormente'
      });
    }

    user.twoFactorBackupCodesShown = true;
    await user.save();

    return res.json({
      success: true,
      backupCodes: user.twoFactorBackupCodes,
      firstTime: true,
      total: user.twoFactorBackupCodes.length,
      message: '🔐 Primeira ativação! Guarde estes códigos!'
    });

  } catch (error) {
    logger.error('❌ Erro ao buscar códigos de backup:', error);
    res.status(500).json({ success: false, error: 'Erro interno: ' + error.message });
  }
});

// ============================================================================
// POST /api/backup/solicitar - Solicitar novos códigos de backup
// ============================================================================
router.post('/backup/solicitar', authenticateTokenLocal, async (req, res) => {
  try {
    const usuarioId = req.userId;

    const usuario = await User.findById(usuarioId).select('nome email role');

    if (!usuario) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    }

    logger.info(`📨 Usuário ${usuario.nome} (${usuario.email}) solicitou novos códigos de backup`);

    const admins = await User.find({ role: { $in: ['admin', 'super_admin'] } }).select('_id');

    if (admins.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Nenhum administrador encontrado para notificar'
      });
    }

    const notificacoes = [];
    let pushAtivado = false;

    if (Config) {
      const configDoc = await Config.findOne({ chave: 'notificacoes' });
      pushAtivado = configDoc?.valor?.push === true;
    }

    for (const admin of admins) {
      try {
        if (Notificacao) {
          const notificacao = new Notificacao({
            usuarioId: admin._id,
            tipo: 'sistema',
            titulo: '🆕 Solicitação de novos códigos de backup',
            mensagem: `${usuario.nome} (${usuario.role}) está sem códigos de backup e solicita novos.`,
            icone: '🔑',
            cor: '#f59e0b',
            link: `/admin.html?section=usuarios&userId=${usuarioId}`,
            prioridade: 4,
            dados: {
              solicitanteId: usuarioId,
              solicitanteNome: usuario.nome,
              solicitanteEmail: usuario.email,
              solicitanteRole: usuario.role,
              tipoSolicitacao: 'backup_codes',
              dataSolicitacao: new Date().toISOString()
            }
          });

          await notificacao.save();
          notificacoes.push(notificacao);
          logger.info(`✅ Notificação criada para admin ${admin._id}`);

          if (pushAtivado) {
            try {
              const OneSignalService = require('../services/onesignal-service');
              const oneSignal = new OneSignalService();
              await oneSignal.enviarPush(
                admin._id,
                '🆕 Solicitação de Backup',
                `${usuario.nome} solicitou novos códigos de backup`,
                {
                  tipo: 'solicitacao_backup',
                  solicitanteId: usuarioId,
                  solicitanteNome: usuario.nome
                }
              );
            } catch (pushErr) {
              logger.warn('⚠️ Erro ao enviar push:', pushErr.message);
            }
          }
        }
      } catch (error) {
        logger.error(`❌ Erro ao notificar admin ${admin._id}:`, error.message);
      }
    }

    res.json({
      success: true,
      message: 'Solicitação enviada aos administradores',
      notificacoesEnviadas: notificacoes.length,
      totalAdmins: admins.length
    });

  } catch (error) {
    logger.error('❌ Erro ao solicitar backup:', error);
    res.status(500).json({ success: false, error: 'Erro interno: ' + error.message });
  }
});

// ============================================================================
// POST /api/auth/reset-password/request
// ============================================================================
router.post('/auth/reset-password/request', async (req, res) => {
  try {
    const { identifier } = req.body;

    if (!identifier) {
      return res.status(400).json({ success: false, error: 'Email ou CPF é obrigatório' });
    }

    logger.info('\n📨 ===== NOVA SOLICITAÇÃO DE RECUPERAÇÃO =====');
    logger.info('📧 Identificador recebido:', identifier);
    logger.info('🕒 Hora:', new Date().toLocaleString('pt-BR'));
    logger.info('🌐 IP:', req.ip);
    logger.info('==============================================\n');

    let user;

    if (identifier.includes('@')) {
      user = await User.findOne({ email: identifier.toLowerCase() });
    } else {
      const cpfNumeros = identifier.replace(/\D/g, '');
      user = await User.findOne({ cpf: cpfNumeros });
    }

    if (!user) {
      logger.info('⚠️  Usuário não encontrado (retornando sucesso por segurança)');
      return res.json({
        success: true,
        message: 'Se o email/CPF estiver cadastrado, você receberá um código de recuperação'
      });
    }

    logger.info('🎯 Usuário encontrado:', user.email);

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const token = jwt.sign(
      {
        userId: user._id,
        code: code,
        type: 'password_reset',
        timestamp: Date.now()
      },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    logger.info('🔐 Código gerado:', code);

    resetCodes.set(user._id.toString(), {
      code: code,
      expiresAt: Date.now() + (15 * 60 * 1000),
      token: token,
      attempts: 0,
      maxAttempts: 5
    });

    cleanupExpiredCodes();

    let emailSent = false;
    try {
      if (EmailService) {
        const emailService = new EmailService();
        await emailService.init();

        const emailResult = await emailService.sendPasswordResetEmail(
          user.email,
          user.nome,
          code
        );

        emailSent = emailResult.success;
        logger.info('📧 Email enviado:', emailSent ? '✅' : '❌');
      }
    } catch (emailError) {
      logger.error('⚠️ Erro ao enviar email:', emailError.message);
    }

    const response = {
      success: true,
      message: 'Código de recuperação enviado para seu email!',
      data: {
        email: user.email,
        expiresIn: 900,
        token: token
      },
      emailSent
    };

    if (process.env.NODE_ENV !== 'production' || !emailSent) {
      logger.info('\n🔓 [MODO DEV/TESTE] Código:', code);

      if (process.env.NODE_ENV !== 'production') {
        response.devMode = true;
        response.devCode = code;
        response.message = 'Modo desenvolvimento: Use o código abaixo';
      }
    }

    res.json(response);

  } catch (error) {
    logger.error('🔥 ERRO NA RECUPERAÇÃO:', error.message);
    res.status(500).json({ success: false, error: 'Erro ao processar solicitação de recuperação' });
  }
});

// ============================================================================
// POST /api/auth/reset-password/verify
// ============================================================================
router.post('/auth/reset-password/verify', async (req, res) => {
  try {
    const { identifier, code, token } = req.body;

    if (!identifier || !code) {
      return res.status(400).json({ success: false, error: 'Código de verificação é obrigatório' });
    }

    logger.info('🔍 VERIFICAÇÃO DE CÓDIGO para:', identifier);

    let user;

    if (identifier.includes('@')) {
      user = await User.findOne({ email: identifier.toLowerCase() });
    } else {
      const cpfNumeros = identifier.replace(/\D/g, '');
      user = await User.findOne({ cpf: cpfNumeros });
    }

    if (!user) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    }

    const resetData = resetCodes.get(user._id.toString());

    if (!resetData) {
      return res.status(400).json({
        success: false,
        error: 'Código não encontrado. Solicite um novo código.'
      });
    }

    if (resetData.attempts >= resetData.maxAttempts) {
      resetCodes.delete(user._id.toString());
      return res.status(429).json({
        success: false,
        error: 'Muitas tentativas. Solicite um novo código.'
      });
    }

    if (resetData.expiresAt < Date.now()) {
      resetCodes.delete(user._id.toString());
      return res.status(400).json({
        success: false,
        error: 'Código expirado. Solicite um novo código.'
      });
    }

    if (resetData.code !== code) {
      resetData.attempts += 1;
      resetCodes.set(user._id.toString(), resetData);
      const attemptsLeft = resetData.maxAttempts - resetData.attempts;
      return res.status(400).json({
        success: false,
        error: `Código inválido. ${attemptsLeft} tentativa(s) restante(s).`,
        attemptsLeft
      });
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.userId !== user._id.toString() || decoded.code !== code) {
          return res.status(400).json({ success: false, error: 'Token inválido' });
        }
      } catch (jwtError) {
        return res.status(400).json({ success: false, error: 'Token inválido ou expirado' });
      }
    }

    const resetToken = jwt.sign(
      {
        userId: user._id,
        verified: true,
        codeVerified: true,
        type: 'password_reset_confirmation',
        timestamp: Date.now()
      },
      process.env.JWT_SECRET,
      { expiresIn: '30m' }
    );

    resetCodes.delete(user._id.toString());

    res.json({
      success: true,
      message: 'Código verificado com sucesso!',
      data: {
        token: resetToken,
        userId: user._id,
        email: user.email
      }
    });

  } catch (error) {
    logger.error('🔥 ERRO NA VERIFICAÇÃO:', error.message);
    res.status(500).json({ success: false, error: 'Erro ao verificar código' });
  }
});

// ============================================================================
// POST /api/auth/reset-password/confirm
// ============================================================================
router.post('/auth/reset-password/confirm', async (req, res) => {
  try {
    const { identifier, newPassword, token } = req.body;

    if (!identifier || !newPassword) {
      return res.status(400).json({ success: false, error: 'Nova senha é obrigatória' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, error: 'A senha deve ter no mínimo 6 caracteres' });
    }

    logger.info('🔄 REDEFINIÇÃO DE SENHA para:', identifier);

    let user;

    if (identifier.includes('@')) {
      user = await User.findOne({ email: identifier.toLowerCase() });
    } else {
      const cpfNumeros = identifier.replace(/\D/g, '');
      user = await User.findOne({ cpf: cpfNumeros });
    }

    if (!user) {
      return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.userId !== user._id.toString()) {
          return res.status(400).json({ success: false, error: 'Token inválido' });
        }
        if (!decoded.codeVerified) {
          return res.status(400).json({ success: false, error: 'Código não verificado' });
        }
      } catch (jwtError) {
        return res.status(400).json({ success: false, error: 'Token inválido ou expirado' });
      }
    }

    const isSamePassword = await user.comparePassword(newPassword);
    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        error: 'A nova senha não pode ser igual à senha atual'
      });
    }

    user.password = newPassword;
    user.passwordChangedAt = new Date();
    await user.save();

    logger.info(`✅ Senha atualizada para ${user.email}`);

    try {
      if (EmailService) {
        const emailService = new EmailService();
        await emailService.init();
        await emailService.sendPasswordChangedEmail(user.email, user.nome);
        logger.info('📧 Email de confirmação enviado');
      }
    } catch (emailError) {
      logger.error('⚠️ Erro ao enviar email:', emailError.message);
    }

    res.json({
      success: true,
      message: 'Senha redefinida com sucesso!',
      data: {
        userId: user._id,
        email: user.email,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('🔥 ERRO AO REDEFINIR SENHA:', error.message);
    res.status(500).json({ success: false, error: 'Erro ao redefinir senha' });
  }
});

// ============================================================================
// LOGIN SOCIAL - Google / Microsoft
// POST /api/login-social/:provider
// ============================================================================
router.post('/login-social/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    const { idToken, accessToken } = req.body;

    if (!['google', 'microsoft'].includes(provider)) {
      return res.status(400).json({
        success: false,
        error: 'Provider inválido. Use: google ou microsoft'
      });
    }

    if (!idToken && !accessToken) {
      return res.status(400).json({
        success: false,
        error: 'Token de autenticação não fornecido'
      });
    }

    let email = null;
    let nome = null;
    let picture = null;

    // ============================================================
    // VALIDAR GOOGLE
    // ============================================================
    if (provider === 'google') {
      try {
        const { OAuth2Client } = require('google-auth-library');
        const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

        if (idToken) {
          const ticket = await client.verifyIdToken({
            idToken,
            audience: process.env.GOOGLE_CLIENT_ID
          });
          const payload = ticket.getPayload();
          email = payload.email;
          nome = payload.name;
          picture = payload.picture;
        } else {
          const axios = require('axios');
          const userinfo = await axios.get(
            'https://www.googleapis.com/oauth2/v3/userinfo',
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          email = userinfo.data.email;
          nome = userinfo.data.name;
          picture = userinfo.data.picture;
        }
      } catch (err) {
        console.error('❌ Erro ao validar token Google:', err.message);
        return res.status(401).json({
          success: false,
          error: 'Token Google inválido ou expirado'
        });
      }
    }

    // ============================================================
    // VALIDAR MICROSOFT
    // ============================================================
    if (provider === 'microsoft') {
      try {
        const jwtDecode = require('jwt-decode');
        const decoded = jwtDecode(idToken);

        email = decoded.email || decoded.preferred_username || decoded.upn;
        nome = decoded.name || (email ? email.split('@')[0] : null);
        picture = null;

        if (!email) {
          return res.status(400).json({
            success: false,
            error: 'Email não retornado pelo Microsoft'
          });
        }
      } catch (err) {
        console.error('❌ Erro ao decodificar token Microsoft:', err.message);
        return res.status(401).json({
          success: false,
          error: 'Token Microsoft inválido'
        });
      }
    }

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Não foi possível obter o email do provedor'
      });
    }

    const emailLower = email.toLowerCase().trim();

    // ============================================================
    // VERIFICAR EMAIL INSTITUCIONAL
    // ============================================================
    if (!emailLower.endsWith(DOMINIO_INSTITUCIONAL)) {
      console.log(`🚫 Login social bloqueado: ${emailLower} não é institucional (${provider})`);

      return res.status(403).json({
        success: false,
        error: `Apenas emails institucionais (${DOMINIO_INSTITUCIONAL}) são permitidos. Use sua conta institucional do Google/Microsoft.`,
        codigo: 'EMAIL_NAO_INSTITUCIONAL',
        email: emailLower
      });
    }

    // ============================================================
    // BUSCAR USUÁRIO
    // ============================================================
    const user = await User.findOne({ email: emailLower })
      .select('+ativo +twoFactorEnabled +twoFactorSecret +twoFactorBackupCodes +twoFactorBackupCodesShown +forcePasswordChange +nome +email +role +telefone +tokenVersion +onesignalPlayerId +fotoPerfil');

    // ---------- CASO 1: NÃO CADASTRADO ----------
    if (!user) {
      console.log(`📝 Login social: email ${emailLower} não cadastrado (${provider})`);
      return res.json({
        success: false,
        precisaCadastrar: true,
        email: emailLower,
        nome,
        picture,
        provider
      });
    }

    // ---------- CASO 2: INATIVO ----------
    if (!user.ativo) {
      return res.status(401).json({
        success: false,
        error: 'Usuário inativo. Entre em contato com a administração.'
      });
    }

    // ---------- CASO 3: LOGIN OK ----------
    user.lastLogin = new Date();
    user.ultimoLogout = null;
    user.lastActive = new Date();  // 🔥 ATUALIZAR ATIVIDADE
    if (picture && !user.fotoPerfil) {
      user.fotoPerfil = picture;
      user.fotoPerfilTipo = 'url';
    }
    await user.save();

    // ============================================================
    // VERIFICAR SE O PERFIL EXIGE 2FA
    // ============================================================
    let exige2FA = false;

    if (user.role === 'super_admin') {
      exige2FA = true;
      console.log(`🔐 2FA OBRIGATÓRIO para super_admin ${user.email} via login social (${provider})`);
    } else {
      exige2FA = false;
      console.log(`✅ 2FA dispensado para ${user.role} ${user.email} (login social)`);
    }

    if (exige2FA) {
      if (!user.twoFactorBackupCodes || user.twoFactorBackupCodes.length === 0) {
        const backupCodes = [];
        for (let i = 0; i < 10; i++) backupCodes.push(gerarBackupCode());
        user.twoFactorBackupCodes = backupCodes;
        user.twoFactorBackupCodesShown = false;
        await user.save();
        console.log(`   ✅ 10 códigos de backup gerados para ${user.email}`);
      }

      const tempAuthToken = jwt.sign(
        {
          id: user._id,
          temp: true,
          purpose: '2fa',
          role: user.role,
          nome: user.nome,
          social: provider
        },
        process.env.JWT_SECRET,
        { expiresIn: '10m' }
      );

      return res.json({
        success: true,
        requiresTwoFactor: true,
        userId: user._id,
        token: tempAuthToken,
        message: '2FA necessário',
        social: provider,
        motivo2FA: 'perfil_obrigatorio',
        user: {
          id: user._id,
          nome: user.nome,
          email: user.email,
          role: user.role,
          twoFactorEnabled: user.twoFactorEnabled,
          telefone: user.telefone
        }
      });
    }

    // ============================================================
    // SEM 2FA → TOKEN FINAL
    // ============================================================
    const jwtExpiracao = await obterJwtExpiracao();

    const authToken = jwt.sign(
      {
        id: user._id,
        role: user.role,
        nome: user.nome,
        twoFactorEnabled: user.twoFactorEnabled,
        tokenVersion: user.tokenVersion || 0,
        social: provider
      },
      process.env.JWT_SECRET,
      { expiresIn: jwtExpiracao }
    );

    const redirectTo = user.forcePasswordChange
      ? '/trocar-senha.html'
      : obterDestinoPorPerfil(user.role);

    console.log(`✅ Login social OK: ${user.email} (${provider})`);

    return res.json({
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
      redirectTo,
      social: provider
    });

  } catch (error) {
    console.error('❌ Erro no login social:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao processar login social: ' + error.message
    });
  }
});

// ============================================================================
// CLEANUP - Limpeza de códigos expirados
// ============================================================================
function cleanupExpiredCodes() {
  const now = Date.now();
  let cleaned = 0;

  for (const [userId, data] of resetCodes.entries()) {
    if (data.expiresAt < now) {
      resetCodes.delete(userId);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    logger.info(`🧹 Limpeza: ${cleaned} códigos expirados removidos`);
  }
}

// Executar limpeza a cada 30 minutos
setInterval(cleanupExpiredCodes, 30 * 60 * 1000);

module.exports = router;