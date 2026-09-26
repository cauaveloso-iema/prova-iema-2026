// middlewares/auditar.js
// ⚠️ Este arquivo NÃO importa models no topo — para evitar dependência circular

function auditar(acao, dadosAcessados = []) {
  return (req, res, next) => {
    req._auditoria = { acao, dadosAcessados };
    next();
  };
}

function auditarPublico(acao, dadosAcessados = []) {
  return auditar(acao, dadosAcessados);
}

async function registrarAuditoria(req, acao, dadosAcessados = [], termoInfo = {}) {
  try {
    // 🔥 Import DINÂMICO — só carrega o model quando a função roda
    const mongoose = require('mongoose');
    const AuditoriaVisita = mongoose.models.AuditoriaVisita 
      || require('../models/AuditoriaVisita');
    
    await AuditoriaVisita.create({
      usuarioId: req.userId || null,
      usuarioNome: req.usuarioNome || 'PÚBLICO',
      usuarioRole: req.userRole || 'publico',
      acao,
      termoId: termoInfo.termoId || req.params?.id || null,
      termoCodigo: termoInfo.termoCodigo || null,
      dadosAcessados,
      ip: req.ip || req.headers['x-forwarded-for'] || 'unknown',
      userAgent: req.headers['user-agent'],
      recurso: req.originalUrl,
      metodo: req.method,
      sucesso: true
    });
  } catch (err) {
    console.warn('⚠️ Falha na auditoria:', err.message);
  }
}

module.exports = { auditar, auditarPublico, registrarAuditoria };