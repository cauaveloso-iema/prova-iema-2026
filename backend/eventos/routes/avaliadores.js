// ============================================================================
// backend/eventos/routes/avaliadores.js
// Base: /api/eventos/avaliadores
// ============================================================================

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

let logger = console;
try { logger = require('../../../utils/logger'); } catch (_) {}

const Avaliador = require('../models/Avaliador');
const Evento = require('../models/Evento');
const { authenticateToken, isSuperAdmin, authenticateAvaliador, isCoordenadorEvento } = require('../middlewares/auth-eventos');

// ============================================================
// CADASTROS (PÚBLICOS)
// ============================================================
router.post('/cadastro', async (req, res) => {
    try {
        const { nomeCompleto, email, senha } = req.body;
        if (!nomeCompleto || !email || !senha) return res.status(400).json({ success: false, error: 'Preencha todos os campos.' });
        if (senha.length < 6) return res.status(400).json({ success: false, error: 'Senha muito curta.' });

        const emailNormalizado = email.toLowerCase().trim();
        if (await Avaliador.findOne({ email: emailNormalizado })) {
            return res.status(409).json({ success: false, error: 'E-mail já cadastrado.' });
        }

        const novo = new Avaliador({ nomeCompleto: nomeCompleto.trim(), email: emailNormalizado, status: 'Pendente', isCoordenador: false });
        await novo.setSenha(senha);
        await novo.save();
        res.status(201).json({ success: true, message: 'Cadastro realizado! Aguarde a aprovação.' });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/cadastro-coordenador', async (req, res) => {
    try {
        const { nomeCompleto, email, senha } = req.body;
        if (!nomeCompleto || !email || !senha) return res.status(400).json({ success: false, error: 'Preencha todos os campos.' });
        if (senha.length < 6) return res.status(400).json({ success: false, error: 'Senha muito curta.' });

        const emailNormalizado = email.toLowerCase().trim();
        if (await Avaliador.findOne({ email: emailNormalizado })) {
            return res.status(409).json({ success: false, error: 'E-mail já cadastrado.' });
        }

        const novo = new Avaliador({ nomeCompleto: nomeCompleto.trim(), email: emailNormalizado, status: 'Pendente', isCoordenador: true });
        await novo.setSenha(senha);
        await novo.save();
        res.status(201).json({ success: true, message: 'Cadastro realizado! Aguarde a aprovação do Administrador.' });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============================================================
// LOGIN
// ============================================================
router.post('/login', async (req, res) => {
    try {
        const { email, senha } = req.body;
        if (!email || !senha) {
            return res.status(400).json({ success: false, error: 'Informe e-mail e senha.' });
        }

        const avaliador = await Avaliador.findOne({ email: email.toLowerCase().trim() }).select('+senhaHash');
        if (!avaliador || !(await avaliador.verificarSenha(senha))) {
            return res.status(401).json({ success: false, error: 'E-mail ou senha incorretos.' });
        }
        if (avaliador.status !== 'Ativo') {
            return res.status(403).json({ success: false, error: 'Sua conta ainda não foi aprovada.' });
        }

        avaliador.ultimoAcesso = new Date();
        await avaliador.save();

        const token = jwt.sign(
            { id: avaliador._id, type: 'avaliador_eventos' },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        const safe = avaliador.toSafeJSON();

        res.json({
            success: true,
            token,
            avaliador: {
                ...safe,
                senhaTemporaria: avaliador.senhaTemporaria === true
            },
            // 👇 Compat: sinaliza explicitamente para o frontend
            precisaTrocarSenha: avaliador.senhaTemporaria === true
        });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============================================================
// 🔑 TROCA DE SENHA (1º ACESSO ou LOGADO)
// ============================================================
router.put('/trocar-senha', authenticateAvaliador, async (req, res) => {
    try {
        const { senhaAtual, novaSenha } = req.body;

        if (!novaSenha || String(novaSenha).length < 6) {
            return res.status(400).json({ success: false, error: 'A nova senha deve ter no mínimo 6 caracteres.' });
        }

        const av = await Avaliador.findById(req.avaliadorId).select('+senhaHash');
        if (!av) return res.status(404).json({ success: false, error: 'Usuário não encontrado.' });

        // Se o usuário ainda está com senha temporária, não exige a atual
        const precisaSenhaAtual = av.senhaTemporaria !== true;

        if (precisaSenhaAtual) {
            if (!senhaAtual) {
                return res.status(400).json({ success: false, error: 'Informe a senha atual.' });
            }
            const ok = await av.verificarSenha(String(senhaAtual));
            if (!ok) {
                return res.status(401).json({ success: false, error: 'Senha atual incorreta.' });
            }
        }

        // Reutiliza o método do model para manter o padrão de hash
        await av.setSenha(String(novaSenha));
        av.senhaTemporaria = false;
        av.senhaTemporariaEm = null;
        av.ultimaTrocaSenha = new Date();
        await av.save();

        logger.info(`🔑 [AVALIADORES] Senha alterada: ${av.email}`);

        res.json({
            success: true,
            mensagem: 'Senha alterada com sucesso.',
            avaliador: {
                _id: av._id,
                nomeCompleto: av.nomeCompleto,
                email: av.email,
                isCoordenador: av.isCoordenador,
                status: av.status,
                senhaTemporaria: false
            }
        });
    } catch (error) {
        logger.error('❌ [AVALIADORES] Erro ao trocar senha:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================
// ADMIN CRIA USUÁRIO
// ============================================================
router.post('/admin-criar', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const { nomeCompleto, email, senha, isCoordenador } = req.body;
        const emailNormalizado = email.toLowerCase().trim();

        if (await Avaliador.findOne({ email: emailNormalizado })) {
            return res.status(409).json({ success: false, error: 'E-mail já cadastrado.' });
        }

        const novo = new Avaliador({
            nomeCompleto: nomeCompleto.trim(),
            email: emailNormalizado,
            status: 'Ativo',
            isCoordenador: isCoordenador === true
        });
        await novo.setSenha(senha);
        await novo.save();
        res.status(201).json({ success: true, avaliador: novo.toSafeJSON() });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============================================================
// LISTAGENS
// ============================================================
router.get('/', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const usuarios = await Avaliador.find().sort({ nomeCompleto: 1 });
        res.json({ success: true, avaliadores: usuarios });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/coordenadores-lista', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const coordenadores = await Avaliador.find({ isCoordenador: true, status: 'Ativo' }).sort({ nomeCompleto: 1 });
        res.json({ success: true, coordenadores });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.get('/coordenador-lista', authenticateAvaliador, isCoordenadorEvento, async (req, res) => {
    try {
        const { eventoId } = req.query;
        let query = { isCoordenador: false };
        if (eventoId) query.eventos = eventoId;
        const avaliadores = await Avaliador.find(query).sort({ nomeCompleto: 1 });
        res.json({ success: true, avaliadores });
    } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============================================================
// VINCULAÇÃO
// ============================================================
async function vincularAvaliador(req, res) {
    try {
        const { eventoId, email } = req.body;
        if (!eventoId || !email) {
            return res.status(400).json({ success: false, error: 'eventoId e email são obrigatórios.' });
        }

        const evento = await Evento.findById(eventoId);
        if (!evento) return res.status(404).json({ success: false, error: 'Evento não encontrado.' });

        if (req.avaliadorId && req.avaliador) {
            const isCriador = evento.criadoPor && evento.criadoPor.toString() === req.avaliadorId;
            const isCoord = evento.coordenadores && evento.coordenadores.some(id => id.toString() === req.avaliadorId);
            if (!isCriador && !isCoord) {
                return res.status(403).json({ success: false, error: 'Você não tem permissão para vincular avaliadores neste evento.' });
            }
        }

        const avaliador = await Avaliador.findOne({ email: email.toLowerCase().trim() });
        if (!avaliador) return res.status(404).json({ success: false, error: 'Avaliador não encontrado. Verifique o e-mail.' });

        if (!avaliador.eventos) avaliador.eventos = [];

        if (!avaliador.eventos.some(id => id.toString() === String(eventoId))) {
            avaliador.eventos.push(eventoId);
            await avaliador.save();
            logger.info(`✅ [AVALIADORES] ${avaliador.nomeCompleto} (${avaliador.email}) vinculado ao evento "${evento.titulo}"`);
            return res.json({ success: true, message: 'Avaliador vinculado com sucesso!', jaExistia: false });
        } else {
            return res.json({ success: true, message: 'Avaliador já estava vinculado a este evento.', jaExistia: true });
        }
    } catch (error) {
        logger.error('❌ [AVALIADORES] Erro em /vincular:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}
router.post('/vincular', authenticateToken, isSuperAdmin, vincularAvaliador);
router.post('/coordenador-vincular', authenticateAvaliador, isCoordenadorEvento, vincularAvaliador);

// ============================================================
// DESVINCULAÇÃO
// ============================================================
async function desvincularAvaliador(req, res) {
    try {
        const { eventoId, avaliadorId } = req.body;
        if (!eventoId || !avaliadorId) {
            return res.status(400).json({ success: false, error: 'eventoId e avaliadorId são obrigatórios.' });
        }

        const avaliador = await Avaliador.findById(avaliadorId);
        if (!avaliador) return res.status(404).json({ success: false, error: 'Avaliador não encontrado.' });

        avaliador.eventos = (avaliador.eventos || []).filter(id => id.toString() !== String(eventoId));
        await avaliador.save();

        const evento = await Evento.findById(eventoId);
        if (evento && evento.coordenadores) {
            const antes = evento.coordenadores.length;
            evento.coordenadores = evento.coordenadores.filter(id => id.toString() !== String(avaliadorId));
            if (evento.coordenadores.length !== antes) {
                await evento.save();
            }
        }

        logger.info(`🗑️ [AVALIADORES] ${avaliador.nomeCompleto} desvinculado do evento ${eventoId}`);
        res.json({ success: true, message: 'Avaliador desvinculado.' });
    } catch (error) {
        logger.error('❌ [AVALIADORES] Erro em /desvincular:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}
router.post('/desvincular', authenticateToken, isSuperAdmin, desvincularAvaliador);
router.post('/coordenador-desvincular', authenticateAvaliador, isCoordenadorEvento, desvincularAvaliador);

// ============================================================
// APROVAÇÃO
// ============================================================
async function aprovarUsuario(req, res) {
    try {
        const avaliador = await Avaliador.findByIdAndUpdate(req.params.id, { status: 'Ativo' }, { new: true });
        if (!avaliador) return res.status(404).json({ success: false, error: 'Avaliador não encontrado.' });
        res.json({ success: true, avaliador });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
}
router.put('/:id/aprovar', authenticateToken, isSuperAdmin, aprovarUsuario);
router.put('/coordenador-aprovar/:id', authenticateAvaliador, isCoordenadorEvento, aprovarUsuario);

// ============================================================
// 🔥 Lista avaliadores vinculados ao evento (para atribuição manual)
// ============================================================
router.get('/por-evento/:eventoId', authenticateAvaliador, async (req, res) => {
    try {
        const { eventoId } = req.params;
        const solicitante = await Avaliador.findById(req.avaliadorId).select('isCoordenador');
        const evento = await Evento.findById(eventoId);
        if (!evento) return res.status(404).json({ success: false, error: 'Evento não encontrado' });

        const souCoordenador = (evento.coordenadores || []).some(id => String(id) === String(req.avaliadorId));
        if (!souCoordenador && !solicitante?.isCoordenador) {
            return res.status(403).json({ success: false, error: 'Acesso negado' });
        }

        const avaliadores = await Avaliador.find({
            eventos: eventoId,
            status: 'Ativo',
            isCoordenador: false
        }).select('nomeCompleto email').sort({ nomeCompleto: 1 });

        res.json({ success: true, avaliadores });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;