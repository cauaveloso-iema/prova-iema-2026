/* ============================================================================
   frontend/js/passkey-registro.js
   Registro de passkey durante a inscrição.
   Não faz autenticação — só cria a credencial e envia ao servidor.
   ============================================================================ */
'use strict';

const PASSKEY_API = '/api/inscricoes/passkeys';

function b64urlParaBuf(b64url) {
    const s = String(b64url).replace(/-/g, '+').replace(/_/g, '/');
    const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
    const bin = atob(s + pad);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return buf;
}

function bufParaB64url(buf) {
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Registra uma passkey para o responsável.
 * @param {Object} params
 * @param {String} params.cpf           CPF do responsável (11 dígitos)
 * @param {String} params.nome          Nome do responsável
 * @param {String} [params.inscricaoId] ID da inscrição (opcional)
 * @returns {Promise<{credentialId: string}>}
 */
async function registrarPasskey({ cpf, nome, inscricaoId }) {
    if (!window.PublicKeyCredential) {
        throw new Error('Este navegador não suporta passkey.');
    }

    // 1. Inicia o cadastro no servidor
    const respInicio = await fetch(`${PASSKEY_API}/registrar/iniciar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cpf, nome })
    });
    const dataInicio = await respInicio.json();
    if (!dataInicio.success) throw new Error(dataInicio.error || 'Falha ao iniciar cadastro.');

    const o = dataInicio.opcoes;

    // 2. Converte opções para o formato do navegador
    const publicKey = {
        challenge: b64urlParaBuf(o.challenge),
        rp: o.rp,
        user: {
            id: b64urlParaBuf(o.user.id),
            name: o.user.name,
            displayName: o.user.displayName
        },
        pubKeyCredParams: o.pubKeyCredParams,
        authenticatorSelection: o.authenticatorSelection,
        timeout: o.timeout,
        attestation: o.attestation
    };

    // 3. Chama o navegador (o gerenciador de senhas do celular entra aqui)
    let cred;
    try {
        cred = await navigator.credentials.create({ publicKey });
    } catch (err) {
        const nome = err && err.name ? err.name : '';
        if (nome === 'NotAllowedError') {
            throw new Error('Cadastro cancelado ou tempo esgotado. Tente novamente.');
        }
        if (nome === 'InvalidStateError') {
            throw new Error('Este dispositivo já possui uma passkey para este CPF. Use outra conta ou dispositivo.');
        }
        if (nome === 'ConstraintError') {
            throw new Error('O gerenciador de passkeys do dispositivo está cheio.');
        }
        throw new Error(err.message || 'Falha ao criar passkey.');
    }

    if (!cred) throw new Error('Cadastro cancelado.');

    // 4. Envia ao servidor para validar e salvar
    const payload = {
        cpf,
        nome,
        inscricaoId,
        credential: {
            id: cred.id,
            rawId: bufParaB64url(cred.rawId),
            type: cred.type,
            response: {
                clientDataJSON: bufParaB64url(cred.response.clientDataJSON),
                attestationObject: bufParaB64url(cred.response.attestationObject),
                transports: (cred.response.getTransports && cred.response.getTransports()) || []
            }
        }
    };

    const respFim = await fetch(`${PASSKEY_API}/registrar/concluir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    const dataFim = await respFim.json();
    if (!dataFim.success) throw new Error(dataFim.error || 'Falha ao salvar passkey.');

    return { credentialId: dataFim.credentialId };
}