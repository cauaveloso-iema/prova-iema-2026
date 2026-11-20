// ============================================================================
// backend/inscricoes/routes/passkeys-auth.js
// Autenticação por WebAuthn (passkey) — usada por qualquer processo do sistema
// ============================================================================
'use strict';

const express = require('express');
const router = express.Router();

const PasskeyCredencial = require('../models/PasskeyCredencial');
const Formulario = require('../models/Formulario');
const passkeyCrypto = require('../utils/passkeyCrypto');
const { soDigitos, hashCPF } = require('../utils/seguranca');

// Cache em memória dos challenges de autenticação (TTL 5 min)
const challenges = new Map();
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

const _timer = setInterval(() => {
    const agora = Date.now();
    for (const [k, v] of challenges.entries()) {
        if (agora - v.criadoEm > CHALLENGE_TTL_MS) challenges.delete(k);
    }
}, 60 * 1000);
if (_timer.unref) _timer.unref();

function obterRpId(req) {
    return process.env.WEBAUTHN_RP_ID || req.headers.host?.split(':')[0] || 'localhost';
}

function obterOrigin(req) {
    return process.env.WEBAUTHN_ORIGIN || `${req.protocol}://${req.headers.host}`;
}

function criarChallenge(chave) {
    const challenge = passkeyCrypto.gerarChallenge();
    challenges.set(chave, { challenge, criadoEm: Date.now() });
    return challenge;
}

function consumirChallenge(chave) {
    const reg = challenges.get(chave);
    if (!reg) return null;
    challenges.delete(chave);
    if (Date.now() - reg.criadoEm > CHALLENGE_TTL_MS) return null;
    return reg.challenge;
}

