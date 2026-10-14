// frontend/js/secretaria.js
// ============================================
// SECRETARIA - CONSULTA + DECLARAÇÕES
// ============================================

let token = localStorage.getItem('auth_token');

let modoAtual = 'automatico';
let currentAluno = null;
let scannerAuto = null;
let scannerAutoAtivo = false;
let turmasDisponiveis = [];
let cursosDisponiveis = [];
let alunosPorTurma = [];
let motivoConsulta = 'todos';
let resultadosPorData = [];

const autocompleteState = {
    alunos: [],
    carregado: false,
    carregando: false
};

let relatorioAtual = null;
let tipoRelatorioAtual = 'geral';

const charts = { motivos: null };

let notificacoesInterval = null;
let __notificacoesCache = [];
let __lembretesCache = [];

// ============================================
// 🔥 ESTADO DAS DECLARAÇÕES
// ============================================
let tipoDeclaracaoAtual = 'aluno';
let usuarioSelecionadoDeclaracao = null;
let usuarioSelecionadoAlunoResp = null;
let declaracoesHistorico = [];
let opcoesDeclaracao = {
    cargos: [],
    funcoes: [],
    cargasHorarias: [],
    motivosDeclaracao: [],
    parentescos: [],
    anosCursados: []
};

// Cache de alunos para a busca por turma nas declarações
let alunosDeclaracaoPorTurma = [];

// ============================================
// UTILITÁRIOS
// ============================================
function safeGet(id) { return document.getElementById(id); }
function safeSetText(id, value) { const el = safeGet(id); if (el) el.textContent = value; }

function getDataLocalISO(dateObj) {
    const d = dateObj || new Date();
    return d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');
}

// Converte "YYYY-MM-DD" para "DD de mês de YYYY"
function formatarDataEmissaoExtenso(isoDate) {
    if (!isoDate) return '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate;

    const meses = [
        'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
        'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
    ];
    const [ano, mes, dia] = isoDate.split('-').map(Number);
    return `${String(dia).padStart(2, '0')} de ${meses[mes - 1]} de ${ano}`;
}

function escapeHTML(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatarCPF(cpf) {
    if (!cpf) return '';
    const numeros = cpf.replace(/\D/g, '');
    if (numeros.length !== 11) return cpf;
    return numeros.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function gerarAvatarSVG(nome) {
    const inicial = (nome || '?').charAt(0).toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#10b981"/><stop offset="100%" stop-color="#059669"/></linearGradient></defs><circle cx="50" cy="50" r="50" fill="url(#g)"/><text x="50" y="50" font-family="Arial,sans-serif" font-size="45" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="central">${inicial}</text></svg>`;
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
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

function getMotivoLabel(motivo) {
    const labels = {
        'problemas_pessoais': 'Problemas Pessoais',
        'problemas_saude': 'Problemas de Saúde',
        'viagem': 'Viagem',
        'outros': 'Outros'
    };
    return labels[motivo] || motivo;
}

function getPeriodoFaltaFormatado(j) {
    if (!j) return null;
    if (j.periodoFaltaFormatado) return j.periodoFaltaFormatado;
    if (!j.periodoFaltaInicio) return null;
    const ini = new Date(j.periodoFaltaInicio);
    const fim = j.periodoFaltaFim ? new Date(j.periodoFaltaFim) : ini;
    const fmt = (d) => d.toLocaleDateString('pt-BR');
    const iniDia = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate());
    const fimDia = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate());
    if (iniDia.getTime() === fimDia.getTime()) return fmt(iniDia);
    return `${fmt(iniDia)} a ${fmt(fimDia)}`;
}

function getTipoProvaFormatado(j) {
    if (!j) return null;
    if (j.tipoProvaPerdidaFormatado) return j.tipoProvaPerdidaFormatado;
    if (!j.tipoProvaPerdida) return null;
    if (j.tipoProvaPerdida === 'Outros' && j.tipoProvaPerdidaOutros) {
        return `Outros (${j.tipoProvaPerdidaOutros})`;
    }
    return j.tipoProvaPerdida;
}

function notificar(mensagem, tipo = 'success', duracao = 3500) {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.style.cssText = `
            position: fixed; top: 20px; right: 20px; z-index: 99999;
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
        box-shadow: 0 4px 12px rgba(0,0,0,0.2); font-size: 14px; max-width: 380px;
        display: flex; align-items: center; gap: 10px; pointer-events: auto;
        animation: slideInToast 0.3s ease; font-family: inherit;
    `;
    toast.innerHTML = `<span style="font-size:18px;">${c.icon}</span><span>${escapeHTML(mensagem)}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, duracao);
}

// ============================================
// SISTEMA DE NOTIFICAÇÕES
// ============================================
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
    const cores = { success: '#10b981', error: '#dc2626', warning: '#f59e0b', info: '#10b981' };
    modal.innerHTML = `
        <div style="background: white; border-radius: 16px; padding: 25px; max-width: 380px; width: 100%;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.3); text-align: center;">
            <div style="font-size: 48px; margin-bottom: 15px;">${icones[tipo] || 'ℹ️'}</div>
            <p style="margin: 0 0 20px; color: #374151; font-size: 15px; line-height: 1.5; white-space: pre-line;">${mensagem}</p>
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
                        <div class="modal-header" style="background: linear-gradient(135deg, #10b981, #059669); color: white;">
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

function iniciarSistemaNotificacoes() {
    if (!document.getElementById('notificacoesBtn')) return;
    carregarTudo();
    if (notificacoesInterval) clearInterval(notificacoesInterval);
    notificacoesInterval = setInterval(carregarTudo, 30000);
    document.addEventListener('click', function(event) {
        const dropdown = document.getElementById('notificacoesDropdown');
        const btn = document.getElementById('notificacoesBtn');
        if (dropdown && btn && !btn.contains(event.target) && !dropdown.contains(event.target)) {
            dropdown.classList.remove('show');
            dropdown.style.display = 'none';
        }
    });
}

async function carregarTudo() {
    await Promise.all([carregarNotificacoesSistema(), carregarLembretesRemarcacao()]);
    renderizarSinoUnificado();
    atualizarBadgeUnificado();
}

async function carregarNotificacoesSistema() {
    try {
        const tk = localStorage.getItem('auth_token');
        if (!tk) return;
        const response = await fetch('/api/notificacoes?apenasNaoLidas=false&limite=20', {
            headers: { 'Authorization': `Bearer ${tk}` }
        });
        const data = await response.json();
        if (data.success) __notificacoesCache = data.notificacoes || [];
    } catch (error) { /* silencioso */ }
}

async function carregarLembretesRemarcacao() {
    try {
        const tk = localStorage.getItem('auth_token');
        if (!tk) return;
        const response = await fetch('/api/gestao-geral/remarcacoes/pendentes', {
            headers: { 'Authorization': `Bearer ${tk}` }
        });
        const contentType = response.headers.get('content-type') || '';
        if (!response.ok || !contentType.includes('application/json')) { __lembretesCache = []; return; }
        const data = await response.json();
        __lembretesCache = data.success && Array.isArray(data.remarcacoes) ? data.remarcacoes : [];
    } catch (error) { __lembretesCache = []; }
}

function renderizarSinoUnificado() {
    const lista = document.getElementById('notificacoesLista');
    if (!lista) return;
    const temNotificacoes = __notificacoesCache.length > 0;
    const temLembretes = __lembretesCache.length > 0;
    if (!temNotificacoes && !temLembretes) {
        lista.innerHTML = `<div style="text-align: center; padding: 40px; color: #6c757d;">
            <i class="fas fa-bell-slash" style="font-size: 3rem; margin-bottom: 15px; opacity: 0.4;"></i>
            <p style="margin: 0;">Nenhuma notificação</p></div>`;
        return;
    }
    let html = '';
    if (temLembretes) {
        html += `<div style="padding: 12px 16px; background: #f0fdf4; border-bottom: 1px solid #d1fae5;">
            <strong style="color: #059669; font-size: 0.85rem;">
                <i class="fas fa-calendar-alt"></i> Lembretes (${__lembretesCache.length})
            </strong></div>`;
        __lembretesCache.forEach(r => {
            html += `<div style="padding: 12px 16px; border-bottom: 1px solid #f3f4f6;">
                <strong style="font-size: 0.85rem;">${escapeHTML(r.alunoNome || '')}</strong>
                <p style="margin: 4px 0 0; font-size: 0.78rem; color: #6b7280;">
                    ${r.dataRemarcacao || ''} às ${r.horarioRemarcacao || ''}</p></div>`;
        });
    }
    if (temNotificacoes) {
        html += `<div style="padding: 12px 16px; background: #f0fdf4; border-bottom: 1px solid #d1fae5;">
            <strong style="color: #059669; font-size: 0.85rem;">
                <i class="fas fa-bell"></i> Notificações
            </strong></div>`;
        __notificacoesCache.forEach(notif => {
            const classeLida = notif.lida ? '' : 'font-weight: 600;';
            html += `<div class="notificacao-item" data-id="${notif._id}" style="padding: 14px 16px; border-bottom: 1px solid #f3f4f6; cursor: pointer; ${classeLida}"
                onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='white'">
                <div style="display: flex; gap: 10px;">
                    <div style="width: 36px; height: 36px; border-radius: 50%; background: ${notif.cor || '#10b981'}; color: white; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 1rem;">
                        ${notif.icone || '📋'}</div>
                    <div style="flex: 1; min-width: 0;">
                        <strong style="display: block; font-size: 0.85rem; color: #1f2937;">${escapeHTML(notif.titulo || '')}</strong>
                        <p style="margin: 2px 0 0; font-size: 0.78rem; color: #6b7280; line-height: 1.3;">${escapeHTML(notif.mensagem || '')}</p>
                    </div>
                </div></div>`;
        });
    }
    lista.innerHTML = html;
    lista.querySelectorAll('.notificacao-item').forEach(item => {
        item.addEventListener('click', () => abrirNotificacao(item.getAttribute('data-id')));
    });
}

function atualizarBadgeUnificado() {
    const badge = document.getElementById('notificacoesBadge');
    if (!badge) return;
    const total = __notificacoesCache.filter(n => !n.lida).length + __lembretesCache.length;
    if (total > 0) {
        badge.textContent = total > 99 ? '99+' : total;
        badge.style.display = 'inline-block';
    } else { badge.style.display = 'none'; }
}

async function abrirNotificacao(id) {
    try {
        const tk = localStorage.getItem('auth_token');
        await fetch(`/api/notificacoes/${id}/lida`, { method: 'PUT', headers: { 'Authorization': `Bearer ${tk}` } });
        carregarTudo();
    } catch (error) { /* silencioso */ }
}

function abrirNotificacoes() {
    const dropdown = document.getElementById('notificacoesDropdown');
    if (!dropdown) return;
    const isVisible = dropdown.style.display === 'block';
    dropdown.style.display = isVisible ? 'none' : 'block';
    dropdown.classList.toggle('show', !isVisible);
    if (!isVisible) carregarTudo();
}

function fecharNotificacoes() {
    const dropdown = document.getElementById('notificacoesDropdown');
    if (dropdown) { dropdown.classList.remove('show'); dropdown.style.display = 'none'; }
}

async function marcarTodasLidas() {
    try {
        const tk = localStorage.getItem('auth_token');
        const response = await fetch('/api/notificacoes/marcar-todas-lidas', { method: 'PUT', headers: { 'Authorization': `Bearer ${tk}` } });
        const data = await response.json();
        if (data.success) { await carregarTudo(); mostrarNotificacaoInterna('Notificações marcadas como lidas!', 'success'); }
    } catch (error) { /* silencioso */ }
}

async function limparMinhasNotificacoes() {
    try {
        const tk = localStorage.getItem('auth_token');
        const confirmacao = await confirmarInternoNotif('🗑️ Deseja excluir TODAS as suas notificações?\n\nEsta ação não pode ser desfeita.');
        if (!confirmacao) return;
        const response = await fetch('/api/notificacoes/limpar-minhas', {
            method: 'DELETE', headers: { 'Authorization': `Bearer ${tk}`, 'Content-Type': 'application/json' }
        });
        const data = await response.json();
        if (data.success) { __notificacoesCache = []; await carregarTudo(); mostrarNotificacaoInterna('Notificações excluídas!', 'success'); }
    } catch (error) { mostrarNotificacaoInterna('Erro ao limpar notificações', 'error'); }
}

// ============================================
// INICIALIZAÇÃO
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    if (!token) { window.location.href = '/login.html'; return; }
    const userData = JSON.parse(localStorage.getItem('user_data') || '{}');
    const allowedRoles = ['secretaria', 'super_admin', 'admin'];
    if (!allowedRoles.includes(userData.role)) {
        alert('Acesso negado.'); window.location.href = '/login.html'; return;
    }
    safeSetText('userName', userData.nome || 'Secretaria');
    safeSetText('userRole', 'Secretaria');
    safeSetText('dataAtual', new Date().toLocaleDateString('pt-BR'));

    await carregarFotoPerfil();
    configurarEventos();
    await carregarTurmasParaManual();
    await carregarCursosDisponiveis();
    await carregarOpcoesDeclaracao();
    await carregarTurmasDeclaracao();

    setTimeout(iniciarSistemaNotificacoes, 500);
    setTimeout(() => { if (safeGet('modoAutomatico')?.offsetParent !== null) iniciarScannerAutomatico(); }, 800);

    selecionarTipoDeclaracao('aluno');
});

window.addEventListener('beforeunload', () => {
    pararScannerAutomatico();
    if (notificacoesInterval) clearInterval(notificacoesInterval);
});

