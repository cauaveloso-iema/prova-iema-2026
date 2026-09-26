// routes/visitas-publico.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const axios = require('axios');

const User = require('../models/User');
const Turma = require('../models/Turma');
const TermoVisita = require('../models/TermoVisita');
const ConfiguracaoVisita = require('../models/ConfiguracaoVisita');
const NotificacaoVisita = require('../models/NotificacaoVisita');
const ConsentimentoLGPD = require('../models/ConsentimentoLGPD');

// 🔐 Criptografia explícita
const { encrypt, decrypt, hash, mascararCPF } = require('../utils/crypto-utils');

// ============================================
// RATE LIMITING
// ============================================
const tentativasPorIP = new Map();

function rateLimit(maxTentativas = 10, janelaMinutos = 5) {
  return (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const agora = Date.now();
    const janela = janelaMinutos * 60 * 1000;

    if (!tentativasPorIP.has(ip)) tentativasPorIP.set(ip, []);
    
    const tentativas = tentativasPorIP.get(ip).filter(t => agora - t < janela);
    tentativas.push(agora);
    tentativasPorIP.set(ip, tentativas);

    if (tentativas.length > maxTentativas) {
      return res.status(429).json({
        success: false,
        error: 'Muitas tentativas. Aguarde alguns minutos.'
      });
    }
    next();
  };
}

setInterval(() => {
  const agora = Date.now();
  const janela = 10 * 60 * 1000;
  for (const [ip, tentativas] of tentativasPorIP.entries()) {
    const validas = tentativas.filter(t => agora - t < janela);
    if (validas.length === 0) tentativasPorIP.delete(ip);
    else tentativasPorIP.set(ip, validas);
  }
}, 5 * 60 * 1000);

// ============================================
// HEALTH
// ============================================
router.get('/health', (req, res) => {
  res.json({ success: true, status: 'online', service: 'Visitas - Publico' });
});

