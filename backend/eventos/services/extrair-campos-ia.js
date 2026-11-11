// ============================================================================
// backend/eventos/services/extrair-campos-ia.js
// ============================================================================

const fs = require('fs');
const path = require('path');

let logger = console;
try { logger = require('../../../utils/logger'); } catch (_) {}

let pdfParse = null;
try { pdfParse = require('pdf-parse'); } catch (_) {}
let mammoth = null;
try { mammoth = require('mammoth'); } catch (_) {}
let WordExtractor = null;
try { WordExtractor = require('word-extractor'); } catch (_) {}

const MODELOS_GROQ = [
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
    'llama-3.3-70b-versatile',
    'allam-2-7b'
];

// ============================================================
// LEITURA DE TEXTO — preserva tabelas e headers
// ============================================================
async function lerTextoAnexo(caminhoAbsoluto) {
    const ext = path.extname(caminhoAbsoluto).toLowerCase();
    try {
        if (ext === '.txt') return fs.readFileSync(caminhoAbsoluto, 'utf8');
        if (ext === '.pdf' && pdfParse) {
            const buffer = fs.readFileSync(caminhoAbsoluto);
            const data = await pdfParse(buffer);
            return data.text || '';
        }
        if (ext === '.docx' && mammoth) {
            const result = await mammoth.convertToHtml({ path: caminhoAbsoluto });
            return htmlParaTextoComTabelas(result.value || '');
        }
        if (ext === '.doc' && WordExtractor) {
            const extractor = new WordExtractor();
            const doc = await extractor.extract(caminhoAbsoluto);
            return doc.getBody() || '';
        }
    } catch (err) {
        logger.warn(`⚠️ [EVENTOS] Erro lendo ${ext}:`, err.message);
    }
    return '';
}

/**
 * Converte HTML (mammoth) em texto plano preservando:
 * - Tabelas → linhas "célula | célula | célula"
 * - Headers → "## Título"
 * - Listas → "• item"
 */
function htmlParaTextoComTabelas(html) {
    if (!html) return '';

    let texto = html
        // Headers viram "## Título"
        .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '\n## $1\n')
        .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n## $1\n')
        .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n### $1\n')
        .replace(/<h4[^>]*>(.*?)<\/h4>/gi, '\n#### $1\n')
        .replace(/<h5[^>]*>(.*?)<\/h5>/gi, '\n##### $1\n')
        .replace(/<h6[^>]*>(.*?)<\/h6>/gi, '\n###### $1\n')
        // Marca células com " | " (antes de remover tags)
        .replace(/<\/(td|th)>/gi, ' | ')
        // Marca fim de linha
        .replace(/<\/(tr|p|div|li)>/gi, '\n')
        // Quebra de linha
        .replace(/<br\s*\/?>/gi, '\n')
        // Listas
        .replace(/<li[^>]*>/gi, '• ')
        // Remove tags restantes
        .replace(/<[^>]+>/g, '')
        // Entidades HTML
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&aacute;/gi, 'á').replace(/&eacute;/gi, 'é').replace(/&iacute;/gi, 'í')
        .replace(/&oacute;/gi, 'ó').replace(/&uacute;/gi, 'ú').replace(/&ccedil;/gi, 'ç')
        .replace(/&atilde;/gi, 'ã').replace(/&otilde;/gi, 'õ')
        .replace(/&Aacute;/g, 'Á').replace(/&Eacute;/g, 'É').replace(/&Iacute;/g, 'Í')
        .replace(/&Oacute;/g, 'Ó').replace(/&Uacute;/g, 'Ú').replace(/&Ccedil;/g, 'Ç')
        .replace(/&Atilde;/g, 'Ã').replace(/&Otilde;/g, 'Õ');

    // Limpa linhas vazias múltiplas e espaços
    texto = texto
        .split('\n')
        .map(l => l.replace(/[ \t]+/g, ' ').replace(/\s*\|\s*/g, ' | ').trim())
        .filter(l => l.length > 0)
        .join('\n');

    return texto;
}

