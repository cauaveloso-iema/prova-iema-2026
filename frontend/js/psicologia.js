// ============================================
// PSICOLOGIA - SISTEMA DE ATENDIMENTOS
// Modo Automático (QR) + Modo Manual (Clique direto no aluno)
// Tema: Verde-Água / Teal
// Com Autocomplete + Remarcação + Assinatura via QR Code + Sino + Notificações + Filtros + Gerenciar Concluídos
// ============================================

let token = localStorage.getItem('auth_token');
let currentAluno = null;
let currentAtendimento = null;
let relatorioData = null;
let dashboardCharts = {};
let tipoTarefaSelecionado = null;
let __tiposSelecionados = [];

// Scanner Auto
let scannerAuto = null;
let scannerAutoAtivo = false;
let __scannerIniciando = false;

// Estado
let modoAtual = 'automatico';
let turmasDisponiveis = [];
let alunosPorTurma = [];

// Autocomplete de aluno
let __alunosParaRelatorio = [];
let __alunosFiltrados = [];
let __indiceSelecionado = -1;
let __alunosCarregados = false;

// Estado do sino
let __lembretesAtuais = [];

// Estado dos filtros de atendimentos ativos
let __atendimentosAtivosBrutos = [];
let __atendimentosAtivosFiltrados = [];

// Estado dos atendimentos concluídos
let __concluidosPaginaAtual = 1;
let __concluidosPorPagina = 10;
let __concluidosTotal = 0;
let __concluidosDados = [];

// ============================================
// ESTADO DA SESSÃO DE ASSINATURA (QR CODE)
// ============================================
const estadoSessaoAssinatura = {
    psicologia: {
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
    let __alertaEmProgresso = false;

    window.alert = function(mensagem) {
        if (__alertaEmProgresso) return;
        __alertaEmProgresso = true;

        try {
            const isWebView = /wv|WebView|Android.*Version\/[\d.]+.*Chrome/i.test(navigator.userAgent) ||
                              (typeof window.AppInventor !== 'undefined');

            if (!isWebView) return;

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
                            style="width:100%;padding:12px;background:#14b8a6;color:white;
                                   border:none;border-radius:10px;font-size:14px;
                                   font-weight:600;cursor:pointer;">OK</button>
                </div>
            `;
            document.body.appendChild(modal);
        } finally {
            __alertaEmProgresso = false;
        }
    };
})();

const TIPO_LABELS = {
    'escuta_acolhimento': 'Escutas de Acolhimento',
    'manejo_crises_emocionais': 'Manejo de Crises Emocionais',
    'atividades_grupos': 'Atividades em Grupos',
    'acoes_atividades_saude': 'Ações e Atividades em Saúde',
    'acoes_socioemocionais_culturais': 'Ações e Atividades Socioemocionais e Culturais',
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
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#14b8a6"/><stop offset="100%" stop-color="#0d9488"/></linearGradient></defs><circle cx="50" cy="50" r="50" fill="url(#g)"/><text x="50" y="50" font-family="Arial,sans-serif" font-size="45" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="central">${inicial}</text></svg>`;
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
}

function formatarDataBR(dataStr) {
    if (!dataStr) return '-';
    const d = new Date(dataStr + 'T00:00:00');
    return d.toLocaleDateString('pt-BR');
}

function gerarUUIDPsico() {
    return 'psico-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 15);
}

// ============================================
// 🚀 FETCH COM TIMEOUT E RETRY
// ============================================
async function fetchComRetry(url, options = {}, timeoutMs = 45000, tentativas = 2) {
    for (let i = 1; i <= tentativas; i++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timeoutId);

            if (!response.ok && [502, 503, 504].includes(response.status)) {
                throw new Error(`Servidor acordando (${response.status})`);
            }
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            const isLastTry = (i === tentativas);
            
            if (isLastTry || (error.message.includes('acordando') === false && error.name !== 'AbortError')) {
                if (error.name === 'AbortError') throw new Error(`Tempo esgotado (${timeoutMs / 1000}s)`);
                throw error;
            }
            await new Promise(r => setTimeout(r, 3000));
        }
    }
}

// ============================================
// 📄 GERADOR DE CSV PROFISSIONAL
// ============================================
function gerarBaixarCSV(opts) {
    const {
        titulo = 'Relatório', subtitulo = '', setor = 'Psicologia',
        colunas = [], registros = [], filtros = [], nomeArquivo = 'relatorio',
        observacoes = '', metricas = null
    } = opts || {};

    if (!Array.isArray(colunas) || colunas.length === 0) {
        mostrarToastConcluido('⚠️ Nenhuma coluna definida para exportação', 'warning');
        return false;
    }
    if (!Array.isArray(registros) || registros.length === 0) {
        mostrarToastConcluido('⚠️ Nenhum registro para exportar', 'warning');
        return false;
    }

    const agora = new Date();
    const dataGeracao = agora.toLocaleString('pt-BR');
    const dataArquivo = agora.toISOString().split('T')[0];

    const esc = (v) => {
        if (v === null || v === undefined) return '""';
        let s = String(v).replace(/\r\n|\r|\n/g, ' ').replace(/"/g, '""').trim();
        return `"${s}"`;
    };

    const linhaUnica = (texto) => {
        const t = String(texto ?? '').replace(/"/g, '""');
        return `"${t}"` + ';'.repeat(Math.max(0, colunas.length - 1));
    };

    const linhaCabecalho = colunas.map(c => esc(c.label)).join(';');
    const linhasDados = registros.map(reg => {
        return colunas.map(col => {
            let v;
            try { v = col.format ? col.format(reg) : reg[col.key]; } catch (e) { v = ''; }
            return esc(v);
        }).join(';');
    });

    const L = [];
    L.push(linhaUnica('IEMA PLENO: SÃO LUÍS - CENTRO'));
    L.push(linhaUnica('Sistema de Atendimentos — EducaPleno'));
    L.push(linhaUnica(`Setor: ${setor}`));
    L.push(linhaUnica(''));
    L.push(linhaUnica(titulo.toUpperCase()));
    if (subtitulo) L.push(linhaUnica(subtitulo));
    L.push(linhaUnica(''));
    L.push(linhaUnica(`Data de geração: ${dataGeracao}`));
    L.push(linhaUnica(`Total de registros: ${registros.length}`));

    if (metricas && typeof metricas === 'object') {
        Object.entries(metricas).forEach(([label, valor]) => {
            if (valor !== null && valor !== undefined && valor !== '') L.push(linhaUnica(`${label}: ${valor}`));
        });
    }

    if (filtros.length > 0) {
        L.push(linhaUnica('Filtros aplicados:'));
        filtros.forEach(f => { if (f && f.valor) L.push(linhaUnica(`  • ${f.label}: ${f.valor}`)); });
    }

    if (observacoes) L.push(linhaUnica(`Observações: ${observacoes}`));
    L.push(linhaUnica(''));
    L.push(linhaUnica('─'.repeat(40)));
    L.push(linhaUnica(''));
    L.push(linhaCabecalho);
    L.push(...linhasDados);
    L.push(linhaUnica(''));
    L.push(linhaUnica('─'.repeat(40)));
    L.push(linhaUnica(''));
    L.push(linhaUnica('Documento gerado automaticamente pelo EducaPleno'));
    L.push(linhaUnica(`Setor responsável: ${setor}`));
    L.push(linhaUnica(`Gerado em: ${dataGeracao}`));
    L.push(linhaUnica('Este relatório é de uso interno e confidencial.'));

    const csv = '\uFEFF' + L.join('\r\n');

    try {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.download = `${nomeArquivo}_${dataArquivo}.csv`;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        setTimeout(() => { document.body.removeChild(link); URL.revokeObjectURL(url); }, 100);
        return true;
    } catch (e) {
        mostrarToastConcluido('❌ Erro ao gerar CSV', 'error');
        return false;
    }
}

// ============================================
// 🔔 SISTEMA DE NOTIFICAÇÕES DO NAVEGADOR
// ============================================
async function solicitarPermissaoNotificacao() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;

    try {
        const permission = await Notification.requestPermission();
        atualizarStatusNotificacao();
        return permission === 'granted';
    } catch (e) {
        return false;
    }
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

function jaNotificou(remarcacaoId, tipo) {
    const key = `notif_${tipo}_${remarcacaoId}`;
    return localStorage.getItem(key) === 'true';
}

function marcarComoNotificado(remarcacaoId, tipo) {
    const key = `notif_${tipo}_${remarcacaoId}`;
    localStorage.setItem(key, 'true');
}

function limparNotificacoesAntigas() {
    if (!__lembretesAtuais) return;

    const idsAtivos = new Set();
    __lembretesAtuais.forEach(r => { idsAtivos.add(r.id); });

    Object.keys(localStorage).forEach(k => {
        if (k.startsWith('notif_')) {
            const parts = k.split('_');
            const idRem = parts[parts.length - 1];
            if (!idsAtivos.has(idRem)) localStorage.removeItem(k);
        }
    });
}

function calcularNivelAlerta(remarcacao) {
    const agora = new Date();
    const horario = remarcacao.horarioRemarcacao || '00:00';
    const dataRem = new Date(remarcacao.dataRemarcacao + 'T' + horario + ':00');
    const diffMs = dataRem - agora;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHoras = Math.floor(diffMin / 60);

    if (diffMin < 0) {
        const passouHa = Math.abs(diffMin);
        if (passouHa < 60) return { nivel: 'atrasado', label: `Atrasado ${passouHa}min`, urgente: true };
        if (passouHa < 1440) return { nivel: 'atrasado', label: `Atrasado ${Math.floor(passouHa / 60)}h`, urgente: true };
        return { nivel: 'atrasado', label: `Atrasado ${Math.floor(passouHa / 1440)}d`, urgente: true };
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
            body: corpo,
            icon: '/icons/favicon.ico',
            badge: '/icons/favicon.ico',
            tag: urgente ? 'psicologia-urgente' : 'psicologia-lembrete',
            requireInteraction: urgente,
            vibrate: urgente ? [200, 100, 200] : [100],
            silent: false
        });

        if (onClick) {
            notif.onclick = () => { window.focus(); onClick(); notif.close(); };
        }

        if (!urgente) {
            setTimeout(() => { try { notif.close(); } catch(e) {} }, 8000);
        }
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
        const diffMs = dataRem - agora;
        const diffMin = Math.floor(diffMs / 60000);

        if (diffMin < 0 && !jaNotificou(r.id, 'atrasado')) {
            enviarNotificacao('⚠️ Atendimento ATRASADO', `${r.alunoNome} - ${r.tipoTarefaLabel}\nEra ${formatarDataBR(r.dataRemarcacao)} às ${r.horarioRemarcacao}`, true, () => abrirNotificacoes());
            marcarComoNotificado(r.id, 'atrasado');
            return;
        }
        if (diffMin > 0 && diffMin <= 30 && !jaNotificou(r.id, 'iminente')) {
            enviarNotificacao('🔔 Atendimento em 30 min!', `${r.alunoNome} - ${r.tipoTarefaLabel}\n${r.horarioRemarcacao} • ${r.alunoTurma}`, true, () => abrirNotificacoes());
            marcarComoNotificado(r.id, 'iminente');
            return;
        }
        if (diffMin > 30 && diffMin <= 120 && !jaNotificou(r.id, 'proximo')) {
            enviarNotificacao('⏰ Atendimento próximo', `${r.alunoNome} - ${r.tipoTarefaLabel}\nEm ${Math.floor(diffMin / 60)}h ${diffMin % 60}min`, false, () => abrirNotificacoes());
            marcarComoNotificado(r.id, 'proximo');
            return;
        }
        if (diffMin > 120 && diffMin <= 720 && !jaNotificou(r.id, 'hoje')) {
            enviarNotificacao('📅 Atendimento HOJE', `${r.alunoNome} - ${r.tipoTarefaLabel}\nHoje às ${r.horarioRemarcacao}`, false, () => abrirNotificacoes());
            marcarComoNotificado(r.id, 'hoje');
            return;
        }
        if (diffMin > 720 && diffMin <= 1440 && !jaNotificou(r.id, 'amanha')) {
            enviarNotificacao('📅 Atendimento AMANHÃ', `${r.alunoNome} - ${r.tipoTarefaLabel}\nAmanhã às ${r.horarioRemarcacao}`, false, () => abrirNotificacoes());
            marcarComoNotificado(r.id, 'amanha');
        }
    });
}

function atualizarBadgeComUrgencia() {
    const badge = safeGet('notificacoesBadge');
    const btn = safeGet('notificacoesBtn');
    if (!badge || !btn) return;
    if (!__lembretesAtuais || __lembretesAtuais.length === 0) return;

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
    const modoAssinatura = new URLSearchParams(window.location.search).get('assinatura');
    if (modoAssinatura) {
        await mostrarTelaAssinatura(modoAssinatura);
        return;
    }
    
    const verificarAtendimentoId = new URLSearchParams(window.location.search).get('verificar');
    
    if (!token) { 
        window.location.href = '/login.html'; 
        return; 
    }

    const userData = JSON.parse(localStorage.getItem('user_data') || '{}');
    const allowedRoles = ['psicologia', 'super_admin', 'admin'];

    if (!allowedRoles.includes(userData.role)) {
        mostrarToastConcluido('Acesso negado.', 'error');
        window.location.href = '/login.html';
        return;
    }

    safeSetText('userName', userData.nome || 'Usuário');
    safeSetText('dataAtual', new Date().toLocaleDateString('pt-BR'));

    atualizarStatusNotificacao();

    await iniciarScannerAutomatico();

    setTimeout(async () => {
        try { await carregarFotoPerfil(); } catch (e) {}
        setTimeout(() => carregarTurmasParaManual(), 300);
        setTimeout(() => carregarTurmasParaRelatorio(), 600);
        setTimeout(() => carregarAtendimentosAtivos(), 900);
        setTimeout(() => carregarDashboard(), 1200);
        setTimeout(() => carregarLembretes(), 1500);
    }, 100);

    configurarFiltrosAndamento();
    configurarFiltrosConcluidos();

    setTimeout(async () => {
        const permitido = await solicitarPermissaoNotificacao();
        if (permitido) setTimeout(() => verificarLembretesNotificar(), 2000);
    }, 3000);

    setInterval(() => {
        if (__scannerIniciando) return;
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

    setTimeout(() => atualizarContadorAtendimentosAntigos(), 5000);
    setInterval(() => atualizarContadorAtendimentosAntigos(), 60000);

    if (verificarAtendimentoId) {
        setTimeout(async () => {
            const urlLimpa = new URL(window.location.href);
            urlLimpa.searchParams.delete('verificar');
            window.history.replaceState({}, '', urlLimpa.toString());
            await abrirModalVerificacao24h();
        }, 2500);
    }

    safeGet('dashboard-tab')?.addEventListener('shown.bs.tab', () => {
        carregarDashboard();
        carregarAtendimentosConcluidos(1);
        atualizarContadorAtendimentosAntigos();
    });
    safeGet('relatorios-tab')?.addEventListener('shown.bs.tab', () => carregarTurmasParaRelatorio());
    safeGet('ativos-tab')?.addEventListener('shown.bs.tab', () => {
        carregarAtendimentosAtivos();
        atualizarContadorAtendimentosAntigos();
    });

    safeGet('modoAutomaticoBtn')?.addEventListener('click', () => setModo('automatico'));
    safeGet('modoManualBtn')?.addEventListener('click', () => setModo('manual'));

    safeGet('filtroTurmaManual')?.addEventListener('change', () => carregarAlunosPorTurma());
    safeGet('filtroBuscaManual')?.addEventListener('input', () => filtrarAlunosManual());

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && currentAluno) {
            limparTela();
            if (modoAtual === 'automatico') reiniciarScannerAutomatico();
        }
    });
});

window.addEventListener('beforeunload', () => {
    pararScannerAutomatico();
    pararPollingAssinatura();
    window.removeEventListener('resize', handleResizeCanvasTela);
});

