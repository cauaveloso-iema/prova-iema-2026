// ============================================================================
// ACOMPANHAMENTO COMPARTILHADO - FRONTEND (VERSÃO DEFINITIVA - LIMPA)
// Agrega dados de TODOS os setores (incluindo BIBLIOTECA)
// ✅ Listener à prova de falhas
// ✅ Cache de 60s
// 🚀 Timeout de 45s + Retry automático (Resolve o "Tempo Esgotado" no Render Free)
// ✅ Paginação de 10 por página
// ✅ Safety net contra spinner preso
// ============================================================================

(function() {
    'use strict';

    // Guarda contra dupla inicialização
    if (window.__ACOMP_INIT__) return;
    window.__ACOMP_INIT__ = true;

    // ============================================
    // ESTADO GLOBAL (exposto em window para debug)
    // ============================================
    window.__acompanhamentoDados = null;
    window.__acompanhamentoFiltroSetor = 'todos';
    window.__acompanhamentoCache = null;
    window.__acompanhamentoCacheTime = 0;
    const CACHE_TTL = 60 * 1000;

    window.__acompanhamentoPaginacao = {
        paginaAtual: 1,
        porPagina: 12,
        totalRegistros: 0,
        totalPaginas: 0,
        alunosFiltrados: []
    };

    // ============================================
    // 🚀 HELPER: FETCH COM TIMEOUT E RETRY
    // ============================================
    async function fetchComRetry(url, options = {}, timeoutMs = 45000, tentativas = 2) {
        for (let i = 1; i <= tentativas; i++) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

            try {
                const response = await fetch(url, { ...options, signal: controller.signal });
                clearTimeout(timeoutId);

                // Se o servidor estiver acordando (502, 503, 504), tenta de novo
                if (!response.ok && [502, 503, 504].includes(response.status)) {
                    throw new Error(`Servidor acordando (${response.status})`);
                }
                return response;
            } catch (error) {
                clearTimeout(timeoutId);
                const isLastTry = (i === tentativas);
                
                // Se for a última tentativa ou erro de lógica (404, 401), para.
                if (isLastTry || (error.message.includes('acordando') === false && error.name !== 'AbortError')) {
                    if (error.name === 'AbortError') throw new Error(`Tempo esgotado (${timeoutMs / 1000}s)`);
                    throw error;
                }
                
                // Se for a primeira tentativa e deu erro de rede/timeout, espera 3s e tenta de novo
                await new Promise(r => setTimeout(r, 3000));
            }
        }
    }

    // ============================================
    // CARREGAR ACOMPANHAMENTO
    // ============================================
    async function carregarAcompanhamento(forcarAtualizacao = false) {
        const container = document.getElementById('acompListaAlunos');
        if (!container) return;

        const token = localStorage.getItem('auth_token');
        if (!token) return;

        // Safety net: remove spinner forçado após 50s
        const safetyTimeout = setTimeout(() => {
            const c = document.getElementById('acompListaAlunos');
            if (c && c.querySelector('.spinner-border') && !c.querySelector('.card')) {
                c.innerHTML = `
                    <div class="alert alert-warning" style="border-radius:12px;">
                        <i class="fas fa-exclamation-triangle"></i>
                        <strong>Consulta demorou mais que o esperado</strong>
                        <p class="mb-2 mt-2" style="font-size:13px;">O servidor não respondeu em tempo hábil.</p>
                        <button class="btn btn-sm btn-warning" onclick="carregarAcompanhamento(true)">
                            <i class="fas fa-redo"></i> Tentar novamente
                        </button>
                    </div>`;
            }
        }, 50000);

        // Cache
        const agora = Date.now();
        if (!forcarAtualizacao && window.__acompanhamentoCache &&
            (agora - window.__acompanhamentoCacheTime) < CACHE_TTL) {
            clearTimeout(safetyTimeout);
            window.__acompanhamentoDados = window.__acompanhamentoCache.dados;
            renderizarListaAcompanhamentoCompartilhado(window.__acompanhamentoCache.dados.alunos);
            return;
        }

        // Loading
        container.innerHTML = `
            <div class="text-center py-5">
                <div class="spinner-border text-primary" role="status" style="width: 3rem; height: 3rem;"></div>
                <p class="text-muted mt-3 mb-1"><strong>Carregando acompanhamento...</strong></p>
                <small class="text-muted" id="acompLoadingStatus">Consultando todos os setores (pode levar até 45s)...</small>
            </div>`;

        const atualizarStatus = (msg) => {
            const el = document.getElementById('acompLoadingStatus');
            if (el) el.textContent = msg;
        };

        try {
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

            atualizarStatus('Buscando resumo e lista em paralelo...');

            const [resumoResult, listaResult] = await Promise.allSettled([
                fetchComRetry('/api/acompanhamento-compartilhado/resumo-dia', {
                    headers: { 'Authorization': `Bearer ${token}` }
                }, 45000).then(r => r.json()),

                fetchComRetry(`/api/acompanhamento-compartilhado/alunos?${params}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                }, 45000).then(r => r.json())
            ]);

            if (resumoResult.status === 'fulfilled' && resumoResult.value?.success) {
                const resumo = resumoResult.value.resumo;
                atualizarCardResumoCompartilhado('Gestao', resumo.gestao, 'motivos');
                atualizarCardResumoCompartilhado('AS', resumo.assistente_social, 'tipos');
                atualizarCardResumoCompartilhado('Psico', resumo.psicologia, 'tipos');
                atualizarCardResumoCompartilhado('Supervisao', resumo.supervisao, 'motivos');
                atualizarCardResumoCompartilhado('Biblioteca', resumo.biblioteca, 'motivos');
            }

            if (listaResult.status === 'rejected') {
                throw new Error(listaResult.reason?.message || 'Erro ao carregar lista');
            }

            const data = listaResult.value;
            if (!data.success) {
                throw new Error(data.error || 'Erro ao carregar');
            }

            atualizarStatus('Renderizando resultados...');
            window.__acompanhamentoDados = data;
            window.__acompanhamentoCache = { dados: data };
            window.__acompanhamentoCacheTime = Date.now();

            await popularFiltroTurmasCompartilhado();
            renderizarListaAcompanhamentoCompartilhado(data.alunos);

        } catch (error) {
            const isTimeout = error.message?.includes('Tempo esgotado')
                           || error.message?.includes('timeout')
                           || error.name === 'AbortError';

            container.innerHTML = `
                <div class="alert alert-${isTimeout ? 'warning' : 'danger'}" style="border-radius: 12px;">
                    <i class="fas fa-${isTimeout ? 'clock' : 'exclamation-triangle'}"></i>
                    <strong>${isTimeout ? 'A consulta demorou muito' : 'Erro ao carregar'}</strong>
                    <p class="mb-2 mt-2" style="font-size: 13px;">
                        ${isTimeout ? 'O banco de dados pode estar iniciando (Cold Start). Tente novamente.' : escapeHTMLCompartilhado(error.message)}
                    </p>
                    <div class="d-flex gap-2 flex-wrap">
                        <button class="btn btn-sm btn-outline-${isTimeout ? 'warning' : 'danger'}"
                                onclick="carregarAcompanhamento(true)">
                            <i class="fas fa-redo"></i> Tentar novamente
                        </button>
                        <button class="btn btn-sm btn-outline-secondary"
                                onclick="limparFiltrosAcompanhamento()">
                            <i class="fas fa-filter-circle-xmark"></i> Limpar filtros e tentar
                        </button>
                    </div>
                </div>`;
        } finally {
            clearTimeout(safetyTimeout);
        }
    }

    // ============================================
    // CARREGAR RESUMO (chamável isoladamente)
    // ============================================
    async function carregarResumoDiaCompartilhado() {
        const token = localStorage.getItem('auth_token');
        if (!token) return;

        try {
            const response = await fetchComRetry('/api/acompanhamento-compartilhado/resumo-dia', {
                headers: { 'Authorization': `Bearer ${token}` }
            }, 45000);

            const data = await response.json();
            if (!data.success) return;

            const resumo = data.resumo;
            atualizarCardResumoCompartilhado('Gestao', resumo.gestao, 'motivos');
            atualizarCardResumoCompartilhado('AS', resumo.assistente_social, 'tipos');
            atualizarCardResumoCompartilhado('Psico', resumo.psicologia, 'tipos');
            atualizarCardResumoCompartilhado('Supervisao', resumo.supervisao, 'motivos');
            atualizarCardResumoCompartilhado('Biblioteca', resumo.biblioteca, 'motivos');
        } catch (error) {
            // Silencioso para não sujar o console do usuário
        }
    }

    // ============================================
    // ATUALIZAR CARD
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
        if (!select || select.dataset.populado === 'true') return;

        const token = localStorage.getItem('auth_token');
        const valorAtual = select.value;

        try {
            const response = await fetchComRetry('/api/acompanhamento-compartilhado/turmas', {
                headers: { 'Authorization': `Bearer ${token}` }
            }, 15000);
            const data = await response.json();

            if (data.success && Array.isArray(data.turmas)) {
                select.innerHTML = '<option value="">Todas as turmas</option>';
                data.turmas.forEach(t => {
                    select.innerHTML += `<option value="${escapeHTMLCompartilhado(t)}">${escapeHTMLCompartilhado(t)}</option>`;
                });
                if (valorAtual) select.value = valorAtual;
                select.dataset.populado = 'true';
            }
        } catch (error) {
            // Silencioso
        }
    }

    // ============================================
    // RENDERIZAR LISTA (COM PAGINAÇÃO)
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
            window.__acompanhamentoPaginacao.totalRegistros = 0;
            window.__acompanhamentoPaginacao.totalPaginas = 0;
            return;
        }

        // Filtra por setor
        let alunosFiltrados = alunos;
        if (window.__acompanhamentoFiltroSetor !== 'todos') {
            alunosFiltrados = alunos.filter(a => {
                const setor = window.__acompanhamentoFiltroSetor;
                return a[setor] && a[setor].total > 0;
            });
        }

        if (alunosFiltrados.length === 0) {
            container.innerHTML = `
                <div class="text-center py-5">
                    <i class="fas fa-filter fa-3x text-muted mb-3"></i>
                    <p class="text-muted">Nenhum aluno no setor "${window.__acompanhamentoFiltroSetor}"</p>
                    <button class="btn btn-sm btn-outline-primary" onclick="limparFiltrosAcompanhamento()">
                        <i class="fas fa-times"></i> Limpar filtros
                    </button>
                </div>`;
            window.__acompanhamentoPaginacao.totalRegistros = 0;
            window.__acompanhamentoPaginacao.totalPaginas = 0;
            return;
        }

        // Salva no estado e calcula páginas
        const pag = window.__acompanhamentoPaginacao;
        pag.alunosFiltrados = alunosFiltrados;
        pag.totalRegistros = alunosFiltrados.length;
        pag.totalPaginas = Math.ceil(pag.totalRegistros / pag.porPagina);

        if (pag.paginaAtual > pag.totalPaginas) pag.paginaAtual = 1;
        if (pag.paginaAtual < 1) pag.paginaAtual = 1;

        const inicio = (pag.paginaAtual - 1) * pag.porPagina;
        const fim = inicio + pag.porPagina;
        const alunosDaPagina = alunosFiltrados.slice(inicio, fim);

        const setores = [
            { key: 'gestao', label: 'Atrasos', icon: 'fa-clock', color: '#3b82f6', bg: '#dbeafe' },
            { key: 'assistente_social', label: 'Assist. Social', icon: 'fa-hands-helping', color: '#10b981', bg: '#d1fae5' },
            { key: 'psicologia', label: 'Psicologia', icon: 'fa-brain', color: '#8b5cf6', bg: '#ede9fe' },
            { key: 'supervisao', label: 'Supervisão', icon: 'fa-shield-alt', color: '#1e3a8a', bg: '#dbeafe' },
            { key: 'biblioteca', label: 'Biblioteca', icon: 'fa-book', color: '#0ea5e9', bg: '#e0f2fe' }
        ];

        container.innerHTML = `
            <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                <h6 class="mb-0">
                    <i class="fas fa-users"></i>
                    ${alunosFiltrados.length} aluno(s) com ocorrências
                </h6>
                <div class="d-flex gap-2">
                    ${window.__acompanhamentoFiltroSetor !== 'todos' ? `
                        <button class="btn btn-sm btn-outline-secondary" onclick="limparFiltrosAcompanhamento()">
                            <i class="fas fa-times"></i> Limpar filtro de setor
                        </button>
                    ` : ''}
                    <button class="btn btn-sm btn-outline-primary" onclick="carregarAcompanhamento(true)">
                        <i class="fas fa-sync-alt"></i> Atualizar
                    </button>
                </div>
            </div>

            <div class="row g-3">
                ${alunosDaPagina.map(aluno => {
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

            ${renderizarPaginacaoAcompanhamento()}
        `;
    }

    // ============================================
    // RENDERIZAR CONTROLES DE PAGINAÇÃO
    // ============================================
    function renderizarPaginacaoAcompanhamento() {
        const pag = window.__acompanhamentoPaginacao;
        const { paginaAtual, totalPaginas, totalRegistros, porPagina } = pag;

        if (totalPaginas <= 1) {
            return `
                <div class="text-end mt-3 pt-3" style="border-top: 1px solid #e5e7eb;">
                    <small class="text-muted">
                        <i class="fas fa-info-circle"></i>
                        Mostrando <strong>${totalRegistros}</strong> de <strong>${totalRegistros}</strong> aluno(s)
                    </small>
                </div>
            `;
        }

        const maxBotoes = 5;
        let inicio = Math.max(1, paginaAtual - Math.floor(maxBotoes / 2));
        let fim = Math.min(totalPaginas, inicio + maxBotoes - 1);

        if (fim - inicio + 1 < maxBotoes) {
            inicio = Math.max(1, fim - maxBotoes + 1);
        }

        let botoes = '';

        botoes += paginaAtual > 1
            ? `<li class="page-item"><a class="page-link" href="#" onclick="event.preventDefault(); irParaPaginaAcompanhamento(1)" title="Primeira"><i class="fas fa-angle-double-left"></i></a></li>`
            : `<li class="page-item disabled"><span class="page-link"><i class="fas fa-angle-double-left"></i></span></li>`;

        botoes += paginaAtual > 1
            ? `<li class="page-item"><a class="page-link" href="#" onclick="event.preventDefault(); irParaPaginaAcompanhamento(${paginaAtual - 1})" title="Anterior"><i class="fas fa-angle-left"></i></a></li>`
            : `<li class="page-item disabled"><span class="page-link"><i class="fas fa-angle-left"></i></span></li>`;

        if (inicio > 1) {
            botoes += `<li class="page-item disabled"><span class="page-link">…</span></li>`;
        }

        for (let i = inicio; i <= fim; i++) {
            botoes += i === paginaAtual
                ? `<li class="page-item active"><span class="page-link">${i}</span></li>`
                : `<li class="page-item"><a class="page-link" href="#" onclick="event.preventDefault(); irParaPaginaAcompanhamento(${i})">${i}</a></li>`;
        }

        if (fim < totalPaginas) {
            botoes += `<li class="page-item disabled"><span class="page-link">…</span></li>`;
        }

        botoes += paginaAtual < totalPaginas
            ? `<li class="page-item"><a class="page-link" href="#" onclick="event.preventDefault(); irParaPaginaAcompanhamento(${paginaAtual + 1})" title="Próxima"><i class="fas fa-angle-right"></i></a></li>`
            : `<li class="page-item disabled"><span class="page-link"><i class="fas fa-angle-right"></i></span></li>`;

        botoes += paginaAtual < totalPaginas
            ? `<li class="page-item"><a class="page-link" href="#" onclick="event.preventDefault(); irParaPaginaAcompanhamento(${totalPaginas})" title="Última"><i class="fas fa-angle-double-right"></i></a></li>`
            : `<li class="page-item disabled"><span class="page-link"><i class="fas fa-angle-double-right"></i></span></li>`;

        const de = (paginaAtual - 1) * porPagina + 1;
        const ate = Math.min(paginaAtual * porPagina, totalRegistros);

        return `
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-top: 16px; padding-top: 12px; border-top: 1px solid #e5e7eb;">
                <small class="text-muted">
                    <i class="fas fa-info-circle"></i>
                    Mostrando <strong>${de}</strong>–<strong>${ate}</strong> de <strong>${totalRegistros}</strong> aluno(s)
                </small>
                <nav aria-label="Paginação do acompanhamento">
                    <ul class="pagination pagination-sm mb-0" style="gap: 2px;">
                        ${botoes}
                    </ul>
                </nav>
            </div>
        `;
    }

    // ============================================
    // IR PARA PÁGINA
    // ============================================
    function irParaPaginaAcompanhamento(pagina) {
        const pag = window.__acompanhamentoPaginacao;

        if (pagina < 1 || pagina > pag.totalPaginas) return;
        if (pagina === pag.paginaAtual) return;

        pag.paginaAtual = pagina;
        renderizarListaAcompanhamentoCompartilhado(pag.alunosFiltrados);

        const container = document.getElementById('acompListaAlunos');
        if (container) {
            container.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    // ============================================
    // FILTRAR POR SETOR
    // ============================================
    function filtrarPorSetor(setor) {
        window.__acompanhamentoFiltroSetor = setor;
        window.__acompanhamentoPaginacao.paginaAtual = 1;

        document.querySelectorAll('#resumoDiaCards .card-acompanhamento').forEach(card => {
            card.style.opacity = '0.5';
        });

        const cardMap = {
            'gestao': '.card-gestao',
            'assistente_social': '.card-as',
            'psicologia': '.card-psico',
            'supervisao': '.card-supervisao',
            'biblioteca': '.card-biblioteca'
        };

        const cardSelecionado = document.querySelector(`#resumoDiaCards ${cardMap[setor]}`);
        if (cardSelecionado) cardSelecionado.style.opacity = '1';

        if (window.__acompanhamentoDados && window.__acompanhamentoDados.alunos) {
            renderizarListaAcompanhamentoCompartilhado(window.__acompanhamentoDados.alunos);
        } else {
            carregarAcompanhamento();
        }
    }

    // ============================================
    // LIMPAR FILTROS
    // ============================================
    function limparFiltrosAcompanhamento() {
        window.__acompanhamentoFiltroSetor = 'todos';
        window.__acompanhamentoPaginacao.paginaAtual = 1;

        document.querySelectorAll('#resumoDiaCards .card-acompanhamento').forEach(card => {
            card.style.opacity = '1';
        });

        ['acompFiltroTurma', 'acompDataInicio', 'acompDataFim', 'acompBusca'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });

        window.__acompanhamentoCache = null;
        window.__acompanhamentoCacheTime = 0;

        carregarAcompanhamento(true);
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
    // REGISTRO DO LISTENER
    // ============================================
    function registrarListenerAba() {
        const tab = document.getElementById('acompanhamento-tab');
        if (!tab) {
            setTimeout(registrarListenerAba, 500);
            return;
        }

        if (tab.dataset.acompListener === 'true') return;
        tab.dataset.acompListener = 'true';

        tab.addEventListener('shown.bs.tab', () => {
            carregarAcompanhamento();
        });

        if (tab.classList.contains('active')) {
            setTimeout(() => carregarAcompanhamento(), 100);
        }
    }

    // ============================================
    // EXPORTAR GLOBAIS
    // ============================================
    window.carregarAcompanhamento = carregarAcompanhamento;
    window.filtrarPorSetor = filtrarPorSetor;
    window.limparFiltrosAcompanhamento = limparFiltrosAcompanhamento;
    window.carregarResumoDiaCompartilhado = carregarResumoDiaCompartilhado;
    window.irParaPaginaAcompanhamento = irParaPaginaAcompanhamento;
    window.renderizarPaginacaoAcompanhamento = renderizarPaginacaoAcompanhamento;

    // ============================================
    // INICIALIZAÇÃO
    // ============================================
    function inicializar() {
        registrarListenerAba();

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                registrarListenerAba();
            });
        }

        let tentativas = 0;
        const intervalo = setInterval(() => {
            tentativas++;
            const tab = document.getElementById('acompanhamento-tab');
            if (tab && tab.dataset.acompListener !== 'true') {
                registrarListenerAba();
            } else if (tab && tab.dataset.acompListener === 'true') {
                clearInterval(intervalo);
            }
            if (tentativas >= 10) {
                clearInterval(intervalo);
            }
        }, 500);
    }

    inicializar();
})();