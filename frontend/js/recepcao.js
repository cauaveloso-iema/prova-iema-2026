// ============================================
// RECEPÇÃO - VERIFICAÇÃO DE AUTORIZAÇÕES
// + FILTROS DE PESQUISA (RESUMO + HISTÓRICO)
// ============================================

let token = localStorage.getItem('auth_token');
let currentAluno = null;
let modoAtual = 'automatico';
let scannerAuto = null;
let scannerAutoAtivo = false;
let turmasDisponiveis = [];
let alunosPorTurma = [];
let dataVerificacaoAtual = null;

// Paginação do resumo
let paginaAtualResumoDia = 1;
let totalPaginasResumoDia = 0;
let totalRegistrosResumoDia = 0;
const itensPorPaginaResumoDia = 10;

// 🆕 Estado dos filtros do histórico de atrasos
const filtrosAtrasos = {
    motivo: 'todos',
    busca: '',
    dataInicio: '',
    dataFim: ''
};

// ============================================
// CACHES GLOBAIS DE NOTIFICAÇÕES
// ============================================
window.__notificacoesCache = window.__notificacoesCache || [];
window.__lembretesCache    = window.__lembretesCache    || [];

// ============================================
// ESTADO DO MODAL DE ASSINATURA
// ============================================
const estadoAssinatura = {
    autorizacaoId: null,
    alunoId: null,
    alunoNome: null,
    alunoTurma: null,
    alunoMatricula: null,
    alunoCurso: null,
    responsavelNome: null,
    sessaoId: null,
    urlAssinatura: null,
    qrCodeDataUrl: null,
    monitoramentoInterval: null,
    modalInstance: null,
    canvas: null,
    ctx: null,
    desenhando: false,
    temAssinatura: false,
    lastX: 0,
    lastY: 0
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

function gerarUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================
// INICIALIZAÇÃO
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    
    if (!token) { 
        window.location.href = '/login.html'; 
        return; 
    }
    
    const userData = JSON.parse(localStorage.getItem('user_data') || '{}');
    const allowedRoles = ['recepcao', 'gestao_geral', 'super_admin', 'admin'];
    
    if (!allowedRoles.includes(userData.role)) {
        notificar('Acesso negado.');
        window.location.href = '/login.html';
        return;
    }
    
    safeSetText('userName', userData.nome || 'Recepção');
    safeSetText('userRole', userData.role === 'recepcao' ? 'Recepção' : 'Gestão Geral');
    
    const hoje = getDataLocalISO();
    safeGet('dataVerificacao').value = hoje;
    dataVerificacaoAtual = hoje;
    
    await carregarFotoPerfil();
    await carregarTurmasParaManual();
    await carregarTurmasResumo();
    
    safeGet('modoAutomaticoBtn')?.addEventListener('click', () => setModo('automatico'));
    safeGet('modoManualBtn')?.addEventListener('click', () => setModo('manual'));
    safeGet('filtroTurmaManual')?.addEventListener('change', () => carregarAlunosPorTurma());
    safeGet('filtroBuscaManual')?.addEventListener('input', () => filtrarAlunosManual());
    safeGet('dataVerificacao')?.addEventListener('change', onDataChange);
    
    // 🆕 Filtros do Resumo do Dia
    safeGet('filtroResumoTurma')?.addEventListener('change', () => {
        paginaAtualResumoDia = 1;
        carregarResumoDia();
    });
    safeGet('filtroResumoTipo')?.addEventListener('change', () => {
        paginaAtualResumoDia = 1;
        carregarResumoDia();
    });
    let __timeoutBuscaResumo = null;
    safeGet('filtroResumoBusca')?.addEventListener('input', () => {
        clearTimeout(__timeoutBuscaResumo);
        __timeoutBuscaResumo = setTimeout(() => {
            paginaAtualResumoDia = 1;
            carregarResumoDia();
        }, 400);
    });
    safeGet('btnLimparFiltrosResumo')?.addEventListener('click', limparFiltrosResumo);
    
    setTimeout(() => iniciarScannerAutomatico(), 1000);
    carregarResumoDia();
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

// ============================================================
// HEADER
// ============================================================
function atualizarRelogioRecepcao() {
    const elTempo = document.getElementById('relogioTempoReal');
    const elData = document.getElementById('relogioData');
    if (!elTempo) return;

    const agora = new Date();
    elTempo.textContent = `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}:${String(agora.getSeconds()).padStart(2, '0')}`;

    if (elData) {
        const dataFormatada = agora.toLocaleDateString('pt-BR', {
            weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
        });
        elData.textContent = dataFormatada.replace(/\./g, '').replace(/,/g, ' •');
    }
}

function toggleUserMenu(event) {
    if (event) event.stopPropagation();
    const dropdown = document.getElementById('userDropdown');
    const chevron = document.getElementById('userChevron');
    if (!dropdown) return;

    const isShowing = dropdown.classList.contains('show');
    if (isShowing) {
        dropdown.classList.remove('show');
        if (chevron) chevron.style.transform = 'rotate(0deg)';
    } else {
        dropdown.classList.add('show');
        if (chevron) chevron.style.transform = 'rotate(180deg)';
    }
}

function abrirMenuNotificacoesSeguro(event) {
    if (event) event.stopPropagation();
    const userDropdown = document.getElementById('userDropdown');
    const chevron = document.getElementById('userChevron');
    if (userDropdown) userDropdown.classList.remove('show');
    if (chevron) chevron.style.transform = 'rotate(0deg)';

    const notifDropdown = document.getElementById('notificacoesDropdown');
    if (notifDropdown) {
        notifDropdown.classList.add('show');
        notifDropdown.style.display = 'block';
    }
    if (typeof carregarTudo === 'function') carregarTudo();
}

function atualizarBadgeUnificado() {
    let total = 0;
    try {
        const naoLidas = (window.__notificacoesCache || []).filter(n => !n.lida).length;
        const lembretes = (window.__lembretesCache || []).length;
        total = naoLidas + lembretes;
    } catch (e) { total = 0; }

    const badgeDot  = document.getElementById('userNotificationBadge');
    const menuBadge = document.getElementById('menuNotifBadge');
    const trigger   = document.getElementById('userTrigger');

    if (total > 0) {
        if (badgeDot)  badgeDot.style.display = 'block';
        if (menuBadge) {
            menuBadge.style.display = 'inline-block';
            menuBadge.textContent = total > 99 ? '99+' : total;
        }
        if (trigger) trigger.classList.add('tem-notificacao');
    } else {
        if (badgeDot)  badgeDot.style.display = 'none';
        if (menuBadge) menuBadge.style.display = 'none';
        if (trigger) trigger.classList.remove('tem-notificacao');
    }
}

async function carregarFotoPerfilRecepcao() {
    try {
        const token = localStorage.getItem('auth_token');
        if (!token) return;
        const response = await fetch('/api/perfil/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success && data.perfil?.fotoPerfil) {
            const avatar = document.getElementById('userAvatar');
            if (avatar) avatar.innerHTML = `<img src="${data.perfil.fotoPerfil}" alt="Foto">`;
        }
    } catch (error) {
        console.error('Erro ao carregar foto do perfil:', error);
    }
}

function preencherDadosUsuarioHeader() {
    try {
        const userData = JSON.parse(localStorage.getItem('user_data') || '{}');
        const nameEl = document.getElementById('userName');
        const roleEl = document.getElementById('userRole');
        if (nameEl && userData.nome) nameEl.textContent = userData.nome;
        if (roleEl) roleEl.textContent = userData.role === 'super_admin' ? 'Super Admin' : 'Recepção';
    } catch (e) {}
}

function atualizarBoasVindasETurnoRecepcao() {
    try {
        const userData = JSON.parse(localStorage.getItem('user_data') || '{}');
        const nomeEl = document.getElementById('headerNomeUsuario');
        if (nomeEl && userData.nome) nomeEl.textContent = userData.nome.split(' ')[0];
    } catch (e) {}

    const agora = new Date();
    const hora = agora.getHours();
    let turno = 'Matutino';
    let icone = 'fa-sun text-warning';

    if (hora >= 12 && hora < 18) {
        turno = 'Vespertino';
        icone = 'fa-cloud-sun text-warning';
    } else if (hora >= 18 || hora < 5) {
        turno = 'Noturno';
        icone = 'fa-moon text-primary';
    }

    const turnoEl = document.getElementById('headerTurno');
    const iconeEl = document.getElementById('headerTurnoIcone');
    if (turnoEl) turnoEl.textContent = turno;
    if (iconeEl) iconeEl.className = `fas ${icone} me-1`;
}

document.addEventListener('click', function (event) {
    const userContainer = document.getElementById('userMenuContainer');
    const userDropdown = document.getElementById('userDropdown');
    const chevron = document.getElementById('userChevron');
    if (userContainer && !userContainer.contains(event.target)) {
        if (userDropdown) userDropdown.classList.remove('show');
        if (chevron) chevron.style.transform = 'rotate(0deg)';
    }

    const notifDropdown = document.getElementById('notificacoesDropdown');
    const containerSino = document.getElementById('containerSinoOriginal');
    if (notifDropdown && notifDropdown.classList.contains('show')) {
        if (containerSino && !containerSino.contains(event.target)) {
            if (typeof fecharNotificacoes === 'function') fecharNotificacoes();
            else {
                notifDropdown.classList.remove('show');
                notifDropdown.style.display = 'none';
            }
        }
    }
});

document.addEventListener('DOMContentLoaded', function () {
    atualizarRelogioRecepcao();
    setInterval(atualizarRelogioRecepcao, 1000);
    preencherDadosUsuarioHeader();
    atualizarBoasVindasETurnoRecepcao();
    setInterval(atualizarBoasVindasETurnoRecepcao, 60000);
    carregarFotoPerfilRecepcao();
    setTimeout(() => {
        if (typeof carregarTudo === 'function') carregarTudo();
    }, 800);
});

// ============================================
// FILTRO DE DATA
// ============================================
function onDataChange() {
    const data = safeGet('dataVerificacao')?.value;
    if (!data) return;
    
    dataVerificacaoAtual = data;
    paginaAtualResumoDia = 1;
    
    const hoje = getDataLocalISO();
    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);
    const ontemISO = getDataLocalISO(ontem);
    
    const badge = safeGet('dataSelecionadaBadge');
    if (badge) {
        if (data === hoje) {
            badge.className = 'badge bg-success';
            badge.innerHTML = '<i class="fas fa-calendar-check"></i> Hoje';
        } else if (data === ontemISO) {
            badge.className = 'badge bg-info';
            badge.innerHTML = '<i class="fas fa-calendar-minus"></i> Ontem';
        } else {
            badge.className = 'badge bg-primary';
            badge.innerHTML = '<i class="fas fa-calendar"></i> ' + 
                new Date(data + 'T12:00:00').toLocaleDateString('pt-BR');
        }
    }
    
    if (currentAluno) verificarAutorizacao(currentAluno.id);
    carregarResumoDia();
}

function irParaHoje() {
    safeGet('dataVerificacao').value = getDataLocalISO();
    onDataChange();
}

function irParaOntem() {
    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);
    safeGet('dataVerificacao').value = getDataLocalISO(ontem);
    onDataChange();
}

// ============================================
// SCANNER
// ============================================
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

async function reiniciarScannerAutomatico() {
    setTimeout(() => {
        if (!scannerAutoAtivo && modoAtual === 'automatico') iniciarScannerAutomatico();
    }, 1000);
}

