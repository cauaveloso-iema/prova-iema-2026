// ============================================================================
// backend/eventos/routes/publico.js
// ============================================================================

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

let logger = console;
try { logger = require('../../../utils/logger'); } catch (_) {}

let multer = null;
try { multer = require('multer'); } catch (_) {}

const Evento = require('../models/Evento');
const ParticipanteEvento = require('../models/ParticipanteEvento');
const Inscricao = require('../models/Inscricao');
const SessaoAssinatura = require('../models/SessaoAssinaturaEvento');

// ---- Normalização ----
function norm(s) {
    return String(s == null ? '' : s)
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .trim();
}

const CAMPOS_RESPONSAVEL_NORM = [
    'nome do responsavel', 'responsavel', 'nome responsavel',
    'naturalidade', 'estado civil', 'rg', 'cpf',
    'endereco (rua/avenida)', 'endereco (av/rua)', 'endereco', 'rua',
    'numero', 'nº', 'bairro', 'cep', 'municipio', 'municipio de', 'cidade',
    'estado', 'uf',
    'relacao (pai, mae ou representante legal)', '(pai, mae ou representante legal)',
    'qualidade (pai, mae ou representante legal)', 'data'
];

function ehCampoResponsavel(label) {
    const l = norm(label);
    return CAMPOS_RESPONSAVEL_NORM.some(c => l === c || l.includes(c));
}

function temValorParaCampo(dados, label) {
    if (!dados || !label) return false;
    if (dados[label] !== undefined && String(dados[label]).trim() !== '') return true;

    const labelNorm = norm(label);
    for (const [k, v] of Object.entries(dados)) {
        if (v === undefined || v === null || String(v).trim() === '') continue;
        if (norm(k) === labelNorm) return true;
    }

    const sufixoAluno = new RegExp(`_aluno_\\d+$`);
    for (const [k, v] of Object.entries(dados)) {
        if (v === undefined || v === null || String(v).trim() === '') continue;
        if (norm(k).replace(sufixoAluno, '') === labelNorm) return true;
    }

    const prefixoEstudante = /^estudante\[\d+\]\./;
    for (const [k, v] of Object.entries(dados)) {
        if (v === undefined || v === null || String(v).trim() === '') continue;
        const kN = norm(k);
        if (prefixoEstudante.test(kN) && kN.replace(prefixoEstudante, '') === labelNorm) return true;
    }

    if (ehCampoResponsavel(label)) {
        for (const [k, v] of Object.entries(dados)) {
            if (v === undefined || v === null || String(v).trim() === '') continue;
            if (norm(k).includes(labelNorm)) return true;
        }
    }
    return false;
}

// ---- Multer anexo do participante ----
let uploadParticipante = (req, res, next) => next();
try {
    const dir = path.join(__dirname, '..', '..', 'uploads', 'eventos', 'participantes');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    if (multer) {
        const storage = multer.diskStorage({
            destination: (req, file, cb) => cb(null, dir),
            filename: (req, file, cb) => {
                const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
                const ext = path.extname(file.originalname).toLowerCase();
                cb(null, `participante-${unique}${ext}`);
            }
        });
        uploadParticipante = multer({
            storage,
            limits: { fileSize: 10 * 1024 * 1024, files: 1 },
            fileFilter: (req, file, cb) => {
                const ext = path.extname(file.originalname).toLowerCase();
                if (['.pdf', '.png', '.jpg', '.jpeg', '.doc', '.docx'].includes(ext)) return cb(null, true);
                cb(new Error('Tipo não permitido: ' + ext));
            }
        }).single('anexo');
    }
} catch (err) {
    logger.warn('⚠️ [EVENTOS] Multer participante não configurado:', err.message);
}

let pdfParse = null;
try { pdfParse = require('pdf-parse'); } catch (_) {}
let mammoth = null;
try { mammoth = require('mammoth'); } catch (_) {}