// ============================================================================
// GET /publica/disponivel — o frontend pergunta se há passkey ativa
// ============================================================================
router.get('/publica/disponivel', async (req, res) => {
    try {
        const { alunoId, nome, cpf } = req.query;

        if (!alunoId && !nome && !cpf) {
            return res.status(400).json({ success: false, error: 'Informe alunoId, nome ou cpf.' });
        }

        const condicoes = [];

        // Tenta pelo ID (se estiver correto, acha rápido)
        if (alunoId) {
            condicoes.push({ matriculaId: alunoId });
        }

        // 🔥 PLANO B: Tenta pelo Nome exato (garante que acha o NICHOLAS)
        if (nome) {
            const nomeLimpo = nome.trim();
            condicoes.push({ alunoNome: new RegExp('^' + nomeLimpo + '$', 'i') });
        }

        // Tenta pelo CPF do responsável
        if (cpf) {
            const d = soDigitos(cpf);
            if (d.length === 11) {
                condicoes.push({ responsavelCpfHash: hashCPF(d) });
            }
        }

        const filtro = { ativo: true };
        if (condicoes.length > 0) filtro.$or = condicoes;

        const credenciais = await PasskeyCredencial.find(filtro).lean();

        console.log(`🔍 [PASSKEY] Busca -> ID: ${alunoId} | Nome: ${nome} | Achou: ${credenciais.length}`);

        res.json({
            success: true,
            disponivel: credenciais.length > 0,
            total: credenciais.length,
            credenciais
        });
    } catch (err) {
        console.error('❌ Erro:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================================================
// POST /autenticar/iniciar
// ============================================================================
router.post('/autenticar/iniciar', async (req, res) => {
    try {
        const { cpf, matriculaId, inscricaoId, escopo, nome } = req.body || {};

        let filtro = { ativo: true };
        let chaveBusca = null;

        if (cpf) {
            const d = soDigitos(cpf);
            if (d.length !== 11) return res.status(400).json({ success: false, error: 'CPF inválido.' });
            filtro.responsavelCpfHash = hashCPF(d);
            chaveBusca = filtro.responsavelCpfHash;
        } else if (matriculaId) {
            filtro.matriculaId = matriculaId;
            chaveBusca = matriculaId;
        } else if (inscricaoId) {
            filtro.inscricaoId = inscricaoId;
            chaveBusca = inscricaoId;
        } else if (nome) {
            // 🔥 Fallback por nome (mesma lógica do /publica/disponivel)
            filtro.alunoNome = new RegExp('^' + nome.trim() + '$', 'i');
            chaveBusca = 'nome:' + nome.trim();
        } else {
            return res.status(400).json({
                success: false,
                error: 'Informe CPF, matriculaId, inscricaoId ou nome.'
            });
        }

        // Escopo opcional
        if (escopo === 'matricula') filtro.matriculaId = { $ne: null };
        else if (escopo === 'inscricao') filtro.inscricaoId = { $ne: null };

        let credenciais = await PasskeyCredencial.find(filtro)
            .select('credentialId transports')
            .lean();

        // 🔥 PLANO B: se buscou por matriculaId e não achou, tenta por nome
        if (!credenciais.length && matriculaId && nome) {
            const filtroNome = {
                ativo: true,
                alunoNome: new RegExp('^' + nome.trim() + '$', 'i')
            };
            credenciais = await PasskeyCredencial.find(filtroNome)
                .select('credentialId transports')
                .lean();
            if (credenciais.length) chaveBusca = 'nome:' + nome.trim();
        }

        if (!credenciais.length) {
            return res.status(404).json({
                success: false,
                error: escopo === 'matricula'
                    ? 'Nenhuma biometria vinculada à matrícula.'
                    : escopo === 'inscricao'
                        ? 'Nenhuma biometria vinculada à inscrição.'
                        : 'Nenhuma biometria ativa encontrada.'
            });
        }

        const chave = `auth:${chaveBusca}`;
        const challenge = criarChallenge(chave);

        res.json({
            success: true,
            opcoes: {
                challenge,
                rpId: obterRpId(req),
                allowCredentials: credenciais.map(c => ({
                    type: 'public-key',
                    id: c.credentialId,
                    transports: c.transports || []
                })),
                userVerification: 'required',
                timeout: 60000
            }
        });
    } catch (err) {
        console.error('❌ [PASSKEYS-AUTH] iniciar:', err);
        res.status(500).json({ success: false, error: 'Falha ao iniciar autenticação.' });
    }
});

// ============================================================================
// POST /autenticar/concluir
// ============================================================================
router.post('/autenticar/concluir', async (req, res) => {
    try {
        const { cpf, matriculaId, inscricaoId, nome, credential } = req.body || {};

        if (!credential || !credential.id || !credential.response) {
            return res.status(400).json({ success: false, error: 'Credencial ausente.' });
        }

        const doc = await PasskeyCredencial.findOne({
            credentialId: credential.id,
            ativo: true
        });
        if (!doc) {
            return res.status(404).json({ success: false, error: 'Biometria não encontrada ou revogada.' });
        }

        // 🔥 Confere vínculo informado (defesa contra credentialId de outro usuário)
        let vinculoOk = false;

        if (matriculaId && String(doc.matriculaId) === String(matriculaId)) {
            vinculoOk = true;
        }
        if (inscricaoId && String(doc.inscricaoId) === String(inscricaoId)) {
            vinculoOk = true;
        }
        if (cpf) {
            const d = soDigitos(cpf);
            if (doc.responsavelCpfHash === hashCPF(d)) vinculoOk = true;
        }
        // 🔥 NOVO: validação por nome
        if (nome && doc.alunoNome) {
            const nomeDoc = doc.alunoNome.trim().toLowerCase();
            const nomeEnviado = nome.trim().toLowerCase();
            if (nomeDoc === nomeEnviado) vinculoOk = true;
        }

        // Se informou ALGUM vínculo e nenhum bateu, rejeita
        const informouVinculo = !!(matriculaId || inscricaoId || cpf || nome);
        if (informouVinculo && !vinculoOk) {
            return res.status(403).json({
                success: false,
                error: 'Credencial não pertence a este aluno/responsável.'
            });
        }

        // 🔥 Chave do challenge precisa ser a mesma usada no /iniciar
        let chave = null;
        if (doc.responsavelCpfHash) chave = `auth:${doc.responsavelCpfHash}`;
        else if (doc.matriculaId) chave = `auth:${doc.matriculaId}`;
        else if (doc.inscricaoId) chave = `auth:${doc.inscricaoId}`;
        else if (doc.alunoNome) chave = `auth:nome:${doc.alunoNome.trim()}`;
        else chave = `auth:${matriculaId || inscricaoId}`;

        const esperado = consumirChallenge(chave);
        if (!esperado) {
            return res.status(400).json({ success: false, error: 'Challenge expirado ou inválido.' });
        }

        const resp = credential.response;
        let clientData;
        try {
            clientData = JSON.parse(Buffer.from(resp.clientDataJSON, 'base64url').toString('utf8'));
        } catch (_) {
            return res.status(400).json({ success: false, error: 'clientDataJSON inválido.' });
        }

        if (clientData.type !== 'webauthn.get') {
            return res.status(400).json({ success: false, error: 'Tipo de cerimônia inválido.' });
        }
        if (clientData.challenge !== esperado) {
            return res.status(400).json({ success: false, error: 'Challenge não confere.' });
        }
        if (clientData.origin !== obterOrigin(req)) {
            return res.status(400).json({ success: false, error: 'Origin não confere.' });
        }

        const ok = passkeyCrypto.verificarAssertion({
            publicKeyJwk: doc.publicKeyJwk,
            clientDataJSON: resp.clientDataJSON,
            authenticatorData: resp.authenticatorData,
            signature: resp.signature
        });

        if (!ok) {
            return res.status(401).json({ success: false, error: 'Assinatura inválida.' });
        }

        doc.counter = (doc.counter || 0) + 1;
        doc.ultimoUsoEm = new Date();
        await doc.save();

        // Contexto retornado para o processo que chamou
        const contexto = { tipo: null, inscricao: null, matricula: null };

        if (doc.inscricaoId) {
            const insc = await Formulario.findById(doc.inscricaoId)
                .select('protocolo aluno.nomeCompleto status anoLetivo')
                .lean();
            if (insc) {
                contexto.tipo = 'inscricao';
                contexto.inscricao = {
                    id: String(insc._id),
                    protocolo: insc.protocolo,
                    aluno: insc.aluno?.nomeCompleto,
                    status: insc.status,
                    anoLetivo: insc.anoLetivo
                };
            }
        }

        if (doc.matriculaId) {
            contexto.tipo = contexto.tipo ? 'ambos' : 'matricula';
            contexto.matricula = {
                id: String(doc.matriculaId),
                aluno: doc.alunoNome,
                turma: doc.alunoTurma,
                curso: doc.alunoCurso
            };
        }

        res.json({
            success: true,
            autenticado: true,
            responsavel: { nome: doc.responsavelNome, cpfHash: doc.responsavelCpfHash },
            contexto,
            credentialId: doc.credentialId
        });
    } catch (err) {
        console.error('❌ [PASSKEYS-AUTH] concluir:', err);
        res.status(500).json({ success: false, error: 'Falha ao concluir autenticação.' });
    }
});

// ⚠️ APENAS PARA DIAGNÓSTICO - PODE APAGAR DEPOIS
router.get('/publica/debug', async (req, res) => {
    try {
        // Puxa as últimas 20 passkeys para não sobrecarregar
        const passkeys = await PasskeyCredencial.find({ ativo: true })
            .sort({ createdAt: -1 })
            .limit(20)
            .lean();
        res.json({ success: true, total: passkeys.length, passkeys });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;