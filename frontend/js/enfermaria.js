// ============================================
// ENFERMARIA - SISTEMA DE ATENDIMENTOS
// Modo Automático (QR) + Modo Manual (Clique direto no aluno)

// ============================================
// 🚫 BLOQUEAR ALERTS NATIVOS (KODULAR/WEBVIEW)
// ============================================
// Sobrescreve window.alert para usar toast customizado
window.alert = function(mensagem) {
    console.warn('⚠️ alert() nativo bloqueado. Use mostrarToast()');
    if (typeof mostrarToast === 'function') {
        mostrarToast(String(mensagem), 'info', 4000);
    }
};

// Sobrescreve window.confirm (assíncrono)
window.confirm = function(mensagem) {
    console.warn('⚠️ confirm() nativo bloqueado. Use await confirmar()');
    // Retorna true automaticamente para não quebrar o fluxo
    // (melhor trocar por confirmar() manualmente)
    return true;
};

window.prompt = function(mensagem, valorPadrao) {
    console.warn('⚠️ prompt() nativo bloqueado.');
    return null;
};
// ============================================

let token = localStorage.getItem('auth_token');
let currentAluno = null;
let currentAtendimento = null;
let relatorioData = null;
let dashboardCharts = {};

// Scanner Auto
let scannerAuto = null;
let scannerAutoAtivo = false;

// Estado
let modoAtual = 'automatico';
let turmasDisponiveis = [];
let alunosPorTurma = [];

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

// ============================================
// INICIALIZAÇÃO
// ============================================
// ============================================
// INICIALIZAÇÃO
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Verificar se tem token
    if (!token) { 
        window.location.href = '/login.html'; 
        return; 
    }
    
    // 2. Verificar se o usuário tem permissão
    const userData = JSON.parse(localStorage.getItem('user_data') || '{}');
    const allowedRoles = ['enfermaria', 'super_admin', 'admin'];
    
    if (!allowedRoles.includes(userData.role)) {
        console.warn('❌ Acesso negado. Role:', userData.role);
        mostrarToast('Acesso negado. Você não tem permissão para acessar esta página.');
        window.location.href = '/login.html';
        return;
    }
    
    console.log('✅ Enfermaria autenticada:', userData.nome);
    
    // 3. Preencher dados do usuário na tela
    safeSetText('userName', userData.nome || 'Usuário');
    safeSetText('dataAtual', new Date().toLocaleDateString('pt-BR'));
    
    // 4. Carregar dados iniciais em paralelo
    try {
        await Promise.allSettled([
            carregarFotoPerfil(),
            carregarAtendimentosAtivos(),
            carregarTurmasParaRelatorio(),
            carregarTurmasParaManual(),
            carregarDashboard()
        ]);
    } catch (error) {
        console.error('Erro ao carregar dados iniciais:', error);
    }
    
    // 5. Iniciar scanner automático (padrão)
    await iniciarScannerAutomatico();
    
    // 6. Atualização automática a cada 30 segundos
    setInterval(() => {
        if (safeGet('ativos')?.classList.contains('active')) {
            carregarAtendimentosAtivos();
        }
        if (safeGet('dashboard')?.classList.contains('active')) {
            carregarDashboard();
        }
    }, 30000);
    
    // 7. Eventos das tabs
    safeGet('dashboard-tab')?.addEventListener('shown.bs.tab', () => {
        carregarDashboard();
    });
    
    // 8. Eventos de mudança de modo
    safeGet('modoAutomaticoBtn')?.addEventListener('click', () => setModo('automatico'));
    safeGet('modoManualBtn')?.addEventListener('click', () => setModo('manual'));
    
    // 9. Eventos do modo manual
    safeGet('filtroTurmaManual')?.addEventListener('change', () => carregarAlunosPorTurma());
    safeGet('filtroBuscaManual')?.addEventListener('input', () => filtrarAlunosManual());
    
    // 10. Atalho ESC para fechar tela do aluno
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
        console.log('✅ Scanner Automático iniciado');
    } catch (err) {
        console.error('Erro ao iniciar scanner automático:', err);
        qrContainer.innerHTML = `<div class="mostrarToast mostrarToast-warning m-3">Não foi possível acessar a câmera.</div>`;
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
    console.log('QR Code (Automático):', decodedText);
    const alunoId = extrairAlunoId(decodedText);
    if (!alunoId) { mostrarToast('QR Code inválido'); return; }
    
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
    safeGet('formEntrada').style.display = 'none';
    safeGet('formSaida').style.display = 'none';
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
        if (turmaSelecionada) {
            await carregarAlunosPorTurma();
        } else {
            safeGet('listaAlunosManual').innerHTML = '<div class="text-center py-3">Selecione uma turma para ver os alunos</div>';
        }
    }
}