async function lerTextoArquivo(caminhoRelativo) {
    if (!caminhoRelativo) return '';
    const rel = caminhoRelativo.replace(/^\/+/, '');
    const abs = path.join(__dirname, '..', '..', rel);
    if (!fs.existsSync(abs)) return '';

    const ext = path.extname(abs).toLowerCase();
    try {
        if (ext === '.txt') return fs.readFileSync(abs, 'utf8');
        if (ext === '.pdf' && pdfParse) {
            const buffer = fs.readFileSync(abs);
            const data = await pdfParse(buffer);
            return data.text || '';
        }
        if (ext === '.docx' && mammoth) {
            const result = await mammoth.extractRawText({ path: abs });
            return result.value || '';
        }
    } catch (err) {
        logger.error(`❌ [EVENTOS] Erro lendo arquivo:`, err.message);
    }
    return '';
}

function gerarProtocolo() {
    return 'EVT-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
}

function opcionalmenteAutenticar(req, res, next) {
    const auth = req.headers['authorization'];
    const token = auth && auth.split(' ')[1];
    if (!token) return next();

    try {
        jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
            if (err) return next();
            if (!decoded || decoded.type !== 'participante_eventos') return next();
            try {
                const p = await ParticipanteEvento.findById(decoded.id);
                if (p) req.participanteId = p._id.toString();
            } catch (_) {}
            next();
        });
    } catch (e) {
        return next();
    }
}

function autenticarParticipante(req, res, next) {
    const auth = req.headers['authorization'];
    const token = auth && auth.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, error: 'Token não fornecido' });

    try {
        jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
            if (err) return res.status(403).json({ success: false, error: 'Token inválido' });
            if (!decoded || decoded.type !== 'participante_eventos') {
                return res.status(403).json({ success: false, error: 'Token inválido' });
            }
            req.participanteId = decoded.id;
            next();
        });
    } catch (e) {
        return res.status(403).json({ success: false, error: 'Token inválido' });
    }
}

// ============================================================================
// SESSÕES DE ASSINATURA
// ============================================================================

