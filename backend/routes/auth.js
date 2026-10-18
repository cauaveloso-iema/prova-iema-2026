// routes/auth.js
// ============================================================
// ROTAS DE AUTENTICAÇÃO — CADASTRO
// ============================================================
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const logger = require('../utils/logger');

// ============================================================
// POST /api/auth/register
// ============================================================
router.post('/register', async (req, res) => {
  try {
    const {
      nome, cpf, telefone, email, password, role,
      curso, turma, periodo, matricula,
      precisaAcessibilidade, condicaoAcessibilidade, outraCondicao,
      eixo, departamento, titulacao,
      socialProvider, socialEmail, socialPicture,
      lgpdConsent, lgpdConsentAt
    } = req.body || {};

    // ---------- 1. Validações ----------
    if (!nome || !cpf || !telefone || !email) {
      return res.status(400).json({
        success: false,
        error: 'Preencha todos os campos obrigatórios (nome, cpf, telefone, email)'
      });
    }

    const emailNormalizado = String(email).toLowerCase().trim();
    if (!emailNormalizado.endsWith('@iemasaoluiscentro.net')) {
      return res.status(400).json({
        success: false,
        error: 'Apenas emails institucionais (@iemasaoluiscentro.net) são permitidos'
      });
    }

    if (lgpdConsent !== true) {
      return res.status(400).json({
        success: false,
        error: 'É necessário aceitar a Política de Privacidade (LGPD)'
      });
    }

    const isSocial = !!socialProvider;

    if (!isSocial && (!password || String(password).length < 6)) {
      return res.status(400).json({
        success: false,
        error: 'Senha deve ter no mínimo 6 caracteres'
      });
    }

    const cpfNumeros = String(cpf).replace(/\D/g, '');
    const telefoneNumeros = String(telefone).replace(/\D/g, '');

    if (cpfNumeros.length !== 11) {
      return res.status(400).json({ success: false, error: 'CPF inválido (deve ter 11 dígitos)' });
    }
    if (telefoneNumeros.length !== 10 && telefoneNumeros.length !== 11) {
      return res.status(400).json({ success: false, error: 'Telefone inválido (10 ou 11 dígitos com DDD)' });
    }

    const roleFinal = role || 'aluno';
    if (!['aluno', 'professor'].includes(roleFinal)) {
      return res.status(400).json({
        success: false,
        error: 'Tipo de conta inválido. Use "aluno" ou "professor".'
      });
    }

    // ---------- 2. Duplicatas ----------
    const existente = await User.findOne({
      $or: [{ email: emailNormalizado }, { cpf: cpfNumeros }]
    });

    if (existente) {
      if (existente.email === emailNormalizado) {
        return res.status(409).json({ success: false, error: 'Este email já está cadastrado' });
      }
      if (existente.cpf === cpfNumeros) {
        return res.status(409).json({ success: false, error: 'Este CPF já está cadastrado' });
      }
    }

    // ---------- 3. Montar dados ----------
    const dadosUsuario = {
      nome: String(nome).trim(),
      email: emailNormalizado,
      cpf: cpfNumeros,
      telefone: telefoneNumeros,
      role: roleFinal,
      ativo: true,
      dataCadastro: new Date(),
      lgpdConsent: true,
      lgpdConsentAt: lgpdConsentAt ? new Date(lgpdConsentAt) : new Date(),
      lgpdConsentIp:
        (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
        req.socket?.remoteAddress ||
        null
    };

    dadosUsuario.password = isSocial
      ? crypto.randomBytes(32).toString('hex')
      : password;

    if (roleFinal === 'aluno') {
      if (!curso) {
        return res.status(400).json({ success: false, error: 'Curso é obrigatório para aluno' });
      }
      if (!turma) {
        return res.status(400).json({ success: false, error: 'Turma é obrigatória para aluno' });
      }

      dadosUsuario.curso = curso;
      dadosUsuario.turma = turma;
      dadosUsuario.periodo = periodo || null;

      if (matricula && String(matricula).replace(/\D/g, '').length > 0) {
        dadosUsuario.matricula = String(matricula).replace(/\D/g, '').slice(0, 6);
      }

      dadosUsuario.precisaAcessibilidade = !!precisaAcessibilidade;

      if (precisaAcessibilidade) {
        dadosUsuario.condicaoAcessibilidade = condicaoAcessibilidade || null;
        dadosUsuario.outraCondicao = outraCondicao || null;
        dadosUsuario.dataSolicitacaoAcessibilidade = new Date();
      }
    } else {
      if (!eixo) {
        return res.status(400).json({ success: false, error: 'Eixo é obrigatório para professor' });
      }
      const matriculaNumeros = String(matricula || '').replace(/\D/g, '');
      if (matriculaNumeros.length !== 6) {
        return res.status(400).json({
          success: false,
          error: 'Matrícula de 6 dígitos é obrigatória para professor'
        });
      }

      dadosUsuario.eixo = eixo;
      dadosUsuario.matricula = matriculaNumeros;
      dadosUsuario.departamento = departamento || null;
      dadosUsuario.titulacao = titulacao || null;
    }

    // ---------- 4. Criar usuário ----------
    const user = new User(dadosUsuario);
    await user.save();

    logger.info(`✅ Novo cadastro: ${user.email} (${user.role})`);

    // ---------- 5. JWT ----------
    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
        email: user.email,
        nome: user.nome,
        tokenVersion: user.tokenVersion || 0
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    return res.status(201).json({
      success: true,
      message: 'Conta criada com sucesso',
      token,
      user: {
        id: user._id,
        nome: user.nome,
        email: user.email,
        role: user.role,
        curso: user.curso,
        turma: user.turma,
        eixo: user.eixo,
        matricula: user.matricula
      },
      redirectTo: user.role === 'aluno' ? '/capturar-face.html' : '/index.html'
    });

  } catch (error) {
    logger.error('❌ Erro no cadastro:', error);

    if (error.name === 'ValidationError') {
      const mensagens = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ success: false, error: mensagens.join(' | ') });
    }

    if (error.code === 11000) {
      const campo = Object.keys(error.keyPattern || error.keyValue || {})[0] || 'campo';
      return res.status(409).json({
        success: false,
        error: `Já existe um cadastro com este ${campo}`
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Erro interno ao criar conta. Tente novamente.'
    });
  }
});

module.exports = router;