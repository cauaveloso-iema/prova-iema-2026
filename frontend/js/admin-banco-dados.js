// ============================================================================
// MÓDULO BANCO DE DADOS - ADMIN
// ============================================================================
(function() {
    'use strict';
    console.log('🗄️ Módulo Banco de Dados inicializado');

    const state = {
        colecaoAtual: null,
        modulos: [],
        registros: [],
        campos: [],
        filtros: { search: '', dataInicio: '', dataFim: '' },
        paginacao: { page: 1, limit: 20, total: 0, pages: 0 },
        carregando: false,
        camposVisiveis: [],
        modoTodosCampos: false,
        _searchTimeout: null
    };

    // =====================================================================
    // API HELPER
    // =====================================================================
    async function api(endpoint, options = {}) {
        const token = localStorage.getItem('auth_token');
        const config = {
            ...options,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                ...options.headers
            }
        };
        const response = await fetch(`/api/admin/banco-dados${endpoint}`, config);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Erro na requisição');
        return data;
    }

    // =====================================================================
    // RENDERIZAÇÃO PRINCIPAL
    // =====================================================================
    function renderizar() {
        const container = document.getElementById('bancoDadosContent');
        if (!container) return;

        container.innerHTML = `
            <div class="bd-container">
                <div class="bd-header">
                    <div class="bd-header-left">
                        <div class="bd-header-icon"><i class="fas fa-database"></i></div>
                        <div class="bd-header-text">
                            <h1>Gerenciamento do Banco de Dados</h1>
                            <p>Visualize, gerencie e exclua dados de todos os módulos do sistema</p>
                        </div>
                    </div>
                    <div class="bd-header-actions">
                        <button class="bd-btn bd-btn-secondary" onclick="BancoDados.abrirModalGerenciarModulos()">
                            <i class="fas fa-cubes"></i> Módulos
                        </button>
                        <button class="bd-btn bd-btn-secondary" onclick="BancoDados.atualizarTudo()">
                            <i class="fas fa-sync-alt"></i> Atualizar
                        </button>
                    </div>
                </div>

                <div id="bdResumoEstatisticas" class="bd-resumo">
                    <div class="bd-loading-inline"><i class="fas fa-spinner fa-spin"></i> Carregando...</div>
                </div>

                <div class="bd-layout">
                    <aside class="bd-sidebar-modulos">
                        <div class="bd-sidebar-header">
                            <i class="fas fa-layer-group"></i>
                            <span>Módulos</span>
                        </div>
                        <div id="bdListaModulos" class="bd-lista-modulos">
                            <div class="bd-loading-inline"><i class="fas fa-spinner fa-spin"></i> Carregando módulos...</div>
                        </div>
                    </aside>

                    <main class="bd-main-content">
                        <div id="bdAreaPrincipal">
                            <div class="bd-empty-state">
                                <div class="bd-empty-icon"><i class="fas fa-hand-point-left"></i></div>
                                <h4>Selecione uma coleção</h4>
                                <p>Escolha uma coleção na barra lateral para visualizar e gerenciar os dados</p>
                            </div>
                        </div>
                    </main>
                </div>
            </div>
        `;

        carregarModulos();
        carregarResumo();
    }

    // =====================================================================
    // CARREGAR RESUMO
    // =====================================================================
    async function carregarResumo() {
        try {
            const data = await api('/estatisticas');
            const el = document.getElementById('bdResumoEstatisticas');
            if (!el) return;

            const { totalColecoes, totalRegistros, tamanhoBanco } = data.estatisticas;

            el.innerHTML = `
                <div class="bd-resumo-card">
                    <div class="bd-resumo-icon" style="background: linear-gradient(135deg, #3b82f6, #2563eb);">
                        <i class="fas fa-layer-group"></i>
                    </div>
                    <div class="bd-resumo-info">
                        <span class="bd-resumo-label">Coleções</span>
                        <span class="bd-resumo-value">${totalColecoes}</span>
                    </div>
                </div>
                <div class="bd-resumo-card">
                    <div class="bd-resumo-icon" style="background: linear-gradient(135deg, #10b981, #059669);">
                        <i class="fas fa-database"></i>
                    </div>
                    <div class="bd-resumo-info">
                        <span class="bd-resumo-label">Total de Registros</span>
                        <span class="bd-resumo-value">${totalRegistros.toLocaleString('pt-BR')}</span>
                    </div>
                </div>
                <div class="bd-resumo-card">
                    <div class="bd-resumo-icon" style="background: linear-gradient(135deg, #f59e0b, #d97706);">
                        <i class="fas fa-hdd"></i>
                    </div>
                    <div class="bd-resumo-info">
                        <span class="bd-resumo-label">Tamanho do Banco</span>
                        <span class="bd-resumo-value">${tamanhoBanco}</span>
                    </div>
                </div>
            `;
        } catch (error) {
            console.error('❌ Erro ao carregar resumo:', error);
        }
    }

    // =====================================================================
    // CARREGAR MÓDULOS
    // =====================================================================
    async function carregarModulos() {
        try {
            const data = await api('/modulos');
            state.modulos = data.modulos || [];
            renderizarModulos();
        } catch (error) {
            console.error('❌ Erro ao carregar módulos:', error);
        }
    }

    function renderizarModulos() {
        const container = document.getElementById('bdListaModulos');
        if (!container) return;

        if (state.modulos.length === 0) {
            container.innerHTML = '<div class="bd-empty-small">Nenhum módulo encontrado</div>';
            return;
        }

        container.innerHTML = state.modulos.map(mod => {
            const ehCustomizado = mod.ehCustomizado;
            return `
            <div class="bd-modulo-grupo ${ehCustomizado ? 'bd-modulo-custom' : ''}">
                <div class="bd-modulo-titulo">
                    <i class="fas ${mod.icone}" style="color: ${mod.cor};"></i>
                    <span>${mod.label}</span>
                    <span class="bd-modulo-badge">${mod.totalRegistros}</span>
                </div>
                <div class="bd-modulo-colecoes">
                    ${mod.colecoes.map(col => `
                        <div class="bd-colecao-wrapper">
                            <button class="bd-colecao-item" 
                                onclick="BancoDados.selecionarColecao('${col.nome}', '${escapeAttr(col.label)}', '${col.icone}')">
                                <i class="fas ${col.icone}"></i>
                                <span>${escapeHtml(col.label)}</span>
                                <span class="bd-colecao-count">${col.totalRegistros.toLocaleString('pt-BR')}</span>
                            </button>
                            <button class="bd-btn-edit-meta" 
                                onclick="event.stopPropagation(); BancoDados.abrirModalEditarMeta('${col.nome}')"
                                title="Editar aparência desta coleção">
                                <i class="fas fa-pen"></i>
                            </button>
                        </div>
                    `).join('')}
                </div>
            </div>
            `;
        }).join('');
    }

    // =====================================================================
    // SELECIONAR COLEÇÃO
    // =====================================================================
    function selecionarColecao(nome, label, icone) {
        state.colecaoAtual = { nome, label, icone };
        state.paginacao.page = 1;
        state.filtros = { search: '', dataInicio: '', dataFim: '' };
        state.camposVisiveis = [];
        state.modoTodosCampos = false;

        document.querySelectorAll('.bd-colecao-item').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.bd-colecao-item').forEach(btn => {
            if (btn.getAttribute('onclick')?.includes(`'${nome}'`)) {
                btn.classList.add('active');
            }
        });

        carregarRegistros();
    }

    // =====================================================================
    // CARREGAR REGISTROS
    // =====================================================================
    async function carregarRegistros() {
        if (!state.colecaoAtual) return;
        if (state.carregando) return;
        state.carregando = true;

        const area = document.getElementById('bdAreaPrincipal');
        if (area) {
            area.innerHTML = `
                <div class="bd-loading-inline" style="padding: 60px;">
                    <i class="fas fa-spinner fa-spin"></i> Carregando registros...
                </div>
            `;
        }

        try {
            const params = new URLSearchParams({
                page: state.paginacao.page,
                limit: state.paginacao.limit,
                search: state.filtros.search || '',
                dataInicio: state.filtros.dataInicio || '',
                dataFim: state.filtros.dataFim || ''
            });

            const data = await api(`/colecao/${state.colecaoAtual.nome}?${params}`);

            state.registros = data.registros || [];
            state.campos = data.campos || [];
            state.paginacao = { ...data.paginacao, total: data.total };

            renderizarRegistros();
        } catch (error) {
            console.error('❌ Erro:', error);
            if (area) {
                area.innerHTML = `
                    <div class="bd-error-state">
                        <i class="fas fa-exclamation-triangle"></i>
                        <h3>Erro ao carregar registros</h3>
                        <p>${error.message}</p>
                        <button class="bd-btn bd-btn-primary" onclick="BancoDados.recarregar()">
                            <i class="fas fa-sync-alt"></i> Tentar novamente
                        </button>
                    </div>
                `;
            }
        } finally {
            state.carregando = false;
        }
    }

    // =====================================================================
    // RENDERIZAR REGISTROS
    // =====================================================================
    function renderizarRegistros() {
        const area = document.getElementById('bdAreaPrincipal');
        if (!area) return;

        const { nome, label, icone } = state.colecaoAtual;
        const { total, page, pages } = state.paginacao;

        const camposIgnorados = [
            '__v', 'faceDescriptor', 'imagemBase64', 'senha', 'password',
            'twoFactorSecret', 'twoFactorBackupCodes', 'twoFactorTempSecret'
        ];

        const ordemPrioridade = [
            '_id', 'nome', 'titulo', 'label', 'email', 'role', 'matricula',
            'turma', 'curso', 'eixo', 'status', 'ativo', 'createdAt', 'updatedAt'
        ];

        const todosCampos = state.campos
            .filter(c => !camposIgnorados.includes(c))
            .sort((a, b) => {
                const ia = ordemPrioridade.indexOf(a);
                const ib = ordemPrioridade.indexOf(b);
                if (ia !== -1 && ib !== -1) return ia - ib;
                if (ia !== -1) return -1;
                if (ib !== -1) return 1;
                return a.localeCompare(b);
            });

        const camposVisiveis = state.camposVisiveis && state.camposVisiveis.length > 0
            ? state.camposVisiveis.filter(c => todosCampos.includes(c))
            : todosCampos.slice(0, Math.max(6, Math.min(todosCampos.length, 8)));

        const camposOcultos = todosCampos.filter(c => !camposVisiveis.includes(c));
        const modoTodosCampos = state.modoTodosCampos === true;
        const camposParaExibir = modoTodosCampos ? todosCampos : camposVisiveis;

        area.innerHTML = `
            <div class="bd-colecao-header">
                <div class="bd-colecao-header-left">
                    <div class="bd-colecao-icon">
                        <i class="fas ${icone}"></i>
                    </div>
                    <div>
                        <h2>${escapeHtml(label)}</h2>
                        <p>
                            <code>${nome}</code> • 
                            ${total.toLocaleString('pt-BR')} registro(s) • 
                            ${todosCampos.length} campo(s)
                        </p>
                    </div>
                </div>
                <div class="bd-colecao-header-actions">
                    <button class="bd-btn bd-btn-secondary bd-btn-sm" 
                        onclick="BancoDados.abrirSeletorColunas()">
                        <i class="fas fa-columns"></i> Colunas
                    </button>
                    <button class="bd-btn ${modoTodosCampos ? 'bd-btn-primary' : 'bd-btn-secondary'} bd-btn-sm" 
                        onclick="BancoDados.alternarModoTodosCampos()">
                        <i class="fas fa-${modoTodosCampos ? 'compress' : 'expand'}"></i>
                        ${modoTodosCampos ? 'Compacto' : 'Todos os campos'}
                    </button>
                    <button class="bd-btn bd-btn-warning" onclick="BancoDados.abrirExclusaoMassa()">
                        <i class="fas fa-broom"></i> Exclusão em Massa
                    </button>
                    <button class="bd-btn bd-btn-danger" onclick="BancoDados.abrirLimparColecao()">
                        <i class="fas fa-trash-alt"></i> Limpar Coleção
                    </button>
                    <button class="bd-btn bd-btn-primary" onclick="BancoDados.recarregar()">
                        <i class="fas fa-sync-alt"></i>
                    </button>
                </div>
            </div>

            <div class="bd-filtros-colecao">
                <div class="bd-filtro-item">
                    <label><i class="fas fa-search"></i> Buscar</label>
                    <input type="text" id="bdSearchColecao" placeholder="Buscar..." 
                        value="${escapeAttr(state.filtros.search)}"
                        oninput="BancoDados.aplicarFiltro('search', this.value)">
                </div>
                <div class="bd-filtro-item">
                    <label><i class="fas fa-calendar"></i> De</label>
                    <input type="date" id="bdDataInicio" value="${state.filtros.dataInicio}"
                        onchange="BancoDados.aplicarFiltro('dataInicio', this.value)">
                </div>
                <div class="bd-filtro-item">
                    <label><i class="fas fa-calendar"></i> Até</label>
                    <input type="date" id="bdDataFim" value="${state.filtros.dataFim}"
                        onchange="BancoDados.aplicarFiltro('dataFim', this.value)">
                </div>
                <button class="bd-btn bd-btn-secondary bd-btn-sm" onclick="BancoDados.limparFiltros()">
                    <i class="fas fa-times"></i> Limpar Filtros
                </button>
            </div>

            ${camposOcultos.length > 0 && !modoTodosCampos ? `
                <div class="bd-aviso-campos-ocultos">
                    <i class="fas fa-info-circle"></i>
                    <span>
                        <strong>${camposOcultos.length} campo(s)</strong> oculto(s). 
                        <a href="#" onclick="BancoDados.alternarModoTodosCampos(); return false;" 
                            style="color: #1e40af; font-weight: 600; text-decoration: underline;">
                            Mostrar todos
                        </a>
                    </span>
                    <div class="bd-campos-ocultos-chips">
                        ${camposOcultos.slice(0, 10).map(c => `
                            <span class="bd-chip-oculto">${formatarNomeCampo(c)}</span>
                        `).join('')}
                        ${camposOcultos.length > 10 ? `<span class="bd-chip-oculto">+${camposOcultos.length - 10}</span>` : ''}
                    </div>
                </div>
            ` : ''}

            <div class="bd-tabela-container">
                ${state.registros.length === 0 ? `
                    <div class="bd-empty-state">
                        <div class="bd-empty-icon"><i class="fas fa-inbox"></i></div>
                        <h4>Nenhum registro</h4>
                        <p>Esta coleção está vazia ou os filtros não retornaram resultados</p>
                    </div>
                ` : `
                    <div class="bd-tabela-scroll-wrapper">
                        <table class="bd-tabela">
                            <thead>
                                <tr>
                                    ${camposParaExibir.map((c, idx) => `
                                        <th class="${idx === 0 ? 'bd-th-sticky' : ''}">
                                            <div class="bd-th-content">
                                                <span>${formatarNomeCampo(c)}</span>
                                                <button type="button" 
                                                    onclick="BancoDados.ocultarColuna('${c}')"
                                                    class="bd-btn-ocultar-col"
                                                    title="Ocultar esta coluna">
                                                    <i class="fas fa-times"></i>
                                                </button>
                                            </div>
                                            <div class="bd-th-key">${c}</div>
                                        </th>
                                    `).join('')}
                                    <th style="width: 100px; position: sticky; right: 0; background: #f8fafc; z-index: 3; box-shadow: -4px 0 8px -4px rgba(0,0,0,0.1);">
                                        <div class="bd-th-content" style="justify-content: center;">
                                            <span>Ações</span>
                                        </div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                ${state.registros.map(r => `
                                    <tr>
                                        ${camposParaExibir.map((c, idx) => `
                                            <td class="${idx === 0 ? 'bd-td-sticky' : ''}">
                                                ${formatarValorCelula(r[c], c)}
                                            </td>
                                        `).join('')}
                                        <td style="position: sticky; right: 0; background: white; z-index: 2; box-shadow: -4px 0 8px -4px rgba(0,0,0,0.1);">
                                            <div class="bd-acoes-tabela">
                                                <button class="bd-btn-icon" title="Ver todos os detalhes" 
                                                    onclick="BancoDados.verRegistro('${r._id}')">
                                                    <i class="fas fa-eye"></i>
                                                </button>
                                                <button class="bd-btn-icon bd-btn-icon-danger" title="Excluir"
                                                    onclick="BancoDados.excluirRegistro('${r._id}')">
                                                    <i class="fas fa-trash"></i>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `}
            </div>

            ${pages > 1 ? `
                <div class="bd-paginacao">
                    <span class="bd-paginacao-info">Página ${page} de ${pages} • ${total} registros</span>
                    <div class="bd-paginacao-botoes">
                        <button class="bd-page-btn" ${page === 1 ? 'disabled' : ''} 
                            onclick="BancoDados.irParaPagina(${page - 1})">
                            <i class="fas fa-chevron-left"></i>
                        </button>
                        <span class="bd-page-atual">${page}</span>
                        <button class="bd-page-btn" ${page === pages ? 'disabled' : ''} 
                            onclick="BancoDados.irParaPagina(${page + 1})">
                            <i class="fas fa-chevron-right"></i>
                        </button>
                    </div>
                </div>
            ` : ''}
        `;
    }

    // =====================================================================
    // FORMATAR VALOR DE CÉLULA
    // =====================================================================
    function formatarValorCelula(valor, campo) {
        if (valor === null || valor === undefined) {
            return '<span style="color: #cbd5e1;">—</span>';
        }

        if (typeof valor === 'boolean') {
            return valor
                ? '<span class="bd-badge bd-badge-success"><i class="fas fa-check-circle"></i> Sim</span>'
                : '<span class="bd-badge bd-badge-secondary"><i class="fas fa-times-circle"></i> Não</span>';
        }

        if (typeof valor === 'number') {
            return `<span style="font-family: monospace; color: #6366f1; font-weight: 600;">${valor}</span>`;
        }

        if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(valor)) {
            try {
                const d = new Date(valor);
                if (!isNaN(d.getTime())) {
                    return `<span style="display: inline-flex; align-items: center; gap: 5px; font-size: 12px; white-space: nowrap;">
                        <i class="fas fa-calendar-alt" style="color: #94a3b8; font-size: 10px;"></i>
                        ${d.toLocaleString('pt-BR', {
                            day: '2-digit', month: '2-digit', year: 'numeric',
                            hour: '2-digit', minute: '2-digit'
                        })}
                    </span>`;
                }
            } catch (e) {}
        }

        if (typeof valor === 'object') {
            const str = JSON.stringify(valor);
            const tamanho = Array.isArray(valor) ? valor.length : Object.keys(valor).length;
            const tipo = Array.isArray(valor) ? 'array' : 'objeto';
            const icone = Array.isArray(valor) ? 'fa-list' : 'fa-cube';
            const cor = Array.isArray(valor) ? '#f59e0b' : '#8b5cf6';

            if (valor.$oid) {
                const oid = valor.$oid;
                return `<span style="font-family: monospace; font-size: 11px; padding: 2px 8px; background: #f1f5f9; border-radius: 6px; color: #475569;">${escapeHtml(String(oid).substring(0, 12))}...</span>`;
            }

            return `
                <span style="display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; background: ${cor}15; color: ${cor}; border-radius: 10px; font-size: 11px; font-weight: 600; cursor: help;"
                    title="${escapeAttr(str.substring(0, 300))}">
                    <i class="fas ${icone}"></i>
                    ${tipo} (${tamanho})
                </span>
            `;
        }

        const str = String(valor);
        if (str.length === 0) {
            return '<span style="color: #cbd5e1; font-style: italic;">vazio</span>';
        }

        if (str.length === 24 && /^[a-f0-9]{24}$/i.test(str)) {
            return `<span style="font-family: monospace; font-size: 11px; padding: 2px 8px; background: #f1f5f9; border-radius: 6px; color: #475569;" title="${escapeAttr(str)}">${escapeHtml(str.substring(0, 8))}...</span>`;
        }

        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)) {
            return `<span style="display: inline-flex; align-items: center; gap: 4px;">
                <i class="fas fa-envelope" style="color: #94a3b8; font-size: 10px;"></i>
                <span title="${escapeAttr(str)}">${escapeHtml(str.length > 30 ? str.substring(0, 30) + '...' : str)}</span>
            </span>`;
        }

        if (campo === 'role' || campo === 'status') {
            const cores = {
                'aluno': '#10b981', 'professor': '#f59e0b', 'admin': '#3b82f6',
                'super_admin': '#8b5cf6', 'ativo': '#10b981', 'inativo': '#ef4444',
                'pendente': '#f59e0b', 'concluida': '#6b7280', 'cancelada': '#ef4444',
                'ativa': '#10b981', 'rascunho': '#f59e0b'
            };
            const cor = cores[str.toLowerCase()] || '#64748b';
            return `<span style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; background: ${cor}15; color: ${cor}; border-radius: 10px; font-size: 11px; font-weight: 600; white-space: nowrap;">${escapeHtml(str)}</span>`;
        }

        if (str.length > 40) {
            return `<span title="${escapeAttr(str)}" style="cursor: help; border-bottom: 1px dashed #cbd5e1;">${escapeHtml(str.substring(0, 40))}…</span>`;
        }

        return escapeHtml(str);
    }

    // =====================================================================
    // VER REGISTRO
    // =====================================================================
    function verRegistro(id) {
        const registro = state.registros.find(r => r._id === id);
        if (!registro) {
            mostrarToast('❌ Registro não encontrado', 'error');
            return;
        }

        const nomeColecao = state.colecaoAtual.nome;
        const labelColecao = state.colecaoAtual.label;
        const jsonStr = JSON.stringify(registro, null, 2);
        const totalCampos = Object.keys(registro).length;

        const ordemPrioridade = [
            '_id', 'nome', 'titulo', 'email', 'role', 'matricula',
            'turma', 'curso', 'status', 'ativo', 'createdAt', 'updatedAt'
        ];

        const camposOrdenados = Object.keys(registro).sort((a, b) => {
            const indexA = ordemPrioridade.indexOf(a);
            const indexB = ordemPrioridade.indexOf(b);
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
            return a.localeCompare(b);
        });

        const linhasDetalhes = camposOrdenados.map(campo => {
            const valor = registro[campo];
            const valorFormatado = formatarValorDetalhado(valor);
            const nomeCampo = formatarNomeCampo(campo);

            return `
                <tr>
                    <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; background: #f8fafc; font-weight: 600; color: #475569; vertical-align: top; width: 200px; font-size: 13px;">
                        ${escapeHtml(nomeCampo)}
                        <div style="font-size: 10px; color: #94a3b8; font-weight: 400; margin-top: 2px; font-family: monospace;">
                            ${escapeHtml(campo)}
                        </div>
                    </td>
                    <td style="padding: 10px 12px; border-bottom: 1px solid #f1f5f9; color: #1e293b; font-size: 13px; word-break: break-word; vertical-align: top;">
                        ${valorFormatado}
                    </td>
                </tr>
            `;
        }).join('');

        const protegidas = ['users', 'configs', 'permissaomodulos'];
        const isProtegida = protegidas.includes(nomeColecao);
        const nomeRegistro = registro.nome || registro.titulo || registro.label || 'Registro';

        criarModal({
            titulo: `🔍 Detalhes do Registro`,
            conteudo: `
                <div style="padding: 4px;">
                    <div style="
                        background: linear-gradient(135deg, #1e40af, #3b82f6);
                        border-radius: 14px;
                        padding: 18px 20px;
                        margin-bottom: 20px;
                        color: white;
                        display: flex;
                        align-items: center;
                        gap: 16px;
                    ">
                        <div style="width: 52px; height: 52px; background: rgba(255,255,255,0.2); border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 24px; flex-shrink: 0;">
                            <i class="fas fa-database"></i>
                        </div>
                        <div style="flex: 1; min-width: 0;">
                            <div style="font-size: 16px; font-weight: 700; margin-bottom: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                ${escapeHtml(String(nomeRegistro).substring(0, 60))}
                            </div>
                            <div style="font-size: 12px; opacity: 0.9; display: flex; gap: 12px; flex-wrap: wrap;">
                                <span><i class="fas fa-table"></i> ${escapeHtml(labelColecao)}</span>
                                <span><i class="fas fa-tag"></i> ${totalCampos} campos</span>
                                ${isProtegida ? `<span style="background: rgba(239,68,68,0.3); padding: 2px 8px; border-radius: 10px;"><i class="fas fa-shield-alt"></i> Protegida</span>` : ''}
                            </div>
                        </div>
                    </div>

                    <div style="display: flex; gap: 6px; margin-bottom: 16px; background: #f1f5f9; padding: 4px; border-radius: 10px;">
                        <button type="button" onclick="BancoDados.mostrarTabDetalhes('tabela')" 
                            id="bdTabTabela"
                            style="flex: 1; padding: 9px; border: none; border-radius: 8px; background: white; color: #3b82f6; font-weight: 600; font-size: 13px; cursor: pointer;">
                            <i class="fas fa-list"></i> Campos
                        </button>
                        <button type="button" onclick="BancoDados.mostrarTabDetalhes('json')" 
                            id="bdTabJson"
                            style="flex: 1; padding: 9px; border: none; border-radius: 8px; background: transparent; color: #64748b; font-weight: 600; font-size: 13px; cursor: pointer;">
                            <i class="fas fa-code"></i> JSON Bruto
                        </button>
                    </div>

                    <div id="bdDetalheTabela" style="max-height: 400px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 12px;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <tbody>${linhasDetalhes}</tbody>
                        </table>
                    </div>

                    <div id="bdDetalheJson" style="display: none;">
                        <div style="background: #1e293b; border-radius: 12px; padding: 16px; max-height: 400px; overflow: auto;">
                            <pre style="margin: 0; color: #e2e8f0; font-family: 'Courier New', monospace; font-size: 12px; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(jsonStr)}</pre>
                        </div>
                    </div>

                    <div style="margin-top: 14px; padding: 10px 14px; background: #f8fafc; border-radius: 10px; font-size: 11px; color: #64748b; display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-fingerprint" style="color: #94a3b8;"></i>
                        <span style="font-family: monospace; word-break: break-all;">${escapeHtml(registro._id || '—')}</span>
                    </div>
                </div>
            `,
            botoes: [
                { texto: 'Fechar', classe: 'bd-btn-secondary', acao: 'fechar' },
                ...(!isProtegida ? [{
                    texto: '🗑️ Excluir Registro',
                    classe: 'bd-btn-danger',
                    acao: () => {
                        fecharModal();
                        excluirRegistro(id);
                    }
                }] : [])
            ]
        });
    }

    // =====================================================================
    // FORMATAR VALOR DETALHADO
    // =====================================================================
    function formatarValorDetalhado(valor) {
        if (valor === null || valor === undefined) {
            return '<span style="color: #94a3b8; font-style: italic;">— (vazio)</span>';
        }

        if (typeof valor === 'boolean') {
            return valor
                ? '<span class="bd-badge bd-badge-success"><i class="fas fa-check-circle"></i> Sim</span>'
                : '<span class="bd-badge bd-badge-secondary"><i class="fas fa-times-circle"></i> Não</span>';
        }

        if (typeof valor === 'number') {
            return `<span style="font-family: monospace; color: #6366f1; font-weight: 600;">${valor}</span>`;
        }

        if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(valor)) {
            try {
                const d = new Date(valor);
                if (!isNaN(d.getTime())) {
                    return `<span style="display: inline-flex; align-items: center; gap: 5px;"><i class="fas fa-calendar-alt" style="color: #94a3b8; font-size: 11px;"></i> ${d.toLocaleString('pt-BR')}</span>`;
                }
            } catch (e) {}
        }

        if (typeof valor === 'object') {
            const str = JSON.stringify(valor);
            const tamanho = Array.isArray(valor) ? valor.length : Object.keys(valor).length;
            const tipo = Array.isArray(valor) ? 'array' : 'objeto';

            return `
                <details style="cursor: pointer;">
                    <summary style="display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px; background: #ede9fe; color: #6d28d9; border-radius: 10px; font-size: 11px; font-weight: 600; list-style: none;">
                        <i class="fas fa-cube"></i> ${tipo} (${tamanho})
                    </summary>
                    <pre style="margin: 8px 0 0 0; padding: 10px; background: #1e293b; color: #e2e8f0; border-radius: 8px; font-size: 11px; font-family: monospace; overflow-x: auto; white-space: pre-wrap; word-break: break-all;">${escapeHtml(JSON.stringify(valor, null, 2))}</pre>
                </details>
            `;
        }

        const str = String(valor);
        if (str.length === 0) {
            return '<span style="color: #94a3b8; font-style: italic;">— (vazio)</span>';
        }

        if (str.length > 100) {
            return `
                <details style="cursor: pointer;">
                    <summary style="color: #1e293b; list-style: none;">
                        ${escapeHtml(str.substring(0, 100))}...
                        <span style="color: #3b82f6; font-size: 11px; font-weight: 600;">(ver mais)</span>
                    </summary>
                    <div style="margin-top: 6px; padding: 8px; background: #f8fafc; border-radius: 6px; font-size: 12px; white-space: pre-wrap; word-break: break-word;">${escapeHtml(str)}</div>
                </details>
            `;
        }

        return escapeHtml(str);
    }

    // =====================================================================
    // TAB DETALHES
    // =====================================================================
    function mostrarTabDetalhes(tab) {
        const tabela = document.getElementById('bdDetalheTabela');
        const json = document.getElementById('bdDetalheJson');
        const btnTabela = document.getElementById('bdTabTabela');
        const btnJson = document.getElementById('bdTabJson');

        if (!tabela || !json) return;

        if (tab === 'tabela') {
            tabela.style.display = 'block';
            json.style.display = 'none';
            if (btnTabela) { btnTabela.style.background = 'white'; btnTabela.style.color = '#3b82f6'; }
            if (btnJson) { btnJson.style.background = 'transparent'; btnJson.style.color = '#64748b'; }
        } else {
            tabela.style.display = 'none';
            json.style.display = 'block';
            if (btnJson) { btnJson.style.background = 'white'; btnJson.style.color = '#3b82f6'; }
            if (btnTabela) { btnTabela.style.background = 'transparent'; btnTabela.style.color = '#64748b'; }
        }
    }

    // =====================================================================
    // ALTERNAR MODO TODOS OS CAMPOS
    // =====================================================================
    function alternarModoTodosCampos() {
        state.modoTodosCampos = !state.modoTodosCampos;
        renderizarRegistros();
    }

    // =====================================================================
    // OCULTAR COLUNA
    // =====================================================================
    function ocultarColuna(campo) {
        if (!state.camposVisiveis || state.camposVisiveis.length === 0) {
            const ignorados = ['__v', 'faceDescriptor', 'imagemBase64', 'senha', 'password'];
            state.camposVisiveis = state.campos.filter(c => !ignorados.includes(c)).slice(0, 8);
        }
        state.camposVisiveis = state.camposVisiveis.filter(c => c !== campo);

        if (state.camposVisiveis.length === 0) {
            state.camposVisiveis = state.campos.slice(0, 6);
        }

        renderizarRegistros();
    }

    // =====================================================================
    // SELETOR DE COLUNAS
    // =====================================================================
    function abrirSeletorColunas() {
        const ignorados = ['__v', 'faceDescriptor', 'imagemBase64', 'senha', 'password'];
        const todosCampos = state.campos.filter(c => !ignorados.includes(c));
        const visiveis = state.camposVisiveis && state.camposVisiveis.length > 0
            ? state.camposVisiveis
            : todosCampos.slice(0, 8);

        criarModal({
            titulo: '⚙️ Selecionar Colunas Visíveis',
            conteudo: `
                <div style="padding: 4px;">
                    <p style="color: #64748b; margin-bottom: 16px; font-size: 13px;">
                        Marque as colunas que devem aparecer na tabela.
                    </p>

                    <div style="display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap;">
                        <button class="bd-btn bd-btn-secondary bd-btn-sm" onclick="BancoDados.selecionarTodasColunas()">
                            <i class="fas fa-check-double"></i> Selecionar Todas
                        </button>
                        <button class="bd-btn bd-btn-secondary bd-btn-sm" onclick="BancoDados.limparSelecaoColunas()">
                            <i class="fas fa-eraser"></i> Limpar
                        </button>
                    </div>

                    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px; max-height: 400px; overflow-y: auto; padding: 4px;">
                        ${todosCampos.map(c => `
                            <label style="display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: ${visiveis.includes(c) ? '#eff6ff' : '#f8fafc'}; border: 2px solid ${visiveis.includes(c) ? '#3b82f6' : '#e2e8f0'}; border-radius: 10px; cursor: pointer;">
                                <input type="checkbox" class="bd-check-coluna" value="${c}" ${visiveis.includes(c) ? 'checked' : ''} style="width: 16px; height: 16px; cursor: pointer; accent-color: #3b82f6;">
                                <div style="flex: 1; min-width: 0;">
                                    <div style="font-size: 13px; font-weight: 600; color: #1e293b;">${formatarNomeCampo(c)}</div>
                                    <div style="font-size: 10px; color: #94a3b8; font-family: monospace;">${c}</div>
                                </div>
                            </label>
                        `).join('')}
                    </div>
                </div>
            `,
            botoes: [
                { texto: 'Cancelar', classe: 'bd-btn-secondary', acao: 'fechar' },
                {
                    texto: '💾 Aplicar',
                    classe: 'bd-btn-primary',
                    acao: () => {
                        const selecionados = Array.from(document.querySelectorAll('.bd-check-coluna:checked')).map(cb => cb.value);
                        if (selecionados.length === 0) {
                            mostrarToast('⚠️ Selecione pelo menos uma coluna', 'warning');
                            return;
                        }
                        state.camposVisiveis = selecionados;
                        state.modoTodosCampos = false;
                        fecharModal();
                        renderizarRegistros();
                    }
                }
            ]
        });
    }

    function selecionarTodasColunas() {
        document.querySelectorAll('.bd-check-coluna').forEach(cb => {
            cb.checked = true;
            cb.closest('label').style.background = '#eff6ff';
            cb.closest('label').style.borderColor = '#3b82f6';
        });
    }

    function limparSelecaoColunas() {
        document.querySelectorAll('.bd-check-coluna').forEach(cb => {
            cb.checked = false;
            cb.closest('label').style.background = '#f8fafc';
            cb.closest('label').style.borderColor = '#e2e8f0';
        });
    }

    // =====================================================================
    // FORMATAR NOME DE CAMPO
    // =====================================================================
    function formatarNomeCampo(campo) {
        const nomes = {
            _id: 'ID', nome: 'Nome', titulo: 'Título', email: 'Email', role: 'Perfil',
            matricula: 'Matrícula', turma: 'Turma', curso: 'Curso', status: 'Status',
            ativo: 'Ativo', createdAt: 'Criado em', updatedAt: 'Atualizado em',
            descricao: 'Descrição', data: 'Data', horario: 'Horário', tipo: 'Tipo',
            alunoId: 'Aluno', professorId: 'Professor', provaId: 'Prova', turmaId: 'Turma',
            clubeId: 'Clube', quantidade: 'Qtd', valor: 'Valor'
        };
        return nomes[campo] || campo.charAt(0).toUpperCase() + campo.slice(1).replace(/([A-Z])/g, ' $1');
    }

    // =====================================================================
    // MODAL: EDITAR METADADOS (100% DO BANCO)
    // =====================================================================
    async function abrirModalEditarMeta(nomeColecao) {
        criarModal({
            titulo: `✏️ Personalizar Coleção`,
            conteudo: `
                <div style="padding: 40px; text-align: center;">
                    <i class="fas fa-spinner fa-spin" style="font-size: 32px; color: #3b82f6; margin-bottom: 16px;"></i>
                    <p style="color: #64748b; margin: 0;">Carregando dados do banco...</p>
                </div>
            `,
            botoes: []
        });

        try {
            const [metaRes, iconesRes] = await Promise.all([
                api('/meta').catch(() => ({ metas: [] })),
                api('/icones').catch(() => ({ icones: [], modulos: [] }))
            ]);

            const metas = metaRes.metas || [];
            const iconesBanco = iconesRes.icones || [];
            const modulosBanco = iconesRes.modulos || [];

            const metaAtual = metas.find(m => m.colecao === nomeColecao);

            let labelAtual = metaAtual?.label;
            let iconeAtual = metaAtual?.icone;
            let corAtual = metaAtual?.cor;
            let moduloKeyAtual = metaAtual?.moduloKey;
            let descricaoAtual = metaAtual?.descricao || '';

            if (!metaAtual && state.modulos) {
                for (const mod of state.modulos) {
                    const col = mod.colecoes?.find(c => c.nome === nomeColecao);
                    if (col) {
                        labelAtual = col.label;
                        iconeAtual = col.icone;
                        corAtual = col.cor || mod.cor || '#94a3b8';
                        moduloKeyAtual = mod.key;
                        break;
                    }
                }
            }

            labelAtual = labelAtual || nomeColecao;
            iconeAtual = iconeAtual || 'fa-cube';
            corAtual = corAtual || '#94a3b8';
            moduloKeyAtual = moduloKeyAtual || 'outros';

            const iconesUnicos = iconesBanco.length > 0
                ? iconesBanco
                : [{ icone: iconeAtual, origem: 'atual', moduloLabel: 'Atual' }];

            const iconesGrid = iconesUnicos.map(item => {
                const selecionado = item.icone === iconeAtual;
                return `
                    <label class="bd-icone-opcao ${selecionado ? 'bd-icone-selecionado' : ''}"
                        title="${escapeAttr(item.icone)}${item.moduloLabel ? ` (${escapeAttr(item.moduloLabel)})` : ''}">
                        <input type="radio" name="bdIconeRadio" value="${item.icone}" ${selecionado ? 'checked' : ''} style="display: none;">
                        <i class="fas ${item.icone}"></i>
                    </label>
                `;
            }).join('');

            const modulosOpcoes = modulosBanco.length > 0
                ? modulosBanco
                : [{ key: 'outros', label: '📁 Outros', origem: 'sistema' }];

            const modulosSelect = modulosOpcoes.map(m => `
                <option value="${m.key}" ${m.key === moduloKeyAtual ? 'selected' : ''}>
                    ${escapeHtml(m.label)}
                </option>
            `).join('');

            criarModal({
                titulo: `✏️ Personalizar Coleção`,
                conteudo: `
                    <div class="bd-meta-form">
                        <div class="bd-meta-info">
                            <i class="fas fa-database"></i>
                            <div>
                                <strong>Coleção:</strong> <code>${escapeHtml(nomeColecao)}</code>
                                <small>${iconesBanco.length} ícone(s) e ${modulosBanco.length} módulo(s) do banco</small>
                            </div>
                        </div>

                        <div class="bd-form-group">
                            <label><i class="fas fa-tag"></i> Nome de Exibição</label>
                            <input type="text" id="bdMetaLabel" value="${escapeAttr(labelAtual)}"
                                placeholder="Ex: Atendimentos Especiais"
                                style="width: 100%; padding: 10px; border: 2px solid #e5e7eb; border-radius: 8px;">
                        </div>

                        <div class="bd-form-group">
                            <label><i class="fas fa-align-left"></i> Descrição (opcional)</label>
                            <input type="text" id="bdMetaDescricao" value="${escapeAttr(descricaoAtual)}"
                                placeholder="Breve descrição"
                                style="width: 100%; padding: 10px; border: 2px solid #e5e7eb; border-radius: 8px;">
                        </div>

                        <div class="bd-form-group">
                            <label><i class="fas fa-icons"></i> Ícone (${iconesUnicos.length} disponíveis)</label>
                            <div class="bd-icones-grid" id="bdIconesGrid">${iconesGrid}</div>
                            <small style="color: #94a3b8; margin-top: 6px; display: block;">
                                <i class="fas fa-info-circle"></i> Ícones cadastrados no banco de dados
                            </small>
                        </div>

                        <div class="bd-form-row">
                            <div class="bd-form-group">
                                <label><i class="fas fa-palette"></i> Cor</label>
                                <input type="color" id="bdMetaCor" value="${corAtual}"
                                    style="width: 100%; height: 42px; padding: 4px; border: 2px solid #e5e7eb; border-radius: 8px;">
                            </div>
                            <div class="bd-form-group">
                                <label><i class="fas fa-layer-group"></i> Módulo</label>
                                <select id="bdMetaModulo" style="width: 100%; padding: 10px; border: 2px solid #e5e7eb; border-radius: 8px;">
                                    ${modulosSelect}
                                </select>
                            </div>
                        </div>

                        <div class="bd-preview-box">
                            <div class="bd-preview-label">Pré-visualização:</div>
                            <div class="bd-preview-item" id="bdPreviewItem">
                                <i class="fas ${iconeAtual}" style="color: ${corAtual};"></i>
                                <span id="bdPreviewLabel">${escapeHtml(labelAtual)}</span>
                            </div>
                        </div>
                    </div>
                `,
                botoes: [
                    { texto: 'Cancelar', classe: 'bd-btn-secondary', acao: 'fechar' },
                    { texto: '🗑️ Remover Personalização', classe: 'bd-btn-warning', acao: () => removerMeta(nomeColecao) },
                    { texto: '💾 Salvar', classe: 'bd-btn-primary', acao: () => salvarMeta(nomeColecao) }
                ]
            });

            setTimeout(() => {
                const updatePreview = () => {
                    const l = document.getElementById('bdMetaLabel')?.value || '';
                    const ic = document.querySelector('input[name="bdIconeRadio"]:checked')?.value || 'fa-cube';
                    const c = document.getElementById('bdMetaCor')?.value || '#94a3b8';
                    const item = document.getElementById('bdPreviewItem');
                    const lbl = document.getElementById('bdPreviewLabel');
                    if (item && lbl) {
                        const iconeEl = item.querySelector('i');
                        if (iconeEl) { iconeEl.className = `fas ${ic}`; iconeEl.style.color = c; }
                        lbl.textContent = l;
                    }
                };

                document.getElementById('bdMetaLabel')?.addEventListener('input', updatePreview);
                document.getElementById('bdMetaCor')?.addEventListener('input', updatePreview);

                document.querySelectorAll('.bd-icone-opcao').forEach(label => {
                    label.addEventListener('click', () => {
                        document.querySelectorAll('.bd-icone-opcao').forEach(l => l.classList.remove('bd-icone-selecionado'));
                        label.classList.add('bd-icone-selecionado');
                        const radio = label.querySelector('input[type="radio"]');
                        if (radio) radio.checked = true;
                        updatePreview();
                    });
                });
            }, 100);

        } catch (error) {
            console.error('❌ Erro:', error);
            criarModal({
                titulo: '❌ Erro',
                conteudo: `<div style="padding: 30px; text-align: center; color: #991b1b;"><p>${error.message}</p></div>`,
                botoes: [{ texto: 'Fechar', classe: 'bd-btn-secondary', acao: 'fechar' }]
            });
        }
    }

    async function salvarMeta(nomeColecao) {
        const label = document.getElementById('bdMetaLabel')?.value?.trim();
        const icone = document.querySelector('input[name="bdIconeRadio"]:checked')?.value;
        const cor = document.getElementById('bdMetaCor')?.value;
        const moduloKey = document.getElementById('bdMetaModulo')?.value;
        const descricao = document.getElementById('bdMetaDescricao')?.value?.trim();

        if (!label) { mostrarToast('❌ Nome é obrigatório', 'error'); return; }
        if (!icone) { mostrarToast('❌ Selecione um ícone', 'error'); return; }

        try {
            await api(`/meta/${nomeColecao}`, {
                method: 'PUT',
                body: JSON.stringify({ label, icone, cor, moduloKey, descricao })
            });
            fecharModal();
            mostrarToast('✅ Personalização salva!', 'success');
            await carregarModulos();
            if (state.colecaoAtual && state.colecaoAtual.nome === nomeColecao) {
                state.colecaoAtual.label = label;
                state.colecaoAtual.icone = icone;
                carregarRegistros();
            }
        } catch (error) {
            mostrarToast('❌ ' + error.message, 'error');
        }
    }

    async function removerMeta(nomeColecao) {
        const confirmar = await confirmarAcao(
            '🗑️ Remover Personalização',
            `Deseja remover as personalizações da coleção <code>${nomeColecao}</code>?`
        );
        if (!confirmar) return;
        try {
            await api(`/meta/${nomeColecao}`, { method: 'DELETE' });
            fecharModal();
            mostrarToast('✅ Personalização removida', 'success');
            await carregarModulos();
        } catch (error) {
            mostrarToast('❌ ' + error.message, 'error');
        }
    }

    // =====================================================================
    // GERENCIAR MÓDULOS (CRIAR/EDITAR/EXCLUIR)
    // =====================================================================
    async function abrirModalGerenciarModulos() {
        try {
            const data = await api('/admin/modulos');
            const modulos = data.modulos || [];

            criarModal({
                titulo: '🧩 Gerenciar Módulos',
                conteudo: `
                    <div style="padding: 4px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 10px;">
                            <p style="color: #64748b; margin: 0; font-size: 13px;">
                                ${modulos.length} módulo(s) no banco de dados
                            </p>
                            <button class="bd-btn bd-btn-primary bd-btn-sm" onclick="BancoDados.abrirFormNovoModulo()">
                                <i class="fas fa-plus"></i> Novo Módulo
                            </button>
                        </div>

                        <div style="display: flex; flex-direction: column; gap: 8px; max-height: 450px; overflow-y: auto;">
                            ${modulos.length === 0 ? '<p style="text-align: center; color: #94a3b8; padding: 20px;">Nenhum módulo</p>' : ''}
                            ${modulos.map(m => `
                                <div style="display: flex; align-items: center; gap: 12px; padding: 12px 14px; background: ${m.ativo ? '#f8fafc' : '#fef2f2'}; border: 1px solid ${m.ativo ? '#e2e8f0' : '#fecaca'}; border-radius: 10px;">
                                    <div style="width: 40px; height: 40px; background: ${m.cor}20; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: ${m.cor}; font-size: 18px; flex-shrink: 0;">
                                        <i class="fas ${m.icone}"></i>
                                    </div>
                                    <div style="flex: 1; min-width: 0;">
                                        <div style="font-weight: 600; color: #1e293b; font-size: 13px;">${escapeHtml(m.label)}</div>
                                        <div style="font-size: 11px; color: #94a3b8; font-family: monospace;">${m.key}</div>
                                    </div>
                                    <div style="display: flex; gap: 4px;">
                                        <button class="bd-btn-icon" onclick="BancoDados.abrirFormEditarModulo('${m.key}')" title="Editar">
                                            <i class="fas fa-pen"></i>
                                        </button>
                                        <button class="bd-btn-icon bd-btn-icon-danger" onclick="BancoDados.excluirModulo('${m.key}')" title="Excluir">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `,
                botoes: [
                    { texto: 'Fechar', classe: 'bd-btn-secondary', acao: 'fechar' }
                ]
            });

        } catch (error) {
            mostrarToast('❌ ' + error.message, 'error');
        }
    }

    function abrirFormNovoModulo() {
        abrirFormModulo(null);
    }

    async function abrirFormEditarModulo(key) {
        try {
            const data = await api('/admin/modulos');
            const mod = (data.modulos || []).find(m => m.key === key);
            if (!mod) { mostrarToast('❌ Módulo não encontrado', 'error'); return; }
            abrirFormModulo(mod);
        } catch (error) {
            mostrarToast('❌ ' + error.message, 'error');
        }
    }

    function abrirFormModulo(modulo) {
        const isEdit = !!modulo;

        criarModal({
            titulo: isEdit ? `✏️ Editar Módulo` : `➕ Novo Módulo`,
            conteudo: `
                <div class="bd-meta-form">
                    <div class="bd-form-group">
                        <label><i class="fas fa-key"></i> Key (identificador único)</label>
                        <input type="text" id="modKey" value="${escapeAttr(modulo?.key || '')}"
                            ${isEdit ? 'disabled' : ''}
                            placeholder="ex: biblioteca"
                            style="width: 100%; padding: 10px; border: 2px solid #e5e7eb; border-radius: 8px; font-family: monospace; ${isEdit ? 'background: #f1f5f9; color: #94a3b8;' : ''}">
                        ${isEdit ? '<small style="color: #94a3b8;">A key não pode ser alterada</small>' : ''}
                    </div>

                    <div class="bd-form-group">
                        <label><i class="fas fa-tag"></i> Label (nome exibido)</label>
                        <input type="text" id="modLabel" value="${escapeAttr(modulo?.label || '')}"
                            placeholder="ex: Biblioteca"
                            style="width: 100%; padding: 10px; border: 2px solid #e5e7eb; border-radius: 8px;">
                    </div>

                    <div class="bd-form-group">
                        <label><i class="fas fa-icons"></i> Ícone</label>
                        <input type="text" id="modIcone" value="${escapeAttr(modulo?.icone || 'fa-folder')}"
                            placeholder="ex: fa-book"
                            style="width: 100%; padding: 10px; border: 2px solid #e5e7eb; border-radius: 8px; font-family: monospace;">
                    </div>

                    <div class="bd-form-row">
                        <div class="bd-form-group">
                            <label><i class="fas fa-palette"></i> Cor</label>
                            <input type="color" id="modCor" value="${modulo?.cor || '#94a3b8'}"
                                style="width: 100%; height: 42px; padding: 4px; border: 2px solid #e5e7eb; border-radius: 8px;">
                        </div>
                        <div class="bd-form-group">
                            <label><i class="fas fa-sort-numeric-up"></i> Ordem</label>
                            <input type="number" id="modOrdem" value="${modulo?.ordem || 999}"
                                min="1" max="9999"
                                style="width: 100%; padding: 10px; border: 2px solid #e5e7eb; border-radius: 8px;">
                        </div>
                    </div>

                    ${isEdit ? `
                        <div class="bd-form-group">
                            <label style="display: flex; align-items: center; gap: 8px;">
                                <input type="checkbox" id="modAtivo" ${modulo?.ativo !== false ? 'checked' : ''}>
                                <span>Ativo</span>
                            </label>
                        </div>
                    ` : ''}
                </div>
            `,
            botoes: [
                { texto: 'Cancelar', classe: 'bd-btn-secondary', acao: 'fechar' },
                { texto: '💾 Salvar', classe: 'bd-btn-primary', acao: () => salvarModulo(isEdit ? modulo.key : null) }
            ]
        });
    }

    async function salvarModulo(keyOriginal) {
        const key = document.getElementById('modKey')?.value?.trim();
        const label = document.getElementById('modLabel')?.value?.trim();
        const icone = document.getElementById('modIcone')?.value?.trim();
        const cor = document.getElementById('modCor')?.value;
        const ordem = parseInt(document.getElementById('modOrdem')?.value) || 999;
        const ativo = document.getElementById('modAtivo')?.checked !== false;

        if (!label) { mostrarToast('❌ Label obrigatório', 'error'); return; }
        if (!keyOriginal && !key) { mostrarToast('❌ Key obrigatória', 'error'); return; }

        try {
            if (keyOriginal) {
                await api(`/admin/modulos/${keyOriginal}`, {
                    method: 'PUT',
                    body: JSON.stringify({ label, icone, cor, ordem, ativo })
                });
                mostrarToast('✅ Módulo atualizado!', 'success');
            } else {
                await api('/admin/modulos', {
                    method: 'POST',
                    body: JSON.stringify({ key, label, icone, cor, ordem })
                });
                mostrarToast('✅ Módulo criado!', 'success');
            }

            fecharModal();
            await carregarModulos();
            abrirModalGerenciarModulos();

        } catch (error) {
            mostrarToast('❌ ' + error.message, 'error');
        }
    }

    async function excluirModulo(key) {
        const confirmar = await confirmarAcao(
            '🗑️ Excluir Módulo',
            `Tem certeza que deseja excluir o módulo <strong>${key}</strong>?<br><br>
            As coleções vinculadas precisam ser movidas antes.`
        );
        if (!confirmar) return;

        try {
            await api(`/admin/modulos/${key}`, { method: 'DELETE' });
            mostrarToast('✅ Módulo excluído!', 'success');
            await carregarModulos();
            abrirModalGerenciarModulos();
        } catch (error) {
            mostrarToast('❌ ' + error.message, 'error');
        }
    }

    // =====================================================================
    // FILTROS
    // =====================================================================
    function aplicarFiltro(campo, valor) {
        state.filtros[campo] = valor;
        state.paginacao.page = 1;

        if (campo === 'search') {
            clearTimeout(state._searchTimeout);
            state._searchTimeout = setTimeout(() => carregarRegistros(), 500);
        } else {
            carregarRegistros();
        }
    }

    function limparFiltros() {
        state.filtros = { search: '', dataInicio: '', dataFim: '' };
        state.paginacao.page = 1;
        carregarRegistros();
    }

    function irParaPagina(page) {
        state.paginacao.page = page;
        carregarRegistros();
    }

    function recarregar() {
        carregarRegistros();
    }

    // =====================================================================
    // ESCAPE HELPERS
    // =====================================================================
    function escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    function escapeAttr(text) {
        if (text === null || text === undefined) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    // =====================================================================
    // EXCLUIR REGISTRO
    // =====================================================================
    async function excluirRegistro(id) {
        const confirmar = await confirmarAcao(
            '🗑️ Excluir Registro',
            `Tem certeza que deseja excluir este registro permanentemente?<br><br>
            <span style="color: #dc3545; font-weight: 600;">Esta ação não pode ser desfeita.</span>`
        );

        if (!confirmar) return;

        try {
            await api(`/colecao/${state.colecaoAtual.nome}/registro/${id}`, { method: 'DELETE' });
            mostrarToast('✅ Registro excluído!', 'success');
            carregarRegistros();
            carregarResumo();
            carregarModulos();
        } catch (error) {
            mostrarToast('❌ ' + error.message, 'error');
        }
    }

    // =====================================================================
    // EXCLUSÃO EM MASSA
    // =====================================================================
    function abrirExclusaoMassa() {
        criarModal({
            titulo: `🧹 Exclusão em Massa - ${state.colecaoAtual.label}`,
            conteudo: `
                <div class="bd-alerta bd-alerta-warning">
                    <i class="fas fa-exclamation-triangle"></i>
                    <div>
                        <strong>Atenção!</strong><br>
                        Os registros excluídos não podem ser recuperados.
                    </div>
                </div>

                <div style="display: grid; gap: 16px; margin-top: 20px;">
                    <div>
                        <label style="display: block; font-weight: 600; margin-bottom: 8px;">
                            <i class="fas fa-calendar"></i> Excluir registros ANTERIORES a:
                        </label>
                        <input type="date" id="bdMassaDataInicio" style="width: 100%; padding: 10px; border: 2px solid #e5e7eb; border-radius: 8px;">
                        <small style="color: #6b7280;">Deixe vazio para ignorar</small>
                    </div>

                    <div>
                        <label style="display: block; font-weight: 600; margin-bottom: 8px;">
                            <i class="fas fa-calendar"></i> E POSTERIORES a:
                        </label>
                        <input type="date" id="bdMassaDataFim" style="width: 100%; padding: 10px; border: 2px solid #e5e7eb; border-radius: 8px;">
                        <small style="color: #6b7280;">Deixe vazio para ignorar</small>
                    </div>
                </div>

                <div class="bd-info-box" style="margin-top: 20px;">
                    <i class="fas fa-info-circle"></i>
                    <span>Se nenhuma data for informada, TODOS os registros serão excluídos.</span>
                </div>
            `,
            botoes: [
                { texto: 'Cancelar', classe: 'bd-btn-secondary', acao: 'fechar' },
                { texto: 'Executar Exclusão', classe: 'bd-btn-danger', acao: () => executarExclusaoMassa() }
            ]
        });
    }

    async function executarExclusaoMassa() {
        const dataInicio = document.getElementById('bdMassaDataInicio')?.value || '';
        const dataFim = document.getElementById('bdMassaDataFim')?.value || '';

        fecharModal();

        if (!dataInicio && !dataFim) {
            const confirmar = await confirmarAcao(
                '⚠️ ATENÇÃO MÁXIMA',
                `Você está prestes a <strong>EXCLUIR TODOS OS REGISTROS</strong> da coleção <strong>${state.colecaoAtual.label}</strong>.<br><br>
                <span style="color: #dc3545; font-weight: 700;">Esta ação é IRREVERSÍVEL!</span><br><br>
                Digite CONFIRMO para prosseguir:`,
                true
            );
            if (confirmar !== 'CONFIRMO') return;
        }

        try {
            mostrarToast('🔄 Executando exclusão...', 'info');

            const data = await api(`/colecao/${state.colecaoAtual.nome}/excluir-massa`, {
                method: 'POST',
                body: JSON.stringify({
                    dataInicio,
                    dataFim,
                    confirmacao: 'CONFIRMO_EXCLUSAO_MASSA'
                })
            });

            mostrarToast(`✅ ${data.totalExcluidos} registro(s) excluído(s)!`, 'success');
            carregarRegistros();
            carregarResumo();
            carregarModulos();
        } catch (error) {
            mostrarToast('❌ ' + error.message, 'error');
        }
    }

    // =====================================================================
    // LIMPAR COLEÇÃO
    // =====================================================================
    function abrirLimparColecao() {
        const nome = state.colecaoAtual.nome;
        const codigo = `LIMPAR_${nome.toUpperCase()}`;

        criarModal({
            titulo: `🗑️ Limpar Coleção: ${state.colecaoAtual.label}`,
            conteudo: `
                <div class="bd-alerta bd-alerta-danger" style="margin-bottom: 20px;">
                    <i class="fas fa-exclamation-triangle"></i>
                    <div>
                        <strong>⚠️ ATENÇÃO MÁXIMA!</strong><br><br>
                        Você está prestes a <strong>EXCLUIR TODOS OS REGISTROS</strong> da coleção 
                        <code>${nome}</code>.<br><br>
                        <span style="color: #dc3545; font-weight: 700;">Esta ação NÃO PODE SER DESFEITA!</span>
                    </div>
                </div>

                <div style="background: #fef3c7; padding: 16px; border-radius: 12px; margin-bottom: 20px;">
                    <p style="margin: 0 0 10px; font-size: 14px; color: #92400e;">
                        <i class="fas fa-info-circle"></i> <strong>Para confirmar, digite exatamente:</strong>
                    </p>
                    <code style="background: white; padding: 8px 12px; border-radius: 6px; display: block; text-align: center; font-size: 14px; font-weight: 700; color: #dc2626;">${codigo}</code>
                </div>

                <input type="text" id="bdCodigoConfirmacao" 
                    placeholder="Digite o código acima..."
                    style="width: 100%; padding: 12px; border: 2px solid #e5e7eb; border-radius: 8px; font-size: 14px; text-align: center; font-family: monospace; font-weight: 600;"
                    autocomplete="off">
            `,
            botoes: [
                { texto: 'Cancelar', classe: 'bd-btn-secondary', acao: 'fechar' },
                { texto: 'LIMPAR DEFINITIVAMENTE', classe: 'bd-btn-danger', acao: () => executarLimparColecao(codigo) }
            ]
        });
    }

    async function executarLimparColecao(codigoEsperado) {
        const codigo = document.getElementById('bdCodigoConfirmacao')?.value?.trim();

        if (codigo !== codigoEsperado) {
            mostrarToast('❌ Código de confirmação incorreto', 'error');
            return;
        }

        fecharModal();

        try {
            mostrarToast('🗑️ Limpando coleção...', 'info');

            const data = await api(`/colecao/${state.colecaoAtual.nome}/limpar`, {
                method: 'POST',
                body: JSON.stringify({ confirmacao: codigoEsperado })
            });

            mostrarToast(`✅ ${data.totalRemovidos} registro(s) removido(s)!`, 'success');
            carregarRegistros();
            carregarResumo();
            carregarModulos();
        } catch (error) {
            mostrarToast('❌ ' + error.message, 'error');
        }
    }

    // =====================================================================
    // MODAL HELPER
    // =====================================================================
    function criarModal({ titulo, conteudo, botoes = [] }) {
        const existente = document.getElementById('bdModal');
        if (existente) existente.remove();

        const modal = document.createElement('div');
        modal.id = 'bdModal';
        modal.className = 'bd-modal-overlay';
        modal.innerHTML = `
            <div class="bd-modal">
                <div class="bd-modal-header">
                    <h2>${titulo}</h2>
                    <button class="bd-modal-close" onclick="BancoDados.fecharModal()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="bd-modal-body">${conteudo}</div>
                <div class="bd-modal-footer">
                    ${botoes.map((btn, idx) => `
                        <button class="bd-btn ${btn.classe}" 
                            data-acao="${idx}" 
                            onclick="BancoDados.executarAcaoBotao(${idx})">
                            ${btn.texto}
                        </button>
                    `).join('')}
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        window._bdModalBotoes = botoes;

        modal.addEventListener('click', (e) => {
            if (e.target === modal) fecharModal();
        });

        return modal;
    }

    function fecharModal() {
        const modal = document.getElementById('bdModal');
        if (modal) modal.remove();
        window._bdModalBotoes = null;
    }

    function executarAcaoBotao(index) {
        const botoes = window._bdModalBotoes;
        if (!botoes || !botoes[index]) return;

        const acao = botoes[index].acao;
        if (acao === 'fechar') {
            fecharModal();
        } else if (typeof acao === 'function') {
            acao();
        }
    }

    function confirmarAcao(titulo, mensagem, requerTexto = false) {
        return new Promise((resolve) => {
            criarModal({
                titulo,
                conteudo: `
                    <div style="font-size: 14px; line-height: 1.6;">${mensagem}</div>
                    ${requerTexto ? `
                        <input type="text" id="bdConfirmText" 
                            placeholder="Digite aqui..."
                            style="width: 100%; padding: 12px; margin-top: 16px; border: 2px solid #e5e7eb; border-radius: 8px; font-size: 14px;">
                    ` : ''}
                `,
                botoes: [
                    { texto: 'Cancelar', classe: 'bd-btn-secondary', acao: 'fechar' },
                    {
                        texto: 'Confirmar',
                        classe: 'bd-btn-danger',
                        acao: () => {
                            if (requerTexto) {
                                const texto = document.getElementById('bdConfirmText')?.value;
                                fecharModal();
                                resolve(texto);
                            } else {
                                fecharModal();
                                resolve(true);
                            }
                        }
                    }
                ]
            });
        });
    }

    function mostrarToast(mensagem, tipo = 'info') {
        const cores = { success: '#10b981', error: '#ef4444', info: '#3b82f6', warning: '#f59e0b' };
        const icons = { success: 'fa-check-circle', error: 'fa-times-circle', info: 'fa-info-circle', warning: 'fa-exclamation-triangle' };

        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed; bottom: 20px; right: 20px; background: ${cores[tipo]}; color: white;
            padding: 14px 20px; border-radius: 12px; z-index: 99999;
            box-shadow: 0 8px 24px rgba(0,0,0,0.2);
            display: flex; align-items: center; gap: 10px;
            font-size: 14px; font-weight: 500;
            animation: bdSlideIn 0.3s ease;
        `;
        toast.innerHTML = `<i class="fas ${icons[tipo]}"></i> ${mensagem}`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3500);
    }

    async function atualizarTudo() {
        await Promise.all([carregarResumo(), carregarModulos()]);
        if (state.colecaoAtual) await carregarRegistros();
        mostrarToast('✅ Dados atualizados', 'success');
    }

    // =====================================================================
    // INIT
    // =====================================================================
    async function inicializar() {
        const container = document.getElementById('bancoDadosContent');
        if (!container) {
            setTimeout(inicializar, 300);
            return;
        }
        console.log('✅ Inicializando módulo Banco de Dados');
        renderizar();
    }

    // =====================================================================
    // API PÚBLICA
    // =====================================================================
    window.BancoDados = {
        init: inicializar,
        selecionarColecao,
        aplicarFiltro,
        limparFiltros,
        irParaPagina,
        recarregar,
        verRegistro,
        mostrarTabDetalhes,
        excluirRegistro,
        abrirExclusaoMassa,
        abrirLimparColecao,
        abrirModalEditarMeta,
        atualizarTudo,
        fecharModal,
        executarAcaoBotao,
        alternarModoTodosCampos,
        abrirSeletorColunas,
        ocultarColuna,
        selecionarTodasColunas,
        limparSelecaoColunas,
        abrirModalGerenciarModulos,
        abrirFormNovoModulo,
        abrirFormEditarModulo,
        excluirModulo,
        getState: () => ({ ...state })
    };

    console.log('✅ Módulo Banco de Dados pronto');
})();