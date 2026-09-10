// ============================================
// GESTÃO GERAL - MÓDULO DE ATRAZOS
// Modo Automático (QR) + Modo Manual
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

// Autocomplete
let __alunosParaRelatorio = [];
let __alunosFiltrados = [];
let __indiceSelecionado = -1;
let __alunosCarregados = false;

const MOTIVO_LABELS = {
    'onibus': 'Ônibus',
    'transito': 'Trânsito',
    'problemas_pessoais': 'Problemas Pessoais',
    'fardamento': 'Fardamento',
    'outros': 'Outros'
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
        alert('Acesso negado.');
        window.location.href = '/login.html';
        return;
    }
    
    safeSetText('userName', userData.nome || 'Gestão Geral');
    safeSetText('dataAtual', new Date().toLocaleDateString('pt-BR'));
    
    await carregarFotoPerfil();
    await carregarTurmasParaManual();
    await carregarTurmasParaRelatorio();
    
    // Inicia scanner (só quando a aba atrasos estiver ativa)
    setTimeout(() => {
        if (document.getElementById('modoAutomatico')?.offsetParent !== null) {
            iniciarScannerAutomatico();
        }
    }, 1000);
    
    // Listeners dos modos
    safeGet('modoAutomaticoBtn')?.addEventListener('click', () => setModo('automatico'));
    safeGet('modoManualBtn')?.addEventListener('click', () => setModo('manual'));
    
    safeGet('filtroTurmaManual')?.addEventListener('change', () => carregarAlunosPorTurma());
    safeGet('filtroBuscaManual')?.addEventListener('input', () => filtrarAlunosManual());
    
    // Listeners das abas de atraso
    safeGet('atraso-dashboard-tab')?.addEventListener('shown.bs.tab', () => {
        carregarDashboardAtrasos();
    });
    
    safeGet('atraso-relatorios-tab')?.addEventListener('shown.bs.tab', () => {
        carregarTurmasParaRelatorio();
    });
    
    // Quando entrar na aba atrasos, iniciar scanner
    safeGet('aba-atrasos')?.addEventListener('shown.bs.tab', () => {
        setTimeout(() => {
            if (modoAtual === 'automatico' && !scannerAutoAtivo) {
                iniciarScannerAutomatico();
            }
        }, 300);
    });
});

window.addEventListener('beforeunload', () => {
    pararScannerAutomatico();
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
        console.log('✅ Scanner iniciado');
    } catch (err) {
        console.error('Erro ao iniciar scanner:', err);
        qrContainer.innerHTML = `<div class="alert alert-warning m-3">Não foi possível acessar a câmera.</div>`;
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
    console.log('QR Code:', decodedText);
    const alunoId = extrairAlunoId(decodedText);
    if (!alunoId) { alert('QR Code inválido'); return; }
    
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

// ============================================
// GERENCIAMENTO DE MODOS
// ============================================
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
        if (turmaSelecionada) {
            await carregarAlunosPorTurma();
        } else {
            safeGet('listaAlunosManual').innerHTML = '<div class="text-center py-3">Selecione uma turma para ver os alunos</div>';
        }
    }
}

// ============================================
// MODO MANUAL
// ============================================
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
    } catch (error) {
        console.error('Erro:', error);
    }
}

