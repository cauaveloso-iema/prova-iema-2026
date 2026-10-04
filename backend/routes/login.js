// ============================================================================
// LOGIN SOCIAL - EducaPleno (Google / Microsoft)
// ============================================================================
// Descrição: Autenticação via OAuth (Google e Microsoft).
//            Regras de 2FA:
//              - Super Admin → SEMPRE exige 2FA (fixo, mesmo via Google)
//              - Admin, Professor, etc. → só exige se `seguranca.doisFatores = true`
//                E NÃO estiver vindo do login social (Google/Microsoft já validou)
//              - Aluno → nunca exige 2FA
//            Valida email institucional (@iemasaoluiscentro.net)
//            Se cadastrado → faz login · Se não → redireciona para cadastro
// Autor: Equipe de Desenvolvimento
// Padrão: Segue o modelo de biblioteca.js
// ============================================================================

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// 🔥 Importação protegida do Config (não derruba o server se não existir)
let Config = null;
try {
  Config = require('../models/Config');
  console.log('✅ [login-social] Model Config carregado');
} catch (err) {
  console.warn('⚠️ [login-social] Config não disponível:', err.message);
}

// ============================================
// CONSTANTES
// ============================================
const DOMINIO_INSTITUCIONAL = '@iemasaoluiscentro.net';

// ============================================
// HELPERS
// ============================================
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
    console.warn('⚠️ [login-social] Erro ao buscar JWT expiração:', err.message);
  }
  return padrao;
}

async function obterConfig2FAGlobal() {
  if (!Config) return false;

  try {
    const config2FA = await Config.findOne({ chave: 'seguranca.doisFatores' });
    return config2FA ? config2FA.valor === true : false;
  } catch (err) {
    console.warn('⚠️ [login-social] Erro ao buscar config 2FA:', err.message);
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

// ============================================
// HEALTH CHECK
// ============================================
router.get('/health', (req, res) => {
  res.json({ success: true, status: 'online', service: 'Login Social' });
});

// ============================================
// POST /api/login-social/:provider
// Provider: google | microsoft
// Body: { idToken, accessToken }
// ============================================
router.post('/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    const { idToken, accessToken } = req.body;

    // -------- VALIDAÇÃO BÁSICA --------
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
    // 🔥 VERIFICAR SE É EMAIL INSTITUCIONAL
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
    // BUSCAR USUÁRIO NO BANCO
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
    if (picture && !user.fotoPerfil) {
      user.fotoPerfil = picture;
      user.fotoPerfilTipo = 'url';
    }
    await user.save();

    // ============================================================
    // 🔥 VERIFICAR SE O PERFIL EXIGE 2FA
    // ============================================================
    // Regras:
    //   🅰️ super_admin → SEMPRE exige 2FA (fixo, mesmo via Google)
    //   🅱️ admin, professor, setor_pedagogico, etc. → só exige se
    //       a config global `seguranca.doisFatores` estiver ativa.
    //       E no login social (Google/Microsoft), esses perfis NÃO
    //       exigem 2FA (o Google já validou a identidade).
    //   Aluno → nunca exige
    // ============================================================

    let exige2FA = false;

    if (user.role === 'super_admin') {
      // 🅰️ Super Admin sempre exige
      exige2FA = true;
      console.log(`🔐 2FA OBRIGATÓRIO para super_admin ${user.email} via login social (${provider})`);
    } else {
      // 🅱️ Outros perfis → verificar config global
      const exigir2FAGlobal = await obterConfig2FAGlobal();

      // Login social dispensa 2FA para perfis operacionais
      // (o Google/Microsoft já validou a identidade)
      exige2FA = false;
      console.log(`✅ 2FA dispensado para ${user.role} ${user.email} (login social - Google validou)`);
    }

    // Se exige 2FA, retorna token temporário
    if (exige2FA) {
      // Garantir que o usuário tenha códigos de backup
      if (!user.twoFactorBackupCodes || user.twoFactorBackupCodes.length === 0) {
        const backupCodes = [];
        for (let i = 0; i < 10; i++) {
          backupCodes.push(gerarBackupCode());
        }
        user.twoFactorBackupCodes = backupCodes;
        user.twoFactorBackupCodesShown = false;
        await user.save();
        console.log(`   ✅ 10 códigos de backup gerados para ${user.email}`);
      }

      // Gerar token TEMPORÁRIO para 2FA (10 minutos)
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
    // SEM 2FA → GERA TOKEN FINAL
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

    console.log(`✅ Login social OK: ${user.email} (${provider}) - 2FA dispensado`);

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

module.exports = router;