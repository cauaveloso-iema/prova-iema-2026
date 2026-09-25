// ============================================
// GESTÃO GERAL - SISTEMA COMPLETO
// Atrasos + Autorização + Justificativa + 2ª Chamada
// Com Assinatura Digital + Integração Automática
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

(function protegerContraAlertNativo() {
    // ⚠️ IMPORTANTE: guardar a referência original UMA VEZ
    const alertOriginal = window.alert.bind(window);
    let __alertaEmProgresso = false; // 🔥 Guard contra recursão
    
    window.alert = function(mensagem) {
        // 🔥 Se já está processando um alerta, evita loop
        if (__alertaEmProgresso) {
            console.log('[ALERT-RECURSÃO-EVITADA]', mensagem);
            return;
        }
        __alertaEmProgresso = true;
        
        try {
            const isWebView = /wv|WebView|Android.*Version\/[\d.]+.*Chrome/i.test(navigator.userAgent) ||
                              (typeof window.AppInventor !== 'undefined');
            
            if (!isWebView) {
                // Desktop: log no console, NUNCA chama toast (evita loop)
                console.log('%c[ALERT] ' + mensagem, 'background:#8b5cf6;color:white;padding:4px 8px;border-radius:4px;');
                return;
            }
            
            // WebView: modal customizado direto (sem chamar toast)
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
    autorizacao: { tipo: 'autorizacao', prefixo: 'Autorizacao', nomeAmigavel: 'Autorização', containerLista: 'listaAutorizacoes' },
    justificativa: { tipo: 'justificativa', prefixo: 'Justificativa', nomeAmigavel: 'Justificativa', containerLista: 'listaJustificativas' },
    segundaChamada: { tipo: 'segunda_chamada', prefixo: 'SegundaChamada', nomeAmigavel: '2ª Chamada', containerLista: 'listaSegundaChamada' }
};

const estados = {
    autorizacao: { currentAluno: null, motivoSelecionado: null, scanner: null, scannerAtivo: false, modoAtual: 'automatico', alunosPorTurma: [] },
    justificativa: { currentAluno: null, motivoSelecionado: null, scanner: null, scannerAtivo: false, modoAtual: 'automatico', alunosPorTurma: [] },
    segundaChamada: { currentAluno: null, motivoSelecionado: null, scanner: null, scannerAtivo: false, modoAtual: 'automatico', alunosPorTurma: [] }
};

const relatoriosModulo = {
    autorizacao: null,
    justificativa: null,
    segundaChamada: null
};

const dashboardChartsModulo = {
    autorizacao: { motivos: null, atrasos: null, turmas: null },
    justificativa: { motivos: null, atrasos: null, turmas: null },
    segundaChamada: { motivos: null, atrasos: null, turmas: null }
};

const autocompleteModuloState = {
    autorizacao: { alunos: [], filtrados: [], indice: -1, carregado: false, carregando: false },
    justificativa: { alunos: [], filtrados: [], indice: -1, carregado: false, carregando: false },
    segundaChamada: { alunos: [], filtrados: [], indice: -1, carregado: false, carregando: false }
};

// ============================================
// ESTADO DA ASSINATURA DIGITAL
// ============================================
const assinaturaState = {
    autorizacao: { canvas: null, ctx: null, desenhando: false, temAssinatura: false, lastX: 0, lastY: 0, larguraBase: 0, alturaBase: 0 },
    justificativa: { canvas: null, ctx: null, desenhando: false, temAssinatura: false, lastX: 0, lastY: 0, larguraBase: 0, alturaBase: 0 },
    segundaChamada: { canvas: null, ctx: null, desenhando: false, temAssinatura: false, lastX: 0, lastY: 0, larguraBase: 0, alturaBase: 0 }
};

// ============================================
// REGRAS DE INTEGRAÇÃO AUTOMÁTICA
// ============================================
// Motivos de Autorização que geram Justificativa automaticamente
const MOTIVOS_AUTORIZACAO_GERAM_JUSTIFICATIVA = {
    'problemas_saude_responsavel_buscou': 'problemas_saude',
    'problemas_saude_responsavel_whatsapp': 'problemas_saude',
    'consultas': 'problemas_saude',
    'necessita_ausentar_retornar': 'problemas_saude'
};

// Toda 2ª Chamada gera Justificativa (mapeamento do motivo)
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

function gerarAvatarSVG(nome) {
    const inicial = (nome || '?').charAt(0).toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#1e3c72"/><stop offset="100%" stop-color="#2a5298"/></linearGradient></defs><circle cx="50" cy="50" r="50" fill="url(#g)"/><text x="50" y="50" font-family="Arial,sans-serif" font-size="45" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="central">${inicial}</text></svg>`;
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
}

// ============================================
// INICIALIZAÇÃO
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    if (!token) { window.location.href = '/login.html'; return; }
    
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
    
    // ============ ATRASOS ============
    safeGet('modoAutomaticoBtn')?.addEventListener('click', () => setModo('automatico'));
    safeGet('modoManualBtn')?.addEventListener('click', () => setModo('manual'));
    safeGet('filtroTurmaManual')?.addEventListener('change', () => carregarAlunosPorTurma());
    safeGet('filtroBuscaManual')?.addEventListener('input', () => filtrarAlunosManual());
    
    safeGet('atraso-dashboard-tab')?.addEventListener('shown.bs.tab', () => {
        carregarDashboardAtrasos();
        carregarAtrasosRecentes(1);
        configurarFiltrosAtrasosRecentes();
    });
    safeGet('atraso-relatorios-tab')?.addEventListener('shown.bs.tab', () => carregarTurmasParaRelatorio());
    safeGet('aba-atrasos')?.addEventListener('shown.bs.tab', () => {
        setTimeout(() => {
            if (modoAtual === 'automatico' && !scannerAutoAtivo) iniciarScannerAutomatico();
        }, 300);
    });
    
    // ============ MÓDULOS EXTRAS ============
    const hoje = new Date().toISOString().split('T')[0];
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
        carregarListaModulo('autorizacao');
        setTimeout(() => {
            if (estados.autorizacao.modoAtual === 'automatico' && !estados.autorizacao.scannerAtivo) {
                iniciarScannerModulo('autorizacao');
            }
        }, 300);
    });
    carregarListaModulo('autorizacao');
    
    // JUSTIFICATIVA
    safeGet('modoAutomaticoJustificativaBtn')?.addEventListener('click', () => setModoModulo('justificativa', 'automatico'));
    safeGet('modoManualJustificativaBtn')?.addEventListener('click', () => setModoModulo('justificativa', 'manual'));
    safeGet('filtroTurmaManualJustificativa')?.addEventListener('change', () => carregarAlunosTurmaModulo('justificativa'));
    safeGet('filtroBuscaManualJustificativa')?.addEventListener('input', () => filtrarAlunosManualModulo('justificativa'));
    safeGet('aba-justificativa')?.addEventListener('shown.bs.tab', () => {
        carregarTurmasManualModulo('justificativa');
        carregarListaModulo('justificativa');
        setTimeout(() => {
            if (estados.justificativa.modoAtual === 'automatico' && !estados.justificativa.scannerAtivo) {
                iniciarScannerModulo('justificativa');
            }
        }, 300);
    });
    carregarListaModulo('justificativa');
    
    // 2ª CHAMADA
    safeGet('modoAutomaticoSegundaChamadaBtn')?.addEventListener('click', () => setModoModulo('segundaChamada', 'automatico'));
    safeGet('modoManualSegundaChamadaBtn')?.addEventListener('click', () => setModoModulo('segundaChamada', 'manual'));
    safeGet('filtroTurmaManualSegundaChamada')?.addEventListener('change', () => carregarAlunosTurmaModulo('segundaChamada'));
    safeGet('filtroBuscaManualSegundaChamada')?.addEventListener('input', () => filtrarAlunosManualModulo('segundaChamada'));
    safeGet('aba-segunda-chamada')?.addEventListener('shown.bs.tab', () => {
        carregarTurmasManualModulo('segundaChamada');
        carregarListaModulo('segundaChamada');
        setTimeout(() => {
            if (estados.segundaChamada.modoAtual === 'automatico' && !estados.segundaChamada.scannerAtivo) {
                iniciarScannerModulo('segundaChamada');
            }
        }, 300);
    });
    carregarListaModulo('segundaChamada');
    
    // ============ EVENTOS DOS MÓDULOS ============
    ['autorizacao', 'justificativa', 'segundaChamada'].forEach(modulo => {
        configurarEventosModulo(modulo);
    });
    
    // ============ INICIALIZA ASSINATURAS ============
    setTimeout(() => {
        ['autorizacao', 'justificativa', 'segundaChamada'].forEach(modulo => {
            inicializarAssinatura(modulo);
        });
    }, 800);
});

