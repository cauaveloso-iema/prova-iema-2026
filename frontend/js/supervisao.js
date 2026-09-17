// ============================================
// SUPERVISÃO - SISTEMA DE ATENDIMENTOS
// Com Filtros, Remarcação, Assinatura, Sino e Notificações
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
let __sinoAberto = false;

let __atendimentosAtivosBrutos = [];
let __atendimentosAtivosFiltrados = [];

let __concluidosPaginaAtual = 1;
let __concluidosPorPagina = 10;
let __concluidosTotal = 0;
let __concluidosDados = [];

// ============================================
// ESTADO DA ASSINATURA DIGITAL
// ============================================
const assinaturaState = {
    canvas: null, ctx: null, desenhando: false, temAssinatura: false,
    lastX: 0, lastY: 0, larguraBase: 0, alturaBase: 0
};

const TIPO_LABELS = {
    'advertencia_verbal': 'Advertência Verbal',
    'advertencia_escrita': 'Advertência Escrita',
    'atendimento_aluno': 'Atendimento Aluno',
    'atendimento_responsavel': 'Atendimento Responsável',
    'atendimento_professor': 'Atendimento Professor',
    'suspensao': 'Suspensão',
    'encaminhamento': 'Encaminhamento',
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
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#0ea5e9"/><stop offset="100%" stop-color="#0284c7"/></linearGradient></defs><circle cx="50" cy="50" r="50" fill="url(#g)"/><text x="50" y="50" font-family="Arial,sans-serif" font-size="45" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="central">${inicial}</text></svg>`;
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
            tag: urgente ? 'supervisao-urgente' : 'supervisao-lembrete',
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
                true, () => abrirSino());
            marcarComoNotificado(r.id, 'atrasado');
            return;
        }
        if (diffMin > 0 && diffMin <= 30 && !jaNotificou(r.id, 'iminente')) {
            enviarNotificacao('🔔 Atendimento em 30 min!',
                `${r.alunoNome} - ${r.tipoTarefaLabel}\n${r.horarioRemarcacao} • ${r.alunoTurma}`,
                true, () => abrirSino());
            marcarComoNotificado(r.id, 'iminente');
            return;
        }
        if (diffMin > 30 && diffMin <= 120 && !jaNotificou(r.id, 'proximo')) {
            enviarNotificacao('⏰ Atendimento próximo',
                `${r.alunoNome} - ${r.tipoTarefaLabel}\nEm ${Math.floor(diffMin / 60)}h ${diffMin % 60}min`,
                false, () => abrirSino());
            marcarComoNotificado(r.id, 'proximo');
            return;
        }
        if (diffMin > 120 && diffMin <= 720 && !jaNotificou(r.id, 'hoje')) {
            enviarNotificacao('📅 Atendimento HOJE',
                `${r.alunoNome} - ${r.tipoTarefaLabel}\nHoje às ${r.horarioRemarcacao}`,
                false, () => abrirSino());
            marcarComoNotificado(r.id, 'hoje');
            return;
        }
        if (diffMin > 720 && diffMin <= 1440 && !jaNotificou(r.id, 'amanha')) {
            enviarNotificacao('📅 Atendimento AMANHÃ',
                `${r.alunoNome} - ${r.tipoTarefaLabel}\nAmanhã às ${r.horarioRemarcacao}`,
                false, () => abrirSino());
            marcarComoNotificado(r.id, 'amanha');
        }
    });
}

function atualizarBadgeComUrgencia() {
    const badge = safeGet('sinoBadge');
    const btn = safeGet('sinoBtn');
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
    const userData = JSON.parse(localStorage.getItem('user_data') || '{}');
    const allowedRoles = ['supervisao', 'super_admin', 'admin'];
    if (!allowedRoles.includes(userData.role)) {
        alert('Acesso negado.');
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
    configurarSino();
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
            if (__sinoAberto) { fecharSino(); return; }
            if (currentAluno) {
                limparTela();
                if (modoAtual === 'automatico') reiniciarScannerAutomatico();
            }
        }
    });
});

window.addEventListener('beforeunload', () => pararScannerAutomatico());

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
// 🔔 SINO
// ============================================
function configurarSino() {
    const sinoBtn = safeGet('sinoBtn');
    if (!sinoBtn) return;
    sinoBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleSino(); });
    document.addEventListener('click', (e) => {
        const dropdown = safeGet('sinoDropdown');
        const btn = safeGet('sinoBtn');
        if (!dropdown || !btn) return;
        if (dropdown.contains(e.target) || btn.contains(e.target)) return;
        if (__sinoAberto) fecharSino();
    });
}

