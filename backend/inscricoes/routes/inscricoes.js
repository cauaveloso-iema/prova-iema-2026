// ============================================================================
// backend/inscricoes/routes/inscricoes.js
// Base: /api/inscricoes
//   Público : /publica/*
//   Admin   : /admin/*
// ============================================================================
'use strict';

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

let logger = console;
try { logger = require('../../../utils/logger'); } catch (_) {
    try { logger = require('../../utils/logger'); } catch (_) { }
}

// ----------------------------------------------------------------------------
// BLINDAGEM CONTRA COLISÃO DE MODELS
// ----------------------------------------------------------------------------
let Inscricao;
try {
    Inscricao = require('../models/Formulario');
} catch (err) {
    console.error('⚠️ [INSCRIÇÕES] models/Formulario não encontrado, tentando models/Inscricao:', err.message);
    try { Inscricao = require('../models/Inscricao'); } catch (err2) {
        console.error('❌ [INSCRIÇÕES] Nem Formulario nem Inscricao puderam ser carregados:', err2.message);
        throw err2;
    }
}

if (!Inscricao || !Inscricao.schema || !Inscricao.schema.path('protocolo')) {
    console.error('🚨 [INSCRIÇÕES] Model carregado NÃO é o socioeconômico (sem `protocolo`).');
    console.error('   Model retornado tem: eventoId =', !!(Inscricao && Inscricao.schema && Inscricao.schema.path('eventoId')));
    console.error('   Re-registrando como "FormularioSocioeconomico" a partir do schema do arquivo...');

    let FormularioDef;
    try {
        const caminho = require.resolve('../models/Formulario');
        delete require.cache[caminho];
        FormularioDef = require(caminho);
    } catch (_) {
        try {
            const caminho = require.resolve('../models/Inscricao');
            delete require.cache[caminho];
            FormularioDef = require(caminho);
        } catch (_) { }
    }

    if (FormularioDef && FormularioDef.schema && FormularioDef.schema.path('protocolo')) {
        Inscricao = mongoose.models.FormularioSocioeconomico
            || mongoose.model('FormularioSocioeconomico', FormularioDef.schema);
        console.log('✅ [INSCRIÇÕES] Model re-registrado como FormularioSocioeconomico.');
    } else {
        console.error('❌ [INSCRIÇÕES] Não foi possível recuperar o schema socioeconômico.');
        throw new Error('Model socioeconômico inválido: não possui campo `protocolo`.');
    }
}

const ConfiguracaoInscricao = require('../models/ConfiguracaoInscricao');
const {
    authenticateToken, isAdmin, podeConsultar, podeEditar, podeConfigurar
} = require('../middlewares/auth-inscricoes');
const {
    soDigitos, hashCPF, criptografar, descriptografar,
    mascararCPF, mascararTelefone, formatarCPF,
    formatarTelefone, formatarCEP, validarCPF, gerarProtocolo,
    texto, textoLongo, booleano, numero, paraData, escaparRegex
} = require('../utils/seguranca');

// Biometria (mesma ENCRYPTION_KEY do .env)
let biometriaCrypto;
try {
    biometriaCrypto = require('../utils/biometriaCrypto');
} catch (err) {
    console.error('⚠️ [INSCRIÇÕES] utils/biometriaCrypto não encontrado. Biometria desabilitada:', err.message);
    biometriaCrypto = null;
}

const ESCOLARIDADES = Inscricao.ESCOLARIDADES;
const FAIXAS_RENDA = Inscricao.FAIXAS_RENDA;
const PROGRAMAS_SOCIAIS = Inscricao.PROGRAMAS_SOCIAIS;
const GRAUS_PARENTESCO = Inscricao.GRAUS_PARENTESCO;
const VINCULOS_RESPONSAVEL = Inscricao.VINCULOS_RESPONSAVEL;
const SEXOS = Inscricao.SEXOS;
const STATUS = Inscricao.STATUS;

// ============================================================================
// RATE LIMIT SIMPLES (memória)
// ============================================================================
const tentativas = new Map();
const JANELA_MS = 10 * 60 * 1000;
const MAX_TENTATIVAS = 8;

function limitarTentativas(req, res, next) {
    try {
        const ip = req.ip || (req.connection && req.connection.remoteAddress) || 'desconhecido';
        const agora = Date.now();
        const reg = tentativas.get(ip) || { inicio: agora, qtd: 0 };

        if (agora - reg.inicio > JANELA_MS) {
            reg.inicio = agora;
            reg.qtd = 0;
        }
        reg.qtd += 1;
        tentativas.set(ip, reg);

        if (reg.qtd > MAX_TENTATIVAS) {
            return res.status(429).json({
                success: false,
                error: 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.'
            });
        }
    } catch (_) { }
    next();
}

try {
    const limpador = setInterval(() => {
        const agora = Date.now();
        for (const [ip, reg] of tentativas.entries()) {
            if (agora - reg.inicio > JANELA_MS * 2) tentativas.delete(ip);
        }
    }, 30 * 60 * 1000);
    if (limpador.unref) limpador.unref();
} catch (_) { }

// ============================================================================
// FETCH COMPATÍVEL
// ============================================================================
async function fetchCompat(url, opts) {
    if (typeof fetch === 'function') return fetch(url, opts);
    const https = require('https');
    return new Promise((resolve, reject) => {
        const req = https.get(url, (resp) => {
            let data = '';
            resp.on('data', (c) => { data += c; });
            resp.on('end', () => {
                resolve({
                    ok: resp.statusCode >= 200 && resp.statusCode < 300,
                    status: resp.statusCode,
                    json: async () => JSON.parse(data)
                });
            });
        });
        req.on('error', reject);
        req.setTimeout(6000, () => { req.destroy(new Error('timeout')); });
    });
}

// ============================================================================
// HELPERS DE CRIPTOGRAFIA DE DOCUMENTO
// ============================================================================
const CAMPOS_SENSIVEIS = {
    aluno: ['cpf', 'rg', 'nis', 'email', 'telefone'],
    responsavel: ['cpf', 'rg', 'nis', 'email', 'telefone']
};

function criptografarDocumento(dados) {
    const out = JSON.parse(JSON.stringify(dados));
    for (const grupo of Object.keys(CAMPOS_SENSIVEIS)) {
        if (out[grupo] && typeof out[grupo] === 'object') {
            for (const campo of CAMPOS_SENSIVEIS[grupo]) {
                if (out[grupo][campo]) {
                    out[grupo][campo] = criptografar(out[grupo][campo]);
                }
            }
        }
    }
    return out;
}