async function carregarFotoPerfil() {
    try {
        const response = await fetch('/api/perfil/me', { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await response.json();
        if (data.success && data.perfil?.fotoPerfil) {
            const avatar = safeGet('userAvatar');
            if (avatar) avatar.innerHTML = `<img src="${data.perfil.fotoPerfil}" alt="Foto">`;
        }
    } catch (error) {}
}

// ============================================
// 1. RELÓGIO EM TEMPO REAL
// ============================================
function atualizarRelogio() {
    const elTempo = document.getElementById('relogioTempoReal');
    const elData = document.getElementById('relogioData');
    if (!elTempo) return;
    const agora = new Date();
    elTempo.textContent = `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}:${String(agora.getSeconds()).padStart(2, '0')}`;
    if (elData) {
        elData.textContent = agora.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).replace(/\./g, '').replace(/,/g, ' •');
    }
}
setInterval(atualizarRelogio, 1000);
atualizarRelogio();

// ============================================
// 2. MENU DO USUÁRIO (Avatar)
// ============================================
function toggleUserMenu(event) {
    if (event) event.stopPropagation();
    const dropdown = document.getElementById('userDropdown');
    const chevron = document.getElementById('userChevron');
    if (dropdown) {
        const isShowing = dropdown.classList.contains('show');
        if (isShowing) {
            dropdown.classList.remove('show');
            if (chevron) chevron.style.transform = 'rotate(0deg)';
        } else {
            dropdown.classList.add('show');
            if (chevron) chevron.style.transform = 'rotate(180deg)';
        }
    }
}

document.addEventListener('click', function (event) {
    const container = document.getElementById('userMenuContainer');
    const dropdown = document.getElementById('userDropdown');
    const chevron = document.getElementById('userChevron');
    if (container && !container.contains(event.target)) {
        if (dropdown) dropdown.classList.remove('show');
        if (chevron) chevron.style.transform = 'rotate(0deg)';
    }
});

// ============================================
// 4. BOAS-VINDAS E TURNO DINÂMICO
// ============================================
function atualizarBoasVindasETurno() {
    const userData = JSON.parse(localStorage.getItem('user_data') || '{}');
    const nomeEl = document.getElementById('headerNomeUsuario');
    if (nomeEl && userData.nome) nomeEl.textContent = userData.nome.split(' ')[0];
    const agora = new Date();
    const hora = agora.getHours();
    let turno = 'Matutino', icone = 'fa-sun text-warning';
    if (hora >= 12 && hora < 18) { turno = 'Vespertino'; icone = 'fa-cloud-sun text-warning'; }
    else if (hora >= 18 || hora < 5) { turno = 'Noturno'; icone = 'fa-moon text-primary'; }
    const turnoEl = document.getElementById('headerTurno');
    const iconeEl = document.getElementById('headerTurnoIcone');
    if (turnoEl) turnoEl.textContent = turno;
    if (iconeEl) iconeEl.className = `fas ${icone} me-1`;
}
document.addEventListener('DOMContentLoaded', () => { atualizarBoasVindasETurno(); setInterval(atualizarBoasVindasETurno, 60000); });

// ============================================
// 5. ABRIR MENU DE NOTIFICAÇÕES PELO AVATAR
// ============================================
function abrirMenuNotificacoesSeguro(event) {
    if (event) event.stopPropagation();
    const userDropdown = document.getElementById('userDropdown');
    const chevron = document.getElementById('userChevron');
    if (userDropdown) userDropdown.classList.remove('show');
    if (chevron) chevron.style.transform = 'rotate(0deg)';
    const notifDropdown = document.getElementById('notificacoesDropdown');
    if (notifDropdown) { notifDropdown.classList.add('show'); notifDropdown.style.display = 'block'; }
    if (typeof carregarTudo === 'function') carregarTudo();
}

document.addEventListener('click', function(event) {
    const notifDropdown = document.getElementById('notificacoesDropdown');
    const containerSino = document.getElementById('containerSinoOriginal');
    if (notifDropdown && notifDropdown.classList.contains('show')) {
        if (containerSino && !containerSino.contains(event.target)) fecharNotificacoes();
    }
});

// ============================================
// FILTROS DA ABA EM ANDAMENTO
// ============================================
function configurarFiltrosAndamento() {
    ['filtroAndamentoBusca', 'filtroAndamentoTurma', 'filtroAndamentoTipo',
     'filtroAndamentoOrdenar', 'filtroAndamentoPrioridade', 'filtroAndamentoGravidade',
     'filtroAndamentoRemarcado', 'filtroAndamentoAssinatura'].forEach(id => {
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
    if (f.busca) filtrados = filtrados.filter(a => (a.alunoNome || '').toLowerCase().includes(f.busca) || (a.alunoMatricula || '').toLowerCase().includes(f.busca));
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
    const mapa = { busca: 'filtroAndamentoBusca', turma: 'filtroAndamentoTurma', tipo: 'filtroAndamentoTipo', prioridade: 'filtroAndamentoPrioridade', gravidade: 'filtroAndamentoGravidade', remarcado: 'filtroAndamentoRemarcado', assinatura: 'filtroAndamentoAssinatura' };
    const el = safeGet(mapa[campo]);
    if (el) el.value = '';
    aplicarFiltrosAndamento();
}

function limparFiltrosAndamento() {
    ['filtroAndamentoBusca', 'filtroAndamentoTurma', 'filtroAndamentoTipo', 'filtroAndamentoOrdenar', 'filtroAndamentoPrioridade', 'filtroAndamentoGravidade', 'filtroAndamentoRemarcado', 'filtroAndamentoAssinatura'].forEach(id => {
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
    turmas.forEach(t => { select.innerHTML += `<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`; });
    if (valorAtual && turmas.includes(valorAtual)) select.value = valorAtual;
}

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
        const response = await fetch('/api/psicologia/remarcacoes/pendentes', { headers: { 'Authorization': `Bearer ${token}` } });
        const ct = response.headers.get('content-type') || '';
        if (!response.ok || !ct.includes('application/json')) { __lembretesAtuais = []; return; }
        const data = await response.json();
        if (data.success && Array.isArray(data.remarcacoes)) {
            __lembretesAtuais = data.remarcacoes;
            verificarLembretesNotificar();
            atualizarBadgeComUrgencia();
            limparNotificacoesAntigas();
        } else {
            __lembretesAtuais = [];
        }
    } catch (error) { __lembretesAtuais = []; }
}
// ============================================
// VER ATENDIMENTO (MODAL)
// ============================================
async function verAtendimento(atendimentoId) {
    if (!atendimentoId) return;
    fecharNotificacoes();

    try {
        const response = await fetch(`/api/psicologia/atendimento/${atendimentoId}`, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await response.json();
        if (!data.success || !data.atendimento) { mostrarToastConcluido('Erro ao carregar atendimento', 'error'); return; }
        const a = data.atendimento;
        const estaMascarado = a._mascarado === true;

        let detalhesHTML = '';
        if (a.detalhes && Object.keys(a.detalhes).length > 0) {
            const detalhesMap = {
                tipoEscuta: 'Tipo de Escuta', duracaoEscuta: 'Duração (min)', tipoCrise: 'Tipo de Crise', acoesTomadas: 'Ações Tomadas', encaminhamentoEmergencial: 'Encaminhamento', nomeAtividade: 'Nome da Atividade', participantesAtividade: 'Participantes', localAtividade: 'Local', duracaoAtividade: 'Duração (min)', temaAcao: 'Tema', publicoAlvo: 'Público Alvo', localAcao: 'Local', temaSocioemocional: 'Tema Socioemocional', tipoAtividadeCultural: 'Tipo Cultural', parceria: 'Parcerias', tipoTarefaOutros: 'Especificação', providenciasTomadas: 'Providências', proximosPassos: 'Próximos Passos', contextoFamiliar: 'Contexto Familiar', historicoAnterior: 'Histórico Anterior'
            };
            detalhesHTML = '<div class="section-title">📋 Detalhes</div>';
            Object.entries(a.detalhes).forEach(([key, value]) => {
                if (!value || (Array.isArray(value) && value.length === 0)) return;
                const label = detalhesMap[key] || key;
                const valor = Array.isArray(value) ? value.join(', ') : value;
                detalhesHTML += `<div class="info-row"><div class="info-label">${escapeHTML(label)}:</div><div class="info-value">${escapeHTML(String(valor))}</div></div>`;
            });
        }

        let assinaturaHTML = '';
        if (!estaMascarado && a.entrada?.temAssinatura && a.entrada?.assinaturaBase64) {
            assinaturaHTML = `<div class="section-title">✍️ Assinatura do Responsável</div><div class="assinatura-preview"><img src="${a.entrada.assinaturaBase64}" alt="Assinatura"></div>`;
        }

        let remarcacoesHTML = '';
        if (a.remarcacoes && a.remarcacoes.length > 0) {
            remarcacoesHTML = '<div class="section-title">📅 Histórico de Remarcações</div>';
            a.remarcacoes.forEach((r, idx) => {
                const statusLabel = { 'pendente': '⏳ Pendente', 'realizado': '✅ Realizado', 'cancelado': '❌ Cancelado' }[r.status] || r.status;
                remarcacoesHTML += `<div style="background: #f9fafb; padding: 10px; border-radius: 8px; margin-bottom: 8px;"><div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><strong style="color: #0d9488;">#${idx + 1} - ${statusLabel}</strong><small style="color: #6b7280;">${formatarDataBR(r.dataRemarcacao)} às ${r.horarioRemarcacao}</small></div><div style="font-size: 13px; color: #4b5563;"><strong>Motivo:</strong> ${escapeHTML(r.motivoRemarcacao || '-')}</div>${r.observacoesRemarcacao ? `<div style="font-size: 12px; color: #6b7280; margin-top: 4px;">${escapeHTML(r.observacoesRemarcacao)}</div>` : ''}</div>`;
            });
        }

        const oldModal = safeGet('modalVerAtendimento');
        if (oldModal) oldModal.remove();

        const modalHtml = `
            <div class="modal fade" id="modalVerAtendimento" tabindex="-1">
                <div class="modal-dialog modal-lg modal-dialog-scrollable">
                    <div class="modal-content">
                        <div class="modal-header" style="background: linear-gradient(135deg, #14b8a6, #0d9488); color: white;">
                            <h5 class="modal-title"><i class="fas fa-eye"></i> Detalhes do Atendimento</h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body detalhe-atendimento">
                            <div style="display: flex; align-items: center; gap: 12px; padding: 12px; background: #f0fdfa; border-radius: 10px; margin-bottom: 16px;">
                                <img src="${gerarAvatarSVG(a.alunoNome)}" style="width: 50px; height: 50px; border-radius: 50%;" alt="">
                                <div style="flex: 1;">
                                    <h5 style="margin: 0; color: #0f766e;">${escapeHTML(a.alunoNome)}</h5>
                                    <small style="color: #6b7280;"><i class="fas fa-id-card"></i> ${escapeHTML(a.alunoMatricula || '-')} • <i class="fas fa-graduation-cap"></i> ${escapeHTML(a.alunoTurma || '-')}</small>
                                </div>
                                <span class="badge" style="background: #14b8a6; font-size: 12px;">${escapeHTML(a.tipoTarefaLabel)}</span>
                            </div>
                            ${estaMascarado ? `<div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 14px 16px; border-radius: 10px; margin-bottom: 16px;"><div style="display: flex; align-items: center; gap: 12px;"><i class="fas fa-lock" style="color: #d97706; font-size: 22px;"></i><div><strong style="color: #92400e; font-size: 15px;">Conteúdo Protegido</strong><p style="margin: 4px 0 0; font-size: 13px; color: #92400e; line-height: 1.4;">Este atendimento foi registrado por <strong>${escapeHTML(a.entrada?.registradoPorNome || 'outro profissional')}</strong>.</p></div></div></div>` : ''}
                            <div class="section-title">📌 Informações</div>
                            <div class="info-row"><div class="info-label">Status:</div><div class="info-value"><span class="badge" style="background: ${a.status === 'finalizado' ? '#10b981' : '#f59e0b'};">${a.status === 'finalizado' ? '✅ Finalizado' : '⏳ Em Andamento'}</span></div></div>
                            <div class="info-row"><div class="info-label">Prioridade:</div><div class="info-value"><span class="badge" style="background: ${a.prioridade === 'urgente' ? '#dc2626' : a.prioridade === 'alta' ? '#f59e0b' : '#3b82f6'};">${escapeHTML(a.prioridade || 'normal').toUpperCase()}</span></div></div>
                            <div class="info-row"><div class="info-label">Gravidade:</div><div class="info-value">${escapeHTML(a.entrada?.gravidade || 'media').toUpperCase()}</div></div>
                            <div class="info-row"><div class="info-label">Data de Entrada:</div><div class="info-value">${a.entrada?.dataHoraFormatada || '-'}</div></div>
                            <div class="info-row"><div class="info-label">Registrado por:</div><div class="info-value">${escapeHTML(a.entrada?.registradoPorNome || '-')}</div></div>
                            <div class="section-title">📝 Descrição</div>
                            <div style="background: ${estaMascarado ? '#fef3c7' : '#f9fafb'}; padding: 12px; border-radius: 8px; font-size: 14px; color: ${estaMascarado ? '#92400e' : '#374151'}; line-height: 1.5; font-style: ${estaMascarado ? 'italic' : 'normal'};">${escapeHTML(a.entrada?.descricao || '-').replace(/\n/g, '<br>')}</div>
                            ${a.entrada?.observacoes ? `<div class="section-title">💬 Observações</div><div style="background: ${estaMascarado ? '#fef3c7' : '#f9fafb'}; padding: 12px; border-radius: 8px; font-size: 13px; color: ${estaMascarado ? '#92400e' : '#4b5563'}; font-style: ${estaMascarado ? 'italic' : 'normal'};">${escapeHTML(a.entrada.observacoes).replace(/\n/g, '<br>')}</div>` : ''}
                            ${detalhesHTML} ${assinaturaHTML} ${remarcacoesHTML}
                            ${a.saida ? `<div class="section-title">🎯 Resultado</div><div class="info-row"><div class="info-label">Resultado:</div><div class="info-value"><strong>${escapeHTML(a.saida.resultadoTexto || a.saida.resultado)}</strong></div></div><div class="info-row"><div class="info-label">Data de Saída:</div><div class="info-value">${a.saida.dataHoraFormatada || '-'}</div></div>${a.saida.observacoesFinais ? `<div class="info-row"><div class="info-label">Obs. Finais:</div><div class="info-value">${escapeHTML(a.saida.observacoesFinais)}</div></div>` : ''}` : ''}
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal"><i class="fas fa-times"></i> Fechar</button>
                            ${!estaMascarado ? `<button type="button" class="btn btn-info" onclick="imprimirAtendimento('${a.id}')"><i class="fas fa-print"></i> Imprimir</button>${a.status === 'em_andamento' ? `<button type="button" class="btn btn-secondary" onclick="fecharVerAtendimento(); abrirEditarAtendimento('${a.id}')"><i class="fas fa-edit"></i> Editar</button><button type="button" class="btn btn-warning" onclick="fecharVerAtendimento(); abrirRemarcar('${a.id}')"><i class="fas fa-calendar-plus"></i> Remarcar</button><button type="button" class="btn btn-success" onclick="fecharVerAtendimento(); abrirFinalizacao('${a.id}')"><i class="fas fa-check"></i> Finalizar</button>` : ''}` : `<span class="badge" style="background: #fef3c7; color: #92400e; padding: 10px 16px; font-size: 13px;"><i class="fas fa-lock"></i> Ações disponíveis apenas para o profissional responsável</span>`}
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        new bootstrap.Modal(safeGet('modalVerAtendimento')).show();
    } catch (error) { mostrarToastConcluido('Erro ao carregar detalhes', 'error'); }
}

function fecharVerAtendimento() {
    const modal = bootstrap.Modal.getInstance(safeGet('modalVerAtendimento'));
    if (modal) modal.hide();
    setTimeout(() => { const el = safeGet('modalVerAtendimento'); if (el) el.remove(); }, 300);
}

// ============================================
// EDITAR ATENDIMENTO
// ============================================
async function abrirEditarAtendimento(atendimentoId) {
    if (!atendimentoId) return;
    try {
        const response = await fetch(`/api/psicologia/atendimento/${atendimentoId}`, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await response.json();
        if (!data.success || !data.atendimento) { mostrarToastConcluido('Erro ao carregar atendimento', 'error'); return; }
        const a = data.atendimento;
        const tiposDoAtendimento = a.tiposTarefa || [a.tipoTarefa];
        __tiposSelecionados = [...tiposDoAtendimento];
        const oldModal = safeGet('modalEditarAtendimento');
        if (oldModal) oldModal.remove();

        const tiposCards = Object.entries(TIPO_LABELS).map(([key, label]) => {
            const selecionado = tiposDoAtendimento.includes(key);
            return `<div class="tipo-card ${selecionado ? 'selected' : ''}" data-tipo="${key}" onclick="toggleTipoTarefaEdicao('${key}')"><i class="fas ${getIconePorTipoPsico(key)}"></i><span>${label}</span></div>`;
        }).join('');

        const modalHtml = `
            <div class="modal fade" id="modalEditarAtendimento" tabindex="-1">
                <div class="modal-dialog modal-lg modal-dialog-scrollable">
                    <div class="modal-content">
                        <div class="modal-header" style="background: linear-gradient(135deg, #14b8a6, #0d9488); color: white;">
                            <h5 class="modal-title"><i class="fas fa-edit"></i> Editar Atendimento</h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <input type="hidden" id="editAtendimentoId" value="${a.id}">
                            <input type="hidden" id="editTiposSelecionados" value="${tiposDoAtendimento.join(',')}">
                            <div style="display: flex; align-items: center; gap: 12px; padding: 12px; background: #f0fdfa; border-radius: 10px; margin-bottom: 16px;">
                                <img src="${gerarAvatarSVG(a.alunoNome)}" style="width: 50px; height: 50px; border-radius: 50%;" alt="">
                                <div style="flex: 1;">
                                    <h5 style="margin: 0; color: #0f766e;">${escapeHTML(a.alunoNome)}</h5>
                                    <small style="color: #6b7280;"><i class="fas fa-id-card"></i> ${escapeHTML(a.alunoMatricula || '-')} • <i class="fas fa-graduation-cap"></i> ${escapeHTML(a.alunoTurma || '-')}</small>
                                </div>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Tipos de Tarefa <span class="text-danger">*</span></label>
                                <small class="text-muted d-block mb-2"><i class="fas fa-info-circle"></i> Você pode marcar mais de um tipo.</small>
                                <div class="tipos-tarefa-grid" id="editTiposGrid">${tiposCards}</div>
                            </div>
                            <div class="mb-3"><label class="form-label">Descrição <span class="text-danger">*</span></label><textarea id="editDescricao" class="form-control" rows="3">${escapeHTML(a.entrada?.descricao || '')}</textarea></div>
                            <div class="row">
                                <div class="col-md-6 mb-3"><label class="form-label">Gravidade</label><select id="editGravidade" class="form-select"><option value="baixa" ${a.entrada?.gravidade === 'baixa' ? 'selected' : ''}>Baixa</option><option value="media" ${a.entrada?.gravidade === 'media' ? 'selected' : ''}>Média</option><option value="alta" ${a.entrada?.gravidade === 'alta' ? 'selected' : ''}>Alta</option><option value="critica" ${a.entrada?.gravidade === 'critica' ? 'selected' : ''}>Crítica</option></select></div>
                                <div class="col-md-6 mb-3"><label class="form-label">Prioridade</label><select id="editPrioridade" class="form-select"><option value="baixa" ${a.prioridade === 'baixa' ? 'selected' : ''}>Baixa</option><option value="normal" ${a.prioridade === 'normal' ? 'selected' : ''}>Normal</option><option value="alta" ${a.prioridade === 'alta' ? 'selected' : ''}>Alta</option><option value="urgente" ${a.prioridade === 'urgente' ? 'selected' : ''}>Urgente</option></select></div>
                            </div>
                            <div class="mb-3"><label class="form-label">Observações</label><textarea id="editObservacoes" class="form-control" rows="2">${escapeHTML(a.entrada?.observacoes || '')}</textarea></div>
                            <div id="editCamposEspecificos"></div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal"><i class="fas fa-times"></i> Cancelar</button>
                            <button type="button" class="btn btn-primary" onclick="salvarEdicaoAtendimento()"><i class="fas fa-save"></i> Salvar</button>
                        </div>
                    </div>
                </div>
            </div>`;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        new bootstrap.Modal(safeGet('modalEditarAtendimento')).show();
        preencherCamposEspecificosEdicaoPsico(tiposDoAtendimento, a.detalhes || {});
    } catch (error) { mostrarToastConcluido('Erro ao carregar para edição', 'error'); }
}

function getIconePorTipoPsico(tipo) {
    const icones = { 'escuta_acolhimento': 'fa-comments', 'manejo_crises_emocionais': 'fa-heartbeat', 'atividades_grupos': 'fa-users', 'acoes_atividades_saude': 'fa-notes-medical', 'acoes_socioemocionais_culturais': 'fa-palette', 'outros': 'fa-ellipsis-h' };
    return icones[tipo] || 'fa-tag';
}

function toggleTipoTarefaEdicao(tipo) {
    if (!tipo) return;
    const valoresAtuais = coletarValoresAtuaisEdicaoPsico();
    const idx = __tiposSelecionados.indexOf(tipo);
    if (idx >= 0) __tiposSelecionados.splice(idx, 1); else __tiposSelecionados.push(tipo);
    document.querySelectorAll('#editTiposGrid .tipo-card').forEach(c => {
        const t = c.getAttribute('data-tipo');
        if (__tiposSelecionados.includes(t)) c.classList.add('selected'); else c.classList.remove('selected');
    });
    const hidden = safeGet('editTiposSelecionados');
    if (hidden) hidden.value = __tiposSelecionados.join(',');
    renderizarCamposEspecificosEdicaoPsico();
    restaurarValoresEdicaoPsico(valoresAtuais);
}

function renderizarCamposEspecificosEdicaoPsico() {
    const container = safeGet('editCamposEspecificos');
    if (!container) return;
    if (__tiposSelecionados.length === 0) { container.innerHTML = ''; return; }
    const blocos = __tiposSelecionados.map(tipo => {
        const label = TIPO_LABELS[tipo] || tipo;
        let htmlTipo = '';
        switch (tipo) {
            case 'escuta_acolhimento': htmlTipo = `<div class="row"><div class="col-md-6 mb-3"><label class="form-label">Tipo de Escuta</label><select id="editDetalheTipoEscuta_${tipo}" class="form-select" data-detalhe-key="tipoEscuta"><option value="">Selecione...</option><option value="Individual">Individual</option><option value="Em Grupo">Em Grupo</option><option value="Com Responsável">Com Responsável</option><option value="Com Professor">Com Professor</option></select></div><div class="col-md-6 mb-3"><label class="form-label">Duração (minutos)</label><input type="number" id="editDetalheDuracaoEscuta_${tipo}" class="form-control" min="1" data-detalhe-key="duracaoEscuta"></div></div>`; break;
            case 'manejo_crises_emocionais': htmlTipo = `<div class="mb-3"><label class="form-label">Tipo de Crise</label><select id="editDetalheTipoCrise_${tipo}" class="form-select" data-detalhe-key="tipoCrise"><option value="">Selecione...</option><option value="Ansiedade">Ansiedade</option><option value="Pânico">Pânico</option><option value="Depressão">Depressão</option><option value="Agressividade">Agressividade</option><option value="Automutilação">Automutilação</option><option value="Ideação Suicida">Ideação Suicida</option><option value="Outro">Outro</option></select></div><div class="mb-3"><label class="form-label">Ações Tomadas</label><textarea id="editDetalheAcoesTomadas_${tipo}" class="form-control" rows="2" data-detalhe-key="acoesTomadas"></textarea></div><div class="mb-3"><label class="form-label">Encaminhamento Emergencial</label><input type="text" id="editDetalheEncaminhamentoEmergencial_${tipo}" class="form-control" data-detalhe-key="encaminhamentoEmergencial"></div>`; break;
            case 'atividades_grupos': htmlTipo = `<div class="row"><div class="col-md-6 mb-3"><label class="form-label">Nome da Atividade</label><input type="text" id="editDetalheNomeAtividade_${tipo}" class="form-control" data-detalhe-key="nomeAtividade"></div><div class="col-md-6 mb-3"><label class="form-label">Local</label><input type="text" id="editDetalheLocalAtividade_${tipo}" class="form-control" data-detalhe-key="localAtividade"></div></div><div class="row"><div class="col-md-6 mb-3"><label class="form-label">Participantes (separados por vírgula)</label><input type="text" id="editDetalheParticipantesAtividade_${tipo}" class="form-control" data-detalhe-key="participantesAtividade"></div><div class="col-md-6 mb-3"><label class="form-label">Duração (minutos)</label><input type="number" id="editDetalheDuracaoAtividade_${tipo}" class="form-control" min="1" data-detalhe-key="duracaoAtividade"></div></div>`; break;
            case 'acoes_atividades_saude': htmlTipo = `<div class="row"><div class="col-md-6 mb-3"><label class="form-label">Tema da Ação</label><input type="text" id="editDetalheTemaAcao_${tipo}" class="form-control" data-detalhe-key="temaAcao"></div><div class="col-md-6 mb-3"><label class="form-label">Local</label><input type="text" id="editDetalheLocalAcao_${tipo}" class="form-control" data-detalhe-key="localAcao"></div></div><div class="mb-3"><label class="form-label">Público Alvo</label><input type="text" id="editDetalhePublicoAlvo_${tipo}" class="form-control" data-detalhe-key="publicoAlvo"></div>`; break;
            case 'acoes_socioemocionais_culturais': htmlTipo = `<div class="row"><div class="col-md-6 mb-3"><label class="form-label">Tema Socioemocional</label><input type="text" id="editDetalheTemaSocioemocional_${tipo}" class="form-control" data-detalhe-key="temaSocioemocional"></div><div class="col-md-6 mb-3"><label class="form-label">Tipo de Atividade Cultural</label><input type="text" id="editDetalheTipoAtividadeCultural_${tipo}" class="form-control" data-detalhe-key="tipoAtividadeCultural"></div></div><div class="mb-3"><label class="form-label">Parcerias</label><input type="text" id="editDetalheParceria_${tipo}" class="form-control" data-detalhe-key="parceria"></div>`; break;
            case 'outros': htmlTipo = `<div class="mb-3"><label class="form-label">Especifique o Tipo de Tarefa</label><input type="text" id="editDetalheTipoTarefaOutros_${tipo}" class="form-control" data-detalhe-key="tipoTarefaOutros"></div>`; break;
            default: htmlTipo = '';
        }
        if (!htmlTipo) return '';
        return `<div class="bloco-tipo-especifico" data-tipo-bloco="${tipo}"><div class="bloco-tipo-header"><i class="fas fa-tag"></i> ${escapeHTML(label)}</div><div class="bloco-tipo-body">${htmlTipo}</div></div>`;
    }).filter(Boolean);
    const htmlExtras = `<div class="mt-3"><div class="mb-3"><label class="form-label">Contexto Familiar</label><textarea id="editDetalheContextoFamiliar" class="form-control" rows="2" data-detalhe-key="contextoFamiliar"></textarea></div><div class="mb-3"><label class="form-label">Histórico Anterior</label><textarea id="editDetalheHistoricoAnterior" class="form-control" rows="2" data-detalhe-key="historicoAnterior"></textarea></div><div class="mb-3"><label class="form-label">Providências Tomadas</label><textarea id="editDetalheProvidencias" class="form-control" rows="2" data-detalhe-key="providenciasTomadas"></textarea></div><div class="mb-3"><label class="form-label">Próximos Passos</label><textarea id="editDetalheProximosPassos" class="form-control" rows="2" data-detalhe-key="proximosPassos"></textarea></div></div>`;
    container.innerHTML = blocos.join('') + htmlExtras;
}

function preencherCamposEspecificosEdicaoPsico(tipos, detalhes) {
    __tiposSelecionados = Array.isArray(tipos) ? [...tipos] : [];
    document.querySelectorAll('#editTiposGrid .tipo-card').forEach(c => {
        const t = c.getAttribute('data-tipo');
        if (__tiposSelecionados.includes(t)) c.classList.add('selected'); else c.classList.remove('selected');
    });
    renderizarCamposEspecificosEdicaoPsico();
    if (!detalhes) return;
    const preencherTodos = (key, valorFormatado) => {
        const els = document.querySelectorAll(`#editCamposEspecificos [data-detalhe-key="${key}"]`);
        els.forEach(el => { el.value = valorFormatado; });
    };
    Object.entries(detalhes).forEach(([detKey, valor]) => {
        if (valor === undefined || valor === null || valor === '') return;
        if (detKey === 'tiposTarefaAdicionais') return;
        let valorFormatado = valor;
        if (Array.isArray(valor)) valorFormatado = valor.join(', ');
        preencherTodos(detKey, valorFormatado);
    });
}

function coletarValoresAtuaisEdicaoPsico() {
    const valores = {};
    document.querySelectorAll('#editCamposEspecificos [data-detalhe-key]').forEach(el => {
        const key = el.getAttribute('data-detalhe-key');
        if (valores[key] !== undefined && valores[key] !== '') return;
        if (el.value) valores[key] = el.value;
    });
    return valores;
}

function restaurarValoresEdicaoPsico(valores) {
    if (!valores || Object.keys(valores).length === 0) return;
    Object.entries(valores).forEach(([key, val]) => {
        document.querySelectorAll(`#editCamposEspecificos [data-detalhe-key="${key}"]`).forEach(el => { el.value = val; });
    });
}

function coletarDetalhesEdicaoPsico() {
    const detalhes = {};
    document.querySelectorAll('#editCamposEspecificos [data-detalhe-key]').forEach(el => {
        const key = el.getAttribute('data-detalhe-key');
        const val = el.value;
        if (!val) return;
        if (key === 'duracaoEscuta' || key === 'duracaoAtividade') { const n = parseInt(val); if (!isNaN(n) && n > 0) detalhes[key] = n; }
        else if (key === 'participantesAtividade' || key === 'profissionaisEnvolvidos') detalhes[key] = val.split(',').map(t => t.trim()).filter(t => t.length > 0);
        else detalhes[key] = val.trim();
    });
    return detalhes;
}

async function salvarEdicaoAtendimento() {
    const atendimentoId = safeGet('editAtendimentoId')?.value;
    const descricao = (safeGet('editDescricao')?.value || '').trim();
    const gravidade = safeGet('editGravidade')?.value;
    const prioridade = safeGet('editPrioridade')?.value;
    const observacoes = safeGet('editObservacoes')?.value || '';
    if (__tiposSelecionados.length === 0) { mostrarToastConcluido('Selecione pelo menos um tipo', 'error'); return; }
    if (!descricao) { mostrarToastConcluido('A descrição é obrigatória', 'error'); return; }
    const detalhesEnviados = coletarDetalhesEdicaoPsico();
    try {
        const response = await fetch(`/api/psicologia/atendimento/${atendimentoId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ tiposTarefa: __tiposSelecionados, descricao, gravidade, prioridade, observacoes, detalhes: detalhesEnviados }) });
        const data = await response.json();
        if (data.success) {
            const modal = bootstrap.Modal.getInstance(safeGet('modalEditarAtendimento')); if (modal) modal.hide();
            mostrarToastConcluido('✅ Atendimento atualizado!', 'success');
            carregarAtendimentosAtivos(); carregarDashboard(); carregarLembretes(); carregarAtendimentosConcluidos(__concluidosPaginaAtual);
        } else {
            if (data.code === 'ADMIN_NAO_CRIADOR') { const modal = bootstrap.Modal.getInstance(safeGet('modalEditarAtendimento')); if (modal) modal.hide(); mostrarNotificacaoInterna('🔒 Acesso restrito\n\n' + data.error, 'warning'); }
            else mostrarToastConcluido('❌ ' + (data.error || 'Erro'), 'error');
        }
    } catch (error) { mostrarToastConcluido('Erro ao salvar', 'error'); }
}

// ============================================================================
// ASSINATURA VIA QR CODE
// ============================================================================
async function toggleNecessitaAssinatura(modulo) {
    const check = safeGet('assistenteSocialNecessitaAssinatura');
    if (!check) return;
    if (check.checked) {
        if (!currentAluno || !currentAluno.id) { mostrarToastConcluido('⚠️ Selecione um aluno antes de marcar a assinatura', 'warning'); check.checked = false; return; }
        const sessaoId = gerarUUIDPsico();
        estadoSessaoAssinatura.psicologia.sessaoId = sessaoId;
        estadoSessaoAssinatura.psicologia.assinaturaCapturada = null;
        try {
            const snapshot = montarSnapshotAtendimento();
            const response = await fetch('/api/sessoes-assinatura', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ sessaoId, tipo: 'psicologia', dadosAtendimento: snapshot }) });
            const data = await response.json();
            if (!data.success) throw new Error(data.error || 'Erro ao criar sessão');
            const urlAssinatura = `${window.location.origin}/psicologia.html?assinatura=${sessaoId}`;
            try {
                const qrResp = await fetch('/api/qrcode/gerar', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ url: urlAssinatura }) });
                const qrData = await qrResp.json();
                if (qrData.success && qrData.qrCode) estadoSessaoAssinatura.psicologia.qrCodeDataUrl = qrData.qrCode;
                else estadoSessaoAssinatura.psicologia.qrCodeDataUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(urlAssinatura)}`;
            } catch (e) { estadoSessaoAssinatura.psicologia.qrCodeDataUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(urlAssinatura)}`; }
            abrirModalAssinaturaQR(urlAssinatura);
            iniciarPollingAssinatura(sessaoId);
            mostrarToastConcluido('📱 QR Code gerado!', 'info');
        } catch (e) {
            mostrarToastConcluido('❌ Erro ao criar sessão', 'error');
            check.checked = false;
            estadoSessaoAssinatura.psicologia.sessaoId = null;
        }
    } else { await cancelarSessaoAssinatura(); }
}

function montarSnapshotAtendimento() {
    const labels = { 'escuta_acolhimento': 'Escutas de Acolhimento', 'manejo_crises_emocionais': 'Manejo de Crises Emocionais', 'atividades_grupos': 'Atividades em Grupos', 'acoes_atividades_saude': 'Ações e Atividades em Saúde', 'acoes_socioemocionais_culturais': 'Ações e Atividades Socioemocionais e Culturais', 'outros': 'Outros' };
    const labelTipos = __tiposSelecionados.map(t => labels[t] || t).join(' + ');
    return {
        alunoId: currentAluno?.id, alunoNome: currentAluno?.nome, alunoMatricula: currentAluno?.matricula, alunoTurma: currentAluno?.turma, alunoCurso: currentAluno?.curso, alunoFoto: currentAluno?.fotoPerfil,
        tiposTarefa: __tiposSelecionados, tipoTarefa: __tiposSelecionados[0], tipoTarefaLabel: labelTipos, motivo: __tiposSelecionados[0], motivoLabel: labelTipos,
        descricao: safeGet('descricao')?.value || '', observacoes: safeGet('observacoes')?.value || '', gravidade: safeGet('gravidade')?.value || 'media', prioridade: safeGet('prioridade')?.value || 'normal',
        dataHora: new Date().toISOString(), dataHoraFormatada: new Date().toLocaleString('pt-BR'), registradoPorNome: JSON.parse(localStorage.getItem('user_data') || '{}').nome || 'Psicologia'
    };
}

function abrirModalAssinaturaQR(urlAssinatura) {
    const antigo = safeGet('modalQRCodeAssinatura');
    if (antigo) antigo.remove();
    const qrUrl = estadoSessaoAssinatura.psicologia.qrCodeDataUrl || `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(urlAssinatura)}`;
    const modalHtml = `
        <div class="modal fade" id="modalQRCodeAssinatura" tabindex="-1" data-bs-backdrop="static" data-bs-keyboard="false">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content" style="border-radius: 20px; border: none; overflow: hidden;">
                    <div class="modal-header" style="background: linear-gradient(135deg, #14b8a6, #0d9488); color: white; border: none; padding: 20px 25px;">
                        <h5 class="modal-title" style="display: flex; align-items: center; gap: 10px;"><i class="fas fa-signature"></i> Aguardando Assinatura</h5>
                        <button type="button" class="btn-close btn-close-white" onclick="fecharModalAssinaturaQR()"></button>
                    </div>
                    <div class="modal-body" style="padding: 30px; text-align: center;">
                        <div id="psicoQrView">
                            <div id="statusAssinaturaQR" style="margin-bottom: 20px;"><div style="background: #fef3c7; border-radius: 12px; padding: 14px; display: flex; align-items: center; gap: 12px; text-align: left;"><div style="width: 40px; height: 40px; border-radius: 50%; border: 4px solid #f59e0b; border-top-color: transparent; animation: spin 1s linear infinite; flex-shrink: 0;"></div><div><strong style="color: #92400e;">Aguardando assinatura...</strong><p style="margin: 3px 0 0; font-size: 13px; color: #78350f;">Peça para o responsável escanear o QR Code abaixo</p></div></div></div>
                            <div style="background: white; border: 2px solid #e2e8f0; border-radius: 16px; padding: 20px; display: inline-block;"><img src="${qrUrl}" alt="QR Code" style="width: 260px; height: 260px; display: block;" id="qrCodeImage"><p style="margin: 12px 0 0; font-size: 13px; color: #64748b;"><i class="fas fa-mobile-alt"></i> Aponte a câmera</p></div>
                            <div style="margin-top: 20px; padding: 14px; background: #f0fdfa; border-radius: 12px; font-size: 13px; color: #0f766e; text-align: left;"><div style="display: flex; gap: 8px; margin-bottom: 6px;"><i class="fas fa-info-circle"></i><span><strong>O responsável assina direto no celular dele.</strong> Assim que confirmar, você verá aqui.</span></div><div style="display: flex; gap: 8px;"><i class="fas fa-clock"></i><span>Sessão válida por <strong>30 minutos</strong>.</span></div></div>
                            <div style="margin-top: 16px;"><button onclick="copiarLinkAssinatura('${urlAssinatura}')" class="btn btn-outline-primary btn-sm"><i class="fas fa-link"></i> Copiar link</button></div>
                            <div style="margin-top: 14px; padding-top: 14px; border-top: 1px dashed #cbd5e1;"><p style="margin: 0 0 8px; font-size: 12px; color: #64748b;">Não consegue escanear?</p><button type="button" onclick="mostrarCanvasAssinaturaInline()" style="background: transparent; border: none; color: #0d9488; font-weight: 600; font-size: 14px; cursor: pointer; text-decoration: underline; padding: 6px 10px; border-radius: 8px;"><i class="fas fa-pen-fancy"></i> Assinar aqui mesmo</button></div>
                        </div>
                        <div id="psicoCanvasView" style="display: none;">
                            <div style="background: #f0fdfa; border-radius: 12px; padding: 14px; margin-bottom: 16px; text-align: left;"><div style="display: flex; gap: 8px;"><i class="fas fa-info-circle" style="color: #0f766e;"></i><span style="font-size: 13px; color: #0f766e;">Peça para o responsável assinar no espaço abaixo.</span></div></div>
                            <div id="psicoModalCanvasWrapper" style="position: relative; background: white; border: 3px dashed #cbd5e0; border-radius: 16px; overflow: hidden; height: 260px; margin-bottom: 14px; touch-action: none;"><canvas id="psicoModalCanvas" style="width: 100%; height: 100%; display: block;"></canvas><div id="psicoModalPlaceholder" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: #94a3b8; pointer-events: none; width: 100%;"><i class="fas fa-pen-fancy" style="font-size: 28px; display: block; margin-bottom: 5px;"></i><span style="font-size: 13px;">Assine aqui</span></div></div>
                            <div style="display: flex; gap: 10px;"><button type="button" onclick="limparCanvasInline()" style="flex: 1; padding: 12px; background: #f1f5f9; color: #475569; border: none; border-radius: 10px; font-weight: 600; font-size: 14px; cursor: pointer;"><i class="fas fa-eraser"></i> Limpar</button><button type="button" id="psicoBtnConfirmarInline" onclick="salvarAssinaturaInline()" disabled style="flex: 2; padding: 12px; background: #cbd5e0; color: white; border: none; border-radius: 10px; font-weight: 600; font-size: 14px; cursor: not-allowed;"><i class="fas fa-check"></i> Confirmar</button></div>
                            <div style="margin-top: 14px;"><button type="button" onclick="voltarParaQRCode()" style="background: transparent; border: none; color: #64748b; font-size: 13px; cursor: pointer; text-decoration: underline;"><i class="fas fa-arrow-left"></i> Voltar para o QR Code</button></div>
                        </div>
                    </div>
                    <div class="modal-footer" style="border-top: 1px solid #e5e7eb; padding: 15px 25px; justify-content: space-between;">
                        <button type="button" class="btn btn-outline-secondary" onclick="fecharModalAssinaturaQR()" style="border-radius: 10px;"><i class="fas fa-eye-slash"></i> Ocultar</button>
                        <button type="button" class="btn btn-danger" onclick="cancelarSessaoAssinatura()" style="border-radius: 10px;"><i class="fas fa-times"></i> Cancelar Assinatura</button>
                    </div>
                </div>
            </div>
        </div>
        <style>@keyframes spin { to { transform: rotate(360deg); } } @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }</style>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    estadoSessaoAssinatura.psicologia.modalInstance = new bootstrap.Modal(safeGet('modalQRCodeAssinatura'));
    estadoSessaoAssinatura.psicologia.modalInstance.show();
    setTimeout(() => { const img = safeGet('qrCodeImage'); if (img && window.innerWidth < 500) { img.style.width = '200px'; img.style.height = '200px'; } }, 200);
}

let __inlineCanvasStatePsico = { ctx: null, canvas: null, wrapper: null, placeholder: null, desenhando: false, temAssinatura: false, lastX: 0, lastY: 0, inicializado: false };

function mostrarCanvasAssinaturaInline() {
    const qrView = safeGet('psicoQrView');
    const canvasView = safeGet('psicoCanvasView');
    if (!qrView || !canvasView) return;
    qrView.style.display = 'none';
    canvasView.style.display = 'block';
    setTimeout(() => inicializarCanvasInlinePsico(), 50);
}

function voltarParaQRCode() {
    const qrView = safeGet('psicoQrView');
    const canvasView = safeGet('psicoCanvasView');
    if (!qrView || !canvasView) return;
    canvasView.style.display = 'none';
    qrView.style.display = 'block';
}

function inicializarCanvasInlinePsico() {
    const canvas = safeGet('psicoModalCanvas');
    const wrapper = safeGet('psicoModalCanvasWrapper');
    const placeholder = safeGet('psicoModalPlaceholder');
    if (!canvas || !wrapper) return;
    __inlineCanvasStatePsico.canvas = canvas;
    __inlineCanvasStatePsico.wrapper = wrapper;
    __inlineCanvasStatePsico.placeholder = placeholder;
    __inlineCanvasStatePsico.desenhando = false;
    __inlineCanvasStatePsico.temAssinatura = false;
    const rect = wrapper.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) { setTimeout(() => inicializarCanvasInlinePsico(), 100); return; }
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px'; canvas.style.height = rect.height + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.scale(dpr, dpr);
    ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#14b8a6';
    __inlineCanvasStatePsico.ctx = ctx;
    const btn = safeGet('psicoBtnConfirmarInline');
    if (btn) { btn.disabled = true; btn.style.background = '#cbd5e0'; btn.style.cursor = 'not-allowed'; }
    if (placeholder) placeholder.style.opacity = '1';
    if (wrapper) { wrapper.style.borderColor = '#cbd5e0'; wrapper.style.borderStyle = 'dashed'; }
    if (__inlineCanvasStatePsico.inicializado) return;
    __inlineCanvasStatePsico.inicializado = true;
    const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        let cx, cy;
        if (e.touches?.length > 0) { cx = e.touches[0].clientX; cy = e.touches[0].clientY; }
        else if (e.changedTouches?.length > 0) { cx = e.changedTouches[0].clientX; cy = e.changedTouches[0].clientY; }
        else { cx = e.clientX; cy = e.clientY; }
        return { x: cx - rect.left, y: cy - rect.top };
    };
    const iniciar = (e) => { e.preventDefault(); __inlineCanvasStatePsico.desenhando = true; __inlineCanvasStatePsico.temAssinatura = true; const p = getPos(e); __inlineCanvasStatePsico.lastX = p.x; __inlineCanvasStatePsico.lastY = p.y; if (wrapper) { wrapper.style.borderColor = '#14b8a6'; wrapper.style.borderStyle = 'solid'; } if (placeholder) placeholder.style.opacity = '0'; if (btn) { btn.disabled = false; btn.style.background = 'linear-gradient(135deg, #10b981, #059669)'; btn.style.cursor = 'pointer'; } };
    const desenhar = (e) => { if (!__inlineCanvasStatePsico.desenhando) return; e.preventDefault(); const p = getPos(e); __inlineCanvasStatePsico.ctx.beginPath(); __inlineCanvasStatePsico.ctx.moveTo(__inlineCanvasStatePsico.lastX, __inlineCanvasStatePsico.lastY); __inlineCanvasStatePsico.ctx.lineTo(p.x, p.y); __inlineCanvasStatePsico.ctx.stroke(); __inlineCanvasStatePsico.lastX = p.x; __inlineCanvasStatePsico.lastY = p.y; };
    const parar = (e) => { if (e?.preventDefault) e.preventDefault(); __inlineCanvasStatePsico.desenhando = false; };
    canvas.addEventListener('touchstart', iniciar, { passive: false });
    canvas.addEventListener('touchmove', desenhar, { passive: false });
    canvas.addEventListener('touchend', parar, { passive: false });
    canvas.addEventListener('touchcancel', parar, { passive: false });
    canvas.addEventListener('mousedown', iniciar);
    canvas.addEventListener('mousemove', desenhar);
    canvas.addEventListener('mouseup', parar);
    canvas.addEventListener('mouseleave', () => { if (__inlineCanvasStatePsico.desenhando) parar(); });
}

function limparCanvasInline() {
    const canvas = __inlineCanvasStatePsico.canvas;
    const ctx = __inlineCanvasStatePsico.ctx;
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    __inlineCanvasStatePsico.temAssinatura = false;
    if (__inlineCanvasStatePsico.placeholder) __inlineCanvasStatePsico.placeholder.style.opacity = '1';
    if (__inlineCanvasStatePsico.wrapper) { __inlineCanvasStatePsico.wrapper.style.borderColor = '#cbd5e0'; __inlineCanvasStatePsico.wrapper.style.borderStyle = 'dashed'; }
    const btn = safeGet('psicoBtnConfirmarInline');
    if (btn) { btn.disabled = true; btn.style.background = '#cbd5e0'; btn.style.cursor = 'not-allowed'; }
}

async function salvarAssinaturaInline() {
    if (!__inlineCanvasStatePsico.temAssinatura || !__inlineCanvasStatePsico.canvas) { mostrarToastConcluido('⚠️ Assine antes de confirmar', 'warning'); return; }
    const sessaoId = estadoSessaoAssinatura.psicologia?.sessaoId;
    if (!sessaoId) { mostrarToastConcluido('⚠️ Sessão não encontrada', 'error'); return; }
    const btn = safeGet('psicoBtnConfirmarInline');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...'; }
    try {
        const base64 = __inlineCanvasStatePsico.canvas.toDataURL('image/png');
        const response = await fetch(`/api/sessoes-assinatura/${sessaoId}/assinar`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assinaturaBase64: base64, assinanteNome: 'Responsável' }) });
        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Erro ao salvar');
        estadoSessaoAssinatura.psicologia.assinaturaCapturada = base64;
        const canvasView = safeGet('psicoCanvasView');
        if (canvasView) {
            const agora = new Date().toLocaleString('pt-BR');
            canvasView.innerHTML = `<div style="animation: fadeIn 0.3s ease;"><div style="background: linear-gradient(135deg, #10b981, #059669); border-radius: 14px; padding: 16px 20px; margin-bottom: 16px; display: flex; align-items: center; gap: 14px; color: white; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.3);"><div style="width: 44px; height: 44px; border-radius: 50%; background: rgba(255,255,255,0.25); display: flex; align-items: center; justify-content: center; flex-shrink: 0;"><i class="fas fa-check" style="font-size: 22px;"></i></div><div style="flex: 1; text-align: left;"><h4 style="margin: 0 0 2px; font-size: 16px; font-weight: 700;">Assinatura Registrada!</h4><p style="margin: 0; font-size: 13px; opacity: 0.95;">Confirmada em ${agora}</p></div></div><div style="text-align: left; margin-bottom: 10px;"><span style="font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;"><i class="fas fa-signature"></i> Assinatura capturada</span></div><div style="position: relative; background: #f0fdf4; border: 3px solid #10b981; border-radius: 16px; overflow: hidden; height: 220px; display: flex; align-items: center; justify-content: center; padding: 12px; box-sizing: border-box; box-shadow: inset 0 2px 8px rgba(16, 185, 129, 0.08);"><img src="${base64}" alt="Assinatura" style="max-width: 100%; max-height: 100%; object-fit: contain; display: block;"><div style="position: absolute; top: 10px; right: 10px; background: #10b981; color: white; padding: 4px 10px; border-radius: 20px; font-size: 10px; font-weight: 700; display: flex; align-items: center; gap: 4px; box-shadow: 0 2px 8px rgba(16, 185, 129, 0.4);"><i class="fas fa-lock" style="font-size: 9px;"></i> VERIFICADA</div></div><div style="display: flex; gap: 10px; margin-top: 16px;"><button type="button" onclick="refazerAssinaturaPsico()" style="flex: 1; padding: 12px; background: #fef3c7; color: #92400e; border: 2px solid #f59e0b; border-radius: 10px; font-weight: 600; font-size: 13px; cursor: pointer;"><i class="fas fa-redo"></i> Refazer</button><button type="button" onclick="fecharModalAssinaturaQR()" style="flex: 2; padding: 12px; background: linear-gradient(135deg, #14b8a6, #0d9488); color: white; border: none; border-radius: 10px; font-weight: 600; font-size: 13px; cursor: pointer;"><i class="fas fa-check-circle"></i> Concluir</button></div></div>`;
        }
        pararPollingAssinatura();
        atualizarStatusAssinado({ assinaturaBase64: base64, assinadaPorNome: 'Responsável', assinadaEm: new Date().toISOString() });
        mostrarToastConcluido('✅ Assinatura registrada!', 'success');
    } catch (e) {
        mostrarToastConcluido('❌ ' + e.message, 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Confirmar'; }
    }
}

