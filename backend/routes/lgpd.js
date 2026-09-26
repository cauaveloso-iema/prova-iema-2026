// routes/lgpd.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

const TermoVisita = require('../models/TermoVisita');
const ConsentimentoLGPD = require('../models/ConsentimentoLGPD');
const AuditoriaVisita = require('../models/AuditoriaVisita');
const { hash } = require('../utils/crypto-utils');

// ============================================
// HEALTH CHECK
// ============================================
router.get('/health', (req, res) => {
  res.json({ success: true, service: 'LGPD - Direitos do Titular' });
});

// ============================================
// 1. DIREITO DE ACESSO (Art. 18, II)
// ============================================
router.post('/solicitar-acesso', async (req, res) => {
  try {
    const { cpf, email } = req.body;
    
    if (!cpf && !email) {
      return res.status(400).json({ 
        success: false, 
        error: 'Informe CPF ou email para localizar seus dados' 
      });
    }
    
    console.log('📋 [LGPD] Solicitação de acesso recebida');
    
    const filtros = [];
    if (cpf) {
      filtros.push({ 'titular.cpfHash': hash(String(cpf).replace(/\D/g, '')) });
    }
    if (email) {
      filtros.push({ 'titular.email': email });
    }
    
    const consentimentos = await ConsentimentoLGPD.find({
      $or: filtros
    }).select('-titular.cpf -titular.telefone -assinaturaBase64').lean();
    
    const termosFiltro = [];
    if (cpf) {
      termosFiltro.push({ 'responsaveis.cpfHash': hash(String(cpf).replace(/\D/g, '')) });
    }
    if (email) {
      termosFiltro.push({ 'responsaveis.email': email });
    }
    
    const termos = await TermoVisita.find({
      $or: termosFiltro.length > 0 ? termosFiltro : [{}]
    }).select('codigo atividade alunos.nome dataVisita local responsaveis.nome responsaveis.status responsaveis.lgpdAceito responsaveis.lgpdAceitoData responsaveis.cpfHash responsaveis.email').lean();
    
    // Auditoria manual
    try {
      await AuditoriaVisita.create({
        usuarioId: null,
        usuarioNome: 'TITULAR-SOLICITACAO',
        usuarioRole: 'titular',
        acao: 'acessou_dados_sensiveis',
        dadosAcessados: ['proprios_dados'],
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        sucesso: true
      });
    } catch (e) {}
    
    const meusDados = [];
    
    for (const termo of termos) {
      const meuRegistro = (termo.responsaveis || []).find(r => {
        if (cpf && r.cpfHash === hash(String(cpf).replace(/\D/g, ''))) return true;
        if (email && r.email === email) return true;
        return false;
      });
      
      if (meuRegistro) {
        meusDados.push({
          termo: {
            codigo: termo.codigo,
            atividade: termo.atividade,
            dataVisita: termo.dataVisita,
            local: termo.local,
            alunos: (termo.alunos || []).map(a => a.nome)
          },
          meuRegistro: {
            nome: meuRegistro.nome,
            status: meuRegistro.status,
            lgpdAceito: meuRegistro.lgpdAceito,
            lgpdAceitoData: meuRegistro.lgpdAceitoData
          }
        });
      }
    }
    
    console.log(`✅ [LGPD] ${meusDados.length} registro(s) encontrado(s)`);
    
    res.json({
      success: true,
      message: 'Dados localizados.',
      totalConsentimentos: consentimentos.length,
      totalTermos: meusDados.length,
      dados: meusDados,
      direitos: {
        acesso: 'Você pode solicitar acesso aos dados a qualquer momento',
        correcao: 'Você pode solicitar correção de dados incompletos',
        exclusao: 'Você pode solicitar exclusão de dados desnecessários',
        portabilidade: 'Você pode solicitar portabilidade dos dados',
        revogacao: 'Você pode revogar o consentimento a qualquer momento'
      },
      contatoDPO: process.env.DPO_EMAIL || 'dpo@iemasaoluiscentro.net'
    });
    
  } catch (error) {
    console.error('❌ [LGPD] Erro:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 2. DIREITO DE RETIFICAÇÃO (Art. 18, III)
// ============================================
router.post('/solicitar-correcao', async (req, res) => {
  try {
    const { cpf, email, campo, valorAtual, valorCorreto, motivo } = req.body;
    
    if ((!cpf && !email) || !campo || !valorCorreto) {
      return res.status(400).json({ 
        success: false, 
        error: 'Dados incompletos. Informe CPF/email, campo e valor correto.' 
      });
    }
    
    try {
      await AuditoriaVisita.create({
        usuarioId: null,
        usuarioNome: 'TITULAR-CORRECAO',
        usuarioRole: 'titular',
        acao: 'editou',
        dadosAcessados: [campo],
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        sucesso: true,
        metadata: { campo, valorAtual, valorCorreto, motivo }
      });
    } catch (e) {}
    
    res.json({
      success: true,
      message: 'Solicitação de correção registrada. Você receberá retorno em até 15 dias.',
      contatoDPO: process.env.DPO_EMAIL || 'dpo@iemasaoluiscentro.net'
    });
    
  } catch (error) {
    console.error('❌ [LGPD] Erro:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 3. DIREITO DE ELIMINAÇÃO (Art. 18, VI)
// ============================================
router.post('/solicitar-exclusao', async (req, res) => {
  try {
    const { cpf, email, motivo } = req.body;
    
    if (!cpf && !email) {
      return res.status(400).json({ success: false, error: 'Informe CPF ou email' });
    }
    
    try {
      await AuditoriaVisita.create({
        usuarioId: null,
        usuarioNome: 'TITULAR-EXCLUSAO',
        usuarioRole: 'titular',
        acao: 'excluiu',
        dadosAcessados: ['todos_dados_pessoais'],
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        sucesso: true,
        metadata: { motivo: motivo || 'Não informado' }
      });
    } catch (e) {}
    
    res.json({
      success: true,
      message: 'Solicitação de exclusão registrada. Processaremos em até 15 dias.',
      observacao: 'Alguns dados podem ser mantidos por obrigação legal.',
      contatoDPO: process.env.DPO_EMAIL || 'dpo@iemasaoluiscentro.net'
    });
    
  } catch (error) {
    console.error('❌ [LGPD] Erro:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 4. REVOGAÇÃO DE CONSENTIMENTO (Art. 18, IX)
// ============================================
router.post('/revogar-consentimento', async (req, res) => {
  try {
    const { cpf, email, termoId } = req.body;
    
    if (!cpf && !email) {
      return res.status(400).json({ success: false, error: 'Informe CPF ou email' });
    }
    
    const filtros = [];
    if (cpf) filtros.push({ 'titular.cpfHash': hash(String(cpf).replace(/\D/g, '')) });
    if (email) filtros.push({ 'titular.email': email });
    if (termoId) filtros.push({ termoId });
    
    const resultado = await ConsentimentoLGPD.updateMany(
      { $or: filtros, status: 'ativo' },
      { 
        $set: { 
          status: 'revogado',
          revogadoEm: new Date(),
          motivoRevogacao: 'Solicitado pelo titular'
        }
      }
    );
    
    res.json({
      success: true,
      message: `${resultado.modifiedCount} consentimento(s) revogado(s).`,
      contatoDPO: process.env.DPO_EMAIL || 'dpo@iemasaoluiscentro.net'
    });
    
  } catch (error) {
    console.error('❌ [LGPD] Erro:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 5. INFO SOBRE POLÍTICA
// ============================================
router.get('/politica', (req, res) => {
  res.json({
    success: true,
    versao: process.env.LGPD_VERSAO || '1.0',
    dpo: {
      nome: process.env.DPO_NOME || 'Encarregado de Proteção de Dados',
      email: process.env.DPO_EMAIL || 'dpo@iemasaoluiscentro.net'
    },
    retencao: {
      anos: parseInt(process.env.RETENCAO_VISITAS_ANOS || '2'),
      descricao: 'Dados são anonimizados automaticamente após o período de retenção'
    },
    baseLegal: 'LGPD - Lei nº 13.709/2018'
  });
});

module.exports = router;