function descriptografarInscricao(doc) {
    if (!doc) return doc;
    const out = doc.toObject ? doc.toObject() : { ...doc };
    for (const grupo of Object.keys(CAMPOS_SENSIVEIS)) {
        if (out[grupo] && typeof out[grupo] === 'object') {
            for (const campo of CAMPOS_SENSIVEIS[grupo]) {
                if (out[grupo][campo]) {
                    out[grupo][campo] = descriptografar(out[grupo][campo]);
                }
            }
        }
    }
    return out;
}

// ============================================================================
// VALIDAÇÃO / NORMALIZAÇÃO
// ============================================================================
function validarInscricao(body = {}) {
    const erros = [];
    const a = body.aluno || {};
    const r = body.responsavel || {};
    const e = body.endereco || {};
    const c = body.composicaoFamiliar || {};
    const cm = body.condicaoMoradia || {};
    const rf = body.rendaFamiliar || {};
    const ia = body.informacoesAdicionais || {};
    const lgpd = body.lgpd || {};

    const aluno = {
        nomeCompleto: texto(a.nomeCompleto, 150),
        dataNascimento: paraData(a.dataNascimento),
        cpf: soDigitos(a.cpf),
        email: texto(a.email, 150).toLowerCase(),
        sexo: texto(a.sexo, 40),
        rg: texto(a.rg, 30),
        temCadUnico: booleano(a.temCadUnico),
        nis: soDigitos(a.nis),
        telefone: soDigitos(a.telefone)
    };

    if (!aluno.nomeCompleto) erros.push('Informe o nome completo do aluno.');
    if (!aluno.dataNascimento) erros.push('Informe a data de nascimento do aluno.');
    if (!validarCPF(aluno.cpf)) erros.push('CPF do aluno inválido.');
    if (!aluno.sexo) erros.push('Informe o sexo do aluno.');
    if (aluno.telefone.length < 10) erros.push('Telefone do aluno inválido (informe DDD + número).');
    if (aluno.temCadUnico && aluno.nis.length < 10) {
        erros.push('Informe o NIS do aluno (obrigatório quando possui CadÚnico).');
    }
    if (aluno.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(aluno.email)) {
        erros.push('E-mail do aluno inválido.');
    }
    if (aluno.sexo && !SEXOS.includes(aluno.sexo)) erros.push('Sexo do aluno inválido.');

    const responsavel = {
        nomeCompleto: texto(r.nomeCompleto, 150),
        dataNascimento: paraData(r.dataNascimento),
        cpf: soDigitos(r.cpf),
        email: texto(r.email, 150).toLowerCase(),
        sexo: texto(r.sexo, 40),
        rg: texto(r.rg, 30),
        grauParentesco: texto(r.grauParentesco, 40),
        temCadUnico: booleano(r.temCadUnico),
        nis: soDigitos(r.nis),
        telefone: soDigitos(r.telefone)
    };

    if (!responsavel.nomeCompleto) erros.push('Informe o nome completo do responsável.');
    if (!responsavel.dataNascimento) erros.push('Informe a data de nascimento do responsável.');
    if (!validarCPF(responsavel.cpf)) erros.push('CPF do responsável inválido.');
    if (!responsavel.sexo) erros.push('Informe o sexo do responsável.');
    if (!responsavel.grauParentesco) erros.push('Informe o grau de parentesco do responsável.');
    if (responsavel.grauParentesco && !VINCULOS_RESPONSAVEL.includes(responsavel.grauParentesco)) {
        erros.push('Grau de parentesco inválido.');
    }
    if (responsavel.telefone.length < 10) erros.push('Telefone do responsável inválido (informe DDD + número).');
    if (responsavel.temCadUnico && responsavel.nis.length < 10) {
        erros.push('Informe o NIS do responsável (obrigatório quando possui CadÚnico).');
    }
    if (responsavel.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(responsavel.email)) {
        erros.push('E-mail do responsável inválido.');
    }
    if (responsavel.cpf && aluno.cpf && responsavel.cpf === aluno.cpf) {
        erros.push('O CPF do responsável não pode ser igual ao do aluno.');
    }

    const endereco = {
        cep: soDigitos(e.cep),
        logradouro: texto(e.logradouro, 180),
        numero: texto(e.numero, 20),
        complemento: texto(e.complemento, 120),
        bairro: texto(e.bairro, 120),
        cidade: texto(e.cidade, 120),
        estado: texto(e.estado, 2).toUpperCase()
    };

    if (endereco.cep.length !== 8) erros.push('CEP inválido (8 dígitos).');
    if (!endereco.logradouro) erros.push('Informe o logradouro (rua/avenida).');
    if (!endereco.numero) erros.push('Informe o número da residência.');
    if (!endereco.bairro) erros.push('Informe o bairro.');
    if (!endereco.cidade) erros.push('Informe a cidade.');
    if (endereco.estado.length !== 2) erros.push('Informe a UF (ex.: MA).');

    const graus = Array.isArray(c.grausParentesco)
        ? c.grausParentesco.map(g => texto(g, 40)).filter(Boolean)
        : [];

    const composicaoFamiliar = {
        pessoasResidem: numero(c.pessoasResidem, 0),
        grausParentesco: graus,
        dependentesMenores: numero(c.dependentesMenores, 0),
        escolaridadePai: texto(c.escolaridadePai, 60),
        escolaridadeMae: texto(c.escolaridadeMae, 60),
        ocupacaoPai: texto(c.ocupacaoPai, 120),
        ocupacaoMae: texto(c.ocupacaoMae, 120)
    };

    if (!composicaoFamiliar.pessoasResidem || composicaoFamiliar.pessoasResidem < 1) {
        erros.push('Informe quantas pessoas residem na casa (mínimo 1).');
    }
    if (composicaoFamiliar.grausParentesco.length === 0) {
        erros.push('Selecione ao menos um grau de parentesco das pessoas que moram juntas.');
    }
    if (composicaoFamiliar.grausParentesco.some(g => !GRAUS_PARENTESCO.includes(g))) {
        erros.push('Grau de parentesco inválido na composição familiar.');
    }
    if (composicaoFamiliar.dependentesMenores < 0) {
        erros.push('Número de dependentes menores inválido.');
    }
    if (!composicaoFamiliar.escolaridadePai || !ESCOLARIDADES.includes(composicaoFamiliar.escolaridadePai)) {
        erros.push('Informe a escolaridade do pai ou responsável.');
    }
    if (!composicaoFamiliar.escolaridadeMae || !ESCOLARIDADES.includes(composicaoFamiliar.escolaridadeMae)) {
        erros.push('Informe a escolaridade da mãe ou responsável.');
    }

    const condicaoMoradia = {
        aguaEncanada: booleano(cm.aguaEncanada),
        energiaEletrica: booleano(cm.energiaEletrica),
        esgotoSanitario: booleano(cm.esgotoSanitario),
        internetBandaLarga: booleano(cm.internetBandaLarga)
    };

    const programas = Array.isArray(rf.programasSociais)
        ? rf.programasSociais.map(p => texto(p, 40)).filter(Boolean)
        : (rf.programasSociais ? [texto(rf.programasSociais, 40)] : []);

    const rendaFamiliar = {
        faixaRenda: texto(rf.faixaRenda, 60),
        programasSociais: Array.from(new Set(programas)),
        programaOutro: texto(rf.programaOutro, 120)
    };

    if (!rendaFamiliar.faixaRenda || !FAIXAS_RENDA.includes(rendaFamiliar.faixaRenda)) {
        erros.push('Informe a faixa de renda familiar mensal.');
    }
    if (rendaFamiliar.programasSociais.length === 0) {
        erros.push('Informe se a família participa de algum programa social.');
    }
    if (rendaFamiliar.programasSociais.some(p => !PROGRAMAS_SOCIAIS.includes(p))) {
        erros.push('Programa social inválido.');
    }
    if (rendaFamiliar.programasSociais.includes('Outro') && !rendaFamiliar.programaOutro) {
        erros.push('Especifique qual é o programa social (opção "Outro").');
    }

    const informacoesAdicionais = {
        possuiDeficiencia: booleano(ia.possuiDeficiencia),
        deficienciaQual: textoLongo(ia.deficienciaQual, 500),
        acessoDispositivos: booleano(ia.acessoDispositivos)
    };

    if (informacoesAdicionais.possuiDeficiencia && !informacoesAdicionais.deficienciaQual) {
        erros.push('Descreva a deficiência ou necessidade especial do aluno.');
    }

    if (!booleano(lgpd.aceito)) {
        erros.push('É necessário aceitar o Termo de Consentimento LGPD para enviar a inscrição.');
    }

    return {
        valido: erros.length === 0,
        erros,
        dados: {
            aluno,
            responsavel,
            endereco,
            composicaoFamiliar,
            condicaoMoradia,
            rendaFamiliar,
            informacoesAdicionais,
            lgpd: {
                aceito: booleano(lgpd.aceito),
                versaoTermo: texto(lgpd.versaoTermo, 20) || '1.0'
            }
        }
    };
}