async function carregarAlunosPorTurma() {
    const turma = safeGet('filtroTurmaManual')?.value;
    
    if (!turma) {
        safeGet('listaAlunosManual').innerHTML = '<div class="text-center py-3">Selecione uma turma</div>';
        return;
    }
    
    safeGet('listaAlunosManual').innerHTML = 
        '<div class="text-center py-3"><div class="loading-spinner"></div><p>Carregando...</p></div>';
    
    try {
        const response = await fetch(`/api/gestao-geral/atraso/alunos-por-turma?turma=${encodeURIComponent(turma)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success && Array.isArray(data.alunos)) {
            alunosPorTurma = data.alunos;
            filtrarAlunosManual();
        } else {
            safeGet('listaAlunosManual').innerHTML = 
                '<div class="alert alert-warning">Nenhum aluno encontrado</div>';
        }
    } catch (error) {
        console.error('Erro:', error);
    }
}

function filtrarAlunosManual() {
    if (!Array.isArray(alunosPorTurma)) return;
    
    const busca = (safeGet('filtroBuscaManual')?.value || '').toLowerCase();
    let filtrados = alunosPorTurma;
    if (busca) {
        filtrados = filtrados.filter(a => (a.nome || '').toLowerCase().includes(busca));
    }
    
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
                 data-aluno-id="${aluno.id}"
                 data-aluno-nome="${escapeHTML(aluno.nome)}"
                 style="cursor: pointer;">
                <div>
                    <strong>${escapeHTML(aluno.nome)}</strong>
                    <br>
                    <small class="text-muted">${escapeHTML(aluno.matricula || 'Sem matrícula')} • ${escapeHTML(aluno.curso || '')}</small>
                </div>
                <i class="fas fa-hand-pointer fa-2x text-primary"></i>
            </div>
        `;
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
            <i class="fas fa-spinner fa-spin fa-2x" style="color: #1e3c72;"></i>
        `;
    }
    
    try {
        await buscarAluno(alunoId);
    } catch (error) {
        console.error('Erro:', error);
    }
}

// ============================================
// BUSCAR E EXIBIR ALUNO
// ============================================
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
            alert(data.error || 'Aluno não encontrado');
            if (modoAtual === 'automatico') reiniciarScannerAutomatico();
            else carregarAlunosPorTurma();
        }
    } catch (error) {
        console.error('Erro:', error);
        
        if (error.name === 'AbortError') {
            alert('Tempo esgotado. Tente novamente.');
        } else {
            alert('Erro ao buscar aluno');
        }
        
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
        fotoEl.onerror = function() {
            this.onerror = null;
            this.src = gerarAvatarSVG(aluno.nome);
        };
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
            </div>
        `;
    }
    
    const histDiv = safeGet('historicoRecente');
    if (histDiv && data.historicoRecente?.length > 0) {
        histDiv.innerHTML = `
            <h6 class="text-muted mt-3 mb-2"><i class="fas fa-history"></i> Histórico Recente</h6>
            ${data.historicoRecente.map(h => `
                <div class="p-2 mb-2" style="background: #f8fafc; border-radius: 8px; font-size: 13px;">
                    <strong>${escapeHTML(h.motivoLabel)}</strong>: ${escapeHTML((h.descricao || '').substring(0, 80))}
                    <br><small class="text-muted">${h.dataHora ? new Date(h.dataHora).toLocaleString('pt-BR') : ''}</small>
                </div>
            `).join('')}
        `;
    } else if (histDiv) {
        histDiv.innerHTML = '';
    }
    
    safeGet('alunoInfo').style.display = 'block';
    safeGet('alunoInfo').scrollIntoView({ behavior: 'smooth' });
}

// ============================================
// FORMULÁRIO
// ============================================
function mostrarFormRegistro() {
    safeGet('formRegistro').style.display = 'block';
    safeGet('motivoSelecionado').value = '';
    motivoSelecionado = null;
    document.querySelectorAll('.tipo-card').forEach(c => c.classList.remove('selected'));
    safeGet('descricao').value = '';
    safeGet('observacoes').value = '';
    safeGet('horarioPrevisto').value = '';
    safeGet('horarioChegada').value = '';
    safeGet('motivoOutrosTexto').value = '';
    safeGet('campoOutros').style.display = 'none';
}

function selecionarMotivo(motivo) {
    if (!motivo) return;
    motivoSelecionado = motivo;
    safeGet('motivoSelecionado').value = motivo;
    
    document.querySelectorAll('.tipo-card').forEach(c => c.classList.remove('selected'));
    const card = document.querySelector(`.tipo-card[data-tipo="${motivo}"]`);
    if (card) card.classList.add('selected');
    
    safeGet('campoOutros').style.display = motivo === 'outros' ? 'block' : 'none';
}

// ============================================
// REGISTRAR
// ============================================
async function registrarAtraso() {
    if (!motivoSelecionado) { alert('Selecione o motivo do atraso'); return; }
    
    const descricao = (safeGet('descricao')?.value || '').trim();
    if (!descricao) { alert('Descreva o ocorrido'); return; }
    
    if (!currentAluno || !currentAluno.id) { alert('Nenhum aluno selecionado'); return; }
    
    if (motivoSelecionado === 'outros') {
        const motivoOutros = (safeGet('motivoOutrosTexto')?.value || '').trim();
        if (!motivoOutros) { alert('Especifique o motivo'); return; }
    }
    
    const btn = document.querySelector('#formRegistro .btn-primary-custom');
    if (btn) btn.disabled = true;
    
    try {
        const response = await fetch('/api/gestao-geral/atraso/registrar', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                alunoId: currentAluno.id,
                motivo: motivoSelecionado,
                descricao,
                observacoes: safeGet('observacoes')?.value || '',
                detalhes: {
                    motivoOutros: safeGet('motivoOutrosTexto')?.value || '',
                    horarioPrevisto: safeGet('horarioPrevisto')?.value || '',
                    horarioChegada: safeGet('horarioChegada')?.value || ''
                }
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert(`✅ ${data.message}`);
            limparTela();
            if (modoAtual === 'automatico') reiniciarScannerAutomatico();
            else carregarAlunosPorTurma();
        } else {
            alert('❌ ' + (data.error || 'Erro'));
        }
    } catch (error) {
        console.error('Erro:', error);
        alert('Erro ao registrar');
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
        if (!scannerAutoAtivo && modoAtual === 'automatico') {
            iniciarScannerAutomatico();
        }
    }, 1000);
}

