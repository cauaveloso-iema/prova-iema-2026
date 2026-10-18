// ============================================================================
// js/webauthn-client.js — Biometria WebAuthn (Frontend)
// ============================================================================

(function (global) {
  'use strict';

  function base64urlToBuffer(base64url) {
    if (!base64url) return new ArrayBuffer(0);
    if (base64url instanceof ArrayBuffer) return base64url;
    
    if (ArrayBuffer.isView(base64url)) {
      return base64url.buffer.slice(base64url.byteOffset, base64url.byteOffset + base64url.byteLength);
    }
    
    if (typeof base64url === 'string') {
      const pad = base64url.length % 4;
      const padded = base64url.replace(/-/g, '+').replace(/_/g, '/') + (pad ? '='.repeat(4 - pad) : '');
      const raw = atob(padded);
      const buf = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
      return buf.buffer;
    }
    
    return new Uint8Array(base64url).buffer;
  }

  function bufferToBase64url(buffer) {
    if (!buffer) return '';
    const bytes = ArrayBuffer.isView(buffer) ? new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength) : new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  async function isPlatformAuthenticatorAvailable() {
    if (!window.PublicKeyCredential) return false;
    try {
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch (_) {
      return false;
    }
  }

  function isSupported() {
    return !!(window.PublicKeyCredential && navigator.credentials);
  }

  function marcarDispositivoComBiometria(userId) {
    try {
      localStorage.setItem('webauthn_user_id', String(userId));
      localStorage.setItem('webauthn_available', 'true');
    } catch (_) {}
  }

  function desmarcarDispositivoComBiometria() {
    try {
      localStorage.removeItem('webauthn_user_id');
      localStorage.removeItem('webauthn_available');
    } catch (_) {}
  }

  function dispositivoTemBiometriaRegistrada(userId) {
    try {
      return localStorage.getItem('webauthn_available') === 'true' &&
             localStorage.getItem('webauthn_user_id') === String(userId);
    } catch (_) {
      return false;
    }
  }

  async function registrarBiometria(authToken, deviceLabel) {
    if (!isSupported()) throw new Error('Este dispositivo não suporta biometria');
    if (!(await isPlatformAuthenticatorAvailable())) throw new Error('Este dispositivo não tem leitor biométrico');

    const optRes = await fetch('/api/auth/webauthn/register-options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` }
    });
    const optData = await optRes.json();
    if (!optData.success) throw new Error(optData.error || 'Erro ao obter opções');

    const options = optData.options;
    const publicKey = {
      ...options,
      challenge: base64urlToBuffer(options.challenge),
      user: { ...options.user, id: base64urlToBuffer(options.user.id) },
      excludeCredentials: (options.excludeCredentials || []).map(c => ({ ...c, id: base64urlToBuffer(c.id) }))
    };

    const credential = await navigator.credentials.create({ publicKey });
    if (!credential) throw new Error('Registro cancelado');

    const payload = {
      credential: {
        id: credential.id,
        rawId: bufferToBase64url(credential.rawId),
        type: credential.type,
        response: {
          clientDataJSON: bufferToBase64url(credential.response.clientDataJSON),
          attestationObject: bufferToBase64url(credential.response.attestationObject),
          transports: credential.response.getTransports ? credential.response.getTransports() : []
        },
        clientExtensionResults: credential.getClientExtensionResults ? credential.getClientExtensionResults() : {},
        authenticatorAttachment: credential.authenticatorAttachment || 'platform'
      },
      deviceLabel: deviceLabel || null
    };

    const verifyRes = await fetch('/api/auth/webauthn/register-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
      body: JSON.stringify(payload)
    });
    const verifyData = await verifyRes.json();
    if (!verifyData.success) throw new Error(verifyData.error || 'Verificação de registro falhou');

    try {
      const payloadJwt = JSON.parse(atob(authToken.split('.')[1]));
      if (payloadJwt && payloadJwt.id) marcarDispositivoComBiometria(payloadJwt.id);
    } catch (_) {}

    return verifyData;
  }

  async function autenticarComBiometria(tempToken2FA) {
    if (!isSupported()) throw new Error('Este dispositivo não suporta biometria');

    const optRes = await fetch('/api/auth/webauthn/authenticate-options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tempToken2FA}` }
    });
    const optData = await optRes.json();
    if (!optData.success) {
      const err = new Error(optData.error || 'Erro ao obter opções');
      err.codigo = optData.codigo || null;
      throw err;
    }

    const options = optData.options;
    const publicKey = {
      ...options,
      challenge: base64urlToBuffer(options.challenge),
      allowCredentials: (options.allowCredentials || []).map(c => ({ ...c, id: base64urlToBuffer(c.id) }))
    };

    const assertion = await navigator.credentials.get({ publicKey });
    if (!assertion) throw new Error('Autenticação cancelada');

    const payload = {
      credential: {
        id: assertion.id,
        rawId: bufferToBase64url(assertion.rawId),
        type: assertion.type,
        response: {
          clientDataJSON: bufferToBase64url(assertion.response.clientDataJSON),
          authenticatorData: bufferToBase64url(assertion.response.authenticatorData),
          signature: bufferToBase64url(assertion.response.signature),
          userHandle: assertion.response.userHandle ? bufferToBase64url(assertion.response.userHandle) : null
        },
        clientExtensionResults: assertion.getClientExtensionResults ? assertion.getClientExtensionResults() : {},
        authenticatorAttachment: assertion.authenticatorAttachment || 'platform'
      }
    };

    const verifyRes = await fetch('/api/auth/webauthn/authenticate-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${tempToken2FA}` },
      body: JSON.stringify(payload)
    });
    const verifyData = await verifyRes.json();
    if (!verifyData.success) throw new Error(verifyData.error || 'Verificação biométrica falhou');

    return verifyData;
  }

  global.WebAuthnClient = {
    isSupported,
    isPlatformAuthenticatorAvailable,
    registrarBiometria,
    autenticarComBiometria,
    dispositivoTemBiometriaRegistrada,
    marcarDispositivoComBiometria,
    desmarcarDispositivoComBiometria,
    base64urlToBuffer,
    bufferToBase64url
  };

})(window);