// frontend/js/secretaria.js
// ============================================
// SECRETARIA - CONSULTA DE JUSTIFICATIVAS
// Somente Leitura - Modelo Gestão Geral
// + Sistema de Notificações Integrado
// ============================================

let token = localStorage.getItem('auth_token');

// Estado da consulta
let modoAtual = 'automatico';
let currentAluno = null;
let scannerAuto = null;
let scannerAutoAtivo = false;
let turmasDisponiveis = [];
let alunosPorTurma = [];
let motivoConsulta = 'todos';

// Estado do autocomplete de relatórios
const autocompleteState = {
    alunos: [],
    filtrados: [],
    indice: -1,
    carregado: false,
    carregando: false
};

// Estado dos relatórios
let relatorioAtual = null;
let tipoRelatorioAtual = 'geral';

// Charts
const charts = { motivos: null };

// Estado das notificações
let notificacoesInterval = null;
let __notificacoesCache = [];
let __lembretesCache = [];

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
        animation: slideInToast 0.3s ease;
        font-family: inherit;
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
    if (!document.getElementById('notificacoesBtn')) {
        console.log('⚠️ Sino não encontrado');
        return;
    }

    console.log('🔔 Inicializando sistema de notificações...');
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
    await Promise.all([
        carregarNotificacoesSistema(),
        carregarLembretesRemarcacao()
    ]);
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
        if (data.success) {
            __notificacoesCache = data.notificacoes || [];
        }
    } catch (error) {
        console.error('Erro ao carregar notificações:', error);
    }
}

async function carregarLembretesRemarcacao() {
    try {
        const tk = localStorage.getItem('auth_token');
        if (!tk) return;

        const response = await fetch('/api/gestao-geral/remarcacoes/pendentes', {
            headers: { 'Authorization': `Bearer ${tk}` }
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
            <div style="text-align: center; padding: 40px; color: #6c757d;">
                <i class="fas fa-bell-slash" style="font-size: 3rem; margin-bottom: 15px; opacity: 0.4;"></i>
                <p style="margin: 0;">Nenhuma notificação</p>
            </div>`;
        return;
    }

    let html = '';

    // Lembretes
    if (temLembretes) {
        html += `
            <div style="padding: 12px 16px; background: #f0fdf4; border-bottom: 1px solid #d1fae5;">
                <strong style="color: #059669; font-size: 0.85rem;">
                    <i class="fas fa-calendar-alt"></i> Lembretes (${__lembretesCache.length})
                </strong>
            </div>`;
        __lembretesCache.forEach(r => {
            html += `
                <div style="padding: 12px 16px; border-bottom: 1px solid #f3f4f6;">
                    <strong style="font-size: 0.85rem;">${escapeHTML(r.alunoNome || '')}</strong>
                    <p style="margin: 4px 0 0; font-size: 0.78rem; color: #6b7280;">
                        ${r.dataRemarcacao || ''} às ${r.horarioRemarcacao || ''}
                    </p>
                </div>`;
        });
    }

    // Notificações
    if (temNotificacoes) {
        html += `
            <div style="padding: 12px 16px; background: #f0fdf4; border-bottom: 1px solid #d1fae5;">
                <strong style="color: #059669; font-size: 0.85rem;">
                    <i class="fas fa-bell"></i> Notificações
                </strong>
            </div>`;
        __notificacoesCache.forEach(notif => {
            const classeLida = notif.lida ? '' : 'font-weight: 600;';
            html += `
                <div class="notificacao-item" data-id="${notif._id}" style="padding: 14px 16px; border-bottom: 1px solid #f3f4f6; cursor: pointer; ${classeLida}"
                    onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='white'">
                    <div style="display: flex; gap: 10px;">
                        <div style="width: 36px; height: 36px; border-radius: 50%; background: ${notif.cor || '#10b981'}; color: white; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 1rem;">
                            ${notif.icone || '📋'}
                        </div>
                        <div style="flex: 1; min-width: 0;">
                            <strong style="display: block; font-size: 0.85rem; color: #1f2937;">${escapeHTML(notif.titulo || '')}</strong>
                            <p style="margin: 2px 0 0; font-size: 0.78rem; color: #6b7280; line-height: 1.3;">${escapeHTML(notif.mensagem || '')}</p>
                        </div>
                    </div>
                </div>`;
        });
    }

    lista.innerHTML = html;

    lista.querySelectorAll('.notificacao-item').forEach(item => {
        item.addEventListener('click', () => {
            const id = item.getAttribute('data-id');
            abrirNotificacao(id);
        });
    });
}

function atualizarBadgeUnificado() {
    const badge = document.getElementById('notificacoesBadge');
    if (!badge) return;

    const total = __notificacoesCache.filter(n => !n.lida).length + __lembretesCache.length;

    if (total > 0) {
        badge.textContent = total > 99 ? '99+' : total;
        badge.style.display = 'inline-block';
    } else {
        badge.style.display = 'none';
    }
}

async function abrirNotificacao(id) {
    try {
        const tk = localStorage.getItem('auth_token');
        await fetch(`/api/notificacoes/${id}/lida`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${tk}` }
        });
        carregarTudo();
    } catch (error) {
        console.error('Erro ao marcar como lida:', error);
    }
}

