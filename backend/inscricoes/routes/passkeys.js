// ============================================================================
// backend/inscricoes/routes/passkeys.js
// Base: /api/inscricoes/passkeys
//
//   POST /registrar/iniciar    → gera challenge para cadastro de passkey
//   POST /registrar/concluir   → valida e salva a passkey
//   GET  /listar/:cpfHash      → lista passkeys de um responsável (admin)
//   DELETE /:credentialId      → revoga passkey (admin)
// ============================================================================
'use strict';

const express = require('express');
const router = express.Router();

const PasskeyCredencial = require('../models/PasskeyCredencial');
const passkeyCrypto = require('../utils/passkeyCrypto');
const { soDigitos, hashCPF, texto } = require('../utils/seguranca');

// Cache em memória dos challenges (TTL 5 min)
const challenges = new Map();
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

setInterval(() => {
    const agora = Date.now();
    for (const [k, v] of challenges.entries()) {
        if (agora - v.criadoEm > CHALLENGE_TTL_MS) challenges.delete(k);
    }
}, 60 * 1000).unref();

function obterRpId(req) {
    return process.env.WEBAUTHN_RP_ID
        || req.headers.host?.split(':')[0]
        || 'localhost';
}

function obterOrigin(req) {
    return process.env.WEBAUTHN_ORIGIN
        || `${req.protocol}://${req.headers.host}`;
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
// CADASTRO DE PASSKEY (durante a inscrição)
// ============================================================================

// ---- POST /passkeys/registrar/iniciar ----
router.post('/registrar/iniciar', (req, res) => {
    try {
        const { cpf, nome } = req.body || {};
        const cpfDigitos = soDigitos(cpf);

        if (cpfDigitos.length !== 11) {
            return res.status(400).json({ success: false, error: 'CPF inválido.' });
        }

        const cpfHash = hashCPF(cpfDigitos);
        const chave = `reg:${cpfHash}`;
        const challenge = criarChallenge(chave);

        const rpId = obterRpId(req);
        const rpName = process.env.WEBAUTHN_RP_NAME || 'IEMA EducaPleno';

        // userId estável (cpfHash) — permite agrupar passkeys do mesmo responsável
        const userId = Buffer.from(cpfHash, 'hex');

        res.json({
            success: true,
            opcoes: {
                challenge,
                rp: { name: rpName, id: rpId },
                user: {
                    id: passkeyCrypto.b64urlEncode(userId),
                    name: cpfDigitos,
                    displayName: texto(nome, 150) || 'Responsável'
                },
                pubKeyCredParams: [
                    { type: 'public-key', alg: -7 },
                    { type: 'public-key', alg: -257 }
                ],
                authenticatorSelection: {
                    // ⚠️ NÃO forçar 'platform' → permite passkey sincronizada
                    // (iCloud Keychain / Google Password Manager)
                    userVerification: 'required',
                    residentKey: 'required',
                    requireResidentKey: true
                },
                timeout: 60000,
                attestation: 'none'
            }
        });
    } catch (err) {
        console.error('❌ [PASSKEYS] Erro em registrar/iniciar:', err);
        res.status(500).json({ success: false, error: 'Falha ao iniciar cadastro de passkey.' });
    }
});

// ---- POST /passkeys/registrar/concluir ----
router.post('/registrar/concluir', async (req, res) => {
    try {
        const { cpf, nome, credential, inscricaoId } = req.body || {};
        const cpfDigitos = soDigitos(cpf);

        if (cpfDigitos.length !== 11) {
            return res.status(400).json({ success: false, error: 'CPF inválido.' });
        }
        if (!credential || !credential.response) {
            return res.status(400).json({ success: false, error: 'Credencial ausente.' });
        }

        const cpfHash = hashCPF(cpfDigitos);
        const challengeEsperado = consumirChallenge(`reg:${cpfHash}`);
        if (!challengeEsperado) {
            return res.status(400).json({ success: false, error: 'Challenge expirado ou inválido. Refaça o cadastro.' });
        }

        // Extrai a chave pública do attestationObject
        let extraido;
        try {
            extraido = passkeyCrypto.extrairChavePublicaDaAttestation(
                credential.response.attestationObject
            );
        } catch (e) {
            return res.status(400).json({ success: false, error: 'Attestation inválida: ' + e.message });
        }

        // Verifica o clientDataJSON
        let clientData;
        try {
            const buf = passkeyCrypto.b64urlDecode(credential.response.clientDataJSON);
            clientData = JSON.parse(buf.toString('utf8'));
        } catch (_) {
            return res.status(400).json({ success: false, error: 'clientDataJSON inválido.' });
        }

        if (clientData.type !== 'webauthn.create') {
            return res.status(400).json({ success: false, error: 'Tipo de cerimônia inválido.' });
        }
        if (clientData.challenge !== challengeEsperado) {
            return res.status(400).json({ success: false, error: 'Challenge não confere.' });
        }
        if (clientData.origin !== obterOrigin(req)) {
            return res.status(400).json({ success: false, error: 'Origin não confere.' });
        }

        // Verifica duplicata
        const existente = await PasskeyCredencial.findOne({ credentialId: extraido.credentialId }).lean();
        if (existente) {
            return res.status(409).json({ success: false, error: 'Esta passkey já está registrada.' });
        }

        const doc = new PasskeyCredencial({
            responsavelCpfHash: cpfHash,
            responsavelNome: texto(nome, 150) || '',
            credentialId: extraido.credentialId,
            publicKeyJwk: extraido.publicKeyJwk,
            alg: extraido.publicKeyJwk.alg || -7,
            counter: 0,
            transports: credential.response.transports || [],
            aaguid: extraido.aaguid || '',
            attestationType: 'none',
            userVerification: 'required',
            inscricaoId: inscricaoId || null,
            ip: req.ip || '',
            userAgent: req.headers['user-agent'] || ''
        });

        await doc.save();

        res.status(201).json({
            success: true,
            mensagem: 'Passkey registrada com sucesso!',
            credentialId: doc.credentialId
        });
    } catch (err) {
        console.error('❌ [PASSKEYS] Erro em registrar/concluir:', err);
        res.status(500).json({ success: false, error: 'Falha ao concluir cadastro de passkey.' });
    }
});

// ============================================================================
// ADMIN (consulta/revogação)
// ============================================================================

router.get('/listar/:cpfHash', async (req, res) => {
    try {
        const lista = await PasskeyCredencial.find({
            responsavelCpfHash: req.params.cpfHash
        }).select('-publicKeyJwk').lean();
        res.json({ success: true, passkeys: lista });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.delete('/:credentialId', async (req, res) => {
    try {
        const doc = await PasskeyCredencial.findOneAndUpdate(
            { credentialId: req.params.credentialId },
            { ativo: false },
            { new: true }
        );
        if (!doc) return res.status(404).json({ success: false, error: 'Passkey não encontrada.' });
        res.json({ success: true, mensagem: 'Passkey revogada.' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ============================================================================
// ADMIN — GESTÃO DE PASSKEYS
// ============================================================================
const { authenticateToken, podeConsultar, podeEditar } = require('../middlewares/auth-inscricoes');
const Formulario = require('../models/Formulario'); // Para cruzar dados do aluno

// ---- GET /passkeys/admin (Listar todas) ----
router.get('/admin', authenticateToken, podeConsultar, async (req, res) => {
    try {
        const pagina = Math.max(1, parseInt(req.query.pagina, 10) || 1);
        const limite = Math.min(100, Math.max(5, parseInt(req.query.limite, 10) || 20));
        const filtro = {};

        if (req.query.busca) {
            const termo = String(req.query.busca).trim();
            const rx = new RegExp(termo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            filtro.$or = [
                { responsavelNome: rx },
                { credentialId: rx }
            ];
            // Se o termo for um CPF válido, tenta buscar pelo hash
            const cpfDigitos = soDigitos(termo);
            if (cpfDigitos.length === 11) {
                filtro.$or.push({ responsavelCpfHash: hashCPF(cpfDigitos) });
            }
        }

        if (req.query.ativo === 'sim') filtro.ativo = true;
        if (req.query.ativo === 'nao') filtro.ativo = false;

        const [total, docs] = await Promise.all([
            PasskeyCredencial.countDocuments(filtro),
            PasskeyCredencial.find(filtro)
                .sort({ createdAt: -1 })
                .skip((pagina - 1) * limite)
                .limit(limite)
                .select('-publicKeyJwk') // Não envia a chave pública para o front
                .lean()
        ]);

        // Cruza com as inscrições para pegar o nome do aluno (se houver inscricaoId)
        const inscricoesIds = docs.filter(d => d.inscricaoId).map(d => d.inscricaoId);
        const inscricoes = await Formulario.find({ _id: { $in: inscricoesIds } })
            .select('_id aluno.nomeCompleto')
            .lean();
        
        const mapaInscricoes = {};
        inscricoes.forEach(i => { mapaInscricoes[i._id.toString()] = i.aluno?.nomeCompleto || 'Aluno não encontrado'; });

        const lista = docs.map(d => ({
            _id: d._id,
            responsavelNome: d.responsavelNome,
            credentialId: d.credentialId,
            transports: d.transports,
            ativo: d.ativo,
            createdAt: d.createdAt,
            ultimoUsoEm: d.ultimoUsoEm,
            alunoNome: d.inscricaoId ? mapaInscricoes[d.inscricaoId.toString()] : null
        }));

        res.json({
            success: true,
            passkeys: lista,
            paginacao: {
                pagina,
                limite,
                total,
                totalPaginas: Math.max(1, Math.ceil(total / limite))
            }
        });
    } catch (error) {
        console.error('❌ [PASSKEYS] Erro ao listar no admin:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ---- DELETE /passkeys/admin/:id (Revogar/Excluir) ----
router.delete('/admin/:id', authenticateToken, podeEditar, async (req, res) => {
    try {
        const doc = await PasskeyCredencial.findByIdAndUpdate(
            req.params.id,
            { ativo: false },
            { new: true }
        );
        if (!doc) return res.status(404).json({ success: false, error: 'Passkey não encontrada.' });

        console.log(`🗑️ [PASSKEYS] Passkey de ${doc.responsavelNome} revogada por ${req.userNome || req.userId}`);
        res.json({ success: true, mensagem: 'Passkey revogada com sucesso.' });
    } catch (error) {
        console.error('❌ [PASSKEYS] Erro ao revogar:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ---- PUT /passkeys/admin/:id (Reativar - opcional) ----
router.put('/admin/:id/reativar', authenticateToken, podeEditar, async (req, res) => {
    try {
        const doc = await PasskeyCredencial.findByIdAndUpdate(
            req.params.id,
            { ativo: true },
            { new: true }
        );
        if (!doc) return res.status(404).json({ success: false, error: 'Passkey não encontrada.' });
        res.json({ success: true, mensagem: 'Passkey reativada com sucesso.' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;