async function carregarFotoPerfil() {
    try {
        const response = await fetch('/api/perfil/me', { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await response.json();
        if (data.success && data.perfil?.fotoPerfil) {
            const avatar = safeGet('userAvatar');
            if (avatar) avatar.innerHTML = `<img src="${data.perfil.fotoPerfil}" alt="Foto" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        }
    } catch (error) { /* silencioso */ }
}

async function carregarCursosDisponiveis() {
    try {
        const response = await fetch('/api/secretaria/justificativa/cursos', { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await response.json();
        if (data.success && Array.isArray(data.cursos)) {
            cursosDisponiveis = data.cursos;
            popularSelectCursosData();
        }
    } catch (error) { /* silencioso */ }
}

async function carregarOpcoesDeclaracao() {
    try {
        const response = await fetch('/api/secretaria/declaracoes/opcoes', { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await response.json();
        if (data.success && data.opcoes) opcoesDeclaracao = data.opcoes;
    } catch (error) { /* silencioso */ }
}

async function carregarTurmasDeclaracao() {
    const select = safeGet('declFiltroTurma');
    if (!select) return;
    select.innerHTML = '<option value="">Selecione uma turma...</option>';
    turmasDisponiveis.forEach(turma => {
        select.innerHTML += `<option value="${escapeHTML(turma)}">${escapeHTML(turma)}</option>`;
    });
}

// ============================================
// EVENTOS
// ============================================
function configurarEventos() {
    safeGet('modoAutomaticoBtn')?.addEventListener('click', () => setModo('automatico'));
    safeGet('modoManualBtn')?.addEventListener('click', () => setModo('manual'));
    safeGet('modoDataBtn')?.addEventListener('click', () => setModo('data'));
    safeGet('filtroTurmaManual')?.addEventListener('change', () => carregarAlunosPorTurma());
    safeGet('filtroBuscaManual')?.addEventListener('input', () => filtrarAlunosManual());
    safeGet('btnBuscarPorData')?.addEventListener('click', () => buscarPorData());
    safeGet('filtroDataNome')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') buscarPorData(); });
    safeGet('btnBuscarJustificativas')?.addEventListener('click', () => buscarJustificativasDoAluno());

    safeGet('tipoRelatorio')?.addEventListener('change', (e) => {
        const tipo = e.target.value;
        const divTurma = safeGet('filtroTurmaDiv');
        const divAluno = safeGet('filtroAlunoDiv');
        if (divTurma) divTurma.style.display = tipo === 'turma' ? 'block' : 'none';
        if (divAluno) divAluno.style.display = tipo === 'aluno' ? 'block' : 'none';
        safeGet('btnExportarCSV').disabled = true;
        safeGet('btnExportarPDF').disabled = true;
        relatorioAtual = null;
        if (tipo === 'aluno') configurarAutocompleteRelatorio();
    });

    safeGet('buscaAlunoRelatorio')?.addEventListener('input', (e) => {
        const termo = e.target.value.trim();
        const hiddenInput = safeGet('filtroAluno');
        if (hiddenInput) hiddenInput.value = '';
        const infoEl = safeGet('alunoSelecionadoInfo');
        if (infoEl) infoEl.textContent = '';
        if (termo.length < 2) {
            const listEl = safeGet('autocompleteAlunoList');
            if (listEl) listEl.style.display = 'none';
            return;
        }
        filtrarAutocompleteRelatorio(termo);
    });

    safeGet('btnExportarCSV')?.addEventListener('click', exportarCSV);
    safeGet('btnExportarPDF')?.addEventListener('click', exportarPDF);

    // Declarações — busca principal por nome
    safeGet('declBuscaUsuario')?.addEventListener('input', (e) => {
        const termo = e.target.value.trim();
        if (termo.length < 2) {
            const listEl = safeGet('declAutocompleteList');
            if (listEl) listEl.style.display = 'none';
            return;
        }
        buscarUsuarioDeclaracao(termo);
    });

    // Declarações — busca por turma
    safeGet('declFiltroTurma')?.addEventListener('change', () => carregarAlunosDeclaracaoPorTurma());
    safeGet('declFiltroNomeTurma')?.addEventListener('input', () => filtrarAlunosDeclaracaoTurma());

    safeGet('histFiltroNome')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') carregarHistoricoDeclaracoes(); });
}

// ============================================
// MODO (AUTO / MANUAL / DATA)
// ============================================
async function setModo(modo) {
    modoAtual = modo;
    const infoEl = safeGet('alunoInfo');
    if (infoEl) infoEl.style.display = 'none';
    currentAluno = null;
    if (safeGet('modoAutomatico')) safeGet('modoAutomatico').style.display = 'none';
    if (safeGet('modoManual')) safeGet('modoManual').style.display = 'none';
    if (safeGet('modoData')) safeGet('modoData').style.display = 'none';
    safeGet('modoAutomaticoBtn')?.classList.remove('active');
    safeGet('modoManualBtn')?.classList.remove('active');
    safeGet('modoDataBtn')?.classList.remove('active');

    if (modo === 'automatico') {
        safeGet('modoAutomaticoBtn')?.classList.add('active');
        safeGet('modoAutomatico').style.display = 'block';
        await iniciarScannerAutomatico();
    } else if (modo === 'manual') {
        safeGet('modoManualBtn')?.classList.add('active');
        safeGet('modoManual').style.display = 'block';
        await pararScannerAutomatico();
        const turmaSelecionada = safeGet('filtroTurmaManual')?.value;
        if (turmaSelecionada) await carregarAlunosPorTurma();
    } else if (modo === 'data') {
        safeGet('modoDataBtn')?.classList.add('active');
        safeGet('modoData').style.display = 'block';
        await pararScannerAutomatico();
        const dataLocal = getDataLocalISO();
        const inputInicio = safeGet('filtroDataInicio');
        if (inputInicio && !inputInicio.value) inputInicio.value = dataLocal;
        popularSelectTurmasData();
        popularSelectCursosData();
    }
}

// ============================================
// SCANNER QR CODE
// ============================================
async function iniciarScannerAutomatico() {
    const qrContainer = safeGet('qr-reader-auto');
    if (!qrContainer) return;
    if (scannerAutoAtivo) return;
    qrContainer.innerHTML = '<div id="qr-reader-auto-new" style="width: 100%;"></div>';
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        qrContainer.innerHTML = `<div class="camera-error-box">
            <div class="camera-error-icon"><i class="fas fa-video-slash"></i></div>
            <h4>Câmera não suportada</h4>
            <p>Este navegador não oferece suporte à câmera.<br>Use o modo manual para consultar.</p>
            <button class="btn-manual-fallback" onclick="setModo('manual')">
                <i class="fas fa-users"></i> Usar Busca Manual</button></div>`;
        return;
    }
    try {
        scannerAuto = new Html5Qrcode("qr-reader-auto-new");
        await scannerAuto.start({ facingMode: "environment" },
            { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
            onScanSuccessAuto, () => {});
        scannerAutoAtivo = true;
    } catch (err) {
        let msg = 'Não foi possível acessar a câmera.';
        if (err.message?.includes('NotFoundError')) msg = 'Nenhuma câmera encontrada neste dispositivo.';
        else if (err.message?.includes('NotAllowedError')) msg = 'Permissão de câmera foi negada.';
        else if (err.message?.includes('NotReadableError')) msg = 'A câmera está sendo usada por outro app.';
        qrContainer.innerHTML = `<div class="camera-error-box">
            <div class="camera-error-icon"><i class="fas fa-video-slash"></i></div>
            <h4>Câmera indisponível</h4>
            <p>${escapeHTML(msg)}<br>Use o modo manual para consultar.</p>
            <button class="btn-manual-fallback" onclick="setModo('manual')">
                <i class="fas fa-users"></i> Usar Busca Manual</button></div>`;
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
    if (!alunoId) { notificar('QR Code inválido', 'error'); return; }
    await pararScannerAutomatico();
    await buscarAluno(alunoId);
}

function reiniciarScannerAutomatico() {
    setTimeout(() => { if (!scannerAutoAtivo && modoAtual === 'automatico') iniciarScannerAutomatico(); }, 1000);
}

// ============================================
// BUSCA MANUAL
// ============================================
async function carregarTurmasParaManual() {
    try {
        const response = await fetch('/api/secretaria/justificativa/turmas', { headers: { 'Authorization': `Bearer ${token}` } });
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
            const selectRelatorio = safeGet('filtroTurma');
            if (selectRelatorio) {
                selectRelatorio.innerHTML = '<option value="">Selecione...</option>';
                data.turmas.forEach(turma => {
                    selectRelatorio.innerHTML += `<option value="${escapeHTML(turma)}">${escapeHTML(turma)}</option>`;
                });
            }
            popularSelectTurmasData();
        }
    } catch (error) { /* silencioso */ }
}

function popularSelectTurmasData() {
    const select = safeGet('filtroDataTurma');
    if (!select) return;
    if (select.options.length > 1) return;
    const valorAtual = select.value;
    select.innerHTML = '<option value="">Todas as turmas</option>';
    turmasDisponiveis.forEach(turma => {
        select.innerHTML += `<option value="${escapeHTML(turma)}">${escapeHTML(turma)}</option>`;
    });
    if (valorAtual) select.value = valorAtual;
}

function popularSelectCursosData() {
    const select = safeGet('filtroDataCurso');
    if (!select) return;
    if (select.options.length > 1) return;
    const valorAtual = select.value;
    select.innerHTML = '<option value="">Todos os cursos</option>';
    cursosDisponiveis.forEach(curso => {
        select.innerHTML += `<option value="${escapeHTML(curso)}">${escapeHTML(curso)}</option>`;
    });
    if (valorAtual) select.value = valorAtual;
}

function limparFiltrosData() {
    ['filtroDataNome', 'filtroDataTurma', 'filtroDataCurso', 'filtroDataMotivo'].forEach(id => {
        const el = safeGet(id); if (el) el.value = '';
    });
    notificar('Filtros limpos', 'info', 1800);
}

async function carregarAlunosPorTurma() {
    const turma = safeGet('filtroTurmaManual')?.value;
    const container = safeGet('listaAlunosManual');
    if (!turma) {
        if (container) container.innerHTML = `<div class="empty-state-mini"><i class="fas fa-users"></i><p>Selecione uma turma</p></div>`;
        return;
    }
    if (container) container.innerHTML = `<div class="text-center py-3"><div class="loading-spinner"></div><p>Carregando alunos...</p></div>`;
    try {
        const response = await fetch(`/api/secretaria/justificativa/alunos-por-turma?turma=${encodeURIComponent(turma)}`, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await response.json();
        if (data.success && Array.isArray(data.alunos)) {
            alunosPorTurma = data.alunos;
            filtrarAlunosManual();
        } else {
            if (container) container.innerHTML = `<div class="empty-state-mini"><i class="fas fa-user-slash"></i><p>Nenhum aluno encontrado</p></div>`;
        }
    } catch (error) {
        if (container) container.innerHTML = `<div class="empty-state-mini"><i class="fas fa-exclamation-triangle"></i><p>Erro ao carregar alunos</p></div>`;
    }
}

function filtrarAlunosManual() {
    if (!Array.isArray(alunosPorTurma)) return;
    const busca = (safeGet('filtroBuscaManual')?.value || '').toLowerCase();
    let filtrados = alunosPorTurma;
    if (busca) filtrados = filtrados.filter(a => (a.nome || '').toLowerCase().includes(busca));
    filtrados.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    const container = safeGet('listaAlunosManual');
    if (!container) return;
    if (filtrados.length === 0) {
        container.innerHTML = `<div class="empty-state-mini"><i class="fas fa-user-slash"></i><p>Nenhum aluno encontrado</p></div>`;
        return;
    }
    let html = '<div class="lista-alunos-grid">';
    filtrados.forEach(aluno => {
        html += `<div class="aluno-item" data-aluno-id="${aluno.id}" data-aluno-nome="${escapeHTML(aluno.nome)}">
            <div class="aluno-item-avatar"><img src="${aluno.fotoPerfil || gerarAvatarSVG(aluno.nome)}" alt=""></div>
            <div class="aluno-item-info">
                <strong>${escapeHTML(aluno.nome)}</strong>
                <small>${escapeHTML(aluno.matricula || 'Sem matrícula')}${aluno.curso ? ' • ' + escapeHTML(aluno.curso) : ''}</small>
            </div>
            <i class="fas fa-chevron-right aluno-item-arrow"></i></div>`;
    });
    html += '</div>';
    container.innerHTML = html;
    container.querySelectorAll('.aluno-item').forEach(item => {
        item.addEventListener('click', () => {
            const id = item.getAttribute('data-aluno-id');
            const nome = item.getAttribute('data-aluno-nome');
            item.style.background = '#d1fae5';
            item.style.borderColor = '#10b981';
            item.style.pointerEvents = 'none';
            item.innerHTML = `<div class="aluno-item-avatar"><div class="loading-spinner" style="width:22px;height:22px;border-width:3px;"></div></div>
                <div class="aluno-item-info"><strong>${escapeHTML(nome)}</strong><small style="color:#10b981;">Processando...</small></div>`;
            buscarAluno(id);
        });
    });
}

// ============================================
// BUSCAR ALUNO
// ============================================
async function buscarAluno(alunoId) {
    try {
        await pararScannerAutomatico();
        const response = await fetch(`/api/secretaria/justificativa/aluno/${alunoId}`, {
            headers: { 'Authorization': `Bearer ${token}` }, cache: 'no-store'
        });
        const data = await response.json();
        if (data.success && data.aluno) {
            currentAluno = data.aluno;
            exibirAlunoComJustificativas(data);
        } else {
            notificar(data.error || 'Aluno não encontrado', 'error');
            if (modoAtual === 'automatico') reiniciarScannerAutomatico();
            else carregarAlunosPorTurma();
        }
    } catch (error) {
        notificar('Erro ao buscar aluno', 'error');
        if (modoAtual === 'automatico') reiniciarScannerAutomatico();
        else carregarAlunosPorTurma();
    }
}

function exibirAlunoComJustificativas(data) {
    const aluno = data.aluno;
    const container = safeGet('alunoInfo');
    if (!container) return;
    const hoje = new Date();
    const trintaDiasAtras = new Date();
    trintaDiasAtras.setDate(hoje.getDate() - 30);
    safeGet('consultaDataInicio').value = getDataLocalISO(trintaDiasAtras);
    safeGet('consultaDataFim').value = getDataLocalISO(hoje);
    motivoConsulta = 'todos';
    safeGet('consultaMotivo').value = 'todos';
    container.querySelectorAll('.tipo-card').forEach(c => c.classList.remove('selected'));
    container.querySelector('.tipo-card[data-tipo="todos"]')?.classList.add('selected');
    const fotoEl = safeGet('alunoFoto');
    if (fotoEl) {
        fotoEl.onerror = null;
        fotoEl.src = aluno.fotoPerfil || gerarAvatarSVG(aluno.nome);
        fotoEl.onerror = function () { this.onerror = null; this.src = gerarAvatarSVG(aluno.nome); };
    }
    safeSetText('alunoNome', aluno.nome || '-');
    safeSetText('alunoMatricula', aluno.matricula || 'Não informada');
    safeSetText('alunoTurma', aluno.turma || 'Não informada');
    safeSetText('alunoCurso', aluno.curso || 'Não informado');
    const tagCurso = safeGet('tagCurso');
    if (tagCurso) tagCurso.style.display = aluno.curso ? 'inline-flex' : 'none';
    const statusDiv = safeGet('statusAluno');
    if (statusDiv && data.estatisticas) {
        statusDiv.innerHTML = `<div class="aluno-stats-mini">
            <div class="stat-mini-item"><i class="fas fa-file-alt"></i>
                <div><div class="stat-mini-value">${data.estatisticas.totalJustificativas || 0}</div>
                <div class="stat-mini-label">Total de Justificativas</div></div></div>
            <div class="stat-mini-item"><i class="fas fa-calendar-check"></i>
                <div><div class="stat-mini-value">${data.estatisticas.justificativasUltimos30 || 0}</div>
                <div class="stat-mini-label">Últimos 30 dias</div></div></div>
        </div>`;
    } else if (statusDiv) { statusDiv.innerHTML = ''; }
    container.style.display = 'block';
    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    buscarJustificativasDoAluno();
}

function selecionarMotivoConsulta(motivo) {
    motivoConsulta = motivo;
    safeGet('consultaMotivo').value = motivo;
    const container = safeGet('alunoInfo');
    if (!container) return;
    container.querySelectorAll('.tipo-card').forEach(c => c.classList.remove('selected'));
    container.querySelector(`.tipo-card[data-tipo="${motivo}"]`)?.classList.add('selected');
}

async function buscarJustificativasDoAluno() {
    if (!currentAluno) { notificar('Nenhum aluno selecionado', 'warning'); return; }
    const container = safeGet('listaJustificativasAluno');
    if (!container) return;
    const dataInicio = safeGet('consultaDataInicio')?.value || '';
    const dataFim = safeGet('consultaDataFim')?.value || '';
    const motivo = safeGet('consultaMotivo')?.value || 'todos';
    container.innerHTML = `<div class="text-center py-3"><div class="loading-spinner"></div><p>Buscando justificativas...</p></div>`;
    try {
        const params = new URLSearchParams();
        if (dataInicio) params.append('dataInicio', dataInicio);
        if (dataFim) params.append('dataFim', dataFim);
        if (motivo && motivo !== 'todos') params.append('motivo', motivo);
        const response = await fetch(`/api/secretaria/justificativa/por-aluno/${currentAluno.id}?${params.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` }, cache: 'no-store'
        });
        const data = await response.json();
        if (!data.success) { container.innerHTML = `<div class="alert alert-danger">Erro ao buscar justificativas</div>`; return; }
        const countEl = safeGet('countJustificativas');
        if (countEl) countEl.textContent = data.total || 0;
        const acoesAluno = safeGet('acoesAluno');
        if (acoesAluno) acoesAluno.style.display = data.total > 0 ? 'flex' : 'none';
        if (!data.registros || data.registros.length === 0) {
            container.innerHTML = `<div class="empty-relatorio" style="padding: 40px 20px;">
                <i class="fas fa-inbox"></i><h5>Nenhuma justificativa encontrada</h5>
                <p>Não há registros para este aluno no período selecionado.</p></div>`;
            return;
        }
        container.innerHTML = `
            <div class="justificativas-lista">
                ${data.registros.map(j => {
                    const periodoFalta = getPeriodoFaltaFormatado(j);
                    const tipoProva = getTipoProvaFormatado(j);
                    const dataFormatada = j.dataFormatada || (j.data ? new Date(j.data).toLocaleDateString('pt-BR') : '-');
                    return `<div class="justificativa-item">
                        <div class="justificativa-header-item">
                            <span class="badge-motivo-item">${escapeHTML(j.motivoLabel)}</span>
                            <span class="justificativa-data-item"><i class="fas fa-calendar"></i> ${dataFormatada}</span></div>
                        ${periodoFalta ? `<div class="justificativa-resp-item" style="background: #dbeafe; padding: 6px 10px; border-radius: 6px; margin-top: 6px;">
                            <i class="fas fa-calendar-times" style="color: #1e3c72;"></i>
                            <span><strong>Período da Falta:</strong> ${escapeHTML(periodoFalta)}</span></div>` : ''}
                        ${tipoProva ? `<div class="justificativa-resp-item" style="background: #fef3c7; padding: 6px 10px; border-radius: 6px; margin-top: 6px;">
                            <i class="fas fa-file-alt" style="color: #92400e;"></i>
                            <span><strong>Tipo de Prova:</strong> ${escapeHTML(tipoProva)}</span></div>` : ''}
                        ${j.observacoes ? `<div class="justificativa-obs-item">
                            <i class="fas fa-comment"></i>
                            <span>${escapeHTML(j.observacoes.substring(0, 150))}${j.observacoes.length > 150 ? '...' : ''}</span></div>` : ''}
                        ${j.responsavelNome ? `<div class="justificativa-resp-item">
                            <i class="fas fa-user-shield"></i>
                            <span><strong>${escapeHTML(j.responsavelNome)}</strong></span></div>` : ''}
                        <div class="justificativa-footer-item">
                            <div class="footer-left-check">
                                <label class="check-visto-wrapper" title="${j.vistoSecretaria ? 'Visto por ' + escapeHTML(j.vistoSecretariaPorNome || '') : 'Marcar como visto'}">
                                    <input type="checkbox" class="check-visto-justificativa" data-id="${j.id}"
                                           ${j.vistoSecretaria ? 'checked' : ''}
                                           onchange="toggleVistoJustificativa('${j.id}', this.checked)">
                                    <span class="check-visto-label">
                                        <i class="fas fa-check-circle"></i>
                                        ${j.vistoSecretaria ? 'Visto' : 'Marcar como visto'}
                                    </span>
                                </label>
                            </div>
                            <span class="badge-assinatura-item ${j.temAssinatura ? 'assinado' : 'pendente'}">
                                <i class="fas fa-signature"></i>
                                ${j.temAssinatura ? 'Assinado' : 'Sem assinatura'}
                            </span>
                            <div class="justificativa-actions-item">
                                <button class="btn-action-item btn-view-item" onclick="verJustificativa('${j.id}')" title="Visualizar">
                                    <i class="fas fa-eye"></i></button>
                                <button class="btn-action-item btn-print-item" onclick="imprimirJustificativa('${j.id}')" title="Imprimir">
                                    <i class="fas fa-print"></i></button>
                            </div>
                        </div>
                    </div>`;
                }).join('')}
            </div>`;
    } catch (error) {
        container.innerHTML = `<div class="alert alert-danger">Erro ao buscar justificativas</div>`;
    }
}

function limparAlunoSelecionado() {
    currentAluno = null;
    motivoConsulta = 'todos';
    const info = safeGet('alunoInfo');
    if (info) info.style.display = 'none';
    if (modoAtual === 'automatico') {
        reiniciarScannerAutomatico();
    } else if (modoAtual === 'manual') {
        const selectTurma = safeGet('filtroTurmaManual');
        const inputBusca = safeGet('filtroBuscaManual');
        if (selectTurma) selectTurma.value = '';
        if (inputBusca) inputBusca.value = '';
        const lista = safeGet('listaAlunosManual');
        if (lista) lista.innerHTML = `<div class="empty-state-mini"><i class="fas fa-users"></i><p>Selecione uma turma para ver os alunos</p></div>`;
    }
}

// ✅ VISTO
async function toggleVistoJustificativa(id, marcado) {
    if (!id) return;
    try {
        const response = await fetch(`/api/secretaria/justificativa/${id}/visto`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ visto: !!marcado })
        });
        const data = await response.json();
        if (!data.success) {
            notificar('Erro ao atualizar', 'error');
            const check = document.querySelector(`.check-visto-justificativa[data-id="${id}"]`);
            if (check) check.checked = !marcado;
            return;
        }
        const check = document.querySelector(`.check-visto-justificativa[data-id="${id}"]`);
        if (check) {
            const label = check.nextElementSibling;
            if (label) label.innerHTML = marcado
                ? '<i class="fas fa-check-circle"></i> Visto'
                : '<i class="fas fa-check-circle"></i> Marcar como visto';
        }
        notificar(marcado ? '✅ Marcado como visto' : '↩️ Desmarcado', marcado ? 'success' : 'info', 2000);
    } catch (error) { notificar('Erro ao atualizar', 'error'); }
}

async function marcarComoVistoAutomatico(id) {
    if (!id) return;
    try {
        const response = await fetch(`/api/secretaria/justificativa/${id}/visto`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ visto: true })
        });
        const data = await response.json();
        if (data.success) {
            const check = document.querySelector(`.check-visto-justificativa[data-id="${id}"]`);
            if (check) {
                check.checked = true;
                const label = check.nextElementSibling;
                if (label) label.innerHTML = '<i class="fas fa-check-circle"></i> Visto';
            }
        }
    } catch (error) { /* silencioso */ }
}

async function marcarTodasVisiveisComoVistas() {
    const checkboxes = document.querySelectorAll('.check-visto-justificativa:not(:checked)');
    if (checkboxes.length === 0) { notificar('Todas já estão marcadas como vistas', 'info'); return; }
    const ids = Array.from(checkboxes).map(c => c.getAttribute('data-id'));
    try {
        const response = await fetch('/api/secretaria/justificativa/marcar-vistos-lote', {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids })
        });
        const data = await response.json();
        if (data.success) {
            checkboxes.forEach(check => {
                check.checked = true;
                const label = check.nextElementSibling;
                if (label) label.innerHTML = '<i class="fas fa-check-circle"></i> Visto';
            });
            notificar(`✅ ${data.modificados} justificativas marcadas como vistas`, 'success');
        } else { notificar('Erro ao marcar em lote', 'error'); }
    } catch (error) { notificar('Erro ao marcar em lote', 'error'); }
}

// ============================================
// VISUALIZAR JUSTIFICATIVA
// ============================================
async function verJustificativa(id) {
    if (!id) return;
    try {
        const response = await fetch(`/api/secretaria/justificativa/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }, cache: 'no-store'
        });
        const data = await response.json();
        if (!data.success || !data.autorizacao) { notificar('Erro ao carregar justificativa', 'error'); return; }
        const a = data.autorizacao;
        const periodoFalta = getPeriodoFaltaFormatado(a);
        const tipoProva = getTipoProvaFormatado(a);
        const old = safeGet('modalVerJustificativa');
        if (old) old.remove();
        const modalHtml = `
            <div class="modal fade" id="modalVerJustificativa" tabindex="-1">
                <div class="modal-dialog modal-lg modal-dialog-scrollable">
                    <div class="modal-content">
                        <div class="modal-header modal-header-success">
                            <h5 class="modal-title"><i class="fas fa-file-alt"></i> Detalhes da Justificativa</h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="modal-aluno-header">
                                <img src="${gerarAvatarSVG(a.alunoNome)}" alt="">
                                <div class="modal-aluno-info">
                                    <h5>${escapeHTML(a.alunoNome)}</h5>
                                    <small><i class="fas fa-id-card"></i> ${escapeHTML(a.alunoMatricula || '-')} • 
                                    <i class="fas fa-graduation-cap"></i> ${escapeHTML(a.alunoTurma || '-')}
                                    ${a.alunoCurso ? ` • ${escapeHTML(a.alunoCurso)}` : ''}</small>
                                </div>
                                <span class="badge-motivo-modal">${escapeHTML(a.motivoLabel)}</span>
                            </div>
                            <div class="modal-detail-row"><strong><i class="fas fa-calendar"></i> Data do Registro:</strong>
                                <span>${a.dataFormatada || '-'}</span></div>
                            ${periodoFalta ? `<div class="modal-detail-row" style="background: #dbeafe; padding: 10px; border-radius: 8px; margin-top: 8px;">
                                <strong><i class="fas fa-calendar-times"></i> Período da Falta:</strong>
                                <span style="font-weight: 600; color: #1e3c72;">${escapeHTML(periodoFalta)}</span></div>` : ''}
                            ${tipoProva ? `<div class="modal-detail-row" style="background: #fef3c7; padding: 10px; border-radius: 8px; margin-top: 8px;">
                                <strong><i class="fas fa-file-alt"></i> Tipo de Prova Perdida:</strong>
                                <span style="font-weight: 600; color: #92400e;">${escapeHTML(tipoProva)}</span></div>` : ''}
                            ${a.observacoes ? `<div class="modal-section"><h6><i class="fas fa-comment"></i> Observações</h6><p>${escapeHTML(a.observacoes)}</p></div>` : ''}
                            ${a.responsavelNome ? `<div class="modal-section"><h6><i class="fas fa-user-shield"></i> Responsável</h6>
                                <p><strong>Nome:</strong> ${escapeHTML(a.responsavelNome)}</p>
                                ${a.responsavelCPF ? `<p><strong>CPF:</strong> ${escapeHTML(a.responsavelCPF)}</p>` : ''}
                                ${a.responsavelTelefone ? `<p><strong>Telefone:</strong> ${escapeHTML(a.responsavelTelefone)}</p>` : ''}</div>` : ''}
                            ${a.temAssinatura ? `<div class="modal-section"><h6><i class="fas fa-signature"></i> Assinatura Digital</h6>
                                <div class="modal-assinatura-preview"><img src="${a.assinaturaBase64}" alt="Assinatura"></div></div>` : ''}
                            <div class="modal-detail-row"><strong><i class="fas fa-user-tie"></i> Registrado por:</strong>
                                <span>${escapeHTML(a.registradoPorNome || '-')}</span></div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn-modal btn-modal-secondary" data-bs-dismiss="modal">
                                <i class="fas fa-times"></i> Fechar</button>
                            <button type="button" class="btn-modal btn-modal-success" onclick="imprimirJustificativa('${a.id}')">
                                <i class="fas fa-print"></i> Imprimir</button>
                        </div>
                    </div>
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        if (typeof bootstrap === 'undefined') { notificar('Erro: Bootstrap não carregado', 'error'); return; }
        new bootstrap.Modal(safeGet('modalVerJustificativa')).show();
        marcarComoVistoAutomatico(id);
    } catch (error) { notificar('Erro ao carregar justificativa', 'error'); }
}

// ============================================
// IMPRIMIR JUSTIFICATIVA
// ============================================
async function imprimirJustificativa(id) {
    if (!id) return;
    try {
        const response = await fetch(`/api/secretaria/justificativa/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }, cache: 'no-store'
        });
        const data = await response.json();
        if (!data.success || !data.autorizacao) { notificar('Erro ao carregar justificativa', 'error'); return; }
        const a = data.autorizacao;
        let qr = '';
        try {
            const qrR = await fetch(`/api/aluno/qrcode/${a.alunoId}`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (qrR.ok) {
                const qrD = await qrR.json();
                if (qrD.success && qrD.qrCode) qr = qrD.qrCode;
            }
        } catch (e) { /* sem QR */ }
        const win = window.open('', '_blank');
        win.document.write(gerarHTMLImpressao(a, qr));
        win.document.close();
        win.onload = () => setTimeout(() => { win.print(); marcarComoVistoAutomatico(id); }, 500);
    } catch (error) { notificar('Erro ao imprimir', 'error'); }
}

