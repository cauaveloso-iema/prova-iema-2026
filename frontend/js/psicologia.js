// ============================================
// PSICOLOGIA - SISTEMA DE ATENDIMENTOS
// Modo Automático (QR) + Modo Manual (Clique direto no aluno)
// Tema: Verde-Água / Teal
// Com Autocomplete de Aluno para Relatórios
// ============================================

let token = localStorage.getItem('auth_token');
let currentAluno = null;
let currentAtendimento = null;
let relatorioData = null;
let dashboardCharts = {};
let tipoTarefaSelecionado = null;

// Scanner Auto
let scannerAuto = null;
let scannerAutoAtivo = false;

// Estado
let modoAtual = 'automatico';
let turmasDisponiveis = [];
let alunosPorTurma = [];

// Autocomplete de aluno
let __alunosParaRelatorio = [];
let __alunosFiltrados = [];
let __indiceSelecionado = -1;
let __alunosCarregados = false;

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

// 🔥 AVATAR SVG LOCAL (verde-água)
function gerarAvatarSVG(nome) {
    const inicial = (nome || '?').charAt(0).toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#14b8a6"/><stop offset="100%" stop-color="#0d9488"/></linearGradient></defs><circle cx="50" cy="50" r="50" fill="url(#g)"/><text x="50" y="50" font-family="Arial,sans-serif" font-size="45" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="central">${inicial}</text></svg>`;
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
}

