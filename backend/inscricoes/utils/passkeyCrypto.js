// ============================================================================
// backend/inscricoes/utils/passkeyCrypto.js
//
// Extrai a chave pública da attestationObject (cadastro de passkey).
// Verifica assinatura da assertion (autenticação de passkey).
// Só suporta attestation "none" (que é o que usamos no frontend).
// ============================================================================
'use strict';

const crypto = require('crypto');

function b64urlDecode(str) {
    if (!str) return Buffer.alloc(0);
    const s = String(str).replace(/-/g, '+').replace(/_/g, '/');
    const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
    return Buffer.from(s + pad, 'base64');
}

function b64urlEncode(buf) {
    return Buffer.from(buf).toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sha256(buf) {
    return crypto.createHash('sha256').update(buf).digest();
}

// ----------------------------------------------------------------------------
// CBOR decoder mínimo
// ----------------------------------------------------------------------------
function decodificarCBOR(buf) {
    let offset = 0;

    function readByte() { return buf[offset++]; }
    function readBytes(n) { const b = buf.subarray(offset, offset + n); offset += n; return b; }

    function readLength(additional) {
        if (additional < 24) return additional;
        if (additional === 24) return readByte();
        if (additional === 25) { const v = buf.readUInt16BE(offset); offset += 2; return v; }
        if (additional === 26) { const v = buf.readUInt32BE(offset); offset += 4; return v; }
        throw new Error('CBOR: length não suportado: ' + additional);
    }

    function readItem() {
        const initial = readByte();
        const major = initial >> 5;
        const additional = initial & 0x1f;

        if (major === 0) return readLength(additional);
        if (major === 1) return -1 - readLength(additional);
        if (major === 2) { const len = readLength(additional); return readBytes(len); }
        if (major === 3) { const len = readLength(additional); return readBytes(len).toString('utf8'); }
        if (major === 4) {
            const len = readLength(additional);
            const arr = [];
            for (let i = 0; i < len; i++) arr.push(readItem());
            return arr;
        }
        if (major === 5) {
            const len = readLength(additional);
            const obj = {};
            for (let i = 0; i < len; i++) {
                const k = readItem();
                const v = readItem();
                obj[k] = v;
            }
            return obj;
        }
        if (major === 6) { readLength(additional); return readItem(); }
        if (major === 7) {
            if (additional === 20) return false;
            if (additional === 21) return true;
            if (additional === 22) return null;
            return null;
        }
        throw new Error('CBOR: major não suportado: ' + major);
    }

    return readItem();
}

// ----------------------------------------------------------------------------
// COSE → JWK
// ----------------------------------------------------------------------------
function coseParaJwk(coseBuf) {
    const cose = decodificarCBOR(coseBuf);
    const kty = cose[1];
    const alg = cose[3];

    if (kty === 2) {
        const crv = cose[-1];
        const x = cose[-2];
        const y = cose[-3];
        if (crv !== 1) throw new Error('Curva EC não suportada: ' + crv);
        return { kty: 'EC', crv: 'P-256', x: b64urlEncode(x), y: b64urlEncode(y), alg };
    }
    if (kty === 3) {
        const n = cose[-1];
        const e = cose[-2];
        return { kty: 'RSA', n: b64urlEncode(n), e: b64urlEncode(e), alg };
    }
    throw new Error('Tipo de chave COSE não suportado: ' + kty);
}

// ----------------------------------------------------------------------------
// Extrai chave pública da attestationObject
// ----------------------------------------------------------------------------
function extrairChavePublicaDaAttestation(attestationObjectB64) {
    const buf = b64urlDecode(attestationObjectB64);
    const att = decodificarCBOR(buf);

    if (att.fmt !== 'none') {
        throw new Error('Attestation fmt não suportado: ' + att.fmt);
    }

    const authData = att.authData;
    if (!authData || authData.length < 55) throw new Error('authData muito curto.');

    const flags = authData[32];
    const hasAttestedCredentialData = (flags & 0x40) !== 0;
    if (!hasAttestedCredentialData) throw new Error('authData sem attestedCredentialData.');

    const aaguid = authData.subarray(37, 53).toString('hex');
    const credIdLen = authData.readUInt16BE(53);
    const credentialId = authData.subarray(55, 55 + credIdLen);
    const publicKeyCose = authData.subarray(55 + credIdLen);

    const jwk = coseParaJwk(publicKeyCose);

    return {
        credentialId: b64urlEncode(credentialId),
        publicKeyJwk: jwk,
        aaguid,
        alg: jwk.alg
    };
}

// ----------------------------------------------------------------------------
// Challenge
// ----------------------------------------------------------------------------
function gerarChallenge() {
    return b64urlEncode(crypto.randomBytes(32));
}

// ----------------------------------------------------------------------------
// 🆕 Verifica a assinatura de uma assertion WebAuthn (autenticação)
// ----------------------------------------------------------------------------
/**
 * @param {Object} params
 * @param {Object} params.publicKeyJwk   JWK salva no cadastro
 * @param {String} params.clientDataJSON base64url
 * @param {String} params.authenticatorData base64url
 * @param {String} params.signature      base64url
 * @returns {Boolean}
 */
function verificarAssertion({ publicKeyJwk, clientDataJSON, authenticatorData, signature }) {
    try {
        const clientDataHash = crypto
            .createHash('sha256')
            .update(b64urlDecode(clientDataJSON))
            .digest();

        const authData = b64urlDecode(authenticatorData);
        const sig = b64urlDecode(signature);

        // signedData = authenticatorData || SHA256(clientDataJSON)
        const signedData = Buffer.concat([authData, clientDataHash]);

        const key = crypto.createPublicKey({ key: publicKeyJwk, format: 'jwk' });

        // ES256 (-7) ou RS256 (-257)
        if (publicKeyJwk.alg === -257) {
            return crypto.verify('RSA-SHA256', signedData, key, sig);
        }
        return crypto.verify('sha256', signedData, { key, dsaEncoding: 'der' }, sig);
    } catch (err) {
        console.error('❌ [PASSKEY-CRYPTO] verificarAssertion falhou:', err.message);
        return false;
    }
}

module.exports = {
    b64urlDecode,
    b64urlEncode,
    extrairChavePublicaDaAttestation,
    gerarChallenge,
    sha256,
    verificarAssertion
};