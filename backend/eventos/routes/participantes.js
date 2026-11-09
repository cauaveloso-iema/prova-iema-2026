// ============================================================================
// backend/eventos/routes/participantes.js
// Base: /api/eventos/participantes
// ============================================================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

let logger = console;
try { logger = require('../../../utils/logger'); } catch (_) {}

// crypto-utils com fallback
let cryptoUtils;
try {
    cryptoUtils = require('../../../utils/crypto-utils');
} catch (err) {
    logger.warn('⚠️ [EVENTOS] crypto-utils indisponível:', err.message);
    cryptoUtils = { hash: (v) => v ? String(v) : null };
}

const ParticipanteEvento = require('../models/ParticipanteEvento');
const Evento = require('../models/Evento');
const { authenticateToken, isSuperAdmin } = require('../middlewares/auth-eventos');

// ---- GET /?eventoId=xxx ----
router.get('/', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { eventoId } = req.query;
        if (!eventoId || !mongoose.Types.ObjectId.isValid(eventoId)) {
            return res.status(400).json({ success: false, error: 'eventoId inválido' });
        }

        const participantes = await ParticipanteEvento.find({ eventoId }).sort({ createdAt: -1 });
        const lista = participantes.map(p => p.toSafeJSON());

        res.json({ success: true, participantes: lista });
    } catch (error) {
        logger.error('❌ [EVENTOS] Erro ao listar participantes:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ---- GET /:id ----
router.get('/:id', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, error: 'ID inválido' });
        }
        const participante = await ParticipanteEvento.findById(req.params.id);
        if (!participante) return res.status(404).json({ success: false, error: 'Participante não encontrado' });

        res.json({ success: true, participante: participante.toSafeJSON({ incluirSensiveis: true }) });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ---- POST / ----