async function gerarProtocoloUnico(anoLetivo) {
    for (let i = 0; i < 8; i++) {
        const p = gerarProtocolo(anoLetivo);
        const existe = await Inscricao.exists({ protocolo: p });
        if (!existe) return p;
    }
    return `${gerarProtocolo(anoLetivo)}${Date.now().toString().slice(-4)}`;
}

// ----------------------------------------------------------------------------
// Processa o bloco de biometria recebido (sempre pelo servidor).
// ----------------------------------------------------------------------------
function processarBiometria(bodyBiometria, cfg, req) {
    if (!bodyBiometria || !bodyBiometria.aceito) {
        return { aceito: false };
    }

    if (!cfg.solicitarBiometria) {
        const err = new Error('Biometria não habilitada para este processo.');
        err.status = 400;
        throw err;
    }

    if (!biometriaCrypto) {
        const err = new Error('Módulo de biometria indisponível no servidor.');
        err.status = 500;
        throw err;
    }

    try {
        return biometriaCrypto.prepararParaSalvar(bodyBiometria, {
            ip: req.ip || req.connection?.remoteAddress || '',
            userAgent: req.headers['user-agent'] || ''
        });
    } catch (e) {
        const err = new Error('Falha ao validar biometria: ' + e.message);
        err.status = 400;
        throw err;
    }
}

async function criarInscricao({ dados, cfg, origem, req, autor, biometria }) {
    const protocolo = await gerarProtocoloUnico(cfg.anoLetivo);
    const dadosCripto = criptografarDocumento(dados);

    const doc = new Inscricao({
        protocolo,
        anoLetivo: cfg.anoLetivo,
        serie: cfg.serie,
        origem: origem || 'Publico',
        aluno: dadosCripto.aluno,
        responsavel: dadosCripto.responsavel,
        endereco: dados.endereco,
        composicaoFamiliar: dados.composicaoFamiliar,
        condicaoMoradia: dados.condicaoMoradia,
        rendaFamiliar: dados.rendaFamiliar,
        informacoesAdicionais: dados.informacoesAdicionais,
        lgpd: {
            aceito: true,
            aceitoEm: new Date(),
            versaoTermo: dados.lgpd.versaoTermo || cfg.versaoTermo || '1.0',
            ip: (req && (req.ip || req.connection?.remoteAddress)) || '',
            userAgent: (req && req.headers && req.headers['user-agent']) || ''
        },
        biometria: biometria || { aceito: false },
        status: 'Pendente',
        historico: [{
            status: 'Pendente',
            em: new Date(),
            por: autor || (origem === 'Manual' ? 'Administrador' : 'Formulário público'),
            observacao: origem === 'Manual' ? 'Inscrição cadastrada manualmente' : 'Inscrição enviada pelo formulário público'
        }]
    });

    await doc.save();
    return doc;
}

// ===========================================================================
// ROTAS PÚBLICAS
// ===========================================================================

// ---- GET /publica/config ----
router.get('/publica/config', async (req, res) => {
    try {
        const cfg = await ConfiguracaoInscricao.obter();
        const aberto = cfg.estaAberto();

        let totalInscritos = 0;
        try {
            totalInscritos = await Inscricao.countDocuments({
                anoLetivo: cfg.anoLetivo,
                status: { $ne: 'Cancelada' }
            });
        } catch (_) { }

        const vagasRestantes = cfg.vagas > 0 ? Math.max(0, cfg.vagas - totalInscritos) : null;

        res.json({
            success: true,
            config: {
                anoLetivo: cfg.anoLetivo,
                serie: cfg.serie,
                titulo: cfg.titulo,
                subtitulo: cfg.subtitulo,
                objetivo: cfg.objetivo,
                dataInicio: cfg.dataInicio,
                dataFim: cfg.dataFim,
                vagas: cfg.vagas,
                ativo: cfg.ativo,
                aberto: aberto && (vagasRestantes === null || vagasRestantes > 0),
                vagasRestantes,
                versaoTermo: cfg.versaoTermo,
                mensagemEncerrado: cfg.mensagemEncerrado,
                mensagemTopo: cfg.mensagemTopo,
                permiteConsultaPublica: cfg.permiteConsultaPublica,
                solicitarBiometria: !!cfg.solicitarBiometria
            },
            totalInscritos,
            opcoes: {
                escolaridades: ESCOLARIDADES,
                faixasRenda: FAIXAS_RENDA,
                programasSociais: PROGRAMAS_SOCIAIS,
                grausParentesco: GRAUS_PARENTESCO,
                vinculosResponsavel: VINCULOS_RESPONSAVEL,
                sexos: SEXOS
            }
        });
    } catch (error) {
        logger.error('❌ [INSCRIÇÕES] Erro em /publica/config:', error);
        res.status(500).json({ success: false, error: 'Não foi possível carregar a configuração.' });
    }
});

