// ============================================
// PROTAGONISMO - PAINEL ADMINISTRATIVO
// ============================================

let token = localStorage.getItem('auth_token');
let userData = {};
let clubesData = [];
let tutoresData = [];
let candidatosData = [];
let cursosList = [];
let turmasList = [];
let vinculosCursoTurma = {};

let clubeEditandoId = null;
let tutorEditandoId = null;
let modalClube = null;
let modalTutor = null;
let modalCandidato = null;
let chartTopClubes = null;

// ============================================
// 🛡️ PROTEÇÃO CONTRA alert() NATIVO (Kodular)
// Sobrescreve window.alert para usar toast customizado
// ============================================
(function protegerContraAlertNativo() {
    const alertOriginal = window.alert;
    
    window.alert = function(mensagem) {
        // Detecta WebView do Kodular (ou qualquer Android WebView)
        const isWebView = /wv|WebView|Android.*Version\/[\d.]+.*Chrome/i.test(navigator.userAgent) ||
                          (typeof window.AppInventor !== 'undefined');
        
        // No desktop, mantém comportamento nativo (ou troque por mostrarToast se preferir)
        if (!isWebView) {
            // Para ver no console sem travar:
            console.log('%c[ALERT] ' + mensagem, 'background:#f59e0b;color:white;padding:4px 8px;border-radius:4px;');
            return;
        }
        
        // No WebView: usa modal customizado (não trava)
        try {
            const modal = document.createElement('div');
            modal.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.6); display: flex; align-items: center;
                justify-content: center; z-index: 999999; padding: 20px;
                box-sizing: border-box;
            `;
            modal.innerHTML = `
                <div style="background:white;border-radius:16px;padding:25px;max-width:380px;
                            width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.3);text-align:center;">
                    <div style="font-size:48px;margin-bottom:15px;">ℹ️</div>
                    <p style="margin:0 0 20px;color:#374151;font-size:15px;
                              line-height:1.5;white-space:pre-line;">${String(mensagem)}</p>
                    <button onclick="this.closest('div').parentElement.remove()"
                            style="width:100%;padding:12px;background:#f97316;color:white;
                                   border:none;border-radius:10px;font-size:14px;
                                   font-weight:600;cursor:pointer;">OK</button>
                </div>
            `;
            document.body.appendChild(modal);
        } catch (e) {
            console.log('[ALERT-FALLBACK]', mensagem);
        }
    };
    
    console.log('🛡️ [Proteção] window.alert foi sobrescrito para não travar no Kodular');
})();

// ============================================
// INICIALIZAÇÃO
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    if (!token) { window.location.href = '/login.html'; return; }
    
    userData = JSON.parse(localStorage.getItem('user_data') || '{}');
    const allowedRoles = ['protagonismo', 'super_admin', 'admin'];
    
    if (!allowedRoles.includes(userData.role)) {
        mostrarToast('Acesso negado.');
        window.location.href = '/login.html';
        return;
    }
    
    document.getElementById('userName').textContent = userData.nome || 'Protagonismo';
    document.getElementById('dataAtual').textContent = new Date().toLocaleDateString('pt-BR');
    
    // Link público
    const linkPublico = window.location.origin + '/protagonismo-publico.html';
    document.getElementById('linkPublicoInput').value = linkPublico;
    
    // Inicializar modais
    modalClube = new bootstrap.Modal(document.getElementById('modalClube'));
    modalTutor = new bootstrap.Modal(document.getElementById('modalTutor'));
    modalCandidato = new bootstrap.Modal(document.getElementById('modalCandidato'));
    
    // Carregar dados iniciais
    await carregarFotoPerfil();
    await carregarCursosTurmas();
    await carregarEstatisticas();
    await carregarConfiguracao();
    await carregarClubes();
    await carregarTutores();
    await carregarCandidatos();
    
    // Listeners das abas
    document.getElementById('aba-clubes').addEventListener('shown.bs.tab', () => carregarClubes());
    document.getElementById('aba-inscricoes').addEventListener('shown.bs.tab', () => carregarInscricoes());
    document.getElementById('aba-tutoria').addEventListener('shown.bs.tab', () => carregarTutores());
    document.getElementById('aba-candidatos').addEventListener('shown.bs.tab', () => carregarCandidatos());
    document.getElementById('aba-eleicao').addEventListener('shown.bs.tab', () => carregarResultadosEleicao());
    
    // Preencher selects de filtros
    preencherSelectsAuxiliares();
});

// ============================================
// HELPERS
// ============================================
function safeGet(id) { return document.getElementById(id); }
function safeSetText(id, value) { const el = safeGet(id); if (el) el.textContent = value; }

function escapeHTML(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function gerarAvatarSVG(nome) {
    const inicial = (nome || '?').charAt(0).toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#f97316"/><stop offset="100%" stop-color="#ea580c"/></linearGradient></defs><circle cx="50" cy="50" r="50" fill="url(#g)"/><text x="50" y="50" font-family="Arial,sans-serif" font-size="45" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="central">${inicial}</text></svg>`;
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
}

// ============================================
// FOTO DE PERFIL
// ============================================
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
// CURSOS E TURMAS
// ============================================
async function carregarCursosTurmas() {
    try {
        const response = await fetch('/api/protagonismo/cursos', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success) {
            cursosList = data.cursos;
        }
        
        const response2 = await fetch('/api/protagonismo/turmas', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data2 = await response2.json();
        
        if (data2.success) {
            turmasList = data2.turmas;
        }
    } catch (error) {
        console.error('Erro ao carregar cursos/turmas:', error);
    }
}

function preencherSelectsAuxiliares() {
    // Selects de curso
    const tutorCursoSelect = safeGet('tutorCurso');
    if (tutorCursoSelect) {
        tutorCursoSelect.innerHTML = '<option value="">Selecione o curso...</option>';
        cursosList.forEach(c => {
            tutorCursoSelect.innerHTML += `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`;
        });
    }
    
    // Selects de turma
    const selects = [
        'tutorTurma', 
        'candidatoTurma', 
        'filtroTurmaTutores', 
        'filtroTurmaCandidatos',
        'filtroTurmaInscricoes'
    ];
    
    selects.forEach(id => {
        const select = safeGet(id);
        if (select) {
            const isFilter = id.startsWith('filtro');
            select.innerHTML = `<option value="">${isFilter ? 'Todas as turmas' : 'Selecione a turma...'}</option>`;
            turmasList.forEach(t => {
                select.innerHTML += `<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`;
            });
        }
    });
}

// ============================================
// ESTATÍSTICAS (DASHBOARD)
// ============================================
async function carregarEstatisticas() {
    try {
        const response = await fetch('/api/protagonismo/estatisticas', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success) {
            const e = data.estatisticas;
            safeSetText('totalClubes', e.totalClubes || 0);
            safeSetText('totalInscricoes', e.totalInscricoes || 0);
            safeSetText('totalTutores', e.totalTutores || 0);
            safeSetText('totalCandidatos', e.totalCandidatos || 0);
            
            // Status
            atualizarBadgeStatus('statusInscricoes', e.inscricoesAbertas);
            atualizarBadgeStatus('statusEleicao', e.eleicaoAberta);
            atualizarBadgeStatus('statusTutoria', e.tutoriaVisivel !== false);
            
            // Gráfico Top Clubes
            renderizarGraficoTopClubes(data.topClubes || []);
        }
    } catch (error) {
        console.error('Erro ao carregar estatísticas:', error);
    }
}

function atualizarBadgeStatus(id, ativo) {
    const el = safeGet(id);
    if (!el) return;
    
    if (ativo) {
        el.textContent = 'Ativo';
        el.className = 'status-badge active';
    } else {
        el.textContent = 'Inativo';
        el.className = 'status-badge inactive';
    }
}

function renderizarGraficoTopClubes(topClubes) {
    const ctx = safeGet('chartTopClubes');
    if (!ctx) return;
    
    if (chartTopClubes) {
        try { chartTopClubes.destroy(); } catch(e) {}
    }
    
    const labels = topClubes.map(c => c.clubeNome || 'Sem nome');
    const values = topClubes.map(c => c.total || 0);
    
    chartTopClubes = new Chart(ctx.getContext('2d'), {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Inscrições',
                data: values,
                backgroundColor: [
                    '#f97316', '#ea580c', '#fb923c', '#fdba74', '#fed7aa'
                ],
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
        }
    });
}

// ============================================
// CONFIGURAÇÃO
// ============================================
async function carregarConfiguracao() {
    try {
        const response = await fetch('/api/protagonismo/configuracao', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success) {
            const c = data.configuracao;
            safeGet('configInscricoes').checked = c.inscricoesClubesAbertas || false;
            safeGet('configEleicao').checked = c.eleicaoLiderAberta || false;
            safeGet('configTutoria').checked = c.tutoriaVisivel || false;
            safeGet('configAviso').value = c.avisoPublico || '';
        }
    } catch (error) {
        console.error('Erro ao carregar configuração:', error);
    }
}

async function atualizarConfiguracao() {
    try {
        const dados = {
            inscricoesClubesAbertas: safeGet('configInscricoes').checked,
            eleicaoLiderAberta: safeGet('configEleicao').checked,
            tutoriaVisivel: safeGet('configTutoria').checked,
            avisoPublico: safeGet('configAviso').value
        };
        
        const response = await fetch('/api/protagonismo/configuracao', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(dados)
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Feedback visual
            mostrarToast('Configuração atualizada!', 'success');
            atualizarBadgeStatus('statusInscricoes', dados.inscricoesClubesAbertas);
            atualizarBadgeStatus('statusEleicao', dados.eleicaoLiderAberta);
            atualizarBadgeStatus('statusTutoria', dados.tutoriaVisivel);
        } else {
            mostrarToast('Erro: ' + data.error, 'error');
        }
    } catch (error) {
        console.error('Erro:', error);
        mostrarToast('Erro ao atualizar', 'error');
    }
}

// ============================================
// CLUBES
// ============================================
async function carregarClubes() {
    const container = safeGet('listaClubes');
    if (!container) return;
    
    container.innerHTML = '<div class="text-center py-5"><div class="loading-spinner"></div><p>Carregando...</p></div>';
    
    try {
        const response = await fetch('/api/protagonismo/clubes', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success) {
            clubesData = data.clubes;
            renderizarClubes(data.clubes);
            preencherFiltroClubes(data.clubes);
        } else {
            container.innerHTML = '<div class="text-center py-5 text-danger">Erro ao carregar clubes</div>';
        }
    } catch (error) {
        console.error('Erro:', error);
        container.innerHTML = '<div class="text-center py-5 text-danger">Erro ao carregar clubes</div>';
    }
}

function renderizarClubes(clubes) {
    const container = safeGet('listaClubes');
    if (!container) return;
    
    if (!clubes || clubes.length === 0) {
        container.innerHTML = `
            <div class="text-center py-5" style="grid-column: 1 / -1;">
                <i class="fas fa-users fa-3x mb-3" style="color: #fed7aa;"></i>
                <p class="text-muted">Nenhum clube cadastrado ainda.</p>
                <button class="btn btn-primary" onclick="abrirModalClube()">
                    <i class="fas fa-plus"></i> Criar primeiro clube
                </button>
            </div>
        `;
        return;
    }
    
    let html = '';
    clubes.forEach(c => {
        const ocupacaoPercent = c.vagas > 0 ? (c.inscricoesAtivas / c.vagas * 100) : 0;
        const lotado = c.vagasRestantes <= 0;
        
        html += `
            <div class="clube-card">
                <div class="clube-header" style="background: linear-gradient(135deg, ${c.cor}, ${ajustarCor(c.cor)});">
                    <h3>${escapeHTML(c.nome)}</h3>
                    <p>${escapeHTML(c.descricao.substring(0, 80))}${c.descricao.length > 80 ? '...' : ''}</p>
                    <span class="clube-status-badge">
                        ${c.ativo ? (c.inscricoesAbertas ? '🟢 Aberto' : '🟡 Pausado') : '⚫ Inativo'}
                    </span>
                </div>
                <div class="clube-body">
                    <div class="clube-info">
                        <span><i class="fas fa-crown"></i> Líder:</span>
                        <strong>${escapeHTML(c.lider?.nome || '-')}</strong>
                    </div>
                    <div class="clube-info">
                        <span><i class="fas fa-user-tie"></i> Vice:</span>
                        <strong>${escapeHTML(c.viceLider?.nome || '-')}</strong>
                    </div>
                    <div class="clube-info">
                        <span><i class="fas fa-map-marker-alt"></i> Local:</span>
                        <strong>${escapeHTML(c.local || '-')}</strong>
                    </div>
                    <div class="clube-info">
                        <span><i class="fas fa-calendar"></i> Dia:</span>
                        <strong>${escapeHTML(c.diaSemana || '-')} ${c.horario ? 'às ' + c.horario : ''}</strong>
                    </div>
                    
                    <div class="clube-vagas-bar">
                        <div class="clube-vagas-fill ${lotado ? 'lotado' : ''}" style="width: ${ocupacaoPercent}%"></div>
                    </div>
                    <div class="clube-vagas-texto">
                        <strong>${c.inscricoesAtivas}</strong> / ${c.vagas} vagas 
                        (${c.vagasRestantes} restantes)
                    </div>
                </div>
                <div class="clube-actions">
                    <button class="btn-sm btn-info" onclick="verInscricoesClube('${c._id}')" title="Ver inscrições">
                        <i class="fas fa-list"></i>
                    </button>
                    <button class="btn-sm btn-warning" onclick="editarClube('${c._id}')" title="Editar">
                        <i class="fas fa-edit"></i> Editar
                    </button>
                    <button class="btn-sm btn-danger" onclick="excluirClube('${c._id}', '${escapeHTML(c.nome)}')" title="Excluir">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function ajustarCor(cor) {
    // Escurece a cor para gradiente
    try {
        const hex = cor.replace('#', '');
        const r = Math.max(0, parseInt(hex.substr(0, 2), 16) - 30);
        const g = Math.max(0, parseInt(hex.substr(2, 2), 16) - 30);
        const b = Math.max(0, parseInt(hex.substr(4, 2), 16) - 30);
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    } catch (e) {
        return '#ea580c';
    }
}

function preencherFiltroClubes(clubes) {
    const select = safeGet('filtroClubeInscricoes');
    if (!select) return;
    
    select.innerHTML = '<option value="">Todos os clubes</option>';
    clubes.forEach(c => {
        select.innerHTML += `<option value="${c._id}">${escapeHTML(c.nome)}</option>`;
    });
}

function abrirModalClube() {
    clubeEditandoId = null;
    safeGet('modalClubeTitulo').textContent = 'Novo Clube';
    
    // Limpar form
    safeGet('clubeNome').value = '';
    safeGet('clubeDescricao').value = '';
    safeGet('clubeLider').value = '';
    safeGet('clubeViceLider').value = '';
    safeGet('clubeVagas').value = 30;
    safeGet('clubeCor').value = '#f97316';
    safeGet('clubeLocal').value = '';
    safeGet('clubeDiaSemana').value = '';
    safeGet('clubeHorario').value = '';
    safeGet('clubeAtivo').checked = true;
    safeGet('clubeInscricoesAbertas').checked = false;
    
    modalClube.show();
}

async function editarClube(id) {
    try {
        const response = await fetch(`/api/protagonismo/clubes/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (!data.success) {
            mostrarToast('Erro ao carregar clube');
            return;
        }
        
        const c = data.clube;
        clubeEditandoId = id;
        safeGet('modalClubeTitulo').textContent = 'Editar Clube';
        
        safeGet('clubeNome').value = c.nome || '';
        safeGet('clubeDescricao').value = c.descricao || '';
        safeGet('clubeLider').value = c.lider?.nome || '';
        safeGet('clubeViceLider').value = c.viceLider?.nome || '';
        safeGet('clubeVagas').value = c.vagas || 30;
        safeGet('clubeCor').value = c.cor || '#f97316';
        safeGet('clubeLocal').value = c.local || '';
        safeGet('clubeDiaSemana').value = c.diaSemana || '';
        safeGet('clubeHorario').value = c.horario || '';
        safeGet('clubeAtivo').checked = c.ativo !== false;
        safeGet('clubeInscricoesAbertas').checked = c.inscricoesAbertas === true;
        
        modalClube.show();
    } catch (error) {
        console.error('Erro:', error);
        mostrarToast('Erro ao carregar clube');
    }
}

async function salvarClube() {
    const nome = safeGet('clubeNome').value.trim();
    const descricao = safeGet('clubeDescricao').value.trim();
    
    if (!nome || !descricao) {
        mostrarToast('Nome e descrição são obrigatórios');
        return;
    }
    
    const dados = {
        nome,
        descricao,
        lider: { nome: safeGet('clubeLider').value.trim(), alunoId: null },
        viceLider: { nome: safeGet('clubeViceLider').value.trim(), alunoId: null },
        vagas: parseInt(safeGet('clubeVagas').value) || 30,
        cor: safeGet('clubeCor').value,
        local: safeGet('clubeLocal').value.trim(),
        diaSemana: safeGet('clubeDiaSemana').value,
        horario: safeGet('clubeHorario').value,
        ativo: safeGet('clubeAtivo').checked,
        inscricoesAbertas: safeGet('clubeInscricoesAbertas').checked
    };
    
    try {
        const url = clubeEditandoId 
            ? `/api/protagonismo/clubes/${clubeEditandoId}`
            : '/api/protagonismo/clubes';
        const method = clubeEditandoId ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(dados)
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarToast('Clube salvo com sucesso!', 'success');
            modalClube.hide();
            await carregarClubes();
            await carregarEstatisticas();
        } else {
            mostrarToast('Erro: ' + data.error);
        }
    } catch (error) {
        console.error('Erro:', error);
        mostrarToast('Erro ao salvar clube');
    }
}

async function excluirClube(id, nome) {
    const confirmar = await confirm(`Excluir o clube "${nome}"?\n\nEsta ação não pode ser desfeita.`);
    if (!confirmar) return;
    
    try {
        const response = await fetch(`/api/protagonismo/clubes/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success) {
            mostrarToast('Clube excluído!', 'success');
            await carregarClubes();
            await carregarEstatisticas();
        } else {
            if (typeof mostrarToast === 'function') {
                mostrarToast('Erro: ' + data.error, 'error');
            } else {
                console.error('Erro: ' + data.error);
            }
        }
    } catch (error) {
        console.error('Erro:', error);
        if (typeof mostrarToast === 'function') {
            mostrarToast('Erro ao excluir clube', 'error');
        } else {
            console.error('Erro ao excluir clube');
        }
    }
}

function verInscricoesClube(id) {
    // Vai para aba de inscrições com filtro
    const filtroSelect = safeGet('filtroClubeInscricoes');
    if (filtroSelect) filtroSelect.value = id;
    
    // Muda para aba de inscrições
    const tab = new bootstrap.Tab(safeGet('aba-inscricoes'));
    tab.show();
}

// ============================================
// INSCRIÇÕES
// ============================================
async function carregarInscricoes() {
    const tbody = safeGet('tabelaInscricoes');
    if (!tbody) return;
    
    const clubeId = safeGet('filtroClubeInscricoes')?.value || '';
    const turma = safeGet('filtroTurmaInscricoes')?.value || '';
    const status = safeGet('filtroStatusInscricoes')?.value || '';
    
    let url = '/api/protagonismo/inscricoes?';
    if (clubeId) url += `clubeId=${clubeId}&`;
    if (turma) url += `turma=${encodeURIComponent(turma)}&`;
    if (status) url += `status=${status}&`;
    
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-3"><div class="loading-spinner"></div></td></tr>';
    
    try {
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success) {
            if (data.inscricoes.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center py-3 text-muted">Nenhuma inscrição encontrada</td></tr>';
                return;
            }
            
            tbody.innerHTML = data.inscricoes.map(i => `
                <tr>
                    <td><strong>${escapeHTML(i.nomeCompleto)}</strong></td>
                    <td>${i.dataNascimento ? new Date(i.dataNascimento).toLocaleDateString('pt-BR') : '-'}</td>
                    <td>${escapeHTML(i.turma)}</td>
                    <td>${escapeHTML(i.curso)}</td>
                    <td>
                        <span class="badge" style="background: ${i.clubeCor}; color: white; padding: 5px 10px;">
                            ${escapeHTML(i.clubeNome)}
                        </span>
                    </td>
                    <td>${new Date(i.createdAt).toLocaleString('pt-BR')}</td>
                    <td>
                        <button class="btn-sm btn-danger" onclick="excluirInscricao('${i.id}', '${escapeHTML(i.nomeCompleto)}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `).join('');
        }
    } catch (error) {
        console.error('Erro:', error);
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Erro ao carregar</td></tr>';
    }
}

async function excluirInscricao(id, nome) {
    const confirmar = await confirm(`Excluir a inscrição de "${nome}"?\n\nA vaga será liberada no clube.`);
    if (!confirmar) return;
    
    try {
        const response = await fetch(`/api/protagonismo/inscricoes/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success) {
            mostrarToast('Inscrição excluída!', 'success');
            await carregarInscricoes();
            await carregarClubes();
            await carregarEstatisticas();
        } else {
            if (typeof mostrarToast === 'function') {
                mostrarToast('Erro: ' + data.error, 'error');
            } else {
                console.error('Erro: ' + data.error);
            }
        }
    } catch (error) {
        console.error('Erro:', error);
        if (typeof mostrarToast === 'function') {
            mostrarToast('Erro ao excluir', 'error');
        } else {
            console.error('Erro ao excluir');
        }
    }
}

// ============================================
// TUTORIA
// ============================================
async function carregarTutores() {
    const container = safeGet('listaTutores');
    if (!container) return;
    
    container.innerHTML = '<div class="text-center py-5"><div class="loading-spinner"></div><p>Carregando...</p></div>';
    
    const turma = safeGet('filtroTurmaTutores')?.value || '';
    let url = '/api/protagonismo/tutores';
    if (turma) url += `?turma=${encodeURIComponent(turma)}`;
    
    try {
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success) {
            tutoresData = data.tutores;
            renderizarTutores(data.porTurma);
        } else {
            container.innerHTML = '<div class="text-center py-5 text-danger">Erro ao carregar tutores</div>';
        }
    } catch (error) {
        console.error('Erro:', error);
        container.innerHTML = '<div class="text-center py-5 text-danger">Erro ao carregar</div>';
    }
}

function renderizarTutores(porTurma) {
    const container = safeGet('listaTutores');
    if (!container) return;
    
    const turmas = Object.keys(porTurma || {});
    
    if (turmas.length === 0) {
        container.innerHTML = `
            <div class="text-center py-5">
                <i class="fas fa-chalkboard-teacher fa-3x mb-3" style="color: #fed7aa;"></i>
                <p class="text-muted">Nenhum tutor cadastrado ainda.</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    turmas.forEach(turma => {
        const tutores = porTurma[turma];
        html += `
            <div class="tutor-turma-grupo">
                <div class="tutor-turma-titulo">
                    <h4><i class="fas fa-users-class me-2"></i>Turma: ${escapeHTML(turma)}</h4>
                    <span class="badge bg-primary">${tutores.length}/2 tutores</span>
                </div>
                <div class="tutores-lista">
                    ${tutores.map(t => `
                        <div class="tutor-card">
                            <h5>${escapeHTML(t.nomeProfessor)}</h5>
                            <p><strong>Área:</strong> ${escapeHTML(t.area)}</p>
                            <p><strong>Curso:</strong> ${escapeHTML(t.curso)}</p>
                            ${t.observacoes ? `<p><strong>Obs:</strong> ${escapeHTML(t.observacoes)}</p>` : ''}
                            <div style="margin-top: 10px; display: flex; gap: 8px;">
                                <button class="btn-sm btn-warning" onclick="editarTutor('${t._id}')">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn-sm btn-danger" onclick="excluirTutor('${t._id}', '${escapeHTML(t.nomeProfessor)}')">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function abrirModalTutor() {
    tutorEditandoId = null;
    safeGet('modalTutorTitulo').textContent = 'Novo Tutor';
    
    safeGet('tutorNome').value = '';
    safeGet('tutorArea').value = '';
    safeGet('tutorCurso').value = '';
    safeGet('tutorTurma').value = '';
    safeGet('tutorObservacoes').value = '';
    
    modalTutor.show();
}

async function editarTutor(id) {
    try {
        const response = await fetch('/api/protagonismo/tutores', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (!data.success) return;
        
        const tutor = data.tutores.find(t => t._id === id);
        if (!tutor) { mostrarToast('Tutor não encontrado'); return; }
        
        tutorEditandoId = id;
        safeGet('modalTutorTitulo').textContent = 'Editar Tutor';
        
        safeGet('tutorNome').value = tutor.nomeProfessor || '';
        safeGet('tutorArea').value = tutor.area || '';
        safeGet('tutorCurso').value = tutor.curso || '';
        safeGet('tutorTurma').value = tutor.turma || '';
        safeGet('tutorObservacoes').value = tutor.observacoes || '';
        
        modalTutor.show();
    } catch (error) {
        console.error('Erro:', error);
    }
}

async function salvarTutor() {
    const dados = {
        nomeProfessor: safeGet('tutorNome').value.trim(),
        area: safeGet('tutorArea').value.trim(),
        curso: safeGet('tutorCurso').value,
        turma: safeGet('tutorTurma').value,
        observacoes: safeGet('tutorObservacoes').value.trim()
    };
    
    if (!dados.nomeProfessor || !dados.area || !dados.curso || !dados.turma) {
        mostrarToast('Preencha todos os campos obrigatórios');
        return;
    }
    
    try {
        const url = tutorEditandoId 
            ? `/api/protagonismo/tutores/${tutorEditandoId}`
            : '/api/protagonismo/tutores';
        const method = tutorEditandoId ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(dados)
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarToast('Tutor salvo!', 'success');
            modalTutor.hide();
            await carregarTutores();
            await carregarEstatisticas();
        } else {
            mostrarToast('Erro: ' + data.error);
        }
    } catch (error) {
        console.error('Erro:', error);
        mostrarToast('Erro ao salvar tutor');
    }
}

async function excluirTutor(id, nome) {
    const confirmar = await confirm(`Excluir o tutor "${nome}"?`);
    if (!confirmar) return;
    
    try {
        const response = await fetch(`/api/protagonismo/tutores/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success) {
            mostrarToast('Tutor excluído!', 'success');
            await carregarTutores();
            await carregarEstatisticas();
        } else {
            if (typeof mostrarToast === 'function') {
                mostrarToast('Erro: ' + data.error, 'error');
            } else {
                console.error('Erro: ' + data.error);
            }
        }
    } catch (error) {
        console.error('Erro:', error);
    }
}

// ============================================
// CANDIDATOS
// ============================================
async function carregarCandidatos() {
    const container = safeGet('listaCandidatos');
    if (!container) return;
    
    container.innerHTML = '<div class="text-center py-5"><div class="loading-spinner"></div><p>Carregando...</p></div>';
    
    const turma = safeGet('filtroTurmaCandidatos')?.value || '';
    const cargo = safeGet('filtroCargoCandidatos')?.value || '';
    
    let url = '/api/protagonismo/candidatos?';
    if (turma) url += `turma=${encodeURIComponent(turma)}&`;
    if (cargo) url += `cargo=${cargo}`;
    
    try {
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success) {
            candidatosData = data.candidatos;
            renderizarCandidatos(data.porTurma);
        }
    } catch (error) {
        console.error('Erro:', error);
    }
}

function renderizarCandidatos(porTurma) {
    const container = safeGet('listaCandidatos');
    if (!container) return;
    
    const turmas = Object.keys(porTurma || {});
    
    if (turmas.length === 0) {
        container.innerHTML = `
            <div class="text-center py-5">
                <i class="fas fa-vote-yea fa-3x mb-3" style="color: #fed7aa;"></i>
                <p class="text-muted">Nenhum candidato cadastrado ainda.</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    turmas.forEach(turma => {
        const { lider, vice_lider } = porTurma[turma];
        
        html += `
            <div class="candidato-turma-grupo">
                <div class="tutor-turma-titulo">
                    <h4><i class="fas fa-users me-2"></i>Turma: ${escapeHTML(turma)}</h4>
                    <span class="badge bg-primary">${lider.length + vice_lider.length} candidatos</span>
                </div>
                
                ${lider.length > 0 ? `
                    <h6 style="margin: 15px 0 10px; color: #92400e;">
                        <i class="fas fa-crown"></i> Candidatos a Líder (${lider.length})
                    </h6>
                    <div class="candidatos-lista">
                        ${lider.map(c => renderizarCandidato(c)).join('')}
                    </div>
                ` : ''}
                
                ${vice_lider.length > 0 ? `
                    <h6 style="margin: 15px 0 10px; color: #1e40af;">
                        <i class="fas fa-user-tie"></i> Candidatos a Vice-Líder (${vice_lider.length})
                    </h6>
                    <div class="candidatos-lista">
                        ${vice_lider.map(c => renderizarCandidato(c)).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function renderizarCandidato(c) {
    return `
        <div class="candidato-card">
            <img src="${c.fotoPerfil || gerarAvatarSVG(c.nome)}" class="candidato-foto" 
                 onerror="this.onerror=null; this.src='${gerarAvatarSVG(c.nome)}'">
            <h5>${escapeHTML(c.nome)}</h5>
            <span class="candidato-cargo ${c.cargo}">${c.cargo === 'lider' ? 'Líder' : 'Vice-Líder'}</span>
            ${c.slogan ? `<div class="candidato-slogan">"${escapeHTML(c.slogan)}"</div>` : ''}
            <div class="candidato-votos">${c.votos || 0}</div>
            <small class="text-muted">votos</small>
            <div style="margin-top: 10px; display: flex; gap: 6px; justify-content: center;">
                <button class="btn-sm btn-danger" onclick="excluirCandidato('${c._id}', '${escapeHTML(c.nome)}')">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `;
}

function abrirModalCandidato() {
    safeGet('candidatoTurma').value = '';
    safeGet('candidatoAluno').innerHTML = '<option value="">Selecione a turma primeiro...</option>';
    safeGet('candidatoCargo').value = '';
    safeGet('candidatoSlogan').value = '';
    safeGet('candidatoProposta').value = '';
    
    modalCandidato.show();
}

async function carregarAlunosTurma() {
    const turma = safeGet('candidatoTurma').value;
    const select = safeGet('candidatoAluno');
    
    if (!turma) {
        select.innerHTML = '<option value="">Selecione a turma primeiro...</option>';
        return;
    }
    
    select.innerHTML = '<option value="">Carregando...</option>';
    
    try {
        const response = await fetch(`/api/protagonismo/alunos-por-turma?turma=${encodeURIComponent(turma)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success && data.alunos.length > 0) {
            select.innerHTML = '<option value="">Selecione o aluno...</option>';
            data.alunos.forEach(a => {
                select.innerHTML += `<option value="${a.id}">${escapeHTML(a.nome)} (${escapeHTML(a.matricula || 'Sem matrícula')})</option>`;
            });
        } else {
            select.innerHTML = '<option value="">Nenhum aluno encontrado</option>';
        }
    } catch (error) {
        console.error('Erro:', error);
        select.innerHTML = '<option value="">Erro ao carregar</option>';
    }
}

async function salvarCandidato() {
    const alunoId = safeGet('candidatoAluno').value;
    const cargo = safeGet('candidatoCargo').value;
    
    if (!alunoId || !cargo) {
        mostrarToast('Aluno e cargo são obrigatórios');
        return;
    }
    
    const dados = {
        alunoId,
        cargo,
        slogan: safeGet('candidatoSlogan').value.trim(),
        proposta: safeGet('candidatoProposta').value.trim()
    };
    
    try {
        const response = await fetch('/api/protagonismo/candidatos', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(dados)
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarToast('Candidato cadastrado!', 'success');
            modalCandidato.hide();
            await carregarCandidatos();
            await carregarEstatisticas();
        } else {
            mostrarToast('Erro: ' + data.error);
        }
    } catch (error) {
        console.error('Erro:', error);
        mostrarToast('Erro ao salvar candidato');
    }
}

async function excluirCandidato(id, nome) {
    const confirmar = await confirm(`Excluir o candidato "${nome}"?`);
    if (!confirmar) return;
    
    try {
        const response = await fetch(`/api/protagonismo/candidatos/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success) {
            mostrarToast('Candidato excluído!', 'success');
            await carregarCandidatos();
            await carregarEstatisticas();
        } else {
            if (typeof mostrarToast === 'function') {
                mostrarToast('Erro: ' + data.error, 'error');
            } else {
                console.error('Erro: ' + data.error);
            }
        }
    } catch (error) {
        console.error('Erro:', error);
    }
}

// ============================================
// RESULTADOS DA ELEIÇÃO
// ============================================
async function carregarResultadosEleicao() {
    const container = safeGet('resultadosEleicao');
    if (!container) return;
    
    container.innerHTML = '<div class="text-center py-5"><div class="loading-spinner"></div><p>Carregando resultados...</p></div>';
    
    try {
        const response = await fetch('/api/protagonismo/eleicao/resultados', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success) {
            safeSetText('totalVotos', data.totalVotos || 0);
            
            if (!data.porTurma || data.porTurma.length === 0) {
                container.innerHTML = `
                    <div class="text-center py-5">
                        <i class="fas fa-trophy fa-3x mb-3" style="color: #fed7aa;"></i>
                        <p class="text-muted">Ainda não há votos registrados.</p>
                    </div>
                `;
                return;
            }
            
            let html = '';
            data.porTurma.forEach(t => {
                html += `
                    <div class="resultado-turma">
                        <h4><i class="fas fa-users me-2"></i>Turma: ${escapeHTML(t.turma)}</h4>
                        
                        ${t.vencedorLider ? `
                            <h6 style="color: #92400e; margin-bottom: 10px;">
                                <i class="fas fa-crown"></i> Líder Eleito
                            </h6>
                            <div class="vencedor-card">
                                <img src="${t.vencedorLider.fotoPerfil || gerarAvatarSVG(t.vencedorLider.nome)}" 
                                     onerror="this.onerror=null; this.src='${gerarAvatarSVG(t.vencedorLider.nome)}'">
                                <div class="vencedor-info">
                                    <h5>${escapeHTML(t.vencedorLider.nome)}</h5>
                                    <div class="votos">${t.vencedorLider.votos} votos</div>
                                </div>
                            </div>
                        ` : ''}
                        
                        ${t.vencedorVice ? `
                            <h6 style="color: #1e40af; margin: 15px 0 10px;">
                                <i class="fas fa-user-tie"></i> Vice-Líder Eleito
                            </h6>
                            <div class="vencedor-card" style="background: linear-gradient(135deg, #dbeafe, #bfdbfe); border-color: #3b82f6;">
                                <img src="${t.vencedorVice.fotoPerfil || gerarAvatarSVG(t.vencedorVice.nome)}" 
                                     style="border-color: #3b82f6;"
                                     onerror="this.onerror=null; this.src='${gerarAvatarSVG(t.vencedorVice.nome)}'">
                                <div class="vencedor-info">
                                    <h5 style="color: #1e3a8a;">${escapeHTML(t.vencedorVice.nome)}</h5>
                                    <div class="votos" style="color: #1e40af;">${t.vencedorVice.votos} votos</div>
                                </div>
                            </div>
                        ` : ''}
                        
                        ${t.lider.length > 1 ? `
                            <div style="margin-top: 15px;">
                                <small class="text-muted"><strong>Ranking de Líder:</strong></small>
                                ${t.lider.slice(0, 5).map((c, i) => `
                                    <div style="display: flex; justify-content: space-between; padding: 5px 0; font-size: 13px;">
                                        <span>${i+1}º ${escapeHTML(c.nome)}</span>
                                        <span><strong>${c.votos}</strong> votos</span>
                                    </div>
                                `).join('')}
                            </div>
                        ` : ''}
                        
                        ${t.vice_lider.length > 1 ? `
                            <div style="margin-top: 15px;">
                                <small class="text-muted"><strong>Ranking de Vice-Líder:</strong></small>
                                ${t.vice_lider.slice(0, 5).map((c, i) => `
                                    <div style="display: flex; justify-content: space-between; padding: 5px 0; font-size: 13px;">
                                        <span>${i+1}º ${escapeHTML(c.nome)}</span>
                                        <span><strong>${c.votos}</strong> votos</span>
                                    </div>
                                `).join('')}
                            </div>
                        ` : ''}
                    </div>
                `;
            });
            
            container.innerHTML = html;
        }
    } catch (error) {
        console.error('Erro:', error);
        container.innerHTML = '<div class="text-center py-5 text-danger">Erro ao carregar resultados</div>';
    }
}

// ============================================
// LINK PÚBLICO E UTILITÁRIOS
// ============================================
function copiarLinkPublico() {
    const input = safeGet('linkPublicoInput');
    if (!input) return;
    
    input.select();
    input.setSelectionRange(0, 99999);
    
    try {
        navigator.clipboard.writeText(input.value);
        mostrarToast('Link copiado para a área de transferência!', 'success');
    } catch (e) {
        document.execCommand('copy');
        mostrarToast('Link copiado!', 'success');
    }
}

function mostrarToast(mensagem, tipo = 'info') {
    const cores = {
        success: '#10b981',
        error: '#ef4444',
        info: '#3b82f6',
        warning: '#f59e0b'
    };
    
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed; bottom: 20px; right: 20px; z-index: 99999;
        background: ${cores[tipo] || cores.info};
        color: white; padding: 14px 24px; border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.2);
        font-weight: 500; font-size: 14px;
        display: flex; align-items: center; gap: 10px;
        animation: slideIn 0.3s ease;
    `;
    toast.innerHTML = `<i class="fas fa-check-circle"></i> ${escapeHTML(mensagem)}`;
    
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

async function logout() {
    const confirmar = await confirm('Tem certeza que deseja sair do sistema?');
    if (confirmar) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_data');
        window.location.href = '/login.html';
    }
}

// ============================================
// QR CODE DO LINK PÚBLICO
// ============================================
let modalQRCode = null;

async function abrirModalQRCode() {
    // Pega o link público dinamicamente
    const linkPublico = window.location.origin + '/protagonismo-publico.html';
    
    // Mostra o texto do link
    safeGet('qrCodeUrlTexto').textContent = linkPublico;
    
    // Mostra loading
    safeGet('qrCodeLoading').style.display = 'flex';
    safeGet('qrCodeImg').style.display = 'none';
    
    // Abre o modal
    if (!modalQRCode) {
        modalQRCode = new bootstrap.Modal(document.getElementById('modalQRCode'));
    }
    modalQRCode.show();
    
    // Gera o QR Code
    try {
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=10&data=${encodeURIComponent(linkPublico)}`;
        
        // Precarrega a imagem
        const img = new Image();
        img.onload = () => {
            safeGet('qrCodeImg').src = qrUrl;
            safeGet('qrCodeImg').style.display = 'block';
            safeGet('qrCodeLoading').style.display = 'none';
        };
        img.onerror = () => {
            safeGet('qrCodeLoading').innerHTML = `
                <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #ef4444;"></i>
                <p style="color: #6b7280; margin-top: 10px; font-size: 13px;">
                    Erro ao gerar QR Code.<br>Verifique sua conexão.
                </p>
            `;
        };
        img.src = qrUrl;
    } catch (error) {
        console.error('Erro ao gerar QR Code:', error);
        mostrarToast('Erro ao gerar QR Code', 'error');
    }
}

async function baixarQRCode() {
    const linkPublico = window.location.origin + '/protagonismo-publico.html';
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=1000x1000&margin=20&data=${encodeURIComponent(linkPublico)}`;
    
    try {
        mostrarToast('Preparando download...', 'info');
        
        const response = await fetch(qrUrl);
        const blob = await response.blob();
        
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `qrcode-protagonismo-${new Date().toISOString().split('T')[0]}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        mostrarToast('✅ QR Code baixado!', 'success');
    } catch (error) {
        console.error('Erro ao baixar QR Code:', error);
        mostrarToast('Erro ao baixar. Tente novamente.', 'error');
    }
}

function imprimirQRCode() {
    const linkPublico = window.location.origin + '/protagonismo-publico.html';
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=20&data=${encodeURIComponent(linkPublico)}`;
    
    // Abre uma nova janela com o QR Code pronto para imprimir
    const janelaImpressao = window.open('', '_blank', 'width=800,height=900');
    janelaImpressao.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>QR Code - Protagonismo</title>
            <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                    font-family: 'Segoe UI', sans-serif;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 100vh;
                    padding: 40px;
                    background: white;
                }
                .card {
                    text-align: center;
                    padding: 50px;
                    border: 4px dashed #e11d48;
                    border-radius: 30px;
                    max-width: 600px;
                }
                .icone {
                    font-size: 60px;
                    color: #e11d48;
                    margin-bottom: 20px;
                }
                h1 {
                    font-size: 32px;
                    color: #1f2937;
                    margin-bottom: 8px;
                }
                .subtitulo {
                    font-size: 16px;
                    color: #6b7280;
                    margin-bottom: 30px;
                }
                .qr-wrapper {
                    background: white;
                    padding: 20px;
                    border-radius: 20px;
                    border: 3px solid #e11d48;
                    display: inline-block;
                    margin-bottom: 24px;
                }
                .qr-wrapper img {
                    display: block;
                    width: 100%;
                    max-width: 400px;
                }
                .instrucoes {
                    font-size: 18px;
                    color: #4b5563;
                    font-weight: 600;
                    margin-bottom: 15px;
                }
                .instrucoes i {
                    color: #e11d48;
                }
                .rodape {
                    margin-top: 30px;
                    padding-top: 20px;
                    border-top: 2px solid #f3f4f6;
                    font-size: 12px;
                    color: #9ca3af;
                }
                @media print {
                    body { padding: 0; }
                    .card { border-color: #e11d48; page-break-inside: avoid; }
                }
            </style>
        </head>
        <body>
            <div class="card">
                <div class="icone">
                    <i class="fas fa-star"></i>
                </div>
                <h1>Protagonismo Estudantil</h1>
                <p class="subtitulo">Escaneie o QR Code e participe!</p>
                
                <div class="qr-wrapper">
                    <img src="${qrUrl}" alt="QR Code">
                </div>
                
                <p class="instrucoes">
                    <i class="fas fa-mobile-alt"></i>
                    Aponte a câmera do celular para o QR Code
                </p>
                
                <div class="rodape">
                    <i class="fas fa-graduation-cap"></i> EducaPleno • 2026
                </div>
            </div>
            
            <script>
                window.onload = function() {
                    setTimeout(function() {
                        window.print();
                    }, 500);
                };
            <\/script>
        </body>
        </html>
    `);
    janelaImpressao.document.close();
}

// ============================================
// 🔔 SISTEMA DE NOTIFICAÇÕES INTERNAS
// ============================================

let notificacoesInterval;

// Detectar WebView (Kodular)
function isWebView() {
    return /wv|WebView|Android.*Version\/[\d.]+.*Chrome/i.test(navigator.userAgent) ||
           (typeof window.AppInventor !== 'undefined');
}

// Mostrar notificação customizada (não trava o WebView)
function mostrarNotificacao(mensagem, tipo = 'info') {
    if (!isWebView()) {
        mostrarToast(mensagem);
        return;
    }
    
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 999999;
        padding: 20px;
        box-sizing: border-box;
    `;
    
    const icones = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const cores = { success: '#10b981', error: '#dc2626', warning: '#f59e0b', info: '#3b82f6' };
    
    modal.innerHTML = `
        <div style="
            background: white;
            border-radius: 16px;
            padding: 25px;
            max-width: 380px;
            width: 100%;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            text-align: center;
        ">
            <div style="font-size: 48px; margin-bottom: 15px;">${icones[tipo] || 'ℹ️'}</div>
            <p style="margin: 0 0 20px; color: #374151; font-size: 15px; line-height: 1.5; white-space: pre-line;">
                ${mensagem}
            </p>
            <button onclick="this.closest('div').parentElement.remove()" style="
                width: 100%;
                padding: 12px;
                background: ${cores[tipo] || cores.info};
                color: white;
                border: none;
                border-radius: 10px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
            ">OK</button>
        </div>
    `;
    
    document.body.appendChild(modal);
}

// Modal de confirmação customizado (não trava o WebView)
function confirmar(mensagem) {
    return new Promise((resolve) => {
        const oldModal = document.getElementById('modalConfirmacao');
        if (oldModal) oldModal.remove();
        
        const modalHtml = `
            <div class="modal fade" id="modalConfirmacao" tabindex="-1" data-bs-backdrop="static">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header" style="background: linear-gradient(135deg, #f97316, #ea580c); color: white;">
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
        
        modalEl.addEventListener('hidden.bs.modal', () => {
            if (!modalEl.dataset.resolvido) {
                resolve(false);
            }
        });
    });
}

// Inicializar sistema de notificações
function iniciarNotificacoes() {
    carregarNotificacoes();
    notificacoesInterval = setInterval(carregarNotificacoes, 30000);
    
    // Fechar dropdown ao clicar fora
    document.addEventListener('click', function(event) {
        const dropdown = document.getElementById('notificacoesDropdown');
        const btn = document.getElementById('notificacoesBtn');
        
        if (dropdown && btn && !btn.contains(event.target) && !dropdown.contains(event.target)) {
            dropdown.classList.remove('show');
        }
    });
}

async function carregarNotificacoes() {
    try {
        const token = localStorage.getItem('auth_token');
        if (!token) return;
        
        const countResponse = await fetch('/api/notificacoes/nao-lidas/contador', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const countData = await countResponse.json();
        
        if (countData.success) {
            const badge = document.getElementById('notificacoesBadge');
            if (badge) {
                if (countData.count > 0) {
                    badge.textContent = countData.count > 99 ? '99+' : countData.count;
                    badge.style.display = 'inline';
                    document.getElementById('notificacoesBtn')?.classList.add('tem-notificacao');
                } else {
                    badge.style.display = 'none';
                    document.getElementById('notificacoesBtn')?.classList.remove('tem-notificacao');
                }
            }
        }
        
        const dropdown = document.getElementById('notificacoesDropdown');
        if (dropdown && dropdown.classList.contains('show')) {
            await carregarListaNotificacoes();
        }
        
    } catch (error) {
        console.error('Erro ao carregar notificações:', error);
    }
}

async function carregarListaNotificacoes() {
    try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch('/api/notificacoes?apenasNaoLidas=false&limite=20', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            renderizarNotificacoes(data.notificacoes);
        }
        
    } catch (error) {
        console.error('Erro ao carregar lista:', error);
    }
}

function renderizarNotificacoes(notificacoes) {
    const lista = document.getElementById('notificacoesLista');
    if (!lista) return;
    
    if (notificacoes.length === 0) {
        lista.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #6c757d;">
                <i class="fas fa-bell-slash" style="font-size: 48px; margin-bottom: 15px; opacity: 0.5;"></i>
                <p style="font-size: 1rem;">Nenhuma notificação</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    notificacoes.forEach(notif => {
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
        
        // 🔥 CORREÇÃO: data-attributes para evitar problemas com aspas
        html += `
            <div class="notificacao-item ${classeLida}" 
                 data-notif-id="${notif._id}" 
                 data-notif-link="${escapeHTML(notif.link || '#')}">
                <div class="notificacao-icone" style="background: ${notif.cor || '#f97316'};">
                    ${notif.icone || '📋'}
                </div>
                <div class="notificacao-conteudo">
                    <div class="notificacao-titulo">${escapeHTML(notif.titulo || '')}</div>
                    <div class="notificacao-mensagem">${escapeHTML(notif.mensagem || '')}</div>
                    <div class="notificacao-tempo">
                        <i class="far fa-clock"></i> ${tempoTexto}
                    </div>
                </div>
            </div>
        `;
    });
    
    lista.innerHTML = html;
    
    // 🔥 CORREÇÃO: Adicionar listeners após renderizar
    lista.querySelectorAll('.notificacao-item').forEach(item => {
        item.addEventListener('click', () => {
            const id = item.getAttribute('data-notif-id');
            const link = item.getAttribute('data-notif-link');
            abrirNotificacao(id, link);
        });
    });
}

function abrirNotificacoes() {
    const dropdown = document.getElementById('notificacoesDropdown');
    if (!dropdown) return;
    
    dropdown.classList.toggle('show');
    
    if (dropdown.classList.contains('show')) {
        carregarListaNotificacoes();
    }
}

async function abrirNotificacao(id, link) {
    try {
        const token = localStorage.getItem('auth_token');
        
        await fetch(`/api/notificacoes/${id}/lida`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        document.getElementById('notificacoesDropdown').classList.remove('show');
        
        if (link && link !== '#') {
            window.location.href = link;
        }
        
        carregarNotificacoes();
        
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
            await carregarListaNotificacoes();
            document.getElementById('notificacoesBadge').style.display = 'none';
            document.getElementById('notificacoesBtn')?.classList.remove('tem-notificacao');
        }
        
    } catch (error) {
        console.error('Erro ao marcar todas como lidas:', error);
    }
}

async function limparMinhasNotificacoes(event) {
    try {
        const token = localStorage.getItem('auth_token');
        
        // 🔥 USA confirmar() em vez de confirm() nativo
        const confirmacao = await confirmar('🗑️ Deseja excluir TODAS as suas notificações?\n\nEsta ação não pode ser desfeita.');
        
        if (!confirmacao) return;
        
        const btn = event?.currentTarget;
        if (btn) {
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Excluindo...';
            btn.disabled = true;
        }
        
        const response = await fetch('/api/notificacoes/limpar-minhas', {
            method: 'DELETE',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            await carregarListaNotificacoes();
            document.getElementById('notificacoesBadge').style.display = 'none';
            document.getElementById('notificacoesBtn')?.classList.remove('tem-notificacao');
            // 🔥 USA mostrarNotificacao() em vez de mostrarToast() nativo
            mostrarNotificacao(data.message || 'Notificações excluídas com sucesso!', 'success');
        } else {
            throw new Error(data.error || 'Erro ao excluir notificações');
        }
        
    } catch (error) {
        console.error('❌ Erro:', error);
        mostrarNotificacao(error.message, 'error');
    } finally {
        const btn = document.querySelector('.notificacao-footer button');
        if (btn) {
            btn.innerHTML = '<i class="fas fa-trash"></i> Limpar todas';
            btn.disabled = false;
        }
    }
}

function fecharNotificacoes() {
    const dropdown = document.getElementById('notificacoesDropdown');
    if (dropdown) {
        dropdown.classList.remove('show');
    }
}

// Iniciar quando o DOM carregar
document.addEventListener('DOMContentLoaded', function() {
    // Só inicia se o sino existir
    if (document.getElementById('notificacoesBtn')) {
        iniciarNotificacoes();
    }
});

// Limpar interval ao sair
window.addEventListener('beforeunload', function() {
    if (notificacoesInterval) {
        clearInterval(notificacoesInterval);
    }
});

async function copiarLinkDoQR() {
    const linkPublico = window.location.origin + '/protagonismo-publico.html';
    
    try {
        await navigator.clipboard.writeText(linkPublico);
        mostrarToast('✅ Link copiado!', 'success');
    } catch (e) {
        // Fallback para navegadores antigos
        const input = document.createElement('input');
        input.value = linkPublico;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
        mostrarToast('✅ Link copiado!', 'success');
    }
}

// ============================================
// EXPORTAR FUNÇÕES GLOBAIS
// ============================================
window.abrirModalClube = abrirModalClube;
window.editarClube = editarClube;
window.excluirClube = excluirClube;
window.salvarClube = salvarClube;
window.verInscricoesClube = verInscricoesClube;

window.abrirModalTutor = abrirModalTutor;
window.editarTutor = editarTutor;
window.excluirTutor = excluirTutor;
window.salvarTutor = salvarTutor;

window.abrirModalCandidato = abrirModalCandidato;
window.carregarAlunosTurma = carregarAlunosTurma;
window.excluirCandidato = excluirCandidato;
window.salvarCandidato = salvarCandidato;

// Exportar funções de notificações
window.abrirNotificacoes = abrirNotificacoes;
window.abrirNotificacao = abrirNotificacao;
window.marcarTodasLidas = marcarTodasLidas;
window.limparMinhasNotificacoes = limparMinhasNotificacoes;
window.fecharNotificacoes = fecharNotificacoes;

window.excluirInscricao = excluirInscricao;
window.carregarInscricoes = carregarInscricoes;
window.carregarTutores = carregarTutores;
window.carregarCandidatos = carregarCandidatos;
window.carregarResultadosEleicao = carregarResultadosEleicao;
window.atualizarConfiguracao = atualizarConfiguracao;
window.abrirModalQRCode = abrirModalQRCode;
window.baixarQRCode = baixarQRCode;
window.imprimirQRCode = imprimirQRCode;
window.copiarLinkDoQR = copiarLinkDoQR;
window.copiarLinkPublico = copiarLinkPublico;
window.logout = logout;
window.copiarLinkPublico = copiarLinkPublico;
window.logout = logout;