// ============================================
// MODO MANUAL - TURMAS E ALUNOS
// ============================================
async function carregarTurmasParaManual() {
    try {
        const response = await fetch('/api/enfermaria/turmas', {
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
        console.error('Erro ao carregar turmas:', error);
    }
}

async function carregarAlunosPorTurma() {
    const turma = safeGet('filtroTurmaManual')?.value;
    
    if (!turma) {
        safeGet('listaAlunosManual').innerHTML = '<div class="text-center py-3">Selecione uma turma para ver os alunos</div>';
        return;
    }
    
    safeGet('listaAlunosManual').innerHTML = 
        '<div class="text-center py-3"><div class="loading"></div><p>Carregando alunos...</p></div>';
    
    try {
        const response = await fetch(`/api/enfermaria/alunos-por-turma?turma=${encodeURIComponent(turma)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success && Array.isArray(data.alunos)) {
            alunosPorTurma = data.alunos;
            filtrarAlunosManual();
        } else {
            safeGet('listaAlunosManual').innerHTML = 
                '<div class="mostrarToast mostrarToast-warning">Nenhum aluno encontrado nesta turma</div>';
        }
    } catch (error) {
        console.error('Erro:', error);
        safeGet('listaAlunosManual').innerHTML = 
            '<div class="mostrarToast mostrarToast-danger">Erro ao carregar alunos</div>';
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
    
    // Adicionar listeners (mais seguro que onclick inline)
    container.querySelectorAll('.list-group-item').forEach(item => {
        item.addEventListener('click', () => {
            const id = item.getAttribute('data-aluno-id');
            const nome = item.getAttribute('data-aluno-nome');
            selecionarAluno(id, nome, item);
        });
    });
}

// ============================================
// CLICAR NO ALUNO PROCESSA DIRETO (SEM QR CODE)
// ============================================
async function selecionarAluno(alunoId, alunoNome, itemEl) {
    console.log(`🎯 Aluno selecionado: ${alunoNome} (${alunoId})`);
    
    // Feedback visual
    if (itemEl) {
        itemEl.style.background = '#d1fae5';
        itemEl.style.borderColor = '#10b981';
        itemEl.innerHTML = `
            <div>
                <strong>${escapeHTML(alunoNome)}</strong>
                <br>
                <small class="text-success">Processando...</small>
            </div>
            <i class="fas fa-spinner fa-spin fa-2x text-success"></i>
        `;
    }
    
    // Processar direto (como se tivesse escaneado o QR Code)
    await buscarAluno(alunoId);
}

// ============================================
// BUSCAR E EXIBIR ALUNO
// ============================================
async function buscarAluno(alunoId) {
    try {
        await pararScannerAutomatico();
        
        const response = await fetch(`/api/enfermaria/aluno/${alunoId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        
        if (data.success && data.aluno) {
            currentAluno = data.aluno;
            exibirAluno(data);
            
            if (data.emAtendimento && data.atendimentoAtivo) {
                currentAtendimento = data.atendimentoAtivo;
                mostrarFormSaida();
            } else {
                currentAtendimento = null;
                mostrarFormEntrada();
            }
        } else {
            mostrarToast(data.error || 'Aluno não encontrado');
            if (modoAtual === 'automatico') reiniciarScannerAutomatico();
            else carregarAlunosPorTurma();
        }
    } catch (error) {
        console.error('Erro:', error);
        mostrarToast('Erro ao buscar aluno');
        if (modoAtual === 'automatico') reiniciarScannerAutomatico();
        else carregarAlunosPorTurma();
    }
}

function exibirAluno(data) {
    const aluno = data.aluno;
    
    const fotoEl = safeGet('alunoFoto');
    if (fotoEl) {
        // Remove o onerror antes de definir
        fotoEl.onerror = null;
        
        // Se não tem foto, usa um SVG local (não depende de servidor externo)
        const fotoUrl = aluno.fotoPerfil || gerarAvatarSVG(aluno.nome);
        fotoEl.src = fotoUrl;
        
        // onerror com trava para não entrar em loop
        fotoEl.onerror = function() {
            this.onerror = null; // Remove o onerror imediatamente
            this.src = gerarAvatarSVG(aluno.nome);
        };
    }
    
    safeSetText('alunoNome', aluno.nome || '-');
    safeSetText('alunoMatricula', aluno.matricula || 'Não informada');
    safeSetText('alunoTurma', aluno.turma || 'Não informada');
    safeSetText('alunoCurso', aluno.curso || 'Não informado');
    
    const statusDiv = safeGet('statusAtendimento');
    if (statusDiv) {
        if (data.emAtendimento && data.atendimentoAtivo) {
            statusDiv.innerHTML = `
                <div class="mostrarToast mostrarToast-warning">
                    <i class="fas fa-clock"></i> Aluno em atendimento desde 
                    ${new Date(data.atendimentoAtivo.dataHoraEntrada).toLocaleString('pt-BR')}
                    <br><strong>Queixa:</strong> ${escapeHTML(data.atendimentoAtivo.queixa)}
                </div>
            `;
        } else {
            statusDiv.innerHTML = `
                <div class="mostrarToast mostrarToast-info">
                    <i class="fas fa-info-circle"></i> Aluno não está em atendimento no momento.
                </div>
            `;
        }
    }
    
    safeGet('alunoInfo').style.display = 'block';
    safeGet('alunoInfo').scrollIntoView({ behavior: 'smooth' });
}

// Gera um avatar SVG local (não depende de servidor externo)
function gerarAvatarSVG(nome) {
    const inicial = (nome || '?').charAt(0).toUpperCase();
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
            <defs>
                <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:#10b981;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#059669;stop-opacity:1" />
                </linearGradient>
            </defs>
            <circle cx="50" cy="50" r="50" fill="url(#grad)"/>
            <text x="50" y="50" font-family="Arial, sans-serif" font-size="45" font-weight="bold" 
                  fill="white" text-anchor="middle" dominant-baseline="central">${inicial}</text>
        </svg>
    `;
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
}

// ============================================
// FORMULÁRIOS
// ============================================
function mostrarFormEntrada() {
    safeGet('formEntrada').style.display = 'block';
    safeGet('formSaida').style.display = 'none';
    safeGet('queixa').value = '';
    safeGet('observacoesEntrada').value = '';
}

function mostrarFormSaida() {
    safeGet('formEntrada').style.display = 'none';
    safeGet('formSaida').style.display = 'block';
    safeGet('desfecho').value = '';
    safeGet('coordenadorPatioNome').value = '';
    safeGet('outrosTexto').value = '';
    safeGet('observacoesSaida').value = '';
    safeGet('campoCoordenador').style.display = 'none';
    safeGet('campoOutros').style.display = 'none';
}

function toggleOutrosCampos() {
    const desfecho = safeGet('desfecho').value;
    safeGet('campoCoordenador').style.display = desfecho === 'liberado_coordenador' ? 'block' : 'none';
    safeGet('campoOutros').style.display = desfecho === 'outros' ? 'block' : 'none';
}

// ============================================
// REGISTRAR ENTRADA
// ============================================
async function registrarEntrada() {
    const queixa = (safeGet('queixa')?.value || '').trim();
    if (!queixa) { mostrarToast('Por favor, descreva a queixa do aluno'); return; }
    
    if (!currentAluno || !currentAluno.id) { mostrarToast('Nenhum aluno selecionado'); return; }
    
    const btn = document.querySelector('#formEntrada .btn-primary-custom');
    if (btn) btn.disabled = true;
    
    try {
        const response = await fetch('/api/enfermaria/entrada', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
                alunoId: currentAluno.id,
                queixa,
                observacoes: safeGet('observacoesEntrada').value
            })
        });
        const data = await response.json();
        
        if (data.success) {
            mostrarToast(`✅ ${data.message}`);
            finalizarAposSucesso();
        } else {
            mostrarToast('❌ ' + data.error);
            if (modoAtual === 'automatico') reiniciarScannerAutomatico();
        }
    } catch (error) {
        console.error('Erro:', error);
        mostrarToast('Erro ao registrar');
        if (modoAtual === 'automatico') reiniciarScannerAutomatico();
    } finally {
        if (btn) btn.disabled = false;
    }
}

// ============================================
// REGISTRAR SAÍDA
// ============================================
async function registrarSaida() {
    const desfecho = safeGet('desfecho').value;
    if (!desfecho) { mostrarToast('Por favor, selecione o desfecho do atendimento'); return; }
    
    if (desfecho === 'outros' && !(safeGet('outrosTexto').value || '').trim()) {
        mostrarToast('Por favor, descreva o desfecho');
        return;
    }
    
    if (!currentAluno || !currentAluno.id) { mostrarToast('Nenhum aluno selecionado'); return; }
    
    const btn = document.querySelector('#formSaida .btn-primary-custom');
    if (btn) btn.disabled = true;
    
    try {
        const body = {
            alunoId: currentAluno.id,
            desfecho,
            desfechoOutrosTexto: safeGet('outrosTexto').value,
            coordenadorPatioNome: safeGet('coordenadorPatioNome').value,
            observacoes: safeGet('observacoesSaida').value
        };
        
        const response = await fetch('/api/enfermaria/saida', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(body)
        });
        const data = await response.json();
        
        if (data.success) {
            mostrarToast(`✅ ${data.message}`);
            finalizarAposSucesso();
        } else {
            mostrarToast('❌ ' + data.error);
            if (modoAtual === 'automatico') reiniciarScannerAutomatico();
        }
    } catch (error) {
        console.error('Erro:', error);
        mostrarToast('Erro ao registrar');
        if (modoAtual === 'automatico') reiniciarScannerAutomatico();
    } finally {
        if (btn) btn.disabled = false;
    }
}

function finalizarAposSucesso() {
    limparTela();
    
    if (modoAtual === 'automatico') {
        reiniciarScannerAutomatico();
    } else {
        // Recarregar a lista de alunos da turma
        carregarAlunosPorTurma();
    }
    
    carregarAtendimentosAtivos();
    carregarDashboard();
}

function limparTela() {
    safeGet('alunoInfo').style.display = 'none';
    safeGet('formEntrada').style.display = 'none';
    safeGet('formSaida').style.display = 'none';
    currentAluno = null;
    currentAtendimento = null;
}

function reiniciarScannerAutomatico() {
    setTimeout(() => {
        if (!scannerAutoAtivo && modoAtual === 'automatico') {
            iniciarScannerAutomatico();
        }
    }, 1000);
}

// ============================================
// ATENDIMENTOS ATIVOS
// ============================================
async function carregarAtendimentosAtivos() {
    const container = safeGet('listaAtendimentosAtivos');
    if (!container) return;
    
    try {
        const response = await fetch('/api/enfermaria/atendimentos-ativos', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success && Array.isArray(data.atendimentos) && data.atendimentos.length > 0) {
            container.innerHTML = data.atendimentos.map(a => `
                <div class="list-group-item">
                    <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
                        <div class="d-flex align-items-center gap-3">
                            <img src="${a.alunoFoto || gerarAvatarSVG(a.alunoNome || '?')}" 
                                 style="width:50px;height:50px;border-radius:50%;object-fit:cover;"
                                 onerror="this.onerror=null; this.src='${gerarAvatarSVG(a.alunoNome || '?')}'">
                            <div>
                                <strong>${escapeHTML(a.alunoNome || '')}</strong>
                                <br><small class="text-muted">Turma: ${escapeHTML(a.alunoTurma || '-')}</small>
                                <br><small class="text-muted">
                                    <i class="fas fa-clock"></i> Há ${a.tempoAtendimento || 0} minutos
                                </small>
                                <br>
                                <span class="badge bg-warning text-dark">Em atendimento</span>
                            </div>
                        </div>
                        <div class="d-flex flex-wrap gap-1 justify-content-end">
                            <button class="btn btn-sm btn-info" 
                                    onclick="verAtendimento('${a.id}')" 
                                    title="Ver detalhes">
                                <i class="fas fa-eye"></i> Ver
                            </button>
                            <button class="btn btn-sm btn-warning" 
                                    onclick="editarAtendimento('${a.id}')" 
                                    title="Editar queixa/observações">
                                <i class="fas fa-edit"></i> Editar
                            </button>
                            <button class="btn btn-sm btn-success" 
                                    onclick="finalizarAtendimentoAtivo('${a.alunoId}')" 
                                    title="Finalizar atendimento">
                                <i class="fas fa-check"></i> Finalizar
                            </button>
                            <button class="btn btn-sm btn-danger" 
                                    onclick="excluirAtendimento('${a.id}', '${escapeHTML(a.alunoNome || '')}')" 
                                    title="Excluir atendimento">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                    <div class="mt-2 p-2" style="background:#f8fafc;border-radius:8px;font-size:13px;">
                        <strong>Queixa:</strong> ${escapeHTML((a.queixa || '').substring(0, 200))}${(a.queixa || '').length > 200 ? '...' : ''}
                    </div>
                </div>
            `).join('');
        } else {
            container.innerHTML = `
                <div class="text-center text-muted py-5">
                    <i class="fas fa-check-circle fa-3x mb-3" style="color:#10b981;"></i>
                    <p>Nenhum atendimento ativo no momento</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Erro:', error);
        container.innerHTML = '<div class="mostrarToast mostrarToast-danger">Erro ao carregar atendimentos</div>';
    }
}

// ============================================
// 🆕 VER ATENDIMENTO (MODAL DE DETALHES)
// ============================================
async function verAtendimento(atendimentoId) {
    if (!atendimentoId) return;
    
    try {
        const response = await fetch(`/api/enfermaria/atendimento/${atendimentoId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (!data.success || !data.atendimento) {
            mostrarToast('Erro ao carregar atendimento');
            return;
        }
        
        const a = data.atendimento;
        
        // Montar HTML das informações de saída (se houver)
        let saidaHTML = '';
        if (a.saida) {
            saidaHTML = `
                <div class="section-title">🎯 Resultado / Saída</div>
                <div class="info-row">
                    <div class="info-label">Desfecho:</div>
                    <div class="info-value"><strong>${escapeHTML(a.saida.desfechoTexto || '')}</strong></div>
                </div>
                <div class="info-row">
                    <div class="info-label">Data da Saída:</div>
                    <div class="info-value">${escapeHTML(a.saida.dataHoraFormatada || '-')}</div>
                </div>
                <div class="info-row">
                    <div class="info-label">Registrado por:</div>
                    <div class="info-value">${escapeHTML(a.saida.registradoPorNome || '-')}</div>
                </div>
                ${a.saida.observacoes ? `
                    <div class="info-row">
                        <div class="info-label">Observações finais:</div>
                        <div class="info-value">${escapeHTML(a.saida.observacoes)}</div>
                    </div>
                ` : ''}
            `;
        }
        
        // Info sobre edição
        let editadoHTML = '';
        if (a.entrada.editadoEm) {
            editadoHTML = `
                <div class="mostrarToast mostrarToast-info mt-2" style="font-size: 12px;">
                    <i class="fas fa-info-circle"></i> 
                    <strong>Editado em:</strong> ${new Date(a.entrada.editadoEm).toLocaleString('pt-BR')} 
                    por <strong>${escapeHTML(a.entrada.editadoPorNome || 'Enfermeiro')}</strong>
                </div>
            `;
        }
        
        const oldModal = safeGet('modalVerAtendimento');
        if (oldModal) oldModal.remove();
        
        const modalHtml = `
            <div class="modal fade" id="modalVerAtendimento" tabindex="-1">
                <div class="modal-dialog modal-lg modal-dialog-scrollable">
                    <div class="modal-content">
                        <div class="modal-header" style="background: linear-gradient(135deg, #10b981, #059669); color: white;">
                            <h5 class="modal-title"><i class="fas fa-eye"></i> Detalhes do Atendimento</h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body detalhe-atendimento">
                            <div style="display: flex; align-items: center; gap: 12px; padding: 12px; background: #f0fdf4; border-radius: 10px; margin-bottom: 16px;">
                                <img src="${a.alunoFoto || gerarAvatarSVG(a.alunoNome)}" 
                                     style="width: 50px; height: 50px; border-radius: 50%;"
                                     onerror="this.onerror=null; this.src='${gerarAvatarSVG(a.alunoNome)}'">
                                <div style="flex: 1;">
                                    <h5 style="margin: 0; color: #065f46;">${escapeHTML(a.alunoNome)}</h5>
                                    <small style="color: #6b7280;">
                                        <i class="fas fa-id-card"></i> ${escapeHTML(a.alunoMatricula || '-')} • 
                                        <i class="fas fa-graduation-cap"></i> ${escapeHTML(a.alunoTurma || '-')}
                                    </small>
                                </div>
                                <span class="badge" style="background: ${a.status === 'finalizado' ? '#10b981' : '#f59e0b'}; font-size: 12px;">
                                    ${a.status === 'finalizado' ? '✅ Finalizado' : '⏳ Em Atendimento'}
                                </span>
                            </div>
                            
                            <div class="section-title">📌 Informações da Entrada</div>
                            <div class="info-row">
                                <div class="info-label">Data de Entrada:</div>
                                <div class="info-value">${escapeHTML(a.entrada.dataHoraFormatada || '-')}</div>
                            </div>
                            <div class="info-row">
                                <div class="info-label">Registrado por:</div>
                                <div class="info-value">${escapeHTML(a.entrada.registradoPorNome || '-')}</div>
                            </div>
                            
                            <div class="section-title">📝 Queixa</div>
                            <div style="background: #f9fafb; padding: 12px; border-radius: 8px; font-size: 14px; color: #374151; line-height: 1.5;">
                                ${escapeHTML(a.entrada.queixa || '-').replace(/\n/g, '<br>')}
                            </div>
                            
                            ${a.entrada.observacoes ? `
                                <div class="section-title">💬 Observações</div>
                                <div style="background: #f9fafb; padding: 12px; border-radius: 8px; font-size: 13px; color: #4b5563;">
                                    ${escapeHTML(a.entrada.observacoes).replace(/\n/g, '<br>')}
                                </div>
                            ` : ''}
                            
                            ${editadoHTML}
                            ${saidaHTML}
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                                <i class="fas fa-times"></i> Fechar
                            </button>
                            ${a.status === 'em_atendimento' ? `
                                <button type="button" class="btn btn-warning" onclick="fecharVerAtendimento(); editarAtendimento('${a.id}')">
                                    <i class="fas fa-edit"></i> Editar
                                </button>
                                <button type="button" class="btn btn-success" onclick="fecharVerAtendimento(); finalizarAtendimentoAtivo('${a.alunoId}')">
                                    <i class="fas fa-check"></i> Finalizar
                                </button>
                            ` : ''}
                            <button type="button" class="btn btn-danger" onclick="fecharVerAtendimento(); excluirAtendimento('${a.id}', '${escapeHTML(a.alunoNome)}')">
                                <i class="fas fa-trash"></i> Excluir
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = new bootstrap.Modal(safeGet('modalVerAtendimento'));
        modal.show();
        
    } catch (error) {
        console.error('Erro ao ver atendimento:', error);
        mostrarToast('Erro ao carregar detalhes do atendimento');
    }
}

function fecharVerAtendimento() {
    const modal = bootstrap.Modal.getInstance(safeGet('modalVerAtendimento'));
    if (modal) modal.hide();
    setTimeout(() => {
        const el = safeGet('modalVerAtendimento');
        if (el) el.remove();
    }, 300);
}

// ============================================
// 🆕 EDITAR ATENDIMENTO
// ============================================
async function editarAtendimento(atendimentoId) {
    if (!atendimentoId) return;
    
    try {
        // Buscar dados atuais
        const response = await fetch(`/api/enfermaria/atendimento/${atendimentoId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (!data.success || !data.atendimento) {
            mostrarToast('Erro ao carregar atendimento');
            return;
        }
        
        const a = data.atendimento;
        
        if (a.status === 'finalizado') {
            mostrarToast('⚠️ Não é possível editar atendimentos já finalizados');
            return;
        }
        
        const oldModal = safeGet('modalEditarAtendimento');
        if (oldModal) oldModal.remove();
        
        const modalHtml = `
            <div class="modal fade" id="modalEditarAtendimento" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header" style="background: linear-gradient(135deg, #f59e0b, #d97706); color: white;">
                            <h5 class="modal-title"><i class="fas fa-edit"></i> Editar Atendimento</h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <input type="hidden" id="editarAtendimentoId" value="${atendimentoId}">
                            
                            <div style="display: flex; align-items: center; gap: 12px; padding: 12px; background: #fffbeb; border-radius: 10px; margin-bottom: 16px;">
                                <img src="${a.alunoFoto || gerarAvatarSVG(a.alunoNome)}" 
                                     style="width: 50px; height: 50px; border-radius: 50%;"
                                     onerror="this.onerror=null; this.src='${gerarAvatarSVG(a.alunoNome)}'">
                                <div>
                                    <strong>${escapeHTML(a.alunoNome)}</strong><br>
                                    <small class="text-muted">${escapeHTML(a.alunoMatricula || '-')} • ${escapeHTML(a.alunoTurma || '-')}</small>
                                </div>
                            </div>
                            
                            <div class="mb-3">
                                <label class="form-label">Queixa / Motivo <span class="text-danger">*</span></label>
                                <textarea id="editarQueixa" class="form-control" rows="4" placeholder="Descreva o que o aluno está sentindo...">${escapeHTML(a.entrada.queixa || '')}</textarea>
                            </div>
                            
                            <div class="mb-3">
                                <label class="form-label">Observações</label>
                                <textarea id="editarObservacoes" class="form-control" rows="3" placeholder="Sinais vitais, medicamentos, etc...">${escapeHTML(a.entrada.observacoes || '')}</textarea>
                            </div>
                            
                            <div class="mostrarToast mostrarToast-info" style="font-size: 13px;">
                                <i class="fas fa-info-circle"></i>
                                As alterações serão registradas no histórico com seu nome e data/hora.
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                            <button type="button" class="btn btn-warning" onclick="salvarEdicaoAtendimento()">
                                <i class="fas fa-save"></i> Salvar Alterações
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = new bootstrap.Modal(safeGet('modalEditarAtendimento'));
        modal.show();
        
    } catch (error) {
        console.error('Erro ao editar atendimento:', error);
        mostrarToast('Erro ao carregar atendimento para edição');
    }
}

async function salvarEdicaoAtendimento() {
    const atendimentoId = safeGet('editarAtendimentoId')?.value;
    const queixa = safeGet('editarQueixa')?.value.trim();
    const observacoes = safeGet('editarObservacoes')?.value || '';
    
    if (!queixa) {
        mostrarToast('A queixa é obrigatória');
        return;
    }
    
    try {
        const response = await fetch(`/api/enfermaria/atendimento/${atendimentoId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ queixa, observacoes })
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarToast('✅ Atendimento atualizado com sucesso!');
            const modal = bootstrap.Modal.getInstance(safeGet('modalEditarAtendimento'));
            if (modal) modal.hide();
            setTimeout(() => safeGet('modalEditarAtendimento')?.remove(), 300);
            
            carregarAtendimentosAtivos();
        } else {
            mostrarToast('❌ ' + (data.error || 'Erro ao salvar'));
        }
    } catch (error) {
        console.error('Erro:', error);
        mostrarToast('Erro ao salvar alterações');
    }
}

// ============================================
// 🆕 EXCLUIR ATENDIMENTO
// ============================================
async function excluirAtendimento(atendimentoId, alunoNome) {
    if (!atendimentoId) return;
    
    if (!(await confirmar(`⚠️ Tem certeza que deseja EXCLUIR este atendimento?\n\nAluno: ${alunoNome}\n\nEsta ação NÃO pode ser desfeita!`))) {
        return;
    }
    
    if (!(await confirmar('⚠️ ÚLTIMA CONFIRMAÇÃO!\n\nTodos os dados serão perdidos permanentemente.\n\nDeseja continuar?'))) {
        return;
    }
    
    try {
        const response = await fetch(`/api/enfermaria/atendimento/${atendimentoId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarToast('✅ Atendimento excluído com sucesso!');
            
            // Remover linha com animação
            const row = document.querySelector(`[data-id="${atendimentoId}"]`);
            if (row) {
                row.style.transition = 'all 0.3s';
                row.style.opacity = '0';
                row.style.transform = 'translateX(-20px)';
                setTimeout(() => row.remove(), 300);
            }
            
            carregarAtendimentosAtivos();
            carregarDashboard();
        } else {
            mostrarToast('❌ ' + (data.error || 'Erro ao excluir'));
        }
    } catch (error) {
        console.error('Erro:', error);
        mostrarToast('Erro ao excluir atendimento');
    }
}

// ============================================
// 🆕 FINALIZAR ATENDIMENTO ATIVO (a partir do botão)
// ============================================
async function finalizarAtendimentoAtivo(alunoId) {
    if (!alunoId) return;
    
    // Buscar o aluno para pegar seus dados
    try {
        const response = await fetch(`/api/enfermaria/aluno/${alunoId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success && data.aluno) {
            currentAluno = data.aluno;
            // Fechar modal se estiver aberto
            const modalVer = bootstrap.Modal.getInstance(safeGet('modalVerAtendimento'));
            if (modalVer) modalVer.hide();
            
            // Ir para a aba de atendimento
            const tabAtendimento = safeGet('atendimento-tab');
            if (tabAtendimento) {
                new bootstrap.Tab(tabAtendimento).show();
            }
            
            // Exibir aluno e formulário de saída
            exibirAluno(data);
            mostrarFormSaida();
        } else {
            mostrarToast('Erro ao carregar dados do aluno');
        }
    } catch (error) {
        console.error('Erro:', error);
        mostrarToast('Erro ao carregar aluno');
    }
}

// ============================================
// MODAL DE CONFIRMAÇÃO CUSTOMIZADO
// ============================================
function confirmar(mensagem) {
    return new Promise((resolve) => {
        // Remove modal anterior se existir
        const oldModal = document.getElementById('modalConfirmacao');
        if (oldModal) oldModal.remove();
        
        const modalHtml = `
            <div class="modal fade" id="modalConfirmacao" tabindex="-1" data-bs-backdrop="static">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header" style="background: linear-gradient(135deg, #ef4444, #dc2626); color: white;">
                            <h5 class="modal-title"><i class="fas fa-exclamation-triangle"></i> Confirmação</h5>
                        </div>
                        <div class="modal-body" style="white-space: pre-line; font-size: 15px;">
                            ${escapeHTML(mensagem)}
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" id="btnCancelarConfirmacao">
                                <i class="fas fa-times"></i> Cancelar
                            </button>
                            <button type="button" class="btn btn-danger" id="btnConfirmarConfirmacao">
                                <i class="fas fa-check"></i> Confirmar
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        const modalEl = document.getElementById('modalConfirmacao');
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
        
        const finalizar = (resultado) => {
            modal.hide();
            setTimeout(() => modalEl.remove(), 300);
            resolve(resultado);
        };
        
        document.getElementById('btnConfirmarConfirmacao').addEventListener('click', () => finalizar(true));
        document.getElementById('btnCancelarConfirmacao').addEventListener('click', () => finalizar(false));
        
        // Fechar com ESC = cancelar
        modalEl.addEventListener('hidden.bs.modal', () => {
            if (!modalEl.dataset.resolvido) {
                resolve(false);
            }
        });
    });
}

// ============================================
// DASHBOARD
// ============================================
async function carregarDashboard() {
    try {
        const response = await fetch('/api/enfermaria/dashboard', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success) {
            safeSetText('totalHoje', data.metricas.hoje);
            safeSetText('totalSemana', data.metricas.semana);
            safeSetText('totalMes', data.metricas.mes);
            safeSetText('totalGeral', data.metricas.total);
            
            // Gráfico Atendimentos por Dia
            const ctxAtendimentos = safeGet('chartAtendimentos');
            if (ctxAtendimentos && data.tendencias?.ultimos7Dias) {
                if (dashboardCharts.atendimentos) try { dashboardCharts.atendimentos.destroy(); } catch(e){}
                dashboardCharts.atendimentos = new Chart(ctxAtendimentos.getContext('2d'), {
                    type: 'bar',
                    data: {
                        labels: data.tendencias.ultimos7Dias.map(d => d.dia),
                        datasets: [{
                            label: 'Atendimentos',
                            data: data.tendencias.ultimos7Dias.map(d => d.atendimentos),
                            backgroundColor: '#10b981',
                            borderRadius: 8
                        }]
                    },
                    options: { responsive: true, maintainAspectRatio: true }
                });
            }
            
            // Gráfico Desfechos
            const ctxDesfechos = safeGet('chartDesfechos');
            if (ctxDesfechos && data.desfechos) {
                if (dashboardCharts.desfechos) try { dashboardCharts.desfechos.destroy(); } catch(e){}
                dashboardCharts.desfechos = new Chart(ctxDesfechos.getContext('2d'), {
                    type: 'pie',
                    data: {
                        labels: data.desfechos.map(d => d.label),
                        datasets: [{
                            data: data.desfechos.map(d => d.count),
                            backgroundColor: ['#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#6b7280']
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
                            label: 'Atendimentos',
                            data: data.tendencias.porTurma.map(t => t.count),
                            backgroundColor: '#8b5cf6',
                            borderRadius: 8
                        }]
                    },
                    options: { responsive: true, maintainAspectRatio: true, indexAxis: 'y' }
                });
            }
            
            // Gráfico Horário
            const ctxHorario = safeGet('chartHorario');
            if (ctxHorario && data.tendencias?.distribuicaoHoraria) {
                if (dashboardCharts.horario) try { dashboardCharts.horario.destroy(); } catch(e){}
                const horas = Array.from({length: 24}, (_, i) => `${i}:00`);
                dashboardCharts.horario = new Chart(ctxHorario.getContext('2d'), {
                    type: 'line',
                    data: {
                        labels: horas,
                        datasets: [{
                            label: 'Atendimentos',
                            data: data.tendencias.distribuicaoHoraria,
                            borderColor: '#10b981',
                            backgroundColor: 'rgba(16, 185, 129, 0.1)',
                            fill: true,
                            tension: 0.4
                        }]
                    },
                    options: { responsive: true, maintainAspectRatio: true }
                });
            }
            
            // Queixas Comuns
            const queixasContainer = safeGet('queixasComuns');
            if (queixasContainer && data.tendencias?.queixasComuns) {
                if (data.tendencias.queixasComuns.length > 0) {
                    queixasContainer.innerHTML = `
                        <div class="list-group">
                            ${data.tendencias.queixasComuns.map(q => `
                                <div class="list-group-item d-flex justify-content-between align-items-center">
                                    <span><i class="fas fa-comment-medical text-primary me-2"></i> ${escapeHTML(q.queixa)}</span>
                                    <span class="badge bg-primary rounded-pill">${q.count} vezes</span>
                                </div>
                            `).join('')}
                        </div>
                    `;
                } else {
                    queixasContainer.innerHTML = '<div class="text-center text-muted py-3">Nenhuma queixa registrada</div>';
                }
            }
        }
    } catch (error) {
        console.error('Erro ao carregar dashboard:', error);
    }
}

// ============================================
// RELATÓRIOS
// ============================================
async function carregarTurmasParaRelatorio() {
    try {
        const response = await fetch('/api/enfermaria/relatorio/geral', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success && data.turmasDisponiveis) {
            const turmaSelect = safeGet('filtroTurma');
            if (turmaSelect) {
                turmaSelect.innerHTML = '<option value="">Selecione uma turma...</option>';
                data.turmasDisponiveis.forEach(turma => {
                    turmaSelect.innerHTML += `<option value="${escapeHTML(turma)}">${escapeHTML(turma)}</option>`;
                });
            }
        }
    } catch (error) {
        console.error('Erro ao carregar turmas:', error);
    }
}

function toggleRelatorioFiltros() {
    const tipo = safeGet('tipoRelatorio')?.value;
    safeGet('filtroTurmaDiv').style.display = tipo === 'turma' ? 'block' : 'none';
    safeGet('filtroAlunoDiv').style.display = tipo === 'aluno' ? 'block' : 'none';
    
    if (tipo === 'aluno') {
        carregarAlunosParaRelatorio();
    }
}

async function carregarAlunosParaRelatorio() {
    try {
        const response = await fetch('/api/coordenacao-patio/alunos', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success && data.alunos) {
            const alunoSelect = safeGet('filtroAluno');
            if (alunoSelect) {
                alunoSelect.innerHTML = '<option value="">Selecione um aluno...</option>';
                data.alunos.forEach(aluno => {
                    alunoSelect.innerHTML += `<option value="${aluno.id}">${escapeHTML(aluno.nome)} (${escapeHTML(aluno.turma || 'Sem turma')})</option>`;
                });
            }
        }
    } catch (error) {
        console.error('Erro:', error);
    }
}

async function carregarRelatorio() {
    const tipo = safeGet('tipoRelatorio')?.value;
    const dataInicio = safeGet('dataInicio')?.value || '';
    const dataFim = safeGet('dataFim')?.value || '';
    
    let url = '';
    
    if (tipo === 'geral') {
        url = `/api/enfermaria/relatorio/geral?`;
        if (dataInicio) url += `dataInicio=${dataInicio}&`;
        if (dataFim) url += `dataFim=${dataFim}&`;
    } else if (tipo === 'turma') {
        const turma = safeGet('filtroTurma')?.value;
        if (!turma) { mostrarToast('Selecione uma turma'); return; }
        url = `/api/enfermaria/relatorio/turma/${encodeURIComponent(turma)}?`;
        if (dataInicio) url += `dataInicio=${dataInicio}&`;
        if (dataFim) url += `dataFim=${dataFim}&`;
    } else if (tipo === 'aluno') {
        const alunoId = safeGet('filtroAluno')?.value;
        if (!alunoId) { mostrarToast('Selecione um aluno'); return; }
        url = `/api/enfermaria/relatorio/aluno/${alunoId}?`;
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
            mostrarToast('Erro ao carregar relatório');
        }
    } catch (error) {
        console.error('Erro:', error);
        mostrarToast('Erro ao carregar relatório');
    }
}

function exibirRelatorio(data, tipo) {
    const container = safeGet('resultadoRelatorio');
    if (!container) return;
    
    if (tipo === 'geral') {
        container.innerHTML = `
            <div class="card">
                <div class="card-body">
                    <h5>Relatório Geral</h5>
                    <p>Total de atendimentos: <strong>${data.totalAtendimentos || 0}</strong></p>
                    <hr>
                    <h6>Atendimentos por Turma</h6>
                    ${(data.porTurma || []).map(t => `
                        <div class="mb-3">
                            <strong>${escapeHTML(t.turma || '')}</strong>
                            <ul>
                                <li>Total: ${t.total || 0} atendimentos</li>
                                <li>Alunos atendidos: ${t.totalAlunos || 0}</li>
                            </ul>
                        </div>
                    `).join('')}
                    <hr>
                    <h6>Últimos Atendimentos</h6>
                    <div class="table-responsive">
                        <table class="table table-sm">
                            <thead><tr><th>Aluno</th><th>Turma</th><th>Data</th><th>Status</th></tr></thead>
                            <tbody>
                                ${(data.ultimosAtendimentos || []).map(a => `
                                    <tr>
                                        <td>${escapeHTML(a.alunoNome || '')}</td>
                                        <td>${escapeHTML(a.alunoTurma || '')}</td>
                                        <td>${new Date(a.dataEntrada).toLocaleString('pt-BR')}</td>
                                        <td>${a.status === 'em_atendimento' ? 'Em atendimento' : 'Finalizado'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    } else if (tipo === 'turma') {
        container.innerHTML = `
            <div class="card">
                <div class="card-body">
                    <h5>Relatório da Turma: ${escapeHTML(data.turma || '')}</h5>
                    <p>Total de atendimentos: <strong>${data.estatisticas?.totalAtendimentos || 0}</strong></p>
                    <p>Alunos atendidos: <strong>${data.estatisticas?.totalAlunosAtendidos || 0}</strong></p>
                    <hr>
                    <h6>Desfechos</h6>
                    <ul>
                        ${Object.entries(data.estatisticas?.desfechos || {}).map(([k, v]) => `<li>${escapeHTML(k)}: ${v}</li>`).join('')}
                    </ul>
                    <hr>
                    <h6>Atendimentos por Aluno</h6>
                    <div class="table-responsive">
                        <table class="table table-sm">
                            <thead><tr><th>Aluno</th><th>Total</th><th>Desfechos</th></tr></thead>
                            <tbody>
                                ${(data.porAluno || []).map(a => `
                                    <tr>
                                        <td>${escapeHTML(a.alunoNome || '')}</td>
                                        <td>${a.total || 0}</td>
                                        <td>${Object.entries(a.desfechos || {}).map(([k, v]) => `${escapeHTML(k)}: ${v}`).join(', ')}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    } else if (tipo === 'aluno') {
        container.innerHTML = `
            <div class="card">
                <div class="card-body">
                    <h5>Relatório do Aluno: ${escapeHTML(data.aluno?.nome || '')}</h5>
                    <p>Matrícula: ${escapeHTML(data.aluno?.matricula || 'N/A')} | Turma: ${escapeHTML(data.aluno?.turma || 'N/A')}</p>
                    <p>Total de atendimentos: <strong>${data.estatisticas?.totalAtendimentos || 0}</strong></p>
                    <hr>
                    <h6>Histórico de Atendimentos</h6>
                    <div class="table-responsive">
                        <table class="table table-sm">
                            <thead><tr><th>Data</th><th>Queixa</th><th>Desfecho</th></tr></thead>
                            <tbody>
                                ${(data.atendimentos || []).map(a => `
                                    <tr>
                                        <td>${new Date(a.dataEntrada).toLocaleString('pt-BR')}</td>
                                        <td>${escapeHTML((a.queixa || '').substring(0, 100))}${(a.queixa || '').length > 100 ? '...' : ''}</td>
                                        <td>${escapeHTML(a.desfechoTexto || '')}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }
}

function exportarCSV() {
    if (!relatorioData) { mostrarToast('Nenhum relatório carregado'); return; }
    
    let csvContent = "Data,Aluno,Turma,Queixa,Desfecho\n";
    
    if (relatorioData.atendimentos) {
        relatorioData.atendimentos.forEach(a => {
            csvContent += `${new Date(a.dataEntrada).toLocaleString('pt-BR')},"${relatorioData.aluno?.nome || a.alunoNome || ''}","${relatorioData.aluno?.turma || a.alunoTurma || ''}","${(a.queixa || '').replace(/"/g, '""')}","${(a.desfechoTexto || '').replace(/"/g, '""')}"\n`;
        });
    } else if (relatorioData.ultimosAtendimentos) {
        relatorioData.ultimosAtendimentos.forEach(a => {
            csvContent += `${new Date(a.dataEntrada).toLocaleString('pt-BR')},"${a.alunoNome}","${a.alunoTurma}","${(a.queixa || '').replace(/"/g, '""')}",${a.status}\n`;
        });
    }
    
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `relatorio_enfermaria_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
}

async function exportarPDF() {
    if (!relatorioData) { mostrarToast('Nenhum relatório carregado'); return; }
    mostrarToast('Função de PDF será implementada em breve');
}

// ============================================
// 🔔 SISTEMA DE NOTIFICAÇÕES
// ============================================

let notificacoesAbertas = false;

/**
 * Abre/fecha o dropdown de notificações
 */
function abrirNotificacoes() {
    const dropdown = safeGet('notificacoesDropdown');
    if (!dropdown) return;
    
    if (dropdown.style.display === 'block') {
        fecharNotificacoes();
    } else {
        dropdown.style.display = 'block';
        notificacoesAbertas = true;
        carregarNotificacoes(); // Carrega ao abrir
    }
}

/**
 * Fecha o dropdown
 */
function fecharNotificacoes() {
    const dropdown = safeGet('notificacoesDropdown');
    if (dropdown) {
        dropdown.style.display = 'none';
        notificacoesAbertas = false;
    }
}

/**
 * Carrega notificações do backend
 */
async function carregarNotificacoes() {
    try {
        // Buscar contador de não lidas
        const countRes = await fetch('/api/notificacoes/nao-lidas/contador', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (countRes.ok) {
            const countData = await countRes.json();
            atualizarBadgeNotificacoes(countData.count || 0);
        }
        
        // Buscar lista de notificações
        const res = await fetch('/api/notificacoes?limite=20', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await res.json();
        
        if (data.success) {
            renderizarNotificacoes(data.notificacoes || []);
        }
    } catch (error) {
        console.error('Erro ao carregar notificações:', error);
    }
}

/**
 * Atualiza o badge com o número de não lidas
 */
function atualizarBadgeNotificacoes(total) {
    const badge = safeGet('notificacoesBadge');
    const btn = safeGet('notificacoesBtn');
    
    if (badge) {
        if (total > 0) {
            badge.textContent = total > 99 ? '99+' : total;
            badge.style.display = 'block';
            if (btn) btn.classList.add('tem-notificacao');
        } else {
            badge.style.display = 'none';
            if (btn) btn.classList.remove('tem-notificacao');
        }
    }
}

// ============================================
// TOAST CUSTOMIZADO (substitui mostrarToast)
// ============================================
function mostrarToast(mensagem, tipo = 'info', duracao = 3000) {
    // Remove toast anterior
    const anterior = document.getElementById('toastCustom');
    if (anterior) anterior.remove();
    
    const cores = {
        success: { bg: '#10b981', icone: 'fa-check-circle' },
        error:   { bg: '#ef4444', icone: 'fa-exclamation-circle' },
        warning: { bg: '#f59e0b', icone: 'fa-exclamation-triangle' },
        info:    { bg: '#3b82f6', icone: 'fa-info-circle' }
    };
    
    const cor = cores[tipo] || cores.info;
    
    const toast = document.createElement('div');
    toast.id = 'toastCustom';
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%) translateY(-100px);
        background: ${cor.bg};
        color: white;
        padding: 14px 22px;
        border-radius: 10px;
        box-shadow: 0 6px 24px rgba(0,0,0,0.2);
        z-index: 99999;
        display: flex;
        align-items: center;
        gap: 10px;
        font-family: -apple-system, sans-serif;
        font-size: 14px;
        font-weight: 500;
        max-width: 90%;
        transition: transform 0.3s ease;
    `;
    
    toast.innerHTML = `
        <i class="fas ${cor.icone}" style="font-size: 18px;"></i>
        <span>${escapeHTML(mensagem)}</span>
    `;
    
    document.body.appendChild(toast);
    
    // Animação de entrada
    setTimeout(() => {
        toast.style.transform = 'translateX(-50%) translateY(0)';
    }, 50);
    
    // Remover após X segundos
    setTimeout(() => {
        toast.style.transform = 'translateX(-50%) translateY(-100px)';
        setTimeout(() => toast.remove(), 300);
    }, duracao);
}

window.mostrarToast = mostrarToast;

/**
 * Renderiza a lista de notificações no dropdown
 */
function renderizarNotificacoes(lista) {
    const container = safeGet('notificacoesLista');
    if (!container) return;
    
    if (!lista || lista.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #6c757d;">
                <i class="fas fa-bell-slash" style="font-size: 2rem; margin-bottom: 10px; opacity: 0.5;"></i>
                <p style="margin: 0;">Nenhuma notificação</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = lista.map(n => {
        const data = new Date(n.createdAt);
        const agora = new Date();
        const diffMin = Math.floor((agora - data) / 60000);
        
        let tempoTexto = 'agora';
        if (diffMin >= 1 && diffMin < 60) tempoTexto = `há ${diffMin} min`;
        else if (diffMin >= 60 && diffMin < 1440) tempoTexto = `há ${Math.floor(diffMin / 60)} h`;
        else if (diffMin >= 1440) tempoTexto = `há ${Math.floor(diffMin / 1440)} d`;
        
        const naoLida = !n.lida ? 'background: #f0fdf4; border-left: 3px solid #10b981;' : '';
        
        return `
            <div style="
                padding: 12px 16px;
                border-bottom: 1px solid #f3f4f6;
                display: flex;
                gap: 12px;
                align-items: flex-start;
                cursor: pointer;
                transition: background 0.15s;
                ${naoLida}
            " onclick="marcarNotificacaoLida('${n._id}')">
                <div style="
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    background: ${n.cor || '#10b981'};
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 16px;
                    flex-shrink: 0;
                ">
                    <i class="fas ${n.icone || 'fa-bell'}"></i>
                </div>
                <div style="flex: 1; min-width: 0;">
                    <div style="font-weight: 700; font-size: 14px; color: #1f2937; margin-bottom: 3px;">
                        ${escapeHTML(n.titulo || 'Notificação')}
                    </div>
                    <div style="font-size: 13px; color: #4b5563; line-height: 1.4; margin-bottom: 5px;">
                        ${escapeHTML(n.mensagem || '')}
                    </div>
                    <div style="font-size: 11px; color: #9ca3af;">
                        <i class="far fa-clock"></i> ${tempoTexto}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Marca uma notificação como lida
 */
async function marcarNotificacaoLida(id) {
    try {
        await fetch(`/api/notificacoes/${id}/lida`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        carregarNotificacoes();
    } catch (error) {
        console.error('Erro ao marcar como lida:', error);
    }
}

/**
 * Marca todas as notificações como lidas
 */
async function marcarTodasLidas() {
    try {
        await fetch('/api/notificacoes/marcar-todas-lidas', {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        carregarNotificacoes();
    } catch (error) {
        console.error('Erro ao marcar todas como lidas:', error);
    }
}

/**
 * Limpa todas as notificações do usuário
 */
async function limparMinhasNotificacoes(event) {
    if (event) event.stopPropagation();
    
    if (!confirm('🗑️ Deseja excluir TODAS as suas notificações?\n\nEsta ação não pode ser desfeita.')) {
        return;
    }
    
    try {
        const res = await fetch('/api/notificacoes/limpar-minhas', {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await res.json();
        
        if (data.success) {
            fecharNotificacoes();
            atualizarBadgeNotificacoes(0);
            mostrarToast('✅ Notificações excluídas!');
        } else {
            mostrarToast('❌ ' + (data.error || 'Erro ao limpar'));
        }
    } catch (error) {
        console.error('Erro:', error);
        mostrarToast('❌ Erro ao limpar notificações');
    }
}

// ===== FECHAR AO CLICAR FORA =====
document.addEventListener('click', (e) => {
    const dropdown = safeGet('notificacoesDropdown');
    const btn = safeGet('notificacoesBtn');
    
    if (dropdown && btn && 
        !dropdown.contains(e.target) && 
        !btn.contains(e.target) &&
        notificacoesAbertas) {
        fecharNotificacoes();
    }
});

// ===== CARREGAR AO INICIAR + A CADA 30s =====
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => carregarNotificacoes(), 1500);
    setInterval(carregarNotificacoes, 30000);
});

async function logout() {
    const confirmar = await confirm('Tem certeza que deseja sair do sistema?');
    if (confirmar) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_data');
        window.location.href = '/login.html';
    }
}
// ============================================
// EXPORTAR FUNÇÕES GLOBAIS
// ============================================
window.toggleOutrosCampos = toggleOutrosCampos;
window.registrarEntrada = registrarEntrada;
window.registrarSaida = registrarSaida;
window.carregarRelatorio = carregarRelatorio;
window.exportarCSV = exportarCSV;
window.exportarPDF = exportarPDF;
window.toggleRelatorioFiltros = toggleRelatorioFiltros;
window.verAtendimento = verAtendimento;
window.fecharVerAtendimento = fecharVerAtendimento;
window.editarAtendimento = editarAtendimento;
window.salvarEdicaoAtendimento = salvarEdicaoAtendimento;
window.excluirAtendimento = excluirAtendimento;
window.finalizarAtendimentoAtivo = finalizarAtendimentoAtivo;
window.logout = logout;
// ============================================
// EXPORTAR FUNÇÕES GLOBAIS
// ============================================
window.abrirNotificacoes = abrirNotificacoes;
window.fecharNotificacoes = fecharNotificacoes;
window.marcarNotificacaoLida = marcarNotificacaoLida;
window.marcarTodasLidas = marcarTodasLidas;
window.limparMinhasNotificacoes = limparMinhasNotificacoes;