function gerarHTMLImpressao(a, qrCodeUrl) {
    const logo = '/uploads/logo-iema.png';
    const carimbo = '/icons/assinatura_secretaria.ico';
    const dataGeracao = new Date().toLocaleString('pt-BR');
    const periodoFalta = getPeriodoFaltaFormatado(a);
    const tipoProva = getTipoProvaFormatado(a);
    const dataFormatada = a.dataFormatada || (a.data ? new Date(a.data).toLocaleDateString('pt-BR') : '-');

    return `<!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <title>Justificativa - ${escapeHTML(a.alunoNome)}</title>
        <style>
            @page { size: A4 portrait; margin: 8mm; }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: 'Times New Roman', Times, serif; font-size: 9.5pt; line-height: 1.25; color: #000; }
            .header { text-align: center; border-bottom: 1.5px double #000; padding-bottom: 4px; margin-bottom: 6px; }
            .header img { max-width: 100%; max-height: 14mm; object-fit: contain; display: block; margin: 0 auto 2px; }
            .header h1 { font-size: 10pt; text-transform: uppercase; font-weight: bold; margin: 2px 0 0; }
            .header p { font-size: 8pt; margin: 1px 0 0; }
            .titulo { text-align: center; font-size: 11pt; font-weight: bold; background: #d1fae5; padding: 4px 8px; border: 1.5px solid #000; margin: 6px 0 3px; text-transform: uppercase; }
            .aluno-box { display: flex; align-items: center; gap: 8px; padding: 5px 8px; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 5px; margin-bottom: 6px; }
            .aluno-foto { width: 38px; height: 38px; border-radius: 50%; object-fit: cover; border: 1.5px solid #10b981; flex-shrink: 0; }
            .aluno-info { flex: 1; }
            .aluno-nome { font-size: 10pt; font-weight: bold; color: #059669; margin-bottom: 1px; }
            .aluno-detalhes { font-size: 8pt; color: #374151; }
            .section-title { font-size: 9pt; font-weight: bold; background: #e8e8e8; padding: 2px 6px; border-left: 3px solid #10b981; margin: 5px 0 3px; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 3px 12px; margin: 3px 0 5px; font-size: 8.5pt; }
            .info-item { display: flex; gap: 4px; }
            .info-label { font-weight: bold; white-space: nowrap; }
            .motivo-box { background: #f5f5f5; border: 1px solid #000; padding: 5px 8px; margin: 5px 0; border-radius: 4px; }
            .motivo-box strong { font-size: 9pt; }
            .motivo-box p { margin: 3px 0 0; font-size: 9.5pt; font-weight: bold; }
            .destaque-box { background: #dbeafe; border: 1px solid #1e3c72; padding: 6px 10px; margin: 5px 0; border-radius: 4px; text-align: center; }
            .destaque-box .label { font-size: 8pt; color: #1e3c72; text-transform: uppercase; font-weight: bold; }
            .destaque-box .value { font-size: 11pt; color: #1e3c72; font-weight: bold; margin-top: 2px; }
            .destaque-box-prova { background: #fef3c7; border: 1px solid #f59e0b; padding: 6px 10px; margin: 5px 0; border-radius: 4px; text-align: center; }
            .destaque-box-prova .label { font-size: 8pt; color: #92400e; text-transform: uppercase; font-weight: bold; }
            .destaque-box-prova .value { font-size: 11pt; color: #92400e; font-weight: bold; margin-top: 2px; }
            .descricao-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 4px; padding: 5px 8px; font-size: 8.5pt; line-height: 1.3; min-height: 30px; max-height: 80px; overflow: hidden; word-wrap: break-word; }
            .assinaturas { display: flex; justify-content: space-around; margin-top: 15px; gap: 15px; }
            .assinatura { flex: 1; text-align: center; font-size: 8pt; position: relative; }
            .assinatura-container { position: relative; border-bottom: 1px solid #000; min-height: 14mm; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 2px; }
            .assinatura-img { max-height: 12mm; max-width: 100%; object-fit: contain; position: relative; z-index: 1; }
            .carimbo-overlay { max-height: 13mm; max-width: 55%; object-fit: contain; opacity: 0.85; position: relative; z-index: 2; }
            .assinatura-linha { padding-top: 2px; font-size: 8pt; margin-top: 2px; }
            .qr-code { text-align: center; margin-top: 6px; }
            .qr-code img { width: 25mm; height: 25mm; border: 1.5px solid #000; padding: 2px; display: block; margin: 0 auto; }
            .qr-code p { font-size: 8pt; margin: 3px 0 0 0; color: #444; font-weight: bold; }
            .footer { text-align: center; margin-top: 5px; padding-top: 3px; border-top: 1px solid #ccc; font-size: 6.5pt; color: #666; }
            .footer p { margin: 1px 0; }
            .btn-print { display: block; margin: 10px auto; padding: 8px 20px; background: #10b981; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 12px; font-family: Arial, sans-serif; }
            @media print { .no-print { display: none !important; } body { padding: 0; } }
        </style>
    </head>
    <body>
        <button class="btn-print no-print" onclick="window.print()">🖨️ Imprimir</button>
        <div class="header">
            <img src="${logo}" alt="IEMA" onerror="this.style.display='none'">
            <h1>IEMA Pleno: São Luís - Centro</h1>
            <p>Sistema de Atendimentos — Secretaria</p>
        </div>
        <div class="titulo">📋 Justificativa de Falta</div>
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
        <div class="section-title">📌 Dados do Registro</div>
        <div class="info-grid">
            <div class="info-item"><span class="info-label">Data:</span><span>${dataFormatada}</span></div>
            <div class="info-item"><span class="info-label">Registrado por:</span><span>${escapeHTML(a.registradoPorNome || '-')}</span></div>
        </div>
        ${periodoFalta ? `<div class="section-title">📆 Período da Falta</div>
            <div class="destaque-box"><div class="label">Período da Falta Justificada</div>
            <div class="value">${escapeHTML(periodoFalta)}</div></div>` : ''}
        ${tipoProva ? `<div class="section-title">📝 Tipo de Prova Perdida</div>
            <div class="destaque-box-prova"><div class="label">Tipo de Prova</div>
            <div class="value">${escapeHTML(tipoProva)}</div></div>` : ''}
        <div class="motivo-box"><strong>📌 Motivo:</strong><p>☑ ${escapeHTML(a.motivoLabel || '-')}</p></div>
        ${a.responsavelNome ? `<div class="section-title">👤 Responsável</div>
            <div class="descricao-box"><strong>Nome:</strong> ${escapeHTML(a.responsavelNome)}
            ${a.responsavelCPF ? ` • <strong>CPF:</strong> ${escapeHTML(a.responsavelCPF)}` : ''}
            ${a.responsavelTelefone ? ` • <strong>Telefone:</strong> ${escapeHTML(a.responsavelTelefone)}` : ''}</div>` : ''}
        ${a.observacoes ? `<div class="section-title">💬 Observações</div>
            <div class="descricao-box">${escapeHTML(a.observacoes).replace(/\n/g, '<br>')}</div>` : ''}
        <div class="assinaturas">
            <div class="assinatura">
                <div class="assinatura-container">
                    ${a.assinaturaBase64 ? `<img class="assinatura-img" src="${a.assinaturaBase64}" alt="Assinatura">` : ''}
                </div>
                <div class="assinatura-linha">Assinatura do Responsável</div>
            </div>
            <div class="assinatura">
                <div class="assinatura-container">
                    <img class="carimbo-overlay" src="${carimbo}" alt="Carimbo" onerror="this.style.display='none'">
                </div>
                <div class="assinatura-linha">Secretaria</div>
            </div>
        </div>
        ${qrCodeUrl ? `<div class="qr-code"><img src="${qrCodeUrl}" alt="QR Code"><p>Identificação do Aluno</p></div>` : ''}
        <div class="footer"><p>Documento gerado em <strong>${dataGeracao}</strong> — EducaPleno — Secretaria</p></div>
    </body>
    </html>`;
}