// ============================================================
// IDENTIFICAÇÃO DE TIPO
// ============================================================
function identificarTipoAnexo(texto, nomeOriginal) {
    const txt = (texto || '').toLowerCase();
    const nome = (nomeOriginal || '').toLowerCase();

    if (/ficha de avalia[çc][ãa]o|crit[ée]rios? de avalia|itens de avalia|nota de 1 a|nota de 0 a|\bavalia[çc][ãa]o\b/.test(txt) ||
        /avalia[çc][ãa]o|crit[ée]rios?|ficha.*avalia/.test(nome)) {
        return 'ficha_avaliacao';
    }
    if (/autoriza[çc][ãa]o de uso de imagem|termo de imagem|uso de imagem|direito de imagem|cess[ãa]o de imagem/.test(txt) ||
        /autoriza[çc][ãa]o.*imagem|uso.*imagem|termo.*imagem/.test(nome)) {
        return 'termo_imagem';
    }
    if (/lgpd|consentimento|privacidade|prote[çc][ãa]o de dados|termo de ci[êe]ncia/.test(txt) ||
        /lgpd|consentimento|privacidade/.test(nome)) {
        return 'termo_lgpd';
    }
    if (/formul[áa]rio|ficha|inscri[çc][ãa]o|fecim|equipe/.test(nome) ||
        /formul[áa]rio|ficha de inscri|dados do (candidato|participante|aluno|equipe)/.test(txt)) {
        return 'formulario';
    }
    if (/edital|processo seletivo|chamada p[úu]blica|regulamento/.test(nome) ||
        /edital|processo seletivo|chamada p[úu]blica|regulamento/.test(txt)) {
        return 'edital';
    }
    return 'outro';
}

// ============================================================
// PARSER ROBUSTO DE JSON
// ============================================================
function parseJSONRobusto(resposta) {
    if (!resposta) return null;

    let txt = String(resposta).trim();

    // 1) Remove blocos markdown ```json ... ``` ou ``` ... ```
    txt = txt.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    // 2) Tenta parse direto
    try { return JSON.parse(txt); } catch (_) { }

    // 3) Procura o primeiro { e o último } e tenta de novo
    const primeiro = txt.indexOf('{');
    const ultimo = txt.lastIndexOf('}');
    if (primeiro !== -1 && ultimo > primeiro) {
        const trecho = txt.substring(primeiro, ultimo + 1);
        try { return JSON.parse(trecho); } catch (_) { }
    }

    return null;
}