// ---- GET /publica/cep/:cep ----
router.get('/publica/cep/:cep', async (req, res) => {
    try {
        const cep = soDigitos(req.params.cep);
        if (cep.length !== 8) {
            return res.status(400).json({ success: false, error: 'CEP inválido.' });
        }

        const url = `https://viacep.com.br/ws/${cep}/json/`;
        const data = await (async () => {
            const r = await fetchCompat(url);
            if (!r.ok) throw new Error('Falha ao consultar o CEP.');
            return r.json();
        })();

        if (data.erro) {
            return res.status(404).json({ success: false, error: 'CEP não encontrado.' });
        }

        res.json({
            success: true,
            endereco: {
                cep: soDigitos(data.cep || cep),
                logradouro: data.logradouro || '',
                complemento: data.complemento || '',
                bairro: data.bairro || '',
                cidade: data.localidade || '',
                estado: (data.uf || '').toUpperCase()
            }
        });
    } catch (error) {
        logger.warn('⚠️ [INSCRIÇÕES] Consulta de CEP falhou:', error.message);
        res.status(502).json({ success: false, error: 'Não foi possível consultar o CEP agora. Preencha manualmente.' });
    }
});

// ---- GET /publica/biometria/chave ----
router.get('/publica/biometria/chave', (req, res) => {
    try {
        if (!biometriaCrypto) {
            return res.status(503).json({ success: false, error: 'Biometria indisponível no servidor.' });
        }
        res.json({ success: true, chavePublica: biometriaCrypto.exportarChavePublicaJWK() });
    } catch (error) {
        logger.error('❌ [INSCRIÇÕES] Erro ao obter chave de biometria:', error);
        res.status(500).json({ success: false, error: 'Falha ao obter configuração de biometria.' });
    }
});

// ---- POST /publica ----
router.post('/publica', limitarTentativas, async (req, res) => {
    try {
        const cfg = await ConfiguracaoInscricao.obter();

        if (!cfg.estaAberto()) {
            return res.status(403).json({
                success: false,
                error: cfg.mensagemEncerrado || 'As inscrições estão encerradas.'
            });
        }

        const { valido, erros, dados } = validarInscricao(req.body || {});
        if (!valido) {
            return res.status(400).json({ success: false, error: erros[0], erros });
        }

        if (cfg.vagas > 0) {
            const total = await Inscricao.countDocuments({
                anoLetivo: cfg.anoLetivo,
                status: { $ne: 'Cancelada' }
            });
            if (total >= cfg.vagas) {
                return res.status(403).json({
                    success: false,
                    error: 'As vagas para este processo foram esgotadas.'
                });
            }
        }

        if (cfg.bloquearDuplicadas) {
            const existente = await Inscricao.findOne({
                cpfHash: hashCPF(dados.aluno.cpf),
                anoLetivo: cfg.anoLetivo,
                status: { $ne: 'Cancelada' }
            }).select('protocolo').lean();

            if (existente) {
                return res.status(409).json({
                    success: false,
                    error: `Já existe uma inscrição para este CPF neste processo. Protocolo: ${existente.protocolo}`,
                    protocolo: existente.protocolo
                });
            }
        }

        let biometriaFinal = { aceito: false };
        if (req.body && req.body.biometria) {
            try {
                biometriaFinal = processarBiometria(req.body.biometria, cfg, req);
            } catch (e) {
                return res.status(e.status || 400).json({ success: false, error: e.message });
            }
        }

        const doc = await criarInscricao({
            dados, cfg, origem: 'Publico', req, biometria: biometriaFinal
        });

        logger.info(`✅ [INSCRIÇÕES] Nova inscrição ${doc.protocolo} — ${doc.aluno.nomeCompleto}${biometriaFinal.aceito ? ' [biometria]' : ''}`);

        res.status(201).json({
            success: true,
            mensagem: 'Inscrição registrada com sucesso!',
            protocolo: doc.protocolo,
            inscricao: {
                _id: doc._id,
                protocolo: doc.protocolo,
                status: doc.status,
                createdAt: doc.createdAt
            }
        });
    } catch (error) {
        logger.error('❌ [INSCRIÇÕES] Erro ao criar inscrição pública:', error);
        res.status(500).json({
            success: false,
            error: 'Não foi possível registrar a inscrição. Tente novamente em instantes.'
        });
    }
});

// ---- GET /publica/consulta/:protocolo ----
router.get('/publica/consulta/:protocolo', async (req, res) => {
    try {
        const cfg = await ConfiguracaoInscricao.obter();
        if (!cfg.permiteConsultaPublica) {
            return res.status(403).json({ success: false, error: 'A consulta pública está desativada.' });
        }

        const protocolo = texto(req.params.protocolo, 40).toUpperCase();
        const cpf = soDigitos(req.query.cpf || '');

        if (!protocolo) return res.status(400).json({ success: false, error: 'Informe o protocolo.' });
        if (cpf.length !== 11) return res.status(400).json({ success: false, error: 'Informe o CPF do aluno para consultar.' });

        const doc = await Inscricao.findOne({ protocolo }).lean();
        if (!doc) {
            return res.status(404).json({ success: false, error: 'Protocolo não encontrado.' });
        }

        if (doc.aluno?.cpfHash !== hashCPF(cpf)) {
            return res.status(403).json({ success: false, error: 'CPF não confere com o protocolo informado.' });
        }

        res.json({
            success: true,
            inscricao: {
                protocolo: doc.protocolo,
                anoLetivo: doc.anoLetivo,
                serie: doc.serie,
                aluno: doc.aluno?.nomeCompleto,
                responsavel: doc.responsavel?.nomeCompleto,
                status: doc.status,
                createdAt: doc.createdAt,
                atualizadoEm: doc.updatedAt,
                historico: (doc.historico || []).map(h => ({
                    status: h.status,
                    em: h.em,
                    observacao: h.observacao
                }))
            }
        });
    } catch (error) {
        logger.error('❌ [INSCRIÇÕES] Erro na consulta pública:', error);
        res.status(500).json({ success: false, error: 'Não foi possível consultar agora.' });
    }
});

// ============================================================================
// =============================  ROTAS ADMIN  ================================
// ============================================================================