// ============================================
// MODO (AUTO/MANUAL)
// ============================================
async function setModo(modo) {
    modoAtual = modo;
    safeGet('resultadoConsulta').style.display = 'none';
    currentAluno = null;
    
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

// ============================================
// LISTA DE ALUNOS (MANUAL)
// ============================================
async function carregarTurmasParaManual() {
    try {
        const response = await fetch('/api/recepcao/turmas', {
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

async function carregarTurmasResumo() {
    try {
        const response = await fetch('/api/recepcao/turmas', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success && Array.isArray(data.turmas)) {
            const select = safeGet('filtroResumoTurma');
            if (select) {
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
        const response = await fetch(`/api/recepcao/alunos-por-turma?turma=${encodeURIComponent(turma)}`, {
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
                <i class="fas fa-search fa-2x text-primary"></i>
            </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
    
    container.querySelectorAll('.list-group-item').forEach(item => {
        item.addEventListener('click', () => {
            selecionarAluno(item.getAttribute('data-aluno-id'), item);
        });
    });
}

async function selecionarAluno(alunoId, itemEl) {
    if (itemEl) {
        itemEl.style.background = '#dbeafe';
        itemEl.style.borderColor = '#1e3c72';
        itemEl.style.pointerEvents = 'none';
    }
    try { await buscarAluno(alunoId); } catch (error) { console.error('Erro:', error); }
}

// ============================================
// BUSCAR ALUNO / VERIFICAR
// ============================================
async function buscarAluno(alunoId) {
    try {
        await pararScannerAutomatico();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch(`/api/recepcao/aluno/${alunoId}`, {
            headers: { 'Authorization': `Bearer ${token}` },
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        
        if (data.success && data.aluno) {
            currentAluno = data.aluno;
            // 🆕 Reseta filtros de atrasos ao trocar de aluno
            filtrosAtrasos.motivo = 'todos';
            filtrosAtrasos.busca = '';
            filtrosAtrasos.dataInicio = '';
            filtrosAtrasos.dataFim = '';
            await verificarAutorizacao(alunoId);
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

async function verificarAutorizacao(alunoId) {
    const data = safeGet('dataVerificacao')?.value || getDataLocalISO();
    
    const params = new URLSearchParams();
    params.append('data', data);
    
    // 🆕 Filtros de atraso
    if (filtrosAtrasos.motivo && filtrosAtrasos.motivo !== 'todos') {
        params.append('atrasoMotivo', filtrosAtrasos.motivo);
    }
    if (filtrosAtrasos.busca) params.append('atrasoBusca', filtrosAtrasos.busca);
    if (filtrosAtrasos.dataInicio) params.append('atrasoDataInicio', filtrosAtrasos.dataInicio);
    if (filtrosAtrasos.dataFim) params.append('atrasoDataFim', filtrosAtrasos.dataFim);
    
    try {
        const response = await fetch(`/api/recepcao/verificar/${alunoId}?${params.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();
        
        if (!result.success) {
            notificar(result.error || 'Erro ao verificar');
            return;
        }
        
        exibirResultado(result);
    } catch (error) {
        console.error('Erro ao verificar:', error);
        notificar('Erro ao verificar autorização');
    }
}

// ============================================
// EXIBIR RESULTADO
// ============================================
function exibirResultado(data) {
    const { aluno, agrupado, dataConsultaFormatada, atrasos, totalAtrasos, contagemPorMotivo } = data;
    
    const autorizacoesArr = agrupado?.autorizacoes || [];
    const uniformesArr = agrupado?.uniforme || [];
    
    const fotoEl = safeGet('alunoFoto');
    if (fotoEl) {
        fotoEl.onerror = null;
        fotoEl.src = aluno.fotoPerfil || gerarAvatarSVG(aluno.nome);
        fotoEl.onerror = function() { this.onerror = null; this.src = gerarAvatarSVG(aluno.nome); };
    }
    
    const nomeEl = safeGet('alunoNome');
    if (nomeEl) {
        if (totalAtrasos > 0) {
            nomeEl.innerHTML = `${escapeHTML(aluno.nome || '-')} 
                <span class="badge bg-danger ms-2" style="font-size: 13px; vertical-align: middle; padding: 6px 10px;" title="Total de atrasos registrados">
                    <i class="fas fa-clock"></i> ${totalAtrasos} atraso${totalAtrasos > 1 ? 's' : ''}
                </span>`;
        } else {
            nomeEl.textContent = aluno.nome || '-';
        }
    }
    
    safeSetText('alunoMatricula', aluno.matricula || 'Não informada');
    safeSetText('alunoTurma', aluno.turma || 'Não informada');
    safeSetText('alunoCurso', aluno.curso || 'Não informado');
    
    const totalAutorizacoes = autorizacoesArr.length + uniformesArr.length;
    const statusDiv = safeGet('statusVerificacao');
    if (statusDiv) {
        if (totalAutorizacoes > 0) {
            statusDiv.innerHTML = `
                <div class="status-verificacao tem-autorizacao" style="background: linear-gradient(135deg, #f0fdf4, #dcfce7); border: 2px solid #10b981; border-radius: 14px; padding: 18px; display: flex; align-items: center; gap: 14px;">
                    <i class="fas fa-check-circle" style="font-size: 38px; color: #10b981; flex-shrink: 0;"></i>
                    <div>
                        <h4 style="margin: 0 0 4px; color: #065f46; font-size: 17px;">✅ AUTORIZAÇÃO ENCONTRADA</h4>
                        <p style="margin: 0; color: #047857; font-size: 13px;">
                            <strong>${totalAutorizacoes}</strong> registro(s) válido(s) para <strong>${dataConsultaFormatada}</strong>
                        </p>
                    </div>
                </div>
            `;
        } else {
            statusDiv.innerHTML = `
                <div class="status-verificacao sem-autorizacao" style="background: linear-gradient(135deg, #fef2f2, #fee2e2); border: 2px solid #ef4444; border-radius: 14px; padding: 18px; display: flex; align-items: center; gap: 14px;">
                    <i class="fas fa-times-circle" style="font-size: 38px; color: #ef4444; flex-shrink: 0;"></i>
                    <div>
                        <h4 style="margin: 0 0 4px; color: #991b1b; font-size: 17px;">❌ SEM AUTORIZAÇÃO</h4>
                        <p style="margin: 0; color: #b91c1c; font-size: 13px;">
                            Nenhuma autorização para <strong>${dataConsultaFormatada}</strong>
                        </p>
                    </div>
                </div>
            `;
        }
    }
    
    const listaDiv = safeGet('listaAutorizacoes');
    if (listaDiv) {
        let html = '';
        if (autorizacoesArr.length > 0) {
            html += renderizarSecaoAutorizacoes(autorizacoesArr);
        }
        if (uniformesArr.length > 0) {
            html += renderizarSecaoUniforme(uniformesArr);
        }
        if (autorizacoesArr.length === 0 && uniformesArr.length === 0) {
            html = `
                <div class="text-center py-4 text-muted" style="background: #f8fafc; border-radius: 12px; padding: 30px 20px;">
                    <i class="fas fa-inbox" style="font-size: 42px; color: #cbd5e1; margin-bottom: 12px; display: block;"></i>
                    <p style="margin: 0; font-size: 14px;">Nenhuma autorização registrada para esta data</p>
                </div>
            `;
        }
        listaDiv.innerHTML = html;
    }
    
    // 🆕 HISTÓRICO DE ATRASOS COM FILTROS
    const historicoDiv = safeGet('historicoAtrasosRecepcao');
    if (historicoDiv) {
        historicoDiv.innerHTML = renderizarSecaoAtrasos(atrasos || [], totalAtrasos || 0, contagemPorMotivo || {});
        // Adiciona listeners após renderizar
        setTimeout(anexarListenersFiltrosAtrasos, 100);
    }
    
    safeGet('resultadoConsulta').style.display = 'block';
    safeGet('resultadoConsulta').scrollIntoView({ behavior: 'smooth' });
}

// ============================================
// SEÇÃO 1: AUTORIZAÇÕES
// ============================================
function renderizarSecaoAutorizacoes(autorizacoes) {
    return `
        <div class="modulo-card" style="background: white; border-radius: 16px; box-shadow: 0 4px 20px rgba(30, 60, 114, 0.12); overflow: hidden; margin-bottom: 20px; border: 1px solid #e2e8f0;">
            <div class="modulo-header" style="background: linear-gradient(135deg, #1e3c72, #2a5298); color: white; padding: 16px 22px; display: flex; align-items: center; justify-content: space-between;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="width: 42px; height: 42px; background: rgba(255,255,255,0.2); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 20px;">
                        <i class="fas fa-file-signature"></i>
                    </div>
                    <div>
                        <h5 style="margin: 0; font-size: 17px; font-weight: 700;">Autorizações</h5>
                        <p style="margin: 2px 0 0; font-size: 12px; opacity: 0.85;">Entrada, saída e ausências autorizadas</p>
                    </div>
                </div>
                <span class="badge" style="background: rgba(255,255,255,0.25); color: white; font-size: 13px; padding: 8px 14px; border-radius: 20px; font-weight: 600;">
                    ${autorizacoes.length} registro${autorizacoes.length > 1 ? 's' : ''}
                </span>
            </div>
            <div class="modulo-body" style="padding: 18px; background: #f8fafc;">
                ${autorizacoes.map(a => renderizarCardAutorizacao(a)).join('')}
            </div>
        </div>
    `;
}

function renderizarCardAutorizacao(a) {
    const badgeAssinatura = a.temAssinatura 
        ? '<span class="badge" style="background: #10b981; color: white; font-size: 11px; padding: 5px 10px;"><i class="fas fa-signature"></i> Assinado</span>'
        : (a.statusAssinatura === 'pendente' 
            ? '<span class="badge" style="background: #f59e0b; color: white; font-size: 11px; padding: 5px 10px;"><i class="fas fa-clock"></i> Pendente</span>'
            : '<span class="badge" style="background: #94a3b8; color: white; font-size: 11px; padding: 5px 10px;">Sem assinatura</span>');
    
    let motivoDetalhes = '';
    if (a.motivo === 'outros' && a.motivoOutros) {
        motivoDetalhes = ` <small style="color: #64748b;">(${escapeHTML(a.motivoOutros)})</small>`;
    }
    if (a.motivo === 'necessita_ausentar_retornar' && a.horarioAusencia && a.horarioRetorno) {
        motivoDetalhes = ` <small style="color: #64748b;">(Ausência: ${a.horarioAusencia} → Retorno: ${a.horarioRetorno})</small>`;
    }
    
    return `
        <div style="background: white; border-radius: 12px; padding: 16px; margin-bottom: 12px; border-left: 4px solid #1e3c72; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; flex-wrap: wrap; margin-bottom: 12px;">
                <div>
                    <div style="font-size: 13px; color: #475569; font-weight: 600;">
                        <i class="fas fa-calendar-check" style="color: #1e3c72;"></i> 
                        Registrado em ${a.dataFormatada}
                    </div>
                    <small style="color: #94a3b8; font-size: 11px;">
                        <i class="fas fa-user-tie"></i> Por: ${escapeHTML(a.registradoPorNome || '-')}
                    </small>
                </div>
                ${badgeAssinatura}
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; margin-bottom: 12px;">
                <div style="background: #eff6ff; border-radius: 8px; padding: 10px; border-left: 3px solid #3b82f6;">
                    <div style="font-size: 10px; color: #1e40af; text-transform: uppercase; font-weight: 700; margin-bottom: 3px;">Motivo</div>
                    <div style="font-size: 13px; color: #1e293b; font-weight: 600;">
                        ${escapeHTML(a.motivoLabel || '-')}${motivoDetalhes}
                    </div>
                </div>
                
                ${a.entradaCompleta ? `
                    <div style="background: #f0fdf4; border-radius: 8px; padding: 10px; border-left: 3px solid #10b981;">
                        <div style="font-size: 10px; color: #065f46; text-transform: uppercase; font-weight: 700; margin-bottom: 3px;">
                            <i class="fas fa-sign-in-alt"></i> Entrada
                        </div>
                        <div style="font-size: 13px; color: #065f46; font-weight: 600;">${escapeHTML(a.entradaCompleta)}</div>
                    </div>
                ` : ''}
                
                ${a.saidaCompleta ? `
                    <div style="background: #fef2f2; border-radius: 8px; padding: 10px; border-left: 3px solid #ef4444;">
                        <div style="font-size: 10px; color: #991b1b; text-transform: uppercase; font-weight: 700; margin-bottom: 3px;">
                            <i class="fas fa-sign-out-alt"></i> Saída
                        </div>
                        <div style="font-size: 13px; color: #991b1b; font-weight: 600;">${escapeHTML(a.saidaCompleta)}</div>
                    </div>
                ` : ''}
                
                ${a.periodoFaltaFormatado ? `
                    <div style="background: #fef3c7; border-radius: 8px; padding: 10px; border-left: 3px solid #f59e0b; grid-column: span 2;">
                        <div style="font-size: 10px; color: #92400e; text-transform: uppercase; font-weight: 700; margin-bottom: 3px;">
                            <i class="fas fa-calendar-alt"></i> Período
                        </div>
                        <div style="font-size: 13px; color: #78350f; font-weight: 700;">${escapeHTML(a.periodoFaltaFormatado)}</div>
                    </div>
                ` : ''}
            </div>
            
            ${(a.responsavelNome || a.responsavelCPF || a.responsavelTelefone) ? `
                <div style="background: #f5f3ff; border-radius: 8px; padding: 10px; margin-bottom: 12px; border-left: 3px solid #8b5cf6;">
                    <div style="font-size: 10px; color: #6d28d9; text-transform: uppercase; font-weight: 700; margin-bottom: 4px;">
                        <i class="fas fa-user-shield"></i> Responsável
                    </div>
                    <div style="font-size: 12px; color: #475569; line-height: 1.5;">
                        ${a.responsavelNome ? `<strong style="color: #1e293b;">${escapeHTML(a.responsavelNome)}</strong>` : ''}
                        ${a.responsavelCPF ? ` • CPF: ${escapeHTML(a.responsavelCPF)}` : ''}
                        ${a.responsavelTelefone ? ` • Tel: ${escapeHTML(a.responsavelTelefone)}` : ''}
                    </div>
                </div>
            ` : ''}
            
            ${a.observacoes ? `
                <div style="background: #f8fafc; border-radius: 8px; padding: 10px; margin-bottom: 12px; border-left: 3px solid #64748b;">
                    <div style="font-size: 10px; color: #475569; text-transform: uppercase; font-weight: 700; margin-bottom: 3px;">
                        <i class="fas fa-comment"></i> Observações
                    </div>
                    <div style="font-size: 12px; color: #1e293b; line-height: 1.5;">${escapeHTML(a.observacoes)}</div>
                </div>
            ` : ''}
            
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                <button onclick="abrirModalAssinaturaRecepcao('${a.id}')" 
                        style="flex: 1; min-width: 130px; padding: 10px; background: ${a.temAssinatura ? '#10b981' : '#f59e0b'}; color: white; border: none; border-radius: 8px; font-weight: 600; font-size: 12px; cursor: pointer;">
                    <i class="fas fa-signature"></i> ${a.temAssinatura ? 'Editar Assinatura' : 'Solicitar Assinatura'}
                </button>
                <button onclick="imprimirAutorizacao('${a.id}')" 
                        style="flex: 1; min-width: 100px; padding: 10px; background: #1e3c72; color: white; border: none; border-radius: 8px; font-weight: 600; font-size: 12px; cursor: pointer;">
                    <i class="fas fa-print"></i> Imprimir
                </button>
                <button onclick="verDetalhesCompletos('${a.id}')" 
                        style="flex: 1; min-width: 100px; padding: 10px; background: white; color: #1e3c72; border: 2px solid #1e3c72; border-radius: 8px; font-weight: 600; font-size: 12px; cursor: pointer;">
                    <i class="fas fa-eye"></i> Detalhes
                </button>
            </div>
        </div>
    `;
}

// ============================================
// SEÇÃO 2: UNIFORME
// ============================================
function renderizarSecaoUniforme(uniformes) {
    return `
        <div class="modulo-card" style="background: white; border-radius: 16px; box-shadow: 0 4px 20px rgba(124, 58, 237, 0.15); overflow: hidden; margin-bottom: 20px; border: 2px solid #ddd6fe;">
            <div class="modulo-header" style="background: linear-gradient(135deg, #7c3aed, #8b5cf6); color: white; padding: 16px 22px; display: flex; align-items: center; justify-content: space-between;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="width: 42px; height: 42px; background: rgba(255,255,255,0.25); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 20px;">
                        <i class="fas fa-tshirt"></i>
                    </div>
                    <div>
                        <h5 style="margin: 0; font-size: 17px; font-weight: 700;">Autorização de Uniforme</h5>
                        <p style="margin: 2px 0 0; font-size: 12px; opacity: 0.9;">Aluno liberado do uso do uniforme</p>
                    </div>
                </div>
                <span class="badge" style="background: rgba(255,255,255,0.3); color: white; font-size: 13px; padding: 8px 14px; border-radius: 20px; font-weight: 600;">
                    ${uniformes.length} registro${uniformes.length > 1 ? 's' : ''}
                </span>
            </div>
            <div class="modulo-body" style="padding: 18px; background: #faf5ff;">
                ${uniformes.map(u => renderizarCardUniforme(u)).join('')}
            </div>
        </div>
    `;
}

function renderizarCardUniforme(u) {
    const badgeAssinatura = u.temAssinatura 
        ? '<span class="badge" style="background: #10b981; color: white; font-size: 11px; padding: 5px 10px;"><i class="fas fa-signature"></i> Assinado</span>'
        : (u.statusAssinatura === 'pendente' 
            ? '<span class="badge" style="background: #f59e0b; color: white; font-size: 11px; padding: 5px 10px;"><i class="fas fa-clock"></i> Pendente</span>'
            : '<span class="badge" style="background: #94a3b8; color: white; font-size: 11px; padding: 5px 10px;">Sem assinatura</span>');
    
    return `
        <div style="background: white; border-radius: 12px; padding: 16px; margin-bottom: 12px; border-left: 4px solid #7c3aed; box-shadow: 0 2px 8px rgba(124, 58, 237, 0.08);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; flex-wrap: wrap; margin-bottom: 12px;">
                <div>
                    <div style="font-size: 13px; color: #475569; font-weight: 600;">
                        <i class="fas fa-calendar-check" style="color: #7c3aed;"></i> 
                        Registrado em ${u.dataFormatada}
                    </div>
                    <small style="color: #94a3b8; font-size: 11px;">
                        <i class="fas fa-user-tie"></i> Por: ${escapeHTML(u.registradoPorNome || '-')}
                    </small>
                </div>
                ${badgeAssinatura}
            </div>
            
            ${u.uniformePeriodoFormatado ? `
                <div style="background: linear-gradient(135deg, #ede9fe, #ddd6fe); border-radius: 10px; padding: 14px; margin-bottom: 12px; border: 2px solid #a78bfa;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <i class="fas fa-calendar-week" style="font-size: 22px; color: #6d28d9;"></i>
                        <div style="flex: 1;">
                            <div style="font-size: 10px; color: #6d28d9; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">
                                Período Autorizado
                            </div>
                            <div style="font-size: 16px; color: #5b21b6; font-weight: 700; margin-top: 2px;">
                                ${escapeHTML(u.uniformePeriodoFormatado)}
                            </div>
                        </div>
                    </div>
                </div>
            ` : ''}
            
            <div style="background: #faf5ff; border-radius: 8px; padding: 10px; margin-bottom: 12px; border-left: 3px solid #8b5cf6;">
                <div style="font-size: 10px; color: #6d28d9; text-transform: uppercase; font-weight: 700; margin-bottom: 3px;">Motivo</div>
                <div style="font-size: 13px; color: #1e293b; font-weight: 600;">
                    ${escapeHTML(u.motivoLabel || '-')}
                    ${u.motivoOutros ? `<small style="color: #64748b;">(${escapeHTML(u.motivoOutros)})</small>` : ''}
                </div>
            </div>
            
            ${(u.responsavelNome || u.responsavelCPF || u.responsavelTelefone) ? `
                <div style="background: #f5f3ff; border-radius: 8px; padding: 10px; margin-bottom: 12px; border-left: 3px solid #8b5cf6;">
                    <div style="font-size: 10px; color: #6d28d9; text-transform: uppercase; font-weight: 700; margin-bottom: 4px;">
                        <i class="fas fa-user-shield"></i> Responsável
                    </div>
                    <div style="font-size: 12px; color: #475569; line-height: 1.5;">
                        ${u.responsavelNome ? `<strong style="color: #1e293b;">${escapeHTML(u.responsavelNome)}</strong>` : ''}
                        ${u.responsavelCPF ? ` • CPF: ${escapeHTML(u.responsavelCPF)}` : ''}
                        ${u.responsavelTelefone ? ` • Tel: ${escapeHTML(u.responsavelTelefone)}` : ''}
                    </div>
                </div>
            ` : ''}
            
            ${u.observacoes ? `
                <div style="background: #f8fafc; border-radius: 8px; padding: 10px; margin-bottom: 12px; border-left: 3px solid #64748b;">
                    <div style="font-size: 10px; color: #475569; text-transform: uppercase; font-weight: 700; margin-bottom: 3px;">
                        <i class="fas fa-comment"></i> Observações
                    </div>
                    <div style="font-size: 12px; color: #1e293b; line-height: 1.5;">${escapeHTML(u.observacoes)}</div>
                </div>
            ` : ''}
            
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                <button onclick="abrirModalAssinaturaRecepcao('${u.id}')" 
                        style="flex: 1; min-width: 130px; padding: 10px; background: ${u.temAssinatura ? '#10b981' : '#f59e0b'}; color: white; border: none; border-radius: 8px; font-weight: 600; font-size: 12px; cursor: pointer;">
                    <i class="fas fa-signature"></i> ${u.temAssinatura ? 'Editar Assinatura' : 'Solicitar Assinatura'}
                </button>
                <button onclick="imprimirAutorizacao('${u.id}')" 
                        style="flex: 1; min-width: 100px; padding: 10px; background: #7c3aed; color: white; border: none; border-radius: 8px; font-weight: 600; font-size: 12px; cursor: pointer;">
                    <i class="fas fa-print"></i> Imprimir
                </button>
                <button onclick="verDetalhesCompletos('${u.id}')" 
                        style="flex: 1; min-width: 100px; padding: 10px; background: white; color: #7c3aed; border: 2px solid #7c3aed; border-radius: 8px; font-weight: 600; font-size: 12px; cursor: pointer;">
                    <i class="fas fa-eye"></i> Detalhes
                </button>
            </div>
        </div>
    `;
}

// ============================================
// SEÇÃO 3: HISTÓRICO DE ATRASOS (COM FILTROS)
// ============================================
function renderizarSecaoAtrasos(atrasos, totalSemFiltro, contagemPorMotivo) {
    const motivosLabels = {
        onibus: 'Ônibus',
        transito: 'Trânsito',
        problemas_pessoais: 'Problemas Pessoais',
        fardamento: 'Fardamento',
        outros: 'Outros'
    };
    
    // Chips de filtro por motivo
    const motivosDisponiveis = [
        { valor: 'todos', label: 'Todos', icone: 'fa-list' },
        { valor: 'onibus', label: 'Ônibus', icone: 'fa-bus' },
        { valor: 'transito', label: 'Trânsito', icone: 'fa-car' },
        { valor: 'problemas_pessoais', label: 'Pessoais', icone: 'fa-user-injured' },
        { valor: 'fardamento', label: 'Fardamento', icone: 'fa-tshirt' },
        { valor: 'outros', label: 'Outros', icone: 'fa-ellipsis-h' }
    ];
    
    const chipsHTML = motivosDisponiveis.map(m => {
        const ativo = filtrosAtrasos.motivo === m.valor;
        const count = m.valor === 'todos' ? totalSemFiltro : (contagemPorMotivo[m.valor] || 0);
        return `
            <button type="button" 
                    class="filtro-chip-atraso ${ativo ? 'ativo' : ''}"
                    data-motivo="${m.valor}"
                    style="display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; border-radius: 20px; border: 2px solid ${ativo ? '#ef4444' : '#e2e8f0'}; background: ${ativo ? '#ef4444' : 'white'}; color: ${ativo ? 'white' : '#475569'}; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s;">
                <i class="fas ${m.icone}" style="font-size: 11px;"></i>
                ${m.label}
                <span style="background: ${ativo ? 'rgba(255,255,255,0.3)' : '#f1f5f9'}; color: ${ativo ? 'white' : '#64748b'}; padding: 2px 6px; border-radius: 10px; font-size: 10px; font-weight: 700;">
                    ${count}
                </span>
            </button>
        `;
    }).join('');
    
    const temFiltroAtivo = filtrosAtrasos.motivo !== 'todos' || filtrosAtrasos.busca || filtrosAtrasos.dataInicio || filtrosAtrasos.dataFim;
    
    return `
        <div class="modulo-card" style="background: white; border-radius: 16px; box-shadow: 0 4px 20px rgba(220, 38, 38, 0.12); overflow: hidden; margin-top: 20px; border: 1px solid #fecaca;">
            <div class="modulo-header" style="background: linear-gradient(135deg, #dc2626, #ef4444); color: white; padding: 16px 22px; display: flex; align-items: center; justify-content: space-between;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="width: 42px; height: 42px; background: rgba(255,255,255,0.2); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 20px;">
                        <i class="fas fa-history"></i>
                    </div>
                    <div>
                        <h5 style="margin: 0; font-size: 17px; font-weight: 700;">Histórico de Atrasos</h5>
                        <p style="margin: 2px 0 0; font-size: 12px; opacity: 0.9;">Registros de atrasos do aluno</p>
                    </div>
                </div>
                <span class="badge" style="background: rgba(255,255,255,0.25); color: white; font-size: 13px; padding: 8px 14px; border-radius: 20px; font-weight: 600;">
                    ${atrasos.length}${temFiltroAtivo ? ` de ${totalSemFiltro}` : ''} registro${atrasos.length !== 1 ? 's' : ''}
                </span>
            </div>
            
            <!-- 🆕 BARRA DE FILTROS -->
            <div style="background: #fef2f2; padding: 14px 18px; border-bottom: 1px solid #fecaca;">
                <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px;" id="chipsMotivoAtraso">
                    ${chipsHTML}
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 8px;">
                    <input type="text" 
                           id="filtroBuscaAtraso" 
                           placeholder="Buscar por descrição..."
                           value="${escapeHTML(filtrosAtrasos.busca)}"
                           style="padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px; outline: none;">
                    <input type="date" 
                           id="filtroDataInicioAtraso" 
                           value="${filtrosAtrasos.dataInicio}"
                           style="padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px; outline: none;">
                    <input type="date" 
                           id="filtroDataFimAtraso" 
                           value="${filtrosAtrasos.dataFim}"
                           style="padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px; outline: none;">
                    <button type="button" 
                            id="btnLimparFiltrosAtraso"
                            style="padding: 8px 14px; background: white; color: #dc2626; border: 1px solid #dc2626; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap;">
                        <i class="fas fa-eraser"></i> Limpar
                    </button>
                </div>
            </div>
            
            <div class="modulo-body" style="padding: 18px; background: #fef2f2; max-height: 500px; overflow-y: auto;">
                ${atrasos.length === 0 ? `
                    <div class="text-center py-4 text-muted">
                        <i class="fas ${temFiltroAtivo ? 'fa-search' : 'fa-check-circle'}" style="font-size: 42px; color: ${temFiltroAtivo ? '#cbd5e1' : '#10b981'}; margin-bottom: 12px; display: block;"></i>
                        <p style="margin: 0; font-size: 14px;">
                            ${temFiltroAtivo ? 'Nenhum atraso corresponde aos filtros' : 'Nenhum atraso registrado'}
                        </p>
                    </div>
                ` : atrasos.map(a => renderizarCardAtraso(a)).join('')}
            </div>
        </div>
    `;
}

function renderizarCardAtraso(a) {
    return `
        <div style="background: white; border-radius: 12px; padding: 14px; margin-bottom: 10px; border-left: 4px solid #ef4444; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; flex-wrap: wrap;">
                <div style="flex: 1; min-width: 200px;">
                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 6px;">
                        <span style="background: #fef2f2; color: #991b1b; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 700;">
                            <i class="fas fa-tag"></i> ${escapeHTML(a.motivosLabel || '-')}
                        </span>
                    </div>
                    <div style="font-size: 13px; color: #475569; margin-bottom: 4px;">
                        <i class="far fa-clock" style="color: #ef4444;"></i> 
                        <strong>${escapeHTML(a.dataFormatada)}</strong> às ${escapeHTML(a.horaFormatada)}
                    </div>
                    ${a.descricao ? `
                        <div style="font-size: 12px; color: #64748b; margin-top: 6px; padding-left: 20px; line-height: 1.5;">
                            ${escapeHTML(a.descricao)}
                        </div>
                    ` : ''}
                    ${a.registradoPor && a.registradoPor !== '-' ? `
                        <div style="font-size: 11px; color: #94a3b8; margin-top: 6px;">
                            <i class="fas fa-user-tie"></i> Registrado por: ${escapeHTML(a.registradoPor)}
                        </div>
                    ` : ''}
                </div>
                <div style="flex-shrink: 0;">
                    ${a.temAssinatura
                        ? '<span class="badge" style="background: #10b981; color: white; font-size: 10px; padding: 4px 8px;"><i class="fas fa-signature"></i> Assinado</span>'
                        : '<span class="badge" style="background: #cbd5e1; color: #64748b; font-size: 10px; padding: 4px 8px;">Sem assinatura</span>'}
                </div>
            </div>
        </div>
    `;
}

// 🆕 Anexa listeners aos filtros de atraso
function anexarListenersFiltrosAtrasos() {
    // Chips de motivo
    document.querySelectorAll('.filtro-chip-atraso').forEach(btn => {
        btn.addEventListener('click', () => {
            filtrosAtrasos.motivo = btn.getAttribute('data-motivo');
            if (currentAluno) verificarAutorizacao(currentAluno.id);
        });
    });
    
    // Busca por texto
    const inputBusca = safeGet('filtroBuscaAtraso');
    if (inputBusca) {
        let __timeoutBusca = null;
        inputBusca.addEventListener('input', () => {
            clearTimeout(__timeoutBusca);
            __timeoutBusca = setTimeout(() => {
                filtrosAtrasos.busca = inputBusca.value.trim();
                if (currentAluno) verificarAutorizacao(currentAluno.id);
            }, 500);
        });
    }
    
    // Data início
    const inputInicio = safeGet('filtroDataInicioAtraso');
    if (inputInicio) {
        inputInicio.addEventListener('change', () => {
            filtrosAtrasos.dataInicio = inputInicio.value;
            if (currentAluno) verificarAutorizacao(currentAluno.id);
        });
    }
    
    // Data fim
    const inputFim = safeGet('filtroDataFimAtraso');
    if (inputFim) {
        inputFim.addEventListener('change', () => {
            filtrosAtrasos.dataFim = inputFim.value;
            if (currentAluno) verificarAutorizacao(currentAluno.id);
        });
    }
    
    // Limpar filtros
    const btnLimpar = safeGet('btnLimparFiltrosAtraso');
    if (btnLimpar) {
        btnLimpar.addEventListener('click', () => {
            filtrosAtrasos.motivo = 'todos';
            filtrosAtrasos.busca = '';
            filtrosAtrasos.dataInicio = '';
            filtrosAtrasos.dataFim = '';
            if (currentAluno) verificarAutorizacao(currentAluno.id);
        });
    }
}

// ============================================
// MODAL DE ASSINATURA
// ============================================
async function abrirModalAssinaturaRecepcao(autorizacaoId) {
    const autorizacao = await obterAutorizacaoCompleta(autorizacaoId);
    if (!autorizacao) {
        notificar('Erro ao carregar autorização');
        return;
    }

    limparEstadoAssinatura();

    estadoAssinatura.autorizacaoId = autorizacaoId;
    estadoAssinatura.alunoId = autorizacao.alunoId;
    estadoAssinatura.alunoNome = autorizacao.alunoNome;
    estadoAssinatura.alunoTurma = autorizacao.alunoTurma;
    estadoAssinatura.alunoMatricula = autorizacao.alunoMatricula;
    estadoAssinatura.alunoCurso = autorizacao.alunoCurso;
    estadoAssinatura.responsavelNome = autorizacao.responsavelNome;

    const fotoEl = safeGet('assinaturaAlunoFoto');
    if (fotoEl) fotoEl.src = autorizacao.alunoFoto || gerarAvatarSVG(autorizacao.alunoNome);
    safeSetText('assinaturaAlunoNome', autorizacao.alunoNome || '-');
    safeSetText('assinaturaAlunoTurma', `${autorizacao.alunoTurma || '-'} • ${autorizacao.alunoMatricula || 'Sem matrícula'}`);

    const blocoAtual = safeGet('assinaturaAtualBloco');
    if (autorizacao.temAssinatura && autorizacao.assinaturaBase64) {
        if (blocoAtual) blocoAtual.style.display = 'block';
        const img = safeGet('assinaturaAtualImg');
        if (img) img.src = autorizacao.assinaturaBase64;
        const info = safeGet('assinaturaAtualInfo');
        if (info) {
            const dataStr = autorizacao.assinadaEm
                ? new Date(autorizacao.assinadaEm).toLocaleString('pt-BR')
                : 'data desconhecida';
            info.textContent = `Assinada por ${autorizacao.responsavelNome || 'Responsável'} em ${dataStr}`;
        }
    } else {
        if (blocoAtual) blocoAtual.style.display = 'none';
    }

    const loadingEl = safeGet('assinaturaQrLoading');
    const conteudoEl = safeGet('assinaturaQrConteudo');
    const assinadoEl = safeGet('assinaturaQrAssinado');
    if (loadingEl) {
        loadingEl.style.display = 'block';
        loadingEl.innerHTML = `
            <i class="fas fa-spinner fa-spin" style="font-size: 28px; margin-bottom: 10px; display: block;"></i>
            Gerando sessão de assinatura...
        `;
    }
    if (conteudoEl) conteudoEl.style.display = 'none';
    if (assinadoEl) assinadoEl.style.display = 'none';

    const tabQr = safeGet('tab-qr');
    if (tabQr && window.bootstrap) new bootstrap.Tab(tabQr).show();

    const modalEl = safeGet('modalAssinaturaRecepcao');
    if (!modalEl) return;
    estadoAssinatura.modalInstance = new bootstrap.Modal(modalEl);
    estadoAssinatura.modalInstance.show();

    await iniciarSessaoAssinatura();

    setTimeout(() => inicializarCanvasRecepcao(), 300);
}

async function obterAutorizacaoCompleta(id) {
    try {
        const response = await fetch(`/api/recepcao/autorizacao/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        return data.success ? data.autorizacao : null;
    } catch (e) {
        console.error(e);
        return null;
    }
}

// ============================================
// SESSÃO DE ASSINATURA
// ============================================
async function iniciarSessaoAssinatura() {
    const loadingEl = safeGet('assinaturaQrLoading');
    const conteudoEl = safeGet('assinaturaQrConteudo');
    const assinadoEl = safeGet('assinaturaQrAssinado');

    try {
        const sessaoId = gerarUUID();
        estadoAssinatura.sessaoId = sessaoId;

        const response = await fetch('/api/recepcao/sessoes-assinatura', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                sessaoId,
                autorizacaoId: estadoAssinatura.autorizacaoId,
                alunoId: estadoAssinatura.alunoId,
                alunoNome: estadoAssinatura.alunoNome,
                alunoTurma: estadoAssinatura.alunoTurma,
                alunoMatricula: estadoAssinatura.alunoMatricula,
                alunoCurso: estadoAssinatura.alunoCurso,
                responsavelNome: estadoAssinatura.responsavelNome
            })
        });

        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Erro ao criar sessão');

        const urlAssinatura = `${window.location.origin}/gestao-geral.html?assinatura=${sessaoId}`;
        estadoAssinatura.urlAssinatura = urlAssinatura;

        let qrUrl;
        try {
            const qrResp = await fetch('/api/qrcode/gerar', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ url: urlAssinatura })
            });
            const qrData = await qrResp.json();
            qrUrl = (qrData.success && qrData.qrCode)
                ? qrData.qrCode
                : `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(urlAssinatura)}`;
        } catch (e) {
            qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(urlAssinatura)}`;
        }

        estadoAssinatura.qrCodeDataUrl = qrUrl;

        if (loadingEl) loadingEl.style.display = 'none';
        if (conteudoEl) conteudoEl.style.display = 'block';
        if (assinadoEl) assinadoEl.style.display = 'none';

        const img = safeGet('assinaturaQrImg');
        if (img) img.src = qrUrl;

        iniciarMonitoramentoSessao(sessaoId);

    } catch (e) {
        console.error('Erro ao criar sessão:', e);
        if (loadingEl) {
            loadingEl.innerHTML = `
                <div style="color: #ef4444; padding: 20px;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 32px; display: block; margin-bottom: 10px;"></i>
                    <strong>Erro ao gerar QR Code</strong>
                    <p style="margin: 6px 0 0; font-size: 12px;">${e.message}</p>
                    <p style="margin: 6px 0 0; font-size: 12px;">Use a aba "Desenhar aqui" para assinar diretamente.</p>
                </div>
            `;
        }
    }
}

function iniciarMonitoramentoSessao(sessaoId) {
    pararMonitoramentoSessao();
    const intervalId = setInterval(async () => {
        try {
            const response = await fetch(`/api/recepcao/sessoes-assinatura/${sessaoId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) {
                if (response.status === 404) pararMonitoramentoSessao();
                return;
            }
            const data = await response.json();
            if (!data.success) return;

            if (data.sessao.status === 'assinado') {
                pararMonitoramentoSessao();
                const salvo = await salvarAssinaturaNaAutorizacao(data.sessao.assinaturaBase64);
                if (salvo) {
                    const conteudoEl = safeGet('assinaturaQrConteudo');
                    const assinadoEl = safeGet('assinaturaQrAssinado');
                    if (conteudoEl) conteudoEl.style.display = 'none';
                    if (assinadoEl) {
                        assinadoEl.style.display = 'block';
                        const preview = safeGet('assinaturaQrPreview');
                        if (preview) preview.src = data.sessao.assinaturaBase64;
                    }
                    atualizarBlocoAssinaturaAtual(data.sessao.assinaturaBase64, data.sessao.assinadaPorNome);
                    if (currentAluno) verificarAutorizacao(currentAluno.id);
                    carregarResumoDia();
                    notificar('✅ Assinatura capturada com sucesso!', 'success');
                }
            } else if (data.sessao.status === 'cancelado') {
                pararMonitoramentoSessao();
            }
        } catch (e) {
            console.warn('Erro no monitoramento:', e);
        }
    }, 3000);
    estadoAssinatura.monitoramentoInterval = intervalId;
}

function pararMonitoramentoSessao() {
    if (estadoAssinatura.monitoramentoInterval) {
        clearInterval(estadoAssinatura.monitoramentoInterval);
        estadoAssinatura.monitoramentoInterval = null;
    }
}

async function salvarAssinaturaNaAutorizacao(assinaturaBase64) {
    try {
        const response = await fetch(`/api/recepcao/autorizacao/${estadoAssinatura.autorizacaoId}/assinatura`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                assinaturaBase64,
                assinanteNome: estadoAssinatura.responsavelNome || 'Responsável'
            })
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Erro ao salvar');
        return true;
    } catch (e) {
        console.error('Erro ao salvar assinatura:', e);
        notificar('❌ Erro ao salvar assinatura: ' + e.message, 'error');
        return false;
    }
}

function atualizarBlocoAssinaturaAtual(assinaturaBase64, assinanteNome) {
    const blocoAtual = safeGet('assinaturaAtualBloco');
    if (!blocoAtual) return;
    blocoAtual.style.display = 'block';
    const img = safeGet('assinaturaAtualImg');
    if (img) img.src = assinaturaBase64;
    const info = safeGet('assinaturaAtualInfo');
    if (info) {
        info.textContent = `Assinada por ${assinanteNome || 'Responsável'} em ${new Date().toLocaleString('pt-BR')}`;
    }
}

async function copiarLinkAssinaturaRecepcao() {
    const url = estadoAssinatura.urlAssinatura;
    if (!url) return;
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

// ============================================
// CANVAS (fallback)
// ============================================
function inicializarCanvasRecepcao() {
    const canvas = safeGet('canvasAssinaturaRecepcao');
    const wrapper = safeGet('canvasRecepcaoWrapper');
    const placeholder = safeGet('placeholderAssinaturaRecepcao');
    if (!canvas || !wrapper) return;

    estadoAssinatura.temAssinatura = false;
    estadoAssinatura.desenhando = false;
    if (placeholder) placeholder.style.opacity = '1';
    wrapper.style.borderColor = '#cbd5e0';
    wrapper.style.borderStyle = 'dashed';
    const btnSalvar = safeGet('btnSalvarCanvasRecepcao');
    if (btnSalvar) btnSalvar.disabled = true;

    const clone = canvas.cloneNode(true);
    canvas.parentNode.replaceChild(clone, canvas);

    const rect = wrapper.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
        setTimeout(() => inicializarCanvasRecepcao(), 250);
        return;
    }

    const dpr = window.devicePixelRatio || 1;
    clone.width = rect.width * dpr;
    clone.height = rect.height * dpr;
    clone.style.width = rect.width + 'px';
    clone.style.height = rect.height + 'px';

    const ctx = clone.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1e3c72';

    estadoAssinatura.canvas = clone;
    estadoAssinatura.ctx = ctx;

    const getPos = (e) => {
        const r = clone.getBoundingClientRect();
        let cx, cy;
        if (e.touches?.length > 0) { cx = e.touches[0].clientX; cy = e.touches[0].clientY; }
        else if (e.changedTouches?.length > 0) { cx = e.changedTouches[0].clientX; cy = e.changedTouches[0].clientY; }
        else { cx = e.clientX; cy = e.clientY; }
        return { x: cx - r.left, y: cy - r.top };
    };

    const iniciar = (e) => {
        e.preventDefault();
        estadoAssinatura.desenhando = true;
        estadoAssinatura.temAssinatura = true;
        const p = getPos(e);
        estadoAssinatura.lastX = p.x;
        estadoAssinatura.lastY = p.y;
        wrapper.style.borderColor = '#1e3c72';
        wrapper.style.borderStyle = 'solid';
        if (placeholder) placeholder.style.opacity = '0';
        const btn = safeGet('btnSalvarCanvasRecepcao');
        if (btn) btn.disabled = false;
    };

    const desenhar = (e) => {
        if (!estadoAssinatura.desenhando) return;
        e.preventDefault();
        const p = getPos(e);
        const ctx2 = estadoAssinatura.ctx;
        if (!ctx2) return;
        ctx2.beginPath();
        ctx2.moveTo(estadoAssinatura.lastX, estadoAssinatura.lastY);
        ctx2.lineTo(p.x, p.y);
        ctx2.stroke();
        estadoAssinatura.lastX = p.x;
        estadoAssinatura.lastY = p.y;
    };

    const parar = (e) => {
        if (e?.preventDefault) e.preventDefault();
        estadoAssinatura.desenhando = false;
    };

    clone.addEventListener('touchstart', iniciar, { passive: false });
    clone.addEventListener('touchmove', desenhar, { passive: false });
    clone.addEventListener('touchend', parar, { passive: false });
    clone.addEventListener('touchcancel', parar, { passive: false });
    clone.addEventListener('mousedown', iniciar);
    clone.addEventListener('mousemove', desenhar);
    clone.addEventListener('mouseup', parar);
    clone.addEventListener('mouseleave', () => { if (estadoAssinatura.desenhando) parar(); });
}

function limparCanvasRecepcao() {
    const canvas = safeGet('canvasAssinaturaRecepcao');
    const wrapper = safeGet('canvasRecepcaoWrapper');
    const placeholder = safeGet('placeholderAssinaturaRecepcao');
    if (!canvas || !estadoAssinatura.ctx) return;
    const rect = canvas.getBoundingClientRect();
    estadoAssinatura.ctx.clearRect(0, 0, rect.width, rect.height);
    estadoAssinatura.temAssinatura = false;
    if (placeholder) placeholder.style.opacity = '1';
    if (wrapper) {
        wrapper.style.borderColor = '#cbd5e0';
        wrapper.style.borderStyle = 'dashed';
    }
    const btn = safeGet('btnSalvarCanvasRecepcao');
    if (btn) btn.disabled = true;
}

async function salvarCanvasRecepcao() {
    if (!estadoAssinatura.temAssinatura || !estadoAssinatura.canvas) {
        notificar('Desenhe a assinatura primeiro', 'warning');
        return;
    }

    const btn = safeGet('btnSalvarCanvasRecepcao');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
    }

    try {
        const dataURL = estadoAssinatura.canvas.toDataURL('image/png');
        const salvo = await salvarAssinaturaNaAutorizacao(dataURL);
        if (salvo) {
            atualizarBlocoAssinaturaAtual(dataURL, estadoAssinatura.responsavelNome || 'Recepção (presencial)');
            notificar('✅ Assinatura salva com sucesso!', 'success');
            if (currentAluno) verificarAutorizacao(currentAluno.id);
            carregarResumoDia();
            setTimeout(() => {
                if (estadoAssinatura.modalInstance) estadoAssinatura.modalInstance.hide();
            }, 1000);
        }
    } catch (e) {
        console.error(e);
        notificar('❌ Erro ao salvar assinatura', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-check"></i> Salvar Assinatura';
        }
    }
}

async function removerAssinaturaRecepcao() {
    const confirmar = await confirm('Remover a assinatura desta autorização?\n\nO responsável precisará assinar novamente.');
    if (!confirmar) return;

    try {
        const response = await fetch(`/api/recepcao/autorizacao/${estadoAssinatura.autorizacaoId}/assinatura`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Erro ao remover');

        const blocoAtual = safeGet('assinaturaAtualBloco');
        if (blocoAtual) blocoAtual.style.display = 'none';

        notificar('✅ Assinatura removida', 'success');
        if (currentAluno) verificarAutorizacao(currentAluno.id);
        carregarResumoDia();
    } catch (e) {
        console.error(e);
        notificar('❌ Erro ao remover assinatura', 'error');
    }
}

function limparEstadoAssinatura() {
    pararMonitoramentoSessao();
    estadoAssinatura.autorizacaoId = null;
    estadoAssinatura.alunoId = null;
    estadoAssinatura.alunoNome = null;
    estadoAssinatura.alunoTurma = null;
    estadoAssinatura.alunoMatricula = null;
    estadoAssinatura.alunoCurso = null;
    estadoAssinatura.responsavelNome = null;
    estadoAssinatura.sessaoId = null;
    estadoAssinatura.urlAssinatura = null;
    estadoAssinatura.qrCodeDataUrl = null;
    estadoAssinatura.modalInstance = null;
    estadoAssinatura.canvas = null;
    estadoAssinatura.ctx = null;
    estadoAssinatura.desenhando = false;
    estadoAssinatura.temAssinatura = false;
}

function reimprimirAutorizacaoAtual() {
    if (estadoAssinatura.autorizacaoId) {
        imprimirAutorizacao(estadoAssinatura.autorizacaoId);
    }
}

// ============================================
// IMPRIMIR
// ============================================
async function imprimirAutorizacao(id) {
    try {
        const response = await fetch(`/api/recepcao/autorizacao/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (!data.success || !data.autorizacao) {
            notificar('Erro ao carregar autorização');
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
        win.document.write(gerarHTMLImpressaoAutorizacao(a, qr));
        win.document.close();
        win.onload = () => setTimeout(() => win.print(), 500);
    } catch (error) {
        console.error('Erro:', error);
        notificar('Erro ao imprimir');
    }
}

function gerarHTMLImpressaoAutorizacao(a, qrCodeUrl) {
    const logo = '/uploads/logo-iema.png';
    const carimbo = '/icons/assinatura_gestao.ico';
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
    
    const tipoLabel = a.tipo === 'uniforme' ? 'Autorização de Uniforme' : 'Autorização';
    
    let periodoHTML = '';
    if (a.tipo === 'uniforme' && a.uniformePeriodoFormatado) {
        periodoHTML = `
            <div class="section-title">👕 Período da Autorização (Uniforme)</div>
            <div class="motivo-box" style="background: #ede9fe; border-color: #7c3aed;">
                <p style="margin: 0; font-size: 11pt; text-align: center;">
                    <strong>${escapeHTML(a.uniformePeriodoFormatado)}</strong>
                </p>
            </div>
        `;
    } else if (a.periodoFaltaFormatado) {
        periodoHTML = `
            <div class="section-title">📆 Período</div>
            <div class="motivo-box" style="background: #fef3c7; border-color: #f59e0b;">
                <p style="margin: 0; font-size: 11pt; text-align: center;">
                    <strong>${escapeHTML(a.periodoFaltaFormatado)}</strong>
                </p>
            </div>
        `;
    }
    
    let horariosHTML = '';
    if (a.entradaCompleta || a.saidaCompleta) {
        horariosHTML = `
            <div class="section-title">📅 Previsão de Entrada / Saída</div>
            <div class="info-grid" style="grid-template-columns: 1fr 1fr;">
                <div class="info-item">
                    <span class="info-label">Entrada:</span>
                    <span class="info-value"><strong>${a.entradaCompleta || '-'}</strong></span>
                </div>
                <div class="info-item">
                    <span class="info-label">Saída:</span>
                    <span class="info-value"><strong>${a.saidaCompleta || '-'}</strong></span>
                </div>
            </div>`;
    }
    
    const assinaturaHTML = a.assinaturaBase64 
        ? `<img class="assinatura-img" src="${a.assinaturaBase64}" alt="Assinatura">`
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
        <title>${tipoLabel} - ${escapeHTML(a.alunoNome)}</title>
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
            .assinatura-img { max-height: 12mm; max-width: 100%; object-fit: contain; position: relative; z-index: 1; }
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
            <p>Sistema de Atendimentos — Recepção</p>
        </div>
        
        <div class="titulo">📋 ${tipoLabel}</div>
        
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
        
        ${periodoHTML}
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
            <p>Documento gerado em <strong>${dataGeracao}</strong> — EducaPleno — Recepção</p>
        </div>
    </body>
    </html>`;
}

// ============================================
// VER DETALHES COMPLETOS
// ============================================
async function verDetalhesCompletos(id) {
    try {
        const response = await fetch(`/api/recepcao/autorizacao/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (!data.success || !data.autorizacao) {
            notificar('Erro ao carregar detalhes');
            return;
        }
        
        const a = data.autorizacao;
        const oldModal = safeGet('modalDetalhesAutorizacao');
        if (oldModal) oldModal.remove();
        
        let assinaturaHTML = '';
        if (a.temAssinatura && a.assinaturaBase64) {
            assinaturaHTML = `
                <div style="margin-bottom: 20px;">
                    <strong style="display: block; margin-bottom: 8px; color: #065f46; font-size: 14px;">
                        <i class="fas fa-signature"></i> Assinatura do Responsável
                    </strong>
                    <div style="background: #f0fdf4; border: 2px solid #10b981; border-radius: 12px; padding: 15px; text-align: center;">
                        <img src="${a.assinaturaBase64}" style="max-width: 100%; max-height: 120px;" alt="Assinatura">
                        <p style="margin: 10px 0 0; font-size: 13px; color: #065f46;">
                            <i class="fas fa-user-check"></i> Assinado por (Responsável): 
                            <strong>${escapeHTML(a.responsavelNome || 'Não informado')}</strong>
                            ${a.assinadaEm ? `<br><i class="fas fa-clock"></i> Em: ${new Date(a.assinadaEm).toLocaleString('pt-BR')}` : ''}
                        </p>
                    </div>
                </div>
            `;
        }
        
        const alunoFoto = a.alunoFoto || gerarAvatarSVG(a.alunoNome);
        
        let horariosHTML = '';
        if (a.entradaCompleta || a.saidaCompleta) {
            horariosHTML = `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
                    ${a.entradaCompleta ? `
                        <div style="background: #f0fdf4; border-radius: 12px; padding: 14px; border-left: 4px solid #10b981;">
                            <div style="font-size: 11px; color: #059669; text-transform: uppercase; font-weight: 600;"><i class="fas fa-sign-in-alt"></i> Entrada</div>
                            <div style="font-size: 16px; font-weight: 700; color: #065f46; line-height: 1.2; margin-top: 4px;">${escapeHTML(a.entradaCompleta)}</div>
                        </div>
                    ` : ''}
                    ${a.saidaCompleta ? `
                        <div style="background: #fef2f2; border-radius: 12px; padding: 14px; border-left: 4px solid #ef4444;">
                            <div style="font-size: 11px; color: #dc2626; text-transform: uppercase; font-weight: 600;"><i class="fas fa-sign-out-alt"></i> Saída</div>
                            <div style="font-size: 16px; font-weight: 700; color: #991b1b; line-height: 1.2; margin-top: 4px;">${escapeHTML(a.saidaCompleta)}</div>
                        </div>
                    ` : ''}
                </div>
            `;
        }
        
        let periodoDetalheHTML = '';
        if (a.tipo === 'uniforme' && a.uniformePeriodoFormatado) {
            periodoDetalheHTML = `
                <div style="background: #ede9fe; border-radius: 12px; padding: 16px; margin-bottom: 16px; border-left: 4px solid #7c3aed;">
                    <div style="font-size: 12px; color: #6d28d9; text-transform: uppercase; font-weight: 700; margin-bottom: 6px;">
                        <i class="fas fa-tshirt"></i> Período do Uniforme
                    </div>
                    <div style="font-size: 16px; font-weight: 700; color: #5b21b6;">${escapeHTML(a.uniformePeriodoFormatado)}</div>
                </div>
            `;
        } else if (a.periodoFaltaFormatado) {
            periodoDetalheHTML = `
                <div style="background: #fef3c7; border-radius: 12px; padding: 16px; margin-bottom: 16px; border-left: 4px solid #f59e0b;">
                    <div style="font-size: 12px; color: #92400e; text-transform: uppercase; font-weight: 700; margin-bottom: 6px;">
                        <i class="fas fa-calendar-alt"></i> Período
                    </div>
                    <div style="font-size: 16px; font-weight: 700; color: #78350f;">${escapeHTML(a.periodoFaltaFormatado)}</div>
                </div>
            `;
        }
        
        const tipoLabel = a.tipo === 'uniforme' ? 'Autorização de Uniforme' : 'Autorização';
        
        const modalHtml = `
            <div class="modal fade" id="modalDetalhesAutorizacao" tabindex="-1">
                <div class="modal-dialog modal-lg modal-dialog-scrollable">
                    <div class="modal-content" style="border-radius: 16px; overflow: hidden; border: none;">
                        <div class="modal-header" style="background: linear-gradient(135deg, ${a.tipo === 'uniforme' ? '#7c3aed, #8b5cf6' : '#1e3c72, #2a5298'}); color: white; border: none; padding: 20px 25px;">
                            <h5 class="modal-title" style="display: flex; align-items: center; gap: 10px; font-size: 18px;">
                                <i class="fas ${a.tipo === 'uniforme' ? 'fa-tshirt' : 'fa-file-signature'}"></i>
                                Detalhes - ${tipoLabel}
                            </h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body" style="padding: 25px;">
                            <div style="display: flex; align-items: center; gap: 15px; padding: 16px; background: linear-gradient(135deg, #eef2ff, #e0e7ff); border-radius: 14px; margin-bottom: 20px;">
                                <img src="${alunoFoto}" 
                                     style="width: 70px; height: 70px; border-radius: 50%; object-fit: cover; border: 3px solid ${a.tipo === 'uniforme' ? '#7c3aed' : '#1e3c72'}; flex-shrink: 0;"
                                     onerror="this.src='${gerarAvatarSVG(a.alunoNome)}'" alt="">
                                <div style="flex: 1; min-width: 0;">
                                    <h4 style="margin: 0 0 5px; color: ${a.tipo === 'uniforme' ? '#7c3aed' : '#1e3c72'}; font-size: 18px; font-weight: 700;">${escapeHTML(a.alunoNome)}</h4>
                                    <div style="font-size: 13px; color: #475569;">
                                        <i class="fas fa-id-card"></i> <strong>Matrícula:</strong> ${escapeHTML(a.alunoMatricula || 'Não informada')}
                                        &nbsp;•&nbsp;
                                        <i class="fas fa-graduation-cap"></i> <strong>Turma:</strong> ${escapeHTML(a.alunoTurma || '-')}
                                    </div>
                                </div>
                                <div>
                                    ${a.temAssinatura 
                                        ? '<span class="badge bg-success" style="padding: 8px 14px; font-size: 12px; border-radius: 20px;"><i class="fas fa-signature"></i> Assinado</span>'
                                        : '<span class="badge bg-secondary" style="padding: 8px 14px; font-size: 12px; border-radius: 20px;">Sem Assinatura</span>'}
                                </div>
                            </div>
                            <div style="background: #f8fafc; border-radius: 12px; padding: 16px; margin-bottom: 16px; border-left: 4px solid ${a.tipo === 'uniforme' ? '#7c3aed' : '#1e3c72'};">
                                <div style="font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: 600; margin-bottom: 6px;"><i class="fas fa-calendar-check"></i> Data do Registro</div>
                                <div style="font-size: 16px; font-weight: 600; color: #1e293b;">${a.dataFormatada}</div>
                            </div>
                            <div style="background: #f0f9ff; border-radius: 12px; padding: 16px; margin-bottom: 16px; border-left: 4px solid #3b82f6;">
                                <div style="font-size: 12px; color: #0369a1; text-transform: uppercase; font-weight: 600; margin-bottom: 6px;"><i class="fas fa-tag"></i> Motivo</div>
                                <div style="font-size: 15px; font-weight: 600; color: #1e293b;">
                                    ${escapeHTML(a.motivoLabel || '-')}
                                    ${a.motivoOutros ? `<span style="color: #64748b; font-weight: 400;">(${escapeHTML(a.motivoOutros)})</span>` : ''}
                                </div>
                            </div>
                            ${periodoDetalheHTML}
                            ${horariosHTML}
                            ${(a.responsavelNome || a.responsavelCPF || a.responsavelTelefone) ? `
                                <div style="background: #f5f3ff; border-radius: 12px; padding: 16px; margin-bottom: 16px; border-left: 4px solid #8b5cf6;">
                                    <div style="font-size: 12px; color: #6d28d9; text-transform: uppercase; font-weight: 600; margin-bottom: 10px;"><i class="fas fa-user-shield"></i> Responsável</div>
                                    ${a.responsavelNome ? `<div style="font-size: 14px; color: #1e293b;"><i class="fas fa-user" style="color: #8b5cf6;"></i> <strong>${escapeHTML(a.responsavelNome)}</strong></div>` : ''}
                                    ${a.responsavelCPF ? `<div style="font-size: 13px; color: #475569; margin-top: 4px;"><i class="fas fa-id-card" style="color: #8b5cf6;"></i> CPF: <strong>${escapeHTML(a.responsavelCPF)}</strong></div>` : ''}
                                    ${a.responsavelTelefone ? `<div style="font-size: 13px; color: #475569; margin-top: 4px;"><i class="fas fa-phone" style="color: #8b5cf6;"></i> Tel: <strong>${escapeHTML(a.responsavelTelefone)}</strong></div>` : ''}
                                </div>
                            ` : ''}
                            ${a.observacoes ? `
                                <div style="background: #f8fafc; border-radius: 12px; padding: 16px; margin-bottom: 16px; border-left: 4px solid #64748b;">
                                    <div style="font-size: 12px; color: #475569; text-transform: uppercase; font-weight: 600; margin-bottom: 6px;"><i class="fas fa-comment"></i> Observações</div>
                                    <div style="font-size: 14px; color: #1e293b; line-height: 1.5;">${escapeHTML(a.observacoes)}</div>
                                </div>
                            ` : ''}
                            ${assinaturaHTML}
                            <div style="background: #f1f5f9; border-radius: 12px; padding: 14px; text-align: center; font-size: 13px; color: #475569;">
                                <i class="fas fa-user-tie"></i> Registrado por: <strong style="color: #1e293b;">${escapeHTML(a.registradoPorNome || '-')}</strong>
                            </div>
                        </div>
                        <div class="modal-footer" style="padding: 15px 25px; background: #f8fafc; border-top: 1px solid #e5e7eb;">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal" style="border-radius: 10px;">
                                <i class="fas fa-times"></i> Fechar
                            </button>
                            <button type="button" class="btn btn-warning" onclick="bootstrap.Modal.getInstance(document.getElementById('modalDetalhesAutorizacao')).hide(); abrirModalAssinaturaRecepcao('${a.id}')" style="border-radius: 10px;">
                                <i class="fas fa-signature"></i> Editar Assinatura
                            </button>
                            <button type="button" class="btn btn-primary" onclick="imprimirAutorizacao('${a.id}')" style="border-radius: 10px;">
                                <i class="fas fa-print"></i> Imprimir
                            </button>
                        </div>
                    </div>
                </div>
            </div>`;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        new bootstrap.Modal(safeGet('modalDetalhesAutorizacao')).show();
    } catch (error) {
        console.error('Erro:', error);
        notificar('Erro ao carregar detalhes');
    }
}

// ============================================
// 🆕 RESUMO DO DIA COM FILTROS
// ============================================
function limparFiltrosResumo() {
    safeGet('filtroResumoTurma').value = 'todas';
    safeGet('filtroResumoTipo').value = 'todos';
    safeGet('filtroResumoBusca').value = '';
    paginaAtualResumoDia = 1;
    carregarResumoDia();
}

async function carregarResumoDia(pagina = null) {
    const container = safeGet('listaResumoDia');
    if (!container) return;
    
    if (pagina !== null) paginaAtualResumoDia = pagina;
    
    const data = safeGet('dataVerificacao')?.value || getDataLocalISO();
    const turma = safeGet('filtroResumoTurma')?.value || 'todas';
    const tipo = safeGet('filtroResumoTipo')?.value || 'todos';
    const busca = safeGet('filtroResumoBusca')?.value || '';
    
    container.innerHTML = `
        <div class="text-center py-4">
            <div class="spinner-border spinner-border-sm text-primary" role="status"></div>
            <p class="text-muted mt-2 mb-0">Carregando autorizações...</p>
        </div>`;
    
    try {
        const params = new URLSearchParams();
        params.append('data', data);
        params.append('page', paginaAtualResumoDia);
        params.append('limit', itensPorPaginaResumoDia);
        if (turma && turma !== 'todas') params.append('turma', turma);
        if (tipo && tipo !== 'todos') params.append('tipo', tipo);
        if (busca && busca.trim()) params.append('busca', busca.trim());
        
        const response = await fetch(`/api/recepcao/autorizacoes-do-dia?${params.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();
        
        if (!result.success) {
            container.innerHTML = `<div class="alert alert-warning">Nenhuma autorização encontrada</div>`;
            return;
        }
        
        totalRegistrosResumoDia = result.total || 0;
        totalPaginasResumoDia = result.totalPages || 0;
        
        const contador = safeGet('contadorAutorizacoes');
        if (contador) contador.textContent = totalRegistrosResumoDia;
        
        const temFiltro = (turma !== 'todas') || (tipo !== 'todos') || (busca && busca.trim());
        
        if (totalRegistrosResumoDia === 0) {
            container.innerHTML = `
                <div class="text-center py-4 text-muted">
                    <i class="fas ${temFiltro ? 'fa-search' : 'fa-inbox'} fa-3x mb-3" style="color:#cbd5e1;"></i>
                    <p>${temFiltro 
                        ? 'Nenhuma autorização corresponde aos filtros aplicados' 
                        : `Nenhuma autorização registrada para <strong>${result.dataFormatada}</strong>`}</p>
                    ${temFiltro ? `
                        <button onclick="limparFiltrosResumo()" class="btn btn-sm btn-outline-primary mt-2" style="border-radius: 8px;">
                            <i class="fas fa-eraser"></i> Limpar filtros
                        </button>
                    ` : ''}
                </div>`;
            return;
        }
        
        container.innerHTML = `
            <div class="table-responsive">
                <table class="table-resumo">
                    <thead>
                        <tr>
                            <th>Tipo</th>
                            <th>Aluno</th>
                            <th>Turma</th>
                            <th>Período</th>
                            <th>Motivo</th>
                            <th style="text-align:center;">Assinatura</th>
                            <th style="text-align:center; width: 140px;">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${result.autorizacoes.map(a => {
                            const isUniforme = a.tipo === 'uniforme';
                            const tipoBadge = isUniforme 
                                ? '<span class="badge" style="background: #7c3aed; color: white; font-size: 10px;"><i class="fas fa-tshirt"></i> Uniforme</span>'
                                : '<span class="badge" style="background: #1e3c72; color: white; font-size: 10px;"><i class="fas fa-file-signature"></i> Autorização</span>';
                            const periodo = isUniforme 
                                ? (a.uniformePeriodoFormatado || '-')
                                : (a.periodoFaltaFormatado || a.entradaCompleta || '-');
                            return `
                                <tr>
                                    <td>${tipoBadge}</td>
                                    <td><strong>${escapeHTML(a.alunoNome)}</strong><br><small style="color: #94a3b8;">${escapeHTML(a.alunoMatricula || '')}</small></td>
                                    <td>${escapeHTML(a.alunoTurma || '-')}</td>
                                    <td><span style="font-size: 12px;">${escapeHTML(periodo)}</span></td>
                                    <td><span class="badge bg-info text-dark">${escapeHTML(a.motivoLabel)}</span></td>
                                    <td style="text-align:center;">
                                        ${a.temAssinatura 
                                            ? '<span class="badge bg-success"><i class="fas fa-signature"></i> Assinado</span>' 
                                            : '<span class="badge bg-secondary">Sem</span>'}
                                    </td>
                                    <td style="text-align:center;">
                                        <div style="display: flex; gap: 5px; justify-content: center;">
                                            <button class="btn-resumo-action btn-resumo-view" 
                                                    onclick="verDetalhesCompletos('${a.id}')" 
                                                    title="Ver detalhes">
                                                <i class="fas fa-eye"></i>
                                            </button>
                                            <button class="btn-resumo-action" 
                                                    onclick="abrirModalAssinaturaRecepcao('${a.id}')" 
                                                    title="Editar assinatura"
                                                    style="background: ${a.temAssinatura ? '#10b981' : '#f59e0b'}; color: white;">
                                                <i class="fas fa-signature"></i>
                                            </button>
                                            <button class="btn-resumo-action btn-resumo-print" 
                                                    onclick="imprimirAutorizacao('${a.id}')" 
                                                    title="Imprimir">
                                                <i class="fas fa-print"></i>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
            
            ${renderizarPaginacaoResumoDia(result)}
        `;
        
        container.querySelectorAll('.btn-page-resumo').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const novaPagina = parseInt(btn.getAttribute('data-page'));
                if (!isNaN(novaPagina) && novaPagina !== paginaAtualResumoDia) {
                    carregarResumoDia(novaPagina);
                }
            });
        });
        
    } catch (error) {
        console.error('Erro:', error);
        container.innerHTML = `<div class="alert alert-danger">Erro ao carregar resumo</div>`;
    }
}

function renderizarPaginacaoResumoDia(result) {
    const { page, totalPages, total, limit } = result;
    
    if (totalPages <= 1) {
        return `<div style="text-align:center;padding:15px 0;color:#6b7280;font-size:13px;">
            Mostrando <strong>${total}</strong> registro(s)
        </div>`;
    }
    
    const de = ((page - 1) * limit) + 1;
    const ate = Math.min(page * limit, total);
    
    const maxBotoes = 5;
    let inicio = Math.max(1, page - Math.floor(maxBotoes / 2));
    let fim = Math.min(totalPages, inicio + maxBotoes - 1);
    if (fim - inicio + 1 < maxBotoes) inicio = Math.max(1, fim - maxBotoes + 1);
    
    let botoesHTML = '';
    const estiloBtn = 'min-width:36px;height:36px;border:1px solid #e5e7eb;background:white;border-radius:8px;cursor:pointer;color:#4b5563;font-size:13px;';
    const estiloBtnDis = 'min-width:36px;height:36px;border:1px solid #e5e7eb;background:#f9fafb;border-radius:8px;color:#d1d5db;font-size:13px;cursor:not-allowed;';
    const estiloBtnAtivo = 'min-width:36px;height:36px;border:1px solid #1e3c72;background:#1e3c72;color:white;border-radius:8px;font-size:13px;font-weight:600;cursor:default;';
    
    botoesHTML += page > 1
        ? `<button class="btn-page-resumo" data-page="1" title="Primeira" style="${estiloBtn}"><i class="fas fa-angle-double-left"></i></button>`
        : `<button disabled style="${estiloBtnDis}"><i class="fas fa-angle-double-left"></i></button>`;
    
    botoesHTML += page > 1
        ? `<button class="btn-page-resumo" data-page="${page - 1}" title="Anterior" style="${estiloBtn}"><i class="fas fa-angle-left"></i></button>`
        : `<button disabled style="${estiloBtnDis}"><i class="fas fa-angle-left"></i></button>`;
    
    if (inicio > 1) botoesHTML += `<span style="padding:0 5px;color:#9ca3af;font-size:13px;">…</span>`;
    
    for (let i = inicio; i <= fim; i++) {
        botoesHTML += i === page
            ? `<button disabled style="${estiloBtnAtivo}">${i}</button>`
            : `<button class="btn-page-resumo" data-page="${i}" style="${estiloBtn}">${i}</button>`;
    }
    
    if (fim < totalPages) botoesHTML += `<span style="padding:0 5px;color:#9ca3af;font-size:13px;">…</span>`;
    
    botoesHTML += page < totalPages
        ? `<button class="btn-page-resumo" data-page="${page + 1}" title="Próxima" style="${estiloBtn}"><i class="fas fa-angle-right"></i></button>`
        : `<button disabled style="${estiloBtnDis}"><i class="fas fa-angle-right"></i></button>`;
    
    botoesHTML += page < totalPages
        ? `<button class="btn-page-resumo" data-page="${totalPages}" title="Última" style="${estiloBtn}"><i class="fas fa-angle-double-right"></i></button>`
        : `<button disabled style="${estiloBtnDis}"><i class="fas fa-angle-double-right"></i></button>`;
    
    return `
        <div class="paginacao-resumo-dia" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:15px;margin-top:20px;padding-top:15px;border-top:1px solid #e5e7eb;">
            <div style="font-size:13px;color:#6b7280;">
                Mostrando <strong>${de}</strong>–<strong>${ate}</strong> de <strong>${total}</strong>
            </div>
            <div style="display:flex;gap:5px;align-items:center;">${botoesHTML}</div>
        </div>
    `;
}

// ============================================
// LIMPAR TELA
// ============================================
function limparTela() {
    safeGet('resultadoConsulta').style.display = 'none';
    currentAluno = null;
    // 🆕 Reseta filtros de atrasos
    filtrosAtrasos.motivo = 'todos';
    filtrosAtrasos.busca = '';
    filtrosAtrasos.dataInicio = '';
    filtrosAtrasos.dataFim = '';
    if (modoAtual === 'automatico') reiniciarScannerAutomatico();
    else carregarAlunosPorTurma();
}

// ============================================
// NOTIFICAÇÕES
// ============================================
function notificar(mensagem, tipo = 'success', duracao = 3500) {
    if (typeof window.mostrarToastConcluido === 'function') {
        window.mostrarToastConcluido(mensagem, tipo);
        return;
    }
    let container = document.getElementById('__toastContainerRecepcao');
    if (!container) {
        container = document.createElement('div');
        container.id = '__toastContainerRecepcao';
        container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:999999;display:flex;flex-direction:column;gap:10px;pointer-events:none;';
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
    toast.style.cssText = `background:${c.bg};color:white;padding:14px 20px;border-radius:10px;box-shadow:0 4px 12px rgba(0,0,0,0.2);font-family:-apple-system,sans-serif;font-size:14px;max-width:380px;display:flex;align-items:center;gap:10px;pointer-events:auto;opacity:0;transform:translateX(100%);transition:all 0.3s ease;white-space:pre-line;`;
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

let notificacoesInterval = null;

async function carregarNotificacoesSistema() {
    try {
        const token = localStorage.getItem('auth_token');
        if (!token) return;
        const response = await fetch('/api/notificacoes?apenasNaoLidas=false&limite=20', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success) {
            window.__notificacoesCache = data.notificacoes || [];
            if (!window.__lembretesCache) window.__lembretesCache = [];
        }
    } catch (error) {
        console.error('Erro ao carregar notificações:', error);
    }
}

function renderizarSino() {
    const lista = document.getElementById('notificacoesLista');
    if (!lista) return;
    const cache = window.__notificacoesCache || [];
    if (cache.length === 0) {
        lista.innerHTML = `<div style="text-align:center;padding:40px;color:#6c757d;">
            <i class="fas fa-bell-slash" style="font-size:2rem;margin-bottom:10px;display:block;"></i>
            <p style="margin:0;">Nenhuma notificação</p>
        </div>`;
        return;
    }
    lista.innerHTML = cache.map(notif => {
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
        return `
            <div class="notificacao-item ${notif.lida ? '' : 'nao-lida'}"
                 data-notif-id="${notif._id}"
                 data-notif-link="${escapeHTML(notif.link || '#')}"
                 style="padding:12px 20px;border-bottom:1px solid #f3f4f6;cursor:pointer;${notif.lida ? '' : 'background:#eff6ff;'}">
                <div style="display:flex;gap:10px;">
                    <div style="width:36px;height:36px;border-radius:50%;background:${notif.cor || '#1e3c72'};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                        <span style="font-size:16px;">${notif.icone || '📋'}</span>
                    </div>
                    <div style="flex:1;min-width:0;">
                        <div style="font-weight:600;font-size:13px;color:#1e293b;margin-bottom:2px;">${escapeHTML(notif.titulo || '')}</div>
                        <div style="font-size:12px;color:#64748b;margin-bottom:4px;">${escapeHTML(notif.mensagem || '')}</div>
                        <div style="font-size:11px;color:#94a3b8;"><i class="far fa-clock"></i> ${tempoTexto}</div>
                    </div>
                </div>
            </div>`;
    }).join('');
    lista.querySelectorAll('.notificacao-item').forEach(item => {
        item.addEventListener('click', () => {
            abrirNotificacao(item.getAttribute('data-notif-id'), item.getAttribute('data-notif-link'));
        });
    });
}

function atualizarBadge() {
    const badge = document.getElementById('notificacoesBadge');
    const btn = document.getElementById('notificacoesBtn');
    if (!badge || !btn) return;
    const naoLidas = (window.__notificacoesCache || []).filter(n => !n.lida).length;
    if (naoLidas > 0) {
        badge.textContent = naoLidas > 99 ? '99+' : naoLidas;
        badge.style.display = 'inline-flex';
        btn.classList.add('tem-notificacao');
    } else {
        badge.style.display = 'none';
        btn.classList.remove('tem-notificacao');
    }
    atualizarBadgeUnificado();
}

async function carregarTudo() {
    await carregarNotificacoesSistema();
    renderizarSino();
    atualizarBadge();
}

function abrirNotificacoes() {
    const dropdown = document.getElementById('notificacoesDropdown');
    if (!dropdown) return;
    dropdown.classList.toggle('show');
    if (dropdown.classList.contains('show')) carregarTudo();
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
            notificar('Notificações marcadas como lidas!', 'success');
        }
    } catch (error) {
        console.error('Erro ao marcar todas como lidas:', error);
    }
}

async function limparMinhasNotificacoes(event) {
    if (event) event.stopPropagation();
    const confirmacao = await confirm('🗑️ Deseja excluir TODAS as suas notificações?\n\nEsta ação não pode ser desfeita.');
    if (!confirmacao) return;
    try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch('/api/notificacoes/limpar-minhas', {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success) {
            window.__notificacoesCache = [];
            await carregarTudo();
            notificar('✅ Notificações excluídas!', 'success');
        } else {
            throw new Error(data.error || 'Erro ao excluir');
        }
    } catch (error) {
        console.error('Erro ao limpar notificações:', error);
        notificar('❌ Erro ao limpar notificações', 'error');
    }
}

async function logout() {
    const confirmar = await confirm('Tem certeza que deseja sair do sistema?');
    if (confirmar) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_data');
        window.location.href = '/login.html';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    carregarTudo();
    if (notificacoesInterval) clearInterval(notificacoesInterval);
    notificacoesInterval = setInterval(carregarTudo, 15000);
});

document.addEventListener('click', function(event) {
    const dropdown = document.getElementById('notificacoesDropdown');
    const btn = document.getElementById('notificacoesBtn');
    if (dropdown && btn && !btn.contains(event.target) && !dropdown.contains(event.target)) {
        dropdown.classList.remove('show');
    }
});

// ============================================
// EXPORTAR GLOBAIS
// ============================================
window.setModo = setModo;
window.limparTela = limparTela;
window.imprimirAutorizacao = imprimirAutorizacao;
window.verDetalhesCompletos = verDetalhesCompletos;
window.carregarResumoDia = carregarResumoDia;
window.irParaHoje = irParaHoje;
window.irParaOntem = irParaOntem;
window.notificar = notificar;
window.abrirNotificacoes = abrirNotificacoes;
window.fecharNotificacoes = fecharNotificacoes;
window.marcarTodasLidas = marcarTodasLidas;
window.logout = logout;
window.abrirModalAssinaturaRecepcao = abrirModalAssinaturaRecepcao;
window.limparCanvasRecepcao = limparCanvasRecepcao;
window.salvarCanvasRecepcao = salvarCanvasRecepcao;
window.removerAssinaturaRecepcao = removerAssinaturaRecepcao;
window.copiarLinkAssinaturaRecepcao = copiarLinkAssinaturaRecepcao;
window.reimprimirAutorizacaoAtual = reimprimirAutorizacaoAtual;
window.toggleUserMenu = toggleUserMenu;
window.abrirMenuNotificacoesSeguro = abrirMenuNotificacoesSeguro;
window.atualizarBadgeUnificado = atualizarBadgeUnificado;
window.atualizarBoasVindasETurnoRecepcao = atualizarBoasVindasETurnoRecepcao;
window.atualizarRelogioRecepcao = atualizarRelogioRecepcao;
window.limparMinhasNotificacoes = limparMinhasNotificacoes;
window.limparFiltrosResumo = limparFiltrosResumo;

console.log('✅ Recepção JS carregado (filtros em resumo + atrasos)');