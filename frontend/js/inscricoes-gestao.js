// ============================================================================
// public/js/inscricoes-gestao.js
// Módulo de Inscrições — renderiza o painel dentro do gestao-geral.html
// (controlado por botão, não por aba Bootstrap)
// ============================================================================
'use strict';

// ----------------------------------------------------------------------------
// PERFIL / PERMISSÕES (para esconder controles de admin)
// ----------------------------------------------------------------------------
function _getTokenPerfil() {
    try {
        if (window.CoreSecurity?.getToken) {
            const t = window.CoreSecurity.getToken();
            if (t) return t;
        }
    } catch (_) { }
    if (typeof window.getToken === 'function') {
        try { const t = window.getToken(); if (t) return t; } catch (_) { }
    }
    const chaves = ['auth_token', 'token', 'authToken', 'jwt', 'jwtToken', 'accessToken', 'userToken'];
    for (const s of [localStorage, sessionStorage]) {
        for (const k of chaves) {
            try { const v = s.getItem(k); if (v && v.split('.').length === 3) return v; } catch (_) { }
        }
    }
    return '';
}

function _normalizarRole(role) {
    if (!role) return '';
    return String(role)
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().trim()
        .replace(/\s+/g, '_')
        .replace(/-/g, '_')
        .replace(/_geral$/i, '')
        .replace(/^gestao_geral$/i, 'gestao');
}

function _getPerfil() {
    try {
        const t = _getTokenPerfil();
        if (!t || t.split('.').length !== 3) return null;
        const p = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        return { id: p.id || p._id, role: p.role || '', nome: p.nome || '' };
    } catch (_) { return null; }
}

function _isAdmin() {
    const role = _normalizarRole(_getPerfil()?.role);
    return role === 'admin' || role === 'super_admin';
}

/** Perfis que podem exportar CSV (admin + gestão) */
function _podeExportar() {
    const role = _normalizarRole(_getPerfil()?.role);
    return ['admin', 'super_admin', 'gestao'].includes(role);
}

/** Esconde elementos exclusivos de admin (abas, botões, painéis) */
function _esconderControlesAdmin() {
    if (_isAdmin()) return;

    // 1) Abas "Configurações"
    const seletoresAba = [
        '#aba-config', '#aba-configuracoes', '#aba-configuracao',
        '[data-tab="config"]', '[data-tab="configuracoes"]',
        '[data-bs-target="#tab-config"]', '[data-bs-target="#tab-configuracoes"]',
        '[data-bs-target="#tab-configuracao"]',
        '[href="#tab-config"]', '[href="#tab-configuracoes"]'
    ];
    seletoresAba.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => {
            const li = el.closest('li.nav-item') || el;
            li.style.display = 'none';
            li.setAttribute('aria-hidden', 'true');
        });
    });

    // 2) Fallback: qualquer botão/aba cujo texto contenha "Configura"
    document.querySelectorAll('.nav-tabs .nav-link, .adm-tab').forEach(el => {
        const txt = (el.textContent || '').toLowerCase();
        if (txt.includes('configura')) {
            const li = el.closest('li.nav-item') || el;
            li.style.display = 'none';
            li.setAttribute('aria-hidden', 'true');
        }
    });

    // 3) Painéis de configuração
    ['#tab-config', '#tab-configuracoes', '#tab-configuracao', '#panel-config', '#panel-configuracoes'].forEach(sel => {
        const p = document.querySelector(sel);
        if (p) {
            p.classList.remove('active', 'show');
            p.style.display = 'none';
            p.setAttribute('aria-hidden', 'true');
        }
    });

    // 4) Exclusão (só admin)
    document.querySelectorAll('[data-acao="excluir"]').forEach(el => el.style.display = 'none');

    // 5) Exportar CSV só esconde se NÃO for admin nem gestão
    if (!_podeExportar()) {
        ['#btn-exportar', '#btnExportarCSV', '#inscBtnExportar', '[data-acao="exportar"]'].forEach(sel => {
            document.querySelectorAll(sel).forEach(el => {
                el.style.display = 'none';
                el.setAttribute('aria-hidden', 'true');
            });
        });
    }

    console.log('🛡️ [Inscrições] Controles de admin ocultados para perfil:', _getPerfil()?.role);
}

