// ============================================
// ASSISTENTE SOCIAL - SISTEMA DE ATENDIMENTOS
// Com Filtros, Remarcação, Assinatura, Sino, Notificações
// + 🆕 ASSINATURA VIA QR CODE (SESSÃO)
// ============================================

let token = localStorage.getItem('auth_token');
let currentAluno = null;
let currentAtendimento = null;
let relatorioData = null;
let dashboardCharts = {};
let tipoTarefaSelecionado = null;

let scannerAuto = null;
let scannerAutoAtivo = false;

let modoAtual = 'automatico';
let turmasDisponiveis = [];
let alunosPorTurma = [];

let __alunosParaRelatorio = [];
let __alunosFiltrados = [];
let __indiceSelecionado = -1;
let __alunosCarregados = false;

let __lembretesAtuais = [];

let __atendimentosAtivosBrutos = [];
let __atendimentosAtivosFiltrados = [];

let __concluidosPaginaAtual = 1;
let __concluidosPorPagina = 10;
let __concluidosTotal = 0;
let __concluidosDados = [];

// ============================================
// 🆕 ESTADO DA SESSÃO DE ASSINATURA VIA QR CODE
// ============================================
const estadoSessaoAssinatura = {
    assistenteSocial: {
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
// ESTADO DA ASSINATURA DIGITAL (CANVAS TRADICIONAL)
// ============================================
const assinaturaState = {
    canvas: null, ctx: null, desenhando: false, temAssinatura: false,
    lastX: 0, lastY: 0, larguraBase: 0, alturaBase: 0
};

const TIPO_LABELS = {
    'evasao_escolar': 'Evasão Escolar',
    'desinteresse_aprendizado': 'Desinteresse pelo Aprendizado',
    'problemas_disciplina': 'Problemas com Disciplina',
    'insubordinacao_limites': 'Insubordinação a Limites/Regras',
    'vulnerabilidade_drogas': 'Vulnerabilidade às Drogas',
    'atitudes_agressivas': 'Atitudes Agressivas/Violentas',
    'baixo_rendimento': 'Baixo Rendimento Escolar',
    'encaminhamento': 'Encaminhamento',
    'intervencao': 'Intervenção',
    'atendimento': 'Atendimento',
    'outros': 'Outros'
};

// ============================================
// UTILITÁRIOS
// ============================================
function safeGet(id) { return document.getElementById(id); }
function safeSetText(id, value) { const el = safeGet(id); if (el) el.textContent = value; }
function safeSetHTML(id, value) { const el = safeGet(id); if (el) el.innerHTML = value; }

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
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#8b5cf6"/><stop offset="100%" stop-color="#7c3aed"/></linearGradient></defs><circle cx="50" cy="50" r="50" fill="url(#g)"/><text x="50" y="50" font-family="Arial,sans-serif" font-size="45" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="central">${inicial}</text></svg>`;
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
}

function formatarDataBR(dataStr) {
    if (!dataStr) return '-';
    const d = new Date(dataStr + 'T00:00:00');
    return d.toLocaleDateString('pt-BR');
}

// ============================================
// 🔔 NOTIFICAÇÕES DO NAVEGADOR
// ============================================
async function solicitarPermissaoNotificacao() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    try {
        const permission = await Notification.requestPermission();
        atualizarStatusNotificacao();
        return permission === 'granted';
    } catch (e) { return false; }
}

function atualizarStatusNotificacao() {
    const el = safeGet('sinoNotifStatus');
    if (!el) return;
    if (!('Notification' in window)) {
        el.className = 'sino-notif-status inativo';
        el.innerHTML = '<i class="fas fa-bell-slash"></i> Não suportado';
        return;
    }
    if (Notification.permission === 'granted') {
        el.className = 'sino-notif-status ativo';
        el.innerHTML = '<i class="fas fa-bell"></i> Notificações ativas';
    } else if (Notification.permission === 'denied') {
        el.className = 'sino-notif-status inativo';
        el.innerHTML = '<i class="fas fa-bell-slash"></i> Notificações bloqueadas';
    } else {
        el.className = 'sino-notif-status inativo';
        el.innerHTML = '<i class="fas fa-bell-slash"></i> Notificações desativadas';
    }
}

function jaNotificou(id, tipo) { return localStorage.getItem(`notif_${tipo}_${id}`) === 'true'; }
function marcarComoNotificado(id, tipo) { localStorage.setItem(`notif_${tipo}_${id}`, 'true'); }

function limparNotificacoesAntigas() {
    if (!__lembretesAtuais) return;
    const idsAtivos = new Set();
    __lembretesAtuais.forEach(r => idsAtivos.add(r.id));
    Object.keys(localStorage).forEach(k => {
        if (k.startsWith('notif_')) {
            const idRem = k.split('_').pop();
            if (!idsAtivos.has(idRem)) localStorage.removeItem(k);
        }
    });
}

function calcularNivelAlerta(r) {
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

function enviarNotificacao(titulo, corpo, urgente = false, onClick = null) {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    try {
        const notif = new Notification(titulo, {
            body: corpo, icon: '/icons/favicon.ico', badge: '/icons/favicon.ico',
            tag: urgente ? 'assistente-urgente' : 'assistente-lembrete',
            requireInteraction: urgente, vibrate: urgente ? [200, 100, 200] : [100]
        });
        if (onClick) notif.onclick = () => { window.focus(); onClick(); notif.close(); };
        if (!urgente) setTimeout(() => { try { notif.close(); } catch(e) {} }, 8000);
    } catch (e) {}
}

async function verificarLembretesNotificar() {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    if (!__lembretesAtuais || __lembretesAtuais.length === 0) return;
    
    const agora = new Date();
    __lembretesAtuais.forEach(r => {
        const horario = r.horarioRemarcacao || '00:00';
        const dataRem = new Date(r.dataRemarcacao + 'T' + horario + ':00');
        const diffMin = Math.floor((dataRem - agora) / 60000);
        
        if (diffMin < 0 && !jaNotificou(r.id, 'atrasado')) {
            enviarNotificacao('⚠️ Atendimento ATRASADO',
                `${r.alunoNome} - ${r.tipoTarefaLabel}\nEra ${formatarDataBR(r.dataRemarcacao)} às ${r.horarioRemarcacao}`,
                true, () => abrirNotificacoes());
            marcarComoNotificado(r.id, 'atrasado');
            return;
        }
        if (diffMin > 0 && diffMin <= 30 && !jaNotificou(r.id, 'iminente')) {
            enviarNotificacao('🔔 Atendimento em 30 min!',
                `${r.alunoNome} - ${r.tipoTarefaLabel}\n${r.horarioRemarcacao} • ${r.alunoTurma}`,
                true, () => abrirNotificacoes());
            marcarComoNotificado(r.id, 'iminente');
            return;
        }
        if (diffMin > 30 && diffMin <= 120 && !jaNotificou(r.id, 'proximo')) {
            enviarNotificacao('⏰ Atendimento próximo',
                `${r.alunoNome} - ${r.tipoTarefaLabel}\nEm ${Math.floor(diffMin / 60)}h ${diffMin % 60}min`,
                false, () => abrirNotificacoes());
            marcarComoNotificado(r.id, 'proximo');
            return;
        }
        if (diffMin > 120 && diffMin <= 720 && !jaNotificou(r.id, 'hoje')) {
            enviarNotificacao('📅 Atendimento HOJE',
                `${r.alunoNome} - ${r.tipoTarefaLabel}\nHoje às ${r.horarioRemarcacao}`,
                false, () => abrirNotificacoes());
            marcarComoNotificado(r.id, 'hoje');
            return;
        }
        if (diffMin > 720 && diffMin <= 1440 && !jaNotificou(r.id, 'amanha')) {
            enviarNotificacao('📅 Atendimento AMANHÃ',
                `${r.alunoNome} - ${r.tipoTarefaLabel}\nAmanhã às ${r.horarioRemarcacao}`,
                false, () => abrirNotificacoes());
            marcarComoNotificado(r.id, 'amanha');
        }
    });
}

function atualizarBadgeComUrgencia() {
    const badge = safeGet('notificacoesBadge');
    const btn = safeGet('notificacoesBtn');
    if (!badge || !btn || !__lembretesAtuais || __lembretesAtuais.length === 0) return;
    const temUrgente = __lembretesAtuais.some(r => calcularNivelAlerta(r).urgente);
    if (temUrgente) {
        btn.classList.add('tem-novidade');
        badge.style.background = '#dc2626';
    } else {
        btn.classList.remove('tem-novidade');
        badge.style.background = '#ef4444';
    }
}

// ============================================
// INICIALIZAÇÃO
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    if (!token) { window.location.href = '/login.html'; return; }
    
    // 🆕 VERIFICA SE ESTÁ EM MODO ASSINATURA (?assinatura=UUID)
    const modoAssinatura = new URLSearchParams(window.location.search).get('assinatura');
    if (modoAssinatura) {
        console.log('📱 Modo assinatura detectado:', modoAssinatura);
        await mostrarTelaAssinatura(modoAssinatura);
        return;
    }
    
    const userData = JSON.parse(localStorage.getItem('user_data') || '{}');
    const allowedRoles = ['assistente-social', 'super_admin', 'admin'];
    if (!allowedRoles.includes(userData.role)) {
        mostrarToastConcluido('Acesso negado.', 'error');
        window.location.href = '/login.html';
        return;
    }
    
    safeSetText('userName', userData.nome || 'Usuário');
    safeSetText('dataAtual', new Date().toLocaleDateString('pt-BR'));
    atualizarStatusNotificacao();
    
    try {
        await Promise.allSettled([
            carregarFotoPerfil(),
            carregarAtendimentosAtivos(),
            carregarTurmasParaRelatorio(),
            carregarTurmasParaManual(),
            carregarDashboard(),
            carregarLembretes()
        ]);
    } catch (error) { console.error('Erro:', error); }
    
    await iniciarScannerAutomatico();
    setTimeout(() => inicializarAssinatura(), 800);
    configurarFiltrosAndamento();
    configurarFiltrosConcluidos();
    
    setTimeout(async () => {
        const permitido = await solicitarPermissaoNotificacao();
        if (permitido) setTimeout(() => verificarLembretesNotificar(), 2000);
    }, 3000);
    
    setInterval(() => {
        if (safeGet('ativos')?.classList.contains('active')) carregarAtendimentosAtivos();
        if (safeGet('dashboard')?.classList.contains('active')) carregarDashboard();
        carregarLembretes();
    }, 30000);
    
    setInterval(() => {
        if (__lembretesAtuais && __lembretesAtuais.length > 0) {
            atualizarBadgeComUrgencia();
            verificarLembretesNotificar();
        }
    }, 60000);
    
    safeGet('dashboard-tab')?.addEventListener('shown.bs.tab', () => {
        carregarDashboard();
        carregarAtendimentosConcluidos(1);
    });
    safeGet('relatorios-tab')?.addEventListener('shown.bs.tab', () => carregarTurmasParaRelatorio());
    safeGet('ativos-tab')?.addEventListener('shown.bs.tab', () => carregarAtendimentosAtivos());
    
    safeGet('modoAutomaticoBtn')?.addEventListener('click', () => setModo('automatico'));
    safeGet('modoManualBtn')?.addEventListener('click', () => setModo('manual'));
    
    safeGet('filtroTurmaManual')?.addEventListener('change', () => carregarAlunosPorTurma());
    safeGet('filtroBuscaManual')?.addEventListener('input', () => filtrarAlunosManual());
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (currentAluno) {
                limparTela();
                if (modoAtual === 'automatico') reiniciarScannerAutomatico();
            }
        }
    });
});

window.addEventListener('beforeunload', () => {
    pararScannerAutomatico();
    pararMonitoramentoSessao('assistenteSocial');
});

async function carregarFotoPerfil() {
    try {
        const response = await fetch('/api/perfil/me', { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await response.json();
        if (data.success && data.perfil?.fotoPerfil) {
            const avatar = safeGet('userAvatar');
            if (avatar) avatar.innerHTML = `<img src="${data.perfil.fotoPerfil}" alt="Foto">`;
        }
    } catch (error) { console.error('Erro:', error); }
}

// ============================================
// 🎯 FILTROS DA ABA EM ANDAMENTO
// ============================================
function configurarFiltrosAndamento() {
    const ids = ['filtroAndamentoBusca', 'filtroAndamentoTurma', 'filtroAndamentoTipo',
                 'filtroAndamentoOrdenar', 'filtroAndamentoPrioridade', 'filtroAndamentoGravidade',
                 'filtroAndamentoRemarcado', 'filtroAndamentoAssinatura'];
    ids.forEach(id => {
        const el = safeGet(id);
        if (!el) return;
        if (el.tagName === 'INPUT') {
            let t;
            el.addEventListener('input', () => { clearTimeout(t); t = setTimeout(aplicarFiltrosAndamento, 250); });
        } else {
            el.addEventListener('change', aplicarFiltrosAndamento);
        }
    });
}

function toggleFiltrosAvancados() {
    const div = safeGet('filtrosAvancados');
    const btn = safeGet('btnToggleAvancado');
    if (!div || !btn) return;
    const aberto = div.style.display !== 'none';
    if (aberto) {
        div.style.display = 'none';
        btn.innerHTML = '<i class="fas fa-chevron-down"></i> Mais filtros';
    } else {
        div.style.display = 'block';
        btn.innerHTML = '<i class="fas fa-chevron-up"></i> Menos filtros';
    }
}

function obterFiltrosAndamento() {
    return {
        busca: (safeGet('filtroAndamentoBusca')?.value || '').trim().toLowerCase(),
        turma: safeGet('filtroAndamentoTurma')?.value || '',
        tipo: safeGet('filtroAndamentoTipo')?.value || '',
        ordenar: safeGet('filtroAndamentoOrdenar')?.value || 'recente',
        prioridade: safeGet('filtroAndamentoPrioridade')?.value || '',
        gravidade: safeGet('filtroAndamentoGravidade')?.value || '',
        remarcado: safeGet('filtroAndamentoRemarcado')?.value || '',
        assinatura: safeGet('filtroAndamentoAssinatura')?.value || ''
    };
}

function filtrosEstaoAtivos() {
    const f = obterFiltrosAndamento();
    return f.busca || f.turma || f.tipo || f.prioridade || f.gravidade || f.remarcado || f.assinatura;
}

function aplicarFiltrosAndamento() {
    const f = obterFiltrosAndamento();
    let filtrados = [...__atendimentosAtivosBrutos];
    
    if (f.busca) {
        filtrados = filtrados.filter(a =>
            (a.alunoNome || '').toLowerCase().includes(f.busca) ||
            (a.alunoMatricula || '').toLowerCase().includes(f.busca)
        );
    }
    if (f.turma) filtrados = filtrados.filter(a => a.alunoTurma === f.turma);
    if (f.tipo) filtrados = filtrados.filter(a => a.tipoTarefa === f.tipo);
    if (f.prioridade) filtrados = filtrados.filter(a => a.prioridade === f.prioridade);
    if (f.gravidade) filtrados = filtrados.filter(a => a.gravidade === f.gravidade);
    if (f.remarcado === 'sim') filtrados = filtrados.filter(a => a.temRemarcacaoPendente);
    else if (f.remarcado === 'nao') filtrados = filtrados.filter(a => !a.temRemarcacaoPendente);
    if (f.assinatura === 'sim') filtrados = filtrados.filter(a => a.temAssinatura);
    else if (f.assinatura === 'nao') filtrados = filtrados.filter(a => !a.temAssinatura);
    
    const prioridadeOrdem = { urgente: 4, alta: 3, normal: 2, baixa: 1 };
    const gravidadeOrdem = { critica: 4, alta: 3, media: 2, baixa: 1 };
    
    filtrados.sort((a, b) => {
        switch (f.ordenar) {
            case 'antigo': return new Date(a.dataHoraEntrada) - new Date(b.dataHoraEntrada);
            case 'prioridade': return (prioridadeOrdem[b.prioridade] || 0) - (prioridadeOrdem[a.prioridade] || 0);
            case 'gravidade': return (gravidadeOrdem[b.gravidade] || 0) - (gravidadeOrdem[a.gravidade] || 0);
            case 'nome': return (a.alunoNome || '').localeCompare(b.alunoNome || '');
            default: return new Date(b.dataHoraEntrada) - new Date(a.dataHoraEntrada);
        }
    });
    
    __atendimentosAtivosFiltrados = filtrados;
    atualizarContadorResultados(filtrados.length, __atendimentosAtivosBrutos.length);
    atualizarChipsFiltrosAtivos();
    renderizarListaAtendimentosAtivos(filtrados);
    atualizarBotaoLimparFiltros();
}

function atualizarContadorResultados(total, totalBruto) {
    const el = safeGet('contadorResultados');
    if (!el) return;
    if (filtrosEstaoAtivos()) el.textContent = `${total} de ${totalBruto}`;
    else el.textContent = `${totalBruto}`;
    el.className = 'contador-resultados' + (total === 0 ? ' zero' : '');
}

function atualizarBotaoLimparFiltros() {
    const btn = safeGet('btnLimparFiltros');
    if (btn) btn.disabled = !filtrosEstaoAtivos();
}

function atualizarChipsFiltrosAtivos() {
    const container = safeGet('chipsFiltrosAtivos');
    if (!container) return;
    
    const f = obterFiltrosAndamento();
    const chips = [];
    
    if (f.busca) chips.push(`<span class="chip-filtro"><i class="fas fa-search"></i> "${escapeHTML(f.busca)}" <i class="fas fa-times" onclick="limparFiltroIndividual('busca')"></i></span>`);
    if (f.turma) chips.push(`<span class="chip-filtro"><i class="fas fa-graduation-cap"></i> ${escapeHTML(f.turma)} <i class="fas fa-times" onclick="limparFiltroIndividual('turma')"></i></span>`);
    if (f.tipo) chips.push(`<span class="chip-filtro"><i class="fas fa-clipboard-list"></i> ${escapeHTML(TIPO_LABELS[f.tipo] || f.tipo)} <i class="fas fa-times" onclick="limparFiltroIndividual('tipo')"></i></span>`);
    if (f.prioridade) chips.push(`<span class="chip-filtro"><i class="fas fa-bolt"></i> ${escapeHTML(f.prioridade)} <i class="fas fa-times" onclick="limparFiltroIndividual('prioridade')"></i></span>`);
    if (f.gravidade) chips.push(`<span class="chip-filtro"><i class="fas fa-exclamation-triangle"></i> ${escapeHTML(f.gravidade)} <i class="fas fa-times" onclick="limparFiltroIndividual('gravidade')"></i></span>`);
    if (f.remarcado === 'sim') chips.push(`<span class="chip-filtro"><i class="fas fa-calendar-plus"></i> Remarcados <i class="fas fa-times" onclick="limparFiltroIndividual('remarcado')"></i></span>`);
    if (f.remarcado === 'nao') chips.push(`<span class="chip-filtro"><i class="fas fa-calendar-times"></i> Sem remarcação <i class="fas fa-times" onclick="limparFiltroIndividual('remarcado')"></i></span>`);
    if (f.assinatura === 'sim') chips.push(`<span class="chip-filtro"><i class="fas fa-signature"></i> Com assinatura <i class="fas fa-times" onclick="limparFiltroIndividual('assinatura')"></i></span>`);
    if (f.assinatura === 'nao') chips.push(`<span class="chip-filtro"><i class="fas fa-signature"></i> Sem assinatura <i class="fas fa-times" onclick="limparFiltroIndividual('assinatura')"></i></span>`);
    
    container.innerHTML = chips.join('');
}

function limparFiltroIndividual(campo) {
    const mapa = {
        busca: 'filtroAndamentoBusca', turma: 'filtroAndamentoTurma', tipo: 'filtroAndamentoTipo',
        prioridade: 'filtroAndamentoPrioridade', gravidade: 'filtroAndamentoGravidade',
        remarcado: 'filtroAndamentoRemarcado', assinatura: 'filtroAndamentoAssinatura'
    };
    const el = safeGet(mapa[campo]);
    if (el) el.value = '';
    aplicarFiltrosAndamento();
}

function limparFiltrosAndamento() {
    ['filtroAndamentoBusca', 'filtroAndamentoTurma', 'filtroAndamentoTipo',
     'filtroAndamentoOrdenar', 'filtroAndamentoPrioridade', 'filtroAndamentoGravidade',
     'filtroAndamentoRemarcado', 'filtroAndamentoAssinatura'].forEach(id => {
        const el = safeGet(id);
        if (el) el.value = id === 'filtroAndamentoOrdenar' ? 'recente' : '';
    });
    aplicarFiltrosAndamento();
}

function popularFiltroTurmasAndamento() {
    const select = safeGet('filtroAndamentoTurma');
    if (!select) return;
    const valorAtual = select.value;
    const turmas = [...new Set(__atendimentosAtivosBrutos.map(a => a.alunoTurma).filter(Boolean))].sort();
    select.innerHTML = '<option value="">Todas as turmas</option>';
    turmas.forEach(t => {
        select.innerHTML += `<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`;
    });
    if (valorAtual && turmas.includes(valorAtual)) select.value = valorAtual;
}

// ============================================
// 🗑️ FILTROS DOS CONCLUÍDOS
// ============================================
function configurarFiltrosConcluidos() {
    ['filtroConcluidosBusca', 'filtroConcluidosTipo', 'filtroConcluidosResultado'].forEach(id => {
        const el = safeGet(id);
        if (!el) return;
        if (el.tagName === 'INPUT') {
            let t;
            el.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => carregarAtendimentosConcluidos(1), 300); });
        } else {
            el.addEventListener('change', () => carregarAtendimentosConcluidos(1));
        }
    });
}