// ============================================
// DASHBOARD
// ============================================
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
        
        // Gráfico Motivos
        const ctxMotivos = safeGet('chartMotivos');
        if (ctxMotivos && data.porMotivo) {
            if (dashboardCharts.motivos) try { dashboardCharts.motivos.destroy(); } catch(e){}
            dashboardCharts.motivos = new Chart(ctxMotivos.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: data.porMotivo.map(m => m.label),
                    datasets: [{
                        data: data.porMotivo.map(m => m.count),
                        backgroundColor: ['#1e3c72', '#2a5298', '#3b82f6', '#60a5fa', '#93c5fd']
                    }]
                },
                options: { responsive: true, maintainAspectRatio: true }
            });
        }
        
        // Gráfico por Dia
        const ctxAtrasos = safeGet('chartAtrasos');
        if (ctxAtrasos && data.tendencias?.ultimos7Dias) {
            if (dashboardCharts.atrasos) try { dashboardCharts.atrasos.destroy(); } catch(e){}
            dashboardCharts.atrasos = new Chart(ctxAtrasos.getContext('2d'), {
                type: 'line',
                data: {
                    labels: data.tendencias.ultimos7Dias.map(d => d.dia),
                    datasets: [{
                        label: 'Atrasos',
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
        
        // Gráfico Turmas
        const ctxTurmas = safeGet('chartTurmas');
        if (ctxTurmas && data.tendencias?.porTurma) {
            if (dashboardCharts.turmas) try { dashboardCharts.turmas.destroy(); } catch(e){}
            dashboardCharts.turmas = new Chart(ctxTurmas.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: data.tendencias.porTurma.map(t => t.turma),
                    datasets: [{
                        label: 'Atrasos',
                        data: data.tendencias.porTurma.map(t => t.count),
                        backgroundColor: '#2a5298',
                        borderRadius: 8
                    }]
                },
                options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } } }
            });
        }
        
        // Reincidentes
        const reinc = safeGet('alunosReincidentes');
        if (reinc) {
            const lista = data.tendencias?.alunosReincidentes || [];
            if (lista.length > 0) {
                reinc.innerHTML = `
                    <div class="table-responsive">
                        <table class="table table-sm">
                            <thead><tr><th>Aluno</th><th>Turma</th><th>Atrasos</th></tr></thead>
                            <tbody>
                                ${lista.map(a => `
                                    <tr>
                                        <td><strong>${escapeHTML(a.alunoNome || '')}</strong></td>
                                        <td>${escapeHTML(a.alunoTurma || '-')}</td>
                                        <td><span class="badge bg-danger">${a.count || 0}</span></td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
            } else {
                reinc.innerHTML = `<p class="text-muted text-center py-3"><i class="fas fa-check-circle text-success"></i> Nenhum aluno reincidente</p>`;
            }
        }
    } catch (error) {
        console.error('Erro no dashboard:', error);
    }
}

