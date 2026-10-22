// ============================================
// GESTÃO GERAL - SISTEMA COMPLETO
// Atrasos + Autorização + Justificativa + 2ª Chamada + Uniforme
// Com Assinatura Digital + Integração Automática
// + Tipo de Prova Perdida + Verificação de Duplicidade
// + CPF Obrigatório com Validação
// + 🆕 ASSINATURA VIA QR CODE (SESSÃO)
// + 🆕 PAGINAÇÃO (10 POR PÁGINA)
// + 🆕 MODO ASSINATURA VIA URL (?assinatura=UUID)
// + 🆕 SUB-ABA UNIFORME (Autorização)
// ============================================

let token = localStorage.getItem('auth_token');
let currentAluno = null;
let relatorioData = null;
let dashboardCharts = {};
let motivoSelecionado = null;

let scannerAuto = null;
let scannerAutoAtivo = false;

let modoAtual = 'automatico';
let turmasDisponiveis = [];
let alunosPorTurma = [];

// Autocomplete (Atrasos)
let __alunosParaRelatorio = [];
let __alunosFiltrados = [];
let __indiceSelecionado = -1;
let __alunosCarregados = false;

// ============================================
// 🆕 ESTADO DA SESSÃO DE ASSINATURA POR MÓDULO
// ============================================
const estadoSessaoAssinatura = {
    atraso: {
        sessaoId: null,
        assinaturaCapturada: null,
        qrCodeDataUrl: null,
        monitoramentoInterval: null,
        modalInstance: null
    },
    autorizacao: {
        sessaoId: null,
        assinaturaCapturada: null,
        qrCodeDataUrl: null,
        monitoramentoInterval: null,
        modalInstance: null
    },
    justificativa: {
        sessaoId: null,
        assinaturaCapturada: null,
        qrCodeDataUrl: null,
        monitoramentoInterval: null,
        modalInstance: null
    },
    segundaChamada: {
        sessaoId: null,
        assinaturaCapturada: null,
        qrCodeDataUrl: null,
        monitoramentoInterval: null,
        modalInstance: null
    },
    uniforme: {
        sessaoId: null,
        assinaturaCapturada: null,
        qrCodeDataUrl: null,
        monitoramentoInterval: null,
        modalInstance: null
    }
};

// ============================================
// 🆕 ESTADO DA SESSÃO DE ASSINATURA DO ALUNO (Apenas Atrasos)
// ============================================
const estadoSessaoAssinaturaAluno = {
    atraso: {
        sessaoId: null,
        assinaturaCapturada: null,
        qrCodeDataUrl: null,
        monitoramentoInterval: null,
        modalInstance: null
    }
};


// Modo assinatura (quando abre via ?assinatura=UUID)
let sessaoAssinaturaModo = null;
let sessaoAssinaturaAtual = null;
let telaCanvas = null;
let telaCtx = null;
let telaWrapper = null;
let telaPlaceholder = null;
let telaTemAssinatura = false;
let telaDesenhando = false;
let telaLastX = 0;
let telaLastY = 0;

// ============================================
// 🛡️ PROTEÇÃO CONTRA alert() NATIVO (Kodular)
// ============================================
(function protegerContraAlertNativo() {
    const alertOriginal = window.alert.bind(window);
    let __alertaEmProgresso = false;
    
    window.alert = function(mensagem) {
        if (__alertaEmProgresso) {
            console.log('[ALERT-RECURSÃO-EVITADA]', mensagem);
            return;
        }
        __alertaEmProgresso = true;
        
        try {
            const isWebView = /wv|WebView|Android.*Version\/[\d.]+.*Chrome/i.test(navigator.userAgent) ||
                              (typeof window.AppInventor !== 'undefined');
            
            if (!isWebView) {
                console.log('%c[ALERT] ' + mensagem, 'background:#8b5cf6;color:white;padding:4px 8px;border-radius:4px;');
                return;
            }
            
            const modal = document.createElement('div');
            modal.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;
                background:rgba(0,0,0,0.6);display:flex;align-items:center;
                justify-content:center;z-index:999999;padding:20px;box-sizing:border-box;`;
            modal.innerHTML = `
                <div style="background:white;border-radius:16px;padding:25px;max-width:380px;
                            width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.3);text-align:center;">
                    <div style="font-size:48px;margin-bottom:15px;">ℹ️</div>
                    <p style="margin:0 0 20px;color:#374151;font-size:15px;
                              line-height:1.5;white-space:pre-line;">${String(mensagem)}</p>
                    <button onclick="this.closest('div').parentElement.remove()"
                            style="width:100%;padding:12px;background:#8b5cf6;color:white;
                                   border:none;border-radius:10px;font-size:14px;
                                   font-weight:600;cursor:pointer;">OK</button>
                </div>
            `;
            document.body.appendChild(modal);
        } finally {
            __alertaEmProgresso = false;
        }
    };
    
    console.log('🛡️ [Proteção] window.alert sobrescrito (sem recursão)');
})();

// ============================================
// CONFIGURAÇÃO DOS MÓDULOS
// ============================================
const CONFIG_MODULOS = {
    autorizacao: { 
        tipo: 'autorizacao', 
        prefixo: 'Autorizacao', 
        prefixoInput: 'autorizacao',
        nomeAmigavel: 'Autorização', 
        containerLista: 'listaAutorizacoes' 
    },
    justificativa: { 
        tipo: 'justificativa', 
        prefixo: 'Justificativa', 
        prefixoInput: 'justificativa',
        nomeAmigavel: 'Justificativa', 
        containerLista: 'listaJustificativas' 
    },
    segundaChamada: { 
        tipo: 'segunda_chamada', 
        prefixo: 'SegundaChamada', 
        prefixoInput: 'segundaChamada',
        nomeAmigavel: '2ª Chamada', 
        containerLista: 'listaSegundaChamada' 
    },
    uniforme: {
        tipo: 'uniforme',
        prefixo: 'Uniforme',
        prefixoInput: 'uniforme',
        nomeAmigavel: 'Uniforme',
        containerLista: 'listaUniformes'
    }
};

const estados = {
    autorizacao: { currentAluno: null, motivoSelecionado: null, scanner: null, scannerAtivo: false, modoAtual: 'automatico', alunosPorTurma: [] },
    justificativa: { currentAluno: null, motivoSelecionado: null, scanner: null, scannerAtivo: false, modoAtual: 'automatico', alunosPorTurma: [] },
    segundaChamada: { currentAluno: null, motivoSelecionado: null, scanner: null, scannerAtivo: false, modoAtual: 'automatico', alunosPorTurma: [] },
    uniforme: { currentAluno: null, motivoSelecionado: null, scanner: null, scannerAtivo: false, modoAtual: 'automatico', alunosPorTurma: [] }
};

const relatoriosModulo = {
    autorizacao: null,
    justificativa: null,
    segundaChamada: null,
    uniforme: null
};

// 🆕 ESTADO DA PAGINAÇÃO POR MÓDULO (10 por página)
const paginacaoModuloState = {
    autorizacao: { paginaAtual: 1, porPagina: 10, totalRegistros: 0, totalPaginas: 0 },
    justificativa: { paginaAtual: 1, porPagina: 10, totalRegistros: 0, totalPaginas: 0 },
    segundaChamada: { paginaAtual: 1, porPagina: 10, totalRegistros: 0, totalPaginas: 0 },
    uniforme: { paginaAtual: 1, porPagina: 10, totalRegistros: 0, totalPaginas: 0 }
};

// 🆕 ESTADO DA PAGINAÇÃO - ATRASOS RECENTES (Dashboard)
const paginacaoAtrasosState = { paginaAtual: 1, porPagina: 10, totalRegistros: 0, totalPaginas: 0 };

const dashboardChartsModulo = {
    autorizacao: { motivos: null, atrasos: null, turmas: null },
    justificativa: { motivos: null, atrasos: null, turmas: null },
    segundaChamada: { motivos: null, atrasos: null, turmas: null },
    uniforme: { motivos: null, atrasos: null, turmas: null }
};

const autocompleteModuloState = {
    autorizacao: { alunos: [], filtrados: [], indice: -1, carregado: false, carregando: false },
    justificativa: { alunos: [], filtrados: [], indice: -1, carregado: false, carregando: false },
    segundaChamada: { alunos: [], filtrados: [], indice: -1, carregado: false, carregando: false },
    uniforme: { alunos: [], filtrados: [], indice: -1, carregado: false, carregando: false }
};

const assinaturaState = {
    autorizacao: { canvas: null, ctx: null, desenhando: false, temAssinatura: false, lastX: 0, lastY: 0, larguraBase: 0, alturaBase: 0 },
    justificativa: { canvas: null, ctx: null, desenhando: false, temAssinatura: false, lastX: 0, lastY: 0, larguraBase: 0, alturaBase: 0 },
    segundaChamada: { canvas: null, ctx: null, desenhando: false, temAssinatura: false, lastX: 0, lastY: 0, larguraBase: 0, alturaBase: 0 }
};

// ============================================
// REGRAS DE INTEGRAÇÃO AUTOMÁTICA
// ============================================
const MOTIVOS_AUTORIZACAO_GERAM_JUSTIFICATIVA = {
    'problemas_saude_responsavel_buscou': 'problemas_saude',
    'problemas_saude_responsavel_whatsapp': 'problemas_saude',
    'consultas': 'problemas_saude',
    'necessita_ausentar_retornar': 'problemas_saude'
};

const MOTIVOS_SEGUNDA_CHAMADA_PARA_JUSTIFICATIVA = {
    'problemas_pessoais': 'problemas_pessoais',
    'problemas_saude': 'problemas_saude',
    'viagem': 'viagem',
    'outros': 'outros'
};

// ============================================
// UTILITÁRIOS
// ============================================
function safeGet(id) { return document.getElementById(id); }
function safeSetText(id, value) { const el = safeGet(id); if (el) el.textContent = value; }

function escapeHTML(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ✅ Helper: retorna data LOCAL no formato YYYY-MM-DD (evita bug de UTC)
function getDataLocalISO(dateObj) {
    const d = dateObj || new Date();
    return d.getFullYear() + '-' + 
        String(d.getMonth() + 1).padStart(2, '0') + '-' + 
        String(d.getDate()).padStart(2, '0');
}



function gerarAvatarSVG(nome) {
    const inicial = (nome || '?').charAt(0).toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#1e3c72"/><stop offset="100%" stop-color="#2a5298"/></linearGradient></defs><circle cx="50" cy="50" r="50" fill="url(#g)"/><text x="50" y="50" font-family="Arial,sans-serif" font-size="45" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="central">${inicial}</text></svg>`;
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
}

// ============================================
// 📄 GERADOR DE CSV PROFISSIONAL (RELATÓRIO)
// ============================================
/**
 * Gera CSV profissional com cabeçalho, metadados e rodapé.
 *
 * @param {Object} opts
 * @param {string} opts.titulo        - Título do relatório (ex: "Relatório de Atrasos")
 * @param {string} [opts.subtitulo]   - Subtítulo (ex: "Turma: 3º Ano A")
 * @param {string} [opts.setor]       - Setor responsável (ex: "Gestão Geral")
 * @param {Array}  opts.colunas       - [{ label, key, format? }]
 * @param {Array}  opts.registros     - Dados
 * @param {Array<{label:string, valor:string}>} [opts.filtros] - Filtros aplicados
 * @param {string} opts.nomeArquivo   - Nome do arquivo (sem extensão)
 * @param {string} [opts.observacoes] - Observações extras no rodapé
 */
function gerarBaixarCSV(opts) {
    const {
        titulo = 'Relatório',
        subtitulo = '',
        setor = 'Gestão Geral',
        colunas = [],
        registros = [],
        filtros = [],
        nomeArquivo = 'relatorio',
        observacoes = ''
    } = opts || {};

    if (!Array.isArray(colunas) || colunas.length === 0) {
        notificar('⚠️ Nenhuma coluna definida', 'warning');
        return false;
    }
    if (!Array.isArray(registros) || registros.length === 0) {
        notificar('⚠️ Nenhum registro para exportar', 'warning');
        return false;
    }

    // ---------- Helpers ----------
    const agora = new Date();
    const dataGeracao = agora.toLocaleString('pt-BR');
    const dataArquivo = getDataLocalISO(agora);

    // Escapa valor para célula CSV
    const esc = (v) => {
        if (v === null || v === undefined) return '""';
        let s = String(v)
            .replace(/\r\n|\r|\n/g, ' ')   // remove quebras internas
            .replace(/"/g, '""')           // escapa aspas
            .trim();
        return `"${s}"`;
    };

    // Linha com apenas 1 célula (mesclada visualmente)
    const linhaUnica = (texto) => `"${String(texto).replace(/"/g, '""')}"` +
        ';'.repeat(Math.max(0, colunas.length - 1));

    // Linha de cabeçalho da tabela
    const linhaCabecalho = colunas.map(c => esc(c.label)).join(';');

    // Linhas de dados
    const linhasDados = registros.map(reg => {
        return colunas.map(col => {
            let v;
            try {
                v = col.format ? col.format(reg) : reg[col.key];
            } catch (e) {
                console.warn(`Erro coluna ${col.key}:`, e);
                v = '';
            }
            return esc(v);
        }).join(';');
    });

    // ---------- Montagem do CSV ----------
    const L = []; // linhas
    const totalCols = colunas.length;
    const separador = ';'.repeat(totalCols - 1);

    // 🏛️ CABEÇALHO INSTITUCIONAL
    L.push(linhaUnica('IEMA PLENO: SÃO LUÍS - CENTRO'));
    L.push(linhaUnica('Sistema de Atendimentos — EducaPleno'));
    L.push(linhaUnica(`Setor: ${setor}`));
    L.push(linhaUnica('')); // linha em branco

    // 📋 TÍTULO
    L.push(linhaUnica(titulo.toUpperCase()));
    if (subtitulo) L.push(linhaUnica(subtitulo));
    L.push(linhaUnica('')); // linha em branco

    // 📊 METADADOS
    L.push(linhaUnica(`Data de geração: ${dataGeracao}`));
    L.push(linhaUnica(`Total de registros: ${registros.length}`));

    if (filtros.length > 0) {
        L.push(linhaUnica('Filtros aplicados:'));
        filtros.forEach(f => {
            if (f && f.valor) L.push(linhaUnica(`  • ${f.label}: ${f.valor}`));
        });
    }

    if (observacoes) {
        L.push(linhaUnica(`Observações: ${observacoes}`));
    }

    L.push(linhaUnica('')); // linha em branco
    L.push(linhaUnica('─'.repeat(40))); // divisor visual
    L.push(linhaUnica('')); // linha em branco

    // 📋 TABELA
    L.push(linhaCabecalho);
    L.push(...linhasDados);

    L.push(linhaUnica('')); // linha em branco
    L.push(linhaUnica('─'.repeat(40)));
    L.push(linhaUnica('')); // linha em branco

    // 🖋️ RODAPÉ
    L.push(linhaUnica('Documento gerado automaticamente pelo EducaPleno'));
    L.push(linhaUnica(`Setor responsável: ${setor}`));
    L.push(linhaUnica(`Gerado em: ${dataGeracao}`));
    L.push(linhaUnica('Este relatório é de uso interno e confidencial.'));

    // ---------- CSV FINAL ----------
    const csv = '\uFEFF' + L.join('\r\n');

    // ---------- Download ----------
    try {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.download = `${nomeArquivo}_${dataArquivo}.csv`;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }, 100);
        return true;
    } catch (e) {
        console.error('Erro ao gerar CSV:', e);
        notificar('❌ Erro ao gerar CSV', 'error');
        return false;
    }
}

// 🆕 FORMATAÇÃO DE CPF E TELEFONE
function formatarCPF(input) {
    if (!input) return;
    let v = input.value.replace(/\D/g, '');
    if (v.length > 11) v = v.substring(0, 11);
    v = v.replace(/(\d{3})(\d)/, '$1.$2');
    v = v.replace(/(\d{3})(\d)/, '$1.$2');
    v = v.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    input.value = v;
}

function formatarTelefone(input) {
    if (!input) return;
    let v = input.value.replace(/\D/g, '');
    if (v.length > 11) v = v.substring(0, 11);
    if (v.length <= 10) {
        v = v.replace(/(\d{2})(\d)/, '($1) $2');
        v = v.replace(/(\d{4})(\d)/, '$1-$2');
    } else {
        v = v.replace(/(\d{2})(\d)/, '($1) $2');
        v = v.replace(/(\d{5})(\d)/, '$1-$2');
    }
    input.value = v;
}

// 🆕 VALIDAÇÃO DE CPF (frontend)
function validarCPFCliente(cpf) {
    if (!cpf || typeof cpf !== 'string') {
        return { valido: false, erro: 'CPF não informado' };
    }
    
    const cpfLimpo = cpf.replace(/\D/g, '');
    
    if (cpfLimpo.length !== 11) {
        return { valido: false, erro: 'CPF deve conter 11 dígitos' };
    }
    
    if (/^(\d)\1{10}$/.test(cpfLimpo)) {
        return { valido: false, erro: 'CPF inválido (dígitos repetidos)' };
    }
    
    let soma = 0;
    for (let i = 0; i < 9; i++) {
        soma += parseInt(cpfLimpo.charAt(i)) * (10 - i);
    }
    let resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    if (resto !== parseInt(cpfLimpo.charAt(9))) {
        return { valido: false, erro: 'CPF inválido (1º dígito verificador)' };
    }
    
    soma = 0;
    for (let i = 0; i < 10; i++) {
        soma += parseInt(cpfLimpo.charAt(i)) * (11 - i);
    }
    resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    if (resto !== parseInt(cpfLimpo.charAt(10))) {
        return { valido: false, erro: 'CPF inválido (2º dígito verificador)' };
    }
    
    return { valido: true, cpfLimpo };
}

// ============================================
// INICIALIZAÇÃO
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    // ============================================
    // 🆕 MODO ASSINATURA (via URL ?assinatura=UUID)
    // ============================================
    const modoAssinatura = new URLSearchParams(window.location.search).get('assinatura');
    if (modoAssinatura) {
        console.log('📱 Modo assinatura detectado:', modoAssinatura);
        window.__MODO_ASSINATURA__ = true;
        await mostrarTelaAssinatura(modoAssinatura);
        return;
    }
    
    // ============================================
    // ⬇️ FLUXO NORMAL (com login)
    // ============================================
    if (!token) { 
        window.location.href = '/login.html'; 
        return; 
    }
    
    const userData = JSON.parse(localStorage.getItem('user_data') || '{}');
    const allowedRoles = ['gestao_geral', 'super_admin', 'admin'];
    
    if (!allowedRoles.includes(userData.role)) {
        notificar('Acesso negado.');
        window.location.href = '/login.html';
        return;
    }
    
    safeSetText('userName', userData.nome || 'Gestão Geral');
    safeSetText('dataAtual', new Date().toLocaleDateString('pt-BR'));
    
    await carregarFotoPerfil();
    await carregarTurmasParaManual();
    await carregarTurmasParaRelatorio();
    
    setTimeout(() => {
        if (document.getElementById('modoAutomatico')?.offsetParent !== null) {
            iniciarScannerAutomatico();
        }
    }, 1000);

    // ============ RODÍZIOS ============
    safeGet('aba-rodizios')?.addEventListener('shown.bs.tab', () => {
        console.log('🔄 Aba rodízios ativada — carregando...');
        if (typeof carregarRodizios === 'function') {
            carregarRodizios();
        } else {
            console.error('❌ carregarRodizios não existe! O gestao-geral-rodizio.js não foi carregado.');
        }
    });

    setTimeout(() => {
        if (document.getElementById('aba-rodizios')?.classList.contains('active')) {
            console.log('🔄 Aba rodízios é a inicial — carregando no load...');
            if (typeof carregarRodizios === 'function') {
                carregarRodizios();
            }
        }
    }, 1500);
    
    // ============ ATRASOS (LISTENERS) ============
    safeGet('modoAutomaticoBtn')?.addEventListener('click', () => setModo('automatico'));
    safeGet('modoManualBtn')?.addEventListener('click', () => setModo('manual'));
    safeGet('filtroTurmaManual')?.addEventListener('change', () => carregarAlunosPorTurma());
    safeGet('filtroBuscaManual')?.addEventListener('input', () => filtrarAlunosManual());
    
    safeGet('atraso-dashboard-tab')?.addEventListener('shown.bs.tab', () => {
        carregarDashboardAtrasos();
        carregarAtrasosRecentes(1);
    });
    safeGet('atraso-relatorios-tab')?.addEventListener('shown.bs.tab', () => carregarTurmasParaRelatorio());
    
    // 🆕 Evento da Aba Atrasos: Carrega Scanner, Filtros e Lista ao entrar
    safeGet('aba-atrasos')?.addEventListener('shown.bs.tab', () => {
        setTimeout(() => {
            if (modoAtual === 'automatico' && !scannerAutoAtivo) iniciarScannerAutomatico();
        }, 300);
        configurarFiltrosAtrasosRecentes();
        carregarAtrasosRecentes(1);
    });
    
    // ============ MÓDULOS EXTRAS ============
    const hoje = getDataLocalISO();
    ['autorizacaoData', 'justificativaData', 'segundaChamadaData'].forEach(id => {
        const el = safeGet(id);
        if (el) el.value = hoje;
    });
    
    // AUTORIZAÇÃO
    safeGet('modoAutomaticoAutorizacaoBtn')?.addEventListener('click', () => setModoModulo('autorizacao', 'automatico'));
    safeGet('modoManualAutorizacaoBtn')?.addEventListener('click', () => setModoModulo('autorizacao', 'manual'));
    safeGet('filtroTurmaManualAutorizacao')?.addEventListener('change', () => carregarAlunosTurmaModulo('autorizacao'));
    safeGet('filtroBuscaManualAutorizacao')?.addEventListener('input', () => filtrarAlunosManualModulo('autorizacao'));
    safeGet('aba-autorizacao')?.addEventListener('shown.bs.tab', () => {
        carregarTurmasManualModulo('autorizacao');
        carregarListaModulo('autorizacao', 1);
        setTimeout(() => {
            if (estados.autorizacao.modoAtual === 'automatico' && !estados.autorizacao.scannerAtivo) {
                iniciarScannerModulo('autorizacao');
            }
        }, 300);
        setTimeout(() => travarDataRegistroAutorizacao(), 400);
    });
    
    // JUSTIFICATIVA
    safeGet('modoAutomaticoJustificativaBtn')?.addEventListener('click', () => setModoModulo('justificativa', 'automatico'));
    safeGet('modoManualJustificativaBtn')?.addEventListener('click', () => setModoModulo('justificativa', 'manual'));
    safeGet('filtroTurmaManualJustificativa')?.addEventListener('change', () => carregarAlunosTurmaModulo('justificativa'));
    safeGet('filtroBuscaManualJustificativa')?.addEventListener('input', () => filtrarAlunosManualModulo('justificativa'));
    safeGet('aba-justificativa')?.addEventListener('shown.bs.tab', () => {
        carregarTurmasManualModulo('justificativa');
        carregarListaModulo('justificativa', 1);
        setTimeout(() => {
            if (estados.justificativa.modoAtual === 'automatico' && !estados.justificativa.scannerAtivo) {
                iniciarScannerModulo('justificativa');
            }
        }, 300);
    });
    
    // 2ª CHAMADA
    safeGet('modoAutomaticoSegundaChamadaBtn')?.addEventListener('click', () => setModoModulo('segundaChamada', 'automatico'));
    safeGet('modoManualSegundaChamadaBtn')?.addEventListener('click', () => setModoModulo('segundaChamada', 'manual'));
    safeGet('filtroTurmaManualSegundaChamada')?.addEventListener('change', () => carregarAlunosTurmaModulo('segundaChamada'));
    safeGet('filtroBuscaManualSegundaChamada')?.addEventListener('input', () => filtrarAlunosManualModulo('segundaChamada'));
    safeGet('aba-segunda-chamada')?.addEventListener('shown.bs.tab', () => {
        carregarTurmasManualModulo('segundaChamada');
        carregarListaModulo('segundaChamada', 1);
        setTimeout(() => {
            if (estados.segundaChamada.modoAtual === 'automatico' && !estados.segundaChamada.scannerAtivo) {
                iniciarScannerModulo('segundaChamada');
            }
        }, 300);
    });
    
    // UNIFORME
    safeGet('modoAutomaticoUniformeBtn')?.addEventListener('click', () => setModoModulo('uniforme', 'automatico'));
    safeGet('modoManualUniformeBtn')?.addEventListener('click', () => setModoModulo('uniforme', 'manual'));
    safeGet('filtroTurmaManualUniforme')?.addEventListener('change', () => carregarAlunosTurmaModulo('uniforme'));
    safeGet('filtroBuscaManualUniforme')?.addEventListener('input', () => filtrarAlunosManualModulo('uniforme'));
    safeGet('aba-uniforme')?.addEventListener('shown.bs.tab', () => {
        carregarTurmasManualModulo('uniforme');
        carregarListaModulo('uniforme', 1);
        setTimeout(() => {
            if (estados.uniforme.modoAtual === 'automatico' && !estados.uniforme.scannerAtivo) {
                iniciarScannerModulo('uniforme');
            }
        }, 300);
    });
    
    // ============ CARREGAMENTO INICIAL GERAL ============
    // 🆕 TRAVA A DATA DO REGISTRO JÁ NO CARREGAMENTO INICIAL
    setTimeout(() => travarDataRegistroAutorizacao(), 800);
    
    // Carrega as listas e os filtros de todos os módulos logo que a página abre
    carregarListaModulo('autorizacao', 1);
    carregarListaModulo('justificativa', 1);
    carregarListaModulo('segundaChamada', 1);
    
    // 🆕 CARREGA OS FILTROS E A LISTA DE ATRASOS NA INICIALIZAÇÃO
    configurarFiltrosAtrasosRecentes();
    carregarAtrasosRecentes(1);
    
    // ============ EVENTOS DOS MÓDULOS ============
    ['autorizacao', 'justificativa', 'segundaChamada', 'uniforme'].forEach(modulo => {
        configurarEventosModulo(modulo);
    });
    
    console.log('✅ Gestão Geral inicializada com sucesso');
});

window.addEventListener('beforeunload', () => {
    pararScannerAutomatico();
    pararScannerModulo('autorizacao');
    pararScannerModulo('justificativa');
    pararScannerModulo('segundaChamada');
    pararScannerModulo('uniforme');
    ['atraso', 'autorizacao', 'justificativa', 'segundaChamada', 'uniforme'].forEach(modulo => {
        pararMonitoramentoSessao(modulo);
    });
    // 🆕 Para o monitoramento do aluno
    pararMonitoramentoSessaoAluno('atraso');
    window.removeEventListener('resize', handleResizeCanvasTela);
});

async function carregarFotoPerfil() {
    try {
        const response = await fetch('/api/perfil/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success && data.perfil?.fotoPerfil) {
            const avatar = safeGet('userAvatar');
            if (avatar) avatar.innerHTML = `<img src="${data.perfil.fotoPerfil}" alt="Foto">`;
        }
    } catch (error) {
        console.error('Erro ao carregar foto:', error);
    }
}
// ============================================================================
// ====================== ASSINATURA DIGITAL (CANVAS) =========================
// ============================================================================
function inicializarAssinatura(modulo) {
    const canvas = safeGet(`${modulo}AssinaturaCanvas`);
    if (!canvas) {
        console.warn(`⚠️ Canvas de assinatura não encontrado para ${modulo}`);
        return;
    }
    if (canvas.dataset.assinaturaInit === 'true') return;
    canvas.dataset.assinaturaInit = 'true';

    const state = assinaturaState[modulo];
    const container = canvas.parentElement;
    const placeholder = safeGet(`${modulo}AssinaturaPlaceholder`);

    function ajustarCanvas() {
        const rect = canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
            setTimeout(ajustarCanvas, 300);
            return;
        }
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
        const ctx = canvas.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#1e3c72';
        state.ctx = ctx;
        state.larguraBase = rect.width;
        state.alturaBase = rect.height;
    }
    ajustarCanvas();

    window.addEventListener('resize', () => {
        if (!state.temAssinatura) ajustarCanvas();
    });

    state.canvas = canvas;

    function getPos(e) {
        const rect = canvas.getBoundingClientRect();
        let clientX, clientY;
        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else if (e.changedTouches && e.changedTouches.length > 0) {
            clientX = e.changedTouches[0].clientX;
            clientY = e.changedTouches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }
        return { x: clientX - rect.left, y: clientY - rect.top };
    }

    function iniciar(e) {
        e.preventDefault();
        state.desenhando = true;
        const pos = getPos(e);
        state.lastX = pos.x;
        state.lastY = pos.y;
        state.temAssinatura = true;
        container.classList.add('ativa');
        if (placeholder) placeholder.classList.add('escondido');
    }

    function desenhar(e) {
        if (!state.desenhando) return;
        e.preventDefault();
        const pos = getPos(e);
        state.ctx.beginPath();
        state.ctx.moveTo(state.lastX, state.lastY);
        state.ctx.lineTo(pos.x, pos.y);
        state.ctx.stroke();
        state.lastX = pos.x;
        state.lastY = pos.y;
    }

    function parar(e) {
        if (e && e.preventDefault) e.preventDefault();
        state.desenhando = false;
        container.classList.remove('ativa');
        salvarAssinaturaBase64(modulo);
    }

    canvas.addEventListener('touchstart', iniciar, { passive: false });
    canvas.addEventListener('touchmove', desenhar, { passive: false });
    canvas.addEventListener('touchend', parar, { passive: false });
    canvas.addEventListener('touchcancel', parar, { passive: false });
    canvas.addEventListener('mousedown', iniciar);
    canvas.addEventListener('mousemove', desenhar);
    canvas.addEventListener('mouseup', parar);
    canvas.addEventListener('mouseleave', () => {
        if (state.desenhando) parar();
    });

    console.log(`✅ Assinatura inicializada para ${modulo}`);
}

function limparAssinatura(modulo) {
    const state = assinaturaState[modulo];
    if (!state || !state.canvas || !state.ctx) return;
    const rect = state.canvas.getBoundingClientRect();
    state.ctx.clearRect(0, 0, rect.width, rect.height);
    state.temAssinatura = false;
    const placeholder = safeGet(`${modulo}AssinaturaPlaceholder`);
    if (placeholder) placeholder.classList.remove('escondido');
    const hidden = safeGet(`${modulo}AssinaturaBase64`);
    if (hidden) hidden.value = '';
    console.log(`🧹 Assinatura ${modulo} limpa`);
}

function salvarAssinaturaBase64(modulo) {
    const state = assinaturaState[modulo];
    if (!state || !state.canvas || !state.temAssinatura) return;
    try {
        const dataURL = state.canvas.toDataURL('image/png');
        const hidden = safeGet(`${modulo}AssinaturaBase64`);
        if (hidden) hidden.value = dataURL;
        console.log(`💾 Assinatura ${modulo} salva (${Math.round(dataURL.length / 1024)} KB)`);
    } catch (e) {
        console.warn('Erro ao salvar assinatura:', e);
    }
}

function obterAssinaturaBase64(modulo) {
    const state = assinaturaState[modulo];
    if (!state || !state.temAssinatura) return '';
    try {
        return state.canvas.toDataURL('image/png');
    } catch (e) {
        return '';
    }
}

// ============================================================================
// =========================== MÓDULO ATRASOS =================================
// ============================================================================

async function iniciarScannerAutomatico() {
    const qrContainer = safeGet('qr-reader-auto');
    if (!qrContainer) return;
    if (scannerAutoAtivo) return;
    
    qrContainer.innerHTML = '<div id="qr-reader-auto-new" style="width: 100%;"></div>';
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        qrContainer.innerHTML = `
            <div class="alert alert-warning m-3" style="border-radius: 12px;">
                <i class="fas fa-video-slash" style="font-size: 32px; display: block; margin-bottom: 10px;"></i>
                <strong>Câmera não disponível</strong><br>
                Use o <strong>Modo Manual</strong> para continuar.
                <button class="btn btn-sm btn-primary mt-3" onclick="setModo('manual')" style="border-radius: 30px;">
                    <i class="fas fa-users"></i> Modo Manual
                </button>
            </div>`;
        return;
    }
    
    scannerAuto = new Html5Qrcode("qr-reader-auto-new");
    const config = { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 };
    
    try {
        await scannerAuto.start({ facingMode: "environment" }, config, onScanSuccessAuto, () => {});
        scannerAutoAtivo = true;
        console.log('✅ Scanner Atraso iniciado');
    } catch (err) {
        console.error('Erro ao iniciar scanner:', err);
        let msg = 'Não foi possível acessar a câmera.';
        if (err.message?.includes('NotFoundError')) msg = 'Nenhuma câmera encontrada.';
        else if (err.message?.includes('NotAllowedError')) msg = 'Permissão de câmera negada.';
        
        qrContainer.innerHTML = `
            <div class="alert alert-warning m-3" style="border-radius: 12px;">
                <i class="fas fa-video-slash" style="font-size: 32px; display: block; margin-bottom: 10px;"></i>
                <strong>Câmera indisponível</strong><br>
                <span style="font-size: 13px;">${msg}</span>
                <button class="btn btn-sm btn-primary mt-3" onclick="setModo('manual')" style="border-radius: 30px;">
                    <i class="fas fa-users"></i> Modo Manual
                </button>
            </div>`;
        scannerAutoAtivo = false;
    }
}

async function pararScannerAutomatico() {
    if (scannerAuto && scannerAutoAtivo) {
        try { await scannerAuto.stop(); } catch (e) {}
    }
    scannerAutoAtivo = false;
    scannerAuto = null;
}

async function onScanSuccessAuto(decodedText) {
    const alunoId = extrairAlunoId(decodedText);
    if (!alunoId) { notificar('QR Code inválido'); return; }
    await pararScannerAutomatico();
    await buscarAluno(alunoId);
}

function extrairAlunoId(decodedText) {
    if (!decodedText || typeof decodedText !== 'string') return null;
    if (decodedText.match(/^[a-f0-9]{24}$/i)) return decodedText;
    const matchAluno = decodedText.match(/[?&]aluno=([a-f0-9]{24})/i);
    if (matchAluno) return matchAluno[1];
    const matchId = decodedText.match(/[?&]id=([a-f0-9]{24})/i);
    if (matchId) return matchId[1];
    return null;
}

async function setModo(modo) {
    modoAtual = modo;
    safeGet('alunoInfo').style.display = 'none';
    safeGet('formRegistro').style.display = 'none';
    currentAluno = null;
    motivoSelecionado = null;
    
    if (modo === 'automatico') {
        safeGet('modoAutomaticoBtn').classList.add('active');
        safeGet('modoManualBtn').classList.remove('active');
        safeGet('modoAutomatico').style.display = 'block';
        safeGet('modoManual').style.display = 'none';
        await iniciarScannerAutomatico();
    } else {
        safeGet('modoManualBtn').classList.add('active');
        safeGet('modoAutomaticoBtn').classList.remove('active');
        safeGet('modoAutomatico').style.display = 'none';
        safeGet('modoManual').style.display = 'block';
        await pararScannerAutomatico();
        const turmaSelecionada = safeGet('filtroTurmaManual').value;
        if (turmaSelecionada) await carregarAlunosPorTurma();
        else safeGet('listaAlunosManual').innerHTML = '<div class="text-center py-3">Selecione uma turma para ver os alunos</div>';
    }
}

async function carregarTurmasParaManual() {
    try {
        const response = await fetch('/api/gestao-geral/atraso/turmas', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success && Array.isArray(data.turmas)) {
            turmasDisponiveis = data.turmas;
            const select = safeGet('filtroTurmaManual');
            if (select) {
                select.innerHTML = '<option value="">Selecione uma turma...</option>';
                data.turmas.forEach(turma => {
                    select.innerHTML += `<option value="${escapeHTML(turma)}">${escapeHTML(turma)}</option>`;
                });
            }
        }
    } catch (error) { console.error('Erro:', error); }
}

async function carregarAlunosPorTurma() {
    const turma = safeGet('filtroTurmaManual')?.value;
    if (!turma) {
        safeGet('listaAlunosManual').innerHTML = '<div class="text-center py-3">Selecione uma turma</div>';
        return;
    }
    safeGet('listaAlunosManual').innerHTML = '<div class="text-center py-3"><div class="loading-spinner"></div><p>Carregando...</p></div>';
    
    try {
        const response = await fetch(`/api/gestao-geral/atraso/alunos-por-turma?turma=${encodeURIComponent(turma)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success && Array.isArray(data.alunos)) {
            alunosPorTurma = data.alunos;
            filtrarAlunosManual();
        } else {
            safeGet('listaAlunosManual').innerHTML = '<div class="alert alert-warning">Nenhum aluno encontrado</div>';
        }
    } catch (error) { console.error('Erro:', error); }
}

function filtrarAlunosManual() {
    if (!Array.isArray(alunosPorTurma)) return;
    const busca = (safeGet('filtroBuscaManual')?.value || '').toLowerCase();
    let filtrados = alunosPorTurma;
    if (busca) filtrados = filtrados.filter(a => (a.nome || '').toLowerCase().includes(busca));
    filtrados.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    
    const container = safeGet('listaAlunosManual');
    if (filtrados.length === 0) {
        container.innerHTML = '<div class="text-center text-muted py-3">Nenhum aluno encontrado</div>';
        return;
    }
    
    let html = '<div class="list-group">';
    filtrados.forEach(aluno => {
        html += `
            <div class="list-group-item list-group-item-action d-flex justify-content-between align-items-center" 
                 data-aluno-id="${aluno.id}" data-aluno-nome="${escapeHTML(aluno.nome)}" style="cursor: pointer;">
                <div>
                    <strong>${escapeHTML(aluno.nome)}</strong><br>
                    <small class="text-muted">${escapeHTML(aluno.matricula || 'Sem matrícula')} • ${escapeHTML(aluno.curso || '')}</small>
                </div>
                <i class="fas fa-hand-pointer fa-2x text-primary"></i>
            </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
    
    container.querySelectorAll('.list-group-item').forEach(item => {
        item.addEventListener('click', () => {
            const id = item.getAttribute('data-aluno-id');
            const nome = item.getAttribute('data-aluno-nome');
            selecionarAluno(id, nome, item);
        });
    });
}

async function selecionarAluno(alunoId, alunoNome, itemEl) {
    if (itemEl) {
        itemEl.style.background = '#dbeafe';
        itemEl.style.borderColor = '#1e3c72';
        itemEl.style.pointerEvents = 'none';
        itemEl.innerHTML = `
            <div><strong>${escapeHTML(alunoNome)}</strong><br><small style="color: #1e3c72;">Processando...</small></div>
            <i class="fas fa-spinner fa-spin fa-2x" style="color: #1e3c72;"></i>`;
    }
    try { await buscarAluno(alunoId); } catch (error) { console.error('Erro:', error); }
}

async function buscarAluno(alunoId) {
    try {
        await pararScannerAutomatico();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch(`/api/gestao-geral/atraso/aluno/${alunoId}`, {
            headers: { 'Authorization': `Bearer ${token}` },
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        
        if (data.success && data.aluno) {
            currentAluno = data.aluno;
            exibirAluno(data);
            mostrarFormRegistro();
        } else {
            notificar(data.error || 'Aluno não encontrado');
            if (modoAtual === 'automatico') reiniciarScannerAutomatico();
            else carregarAlunosPorTurma();
        }
    } catch (error) {
        console.error('Erro:', error);
        if (error.name === 'AbortError') notificar('Tempo esgotado. Tente novamente.');
        else notificar('Erro ao buscar aluno');
        if (modoAtual === 'automatico') reiniciarScannerAutomatico();
        else carregarAlunosPorTurma();
    }
}

function exibirAluno(data) {
    if (!data || !data.aluno) return;
    const aluno = data.aluno;
    
    const fotoEl = safeGet('alunoFoto');
    if (fotoEl) {
        fotoEl.onerror = null;
        fotoEl.src = aluno.fotoPerfil || gerarAvatarSVG(aluno.nome);
        fotoEl.onerror = function() { this.onerror = null; this.src = gerarAvatarSVG(aluno.nome); };
    }
    
    safeSetText('alunoNome', aluno.nome || '-');
    safeSetText('alunoMatricula', aluno.matricula || 'Não informada');
    safeSetText('alunoTurma', aluno.turma || 'Não informada');
    safeSetText('alunoCurso', aluno.curso || 'Não informado');
    
    const statusDiv = safeGet('statusAluno');
    if (statusDiv && data.estatisticas) {
        statusDiv.innerHTML = `
            <div class="alert alert-info">
                <i class="fas fa-info-circle"></i> 
                <strong>Total de atrasos:</strong> ${data.estatisticas.totalAtrasos} | 
                <strong>Últimos 30 dias:</strong> ${data.estatisticas.atrasosUltimos30}
            </div>`;
    }
    
    const histDiv = safeGet('historicoRecente');
    if (histDiv) {
        // Pega o histórico (seja do campo historicoRecente ou ultimasAutorizacoes)
        let historico = data.historicoRecente || [];
        if (historico.length === 0 && data.ultimasAutorizacoes) {
            historico = data.ultimasAutorizacoes.map(h => ({
                id: h.id,
                motivoLabel: h.motivoLabel,
                descricao: h.observacoes || 'Sem descrição',
                dataHora: h.data
            }));
        }
        
        if (historico.length > 0) {
            histDiv.innerHTML = `
                <h6 class="text-muted mt-3 mb-2"><i class="fas fa-history"></i> Últimos Registros</h6>
                ${historico.map(h => `
                    <div class="p-2 mb-2" style="background: #f8fafc; border-radius: 8px; font-size: 13px; border-left: 3px solid #1e3c72;">
                        <strong>${escapeHTML(h.motivoLabel || 'Atraso')}</strong>
                        <br><small class="text-muted">
                            <i class="far fa-clock"></i> 
                            ${h.dataHora ? new Date(h.dataHora).toLocaleString('pt-BR') : (h.data ? new Date(h.data).toLocaleDateString('pt-BR') : '')}
                        </small>
                        ${h.descricao ? `<br><span style="font-size: 12px; color: #475569;">${escapeHTML(h.descricao)}</span>` : ''}
                    </div>`).join('')}`;
        } else {
            histDiv.innerHTML = `<p class="text-muted small">Nenhum registro recente.</p>`;
        }
    }
    
    safeGet('alunoInfo').style.display = 'block';
    safeGet('alunoInfo').scrollIntoView({ behavior: 'smooth' });
}

function mostrarFormRegistro() {
    safeGet('formRegistro').style.display = 'block';
    safeGet('motivoSelecionado').value = '';
    motivoSelecionado = null;
    document.querySelectorAll('#formRegistro .tipo-card').forEach(c => c.classList.remove('selected'));
    safeGet('descricao').value = '';
    safeGet('observacoes').value = '';
    safeGet('horarioPrevisto').value = '';
    safeGet('horarioChegada').value = '';
    safeGet('motivoOutrosTexto').value = '';
    safeGet('campoOutros').style.display = 'none';
    
    // Limpa assinatura do RESPONSÁVEL
    limparEstadoSessaoAssinatura('atraso');
    const checkAssinatura = safeGet('atrasoNecessitaAssinatura');
    if (checkAssinatura) checkAssinatura.checked = false;
    const blocoInfo = safeGet('atrasoBlocoAssinaturaInfo');
    if (blocoInfo) { blocoInfo.style.display = 'none'; blocoInfo.innerHTML = ''; }
    
    // 🆕 Limpa assinatura do ALUNO
    limparEstadoSessaoAssinaturaAluno('atraso');
    const checkAssinaturaAluno = safeGet('atrasoNecessitaAssinaturaAluno');
    if (checkAssinaturaAluno) checkAssinaturaAluno.checked = false;
    const blocoInfoAluno = safeGet('atrasoBlocoAssinaturaAlunoInfo');
    if (blocoInfoAluno) { blocoInfoAluno.style.display = 'none'; blocoInfoAluno.innerHTML = ''; }
    
    const hoje = getDataLocalISO();
    const dataEl = safeGet('atrasoData');
    if (dataEl) dataEl.value = hoje;
    
    const agora = new Date();
    const horaAtual = String(agora.getHours()).padStart(2, '0') + ':' + 
                      String(agora.getMinutes()).padStart(2, '0');
    const horaEl = safeGet('atrasoHoraChegada');
    if (horaEl) horaEl.value = horaAtual;
    
    setTimeout(() => {
        dataEl?.focus();
    }, 100);
}

function selecionarMotivo(motivo) {
    if (!motivo) return;
    motivoSelecionado = motivo;
    safeGet('motivoSelecionado').value = motivo;
    document.querySelectorAll('#formRegistro .tipo-card').forEach(c => c.classList.remove('selected'));
    const card = document.querySelector(`#formRegistro .tipo-card[data-tipo="${motivo}"]`);
    if (card) card.classList.add('selected');
    safeGet('campoOutros').style.display = motivo === 'outros' ? 'block' : 'none';
}

async function registrarAtraso() {
    if (!motivoSelecionado) { 
        notificar('Selecione o motivo do atraso', 'error');
        return; 
    }
    
    const dataAtraso = safeGet('atrasoData')?.value;
    if (!dataAtraso) { 
        notificar('Selecione a data do atraso', 'error');
        return; 
    }
    
    const hoje = new Date();
    hoje.setHours(23, 59, 59, 999);
    const dataSelecionada = new Date(dataAtraso + 'T00:00:00');
    if (dataSelecionada > hoje) {
        const confirmar = await confirm('⚠️ A data selecionada é no futuro. Deseja continuar mesmo assim?');
        if (!confirmar) return;
    }
    
    const descricao = (safeGet('descricao')?.value || '').trim();
    if (!descricao) { 
        notificar('Descreva o ocorrido', 'error');
        return; 
    }
    if (!currentAluno || !currentAluno.id) { 
        notificar('Nenhum aluno selecionado', 'error');
        return; 
    }
    if (motivoSelecionado === 'outros') {
        const motivoOutros = (safeGet('motivoOutrosTexto')?.value || '').trim();
        if (!motivoOutros) { 
            notificar('Especifique o motivo', 'error');
            return; 
        }
    }
    
    // 🔹 Assinatura do RESPONSÁVEL
    const precisaAssinatura = safeGet('atrasoNecessitaAssinatura')?.checked || false;
    const assinaturaBase64 = estadoSessaoAssinatura.atraso?.assinaturaCapturada || '';
    const sessaoAssinaturaId = estadoSessaoAssinatura.atraso?.sessaoId || null;
    
    if (precisaAssinatura && !assinaturaBase64) {
        notificar('⚠️ Aguardando assinatura do responsável!', 'warning', 5000);
        reabrirModalAssinatura('atraso');
        return;
    }
    
    // 🆕 Assinatura do ALUNO
    const precisaAssinaturaAluno = safeGet('atrasoNecessitaAssinaturaAluno')?.checked || false;
    const assinaturaAlunoBase64 = estadoSessaoAssinaturaAluno.atraso?.assinaturaCapturada || '';
    const sessaoAssinaturaAlunoId = estadoSessaoAssinaturaAluno.atraso?.sessaoId || null;
    
    if (precisaAssinaturaAluno && !assinaturaAlunoBase64) {
        notificar('⚠️ Aguardando assinatura do aluno!', 'warning', 5000);
        reabrirModalAssinaturaAluno('atraso');
        return;
    }
    
    const btn = document.querySelector('#formRegistro .btn-primary-custom');
    if (btn) btn.disabled = true;
    
    try {
        const horaChegada = safeGet('atrasoHoraChegada')?.value || '';
        let dataHoraCompleta;
        
        if (horaChegada) {
            dataHoraCompleta = new Date(dataAtraso + 'T' + horaChegada + ':00');
        } else {
            dataHoraCompleta = new Date(dataAtraso + 'T12:00:00');
        }
        
        const response = await fetch('/api/gestao-geral/atraso/registrar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
                alunoId: currentAluno.id,
                motivo: motivoSelecionado,
                descricao,
                observacoes: safeGet('observacoes')?.value || '',
                dataHora: dataHoraCompleta.toISOString(),
                detalhes: {
                    motivoOutros: safeGet('motivoOutrosTexto')?.value || '',
                    horarioPrevisto: safeGet('horarioPrevisto')?.value || '',
                    horarioChegada: safeGet('horarioChegada')?.value || ''
                },
                // Responsável
                precisaAssinatura: precisaAssinatura,
                assinaturaBase64: assinaturaBase64,
                sessaoAssinaturaId: sessaoAssinaturaId,
                // 🆕 Aluno
                precisaAssinaturaAluno: precisaAssinaturaAluno,
                assinaturaAlunoBase64: assinaturaAlunoBase64,
                sessaoAssinaturaAlunoId: sessaoAssinaturaAlunoId
            })
        });
        const data = await response.json();
        if (data.success) {
            // Limpa sessão do responsável
            const sessaoId = estadoSessaoAssinatura.atraso?.sessaoId;
            if (sessaoId) {
                fetch(`/api/gestao-geral/sessoes-assinatura/${sessaoId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                }).catch(e => console.warn(e));
            }
            pararMonitoramentoSessao('atraso');
            fecharModalAssinatura('atraso');
            limparEstadoSessaoAssinatura('atraso');
            
            // 🆕 Limpa sessão do aluno
            const sessaoAlunoId = estadoSessaoAssinaturaAluno.atraso?.sessaoId;
            if (sessaoAlunoId) {
                fetch(`/api/gestao-geral/sessoes-assinatura/${sessaoAlunoId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                }).catch(e => console.warn(e));
            }
            pararMonitoramentoSessaoAluno('atraso');
            fecharModalAssinaturaAluno('atraso');
            limparEstadoSessaoAssinaturaAluno('atraso');
            
            notificar(`✅ ${data.message}`, 'success');
            limparTela();
            if (modoAtual === 'automatico') reiniciarScannerAutomatico();
            else carregarAlunosPorTurma();
        } else {
            notificar('❌ ' + (data.error || 'Erro'), 'error');
        }
    } catch (error) {
        console.error('Erro:', error);
        notificar('Erro ao registrar', 'error');
    } finally { 
        if (btn) btn.disabled = false; 
    }
}

function limparTela() {
    safeGet('alunoInfo').style.display = 'none';
    safeGet('formRegistro').style.display = 'none';
    currentAluno = null;
    motivoSelecionado = null;
    
    // Limpa sessão do RESPONSÁVEL
    const sessaoId = estadoSessaoAssinatura.atraso?.sessaoId;
    if (sessaoId) {
        fetch(`/api/gestao-geral/sessoes-assinatura/${sessaoId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        }).catch(e => console.warn(e));
    }
    pararMonitoramentoSessao('atraso');
    fecharModalAssinatura('atraso');
    limparEstadoSessaoAssinatura('atraso');
    
    const checkAssinatura = safeGet('atrasoNecessitaAssinatura');
    if (checkAssinatura) checkAssinatura.checked = false;
    const blocoInfo = safeGet('atrasoBlocoAssinaturaInfo');
    if (blocoInfo) { blocoInfo.style.display = 'none'; blocoInfo.innerHTML = ''; }
    
    // 🆕 Limpa sessão do ALUNO
    const sessaoAlunoId = estadoSessaoAssinaturaAluno.atraso?.sessaoId;
    if (sessaoAlunoId) {
        fetch(`/api/gestao-geral/sessoes-assinatura/${sessaoAlunoId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        }).catch(e => console.warn(e));
    }
    pararMonitoramentoSessaoAluno('atraso');
    fecharModalAssinaturaAluno('atraso');
    limparEstadoSessaoAssinaturaAluno('atraso');
    
    const checkAssinaturaAluno = safeGet('atrasoNecessitaAssinaturaAluno');
    if (checkAssinaturaAluno) checkAssinaturaAluno.checked = false;
    const blocoInfoAluno = safeGet('atrasoBlocoAssinaturaAlunoInfo');
    if (blocoInfoAluno) { blocoInfoAluno.style.display = 'none'; blocoInfoAluno.innerHTML = ''; }
}

function reiniciarScannerAutomatico() {
    setTimeout(() => {
        if (!scannerAutoAtivo && modoAtual === 'automatico') iniciarScannerAutomatico();
    }, 1000);
}

async function carregarDashboardAtrasos() {
    try {
        const response = await fetch('/api/gestao-geral/atraso/dashboard', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!data.success) return;
        
        safeSetText('totalHoje', data.metricas?.hoje || 0);
        safeSetText('totalSemana', data.metricas?.semana || 0);
        safeSetText('totalMes', data.metricas?.mes || 0);
        safeSetText('totalGeral', data.metricas?.total || 0);
        
        const ctxMotivos = safeGet('chartMotivos');
        if (ctxMotivos && data.porMotivo) {
            if (dashboardCharts.motivos) try { dashboardCharts.motivos.destroy(); } catch(e){}
            dashboardCharts.motivos = new Chart(ctxMotivos.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: data.porMotivo.map(m => m.label),
                    datasets: [{ data: data.porMotivo.map(m => m.count),
                        backgroundColor: ['#1e3c72', '#2a5298', '#3b82f6', '#60a5fa', '#93c5fd'] }]
                },
                options: { responsive: true, maintainAspectRatio: true }
            });
        }
        
        const ctxAtrasos = safeGet('chartAtrasos');
        if (ctxAtrasos && data.tendencias?.ultimos7Dias) {
            if (dashboardCharts.atrasos) try { dashboardCharts.atrasos.destroy(); } catch(e){}
            dashboardCharts.atrasos = new Chart(ctxAtrasos.getContext('2d'), {
                type: 'line',
                data: {
                    labels: data.tendencias.ultimos7Dias.map(d => d.dia),
                    datasets: [{ label: 'Atrasos', data: data.tendencias.ultimos7Dias.map(d => d.atrasos),
                        borderColor: '#1e3c72', backgroundColor: 'rgba(30, 60, 114, 0.1)', fill: true, tension: 0.4 }]
                },
                options: { responsive: true, maintainAspectRatio: true }
            });
        }
        
        const ctxTurmas = safeGet('chartTurmas');
        if (ctxTurmas && data.tendencias?.porTurma) {
            if (dashboardCharts.turmas) try { dashboardCharts.turmas.destroy(); } catch(e){}
            dashboardCharts.turmas = new Chart(ctxTurmas.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: data.tendencias.porTurma.map(t => t.turma),
                    datasets: [{ label: 'Atrasos', data: data.tendencias.porTurma.map(t => t.count),
                        backgroundColor: '#2a5298', borderRadius: 8 }]
                },
                options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } } }
            });
        }
        
        const reinc = safeGet('alunosReincidentes');
        if (reinc) {
            const lista = data.tendencias?.alunosReincidentes || [];
            if (lista.length > 0) {
                reinc.innerHTML = `
                    <div class="table-responsive">
                        <table class="table table-sm">
                            <thead><tr><th>Aluno</th><th>Turma</th><th>Atrasos</th></tr></thead>
                            <tbody>${lista.map(a => `
                                <tr>
                                    <td><strong>${escapeHTML(a.alunoNome || '')}</strong></td>
                                    <td>${escapeHTML(a.alunoTurma || '-')}</td>
                                    <td><span class="badge bg-danger">${a.count || 0}</span></td>
                                </tr>`).join('')}
                            </tbody>
                        </table>
                    </div>`;
            } else {
                reinc.innerHTML = `<p class="text-muted text-center py-3"><i class="fas fa-check-circle text-success"></i> Nenhum aluno reincidente</p>`;
            }
        }
    } catch (error) { console.error('Erro no dashboard:', error); }
}

// ============================================
// 📋 ATRASOS RECENTES (DASHBOARD) - COM PAGINAÇÃO
// ============================================
let __atrasosRecentes = [];

async function carregarAtrasosRecentes(pagina = null) {
    const container = safeGet('listaAtrasosRecentes');
    if (!container) return;

    if (pagina === null) pagina = paginacaoAtrasosState.paginaAtual;
    paginacaoAtrasosState.paginaAtual = pagina;

    const busca = (safeGet('filtroAtrasosRecentesBusca')?.value || '').trim();
    const turma = safeGet('filtroAtrasosRecentesTurma')?.value || '';
    const motivo = safeGet('filtroAtrasosRecentesMotivo')?.value || '';
    const dataInicio = safeGet('filtroAtrasosRecentesDataInicio')?.value || '';
    const dataFim = safeGet('filtroAtrasosRecentesDataFim')?.value || '';

    const limit = paginacaoAtrasosState.porPagina;

    // Mostra o loading
    container.innerHTML = `
        <div class="text-center py-4">
            <div class="spinner-border spinner-border-sm text-primary" role="status"></div>
            <p class="text-muted mt-2 mb-0">Carregando atrasos...</p>
        </div>`;

    try {
        const params = new URLSearchParams();
        params.append('limit', limit);
        params.append('page', pagina);
        
        if (turma) params.append('turma', turma);
        if (busca) params.append('alunoNome', busca);
        if (motivo) params.append('motivo', motivo);
        if (dataInicio) params.append('dataInicio', dataInicio);
        if (dataFim) params.append('dataFim', dataFim);

        const response = await fetch(`/api/gestao-geral/atraso/listar?${params.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (!data.success || !Array.isArray(data.atrasos) || data.atrasos.length === 0) {
            container.innerHTML = `
                <div class="text-center py-4 text-muted">
                    <i class="fas fa-inbox fa-3x mb-3" style="color:#cbd5e1;"></i>
                    <p>Nenhum atraso registrado.</p>
                </div>`;
            paginacaoAtrasosState.totalRegistros = 0;
            paginacaoAtrasosState.totalPaginas = 0;
            return;
        }

        paginacaoAtrasosState.totalRegistros = data.total || 0;
        paginacaoAtrasosState.totalPaginas = data.totalPages || 1;

        __atrasosRecentes = data.atrasos;
        atualizarContadorAtrasosRecentes(data.total || 0);
        renderizarListaAtrasosRecentes(data.atrasos);

    } catch (error) {
        console.error('Erro ao carregar atrasos:', error);
        container.innerHTML = `
            <div class="alert alert-danger text-center">
                <i class="fas fa-exclamation-triangle"></i> 
                Erro ao carregar a lista de atrasos.
            </div>`;
    }
}

function atualizarContadorAtrasosRecentes(total) {
    const el = safeGet('contadorAtrasosRecentes');
    if (el) el.textContent = total;
}

function renderizarListaAtrasosRecentes(lista) {
    const container = safeGet('listaAtrasosRecentes');
    if (!container) return;
    
    if (lista.length === 0) {
        container.innerHTML = `
            <div class="text-center py-4 text-muted">
                <i class="fas fa-inbox fa-3x mb-3" style="color:#cbd5e1;"></i>
                <p>Nenhum atraso corresponde aos filtros</p>
            </div>`;
        return;
    }
    
    const corMotivo = {
        'onibus': '#1e3c72',
        'transito': '#0284c7',
        'problemas_pessoais': '#f59e0b',
        'fardamento': '#8b5cf6',
        'outros': '#6b7280'
    };
    
    const thStyle = 'padding: 12px; text-align: left; border-bottom: 2px solid #dee2e6; font-weight: 600; color: #495057; white-space: nowrap;';
    const tdStyle = 'padding: 12px; vertical-align: middle; border-bottom: 1px solid #dee2e6; white-space: nowrap;';

    container.innerHTML = `
        <div class="table-responsive" style="overflow-x: auto; width: 100%;">
            <table class="table table-hover" style="width: 100%; border-collapse: collapse; margin-bottom: 0;">
                <thead style="background-color: #f8f9fa;">
                    <tr>
                        <th style="${thStyle}">Data/Hora</th>
                        <th style="${thStyle}">Aluno</th>
                        <th style="${thStyle}">Turma</th>
                        <th style="${thStyle}">Motivo</th>
                        <th style="${thStyle}">Responsável</th>
                        <th style="${thStyle}">Assinatura</th>
                        <th style="${thStyle} text-align: center;">Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${lista.map(a => {
                        const cor = corMotivo[a.motivo] || '#6b7280';
                        return `
                            <tr>
                                <td style="${tdStyle}">${a.dataHoraFormatada || new Date(a.dataHora).toLocaleString('pt-BR')}</td>
                                <td style="${tdStyle}">
                                    <strong>${escapeHTML(a.alunoNome || '')}</strong><br>
                                    <small class="text-muted">${escapeHTML(a.alunoMatricula || '')}</small>
                                </td>
                                <td style="${tdStyle}">${escapeHTML(a.alunoTurma || '-')}</td>
                                <td style="${tdStyle}">
                                    <span class="badge" style="background: ${cor}; font-size: 11px;">
                                        ${escapeHTML(a.motivoLabel || a.motivo || '-')}
                                    </span>
                                </td>
                                <td style="${tdStyle}">
                                    ${a.responsavelNome ? `
                                        <div style="font-size:12px; line-height: 1.3;">
                                            <strong>${escapeHTML(a.responsavelNome)}</strong>
                                            ${a.responsavelCPF ? `<br><small style="color: #6c757d;">CPF: ${escapeHTML(a.responsavelCPF)}</small>` : ''}
                                        </div>` : '<span style="color: #6c757d;">-</span>'}
                                </td>
                                <td style="${tdStyle}">
                                    ${a.temAssinatura 
                                        ? '<span class="badge bg-success"><i class="fas fa-signature"></i> Assinado</span>' 
                                        : '<span class="badge bg-secondary">Sem</span>'}
                                </td>
                                <td style="${tdStyle} text-align: center;">
                                    <div style="display: flex; gap: 4px; justify-content: center;">
                                        <button class="btn btn-sm btn-info" onclick="verAtraso('${a.id}')" title="Ver detalhes" style="padding: 4px 8px;">
                                            <i class="fas fa-eye"></i>
                                        </button>
                                        <button class="btn btn-sm btn-primary" onclick="imprimirAtraso('${a.id}')" title="Imprimir" style="padding: 4px 8px;">
                                            <i class="fas fa-print"></i>
                                        </button>
                                        <button class="btn btn-sm btn-warning" onclick="editarAtraso('${a.id}')" title="Editar" style="padding: 4px 8px;">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        <button class="btn btn-sm btn-danger" onclick="excluirAtraso('${a.id}', '${escapeHTML(a.alunoNome || '')}')" title="Excluir" style="padding: 4px 8px;">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
        ${renderizarPaginacaoAtrasos()}
    `;
}

// 🆕 Renderiza paginação dos atrasos
function renderizarPaginacaoAtrasos() {
    const { paginaAtual, totalPaginas, totalRegistros, porPagina } = paginacaoAtrasosState;

    if (totalPaginas <= 1) {
        return `<p class="text-muted text-end mt-2"><small>${totalRegistros} registro(s) encontrado(s)</small></p>`;
    }

    const maxBotoes = 5;
    let inicio = Math.max(1, paginaAtual - Math.floor(maxBotoes / 2));
    let fim = Math.min(totalPaginas, inicio + maxBotoes - 1);

    if (fim - inicio + 1 < maxBotoes) {
        inicio = Math.max(1, fim - maxBotoes + 1);
    }

    let botoes = '';

    botoes += paginaAtual > 1
        ? `<li class="page-item"><a class="page-link" href="#" onclick="event.preventDefault(); carregarAtrasosRecentes(1)" title="Primeira"><i class="fas fa-angle-double-left"></i></a></li>`
        : `<li class="page-item disabled"><span class="page-link"><i class="fas fa-angle-double-left"></i></span></li>`;

    botoes += paginaAtual > 1
        ? `<li class="page-item"><a class="page-link" href="#" onclick="event.preventDefault(); carregarAtrasosRecentes(${paginaAtual - 1})" title="Anterior"><i class="fas fa-angle-left"></i></a></li>`
        : `<li class="page-item disabled"><span class="page-link"><i class="fas fa-angle-left"></i></span></li>`;

    if (inicio > 1) {
        botoes += `<li class="page-item disabled"><span class="page-link">…</span></li>`;
    }

    for (let i = inicio; i <= fim; i++) {
        botoes += i === paginaAtual
            ? `<li class="page-item active"><span class="page-link">${i}</span></li>`
            : `<li class="page-item"><a class="page-link" href="#" onclick="event.preventDefault(); carregarAtrasosRecentes(${i})">${i}</a></li>`;
    }

    if (fim < totalPaginas) {
        botoes += `<li class="page-item disabled"><span class="page-link">…</span></li>`;
    }

    botoes += paginaAtual < totalPaginas
        ? `<li class="page-item"><a class="page-link" href="#" onclick="event.preventDefault(); carregarAtrasosRecentes(${paginaAtual + 1})" title="Próxima"><i class="fas fa-angle-right"></i></a></li>`
        : `<li class="page-item disabled"><span class="page-link"><i class="fas fa-angle-right"></i></span></li>`;

    botoes += paginaAtual < totalPaginas
        ? `<li class="page-item"><a class="page-link" href="#" onclick="event.preventDefault(); carregarAtrasosRecentes(${totalPaginas})" title="Última"><i class="fas fa-angle-double-right"></i></a></li>`
        : `<li class="page-item disabled"><span class="page-link"><i class="fas fa-angle-double-right"></i></span></li>`;

    const de = (paginaAtual - 1) * porPagina + 1;
    const ate = Math.min(paginaAtual * porPagina, totalRegistros);

    return `
        <div class="paginacao-modulo" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-top: 16px; padding-top: 12px; border-top: 1px solid #e5e7eb;">
            <small class="text-muted">
                Mostrando <strong>${de}</strong>–<strong>${ate}</strong> de <strong>${totalRegistros}</strong> registros
            </small>
            <nav aria-label="Paginação">
                <ul class="pagination pagination-sm mb-0" style="gap: 2px;">
                    ${botoes}
                </ul>
            </nav>
        </div>
    `;
}

// ============================================
// 👁️ VER ATRASO (COM ASSINATURAS)
// ============================================
async function verAtraso(atrasoId) {
    if (!atrasoId) return;
    
    try {
        const response = await fetch(`/api/gestao-geral/atraso/${atrasoId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (!data.success || !data.atraso) {
            notificar('Erro ao carregar atraso');
            return;
        }
        
        const a = data.atraso;
        const oldModal = safeGet('modalVerAtraso');
        if (oldModal) oldModal.remove();
        
        let assinaturasHTML = '';

        // Bloco da Assinatura do Responsável
        if (a.temAssinatura && a.assinaturaBase64) {
            assinaturasHTML += `
                <div class="mb-3">
                    <strong><i class="fas fa-signature"></i> Assinatura do Responsável:</strong>
                    <div style="background: #f0fdf4; border: 2px solid #10b981; border-radius: 10px; padding: 10px; margin-top: 6px;">
                        <img src="${a.assinaturaBase64}" style="max-width: 100%; max-height: 120px;" alt="Assinatura do Responsável">
                        ${a.assinadaPorNome ? `<p style="margin: 6px 0 0; font-size: 12px; color: #065f46;">Assinado por: <strong>${escapeHTML(a.assinadaPorNome)}</strong></p>` : ''}
                        ${a.assinadaEm ? `<p style="margin: 2px 0 0; font-size: 11px; color: #065f46;">Em: ${new Date(a.assinadaEm).toLocaleString('pt-BR')}</p>` : ''}
                    </div>
                </div>`;
        } else if (a.precisaAssinatura) {
            assinaturasHTML += `
                <div class="mb-3">
                    <strong><i class="fas fa-signature"></i> Assinatura do Responsável:</strong>
                    <div style="background: #fef3c7; border: 2px dashed #f59e0b; border-radius: 10px; padding: 10px; margin-top: 6px; color: #92400e;">
                        <i class="fas fa-clock"></i> Aguardando assinatura...
                    </div>
                </div>`;
        }

        // Bloco da Assinatura do Aluno
        if (a.temAssinaturaAluno && a.assinaturaAlunoBase64) {
            assinaturasHTML += `
                <div class="mb-3">
                    <strong><i class="fas fa-user-graduate"></i> Assinatura do Aluno:</strong>
                    <div style="background: #f0fdf4; border: 2px solid #10b981; border-radius: 10px; padding: 10px; margin-top: 6px;">
                        <img src="${a.assinaturaAlunoBase64}" style="max-width: 100%; max-height: 120px;" alt="Assinatura do Aluno">
                        ${a.assinadaPorNomeAluno ? `<p style="margin: 6px 0 0; font-size: 12px; color: #065f46;">Assinado por: <strong>${escapeHTML(a.assinadaPorNomeAluno)}</strong></p>` : ''}
                        ${a.assinadaEmAluno ? `<p style="margin: 2px 0 0; font-size: 11px; color: #065f46;">Em: ${new Date(a.assinadaEmAluno).toLocaleString('pt-BR')}</p>` : ''}
                    </div>
                </div>`;
        } else if (a.precisaAssinaturaAluno) {
            assinaturasHTML += `
                <div class="mb-3">
                    <strong><i class="fas fa-user-graduate"></i> Assinatura do Aluno:</strong>
                    <div style="background: #fef3c7; border: 2px dashed #f59e0b; border-radius: 10px; padding: 10px; margin-top: 6px; color: #92400e;">
                        <i class="fas fa-clock"></i> Aguardando assinatura...
                    </div>
                </div>`;
        }
        
        const modalHtml = `
            <div class="modal fade" id="modalVerAtraso" tabindex="-1">
                <div class="modal-dialog modal-lg modal-dialog-scrollable">
                    <div class="modal-content">
                        <div class="modal-header" style="background: linear-gradient(135deg, #1e3c72, #2a5298); color: white;">
                            <h5 class="modal-title">
                                <i class="fas fa-eye"></i> Detalhes do Atraso
                            </h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div style="display: flex; align-items: center; gap: 12px; padding: 12px; background: #eef2ff; border-radius: 10px; margin-bottom: 16px;">
                                <img src="${gerarAvatarSVG(a.alunoNome)}" 
                                     style="width: 50px; height: 50px; border-radius: 50%;" alt="">
                                <div style="flex: 1;">
                                    <h5 style="margin: 0; color: #1e3c72;">${escapeHTML(a.alunoNome)}</h5>
                                    <small style="color: #6b7280;">
                                        <i class="fas fa-id-card"></i> ${escapeHTML(a.alunoMatricula || '-')} • 
                                        <i class="fas fa-graduation-cap"></i> ${escapeHTML(a.alunoTurma || '-')}
                                    </small>
                                </div>
                                <span class="badge" style="background: #1e3c72; font-size: 12px;">
                                    ${escapeHTML(a.motivoLabel || a.motivo)}
                                </span>
                            </div>
                            
                            <div class="mb-3">
                                <strong><i class="fas fa-clock"></i> Data/Hora:</strong>
                                <p class="mb-0">${a.dataHoraFormatada || new Date(a.dataHora).toLocaleString('pt-BR')}</p>
                            </div>
                            
                            <div class="mb-3">
                                <strong><i class="fas fa-align-left"></i> Descrição:</strong>
                                <p class="mb-0" style="background: #f9fafb; padding: 10px; border-radius: 8px;">
                                    ${escapeHTML(a.descricao || '-')}
                                </p>
                            </div>
                            
                            ${a.observacoes ? `
                                <div class="mb-3">
                                    <strong><i class="fas fa-comment"></i> Observações:</strong>
                                    <p class="mb-0" style="background: #f9fafb; padding: 10px; border-radius: 8px;">
                                        ${escapeHTML(a.observacoes)}
                                    </p>
                                </div>
                            ` : ''}
                            
                            ${assinaturasHTML}
                            
                            <div class="mb-3">
                                <strong><i class="fas fa-user-tie"></i> Registrado por:</strong>
                                <p class="mb-0">${escapeHTML(a.registradoPor || '-')}</p>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                                <i class="fas fa-times"></i> Fechar
                            </button>
                            <button type="button" class="btn btn-success" onclick="imprimirAtraso('${a.id}')">
                                <i class="fas fa-print"></i> Imprimir
                            </button>
                        </div>
                    </div>
                </div>
            </div>`;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        new bootstrap.Modal(safeGet('modalVerAtraso')).show();
    } catch (error) {
        console.error('Erro:', error);
        notificar('Erro ao carregar detalhes');
    }
}

// ============================================
// ✏️ EDITAR ATRASO
// ============================================
async function editarAtraso(atrasoId) {
    if (!atrasoId) return;
    
    try {
        const response = await fetch(`/api/gestao-geral/atraso/${atrasoId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (!data.success || !data.atraso) {
            notificar('Erro ao carregar atraso');
            return;
        }
        
        const a = data.atraso;
        const oldModal = safeGet('modalEditarAtraso');
        if (oldModal) oldModal.remove();
        
        const modalHtml = `
            <div class="modal fade" id="modalEditarAtraso" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header" style="background: linear-gradient(135deg, #f59e0b, #d97706); color: white;">
                            <h5 class="modal-title">
                                <i class="fas fa-edit"></i> Editar Atraso
                            </h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <input type="hidden" id="editAtrasoId" value="${a.id}">
                            
                            <div class="mb-3">
                                <label class="form-label">Aluno</label>
                                <input type="text" class="form-control" value="${escapeHTML(a.alunoNome || '')}" disabled>
                            </div>
                            
                            <div class="mb-3">
                                <label class="form-label">Motivo <span class="text-danger">*</span></label>
                                <select id="editAtrasoMotivo" class="form-select">
                                    <option value="onibus" ${a.motivo === 'onibus' ? 'selected' : ''}>Ônibus</option>
                                    <option value="transito" ${a.motivo === 'transito' ? 'selected' : ''}>Trânsito</option>
                                    <option value="problemas_pessoais" ${a.motivo === 'problemas_pessoais' ? 'selected' : ''}>Problemas Pessoais</option>
                                    <option value="fardamento" ${a.motivo === 'fardamento' ? 'selected' : ''}>Fardamento</option>
                                    <option value="outros" ${a.motivo === 'outros' ? 'selected' : ''}>Outros</option>
                                </select>
                            </div>
                            
                            <div class="mb-3">
                                <label class="form-label">Data/Hora <span class="text-danger">*</span></label>
                                <input type="datetime-local" 
                                       id="editAtrasoDataHora" 
                                       class="form-control" 
                                       value="${a.dataHora ? new Date(a.dataHora).toISOString().slice(0, 16) : ''}">
                            </div>
                            
                            <div class="mb-3">
                                <label class="form-label">Descrição <span class="text-danger">*</span></label>
                                <textarea id="editAtrasoDescricao" class="form-control" rows="3">${escapeHTML(a.descricao || '')}</textarea>
                            </div>
                            
                            <div class="mb-3">
                                <label class="form-label">Observações</label>
                                <textarea id="editAtrasoObservacoes" class="form-control" rows="2">${escapeHTML(a.observacoes || '')}</textarea>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                                <i class="fas fa-times"></i> Cancelar
                            </button>
                            <button type="button" class="btn btn-warning" onclick="salvarEdicaoAtraso()">
                                <i class="fas fa-save"></i> Salvar Alterações
                            </button>
                        </div>
                    </div>
                </div>
            </div>`;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        new bootstrap.Modal(safeGet('modalEditarAtraso')).show();
    } catch (error) {
        console.error('Erro:', error);
        notificar('Erro ao carregar para edição');
    }
}

async function salvarEdicaoAtraso() {
    const atrasoId = safeGet('editAtrasoId')?.value;
    const motivo = safeGet('editAtrasoMotivo')?.value;
    const dataHora = safeGet('editAtrasoDataHora')?.value;
    const descricao = (safeGet('editAtrasoDescricao')?.value || '').trim();
    const observacoes = safeGet('editAtrasoObservacoes')?.value || '';
    
    if (!motivo || !dataHora || !descricao) {
        notificar('Preencha todos os campos obrigatórios');
        return;
    }
    
    try {
        const response = await fetch(`/api/gestao-geral/atraso/${atrasoId}`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': `Bearer ${token}` 
            },
            body: JSON.stringify({
                motivo,
                dataHora: new Date(dataHora).toISOString(),
                descricao,
                observacoes
            })
        });
        const data = await response.json();
        
        if (data.success) {
            const modal = bootstrap.Modal.getInstance(safeGet('modalEditarAtraso'));
            if (modal) modal.hide();
            
            notificar('✅ Atraso atualizado com sucesso!', 'success');
            carregarAtrasosRecentes();
            carregarDashboardAtrasos();
        } else {
            notificar('❌ ' + (data.error || 'Erro ao salvar'));
        }
    } catch (error) {
        console.error('Erro:', error);
        notificar('Erro ao salvar alterações');
    }
}

// ============================================
// 🖨️ IMPRIMIR ATRASO
// ============================================
async function imprimirAtraso(atrasoId) {
    if (!atrasoId) return;
    
    try {
        const response = await fetch(`/api/gestao-geral/atraso/${atrasoId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (!data.success || !data.atraso) {
            notificar('Erro ao carregar atraso');
            return;
        }
        
        const a = data.atraso;
        
        let qr = '';
        try {
            const qrR = await fetch(`/api/aluno/qrcode/${a.alunoId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (qrR.ok) {
                const qrD = await qrR.json();
                if (qrD.success && qrD.qrCode) qr = qrD.qrCode;
            }
        } catch (e) { console.info('Sem QR'); }
        
        const win = window.open('', '_blank');
        win.document.write(gerarHTMLImpressaoAtraso(a, qr));
        win.document.close();
        win.onload = () => setTimeout(() => win.print(), 500);
    } catch (error) {
        console.error('Erro:', error);
        notificar('Erro ao imprimir');
    }
}

function gerarHTMLImpressaoAtraso(a, qrCodeUrl) {
    const logo = '/uploads/logo-iema.png';
    const carimbo = '/icons/assinatura_gestao.ico';
    const dataGeracao = new Date().toLocaleString('pt-BR');
    
    const entrada = new Date(a.dataHora);
    const dataExt = entrada.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const horaExt = entrada.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    
    const horarioPrevisto = a.detalhes?.horarioPrevisto || '';
    const horarioChegada = a.detalhes?.horarioChegada || '';
    const mostrarHorarios = horarioPrevisto || horarioChegada;
    
    let horariosHTML = '';
    if (mostrarHorarios) {
        horariosHTML = `
            <div class="info-grid">
                ${horarioPrevisto ? `<div class="info-item"><span class="info-label">Horário Previsto:</span><span class="info-value">${horarioPrevisto}</span></div>` : ''}
                ${horarioChegada ? `<div class="info-item"><span class="info-label">Horário Chegada:</span><span class="info-value">${horarioChegada}</span></div>` : ''}
            </div>`;
    }
    
    // ============================================
    // 🔍 DEFINE QUAIS ASSINATURAS MOSTRAR
    // ============================================
    const temResp = !!(a.assinaturaBase64 && a.assinaturaBase64.length > 100);
    const temAluno = !!(a.assinaturaAlunoBase64 && a.assinaturaAlunoBase64.length > 100);
    const precisaResp = !!a.precisaAssinatura;
    const precisaAluno = !!a.precisaAssinaturaAluno;
    
    const mostrarResp = precisaResp || (!precisaResp && !precisaAluno);
    const mostrarAluno = precisaAluno;
    
    console.log('🖨️ Impressão - mostrarResp:', mostrarResp, '| mostrarAluno:', mostrarAluno, 
                '| temResp:', temResp, '| temAluno:', temAluno);
    
    const assinaturaRespHTML = temResp
        ? `<img class="assinatura-img" src="${a.assinaturaBase64}" alt="Assinatura Responsável">`
        : `<span style="color:#999;font-size:8pt;padding-bottom:2px;">_________________________________</span>`;
    
    const assinaturaAlunoHTML = temAluno
        ? `<img class="assinatura-img" src="${a.assinaturaAlunoBase64}" alt="Assinatura Aluno">`
        : `<span style="color:#999;font-size:8pt;padding-bottom:2px;">_________________________________</span>`;
    
    const nomeAlunoAssinante = a.assinadaPorNomeAluno 
        ? `<div style="font-size:7pt;color:#047857;margin-top:1mm;">${escapeHTML(a.assinadaPorNomeAluno)}</div>` 
        : '';
    
    let assinaturasHTML = '';
    
    if (mostrarResp && mostrarAluno) {
        assinaturasHTML = `
            <div class="assinaturas">
                <div class="assinatura">
                    <div class="assinatura-container">
                        ${assinaturaRespHTML}
                    </div>
                    <div class="assinatura-linha">Assinatura do Responsável</div>
                </div>
                <div class="assinatura">
                    <div class="assinatura-container">
                        ${assinaturaAlunoHTML}
                        ${nomeAlunoAssinante}
                    </div>
                    <div class="assinatura-linha">Assinatura do Aluno</div>
                </div>
                <div class="assinatura">
                    <div class="assinatura-container">
                        <img class="carimbo-overlay" src="${carimbo}" alt="Carimbo" onerror="this.style.display='none'">
                    </div>
                    <div class="assinatura-linha">Coordenação / Gestão Geral</div>
                </div>
            </div>`;
    } else if (mostrarAluno && !mostrarResp) {
        assinaturasHTML = `
            <div class="assinaturas">
                <div class="assinatura">
                    <div class="assinatura-container">
                        ${assinaturaAlunoHTML}
                        ${nomeAlunoAssinante}
                    </div>
                    <div class="assinatura-linha">Assinatura do Aluno</div>
                </div>
                <div class="assinatura">
                    <div class="assinatura-container">
                        <img class="carimbo-overlay" src="${carimbo}" alt="Carimbo" onerror="this.style.display='none'">
                    </div>
                    <div class="assinatura-linha">Coordenação / Gestão Geral</div>
                </div>
            </div>`;
    } else {
        assinaturasHTML = `
            <div class="assinaturas">
                <div class="assinatura">
                    <div class="assinatura-container">
                        ${assinaturaRespHTML}
                    </div>
                    <div class="assinatura-linha">Assinatura do Responsável</div>
                </div>
                <div class="assinatura">
                    <div class="assinatura-container">
                        <img class="carimbo-overlay" src="${carimbo}" alt="Carimbo" onerror="this.style.display='none'">
                    </div>
                    <div class="assinatura-linha">Coordenação / Gestão Geral</div>
                </div>
            </div>`;
    }
    
    return `<!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <title>Registro de Atraso - ${escapeHTML(a.alunoNome)}</title>
        <style>
            @page { size: A4 portrait; margin: 8mm; }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: 'Times New Roman', Times, serif; font-size: 9.5pt; line-height: 1.25; color: #000; }
            
            .header { text-align: center; border-bottom: 1.5px double #000; padding-bottom: 4px; margin-bottom: 6px; }
            .header img { max-width: 100%; max-height: 14mm; object-fit: contain; display: block; margin: 0 auto 2px; }
            .header h1 { font-size: 10pt; text-transform: uppercase; font-weight: bold; margin: 2px 0 0; }
            .header p { font-size: 8pt; margin: 1px 0 0; }
            
            .titulo { text-align: center; font-size: 11pt; font-weight: bold; background: #eef2ff; padding: 4px 8px; border: 1.5px solid #000; margin: 6px 0 3px; text-transform: uppercase; letter-spacing: 0.5px; }
            
            .aluno-box { display: flex; align-items: center; gap: 8px; padding: 5px 8px; background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 5px; margin-bottom: 6px; }
            .aluno-foto { width: 38px; height: 38px; border-radius: 50%; object-fit: cover; border: 1.5px solid #1e3c72; flex-shrink: 0; }
            .aluno-info { flex: 1; }
            .aluno-nome { font-size: 10pt; font-weight: bold; color: #1e3c72; margin-bottom: 1px; }
            .aluno-detalhes { font-size: 8pt; color: #374151; }
            
            .section-title { font-size: 9pt; font-weight: bold; background: #e8e8e8; padding: 2px 6px; border-left: 3px solid #1e3c72; margin: 5px 0 3px; }
            
            .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 3px 12px; margin: 3px 0 5px; font-size: 8.5pt; }
            .info-item { display: flex; gap: 4px; }
            .info-label { font-weight: bold; white-space: nowrap; }
            .info-value { flex: 1; }
            
            .motivo-box { background: #f5f5f5; border: 1px solid #000; padding: 5px 8px; margin: 5px 0; border-radius: 4px; }
            .motivo-box strong { font-size: 9pt; }
            .motivo-box p { margin: 3px 0 0; font-size: 9.5pt; font-weight: bold; }
            
            .descricao-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 4px; padding: 5px 8px; font-size: 8.5pt; line-height: 1.3; min-height: 30px; max-height: 80px; overflow: hidden; word-wrap: break-word; }
            
            /* Assinaturas - layout dinâmico */
            .assinaturas { display: flex; justify-content: space-around; margin-top: 15px; gap: 15px; }
            .assinatura { flex: 1; text-align: center; font-size: 7.5pt; position: relative; }
            .assinatura-container { position: relative; border-bottom: 1px solid #000; min-height: 14mm; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 2px; }
            .assinatura-img { max-height: 13mm; max-width: 100%; object-fit: contain; position: relative; z-index: 2; margin-bottom: 1mm; }
            .carimbo-overlay { max-height: 13mm; max-width: 55%; object-fit: contain; opacity: 0.85; }
            .assinatura-linha { padding-top: 2px; font-size: 7.5pt; margin-top: 2px; font-weight: bold; }
            
            .qr-code { text-align: center; margin-top: 6px; }
            .qr-code img { width: 25mm; height: 25mm; border: 1.5px solid #000; padding: 2px; display: block; margin: 0 auto; }
            .qr-code p { font-size: 8pt; margin: 3px 0 0 0; color: #444; font-weight: bold; }
            
            .footer { text-align: center; margin-top: 5px; padding-top: 3px; border-top: 1px solid #ccc; font-size: 6.5pt; color: #666; }
            .footer p { margin: 1px 0; }
            
            .btn-print { display: block; margin: 10px auto; padding: 8px 20px; background: #1e3c72; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 12px; font-family: Arial, sans-serif; }
            .btn-print:hover { background: #2a5298; }
            
            @media print { .no-print { display: none !important; } body { padding: 0; } }
        </style>
    </head>
    <body>
        <button class="btn-print no-print" onclick="window.print()">🖨️ Imprimir</button>
        
        <div class="header">
            <img src="${logo}" alt="IEMA" onerror="this.style.display='none'">
            <h1>IEMA Pleno: São Luís - Centro</h1>
            <p>Sistema de Atendimentos — Gestão Geral</p>
        </div>
        
        <div class="titulo">📋 Registro de Atraso</div>
        
        <div class="aluno-box">
            <img class="aluno-foto" src="${gerarAvatarSVG(a.alunoNome)}" alt="${escapeHTML(a.alunoNome)}">
            <div class="aluno-info">
                <div class="aluno-nome">${escapeHTML(a.alunoNome)}</div>
                <div class="aluno-detalhes">
                    <strong>Matrícula:</strong> ${escapeHTML(a.alunoMatricula || 'Não informada')} • 
                    <strong>Turma:</strong> ${escapeHTML(a.alunoTurma || '-')}
                    ${a.alunoCurso ? ` • <strong>Curso:</strong> ${escapeHTML(a.alunoCurso)}` : ''}
                </div>
            </div>
        </div>
        
        <div class="section-title">📌 Dados do Atraso</div>
        <div class="info-grid">
            <div class="info-item"><span class="info-label">Data:</span><span class="info-value">${dataExt}</span></div>
            <div class="info-item"><span class="info-label">Hora:</span><span class="info-value">${horaExt}</span></div>
            <div class="info-item"><span class="info-label">Registrado por:</span><span class="info-value">${escapeHTML(a.registradoPor || '-')}</span></div>
        </div>
        ${horariosHTML}
        
        <div class="motivo-box">
            <strong>📌 Motivo:</strong>
            <p>☑ ${escapeHTML(a.motivoLabel || a.motivo || '-')}</p>
        </div>
        
        <div class="section-title">📝 Descrição</div>
        <div class="descricao-box">${escapeHTML(a.descricao || '-').replace(/\n/g, '<br>')}</div>
        
        ${a.observacoes ? `
            <div class="section-title">💬 Observações</div>
            <div class="descricao-box" style="min-height: 20px; max-height: 40px;">${escapeHTML(a.observacoes).replace(/\n/g, '<br>')}</div>
        ` : ''}
        
        ${assinaturasHTML}
        
        ${qrCodeUrl ? `
            <div class="qr-code">
                <img src="${qrCodeUrl}" alt="QR Code">
                <p>Identificação do Aluno</p>
            </div>
        ` : ''}
        
        <div class="footer">
            <p>Documento gerado em <strong>${dataGeracao}</strong> — EducaPleno — Gestão Geral</p>
        </div>
    </body>
    </html>`;
}

// ============================================
// 🗑️ EXCLUIR ATRASO
// ============================================
async function excluirAtraso(atrasoId, alunoNome) {
    if (!atrasoId) return;
    
    const confirmar1 = await confirm(`⚠️ Tem certeza que deseja EXCLUIR este atraso?\n\nAluno: ${alunoNome}\n\nEsta ação não pode ser desfeita!`);
    if (!confirmar1) return;
    
    const confirmar2 = await confirm('⚠️ ÚLTIMA CONFIRMAÇÃO!\n\nDeseja realmente excluir permanentemente?');
    if (!confirmar2) return;
    
    try {
        const response = await fetch(`/api/gestao-geral/atraso/${atrasoId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success) {
            notificar('✅ Atraso excluído com sucesso!', 'success');
            
            // 🆕 Recarrega a lista imediatamente na tela
            // Se estiver na última página e ela ficar vazia, volta uma página
            if (paginacaoAtrasosState.paginaAtual > 1 && __atrasosRecentes.length === 1) {
                carregarAtrasosRecentes(paginacaoAtrasosState.paginaAtual - 1);
            } else {
                carregarAtrasosRecentes();
            }
            
            // Recarrega o dashboard para atualizar os gráficos de fundo (opcional)
            carregarDashboardAtrasos();
        } else {
            notificar('❌ ' + (data.error || 'Erro ao excluir'), 'error');
        }
    } catch (error) {
        console.error('Erro:', error);
        notificar('Erro ao excluir atraso', 'error');
    }
}

// ============================================
// 🔧 INICIALIZAÇÃO DOS FILTROS
// ============================================
function configurarFiltrosAtrasosRecentes() {
    const selectTurma = safeGet('filtroAtrasosRecentesTurma');
    if (selectTurma && selectTurma.options.length <= 1) {
        fetch('/api/gestao-geral/atraso/turmas', {
            headers: { 'Authorization': `Bearer ${token}` }
        })
        .then(r => r.json())
        .then(data => {
            if (data.success && Array.isArray(data.turmas)) {
                data.turmas.forEach(t => {
                    selectTurma.innerHTML += `<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`;
                });
            }
        })
        .catch(e => console.warn('Erro ao buscar turmas:', e));
    }

    const busca = safeGet('filtroAtrasosRecentesBusca');
    if (busca && !busca.dataset.listenerAttached) {
        busca.dataset.listenerAttached = 'true';
        let timeout;
        busca.addEventListener('input', () => {
            clearTimeout(timeout);
            timeout = setTimeout(() => carregarAtrasosRecentes(1), 400);
        });
    }
    
    const filtros = [
        'filtroAtrasosRecentesTurma', 
        'filtroAtrasosRecentesMotivo', 
        'filtroAtrasosRecentesDataInicio', 
        'filtroAtrasosRecentesDataFim'
    ];
    
    filtros.forEach(id => {
        const el = safeGet(id);
        if (el && !el.dataset.listenerAttached) {
            el.dataset.listenerAttached = 'true';
            el.addEventListener('change', () => carregarAtrasosRecentes(1));
        }
    });
}

function popularFiltroTurmasAtrasosRecentes() {
    const select = safeGet('filtroAtrasosRecentesTurma');
    if (!select) return;
    
    const valorAtual = select.value;
    const turmas = [...new Set(__atrasosRecentes.map(a => a.alunoTurma).filter(Boolean))].sort();
    
    select.innerHTML = '<option value="">Todas as turmas</option>';
    turmas.forEach(t => {
        select.innerHTML += `<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`;
    });
    
    if (valorAtual && turmas.includes(valorAtual)) select.value = valorAtual;
}

async function carregarTurmasParaRelatorio() {
    try {
        const response = await fetch('/api/gestao-geral/atraso/turmas', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        const select = safeGet('filtroTurma');
        if (!select) return;
        if (data.success && Array.isArray(data.turmas)) {
            select.innerHTML = '<option value="">Selecione...</option>';
            data.turmas.forEach(t => {
                select.innerHTML += `<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`;
            });
        }
    } catch (error) { console.error('Erro:', error); }
}

function toggleRelatorioFiltros() {
    const tipo = safeGet('tipoRelatorio')?.value;
    safeGet('filtroTurmaDiv').style.display = tipo === 'turma' ? 'block' : 'none';
    safeGet('filtroAlunoDiv').style.display = tipo === 'aluno' ? 'block' : 'none';
    
    const btnCSV = safeGet('btnExportarCSVAtrasos');
    const btnPDF = safeGet('btnExportarPDFAtrasos');
    if (btnCSV) btnCSV.disabled = true;
    if (btnPDF) btnPDF.disabled = true;
    relatorioData = null;
    
    if (tipo === 'turma') {
        const selectTurma = safeGet('filtroTurma');
        if (selectTurma && selectTurma.options.length <= 1) carregarTurmasParaRelatorio();
    }
    if (tipo === 'aluno') {
        inicializarAutocompleteAluno();
        setTimeout(() => safeGet('buscaAlunoRelatorio')?.focus(), 100);
        if (!__alunosCarregados) carregarAlunosParaRelatorio();
    }
}

function inicializarAutocompleteAluno() {
    const input = safeGet('buscaAlunoRelatorio');
    const listEl = safeGet('autocompleteAlunoList');
    const hiddenInput = safeGet('filtroAluno');
    if (!input || !listEl || !hiddenInput) return;
    if (input.dataset.autocompleteInit === 'true') return;
    input.dataset.autocompleteInit = 'true';
    
    input.addEventListener('input', (e) => {
        const termo = e.target.value.trim();
        hiddenInput.value = '';
        const infoEl = safeGet('alunoSelecionadoInfo');
        if (infoEl) infoEl.textContent = '';
        if (termo.length < 1) { listEl.style.display = 'none'; return; }
        filtrarAlunosAutocomplete(termo);
    });
    input.addEventListener('focus', () => {
        const termo = input.value.trim();
        if (termo.length >= 1) filtrarAlunosAutocomplete(termo);
    });
    input.addEventListener('keydown', (e) => {
        if (listEl.style.display === 'none') return;
        if (e.key === 'ArrowDown') { e.preventDefault(); __indiceSelecionado = Math.min(__indiceSelecionado + 1, __alunosFiltrados.length - 1); destacarItemAutocomplete(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); __indiceSelecionado = Math.max(__indiceSelecionado - 1, -1); destacarItemAutocomplete(); }
        else if (e.key === 'Enter') { e.preventDefault(); if (__indiceSelecionado >= 0 && __alunosFiltrados[__indiceSelecionado]) selecionarAlunoAutocomplete(__alunosFiltrados[__indiceSelecionado]); }
        else if (e.key === 'Escape') listEl.style.display = 'none';
    });
    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !listEl.contains(e.target)) listEl.style.display = 'none';
    });
}

async function carregarAlunosParaRelatorio() {
    if (__alunosCarregados && __alunosParaRelatorio.length > 0) return;
    const inputBusca = safeGet('buscaAlunoRelatorio');
    if (inputBusca) { inputBusca.placeholder = 'Carregando...'; inputBusca.disabled = true; }
    
    try {
        const turmasRes = await fetch('/api/gestao-geral/atraso/turmas', { headers: { 'Authorization': `Bearer ${token}` } });
        const turmasData = await turmasRes.json();
        if (!turmasData.success) return;
        
        const todosAlunos = [];
        for (const turma of turmasData.turmas) {
            try {
                const res = await fetch(`/api/gestao-geral/atraso/alunos-por-turma?turma=${encodeURIComponent(turma)}`, { headers: { 'Authorization': `Bearer ${token}` } });
                const data = await res.json();
                if (data.success && data.alunos) {
                    data.alunos.forEach(a => todosAlunos.push({
                        id: a.id, nome: a.nome, matricula: a.matricula || '',
                        turma: a.turma || turma, curso: a.curso || ''
                    }));
                }
            } catch (e) { console.warn(e); }
        }
        todosAlunos.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
        __alunosParaRelatorio = todosAlunos;
        __alunosCarregados = true;
        if (inputBusca) { inputBusca.placeholder = 'Digite o nome do aluno...'; inputBusca.disabled = false; }
    } catch (error) { console.error('Erro:', error); }
}

function filtrarAlunosAutocomplete(termo) {
    const listEl = safeGet('autocompleteAlunoList');
    if (!listEl) return;
    if (!__alunosCarregados) {
        listEl.innerHTML = `<div class="autocomplete-aluno-loading">Carregando...</div>`;
        listEl.style.display = 'block';
        carregarAlunosParaRelatorio().then(() => { if (__alunosCarregados) filtrarAlunosAutocomplete(termo); });
        return;
    }
    const termoLower = termo.toLowerCase();
    __alunosFiltrados = __alunosParaRelatorio.filter(a => 
        (a.nome || '').toLowerCase().includes(termoLower) || (a.matricula || '').toLowerCase().includes(termoLower)
    ).slice(0, 10);
    __indiceSelecionado = -1;
    if (__alunosFiltrados.length === 0) {
        listEl.innerHTML = `<div class="autocomplete-aluno-empty">Nenhum aluno encontrado</div>`;
        listEl.style.display = 'block';
        return;
    }
    listEl.innerHTML = __alunosFiltrados.map((aluno, index) => {
        const nomeDestacado = destacarTermo(aluno.nome, termo);
        const matricula = aluno.matricula ? `<span class="aluno-matricula">${escapeHTML(aluno.matricula)}</span>` : '';
        return `
            <div class="autocomplete-aluno-item" data-index="${index}">
                <div class="aluno-nome">${nomeDestacado}</div>
                <div class="aluno-info">
                    <span class="aluno-turma">${escapeHTML(aluno.turma || 'Sem turma')}</span>
                    ${matricula}
                </div>
            </div>`;
    }).join('');
    listEl.querySelectorAll('.autocomplete-aluno-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            const index = parseInt(item.getAttribute('data-index'));
            if (__alunosFiltrados[index]) selecionarAlunoAutocomplete(__alunosFiltrados[index]);
        });
        item.addEventListener('mouseenter', () => {
            __indiceSelecionado = parseInt(item.getAttribute('data-index'));
            destacarItemAutocomplete();
        });
    });
    listEl.style.display = 'block';
}

function destacarTermo(texto, termo) {
    if (!texto) return '';
    if (!termo) return escapeHTML(texto);
    const regex = new RegExp(`(${escapeRegex(termo)})`, 'gi');
    return escapeHTML(texto).replace(regex, '<mark>$1</mark>');
}

function destacarItemAutocomplete() {
    const listEl = safeGet('autocompleteAlunoList');
    if (!listEl) return;
    listEl.querySelectorAll('.autocomplete-aluno-item').forEach((item, i) => {
        if (i === __indiceSelecionado) { item.classList.add('selected'); item.scrollIntoView({ block: 'nearest' }); }
        else item.classList.remove('selected');
    });
}

function selecionarAlunoAutocomplete(aluno) {
    if (!aluno) return;
    const input = safeGet('buscaAlunoRelatorio');
    const hiddenInput = safeGet('filtroAluno');
    const listEl = safeGet('autocompleteAlunoList');
    const infoEl = safeGet('alunoSelecionadoInfo');
    if (input) input.value = aluno.nome;
    if (hiddenInput) hiddenInput.value = aluno.id;
    if (listEl) listEl.style.display = 'none';
    if (infoEl) {
        const mat = aluno.matricula ? ` • ${aluno.matricula}` : '';
        infoEl.innerHTML = `✅ <strong>${escapeHTML(aluno.nome)}</strong>${mat} — Turma ${escapeHTML(aluno.turma || '-')}`;
        infoEl.style.color = '#1e3c72';
    }
}

async function carregarRelatorio() {
    const tipo = safeGet('tipoRelatorio')?.value;
    const dataInicio = safeGet('dataInicio')?.value || '';
    const dataFim = safeGet('dataFim')?.value || '';
    let url = '';
    
    if (tipo === 'geral') {
        url = `/api/gestao-geral/atraso/relatorio/geral?`;
        if (dataInicio) url += `dataInicio=${dataInicio}&`;
        if (dataFim) url += `dataFim=${dataFim}&`;
    } else if (tipo === 'turma') {
        const turma = safeGet('filtroTurma')?.value;
        if (!turma) { notificar('Selecione uma turma', 'warning'); return; }
        url = `/api/gestao-geral/atraso/relatorio/turma/${encodeURIComponent(turma)}?`;
        if (dataInicio) url += `dataInicio=${dataInicio}&`;
        if (dataFim) url += `dataFim=${dataFim}&`;
    } else if (tipo === 'aluno') {
        const alunoId = safeGet('filtroAluno')?.value;
        if (!alunoId) { notificar('Selecione um aluno', 'warning'); return; }
        url = `/api/gestao-geral/atraso/relatorio/aluno/${alunoId}?`;
        if (dataInicio) url += `dataInicio=${dataInicio}&`;
        if (dataFim) url += `dataFim=${dataFim}&`;
    }
    
    try {
        const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await response.json();
        
        if (data.success) {
            relatorioData = data;
            exibirRelatorio(data, tipo);
            
            const btnCSV = safeGet('btnExportarCSVAtrasos');
            const btnPDF = safeGet('btnExportarPDFAtrasos');
            if (btnCSV) btnCSV.disabled = false;
            if (btnPDF) btnPDF.disabled = false;
            
            const total = data.totalAtrasos || data.estatisticas?.totalAtrasos || 0;
            if (total === 0) {
                notificar('⚠️ Nenhum registro encontrado. Verifique as datas e filtros.', 'warning');
            }
        } else {
            notificar('Erro ao carregar relatório: ' + (data.error || ''), 'error');
        }
    } catch (error) {
        console.error('Erro:', error);
        notificar('Erro ao carregar relatório', 'error');
    }
}

function exibirRelatorio(data, tipo) {
    const container = safeGet('resultadoRelatorio');
    if (!container) return;
    
    if (tipo === 'geral') {
        container.innerHTML = `
            <div class="card"><div class="card-body">
                <h5><i class="fas fa-chart-bar"></i> Relatório Geral</h5>
                <p>Total: <strong>${data.totalAtrasos || 0}</strong></p>
                <h6 class="mt-4">Por Motivo</h6>
                <div class="row">${(data.porMotivo || []).map(m => `
                    <div class="col-md-4 mb-2">
                        <div class="p-2" style="background:#dbeafe;border-radius:8px;">
                            <strong>${escapeHTML(m.label)}</strong>: ${m.count}
                        </div>
                    </div>`).join('')}</div>
                <h6 class="mt-4">Por Turma</h6>
                <div class="table-responsive">
                    <table class="table table-sm">
                        <thead><tr><th>Turma</th><th>Total</th><th>Alunos</th></tr></thead>
                        <tbody>${(data.porTurma || []).map(t => `
                            <tr><td>${escapeHTML(t.turma)}</td><td>${t.total}</td><td>${t.totalAlunos}</td></tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div></div>`;
    } else if (tipo === 'turma') {
        container.innerHTML = `
            <div class="card"><div class="card-body">
                <h5>Relatório da Turma: ${escapeHTML(data.turma || '')}</h5>
                <p>Total: <strong>${data.estatisticas?.totalAtrasos || 0}</strong></p>
                <h6 class="mt-4">Por Aluno</h6>
                <div class="table-responsive">
                    <table class="table table-sm">
                        <thead><tr><th>Aluno</th><th>Total</th></tr></thead>
                        <tbody>${(data.porAluno || []).map(a => `
                            <tr><td>${escapeHTML(a.alunoNome)}</td><td><span class="badge bg-primary">${a.total}</span></td></tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div></div>`;
    } else if (tipo === 'aluno') {
        container.innerHTML = `
            <div class="card"><div class="card-body">
                <h5>Relatório: ${escapeHTML(data.aluno?.nome || '')}</h5>
                <p>Turma: ${escapeHTML(data.aluno?.turma || 'N/A')}</p>
                <p>Total: <strong>${data.estatisticas?.totalAtrasos || 0}</strong></p>
                <h6 class="mt-4">Histórico</h6>
                <div class="table-responsive">
                    <table class="table table-sm">
                        <thead><tr><th>Data</th><th>Motivo</th><th>Descrição</th></tr></thead>
                        <tbody>${(data.atrasos || []).map(a => `
                            <tr>
                                <td>${new Date(a.dataHora).toLocaleString('pt-BR')}</td>
                                <td>${escapeHTML(a.motivoLabel)}</td>
                                <td>${escapeHTML((a.descricao || '').substring(0, 100))}</td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div></div>`;
    }
}

function exportarCSV() {
    if (!relatorioData) {
        notificar('⚠️ Nenhum relatório carregado.\n\nClique em BUSCAR primeiro.', 'warning');
        return;
    }

    const registros = relatorioData.atrasos || relatorioData.registros || [];
    if (registros.length === 0) {
        notificar('⚠️ Nenhum registro para exportar.\n\nVerifique os filtros de data.', 'warning');
        return;
    }

    const tipo = relatorioData.aluno ? 'aluno' : (relatorioData.turma ? 'turma' : 'geral');
    let titulo = 'Relatório de Atrasos';
    let subtitulo = '';

    if (tipo === 'turma') {
        titulo = 'Relatório de Atrasos por Turma';
        subtitulo = `Turma: ${relatorioData.turma || ''}`;
    } else if (tipo === 'aluno') {
        titulo = 'Relatório Individual de Atrasos';
        subtitulo = `${relatorioData.aluno?.nome || ''} — ${relatorioData.aluno?.turma || ''}`;
    } else {
        titulo = 'Relatório Geral de Atrasos';
        subtitulo = 'Visão consolidada de todos os registros';
    }

    const filtros = [];
    const dataIni = safeGet('dataInicio')?.value;
    const dataFimEl = safeGet('dataFim')?.value;
    if (dataIni) filtros.push({ label: 'Data inicial', valor: dataIni });
    if (dataFimEl) filtros.push({ label: 'Data final', valor: dataFimEl });
    if (relatorioData.turma) filtros.push({ label: 'Turma', valor: relatorioData.turma });
    if (relatorioData.aluno?.nome) filtros.push({ label: 'Aluno', valor: relatorioData.aluno.nome });

    const colunas = [
        {
            label: 'Data/Hora do Atraso',
            format: (a) => a.dataHora
                ? new Date(a.dataHora).toLocaleString('pt-BR')
                : ''
        },
        {
            label: 'Data de Cadastro',
            format: (a) => a.createdAt
                ? new Date(a.createdAt).toLocaleString('pt-BR')
                : ''
        },
        {
            label: 'Aluno',
            format: (a) => a.alunoNome || relatorioData.aluno?.nome || ''
        },
        {
            label: 'Matrícula',
            format: (a) => a.alunoMatricula || relatorioData.aluno?.matricula || ''
        },
        {
            label: 'Turma',
            format: (a) => a.alunoTurma || relatorioData.aluno?.turma || relatorioData.turma || ''
        },
        {
            label: 'Curso',
            format: (a) => a.alunoCurso || relatorioData.aluno?.curso || ''
        },
        {
            label: 'Motivo',
            format: (a) => a.motivoLabel || a.motivo || ''
        },
        {
            label: 'Descrição',
            format: (a) => a.descricao || ''
        },
        {
            label: 'Observações',
            format: (a) => a.observacoes || ''
        },
        {
            label: 'Registrado por',
            format: (a) => a.registradoPor || ''
        },
        {
            label: 'Assinatura',
            format: (a) => a.temAssinatura
                ? `Sim${a.assinadaPorNome ? ` (${a.assinadaPorNome})` : ''}`
                : 'Não'
        }
    ];

    const ok = gerarBaixarCSV({
        titulo,
        subtitulo,
        setor: 'Gestão Geral',
        colunas,
        registros,
        filtros,
        nomeArquivo: `relatorio-atrasos-${tipo}`,
        observacoes: `${registros.length} atraso(s) listado(s)`
    });

    if (ok) {
        notificar(`✅ Relatório exportado (${registros.length} registro(s))!`, 'success');
    }
}
// ============================================================================
// ============ MÓDULOS: AUTORIZAÇÃO / JUSTIFICATIVA / 2ª CHAMADA / UNIFORME ==
// ============================================================================

function getCfg(modulo) { return CONFIG_MODULOS[modulo]; }
function getPrefixo(modulo) { return CONFIG_MODULOS[modulo].prefixo; }
function getPrefixoInput(modulo) { return CONFIG_MODULOS[modulo].prefixoInput; }

// ============================================
// SCANNER DOS MÓDULOS
// ============================================
async function iniciarScannerModulo(modulo) {
    const cfg = getCfg(modulo);
    const est = estados[modulo];
    const idContainer = `qr-reader-${cfg.tipo.replace(/_/g, '-')}`;
    const container = safeGet(idContainer);
    if (!container) return;
    if (est.scannerAtivo) return;
    
    const innerId = `qr-reader-${modulo}-new`;
    container.innerHTML = `<div id="${innerId}" style="width: 100%;"></div>`;
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        container.innerHTML = `
            <div class="alert alert-warning m-3" style="border-radius: 12px;">
                <i class="fas fa-video-slash" style="font-size: 32px; display: block; margin-bottom: 10px;"></i>
                <strong>Câmera não disponível</strong><br>
                Use o <strong>Modo Manual</strong>.
                <button class="btn btn-sm btn-primary mt-3" onclick="setModoModulo('${modulo}', 'manual')" style="border-radius: 30px;">
                    <i class="fas fa-users"></i> Modo Manual
                </button>
            </div>`;
        return;
    }
    
    try {
        est.scanner = new Html5Qrcode(innerId);
        const config = { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 };
        await est.scanner.start({ facingMode: "environment" }, config,
            (text) => onScanSuccessModulo(modulo, text), () => {});
        est.scannerAtivo = true;
        console.log(`✅ Scanner ${cfg.nomeAmigavel} iniciado`);
    } catch (err) {
        console.error(`❌ Erro scanner ${cfg.nomeAmigavel}:`, err);
        let msg = 'Não foi possível acessar a câmera.';
        if (err.message?.includes('NotFoundError')) msg = 'Nenhuma câmera encontrada.';
        else if (err.message?.includes('NotAllowedError')) msg = 'Permissão negada.';
        
        container.innerHTML = `
            <div class="alert alert-warning m-3" style="border-radius: 12px;">
                <i class="fas fa-video-slash" style="font-size: 32px; display: block; margin-bottom: 10px;"></i>
                <strong>Câmera indisponível</strong><br>
                <span style="font-size: 13px;">${msg}</span>
                <button class="btn btn-sm btn-primary mt-3" onclick="setModoModulo('${modulo}', 'manual')" style="border-radius: 30px;">
                    <i class="fas fa-users"></i> Modo Manual
                </button>
            </div>`;
        est.scannerAtivo = false;
        est.scanner = null;
    }
}

async function pararScannerModulo(modulo) {
    const est = estados[modulo];
    if (est.scanner && est.scannerAtivo) {
        try { await est.scanner.stop(); } catch (e) {}
    }
    est.scannerAtivo = false;
    est.scanner = null;
}

async function onScanSuccessModulo(modulo, text) {
    const id = extrairAlunoId(text);
    if (!id) { notificar('QR Code inválido'); return; }
    await pararScannerModulo(modulo);
    await buscarAlunoModulo(modulo, id);
}

// ============================================
// MODO (AUTO/MANUAL) DOS MÓDULOS
// ============================================
async function setModoModulo(modulo, modo) {
    const est = estados[modulo];
    const P = getPrefixo(modulo);
    est.modoAtual = modo;
    
    const infoEl = safeGet(`alunoInfo${P}`);
    const formEl = safeGet(`form${P}`);
    if (infoEl) infoEl.style.display = 'none';
    if (formEl) formEl.style.display = 'none';
    est.currentAluno = null;
    
    if (modo === 'automatico') {
        safeGet(`modoAutomatico${P}Btn`)?.classList.add('active');
        safeGet(`modoManual${P}Btn`)?.classList.remove('active');
        const ma = safeGet(`modoAutomatico${P}`);
        const mm = safeGet(`modoManual${P}`);
        if (ma) ma.style.display = 'block';
        if (mm) mm.style.display = 'none';
        await iniciarScannerModulo(modulo);
    } else {
        safeGet(`modoManual${P}Btn`)?.classList.add('active');
        safeGet(`modoAutomatico${P}Btn`)?.classList.remove('active');
        const ma = safeGet(`modoAutomatico${P}`);
        const mm = safeGet(`modoManual${P}`);
        if (ma) ma.style.display = 'none';
        if (mm) mm.style.display = 'block';
        await pararScannerModulo(modulo);
        const turma = safeGet(`filtroTurmaManual${P}`)?.value;
        if (turma) await carregarAlunosTurmaModulo(modulo);
    }
}

// ============================================
// LISTA DE ALUNOS POR TURMA (MODO MANUAL)
// ============================================
async function carregarTurmasManualModulo(modulo) {
    const P = getPrefixo(modulo);
    try {
        const r = await fetch('/api/gestao-geral/autorizacao/turmas', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const d = await r.json();
        if (d.success) {
            const s = safeGet(`filtroTurmaManual${P}`);
            if (s && s.options.length <= 1) {
                s.innerHTML = '<option value="">Selecione uma turma...</option>';
                d.turmas.forEach(t => s.innerHTML += `<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`);
            }
        }
    } catch (e) { console.error(e); }
}

async function carregarAlunosTurmaModulo(modulo) {
    const est = estados[modulo];
    const P = getPrefixo(modulo);
    const turma = safeGet(`filtroTurmaManual${P}`)?.value;
    const lista = safeGet(`listaAlunosManual${P}`);
    
    if (!turma) {
        if (lista) lista.innerHTML = '<div class="text-center py-3">Selecione uma turma</div>';
        return;
    }
    if (lista) lista.innerHTML = '<div class="text-center py-3"><div class="loading-spinner"></div><p>Carregando...</p></div>';
    
    try {
        const r = await fetch(`/api/gestao-geral/autorizacao/alunos-por-turma?turma=${encodeURIComponent(turma)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const d = await r.json();
        if (d.success) {
            est.alunosPorTurma = d.alunos;
            filtrarAlunosManualModulo(modulo);
        }
    } catch (e) { console.error(e); }
}

function filtrarAlunosManualModulo(modulo) {
    const est = estados[modulo];
    const P = getPrefixo(modulo);
    const busca = (safeGet(`filtroBuscaManual${P}`)?.value || '').toLowerCase();
    let filtrados = est.alunosPorTurma;
    if (busca) filtrados = filtrados.filter(a => (a.nome || '').toLowerCase().includes(busca));
    filtrados.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    
    const c = safeGet(`listaAlunosManual${P}`);
    if (!c) return;
    if (filtrados.length === 0) {
        c.innerHTML = '<div class="text-center text-muted py-3">Nenhum aluno encontrado</div>';
        return;
    }
    c.innerHTML = '<div class="list-group">' + filtrados.map(a => `
        <div class="list-group-item list-group-item-action d-flex justify-content-between align-items-center" 
             data-aluno-id="${a.id}" data-aluno-nome="${escapeHTML(a.nome)}" style="cursor:pointer;">
            <div>
                <strong>${escapeHTML(a.nome)}</strong><br>
                <small class="text-muted">${escapeHTML(a.matricula || 'Sem matrícula')} • ${escapeHTML(a.curso || '')}</small>
            </div>
            <i class="fas fa-hand-pointer fa-2x text-primary"></i>
        </div>
    `).join('') + '</div>';
    
    c.querySelectorAll('.list-group-item').forEach(item => {
        item.addEventListener('click', () => {
            selecionarAlunoModulo(modulo, item.dataset.alunoId, item.dataset.alunoNome, item);
        });
    });
}

async function selecionarAlunoModulo(modulo, alunoId, alunoNome, itemEl) {
    if (itemEl) {
        itemEl.style.background = '#dbeafe';
        itemEl.style.borderColor = '#1e3c72';
        itemEl.style.pointerEvents = 'none';
        itemEl.innerHTML = `
            <div><strong>${escapeHTML(alunoNome)}</strong><br><small style="color: #1e3c72;">Processando...</small></div>
            <i class="fas fa-spinner fa-spin fa-2x" style="color: #1e3c72;"></i>`;
    }
    
    try { 
        await buscarAlunoModulo(modulo, alunoId); 
    } catch (e) { 
        console.error('Erro ao selecionar aluno:', e);
        // Restaura o card caso dê erro
        if (itemEl) {
            itemEl.style.background = '';
            itemEl.style.borderColor = '';
            itemEl.style.pointerEvents = 'auto';
            itemEl.innerHTML = `
                <div>
                    <strong>${escapeHTML(alunoNome)}</strong><br>
                    <small class="text-muted">Erro ao carregar. Tente novamente.</small>
                </div>
                <i class="fas fa-hand-pointer fa-2x text-primary"></i>`;
        }
    }
}

// ============================================
// BUSCAR / EXIBIR ALUNO (MÓDULOS)
// ============================================
async function buscarAlunoModulo(modulo, alunoId) {
    const est = estados[modulo];
    try {
        await pararScannerModulo(modulo);
        const r = await fetch(`/api/gestao-geral/autorizacao/aluno/${alunoId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const d = await r.json();
        
        if (d.success && d.aluno) {
            est.currentAluno = d.aluno;
            exibirAlunoModulo(modulo, d);
            mostrarFormModulo(modulo);
        } else {
            notificar(d.error || 'Aluno não encontrado');
            if (est.modoAtual === 'automatico') reiniciarScannerModulo(modulo);
            else carregarAlunosTurmaModulo(modulo);
        }
    } catch (e) {
        console.error(e);
        notificar('Erro ao buscar aluno');
    }
}

function exibirAlunoModulo(modulo, data) {
    const P = getPrefixo(modulo);
    const aluno = data.aluno;
    
    const foto = safeGet(`alunoFoto${P}`);
    if (foto) {
        foto.onerror = null;
        foto.src = aluno.fotoPerfil || gerarAvatarSVG(aluno.nome);
        foto.onerror = function() { this.onerror = null; this.src = gerarAvatarSVG(aluno.nome); };
    }
    
    safeSetText(`alunoNome${P}`, aluno.nome || '-');
    safeSetText(`alunoMatricula${P}`, aluno.matricula || 'Não informada');
    safeSetText(`alunoTurma${P}`, aluno.turma || 'Não informada');
    safeSetText(`alunoCurso${P}`, aluno.curso || 'Não informado');
    
    const hist = safeGet(`historico${P}Aluno`);
    if (hist) {
        if (data.ultimasAutorizacoes?.length > 0) {
            hist.innerHTML = `
                <h6 class="text-muted mt-3 mb-2"><i class="fas fa-history"></i> Últimos Registros</h6>
                ${data.ultimasAutorizacoes.map(h => `
                    <div class="p-2 mb-2" style="background: #f8fafc; border-radius: 8px; font-size: 13px;">
                        <strong>${escapeHTML(h.motivoLabel)}</strong>
                        <br><small class="text-muted">
                            ${new Date(h.data).toLocaleDateString('pt-BR')}
                            ${h.horarioEntrada ? ` • Entrada: ${h.horarioEntrada}` : ''}
                            ${h.horarioSaida ? ` • Saída: ${h.horarioSaida}` : ''}
                        </small>
                    </div>`).join('')}`;
        } else { hist.innerHTML = ''; }
    }
    
    const infoEl = safeGet(`alunoInfo${P}`);
    if (infoEl) {
        infoEl.style.display = 'block';
        infoEl.scrollIntoView({ behavior: 'smooth' });
    }
}

function mostrarFormModulo(modulo) {
    const cfg = getCfg(modulo);
    const P = getPrefixo(modulo);
    const I = getPrefixoInput(modulo);
    
    const formEl = safeGet(`form${P}`);
    if (formEl) formEl.style.display = 'block';
    
    const motivoEl = safeGet(`${I}MotivoSelecionado`);
    if (motivoEl) motivoEl.value = '';
    estados[modulo].motivoSelecionado = null;
    document.querySelectorAll(`#form${P} .tipo-card`).forEach(c => c.classList.remove('selected'));
    
    const campos = [
        `${I}Data`, `${I}Horario`, `${I}MotivoOutros`,
        `${I}ResponsavelNome`, `${I}ResponsavelCPF`,
        `${I}ResponsavelTelefone`, `${I}Observacoes`,
        `${I}HorarioEntrada`, `${I}HorarioSaida`,
        `${I}DataEntrada`, `${I}DataSaida`,
        `${I}HorarioAusencia`, `${I}HorarioRetorno`,
        `${I}PeriodoFaltaInicio`, `${I}PeriodoFaltaFim`
    ];
    campos.forEach(id => { const el = safeGet(id); if (el) el.value = ''; });
    
    if (modulo === 'segundaChamada') {
        const inputTipoProva = safeGet('segundaChamadaTipoProvaPerdida');
        if (inputTipoProva) inputTipoProva.value = '';
        
        document.querySelectorAll('#campoSegundaChamadaTipoProva .tipo-card').forEach(c => c.classList.remove('selected'));
        
        const campoProvaOutros = safeGet('campoSegundaChamadaTipoProvaOutros');
        if (campoProvaOutros) campoProvaOutros.style.display = 'none';
        
        const inputProvaOutros = safeGet('segundaChamadaTipoProvaOutros');
        if (inputProvaOutros) inputProvaOutros.value = '';

        const inputPeriodo = safeGet('segundaChamadaPeriodoProva');
        if (inputPeriodo) inputPeriodo.value = '';
        document.querySelectorAll('#campoSegundaChamadaPeriodo .tipo-card').forEach(c => c.classList.remove('selected'));
    }
    
    if (modulo === 'uniforme') {
        const uIni = safeGet('uniformePeriodoInicio');
        const uFim = safeGet('uniformePeriodoFim');
        const uOutros = safeGet('uniformeMotivoOutros');
        const uData = safeGet('uniformeData');
        const uRespNome = safeGet('uniformeResponsavelNome');
        const uRespCPF = safeGet('uniformeResponsavelCPF');
        const uRespTel = safeGet('uniformeResponsavelTelefone');
        const uObs = safeGet('uniformeObservacoes');
        
        if (uIni) uIni.value = '';
        if (uFim) uFim.value = '';
        if (uOutros) uOutros.value = '';
        if (uRespNome) uRespNome.value = '';
        if (uRespCPF) uRespCPF.value = '';
        if (uRespTel) uRespTel.value = '';
        if (uObs) uObs.value = '';
    }
    
    const campoOutros = safeGet(`campo${P}Outros`);
    if (campoOutros) campoOutros.style.display = 'none';
    const campoAusencia = safeGet(`campo${P}AusenciaRetorno`);
    if (campoAusencia) campoAusencia.style.display = 'none';
    
    const dataEl = safeGet(`${I}Data`);
    if (dataEl) dataEl.value = getDataLocalISO();
    
    if (modulo === 'uniforme') {
        const uData = safeGet('uniformeData');
        if (uData && !uData.value) uData.value = getDataLocalISO();
    }
    
    limparAssinatura(modulo);
    
    limparEstadoSessaoAssinatura(modulo);
    const checkAssinatura = safeGet(`${modulo}NecessitaAssinatura`);
    if (checkAssinatura) checkAssinatura.checked = false;
    const blocoInfo = safeGet(`${modulo}BlocoAssinaturaInfo`);
    if (blocoInfo) { blocoInfo.style.display = 'none'; blocoInfo.innerHTML = ''; }
    
    setTimeout(() => {
        const canvas = safeGet(`${modulo}AssinaturaCanvas`);
        if (canvas && canvas.dataset.assinaturaInit !== 'true') {
            inicializarAssinatura(modulo);
        }
    }, 200);
    
    atualizarAvisoIntegracao(modulo);
    
    // 🆕 TRAVA A DATA DO REGISTRO (só para Autorização)
    if (modulo === 'autorizacao') {
        setTimeout(() => travarDataRegistroAutorizacao(), 100);
    }
}

/**
 * 🆕 Trava o campo Data do Registro para que seja SEMPRE a data atual.
 * Impede alteração por teclado, colar, menu do navegador etc.
 */
function travarDataRegistroAutorizacao() {
    const input = safeGet('autorizacaoData');
    if (!input) return;
    
    // Se já foi travado, não trava de novo
    if (input.dataset.travado === 'true') {
        // Mas garante que o valor continua sendo o de hoje
        input.value = getDataLocalISO();
        return;
    }
    input.dataset.travado = 'true';
    
    // 1) Garante valor inicial = hoje
    input.value = getDataLocalISO();
    
    // 2) Bloqueia teclas que alteram data
    input.addEventListener('keydown', (e) => {
        // Permite TAB, SHIFT+TAB, ENTER e ESC
        const teclasPermitidas = ['Tab', 'Enter', 'Escape'];
        if (teclasPermitidas.includes(e.key)) return;
        e.preventDefault();
    });
    
    // 3) Bloqueia colar (CTRL+V)
    input.addEventListener('paste', (e) => {
        e.preventDefault();
        notificar('🔒 A Data do Registro não pode ser alterada', 'warning', 2000);
    });
    
    // 4) Bloqueia corte (CTRL+X)
    input.addEventListener('cut', (e) => e.preventDefault());
    
    // 5) Se por algum motivo o valor mudar, reverte para hoje
    input.addEventListener('change', () => {
        const hoje = getDataLocalISO();
        if (input.value !== hoje) {
            input.value = hoje;
            notificar('🔒 A Data do Registro não pode ser alterada', 'warning', 2000);
        }
    });
    
    // 6) Bloqueia clique (redundante com pointer-events, mas garante)
    input.addEventListener('click', (e) => {
        e.preventDefault();
        input.blur();
    });
    
    // 7) Bloqueia foco via TAB (opcional — evita até o usuário chegar nele)
    input.addEventListener('focus', (e) => {
        // Mantém o valor atualizado ao ganhar foco (caso a página fique aberta dias)
        input.value = getDataLocalISO();
    });
}

function atualizarAvisoIntegracao(modulo) {
    const P = getPrefixo(modulo);
    const est = estados[modulo];
    const avisoEl = safeGet(`aviso${P}Justificativa`);
    if (!avisoEl) return;
    
    if (modulo === 'autorizacao') {
        const gera = MOTIVOS_AUTORIZACAO_GERAM_JUSTIFICATIVA[est.motivoSelecionado];
        avisoEl.style.display = gera ? 'flex' : 'none';
    } else if (modulo === 'segundaChamada') {
        avisoEl.style.display = 'flex';
    }
}

function selecionarMotivoModulo(modulo, motivo) {
    const P = getPrefixo(modulo);
    const I = getPrefixoInput(modulo);
    estados[modulo].motivoSelecionado = motivo;
    
    const el = safeGet(`${I}MotivoSelecionado`);
    if (el) el.value = motivo;
    
    document.querySelectorAll(`#form${P} .tipo-card`).forEach(c => c.classList.remove('selected'));
    const card = document.querySelector(`#form${P} .tipo-card[data-tipo="${motivo}"]`);
    if (card) card.classList.add('selected');
    
    const campoOutros = safeGet(`campo${P}Outros`);
    if (campoOutros) campoOutros.style.display = motivo === 'outros' ? 'block' : 'none';
    const campoAusencia = safeGet(`campo${P}AusenciaRetorno`);
    if (campoAusencia) campoAusencia.style.display = motivo === 'necessita_ausentar_retornar' ? 'block' : 'none';
    
    atualizarAvisoIntegracao(modulo);
}

// ============================================
// 🆕 TIPO DE PROVA PERDIDA (2ª chamada)
// ============================================
function selecionarTipoProvaPerdida(tipo) {
    const input = safeGet('segundaChamadaTipoProvaPerdida');
    if (input) input.value = tipo;
    
    document.querySelectorAll('#campoSegundaChamadaTipoProva .tipo-card').forEach(c => c.classList.remove('selected'));
    const card = document.querySelector(`#campoSegundaChamadaTipoProva .tipo-card[data-prova="${tipo}"]`);
    if (card) card.classList.add('selected');
    
    const campoOutros = safeGet('campoSegundaChamadaTipoProvaOutros');
    if (campoOutros) campoOutros.style.display = tipo === 'Outros' ? 'block' : 'none';
}

// 🆕 Período da prova
function selecionarPeriodoProva(periodo) {
    const input = safeGet('segundaChamadaPeriodoProva');
    if (input) input.value = periodo;
    
    document.querySelectorAll('#campoSegundaChamadaPeriodo .tipo-card').forEach(c => c.classList.remove('selected'));
    const card = document.querySelector(`#campoSegundaChamadaPeriodo .tipo-card[data-periodo="${periodo}"]`);
    if (card) card.classList.add('selected');
}
// ============================================
// REGISTRAR MÓDULO (COM ASSINATURA E INTEGRAÇÃO)
// ============================================
async function registrarModulo(modulo) {
    const cfg = getCfg(modulo);
    const est = estados[modulo];
    const P = getPrefixo(modulo);
    const I = getPrefixoInput(modulo);
    
    if (!est.motivoSelecionado) { 
        notificar('Selecione o motivo', 'error');
        return; 
    }
    
    const data = safeGet(`${I}Data`)?.value;
    if (!data) { 
        notificar('Preencha a data do registro', 'error');
        return; 
    }
    
    let periodoFaltaInicio = '';
    let periodoFaltaFim = '';
    
    if (cfg.tipo === 'justificativa' || cfg.tipo === 'segunda_chamada') {
        periodoFaltaInicio = safeGet(`${I}PeriodoFaltaInicio`)?.value || '';
        periodoFaltaFim = safeGet(`${I}PeriodoFaltaFim`)?.value || '';
        
        if (!periodoFaltaInicio) {
            notificar('Informe a data da falta (início)', 'error');
            return;
        }
        
        if (periodoFaltaFim && periodoFaltaFim < periodoFaltaInicio) {
            notificar('Data final não pode ser anterior à data inicial', 'error');
            return;
        }
    }
    
    let tipoProvaPerdida = null;
    let tipoProvaPerdidaOutros = '';
    let periodoProva = null;
    
    if (cfg.tipo === 'segunda_chamada') {
        tipoProvaPerdida = safeGet('segundaChamadaTipoProvaPerdida')?.value || '';
        tipoProvaPerdidaOutros = safeGet('segundaChamadaTipoProvaOutros')?.value || '';
        periodoProva = safeGet('segundaChamadaPeriodoProva')?.value || '';
        
        if (!tipoProvaPerdida) {
            notificar('Informe o tipo de prova perdida', 'error');
            return;
        }
        
        if (tipoProvaPerdida === 'Outros' && !tipoProvaPerdidaOutros.trim()) {
            notificar('Especifique o tipo de prova perdida', 'error');
            return;
        }

        if (!periodoProva) {
            notificar('Informe o período da prova', 'error');
            return;
        }
    }
    
    let uniformePeriodoInicio = null;
    let uniformePeriodoFim = null;
    
    if (cfg.tipo === 'uniforme') {
        uniformePeriodoInicio = safeGet('uniformePeriodoInicio')?.value || '';
        uniformePeriodoFim = safeGet('uniformePeriodoFim')?.value || '';
        
        if (!uniformePeriodoInicio) {
            notificar('Informe a data de início da autorização', 'error');
            return;
        }
        if (!uniformePeriodoFim) {
            notificar('Informe a data de término da autorização', 'error');
            return;
        }
        if (uniformePeriodoFim < uniformePeriodoInicio) {
            notificar('Data final não pode ser anterior à data inicial', 'error');
            return;
        }
    }
    
    if (est.motivoSelecionado === 'outros') {
        const motivoOutros = safeGet(`${I}MotivoOutros`)?.value.trim();
        if (!motivoOutros) { 
            notificar('Especifique o motivo', 'error');
            return; 
        }
    }
    if (est.motivoSelecionado === 'necessita_ausentar_retornar') {
        const ha = safeGet(`${I}HorarioAusencia`)?.value;
        const hr = safeGet(`${I}HorarioRetorno`)?.value;
        if (!ha || !hr) { 
            notificar('Informe os horários de ausência e retorno', 'error');
            return; 
        }
    }
    if (!est.currentAluno) { 
        notificar('Nenhum aluno selecionado', 'error');
        return; 
    }
    
    const responsavelCPF = safeGet(`${I}ResponsavelCPF`)?.value || '';
    const cpfObrigatorio = (cfg.tipo === 'justificativa' || cfg.tipo === 'segunda_chamada');
    const cpfPreenchido = responsavelCPF && responsavelCPF.trim() !== '';
    
    if (cpfObrigatorio && !cpfPreenchido) {
        notificar('⚠️ CPF do responsável é obrigatório!', 'error', 5000);
        safeGet(`${I}ResponsavelCPF`)?.focus();
        return;
    }
    
    if (cpfPreenchido) {
        const validacaoCPF = validarCPFCliente(responsavelCPF);
        if (!validacaoCPF.valido) {
            notificar(`⚠️ CPF inválido!\n\n${validacaoCPF.erro}`, 'error', 5000);
            safeGet(`${I}ResponsavelCPF`)?.focus();
            return;
        }
    }
    
    const precisaAssinatura = safeGet(`${modulo}NecessitaAssinatura`)?.checked || false;
    const assinaturaBase64 = estadoSessaoAssinatura[modulo]?.assinaturaCapturada || '';
    const sessaoAssinaturaId = estadoSessaoAssinatura[modulo]?.sessaoId || null;
    
    if (precisaAssinatura && !assinaturaBase64) {
        notificar('⚠️ Aguardando assinatura do responsável!', 'warning', 5000);
        reabrirModalAssinatura(modulo);
        return;
    }
    
    const btn = document.querySelector(`#form${P} .btn-primary-custom`);
    if (btn) btn.disabled = true;
    
    try {
        const body = {
            tipo: cfg.tipo,
            alunoId: est.currentAluno.id,
            data,
            periodoFaltaInicio: periodoFaltaInicio || undefined,
            periodoFaltaFim: periodoFaltaFim || undefined,
            tipoProvaPerdida: tipoProvaPerdida || undefined,
            tipoProvaPerdidaOutros: tipoProvaPerdidaOutros || undefined,
            periodoProva: periodoProva || undefined,
            uniformePeriodoInicio: uniformePeriodoInicio || undefined,
            uniformePeriodoFim: uniformePeriodoFim || undefined,
            horarioEntrada: safeGet(`${I}HorarioEntrada`)?.value || '',
            horarioSaida: safeGet(`${I}HorarioSaida`)?.value || '',
            dataEntrada: cfg.tipo === 'autorizacao' ? (safeGet(`${I}DataEntrada`)?.value || null) : null,  // 🆕
            dataSaida: cfg.tipo === 'autorizacao' ? (safeGet(`${I}DataSaida`)?.value || null) : null,        // 🆕
            responsavelNome: safeGet(`${I}ResponsavelNome`)?.value || '',
            responsavelCPF: responsavelCPF,
            responsavelTelefone: safeGet(`${I}ResponsavelTelefone`)?.value || '',
            motivo: est.motivoSelecionado,
            motivoOutros: safeGet(`${I}MotivoOutros`)?.value || '',
            horarioAusencia: safeGet(`${I}HorarioAusencia`)?.value || '',
            horarioRetorno: safeGet(`${I}HorarioRetorno`)?.value || '',
            observacoes: safeGet(`${I}Observacoes`)?.value || '',
            assinaturaBase64: assinaturaBase64,
            precisaAssinatura: precisaAssinatura,
            sessaoAssinaturaId: sessaoAssinaturaId
        };
        
        const r = await fetch('/api/gestao-geral/autorizacao/registrar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(body)
        });
        const d = await r.json();
        
        if (r.status === 409 || (d.error && d.error.includes('Já existe'))) {
            let msg = '⚠️ Registro duplicado detectado!\n\n';
            msg += d.error || 'Já existe um registro com os mesmos dados.';
            if (d.duplicado) {
                msg += `\n\n📌 Registrado por: ${d.duplicado.registradoPor || 'N/D'}`;
                msg += `\n📅 Data: ${d.duplicado.data ? new Date(d.duplicado.data).toLocaleDateString('pt-BR') : 'N/D'}`;
                msg += `\n👤 CPF: ${d.duplicado.responsavelCPF || 'N/D'}`;
            }
            notificar(msg, 'warning', 7000);
            if (btn) btn.disabled = false;
            return;
        }
        
        if (!d.success) {
            notificar('❌ ' + (d.error || 'Erro'), 'error');
            return;
        }
        
        const sessaoId = estadoSessaoAssinatura[modulo]?.sessaoId;
        if (sessaoId) {
            fetch(`/api/gestao-geral/sessoes-assinatura/${sessaoId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            }).catch(e => console.warn(e));
        }
        pararMonitoramentoSessao(modulo);
        fecharModalAssinatura(modulo);
        limparEstadoSessaoAssinatura(modulo);
        
        let justificativaCriada = false;
        
        if (modulo === 'autorizacao') {
            const motivoJustificativa = MOTIVOS_AUTORIZACAO_GERAM_JUSTIFICATIVA[est.motivoSelecionado];
            if (motivoJustificativa) {
                justificativaCriada = await criarJustificativaAutomatica({
                    alunoId: est.currentAluno.id,
                    data,
                    periodoFaltaInicio: data,
                    periodoFaltaFim: data,
                    motivo: motivoJustificativa,
                    motivoOutros: safeGet(`${I}MotivoOutros`)?.value || '',
                    responsavelNome: safeGet(`${I}ResponsavelNome`)?.value || '',
                    responsavelCPF: responsavelCPF,
                    responsavelTelefone: safeGet(`${I}ResponsavelTelefone`)?.value || '',
                    observacoes: `Gerada automaticamente a partir de ${cfg.nomeAmigavel}: ${d.autorizacao.motivoLabel || ''} | ${safeGet(`${I}Observacoes`)?.value || ''}`.trim(),
                    origemTipo: 'autorizacao',
                    origemId: d.autorizacao.id,
                    assinaturaBase64: assinaturaBase64
                });
            }
        }
        
        if (modulo === 'segundaChamada') {
            const motivoJustificativa = MOTIVOS_SEGUNDA_CHAMADA_PARA_JUSTIFICATIVA[est.motivoSelecionado] || 'outros';
            justificativaCriada = await criarJustificativaAutomatica({
                alunoId: est.currentAluno.id,
                data,
                periodoFaltaInicio,
                periodoFaltaFim,
                motivo: motivoJustificativa,
                motivoOutros: safeGet(`${I}MotivoOutros`)?.value || '',
                responsavelNome: safeGet(`${I}ResponsavelNome`)?.value || '',
                responsavelCPF: responsavelCPF,
                responsavelTelefone: safeGet(`${I}ResponsavelTelefone`)?.value || '',
                observacoes: `Gerada automaticamente a partir de 2ª Chamada | ${safeGet(`${I}Observacoes`)?.value || ''}`.trim(),
                origemTipo: 'segunda_chamada',
                origemId: d.autorizacao.id,
                assinaturaBase64: assinaturaBase64
            });
        }
        
        let msg = `✅ ${d.message}`;
        if (justificativaCriada) msg += ' — Justificativa criada automaticamente!';
        notificar(msg, 'success');
        
        const imprimir = await confirm('Deseja IMPRIMIR agora?');
        if (imprimir) imprimirModulo(modulo, d.autorizacao.id);
        
        limparTelaModulo(modulo);
        carregarListaModulo(modulo, 1);
        
        if (justificativaCriada) carregarListaModulo('justificativa', 1);
        
        if (est.modoAtual === 'automatico') reiniciarScannerModulo(modulo);
    } catch (e) {
        console.error(e);
        notificar('Erro ao registrar', 'error');
    } finally { 
        if (btn) btn.disabled = false; 
    }
}

// ============================================================================
// 🎨 CANVAS DE ASSINATURA (FUNÇÕES AUXILIARES)
// ============================================================================

/**
 * Redimensiona o canvas quando a tela gira ou muda de tamanho.
 * Preserva o conteúdo desenhado quando já tem assinatura.
 */
function handleResizeCanvasTela() {
    const canvas = safeGet('canvasAssinatura');
    const wrapper = safeGet('canvasWrapper');
    
    if (!canvas || !wrapper) return;
    
    if (!telaTemAssinatura) {
        const rect = wrapper.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
        
        const ctx = canvas.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#1e3c72';
        telaCtx = ctx;
    } else {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(canvas, 0, 0);
        
        const rect = wrapper.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
        
        const ctx = canvas.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#1e3c72';
        telaCtx = ctx;
        
        ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height, 0, 0, rect.width, rect.height);
    }
}

/**
 * Inicializa o canvas de assinatura e configura os listeners de mouse/toque.
 */
function inicializarCanvasTela() {
    const canvas = safeGet('canvasAssinatura');
    const wrapper = safeGet('canvasWrapper');
    const placeholder = safeGet('placeholder');
    if (!canvas || !wrapper) return;
    
    telaCanvas = canvas;
    telaWrapper = wrapper;
    telaPlaceholder = placeholder;
    telaTemAssinatura = false;
    telaDesenhando = false;
    
    const ajustar = () => {
        const rect = wrapper.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) { 
            setTimeout(ajustar, 200); 
            return; 
        }
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
        const ctx = canvas.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#1e3c72';
        telaCtx = ctx;
    };
    ajustar();
    
    window.removeEventListener('resize', handleResizeCanvasTela);
    window.addEventListener('resize', handleResizeCanvasTela);
    
    const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        let cx, cy;
        if (e.touches?.length > 0) { 
            cx = e.touches[0].clientX; 
            cy = e.touches[0].clientY; 
        } else if (e.changedTouches?.length > 0) { 
            cx = e.changedTouches[0].clientX; 
            cy = e.changedTouches[0].clientY; 
        } else { 
            cx = e.clientX; 
            cy = e.clientY; 
        }
        return { x: cx - rect.left, y: cy - rect.top };
    };
    
    const iniciar = (e) => {
        e.preventDefault();
        telaDesenhando = true;
        telaTemAssinatura = true;
        const p = getPos(e);
        telaLastX = p.x;
        telaLastY = p.y;
        wrapper.style.borderColor = '#1e3c72';
        wrapper.style.borderStyle = 'solid';
        if (placeholder) placeholder.style.opacity = '0';
        
        const btn = safeGet('btnSalvarAssinatura');
        if (btn) {
            btn.disabled = false;
            btn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
            btn.style.cursor = 'pointer';
        }
    };
    
    const desenhar = (e) => {
        if (!telaDesenhando) return;
        e.preventDefault();
        const p = getPos(e);
        telaCtx.beginPath();
        telaCtx.moveTo(telaLastX, telaLastY);
        telaCtx.lineTo(p.x, p.y);
        telaCtx.stroke();
        telaLastX = p.x;
        telaLastY = p.y;
    };
    
    const parar = (e) => {
        if (e?.preventDefault) e.preventDefault();
        telaDesenhando = false;
    };
    
    canvas.addEventListener('touchstart', iniciar, { passive: false });
    canvas.addEventListener('touchmove', desenhar, { passive: false });
    canvas.addEventListener('touchend', parar, { passive: false });
    canvas.addEventListener('touchcancel', parar, { passive: false });
    canvas.addEventListener('mousedown', iniciar);
    canvas.addEventListener('mousemove', desenhar);
    canvas.addEventListener('mouseup', parar);
    canvas.addEventListener('mouseleave', () => { 
        if (telaDesenhando) parar(); 
    });
}

/**
 * Limpa o canvas de assinatura e reseta o estado.
 */
function limparAssinaturaTela() {
    if (!telaCtx || !telaCanvas) return;
    const rect = telaCanvas.getBoundingClientRect();
    telaCtx.clearRect(0, 0, rect.width, rect.height);
    telaTemAssinatura = false;
    if (telaPlaceholder) telaPlaceholder.style.opacity = '1';
    if (telaWrapper) {
        telaWrapper.style.borderColor = '#cbd5e0';
        telaWrapper.style.borderStyle = 'dashed';
    }
    const btn = safeGet('btnSalvarAssinatura');
    if (btn) {
        btn.disabled = true;
        btn.style.background = '#cbd5e0';
        btn.style.cursor = 'not-allowed';
    }
}

/**
 * Salva a assinatura no backend (envia base64).
 */
async function salvarAssinaturaTela() {
    if (!telaTemAssinatura || !sessaoAssinaturaModo) return;
    
    const btn = safeGet('btnSalvarAssinatura');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
    }
    
    try {
        const base64 = telaCanvas.toDataURL('image/png');
        
        // ⚠️ Rota PÚBLICA — sem token (o responsável não está logado)
        const response = await fetch(`/api/gestao-geral/sessoes-assinatura/${sessaoAssinaturaModo}/assinar`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                assinaturaBase64: base64,
                assinanteNome: 'Responsável'
            })
        });
        
        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Erro ao salvar');
        
        safeGet('telaAssinaturaInfo').innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px; text-align: center; width: 100%;">
                <i class="fas fa-check-circle" style="font-size: 56px; color: #10b981; margin-bottom: 15px; display: block;"></i>
                <h2 style="color: #10b981; margin: 0 0 8px; font-size: 20px;">Assinatura Confirmada!</h2>
                <p style="color: #64748b; margin: 0 0 20px; font-size: 14px; line-height: 1.5;">
                    A assinatura foi registrada com sucesso.<br>
                    Você já pode fechar esta janela.
                </p>
                <button onclick="window.close()" 
                        style="padding: 12px 28px; background: #1e3c72; color: white; border: none; border-radius: 10px; font-weight: 600; cursor: pointer; font-size: 14px; display: inline-flex; align-items: center; gap: 8px;">
                    <i class="fas fa-times"></i> Fechar
                </button>
            </div>
        `;
        safeGet('telaAssinaturaArea').style.display = 'none';
        
        const telaInfo = safeGet('telaAssinaturaInfo');
        if (telaInfo) {
            telaInfo.style.flex = '1';
            telaInfo.style.display = 'flex';
            telaInfo.style.alignItems = 'center';
            telaInfo.style.justifyContent = 'center';
            telaInfo.style.maxHeight = 'none';
            telaInfo.style.borderLeft = 'none';
            telaInfo.style.borderRadius = '0 0 16px 16px';
        }
        
    } catch (e) {
        console.error('Erro ao salvar assinatura:', e);
        notificar('❌ ' + e.message, 'error');
        
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-check"></i> Confirmar Assinatura';
        }
    }
}

async function criarJustificativaAutomatica(params) {
    try {
        const {
            alunoId, data, motivo, motivoOutros = '',
            responsavelNome = '', responsavelCPF = '', responsavelTelefone = '',
            observacoes = '', origemTipo, origemId, assinaturaBase64 = '',
            periodoFaltaInicio = '', periodoFaltaFim = ''
        } = params;
        
        const body = {
            tipo: 'justificativa',
            alunoId,
            data,
            periodoFaltaInicio: periodoFaltaInicio || data,
            periodoFaltaFim: periodoFaltaFim || periodoFaltaInicio || data,
            motivo,
            motivoOutros,
            responsavelNome,
            responsavelCPF,
            responsavelTelefone,
            observacoes,
            assinaturaBase64,
            origemTipo,
            origemId
        };
        
        const r = await fetch('/api/gestao-geral/autorizacao/registrar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(body)
        });
        const d = await r.json();
        
        if (d.success) {
            console.log(`✅ Justificativa automática criada: ${d.autorizacao.id}`);
            return true;
        } else {
            console.warn(`⚠️ Erro ao criar justificativa automática: ${d.error}`);
            return false;
        }
    } catch (e) {
        console.error('Erro na integração automática:', e);
        return false;
    }
}

function limparTelaModulo(modulo) {
    const P = getPrefixo(modulo);
    const infoEl = safeGet(`alunoInfo${P}`);
    const formEl = safeGet(`form${P}`);
    if (infoEl) infoEl.style.display = 'none';
    if (formEl) formEl.style.display = 'none';
    estados[modulo].currentAluno = null;
    estados[modulo].motivoSelecionado = null;
    limparAssinatura(modulo);
    
    const sessaoId = estadoSessaoAssinatura[modulo]?.sessaoId;
    if (sessaoId) {
        fetch(`/api/gestao-geral/sessoes-assinatura/${sessaoId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        }).catch(e => console.warn(e));
    }
    pararMonitoramentoSessao(modulo);
    fecharModalAssinatura(modulo);
    limparEstadoSessaoAssinatura(modulo);
    
    const checkAssinatura = safeGet(`${modulo}NecessitaAssinatura`);
    if (checkAssinatura) checkAssinatura.checked = false;
    const blocoInfo = safeGet(`${modulo}BlocoAssinaturaInfo`);
    if (blocoInfo) { blocoInfo.style.display = 'none'; blocoInfo.innerHTML = ''; }
}

function reiniciarScannerModulo(modulo) {
    setTimeout(() => {
        if (!estados[modulo].scannerAtivo && estados[modulo].modoAtual === 'automatico') {
            iniciarScannerModulo(modulo);
        }
    }, 1000);
}

// ============================================
// LISTAR MÓDULO - COM PAGINAÇÃO + FILTRO POR PERÍODO DA FALTA
// ============================================
async function carregarListaModulo(modulo, pagina = null) {
    const cfg = getCfg(modulo);
    const container = safeGet(cfg.containerLista);
    if (!container) return;

    const pag = paginacaoModuloState[modulo];
    if (pagina === null) pagina = pag.paginaAtual;
    pag.paginaAtual = pagina;

    await carregarOpcoesFiltrosLista(modulo);

    const P = getPrefixo(modulo);
    const alunoNome = safeGet(`filtroLista${P}Aluno`)?.value || '';
    const turma = safeGet(`filtroLista${P}Turma`)?.value || '';
    const motivo = safeGet(`filtroLista${P}Motivo`)?.value || '';
    const dataInicio = safeGet(`filtroLista${P}DataInicio`)?.value || '';
    const dataFim = safeGet(`filtroLista${P}DataFim`)?.value || '';
    const tipoProvaPerdida = safeGet(`filtroLista${P}TipoProva`)?.value || '';
    const periodoProvaFiltro = safeGet(`filtroLista${P}PeriodoProva`)?.value || '';

    let dataInicioFinal = dataInicio;
    let dataFimFinal = dataFim;

    if (dataInicio && !dataFim) dataFimFinal = dataInicio;
    if (dataFim && !dataInicio) dataInicioFinal = dataFim;

    const limit = pag.porPagina;
    let url = `/api/gestao-geral/autorizacao/listar?tipo=${cfg.tipo}&limit=${limit}&page=${pagina}`;
    if (alunoNome) url += `&alunoNome=${encodeURIComponent(alunoNome)}`;
    if (turma) url += `&turma=${encodeURIComponent(turma)}`;
    if (motivo) url += `&motivo=${encodeURIComponent(motivo)}`;
    if (dataInicioFinal) url += `&dataInicio=${dataInicioFinal}`;
    if (dataFimFinal) url += `&dataFim=${dataFimFinal}`;
    if (tipoProvaPerdida && tipoProvaPerdida !== 'todos') url += `&tipoProvaPerdida=${encodeURIComponent(tipoProvaPerdida)}`;
    if (periodoProvaFiltro && periodoProvaFiltro !== 'todos') url += `&periodoProva=${encodeURIComponent(periodoProvaFiltro)}`;

    if (cfg.tipo === 'justificativa' || cfg.tipo === 'segunda_chamada') {
        url += `&filtrarPorPeriodoFalta=true`;
    }

    container.innerHTML = `
        <div class="text-center py-3">
            <div class="loading-spinner"></div>
            <p>Carregando ${cfg.nomeAmigavel.toLowerCase()}...</p>
        </div>`;

    try {
        const r = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();

        if (!d.success || !d.autorizacoes || d.autorizacoes.length === 0) {
            container.innerHTML = `<p class="text-muted text-center py-3">
                <i class="fas fa-inbox" style="font-size: 32px; color: #cbd5e1; display: block; margin-bottom: 10px;"></i>
                Nenhum registro de ${cfg.nomeAmigavel.toLowerCase()} encontrado.
            </p>`;
            pag.totalRegistros = 0;
            pag.totalPaginas = 0;
            return;
        }

        pag.totalRegistros = d.total || 0;
        pag.totalPaginas = d.totalPages || 1;

        const mostraHorario = cfg.tipo === 'autorizacao';
        const cabecalhoHorarios = mostraHorario 
            ? '<th>Entrada</th><th>Saída</th>' 
            : '<th>Horário</th>';
        
        const mostrarPeriodoFalta = cfg.tipo === 'justificativa' || cfg.tipo === 'segunda_chamada';
        const mostrarTipoProva = cfg.tipo === 'segunda_chamada';
        const mostraUniforme = cfg.tipo === 'uniforme';

        // ESTILOS COMPACTOS APLICADOS AQUI
        const thStyle = 'padding: 10px 6px; text-align: left; border-bottom: 2px solid #dee2e6; font-weight: 600; color: #495057; white-space: nowrap; background: #f8f9fa; font-size: 12px;';
        const tdStyle = 'padding: 10px 6px; vertical-align: middle; border-bottom: 1px solid #dee2e6; white-space: nowrap; font-size: 12px;';

        container.innerHTML = `
            <div style="overflow-x: hidden; width: 100%;">
                <table class="table table-hover" style="width: 100%; border-collapse: collapse; margin-bottom: 0; table-layout: auto;">
                    <thead>
                        <tr>
                            <th style="${thStyle}">Data Registro</th>
                            ${mostrarPeriodoFalta ? `<th style="${thStyle}">Período da Falta</th>` : ''}
                            ${mostraUniforme ? `<th style="${thStyle}">Período do Uniforme</th>` : ''}
                            ${mostrarTipoProva ? `<th style="${thStyle}">Tipo de Prova</th>` : ''}
                            ${mostrarTipoProva ? `<th style="${thStyle}">Período</th>` : ''}
                            <th style="${thStyle}">Aluno</th>
                            <th style="${thStyle}">Turma</th>
                            ${cabecalhoHorarios}
                            <th style="${thStyle}">Motivo</th>
                            <th style="${thStyle}">Responsável</th>
                            <th style="${thStyle} text-align: center;">Assin.</th>
                            <th style="${thStyle} text-align: center;">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${d.autorizacoes.map(a => {
                            // ENTRADA
                            let celulaEntrada = '<span style="color: #6c757d;">-</span>';
                            if (cfg.tipo === 'autorizacao') {
                                const dE = a.dataEntradaFormatada || '';
                                const hE = a.horarioEntrada || '';
                                if (dE && hE) {
                                    celulaEntrada = `<div style="line-height: 1.2;"><strong>${dE}</strong><br><small style="color: #6c757d;">${hE}</small></div>`;
                                } else if (dE) {
                                    celulaEntrada = `<strong>${dE}</strong>`;
                                } else if (hE) {
                                    celulaEntrada = `<small>${hE}</small>`;
                                }
                            }
                            
                            // SAÍDA
                            let celulaSaida = '<span style="color: #6c757d;">-</span>';
                            if (cfg.tipo === 'autorizacao') {
                                const dS = a.dataSaidaFormatada || '';
                                const hS = a.horarioSaida || '';
                                if (dS && hS) {
                                    celulaSaida = `<div style="line-height: 1.2;"><strong>${dS}</strong><br><small style="color: #6c757d;">${hS}</small></div>`;
                                } else if (dS) {
                                    celulaSaida = `<strong>${dS}</strong>`;
                                } else if (hS) {
                                    celulaSaida = `<small>${hS}</small>`;
                                }
                            }
                            
                            return `
                                <tr>
                                    <td style="${tdStyle}">${a.dataFormatada}</td>
                                    ${mostrarPeriodoFalta 
                                        ? `<td style="${tdStyle}"><strong style="color: #1e3c72;">${a.periodoFaltaFormatado || '-'}</strong></td>` 
                                        : ''}
                                    ${mostraUniforme 
                                        ? `<td style="${tdStyle}"><strong style="color: #1e3c72;">${a.uniformePeriodoFormatado || '-'}</strong></td>` 
                                        : ''}
                                    ${mostrarTipoProva 
                                        ? `<td style="${tdStyle}"><span class="badge bg-warning text-dark">${escapeHTML(a.tipoProvaPerdidaFormatado || a.tipoProvaPerdida || '-')}</span></td>` 
                                        : ''}
                                    ${mostrarTipoProva 
                                        ? `<td style="${tdStyle}"><span class="badge bg-primary">${escapeHTML(a.periodoProvaFormatado || a.periodoProva || '-')}</span></td>` 
                                        : ''}
                                    
                                    <td style="${tdStyle}"><strong>${escapeHTML(a.alunoNome)}</strong></td>
                                    <td style="${tdStyle}">${escapeHTML(a.alunoTurma)}</td>
                                    
                                    ${mostraHorario 
                                        ? `<td style="${tdStyle}">${celulaEntrada}</td><td style="${tdStyle}">${celulaSaida}</td>`
                                        : `<td style="${tdStyle}">${a.horarioEntrada || '-'}</td>`}
                                    
                                    <td style="${tdStyle}; white-space: normal; max-width: 140px;">
                                        <span class="badge bg-info text-dark" style="white-space: normal; display: inline-block; text-align: center; line-height: 1.2; font-size: 10px; padding: 4px 6px;">
                                            ${escapeHTML(a.motivoLabel)}
                                        </span>
                                    </td>
                                    
                                    <td style="${tdStyle}; white-space: normal; min-width: 150px;">
                                        ${a.responsavelNome ? `
                                            <div style="font-size:11px; line-height: 1.2;">
                                                <strong>${escapeHTML(a.responsavelNome)}</strong>
                                                ${a.responsavelCPF ? `<br><small style="color: #6c757d;">CPF: ${escapeHTML(a.responsavelCPF)}</small>` : ''}
                                                ${a.responsavelTelefone ? `<br><small style="color: #6c757d;">Tel: ${escapeHTML(a.responsavelTelefone)}</small>` : ''}
                                            </div>` : '<span style="color: #6c757d;">-</span>'}
                                    </td>
                                    
                                    <td style="${tdStyle} text-align: center;">
                                        ${a.temAssinatura 
                                            ? '<span class="badge bg-success" title="Assinado" style="padding: 4px 6px;"><i class="fas fa-signature"></i></span>' 
                                            : '<span class="badge bg-secondary">Sem</span>'}
                                    </td>
                                    
                                    <td style="${tdStyle} text-align: center;">
                                        <div style="display: flex; flex-direction: row; gap: 2px; justify-content: center;">
                                            <button class="btn btn-sm btn-info" onclick="verAtraso('${a.id}')" title="Ver detalhes" style="padding: 3px 5px; font-size: 11px;">
                                                <i class="fas fa-eye"></i>
                                            </button>
                                            <button class="btn btn-sm btn-primary" onclick="imprimirModulo('${modulo}', '${a.id}')" title="Imprimir" style="padding: 3px 5px; font-size: 11px;">
                                                <i class="fas fa-print"></i>
                                            </button>
                                            <button class="btn btn-sm btn-warning" onclick="abrirEditarModulo('${modulo}', '${a.id}')" title="Editar" style="padding: 3px 5px; font-size: 11px;">
                                                <i class="fas fa-edit"></i>
                                            </button>
                                            <button class="btn btn-sm btn-danger" onclick="excluirModulo('${modulo}', '${a.id}')" title="Excluir" style="padding: 3px 5px; font-size: 11px;">
                                                <i class="fas fa-trash"></i>
                                            </button>
                                        </div>
                                    </td>
                                </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>
            ${renderizarPaginacaoModulo(modulo)}
        `;
    } catch (e) {
        console.error(`❌ Erro ao carregar ${cfg.nomeAmigavel}:`, e);
        container.innerHTML = `
            <div class="text-center py-3">
                <p class="text-danger"><i class="fas fa-exclamation-triangle"></i> Erro ao carregar.</p>
                <button class="btn btn-sm btn-outline-primary" onclick="carregarListaModulo('${modulo}', 1)">
                    <i class="fas fa-sync-alt"></i> Tentar novamente
                </button>
            </div>`;
    }
}

// 🆕 Renderiza a barra de paginação dos módulos
function renderizarPaginacaoModulo(modulo) {
    const pag = paginacaoModuloState[modulo];
    const { paginaAtual, totalPaginas, totalRegistros, porPagina } = pag;

    if (totalPaginas <= 1) {
        return `<p class="text-muted text-end mt-2"><small>${totalRegistros} registro(s) encontrado(s)</small></p>`;
    }

    const maxBotoes = 5;
    let inicio = Math.max(1, paginaAtual - Math.floor(maxBotoes / 2));
    let fim = Math.min(totalPaginas, inicio + maxBotoes - 1);

    if (fim - inicio + 1 < maxBotoes) {
        inicio = Math.max(1, fim - maxBotoes + 1);
    }

    let botoes = '';

    botoes += paginaAtual > 1
        ? `<li class="page-item"><a class="page-link" href="#" onclick="event.preventDefault(); carregarListaModulo('${modulo}', 1)" title="Primeira"><i class="fas fa-angle-double-left"></i></a></li>`
        : `<li class="page-item disabled"><span class="page-link"><i class="fas fa-angle-double-left"></i></span></li>`;

    botoes += paginaAtual > 1
        ? `<li class="page-item"><a class="page-link" href="#" onclick="event.preventDefault(); carregarListaModulo('${modulo}', ${paginaAtual - 1})" title="Anterior"><i class="fas fa-angle-left"></i></a></li>`
        : `<li class="page-item disabled"><span class="page-link"><i class="fas fa-angle-left"></i></span></li>`;

    if (inicio > 1) {
        botoes += `<li class="page-item disabled"><span class="page-link">…</span></li>`;
    }

    for (let i = inicio; i <= fim; i++) {
        botoes += i === paginaAtual
            ? `<li class="page-item active"><span class="page-link">${i}</span></li>`
            : `<li class="page-item"><a class="page-link" href="#" onclick="event.preventDefault(); carregarListaModulo('${modulo}', ${i})">${i}</a></li>`;
    }

    if (fim < totalPaginas) {
        botoes += `<li class="page-item disabled"><span class="page-link">…</span></li>`;
    }

    botoes += paginaAtual < totalPaginas
        ? `<li class="page-item"><a class="page-link" href="#" onclick="event.preventDefault(); carregarListaModulo('${modulo}', ${paginaAtual + 1})" title="Próxima"><i class="fas fa-angle-right"></i></a></li>`
        : `<li class="page-item disabled"><span class="page-link"><i class="fas fa-angle-right"></i></span></li>`;

    botoes += paginaAtual < totalPaginas
        ? `<li class="page-item"><a class="page-link" href="#" onclick="event.preventDefault(); carregarListaModulo('${modulo}', ${totalPaginas})" title="Última"><i class="fas fa-angle-double-right"></i></a></li>`
        : `<li class="page-item disabled"><span class="page-link"><i class="fas fa-angle-double-right"></i></span></li>`;

    const de = (paginaAtual - 1) * porPagina + 1;
    const ate = Math.min(paginaAtual * porPagina, totalRegistros);

    return `
        <div class="paginacao-modulo" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-top: 16px; padding-top: 12px; border-top: 1px solid #e5e7eb;">
            <small class="text-muted">
                Mostrando <strong>${de}</strong>–<strong>${ate}</strong> de <strong>${totalRegistros}</strong> registros
            </small>
            <nav aria-label="Paginação">
                <ul class="pagination pagination-sm mb-0" style="gap: 2px;">
                    ${botoes}
                </ul>
            </nav>
        </div>
    `;
}

async function carregarOpcoesFiltrosLista(modulo) {
    const P = getPrefixo(modulo);
    const cfg = getCfg(modulo);

    const selectTurma = safeGet(`filtroLista${P}Turma`);
    if (selectTurma && selectTurma.options.length <= 1) {
        try {
            const r = await fetch('/api/gestao-geral/autorizacao/turmas', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const d = await r.json();
            if (d.success) {
                d.turmas.forEach(t => {
                    selectTurma.innerHTML += `<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`;
                });
            }
        } catch (e) { console.warn(e); }
    }

    const selectMotivo = safeGet(`filtroLista${P}Motivo`);
    if (selectMotivo && selectMotivo.options.length <= 1) {
        const motivos = getMotivosPorTipo(cfg.tipo);
        motivos.forEach(m => {
            selectMotivo.innerHTML += `<option value="${m.valor}">${m.label}</option>`;
        });
    }
}

function getMotivosPorTipo(tipo) {
    if (tipo === 'autorizacao') {
        return [
            { valor: 'problemas_pessoais', label: 'Problemas Pessoais' },
            { valor: 'problemas_saude_responsavel_buscou', label: 'Problemas de Saúde (Responsável veio buscar)' },
            { valor: 'problemas_saude_responsavel_whatsapp', label: 'Problemas de Saúde (Responsável via WhatsApp)' },
            { valor: 'necessita_ausentar_retornar', label: 'Necessita se ausentar e retornar' },
            { valor: 'viagens', label: 'Viagens' },
            { valor: 'consultas', label: 'Consultas' },
            { valor: 'outros', label: 'Outros' }
        ];
    }
    // 🆕 UNIFORME
    if (tipo === 'uniforme') {
        return [
            { valor: 'problemas_saude', label: 'Problemas de Saúde' },
            { valor: 'problemas_pessoais', label: 'Problemas Pessoais' },
            { valor: 'tratamento_medico', label: 'Tratamento Médico' },
            { valor: 'outros', label: 'Outros' }
        ];
    }
    return [
        { valor: 'problemas_pessoais', label: 'Problemas Pessoais' },
        { valor: 'problemas_saude', label: 'Problemas de Saúde' },
        { valor: 'viagem', label: 'Viagem' },
        { valor: 'outros', label: 'Outros' }
    ];
}

// ============================================
// DASHBOARD DOS MÓDULOS
// ============================================
// ============================================
// DASHBOARD DOS MÓDULOS (COM SUPORTE AO UNIFORME)
// ============================================
async function carregarDashboardModulo(modulo) {
    const cfg = getCfg(modulo);
    const P = getPrefixo(modulo);

    console.log(`📊 Carregando dashboard de ${modulo}...`);

    try {
        const r = await fetch(`/api/gestao-geral/autorizacao/dashboard?tipo=${cfg.tipo}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (!data.success) {
            console.error('Erro no dashboard:', data.error);
            return;
        }

        safeSetText(`${P}TotalHoje`, data.metricas?.hoje ?? 0);
        safeSetText(`${P}TotalSemana`, data.metricas?.semana ?? 0);
        safeSetText(`${P}TotalMes`, data.metricas?.mes ?? 0);
        safeSetText(`${P}TotalGeral`, data.metricas?.total ?? 0);

        // 🆕 Para UNIFORME: métricas extras
        if (modulo === 'uniforme') {
            const comAssinatura = data.metricas?.comAssinatura ?? 0;
            const totalGeral = data.metricas?.total ?? 0;
            const semAssinatura = Math.max(0, totalGeral - comAssinatura);
            const percentual = totalGeral > 0 ? Math.round((comAssinatura / totalGeral) * 100) : 0;

            safeSetText('UniformeTotalComAssinatura', comAssinatura);
            safeSetText('UniformeTotalSemAssinatura', semAssinatura);
            safeSetText('UniformePercentualAssinatura', `${percentual}%`);
        }

        // Gráfico de motivos
        const ctxMotivos = safeGet(`${P}ChartMotivos`);
        if (ctxMotivos && data.porMotivo) {
            if (dashboardChartsModulo[modulo].motivos) {
                try { dashboardChartsModulo[modulo].motivos.destroy(); } catch(e){}
            }
            dashboardChartsModulo[modulo].motivos = new Chart(ctxMotivos.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: data.porMotivo.map(m => m.label),
                    datasets: [{
                        data: data.porMotivo.map(m => m.count),
                        backgroundColor: ['#1e3c72', '#2a5298', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe']
                    }]
                },
                options: { responsive: true, maintainAspectRatio: true }
            });
        }

        // Gráfico de registros por dia (7 dias)
        const ctxAtrasos = safeGet(`${P}ChartAtrasos`);
        if (ctxAtrasos && data.tendencias?.ultimos7Dias) {
            if (dashboardChartsModulo[modulo].atrasos) {
                try { dashboardChartsModulo[modulo].atrasos.destroy(); } catch(e){}
            }
            dashboardChartsModulo[modulo].atrasos = new Chart(ctxAtrasos.getContext('2d'), {
                type: 'line',
                data: {
                    labels: data.tendencias.ultimos7Dias.map(d => d.dia),
                    datasets: [{
                        label: 'Registros',
                        data: data.tendencias.ultimos7Dias.map(d => d.atrasos),
                        borderColor: '#1e3c72',
                        backgroundColor: 'rgba(30, 60, 114, 0.1)',
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: { responsive: true, maintainAspectRatio: true }
            });
        }

        // Gráfico por turma
        const ctxTurmas = safeGet(`${P}ChartTurmas`);
        if (ctxTurmas && data.tendencias?.porTurma) {
            if (dashboardChartsModulo[modulo].turmas) {
                try { dashboardChartsModulo[modulo].turmas.destroy(); } catch(e){}
            }
            dashboardChartsModulo[modulo].turmas = new Chart(ctxTurmas.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: data.tendencias.porTurma.map(t => t.turma),
                    datasets: [{
                        label: 'Registros',
                        data: data.tendencias.porTurma.map(t => t.count),
                        backgroundColor: '#2a5298',
                        borderRadius: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: { legend: { display: false } }
                }
            });
        }

        // 🆕 Gráfico de distribuição por período do uniforme
        if (modulo === 'uniforme') {
            const ctxPeriodo = safeGet('UniformeChartPeriodo');
            if (ctxPeriodo && data.porPeriodoUniforme) {
                if (dashboardChartsModulo[modulo].periodo) {
                    try { dashboardChartsModulo[modulo].periodo.destroy(); } catch(e){}
                }
                if (data.porPeriodoUniforme.length === 0) {
                    const parent = ctxPeriodo.parentElement;
                    if (parent) {
                        parent.innerHTML = `<h6 class="card-title"><i class="fas fa-calendar-alt"></i> Distribuição por Período (Mês/Ano)</h6>
                            <p class="text-muted text-center py-4"><i class="fas fa-info-circle"></i> Nenhum período registrado</p>`;
                    }
                } else {
                    dashboardChartsModulo[modulo].periodo = new Chart(ctxPeriodo.getContext('2d'), {
                        type: 'bar',
                        data: {
                            labels: data.porPeriodoUniforme.map(p => p.label),
                            datasets: [{
                                label: 'Autorizações',
                                data: data.porPeriodoUniforme.map(p => p.count),
                                backgroundColor: '#3b82f6',
                                borderRadius: 8
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: true,
                            plugins: { legend: { display: false } },
                            scales: {
                                y: { beginAtZero: true, ticks: { stepSize: 1 } }
                            }
                        }
                    });
                }
            }
        }

        // Reincidentes
        const reinc = safeGet(`${P}AlunosReincidentes`);
        if (reinc) {
            const lista = data.tendencias?.alunosReincidentes || [];
            if (lista.length > 0) {
                reinc.innerHTML = `
                    <div class="table-responsive">
                        <table class="table table-sm">
                            <thead><tr><th>Aluno</th><th>Turma</th><th>Registros</th></tr></thead>
                            <tbody>${lista.map(a => `
                                <tr>
                                    <td><strong>${escapeHTML(a.alunoNome || '')}</strong></td>
                                    <td>${escapeHTML(a.alunoTurma || '-')}</td>
                                    <td><span class="badge bg-danger">${a.count || 0}</span></td>
                                </tr>`).join('')}
                            </tbody>
                        </table>
                    </div>`;
            } else {
                reinc.innerHTML = `<p class="text-muted text-center py-3">
                    <i class="fas fa-check-circle text-success"></i> Nenhum aluno reincidente
                </p>`;
            }
        }

        console.log(`✅ Dashboard ${modulo} carregado`);
    } catch (error) {
        console.error(`Erro no dashboard ${cfg.nomeAmigavel}:`, error);
    }
}

// ============================================
// ✏️ EDITAR MÓDULO
// ============================================
async function abrirEditarModulo(modulo, id) {
    if (!modulo || !id) return;

    const cfg = getCfg(modulo);

    try {
        const r = await fetch(`/api/gestao-geral/autorizacao/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const d = await r.json();

        if (!d.success || !d.autorizacao) {
            notificar('Erro ao carregar registro');
            return;
        }

        const a = d.autorizacao;
        const old = safeGet('modalEditarModulo');
        if (old) old.remove();

        const motivos = getMotivosPorTipo(cfg.tipo);
        const motivosOptions = motivos.map(m =>
            `<option value="${m.valor}" ${a.motivo === m.valor ? 'selected' : ''}>${m.label}</option>`
        ).join('');

        let dataInput = '';
        if (a.data) {
            dataInput = getDataLocalISO(new Date(a.data));
        }
        
        let periodoInicioInput = '';
        let periodoFimInput = '';
        if (a.periodoFaltaInicio) periodoInicioInput = getDataLocalISO(new Date(a.periodoFaltaInicio));
        if (a.periodoFaltaFim) periodoFimInput = getDataLocalISO(new Date(a.periodoFaltaFim));

        let uniformeInicioInput = '';
        let uniformeFimInput = '';
        if (a.uniformePeriodoInicio) uniformeInicioInput = getDataLocalISO(new Date(a.uniformePeriodoInicio));
        if (a.uniformePeriodoFim) uniformeFimInput = getDataLocalISO(new Date(a.uniformePeriodoFim));

        // 🆕 Entrada/Saída (Autorização)
        let dataEntradaInput = '';
        let dataSaidaInput = '';
        if (a.dataEntrada) dataEntradaInput = getDataLocalISO(new Date(a.dataEntrada));
        if (a.dataSaida) dataSaidaInput = getDataLocalISO(new Date(a.dataSaida));
        
        const mostrarPeriodoFalta = cfg.tipo === 'justificativa' || cfg.tipo === 'segunda_chamada';
        const mostrarTipoProva = cfg.tipo === 'segunda_chamada';
        const mostraUniforme = cfg.tipo === 'uniforme';
        const mostraEntradaSaida = cfg.tipo === 'autorizacao';
        
        const cpfObrigatorio = cfg.tipo === 'justificativa' || cfg.tipo === 'segunda_chamada';
        const cpfLabelHTML = cpfObrigatorio
            ? 'CPF <span class="text-danger">*</span>'
            : 'CPF <small class="text-muted">(opcional)</small>';
        
        // 🆕 BLOCO DE DATA PARA AUTORIZAÇÃO (Apenas Registro, Entrada e Saída)
        const blocoDataAutorizacao = mostraEntradaSaida ? `
            <div class="row mb-3">
                <div class="col-md-4 mb-3">
                    <label class="form-label">Data do Registro</label>
                    <input type="date" id="editModuloData" class="form-control" value="${dataInput}" disabled style="background-color: #e9ecef;">
                    <small class="text-muted">Data em que foi cadastrado</small>
                </div>
                <div class="col-md-4 mb-3">
                    <label class="form-label"><i class="fas fa-sign-in-alt text-success"></i> Data de Entrada</label>
                    <input type="date" id="editModuloDataEntrada" class="form-control" value="${dataEntradaInput}">
                </div>
                <div class="col-md-4 mb-3">
                    <label class="form-label"><i class="fas fa-sign-out-alt text-danger"></i> Data de Saída</label>
                    <input type="date" id="editModuloDataSaida" class="form-control" value="${dataSaidaInput}">
                </div>
            </div>
            <div class="row mb-3">
                <div class="col-md-6 mb-3">
                    <label class="form-label">Horário de Entrada</label>
                    <input type="time" id="editModuloHorarioEntrada" class="form-control" value="${a.horarioEntrada || ''}">
                </div>
                <div class="col-md-6 mb-3">
                    <label class="form-label">Horário de Saída</label>
                    <input type="time" id="editModuloHorarioSaida" class="form-control" value="${a.horarioSaida || ''}">
                </div>
            </div>
        ` : '';

        // Bloco para Justificativa / 2ª Chamada
        const blocoPeriodoFalta = mostrarPeriodoFalta ? `
            <div class="row">
                <div class="col-md-4 mb-3">
                    <label class="form-label">Data da Falta (Início) <span class="text-danger">*</span></label>
                    <input type="date" id="editModuloPeriodoFaltaInicio" class="form-control" value="${periodoInicioInput}" required>
                </div>
                <div class="col-md-4 mb-3">
                    <label class="form-label">Data da Falta (Fim)</label>
                    <input type="date" id="editModuloPeriodoFaltaFim" class="form-control" value="${periodoFimInput}">
                    <small class="text-muted">Deixe vazio se for 1 dia só</small>
                </div>
                <div class="col-md-4 mb-3">
                    <label class="form-label">Data do Registro</label>
                    <input type="date" id="editModuloData" class="form-control" value="${dataInput}" disabled style="background-color: #e9ecef;">
                </div>
            </div>
        ` : mostraUniforme ? `
            <div class="row">
                <div class="col-md-4 mb-3">
                    <label class="form-label">Início do Uniforme <span class="text-danger">*</span></label>
                    <input type="date" id="editModuloUniformeInicio" class="form-control" value="${uniformeInicioInput}" required>
                </div>
                <div class="col-md-4 mb-3">
                    <label class="form-label">Término do Uniforme <span class="text-danger">*</span></label>
                    <input type="date" id="editModuloUniformeFim" class="form-control" value="${uniformeFimInput}" required>
                </div>
                <div class="col-md-4 mb-3">
                    <label class="form-label">Data do Registro</label>
                    <input type="date" id="editModuloData" class="form-control" value="${dataInput}" disabled style="background-color: #e9ecef;">
                </div>
            </div>
        ` : '';
        
        const blocoTipoProva = mostrarTipoProva ? `
            <div class="mb-3">
                <label class="form-label">Tipo de Prova Perdida <span class="text-danger">*</span></label>
                <select id="editModuloTipoProva" class="form-select" onchange="toggleEditTipoProvaOutros()">
                    <option value="">Selecione...</option>
                    <option value="AV1" ${a.tipoProvaPerdida === 'AV1' ? 'selected' : ''}>AV1</option>
                    <option value="AV2" ${a.tipoProvaPerdida === 'AV2' ? 'selected' : ''}>AV2</option>
                    <option value="AV3" ${a.tipoProvaPerdida === 'AV3' ? 'selected' : ''}>AV3</option>
                    <option value="AV4" ${a.tipoProvaPerdida === 'AV4' ? 'selected' : ''}>AV4</option>
                    <option value="Recuperação" ${a.tipoProvaPerdida === 'Recuperação' ? 'selected' : ''}>Recuperação</option>
                    <option value="Outros" ${a.tipoProvaPerdida === 'Outros' ? 'selected' : ''}>Outros</option>
                </select>
            </div>
            <div id="editCampoTipoProvaOutros" style="display: ${a.tipoProvaPerdida === 'Outros' ? 'block' : 'none'};">
                <div class="mb-3">
                    <label class="form-label">Especifique o Tipo de Prova</label>
                    <input type="text" id="editModuloTipoProvaOutros" class="form-control" value="${escapeHTML(a.tipoProvaPerdidaOutros || '')}">
                </div>
            </div>
            <div class="mb-3">
                <label class="form-label">Período da Prova <span class="text-danger">*</span></label>
                <select id="editModuloPeriodoProva" class="form-select">
                    <option value="">Selecione...</option>
                    <option value="1º Período" ${a.periodoProva === '1º Período' ? 'selected' : ''}>1º Período</option>
                    <option value="2º Período" ${a.periodoProva === '2º Período' ? 'selected' : ''}>2º Período</option>
                    <option value="3º Período" ${a.periodoProva === '3º Período' ? 'selected' : ''}>3º Período</option>
                    <option value="4º Período" ${a.periodoProva === '4º Período' ? 'selected' : ''}>4º Período</option>
                </select>
            </div>
        ` : '';

        const modalHtml = `
            <div class="modal fade" id="modalEditarModulo" tabindex="-1">
                <div class="modal-dialog modal-lg modal-dialog-scrollable">
                    <div class="modal-content">
                        <div class="modal-header" style="background: linear-gradient(135deg, #1e3c72, #2a5298); color: white;">
                            <h5 class="modal-title">
                                <i class="fas fa-edit"></i> Editar ${cfg.nomeAmigavel}
                            </h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <input type="hidden" id="editModuloId" value="${a.id}">
                            <input type="hidden" id="editModuloTipo" value="${modulo}">

                            <div style="display: flex; align-items: center; gap: 12px; padding: 12px; background: #eef2ff; border-radius: 10px; margin-bottom: 16px;">
                                <img src="${gerarAvatarSVG(a.alunoNome)}" style="width: 50px; height: 50px; border-radius: 50%;" alt="">
                                <div style="flex: 1;">
                                    <h5 style="margin: 0; color: #1e3c72;">${escapeHTML(a.alunoNome)}</h5>
                                    <small style="color: #6b7280;">
                                        <i class="fas fa-id-card"></i> ${escapeHTML(a.alunoMatricula || '-')} • 
                                        <i class="fas fa-graduation-cap"></i> ${escapeHTML(a.alunoTurma || '-')}
                                    </small>
                                </div>
                            </div>

                            ${blocoDataAutorizacao}
                            ${blocoPeriodoFalta}
                            ${blocoTipoProva}

                            <div class="mb-3">
                                <label class="form-label">Motivo <span class="text-danger">*</span></label>
                                <select id="editModuloMotivo" class="form-select" onchange="toggleEditMotivoOutros()">
                                    ${motivosOptions}
                                </select>
                            </div>

                            <div id="editCampoOutros" style="display: ${a.motivo === 'outros' ? 'block' : 'none'};">
                                <div class="mb-3">
                                    <label class="form-label">Especifique o Motivo</label>
                                    <input type="text" id="editModuloMotivoOutros" class="form-control" value="${escapeHTML(a.motivoOutros || '')}">
                                </div>
                            </div>

                            ${cfg.tipo === 'autorizacao' ? `
                                <div id="editCampoAusenciaRetorno" style="display: ${a.motivo === 'necessita_ausentar_retornar' ? 'block' : 'none'};">
                                    <div class="row">
                                        <div class="col-md-6 mb-3">
                                            <label class="form-label">Horário de Ausência</label>
                                            <input type="time" id="editModuloHorarioAusencia" class="form-control" value="${a.horarioAusencia || ''}">
                                        </div>
                                        <div class="col-md-6 mb-3">
                                            <label class="form-label">Horário de Retorno</label>
                                            <input type="time" id="editModuloHorarioRetorno" class="form-control" value="${a.horarioRetorno || ''}">
                                        </div>
                                    </div>
                                </div>
                            ` : ''}

                            <div class="card mb-3" style="background: #f8fafc; border: 1px solid #e2e8f0;">
                                <div class="card-body">
                                    <h6 style="margin-bottom: 15px; color: #1e3c72;">
                                        <i class="fas fa-user-shield"></i> Dados do Responsável
                                    </h6>
                                    <div class="row">
                                        <div class="col-md-6 mb-3">
                                            <label class="form-label">Nome do Responsável</label>
                                            <input type="text" id="editModuloResponsavelNome" class="form-control" value="${escapeHTML(a.responsavelNome || '')}">
                                        </div>
                                        <div class="col-md-3 mb-3">
                                            <label class="form-label">${cpfLabelHTML}</label>
                                            <input type="text" id="editModuloResponsavelCPF" class="form-control" value="${escapeHTML(a.responsavelCPF || '')}" maxlength="14" oninput="formatarCPF(this)">
                                        </div>
                                        <div class="col-md-3 mb-3">
                                            <label class="form-label">Telefone</label>
                                            <input type="text" id="editModuloResponsavelTelefone" class="form-control" value="${escapeHTML(a.responsavelTelefone || '')}" maxlength="15" oninput="formatarTelefone(this)">
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div class="mb-3">
                                <label class="form-label">Observações</label>
                                <textarea id="editModuloObservacoes" class="form-control" rows="3">${escapeHTML(a.observacoes || '')}</textarea>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                                <i class="fas fa-times"></i> Cancelar
                            </button>
                            <button type="button" class="btn btn-primary" onclick="salvarEdicaoModulo()">
                                <i class="fas fa-save"></i> Salvar Alterações
                            </button>
                        </div>
                    </div>
                </div>
            </div>`;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        new bootstrap.Modal(safeGet('modalEditarModulo')).show();
    } catch (error) {
        console.error('Erro:', error);
        notificar('Erro ao carregar registro para edição');
    }
}

function toggleEditMotivoOutros() {
    const motivo = safeGet('editModuloMotivo')?.value;
    const campo = safeGet('editCampoOutros');
    if (campo) campo.style.display = motivo === 'outros' ? 'block' : 'none';

    const campoAusencia = safeGet('editCampoAusenciaRetorno');
    if (campoAusencia) campoAusencia.style.display = motivo === 'necessita_ausentar_retornar' ? 'block' : 'none';
}

// ============================================
// 🆕 TOGGLE TIPO DE PROVA OUTROS (2ª Chamada)
// ============================================
function toggleEditTipoProvaOutros() {
    const tipoProva = safeGet('editModuloTipoProva')?.value;
    const campo = safeGet('editCampoTipoProvaOutros');
    if (campo) {
        campo.style.display = tipoProva === 'Outros' ? 'block' : 'none';
    }
}

async function salvarEdicaoModulo() {
    const id = safeGet('editModuloId')?.value;
    const modulo = safeGet('editModuloTipo')?.value;
    const cfg = getCfg(modulo);
    
    const data = safeGet('editModuloData')?.value;
    const motivo = safeGet('editModuloMotivo')?.value;
    const motivoOutros = safeGet('editModuloMotivoOutros')?.value || '';
    const responsavelNome = safeGet('editModuloResponsavelNome')?.value || '';
    const responsavelCPF = safeGet('editModuloResponsavelCPF')?.value || '';
    const responsavelTelefone = safeGet('editModuloResponsavelTelefone')?.value || '';
    const observacoes = safeGet('editModuloObservacoes')?.value || '';
    const horarioAusencia = safeGet('editModuloHorarioAusencia')?.value || '';
    const horarioRetorno = safeGet('editModuloHorarioRetorno')?.value || '';

    const horarioEntrada = safeGet('editModuloHorarioEntrada')?.value || safeGet('editModuloHorario')?.value || '';
    const horarioSaida = safeGet('editModuloHorarioSaida')?.value || '';

    if (!motivo) {
        notificar('Preencha o motivo');
        return;
    }
    
    let periodoFaltaInicio = '';
    let periodoFaltaFim = '';
    
    if (cfg.tipo === 'justificativa' || cfg.tipo === 'segunda_chamada') {
        periodoFaltaInicio = safeGet('editModuloPeriodoFaltaInicio')?.value || '';
        periodoFaltaFim = safeGet('editModuloPeriodoFaltaFim')?.value || '';
        
        if (!periodoFaltaInicio) {
            notificar('Informe a data da falta (início)');
            return;
        }
        
        if (periodoFaltaFim && periodoFaltaFim < periodoFaltaInicio) {
            notificar('Data final não pode ser anterior à data inicial');
            return;
        }
    } else if (cfg.tipo === 'uniforme') {
        const uIni = safeGet('editModuloUniformeInicio')?.value || '';
        const uFim = safeGet('editModuloUniformeFim')?.value || '';
        
        if (!uIni) { notificar('Informe a data de início do uniforme'); return; }
        if (!uFim) { notificar('Informe a data de término do uniforme'); return; }
        if (uFim < uIni) { notificar('Data final não pode ser anterior à data inicial'); return; }
    } else {
        if (!data) {
            notificar('Preencha a data');
            return;
        }
    }
    
    let tipoProvaPerdida = null;
    let tipoProvaPerdidaOutros = '';
    let periodoProva = null;
    
    if (cfg.tipo === 'segunda_chamada') {
        tipoProvaPerdida = safeGet('editModuloTipoProva')?.value || '';
        tipoProvaPerdidaOutros = safeGet('editModuloTipoProvaOutros')?.value || '';
        periodoProva = safeGet('editModuloPeriodoProva')?.value || '';
        
        if (!tipoProvaPerdida) { notificar('Informe o tipo de prova perdida'); return; }
        if (tipoProvaPerdida === 'Outros' && !tipoProvaPerdidaOutros.trim()) {
            notificar('Especifique o tipo de prova perdida');
            return;
        }
        if (!periodoProva) { notificar('Informe o período da prova'); return; }
    }

    if (motivo === 'outros' && !motivoOutros.trim()) {
        notificar('Especifique o motivo "Outros"');
        return;
    }
    
    const cpfObrigatorio = (cfg.tipo === 'justificativa' || cfg.tipo === 'segunda_chamada');
    const cpfPreenchido = responsavelCPF && responsavelCPF.trim() !== '';
    
    if (cpfObrigatorio && !cpfPreenchido) {
        notificar('⚠️ CPF do responsável é obrigatório!', 'error', 5000);
        safeGet('editModuloResponsavelCPF')?.focus();
        return;
    }
    
    if (cpfPreenchido) {
        const validacaoCPF = validarCPFCliente(responsavelCPF);
        if (!validacaoCPF.valido) {
            notificar(`⚠️ CPF inválido!\n\n${validacaoCPF.erro}`, 'error', 5000);
            safeGet('editModuloResponsavelCPF')?.focus();
            return;
        }
    }

    try {
        const body = {
            motivo,
            motivoOutros,
            responsavelNome,
            responsavelCPF,
            responsavelTelefone,
            observacoes,
            horarioEntrada,
            horarioSaida,
            horarioAusencia,
            horarioRetorno
        };
        
        if (cfg.tipo === 'autorizacao' && data) {
            body.data = data;
        }

        // 🆕 ENTRADA / SAÍDA (só autorização)
        if (cfg.tipo === 'autorizacao') {
            body.dataEntrada = safeGet('editModuloDataEntrada')?.value || null;
            body.dataSaida = safeGet('editModuloDataSaida')?.value || null;
        }
        
        if (cfg.tipo === 'justificativa' || cfg.tipo === 'segunda_chamada') {
            body.periodoFaltaInicio = periodoFaltaInicio;
            body.periodoFaltaFim = periodoFaltaFim || periodoFaltaInicio;
        }
        
        if (cfg.tipo === 'uniforme') {
            body.uniformePeriodoInicio = safeGet('editModuloUniformeInicio')?.value || '';
            body.uniformePeriodoFim = safeGet('editModuloUniformeFim')?.value || '';
        }
        
        if (cfg.tipo === 'segunda_chamada') {
            body.tipoProvaPerdida = tipoProvaPerdida;
            body.tipoProvaPerdidaOutros = tipoProvaPerdidaOutros;
            body.periodoProva = periodoProva;
        }

        const response = await fetch(`/api/gestao-geral/autorizacao/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(body)
        });
        const result = await response.json();

        if (response.status === 409 || (result.error && result.error.includes('Já existe'))) {
            let msg = '⚠️ Registro duplicado detectado!\n\n';
            msg += result.error || 'Já existe outro registro com os mesmos dados.';
            if (result.duplicado) {
                msg += `\n\n📌 Registrado por: ${result.duplicado.registradoPor || 'N/D'}`;
                msg += `\n📅 Data: ${result.duplicado.data ? new Date(result.duplicado.data).toLocaleDateString('pt-BR') : 'N/D'}`;
                msg += `\n👤 CPF: ${result.duplicado.responsavelCPF || 'N/D'}`;
            }
            notificar(msg, 'warning', 7000);
            return;
        }

        if (result.success) {
            const modal = bootstrap.Modal.getInstance(safeGet('modalEditarModulo'));
            if (modal) modal.hide();

            notificar('✅ Registro atualizado com sucesso!', 'success');
            carregarListaModulo(modulo, 1);
        } else {
            notificar('❌ ' + (result.error || 'Erro ao salvar'));
        }
    } catch (error) {
        console.error('Erro:', error);
        notificar('Erro ao salvar alterações');
    }
}

// ============================================
// RELATÓRIOS DOS MÓDULOS
// ============================================
function toggleRelatorioFiltrosModulo(modulo) {
    const P = getPrefixo(modulo);
    const tipo = safeGet(`${P}TipoRelatorio`)?.value;
    if (!tipo) return;

    const divTurma = safeGet(`${P}FiltroTurmaDiv`);
    const divAluno = safeGet(`${P}FiltroAlunoDiv`);

    if (divTurma) divTurma.style.display = tipo === 'turma' ? 'block' : 'none';
    if (divAluno) divAluno.style.display = tipo === 'aluno' ? 'block' : 'none';

    const btnCSV = safeGet(`btnExportarCSV${P}`);
    const btnPDF = safeGet(`btnExportarPDF${P}`);
    if (btnCSV) btnCSV.disabled = true;
    if (btnPDF) btnPDF.disabled = true;
    relatoriosModulo[modulo] = null;

    if (tipo === 'turma') {
        const sel = safeGet(`${P}FiltroTurma`);
        if (sel && sel.options.length <= 1) carregarTurmasFiltroModulo(modulo);
    }
    if (tipo === 'aluno') {
        inicializarAutocompleteAlunoModulo(modulo);
        setTimeout(() => safeGet(`${P}BuscaAlunoRelatorio`)?.focus(), 100);
        if (!autocompleteModuloState[modulo].carregado) {
            carregarAlunosParaRelatorioModulo(modulo);
        }
    }
}

async function carregarTurmasFiltroModulo(modulo) {
    const P = getPrefixo(modulo);
    const select = safeGet(`${P}FiltroTurma`);
    if (!select || select.options.length > 1) return;

    try {
        const r = await fetch('/api/gestao-geral/autorizacao/turmas', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const d = await r.json();
        if (d.success) {
            select.innerHTML = '<option value="">Selecione...</option>';
            d.turmas.forEach(t => {
                select.innerHTML += `<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`;
            });
        }
    } catch (e) { console.warn(e); }
}

function inicializarAutocompleteAlunoModulo(modulo) {
    const P = getPrefixo(modulo);
    const input = safeGet(`${P}BuscaAlunoRelatorio`);
    const listEl = safeGet(`${P}AutocompleteAlunoList`);
    const hiddenInput = safeGet(`${P}FiltroAluno`);

    if (!input || !listEl || !hiddenInput) return;

    if (input.dataset.autocompleteInit === 'true') {
        if (!autocompleteModuloState[modulo].carregado) {
            carregarAlunosParaRelatorioModulo(modulo);
        }
        return;
    }
    input.dataset.autocompleteInit = 'true';

    input.addEventListener('input', (e) => {
        const termo = e.target.value.trim();
        hiddenInput.value = '';
        const infoEl = safeGet(`${P}AlunoSelecionadoInfo`);
        if (infoEl) infoEl.textContent = '';
        if (termo.length < 1) { listEl.style.display = 'none'; return; }
        filtrarAlunosAutocompleteModulo(modulo, termo);
    });

    input.addEventListener('focus', () => {
        const termo = input.value.trim();
        if (termo.length >= 1) {
            filtrarAlunosAutocompleteModulo(modulo, termo);
        } else if (!autocompleteModuloState[modulo].carregado) {
            carregarAlunosParaRelatorioModulo(modulo);
        }
    });

    input.addEventListener('keydown', (e) => {
        const state = autocompleteModuloState[modulo];
        if (listEl.style.display === 'none') return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            state.indice = Math.min(state.indice + 1, state.filtrados.length - 1);
            destacarItemAutocompleteModulo(modulo);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            state.indice = Math.max(state.indice - 1, -1);
            destacarItemAutocompleteModulo(modulo);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (state.indice >= 0 && state.filtrados[state.indice]) {
                selecionarAlunoAutocompleteModulo(modulo, state.filtrados[state.indice]);
            }
        } else if (e.key === 'Escape') {
            listEl.style.display = 'none';
        }
    });

    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !listEl.contains(e.target)) {
            listEl.style.display = 'none';
        }
    });

    if (!autocompleteModuloState[modulo].carregado) {
        carregarAlunosParaRelatorioModulo(modulo);
    }
}

async function carregarAlunosParaRelatorioModulo(modulo) {
    const state = autocompleteModuloState[modulo];
    if (state.carregado && state.alunos.length > 0) return;
    if (state.carregando) return;

    state.carregando = true;

    const P = getPrefixo(modulo);
    const inputBusca = safeGet(`${P}BuscaAlunoRelatorio`);
    if (inputBusca && !inputBusca.dataset.carregado) {
        inputBusca.placeholder = 'Carregando alunos...';
    }

    try {
        const turmasRes = await fetch('/api/gestao-geral/autorizacao/turmas', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const turmasData = await turmasRes.json();
        if (!turmasData.success) {
            state.carregando = false;
            return;
        }

        const todosAlunos = [];
        for (const turma of turmasData.turmas) {
            try {
                const res = await fetch(
                    `/api/gestao-geral/autorizacao/alunos-por-turma?turma=${encodeURIComponent(turma)}`,
                    { headers: { 'Authorization': `Bearer ${token}` } }
                );
                const data = await res.json();
                if (data.success && data.alunos) {
                    data.alunos.forEach(a => todosAlunos.push({
                        id: a.id,
                        nome: a.nome,
                        matricula: a.matricula || '',
                        turma: a.turma || turma,
                        curso: a.curso || ''
                    }));
                }
            } catch (e) { console.warn('Erro turma:', turma, e); }
        }

        todosAlunos.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
        state.alunos = todosAlunos;
        state.carregado = true;

        if (inputBusca) {
            inputBusca.placeholder = 'Digite o nome do aluno...';
            inputBusca.dataset.carregado = 'true';
        }
        console.log(`✅ ${todosAlunos.length} alunos carregados para ${modulo}`);
    } catch (error) {
        console.error(`Erro ao carregar alunos (${modulo}):`, error);
    } finally {
        state.carregando = false;
    }
}

function filtrarAlunosAutocompleteModulo(modulo, termo) {
    const P = getPrefixo(modulo);
    const listEl = safeGet(`${P}AutocompleteAlunoList`);
    const state = autocompleteModuloState[modulo];
    if (!listEl) return;

    if (!state.carregado) {
        listEl.innerHTML = `<div class="autocomplete-aluno-loading">Carregando...</div>`;
        listEl.style.display = 'block';
        carregarAlunosParaRelatorioModulo(modulo).then(() => {
            if (state.carregado) filtrarAlunosAutocompleteModulo(modulo, termo);
        });
        return;
    }

    const termoLower = termo.toLowerCase();
    state.filtrados = state.alunos.filter(a =>
        (a.nome || '').toLowerCase().includes(termoLower) ||
        (a.matricula || '').toLowerCase().includes(termoLower)
    ).slice(0, 10);

    state.indice = -1;

    if (state.filtrados.length === 0) {
        listEl.innerHTML = `<div class="autocomplete-aluno-empty">Nenhum aluno encontrado</div>`;
        listEl.style.display = 'block';
        return;
    }

    listEl.innerHTML = state.filtrados.map((aluno, index) => {
        const nomeDestacado = destacarTermo(aluno.nome, termo);
        const matricula = aluno.matricula ? `<span class="aluno-matricula">${escapeHTML(aluno.matricula)}</span>` : '';
        return `
            <div class="autocomplete-aluno-item" data-index="${index}">
                <div class="aluno-nome">${nomeDestacado}</div>
                <div class="aluno-info">
                    <span class="aluno-turma">${escapeHTML(aluno.turma || 'Sem turma')}</span>
                    ${matricula}
                </div>
            </div>`;
    }).join('');

    listEl.querySelectorAll('.autocomplete-aluno-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const index = parseInt(item.getAttribute('data-index'));
            if (state.filtrados[index]) {
                selecionarAlunoAutocompleteModulo(modulo, state.filtrados[index]);
            }
        });
        item.addEventListener('mouseenter', () => {
            state.indice = parseInt(item.getAttribute('data-index'));
            destacarItemAutocompleteModulo(modulo);
        });
    });

    listEl.style.display = 'block';
}

function destacarItemAutocompleteModulo(modulo) {
    const P = getPrefixo(modulo);
    const listEl = safeGet(`${P}AutocompleteAlunoList`);
    const state = autocompleteModuloState[modulo];
    if (!listEl) return;

    listEl.querySelectorAll('.autocomplete-aluno-item').forEach((item, i) => {
        if (i === state.indice) {
            item.classList.add('selected');
            item.scrollIntoView({ block: 'nearest' });
        } else {
            item.classList.remove('selected');
        }
    });
}

function selecionarAlunoAutocompleteModulo(modulo, aluno) {
    if (!aluno) return;
    const P = getPrefixo(modulo);
    const input = safeGet(`${P}BuscaAlunoRelatorio`);
    const hiddenInput = safeGet(`${P}FiltroAluno`);
    const listEl = safeGet(`${P}AutocompleteAlunoList`);
    const infoEl = safeGet(`${P}AlunoSelecionadoInfo`);

    if (input) input.value = aluno.nome;
    if (hiddenInput) hiddenInput.value = aluno.id;
    if (listEl) listEl.style.display = 'none';
    if (infoEl) {
        const mat = aluno.matricula ? ` • ${aluno.matricula}` : '';
        infoEl.innerHTML = `✅ <strong>${escapeHTML(aluno.nome)}</strong>${mat} — Turma ${escapeHTML(aluno.turma || '-')}`;
        infoEl.style.color = '#1e3c72';
    }
}

async function carregarRelatorioModulo(modulo) {
    const cfg = getCfg(modulo);
    const P = getPrefixo(modulo);

    const tipo = safeGet(`${P}TipoRelatorio`)?.value || 'geral';
    const dataInicio = safeGet(`${P}DataInicio`)?.value || '';
    const dataFim = safeGet(`${P}DataFim`)?.value || '';
    const tipoProvaPerdida = safeGet(`${P}FiltroTipoProva`)?.value || '';
    const periodoProvaFiltro = safeGet(`${P}FiltroPeriodoProva`)?.value || '';

    let url = '';
    if (tipo === 'geral') {
        url = `/api/gestao-geral/autorizacao/relatorio/geral?tipo=${cfg.tipo}&`;
        if (dataInicio) url += `dataInicio=${dataInicio}&`;
        if (dataFim) url += `dataFim=${dataFim}&`;
        if (tipoProvaPerdida && tipoProvaPerdida !== 'todos') url += `tipoProvaPerdida=${encodeURIComponent(tipoProvaPerdida)}&`;
        if (periodoProvaFiltro && periodoProvaFiltro !== 'todos') url += `periodoProva=${encodeURIComponent(periodoProvaFiltro)}&`;
    } else if (tipo === 'turma') {
        const turma = safeGet(`${P}FiltroTurma`)?.value;
        if (!turma) { notificar('Selecione uma turma', 'warning'); return; }
        url = `/api/gestao-geral/autorizacao/relatorio/turma/${encodeURIComponent(turma)}?tipo=${cfg.tipo}&`;
        if (dataInicio) url += `dataInicio=${dataInicio}&`;
        if (dataFim) url += `dataFim=${dataFim}&`;
        if (tipoProvaPerdida && tipoProvaPerdida !== 'todos') url += `tipoProvaPerdida=${encodeURIComponent(tipoProvaPerdida)}&`;
        if (periodoProvaFiltro && periodoProvaFiltro !== 'todos') url += `periodoProva=${encodeURIComponent(periodoProvaFiltro)}&`;
    } else if (tipo === 'aluno') {
        const alunoId = safeGet(`${P}FiltroAluno`)?.value;
        if (!alunoId) { notificar('Selecione um aluno', 'warning'); return; }
        url = `/api/gestao-geral/autorizacao/relatorio/aluno/${alunoId}?tipo=${cfg.tipo}&`;
        if (dataInicio) url += `dataInicio=${dataInicio}&`;
        if (dataFim) url += `dataFim=${dataFim}&`;
        if (tipoProvaPerdida && tipoProvaPerdida !== 'todos') url += `tipoProvaPerdida=${encodeURIComponent(tipoProvaPerdida)}&`;
        if (periodoProvaFiltro && periodoProvaFiltro !== 'todos') url += `periodoProva=${encodeURIComponent(periodoProvaFiltro)}&`;
    }

    try {
        const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await response.json();
        
        if (data.success) {
            relatoriosModulo[modulo] = data;
            exibirRelatorioModulo(modulo, data, tipo);
            
            const btnCSV = safeGet(`btnExportarCSV${P}`);
            const btnPDF = safeGet(`btnExportarPDF${P}`);
            if (btnCSV) btnCSV.disabled = false;
            if (btnPDF) btnPDF.disabled = false;
            
            const total = data.totalRegistros || data.estatisticas?.totalRegistros || 0;
            if (total === 0) {
                notificar(`⚠️ Nenhum registro de ${cfg.nomeAmigavel} encontrado. Verifique as datas e filtros.`, 'warning');
            }
        } else {
            notificar('Erro ao carregar relatório: ' + (data.error || ''), 'error');
        }
    } catch (error) {
        console.error('Erro:', error);
        notificar('Erro ao carregar relatório', 'error');
    }
}
// ============================================
// 🖨️ EXPORTAR PDF - ATRASOS
// ============================================
function exportarPDFAtrasos() {
    if (!relatorioData) {
        notificar('⚠️ Gere um relatório primeiro', 'warning');
        return;
    }
    const html = gerarHTMLRelatorioAtrasos(relatorioData);
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.onload = () => setTimeout(() => win.print(), 500);
}

function gerarHTMLRelatorioAtrasos(data) {
    const tipo = data.aluno ? 'aluno' : (data.turma ? 'turma' : 'geral');
    const logo = '/uploads/logo-iema.png';
    const carimbo = '/icons/assinatura_gestao.ico';
    const dataGeracao = new Date().toLocaleString('pt-BR');
    
    let assinaturaDigital = null;
    const lista = data.atrasos || data.registros || [];
    const comAssinatura = lista.find(a => a.temAssinatura && a.assinaturaBase64);
    if (comAssinatura) assinaturaDigital = comAssinatura.assinaturaBase64;
    
    let titulo = 'Relatório de Atrasos - Gestão Geral';
    let subtitulo = '';
    if (tipo === 'turma') { subtitulo = `Turma: ${data.turma || ''}`; }
    else if (tipo === 'aluno') {
        titulo = 'Relatório Individual de Atrasos';
        subtitulo = `${data.aluno?.nome || ''} — ${data.aluno?.turma || ''}`;
    } else { subtitulo = 'Relatório Geral'; }
    
    let statsHTML = '';
    if (tipo === 'geral') {
        statsHTML = `
            <div class="stats">
                <div class="stat"><div class="stat-value">${data.totalAtrasos || 0}</div><div class="stat-label">Total de Atrasos</div></div>
                <div class="stat"><div class="stat-value">${(data.porMotivo || []).length}</div><div class="stat-label">Motivos Diferentes</div></div>
                <div class="stat"><div class="stat-value">${(data.porTurma || []).length}</div><div class="stat-label">Turmas com Registro</div></div>
            </div>`;
    } else if (tipo === 'turma') {
        statsHTML = `
            <div class="stats">
                <div class="stat"><div class="stat-value">${data.estatisticas?.totalAtrasos || 0}</div><div class="stat-label">Total de Atrasos</div></div>
                <div class="stat"><div class="stat-value">${(data.porAluno || []).length}</div><div class="stat-label">Alunos com Registro</div></div>
            </div>`;
    } else {
        statsHTML = `
            <div class="stats">
                <div class="stat"><div class="stat-value">${data.estatisticas?.totalAtrasos || 0}</div><div class="stat-label">Total de Atrasos</div></div>
            </div>`;
    }
    
    let tabelaHTML = '';
    if (tipo === 'geral') {
        tabelaHTML = `
            <div class="section-title">📊 Distribuição por Motivo</div>
            <table>
                <thead><tr><th>Motivo</th><th style="width:120px;text-align:center;">Quantidade</th></tr></thead>
                <tbody>${(data.porMotivo || []).map(m => `<tr><td><strong>${escapeHTML(m.label || '')}</strong></td><td style="text-align:center;">${m.count || 0}</td></tr>`).join('') || '<tr><td colspan="2" style="text-align:center;">Nenhum dado</td></tr>'}</tbody>
            </table>
            <div class="section-title">🏫 Distribuição por Turma</div>
            <table>
                <thead><tr><th>Turma</th><th style="width:120px;text-align:center;">Total</th><th style="width:120px;text-align:center;">Alunos</th></tr></thead>
                <tbody>${(data.porTurma || []).map(t => `<tr><td><strong>${escapeHTML(t.turma || '')}</strong></td><td style="text-align:center;">${t.total || 0}</td><td style="text-align:center;">${t.totalAlunos || 0}</td></tr>`).join('') || '<tr><td colspan="3" style="text-align:center;">Nenhum dado</td></tr>'}</tbody>
            </table>`;
    } else if (tipo === 'turma') {
        tabelaHTML = `
            <div class="section-title">👥 Atrasos por Aluno</div>
            <table>
                <thead><tr><th>Aluno</th><th style="width:120px;text-align:center;">Total</th></tr></thead>
                <tbody>${(data.porAluno || []).map(a => `<tr><td><strong>${escapeHTML(a.alunoNome || '')}</strong></td><td style="text-align:center;">${a.total || 0}</td></tr>`).join('') || '<tr><td colspan="2" style="text-align:center;">Nenhum dado</td></tr>'}</tbody>
            </table>`;
    } else {
        tabelaHTML = `
            <div class="section-title">📋 Histórico de Atrasos</div>
            <table>
                <thead><tr><th>Data</th><th>Motivo</th><th>Descrição</th></tr></thead>
                <tbody>${(data.atrasos || []).map(a => `<tr><td>${new Date(a.dataHora).toLocaleDateString('pt-BR')}</td><td>${escapeHTML(a.motivoLabel || '')}</td><td>${escapeHTML((a.descricao || '').substring(0, 80))}</td></tr>`).join('') || '<tr><td colspan="3" style="text-align:center;">Nenhum atraso</td></tr>'}</tbody>
            </table>`;
    }
    
    return montarHTMLRelatorio({ titulo, subtitulo, statsHTML, tabelaHTML, assinaturaDigital, logo, carimbo, dataGeracao, nomeSetor: 'Gestão Geral' });
}

function exportarPDFModulo(modulo) {
    const data = relatoriosModulo[modulo];
    if (!data) {
        notificar('⚠️ Gere um relatório primeiro', 'warning');
        return;
    }
    const cfg = getCfg(modulo);
    const html = gerarHTMLRelatorioModulo(modulo, data, cfg);
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.onload = () => setTimeout(() => win.print(), 500);
}

function gerarHTMLRelatorioModulo(modulo, data, cfg) {
    const tipo = data.aluno ? 'aluno' : (data.turma ? 'turma' : 'geral');
    const logoIema = '/uploads/logo-iema.png';
    const carimbo = '/icons/assinatura_gestao.ico';
    const dataGeracao = new Date().toLocaleString('pt-BR');
    
    let assinaturaDigital = null;
    const listaRegistros = data.registros || data.autorizacoes || data.atendimentos || [];
    const comAssinatura = listaRegistros.find(a => a.temAssinatura && a.assinaturaBase64);
    if (comAssinatura) assinaturaDigital = comAssinatura.assinaturaBase64;
    
    const mostrarPeriodoFalta = cfg.tipo === 'justificativa' || cfg.tipo === 'segunda_chamada';
    const mostrarTipoProva = cfg.tipo === 'segunda_chamada';
    const mostraUniforme = cfg.tipo === 'uniforme';
    const mostraEntradaSaida = cfg.tipo === 'autorizacao';  // 🆕
    
    let titulo = `Relatório de ${cfg.nomeAmigavel} - Gestão Geral`;
    let subtitulo = '';
    if (tipo === 'turma') {
        subtitulo = `Turma: ${data.turma || ''}`;
    } else if (tipo === 'aluno') {
        titulo = `Relatório Individual - ${cfg.nomeAmigavel}`;
        subtitulo = `${data.aluno?.nome || ''} — ${data.aluno?.turma || ''}`;
    } else {
        subtitulo = 'Relatório Geral';
    }
    
    let statsHTML = '';
    if (tipo === 'geral') {
        statsHTML = `
            <div class="stats">
                <div class="stat"><div class="stat-value">${data.totalRegistros || 0}</div><div class="stat-label">Total de Registros</div></div>
                <div class="stat"><div class="stat-value">${(data.porMotivo || []).length}</div><div class="stat-label">Motivos Diferentes</div></div>
                <div class="stat"><div class="stat-value">${(data.porTurma || []).length}</div><div class="stat-label">Turmas Envolvidas</div></div>
            </div>`;
    } else if (tipo === 'turma') {
        statsHTML = `
            <div class="stats">
                <div class="stat"><div class="stat-value">${data.estatisticas?.totalRegistros || 0}</div><div class="stat-label">Total de Registros</div></div>
                <div class="stat"><div class="stat-value">${data.estatisticas?.totalAlunos || (data.porAluno || []).length}</div><div class="stat-label">Alunos Atendidos</div></div>
            </div>`;
    } else if (tipo === 'aluno') {
        statsHTML = `
            <div class="stats">
                <div class="stat"><div class="stat-value">${data.estatisticas?.totalRegistros || 0}</div><div class="stat-label">Total de Registros</div></div>
                <div class="stat"><div class="stat-value">${(data.porMotivo || []).length}</div><div class="stat-label">Motivos Diferentes</div></div>
            </div>`;
    }
    
    // 🆕 Helper para formatar entrada/saída
    const fmtEntrada = (a) => {
        const d = a.dataEntradaFormatada || (a.dataEntrada ? new Date(a.dataEntrada).toLocaleDateString('pt-BR') : '');
        const h = a.horarioEntrada || '';
        if (d && h) return `${d} às ${h}`;
        return d || h || '-';
    };
    const fmtSaida = (a) => {
        const d = a.dataSaidaFormatada || (a.dataSaida ? new Date(a.dataSaida).toLocaleDateString('pt-BR') : '');
        const h = a.horarioSaida || '';
        if (d && h) return `${d} às ${h}`;
        return d || h || '-';
    };
    
    let tabelaHTML = '';
    
    if (tipo === 'geral') {
        const porMotivo = Array.isArray(data.porMotivo) ? data.porMotivo : [];
        const porTurma = Array.isArray(data.porTurma) ? data.porTurma : [];
        const registros = data.registros || data.autorizacoes || [];
        
        tabelaHTML = `
            <div class="section-title">📊 Distribuição por Motivo</div>
            <table>
                <thead><tr><th>Motivo</th><th style="width:120px;text-align:center;">Quantidade</th></tr></thead>
                <tbody>${porMotivo.map(m => `<tr><td><strong>${escapeHTML(m.label || '')}</strong></td><td style="text-align:center;">${m.count || 0}</td></tr>`).join('') || '<tr><td colspan="2" style="text-align:center;">Nenhum dado</td></tr>'}</tbody>
            </table>
            
            ${mostrarTipoProva && (data.porTipoProva || []).length > 0 ? `
                <div class="section-title">📝 Distribuição por Tipo de Prova Perdida</div>
                <table>
                    <thead><tr><th>Tipo de Prova</th><th style="width:120px;text-align:center;">Quantidade</th></tr></thead>
                    <tbody>${(data.porTipoProva || []).map(t => `<tr><td><strong>${escapeHTML(t.tipoProva || t.label || '')}</strong></td><td style="text-align:center;">${t.count || 0}</td></tr>`).join('')}</tbody>
                </table>
            ` : ''}
            
            ${mostrarTipoProva && (data.porPeriodoProva || []).length > 0 ? `
                <div class="section-title">📚 Distribuição por Período da Prova</div>
                <table>
                    <thead><tr><th>Período</th><th style="width:120px;text-align:center;">Quantidade</th></tr></thead>
                    <tbody>${(data.porPeriodoProva || []).map(p => `<tr><td><strong>${escapeHTML(p.periodoProva || p.label || '')}</strong></td><td style="text-align:center;">${p.count || 0}</td></tr>`).join('')}</tbody>
                </table>
            ` : ''}
            
            <div class="section-title">🏫 Distribuição por Turma</div>
            <table>
                <thead><tr><th>Turma</th><th style="width:120px;text-align:center;">Total</th><th style="width:120px;text-align:center;">Alunos</th></tr></thead>
                <tbody>${porTurma.map(t => `<tr><td><strong>${escapeHTML(t.turma || '')}</strong></td><td style="text-align:center;">${t.total || 0}</td><td style="text-align:center;">${t.totalAlunos || 0}</td></tr>`).join('') || '<tr><td colspan="3" style="text-align:center;">Nenhum dado</td></tr>'}</tbody>
            </table>
            
            ${registros.length > 0 ? `
                <div class="section-title">📋 Últimos Registros</div>
                <table>
                    <thead>
                        <tr>
                            <th>Data do Registro</th>
                            ${mostraEntradaSaida ? '<th>Entrada</th><th>Saída</th>' : ''}
                            ${mostrarPeriodoFalta ? '<th>Período da Falta</th>' : ''}
                            ${mostraUniforme ? '<th>Período do Uniforme</th>' : ''}
                            ${mostrarTipoProva ? '<th>Tipo de Prova</th>' : ''}
                            ${mostrarTipoProva ? '<th>Período</th>' : ''}
                            <th>Aluno</th>
                            <th>Turma</th>
                            <th>Motivo</th>
                        </tr>
                    </thead>
                    <tbody>${registros.slice(0, 30).map(a => `
                        <tr>
                            <td>${a.dataFormatada || '-'}</td>
                            ${mostraEntradaSaida ? `<td>${fmtEntrada(a)}</td><td>${fmtSaida(a)}</td>` : ''}
                            ${mostrarPeriodoFalta ? `<td><strong>${a.periodoFaltaFormatado || '-'}</strong></td>` : ''}
                            ${mostraUniforme ? `<td><strong>${a.uniformePeriodoFormatado || '-'}</strong></td>` : ''}
                            ${mostrarTipoProva ? `<td>${escapeHTML(a.tipoProvaPerdidaFormatado || a.tipoProvaPerdida || '-')}</td>` : ''}
                            ${mostrarTipoProva ? `<td>${escapeHTML(a.periodoProvaFormatado || a.periodoProva || '-')}</td>` : ''}
                            <td><strong>${escapeHTML(a.alunoNome || '')}</strong></td>
                            <td>${escapeHTML(a.alunoTurma || '')}</td>
                            <td>${escapeHTML(a.motivoLabel || '')}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            ` : ''}`;
    }
    else if (tipo === 'turma') {
        const porAluno = Array.isArray(data.porAluno) ? data.porAluno : [];
        const registros = data.registros || data.autorizacoes || [];
        
        tabelaHTML = `
            <div class="section-title">👥 Registros por Aluno</div>
            <table>
                <thead><tr><th>Aluno</th><th>Matrícula</th><th style="width:100px;text-align:center;">Total</th></tr></thead>
                <tbody>${porAluno.map(a => `<tr><td><strong>${escapeHTML(a.alunoNome || '')}</strong></td><td>${escapeHTML(a.alunoMatricula || '-')}</td><td style="text-align:center;">${a.total || 0}</td></tr>`).join('') || '<tr><td colspan="3" style="text-align:center;">Nenhum dado</td></tr>'}</tbody>
            </table>
            
            ${registros.length > 0 ? `
                <div class="section-title">📋 Últimos Registros</div>
                <table>
                    <thead>
                        <tr>
                            <th>Data do Registro</th>
                            ${mostraEntradaSaida ? '<th>Entrada</th><th>Saída</th>' : ''}
                            ${mostrarPeriodoFalta ? '<th>Período da Falta</th>' : ''}
                            ${mostraUniforme ? '<th>Período do Uniforme</th>' : ''}
                            ${mostrarTipoProva ? '<th>Tipo de Prova</th>' : ''}
                            ${mostrarTipoProva ? '<th>Período</th>' : ''}
                            <th>Aluno</th>
                            <th>Motivo</th>
                        </tr>
                    </thead>
                    <tbody>${registros.slice(0, 30).map(a => `
                        <tr>
                            <td>${a.dataFormatada || '-'}</td>
                            ${mostraEntradaSaida ? `<td>${fmtEntrada(a)}</td><td>${fmtSaida(a)}</td>` : ''}
                            ${mostrarPeriodoFalta ? `<td><strong>${a.periodoFaltaFormatado || '-'}</strong></td>` : ''}
                            ${mostraUniforme ? `<td><strong>${a.uniformePeriodoFormatado || '-'}</strong></td>` : ''}
                            ${mostrarTipoProva ? `<td>${escapeHTML(a.tipoProvaPerdidaFormatado || a.tipoProvaPerdida || '-')}</td>` : ''}
                            ${mostrarTipoProva ? `<td>${escapeHTML(a.periodoProvaFormatado || a.periodoProva || '-')}</td>` : ''}
                            <td><strong>${escapeHTML(a.alunoNome || '')}</strong></td>
                            <td>${escapeHTML(a.motivoLabel || '')}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            ` : ''}`;
    }
    else if (tipo === 'aluno') {
        const registros = data.registros || data.autorizacoes || [];
        
        tabelaHTML = `
            <div class="section-title">📋 Histórico de Registros</div>
            <table>
                <thead>
                    <tr>
                        <th>Data do Registro</th>
                        ${mostraEntradaSaida ? '<th>Entrada</th><th>Saída</th>' : ''}
                        ${mostrarPeriodoFalta ? '<th>Período da Falta</th>' : ''}
                        ${mostraUniforme ? '<th>Período do Uniforme</th>' : ''}
                        ${mostrarTipoProva ? '<th>Tipo de Prova</th>' : ''}
                        ${mostrarTipoProva ? '<th>Período</th>' : ''}
                        <th>Motivo</th>
                        <th>Observações</th>
                    </tr>
                </thead>
                <tbody>${registros.map(a => `
                    <tr>
                        <td>${a.dataFormatada || '-'}</td>
                        ${mostraEntradaSaida ? `<td>${fmtEntrada(a)}</td><td>${fmtSaida(a)}</td>` : ''}
                        ${mostrarPeriodoFalta ? `<td><strong>${a.periodoFaltaFormatado || '-'}</strong></td>` : ''}
                        ${mostraUniforme ? `<td><strong>${a.uniformePeriodoFormatado || '-'}</strong></td>` : ''}
                        ${mostrarTipoProva ? `<td>${escapeHTML(a.tipoProvaPerdidaFormatado || a.tipoProvaPerdida || '-')}</td>` : ''}
                        ${mostrarTipoProva ? `<td>${escapeHTML(a.periodoProvaFormatado || a.periodoProva || '-')}</td>` : ''}
                        <td>${escapeHTML(a.motivoLabel || '')}</td>
                        <td>${escapeHTML((a.observacoes || '').substring(0, 80))}${(a.observacoes || '').length > 80 ? '...' : ''}</td>
                    </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;">Nenhum registro</td></tr>'}
                </tbody>
            </table>`;
    }
    
    return montarHTMLRelatorio({ 
        titulo, subtitulo, statsHTML, tabelaHTML, 
        assinaturaDigital, logo: logoIema, carimbo, 
        dataGeracao, nomeSetor: 'Gestão Geral' 
    });
}

function montarHTMLRelatorio({ titulo, subtitulo, statsHTML, tabelaHTML, assinaturaDigital, logo, carimbo, dataGeracao, nomeSetor }) {
    return `<!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <title>${titulo}</title>
        <style>
            @page { size: A4 portrait; margin: 8mm; }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: 'Times New Roman', Times, serif; font-size: 9.5pt; line-height: 1.25; color: #000; }
            
            .header { text-align: center; border-bottom: 1.5px double #000; padding-bottom: 4px; margin-bottom: 6px; }
            .header img { max-width: 100%; max-height: 14mm; object-fit: contain; display: block; margin: 0 auto 2px; }
            .header h1 { font-size: 10pt; text-transform: uppercase; font-weight: bold; margin: 2px 0 0; }
            .header p { font-size: 8pt; margin: 1px 0 0; }
            
            .titulo { text-align: center; font-size: 11pt; font-weight: bold; background: #dbeafe; padding: 4px 8px; border: 1.5px solid #000; margin: 6px 0 3px; text-transform: uppercase; letter-spacing: 0.5px; }
            .subtitulo { text-align: center; font-size: 9pt; margin: 0 0 6px; font-style: italic; }
            
            .stats { display: flex; gap: 8px; margin: 6px 0 8px; padding: 6px 8px; background: #eef2ff; border-radius: 5px; border: 1px solid #c7d2fe; }
            .stat { text-align: center; flex: 1; border-right: 1px solid #c7d2fe; }
            .stat:last-child { border-right: none; }
            .stat-value { font-size: 13pt; font-weight: bold; color: #1e3c72; line-height: 1; }
            .stat-label { font-size: 7.5pt; color: #666; margin-top: 2px; }
            
            .section-title { font-size: 9pt; font-weight: bold; background: #e8e8e8; padding: 2px 6px; border-left: 3px solid #1e3c72; margin: 6px 0 3px; }
            
            table { width: 100%; border-collapse: collapse; font-size: 8.5pt; margin-bottom: 6px; }
            th { background: #1e3c72; color: white; padding: 4px 5px; text-align: left; border: 1px solid #152a52; font-size: 8pt; }
            td { padding: 3px 5px; border: 1px solid #ddd; vertical-align: top; }
            tr:nth-child(even) { background: #f9fafb; }
            
            .assinaturas { display: flex; justify-content: center; margin-top: 25px; gap: 30px; }
            .assinatura { flex: 0 0 60%; text-align: center; }
            
            .assinatura-container-relatorio { position: relative; min-height: 18mm; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 0; }
            .assinatura-container-relatorio::after { content: ''; position: absolute; bottom: 0; left: 0; right: 0; border-bottom: 1px solid #000; }
            .assinatura-img { max-height: 14mm; max-width: 100%; object-fit: contain; position: relative; z-index: 2; margin-bottom: 1mm; }
            .carimbo-overlay { position: absolute; bottom: 1mm; left: 50%; transform: translateX(-50%); max-height: 15mm; max-width: 55mm; object-fit: contain; opacity: 0.95; pointer-events: none; z-index: 1; }
            
            .assinatura-linha { padding-top: 3px; font-size: 8pt; margin-top: 2px; }
            
            .footer { text-align: center; margin-top: 8px; padding-top: 3px; border-top: 1px solid #ccc; font-size: 6.5pt; color: #666; }
            .footer p { margin: 1px 0; }
            .registro-info { font-size: 7.5pt; color: #666; margin-top: 6px; text-align: center; }
            
            .btn-print { display: block; margin: 10px auto; padding: 8px 20px; background: #1e3c72; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 12px; font-family: Arial, sans-serif; }
            .btn-print:hover { background: #2a5298; }
            
            @media print { .no-print { display: none !important; } body { padding: 0; } }
        </style>
    </head>
    <body>
        <button class="btn-print no-print" onclick="window.print()">🖨️ Imprimir</button>
        <div class="header">
            <img src="${logo}" alt="IEMA" onerror="this.style.display='none'">
            <h1>IEMA Pleno: São Luís - Centro</h1>
            <p>Sistema de Atendimentos — ${nomeSetor}</p>
        </div>
        <div class="titulo">📋 ${titulo}</div>
        ${subtitulo ? `<div class="subtitulo">${escapeHTML(subtitulo)}</div>` : ''}
        ${statsHTML}
        ${tabelaHTML}
        <div class="assinaturas">
            <div class="assinatura">
                <div class="assinatura-container-relatorio">
                    ${assinaturaDigital ? `<img class="assinatura-img" src="${assinaturaDigital}" alt="Assinatura">` : ''}
                    <img class="carimbo-overlay" src="${carimbo}" alt="Carimbo" onerror="this.style.display='none'">
                </div>
                <div class="assinatura-linha">Assinatura do Responsável / ${nomeSetor}</div>
            </div>
        </div>
        <div class="registro-info">Relatório gerado em <strong>${dataGeracao}</strong></div>
        <div class="footer">
            <p>Documento gerado automaticamente pelo EducaPleno</p>
            <p>Setor: ${nomeSetor}</p>
        </div>
    </body>
    </html>`;
}

function exibirRelatorioModulo(modulo, data, tipo) {
    const P = getPrefixo(modulo);
    const cfg = getCfg(modulo);
    const container = safeGet(`${P}ResultadoRelatorio`);
    if (!container) return;
    
    const mostrarPeriodoFalta = cfg.tipo === 'justificativa' || cfg.tipo === 'segunda_chamada';
    const mostrarTipoProva = cfg.tipo === 'segunda_chamada';
    const mostraUniforme = cfg.tipo === 'uniforme';

    if (tipo === 'geral') {
        container.innerHTML = `
            <div class="card"><div class="card-body">
                <h5><i class="fas fa-chart-bar"></i> Relatório Geral</h5>
                <p>Total: <strong>${data.totalRegistros || 0}</strong>${data.comAssinatura !== undefined ? ` | Com assinatura: <strong>${data.comAssinatura}</strong>` : ''}</p>
                
                <h6 class="mt-4">Por Motivo</h6>
                <div class="row">${(data.porMotivo || []).map(m => `
                    <div class="col-md-4 mb-2">
                        <div class="p-2" style="background:#dbeafe;border-radius:8px;">
                            <strong>${escapeHTML(m.label)}</strong>: ${m.count}
                        </div>
                    </div>`).join('')}</div>
                
                ${mostrarTipoProva && (data.porTipoProva || []).length > 0 ? `
                    <h6 class="mt-4">Por Tipo de Prova Perdida</h6>
                    <div class="row">${(data.porTipoProva || []).map(t => `
                        <div class="col-md-4 mb-2">
                            <div class="p-2" style="background:#fef3c7;border-radius:8px;">
                                <strong>${escapeHTML(t.tipoProva || t.label)}</strong>: ${t.count}
                            </div>
                        </div>`).join('')}</div>
                ` : ''}
                
                ${mostrarTipoProva && (data.porPeriodoProva || []).length > 0 ? `
                    <h6 class="mt-4">Por Período da Prova</h6>
                    <div class="row">${(data.porPeriodoProva || []).map(p => `
                        <div class="col-md-3 mb-2">
                            <div class="p-2" style="background:#eef2ff;border-radius:8px;">
                                <strong>${escapeHTML(p.periodoProva || p.label)}</strong>: ${p.count}
                            </div>
                        </div>`).join('')}</div>
                ` : ''}
                
                ${mostraUniforme && (data.porPeriodoUniforme || []).length > 0 ? `
                    <h6 class="mt-4">Distribuição por Período do Uniforme (Mês/Ano)</h6>
                    <div class="row">${(data.porPeriodoUniforme || []).map(p => `
                        <div class="col-md-3 mb-2">
                            <div class="p-2" style="background:#eef2ff;border-radius:8px;">
                                <strong>${escapeHTML(p.periodo || p.label)}</strong>: ${p.count}
                            </div>
                        </div>`).join('')}</div>
                ` : ''}
                
                <h6 class="mt-4">Por Turma</h6>
                <div class="table-responsive">
                    <table class="table table-sm">
                        <thead><tr><th>Turma</th><th>Total</th><th>Alunos</th></tr></thead>
                        <tbody>${(data.porTurma || []).map(t => `
                            <tr><td>${escapeHTML(t.turma)}</td><td>${t.total}</td><td>${t.totalAlunos}</td></tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div></div>`;
    } else if (tipo === 'turma') {
        container.innerHTML = `
            <div class="card"><div class="card-body">
                <h5>Relatório da Turma: ${escapeHTML(data.turma || '')}</h5>
                <p>Total: <strong>${data.estatisticas?.totalRegistros || 0}</strong></p>
                <p>Alunos: <strong>${data.estatisticas?.totalAlunos || 0}</strong></p>
                
                <h6 class="mt-4">Por Aluno</h6>
                <div class="table-responsive">
                    <table class="table table-sm">
                        <thead><tr><th>Aluno</th><th>Matrícula</th><th>Total</th></tr></thead>
                        <tbody>${(data.porAluno || []).map(a => `
                            <tr>
                                <td>${escapeHTML(a.alunoNome)}</td>
                                <td>${escapeHTML(a.alunoMatricula || '-')}</td>
                                <td><span class="badge bg-primary">${a.total}</span></td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
                
                <h6 class="mt-4">Por Motivo</h6>
                <div class="row">${(data.porMotivo || []).map(m => `
                    <div class="col-md-4 mb-2">
                        <div class="p-2" style="background:#dbeafe;border-radius:8px;">
                            <strong>${escapeHTML(m.label)}</strong>: ${m.count}
                        </div>
                    </div>`).join('')}</div>
            </div></div>`;
    } else if (tipo === 'aluno') {
        container.innerHTML = `
            <div class="card"><div class="card-body">
                <h5>Relatório: ${escapeHTML(data.aluno?.nome || '')}</h5>
                <p>Turma: ${escapeHTML(data.aluno?.turma || 'N/A')} | Matrícula: ${escapeHTML(data.aluno?.matricula || 'N/A')}</p>
                <p>Total: <strong>${data.estatisticas?.totalRegistros || 0}</strong></p>
                
                <h6 class="mt-4">Por Motivo</h6>
                <div class="row">${(data.porMotivo || []).map(m => `
                    <div class="col-md-4 mb-2">
                        <div class="p-2" style="background:#dbeafe;border-radius:8px;">
                            <strong>${escapeHTML(m.label)}</strong>: ${m.count}
                        </div>
                    </div>`).join('')}</div>
                
                <h6 class="mt-4">Histórico</h6>
                <div class="table-responsive">
                    <table class="table table-sm">
                        <thead>
                            <tr>
                                <th>Data Registro</th>
                                ${mostrarPeriodoFalta ? '<th>Período da Falta</th>' : ''}
                                ${mostraUniforme ? '<th>Período do Uniforme</th>' : ''}
                                ${mostrarTipoProva ? '<th>Tipo de Prova</th>' : ''}
                                ${mostrarTipoProva ? '<th>Período</th>' : ''}
                                <th>Motivo</th>
                                <th>Observações</th>
                            </tr>
                        </thead>
                        <tbody>${(data.registros || []).map(a => `
                            <tr>
                                <td>${a.dataFormatada}</td>
                                ${mostrarPeriodoFalta ? `<td><strong>${a.periodoFaltaFormatado || '-'}</strong></td>` : ''}
                                ${mostraUniforme ? `<td><strong>${a.uniformePeriodoFormatado || '-'}</strong></td>` : ''}
                                ${mostrarTipoProva ? `<td>${escapeHTML(a.tipoProvaPerdidaFormatado || a.tipoProvaPerdida || '-')}</td>` : ''}
                                ${mostrarTipoProva ? `<td>${escapeHTML(a.periodoProvaFormatado || a.periodoProva || '-')}</td>` : ''}
                                <td>${escapeHTML(a.motivoLabel)}</td>
                                <td>${escapeHTML((a.observacoes || '').substring(0, 100))}</td>
                            </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div></div>`;
    }
}
function exportarCSVModulo(modulo) {
    const data = relatoriosModulo[modulo];
    const cfg = getCfg(modulo);

    if (!data) {
        notificar('⚠️ Nenhum relatório carregado.\n\nClique em BUSCAR primeiro.', 'warning');
        return;
    }

    const registros = data.registros || data.autorizacoes || data.atendimentos || [];
    if (registros.length === 0) {
        notificar('⚠️ Nenhum registro para exportar.\n\nVerifique os filtros de data.', 'warning');
        return;
    }

    const P = getPrefixo(modulo);
    const mostrarPeriodoFalta = cfg.tipo === 'justificativa' || cfg.tipo === 'segunda_chamada';
    const mostrarTipoProva = cfg.tipo === 'segunda_chamada';
    const mostraUniforme = cfg.tipo === 'uniforme';
    const mostraEntradaSaida = cfg.tipo === 'autorizacao';  // 🆕

    const tipo = data.aluno ? 'aluno' : (data.turma ? 'turma' : 'geral');
    let titulo = `Relatório de ${cfg.nomeAmigavel}`;
    let subtitulo = '';

    if (tipo === 'turma') {
        titulo = `Relatório de ${cfg.nomeAmigavel} por Turma`;
        subtitulo = `Turma: ${data.turma || ''}`;
    } else if (tipo === 'aluno') {
        titulo = `Relatório Individual — ${cfg.nomeAmigavel}`;
        subtitulo = `${data.aluno?.nome || ''} — ${data.aluno?.turma || ''}`;
    } else {
        titulo = `Relatório Geral de ${cfg.nomeAmigavel}`;
        subtitulo = 'Visão consolidada de todos os registros';
    }

    const filtros = [];
    const di = safeGet(`${P}DataInicio`)?.value;
    const df = safeGet(`${P}DataFim`)?.value;
    const tipoProvaFiltro = safeGet(`${P}FiltroTipoProva`)?.value;
    const periodoProvaFiltro = safeGet(`${P}FiltroPeriodoProva`)?.value;

    if (di) filtros.push({ label: 'Data inicial', valor: di });
    if (df) filtros.push({ label: 'Data final', valor: df });
    if (data.turma) filtros.push({ label: 'Turma', valor: data.turma });
    if (data.aluno?.nome) filtros.push({ label: 'Aluno', valor: data.aluno.nome });
    if (tipoProvaFiltro && tipoProvaFiltro !== 'todos') {
        filtros.push({ label: 'Tipo de Prova', valor: tipoProvaFiltro });
    }
    if (periodoProvaFiltro && periodoProvaFiltro !== 'todos') {
        filtros.push({ label: 'Período da Prova', valor: periodoProvaFiltro });
    }

    const colunas = [
        {
            label: 'Data do Registro',
            format: (a) => a.dataFormatada
                || (a.data ? new Date(a.data).toLocaleDateString('pt-BR') : '')
        },
        {
            label: 'Data de Cadastro',
            format: (a) => a.createdAt
                ? new Date(a.createdAt).toLocaleString('pt-BR')
                : ''
        }
    ];

    // 🆕 ENTRADA / SAÍDA (Autorização)
    if (mostraEntradaSaida) {
        colunas.push(
            {
                label: 'Data de Entrada',
                format: (a) => a.dataEntradaFormatada 
                    || (a.dataEntrada ? new Date(a.dataEntrada).toLocaleDateString('pt-BR') : '')
            },
            { label: 'Horário de Entrada', format: (a) => a.horarioEntrada || '' },
            {
                label: 'Data de Saída',
                format: (a) => a.dataSaidaFormatada 
                    || (a.dataSaida ? new Date(a.dataSaida).toLocaleDateString('pt-BR') : '')
            },
            { label: 'Horário de Saída', format: (a) => a.horarioSaida || '' }
        );
    }

    if (mostrarPeriodoFalta) {
        colunas.push({
            label: 'Período da Falta',
            format: (a) => a.periodoFaltaFormatado || ''
        });
    }

    if (mostraUniforme) {
        colunas.push({
            label: 'Período do Uniforme',
            format: (a) => a.uniformePeriodoFormatado || ''
        });
    }

    if (mostrarTipoProva) {
        colunas.push(
            {
                label: 'Tipo de Prova Perdida',
                format: (a) => a.tipoProvaPerdidaFormatado || a.tipoProvaPerdida || ''
            },
            {
                label: 'Período da Prova',
                format: (a) => a.periodoProvaFormatado || a.periodoProva || ''
            }
        );
    }

    colunas.push(
        { label: 'Aluno', format: (a) => a.alunoNome || '' },
        { label: 'Matrícula', format: (a) => a.alunoMatricula || '' },
        { label: 'Turma', format: (a) => a.alunoTurma || data.turma || '' },
        { label: 'Motivo', format: (a) => a.motivoLabel || '' },
        {
            label: 'Detalhe do Motivo',
            format: (a) => {
                if (a.motivo === 'necessita_ausentar_retornar'
                    && a.horarioAusencia && a.horarioRetorno) {
                    return `Ausência: ${a.horarioAusencia} | Retorno: ${a.horarioRetorno}`;
                }
                return a.motivoOutros || '';
            }
        },
        { label: 'Responsável', format: (a) => a.responsavelNome || '' },
        { label: 'CPF', format: (a) => a.responsavelCPF || '' },
        { label: 'Telefone', format: (a) => a.responsavelTelefone || '' },
        { label: 'Observações', format: (a) => a.observacoes || '' },
        {
            label: 'Registrado por',
            format: (a) => a.registradoPorNome || a.registradoPor || ''
        },
        {
            label: 'Assinatura',
            format: (a) => a.temAssinatura
                ? `Sim${a.assinadaPorNome ? ` (${a.assinadaPorNome})` : ''}`
                : 'Não'
        }
    );

    const ok = gerarBaixarCSV({
        titulo,
        subtitulo,
        setor: 'Gestão Geral',
        colunas,
        registros,
        filtros,
        nomeArquivo: `relatorio-${cfg.tipo}-${tipo}`,
        observacoes: `${registros.length} registro(s) de ${cfg.nomeAmigavel.toLowerCase()}`
    });

    if (ok) {
        notificar(`✅ Relatório exportado (${registros.length} registro(s))!`, 'success');
    }
}

function aplicarFiltrosLista(modulo) {
    carregarListaModulo(modulo, 1);
}

// ============================================
// EVENT LISTENERS DOS MÓDULOS
// ============================================
function configurarEventosModulo(modulo) {
    const P = getPrefixo(modulo);

    // Listener do dashboard
    safeGet(`${modulo}-dashboard-tab`)?.addEventListener('shown.bs.tab', () => {
        carregarDashboardModulo(modulo);
    });

    // 🆕 Para UNIFORME: sub-abas têm IDs diferentes (uniforme-sub-dashboard-tab, etc)
    if (modulo === 'uniforme') {
        safeGet('uniforme-sub-dashboard-tab')?.addEventListener('shown.bs.tab', () => {
            carregarDashboardModulo(modulo);
        });
        safeGet('uniforme-sub-relatorios-tab')?.addEventListener('shown.bs.tab', () => {
            carregarTurmasFiltroModulo(modulo);
        });
    }

    // Listener dos relatórios
    safeGet(`${modulo}-relatorios-tab`)?.addEventListener('shown.bs.tab', () => {
        carregarTurmasFiltroModulo(modulo);
    });

    // Listener do select tipo relatório
    const selectTipo = safeGet(`${P}TipoRelatorio`);
    if (selectTipo && !selectTipo.dataset.listenerAttached) {
        selectTipo.dataset.listenerAttached = 'true';
        selectTipo.addEventListener('change', () => toggleRelatorioFiltrosModulo(modulo));
    }

    // Filtros da lista
    safeGet(`filtroLista${P}Aluno`)?.addEventListener('input', () => {
        clearTimeout(window[`_timeoutFiltro${P}`]);
        window[`_timeoutFiltro${P}`] = setTimeout(() => carregarListaModulo(modulo, 1), 500);
    });
    safeGet(`filtroLista${P}Turma`)?.addEventListener('change', () => carregarListaModulo(modulo, 1));
    safeGet(`filtroLista${P}Motivo`)?.addEventListener('change', () => carregarListaModulo(modulo, 1));
    safeGet(`filtroLista${P}DataInicio`)?.addEventListener('change', () => carregarListaModulo(modulo, 1));
    safeGet(`filtroLista${P}DataFim`)?.addEventListener('change', () => carregarListaModulo(modulo, 1));
    safeGet(`filtroLista${P}TipoProva`)?.addEventListener('change', () => carregarListaModulo(modulo, 1));
}

// ============================================
// IMPRESSÃO COM ASSINATURA
// ============================================
async function imprimirModulo(modulo, id) {
    try {
        const r = await fetch(`/api/gestao-geral/autorizacao/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const d = await r.json();
        if (!d.success) { notificar('Erro ao carregar'); return; }
        
        const a = d.autorizacao;
        
        let qr = '';
        try {
            const qrR = await fetch(`/api/aluno/qrcode/${a.alunoId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (qrR.ok) {
                const qrD = await qrR.json();
                if (qrD.success && qrD.qrCode) qr = qrD.qrCode;
            }
        } catch (e) {
            console.info('ℹ️ QR Code não pôde ser carregado');
        }
        
        const win = window.open('', '_blank');
        win.document.write(gerarHTMLImpressao(modulo, a, qr));
        win.document.close();
        win.onload = () => setTimeout(() => win.print(), 500);
    } catch (e) {
        console.error(e);
        notificar('Erro ao imprimir');
    }
}

function gerarHTMLImpressao(modulo, a, qrCodeUrl) {
    const cfg = getCfg(modulo);
    const titulo = cfg.nomeAmigavel.toUpperCase();
    const logo = '/uploads/logo-iema.png';
    const carimboGestao = '/icons/assinatura_gestao.ico';
    const dataGeracao = new Date().toLocaleString('pt-BR');
    
    const entrada = new Date(a.data);
    const dataExt = entrada.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const horaExt = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    
    let detalheMotivo = '';
    if (a.motivo === 'outros' && a.motivoOutros) {
        detalheMotivo = ` <strong>(Especificação: ${a.motivoOutros})</strong>`;
    }
    if (a.motivo === 'necessita_ausentar_retornar' && a.horarioAusencia && a.horarioRetorno) {
        detalheMotivo = ` <strong>(Ausência: ${a.horarioAusencia} | Retorno: ${a.horarioRetorno})</strong>`;
    }
    
    // 🆕 ENTRADA / SAÍDA (autorização) — mostra data + hora
    const mostrarEntradaSaida = cfg.tipo === 'autorizacao' && 
        (a.dataEntrada || a.dataSaida || a.horarioEntrada || a.horarioSaida);
    
    let horariosHTML = '';
    if (mostrarEntradaSaida) {
        const dEntradaFmt = a.dataEntrada ? new Date(a.dataEntrada).toLocaleDateString('pt-BR') : '';
        const dSaidaFmt = a.dataSaida ? new Date(a.dataSaida).toLocaleDateString('pt-BR') : '';
        const hEntrada = a.horarioEntrada || '';
        const hSaida = a.horarioSaida || '';
        
        let entradaTexto = '';
        if (dEntradaFmt && hEntrada) entradaTexto = `${dEntradaFmt} às ${hEntrada}`;
        else if (dEntradaFmt) entradaTexto = dEntradaFmt;
        else if (hEntrada) entradaTexto = hEntrada;
        else entradaTexto = '-';
        
        let saidaTexto = '';
        if (dSaidaFmt && hSaida) saidaTexto = `${dSaidaFmt} às ${hSaida}`;
        else if (dSaidaFmt) saidaTexto = dSaidaFmt;
        else if (hSaida) saidaTexto = hSaida;
        else saidaTexto = '-';
        
        horariosHTML = `
            <div class="section-title">📅 Previsão de Entrada / Saída</div>
            <div class="info-grid" style="grid-template-columns: 1fr 1fr;">
                <div class="info-item">
                    <span class="info-label">Entrada:</span>
                    <span class="info-value"><strong>${entradaTexto}</strong></span>
                </div>
                <div class="info-item">
                    <span class="info-label">Saída:</span>
                    <span class="info-value"><strong>${saidaTexto}</strong></span>
                </div>
            </div>
        `;
    }
    
    const mostrarPeriodoFalta = cfg.tipo === 'justificativa' || cfg.tipo === 'segunda_chamada';
    const mostrarTipoProva = cfg.tipo === 'segunda_chamada';
    const mostrarUniforme = cfg.tipo === 'uniforme';
    
    let periodoFaltaHTML = '';
    if (mostrarPeriodoFalta && a.periodoFaltaInicio) {
        const ini = new Date(a.periodoFaltaInicio);
        const fim = a.periodoFaltaFim ? new Date(a.periodoFaltaFim) : ini;
        const iniFmt = ini.toLocaleDateString('pt-BR');
        const fimFmt = fim.toLocaleDateString('pt-BR');
        const texto = iniFmt === fimFmt ? iniFmt : `${iniFmt} a ${fimFmt}`;
        
        periodoFaltaHTML = `
            <div class="section-title">📆 Período da Falta Justificada</div>
            <div class="motivo-box" style="background: #dbeafe; border-color: #1e3c72;">
                <p style="margin: 0; font-size: 11pt; text-align: center;">
                    <strong>${texto}</strong>
                </p>
            </div>
        `;
    }
    
    let uniformeHTML = '';
    if (mostrarUniforme && a.uniformePeriodoInicio) {
        const ini = new Date(a.uniformePeriodoInicio);
        const fim = a.uniformePeriodoFim ? new Date(a.uniformePeriodoFim) : ini;
        const iniFmt = ini.toLocaleDateString('pt-BR');
        const fimFmt = fim.toLocaleDateString('pt-BR');
        const textoPeriodo = iniFmt === fimFmt ? iniFmt : `${iniFmt} a ${fimFmt}`;
        
        uniformeHTML = `
            <div class="section-title">👕 Período da Autorização (Uniforme)</div>
            <div class="motivo-box" style="background: #eef2ff; border-color: #1e3c72;">
                <p style="margin: 0; font-size: 11pt; text-align: center;">
                    <strong>${textoPeriodo}</strong>
                </p>
            </div>
            <div class="descricao-box" style="font-size: 10pt; line-height: 1.55; margin-top: 6px; background: #f8fafc; border: 1px solid #cbd5e1; padding: 8px 10px;">
                Autorizo o(a) aluno(a) <strong>${escapeHTML(a.alunoNome || '')}</strong>, 
                do curso <strong>${escapeHTML(a.alunoCurso || 'Não informado')}</strong>, 
                da turma <strong>${escapeHTML(a.alunoTurma || 'Não informada')}</strong>, 
                a permanecer <strong>sem uniforme</strong> no ambiente escolar no período de 
                <strong>${textoPeriodo}</strong>.
            </div>
        `;
    }
    
    let tipoProvaHTML = '';
    if (mostrarTipoProva && a.tipoProvaPerdida) {
        const textoProva = a.tipoProvaPerdida === 'Outros' && a.tipoProvaPerdidaOutros
            ? `Outros (${a.tipoProvaPerdidaOutros})`
            : a.tipoProvaPerdida;
        
        tipoProvaHTML = `
            <div class="section-title">📝 Tipo de Prova Perdida</div>
            <div class="motivo-box" style="background: #fef3c7; border-color: #f59e0b;">
                <p style="margin: 0; font-size: 11pt; text-align: center;">
                    <strong>${escapeHTML(textoProva)}</strong>
                </p>
            </div>
        `;
    }
    
    let periodoProvaHTML = '';
    if (mostrarTipoProva && a.periodoProva) {
        periodoProvaHTML = `
            <div class="section-title">📚 Período da Prova</div>
            <div class="motivo-box" style="background: #eef2ff; border-color: #1e3c72;">
                <p style="margin: 0; font-size: 11pt; text-align: center;">
                    <strong>${escapeHTML(a.periodoProva)}</strong>
                </p>
            </div>
        `;
    }
    
    const assinaturaHTML = a.assinaturaBase64 
        ? `<img class="assinatura-img" src="${a.assinaturaBase64}" alt="Assinatura" style="max-height:12mm;max-width:100%;object-fit:contain;position:relative;z-index:1;">`
        : '';
    
    const temResponsavel = a.responsavelNome || a.responsavelCPF || a.responsavelTelefone;
    const responsavelHTML = temResponsavel ? `
        <div class="section-title">👤 Responsável</div>
        <div class="detalhes-compactos">
            ${a.responsavelNome ? `<span class="det-item"><strong>Nome:</strong> ${escapeHTML(a.responsavelNome)}</span>` : ''}
            ${a.responsavelCPF ? `<span class="det-item"><strong>CPF:</strong> ${escapeHTML(a.responsavelCPF)}</span>` : ''}
            ${a.responsavelTelefone ? `<span class="det-item"><strong>Telefone:</strong> ${escapeHTML(a.responsavelTelefone)}</span>` : ''}
        </div>
    ` : '';
    
    return `<!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <title>${titulo} - ${escapeHTML(a.alunoNome)}</title>
        <style>
            @page { size: A4 portrait; margin: 8mm; }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: 'Times New Roman', Times, serif; font-size: 9.5pt; line-height: 1.25; color: #000; }
            
            .header { text-align: center; border-bottom: 1.5px double #000; padding-bottom: 4px; margin-bottom: 6px; }
            .header img { max-width: 100%; max-height: 14mm; object-fit: contain; display: block; margin: 0 auto 2px; }
            .header h1 { font-size: 10pt; text-transform: uppercase; font-weight: bold; margin: 2px 0 0; }
            .header p { font-size: 8pt; margin: 1px 0 0; }
            
            .titulo { text-align: center; font-size: 11pt; font-weight: bold; background: #eef2ff; padding: 4px 8px; border: 1.5px solid #000; margin: 6px 0 3px; text-transform: uppercase; letter-spacing: 0.5px; }
            
            .aluno-box { display: flex; align-items: center; gap: 8px; padding: 5px 8px; background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 5px; margin-bottom: 6px; }
            .aluno-foto { width: 38px; height: 38px; border-radius: 50%; object-fit: cover; border: 1.5px solid #1e3c72; flex-shrink: 0; }
            .aluno-info { flex: 1; }
            .aluno-nome { font-size: 10pt; font-weight: bold; color: #1e3c72; margin-bottom: 1px; }
            .aluno-detalhes { font-size: 8pt; color: #374151; }
            
            .section-title { font-size: 9pt; font-weight: bold; background: #e8e8e8; padding: 2px 6px; border-left: 3px solid #1e3c72; margin: 5px 0 3px; }
            
            .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 3px 12px; margin: 3px 0 5px; font-size: 8.5pt; }
            .info-item { display: flex; gap: 4px; }
            .info-label { font-weight: bold; white-space: nowrap; }
            .info-value { flex: 1; }
            
            .motivo-box { background: #f5f5f5; border: 1px solid #000; padding: 5px 8px; margin: 5px 0; border-radius: 4px; }
            .motivo-box strong { font-size: 9pt; }
            .motivo-box p { margin: 3px 0 0; font-size: 9.5pt; font-weight: bold; }
            
            .descricao-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 4px; padding: 5px 8px; font-size: 8.5pt; line-height: 1.3; min-height: 30px; max-height: 80px; overflow: hidden; word-wrap: break-word; }
            
            .detalhes-compactos { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 4px; padding: 4px 6px; font-size: 8pt; line-height: 1.35; }
            .det-item { display: inline-block; margin-right: 10px; margin-bottom: 2px; }
            
            .assinaturas { display: flex; justify-content: space-around; margin-top: 15px; gap: 15px; }
            .assinatura { flex: 1; text-align: center; font-size: 8pt; position: relative; }
            .assinatura-container { position: relative; border-bottom: 1px solid #000; min-height: 14mm; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 2px; }
            .carimbo-overlay { max-height: 13mm; max-width: 55%; object-fit: contain; opacity: 0.85; }
            .assinatura-linha { padding-top: 2px; font-size: 8pt; margin-top: 2px; }
            
            .qr-code { text-align: center; margin-top: 6px; }
            .qr-code img { width: 25mm; height: 25mm; border: 1.5px solid #000; padding: 2px; display: block; margin: 0 auto; }
            .qr-code p { font-size: 8pt; margin: 3px 0 0 0; color: #444; font-weight: bold; }
            
            .footer { text-align: center; margin-top: 5px; padding-top: 3px; border-top: 1px solid #ccc; font-size: 6.5pt; color: #666; }
            .footer p { margin: 1px 0; }
            
            .btn-print { display: block; margin: 10px auto; padding: 8px 20px; background: #1e3c72; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 12px; font-family: Arial, sans-serif; }
            .btn-print:hover { background: #2a5298; }
            
            @media print { .no-print { display: none !important; } body { padding: 0; } }
        </style>
    </head>
    <body>
        <button class="btn-print no-print" onclick="window.print()">🖨️ Imprimir</button>
        
        <div class="header">
            <img src="${logo}" alt="IEMA" onerror="this.style.display='none'">
            <h1>IEMA Pleno: São Luís - Centro</h1>
            <p>Sistema de Atendimentos — Gestão Geral</p>
        </div>
        
        <div class="titulo">📋 ${titulo}</div>
        
        <div class="aluno-box">
            <img class="aluno-foto" src="${gerarAvatarSVG(a.alunoNome)}" alt="${escapeHTML(a.alunoNome)}">
            <div class="aluno-info">
                <div class="aluno-nome">${escapeHTML(a.alunoNome)}</div>
                <div class="aluno-detalhes">
                    <strong>Matrícula:</strong> ${escapeHTML(a.alunoMatricula || 'Não informada')} • 
                    <strong>Turma:</strong> ${escapeHTML(a.alunoTurma || '-')}
                    ${a.alunoCurso ? ` • <strong>Curso:</strong> ${escapeHTML(a.alunoCurso)}` : ''}
                </div>
            </div>
        </div>
        
        ${periodoFaltaHTML}
        ${uniformeHTML}
        ${tipoProvaHTML}
        ${periodoProvaHTML}
        ${horariosHTML}
        
        <div class="section-title">📌 Dados do Registro</div>
        <div class="info-grid">
            <div class="info-item"><span class="info-label">Data:</span><span class="info-value">${dataExt}</span></div>
            <div class="info-item"><span class="info-label">Hora:</span><span class="info-value">${horaExt}</span></div>
            <div class="info-item"><span class="info-label">Registrado por:</span><span class="info-value">${escapeHTML(a.registradoPorNome || '-')}</span></div>
        </div>
        
        <div class="motivo-box">
            <strong>📌 Motivo:</strong>
            <p>☑ ${escapeHTML(a.motivoLabel || '-')}${detalheMotivo}</p>
        </div>
        
        ${responsavelHTML}
        
        ${a.observacoes ? `
            <div class="section-title">💬 Observações</div>
            <div class="descricao-box" style="min-height: 20px; max-height: 60px;">${escapeHTML(a.observacoes).replace(/\n/g, '<br>')}</div>
        ` : ''}
        
        <div class="assinaturas">
            <div class="assinatura">
                <div class="assinatura-container">
                    ${assinaturaHTML}
                </div>
                <div class="assinatura-linha">Assinatura do Responsável</div>
            </div>
            <div class="assinatura">
                <div class="assinatura-container">
                    <img class="carimbo-overlay" src="${carimboGestao}" alt="Carimbo" onerror="this.style.display='none'">
                </div>
                <div class="assinatura-linha">Coordenação / Gestão Geral</div>
            </div>
        </div>
        
        ${qrCodeUrl ? `
            <div class="qr-code">
                <img src="${qrCodeUrl}" alt="QR Code">
                <p>Identificação do Aluno</p>
            </div>
        ` : ''}
        
        <div class="footer">
            <p>Documento gerado em <strong>${dataGeracao}</strong> — EducaPleno — Gestão Geral — ${cfg.nomeAmigavel}</p>
        </div>
    </body>
    </html>`;
}

async function excluirModulo(modulo, id) {
    const cfg = getCfg(modulo);
    const confirmar = await confirm(`Tem certeza que deseja EXCLUIR este registro de ${cfg.nomeAmigavel}?\n\nEsta ação não pode ser desfeita.`);
    if (!confirmar) return;
    
    try {
        const r = await fetch(`/api/gestao-geral/autorizacao/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const d = await r.json();
        if (d.success) {
            notificar('✅ Excluído com sucesso!', 'success');
            carregarListaModulo(modulo, 1);
        } else {
            notificar('❌ ' + (d.error || 'Erro'), 'error');
        }
    } catch (e) {
        console.error(e);
        notificar('Erro ao excluir', 'error');
    }
}

// ============================================================================
// 🆕 SISTEMA DE SESSÃO DE ASSINATURA VIA QR CODE
// ============================================================================

/**
 * Gera UUID v4
 */
function gerarUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Marca/desmarca necessidade de assinatura.
 * Ao marcar: cria sessão + gera QR + abre modal + inicia polling
 * Ao desmarcar: cancela a sessão
 */
async function toggleNecessitaAssinatura(modulo) {
    const check = safeGet(`${modulo}NecessitaAssinatura`);
    if (!check) return;
    
    if (check.checked) {
        // 1. CAPTURA DO ALUNO
        let alunoId = null, alunoNome = null, alunoTurma = null, alunoCurso = null, alunoMatricula = null;
        
        if (modulo === 'atraso') {
            if (typeof currentAluno !== 'undefined' && currentAluno?.id) {
                alunoId = currentAluno.id; alunoNome = currentAluno.nome;
                alunoTurma = currentAluno.turma; alunoCurso = currentAluno.curso; alunoMatricula = currentAluno.matricula;
            }
            if (!alunoId) {
                const nomeDOM = safeGet('alunoNome')?.textContent?.trim();
                if (nomeDOM && nomeDOM !== '-') {
                    alunoNome = nomeDOM; alunoMatricula = safeGet('alunoMatricula')?.textContent?.trim();
                    alunoTurma = safeGet('alunoTurma')?.textContent?.trim(); alunoCurso = safeGet('alunoCurso')?.textContent?.trim();
                    alunoId = "DOM_" + Date.now();
                }
            }
        } else {
            const est = estados[modulo];
            if (est?.currentAluno?.id) {
                alunoId = est.currentAluno.id; alunoNome = est.currentAluno.nome;
                alunoTurma = est.currentAluno.turma; alunoCurso = est.currentAluno.curso; alunoMatricula = est.currentAluno.matricula;
            }
            if (!alunoId) {
                const P = getPrefixo(modulo);
                const nomeDOM = safeGet(`alunoNome${P}`)?.textContent?.trim();
                if (nomeDOM && nomeDOM !== '-') {
                    alunoNome = nomeDOM; alunoMatricula = safeGet(`alunoMatricula${P}`)?.textContent?.trim();
                    alunoTurma = safeGet(`alunoTurma${P}`)?.textContent?.trim(); alunoCurso = safeGet(`alunoCurso${P}`)?.textContent?.trim();
                    alunoId = "DOM_" + Date.now();
                }
            }
        }
        
        if (!alunoId || !alunoNome) {
            notificar('⚠️ Selecione um aluno antes de marcar a assinatura', 'warning');
            check.checked = false;
            return;
        }

        // 2. CAPTURA DOS DADOS (APENAS DO MÓDULO ATUAL)
        let snapshot = {
            alunoId, alunoNome, alunoMatricula: alunoMatricula || '', alunoTurma: alunoTurma || '', alunoCurso: alunoCurso || ''
        };

        if (modulo === 'atraso') {
            const motivosLabel = { 'onibus': 'Ônibus', 'transito': 'Trânsito', 'problemas_pessoais': 'Problemas Pessoais', 'fardamento': 'Fardamento', 'outros': 'Outros' };
            let motVal = safeGet('motivoSelecionado')?.value || (document.querySelector('#formRegistro .tipo-card.selected')?.getAttribute('data-tipo')) || (typeof motivoSelecionado !== 'undefined' ? motivoSelecionado : '');
            const motivoOutrosTxt = safeGet('motivoOutrosTexto')?.value || '';
            let label = motivosLabel[motVal] || motVal;
            if (motVal === 'outros' && motivoOutrosTxt) label = `Outros (${motivoOutrosTxt})`;

            const dataStr = safeGet('atrasoData')?.value || '';
            const horaChegada = safeGet('atrasoHoraChegada')?.value || '';

            snapshot = {
                ...snapshot,
                motivo: motVal || 'onibus',
                motivoLabel: label || 'Não informado',
                motivoOutros: motivoOutrosTxt,
                descricao: safeGet('descricao')?.value || '',
                observacoes: safeGet('observacoes')?.value || '',
                data: dataStr,
                dataFormatada: dataStr ? new Date(dataStr + 'T12:00:00').toLocaleDateString('pt-BR') : '',
                entradaCompleta: horaChegada,
                horarioPrevisto: safeGet('horarioPrevisto')?.value || ''
            };
        } else {
            const P = getPrefixo(modulo);
            const I = getPrefixoInput(modulo);
            const est = estados[modulo];
            
            const motivosLabelMod = {
                'problemas_pessoais': 'Problemas Pessoais', 'problemas_saude': 'Problemas de Saúde',
                'problemas_saude_responsavel_buscou': 'Problemas de Saúde (Responsável veio buscar)',
                'problemas_saude_responsavel_whatsapp': 'Problemas de Saúde (Responsável via WhatsApp)',
                'necessita_ausentar_retornar': 'Necessita se ausentar e retornar',
                'viagens': 'Viagens', 'consultas': 'Consultas', 'viagem': 'Viagem',
                'tratamento_medico': 'Tratamento Médico', 'outros': 'Outros'
            };

            let motivoInput = safeGet(`${I}MotivoSelecionado`)?.value || est?.motivoSelecionado || (document.querySelector(`#form${P} .tipo-card.selected`)?.getAttribute('data-tipo')) || '';
            const motivoOutrosMod = safeGet(`${I}MotivoOutros`)?.value || '';
            let labelMod = motivosLabelMod[motivoInput] || motivoInput;
            if (motivoInput === 'outros' && motivoOutrosMod) labelMod = `Outros (${motivoOutrosMod})`;

            // Campos base para todos os módulos
            snapshot = {
                ...snapshot,
                motivo: motivoInput,
                motivoLabel: labelMod,
                motivoOutros: motivoOutrosMod,
                responsavelNome: safeGet(`${I}ResponsavelNome`)?.value || '',
                responsavelCPF: safeGet(`${I}ResponsavelCPF`)?.value || '',
                responsavelTelefone: safeGet(`${I}ResponsavelTelefone`)?.value || '',
                observacoes: safeGet(`${I}Observacoes`)?.value || '',
                data: safeGet(`${I}Data`)?.value || ''
            };

            // Adiciona campos específicos de cada módulo
            if (modulo === 'autorizacao') {
                const dEntrada = safeGet('autorizacaoDataEntrada')?.value || '';
                const hEntrada = safeGet('autorizacaoHorarioEntrada')?.value || '';
                const dSaida = safeGet('autorizacaoDataSaida')?.value || '';
                const hSaida = safeGet('autorizacaoHorarioSaida')?.value || '';
                
                let entradaCompleta = (dEntrada || hEntrada) 
                    ? `${dEntrada ? new Date(dEntrada+'T12:00:00').toLocaleDateString('pt-BR') : ''} ${hEntrada ? 'às '+hEntrada : ''}`.trim() 
                    : null;
                let saidaCompleta = (dSaida || hSaida) 
                    ? `${dSaida ? new Date(dSaida+'T12:00:00').toLocaleDateString('pt-BR') : ''} ${hSaida ? 'às '+hSaida : ''}`.trim() 
                    : null;

                snapshot.dataEntrada = dEntrada || null;
                snapshot.horarioEntrada = hEntrada || null;
                snapshot.dataSaida = dSaida || null;
                snapshot.horarioSaida = hSaida || null;
                snapshot.entradaCompleta = entradaCompleta;
                snapshot.saidaCompleta = saidaCompleta;
            }

            if (modulo === 'justificativa' || modulo === 'segundaChamada') {
                const pIni = safeGet(`${I}PeriodoFaltaInicio`)?.value || '';
                const pFim = safeGet(`${I}PeriodoFaltaFim`)?.value || '';
                let pFormatado = '';
                if (pIni) {
                    const dIni = new Date(pIni + 'T12:00:00');
                    const dFim = pFim ? new Date(pFim + 'T12:00:00') : dIni;
                    const fmt = d => d.toLocaleDateString('pt-BR');
                    pFormatado = dIni.getTime() === dFim.getTime() ? fmt(dIni) : `${fmt(dIni)} a ${fmt(dFim)}`;
                }
                snapshot.periodoFaltaInicio = pIni || null;
                snapshot.periodoFaltaFim = pFim || pIni || null;
                snapshot.periodoFaltaFormatado = pFormatado;
            }

            if (modulo === 'segundaChamada') {
                let tProva = safeGet('segundaChamadaTipoProvaPerdida')?.value || '';
                const tProvaOutros = safeGet('segundaChamadaTipoProvaOutros')?.value || '';
                let pProva = safeGet('segundaChamadaPeriodoProva')?.value || '';
                let tipoProvaFormatado = tProva ? ((tProva === 'Outros' && tProvaOutros) ? `Outros (${tProvaOutros})` : tProva) : null;

                snapshot.tipoProvaPerdida = tProva || null;
                snapshot.tipoProvaPerdidaOutros = tProvaOutros || null;
                snapshot.tipoProvaPerdidaFormatado = tipoProvaFormatado;
                snapshot.periodoProva = pProva || null;
            }
            
            if (modulo === 'uniforme') {
                const uIni = safeGet('uniformePeriodoInicio')?.value || '';
                const uFim = safeGet('uniformePeriodoFim')?.value || '';
                let uFormatado = '';
                if (uIni) {
                    const dIni = new Date(uIni + 'T12:00:00');
                    const dFim = uFim ? new Date(uFim + 'T12:00:00') : dIni;
                    const fmt = d => d.toLocaleDateString('pt-BR');
                    uFormatado = dIni.getTime() === dFim.getTime() ? fmt(dIni) : `${fmt(dIni)} a ${fmt(dFim)}`;
                }
                snapshot.uniformePeriodoInicio = uIni || null;
                snapshot.uniformePeriodoFim = uFim || null;
                snapshot.uniformePeriodoFormatado = uFormatado;
            }
        }
        
        console.log('%c📦 ENVIANDO PARA O BANCO:', 'background:#10b981;color:white;padding:4px;font-weight:bold;', snapshot);
        
        const sessaoId = gerarUUID();
        estadoSessaoAssinatura[modulo].sessaoId = sessaoId;
        estadoSessaoAssinatura[modulo].assinaturaCapturada = null;
        
        try {
            const tipoSessao = modulo === 'atraso' ? 'atraso' : modulo === 'segundaChamada' ? 'segunda_chamada' : modulo;
            const response = await fetch('/api/gestao-geral/sessoes-assinatura', {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ sessaoId, tipo: tipoSessao, dadosAtendimento: snapshot })
            });
            
            const data = await response.json();
            if (!data.success) throw new Error(data.error || 'Erro ao criar sessão');
            
            const urlAssinatura = `${window.location.origin}/gestao-geral.html?assinatura=${sessaoId}`;
            try {
                const qrResponse = await fetch('/api/qrcode/gerar', {
                    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ url: urlAssinatura })
                });
                const qrData = await qrResponse.json();
                estadoSessaoAssinatura[modulo].qrCodeDataUrl = (qrData.success && qrData.qrCode) ? qrData.qrCode : `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(urlAssinatura)}`;
            } catch (e) {
                estadoSessaoAssinatura[modulo].qrCodeDataUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(urlAssinatura)}`;
            }
            
            abrirModalAssinatura(modulo, urlAssinatura);
            iniciarMonitoramentoSessao(modulo, sessaoId);
            notificar('📱 QR Code gerado!', 'info');
        } catch (e) {
            console.error('Erro:', e);
            notificar('❌ Erro: ' + e.message, 'error');
            check.checked = false;
            estadoSessaoAssinatura[modulo].sessaoId = null;
        }
    } else {
        await cancelarSessaoAssinatura(modulo);
    }
}

/**
 * Monta snapshot dos dados atuais para exibir na tela de assinatura.
 */
function montarSnapshotAtendimento(modulo) {
    const est = estados[modulo];
    if (!est) {
        console.error(`❌ [${modulo}] Estado não encontrado!`);
        return { alunoId: null };
    }

    let aluno = est.currentAluno;
    
    if (!aluno || !aluno.id) {
        const P = getPrefixo(modulo);
        const nomeNaTela = safeGet(`alunoNome${P}`)?.textContent;
        
        if (nomeNaTela && nomeNaTela !== '-') {
            aluno = {
                id: "SALVO_PELA_TELA_" + Date.now(), 
                nome: nomeNaTela,
                turma: safeGet(`alunoTurma${P}`)?.textContent || '',
                curso: safeGet(`alunoCurso${P}`)?.textContent || '',
                matricula: safeGet(`alunoMatricula${P}`)?.textContent || ''
            };
        }
    }

    if (!aluno || !aluno.id) {
        console.error(`❌ [${modulo}] Impossível capturar o aluno.`);
        return { alunoId: null };
    }

    const cfg = getCfg(modulo);
    const I = getPrefixoInput(modulo);

    if (modulo === 'atraso') {
        return {
            alunoId: aluno.id,
            alunoNome: aluno.nome,
            alunoMatricula: aluno.matricula,
            alunoTurma: aluno.turma,
            alunoCurso: aluno.curso,
            alunoFoto: aluno.fotoPerfil,
            motivo: motivoSelecionado,
            motivoLabel: getMotivoLabelAtraso(motivoSelecionado),
            descricao: safeGet('descricao')?.value || '',
            observacoes: safeGet('observacoes')?.value || '',
            dataHora: safeGet('atrasoData')?.value || ''
        };
    }

    const motivosLabel = {
        'problemas_pessoais': 'Problemas Pessoais',
        'problemas_saude': 'Problemas de Saúde',
        'problemas_saude_responsavel_buscou': 'Problemas de Saúde (Responsável veio buscar)',
        'problemas_saude_responsavel_whatsapp': 'Problemas de Saúde (Responsável via WhatsApp)',
        'necessita_ausentar_retornar': 'Necessita se ausentar e retornar',
        'viagens': 'Viagens',
        'consultas': 'Consultas',
        'viagem': 'Viagem',
        'tratamento_medico': 'Tratamento Médico',
        'outros': 'Outros'
    };

    const pIni = safeGet(`${I}PeriodoFaltaInicio`)?.value || '';
    const pFim = safeGet(`${I}PeriodoFaltaFim`)?.value || '';
    let pFormatado = '';
    if (pIni) {
        const dIni = new Date(pIni + 'T12:00:00');
        const dFim = pFim ? new Date(pFim + 'T12:00:00') : dIni;
        const fmt = d => d.toLocaleDateString('pt-BR');
        pFormatado = dIni.getTime() === dFim.getTime() ? fmt(dIni) : `${fmt(dIni)} a ${fmt(dFim)}`;
    }

    const tProva = safeGet('segundaChamadaTipoProvaPerdida')?.value || '';
    const tProvaOutros = safeGet('segundaChamadaTipoProvaOutros')?.value || '';
    const pProva = safeGet('segundaChamadaPeriodoProva')?.value || '';

    const uIni = safeGet('uniformePeriodoInicio')?.value || '';
    const uFim = safeGet('uniformePeriodoFim')?.value || '';
    let uFormatado = '';
    if (uIni) {
        const dIni = new Date(uIni + 'T12:00:00');
        const dFim = uFim ? new Date(uFim + 'T12:00:00') : dIni;
        const fmt = d => d.toLocaleDateString('pt-BR');
        uFormatado = dIni.getTime() === dFim.getTime() ? fmt(dIni) : `${fmt(dIni)} a ${fmt(dFim)}`;
    }

    // 🆕 Entrada/Saída (Autorização)
    const dEntrada = safeGet(`${I}DataEntrada`)?.value || '';
    const dSaida = safeGet(`${I}DataSaida`)?.value || '';
    const hEntrada = safeGet(`${I}HorarioEntrada`)?.value || '';
    const hSaida = safeGet(`${I}HorarioSaida`)?.value || '';

    let entradaCompleta = '';
    if (dEntrada || hEntrada) {
        const partes = [];
        if (dEntrada) partes.push(new Date(dEntrada + 'T12:00:00').toLocaleDateString('pt-BR'));
        if (hEntrada) partes.push(dEntrada ? `às ${hEntrada}` : hEntrada);
        entradaCompleta = partes.join(' ');
    }

    let saidaCompleta = '';
    if (dSaida || hSaida) {
        const partes = [];
        if (dSaida) partes.push(new Date(dSaida + 'T12:00:00').toLocaleDateString('pt-BR'));
        if (hSaida) partes.push(dSaida ? `às ${hSaida}` : hSaida);
        saidaCompleta = partes.join(' ');
    }

    return {
        alunoId: aluno.id,
        alunoNome: aluno.nome,
        alunoMatricula: aluno.matricula,
        alunoTurma: aluno.turma,
        alunoCurso: aluno.curso,
        alunoFoto: aluno.fotoPerfil,
        motivo: est.motivoSelecionado,
        motivoLabel: motivosLabel[est.motivoSelecionado] || est.motivoSelecionado,
        periodoFaltaInicio: pIni || null,
        periodoFaltaFim: pFim || pIni || null,
        periodoFaltaFormatado: pFormatado,
        tipoProvaPerdida: cfg.tipo === 'segunda_chamada' ? tProva : null,
        tipoProvaPerdidaFormatado: cfg.tipo === 'segunda_chamada' ? (tProva === 'Outros' && tProvaOutros ? `Outros (${tProvaOutros})` : tProva) : null,
        periodoProva: cfg.tipo === 'segunda_chamada' ? pProva : null,
        uniformePeriodoInicio: uIni || null,
        uniformePeriodoFim: uFim || null,
        uniformePeriodoFormatado: uFormatado,
        // 🆕 ENTRADA / SAÍDA
        dataEntrada: dEntrada || null,
        dataSaida: dSaida || null,
        horarioEntrada: hEntrada || null,
        horarioSaida: hSaida || null,
        entradaCompleta: entradaCompleta,
        saidaCompleta: saidaCompleta,
        responsavelNome: safeGet(`${I}ResponsavelNome`)?.value || '',
        responsavelCPF: safeGet(`${I}ResponsavelCPF`)?.value || '',
        observacoes: safeGet(`${I}Observacoes`)?.value || '',
        data: safeGet(`${I}Data`)?.value || ''
    };
}

function getMotivoLabelAtraso(motivo) {
    const labels = {
        'onibus': 'Ônibus',
        'transito': 'Trânsito',
        'problemas_pessoais': 'Problemas Pessoais',
        'fardamento': 'Fardamento',
        'outros': 'Outros'
    };
    return labels[motivo] || motivo;
}

function abrirModalAssinatura(modulo, urlAssinatura) {
    const antigo = safeGet('modalAssinaturaQR');
    if (antigo) antigo.remove();
    
    const qrUrl = estadoSessaoAssinatura[modulo].qrCodeDataUrl || 
        `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(urlAssinatura)}`;
    
    const modalHtml = `
        <div class="modal fade" id="modalAssinaturaQR" tabindex="-1" data-bs-backdrop="static" data-bs-keyboard="false">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content" style="border-radius: 20px; border: none; overflow: hidden;">
                    <div class="modal-header" style="background: linear-gradient(135deg, #1e3c72, #2a5298); color: white; border: none; padding: 20px 25px;">
                        <h5 class="modal-title" style="display: flex; align-items: center; gap: 10px;">
                            <i class="fas fa-signature"></i> 
                            Aguardando Assinatura
                        </h5>
                        <button type="button" class="btn-close btn-close-white" onclick="gestaoGeral.fecharModalAssinatura('${modulo}')"></button>
                    </div>
                    
                    <div class="modal-body" style="padding: 30px; text-align: center;">
                        <div id="modalAssinaturaStatus" style="margin-bottom: 20px;">
                            <div style="background: #fef3c7; border-radius: 12px; padding: 14px; display: flex; align-items: center; gap: 12px; text-align: left;">
                                <div style="width: 40px; height: 40px; border-radius: 50%; border: 4px solid #f59e0b; border-top-color: transparent; animation: spin 1s linear infinite; flex-shrink: 0;"></div>
                                <div>
                                    <strong style="color: #92400e;">Aguardando assinatura...</strong>
                                    <p style="margin: 3px 0 0; font-size: 13px; color: #78350f;">
                                        Peça para o responsável escanear o QR Code abaixo
                                    </p>
                                </div>
                            </div>
                        </div>
                        
                        <div style="background: white; border: 2px solid #e2e8f0; border-radius: 16px; padding: 20px; display: inline-block;">
                            <img src="${qrUrl}" 
                                alt="QR Code para assinatura" 
                                style="width: 260px; height: 260px; display: block;"
                                id="qrCodeImage">
                            <p style="margin: 12px 0 0; font-size: 13px; color: #64748b;">
                                <i class="fas fa-mobile-alt"></i> 
                                Aponte a câmera do celular
                            </p>
                        </div>
                        
                        <div style="margin-top: 20px; padding: 14px; background: #f0f9ff; border-radius: 12px; font-size: 13px; color: #0369a1; text-align: left;">
                            <div style="display: flex; gap: 8px; margin-bottom: 6px;">
                                <i class="fas fa-info-circle"></i>
                                <span><strong>O responsável assina direto no celular dele</strong>, sem sair da tela. Assim que ele confirmar, você verá aqui automaticamente.</span>
                            </div>
                            <div style="display: flex; gap: 8px;">
                                <i class="fas fa-clock"></i>
                                <span>Sessão válida por <strong>30 minutos</strong>.</span>
                            </div>
                        </div>
                        
                        <div style="margin-top: 16px;">
                            <button onclick="gestaoGeral.copiarLinkAssinatura('${urlAssinatura}')"
                                    class="btn-copiar-link">
                                <i class="fas fa-link"></i> Copiar link de assinatura
                            </button>
                        </div>
                    </div>
                    
                    <div class="modal-footer" style="border-top: 1px solid #e5e7eb; padding: 15px 25px; justify-content: space-between;">
                        <button type="button" class="btn btn-outline-secondary" onclick="gestaoGeral.fecharModalAssinatura('${modulo}')" style="border-radius: 10px;">
                            <i class="fas fa-eye-slash"></i> Ocultar
                        </button>
                        <button type="button" class="btn btn-danger" onclick="gestaoGeral.cancelarSessaoAssinatura('${modulo}')" style="border-radius: 10px;">
                            <i class="fas fa-times"></i> Cancelar Assinatura
                        </button>
                    </div>
                </div>
            </div>
        </div>
        
        <style>
            @keyframes spin { to { transform: rotate(360deg); } }
        </style>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    estadoSessaoAssinatura[modulo].modalInstance = new bootstrap.Modal(safeGet('modalAssinaturaQR'));
    estadoSessaoAssinatura[modulo].modalInstance.show();
    
    setTimeout(() => {
        const img = safeGet('qrCodeImage');
        if (img && window.innerWidth < 500) {
            img.style.width = '200px';
            img.style.height = '200px';
        }
    }, 200);
}

function fecharModalAssinatura(modulo) {
    if (estadoSessaoAssinatura[modulo].modalInstance) {
        estadoSessaoAssinatura[modulo].modalInstance.hide();
    }
    const modalEl = safeGet('modalAssinaturaQR');
    if (modalEl) setTimeout(() => modalEl.remove(), 300);
    
    mostrarBlocoCompactoAssinatura(modulo);
}

function mostrarBlocoCompactoAssinatura(modulo) {
    let bloco = safeGet(`${modulo}BlocoAssinaturaInfo`);
    
    if (!bloco) {
        bloco = document.createElement('div');
        bloco.id = `${modulo}BlocoAssinaturaInfo`;
        const check = safeGet(`${modulo}NecessitaAssinatura`);
        if (check && check.parentElement) {
            check.parentElement.parentElement.appendChild(bloco);
        }
    }
    
    bloco.style.display = 'block';
    bloco.innerHTML = `
        <div class="alert alert-warning" style="font-size: 13px; border-radius: 10px; border-left: 4px solid #f59e0b; margin-top: 10px;">
            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                <i class="fas fa-clock"></i>
                <div style="flex: 1;">
                    <strong>Aguardando assinatura...</strong>
                    <p style="margin: 3px 0 0; font-size: 12px;">O responsável precisa escanear o QR Code</p>
                </div>
                <button type="button" class="btn btn-sm btn-warning" 
                        onclick="gestaoGeral.reabrirModalAssinatura('${modulo}')"
                        style="border-radius: 8px;">
                    <i class="fas fa-qrcode"></i> Mostrar QR
                </button>
            </div>
        </div>
    `;
}

function reabrirModalAssinatura(modulo) {
    const sessaoId = estadoSessaoAssinatura[modulo].sessaoId;
    if (!sessaoId) {
        notificar('⚠️ Nenhuma sessão ativa', 'warning');
        return;
    }
    const urlAssinatura = `${window.location.origin}/gestao-geral.html?assinatura=${sessaoId}`;
    abrirModalAssinatura(modulo, urlAssinatura);
}

async function copiarLinkAssinatura(url) {
    try {
        await navigator.clipboard.writeText(url);
        notificar('✅ Link copiado!', 'success');
    } catch (e) {
        const textarea = document.createElement('textarea');
        textarea.value = url;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        notificar('✅ Link copiado!', 'success');
    }
}

function iniciarMonitoramentoSessao(modulo, sessaoId) {
    pararMonitoramentoSessao(modulo);
    
    console.log('👀 Monitorando sessão:', sessaoId);
    
    const intervalId = setInterval(async () => {
        try {
            const response = await fetch(`/api/gestao-geral/sessoes-assinatura/${sessaoId}`);
            
            if (!response.ok) {
                if (response.status === 404) {
                    console.warn('⚠️ Sessão expirou ou foi removida');
                    pararMonitoramentoSessao(modulo);
                    
                    estadoSessaoAssinatura[modulo].sessaoId = null;
                    const check = safeGet(`${modulo}NecessitaAssinatura`);
                    if (check) check.checked = false;
                    
                    const bloco = safeGet(`${modulo}BlocoAssinaturaInfo`);
                    if (bloco) bloco.style.display = 'none';
                    
                    notificar('⚠️ Sessão de assinatura expirou. Marque novamente.', 'warning');
                }
                return;
            }
            
            const data = await response.json();
            if (!data.success) return;
            
            if (data.sessao.status === 'assinado') {
                console.log('✅ Assinatura capturada!');
                
                estadoSessaoAssinatura[modulo].assinaturaCapturada = data.sessao.assinaturaBase64;
                
                atualizarStatusAssinado(modulo, data.sessao);
                pararMonitoramentoSessao(modulo);
                
                if (estadoSessaoAssinatura[modulo].modalInstance) {
                    estadoSessaoAssinatura[modulo].modalInstance.hide();
                }
                const modalEl = safeGet('modalAssinaturaQR');
                if (modalEl) setTimeout(() => modalEl.remove(), 300);
                
                notificar(`✅ Assinatura capturada por ${data.sessao.assinadaPorNome || 'Responsável'}!`, 'success');
                
            } else if (data.sessao.status === 'cancelado') {
                console.log('🚫 Sessão cancelada');
                pararMonitoramentoSessao(modulo);
                estadoSessaoAssinatura[modulo].sessaoId = null;
                
                const check = safeGet(`${modulo}NecessitaAssinatura`);
                if (check) check.checked = false;
                
                const bloco = safeGet(`${modulo}BlocoAssinaturaInfo`);
                if (bloco) bloco.style.display = 'none';
            }
        } catch (e) {
            console.warn('Erro no monitoramento:', e);
        }
    }, 3000);
    
    estadoSessaoAssinatura[modulo].monitoramentoInterval = intervalId;
}

function pararMonitoramentoSessao(modulo) {
    const id = estadoSessaoAssinatura[modulo]?.monitoramentoInterval;
    if (id) {
        clearInterval(id);
        estadoSessaoAssinatura[modulo].monitoramentoInterval = null;
    }
}

function atualizarStatusAssinado(modulo, sessao) {
    let bloco = safeGet(`${modulo}BlocoAssinaturaInfo`);
    
    if (!bloco) {
        bloco = document.createElement('div');
        bloco.id = `${modulo}BlocoAssinaturaInfo`;
        const check = safeGet(`${modulo}NecessitaAssinatura`);
        if (check && check.parentElement) {
            check.parentElement.parentElement.appendChild(bloco);
        }
    }
    
    bloco.style.display = 'block';
    bloco.innerHTML = `
        <div style="margin-top: 10px; background: #f0fdf4; border: 2px solid #10b981; border-radius: 12px; padding: 14px;">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                <i class="fas fa-check-circle" style="color: #10b981; font-size: 22px;"></i>
                <div style="flex: 1;">
                    <strong style="color: #065f46;">✓ Assinatura capturada!</strong>
                    <p style="margin: 3px 0 0; font-size: 12px; color: #047857;">
                        Assinado por <strong>${escapeHTML(sessao.assinadaPorNome || '')}</strong>
                        ${sessao.assinadaEm ? ` em ${new Date(sessao.assinadaEm).toLocaleString('pt-BR')}` : ''}
                    </p>
                </div>
            </div>
            <div style="background: white; border-radius: 8px; padding: 8px; text-align: center;">
                <img src="${sessao.assinaturaBase64}" 
                    style="max-width: 100%; max-height: 100px;" 
                    alt="Assinatura">
            </div>
            <button type="button" 
                    onclick="gestaoGeral.refazerAssinatura('${modulo}')"
                    class="btn btn-sm btn-outline-danger w-100 mt-2"
                    style="border-radius: 8px;">
                <i class="fas fa-redo"></i> Refazer Assinatura
            </button>
        </div>
    `;
}

async function cancelarSessaoAssinatura(modulo) {
    const confirmar = await confirm('Cancelar a assinatura? O responsável não poderá mais assinar este atendimento.');
    if (!confirmar) {
        const check = safeGet(`${modulo}NecessitaAssinatura`);
        if (check) check.checked = true;
        return;
    }
    
    const sessaoId = estadoSessaoAssinatura[modulo].sessaoId;
    if (sessaoId) {
        try {
            await fetch(`/api/gestao-geral/sessoes-assinatura/${sessaoId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        } catch (e) { console.warn(e); }
    }
    
    pararMonitoramentoSessao(modulo);
    fecharModalAssinatura(modulo);
    
    estadoSessaoAssinatura[modulo].sessaoId = null;
    estadoSessaoAssinatura[modulo].assinaturaCapturada = null;
    estadoSessaoAssinatura[modulo].qrCodeDataUrl = null;
    
    const check = safeGet(`${modulo}NecessitaAssinatura`);
    if (check) check.checked = false;
    
    const bloco = safeGet(`${modulo}BlocoAssinaturaInfo`);
    if (bloco) bloco.style.display = 'none';
    
    notificar('Sessão cancelada', 'info');
}

async function refazerAssinatura(modulo) {
    const confirmar = await confirm('Refazer a assinatura? A atual será descartada.');
    if (!confirmar) return;
    
    const sessaoId = estadoSessaoAssinatura[modulo].sessaoId;
    if (sessaoId) {
        try {
            await fetch(`/api/gestao-geral/sessoes-assinatura/${sessaoId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        } catch (e) { console.warn(e); }
    }
    
    pararMonitoramentoSessao(modulo);
    estadoSessaoAssinatura[modulo].sessaoId = null;
    estadoSessaoAssinatura[modulo].assinaturaCapturada = null;
    estadoSessaoAssinatura[modulo].qrCodeDataUrl = null;
    
    const bloco = safeGet(`${modulo}BlocoAssinaturaInfo`);
    if (bloco) bloco.style.display = 'none';
    
    const check = safeGet(`${modulo}NecessitaAssinatura`);
    if (check) {
        check.checked = false;
        check.checked = true;
        await toggleNecessitaAssinatura(modulo);
    }
}

function limparEstadoSessaoAssinatura(modulo) {
    estadoSessaoAssinatura[modulo] = {
        sessaoId: null,
        assinaturaCapturada: null,
        qrCodeDataUrl: null,
        monitoramentoInterval: null,
        modalInstance: null
    };
}

// ============================================================================
// 🆕 SISTEMA DE ASSINATURA DO ALUNO (Apenas Atrasos)
// ============================================================================

async function toggleNecessitaAssinaturaAluno(modulo) {
    if (modulo !== 'atraso') return;
    const check = safeGet(`${modulo}NecessitaAssinaturaAluno`);
    if (!check) return;
    
    if (check.checked) {
        let alunoId = null, alunoNome = null, alunoTurma = null, alunoCurso = null, alunoMatricula = null;
        
        if (typeof currentAluno !== 'undefined' && currentAluno?.id) {
            alunoId = currentAluno.id; alunoNome = currentAluno.nome;
            alunoTurma = currentAluno.turma; alunoCurso = currentAluno.curso; alunoMatricula = currentAluno.matricula;
        }
        if (!alunoId) {
            const nomeDOM = safeGet('alunoNome')?.textContent?.trim();
            if (nomeDOM && nomeDOM !== '-') {
                alunoNome = nomeDOM; alunoMatricula = safeGet('alunoMatricula')?.textContent?.trim();
                alunoTurma = safeGet('alunoTurma')?.textContent?.trim(); alunoCurso = safeGet('alunoCurso')?.textContent?.trim();
                alunoId = "DOM_" + Date.now();
            }
        }
        if (!alunoId || !alunoNome) {
            notificar('⚠️ Selecione um aluno antes de marcar a assinatura', 'warning');
            check.checked = false;
            return;
        }

        const motivosLabel = { 'onibus': 'Ônibus', 'transito': 'Trânsito', 'problemas_pessoais': 'Problemas Pessoais', 'fardamento': 'Fardamento', 'outros': 'Outros' };
        let motVal = safeGet('motivoSelecionado')?.value || (document.querySelector('#formRegistro .tipo-card.selected')?.getAttribute('data-tipo')) || (typeof motivoSelecionado !== 'undefined' ? motivoSelecionado : '');
        const motivoOutrosTxt = safeGet('motivoOutrosTexto')?.value || '';
        let label = motivosLabel[motVal] || motVal;
        if (motVal === 'outros' && motivoOutrosTxt) label = `Outros (${motivoOutrosTxt})`;

        const dataStr = safeGet('atrasoData')?.value || '';
        const horaChegada = safeGet('atrasoHoraChegada')?.value || '';

        const snapshot = {
            alunoId, alunoNome, alunoMatricula: alunoMatricula || '', alunoTurma: alunoTurma || '', alunoCurso: alunoCurso || '',
            motivo: motVal || 'onibus',
            motivoLabel: label || 'Não informado',
            motivoOutros: motivoOutrosTxt,
            descricao: safeGet('descricao')?.value || '',
            observacoes: safeGet('observacoes')?.value || '',
            data: dataStr,
            entradaCompleta: horaChegada,
            horarioPrevisto: safeGet('horarioPrevisto')?.value || '',
            tipoAssinante: 'aluno'
        };
        
        console.log('%c📦 ENVIANDO (ALUNO - ATRASO):', 'background:#059669;color:white;padding:4px;font-weight:bold;', snapshot);
        
        const sessaoId = gerarUUID();
        estadoSessaoAssinaturaAluno[modulo].sessaoId = sessaoId;
        estadoSessaoAssinaturaAluno[modulo].assinaturaCapturada = null;
        
        try {
            const response = await fetch('/api/gestao-geral/sessoes-assinatura', {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ sessaoId, tipo: 'atraso_aluno', dadosAtendimento: snapshot })
            });
            
            const data = await response.json();
            if (!data.success) throw new Error(data.error || 'Erro ao criar sessão');
            
            const urlAssinatura = `${window.location.origin}/gestao-geral.html?assinatura=${sessaoId}`;
            try {
                const qrResponse = await fetch('/api/qrcode/gerar', {
                    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ url: urlAssinatura })
                });
                const qrData = await qrResponse.json();
                estadoSessaoAssinaturaAluno[modulo].qrCodeDataUrl = (qrData.success && qrData.qrCode) ? qrData.qrCode : `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(urlAssinatura)}`;
            } catch (e) {
                estadoSessaoAssinaturaAluno[modulo].qrCodeDataUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(urlAssinatura)}`;
            }
            
            abrirModalAssinaturaAluno(modulo, urlAssinatura);
            iniciarMonitoramentoSessaoAluno(modulo, sessaoId);
            notificar('📱 QR Code do aluno gerado!', 'info');
        } catch (e) {
            console.error('Erro:', e);
            notificar('❌ Erro: ' + e.message, 'error');
            check.checked = false;
            estadoSessaoAssinaturaAluno[modulo].sessaoId = null;
        }
    } else {
        await cancelarSessaoAssinaturaAluno(modulo);
    }
}

function abrirModalAssinaturaAluno(modulo, urlAssinatura) {
    const antigo = safeGet('modalAssinaturaAlunoQR');
    if (antigo) antigo.remove();
    
    const qrUrl = estadoSessaoAssinaturaAluno[modulo].qrCodeDataUrl || 
        `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(urlAssinatura)}`;
    
    const modalHtml = `
        <div class="modal fade" id="modalAssinaturaAlunoQR" tabindex="-1" data-bs-backdrop="static" data-bs-keyboard="false">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content" style="border-radius: 20px; border: none; overflow: hidden;">
                    <div class="modal-header" style="background: linear-gradient(135deg, #059669, #10b981); color: white; border: none; padding: 20px 25px;">
                        <h5 class="modal-title" style="display: flex; align-items: center; gap: 10px;">
                            <i class="fas fa-user-graduate"></i> 
                            Aguardando Assinatura do Aluno
                        </h5>
                        <button type="button" class="btn-close btn-close-white" onclick="gestaoGeral.fecharModalAssinaturaAluno('${modulo}')"></button>
                    </div>
                    
                    <div class="modal-body" style="padding: 30px; text-align: center;">
                        <div id="modalAssinaturaAlunoStatus" style="margin-bottom: 20px;">
                            <div style="background: #fef3c7; border-radius: 12px; padding: 14px; display: flex; align-items: center; gap: 12px; text-align: left;">
                                <div style="width: 40px; height: 40px; border-radius: 50%; border: 4px solid #f59e0b; border-top-color: transparent; animation: spin 1s linear infinite; flex-shrink: 0;"></div>
                                <div>
                                    <strong style="color: #92400e;">Aguardando assinatura do aluno...</strong>
                                    <p style="margin: 3px 0 0; font-size: 13px; color: #78350f;">
                                        Peça para o aluno escanear o QR Code abaixo
                                    </p>
                                </div>
                            </div>
                        </div>
                        
                        <div style="background: white; border: 2px solid #e2e8f0; border-radius: 16px; padding: 20px; display: inline-block;">
                            <img src="${qrUrl}" 
                                alt="QR Code para assinatura do aluno" 
                                style="width: 260px; height: 260px; display: block;"
                                id="qrCodeAlunoImage">
                            <p style="margin: 12px 0 0; font-size: 13px; color: #64748b;">
                                <i class="fas fa-mobile-alt"></i> 
                                Aponte a câmera do celular
                            </p>
                        </div>
                        
                        <div style="margin-top: 20px; padding: 14px; background: #f0f9ff; border-radius: 12px; font-size: 13px; color: #0369a1; text-align: left;">
                            <div style="display: flex; gap: 8px; margin-bottom: 6px;">
                                <i class="fas fa-info-circle"></i>
                                <span><strong>O aluno assina direto no celular dele</strong>. Assim que confirmar, você verá aqui automaticamente.</span>
                            </div>
                            <div style="display: flex; gap: 8px;">
                                <i class="fas fa-clock"></i>
                                <span>Sessão válida por <strong>30 minutos</strong>.</span>
                            </div>
                        </div>
                        
                        <div style="margin-top: 16px;">
                            <button onclick="gestaoGeral.copiarLinkAssinatura('${urlAssinatura}')"
                                    class="btn-copiar-link">
                                <i class="fas fa-link"></i> Copiar link de assinatura
                            </button>
                        </div>
                    </div>
                    
                    <div class="modal-footer" style="border-top: 1px solid #e5e7eb; padding: 15px 25px; justify-content: space-between;">
                        <button type="button" class="btn btn-outline-secondary" onclick="gestaoGeral.fecharModalAssinaturaAluno('${modulo}')" style="border-radius: 10px;">
                            <i class="fas fa-eye-slash"></i> Ocultar
                        </button>
                        <button type="button" class="btn btn-danger" onclick="gestaoGeral.cancelarSessaoAssinaturaAluno('${modulo}')" style="border-radius: 10px;">
                            <i class="fas fa-times"></i> Cancelar Assinatura
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    estadoSessaoAssinaturaAluno[modulo].modalInstance = new bootstrap.Modal(safeGet('modalAssinaturaAlunoQR'));
    estadoSessaoAssinaturaAluno[modulo].modalInstance.show();
    
    setTimeout(() => {
        const img = safeGet('qrCodeAlunoImage');
        if (img && window.innerWidth < 500) {
            img.style.width = '200px';
            img.style.height = '200px';
        }
    }, 200);
}

function fecharModalAssinaturaAluno(modulo) {
    if (estadoSessaoAssinaturaAluno[modulo].modalInstance) {
        estadoSessaoAssinaturaAluno[modulo].modalInstance.hide();
    }
    const modalEl = safeGet('modalAssinaturaAlunoQR');
    if (modalEl) setTimeout(() => modalEl.remove(), 300);
    
    mostrarBlocoCompactoAssinaturaAluno(modulo);
}

function mostrarBlocoCompactoAssinaturaAluno(modulo) {
    let bloco = safeGet(`${modulo}BlocoAssinaturaAlunoInfo`);
    
    if (!bloco) {
        bloco = document.createElement('div');
        bloco.id = `${modulo}BlocoAssinaturaAlunoInfo`;
        const check = safeGet(`${modulo}NecessitaAssinaturaAluno`);
        if (check && check.parentElement) {
            check.parentElement.parentElement.appendChild(bloco);
        }
    }
    
    bloco.style.display = 'block';
    bloco.innerHTML = `
        <div class="alert alert-warning" style="font-size: 13px; border-radius: 10px; border-left: 4px solid #f59e0b; margin-top: 10px;">
            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                <i class="fas fa-clock"></i>
                <div style="flex: 1;">
                    <strong>Aguardando assinatura do aluno...</strong>
                    <p style="margin: 3px 0 0; font-size: 12px;">O aluno precisa escanear o QR Code</p>
                </div>
                <button type="button" class="btn btn-sm btn-warning" 
                        onclick="gestaoGeral.reabrirModalAssinaturaAluno('${modulo}')"
                        style="border-radius: 8px;">
                    <i class="fas fa-qrcode"></i> Mostrar QR
                </button>
            </div>
        </div>
    `;
}

function reabrirModalAssinaturaAluno(modulo) {
    const sessaoId = estadoSessaoAssinaturaAluno[modulo].sessaoId;
    if (!sessaoId) {
        notificar('⚠️ Nenhuma sessão ativa', 'warning');
        return;
    }
    const urlAssinatura = `${window.location.origin}/gestao-geral.html?assinatura=${sessaoId}`;
    abrirModalAssinaturaAluno(modulo, urlAssinatura);
}

function iniciarMonitoramentoSessaoAluno(modulo, sessaoId) {
    pararMonitoramentoSessaoAluno(modulo);
    
    console.log('👀 Monitorando sessão do aluno:', sessaoId);
    
    const intervalId = setInterval(async () => {
        try {
            const response = await fetch(`/api/gestao-geral/sessoes-assinatura/${sessaoId}`);
            
            if (!response.ok) {
                if (response.status === 404) {
                    console.warn('⚠️ Sessão do aluno expirou');
                    pararMonitoramentoSessaoAluno(modulo);
                    
                    estadoSessaoAssinaturaAluno[modulo].sessaoId = null;
                    const check = safeGet(`${modulo}NecessitaAssinaturaAluno`);
                    if (check) check.checked = false;
                    
                    const bloco = safeGet(`${modulo}BlocoAssinaturaAlunoInfo`);
                    if (bloco) bloco.style.display = 'none';
                    
                    notificar('⚠️ Sessão de assinatura do aluno expirou. Marque novamente.', 'warning');
                }
                return;
            }
            
            const data = await response.json();
            if (!data.success) return;
            
            if (data.sessao.status === 'assinado') {
                console.log('✅ Assinatura do aluno capturada!');
                
                estadoSessaoAssinaturaAluno[modulo].assinaturaCapturada = data.sessao.assinaturaBase64;
                
                atualizarStatusAssinadoAluno(modulo, data.sessao);
                pararMonitoramentoSessaoAluno(modulo);
                
                if (estadoSessaoAssinaturaAluno[modulo].modalInstance) {
                    estadoSessaoAssinaturaAluno[modulo].modalInstance.hide();
                }
                const modalEl = safeGet('modalAssinaturaAlunoQR');
                if (modalEl) setTimeout(() => modalEl.remove(), 300);
                
                notificar(`✅ Assinatura do aluno capturada!`, 'success');
                
            } else if (data.sessao.status === 'cancelado') {
                console.log('🚫 Sessão do aluno cancelada');
                pararMonitoramentoSessaoAluno(modulo);
                estadoSessaoAssinaturaAluno[modulo].sessaoId = null;
                
                const check = safeGet(`${modulo}NecessitaAssinaturaAluno`);
                if (check) check.checked = false;
                
                const bloco = safeGet(`${modulo}BlocoAssinaturaAlunoInfo`);
                if (bloco) bloco.style.display = 'none';
            }
        } catch (e) {
            console.warn('Erro no monitoramento do aluno:', e);
        }
    }, 3000);
    
    estadoSessaoAssinaturaAluno[modulo].monitoramentoInterval = intervalId;
}

function pararMonitoramentoSessaoAluno(modulo) {
    const id = estadoSessaoAssinaturaAluno[modulo]?.monitoramentoInterval;
    if (id) {
        clearInterval(id);
        estadoSessaoAssinaturaAluno[modulo].monitoramentoInterval = null;
    }
}

function atualizarStatusAssinadoAluno(modulo, sessao) {
    let bloco = safeGet(`${modulo}BlocoAssinaturaAlunoInfo`);
    
    if (!bloco) {
        bloco = document.createElement('div');
        bloco.id = `${modulo}BlocoAssinaturaAlunoInfo`;
        const check = safeGet(`${modulo}NecessitaAssinaturaAluno`);
        if (check && check.parentElement) {
            check.parentElement.parentElement.appendChild(bloco);
        }
    }
    
    bloco.style.display = 'block';
    bloco.innerHTML = `
        <div style="margin-top: 10px; background: #f0fdf4; border: 2px solid #10b981; border-radius: 12px; padding: 14px;">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                <i class="fas fa-check-circle" style="color: #10b981; font-size: 22px;"></i>
                <div style="flex: 1;">
                    <strong style="color: #065f46;">✓ Assinatura do aluno capturada!</strong>
                    <p style="margin: 3px 0 0; font-size: 12px; color: #047857;">
                        ${sessao.assinadaEm ? `Assinado em ${new Date(sessao.assinadaEm).toLocaleString('pt-BR')}` : ''}
                    </p>
                </div>
            </div>
            <div style="background: white; border-radius: 8px; padding: 8px; text-align: center;">
                <img src="${sessao.assinaturaBase64}" 
                    style="max-width: 100%; max-height: 100px;" 
                    alt="Assinatura do Aluno">
            </div>
            <button type="button" 
                    onclick="gestaoGeral.refazerAssinaturaAluno('${modulo}')"
                    class="btn btn-sm btn-outline-danger w-100 mt-2"
                    style="border-radius: 8px;">
                <i class="fas fa-redo"></i> Refazer Assinatura do Aluno
            </button>
        </div>
    `;
}

async function cancelarSessaoAssinaturaAluno(modulo) {
    const confirmar = await confirm('Cancelar a assinatura do aluno? Ele não poderá mais assinar este atendimento.');
    if (!confirmar) {
        const check = safeGet(`${modulo}NecessitaAssinaturaAluno`);
        if (check) check.checked = true;
        return;
    }
    
    const sessaoId = estadoSessaoAssinaturaAluno[modulo].sessaoId;
    if (sessaoId) {
        try {
            await fetch(`/api/gestao-geral/sessoes-assinatura/${sessaoId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        } catch (e) { console.warn(e); }
    }
    
    pararMonitoramentoSessaoAluno(modulo);
    fecharModalAssinaturaAluno(modulo);
    
    estadoSessaoAssinaturaAluno[modulo].sessaoId = null;
    estadoSessaoAssinaturaAluno[modulo].assinaturaCapturada = null;
    estadoSessaoAssinaturaAluno[modulo].qrCodeDataUrl = null;
    
    const check = safeGet(`${modulo}NecessitaAssinaturaAluno`);
    if (check) check.checked = false;
    
    const bloco = safeGet(`${modulo}BlocoAssinaturaAlunoInfo`);
    if (bloco) bloco.style.display = 'none';
    
    notificar('Sessão do aluno cancelada', 'info');
}

async function refazerAssinaturaAluno(modulo) {
    const confirmar = await confirm('Refazer a assinatura do aluno? A atual será descartada.');
    if (!confirmar) return;
    
    const sessaoId = estadoSessaoAssinaturaAluno[modulo].sessaoId;
    if (sessaoId) {
        try {
            await fetch(`/api/gestao-geral/sessoes-assinatura/${sessaoId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        } catch (e) { console.warn(e); }
    }
    
    pararMonitoramentoSessaoAluno(modulo);
    estadoSessaoAssinaturaAluno[modulo].sessaoId = null;
    estadoSessaoAssinaturaAluno[modulo].assinaturaCapturada = null;
    estadoSessaoAssinaturaAluno[modulo].qrCodeDataUrl = null;
    
    const bloco = safeGet(`${modulo}BlocoAssinaturaAlunoInfo`);
    if (bloco) bloco.style.display = 'none';
    
    const check = safeGet(`${modulo}NecessitaAssinaturaAluno`);
    if (check) {
        check.checked = false;
        check.checked = true;
        await toggleNecessitaAssinaturaAluno(modulo);
    }
}

function limparEstadoSessaoAssinaturaAluno(modulo) {
    estadoSessaoAssinaturaAluno[modulo] = {
        sessaoId: null,
        assinaturaCapturada: null,
        qrCodeDataUrl: null,
        monitoramentoInterval: null,
        modalInstance: null
    };
}


// ============================================================================
// 📱 MODO ASSINATURA (via URL ?assinatura=UUID)
// ============================================================================

async function mostrarTelaAssinatura(sessaoId) {
    console.log('📱 [MODO ASSINATURA] Iniciando tela para sessão:', sessaoId);
    
    document.querySelectorAll('.container > *').forEach(el => {
        if (el && !el.id?.includes('telaAssinatura')) el.style.display = 'none';
    });
    
    let container = safeGet('telaAssinaturaContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'telaAssinaturaContainer';
        document.body.innerHTML = '';
        document.body.appendChild(container);
    }
    
    container.innerHTML = `
        <div style="min-height: 100vh; background: #f0f4f8; padding: 10px; display: flex; flex-direction: column; box-sizing: border-box; overflow-y: auto;">
            <div style="max-width: 800px; width: 100%; margin: 0 auto; display: flex; flex-direction: column; flex: 1; min-height: 0;">
                <div style="background: linear-gradient(135deg, #1e3c72, #2a5298); color: white; padding: 12px 20px; border-radius: 16px 16px 0 0; text-align: center; flex-shrink: 0;">
                    <h1 style="font-size: 18px; margin: 0; display: flex; align-items: center; justify-content: center; gap: 10px;">
                        <i class="fas fa-signature"></i> Assinatura Digital - Gestão Geral
                    </h1>
                </div>
                
                <div id="telaAssinaturaInfo" style="background: white; padding: 15px; border-left: 4px solid #1e3c72; flex-shrink: 0; max-height: 50vh; overflow-y: auto;">
                    <div style="text-align: center; padding: 20px;">
                        <div style="width: 30px; height: 30px; border: 4px solid #e2e8f0; border-top-color: #1e3c72; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 10px;"></div>
                        <p style="color: #64748b; margin: 0; font-size: 14px;">Carregando atendimento...</p>
                    </div>
                </div>
                
                <div id="telaAssinaturaArea" style="background: white; padding: 15px; display: none; border-radius: 0 0 16px 16px; flex: 1; display: flex; flex-direction: column; min-height: 0;">
                    <div id="canvasWrapper" style="position: relative; background: white; border: 3px dashed #cbd5e0; border-radius: 16px; overflow: hidden; flex: 1; min-height: 150px; margin-bottom: 12px; touch-action: none;">
                        <canvas id="canvasAssinatura" style="width: 100%; height: 100%; display: block;"></canvas>
                        <div id="placeholder" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: #94a3b8; pointer-events: none; width: 100%;">
                            <i class="fas fa-pen-fancy" style="font-size: 32px; display: block; margin-bottom: 5px;"></i>
                            <span style="font-size: 14px;">Assine aqui com o dedo</span>
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 10px; flex-shrink: 0;">
                        <button onclick="gestaoGeral.limparAssinaturaTela()" style="flex: 1; padding: 12px; background: #f1f5f9; color: #475569; border: none; border-radius: 12px; font-weight: 600; font-size: 14px;"><i class="fas fa-eraser"></i> Limpar</button>
                        <button id="btnSalvarAssinatura" onclick="gestaoGeral.salvarAssinaturaTela()" disabled style="flex: 2; padding: 12px; background: #cbd5e0; color: white; border: none; border-radius: 12px; font-weight: 600; font-size: 14px; cursor: not-allowed;"><i class="fas fa-check"></i> Confirmar Assinatura</button>
                    </div>
                </div>
            </div>
        </div>
        <style>
            @keyframes spin { to { transform: rotate(360deg); } }
            @media (max-height: 500px) {
                #telaAssinaturaInfo { max-height: 40vh; }
                #telaAssinaturaArea { padding: 10px; }
                #canvasWrapper { min-height: 80px; }
            }
        </style>
    `;
    
    try {
        const response = await fetch(`/api/gestao-geral/sessoes-assinatura/${sessaoId}`);
        const data = await response.json();
        
        if (!data.success) {
            safeGet('telaAssinaturaInfo').innerHTML = `<div style="text-align: center; padding: 30px 20px;"><i class="fas fa-exclamation-triangle" style="font-size: 40px; color: #ef4444; margin-bottom: 10px; display: block;"></i><h3 style="color: #ef4444; margin: 0 0 8px; font-size: 18px;">Sessão inválida ou expirada</h3><p style="color: #64748b; margin: 0; font-size: 14px;">${data.error || 'Esta sessão expirou.'}</p></div>`;
            return;
        }
        
        if (data.sessao.status === 'assinado') {
            safeGet('telaAssinaturaInfo').innerHTML = `<div style="text-align: center; padding: 30px 20px;"><i class="fas fa-check-circle" style="font-size: 40px; color: #10b981; margin-bottom: 10px; display: block;"></i><h3 style="color: #10b981; margin: 0 0 8px; font-size: 18px;">Sessão já assinada</h3><p style="color: #64748b; margin: 0; font-size: 14px;">Assinada por ${escapeHTML(data.sessao.assinadaPorNome || '')}</p></div>`;
            return;
        }
        
        if (data.sessao.status === 'cancelado') {
            safeGet('telaAssinaturaInfo').innerHTML = `<div style="text-align: center; padding: 30px 20px;"><i class="fas fa-times-circle" style="font-size: 40px; color: #ef4444; margin-bottom: 10px; display: block;"></i><h3 style="color: #ef4444; margin: 0 0 8px; font-size: 18px;">Sessão cancelada</h3><p style="color: #64748b; margin: 0; font-size: 14px;">Esta assinatura foi cancelada.</p></div>`;
            return;
        }
        
        const d = data.sessao.dadosAtendimento || {};
        const tipoLabel = {
            'autorizacao': 'Autorização', 'justificativa': 'Justificativa', 'segunda_chamada': '2ª Chamada',
            'atraso': 'Atraso', 'atraso_aluno': 'Atraso (Assinatura do Aluno)', 'uniforme': 'Uniforme', 'atendimento': 'Atendimento'
        }[data.sessao.tipo] || data.sessao.tipo;
        
        // Função auxiliar para só mostrar o bloco se o campo existir
        const itemHTML = (label, valor, fullWidth = false, color = '#1e293b', bold = false) => {
            if (!valor || valor === 'null' || valor === 'undefined' || valor === '') return '';
            return `
                <div style="${fullWidth ? 'grid-column: 1 / -1;' : ''}">
                    <span style="font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 700; display: block;">${label}</span>
                    <span style="font-size: 13px; color: ${color}; ${bold ? 'font-weight: bold;' : ''}">${escapeHTML(valor)}</span>
                </div>
            `;
        };

        let detalhesHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px;">
                ${itemHTML('Aluno', d.alunoNome, true)}
                ${itemHTML('Turma', d.alunoTurma)}
                ${itemHTML('Motivo', d.motivoLabel, false, '#ef4444', true)}
                
                ${itemHTML('Data do Registro', d.dataFormatada || (d.data ? new Date(d.data).toLocaleDateString('pt-BR') : null))}
                ${itemHTML('Responsável', d.responsavelNome, true)}
                ${itemHTML('CPF', d.responsavelCPF)}
                ${itemHTML('Telefone', d.responsavelTelefone)}
                
                ${itemHTML('Período da Falta', d.periodoFaltaFormatado, true, '#1e3c72', true)}
                ${itemHTML('Período do Uniforme', d.uniformePeriodoFormatado, true, '#1e3c72', true)}
                ${itemHTML('Tipo de Prova', d.tipoProvaPerdidaFormatado, true, '#1e3c72', true)}
                ${itemHTML('Período da Prova', d.periodoProva, false, '#1e3c72', true)}
                
                ${itemHTML('Entrada', d.entradaCompleta)}
                ${itemHTML('Saída', d.saidaCompleta)}
                
                ${itemHTML('Descrição', d.descricao, true)}
                ${itemHTML('Observações', d.observacoes, true, '#475569')}
            </div>
        `;
        
        safeGet('telaAssinaturaInfo').innerHTML = `
            <div style="border-left: 4px solid #1e3c72; padding-left: 10px; margin-bottom: 10px;">
                <h2 style="margin: 0 0 4px; font-size: 16px; color: #1e3c72;">${tipoLabel}</h2>
                <p style="margin: 0; color: #64748b; font-size: 12px;">Confirme os dados e assine abaixo</p>
            </div>
            ${detalhesHTML}
        `;
        
        safeGet('telaAssinaturaArea').style.display = 'flex';
        sessaoAssinaturaModo = sessaoId;
        sessaoAssinaturaAtual = data.sessao;
        
        setTimeout(() => inicializarCanvasTela(), 100);
        window.addEventListener('resize', handleResizeCanvasTela);
        
    } catch (e) {
        console.error('Erro ao carregar sessão:', e);
        safeGet('telaAssinaturaInfo').innerHTML = `<div style="text-align: center; padding: 30px 20px;"><i class="fas fa-exclamation-triangle" style="font-size: 40px; color: #ef4444; margin-bottom: 10px; display: block;"></i><h3 style="color: #ef4444; margin: 0 0 8px; font-size: 18px;">Erro ao carregar</h3><p style="color: #64748b; margin: 0; font-size: 14px;">${e.message}</p></div>`;
    }
}

// ============================================
// 🔔 TOAST NATIVO
// ============================================
function notificar(mensagem, tipo = 'success', duracao = 3500) {
    if (typeof window.mostrarToastConcluido === 'function') {
        window.mostrarToastConcluido(mensagem, tipo);
        return;
    }

    let container = document.getElementById('__toastContainerGG');
    if (!container) {
        container = document.createElement('div');
        container.id = '__toastContainerGG';
        container.style.cssText = `
            position: fixed; top: 20px; right: 20px; z-index: 999999;
            display: flex; flex-direction: column; gap: 10px; pointer-events: none;
        `;
        document.body.appendChild(container);
    }

    const cores = {
        success: { bg: '#10b981', icon: '✅' },
        error:   { bg: '#ef4444', icon: '❌' },
        warning: { bg: '#f59e0b', icon: '⚠️' },
        info:    { bg: '#3b82f6', icon: 'ℹ️' }
    };
    const c = cores[tipo] || cores.info;

    const toast = document.createElement('div');
    toast.style.cssText = `
        background: ${c.bg}; color: white; padding: 14px 20px; border-radius: 10px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 14px; max-width: 380px; display: flex; align-items: center; gap: 10px;
        pointer-events: auto; opacity: 0; transform: translateX(100%);
        transition: all 0.3s ease; white-space: pre-line;
    `;
    toast.innerHTML = `<span style="font-size:18px;">${c.icon}</span><span>${mensagem}</span>`;

    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(0)';
    });

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, duracao);
}

// ============================================
// WRAPPERS PARA O HTML
// ============================================
function selecionarMotivoAutorizacao(motivo) { selecionarMotivoModulo('autorizacao', motivo); }
function selecionarMotivoJustificativa(motivo) { selecionarMotivoModulo('justificativa', motivo); }
function selecionarMotivoSegundaChamada(motivo) { selecionarMotivoModulo('segundaChamada', motivo); }
// 🆕 UNIFORME
function selecionarMotivoUniforme(motivo) { selecionarMotivoModulo('uniforme', motivo); }

function registrarAutorizacao() { registrarModulo('autorizacao'); }
function registrarJustificativa() { registrarModulo('justificativa'); }
function registrarSegundaChamada() { registrarModulo('segundaChamada'); }
// 🆕 UNIFORME
function registrarUniforme() { registrarModulo('uniforme'); }

function limparTelaAutorizacao() { limparTelaModulo('autorizacao'); }
function limparTelaJustificativa() { limparTelaModulo('justificativa'); }
function limparTelaSegundaChamada() { limparTelaModulo('segundaChamada'); }
// 🆕 UNIFORME
function limparTelaUniforme() { limparTelaModulo('uniforme'); }

function carregarAutorizacoes() { carregarListaModulo('autorizacao', 1); }
function carregarJustificativas() { carregarListaModulo('justificativa', 1); }
function carregarSegundaChamada() { carregarListaModulo('segundaChamada', 1); }
// 🆕 UNIFORME
function carregarUniformes() { carregarListaModulo('uniforme', 1); }

function imprimirAutorizacao(id) { imprimirModulo('autorizacao', id); }
function imprimirJustificativa(id) { imprimirModulo('justificativa', id); }
function imprimirSegundaChamada(id) { imprimirModulo('segundaChamada', id); }

function excluirAutorizacao(id) { excluirModulo('autorizacao', id); }
function excluirJustificativa(id) { excluirModulo('justificativa', id); }
function excluirSegundaChamada(id) { excluirModulo('segundaChamada', id); }

// ============================================
// 🔔 SISTEMA DE NOTIFICAÇÕES UNIFICADO
// ============================================
let notificacoesInterval = null;
let __notificacoesCache = [];
let __lembretesCache = [];

function isWebViewNotif() {
    return /wv|WebView|Android.*Version\/[\d.]+.*Chrome/i.test(navigator.userAgent) ||
           (typeof window.AppInventor !== 'undefined');
}

function mostrarNotificacaoInterna(mensagem, tipo = 'info') {
    if (!isWebViewNotif()) { alert(mensagem); return; }
    
    const modal = document.createElement('div');
    modal.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center;
        z-index: 999999; padding: 20px; box-sizing: border-box;`;
    const icones = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const cores = { success: '#10b981', error: '#dc2626', warning: '#f59e0b', info: '#1e3c72' };
    
    modal.innerHTML = `
        <div style="background: white; border-radius: 16px; padding: 25px; max-width: 380px; width: 100%;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.3); text-align: center;">
            <div style="font-size: 48px; margin-bottom: 15px;">${icones[tipo] || 'ℹ️'}</div>
            <p style="margin: 0 0 20px; color: #374151; font-size: 15px; line-height: 1.5; white-space: pre-line;">
                ${mensagem}</p>
            <button onclick="this.closest('div').parentElement.remove()"
                    style="width: 100%; padding: 12px; background: ${cores[tipo] || cores.info};
                           color: white; border: none; border-radius: 10px; font-size: 14px;
                           font-weight: 600; cursor: pointer;">OK</button>
        </div>`;
    document.body.appendChild(modal);
}

function confirmarInternoNotif(mensagem) {
    return new Promise((resolve) => {
        const old = document.getElementById('confirmInternoModalNotif');
        if (old) old.remove();
        
        const modalHtml = `
            <div class="modal fade" id="confirmInternoModalNotif" tabindex="-1" data-bs-backdrop="static">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header" style="background: linear-gradient(135deg, #1e3c72, #2a5298); color: white;">
                            <h5 class="modal-title"><i class="fas fa-question-circle"></i> Confirmação</h5>
                        </div>
                        <div class="modal-body" style="white-space: pre-line; font-size: 15px;">${escapeHTML(mensagem)}</div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" id="btnCancelarConfirmInternoNotif">
                                <i class="fas fa-times"></i> Cancelar</button>
                            <button type="button" class="btn btn-danger" id="btnConfirmarConfirmInternoNotif">
                                <i class="fas fa-check"></i> Confirmar</button>
                        </div>
                    </div>
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        const modalEl = document.getElementById('confirmInternoModalNotif');
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
        
        const finalizar = (resultado) => {
            modal.hide();
            setTimeout(() => modalEl.remove(), 300);
            resolve(resultado);
        };
        document.getElementById('btnConfirmarConfirmInternoNotif').addEventListener('click', () => finalizar(true));
        document.getElementById('btnCancelarConfirmInternoNotif').addEventListener('click', () => finalizar(false));
    });
}

function iniciarSistemaNotificacoesUnificado() {
    if (!document.getElementById('notificacoesBtn')) return;
    
    carregarTudo();
    if (notificacoesInterval) clearInterval(notificacoesInterval);
    notificacoesInterval = setInterval(carregarTudo, 30000);
    
    document.addEventListener('click', function(event) {
        const dropdown = document.getElementById('notificacoesDropdown');
        const btn = document.getElementById('notificacoesBtn');
        if (dropdown && btn && !btn.contains(event.target) && !dropdown.contains(event.target)) {
            dropdown.classList.remove('show');
        }
    });
}

async function carregarTudo() {
    await Promise.all([
        carregarNotificacoesSistema(),
        carregarLembretesRemarcacao()
    ]);
    renderizarSinoUnificado();
    atualizarBadgeUnificado();
}

async function carregarNotificacoesSistema() {
    try {
        const token = localStorage.getItem('auth_token');
        if (!token) return;
        
        const response = await fetch('/api/notificacoes?apenasNaoLidas=false&limite=20', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success) {
            __notificacoesCache = data.notificacoes || [];
        }
    } catch (error) {
        console.error('Erro ao carregar notificações:', error);
    }
}

async function carregarLembretesRemarcacao() {
    // ⚠️ Gestão Geral NÃO tem sistema de remarcações (é exclusivo da Psicologia)
    __lembretesCache = [];
    return;
}

function calcularNivelAlertaNotif(r) {
    const agora = new Date();
    const horario = r.horarioRemarcacao || '00:00';
    const dataRem = new Date(r.dataRemarcacao + 'T' + horario + ':00');
    const diffMin = Math.floor((dataRem - agora) / 60000);
    const diffHoras = Math.floor(diffMin / 60);

    if (diffMin < 0) {
        const p = Math.abs(diffMin);
        if (p < 60) return { nivel: 'atrasado', label: `Atrasado ${p}min`, urgente: true };
        if (p < 1440) return { nivel: 'atrasado', label: `Atrasado ${Math.floor(p / 60)}h`, urgente: true };
        return { nivel: 'atrasado', label: `Atrasado ${Math.floor(p / 1440)}d`, urgente: true };
    }
    if (diffMin <= 30) return { nivel: 'iminente', label: `Em ${diffMin}min`, urgente: true };
    if (diffMin <= 120) return { nivel: 'proximo', label: `Em ${diffHoras}h ${diffMin % 60}min`, urgente: false };
    if (diffHoras < 24) return { nivel: 'hoje', label: `Hoje ${horario}`, urgente: false };
    if (diffHoras < 48) return { nivel: 'amanha', label: `Amanhã ${horario}`, urgente: false };
    return { nivel: 'futuro', label: `Em ${Math.floor(diffHoras / 24)} dias`, urgente: false };
}

function formatarDataBRNotif(dataStr) {
    if (!dataStr) return '-';
    try {
        const d = new Date(dataStr + 'T00:00:00');
        return d.toLocaleDateString('pt-BR');
    } catch (e) {
        return dataStr;
    }
}

function renderizarSinoUnificado() {
    const lista = document.getElementById('notificacoesLista');
    if (!lista) return;
    
    const temNotificacoes = __notificacoesCache.length > 0;
    const temLembretes = __lembretesCache.length > 0;
    
    if (!temNotificacoes && !temLembretes) {
        lista.innerHTML = `
            <div class="notificacoes-vazio">
                <i class="fas fa-bell-slash"></i>
                <p>Nenhuma notificação</p>
            </div>`;
        return;
    }
    
    let html = '';
    
    if (temLembretes) {
        html += `
            <div class="notificacoes-secao">
                <div class="notificacoes-secao-titulo">
                    <i class="fas fa-calendar-alt"></i>
                    <span>Lembretes de Remarcação</span>
                    <span class="badge-count">${__lembretesCache.length}</span>
                </div>`;
        
        const ordem = { atrasado: 0, iminente: 1, proximo: 2, hoje: 3, amanha: 4, futuro: 5 };
        const lembretesOrdenados = [...__lembretesCache].sort((a, b) => {
            return ordem[calcularNivelAlertaNotif(a).nivel] - ordem[calcularNivelAlertaNotif(b).nivel];
        });
        
        lembretesOrdenados.forEach(r => {
            const nivel = calcularNivelAlertaNotif(r);
            let itemClass = '';
            let badgeClass = 'futuro';
            let badgeText = nivel.label;
            
            if (nivel.nivel === 'atrasado') { itemClass = 'atrasado'; badgeClass = 'atrasado'; badgeText = `⚠️ ${nivel.label}`; }
            else if (nivel.nivel === 'iminente') { itemClass = 'urgente'; badgeClass = 'urgente'; badgeText = `🔴 ${nivel.label}`; }
            else if (nivel.nivel === 'proximo') { itemClass = 'proximo'; badgeClass = 'proximo'; badgeText = `🟠 ${nivel.label}`; }
            else if (nivel.nivel === 'hoje') { itemClass = 'hoje'; badgeClass = 'hoje'; badgeText = `🟡 Hoje ${r.horarioRemarcacao}`; }
            else if (nivel.nivel === 'amanha') { itemClass = 'amanha'; badgeClass = 'amanha'; badgeText = `🔵 Amanhã ${r.horarioRemarcacao}`; }
            
            html += `
                <div class="lembrete-item ${itemClass}">
                    <div class="lembrete-header">
                        <span class="lembrete-nome">${escapeHTML(r.alunoNome || '')}</span>
                        <span class="lembrete-badge ${badgeClass}">${badgeText}</span>
                    </div>
                    <div class="lembrete-turma">
                        <i class="fas fa-graduation-cap"></i> ${escapeHTML(r.alunoTurma || '-')}
                    </div>
                    <div class="lembrete-data">
                        <span><i class="fas fa-calendar"></i> ${formatarDataBRNotif(r.dataRemarcacao)}</span>
                        <span><i class="fas fa-clock"></i> ${r.horarioRemarcacao || '-'}</span>
                    </div>
                    <span class="lembrete-tipo">${escapeHTML(r.tipoTarefaLabel || '')}</span>
                </div>`;
        });
        
        html += `</div>`;
    }
    
    if (temNotificacoes) {
        html += `
            <div class="notificacoes-secao">
                <div class="notificacoes-secao-titulo">
                    <i class="fas fa-bell"></i>
                    <span>Notificações do Sistema</span>
                    <span class="badge-count">${__notificacoesCache.filter(n => !n.lida).length} não lidas</span>
                </div>`;
        
        __notificacoesCache.forEach(notif => {
            const data = new Date(notif.createdAt);
            const agora = new Date();
            const diffMs = agora - data;
            const diffMin = Math.floor(diffMs / 60000);
            const diffHr = Math.floor(diffMs / 3600000);
            const diffDia = Math.floor(diffMs / 86400000);
            
            let tempoTexto;
            if (diffMin < 1) tempoTexto = 'agora mesmo';
            else if (diffMin < 60) tempoTexto = `há ${diffMin} min`;
            else if (diffHr < 24) tempoTexto = `há ${diffHr} h`;
            else tempoTexto = `há ${diffDia} d`;
            
            const classeLida = notif.lida ? '' : 'nao-lida';
            
            html += `
                <div class="notificacao-item ${classeLida}"
                     data-notif-id="${notif._id}"
                     data-notif-link="${escapeHTML(notif.link || '#')}"
                     style="cursor: pointer;">
                    <div class="notificacao-icone" style="background: ${notif.cor || '#1e3c72'};">
                        ${notif.icone || '📋'}
                    </div>
                    <div class="notificacao-conteudo">
                        <div class="notificacao-titulo">${escapeHTML(notif.titulo || '')}</div>
                        <div class="notificacao-mensagem">${escapeHTML(notif.mensagem || '')}</div>
                        <div class="notificacao-tempo"><i class="far fa-clock"></i> ${tempoTexto}</div>
                    </div>
                </div>`;
        });
        
        html += `</div>`;
    }
    
    lista.innerHTML = html;
    
    lista.querySelectorAll('.notificacao-item').forEach(item => {
        item.addEventListener('click', () => {
            const id = item.getAttribute('data-notif-id');
            const link = item.getAttribute('data-notif-link');
            abrirNotificacao(id, link);
        });
    });
}

function atualizarBadgeUnificado() {
    const badge = document.getElementById('notificacoesBadge');
    const btn = document.getElementById('notificacoesBtn');
    if (!badge || !btn) return;
    
    const total = __notificacoesCache.filter(n => !n.lida).length + __lembretesCache.length;
    
    if (total > 0) {
        badge.textContent = total > 99 ? '99+' : total;
        badge.style.display = 'inline-flex';
        
        const temUrgente = __lembretesCache.some(r => calcularNivelAlertaNotif(r).urgente);
        if (temUrgente) {
            btn.classList.add('tem-notificacao');
            badge.style.background = '#dc2626';
        } else {
            btn.classList.remove('tem-notificacao');
            badge.style.background = '#ef4444';
        }
    } else {
        badge.style.display = 'none';
        btn.classList.remove('tem-notificacao');
    }
}

function abrirNotificacoes() {
    const dropdown = document.getElementById('notificacoesDropdown');
    if (!dropdown) return;
    dropdown.classList.toggle('show');
    if (dropdown.classList.contains('show')) {
        carregarTudo();
    }
}

function fecharNotificacoes() {
    document.getElementById('notificacoesDropdown')?.classList.remove('show');
}

async function abrirNotificacao(id, link) {
    try {
        const token = localStorage.getItem('auth_token');
        await fetch(`/api/notificacoes/${id}/lida`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        fecharNotificacoes();
        if (link && link !== '#') window.location.href = link;
        carregarTudo();
    } catch (error) {
        console.error('Erro ao abrir notificação:', error);
    }
}

async function marcarTodasLidas() {
    try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch('/api/notificacoes/marcar-todas-lidas', {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success) {
            await carregarTudo();
            mostrarNotificacaoInterna('Notificações marcadas como lidas!', 'success');
        }
    } catch (error) {
        console.error('Erro ao marcar todas como lidas:', error);
    }
}

async function limparMinhasNotificacoes(event) {
    try {
        const token = localStorage.getItem('auth_token');
        const confirmacao = await confirmarInternoNotif('🗑️ Deseja excluir TODAS as suas notificações do sistema?\n\n⚠️ Os lembretes de remarcação NÃO serão afetados.\n\nEsta ação não pode ser desfeita.');
        if (!confirmacao) return;
        
        const response = await fetch('/api/notificacoes/limpar-minhas', {
            method: 'DELETE',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        const data = await response.json();
        
        if (data.success) {
            __notificacoesCache = [];
            await carregarTudo();
            mostrarNotificacaoInterna('Notificações excluídas com sucesso!', 'success');
        } else {
            throw new Error(data.error || 'Erro ao excluir');
        }
    } catch (error) {
        console.error('❌ Erro:', error);
        mostrarNotificacaoInterna(error.message, 'error');
    }
}

// Inicia o sistema de notificações APENAS se NÃO estiver em modo assinatura
if (!window.__MODO_ASSINATURA__ && !new URLSearchParams(window.location.search).get('assinatura')) {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => iniciarSistemaNotificacoesUnificado(), 500);
    });

    window.addEventListener('beforeunload', () => {
        if (notificacoesInterval) clearInterval(notificacoesInterval);
    });
}

// ============================================
// LOGOUT
// ============================================
async function logout() {
    const confirmar = await confirm('Tem certeza que deseja sair do sistema?');
    if (confirmar) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_data');
        window.location.href = '/login.html';
    }
}

// ============================================
// EXPORTAR GLOBAIS
// ============================================
window.selecionarMotivo = selecionarMotivo;
window.registrarAtraso = registrarAtraso;
window.limparTela = limparTela;
window.toggleRelatorioFiltros = toggleRelatorioFiltros;
window.carregarRelatorio = carregarRelatorio;
window.exportarCSV = exportarCSV;
window.logout = logout;
window.selecionarAlunoAutocomplete = selecionarAlunoAutocomplete;
window.setModo = setModo;

window.selecionarMotivoAutorizacao = selecionarMotivoAutorizacao;
window.selecionarMotivoJustificativa = selecionarMotivoJustificativa;
window.selecionarMotivoSegundaChamada = selecionarMotivoSegundaChamada;
// 🆕 UNIFORME
window.selecionarMotivoUniforme = selecionarMotivoUniforme;

window.registrarAutorizacao = registrarAutorizacao;
window.registrarJustificativa = registrarJustificativa;
window.registrarSegundaChamada = registrarSegundaChamada;
// 🆕 UNIFORME
window.registrarUniforme = registrarUniforme;

window.limparTelaAutorizacao = limparTelaAutorizacao;
window.limparTelaJustificativa = limparTelaJustificativa;
window.limparTelaSegundaChamada = limparTelaSegundaChamada;
// 🆕 UNIFORME
window.limparTelaUniforme = limparTelaUniforme;

window.carregarAutorizacoes = carregarAutorizacoes;
window.carregarJustificativas = carregarJustificativas;
window.carregarSegundaChamada = carregarSegundaChamada;
// 🆕 UNIFORME
window.carregarUniformes = carregarUniformes;

window.imprimirModulo = imprimirModulo;
window.excluirModulo = excluirModulo;
window.carregarListaModulo = carregarListaModulo;
window.setModoModulo = setModoModulo;
window.carregarAtrasosRecentes = carregarAtrasosRecentes;
window.verAtraso = verAtraso;
window.editarAtraso = editarAtraso;
window.salvarEdicaoAtraso = salvarEdicaoAtraso;
window.imprimirAtraso = imprimirAtraso;
window.excluirAtraso = excluirAtraso;
window.aplicarFiltrosLista = aplicarFiltrosLista;
window.carregarDashboardModulo = carregarDashboardModulo;
window.carregarRelatorioModulo = carregarRelatorioModulo;
window.exportarCSVModulo = exportarCSVModulo;
window.toggleRelatorioFiltrosModulo = toggleRelatorioFiltrosModulo;
window.selecionarAlunoAutocompleteModulo = selecionarAlunoAutocompleteModulo;
window.abrirEditarModulo = abrirEditarModulo;
window.salvarEdicaoModulo = salvarEdicaoModulo;
window.toggleEditMotivoOutros = toggleEditMotivoOutros;
window.toggleEditTipoProvaOutros = toggleEditTipoProvaOutros;
window.selecionarTipoProvaPerdida = selecionarTipoProvaPerdida;
window.limparAssinatura = limparAssinatura;
window.inicializarAssinatura = inicializarAssinatura;
window.obterAssinaturaBase64 = obterAssinaturaBase64;
window.notificar = notificar;
window.abrirNotificacoes = abrirNotificacoes;
window.abrirNotificacao = abrirNotificacao;
window.marcarTodasLidas = marcarTodasLidas;
window.limparMinhasNotificacoes = limparMinhasNotificacoes;
window.fecharNotificacoes = fecharNotificacoes;
window.mostrarNotificacaoInterna = mostrarNotificacaoInterna;
window.confirmarInternoNotif = confirmarInternoNotif;
window.exportarPDFAtrasos = exportarPDFAtrasos;
window.exportarPDFModulo = exportarPDFModulo;
window.getPrefixoInput = getPrefixoInput;
window.selecionarPeriodoProva = selecionarPeriodoProva;

// 🆕 Formatação de CPF e Telefone
window.formatarCPF = formatarCPF;
window.formatarTelefone = formatarTelefone;
window.validarCPFCliente = validarCPFCliente;

// ============================================
// 🆕 SISTEMA DE SESSÃO DE ASSINATURA
// ============================================
(function exportarGestaoGeral() {
    const funcoes = {
        // Responsável
        toggleNecessitaAssinatura: typeof toggleNecessitaAssinatura !== 'undefined' ? toggleNecessitaAssinatura : null,
        abrirModalAssinatura: typeof abrirModalAssinatura !== 'undefined' ? abrirModalAssinatura : null,
        fecharModalAssinatura: typeof fecharModalAssinatura !== 'undefined' ? fecharModalAssinatura : null,
        reabrirModalAssinatura: typeof reabrirModalAssinatura !== 'undefined' ? reabrirModalAssinatura : null,
        copiarLinkAssinatura: typeof copiarLinkAssinatura !== 'undefined' ? copiarLinkAssinatura : null,
        cancelarSessaoAssinatura: typeof cancelarSessaoAssinatura !== 'undefined' ? cancelarSessaoAssinatura : null,
        refazerAssinatura: typeof refazerAssinatura !== 'undefined' ? refazerAssinatura : null,
        // 🆕 Aluno
        toggleNecessitaAssinaturaAluno: typeof toggleNecessitaAssinaturaAluno !== 'undefined' ? toggleNecessitaAssinaturaAluno : null,
        abrirModalAssinaturaAluno: typeof abrirModalAssinaturaAluno !== 'undefined' ? abrirModalAssinaturaAluno : null,
        fecharModalAssinaturaAluno: typeof fecharModalAssinaturaAluno !== 'undefined' ? fecharModalAssinaturaAluno : null,
        reabrirModalAssinaturaAluno: typeof reabrirModalAssinaturaAluno !== 'undefined' ? reabrirModalAssinaturaAluno : null,
        cancelarSessaoAssinaturaAluno: typeof cancelarSessaoAssinaturaAluno !== 'undefined' ? cancelarSessaoAssinaturaAluno : null,
        refazerAssinaturaAluno: typeof refazerAssinaturaAluno !== 'undefined' ? refazerAssinaturaAluno : null,
        // Comum
        mostrarTelaAssinatura: typeof mostrarTelaAssinatura !== 'undefined' ? mostrarTelaAssinatura : null,
        limparAssinaturaTela: typeof limparAssinaturaTela !== 'undefined' ? limparAssinaturaTela : null,
        salvarAssinaturaTela: typeof salvarAssinaturaTela !== 'undefined' ? salvarAssinaturaTela : null
    };

    // Remove funções nulas
    Object.keys(funcoes).forEach(k => {
        if (funcoes[k] === null) {
            console.warn(`⚠️ [gestaoGeral] Função "${k}" não foi definida`);
            delete funcoes[k];
        }
    });

    window.gestaoGeral = funcoes;
    console.log('✅ [gestaoGeral] Exportado com', Object.keys(funcoes).length, 'funções');
})();