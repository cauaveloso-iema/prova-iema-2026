// ============================================================================
// backend/eventos/routes/modelos.js
// ============================================================================

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

let logger = console;
try { logger = require('../../../utils/logger'); } catch (_) {}

let multer = null;
try { multer = require('multer'); } catch (err) { logger.warn('⚠️ [EVENTOS] multer não instalado'); }

const ModeloEvento = require('../models/ModeloEvento');
const { authenticateToken, isSuperAdmin } = require('../middlewares/auth-eventos');
const { processarArquivo } = require('../services/extrair-campos-ia');

let upload = (req, res, next) => next();
try {
    const dir = path.join(__dirname, '..', '..', 'uploads', 'eventos');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    if (multer) {
        const storage = multer.diskStorage({
            destination: (req, file, cb) => cb(null, dir),
            filename: (req, file, cb) => {
                const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
                const ext = path.extname(file.originalname).toLowerCase();
                cb(null, `anexo-${unique}${ext}`);
            }
        });

        upload = multer({
            storage,
            limits: { fileSize: 25 * 1024 * 1024, files: 20 },
            fileFilter: (req, file, cb) => {
                const ext = path.extname(file.originalname).toLowerCase();
                if (['.pdf', '.doc', '.docx', '.txt', '.odt'].includes(ext)) return cb(null, true);
                cb(new Error('Tipo não permitido: ' + ext));
            }
        }).array('anexos', 20);
    }
} catch (err) {
    logger.warn('⚠️ [EVENTOS] Erro no multer:', err.message);
}

function sanitizarAnexos(anexosPayload) {
    const tiposAnexoValidos = ['edital', 'formulario', 'termo_lgpd', 'termo_imagem', 'outro', 'ficha_avaliacao'];

    return anexosPayload.map(a => {
        if (!a.arquivo || !a.nomeOriginal) throw new Error('Anexo sem nome/arquivo');
        if (!tiposAnexoValidos.includes(a.tipo)) a.tipo = 'outro';

        const ehEdital = a.tipo === 'edital';

        a.campos = ehEdital ? [] : (Array.isArray(a.campos) ? a.campos : []);
        a.camposRepetiveis = ehEdital ? [] : (Array.isArray(a.camposRepetiveis) ? a.camposRepetiveis : []);
        a.repetivel = ehEdital ? false : !!a.repetivel;
        a.isAvaliativo = ehEdital ? false : !!a.isAvaliativo;

        a.solicitaAnexo = !!a.solicitaAnexo;
        a.labelSolicitacaoAnexo = (a.labelSolicitacaoAnexo || '').trim();
        a.anexoSolicitacaoObrigatorio = !!a.anexoSolicitacaoObrigatorio;
        a.numAvaliadores = Math.max(1, parseInt(a.numAvaliadores) || 1);

        a.modoDistribuicao = ['aleatorio', 'manual'].includes(a.modoDistribuicao)
            ? a.modoDistribuicao
            : 'aleatorio';
        a.calcularMedia = a.calcularMedia !== false;
        a.tipoMedia = ['aritmetica', 'ponderada'].includes(a.tipoMedia)
            ? a.tipoMedia
            : 'aritmetica';
        a.exigeAssinaturaAvaliador = !!a.exigeAssinaturaAvaliador;

        if (!ehEdital && Array.isArray(a.criteriosAvaliacao)) {
            a.criteriosAvaliacao = a.criteriosAvaliacao
                .filter(c => c && c.label && String(c.label).trim())
                .map(c => ({
                    label: String(c.label).trim(),
                    descricao: String(c.descricao || '').trim(),
                    notaMaxima: parseFloat(c.notaMaxima) || 5,
                    obrigatorio: c.obrigatorio !== false,
                    origemIA: !!c.origemIA
                }));
        } else {
            a.criteriosAvaliacao = [];
        }

        if (!ehEdital && Array.isArray(a.legendasNotas)) {
            a.legendasNotas = a.legendasNotas
                .filter(l => l && l.label && typeof l.valor !== 'undefined')
                .map(l => ({ valor: parseFloat(l.valor), label: String(l.label).trim() }));
        } else {
            a.legendasNotas = [];
        }

        if (ehEdital) a.informacoesDocumento = '';

        return a;
    });
}

