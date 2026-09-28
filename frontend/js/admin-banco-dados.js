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
        carregando: false
    };

    // Ícones disponíveis para escolher
    const ICONES_DISPONIVEIS = [
        'fa-cube', 'fa-database', 'fa-table', 'fa-folder', 'fa-file',
        'fa-users', 'fa-user', 'fa-user-tie', 'fa-user-shield', 'fa-user-graduate',
        'fa-chalkboard-teacher', 'fa-school', 'fa-graduation-cap', 'fa-book',
        'fa-file-alt', 'fa-chart-line', 'fa-clipboard-list', 'fa-tasks',
        'fa-bell', 'fa-comments', 'fa-calendar', 'fa-clock', 'fa-map-marker-alt',
        'fa-id-card', 'fa-shield-alt', 'fa-cog', 'fa-server', 'fa-mobile-alt',
        'fa-star', 'fa-heart', 'fa-brain', 'fa-hands-helping', 'fa-kitchen-set',
        'fa-hospital-user', 'fa-utensils', 'fa-qrcode', 'fa-camera', 'fa-vote-yea',
        'fa-trophy', 'fa-medal', 'fa-certificate'
    ];

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
                                onclick="BancoDados.selecionarColecao('${col.nome}', '${col.label}', '${col.icone}')">
                                <i class="fas ${col.icone}"></i>
                                <span>${col.label}</span>
                                <span class="bd-colecao-count">${col.totalRegistros.toLocaleString('pt-BR')}</span>
                            </button>
                            ${col.ehCustomizada ? `
                                <button class="bd-btn-edit-meta" 
                                    onclick="event.stopPropagation(); BancoDados.abrirModalEditarMeta('${col.nome}')"
                                    title="Editar aparência desta coleção">
                                    <i class="fas fa-pen"></i>
                                </button>
                            ` : ''}
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

        const camposVisiveis = state.campos
            .filter(c => !['__v', 'faceDescriptor', 'imagemBase64', 'senha', 'password', 'twoFactorSecret'].includes(c))
            .slice(0, 6);

        area.innerHTML = `
            <div class="bd-colecao-header">
                <div class="bd-colecao-header-left">
                    <div class="bd-colecao-icon">
                        <i class="fas ${icone}"></i>
                    </div>
                    <div>
                        <h2>${label}</h2>
                        <p><code>${nome}</code> • ${total.toLocaleString('pt-BR')} registro(s)</p>
                    </div>
                </div>
                <div class="bd-colecao-header-actions">
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
                        value="${state.filtros.search}"
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

            <div class="bd-tabela-container">
                ${state.registros.length === 0 ? `
                    <div class="bd-empty-state">
                        <div class="bd-empty-icon"><i class="fas fa-inbox"></i></div>
                        <h4>Nenhum registro</h4>
                        <p>Esta coleção está vazia ou os filtros não retornaram resultados</p>
                    </div>
                ` : `
                    <table class="bd-tabela">
                        <thead>
                            <tr>
                                ${camposVisiveis.map(c => `<th>${formatarNomeCampo(c)}</th>`).join('')}
                                <th style="width: 80px;">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${state.registros.map(r => `
                                <tr>
                                    ${camposVisiveis.map(c => `<td>${formatarValor(r[c])}</td>`).join('')}
                                    <td>
                                        <div class="bd-acoes-tabela">
                                            <button class="bd-btn-icon" title="Ver JSON" 
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
    // MODAL: EDITAR METADADOS
    // =====================================================================
    async function abrirModalEditarMeta(nomeColecao) {
        let metaAtual = null;
        try {
            const data = await api('/meta');
            metaAtual = (data.metas || []).find(m => m.colecao === nomeColecao);
        } catch (e) {}

        const label = metaAtual?.label || formatarLabelAutomatico(nomeColecao);
        const icone = metaAtual?.icone || 'fa-cube';
        const cor = metaAtual?.cor || '#94a3b8';
        const moduloKey = metaAtual?.moduloKey || 'outros';
        const descricao = metaAtual?.descricao || '';

        // Módulos disponíveis para atribuir
        const modulosDisponiveis = [
            { key: 'outros', label: '📁 Outros (Não Mapeados)' },
            { key: 'usuarios', label: '👥 Usuários' },
            { key: 'academico', label: '🎓 Acadêmico' },
            { key: 'gestao_geral', label: '👔 Gestão Geral' },
            { key: 'coordenacao_patio', label: '🍽️ Coordenação de Pátio' },
            { key: 'cozinha', label: '🍳 Cozinha' },
            { key: 'enfermaria', label: '🏥 Enfermaria' },
            { key: 'supervisao', label: '🛡️ Supervisão' },
            { key: 'psicologia', label: '🧠 Psicologia' },
            { key: 'assistente_social', label: '🤝 Assistente Social' },
            { key: 'setor_pedagogico', label: '👩‍🏫 Setor Pedagógico' },
            { key: 'protagonismo', label: '⭐ Protagonismo' },
            { key: 'comunicacao', label: '📢 Comunicação' },
            { key: 'seguranca', label: '🔐 Segurança' },
            { key: 'push', label: '📱 Push' },
            { key: 'sistema', label: '⚙️ Sistema' }
        ];

        // Select de ícones
        const iconesOptions = ICONES_DISPONIVEIS.map(i => 
            `<option value="${i}" ${i === icone ? 'selected' : ''}>${i.replace('fa-', '')}</option>`
        ).join('');

        criarModal({
            titulo: `✏️ Personalizar Coleção`,
            conteudo: `
                <div class="bd-meta-form">
                    <div class="bd-meta-info">
                        <i class="fas fa-database"></i>
                        <div>
                            <strong>Coleção:</strong> <code>${nomeColecao}</code>
                            <small>Estes dados são armazenados na coleção <code>colecaometas</code></small>
                        </div>
                    </div>

                    <div class="bd-form-group">
                        <label><i class="fas fa-tag"></i> Nome de Exibição</label>
                        <input type="text" id="bdMetaLabel" value="${label}" 
                            placeholder="Ex: Atendimentos Especiais"
                            style="width: 100%; padding: 10px; border: 2px solid #e5e7eb; border-radius: 8px;">
                    </div>

                    <div class="bd-form-group">
                        <label><i class="fas fa-align-left"></i> Descrição (opcional)</label>
                        <input type="text" id="bdMetaDescricao" value="${descricao}" 
                            placeholder="Breve descrição do que esta coleção armazena"
                            style="width: 100%; padding: 10px; border: 2px solid #e5e7eb; border-radius: 8px;">
                    </div>

                    <div class="bd-form-row">
                        <div class="bd-form-group">
                            <label><i class="fas fa-icons"></i> Ícone</label>
                            <select id="bdMetaIcone" 
                                style="width: 100%; padding: 10px; border: 2px solid #e5e7eb; border-radius: 8px; font-family: monospace;">
                                ${iconesOptions}
                            </select>
                        </div>
                        <div class="bd-form-group">
                            <label><i class="fas fa-palette"></i> Cor</label>
                            <input type="color" id="bdMetaCor" value="${cor}"
                                style="width: 100%; height: 42px; padding: 4px; border: 2px solid #e5e7eb; border-radius: 8px; cursor: pointer;">
                        </div>
                    </div>

                    <div class="bd-form-group">
                        <label><i class="fas fa-layer-group"></i> Módulo</label>
                        <select id="bdMetaModulo"
                            style="width: 100%; padding: 10px; border: 2px solid #e5e7eb; border-radius: 8px;">
                            ${modulosDisponiveis.map(m => 
                                `<option value="${m.key}" ${m.key === moduloKey ? 'selected' : ''}>${m.label}</option>`
                            ).join('')}
                        </select>
                        <small>Selecione "Outros" para manter na seção padrão</small>
                    </div>

                    <div class="bd-preview-box">
                        <div class="bd-preview-label">Pré-visualização:</div>
                        <div class="bd-preview-item" id="bdPreviewItem">
                            <i class="fas ${icone}" style="color: ${cor};"></i>
                            <span id="bdPreviewLabel">${label}</span>
                        </div>
                    </div>
                </div>
            `,
            botoes: [
                { texto: 'Cancelar', classe: 'bd-btn-secondary', acao: 'fechar' },
                { 
                    texto: '🗑️ Remover Personalização', 
                    classe: 'bd-btn-warning', 
                    acao: () => removerMeta(nomeColecao)
                },
                { 
                    texto: '💾 Salvar', 
                    classe: 'bd-btn-primary', 
                    acao: () => salvarMeta(nomeColecao)
                }
            ]
        });

        // Eventos de pré-visualização
        setTimeout(() => {
            const updatePreview = () => {
                const l = document.getElementById('bdMetaLabel')?.value || '';
                const i = document.getElementById('bdMetaIcone')?.value || 'fa-cube';
                const c = document.getElementById('bdMetaCor')?.value || '#94a3b8';
                const item = document.getElementById('bdPreviewItem');
                const lbl = document.getElementById('bdPreviewLabel');
                if (item && lbl) {
                    const iconeEl = item.querySelector('i');
                    if (iconeEl) {
                        iconeEl.className = `fas ${i}`;
                        iconeEl.style.color = c;
                    }
                    lbl.textContent = l;
                }
            };
            
            document.getElementById('bdMetaLabel')?.addEventListener('input', updatePreview);
            document.getElementById('bdMetaIcone')?.addEventListener('change', updatePreview);
            document.getElementById('bdMetaCor')?.addEventListener('input', updatePreview);
        }, 100);
    }

    // =====================================================================
    // SALVAR METADADOS
    // =====================================================================
    async function salvarMeta(nomeColecao) {
        const label = document.getElementById('bdMetaLabel')?.value?.trim();
        const icone = document.getElementById('bdMetaIcone')?.value;
        const cor = document.getElementById('bdMetaCor')?.value;
        const moduloKey = document.getElementById('bdMetaModulo')?.value;
        const descricao = document.getElementById('bdMetaDescricao')?.value?.trim();

        if (!label) {
            mostrarToast('❌ Nome de exibição é obrigatório', 'error');
            return;
        }

        try {
            await api(`/meta/${nomeColecao}`, {
                method: 'PUT',
                body: JSON.stringify({ label, icone, cor, moduloKey, descricao })
            });

            fecharModal();
            mostrarToast('✅ Personalização salva!', 'success');

            // Recarregar módulos
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

    // =====================================================================
    // REMOVER METADADOS
    // =====================================================================
    async function removerMeta(nomeColecao) {
        const confirmar = await confirmarAcao(
            '🗑️ Remover Personalização',
            `Deseja remover as personalizações da coleção <code>${nomeColecao}</code>?<br><br>
            Ela voltará a aparecer com o nome automático em <strong>"Outros"</strong>.`
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
    // FORMATAR VALOR
    // =====================================================================
    function formatarValor(valor) {
        if (valor === null || valor === undefined) return '<span class="bd-muted">—</span>';

        if (typeof valor === 'boolean') {
            return valor
                ? '<span class="bd-badge bd-badge-success">Sim</span>'
                : '<span class="bd-badge bd-badge-secondary">Não</span>';
        }

        if (valor instanceof Date || (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(valor))) {
            try {
                const d = new Date(valor);
                if (!isNaN(d.getTime())) {
                    return d.toLocaleString('pt-BR', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                    });
                }
            } catch (e) {}
        }

        if (typeof valor === 'object') {
            const str = JSON.stringify(valor);
            return `<span class="bd-json-mini" title="${str.replace(/"/g, '&quot;')}">${str.length > 50 ? str.substring(0, 50) + '...' : str}</span>`;
        }

        const str = String(valor);
        if (str.length > 60) {
            return `<span title="${str.replace(/"/g, '&quot;')}">${str.substring(0, 60)}...</span>`;
        }

        return str;
    }

    // =====================================================================
    // FORMATAR LABEL AUTOMÁTICO
    // =====================================================================
    function formatarLabelAutomatico(nome) {
        return nome
            .replace(/_/g, ' ')
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .split(' ')
            .filter(p => p.length > 0)
            .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
            .join(' ');
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
    // VER REGISTRO (JSON)
    // =====================================================================
    function verRegistro(id) {
        const registro = state.registros.find(r => r._id === id);
        if (!registro) return;

        const jsonStr = JSON.stringify(registro, null, 2);

        criarModal({
            titulo: `🔍 Detalhes do Registro`,
            conteudo: `
                <div style="background: #1e293b; color: #e2e8f0; border-radius: 12px; padding: 20px; overflow-x: auto;">
                    <pre style="margin: 0; font-family: 'Courier New', monospace; font-size: 12px; line-height: 1.6;">${escapeHtml(jsonStr)}</pre>
                </div>
            `,
            botoes: [
                { texto: 'Fechar', classe: 'bd-btn-secondary', acao: 'fechar' }
            ]
        });
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
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
                {
                    texto: 'Executar Exclusão',
                    classe: 'bd-btn-danger',
                    acao: () => executarExclusaoMassa()
                }
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
        const codigoConfirmacao = `LIMPAR_${nome.toUpperCase()}`;

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
                        <i class="fas fa-info-circle"></i>
                        <strong>Para confirmar, digite exatamente:</strong>
                    </p>
                    <code style="background: white; padding: 8px 12px; border-radius: 6px; display: block; text-align: center; font-size: 14px; font-weight: 700; color: #dc2626;">${codigoConfirmacao}</code>
                </div>

                <input type="text" id="bdCodigoConfirmacao" 
                    placeholder="Digite o código acima..."
                    style="width: 100%; padding: 12px; border: 2px solid #e5e7eb; border-radius: 8px; font-size: 14px; text-align: center; font-family: monospace; font-weight: 600;"
                    autocomplete="off">
            `,
            botoes: [
                { texto: 'Cancelar', classe: 'bd-btn-secondary', acao: 'fechar' },
                {
                    texto: 'LIMPAR DEFINITIVAMENTE',
                    classe: 'bd-btn-danger',
                    acao: () => executarLimparColecao(codigoConfirmacao)
                }
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

    // =====================================================================
    // CONFIRMAR
    // =====================================================================
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

    // =====================================================================
    // TOAST
    // =====================================================================
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

    // =====================================================================
    // ATUALIZAR TUDO
    // =====================================================================
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
        excluirRegistro,
        abrirExclusaoMassa,
        abrirLimparColecao,
        abrirModalEditarMeta,
        atualizarTudo,
        fecharModal,
        executarAcaoBotao,
        getState: () => ({ ...state })
    };

    console.log('✅ Módulo Banco de Dados pronto');
})();