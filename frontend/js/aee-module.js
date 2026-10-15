// js/aee-module.js
// ============================================================================
// AEE - ATENDIMENTO EDUCACIONAL ESPECIALIZADO
// Módulo do Setor Pedagógico - EducaPleno
// ============================================================================
// Responsável por:
//   - Dashboard AEE (métricas de alunos com acessibilidade)
//   - Alunos AEE (listagem, filtros, detalhes)
//   - Provas Adaptadas (visualização e impressão)
//   - Relatórios AEE (acessibilidade, por turma, por aluno)
//
// Padrão: objeto global (igual a GestaoProfessoresModule)
// Autor: Equipe de Desenvolvimento
// ============================================================================

window.AeeModule = {

    // ============================================
    // ESTADO
    // ============================================
    alunos: [],
    provas: [],
    relatorioAtual: null,
    charts: {
        condicoes: null,
        turmas: null
    },
    filtros: {
        condicao: 'todos',
        turma: '',
        curso: '',
        status: 'todos',
        busca: ''
    },
    paginacao: {
        paginaAtual: 1,
        porPagina: 50,
        total: 0,
        totalPaginas: 0
    },

    // ============================================
    // CONSTANTES
    // ============================================
    CONDICOES_LABELS: {
        'visual': 'Deficiência Visual',
        'auditiva': 'Deficiência Auditiva',
        'motora': 'Deficiência Motora',
        'intelectual': 'Deficiência Intelectual',
        'dislexia': 'Dislexia',
        'tdah': 'TDAH',
        'tea': 'Transtorno do Espectro Autista (TEA)',
        'altas_habilidades': 'Altas Habilidades/Superdotação',
        'deficiencia_multipla': 'Deficiência Múltipla',
        'surdocegueira': 'Surdocegueira',
        'outra': 'Outra Condição',
        'nao_especificada': 'Não especificada'
    },

    CONDICOES_ICONES: {
        'visual': 'fa-eye',
        'auditiva': 'fa-deaf',
        'motora': 'fa-wheelchair',
        'intelectual': 'fa-brain',
        'dislexia': 'fa-book-reader',
        'tdah': 'fa-bolt',
        'tea': 'fa-puzzle-piece',
        'altas_habilidades': 'fa-star',
        'deficiencia_multipla': 'fa-hands',
        'surdocegueira': 'fa-hands',
        'outra': 'fa-heart',
        'nao_especificada': 'fa-question'
    },

    CONDICOES_CORES: {
        'visual': '#3b82f6',
        'auditiva': '#8b5cf6',
        'motora': '#06b6d4',
        'intelectual': '#ec4899',
        'dislexia': '#f59e0b',
        'tdah': '#ef4444',
        'tea': '#10b981',
        'altas_habilidades': '#eab308',
        'deficiencia_multipla': '#6366f1',
        'surdocegueira': '#14b8a6',
        'outra': '#64748b',
        'nao_especificada': '#94a3b8'
    },

    // ============================================
    // UTILITÁRIOS
    // ============================================
    getToken() {
        return localStorage.getItem('auth_token');
    },

    safeGet(id) {
        return document.getElementById(id);
    },

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    mostrarToast(mensagem, tipo = 'info') {
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };

        const toast = document.createElement('div');
        toast.className = `aee-toast ${tipo}`;
        toast.innerHTML = `
            <i class="fas ${icons[tipo]}"></i>
            <span>${mensagem}</span>
        `;

        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'aeeSlideIn 0.3s ease reverse';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    },

    getLabelCondicao(condicao) {
        if (!condicao) return this.CONDICOES_LABELS['nao_especificada'];
        return this.CONDICOES_LABELS[condicao] || 'Condição Especial';
    },

    getIconeCondicao(condicao) {
        if (!condicao) return this.CONDICOES_ICONES['nao_especificada'];
        return this.CONDICOES_ICONES[condicao] || 'fa-heart';
    },

    getCorCondicao(condicao) {
        if (!condicao) return this.CONDICOES_CORES['nao_especificada'];
        return this.CONDICOES_CORES[condicao] || '#64748b';
    },

    getDataLocalISO(dateObj) {
        const d = dateObj || new Date();
        return d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0');
    },

    gerarAvatarSVG(nome) {
        const inicial = (nome || '?').charAt(0).toUpperCase();
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80"><circle cx="40" cy="40" r="40" fill="#6366f1"/><text x="40" y="40" font-family="Arial" font-size="36" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="central">${inicial}</text></svg>`;
        return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
    },

    formatarData(data) {
        if (!data) return '-';
        try {
            return new Date(data).toLocaleDateString('pt-BR');
        } catch (e) {
            return '-';
        }
    },

    formatarDataHora(data) {
        if (!data) return '-';
        try {
            return new Date(data).toLocaleString('pt-BR');
        } catch (e) {
            return '-';
        }
    },

    // ============================================
    // INIT
    // ============================================
    async init() {
        console.log('🚀 Inicializando AEE Module...');

        // Renderiza estrutura principal
        this.renderizarEstrutura();

        // Aplica eventos
        setTimeout(() => {
            this.aplicarEventos();
        }, 100);

        // Carrega dashboard por padrão
        await this.carregarDashboard();

        console.log('✅ AEE Module inicializado');
    },

    // ============================================
    // ESTRUTURA PRINCIPAL (TABS)
    // ============================================
    renderizarEstrutura() {
        const content = this.safeGet('content');
        if (!content) return;

        content.innerHTML = `
            <div class="aee-container">
                <!-- Header do módulo -->
                <div class="aee-header">
                    <div class="aee-header-icon">
                        <i class="fas fa-universal-access"></i>
                    </div>
                    <div class="aee-header-info">
                        <h2>AEE - Atendimento Educacional Especializado</h2>
                        <p>Acompanhamento pedagógico de alunos com necessidades educacionais específicas</p>
                    </div>
                </div>

                <!-- Tabs -->
                <ul class="aee-tabs" role="tablist">
                    <li class="aee-tab-item">
                        <button class="aee-tab active" id="aeeTabDashboard" data-tab="dashboard" type="button">
                            <i class="fas fa-chart-line"></i>
                            <span>Dashboard</span>
                        </button>
                    </li>
                    <li class="aee-tab-item">
                        <button class="aee-tab" id="aeeTabAlunos" data-tab="alunos" type="button">
                            <i class="fas fa-users"></i>
                            <span>Alunos AEE</span>
                            <span class="aee-tab-badge" id="aeeBadgeAlunos">0</span>
                        </button>
                    </li>
                    <li class="aee-tab-item">
                        <button class="aee-tab" id="aeeTabProvas" data-tab="provas" type="button">
                            <i class="fas fa-file-alt"></i>
                            <span>Provas</span>
                        </button>
                    </li>
                    <li class="aee-tab-item">
                        <button class="aee-tab" id="aeeTabRelatorios" data-tab="relatorios" type="button">
                            <i class="fas fa-chart-bar"></i>
                            <span>Relatórios</span>
                        </button>
                    </li>
                </ul>

                <!-- Conteúdo das tabs -->
                <div class="aee-tab-content">
                    <div class="aee-tab-pane active" id="aeePaneDashboard">
                        <div class="text-center py-5">
                            <div class="aee-loading"></div>
                            <p class="mt-3 text-muted">Carregando dashboard...</p>
                        </div>
                    </div>

                    <div class="aee-tab-pane" id="aeePaneAlunos" style="display: none;">
                        <div class="text-center py-5">
                            <div class="aee-loading"></div>
                            <p class="mt-3 text-muted">Carregando alunos...</p>
                        </div>
                    </div>

                    <div class="aee-tab-pane" id="aeePaneProvas" style="display: none;">
                        <div class="text-center py-5">
                            <div class="aee-loading"></div>
                            <p class="mt-3 text-muted">Carregando provas...</p>
                        </div>
                    </div>

                    <div class="aee-tab-pane" id="aeePaneRelatorios" style="display: none;">
                        <div class="text-center py-5">
                            <div class="aee-loading"></div>
                            <p class="mt-3 text-muted">Carregando relatórios...</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    aplicarEventos() {
        // Tabs
        document.querySelectorAll('.aee-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const target = tab.dataset.tab;
                this.trocarTab(target);
            });
        });
    },

    trocarTab(nome) {
        // Atualiza botões
        document.querySelectorAll('.aee-tab').forEach(t => t.classList.remove('active'));
        const tab = document.querySelector(`.aee-tab[data-tab="${nome}"]`);
        if (tab) tab.classList.add('active');

        // Atualiza painéis
        document.querySelectorAll('.aee-tab-pane').forEach(p => p.style.display = 'none');
        const pane = this.safeGet(`aeePane${nome.charAt(0).toUpperCase() + nome.slice(1)}`);
        if (pane) pane.style.display = 'block';

        // Carrega dados específicos
        switch (nome) {
            case 'dashboard':
                this.carregarDashboard();
                break;
            case 'alunos':
                this.carregarAlunos();
                break;
            case 'provas':
                this.carregarProvas();
                break;
            case 'relatorios':
                this.renderizarRelatorios();
                break;
        }
    },

    // ============================================
    // DASHBOARD AEE
    // ============================================
    async carregarDashboard() {
        const pane = this.safeGet('aeePaneDashboard');
        if (!pane) return;

        pane.innerHTML = `
            <div class="text-center py-5">
                <div class="aee-loading"></div>
                <p class="mt-3 text-muted">Carregando dashboard...</p>
            </div>
        `;

        try {
            const response = await fetch('/api/aee/dashboard', {
                headers: { 'Authorization': `Bearer ${this.getToken()}` }
            });
            const data = await response.json();

            if (!data.success) throw new Error(data.error || 'Erro ao carregar');

            const d = data.dashboard;

            pane.innerHTML = `
                <!-- Cards de métricas -->
                <div class="aee-stats-grid">
                    <div class="aee-stat-card" style="background: linear-gradient(135deg, #6366f1, #8b5cf6);">
                        <div class="aee-stat-icon"><i class="fas fa-users"></i></div>
                        <div class="aee-stat-value">${d.totalAlunosComAcessibilidade}</div>
                        <div class="aee-stat-label">Alunos AEE</div>
                        <div class="aee-stat-sub">de ${d.totalAlunos} alunos</div>
                    </div>

                    <div class="aee-stat-card" style="background: linear-gradient(135deg, #10b981, #059669);">
                        <div class="aee-stat-icon"><i class="fas fa-check-circle"></i></div>
                        <div class="aee-stat-value">${d.alunosAprovados}</div>
                        <div class="aee-stat-label">Aprovados</div>
                        <div class="aee-stat-sub">adaptações ativas</div>
                    </div>

                    <div class="aee-stat-card" style="background: linear-gradient(135deg, #f59e0b, #d97706);">
                        <div class="aee-stat-icon"><i class="fas fa-clock"></i></div>
                        <div class="aee-stat-value">${d.alunosPendentes}</div>
                        <div class="aee-stat-label">Pendentes</div>
                        <div class="aee-stat-sub">aguardando aprovação</div>
                    </div>

                    <div class="aee-stat-card" style="background: linear-gradient(135deg, #ec4899, #db2777);">
                        <div class="aee-stat-icon"><i class="fas fa-file-alt"></i></div>
                        <div class="aee-stat-value">${d.totalProvasAdaptadas}</div>
                        <div class="aee-stat-label">Provas Adaptadas</div>
                        <div class="aee-stat-sub">publicadas</div>
                    </div>
                </div>

                <!-- Taxa de acessibilidade -->
                <div class="aee-card">
                    <div class="aee-card-header">
                        <h3><i class="fas fa-percentage"></i> Taxa de Acessibilidade</h3>
                    </div>
                    <div class="aee-card-body">
                        <div class="aee-taxa-container">
                            <div class="aee-taxa-valor">${d.taxaAcessibilidade}%</div>
                            <div class="aee-taxa-barra">
                                <div class="aee-taxa-progresso" style="width: ${d.taxaAcessibilidade}%"></div>
                            </div>
                            <p class="aee-taxa-desc">
                                ${d.totalAlunosComAcessibilidade} de ${d.totalAlunos} alunos possuem necessidades educacionais específicas
                            </p>
                        </div>
                    </div>
                </div>

                <!-- Grid: Condições + Turmas -->
                <div class="aee-grid-2">
                    <div class="aee-card">
                        <div class="aee-card-header">
                            <h3><i class="fas fa-heart"></i> Distribuição por Condição</h3>
                        </div>
                        <div class="aee-card-body">
                            ${d.distribuicaoCondicoes.length > 0 ? `
                                <div class="aee-chart-container">
                                    <canvas id="aeeChartCondicoes"></canvas>
                                </div>
                                <div class="aee-condicoes-list">
                                    ${d.distribuicaoCondicoes.map(c => `
                                        <div class="aee-condicao-item">
                                            <div class="aee-condicao-label">
                                                <i class="fas ${this.getIconeCondicao(c.condicao)}" style="color: ${this.getCorCondicao(c.condicao)};"></i>
                                                <span>${this.escapeHtml(c.label)}</span>
                                            </div>
                                            <div class="aee-condicao-count">
                                                <span class="aee-count-badge" style="background: ${this.getCorCondicao(c.condicao)}20; color: ${this.getCorCondicao(c.condicao)};">
                                                    ${c.count}
                                                </span>
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            ` : '<div class="aee-empty">Nenhum dado disponível</div>'}
                        </div>
                    </div>

                    <div class="aee-card">
                        <div class="aee-card-header">
                            <h3><i class="fas fa-school"></i> Top Turmas</h3>
                        </div>
                        <div class="aee-card-body">
                            ${d.distribuicaoTurmas.length > 0 ? `
                                <div class="aee-chart-container">
                                    <canvas id="aeeChartTurmas"></canvas>
                                </div>
                            ` : '<div class="aee-empty">Nenhum dado disponível</div>'}
                        </div>
                    </div>
                </div>

                <!-- Alunos recentes -->
                <div class="aee-card">
                    <div class="aee-card-header">
                        <h3><i class="fas fa-user-plus"></i> Alunos Recentes</h3>
                        <button class="aee-btn aee-btn-outline" onclick="AeeModule.trocarTab('alunos')">
                            Ver todos <i class="fas fa-arrow-right"></i>
                        </button>
                    </div>
                    <div class="aee-card-body">
                        ${d.alunosRecentes.length > 0 ? `
                            <div class="aee-recentes-list">
                                ${d.alunosRecentes.map(a => `
                                    <div class="aee-recente-item" onclick="AeeModule.verDetalhesAluno('${a.id}')">
                                        <div class="aee-recente-avatar">
                                            <i class="fas ${this.getIconeCondicao(
                                                Object.keys(this.CONDICOES_LABELS).find(k => this.CONDICOES_LABELS[k] === a.condicao)
                                            )}"></i>
                                        </div>
                                        <div class="aee-recente-info">
                                            <strong>${this.escapeHtml(a.nome)}</strong>
                                            <span>${this.escapeHtml(a.turma || 'Sem turma')} • ${this.escapeHtml(a.condicao)}</span>
                                        </div>
                                        <i class="fas fa-chevron-right"></i>
                                    </div>
                                `).join('')}
                            </div>
                        ` : '<div class="aee-empty">Nenhum aluno recente</div>'}
                    </div>
                </div>
            `;

            // Renderiza gráficos
            setTimeout(() => {
                this.renderizarGraficos(d);
            }, 100);

            // Atualiza badge
            const badge = this.safeGet('aeeBadgeAlunos');
            if (badge) badge.textContent = d.totalAlunosComAcessibilidade;

        } catch (error) {
            console.error('❌ Erro no dashboard AEE:', error);
            pane.innerHTML = `
                <div class="aee-error">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Erro ao carregar dashboard</h3>
                    <p>${error.message}</p>
                    <button class="aee-btn aee-btn-primary" onclick="AeeModule.carregarDashboard()">
                        <i class="fas fa-sync-alt"></i> Tentar novamente
                    </button>
                </div>
            `;
        }
    },

    renderizarGraficos(d) {
        // Gráfico de condições (doughnut)
        const ctxCond = this.safeGet('aeeChartCondicoes');
        if (ctxCond && d.distribuicaoCondicoes.length > 0) {
            if (this.charts.condicoes) {
                try { this.charts.condicoes.destroy(); } catch (e) {}
            }

            this.charts.condicoes = new Chart(ctxCond.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: d.distribuicaoCondicoes.map(c => c.label),
                    datasets: [{
                        data: d.distribuicaoCondicoes.map(c => c.count),
                        backgroundColor: d.distribuicaoCondicoes.map(c => this.getCorCondicao(c.condicao)),
                        borderWidth: 3,
                        borderColor: '#ffffff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '65%',
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                padding: 12,
                                usePointStyle: true,
                                pointStyle: 'circle',
                                font: { size: 11, family: 'Inter' }
                            }
                        },
                        tooltip: {
                            backgroundColor: '#1f2937',
                            padding: 12,
                            cornerRadius: 8,
                            titleFont: { size: 13, weight: 'bold' },
                            bodyFont: { size: 12 }
                        }
                    }
                }
            });
        }

        // Gráfico de turmas (bar horizontal)
        const ctxTurmas = this.safeGet('aeeChartTurmas');
        if (ctxTurmas && d.distribuicaoTurmas.length > 0) {
            if (this.charts.turmas) {
                try { this.charts.turmas.destroy(); } catch (e) {}
            }

            const cores = [
                '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
                '#ec4899', '#f43f5e', '#f97316', '#f59e0b',
                '#10b981', '#06b6d4'
            ];

            this.charts.turmas = new Chart(ctxTurmas.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: d.distribuicaoTurmas.map(t => t.turma),
                    datasets: [{
                        label: 'Alunos',
                        data: d.distribuicaoTurmas.map(t => t.count),
                        backgroundColor: d.distribuicaoTurmas.map((_, i) => cores[i % cores.length]),
                        borderRadius: 6,
                        maxBarThickness: 24
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    indexAxis: 'y',
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: '#1f2937',
                            padding: 12,
                            cornerRadius: 8,
                            callbacks: {
                                title: (items) => `🏫 ${items[0].label}`,
                                label: (ctx) => `${ctx.parsed.x} aluno(s)`
                            }
                        }
                    },
                    scales: {
                        x: {
                            beginAtZero: true,
                            ticks: { stepSize: 1, precision: 0, font: { size: 11 } },
                            grid: { color: '#f3f4f6', drawBorder: false }
                        },
                        y: {
                            grid: { display: false },
                            ticks: { font: { size: 11, weight: '600' }, color: '#374151' }
                        }
                    }
                }
            });
        }
    },

    // ============================================
    // ALUNOS AEE
    // ============================================
    async carregarAlunos() {
        const pane = this.safeGet('aeePaneAlunos');
        if (!pane) return;

        pane.innerHTML = `
            <div class="text-center py-5">
                <div class="aee-loading"></div>
                <p class="mt-3 text-muted">Carregando alunos...</p>
            </div>
        `;

        try {
            const params = new URLSearchParams();
            if (this.filtros.condicao && this.filtros.condicao !== 'todos') {
                params.append('condicao', this.filtros.condicao);
            }
            if (this.filtros.turma) params.append('turma', this.filtros.turma);
            if (this.filtros.curso) params.append('curso', this.filtros.curso);
            if (this.filtros.status && this.filtros.status !== 'todos') {
                params.append('status', this.filtros.status);
            }
            if (this.filtros.busca) params.append('busca', this.filtros.busca);
            params.append('page', this.paginacao.paginaAtual);
            params.append('limit', this.paginacao.porPagina);

            const response = await fetch(`/api/aee/alunos?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${this.getToken()}` }
            });
            const data = await response.json();

            if (!data.success) throw new Error(data.error || 'Erro ao carregar');

            this.alunos = data.alunos;
            this.paginacao.total = data.total;
            this.paginacao.totalPaginas = data.paginacao.pages;

            this.renderizarAlunos(data);

            // Atualiza badge
            const badge = this.safeGet('aeeBadgeAlunos');
            if (badge) badge.textContent = data.total;

        } catch (error) {
            console.error('❌ Erro ao carregar alunos:', error);
            pane.innerHTML = `
                <div class="aee-error">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Erro ao carregar alunos</h3>
                    <p>${error.message}</p>
                    <button class="aee-btn aee-btn-primary" onclick="AeeModule.carregarAlunos()">
                        <i class="fas fa-sync-alt"></i> Tentar novamente
                    </button>
                </div>
            `;
        }
    },

    renderizarAlunos(data) {
        const pane = this.safeGet('aeePaneAlunos');
        if (!pane) return;

        pane.innerHTML = `
            <!-- Filtros -->
            <div class="aee-filtros">
                <div class="aee-filtros-row">
                    <div class="aee-filtro-item aee-filtro-busca">
                        <i class="fas fa-search"></i>
                        <input type="text" id="aeeBusca" placeholder="Buscar por nome, matrícula ou email..."
                            value="${this.escapeHtml(this.filtros.busca)}">
                    </div>

                    <div class="aee-filtro-item">
                        <label>Condição</label>
                        <select id="aeeFiltroCondicao">
                            <option value="todos">Todas</option>
                            ${data.filtros.condicoes.map(c => `
                                <option value="${c.valor}" ${this.filtros.condicao === c.valor ? 'selected' : ''}>
                                    ${c.label}
                                </option>
                            `).join('')}
                        </select>
                    </div>

                    <div class="aee-filtro-item">
                        <label>Turma</label>
                        <select id="aeeFiltroTurma">
                            <option value="">Todas</option>
                            ${data.filtros.turmas.map(t => `
                                <option value="${this.escapeHtml(t)}" ${this.filtros.turma === t ? 'selected' : ''}>
                                    ${this.escapeHtml(t)}
                                </option>
                            `).join('')}
                        </select>
                    </div>

                    <div class="aee-filtro-item">
                        <label>Status</label>
                        <select id="aeeFiltroStatus">
                            <option value="todos" ${this.filtros.status === 'todos' ? 'selected' : ''}>Todos</option>
                            <option value="aprovada" ${this.filtros.status === 'aprovada' ? 'selected' : ''}>✓ Aprovada</option>
                            <option value="pendente" ${this.filtros.status === 'pendente' ? 'selected' : ''}>⏳ Pendente</option>
                        </select>
                    </div>

                    <button class="aee-btn aee-btn-outline" onclick="AeeModule.limparFiltros()" title="Limpar filtros">
                        <i class="fas fa-eraser"></i>
                    </button>
                </div>
            </div>

            <!-- Contador -->
            <div class="aee-contador">
                <i class="fas fa-users"></i>
                <strong>${data.total}</strong> aluno(s) encontrado(s)
            </div>

            <!-- Lista -->
            ${data.alunos.length > 0 ? `
                <div class="aee-alunos-grid">
                    ${data.alunos.map(aluno => `
                        <div class="aee-aluno-card" onclick="AeeModule.verDetalhesAluno('${aluno.id}')">
                            <div class="aee-aluno-avatar" style="background: ${this.getCorCondicao(aluno.condicao.tipo)}20; color: ${this.getCorCondicao(aluno.condicao.tipo)};">
                                <i class="fas ${this.getIconeCondicao(aluno.condicao.tipo)}"></i>
                            </div>
                            <div class="aee-aluno-info">
                                <div class="aee-aluno-nome">${this.escapeHtml(aluno.nome)}</div>
                                <div class="aee-aluno-detalhes">
                                    <span><i class="fas fa-id-card"></i> ${this.escapeHtml(aluno.matricula)}</span>
                                    <span><i class="fas fa-graduation-cap"></i> ${this.escapeHtml(aluno.turma || '-')}</span>
                                </div>
                                <div class="aee-aluno-condicao" style="background: ${this.getCorCondicao(aluno.condicao.tipo)}15; color: ${this.getCorCondicao(aluno.condicao.tipo)};">
                                    <i class="fas ${this.getIconeCondicao(aluno.condicao.tipo)}"></i>
                                    ${this.escapeHtml(aluno.condicao.label)}
                                </div>
                            </div>
                            <div class="aee-aluno-status aee-status-${aluno.status}">
                                ${aluno.status === 'aprovada'
                                    ? '<i class="fas fa-check-circle"></i> Aprovada'
                                    : '<i class="fas fa-clock"></i> Pendente'}
                            </div>
                        </div>
                    `).join('')}
                </div>

                ${this.renderizarPaginacao()}
            ` : `
                <div class="aee-empty-state">
                    <i class="fas fa-user-slash"></i>
                    <h3>Nenhum aluno encontrado</h3>
                    <p>Tente ajustar os filtros ou verifique se há alunos cadastrados com necessidades de acessibilidade.</p>
                </div>
            `}
        `;

        // Eventos dos filtros
        setTimeout(() => {
            this.aplicarEventosFiltros();
        }, 50);
    },

    aplicarEventosFiltros() {
        const busca = this.safeGet('aeeBusca');
        const condicao = this.safeGet('aeeFiltroCondicao');
        const turma = this.safeGet('aeeFiltroTurma');
        const status = this.safeGet('aeeFiltroStatus');

        if (busca) {
            let timeout;
            busca.addEventListener('input', (e) => {
                clearTimeout(timeout);
                timeout = setTimeout(() => {
                    this.filtros.busca = e.target.value;
                    this.paginacao.paginaAtual = 1;
                    this.carregarAlunos();
                }, 400);
            });
        }

        if (condicao) {
            condicao.addEventListener('change', (e) => {
                this.filtros.condicao = e.target.value;
                this.paginacao.paginaAtual = 1;
                this.carregarAlunos();
            });
        }

        if (turma) {
            turma.addEventListener('change', (e) => {
                this.filtros.turma = e.target.value;
                this.paginacao.paginaAtual = 1;
                this.carregarAlunos();
            });
        }

        if (status) {
            status.addEventListener('change', (e) => {
                this.filtros.status = e.target.value;
                this.paginacao.paginaAtual = 1;
                this.carregarAlunos();
            });
        }
    },

    limparFiltros() {
        this.filtros = {
            condicao: 'todos',
            turma: '',
            curso: '',
            status: 'todos',
            busca: ''
        };
        this.paginacao.paginaAtual = 1;
        this.carregarAlunos();
    },

    renderizarPaginacao() {
        const { paginaAtual, totalPaginas, total } = this.paginacao;
        if (totalPaginas <= 1) return '';

        let botoes = '';

        if (paginaAtual > 1) {
            botoes += `<button class="aee-page-btn" onclick="AeeModule.irParaPagina(${paginaAtual - 1})"><i class="fas fa-chevron-left"></i></button>`;
        }

        const inicio = Math.max(1, paginaAtual - 2);
        const fim = Math.min(totalPaginas, inicio + 4);

        for (let i = inicio; i <= fim; i++) {
            botoes += `<button class="aee-page-btn ${i === paginaAtual ? 'active' : ''}" onclick="AeeModule.irParaPagina(${i})">${i}</button>`;
        }

        if (paginaAtual < totalPaginas) {
            botoes += `<button class="aee-page-btn" onclick="AeeModule.irParaPagina(${paginaAtual + 1})"><i class="fas fa-chevron-right"></i></button>`;
        }

        return `
            <div class="aee-paginacao">
                <button class="aee-page-btn" onclick="AeeModule.irParaPagina(1)" ${paginaAtual === 1 ? 'disabled' : ''}>
                    <i class="fas fa-angle-double-left"></i>
                </button>
                ${botoes}
                <button class="aee-page-btn" onclick="AeeModule.irParaPagina(${totalPaginas})" ${paginaAtual === totalPaginas ? 'disabled' : ''}>
                    <i class="fas fa-angle-double-right"></i>
                </button>
                <span class="aee-page-info">Página ${paginaAtual} de ${totalPaginas}</span>
            </div>
        `;
    },

    irParaPagina(pagina) {
        this.paginacao.paginaAtual = pagina;
        this.carregarAlunos();
        // Scroll para o topo
        const pane = this.safeGet('aeePaneAlunos');
        if (pane) pane.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },

    // ============================================
    // DETALHES DO ALUNO
    // ============================================
    async verDetalhesAluno(id) {
        try {
            const response = await fetch(`/api/aee/alunos/${id}`, {
                headers: { 'Authorization': `Bearer ${this.getToken()}` }
            });
            const data = await response.json();

            if (!data.success) throw new Error(data.error);

            const a = data.aluno;

            // Remove modal anterior
            const antigo = this.safeGet('aeeModalDetalhes');
            if (antigo) antigo.remove();

            const modalHtml = `
                <div class="aee-modal-backdrop" id="aeeModalDetalhes">
                    <div class="aee-modal">
                        <div class="aee-modal-header" style="background: linear-gradient(135deg, ${this.getCorCondicao(a.acessibilidade.condicao.tipo)}, ${this.getCorCondicao(a.acessibilidade.condicao.tipo)}cc);">
                            <div class="aee-modal-header-content">
                                <div class="aee-modal-avatar">
                                    <i class="fas ${this.getIconeCondicao(a.acessibilidade.condicao.tipo)}"></i>
                                </div>
                                <div>
                                    <h3>${this.escapeHtml(a.nome)}</h3>
                                    <p>${this.escapeHtml(a.acessibilidade.condicao.label)}</p>
                                </div>
                            </div>
                            <button class="aee-modal-close" onclick="AeeModule.fecharModal()">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>

                        <div class="aee-modal-body">
                            <!-- Dados pessoais -->
                            <div class="aee-modal-section">
                                <h4><i class="fas fa-user"></i> Dados Pessoais</h4>
                                <div class="aee-info-grid">
                                    <div class="aee-info-item">
                                        <span class="aee-info-label">Matrícula</span>
                                        <span class="aee-info-value">${this.escapeHtml(a.matricula || 'Não informada')}</span>
                                    </div>
                                    <div class="aee-info-item">
                                        <span class="aee-info-label">Email</span>
                                        <span class="aee-info-value">${this.escapeHtml(a.email || '-')}</span>
                                    </div>
                                    <div class="aee-info-item">
                                        <span class="aee-info-label">Turma</span>
                                        <span class="aee-info-value">${this.escapeHtml(a.turma || '-')}</span>
                                    </div>
                                    <div class="aee-info-item">
                                        <span class="aee-info-label">Curso</span>
                                        <span class="aee-info-value">${this.escapeHtml(a.curso || '-')}</span>
                                    </div>
                                </div>
                            </div>

                            <!-- Acessibilidade -->
                            <div class="aee-modal-section">
                                <h4><i class="fas fa-universal-access"></i> Acessibilidade</h4>
                                <div class="aee-info-grid">
                                    <div class="aee-info-item">
                                        <span class="aee-info-label">Condição</span>
                                        <span class="aee-info-value">${this.escapeHtml(a.acessibilidade.condicao.label)}</span>
                                    </div>
                                    <div class="aee-info-item">
                                        <span class="aee-info-label">Status</span>
                                        <span class="aee-info-value aee-status-${a.acessibilidade.status}">
                                            ${a.acessibilidade.status === 'aprovada'
                                                ? '<i class="fas fa-check-circle"></i> Aprovada'
                                                : '<i class="fas fa-clock"></i> Pendente'}
                                        </span>
                                    </div>
                                    <div class="aee-info-item aee-info-full">
                                        <span class="aee-info-label">Data da Solicitação</span>
                                        <span class="aee-info-value">${this.formatarData(a.acessibilidade.dataSolicitacao)}</span>
                                    </div>
                                    ${a.acessibilidade.condicao.detalhes ? `
                                        <div class="aee-info-item aee-info-full">
                                            <span class="aee-info-label">Detalhes</span>
                                            <span class="aee-info-value">${this.escapeHtml(a.acessibilidade.condicao.detalhes)}</span>
                                        </div>
                                    ` : ''}
                                </div>
                            </div>

                            <!-- Provas realizadas -->
                            <div class="aee-modal-section">
                                <h4><i class="fas fa-file-alt"></i> Últimas Provas</h4>
                                ${a.provasRealizadas && a.provasRealizadas.length > 0 ? `
                                    <div class="aee-provas-list">
                                        ${a.provasRealizadas.map(p => `
                                            <div class="aee-prova-item">
                                                <div class="aee-prova-info">
                                                    <strong>${this.escapeHtml(p.provaTitulo || 'Sem título')}</strong>
                                                    <span>${p.adaptada ? '🎯 Adaptada' : '📝 Normal'}</span>
                                                </div>
                                                <div class="aee-prova-nota ${p.notaLiberada ? 'liberada' : ''}">
                                                    ${p.notaLiberada ? p.nota : 'Aguardando'}
                                                </div>
                                            </div>
                                        `).join('')}
                                    </div>
                                ` : '<p class="aee-empty">Nenhuma prova realizada ainda</p>'}
                            </div>
                        </div>

                        <div class="aee-modal-footer">
                            <button class="aee-btn aee-btn-outline" onclick="AeeModule.fecharModal()">
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', modalHtml);

            // Fecha ao clicar fora
            setTimeout(() => {
                const backdrop = this.safeGet('aeeModalDetalhes');
                if (backdrop) {
                    backdrop.addEventListener('click', (e) => {
                        if (e.target === backdrop) this.fecharModal();
                    });
                }
            }, 50);

        } catch (error) {
            console.error('❌ Erro ao carregar detalhes:', error);
            this.mostrarToast('Erro ao carregar detalhes: ' + error.message, 'error');
        }
    },

    fecharModal() {
        const modal = this.safeGet('aeeModalDetalhes');
        if (modal) modal.remove();
    },

    // ============================================
    // PROVAS
    // ============================================
    async carregarProvas() {
        const pane = this.safeGet('aeePaneProvas');
        if (!pane) return;

        pane.innerHTML = `
            <div class="text-center py-5">
                <div class="aee-loading"></div>
                <p class="mt-3 text-muted">Carregando provas...</p>
            </div>
        `;

        try {
            // Carrega TODAS as provas (adaptadas e normais)
            // Mas a UI destaca as adaptadas
            const response = await fetch('/api/aee/provas?tipo=todas', {
                headers: { 'Authorization': `Bearer ${this.getToken()}` }
            });
            const data = await response.json();

            if (!data.success) throw new Error(data.error);

            this.provas = data.provas;

            const adaptadas = data.provas.filter(p => p.tipo === 'adaptada');
            const normais = data.provas.filter(p => p.tipo !== 'adaptada');

            pane.innerHTML = `
                <div class="aee-provas-header">
                    <div class="aee-provas-stats">
                        <div class="aee-prova-stat">
                            <span class="aee-prova-stat-num">${data.total}</span>
                            <span class="aee-prova-stat-label">Total</span>
                        </div>
                        <div class="aee-prova-stat aee-prova-stat-adaptada">
                            <span class="aee-prova-stat-num">${adaptadas.length}</span>
                            <span class="aee-prova-stat-label">Adaptadas</span>
                        </div>
                        <div class="aee-prova-stat aee-prova-stat-normal">
                            <span class="aee-prova-stat-num">${normais.length}</span>
                            <span class="aee-prova-stat-label">Normais</span>
                        </div>
                    </div>
                </div>

                ${data.provas.length > 0 ? `
                    <div class="aee-provas-lista">
                        ${data.provas.map(prova => `
                            <div class="aee-prova-card ${prova.tipo === 'adaptada' ? 'aee-prova-card-adaptada' : ''}">
                                <div class="aee-prova-card-icon ${prova.tipo === 'adaptada' ? 'adaptada' : 'normal'}">
                                    <i class="fas ${prova.tipo === 'adaptada' ? 'fa-universal-access' : 'fa-file-alt'}"></i>
                                </div>
                                <div class="aee-prova-card-body">
                                    <div class="aee-prova-card-header">
                                        <h4>${this.escapeHtml(prova.titulo)}</h4>
                                        <span class="aee-prova-card-tipo ${prova.tipo === 'adaptada' ? 'adaptada' : 'normal'}">
                                            ${prova.tipo === 'adaptada' ? '🎯 Adaptada' : '📝 Normal'}
                                        </span>
                                    </div>
                                    <div class="aee-prova-card-meta">
                                        <span><i class="fas fa-code"></i> ${this.escapeHtml(prova.codigo || '-')}</span>
                                        <span><i class="fas fa-graduation-cap"></i> ${this.escapeHtml(prova.turma?.nome || '-')}</span>
                                        <span><i class="fas fa-user-tie"></i> ${this.escapeHtml(prova.professor)}</span>
                                        <span><i class="fas fa-question-circle"></i> ${prova.quantidadeQuestoes} questões</span>
                                        <span><i class="fas fa-list"></i> ${prova.alternativas} alternativas</span>
                                    </div>
                                </div>
                                <div class="aee-prova-card-actions">
                                    <button class="aee-btn aee-btn-outline" onclick="AeeModule.visualizarProva('${prova.id}')" title="Visualizar">
                                        <i class="fas fa-eye"></i>
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                ` : `
                    <div class="aee-empty-state">
                        <i class="fas fa-file-alt"></i>
                        <h3>Nenhuma prova encontrada</h3>
                        <p>Não há provas publicadas no momento.</p>
                    </div>
                `}
            `;

        } catch (error) {
            console.error('❌ Erro ao carregar provas:', error);
            pane.innerHTML = `
                <div class="aee-error">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Erro ao carregar provas</h3>
                    <p>${error.message}</p>
                    <button class="aee-btn aee-btn-primary" onclick="AeeModule.carregarProvas()">
                        <i class="fas fa-sync-alt"></i> Tentar novamente
                    </button>
                </div>
            `;
        }
    },

    async visualizarProva(provaId) {
        try {
            const response = await fetch(`/api/aee/provas/${provaId}`, {
                headers: { 'Authorization': `Bearer ${this.getToken()}` }
            });
            const data = await response.json();

            if (!data.success) throw new Error(data.error);

            const p = data.prova;

            // Monta questões HTML
            let questoesHtml = '';
            p.questoes.forEach((q, idx) => {
                questoesHtml += `
                    <div class="aee-questao">
                        <div class="aee-questao-numero">Questão ${q.numero}</div>
                        <div class="aee-questao-pergunta">${this.escapeHtml(q.pergunta)}</div>
                        <div class="aee-questao-opcoes">
                            ${(q.opcoes || []).map((op, i) => `
                                <div class="aee-questao-opcao">
                                    <span class="aee-opcao-letra">${String.fromCharCode(65 + i)})</span>
                                    <span class="aee-opcao-texto">${this.escapeHtml(op)}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            });

            // Remove modal anterior
            const antigo = this.safeGet('aeeModalProva');
            if (antigo) antigo.remove();

            const modalHtml = `
                <div class="aee-modal-backdrop" id="aeeModalProva">
                    <div class="aee-modal aee-modal-lg">
                        <div class="aee-modal-header" style="background: linear-gradient(135deg, #6366f1, #8b5cf6);">
                            <div class="aee-modal-header-content">
                                <div class="aee-modal-avatar">
                                    <i class="fas fa-file-alt"></i>
                                </div>
                                <div>
                                    <h3>${this.escapeHtml(p.titulo)}</h3>
                                    <p>${p.tipo === 'adaptada' ? '🎯 Prova Adaptada' : '📝 Prova Normal'} • ${p.quantidadeQuestoes} questões</p>
                                </div>
                            </div>
                            <button class="aee-modal-close" onclick="AeeModule.fecharModalProva()">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>

                        <div class="aee-modal-body">
                            <div class="aee-prova-visualizacao">
                                <div class="aee-prova-header-print">
                                    <h1>${this.escapeHtml(p.titulo)}</h1>
                                    <div class="aee-prova-info-print">
                                        <span><strong>Turma:</strong> ${this.escapeHtml(p.turma?.nome || '-')}</span>
                                        <span><strong>Professor:</strong> ${this.escapeHtml(p.professor)}</span>
                                        <span><strong>Código:</strong> ${this.escapeHtml(p.codigo || '-')}</span>
                                    </div>
                                </div>
                                <div class="aee-prova-questoes">
                                    ${questoesHtml}
                                </div>
                            </div>
                        </div>

                        <div class="aee-modal-footer">
                            <button class="aee-btn aee-btn-outline" onclick="AeeModule.fecharModalProva()">
                                <i class="fas fa-times"></i> Fechar
                            </button>
                            <button class="aee-btn aee-btn-primary" onclick="AeeModule.imprimirProva('${p.id}')">
                                <i class="fas fa-print"></i> Imprimir
                            </button>
                        </div>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', modalHtml);

            setTimeout(() => {
                const backdrop = this.safeGet('aeeModalProva');
                if (backdrop) {
                    backdrop.addEventListener('click', (e) => {
                        if (e.target === backdrop) this.fecharModalProva();
                    });
                }
            }, 50);

        } catch (error) {
            console.error('❌ Erro ao visualizar prova:', error);
            this.mostrarToast('Erro: ' + error.message, 'error');
        }
    },

    fecharModalProva() {
        const modal = this.safeGet('aeeModalProva');
        if (modal) modal.remove();
    },

    imprimirProva(provaId) {
        // Abre uma janela de impressão simples
        // (não usa as adaptações do Setor Pedagógico — apenas imprime o conteúdo já adaptado da prova)
        const modal = this.safeGet('aeeModalProva');
        if (!modal) return;

        const conteudo = modal.querySelector('.aee-prova-visualizacao');
        if (!conteudo) return;

        const win = window.open('', '_blank');
        win.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Impressão - Prova</title>
                <style>
                    @page { size: A4; margin: 15mm; }
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body { font-family: 'Times New Roman', serif; font-size: 11pt; line-height: 1.4; }
                    .aee-prova-header-print { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
                    .aee-prova-header-print h1 { font-size: 14pt; margin-bottom: 5px; }
                    .aee-prova-info-print { display: flex; justify-content: space-around; font-size: 9pt; margin-top: 5px; }
                    .aee-questao { margin-bottom: 20px; page-break-inside: avoid; }
                    .aee-questao-numero { font-weight: bold; font-size: 10pt; border-bottom: 1px solid #ccc; padding-bottom: 3px; margin-bottom: 6px; }
                    .aee-questao-pergunta { margin-bottom: 10px; font-size: 11pt; }
                    .aee-questao-opcoes { margin-left: 15px; }
                    .aee-questao-opcao { margin: 5px 0; display: flex; }
                    .aee-opcao-letra { font-weight: bold; min-width: 20px; }
                    .btn-print { display: block; margin: 15px auto; padding: 10px 24px; background: #6366f1; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; }
                    @media print { .btn-print { display: none; } }
                </style>
            </head>
            <body>
                <button class="btn-print" onclick="window.print()">🖨️ Imprimir</button>
                ${conteudo.outerHTML}
            </body>
            </html>
        `);
        win.document.close();
        win.onload = () => setTimeout(() => win.print(), 500);
    },

    // ============================================
    // RELATÓRIOS
    // ============================================
    renderizarRelatorios() {
        const pane = this.safeGet('aeePaneRelatorios');
        if (!pane) return;

        pane.innerHTML = `
            <div class="aee-card">
                <div class="aee-card-header">
                    <h3><i class="fas fa-file-alt"></i> Gerar Relatório</h3>
                </div>
                <div class="aee-card-body">
                    <div class="aee-relatorio-filtros">
                        <div class="aee-filtro-item">
                            <label>Tipo de Relatório</label>
                            <select id="aeeTipoRelatorio">
                                <option value="geral">Geral (todos os alunos)</option>
                                <option value="turma">Por Turma</option>
                                <option value="aluno">Por Aluno</option>
                            </select>
                        </div>

                        <div class="aee-filtro-item" id="aeeRelatorioTurmaDiv" style="display: none;">
                            <label>Turma</label>
                            <select id="aeeRelatorioTurma">
                                <option value="">Selecione...</option>
                            </select>
                        </div>

                        <div class="aee-filtro-item" id="aeeRelatorioAlunoDiv" style="display: none;">
                            <label>Aluno</label>
                            <select id="aeeRelatorioAluno">
                                <option value="">Selecione...</option>
                            </select>
                        </div>

                        <div class="aee-filtro-item">
                            <label>Condição</label>
                            <select id="aeeRelatorioCondicao">
                                <option value="">Todas</option>
                            </select>
                        </div>

                        <div class="aee-filtro-item">
                            <label>Status</label>
                            <select id="aeeRelatorioStatus">
                                <option value="">Todos</option>
                                <option value="aprovada">Aprovada</option>
                                <option value="pendente">Pendente</option>
                            </select>
                        </div>

                        <button class="aee-btn aee-btn-primary" onclick="AeeModule.gerarRelatorio()">
                            <i class="fas fa-search"></i> Gerar
                        </button>
                    </div>

                    <div class="aee-relatorio-botoes">
                        <button class="aee-btn aee-btn-success" onclick="AeeModule.exportarCSV()" id="aeeBtnExportarCSV" disabled>
                            <i class="fas fa-file-csv"></i> Exportar CSV
                        </button>
                        <button class="aee-btn aee-btn-danger" onclick="AeeModule.imprimirRelatorio()" id="aeeBtnImprimir" disabled>
                            <i class="fas fa-print"></i> Imprimir / PDF
                        </button>
                    </div>
                </div>
            </div>

            <div id="aeeResultadoRelatorio" class="aee-relatorio-resultado">
                <div class="aee-empty-state">
                    <i class="fas fa-chart-bar"></i>
                    <h3>Selecione os filtros e clique em Gerar</h3>
                    <p>O relatório será exibido aqui.</p>
                </div>
            </div>
        `;

        // Popula selects
        setTimeout(async () => {
            await this.popularSelectsRelatorio();
            this.aplicarEventosRelatorio();
        }, 50);
    },

    async popularSelectsRelatorio() {
        try {
            // Turmas
            const turmasResp = await fetch('/api/aee/alunos?limit=1', {
                headers: { 'Authorization': `Bearer ${this.getToken()}` }
            });
            const turmasData = await turmasResp.json();

            if (turmasData.success && turmasData.filtros) {
                const selectTurma = this.safeGet('aeeRelatorioTurma');
                if (selectTurma) {
                    selectTurma.innerHTML = '<option value="">Selecione...</option>' +
                        turmasData.filtros.turmas.map(t => `<option value="${this.escapeHtml(t)}">${this.escapeHtml(t)}</option>`).join('');
                }

                const selectCondicao = this.safeGet('aeeRelatorioCondicao');
                if (selectCondicao) {
                    selectCondicao.innerHTML = '<option value="">Todas</option>' +
                        turmasData.filtros.condicoes.map(c => `<option value="${c.valor}">${c.label}</option>`).join('');
                }
            }

            // Alunos (carrega todos para o select)
            const alunosResp = await fetch('/api/aee/alunos?limit=1000', {
                headers: { 'Authorization': `Bearer ${this.getToken()}` }
            });
            const alunosData = await alunosResp.json();

            if (alunosData.success) {
                const selectAluno = this.safeGet('aeeRelatorioAluno');
                if (selectAluno) {
                    selectAluno.innerHTML = '<option value="">Selecione...</option>' +
                        alunosData.alunos.map(a => `<option value="${a.id}">${this.escapeHtml(a.nome)} - ${this.escapeHtml(a.turma || 'Sem turma')}</option>`).join('');
                }
            }
        } catch (error) {
            console.warn('Erro ao popular selects do relatório:', error);
        }
    },

    aplicarEventosRelatorio() {
        const selectTipo = this.safeGet('aeeTipoRelatorio');
        if (selectTipo) {
            selectTipo.addEventListener('change', (e) => {
                const tipo = e.target.value;
                const divTurma = this.safeGet('aeeRelatorioTurmaDiv');
                const divAluno = this.safeGet('aeeRelatorioAlunoDiv');

                if (divTurma) divTurma.style.display = tipo === 'turma' ? 'block' : 'none';
                if (divAluno) divAluno.style.display = tipo === 'aluno' ? 'block' : 'none';
            });
        }
    },

    async gerarRelatorio() {
        const container = this.safeGet('aeeResultadoRelatorio');
        if (!container) return;

        container.innerHTML = `
            <div class="text-center py-5">
                <div class="aee-loading"></div>
                <p class="mt-3 text-muted">Gerando relatório...</p>
            </div>
        `;

        try {
            const tipo = this.safeGet('aeeTipoRelatorio')?.value || 'geral';
            const turma = this.safeGet('aeeRelatorioTurma')?.value || '';
            const alunoId = this.safeGet('aeeRelatorioAluno')?.value || '';
            const condicao = this.safeGet('aeeRelatorioCondicao')?.value || '';
            const status = this.safeGet('aeeRelatorioStatus')?.value || '';

            let url = '/api/aee/relatorio';
            const params = new URLSearchParams();

            if (tipo === 'turma' && turma) {
                url = `/api/aee/relatorio/turma/${encodeURIComponent(turma)}`;
            } else if (tipo === 'aluno' && alunoId) {
                url = `/api/aee/relatorio/aluno/${alunoId}`;
            } else {
                if (condicao) params.append('condicao', condicao);
                if (status) params.append('status', status);
                if (params.toString()) url += '?' + params.toString();
            }

            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${this.getToken()}` }
            });
            const data = await response.json();

            if (!data.success) throw new Error(data.error);

            this.relatorioAtual = data;

            // Habilita botões
            const btnCSV = this.safeGet('aeeBtnExportarCSV');
            const btnImprimir = this.safeGet('aeeBtnImprimir');
            if (btnCSV) btnCSV.disabled = false;
            if (btnImprimir) btnImprimir.disabled = false;

            this.renderizarResultadoRelatorio(data, tipo);

        } catch (error) {
            console.error('❌ Erro ao gerar relatório:', error);
            container.innerHTML = `
                <div class="aee-error">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Erro ao gerar relatório</h3>
                    <p>${error.message}</p>
                </div>
            `;
        }
    },

    renderizarResultadoRelatorio(data, tipo) {
        const container = this.safeGet('aeeResultadoRelatorio');
        if (!container) return;

        // Relatório por aluno
        if (tipo === 'aluno' && data.aluno) {
            container.innerHTML = `
                <div class="aee-card">
                    <div class="aee-card-header">
                        <h3><i class="fas fa-user"></i> ${this.escapeHtml(data.aluno.nome)}</h3>
                    </div>
                    <div class="aee-card-body">
                        <div class="aee-info-grid">
                            <div class="aee-info-item">
                                <span class="aee-info-label">Matrícula</span>
                                <span class="aee-info-value">${this.escapeHtml(data.aluno.matricula || '-')}</span>
                            </div>
                            <div class="aee-info-item">
                                <span class="aee-info-label">Turma</span>
                                <span class="aee-info-value">${this.escapeHtml(data.aluno.turma || '-')}</span>
                            </div>
                            <div class="aee-info-item">
                                <span class="aee-info-label">Condição</span>
                                <span class="aee-info-value">${this.escapeHtml(data.aluno.condicao.label)}</span>
                            </div>
                            <div class="aee-info-item">
                                <span class="aee-info-label">Status</span>
                                <span class="aee-info-value aee-status-${data.aluno.status}">
                                    ${data.aluno.status === 'aprovada' ? '✓ Aprovada' : '⏳ Pendente'}
                                </span>
                            </div>
                        </div>

                        ${data.provasRealizadas && data.provasRealizadas.length > 0 ? `
                            <h4 style="margin-top: 24px;"><i class="fas fa-file-alt"></i> Provas Realizadas</h4>
                            <div class="aee-table-responsive">
                                <table class="aee-table">
                                    <thead>
                                        <tr>
                                            <th>Prova</th>
                                            <th>Tipo</th>
                                            <th>Nota</th>
                                            <th>Data</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${data.provasRealizadas.map(p => `
                                            <tr>
                                                <td>${this.escapeHtml(p.provaTitulo || '-')}</td>
                                                <td>${p.adaptada ? '🎯 Adaptada' : '📝 Normal'}</td>
                                                <td><strong>${p.nota ?? '-'}</strong></td>
                                                <td>${this.formatarData(p.data)}</td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
            return;
        }

        // Relatório por turma
        if (tipo === 'turma' && data.alunos) {
            container.innerHTML = `
                <div class="aee-card">
                    <div class="aee-card-header">
                        <h3><i class="fas fa-school"></i> Turma: ${this.escapeHtml(data.turma)}</h3>
                        <span class="aee-count-badge">${data.total} aluno(s)</span>
                    </div>
                    <div class="aee-card-body">
                        <div class="aee-table-responsive">
                            <table class="aee-table">
                                <thead>
                                    <tr>
                                        <th>Nome</th>
                                        <th>Matrícula</th>
                                        <th>Condição</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${data.alunos.map(a => `
                                        <tr>
                                            <td><strong>${this.escapeHtml(a.nome)}</strong></td>
                                            <td>${this.escapeHtml(a.matricula || '-')}</td>
                                            <td>
                                                <span class="aee-condicao-badge" style="background: ${this.getCorCondicao(a.condicaoTipo)}20; color: ${this.getCorCondicao(a.condicaoTipo)};">
                                                    <i class="fas ${this.getIconeCondicao(a.condicaoTipo)}"></i>
                                                    ${this.escapeHtml(a.condicao)}
                                                </span>
                                            </td>
                                            <td>
                                                <span class="aee-status-badge aee-status-${a.status}">
                                                    ${a.status === 'aprovada' ? '✓ Aprovada' : '⏳ Pendente'}
                                                </span>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
            return;
        }

        // Relatório geral
        const rel = data.relatorio;
        if (!rel) {
            container.innerHTML = '<div class="aee-empty-state">Nenhum dado disponível</div>';
            return;
        }

        container.innerHTML = `
            <div class="aee-relatorio-geral">
                <div class="aee-relatorio-stats">
                    <div class="aee-stat-mini">
                        <div class="aee-stat-mini-value">${rel.totalAlunos}</div>
                        <div class="aee-stat-mini-label">Total</div>
                    </div>
                    <div class="aee-stat-mini" style="border-left: 4px solid #10b981;">
                        <div class="aee-stat-mini-value" style="color: #10b981;">${rel.totalAprovados}</div>
                        <div class="aee-stat-mini-label">Aprovados</div>
                    </div>
                    <div class="aee-stat-mini" style="border-left: 4px solid #f59e0b;">
                        <div class="aee-stat-mini-value" style="color: #f59e0b;">${rel.totalPendentes}</div>
                        <div class="aee-stat-mini-label">Pendentes</div>
                    </div>
                </div>

                <div class="aee-card">
                    <div class="aee-card-header">
                        <h3><i class="fas fa-heart"></i> Distribuição por Condição</h3>
                    </div>
                    <div class="aee-card-body">
                        ${rel.porCondicao.map(c => `
                            <div class="aee-condicao-item">
                                <div class="aee-condicao-label">
                                    <span>${this.escapeHtml(c.condicao)}</span>
                                </div>
                                <span class="aee-count-badge">${c.total}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>

                ${rel.porTurma.map(t => `
                    <div class="aee-card" style="margin-top: 16px;">
                        <div class="aee-card-header">
                            <h3><i class="fas fa-school"></i> ${this.escapeHtml(t.turma)}</h3>
                            <span class="aee-count-badge">${t.total} aluno(s)</span>
                        </div>
                        <div class="aee-card-body">
                            <div class="aee-table-responsive">
                                <table class="aee-table">
                                    <thead>
                                        <tr>
                                            <th>Nome</th>
                                            <th>Matrícula</th>
                                            <th>Condição</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${t.alunos.map(a => `
                                            <tr>
                                                <td>${this.escapeHtml(a.nome)}</td>
                                                <td>${this.escapeHtml(a.matricula || '-')}</td>
                                                <td>${this.escapeHtml(a.condicao)}</td>
                                                <td>
                                                    <span class="aee-status-badge aee-status-${a.status}">
                                                        ${a.status === 'aprovada' ? '✓ Aprovada' : '⏳ Pendente'}
                                                    </span>
                                                </td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    },

    exportarCSV() {
        if (!this.relatorioAtual) {
            this.mostrarToast('Gere um relatório primeiro', 'warning');
            return;
        }

        // Se for relatório por aluno
        if (this.relatorioAtual.aluno) {
            const a = this.relatorioAtual.aluno;
            let csv = 'Nome,Matrícula,Turma,Condição,Status\n';
            csv += `"${a.nome}","${a.matricula || ''}","${a.turma || ''}","${a.condicao.label}","${a.status}"\n`;

            this.downloadCSV(csv, `aee_aluno_${a.nome.replace(/\s/g, '_')}.csv`);
            return;
        }

        // Se for por turma
        if (this.relatorioAtual.alunos && this.relatorioAtual.turma) {
            let csv = 'Turma,Nome,Matrícula,Condição,Status\n';
            this.relatorioAtual.alunos.forEach(a => {
                csv += `"${this.relatorioAtual.turma}","${a.nome}","${a.matricula || ''}","${a.condicao}","${a.status}"\n`;
            });
            this.downloadCSV(csv, `aee_turma_${this.relatorioAtual.turma.replace(/\s/g, '_')}.csv`);
            return;
        }

        // Se for geral
        const rel = this.relatorioAtual.relatorio;
        if (!rel) return;

        let csv = 'Turma,Nome,Matrícula,Condição,Detalhes,Status\n';
        rel.porTurma.forEach(t => {
            t.alunos.forEach(a => {
                csv += [
                    `"${t.turma}"`,
                    `"${a.nome}"`,
                    `"${a.matricula || ''}"`,
                    `"${a.condicao}"`,
                    `"${a.detalhes || ''}"`,
                    `"${a.status}"`
                ].join(',') + '\n';
            });
        });
        this.downloadCSV(csv, `aee_relatorio_geral.csv`);
    },

    downloadCSV(csv, filename) {
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
        URL.revokeObjectURL(link.href);
        this.mostrarToast('✅ CSV exportado!', 'success');
    },

    imprimirRelatorio() {
        if (!this.relatorioAtual) {
            this.mostrarToast('Gere um relatório primeiro', 'warning');
            return;
        }

        const container = this.safeGet('aeeResultadoRelatorio');
        if (!container) return;

        const win = window.open('', '_blank');
        win.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Relatório AEE - Impressão</title>
                <style>
                    @page { size: A4; margin: 15mm; }
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body { font-family: Arial, sans-serif; font-size: 10pt; }
                    h1 { font-size: 14pt; text-align: center; margin-bottom: 4px; }
                    .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
                    .header p { font-size: 9pt; color: #666; }
                    .aee-card { margin-bottom: 20px; page-break-inside: avoid; }
                    .aee-card-header { background: #f3f4f6; padding: 8px 12px; border-left: 4px solid #6366f1; margin-bottom: 10px; }
                    .aee-card-header h3 { font-size: 11pt; margin: 0; }
                    .aee-table { width: 100%; border-collapse: collapse; font-size: 9pt; }
                    .aee-table th { background: #6366f1; color: white; padding: 6px 8px; text-align: left; }
                    .aee-table td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; }
                    .btn-print { display: block; margin: 15px auto; padding: 10px 24px; background: #6366f1; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; }
                    @media print { .btn-print { display: none; } }
                </style>
            </head>
            <body>
                <button class="btn-print" onclick="window.print()">🖨️ Imprimir</button>
                <div class="header">
                    <h1>Relatório AEE</h1>
                    <p>Atendimento Educacional Especializado - EducaPleno</p>
                    <p>Gerado em ${new Date().toLocaleString('pt-BR')}</p>
                </div>
                ${container.innerHTML}
            </body>
            </html>
        `);
        win.document.close();
        win.onload = () => setTimeout(() => win.print(), 500);
    }

};

// ============================================================================
// FIM DO MÓDULO
// ============================================================================