// ============================================================
// REGEX FALLBACK (sem IA)
// ============================================================
function extrairCamposPorRegex(texto) {
    if (!texto || texto.length < 20) {
        return { campos: [], camposRepetiveis: [], labelGrupoRepetivel: '', criteriosAvaliacao: [], informacoesDocumento: '', legendasNotas: [] };
    }

    const achados = [];
    const achadosRepetiveis = [];
    const criterios = [];
    const legendasNotas = [];
    const linhasInformativas = [];

    const pushFixo = (label, tipo, obrigatorio = false) => {
        const n = label.toLowerCase().trim();
        if (!achados.some(a => a.label.toLowerCase() === n)) {
            achados.push({ label, tipo, obrigatorio, opcoes: [], placeholder: '', ajuda: '', origemIA: false });
        }
    };
    const pushRep = (label, tipo, obrigatorio = false) => {
        const n = label.toLowerCase().trim();
        if (!achadosRepetiveis.some(a => a.label.toLowerCase() === n)) {
            achadosRepetiveis.push({ label, tipo, obrigatorio, opcoes: [], placeholder: '', ajuda: '', origemIA: false });
        }
    };

    const linhas = texto.split('\n');
    const ehFichaAvaliacao = /ficha de avalia|crit[ée]rios? de avalia|itens de avalia|nota de 1 a|nota de 0 a/i.test(texto);

    if (ehFichaAvaliacao) {
        for (const linha of linhas) {
            if (linha.includes('|')) {
                const partes = linha.split('|').map(p => p.trim()).filter(Boolean);
                if (partes.length < 2) continue;

                const primeira = partes[0].toLowerCase();
                if (/crit[ée]rio|item|nota|avalia[çc][ãa]o/i.test(primeira) && partes.length <= 2) continue;
                if (/soma|total/i.test(primeira)) continue;

                if (partes[0].length >= 10) {
                    const label = partes[0].replace(/\s+/g, ' ').trim();
                    const descricao = partes.slice(1).join(' — ').replace(/\s+/g, ' ').trim();
                    if (!criterios.some(c => c.label.toLowerCase() === label.toLowerCase())) {
                        criterios.push({ label, descricao, notaMaxima: 5, obrigatorio: true, origemIA: false });
                    }
                }
            } else {
                const t = linha.trim();
                if (t.length > 30 && !/^(nome|t[íi]tulo|professor|equipe|escola|data|cpf|rg|e-mail|telefone)/i.test(t)) {
                    linhasInformativas.push(t);
                }
            }

            const regexLegenda = /(\d{1,3})\s*[–\-—]\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇ\s]{2,40})/g;
            let m;
            while ((m = regexLegenda.exec(linha)) !== null) {
                const valor = parseInt(m[1]);
                const label = m[2].trim();
                if (valor >= 0 && valor <= 100 && label.length >= 3) {
                    if (!legendasNotas.some(l => l.valor === valor && l.label === label)) {
                        legendasNotas.push({ valor, label });
                    }
                }
            }
        }
    }

    const temAlunos = /(estudante|aluno|integrante|membro|participante)\s*[1-9]/i.test(texto);
    const labelGrupo = temAlunos ? texto.match(/(estudante|aluno|integrante|membro|participante)/i)[0] : 'Estudante';
    const labelGrupoCap = labelGrupo.charAt(0).toUpperCase() + labelGrupo.slice(1);

    if (temAlunos) {
        if (/nome completo/i.test(texto) || /\bnome\b/i.test(texto)) pushRep('Nome Completo', 'text', true);
        if (/\bcpf\b/i.test(texto)) pushRep('CPF', 'cpf', true);
        if (/data de nascimento/i.test(texto)) pushRep('Data de Nascimento', 'date', true);
        if (/\brg\b/i.test(texto)) pushRep('RG', 'rg', false);
        if (/\be-?mail\b/i.test(texto)) pushRep('E-mail', 'email', false);

        if (/\bequipe\b/i.test(texto)) pushFixo('Nome da Equipe', 'text', true);
        if (/\bprojeto\b|\btema\b|\bt[íi]tulo do trabalho\b/i.test(texto)) pushFixo('Título do Projeto / Tema', 'text', true);
        if (/\borientador\b/i.test(texto)) pushFixo('Professor Orientador', 'text', false);
    } else {
        if (/nome completo/i.test(texto) || /\bnome\b/i.test(texto)) pushFixo('Nome Completo', 'text', true);
        if (/\bcpf\b/i.test(texto)) pushFixo('CPF', 'cpf', true);
        if (/\be-?mail\b/i.test(texto)) pushFixo('E-mail', 'email', true);
        if (/\btelefone\b/i.test(texto) || /\bcelular\b/i.test(texto)) pushFixo('Telefone', 'tel', false);
    }

    if (ehFichaAvaliacao) {
        if (/nome do \(a\) avaliador|nome do avaliador/i.test(texto)) pushFixo('Nome do Avaliador', 'text', false);
        if (/nome da equipe ou s[ée]rie|nome da equipe/i.test(texto)) pushFixo('Nome da Equipe ou Série', 'text', false);
        if (/t[íi]tulo do projeto/i.test(texto)) pushFixo('Título do Projeto', 'text', false);
        if (/professor \(a\) respons[áa]vel|professor respons[áa]vel/i.test(texto)) pushFixo('Professor(a) Responsável', 'text', false);
    }

    return {
        campos: achados,
        camposRepetiveis: achadosRepetiveis,
        labelGrupoRepetivel: temAlunos ? labelGrupoCap : '',
        criteriosAvaliacao: criterios,
        informacoesDocumento: linhasInformativas.join('\n\n').substring(0, 4000),
        legendasNotas
    };
}