// ============================================
// RELATÓRIOS
// ============================================
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
    } catch (error) {
        console.error('Erro:', error);
    }
}

function toggleRelatorioFiltros() {
    const tipo = safeGet('tipoRelatorio')?.value;
    safeGet('filtroTurmaDiv').style.display = tipo === 'turma' ? 'block' : 'none';
    safeGet('filtroAlunoDiv').style.display = tipo === 'aluno' ? 'block' : 'none';
    
    if (tipo === 'turma') {
        const selectTurma = safeGet('filtroTurma');
        if (selectTurma && selectTurma.options.length <= 1) {
            carregarTurmasParaRelatorio();
        }
    }
    
    if (tipo === 'aluno') {
        inicializarAutocompleteAluno();
        setTimeout(() => safeGet('buscaAlunoRelatorio')?.focus(), 100);
        if (!__alunosCarregados) carregarAlunosParaRelatorio();
    }
}

// ============================================
// AUTOCOMPLETE
// ============================================
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
        
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            __indiceSelecionado = Math.min(__indiceSelecionado + 1, __alunosFiltrados.length - 1);
            destacarItemAutocomplete();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            __indiceSelecionado = Math.max(__indiceSelecionado - 1, -1);
            destacarItemAutocomplete();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (__indiceSelecionado >= 0 && __alunosFiltrados[__indiceSelecionado]) {
                selecionarAlunoAutocomplete(__alunosFiltrados[__indiceSelecionado]);
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
}