function toggleSino() { __sinoAberto ? fecharSino() : abrirSino(); }
function abrirSino() {
    const dropdown = safeGet('sinoDropdown');
    if (dropdown) { dropdown.classList.add('aberto'); __sinoAberto = true; atualizarStatusNotificacao(); }
}
function fecharSino() {
    const dropdown = safeGet('sinoDropdown');
    if (dropdown) { dropdown.classList.remove('aberto'); __sinoAberto = false; }
}
// ============================================
// LEMBRETES / REMARCAÇÕES
// ============================================
async function carregarLembretes() {
    try {
        const response = await fetch('/api/supervisao/remarcacoes/pendentes', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const contentType = response.headers.get('content-type') || '';
        if (!response.ok || !contentType.includes('application/json')) {
            atualizarSino(0, []);
            return;
        }
        const data = await response.json();
        if (data.success && Array.isArray(data.remarcacoes)) {
            __lembretesAtuais = data.remarcacoes;
            atualizarSino(data.remarcacoes.length, data.remarcacoes);
            verificarLembretesNotificar();
            atualizarBadgeComUrgencia();
            limparNotificacoesAntigas();
        } else {
            atualizarSino(0, []);
        }
    } catch (error) {
        atualizarSino(0, []);
    }
}

function atualizarSino(total, lembretes) {
    const badge = safeGet('sinoBadge');
    const btn = safeGet('sinoBtn');
    const body = safeGet('sinoDropdownBody');
    
    if (badge) {
        if (total > 0) {
            badge.textContent = total > 99 ? '99+' : total;
            badge.style.display = 'flex';
            const temUrgente = lembretes.some(r => calcularNivelAlerta(r).urgente);
            if (temUrgente) {
                btn.classList.add('tem-novidade');
                badge.style.background = '#dc2626';
            } else {
                btn.classList.remove('tem-novidade');
                badge.style.background = '#ef4444';
            }
        } else {
            badge.style.display = 'none';
            btn.classList.remove('tem-novidade');
        }
    }
    
    if (!body) return;
    
    if (total === 0) {
        body.innerHTML = `
            <div class="sino-vazio">
                <i class="fas fa-bell-slash"></i>
                <p>Nenhum lembrete pendente</p>
            </div>`;
        return;
    }
    
    const ordem = { atrasado: 0, iminente: 1, proximo: 2, hoje: 3, amanha: 4, futuro: 5 };
    const lembretesOrdenados = [...lembretes].sort((a, b) => {
        return ordem[calcularNivelAlerta(a).nivel] - ordem[calcularNivelAlerta(b).nivel];
    });
    
    body.innerHTML = lembretesOrdenados.map(r => {
        const nivel = calcularNivelAlerta(r);
        let itemClass = '', badgeClass = 'futuro', badgeText = nivel.label;
        
        if (nivel.nivel === 'atrasado') { itemClass = 'atrasado'; badgeClass = 'atrasado'; badgeText = `⚠️ ${nivel.label}`; }
        else if (nivel.nivel === 'iminente') { itemClass = 'urgente'; badgeClass = 'urgente'; badgeText = `🔴 ${nivel.label}`; }
        else if (nivel.nivel === 'proximo') { itemClass = 'proximo'; badgeClass = 'proximo'; badgeText = `🟠 ${nivel.label}`; }
        else if (nivel.nivel === 'hoje') { itemClass = 'hoje'; badgeClass = 'hoje'; badgeText = `🟡 Hoje ${r.horarioRemarcacao}`; }
        else if (nivel.nivel === 'amanha') { itemClass = 'amanha'; badgeClass = 'amanha'; badgeText = `🔵 Amanhã ${r.horarioRemarcacao}`; }
        
        return `
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
                    <button class="btn btn-primary btn-sm" onclick="verAtendimento('${r.atendimentoId}')"><i class="fas fa-eye"></i> Ver</button>
                    <button class="btn btn-warning btn-sm" onclick="abrirRemarcar('${r.atendimentoId}')"><i class="fas fa-calendar-plus"></i> Remarcar</button>
                    <button class="btn btn-success btn-sm" onclick="abrirFinalizacaoRemarcacao('${r.id}')"><i class="fas fa-check"></i> Finalizar</button>
                </div>
                ${r.motivoRemarcacao ? `<div style="margin-top: 6px; font-size: 11px; color: #6b7280; font-style: italic;"><i class="fas fa-info-circle"></i> ${escapeHTML(r.motivoRemarcacao)}</div>` : ''}
            </div>`;
    }).join('');
}

// ============================================
// VER ATENDIMENTO (MODAL DETALHADO)
// ============================================
async function verAtendimento(atendimentoId) {
    if (!atendimentoId) return;
    fecharSino();
    
    try {
        const response = await fetch(`/api/supervisao/atendimento/${atendimentoId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (!data.success || !data.atendimento) { alert('Erro ao carregar atendimento'); return; }
        const a = data.atendimento;
        
        // Detalhes
        let detalhesHTML = '';
        if (a.detalhes && Object.keys(a.detalhes).length > 0) {
            const detalhesMap = {
                testemunhas: 'Testemunhas',
                descricaoOcorrido: 'Descrição do Ocorrido',
                nomeResponsavel: 'Nome do Responsável',
                parentescoResponsavel: 'Parentesco',
                telefoneResponsavel: 'Telefone',
                compareceu: 'Compareceu',
                nomeProfessor: 'Nome do Professor',
                disciplina: 'Disciplina',
                dataInicioSuspensao: 'Data Início Suspensão',
                dataFimSuspensao: 'Data Fim Suspensão',
                diasSuspensao: 'Dias de Suspensão',
                encaminhadoPara: 'Encaminhado Para',
                motivoEncaminhamento: 'Motivo do Encaminhamento',
                agendadoPara: 'Agendado Para',
                tipoTarefaOutros: 'Especificação',
                providenciasTomadas: 'Providências Tomadas',
                proximosPassos: 'Próximos Passos'
            };
            
            detalhesHTML = '<div class="section-title">📋 Detalhes</div>';
            Object.entries(a.detalhes).forEach(([key, value]) => {
                if (!value || (Array.isArray(value) && value.length === 0)) return;
                const label = detalhesMap[key] || key;
                let valor = value;
                if (Array.isArray(value)) valor = value.join(', ');
                if (typeof value === 'boolean') valor = value ? 'Sim' : 'Não';
                if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/)) {
                    try { valor = new Date(value).toLocaleDateString('pt-BR'); } catch(e){}
                }
                detalhesHTML += `
                    <div class="info-row">
                        <div class="info-label">${escapeHTML(label)}:</div>
                        <div class="info-value">${escapeHTML(String(valor))}</div>
                    </div>`;
            });
        }
        
        // Assinatura
        let assinaturaHTML = '';
        if (a.entrada?.temAssinatura && a.entrada?.assinaturaBase64) {
            assinaturaHTML = `
                <div class="section-title">✍️ Assinatura do Responsável</div>
                <div class="assinatura-preview">
                    <img src="${a.entrada.assinaturaBase64}" alt="Assinatura">
                </div>`;
        }
        
        // Remarcações
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
                            <strong style="color: #0284c7;">#${idx + 1} - ${statusLabel}</strong>
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
                        <div class="modal-header" style="background: linear-gradient(135deg, #0ea5e9, #0284c7); color: white;">
                            <h5 class="modal-title"><i class="fas fa-eye"></i> Detalhes do Atendimento</h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body detalhe-atendimento">
                            <div style="display: flex; align-items: center; gap: 12px; padding: 12px; background: #f0f9ff; border-radius: 10px; margin-bottom: 16px;">
                                <img src="${gerarAvatarSVG(a.alunoNome)}" style="width: 50px; height: 50px; border-radius: 50%;" alt="">
                                <div style="flex: 1;">
                                    <h5 style="margin: 0; color: #075985;">${escapeHTML(a.alunoNome)}</h5>
                                    <small style="color: #6b7280;">
                                        <i class="fas fa-id-card"></i> ${escapeHTML(a.alunoMatricula || '-')} • 
                                        <i class="fas fa-graduation-cap"></i> ${escapeHTML(a.alunoTurma || '-')}
                                    </small>
                                </div>
                                <span class="badge" style="background: #0ea5e9; font-size: 12px;">${escapeHTML(a.tipoTarefaLabel)}</span>
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
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal"><i class="fas fa-times"></i> Fechar</button>
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
        alert('Erro ao carregar detalhes');
    }
}

function fecharVerAtendimento() {
    const modal = bootstrap.Modal.getInstance(safeGet('modalVerAtendimento'));
    if (modal) modal.hide();
    setTimeout(() => { const el = safeGet('modalVerAtendimento'); if (el) el.remove(); }, 300);
}

// ============================================
// ✏️ EDITAR ATENDIMENTO
// ============================================
async function abrirEditarAtendimento(atendimentoId) {
    if (!atendimentoId) return;
    
    try {
        const response = await fetch(`/api/supervisao/atendimento/${atendimentoId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (!data.success || !data.atendimento) {
            alert('Erro ao carregar atendimento');
            return;
        }
        
        const a = data.atendimento;
        const oldModal = safeGet('modalEditarAtendimento');
        if (oldModal) oldModal.remove();
        
        // Monta as opções de tipo de tarefa
        const tiposOptions = Object.entries(TIPO_LABELS).map(([key, label]) => 
            `<option value="${key}" ${a.tipoTarefa === key ? 'selected' : ''}>${label}</option>`
        ).join('');
        
        const modalHtml = `
            <div class="modal fade" id="modalEditarAtendimento" tabindex="-1">
                <div class="modal-dialog modal-lg modal-dialog-scrollable">
                    <div class="modal-content">
                        <div class="modal-header" style="background: linear-gradient(135deg, #0ea5e9, #0284c7); color: white;">
                            <h5 class="modal-title">
                                <i class="fas fa-edit"></i> Editar Atendimento
                            </h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <input type="hidden" id="editAtendimentoId" value="${a.id}">
                            
                            <div style="display: flex; align-items: center; gap: 12px; padding: 12px; background: #f0f9ff; border-radius: 10px; margin-bottom: 16px;">
                                <img src="${gerarAvatarSVG(a.alunoNome)}" style="width: 50px; height: 50px; border-radius: 50%;" alt="">
                                <div style="flex: 1;">
                                    <h5 style="margin: 0; color: #075985;">${escapeHTML(a.alunoNome)}</h5>
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
        alert('Erro ao carregar para edição');
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
        alert('Preencha todos os campos obrigatórios');
        return;
    }
    
    try {
        const response = await fetch(`/api/supervisao/atendimento/${atendimentoId}`, {
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
            alert('❌ ' + (data.error || 'Erro ao salvar'));
        }
    } catch (error) {
        console.error('Erro:', error);
        alert('Erro ao salvar alterações');
    }
}

// ============================================
// 🖨️ IMPRESSÃO DE ATENDIMENTO (COM CARIMBO DA SUPERVISÃO)
// ============================================
async function imprimirAtendimento(atendimentoId) {
    if (!atendimentoId) return;
    
    try {
        const response = await fetch(`/api/supervisao/atendimento/${atendimentoId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (!data.success || !data.atendimento) {
            alert('Erro ao carregar atendimento');
            return;
        }
        
        const a = data.atendimento;
        
        let qr = '';
        try {
            const qrR = await fetch(`/api/aluno/qrcode/${a.alunoId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const qrD = await qrR.json();
            if (qrD.success && qrD.qrCode) qr = qrD.qrCode;
        } catch (e) { console.warn('Sem QR Code'); }
        
        const win = window.open('', '_blank');
        win.document.write(gerarHTMLImpressaoSupervisao(a, qr));
        win.document.close();
        win.onload = () => setTimeout(() => win.print(), 500);
    } catch (e) {
        console.error(e);
        alert('Erro ao imprimir atendimento');
    }
}

function gerarHTMLImpressaoSupervisao(a, qrCodeUrl) {
    const logo = '/uploads/logo-iema.png';
    const carimbo = '/icons/assinatura_supervisao.ico';
    const dataExt = new Date(a.entrada.dataHora).toLocaleDateString('pt-BR', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
    
    const assinaturaHTML = a.entrada?.temAssinatura && a.entrada?.assinaturaBase64
        ? `<div class="assinatura-digital"><img src="${a.entrada.assinaturaBase64}" alt="Assinatura"></div>`
        : '<div class="assinatura-vazia">_____________________________________</div>';
    
    const carimboHTML = `
        <div class="carimbo-supervisao">
            <img src="${carimbo}" alt="Carimbo Supervisão">
        </div>`;
    
    return `<!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <title>Atendimento Supervisão - ${a.alunoNome}</title>
        <style>
            @page { size: A4 landscape; margin: 0; }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            html, body { width: 297mm; height: 210mm; font-family: 'Times New Roman', Times, serif; background: #f0f0f0; }
            .folha-metade {
                width: 148.5mm; height: 210mm; padding: 8mm 10mm;
                background: white; position: relative; margin: 0;
                page-break-after: always; overflow: hidden;
                font-size: 9pt; line-height: 1.3;
            }
            @media print {
                html, body { width: 297mm; height: 210mm; background: white; }
                .folha-metade { width: 148.5mm; height: 210mm; padding: 8mm 10mm; page-break-after: always; }
                .btn-print { display: none !important; }
            }
            .header { text-align: center; border-bottom: 2px double #000; padding-bottom: 5px; margin-bottom: 6px; }
            .header img { max-width: 100%; height: auto; max-height: 22mm; object-fit: contain; }
            .header h1 { font-size: 9pt; margin: 3px 0 0 0; text-transform: uppercase; font-weight: bold; }
            .titulo {
                text-align: center; font-size: 11pt; font-weight: bold; text-transform: uppercase;
                margin: 6px 0; background: #e0f2fe; padding: 5px; border: 1.5px solid #000; letter-spacing: 1px;
            }
            .info-section { border: 1px solid #000; padding: 6px 8px; margin-bottom: 6px; }
            .info-row { display: flex; margin-bottom: 4px; gap: 10px; align-items: baseline; }
            .info-row:last-child { margin-bottom: 0; }
            .info-item { flex: 1; display: flex; align-items: baseline; gap: 4px; min-width: 0; }
            .label { font-weight: bold; font-size: 8pt; white-space: nowrap; }
            .underline {
                border-bottom: 1px dotted #000; flex: 1; height: 14px; min-height: 14px;
                font-size: 9pt; padding: 0 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            }
            .section-box { background: #f5f5f5; border: 1px solid #000; padding: 6px 8px; margin: 6px 0; }
            .section-box h3 { margin: 0 0 3px 0; font-size: 9pt; text-transform: uppercase; }
            .section-box p { margin: 0; font-size: 9pt; }
            .descricao-box { border: 1px solid #000; padding: 6px 8px; min-height: 20mm; margin: 6px 0; font-size: 8.5pt; }
            .descricao-box strong { display: block; margin-bottom: 3px; font-size: 9pt; }
            .assinaturas { display: flex; justify-content: space-around; margin-top: 4mm; gap: 8mm; }
            .assinatura { text-align: center; flex: 1; font-size: 8pt; }
            .assinatura-digital {
                border-bottom: 1px solid #000; min-height: 15mm;
                display: flex; align-items: flex-end; justify-content: center; padding-bottom: 2px;
            }
            .assinatura-digital img { max-height: 14mm; max-width: 100%; object-fit: contain; }
            .assinatura-vazia {
                border-bottom: 1px solid #000; min-height: 15mm;
                display: flex; align-items: flex-end; justify-content: center;
                color: #999; font-size: 8pt; padding-bottom: 2px;
            }
            .assinatura-linha { padding-top: 3px; font-size: 8pt; }
            .carimbo-supervisao {
                border-bottom: 1px solid #000; min-height: 15mm;
                display: flex; align-items: flex-end; justify-content: center; padding-bottom: 2px;
            }
            .carimbo-supervisao img {
                max-height: 14mm; max-width: 100%; object-fit: contain; opacity: 0.9;
            }
            .qr-code { text-align: center; margin-top: 4px; }
            .qr-code img { width: 18mm; height: 18mm; border: 1px solid #000; padding: 1px; }
            .qr-code p { font-size: 7pt; margin: 2px 0 0 0; }
            .footer {
                text-align: center; margin-top: 5px; padding-top: 4px;
                border-top: 1px solid #000; font-size: 7pt; color: #444;
            }
            .footer p { margin: 1px 0; }
            .btn-print {
                display: block; margin: 15px auto; padding: 10px 30px;
                background: #0ea5e9; color: white; border: none; border-radius: 8px;
                font-weight: bold; cursor: pointer; font-size: 14px; font-family: Arial, sans-serif;
            }
            .btn-print:hover { background: #0284c7; }
            .linha-corte {
                position: fixed; left: 148.5mm; top: 0; width: 0; height: 210mm;
                border-left: 1px dashed #999; pointer-events: none;
            }
            @media print { .linha-corte { display: none; } }
        </style>
    </head>
    <body>
        <button class="btn-print no-print" onclick="window.print()">🖨️ Imprimir</button>
        <div class="linha-corte"></div>
        <div class="folha-metade">
            <div class="header">
                <img src="${logo}" alt="IEMA" onerror="this.style.display='none'">
                <h1>IEMA PLENO: SÃO LUÍS - CENTRO</h1>
            </div>
            <div class="titulo">🛡️ ATENDIMENTO SUPERVISÃO</div>
            
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
            </div>
            
            <div class="section-box">
                <h3>📌 Tipo de Tarefa:</h3>
                <p><strong>${a.tipoTarefaLabel || '-'}</strong></p>
            </div>
            
            <div class="section-box">
                <h3>⚠️ Gravidade / Prioridade:</h3>
                <p>Gravidade: <strong>${(a.entrada?.gravidade || 'media').toUpperCase()}</strong> | 
                   Prioridade: <strong>${(a.prioridade || 'normal').toUpperCase()}</strong></p>
            </div>
            
            <div class="descricao-box">
                <strong>📝 Descrição do Ocorrido:</strong>
                ${a.entrada?.descricao || '_______________________________________________________________'}
            </div>
            
            ${a.entrada?.observacoes ? `
                <div class="descricao-box" style="min-height: 12mm;">
                    <strong>💬 Observações:</strong>
                    ${a.entrada.observacoes}
                </div>
            ` : ''}
            
            <div class="assinaturas">
                <div class="assinatura">
                    ${assinaturaHTML}
                    <div class="assinatura-linha">Assinatura do Responsável</div>
                </div>
                <div class="assinatura">
                    ${carimboHTML}
                    <div class="assinatura-linha">Supervisão</div>
                </div>
            </div>
            
            ${qrCodeUrl ? `
                <div class="qr-code">
                    <img src="${qrCodeUrl}" alt="QR Code">
                    <p>Identificação do Aluno</p>
                </div>` : ''}
            
            <div class="footer">
                <p>Gerado em ${new Date().toLocaleString('pt-BR')} por ${a.entrada?.registradoPor || 'Supervisão'}</p>
                <p>Sistema de Provas IEMA</p>
            </div>
        </div>
    </body>
    </html>`;
}

// ============================================
// ASSINATURA DIGITAL
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
        ctx.strokeStyle = '#0284c7';
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
        qrContainer.innerHTML = `<div class="alert alert-warning m-3">Não foi possível acessar a câmera.</div>`;
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
    if (!alunoId) { alert('QR Code inválido'); return; }
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
        const response = await fetch('/api/supervisao/turmas', {
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
        const response = await fetch(`/api/supervisao/alunos-por-turma?turma=${encodeURIComponent(turma)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success && Array.isArray(data.alunos)) {
            alunosPorTurma = data.alunos;
            filtrarAlunosManual();
        } else {
            safeGet('listaAlunosManual').innerHTML = '<div class="alert alert-warning">Nenhum aluno</div>';
        }
    } catch (error) {
        safeGet('listaAlunosManual').innerHTML = '<div class="alert alert-danger">Erro</div>';
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
            <i class="fas fa-hand-pointer fa-2x" style="color: #0ea5e9;"></i>
        </div>`).join('') + '</div>';
    
    container.querySelectorAll('.list-group-item').forEach(item => {
        item.addEventListener('click', () => selecionarAluno(item.getAttribute('data-aluno-id'), item.getAttribute('data-aluno-nome'), item));
    });
}

async function selecionarAluno(alunoId, alunoNome, itemEl) {
    if (itemEl) {
        itemEl.style.background = '#f0f9ff'; itemEl.style.borderColor = '#0ea5e9'; itemEl.style.pointerEvents = 'none';
        itemEl.innerHTML = `<div><strong>${escapeHTML(alunoNome)}</strong><br><small style="color: #0284c7;">Processando...</small></div><i class="fas fa-spinner fa-spin fa-2x" style="color: #0284c7;"></i>`;
    }
    try { await buscarAluno(alunoId); } catch (error) {}
}

async function buscarAluno(alunoId) {
    try {
        await pararScannerAutomatico();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const response = await fetch(`/api/supervisao/aluno/${alunoId}`, {
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
            alert(data.error || 'Aluno não encontrado');
            if (modoAtual === 'automatico') reiniciarScannerAutomatico(); else carregarAlunosPorTurma();
        }
    } catch (error) {
        alert(error.name === 'AbortError' ? 'Tempo esgotado' : 'Erro ao buscar aluno');
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
                <div class="alert alert-warning">
                    <i class="fas fa-clock"></i> <strong>${data.atendimentosAtivos.length} atendimento(s) em andamento</strong>
                    ${data.atendimentosAtivos.map(a => `
                        <div class="mt-2 p-2" style="background: white; border-radius: 8px;">
                            <strong>${escapeHTML(a.tipoTarefaLabel || '')}</strong>: ${escapeHTML((a.descricao || '').substring(0, 100))}
                            <br><small class="text-muted"><i class="fas fa-clock"></i> ${a.dataHoraEntrada ? new Date(a.dataHoraEntrada).toLocaleString('pt-BR') : ''}</small>
                        </div>`).join('')}
                </div>`;
        } else {
            statusDiv.innerHTML = `<div class="alert alert-info"><i class="fas fa-info-circle"></i> Nenhum atendimento em andamento</div>`;
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
    
    switch (tipo) {
        case 'advertencia_verbal':
        case 'advertencia_escrita':
            html = `
                <div class="mb-3">
                    <label class="form-label">Testemunhas (separadas por vírgula)</label>
                    <input type="text" id="detalheTestemunhas" class="form-control" placeholder="Ex: Prof. João, Coord. Maria">
                </div>
                <div class="mb-3">
                    <label class="form-label">Descrição detalhada do ocorrido</label>
                    <textarea id="detalheDescricaoOcorrido" class="form-control" rows="3" placeholder="Descreva o que aconteceu..."></textarea>
                </div>`;
            break;
        case 'atendimento_responsavel':
            html = `
                <div class="row">
                    <div class="col-md-6 mb-3">
                        <label class="form-label">Nome do Responsável</label>
                        <input type="text" id="detalheNomeResponsavel" class="form-control">
                    </div>
                    <div class="col-md-6 mb-3">
                        <label class="form-label">Parentesco</label>
                        <input type="text" id="detalheParentesco" class="form-control" placeholder="Ex: Mãe, Pai, Avó">
                    </div>
                </div>
                <div class="row">
                    <div class="col-md-6 mb-3">
                        <label class="form-label">Telefone</label>
                        <input type="text" id="detalheTelefone" class="form-control">
                    </div>
                    <div class="col-md-6 mb-3">
                        <label class="form-label">Compareceu?</label>
                        <select id="detalheCompareceu" class="form-select">
                            <option value="true">Sim</option>
                            <option value="false">Não</option>
                        </select>
                    </div>
                </div>`;
            break;
        case 'atendimento_professor':
            html = `
                <div class="row">
                    <div class="col-md-6 mb-3">
                        <label class="form-label">Nome do Professor</label>
                        <input type="text" id="detalheNomeProfessor" class="form-control">
                    </div>
                    <div class="col-md-6 mb-3">
                        <label class="form-label">Disciplina</label>
                        <input type="text" id="detalheDisciplina" class="form-control">
                    </div>
                </div>`;
            break;
        case 'suspensao':
            html = `
                <div class="row">
                    <div class="col-md-4 mb-3">
                        <label class="form-label">Data Início</label>
                        <input type="date" id="detalheDataInicioSuspensao" class="form-control">
                    </div>
                    <div class="col-md-4 mb-3">
                        <label class="form-label">Data Fim</label>
                        <input type="date" id="detalheDataFimSuspensao" class="form-control">
                    </div>
                    <div class="col-md-4 mb-3">
                        <label class="form-label">Total de Dias</label>
                        <input type="number" id="detalheDiasSuspensao" class="form-control" min="1">
                    </div>
                </div>`;
            break;
        case 'encaminhamento':
            html = `
                <div class="mb-3">
                    <label class="form-label">Encaminhado para</label>
                    <select id="detalheEncaminhadoPara" class="form-select">
                        <option value="">Selecione...</option>
                        <option value="Psicólogo">Psicólogo</option>
                        <option value="Assistente Social">Assistente Social</option>
                        <option value="Psiquiatra">Psiquiatra</option>
                        <option value="Conselho Tutelar">Conselho Tutelar</option>
                        <option value="Outro">Outro</option>
                    </select>
                </div>
                <div class="mb-3">
                    <label class="form-label">Motivo do Encaminhamento</label>
                    <textarea id="detalheMotivoEncaminhamento" class="form-control" rows="2"></textarea>
                </div>
                <div class="mb-3">
                    <label class="form-label">Agendado para</label>
                    <input type="date" id="detalheAgendadoPara" class="form-control">
                </div>`;
            break;
        case 'outros':
            html = `
                <div class="mb-3">
                    <label class="form-label">Especifique o Tipo de Tarefa <span class="text-danger">*</span></label>
                    <input type="text" id="detalheTipoTarefaOutros" class="form-control" placeholder="Descreva o tipo...">
                </div>`;
            break;
    }
    
    html += `
        <div class="mb-3">
            <label class="form-label">Providências Tomadas</label>
            <textarea id="detalheProvidencias" class="form-control" rows="2" placeholder="O que já foi feito..."></textarea>
        </div>
        <div class="mb-3">
            <label class="form-label">Próximos Passos</label>
            <textarea id="detalheProximosPassos" class="form-control" rows="2" placeholder="O que será feito..."></textarea>
        </div>`;
    
    container.innerHTML = html;
}

function coletarDetalhes() {
    const detalhes = {};
    
    const testemunhasEl = safeGet('detalheTestemunhas');
    if (testemunhasEl) {
        detalhes.testemunhas = testemunhasEl.value.split(',').map(t => t.trim()).filter(t => t.length > 0);
    }
    
    const compareceuEl = safeGet('detalheCompareceu');
    if (compareceuEl) detalhes.compareceu = compareceuEl.value === 'true';
    
    const camposTexto = {
        'detalheDescricaoOcorrido': 'descricaoOcorrido',
        'detalheNomeResponsavel': 'nomeResponsavel',
        'detalheParentesco': 'parentescoResponsavel',
        'detalheTelefone': 'telefoneResponsavel',
        'detalheNomeProfessor': 'nomeProfessor',
        'detalheDisciplina': 'disciplina',
        'detalheEncaminhadoPara': 'encaminhadoPara',
        'detalheMotivoEncaminhamento': 'motivoEncaminhamento',
        'detalheTipoTarefaOutros': 'tipoTarefaOutros',
        'detalheProvidencias': 'providenciasTomadas',
        'detalheProximosPassos': 'proximosPassos'
    };
    
    Object.entries(camposTexto).forEach(([elementId, key]) => {
        const el = safeGet(elementId);
        if (el && el.value) detalhes[key] = el.value.trim();
    });
    
    const camposData = {
        'detalheDataInicioSuspensao': 'dataInicioSuspensao',
        'detalheDataFimSuspensao': 'dataFimSuspensao',
        'detalheAgendadoPara': 'agendadoPara'
    };
    
    Object.entries(camposData).forEach(([elementId, key]) => {
        const el = safeGet(elementId);
        if (el && el.value) detalhes[key] = new Date(el.value);
    });
    
    const diasEl = safeGet('detalheDiasSuspensao');
    if (diasEl && diasEl.value) {
        const dias = parseInt(diasEl.value);
        if (!isNaN(dias) && dias > 0) detalhes.diasSuspensao = dias;
    }
    
    return detalhes;
}

// ============================================
// REGISTRAR
// ============================================
async function registrarOcorrencia() {
    if (!tipoTarefaSelecionado) { alert('Selecione o tipo de tarefa'); return; }
    const descricao = (safeGet('descricao')?.value || '').trim();
    if (!descricao) { alert('Descreva o ocorrido'); return; }
    if (!currentAluno || !currentAluno.id) { alert('Nenhum aluno selecionado'); return; }
    
    const btn = document.querySelector('#formRegistro .btn-primary-custom');
    if (btn) btn.disabled = true;
    
    try {
        const response = await fetch('/api/supervisao/registrar', {
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
                assinaturaBase64: obterAssinaturaBase64()
            })
        });
        const data = await response.json();
        if (data.success) { alert(`✅ ${data.message}`); finalizarAposSucesso(); }
        else alert('❌ ' + (data.error || 'Erro ao registrar'));
    } catch (error) { alert('Erro: ' + error.message); }
    finally { if (btn) btn.disabled = false; }
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
        const response = await fetch('/api/supervisao/atendimentos-ativos', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        __atendimentosAtivosBrutos = (data.success && Array.isArray(data.atendimentos)) ? data.atendimentos : [];
        popularFiltroTurmasAndamento();
        aplicarFiltrosAndamento();
        atualizarBadgeTabAtivos(__atendimentosAtivosBrutos.length);
    } catch (error) {
        container.innerHTML = `<div class="alert alert-danger"><i class="fas fa-exclamation-triangle"></i> Erro ao carregar</div>`;
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
                        <span class="badge" style="background: #0ea5e9;">${escapeHTML(a.tipoTarefaLabel || '')}</span>
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
                <div class="modal-header" style="background: linear-gradient(135deg, #0ea5e9, #0284c7); color: white;">
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
    const modal = bootstrap.Modal.getInstance(safeGet('modalFinalizar'));
    if (modal) modal.hide();
    if (resultado === 'em_acompanhamento') {
        const querRemarcar = confirm('✅ Atendimento marcado como "Em Acompanhamento".\n\n🔄 Deseja REMARCAR este atendimento?\n\n• Sim → Abre formulário de remarcação\n• Não → Apenas finaliza');
        if (querRemarcar) {
            await finalizarAtendimento(atendimentoId, resultado, true);
            setTimeout(() => abrirRemarcar(atendimentoId), 500);
            return;
        }
    }
    await finalizarAtendimento(atendimentoId, resultado, false);
}

async function finalizarAtendimento(atendimentoId, resultado, pularAlerta) {
    try {
        const response = await fetch('/api/supervisao/finalizar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ atendimentoId, resultado, observacoesFinais: '' })
        });
        const data = await response.json();
        if (data.success) {
            if (!pularAlerta) alert(`✅ ${data.message}`);
            carregarAtendimentosAtivos();
            carregarDashboard();
            carregarLembretes();
        } else alert('❌ ' + (data.error || 'Erro'));
    } catch (error) { alert('Erro ao finalizar'); }
}

function abrirRemarcar(atendimentoId) {
    if (!atendimentoId) return;
    fecharSino();
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
    if (!dataRemarcacao || !horarioRemarcacao || !motivoRemarcacao) { alert('Preencha todos os campos'); return; }
    try {
        const response = await fetch('/api/supervisao/remarcar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ atendimentoId, dataRemarcacao, horarioRemarcacao, motivoRemarcacao, observacoesRemarcacao })
        });
        const ct = response.headers.get('content-type') || '';
        if (!ct.includes('application/json')) { alert('⚠️ Funcionalidade indisponível no servidor'); return; }
        const data = await response.json();
        if (data.success) {
            alert(`✅ ${data.message}`);
            const modal = bootstrap.Modal.getInstance(safeGet('modalRemarcar'));
            if (modal) modal.hide();
            carregarAtendimentosAtivos();
            carregarLembretes();
        } else alert('❌ ' + (data.error || 'Erro'));
    } catch (error) { alert('Erro ao remarcar'); }
}

function abrirFinalizacaoRemarcacao(remarcacaoId) {
    if (!remarcacaoId) return;
    fecharSino();
    const modalHtml = `
        <div class="modal fade" id="modalFinalizarRemarcacao" tabindex="-1">
            <div class="modal-dialog"><div class="modal-content">
                <div class="modal-header" style="background: linear-gradient(135deg, #0ea5e9, #0284c7); color: white;">
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
    if (acao === 'cancelado' && !confirm('Tem certeza que deseja CANCELAR?')) return;
    try {
        const response = await fetch('/api/supervisao/remarcacoes/finalizar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ remarcacaoId, acao })
        });
        const data = await response.json();
        if (data.success) {
            alert(`✅ ${data.message}`);
            carregarAtendimentosAtivos();
            carregarLembretes();
        } else alert('❌ ' + (data.error || 'Erro'));
    } catch (error) { alert('Erro ao finalizar remarcação'); }
}

function abrirRemarcarPorRemarcacao(remarcacaoId) {
    const modal = bootstrap.Modal.getInstance(safeGet('modalFinalizarRemarcacao'));
    if (modal) modal.hide();
    fetch(`/api/supervisao/remarcacoes/${remarcacaoId}`, { headers: { 'Authorization': `Bearer ${token}` } })
        .then(r => r.json())
        .then(data => {
            if (data.success && data.remarcacao?.atendimentoId) abrirRemarcar(data.remarcacao.atendimentoId);
            else alert('Erro ao carregar dados');
        })
        .catch(e => alert('Erro ao carregar dados'));
}

async function excluirAtendimento(atendimentoId) {
    if (!atendimentoId) return;
    if (!confirm('⚠️ Tem certeza que deseja EXCLUIR este atendimento?\n\nEsta ação não pode ser desfeita!')) return;
    if (!confirm('⚠️ ÚLTIMA CONFIRMAÇÃO!\n\nTodos os dados serão perdidos permanentemente.')) return;
    try {
        const response = await fetch(`/api/supervisao/atendimento/${atendimentoId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success) {
            alert('✅ Atendimento excluído!');
            carregarAtendimentosAtivos();
            carregarDashboard();
            carregarLembretes();
            carregarAtendimentosConcluidos(__concluidosPaginaAtual);
        } else alert('❌ ' + (data.error || 'Erro'));
    } catch (error) { alert('Erro ao excluir'); }
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
        
        const response = await fetch(`/api/supervisao/atendimentos?${params.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (!data.success || !Array.isArray(data.atendimentos)) {
            container.innerHTML = `<div class="alert alert-warning">Nenhum atendimento concluído encontrado</div>`;
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
        container.innerHTML = `<div class="alert alert-danger"><i class="fas fa-exclamation-triangle"></i> Erro ao carregar</div>`;
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
                <thead style="background: #f0f9ff;">
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
                                <td><span class="badge" style="background: #0ea5e9; font-size: 10px;">${escapeHTML(a.tipoTarefaLabel || '')}</span></td>
                                <td><small>${a.dataEntradaFormatada || (a.dataEntrada ? new Date(a.dataEntrada).toLocaleDateString('pt-BR') : '-')}</small></td>
                                <td><small>${a.saida?.dataHoraFormatada || '-'}</small></td>
                                <td><span class="badge" style="background: ${r.color}; font-size: 10px;">${r.icon} ${escapeHTML(r.label)}</span></td>
                                <td class="text-center">
                                    <div class="d-flex gap-1 justify-content-center">
                                        <button class="btn btn-sm btn-info" onclick="verAtendimento('${a.id}')" title="Ver detalhes"><i class="fas fa-eye"></i></button>
                                        <button class="btn btn-sm btn-success" onclick="imprimirAtendimento('${a.id}')" title="Imprimir"><i class="fas fa-print"></i></button>
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
    if (!confirm(`⚠️ Tem certeza que deseja EXCLUIR este atendimento?\n\nAluno: ${alunoNome}\n\nEsta ação não pode ser desfeita!`)) return;
    if (!confirm(`⚠️ ÚLTIMA CONFIRMAÇÃO!\n\nTodos os dados serão perdidos permanentemente.`)) return;
    
    try {
        const response = await fetch(`/api/supervisao/atendimento/${atendimentoId}`, {
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
                    if (tabela && tabela.children.length === 0) carregarAtendimentosConcluidos(__concluidosPaginaAtual);
                }, 300);
            }
            mostrarToastConcluido('✅ Atendimento excluído com sucesso!', 'success');
            carregarDashboard();
            carregarLembretes();
        } else alert('❌ ' + (data.error || 'Erro'));
    } catch (error) { alert('Erro ao excluir atendimento'); }
}

// ============================================
// 🍞 TOAST
// ============================================
function mostrarToastConcluido(mensagem, tipo = 'info') {
    const cores = { success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#0ea5e9' };
    const icons = { success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
    
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed; bottom: 20px; right: 20px;
        background: ${cores[tipo] || cores.info}; color: white;
        padding: 12px 20px; border-radius: 10px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.2); z-index: 99999;
        font-size: 14px; font-weight: 600;
        display: flex; align-items: center; gap: 10px;
        animation: slideInRight 0.3s ease-out; max-width: 400px;`;
    toast.innerHTML = `<i class="fas ${icons[tipo] || icons.info}"></i> ${mensagem}`;
    
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
                    <div class="alert alert-danger">
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
    if (confirmacao !== 'CONFIRMAR') { alert('⚠️ Digite "CONFIRMAR" para prosseguir'); return; }
    if (!dataCorte) { alert('⚠️ Selecione uma data de corte'); return; }
    
    const modal = bootstrap.Modal.getInstance(safeGet('modalExclusaoMassa'));
    if (modal) modal.hide();
    
    try {
        const response = await fetch('/api/supervisao/atendimentos/exclusao-massa', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ dataCorte, status: 'finalizado', confirmacao: 'CONFIRMAR' })
        });
        const ct = response.headers.get('content-type') || '';
        if (!ct.includes('application/json')) { alert('⚠️ Funcionalidade indisponível no servidor.'); return; }
        const data = await response.json();
        if (data.success) {
            mostrarToastConcluido(`✅ ${data.excluidos || 0} atendimentos excluídos!`, 'success');
            carregarAtendimentosConcluidos(1);
            carregarDashboard();
        } else alert('❌ ' + (data.error || 'Erro'));
    } catch (error) { alert('Erro ao excluir em massa'); }
}

// ============================================
// DASHBOARD
// ============================================
async function carregarDashboard() {
    try {
        const response = await fetch('/api/supervisao/dashboard', { headers: { 'Authorization': `Bearer ${token}` } });
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
                        backgroundColor: ['#0ea5e9', '#0284c7', '#38bdf8', '#7dd3fc', '#bae6fd', '#e0f2fe', '#f0f9ff', '#f5f9ff'],
                        borderRadius: 8 }]
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
                        borderColor: '#0ea5e9', backgroundColor: 'rgba(14, 165, 233, 0.1)', fill: true, tension: 0.4 }] },
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
                        backgroundColor: '#38bdf8', borderRadius: 8 }] },
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
        const response = await fetch('/api/supervisao/turmas', { headers: { 'Authorization': `Bearer ${token}` } });
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
        const turmasRes = await fetch('/api/supervisao/turmas', { headers: { 'Authorization': `Bearer ${token}` } });
        const turmasData = await turmasRes.json();
        if (!turmasData.success || !Array.isArray(turmasData.turmas)) return;
        const todos = [];
        for (const turma of turmasData.turmas) {
            try {
                const res = await fetch(`/api/supervisao/alunos-por-turma?turma=${encodeURIComponent(turma)}`, { headers: { 'Authorization': `Bearer ${token}` } });
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
        info.style.color = '#0284c7';
    }
}

async function carregarRelatorio() {
    const tipo = safeGet('tipoRelatorio')?.value;
    const dI = safeGet('dataInicio')?.value || '';
    const dF = safeGet('dataFim')?.value || '';
    let url = '';
    try {
        if (tipo === 'geral') { url = `/api/supervisao/relatorio/geral?`; if (dI) url += `dataInicio=${dI}&`; if (dF) url += `dataFim=${dF}&`; }
        else if (tipo === 'turma') {
            const turma = safeGet('filtroTurma')?.value;
            if (!turma) { alert('Selecione uma turma'); return; }
            url = `/api/supervisao/relatorio/turma/${encodeURIComponent(turma)}?`;
            if (dI) url += `dataInicio=${dI}&`; if (dF) url += `dataFim=${dF}&`;
        } else if (tipo === 'aluno') {
            const alunoId = safeGet('filtroAluno')?.value;
            if (!alunoId) { alert('Selecione um aluno'); return; }
            url = `/api/supervisao/relatorio/aluno/${alunoId}?`;
            if (dI) url += `dataInicio=${dI}&`; if (dF) url += `dataFim=${dF}&`;
        }
        const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await response.json();
        if (data.success) { relatorioData = data; exibirRelatorio(data, tipo); }
        else alert('Erro: ' + (data.error || ''));
    } catch (error) { alert('Erro ao carregar relatório'); }
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
                    <p>Total: <strong>${data.totalAtendimentos || 0}</strong></p>
                    <h6 class="mt-4">Por Tipo</h6>
                    <div class="row">${porTipo.map(t => `<div class="col-md-4 mb-2"><div class="p-2" style="background:#e0f2fe;border-radius:8px;"><strong>${escapeHTML(t.label || '')}</strong>: ${t.count || 0}</div></div>`).join('')}</div>
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
                    <div class="row">${porTipo.map(t => `<div class="col-md-4 mb-2"><div class="p-2" style="background:#e0f2fe;border-radius:8px;"><strong>${escapeHTML(t.label || '')}</strong>: ${t.count || 0}</div></div>`).join('')}</div>
                    <h6 class="mt-4">Por Aluno</h6>
                    <div class="table-responsive"><table class="table table-sm">
                        <thead><tr><th>Aluno</th><th>Total</th><th>Tipos</th></tr></thead>
                        <tbody>${porAluno.map(a => `<tr><td>${escapeHTML(a.alunoNome || '')}</td><td><span class="badge" style="background:#0ea5e9;">${a.total || 0}</span></td><td>${Object.entries(a.tipos || {}).map(([t, c]) => `${escapeHTML(TIPO_LABELS[t] || t)}: ${c}`).join(', ')}</td></tr>`).join('')}</tbody>
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
                        <div class="col-md-6"><h6>Por Tipo</h6>${porTipo.map(t => `<div class="d-flex justify-content-between mb-1"><span>${escapeHTML(t.label || '')}</span><span class="badge" style="background:#0ea5e9;">${t.count || 0}</span></div>`).join('')}</div>
                        <div class="col-md-6"><h6>Por Gravidade</h6>${Object.entries(porGrav).map(([g, c]) => `<div class="d-flex justify-content-between mb-1"><span>${escapeHTML(g)}</span><span class="badge bg-secondary">${c}</span></div>`).join('')}</div>
                    </div>
                    <h6 class="mt-4">Histórico</h6>
                    <div class="table-responsive"><table class="table table-sm">
                        <thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Status</th><th></th></tr></thead>
                        <tbody>${atendimentos.map(a => `<tr><td>${a.dataEntrada ? new Date(a.dataEntrada).toLocaleString('pt-BR') : '-'}</td><td>${escapeHTML(a.tipoTarefaLabel || '')}</td><td>${escapeHTML((a.descricao || '').substring(0, 80))}</td><td>${a.status === 'em_andamento' ? 'Em andamento' : escapeHTML(a.resultado || 'Finalizado')}</td><td><button class="btn btn-sm btn-info" onclick="verAtendimento('${a.id}')"><i class="fas fa-eye"></i></button></td></tr>`).join('')}</tbody>
                    </table></div>
                </div></div>`;
        }
    } catch (error) { container.innerHTML = `<div class="alert alert-danger">Erro ao exibir</div>`; }
}

function exportarCSV() {
    if (!relatorioData) {
        alert('⚠️ Nenhum relatório carregado.\n\nClique em BUSCAR primeiro.');
        return;
    }
    
    const dados = relatorioData.registros || relatorioData.atendimentos || [];
    
    if (dados.length === 0) {
        alert('⚠️ Nenhum registro para exportar.\n\nVerifique os filtros de data.');
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
    link.download = `supervisao_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
}

function logout() {
    if (confirm('Tem certeza que deseja sair?')) {
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
window.abrirEditarAtendimento = abrirEditarAtendimento;
window.salvarEdicaoAtendimento = salvarEdicaoAtendimento;
window.imprimirAtendimento = imprimirAtendimento;
window.confirmarExclusaoMassa = confirmarExclusaoMassa;
window.mostrarToastConcluido = mostrarToastConcluido;