function abrirNotificacoes() {
    const dropdown = document.getElementById('notificacoesDropdown');
    if (!dropdown) return;

    const isVisible = dropdown.style.display === 'block';
    dropdown.style.display = isVisible ? 'none' : 'block';
    dropdown.classList.toggle('show', !isVisible);

    if (!isVisible) {
        carregarTudo();
    }
}

function fecharNotificacoes() {
    const dropdown = document.getElementById('notificacoesDropdown');
    if (dropdown) {
        dropdown.classList.remove('show');
        dropdown.style.display = 'none';
    }
}

async function marcarTodasLidas() {
    try {
        const tk = localStorage.getItem('auth_token');
        const response = await fetch('/api/notificacoes/marcar-todas-lidas', {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${tk}` }
        });
        const data = await response.json();
        if (data.success) {
            await carregarTudo();
            mostrarNotificacaoInterna('Notificações marcadas como lidas!', 'success');
        }
    } catch (error) {
        console.error('Erro:', error);
    }
}

async function limparMinhasNotificacoes(event) {
    try {
        const tk = localStorage.getItem('auth_token');
        const confirmacao = await confirmarInternoNotif('🗑️ Deseja excluir TODAS as suas notificações?\n\nEsta ação não pode ser desfeita.');
        if (!confirmacao) return;

        const response = await fetch('/api/notificacoes/limpar-minhas', {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${tk}`,
                'Content-Type': 'application/json'
            }
        });
        const data = await response.json();

        if (data.success) {
            __notificacoesCache = [];
            await carregarTudo();
            mostrarNotificacaoInterna('Notificações excluídas!', 'success');
        }
    } catch (error) {
        console.error('Erro:', error);
        mostrarNotificacaoInterna(error.message, 'error');
    }
}

// ============================================
// INICIALIZAÇÃO
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Inicializando Secretaria...');

    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    const userData = JSON.parse(localStorage.getItem('user_data') || '{}');
    const allowedRoles = ['secretaria', 'super_admin', 'admin'];

    if (!allowedRoles.includes(userData.role)) {
        alert('Acesso negado.');
        window.location.href = '/login.html';
        return;
    }

    // ✅ Preencher dados do usuário
    safeSetText('userName', userData.nome || 'Secretaria');
    safeSetText('userRole', 'Secretaria');
    safeSetText('dataAtual', new Date().toLocaleDateString('pt-BR'));

    console.log('✅ Usuário carregado:', userData.nome);

    await carregarFotoPerfil();
    configurarEventos();
    await carregarTurmasParaManual();

    // 🔔 Iniciar sistema de notificações
    setTimeout(iniciarSistemaNotificacoes, 500);

    // Iniciar scanner após delay
    setTimeout(() => {
        if (safeGet('modoAutomatico')?.offsetParent !== null) {
            iniciarScannerAutomatico();
        }
    }, 800);
});

window.addEventListener('beforeunload', () => {
    pararScannerAutomatico();
    if (notificacoesInterval) clearInterval(notificacoesInterval);
});