router.post('/sessoes-assinatura', async (req, res) => {
    try {
        const { sessaoId, tipo, dadosAtendimento } = req.body;
        if (!sessaoId || String(sessaoId).length < 6) {
            return res.status(400).json({ success: false, error: 'sessaoId inválido' });
        }
        if (!tipo) {
            return res.status(400).json({ success: false, error: 'tipo obrigatório' });
        }

        const existente = await SessaoAssinatura.findOne({ sessaoId });
        if (existente) {
            return res.json({ success: true, sessao: existente, jaExistia: true });
        }

        const nova = new SessaoAssinatura({
            sessaoId,
            tipo,
            dadosAtendimento: dadosAtendimento || {},
            status: 'aguardando',
            expiraEm: new Date(Date.now() + 30 * 60 * 1000)
        });

        await nova.save();
        res.status(201).json({ success: true, sessao: nova });
    } catch (error) {
        logger.error('❌ [EVENTOS] Erro ao criar sessão:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/sessoes-assinatura/:id', async (req, res) => {
    try {
        const sessao = await SessaoAssinatura.findOne({ sessaoId: req.params.id }).lean();
        if (!sessao) {
            return res.status(404).json({ success: false, error: 'Sessão não encontrada' });
        }
        if (sessao.expiraEm && new Date() > new Date(sessao.expiraEm) && sessao.status === 'aguardando') {
            sessao.status = 'cancelado';
        }
        res.json({ success: true, sessao });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.put('/sessoes-assinatura/:id/assinar', async (req, res) => {
    try {
        const { assinaturaBase64, assinanteNome } = req.body;
        if (!assinaturaBase64 || !String(assinaturaBase64).startsWith('data:image/')) {
            return res.status(400).json({ success: false, error: 'Assinatura inválida' });
        }

        const sessao = await SessaoAssinatura.findOne({ sessaoId: req.params.id });
        if (!sessao) return res.status(404).json({ success: false, error: 'Sessão não encontrada' });
        if (sessao.expiraEm && new Date() > new Date(sessao.expiraEm)) {
            return res.status(400).json({ success: false, error: 'Sessão expirada' });
        }
        if (sessao.status === 'assinado') {
            return res.status(400).json({ success: false, error: 'Sessão já assinada' });
        }

        sessao.status = 'assinado';
        sessao.assinaturaBase64 = assinaturaBase64;
        sessao.assinadaPorNome = assinanteNome || 'Responsável';
        sessao.assinadaEm = new Date();
        await sessao.save();
        res.json({ success: true, sessao });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/sessoes-assinatura/:id', async (req, res) => {
    try {
        const sessao = await SessaoAssinatura.findOne({ sessaoId: req.params.id });
        if (!sessao) return res.status(404).json({ success: false, error: 'Sessão não encontrada' });
        sessao.status = 'cancelado';
        await sessao.save();
        res.json({ success: true, sessao });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// CADASTRO / LOGIN
// ============================================================================

router.post('/cadastro', async (req, res) => {
    try {
        const { nomeCompleto, email, senha, dataNascimento, genero, cpf, rg, telefone, instituicao, funcao, serieEstudantes, lgpd } = req.body;
        if (!nomeCompleto || !email || !senha) return res.status(400).json({ success: false, error: 'Nome, e-mail e senha são obrigatórios' });
        if (senha.length < 6) return res.status(400).json({ success: false, error: 'Senha deve ter no mínimo 6 caracteres' });
        if (!lgpd || lgpd.aceito !== true) return res.status(400).json({ success: false, error: 'Aceite os termos LGPD' });

        const normalizado = String(email).trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizado)) return res.status(400).json({ success: false, error: 'E-mail inválido' });

        const cryptoUtils = require('../../utils/crypto-utils');
        const emailHash = cryptoUtils.hash(normalizado);
        if (await ParticipanteEvento.findOne({ emailHash })) return res.status(409).json({ success: false, error: 'E-mail já cadastrado. Faça login.' });

        const participante = new ParticipanteEvento({
            nomeCompleto: nomeCompleto.trim(),
            dataNascimento: dataNascimento ? new Date(dataNascimento) : null,
            genero: genero || null,
            instituicao: instituicao || null,
            funcao: funcao || null,
            serieEstudantes: serieEstudantes || null,
            consentimentoLGPD: { aceito: true, dataAceite: new Date(), versaoTermo: lgpd.versaoTermo || '1.0' }
        });

        participante.setEmail(normalizado);
        await participante.setSenha(senha);
        if (cpf) participante.setCPF(cpf);
        if (rg) participante.setRG(rg);
        if (telefone) participante.setTelefone(telefone);
        await participante.save();

        const token = jwt.sign({ id: participante._id, type: 'participante_eventos', email: normalizado }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.status(201).json({ success: true, token, participante: participante.toSafeJSON({ incluirSensiveis: true }) });
    } catch (error) {
        logger.error('❌ [EVENTOS] Erro no cadastro:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { email, senha } = req.body;
        if (!email || !senha) return res.status(400).json({ success: false, error: 'E-mail e senha obrigatórios' });
        const cryptoUtils = require('../../utils/crypto-utils');
        const emailHash = cryptoUtils.hash(String(email).trim().toLowerCase());
        const participante = await ParticipanteEvento.findOne({ emailHash }).select('+senhaHash');
        if (!participante) return res.status(401).json({ success: false, error: 'E-mail ou senha incorretos' });
        const ok = await participante.verificarSenha(senha);
        if (!ok) return res.status(401).json({ success: false, error: 'E-mail ou senha incorretos' });
        const token = jwt.sign({ id: participante._id, type: 'participante_eventos', email: participante.getEmail() }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, token, participante: participante.toSafeJSON({ incluirSensiveis: true }) });
    } catch (error) {
        logger.error('❌ [EVENTOS] Erro no login:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// UPLOAD DE ANEXO
// ============================================================================

router.post('/:slug/anexo-participante', autenticarParticipante, (req, res, next) => {
    uploadParticipante(req, res, (err) => {
        if (err) return res.status(400).json({ success: false, error: err.message });
        next();
    });
}, async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado' });

        const evento = await Evento.findOne({ slug: req.params.slug, status: 'Publicado' }).populate('modeloId');
        if (!evento) return res.status(404).json({ success: false, error: 'Evento não encontrado' });

        const existente = await Inscricao.findOne({ participanteId: req.participanteId, eventoId: evento._id });
        if (existente && !evento.permiteMultiplasInscricoes) {
            return res.status(409).json({ success: false, error: 'Você já está inscrito', protocolo: existente.protocolo });
        }

        const url = `/uploads/eventos/participantes/${req.file.filename}`;
        return res.status(201).json({
            success: true,
            arquivo: url,
            nomeOriginal: req.file.originalname,
            mimetype: req.file.mimetype,
            tamanho: req.file.size
        });
    } catch (error) {
        logger.error('❌ [EVENTOS] Erro no upload de anexo:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// POST /:slug/inscrever — respeita permiteMultiplasInscricoes e sistema de cotas
// ============================================================================
router.post('/:slug/inscrever', autenticarParticipante, async (req, res) => {
    try {
        const evento = await Evento.findOne({ slug: req.params.slug }).populate('modeloId');
        if (!evento) return res.status(404).json({ success: false, error: 'Evento não encontrado' });
        const agora = new Date();
        if (evento.status !== 'Publicado') return res.status(400).json({ success: false, error: 'Evento fechado' });
        if (agora < new Date(evento.dataInicioInscricao)) return res.status(400).json({ success: false, error: 'Inscrições ainda não começaram' });
        if (agora > new Date(evento.dataFimInscricao)) return res.status(400).json({ success: false, error: 'Inscrições encerradas' });
        if (evento.vagas !== null && evento.totalParticipantes >= evento.vagas) return res.status(400).json({ success: false, error: 'Vagas esgotadas' });

        const existente = await Inscricao.findOne({ participanteId: req.participanteId, eventoId: evento._id });
        if (existente && !evento.permiteMultiplasInscricoes) {
            return res.status(409).json({
                success: false,
                error: 'Você já está inscrito neste evento',
                protocolo: existente.protocolo,
                jaInscrito: true
            });
        }

        const participante = await ParticipanteEvento.findById(req.participanteId);
        if (!participante) return res.status(404).json({ success: false, error: 'Participante não encontrado' });

        const { dadosPreenchidos, assinaturaBase64, assinaturasPorAnexo, anexosParticipante } = req.body;
        const dados = dadosPreenchidos && typeof dadosPreenchidos === 'object' ? dadosPreenchidos : {};

        const dadosAuto = {
            'Nome Completo': participante.nomeCompleto,
            'E-mail': participante.getEmail(),
            'CPF': participante.getCPF(),
            'RG': participante.getRG(),
            'Telefone': participante.getTelefone(),
            'Instituição': participante.instituicao,
            'Função/Cargo': participante.funcao
        };
        for (const [k, v] of Object.entries(dadosAuto)) {
            if (v && !dados[k]) dados[k] = String(v);
        }

        const assinaturasMap = (assinaturasPorAnexo && typeof assinaturasPorAnexo === 'object')
            ? assinaturasPorAnexo
            : (assinaturaBase64 ? { principal: assinaturaBase64 } : {});

        const existeAssinaturaPara = (anexo) => {
            const chaves = [anexo.labelCustom, anexo.nomeOriginal, anexo.tipo].filter(Boolean);
            for (const k of chaves) {
                const kn = norm(k);
                for (const chave of Object.keys(assinaturasMap)) {
                    if (norm(chave).includes(kn)) return true;
                }
            }
            return false;
        };

        const modelo = evento.modeloId;
        for (const anexo of (modelo?.anexos || [])) {
            if (anexo.isAvaliativo) continue;
            if (anexo.tipo === 'edital') continue;

            for (const campo of (anexo.campos || [])) {
                if (!campo.obrigatorio) continue;
                if (temValorParaCampo(dados, campo.label)) continue;

                if (ehCampoResponsavel(campo.label)) {
                    const qualquerAlunoPreencheu = Object.keys(dados).some(k => {
                        const kN = norm(k);
                        const labelN = norm(campo.label);
                        const temValor = dados[k] !== undefined && dados[k] !== null && String(dados[k]).trim() !== '';
                        return temValor && kN.includes(labelN);
                    });
                    if (qualquerAlunoPreencheu) continue;
                }

                return res.status(400).json({ success: false, error: `Campo obrigatório: ${campo.label}` });
            }

            if (anexo.repetivel && Array.isArray(anexo.camposRepetiveis) && anexo.camposRepetiveis.length > 0) {
                const grupoNorm = norm(anexo.labelGrupoRepetivel || 'Estudante');
                const porIndice = {};
                Object.keys(dados).forEach(k => {
                    const kn = norm(k);
                    const m = kn.match(/^([^\[]+)\[(\d+)\]\.(.+)$/);
                    if (!m) return;
                    if (norm(m[1]) !== grupoNorm) return;
                    const i = parseInt(m[2]);
                    if (!porIndice[i]) porIndice[i] = {};
                    porIndice[i][m[3]] = dados[k];
                });
                Object.keys(porIndice).forEach(i => {
                    for (const c of anexo.camposRepetiveis) {
                        if (c.obrigatorio) {
                            const campoNorm = norm(c.label);
                            const encontrado = Object.keys(porIndice[i]).some(k => norm(k).includes(campoNorm));
                            if (!encontrado) {
                                return res.status(400).json({ success: false, error: `Campo obrigatório (${anexo.labelGrupoRepetivel || 'Estudante'} ${parseInt(i)+1}): ${c.label}` });
                            }
                        }
                    }
                });
            }

            if (anexo.exigeAssinatura) {
                const temPorAnexo = existeAssinaturaPara(anexo);
                const temBase64 = assinaturaBase64 && String(assinaturaBase64).trim() !== '';
                if (!temPorAnexo && !temBase64) {
                    return res.status(400).json({
                        success: false,
                        error: `Assinatura obrigatória para o termo: ${anexo.labelCustom || anexo.nomeOriginal}`
                    });
                }
            }

            if (anexo.solicitaAnexo && anexo.anexoSolicitacaoObrigatorio) {
                const chave = anexo.labelSolicitacaoAnexo || anexo.labelCustom || anexo.nomeOriginal;
                if (!anexosParticipante || !anexosParticipante[chave]) {
                    return res.status(400).json({ success: false, error: `Anexo obrigatório: ${chave}` });
                }
            }
        }

        // Validação de cotas
        if (modelo?.usarSistemaCotas) {
            const usaCota = dados['__usa_cota'] === 'sim';
            if (usaCota) {
                const laudoKey = `__laudo_cota`;
                if (modelo.laudoCotasObrigatorio && (!anexosParticipante || !anexosParticipante[laudoKey])) {
                    return res.status(400).json({
                        success: false,
                        error: `O laudo é obrigatório para quem opta pelo sistema de cotas.`
                    });
                }
            }
        }

        function sanitizarChaves(obj) {
            if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
            const out = {};
            for (const [k, v] of Object.entries(obj)) {
                const chaveSegura = String(k).replace(/\./g, '_').replace(/\[/g, '_').replace(/\]/g, '');
                out[chaveSegura] = v;
            }
            return out;
        }

        const dadosSanitizados = sanitizarChaves(dados);
        const assinaturasSanitizadas = sanitizarChaves(assinaturasMap);
        const anexosSanitizados = sanitizarChaves(anexosParticipante || {});

        const inscricao = new Inscricao({
            participanteId: req.participanteId,
            eventoId: evento._id,
            dadosPreenchidos: dadosSanitizados,
            protocolo: gerarProtocolo(),
            status: 'Pendente',
            ipInscricao: req.ip,
            userAgent: req.headers['user-agent'] || null,
            assinaturaBase64: assinaturaBase64 || Object.values(assinaturasMap)[0] || null,
            assinaturasPorAnexo: assinaturasSanitizadas,
            anexosParticipante: anexosSanitizados
        });

        await inscricao.save();
        await Evento.findByIdAndUpdate(evento._id, { $inc: { totalParticipantes: 1 } });
        res.status(201).json({
            success: true,
            inscricao: {
                _id: inscricao._id,
                protocolo: inscricao.protocolo,
                status: inscricao.status,
                createdAt: inscricao.createdAt
            }
        });
    } catch (error) {
        logger.error('❌ [EVENTOS] Erro ao inscrever:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// GET /minhas-inscricoes
// ============================================================================
router.get('/minhas-inscricoes', autenticarParticipante, async (req, res) => {
    try {
        const inscricoes = await Inscricao.find({ participanteId: req.participanteId })
            .sort({ createdAt: -1 })
            .populate({ path: 'eventoId', select: 'titulo slug status dataInicioInscricao dataFimInscricao dataInicioEvento dataFimEvento vagas totalParticipantes local descricaoPublica permiteMultiplasInscricoes' })
            .lean();
        const agora = new Date();
        const resultado = inscricoes.filter(i => i.eventoId).map(i => {
            const ev = i.eventoId;
            let categoria = 'encerradas';
            if (ev.status === 'Publicado' && ev.dataFimInscricao && agora <= new Date(ev.dataFimInscricao)) categoria = 'abertas';
            else if (ev.status === 'Encerrado' || (ev.dataFimEvento && agora > new Date(ev.dataFimEvento))) categoria = 'concluidas';
            return {
                _id: i._id, protocolo: i.protocolo, status: i.status, createdAt: i.createdAt,
                dadosPreenchidos: Object.fromEntries(Object.entries(i.dadosPreenchidos || {}).filter(([k]) => k !== '__assinaturas')),
                anexosParticipante: i.anexosParticipante || {},
                temAssinatura: !!i.assinaturaBase64, categoria,
                evento: {
                    _id: ev._id, titulo: ev.titulo, slug: ev.slug, status: ev.status, local: ev.local,
                    descricaoPublica: ev.descricaoPublica,
                    dataInicioInscricao: ev.dataInicioInscricao, dataFimInscricao: ev.dataFimInscricao,
                    dataInicioEvento: ev.dataInicioEvento, dataFimEvento: ev.dataFimEvento,
                    permiteMultiplasInscricoes: !!ev.permiteMultiplasInscricoes
                }
            };
        });
        res.json({ success: true, inscricoes: resultado });
    } catch (error) {
        logger.error('❌ [EVENTOS] Erro em /minhas-inscricoes:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// GET /:slug (público) — CORRIGIDO: repassa categorias, anexosExtras, cotas
// ============================================================================
router.get('/:slug', opcionalmenteAutenticar, async (req, res) => {
    if (req.params.slug === 'sessoes-assinatura') {
        return res.status(404).json({ success: false, error: 'Rota específica tratada acima' });
    }

    try {
        const evento = await Evento.findOne({ slug: req.params.slug, status: 'Publicado' })
            .populate('modeloId')
            .lean();

        if (!evento) return res.status(404).json({ success: false, error: 'Evento não encontrado' });

        const agora = new Date();
        const inscricaoAberta = evento.status === 'Publicado' &&
            evento.dataInicioInscricao && evento.dataFimInscricao &&
            agora >= new Date(evento.dataInicioInscricao) &&
            agora <= new Date(evento.dataFimInscricao) &&
            (evento.vagas === null || evento.totalParticipantes < evento.vagas);

        const modelo = evento.modeloId || {};

        const anexos = await Promise.all((modelo.anexos || []).map(async (a) => {
            const ehEdital = a.tipo === 'edital';
            let textoArquivo = '';
            if (a.exigeAssinatura && !ehEdital) {
                textoArquivo = await lerTextoArquivo(a.arquivo);
            }
            return {
                tipo: a.tipo,
                labelCustom: a.labelCustom || '',
                nomeOriginal: a.nomeOriginal,
                arquivo: a.arquivo,
                campos: ehEdital ? [] : (a.campos || []),
                repetivel: ehEdital ? false : !!a.repetivel,
                labelGrupoRepetivel: ehEdital ? '' : (a.labelGrupoRepetivel || ''),
                camposRepetiveis: ehEdital ? [] : (a.camposRepetiveis || []),
                quantidadePadrao: ehEdital ? 1 : (a.quantidadePadrao || 1),
                maxRepeticoes: ehEdital ? 10 : (a.maxRepeticoes || 10),
                exigeAssinatura: ehEdital ? false : !!a.exigeAssinatura,
                exibeModalLeitura: ehEdital ? false : (a.exibeModalLeitura !== false),
                tipoDadosTermo: ehEdital ? 'auto' : (a.tipoDadosTermo || 'auto'),
                textoArquivo: textoArquivo,
                solicitaAnexo: ehEdital ? false : !!a.solicitaAnexo,
                labelSolicitacaoAnexo: ehEdital ? '' : (a.labelSolicitacaoAnexo || ''),
                anexoSolicitacaoObrigatorio: ehEdital ? false : !!a.anexoSolicitacaoObrigatorio,
                isAvaliativo: ehEdital ? false : !!a.isAvaliativo,
                numAvaliadores: ehEdital ? 1 : (a.numAvaliadores || 1)
            };
        }));

        let perfilParticipante = null;
        let jaInscritoInfo = null;

        if (req.participanteId) {
            const p = await ParticipanteEvento.findById(req.participanteId);
            if (p) perfilParticipante = p.toSafeJSON({ incluirSensiveis: true });

            const existente = await Inscricao.findOne({
                participanteId: req.participanteId,
                eventoId: evento._id
            }).select('protocolo status createdAt').lean();

            if (existente) {
                jaInscritoInfo = {
                    jaInscrito: true,
                    protocolo: existente.protocolo,
                    status: existente.status,
                    dataInscricao: existente.createdAt
                };
            }
        }

        // 🔥 Sistema de cotas (do modelo)
        const sistemaCotas = modelo.usarSistemaCotas ? {
            usarSistemaCotas: true,
            publicoLaudoCotas: modelo.publicoLaudoCotas || 'professor',
            labelLaudoCotas: modelo.labelLaudoCotas || 'Laudo Médico',
            laudoCotasObrigatorio: modelo.laudoCotasObrigatorio !== false
        } : null;

        // 🔥 Categorias (do modelo)
        const usarCategorias = !!modelo.usarCategorias;
        const labelCategorias = modelo.labelCategorias || 'Categoria / Modalidade';
        const categoriaObrigatoria = modelo.categoriaObrigatoria !== false;
        const categorias = Array.isArray(modelo.categorias) ? modelo.categorias : [];

        // 🔥 Anexos extras (do modelo)
        const anexosExtras = Array.isArray(modelo.anexosExtras)
            ? modelo.anexosExtras.map(e => ({
                label: e.label,
                obrigatorio: !!e.obrigatorio,
                ajuda: e.ajuda || ''
            }))
            : [];

        res.json({
            success: true,
            evento: {
                _id: evento._id, titulo: evento.titulo, slug: evento.slug,
                descricaoPublica: evento.descricaoPublica, local: evento.local,
                publicoAlvo: evento.publicoAlvo,
                dataInicioInscricao: evento.dataInicioInscricao,
                dataFimInscricao: evento.dataFimInscricao,
                dataInicioEvento: evento.dataInicioEvento,
                dataFimEvento: evento.dataFimEvento,
                vagas: evento.vagas, totalParticipantes: evento.totalParticipantes,
                inscricaoAberta,
                permiteMultiplasInscricoes: !!evento.permiteMultiplasInscricoes,

                // 🔥 CATEGORIAS
                usarCategorias,
                labelCategorias,
                categoriaObrigatoria,
                categorias,

                // 🔥 ANEXOS EXTRAS
                anexosExtras
            },
            sistemaCotas,
            anexos,
            perfilParticipante,
            jaInscritoInfo
        });
    } catch (error) {
        logger.error('❌ [EVENTOS] Erro ao buscar evento público:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;