function limparFiltrosConcluidos() {
    const busca = safeGet('filtroConcluidosBusca');
    const tipo = safeGet('filtroConcluidosTipo');
    const resultado = safeGet('filtroConcluidosResultado');
    if (busca) busca.value = '';
    if (tipo) tipo.value = '';
    if (resultado) resultado.value = '';
    carregarAtendimentosConcluidos(1);
}

// ============================================
// LEMBRETES / REMARCAÇÕES
// ============================================
async function carregarLembretes() {
    try {
        const response = await fetch('/api/assistente-social/remarcacoes/pendentes', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const contentType = response.headers.get('content-type') || '';
        if (!response.ok || !contentType.includes('application/json')) {
            __lembretesAtuais = [];
            return;
        }
        
        const data = await response.json();
        
        if (data.success && Array.isArray(data.remarcacoes)) {
            __lembretesAtuais = data.remarcacoes;
            verificarLembretesNotificar();
            atualizarBadgeComUrgencia();
            limparNotificacoesAntigas();
        } else {
            __lembretesAtuais = [];
        }
    } catch (error) {
        __lembretesAtuais = [];
    }
}

// ============================================
// ASSINATURA DIGITAL (CANVAS TRADICIONAL)
// ============================================
function inicializarAssinatura() {
    const canvas = safeGet('assinaturaCanvas');
    if (!canvas || canvas.dataset.assinaturaInit === 'true') return;
    canvas.dataset.assinaturaInit = 'true';
    
    const state = assinaturaState;
    const container = canvas.parentElement;
    const placeholder = safeGet('assinaturaPlaceholder');
    
    function ajustarCanvas() {
        const rect = canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) { setTimeout(ajustarCanvas, 300); return; }
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
        const ctx = canvas.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.strokeStyle = '#7c3aed';
        state.ctx = ctx;
    }
    ajustarCanvas();
    window.addEventListener('resize', () => { if (!state.temAssinatura) ajustarCanvas(); });
    state.canvas = canvas;
    
    function getPos(e) {
        const rect = canvas.getBoundingClientRect();
        let cx, cy;
        if (e.touches && e.touches.length > 0) { cx = e.touches[0].clientX; cy = e.touches[0].clientY; }
        else if (e.changedTouches && e.changedTouches.length > 0) { cx = e.changedTouches[0].clientX; cy = e.changedTouches[0].clientY; }
        else { cx = e.clientX; cy = e.clientY; }
        return { x: cx - rect.left, y: cy - rect.top };
    }
    function iniciar(e) {
        e.preventDefault();
        state.desenhando = true;
        const p = getPos(e);
        state.lastX = p.x; state.lastY = p.y;
        state.temAssinatura = true;
        container.classList.add('ativa');
        if (placeholder) placeholder.classList.add('escondido');
    }
    function desenhar(e) {
        if (!state.desenhando) return;
        e.preventDefault();
        const p = getPos(e);
        state.ctx.beginPath();
        state.ctx.moveTo(state.lastX, state.lastY);
        state.ctx.lineTo(p.x, p.y);
        state.ctx.stroke();
        state.lastX = p.x; state.lastY = p.y;
    }
    function parar(e) {
        if (e && e.preventDefault) e.preventDefault();
        state.desenhando = false;
        container.classList.remove('ativa');
        salvarAssinaturaBase64();
    }
    canvas.addEventListener('touchstart', iniciar, { passive: false });
    canvas.addEventListener('touchmove', desenhar, { passive: false });
    canvas.addEventListener('touchend', parar, { passive: false });
    canvas.addEventListener('touchcancel', parar, { passive: false });
    canvas.addEventListener('mousedown', iniciar);
    canvas.addEventListener('mousemove', desenhar);
    canvas.addEventListener('mouseup', parar);
    canvas.addEventListener('mouseleave', () => { if (state.desenhando) parar(); });
}

function limparAssinatura() {
    const state = assinaturaState;
    if (!state.canvas || !state.ctx) return;
    const rect = state.canvas.getBoundingClientRect();
    state.ctx.clearRect(0, 0, rect.width, rect.height);
    state.temAssinatura = false;
    const ph = safeGet('assinaturaPlaceholder');
    if (ph) ph.classList.remove('escondido');
    const h = safeGet('assinaturaBase64');
    if (h) h.value = '';
}

function salvarAssinaturaBase64() {
    const state = assinaturaState;
    if (!state.canvas || !state.temAssinatura) return;
    try {
        const h = safeGet('assinaturaBase64');
        if (h) h.value = state.canvas.toDataURL('image/png');
    } catch (e) {}
}

function obterAssinaturaBase64() {
    const state = assinaturaState;
    if (!state || !state.temAssinatura) return '';
    try { return state.canvas.toDataURL('image/png'); } catch (e) { return ''; }
}

// ============================================
// SCANNER AUTOMÁTICO
// ============================================
async function iniciarScannerAutomatico() {
    const qrContainer = safeGet('qr-reader-auto');
    if (!qrContainer) return;
    qrContainer.innerHTML = '<div id="qr-reader-auto-new" style="width: 100%;"></div>';
    scannerAuto = new Html5Qrcode("qr-reader-auto-new");
    const config = { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 };
    try {
        await scannerAuto.start({ facingMode: "environment" }, config, onScanSuccessAuto, () => {});
        scannerAutoAtivo = true;
    } catch (err) {
        qrContainer.innerHTML = `<div class="mostrarToastConcluido mostrarToastConcluido-warning m-3">Não foi possível acessar a câmera.</div>`;
        scannerAutoAtivo = false;
    }
}

async function pararScannerAutomatico() {
    if (scannerAuto && scannerAutoAtivo) { try { await scannerAuto.stop(); } catch (e) {} }
    scannerAutoAtivo = false;
    scannerAuto = null;
}

async function onScanSuccessAuto(decodedText) {
    const alunoId = extrairAlunoId(decodedText);
    if (!alunoId) { mostrarToastConcluido('QR Code inválido', 'error'); return; }
    await pararScannerAutomatico();
    await buscarAluno(alunoId);
}

function extrairAlunoId(decodedText) {
    if (!decodedText || typeof decodedText !== 'string') return null;
    if (decodedText.match(/^[a-f0-9]{24}$/i)) return decodedText;
    const m1 = decodedText.match(/[?&]aluno=([a-f0-9]{24})/i);
    if (m1) return m1[1];
    const m2 = decodedText.match(/[?&]id=([a-f0-9]{24})/i);
    if (m2) return m2[1];
    return null;
}

// ============================================
// MODOS
// ============================================
async function setModo(modo) {
    modoAtual = modo;
    safeGet('alunoInfo').style.display = 'none';
    safeGet('formRegistro').style.display = 'none';
    currentAluno = null;
    tipoTarefaSelecionado = null;
    
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
        const turma = safeGet('filtroTurmaManual').value;
        if (turma) await carregarAlunosPorTurma();
        else safeGet('listaAlunosManual').innerHTML = '<div class="text-center py-3">Selecione uma turma</div>';
    }
}

// ============================================
// MODO MANUAL
// ============================================
async function carregarTurmasParaManual() {
    try {
        const response = await fetch('/api/assistente-social/turmas', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success && Array.isArray(data.turmas)) {
            turmasDisponiveis = data.turmas;
            const select = safeGet('filtroTurmaManual');
            if (select) {
                select.innerHTML = '<option value="">Selecione uma turma...</option>';
                data.turmas.forEach(t => select.innerHTML += `<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`);
            }
        }
    } catch (error) {}
}

async function carregarAlunosPorTurma() {
    const turma = safeGet('filtroTurmaManual')?.value;
    if (!turma) {
        safeGet('listaAlunosManual').innerHTML = '<div class="text-center py-3">Selecione uma turma</div>';
        return;
    }
    safeGet('listaAlunosManual').innerHTML = '<div class="text-center py-3"><div class="loading"></div><p>Carregando...</p></div>';
    try {
        const response = await fetch(`/api/assistente-social/alunos-por-turma?turma=${encodeURIComponent(turma)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success && Array.isArray(data.alunos)) {
            alunosPorTurma = data.alunos;
            filtrarAlunosManual();
        } else {
            safeGet('listaAlunosManual').innerHTML = '<div class="mostrarToastConcluido mostrarToastConcluido-warning">Nenhum aluno</div>';
        }
    } catch (error) {
        safeGet('listaAlunosManual').innerHTML = '<div class="mostrarToastConcluido mostrarToastConcluido-danger">Erro</div>';
    }
}

function filtrarAlunosManual() {
    if (!Array.isArray(alunosPorTurma)) return;
    const busca = (safeGet('filtroBuscaManual')?.value || '').toLowerCase();
    let filtrados = alunosPorTurma;
    if (busca) filtrados = filtrados.filter(a => (a.nome || '').toLowerCase().includes(busca));
    filtrados.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    const container = safeGet('listaAlunosManual');
    if (filtrados.length === 0) { container.innerHTML = '<div class="text-center text-muted py-3">Nenhum aluno</div>'; return; }
    
    container.innerHTML = '<div class="list-group">' + filtrados.map(a => `
        <div class="list-group-item list-group-item-action d-flex justify-content-between align-items-center" 
             data-aluno-id="${a.id}" data-aluno-nome="${escapeHTML(a.nome)}" style="cursor: pointer;">
            <div><strong>${escapeHTML(a.nome)}</strong><br><small class="text-muted">${escapeHTML(a.matricula || '')} • ${escapeHTML(a.curso || '')}</small></div>
            <i class="fas fa-hand-pointer fa-2x" style="color: #8b5cf6;"></i>
        </div>`).join('') + '</div>';
    
    container.querySelectorAll('.list-group-item').forEach(item => {
        item.addEventListener('click', () => selecionarAluno(item.getAttribute('data-aluno-id'), item.getAttribute('data-aluno-nome'), item));
    });
}

async function selecionarAluno(alunoId, alunoNome, itemEl) {
    if (itemEl) {
        itemEl.style.background = '#f5f3ff'; itemEl.style.borderColor = '#8b5cf6'; itemEl.style.pointerEvents = 'none';
        itemEl.innerHTML = `<div><strong>${escapeHTML(alunoNome)}</strong><br><small style="color: #7c3aed;">Processando...</small></div><i class="fas fa-spinner fa-spin fa-2x" style="color: #7c3aed;"></i>`;
    }
    try { await buscarAluno(alunoId); } catch (error) {}
}

async function buscarAluno(alunoId) {
    try {
        await pararScannerAutomatico();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const response = await fetch(`/api/assistente-social/aluno/${alunoId}`, {
            headers: { 'Authorization': `Bearer ${token}` }, signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (data.success && data.aluno) {
            currentAluno = data.aluno;
            exibirAluno(data);
            mostrarFormRegistro();
        } else {
            mostrarToastConcluido(data.error || 'Aluno não encontrado', 'error');
            if (modoAtual === 'automatico') reiniciarScannerAutomatico(); else carregarAlunosPorTurma();
        }
    } catch (error) {
        mostrarToastConcluido(error.name === 'AbortError' ? 'Tempo esgotado' : 'Erro ao buscar aluno');
        if (modoAtual === 'automatico') reiniciarScannerAutomatico(); else carregarAlunosPorTurma();
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
    
    const statusDiv = safeGet('statusAtendimento');
    if (statusDiv) {
        if (data.atendimentosAtivos && data.atendimentosAtivos.length > 0) {
            statusDiv.innerHTML = `
                <div class="mostrarToastConcluido mostrarToastConcluido-warning">
                    <i class="fas fa-clock"></i> <strong>${data.atendimentosAtivos.length} atendimento(s) em andamento</strong>
                    ${data.atendimentosAtivos.map(a => `
                        <div class="mt-2 p-2" style="background: white; border-radius: 8px;">
                            <strong>${escapeHTML(a.tipoTarefaLabel || '')}</strong>: ${escapeHTML((a.descricao || '').substring(0, 100))}
                            <br><small class="text-muted"><i class="fas fa-clock"></i> ${a.dataHoraEntrada ? new Date(a.dataHoraEntrada).toLocaleString('pt-BR') : ''}</small>
                        </div>`).join('')}
                </div>`;
        } else {
            statusDiv.innerHTML = `<div class="mostrarToastConcluido mostrarToastConcluido-info"><i class="fas fa-info-circle"></i> Nenhum atendimento em andamento</div>`;
        }
    }
    
    const histDiv = safeGet('historicoRecente');
    if (histDiv) {
        if (data.historicoRecente && data.historicoRecente.length > 0) {
            histDiv.innerHTML = `
                <h6 class="text-muted mt-3 mb-2"><i class="fas fa-history"></i> Histórico Recente</h6>
                ${data.historicoRecente.map(h => `
                    <div class="p-2 mb-2" style="background: #f8fafc; border-radius: 8px; font-size: 13px;">
                        <strong>${escapeHTML(h.tipoTarefaLabel || '')}</strong>: ${escapeHTML((h.descricao || '').substring(0, 80))}
                        <br><small class="text-muted">${h.dataHora ? new Date(h.dataHora).toLocaleDateString('pt-BR') : ''} ${h.resultado ? `• ${escapeHTML(h.resultado)}` : ''}</small>
                    </div>`).join('')}`;
        } else histDiv.innerHTML = '';
    }
    safeGet('alunoInfo').style.display = 'block';
    safeGet('alunoInfo').scrollIntoView({ behavior: 'smooth' });
}

// ============================================
// FORMULÁRIO
// ============================================
function mostrarFormRegistro() {
    safeGet('formRegistro').style.display = 'block';
    const tipoInput = safeGet('tipoTarefaSelecionado');
    if (tipoInput) tipoInput.value = '';
    tipoTarefaSelecionado = null;
    document.querySelectorAll('.tipo-card').forEach(c => c.classList.remove('selected'));
    safeGet('descricao').value = '';
    safeGet('observacoes').value = '';
    safeGet('gravidade').value = 'media';
    safeGet('prioridade').value = 'normal';
    safeSetHTML('camposEspecificos', '');
    limparAssinatura();
    
    // 🆕 Reseta estado da sessão de assinatura
    limparEstadoSessaoAssinatura('assistenteSocial');
    const checkAssinatura = safeGet('assistenteSocialNecessitaAssinatura');
    if (checkAssinatura) checkAssinatura.checked = false;
    const blocoInfo = safeGet('assistenteSocialBlocoAssinaturaInfo');
    if (blocoInfo) { blocoInfo.style.display = 'none'; blocoInfo.innerHTML = ''; }
}

function selecionarTipo(tipo) {
    if (!tipo) return;
    tipoTarefaSelecionado = tipo;
    safeGet('tipoTarefaSelecionado').value = tipo;
    document.querySelectorAll('.tipo-card').forEach(c => c.classList.remove('selected'));
    const card = document.querySelector(`.tipo-card[data-tipo="${tipo}"]`);
    if (card) card.classList.add('selected');
    renderizarCamposEspecificos(tipo);
}

function renderizarCamposEspecificos(tipo) {
    const container = safeGet('camposEspecificos');
    if (!container) return;
    let html = '';
    const camposComuns = `
        <div class="mb-3"><label class="form-label">Contexto Familiar</label><textarea id="detalheContextoFamiliar" class="form-control" rows="2" placeholder="Informações sobre o contexto familiar..."></textarea></div>
        <div class="mb-3"><label class="form-label">Histórico Anterior</label><textarea id="detalheHistoricoAnterior" class="form-control" rows="2" placeholder="Histórico de situações anteriores..."></textarea></div>`;
    
    switch (tipo) {
        case 'evasao_escolar':
            html = `<div class="row">
                <div class="col-md-6 mb-3"><label class="form-label">Motivo da Evasão</label><input type="text" id="detalheMotivoEvasao" class="form-control" placeholder="Ex: Desmotivação, trabalho"></div>
                <div class="col-md-6 mb-3"><label class="form-label">Frequência de Faltas</label><input type="text" id="detalheFrequenciaFaltas" class="form-control" placeholder="Ex: 3x por semana"></div>
            </div>${camposComuns}`;
            break;
        case 'desinteresse_aprendizado':
            html = `<div class="mb-3"><label class="form-label">Disciplinas Afetadas (separadas por vírgula)</label><input type="text" id="detalheDisciplinasAfetadas" class="form-control"></div>
                <div class="mb-3"><label class="form-label">Estratégias de Motivação</label><textarea id="detalheEstrategiasMotivacao" class="form-control" rows="2"></textarea></div>${camposComuns}`;
            break;
        case 'problemas_disciplina':
            html = `<div class="mb-3"><label class="form-label">Tipo de Indisciplina</label><input type="text" id="detalheTipoIndisciplina" class="form-control"></div>
                <div class="mb-3"><label class="form-label">Professores Envolvidos (separados por vírgula)</label><input type="text" id="detalheProfessoresEnvolvidos" class="form-control"></div>${camposComuns}`;
            break;
        case 'insubordinacao_limites':
            html = `<div class="mb-3"><label class="form-label">Contexto da Insubordinação</label><textarea id="detalheContextoInsubordinacao" class="form-control" rows="2"></textarea></div>${camposComuns}`;
            break;
        case 'vulnerabilidade_drogas':
            html = `<div class="row">
                <div class="col-md-6 mb-3"><label class="form-label">Tipo de Substância</label><input type="text" id="detalheTipoSubstancia" class="form-control"></div>
                <div class="col-md-6 mb-3"><label class="form-label">Encaminhamento p/ Tratamento</label><input type="text" id="detalheEncaminhamentoTratamento" class="form-control"></div>
            </div>${camposComuns}`;
            break;
        case 'atitudes_agressivas':
            html = `<div class="row">
                <div class="col-md-6 mb-3"><label class="form-label">Tipo de Agressão</label><input type="text" id="detalheTipoAgressao" class="form-control"></div>
                <div class="col-md-6 mb-3"><label class="form-label">Vítimas</label><input type="text" id="detalheVitimas" class="form-control"></div>
            </div>${camposComuns}`;
            break;
        case 'baixo_rendimento':
            html = `<div class="mb-3"><label class="form-label">Notas Recentes</label><input type="text" id="detalheNotasRecentes" class="form-control"></div>
                <div class="mb-3"><label class="form-label">Disciplinas Críticas (separadas por vírgula)</label><input type="text" id="detalheDisciplinasCriticas" class="form-control"></div>${camposComuns}`;
            break;
        case 'encaminhamento':
            html = `<div class="mb-3"><label class="form-label">Órgão Encaminhado</label><input type="text" id="detalheOrgaoEncaminhado" class="form-control" placeholder="Ex: CRAS, CREAS, Conselho Tutelar"></div>
                <div class="mb-3"><label class="form-label">Motivo do Encaminhamento</label><textarea id="detalheMotivoEncaminhamento" class="form-control" rows="2"></textarea></div>${camposComuns}`;
            break;
        case 'intervencao':
            html = `<div class="mb-3"><label class="form-label">Tipo de Intervenção</label><input type="text" id="detalheTipoIntervencao" class="form-control"></div>
                <div class="mb-3"><label class="form-label">Participantes (separados por vírgula)</label><input type="text" id="detalheParticipantesIntervencao" class="form-control"></div>${camposComuns}`;
            break;
        case 'atendimento':
            html = `<div class="row">
                <div class="col-md-6 mb-3"><label class="form-label">Tipo de Atendimento</label><input type="text" id="detalheTipoAtendimento" class="form-control"></div>
                <div class="col-md-6 mb-3"><label class="form-label">Duração (min)</label><input type="number" id="detalheDuracaoAtendimento" class="form-control" min="1"></div>
            </div>${camposComuns}`;
            break;
        case 'outros':
            html = `<div class="mb-3"><label class="form-label">Especifique <span class="text-danger">*</span></label><input type="text" id="detalheTipoTarefaOutros" class="form-control"></div>${camposComuns}`;
            break;
    }
    
    html += `<div class="mb-3"><label class="form-label">Providências Tomadas</label><textarea id="detalheProvidencias" class="form-control" rows="2"></textarea></div>
        <div class="mb-3"><label class="form-label">Próximos Passos</label><textarea id="detalheProximosPassos" class="form-control" rows="2"></textarea></div>`;
    
    container.innerHTML = html;
}

function coletarDetalhes() {
    const detalhes = {};
    const arrays = {
        'detalheDisciplinasAfetadas': 'disciplinasAfetadas',
        'detalheProfessoresEnvolvidos': 'professoresEnvolvidos',
        'detalheDisciplinasCriticas': 'disciplinasCriticas',
        'detalheParticipantesIntervencao': 'participantesIntervencao'
    };
    Object.entries(arrays).forEach(([id, key]) => {
        const el = safeGet(id);
        if (el && el.value) detalhes[key] = el.value.split(',').map(t => t.trim()).filter(t => t.length > 0);
    });
    
    const camposTexto = {
        'detalheContextoFamiliar': 'contextoFamiliar',
        'detalheHistoricoAnterior': 'historicoAnterior',
        'detalheMotivoEvasao': 'motivoEvasao',
        'detalheFrequenciaFaltas': 'frequenciaFaltas',
        'detalheEstrategiasMotivacao': 'estrategiasMotivacao',
        'detalheTipoIndisciplina': 'tipoIndisciplina',
        'detalheContextoInsubordinacao': 'contextoInsubordinacao',
        'detalheTipoSubstancia': 'tipoSubstancia',
        'detalheEncaminhamentoTratamento': 'encaminhamentoTratamento',
        'detalheTipoAgressao': 'tipoAgressao',
        'detalheVitimas': 'vitimas',
        'detalheNotasRecentes': 'notasRecentes',
        'detalheOrgaoEncaminhado': 'orgaoEncaminhado',
        'detalheMotivoEncaminhamento': 'motivoEncaminhamento',
        'detalheTipoIntervencao': 'tipoIntervencao',
        'detalheTipoAtendimento': 'tipoAtendimento',
        'detalheTipoTarefaOutros': 'tipoTarefaOutros',
        'detalheProvidencias': 'providenciasTomadas',
        'detalheProximosPassos': 'proximosPassos'
    };
    Object.entries(camposTexto).forEach(([id, key]) => {
        const el = safeGet(id);
        if (el && el.value) detalhes[key] = el.value.trim();
    });
    
    const da = safeGet('detalheDuracaoAtendimento');
    if (da && da.value) { const d = parseInt(da.value); if (d > 0) detalhes.duracaoAtendimento = d; }
    
    return detalhes;
}

// ============================================
// REGISTRAR OCORRÊNCIA (COM ASSINATURA VIA QR)
// ============================================
async function registrarOcorrencia() {
    if (!tipoTarefaSelecionado) { 
        mostrarToastConcluido('Selecione o tipo de tarefa', 'error'); 
        return; 
    }
    const descricao = (safeGet('descricao')?.value || '').trim();
    if (!descricao) { 
        mostrarToastConcluido('Descreva o ocorrido', 'error'); 
        return; 
    }
    if (!currentAluno || !currentAluno.id) { 
        mostrarToastConcluido('Nenhum aluno selecionado', 'error'); 
        return; 
    }
    
    // ==========================================
    // 🆕 VALIDAÇÃO DA ASSINATURA VIA QR
    // ==========================================
    const precisaAssinatura = safeGet('assistenteSocialNecessitaAssinatura')?.checked || false;
    const assinaturaQRCapturada = estadoSessaoAssinatura.assistenteSocial?.assinaturaCapturada || '';
    const assinaturaCanvas = obterAssinaturaBase64();
    const assinaturaFinal = assinaturaQRCapturada || assinaturaCanvas;
    
    if (precisaAssinatura && !assinaturaQRCapturada) {
        mostrarToastConcluido('⚠️ Aguardando assinatura! O responsável ainda não assinou o QR Code.', 'error', 5000);
        reabrirModalAssinatura('assistenteSocial');
        return;
    }
    
    const btn = document.querySelector('#formRegistro .btn-primary-custom');
    if (btn) btn.disabled = true;
    
    try {
        const response = await fetch('/api/assistente-social/registrar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
                alunoId: currentAluno.id,
                tipoTarefa: tipoTarefaSelecionado,
                descricao,
                observacoes: safeGet('observacoes')?.value || '',
                gravidade: safeGet('gravidade')?.value || 'media',
                prioridade: safeGet('prioridade')?.value || 'normal',
                detalhes: coletarDetalhes(),
                assinaturaBase64: assinaturaFinal,
                precisaAssinatura: precisaAssinatura
            })
        });
        const data = await response.json();
        
        if (data.success) {
            // 🆕 Limpa a sessão de assinatura
            const sessaoId = estadoSessaoAssinatura.assistenteSocial?.sessaoId;
            if (sessaoId) {
                fetch(`/api/sessoes-assinatura/${sessaoId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                }).catch(e => console.warn(e));
            }
            pararMonitoramentoSessao('assistenteSocial');
            fecharModalAssinatura('assistenteSocial');
            limparEstadoSessaoAssinatura('assistenteSocial');
            
            mostrarToastConcluido(`✅ ${data.message}`, 'success');
            finalizarAposSucesso();
        } else {
            mostrarToastConcluido('❌ ' + (data.error || 'Erro ao registrar'), 'error');
        }
    } catch (error) { 
        mostrarToastConcluido('Erro: ' + error.message, 'error'); 
    }
    finally { 
        if (btn) btn.disabled = false; 
    }
}

