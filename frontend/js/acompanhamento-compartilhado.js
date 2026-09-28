// ============================================================================
// ACOMPANHAMENTO COMPARTILHADO - FRONTEND
// Agrega dados de TODOS os setores (incluindo BIBLIOTECA)
// ============================================================================

let __acompanhamentoDados = null;
let __acompanhamentoFiltroSetor = 'todos';

// ============================================
// CARREGAR ACOMPANHAMENTO
// ============================================
async function carregarAcompanhamento() {
    const container = document.getElementById('acompListaAlunos');
    if (!container) return;

    const token = localStorage.getItem('auth_token');
    if (!token) return;

    container.innerHTML = `
        <div class="text-center py-5">
            <div class="spinner-border text-primary" role="status"></div>
            <p class="text-muted mt-3">Carregando acompanhamento...</p>
        </div>`;

    try {
        await carregarResumoDiaCompartilhado();

        const params = new URLSearchParams();
        const turma = document.getElementById('acompFiltroTurma')?.value || '';
        const dataInicio = document.getElementById('acompDataInicio')?.value || '';
        const dataFim = document.getElementById('acompDataFim')?.value || '';
        const busca = document.getElementById('acompBusca')?.value || '';

        if (turma) params.append('turma', turma);
        if (dataInicio) params.append('dataInicio', dataInicio);
        if (dataFim) params.append('dataFim', dataFim);
        if (busca) params.append('busca', busca);
        params.append('limit', '200');

        const response = await fetch(`/api/acompanhamento-compartilhado/alunos?${params}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await response.json();

        if (!data.success) throw new Error(data.error || 'Erro ao carregar');

        __acompanhamentoDados = data;

        await popularFiltroTurmasCompartilhado();
        renderizarListaAcompanhamentoCompartilhado(data.alunos);

    } catch (error) {
        console.error('❌ Erro no acompanhamento compartilhado:', error);
        container.innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle"></i>
                Erro ao carregar: ${error.message}
                <button class="btn btn-sm btn-outline-danger ms-2" onclick="carregarAcompanhamento()">
                    <i class="fas fa-redo"></i> Tentar novamente
                </button>
            </div>`;
    }
}

// ============================================
// CARREGAR RESUMO DO DIA (COM BIBLIOTECA)
// ============================================
async function carregarResumoDiaCompartilhado() {
    const token = localStorage.getItem('auth_token');
    if (!token) return;

    try {
        const response = await fetch('/api/acompanhamento-compartilhado/resumo-dia', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await response.json();
        if (!data.success) return;

        const resumo = data.resumo;

        atualizarCardResumoCompartilhado('Gestao', resumo.gestao, 'motivos');
        atualizarCardResumoCompartilhado('AS', resumo.assistente_social, 'tipos');
        atualizarCardResumoCompartilhado('Psico', resumo.psicologia, 'tipos');
        atualizarCardResumoCompartilhado('Supervisao', resumo.supervisao, 'motivos');
        atualizarCardResumoCompartilhado('Biblioteca', resumo.biblioteca, 'motivos');  // 🔥 NOVO

    } catch (error) {
        console.error('Erro ao carregar resumo:', error);
    }
}

// ============================================
// ATUALIZAR CARD DE RESUMO
// ============================================
function atualizarCardResumoCompartilhado(prefixo, dados, campoLista) {
    if (!dados) return;

    const totalEl = document.getElementById(`resumo${prefixo}Total`);
    if (totalEl) totalEl.textContent = dados.total || 0;

    const sufixo = campoLista === 'tipos' ? 'Tipos' : 'Motivos';
    const listaEl = document.getElementById(`resumo${prefixo}${sufixo}`);

    if (listaEl && dados[campoLista] && dados[campoLista].length > 0) {
        const top3 = dados[campoLista].slice(0, 3)
            .map(item => `${item.label} (${item.count})`)
            .join(' • ');
        listaEl.textContent = top3;
        listaEl.title = top3;
    } else if (listaEl) {
        listaEl.textContent = '—';
    }
}

// ============================================
// POPULAR FILTRO DE TURMAS
// ============================================
async function popularFiltroTurmasCompartilhado() {
    const select = document.getElementById('acompFiltroTurma');
    if (!select) return;

    const token = localStorage.getItem('auth_token');
    const valorAtual = select.value;

    try {
        const response = await fetch('/api/acompanhamento-compartilhado/turmas', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (data.success && Array.isArray(data.turmas)) {
            select.innerHTML = '<option value="">Todas as turmas</option>';
            data.turmas.forEach(t => {
                select.innerHTML += `<option value="${escapeHTMLCompartilhado(t)}">${escapeHTMLCompartilhado(t)}</option>`;
            });
            if (valorAtual) select.value = valorAtual;
        }
    } catch (error) {
        console.error('Erro ao popular turmas:', error);
    }
}

// ============================================
// RENDERIZAR LISTA (COM BIBLIOTECA)
// ============================================
function renderizarListaAcompanhamentoCompartilhado(alunos) {
    const container = document.getElementById('acompListaAlunos');
    if (!container) return;

    if (!alunos || alunos.length === 0) {
        container.innerHTML = `
            <div class="text-center py-5">
                <i class="fas fa-users-slash fa-3x text-muted mb-3"></i>
                <p class="text-muted">Nenhum aluno com ocorrências no período</p>
            </div>`;
        return;
    }

    let alunosFiltrados = alunos;
    if (__acompanhamentoFiltroSetor !== 'todos') {
        alunosFiltrados = alunos.filter(a => {
            const setor = __acompanhamentoFiltroSetor;
            return a[setor] && a[setor].total > 0;
        });
    }

    if (alunosFiltrados.length === 0) {
        container.innerHTML = `
            <div class="text-center py-5">
                <i class="fas fa-filter fa-3x text-muted mb-3"></i>
                <p class="text-muted">Nenhum aluno no setor "${__acompanhamentoFiltroSetor}"</p>
                <button class="btn btn-sm btn-outline-primary" onclick="limparFiltrosAcompanhamento()">
                    <i class="fas fa-times"></i> Limpar filtros
                </button>
            </div>`;
        return;
    }

    const setores = [
        { key: 'gestao', label: 'Atrasos', icon: 'fa-clock', color: '#3b82f6', bg: '#dbeafe' },
        { key: 'assistente_social', label: 'Assist. Social', icon: 'fa-hands-helping', color: '#10b981', bg: '#d1fae5' },
        { key: 'psicologia', label: 'Psicologia', icon: 'fa-brain', color: '#8b5cf6', bg: '#ede9fe' },
        { key: 'supervisao', label: 'Supervisão', icon: 'fa-shield-alt', color: '#1e3a8a', bg: '#dbeafe' },
        { key: 'biblioteca', label: 'Biblioteca', icon: 'fa-book', color: '#0ea5e9', bg: '#e0f2fe' }  // 🔥 NOVO
    ];

    container.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
            <h6 class="mb-0">
                <i class="fas fa-users"></i>
                ${alunosFiltrados.length} aluno(s) com ocorrências
            </h6>
            ${__acompanhamentoFiltroSetor !== 'todos' ? `
                <button class="btn btn-sm btn-outline-secondary" onclick="limparFiltrosAcompanhamento()">
                    <i class="fas fa-times"></i> Limpar filtro de setor
                </button>
            ` : ''}
        </div>

        <div class="row g-3">
            ${alunosFiltrados.map(aluno => {
                const temOcorrencias = setores.some(s => aluno[s.key] && aluno[s.key].total > 0);
                if (!temOcorrencias) return '';

                return `
                    <div class="col-md-6 col-lg-4">
                        <div class="card h-100" style="border-left: 4px solid #0ea5e9;">
                            <div class="card-body">
                                <div class="d-flex align-items-center gap-2 mb-2">
                                    <img src="${gerarAvatarSVGCompartilhado(aluno.alunoNome)}"
                                         style="width: 40px; height: 40px; border-radius: 50%;"
                                         alt="">
                                    <div style="flex: 1; min-width: 0;">
                                        <h6 class="mb-0 text-truncate" title="${escapeHTMLCompartilhado(aluno.alunoNome)}">
                                            ${escapeHTMLCompartilhado(aluno.alunoNome)}
                                        </h6>
                                        <small class="text-muted">
                                            ${escapeHTMLCompartilhado(aluno.alunoMatricula || '')} •
                                            ${escapeHTMLCompartilhado(aluno.alunoTurma || 'Sem turma')}
                                        </small>
                                    </div>
                                    <span class="badge bg-primary">${aluno.totalGeral}</span>
                                </div>

                                <div class="d-flex flex-wrap gap-1 mt-2">
                                    ${setores.map(setor => {
                                        const dados = aluno[setor.key];
                                        if (!dados || dados.total === 0) return '';
                                        return `
                                            <span class="badge"
                                                  style="background: ${setor.bg}; color: ${setor.color}; border: 1px solid ${setor.color}40; font-size: 11px;"
                                                  title="${setor.label}: ${dados.total} ocorrência(s)">
                                                <i class="fas ${setor.icon}"></i>
                                                ${setor.label}: ${dados.total}
                                            </span>`;
                                    }).join('')}
                                </div>

                                ${aluno.ultimaAtualizacao ? `
                                    <small class="text-muted d-block mt-2">
                                        <i class="far fa-clock"></i>
                                        Última: ${new Date(aluno.ultimaAtualizacao).toLocaleDateString('pt-BR')}
                                    </small>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

// ============================================
// FILTRAR POR SETOR (INCLUINDO BIBLIOTECA)
// ============================================
function filtrarPorSetor(setor) {
    __acompanhamentoFiltroSetor = setor;

    document.querySelectorAll('#resumoDiaCards .card-acompanhamento').forEach(card => {
        card.style.opacity = '0.5';
    });

    const cardMap = {
        'gestao': '.card-gestao',
        'assistente_social': '.card-as',
        'psicologia': '.card-psico',
        'supervisao': '.card-supervisao',
        'biblioteca': '.card-biblioteca'  // 🔥 NOVO
    };

    const cardSelecionado = document.querySelector(`#resumoDiaCards ${cardMap[setor]}`);
    if (cardSelecionado) cardSelecionado.style.opacity = '1';

    if (__acompanhamentoDados && __acompanhamentoDados.alunos) {
        renderizarListaAcompanhamentoCompartilhado(__acompanhamentoDados.alunos);
    } else {
        carregarAcompanhamento();
    }
}

// ============================================
// LIMPAR FILTROS
// ============================================
function limparFiltrosAcompanhamento() {
    __acompanhamentoFiltroSetor = 'todos';

    document.querySelectorAll('#resumoDiaCards .card-acompanhamento').forEach(card => {
        card.style.opacity = '1';
    });

    ['acompFiltroTurma', 'acompDataInicio', 'acompDataFim', 'acompBusca'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    carregarAcompanhamento();
}

// ============================================
// UTILITÁRIOS
// ============================================
function escapeHTMLCompartilhado(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function gerarAvatarSVGCompartilhado(nome) {
    const inicial = (nome || '?').charAt(0).toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#0ea5e9"/><stop offset="100%" stop-color="#0284c7"/></linearGradient></defs><circle cx="50" cy="50" r="50" fill="url(#g)"/><text x="50" y="50" font-family="Arial,sans-serif" font-size="45" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="central">${inicial}</text></svg>`;
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
}

// ============================================
// INICIALIZAR
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    const tabAcompanhamento = document.getElementById('acompanhamento-tab');
    if (tabAcompanhamento) {
        tabAcompanhamento.addEventListener('shown.bs.tab', () => {
            carregarAcompanhamento();
        });
    }
});

// ============================================
// EXPORTAR GLOBAIS
// ============================================
window.carregarAcompanhamento = carregarAcompanhamento;
window.filtrarPorSetor = filtrarPorSetor;
window.limparFiltrosAcompanhamento = limparFiltrosAcompanhamento;
window.carregarResumoDiaCompartilhado = carregarResumoDiaCompartilhado;