async function carregarAlunosParaRelatorio() {
    if (__alunosCarregados && __alunosParaRelatorio.length > 0) return;
    
    const inputBusca = safeGet('buscaAlunoRelatorio');
    if (inputBusca) {
        inputBusca.placeholder = 'Carregando...';
        inputBusca.disabled = true;
    }
    
    try {
        const turmasRes = await fetch('/api/gestao-geral/atraso/turmas', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const turmasData = await turmasRes.json();
        
        if (!turmasData.success) return;
        
        const todosAlunos = [];
        for (const turma of turmasData.turmas) {
            try {
                const res = await fetch(`/api/gestao-geral/atraso/alunos-por-turma?turma=${encodeURIComponent(turma)}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
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
        
        if (inputBusca) {
            inputBusca.placeholder = 'Digite o nome do aluno...';
            inputBusca.disabled = false;
        }
    } catch (error) {
        console.error('Erro:', error);
    }
}

function filtrarAlunosAutocomplete(termo) {
    const listEl = safeGet('autocompleteAlunoList');
    if (!listEl) return;
    
    if (!__alunosCarregados) {
        listEl.innerHTML = `<div class="autocomplete-aluno-loading">Carregando...</div>`;
        listEl.style.display = 'block';
        carregarAlunosParaRelatorio().then(() => {
            if (__alunosCarregados) filtrarAlunosAutocomplete(termo);
        });
        return;
    }
    
    const termoLower = termo.toLowerCase();
    __alunosFiltrados = __alunosParaRelatorio.filter(a => 
        (a.nome || '').toLowerCase().includes(termoLower) ||
        (a.matricula || '').toLowerCase().includes(termoLower)
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
            </div>
        `;
    }).join('');
    
    listEl.querySelectorAll('.autocomplete-aluno-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
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
        if (i === __indiceSelecionado) {
            item.classList.add('selected');
            item.scrollIntoView({ block: 'nearest' });
        } else {
            item.classList.remove('selected');
        }
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

// ============================================
// CARREGAR RELATÓRIO
// ============================================
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
        if (!turma) { alert('Selecione uma turma'); return; }
        url = `/api/gestao-geral/atraso/relatorio/turma/${encodeURIComponent(turma)}?`;
        if (dataInicio) url += `dataInicio=${dataInicio}&`;
        if (dataFim) url += `dataFim=${dataFim}&`;
    } else if (tipo === 'aluno') {
        const alunoId = safeGet('filtroAluno')?.value;
        if (!alunoId) { alert('Selecione um aluno'); return; }
        url = `/api/gestao-geral/atraso/relatorio/aluno/${alunoId}?`;
        if (dataInicio) url += `dataInicio=${dataInicio}&`;
        if (dataFim) url += `dataFim=${dataFim}&`;
    }
    
    try {
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success) {
            relatorioData = data;
            exibirRelatorio(data, tipo);
        } else {
            alert('Erro ao carregar relatório');
        }
    } catch (error) {
        console.error('Erro:', error);
        alert('Erro ao carregar relatório');
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
                <div class="row">
                    ${(data.porMotivo || []).map(m => `
                        <div class="col-md-4 mb-2">
                            <div class="p-2" style="background:#dbeafe;border-radius:8px;">
                                <strong>${escapeHTML(m.label)}</strong>: ${m.count}
                            </div>
                        </div>
                    `).join('')}
                </div>
                <h6 class="mt-4">Por Turma</h6>
                <div class="table-responsive">
                    <table class="table table-sm">
                        <thead><tr><th>Turma</th><th>Total</th><th>Alunos</th></tr></thead>
                        <tbody>
                            ${(data.porTurma || []).map(t => `
                                <tr><td>${escapeHTML(t.turma)}</td><td>${t.total}</td><td>${t.totalAlunos}</td></tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div></div>
        `;
    } else if (tipo === 'turma') {
        container.innerHTML = `
            <div class="card"><div class="card-body">
                <h5>Relatório da Turma: ${escapeHTML(data.turma || '')}</h5>
                <p>Total: <strong>${data.estatisticas?.totalAtrasos || 0}</strong></p>
                <h6 class="mt-4">Por Aluno</h6>
                <div class="table-responsive">
                    <table class="table table-sm">
                        <thead><tr><th>Aluno</th><th>Total</th></tr></thead>
                        <tbody>
                            ${(data.porAluno || []).map(a => `
                                <tr><td>${escapeHTML(a.alunoNome)}</td><td><span class="badge bg-primary">${a.total}</span></td></tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div></div>
        `;
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
                        <tbody>
                            ${(data.atrasos || []).map(a => `
                                <tr>
                                    <td>${new Date(a.dataHora).toLocaleString('pt-BR')}</td>
                                    <td>${escapeHTML(a.motivoLabel)}</td>
                                    <td>${escapeHTML((a.descricao || '').substring(0, 100))}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div></div>
        `;
    }
}

function exportarCSV() {
    if (!relatorioData) { alert('Nenhum relatório carregado'); return; }
    
    const dados = relatorioData.atrasos || [];
    if (dados.length === 0) { alert('Nenhum dado'); return; }
    
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

function logout() {
    if (confirm('Tem certeza que deseja sair do sistema?')) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_data');
        window.location.href = '/login.html';
    }
}

window.selecionarMotivo = selecionarMotivo;
window.registrarAtraso = registrarAtraso;
window.limparTela = limparTela;
window.toggleRelatorioFiltros = toggleRelatorioFiltros;
window.carregarRelatorio = carregarRelatorio;
window.exportarCSV = exportarCSV;
window.logout = logout;
window.selecionarAlunoAutocomplete = selecionarAlunoAutocomplete;