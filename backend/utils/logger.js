// backend/utils/logger.js
// ============================================================================
// LOGGER CENTRALIZADO - EducaPleno
// ============================================================================
// Em desenvolvimento: mostra TUDO (info, success, warn, error, debug)
// Em produção: mostra apenas warn e error
//
// Variáveis de ambiente:
//   NODE_ENV=development|production
//   DEBUG_LOGS=true|false
// ============================================================================

const AMBIENTE = process.env.NODE_ENV || 'development';
const DEBUG = process.env.DEBUG_LOGS === 'true' || AMBIENTE === 'development';

const cores = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

const logger = {
  // ℹ️ Informativo — só em dev
  info: (msg, ...args) => {
    if (DEBUG) console.log(`${cores.cyan}ℹ️${cores.reset}`, msg, ...args);
  },

  // ✅ Sucesso — só em dev
  success: (msg, ...args) => {
    if (DEBUG) console.log(`${cores.green}✅${cores.reset}`, msg, ...args);
  },

  // ⚠️ Aviso — SEMPRE aparece (mesmo em produção)
  warn: (msg, ...args) => {
    console.warn(`${cores.yellow}⚠️${cores.reset}`, msg, ...args);
  },

  // ❌ Erro — SEMPRE aparece
  error: (msg, ...args) => {
    console.error(`${cores.red}❌${cores.reset}`, msg, ...args);
  },

  // 🔍 Debug detalhado — só em dev
  debug: (msg, ...args) => {
    if (DEBUG) console.log(`${cores.gray}🔍${cores.reset}`, msg, ...args);
  }
};

module.exports = logger;