// ============================================================
// user-storage.js — Helper para salvar user_data com segurança LGPD
// ============================================================
// Uso: chamar window.salvarUserDataSeguro(user) em qualquer lugar
//      que hoje faz localStorage.setItem('user_data', JSON.stringify(user))
//
// Isso garante que CPF, senha, tokens 2FA NUNCA sejam salvos no navegador.
// ============================================================
(function () {
  'use strict';

  // Campos que NUNCA devem ser salvos no localStorage (LGPD + segurança)
  const CAMPOS_SENSIVEIS = [
    'cpf',
    'password',
    'senha',
    'pwd',
    'twoFactorSecret',
    'twoFactorBackupCodes',
    'twoFactorTempSecret',
    'twoFactorSecretSms',
    'twoFactorBackupCodesPlain',
    'resetPasswordToken',
    'resetPasswordExpires'
  ];

  /**
   * Remove campos sensíveis de um objeto user.
   * @param {Object} user
   * @returns {Object} objeto limpo (novo)
   */
  function sanitizarUserData(user) {
    if (!user || typeof user !== 'object') return {};
    const safe = { ...user };
    for (const campo of CAMPOS_SENSIVEIS) {
      delete safe[campo];
    }
    return safe;
  }

  /**
   * Salva user_data no localStorage SEM dados sensíveis.
   * @param {Object} user
   * @returns {boolean} true se salvou
   */
  function salvarUserDataSeguro(user) {
    try {
      const safe = sanitizarUserData(user);
      localStorage.setItem('user_data', JSON.stringify(safe));
      return true;
    } catch (e) {
      console.error('❌ [user-storage] Erro ao salvar user_data:', e);
      return false;
    }
  }

  /**
   * Lê user_data do localStorage já sanitizado.
   * (Também limpa caso o valor armazenado tenha campos sensíveis de versões antigas)
   * @returns {Object|null}
   */
  function lerUserDataSeguro() {
    try {
      const raw = localStorage.getItem('user_data');
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;

      let mudou = false;
      for (const campo of CAMPOS_SENSIVEIS) {
        if (campo in parsed) {
          delete parsed[campo];
          mudou = true;
        }
      }
      if (mudou) {
        localStorage.setItem('user_data', JSON.stringify(parsed));
        console.log('🔒 [user-storage] user_data higienizado automaticamente');
      }
      return parsed;
    } catch (e) {
      console.error('❌ [user-storage] Erro ao ler user_data:', e);
      return null;
    }
  }

  /**
   * Migração: limpa CPF e outros campos sensíveis do user_data já salvo.
   * Rodar no boot de qualquer página autenticada.
   */
  function migrarUserDataAntigo() {
    try {
      const raw = localStorage.getItem('user_data');
      if (!raw) return;

      const user = JSON.parse(raw);
      if (!user || typeof user !== 'object') return;

      let alterado = false;
      for (const campo of CAMPOS_SENSIVEIS) {
        if (campo in user) {
          delete user[campo];
          alterado = true;
        }
      }
      if (alterado) {
        localStorage.setItem('user_data', JSON.stringify(user));
        console.log('🔒 [user-storage] user_data antigo higienizado (LGPD)');
      }
    } catch (e) {
      // silencioso — não pode quebrar a página por isso
    }
  }

  // Expõe globalmente
  window.sanitizarUserData = sanitizarUserData;
  window.salvarUserDataSeguro = salvarUserDataSeguro;
  window.lerUserDataSeguro = lerUserDataSeguro;
  window.migrarUserDataAntigo = migrarUserDataAntigo;

  // Executa migração imediatamente ao carregar
  migrarUserDataAntigo();

  console.log('✅ [user-storage] Helper LGPD carregado');
})();