// ============================================================
// EXTRAÇÃO POR IA
// ============================================================
async function extrairCamposPorIA(texto, groqInstance, tipoAnexo) {
    if (!groqInstance) return null;
    const textoLimitado = texto.substring(0, 14000);

    const prompt = `Você é um assistente especializado em análise de documentos educacionais brasileiros.
Documento do tipo: "${tipoAnexo}".
Sua tarefa: extrair TODOS os dados estruturados do documento em 5 grupos.

GRUPO 1 — campos (o que o PROFESSOR / PARTICIPANTE preenche):
Se o documento tem campos para o professor/participante preencher (ex: "NOME DO PROFESSOR:", "CPF:", "E-mail:"), extraia cada um como { "label", "tipo", "obrigatorio" }.
Tipos válidos: text, date, number, email, tel, cpf, rg, textarea, select.

GRUPO 2 — camposRepetiveis (o que cada ALUNO preenche):
Se o documento tem campos que repetem por aluno (ex: "Estudante 1: Nome, CPF, ..."), extraia em camposRepetiveis.
NÃO duplique: um campo só vai para campos OU camposRepetiveis.

GRUPO 3 — criteriosAvaliacao (APENAS para fichas de avaliação):
Se o documento tem uma TABELA com critérios de avaliação (ex: "Critérios | Nota", "Item | Pontuação"), extraia CADA LINHA como { "label", "descricao", "notaMaxima", "obrigatorio" }.
O texto da tabela chega como "texto | texto | ...". Cada linha = 1 critério.
notaMaxima: o valor máximo (ex: 5). Se não estiver explícito, use 5.
NÃO inclua cabeçalhos ("CRITÉRIOS", "Nota de 1 a 5") nem "SOMA DOS ITENS" como critério.

GRUPO 4 — informacoesDocumento (TEXTO CORRIDO INFORMATIVO):
Extraia TODO o texto corrido que não é campo nem critério:
- Títulos e cabeçalhos (ex: "MINISTÉRIO DA CIÊNCIA...")
- Objetivos/instruções (ex: "Os trabalhos devem defender estes objetivos: a) Preservação...")
- Regras e observações (ex: "dando um total de 50 PONTOS")
- Descrições/contexto
Retorne como string única (com quebras de linha preservadas).
Se não houver texto corrido, retorne "".

GRUPO 5 — legendasNotas (APENAS se houver legenda de notas):
Se o documento tem legenda tipo "01 – INSATISFATÓRIO; 02 – REGULAR; 03 – BOM", extraia como array de { "valor": 1, "label": "INSATISFATÓRIO" }.

Retorne APENAS JSON válido (sem markdown, sem texto antes ou depois), no formato:
{
  "campos": [ { "label": "Nome do Avaliador", "tipo": "text", "obrigatorio": false } ],
  "camposRepetiveis": [],
  "labelGrupoRepetivel": "Estudante",
  "quantidadePadrao": 3,
  "maxRepeticoes": 10,
  "criteriosAvaliacao": [ { "label": "Adequação ao Eixo", "descricao": "texto", "notaMaxima": 5, "obrigatorio": true } ],
  "informacoesDocumento": "texto corrido aqui...",
  "legendasNotas": [ { "valor": 1, "label": "INSATISFATÓRIO" } ]
}

=== TEXTO ===
${textoLimitado}
=== FIM ===`;

    for (const modelo of MODELOS_GROQ) {
        try {
            const usaJsonMode = /openai\/gpt-oss/i.test(modelo);

            const completion = await groqInstance.chat.completions.create({
                model: modelo,
                messages: [
                    { role: 'system', content: 'Você responde APENAS com JSON válido, sem markdown, sem texto antes ou depois.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.1,
                max_tokens: 4000,
                ...(usaJsonMode ? { response_format: { type: 'json_object' } } : {})
            });

            const resposta = completion.choices[0]?.message?.content || '';
            const parsed = parseJSONRobusto(resposta);

            if (!parsed) {
                logger.warn(`⚠️ [EVENTOS] ${modelo} retornou JSON inválido. Resposta (200 chars): ${resposta.substring(0, 200)}`);
                continue;
            }

            const tiposValidos = ['text', 'date', 'number', 'email', 'tel', 'cpf', 'rg', 'textarea', 'select'];
            const tratar = (arr) => (Array.isArray(arr) ? arr : [])
                .filter(c => c && c.label)
                .map(c => ({
                    label: String(c.label).trim(),
                    tipo: tiposValidos.includes(c.tipo) ? c.tipo : 'text',
                    obrigatorio: c.obrigatorio === true,
                    opcoes: Array.isArray(c.opcoes) ? c.opcoes.map(String) : [],
                    placeholder: '', ajuda: '', origemIA: true
                }));

            const campos = tratar(parsed.campos);
            const camposRepetiveis = tratar(parsed.camposRepetiveis);

            const criteriosAvaliacao = Array.isArray(parsed.criteriosAvaliacao)
                ? parsed.criteriosAvaliacao
                    .filter(c => c && c.label && String(c.label).length >= 3)
                    .filter(c => !/^(crit[ée]rios?|soma|total|item|nota|pontua)/i.test(String(c.label).trim()))
                    .map(c => ({
                        label: String(c.label).trim(),
                        descricao: String(c.descricao || '').trim(),
                        notaMaxima: parseFloat(c.notaMaxima) || 5,
                        obrigatorio: true,
                        origemIA: true
                    }))
                : [];

            const informacoesDocumento = String(parsed.informacoesDocumento || '').trim();

            const legendasNotas = Array.isArray(parsed.legendasNotas)
                ? parsed.legendasNotas
                    .filter(l => l && l.valor !== undefined && l.label)
                    .map(l => ({ valor: parseInt(l.valor) || 0, label: String(l.label).trim() }))
                : [];

            if (campos.length > 0 || camposRepetiveis.length > 0 || criteriosAvaliacao.length > 0 || informacoesDocumento.length > 0) {
                logger.info(`🤖 [EVENTOS] Modelo ${modelo} | campos: ${campos.length} | rep: ${camposRepetiveis.length} | critérios: ${criteriosAvaliacao.length} | infos: ${informacoesDocumento.length} chars | legendas: ${legendasNotas.length}`);
                return {
                    campos,
                    camposRepetiveis,
                    labelGrupoRepetivel: parsed.labelGrupoRepetivel || 'Estudante',
                    quantidadePadrao: parseInt(parsed.quantidadePadrao) || 3,
                    maxRepeticoes: parseInt(parsed.maxRepeticoes) || 10,
                    criteriosAvaliacao,
                    informacoesDocumento,
                    legendasNotas
                };
            }
        } catch (err) {
            const msg = err.message || '';
            if (msg.includes('does not exist') || msg.includes('not_found') || msg.includes('404')) {
                logger.warn(`⚠️ [EVENTOS] Modelo ${modelo} indisponível`);
                continue;
            }
            logger.warn(`⚠️ [EVENTOS] Erro no modelo ${modelo}:`, msg);
        }
    }
    return null;
}

// ============================================================
// PROCESSAMENTO PRINCIPAL
// ============================================================
async function processarArquivo(caminhoAbsoluto, nomeOriginal, groqInstance) {
    let texto = '';
    try { texto = await lerTextoAnexo(caminhoAbsoluto); }
    catch (err) { logger.warn('⚠️ [EVENTOS] Erro lendo:', err.message); }

    const tamanho = (texto || '').length;
    logger.info(`[EVENTOS] ${nomeOriginal} → texto: ${tamanho} chars`);

    if (process.env.DEBUG_IA === '1') {
        logger.info(`[EVENTOS] Amostra do texto: ${texto.substring(0, 500).replace(/\n/g, ' \\n ')}`);
    }

    const tipoAnexo = identificarTipoAnexo(texto, nomeOriginal);
    logger.info(`[EVENTOS] ${nomeOriginal} → tipo: ${tipoAnexo}`);

    // 🔥 REGRA: Se for edital, NÃO extrai nada - apenas anexa
    if (tipoAnexo === 'edital') {
        logger.info(`📄 [EVENTOS] Edital detectado — não será extraído (apenas anexado)`);
        return {
            tipo: 'edital',
            nomeOriginal,
            campos: [],
            camposRepetiveis: [],
            labelGrupoRepetivel: '',
            quantidadePadrao: 1,
            maxRepeticoes: 10,
            criteriosAvaliacao: [],
            informacoesDocumento: '',
            legendasNotas: [],
            exigeAssinatura: false,
            isAvaliativo: false,
            fonte: 'edital'
        };
    }

    if (groqInstance && texto && tamanho > 20) {
        try {
            const r = await extrairCamposPorIA(texto, groqInstance, tipoAnexo);
            if (r && (r.campos.length > 0 || r.camposRepetiveis.length > 0 || r.criteriosAvaliacao.length > 0 || r.informacoesDocumento.length > 0)) {
                return {
                    tipo: tipoAnexo,
                    nomeOriginal,
                    campos: r.campos,
                    camposRepetiveis: r.camposRepetiveis,
                    labelGrupoRepetivel: r.labelGrupoRepetivel || 'Estudante',
                    quantidadePadrao: r.quantidadePadrao,
                    maxRepeticoes: r.maxRepeticoes,
                    criteriosAvaliacao: r.criteriosAvaliacao || [],
                    informacoesDocumento: r.informacoesDocumento || '',
                    legendasNotas: r.legendasNotas || [],
                    exigeAssinatura: tipoAnexo === 'termo_imagem' || tipoAnexo === 'termo_lgpd',
                    isAvaliativo: tipoAnexo === 'ficha_avaliacao',
                    fonte: 'ia'
                };
            }
        } catch (err) {
            logger.warn('⚠️ [EVENTOS] IA falhou:', err.message);
        }
    }

    const regex = extrairCamposPorRegex(texto);
    if (regex.campos.length > 0 || regex.camposRepetiveis.length > 0 || regex.criteriosAvaliacao.length > 0 || regex.informacoesDocumento.length > 0) {
        logger.info(`🔍 [EVENTOS] Regex: ${regex.campos.length} fixos, ${regex.camposRepetiveis.length} repetíveis, ${regex.criteriosAvaliacao.length} critérios, ${regex.informacoesDocumento.length} chars infos, ${regex.legendasNotas.length} legendas`);
        return {
            tipo: tipoAnexo,
            nomeOriginal,
            campos: regex.campos,
            camposRepetiveis: regex.camposRepetiveis,
            labelGrupoRepetivel: regex.labelGrupoRepetivel,
            quantidadePadrao: 3,
            maxRepeticoes: 10,
            criteriosAvaliacao: regex.criteriosAvaliacao || [],
            informacoesDocumento: regex.informacoesDocumento || '',
            legendasNotas: regex.legendasNotas || [],
            exigeAssinatura: tipoAnexo === 'termo_imagem' || tipoAnexo === 'termo_lgpd',
            isAvaliativo: tipoAnexo === 'ficha_avaliacao',
            fonte: 'regex'
        };
    }

    return {
        tipo: tipoAnexo,
        nomeOriginal,
        campos: [],
        camposRepetiveis: [],
        labelGrupoRepetivel: '',
        quantidadePadrao: 1,
        maxRepeticoes: 10,
        criteriosAvaliacao: [],
        informacoesDocumento: '',
        legendasNotas: [],
        exigeAssinatura: tipoAnexo === 'termo_imagem' || tipoAnexo === 'termo_lgpd',
        isAvaliativo: tipoAnexo === 'ficha_avaliacao',
        fonte: 'padrao'
    };
}

module.exports = { processarArquivo, identificarTipoAnexo, extrairCamposPorRegex };