window.addEventListener('beforeunload', () => {
    pararScannerAutomatico();
    pararScannerModulo('autorizacao');
    pararScannerModulo('justificativa');
    pararScannerModulo('segundaChamada');
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
            // Container escondido — tenta de novo depois
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

    // TOUCH (mobile)
    canvas.addEventListener('touchstart', iniciar, { passive: false });
    canvas.addEventListener('touchmove', desenhar, { passive: false });
    canvas.addEventListener('touchend', parar, { passive: false });
    canvas.addEventListener('touchcancel', parar, { passive: false });

    // MOUSE (desktop)
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
    if (!state.canvas || !state.ctx) return;
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
    if (!state.canvas || !state.temAssinatura) return;
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
    if (histDiv && data.historicoRecente?.length > 0) {
        histDiv.innerHTML = `
            <h6 class="text-muted mt-3 mb-2"><i class="fas fa-history"></i> Histórico Recente</h6>
            ${data.historicoRecente.map(h => `
                <div class="p-2 mb-2" style="background: #f8fafc; border-radius: 8px; font-size: 13px;">
                    <strong>${escapeHTML(h.motivoLabel)}</strong>: ${escapeHTML((h.descricao || '').substring(0, 80))}
                    <br><small class="text-muted">${h.dataHora ? new Date(h.dataHora).toLocaleString('pt-BR') : ''}</small>
                </div>`).join('')}`;
    } else if (histDiv) { histDiv.innerHTML = ''; }
    
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
    
    // 🔥 NOVO: Preenche data de hoje automaticamente
    const hoje = new Date().toISOString().split('T')[0];
    const dataEl = safeGet('atrasoData');
    if (dataEl) dataEl.value = hoje;
    
    // 🔥 NOVO: Preenche hora atual automaticamente
    const agora = new Date();
    const horaAtual = String(agora.getHours()).padStart(2, '0') + ':' + 
                      String(agora.getMinutes()).padStart(2, '0');
    const horaEl = safeGet('atrasoHoraChegada');
    if (horaEl) horaEl.value = horaAtual;
    
    // 🔥 NOVO: Foca no campo de data
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
    
    // 🔥 NOVO: Valida data
    const dataAtraso = safeGet('atrasoData')?.value;
    if (!dataAtraso) { 
        notificar('Selecione a data do atraso', 'error');
        return; 
    }
    
    // 🔥 NOVO: Valida se data não é futura
    const hoje = new Date();
    hoje.setHours(23, 59, 59, 999);
    const dataSelecionada = new Date(dataAtraso + 'T00:00:00');
    if (dataSelecionada > hoje) {
        const confirmar = await confirm('⚠️ A data selecionada é no futuro. Deseja continuar mesmo assim?');
        if (!confirmar) {
            return;
        }
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
    
    const btn = document.querySelector('#formRegistro .btn-primary-custom');
    if (btn) btn.disabled = true;
    
    try {
        // 🔥 NOVO: Combina data + hora para montar dataHora completa
        const horaChegada = safeGet('atrasoHoraChegada')?.value || '';
        let dataHoraCompleta;
        
        if (horaChegada) {
            dataHoraCompleta = new Date(dataAtraso + 'T' + horaChegada + ':00');
        } else {
            // Se não informou hora, usa meio-dia para não bugar timezone
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
                }
            })
        });
        const data = await response.json();
        if (data.success) {
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
// 📋 ATRASOS RECENTES (DASHBOARD)
// ============================================
let __atrasosRecentes = [];

async function carregarAtrasosRecentes(pagina = 1) {
    const container = safeGet('listaAtrasosRecentes');
    if (!container) return;
    
    const busca = (safeGet('filtroAtrasosRecentesBusca')?.value || '').trim().toLowerCase();
    const turma = safeGet('filtroAtrasosRecentesTurma')?.value || '';
    
    container.innerHTML = `
        <div class="text-center py-4">
            <div class="spinner-border spinner-border-sm text-primary" role="status"></div>
            <p class="text-muted mt-2 mb-0">Carregando atrasos...</p>
        </div>`;
    
    try {
        const params = new URLSearchParams();
        params.append('limit', '20');
        params.append('page', pagina);
        if (turma) params.append('turma', turma);
        
        const response = await fetch(`/api/gestao-geral/atraso/listar?${params.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (!data.success || !Array.isArray(data.atrasos)) {
            container.innerHTML = `<div class="alert alert-warning">Nenhum atraso encontrado</div>`;
            return;
        }
        
        let lista = data.atrasos;
        
        if (busca) {
            lista = lista.filter(a =>
                (a.alunoNome || '').toLowerCase().includes(busca) ||
                (a.alunoMatricula || '').toLowerCase().includes(busca)
            );
        }
        
        __atrasosRecentes = lista;
        atualizarContadorAtrasosRecentes(lista.length);
        renderizarListaAtrasosRecentes(lista);
    } catch (error) {
        console.error('Erro ao carregar atrasos:', error);
        container.innerHTML = `<div class="alert alert-danger"><i class="fas fa-exclamation-triangle"></i> Erro ao carregar</div>`;
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
    
    container.innerHTML = `
        <div class="table-responsive">
            <table class="table table-hover table-sm align-middle">
                <thead style="background: #eef2ff;">
                    <tr>
                        <th style="width: 28%;">Aluno</th>
                        <th style="width: 15%;">Turma</th>
                        <th style="width: 15%;">Motivo</th>
                        <th style="width: 20%;">Data/Hora</th>
                        <th style="width: 22%; text-align: center;">Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${lista.map(a => {
                        const cor = corMotivo[a.motivo] || '#6b7280';
                        return `
                            <tr data-id="${a.id}">
                                <td>
                                    <div class="d-flex align-items-center gap-2">
                                        <img src="${gerarAvatarSVG(a.alunoNome || '?')}" 
                                             style="width: 32px; height: 32px; border-radius: 50%;" alt="">
                                        <div>
                                            <strong style="font-size: 13px;">${escapeHTML(a.alunoNome || '')}</strong>
                                            <br><small class="text-muted" style="font-size: 11px;">${escapeHTML(a.alunoMatricula || '')}</small>
                                        </div>
                                    </div>
                                </td>
                                <td><small>${escapeHTML(a.alunoTurma || '-')}</small></td>
                                <td>
                                    <span class="badge" style="background: ${cor}; font-size: 11px;">
                                        ${escapeHTML(a.motivoLabel || a.motivo || '-')}
                                    </span>
                                </td>
                                <td><small>${a.dataHoraFormatada || (a.dataHora ? new Date(a.dataHora).toLocaleString('pt-BR') : '-')}</small></td>
                                <td class="text-center">
                                    <div class="d-flex gap-1 justify-content-center flex-wrap">
                                        <button class="btn btn-sm btn-info" 
                                                onclick="verAtraso('${a.id}')" 
                                                title="Ver detalhes">
                                            <i class="fas fa-eye"></i>
                                        </button>
                                        <button class="btn btn-sm btn-warning" 
                                                onclick="editarAtraso('${a.id}')" 
                                                title="Editar">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        <button class="btn btn-sm btn-success" 
                                                onclick="imprimirAtraso('${a.id}')" 
                                                title="Imprimir">
                                            <i class="fas fa-print"></i>
                                        </button>
                                        <button class="btn btn-sm btn-danger" 
                                                onclick="excluirAtraso('${a.id}', '${escapeHTML(a.alunoNome || '')}')" 
                                                title="Excluir">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </td>
                            </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;
}

// ============================================
// 👁️ VER ATRASO
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
            
            // Toast de sucesso
            notificar('✅ Atraso atualizado com sucesso!', 'success');
            
            // Recarrega a lista
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
        const win = window.open('', '_blank');
        win.document.write(gerarHTMLImpressaoAtraso(a));
        win.document.close();
        win.onload = () => setTimeout(() => win.print(), 500);
    } catch (error) {
        console.error('Erro:', error);
        notificar('Erro ao imprimir');
    }
}

function gerarHTMLImpressaoAtraso(a) {
    const logo = '/uploads/logo-iema.png';
    const carimboGestao = '/icons/assinatura_gestao.ico';
    const dataExt = new Date(a.dataHora).toLocaleDateString('pt-BR', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
    const horaExt = new Date(a.dataHora).toLocaleTimeString('pt-BR', {
        hour: '2-digit', minute: '2-digit'
    });

    const carimboGestaoHTML = `
        <div class="carimbo-gestao">
            <img src="${carimboGestao}" alt="Carimbo Gestão Geral">
        </div>`;

    // 🔥 NOVO: Mostra horários apenas se preenchidos
    const horarioPrevisto = a.detalhes?.horarioPrevisto || '';
    const horarioChegada = a.detalhes?.horarioChegada || '';
    const mostrarHorarios = horarioPrevisto || horarioChegada;
    
    let horariosHTML = '';
    if (mostrarHorarios) {
        horariosHTML = `
            <div class="info-row">
                ${horarioPrevisto ? `
                    <div class="info-item">
                        <span class="label">Horário Previsto:</span>
                        <span class="underline">${horarioPrevisto}</span>
                    </div>` : ''}
                ${horarioChegada ? `
                    <div class="info-item">
                        <span class="label">Horário de Chegada:</span>
                        <span class="underline">${horarioChegada}</span>
                    </div>` : ''}
            </div>`;
    }

    return `<!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <title>Atraso - ${a.alunoNome}</title>
        <style>
            @page { size: A4 portrait; margin: 15mm; }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            html, body {
                width: 210mm;
                min-height: 297mm;
                font-family: 'Times New Roman', Times, serif;
                background: #f0f0f0;
                display: flex;
                justify-content: center;
                align-items: flex-start;
            }
            .folha {
                width: 180mm;
                min-height: 267mm;
                padding: 10mm;
                background: white;
                margin: 0 auto;
                font-size: 10pt;
                line-height: 1.4;
                display: flex;
                flex-direction: column;
            }
            @media print {
                html, body { 
                    width: 210mm; 
                    height: 297mm; 
                    background: white;
                    display: block;
                }
                .folha { 
                    width: 100%; 
                    min-height: auto;
                    padding: 0;
                    margin: 0 auto;
                }
                .btn-print { display: none !important; }
            }
            .header { text-align: center; border-bottom: 2px double #000; padding-bottom: 8px; margin-bottom: 10px; }
            .header img { max-width: 100%; height: auto; max-height: 25mm; object-fit: contain; }
            .header h1 { font-size: 10pt; margin: 5px 0 0 0; text-transform: uppercase; font-weight: bold; }
            .titulo {
                text-align: center; font-size: 13pt; font-weight: bold; text-transform: uppercase;
                margin: 10px 0; background: #eef2ff; padding: 8px; border: 1.5px solid #000; letter-spacing: 1px;
            }
            .info-section { border: 1px solid #000; padding: 10px 12px; margin-bottom: 10px; }
            .info-row { display: flex; margin-bottom: 6px; gap: 15px; align-items: baseline; }
            .info-row:last-child { margin-bottom: 0; }
            .info-item { flex: 1; display: flex; align-items: baseline; gap: 6px; min-width: 0; }
            .label { font-weight: bold; font-size: 9pt; white-space: nowrap; }
            .underline {
                border-bottom: 1px dotted #000; flex: 1; height: 18px; min-height: 18px;
                font-size: 10pt; padding: 0 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            }
            .motivo-box { background: #f5f5f5; border: 1px solid #000; padding: 10px 12px; margin: 10px 0; }
            .motivo-box h3 { margin: 0 0 5px 0; font-size: 10pt; text-transform: uppercase; }
            .motivo-box p { margin: 0; font-size: 10pt; font-weight: bold; }
            .observacoes { border: 1px solid #000; padding: 10px 12px; min-height: 25mm; margin: 10px 0; font-size: 9.5pt; }
            .observacoes strong { display: block; margin-bottom: 5px; font-size: 10pt; }
            .assinaturas { display: flex; justify-content: space-around; margin-top: 15mm; gap: 15mm; }
            .assinatura { text-align: center; flex: 1; font-size: 9pt; position: relative; }
            .assinatura-vazia {
                border-bottom: 1px solid #000;
                min-height: 18mm;
                display: flex;
                align-items: flex-end;
                justify-content: center;
                color: #999;
                font-size: 9pt;
                padding-bottom: 3px;
            }
            .assinatura-linha { padding-top: 5px; font-size: 9pt; }
            .carimbo-gestao {
                border-bottom: 1px solid #000;
                min-height: 18mm;
                display: flex;
                align-items: flex-end;
                justify-content: center;
                padding-bottom: 3px;
            }
            .carimbo-gestao img {
                max-height: 16mm;
                max-width: 100%;
                object-fit: contain;
                opacity: 0.9;
            }
            .footer {
                text-align: center; margin-top: auto; padding-top: 8px;
                border-top: 1px solid #000; font-size: 8pt; color: #444;
            }
            .footer p { margin: 2px 0; }
            .btn-print {
                display: block; margin: 15px auto; padding: 10px 30px;
                background: #1e3c72; color: white; border: none; border-radius: 8px;
                font-weight: bold; cursor: pointer; font-size: 14px; font-family: Arial, sans-serif;
            }
            .btn-print:hover { background: #2a5298; }
        </style>
    </head>
    <body>
        <button class="btn-print no-print" onclick="window.print()">🖨️ Imprimir</button>
        <div class="folha">
            <div class="header">
                <img src="${logo}" alt="IEMA" onerror="this.style.display='none'">
                <h1>IEMA PLENO: SÃO LUÍS - CENTRO</h1>
            </div>
            <div class="titulo">📋 REGISTRO DE ATRASO</div>
            <div class="info-section">
                <div class="info-row">
                    <div class="info-item">
                        <span class="label">Estudante:</span>
                        <span class="underline">${a.alunoNome || ''}</span>
                    </div>
                </div>
                <div class="info-row">
                    <div class="info-item">
                        <span class="label">Matrícula:</span>
                        <span class="underline">${a.alunoMatricula || ''}</span>
                    </div>
                    <div class="info-item">
                        <span class="label">Turma:</span>
                        <span class="underline">${a.alunoTurma || ''}</span>
                    </div>
                </div>
                <div class="info-row">
                    <div class="info-item">
                        <span class="label">Curso:</span>
                        <span class="underline">${a.alunoCurso || ''}</span>
                    </div>
                </div>
                <div class="info-row">
                    <div class="info-item">
                        <span class="label">Data:</span>
                        <span class="underline">${dataExt}</span>
                    </div>
                    <div class="info-item">
                        <span class="label">Horário:</span>
                        <span class="underline">${horaExt}</span>
                    </div>
                </div>
                ${horariosHTML}
            </div>
            <div class="motivo-box">
                <h3>📌 Motivo:</h3>
                <p>☑ ${a.motivoLabel || a.motivo || '-'}</p>
            </div>
            <div class="observacoes">
                <strong>📝 Descrição:</strong>
                ${a.descricao || '___________________________________________________________________'}
            </div>
            ${a.observacoes ? `
                <div class="observacoes" style="min-height: 18mm;">
                    <strong>💬 Observações:</strong>
                    ${a.observacoes}
                </div>
            ` : ''}
            <div class="assinaturas">
                <div class="assinatura">
                    <div class="assinatura-vazia">_____________________________________</div>
                    <div class="assinatura-linha">Assinatura do Responsável</div>
                </div>
                <div class="assinatura">
                    ${carimboGestaoHTML}
                    <div class="assinatura-linha">Coordenação / Gestão Geral</div>
                </div>
            </div>
            <div class="footer">
                <p>Gerado em ${new Date().toLocaleString('pt-BR')} por ${a.registradoPor || 'Gestão Geral'}</p>
                <p>EducaPleno</p>
            </div>
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
    if (!confirmar1) {
        return;
    }
    
    const confirmar2 = await confirm('⚠️ ÚLTIMA CONFIRMAÇÃO!\n\nDeseja realmente excluir permanentemente?');
    if (!confirmar2) {
        return;
    }
    
    try {
        const response = await fetch(`/api/gestao-geral/atraso/${atrasoId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success) {
            // Remove a linha da tabela com animação
            const row = document.querySelector(`tr[data-id="${atrasoId}"]`);
            if (row) {
                row.style.transition = 'all 0.3s';
                row.style.opacity = '0';
                row.style.transform = 'translateX(-20px)';
                setTimeout(() => {
                    row.remove();
                    const contador = safeGet('contadorAtrasosRecentes');
                    if (contador) {
                        const atual = parseInt(contador.textContent) || 0;
                        contador.textContent = Math.max(0, atual - 1);
                    }
                    const tabela = document.querySelector('#listaAtrasosRecentes tbody');
                    if (tabela && tabela.children.length === 0) {
                        carregarAtrasosRecentes();
                    }
                }, 300);
            }
            
            notificar('✅ Atraso excluído com sucesso!', 'success');
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
    const busca = safeGet('filtroAtrasosRecentesBusca');
    if (busca) {
        let timeout;
        busca.addEventListener('input', () => {
            clearTimeout(timeout);
            timeout = setTimeout(() => carregarAtrasosRecentes(1), 300);
        });
    }
    
    const turma = safeGet('filtroAtrasosRecentesTurma');
    if (turma) {
        turma.addEventListener('change', () => carregarAtrasosRecentes(1));
    }
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
    
    // ✅ RESETAR BOTÕES
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
            
            // ✅ HABILITAR BOTÕES CSV E PDF
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
    if (!relatorioData) { notificar('Nenhum relatório carregado'); return; }
    const dados = relatorioData.atrasos || [];
    if (dados.length === 0) { notificar('Nenhum dado'); return; }
    
    let csv = "Data,Aluno,Turma,Motivo,Descrição\n";
    dados.forEach(a => {
        csv += [
            a.dataHora ? new Date(a.dataHora).toLocaleString('pt-BR') : '',
            `"${(a.alunoNome || relatorioData.aluno?.nome || '').replace(/"/g, '""')}"`,
            `"${(a.alunoTurma || relatorioData.aluno?.turma || relatorioData.turma || '').replace(/"/g, '""')}"`,
            `"${(a.motivoLabel || '').replace(/"/g, '""')}"`,
            `"${(a.descricao || '').replace(/"/g, '""')}"`
        ].join(',') + '\n';
    });
    
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `gestao-geral-atrasos_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
}

// ============================================================================
// ============ MÓDULOS: AUTORIZAÇÃO / JUSTIFICATIVA / 2ª CHAMADA =============
// ============================================================================

function getCfg(modulo) { return CONFIG_MODULOS[modulo]; }
function getPrefixo(modulo) { return CONFIG_MODULOS[modulo].prefixo; }

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
    try { await buscarAlunoModulo(modulo, alunoId); } catch (e) { console.error(e); }
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
    const formEl = safeGet(`form${P}`);
    if (formEl) formEl.style.display = 'block';
    
    const motivoEl = safeGet(`${cfg.tipo}MotivoSelecionado`);
    if (motivoEl) motivoEl.value = '';
    estados[modulo].motivoSelecionado = null;
    document.querySelectorAll(`#form${P} .tipo-card`).forEach(c => c.classList.remove('selected'));
    
    const campos = [
        `${cfg.tipo}Data`, `${cfg.tipo}Horario`, `${cfg.tipo}MotivoOutros`,
        `${cfg.tipo}ResponsavelNome`, `${cfg.tipo}ResponsavelCPF`,
        `${cfg.tipo}ResponsavelTelefone`, `${cfg.tipo}Observacoes`,
        `${cfg.tipo}HorarioEntrada`, `${cfg.tipo}HorarioSaida`,
        `${cfg.tipo}HorarioAusencia`, `${cfg.tipo}HorarioRetorno`
    ];
    campos.forEach(id => { const el = safeGet(id); if (el) el.value = ''; });
    
    const campoOutros = safeGet(`campo${P}Outros`);
    if (campoOutros) campoOutros.style.display = 'none';
    const campoAusencia = safeGet(`campo${P}AusenciaRetorno`);
    if (campoAusencia) campoAusencia.style.display = 'none';
    
    const dataEl = safeGet(`${cfg.tipo}Data`);
    if (dataEl) dataEl.value = new Date().toISOString().split('T')[0];
    
    // Limpa assinatura
    limparAssinatura(modulo);
    
    // Reajusta canvas (pode ter sido escondido quando inicializou)
    setTimeout(() => {
        const canvas = safeGet(`${modulo}AssinaturaCanvas`);
        if (canvas && canvas.dataset.assinaturaInit !== 'true') {
            inicializarAssinatura(modulo);
        }
    }, 200);
    
    // Atualiza aviso de integração
    atualizarAvisoIntegracao(modulo);
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
    const cfg = getCfg(modulo);
    const P = getPrefixo(modulo);
    estados[modulo].motivoSelecionado = motivo;
    const el = safeGet(`${cfg.tipo}MotivoSelecionado`);
    if (el) el.value = motivo;
    
    document.querySelectorAll(`#form${P} .tipo-card`).forEach(c => c.classList.remove('selected'));
    const card = document.querySelector(`#form${P} .tipo-card[data-tipo="${motivo}"]`);
    if (card) card.classList.add('selected');
    
    const campoOutros = safeGet(`campo${P}Outros`);
    if (campoOutros) campoOutros.style.display = motivo === 'outros' ? 'block' : 'none';
    const campoAusencia = safeGet(`campo${P}AusenciaRetorno`);
    if (campoAusencia) campoAusencia.style.display = motivo === 'necessita_ausentar_retornar' ? 'block' : 'none';
    
    // Atualiza aviso de integração
    atualizarAvisoIntegracao(modulo);
}

// ============================================
// REGISTRAR MÓDULO (COM ASSINATURA E INTEGRAÇÃO)
// ============================================
async function registrarModulo(modulo) {
    const cfg = getCfg(modulo);
    const est = estados[modulo];
    const P = getPrefixo(modulo);
    
    if (!est.motivoSelecionado) { 
        notificar('Selecione o motivo', 'error');
        return; 
    }
    const data = safeGet(`${cfg.tipo}Data`)?.value;
    if (!data) { 
        notificar('Preencha a data', 'error');
        return; 
    }
    
    if (est.motivoSelecionado === 'outros') {
        const motivoOutros = safeGet(`${cfg.tipo}MotivoOutros`)?.value.trim();
        if (!motivoOutros) { 
            notificar('Especifique o motivo', 'error');
            return; 
        }
    }
    if (est.motivoSelecionado === 'necessita_ausentar_retornar') {
        const ha = safeGet(`${cfg.tipo}HorarioAusencia`)?.value;
        const hr = safeGet(`${cfg.tipo}HorarioRetorno`)?.value;
        if (!ha || !hr) { 
            notificar('Informe os horários de ausência e retorno', 'error');
            return; 
        }
    }
    if (!est.currentAluno) { 
        notificar('Nenhum aluno selecionado', 'error');
        return; 
    }
    
    // VALIDAÇÃO DA ASSINATURA
    const assinaturaBase64 = obterAssinaturaBase64(modulo);
    if (!assinaturaBase64) {
        const confirmar = await confirm('⚠️ Nenhuma assinatura foi capturada. Deseja continuar mesmo assim?');
        if (!confirmar) {
            return;
        }
    }
    
    const btn = document.querySelector(`#form${P} .btn-primary-custom`);
    if (btn) btn.disabled = true;
    
    try {
        const body = {
            tipo: cfg.tipo,
            alunoId: est.currentAluno.id,
            data,
            horarioEntrada: safeGet(`${cfg.tipo}HorarioEntrada`)?.value || '',
            horarioSaida: safeGet(`${cfg.tipo}HorarioSaida`)?.value || '',
            responsavelNome: safeGet(`${cfg.tipo}ResponsavelNome`)?.value || '',
            responsavelCPF: safeGet(`${cfg.tipo}ResponsavelCPF`)?.value || '',
            responsavelTelefone: safeGet(`${cfg.tipo}ResponsavelTelefone`)?.value || '',
            motivo: est.motivoSelecionado,
            motivoOutros: safeGet(`${cfg.tipo}MotivoOutros`)?.value || '',
            horarioAusencia: safeGet(`${cfg.tipo}HorarioAusencia`)?.value || '',
            horarioRetorno: safeGet(`${cfg.tipo}HorarioRetorno`)?.value || '',
            observacoes: safeGet(`${cfg.tipo}Observacoes`)?.value || '',
            assinaturaBase64: assinaturaBase64
        };
        
        // ========== REGISTRA O MÓDULO PRINCIPAL ==========
        const r = await fetch('/api/gestao-geral/autorizacao/registrar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(body)
        });
        const d = await r.json();
        
        if (!d.success) {
            notificar('❌ ' + (d.error || 'Erro'), 'error');
            return;
        }
        
        console.log(`✅ ${cfg.nomeAmigavel} registrado:`, d.autorizacao.id);
        
        // ========== INTEGRAÇÃO AUTOMÁTICA ==========
        let justificativaCriada = false;
        
        // CASO 1: Autorização por doença → cria Justificativa
        if (modulo === 'autorizacao') {
            const motivoJustificativa = MOTIVOS_AUTORIZACAO_GERAM_JUSTIFICATIVA[est.motivoSelecionado];
            if (motivoJustificativa) {
                console.log(`🔄 Criando justificativa automática (motivo: ${motivoJustificativa})...`);
                justificativaCriada = await criarJustificativaAutomatica({
                    alunoId: est.currentAluno.id,
                    data,
                    motivo: motivoJustificativa,
                    motivoOutros: safeGet(`${cfg.tipo}MotivoOutros`)?.value || '',
                    responsavelNome: safeGet(`${cfg.tipo}ResponsavelNome`)?.value || '',
                    responsavelCPF: safeGet(`${cfg.tipo}ResponsavelCPF`)?.value || '',
                    responsavelTelefone: safeGet(`${cfg.tipo}ResponsavelTelefone`)?.value || '',
                    observacoes: `Gerada automaticamente a partir de ${cfg.nomeAmigavel}: ${d.autorizacao.motivoLabel || ''} | ${safeGet(`${cfg.tipo}Observacoes`)?.value || ''}`.trim(),
                    origemTipo: 'autorizacao',
                    origemId: d.autorizacao.id,
                    assinaturaBase64: assinaturaBase64
                });
            }
        }
        
        // CASO 2: 2ª Chamada → cria Justificativa
        if (modulo === 'segundaChamada') {
            const motivoJustificativa = MOTIVOS_SEGUNDA_CHAMADA_PARA_JUSTIFICATIVA[est.motivoSelecionado] || 'outros';
            console.log(`🔄 Criando justificativa automática (motivo: ${motivoJustificativa})...`);
            justificativaCriada = await criarJustificativaAutomatica({
                alunoId: est.currentAluno.id,
                data,
                motivo: motivoJustificativa,
                motivoOutros: safeGet(`${cfg.tipo}MotivoOutros`)?.value || '',
                responsavelNome: safeGet(`${cfg.tipo}ResponsavelNome`)?.value || '',
                responsavelCPF: safeGet(`${cfg.tipo}ResponsavelCPF`)?.value || '',
                responsavelTelefone: safeGet(`${cfg.tipo}ResponsavelTelefone`)?.value || '',
                observacoes: `Gerada automaticamente a partir de 2ª Chamada | ${safeGet(`${cfg.tipo}Observacoes`)?.value || ''}`.trim(),
                origemTipo: 'segunda_chamada',
                origemId: d.autorizacao.id,
                assinaturaBase64: assinaturaBase64
            });
        }
        
        // ========== FEEDBACK ==========
        let msg = `✅ ${d.message}`;
        if (justificativaCriada) {
            msg += ' — Justificativa de Falta criada automaticamente!';
        }
        notificar(msg, 'success');
        
        // ========== IMPRESSÃO ==========
        const imprimir = await confirm('Deseja IMPRIMIR agora?');
        if (imprimir) {
            imprimirModulo(modulo, d.autorizacao.id);
        }
        
        // ========== LIMPEZA ==========
        limparTelaModulo(modulo);
        carregarListaModulo(modulo);
        
        // Se criou justificativa automática, atualiza a lista de justificativas
        if (justificativaCriada) {
            carregarListaModulo('justificativa');
        }
        
        if (est.modoAtual === 'automatico') reiniciarScannerModulo(modulo);
    } catch (e) {
        console.error(e);
        notificar('Erro ao registrar', 'error');
    } finally { 
        if (btn) btn.disabled = false; 
    }
}

/**
 * Cria uma justificativa automaticamente
 * @returns {Promise<boolean>} true se criada com sucesso
 */
async function criarJustificativaAutomatica(params) {
    try {
        const {
            alunoId, data, motivo, motivoOutros = '',
            responsavelNome = '', responsavelCPF = '', responsavelTelefone = '',
            observacoes = '', origemTipo, origemId, assinaturaBase64 = ''
        } = params;
        
        const body = {
            tipo: 'justificativa',
            alunoId,
            data,
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
}

function reiniciarScannerModulo(modulo) {
    setTimeout(() => {
        if (!estados[modulo].scannerAtivo && estados[modulo].modoAtual === 'automatico') {
            iniciarScannerModulo(modulo);
        }
    }, 1000);
}

// ============================================
// LISTA COM FILTROS
// ============================================
async function carregarListaModulo(modulo) {
    const cfg = getCfg(modulo);
    const container = safeGet(cfg.containerLista);
    if (!container) return;

    await carregarOpcoesFiltrosLista(modulo);

    const P = getPrefixo(modulo);
    const alunoNome = safeGet(`filtroLista${P}Aluno`)?.value || '';
    const turma = safeGet(`filtroLista${P}Turma`)?.value || '';
    const motivo = safeGet(`filtroLista${P}Motivo`)?.value || '';
    const dataInicio = safeGet(`filtroLista${P}DataInicio`)?.value || '';
    const dataFim = safeGet(`filtroLista${P}DataFim`)?.value || '';

    let url = `/api/gestao-geral/autorizacao/listar?tipo=${cfg.tipo}&limit=50`;
    if (alunoNome) url += `&alunoNome=${encodeURIComponent(alunoNome)}`;
    if (turma) url += `&turma=${encodeURIComponent(turma)}`;
    if (motivo) url += `&motivo=${encodeURIComponent(motivo)}`;
    if (dataInicio) url += `&dataInicio=${dataInicio}`;
    if (dataFim) url += `&dataFim=${dataFim}`;

    container.innerHTML = `
        <div class="text-center py-3">
            <div class="loading-spinner"></div>
            <p>Carregando ${cfg.nomeAmigavel.toLowerCase()}...</p>
        </div>`;

    try {
        const r = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();

        if (!d.success || !d.autorizacoes || d.autorizacoes.length === 0) {
            container.innerHTML = `<p class="text-muted text-center py-3">
                <i class="fas fa-inbox" style="font-size: 32px; color: #cbd5e1; display: block; margin-bottom: 10px;"></i>
                Nenhum registro de ${cfg.nomeAmigavel.toLowerCase()} encontrado.
            </p>`;
            return;
        }

        const mostraHorario = cfg.tipo === 'autorizacao';
        const cabecalhoHorarios = mostraHorario ? '<th>Entrada</th><th>Saída</th>' : '<th>Horário</th>';

        container.innerHTML = `
            <div class="table-responsive">
                <table class="table table-hover">
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>Aluno</th>
                            <th>Turma</th>
                            ${cabecalhoHorarios}
                            <th>Motivo</th>
                            <th>Responsável</th>
                            <th>Assinatura</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${d.autorizacoes.map(a => `
                            <tr>
                                <td>${a.dataFormatada}</td>
                                <td><strong>${escapeHTML(a.alunoNome)}</strong></td>
                                <td>${escapeHTML(a.alunoTurma)}</td>
                                ${mostraHorario 
                                    ? `<td>${a.horarioEntrada || '-'}</td><td>${a.horarioSaida || '-'}</td>`
                                    : `<td>${a.horarioEntrada || '-'}</td>`}
                                <td><span class="badge bg-info text-dark">${escapeHTML(a.motivoLabel)}</span></td>
                                <td>
                                    ${a.responsavelNome ? `
                                        <div style="font-size:12px;">
                                            <strong>${escapeHTML(a.responsavelNome)}</strong>
                                            ${a.responsavelCPF ? `<br><small>CPF: ${escapeHTML(a.responsavelCPF)}</small>` : ''}
                                            ${a.responsavelTelefone ? `<br><small>Tel: ${escapeHTML(a.responsavelTelefone)}</small>` : ''}
                                        </div>` : '-'}
                                </td>
                                <td>
                                    ${a.temAssinatura 
                                        ? '<span class="badge bg-success"><i class="fas fa-signature"></i> Assinado</span>' 
                                        : '<span class="badge bg-secondary">Sem</span>'}
                                </td>
                                <td>
                                    <button class="btn btn-sm btn-primary" onclick="imprimirModulo('${modulo}', '${a.id}')" title="Imprimir">
                                        <i class="fas fa-print"></i>
                                    </button>
                                    <button class="btn btn-sm btn-warning" onclick="abrirEditarModulo('${modulo}', '${a.id}')" title="Editar">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button class="btn btn-sm btn-danger" onclick="excluirModulo('${modulo}', '${a.id}')" title="Excluir">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </td>
                            </tr>`).join('')}
                    </tbody>
                </table>
            </div>
            <p class="text-muted text-end mt-2"><small>${d.total} registro(s) encontrado(s)</small></p>`;
    } catch (e) {
        console.error(`❌ Erro ao carregar ${cfg.nomeAmigavel}:`, e);
        container.innerHTML = `
            <div class="text-center py-3">
                <p class="text-danger"><i class="fas fa-exclamation-triangle"></i> Erro ao carregar.</p>
                <button class="btn btn-sm btn-outline-primary" onclick="carregarListaModulo('${modulo}')">
                    <i class="fas fa-sync-alt"></i> Tentar novamente
                </button>
            </div>`;
    }
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
// ✏️ EDITAR MÓDULO (AUTORIZAÇÃO / JUSTIFICATIVA / 2ª CHAMADA)
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

        // Motivos por tipo
        const motivos = getMotivosPorTipo(cfg.tipo);
        const motivosOptions = motivos.map(m =>
            `<option value="${m.valor}" ${a.motivo === m.valor ? 'selected' : ''}>${m.label}</option>`
        ).join('');

        // Formata data para input date
        let dataInput = '';
        if (a.data) {
            const dObj = new Date(a.data);
            dataInput = dObj.toISOString().split('T')[0];
        }

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

                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label">Data <span class="text-danger">*</span></label>
                                    <input type="date" id="editModuloData" class="form-control" value="${dataInput}">
                                </div>
                                ${cfg.tipo === 'autorizacao' ? `
                                    <div class="col-md-3 mb-3">
                                        <label class="form-label">Entrada</label>
                                        <input type="time" id="editModuloHorarioEntrada" class="form-control" value="${a.horarioEntrada || ''}">
                                    </div>
                                    <div class="col-md-3 mb-3">
                                        <label class="form-label">Saída</label>
                                        <input type="time" id="editModuloHorarioSaida" class="form-control" value="${a.horarioSaida || ''}">
                                    </div>
                                ` : `
                                    <div class="col-md-6 mb-3">
                                        <label class="form-label">Horário</label>
                                        <input type="time" id="editModuloHorario" class="form-control" value="${a.horarioEntrada || ''}">
                                    </div>
                                `}
                            </div>

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
                                            <label class="form-label">CPF</label>
                                            <input type="text" id="editModuloResponsavelCPF" class="form-control" value="${escapeHTML(a.responsavelCPF || '')}" maxlength="14">
                                        </div>
                                        <div class="col-md-3 mb-3">
                                            <label class="form-label">Telefone</label>
                                            <input type="text" id="editModuloResponsavelTelefone" class="form-control" value="${escapeHTML(a.responsavelTelefone || '')}" maxlength="15">
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

async function salvarEdicaoModulo() {
    const id = safeGet('editModuloId')?.value;
    const modulo = safeGet('editModuloTipo')?.value;
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

    if (!data || !motivo) {
        notificar('Preencha os campos obrigatórios');
        return;
    }

    if (motivo === 'outros' && !motivoOutros.trim()) {
        notificar('Especifique o motivo "Outros"');
        return;
    }

    try {
        const body = {
            data,
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

        const response = await fetch(`/api/gestao-geral/autorizacao/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(body)
        });
        const result = await response.json();

        if (result.success) {
            const modal = bootstrap.Modal.getInstance(safeGet('modalEditarModulo'));
            if (modal) modal.hide();

            // Toast
            if (typeof mostrarToastConcluido === 'function') {
                notificar('✅ Registro atualizado com sucesso!', 'success');
            } else {
                notificar('✅ Registro atualizado com sucesso!');
            }

            // Recarrega
            carregarListaModulo(modulo);
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

    // ✅ RESETAR BOTÕES
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

    let url = '';
    if (tipo === 'geral') {
        url = `/api/gestao-geral/autorizacao/relatorio/geral?tipo=${cfg.tipo}&`;
        if (dataInicio) url += `dataInicio=${dataInicio}&`;
        if (dataFim) url += `dataFim=${dataFim}&`;
    } else if (tipo === 'turma') {
        const turma = safeGet(`${P}FiltroTurma`)?.value;
        if (!turma) { notificar('Selecione uma turma', 'warning'); return; }
        url = `/api/gestao-geral/autorizacao/relatorio/turma/${encodeURIComponent(turma)}?tipo=${cfg.tipo}&`;
        if (dataInicio) url += `dataInicio=${dataInicio}&`;
        if (dataFim) url += `dataFim=${dataFim}&`;
    } else if (tipo === 'aluno') {
        const alunoId = safeGet(`${P}FiltroAluno`)?.value;
        if (!alunoId) { notificar('Selecione um aluno', 'warning'); return; }
        url = `/api/gestao-geral/autorizacao/relatorio/aluno/${alunoId}?tipo=${cfg.tipo}&`;
        if (dataInicio) url += `dataInicio=${dataInicio}&`;
        if (dataFim) url += `dataFim=${dataFim}&`;
    }

    try {
        const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await response.json();
        
        if (data.success) {
            relatoriosModulo[modulo] = data;
            exibirRelatorioModulo(modulo, data, tipo);
            
            // ✅ HABILITAR BOTÕES CSV E PDF DO MÓDULO
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
// 📄 EXPORTAR PDF - ATRASOS
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
    
    // Assinatura digital
    let assinaturaDigital = null;
    const lista = data.atrasos || data.registros || [];
    const comAssinatura = lista.find(a => a.temAssinatura && a.assinaturaBase64);
    if (comAssinatura) assinaturaDigital = comAssinatura.assinaturaBase64;
    
    // Título
    let titulo = 'Relatório de Atrasos - Gestão Geral';
    let subtitulo = '';
    if (tipo === 'turma') { subtitulo = `Turma: ${data.turma || ''}`; }
    else if (tipo === 'aluno') {
        titulo = 'Relatório Individual de Atrasos';
        subtitulo = `${data.aluno?.nome || ''} — ${data.aluno?.turma || ''}`;
    } else { subtitulo = 'Relatório Geral'; }
    
    // Stats
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
    
    // Tabelas
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

// ============================================
// 📄 EXPORTAR PDF - MÓDULOS
// ============================================
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

// ============================================
// 🎨 GERAR HTML DO RELATÓRIO - MÓDULOS
// ============================================
function gerarHTMLRelatorioModulo(modulo, data, cfg) {
    const tipo = data.aluno ? 'aluno' : (data.turma ? 'turma' : 'geral');
    const logoIema = '/uploads/logo-iema.png';
    const carimbo = '/icons/assinatura_gestao.ico';
    const dataGeracao = new Date().toLocaleString('pt-BR');
    
    // ========== BUSCAR ASSINATURA DIGITAL ==========
    let assinaturaDigital = null;
    const listaRegistros = data.registros || data.autorizacoes || data.atendimentos || [];
    const comAssinatura = listaRegistros.find(a => a.temAssinatura && a.assinaturaBase64);
    if (comAssinatura) assinaturaDigital = comAssinatura.assinaturaBase64;
    
    // ========== HELPER: FORMATAR DATA DE CADASTRO ==========
    const formatarDataCadastro = (item) => {
        if (!item.createdAt) return '-';
        try {
            return new Date(item.createdAt).toLocaleString('pt-BR');
        } catch (e) {
            return '-';
        }
    };
    
    // ========== TÍTULO ==========
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
    
    // ========== ESTATÍSTICAS ==========
    let statsHTML = '';
    if (tipo === 'geral') {
        statsHTML = `
            <div class="stats">
                <div class="stat">
                    <div class="stat-value">${data.totalRegistros || 0}</div>
                    <div class="stat-label">Total de Registros</div>
                </div>
                <div class="stat">
                    <div class="stat-value">${(data.porMotivo || []).length}</div>
                    <div class="stat-label">Motivos Diferentes</div>
                </div>
                <div class="stat">
                    <div class="stat-value">${(data.porTurma || []).length}</div>
                    <div class="stat-label">Turmas Envolvidas</div>
                </div>
            </div>
        `;
    } else if (tipo === 'turma') {
        statsHTML = `
            <div class="stats">
                <div class="stat">
                    <div class="stat-value">${data.estatisticas?.totalRegistros || 0}</div>
                    <div class="stat-label">Total de Registros</div>
                </div>
                <div class="stat">
                    <div class="stat-value">${data.estatisticas?.totalAlunos || (data.porAluno || []).length}</div>
                    <div class="stat-label">Alunos Atendidos</div>
                </div>
            </div>
        `;
    } else if (tipo === 'aluno') {
        statsHTML = `
            <div class="stats">
                <div class="stat">
                    <div class="stat-value">${data.estatisticas?.totalRegistros || 0}</div>
                    <div class="stat-label">Total de Registros</div>
                </div>
                <div class="stat">
                    <div class="stat-value">${(data.porMotivo || []).length}</div>
                    <div class="stat-label">Motivos Diferentes</div>
                </div>
            </div>
        `;
    }
    
    // ========== TABELAS ==========
    let tabelaHTML = '';
    
    // ---- GERAL ----
    if (tipo === 'geral') {
        const porMotivo = Array.isArray(data.porMotivo) ? data.porMotivo : [];
        const porTurma = Array.isArray(data.porTurma) ? data.porTurma : [];
        const registros = data.registros || data.autorizacoes || [];
        
        tabelaHTML = `
            <div class="section-title">📊 Distribuição por Motivo</div>
            <table>
                <thead><tr><th>Motivo</th><th style="width:120px;text-align:center;">Quantidade</th></tr></thead>
                <tbody>
                    ${porMotivo.map(m => `
                        <tr>
                            <td><strong>${escapeHTML(m.label || '')}</strong></td>
                            <td style="text-align:center;">${m.count || 0}</td>
                        </tr>`).join('') || '<tr><td colspan="2" style="text-align:center;">Nenhum dado</td></tr>'}
                </tbody>
            </table>
            
            <div class="section-title">🏫 Distribuição por Turma</div>
            <table>
                <thead><tr><th>Turma</th><th style="width:120px;text-align:center;">Total</th><th style="width:120px;text-align:center;">Alunos</th></tr></thead>
                <tbody>
                    ${porTurma.map(t => `
                        <tr>
                            <td><strong>${escapeHTML(t.turma || '')}</strong></td>
                            <td style="text-align:center;">${t.total || 0}</td>
                            <td style="text-align:center;">${t.totalAlunos || 0}</td>
                        </tr>`).join('') || '<tr><td colspan="3" style="text-align:center;">Nenhum dado</td></tr>'}
                </tbody>
            </table>
            
            ${registros.length > 0 ? `
                <div class="section-title">📋 Últimos Registros</div>
                <table>
                    <thead>
                        <tr>
                            <th>Data do Registro</th>
                            <th>Data de Cadastro</th>
                            <th>Aluno</th>
                            <th>Turma</th>
                            <th>Motivo</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${registros.slice(0, 30).map(a => `
                            <tr>
                                <td>${a.dataFormatada || '-'}</td>
                                <td><small>${formatarDataCadastro(a)}</small></td>
                                <td><strong>${escapeHTML(a.alunoNome || '')}</strong></td>
                                <td>${escapeHTML(a.alunoTurma || '')}</td>
                                <td>${escapeHTML(a.motivoLabel || '')}</td>
                            </tr>`).join('')}
                    </tbody>
                </table>
            ` : ''}
        `;
    }
    
    // ---- TURMA ----
    else if (tipo === 'turma') {
        const porAluno = Array.isArray(data.porAluno) ? data.porAluno : [];
        const registros = data.registros || data.autorizacoes || [];
        
        tabelaHTML = `
            <div class="section-title">👥 Registros por Aluno</div>
            <table>
                <thead><tr><th>Aluno</th><th>Matrícula</th><th style="width:100px;text-align:center;">Total</th></tr></thead>
                <tbody>
                    ${porAluno.map(a => `
                        <tr>
                            <td><strong>${escapeHTML(a.alunoNome || '')}</strong></td>
                            <td>${escapeHTML(a.alunoMatricula || '-')}</td>
                            <td style="text-align:center;">${a.total || 0}</td>
                        </tr>`).join('') || '<tr><td colspan="3" style="text-align:center;">Nenhum dado</td></tr>'}
                </tbody>
            </table>
            
            ${registros.length > 0 ? `
                <div class="section-title">📋 Últimos Registros</div>
                <table>
                    <thead>
                        <tr>
                            <th>Data do Registro</th>
                            <th>Data de Cadastro</th>
                            <th>Aluno</th>
                            <th>Motivo</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${registros.slice(0, 30).map(a => `
                            <tr>
                                <td>${a.dataFormatada || '-'}</td>
                                <td><small>${formatarDataCadastro(a)}</small></td>
                                <td><strong>${escapeHTML(a.alunoNome || '')}</strong></td>
                                <td>${escapeHTML(a.motivoLabel || '')}</td>
                            </tr>`).join('')}
                    </tbody>
                </table>
            ` : ''}
        `;
    }
    
    // ---- ALUNO ----
    else if (tipo === 'aluno') {
        const registros = data.registros || data.autorizacoes || [];
        
        tabelaHTML = `
            <div class="section-title">📋 Histórico de Registros</div>
            <table>
                <thead>
                    <tr>
                        <th>Data do Registro</th>
                        <th>Data de Cadastro</th>
                        <th>Motivo</th>
                        <th>Observações</th>
                    </tr>
                </thead>
                <tbody>
                    ${registros.map(a => `
                        <tr>
                            <td>${a.dataFormatada || '-'}</td>
                            <td><small>${formatarDataCadastro(a)}</small></td>
                            <td>${escapeHTML(a.motivoLabel || '')}</td>
                            <td>${escapeHTML((a.observacoes || '').substring(0, 80))}${(a.observacoes || '').length > 80 ? '...' : ''}</td>
                        </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;">Nenhum registro</td></tr>'}
                </tbody>
            </table>
        `;
    }
    
    // ========== HTML FINAL ==========
    return `<!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <title>${titulo}</title>
        <style>
            @page { size: A4 portrait; margin: 12mm; }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; line-height: 1.4; color: #000; }
            .header { text-align: center; border-bottom: 2px double #000; padding-bottom: 10px; margin-bottom: 15px; }
            .header img { max-width: 100%; max-height: 25mm; object-fit: contain; display: block; margin: 0 auto 5px; }
            .header h1 { font-size: 13pt; text-transform: uppercase; font-weight: bold; margin: 5px 0 0; }
            .titulo {
                text-align: center; font-size: 14pt; font-weight: bold;
                background: #dbeafe; padding: 10px; border: 2px solid #000;
                margin: 15px 0; text-transform: uppercase; letter-spacing: 1px;
            }
            .subtitulo { text-align: center; font-size: 12pt; margin: -10px 0 15px; font-style: italic; }
            .stats {
                display: flex; gap: 15px; margin: 15px 0 20px; padding: 15px;
                background: #eef2ff; border-radius: 8px; border: 1px solid #c7d2fe;
            }
            .stat { text-align: center; flex: 1; border-right: 1px solid #c7d2fe; }
            .stat:last-child { border-right: none; }
            .stat-value { font-size: 22pt; font-weight: bold; color: #1e3c72; line-height: 1; }
            .stat-label { font-size: 9pt; color: #666; margin-top: 5px; }
            .section-title {
                font-size: 11pt; font-weight: bold; background: #e8e8e8;
                padding: 6px 10px; border-left: 4px solid #1e3c72; margin: 20px 0 10px;
            }
            table { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin-bottom: 15px; }
            th {
                background: #1e3c72; color: white; padding: 8px 6px; text-align: left;
                border: 1px solid #152a52; font-size: 9pt;
            }
            td { padding: 6px; border: 1px solid #ddd; vertical-align: top; }
            tr:nth-child(even) { background: #f9fafb; }
            .assinaturas { display: flex; justify-content: center; margin-top: 50px; gap: 40px; }
            .assinatura { flex: 0 0 60%; text-align: center; }
            .assinatura-container-relatorio {
                position: relative; border-bottom: 1px solid #000; min-height: 22mm;
                display: flex; align-items: flex-end; justify-content: center; padding-bottom: 3px;
            }
            .assinatura-img { max-height: 18mm; max-width: 100%; object-fit: contain; position: relative; z-index: 1; }
            .carimbo-overlay {
                position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
                max-height: 20mm; max-width: 60%; object-fit: contain;
                opacity: 0.85; pointer-events: none; z-index: 2;
            }
            .assinatura-linha { border-top: none; padding-top: 5px; font-size: 10pt; margin-top: 4px; }
            .footer { text-align: center; margin-top: 30px; padding-top: 10px; border-top: 1px solid #ccc; font-size: 8pt; color: #666; }
            .footer p { margin: 2px 0; }
            .registro-info { font-size: 9pt; color: #666; margin-top: 20px; text-align: center; }
            .btn-print {
                display: block; margin: 20px auto; padding: 12px 30px;
                background: #1e3c72; color: white; border: none; border-radius: 8px;
                font-weight: bold; cursor: pointer; font-size: 14px; font-family: Arial, sans-serif;
            }
            .btn-print:hover { background: #2a5298; }
            @media print { .no-print { display: none !important; } body { padding: 0; } }
        </style>
    </head>
    <body>
        <button class="btn-print no-print" onclick="window.print()">🖨️ Imprimir</button>
        
        <div class="header">
            <img src="${logoIema}" alt="IEMA" onerror="this.style.display='none'">
            <h1>IEMA Pleno: São Luís - Centro</h1>
            <p style="font-size: 10pt; margin: 5px 0 0;">Sistema de Atendimentos — Gestão Geral</p>
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
                <div class="assinatura-linha">Assinatura do Responsável / Gestão Geral</div>
            </div>
        </div>
        
        <div class="registro-info">
            Relatório gerado em <strong>${dataGeracao}</strong>
        </div>
        
        <div class="footer">
            <p>Documento gerado automaticamente pelo EducaPleno</p>
            <p>Setor: Gestão Geral — ${cfg.nomeAmigavel}</p>
        </div>
    </body>
    </html>`;
}

// ============================================
// 🎨 TEMPLATE COMUM DE RELATÓRIO
// ============================================
function montarHTMLRelatorio({ titulo, subtitulo, statsHTML, tabelaHTML, assinaturaDigital, logo, carimbo, dataGeracao, nomeSetor }) {
    return `<!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <title>${titulo}</title>
        <style>
            @page { size: A4 portrait; margin: 12mm; }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; line-height: 1.4; color: #000; }
            .header { text-align: center; border-bottom: 2px double #000; padding-bottom: 10px; margin-bottom: 15px; }
            .header img { max-width: 100%; max-height: 25mm; object-fit: contain; display: block; margin: 0 auto 5px; }
            .header h1 { font-size: 13pt; text-transform: uppercase; font-weight: bold; margin: 5px 0 0; }
            .titulo {
                text-align: center; font-size: 14pt; font-weight: bold;
                background: #dbeafe; padding: 10px; border: 2px solid #000;
                margin: 15px 0; text-transform: uppercase; letter-spacing: 1px;
            }
            .subtitulo { text-align: center; font-size: 12pt; margin: -10px 0 15px; font-style: italic; }
            .stats {
                display: flex; gap: 15px; margin: 15px 0 20px; padding: 15px;
                background: #eef2ff; border-radius: 8px; border: 1px solid #c7d2fe;
            }
            .stat { text-align: center; flex: 1; border-right: 1px solid #c7d2fe; }
            .stat:last-child { border-right: none; }
            .stat-value { font-size: 22pt; font-weight: bold; color: #1e3c72; line-height: 1; }
            .stat-label { font-size: 9pt; color: #666; margin-top: 5px; }
            .section-title {
                font-size: 11pt; font-weight: bold; background: #e8e8e8;
                padding: 6px 10px; border-left: 4px solid #1e3c72; margin: 20px 0 10px;
            }
            table { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin-bottom: 15px; }
            th { background: #1e3c72; color: white; padding: 8px 6px; text-align: left; border: 1px solid #152a52; font-size: 9pt; }
            td { padding: 6px; border: 1px solid #ddd; vertical-align: top; }
            tr:nth-child(even) { background: #f9fafb; }
            .assinaturas { display: flex; justify-content: center; margin-top: 50px; gap: 40px; }
            .assinatura { flex: 0 0 60%; text-align: center; }
            .assinatura-container-relatorio {
                position: relative; border-bottom: 1px solid #000; min-height: 22mm;
                display: flex; align-items: flex-end; justify-content: center; padding-bottom: 3px;
            }
            .assinatura-img { max-height: 18mm; max-width: 100%; object-fit: contain; position: relative; z-index: 1; }
            .carimbo-overlay {
                position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
                max-height: 20mm; max-width: 60%; object-fit: contain;
                opacity: 0.85; pointer-events: none; z-index: 2;
            }
            .assinatura-linha { border-top: none; padding-top: 5px; font-size: 10pt; margin-top: 4px; }
            .footer { text-align: center; margin-top: 30px; padding-top: 10px; border-top: 1px solid #ccc; font-size: 8pt; color: #666; }
            .footer p { margin: 2px 0; }
            .registro-info { font-size: 9pt; color: #666; margin-top: 20px; text-align: center; }
            .btn-print {
                display: block; margin: 20px auto; padding: 12px 30px;
                background: #1e3c72; color: white; border: none; border-radius: 8px;
                font-weight: bold; cursor: pointer; font-size: 14px; font-family: Arial, sans-serif;
            }
            .btn-print:hover { background: #2a5298; }
            @media print { .no-print { display: none !important; } body { padding: 0; } }
        </style>
    </head>
    <body>
        <button class="btn-print no-print" onclick="window.print()">🖨️ Imprimir</button>
        <div class="header">
            <img src="${logo}" alt="IEMA" onerror="this.style.display='none'">
            <h1>IEMA Pleno: São Luís - Centro</h1>
            <p style="font-size: 10pt; margin: 5px 0 0;">Sistema de Atendimentos — ${nomeSetor}</p>
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
    const container = safeGet(`${P}ResultadoRelatorio`);
    if (!container) return;

    if (tipo === 'geral') {
        container.innerHTML = `
            <div class="card"><div class="card-body">
                <h5><i class="fas fa-chart-bar"></i> Relatório Geral</h5>
                <p>Total: <strong>${data.totalRegistros || 0}</strong></p>
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
                        <thead><tr><th>Data</th><th>Motivo</th><th>Observações</th></tr></thead>
                        <tbody>${(data.registros || []).map(a => `
                            <tr>
                                <td>${a.dataFormatada}</td>
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
    
    if (!data) {
        notificar('⚠️ Nenhum relatório carregado.\n\nClique em BUSCAR primeiro.');
        return;
    }

    const registros = data.registros || data.autorizacoes || data.atendimentos || [];
    
    if (registros.length === 0) {
        notificar('⚠️ Nenhum registro para exportar.\n\nVerifique os filtros de data.');
        return;
    }

    const cfg = getCfg(modulo);
    let csv = "Data do Registro,Data de Cadastro,Aluno,Matrícula,Turma,Motivo,Observações,Responsável\n";

    registros.forEach(a => {
        // 🆕 Formatar data de cadastro
        let dataCadastro = '';
        if (a.createdAt) {
            try {
                dataCadastro = new Date(a.createdAt).toLocaleString('pt-BR');
            } catch (e) {
                dataCadastro = '';
            }
        }
        
        csv += [
            a.dataFormatada || '',
            `"${dataCadastro}"`,
            `"${(a.alunoNome || '').replace(/"/g, '""')}"`,
            `"${(a.alunoMatricula || '').replace(/"/g, '""')}"`,
            `"${(a.alunoTurma || data.turma || '').replace(/"/g, '""')}"`,
            `"${(a.motivoLabel || '').replace(/"/g, '""')}"`,
            `"${(a.observacoes || '').replace(/"/g, '""')}"`,
            `"${(a.responsavelNome || '').replace(/"/g, '""')}"`
        ].join(',') + '\n';
    });

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${cfg.tipo}-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
}

function aplicarFiltrosLista(modulo) {
    carregarListaModulo(modulo);
}

// ============================================
// EVENT LISTENERS DOS MÓDULOS
// ============================================
function configurarEventosModulo(modulo) {
    const P = getPrefixo(modulo);

    safeGet(`${modulo}-dashboard-tab`)?.addEventListener('shown.bs.tab', () => {
        carregarDashboardModulo(modulo);
    });

    safeGet(`${modulo}-relatorios-tab`)?.addEventListener('shown.bs.tab', () => {
        carregarTurmasFiltroModulo(modulo);
    });

    const selectTipo = safeGet(`${P}TipoRelatorio`);
    if (selectTipo && !selectTipo.dataset.listenerAttached) {
        selectTipo.dataset.listenerAttached = 'true';
        selectTipo.addEventListener('change', () => toggleRelatorioFiltrosModulo(modulo));
    }

    safeGet(`filtroLista${P}Aluno`)?.addEventListener('input', () => {
        clearTimeout(window[`_timeoutFiltro${P}`]);
        window[`_timeoutFiltro${P}`] = setTimeout(() => carregarListaModulo(modulo), 500);
    });
    safeGet(`filtroLista${P}Turma`)?.addEventListener('change', () => carregarListaModulo(modulo));
    safeGet(`filtroLista${P}Motivo`)?.addEventListener('change', () => carregarListaModulo(modulo));
    safeGet(`filtroLista${P}DataInicio`)?.addEventListener('change', () => carregarListaModulo(modulo));
    safeGet(`filtroLista${P}DataFim`)?.addEventListener('change', () => carregarListaModulo(modulo));
}

// ============================================
// IMPRESSÃO COM ASSINATURA (A4 PAISAGEM - METADE DA FOLHA)
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
            const qrD = await qrR.json();
            if (qrD.success && qrD.qrCode) qr = qrD.qrCode;
        } catch (e) { console.warn('Sem QR Code'); }
        
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
    const dataExt = new Date(a.data).toLocaleDateString('pt-BR', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
    
    let detalheMotivo = '';
    if (a.motivo === 'outros' && a.motivoOutros) {
        detalheMotivo = ` <strong>(Especificação: ${a.motivoOutros})</strong>`;
    }
    if (a.motivo === 'necessita_ausentar_retornar' && a.horarioAusencia && a.horarioRetorno) {
        detalheMotivo = ` <strong>(Ausência: ${a.horarioAusencia} | Retorno: ${a.horarioRetorno})</strong>`;
    }
    
    // 🔥 NOVO: Mostra horários de entrada/saída APENAS se preenchidos
    const mostrarHorariosEntradaSaida = cfg.tipo === 'autorizacao' && (a.horarioEntrada || a.horarioSaida);
    
    let horariosHTML = '';
    if (mostrarHorariosEntradaSaida) {
        horariosHTML = `
            <div class="info-row">
                ${a.horarioEntrada ? `
                    <div class="info-item">
                        <span class="label">Entrada:</span>
                        <span class="underline">${a.horarioEntrada}</span>
                    </div>` : ''}
                ${a.horarioSaida ? `
                    <div class="info-item">
                        <span class="label">Saída:</span>
                        <span class="underline">${a.horarioSaida}</span>
                    </div>` : ''}
            </div>`;
    }
    
    const assinaturaHTML = a.assinaturaBase64 
        ? `<div class="assinatura-digital"><img src="${a.assinaturaBase64}" alt="Assinatura"></div>`
        : '<div class="assinatura-vazia">_____________________________________</div>';
    
    const carimboGestaoHTML = `
        <div class="carimbo-gestao">
            <img src="${carimboGestao}" alt="Carimbo Gestão Geral">
        </div>`;
    
    return `<!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <title>${titulo} - ${a.alunoNome}</title>
        <style>
            @page { size: A4 portrait; margin: 15mm; }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            html, body {
                width: 210mm;
                min-height: 297mm;
                font-family: 'Times New Roman', Times, serif;
                background: #f0f0f0;
                display: flex;
                justify-content: center;
                align-items: flex-start;
            }
            .folha {
                width: 180mm;
                min-height: 267mm;
                padding: 10mm;
                background: white;
                margin: 0 auto;
                font-size: 10pt;
                line-height: 1.4;
                display: flex;
                flex-direction: column;
            }
            @media print {
                html, body { 
                    width: 210mm; 
                    height: 297mm; 
                    background: white;
                    display: block;
                }
                .folha { 
                    width: 100%; 
                    min-height: auto;
                    padding: 0;
                    margin: 0 auto;
                }
                .btn-print { display: none !important; }
            }
            .header { text-align: center; border-bottom: 2px double #000; padding-bottom: 8px; margin-bottom: 10px; }
            .header img { max-width: 100%; height: auto; max-height: 25mm; object-fit: contain; }
            .header h1 { font-size: 10pt; margin: 5px 0 0 0; text-transform: uppercase; font-weight: bold; }
            .titulo {
                text-align: center; font-size: 13pt; font-weight: bold; text-transform: uppercase;
                margin: 10px 0; background: #e8e8e8; padding: 8px; border: 1.5px solid #000; letter-spacing: 1px;
            }
            .info-section { border: 1px solid #000; padding: 10px 12px; margin-bottom: 10px; }
            .info-row { display: flex; margin-bottom: 6px; gap: 15px; align-items: baseline; }
            .info-row:last-child { margin-bottom: 0; }
            .info-item { flex: 1; display: flex; align-items: baseline; gap: 6px; min-width: 0; }
            .label { font-weight: bold; font-size: 9pt; white-space: nowrap; }
            .underline {
                border-bottom: 1px dotted #000; flex: 1; height: 18px; min-height: 18px;
                font-size: 10pt; padding: 0 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            }
            .motivo-box { background: #f5f5f5; border: 1px solid #000; padding: 10px 12px; margin: 10px 0; }
            .motivo-box h3 { margin: 0 0 5px 0; font-size: 10pt; text-transform: uppercase; }
            .motivo-box p { margin: 0; font-size: 10pt; font-weight: bold; }
            .responsavel-box { background: #eef3fb; border: 1px solid #000; padding: 10px 12px; margin: 10px 0; font-size: 9.5pt; }
            .responsavel-box h3 { margin: 0 0 5px 0; font-size: 10pt; text-transform: uppercase; }
            .responsavel-box p { margin: 3px 0; font-size: 9.5pt; }
            .observacoes { border: 1px solid #000; padding: 10px 12px; min-height: 25mm; margin: 10px 0; font-size: 9.5pt; }
            .observacoes strong { display: block; margin-bottom: 5px; font-size: 10pt; }
            .assinaturas { display: flex; justify-content: space-around; margin-top: 15mm; gap: 15mm; }
            .assinatura { text-align: center; flex: 1; font-size: 9pt; position: relative; }
            .assinatura-digital { 
                border-bottom: 1px solid #000;
                min-height: 18mm;
                display: flex;
                align-items: flex-end;
                justify-content: center;
                padding-bottom: 3px;
            }
            .assinatura-digital img {
                max-height: 16mm;
                max-width: 100%;
                object-fit: contain;
            }
            .assinatura-vazia {
                border-bottom: 1px solid #000;
                min-height: 18mm;
                display: flex;
                align-items: flex-end;
                justify-content: center;
                color: #999;
                font-size: 9pt;
                padding-bottom: 3px;
            }
            .assinatura-linha {
                padding-top: 5px;
                font-size: 9pt;
            }
            .carimbo-gestao {
                border-bottom: 1px solid #000;
                min-height: 18mm;
                display: flex;
                align-items: flex-end;
                justify-content: center;
                padding-bottom: 3px;
            }
            .carimbo-gestao img {
                max-height: 16mm;
                max-width: 100%;
                object-fit: contain;
                opacity: 0.9;
            }
            .qr-code { text-align: center; margin-top: 8px; }
            .qr-code img { width: 22mm; height: 22mm; border: 1px solid #000; padding: 1px; }
            .qr-code p { font-size: 8pt; margin: 3px 0 0 0; }
            .footer {
                text-align: center; margin-top: auto; padding-top: 8px;
                border-top: 1px solid #000; font-size: 8pt; color: #444;
            }
            .footer p { margin: 2px 0; }
            .btn-print {
                display: block; margin: 15px auto; padding: 10px 30px;
                background: #4f46e5; color: white; border: none; border-radius: 8px;
                font-weight: bold; cursor: pointer; font-size: 14px; font-family: Arial, sans-serif;
            }
            .btn-print:hover { background: #4338ca; }
        </style>
    </head>
    <body>
        <button class="btn-print no-print" onclick="window.print()">🖨️ Imprimir</button>
        <div class="folha">
            <div class="header">
                <img src="${logo}" alt="IEMA" onerror="this.style.display='none'">
                <h1>IEMA PLENO: SÃO LUÍS - CENTRO</h1>
            </div>
            <div class="titulo">📋 ${titulo}</div>
            <div class="info-section">
                <div class="info-row">
                    <div class="info-item">
                        <span class="label">Estudante:</span>
                        <span class="underline">${a.alunoNome || ''}</span>
                    </div>
                </div>
                <div class="info-row">
                    <div class="info-item">
                        <span class="label">Matrícula:</span>
                        <span class="underline">${a.alunoMatricula || ''}</span>
                    </div>
                    <div class="info-item">
                        <span class="label">Turma:</span>
                        <span class="underline">${a.alunoTurma || ''}</span>
                    </div>
                </div>
                <div class="info-row">
                    <div class="info-item">
                        <span class="label">Curso:</span>
                        <span class="underline">${a.alunoCurso || ''}</span>
                    </div>
                </div>
                <div class="info-row">
                    <div class="info-item">
                        <span class="label">Data:</span>
                        <span class="underline">${dataExt}</span>
                    </div>
                </div>
                ${horariosHTML}
            </div>
            <div class="motivo-box">
                <h3>📌 Motivo:</h3>
                <p>☑ ${a.motivoLabel}${detalheMotivo}</p>
            </div>
            ${(a.responsavelNome || a.responsavelCPF || a.responsavelTelefone) ? `
                <div class="responsavel-box">
                    <h3>👤 Responsável:</h3>
                    ${a.responsavelNome ? `<p><strong>Nome:</strong> ${a.responsavelNome}</p>` : ''}
                    ${a.responsavelCPF ? `<p><strong>CPF:</strong> ${a.responsavelCPF}</p>` : ''}
                    ${a.responsavelTelefone ? `<p><strong>Telefone:</strong> ${a.responsavelTelefone}</p>` : ''}
                </div>` : ''}
            <div class="observacoes">;
                <strong>📝 Observações:</strong>
                ${a.observacoes || '___________________________________________________________________'}
            </div>
            <div class="assinaturas">
                <div class="assinatura">
                    ${assinaturaHTML}
                    <div class="assinatura-linha">Assinatura do Responsável</div>
                </div>
                <div class="assinatura">
                    ${carimboGestaoHTML}
                    <div class="assinatura-linha">Coordenação / Gestão Geral</div>
                </div>
            </div>
            ${qrCodeUrl ? `
                <div class="qr-code">
                    <img src="${qrCodeUrl}" alt="QR Code">
                    <p>Identificação do Aluno</p>
                </div>` : ''}
            <div class="footer">
                <p>Gerado em ${new Date().toLocaleString('pt-BR')} por ${a.registradoPorNome || 'Gestão Geral'}</p>
                <p>EducaPleno</p>
            </div>
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
            carregarListaModulo(modulo);
        } else {
            notificar('❌ ' + (d.error || 'Erro'), 'error');
        }
    } catch (e) {
        console.error(e);
        notificar('Erro ao excluir', 'error');
    }
}

// ============================================
// 🔔 TOAST NATIVO (substitui alert() e mostrarToastConcluido)
// ============================================
function notificar(mensagem, tipo = 'success', duracao = 3500) {
    // Se já existe um toast do sistema, usa ele
    if (typeof window.mostrarToastConcluido === 'function') {
        window.mostrarToastConcluido(mensagem, tipo);
        return;
    }

    // Fallback: toast nativo (não trava no Kodular)
    let container = document.getElementById('__toastContainerGG');
    if (!container) {
        container = document.createElement('div');
        container.id = '__toastContainerGG';
        container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 999999;
            display: flex;
            flex-direction: column;
            gap: 10px;
            pointer-events: none;
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
        background: ${c.bg};
        color: white;
        padding: 14px 20px;
        border-radius: 10px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 14px;
        max-width: 380px;
        display: flex;
        align-items: center;
        gap: 10px;
        pointer-events: auto;
        opacity: 0;
        transform: translateX(100%);
        transition: all 0.3s ease;
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

function registrarAutorizacao() { registrarModulo('autorizacao'); }
function registrarJustificativa() { registrarModulo('justificativa'); }
function registrarSegundaChamada() { registrarModulo('segundaChamada'); }

function limparTelaAutorizacao() { limparTelaModulo('autorizacao'); }
function limparTelaJustificativa() { limparTelaModulo('justificativa'); }
function limparTelaSegundaChamada() { limparTelaModulo('segundaChamada'); }

function carregarAutorizacoes() { carregarListaModulo('autorizacao'); }
function carregarJustificativas() { carregarListaModulo('justificativa'); }
function carregarSegundaChamada() { carregarListaModulo('segundaChamada'); }

function imprimirAutorizacao(id) { imprimirModulo('autorizacao', id); }
function imprimirJustificativa(id) { imprimirModulo('justificativa', id); }
function imprimirSegundaChamada(id) { imprimirModulo('segundaChamada', id); }

function excluirAutorizacao(id) { excluirModulo('autorizacao', id); }
function excluirJustificativa(id) { excluirModulo('justificativa', id); }
function excluirSegundaChamada(id) { excluirModulo('segundaChamada', id); }

// ============================================
// 🔔 SISTEMA DE NOTIFICAÇÕES UNIFICADO
// (Notificações do sistema + Lembretes de remarcação)
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
    try {
        const token = localStorage.getItem('auth_token');
        if (!token) return;
        
        const response = await fetch('/api/gestao-geral/remarcacoes/pendentes', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const contentType = response.headers.get('content-type') || '';
        if (!response.ok || !contentType.includes('application/json')) {
            __lembretesCache = [];
            return;
        }
        const data = await response.json();
        if (data.success && Array.isArray(data.remarcacoes)) {
            __lembretesCache = data.remarcacoes;
        } else {
            __lembretesCache = [];
        }
    } catch (error) {
        __lembretesCache = [];
    }
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
    
    // SEÇÃO 1: LEMBRETES DE REMARCAÇÃO
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
    
    // SEÇÃO 2: NOTIFICAÇÕES DO SISTEMA
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

// Iniciar quando o DOM carregar
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => iniciarSistemaNotificacoesUnificado(), 500);
});

window.addEventListener('beforeunload', () => {
    if (notificacoesInterval) clearInterval(notificacoesInterval);
});

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
window.registrarAutorizacao = registrarAutorizacao;
window.registrarJustificativa = registrarJustificativa;
window.registrarSegundaChamada = registrarSegundaChamada;
window.limparTelaAutorizacao = limparTelaAutorizacao;
window.limparTelaJustificativa = limparTelaJustificativa;
window.limparTelaSegundaChamada = limparTelaSegundaChamada;
window.carregarAutorizacoes = carregarAutorizacoes;
window.carregarJustificativas = carregarJustificativas;
window.carregarSegundaChamada = carregarSegundaChamada;
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
// Assinatura
window.limparAssinatura = limparAssinatura;
window.inicializarAssinatura = inicializarAssinatura;
window.obterAssinaturaBase64 = obterAssinaturaBase64;

// Expõe globalmente
window.notificar = notificar;

// ============================================
// EXPORTAR GLOBAIS
// ============================================
window.abrirNotificacoes = abrirNotificacoes;
window.abrirNotificacao = abrirNotificacao;
window.marcarTodasLidas = marcarTodasLidas;
window.limparMinhasNotificacoes = limparMinhasNotificacoes;
window.fecharNotificacoes = fecharNotificacoes;
window.mostrarNotificacaoInterna = mostrarNotificacaoInterna;
window.confirmarInternoNotif = confirmarInternoNotif;

window.exportarPDFAtrasos = exportarPDFAtrasos;
window.exportarPDFModulo = exportarPDFModulo;