function fecharModalAssinaturaQR() {
    if (estadoSessaoAssinatura.psicologia.modalInstance) estadoSessaoAssinatura.psicologia.modalInstance.hide();
    const modalEl = safeGet('modalQRCodeAssinatura');
    if (modalEl) setTimeout(() => modalEl.remove(), 300);
    if (estadoSessaoAssinatura.psicologia.assinaturaCapturada) atualizarStatusAssinado({ assinaturaBase64: estadoSessaoAssinatura.psicologia.assinaturaCapturada, assinadaPorNome: 'Responsável', assinadaEm: new Date().toISOString() });
    else mostrarBlocoCompactoAssinatura();
}

function mostrarBlocoCompactoAssinatura() {
    let bloco = safeGet('assistenteSocialBlocoAssinaturaInfo');
    if (!bloco) { bloco = document.createElement('div'); bloco.id = 'assistenteSocialBlocoAssinaturaInfo'; const check = safeGet('assistenteSocialNecessitaAssinatura'); if (check && check.parentElement) check.parentElement.parentElement.appendChild(bloco); }
    bloco.style.display = 'block';
    bloco.innerHTML = `<div class="alert alert-warning" style="font-size: 13px; border-radius: 10px; border-left: 4px solid #f59e0b; margin-top: 10px;"><div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;"><i class="fas fa-clock"></i><div style="flex: 1;"><strong>Aguardando assinatura...</strong><p style="margin: 3px 0 0; font-size: 12px;">O responsável precisa escanear o QR Code</p></div><button type="button" class="btn btn-sm btn-warning" onclick="reabrirModalAssinaturaQR()" style="border-radius: 8px;"><i class="fas fa-qrcode"></i> Mostrar QR</button></div></div>`;
}

function reabrirModalAssinaturaQR() {
    if (!estadoSessaoAssinatura.psicologia.sessaoId) { mostrarToastConcluido('⚠️ Nenhuma sessão ativa', 'warning'); return; }
    abrirModalAssinaturaQR(`${window.location.origin}/psicologia.html?assinatura=${estadoSessaoAssinatura.psicologia.sessaoId}`);
}

function copiarLinkAssinatura(url) {
    if (navigator.clipboard) { navigator.clipboard.writeText(url).then(() => mostrarToastConcluido('✅ Link copiado!', 'success')).catch(() => prompt('Copie o link:', url)); }
    else prompt('Copie o link:', url);
}

function iniciarPollingAssinatura(sessaoId) {
    pararPollingAssinatura();
    estadoSessaoAssinatura.psicologia.monitoramentoInterval = setInterval(async () => {
        try {
            const response = await fetch(`/api/sessoes-assinatura/${sessaoId}`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (!response.ok) { if (response.status === 404) pararPollingAssinatura(); return; }
            const data = await response.json();
            if (!data.success || !data.sessao) return;
            if (data.sessao.status === 'assinado') {
                estadoSessaoAssinatura.psicologia.assinaturaCapturada = data.sessao.assinaturaBase64;
                atualizarStatusAssinado(data.sessao);
                pararPollingAssinatura();
                const modalEl = safeGet('modalQRCodeAssinatura');
                if (modalEl) { const modal = bootstrap.Modal.getInstance(modalEl); if (modal) modal.hide(); setTimeout(() => modalEl.remove(), 300); }
                mostrarToastConcluido(`✅ Assinatura capturada!`, 'success');
            } else if (data.sessao.status === 'cancelado') pararPollingAssinatura();
        } catch (e) {}
    }, 3000);
}

function pararPollingAssinatura() {
    if (estadoSessaoAssinatura.psicologia.monitoramentoInterval) { clearInterval(estadoSessaoAssinatura.psicologia.monitoramentoInterval); estadoSessaoAssinatura.psicologia.monitoramentoInterval = null; }
}

function atualizarStatusAssinado(sessao) {
    let bloco = safeGet('assistenteSocialBlocoAssinaturaInfo');
    if (!bloco) { bloco = document.createElement('div'); bloco.id = 'assistenteSocialBlocoAssinaturaInfo'; const check = safeGet('assistenteSocialNecessitaAssinatura'); if (check && check.parentElement) check.parentElement.parentElement.appendChild(bloco); }
    bloco.style.display = 'block';
    bloco.innerHTML = `<div style="margin-top: 10px; background: #f0fdf4; border: 2px solid #10b981; border-radius: 12px; padding: 14px;"><div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;"><i class="fas fa-check-circle" style="color: #10b981; font-size: 22px;"></i><div style="flex: 1;"><strong style="color: #065f46;">✓ Assinatura capturada!</strong><p style="margin: 3px 0 0; font-size: 12px; color: #047857;">Assinado por <strong>${escapeHTML(sessao.assinadaPorNome || '')}</strong> ${sessao.assinadaEm ? ` em ${new Date(sessao.assinadaEm).toLocaleString('pt-BR')}` : ''}</p></div></div><div style="background: white; border-radius: 8px; padding: 8px; text-align: center;"><img src="${sessao.assinaturaBase64}" style="max-width: 100%; max-height: 100px;" alt="Assinatura"></div><button type="button" onclick="refazerAssinaturaPsico()" class="btn btn-sm btn-outline-danger w-100 mt-2" style="border-radius: 8px;"><i class="fas fa-redo"></i> Refazer Assinatura</button></div>`;
}

async function cancelarSessaoAssinatura() {
    const confirmar = await confirm('Cancelar a assinatura?');
    if (!confirmar) { const check = safeGet('assistenteSocialNecessitaAssinatura'); if (check) check.checked = true; return; }
    const sessaoId = estadoSessaoAssinatura.psicologia.sessaoId;
    if (sessaoId) { try { await fetch(`/api/sessoes-assinatura/${sessaoId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } }); } catch (e) {} }
    pararPollingAssinatura(); fecharModalAssinaturaQR();
    estadoSessaoAssinatura.psicologia.sessaoId = null; estadoSessaoAssinatura.psicologia.assinaturaCapturada = null; estadoSessaoAssinatura.psicologia.qrCodeDataUrl = null;
    const check = safeGet('assistenteSocialNecessitaAssinatura'); if (check) check.checked = false;
    const bloco = safeGet('assistenteSocialBlocoAssinaturaInfo'); if (bloco) bloco.style.display = 'none';
    mostrarToastConcluido('Sessão cancelada', 'info');
}

async function refazerAssinaturaPsico() {
    const confirmar = await confirm('Refazer a assinatura?');
    if (!confirmar) return;
    const sessaoId = estadoSessaoAssinatura.psicologia.sessaoId;
    if (sessaoId) { try { await fetch(`/api/sessoes-assinatura/${sessaoId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } }); } catch (e) {} }
    pararPollingAssinatura();
    estadoSessaoAssinatura.psicologia.sessaoId = null; estadoSessaoAssinatura.psicologia.assinaturaCapturada = null; estadoSessaoAssinatura.psicologia.qrCodeDataUrl = null;
    const bloco = safeGet('assistenteSocialBlocoAssinaturaInfo'); if (bloco) bloco.style.display = 'none';
    const check = safeGet('assistenteSocialNecessitaAssinatura'); if (check) { check.checked = false; check.checked = true; await toggleNecessitaAssinatura(); }
}

// ============================================
// SCANNER AUTOMÁTICO (VERSÃO ROBUSTA)
// ============================================
async function iniciarScannerAutomatico() {
    const qrContainer = safeGet('qr-reader-auto');
    if (!qrContainer) return;
    if (scannerAutoAtivo || __scannerIniciando) return;
    __scannerIniciando = true;

    qrContainer.innerHTML = '<div id="qr-reader-auto-new" style="width: 100%;"></div>';

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        qrContainer.innerHTML = `<div class="alert alert-warning m-3" style="border-radius: 12px;"><i class="fas fa-video-slash" style="font-size: 32px; display: block; margin-bottom: 10px;"></i><strong>Câmera não disponível</strong><br>Use o <strong>Modo Manual</strong>.<button class="btn btn-sm btn-primary mt-3" onclick="setModo('manual')" style="border-radius: 30px;"><i class="fas fa-users"></i> Modo Manual</button></div>`;
        __scannerIniciando = false;
        return;
    }

    try {
        scannerAuto = new Html5Qrcode("qr-reader-auto-new");
        const config = { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 };
        await scannerAuto.start({ facingMode: "environment" }, config, onScanSuccessAuto, () => {});
        scannerAutoAtivo = true;
    } catch (err) {
        let msg = 'Não foi possível acessar a câmera.';
        if (err.message?.includes('NotFoundError')) msg = 'Nenhuma câmera encontrada.';
        else if (err.message?.includes('NotAllowedError')) msg = 'Permissão de câmera negada.';
        else if (err.message?.includes('NotReadableError')) msg = 'Câmera em uso por outro app.';
        qrContainer.innerHTML = `<div class="alert alert-warning m-3" style="border-radius: 12px;"><i class="fas fa-video-slash" style="font-size: 32px; display: block; margin-bottom: 10px;"></i><strong>Câmera indisponível</strong><br><span style="font-size: 13px;">${msg}</span><button class="btn btn-sm btn-primary mt-3" onclick="setModo('manual')" style="border-radius: 30px;"><i class="fas fa-users"></i> Modo Manual</button></div>`;
        scannerAutoAtivo = false;
        scannerAuto = null;
    } finally {
        __scannerIniciando = false;
    }
}

async function pararScannerAutomatico() {
    if (!scannerAuto) { scannerAutoAtivo = false; __scannerIniciando = false; return; }
    try { if (scannerAutoAtivo) await scannerAuto.stop(); } catch (e) {}
    scannerAutoAtivo = false;
    scannerAuto = null;
    __scannerIniciando = false;
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
        const turmaSelecionada = safeGet('filtroTurmaManual').value;
        if (turmaSelecionada) await carregarAlunosPorTurma();
        else safeGet('listaAlunosManual').innerHTML = '<div class="text-center py-3">Selecione uma turma</div>';
    }
}