router.post('/', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const {
            eventoId, nomeCompleto, dataNascimento, genero,
            cpf, rg, telefone, email,
            endereco, dadosEspecificos,
            consentimentoLGPD, observacoes
        } = req.body;

        if (!eventoId || !mongoose.Types.ObjectId.isValid(eventoId)) {
            return res.status(400).json({ success: false, error: 'eventoId inválido' });
        }
        if (!nomeCompleto || !nomeCompleto.trim()) {
            return res.status(400).json({ success: false, error: 'Nome completo é obrigatório' });
        }

        const evento = await Evento.findById(eventoId);
        if (!evento) return res.status(404).json({ success: false, error: 'Evento não encontrado' });

        // Duplicidade CPF
        if (cpf) {
            const limpo = String(cpf).replace(/\D/g, '');
            if (limpo.length !== 11) {
                return res.status(400).json({ success: false, error: 'CPF inválido (11 dígitos)' });
            }
            const cpfHash = cryptoUtils.hash(limpo);
            const existente = await ParticipanteEvento.findOne({ eventoId, cpfHash }).select('_id nomeCompleto');
            if (existente) {
                return res.status(409).json({
                    success: false,
                    error: `CPF já cadastrado neste evento (${existente.nomeCompleto})`
                });
            }
        }

        // Duplicidade email
        if (email) {
            const normalizado = String(email).trim().toLowerCase();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizado)) {
                return res.status(400).json({ success: false, error: 'E-mail inválido' });
            }
            const emailHash = cryptoUtils.hash(normalizado);
            const existente = await ParticipanteEvento.findOne({ eventoId, emailHash }).select('_id nomeCompleto');
            if (existente) {
                return res.status(409).json({
                    success: false,
                    error: `E-mail já cadastrado neste evento (${existente.nomeCompleto})`
                });
            }
        }

        const novo = new ParticipanteEvento({
            eventoId,
            nomeCompleto: nomeCompleto.trim(),
            dataNascimento: dataNascimento ? new Date(dataNascimento) : null,
            genero: genero || null,
            endereco: endereco || {},
            dadosEspecificos: dadosEspecificos && typeof dadosEspecificos === 'object' ? dadosEspecificos : {},
            consentimentoLGPD: consentimentoLGPD && consentimentoLGPD.aceito
                ? { aceito: true, dataAceite: new Date(), versaoTermo: consentimentoLGPD.versaoTermo || '1.0' }
                : { aceito: false },
            observacoes: observacoes || '',
            criadoPor: req.userId
        });

        if (cpf) novo.setCPF(cpf);
        if (rg) novo.setRG(rg);
        if (telefone) novo.setTelefone(telefone);
        if (email) novo.setEmail(email);

        await novo.save();

        await Evento.findByIdAndUpdate(eventoId, { $inc: { totalParticipantes: 1 } });

        logger.info(`✅ [EVENTOS] Participante criado: ${novo.nomeCompleto}`);

        res.status(201).json({
            success: true,
            participante: novo.toSafeJSON({ incluirSensiveis: true })
        });
    } catch (error) {
        logger.error('❌ [EVENTOS] Erro ao criar participante:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ---- PUT /:id ----
router.put('/:id', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, error: 'ID inválido' });
        }

        const participante = await ParticipanteEvento.findById(req.params.id);
        if (!participante) return res.status(404).json({ success: false, error: 'Participante não encontrado' });

        const {
            nomeCompleto, dataNascimento, genero,
            cpf, rg, telefone, email,
            endereco, dadosEspecificos, status, observacoes
        } = req.body;

        if (nomeCompleto) participante.nomeCompleto = nomeCompleto.trim();
        if (dataNascimento !== undefined) participante.dataNascimento = dataNascimento ? new Date(dataNascimento) : null;
        if (genero !== undefined) participante.genero = genero;
        if (endereco && typeof endereco === 'object') participante.endereco = endereco;
        if (dadosEspecificos && typeof dadosEspecificos === 'object') participante.dadosEspecificos = dadosEspecificos;
        if (status && ['Inscrito', 'Confirmado', 'Cancelado', 'Presente', 'Ausente'].includes(status)) {
            participante.status = status;
        }
        if (observacoes !== undefined) participante.observacoes = observacoes;

        if (cpf !== undefined) {
            if (cpf) {
                const limpo = String(cpf).replace(/\D/g, '');
                if (limpo.length !== 11) {
                    return res.status(400).json({ success: false, error: 'CPF inválido' });
                }
                const cpfHash = cryptoUtils.hash(limpo);
                if (cpfHash !== participante.cpfHash) {
                    const existente = await ParticipanteEvento.findOne({
                        eventoId: participante.eventoId,
                        cpfHash,
                        _id: { $ne: participante._id }
                    }).select('nomeCompleto');
                    if (existente) {
                        return res.status(409).json({
                            success: false,
                            error: `CPF já cadastrado neste evento (${existente.nomeCompleto})`
                        });
                    }
                }
                participante.setCPF(cpf);
            } else {
                participante.cpfCriptografado = null;
                participante.cpfHash = null;
            }
        }

        if (email !== undefined) {
            if (email) {
                const normalizado = String(email).trim().toLowerCase();
                const emailHash = cryptoUtils.hash(normalizado);
                if (emailHash !== participante.emailHash) {
                    const existente = await ParticipanteEvento.findOne({
                        eventoId: participante.eventoId,
                        emailHash,
                        _id: { $ne: participante._id }
                    }).select('nomeCompleto');
                    if (existente) {
                        return res.status(409).json({
                            success: false,
                            error: `E-mail já cadastrado neste evento (${existente.nomeCompleto})`
                        });
                    }
                }
                participante.setEmail(email);
            } else {
                participante.emailCriptografado = null;
                participante.emailHash = null;
            }
        }

        if (rg !== undefined) participante.setRG(rg);
        if (telefone !== undefined) participante.setTelefone(telefone);

        await participante.save();
        logger.info(`✏️ [EVENTOS] Participante atualizado: ${participante.nomeCompleto}`);

        res.json({ success: true, participante: participante.toSafeJSON({ incluirSensiveis: true }) });
    } catch (error) {
        logger.error('❌ [EVENTOS] Erro ao atualizar participante:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ---- DELETE /:id ----
router.delete('/:id', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, error: 'ID inválido' });
        }

        const participante = await ParticipanteEvento.findByIdAndDelete(req.params.id);
        if (!participante) return res.status(404).json({ success: false, error: 'Participante não encontrado' });

        await Evento.findByIdAndUpdate(participante.eventoId, { $inc: { totalParticipantes: -1 } });

        res.json({ success: true, mensagem: 'Participante removido' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;