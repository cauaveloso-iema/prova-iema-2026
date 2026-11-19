// ============================================================================
// backend/inscricoes/utils/biometriaCrypto.js
//
// Criptografia da biometria usando a MESMA ENCRYPTION_KEY do .env que o
// módulo seguranca.js usa para CPF/RG/NIS/email/telefone.
//
// - Deriva AES-256 via scrypt com salt próprio ("biometria")
// - Formato no Mongo: "enc:v1:<base64(iv|tag|ciphertext)>"
// - Suporta DOIS modos de entrada:
//     (a) payload em JSON claro vindo do navegador (modo simples)
//     (b) envelope híbrido RSA+AES (compatibilidade com front antigo)
//   Em ambos os casos, o que é gravado é SEMPRE cifrado pelo servidor.
//
// Não grava nada em disco. Não exige variáveis novas no .env.
// ============================================================================
'use strict';

const crypto = require('crypto');

// Mesma origem de chave do seguranca.js
const RAW_KEY = process.env.ENCRYPTION_KEY
    || process.env.AUTH_ENCRYPTION_KEY
    || process.env.INSCRICOES_HASH_PEPPER
    || process.env.JWT_SECRET
    || 'educapleno::inscricoes::pepper';

// Salt PRÓPRIO do módulo de biometria (separa do salt do seguranca.js)
const BIO_KEY = crypto.scryptSync(String(RAW_KEY), 'educapleno::biometria::salt', 32);

const ENC_ALGO    = 'aes-256-gcm';
const ENC_IV_LEN  = 12;
const ENC_TAG_LEN = 16;
const PREFIXO     = 'enc:v1:';

// ----------------------------------------------------------------------------
// Criptografia simétrica (AES-256-GCM)
// ----------------------------------------------------------------------------
function cifrar(textoPuro) {
    if (textoPuro == null) return '';
    const s = String(textoPuro);
    if (s === '') return '';
    if (s.startsWith(PREFIXO)) return s;

    const iv = crypto.randomBytes(ENC_IV_LEN);
    const cipher = crypto.createCipheriv(ENC_ALGO, BIO_KEY, iv);
    const enc = Buffer.concat([cipher.update(s, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return PREFIXO + Buffer.concat([iv, tag, enc]).toString('base64');
}

function decifrar(valor) {
    if (valor == null) return '';
    const s = String(valor);
    if (!s.startsWith(PREFIXO)) return s;

    try {
        const payload = Buffer.from(s.slice(PREFIXO.length), 'base64');
        const iv  = payload.subarray(0, ENC_IV_LEN);
        const tag = payload.subarray(ENC_IV_LEN, ENC_IV_LEN + ENC_TAG_LEN);
        const enc = payload.subarray(ENC_IV_LEN + ENC_TAG_LEN);
        const decipher = crypto.createDecipheriv(ENC_ALGO, BIO_KEY, iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
    } catch (_) {
        return '';
    }
}

// ----------------------------------------------------------------------------
// Compatibilidade com fluxo híbrido antigo (RSA+AES no navegador)
// ----------------------------------------------------------------------------
function decifrarEnvelopeHibrido({ iv, chaveAesCifrada, dadosCifrados }) {
    if (!iv || !chaveAesCifrada || !dadosCifrados) {
        throw new Error('Envelope de biometria incompleto.');
    }
    const aesRawB64 = decifrar(chaveAesCifrada);
    const aesRaw = Buffer.from(aesRawB64, 'base64');
    if (aesRaw.length !== 32) throw new Error('Chave AES do envelope inválida.');

    const ivBuf      = Buffer.from(iv, 'base64');
    const ctBuf      = Buffer.from(dadosCifrados, 'base64');
    const tag        = ctBuf.subarray(ctBuf.length - 16);
    const ciphertext = ctBuf.subarray(0, ctBuf.length - 16);

    const decipher = crypto.createDecipheriv('aes-256-gcm', aesRaw, ivBuf);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(plain.toString('utf8'));
}

// ----------------------------------------------------------------------------
// API pública usada pelas rotas
// ----------------------------------------------------------------------------

/**
 * Recebe o bloco `biometria` do corpo da requisição e devolve o objeto pronto
 * para salvar no Mongo (sempre com dadosCifrados no formato enc:v1:).
 */
function prepararParaSalvar(bodyBiometria, { ip, userAgent } = {}) {
    if (!bodyBiometria || !bodyBiometria.aceito) {
        return { aceito: false };
    }

    let credentialId = '';
    let payloadOriginal = null;

    // Modo híbrido (front antigo)
    if (bodyBiometria.iv && bodyBiometria.chaveAesCifrada && bodyBiometria.dadosCifrados) {
        payloadOriginal = decifrarEnvelopeHibrido(bodyBiometria);
        credentialId = payloadOriginal?.credential?.credentialId || '';
    }

    const payload = {
        credential: bodyBiometria.credential || payloadOriginal?.credential || null,
        responsavelCpf: bodyBiometria.responsavelCpf || payloadOriginal?.responsavelCpf || '',
        capturadoEm: bodyBiometria.capturadoEm || payloadOriginal?.capturadoEm || new Date().toISOString(),
        versaoTermo: bodyBiometria.versaoTermo || '1.0',
        origem: 'formulario-publico'
    };

    const dadosCifrados = cifrar(JSON.stringify(payload));

    return {
        aceito: true,
        versaoTermo: payload.versaoTermo,
        algoritmo: 'AES-256-GCM (server-side)',
        iv: '',
        chaveAesCifrada: '',
        dadosCifrados,
        capturadoEm: payload.capturadoEm ? new Date(payload.capturadoEm) : new Date(),
        credentialId,
        ip: ip || '',
        userAgent: userAgent || ''
    };
}

/**
 * Lê o bloco `biometria` já salvo e devolve o payload em claro (auditoria).
 */
function lerDoBanco(bio) {
    if (!bio || !bio.aceito || !bio.dadosCifrados) return null;
    try {
        return JSON.parse(decifrar(bio.dadosCifrados));
    } catch (_) {
        return null;
    }
}

/**
 * Compatibilidade: rota antiga chamava exportarChavePublicaJWK.
 * No modo simétrico não há chave pública — devolve um identificador.
 */
function exportarChavePublicaJWK() {
    return {
        kty: 'oct',
        kid: 'server-side-symmetric',
        alg: 'AES-256-GCM',
        use: 'enc',
        nota: 'Cifragem feita no servidor com a ENCRYPTION_KEY do .env.'
    };
}

function status() {
    try {
        const teste = cifrar('ping');
        const volta = decifrar(teste);
        return { ok: volta === 'ping', modo: 'simetrico', algoritmo: ENC_ALGO };
    } catch (e) {
        return { ok: false, erro: e.message };
    }
}

module.exports = {
    prepararParaSalvar,
    lerDoBanco,
    exportarChavePublicaJWK,
    decifrarEnvelopeHibrido,
    status,
    cifrar,
    decifrar
};