async function carregarTurmasParaManual() {
    try {
        const response = await fetch('/api/psicologia/turmas', { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await response.json();
        if (data.success && Array.isArray(data.turmas)) {
            turmasDisponiveis = data.turmas;
            const select = safeGet('filtroTurmaManual');
            if (select) {
                select.innerHTML = '<option value="">Selecione uma turma...</option>';
                data.turmas.forEach(turma => { select.innerHTML += `<option value="${escapeHTML(turma)}">${escapeHTML(turma)}</option>`; });
            }
        }
    } catch (error) {}
}

async function carregarAlunosPorTurma() {
    const turma = safeGet('filtroTurmaManual')?.value;
    if (!turma) { safeGet('listaAlunosManual').innerHTML = '<div class="text-center py-3">Selecione uma turma</div>'; return; }
    safeGet('listaAlunosManual').innerHTML = '<div class="text-center py-3"><div class="loading"></div><p>Carregando...</p></div>';
    try {
        const response = await fetch(`/api/psicologia/alunos-por-turma?turma=${encodeURIComponent(turma)}`, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await response.json();
        if (data.success && Array.isArray(data.alunos)) { alunosPorTurma = data.alunos; filtrarAlunosManual(); }
        else safeGet('listaAlunosManual').innerHTML = '<div class="notificar notificar-warning">Nenhum aluno encontrado</div>';
    } catch (error) { safeGet('listaAlunosManual').innerHTML = '<div class="notificar notificar-danger">Erro ao carregar</div>'; }
}

function filtrarAlunosManual() {
    if (!Array.isArray(alunosPorTurma)) return;
    const busca = (safeGet('filtroBuscaManual')?.value || '').toLowerCase();
    let filtrados = alunosPorTurma;
    if (busca) filtrados = filtrados.filter(a => (a.nome || '').toLowerCase().includes(busca));
    filtrados.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    const container = safeGet('listaAlunosManual');
    if (filtrados.length === 0) { container.innerHTML = '<div class="text-center text-muted py-3">Nenhum aluno</div>'; return; }
    container.innerHTML = '<div class="list-group">' + filtrados.map(aluno => `
        <div class="list-group-item list-group-item-action d-flex justify-content-between align-items-center" data-aluno-id="${aluno.id}" data-aluno-nome="${escapeHTML(aluno.nome)}" style="cursor: pointer;">
            <div><strong>${escapeHTML(aluno.nome)}</strong><br><small class="text-muted">${escapeHTML(aluno.matricula || '')} • ${escapeHTML(aluno.curso || '')}</small></div>
            <i class="fas fa-hand-pointer fa-2x text-primary"></i>
        </div>`).join('') + '</div>';
    container.querySelectorAll('.list-group-item').forEach(item => {
        item.addEventListener('click', () => selecionarAluno(item.getAttribute('data-aluno-id'), item.getAttribute('data-aluno-nome'), item));
    });
}

async function selecionarAluno(alunoId, alunoNome, itemEl) {
    if (itemEl) {
        itemEl.style.background = '#ccfbf1';
        itemEl.style.borderColor = '#14b8a6';
        itemEl.style.pointerEvents = 'none';
        itemEl.innerHTML = `<div><strong>${escapeHTML(alunoNome)}</strong><br><small style="color: #0d9488;">Processando...</small></div><i class="fas fa-spinner fa-spin fa-2x" style="color: #0d9488;"></i>`;
    }
    try { await buscarAluno(alunoId); } catch (error) {}
}

async function buscarAluno(alunoId) {
    try {
        await pararScannerAutomatico();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const response = await fetch(`/api/psicologia/aluno/${alunoId}`, { headers: { 'Authorization': `Bearer ${token}` }, signal: controller.signal });
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (data.success && data.aluno) {
            currentAluno = data.aluno;
            exibirAluno(data);
            mostrarFormRegistro();
        } else {
            mostrarToastConcluido(data.error || 'Aluno não encontrado', 'error');
            if (modoAtual === 'automatico') reiniciarScannerAutomatico();
            else carregarAlunosPorTurma();
        }
    } catch (error) {
        if (error.name === 'AbortError') mostrarToastConcluido('Tempo esgotado', 'error');
        else mostrarToastConcluido('Erro ao buscar aluno', 'error');
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
    
    const statusDiv = safeGet('statusAtendimento');
    if (statusDiv) {
        if (data.atendimentosAtivos && data.atendimentosAtivos.length > 0) {
            statusDiv.innerHTML = `<div class="notificar notificar-warning"><i class="fas fa-clock"></i> <strong>${data.atendimentosAtivos.length} atendimento(s) em andamento</strong>${data.atendimentosAtivos.map(a => `<div class="mt-2 p-2" style="background: white; border-radius: 8px;"><strong>${escapeHTML(a.tipoTarefaLabel || '')}</strong>: ${escapeHTML((a.descricao || '').substring(0, 100))}<br><small class="text-muted"><i class="fas fa-clock"></i> ${a.dataHoraEntrada ? new Date(a.dataHoraEntrada).toLocaleString('pt-BR') : ''}</small></div>`).join('')}</div>`;
        } else {
            statusDiv.innerHTML = `<div class="notificar notificar-info"><i class="fas fa-info-circle"></i> Nenhum atendimento em andamento</div>`;
        }
    }
    const histDiv = safeGet('historicoRecente');
    if (histDiv) {
        if (data.historicoRecente && data.historicoRecente.length > 0) {
            histDiv.innerHTML = `<h6 class="text-muted mt-3 mb-2"><i class="fas fa-history"></i> Histórico Recente</h6>${data.historicoRecente.map(h => `<div class="p-2 mb-2" style="background: #f8fafc; border-radius: 8px; font-size: 13px;"><strong>${escapeHTML(h.tipoTarefaLabel || '')}</strong>: ${escapeHTML((h.descricao || '').substring(0, 80))}<br><small class="text-muted">${h.dataHora ? new Date(h.dataHora).toLocaleDateString('pt-BR') : ''} ${h.resultado ? `• ${escapeHTML(h.resultado)}` : ''}</small></div>`).join('')}`;
        } else histDiv.innerHTML = '';
    }
    safeGet('alunoInfo').style.display = 'block';
    safeGet('alunoInfo').scrollIntoView({ behavior: 'smooth' });
}

function mostrarFormRegistro() {
    safeGet('formRegistro').style.display = 'block';
    __tiposSelecionados = [];
    tipoTarefaSelecionado = null;
    const tipoInput = safeGet('tipoTarefaSelecionado');
    if (tipoInput) tipoInput.value = '';
    document.querySelectorAll('.tipo-card').forEach(c => c.classList.remove('selected'));
    safeGet('descricao').value = '';
    safeGet('observacoes').value = '';
    safeGet('gravidade').value = 'media';
    safeGet('prioridade').value = 'normal';
    safeSetHTML('camposEspecificos', '');
    
    const check = safeGet('assistenteSocialNecessitaAssinatura');
    if (check) check.checked = false;
    
    const sessaoId = estadoSessaoAssinatura.psicologia.sessaoId;
    if (sessaoId) { fetch(`/api/sessoes-assinatura/${sessaoId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } }).catch(e => {}); }
    pararPollingAssinatura();
    estadoSessaoAssinatura.psicologia.sessaoId = null;
    estadoSessaoAssinatura.psicologia.assinaturaCapturada = null;
    estadoSessaoAssinatura.psicologia.qrCodeDataUrl = null;
    
    const bloco = safeGet('assistenteSocialBlocoAssinaturaInfo');
    if (bloco) { bloco.style.display = 'none'; bloco.innerHTML = ''; }
    
    const modalEl = safeGet('modalQRCodeAssinatura');
    if (modalEl) { const modal = bootstrap.Modal.getInstance(modalEl); if (modal) modal.hide(); setTimeout(() => modalEl.remove(), 300); }
}

function selecionarTipo(tipo) {
    if (!tipo) return;
    const idx = __tiposSelecionados.indexOf(tipo);
    if (idx >= 0) __tiposSelecionados.splice(idx, 1); else __tiposSelecionados.push(tipo);
    document.querySelectorAll('.tipo-card').forEach(c => {
        const t = c.getAttribute('data-tipo');
        if (__tiposSelecionados.includes(t)) c.classList.add('selected'); else c.classList.remove('selected');
    });
    tipoTarefaSelecionado = __tiposSelecionados[0] || null;
    const hidden = safeGet('tipoTarefaSelecionado');
    if (hidden) hidden.value = __tiposSelecionados.join(',');
    renderizarCamposEspecificosMultiplos();
}

function renderizarCamposEspecificosMultiplos() {
    const container = safeGet('camposEspecificos');
    if (!container) return;
    if (__tiposSelecionados.length === 0) { container.innerHTML = ''; return; }
    const blocos = __tiposSelecionados.map(tipo => {
        const label = TIPO_LABELS[tipo] || tipo;
        let htmlTipo = '';
        switch (tipo) {
            case 'escuta_acolhimento': htmlTipo = `<div class="row"><div class="col-md-6 mb-3"><label class="form-label">Tipo de Escuta</label><select id="detalheTipoEscuta_${tipo}" class="form-select" data-detalhe-key="tipoEscuta"><option value="">Selecione...</option><option value="Individual">Individual</option><option value="Em Grupo">Em Grupo</option><option value="Com Responsável">Com Responsável</option><option value="Com Professor">Com Professor</option></select></div><div class="col-md-6 mb-3"><label class="form-label">Duração (minutos)</label><input type="number" id="detalheDuracaoEscuta_${tipo}" class="form-control" min="1" data-detalhe-key="duracaoEscuta"></div></div>`; break;
            case 'manejo_crises_emocionais': htmlTipo = `<div class="mb-3"><label class="form-label">Tipo de Crise</label><select id="detalheTipoCrise_${tipo}" class="form-select" data-detalhe-key="tipoCrise"><option value="">Selecione...</option><option value="Ansiedade">Ansiedade</option><option value="Pânico">Pânico</option><option value="Depressão">Depressão</option><option value="Agressividade">Agressividade</option><option value="Automutilação">Automutilação</option><option value="Ideação Suicida">Ideação Suicida</option><option value="Outro">Outro</option></select></div><div class="mb-3"><label class="form-label">Ações Tomadas</label><textarea id="detalheAcoesTomadas_${tipo}" class="form-control" rows="2" data-detalhe-key="acoesTomadas" placeholder="O que foi feito durante o manejo..."></textarea></div><div class="mb-3"><label class="form-label">Encaminhamento Emergencial</label><input type="text" id="detalheEncaminhamentoEmergencial_${tipo}" class="form-control" data-detalhe-key="encaminhamentoEmergencial" placeholder="Ex: SAMU, Bombeiros, Família"></div>`; break;
            case 'atividades_grupos': htmlTipo = `<div class="row"><div class="col-md-6 mb-3"><label class="form-label">Nome da Atividade</label><input type="text" id="detalheNomeAtividade_${tipo}" class="form-control" data-detalhe-key="nomeAtividade" placeholder="Ex: Roda de Conversa"></div><div class="col-md-6 mb-3"><label class="form-label">Local</label><input type="text" id="detalheLocalAtividade_${tipo}" class="form-control" data-detalhe-key="localAtividade" placeholder="Ex: Sala 3, Pátio"></div></div><div class="row"><div class="col-md-6 mb-3"><label class="form-label">Participantes (separados por vírgula)</label><input type="text" id="detalheParticipantesAtividade_${tipo}" class="form-control" data-detalhe-key="participantesAtividade" placeholder="Ex: João, Maria, Pedro"></div><div class="col-md-6 mb-3"><label class="form-label">Duração (minutos)</label><input type="number" id="detalheDuracaoAtividade_${tipo}" class="form-control" min="1" data-detalhe-key="duracaoAtividade"></div></div>`; break;
            case 'acoes_atividades_saude': htmlTipo = `<div class="row"><div class="col-md-6 mb-3"><label class="form-label">Tema da Ação</label><input type="text" id="detalheTemaAcao_${tipo}" class="form-control" data-detalhe-key="temaAcao" placeholder="Ex: Saúde Mental"></div><div class="col-md-6 mb-3"><label class="form-label">Local</label><input type="text" id="detalheLocalAcao_${tipo}" class="form-control" data-detalhe-key="localAcao" placeholder="Ex: Pátio, Auditório"></div></div><div class="mb-3"><label class="form-label">Público Alvo</label><input type="text" id="detalhePublicoAlvo_${tipo}" class="form-control" data-detalhe-key="publicoAlvo" placeholder="Ex: Todos os alunos"></div>`; break;
            case 'acoes_socioemocionais_culturais': htmlTipo = `<div class="row"><div class="col-md-6 mb-3"><label class="form-label">Tema Socioemocional</label><input type="text" id="detalheTemaSocioemocional_${tipo}" class="form-control" data-detalhe-key="temaSocioemocional" placeholder="Ex: Empatia"></div><div class="col-md-6 mb-3"><label class="form-label">Tipo de Atividade Cultural</label><input type="text" id="detalheTipoAtividadeCultural_${tipo}" class="form-control" data-detalhe-key="tipoAtividadeCultural" placeholder="Ex: Teatro, Música"></div></div><div class="mb-3"><label class="form-label">Parcerias</label><input type="text" id="detalheParceria_${tipo}" class="form-control" data-detalhe-key="parceria" placeholder="Ex: Secretaria de Cultura"></div>`; break;
            case 'outros': htmlTipo = `<div class="mb-3"><label class="form-label">Especifique o Tipo de Tarefa <span class="text-danger">*</span></label><input type="text" id="detalheTipoTarefaOutros_${tipo}" class="form-control" data-detalhe-key="tipoTarefaOutros" placeholder="Descreva o tipo..."></div>`; break;
            default: htmlTipo = '';
        }
        if (!htmlTipo) return '';
        return `<div class="bloco-tipo-especifico" data-tipo-bloco="${tipo}"><div class="bloco-tipo-header"><i class="fas fa-tag"></i> ${escapeHTML(label)}</div><div class="bloco-tipo-body">${htmlTipo}</div></div>`;
    }).filter(Boolean);
    const htmlExtras = `<div class="mt-3"><div class="mb-3"><label class="form-label">Contexto Familiar</label><textarea id="detalheContextoFamiliar" class="form-control" rows="2" data-detalhe-key="contextoFamiliar" placeholder="Informações sobre o contexto familiar..."></textarea></div><div class="mb-3"><label class="form-label">Histórico Anterior</label><textarea id="detalheHistoricoAnterior" class="form-control" rows="2" data-detalhe-key="historicoAnterior" placeholder="Histórico de situações anteriores..."></textarea></div><div class="mb-3"><label class="form-label">Providências Tomadas</label><textarea id="detalheProvidencias" class="form-control" rows="2" data-detalhe-key="providenciasTomadas" placeholder="O que já foi feito..."></textarea></div><div class="mb-3"><label class="form-label">Próximos Passos</label><textarea id="detalheProximosPassos" class="form-control" rows="2" data-detalhe-key="proximosPassos" placeholder="O que será feito..."></textarea></div></div>`;
    container.innerHTML = blocos.join('') + htmlExtras;
}

function renderizarCamposEspecificos(tipo) { renderizarCamposEspecificosMultiplos(); }

function coletarDetalhes() {
    const detalhes = {};
    document.querySelectorAll('[data-detalhe-key]').forEach(el => {
        const key = el.getAttribute('data-detalhe-key');
        const val = el.value;
        if (!val) return;
        if (key === 'duracaoEscuta' || key === 'duracaoAtividade') { const n = parseInt(val); if (!isNaN(n) && n > 0) detalhes[key] = n; }
        else if (key === 'participantesAtividade' || key === 'profissionaisEnvolvidos') detalhes[key] = val.split(',').map(t => t.trim()).filter(t => t.length > 0);
        else detalhes[key] = val.trim();
    });
    return detalhes;
}

async function registrarOcorrencia() {
    if (__tiposSelecionados.length === 0) { mostrarToastConcluido('Selecione pelo menos um tipo de tarefa', 'error'); return; }
    const descricao = (safeGet('descricao')?.value || '').trim();
    if (!descricao) { mostrarToastConcluido('Descreva o ocorrido', 'error'); return; }
    if (!currentAluno || !currentAluno.id) { mostrarToastConcluido('Nenhum aluno selecionado', 'error'); return; }
    const precisaAssinatura = !!safeGet('assistenteSocialNecessitaAssinatura')?.checked;
    const assinaturaBase64 = estadoSessaoAssinatura.psicologia?.assinaturaCapturada || '';
    if (precisaAssinatura && !assinaturaBase64) { mostrarToastConcluido('⚠️ Aguardando assinatura!', 'warning', 5000); reabrirModalAssinaturaQR(); return; }
    const btn = document.querySelector('#formRegistro .btn-primary-custom');
    if (btn) btn.disabled = true;
    try {
        const response = await fetch('/api/psicologia/registrar', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ alunoId: currentAluno.id, tiposTarefa: __tiposSelecionados, tipoTarefa: __tiposSelecionados[0], descricao, observacoes: safeGet('observacoes')?.value || '', gravidade: safeGet('gravidade')?.value || 'media', prioridade: safeGet('prioridade')?.value || 'normal', detalhes: coletarDetalhes(), precisaAssinatura: precisaAssinatura }) });
        const data = await response.json();
        if (data.success) {
            if (assinaturaBase64 && data.atendimento?.id) {
                try { await fetch('/api/psicologia/aplicar-assinatura', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ atendimentoId: data.atendimento.id, sessaoId: estadoSessaoAssinatura.psicologia.sessaoId }) }); } catch (e) {}
            }
            const sessaoId = estadoSessaoAssinatura.psicologia.sessaoId;
            if (sessaoId) fetch(`/api/sessoes-assinatura/${sessaoId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } }).catch(e => {});
            pararPollingAssinatura(); fecharModalAssinaturaQR();
            estadoSessaoAssinatura.psicologia.sessaoId = null; estadoSessaoAssinatura.psicologia.assinaturaCapturada = null; estadoSessaoAssinatura.psicologia.qrCodeDataUrl = null;
            const bloco = safeGet('assistenteSocialBlocoAssinaturaInfo'); if (bloco) bloco.style.display = 'none';
            mostrarToastConcluido(`✅ ${data.message}`, 'success');
            finalizarAposSucesso();
        } else mostrarToastConcluido('❌ ' + (data.error || 'Erro ao registrar'), 'error');
    } catch (error) { mostrarToastConcluido('Erro ao registrar', 'error'); }
    finally { if (btn) btn.disabled = false; }
}

function finalizarAposSucesso() {
    limparTela();
    if (modoAtual === 'automatico') reiniciarScannerAutomatico(); else carregarAlunosPorTurma();
    carregarAtendimentosAtivos(); carregarDashboard(); carregarLembretes();
}

function limparTela() {
    safeGet('alunoInfo').style.display = 'none';
    safeGet('formRegistro').style.display = 'none';
    currentAluno = null; currentAtendimento = null;
    __tiposSelecionados = []; tipoTarefaSelecionado = null;
    const tipoInput = safeGet('tipoTarefaSelecionado'); if (tipoInput) tipoInput.value = '';
    document.querySelectorAll('.tipo-card').forEach(c => c.classList.remove('selected'));
    const sessaoId = estadoSessaoAssinatura.psicologia.sessaoId;
    if (sessaoId) fetch(`/api/sessoes-assinatura/${sessaoId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } }).catch(e => {});
    pararPollingAssinatura();
    estadoSessaoAssinatura.psicologia.sessaoId = null; estadoSessaoAssinatura.psicologia.assinaturaCapturada = null; estadoSessaoAssinatura.psicologia.qrCodeDataUrl = null;
    const check = safeGet('assistenteSocialNecessitaAssinatura'); if (check) check.checked = false;
    const bloco = safeGet('assistenteSocialBlocoAssinaturaInfo'); if (bloco) { bloco.style.display = 'none'; bloco.innerHTML = ''; }
}

function reiniciarScannerAutomatico() {
    setTimeout(() => { if (!scannerAutoAtivo && !__scannerIniciando && modoAtual === 'automatico') iniciarScannerAutomatico(); }, 1000);
}

async function carregarAtendimentosAtivos() {
    const container = safeGet('listaAtendimentosAtivos');
    if (!container) return;
    try {
        const response = await fetch('/api/psicologia/atendimentos-ativos', { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await response.json();
        __atendimentosAtivosBrutos = (data.success && Array.isArray(data.atendimentos)) ? data.atendimentos : [];
        popularFiltroTurmasAndamento();
        aplicarFiltrosAndamento();
        atualizarBadgeTabAtivos(__atendimentosAtivosBrutos.length);
        atualizarContadorAtendimentosAntigos();
    } catch (error) { container.innerHTML = `<div class="notificar notificar-danger"><i class="fas fa-exclamation-triangle"></i> Erro ao carregar</div>`; }
}

async function atualizarContadorAtendimentosAntigos() {
    try {
        const response = await fetch(`/api/psicologia/atendimentos-antigos?t=${Date.now()}`, { headers: { 'Authorization': `Bearer ${token}`, 'Cache-Control': 'no-cache' } });
        if (!response.ok) return;
        const data = await response.json();
        if (!data.success) return;
        const total = data.total || 0;
        const totalEl = document.getElementById('totalAtendimentosAntigos'); if (totalEl) totalEl.textContent = String(total);
        const badge = document.getElementById('badgeAtendimentosAntigos'); if (badge) { if (total > 0) { badge.textContent = total; badge.style.display = 'inline-block'; } else badge.style.display = 'none'; }
        const alerta = document.getElementById('alertaAtendimentosAntigos');
        if (alerta) {
            if (total > 0) {
                alerta.style.display = 'block';
                alerta.innerHTML = `<div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 12px 16px; border-radius: 8px; margin-bottom: 16px;"><div style="display: flex; align-items: center; gap: 12px;"><i class="fas fa-exclamation-triangle" style="color: #dc2626; font-size: 24px;"></i><div style="flex: 1;"><strong style="color: #991b1b; font-size: 15px;">⚠️ ${total} atendimento(s) há mais de 24h!</strong><p style="margin: 4px 0 0; font-size: 13px; color: #991b1b;">Verifique se já foram encerrados.</p></div><button onclick="abrirModalVerificacao24h()" class="btn btn-sm btn-danger" style="border-radius: 8px; white-space: nowrap;"><i class="fas fa-clipboard-check"></i> Verificar</button></div></div>`;
            } else { alerta.style.display = 'none'; alerta.innerHTML = ''; }
        }
        const card = document.getElementById('cardAtendimentosAntigos'); if (card) { if (total > 0) card.classList.add('tem-alerta'); else card.classList.remove('tem-alerta'); }
    } catch (error) {}
}

