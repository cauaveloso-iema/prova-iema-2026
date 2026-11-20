'use strict';

const crypto = require('crypto');

const PEPPER = process.env.INSCRICOES_HASH_PEPPER
    || process.env.JWT_SECRET
    || 'educapleno::inscricoes::pepper';

const RAW_ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || process.env.AUTH_ENCRYPTION_KEY || PEPPER;
const ENC_KEY = crypto.scryptSync(String(RAW_ENCRYPTION_KEY), 'educapleno::inscricoes::salt', 32);
const ENC_ALGO = 'aes-256-gcm';
const ENC_IV_LEN = 12;
const ENC_TAG_LEN = 16;

const soDigitos = (v) => String(v == null ? '' : v).replace(/\D+/g, '');

function hashCPF(cpf) {
    const d = soDigitos(cpf);
    if (d.length !== 11) return null;
    return crypto.createHmac('sha256', PEPPER).update(d).digest('hex');
}

function criptografar(valor) {
    if (valor == null) return valor;
    const texto = String(valor);
    if (texto === '') return texto;
    if (texto.startsWith('enc:v1:')) return texto;
    const iv = crypto.randomBytes(ENC_IV_LEN);
    const cipher = crypto.createCipheriv(ENC_ALGO, ENC_KEY, iv);
    const enc = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const payload = Buffer.concat([iv, tag, enc]).toString('base64');
    return `enc:v1:${payload}`;
}

/**
 * ⚠️ Se falhar (chave errada), loga e retorna ''.
 * O chamador (rotas) já usa o resultado em mascarar/formatar,
 * então '' produz '***' ou string vazia — nunca o ciphertext cru.
 */
function descriptografar(valor) {
    if (valor == null) return valor;
    const texto = String(valor);
    if (!texto.startsWith('enc:v1:')) return texto;
    try {
        const payload = Buffer.from(texto.slice('enc:v1:'.length), 'base64');
        const iv = payload.subarray(0, ENC_IV_LEN);
        const tag = payload.subarray(ENC_IV_LEN, ENC_IV_LEN + ENC_TAG_LEN);
        const enc = payload.subarray(ENC_IV_LEN + ENC_TAG_LEN);
        const decipher = crypto.createDecipheriv(ENC_ALGO, ENC_KEY, iv);
        decipher.setAuthTag(tag);
        const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
        return dec.toString('utf8');
    } catch (err) {
        console.error('❌ [SEGURANCA] Falha ao descriptografar (verifique ENCRYPTION_KEY):', err.message);
        return '';
    }
}

function mascararCPF(cpf) {
    const d = soDigitos(descriptografar(cpf));
    if (d.length !== 11) return d ? '***' : '';
    return `***.***.${d.slice(6, 9)}-${d.slice(9)}`;
}

function formatarCPF(cpf) {
    const d = soDigitos(descriptografar(cpf));
    if (d.length !== 11) return d;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function mascararTelefone(tel) {
    const d = soDigitos(descriptografar(tel));
    if (!d) return '';
    if (d.length >= 10) return `(${d.slice(0, 2)}) *****-${d.slice(-4)}`;
    return `*****-${d.slice(-4)}`;
}

function formatarTelefone(tel) {
    const d = soDigitos(descriptografar(tel));
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return d;
}

function formatarCEP(cep) {
    const d = soDigitos(descriptografar(cep));
    if (d.length !== 8) return d;
    return `${d.slice(0, 5)}-${d.slice(5)}`;
}

function validarCPF(cpf) {
    const d = soDigitos(cpf);
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
    let soma = 0;
    for (let i = 0; i < 9; i++) soma += Number(d[i]) * (10 - i);
    let dv1 = (soma * 10) % 11;
    if (dv1 === 10) dv1 = 0;
    if (dv1 !== Number(d[9])) return false;
    soma = 0;
    for (let i = 0; i < 10; i++) soma += Number(d[i]) * (11 - i);
    let dv2 = (soma * 10) % 11;
    if (dv2 === 10) dv2 = 0;
    return dv2 === Number(d[10]);
}

function gerarProtocolo(anoLetivo) {
    const ano = Number(anoLetivo) || new Date().getFullYear();
    const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `INS-${ano}-${rand}`;
}

function texto(v, max = 255) {
    if (v == null) return '';
    return String(v).replace(/\s+/g, ' ').trim().slice(0, max);
}

function textoLongo(v, max = 4000) {
    if (v == null) return '';
    return String(v).trim().slice(0, max);
}

function booleano(v, padrao = false) {
    if (v === true || v === 'true' || v === 1 || v === '1' || v === 'sim') return true;
    if (v === false || v === 'false' || v === 0 || v === '0' || v === 'nao' || v === 'não') return false;
    return padrao;
}

function numero(v, padrao = 0) {
    if (v === '' || v == null) return padrao;
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : padrao;
}

function paraData(v) {
    if (!v) return null;
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
    const s = String(v).trim();
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m) {
        const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
        return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
}

function escaparRegex(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
    soDigitos, hashCPF, criptografar, descriptografar,
    mascararCPF, formatarCPF, mascararTelefone, formatarTelefone, formatarCEP,
    validarCPF, gerarProtocolo, texto, textoLongo, booleano, numero, paraData, escaparRegex
};