// ============================================
// INICIALIZAÇÃO
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    if (!token) { window.location.href = '/login.html'; return; }
    
    const userData = JSON.parse(localStorage.getItem('user_data') || '{}');
    const allowedRoles = ['psicologia', 'super_admin', 'admin'];
    
    if (!allowedRoles.includes(userData.role)) {
        alert('Acesso negado.');
        window.location.href = '/login.html';
        return;
    }
    
    safeSetText('userName', userData.nome || 'Usuário');
    safeSetText('dataAtual', new Date().toLocaleDateString('pt-BR'));
    
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
    
    await iniciarScannerAutomatico();
    
    setInterval(() => {
        if (safeGet('ativos')?.classList.contains('active')) {
            carregarAtendimentosAtivos();
        }
        if (safeGet('dashboard')?.classList.contains('active')) {
            carregarDashboard();
        }
    }, 30000);
    
    // Listener do tab Dashboard
    safeGet('dashboard-tab')?.addEventListener('shown.bs.tab', () => {
        carregarDashboard();
    });
    
    // Listener do tab Relatórios
    safeGet('relatorios-tab')?.addEventListener('shown.bs.tab', () => {
        console.log('📋 Tab Relatórios aberto');
        carregarTurmasParaRelatorio();
    });
    
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
    console.log('QR Code (Automático):', decodedText);
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
        const response = await fetch('/api/psicologia/turmas', {
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
        const response = await fetch(`/api/psicologia/alunos-por-turma?turma=${encodeURIComponent(turma)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success && Array.isArray(data.alunos)) {
            alunosPorTurma = data.alunos;
            filtrarAlunosManual();
        } else {
            safeGet('listaAlunosManual').innerHTML = 
                '<div class="alert alert-warning">Nenhum aluno encontrado nesta turma</div>';
        }
    } catch (error) {
        console.error('Erro:', error);
        safeGet('listaAlunosManual').innerHTML = 
            '<div class="alert alert-danger">Erro ao carregar alunos</div>';
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

// ============================================
// CLICAR NO ALUNO PROCESSA DIRETO (SEM QR CODE)
// ============================================
async function selecionarAluno(alunoId, alunoNome, itemEl) {
    console.log(`🎯 Aluno selecionado: ${alunoNome} (${alunoId})`);
    
    if (itemEl) {
        itemEl.style.background = '#ccfbf1';
        itemEl.style.borderColor = '#14b8a6';
        itemEl.style.pointerEvents = 'none';
        itemEl.innerHTML = `
            <div>
                <strong>${escapeHTML(alunoNome)}</strong>
                <br>
                <small style="color: #0d9488;">Processando...</small>
            </div>
            <i class="fas fa-spinner fa-spin fa-2x" style="color: #0d9488;"></i>
        `;
    }
    
    try {
        await buscarAluno(alunoId);
    } catch (error) {
        console.error('Erro ao processar aluno:', error);
    }
}

// ============================================
// BUSCAR E EXIBIR ALUNO (com timeout)
// ============================================
async function buscarAluno(alunoId) {
    try {
        await pararScannerAutomatico();
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch(`/api/psicologia/aluno/${alunoId}`, {
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
            alert('Tempo esgotado ao buscar aluno. Tente novamente.');
        } else {
            alert('Erro ao buscar aluno');
        }
        
        if (modoAtual === 'automatico') {
            reiniciarScannerAutomatico();
        } else {
            carregarAlunosPorTurma();
        }
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
    
    const statusDiv = safeGet('statusAtendimento');
    if (statusDiv) {
        if (data.atendimentosAtivos && Array.isArray(data.atendimentosAtivos) && data.atendimentosAtivos.length > 0) {
            statusDiv.innerHTML = `
                <div class="alert alert-warning">
                    <i class="fas fa-clock"></i> 
                    <strong>${data.atendimentosAtivos.length} atendimento(s) em andamento</strong>
                    ${data.atendimentosAtivos.map(a => `
                        <div class="mt-2 p-2" style="background: white; border-radius: 8px;">
                            <strong>${escapeHTML(a.tipoTarefaLabel || '')}</strong>: 
                            ${escapeHTML((a.descricao || '').substring(0, 100))}
                            <br><small class="text-muted">
                                <i class="fas fa-clock"></i> 
                                ${a.dataHoraEntrada ? new Date(a.dataHoraEntrada).toLocaleString('pt-BR') : ''}
                            </small>
                        </div>
                    `).join('')}
                </div>
            `;
        } else {
            statusDiv.innerHTML = `
                <div class="alert alert-info">
                    <i class="fas fa-info-circle"></i> Nenhum atendimento em andamento
                </div>
            `;
        }
    }
    
    const histDiv = safeGet('historicoRecente');
    if (histDiv) {
        if (data.historicoRecente && Array.isArray(data.historicoRecente) && data.historicoRecente.length > 0) {
            histDiv.innerHTML = `
                <h6 class="text-muted mt-3 mb-2">
                    <i class="fas fa-history"></i> Histórico Recente
                </h6>
                ${data.historicoRecente.map(h => `
                    <div class="p-2 mb-2" style="background: #f8fafc; border-radius: 8px; font-size: 13px;">
                        <strong>${escapeHTML(h.tipoTarefaLabel || '')}</strong>: 
                        ${escapeHTML((h.descricao || '').substring(0, 80))}
                        <br><small class="text-muted">
                            ${h.dataHora ? new Date(h.dataHora).toLocaleDateString('pt-BR') : ''}
                            ${h.resultado ? `• ${escapeHTML(h.resultado)}` : ''}
                        </small>
                    </div>
                `).join('')}
            `;
        } else {
            histDiv.innerHTML = '';
        }
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
    
    // Campos comuns a todos
    const camposComuns = `
        <div class="mb-3">
            <label class="form-label">Contexto Familiar</label>
            <textarea id="detalheContextoFamiliar" class="form-control" rows="2" placeholder="Informações sobre o contexto familiar..."></textarea>
        </div>
        <div class="mb-3">
            <label class="form-label">Histórico Anterior</label>
            <textarea id="detalheHistoricoAnterior" class="form-control" rows="2" placeholder="Histórico de situações anteriores..."></textarea>
        </div>
    `;
    
    switch (tipo) {
        case 'escuta_acolhimento':
            html = `
                <div class="row">
                    <div class="col-md-6 mb-3">
                        <label class="form-label">Tipo de Escuta</label>
                        <select id="detalheTipoEscuta" class="form-select">
                            <option value="">Selecione...</option>
                            <option value="Individual">Individual</option>
                            <option value="Em Grupo">Em Grupo</option>
                            <option value="Com Responsável">Com Responsável</option>
                            <option value="Com Professor">Com Professor</option>
                        </select>
                    </div>
                    <div class="col-md-6 mb-3">
                        <label class="form-label">Duração (minutos)</label>
                        <input type="number" id="detalheDuracaoEscuta" class="form-control" min="1">
                    </div>
                </div>
                ${camposComuns}
            `;
            break;
            
        case 'manejo_crises_emocionais':
            html = `
                <div class="mb-3">
                    <label class="form-label">Tipo de Crise</label>
                    <select id="detalheTipoCrise" class="form-select">
                        <option value="">Selecione...</option>
                        <option value="Ansiedade">Ansiedade</option>
                        <option value="Pânico">Pânico</option>
                        <option value="Depressão">Depressão</option>
                        <option value="Agressividade">Agressividade</option>
                        <option value="Automutilação">Automutilação</option>
                        <option value="Ideação Suicida">Ideação Suicida</option>
                        <option value="Outro">Outro</option>
                    </select>
                </div>
                <div class="mb-3">
                    <label class="form-label">Ações Tomadas</label>
                    <textarea id="detalheAcoesTomadas" class="form-control" rows="2" placeholder="O que foi feito durante o manejo..."></textarea>
                </div>
                <div class="mb-3">
                    <label class="form-label">Encaminhamento Emergencial</label>
                    <input type="text" id="detalheEncaminhamentoEmergencial" class="form-control" placeholder="Ex: SAMU, Bombeiros, Família">
                </div>
                ${camposComuns}
            `;
            break;
            
        case 'atividades_grupos':
            html = `
                <div class="row">
                    <div class="col-md-6 mb-3">
                        <label class="form-label">Nome da Atividade</label>
                        <input type="text" id="detalheNomeAtividade" class="form-control" placeholder="Ex: Roda de Conversa">
                    </div>
                    <div class="col-md-6 mb-3">
                        <label class="form-label">Local</label>
                        <input type="text" id="detalheLocalAtividade" class="form-control" placeholder="Ex: Sala 3, Pátio">
                    </div>
                </div>
                <div class="row">
                    <div class="col-md-6 mb-3">
                        <label class="form-label">Participantes (separados por vírgula)</label>
                        <input type="text" id="detalheParticipantesAtividade" class="form-control" placeholder="Ex: João, Maria, Pedro">
                    </div>
                    <div class="col-md-6 mb-3">
                        <label class="form-label">Duração (minutos)</label>
                        <input type="number" id="detalheDuracaoAtividade" class="form-control" min="1">
                    </div>
                </div>
                ${camposComuns}
            `;
            break;
            
        case 'acoes_atividades_saude':
            html = `
                <div class="row">
                    <div class="col-md-6 mb-3">
                        <label class="form-label">Tema da Ação</label>
                        <input type="text" id="detalheTemaAcao" class="form-control" placeholder="Ex: Saúde Mental, Alimentação">
                    </div>
                    <div class="col-md-6 mb-3">
                        <label class="form-label">Local</label>
                        <input type="text" id="detalheLocalAcao" class="form-control" placeholder="Ex: Pátio, Auditório">
                    </div>
                </div>
                <div class="mb-3">
                    <label class="form-label">Público Alvo</label>
                    <input type="text" id="detalhePublicoAlvo" class="form-control" placeholder="Ex: Todos os alunos, Turma X, Professores">
                </div>
                ${camposComuns}
            `;
            break;
            
        case 'acoes_socioemocionais_culturais':
            html = `
                <div class="row">
                    <div class="col-md-6 mb-3">
                        <label class="form-label">Tema Socioemocional</label>
                        <input type="text" id="detalheTemaSocioemocional" class="form-control" placeholder="Ex: Empatia, Respeito">
                    </div>
                    <div class="col-md-6 mb-3">
                        <label class="form-label">Tipo de Atividade Cultural</label>
                        <input type="text" id="detalheTipoAtividadeCultural" class="form-control" placeholder="Ex: Teatro, Música, Dança">
                    </div>
                </div>
                <div class="mb-3">
                    <label class="form-label">Parcerias</label>
                    <input type="text" id="detalheParceria" class="form-control" placeholder="Ex: Secretaria de Cultura, ONG">
                </div>
                ${camposComuns}
            `;
            break;
            
        case 'outros':
            html = `
                <div class="mb-3">
                    <label class="form-label">Especifique o Tipo de Tarefa <span class="text-danger">*</span></label>
                    <input type="text" id="detalheTipoTarefaOutros" class="form-control" 
                           placeholder="Descreva o tipo de tarefa...">
                </div>
                ${camposComuns}
            `;
            break;
    }
    
    // Campos finais comuns
    html += `
        <div class="mb-3">
            <label class="form-label">Providências Tomadas</label>
            <textarea id="detalheProvidencias" class="form-control" rows="2" placeholder="O que já foi feito..."></textarea>
        </div>
        <div class="mb-3">
            <label class="form-label">Próximos Passos</label>
            <textarea id="detalheProximosPassos" class="form-control" rows="2" placeholder="O que será feito..."></textarea>
        </div>
    `;
    
    container.innerHTML = html;
}

function coletarDetalhes() {
    const detalhes = {};
    
    // Participantes (Atividades em Grupos)
    const participantesAtivEl = safeGet('detalheParticipantesAtividade');
    if (participantesAtivEl) {
        detalhes.participantesAtividade = participantesAtivEl.value
            .split(',')
            .map(t => t.trim())
            .filter(t => t.length > 0);
    }
    
    // Campos de texto simples
    const camposTexto = {
        'detalheContextoFamiliar': 'contextoFamiliar',
        'detalheHistoricoAnterior': 'historicoAnterior',
        'detalheTipoEscuta': 'tipoEscuta',
        'detalheTipoCrise': 'tipoCrise',
        'detalheAcoesTomadas': 'acoesTomadas',
        'detalheEncaminhamentoEmergencial': 'encaminhamentoEmergencial',
        'detalheNomeAtividade': 'nomeAtividade',
        'detalheLocalAtividade': 'localAtividade',
        'detalheTemaAcao': 'temaAcao',
        'detalhePublicoAlvo': 'publicoAlvo',
        'detalheLocalAcao': 'localAcao',
        'detalheTemaSocioemocional': 'temaSocioemocional',
        'detalheTipoAtividadeCultural': 'tipoAtividadeCultural',
        'detalheParceria': 'parceria',
        'detalheTipoTarefaOutros': 'tipoTarefaOutros',
        'detalheProvidencias': 'providenciasTomadas',
        'detalheProximosPassos': 'proximosPassos'
    };
    
    Object.entries(camposTexto).forEach(([elementId, key]) => {
        const el = safeGet(elementId);
        if (el && el.value) detalhes[key] = el.value.trim();
    });
    
    // Campos numéricos
    const duracaoEscutaEl = safeGet('detalheDuracaoEscuta');
    if (duracaoEscutaEl && duracaoEscutaEl.value) {
        const d = parseInt(duracaoEscutaEl.value);
        if (!isNaN(d) && d > 0) detalhes.duracaoEscuta = d;
    }
    
    const duracaoAtividadeEl = safeGet('detalheDuracaoAtividade');
    if (duracaoAtividadeEl && duracaoAtividadeEl.value) {
        const d = parseInt(duracaoAtividadeEl.value);
        if (!isNaN(d) && d > 0) detalhes.duracaoAtividade = d;
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
        const response = await fetch('/api/psicologia/registrar', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                alunoId: currentAluno.id,
                tipoTarefa: tipoTarefaSelecionado,
                descricao,
                observacoes: safeGet('observacoes')?.value || '',
                gravidade: safeGet('gravidade')?.value || 'media',
                prioridade: safeGet('prioridade')?.value || 'normal',
                detalhes: coletarDetalhes()
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert(`✅ ${data.message}`);
            finalizarAposSucesso();
        } else {
            alert('❌ ' + (data.error || 'Erro ao registrar'));
        }
    } catch (error) {
        console.error('Erro:', error);
        alert('Erro ao registrar: ' + error.message);
    } finally {
        if (btn) btn.disabled = false;
    }
}

function finalizarAposSucesso() {
    limparTela();
    
    if (modoAtual === 'automatico') {
        reiniciarScannerAutomatico();
    } else {
        carregarAlunosPorTurma();
    }
    
    carregarAtendimentosAtivos();
    carregarDashboard();
}

function limparTela() {
    safeGet('alunoInfo').style.display = 'none';
    safeGet('formRegistro').style.display = 'none';
    currentAluno = null;
    currentAtendimento = null;
    tipoTarefaSelecionado = null;
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
        const response = await fetch('/api/psicologia/atendimentos-ativos', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success && Array.isArray(data.atendimentos) && data.atendimentos.length > 0) {
            container.innerHTML = data.atendimentos.map(a => `
                <div class="list-group-item">
                    <div class="d-flex justify-content-between align-items-start">
                        <div class="d-flex align-items-center gap-3">
                            <img src="${a.alunoFoto || gerarAvatarSVG(a.alunoNome || '?')}" 
                                 style="width:50px;height:50px;border-radius:50%;object-fit:cover;"
                                 onerror="this.onerror=null; this.src='${gerarAvatarSVG(a.alunoNome || '?')}'">
                            <div>
                                <strong>${escapeHTML(a.alunoNome || '')}</strong>
                                <br><small class="text-muted">Turma: ${escapeHTML(a.alunoTurma || '-')}</small>
                                <br>
                                <span class="badge bg-primary">${escapeHTML(a.tipoTarefaLabel || '')}</span>
                                <span class="badge badge-gravidade gravidade-${a.gravidade || 'media'}">
                                    ${escapeHTML(a.gravidade || 'media')}
                                </span>
                            </div>
                        </div>
                        <div class="text-end">
                            <small class="text-muted d-block">
                                <i class="fas fa-clock"></i> Há ${a.tempoAtendimento || 0} min
                            </small>
                            <button class="btn btn-sm btn-primary mt-2" onclick="abrirFinalizacao('${a.id}')">
                                <i class="fas fa-check"></i> Finalizar
                            </button>
                        </div>
                    </div>
                    <div class="mt-2 p-2" style="background:#f8fafc;border-radius:8px;font-size:13px;">
                        ${escapeHTML((a.descricao || '').substring(0, 150))}${(a.descricao || '').length > 150 ? '...' : ''}
                    </div>
                </div>
            `).join('');
        } else {
            container.innerHTML = `
                <div class="text-center text-muted py-5">
                    <i class="fas fa-check-circle fa-3x mb-3" style="color:#10b981;"></i>
                    <p>Nenhum atendimento em andamento</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Erro:', error);
        container.innerHTML = `<div class="alert alert-danger"><i class="fas fa-exclamation-triangle"></i> Erro ao carregar</div>`;
    }
}

function abrirFinalizacao(atendimentoId) {
    if (!atendimentoId) return;
    
    const resultado = prompt(
        'Informe o resultado do atendimento:\n\n' +
        '1 - Resolvido\n' +
        '2 - Em Acompanhamento\n' +
        '3 - Reincidente\n' +
        '4 - Encaminhado\n' +
        '5 - Pendente\n\n' +
        'Digite o número:'
    );
    
    if (!resultado) return;
    
    const map = { '1': 'resolvido', '2': 'em_acompanhamento', '3': 'reincidente', '4': 'encaminhado', '5': 'pendente' };
    
    if (map[resultado.trim()]) {
        finalizarAtendimento(atendimentoId, map[resultado.trim()]);
    } else {
        alert('Opção inválida');
    }
}

async function finalizarAtendimento(atendimentoId, resultado) {
    try {
        const response = await fetch('/api/psicologia/finalizar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ atendimentoId, resultado, observacoesFinais: '' })
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert(`✅ ${data.message}`);
            carregarAtendimentosAtivos();
            carregarDashboard();
        } else {
            alert('❌ ' + (data.error || 'Erro ao finalizar'));
        }
    } catch (error) {
        console.error('Erro:', error);
        alert('Erro ao finalizar');
    }
}

// ============================================
// DASHBOARD
// ============================================
async function carregarDashboard() {
    try {
        const response = await fetch('/api/psicologia/dashboard', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (!data.success) return;
        
        safeSetText('totalHoje', data.metricas?.hoje || 0);
        safeSetText('totalEmAndamento', data.metricas?.emAndamento || 0);
        safeSetText('totalFinalizadosHoje', data.metricas?.finalizadosHoje || 0);
        safeSetText('totalGeral', data.metricas?.total || 0);
        
        // Gráfico Tipos
        const ctxTipos = safeGet('chartTipos');
        if (ctxTipos && data.porTipo) {
            if (dashboardCharts.tipos) try { dashboardCharts.tipos.destroy(); } catch(e){}
            dashboardCharts.tipos = new Chart(ctxTipos.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: data.porTipo.map(t => t.label || ''),
                    datasets: [{
                        label: 'Ocorrências',
                        data: data.porTipo.map(t => t.count || 0),
                        backgroundColor: ['#14b8a6', '#0d9488', '#0f766e', '#115e59', '#2dd4bf', '#5eead4'],
                        borderRadius: 8
                    }]
                },
                options: { responsive: true, maintainAspectRatio: true, indexAxis: 'y', plugins: { legend: { display: false } } }
            });
        }
        
        // Gráfico Gravidade
        const ctxGravidade = safeGet('chartGravidade');
        if (ctxGravidade && data.porGravidade) {
            if (dashboardCharts.gravidade) try { dashboardCharts.gravidade.destroy(); } catch(e){}
            const labels = { baixa: 'Baixa', media: 'Média', alta: 'Alta', critica: 'Crítica' };
            const colors = { baixa: '#10b981', media: '#f59e0b', alta: '#ef4444', critica: '#7f1d1d' };
            dashboardCharts.gravidade = new Chart(ctxGravidade.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: data.porGravidade.map(g => labels[g.gravidade] || g.gravidade || ''),
                    datasets: [{
                        data: data.porGravidade.map(g => g.count || 0),
                        backgroundColor: data.porGravidade.map(g => colors[g.gravidade] || '#6b7280')
                    }]
                },
                options: { responsive: true, maintainAspectRatio: true }
            });
        }
        
        // Gráfico por Dia
        const ctxAtendimentos = safeGet('chartAtendimentos');
        if (ctxAtendimentos && data.tendencias?.ultimos7Dias) {
            if (dashboardCharts.atendimentos) try { dashboardCharts.atendimentos.destroy(); } catch(e){}
            dashboardCharts.atendimentos = new Chart(ctxAtendimentos.getContext('2d'), {
                type: 'line',
                data: {
                    labels: data.tendencias.ultimos7Dias.map(d => d.dia || ''),
                    datasets: [{
                        label: 'Ocorrências',
                        data: data.tendencias.ultimos7Dias.map(d => d.atendimentos || 0),
                        borderColor: '#14b8a6',
                        backgroundColor: 'rgba(20, 184, 166, 0.1)',
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
                    labels: data.tendencias.porTurma.map(t => t.turma || 'Sem turma'),
                    datasets: [{
                        label: 'Ocorrências',
                        data: data.tendencias.porTurma.map(t => t.count || 0),
                        backgroundColor: '#5eead4',
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
                            <thead><tr><th>Aluno</th><th>Turma</th><th>Ocorrências</th></tr></thead>
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
        const response = await fetch('/api/psicologia/turmas', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) return;
        const data = await response.json();
        
        const select = safeGet('filtroTurma');
        if (!select) return;
        
        if (data.success && Array.isArray(data.turmas)) {
            const valorAtual = select.value;
            select.innerHTML = '<option value="">Selecione...</option>';
            
            data.turmas.forEach(t => {
                const option = document.createElement('option');
                option.value = t;
                option.textContent = t;
                select.appendChild(option);
            });
            
            if (valorAtual && data.turmas.includes(valorAtual)) {
                select.value = valorAtual;
            }
            
            console.log(`✅ ${data.turmas.length} turmas carregadas no select de relatório`);
        }
    } catch (error) {
        console.error('Erro ao carregar turmas:', error);
    }
}

function toggleRelatorioFiltros() {
    const tipo = safeGet('tipoRelatorio')?.value;
    
    const filtroTurmaDiv = safeGet('filtroTurmaDiv');
    const filtroAlunoDiv = safeGet('filtroAlunoDiv');
    
    if (filtroTurmaDiv) filtroTurmaDiv.style.display = tipo === 'turma' ? 'block' : 'none';
    if (filtroAlunoDiv) filtroAlunoDiv.style.display = tipo === 'aluno' ? 'block' : 'none';
    
    // Se for "por turma", garante que as turmas estão carregadas
    if (tipo === 'turma') {
        const selectTurma = safeGet('filtroTurma');
        if (selectTurma && selectTurma.options.length <= 1) {
            console.log('📋 Carregando turmas sob demanda...');
            carregarTurmasParaRelatorio();
        }
    }
    
    // Se for "por aluno", inicializa autocomplete e carrega alunos
    if (tipo === 'aluno') {
        inicializarAutocompleteAluno();
        
        // Foca no input para o usuário já começar a digitar
        setTimeout(() => {
            safeGet('buscaAlunoRelatorio')?.focus();
        }, 100);
        
        // Carrega alunos se ainda não carregou
        if (!__alunosCarregados) {
            console.log('📋 Carregando alunos para autocomplete...');
            carregarAlunosParaRelatorio();
        }
    }
}

// ============================================
// AUTOCOMPLETE DE ALUNO
// ============================================
function inicializarAutocompleteAluno() {
    const input = safeGet('buscaAlunoRelatorio');
    const listEl = safeGet('autocompleteAlunoList');
    const hiddenInput = safeGet('filtroAluno');
    
    if (!input || !listEl || !hiddenInput) return;
    if (input.dataset.autocompleteInit === 'true') return;
    
    input.dataset.autocompleteInit = 'true';
    
    // Digitar → filtra
    input.addEventListener('input', (e) => {
        const termo = e.target.value.trim();
        
        hiddenInput.value = '';
        const infoEl = safeGet('alunoSelecionadoInfo');
        if (infoEl) infoEl.textContent = '';
        
        if (termo.length < 1) {
            listEl.style.display = 'none';
            return;
        }
        
        filtrarAlunosAutocomplete(termo);
    });
    
    // Foco → mostra sugestões
    input.addEventListener('focus', () => {
        const termo = input.value.trim();
        if (termo.length >= 1) {
            filtrarAlunosAutocomplete(termo);
        }
    });
    
    // Navegação por teclado
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
    
    // Clique fora → fecha
    document.addEventListener('click', (e) => {
        const listEl = safeGet('autocompleteAlunoList');
        const input = safeGet('buscaAlunoRelatorio');
        
        if (!listEl || !input) return;
        if (listEl.style.display === 'none') return;
        
        // Se clicou dentro da lista ou no input, não fecha
        if (listEl.contains(e.target) || input.contains(e.target)) {
            return;
        }
        
        listEl.style.display = 'none';
    });
}

async function carregarAlunosParaRelatorio() {
    if (__alunosCarregados && __alunosParaRelatorio.length > 0) {
        console.log(`✅ ${__alunosParaRelatorio.length} alunos já carregados`);
        return;
    }
    
    const inputBusca = safeGet('buscaAlunoRelatorio');
    if (inputBusca) {
        inputBusca.placeholder = 'Carregando alunos...';
        inputBusca.disabled = true;
    }
    
    try {
        const turmasRes = await fetch('/api/psicologia/turmas', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const turmasData = await turmasRes.json();
        
        if (!turmasData.success || !Array.isArray(turmasData.turmas)) {
            if (inputBusca) {
                inputBusca.placeholder = 'Nenhum aluno encontrado';
                inputBusca.disabled = false;
            }
            return;
        }
        
        const todosAlunos = [];
        
        for (const turma of turmasData.turmas) {
            try {
                const res = await fetch(`/api/psicologia/alunos-por-turma?turma=${encodeURIComponent(turma)}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const data = await res.json();
                
                if (data.success && Array.isArray(data.alunos)) {
                    data.alunos.forEach(aluno => {
                        todosAlunos.push({
                            id: aluno.id,
                            nome: aluno.nome,
                            matricula: aluno.matricula || '',
                            turma: aluno.turma || turma,
                            curso: aluno.curso || ''
                        });
                    });
                }
            } catch (e) {
                console.warn(`Erro ao buscar alunos da turma ${turma}:`, e);
            }
        }
        
        todosAlunos.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
        
        __alunosParaRelatorio = todosAlunos;
        __alunosCarregados = true;
        
        console.log(`✅ ${todosAlunos.length} alunos carregados para autocomplete`);
        
        if (inputBusca) {
            inputBusca.placeholder = 'Digite o nome do aluno...';
            inputBusca.disabled = false;
        }
        
    } catch (error) {
        console.error('Erro ao carregar alunos:', error);
        if (inputBusca) {
            inputBusca.placeholder = 'Erro ao carregar alunos';
            inputBusca.disabled = false;
        }
    }
}

function filtrarAlunosAutocomplete(termo) {
    const listEl = safeGet('autocompleteAlunoList');
    if (!listEl) return;
    
    if (!__alunosCarregados) {
        listEl.innerHTML = `<div class="autocomplete-aluno-loading">Carregando alunos...</div>`;
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
    
    // 🔥 SEM onclick inline — só data-index
    listEl.innerHTML = __alunosFiltrados.map((aluno, index) => {
        const nomeDestacado = destacarTermo(aluno.nome, termo);
        const matricula = aluno.matricula ? `<span class="aluno-matricula">${escapeHTML(aluno.matricula)}</span>` : '';
        
        return `
            <div class="autocomplete-aluno-item" 
                 data-index="${index}">
                <div class="aluno-nome">${nomeDestacado}</div>
                <div class="aluno-info">
                    <span class="aluno-turma">${escapeHTML(aluno.turma || 'Sem turma')}</span>
                    ${matricula}
                </div>
            </div>
        `;
    }).join('');
    
    // 🔥 ADICIONA OS LISTENERS DE CLIQUE
    listEl.querySelectorAll('.autocomplete-aluno-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const index = parseInt(item.getAttribute('data-index'));
            const aluno = __alunosFiltrados[index];
            
            if (aluno) {
                selecionarAlunoAutocomplete(aluno);
            }
        });
        
        // Feedback visual no hover
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
    
    const items = listEl.querySelectorAll('.autocomplete-aluno-item');
    items.forEach((item, i) => {
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
        infoEl.style.color = '#0d9488';
    }
    
    console.log('✅ Aluno selecionado:', aluno);
}

async function carregarRelatorio() {
    const tipo = safeGet('tipoRelatorio')?.value;
    const dataInicio = safeGet('dataInicio')?.value || '';
    const dataFim = safeGet('dataFim')?.value || '';
    
    let url = '';
    
    try {
        if (tipo === 'geral') {
            url = `/api/psicologia/relatorio/geral?`;
            if (dataInicio) url += `dataInicio=${dataInicio}&`;
            if (dataFim) url += `dataFim=${dataFim}&`;
        } else if (tipo === 'turma') {
            const turma = safeGet('filtroTurma')?.value;
            if (!turma) { alert('Selecione uma turma'); return; }
            url = `/api/psicologia/relatorio/turma/${encodeURIComponent(turma)}?`;
            if (dataInicio) url += `dataInicio=${dataInicio}&`;
            if (dataFim) url += `dataFim=${dataFim}&`;
        } else if (tipo === 'aluno') {
            const alunoId = safeGet('filtroAluno')?.value;
            if (!alunoId) { 
                alert('Selecione um aluno na lista'); 
                return; 
            }
            url = `/api/psicologia/relatorio/aluno/${alunoId}?`;
            if (dataInicio) url += `dataInicio=${dataInicio}&`;
            if (dataFim) url += `dataFim=${dataFim}&`;
        }
        
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success) {
            relatorioData = data;
            exibirRelatorio(data, tipo);
        } else {
            alert('Erro ao carregar relatório: ' + (data.error || ''));
        }
    } catch (error) {
        console.error('Erro:', error);
        alert('Erro ao carregar relatório');
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
                <div class="card">
                    <div class="card-body">
                        <h5><i class="fas fa-chart-bar"></i> Relatório Geral</h5>
                        <p>Total: <strong>${data.totalAtendimentos || 0}</strong></p>
                        <h6 class="mt-4">Por Tipo</h6>
                        <div class="row">
                            ${porTipo.map(t => `
                                <div class="col-md-4 mb-2">
                                    <div class="p-2" style="background:#ccfbf1;border-radius:8px;">
                                        <strong>${escapeHTML(t.label || '')}</strong>: ${t.count || 0}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                        <h6 class="mt-4">Por Turma</h6>
                        <div class="table-responsive">
                            <table class="table table-sm">
                                <thead><tr><th>Turma</th><th>Total</th><th>Alunos</th></tr></thead>
                                <tbody>
                                    ${porTurma.map(t => `
                                        <tr>
                                            <td>${escapeHTML(t.turma || '-')}</td>
                                            <td>${t.total || 0}</td>
                                            <td>${t.totalAlunos || 0}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                        <h6 class="mt-4">Últimos</h6>
                        <div class="table-responsive">
                            <table class="table table-sm">
                                <thead><tr><th>Aluno</th><th>Tipo</th><th>Data</th><th>Status</th></tr></thead>
                                <tbody>
                                    ${atendimentos.slice(0, 20).map(a => `
                                        <tr>
                                            <td>${escapeHTML(a.alunoNome || '')}</td>
                                            <td>${escapeHTML(a.tipoTarefaLabel || '')}</td>
                                            <td>${a.dataEntrada ? new Date(a.dataEntrada).toLocaleString('pt-BR') : '-'}</td>
                                            <td>${a.status === 'em_andamento' ? 'Em andamento' : 'Finalizado'}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
        } else if (tipo === 'turma') {
            const porTipo = Array.isArray(data.estatisticas?.porTipo) ? data.estatisticas.porTipo : [];
            const porAluno = Array.isArray(data.porAluno) ? data.porAluno : [];
            
            container.innerHTML = `
                <div class="card">
                    <div class="card-body">
                        <h5>Relatório da Turma: ${escapeHTML(data.turma || '')}</h5>
                        <p>Total: <strong>${data.estatisticas?.totalAtendimentos || 0}</strong></p>
                        <h6 class="mt-4">Por Tipo</h6>
                        <div class="row">
                            ${porTipo.map(t => `
                                <div class="col-md-4 mb-2">
                                    <div class="p-2" style="background:#ccfbf1;border-radius:8px;">
                                        <strong>${escapeHTML(t.label || '')}</strong>: ${t.count || 0}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                        <h6 class="mt-4">Por Aluno</h6>
                        <div class="table-responsive">
                            <table class="table table-sm">
                                <thead><tr><th>Aluno</th><th>Total</th><th>Tipos</th></tr></thead>
                                <tbody>
                                    ${porAluno.map(a => `
                                        <tr>
                                            <td>${escapeHTML(a.alunoNome || '')}</td>
                                            <td><span class="badge bg-primary">${a.total || 0}</span></td>
                                            <td>${Object.entries(a.tipos || {}).map(([t, c]) => 
                                                `${escapeHTML(TIPO_LABELS[t] || t)}: ${c}`).join(', ')}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
        } else if (tipo === 'aluno') {
            const porTipo = Array.isArray(data.estatisticas?.porTipo) ? data.estatisticas.porTipo : [];
            const porGravidade = data.estatisticas?.porGravidade || {};
            const atendimentos = Array.isArray(data.atendimentos) ? data.atendimentos : [];
            
            container.innerHTML = `
                <div class="card">
                    <div class="card-body">
                        <h5>Relatório: ${escapeHTML(data.aluno?.nome || '')}</h5>
                        <p>Matrícula: ${escapeHTML(data.aluno?.matricula || 'N/A')} | Turma: ${escapeHTML(data.aluno?.turma || 'N/A')}</p>
                        <p>Total: <strong>${data.estatisticas?.totalAtendimentos || 0}</strong></p>
                        <div class="row mt-3">
                            <div class="col-md-6">
                                <h6>Por Tipo</h6>
                                ${porTipo.map(t => `
                                    <div class="d-flex justify-content-between mb-1">
                                        <span>${escapeHTML(t.label || '')}</span>
                                        <span class="badge bg-primary">${t.count || 0}</span>
                                    </div>
                                `).join('')}
                            </div>
                            <div class="col-md-6">
                                <h6>Por Gravidade</h6>
                                ${Object.entries(porGravidade).map(([g, c]) => `
                                    <div class="d-flex justify-content-between mb-1">
                                        <span>${escapeHTML(g)}</span>
                                        <span class="badge bg-secondary">${c}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        <h6 class="mt-4">Histórico</h6>
                        <div class="table-responsive">
                            <table class="table table-sm">
                                <thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Status</th></tr></thead>
                                <tbody>
                                    ${atendimentos.map(a => `
                                        <tr>
                                            <td>${a.dataEntrada ? new Date(a.dataEntrada).toLocaleString('pt-BR') : '-'}</td>
                                            <td>${escapeHTML(a.tipoTarefaLabel || '')}</td>
                                            <td>${escapeHTML((a.descricao || '').substring(0, 100))}</td>
                                            <td>${a.status === 'em_andamento' ? 'Em andamento' : escapeHTML(a.resultado || 'Finalizado')}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
        }
    } catch (error) {
        console.error('Erro ao exibir relatório:', error);
        container.innerHTML = `<div class="alert alert-danger">Erro ao exibir relatório.</div>`;
    }
}

function exportarCSV() {
    if (!relatorioData) { alert('Nenhum relatório carregado'); return; }
    
    const dados = Array.isArray(relatorioData.atendimentos) ? relatorioData.atendimentos : [];
    if (dados.length === 0) { alert('Nenhum dado para exportar'); return; }
    
    let csv = "Data,Aluno,Turma,Tipo,Descrição,Gravidade,Status,Resultado\n";
    
    dados.forEach(a => {
        const linha = [
            a.dataEntrada ? new Date(a.dataEntrada).toLocaleString('pt-BR') : '',
            `"${(a.alunoNome || relatorioData.aluno?.nome || '').replace(/"/g, '""')}"`,
            `"${(a.alunoTurma || relatorioData.aluno?.turma || relatorioData.turma || '').replace(/"/g, '""')}"`,
            `"${(a.tipoTarefaLabel || TIPO_LABELS[a.tipoTarefa] || '').replace(/"/g, '""')}"`,
            `"${(a.descricao || '').replace(/"/g, '""')}"`,
            a.gravidade || '',
            a.status === 'em_andamento' ? 'Em andamento' : 'Finalizado',
            `"${(a.resultado || a.saida?.resultado || '').replace(/"/g, '""')}"`
        ];
        csv += linha.join(',') + '\n';
    });
    
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `psicologia_${new Date().toISOString().split('T')[0]}.csv`;
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

// ============================================
// EXPORTAR FUNÇÕES GLOBAIS
// ============================================
window.selecionarTipo = selecionarTipo;
window.registrarOcorrencia = registrarOcorrencia;
window.limparTela = limparTela;
window.abrirFinalizacao = abrirFinalizacao;
window.toggleRelatorioFiltros = toggleRelatorioFiltros;
window.carregarRelatorio = carregarRelatorio;
window.exportarCSV = exportarCSV;
window.logout = logout;
window.selecionarAlunoAutocomplete = selecionarAlunoAutocomplete;