async function abrirModalVerificacao24h() {
    try {
        const response = await fetch('/api/psicologia/atendimentos-antigos', { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await response.json();
        if (!data.success || !data.atendimentos || data.atendimentos.length === 0) { mostrarToastConcluido('✅ Nenhum atendimento há mais de 24h!', 'success'); return; }
        const lista = data.atendimentos;
        const oldModal = safeGet('modalVerificacao24h'); if (oldModal) oldModal.remove();
        const modalHtml = `
            <div class="modal fade" id="modalVerificacao24h" tabindex="-1" data-bs-backdrop="static">
                <div class="modal-dialog modal-lg modal-dialog-scrollable">
                    <div class="modal-content">
                        <div class="modal-header" style="background: linear-gradient(135deg, #dc2626, #991b1b); color: white;">
                            <h5 class="modal-title"><i class="fas fa-clock"></i> Verificação de Atendimentos (>24h)</h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 12px 16px; border-radius: 8px; margin-bottom: 16px;"><div style="display: flex; align-items: center; gap: 10px;"><i class="fas fa-exclamation-triangle" style="color: #dc2626; font-size: 20px;"></i><div><strong style="color: #991b1b;">Atenção!</strong><p style="margin: 4px 0 0; font-size: 13px; color: #991b1b;">Atendimentos em andamento há mais de 24h.</p></div></div></div>
                            ${lista.map(a => `<div class="card mb-3" style="border-left: 4px solid ${a.nivelAlerta === 'critico' ? '#dc2626' : '#f59e0b'};"><div class="card-body"><div style="display: flex; align-items: flex-start; gap: 12px;"><img src="${a.alunoFoto || gerarAvatarSVG(a.alunoNome)}" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover;" onerror="this.onerror=null; this.src='${gerarAvatarSVG(a.alunoNome)}'"><div style="flex: 1;"><div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px;"><div><h5 style="margin: 0 0 4px; color: #0f766e;">${escapeHTML(a.alunoNome)}</h5><small style="color: #6b7280;"><i class="fas fa-graduation-cap"></i> ${escapeHTML(a.alunoTurma || '-')}</small></div><div><div style="background: #fef2f2; color: #991b1b; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: bold; display: inline-flex; align-items: center; gap: 4px;"><i class="fas fa-clock"></i> ${escapeHTML(a.tempoTexto)}</div></div></div><div style="background: #f9fafb; padding: 8px 10px; border-radius: 6px; margin-top: 8px; font-size: 13px;">${escapeHTML((a.descricao || '').substring(0, 200))}</div><div style="display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap;"><button class="btn btn-sm btn-success" onclick="verificarAtendimento24h('${a.id}', 'ja_encerrou')"><i class="fas fa-check-circle"></i> Já encerrou</button><button class="btn btn-sm btn-warning" onclick="verificarAtendimento24h('${a.id}', 'manter_aberto')"><i class="fas fa-clock"></i> Manter aberto</button><button class="btn btn-sm btn-info" onclick="verAtendimento('${a.id}')"><i class="fas fa-eye"></i> Ver</button></div></div></div></div></div>`).join('')}
                        </div>
                        <div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal"><i class="fas fa-times"></i> Fechar</button></div>
                    </div>
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        new bootstrap.Modal(safeGet('modalVerificacao24h')).show();
    } catch (error) {}
}

async function verificarAtendimento24h(atendimentoId, acao) {
    try {
        let resultado = 'resolvido'; let observacoes = '';
        if (acao === 'ja_encerrou') {
            const resultadoEscolhido = prompt(`Qual o resultado?\n1 - Resolvido\n2 - Em Acompanhamento\n3 - Reincidente\n4 - Encaminhado\n5 - Pendente`, '1');
            if (resultadoEscolhido === null) return;
            const mapa = { '1': 'resolvido', '2': 'em_acompanhamento', '3': 'reincidente', '4': 'encaminhado', '5': 'pendente' };
            resultado = mapa[resultadoEscolhido] || 'resolvido';
            observacoes = prompt('Observações (opcional):', '') || '';
        } else { if (!(await confirm('Manter o atendimento aberto?'))) return; }
        const response = await fetch(`/api/psicologia/atendimento/${atendimentoId}/verificar-24h`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ acao, resultado, observacoes }) });
        const data = await response.json();
        if (data.success) { mostrarToastConcluido(`✅ ${data.message}`, 'success'); await abrirModalVerificacao24h(); carregarAtendimentosAtivos(); carregarDashboard(); if (acao === 'ja_encerrou') carregarAtendimentosConcluidos(1); }
        else mostrarToastConcluido('❌ ' + (data.error || 'Erro'), 'error');
    } catch (error) { mostrarToastConcluido('Erro ao verificar', 'error'); }
}

function atualizarBadgeTabAtivos(total) {
    const badge = safeGet('badgeAtivosTab');
    if (!badge) return;
    if (total > 0) { badge.textContent = total; badge.style.display = 'inline-block'; } else badge.style.display = 'none';
}

function renderizarListaAtendimentosAtivos(lista) {
    const container = safeGet('listaAtendimentosAtivos');
    if (!container) return;
    if (!lista || lista.length === 0) {
        if (__atendimentosAtivosBrutos.length > 0) container.innerHTML = `<div class="estado-vazio-filtro"><i class="fas fa-search"></i><p>Nenhum atendimento corresponde aos filtros</p><button class="btn btn-sm btn-outline-primary" onclick="limparFiltrosAndamento()"><i class="fas fa-times"></i> Limpar filtros</button></div>`;
        else container.innerHTML = `<div class="text-center text-muted py-5"><i class="fas fa-check-circle fa-3x mb-3" style="color:#10b981;"></i><p>Nenhum atendimento em andamento</p></div>`;
        return;
    }
    const prioridadeIcon = { urgente: '🔴', alta: '🟠', normal: '🟡', baixa: '🟢' };
    const tempoIcon = a => a.nivelTempo === 'critico' ? 'fa-exclamation-triangle' : 'fa-clock';
    container.innerHTML = lista.map(a => {
        const estaMascarado = a._mascarado === true;
        const podeEditar = !estaMascarado;
        return `
        <div class="list-group-item filtrado" ${estaMascarado ? 'style="border-left: 4px solid #f59e0b;"' : ''}>
            ${estaMascarado ? `<div style="background: #fef3c7; color: #92400e; padding: 6px 10px; border-radius: 6px; font-size: 12px; margin-bottom: 8px;"><i class="fas fa-lock"></i> <strong>Conteúdo protegido</strong> — criado por ${escapeHTML(a._criadorNome || 'outro profissional')}</div>` : ''}
            ${a.alerta24hAtivo ? `<div style="background: #fef2f2; border-left: 3px solid #dc2626; padding: 6px 10px; border-radius: 6px; font-size: 12px; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;"><i class="fas fa-exclamation-triangle" style="color: #dc2626;"></i><strong style="color: #991b1b;">Atendimento há mais de 24h!</strong></div>` : ''}
            <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
                <div class="d-flex align-items-center gap-3">
                    <img src="${a.alunoFoto || gerarAvatarSVG(a.alunoNome || '?')}" style="width:50px;height:50px;border-radius:50%;object-fit:cover;" onerror="this.onerror=null; this.src='${gerarAvatarSVG(a.alunoNome || '?')}'">
                    <div>
                        <strong>${escapeHTML(a.alunoNome || '')}</strong>
                        <br><small class="text-muted">Turma: ${escapeHTML(a.alunoTurma || '-')}</small>
                        <br><span class="badge bg-primary">${escapeHTML(a.tipoTarefaLabel || '')}</span>
                        <span class="badge badge-gravidade gravidade-${a.gravidade || 'media'}">${escapeHTML(a.gravidade || 'media')}</span>
                        <span class="badge bg-secondary">${prioridadeIcon[a.prioridade] || '🟡'} ${escapeHTML(a.prioridade || 'normal')}</span>
                        ${a.temRemarcacaoPendente ? '<span class="badge bg-warning text-dark"><i class="fas fa-calendar"></i> Remarcado</span>' : ''}
                        ${a.temAssinatura ? '<span class="badge bg-success"><i class="fas fa-signature"></i> Assinado</span>' : ''}
                    </div>
                </div>
                <div class="text-end">
                    <small class="d-block ${a.nivelTempo === 'critico' ? 'text-danger fw-bold' : 'text-muted'}"><i class="fas ${tempoIcon(a)}"></i> ${escapeHTML(a.tempoTexto || '0 min')}</small>
                    <div class="mt-2 d-flex gap-1 flex-wrap justify-content-end">
                        <button class="btn btn-sm btn-info" onclick="verAtendimento('${a.id}')" title="Ver"><i class="fas fa-eye"></i> Ver</button>
                        <button class="btn btn-sm btn-success" onclick="imprimirAtendimento('${a.id}')" title="Imprimir"><i class="fas fa-print"></i></button>
                        ${a.alerta24hAtivo ? `<button class="btn btn-sm btn-danger" onclick="abrirModalVerificacao24h()" title="Verificar 24h"><i class="fas fa-exclamation-triangle"></i> Verificar</button>` : ''}
                        ${podeEditar ? `<button class="btn btn-sm btn-secondary" onclick="abrirEditarAtendimento('${a.id}')" title="Editar"><i class="fas fa-edit"></i></button><button class="btn btn-sm btn-primary" onclick="abrirFinalizacao('${a.id}')" title="Finalizar"><i class="fas fa-check"></i></button><button class="btn btn-sm btn-warning" onclick="abrirRemarcar('${a.id}')" title="Remarcar"><i class="fas fa-calendar-plus"></i></button><button class="btn btn-sm btn-danger" onclick="excluirAtendimento('${a.id}')" title="Excluir"><i class="fas fa-trash"></i></button>` : `<span class="badge" style="background: #fef3c7; color: #92400e; padding: 6px 10px;" title="Somente leitura"><i class="fas fa-lock"></i> Somente leitura</span>`}
                    </div>
                </div>
            </div>
            <div class="mt-2 p-2" style="background:#f8fafc;border-radius:8px;font-size:13px;">${escapeHTML((a.descricao || '').substring(0, 150))}${(a.descricao || '').length > 150 ? '...' : ''}</div>
        </div>`;
    }).join('');
}

// ============================================
// FINALIZAR / REMARCAR / EXCLUIR
// ============================================
function abrirFinalizacao(atendimentoId) {
    if (!atendimentoId) return;
    const modalHtml = `<div class="modal fade" id="modalFinalizar" tabindex="-1"><div class="modal-dialog"><div class="modal-content"><div class="modal-header" style="background: linear-gradient(135deg, #14b8a6, #0d9488); color: white;"><h5 class="modal-title"><i class="fas fa-check-circle"></i> Finalizar Atendimento</h5><button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div><div class="modal-body"><p>Selecione o resultado:</p><div class="d-grid gap-2"><button class="btn btn-outline-success text-start" onclick="confirmarFinalizacao('${atendimentoId}', 'resolvido')"><i class="fas fa-check-circle"></i> <strong>Resolvido</strong><br><small class="text-muted">O caso foi resolvido</small></button><button class="btn btn-outline-info text-start" onclick="confirmarFinalizacao('${atendimentoId}', 'em_acompanhamento')"><i class="fas fa-clock"></i> <strong>Em Acompanhamento</strong><br><small class="text-muted">Precisa de acompanhamento</small></button><button class="btn btn-outline-warning text-start" onclick="confirmarFinalizacao('${atendimentoId}', 'reincidente')"><i class="fas fa-redo"></i> <strong>Reincidente</strong><br><small class="text-muted">Já teve ocorrências anteriores</small></button><button class="btn btn-outline-secondary text-start" onclick="confirmarFinalizacao('${atendimentoId}', 'encaminhado')"><i class="fas fa-share"></i> <strong>Encaminhado</strong><br><small class="text-muted">Encaminhado para outro setor</small></button><button class="btn btn-outline-danger text-start" onclick="confirmarFinalizacao('${atendimentoId}', 'pendente')"><i class="fas fa-hourglass-half"></i> <strong>Pendente</strong><br><small class="text-muted">Aguardando ação</small></button></div></div></div></div></div>`;
    const old = safeGet('modalFinalizar'); if (old) old.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    new bootstrap.Modal(safeGet('modalFinalizar')).show();
}

async function confirmarFinalizacao(atendimentoId, resultado) {
    if (document.activeElement?.blur) document.activeElement.blur();
    const modalEl = safeGet('modalFinalizar');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) {
        modalEl.addEventListener('hidden.bs.modal', async function handler() {
            modalEl.removeEventListener('hidden.bs.modal', handler);
            if (resultado === 'em_acompanhamento') {
                const querRemarcar = await confirm('✅ Atendimento marcado como "Em Acompanhamento".\n\n🔄 Deseja REMARCAR?');
                if (querRemarcar) { await finalizarAtendimento(atendimentoId, resultado, true); setTimeout(() => abrirRemarcar(atendimentoId), 500); return; }
            }
            await finalizarAtendimento(atendimentoId, resultado, false);
        }, { once: true });
        modal.hide();
    } else { await finalizarAtendimento(atendimentoId, resultado, false); }
}

async function finalizarAtendimento(atendimentoId, resultado, pularAlerta) {
    try {
        const response = await fetch('/api/psicologia/finalizar', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ atendimentoId, resultado, observacoesFinais: '' }) });
        const data = await response.json();
        if (data.success) { if (!pularAlerta) mostrarToastConcluido(`✅ ${data.message}`, 'success'); carregarAtendimentosAtivos(); carregarDashboard(); carregarLembretes(); }
        else mostrarToastConcluido('❌ ' + (data.error || 'Erro'), 'error');
    } catch (error) { mostrarToastConcluido('Erro ao finalizar', 'error'); }
}

function abrirRemarcar(atendimentoId) {
    if (!atendimentoId) return;
    fecharNotificacoes();
    const hoje = new Date(); const amanha = new Date(hoje); amanha.setDate(amanha.getDate() + 1);
    const dataMin = amanha.toISOString().split('T')[0];
    const modalHtml = `<div class="modal fade" id="modalRemarcar" tabindex="-1"><div class="modal-dialog"><div class="modal-content"><div class="modal-header" style="background: linear-gradient(135deg, #f59e0b, #d97706); color: white;"><h5 class="modal-title"><i class="fas fa-calendar-plus"></i> Remarcar Atendimento</h5><button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div><div class="modal-body"><input type="hidden" id="remarcarAtendimentoId" value="${atendimentoId}"><div class="mb-3"><label class="form-label">Nova Data <span class="text-danger">*</span></label><input type="date" id="remarcarData" class="form-control" min="${dataMin}" value="${dataMin}"></div><div class="mb-3"><label class="form-label">Horário <span class="text-danger">*</span></label><input type="time" id="remarcarHorario" class="form-control" value="08:00"></div><div class="mb-3"><label class="form-label">Motivo <span class="text-danger">*</span></label><select id="remarcarMotivo" class="form-select"><option value="">Selecione...</option><option value="Aluno ausente">Aluno ausente</option><option value="Aluno não compareceu">Aluno não compareceu</option><option value="Profissional indisponível">Profissional indisponível</option><option value="Necessita mais tempo">Necessita mais tempo</option><option value="Aguardando documento">Aguardando documento</option><option value="Aguardando responsável">Aguardando responsável</option><option value="Outros">Outros</option></select></div><div class="mb-3"><label class="form-label">Observações</label><textarea id="remarcarObservacoes" class="form-control" rows="2"></textarea></div></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button><button type="button" class="btn btn-warning" onclick="confirmarRemarcacao()"><i class="fas fa-calendar-check"></i> Remarcar</button></div></div></div></div>`;
    const old = safeGet('modalRemarcar'); if (old) old.remove();
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
        const response = await fetch('/api/psicologia/remarcar', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ atendimentoId, dataRemarcacao, horarioRemarcacao, motivoRemarcacao, observacoesRemarcacao }) });
        const ct = response.headers.get('content-type') || '';
        if (!ct.includes('application/json')) { mostrarToastConcluido('⚠️ Indisponível.', 'error'); return; }
        const data = await response.json();
        if (data.success) { mostrarToastConcluido(`✅ ${data.message}`, 'success'); const modal = bootstrap.Modal.getInstance(safeGet('modalRemarcar')); if (modal) modal.hide(); carregarAtendimentosAtivos(); carregarLembretes(); }
        else mostrarToastConcluido('❌ ' + (data.error || 'Erro'), 'error');
    } catch (error) { mostrarToastConcluido('Erro ao remarcar', 'error'); }
}

function abrirFinalizacaoRemarcacao(remarcacaoId) {
    if (!remarcacaoId) return;
    fecharNotificacoes();
    const modalHtml = `<div class="modal fade" id="modalFinalizarRemarcacao" tabindex="-1"><div class="modal-dialog"><div class="modal-content"><div class="modal-header" style="background: linear-gradient(135deg, #14b8a6, #0d9488); color: white;"><h5 class="modal-title"><i class="fas fa-check-circle"></i> Finalizar Remarcação</h5><button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div><div class="modal-body"><p>O atendimento remarcado foi realizado?</p><div class="d-grid gap-2"><button class="btn btn-outline-success text-start" onclick="confirmarFinalizacaoRemarcacao('${remarcacaoId}', 'realizado')"><i class="fas fa-check-circle"></i> <strong>Sim, foi realizado</strong></button><button class="btn btn-outline-warning text-start" onclick="abrirRemarcarPorRemarcacao('${remarcacaoId}')"><i class="fas fa-calendar-plus"></i> <strong>Não, precisa remarcar novamente</strong></button><button class="btn btn-outline-secondary text-start" onclick="confirmarFinalizacaoRemarcacao('${remarcacaoId}', 'cancelado')"><i class="fas fa-times-circle"></i> <strong>Cancelar</strong></button></div></div></div></div></div>`;
    const old = safeGet('modalFinalizarRemarcacao'); if (old) old.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    new bootstrap.Modal(safeGet('modalFinalizarRemarcacao')).show();
}

async function confirmarFinalizacaoRemarcacao(remarcacaoId, acao) {
    const modal = bootstrap.Modal.getInstance(safeGet('modalFinalizarRemarcacao')); if (modal) modal.hide();
    if (acao === 'cancelado') { if (!(await confirm('Tem certeza que deseja CANCELAR?'))) return; }
    try {
        const response = await fetch('/api/psicologia/remarcacoes/finalizar', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ remarcacaoId, acao }) });
        const data = await response.json();
        if (data.success) { mostrarToastConcluido(`✅ ${data.message}`, 'success'); carregarAtendimentosAtivos(); carregarLembretes(); }
        else mostrarToastConcluido('❌ ' + (data.error || 'Erro'), 'error');
    } catch (error) { mostrarToastConcluido('Erro', 'error'); }
}

function abrirRemarcarPorRemarcacao(remarcacaoId) {
    const modal = bootstrap.Modal.getInstance(safeGet('modalFinalizarRemarcacao')); if (modal) modal.hide();
    fetch(`/api/psicologia/remarcacoes/${remarcacaoId}`, { headers: { 'Authorization': `Bearer ${token}` } })
        .then(r => r.json()).then(data => { if (data.success && data.remarcacao?.atendimentoId) abrirRemarcar(data.remarcacao.atendimentoId); else mostrarToastConcluido('Erro ao carregar', 'error'); })
        .catch(e => mostrarToastConcluido('Erro ao carregar', 'error'));
}

async function excluirAtendimento(atendimentoId) {
    if (!atendimentoId) return;
    if (!(await confirm('⚠️ Excluir este atendimento? Ação irreversível!'))) return;
    if (!(await confirm('⚠️ ÚLTIMA CONFIRMAÇÃO!'))) return;
    try {
        const response = await fetch(`/api/psicologia/atendimento/${atendimentoId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
        const data = await response.json();
        if (data.success) { mostrarToastConcluido('✅ Atendimento excluído!', 'success'); carregarAtendimentosAtivos(); carregarDashboard(); carregarLembretes(); carregarAtendimentosConcluidos(__concluidosPaginaAtual); }
        else { if (data.code === 'ADMIN_NAO_CRIADOR') mostrarNotificacaoInterna('🔒 Acesso restrito\n\n' + data.error, 'warning'); else mostrarToastConcluido('❌ ' + (data.error || 'Erro'), 'error'); }
    } catch (error) { mostrarToastConcluido('Erro ao excluir', 'error'); }
}

// ============================================
// CONCLUÍDOS
// ============================================
async function carregarAtendimentosConcluidos(pagina = 1) {
    const container = safeGet('listaConcluidos');
    if (!container) return;
    __concluidosPaginaAtual = pagina;
    const busca = (safeGet('filtroConcluidosBusca')?.value || '').trim();
    const tipo = safeGet('filtroConcluidosTipo')?.value || '';
    const resultado = safeGet('filtroConcluidosResultado')?.value || '';
    container.innerHTML = `<div class="text-center py-4"><div class="spinner-border spinner-border-sm text-teal" role="status"></div><p class="text-muted mt-2 mb-0">Carregando...</p></div>`;
    try {
        const params = new URLSearchParams();
        params.append('status', 'finalizado');
        params.append('limit', __concluidosPorPagina);
        params.append('page', pagina);
        if (tipo) params.append('tipo', tipo);
        if (busca) params.append('busca', busca);
        if (resultado) params.append('resultado', resultado);
        const response = await fetch(`/api/psicologia/atendimentos?${params.toString()}`, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await response.json();
        if (!data.success || !Array.isArray(data.atendimentos)) { container.innerHTML = `<div class="notificar notificar-warning">Nenhum atendimento encontrado</div>`; return; }
        __concluidosDados = data.atendimentos;
        __concluidosTotal = data.total || data.atendimentos.length;
        atualizarContadorConcluidos(data.total || data.atendimentos.length);
        renderizarListaConcluidos(data.atendimentos);
        renderizarPaginacaoConcluidos(data.totalPages || 1);
    } catch (error) { container.innerHTML = `<div class="notificar notificar-danger">Erro ao carregar</div>`; }
}

function atualizarContadorConcluidos(total) {
    const el = safeGet('contadorConcluidos'); if (el) el.textContent = total;
}

function renderizarListaConcluidos(lista) {
    const container = safeGet('listaConcluidos');
    if (!container) return;
    if (lista.length === 0) { container.innerHTML = `<div class="text-center py-4 text-muted"><i class="fas fa-inbox fa-3x mb-3" style="color:#cbd5e1;"></i><p>Nenhum atendimento corresponde aos filtros</p></div>`; return; }
    const resultadoLabel = { 'resolvido': { label: 'Resolvido', color: '#10b981', icon: '✅' }, 'em_acompanhamento': { label: 'Em Acompanhamento', color: '#3b82f6', icon: '🔄' }, 'reincidente': { label: 'Reincidente', color: '#f59e0b', icon: '⚠️' }, 'encaminhado': { label: 'Encaminhado', color: '#8b5cf6', icon: '↗️' }, 'pendente': { label: 'Pendente', color: '#6b7280', icon: '⏳' } };
    container.innerHTML = `
        <div class="table-responsive">
            <table class="table table-hover table-sm align-middle">
                <thead style="background: #f0fdfa;">
                    <tr><th style="width: 30%;">Aluno</th><th style="width: 20%;">Tipo</th><th style="width: 15%;">Entrada</th><th style="width: 15%;">Saída</th><th style="width: 12%;">Resultado</th><th style="width: 8%; text-align: center;">Ações</th></tr>
                </thead>
                <tbody>
                    ${lista.map(a => {
                        const r = resultadoLabel[a.saida?.resultado] || { label: a.saida?.resultado || '-', color: '#6b7280', icon: '•' };
                        return `<tr data-id="${a.id}"><td><div class="d-flex align-items-center gap-2"><img src="${gerarAvatarSVG(a.alunoNome || '?')}" style="width: 32px; height: 32px; border-radius: 50%;" alt=""><div><strong style="font-size: 13px;">${escapeHTML(a.alunoNome || '')}</strong><br><small class="text-muted" style="font-size: 11px;">${escapeHTML(a.alunoMatricula || '')} • ${escapeHTML(a.alunoTurma || '')}</small></div></div></td><td><span class="badge" style="background: #14b8a6; font-size: 10px;">${escapeHTML(a.tipoTarefaLabel || '')}</span></td><td><small>${a.dataEntradaFormatada || (a.dataEntrada ? new Date(a.dataEntrada).toLocaleDateString('pt-BR') : '-')}</small></td><td><small>${a.saida?.dataHoraFormatada || '-'}</small></td><td><span class="badge" style="background: ${r.color}; font-size: 10px;">${r.icon} ${escapeHTML(r.label)}</span></td><td class="text-center"><div class="d-flex gap-1 justify-content-center"><button class="btn btn-sm btn-info" onclick="verAtendimento('${a.id}')" title="Ver"><i class="fas fa-eye"></i></button><button class="btn btn-sm btn-danger" onclick="excluirAtendimentoConcluido('${a.id}', '${escapeHTML(a.alunoNome || '')}')" title="Excluir"><i class="fas fa-trash"></i></button></div></td></tr>`;
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
    if (inicio > 1) { html += `<li class="page-item"><a class="page-link" href="#" onclick="event.preventDefault(); carregarAtendimentosConcluidos(1)">1</a></li>`; if (inicio > 2) html += `<li class="page-item disabled"><span class="page-link">...</span></li>`; }
    for (let i = inicio; i <= fim; i++) { html += `<li class="page-item ${i === __concluidosPaginaAtual ? 'active' : ''}"><a class="page-link" href="#" onclick="event.preventDefault(); carregarAtendimentosConcluidos(${i})">${i}</a></li>`; }
    if (fim < totalPaginas) { if (fim < totalPaginas - 1) html += `<li class="page-item disabled"><span class="page-link">...</span></li>`; html += `<li class="page-item"><a class="page-link" href="#" onclick="event.preventDefault(); carregarAtendimentosConcluidos(${totalPaginas})">${totalPaginas}</a></li>`; }
    html += `<li class="page-item ${__concluidosPaginaAtual === totalPaginas ? 'disabled' : ''}"><a class="page-link" href="#" onclick="event.preventDefault(); ${__concluidosPaginaAtual < totalPaginas ? `carregarAtendimentosConcluidos(${__concluidosPaginaAtual + 1})` : ''}"><i class="fas fa-chevron-right"></i></a></li>`;
    html += '</ul></nav>';
    container.innerHTML = html;
}

async function excluirAtendimentoConcluido(atendimentoId, alunoNome) {
    if (!atendimentoId) return;
    if (!(await confirm(`⚠️ Excluir atendimento de ${alunoNome}?`))) return;
    if (!(await confirm('⚠️ ÚLTIMA CONFIRMAÇÃO!'))) return;
    try {
        const response = await fetch(`/api/psicologia/atendimento/${atendimentoId}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
        const data = await response.json();
        if (data.success) {
            const row = document.querySelector(`tr[data-id="${atendimentoId}"]`);
            if (row) { row.style.transition = 'all 0.3s'; row.style.opacity = '0'; row.style.transform = 'translateX(-20px)'; setTimeout(() => { row.remove(); const contador = safeGet('contadorConcluidos'); if (contador) { const atual = parseInt(contador.textContent) || 0; contador.textContent = Math.max(0, atual - 1); } const tabela = document.querySelector('#listaConcluidos tbody'); if (tabela && tabela.children.length === 0) carregarAtendimentosConcluidos(__concluidosPaginaAtual); }, 300); }
            mostrarToastConcluido('✅ Atendimento excluído!', 'success'); carregarDashboard(); carregarLembretes();
        } else mostrarToastConcluido('❌ ' + (data.error || 'Erro'), 'error');
    } catch (error) { mostrarToastConcluido('Erro', 'error'); }
}

// ============================================
// TOAST DE NOTIFICAÇÃO
// ============================================
function mostrarToastConcluido(mensagem, tipo = 'info') {
    const msg = String(mensagem || '');
    let tipoFinal = tipo;
    if (msg.trim().startsWith('✅')) tipoFinal = 'success';
    else if (msg.trim().startsWith('❌') || msg.trim().startsWith('⚠️')) tipoFinal = msg.trim().startsWith('⚠️') ? 'warning' : 'error';
    const cores = { success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#8b5cf6' };
    const icons = { success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
    const toast = document.createElement('div');
    toast.style.cssText = `position: fixed; bottom: 20px; right: 20px; background: ${cores[tipoFinal] || cores.info}; color: white; padding: 12px 20px; border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,0.2); z-index: 99999; font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 10px; animation: slideInRight 0.3s ease-out; max-width: 400px;`;
    toast.innerHTML = `<i class="fas ${icons[tipoFinal] || icons.info}"></i> ${msg}`;
    if (!document.getElementById('toastAnimation')) { const style = document.createElement('style'); style.id = 'toastAnimation'; style.textContent = `@keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } } @keyframes slideOutRight { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 0; } }`; document.head.appendChild(style); }
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.animation = 'slideOutRight 0.3s ease-in'; setTimeout(() => toast.remove(), 300); }, 3500);
}

// ============================================
// EXCLUSÃO EM MASSA
// ============================================
function abrirExclusaoEmMassa() {
    const modalHtml = `<div class="modal fade" id="modalExclusaoMassa" tabindex="-1"><div class="modal-dialog"><div class="modal-content"><div class="modal-header bg-danger text-white"><h5 class="modal-title"><i class="fas fa-exclamation-triangle"></i> Exclusão em Massa</h5><button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div><div class="modal-body"><div class="alert alert-danger"><strong>⚠️ ATENÇÃO!</strong><br>Esta ação é <strong>IRREVERSÍVEL</strong>.</div><div class="mb-3"><label class="form-label">Excluir finalizados antes de:</label><input type="date" id="massaDataCorte" class="form-control" value="${new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}"></div><div class="mb-3"><label class="form-label">Digite "CONFIRMAR":</label><input type="text" id="massaConfirmacao" class="form-control" placeholder="Digite CONFIRMAR"></div></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button><button type="button" class="btn btn-danger" onclick="confirmarExclusaoMassa()"><i class="fas fa-trash-alt"></i> Excluir</button></div></div></div></div>`;
    const old = safeGet('modalExclusaoMassa'); if (old) old.remove();
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    new bootstrap.Modal(safeGet('modalExclusaoMassa')).show();
}

async function confirmarExclusaoMassa() {
    const dataCorte = safeGet('massaDataCorte')?.value;
    const confirmacao = (safeGet('massaConfirmacao')?.value || '').trim().toUpperCase();
    if (confirmacao !== 'CONFIRMAR') { mostrarToastConcluido('⚠️ Digite "CONFIRMAR"', 'error'); return; }
    if (!dataCorte) { mostrarToastConcluido('⚠️ Selecione uma data', 'error'); return; }
    const modal = bootstrap.Modal.getInstance(safeGet('modalExclusaoMassa')); if (modal) modal.hide();
    try {
        const response = await fetch('/api/psicologia/atendimentos/exclusao-massa', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ dataCorte, status: 'finalizado', confirmacao: 'CONFIRMAR' }) });
        const ct = response.headers.get('content-type') || '';
        if (!ct.includes('application/json')) { mostrarToastConcluido('⚠️ Indisponível.', 'error'); return; }
        const data = await response.json();
        if (data.success) { mostrarToastConcluido(`✅ ${data.excluidos || 0} excluídos!`, 'success'); carregarAtendimentosConcluidos(1); carregarDashboard(); }
        else mostrarToastConcluido('❌ ' + (data.error || 'Erro'), 'error');
    } catch (error) { mostrarToastConcluido('Erro', 'error'); }
}

// ============================================
// DASHBOARD
// ============================================
async function carregarDashboard() {
    try {
        const response = await fetch('/api/psicologia/dashboard', { headers: { 'Authorization': `Bearer ${token}` } });
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
            dashboardCharts.tipos = new Chart(ctxTipos.getContext('2d'), { type: 'bar', data: { labels: data.porTipo.map(t => t.label || ''), datasets: [{ label: 'Ocorrências', data: data.porTipo.map(t => t.count || 0), backgroundColor: ['#14b8a6', '#0d9488', '#0f766e', '#115e59', '#2dd4bf', '#5eead4'], borderRadius: 8 }] }, options: { responsive: true, maintainAspectRatio: true, indexAxis: 'y', plugins: { legend: { display: false } } } });
        }
        const ctxGravidade = safeGet('chartGravidade');
        if (ctxGravidade && data.porGravidade) {
            if (dashboardCharts.gravidade) try { dashboardCharts.gravidade.destroy(); } catch(e){}
            const labels = { baixa: 'Baixa', media: 'Média', alta: 'Alta', critica: 'Crítica' };
            const colors = { baixa: '#10b981', media: '#f59e0b', alta: '#ef4444', critica: '#7f1d1d' };
            dashboardCharts.gravidade = new Chart(ctxGravidade.getContext('2d'), { type: 'doughnut', data: { labels: data.porGravidade.map(g => labels[g.gravidade] || g.gravidade || ''), datasets: [{ data: data.porGravidade.map(g => g.count || 0), backgroundColor: data.porGravidade.map(g => colors[g.gravidade] || '#6b7280') }] }, options: { responsive: true, maintainAspectRatio: true } });
        }
        const ctxAtendimentos = safeGet('chartAtendimentos');
        if (ctxAtendimentos && data.tendencias?.ultimos7Dias) {
            if (dashboardCharts.atendimentos) try { dashboardCharts.atendimentos.destroy(); } catch(e){}
            dashboardCharts.atendimentos = new Chart(ctxAtendimentos.getContext('2d'), { type: 'line', data: { labels: data.tendencias.ultimos7Dias.map(d => d.dia || ''), datasets: [{ label: 'Ocorrências', data: data.tendencias.ultimos7Dias.map(d => d.atendimentos || 0), borderColor: '#14b8a6', backgroundColor: 'rgba(20, 184, 166, 0.1)', fill: true, tension: 0.4 }] }, options: { responsive: true, maintainAspectRatio: true } });
        }
        const ctxTurmas = safeGet('chartTurmas');
        if (ctxTurmas && data.tendencias?.porTurma) {
            if (dashboardCharts.turmas) try { dashboardCharts.turmas.destroy(); } catch(e){}
            dashboardCharts.turmas = new Chart(ctxTurmas.getContext('2d'), { type: 'bar', data: { labels: data.tendencias.porTurma.map(t => t.turma || 'Sem turma'), datasets: [{ label: 'Ocorrências', data: data.tendencias.porTurma.map(t => t.count || 0), backgroundColor: '#5eead4', borderRadius: 8 }] }, options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } } } });
        }
        const reinc = safeGet('alunosReincidentes');
        if (reinc) {
            const lista = data.tendencias?.alunosReincidentes || [];
            if (lista.length > 0) reinc.innerHTML = `<div class="table-responsive"><table class="table table-sm"><thead><tr><th>Aluno</th><th>Turma</th><th>Ocorrências</th></tr></thead><tbody>${lista.map(a => `<tr><td><strong>${escapeHTML(a.alunoNome || '')}</strong></td><td>${escapeHTML(a.alunoTurma || '-')}</td><td><span class="badge bg-danger">${a.count || 0}</span></td></tr>`).join('')}</tbody></table></div>`;
            else reinc.innerHTML = `<p class="text-muted text-center py-3"><i class="fas fa-check-circle text-success"></i> Nenhum aluno reincidente</p>`;
        }
    } catch (error) {}
}