function finalizarAposSucesso() {
    limparTela();
    if (modoAtual === 'automatico') reiniciarScannerAutomatico(); else carregarAlunosPorTurma();
    carregarAtendimentosAtivos();
    carregarDashboard();
    carregarLembretes();
}

function limparTela() {
    safeGet('alunoInfo').style.display = 'none';
    safeGet('formRegistro').style.display = 'none';
    currentAluno = null;
    currentAtendimento = null;
    tipoTarefaSelecionado = null;
    limparAssinatura();
    
    // 🆕 Limpa a sessão de assinatura
    const sessaoId = estadoSessaoAssinatura.assistenteSocial?.sessaoId;
    if (sessaoId) {
        fetch(`/api/sessoes-assinatura/${sessaoId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        }).catch(e => console.warn(e));
    }
    pararMonitoramentoSessao('assistenteSocial');
    fecharModalAssinatura('assistenteSocial');
    limparEstadoSessaoAssinatura('assistenteSocial');
    
    const checkAssinatura = safeGet('assistenteSocialNecessitaAssinatura');
    if (checkAssinatura) checkAssinatura.checked = false;
    const blocoInfo = safeGet('assistenteSocialBlocoAssinaturaInfo');
    if (blocoInfo) { blocoInfo.style.display = 'none'; blocoInfo.innerHTML = ''; }
}

function reiniciarScannerAutomatico() {
    setTimeout(() => {
        if (!scannerAutoAtivo && modoAtual === 'automatico') iniciarScannerAutomatico();
    }, 1000);
}

// ============================================
// ATENDIMENTOS ATIVOS
// ============================================
async function carregarAtendimentosAtivos() {
    const container = safeGet('listaAtendimentosAtivos');
    if (!container) return;
    try {
        const response = await fetch('/api/assistente-social/atendimentos-ativos', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        __atendimentosAtivosBrutos = (data.success && Array.isArray(data.atendimentos)) ? data.atendimentos : [];
        popularFiltroTurmasAndamento();
        aplicarFiltrosAndamento();
        atualizarBadgeTabAtivos(__atendimentosAtivosBrutos.length);
    } catch (error) {
        container.innerHTML = `<div class="mostrarToastConcluido mostrarToastConcluido-danger"><i class="fas fa-exclamation-triangle"></i> Erro ao carregar</div>`;
    }
}

function atualizarBadgeTabAtivos(total) {
    const badge = safeGet('badgeAtivosTab');
    if (!badge) return;
    if (total > 0) { badge.textContent = total; badge.style.display = 'inline-block'; }
    else badge.style.display = 'none';
}

function renderizarListaAtendimentosAtivos(lista) {
    const container = safeGet('listaAtendimentosAtivos');
    if (!container) return;
    
    if (!lista || lista.length === 0) {
        if (__atendimentosAtivosBrutos.length > 0) {
            container.innerHTML = `
                <div class="estado-vazio-filtro">
                    <i class="fas fa-search"></i>
                    <p>Nenhum atendimento corresponde aos filtros</p>
                    <button class="btn btn-sm btn-outline-primary" onclick="limparFiltrosAndamento()">
                        <i class="fas fa-times"></i> Limpar filtros
                    </button>
                </div>`;
        } else {
            container.innerHTML = `
                <div class="text-center text-muted py-5">
                    <i class="fas fa-check-circle fa-3x mb-3" style="color:#10b981;"></i>
                    <p>Nenhum atendimento em andamento</p>
                </div>`;
        }
        return;
    }
    
    const prioridadeIcon = { urgente: '🔴', alta: '🟠', normal: '🟡', baixa: '🟢' };
    
    container.innerHTML = lista.map(a => `
        <div class="list-group-item filtrado">
            <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
                <div class="d-flex align-items-center gap-3">
                    <img src="${a.alunoFoto || gerarAvatarSVG(a.alunoNome || '?')}" 
                         style="width:50px;height:50px;border-radius:50%;object-fit:cover;"
                         onerror="this.onerror=null; this.src='${gerarAvatarSVG(a.alunoNome || '?')}'">
                    <div>
                        <strong>${escapeHTML(a.alunoNome || '')}</strong>
                        <br><small class="text-muted">Turma: ${escapeHTML(a.alunoTurma || '-')}</small>
                        <br>
                        <span class="badge" style="background: #8b5cf6;">${escapeHTML(a.tipoTarefaLabel || '')}</span>
                        <span class="badge badge-gravidade gravidade-${a.gravidade || 'media'}">${escapeHTML(a.gravidade || 'media')}</span>
                        <span class="badge bg-secondary">${prioridadeIcon[a.prioridade] || '🟡'} ${escapeHTML(a.prioridade || 'normal')}</span>
                        ${a.temRemarcacaoPendente ? '<span class="badge bg-warning text-dark"><i class="fas fa-calendar"></i> Remarcado</span>' : ''}
                        ${a.temAssinatura ? '<span class="badge bg-success"><i class="fas fa-signature"></i></span>' : ''}
                    </div>
                </div>
                <div class="text-end">
                    <small class="text-muted d-block"><i class="fas fa-clock"></i> Há ${a.tempoAtendimento || 0} min</small>
                    <div class="mt-2 d-flex gap-1 flex-wrap justify-content-end">
                        <button class="btn btn-sm btn-info" onclick="verAtendimento('${a.id}')" title="Ver detalhes">
                            <i class="fas fa-eye"></i> Ver
                        </button>
                        <button class="btn btn-sm btn-success" onclick="imprimirAtendimento('${a.id}')" title="Imprimir">
                            <i class="fas fa-print"></i>
                        </button>
                        <button class="btn btn-sm btn-secondary" onclick="abrirEditarAtendimento('${a.id}')" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-primary" onclick="abrirFinalizacao('${a.id}')" title="Finalizar">
                            <i class="fas fa-check"></i>
                        </button>
                        <button class="btn btn-sm btn-warning" onclick="abrirRemarcar('${a.id}')" title="Remarcar">
                            <i class="fas fa-calendar-plus"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="excluirAtendimento('${a.id}')" title="Excluir">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
            <div class="mt-2 p-2" style="background:#f8fafc;border-radius:8px;font-size:13px;">
                ${escapeHTML((a.descricao || '').substring(0, 150))}${(a.descricao || '').length > 150 ? '...' : ''}
            </div>
        </div>
    `).join('');
}

// ============================================
// FINALIZAR / REMARCAR / EXCLUIR
// ============================================
function abrirFinalizacao(atendimentoId) {
    if (!atendimentoId) return;
    const modalHtml = `
        <div class="modal fade" id="modalFinalizar" tabindex="-1">
            <div class="modal-dialog"><div class="modal-content">
                <div class="modal-header" style="background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white;">
                    <h5 class="modal-title"><i class="fas fa-check-circle"></i> Finalizar Atendimento</h5>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body"><p>Selecione o resultado:</p>
                    <div class="d-grid gap-2">
                        <button class="btn btn-outline-success text-start" onclick="confirmarFinalizacao('${atendimentoId}', 'resolvido')">
                            <i class="fas fa-check-circle"></i> <strong>Resolvido</strong><br><small class="text-muted">O caso foi resolvido</small>
                        </button>
                        <button class="btn btn-outline-info text-start" onclick="confirmarFinalizacao('${atendimentoId}', 'em_acompanhamento')">
                            <i class="fas fa-clock"></i> <strong>Em Acompanhamento</strong><br><small class="text-muted">Precisa de acompanhamento contínuo</small>
                        </button>
                        <button class="btn btn-outline-warning text-start" onclick="confirmarFinalizacao('${atendimentoId}', 'reincidente')">
                            <i class="fas fa-redo"></i> <strong>Reincidente</strong><br><small class="text-muted">Já teve ocorrências anteriores</small>
                        </button>
                        <button class="btn btn-outline-secondary text-start" onclick="confirmarFinalizacao('${atendimentoId}', 'encaminhado')">
                            <i class="fas fa-share"></i> <strong>Encaminhado</strong><br><small class="text-muted">Encaminhado para outro setor</small>
                        </button>
                        <button class="btn btn-outline-danger text-start" onclick="confirmarFinalizacao('${atendimentoId}', 'pendente')">
                            <i class="fas fa-hourglass-half"></i> <strong>Pendente</strong><br><small class="text-muted">Aguardando ação</small>
                        </button>
                    </div>
                </div>
            </div></div>
        </div>`;
    const old = safeGet('modalFinalizar');
    if (old) old.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    new bootstrap.Modal(safeGet('modalFinalizar')).show();
}

async function confirmarFinalizacao(atendimentoId, resultado) {
    if (document.activeElement && document.activeElement.blur) {
        document.activeElement.blur();
    }
    
    const modalEl = safeGet('modalFinalizar');
    const modal = bootstrap.Modal.getInstance(modalEl);
    
    if (modal) {
        modalEl.addEventListener('hidden.bs.modal', async function handler() {
            modalEl.removeEventListener('hidden.bs.modal', handler);
            
            if (resultado === 'em_acompanhamento') {
                const querRemarcar = await confirm('✅ Atendimento marcado como "Em Acompanhamento".\n\n🔄 Deseja REMARCAR este atendimento?\n\n• Sim → Abre formulário de remarcação\n• Não → Apenas finaliza');
                if (querRemarcar) {
                    await finalizarAtendimento(atendimentoId, resultado, true);
                    setTimeout(() => abrirRemarcar(atendimentoId), 500);
                    return;
                }
            }
            
            await finalizarAtendimento(atendimentoId, resultado, false);
        }, { once: true });
        
        modal.hide();
    } else {
        await finalizarAtendimento(atendimentoId, resultado, false);
    }
}

async function finalizarAtendimento(atendimentoId, resultado, pularAlerta) {
    try {
        const response = await fetch('/api/assistente-social/finalizar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ atendimentoId, resultado, observacoesFinais: '' })
        });
        const data = await response.json();
        if (data.success) {
            if (!pularAlerta) mostrarToastConcluido(`✅ ${data.message}`, 'success');
            carregarAtendimentosAtivos();
            carregarDashboard();
            carregarLembretes();
        } else mostrarToastConcluido('❌ ' + (data.error || 'Erro'), 'error');
    } catch (error) { mostrarToastConcluido('Erro ao finalizar', 'error'); }
}

function abrirRemarcar(atendimentoId) {
    if (!atendimentoId) return;
    fecharNotificacoes();
    const hoje = new Date();
    const amanha = new Date(hoje);
    amanha.setDate(amanha.getDate() + 1);
    const dataMin = amanha.toISOString().split('T')[0];
    const modalHtml = `
        <div class="modal fade" id="modalRemarcar" tabindex="-1">
            <div class="modal-dialog"><div class="modal-content">
                <div class="modal-header" style="background: linear-gradient(135deg, #f59e0b, #d97706); color: white;">
                    <h5 class="modal-title"><i class="fas fa-calendar-plus"></i> Remarcar Atendimento</h5>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <input type="hidden" id="remarcarAtendimentoId" value="${atendimentoId}">
                    <div class="mb-3"><label class="form-label">Nova Data <span class="text-danger">*</span></label><input type="date" id="remarcarData" class="form-control" min="${dataMin}" value="${dataMin}"></div>
                    <div class="mb-3"><label class="form-label">Horário <span class="text-danger">*</span></label><input type="time" id="remarcarHorario" class="form-control" value="08:00"></div>
                    <div class="mb-3"><label class="form-label">Motivo <span class="text-danger">*</span></label>
                        <select id="remarcarMotivo" class="form-select">
                            <option value="">Selecione...</option>
                            <option value="Aluno ausente">Aluno ausente</option>
                            <option value="Aluno não compareceu">Aluno não compareceu</option>
                            <option value="Profissional indisponível">Profissional indisponível</option>
                            <option value="Necessita mais tempo">Necessita mais tempo</option>
                            <option value="Aguardando documento">Aguardando documento</option>
                            <option value="Aguardando responsável">Aguardando responsável</option>
                            <option value="Outros">Outros</option>
                        </select>
                    </div>
                    <div class="mb-3"><label class="form-label">Observações</label><textarea id="remarcarObservacoes" class="form-control" rows="2"></textarea></div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                    <button type="button" class="btn btn-warning" onclick="confirmarRemarcacao()"><i class="fas fa-calendar-check"></i> Remarcar</button>
                </div>
            </div></div>
        </div>`;
    const old = safeGet('modalRemarcar');
    if (old) old.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    new bootstrap.Modal(safeGet('modalRemarcar')).show();
}

async function confirmarRemarcacao() {
    const atendimentoId = safeGet('remarcarAtendimentoId')?.value;
    const dataRemarcacao = safeGet('remarcarData')?.value;
    const horarioRemarcacao = safeGet('remarcarHorario')?.value;
    const motivoRemarcacao = safeGet('remarcarMotivo')?.value;
    const observacoesRemarcacao = safeGet('remarcarObservacoes')?.value || '';
    if (!dataRemarcacao || !horarioRemarcacao || !motivoRemarcacao) { mostrarToastConcluido('Preencha todos os campos', 'error'); return; }
    try {
        const response = await fetch('/api/assistente-social/remarcar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ atendimentoId, dataRemarcacao, horarioRemarcacao, motivoRemarcacao, observacoesRemarcacao })
        });
        const ct = response.headers.get('content-type') || '';
        if (!ct.includes('application/json')) { mostrarToastConcluido('⚠️ Funcionalidade indisponível no servidor', 'error'); return; }
        const data = await response.json();
        if (data.success) {
            mostrarToastConcluido(`✅ ${data.message}`, 'success');
            const modal = bootstrap.Modal.getInstance(safeGet('modalRemarcar'));
            if (modal) modal.hide();
            carregarAtendimentosAtivos();
            carregarLembretes();
        } else mostrarToastConcluido('❌ ' + (data.error || 'Erro'), 'error');
    } catch (error) { mostrarToastConcluido('Erro ao remarcar', 'error'); }
}

function abrirFinalizacaoRemarcacao(remarcacaoId) {
    if (!remarcacaoId) return;
    fecharNotificacoes();
    const modalHtml = `
        <div class="modal fade" id="modalFinalizarRemarcacao" tabindex="-1">
            <div class="modal-dialog"><div class="modal-content">
                <div class="modal-header" style="background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white;">
                    <h5 class="modal-title"><i class="fas fa-check-circle"></i> Finalizar Remarcação</h5>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body"><p>O atendimento remarcado foi realizado?</p>
                    <div class="d-grid gap-2">
                        <button class="btn btn-outline-success text-start" onclick="confirmarFinalizacaoRemarcacao('${remarcacaoId}', 'realizado')"><i class="fas fa-check-circle"></i> <strong>Sim, foi realizado</strong></button>
                        <button class="btn btn-outline-warning text-start" onclick="abrirRemarcarPorRemarcacao('${remarcacaoId}')"><i class="fas fa-calendar-plus"></i> <strong>Não, precisa remarcar novamente</strong></button>
                        <button class="btn btn-outline-secondary text-start" onclick="confirmarFinalizacaoRemarcacao('${remarcacaoId}', 'cancelado')"><i class="fas fa-times-circle"></i> <strong>Cancelar</strong></button>
                    </div>
                </div>
            </div></div>
        </div>`;
    const old = safeGet('modalFinalizarRemarcacao');
    if (old) old.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    new bootstrap.Modal(safeGet('modalFinalizarRemarcacao')).show();
}

async function confirmarFinalizacaoRemarcacao(remarcacaoId, acao) {
    const modal = bootstrap.Modal.getInstance(safeGet('modalFinalizarRemarcacao'));
    if (modal) modal.hide();
    
    if (acao === 'cancelado') {
        const confirmar = await confirm('Tem certeza que deseja CANCELAR?');
        if (!confirmar) return;
    }
    
    try {
        const response = await fetch('/api/assistente-social/remarcacoes/finalizar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ remarcacaoId, acao })
        });
        const data = await response.json();
        if (data.success) {
            mostrarToastConcluido(`✅ ${data.message}`, 'success');
            carregarAtendimentosAtivos();
            carregarLembretes();
        } else {
            mostrarToastConcluido('❌ ' + (data.error || 'Erro'), 'error');
        }
    } catch (error) {
        console.error('Erro ao finalizar remarcação:', error);
    }
}

function abrirRemarcarPorRemarcacao(remarcacaoId) {
    const modal = bootstrap.Modal.getInstance(safeGet('modalFinalizarRemarcacao'));
    if (modal) modal.hide();
    fetch(`/api/assistente-social/remarcacoes/${remarcacaoId}`, { headers: { 'Authorization': `Bearer ${token}` } })
        .then(r => r.json())
        .then(data => {
            if (data.success && data.remarcacao?.atendimentoId) abrirRemarcar(data.remarcacao.atendimentoId);
            else mostrarToastConcluido('Erro ao carregar dados', 'error');
        })
        .catch(e => mostrarToastConcluido('Erro ao carregar dados'));
}

async function excluirAtendimento(atendimentoId) {
    if (!atendimentoId) return;
    
    const confirmar1 = await confirm('⚠️ Tem certeza que deseja EXCLUIR este atendimento?\n\nEsta ação não pode ser desfeita!');
    if (!confirmar1) return;
    
    const confirmar2 = await confirm('⚠️ ÚLTIMA CONFIRMAÇÃO!\n\nTodos os dados serão perdidos permanentemente.');
    if (!confirmar2) return;
    
    try {
        const response = await fetch(`/api/assistente-social/atendimento/${atendimentoId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success) {
            mostrarToastConcluido('✅ Atendimento excluído!', 'success');
            carregarAtendimentosAtivos();
            carregarDashboard();
            carregarLembretes();
            carregarAtendimentosConcluidos(__concluidosPaginaAtual);
        } else {
            mostrarToastConcluido('❌ ' + (data.error || 'Erro'), 'error');
        }
    } catch (error) {
        console.error('Erro ao excluir:', error);
    }
}

// ============================================
// ✏️ EDITAR ATENDIMENTO
// ============================================
async function abrirEditarAtendimento(atendimentoId) {
    if (!atendimentoId) return;
    
    try {
        const response = await fetch(`/api/assistente-social/atendimento/${atendimentoId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (!data.success || !data.atendimento) {
            mostrarToastConcluido('Erro ao carregar atendimento', 'error');
            return;
        }
        
        const a = data.atendimento;
        const oldModal = safeGet('modalEditarAtendimento');
        if (oldModal) oldModal.remove();
        
        const tiposOptions = Object.entries(TIPO_LABELS).map(([key, label]) => 
            `<option value="${key}" ${a.tipoTarefa === key ? 'selected' : ''}>${label}</option>`
        ).join('');
        
        const modalHtml = `
            <div class="modal fade" id="modalEditarAtendimento" tabindex="-1">
                <div class="modal-dialog modal-lg modal-dialog-scrollable">
                    <div class="modal-content">
                        <div class="modal-header" style="background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white;">
                            <h5 class="modal-title">
                                <i class="fas fa-edit"></i> Editar Atendimento
                            </h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <input type="hidden" id="editAtendimentoId" value="${a.id}">
                            
                            <div style="display: flex; align-items: center; gap: 12px; padding: 12px; background: #f5f3ff; border-radius: 10px; margin-bottom: 16px;">
                                <img src="${gerarAvatarSVG(a.alunoNome)}" style="width: 50px; height: 50px; border-radius: 50%;" alt="">
                                <div style="flex: 1;">
                                    <h5 style="margin: 0; color: #5b21b6;">${escapeHTML(a.alunoNome)}</h5>
                                    <small style="color: #6b7280;">
                                        <i class="fas fa-id-card"></i> ${escapeHTML(a.alunoMatricula || '-')} • 
                                        <i class="fas fa-graduation-cap"></i> ${escapeHTML(a.alunoTurma || '-')}
                                    </small>
                                </div>
                            </div>
                            
                            <div class="mb-3">
                                <label class="form-label">Tipo de Tarefa <span class="text-danger">*</span></label>
                                <select id="editTipoTarefa" class="form-select">
                                    ${tiposOptions}
                                </select>
                            </div>
                            
                            <div class="mb-3">
                                <label class="form-label">Descrição <span class="text-danger">*</span></label>
                                <textarea id="editDescricao" class="form-control" rows="3">${escapeHTML(a.entrada?.descricao || '')}</textarea>
                            </div>
                            
                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label">Gravidade</label>
                                    <select id="editGravidade" class="form-select">
                                        <option value="baixa" ${a.entrada?.gravidade === 'baixa' ? 'selected' : ''}>Baixa</option>
                                        <option value="media" ${a.entrada?.gravidade === 'media' ? 'selected' : ''}>Média</option>
                                        <option value="alta" ${a.entrada?.gravidade === 'alta' ? 'selected' : ''}>Alta</option>
                                        <option value="critica" ${a.entrada?.gravidade === 'critica' ? 'selected' : ''}>Crítica</option>
                                    </select>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label">Prioridade</label>
                                    <select id="editPrioridade" class="form-select">
                                        <option value="baixa" ${a.prioridade === 'baixa' ? 'selected' : ''}>Baixa</option>
                                        <option value="normal" ${a.prioridade === 'normal' ? 'selected' : ''}>Normal</option>
                                        <option value="alta" ${a.prioridade === 'alta' ? 'selected' : ''}>Alta</option>
                                        <option value="urgente" ${a.prioridade === 'urgente' ? 'selected' : ''}>Urgente</option>
                                    </select>
                                </div>
                            </div>
                            
                            <div class="mb-3">
                                <label class="form-label">Observações</label>
                                <textarea id="editObservacoes" class="form-control" rows="2">${escapeHTML(a.entrada?.observacoes || '')}</textarea>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                                <i class="fas fa-times"></i> Cancelar
                            </button>
                            <button type="button" class="btn btn-primary" onclick="salvarEdicaoAtendimento()">
                                <i class="fas fa-save"></i> Salvar Alterações
                            </button>
                        </div>
                    </div>
                </div>
            </div>`;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        new bootstrap.Modal(safeGet('modalEditarAtendimento')).show();
    } catch (error) {
        console.error('Erro:', error);
        mostrarToastConcluido('Erro ao carregar para edição', 'error');
    }
}

async function salvarEdicaoAtendimento() {
    const atendimentoId = safeGet('editAtendimentoId')?.value;
    const tipoTarefa = safeGet('editTipoTarefa')?.value;
    const descricao = (safeGet('editDescricao')?.value || '').trim();
    const gravidade = safeGet('editGravidade')?.value;
    const prioridade = safeGet('editPrioridade')?.value;
    const observacoes = safeGet('editObservacoes')?.value || '';
    
    if (!tipoTarefa || !descricao) {
        mostrarToastConcluido('Preencha todos os campos obrigatórios', 'error');
        return;
    }
    
    try {
        const response = await fetch(`/api/assistente-social/atendimento/${atendimentoId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                tipoTarefa,
                descricao,
                gravidade,
                prioridade,
                observacoes
            })
        });
        const data = await response.json();
        
        if (data.success) {
            const modal = bootstrap.Modal.getInstance(safeGet('modalEditarAtendimento'));
            if (modal) modal.hide();
            
            mostrarToastConcluido('✅ Atendimento atualizado com sucesso!', 'success');
            
            carregarAtendimentosAtivos();
            carregarDashboard();
            carregarLembretes();
            carregarAtendimentosConcluidos(__concluidosPaginaAtual);
        } else {
            mostrarToastConcluido('❌ ' + (data.error || 'Erro ao salvar'), 'error');
        }
    } catch (error) {
        console.error('Erro:', error);
        mostrarToastConcluido('Erro ao salvar alterações', 'error');
    }
}