// ---- GET /admin/dashboard ----
router.get('/admin/dashboard', authenticateToken, podeConsultar, async (req, res) => {
    try {
        const filtroAno = req.query.anoLetivo ? { anoLetivo: Number(req.query.anoLetivo) } : {};

        const [
            total, pendentes, emAnalise, aprovadas, concluidas, canceladas,
            comCadUnico, comDeficiencia, semDispositivo, comBiometria
        ] = await Promise.all([
            Inscricao.countDocuments(filtroAno),
            Inscricao.countDocuments({ ...filtroAno, status: 'Pendente' }),
            Inscricao.countDocuments({ ...filtroAno, status: 'Em análise' }),
            Inscricao.countDocuments({ ...filtroAno, status: 'Aprovada' }),
            Inscricao.countDocuments({ ...filtroAno, status: 'Concluída' }),
            Inscricao.countDocuments({ ...filtroAno, status: 'Cancelada' }),
            Inscricao.countDocuments({ ...filtroAno, 'aluno.temCadUnico': true }),
            Inscricao.countDocuments({ ...filtroAno, 'informacoesAdicionais.possuiDeficiencia': true }),
            Inscricao.countDocuments({ ...filtroAno, 'informacoesAdicionais.acessoDispositivos': false }),
            Inscricao.countDocuments({ ...filtroAno, 'biometria.aceito': true })
        ]);

        const porFaixaRenda = await Inscricao.aggregate([
            { $match: filtroAno },
            { $group: { _id: '$rendaFamiliar.faixaRenda', total: { $sum: 1 } } },
            { $sort: { total: -1 } }
        ]);

        const porBairro = await Inscricao.aggregate([
            { $match: filtroAno },
            { $group: { _id: '$endereco.bairro', total: { $sum: 1 } } },
            { $sort: { total: -1 } },
            { $limit: 6 }
        ]);

        const ultimas = await Inscricao.find(filtroAno)
            .sort({ createdAt: -1 })
            .limit(6)
            .select('protocolo aluno.nomeCompleto responsavel.nomeCompleto status createdAt biometria.aceito')
            .lean();

        res.json({
            success: true,
            resumo: {
                total, pendentes, emAnalise, aprovadas, concluidas, canceladas,
                comCadUnico, comDeficiencia, semDispositivo, comBiometria
            },
            porFaixaRenda: porFaixaRenda.map(f => ({ faixa: f._id || 'Não informado', total: f.total })),
            porBairro: porBairro.map(b => ({ bairro: b._id || 'Não informado', total: b.total })),
            ultimas
        });
    } catch (error) {
        logger.error('❌ [INSCRIÇÕES] Erro no dashboard:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ---- GET /admin/exportar (CSV) — admin + gestão ----
router.get('/admin/exportar', authenticateToken, podeEditar, async (req, res) => {
    try {
        const filtro = {};
        if (req.query.anoLetivo) filtro.anoLetivo = Number(req.query.anoLetivo);
        if (req.query.status) filtro.status = req.query.status;

        const docs = await Inscricao.find(filtro).sort({ createdAt: -1 }).lean();

        const simNao = (v) => (v ? 'Sim' : 'Não');
        const dt = (v) => (v ? new Date(v).toLocaleString('pt-BR') : '');
        const d = (v) => (v ? new Date(v).toLocaleDateString('pt-BR') : '');

        const total = docs.length;
        const contagem = (fn) => docs.filter(fn).length;
        const pendentes = contagem(i => i.status === 'Pendente');
        const emAnalise = contagem(i => i.status === 'Em análise');
        const aprovadas = contagem(i => i.status === 'Aprovada');
        const concluidas = contagem(i => i.status === 'Concluída');
        const canceladas = contagem(i => i.status === 'Cancelada');
        const comCadUnico = contagem(i => i.aluno?.temCadUnico);
        const comDeficiencia = contagem(i => i.informacoesAdicionais?.possuiDeficiencia);
        const comBiometria = contagem(i => i.biometria?.aceito);

        const resumo = [
            ['RELATÓRIO DE INSCRIÇÕES SOCIOECONÔMICAS'],
            ['Gerado em', new Date().toLocaleString('pt-BR')],
            ['Filtro de ano letivo', req.query.anoLetivo || 'Todos'],
            ['Filtro de status', req.query.status || 'Todos'],
            [],
            ['RESUMO GERAL'],
            ['Total de inscrições', total],
            ['Pendentes', pendentes],
            ['Em análise', emAnalise],
            ['Aprovadas', aprovadas],
            ['Concluídas', concluidas],
            ['Canceladas', canceladas],
            ['Com CadÚnico', comCadUnico],
            ['Com deficiência', comDeficiencia],
            ['Com biometria', comBiometria],
            []
        ];

        const cabecalho = [
            'Protocolo', 'Ano Letivo', 'Série', 'Status', 'Data da Inscrição', 'Origem',
            'Aluno', 'Nascimento Aluno', 'CPF Aluno', 'Sexo', 'RG', 'E-mail Aluno', 'Telefone Aluno',
            'CadÚnico (Aluno)', 'NIS (Aluno)',
            'Responsável', 'Parentesco', 'Nascimento Responsável', 'CPF Responsável',
            'E-mail Responsável', 'Telefone Responsável', 'CadÚnico (Responsável)', 'NIS (Responsável)',
            'CEP', 'Logradouro', 'Número', 'Complemento', 'Bairro', 'Cidade', 'UF',
            'Pessoas na residência', 'Graus de parentesco', 'Dependentes menores',
            'Escolaridade pai', 'Escolaridade mãe', 'Ocupação pai', 'Ocupação mãe',
            'Água encanada', 'Energia elétrica', 'Esgoto sanitário', 'Internet banda larga',
            'Faixa de renda', 'Programas sociais', 'Outro programa',
            'Deficiência', 'Qual deficiência', 'Acesso a dispositivos',
            'LGPD aceito', 'LGPD aceito em', 'Versão do termo',
            'Biometria', 'Biometria em', 'Biometria ID',
            'Observações administrativas'
        ];

        const linhas = docs.map(i => {
            const a = { ...(i.aluno || {}) };
            const r = { ...(i.responsavel || {}) };
            ['cpf', 'rg', 'nis', 'email', 'telefone'].forEach(c => {
                if (a[c]) a[c] = descriptografar(a[c]);
                if (r[c]) r[c] = descriptografar(r[c]);
            });

            const e = i.endereco || {};
            const c = i.composicaoFamiliar || {};
            const cm = i.condicaoMoradia || {};
            const rf = i.rendaFamiliar || {};
            const ia = i.informacoesAdicionais || {};
            const lg = i.lgpd || {};
            const bio = i.biometria || {};

            return [
                i.protocolo, i.anoLetivo, i.serie, i.status, dt(i.createdAt), i.origem,
                a.nomeCompleto, d(a.dataNascimento), formatarCPF(a.cpf), a.sexo, a.rg, a.email, formatarTelefone(a.telefone),
                simNao(a.temCadUnico), a.nis,
                r.nomeCompleto, r.grauParentesco, d(r.dataNascimento), formatarCPF(r.cpf),
                r.email, formatarTelefone(r.telefone), simNao(r.temCadUnico), r.nis,
                formatarCEP(e.cep), e.logradouro, e.numero, e.complemento, e.bairro, e.cidade, e.estado,
                c.pessoasResidem, (c.grausParentesco || []).join(' | '), c.dependentesMenores,
                c.escolaridadePai, c.escolaridadeMae, c.ocupacaoPai, c.ocupacaoMae,
                simNao(cm.aguaEncanada), simNao(cm.energiaEletrica), simNao(cm.esgotoSanitario), simNao(cm.internetBandaLarga),
                rf.faixaRenda, (rf.programasSociais || []).join(' | '), rf.programaOutro,
                simNao(ia.possuiDeficiencia), ia.deficienciaQual, simNao(ia.acessoDispositivos),
                simNao(lg.aceito), dt(lg.aceitoEm), lg.versaoTermo,
                simNao(bio.aceito), dt(bio.capturadoEm), bio.credentialId || '',
                i.observacoesAdmin
            ];
        });

        const esc = (v) => {
            const s = String(v == null ? '' : v);
            if (/[;"\r\n]/.test(s) || /^[=+\-@]/.test(s)) {
                return `"${s.replace(/"/g, '""')}"`;
            }
            return s;
        };

        const linhasResumo = resumo.map(l => l.map(esc).join(';'));
        const linhasTabela = [cabecalho, ...linhas].map(l => l.map(esc).join(';'));
        const csv = '\uFEFF' + [...linhasResumo, ...linhasTabela].join('\r\n');

        const nomeArquivo = `inscricoes-${new Date().toISOString().slice(0, 10)}.csv`;

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
        res.send(csv);
    } catch (error) {
        logger.error('❌ [INSCRIÇÕES] Erro ao exportar CSV:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ---- GET /admin/config ----
router.get('/admin/config', authenticateToken, podeConfigurar, async (req, res) => {
    try {
        const cfg = await ConfiguracaoInscricao.obter();
        res.json({ success: true, config: cfg, aberto: cfg.estaAberto() });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ---- PUT /admin/config ----
router.put('/admin/config', authenticateToken, podeConfigurar, async (req, res) => {
    try {
        const cfg = await ConfiguracaoInscricao.obter();
        const b = req.body || {};

        if (b.anoLetivo !== undefined) cfg.anoLetivo = numero(b.anoLetivo, cfg.anoLetivo);
        if (b.serie !== undefined) cfg.serie = texto(b.serie, 80);
        if (b.titulo !== undefined) cfg.titulo = texto(b.titulo, 200);
        if (b.subtitulo !== undefined) cfg.subtitulo = texto(b.subtitulo, 120);
        if (b.objetivo !== undefined) cfg.objetivo = textoLongo(b.objetivo, 1200);
        if (b.dataInicio) cfg.dataInicio = paraData(b.dataInicio) || cfg.dataInicio;
        if (b.dataFim) cfg.dataFim = paraData(b.dataFim) || cfg.dataFim;
        if (b.vagas !== undefined) cfg.vagas = Math.max(0, numero(b.vagas, 0));
        if (b.ativo !== undefined) cfg.ativo = booleano(b.ativo, true);
        if (b.bloquearDuplicadas !== undefined) cfg.bloquearDuplicadas = booleano(b.bloquearDuplicadas, true);
        if (b.permiteConsultaPublica !== undefined) cfg.permiteConsultaPublica = booleano(b.permiteConsultaPublica, true);
        if (b.solicitarBiometria !== undefined) cfg.solicitarBiometria = booleano(b.solicitarBiometria, false);
        if (b.versaoTermo !== undefined) cfg.versaoTermo = texto(b.versaoTermo, 20) || '1.0';
        if (b.mensagemEncerrado !== undefined) cfg.mensagemEncerrado = textoLongo(b.mensagemEncerrado, 400);
        if (b.mensagemTopo !== undefined) cfg.mensagemTopo = textoLongo(b.mensagemTopo, 400);

        if (new Date(cfg.dataFim) <= new Date(cfg.dataInicio)) {
            return res.status(400).json({ success: false, error: 'A data final deve ser posterior à data inicial.' });
        }

        await cfg.save();
        logger.info(`⚙️ [INSCRIÇÕES] Configuração atualizada por ${req.userNome || req.userId}`);

        res.json({ success: true, mensagem: 'Configuração salva.', config: cfg, aberto: cfg.estaAberto() });
    } catch (error) {
        logger.error('❌ [INSCRIÇÕES] Erro ao salvar config:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ---- GET /admin/opcoes ----
router.get('/admin/opcoes', authenticateToken, podeConsultar, async (req, res) => {
    try {
        const anos = await Inscricao.distinct('anoLetivo');
        res.json({
            success: true,
            opcoes: {
                status: STATUS,
                escolaridades: ESCOLARIDADES,
                faixasRenda: FAIXAS_RENDA,
                programasSociais: PROGRAMAS_SOCIAIS,
                grausParentesco: GRAUS_PARENTESCO,
                vinculosResponsavel: VINCULOS_RESPONSAVEL,
                sexos: SEXOS,
                anosLetivos: anos.sort((a, b) => b - a)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ---- GET /admin (lista) ----
router.get('/admin', authenticateToken, podeConsultar, async (req, res) => {
    try {
        const pagina = Math.max(1, parseInt(req.query.pagina, 10) || 1);
        const limite = Math.min(100, Math.max(5, parseInt(req.query.limite, 10) || 20));
        const filtro = {};

        if (req.query.status && STATUS.includes(req.query.status)) filtro.status = req.query.status;
        if (req.query.anoLetivo) filtro.anoLetivo = Number(req.query.anoLetivo);
        if (req.query.faixaRenda) filtro['rendaFamiliar.faixaRenda'] = req.query.faixaRenda;

        if (req.query.cadUnico === 'sim') filtro['aluno.temCadUnico'] = true;
        if (req.query.cadUnico === 'nao') filtro['aluno.temCadUnico'] = false;

        if (req.query.deficiencia === 'sim') filtro['informacoesAdicionais.possuiDeficiencia'] = true;
        if (req.query.deficiencia === 'nao') filtro['informacoesAdicionais.possuiDeficiencia'] = false;

        if (req.query.biometria === 'sim') filtro['biometria.aceito'] = true;
        if (req.query.biometria === 'nao') filtro['biometria.aceito'] = { $ne: true };

        if (req.query.programa) filtro['rendaFamiliar.programasSociais'] = req.query.programa;

        if (req.query.busca && String(req.query.busca).trim()) {
            const termo = String(req.query.busca).trim();
            const rx = new RegExp(escaparRegex(termo), 'i');
            const digitos = soDigitos(termo);

            const or = [
                { protocolo: rx },
                { 'aluno.nomeCompleto': rx },
                { 'responsavel.nomeCompleto': rx },
                { 'endereco.bairro': rx },
                { 'endereco.cidade': rx }
            ];

            if (digitos.length === 11) {
                or.push({ cpfHash: hashCPF(digitos) });
            }

            filtro.$or = or;
        }

        let ordenacao = { createdAt: -1 };
        if (req.query.ordenar === 'antigas') ordenacao = { createdAt: 1 };
        if (req.query.ordenar === 'nome') ordenacao = { 'aluno.nomeCompleto': 1 };
        if (req.query.ordenar === 'status') ordenacao = { status: 1 };

        const [total, docs] = await Promise.all([
            Inscricao.countDocuments(filtro),
            Inscricao.find(filtro)
                .sort(ordenacao)
                .skip((pagina - 1) * limite)
                .limit(limite)
                .select(
                    'protocolo anoLetivo serie status createdAt ' +
                    'aluno.nomeCompleto aluno.cpf aluno.telefone aluno.temCadUnico ' +
                    'responsavel.nomeCompleto responsavel.telefone ' +
                    'endereco.bairro endereco.cidade ' +
                    'rendaFamiliar.faixaRenda informacoesAdicionais.possuiDeficiencia ' +
                    'biometria.aceito'
                )
                .lean()
        ]);

        const lista = docs.map(d => ({
            _id: d._id,
            protocolo: d.protocolo,
            anoLetivo: d.anoLetivo,
            serie: d.serie,
            aluno: d.aluno?.nomeCompleto || '',
            cpfMascarado: mascararCPF(d.aluno?.cpf),
            telefoneMascarado: mascararTelefone(d.aluno?.telefone),
            responsavel: d.responsavel?.nomeCompleto || '',
            responsavelTelefone: mascararTelefone(d.responsavel?.telefone),
            bairro: d.endereco?.bairro || '',
            cidade: d.endereco?.cidade || '',
            faixaRenda: d.rendaFamiliar?.faixaRenda || '',
            cadUnico: !!d.aluno?.temCadUnico,
            deficiencia: !!d.informacoesAdicionais?.possuiDeficiencia,
            biometria: !!d.biometria?.aceito,
            status: d.status,
            createdAt: d.createdAt
        }));

        res.json({
            success: true,
            inscricoes: lista,
            paginacao: {
                pagina,
                limite,
                total,
                totalPaginas: Math.max(1, Math.ceil(total / limite))
            }
        });
    } catch (error) {
        logger.error('❌ [INSCRIÇÕES] Erro ao listar:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ---- POST /admin (cadastro manual) ----
router.post('/admin', authenticateToken, podeEditar, async (req, res) => {
    try {
        const cfg = await ConfiguracaoInscricao.obter();
        const { valido, erros, dados } = validarInscricao(req.body || {});

        if (!valido) return res.status(400).json({ success: false, error: erros[0], erros });

        const doc = await criarInscricao({
            dados,
            cfg,
            origem: 'Manual',
            req,
            autor: req.userNome || 'Administrador',
            biometria: { aceito: false }
        });

        res.status(201).json({ success: true, mensagem: 'Inscrição criada.', inscricao: doc });
    } catch (error) {
        logger.error('❌ [INSCRIÇÕES] Erro ao criar manualmente:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ---- GET /admin/:id (detalhe) ----
router.get('/admin/:id', authenticateToken, podeConsultar, async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, error: 'ID inválido.' });
        }

        const doc = await Inscricao.findById(req.params.id).lean();
        if (!doc) return res.status(404).json({ success: false, error: 'Inscrição não encontrada.' });

        const docDec = descriptografarInscricao(doc);

        res.json({
            success: true,
            inscricao: docDec,
            formatado: {
                cpfAluno: formatarCPF(docDec.aluno?.cpf),
                cpfResponsavel: formatarCPF(docDec.responsavel?.cpf),
                telefoneAluno: formatarTelefone(docDec.aluno?.telefone),
                telefoneResponsavel: formatarTelefone(docDec.responsavel?.telefone),
                cep: formatarCEP(docDec.endereco?.cep)
            }
        });
    } catch (error) {
        logger.error('❌ [INSCRIÇÕES] Erro ao buscar detalhe:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ---- PUT /admin/:id ----
const CAMPOS_PERMITIDOS = {
    aluno: ['nomeCompleto', 'dataNascimento', 'cpf', 'email', 'sexo', 'rg', 'temCadUnico', 'nis', 'telefone'],
    responsavel: ['nomeCompleto', 'dataNascimento', 'cpf', 'email', 'sexo', 'rg', 'grauParentesco', 'temCadUnico', 'nis', 'telefone'],
    endereco: ['cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'estado'],
    composicaoFamiliar: ['pessoasResidem', 'grausParentesco', 'dependentesMenores', 'escolaridadePai', 'escolaridadeMae', 'ocupacaoPai', 'ocupacaoMae'],
    condicaoMoradia: ['aguaEncanada', 'energiaEletrica', 'esgotoSanitario', 'internetBandaLarga'],
    rendaFamiliar: ['faixaRenda', 'programasSociais', 'programaOutro'],
    informacoesAdicionais: ['possuiDeficiencia', 'deficienciaQual', 'acessoDispositivos']
};

const CAMPOS_SENSIVEIS_GRUPO = {
    aluno: ['cpf', 'rg', 'nis', 'email', 'telefone'],
    responsavel: ['cpf', 'rg', 'nis', 'email', 'telefone']
};

router.put('/admin/:id', authenticateToken, podeEditar, async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, error: 'ID inválido.' });
        }

        const doc = await Inscricao.findById(req.params.id);
        if (!doc) return res.status(404).json({ success: false, error: 'Inscrição não encontrada.' });

        const { status, observacoesAdmin, dados } = req.body || {};
        const autor = req.userNome || 'Administrador';

        if (status !== undefined) {
            if (!STATUS.includes(status)) {
                return res.status(400).json({ success: false, error: 'Status inválido.' });
            }
            if (status !== doc.status) {
                doc.registrarStatus(status, autor, `Status alterado de "${doc.status}" para "${status}"`);
            }
        }

        if (observacoesAdmin !== undefined) {
            doc.observacoesAdmin = textoLongo(observacoesAdmin, 2000);
        }

        if (dados && typeof dados === 'object') {
            Object.keys(CAMPOS_PERMITIDOS).forEach(grupo => {
                const origem = dados[grupo];
                if (!origem || typeof origem !== 'object') return;
                if (!doc[grupo]) doc[grupo] = {};

                CAMPOS_PERMITIDOS[grupo].forEach(campo => {
                    if (!(campo in origem)) return;
                    let valor = origem[campo];

                    if (campo === 'dataNascimento') valor = paraData(valor);
                    else if (['pessoasResidem', 'dependentesMenores'].includes(campo)) valor = numero(valor, 0);
                    else if (['temCadUnico', 'aguaEncanada', 'energiaEletrica', 'esgotoSanitario', 'internetBandaLarga', 'possuiDeficiencia', 'acessoDispositivos'].includes(campo)) valor = booleano(valor);
                    else if (campo === 'grausParentesco' || campo === 'programasSociais') {
                        valor = Array.isArray(valor) ? valor.map(v => texto(v, 60)).filter(Boolean) : [];
                    } else valor = textoLongo(valor, 500);

                    if (CAMPOS_SENSIVEIS_GRUPO[grupo]?.includes(campo)) {
                        if (!String(valor).startsWith('enc:v1:')) {
                            valor = criptografar(valor);
                        }
                        if (campo === 'cpf' && grupo === 'aluno') {
                            const d = soDigitos(descriptografar(valor));
                            if (d.length === 11) doc.cpfHash = hashCPF(d);
                        }
                    }

                    doc[grupo][campo] = valor;
                });
            });
        }

        await doc.save();

        logger.info(`✏️ [INSCRIÇÕES] Inscrição ${doc.protocolo} atualizada por ${autor}`);

        const docDec = descriptografarInscricao(doc);
        res.json({ success: true, mensagem: 'Inscrição atualizada.', inscricao: docDec });
    } catch (error) {
        logger.error('❌ [INSCRIÇÕES] Erro ao atualizar:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ---- DELETE /admin/:id — SÓ admin/super_admin ----
router.delete('/admin/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, error: 'ID inválido.' });
        }

        const doc = await Inscricao.findByIdAndDelete(req.params.id);
        if (!doc) return res.status(404).json({ success: false, error: 'Inscrição não encontrada.' });

        logger.warn(`🗑️ [INSCRIÇÕES] Inscrição ${doc.protocolo} EXCLUÍDA por ${req.userNome || req.userId}`);

        res.json({ success: true, mensagem: `Inscrição ${doc.protocolo} removida.` });
    } catch (error) {
        logger.error('❌ [INSCRIÇÕES] Erro ao excluir:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ---- GET /publica/alunos-todos ----
router.get('/publica/alunos-todos', async (req, res) => {
    try {
        const termo = String(req.query.nome || '').trim();
        const turmaFiltro = String(req.query.turma || '').trim();
        const cursoFiltro = String(req.query.curso || '').trim();
        const rx = termo ? new RegExp(escaparRegex(termo), 'i') : null;
        
        const resultados = [];

        // 1. Busca nas Inscrições
        try {
            const filtroInscricao = { status: { $ne: 'Cancelada' } };
            if (rx) filtroInscricao['aluno.nomeCompleto'] = rx;
            if (turmaFiltro) filtroInscricao.serie = new RegExp(escaparRegex(turmaFiltro), 'i');

            const inscricoes = await Inscricao.find(filtroInscricao)
                .sort({ 'aluno.nomeCompleto': 1 })
                .limit(50)
                .select('protocolo aluno.nomeCompleto serie responsavel.nomeCompleto')
                .lean();

            inscricoes.forEach(d => {
                resultados.push({
                    id: d._id.toString(),
                    nome: d.aluno?.nomeCompleto || 'Aluno sem nome',
                    matricula: d.protocolo,
                    turma: d.serie || '—',
                    curso: 'Inscrição',
                    origem: 'Inscrição',
                    responsavel: d.responsavel?.nomeCompleto || '—'
                });
            });
        } catch (e) {
            logger.warn('⚠️ [INSCRIÇÕES] Erro ao buscar inscrições:', e.message);
        }

        // 2. Busca nos Usuários (Alunos antigos)
        try {
            let User;
            try { User = require('../../models/User'); } catch (_) {}
            if (!User) { try { User = require('../../../models/User'); } catch (_) {} }

            if (User) {
                const filtroAluno = { role: 'aluno', ativo: true };
                if (rx) filtroAluno.nome = rx;
                if (turmaFiltro) filtroAluno.turma = new RegExp(escaparRegex(turmaFiltro), 'i');
                if (cursoFiltro) filtroAluno.curso = new RegExp(escaparRegex(cursoFiltro), 'i');

                const alunosMatriculados = await User.find(filtroAluno)
                    .sort({ nome: 1 })
                    .limit(50)
                    .select('nome matricula turma curso')
                    .lean();

                alunosMatriculados.forEach(a => {
                    resultados.push({
                        id: a._id.toString(),
                        nome: a.nome || 'Aluno sem nome',
                        matricula: a.matricula || '—',
                        turma: a.turma || '—',
                        curso: a.curso || '—',
                        origem: 'Matrícula',
                        responsavel: '—'
                    });
                });
            }
        } catch (e) {
            logger.warn('⚠️ [INSCRIÇÕES] Erro ao buscar usuários:', e.message);
        }

        // 3. Busca as opções de Turmas e Cursos
        let turmas = [];
        let cursos = [];
        try {
            let User;
            try { User = require('../../models/User'); } catch (_) {}
            if (!User) { try { User = require('../../../models/User'); } catch (_) {} }

            if (User) {
                const turmasDB = await User.distinct('turma', { role: 'aluno', ativo: true, turma: { $ne: null } });
                turmas = [...new Set(turmasDB)].filter(Boolean).sort();

                const cursosDB = await User.distinct('curso', { role: 'aluno', ativo: true, curso: { $ne: null } });
                cursos = [...new Set(cursosDB)].filter(Boolean).sort();
            }
            
            const seriesDB = await Inscricao.distinct('serie', { status: { $ne: 'Cancelada' } });
            seriesDB.forEach(s => {
                if (s && !turmas.includes(s)) turmas.push(s);
            });
            turmas.sort();

        } catch (e) {
            logger.warn('⚠️ [INSCRIÇÕES] Erro ao buscar opções de turmas/cursos:', e.message);
        }

        // Remove duplicatas
        const unicos = [];
        const vistos = new Set();
        resultados.forEach(r => {
            const chave = r.nome.toLowerCase() + '|' + r.matricula;
            if (!vistos.has(chave)) {
                vistos.add(chave);
                unicos.push(r);
            }
        });

        unicos.sort((a, b) => a.nome.localeCompare(b.nome));

        res.json({ success: true, alunos: unicos, turmas, cursos });

    } catch (error) {
        logger.error('❌ [INSCRIÇÕES] Erro na busca unificada:', error);
        res.status(500).json({ success: false, error: 'Não foi possível buscar os alunos.' });
    }
});

module.exports = router;