// ============================================
// STATUS
// ============================================
router.get('/status', async (req, res) => {
  try {
    const config = await ConfiguracaoVisita.getConfig();
    const agora = new Date();
    let dentroDoPrazo = true;
    
    if (config.dataAbertura && config.dataFechamento) {
      dentroDoPrazo = agora >= config.dataAbertura && agora <= config.dataFechamento;
    }
    
    res.json({
      success: true,
      status: {
        visitasAbertas: config.visitasAbertas && dentroDoPrazo,
        avisoPublico: config.avisoPublico || ''
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// BUSCAR TURMAS (PÚBLICO)
// ============================================
router.get('/turmas', async (req, res) => {
  try {
    const config = await ConfiguracaoVisita.getConfig();
    
    if (!config.visitasAbertas) {
      return res.json({
        success: true,
        visitasAbertas: false,
        mensagem: 'As autorizações ainda não foram abertas.',
        turmas: []
      });
    }
    
    console.log('🔍 [PÚBLICO] Buscando turmas...');
    
    const turmas = await User.distinct('turma', {
      role: 'aluno',
      ativo: true,
      turma: { $nin: [null, '', 'Não informada'] }
    });
    
    let turmasDaCollection = [];
    try {
      const turmasColl = await Turma.find({ ativa: true }).select('nome').lean();
      turmasDaCollection = turmasColl.map(t => t.nome).filter(Boolean);
    } catch (e) {
      console.warn('⚠️ Erro ao buscar da collection Turma:', e.message);
    }
    
    const todasTurmas = [...new Set([...turmas, ...turmasDaCollection])].sort();
    
    console.log(`✅ [PÚBLICO] ${todasTurmas.length} turmas encontradas`);
    
    res.json({
      success: true,
      visitasAbertas: true,
      turmas: todasTurmas.map(nome => ({
        id: nome,
        nome: nome,
        disciplina: '',
        codigo: ''
      })),
      total: todasTurmas.length
    });
  } catch (error) {
    console.error('❌ Erro ao buscar turmas:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// BUSCAR CURSOS (PÚBLICO)
// ============================================
router.get('/cursos', async (req, res) => {
  try {
    const config = await ConfiguracaoVisita.getConfig();
    
    if (!config.visitasAbertas) {
      return res.json({ success: true, visitasAbertas: false, cursos: [] });
    }
    
    const cursos = await User.distinct('curso', {
      role: 'aluno',
      ativo: true,
      curso: { $nin: [null, '', 'Não informado'] }
    });
    
    res.json({ 
      success: true, 
      visitasAbertas: true, 
      cursos: cursos.sort() 
    });
  } catch (error) {
    console.error('❌ Erro ao buscar cursos:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// BUSCAR ALUNOS
// ============================================
router.get('/alunos', async (req, res) => {
  try {
    const { turma, curso, nome } = req.query;
    
    let query = { role: 'aluno', ativo: true };
    
    if (turma && turma.trim() !== '') query.turma = turma;
    if (curso && curso.trim() !== '') query.curso = curso;
    if (nome && nome.trim() !== '') {
      query.nome = { $regex: nome.trim(), $options: 'i' };
    }
    
    const alunos = await User.find(query)
      .select('nome matricula turma curso')
      .sort({ nome: 1 })
      .limit(100)
      .lean();
    
    res.json({
      success: true,
      alunos: alunos.map(a => ({
        id: a._id,
        nome: a.nome,
        matricula: a.matricula || '',
        turma: a.turma || '',
        curso: a.curso || ''
      })),
      total: alunos.length
    });
  } catch (error) {
    console.error('❌ Erro ao buscar alunos:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// BUSCAR TERMOS DO ALUNO
// ============================================
router.get('/termos/:alunoId', async (req, res) => {
  try {
    const { alunoId } = req.params;
    
    const termos = await TermoVisita.find({
      'alunos.alunoId': alunoId,
      status: { $in: ['pendente', 'parcialmente_autorizado'] },
      ativo: true
    })
    .select('codigo atividade professores periodo horario local dataVisita alunos status responsaveis')
    .sort({ createdAt: -1 })
    .lean();
    
    const termosFormatados = termos.map(t => {
      const responsavelDoAluno = t.responsaveis?.find(r => 
        (r.alunoId?._id || r.alunoId || '').toString() === alunoId.toString()
      );
      
      const jaAutorizou = responsavelDoAluno?.status === 'autorizado';
      const jaRecusou = responsavelDoAluno?.status === 'recusado';
      
      return {
        id: t._id,
        codigo: t.codigo,
        atividade: t.atividade,
        professor: t.professores?.[0]?.nome || 'Professor',
        totalProfessores: t.professores?.length || 0,
        periodo: t.periodo,
        horario: t.horario,
        local: t.local,
        dataVisita: t.dataVisita,
        jaAutorizou,
        jaRecusou
      };
    });
    
    const termosPendentes = termosFormatados.filter(t => !t.jaAutorizou && !t.jaRecusou);
    
    res.json({
      success: true,
      termos: termosPendentes,
      total: termosPendentes.length,
      alunoId
    });
  } catch (error) {
    console.error('❌ Erro ao buscar termos do aluno:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// BUSCAR TERMO COMPLETO
// ============================================
router.get('/termo/:id', async (req, res) => {
  try {
    const termo = await TermoVisita.findById(req.params.id)
      .select('-responsaveis.assinaturaBase64 -responsaveis.codigoTemp -assinaturaGestor.base64')
      .lean();
    
    if (!termo) {
      return res.status(404).json({ success: false, error: 'Termo não encontrado' });
    }
    
    const primeiroAluno = termo.alunos?.[0];
    const primeiroProf = termo.professores?.[0];
    
    res.json({
      success: true,
      termo: {
        id: termo._id,
        _id: termo._id,
        codigo: termo.codigo,
        atividade: termo.atividade,
        
        alunoNome: termo.alunos?.length > 1 
          ? `${primeiroAluno?.nome || 'Aluno'} + ${termo.alunos.length - 1}`
          : (primeiroAluno?.nome || 'Aluno'),
        alunoTurma: primeiroAluno?.turma || termo.turmaPrincipal || 'N/A',
        alunoCurso: primeiroAluno?.curso || termo.cursoPrincipal || 'N/A',
        alunoMatricula: primeiroAluno?.matricula || '',
        
        alunos: termo.alunos || [],
        totalAlunos: termo.alunos?.length || 1,
        
        professorNome: termo.professores?.length > 1
          ? `${primeiroProf?.nome || 'Professor'} + ${termo.professores.length - 1}`
          : (primeiroProf?.nome || 'Professor'),
        professores: termo.professores || [],
        totalProfessores: termo.professores?.length || 1,
        
        periodo: termo.periodo,
        horario: termo.horario,
        local: termo.local,
        localizacao: termo.localizacao,
        dataVisita: termo.dataVisita,
        cidade: termo.cidade,
        status: termo.status,
        
        responsaveis: (termo.responsaveis || []).map(r => ({
          alunoId: r.alunoId,
          alunoNome: r.alunoNome,
          nome: r.nome,
          status: r.status,
          autenticado: r.autenticado
        })),
        
        assinaturaGestor: termo.assinaturaGestor ? {
          nome: termo.assinaturaGestor.nome,
          cargo: termo.assinaturaGestor.cargo,
          data: termo.assinaturaGestor.data
        } : null
      }
    });
  } catch (error) {
    console.error('❌ Erro:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 🔐 TOTP - GERAR QR CODE
// ============================================
router.post('/gerar-qrcode-totp', rateLimit(10, 5), async (req, res) => {
  try {
    const { termoId } = req.body;
    
    if (!termoId) {
      return res.status(400).json({ success: false, error: 'Termo ID é obrigatório' });
    }
    
    const termo = await TermoVisita.findById(termoId);
    if (!termo) {
      return res.status(404).json({ success: false, error: 'Termo não encontrado' });
    }
    
    if (termo.totpSecret && termo.totpVerified) {
      return res.json({
        success: true,
        jaVerificado: true,
        message: 'Este termo já foi autenticado'
      });
    }
    
    const speakeasy = require('speakeasy');
    const QRCode = require('qrcode');
    
    let secret = termo.totpSecret;
    if (!secret) {
      const generated = speakeasy.generateSecret({
        name: `EducaPleno:${termo.codigo}`,
        issuer: 'EducaPleno Visitas',
        length: 32
      });
      secret = generated.base32;
      
      termo.totpSecret = secret;
      termo.totpCreatedAt = new Date();
      termo.totpVerified = false;
      await termo.save();
    }
    
    const otpauth = speakeasy.otpauthURL({
      secret: secret,
      label: `Visita ${termo.codigo}`,
      issuer: 'EducaPleno Visitas',
      encoding: 'base32'
    });
    
    const qrCodeDataUrl = await QRCode.toDataURL(otpauth, {
      errorCorrectionLevel: 'H',
      margin: 1,
      width: 250,
      color: { dark: '#1e40af', light: '#ffffff' }
    });
    
    console.log(`🔐 QR Code TOTP gerado para termo ${termo.codigo}`);
    
    res.json({
      success: true,
      qrCode: qrCodeDataUrl,
      secret: secret,
      termo: {
        codigo: termo.codigo,
        alunoNome: termo.alunos?.[0]?.nome || 'Aluno'
      },
      message: 'Escaneie o QR Code com o Google Authenticator'
    });
    
  } catch (error) {
    console.error('❌ Erro ao gerar QR Code TOTP:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 🔐 TOTP - VERIFICAR CÓDIGO
// ============================================
router.post('/verificar-totp', rateLimit(10, 5), async (req, res) => {
  try {
    const { termoId, codigo } = req.body;
    
    if (!termoId || !codigo) {
      return res.status(400).json({ 
        success: false, 
        error: 'Termo ID e código são obrigatórios' 
      });
    }
    
    const termo = await TermoVisita.findById(termoId);
    if (!termo) {
      return res.status(404).json({ success: false, error: 'Termo não encontrado' });
    }
    
    if (!termo.totpSecret) {
      return res.status(400).json({ 
        success: false, 
        error: 'Nenhum QR Code gerado. Solicite um novo.' 
      });
    }
    
    const speakeasy = require('speakeasy');
    
    const verified = speakeasy.totp.verify({
      secret: termo.totpSecret,
      encoding: 'base32',
      token: codigo.toString().trim(),
      window: 1
    });
    
    if (!verified) {
      console.log(`❌ Código TOTP inválido para termo ${termo.codigo}`);
      return res.status(400).json({ 
        success: false, 
        error: 'Código inválido. Verifique no Google Authenticator e tente novamente.' 
      });
    }
    
    termo.totpVerified = true;
    termo.totpVerifiedAt = new Date();
    await termo.save();
    
    console.log(`✅ TOTP verificado com sucesso para termo ${termo.codigo}`);
    
    res.json({
      success: true,
      message: 'Código verificado com sucesso!',
      termo: {
        codigo: termo.codigo,
        alunoNome: termo.alunos?.[0]?.nome || 'Aluno'
      }
    });
    
  } catch (error) {
    console.error('❌ Erro ao verificar TOTP:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ✅ AUTORIZAR VISITA
// ============================================
router.post('/autorizar/:termoId', rateLimit(3, 10), async (req, res) => {
  try {
    const { termoId } = req.params;
    const {
      nome, rg, cpf, telefone, email,
      lgpdAceito,
      assinaturaBase64,
      localizacao,
      alunoId  // 🔥 NOVO: qual aluno este responsável está autorizando
    } = req.body;
    
    console.log(`📝 [AUTORIZAR] Termo: ${termoId}, Aluno: ${alunoId || 'todos'}`);
    
    // ============ VALIDAÇÕES ============
    if (!nome || !rg || !cpf || !telefone) {
      return res.status(400).json({ success: false, error: 'Nome, RG, CPF e telefone são obrigatórios' });
    }
    if (!lgpdAceito) {
      return res.status(400).json({ success: false, error: 'Aceite os termos da LGPD' });
    }
    if (!assinaturaBase64) {
      return res.status(400).json({ success: false, error: 'Assinatura é obrigatória' });
    }
    
    const termo = await TermoVisita.findById(termoId);
    if (!termo) return res.status(404).json({ success: false, error: 'Termo não encontrado' });
    
    if (!termo.totpVerified) {
      return res.status(400).json({ 
        success: false, 
        error: 'Você precisa autenticar com o Google Authenticator primeiro' 
      });
    }
    
    const cpfLimpo = cpf.replace(/\D/g, '');
    if (cpfLimpo.length !== 11) {
      return res.status(400).json({ success: false, error: 'CPF inválido' });
    }
    
    // 🔥 NOVO: Encontrar o índice do responsável
    // Se alunoId foi enviado, procura o responsável DAQUELE aluno
    // Senão, procura o primeiro pendente
    let responsavelIndex = -1;
    
    if (alunoId) {
      responsavelIndex = termo.responsaveis.findIndex(r => 
        (r.alunoId?._id || r.alunoId || '').toString() === alunoId.toString()
      );
    }
    
    if (responsavelIndex === -1) {
      // Fallback: primeiro pendente
      responsavelIndex = termo.responsaveis.findIndex(r => 
        !r.nome || r.status === 'pendente'
      );
    }
    
    if (responsavelIndex === -1) {
      responsavelIndex = 0;
    }
    
    // 🔐 CRIPTOGRAFIA EXPLÍCITA
    termo.responsaveis[responsavelIndex] = {
      ...termo.responsaveis[responsavelIndex],
      nome: nome.trim(),
      
      // 🔐 Criptografados explicitamente
      rg: encrypt(rg.trim()),
      cpf: encrypt(cpfLimpo),
      telefone: encrypt(telefone.replace(/\D/g, '')),
      
      // 🔍 Hash para busca
      cpfHash: hash(cpfLimpo),
      
      email: email ? email.toLowerCase().trim() : '',
      
      autenticado: true,
      autenticacaoData: new Date(),
      autenticacaoMetodo: 'totp',
      
      // 🔐 Assinatura criptografada
      assinaturaBase64: encrypt(assinaturaBase64),
      assinaturaData: new Date(),
      
      // LGPD - Consentimento
      lgpdAceito: true,
      lgpdAceitoData: new Date(),
      lgpdVersao: process.env.LGPD_VERSAO || '1.0',
      lgpdIp: req.ip || req.headers['x-forwarded-for'] || 'unknown',
      lgpdUserAgent: req.headers['user-agent'],
      
      // Geolocalização
      localizacaoAssinatura: {
        latitude: localizacao?.latitude || null,
        longitude: localizacao?.longitude || null,
        endereco: localizacao?.endereco || '',
        cidade: localizacao?.cidade || '',
        estado: localizacao?.estado || '',
        timestamp: new Date()
      },
      
      status: 'autorizado'
    };
    
    termo.atualizarStatusGeral();
    await termo.save();
    
    console.log(`✅ Termo ${termo.codigo} autorizado por ${nome}`);
    
    // 🔐 REGISTRAR CONSENTIMENTO LGPD
    try {
      await ConsentimentoLGPD.create({
        titular: {
          nome: nome.trim(),
          cpf: encrypt(cpfLimpo),
          cpfHash: hash(cpfLimpo),
          email: email ? email.toLowerCase().trim() : '',
          telefone: encrypt(telefone.replace(/\D/g, ''))
        },
        tipo: 'autorizacao_visita',
        finalidade: `Autorização de visita técnica - ${termo.atividade}`,
        baseLegal: 'consentimento',
        versaoPolitica: process.env.LGPD_VERSAO || '1.0',
        ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
        userAgent: req.headers['user-agent'],
        geolocalizacao: {
          latitude: localizacao?.latitude || null,
          longitude: localizacao?.longitude || null
        },
        termoId: termo._id,
        status: 'ativo',
        expiraEm: termo.expiraEm,
        assinaturaBase64: encrypt(assinaturaBase64)
      });
      console.log(`✅ Consentimento LGPD registrado`);
    } catch (lgpdErr) {
      console.warn('⚠️ Erro ao registrar consentimento LGPD:', lgpdErr.message);
    }
    
    // Notificar criador
    try {
      const notificacao = new NotificacaoVisita({
        usuarioId: termo.criadoPor,
        tipo: 'autorizacao',
        titulo: '✅ Visita Autorizada',
        mensagem: `${nome} autorizou a visita de ${termo.alunos?.[0]?.nome || 'Aluno'} - ${termo.codigo}`,
        termoId: termo._id
      });
      await notificacao.save();
      
      try {
        const OneSignalService = require('../services/onesignal-service');
        const oneSignal = new OneSignalService();
        await oneSignal.enviarPush(
          termo.criadoPor,
          '✅ Visita Autorizada',
          `${termo.alunos?.[0]?.nome || 'Aluno'} - ${termo.codigo}`,
          { tipo: 'visita_autorizada', termoId: termo._id, codigo: termo.codigo }
        );
      } catch (pushError) {
        console.warn('⚠️ Erro no push:', pushError.message);
      }
    } catch (notifError) {
      console.warn('⚠️ Erro ao notificar:', notifError.message);
    }
    
    res.json({
      success: true,
      message: 'Visita autorizada com sucesso!',
      termo: {
        id: termo._id,
        codigo: termo.codigo,
        atividade: termo.atividade,
        alunoNome: termo.alunos?.[0]?.nome || 'Aluno',
        alunoTurma: termo.alunos?.[0]?.turma || 'N/A',
        alunoCurso: termo.alunos?.[0]?.curso || 'N/A',
        professorNome: termo.professores?.[0]?.nome || 'Professor',
        periodo: termo.periodo,
        horario: termo.horario,
        local: termo.local,
        dataVisita: termo.dataVisita,
        cidade: termo.cidade,
        status: termo.status,
        responsavel: {
          nome: termo.responsaveis[responsavelIndex].nome,
          cpf: mascararCPF(cpfLimpo),
          assinaturaData: termo.responsaveis[responsavelIndex].assinaturaData
        },
        assinaturaGestor: termo.assinaturaGestor
      }
    });
    
  } catch (error) {
    console.error('❌ Erro ao autorizar:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// RECUSAR VISITA
// ============================================
router.post('/recusar/:termoId', rateLimit(5, 10), async (req, res) => {
  try {
    const { motivo, nome, alunoId } = req.body;
    
    const termo = await TermoVisita.findById(req.params.termoId);
    if (!termo) return res.status(404).json({ success: false, error: 'Termo não encontrado' });
    
    let responsavelIndex = -1;
    
    if (alunoId) {
      responsavelIndex = termo.responsaveis.findIndex(r => 
        (r.alunoId?._id || r.alunoId || '').toString() === alunoId.toString()
      );
    }
    
    if (responsavelIndex === -1) {
      responsavelIndex = termo.responsaveis.findIndex(r => 
        !r.nome || r.status === 'pendente'
      );
    }
    
    if (responsavelIndex === -1) responsavelIndex = 0;
    
    termo.responsaveis[responsavelIndex].status = 'recusado';
    termo.responsaveis[responsavelIndex].recusaData = new Date();
    termo.responsaveis[responsavelIndex].motivoRecusa = motivo || 'Não informado';
    termo.responsaveis[responsavelIndex].nome = nome || 'Responsável';
    
    termo.atualizarStatusGeral();
    await termo.save();
    
    try {
      const notificacao = new NotificacaoVisita({
        usuarioId: termo.criadoPor,
        tipo: 'recusa',
        titulo: '❌ Visita Recusada',
        mensagem: `A visita de ${termo.alunos?.[0]?.nome || 'Aluno'} foi recusada. Motivo: ${motivo || 'Não informado'}`,
        termoId: termo._id
      });
      await notificacao.save();
    } catch (notifError) {
      console.warn('⚠️ Erro ao notificar:', notifError.message);
    }
    
    res.json({ success: true, message: 'Visita recusada' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 📄 GERAR TERMO OFICIAL (INDIVIDUAL)
// ⚠️ IMPORTANTE: Retorna 1 PÁGINA POR ALUNO
// ============================================
router.get('/termo-oficial/:id', async (req, res) => {
  try {
    const termo = await TermoVisita.findById(req.params.id).lean();
    
    if (!termo) {
      return res.status(404).json({ success: false, error: 'Termo não encontrado' });
    }
    
    const responsaveisAutorizados = (termo.responsaveis || []).filter(r => r.status === 'autorizado');
    
    if (responsaveisAutorizados.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Este termo ainda não foi autorizado por nenhum responsável' 
      });
    }
    
    // 🔥 Gera HTML com 1 página por aluno
    const html = gerarHTMLTermoOficial(termo);
    
    res.json({
      success: true,
      html,
      termo: {
        codigo: termo.codigo,
        totalAutorizados: responsaveisAutorizados.length,
        totalAlunos: termo.alunos?.length || 1,
        totalPaginas: termo.alunos?.length || 1
      }
    });
    
  } catch (error) {
    console.error('❌ Erro ao gerar termo oficial:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 📄 GERAR MÚLTIPLOS TERMOS (LOTE)
// ⚠️ Cada termo gera N páginas (1 por aluno)
// ============================================
router.post('/termos-oficiais-lote', async (req, res) => {
  try {
    const { termoIds, incluirSemAutorizacao = true } = req.body;
    
    if (!termoIds || !Array.isArray(termoIds) || termoIds.length === 0) {
      return res.status(400).json({ success: false, error: 'Nenhum termo informado' });
    }
    
    if (termoIds.length > 100) {
      return res.status(400).json({ 
        success: false, 
        error: 'Limite de 100 termos por impressão. Refine os filtros.' 
      });
    }
    
    console.log(`📄 [LOTE] Gerando ${termoIds.length} termo(s)...`);
    
    const termos = await TermoVisita.find({ 
      _id: { $in: termoIds } 
    })
    .sort({ dataVisita: 1, createdAt: -1 })
    .lean();
    
    if (termos.length === 0) {
      return res.status(404).json({ success: false, error: 'Nenhum termo encontrado' });
    }
    
    let termosParaImprimir = termos;
    let termosIgnorados = [];
    
    if (!incluirSemAutorizacao) {
      termosParaImprimir = termos.filter(t => 
        (t.responsaveis || []).some(r => r.status === 'autorizado')
      );
      termosIgnorados = termos.filter(t => 
        !(t.responsaveis || []).some(r => r.status === 'autorizado')
      );
    }
    
    if (termosParaImprimir.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Nenhum termo pôde ser gerado' 
      });
    }
    
    const htmlsGerados = [];
    const errosGeracao = [];
    let totalPaginas = 0;
    
    for (const termo of termosParaImprimir) {
      try {
        const html = gerarHTMLTermoOficial(termo);
        const numAlunos = termo.alunos?.length || 1;
        totalPaginas += numAlunos;
        
        htmlsGerados.push({ 
          termoId: termo._id, 
          codigo: termo.codigo, 
          totalAlunos: numAlunos,
          html 
        });
      } catch (err) {
        errosGeracao.push({ codigo: termo.codigo, erro: err.message });
      }
    }
    
    if (htmlsGerados.length === 0) {
      return res.status(500).json({ success: false, error: 'Não foi possível gerar nenhum termo' });
    }
    
    const htmlCombinado = combinarHTMLsTermos(htmlsGerados.map(h => h.html));
    
    console.log(`✅ [LOTE] ${htmlsGerados.length} termo(s) / ${totalPaginas} página(s) geradas`);
    
    res.json({
      success: true,
      html: htmlCombinado,
      total: htmlsGerados.length,
      totalPaginas: totalPaginas,
      totalSolicitados: termoIds.length,
      ignorados: termosIgnorados.length,
      erros: errosGeracao.length,
      termos: htmlsGerados.map(h => ({ 
        id: h.termoId, 
        codigo: h.codigo,
        totalAlunos: h.totalAlunos
      }))
    });
    
  } catch (error) {
    console.error('❌ Erro ao gerar termos em lote:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 🎨 GERAR HTML DO TERMO OFICIAL
// ⚠️ IMPORTANTE: Gera 1 PÁGINA POR ALUNO
// ============================================
function gerarHTMLTermoOficial(termo) {
  const alunos = termo.alunos || [];
  
  if (alunos.length === 0) {
    console.warn('⚠️ Termo sem alunos:', termo.codigo);
    return '';
  }

  // Gera 1 página por aluno
  const paginasHTML = alunos.map((aluno, index) => {
    return gerarPaginaTermoOficial(termo, aluno, index + 1, alunos.length);
  });

  // Se é só 1 aluno, retorna direto
  if (paginasHTML.length === 1) {
    return paginasHTML[0];
  }

  // Se tem múltiplos, combina todas as páginas
  return combinarPaginasTermo(paginasHTML, termo);
}

// ============================================
// 📄 GERAR UMA PÁGINA PARA UM ALUNO ESPECÍFICO
// ============================================
function gerarPaginaTermoOficial(termo, aluno, numeroPagina, totalPaginas) {
  const dataVisita = new Date(termo.dataVisita).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric'
  });

  // ✅ Buscar responsável DESSE aluno específico
  const alunoIdStr = (aluno.alunoId?._id || aluno.alunoId || '').toString();
  const responsavelDoAluno = (termo.responsaveis || []).find(r => 
    (r.alunoId?._id || r.alunoId || '').toString() === alunoIdStr
  );

  // ✅ Dados do responsável DESTE aluno
  const assinaturaResponsavel = responsavelDoAluno?.assinaturaBase64 || '';
  const nomeResponsavel = responsavelDoAluno?.nome || 'Aguardando responsável';
  const cpfResponsavel = responsavelDoAluno?.cpf || '';
  const statusResponsavel = responsavelDoAluno?.status || 'pendente';

  // Formatar CPF
  const cpfFormatado = cpfResponsavel 
    ? String(cpfResponsavel).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
    : '—';

  // Professores
  const professores = termo.professores || [];
  let professoresTexto = '';
  
  if (professores.length === 1) {
    professoresTexto = `<span class="destaque">${professores[0].nome}</span>`;
  } else if (professores.length === 2) {
    professoresTexto = `<span class="destaque">${professores[0].nome}</span> e <span class="destaque">${professores[1].nome}</span>`;
  } else if (professores.length > 2) {
    const ultimos = professores.slice(-1)[0];
    const primeiros = professores.slice(0, -1).map(p => p.nome).join(', ');
    professoresTexto = `<span class="destaque">${primeiros}</span> e <span class="destaque">${ultimos.nome}</span>`;
  } else {
    professoresTexto = '<span class="destaque">Professor(a)</span>';
  }

  // Assinatura do gestor
  const assinaturaGestor = termo.assinaturaGestor?.base64 || '';
  const nomeGestor = termo.assinaturaGestor?.nome || 'Gestor Pedagógico';
  const cargoGestor = termo.assinaturaGestor?.cargo || 'Gestor Pedagógico';

  // Indicador de página (só se tiver múltiplas)
  const indicadorPagina = totalPaginas > 1 
    ? `<div class="page-indicator">Página ${numeroPagina} de ${totalPaginas}</div>`
    : '';

  // Status badge
  let statusBadge = '';
  if (statusResponsavel === 'autorizado') {
    statusBadge = '<span class="badge autorizado">✓ Autorizado</span>';
  } else if (statusResponsavel === 'recusado') {
    statusBadge = '<span class="badge recusado">✗ Recusado</span>';
  } else {
    statusBadge = '<span class="badge pendente">⏳ Pendente</span>';
  }

  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Termo de Visita - ${termo.codigo} - ${aluno.nome}</title>
      <style>
        @page { size: A4 portrait; margin: 15mm; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: 'Times New Roman', Times, serif;
          font-size: 11pt;
          line-height: 1.6;
          padding: 15mm;
          color: #000;
          position: relative;
        }
        .header {
          text-align: center;
          border-bottom: 3px double #000;
          padding-bottom: 15px;
          margin-bottom: 25px;
        }
        .header h1 { font-size: 14pt; text-transform: uppercase; margin-bottom: 5px; }
        .header h2 { font-size: 12pt; font-weight: normal; }
        .codigo-topo { 
          text-align: right; 
          font-size: 10pt; 
          margin-bottom: 10px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .codigo-topo code {
          background: #f0f0f0;
          padding: 3px 10px;
          border-radius: 4px;
          font-family: monospace;
        }
        .page-indicator {
          font-size: 9pt;
          color: #666;
          font-style: italic;
        }
        .titulo {
          text-align: center;
          font-size: 16pt;
          font-weight: bold;
          text-transform: uppercase;
          margin: 25px 0;
          padding: 15px;
          background: #f0f0f0;
          border: 2px solid #000;
        }
        .conteudo {
          text-align: justify;
          font-size: 12pt;
          line-height: 2;
          margin: 25px 0;
        }
        .conteudo p { margin-bottom: 15px; }
        .destaque {
          background: #f9f9f9;
          padding: 3px 8px;
          border-bottom: 1px solid #333;
          font-weight: bold;
        }
        .aluno-destaque {
          background: #fff3cd;
          padding: 15px;
          border-left: 5px solid #ffc107;
          margin: 20px 0;
          font-size: 12pt;
        }
        .aluno-destaque strong {
          font-size: 14pt;
          color: #856404;
        }
        .aluno-info {
          font-size: 11pt;
          color: #333;
          margin-top: 5px;
        }
        .status-badge-container {
          text-align: center;
          margin: 15px 0;
        }
        .badge {
          display: inline-block;
          padding: 5px 15px;
          border-radius: 20px;
          font-size: 10pt;
          font-weight: bold;
        }
        .badge.autorizado { background: #d1fae5; color: #065f46; border: 1px solid #10b981; }
        .badge.recusado { background: #fee2e2; color: #991b1b; border: 1px solid #ef4444; }
        .badge.pendente { background: #fef3c7; color: #92400e; border: 1px solid #f59e0b; }
        .cidade-data { text-align: right; margin: 40px 0 30px; font-size: 12pt; }
        .assinaturas {
          display: flex;
          justify-content: space-between;
          gap: 40px;
          margin-top: 70px;
          page-break-inside: avoid;
        }
        .assinatura { flex: 1; text-align: center; }
        .assinatura-img {
          max-height: 70px;
          max-width: 100%;
          display: block;
          margin: 0 auto 5px;
        }
        .assinatura-linha {
          border-top: 1px solid #000;
          padding-top: 8px;
          font-size: 11pt;
          margin-top: 65px;
        }
        .assinatura-linha.com-assinatura { margin-top: 5px; }
        .assinatura-linha strong { display: block; margin-bottom: 2px; }
        .assinatura-linha small { font-size: 9pt; color: #666; display: block; }
        .rodape {
          position: fixed;
          bottom: 10mm;
          left: 15mm;
          right: 15mm;
          text-align: center;
          font-size: 8pt;
          color: #666;
          border-top: 1px solid #ccc;
          padding-top: 5px;
        }
        @media print {
          body { padding: 0; }
          .no-print { display: none !important; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>IEMA Pleno: São Luís - Centro</h1>
        <h2>Termo de Autorização de Visita Técnica</h2>
      </div>
      
      <div class="codigo-topo">
        <div class="page-indicator">${indicadorPagina}</div>
        <code>${termo.codigo}</code>
      </div>
      
      <div class="titulo">Autorização de Visita</div>
      
      <div class="status-badge-container">
        ${statusBadge}
      </div>
      
      <div class="conteudo">
        <p>
          <strong>AUTORIZO</strong> a participação do(a) aluno(a) 
          <span class="destaque">${aluno.nome}</span>, 
          ${aluno.turma ? `da turma <span class="destaque">${aluno.turma}</span>,` : ''}
          ${aluno.curso ? `do curso <span class="destaque">${aluno.curso}</span>,` : ''}
          na atividade <span class="destaque">${termo.atividade}</span>, 
          sob coordenação do(a) ${professoresTexto}, 
          a ser realizada no dia <span class="destaque">${dataVisita}</span>, 
          no período <span class="destaque">${termo.periodo}</span>, 
          no horário <span class="destaque">${termo.horario}</span>, 
          no local <span class="destaque">${termo.local}</span>.
        </p>
        
        ${termo.localizacao?.enderecoCompleto ? `
          <p style="font-size: 10pt; color: #555; margin-top: 10px;">
            <strong>Endereço:</strong> ${termo.localizacao.enderecoCompleto}
          </p>
        ` : ''}
        
        <div class="aluno-destaque">
          <strong>📌 ALUNO(A) AUTORIZADO(A):</strong>
          <div class="aluno-info">
            <strong>${aluno.nome}</strong>
            ${aluno.matricula ? ` • Matrícula: ${aluno.matricula}` : ''}
            ${aluno.turma ? `<br>Turma: ${aluno.turma}` : ''}
            ${aluno.curso ? ` • Curso: ${aluno.curso}` : ''}
          </div>
        </div>
        
        <p style="margin-top: 20px;">
          Declaro estar ciente das normas e responsabilidades referentes a esta atividade, 
          bem como das medidas de segurança adotadas pela instituição.
        </p>
      </div>
      
      <div class="cidade-data">
        ${termo.cidade || 'São Luís'} - MA, ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
      </div>
      
      <div class="assinaturas">
        <div class="assinatura">
          ${assinaturaResponsavel ? `
            <img src="${assinaturaResponsavel}" class="assinatura-img" alt="Assinatura do Responsável">
          ` : ''}
          <div class="assinatura-linha ${assinaturaResponsavel ? 'com-assinatura' : ''}">
            <strong>${nomeResponsavel}</strong>
            <small>Responsável Legal do(a) aluno(a) ${aluno.nome}${cpfResponsavel ? ` • CPF: ${cpfFormatado}` : ''}</small>
          </div>
        </div>
        
        <div class="assinatura">
          ${assinaturaGestor ? `
            <img src="${assinaturaGestor}" class="assinatura-img" alt="Assinatura do Gestor">
          ` : ''}
          <div class="assinatura-linha ${assinaturaGestor ? 'com-assinatura' : ''}">
            <strong>${nomeGestor}</strong>
            <small>${cargoGestor}</small>
          </div>
        </div>
      </div>
      
      <div class="rodape">
        <p>Documento gerado em ${new Date().toLocaleString('pt-BR')} - EducaPleno</p>
        <p>Este documento é válido como autorização oficial de visita técnica</p>
      </div>
    </body>
    </html>
  `;
}

// ============================================
// 🎨 COMBINAR MÚLTIPLAS PÁGINAS DE UM MESMO TERMO
// ============================================
function combinarPaginasTermo(paginas, termo) {
  if (paginas.length === 0) {
    return '<!DOCTYPE html><html><body><p>Nenhuma página para exibir</p></body></html>';
  }

  if (paginas.length === 1) {
    return paginas[0];
  }

  // Extrair <head> do primeiro
  const headMatch = paginas[0].match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  const headOriginal = headMatch ? headMatch[1] : '';

  // Extrair <body> de cada página
  const bodies = paginas.map((html, index) => {
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    const conteudo = bodyMatch ? bodyMatch[1] : html;
    
    return `
      <div class="termo-aluno-pagina" data-pagina="${index + 1}">
        ${conteudo}
      </div>
    `;
  });

  const cssMultiplasPaginas = `
    <style>
      .termo-aluno-pagina {
        page-break-after: always;
        page-break-inside: avoid;
        position: relative;
      }
      .termo-aluno-pagina:last-child {
        page-break-after: auto;
      }
      @media print {
        .termo-aluno-pagina {
          page-break-after: always;
        }
        .termo-aluno-pagina:last-child {
          page-break-after: auto;
        }
      }
    </style>
  `;

  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Termo ${termo.codigo} - ${paginas.length} aluno(s)</title>
      ${headOriginal}
      ${cssMultiplasPaginas}
    </head>
    <body>
      ${bodies.join('\n')}
    </body>
    </html>
  `;
}

// ============================================
// 🎨 COMBINAR HTMLs DE MÚLTIPLOS TERMOS (IMPRESSÃO EM LOTE)
// Cada termo já traz suas N páginas internamente
// ============================================
function combinarHTMLsTermos(htmls) {
  if (!htmls || htmls.length === 0) {
    return '<!DOCTYPE html><html><body><p>Nenhum termo para exibir</p></body></html>';
  }
  
  const headMatch = htmls[0].match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  const headOriginal = headMatch ? headMatch[1] : '';
  
  const bodies = htmls.map((html, index) => {
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    const conteudo = bodyMatch ? bodyMatch[1] : html;
    
    return `
      <div class="termo-lote-page" data-termo-index="${index + 1}">
        ${conteudo}
      </div>
    `;
  });
  
  const cssLote = `
    <style>
      .termo-lote-page {
        page-break-after: always;
        page-break-inside: avoid;
        position: relative;
      }
      .termo-lote-page:last-child {
        page-break-after: auto;
      }
      
      /* Mantém a quebra de página entre alunos dentro do mesmo termo */
      .termo-aluno-pagina {
        page-break-after: always;
        page-break-inside: avoid;
      }
      .termo-aluno-pagina:last-child {
        page-break-after: auto;
      }
      
      .lote-info {
        position: fixed;
        top: 5mm;
        right: 15mm;
        font-size: 8pt;
        color: #999;
        font-family: Arial, sans-serif;
        z-index: 9999;
      }
      
      @media print {
        .lote-info { display: none; }
        .termo-lote-page {
          page-break-after: always;
          page-break-inside: avoid;
        }
        .termo-lote-page:last-child {
          page-break-after: auto;
        }
        .termo-aluno-pagina {
          page-break-after: always;
          page-break-inside: avoid;
        }
        .termo-aluno-pagina:last-child {
          page-break-after: auto;
        }
      }
      
      @media screen {
        body { background: #e5e7eb; padding: 20px; }
        .termo-lote-page {
          background: white;
          padding: 15mm;
          margin: 0 auto 20px;
          max-width: 210mm;
          box-shadow: 0 4px 20px rgba(0,0,0,0.15);
          border-radius: 4px;
        }
      }
    </style>
  `;
  
  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Termos de Visita - Impressão em Lote (${htmls.length} termos)</title>
      ${headOriginal}
      ${cssLote}
    </head>
    <body>
      <div class="lote-info">📄 ${htmls.length} termo(s) • Impressão em lote</div>
      ${bodies.join('\n')}
    </body>
    </html>
  `;
}

// ============================================
// GEOCODING REVERSO
// ============================================
router.post('/geocoding-reverso', async (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    if (!latitude || !longitude) {
      return res.status(400).json({ success: false, error: 'Coordenadas obrigatórias' });
    }
    
    const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
      params: { lat: latitude, lon: longitude, format: 'json', addressdetails: 1 },
      headers: { 'User-Agent': 'EducaPleno/1.0 (contato@iemasaoluiscentro.net)' },
      timeout: 10000
    });
    
    if (response.data) {
      const addr = response.data.address || {};
      res.json({
        success: true,
        endereco: response.data.display_name,
        cidade: addr.city || addr.town || addr.village || '',
        estado: addr.state || '',
        cep: addr.postcode || ''
      });
    } else {
      res.json({ success: false, endereco: 'Endereço não encontrado' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;