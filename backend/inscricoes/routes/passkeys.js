// ============================================================================
// backend/inscricoes/routes/passkeys.js
// Base: /api/inscricoes/passkeys
//
// 🔥 REGRAS DE UNICIDADE NO VÍNCULO DE BIOMETRIA:
//   1) credentialId é único global (mesma credencial não pode ser registrada 2x)
//   2) inscricaoId, se informado, PRECISA existir e NÃO pode ter outra passkey ativa
//   3) matriculaId, se informado, NÃO pode ter outra passkey ativa
//   4) Fallback: se inscricaoId não veio, descobre pelo alunoNome ativo
//   5) UNICIDADE POR NOME: impede dois responsáveis vincularem biometria pro mesmo aluno
// ============================================================================
'use strict';

const express = require('express');
const router = express.Router();

const PasskeyCredencial = require('../models/PasskeyCredencial');
const passkeyCrypto = require('../utils/passkeyCrypto');
const { soDigitos, hashCPF, texto } = require('../utils/seguranca');
const { authenticateToken, podeConsultar, podeEditar } = require('../middlewares/auth-inscricoes');
const Formulario = require('../models/Formulario');

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

// 🔥 Helper: valida formato de ObjectId
function isObjectIdValido(id) {
    return id && /^[a-f0-9]{24}$/i.test(String(id));
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
        const {
            cpf, nome, credential,
            inscricaoId, matriculaId,
            alunoNome, alunoTurma, alunoCurso, alunoOrigem
        } = req.body || {};

        const cpfDigitos = soDigitos(cpf);

        if (cpfDigitos.length !== 11) return res.status(400).json({ success: false, error: 'CPF inválido.' });
        if (!credential || !credential.response) return res.status(400).json({ success: false, error: 'Credencial ausente.' });

        const cpfHash = hashCPF(cpfDigitos);
        const challengeEsperado = consumirChallenge(`reg:${cpfHash}`);
        if (!challengeEsperado) return res.status(400).json({ success: false, error: 'Challenge expirado ou inválido. Refaça o cadastro.' });

        let extraido;
        try {
            extraido = passkeyCrypto.extrairChavePublicaDaAttestation(credential.response.attestationObject);
        } catch (e) {
            return res.status(400).json({ success: false, error: 'Attestation inválida: ' + e.message });
        }

        let clientData;
        try {
            const buf = passkeyCrypto.b64urlDecode(credential.response.clientDataJSON);
            clientData = JSON.parse(buf.toString('utf8'));
        } catch (_) {
            return res.status(400).json({ success: false, error: 'clientDataJSON inválido.' });
        }

        if (clientData.type !== 'webauthn.create') return res.status(400).json({ success: false, error: 'Tipo de cerimônia inválido.' });
        if (clientData.challenge !== challengeEsperado) return res.status(400).json({ success: false, error: 'Challenge não confere.' });
        if (clientData.origin !== obterOrigin(req)) return res.status(400).json({ success: false, error: 'Origin não confere.' });

        // --------------------------------------------------------------------
        // 🔥 UNICIDADE #1 — credentialId não pode existir em outra passkey
        // --------------------------------------------------------------------
        const existenteCred = await PasskeyCredencial.findOne({ credentialId: extraido.credentialId }).lean();
        if (existenteCred) {
            return res.status(409).json({ success: false, error: 'Esta passkey já está registrada.' });
        }

        // --------------------------------------------------------------------
        // 🔥 Normaliza ids de vínculo (formato ObjectId)
        // --------------------------------------------------------------------
        const inscricaoIdValido = isObjectIdValido(inscricaoId) ? String(inscricaoId) : null;
        if (inscricaoId && !inscricaoIdValido) {
            return res.status(400).json({ success: false, error: 'ID de inscrição inválido.' });
        }

        const matriculaIdValido = isObjectIdValido(matriculaId) ? String(matriculaId) : null;
        if (matriculaId && !matriculaIdValido) {
            return res.status(400).json({ success: false, error: 'ID de matrícula inválido.' });
        }

        // --------------------------------------------------------------------
        // 🔥 UNICIDADE #2 — inscricaoId, se informado, precisa existir e não
        // pode já ter passkey ativa.
        // --------------------------------------------------------------------
        if (inscricaoIdValido) {
            const inscricaoExiste = await Formulario.findById(inscricaoIdValido)
                .select('_id protocolo status')
                .lean();

            if (!inscricaoExiste) {
                return res.status(404).json({
                    success: false,
                    error: 'Inscrição não encontrada para vincular a biometria.'
                });
            }
            if (inscricaoExiste.status === 'Cancelada') {
                return res.status(400).json({
                    success: false,
                    error: 'Não é possível vincular biometria a uma inscrição cancelada.'
                });
            }

            const passkeyDaInscricao = await PasskeyCredencial.findOne({
                inscricaoId: inscricaoIdValido,
                ativo: true
            }).select('_id responsavelNome').lean();

            if (passkeyDaInscricao) {
                return res.status(409).json({
                    success: false,
                    error: `Esta inscrição já possui biometria ativa vinculada (responsável: ${passkeyDaInscricao.responsavelNome || '—'}). Revogue antes de cadastrar outra.`
                });
            }
        }

        // --------------------------------------------------------------------
        // 🔥 UNICIDADE #3 — matriculaId, se informado, não pode ter passkey ativa.
        // --------------------------------------------------------------------
        if (matriculaIdValido) {
            const passkeyDaMatricula = await PasskeyCredencial.findOne({
                matriculaId: matriculaIdValido,
                ativo: true
            }).select('_id responsavelNome').lean();

            if (passkeyDaMatricula) {
                return res.status(409).json({
                    success: false,
                    error: `Esta matrícula já possui biometria ativa vinculada (responsável: ${passkeyDaMatricula.responsavelNome || '—'}). Revogue antes de cadastrar outra.`
                });
            }
        }

        const alunoNomeNormalizado = texto(alunoNome, 150);
        let inscricaoIdFinal = inscricaoIdValido;

        // --------------------------------------------------------------------
        // 🔥 UNICIDADE #4 — Fallback: se o frontend não mandou inscricaoId,
        // descobre a inscrição ativa do aluno pelo alunoNome e trava mesmo assim.
        // --------------------------------------------------------------------
        if (!inscricaoIdFinal && alunoNomeNormalizado) {
            // Busca a inscrição ativa mais recente do aluno (não cancelada)
            const inscricaoDoAluno = await Formulario.findOne({
                'aluno.nomeCompleto': new RegExp('^' + alunoNomeNormalizado.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i'),
                status: { $ne: 'Cancelada' }
            }).sort({ createdAt: -1 }).select('_id protocolo').lean();

            if (inscricaoDoAluno) {
                inscricaoIdFinal = String(inscricaoDoAluno._id);

                // Verifica se essa inscrição descoberta já tem passkey ativa
                const passkeyDesc = await PasskeyCredencial.findOne({
                    inscricaoId: inscricaoIdFinal,
                    ativo: true
                }).select('_id responsavelNome').lean();

                if (passkeyDesc) {
                    return res.status(409).json({
                        success: false,
                        error: `Este aluno já possui biometria ativa vinculada (responsável: ${passkeyDesc.responsavelNome || '—'}). Revogue antes de cadastrar outra.`
                    });
                }
            }
        }

        // --------------------------------------------------------------------
        // 🔥 UNICIDADE #5 — TRAVA POR NOME DO ALUNO (evita duplicidade sem ID)
        // Se o aluno já tiver uma passkey ativa (mesmo que a inscrição/matrícula
        // não tenha sido passada), bloqueia o cadastro da nova.
        // --------------------------------------------------------------------
        if (alunoNomeNormalizado) {
            const filtroNome = {
                alunoNome: new RegExp('^' + alunoNomeNormalizado.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i'),
                ativo: true
            };

            // Se tiver matrícula, restringe a busca a ela para não bloquear homônimos
            if (matriculaIdValido) {
                filtroNome.matriculaId = matriculaIdValido;
            }

            const passkeyExistenteNome = await PasskeyCredencial.findOne(filtroNome)
                .select('_id responsavelNome')
                .lean();

            if (passkeyExistenteNome) {
                return res.status(409).json({
                    success: false,
                    error: `Este aluno já possui biometria ativa cadastrada por ${passkeyExistenteNome.responsavelNome || 'outro responsável'}. Por segurança, não é possível cadastrar outra.`
                });
            }
        }

        // --------------------------------------------------------------------
        // Persiste
        // --------------------------------------------------------------------
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
            inscricaoId: inscricaoIdFinal,
            matriculaId: matriculaIdValido,
            alunoNome: alunoNomeNormalizado,
            alunoTurma: texto(alunoTurma, 120) || '',
            alunoCurso: texto(alunoCurso, 120) || '',
            alunoOrigem: texto(alunoOrigem, 40) || '',
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
        // 🔥 Tradução de E11000 (se algum dia adicionar índice único parcial)
        if (err && (err.code === 11000 || /duplicate key/i.test(err.message || ''))) {
            return res.status(409).json({
                success: false,
                error: 'Esta credencial já está vinculada a outra inscrição/aluno.'
            });
        }
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

// ============================================================================
// ADMIN — GESTÃO DE PASSKEYS
// ============================================================================

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
                { alunoNome: rx },
                { credentialId: rx }
            ];
            const cpfDigitos = soDigitos(termo);
            if (cpfDigitos.length === 11) {
                filtro.$or.push({ responsavelCpfHash: hashCPF(cpfDigitos) });
            }
        }

        if (req.query.ativo === 'sim') filtro.ativo = true;
        if (req.query.ativo === 'nao') filtro.ativo = false;

        if (req.query.turma) {
            filtro.alunoTurma = new RegExp(String(req.query.turma).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        }
        if (req.query.curso) {
            filtro.alunoCurso = new RegExp(String(req.query.curso).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        }

        const [total, docs] = await Promise.all([
            PasskeyCredencial.countDocuments(filtro),
            PasskeyCredencial.find(filtro)
                .sort({ createdAt: -1 })
                .skip((pagina - 1) * limite)
                .limit(limite)
                .select('-publicKeyJwk')
                .lean()
        ]);

        const turmas = await PasskeyCredencial.distinct('alunoTurma', { alunoTurma: { $ne: '' } });
        const cursos = await PasskeyCredencial.distinct('alunoCurso', { alunoCurso: { $ne: '' } });

        res.json({
            success: true,
            passkeys: docs.map(d => ({
                _id: d._id,
                responsavelNome: d.responsavelNome,
                credentialId: d.credentialId,
                transports: d.transports,
                ativo: d.ativo,
                createdAt: d.createdAt,
                ultimoUsoEm: d.ultimoUsoEm,
                alunoNome: d.alunoNome || 'Não vinculado',
                alunoTurma: d.alunoTurma || '—',
                alunoCurso: d.alunoCurso || '—',
                alunoOrigem: d.alunoOrigem || '',
                inscricaoId: d.inscricaoId,
                matriculaId: d.matriculaId
            })),
            opcoes: {
                turmas: turmas.filter(Boolean).sort(),
                cursos: cursos.filter(Boolean).sort()
            },
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

// ---- PUT /passkeys/admin/:id (Editar Nome) ----
router.put('/admin/:id', authenticateToken, podeEditar, async (req, res) => {
    try {
        const { responsavelNome } = req.body;
        if (!responsavelNome) {
            return res.status(400).json({ success: false, error: 'Nome do responsável é obrigatório.' });
        }

        const doc = await PasskeyCredencial.findByIdAndUpdate(
            req.params.id,
            { responsavelNome: texto(responsavelNome, 150) },
            { new: true }
        );

        if (!doc) return res.status(404).json({ success: false, error: 'Passkey não encontrada.' });

        res.json({ success: true, mensagem: 'Passkey atualizada com sucesso.', passkey: doc });
    } catch (error) {
        console.error('❌ [PASSKEYS] Erro ao editar:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ---- PUT /passkeys/admin/:id/revogar ----
router.put('/admin/:id/revogar', authenticateToken, podeEditar, async (req, res) => {
    try {
        const doc = await PasskeyCredencial.findByIdAndUpdate(
            req.params.id,
            { ativo: false },
            { new: true }
        );
        if (!doc) return res.status(404).json({ success: false, error: 'Passkey não encontrada.' });
        res.json({ success: true, mensagem: 'Passkey revogada com sucesso.' });
    } catch (error) {
        console.error('❌ [PASSKEYS] Erro ao revogar:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ---- PUT /passkeys/admin/:id/reativar ----
router.put('/admin/:id/reativar', authenticateToken, podeEditar, async (req, res) => {
    try {
        // 🔥 Ao reativar, garante que a inscrição/aluno não tenha outra ativa
        const alvo = await PasskeyCredencial.findById(req.params.id).lean();
        if (!alvo) return res.status(404).json({ success: false, error: 'Passkey não encontrada.' });

        if (alvo.inscricaoId) {
            const conflito = await PasskeyCredencial.findOne({
                _id: { $ne: alvo._id },
                inscricaoId: alvo.inscricaoId,
                ativo: true
            }).select('_id responsavelNome').lean();

            if (conflito) {
                return res.status(409).json({
                    success: false,
                    error: `Não é possível reativar: a inscrição já tem outra biometria ativa (responsável: ${conflito.responsavelNome || '—'}).`
                });
            }
        }

        const doc = await PasskeyCredencial.findByIdAndUpdate(
            req.params.id,
            { ativo: true },
            { new: true }
        );
        res.json({ success: true, mensagem: 'Passkey reativada com sucesso.' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ---- DELETE /passkeys/admin/:id (Excluir Permanentemente) ----
router.delete('/admin/:id', authenticateToken, podeEditar, async (req, res) => {
    try {
        const doc = await PasskeyCredencial.findByIdAndDelete(req.params.id);
        if (!doc) return res.status(404).json({ success: false, error: 'Passkey não encontrada.' });
        res.json({ success: true, mensagem: 'Biometria excluída permanentemente.' });
    } catch (error) {
        console.error('❌ [PASSKEYS] Erro ao excluir:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;