// ============================================
// BUSCA POR DATA
// ============================================
async function buscarPorData() {
    const dataInicio = safeGet('filtroDataInicio')?.value || '';
    const dataFim = safeGet('filtroDataFim')?.value || dataInicio;
    const turma = safeGet('filtroDataTurma')?.value || '';
    const curso = safeGet('filtroDataCurso')?.value || '';
    const nome = safeGet('filtroDataNome')?.value?.trim() || '';
    const motivo = safeGet('filtroDataMotivo')?.value || '';

    if (!dataInicio) { notificar('Informe a data de início', 'warning'); return; }
    if (dataFim && dataFim < dataInicio) { notificar('Data final não pode ser anterior à inicial', 'warning'); return; }

    const container = safeGet('listaJustificativasData');
    if (!container) return;
    container.innerHTML = `<div class="text-center py-3"><div class="loading-spinner"></div><p>Buscando justificativas...</p></div>`;

    try {
        const params = new URLSearchParams();
        params.append('dataInicio', dataInicio);
        if (dataFim) params.append('dataFim', dataFim);
        if (turma) params.append('turma', turma);
        if (curso) params.append('curso', curso);
        if (nome) params.append('nome', nome);
        if (motivo) params.append('motivo', motivo);

        const response = await fetch(`/api/secretaria/justificativa/por-data?${params.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` }, cache: 'no-store'
        });
        const data = await response.json();

        if (!data.success) { container.innerHTML = `<div class="alert alert-danger">Erro ao buscar</div>`; return; }

        resultadosPorData = data.registros || [];
        const countEl = safeGet('countJustificativasData');
        if (countEl) countEl.textContent = data.total || 0;
        const acoes = safeGet('acoesData');
        if (acoes) acoes.style.display = resultadosPorData.length > 0 ? 'flex' : 'none';

        if (resultadosPorData.length === 0) {
            container.innerHTML = `<div class="empty-relatorio" style="padding: 40px 20px;">
                <i class="fas fa-inbox"></i><h5>Nenhuma justificativa encontrada</h5>
                <p>Não há registros no período selecionado com os filtros aplicados.</p></div>`;
            return;
        }

        const porData = {};
        resultadosPorData.forEach(r => {
            const periodoFalta = getPeriodoFaltaFormatado(r);
            const key = periodoFalta || r.dataFormatada || 'Sem data';
            if (!porData[key]) porData[key] = [];
            porData[key].push(r);
        });

        const datasOrdenadas = Object.keys(porData).sort((a, b) => {
            const extrairData = (s) => {
                const match = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
                if (match) return new Date(`${match[3]}-${match[2]}-${match[1]}`);
                return new Date(0);
            };
            return extrairData(b) - extrairData(a);
        });

        let html = '';
        datasOrdenadas.forEach(dataKey => {
            const registros = porData[dataKey];
            html += `<div class="data-group">
                <div class="data-group-header">
                    <i class="fas fa-calendar-check"></i>
                    <strong>${escapeHTML(dataKey)}</strong>
                    <span class="badge-count-verde">${registros.length}</span>
                </div>
                <div class="justificativas-lista">
                    ${registros.map(j => {
                        const dataFormatada = j.dataFormatada || (j.data ? new Date(j.data).toLocaleDateString('pt-BR') : '-');
                        const tipoProva = getTipoProvaFormatado(j);
                        return `<div class="justificativa-item">
                            <div class="justificativa-header-item">
                                <span class="badge-motivo-item">${escapeHTML(j.motivoLabel)}</span>
                                <span class="justificativa-data-item"><i class="fas fa-user-graduate"></i> ${escapeHTML(j.alunoNome)}</span>
                            </div>
                            <div class="justificativa-resp-item">
                                <i class="fas fa-graduation-cap"></i>
                                <span><strong>${escapeHTML(j.alunoTurma || '-')}</strong> 
                                ${j.alunoCurso ? ' • ' + escapeHTML(j.alunoCurso) : ''}</span>
                            </div>
                            ${tipoProva ? `<div class="justificativa-resp-item" style="background: #fef3c7; padding: 4px 8px; border-radius: 6px; margin-top: 4px; font-size: 0.85em;">
                                <i class="fas fa-file-alt" style="color: #92400e;"></i>
                                <span><strong>Tipo:</strong> ${escapeHTML(tipoProva)}</span></div>` : ''}
                            ${j.observacoes ? `<div class="justificativa-obs-item">
                                <i class="fas fa-comment"></i>
                                <span>${escapeHTML(j.observacoes.substring(0, 150))}${j.observacoes.length > 150 ? '...' : ''}</span></div>` : ''}
                            ${j.responsavelNome ? `<div class="justificativa-resp-item">
                                <i class="fas fa-user-shield"></i>
                                <span><strong>${escapeHTML(j.responsavelNome)}</strong></span></div>` : ''}
                            <div class="justificativa-footer-item">
                                <div class="footer-left-check">
                                    <label class="check-visto-wrapper" title="${j.vistoSecretaria ? 'Visto por ' + escapeHTML(j.vistoSecretariaPorNome || '') : 'Marcar como visto'}">
                                        <input type="checkbox" class="check-visto-justificativa" data-id="${j.id}"
                                               ${j.vistoSecretaria ? 'checked' : ''}
                                               onchange="toggleVistoJustificativa('${j.id}', this.checked)">
                                        <span class="check-visto-label">
                                            <i class="fas fa-check-circle"></i>
                                            ${j.vistoSecretaria ? 'Visto' : 'Marcar como visto'}
                                        </span>
                                    </label>
                                </div>
                                <span class="badge-assinatura-item ${j.temAssinatura ? 'assinado' : 'pendente'}">
                                    <i class="fas fa-signature"></i>
                                    ${j.temAssinatura ? 'Assinado' : 'Sem assinatura'}
                                </span>
                                <div class="justificativa-actions-item">
                                    <button class="btn-action-item btn-view-item" onclick="verJustificativa('${j.id}')" title="Visualizar">
                                        <i class="fas fa-eye"></i></button>
                                    <button class="btn-action-item btn-print-item" onclick="imprimirJustificativa('${j.id}')" title="Imprimir">
                                        <i class="fas fa-print"></i></button>
                                </div>
                            </div>
                        </div>`;
                    }).join('')}
                </div>
            </div>`;
        });
        container.innerHTML = html;
    } catch (error) {
        container.innerHTML = `<div class="alert alert-danger">Erro ao buscar</div>`;
    }
}