// ============================================
// 👁️ VER ATENDIMENTO (MODAL DETALHADO)
// ============================================
async function verAtendimento(atendimentoId) {
    if (!atendimentoId) return;
    fecharNotificacoes();
    
    try {
        const response = await fetch(`/api/assistente-social/atendimento/${atendimentoId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (!data.success || !data.atendimento) { mostrarToastConcluido('Erro ao carregar atendimento', 'error'); return; }
        const a = data.atendimento;
        
        let detalhesHTML = '';
        if (a.detalhes && Object.keys(a.detalhes).length > 0) {
            const detalhesMap = {
                contextoFamiliar: 'Contexto Familiar',
                historicoAnterior: 'Histórico Anterior',
                profissionaisEnvolvidos: 'Profissionais Envolvidos',
                condicaoSocial: 'Condição Social',
                encaminhadoPara: 'Encaminhado Para',
                motivoEncaminhamento: 'Motivo do Encaminhamento',
                agendadoPara: 'Agendado Para',
                tipoIntervencao: 'Tipo de Intervenção',
                metodosUtilizados: 'Métodos Utilizados',
                duracaoSessao: 'Duração da Sessão (min)',
                modalidadeAtendimento: 'Modalidade',
                participantesAtendimento: 'Participantes',
                tipoTarefaOutros: 'Especificação',
                providenciasTomadas: 'Providências Tomadas',
                proximosPassos: 'Próximos Passos'
            };
            
            detalhesHTML = '<div class="section-title">📋 Detalhes</div>';
            Object.entries(a.detalhes).forEach(([key, value]) => {
                if (!value || (Array.isArray(value) && value.length === 0)) return;
                const label = detalhesMap[key] || key;
                const valor = Array.isArray(value) ? value.join(', ') : value;
                detalhesHTML += `
                    <div class="info-row">
                        <div class="info-label">${escapeHTML(label)}:</div>
                        <div class="info-value">${escapeHTML(String(valor))}</div>
                    </div>`;
            });
        }
        
        let assinaturaHTML = '';
        if (a.entrada?.temAssinatura && a.entrada?.assinaturaBase64) {
            assinaturaHTML = `
                <div class="section-title">✍️ Assinatura do Responsável</div>
                <div class="assinatura-preview">
                    <img src="${a.entrada.assinaturaBase64}" alt="Assinatura">
                </div>`;
        }
        
        let remarcacoesHTML = '';
        if (a.remarcacoes && a.remarcacoes.length > 0) {
            remarcacoesHTML = '<div class="section-title">📅 Histórico de Remarcações</div>';
            a.remarcacoes.forEach((r, idx) => {
                const statusLabel = {
                    'pendente': '⏳ Pendente',
                    'realizado': '✅ Realizado',
                    'cancelado': '❌ Cancelado'
                }[r.status] || r.status;
                
                remarcacoesHTML += `
                    <div style="background: #f9fafb; padding: 10px; border-radius: 8px; margin-bottom: 8px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                            <strong style="color: #7c3aed;">#${idx + 1} - ${statusLabel}</strong>
                            <small style="color: #6b7280;">${formatarDataBR(r.dataRemarcacao)} às ${r.horarioRemarcacao}</small>
                        </div>
                        <div style="font-size: 13px; color: #4b5563;">
                            <strong>Motivo:</strong> ${escapeHTML(r.motivoRemarcacao || '-')}
                        </div>
                        ${r.observacoesRemarcacao ? `<div style="font-size: 12px; color: #6b7280; margin-top: 4px;">${escapeHTML(r.observacoesRemarcacao)}</div>` : ''}
                    </div>`;
            });
        }
        
        const oldModal = safeGet('modalVerAtendimento');
        if (oldModal) oldModal.remove();
        
        const modalHtml = `
            <div class="modal fade" id="modalVerAtendimento" tabindex="-1">
                <div class="modal-dialog modal-lg modal-dialog-scrollable">
                    <div class="modal-content">
                        <div class="modal-header" style="background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white;">
                            <h5 class="modal-title"><i class="fas fa-eye"></i> Detalhes do Atendimento</h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body detalhe-atendimento">
                            <div style="display: flex; align-items: center; gap: 12px; padding: 12px; background: #f5f3ff; border-radius: 10px; margin-bottom: 16px;">
                                <img src="${gerarAvatarSVG(a.alunoNome)}" style="width: 50px; height: 50px; border-radius: 50%;" alt="">
                                <div style="flex: 1;">
                                    <h5 style="margin: 0; color: #5b21b6;">${escapeHTML(a.alunoNome)}</h5>
                                    <small style="color: #6b7280;">
                                        <i class="fas fa-id-card"></i> ${escapeHTML(a.alunoMatricula || '-')} • 
                                        <i class="fas fa-graduation-cap"></i> ${escapeHTML(a.alunoTurma || '-')}
                                    </small>
                                </div>
                                <span class="badge" style="background: #8b5cf6; font-size: 12px;">${escapeHTML(a.tipoTarefaLabel)}</span>
                            </div>
                            
                            <div class="section-title">📌 Informações</div>
                            <div class="info-row">
                                <div class="info-label">Status:</div>
                                <div class="info-value">
                                    <span class="badge" style="background: ${a.status === 'finalizado' ? '#10b981' : '#f59e0b'};">
                                        ${a.status === 'finalizado' ? '✅ Finalizado' : '⏳ Em Andamento'}
                                    </span>
                                </div>
                            </div>
                            <div class="info-row">
                                <div class="info-label">Prioridade:</div>
                                <div class="info-value">
                                    <span class="badge" style="background: ${a.prioridade === 'urgente' ? '#dc2626' : a.prioridade === 'alta' ? '#f59e0b' : '#3b82f6'};">
                                        ${escapeHTML(a.prioridade || 'normal').toUpperCase()}
                                    </span>
                                </div>
                            </div>
                            <div class="info-row">
                                <div class="info-label">Gravidade:</div>
                                <div class="info-value">${escapeHTML(a.entrada?.gravidade || 'media').toUpperCase()}</div>
                            </div>
                            <div class="info-row">
                                <div class="info-label">Data de Entrada:</div>
                                <div class="info-value">${a.entrada?.dataHoraFormatada || '-'}</div>
                            </div>
                            <div class="info-row">
                                <div class="info-label">Registrado por:</div>
                                <div class="info-value">${escapeHTML(a.entrada?.registradoPor || '-')}</div>
                            </div>
                            
                            <div class="section-title">📝 Descrição</div>
                            <div style="background: #f9fafb; padding: 12px; border-radius: 8px; font-size: 14px; color: #374151; line-height: 1.5;">
                                ${escapeHTML(a.entrada?.descricao || '-').replace(/\n/g, '<br>')}
                            </div>
                            
                            ${a.entrada?.observacoes ? `
                                <div class="section-title">💬 Observações</div>
                                <div style="background: #f9fafb; padding: 12px; border-radius: 8px; font-size: 13px; color: #4b5563;">
                                    ${escapeHTML(a.entrada.observacoes).replace(/\n/g, '<br>')}
                                </div>` : ''}
                            
                            ${detalhesHTML}
                            ${assinaturaHTML}
                            ${remarcacoesHTML}
                            
                            ${a.saida ? `
                                <div class="section-title">🎯 Resultado</div>
                                <div class="info-row">
                                    <div class="info-label">Resultado:</div>
                                    <div class="info-value"><strong>${escapeHTML(a.saida.resultadoTexto || a.saida.resultado)}</strong></div>
                                </div>
                                <div class="info-row">
                                    <div class="info-label">Data de Saída:</div>
                                    <div class="info-value">${a.saida.dataHoraFormatada || '-'}</div>
                                </div>` : ''}
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                                <i class="fas fa-times"></i> Fechar
                            </button>
                            <button type="button" class="btn btn-info" onclick="imprimirAtendimento('${a.id}')">
                                <i class="fas fa-print"></i> Imprimir
                            </button>
                            ${a.status === 'em_andamento' ? `
                                <button type="button" class="btn btn-secondary" onclick="fecharVerAtendimento(); abrirEditarAtendimento('${a.id}')">
                                    <i class="fas fa-edit"></i> Editar
                                </button>
                                <button type="button" class="btn btn-warning" onclick="fecharVerAtendimento(); abrirRemarcar('${a.id}')">
                                    <i class="fas fa-calendar-plus"></i> Remarcar
                                </button>
                                <button type="button" class="btn btn-success" onclick="fecharVerAtendimento(); abrirFinalizacao('${a.id}')">
                                    <i class="fas fa-check"></i> Finalizar
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>`;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        new bootstrap.Modal(safeGet('modalVerAtendimento')).show();
    } catch (error) {
        mostrarToastConcluido('Erro ao carregar detalhes', 'error');
    }
}

function fecharVerAtendimento() {
    const modal = bootstrap.Modal.getInstance(safeGet('modalVerAtendimento'));
    if (modal) modal.hide();
    setTimeout(() => { const el = safeGet('modalVerAtendimento'); if (el) el.remove(); }, 300);
}

// ============================================
// 🖨️ IMPRESSÃO DE ATENDIMENTO (COM ASSINATURA)
// ============================================
async function imprimirAtendimento(atendimentoId) {
    if (!atendimentoId) return;
    
    try {
        const response = await fetch(`/api/assistente-social/atendimento/${atendimentoId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (!data.success || !data.atendimento) {
            mostrarToastConcluido('Erro ao carregar atendimento', 'error');
            return;
        }
        
        const a = data.atendimento;
        
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
            console.info('QR Code não pôde ser carregado');
        }
        
        const win = window.open('', '_blank');
        win.document.write(gerarHTMLImpressaoAS(a, qr));
        win.document.close();
        win.onload = () => setTimeout(() => win.print(), 500);
    } catch (e) {
        console.error(e);
        mostrarToastConcluido('Erro ao imprimir atendimento', 'error');
    }
}

function gerarHTMLImpressaoAS(a, qrCodeUrl) {
    const logo = '/uploads/logo-iema.png';
    const carimbo = '/icons/assinatura_assistente_social.ico';
    const dataGeracao = new Date().toLocaleString('pt-BR');
    
    const entrada = new Date(a.entrada.dataHora);
    const dataExt = entrada.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const horaExt = entrada.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    
    const badgeStatus = a.status === 'finalizado'
        ? '<span class="badge-finalizado">✅ FINALIZADO</span>'
        : '<span class="badge-andamento">⏳ EM ANDAMENTO</span>';
    
    const temAssinaturaDigital = a.entrada?.temAssinatura && a.entrada?.assinaturaBase64;
    const assinaturaHTML = temAssinaturaDigital
        ? `<img class="assinatura-img" src="${a.entrada.assinaturaBase64}" alt="Assinatura">`
        : '';
    
    let detalhesHTML = '';
    if (a.detalhes && Object.keys(a.detalhes).length > 0) {
        const mapaDetalhes = {
            contextoFamiliar: 'Contexto Familiar',
            historicoAnterior: 'Histórico Anterior',
            profissionaisEnvolvidos: 'Profissionais Envolvidos',
            condicaoSocial: 'Condição Social',
            encaminhadoPara: 'Encaminhado Para',
            motivoEncaminhamento: 'Motivo do Encaminhamento',
            agendadoPara: 'Agendado Para',
            tipoIntervencao: 'Tipo de Intervenção',
            metodosUtilizados: 'Métodos Utilizados',
            duracaoSessao: 'Duração da Sessão (min)',
            modalidadeAtendimento: 'Modalidade',
            participantesAtendimento: 'Participantes',
            tipoTarefaOutros: 'Especificação',
            providenciasTomadas: 'Providências',
            proximosPassos: 'Próximos Passos'
        };
        
        const linhas = [];
        Object.entries(a.detalhes).forEach(([key, value]) => {
            if (!value || (Array.isArray(value) && value.length === 0)) return;
            const label = mapaDetalhes[key] || key;
            let valor = value;
            if (Array.isArray(value)) valor = value.join(', ');
            if (typeof value === 'boolean') valor = value ? 'Sim' : 'Não';
            if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/)) {
                try { valor = new Date(value).toLocaleDateString('pt-BR'); } catch(e){}
            }
            linhas.push(`<span class="det-item"><strong>${escapeHTML(label)}:</strong> ${escapeHTML(String(valor))}</span>`);
        });
        
        if (linhas.length > 0) {
            detalhesHTML = `
                <div class="section-title">📋 Detalhes</div>
                <div class="detalhes-compactos">${linhas.join('')}</div>`;
        }
    }
    
    let saidaHTML = '';
    if (a.saida) {
        saidaHTML = `
            <div class="section-title">✅ Resultado Final</div>
            <div class="linha-compacta">
                <span><strong>Resultado:</strong> ${escapeHTML(a.saida.resultadoTexto || a.saida.resultado || '-')}</span>
                <span><strong>Data:</strong> ${a.saida.dataHoraFormatada || '-'}</span>
            </div>`;
    }
    
    let remarcacoesHTML = '';
    if (a.remarcacoes && a.remarcacoes.length > 0) {
        remarcacoesHTML = `
            <div class="section-title">📅 Remarcações</div>
            <table class="tabela-remarcacoes">
                <thead><tr><th style="width:5%;">#</th><th style="width:15%;">Data</th><th style="width:10%;">Hora</th><th style="width:15%;">Status</th><th>Motivo</th></tr></thead>
                <tbody>
                    ${a.remarcacoes.slice(0, 5).map((r, i) => `
                        <tr>
                            <td><strong>${i + 1}</strong></td>
                            <td>${formatarDataBR(r.dataRemarcacao)}</td>
                            <td>${r.horarioRemarcacao || '-'}</td>
                            <td><span class="status-remarcacao status-${r.status}">${r.status === 'pendente' ? '⏳' : r.status === 'realizado' ? '✅' : '❌'}</span></td>
                            <td>${escapeHTML((r.motivoRemarcacao || '-').substring(0, 60))}</td>
                        </tr>`).join('')}
                </tbody>
            </table>`;
    }
    
    return `<!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <title>Atendimento Assistente Social - ${escapeHTML(a.alunoNome)}</title>
        <style>
            @page { size: A4 portrait; margin: 8mm; }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: 'Times New Roman', Times, serif; font-size: 9.5pt; line-height: 1.25; color: #000; }
            
            .header { text-align: center; border-bottom: 1.5px double #000; padding-bottom: 4px; margin-bottom: 6px; }
            .header img { max-width: 100%; max-height: 14mm; object-fit: contain; display: block; margin: 0 auto 2px; }
            .header h1 { font-size: 10pt; text-transform: uppercase; font-weight: bold; margin: 2px 0 0; }
            .header p { font-size: 8pt; margin: 1px 0 0; }
            
            .titulo { text-align: center; font-size: 11pt; font-weight: bold; background: #ede9fe; padding: 4px 8px; border: 1.5px solid #000; margin: 6px 0 3px; text-transform: uppercase; letter-spacing: 0.5px; }
            .status-badge { text-align: center; margin: 0 0 5px; }
            .badge-finalizado { background: #d1fae5; color: #065f46; padding: 2px 10px; border-radius: 12px; font-size: 8pt; font-weight: bold; border: 1px solid #10b981; display: inline-block; }
            .badge-andamento { background: #fef3c7; color: #92400e; padding: 2px 10px; border-radius: 12px; font-size: 8pt; font-weight: bold; border: 1px solid #f59e0b; display: inline-block; }
            
            .aluno-box { display: flex; align-items: center; gap: 8px; padding: 5px 8px; background: #f5f3ff; border: 1px solid #ddd6fe; border-radius: 5px; margin-bottom: 6px; }
            .aluno-foto { width: 38px; height: 38px; border-radius: 50%; object-fit: cover; border: 1.5px solid #8b5cf6; flex-shrink: 0; }
            .aluno-info { flex: 1; }
            .aluno-nome { font-size: 10pt; font-weight: bold; color: #5b21b6; margin-bottom: 1px; }
            .aluno-detalhes { font-size: 8pt; color: #374151; }
            
            .section-title { font-size: 9pt; font-weight: bold; background: #e8e8e8; padding: 2px 6px; border-left: 3px solid #8b5cf6; margin: 5px 0 3px; }
            
            .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 3px 12px; margin: 3px 0 5px; font-size: 8.5pt; }
            .info-item { display: flex; gap: 4px; }
            .info-label { font-weight: bold; white-space: nowrap; }
            .info-value { flex: 1; }
            
            .descricao-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 4px; padding: 5px 8px; font-size: 8.5pt; line-height: 1.3; min-height: 30px; max-height: 80px; overflow: hidden; word-wrap: break-word; }
            
            .detalhes-compactos { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 4px; padding: 4px 6px; font-size: 8pt; line-height: 1.35; }
            .det-item { display: inline-block; margin-right: 10px; margin-bottom: 2px; }
            
            .linha-compacta { display: flex; justify-content: space-between; gap: 10px; padding: 3px 6px; background: #f9fafb; border-radius: 4px; font-size: 8.5pt; margin-bottom: 3px; }
            
            .tabela-remarcacoes { width: 100%; border-collapse: collapse; font-size: 7.5pt; margin-top: 2px; }
            .tabela-remarcacoes th { background: #8b5cf6; color: white; padding: 2px 4px; text-align: left; border: 1px solid #7c3aed; font-size: 7.5pt; }
            .tabela-remarcacoes td { padding: 2px 4px; border: 1px solid #ddd; }
            .tabela-remarcacoes tr:nth-child(even) { background: #f9fafb; }
            .status-remarcacao { padding: 1px 5px; border-radius: 8px; font-size: 7pt; font-weight: bold; }
            .status-pendente { background: #fef3c7; color: #92400e; }
            .status-realizado { background: #d1fae5; color: #065f46; }
            .status-cancelado { background: #fee2e2; color: #991b1b; }
            
            .assinaturas { display: flex; justify-content: space-around; margin-top: 25px; gap: 20px; }
            .assinatura { flex: 0 0 42%; text-align: center; }
            
            .assinatura-container-relatorio { position: relative; min-height: 18mm; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 0; }
            .assinatura-container-relatorio::after { content: ''; position: absolute; bottom: 0; left: 0; right: 0; border-bottom: 1px solid #000; }
            .assinatura-img { max-height: 14mm; max-width: 100%; object-fit: contain; position: relative; z-index: 2; margin-bottom: 1mm; }
            .carimbo-overlay { position: absolute; bottom: 1mm; left: 50%; transform: translateX(-50%); max-height: 15mm; max-width: 45mm; object-fit: contain; opacity: 0.95; pointer-events: none; z-index: 1; }
            .assinatura-linha { padding-top: 3px; font-size: 8pt; margin-top: 2px; }
            
            .qr-code { text-align: center; margin-top: 10px; }
            .qr-code img { width: 22mm; height: 22mm; border: 1.5px solid #000; padding: 2px; display: block; margin: 0 auto; }
            .qr-code p { font-size: 7.5pt; margin: 2px 0 0 0; color: #444; font-weight: bold; }
            
            .footer { text-align: center; margin-top: 8px; padding-top: 3px; border-top: 1px solid #ccc; font-size: 6.5pt; color: #666; }
            .footer p { margin: 1px 0; }
            
            .btn-print { display: block; margin: 10px auto; padding: 8px 20px; background: #8b5cf6; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 12px; font-family: Arial, sans-serif; }
            .btn-print:hover { background: #7c3aed; }
            
            @media print { .no-print { display: none !important; } body { padding: 0; } }
        </style>
    </head>
    <body>
        <button class="btn-print no-print" onclick="window.print()">🖨️ Imprimir</button>
        
        <div class="header">
            <img src="${logo}" alt="IEMA" onerror="this.style.display='none'">
            <h1>IEMA Pleno: São Luís - Centro</h1>
            <p>Sistema de Atendimentos — Assistente Social</p>
        </div>
        
        <div class="titulo">🤝 Atendimento Assistente Social</div>
        <div class="status-badge">${badgeStatus}</div>
        
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
        
        <div class="section-title">📌 Dados do Atendimento</div>
        <div class="info-grid">
            <div class="info-item"><span class="info-label">Tipo:</span><span class="info-value"><strong>${escapeHTML(a.tipoTarefaLabel || '-')}</strong></span></div>
            <div class="info-item"><span class="info-label">Data:</span><span class="info-value">${dataExt}</span></div>
            <div class="info-item"><span class="info-label">Hora:</span><span class="info-value">${horaExt}</span></div>
            <div class="info-item"><span class="info-label">Gravidade:</span><span class="info-value"><strong>${escapeHTML((a.entrada?.gravidade || 'media').toUpperCase())}</strong></span></div>
            <div class="info-item"><span class="info-label">Prioridade:</span><span class="info-value"><strong>${escapeHTML((a.prioridade || 'normal').toUpperCase())}</strong></span></div>
            <div class="info-item"><span class="info-label">Registrado por:</span><span class="info-value">${escapeHTML(a.entrada?.registradoPor || '-')}</span></div>
        </div>
        
        <div class="section-title">📝 Descrição do Ocorrido</div>
        <div class="descricao-box">${escapeHTML(a.entrada?.descricao || '-').replace(/\n/g, '<br>')}</div>
        
        ${a.entrada?.observacoes ? `
            <div class="section-title">💬 Observações</div>
            <div class="descricao-box" style="min-height: 20px; max-height: 40px;">${escapeHTML(a.entrada.observacoes).replace(/\n/g, '<br>')}</div>
        ` : ''}
        
        ${detalhesHTML}
        ${saidaHTML}
        ${remarcacoesHTML}
        
        <div class="assinaturas">
            <div class="assinatura">
                <div class="assinatura-container-relatorio">
                    ${assinaturaHTML}
                </div>
                <div class="assinatura-linha">Assinatura do Responsável</div>
            </div>
            <div class="assinatura">
                <div class="assinatura-container-relatorio">
                    <img class="carimbo-overlay" src="${carimbo}" alt="Carimbo" onerror="this.style.display='none'">
                </div>
                <div class="assinatura-linha">Assistente Social</div>
            </div>
        </div>
        
        ${qrCodeUrl ? `
            <div class="qr-code">
                <img src="${qrCodeUrl}" alt="QR Code">
                <p>Identificação do Aluno</p>
            </div>
        ` : ''}
        
        <div class="footer">
            <p>Documento gerado em <strong>${dataGeracao}</strong> — EducaPleno — Assistente Social</p>
        </div>
    </body>
    </html>`;
}

// ============================================
// 🗑️ GERENCIAR ATENDIMENTOS CONCLUÍDOS
// ============================================
async function carregarAtendimentosConcluidos(pagina = 1) {
    const container = safeGet('listaConcluidos');
    if (!container) return;
    __concluidosPaginaAtual = pagina;
    
    const busca = (safeGet('filtroConcluidosBusca')?.value || '').trim().toLowerCase();
    const tipo = safeGet('filtroConcluidosTipo')?.value || '';
    const resultado = safeGet('filtroConcluidosResultado')?.value || '';
    
    container.innerHTML = `
        <div class="text-center py-4">
            <div class="spinner-border spinner-border-sm text-primary" role="status"></div>
            <p class="text-muted mt-2 mb-0">Carregando atendimentos...</p>
        </div>`;
    
    try {
        const params = new URLSearchParams();
        params.append('status', 'finalizado');
        params.append('limit', __concluidosPorPagina);
        params.append('page', pagina);
        if (tipo) params.append('tipo', tipo);
        
        const response = await fetch(`/api/assistente-social/atendimentos?${params.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (!data.success || !Array.isArray(data.atendimentos)) {
            container.innerHTML = `<div class="mostrarToastConcluido mostrarToastConcluido-warning">Nenhum atendimento concluído encontrado</div>`;
            return;
        }
        
        let lista = data.atendimentos;
        
        if (busca) {
            lista = lista.filter(a =>
                (a.alunoNome || '').toLowerCase().includes(busca) ||
                (a.alunoMatricula || '').toLowerCase().includes(busca)
            );
        }
        if (resultado) {
            lista = lista.filter(a => a.saida?.resultado === resultado);
        }
        
        __concluidosDados = lista;
        __concluidosTotal = data.total || lista.length;
        
        atualizarContadorConcluidos(lista.length);
        renderizarListaConcluidos(lista);
        renderizarPaginacaoConcluidos(data.totalPages || 1);
    } catch (error) {
        console.error('Erro ao carregar concluídos:', error);
        container.innerHTML = `<div class="mostrarToastConcluido mostrarToastConcluido-danger"><i class="fas fa-exclamation-triangle"></i> Erro ao carregar atendimentos</div>`;
    }
}

function atualizarContadorConcluidos(total) {
    const el = safeGet('contadorConcluidos');
    if (el) el.textContent = total;
}

function renderizarListaConcluidos(lista) {
    const container = safeGet('listaConcluidos');
    if (!container) return;
    
    if (lista.length === 0) {
        container.innerHTML = `
            <div class="text-center py-4 text-muted">
                <i class="fas fa-inbox fa-3x mb-3" style="color:#cbd5e1;"></i>
                <p>Nenhum atendimento corresponde aos filtros</p>
            </div>`;
        return;
    }
    
    const resultadoLabel = {
        'resolvido': { label: 'Resolvido', color: '#10b981', icon: '✅' },
        'em_acompanhamento': { label: 'Em Acompanhamento', color: '#3b82f6', icon: '🔄' },
        'reincidente': { label: 'Reincidente', color: '#f59e0b', icon: '⚠️' },
        'encaminhado': { label: 'Encaminhado', color: '#8b5cf6', icon: '↗️' },
        'pendente': { label: 'Pendente', color: '#6b7280', icon: '⏳' }
    };
    
    container.innerHTML = `
        <div class="table-responsive">
            <table class="table table-hover table-sm align-middle">
                <thead style="background: #f5f3ff;">
                    <tr>
                        <th style="width: 30%;">Aluno</th>
                        <th style="width: 20%;">Tipo</th>
                        <th style="width: 15%;">Entrada</th>
                        <th style="width: 15%;">Saída</th>
                        <th style="width: 12%;">Resultado</th>
                        <th style="width: 8%; text-align: center;">Ações</th>
                    </tr>
                </thead>
                <tbody>
                    ${lista.map(a => {
                        const r = resultadoLabel[a.saida?.resultado] || { label: a.saida?.resultado || '-', color: '#6b7280', icon: '•' };
                        return `
                            <tr data-id="${a.id}">
                                <td>
                                    <div class="d-flex align-items-center gap-2">
                                        <img src="${gerarAvatarSVG(a.alunoNome || '?')}" style="width: 32px; height: 32px; border-radius: 50%;" alt="">
                                        <div>
                                            <strong style="font-size: 13px;">${escapeHTML(a.alunoNome || '')}</strong>
                                            <br><small class="text-muted" style="font-size: 11px;">${escapeHTML(a.alunoMatricula || '')} • ${escapeHTML(a.alunoTurma || '')}</small>
                                        </div>
                                    </div>
                                </td>
                                <td><span class="badge" style="background: #8b5cf6; font-size: 10px;">${escapeHTML(a.tipoTarefaLabel || '')}</span></td>
                                <td><small>${a.dataEntradaFormatada || (a.dataEntrada ? new Date(a.dataEntrada).toLocaleDateString('pt-BR') : '-')}</small></td>
                                <td><small>${a.saida?.dataHoraFormatada || '-'}</small></td>
                                <td><span class="badge" style="background: ${r.color}; font-size: 10px;">${r.icon} ${escapeHTML(r.label)}</span></td>
                                <td class="text-center">
                                    <div class="d-flex gap-1 justify-content-center">
                                        <button class="btn btn-sm btn-info" onclick="verAtendimento('${a.id}')" title="Ver detalhes"><i class="fas fa-eye"></i></button>
                                        <button class="btn btn-sm btn-danger" onclick="excluirAtendimentoConcluido('${a.id}', '${escapeHTML(a.alunoNome || '')}')" title="Excluir"><i class="fas fa-trash"></i></button>
                                    </div>
                                </td>
                            </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;
}

function renderizarPaginacaoConcluidos(totalPaginas) {
    const container = safeGet('paginacaoConcluidos');
    const info = safeGet('infoPaginacaoConcluidos');
    if (!container) return;
    
    if (info) info.textContent = `Página ${__concluidosPaginaAtual} de ${totalPaginas}`;
    
    if (totalPaginas <= 1) { container.innerHTML = ''; return; }
    
    let html = '<nav><ul class="pagination pagination-sm mb-0">';
    html += `<li class="page-item ${__concluidosPaginaAtual === 1 ? 'disabled' : ''}"><a class="page-link" href="#" onclick="event.preventDefault(); ${__concluidosPaginaAtual > 1 ? `carregarAtendimentosConcluidos(${__concluidosPaginaAtual - 1})` : ''}"><i class="fas fa-chevron-left"></i></a></li>`;
    
    const inicio = Math.max(1, __concluidosPaginaAtual - 2);
    const fim = Math.min(totalPaginas, __concluidosPaginaAtual + 2);
    
    if (inicio > 1) {
        html += `<li class="page-item"><a class="page-link" href="#" onclick="event.preventDefault(); carregarAtendimentosConcluidos(1)">1</a></li>`;
        if (inicio > 2) html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
    }
    
    for (let i = inicio; i <= fim; i++) {
        html += `<li class="page-item ${i === __concluidosPaginaAtual ? 'active' : ''}"><a class="page-link" href="#" onclick="event.preventDefault(); carregarAtendimentosConcluidos(${i})">${i}</a></li>`;
    }
    
    if (fim < totalPaginas) {
        if (fim < totalPaginas - 1) html += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
        html += `<li class="page-item"><a class="page-link" href="#" onclick="event.preventDefault(); carregarAtendimentosConcluidos(${totalPaginas})">${totalPaginas}</a></li>`;
    }
    
    html += `<li class="page-item ${__concluidosPaginaAtual === totalPaginas ? 'disabled' : ''}"><a class="page-link" href="#" onclick="event.preventDefault(); ${__concluidosPaginaAtual < totalPaginas ? `carregarAtendimentosConcluidos(${__concluidosPaginaAtual + 1})` : ''}"><i class="fas fa-chevron-right"></i></a></li>`;
    html += '</ul></nav>';
    container.innerHTML = html;
}

async function excluirAtendimentoConcluido(atendimentoId, alunoNome) {
    if (!atendimentoId) return;
    
    const confirmar1 = await confirm(`⚠️ Tem certeza que deseja EXCLUIR este atendimento?\n\nAluno: ${alunoNome}\n\nEsta ação não pode ser desfeita!`);
    if (!confirmar1) return;
    
    const confirmar2 = await confirm('⚠️ ÚLTIMA CONFIRMAÇÃO!\n\nTodos os dados serão perdidos permanentemente.');
    if (!confirmar2) return;
    
    try {
        const response = await fetch(`/api/assistente-social/atendimento/${atendimentoId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success) {
            const row = document.querySelector(`tr[data-id="${atendimentoId}"]`);
            if (row) {
                row.style.transition = 'all 0.3s';
                row.style.opacity = '0';
                row.style.transform = 'translateX(-20px)';
                setTimeout(() => {
                    row.remove();
                    const contador = safeGet('contadorConcluidos');
                    if (contador) {
                        const atual = parseInt(contador.textContent) || 0;
                        contador.textContent = Math.max(0, atual - 1);
                    }
                    const tabela = document.querySelector('#listaConcluidos tbody');
                    if (tabela && tabela.children.length === 0) {
                        carregarAtendimentosConcluidos(__concluidosPaginaAtual);
                    }
                }, 300);
            }
            mostrarToastConcluido('✅ Atendimento excluído com sucesso!', 'success');
            carregarDashboard();
            carregarLembretes();
        } else {
            console.error('❌ ' + (data.error || 'Erro'));
        }
    } catch (error) {
        console.error('Erro ao excluir atendimento:', error);
    }
}

// ============================================
// 🍞 TOAST
// ============================================
function mostrarToastConcluido(mensagem, tipo = 'info') {
    const msg = String(mensagem || '');
    let tipoFinal = tipo;
    
    if (msg.trim().startsWith('✅')) {
        tipoFinal = 'success';
    } else if (msg.trim().startsWith('❌') || msg.trim().startsWith('⚠️')) {
        tipoFinal = msg.trim().startsWith('⚠️') ? 'warning' : 'error';
    }
    
    const cores = {
        success: '#10b981',
        error: '#ef4444',
        warning: '#f59e0b',
        info: '#8b5cf6'
    };
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-times-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };
    
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed; bottom: 20px; right: 20px;
        background: ${cores[tipoFinal] || cores.info}; color: white;
        padding: 12px 20px; border-radius: 10px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.2); z-index: 99999;
        font-size: 14px; font-weight: 600;
        display: flex; align-items: center; gap: 10px;
        animation: slideInRight 0.3s ease-out; max-width: 400px;`;
    toast.innerHTML = `<i class="fas ${icons[tipoFinal] || icons.info}"></i> ${msg}`;
    
    if (!document.getElementById('toastAnimation')) {
        const style = document.createElement('style');
        style.id = 'toastAnimation';
        style.textContent = `
            @keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
            @keyframes slideOutRight { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 0; } }`;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease-in';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// ============================================
// ⚠️ EXCLUSÃO EM MASSA
// ============================================
function abrirExclusaoEmMassa() {
    const modalHtml = `
        <div class="modal fade" id="modalExclusaoMassa" tabindex="-1">
            <div class="modal-dialog"><div class="modal-content">
                <div class="modal-header bg-danger text-white">
                    <h5 class="modal-title"><i class="fas fa-exclamation-triangle"></i> Exclusão em Massa</h5>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <div class="mostrarToastConcluido mostrarToastConcluido-danger">
                        <strong>⚠️ ATENÇÃO!</strong><br>
                        Esta ação é <strong>IRREVERSÍVEL</strong>. Todos os atendimentos que corresponderem aos filtros serão <strong>PERMANENTEMENTE EXCLUÍDOS</strong>.
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Excluir atendimentos finalizados antes de:</label>
                        <input type="date" id="massaDataCorte" class="form-control" value="${new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}">
                        <small class="text-muted">Todos os atendimentos finalizados antes desta data serão excluídos</small>
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Digite "CONFIRMAR" para prosseguir:</label>
                        <input type="text" id="massaConfirmacao" class="form-control" placeholder="Digite CONFIRMAR" autocomplete="off">
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                    <button type="button" class="btn btn-danger" onclick="confirmarExclusaoMassa()"><i class="fas fa-trash-alt"></i> Excluir Definitivamente</button>
                </div>
            </div></div>
        </div>`;
    const old = safeGet('modalExclusaoMassa');
    if (old) old.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    new bootstrap.Modal(safeGet('modalExclusaoMassa')).show();
}

async function confirmarExclusaoMassa() {
    const dataCorte = safeGet('massaDataCorte')?.value;
    const confirmacao = (safeGet('massaConfirmacao')?.value || '').trim().toUpperCase();
    if (confirmacao !== 'CONFIRMAR') { mostrarToastConcluido('⚠️ Digite "CONFIRMAR" para prosseguir', 'error'); return; }
    if (!dataCorte) { mostrarToastConcluido('⚠️ Selecione uma data de corte', 'error'); return; }
    
    const modal = bootstrap.Modal.getInstance(safeGet('modalExclusaoMassa'));
    if (modal) modal.hide();
    
    try {
        const response = await fetch('/api/assistente-social/atendimentos/exclusao-massa', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ dataCorte, status: 'finalizado', confirmacao: 'CONFIRMAR' })
        });
        const ct = response.headers.get('content-type') || '';
        if (!ct.includes('application/json')) { mostrarToastConcluido('⚠️ Funcionalidade indisponível no servidor.', 'error'); return; }
        const data = await response.json();
        if (data.success) {
            mostrarToastConcluido(`✅ ${data.excluidos || 0} atendimentos excluídos!`, 'success');
            carregarAtendimentosConcluidos(1);
            carregarDashboard();
        } else mostrarToastConcluido('❌ ' + (data.error || 'Erro'), 'error');
    } catch (error) { mostrarToastConcluido('Erro ao excluir em massa', 'error'); }
}

// ============================================
// DASHBOARD
// ============================================
async function carregarDashboard() {
    try {
        const response = await fetch('/api/assistente-social/dashboard', { headers: { 'Authorization': `Bearer ${token}` } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!data.success) return;
        
        safeSetText('totalHoje', data.metricas?.hoje || 0);
        safeSetText('totalEmAndamento', data.metricas?.emAndamento || 0);
        safeSetText('totalFinalizadosHoje', data.metricas?.finalizadosHoje || 0);
        safeSetText('totalGeral', data.metricas?.total || 0);
        
        const ctxTipos = safeGet('chartTipos');
        if (ctxTipos && data.porTipo) {
            if (dashboardCharts.tipos) try { dashboardCharts.tipos.destroy(); } catch(e){}
            dashboardCharts.tipos = new Chart(ctxTipos.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: data.porTipo.map(t => t.label || ''),
                    datasets: [{ label: 'Ocorrências', data: data.porTipo.map(t => t.count || 0),
                        backgroundColor: ['#8b5cf6', '#7c3aed', '#6d28d9', '#5b21b6', '#a78bfa', '#c4b5fd'], borderRadius: 8 }]
                },
                options: { responsive: true, maintainAspectRatio: true, indexAxis: 'y', plugins: { legend: { display: false } } }
            });
        }
        
        const ctxGrav = safeGet('chartGravidade');
        if (ctxGrav && data.porGravidade) {
            if (dashboardCharts.gravidade) try { dashboardCharts.gravidade.destroy(); } catch(e){}
            const lbl = { baixa: 'Baixa', media: 'Média', alta: 'Alta', critica: 'Crítica' };
            const cor = { baixa: '#10b981', media: '#f59e0b', alta: '#ef4444', critica: '#7f1d1d' };
            dashboardCharts.gravidade = new Chart(ctxGrav.getContext('2d'), {
                type: 'doughnut',
                data: { labels: data.porGravidade.map(g => lbl[g.gravidade] || g.gravidade),
                    datasets: [{ data: data.porGravidade.map(g => g.count || 0), backgroundColor: data.porGravidade.map(g => cor[g.gravidade] || '#6b7280') }] },
                options: { responsive: true, maintainAspectRatio: true }
            });
        }
        
        const ctxAt = safeGet('chartAtendimentos');
        if (ctxAt && data.tendencias?.ultimos7Dias) {
            if (dashboardCharts.atendimentos) try { dashboardCharts.atendimentos.destroy(); } catch(e){}
            dashboardCharts.atendimentos = new Chart(ctxAt.getContext('2d'), {
                type: 'line',
                data: { labels: data.tendencias.ultimos7Dias.map(d => d.dia || ''),
                    datasets: [{ label: 'Ocorrências', data: data.tendencias.ultimos7Dias.map(d => d.atendimentos || 0),
                        borderColor: '#8b5cf6', backgroundColor: 'rgba(139, 92, 246, 0.1)', fill: true, tension: 0.4 }] },
                options: { responsive: true, maintainAspectRatio: true }
            });
        }
        
        const ctxTurmas = safeGet('chartTurmas');
        if (ctxTurmas && data.tendencias?.porTurma) {
            if (dashboardCharts.turmas) try { dashboardCharts.turmas.destroy(); } catch(e){}
            dashboardCharts.turmas = new Chart(ctxTurmas.getContext('2d'), {
                type: 'bar',
                data: { labels: data.tendencias.porTurma.map(t => t.turma || 'Sem turma'),
                    datasets: [{ label: 'Ocorrências', data: data.tendencias.porTurma.map(t => t.count || 0),
                        backgroundColor: '#c4b5fd', borderRadius: 8 }] },
                options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } } }
            });
        }
        
        const reinc = safeGet('alunosReincidentes');
        if (reinc) {
            const lista = data.tendencias?.alunosReincidentes || [];
            if (lista.length > 0) {
                reinc.innerHTML = `<div class="table-responsive"><table class="table table-sm">
                    <thead><tr><th>Aluno</th><th>Turma</th><th>Ocorrências</th></tr></thead>
                    <tbody>${lista.map(a => `<tr><td><strong>${escapeHTML(a.alunoNome || '')}</strong></td><td>${escapeHTML(a.alunoTurma || '-')}</td><td><span class="badge bg-danger">${a.count || 0}</span></td></tr>`).join('')}</tbody>
                </table></div>`;
            } else reinc.innerHTML = `<p class="text-muted text-center py-3"><i class="fas fa-check-circle text-success"></i> Nenhum aluno reincidente</p>`;
        }
    } catch (error) { console.error('Erro no dashboard:', error); }
}

// ============================================
// RELATÓRIOS
// ============================================
async function carregarTurmasParaRelatorio() {
    try {
        const response = await fetch('/api/assistente-social/turmas', { headers: { 'Authorization': `Bearer ${token}` } });
        if (!response.ok) return;
        const data = await response.json();
        const select = safeGet('filtroTurma');
        if (!select) return;
        if (data.success && Array.isArray(data.turmas)) {
            const valorAtual = select.value;
            select.innerHTML = '<option value="">Selecione...</option>';
            data.turmas.forEach(t => { const o = document.createElement('option'); o.value = t; o.textContent = t; select.appendChild(o); });
            if (valorAtual && data.turmas.includes(valorAtual)) select.value = valorAtual;
        }
    } catch (error) {}
}

function toggleRelatorioFiltros() {
    const tipo = safeGet('tipoRelatorio')?.value;
    const divT = safeGet('filtroTurmaDiv');
    const divA = safeGet('filtroAlunoDiv');
    if (divT) divT.style.display = tipo === 'turma' ? 'block' : 'none';
    if (divA) divA.style.display = tipo === 'aluno' ? 'block' : 'none';
    
    const btnCSV = safeGet('btnExportarCSVAS');
    const btnPDF = safeGet('btnExportarPDFAS');
    if (btnCSV) btnCSV.disabled = true;
    if (btnPDF) btnPDF.disabled = true;
    relatorioData = null;
    
    if (tipo === 'turma') {
        const s = safeGet('filtroTurma');
        if (s && s.options.length <= 1) carregarTurmasParaRelatorio();
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
    const hidden = safeGet('filtroAluno');
    if (!input || !listEl || !hidden || input.dataset.autocompleteInit === 'true') return;
    input.dataset.autocompleteInit = 'true';
    
    input.addEventListener('input', (e) => {
        const termo = e.target.value.trim();
        hidden.value = '';
        const info = safeGet('alunoSelecionadoInfo');
        if (info) info.textContent = '';
        if (termo.length < 1) { listEl.style.display = 'none'; return; }
        filtrarAlunosAutocomplete(termo);
    });
    input.addEventListener('focus', () => { const t = input.value.trim(); if (t.length >= 1) filtrarAlunosAutocomplete(t); });
    input.addEventListener('keydown', (e) => {
        if (listEl.style.display === 'none') return;
        if (e.key === 'ArrowDown') { e.preventDefault(); __indiceSelecionado = Math.min(__indiceSelecionado + 1, __alunosFiltrados.length - 1); destacarItemAutocomplete(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); __indiceSelecionado = Math.max(__indiceSelecionado - 1, -1); destacarItemAutocomplete(); }
        else if (e.key === 'Enter') { e.preventDefault(); if (__indiceSelecionado >= 0 && __alunosFiltrados[__indiceSelecionado]) selecionarAlunoAutocomplete(__alunosFiltrados[__indiceSelecionado]); }
        else if (e.key === 'Escape') listEl.style.display = 'none';
    });
    document.addEventListener('click', (e) => {
        if (!listEl.contains(e.target) && !input.contains(e.target)) listEl.style.display = 'none';
    });
}

async function carregarAlunosParaRelatorio() {
    if (__alunosCarregados && __alunosParaRelatorio.length > 0) return;
    const inputBusca = safeGet('buscaAlunoRelatorio');
    if (inputBusca) { inputBusca.placeholder = 'Carregando...'; inputBusca.disabled = true; }
    try {
        const turmasRes = await fetch('/api/assistente-social/turmas', { headers: { 'Authorization': `Bearer ${token}` } });
        const turmasData = await turmasRes.json();
        if (!turmasData.success || !Array.isArray(turmasData.turmas)) return;
        const todos = [];
        for (const turma of turmasData.turmas) {
            try {
                const res = await fetch(`/api/assistente-social/alunos-por-turma?turma=${encodeURIComponent(turma)}`, { headers: { 'Authorization': `Bearer ${token}` } });
                const data = await res.json();
                if (data.success && Array.isArray(data.alunos)) {
                    data.alunos.forEach(a => todos.push({ id: a.id, nome: a.nome, matricula: a.matricula || '', turma: a.turma || turma, curso: a.curso || '' }));
                }
            } catch (e) {}
        }
        todos.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
        __alunosParaRelatorio = todos;
        __alunosCarregados = true;
        if (inputBusca) { inputBusca.placeholder = 'Digite o nome...'; inputBusca.disabled = false; }
    } catch (error) { if (inputBusca) { inputBusca.placeholder = 'Erro'; inputBusca.disabled = false; } }
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
    const t = termo.toLowerCase();
    __alunosFiltrados = __alunosParaRelatorio.filter(a => (a.nome || '').toLowerCase().includes(t) || (a.matricula || '').toLowerCase().includes(t)).slice(0, 10);
    __indiceSelecionado = -1;
    if (__alunosFiltrados.length === 0) { listEl.innerHTML = `<div class="autocomplete-aluno-empty">Nenhum aluno</div>`; listEl.style.display = 'block'; return; }
    listEl.innerHTML = __alunosFiltrados.map((a, i) => `
        <div class="autocomplete-aluno-item" data-index="${i}">
            <div class="aluno-nome">${destacarTermo(a.nome, termo)}</div>
            <div class="aluno-info"><span class="aluno-turma">${escapeHTML(a.turma || 'Sem turma')}</span>${a.matricula ? `<span class="aluno-matricula">${escapeHTML(a.matricula)}</span>` : ''}</div>
        </div>`).join('');
    listEl.querySelectorAll('.autocomplete-aluno-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            const i = parseInt(item.getAttribute('data-index'));
            if (__alunosFiltrados[i]) selecionarAlunoAutocomplete(__alunosFiltrados[i]);
        });
        item.addEventListener('mouseenter', () => { __indiceSelecionado = parseInt(item.getAttribute('data-index')); destacarItemAutocomplete(); });
    });
    listEl.style.display = 'block';
}

function destacarTermo(texto, termo) {
    if (!texto) return '';
    if (!termo) return escapeHTML(texto);
    return escapeHTML(texto).replace(new RegExp(`(${escapeRegex(termo)})`, 'gi'), '<mark>$1</mark>');
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
    const hidden = safeGet('filtroAluno');
    const listEl = safeGet('autocompleteAlunoList');
    const info = safeGet('alunoSelecionadoInfo');
    if (input) input.value = aluno.nome;
    if (hidden) hidden.value = aluno.id;
    if (listEl) listEl.style.display = 'none';
    if (info) {
        const m = aluno.matricula ? ` • ${aluno.matricula}` : '';
        info.innerHTML = `✅ <strong>${escapeHTML(aluno.nome)}</strong>${m} — Turma ${escapeHTML(aluno.turma || '-')}`;
        info.style.color = '#7c3aed';
    }
}

async function carregarRelatorio() {
    const tipo = safeGet('tipoRelatorio')?.value;
    const dI = safeGet('dataInicio')?.value || '';
    const dF = safeGet('dataFim')?.value || '';
    let url = '';
    
    try {
        if (tipo === 'geral') {
            url = `/api/assistente-social/relatorio/geral?`;
            if (dI) url += `dataInicio=${dI}&`;
            if (dF) url += `dataFim=${dF}&`;
        } else if (tipo === 'turma') {
            const turma = safeGet('filtroTurma')?.value;
            if (!turma) { 
                mostrarToastConcluido('Selecione uma turma', 'error'); 
                return; 
            }
            url = `/api/assistente-social/relatorio/turma/${encodeURIComponent(turma)}?`;
            if (dI) url += `dataInicio=${dI}&`;
            if (dF) url += `dataFim=${dF}&`;
        } else if (tipo === 'aluno') {
            const alunoId = safeGet('filtroAluno')?.value;
            if (!alunoId) { 
                mostrarToastConcluido('Selecione um aluno', 'error'); 
                return; 
            }
            url = `/api/assistente-social/relatorio/aluno/${alunoId}?`;
            if (dI) url += `dataInicio=${dI}&`;
            if (dF) url += `dataFim=${dF}&`;
        }
        
        const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await response.json();
        
        if (data.success) {
            relatorioData = data;
            exibirRelatorio(data, tipo);
            
            const btnCSV = safeGet('btnExportarCSVAS');
            const btnPDF = safeGet('btnExportarPDFAS');
            if (btnCSV) btnCSV.disabled = false;
            if (btnPDF) btnPDF.disabled = false;
            
            const total = data.totalAtendimentos || data.estatisticas?.totalAtendimentos || 0;
            if (total === 0) {
                mostrarToastConcluido('⚠️ Nenhum registro encontrado. Verifique as datas e filtros.', 'warning');
            }
        } else {
            mostrarToastConcluido('Erro: ' + (data.error || 'Erro ao carregar relatório'), 'error');
        }
    } catch (error) {
        console.error('Erro ao carregar relatório:', error);
        mostrarToastConcluido('Erro ao carregar relatório', 'error');
    }
}

function exibirRelatorio(data, tipo) {
    const container = safeGet('resultadoRelatorio');
    if (!container) return;
    try {
        if (tipo === 'geral') {
            const porTipo = Array.isArray(data.porTipo) ? data.porTipo : [];
            const porTurma = Array.isArray(data.porTurma) ? data.porTurma : [];
            const atendimentos = Array.isArray(data.atendimentos) ? data.atendimentos : [];
            container.innerHTML = `
                <div class="card"><div class="card-body">
                    <h5><i class="fas fa-chart-bar"></i> Relatório Geral</h5>
                    <p>Total: <strong>${data.totalAtendimentos || 0}</strong> | Com assinatura: <strong>${data.comAssinatura || 0}</strong></p>
                    <h6 class="mt-4">Por Tipo</h6>
                    <div class="row">${porTipo.map(t => `<div class="col-md-4 mb-2"><div class="p-2" style="background:#ede9fe;border-radius:8px;"><strong>${escapeHTML(t.label || '')}</strong>: ${t.count || 0}</div></div>`).join('')}</div>
                    <h6 class="mt-4">Por Turma</h6>
                    <div class="table-responsive"><table class="table table-sm">
                        <thead><tr><th>Turma</th><th>Total</th><th>Alunos</th></tr></thead>
                        <tbody>${porTurma.map(t => `<tr><td>${escapeHTML(t.turma || '-')}</td><td>${t.total || 0}</td><td>${t.totalAlunos || 0}</td></tr>`).join('')}</tbody>
                    </table></div>
                    <h6 class="mt-4">Últimos</h6>
                    <div class="table-responsive"><table class="table table-sm">
                        <thead><tr><th>Aluno</th><th>Tipo</th><th>Data</th><th>Status</th></tr></thead>
                        <tbody>${atendimentos.slice(0, 20).map(a => `<tr><td>${escapeHTML(a.alunoNome || '')}</td><td>${escapeHTML(a.tipoTarefaLabel || '')}</td><td>${a.dataEntrada ? new Date(a.dataEntrada).toLocaleString('pt-BR') : '-'}</td><td>${a.status === 'em_andamento' ? 'Em andamento' : 'Finalizado'}</td></tr>`).join('')}</tbody>
                    </table></div>
                </div></div>`;
        } else if (tipo === 'turma') {
            const porTipo = Array.isArray(data.estatisticas?.porTipo) ? data.estatisticas.porTipo : [];
            const porAluno = Array.isArray(data.porAluno) ? data.porAluno : [];
            container.innerHTML = `
                <div class="card"><div class="card-body">
                    <h5>Turma: ${escapeHTML(data.turma || '')}</h5>
                    <p>Total: <strong>${data.estatisticas?.totalAtendimentos || 0}</strong></p>
                    <h6 class="mt-4">Por Tipo</h6>
                    <div class="row">${porTipo.map(t => `<div class="col-md-4 mb-2"><div class="p-2" style="background:#ede9fe;border-radius:8px;"><strong>${escapeHTML(t.label || '')}</strong>: ${t.count || 0}</div></div>`).join('')}</div>
                    <h6 class="mt-4">Por Aluno</h6>
                    <div class="table-responsive"><table class="table table-sm">
                        <thead><tr><th>Aluno</th><th>Total</th><th>Tipos</th></tr></thead>
                        <tbody>${porAluno.map(a => `<tr><td>${escapeHTML(a.alunoNome || '')}</td><td><span class="badge" style="background:#8b5cf6;">${a.total || 0}</span></td><td>${Object.entries(a.tipos || {}).map(([t, c]) => `${escapeHTML(TIPO_LABELS[t] || t)}: ${c}`).join(', ')}</td></tr>`).join('')}</tbody>
                    </table></div>
                </div></div>`;
        } else if (tipo === 'aluno') {
            const porTipo = Array.isArray(data.estatisticas?.porTipo) ? data.estatisticas.porTipo : [];
            const porGrav = data.estatisticas?.porGravidade || {};
            const atendimentos = Array.isArray(data.atendimentos) ? data.atendimentos : [];
            container.innerHTML = `
                <div class="card"><div class="card-body">
                    <h5>${escapeHTML(data.aluno?.nome || '')}</h5>
                    <p>Matrícula: ${escapeHTML(data.aluno?.matricula || 'N/A')} | Turma: ${escapeHTML(data.aluno?.turma || 'N/A')}</p>
                    <p>Total: <strong>${data.estatisticas?.totalAtendimentos || 0}</strong></p>
                    <div class="row mt-3">
                        <div class="col-md-6"><h6>Por Tipo</h6>${porTipo.map(t => `<div class="d-flex justify-content-between mb-1"><span>${escapeHTML(t.label || '')}</span><span class="badge" style="background:#8b5cf6;">${t.count || 0}</span></div>`).join('')}</div>
                        <div class="col-md-6"><h6>Por Gravidade</h6>${Object.entries(porGrav).map(([g, c]) => `<div class="d-flex justify-content-between mb-1"><span>${escapeHTML(g)}</span><span class="badge bg-secondary">${c}</span></div>`).join('')}</div>
                    </div>
                    <h6 class="mt-4">Histórico</h6>
                    <div class="table-responsive"><table class="table table-sm">
                        <thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Status</th><th></th></tr></thead>
                        <tbody>${atendimentos.map(a => `<tr><td>${a.dataEntrada ? new Date(a.dataEntrada).toLocaleString('pt-BR') : '-'}</td><td>${escapeHTML(a.tipoTarefaLabel || '')}</td><td>${escapeHTML((a.descricao || '').substring(0, 80))}</td><td>${a.status === 'em_andamento' ? 'Em andamento' : escapeHTML(a.resultado || 'Finalizado')}</td><td><button class="btn btn-sm btn-info" onclick="verAtendimento('${a.id}')"><i class="fas fa-eye"></i></button></td></tr>`).join('')}</tbody>
                    </table></div>
                </div></div>`;
        }
    } catch (error) { container.innerHTML = `<div class="mostrarToastConcluido mostrarToastConcluido-danger">Erro ao exibir</div>`; }
}

function exportarCSV() {
    if (!relatorioData) {
        mostrarToastConcluido('⚠️ Nenhum relatório carregado.\n\nClique em BUSCAR primeiro.', 'warning');
        return;
    }
    
    const dados = relatorioData.registros || relatorioData.atendimentos || [];
    
    if (dados.length === 0) {
        mostrarToastConcluido('⚠️ Nenhum registro para exportar.\n\nVerifique os filtros de data.', 'warning');
        return;
    }
    
    let csv = "Data,Aluno,Matrícula,Turma,Tipo,Descrição,Gravidade,Status,Resultado\n";
    
    dados.forEach(a => {
        csv += [
            a.dataFormatada || (a.dataEntrada ? new Date(a.dataEntrada).toLocaleString('pt-BR') : ''),
            `"${(a.alunoNome || relatorioData.aluno?.nome || '').replace(/"/g, '""')}"`,
            `"${(a.alunoMatricula || '').replace(/"/g, '""')}"`,
            `"${(a.alunoTurma || relatorioData.aluno?.turma || relatorioData.turma || '').replace(/"/g, '""')}"`,
            `"${(a.tipoTarefaLabel || TIPO_LABELS[a.tipoTarefa] || '').replace(/"/g, '""')}"`,
            `"${(a.descricao || '').replace(/"/g, '""')}"`,
            a.gravidade || '',
            a.status === 'em_andamento' ? 'Em andamento' : 'Finalizado',
            `"${(a.resultado || a.saida?.resultado || '').replace(/"/g, '""')}"`
        ].join(',') + '\n';
    });
    
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `assistente-social-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
}

// ============================================
// 📄 EXPORTAR PDF (padrão unificado)
// ============================================
function exportarPDF() {
    if (!relatorioData) {
        mostrarToastConcluido('⚠️ Gere um relatório primeiro. Clique em BUSCAR.', 'warning');
        return;
    }
    
    const html = gerarHTMLRelatorioAS(relatorioData);
    
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.onload = () => setTimeout(() => win.print(), 500);
}

// ============================================
// 🎯 HABILITAR BOTÕES APÓS CARREGAR RELATÓRIO
// ============================================
function habilitarBotoesRelatorioAS() {
    const btnCSV = safeGet('btnExportarCSVAS');
    const btnPDF = safeGet('btnExportarPDFAS');
    if (btnCSV) btnCSV.disabled = false;
    if (btnPDF) btnPDF.disabled = false;
}

// ============================================
// 🎨 GERAR HTML DO RELATÓRIO
// ============================================
function gerarHTMLRelatorioAS(data) {
    const tipo = data.aluno ? 'aluno' : (data.turma ? 'turma' : 'geral');
    const logoIema = '/uploads/logo-iema.png';
    const carimbo = '/icons/assinatura_assistente_social.ico';
    const dataGeracao = new Date().toLocaleString('pt-BR');
    
    // Buscar assinatura digital
    let assinaturaDigital = null;
    const lista = data.registros || data.atendimentos || [];
    const comAssinatura = lista.find(a => a.temAssinatura && a.assinaturaBase64);
    if (comAssinatura) assinaturaDigital = comAssinatura.assinaturaBase64;
    
    let titulo = 'Relatório de Atendimentos - Assistente Social';
    let subtitulo = '';
    if (tipo === 'turma') {
        titulo = 'Relatório de Atendimentos';
        subtitulo = `Turma: ${data.turma || ''}`;
    } else if (tipo === 'aluno') {
        titulo = 'Relatório Individual do Aluno';
        subtitulo = `${data.aluno?.nome || ''} — ${data.aluno?.turma || ''}`;
    } else {
        subtitulo = 'Relatório Geral';
    }
    
    let statsHTML = '';
    if (tipo === 'geral') {
        statsHTML = `
            <div class="stats">
                <div class="stat">
                    <div class="stat-value">${data.totalAtendimentos || 0}</div>
                    <div class="stat-label">Total de Atendimentos</div>
                </div>
                <div class="stat">
                    <div class="stat-value">${(data.porTipo || []).length}</div>
                    <div class="stat-label">Tipos Diferentes</div>
                </div>
                <div class="stat">
                    <div class="stat-value">${(data.porTurma || []).length}</div>
                    <div class="stat-label">Turmas Atendidas</div>
                </div>
            </div>`;
    } else if (tipo === 'turma') {
        statsHTML = `
            <div class="stats">
                <div class="stat"><div class="stat-value">${data.estatisticas?.totalAtendimentos || 0}</div><div class="stat-label">Total de Atendimentos</div></div>
                <div class="stat"><div class="stat-value">${data.estatisticas?.totalAlunosAtendidos || (data.porAluno || []).length}</div><div class="stat-label">Alunos Atendidos</div></div>
                <div class="stat"><div class="stat-value">${(data.porAluno || []).length}</div><div class="stat-label">Alunos com Registro</div></div>
            </div>`;
    } else {
        statsHTML = `
            <div class="stats">
                <div class="stat"><div class="stat-value">${data.estatisticas?.totalAtendimentos || 0}</div><div class="stat-label">Total de Atendimentos</div></div>
                <div class="stat"><div class="stat-value">${(data.estatisticas?.porTipo || []).length}</div><div class="stat-label">Tipos Diferentes</div></div>
                <div class="stat"><div class="stat-value">${Object.keys(data.estatisticas?.porGravidade || {}).length}</div><div class="stat-label">Níveis de Gravidade</div></div>
            </div>`;
    }
    
    let tabelaHTML = '';
    
    if (tipo === 'geral') {
        const porTipo = Array.isArray(data.porTipo) ? data.porTipo : [];
        const porTurma = Array.isArray(data.porTurma) ? data.porTurma : [];
        const atendimentos = Array.isArray(data.atendimentos) ? data.atendimentos : [];
        
        tabelaHTML = `
            <div class="section-title">📊 Distribuição por Tipo</div>
            <table>
                <thead><tr><th>Tipo de Tarefa</th><th style="width:120px;text-align:center;">Quantidade</th></tr></thead>
                <tbody>${porTipo.map(t => `<tr><td><strong>${escapeHTML(t.label || '')}</strong></td><td style="text-align:center;">${t.count || 0}</td></tr>`).join('') || '<tr><td colspan="2" style="text-align:center;">Nenhum dado disponível</td></tr>'}</tbody>
            </table>
            
            <div class="section-title">🏫 Distribuição por Turma</div>
            <table>
                <thead><tr><th>Turma</th><th style="width:120px;text-align:center;">Total</th><th style="width:120px;text-align:center;">Alunos</th></tr></thead>
                <tbody>${porTurma.map(t => `<tr><td><strong>${escapeHTML(t.turma || 'Sem turma')}</strong></td><td style="text-align:center;">${t.total || 0}</td><td style="text-align:center;">${t.totalAlunos || 0}</td></tr>`).join('') || '<tr><td colspan="3" style="text-align:center;">Nenhum dado disponível</td></tr>'}</tbody>
            </table>
            
            <div class="section-title">📋 Últimos Atendimentos</div>
            <table>
                <thead><tr><th>Data</th><th>Aluno</th><th>Turma</th><th>Tipo</th><th>Gravidade</th><th>Status</th></tr></thead>
                <tbody>${atendimentos.slice(0, 30).map(a => `
                    <tr>
                        <td>${a.dataEntrada ? new Date(a.dataEntrada).toLocaleDateString('pt-BR') : '-'}</td>
                        <td><strong>${escapeHTML(a.alunoNome || '')}</strong></td>
                        <td>${escapeHTML(a.alunoTurma || '')}</td>
                        <td>${escapeHTML(a.tipoTarefaLabel || '')}</td>
                        <td>${escapeHTML((a.gravidade || 'media').toUpperCase())}</td>
                        <td><span class="badge-status ${a.status === 'finalizado' ? 'finalizado' : 'andamento'}">${a.status === 'finalizado' ? '✅ Finalizado' : '⏳ Em Andamento'}</span></td>
                    </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;">Nenhum atendimento registrado</td></tr>'}
                </tbody>
            </table>`;
    } else if (tipo === 'turma') {
        const porAluno = Array.isArray(data.porAluno) ? data.porAluno : [];
        const porTipo = Array.isArray(data.estatisticas?.porTipo) ? data.estatisticas.porTipo : [];
        
        tabelaHTML = `
            <div class="section-title">📊 Distribuição por Tipo</div>
            <table>
                <thead><tr><th>Tipo de Tarefa</th><th style="width:120px;text-align:center;">Quantidade</th></tr></thead>
                <tbody>${porTipo.map(t => `<tr><td><strong>${escapeHTML(t.label || '')}</strong></td><td style="text-align:center;">${t.count || 0}</td></tr>`).join('') || '<tr><td colspan="2" style="text-align:center;">Nenhum dado</td></tr>'}</tbody>
            </table>
            
            <div class="section-title">👥 Atendimentos por Aluno</div>
            <table>
                <thead><tr><th>Aluno</th><th style="width:100px;text-align:center;">Total</th><th>Tipos</th></tr></thead>
                <tbody>${porAluno.map(a => `
                    <tr>
                        <td><strong>${escapeHTML(a.alunoNome || '')}</strong></td>
                        <td style="text-align:center;">${a.total || 0}</td>
                        <td>${Object.entries(a.tipos || {}).map(([t, c]) => `${escapeHTML(TIPO_LABELS[t] || t)}: ${c}`).join('<br>')}</td>
                    </tr>`).join('') || '<tr><td colspan="3" style="text-align:center;">Nenhum dado</td></tr>'}
                </tbody>
            </table>`;
    } else if (tipo === 'aluno') {
        const porTipo = Array.isArray(data.estatisticas?.porTipo) ? data.estatisticas.porTipo : [];
        const porGrav = data.estatisticas?.porGravidade || {};
        const atendimentos = Array.isArray(data.atendimentos) ? data.atendimentos : [];
        
        tabelaHTML = `
            <div class="section-title">📊 Distribuição por Tipo</div>
            <table>
                <thead><tr><th>Tipo de Tarefa</th><th style="width:120px;text-align:center;">Quantidade</th></tr></thead>
                <tbody>${porTipo.map(t => `<tr><td><strong>${escapeHTML(t.label || '')}</strong></td><td style="text-align:center;">${t.count || 0}</td></tr>`).join('') || '<tr><td colspan="2" style="text-align:center;">Nenhum dado</td></tr>'}</tbody>
            </table>
            
            <div class="section-title">⚠️ Distribuição por Gravidade</div>
            <table>
                <thead><tr><th>Gravidade</th><th style="width:120px;text-align:center;">Quantidade</th></tr></thead>
                <tbody>${Object.entries(porGrav).map(([g, c]) => `<tr><td><strong>${escapeHTML(g.toUpperCase())}</strong></td><td style="text-align:center;">${c}</td></tr>`).join('') || '<tr><td colspan="2" style="text-align:center;">Nenhum dado</td></tr>'}</tbody>
            </table>
            
            <div class="section-title">📋 Histórico de Atendimentos</div>
            <table>
                <thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Gravidade</th><th>Status</th></tr></thead>
                <tbody>${atendimentos.map(a => `
                    <tr>
                        <td>${a.dataEntrada ? new Date(a.dataEntrada).toLocaleDateString('pt-BR') : '-'}</td>
                        <td>${escapeHTML(a.tipoTarefaLabel || '')}</td>
                        <td>${escapeHTML((a.descricao || '').substring(0, 80))}${(a.descricao || '').length > 80 ? '...' : ''}</td>
                        <td>${escapeHTML((a.gravidade || 'media').toUpperCase())}</td>
                        <td><span class="badge-status ${a.status === 'finalizado' ? 'finalizado' : 'andamento'}">${a.status === 'finalizado' ? '✅ Finalizado' : '⏳ Em Andamento'}</span></td>
                    </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;">Nenhum atendimento</td></tr>'}
                </tbody>
            </table>`;
    }
    
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
            
            .titulo { text-align: center; font-size: 11pt; font-weight: bold; background: #ede9fe; padding: 4px 8px; border: 1.5px solid #000; margin: 6px 0 3px; text-transform: uppercase; letter-spacing: 0.5px; }
            .subtitulo { text-align: center; font-size: 9pt; margin: 0 0 6px; font-style: italic; }
            
            .stats { display: flex; gap: 8px; margin: 6px 0 8px; padding: 6px 8px; background: #f5f3ff; border-radius: 5px; border: 1px solid #ddd6fe; }
            .stat { text-align: center; flex: 1; border-right: 1px solid #ddd6fe; }
            .stat:last-child { border-right: none; }
            .stat-value { font-size: 13pt; font-weight: bold; color: #7c3aed; line-height: 1; }
            .stat-label { font-size: 7.5pt; color: #666; margin-top: 2px; }
            
            .section-title { font-size: 9pt; font-weight: bold; background: #e8e8e8; padding: 2px 6px; border-left: 3px solid #8b5cf6; margin: 6px 0 3px; }
            
            table { width: 100%; border-collapse: collapse; font-size: 8.5pt; margin-bottom: 6px; }
            th { background: #8b5cf6; color: white; padding: 4px 5px; text-align: left; border: 1px solid #7c3aed; font-size: 8pt; }
            td { padding: 3px 5px; border: 1px solid #ddd; vertical-align: top; }
            tr:nth-child(even) { background: #f9fafb; }
            
            .badge-status { display: inline-block; padding: 1px 6px; border-radius: 8px; font-size: 7.5pt; font-weight: bold; }
            .badge-status.finalizado { background: #d1fae5; color: #065f46; }
            .badge-status.andamento { background: #fef3c7; color: #92400e; }
            
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
            
            .btn-print { display: block; margin: 10px auto; padding: 8px 20px; background: #8b5cf6; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 12px; font-family: Arial, sans-serif; }
            .btn-print:hover { background: #7c3aed; }
            
            @media print { .no-print { display: none !important; } body { padding: 0; } }
        </style>
    </head>
    <body>
        <button class="btn-print no-print" onclick="window.print()">🖨️ Imprimir</button>
        
        <div class="header">
            <img src="${logoIema}" alt="IEMA" onerror="this.style.display='none'">
            <h1>IEMA Pleno: São Luís - Centro</h1>
            <p>Sistema de Atendimentos — Assistente Social</p>
        </div>
        
        <div class="titulo">🤝 ${titulo}</div>
        ${subtitulo ? `<div class="subtitulo">${escapeHTML(subtitulo)}</div>` : ''}
        
        ${statsHTML}
        ${tabelaHTML}
        
        <div class="assinaturas">
            <div class="assinatura">
                <div class="assinatura-container-relatorio">
                    ${assinaturaDigital ? `<img class="assinatura-img" src="${assinaturaDigital}" alt="Assinatura">` : ''}
                    <img class="carimbo-overlay" src="${carimbo}" alt="Carimbo" onerror="this.style.display='none'">
                </div>
                <div class="assinatura-linha">Assinatura do Responsável / Assistente Social</div>
            </div>
        </div>
        
        <div class="registro-info">
            Relatório gerado em <strong>${dataGeracao}</strong>
        </div>
        
        <div class="footer">
            <p>Documento gerado automaticamente pelo EducaPleno</p>
            <p>Setor: Assistente Social</p>
        </div>
    </body>
    </html>`;
}

// ============================================================================
// 🆕 SISTEMA DE SESSÃO DE ASSINATURA VIA QR CODE
// ============================================================================

function gerarUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Marca/desmarca necessidade de assinatura.
 * Cria sessão + gera QR Code + abre modal.
 */
async function toggleNecessitaAssinatura(modulo) {
    const check = safeGet(`${modulo}NecessitaAssinatura`);
    if (!check) return;
    
    if (check.checked) {
        // 1. Monta snapshot dos dados atuais
        const snapshot = montarSnapshotAtendimento(modulo);
        
        if (!snapshot.alunoId) {
            mostrarToastConcluido('⚠️ Selecione um aluno antes de marcar a assinatura', 'warning');
            check.checked = false;
            return;
        }
        
        // 2. Gera ID único para a sessão
        const sessaoId = gerarUUID();
        estadoSessaoAssinatura[modulo].sessaoId = sessaoId;
        estadoSessaoAssinatura[modulo].assinaturaCapturada = null;
        
        // 3. Cria a sessão no backend
        try {
            const response = await fetch('/api/sessoes-assinatura', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    sessaoId,
                    tipo: 'assistente_social',
                    dadosAtendimento: snapshot
                })
            });
            
            const data = await response.json();
            if (!data.success) throw new Error(data.error || 'Erro ao criar sessão');
            
            console.log('✅ Sessão criada:', sessaoId);
            
            // 4. Gera QR Code
            const urlAssinatura = `${window.location.origin}/assistente-social.html?assinatura=${sessaoId}`;
            
            try {
                const qrResponse = await fetch('/api/qrcode/gerar', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ url: urlAssinatura })
                });
                const qrData = await qrResponse.json();
                
                if (qrData.success && qrData.qrCode) {
                    estadoSessaoAssinatura[modulo].qrCodeDataUrl = qrData.qrCode;
                } else {
                    estadoSessaoAssinatura[modulo].qrCodeDataUrl = 
                        `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(urlAssinatura)}`;
                }
            } catch (e) {
                console.warn('Erro ao gerar QR Code, usando fallback:', e);
                estadoSessaoAssinatura[modulo].qrCodeDataUrl = 
                    `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(urlAssinatura)}`;
            }
            
            // 5. Abre o modal com QR Code
            abrirModalAssinatura(modulo, urlAssinatura);
            
            // 6. Inicia monitoramento
            iniciarMonitoramentoSessao(modulo, sessaoId);
            
            mostrarToastConcluido('📱 QR Code gerado! Peça para o responsável escanear.', 'info');
            
        } catch (e) {
            console.error('Erro ao criar sessão:', e);
            mostrarToastConcluido('❌ Erro ao criar sessão de assinatura', 'error');
            check.checked = false;
            estadoSessaoAssinatura[modulo].sessaoId = null;
        }
    } else {
        // Desmarcou → cancela a sessão
        const sessaoId = estadoSessaoAssinatura[modulo].sessaoId;
        if (sessaoId) {
            try {
                await fetch(`/api/sessoes-assinatura/${sessaoId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
            } catch (e) { console.warn(e); }
        }
        
        estadoSessaoAssinatura[modulo].sessaoId = null;
        estadoSessaoAssinatura[modulo].assinaturaCapturada = null;
        estadoSessaoAssinatura[modulo].qrCodeDataUrl = null;
        pararMonitoramentoSessao(modulo);
        fecharModalAssinatura(modulo);
    }
}

/**
 * Monta snapshot dos dados atuais para exibir na tela de assinatura.
 */
function montarSnapshotAtendimento(modulo) {
    return {
        alunoId: currentAluno?.id,
        alunoNome: currentAluno?.nome,
        alunoMatricula: currentAluno?.matricula,
        alunoTurma: currentAluno?.turma,
        alunoCurso: currentAluno?.curso,
        alunoFoto: currentAluno?.fotoPerfil,
        motivo: tipoTarefaSelecionado,
        motivoLabel: TIPO_LABELS[tipoTarefaSelecionado] || tipoTarefaSelecionado,
        descricao: safeGet('descricao')?.value || '',
        observacoes: safeGet('observacoes')?.value || '',
        gravidade: safeGet('gravidade')?.value || 'media',
        prioridade: safeGet('prioridade')?.value || 'normal',
        data: new Date().toISOString().split('T')[0]
    };
}

/**
 * Abre o modal com QR Code.
 */
function abrirModalAssinatura(modulo, urlAssinatura) {
    const antigo = safeGet('modalAssinaturaQR');
    if (antigo) antigo.remove();
    
    const qrUrl = estadoSessaoAssinatura[modulo].qrCodeDataUrl || 
        `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(urlAssinatura)}`;
    
    const modalHtml = `
        <div class="modal fade" id="modalAssinaturaQR" tabindex="-1" data-bs-backdrop="static" data-bs-keyboard="false">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content" style="border-radius: 20px; border: none; overflow: hidden;">
                    <div class="modal-header" style="background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white; border: none; padding: 20px 25px;">
                        <h5 class="modal-title" style="display: flex; align-items: center; gap: 10px;">
                            <i class="fas fa-signature"></i> 
                            Aguardando Assinatura
                        </h5>
                        <button type="button" class="btn-close btn-close-white" onclick="assistenteSocial.fecharModalAssinatura('${modulo}')"></button>
                    </div>
                    
                    <div class="modal-body" style="padding: 30px; text-align: center;">
                        <div id="modalAssinaturaStatus" style="margin-bottom: 20px;">
                            <div style="background: #fef3c7; border-radius: 12px; padding: 14px; display: flex; align-items: center; gap: 12px; text-align: left;">
                                <div style="width: 40px; height: 40px; border-radius: 50%; border: 4px solid #f59e0b; border-top-color: transparent; animation: spinQR 1s linear infinite; flex-shrink: 0;"></div>
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
                            <button onclick="assistenteSocial.copiarLinkAssinatura('${urlAssinatura}')"
                                    class="btn-copiar-link">
                                <i class="fas fa-link"></i> Copiar link de assinatura
                            </button>
                        </div>
                    </div>
                    
                    <div class="modal-footer" style="border-top: 1px solid #e5e7eb; padding: 15px 25px; justify-content: space-between;">
                        <button type="button" class="btn btn-outline-secondary" onclick="assistenteSocial.fecharModalAssinatura('${modulo}')" style="border-radius: 10px;">
                            <i class="fas fa-eye-slash"></i> Ocultar
                        </button>
                        <button type="button" class="btn btn-danger" onclick="assistenteSocial.cancelarSessaoAssinatura('${modulo}')" style="border-radius: 10px;">
                            <i class="fas fa-times"></i> Cancelar Assinatura
                        </button>
                    </div>
                </div>
            </div>
        </div>`;
    
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
                        onclick="assistenteSocial.reabrirModalAssinatura('${modulo}')"
                        style="border-radius: 8px;">
                    <i class="fas fa-qrcode"></i> Mostrar QR
                </button>
            </div>
        </div>`;
}

function reabrirModalAssinatura(modulo) {
    const sessaoId = estadoSessaoAssinatura[modulo].sessaoId;
    if (!sessaoId) {
        mostrarToastConcluido('⚠️ Nenhuma sessão ativa', 'warning');
        return;
    }
    const urlAssinatura = `${window.location.origin}/assistente-social.html?assinatura=${sessaoId}`;
    abrirModalAssinatura(modulo, urlAssinatura);
}

async function copiarLinkAssinatura(url) {
    try {
        await navigator.clipboard.writeText(url);
        mostrarToastConcluido('✅ Link copiado!', 'success');
    } catch (e) {
        const textarea = document.createElement('textarea');
        textarea.value = url;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        mostrarToastConcluido('✅ Link copiado!', 'success');
    }
}

function iniciarMonitoramentoSessao(modulo, sessaoId) {
    pararMonitoramentoSessao(modulo);
    
    console.log('👀 Monitorando sessão:', sessaoId);
    
    const intervalId = setInterval(async () => {
        try {
            const response = await fetch(`/api/sessoes-assinatura/${sessaoId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (!response.ok) {
                if (response.status === 404) {
                    console.warn('Sessão expirou ou foi removida');
                    pararMonitoramentoSessao(modulo);
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
                
                mostrarToastConcluido(`✅ Assinatura capturada por ${data.sessao.assinadaPorNome}!`, 'success');
                
            } else if (data.sessao.status === 'cancelado') {
                console.log('Sessão cancelada');
                pararMonitoramentoSessao(modulo);
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
                    onclick="assistenteSocial.refazerAssinatura('${modulo}')"
                    class="btn btn-sm btn-outline-danger w-100 mt-2"
                    style="border-radius: 8px;">
                <i class="fas fa-redo"></i> Refazer Assinatura
            </button>
        </div>`;
}

async function cancelarSessaoAssinatura(modulo) {
    const confirmar = await confirm('Cancelar a assinatura? O responsável não poderá mais assinar este atendimento.');
    if (!confirmar) return;
    
    const sessaoId = estadoSessaoAssinatura[modulo].sessaoId;
    if (sessaoId) {
        try {
            await fetch(`/api/sessoes-assinatura/${sessaoId}`, {
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
    
    mostrarToastConcluido('Sessão cancelada', 'info');
}

async function refazerAssinatura(modulo) {
    const confirmar = await confirm('Refazer a assinatura? A atual será descartada.');
    if (!confirmar) return;
    
    const sessaoId = estadoSessaoAssinatura[modulo].sessaoId;
    if (sessaoId) {
        try {
            await fetch(`/api/sessoes-assinatura/${sessaoId}`, {
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
// 📱 MODO ASSINATURA (via URL ?assinatura=UUID)
// ============================================================================

async function mostrarTelaAssinatura(sessaoId) {
    // Esconde elementos da UI normal
    document.querySelectorAll('.header-top, .card, .container > *').forEach(el => {
        if (el && !el.id?.includes('content')) {
            el.style.display = 'none';
        }
    });
    
    // Cria container principal
    let container = safeGet('telaAssinaturaContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'telaAssinaturaContainer';
        document.body.innerHTML = '';
        document.body.appendChild(container);
    }
    
    container.innerHTML = `
        <div style="min-height: 100vh; background: #f0f4f8; padding: 20px; display: flex; flex-direction: column; align-items: center;">
            <div style="max-width: 600px; width: 100%;">
                <div style="background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white; padding: 18px 24px; border-radius: 16px 16px 0 0; text-align: center;">
                    <h1 style="font-size: 20px; margin: 0; display: flex; align-items: center; justify-content: center; gap: 10px;">
                        <i class="fas fa-signature"></i> Assinatura Digital
                    </h1>
                </div>
                
                <div id="telaAssinaturaInfo" style="background: white; padding: 20px; border-left: 4px solid #8b5cf6;">
                    <div style="text-align: center; padding: 40px;">
                        <div style="width: 40px; height: 40px; border: 4px solid #e2e8f0; border-top-color: #8b5cf6; border-radius: 50%; animation: spinQR 1s linear infinite; margin: 0 auto 15px;"></div>
                        <p style="color: #64748b; margin: 0;">Carregando atendimento...</p>
                    </div>
                </div>
                
                <div id="telaAssinaturaArea" style="background: white; padding: 20px; display: none; border-radius: 0 0 16px 16px;">
                    <div id="canvasWrapper" style="position: relative; background: white; border: 3px dashed #cbd5e0; border-radius: 16px; overflow: hidden; height: 300px; margin-bottom: 16px;">
                        <canvas id="canvasAssinatura" style="width: 100%; height: 100%; display: block; touch-action: none;"></canvas>
                        <div id="placeholder" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: #94a3b8; pointer-events: none;">
                            <i class="fas fa-pen-fancy" style="font-size: 48px; display: block; margin-bottom: 10px;"></i>
                            <span style="font-size: 15px;">Assine aqui com o dedo</span>
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 12px;">
                        <button onclick="assistenteSocial.limparAssinaturaTela()" 
                                style="flex: 1; padding: 16px; background: #f1f5f9; color: #475569; border: none; border-radius: 12px; font-weight: 600; font-size: 15px;">
                            <i class="fas fa-eraser"></i> Limpar
                        </button>
                        <button id="btnSalvarAssinatura" onclick="assistenteSocial.salvarAssinaturaTela()" disabled
                                style="flex: 2; padding: 16px; background: #cbd5e0; color: white; border: none; border-radius: 12px; font-weight: 600; font-size: 15px; cursor: not-allowed;">
                            <i class="fas fa-check"></i> Confirmar Assinatura
                        </button>
                    </div>
                </div>
            </div>
        </div>`;
    
    try {
        const response = await fetch(`/api/sessoes-assinatura/${sessaoId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (!data.success) {
            safeGet('telaAssinaturaInfo').innerHTML = `
                <div style="text-align: center; padding: 40px 20px;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #ef4444; margin-bottom: 15px; display: block;"></i>
                    <h3 style="color: #ef4444; margin: 0 0 10px;">Sessão inválida ou expirada</h3>
                    <p style="color: #64748b; margin: 0;">Esta sessão de assinatura não existe mais ou expirou (30 min).</p>
                </div>`;
            return;
        }
        
        if (data.sessao.status === 'assinado') {
            safeGet('telaAssinaturaInfo').innerHTML = `
                <div style="text-align: center; padding: 40px 20px;">
                    <i class="fas fa-check-circle" style="font-size: 48px; color: #10b981; margin-bottom: 15px; display: block;"></i>
                    <h3 style="color: #10b981; margin: 0 0 10px;">Esta sessão já foi assinada</h3>
                    <p style="color: #64748b; margin: 0;">Assinada por ${escapeHTML(data.sessao.assinadaPorNome || '')}</p>
                </div>`;
            return;
        }
        
        const d = data.sessao.dadosAtendimento || {};
        
        safeGet('telaAssinaturaInfo').innerHTML = `
            <div style="border-left: 4px solid #8b5cf6; padding-left: 14px;">
                <h2 style="margin: 0 0 4px; font-size: 18px; color: #8b5cf6;">Atendimento Assistente Social</h2>
                <p style="margin: 0; color: #64748b; font-size: 13px;">Confirme os dados e assine abaixo</p>
            </div>
            
            <div style="margin-top: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <div>
                    <span style="font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 700; display: block; margin-bottom: 3px;">Aluno</span>
                    <span style="font-size: 14px; color: #1e293b; font-weight: 500;">${escapeHTML(d.alunoNome || '-')}</span>
                </div>
                <div>
                    <span style="font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 700; display: block; margin-bottom: 3px;">Turma</span>
                    <span style="font-size: 14px; color: #1e293b; font-weight: 500;">${escapeHTML(d.alunoTurma || '-')}</span>
                </div>
                <div>
                    <span style="font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 700; display: block; margin-bottom: 3px;">Motivo</span>
                    <span style="font-size: 14px; color: #1e293b; font-weight: 500;">${escapeHTML(d.motivoLabel || '-')}</span>
                </div>
                ${d.gravidade ? `
                    <div>
                        <span style="font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 700; display: block; margin-bottom: 3px;">Gravidade</span>
                        <span style="font-size: 14px; color: #1e293b; font-weight: 500;">${escapeHTML(d.gravidade.toUpperCase())}</span>
                    </div>
                ` : ''}
            </div>
        `;
        
        safeGet('telaAssinaturaArea').style.display = 'block';
        
        sessaoAssinaturaModo = sessaoId;
        sessaoAssinaturaAtual = data.sessao;
        
        inicializarCanvasTela();
        
    } catch (e) {
        console.error('Erro ao carregar sessão:', e);
        safeGet('telaAssinaturaInfo').innerHTML = `
            <div style="text-align: center; padding: 40px 20px;">
                <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #ef4444; margin-bottom: 15px; display: block;"></i>
                <h3 style="color: #ef4444; margin: 0 0 10px;">Erro ao carregar</h3>
                <p style="color: #64748b; margin: 0;">${e.message}</p>
            </div>`;
    }
}

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
        if (rect.width === 0) { setTimeout(ajustar, 200); return; }
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
        ctx.strokeStyle = '#8b5cf6';
        telaCtx = ctx;
    };
    ajustar();
    
    const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        let cx, cy;
        if (e.touches?.length > 0) { cx = e.touches[0].clientX; cy = e.touches[0].clientY; }
        else if (e.changedTouches?.length > 0) { cx = e.changedTouches[0].clientX; cy = e.changedTouches[0].clientY; }
        else { cx = e.clientX; cy = e.clientY; }
        return { x: cx - rect.left, y: cy - rect.top };
    };
    
    const iniciar = (e) => {
        e.preventDefault();
        telaDesenhando = true;
        telaTemAssinatura = true;
        const p = getPos(e);
        telaLastX = p.x;
        telaLastY = p.y;
        wrapper.style.borderColor = '#8b5cf6';
        wrapper.style.borderStyle = 'solid';
        placeholder.style.opacity = '0';
        
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
    canvas.addEventListener('mouseleave', () => { if (telaDesenhando) parar(); });
}

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

async function salvarAssinaturaTela() {
    if (!telaTemAssinatura || !sessaoAssinaturaModo) return;
    
    const btn = safeGet('btnSalvarAssinatura');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
    }
    
    try {
        const base64 = telaCanvas.toDataURL('image/png');
        
        const response = await fetch(`/api/sessoes-assinatura/${sessaoAssinaturaModo}/assinar`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ assinaturaBase64: base64 })
        });
        
        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Erro ao salvar');
        
        safeGet('telaAssinaturaInfo').innerHTML = `
            <div style="text-align: center; padding: 60px 20px;">
                <i class="fas fa-check-circle" style="font-size: 64px; color: #10b981; margin-bottom: 20px; display: block;"></i>
                <h2 style="color: #10b981; margin: 0 0 10px; font-size: 22px;">Assinatura Confirmada!</h2>
                <p style="color: #64748b; margin: 0; font-size: 15px;">
                    A assinatura foi registrada com sucesso.<br>
                    Você já pode fechar esta janela.
                </p>
                <button onclick="window.close()" 
                        style="margin-top: 25px; padding: 14px 28px; background: #8b5cf6; color: white; border: none; border-radius: 10px; font-weight: 600; cursor: pointer; font-size: 15px;">
                    <i class="fas fa-times"></i> Fechar
                </button>
            </div>
        `;
        safeGet('telaAssinaturaArea').style.display = 'none';
        
    } catch (e) {
        console.error('Erro ao salvar assinatura:', e);
        mostrarToastConcluido('❌ ' + e.message, 'error');
        
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-check"></i> Confirmar Assinatura';
        }
    }
}

// ============================================
// 🔔 SISTEMA DE NOTIFICAÇÕES UNIFICADO
// ============================================
let notificacoesInterval = null;
let __notificacoesCache = [];
let __lembretesCache = [];

function isWebView() {
    return /wv|WebView|Android.*Version\/[\d.]+.*Chrome/i.test(navigator.userAgent) ||
           (typeof window.AppInventor !== 'undefined');
}

function mostrarNotificacaoInterna(mensagem, tipo = 'info') {
    if (!isWebView()) { mostrarToastConcluido(mensagem); return; }
    
    const modal = document.createElement('div');
    modal.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center;
        z-index: 999999; padding: 20px; box-sizing: border-box;`;
    const icones = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const cores = { success: '#10b981', error: '#dc2626', warning: '#f59e0b', info: '#8b5cf6' };
    
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

function confirmarInterno(mensagem) {
    return new Promise((resolve) => {
        const old = document.getElementById('confirmInternoModal');
        if (old) old.remove();
        
        const modalHtml = `
            <div class="modal fade" id="confirmInternoModal" tabindex="-1" data-bs-backdrop="static">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header" style="background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white;">
                            <h5 class="modal-title"><i class="fas fa-question-circle"></i> Confirmação</h5>
                        </div>
                        <div class="modal-body" style="white-space: pre-line; font-size: 15px;">${escapeHTML(mensagem)}</div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" id="btnCancelarConfirmInterno">
                                <i class="fas fa-times"></i> Cancelar</button>
                            <button type="button" class="btn btn-danger" id="btnConfirmarConfirmInterno">
                                <i class="fas fa-check"></i> Confirmar</button>
                        </div>
                    </div>
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        const modalEl = document.getElementById('confirmInternoModal');
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
        
        const finalizar = (resultado) => {
            modal.hide();
            setTimeout(() => modalEl.remove(), 300);
            resolve(resultado);
        };
        document.getElementById('btnConfirmarConfirmInterno').addEventListener('click', () => finalizar(true));
        document.getElementById('btnCancelarConfirmInterno').addEventListener('click', () => finalizar(false));
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
        
        const response = await fetch('/api/assistente-social/remarcacoes/pendentes', {
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
            return ordem[calcularNivelAlerta(a).nivel] - ordem[calcularNivelAlerta(b).nivel];
        });
        
        lembretesOrdenados.forEach(r => {
            const nivel = calcularNivelAlerta(r);
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
                        <span><i class="fas fa-calendar"></i> ${formatarDataBR(r.dataRemarcacao)}</span>
                        <span><i class="fas fa-clock"></i> ${r.horarioRemarcacao || '-'}</span>
                    </div>
                    <span class="lembrete-tipo">${escapeHTML(r.tipoTarefaLabel || '')}</span>
                    <div class="lembrete-acoes">
                        <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); verAtendimento('${r.atendimentoId}')">
                            <i class="fas fa-eye"></i> Ver
                        </button>
                        <button class="btn btn-warning btn-sm" onclick="event.stopPropagation(); abrirRemarcar('${r.atendimentoId}')">
                            <i class="fas fa-calendar-plus"></i> Remarcar
                        </button>
                        <button class="btn btn-success btn-sm" onclick="event.stopPropagation(); abrirFinalizacaoRemarcacao('${r.id}')">
                            <i class="fas fa-check"></i> Finalizar
                        </button>
                    </div>
                </div>`;
        });
        
        html += `</div>`;
    }
    
    if (temNotificacoes) {
        html += `
            <div class="notificacoes-secao">
                <div class="notificacoes-secao-titulo" style="background: #ede9fe; color: #5b21b6;">
                    <i class="fas fa-bell" style="color: #8b5cf6;"></i>
                    <span>Notificações do Sistema</span>
                    <span class="badge-count" style="background: #8b5cf6;">${__notificacoesCache.filter(n => !n.lida).length} não lidas</span>
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
                    <div class="notificacao-icone" style="background: ${notif.cor || '#8b5cf6'};">
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
        badge.style.display = 'inline';
        
        const temUrgente = __lembretesCache.some(r => calcularNivelAlerta(r).urgente);
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
        const confirmacao = await confirmarInterno('🗑️ Deseja excluir TODAS as suas notificações do sistema?\n\n⚠️ Os lembretes de remarcação NÃO serão afetados.\n\nEsta ação não pode ser desfeita.');
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
    const confirmar = await confirm('Tem certeza que deseja sair?');
    if (confirmar) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_data');
        window.location.href = '/login.html';
    }
}

// ============================================
// EXPORTAR GLOBAIS
// ============================================
window.selecionarTipo = selecionarTipo;
window.registrarOcorrencia = registrarOcorrencia;
window.limparTela = limparTela;
window.abrirFinalizacao = abrirFinalizacao;
window.confirmarFinalizacao = confirmarFinalizacao;
window.abrirRemarcar = abrirRemarcar;
window.confirmarRemarcacao = confirmarRemarcacao;
window.abrirFinalizacaoRemarcacao = abrirFinalizacaoRemarcacao;
window.confirmarFinalizacaoRemarcacao = confirmarFinalizacaoRemarcacao;
window.abrirRemarcarPorRemarcacao = abrirRemarcarPorRemarcacao;
window.excluirAtendimento = excluirAtendimento;
window.excluirAtendimentoConcluido = excluirAtendimentoConcluido;
window.verAtendimento = verAtendimento;
window.fecharVerAtendimento = fecharVerAtendimento;
window.toggleRelatorioFiltros = toggleRelatorioFiltros;
window.carregarRelatorio = carregarRelatorio;
window.exportarCSV = exportarCSV;
window.logout = logout;
window.selecionarAlunoAutocomplete = selecionarAlunoAutocomplete;
window.limparAssinatura = limparAssinatura;
window.inicializarAssinatura = inicializarAssinatura;
window.obterAssinaturaBase64 = obterAssinaturaBase64;
window.carregarLembretes = carregarLembretes;
window.toggleFiltrosAvancados = toggleFiltrosAvancados;
window.limparFiltrosAndamento = limparFiltrosAndamento;
window.limparFiltroIndividual = limparFiltroIndividual;
window.carregarAtendimentosConcluidos = carregarAtendimentosConcluidos;
window.limparFiltrosConcluidos = limparFiltrosConcluidos;
window.abrirExclusaoEmMassa = abrirExclusaoEmMassa;
window.confirmarExclusaoMassa = confirmarExclusaoMassa;
window.imprimirAtendimento = imprimirAtendimento;
window.mostrarToastConcluido = mostrarToastConcluido;
window.abrirNotificacoes = abrirNotificacoes;
window.abrirNotificacao = abrirNotificacao;
window.marcarTodasLidas = marcarTodasLidas;
window.limparMinhasNotificacoes = limparMinhasNotificacoes;
window.fecharNotificacoes = fecharNotificacoes;
window.mostrarNotificacaoInterna = mostrarNotificacaoInterna;
window.confirmarInterno = confirmarInterno;
window.exportarPDF = exportarPDF;
window.habilitarBotoesRelatorioAS = habilitarBotoesRelatorioAS;
window.gerarHTMLRelatorioAS = gerarHTMLRelatorioAS;

// 🆕 SISTEMA DE SESSÃO DE ASSINATURA
window.assistenteSocial = {
    toggleNecessitaAssinatura,
    abrirModalAssinatura,
    fecharModalAssinatura,
    reabrirModalAssinatura,
    copiarLinkAssinatura,
    cancelarSessaoAssinatura,
    refazerAssinatura,
    mostrarTelaAssinatura,
    limparAssinaturaTela,
    salvarAssinaturaTela
};
