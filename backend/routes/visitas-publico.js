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
const { encrypt, decrypt, hash } = require('../utils/crypto-utils');

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
      localizacao
    } = req.body;
    
    console.log(`📝 [AUTORIZAR] Termo: ${termoId}`);
    
    // Validações
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
    
    let responsavelIndex = termo.responsaveis.findIndex(r => 
      !r.nome || r.status === 'pendente'
    );
    
    if (responsavelIndex === -1) {
      responsavelIndex = 0;
    }
    
    // 🔐 CRIPTOGRAFIA EXPLÍCITA
    termo.responsaveis[responsavelIndex] = {
      ...termo.responsaveis[responsavelIndex],
      nome: nome.trim(),
      
      // Campos criptografados
      rg: encrypt(rg.trim()),
      cpf: encrypt(cpfLimpo),
      telefone: encrypt(telefone.replace(/\D/g, '')),
      
      // Hash para busca
      cpfHash: hash(cpfLimpo),
      
      email: email ? email.toLowerCase().trim() : '',
      
      autenticado: true,
      autenticacaoData: new Date(),
      autenticacaoMetodo: 'totp',
      
      // Assinatura criptografada
      assinaturaBase64: encrypt(assinaturaBase64),
      assinaturaData: new Date(),
      
      // LGPD
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
    const { motivo, nome } = req.body;
    
    const termo = await TermoVisita.findById(req.params.termoId);
    if (!termo) return res.status(404).json({ success: false, error: 'Termo não encontrado' });
    
    let responsavelIndex = termo.responsaveis.findIndex(r => 
      !r.nome || r.status === 'pendente'
    );
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
// 📄 GERAR TERMO OFICIAL (COM DESCRIPTOGRAFIA)
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
    
    const html = gerarHTMLTermoOficial(termo);
    
    res.json({
      success: true,
      html,
      termo: {
        codigo: termo.codigo,
        totalAutorizados: responsaveisAutorizados.length,
        totalAlunos: termo.alunos?.length || 1
      }
    });
    
  } catch (error) {
    console.error('❌ Erro ao gerar termo oficial:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 📄 GERAR MÚLTIPLOS TERMOS (LOTE)
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
    
    for (const termo of termosParaImprimir) {
      try {
        const html = gerarHTMLTermoOficial(termo);
        htmlsGerados.push({ termoId: termo._id, codigo: termo.codigo, html });
      } catch (err) {
        errosGeracao.push({ codigo: termo.codigo, erro: err.message });
      }
    }
    
    if (htmlsGerados.length === 0) {
      return res.status(500).json({ success: false, error: 'Não foi possível gerar nenhum termo' });
    }
    
    const htmlCombinado = combinarHTMLsTermos(htmlsGerados.map(h => h.html));
    
    res.json({
      success: true,
      html: htmlCombinado,
      total: htmlsGerados.length,
      totalSolicitados: termoIds.length,
      ignorados: termosIgnorados.length,
      erros: errosGeracao.length,
      termos: htmlsGerados.map(h => ({ id: h.termoId, codigo: h.codigo }))
    });
    
  } catch (error) {
    console.error('❌ Erro ao gerar termos em lote:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 🎨 GERAR HTML DO TERMO OFICIAL
// ============================================
function gerarHTMLTermoOficial(termo) {
  const dataVisita = new Date(termo.dataVisita).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric'
  });
  
  const mapaResponsaveis = new Map();
  (termo.responsaveis || []).forEach(r => {
    const alunoId = (r.alunoId?._id || r.alunoId || '').toString();
    if (alunoId) mapaResponsaveis.set(alunoId, r);
  });
  
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
  
  const alunos = termo.alunos || [];
  const alunosTexto = alunos.map(a => {
    const responsavel = mapaResponsaveis.get((a.alunoId?._id || a.alunoId || '').toString());
    const status = responsavel?.status || 'pendente';
    
    return `
      <li>
        <strong>${a.nome}</strong>
        ${a.turma ? ` — ${a.turma}` : ''}
        ${a.curso ? ` — ${a.curso}` : ''}
        ${status === 'autorizado' ? '<span style="color: #10b981; font-weight: 600;">✓ Autorizado</span>' : ''}
        ${status === 'recusado' ? '<span style="color: #ef4444; font-weight: 600;">✗ Recusado</span>' : ''}
      </li>
    `;
  }).join('');
  
  // 🔓 Descriptografar dados do responsável autorizado
  const responsavelAutorizado = (termo.responsaveis || []).find(r => r.status === 'autorizado');
  
  let assinaturaResponsavel = '';
  let cpfResponsavel = '';
  
  if (responsavelAutorizado) {
    try {
      if (responsavelAutorizado.assinaturaBase64) {
        assinaturaResponsavel = decrypt(responsavelAutorizado.assinaturaBase64);
      }
      if (responsavelAutorizado.cpf) {
        cpfResponsavel = decrypt(responsavelAutorizado.cpf);
      }
    } catch (err) {
      console.warn('⚠️ Erro ao descriptografar:', err.message);
    }
  }
  
  const nomeResponsavel = responsavelAutorizado?.nome || 'Aguardando responsável';
  
  const cpfFormatado = cpfResponsavel 
    ? String(cpfResponsavel).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
    : '—';
  
  // 🔓 Descriptografar assinatura do gestor
  let assinaturaGestor = '';
  if (termo.assinaturaGestor?.base64) {
    try {
      assinaturaGestor = decrypt(termo.assinaturaGestor.base64);
    } catch (err) {
      console.warn('⚠️ Erro ao descriptografar assinatura do gestor:', err.message);
    }
  }
  
  const nomeGestor = termo.assinaturaGestor?.nome || 'Gestor Pedagógico';
  const cargoGestor = termo.assinaturaGestor?.cargo || 'Gestor Pedagógico';
  
  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Termo de Visita - ${termo.codigo}</title>
      <style>
        @page { size: A4 portrait; margin: 15mm; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: 'Times New Roman', Times, serif;
          font-size: 11pt;
          line-height: 1.6;
          padding: 15mm;
          color: #000;
        }
        .header { text-align: center; border-bottom: 3px double #000; padding-bottom: 15px; margin-bottom: 25px; }
        .header h1 { font-size: 14pt; text-transform: uppercase; margin-bottom: 5px; }
        .header h2 { font-size: 12pt; font-weight: normal; }
        .codigo-topo { text-align: right; font-size: 10pt; margin-bottom: 10px; }
        .codigo-topo code { background: #f0f0f0; padding: 3px 10px; border-radius: 4px; font-family: monospace; }
        .titulo { text-align: center; font-size: 16pt; font-weight: bold; text-transform: uppercase; margin: 25px 0; padding: 15px; background: #f0f0f0; border: 2px solid #000; }
        .conteudo { text-align: justify; font-size: 12pt; line-height: 2; margin: 25px 0; }
        .conteudo p { margin-bottom: 15px; }
        .destaque { background: #f9f9f9; padding: 3px 8px; border-bottom: 1px solid #333; font-weight: bold; }
        .alunos-lista { margin: 15px 0 15px 25px; padding-left: 20px; line-height: 1.8; }
        .alunos-lista li { margin-bottom: 5px; }
        .cidade-data { text-align: right; margin: 40px 0 30px; font-size: 12pt; }
        .assinaturas { display: flex; justify-content: space-between; gap: 40px; margin-top: 70px; page-break-inside: avoid; }
        .assinatura { flex: 1; text-align: center; }
        .assinatura-img { max-height: 70px; max-width: 100%; display: block; margin: 0 auto 5px; }
        .assinatura-linha { border-top: 1px solid #000; padding-top: 8px; font-size: 11pt; margin-top: 65px; }
        .assinatura-linha.com-assinatura { margin-top: 5px; }
        .assinatura-linha strong { display: block; margin-bottom: 2px; }
        .assinatura-linha small { font-size: 9pt; color: #666; display: block; }
        .rodape { position: fixed; bottom: 10mm; left: 15mm; right: 15mm; text-align: center; font-size: 8pt; color: #666; border-top: 1px solid #ccc; padding-top: 5px; }
        .status-resumo { background: #f0fdf4; border-left: 4px solid #10b981; padding: 10px 15px; margin: 20px 0; font-size: 10pt; border-radius: 5px; }
        @media print { body { padding: 0; } .no-print { display: none !important; } }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>IEMA Pleno: São Luís - Centro</h1>
        <h2>Termo de Autorização de Visita Técnica</h2>
      </div>
      
      <div class="codigo-topo"><code>${termo.codigo}</code></div>
      
      <div class="titulo">Autorização de Visita</div>
      
      <div class="conteudo">
        <p>
          <strong>AUTORIZO</strong> a participação do(s) aluno(s) listado(s) abaixo na atividade 
          <span class="destaque">${termo.atividade}</span>, 
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
        
        <p style="margin-top: 20px;"><strong>Alunos autorizados:</strong></p>
        <ul class="alunos-lista">${alunosTexto}</ul>
        
        <p style="margin-top: 20px;">
          Declaro estar ciente das normas e responsabilidades referentes a esta atividade, 
          bem como das medidas de segurança adotadas pela instituição.
        </p>
      </div>
      
      <div class="status-resumo">
        <strong>📋 Status das Autorizações:</strong>
        ${(termo.responsaveis || []).map(r => {
          const status = r.status === 'autorizado' ? '✓ Autorizado' :
                         r.status === 'recusado' ? '✗ Recusado' :
                         '⏳ Pendente';
          const cor = r.status === 'autorizado' ? '#10b981' :
                      r.status === 'recusado' ? '#ef4444' :
                      '#f59e0b';
          return `<span style="display: inline-block; margin-right: 15px; color: ${cor}; font-weight: 600;">
            ${r.alunoNome || 'Aluno'}: ${status}
          </span>`;
        }).join('')}
      </div>
      
      <div class="cidade-data">
        ${termo.cidade || 'São Luís'} - MA, ${new Date(termo.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
      </div>
      
      <div class="assinaturas">
        <div class="assinatura">
          ${assinaturaResponsavel ? `
            <img src="${assinaturaResponsavel}" class="assinatura-img" alt="Assinatura do Responsável">
          ` : ''}
          <div class="assinatura-linha ${assinaturaResponsavel ? 'com-assinatura' : ''}">
            <strong>${nomeResponsavel}</strong>
            <small>Responsável Legal ${cpfResponsavel ? `• CPF: ${cpfFormatado}` : ''}</small>
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
// 🎨 COMBINAR HTMLs DE TERMOS
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
      <div class="termo-page" data-termo-index="${index + 1}">
        ${conteudo}
      </div>
    `;
  });
  
  const cssLote = `
    <style>
      .termo-page { page-break-after: always; page-break-inside: avoid; position: relative; min-height: 100vh; }
      .termo-page:last-child { page-break-after: auto; }
      .termo-page .rodape { position: fixed; bottom: 10mm; left: 15mm; right: 15mm; }
      .lote-info { position: fixed; top: 5mm; right: 15mm; font-size: 8pt; color: #999; font-family: Arial, sans-serif; z-index: 9999; }
      @media print { .lote-info { display: none; } .termo-page { page-break-after: always; page-break-inside: avoid; } .termo-page:last-child { page-break-after: auto; } }
      @media screen {
        body { background: #e5e7eb; padding: 20px; }
        .termo-page { background: white; padding: 15mm; margin: 0 auto 20px; max-width: 210mm; min-height: 297mm; box-shadow: 0 4px 20px rgba(0,0,0,0.15); border-radius: 4px; }
        .termo-page .rodape { position: absolute; bottom: 10mm; left: 15mm; right: 15mm; }
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