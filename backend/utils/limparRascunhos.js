// ============================================================================
// utils/limparRascunhos.js
// Worker de limpeza de rascunhos de provas expirados.
//
// REGRA:
//   Remove provas com `publicada: false` e `expiraEm <= agora`.
//   Provas publicadas NUNCA são removidas (mesmo que `expiraEm` exista).
//
// EXECUÇÃO:
//   - Roda a cada 10 minutos.
//   - Primeira execução 1min após o Mongo conectar.
//   - Também pode ser chamado manualmente (limparRascunhosExpirados()).
// ============================================================================
const mongoose = require('mongoose');

let logger;
try {
  logger = require('./logger');
} catch (err) {
  logger = console;
}

const INTERVALO_MS = 10 * 60 * 1000; // 10 minutos
let timer = null;
let primeiraExecucaoAgendada = false;

// ============================================================================
// Limpeza principal
// ============================================================================
async function limparRascunhosExpirados() {
  try {
    const Prova = mongoose.models.Prova || mongoose.model('Prova');
    const agora = new Date();

    // Só remove rascunhos cujo prazo já passou
    const resultado = await Prova.deleteMany({
      publicada: false,
      expiraEm: { $ne: null, $lte: agora }
    });

    if (resultado.deletedCount > 0) {
      logger.info(
        `🧹 [limparRascunhos] ${resultado.deletedCount} rascunho(s) expirado(s) removido(s) em ${agora.toISOString()}`
      );
    } else {
      logger.debug?.('[limparRascunhos] Nenhum rascunho expirado encontrado');
    }

    return {
      success: true,
      removidos: resultado.deletedCount || 0,
      timestamp: agora.toISOString()
    };
  } catch (err) {
    logger.error('❌ [limparRascunhos] Erro ao limpar rascunhos:', err.message);
    return {
      success: false,
      removidos: 0,
      error: err.message,
      timestamp: new Date().toISOString()
    };
  }
}

// ============================================================================
// Agendador
// ============================================================================
function iniciarLimpezaRascunhos() {
  if (timer || primeiraExecucaoAgendada) {
    logger.warn('⚠️ [limparRascunhos] Worker já está em execução');
    return;
  }

  // Primeira execução: 1min após iniciar (dar tempo do Mongo conectar)
  primeiraExecucaoAgendada = true;
  setTimeout(async () => {
    primeiraExecucaoAgendada = false;
    await limparRascunhosExpirados();
  }, 60 * 1000);

  timer = setInterval(limparRascunhosExpirados, INTERVALO_MS);

  logger.info(
    `🧹 [limparRascunhos] Worker iniciado (intervalo: ${INTERVALO_MS / 60000}min)`
  );
}

function pararLimpezaRascunhos() {
  if (timer) {
    clearInterval(timer);
    timer = null;
    logger.info('🛑 [limparRascunhos] Worker parado');
  }
}

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
  iniciarLimpezaRascunhos,
  pararLimpezaRascunhos,
  limparRascunhosExpirados
};