(function () {
    const API = '/api/inscricoes';
    let token = null;
    let paginaAtual = 1;
    let totalPaginas = 1;
    let totalRegistros = 0;
    const limitePorPagina = 20;
    let opcoes = {};
    let periodo = null;
    let inscricaoEditando = null;
    let renderizado = false;
    let carregando = false;

    // ------------------------------------------------------------------------
    // TOKEN
    // ------------------------------------------------------------------------
    function getToken() {
        if (token) return token;

        try {
            if (window.CoreSecurity?.getToken) {
                const t = window.CoreSecurity.getToken();
                if (t) { token = t; return token; }
            }
            if (typeof window.getToken === 'function') {
                const t = window.getToken();
                if (t) { token = t; return token; }
            }
        } catch (_) { }

        const chaves = [
            'auth_token', 'token', 'authToken', 'jwt', 'jwtToken',
            'accessToken', 'access_token', 'userToken', 'bearerToken'
        ];
        for (const storage of [localStorage, sessionStorage]) {
            for (const chave of chaves) {
                try {
                    const v = storage.getItem(chave);
                    if (v && typeof v === 'string' && v.split('.').length === 3) {
                        token = v;
                        return token;
                    }
                } catch (_) { }
            }
        }
        return '';
    }

    function invalidarToken() { token = null; }

    // ------------------------------------------------------------------------
    // API WRAPPER
    // ------------------------------------------------------------------------
    async function api(path, opts = {}) {
        const tk = getToken();
        if (!tk) {
            const erro = new Error('Sessão expirada. Faça login novamente.');
            erro.code = 'NO_TOKEN';
            throw erro;
        }

        const r = await fetch(API + path, {
            ...opts,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + tk,
                ...(opts.headers || {})
            }
        });

        const data = await r.json().catch(() => ({}));

        if (r.status === 401) {
            invalidarToken();
            if (data?.precisaLogin) {
                try { localStorage.removeItem('auth_token'); localStorage.removeItem('token'); } catch (_) { }
                if (typeof window.logout === 'function') window.logout();
                else setTimeout(() => { window.location.href = '/login.html'; }, 1500);
            }
            throw new Error(data.error || 'Sessão expirada.');
        }

        if (r.status === 403) {
            const err = new Error(data.error || 'Seu perfil não tem permissão para esta ação.');
            err.status = 403;
            throw err;
        }

        if (!r.ok) throw new Error(data.error || 'Erro na requisição');
        return data;
    }

    // ------------------------------------------------------------------------
    // PERÍODO DE INSCRIÇÕES
    // ------------------------------------------------------------------------
    function _formatarDataBR(iso) {
        if (!iso) return '—';
        try {
            const d = new Date(iso);
            if (isNaN(d.getTime())) return '—';
            return d.toLocaleDateString('pt-BR');
        } catch (_) { return '—'; }
    }

    async function carregarPeriodo() {
        if (periodo) return periodo;
        try {
            const data = await api('/periodo');
            periodo = data.periodo || data;
        } catch (e) {
            console.warn('[InscriçõesGestao] período (usando fallback fixo):', e.message);
            periodo = {
                anoLetivo: 2026,
                dataAbertura: '2026-11-19',
                dataFechamento: '2027-01-19',
                abertas: true
            };
        }
        return periodo;
    }

    function _renderPainelPeriodo() {
        const p = periodo || {};
        const ano = p.anoLetivo || new Date().getFullYear();
        const abertura = _formatarDataBR(p.dataAbertura);
        const fechamento = _formatarDataBR(p.dataFechamento);
        const abertas = p.abertas !== false;
        const badgeClass = abertas ? 'bg-success' : 'bg-secondary';
        const badgeIcon = abertas ? 'fa-circle-check' : 'fa-circle-xmark';
        const badgeTxt = abertas ? 'Inscrições abertas' : 'Inscrições encerradas';

        return `
            <div class="card mb-3 border-success">
                <div class="card-body py-3">
                    <div class="row g-2 align-items-center">
                        <div class="col-md-3">
                            <small class="text-muted d-block">Ano letivo</small>
                            <strong class="fs-5">${ano}</strong>
                        </div>
                        <div class="col-md-4">
                            <small class="text-muted d-block">Período de inscrições</small>
                            <strong>${abertura} a ${fechamento}</strong>
                        </div>
                        <div class="col-md-3">
                            <small class="text-muted d-block">Status</small>
                            <span class="badge ${badgeClass}">
                                <i class="fas ${badgeIcon} me-1"></i> ${badgeTxt}
                            </span>
                        </div>
                        <div class="col-md-2 text-end">
                            <button class="btn btn-outline-success btn-sm w-100"
                                    onclick="InscricoesGestao.atualizar()">
                                <i class="fas fa-sync-alt"></i> Atualizar
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // ------------------------------------------------------------------------
    // RENDER DA TELA (só uma vez)
    // ------------------------------------------------------------------------
    function renderAba() {
        const container = document.getElementById('tab-inscricoes');
        if (!container) return false;
        if (renderizado && container.querySelector('#inscTabela')) return true;

        container.innerHTML = `
            <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                <h5 class="mb-0"><i class="fas fa-file-signature me-2"></i> Inscrições</h5>
                <div class="d-flex gap-2 flex-wrap">
                    <button class="btn btn-outline-success btn-sm" id="inscBtnExportar"
                            onclick="InscricoesGestao.exportarCSV()">
                        <i class="fas fa-file-excel"></i> Exportar Excel
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="InscricoesGestao.fecharInscricoes()">
                        <i class="fas fa-arrow-left"></i> Voltar
                    </button>
                    <button class="btn btn-success btn-sm" onclick="InscricoesGestao.atualizar()">
                        <i class="fas fa-sync-alt"></i> Atualizar
                    </button>
                </div>
            </div>

            <div id="inscPainelPeriodo">${_renderPainelPeriodo()}</div>

            <div class="row g-3 mb-4">
                <div class="col-6 col-md-3"><div class="card text-center p-3"><div class="fs-3 fw-bold text-primary" id="inscTotal">-</div><small>Total</small></div></div>
                <div class="col-6 col-md-3"><div class="card text-center p-3"><div class="fs-3 fw-bold text-warning" id="inscPendentes">-</div><small>Pendentes</small></div></div>
                <div class="col-6 col-md-3"><div class="card text-center p-3"><div class="fs-3 fw-bold text-info" id="inscAnalise">-</div><small>Em análise</small></div></div>
                <div class="col-6 col-md-3"><div class="card text-center p-3"><div class="fs-3 fw-bold text-success" id="inscAprovadas">-</div><small>Aprovadas</small></div></div>
            </div>

            <div class="card mb-3">
                <div class="card-body">
                    <div class="row g-2">
                        <div class="col-md-4">
                            <input type="text" id="inscBusca" class="form-control form-control-sm" placeholder="Buscar por nome, CPF, protocolo...">
                        </div>
                        <div class="col-md-3">
                            <select id="inscFiltroStatus" class="form-select form-select-sm">
                                <option value="">Todos os status</option>
                            </select>
                        </div>
                        <div class="col-md-3">
                            <select id="inscFiltroAno" class="form-select form-select-sm">
                                <option value="">Todos os anos</option>
                            </select>
                        </div>
                        <div class="col-md-2">
                            <button class="btn btn-primary btn-sm w-100" onclick="InscricoesGestao.buscar()">
                                <i class="fas fa-search"></i> Buscar
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="card">
                <div class="card-body">
                    <div class="table-responsive">
                        <table class="table table-hover table-sm align-middle">
                            <thead>
                                <tr>
                                    <th>Protocolo</th>
                                    <th>Aluno</th>
                                    <th>Responsável</th>
                                    <th>Bairro</th>
                                    <th>Status</th>
                                    <th>Data</th>
                                    <th>Ações</th>
                                </tr>
                            </thead>
                            <tbody id="inscTabela">
                                <tr><td colspan="7" class="text-center py-4"><div class="spinner-border spinner-border-sm"></div> Carregando...</td></tr>
                            </tbody>
                        </table>
                    </div>
                    <div class="d-flex justify-content-between align-items-center mt-3 flex-wrap gap-2">
                        <small class="text-muted" id="inscInfo"></small>
                        <nav>
                            <ul class="pagination pagination-sm mb-0" id="inscPaginacao"></ul>
                        </nav>
                    </div>
                </div>
            </div>

            <div class="modal fade" id="modalInscricao" tabindex="-1">
                <div class="modal-dialog modal-xl modal-dialog-scrollable">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title"><i class="fas fa-file-signature me-2"></i> <span id="modalInscTitulo">Inscrição</span></h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body" id="modalInscBody">
                            <div class="text-center py-4"><div class="spinner-border"></div></div>
                        </div>
                        <div class="modal-footer">
                            <button class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>
                            <button class="btn btn-primary" onclick="InscricoesGestao.salvar()" id="btnSalvarInsc">
                                <i class="fas fa-save"></i> Salvar
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const busca = document.getElementById('inscBusca');
        if (busca) busca.addEventListener('keydown', e => { if (e.key === 'Enter') InscricoesGestao.buscar(); });

        renderizado = true;
        return true;
    }

    // ------------------------------------------------------------------------
    // OPÇÕES
    // ------------------------------------------------------------------------
    async function carregarOpcoes() {
        try {
            const data = await api('/admin/opcoes');
            opcoes = data.opcoes || {};

            const selStatus = document.getElementById('inscFiltroStatus');
            if (selStatus) {
                const atual = selStatus.value;
                selStatus.innerHTML = '<option value="">Todos os status</option>' +
                    (opcoes.status || []).map(s => `<option value="${s}">${s}</option>`).join('');
                selStatus.value = atual;
            }

            const selAno = document.getElementById('inscFiltroAno');
            if (selAno) {
                const atual = selAno.value;
                selAno.innerHTML = '<option value="">Todos os anos</option>' +
                    (opcoes.anosLetivos || []).map(a => `<option value="${a}">${a}</option>`).join('');
                selAno.value = atual;
            }
        } catch (e) {
            console.warn('[InscriçõesGestao] opções:', e.message);
        }
    }

    // ------------------------------------------------------------------------
    // DASHBOARD
    // ------------------------------------------------------------------------
    async function carregarDashboard() {
        try {
            const data = await api('/admin/dashboard');
            const r = data.resumo || {};
            const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v ?? 0; };
            set('inscTotal', r.total);
            set('inscPendentes', r.pendentes);
            set('inscAnalise', r.emAnalise);
            set('inscAprovadas', r.aprovadas);
        } catch (e) {
            console.warn('[InscriçõesGestao] dashboard:', e.message);
        }
    }

    // ------------------------------------------------------------------------
    // LISTA
    // ------------------------------------------------------------------------
    async function carregarLista() {
        const tbody = document.getElementById('inscTabela');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4"><div class="spinner-border spinner-border-sm"></div> Carregando...</td></tr>';

        try {
            const params = new URLSearchParams();
            params.set('pagina', paginaAtual);
            params.set('limite', limitePorPagina);
            const busca = document.getElementById('inscBusca')?.value?.trim();
            const status = document.getElementById('inscFiltroStatus')?.value;
            const ano = document.getElementById('inscFiltroAno')?.value;
            if (busca) params.set('busca', busca);
            if (status) params.set('status', status);
            if (ano) params.set('anoLetivo', ano);

            const data = await api('/admin?' + params.toString());
            totalPaginas = data.paginacao?.totalPaginas || 1;
            totalRegistros = data.paginacao?.total || 0;
            const lista = data.inscricoes || [];

            if (!lista.length) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">Nenhuma inscrição encontrada.</td></tr>';
            } else {
                const cor = (s) => ({
                    'Pendente': 'warning', 'Em análise': 'info',
                    'Aprovada': 'success', 'Concluída': 'primary', 'Cancelada': 'danger'
                }[s] || 'secondary');

                tbody.innerHTML = lista.map(i => `
                    <tr>
                        <td><code>${i.protocolo}</code></td>
                        <td>${i.aluno || ''}</td>
                        <td>${i.responsavel || ''}</td>
                        <td>${i.bairro || ''}${i.cidade ? ' / ' + i.cidade : ''}</td>
                        <td><span class="badge bg-${cor(i.status)}">${i.status}</span></td>
                        <td><small>${new Date(i.createdAt).toLocaleDateString('pt-BR')}</small></td>
                        <td>
                            <button class="btn btn-sm btn-outline-primary" onclick="InscricoesGestao.abrirDetalhe('${i._id}')" title="Ver/Editar">
                                <i class="fas fa-edit"></i>
                            </button>
                        </td>
                    </tr>
                `).join('');
            }

            renderPaginacao();
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-danger">Erro: ${e.message}</td></tr>`;
            renderPaginacao();
        }
    }

    // ------------------------------------------------------------------------
    // PAGINAÇÃO (completa, com números e limites)
    // ------------------------------------------------------------------------
    function renderPaginacao() {
        const infoEl = document.getElementById('inscInfo');
        const pagEl = document.getElementById('inscPaginacao');
        if (!infoEl || !pagEl) return;

        if (totalRegistros === 0) {
            infoEl.textContent = 'Nenhum registro';
            pagEl.innerHTML = '';
            return;
        }

        const inicio = (paginaAtual - 1) * limitePorPagina + 1;
        const fim = Math.min(paginaAtual * limitePorPagina, totalRegistros);
        infoEl.textContent = `Exibindo ${inicio}–${fim} de ${totalRegistros} registro(s) • Página ${paginaAtual} de ${totalPaginas}`;

        const itens = [];

        itens.push(`
            <li class="page-item ${paginaAtual === 1 ? 'disabled' : ''}">
                <button class="page-link" data-pagina="${paginaAtual - 1}" ${paginaAtual === 1 ? 'disabled' : ''}>
                    <i class="fas fa-chevron-left"></i>
                </button>
            </li>
        `);

        const janela = 2;
        let ultimoRenderizado = 0;
        for (let p = 1; p <= totalPaginas; p++) {
            const mostrar = p === 1 || p === totalPaginas || (p >= paginaAtual - janela && p <= paginaAtual + janela);
            if (mostrar) {
                itens.push(`
                    <li class="page-item ${p === paginaAtual ? 'active' : ''}">
                        <button class="page-link" data-pagina="${p}">${p}</button>
                    </li>
                `);
                ultimoRenderizado = p;
            } else if (p === ultimoRenderizado + 1) {
                itens.push(`<li class="page-item disabled"><span class="page-link">…</span></li>`);
            }
        }

        itens.push(`
            <li class="page-item ${paginaAtual === totalPaginas ? 'disabled' : ''}">
                <button class="page-link" data-pagina="${paginaAtual + 1}" ${paginaAtual === totalPaginas ? 'disabled' : ''}>
                    <i class="fas fa-chevron-right"></i>
                </button>
            </li>
        `);

        pagEl.innerHTML = itens.join('');

        pagEl.querySelectorAll('[data-pagina]').forEach(btn => {
            btn.addEventListener('click', () => {
                const p = Number(btn.dataset.pagina);
                if (!p || p < 1 || p > totalPaginas || p === paginaAtual) return;
                paginaAtual = p;
                carregarLista();
                document.getElementById('tab-inscricoes')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        });
    }

    // ------------------------------------------------------------------------
    // DETALHE / EDIÇÃO
    // ------------------------------------------------------------------------
    async function abrirDetalhe(id) {
        inscricaoEditando = id;
        const body = document.getElementById('modalInscBody');
        const titulo = document.getElementById('modalInscTitulo');
        if (!body) return;
        body.innerHTML = '<div class="text-center py-4"><div class="spinner-border"></div></div>';

        const modalEl = document.getElementById('modalInscricao');
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();

        try {
            const data = await api('/admin/' + id);
            const i = data.inscricao;
            titulo.textContent = i.protocolo + ' — ' + (i.aluno?.nomeCompleto || '');

            body.innerHTML = `
                <ul class="nav nav-tabs mb-3" role="tablist">
                    <li class="nav-item"><button class="nav-link active" data-bs-toggle="tab" data-bs-target="#inscTabAluno" type="button">Aluno</button></li>
                    <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#inscTabResp" type="button">Responsável</button></li>
                    <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#inscTabEnd" type="button">Endereço</button></li>
                    <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#inscTabSocial" type="button">Social</button></li>
                    <li class="nav-item"><button class="nav-link" data-bs-toggle="tab" data-bs-target="#inscTabAdmin" type="button">Status/Obs</button></li>
                </ul>
                <div class="tab-content">
                    <div class="tab-pane fade show active" id="inscTabAluno">${renderCampos('aluno', i.aluno)}</div>
                    <div class="tab-pane fade" id="inscTabResp">${renderCampos('responsavel', i.responsavel)}</div>
                    <div class="tab-pane fade" id="inscTabEnd">${renderCampos('endereco', i.endereco)}</div>
                    <div class="tab-pane fade" id="inscTabSocial">${renderSocial(i)}</div>
                    <div class="tab-pane fade" id="inscTabAdmin">
                        <div class="mb-3">
                            <label class="form-label">Status</label>
                            <select class="form-select" id="editStatus">
                                ${(opcoes.status || []).map(s => `<option value="${s}" ${s === i.status ? 'selected' : ''}>${s}</option>`).join('')}
                            </select>
                        </div>
                        <div class="mb-3">
                            <label class="form-label">Observações administrativas</label>
                            <textarea class="form-control" id="editObservacoes" rows="4">${i.observacoesAdmin || ''}</textarea>
                        </div>
                    </div>
                </div>
            `;
        } catch (e) {
            body.innerHTML = `<div class="alert alert-danger">Erro: ${e.message}</div>`;
        }
    }

    function renderCampos(grupo, dados = {}) {
        const campos = {
            aluno: [
                ['nomeCompleto', 'Nome completo', 'text'],
                ['dataNascimento', 'Data de nascimento', 'date'],
                ['cpf', 'CPF', 'text'],
                ['rg', 'RG', 'text'],
                ['email', 'E-mail', 'email'],
                ['telefone', 'Telefone', 'text'],
                ['sexo', 'Sexo', 'text']
            ],
            responsavel: [
                ['nomeCompleto', 'Nome completo', 'text'],
                ['dataNascimento', 'Data de nascimento', 'date'],
                ['cpf', 'CPF', 'text'],
                ['rg', 'RG', 'text'],
                ['email', 'E-mail', 'email'],
                ['telefone', 'Telefone', 'text'],
                ['grauParentesco', 'Grau de parentesco', 'text'],
                ['sexo', 'Sexo', 'text']
            ],
            endereco: [
                ['cep', 'CEP', 'text'],
                ['logradouro', 'Logradouro', 'text'],
                ['numero', 'Número', 'text'],
                ['complemento', 'Complemento', 'text'],
                ['bairro', 'Bairro', 'text'],
                ['cidade', 'Cidade', 'text'],
                ['estado', 'UF', 'text']
            ]
        }[grupo] || [];

        return campos.map(([campo, label, tipo]) => {
            let valor = dados?.[campo] ?? '';
            if (campo === 'dataNascimento' && valor) valor = String(valor).slice(0, 10);
            return `
                <div class="mb-3">
                    <label class="form-label">${label}</label>
                    <input type="${tipo}" class="form-control" data-grupo="${grupo}" data-campo="${campo}" value="${valor}">
                </div>
            `;
        }).join('');
    }

    function renderSocial(i) {
        const c = i.composicaoFamiliar || {};
        const rf = i.rendaFamiliar || {};
        const ia = i.informacoesAdicionais || {};

        return `
            <div class="row g-3">
                <div class="col-md-4"><label class="form-label">Pessoas na residência</label>
                    <input type="number" class="form-control" data-grupo="composicaoFamiliar" data-campo="pessoasResidem" value="${c.pessoasResidem ?? ''}"></div>
                <div class="col-md-4"><label class="form-label">Dependentes menores</label>
                    <input type="number" class="form-control" data-grupo="composicaoFamiliar" data-campo="dependentesMenores" value="${c.dependentesMenores ?? ''}"></div>
                <div class="col-md-4"><label class="form-label">Faixa de renda</label>
                    <input type="text" class="form-control" data-grupo="rendaFamiliar" data-campo="faixaRenda" value="${rf.faixaRenda ?? ''}"></div>
                <div class="col-md-6"><label class="form-label">Escolaridade pai</label>
                    <input type="text" class="form-control" data-grupo="composicaoFamiliar" data-campo="escolaridadePai" value="${c.escolaridadePai ?? ''}"></div>
                <div class="col-md-6"><label class="form-label">Escolaridade mãe</label>
                    <input type="text" class="form-control" data-grupo="composicaoFamiliar" data-campo="escolaridadeMae" value="${c.escolaridadeMae ?? ''}"></div>
                <div class="col-12"><label class="form-label">Programas sociais</label>
                    <input type="text" class="form-control" data-grupo="rendaFamiliar" data-campo="programasSociais" value="${(rf.programasSociais || []).join(', ')}"></div>
                <div class="col-12"><label class="form-label">Deficiência</label>
                    <input type="text" class="form-control" data-grupo="informacoesAdicionais" data-campo="deficienciaQual" value="${ia.deficienciaQual ?? ''}"></div>
                <div class="col-md-6"><label class="form-label">Possui deficiência</label>
                    <select class="form-select" data-grupo="informacoesAdicionais" data-campo="possuiDeficiencia">
                        <option value="false" ${!ia.possuiDeficiencia ? 'selected' : ''}>Não</option>
                        <option value="true" ${ia.possuiDeficiencia ? 'selected' : ''}>Sim</option>
                    </select></div>
                <div class="col-md-6"><label class="form-label">Acesso a dispositivos</label>
                    <select class="form-select" data-grupo="informacoesAdicionais" data-campo="acessoDispositivos">
                        <option value="false" ${!ia.acessoDispositivos ? 'selected' : ''}>Não</option>
                        <option value="true" ${ia.acessoDispositivos ? 'selected' : ''}>Sim</option>
                    </select></div>
            </div>
        `;
    }

    async function salvar() {
        if (!inscricaoEditando) return;
        const btn = document.getElementById('btnSalvarInsc');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

        try {
            const dados = {};
            document.querySelectorAll('#modalInscBody [data-grupo][data-campo]').forEach(el => {
                const g = el.dataset.grupo, c = el.dataset.campo;
                if (!dados[g]) dados[g] = {};
                let v = el.value;
                if (v === 'true') v = true;
                else if (v === 'false') v = false;
                else if (c === 'programasSociais') v = v.split(',').map(s => s.trim()).filter(Boolean);
                dados[g][c] = v;
            });

            await api('/admin/' + inscricaoEditando, {
                method: 'PUT',
                body: JSON.stringify({
                    status: document.getElementById('editStatus')?.value,
                    observacoesAdmin: document.getElementById('editObservacoes')?.value,
                    dados
                })
            });

            alert('Inscrição atualizada com sucesso!');
            bootstrap.Modal.getInstance(document.getElementById('modalInscricao'))?.hide();
            carregarLista();
            carregarDashboard();
        } catch (e) {
            alert('Erro ao salvar: ' + e.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> Salvar';
        }
    }

    // ------------------------------------------------------------------------
    // EXPORTAR CSV (admin + gestão)
    // ------------------------------------------------------------------------
    async function exportarCSV() {
        if (!_podeExportar()) {
            alert('Seu perfil não tem permissão para exportar os dados completos.');
            return;
        }

        const btn = document.getElementById('inscBtnExportar');
        const original = btn ? btn.innerHTML : '';

        try {
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';
            }

            const params = new URLSearchParams();
            const busca = document.getElementById('inscBusca')?.value?.trim();
            const status = document.getElementById('inscFiltroStatus')?.value;
            const ano = document.getElementById('inscFiltroAno')?.value;
            if (busca) params.set('busca', busca);
            if (status) params.set('status', status);
            if (ano) params.set('anoLetivo', ano);

            const tk = getToken();
            const resp = await fetch(API + '/admin/exportar?' + params.toString(), {
                headers: tk ? { 'Authorization': 'Bearer ' + tk } : {}
            });

            if (!resp.ok) {
                const data = await resp.json().catch(() => ({}));
                throw new Error(data.error || 'Não foi possível exportar.');
            }

            const blob = await resp.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `inscricoes-${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (e) {
            alert('Erro ao exportar: ' + e.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = original;
            }
        }
    }

    // ------------------------------------------------------------------------
    // NAVEGAÇÃO
    // ------------------------------------------------------------------------
    function buscar() { paginaAtual = 1; carregarLista(); }
    function paginaAnterior() { if (paginaAtual > 1) { paginaAtual--; carregarLista(); } }
    function proximaPagina() { if (paginaAtual < totalPaginas) { paginaAtual++; carregarLista(); } }

    // ------------------------------------------------------------------------
    // ATUALIZAR
    // ------------------------------------------------------------------------
    async function atualizar() {
        if (carregando) return;
        carregando = true;
        try {
            if (!renderizado) renderAba();
            await carregarPeriodo();
            const painel = document.getElementById('inscPainelPeriodo');
            if (painel) painel.innerHTML = _renderPainelPeriodo();
            await carregarOpcoes();
            await carregarDashboard();
            await carregarLista();
            _esconderControlesAdmin();
        } finally {
            carregando = false;
        }
    }

    // ------------------------------------------------------------------------
    // ABRIR / FECHAR INSCRIÇÕES (controlado por botão, não por aba)
    // ------------------------------------------------------------------------
    function abrirModalOuAba() {
        try {
            document.querySelectorAll('.tab-content > .tab-pane').forEach(p => {
                p.classList.remove('active', 'show');
            });
            document.querySelectorAll('.nav-tabs .nav-link').forEach(b => {
                b.classList.remove('active');
            });

            const tabContent = document.querySelector('.tab-content');
            if (tabContent) tabContent.style.display = 'none';

            const container = document.getElementById('tab-inscricoes');
            if (container) {
                container.style.display = 'block';
                container.classList.add('active', 'show');
            }

            container?.scrollIntoView({ behavior: 'smooth', block: 'start' });

            renderAba();
            atualizar();
            _esconderControlesAdmin();
        } catch (e) {
            console.error('[InscriçõesGestao] abrirModalOuAba:', e);
        }
    }

    function fecharInscricoes() {
        const container = document.getElementById('tab-inscricoes');
        if (container) {
            container.style.display = 'none';
            container.classList.remove('active', 'show');
        }
        const tabContent = document.querySelector('.tab-content');
        if (tabContent) tabContent.style.display = '';
        document.getElementById('aba-rodizios')?.click();
    }

    function abrirAba() { abrirModalOuAba(); }

    // ------------------------------------------------------------------------
    // EXPOSIÇÃO
    // ------------------------------------------------------------------------
    window.InscricoesGestao = {
        getToken, invalidarToken,
        abrirAba, abrirModalOuAba, fecharInscricoes,
        atualizar, buscar,
        paginaAnterior, proximaPagina,
        abrirDetalhe, salvar,
        exportarCSV,
        get inicializado() { return renderizado; }
    };

    function tentarInit() {
        const container = document.getElementById('tab-inscricoes');
        if (container) {
            _esconderControlesAdmin();
        } else {
            setTimeout(tentarInit, 300);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tentarInit);
    } else {
        tentarInit();
    }

})();