// ============================================
// RELATÓRIOS
// ============================================
async function carregarTurmasParaRelatorio() {
    try {
        const response = await fetch('/api/psicologia/turmas', { headers: { 'Authorization': `Bearer ${token}` } });
        if (!response.ok) return;
        const data = await response.json();
        const select = safeGet('filtroTurma');
        if (!select) return;
        if (data.success && Array.isArray(data.turmas)) {
            const valorAtual = select.value;
            select.innerHTML = '<option value="">Selecione...</option>';
            data.turmas.forEach(t => { const option = document.createElement('option'); option.value = t; option.textContent = t; select.appendChild(option); });
            if (valorAtual && data.turmas.includes(valorAtual)) select.value = valorAtual;
        }
    } catch (error) {}
}

function toggleRelatorioFiltros() {
    const tipo = safeGet('tipoRelatorio')?.value;
    const filtroTurmaDiv = safeGet('filtroTurmaDiv');
    const filtroAlunoDiv = safeGet('filtroAlunoDiv');
    if (filtroTurmaDiv) filtroTurmaDiv.style.display = tipo === 'turma' ? 'block' : 'none';
    if (filtroAlunoDiv) filtroAlunoDiv.style.display = tipo === 'aluno' ? 'block' : 'none';
    const btnCSV = safeGet('btnExportarCSVPsicologia');
    const btnPDF = safeGet('btnExportarPDFPsicologia');
    if (btnCSV) btnCSV.disabled = true;
    if (btnPDF) btnPDF.disabled = true;
    relatorioData = null;
    if (tipo === 'turma') { const selectTurma = safeGet('filtroTurma'); if (selectTurma && selectTurma.options.length <= 1) carregarTurmasParaRelatorio(); }
    if (tipo === 'aluno') { inicializarAutocompleteAluno(); setTimeout(() => safeGet('buscaAlunoRelatorio')?.focus(), 100); if (!__alunosCarregados) carregarAlunosParaRelatorio(); }
}

function inicializarAutocompleteAluno() {
    const input = safeGet('buscaAlunoRelatorio');
    const listEl = safeGet('autocompleteAlunoList');
    const hiddenInput = safeGet('filtroAluno');
    if (!input || !listEl || !hiddenInput) return;
    if (input.dataset.autocompleteInit === 'true') return;
    input.dataset.autocompleteInit = 'true';
    input.addEventListener('input', (e) => { const termo = e.target.value.trim(); hiddenInput.value = ''; const infoEl = safeGet('alunoSelecionadoInfo'); if (infoEl) infoEl.textContent = ''; if (termo.length < 1) { listEl.style.display = 'none'; return; } filtrarAlunosAutocomplete(termo); });
    input.addEventListener('focus', () => { const termo = input.value.trim(); if (termo.length >= 1) filtrarAlunosAutocomplete(termo); });
    input.addEventListener('keydown', (e) => { if (listEl.style.display === 'none') return; if (e.key === 'ArrowDown') { e.preventDefault(); __indiceSelecionado = Math.min(__indiceSelecionado + 1, __alunosFiltrados.length - 1); destacarItemAutocomplete(); } else if (e.key === 'ArrowUp') { e.preventDefault(); __indiceSelecionado = Math.max(__indiceSelecionado - 1, -1); destacarItemAutocomplete(); } else if (e.key === 'Enter') { e.preventDefault(); if (__indiceSelecionado >= 0 && __alunosFiltrados[__indiceSelecionado]) selecionarAlunoAutocomplete(__alunosFiltrados[__indiceSelecionado]); } else if (e.key === 'Escape') listEl.style.display = 'none'; });
    document.addEventListener('click', (e) => { const listEl = safeGet('autocompleteAlunoList'); const input = safeGet('buscaAlunoRelatorio'); if (!listEl || !input) return; if (listEl.style.display === 'none') return; if (listEl.contains(e.target) || input.contains(e.target)) return; listEl.style.display = 'none'; });
}

async function carregarAlunosParaRelatorio() {
    if (__alunosCarregados && __alunosParaRelatorio.length > 0) return;
    const inputBusca = safeGet('buscaAlunoRelatorio');
    if (inputBusca) { inputBusca.placeholder = 'Carregando alunos...'; inputBusca.disabled = true; }
    try {
        const turmasRes = await fetch('/api/psicologia/turmas', { headers: { 'Authorization': `Bearer ${token}` } });
        const turmasData = await turmasRes.json();
        if (!turmasData.success || !Array.isArray(turmasData.turmas)) return;
        const todosAlunos = [];
        for (const turma of turmasData.turmas) {
            try { const res = await fetch(`/api/psicologia/alunos-por-turma?turma=${encodeURIComponent(turma)}`, { headers: { 'Authorization': `Bearer ${token}` } }); const data = await res.json(); if (data.success && Array.isArray(data.alunos)) data.alunos.forEach(aluno => todosAlunos.push({ id: aluno.id, nome: aluno.nome, matricula: aluno.matricula || '', turma: aluno.turma || turma, curso: aluno.curso || '' })); } catch (e) {}
        }
        todosAlunos.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
        __alunosParaRelatorio = todosAlunos;
        __alunosCarregados = true;
        if (inputBusca) { inputBusca.placeholder = 'Digite o nome do aluno...'; inputBusca.disabled = false; }
    } catch (error) { if (inputBusca) { inputBusca.placeholder = 'Erro ao carregar alunos'; inputBusca.disabled = false; } }
}

function filtrarAlunosAutocomplete(termo) {
    const listEl = safeGet('autocompleteAlunoList');
    if (!listEl) return;
    if (!__alunosCarregados) { listEl.innerHTML = `<div class="autocomplete-aluno-loading">Carregando...</div>`; listEl.style.display = 'block'; carregarAlunosParaRelatorio().then(() => { if (__alunosCarregados) filtrarAlunosAutocomplete(termo); }); return; }
    const termoLower = termo.toLowerCase();
    __alunosFiltrados = __alunosParaRelatorio.filter(a => (a.nome || '').toLowerCase().includes(termoLower) || (a.matricula || '').toLowerCase().includes(termoLower)).slice(0, 10);
    __indiceSelecionado = -1;
    if (__alunosFiltrados.length === 0) { listEl.innerHTML = `<div class="autocomplete-aluno-empty">Nenhum aluno encontrado</div>`; listEl.style.display = 'block'; return; }
    listEl.innerHTML = __alunosFiltrados.map((aluno, index) => { const nomeDestacado = destacarTermo(aluno.nome, termo); const matricula = aluno.matricula ? `<span class="aluno-matricula">${escapeHTML(aluno.matricula)}</span>` : ''; return `<div class="autocomplete-aluno-item" data-index="${index}"><div class="aluno-nome">${nomeDestacado}</div><div class="aluno-info"><span class="aluno-turma">${escapeHTML(aluno.turma || 'Sem turma')}</span>${matricula}</div></div>`; }).join('');
    listEl.querySelectorAll('.autocomplete-aluno-item').forEach(item => { item.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); const index = parseInt(item.getAttribute('data-index')); if (__alunosFiltrados[index]) selecionarAlunoAutocomplete(__alunosFiltrados[index]); }); item.addEventListener('mouseenter', () => { __indiceSelecionado = parseInt(item.getAttribute('data-index')); destacarItemAutocomplete(); }); });
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
    listEl.querySelectorAll('.autocomplete-aluno-item').forEach((item, i) => { if (i === __indiceSelecionado) { item.classList.add('selected'); item.scrollIntoView({ block: 'nearest' }); } else item.classList.remove('selected'); });
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
    if (infoEl) { const mat = aluno.matricula ? ` • ${aluno.matricula}` : ''; infoEl.innerHTML = `✅ <strong>${escapeHTML(aluno.nome)}</strong>${mat} — Turma ${escapeHTML(aluno.turma || '-')}`; infoEl.style.color = '#0d9488'; }
}

async function carregarRelatorio() {
    const tipo = safeGet('tipoRelatorio')?.value;
    const dataInicio = safeGet('dataInicio')?.value || '';
    const dataFim = safeGet('dataFim')?.value || '';
    let url = '';
    try {
        if (tipo === 'geral') { url = `/api/psicologia/relatorio/geral?`; if (dataInicio) url += `dataInicio=${dataInicio}&`; if (dataFim) url += `dataFim=${dataFim}&`; }
        else if (tipo === 'turma') { const turma = safeGet('filtroTurma')?.value; if (!turma) { mostrarToastConcluido('Selecione uma turma', 'error'); return; } url = `/api/psicologia/relatorio/turma/${encodeURIComponent(turma)}?`; if (dataInicio) url += `dataInicio=${dataInicio}&`; if (dataFim) url += `dataFim=${dataFim}&`; }
        else if (tipo === 'aluno') { const alunoId = safeGet('filtroAluno')?.value; if (!alunoId) { mostrarToastConcluido('Selecione um aluno na lista', 'error'); return; } url = `/api/psicologia/relatorio/aluno/${alunoId}?`; if (dataInicio) url += `dataInicio=${dataInicio}&`; if (dataFim) url += `dataFim=${dataFim}&`; }
        const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await response.json();
        if (data.success) { relatorioData = data; exibirRelatorio(data, tipo); habilitarBotoesRelatorio(); }
        else mostrarToastConcluido('Erro: ' + (data.error || ''));
    } catch (error) { mostrarToastConcluido('Erro ao carregar relatório', 'error'); }
}

function exibirRelatorio(data, tipo) {
    const container = safeGet('resultadoRelatorio');
    if (!container) return;
    try {
        if (tipo === 'geral') {
            const porTipo = Array.isArray(data.porTipo) ? data.porTipo : [];
            const porTurma = Array.isArray(data.porTurma) ? data.porTurma : [];
            const atendimentos = Array.isArray(data.atendimentos) ? data.atendimentos : [];
            container.innerHTML = `<div class="card"><div class="card-body"><h5><i class="fas fa-chart-bar"></i> Relatório Geral</h5><p>Total: <strong>${data.totalAtendimentos || 0}</strong></p><h6 class="mt-4">Por Tipo</h6><div class="row">${porTipo.map(t => `<div class="col-md-4 mb-2"><div class="p-2" style="background:#ccfbf1;border-radius:8px;"><strong>${escapeHTML(t.label || '')}</strong>: ${t.count || 0}</div></div>`).join('')}</div><h6 class="mt-4">Por Turma</h6><div class="table-responsive"><table class="table table-sm"><thead><tr><th>Turma</th><th>Total</th><th>Alunos</th></tr></thead><tbody>${porTurma.map(t => `<tr><td>${escapeHTML(t.turma || '-')}</td><td>${t.total || 0}</td><td>${t.totalAlunos || 0}</td></tr>`).join('')}</tbody></table></div><h6 class="mt-4">Últimos</h6><div class="table-responsive"><table class="table table-sm"><thead><tr><th>Aluno</th><th>Tipo</th><th>Data</th><th>Status</th></tr></thead><tbody>${atendimentos.slice(0, 20).map(a => `<tr><td>${escapeHTML(a.alunoNome || '')}</td><td>${escapeHTML(a.tipoTarefaLabel || '')}</td><td>${a.dataEntrada ? new Date(a.dataEntrada).toLocaleString('pt-BR') : '-'}</td><td>${a.status === 'em_andamento' ? 'Em andamento' : 'Finalizado'}</td></tr>`).join('')}</tbody></table></div></div></div>`;
        } else if (tipo === 'turma') {
            const porTipo = Array.isArray(data.estatisticas?.porTipo) ? data.estatisticas.porTipo : [];
            const porAluno = Array.isArray(data.porAluno) ? data.porAluno : [];
            container.innerHTML = `<div class="card"><div class="card-body"><h5>Turma: ${escapeHTML(data.turma || '')}</h5><p>Total: <strong>${data.estatisticas?.totalAtendimentos || 0}</strong></p><h6 class="mt-4">Por Tipo</h6><div class="row">${porTipo.map(t => `<div class="col-md-4 mb-2"><div class="p-2" style="background:#ccfbf1;border-radius:8px;"><strong>${escapeHTML(t.label || '')}</strong>: ${t.count || 0}</div></div>`).join('')}</div><h6 class="mt-4">Por Aluno</h6><div class="table-responsive"><table class="table table-sm"><thead><tr><th>Aluno</th><th>Total</th><th>Tipos</th></tr></thead><tbody>${porAluno.map(a => `<tr><td>${escapeHTML(a.alunoNome || '')}</td><td><span class="badge bg-primary">${a.total || 0}</span></td><td>${Object.entries(a.tipos || {}).map(([t, c]) => `${escapeHTML(TIPO_LABELS[t] || t)}: ${c}`).join(', ')}</td></tr>`).join('')}</tbody></table></div></div></div>`;
        } else if (tipo === 'aluno') {
            const porTipo = Array.isArray(data.estatisticas?.porTipo) ? data.estatisticas.porTipo : [];
            const porGravidade = data.estatisticas?.porGravidade || {};
            const atendimentos = Array.isArray(data.atendimentos) ? data.atendimentos : [];
            container.innerHTML = `<div class="card"><div class="card-body"><h5>Relatório: ${escapeHTML(data.aluno?.nome || '')}</h5><p>Matrícula: ${escapeHTML(data.aluno?.matricula || 'N/A')} | Turma: ${escapeHTML(data.aluno?.turma || 'N/A')}</p><p>Total: <strong>${data.estatisticas?.totalAtendimentos || 0}</strong></p><div class="row mt-3"><div class="col-md-6"><h6>Por Tipo</h6>${porTipo.map(t => `<div class="d-flex justify-content-between mb-1"><span>${escapeHTML(t.label || '')}</span><span class="badge bg-primary">${t.count || 0}</span></div>`).join('')}</div><div class="col-md-6"><h6>Por Gravidade</h6>${Object.entries(porGravidade).map(([g, c]) => `<div class="d-flex justify-content-between mb-1"><span>${escapeHTML(g)}</span><span class="badge bg-secondary">${c}</span></div>`).join('')}</div></div><h6 class="mt-4">Histórico</h6><div class="table-responsive"><table class="table table-sm"><thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Status</th><th></th></tr></thead><tbody>${atendimentos.map(a => `<tr><td>${a.dataEntrada ? new Date(a.dataEntrada).toLocaleString('pt-BR') : '-'}</td><td>${escapeHTML(a.tipoTarefaLabel || '')}</td><td>${escapeHTML((a.descricao || '').substring(0, 80))}</td><td>${a.status === 'em_andamento' ? 'Em andamento' : escapeHTML(a.resultado || 'Finalizado')}</td><td><button class="btn btn-sm btn-info" onclick="verAtendimento('${a.id}')"><i class="fas fa-eye"></i></button></td></tr>`).join('')}</tbody></table></div></div></div>`;
        }
    } catch (error) { container.innerHTML = `<div class="notificar notificar-danger">Erro ao exibir</div>`; }
}

function exportarCSV() {
    if (!relatorioData) { mostrarToastConcluido('⚠️ Nenhum relatório carregado. Clique em BUSCAR primeiro.', 'warning'); return; }
    const dados = relatorioData.registros || relatorioData.atendimentos || [];
    if (dados.length === 0) { mostrarToastConcluido('⚠️ Nenhum registro para exportar.', 'warning'); return; }
    const tipo = relatorioData.aluno ? 'aluno' : (relatorioData.turma ? 'turma' : 'geral');
    let titulo = 'Relatório de Atendimentos', subtitulo = '';
    if (tipo === 'geral') { titulo = 'Relatório Geral de Atendimentos'; subtitulo = 'Visão consolidada da Psicologia'; }
    else if (tipo === 'turma') { titulo = 'Relatório de Atendimentos por Turma'; subtitulo = `Turma: ${relatorioData.turma || ''}`; }
    else if (tipo === 'aluno') { titulo = 'Relatório Individual — Psicologia'; subtitulo = `${relatorioData.aluno?.nome || ''} — ${relatorioData.aluno?.turma || ''}`; }
    const colunas = [{ label: 'Data do Registro', format: (a) => a.dataFormatada || (a.dataEntrada ? new Date(a.dataEntrada).toLocaleString('pt-BR') : '') }, { label: 'Data de Saída', format: (a) => a.dataSaida ? new Date(a.dataSaida).toLocaleString('pt-BR') : '' }, { label: 'Aluno', format: (a) => a.alunoNome || relatorioData.aluno?.nome || '' }, { label: 'Matrícula', format: (a) => a.alunoMatricula || relatorioData.aluno?.matricula || '' }, { label: 'Turma', format: (a) => a.alunoTurma || relatorioData.aluno?.turma || relatorioData.turma || '' }, { label: 'Curso', format: (a) => a.alunoCurso || relatorioData.aluno?.curso || '' }, { label: 'Tipo de Tarefa', format: (a) => a.tipoTarefaLabel || TIPO_LABELS[a.tipoTarefa] || '' }, { label: 'Descrição', format: (a) => a.descricao || '' }, { label: 'Observações', format: (a) => a.observacoes || '' }, { label: 'Gravidade', format: (a) => (a.gravidade || 'media').toUpperCase() }, { label: 'Prioridade', format: (a) => (a.prioridade || 'normal').toUpperCase() }, { label: 'Status', format: (a) => a.status === 'em_andamento' ? 'Em Andamento' : 'Finalizado' }, { label: 'Resultado', format: (a) => a.resultado || a.saida?.resultado || '' }, { label: 'Registrado por', format: (a) => a.registradoPorNome || a.entrada?.registradoPor || '' }, { label: 'Assinatura', format: (a) => a.temAssinatura ? 'Sim' : 'Não' }];
    const filtros = [];
    const dI = safeGet('dataInicio')?.value; const dF = safeGet('dataFim')?.value;
    if (dI) filtros.push({ label: 'Data inicial', valor: dI });
    if (dF) filtros.push({ label: 'Data final', valor: dF });
    if (relatorioData.turma) filtros.push({ label: 'Turma', valor: relatorioData.turma });
    if (relatorioData.aluno?.nome) filtros.push({ label: 'Aluno', valor: relatorioData.aluno.nome });
    const metricas = {};
    if (tipo === 'geral') { metricas['Total de atendimentos'] = relatorioData.totalAtendimentos || 0; metricas['Tipos diferentes'] = (relatorioData.porTipo || []).length; metricas['Turmas atendidas'] = (relatorioData.porTurma || []).length; }
    else if (tipo === 'turma') { metricas['Total de atendimentos'] = relatorioData.estatisticas?.totalAtendimentos || 0; metricas['Alunos atendidos'] = relatorioData.estatisticas?.totalAlunosAtendidos || (relatorioData.porAluno || []).length; }
    else if (tipo === 'aluno') { metricas['Total de atendimentos'] = relatorioData.estatisticas?.totalAtendimentos || 0; metricas['Tipos diferentes'] = (relatorioData.estatisticas?.porTipo || []).length; }
    const ok = gerarBaixarCSV({ titulo, subtitulo, setor: 'Psicologia', colunas, registros: dados, filtros, metricas, nomeArquivo: `relatorio-psicologia-${tipo}`, observacoes: `${dados.length} atendimento(s) listado(s)` });
    if (ok) mostrarToastConcluido(`✅ Relatório exportado (${dados.length} registro(s))!`, 'success');
}

function habilitarBotoesRelatorio() {
    const btnCSV = safeGet('btnExportarCSVPsicologia');
    const btnPDF = safeGet('btnExportarPDFPsicologia');
    if (btnCSV) btnCSV.disabled = false;
    if (btnPDF) btnPDF.disabled = false;
}

