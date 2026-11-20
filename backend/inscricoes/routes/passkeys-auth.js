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

// Função helper para normalizar Base64URL (ignora +, /, =)
function normalizarB64Url(str) {
    if (!str) return '';
    return String(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function obterRpId(req) {
    return process.env.WEBAUTHN_RP_ID || req.headers.host?.split(':')[0] || 'localhost';
}

function obterOrigin(req) {
    return process.env.WEBAUTHN_ORIGIN || `${req.protocol}://${req.headers.host}`;
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

        // 🔥 GERA O CHALLENGE E SALVA NO BANCO DE DADOS
        const challenge = passkeyCrypto.gerarChallenge();
        const expiraEm = new Date(Date.now() + 5 * 60 * 1000); // 5 minutos

        // Atualiza todas as credenciais encontradas com o novo challenge
        const idsCredenciais = credenciais.map(c => c._id);
        await PasskeyCredencial.updateMany(
            { _id: { $in: idsCredenciais } },
            { $set: { challengeAtual: challenge, challengeExpiraEm: expiraEm } }
        );

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

        // Busca a passkey e o challenge salvo nela
        const doc = await PasskeyCredencial.findOne({
            credentialId: credential.id,
            ativo: true
        });
        if (!doc) {
            return res.status(404).json({ success: false, error: 'Biometria não encontrada ou revogada.' });
        }

        const esperado = doc.challengeAtual;
        const expiraEm = doc.challengeExpiraEm;

        if (!esperado) {
            return res.status(400).json({ success: false, error: 'Nenhum challenge pendente. Inicie a autenticação novamente.' });
        }

        if (expiraEm && new Date() > expiraEm) {
            return res.status(400).json({ success: false, error: 'Challenge expirado. Tente novamente.' });
        }

        const resp = credential.response;
        let clientData;
        try {
            clientData = JSON.parse(Buffer.from(resp.clientDataJSON, 'base64url').toString('utf8'));
        } catch (_) {
            return res.status(400).json({ success: false, error: 'clientDataJSON inválido.' });
        }

        // Comparação normalizada (ignora + e -)
        if (normalizarB64Url(clientData.challenge) !== normalizarB64Url(esperado)) {
            console.warn(`❌ Challenge não confere. Recebido: ${clientData.challenge} | Esperado: ${esperado}`);
            return res.status(400).json({ success: false, error: 'Challenge não confere.' });
        }

        if (clientData.type !== 'webauthn.get') {
            return res.status(400).json({ success: false, error: 'Tipo de cerimônia inválido.' });
        }

        if (clientData.origin !== obterOrigin(req)) {
            return res.status(400).json({ success: false, error: 'Origin não confere.' });
        }

        // Valida a assinatura criptográfica
        const ok = passkeyCrypto.verificarAssertion({
            publicKeyJwk: doc.publicKeyJwk,
            clientDataJSON: resp.clientDataJSON,
            authenticatorData: resp.authenticatorData,
            signature: resp.signature
        });

        if (!ok) {
            return res.status(401).json({ success: false, error: 'Assinatura inválida.' });
        }

        // 🔥 LIMPA O CHALLENGE DO BANCO (segurança)
        doc.counter = (doc.counter || 0) + 1;
        doc.ultimoUsoEm = new Date();
        doc.challengeAtual = null;
        doc.challengeExpiraEm = null;
        await doc.save();

        // Contexto para o frontend
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