function exportarCSVData() {
    if (!resultadosPorData || resultadosPorData.length === 0) { notificar('Nenhum dado para exportar', 'warning'); return; }
    let csv = "Data Registro,Período da Falta,Tipo de Prova,Aluno,Matrícula,Turma,Curso,Motivo,Observações,Responsável,Visto\n";
    resultadosPorData.forEach(a => {
        const periodoFalta = getPeriodoFaltaFormatado(a) || '';
        const tipoProva = getTipoProvaFormatado(a) || '';
        csv += [
            a.dataFormatada || '',
            `"${periodoFalta.replace(/"/g, '""')}"`,
            `"${tipoProva.replace(/"/g, '""')}"`,
            `"${(a.alunoNome || '').replace(/"/g, '""')}"`,
            `"${(a.alunoMatricula || '').replace(/"/g, '""')}"`,
            `"${(a.alunoTurma || '').replace(/"/g, '""')}"`,
            `"${(a.alunoCurso || '').replace(/"/g, '""')}"`,
            `"${(a.motivoLabel || '').replace(/"/g, '""')}"`,
            `"${(a.observacoes || '').replace(/"/g, '""')}"`,
            `"${(a.responsavelNome || '').replace(/"/g, '""')}"`,
            `"${a.vistoSecretaria ? 'Sim' : 'Não'}"`
        ].join(',') + '\n';
    });
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `justificativas-data_${getDataLocalISO()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    notificar('✅ CSV exportado!', 'success');
}

function exportarPDFData() {
    if (!resultadosPorData || resultadosPorData.length === 0) { notificar('Nenhum dado para exportar', 'warning'); return; }
    const dataInicio = safeGet('filtroDataInicio')?.value || '';
    const dataFim = safeGet('filtroDataFim')?.value || dataInicio;
    const turma = safeGet('filtroDataTurma')?.value || 'Todas';
    const curso = safeGet('filtroDataCurso')?.value || 'Todos';
    const nome = safeGet('filtroDataNome')?.value?.trim() || '';
    const motivo = safeGet('filtroDataMotivo')?.value || 'Todos';
    const fmtBR = (s) => { if (!s) return '-'; const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };
    const logo = '/uploads/logo-iema.png';
    const carimbo = '/icons/assinatura_secretaria.ico';
    const dataGeracao = new Date().toLocaleString('pt-BR');

    const html = `<!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <title>Justificativas por Data</title>
        <style>
            @page { size: A4 portrait; margin: 10mm; }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: 'Times New Roman', serif; font-size: 10pt; line-height: 1.3; }
            .header { text-align: center; border-bottom: 1.5px solid #000; padding-bottom: 5px; margin-bottom: 10px; }
            .header img { max-height: 16mm; object-fit: contain; display: block; margin: 0 auto 3px; }
            .header h1 { font-size: 12pt; text-transform: uppercase; }
            .header p { font-size: 9pt; margin-top: 3px; }
            .titulo { text-align: center; font-size: 12pt; font-weight: bold; background: #d1fae5; padding: 6px; border: 1.5px solid #000; margin: 10px 0; text-transform: uppercase; }
            .filtros { text-align: center; font-size: 9pt; margin-bottom: 12px; color: #333; }
            .filtros span { margin: 0 10px; display: inline-block; }
            table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
            th { background: #10b981; color: white; padding: 5px; text-align: left; border: 1px solid #059669; }
            td { padding: 4px 5px; border: 1px solid #ccc; vertical-align: top; }
            tr:nth-child(even) { background: #f5f5f5; }
            .assinaturas { display: flex; justify-content: center; margin-top: 30px; }
            .assinatura { flex: 0 0 60%; text-align: center; }
            .assinatura-container { position: relative; border-bottom: 1px solid #000; min-height: 15mm; display: flex; align-items: flex-end; justify-content: center; }
            .carimbo-overlay { position: absolute; bottom: 1mm; left: 50%; transform: translateX(-50%); max-height: 15mm; max-width: 55mm; opacity: 0.9; }
            .assinatura-linha { padding-top: 3px; font-size: 9pt; }
            .footer { text-align: center; margin-top: 15px; padding-top: 5px; border-top: 1px solid #ccc; font-size: 7.5pt; color: #555; }
            .btn-print { display: block; margin: 15px auto; padding: 10px 24px; background: #10b981; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; font-family: Arial; }
            @media print { .no-print { display: none !important; } }
        </style>
    </head>
    <body>
        <button class="btn-print no-print" onclick="window.print()">🖨️ Imprimir</button>
        <div class="header">
            <img src="${logo}" alt="IEMA" onerror="this.style.display='none'">
            <h1>IEMA Pleno: São Luís - Centro</h1>
            <p>Sistema de Atendimentos — Secretaria</p>
        </div>
        <div class="titulo">📋 Justificativas por Data</div>
        <div class="filtros">
            <span><strong>Período:</strong> ${fmtBR(dataInicio)}${dataFim && dataFim !== dataInicio ? ' a ' + fmtBR(dataFim) : ''}</span>
            <span><strong>Turma:</strong> ${escapeHTML(turma)}</span>
            <span><strong>Curso:</strong> ${escapeHTML(curso)}</span>
            ${nome ? `<span><strong>Nome:</strong> ${escapeHTML(nome)}</span>` : ''}
            <span><strong>Motivo:</strong> ${escapeHTML(motivo)}</span>
            <span><strong>Total:</strong> ${resultadosPorData.length}</span>
        </div>
        <table>
            <thead><tr>
                <th style="width:70px;">Data Reg.</th>
                <th style="width:90px;">Período Falta</th>
                <th style="width:70px;">Tipo Prova</th>
                <th>Aluno</th>
                <th style="width:60px;">Turma</th>
                <th style="width:100px;">Motivo</th>
                <th>Observações</th>
                <th style="width:40px;">Visto</th>
            </tr></thead>
            <tbody>
                ${resultadosPorData.map(a => {
                    const periodoFalta = getPeriodoFaltaFormatado(a) || '-';
                    const tipoProva = getTipoProvaFormatado(a) || '-';
                    return `<tr>
                        <td>${a.dataFormatada || '-'}</td>
                        <td><strong style="color: #1e3c72;">${escapeHTML(periodoFalta)}</strong></td>
                        <td>${escapeHTML(tipoProva)}</td>
                        <td><strong>${escapeHTML(a.alunoNome || '')}</strong><br><small>${escapeHTML(a.alunoMatricula || '')}</small></td>
                        <td>${escapeHTML(a.alunoTurma || '-')}</td>
                        <td>${escapeHTML(a.motivoLabel || '')}</td>
                        <td>${escapeHTML((a.observacoes || '').substring(0, 100))}</td>
                        <td style="text-align:center; font-weight:bold; color:${a.vistoSecretaria ? '#10b981' : '#999'};">${a.vistoSecretaria ? '✓' : '—'}</td>
                    </tr>`;
                }).join('')}
            </tbody>
        </table>
        <div class="assinaturas">
            <div class="assinatura">
                <div class="assinatura-container">
                    <img class="carimbo-overlay" src="${carimbo}" alt="Carimbo" onerror="this.style.display='none'">
                </div>
                <div class="assinatura-linha">Secretaria</div>
            </div>
        </div>
        <div class="footer"><p>Relatório gerado em <strong>${dataGeracao}</strong> — EducaPleno — Secretaria</p></div>
    </body>
    </html>`;
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.onload = () => setTimeout(() => win.print(), 500);
}

// ============================================
// AUTOCOMPLETE RELATÓRIO
// ============================================
function configurarAutocompleteRelatorio() {
    if (!autocompleteState.carregado && !autocompleteState.carregando) carregarAlunosParaAutocomplete();
}

async function carregarAlunosParaAutocomplete() {
    autocompleteState.carregando = true;
    try {
        const turmasResponse = await fetch('/api/secretaria/justificativa/turmas', { headers: { 'Authorization': `Bearer ${token}` } });
        const turmasData = await turmasResponse.json();
        if (!turmasData.success) { autocompleteState.carregando = false; return; }
        const todosAlunos = [];
        for (const turma of turmasData.turmas) {
            try {
                const res = await fetch(`/api/secretaria/justificativa/alunos-por-turma?turma=${encodeURIComponent(turma)}`, { headers: { 'Authorization': `Bearer ${token}` } });
                const data = await res.json();
                if (data.success && data.alunos) {
                    data.alunos.forEach(a => todosAlunos.push({ id: a.id, nome: a.nome, matricula: a.matricula || '', turma: a.turma || turma, curso: a.curso || '' }));
                }
            } catch (e) { /* ignora */ }
        }
        todosAlunos.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
        autocompleteState.alunos = todosAlunos;
        autocompleteState.carregado = true;
        autocompleteState.carregando = false;
    } catch (error) { autocompleteState.carregando = false; }
}

function filtrarAutocompleteRelatorio(termo) {
    const listEl = safeGet('autocompleteAlunoList');
    if (!listEl) return;
    if (!autocompleteState.carregado) {
        listEl.innerHTML = '<div style="padding:15px;text-align:center;color:#6b7280;">Carregando...</div>';
        listEl.style.display = 'block';
        carregarAlunosParaAutocomplete().then(() => { if (autocompleteState.carregado) filtrarAutocompleteRelatorio(termo); });
        return;
    }
    const termoLower = termo.toLowerCase();
    const filtrados = autocompleteState.alunos.filter(a =>
        (a.nome || '').toLowerCase().includes(termoLower) ||
        (a.matricula || '').toLowerCase().includes(termoLower)
    ).slice(0, 10);
    if (filtrados.length === 0) {
        listEl.innerHTML = '<div style="padding:15px;text-align:center;color:#6b7280;">Nenhum aluno encontrado</div>';
        listEl.style.display = 'block';
        return;
    }
    listEl.innerHTML = filtrados.map((aluno, index) => `
        <div class="autocomplete-item" data-index="${index}" style="padding:10px 14px;border-bottom:1px solid #f3f4f6;cursor:pointer;">
            <div style="font-weight:600;font-size:0.9rem;color:#1f2937;">${destacarTermo(aluno.nome, termo)}</div>
            <div style="font-size:0.78rem;color:#6b7280;margin-top:2px;">
                ${escapeHTML(aluno.turma || 'Sem turma')}${aluno.matricula ? ' • ' + escapeHTML(aluno.matricula) : ''}
            </div>
        </div>`).join('');
    listEl.querySelectorAll('.autocomplete-item').forEach((item, i) => {
        item.addEventListener('click', () => {
            const aluno = filtrados[i];
            safeGet('buscaAlunoRelatorio').value = aluno.nome;
            safeGet('filtroAluno').value = aluno.id;
            const infoEl = safeGet('alunoSelecionadoInfo');
            if (infoEl) {
                const mat = aluno.matricula ? ` • ${aluno.matricula}` : '';
                infoEl.innerHTML = `✅ <strong>${escapeHTML(aluno.nome)}</strong>${mat} — Turma ${escapeHTML(aluno.turma || '-')}`;
                infoEl.style.color = '#059669';
            }
            listEl.style.display = 'none';
        });
    });
    listEl.style.display = 'block';
}

function destacarTermo(texto, termo) {
    if (!texto) return '';
    if (!termo) return escapeHTML(texto);
    const regex = new RegExp(`(${escapeRegex(termo)})`, 'gi');
    return escapeHTML(texto).replace(regex, '<mark style="background:#fef08a;padding:0 2px;border-radius:3px;">$1</mark>');
}

// ============================================
// RELATÓRIOS
// ============================================
async function carregarRelatorio() {
    const tipo = safeGet('tipoRelatorio')?.value;
    if (!tipo) { notificar('Selecione o tipo de relatório', 'warning'); return; }
    const dataInicio = safeGet('dataInicio')?.value || '';
    const dataFim = safeGet('dataFim')?.value || '';
    let url = '';
    if (tipo === 'geral') {
        url = `/api/secretaria/justificativa/relatorio/geral?`;
        if (dataInicio) url += `dataInicio=${dataInicio}&`;
        if (dataFim) url += `dataFim=${dataFim}&`;
    } else if (tipo === 'turma') {
        const turma = safeGet('filtroTurma')?.value;
        if (!turma) { notificar('Selecione uma turma', 'warning'); return; }
        url = `/api/secretaria/justificativa/relatorio/turma/${encodeURIComponent(turma)}?`;
        if (dataInicio) url += `dataInicio=${dataInicio}&`;
        if (dataFim) url += `dataFim=${dataFim}&`;
    } else if (tipo === 'aluno') {
        const alunoId = safeGet('filtroAluno')?.value;
        if (!alunoId) { notificar('Selecione um aluno', 'warning'); return; }
        url = `/api/secretaria/justificativa/relatorio/aluno/${alunoId}?`;
        if (dataInicio) url += `dataInicio=${dataInicio}&`;
        if (dataFim) url += `dataFim=${dataFim}&`;
    }
    try {
        const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` }, cache: 'no-store' });
        const data = await response.json();
        if (data.success) {
            relatorioAtual = data;
            tipoRelatorioAtual = tipo;
            exibirRelatorio(data, tipo);
            safeGet('btnExportarCSV').disabled = false;
            safeGet('btnExportarPDF').disabled = false;
            if ((data.totalRegistros || 0) === 0) notificar('⚠️ Nenhum registro encontrado', 'warning');
        } else { notificar('Erro: ' + (data.error || ''), 'error'); }
    } catch (error) { notificar('Erro ao gerar relatório', 'error'); }
}

function exibirRelatorio(data, tipo) {
    const container = safeGet('resultadoRelatorio');
    if (!container) return;
    if (tipo === 'geral') {
        container.innerHTML = `<div class="relatorio-resultado">
            <h4><i class="fas fa-chart-bar"></i> Relatório Geral de Justificativas</h4>
            <p class="relatorio-total">Total: <strong>${data.totalRegistros || 0}</strong></p>
            <h5><i class="fas fa-tags"></i> Por Motivo</h5>
            <div class="row">${(data.porMotivo || []).map(m => `<div class="col-md-4 mb-2">
                <div class="stat-card-verde"><strong>${escapeHTML(m.label)}</strong><span>${m.count}</span></div>
            </div>`).join('')}</div>
            <h5><i class="fas fa-users"></i> Por Turma</h5>
            <div class="table-responsive"><table class="table table-sm">
                <thead><tr><th>Turma</th><th>Total</th><th>Alunos</th></tr></thead>
                <tbody>${(data.porTurma || []).map(t => `<tr>
                    <td>${escapeHTML(t.turma)}</td>
                    <td><span class="badge bg-success">${t.total}</span></td>
                    <td>${t.totalAlunos}</td></tr>`).join('')}
                </tbody></table></div>
        </div>`;
    } else if (tipo === 'turma') {
        container.innerHTML = `<div class="relatorio-resultado">
            <h4><i class="fas fa-users"></i> Relatório da Turma: ${escapeHTML(data.turma || '')}</h4>
            <p class="relatorio-total">Total: <strong>${data.estatisticas?.totalRegistros || 0}</strong> | Alunos: <strong>${data.estatisticas?.totalAlunos || 0}</strong></p>
            <h5><i class="fas fa-list"></i> Por Aluno</h5>
            <div class="table-responsive"><table class="table table-sm">
                <thead><tr><th>Aluno</th><th>Matrícula</th><th>Total</th></tr></thead>
                <tbody>${(data.porAluno || []).map(a => `<tr>
                    <td>${escapeHTML(a.alunoNome)}</td>
                    <td>${escapeHTML(a.alunoMatricula || '-')}</td>
                    <td><span class="badge bg-success">${a.total}</span></td></tr>`).join('')}
                </tbody></table></div>
        </div>`;
    } else if (tipo === 'aluno') {
        container.innerHTML = `<div class="relatorio-resultado">
            <h4><i class="fas fa-user-graduate"></i> Relatório: ${escapeHTML(data.aluno?.nome || '')}</h4>
            <p class="relatorio-total">Turma: ${escapeHTML(data.aluno?.turma || '-')} | Total: <strong>${data.estatisticas?.totalRegistros || 0}</strong></p>
            <h5><i class="fas fa-history"></i> Histórico</h5>
            <div class="table-responsive"><table class="table table-sm">
                <thead><tr><th>Data</th><th>Período Falta</th><th>Tipo Prova</th><th>Motivo</th><th>Observações</th></tr></thead>
                <tbody>${(data.registros || []).map(a => {
                    const periodoFalta = getPeriodoFaltaFormatado(a);
                    const tipoProva = getTipoProvaFormatado(a);
                    return `<tr>
                        <td>${a.dataFormatada}</td>
                        <td><strong>${escapeHTML(periodoFalta || '-')}</strong></td>
                        <td>${escapeHTML(tipoProva || '-')}</td>
                        <td>${escapeHTML(a.motivoLabel)}</td>
                        <td>${escapeHTML((a.observacoes || '').substring(0, 100))}</td></tr>`;
                }).join('')}
                </tbody></table></div>
        </div>`;
    }
}

function exportarCSV() {
    if (!relatorioAtual) { notificar('⚠️ Gere um relatório primeiro', 'warning'); return; }
    const registros = relatorioAtual.registros || [];
    if (registros.length === 0) { notificar('⚠️ Nenhum registro para exportar', 'warning'); return; }
    let csv = "Data,Período da Falta,Tipo de Prova,Aluno,Matrícula,Turma,Motivo,Observações,Responsável,Visto\n";
    registros.forEach(a => {
        const periodoFalta = getPeriodoFaltaFormatado(a) || '';
        const tipoProva = getTipoProvaFormatado(a) || '';
        csv += [
            a.dataFormatada || '',
            `"${periodoFalta.replace(/"/g, '""')}"`,
            `"${tipoProva.replace(/"/g, '""')}"`,
            `"${(a.alunoNome || '').replace(/"/g, '""')}"`,
            `"${(a.alunoMatricula || '').replace(/"/g, '""')}"`,
            `"${(a.alunoTurma || '').replace(/"/g, '""')}"`,
            `"${(a.motivoLabel || '').replace(/"/g, '""')}"`,
            `"${(a.observacoes || '').replace(/"/g, '""')}"`,
            `"${(a.responsavelNome || '').replace(/"/g, '""')}"`,
            `"${a.vistoSecretaria ? 'Sim' : 'Não'}"`
        ].join(',') + '\n';
    });
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `justificativas-secretaria_${getDataLocalISO()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    notificar('✅ CSV exportado com sucesso!', 'success');
}

function exportarPDF() {
    if (!relatorioAtual) { notificar('⚠️ Gere um relatório primeiro', 'warning'); return; }
    const html = gerarHTMLRelatorio(relatorioAtual, tipoRelatorioAtual);
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.onload = () => setTimeout(() => win.print(), 500);
}

function gerarHTMLRelatorio(data, tipo) {
    const logo = '/uploads/logo-iema.png';
    const carimbo = '/icons/assinatura_secretaria.ico';
    const dataGeracao = new Date().toLocaleString('pt-BR');
    let titulo = 'Relatório de Justificativas - Secretaria';
    let subtitulo = '';
    let tabelaHTML = '';
    if (tipo === 'geral') {
        subtitulo = 'Relatório Geral';
        tabelaHTML = `<div class="section-title">📊 Distribuição por Motivo</div>
            <table><thead><tr><th>Motivo</th><th style="width:120px;text-align:center;">Quantidade</th></tr></thead>
            <tbody>${(data.porMotivo || []).map(m => `<tr><td><strong>${escapeHTML(m.label)}</strong></td>
                <td style="text-align:center;">${m.count}</td></tr>`).join('') || '<tr><td colspan="2" style="text-align:center;">Nenhum dado</td></tr>'}
            </tbody></table>
            <div class="section-title">🏫 Distribuição por Turma</div>
            <table><thead><tr><th>Turma</th><th style="width:120px;text-align:center;">Total</th><th style="width:120px;text-align:center;">Alunos</th></tr></thead>
            <tbody>${(data.porTurma || []).map(t => `<tr>
                <td><strong>${escapeHTML(t.turma)}</strong></td>
                <td style="text-align:center;">${t.total}</td>
                <td style="text-align:center;">${t.totalAlunos}</td></tr>`).join('') || '<tr><td colspan="3" style="text-align:center;">Nenhum dado</td></tr>'}
            </tbody></table>`;
    } else if (tipo === 'turma') {
        subtitulo = `Turma: ${data.turma || ''}`;
        tabelaHTML = `<div class="section-title">👥 Registros por Aluno</div>
            <table><thead><tr><th>Aluno</th><th>Matrícula</th><th style="width:100px;text-align:center;">Total</th></tr></thead>
            <tbody>${(data.porAluno || []).map(a => `<tr>
                <td><strong>${escapeHTML(a.alunoNome || '')}</strong></td>
                <td>${escapeHTML(a.alunoMatricula || '-')}</td>
                <td style="text-align:center;">${a.total}</td></tr>`).join('') || '<tr><td colspan="3" style="text-align:center;">Nenhum dado</td></tr>'}
            </tbody></table>`;
    } else if (tipo === 'aluno') {
        titulo = 'Relatório Individual - Justificativas';
        subtitulo = `${data.aluno?.nome || ''} — ${data.aluno?.turma || ''}`;
        tabelaHTML = `<div class="section-title">📋 Histórico de Justificativas</div>
            <table><thead><tr><th>Data</th><th>Período Falta</th><th>Tipo Prova</th><th>Motivo</th><th>Observações</th></tr></thead>
            <tbody>${(data.registros || []).map(a => {
                const periodoFalta = getPeriodoFaltaFormatado(a);
                const tipoProva = getTipoProvaFormatado(a);
                return `<tr>
                    <td>${a.dataFormatada || '-'}</td>
                    <td><strong>${escapeHTML(periodoFalta || '-')}</strong></td>
                    <td>${escapeHTML(tipoProva || '-')}</td>
                    <td>${escapeHTML(a.motivoLabel || '')}</td>
                    <td>${escapeHTML((a.observacoes || '').substring(0, 80))}</td></tr>`;
            }).join('') || '<tr><td colspan="5" style="text-align:center;">Nenhum registro</td></tr>'}
            </tbody></table>`;
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
            .titulo { text-align: center; font-size: 11pt; font-weight: bold; background: #d1fae5; padding: 4px 8px; border: 1.5px solid #000; margin: 6px 0 3px; text-transform: uppercase; }
            .subtitulo { text-align: center; font-size: 9pt; margin: 0 0 6px; font-style: italic; }
            .section-title { font-size: 9pt; font-weight: bold; background: #e8e8e8; padding: 2px 6px; border-left: 3px solid #10b981; margin: 6px 0 3px; }
            table { width: 100%; border-collapse: collapse; font-size: 8.5pt; margin-bottom: 6px; }
            th { background: #10b981; color: white; padding: 4px 5px; text-align: left; border: 1px solid #059669; font-size: 8pt; }
            td { padding: 3px 5px; border: 1px solid #ddd; vertical-align: top; }
            tr:nth-child(even) { background: #f9fafb; }
            .assinaturas { display: flex; justify-content: center; margin-top: 25px; gap: 30px; }
            .assinatura { flex: 0 0 60%; text-align: center; }
            .assinatura-container-relatorio { position: relative; min-height: 18mm; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 0; }
            .assinatura-container-relatorio::after { content: ''; position: absolute; bottom: 0; left: 0; right: 0; border-bottom: 1px solid #000; }
            .carimbo-overlay { position: absolute; bottom: 1mm; left: 50%; transform: translateX(-50%); max-height: 15mm; max-width: 55mm; object-fit: contain; opacity: 0.95; pointer-events: none; z-index: 1; }
            .assinatura-linha { padding-top: 3px; font-size: 8pt; margin-top: 2px; }
            .footer { text-align: center; margin-top: 8px; padding-top: 3px; border-top: 1px solid #ccc; font-size: 6.5pt; color: #666; }
            .footer p { margin: 1px 0; }
            .registro-info { font-size: 7.5pt; color: #666; margin-top: 6px; text-align: center; }
            .btn-print { display: block; margin: 10px auto; padding: 8px 20px; background: #10b981; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 12px; font-family: Arial, sans-serif; }
            @media print { .no-print { display: none !important; } body { padding: 0; } }
        </style>
    </head>
    <body>
        <button class="btn-print no-print" onclick="window.print()">🖨️ Imprimir</button>
        <div class="header">
            <img src="${logo}" alt="IEMA" onerror="this.style.display='none'">
            <h1>IEMA Pleno: São Luís - Centro</h1>
            <p>Sistema de Atendimentos — Secretaria</p>
        </div>
        <div class="titulo">📋 ${titulo}</div>
        ${subtitulo ? `<div class="subtitulo">${escapeHTML(subtitulo)}</div>` : ''}
        ${tabelaHTML}
        <div class="assinaturas">
            <div class="assinatura">
                <div class="assinatura-container-relatorio">
                    <img class="carimbo-overlay" src="${carimbo}" alt="Carimbo" onerror="this.style.display='none'">
                </div>
                <div class="assinatura-linha">Secretaria</div>
            </div>
        </div>
        <div class="registro-info">Relatório gerado em <strong>${dataGeracao}</strong></div>
        <div class="footer">
            <p>Documento gerado automaticamente pelo EducaPleno</p>
            <p>Setor: Secretaria</p>
        </div>
    </body>
    </html>`;
}

// ============================================
// 📜 DECLARAÇÕES — LÓGICA
// ============================================

// Modelos dinâmicos de declaração
const MODELOS_DECLARACAO = {
    aluno: {
        titulo: 'DECLARAÇÃO',
        icone: 'fa-user-graduate',
        cor: '#10b981',
        buscaRole: 'aluno',
        buscaLabel: 'Buscar aluno no sistema',
        buscaSub: 'Digite o nome para auto-preencher',
        temBuscaTurma: true,
        campos: [
            { id: 'nome', label: 'Nome do Aluno', required: true, tipo: 'text', placeholder: 'Nome completo', autoFrom: 'nome' },
            { id: 'cpf', label: 'CPF do Aluno', required: true, tipo: 'text', placeholder: '000.000.000-00', autoFrom: 'cpf', format: 'cpf' },
            { id: 'anosCursados', label: 'Anos Cursados', required: true, tipo: 'checkbox-group', opcoesKey: 'anosCursados' },
            { id: 'curso', label: 'Curso Técnico', required: false, tipo: 'text', placeholder: 'Ex: Técnico em Informática', autoFrom: 'curso' },
            { id: 'anoConclusao', label: 'Ano de Conclusão', required: true, tipo: 'text', placeholder: 'Ex: 2024' },
            { id: 'cidade', label: 'Cidade', required: true, tipo: 'text', placeholder: 'São Luís', default: 'São Luís' },
            { id: 'dataEmissao', label: 'Data de Emissão', required: true, tipo: 'date', default: '' }
        ]
    },
    responsavel: {
        titulo: 'DECLARAÇÃO DE PAIS E RESPONSÁVEIS',
        icone: 'fa-user-friends',
        cor: '#3b82f6',
        buscaRole: null,
        buscaLabel: 'Buscar responsável no sistema',
        buscaSub: 'Digite o nome do responsável (se estiver cadastrado)',
        temBuscaTurma: false,
        temBuscaAlunoPorTurma: true,
        campos: [
            { id: 'nome', label: 'Nome do Responsável', required: true, tipo: 'text', placeholder: 'Nome completo', autoFrom: 'nome' },
            { id: 'cpf', label: 'CPF do Responsável', required: false, tipo: 'text', placeholder: '000.000.000-00', autoFrom: 'cpf', format: 'cpf' },
            { id: 'nomeAluno', label: 'Nome do Aluno', required: true, tipo: 'text', placeholder: 'Nome completo do aluno' },
            { id: 'cpfAluno', label: 'CPF do Aluno', required: false, tipo: 'text', placeholder: '000.000.000-00' },
            { id: 'turmaAluno', label: 'Turma do Aluno', required: false, tipo: 'text', placeholder: 'Ex: 3º Ano A' },
            { id: 'cursoAluno', label: 'Curso do Aluno', required: false, tipo: 'text', placeholder: 'Ex: Técnico em Informática' },
            { id: 'parentesco', label: 'Parentesco', required: true, tipo: 'select', opcoesKey: 'parentescos' },
            { id: 'motivoDeclaracao', label: 'Motivo da Declaração', required: true, tipo: 'select-com-outro', opcoesKey: 'motivosDeclaracao' },
            { id: 'textoAdicional', label: 'Texto Adicional (opcional)', required: false, tipo: 'textarea', placeholder: 'Informações extras que devem constar na declaração' },
            { id: 'cidade', label: 'Cidade', required: true, tipo: 'text', placeholder: 'São Luís', default: 'São Luís' },
            { id: 'dataEmissao', label: 'Data de Emissão', required: true, tipo: 'date', default: '' }
        ]
    },
    professor_bolsista: {
        titulo: 'DECLARAÇÃO',
        icone: 'fa-chalkboard-teacher',
        cor: '#f59e0b',
        buscaRole: 'professor',
        buscaLabel: 'Buscar servidor no sistema',
        buscaSub: 'Digite o nome do servidor para auto-preencher',
        temBuscaTurma: false,
        campos: [
            { id: 'nome', label: 'Nome do Servidor', required: true, tipo: 'text', placeholder: 'Nome completo', autoFrom: 'nome' },
            { id: 'matricula', label: 'Matrícula', required: false, tipo: 'text', placeholder: 'Ex: 00903828-00', autoFrom: 'matricula' },
            { id: 'cpf', label: 'CPF', required: true, tipo: 'text', placeholder: '000.000.000-00', autoFrom: 'cpf', format: 'cpf' },
            { id: 'rg', label: 'RG', required: false, tipo: 'text', placeholder: 'Ex: 128029940' },
            { id: 'cargo', label: 'Cargo', required: true, tipo: 'select-com-outro', opcoesKey: 'cargos' },
            { id: 'funcao', label: 'Função Exercida', required: true, tipo: 'select-com-outro', opcoesKey: 'funcoes' },
            { id: 'disciplina', label: 'Disciplina / Componente', required: false, tipo: 'text', placeholder: 'Ex: Matemática', autoFrom: 'departamento' },
            { id: 'titulacao', label: 'Titulação', required: false, tipo: 'text', placeholder: 'Ex: Especialista, Mestre', autoFrom: 'titulacao' },
            { id: 'cargaHoraria', label: 'Carga Horária', required: false, tipo: 'select-com-outro', opcoesKey: 'cargasHorarias' },
            { id: 'dataInicio', label: 'Data de Início das Atividades', required: true, tipo: 'date', default: '' },
            { id: 'cidade', label: 'Cidade', required: true, tipo: 'text', placeholder: 'São Luís', default: 'São Luís' },
            { id: 'dataEmissao', label: 'Data de Emissão', required: true, tipo: 'date', default: '' }
        ]
    }
};

// ============================================
// Seleciona tipo de declaração
// ============================================
function selecionarTipoDeclaracao(tipo) {
    if (!MODELOS_DECLARACAO[tipo]) return;
    tipoDeclaracaoAtual = tipo;

    document.querySelectorAll('.decl-tipo-card').forEach(card => {
        card.classList.toggle('active', card.getAttribute('data-tipo') === tipo);
    });

    usuarioSelecionadoDeclaracao = null;
    usuarioSelecionadoAlunoResp = null;
    alunosDeclaracaoPorTurma = [];

    const inputResp = safeGet('declBuscaUsuario');
    if (inputResp) inputResp.value = '';
    const listaResp = safeGet('declAutocompleteList');
    if (listaResp) listaResp.style.display = 'none';

    const selectTurma = safeGet('declFiltroTurma');
    if (selectTurma) selectTurma.value = '';
    const inputNomeTurma = safeGet('declFiltroNomeTurma');
    if (inputNomeTurma) inputNomeTurma.value = '';
    const listaAlunosTurma = safeGet('declListaAlunosTurma');
    if (listaAlunosTurma) listaAlunosTurma.innerHTML = '';

    const modelo = MODELOS_DECLARACAO[tipo];
    const titulo = safeGet('declBuscaTitulo');
    const sub = safeGet('declBuscaSubtitulo');
    if (titulo) titulo.textContent = modelo.buscaLabel;
    if (sub) sub.textContent = modelo.buscaSub;

    // Mostra o card de busca por turma quando aplicável (aluno E responsável)
    const cardTurma = safeGet('declBuscaTurmaCard');
    const mostraTurma = modelo.temBuscaTurma || modelo.temBuscaAlunoPorTurma;
    if (cardTurma) cardTurma.style.display = mostraTurma ? 'block' : 'none';

    // Ajusta título do card de turma conforme o tipo
    const tituloTurma = safeGet('declBuscaTurmaTitulo');
    const subTurma = safeGet('declBuscaTurmaSubtitulo');
    if (tituloTurma && subTurma) {
        if (tipo === 'responsavel') {
            tituloTurma.textContent = 'Buscar Aluno por Turma';
            subTurma.textContent = 'Selecione a turma e clique no aluno para preencher';
        } else {
            tituloTurma.textContent = 'Buscar por Turma';
            subTurma.textContent = 'Selecione uma turma e clique no aluno';
        }
    }

    renderizarFormularioDeclaracao();
}

// ============================================
// Renderiza formulário dinâmico
// ============================================
function renderizarFormularioDeclaracao() {
    const modelo = MODELOS_DECLARACAO[tipoDeclaracaoAtual];
    const container = safeGet('declFormContainer');
    if (!container) return;

    const u = usuarioSelecionadoDeclaracao;
    const alunoResp = usuarioSelecionadoAlunoResp;

    const html = `
        <div class="decl-form-header">
            <div class="decl-form-icon" style="background:${modelo.cor};">
                <i class="fas ${modelo.icone}"></i>
            </div>
            <div>
                <h5>${escapeHTML(modelo.titulo)}</h5>
                <small>Preencha os campos abaixo. Campos marcados com * são obrigatórios.</small>
            </div>
        </div>

        <div class="row g-3">
            ${modelo.campos.map(campo => {
                let valorPreenchido = '';

                if (campo.autoFrom && u && u[campo.autoFrom]) {
                    valorPreenchido = u[campo.autoFrom];
                    if (campo.format === 'cpf') valorPreenchido = formatarCPF(valorPreenchido);
                }

                if (tipoDeclaracaoAtual === 'responsavel' && alunoResp) {
                    if (campo.id === 'nomeAluno') valorPreenchido = alunoResp.nome || '';
                    else if (campo.id === 'cpfAluno' && alunoResp.cpf) valorPreenchido = formatarCPF(alunoResp.cpf);
                    else if (campo.id === 'turmaAluno') valorPreenchido = alunoResp.turma || '';
                    else if (campo.id === 'cursoAluno') valorPreenchido = alunoResp.curso || '';
                }

                if (!valorPreenchido && campo.default) valorPreenchido = campo.default;
                if (campo.tipo === 'date' && !valorPreenchido) valorPreenchido = getDataLocalISO();

                let inputHtml = '';

                if (campo.tipo === 'textarea') {
                    inputHtml = `<textarea class="form-control secretaria-input" id="decl_${campo.id}" rows="3" placeholder="${escapeHTML(campo.placeholder || '')}">${escapeHTML(valorPreenchido)}</textarea>`;
                } else if (campo.tipo === 'select') {
                    const opcoes = campo.opcoesKey ? (opcoesDeclaracao[campo.opcoesKey] || []) : (campo.opcoes || []);
                    inputHtml = `<select class="form-select secretaria-select" id="decl_${campo.id}">
                        <option value="">Selecione...</option>
                        ${opcoes.map(op => `<option value="${escapeHTML(op)}" ${valorPreenchido === op ? 'selected' : ''}>${escapeHTML(op)}</option>`).join('')}
                    </select>`;
                } else if (campo.tipo === 'select-com-outro') {
                    const opcoes = opcoesDeclaracao[campo.opcoesKey] || [];
                    inputHtml = `
                        <select class="form-select secretaria-select" id="decl_${campo.id}"
                                onchange="onSelectComOutro('${campo.id}', this.value)">
                            <option value="">Selecione...</option>
                            ${opcoes.map(op => `<option value="${escapeHTML(op)}" ${valorPreenchido === op ? 'selected' : ''}>${escapeHTML(op)}</option>`).join('')}
                        </select>
                        <input type="text" class="form-control secretaria-input mt-2" id="decl_${campo.id}_outro"
                            placeholder="Descreva o ${campo.label.toLowerCase()}..."
                            style="display:none;" value="${escapeHTML(u && u[campo.id + 'Outros'] ? u[campo.id + 'Outros'] : '')}">`;
                } else if (campo.tipo === 'checkbox-group') {
                    const opcoes = opcoesDeclaracao[campo.opcoesKey] || ['1º Ano', '2º Ano', '3º Ano'];
                    inputHtml = `<div class="checkbox-group-anos">
                        ${opcoes.map(op => `
                            <label class="check-ano-item">
                                <input type="checkbox" value="${escapeHTML(op)}" class="check-ano-input" data-campo="${campo.id}">
                                <span>${escapeHTML(op)}</span>
                            </label>
                        `).join('')}
                    </div>
                    <input type="hidden" id="decl_${campo.id}" value="">`;
                } else if (campo.tipo === 'date') {
                    inputHtml = `<input type="date" class="form-control secretaria-input" id="decl_${campo.id}" value="${escapeHTML(valorPreenchido)}">`;
                } else {
                    inputHtml = `<input type="${campo.tipo}" class="form-control secretaria-input" id="decl_${campo.id}"
                        placeholder="${escapeHTML(campo.placeholder || '')}" value="${escapeHTML(valorPreenchido)}">`;
                }

                const colClass = (campo.tipo === 'textarea' || campo.tipo === 'checkbox-group') ? 'col-12' : 'col-md-6';

                return `
                    <div class="${colClass}">
                        <label class="form-label">
                            ${escapeHTML(campo.label)}
                            ${campo.required ? '<span class="text-danger">*</span>' : ''}
                        </label>
                        ${inputHtml}
                    </div>`;
            }).join('')}
        </div>
    `;

    container.innerHTML = html;

    container.querySelectorAll('.check-ano-input').forEach(chk => {
        chk.addEventListener('change', atualizarAnosCursados);
    });
}

// Atualiza campo hidden com os anos selecionados
function atualizarAnosCursados() {
    const selecionados = Array.from(document.querySelectorAll('.check-ano-input:checked'))
        .map(c => c.value)
        .sort((a, b) => a.localeCompare(b));
    const hidden = safeGet('decl_anosCursados');
    if (hidden) hidden.value = selecionados.join(', ');
}

// Handler do select-com-outro
function onSelectComOutro(campoId, valor) {
    const inputOutro = safeGet(`decl_${campoId}_outro`);
    if (!inputOutro) return;
    if (valor === 'Outro') {
        inputOutro.style.display = 'block';
        inputOutro.focus();
    } else {
        inputOutro.style.display = 'none';
        inputOutro.value = '';
    }
}

// ============================================
// Busca usuário por nome (autocomplete)
// ============================================
async function buscarUsuarioDeclaracao(termo) {
    const listEl = safeGet('declAutocompleteList');
    if (!listEl) return;

    try {
        const modelo = MODELOS_DECLARACAO[tipoDeclaracaoAtual];
        const params = new URLSearchParams({ termo });
        if (modelo.buscaRole) params.append('role', modelo.buscaRole);

        const response = await fetch(`/api/secretaria/declaracoes/buscar-usuario?${params.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (!data.success || !Array.isArray(data.usuarios) || data.usuarios.length === 0) {
            listEl.innerHTML = '<div style="padding:15px;text-align:center;color:#6b7280;">Nenhum usuário encontrado</div>';
            listEl.style.display = 'block';
            return;
        }

        listEl.innerHTML = data.usuarios.map((u, i) => {
            const partes = [];
            if (u.matricula) partes.push(`Mat: ${u.matricula}`);
            if (u.turma) partes.push(u.turma);
            if (u.curso) partes.push(u.curso);
            if (u.departamento) partes.push(u.departamento);
            return `<div class="autocomplete-item" data-index="${i}" style="padding:10px 14px;border-bottom:1px solid #f3f4f6;cursor:pointer;">
                <div style="font-weight:600;font-size:0.9rem;color:#1f2937;">${destacarTermo(u.nome, termo)}</div>
                <div style="font-size:0.78rem;color:#6b7280;margin-top:2px;">
                    ${escapeHTML(partes.join(' • ') || 'Sem informações')}
                </div></div>`;
        }).join('');

        listEl.querySelectorAll('.autocomplete-item').forEach((item) => {
            item.addEventListener('click', () => {
                const idx = parseInt(item.getAttribute('data-index'));
                selecionarUsuarioDeclaracao(data.usuarios[idx]);
                listEl.style.display = 'none';
            });
        });
        listEl.style.display = 'block';
    } catch (error) {
        listEl.innerHTML = '<div style="padding:15px;text-align:center;color:#ef4444;">Erro ao buscar</div>';
        listEl.style.display = 'block';
    }
}

// ============================================
// Busca por turma (para alunos)
// ============================================
async function carregarAlunosDeclaracaoPorTurma() {
    const turma = safeGet('declFiltroTurma')?.value;
    const container = safeGet('declListaAlunosTurma');
    if (!container) return;

    if (!turma) { container.innerHTML = ''; return; }

    container.innerHTML = `<div class="text-center py-3"><div class="loading-spinner"></div><p>Carregando alunos...</p></div>`;

    try {
        const response = await fetch(`/api/secretaria/declaracoes/alunos-por-turma?turma=${encodeURIComponent(turma)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (data.success && Array.isArray(data.alunos)) {
            alunosDeclaracaoPorTurma = data.alunos;
            filtrarAlunosDeclaracaoTurma();
        } else {
            container.innerHTML = `<div class="empty-state-mini"><i class="fas fa-user-slash"></i><p>Nenhum aluno encontrado</p></div>`;
        }
    } catch (error) {
        container.innerHTML = `<div class="empty-state-mini"><i class="fas fa-exclamation-triangle"></i><p>Erro ao carregar</p></div>`;
    }
}

function filtrarAlunosDeclaracaoTurma() {
    const busca = (safeGet('declFiltroNomeTurma')?.value || '').toLowerCase();
    const container = safeGet('declListaAlunosTurma');
    if (!container) return;

    let filtrados = alunosDeclaracaoPorTurma;
    if (busca) filtrados = filtrados.filter(a => (a.nome || '').toLowerCase().includes(busca));
    filtrados.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

    if (filtrados.length === 0) {
        container.innerHTML = `<div class="empty-state-mini"><i class="fas fa-user-slash"></i><p>Nenhum aluno encontrado</p></div>`;
        return;
    }

    let html = '<div class="lista-alunos-grid">';
    filtrados.forEach(aluno => {
        html += `<div class="aluno-item" data-aluno-id="${aluno.id}">
            <div class="aluno-item-avatar"><img src="${aluno.fotoPerfil || gerarAvatarSVG(aluno.nome)}" alt=""></div>
            <div class="aluno-item-info">
                <strong>${escapeHTML(aluno.nome)}</strong>
                <small>${escapeHTML(aluno.matricula || 'Sem matrícula')}${aluno.cpf ? ' • CPF: ' + formatarCPF(aluno.cpf) : ''}</small>
            </div>
            <i class="fas fa-chevron-right aluno-item-arrow"></i>
        </div>`;
    });
    html += '</div>';
    container.innerHTML = html;

    container.querySelectorAll('.aluno-item').forEach(item => {
        item.addEventListener('click', () => {
            const id = item.getAttribute('data-aluno-id');
            const aluno = filtrados.find(a => a.id === id);
            if (aluno) selecionarUsuarioDeclaracao(aluno);
        });
    });
}

// ============================================
// Seleção do usuário principal
// ============================================
function selecionarUsuarioDeclaracao(usuario) {
    // 🔥 Quando é declaração de responsável, o usuário clicado é o ALUNO
    if (tipoDeclaracaoAtual === 'responsavel') {
        usuarioSelecionadoAlunoResp = usuario;
        const inputResp = safeGet('declBuscaUsuario');
        if (inputResp && inputResp.value === usuario.nome) inputResp.value = '';
    } else {
        usuarioSelecionadoDeclaracao = usuario;
        const input = safeGet('declBuscaUsuario');
        if (input) input.value = usuario.nome;
    }
    renderizarFormularioDeclaracao();
    notificar(`✅ Dados de ${usuario.nome} carregados`, 'success', 2000);
}

function selecionarAlunoResponsavel(aluno) {
    usuarioSelecionadoAlunoResp = aluno;
    renderizarFormularioDeclaracao();
    notificar(`✅ Aluno ${aluno.nome} vinculado`, 'success', 2000);
}

function limparFormularioDeclaracao() {
    usuarioSelecionadoDeclaracao = null;
    usuarioSelecionadoAlunoResp = null;
    alunosDeclaracaoPorTurma = [];

    const inputResp = safeGet('declBuscaUsuario');
    if (inputResp) inputResp.value = '';
    const listaResp = safeGet('declAutocompleteList');
    if (listaResp) listaResp.style.display = 'none';

    const selectTurma = safeGet('declFiltroTurma');
    if (selectTurma) selectTurma.value = '';
    const inputNomeTurma = safeGet('declFiltroNomeTurma');
    if (inputNomeTurma) inputNomeTurma.value = '';
    const listaAlunosTurma = safeGet('declListaAlunosTurma');
    if (listaAlunosTurma) listaAlunosTurma.innerHTML = '';

    renderizarFormularioDeclaracao();
    notificar('Formulário limpo', 'info', 1500);
}

// ============================================
// Coleta e valida dados
// ============================================
function coletarDadosDeclaracao() {
    const modelo = MODELOS_DECLARACAO[tipoDeclaracaoAtual];
    const dados = {};

    modelo.campos.forEach(campo => {
        const el = safeGet(`decl_${campo.id}`);
        if (!el) return;

        if (campo.tipo === 'select-com-outro') {
            const valorSelect = el.value.trim();
            if (valorSelect === 'Outro') {
                const inputOutro = safeGet(`decl_${campo.id}_outro`);
                dados[campo.id] = 'Outro';
                dados[campo.id + 'Outros'] = inputOutro ? inputOutro.value.trim() : '';
            } else {
                dados[campo.id] = valorSelect;
                dados[campo.id + 'Outros'] = '';
            }
        } else {
            dados[campo.id] = el.value.trim();
        }
    });

    if (!dados.dataEmissao) dados.dataEmissao = getDataLocalISO();
    if (!dados.cidade) dados.cidade = 'São Luís';

    return dados;
}

function validarDeclaracao(dados) {
    const modelo = MODELOS_DECLARACAO[tipoDeclaracaoAtual];
    const faltando = [];
    modelo.campos.forEach(campo => {
        if (campo.required && (!dados[campo.id] || !dados[campo.id].trim())) {
            faltando.push(campo.label);
        }
        if (campo.tipo === 'select-com-outro' && dados[campo.id] === 'Outro' && (!dados[campo.id + 'Outros'] || !dados[campo.id + 'Outros'].trim())) {
            faltando.push(campo.label + ' (descreva em Outro)');
        }
    });
    if (faltando.length > 0) {
        notificar(`Preencha: ${faltando.join(', ')}`, 'warning', 4000);
        return false;
    }
    return true;
}

// ============================================
// Emitir
// ============================================
async function emitirDeclaracao(modo) {
    const dados = coletarDadosDeclaracao();
    if (!validarDeclaracao(dados)) return;

    if (modo === 'preview') {
        const html = gerarHTMLDeclaracao(tipoDeclaracaoAtual, dados);
        const win = window.open('', '_blank');
        win.document.write(html);
        win.document.close();
        win.onload = () => setTimeout(() => win.print(), 500);
        return;
    }

    try {
        const response = await fetch('/api/secretaria/declaracoes', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tipo: tipoDeclaracaoAtual,
                usuarioId: usuarioSelecionadoDeclaracao?.id || usuarioSelecionadoAlunoResp?.id || null,
                dados
            })
        });
        const data = await response.json();
        if (!data.success) { notificar('Erro ao salvar: ' + (data.error || ''), 'error'); return; }

        notificar('✅ Declaração salva!', 'success');
        const html = gerarHTMLDeclaracao(tipoDeclaracaoAtual, dados);
        const win = window.open('', '_blank');
        win.document.write(html);
        win.document.close();
        win.onload = () => setTimeout(() => { win.print(); marcarDeclaracaoComoImpressa(data.declaracao.id); }, 500);
    } catch (error) { notificar('Erro ao emitir declaração', 'error'); }
}

async function marcarDeclaracaoComoImpressa(id) {
    if (!id) return;
    try {
        await fetch(`/api/secretaria/declaracoes/${id}/impresso`, {
            method: 'PUT', headers: { 'Authorization': `Bearer ${token}` }
        });
    } catch (error) { /* silencioso */ }
}

// ============================================
// Gera HTML de impressão da declaração
// ============================================
function gerarHTMLDeclaracao(tipo, dados) {
    const logo = '/uploads/logo-iema.png';
    const carimbo = '/icons/assinatura_secretaria.ico';
    const dataGeracao = new Date().toLocaleString('pt-BR');
    const modelo = MODELOS_DECLARACAO[tipo];

    const dataEmissaoExtenso = formatarDataEmissaoExtenso(dados.dataEmissao)
        || new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

    let corpoDeclaracao = '';

    if (tipo === 'aluno') {
        let cursoLimpo = '';
        if (dados.curso && dados.curso.trim()) {
            const cursoRaw = dados.curso.trim();
            const prefixoRegex = /^t[ée]cnico\s+(em\s+)?/i;
            cursoLimpo = cursoRaw.replace(prefixoRegex, '').trim();
            cursoLimpo = cursoLimpo
                .toLowerCase()
                .split(/\s+/)
                .map(p => p.charAt(0).toUpperCase() + p.slice(1))
                .join(' ');
        }

        const cursoTexto = cursoLimpo
            ? `, no Curso Técnico em ${escapeHTML(cursoLimpo)}`
            : '';

        corpoDeclaracao = `
            <p class="texto-declaracao">
                DECLARAMOS PARA OS DEVIDOS FINS, que o (a) aluno (a)
                <strong>${escapeHTML(dados.nome)}</strong>
                ${dados.cpf ? `portador (a) do CPF: <strong>${escapeHTML(dados.cpf)}</strong>` : ''}
                CONCLUIU neste Instituto Estadual de Educação, Ciência e Tecnologia do Maranhão -
                IEMA Pleno São Luís Centro, INEP: 21275548,
                <strong>${escapeHTML(dados.anosCursados)}</strong>${cursoTexto}, integrado de tempo integral,
                obtendo aprovação no ano letivo de <strong>${escapeHTML(dados.anoConclusao)}</strong>.
            </p>`;
    } else if (tipo === 'responsavel') {
        const motivoFinal = (dados.motivoDeclaracao === 'Outro' && dados.motivoDeclaracaoOutros)
            ? dados.motivoDeclaracaoOutros
            : dados.motivoDeclaracao;
        corpoDeclaracao = `
            <p class="texto-declaracao">
                DECLARAMOS PARA OS DEVIDOS FINS, que o (a) responsável
                <strong>${escapeHTML(dados.nome)}</strong>
                ${dados.cpf ? `, CPF: <strong>${escapeHTML(dados.cpf)}</strong>,` : ''}
                ${dados.parentesco ? ` na qualidade de <strong>${escapeHTML(dados.parentesco)}</strong>` : ''}
                do (a) aluno (a) <strong>${escapeHTML(dados.nomeAluno)}</strong>
                ${dados.cpfAluno ? `, CPF: <strong>${escapeHTML(dados.cpfAluno)}</strong>,` : ''}
                ${dados.turmaAluno ? ` matriculado (a) na turma <strong>${escapeHTML(dados.turmaAluno)}</strong>` : ''}
                ${dados.cursoAluno ? ` do curso <strong>${escapeHTML(dados.cursoAluno)}</strong>` : ''}
                encontra-se regularmente matriculado (a) e frequentando esta Unidade de Ensino
                Médio e Técnico de tempo integral.
                ${motivoFinal ? `<br><br><strong>Motivo da declaração:</strong> ${escapeHTML(motivoFinal)}.` : ''}
                ${dados.textoAdicional ? `<br><br>${escapeHTML(dados.textoAdicional).replace(/\n/g, '<br>')}` : ''}
            </p>`;
    } else if (tipo === 'professor_bolsista') {
        const cargoFinal = (dados.cargo === 'Outro' && dados.cargoOutros) ? dados.cargoOutros : dados.cargo;
        const funcaoFinal = (dados.funcao === 'Outro' && dados.funcaoOutros) ? dados.funcaoOutros : dados.funcao;
        const cargaFinal = (dados.cargaHoraria === 'Outro' && dados.cargaHorariaOutros) ? dados.cargaHorariaOutros : dados.cargaHoraria;
        const dataInicioExtenso = formatarDataEmissaoExtenso(dados.dataInicio);

        corpoDeclaracao = `
            <p class="texto-declaracao">
                Declaramos para os devidos fins que o servidor
                <strong>${escapeHTML(dados.nome)}</strong>,
                ${dados.matricula ? `Matrícula: <strong>${escapeHTML(dados.matricula)}</strong>,` : ''}
                ${cargoFinal ? `ocupante do cargo de <strong>${escapeHTML(cargoFinal)}</strong>,` : ''}
                ${dados.cpf ? `inscrito no CPF Nº: <strong>${escapeHTML(dados.cpf)}</strong>` : ''}
                ${dados.rg ? ` e RG: Nº <strong>${escapeHTML(dados.rg)}</strong>` : ''}
                ${funcaoFinal ? `, ${escapeHTML(funcaoFinal)}` : ''}
                ${dados.disciplina ? ` da disciplina de <strong>${escapeHTML(dados.disciplina)}</strong>` : ''}
                ${cargaFinal ? `, com carga horária de <strong>${escapeHTML(cargaFinal)}</strong>` : ''}
                , lotado nesta Unidade de Ensino Médio e Técnico de tempo integral
                IEMA PLENO SÃO LUÍS CENTRO, estando em pleno exercício de suas atividades funcionais,
                tendo iniciado as suas atividades
                <strong>${escapeHTML(dataInicioExtenso || 'em data a informar')}</strong> até os dias atuais.
            </p>`;
    }

    return `<!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <title>${escapeHTML(modelo.titulo)} - ${escapeHTML(dados.nome)}</title>
        <style>
            @page { size: A4 portrait; margin: 12mm 14mm; }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; line-height: 1.5; color: #000; }

            .header { text-align: center; border-bottom: 1.5px double #000; padding-bottom: 6px; margin-bottom: 12px; }
            .header img { max-width: 100%; max-height: 16mm; object-fit: contain; display: block; margin: 0 auto 3px; }
            .header h1 { font-size: 11pt; text-transform: uppercase; font-weight: bold; margin: 2px 0 0; }
            .header p { font-size: 8.5pt; margin: 1px 0 0; }

            .titulo { text-align: center; font-size: 13pt; font-weight: bold; background: #d1fae5; padding: 6px 10px; border: 1.5px solid #000; margin: 12px 0 20px; text-transform: uppercase; }

            .texto-declaracao { font-size: 11.5pt; line-height: 1.8; text-align: justify; text-indent: 40px; margin: 20px 0 30px; }
            .texto-declaracao strong { text-transform: uppercase; font-weight: bold; }

            .local-data { text-align: right; margin-top: 30px; margin-bottom: 30px; font-size: 11pt; }

            /* ✅ Assinatura: carimbo EM CIMA, linha ABAIXO do carimbo */
            .assinaturas {
                display: flex;
                justify-content: center;
                margin-top: 40px;
            }
            .assinatura {
                flex: 0 0 75%;
                text-align: center;
            }
            .carimbo-assinatura {
                display: block;
                margin: 0 auto;
                max-height: 22mm;
                max-width: 60mm;
                object-fit: contain;
            }
            .linha-assinatura {
                width: 100%;
                border-top: 1.5px solid #000;
                margin-top: 4px;
            }
            .assinatura-linha {
                margin-top: 8px;
                font-size: 11pt;
                font-weight: bold;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .assinatura-sub {
                font-size: 9pt;
                color: #444;
                margin-top: 2px;
            }

            .footer { text-align: center; margin-top: 30px; padding-top: 4px; border-top: 1px solid #ccc; font-size: 7.5pt; color: #666; }
            .footer p { margin: 1px 0; }

            .btn-print {
                display: block; margin: 15px auto; padding: 10px 24px;
                background: #10b981; color: white; border: none; border-radius: 6px;
                font-weight: bold; cursor: pointer; font-family: Arial; font-size: 13px;
            }
            .btn-print:hover { background: #059669; }
            @media print { .no-print { display: none !important; } body { padding: 0; } }
        </style>
    </head>
    <body>
        <button class="btn-print no-print" onclick="window.print()">🖨️ Imprimir</button>

        <div class="header">
            <img src="${logo}" alt="IEMA" onerror="this.style.display='none'">
            <h1>Instituto Estadual de Educação, Ciência e Tecnologia do Maranhão</h1>
            <p>IEMA Pleno São Luís Centro — INEP: 21275548</p>
        </div>

        <div class="titulo">${escapeHTML(modelo.titulo)}</div>

        ${corpoDeclaracao}

        <div class="local-data">
            ${escapeHTML(dados.cidade || 'São Luís')} – MA, ${escapeHTML(dataEmissaoExtenso)}.
        </div>

        <div class="assinaturas">
            <div class="assinatura">
                <img class="carimbo-assinatura" src="${carimbo}" alt="Carimbo" onerror="this.style.display='none'">
                <div class="linha-assinatura"></div>
                <div class="assinatura-linha">SECRETARIA</div>
                <div class="assinatura-sub">IEMA Pleno São Luís Centro</div>
            </div>
        </div>

        <div class="footer">
            <p>Documento emitido em <strong>${dataGeracao}</strong> — EducaPleno — Secretaria</p>
        </div>
    </body>
    </html>`;
}

// ============================================
// Histórico
// ============================================
async function carregarHistoricoDeclaracoes() {
    const container = safeGet('listaDeclaracoes');
    if (!container) return;
    const tipo = safeGet('histFiltroTipo')?.value || 'todas';
    const nome = safeGet('histFiltroNome')?.value?.trim() || '';
    const dataInicio = safeGet('histFiltroDataInicio')?.value || '';
    const dataFim = safeGet('histFiltroDataFim')?.value || '';
    const impresso = safeGet('histFiltroImpresso')?.value || '';

    container.innerHTML = `<div class="text-center py-3"><div class="loading-spinner"></div><p>Buscando declarações...</p></div>`;

    try {
        const params = new URLSearchParams();
        if (tipo && tipo !== 'todas') params.append('tipo', tipo);
        if (nome) params.append('nome', nome);
        if (dataInicio) params.append('dataInicio', dataInicio);
        if (dataFim) params.append('dataFim', dataFim);
        if (impresso) params.append('impresso', impresso);

        const response = await fetch(`/api/secretaria/declaracoes?${params.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (!data.success) { container.innerHTML = `<div class="alert alert-danger">Erro ao buscar declarações</div>`; return; }

        declaracoesHistorico = data.declaracoes || [];
        const countEl = safeGet('countDeclaracoes');
        if (countEl) countEl.textContent = data.total || 0;

        if (declaracoesHistorico.length === 0) {
            container.innerHTML = `<div class="empty-relatorio" style="padding: 40px 20px;">
                <i class="fas fa-scroll"></i><h5>Nenhuma declaração encontrada</h5>
                <p>Não há declarações emitidas com os filtros aplicados.</p></div>`;
            return;
        }

        container.innerHTML = `<div class="decl-historico-lista">
            ${declaracoesHistorico.map(d => {
                const tipoLabel = {
                    'aluno': 'Declaração de Aluno',
                    'responsavel': 'Declaração de Pais/Responsáveis',
                    'professor_bolsista': 'Declaração de Professor/Bolsista'
                }[d.tipo] || d.tipo;
                const tipoIcone = {
                    'aluno': 'fa-user-graduate',
                    'responsavel': 'fa-user-friends',
                    'professor_bolsista': 'fa-chalkboard-teacher'
                }[d.tipo] || 'fa-scroll';
                const tipoCor = {
                    'aluno': '#10b981',
                    'responsavel': '#3b82f6',
                    'professor_bolsista': '#f59e0b'
                }[d.tipo] || '#6b7280';

                return `<div class="decl-historico-item">
                    <div class="decl-historico-icon" style="background:${tipoCor};">
                        <i class="fas ${tipoIcone}"></i>
                    </div>
                    <div class="decl-historico-info">
                        <div class="decl-historico-tipo">${escapeHTML(tipoLabel)}</div>
                        <div class="decl-historico-nome">
                            <i class="fas fa-user"></i> ${escapeHTML(d.dados?.nome || '-')}
                        </div>
                        <div class="decl-historico-meta">
                            <span><i class="fas fa-calendar"></i> ${d.dataFormatada || '-'}</span>
                            <span><i class="fas fa-user-tie"></i> ${escapeHTML(d.emitidoPorNome || '-')}</span>
                            ${d.impresso
                                ? `<span class="badge-impresso"><i class="fas fa-check-circle"></i> Impresso</span>`
                                : `<span class="badge-nao-impresso"><i class="fas fa-clock"></i> Não impresso</span>`}
                        </div>
                    </div>
                    <div class="decl-historico-actions">
                        <button class="btn-action-item btn-view-item" onclick="visualizarDeclaracao('${d.id}')" title="Visualizar">
                            <i class="fas fa-eye"></i></button>
                        <button class="btn-action-item btn-print-item" onclick="reimprimirDeclaracao('${d.id}')" title="Reimprimir">
                            <i class="fas fa-print"></i></button>
                        <button class="btn-action-item btn-delete-item" onclick="excluirDeclaracao('${d.id}')" title="Excluir">
                            <i class="fas fa-trash"></i></button>
                    </div>
                </div>`;
            }).join('')}
        </div>`;
    } catch (error) {
        container.innerHTML = `<div class="alert alert-danger">Erro ao buscar declarações</div>`;
    }
}

async function visualizarDeclaracao(id) {
    try {
        const response = await fetch(`/api/secretaria/declaracoes/${id}`, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await response.json();
        if (!data.success) { notificar('Erro ao carregar declaração', 'error'); return; }
        const html = gerarHTMLDeclaracao(data.declaracao.tipo, data.declaracao.dados);
        const win = window.open('', '_blank');
        win.document.write(html);
        win.document.close();
    } catch (error) { notificar('Erro ao carregar declaração', 'error'); }
}

async function reimprimirDeclaracao(id) {
    try {
        const response = await fetch(`/api/secretaria/declaracoes/${id}`, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await response.json();
        if (!data.success) { notificar('Erro ao carregar declaração', 'error'); return; }
        const html = gerarHTMLDeclaracao(data.declaracao.tipo, data.declaracao.dados);
        const win = window.open('', '_blank');
        win.document.write(html);
        win.document.close();
        win.onload = () => setTimeout(() => { win.print(); marcarDeclaracaoComoImpressa(id); }, 500);
    } catch (error) { notificar('Erro ao reimprimir', 'error'); }
}

async function excluirDeclaracao(id) {
    const confirmado = await confirmarInternoNotif('Tem certeza que deseja excluir esta declaração?\n\nEla sairá do histórico, mas o documento físico continua válido.');
    if (!confirmado) return;
    try {
        const response = await fetch(`/api/secretaria/declaracoes/${id}`, {
            method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success) {
            notificar('✅ Declaração excluída', 'success');
            carregarHistoricoDeclaracoes();
        }
    } catch (error) { notificar('Erro ao excluir', 'error'); }
}

function limparFiltrosHistorico() {
    ['histFiltroTipo', 'histFiltroNome', 'histFiltroDataInicio', 'histFiltroDataFim', 'histFiltroImpresso'].forEach(id => {
        const el = safeGet(id);
        if (!el) return;
        if (id === 'histFiltroTipo') el.value = 'todas';
        else el.value = '';
    });
    notificar('Filtros limpos', 'info', 1500);
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
window.setModo = setModo;
window.selecionarMotivoConsulta = selecionarMotivoConsulta;
window.limparAlunoSelecionado = limparAlunoSelecionado;
window.buscarJustificativasDoAluno = buscarJustificativasDoAluno;
window.verJustificativa = verJustificativa;
window.imprimirJustificativa = imprimirJustificativa;
window.carregarRelatorio = carregarRelatorio;
window.exportarCSV = exportarCSV;
window.exportarPDF = exportarPDF;
window.logout = logout;
window.notificar = notificar;

window.buscarPorData = buscarPorData;
window.exportarCSVData = exportarCSVData;
window.exportarPDFData = exportarPDFData;
window.limparFiltrosData = limparFiltrosData;

window.toggleVistoJustificativa = toggleVistoJustificativa;
window.marcarComoVistoAutomatico = marcarComoVistoAutomatico;
window.marcarTodasVisiveisComoVistas = marcarTodasVisiveisComoVistas;

window.selecionarTipoDeclaracao = selecionarTipoDeclaracao;
window.limparFormularioDeclaracao = limparFormularioDeclaracao;
window.emitirDeclaracao = emitirDeclaracao;
window.visualizarDeclaracao = visualizarDeclaracao;
window.reimprimirDeclaracao = reimprimirDeclaracao;
window.excluirDeclaracao = excluirDeclaracao;
window.carregarHistoricoDeclaracoes = carregarHistoricoDeclaracoes;
window.limparFiltrosHistorico = limparFiltrosHistorico;
window.selecionarUsuarioDeclaracao = selecionarUsuarioDeclaracao;
window.selecionarAlunoResponsavel = selecionarAlunoResponsavel;
window.onSelectComOutro = onSelectComOutro;

window.abrirNotificacoes = abrirNotificacoes;
window.fecharNotificacoes = fecharNotificacoes;
window.marcarTodasLidas = marcarTodasLidas;
window.limparMinhasNotificacoes = limparMinhasNotificacoes;
window.mostrarNotificacaoInterna = mostrarNotificacaoInterna;
window.confirmarInternoNotif = confirmarInternoNotif;
window.abrirNotificacao = abrirNotificacao;