// ============================================
// IMPRESSÃO
// ============================================
async function imprimirAtendimento(atendimentoId) {
    if (!atendimentoId) return;
    try {
        const response = await fetch(`/api/psicologia/atendimento/${atendimentoId}`, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await response.json();
        if (!data.success || !data.atendimento) { mostrarToastConcluido('Erro', 'error'); return; }
        const a = data.atendimento;
        let qr = '';
        try { const qrR = await fetch(`/api/aluno/qrcode/${a.alunoId}`, { headers: { 'Authorization': `Bearer ${token}` } }); if (qrR.ok) { const qrD = await qrR.json(); if (qrD.success && qrD.qrCode) qr = qrD.qrCode; } } catch (e) {}
        const win = window.open('', '_blank');
        win.document.write(gerarHTMLImpressaoPsicologia(a, qr));
        win.document.close();
        win.onload = () => setTimeout(() => win.print(), 500);
    } catch (e) { mostrarToastConcluido('Erro ao imprimir', 'error'); }
}

function gerarHTMLImpressaoPsicologia(a, qrCodeUrl) {
    const logo = '/uploads/logo-iema.png';
    const carimbo = '/icons/assinatura_psicologia.ico';
    const dataGeracao = new Date().toLocaleString('pt-BR');
    const entrada = new Date(a.entrada.dataHora);
    const dataExt = entrada.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const horaExt = entrada.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const badgeStatus = a.status === 'finalizado' ? '<span class="badge-finalizado">✅ FINALIZADO</span>' : '<span class="badge-andamento">⏳ EM ANDAMENTO</span>';
    const temAssinaturaDigital = a.entrada?.temAssinatura && a.entrada?.assinaturaBase64;
    const assinaturaHTML = temAssinaturaDigital ? `<img class="assinatura-img" src="${a.entrada.assinaturaBase64}" alt="Assinatura">` : '';
    let detalhesHTML = '';
    if (a.entrada?.detalhes && Object.keys(a.entrada.detalhes).length > 0) {
        const mapa = { tipoEscuta: 'Tipo de Escuta', duracaoEscuta: 'Duração (min)', tipoCrise: 'Tipo de Crise', acoesTomadas: 'Ações Tomadas', encaminhamentoEmergencial: 'Encaminhamento', nomeAtividade: 'Atividade', participantesAtividade: 'Participantes', localAtividade: 'Local', duracaoAtividade: 'Duração (min)', temaAcao: 'Tema', publicoAlvo: 'Público', localAcao: 'Local', temaSocioemocional: 'Tema Socio.', tipoAtividadeCultural: 'Tipo Cultural', parceria: 'Parcerias', tipoTarefaOutros: 'Especificação', providenciasTomadas: 'Providências', proximosPassos: 'Próximos Passos', contextoFamiliar: 'Contexto Familiar', historicoAnterior: 'Histórico Anterior' };
        const linhas = [];
        Object.entries(a.entrada.detalhes).forEach(([key, value]) => { if (!value || (Array.isArray(value) && value.length === 0)) return; const label = mapa[key] || key; let valor = value; if (Array.isArray(value)) valor = value.join(', '); if (typeof value === 'boolean') valor = value ? 'Sim' : 'Não'; if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/)) { try { valor = new Date(value).toLocaleDateString('pt-BR'); } catch(e){} } linhas.push(`<span class="det-item"><strong>${escapeHTML(label)}:</strong> ${escapeHTML(String(valor))}</span>`); });
        if (linhas.length > 0) detalhesHTML = `<div class="section-title">📋 Detalhes</div><div class="detalhes-compactos">${linhas.join('')}</div>`;
    }
    let saidaHTML = '';
    if (a.saida) { saidaHTML = `<div class="section-title">✅ Resultado Final</div><div class="linha-compacta"><span><strong>Resultado:</strong> ${escapeHTML(a.saida.resultadoTexto || a.saida.resultado || '-')}</span><span><strong>Data:</strong> ${a.saida.dataHoraFormatada || (a.saida.dataHora ? new Date(a.saida.dataHora).toLocaleString('pt-BR') : '-')}</span></div>${a.saida.observacoesFinais ? `<div class="obs-compacta"><strong>Obs:</strong> ${escapeHTML(a.saida.observacoesFinais)}</div>` : ''}`; }
    let remarcacoesHTML = '';
    if (a.remarcacoes && a.remarcacoes.length > 0) { remarcacoesHTML = `<div class="section-title">📅 Remarcações</div><table class="tabela-remarcacoes"><thead><tr><th style="width: 5%;">#</th><th style="width: 15%;">Data</th><th style="width: 10%;">Hora</th><th style="width: 15%;">Status</th><th>Motivo</th></tr></thead><tbody>${a.remarcacoes.slice(0, 5).map((r, i) => `<tr><td><strong>${i + 1}</strong></td><td>${formatarDataBR(r.dataRemarcacao)}</td><td>${r.horarioRemarcacao || '-'}</td><td><span class="status-remarcacao status-${r.status}">${r.status === 'pendente' ? '⏳' : r.status === 'realizado' ? '✅' : '❌'}</span></td><td>${escapeHTML((r.motivoRemarcacao || '-').substring(0, 60))}</td></tr>`).join('')}</tbody></table>`; }
    return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Atendimento Psicologia - ${escapeHTML(a.alunoNome)}</title><style>
        @page { size: A4 portrait; margin: 8mm; } * { box-sizing: border-box; margin: 0; padding: 0; } body { font-family: 'Times New Roman', Times, serif; font-size: 9.5pt; line-height: 1.25; color: #000; }
        .header { text-align: center; border-bottom: 1.5px double #000; padding-bottom: 4px; margin-bottom: 6px; } .header img { max-width: 100%; max-height: 14mm; object-fit: contain; display: block; margin: 0 auto 2px; } .header h1 { font-size: 10pt; text-transform: uppercase; font-weight: bold; margin: 2px 0 0; } .header p { font-size: 8pt; margin: 1px 0 0; }
        .titulo { text-align: center; font-size: 11pt; font-weight: bold; background: #ccfbf1; padding: 4px 8px; border: 1.5px solid #000; margin: 6px 0 3px; text-transform: uppercase; letter-spacing: 0.5px; } .status-badge { text-align: center; margin: 0 0 5px; } .badge-finalizado { background: #d1fae5; color: #065f46; padding: 2px 10px; border-radius: 12px; font-size: 8pt; font-weight: bold; border: 1px solid #10b981; display: inline-block; } .badge-andamento { background: #fef3c7; color: #92400e; padding: 2px 10px; border-radius: 12px; font-size: 8pt; font-weight: bold; border: 1px solid #f59e0b; display: inline-block; }
        .aluno-box { display: flex; align-items: center; gap: 8px; padding: 5px 8px; background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 5px; margin-bottom: 6px; } .aluno-foto { width: 38px; height: 38px; border-radius: 50%; object-fit: cover; border: 1.5px solid #14b8a6; flex-shrink: 0; } .aluno-info { flex: 1; } .aluno-nome { font-size: 10pt; font-weight: bold; color: #115e59; margin-bottom: 1px; } .aluno-detalhes { font-size: 8pt; color: #374151; }
        .section-title { font-size: 9pt; font-weight: bold; background: #e8e8e8; padding: 2px 6px; border-left: 3px solid #14b8a6; margin: 5px 0 3px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 3px 12px; margin: 3px 0 5px; font-size: 8.5pt; } .info-item { display: flex; gap: 4px; } .info-label { font-weight: bold; white-space: nowrap; } .info-value { flex: 1; }
        .descricao-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 4px; padding: 5px 8px; font-size: 8.5pt; line-height: 1.3; min-height: 30px; max-height: 80px; overflow: hidden; word-wrap: break-word; }
        .detalhes-compactos { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 4px; padding: 4px 6px; font-size: 8pt; line-height: 1.35; } .det-item { display: inline-block; margin-right: 10px; margin-bottom: 2px; }
        .linha-compacta { display: flex; justify-content: space-between; gap: 10px; padding: 3px 6px; background: #f9fafb; border-radius: 4px; font-size: 8.5pt; margin-bottom: 3px; } .obs-compacta { padding: 3px 6px; background: #f9fafb; border-radius: 4px; font-size: 8pt; font-style: italic; }
        .tabela-remarcacoes { width: 100%; border-collapse: collapse; font-size: 7.5pt; margin-top: 2px; } .tabela-remarcacoes th { background: #14b8a6; color: white; padding: 2px 4px; text-align: left; border: 1px solid #0d9488; font-size: 7.5pt; } .tabela-remarcacoes td { padding: 2px 4px; border: 1px solid #ddd; } .tabela-remarcacoes tr:nth-child(even) { background: #f9fafb; } .status-remarcacao { padding: 1px 5px; border-radius: 8px; font-size: 7pt; font-weight: bold; } .status-pendente { background: #fef3c7; color: #92400e; } .status-realizado { background: #d1fae5; color: #065f46; } .status-cancelado { background: #fee2e2; color: #991b1b; }
        .assinaturas { display: flex; justify-content: space-around; margin-top: 25px; gap: 20px; } .assinatura { flex: 0 0 42%; text-align: center; } .assinatura-container-relatorio { position: relative; min-height: 18mm; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 0; } .assinatura-container-relatorio::after { content: ''; position: absolute; bottom: 0; left: 0; right: 0; border-bottom: 1px solid #000; } .assinatura-img { max-height: 14mm; max-width: 100%; object-fit: contain; position: relative; z-index: 2; margin-bottom: 1mm; } .carimbo-overlay { position: absolute; bottom: 1mm; left: 50%; transform: translateX(-50%); max-height: 15mm; max-width: 45mm; object-fit: contain; opacity: 0.95; pointer-events: none; z-index: 1; } .assinatura-linha { padding-top: 3px; font-size: 8pt; margin-top: 2px; }
        .qr-code { text-align: center; margin-top: 10px; } .qr-code img { width: 22mm; height: 22mm; border: 1.5px solid #000; padding: 2px; display: block; margin: 0 auto; } .qr-code p { font-size: 7.5pt; margin: 2px 0 0 0; color: #444; font-weight: bold; }
        .footer { text-align: center; margin-top: 8px; padding-top: 3px; border-top: 1px solid #ccc; font-size: 6.5pt; color: #666; } .footer p { margin: 1px 0; }
        .btn-print { display: block; margin: 10px auto; padding: 8px 20px; background: #14b8a6; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 12px; font-family: Arial, sans-serif; } .btn-print:hover { background: #0d9488; }
        @media print { .no-print { display: none !important; } body { padding: 0; } }
    </style></head><body>
        <button class="btn-print no-print" onclick="window.print()">🖨️ Imprimir</button>
        <div class="header"><img src="${logo}" alt="IEMA" onerror="this.style.display='none'"><h1>IEMA Pleno: São Luís - Centro</h1><p>Sistema de Atendimentos — Psicologia</p></div>
        <div class="titulo">🧠 Atendimento Psicologia</div><div class="status-badge">${badgeStatus}</div>
        <div class="aluno-box"><img class="aluno-foto" src="${gerarAvatarSVG(a.alunoNome)}" alt="${escapeHTML(a.alunoNome)}"><div class="aluno-info"><div class="aluno-nome">${escapeHTML(a.alunoNome)}</div><div class="aluno-detalhes"><strong>Matrícula:</strong> ${escapeHTML(a.alunoMatricula || 'Não informada')} • <strong>Turma:</strong> ${escapeHTML(a.alunoTurma || '-')} ${a.alunoCurso ? ` • <strong>Curso:</strong> ${escapeHTML(a.alunoCurso)}` : ''}</div></div></div>
        <div class="section-title">📌 Dados do Atendimento</div><div class="info-grid"><div class="info-item"><span class="info-label">Tipo:</span><span class="info-value"><strong>${escapeHTML(a.tipoTarefaLabel || '-')}</strong></span></div><div class="info-item"><span class="info-label">Data:</span><span class="info-value">${dataExt}</span></div><div class="info-item"><span class="info-label">Hora:</span><span class="info-value">${horaExt}</span></div><div class="info-item"><span class="info-label">Gravidade:</span><span class="info-value"><strong>${escapeHTML((a.entrada?.gravidade || 'media').toUpperCase())}</strong></span></div><div class="info-item"><span class="info-label">Prioridade:</span><span class="info-value"><strong>${escapeHTML((a.prioridade || 'normal').toUpperCase())}</strong></span></div><div class="info-item"><span class="info-label">Registrado por:</span><span class="info-value">${escapeHTML(a.entrada?.registradoPor || '-')}</span></div></div>
        <div class="section-title">📝 Descrição do Ocorrido</div><div class="descricao-box">${escapeHTML(a.entrada?.descricao || '-').replace(/\n/g, '<br>')}</div>
        ${a.entrada?.observacoes ? `<div class="section-title">💬 Observações</div><div class="descricao-box" style="min-height: 20px; max-height: 40px;">${escapeHTML(a.entrada.observacoes).replace(/\n/g, '<br>')}</div>` : ''}
        ${detalhesHTML} ${saidaHTML} ${remarcacoesHTML}
        <div class="assinaturas"><div class="assinatura"><div class="assinatura-container-relatorio">${assinaturaHTML}</div><div class="assinatura-linha">Assinatura do Responsável</div></div><div class="assinatura"><div class="assinatura-container-relatorio"><img class="carimbo-overlay" src="${carimbo}" alt="Carimbo" onerror="this.style.display='none'"></div><div class="assinatura-linha">Psicologia</div></div></div>
        ${qrCodeUrl ? `<div class="qr-code"><img src="${qrCodeUrl}" alt="QR Code"><p>Identificação do Aluno</p></div>` : ''}
        <div class="footer"><p>Documento gerado em <strong>${dataGeracao}</strong> — EducaPleno — Psicologia</p></div>
    </body></html>`;
}

// ============================================
// EXPORTAR PDF (relatórios)
// ============================================
function exportarPDF() {
    if (!relatorioData) { mostrarToastConcluido('⚠️ Nenhum relatório carregado. Clique em BUSCAR primeiro.', 'error'); return; }
    const html = gerarHTMLRelatorioPsicologia(relatorioData);
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.onload = () => setTimeout(() => win.print(), 500);
}

function gerarHTMLRelatorioPsicologia(data) {
    const tipo = data.aluno ? 'aluno' : (data.turma ? 'turma' : 'geral');
    const logoIema = '/uploads/logo-iema.png';
    const carimbo = '/icons/assinatura_psicologia.ico';
    const dataGeracao = new Date().toLocaleString('pt-BR');
    let assinaturaDigital = null;
    if (tipo === 'aluno' && Array.isArray(data.atendimentos)) { const comAssinatura = data.atendimentos.find(a => a.temAssinatura && a.assinaturaBase64); if (comAssinatura) assinaturaDigital = comAssinatura.assinaturaBase64; }
    if (!assinaturaDigital) { const lista = data.atendimentos || data.registros || []; const comAssinatura = lista.find(a => a.temAssinatura && a.assinaturaBase64); if (comAssinatura) assinaturaDigital = comAssinatura.assinaturaBase64; }
    let titulo = 'Relatório de Atendimentos - Psicologia', subtitulo = '';
    if (tipo === 'turma') { titulo = 'Relatório de Atendimentos'; subtitulo = `Turma: ${data.turma || ''}`; }
    else if (tipo === 'aluno') { titulo = 'Relatório Individual do Aluno'; subtitulo = `${data.aluno?.nome || ''} — ${data.aluno?.turma || ''}`; }
    else subtitulo = 'Relatório Geral';
    let statsHTML = '';
    if (tipo === 'geral') { statsHTML = `<div class="stats"><div class="stat"><div class="stat-value">${data.totalAtendimentos || 0}</div><div class="stat-label">Total de Atendimentos</div></div><div class="stat"><div class="stat-value">${(data.porTipo || []).length}</div><div class="stat-label">Tipos Diferentes</div></div><div class="stat"><div class="stat-value">${(data.porTurma || []).length}</div><div class="stat-label">Turmas Atendidas</div></div></div>`; }
    else if (tipo === 'turma') { statsHTML = `<div class="stats"><div class="stat"><div class="stat-value">${data.estatisticas?.totalAtendimentos || 0}</div><div class="stat-label">Total de Atendimentos</div></div><div class="stat"><div class="stat-value">${data.estatisticas?.totalAlunosAtendidos || (data.porAluno || []).length}</div><div class="stat-label">Alunos Atendidos</div></div><div class="stat"><div class="stat-value">${(data.porAluno || []).length}</div><div class="stat-label">Alunos com Registro</div></div></div>`; }
    else if (tipo === 'aluno') { statsHTML = `<div class="stats"><div class="stat"><div class="stat-value">${data.estatisticas?.totalAtendimentos || 0}</div><div class="stat-label">Total de Atendimentos</div></div><div class="stat"><div class="stat-value">${(data.estatisticas?.porTipo || []).length}</div><div class="stat-label">Tipos Diferentes</div></div><div class="stat"><div class="stat-value">${Object.keys(data.estatisticas?.porGravidade || {}).length}</div><div class="stat-label">Níveis de Gravidade</div></div></div>`; }
    let tabelaHTML = '';
    if (tipo === 'geral') {
        const porTipo = Array.isArray(data.porTipo) ? data.porTipo : [];
        const porTurma = Array.isArray(data.porTurma) ? data.porTurma : [];
        const atendimentos = Array.isArray(data.atendimentos) ? data.atendimentos : [];
        tabelaHTML = `<div class="section-title">📊 Distribuição por Tipo</div><table><thead><tr><th>Tipo de Tarefa</th><th style="width: 120px; text-align: center;">Quantidade</th></tr></thead><tbody>${porTipo.map(t => `<tr><td><strong>${escapeHTML(t.label || '')}</strong></td><td style="text-align: center;">${t.count || 0}</td></tr>`).join('') || '<tr><td colspan="2" style="text-align:center;">Nenhum dado</td></tr>'}</tbody></table><div class="section-title">🏫 Distribuição por Turma</div><table><thead><tr><th>Turma</th><th style="width: 120px; text-align: center;">Total</th><th style="width: 120px; text-align: center;">Alunos</th></tr></thead><tbody>${porTurma.map(t => `<tr><td><strong>${escapeHTML(t.turma || 'Sem turma')}</strong></td><td style="text-align: center;">${t.total || 0}</td><td style="text-align: center;">${t.totalAlunos || 0}</td></tr>`).join('') || '<tr><td colspan="3" style="text-align:center;">Nenhum dado</td></tr>'}</tbody></table><div class="section-title">📋 Últimos Atendimentos</div><table><thead><tr><th>Data</th><th>Aluno</th><th>Turma</th><th>Tipo</th><th>Gravidade</th><th>Status</th></tr></thead><tbody>${atendimentos.slice(0, 30).map(a => `<tr><td>${a.dataEntrada ? new Date(a.dataEntrada).toLocaleDateString('pt-BR') : '-'}</td><td><strong>${escapeHTML(a.alunoNome || '')}</strong></td><td>${escapeHTML(a.alunoTurma || '')}</td><td>${escapeHTML(a.tipoTarefaLabel || '')}</td><td>${escapeHTML((a.gravidade || 'media').toUpperCase())}</td><td><span class="badge-status ${a.status === 'finalizado' ? 'finalizado' : 'andamento'}">${a.status === 'finalizado' ? '✅ Finalizado' : '⏳ Em Andamento'}</span></td></tr>`).join('') || '<tr><td colspan="6" style="text-align:center;">Nenhum atendimento</td></tr>'}</tbody></table>`;
    } else if (tipo === 'turma') {
        const porAluno = Array.isArray(data.porAluno) ? data.porAluno : [];
        const porTipo = Array.isArray(data.estatisticas?.porTipo) ? data.estatisticas.porTipo : [];
        tabelaHTML = `<div class="section-title">📊 Distribuição por Tipo</div><table><thead><tr><th>Tipo de Tarefa</th><th style="width: 120px; text-align: center;">Quantidade</th></tr></thead><tbody>${porTipo.map(t => `<tr><td><strong>${escapeHTML(t.label || '')}</strong></td><td style="text-align: center;">${t.count || 0}</td></tr>`).join('') || '<tr><td colspan="2" style="text-align:center;">Nenhum dado</td></tr>'}</tbody></table><div class="section-title">👥 Atendimentos por Aluno</div><table><thead><tr><th>Aluno</th><th style="width: 100px; text-align: center;">Total</th><th>Tipos</th></tr></thead><tbody>${porAluno.map(a => `<tr><td><strong>${escapeHTML(a.alunoNome || '')}</strong></td><td style="text-align: center;">${a.total || 0}</td><td>${Object.entries(a.tipos || {}).map(([t, c]) => `${escapeHTML(TIPO_LABELS[t] || t)}: ${c}`).join('<br>')}</td></tr>`).join('') || '<tr><td colspan="3" style="text-align:center;">Nenhum dado</td></tr>'}</tbody></table>`;
    } else if (tipo === 'aluno') {
        const porTipo = Array.isArray(data.estatisticas?.porTipo) ? data.estatisticas.porTipo : [];
        const porGrav = data.estatisticas?.porGravidade || {};
        const atendimentos = Array.isArray(data.atendimentos) ? data.atendimentos : [];
        tabelaHTML = `<div class="section-title">📊 Distribuição por Tipo</div><table><thead><tr><th>Tipo de Tarefa</th><th style="width: 120px; text-align: center;">Quantidade</th></tr></thead><tbody>${porTipo.map(t => `<tr><td><strong>${escapeHTML(t.label || '')}</strong></td><td style="text-align: center;">${t.count || 0}</td></tr>`).join('') || '<tr><td colspan="2" style="text-align:center;">Nenhum dado</td></tr>'}</tbody></table><div class="section-title">⚠️ Distribuição por Gravidade</div><table><thead><tr><th>Gravidade</th><th style="width: 120px; text-align: center;">Quantidade</th></tr></thead><tbody>${Object.entries(porGrav).map(([g, c]) => `<tr><td><strong>${escapeHTML(g.toUpperCase())}</strong></td><td style="text-align: center;">${c}</td></tr>`).join('') || '<tr><td colspan="2" style="text-align:center;">Nenhum dado</td></tr>'}</tbody></table><div class="section-title">📋 Histórico de Atendimentos</div><table><thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Gravidade</th><th>Status</th></tr></thead><tbody>${atendimentos.map(a => `<tr><td>${a.dataEntrada ? new Date(a.dataEntrada).toLocaleDateString('pt-BR') : '-'}</td><td>${escapeHTML(a.tipoTarefaLabel || '')}</td><td>${escapeHTML((a.descricao || '').substring(0, 80))}${(a.descricao || '').length > 80 ? '...' : ''}</td><td>${escapeHTML((a.gravidade || 'media').toUpperCase())}</td><td><span class="badge-status ${a.status === 'finalizado' ? 'finalizado' : 'andamento'}">${a.status === 'finalizado' ? '✅ Finalizado' : '⏳ Em Andamento'}</span></td></tr>`).join('') || '<tr><td colspan="5" style="text-align:center;">Nenhum atendimento</td></tr>'}</tbody></table>`;
    }
    return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${titulo}</title><style>
        @page { size: A4 portrait; margin: 8mm; } * { box-sizing: border-box; margin: 0; padding: 0; } body { font-family: 'Times New Roman', Times, serif; font-size: 9.5pt; line-height: 1.25; color: #000; }
        .header { text-align: center; border-bottom: 1.5px double #000; padding-bottom: 4px; margin-bottom: 6px; } .header img { max-width: 100%; max-height: 14mm; object-fit: contain; display: block; margin: 0 auto 2px; } .header h1 { font-size: 10pt; text-transform: uppercase; font-weight: bold; margin: 2px 0 0; } .header p { font-size: 8pt; margin: 1px 0 0; }
        .titulo { text-align: center; font-size: 11pt; font-weight: bold; background: #ccfbf1; padding: 4px 8px; border: 1.5px solid #000; margin: 6px 0 3px; text-transform: uppercase; letter-spacing: 0.5px; } .subtitulo { text-align: center; font-size: 9pt; margin: 0 0 6px; font-style: italic; }
        .stats { display: flex; gap: 8px; margin: 6px 0 8px; padding: 6px 8px; background: #f0fdfa; border-radius: 5px; border: 1px solid #99f6e4; } .stat { text-align: center; flex: 1; border-right: 1px solid #99f6e4; } .stat:last-child { border-right: none; } .stat-value { font-size: 13pt; font-weight: bold; color: #0d9488; line-height: 1; } .stat-label { font-size: 7.5pt; color: #666; margin-top: 2px; }
        .section-title { font-size: 9pt; font-weight: bold; background: #e8e8e8; padding: 2px 6px; border-left: 3px solid #14b8a6; margin: 6px 0 3px; }
        table { width: 100%; border-collapse: collapse; font-size: 8.5pt; margin-bottom: 6px; } th { background: #14b8a6; color: white; padding: 4px 5px; text-align: left; border: 1px solid #0d9488; font-size: 8pt; } td { padding: 3px 5px; border: 1px solid #ddd; vertical-align: top; } tr:nth-child(even) { background: #f9fafb; }
        .badge-status { display: inline-block; padding: 1px 6px; border-radius: 8px; font-size: 7.5pt; font-weight: bold; } .badge-status.finalizado { background: #d1fae5; color: #065f46; } .badge-status.andamento { background: #fef3c7; color: #92400e; }
        .assinaturas { display: flex; justify-content: center; margin-top: 25px; gap: 30px; } .assinatura { flex: 0 0 60%; text-align: center; } .assinatura-container-relatorio { position: relative; min-height: 18mm; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 0; } .assinatura-container-relatorio::after { content: ''; position: absolute; bottom: 0; left: 0; right: 0; border-bottom: 1px solid #000; } .assinatura-img { max-height: 14mm; max-width: 100%; object-fit: contain; position: relative; z-index: 2; margin-bottom: 1mm; } .carimbo-overlay { position: absolute; bottom: 1mm; left: 50%; transform: translateX(-50%); max-height: 15mm; max-width: 55mm; object-fit: contain; opacity: 0.95; pointer-events: none; z-index: 1; } .assinatura-linha { padding-top: 3px; font-size: 8pt; margin-top: 2px; }
        .footer { text-align: center; margin-top: 8px; padding-top: 3px; border-top: 1px solid #ccc; font-size: 6.5pt; color: #666; } .footer p { margin: 1px 0; } .registro-info { font-size: 7.5pt; color: #666; margin-top: 6px; text-align: center; }
        .btn-print { display: block; margin: 10px auto; padding: 8px 20px; background: #14b8a6; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 12px; font-family: Arial, sans-serif; } .btn-print:hover { background: #0d9488; }
        @media print { .no-print { display: none !important; } body { padding: 0; } }
    </style></head><body>
        <button class="btn-print no-print" onclick="window.print()">🖨️ Imprimir</button>
        <div class="header"><img src="${logoIema}" alt="IEMA" onerror="this.style.display='none'"><h1>IEMA Pleno: São Luís - Centro</h1><p>Sistema de Atendimentos — Psicologia</p></div>
        <div class="titulo">🧠 ${titulo}</div>${subtitulo ? `<div class="subtitulo">${escapeHTML(subtitulo)}</div>` : ''}
        ${statsHTML} ${tabelaHTML}
        <div class="assinaturas"><div class="assinatura"><div class="assinatura-container-relatorio">${assinaturaDigital ? `<img class="assinatura-img" src="${assinaturaDigital}" alt="Assinatura">` : ''}<img class="carimbo-overlay" src="${carimbo}" alt="Carimbo" onerror="this.style.display='none'"></div><div class="assinatura-linha">Assinatura do Responsável / Psicologia</div></div></div>
        <div class="registro-info">Relatório gerado em <strong>${dataGeracao}</strong></div>
        <div class="footer"><p>Documento gerado automaticamente pelo EducaPleno</p><p>Setor: Psicologia</p></div>
    </body></html>`;
}

// ============================================
// SISTEMA DE NOTIFICAÇÕES
// ============================================
let notificacoesInterval = null;
let __notificacoesCache = [];
let __lembretesCache = [];

function isWebView() { return /wv|WebView|Android.*Version\/[\d.]+.*Chrome/i.test(navigator.userAgent) || (typeof window.AppInventor !== 'undefined'); }

function mostrarNotificacaoInterna(mensagem, tipo = 'info') {
    if (!isWebView()) { mostrarToastConcluido(mensagem); return; }
    const modal = document.createElement('div');
    modal.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 999999; padding: 20px; box-sizing: border-box;`;
    const icones = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const cores = { success: '#10b981', error: '#dc2626', warning: '#f59e0b', info: '#14b8a6' };
    modal.innerHTML = `<div style="background: white; border-radius: 16px; padding: 25px; max-width: 380px; width: 100%; box-shadow: 0 20px 60px rgba(0,0,0,0.3); text-align: center;"><div style="font-size: 48px; margin-bottom: 15px;">${icones[tipo] || 'ℹ️'}</div><p style="margin: 0 0 20px; color: #374151; font-size: 15px; line-height: 1.5; white-space: pre-line;">${mensagem}</p><button onclick="this.closest('div').parentElement.remove()" style="width: 100%; padding: 12px; background: ${cores[tipo] || cores.info}; color: white; border: none; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer;">OK</button></div>`;
    document.body.appendChild(modal);
}

function confirmarInterno(mensagem) {
    return new Promise((resolve) => {
        const old = document.getElementById('confirmInternoModal'); if (old) old.remove();
        const modalHtml = `<div class="modal fade" id="confirmInternoModal" tabindex="-1" data-bs-backdrop="static"><div class="modal-dialog modal-dialog-centered"><div class="modal-content"><div class="modal-header" style="background: linear-gradient(135deg, #14b8a6, #0d9488); color: white;"><h5 class="modal-title"><i class="fas fa-question-circle"></i> Confirmação</h5></div><div class="modal-body" style="white-space: pre-line; font-size: 15px;">${escapeHTML(mensagem)}</div><div class="modal-footer"><button type="button" class="btn btn-secondary" id="btnCancelarConfirmInterno"><i class="fas fa-times"></i> Cancelar</button><button type="button" class="btn btn-danger" id="btnConfirmarConfirmInterno"><i class="fas fa-check"></i> Confirmar</button></div></div></div></div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modalEl = document.getElementById('confirmInternoModal'); const modal = new bootstrap.Modal(modalEl); modal.show();
        const finalizar = (resultado) => { modal.hide(); setTimeout(() => modalEl.remove(), 300); resolve(resultado); };
        document.getElementById('btnConfirmarConfirmInterno').addEventListener('click', () => finalizar(true));
        document.getElementById('btnCancelarConfirmInterno').addEventListener('click', () => finalizar(false));
    });
}

function iniciarSistemaNotificacoesUnificado() {
    if (!document.getElementById('notificacoesBtn')) return;
    carregarTudo();
    if (notificacoesInterval) clearInterval(notificacoesInterval);
    notificacoesInterval = setInterval(carregarTudo, 30000);
    document.addEventListener('click', function(event) { const dropdown = document.getElementById('notificacoesDropdown'); const btn = document.getElementById('notificacoesBtn'); if (dropdown && btn && !btn.contains(event.target) && !dropdown.contains(event.target)) dropdown.classList.remove('show'); });
}

async function carregarTudo() {
    await Promise.all([carregarNotificacoesSistema(), carregarLembretesRemarcacao()]);
    renderizarSinoUnificado();
    atualizarBadgeUnificado();
}

async function carregarNotificacoesSistema() {
    try {
        const token = localStorage.getItem('auth_token'); if (!token) return;
        const response = await fetch('/api/notificacoes?apenasNaoLidas=false&limite=20', { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await response.json();
        if (data.success) __notificacoesCache = data.notificacoes || [];
        atualizarBadgeUnificado();
    } catch (error) {}
}

async function carregarLembretesRemarcacao() {
    try {
        const token = localStorage.getItem('auth_token'); if (!token) return;
        const response = await fetch('/api/psicologia/remarcacoes/pendentes', { headers: { 'Authorization': `Bearer ${token}` } });
        const ct = response.headers.get('content-type') || '';
        if (!response.ok || !ct.includes('application/json')) { __lembretesCache = []; atualizarBadgeUnificado(); return; }
        const data = await response.json();
        __lembretesCache = (data.success && Array.isArray(data.remarcacoes)) ? data.remarcacoes : [];
        atualizarBadgeUnificado();
    } catch (error) { __lembretesCache = []; atualizarBadgeUnificado(); }
}

function renderizarSinoUnificado() {
    const lista = document.getElementById('notificacoesLista'); if (!lista) return;
    const temNotificacoes = __notificacoesCache.length > 0;
    const temLembretes = __lembretesCache.length > 0;
    if (!temNotificacoes && !temLembretes) { lista.innerHTML = `<div class="notificacoes-vazio"><i class="fas fa-bell-slash"></i><p>Nenhuma notificação</p></div>`; return; }
    let html = '';
    if (temLembretes) {
        html += `<div class="notificacoes-secao"><div class="notificacoes-secao-titulo"><i class="fas fa-calendar-alt"></i><span>Lembretes de Remarcação</span><span class="badge-count">${__lembretesCache.length}</span></div>`;
        const ordem = { atrasado: 0, iminente: 1, proximo: 2, hoje: 3, amanha: 4, futuro: 5 };
        const lembretesOrdenados = [...__lembretesCache].sort((a, b) => ordem[calcularNivelAlerta(a).nivel] - ordem[calcularNivelAlerta(b).nivel]);
        lembretesOrdenados.forEach(r => {
            const nivel = calcularNivelAlerta(r); let itemClass = '', badgeClass = 'futuro', badgeText = nivel.label;
            if (nivel.nivel === 'atrasado') { itemClass = 'atrasado'; badgeClass = 'atrasado'; badgeText = `⚠️ ${nivel.label}`; }
            else if (nivel.nivel === 'iminente') { itemClass = 'urgente'; badgeClass = 'urgente'; badgeText = `🔴 ${nivel.label}`; }
            else if (nivel.nivel === 'proximo') { itemClass = 'proximo'; badgeClass = 'proximo'; badgeText = `🟠 ${nivel.label}`; }
            else if (nivel.nivel === 'hoje') { itemClass = 'hoje'; badgeClass = 'hoje'; badgeText = `🟡 Hoje ${r.horarioRemarcacao}`; }
            else if (nivel.nivel === 'amanha') { itemClass = 'amanha'; badgeClass = 'amanha'; badgeText = `🔵 Amanhã ${r.horarioRemarcacao}`; }
            html += `<div class="lembrete-item ${itemClass}"><div class="lembrete-header"><span class="lembrete-nome">${escapeHTML(r.alunoNome || '')}</span><span class="lembrete-badge ${badgeClass}">${badgeText}</span></div><div class="lembrete-turma"><i class="fas fa-graduation-cap"></i> ${escapeHTML(r.alunoTurma || '-')}</div><div class="lembrete-data"><span><i class="fas fa-calendar"></i> ${formatarDataBR(r.dataRemarcacao)}</span><span><i class="fas fa-clock"></i> ${r.horarioRemarcacao || '-'}</span></div><span class="lembrete-tipo">${escapeHTML(r.tipoTarefaLabel || '')}</span><div class="lembrete-acoes"><button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); verAtendimento('${r.atendimentoId}')"><i class="fas fa-eye"></i> Ver</button><button class="btn btn-warning btn-sm" onclick="event.stopPropagation(); abrirRemarcar('${r.atendimentoId}')"><i class="fas fa-calendar-plus"></i> Remarcar</button><button class="btn btn-success btn-sm" onclick="event.stopPropagation(); abrirFinalizacaoRemarcacao('${r.id}')"><i class="fas fa-check"></i> Finalizar</button></div></div>`;
        });
        html += `</div>`;
    }
    if (temNotificacoes) {
        html += `<div class="notificacoes-secao"><div class="notificacoes-secao-titulo" style="background: #f0fdfa; color: #115e59;"><i class="fas fa-bell" style="color: #14b8a6;"></i><span>Notificações do Sistema</span><span class="badge-count" style="background: #14b8a6;">${__notificacoesCache.filter(n => !n.lida).length} não lidas</span></div>`;
        __notificacoesCache.forEach(notif => {
            const data = new Date(notif.createdAt); const diffMs = new Date() - data; const diffMin = Math.floor(diffMs / 60000); const diffHr = Math.floor(diffMs / 3600000); const diffDia = Math.floor(diffMs / 86400000);
            let tempoTexto = diffMin < 1 ? 'agora mesmo' : diffMin < 60 ? `há ${diffMin} min` : diffHr < 24 ? `há ${diffHr} h` : `há ${diffDia} d`;
            const classeLida = notif.lida ? '' : 'nao-lida';
            html += `<div class="notificacao-item ${classeLida}" data-notif-id="${notif._id}" data-notif-link="${escapeHTML(notif.link || '#')}" style="cursor: pointer;"><div class="notificacao-icone" style="background: ${notif.cor || '#14b8a6'};">${notif.icone || '📋'}</div><div class="notificacao-conteudo"><div class="notificacao-titulo">${escapeHTML(notif.titulo || '')}</div><div class="notificacao-mensagem">${escapeHTML(notif.mensagem || '')}</div><div class="notificacao-tempo"><i class="far fa-clock"></i> ${tempoTexto}</div></div></div>`;
        });
        html += `</div>`;
    }
    lista.innerHTML = html;
    lista.querySelectorAll('.notificacao-item').forEach(item => { item.addEventListener('click', () => abrirNotificacao(item.getAttribute('data-notif-id'), item.getAttribute('data-notif-link'))); });
}

function atualizarBadgeUnificado() {
    let totalNaoLidas = 0, totalLembretes = 0;
    try { totalNaoLidas = (__notificacoesCache || []).filter(n => !n.lida).length; totalLembretes = (__lembretesCache || []).length; } catch (e) {}
    const total = totalNaoLidas + totalLembretes;
    const badgeSino = document.getElementById('notificacoesBadge'); const btnSino = document.getElementById('notificacoesBtn');
    if (badgeSino) { if (total > 0) { badgeSino.textContent = total > 99 ? '99+' : total; badgeSino.style.setProperty('display', 'inline-flex', 'important'); } else badgeSino.style.setProperty('display', 'none', 'important'); }
    const badgeAvatar = document.getElementById('userNotificationBadge');
    if (badgeAvatar) { if (total > 0) { badgeAvatar.textContent = total > 9 ? '9+' : String(total); badgeAvatar.style.setProperty('display', 'flex', 'important'); } else badgeAvatar.style.setProperty('display', 'none', 'important'); }
    const badgeMenu = document.getElementById('menuNotifBadge');
    if (badgeMenu) { if (total > 0) { badgeMenu.style.setProperty('display', 'inline-block', 'important'); badgeMenu.textContent = total > 99 ? '99+' : total; } else badgeMenu.style.setProperty('display', 'none', 'important'); }
    const trigger = document.getElementById('userTrigger');
    if (trigger) { if (total > 0) trigger.classList.add('tem-notificacao'); else trigger.classList.remove('tem-notificacao'); }
    if (badgeSino && total > 0) { const temUrgente = (__lembretesCache || []).some(r => calcularNivelAlerta(r).urgente); badgeSino.style.background = temUrgente ? '#dc2626' : '#ef4444'; if (temUrgente && btnSino) btnSino.classList.add('tem-novidade'); else if (btnSino) btnSino.classList.remove('tem-novidade'); }
}

async function abrirNotificacao(id, link) {
    try {
        const token = localStorage.getItem('auth_token');
        if (id) { try { await fetch(`/api/notificacoes/${id}/lida`, { method: 'PUT', headers: { 'Authorization': `Bearer ${token}` } }); } catch (e) {} }
        fecharNotificacoes();
        await carregarTudo();
        if (link && link !== '#' && link !== 'null' && link !== 'undefined' && String(link).trim() !== '') window.location.href = link;
    } catch (error) { mostrarNotificacaoInterna('Erro ao processar notificação', 'error'); }
}

function abrirNotificacoes() { const dropdown = document.getElementById('notificacoesDropdown'); if (!dropdown) return; dropdown.classList.toggle('show'); if (dropdown.classList.contains('show')) carregarTudo(); }

function fecharNotificacoes() { const dropdown = document.getElementById('notificacoesDropdown'); if (dropdown) { dropdown.classList.remove('show'); dropdown.style.display = 'none'; } const btn = document.getElementById('notificacoesBtn'); if (btn) btn.classList.remove('active'); }

async function marcarTodasLidas() {
    try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch('/api/notificacoes/marcar-todas-lidas', { method: 'PUT', headers: { 'Authorization': `Bearer ${token}` } });
        const data = await response.json();
        if (data.success) { await carregarTudo(); mostrarNotificacaoInterna('Notificações marcadas como lidas!', 'success'); }
    } catch (error) {}
}

async function limparMinhasNotificacoes(event) {
    try {
        const token = localStorage.getItem('auth_token');
        const confirmacao = await confirmarInterno('🗑️ Deseja excluir TODAS as suas notificações do sistema?\n\n⚠️ Os lembretes de remarcação NÃO serão afetados.');
        if (!confirmacao) return;
        const response = await fetch('/api/notificacoes/limpar-minhas', { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } });
        const data = await response.json();
        if (data.success) { __notificacoesCache = []; await carregarTudo(); mostrarNotificacaoInterna('Notificações excluídas!', 'success'); }
        else throw new Error(data.error || 'Erro');
    } catch (error) { mostrarNotificacaoInterna(error.message, 'error'); }
}

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => iniciarSistemaNotificacoesUnificado(), 500);
    setTimeout(async () => { try { await carregarTudo(); } catch (e) {} }, 1200);
});

window.addEventListener('beforeunload', () => { if (notificacoesInterval) clearInterval(notificacoesInterval); });

async function logout() {
    const confirmar = await confirm('Tem certeza que deseja sair do sistema?');
    if (confirmar) { localStorage.removeItem('auth_token'); localStorage.removeItem('user_data'); window.location.href = '/login.html'; }
}

// ============================================================================
// MODO ASSINATURA (via URL ?assinatura=UUID)
// ============================================================================
async function mostrarTelaAssinatura(sessaoId) {
    document.querySelectorAll('.header-top, .container > .card, .container > .modo-selector').forEach(el => { if (el) el.style.display = 'none'; });
    let container = safeGet('telaAssinaturaContainer');
    if (!container) { container = document.createElement('div'); container.id = 'telaAssinaturaContainer'; document.body.innerHTML = ''; document.body.appendChild(container); }
    container.innerHTML = `<div style="min-height: 100vh; background: #f0f4f8; padding: 10px; display: flex; flex-direction: column; box-sizing: border-box; overflow-y: auto;"><div style="max-width: 800px; width: 100%; margin: 0 auto; display: flex; flex-direction: column; flex: 1; min-height: 0;"><div style="background: linear-gradient(135deg, #14b8a6, #0d9488); color: white; padding: 12px 20px; border-radius: 16px 16px 0 0; text-align: center; flex-shrink: 0;"><h1 style="font-size: 18px; margin: 0; display: flex; align-items: center; justify-content: center; gap: 10px;"><i class="fas fa-signature"></i> Assinatura Digital - Psicologia</h1></div><div id="telaAssinaturaInfo" style="background: white; padding: 15px; border-left: 4px solid #14b8a6; flex-shrink: 0; max-height: 40vh; overflow-y: auto;"><div style="text-align: center; padding: 20px;"><div style="width: 30px; height: 30px; border: 4px solid #e2e8f0; border-top-color: #14b8a6; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 10px;"></div><p style="color: #64748b; margin: 0; font-size: 14px;">Carregando atendimento...</p></div></div><div id="telaAssinaturaArea" style="background: white; padding: 15px; display: none; border-radius: 0 0 16px 16px; flex: 1; display: flex; flex-direction: column; min-height: 0;"><div id="canvasWrapper" style="position: relative; background: white; border: 3px dashed #cbd5e0; border-radius: 16px; overflow: hidden; flex: 1; min-height: 150px; margin-bottom: 12px; touch-action: none;"><canvas id="canvasAssinatura" style="width: 100%; height: 100%; display: block;"></canvas><div id="placeholder" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: #94a3b8; pointer-events: none; width: 100%;"><i class="fas fa-pen-fancy" style="font-size: 32px; display: block; margin-bottom: 5px;"></i><span style="font-size: 14px;">Assine aqui com o dedo</span></div></div><div style="display: flex; gap: 10px; flex-shrink: 0;"><button onclick="limparAssinaturaTela()" style="flex: 1; padding: 12px; background: #f1f5f9; color: #475569; border: none; border-radius: 12px; font-weight: 600; font-size: 14px;"><i class="fas fa-eraser"></i> Limpar</button><button id="btnSalvarAssinatura" onclick="salvarAssinaturaTela()" disabled style="flex: 2; padding: 12px; background: #cbd5e0; color: white; border: none; border-radius: 12px; font-weight: 600; font-size: 14px; cursor: not-allowed;"><i class="fas fa-check"></i> Confirmar Assinatura</button></div></div></div></div><style>@keyframes spin { to { transform: rotate(360deg); } } @media (max-height: 500px) { #telaAssinaturaInfo { max-height: 25vh; } #telaAssinaturaArea { padding: 10px; } #canvasWrapper { min-height: 80px; } }</style>`;
    try {
        const response = await fetch(`/api/sessoes-assinatura/${sessaoId}`);
        const data = await response.json();
        if (!data.success) { safeGet('telaAssinaturaInfo').innerHTML = `<div style="text-align: center; padding: 30px 20px;"><i class="fas fa-exclamation-triangle" style="font-size: 40px; color: #ef4444; margin-bottom: 10px; display: block;"></i><h3 style="color: #ef4444; margin: 0 0 8px; font-size: 18px;">Sessão inválida ou expirada</h3><p style="color: #64748b; margin: 0; font-size: 14px;">${data.error || 'Esta sessão de assinatura não existe mais ou expirou (30 min).'}</p></div>`; return; }
        if (data.sessao.status === 'assinado') { safeGet('telaAssinaturaInfo').innerHTML = `<div style="text-align: center; padding: 30px 20px;"><i class="fas fa-check-circle" style="font-size: 40px; color: #10b981; margin-bottom: 10px; display: block;"></i><h3 style="color: #10b981; margin: 0 0 8px; font-size: 18px;">Esta sessão já foi assinada</h3><p style="color: #64748b; margin: 0; font-size: 14px;">Assinada por ${escapeHTML(data.sessao.assinadaPorNome || '')}</p></div>`; return; }
        if (data.sessao.status === 'cancelado') { safeGet('telaAssinaturaInfo').innerHTML = `<div style="text-align: center; padding: 30px 20px;"><i class="fas fa-times-circle" style="font-size: 40px; color: #ef4444; margin-bottom: 10px; display: block;"></i><h3 style="color: #ef4444; margin: 0 0 8px; font-size: 18px;">Sessão cancelada</h3><p style="color: #64748b; margin: 0; font-size: 14px;">Esta sessão de assinatura foi cancelada.</p></div>`; return; }
        const d = data.sessao.dadosAtendimento || {};
        safeGet('telaAssinaturaInfo').innerHTML = `<div style="border-left: 4px solid #14b8a6; padding-left: 10px; margin-bottom: 10px;"><h2 style="margin: 0 0 4px; font-size: 16px; color: #0f766e;">Atendimento Psicologia</h2><p style="margin: 0; color: #64748b; font-size: 12px;">Confirme os dados e assine abaixo</p></div><div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;"><div><span style="font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 700; display: block; margin-bottom: 2px;">Aluno</span><span style="font-size: 13px; color: #1e293b; font-weight: 500;">${escapeHTML(d.alunoNome || '-')}</span></div><div><span style="font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 700; display: block; margin-bottom: 2px;">Turma</span><span style="font-size: 13px; color: #1e293b; font-weight: 500;">${escapeHTML(d.alunoTurma || '-')}</span></div><div><span style="font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 700; display: block; margin-bottom: 2px;">Motivo</span><span style="font-size: 13px; color: #1e293b; font-weight: 500;">${escapeHTML(d.motivoLabel || '-')}</span></div><div><span style="font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 700; display: block; margin-bottom: 2px;">Gravidade</span><span style="font-size: 13px; color: #1e293b; font-weight: 500;">${escapeHTML((d.gravidade || 'media').toUpperCase())}</span></div>${d.descricao ? `<div style="grid-column: 1 / -1;"><span style="font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 700; display: block; margin-bottom: 2px;">Descrição</span><span style="font-size: 12px; color: #1e293b;">${escapeHTML(d.descricao.substring(0, 150))}${d.descricao.length > 150 ? '...' : ''}</span></div>` : ''}</div>`;
        safeGet('telaAssinaturaArea').style.display = 'flex';
        sessaoAssinaturaModo = sessaoId; sessaoAssinaturaAtual = data.sessao;
        setTimeout(() => inicializarCanvasTela(), 100);
        window.addEventListener('resize', handleResizeCanvasTela);
    } catch (e) { safeGet('telaAssinaturaInfo').innerHTML = `<div style="text-align: center; padding: 30px 20px;"><i class="fas fa-exclamation-triangle" style="font-size: 40px; color: #ef4444; margin-bottom: 10px; display: block;"></i><h3 style="color: #ef4444; margin: 0 0 8px; font-size: 18px;">Erro ao carregar</h3><p style="color: #64748b; margin: 0; font-size: 14px;">${e.message}</p></div>`; }
}

function handleResizeCanvasTela() {
    const canvas = safeGet('canvasAssinatura'); const wrapper = safeGet('canvasWrapper');
    if (!canvas || !wrapper) return;
    if (!telaTemAssinatura) {
        const rect = wrapper.getBoundingClientRect(); if (rect.width === 0 || rect.height === 0) return;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
        canvas.style.width = rect.width + 'px'; canvas.style.height = rect.height + 'px';
        const ctx = canvas.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.scale(dpr, dpr); ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#14b8a6'; telaCtx = ctx;
    } else {
        const tempCanvas = document.createElement('canvas'); tempCanvas.width = canvas.width; tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext('2d'); tempCtx.drawImage(canvas, 0, 0);
        const rect = wrapper.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
        canvas.style.width = rect.width + 'px'; canvas.style.height = rect.height + 'px';
        const ctx = canvas.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.scale(dpr, dpr); ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#14b8a6'; telaCtx = ctx;
        ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height, 0, 0, rect.width, rect.height);
    }
}

function inicializarCanvasTela() {
    const canvas = safeGet('canvasAssinatura'); const wrapper = safeGet('canvasWrapper'); const placeholder = safeGet('placeholder');
    if (!canvas || !wrapper) return;
    telaCanvas = canvas; telaWrapper = wrapper; telaPlaceholder = placeholder; telaTemAssinatura = false; telaDesenhando = false;
    const ajustar = () => { const rect = wrapper.getBoundingClientRect(); if (rect.width === 0 || rect.height === 0) { setTimeout(ajustar, 200); return; } const dpr = window.devicePixelRatio || 1; canvas.width = rect.width * dpr; canvas.height = rect.height * dpr; canvas.style.width = rect.width + 'px'; canvas.style.height = rect.height + 'px'; const ctx = canvas.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.scale(dpr, dpr); ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#14b8a6'; telaCtx = ctx; };
    ajustar();
    window.removeEventListener('resize', handleResizeCanvasTela);
    window.addEventListener('resize', handleResizeCanvasTela);
    const getPos = (e) => { const rect = canvas.getBoundingClientRect(); let cx, cy; if (e.touches?.length > 0) { cx = e.touches[0].clientX; cy = e.touches[0].clientY; } else if (e.changedTouches?.length > 0) { cx = e.changedTouches[0].clientX; cy = e.changedTouches[0].clientY; } else { cx = e.clientX; cy = e.clientY; } return { x: cx - rect.left, y: cy - rect.top }; };
    const iniciar = (e) => { e.preventDefault(); telaDesenhando = true; telaTemAssinatura = true; const p = getPos(e); telaLastX = p.x; telaLastY = p.y; wrapper.style.borderColor = '#14b8a6'; wrapper.style.borderStyle = 'solid'; placeholder.style.opacity = '0'; const btn = safeGet('btnSalvarAssinatura'); if (btn) { btn.disabled = false; btn.style.background = 'linear-gradient(135deg, #10b981, #059669)'; btn.style.cursor = 'pointer'; } };
    const desenhar = (e) => { if (!telaDesenhando) return; e.preventDefault(); const p = getPos(e); telaCtx.beginPath(); telaCtx.moveTo(telaLastX, telaLastY); telaCtx.lineTo(p.x, p.y); telaCtx.stroke(); telaLastX = p.x; telaLastY = p.y; };
    const parar = (e) => { if (e?.preventDefault) e.preventDefault(); telaDesenhando = false; };
    canvas.addEventListener('touchstart', iniciar, { passive: false }); canvas.addEventListener('touchmove', desenhar, { passive: false }); canvas.addEventListener('touchend', parar, { passive: false }); canvas.addEventListener('touchcancel', parar, { passive: false }); canvas.addEventListener('mousedown', iniciar); canvas.addEventListener('mousemove', desenhar); canvas.addEventListener('mouseup', parar); canvas.addEventListener('mouseleave', () => { if (telaDesenhando) parar(); });
}

function limparAssinaturaTela() {
    if (!telaCtx || !telaCanvas) return;
    const rect = telaCanvas.getBoundingClientRect(); telaCtx.clearRect(0, 0, rect.width, rect.height); telaTemAssinatura = false;
    if (telaPlaceholder) telaPlaceholder.style.opacity = '1';
    if (telaWrapper) { telaWrapper.style.borderColor = '#cbd5e0'; telaWrapper.style.borderStyle = 'dashed'; }
    const btn = safeGet('btnSalvarAssinatura'); if (btn) { btn.disabled = true; btn.style.background = '#cbd5e0'; btn.style.cursor = 'not-allowed'; }
}

async function salvarAssinaturaTela() {
    if (!telaTemAssinatura || !sessaoAssinaturaModo) return;
    const btn = safeGet('btnSalvarAssinatura'); if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...'; }
    try {
        const base64 = telaCanvas.toDataURL('image/png');
        const response = await fetch(`/api/sessoes-assinatura/${sessaoAssinaturaModo}/assinar`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assinaturaBase64: base64, assinanteNome: 'Responsável' }) });
        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Erro ao salvar');
        safeGet('telaAssinaturaInfo').innerHTML = `<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px; text-align: center; width: 100%;"><i class="fas fa-check-circle" style="font-size: 56px; color: #10b981; margin-bottom: 15px; display: block;"></i><h2 style="color: #10b981; margin: 0 0 8px; font-size: 20px;">Assinatura Confirmada!</h2><p style="color: #64748b; margin: 0 0 20px; font-size: 14px; line-height: 1.5;">A assinatura foi registrada com sucesso.<br>Você já pode fechar esta janela.</p><button onclick="window.close()" style="padding: 12px 28px; background: #14b8a6; color: white; border: none; border-radius: 10px; font-weight: 600; cursor: pointer; font-size: 14px; display: inline-flex; align-items: center; gap: 8px;"><i class="fas fa-times"></i> Fechar</button></div>`;
        safeGet('telaAssinaturaArea').style.display = 'none';
        const telaInfo = safeGet('telaAssinaturaInfo');
        if (telaInfo) { telaInfo.style.flex = '1'; telaInfo.style.display = 'flex'; telaInfo.style.alignItems = 'center'; telaInfo.style.justifyContent = 'center'; telaInfo.style.maxHeight = 'none'; telaInfo.style.borderLeft = 'none'; telaInfo.style.borderRadius = '0 0 16px 16px'; }
    } catch (e) { mostrarToastConcluido('❌ ' + e.message, 'error'); if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Confirmar Assinatura'; } }
}

// ============================================
// EXPORTAR FUNÇÕES GLOBAIS
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
window.verAtendimento = verAtendimento;
window.fecharVerAtendimento = fecharVerAtendimento;
window.toggleRelatorioFiltros = toggleRelatorioFiltros;
window.carregarRelatorio = carregarRelatorio;
window.exportarCSV = exportarCSV;
window.logout = logout;
window.selecionarAlunoAutocomplete = selecionarAlunoAutocomplete;
window.carregarLembretes = carregarLembretes;
window.toggleFiltrosAvancados = toggleFiltrosAvancados;
window.limparFiltrosAndamento = limparFiltrosAndamento;
window.limparFiltroIndividual = limparFiltroIndividual;
window.abrirEditarAtendimento = abrirEditarAtendimento;
window.salvarEdicaoAtendimento = salvarEdicaoAtendimento;
window.carregarAtendimentosConcluidos = carregarAtendimentosConcluidos;
window.excluirAtendimentoConcluido = excluirAtendimentoConcluido;
window.limparFiltrosConcluidos = limparFiltrosConcluidos;
window.abrirExclusaoEmMassa = abrirExclusaoEmMassa;
window.confirmarExclusaoMassa = confirmarExclusaoMassa;
window.mostrarToastConcluido = mostrarToastConcluido;
window.imprimirAtendimento = imprimirAtendimento;
window.abrirNotificacoes = abrirNotificacoes;
window.abrirNotificacao = abrirNotificacao;
window.marcarTodasLidas = marcarTodasLidas;
window.limparMinhasNotificacoes = limparMinhasNotificacoes;
window.fecharNotificacoes = fecharNotificacoes;
window.mostrarNotificacaoInterna = mostrarNotificacaoInterna;
window.confirmarInterno = confirmarInterno;
window.exportarPDF = exportarPDF;
window.habilitarBotoesRelatorio = habilitarBotoesRelatorio;
window.toggleNecessitaAssinatura = toggleNecessitaAssinatura;
window.abrirModalAssinaturaQR = abrirModalAssinaturaQR;
window.fecharModalAssinaturaQR = fecharModalAssinaturaQR;
window.reabrirModalAssinaturaQR = reabrirModalAssinaturaQR;
window.copiarLinkAssinatura = copiarLinkAssinatura;
window.cancelarSessaoAssinatura = cancelarSessaoAssinatura;
window.refazerAssinaturaPsico = refazerAssinaturaPsico;
window.mostrarTelaAssinatura = mostrarTelaAssinatura;
window.limparAssinaturaTela = limparAssinaturaTela;
window.salvarAssinaturaTela = salvarAssinaturaTela;
window.mostrarCanvasAssinaturaInline = mostrarCanvasAssinaturaInline;
window.voltarParaQRCode = voltarParaQRCode;
window.limparCanvasInline = limparCanvasInline;
window.salvarAssinaturaInline = salvarAssinaturaInline;
window.abrirModalVerificacao24h = abrirModalVerificacao24h;
window.verificarAtendimento24h = verificarAtendimento24h;
window.atualizarContadorAtendimentosAntigos = atualizarContadorAtendimentosAntigos;