async function carregarFotoPerfil() {
    try {
        const response = await fetch('/api/perfil/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (data.success && data.perfil?.fotoPerfil) {
            const avatar = safeGet('userAvatar');
            if (avatar) {
                avatar.innerHTML = `<img src="${data.perfil.fotoPerfil}" alt="Foto" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
            }
        }
    } catch (error) {
        console.error('Erro ao carregar foto:', error);
    }
}

// ============================================
// EVENTOS
// ============================================
function configurarEventos() {
    safeGet('modoAutomaticoBtn')?.addEventListener('click', () => setModo('automatico'));
    safeGet('modoManualBtn')?.addEventListener('click', () => setModo('manual'));

    safeGet('filtroTurmaManual')?.addEventListener('change', () => carregarAlunosPorTurma());
    safeGet('filtroBuscaManual')?.addEventListener('input', () => filtrarAlunosManual());

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
}

// ============================================
// MODO (AUTO / MANUAL)
// ============================================
async function setModo(modo) {
    modoAtual = modo;
    const infoEl = safeGet('alunoInfo');
    if (infoEl) infoEl.style.display = 'none';
    currentAluno = null;

    if (modo === 'automatico') {
        safeGet('modoAutomaticoBtn')?.classList.add('active');
        safeGet('modoManualBtn')?.classList.remove('active');
        safeGet('modoAutomatico').style.display = 'block';
        safeGet('modoManual').style.display = 'none';
        await iniciarScannerAutomatico();
    } else {
        safeGet('modoManualBtn')?.classList.add('active');
        safeGet('modoAutomaticoBtn')?.classList.remove('active');
        safeGet('modoAutomatico').style.display = 'none';
        safeGet('modoManual').style.display = 'block';
        await pararScannerAutomatico();
        const turmaSelecionada = safeGet('filtroTurmaManual')?.value;
        if (turmaSelecionada) await carregarAlunosPorTurma();
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
        qrContainer.innerHTML = `
            <div class="camera-error-box">
                <div class="camera-error-icon">
                    <i class="fas fa-video-slash"></i>
                </div>
                <h4>Câmera não suportada</h4>
                <p>Este navegador não oferece suporte à câmera.<br>Use o modo manual para consultar.</p>
                <button class="btn-manual-fallback" onclick="setModo('manual')">
                    <i class="fas fa-users"></i> Usar Busca Manual
                </button>
            </div>`;
        return;
    }

    try {
        scannerAuto = new Html5Qrcode("qr-reader-auto-new");
        const config = { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 };

        await scannerAuto.start(
            { facingMode: "environment" },
            config,
            onScanSuccessAuto,
            () => {}
        );
        scannerAutoAtivo = true;
        console.log('✅ Scanner QR iniciado');
    } catch (err) {
        console.error('Erro ao iniciar scanner:', err);
        let msg = 'Não foi possível acessar a câmera.';
        if (err.message?.includes('NotFoundError')) msg = 'Nenhuma câmera encontrada neste dispositivo.';
        else if (err.message?.includes('NotAllowedError')) msg = 'Permissão de câmera foi negada.';
        else if (err.message?.includes('NotReadableError')) msg = 'A câmera está sendo usada por outro app.';

        qrContainer.innerHTML = `
            <div class="camera-error-box">
                <div class="camera-error-icon">
                    <i class="fas fa-video-slash"></i>
                </div>
                <h4>Câmera indisponível</h4>
                <p>${escapeHTML(msg)}<br>Use o modo manual para consultar.</p>
                <button class="btn-manual-fallback" onclick="setModo('manual')">
                    <i class="fas fa-users"></i> Usar Busca Manual
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
    if (!alunoId) {
        notificar('QR Code inválido', 'error');
        return;
    }
    await pararScannerAutomatico();
    await buscarAluno(alunoId);
}

function reiniciarScannerAutomatico() {
    setTimeout(() => {
        if (!scannerAutoAtivo && modoAtual === 'automatico') {
            iniciarScannerAutomatico();
        }
    }, 1000);
}

// ============================================
// BUSCA MANUAL
// ============================================
async function carregarTurmasParaManual() {
    try {
        const response = await fetch('/api/secretaria/justificativa/turmas', {
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

            const selectRelatorio = safeGet('filtroTurma');
            if (selectRelatorio) {
                selectRelatorio.innerHTML = '<option value="">Selecione...</option>';
                data.turmas.forEach(turma => {
                    selectRelatorio.innerHTML += `<option value="${escapeHTML(turma)}">${escapeHTML(turma)}</option>`;
                });
            }
        }
    } catch (error) {
        console.error('Erro ao carregar turmas:', error);
    }
}

async function carregarAlunosPorTurma() {
    const turma = safeGet('filtroTurmaManual')?.value;
    const container = safeGet('listaAlunosManual');

    if (!turma) {
        if (container) container.innerHTML = `
            <div class="empty-state-mini">
                <i class="fas fa-users"></i>
                <p>Selecione uma turma</p>
            </div>`;
        return;
    }

    if (container) {
        container.innerHTML = `
            <div class="text-center py-3">
                <div class="loading-spinner"></div>
                <p>Carregando alunos...</p>
            </div>`;
    }

    try {
        const response = await fetch(`/api/secretaria/justificativa/alunos-por-turma?turma=${encodeURIComponent(turma)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (data.success && Array.isArray(data.alunos)) {
            alunosPorTurma = data.alunos;
            filtrarAlunosManual();
        } else {
            if (container) container.innerHTML = `
                <div class="empty-state-mini">
                    <i class="fas fa-user-slash"></i>
                    <p>Nenhum aluno encontrado</p>
                </div>`;
        }
    } catch (error) {
        console.error('Erro:', error);
        if (container) container.innerHTML = `
            <div class="empty-state-mini">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Erro ao carregar alunos</p>
            </div>`;
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
        container.innerHTML = `
            <div class="empty-state-mini">
                <i class="fas fa-user-slash"></i>
                <p>Nenhum aluno encontrado</p>
            </div>`;
        return;
    }

    let html = '<div class="lista-alunos-grid">';
    filtrados.forEach(aluno => {
        html += `
            <div class="aluno-item" data-aluno-id="${aluno.id}" data-aluno-nome="${escapeHTML(aluno.nome)}">
                <div class="aluno-item-avatar">
                    <img src="${aluno.fotoPerfil || gerarAvatarSVG(aluno.nome)}" alt="">
                </div>
                <div class="aluno-item-info">
                    <strong>${escapeHTML(aluno.nome)}</strong>
                    <small>${escapeHTML(aluno.matricula || 'Sem matrícula')}${aluno.curso ? ' • ' + escapeHTML(aluno.curso) : ''}</small>
                </div>
                <i class="fas fa-chevron-right aluno-item-arrow"></i>
            </div>`;
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
            item.innerHTML = `
                <div class="aluno-item-avatar">
                    <div class="loading-spinner" style="width:22px;height:22px;border-width:3px;"></div>
                </div>
                <div class="aluno-item-info">
                    <strong>${escapeHTML(nome)}</strong>
                    <small style="color:#10b981;">Processando...</small>
                </div>`;

            buscarAluno(id);
        });
    });
}

// ============================================
// BUSCAR ALUNO E EXIBIR JUSTIFICATIVAS
// ============================================
async function buscarAluno(alunoId) {
    try {
        await pararScannerAutomatico();

        const response = await fetch(`/api/secretaria/justificativa/aluno/${alunoId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
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
        console.error('Erro:', error);
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

    safeGet('consultaDataInicio').value = trintaDiasAtras.toISOString().split('T')[0];
    safeGet('consultaDataFim').value = hoje.toISOString().split('T')[0];

    motivoConsulta = 'todos';
    safeGet('consultaMotivo').value = 'todos';
    container.querySelectorAll('.tipo-card').forEach(c => c.classList.remove('selected'));
    container.querySelector('.tipo-card[data-tipo="todos"]')?.classList.add('selected');

    const fotoEl = safeGet('alunoFoto');
    if (fotoEl) {
        fotoEl.onerror = null;
        fotoEl.src = aluno.fotoPerfil || gerarAvatarSVG(aluno.nome);
        fotoEl.onerror = function() {
            this.onerror = null;
            this.src = gerarAvatarSVG(aluno.nome);
        };
    }

    safeSetText('alunoNome', aluno.nome || '-');
    safeSetText('alunoMatricula', aluno.matricula || 'Não informada');
    safeSetText('alunoTurma', aluno.turma || 'Não informada');
    safeSetText('alunoCurso', aluno.curso || 'Não informado');

    const tagCurso = safeGet('tagCurso');
    if (tagCurso) tagCurso.style.display = aluno.curso ? 'inline-flex' : 'none';

    const statusDiv = safeGet('statusAluno');
    if (statusDiv && data.estatisticas) {
        statusDiv.innerHTML = `
            <div class="aluno-stats-mini">
                <div class="stat-mini-item">
                    <i class="fas fa-file-alt"></i>
                    <div>
                        <div class="stat-mini-value">${data.estatisticas.totalJustificativas || 0}</div>
                        <div class="stat-mini-label">Total de Justificativas</div>
                    </div>
                </div>
                <div class="stat-mini-item">
                    <i class="fas fa-calendar-check"></i>
                    <div>
                        <div class="stat-mini-value">${data.estatisticas.justificativasUltimos30 || 0}</div>
                        <div class="stat-mini-label">Últimos 30 dias</div>
                    </div>
                </div>
            </div>`;
    } else if (statusDiv) {
        statusDiv.innerHTML = '';
    }

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
    if (!currentAluno) {
        notificar('Nenhum aluno selecionado', 'warning');
        return;
    }

    const container = safeGet('listaJustificativasAluno');
    if (!container) return;

    const dataInicio = safeGet('consultaDataInicio')?.value || '';
    const dataFim = safeGet('consultaDataFim')?.value || '';
    const motivo = safeGet('consultaMotivo')?.value || 'todos';

    container.innerHTML = `
        <div class="text-center py-3">
            <div class="loading-spinner"></div>
            <p>Buscando justificativas...</p>
        </div>`;

    try {
        const params = new URLSearchParams();
        if (dataInicio) params.append('dataInicio', dataInicio);
        if (dataFim) params.append('dataFim', dataFim);
        if (motivo && motivo !== 'todos') params.append('motivo', motivo);

        const response = await fetch(
            `/api/secretaria/justificativa/por-aluno/${currentAluno.id}?${params.toString()}`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );

        const data = await response.json();

        if (!data.success) {
            container.innerHTML = `<div class="alert alert-danger">Erro ao buscar justificativas</div>`;
            return;
        }

        const countEl = safeGet('countJustificativas');
        if (countEl) countEl.textContent = data.total || 0;

        if (!data.registros || data.registros.length === 0) {
            container.innerHTML = `
                <div class="empty-relatorio" style="padding: 40px 20px;">
                    <i class="fas fa-inbox"></i>
                    <h5>Nenhuma justificativa encontrada</h5>
                    <p>Não há registros para este aluno no período selecionado.</p>
                </div>`;
            return;
        }

        container.innerHTML = `
            <div class="justificativas-lista">
                ${data.registros.map(j => `
                    <div class="justificativa-item">
                        <div class="justificativa-header-item">
                            <span class="badge-motivo-item">${escapeHTML(j.motivoLabel)}</span>
                            <span class="justificativa-data-item">
                                <i class="fas fa-calendar"></i> ${j.dataFormatada}
                            </span>
                        </div>
                        ${j.observacoes ? `
                            <div class="justificativa-obs-item">
                                <i class="fas fa-comment"></i>
                                <span>${escapeHTML(j.observacoes.substring(0, 150))}${j.observacoes.length > 150 ? '...' : ''}</span>
                            </div>
                        ` : ''}
                        ${j.responsavelNome ? `
                            <div class="justificativa-resp-item">
                                <i class="fas fa-user-shield"></i>
                                <span><strong>${escapeHTML(j.responsavelNome)}</strong></span>
                            </div>
                        ` : ''}
                        <div class="justificativa-footer-item">
                            <span class="badge-assinatura-item ${j.temAssinatura ? 'assinado' : 'pendente'}">
                                <i class="fas fa-signature"></i>
                                ${j.temAssinatura ? 'Assinado' : 'Sem assinatura'}
                            </span>
                            <div class="justificativa-actions-item">
                                <button class="btn-action-item btn-view-item" onclick="verJustificativa('${j.id}')" title="Visualizar">
                                    <i class="fas fa-eye"></i>
                                </button>
                                <button class="btn-action-item btn-print-item" onclick="imprimirJustificativa('${j.id}')" title="Imprimir">
                                    <i class="fas fa-print"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>`;
    } catch (error) {
        console.error('Erro:', error);
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
    } else {
        const selectTurma = safeGet('filtroTurmaManual');
        const inputBusca = safeGet('filtroBuscaManual');
        if (selectTurma) selectTurma.value = '';
        if (inputBusca) inputBusca.value = '';
        const lista = safeGet('listaAlunosManual');
        if (lista) lista.innerHTML = `
            <div class="empty-state-mini">
                <i class="fas fa-users"></i>
                <p>Selecione uma turma para ver os alunos</p>
            </div>`;
    }
}

// ============================================
// VISUALIZAR JUSTIFICATIVA (MODAL)
// ============================================
async function verJustificativa(id) {
    if (!id) return;

    try {
        const response = await fetch(`/api/secretaria/justificativa/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (!data.success || !data.autorizacao) {
            notificar('Erro ao carregar justificativa', 'error');
            return;
        }

        const a = data.autorizacao;

        const old = safeGet('modalVerJustificativa');
        if (old) old.remove();

        const modalHtml = `
            <div class="modal fade" id="modalVerJustificativa" tabindex="-1">
                <div class="modal-dialog modal-lg modal-dialog-scrollable">
                    <div class="modal-content">
                        <div class="modal-header modal-header-success">
                            <h5 class="modal-title">
                                <i class="fas fa-file-alt"></i> Detalhes da Justificativa
                            </h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="modal-aluno-header">
                                <img src="${gerarAvatarSVG(a.alunoNome)}" alt="">
                                <div class="modal-aluno-info">
                                    <h5>${escapeHTML(a.alunoNome)}</h5>
                                    <small>
                                        <i class="fas fa-id-card"></i> ${escapeHTML(a.alunoMatricula || '-')} • 
                                        <i class="fas fa-graduation-cap"></i> ${escapeHTML(a.alunoTurma || '-')}
                                        ${a.alunoCurso ? ` • ${escapeHTML(a.alunoCurso)}` : ''}
                                    </small>
                                </div>
                                <span class="badge-motivo-modal">${escapeHTML(a.motivoLabel)}</span>
                            </div>

                            <div class="modal-detail-row">
                                <strong><i class="fas fa-calendar"></i> Data:</strong>
                                <span>${a.dataFormatada || '-'}</span>
                            </div>

                            ${a.observacoes ? `
                                <div class="modal-section">
                                    <h6><i class="fas fa-comment"></i> Observações</h6>
                                    <p>${escapeHTML(a.observacoes)}</p>
                                </div>
                            ` : ''}

                            ${a.responsavelNome ? `
                                <div class="modal-section">
                                    <h6><i class="fas fa-user-shield"></i> Responsável</h6>
                                    <p><strong>Nome:</strong> ${escapeHTML(a.responsavelNome)}</p>
                                    ${a.responsavelCPF ? `<p><strong>CPF:</strong> ${escapeHTML(a.responsavelCPF)}</p>` : ''}
                                    ${a.responsavelTelefone ? `<p><strong>Telefone:</strong> ${escapeHTML(a.responsavelTelefone)}</p>` : ''}
                                </div>
                            ` : ''}

                            ${a.temAssinatura ? `
                                <div class="modal-section">
                                    <h6><i class="fas fa-signature"></i> Assinatura Digital</h6>
                                    <div class="modal-assinatura-preview">
                                        <img src="${a.assinaturaBase64}" alt="Assinatura">
                                    </div>
                                </div>
                            ` : ''}

                            <div class="modal-detail-row">
                                <strong><i class="fas fa-user-tie"></i> Registrado por:</strong>
                                <span>${escapeHTML(a.registradoPorNome || '-')}</span>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn-modal btn-modal-secondary" data-bs-dismiss="modal">
                                <i class="fas fa-times"></i> Fechar
                            </button>
                            <button type="button" class="btn-modal btn-modal-success" onclick="imprimirJustificativa('${a.id}')">
                                <i class="fas fa-print"></i> Imprimir
                            </button>
                        </div>
                    </div>
                </div>
            </div>`;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        if (typeof bootstrap === 'undefined') {
            notificar('Erro: Bootstrap não carregado', 'error');
            return;
        }

        new bootstrap.Modal(safeGet('modalVerJustificativa')).show();
    } catch (error) {
        console.error('Erro:', error);
        notificar('Erro ao carregar justificativa', 'error');
    }
}

// ============================================
// IMPRIMIR JUSTIFICATIVA
// ============================================
async function imprimirJustificativa(id) {
    if (!id) return;

    try {
        const response = await fetch(`/api/secretaria/justificativa/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (!data.success || !data.autorizacao) {
            notificar('Erro ao carregar justificativa', 'error');
            return;
        }

        const a = data.autorizacao;

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
        win.document.write(gerarHTMLImpressao(a, qr));
        win.document.close();
        win.onload = () => setTimeout(() => win.print(), 500);
    } catch (error) {
        console.error('Erro:', error);
        notificar('Erro ao imprimir', 'error');
    }
}

function gerarHTMLImpressao(a, qrCodeUrl) {
    const logo = '/uploads/logo-iema.png';
    const carimbo = '/icons/assinatura_gestao.ico';
    const dataGeracao = new Date().toLocaleString('pt-BR');

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
            .btn-print:hover { background: #059669; }

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
            <div class="info-item"><span class="info-label">Data:</span><span>${a.dataFormatada || '-'}</span></div>
            <div class="info-item"><span class="info-label">Registrado por:</span><span>${escapeHTML(a.registradoPorNome || '-')}</span></div>
        </div>

        <div class="motivo-box">
            <strong>📌 Motivo:</strong>
            <p>☑ ${escapeHTML(a.motivoLabel || '-')}</p>
        </div>

        ${a.responsavelNome ? `
            <div class="section-title">👤 Responsável</div>
            <div class="descricao-box">
                <strong>Nome:</strong> ${escapeHTML(a.responsavelNome)}
                ${a.responsavelCPF ? ` • <strong>CPF:</strong> ${escapeHTML(a.responsavelCPF)}` : ''}
                ${a.responsavelTelefone ? ` • <strong>Telefone:</strong> ${escapeHTML(a.responsavelTelefone)}` : ''}
            </div>
        ` : ''}

        ${a.observacoes ? `
            <div class="section-title">💬 Observações</div>
            <div class="descricao-box">${escapeHTML(a.observacoes).replace(/\n/g, '<br>')}</div>
        ` : ''}

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
            <p>Documento gerado em <strong>${dataGeracao}</strong> — EducaPleno — Secretaria</p>
        </div>
    </body>
    </html>`;
}

// ============================================
// AUTOCOMPLETE RELATÓRIO
// ============================================
function configurarAutocompleteRelatorio() {
    const input = safeGet('buscaAlunoRelatorio');
    const listEl = safeGet('autocompleteAlunoList');

    if (!input || !listEl) return;
    if (!autocompleteState.carregado && !autocompleteState.carregando) {
        carregarAlunosParaAutocomplete();
    }
}

async function carregarAlunosParaAutocomplete() {
    autocompleteState.carregando = true;
    try {
        const turmasResponse = await fetch('/api/secretaria/justificativa/turmas', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const turmasData = await turmasResponse.json();
        if (!turmasData.success) {
            autocompleteState.carregando = false;
            return;
        }

        const todosAlunos = [];
        for (const turma of turmasData.turmas) {
            try {
                const res = await fetch(
                    `/api/secretaria/justificativa/alunos-por-turma?turma=${encodeURIComponent(turma)}`,
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
            } catch (e) { console.warn(e); }
        }

        todosAlunos.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
        autocompleteState.alunos = todosAlunos;
        autocompleteState.carregado = true;
        autocompleteState.carregando = false;
        console.log(`✅ ${todosAlunos.length} alunos carregados para autocomplete`);
    } catch (error) {
        console.error('Erro ao carregar alunos:', error);
        autocompleteState.carregando = false;
    }
}

function filtrarAutocompleteRelatorio(termo) {
    const listEl = safeGet('autocompleteAlunoList');
    if (!listEl) return;

    if (!autocompleteState.carregado) {
        listEl.innerHTML = '<div style="padding:15px;text-align:center;color:#6b7280;">Carregando...</div>';
        listEl.style.display = 'block';
        carregarAlunosParaAutocomplete().then(() => {
            if (autocompleteState.carregado) filtrarAutocompleteRelatorio(termo);
        });
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
        </div>
    `).join('');

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
    if (!tipo) {
        notificar('Selecione o tipo de relatório', 'warning');
        return;
    }

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
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (data.success) {
            relatorioAtual = data;
            tipoRelatorioAtual = tipo;
            exibirRelatorio(data, tipo);

            safeGet('btnExportarCSV').disabled = false;
            safeGet('btnExportarPDF').disabled = false;

            const total = data.totalRegistros || 0;
            if (total === 0) {
                notificar('⚠️ Nenhum registro encontrado', 'warning');
            }
        } else {
            notificar('Erro: ' + (data.error || ''), 'error');
        }
    } catch (error) {
        console.error('Erro:', error);
        notificar('Erro ao gerar relatório', 'error');
    }
}

function exibirRelatorio(data, tipo) {
    const container = safeGet('resultadoRelatorio');
    if (!container) return;

    if (tipo === 'geral') {
        container.innerHTML = `
            <div class="relatorio-resultado">
                <h4><i class="fas fa-chart-bar"></i> Relatório Geral de Justificativas</h4>
                <p class="relatorio-total">Total: <strong>${data.totalRegistros || 0}</strong></p>

                <h5><i class="fas fa-tags"></i> Por Motivo</h5>
                <div class="row">
                    ${(data.porMotivo || []).map(m => `
                        <div class="col-md-4 mb-2">
                            <div class="stat-card-verde">
                                <strong>${escapeHTML(m.label)}</strong>
                                <span>${m.count}</span>
                            </div>
                        </div>`).join('')}
                </div>

                <h5><i class="fas fa-users"></i> Por Turma</h5>
                <div class="table-responsive">
                    <table class="table table-sm">
                        <thead><tr><th>Turma</th><th>Total</th><th>Alunos</th></tr></thead>
                        <tbody>
                            ${(data.porTurma || []).map(t => `
                                <tr>
                                    <td>${escapeHTML(t.turma)}</td>
                                    <td><span class="badge bg-success">${t.total}</span></td>
                                    <td>${t.totalAlunos}</td>
                                </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>`;
    } else if (tipo === 'turma') {
        container.innerHTML = `
            <div class="relatorio-resultado">
                <h4><i class="fas fa-users"></i> Relatório da Turma: ${escapeHTML(data.turma || '')}</h4>
                <p class="relatorio-total">Total: <strong>${data.estatisticas?.totalRegistros || 0}</strong> | Alunos: <strong>${data.estatisticas?.totalAlunos || 0}</strong></p>

                <h5><i class="fas fa-list"></i> Por Aluno</h5>
                <div class="table-responsive">
                    <table class="table table-sm">
                        <thead><tr><th>Aluno</th><th>Matrícula</th><th>Total</th></tr></thead>
                        <tbody>
                            ${(data.porAluno || []).map(a => `
                                <tr>
                                    <td>${escapeHTML(a.alunoNome)}</td>
                                    <td>${escapeHTML(a.alunoMatricula || '-')}</td>
                                    <td><span class="badge bg-success">${a.total}</span></td>
                                </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>`;
    } else if (tipo === 'aluno') {
        container.innerHTML = `
            <div class="relatorio-resultado">
                <h4><i class="fas fa-user-graduate"></i> Relatório: ${escapeHTML(data.aluno?.nome || '')}</h4>
                <p class="relatorio-total">Turma: ${escapeHTML(data.aluno?.turma || '-')} | Total: <strong>${data.estatisticas?.totalRegistros || 0}</strong></p>

                <h5><i class="fas fa-history"></i> Histórico</h5>
                <div class="table-responsive">
                    <table class="table table-sm">
                        <thead><tr><th>Data</th><th>Motivo</th><th>Observações</th></tr></thead>
                        <tbody>
                            ${(data.registros || []).map(a => `
                                <tr>
                                    <td>${a.dataFormatada}</td>
                                    <td>${escapeHTML(a.motivoLabel)}</td>
                                    <td>${escapeHTML((a.observacoes || '').substring(0, 100))}</td>
                                </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
            </div>`;
    }
}

function exportarCSV() {
    if (!relatorioAtual) {
        notificar('⚠️ Gere um relatório primeiro', 'warning');
        return;
    }

    const registros = relatorioAtual.registros || [];
    if (registros.length === 0) {
        notificar('⚠️ Nenhum registro para exportar', 'warning');
        return;
    }

    let csv = "Data,Aluno,Matrícula,Turma,Motivo,Observações,Responsável\n";

    registros.forEach(a => {
        csv += [
            a.dataFormatada || '',
            `"${(a.alunoNome || '').replace(/"/g, '""')}"`,
            `"${(a.alunoMatricula || '').replace(/"/g, '""')}"`,
            `"${(a.alunoTurma || '').replace(/"/g, '""')}"`,
            `"${(a.motivoLabel || '').replace(/"/g, '""')}"`,
            `"${(a.observacoes || '').replace(/"/g, '""')}"`,
            `"${(a.responsavelNome || '').replace(/"/g, '""')}"`
        ].join(',') + '\n';
    });

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `justificativas-secretaria_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);

    notificar('✅ CSV exportado com sucesso!', 'success');
}

function exportarPDF() {
    if (!relatorioAtual) {
        notificar('⚠️ Gere um relatório primeiro', 'warning');
        return;
    }

    const html = gerarHTMLRelatorio(relatorioAtual, tipoRelatorioAtual);
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.onload = () => setTimeout(() => win.print(), 500);
}

function gerarHTMLRelatorio(data, tipo) {
    const logo = '/uploads/logo-iema.png';
    const carimbo = '/icons/assinatura_gestao.ico';
    const dataGeracao = new Date().toLocaleString('pt-BR');

    let titulo = 'Relatório de Justificativas - Secretaria';
    let subtitulo = '';
    let tabelaHTML = '';

    if (tipo === 'geral') {
        subtitulo = 'Relatório Geral';
        tabelaHTML = `
            <div class="section-title">📊 Distribuição por Motivo</div>
            <table>
                <thead><tr><th>Motivo</th><th style="width:120px;text-align:center;">Quantidade</th></tr></thead>
                <tbody>
                    ${(data.porMotivo || []).map(m => `
                        <tr><td><strong>${escapeHTML(m.label)}</strong></td><td style="text-align:center;">${m.count}</td></tr>
                    `).join('') || '<tr><td colspan="2" style="text-align:center;">Nenhum dado</td></tr>'}
                </tbody>
            </table>
            <div class="section-title">🏫 Distribuição por Turma</div>
            <table>
                <thead><tr><th>Turma</th><th style="width:120px;text-align:center;">Total</th><th style="width:120px;text-align:center;">Alunos</th></tr></thead>
                <tbody>
                    ${(data.porTurma || []).map(t => `
                        <tr>
                            <td><strong>${escapeHTML(t.turma)}</strong></td>
                            <td style="text-align:center;">${t.total}</td>
                            <td style="text-align:center;">${t.totalAlunos}</td>
                        </tr>`).join('') || '<tr><td colspan="3" style="text-align:center;">Nenhum dado</td></tr>'}
                </tbody>
            </table>`;
    } else if (tipo === 'turma') {
        subtitulo = `Turma: ${data.turma || ''}`;
        tabelaHTML = `
            <div class="section-title">👥 Registros por Aluno</div>
            <table>
                <thead><tr><th>Aluno</th><th>Matrícula</th><th style="width:100px;text-align:center;">Total</th></tr></thead>
                <tbody>
                    ${(data.porAluno || []).map(a => `
                        <tr>
                            <td><strong>${escapeHTML(a.alunoNome || '')}</strong></td>
                            <td>${escapeHTML(a.alunoMatricula || '-')}</td>
                            <td style="text-align:center;">${a.total}</td>
                        </tr>`).join('') || '<tr><td colspan="3" style="text-align:center;">Nenhum dado</td></tr>'}
                </tbody>
            </table>`;
    } else if (tipo === 'aluno') {
        titulo = 'Relatório Individual - Justificativas';
        subtitulo = `${data.aluno?.nome || ''} — ${data.aluno?.turma || ''}`;
        tabelaHTML = `
            <div class="section-title">📋 Histórico de Justificativas</div>
            <table>
                <thead>
                    <tr><th>Data</th><th>Motivo</th><th>Observações</th></tr>
                </thead>
                <tbody>
                    ${(data.registros || []).map(a => `
                        <tr>
                            <td>${a.dataFormatada || '-'}</td>
                            <td>${escapeHTML(a.motivoLabel || '')}</td>
                            <td>${escapeHTML((a.observacoes || '').substring(0, 80))}</td>
                        </tr>`).join('') || '<tr><td colspan="3" style="text-align:center;">Nenhum registro</td></tr>'}
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
            .btn-print:hover { background: #059669; }
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

// Notificações
window.abrirNotificacoes = abrirNotificacoes;
window.fecharNotificacoes = fecharNotificacoes;
window.marcarTodasLidas = marcarTodasLidas;
window.limparMinhasNotificacoes = limparMinhasNotificacoes;
window.mostrarNotificacaoInterna = mostrarNotificacaoInterna;
window.confirmarInternoNotif = confirmarInternoNotif;
window.abrirNotificacao = abrirNotificacao;