router.get('/', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        const modelos = await ModeloEvento.find({ ativo: true }).sort({ createdAt: -1 }).populate('criadoPor', 'nome email');
        res.json({ success: true, modelos });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/:id', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ success: false, error: 'ID inválido' });
        const modelo = await ModeloEvento.findById(req.params.id);
        if (!modelo) return res.status(404).json({ success: false, error: 'Modelo não encontrado' });
        res.json({ success: true, modelo });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/extrair-campos', authenticateToken, isSuperAdmin, (req, res, next) => {
    upload(req, res, (err) => {
        if (err) return res.status(400).json({ success: false, error: err.message });
        next();
    });
}, async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado' });
        }

        const isEdital = req.body.forcar_edital === 'true';

        let groq = global.groq || null;
        if (!groq && process.env.GROQ_API_KEY) {
            try {
                const Groq = require('groq-sdk');
                groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
            } catch (e) { }
        }

        const arquivosProcessados = [];

        for (const file of req.files) {
            try {
                let r;
                if (isEdital) {
                    r = { tipo: 'edital', campos: [], camposRepetiveis: [], labelGrupoRepetivel: '', quantidadePadrao: 1, maxRepeticoes: 10, criteriosAvaliacao: [], informacoesDocumento: '', legendasNotas: [], exigeAssinatura: false, isAvaliativo: false, fonte: 'edital' };
                } else {
                    r = await processarArquivo(file.path, file.originalname, groq);
                }

                const ehEdital = r.tipo === 'edital';

                arquivosProcessados.push({
                    nomeOriginal: file.originalname,
                    arquivo: `/uploads/eventos/${file.filename}`,
                    mimetype: file.mimetype,
                    tamanho: file.size,
                    tipoAnexo: r.tipo,
                    campos: ehEdital ? [] : (r.campos || []),
                    repetivel: ehEdital ? false : (r.camposRepetiveis && r.camposRepetiveis.length > 0),
                    labelGrupoRepetivel: ehEdital ? '' : (r.labelGrupoRepetivel || ''),
                    camposRepetiveis: ehEdital ? [] : (r.camposRepetiveis || []),
                    quantidadePadrao: ehEdital ? 1 : (r.quantidadePadrao || 1),
                    maxRepeticoes: ehEdital ? 10 : (r.maxRepeticoes || 10),
                    exigeAssinatura: ehEdital ? false : !!r.exigeAssinatura,
                    isAvaliativo: ehEdital ? false : !!r.isAvaliativo,
                    criteriosAvaliacao: ehEdital ? [] : (r.criteriosAvaliacao || []),
                    informacoesDocumento: ehEdital ? '' : (r.informacoesDocumento || ''),
                    legendasNotas: ehEdital ? [] : (r.legendasNotas || []),
                    modoDistribuicao: 'aleatorio',
                    calcularMedia: true,
                    tipoMedia: 'aritmetica',
                    exigeAssinaturaAvaliador: false,
                    fonte: ehEdital ? 'edital' : r.fonte
                });
            } catch (e) {
                logger.error(`Erro extraindo ${file.originalname}:`, e);
                arquivosProcessados.push({
                    nomeOriginal: file.originalname,
                    arquivo: `/uploads/eventos/${file.filename}`,
                    tipoAnexo: 'outro',
                    campos: [],
                    criteriosAvaliacao: [],
                    modoDistribuicao: 'aleatorio',
                    calcularMedia: true,
                    tipoMedia: 'aritmetica',
                    exigeAssinaturaAvaliador: false,
                    fonte: 'erro',
                    erro: e.message
                });
            }
        }

        const fonteFinal = arquivosProcessados.some(a => a.fonte === 'ia') ? 'ia'
            : (arquivosProcessados.some(a => a.fonte === 'regex') ? 'regex' : (isEdital ? 'edital' : 'padrao'));
        const mensagens = { ia: '🤖 Extraído com IA', regex: '🔍 Extraído localmente', padrao: '📋 Template padrão', edital: '📄 Edital anexado (sem extração)' };

        res.json({
            success: true,
            arquivos: arquivosProcessados,
            camposSugeridos: arquivosProcessados.flatMap(a => a.campos || []),
            fonte: fonteFinal,
            mensagem: mensagens[fonteFinal]
        });
    } catch (error) {
        logger.error('❌ [EVENTOS] Erro na extração:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/', authenticateToken, isSuperAdmin, (req, res, next) => upload(req, res, next), async (req, res) => {
    try {
        const {
            nomeModelo, descricao, anexos, requerAvaliacao, permiteMultiplasInscricoes,
            usarSistemaCotas, publicoLaudoCotas, labelLaudoCotas, laudoCotasObrigatorio,
            anexosExtras, // 🔥
            usarCategorias, labelCategorias, categorias, categoriaObrigatoria // 🔥 NOVO
        } = req.body;

        if (!nomeModelo || !nomeModelo.trim()) return res.status(400).json({ success: false, error: 'Nome do modelo é obrigatório' });

        let anexosPayload = [];
        if (anexos) {
            try { anexosPayload = typeof anexos === 'string' ? JSON.parse(anexos) : anexos; }
            catch (e) { return res.status(400).json({ success: false, error: 'anexos inválido' }); }
        }
        anexosPayload = sanitizarAnexos(anexosPayload);

        let extrasPayload = [];
        if (anexosExtras) {
            try { 
                const parsed = typeof anexosExtras === 'string' ? JSON.parse(anexosExtras) : anexosExtras; 
                if (Array.isArray(parsed)) {
                    extrasPayload = parsed
                        .filter(e => e && e.label && e.label.trim())
                        .map(e => ({ label: e.label.trim(), obrigatorio: !!e.obrigatorio, ajuda: e.ajuda || '' }));
                }
            } catch (e) {}
        }

        let categoriasPayload = [];
        if (categorias) {
            try {
                const parsed = typeof categorias === 'string' ? JSON.parse(categorias) : categorias;
                if (Array.isArray(parsed)) {
                    categoriasPayload = parsed
                        .filter(c => c && c.label && c.label.trim())
                        .map(c => ({ label: c.label.trim() }));
                }
            } catch (e) {}
        }

        const novoModelo = new ModeloEvento({
            nomeModelo: nomeModelo.trim(),
            descricao: (descricao || '').trim(),
            anexos: anexosPayload,
            anexosExtras: extrasPayload,
            usarCategorias: usarCategorias === 'true' || usarCategorias === true,
            labelCategorias: (labelCategorias || 'Categoria / Modalidade').trim(),
            categorias: categoriasPayload,
            categoriaObrigatoria: categoriaObrigatoria !== 'false' && categoriaObrigatoria !== false,
            criadoPor: req.userId,
            requerAvaliacao: requerAvaliacao === 'true' || requerAvaliacao === true,
            permiteMultiplasInscricoes: permiteMultiplasInscricoes === 'true' || permiteMultiplasInscricoes === true,
            usarSistemaCotas: usarSistemaCotas === 'true' || usarSistemaCotas === true,
            publicoLaudoCotas: ['professor', 'aluno', 'ambos'].includes(publicoLaudoCotas) ? publicoLaudoCotas : 'professor',
            labelLaudoCotas: (labelLaudoCotas || 'Laudo Médico').trim(),
            laudoCotasObrigatorio: laudoCotasObrigatorio !== 'false' && laudoCotasObrigatorio !== false
        });
        await novoModelo.save();
        res.status(201).json({ success: true, modelo: novoModelo });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.put('/:id', authenticateToken, isSuperAdmin, (req, res, next) => upload(req, res, next), async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ success: false, error: 'ID inválido' });
        const modelo = await ModeloEvento.findById(req.params.id);
        if (!modelo) return res.status(404).json({ success: false, error: 'Modelo não encontrado' });

        const {
            nomeModelo, descricao, anexos, requerAvaliacao, permiteMultiplasInscricoes,
            usarSistemaCotas, publicoLaudoCotas, labelLaudoCotas, laudoCotasObrigatorio,
            anexosExtras,
            usarCategorias, labelCategorias, categorias, categoriaObrigatoria // 🔥 NOVO
        } = req.body;

        if (nomeModelo) modelo.nomeModelo = nomeModelo.trim();
        if (descricao !== undefined) modelo.descricao = descricao.trim();
        if (requerAvaliacao !== undefined) modelo.requerAvaliacao = requerAvaliacao === 'true' || requerAvaliacao === true;
        if (permiteMultiplasInscricoes !== undefined) {
            modelo.permiteMultiplasInscricoes = permiteMultiplasInscricoes === 'true' || permiteMultiplasInscricoes === true;
        }

        if (usarSistemaCotas !== undefined) modelo.usarSistemaCotas = usarSistemaCotas === 'true' || usarSistemaCotas === true;
        if (publicoLaudoCotas !== undefined && ['professor', 'aluno', 'ambos'].includes(publicoLaudoCotas)) {
            modelo.publicoLaudoCotas = publicoLaudoCotas;
        }
        if (labelLaudoCotas !== undefined) modelo.labelLaudoCotas = (labelLaudoCotas || 'Laudo Médico').trim();
        if (laudoCotasObrigatorio !== undefined) {
            modelo.laudoCotasObrigatorio = laudoCotasObrigatorio !== 'false' && laudoCotasObrigatorio !== false;
        }

        if (anexos) {
            try {
                const parsed = typeof anexos === 'string' ? JSON.parse(anexos) : anexos;
                if (Array.isArray(parsed)) {
                    modelo.anexos = sanitizarAnexos(parsed);
                }
            } catch (e) { return res.status(400).json({ success: false, error: 'anexos inválido' }); }
        }

        if (anexosExtras) {
            try {
                const parsed = typeof anexosExtras === 'string' ? JSON.parse(anexosExtras) : anexosExtras;
                if (Array.isArray(parsed)) {
                    modelo.anexosExtras = parsed
                        .filter(e => e && e.label && e.label.trim())
                        .map(e => ({ label: e.label.trim(), obrigatorio: !!e.obrigatorio, ajuda: e.ajuda || '' }));
                }
            } catch (e) {}
        }

        if (usarCategorias !== undefined) modelo.usarCategorias = usarCategorias === 'true' || usarCategorias === true;
        if (labelCategorias !== undefined) modelo.labelCategorias = (labelCategorias || 'Categoria / Modalidade').trim();
        if (categoriaObrigatoria !== undefined) modelo.categoriaObrigatoria = categoriaObrigatoria !== 'false' && categoriaObrigatoria !== false;
        
        if (categorias) {
            try {
                const parsed = typeof categorias === 'string' ? JSON.parse(categorias) : categorias;
                if (Array.isArray(parsed)) {
                    modelo.categorias = parsed
                        .filter(c => c && c.label && c.label.trim())
                        .map(c => ({ label: c.label.trim() }));
                }
            } catch (e) {}
        }

        await modelo.save();
        res.json({ success: true, modelo });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/:id', authenticateToken, isSuperAdmin, async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ success: false, error: 'ID inválido' });
        const modelo = await ModeloEvento.findByIdAndUpdate(req.params.id, { ativo: false }, { new: true });
        if (!modelo) return res.status(404).json({ success: false, error: 'Modelo não encontrado' });
        res.json({ success: true, mensagem: 'Modelo removido' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;