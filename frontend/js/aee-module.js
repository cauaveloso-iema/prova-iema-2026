// js/aee-module.js
// ============================================================================
// AEE - ATENDIMENTO EDUCACIONAL ESPECIALIZADO
// Módulo do Setor Pedagógico - EducaPleno
// ============================================================================
// VERSÃO 2.0 - Reescrito com:
//   - Dashboard corrigido (pega dados reais do banco)
//   - Filtros dinâmicos (condições/turmas/cursos vêm do banco)
//   - Notas corrigidas (refletem liberação real)
//   - Nova aba: Histórico de Notas com filtros e paginação
//   - Provas com filtros e impressão idêntica ao admin-simples
//   - Relatórios no mesmo padrão do Setor Pedagógico
// ============================================================================

window.AeeModule = {

    // ============================================
    // ESTADO
    // ============================================
    alunos: [],
    provas: [],
    notas: [],
    relatorioAtual: null,
    charts: {
        condicoes: null,
        turmas: null,
        desempenho: null
    },

    // Filtros - Alunos
    filtros: {
        condicao: 'todos',
        turma: 'todas',
        curso: 'todos',
        periodo: 'todos',
        status: 'todos',
        busca: ''
    },

    // Filtros - Notas
    filtrosNotas: {
        busca: '',
        turma: 'todas',
        curso: 'todos',
        periodo: 'todos',
        status: 'todos',
        ordenacao: 'data_desc'
    },

    // Filtros - Provas
    filtrosProvas: {
        busca: '',
        turma: 'todas',
        tipo: 'todas',
        periodo: 'todos'
    },

    // Paginação
    paginacao: {
        alunos: { paginaAtual: 1, porPagina: 20, total: 0, totalPaginas: 0 },
        notas: { paginaAtual: 1, porPagina: 20, total: 0, totalPaginas: 0 },
        provas: { paginaAtual: 1, porPagina: 20, total: 0, totalPaginas: 0 }
    },

    // Cache de filtros disponíveis
    filtrosDisponiveis: {
        condicoes: [],
        turmas: [],
        cursos: [],
        periodos: ['1', '2', '3', '4']
    },

    // ============================================
    // CONSTANTES
    // ============================================
    CONDICOES_LABELS: {
        'visual': 'Deficiência Visual',
        'baixa_visao': 'Baixa Visão',
        'cegueira': 'Cegueira',
        'auditiva': 'Deficiência Auditiva',
        'deficiencia_auditiva': 'Deficiência Auditiva',
        'motora': 'Deficiência Motora',
        'deficiencia_fisica': 'Deficiência Física',
        'intelectual': 'Deficiência Intelectual',
        'dislexia': 'Dislexia',
        'discalculia': 'Discalculia',
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
        'baixa_visao': 'fa-eye-low-vision',
        'cegueira': 'fa-eye-slash',
        'auditiva': 'fa-deaf',
        'deficiencia_auditiva': 'fa-deaf',
        'motora': 'fa-wheelchair',
        'deficiencia_fisica': 'fa-wheelchair',
        'intelectual': 'fa-brain',
        'dislexia': 'fa-book-reader',
        'discalculia': 'fa-calculator',
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
        'baixa_visao': '#60a5fa',
        'cegueira': '#1e40af',
        'auditiva': '#8b5cf6',
        'deficiencia_auditiva': '#8b5cf6',
        'motora': '#06b6d4',
        'deficiencia_fisica': '#06b6d4',
        'intelectual': '#ec4899',
        'dislexia': '#f59e0b',
        'discalculia': '#f97316',
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

    // ============================================
    // 📄 UTILITÁRIO: GERADOR DE CSV PROFISSIONAL
    // ============================================
    gerarBaixarCSV(opts) {
        const {
            titulo = 'Relatório',
            subtitulo = '',
            setor = 'Setor Pedagógico — AEE',
            colunas = [],
            registros = [],
            filtros = [],
            nomeArquivo = 'relatorio',
            observacoes = '',
            metricas = null
        } = opts || {};

        if (!Array.isArray(colunas) || colunas.length === 0) {
            this.mostrarToast('⚠️ Nenhuma coluna definida para exportação', 'warning');
            return false;
        }
        if (!Array.isArray(registros) || registros.length === 0) {
            this.mostrarToast('⚠️ Nenhum registro para exportar', 'warning');
            return false;
        }

        const agora = new Date();
        const dataGeracao = agora.toLocaleString('pt-BR');
        const dataArquivo = agora.toISOString().split('T')[0];

        const esc = (v) => {
            if (v === null || v === undefined) return '""';
            let s = String(v)
                .replace(/\r\n|\r|\n/g, ' ')
                .replace(/"/g, '""')
                .trim();
            return `"${s}"`;
        };

        const linhaUnica = (texto) => {
            const t = String(texto ?? '').replace(/"/g, '""');
            return `"${t}"` + ';'.repeat(Math.max(0, colunas.length - 1));
        };

        const linhaCabecalho = colunas.map(c => esc(c.label)).join(';');
        const linhasDados = registros.map(reg => {
            return colunas.map(col => {
                let v;
                try {
                    v = col.format ? col.format(reg) : reg[col.key];
                } catch (e) {
                    console.warn(`Erro coluna ${col.key}:`, e);
                    v = '';
                }
                return esc(v);
            }).join(';');
        });

        const L = [];

        L.push(linhaUnica('IEMA PLENO: SÃO LUÍS - CENTRO'));
        L.push(linhaUnica('Sistema de Atendimentos — EducaPleno'));
        L.push(linhaUnica(`Setor: ${setor}`));
        L.push(linhaUnica(''));

        L.push(linhaUnica(titulo.toUpperCase()));
        if (subtitulo) L.push(linhaUnica(subtitulo));
        L.push(linhaUnica(''));

        L.push(linhaUnica(`Data de geração: ${dataGeracao}`));
        L.push(linhaUnica(`Total de registros: ${registros.length}`));

        if (metricas && typeof metricas === 'object') {
            Object.entries(metricas).forEach(([label, valor]) => {
                if (valor !== null && valor !== undefined && valor !== '') {
                    L.push(linhaUnica(`${label}: ${valor}`));
                }
            });
        }

        if (filtros.length > 0) {
            L.push(linhaUnica('Filtros aplicados:'));
            filtros.forEach(f => {
                if (f && f.valor) L.push(linhaUnica(`  • ${f.label}: ${f.valor}`));
            });
        }

        if (observacoes) L.push(linhaUnica(`Observações: ${observacoes}`));

        L.push(linhaUnica(''));
        L.push(linhaUnica('─'.repeat(40)));
        L.push(linhaUnica(''));

        L.push(linhaCabecalho);
        L.push(...linhasDados);

        L.push(linhaUnica(''));
        L.push(linhaUnica('─'.repeat(40)));
        L.push(linhaUnica(''));

        L.push(linhaUnica('Documento gerado automaticamente pelo EducaPleno'));
        L.push(linhaUnica(`Setor responsável: ${setor}`));
        L.push(linhaUnica(`Gerado em: ${dataGeracao}`));
        L.push(linhaUnica('Este relatório é de uso interno e confidencial.'));

        const csv = '\uFEFF' + L.join('\r\n');

        try {
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.href = url;
            link.download = `${nomeArquivo}_${dataArquivo}.csv`;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            setTimeout(() => {
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            }, 100);
            return true;
        } catch (e) {
            console.error('Erro ao gerar CSV:', e);
            this.mostrarToast('❌ Erro ao gerar CSV', 'error');
            return false;
        }
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

    gerarAvatarSVG(nome) {
        const inicial = (nome || '?').charAt(0).toUpperCase();
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80"><circle cx="40" cy="40" r="40" fill="#6366f1"/><text x="40" y="40" font-family="Arial" font-size="36" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="central">${inicial}</text></svg>`;
        return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
    },

    // 🔥 Gera opções de <select> a partir de um array
    gerarOpcoesSelect(arr, valorAtual, labelVazio = 'Todas') {
        let html = `<option value="todos">${labelVazio}</option>`;
        (arr || []).forEach(item => {
            const valor = typeof item === 'string' ? item : (item.valor || item.nome || item);
            const label = typeof item === 'string' ? item : (item.label || item.nome || item);
            const selected = valorAtual === valor ? 'selected' : '';
            html += `<option value="${this.escapeHtml(valor)}" ${selected}>${this.escapeHtml(label)}</option>`;
        });
        return html;
    },

    // ============================================
    // INIT
    // ============================================
    async init() {
        console.log('🚀 Inicializando AEE Module v2.0...');

        this.renderizarEstrutura();

        setTimeout(() => {
            this.aplicarEventos();
        }, 100);

        await this.carregarDashboard();

        console.log('✅ AEE Module v2.0 inicializado');
    },

    // ============================================
    // ESTRUTURA PRINCIPAL (TABS)
    // ============================================
    renderizarEstrutura() {
        const content = this.safeGet('content');
        if (!content) return;

        content.innerHTML = `
            <div class="aee-container">
                <div class="aee-header">
                    <div class="aee-header-icon">
                        <i class="fas fa-universal-access"></i>
                    </div>
                    <div class="aee-header-info">
                        <h2>AEE - Atendimento Educacional Especializado</h2>
                        <p>Acompanhamento pedagógico de alunos com necessidades educacionais específicas</p>
                    </div>
                </div>

                <ul class="aee-tabs" role="tablist">
                    <li class="aee-tab-item">
                        <button class="aee-tab active" data-tab="dashboard" type="button">
                            <i class="fas fa-chart-line"></i>
                            <span>Dashboard</span>
                        </button>
                    </li>
                    <li class="aee-tab-item">
                        <button class="aee-tab" data-tab="alunos" type="button">
                            <i class="fas fa-users"></i>
                            <span>Alunos AEE</span>
                            <span class="aee-tab-badge" id="aeeBadgeAlunos">0</span>
                        </button>
                    </li>
                    <li class="aee-tab-item">
                        <button class="aee-tab" data-tab="notas" type="button">
                            <i class="fas fa-clipboard-list"></i>
                            <span>Histórico de Notas</span>
                        </button>
                    </li>
                    <li class="aee-tab-item">
                        <button class="aee-tab" data-tab="provas" type="button">
                            <i class="fas fa-file-alt"></i>
                            <span>Provas</span>
                        </button>
                    </li>
                    <li class="aee-tab-item">
                        <button class="aee-tab" data-tab="relatorios" type="button">
                            <i class="fas fa-chart-bar"></i>
                            <span>Relatórios</span>
                        </button>
                    </li>
                </ul>

                <div class="aee-tab-content">
                    <div class="aee-tab-pane active" id="aeePaneDashboard">
                        <div class="text-center py-5">
                            <div class="aee-loading"></div>
                            <p class="mt-3 text-muted">Carregando dashboard...</p>
                        </div>
                    </div>
                    <div class="aee-tab-pane" id="aeePaneAlunos" style="display: none;"></div>
                    <div class="aee-tab-pane" id="aeePaneNotas" style="display: none;"></div>
                    <div class="aee-tab-pane" id="aeePaneProvas" style="display: none;"></div>
                    <div class="aee-tab-pane" id="aeePaneRelatorios" style="display: none;"></div>
                </div>
            </div>
        `;
    },

    aplicarEventos() {
        document.querySelectorAll('.aee-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const target = tab.dataset.tab;
                this.trocarTab(target);
            });
        });
    },

    trocarTab(nome) {
        document.querySelectorAll('.aee-tab').forEach(t => t.classList.remove('active'));
        const tab = document.querySelector(`.aee-tab[data-tab="${nome}"]`);
        if (tab) tab.classList.add('active');

        document.querySelectorAll('.aee-tab-pane').forEach(p => p.style.display = 'none');
        const pane = this.safeGet(`aeePane${nome.charAt(0).toUpperCase() + nome.slice(1)}`);
        if (pane) pane.style.display = 'block';

        switch (nome) {
            case 'dashboard': this.carregarDashboard(); break;
            case 'alunos': this.carregarAlunos(); break;
            case 'notas': this.carregarNotas(); break;
            case 'provas': this.carregarProvas(); break;
            case 'relatorios': this.renderizarRelatorios(); break;
        }
    },

    // ============================================
    // 🔥 DASHBOARD AEE (CORRIGIDO - pega dados reais do banco)
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

            // 🔥 Atualiza filtros disponíveis
            if (d.filtrosDisponiveis) {
                this.filtrosDisponiveis.condicoes = d.filtrosDisponiveis.condicoes || [];
                this.filtrosDisponiveis.turmas = d.filtrosDisponiveis.turmas || [];
                this.filtrosDisponiveis.cursos = d.filtrosDisponiveis.cursos || [];
            }

            pane.innerHTML = `
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

                <div class="aee-card">
                    <div class="aee-card-header">
                        <h3><i class="fas fa-chart-line"></i> Desempenho Geral</h3>
                    </div>
                    <div class="aee-card-body">
                        <div class="aee-grid-4">
                            <div class="aee-mini-stat">
                                <div class="aee-mini-value" style="color: #10b981;">${d.mediaGeral || '0.0'}</div>
                                <div class="aee-mini-label">Média Geral</div>
                            </div>
                            <div class="aee-mini-stat">
                                <div class="aee-mini-value" style="color: #3b82f6;">${d.totalResultados || 0}</div>
                                <div class="aee-mini-label">Resultados</div>
                            </div>
                            <div class="aee-mini-stat">
                                <div class="aee-mini-value" style="color: #f59e0b;">${d.totalProvasRealizadas || 0}</div>
                                <div class="aee-mini-label">Provas Realizadas</div>
                            </div>
                            <div class="aee-mini-stat">
                                <div class="aee-mini-value" style="color: #8b5cf6;">${d.taxaAprovacao || 0}%</div>
                                <div class="aee-mini-label">Taxa Aprovação</div>
                            </div>
                        </div>
                    </div>
                </div>

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
                                            <i class="fas ${this.getIconeCondicao(a.condicao)}"></i>
                                        </div>
                                        <div class="aee-recente-info">
                                            <strong>${this.escapeHtml(a.nome)}</strong>
                                            <span>${this.escapeHtml(a.turma || 'Sem turma')} • ${this.escapeHtml(a.condicaoLabel)}</span>
                                        </div>
                                        <i class="fas fa-chevron-right"></i>
                                    </div>
                                `).join('')}
                            </div>
                        ` : '<div class="aee-empty">Nenhum aluno recente</div>'}
                    </div>
                </div>
            `;

            setTimeout(() => this.renderizarGraficos(d), 100);

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
        // Gráfico de condições
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
                            labels: { padding: 12, usePointStyle: true, pointStyle: 'circle', font: { size: 11 } }
                        }
                    }
                }
            });
        }

        // Gráfico de turmas
        const ctxTurmas = this.safeGet('aeeChartTurmas');
        if (ctxTurmas && d.distribuicaoTurmas.length > 0) {
            if (this.charts.turmas) {
                try { this.charts.turmas.destroy(); } catch (e) {}
            }

            const cores = ['#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#f97316', '#f59e0b', '#10b981', '#06b6d4'];

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
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { beginAtZero: true, ticks: { stepSize: 1, precision: 0, font: { size: 11 } }, grid: { color: '#f3f4f6', drawBorder: false } },
                        y: { grid: { display: false }, ticks: { font: { size: 11, weight: '600' }, color: '#374151' } }
                    }
                }
            });
        }
    },

    // ============================================
    // 🔥 ALUNOS AEE (CORRIGIDO com filtros dinâmicos)
    // ============================================
    async carregarAlunos(pagina = null) {
        const pane = this.safeGet('aeePaneAlunos');
        if (!pane) return;

        if (pagina !== null) this.paginacao.alunos.paginaAtual = pagina;

        pane.innerHTML = `
            <div class="text-center py-5">
                <div class="aee-loading"></div>
                <p class="mt-3 text-muted">Carregando alunos...</p>
            </div>
        `;

        try {
            const params = new URLSearchParams();
            if (this.filtros.condicao && this.filtros.condicao !== 'todos') params.append('condicao', this.filtros.condicao);
            if (this.filtros.turma && this.filtros.turma !== 'todas') params.append('turma', this.filtros.turma);
            if (this.filtros.curso && this.filtros.curso !== 'todos') params.append('curso', this.filtros.curso);
            if (this.filtros.periodo && this.filtros.periodo !== 'todos') params.append('periodo', this.filtros.periodo);
            if (this.filtros.status && this.filtros.status !== 'todos') params.append('status', this.filtros.status);
            if (this.filtros.busca) params.append('busca', this.filtros.busca);
            params.append('page', this.paginacao.alunos.paginaAtual);
            params.append('limit', this.paginacao.alunos.porPagina);

            const response = await fetch(`/api/aee/alunos?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${this.getToken()}` }
            });
            const data = await response.json();

            if (!data.success) throw new Error(data.error || 'Erro ao carregar');

            this.alunos = data.alunos;
            this.paginacao.alunos.total = data.total;
            this.paginacao.alunos.totalPaginas = data.paginacao.pages;

            // 🔥 Atualiza filtros do banco
            if (data.filtros) {
                this.filtrosDisponiveis.condicoes = data.filtros.condicoes || [];
                this.filtrosDisponiveis.turmas = data.filtros.turmas || [];
                this.filtrosDisponiveis.cursos = data.filtros.cursos || [];
            }

            this.renderizarAlunos(data);

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
            <div class="aee-filtros">
                <div class="aee-filtros-row">
                    <div class="aee-filtro-item aee-filtro-busca">
                        <i class="fas fa-search"></i>
                        <input type="text" id="aeeBusca" placeholder="Buscar por nome, matrícula ou email..." value="${this.escapeHtml(this.filtros.busca)}">
                    </div>

                    <div class="aee-filtro-item">
                        <label>Condição</label>
                        <select id="aeeFiltroCondicao">
                            ${this.gerarOpcoesSelect(this.filtrosDisponiveis.condicoes, this.filtros.condicao, 'Todas')}
                        </select>
                    </div>

                    <div class="aee-filtro-item">
                        <label>Turma</label>
                        <select id="aeeFiltroTurma">
                            ${this.gerarOpcoesSelect(this.filtrosDisponiveis.turmas, this.filtros.turma, 'Todas')}
                        </select>
                    </div>

                    <div class="aee-filtro-item">
                        <label>Curso</label>
                        <select id="aeeFiltroCurso">
                            ${this.gerarOpcoesSelect(this.filtrosDisponiveis.cursos, this.filtros.curso, 'Todos')}
                        </select>
                    </div>

                    <div class="aee-filtro-item">
                        <label>Período</label>
                        <select id="aeeFiltroPeriodo">
                            ${this.gerarOpcoesSelect(['1', '2', '3', '4'], this.filtros.periodo, 'Todos')}
                        </select>
                    </div>

                    <div class="aee-filtro-item">
                        <label>Status Cadastro</label>
                        <select id="aeeFiltroStatus">
                            <option value="todos" ${this.filtros.status === 'todos' ? 'selected' : ''}>Todos</option>
                            <option value="aprovada" ${this.filtros.status === 'aprovada' ? 'selected' : ''}>✓ Aprovado</option>
                            <option value="pendente" ${this.filtros.status === 'pendente' ? 'selected' : ''}>⏳ Pendente</option>
                        </select>
                    </div>

                    <button class="aee-btn aee-btn-outline" onclick="AeeModule.limparFiltros()" title="Limpar filtros">
                        <i class="fas fa-eraser"></i>
                    </button>
                </div>
            </div>

            <div class="aee-contador">
                <i class="fas fa-users"></i>
                <strong>${data.total}</strong> aluno(s) encontrado(s)
            </div>

            ${data.alunos.length > 0 ? `
                <div class="aee-alunos-grid">
                    ${data.alunos.map(aluno => {
                        // 🔥 STATUS DO CADASTRO
                        const statusCadastro = aluno.statusCadastro || aluno.status || 'pendente';
                        const badgeCadastro = statusCadastro === 'aprovada'
                            ? '<span class="aee-badge-status aprovado"><i class="fas fa-check-circle"></i> Cadastro Aprovado</span>'
                            : '<span class="aee-badge-status pendente"><i class="fas fa-clock"></i> Cadastro Pendente</span>';

                        // 🔥 STATUS DAS NOTAS
                        const sn = aluno.statusNotas || { total: 0, liberadas: 0, pendentes: 0, temNotas: false };
                        let badgeNotas = '';

                        if (!sn.temNotas) {
                            badgeNotas = '<span class="aee-badge-status sem-nota"><i class="fas fa-minus-circle"></i> Sem notas</span>';
                        } else if (sn.todasLiberadas) {
                            badgeNotas = `<span class="aee-badge-status notas-liberadas"><i class="fas fa-check-double"></i> ${sn.liberadas} nota(s) liberada(s)</span>`;
                        } else {
                            badgeNotas = `<span class="aee-badge-status notas-pendentes"><i class="fas fa-hourglass-half"></i> ${sn.pendentes} nota(s) pendente(s)</span>`;
                        }

                        return `
                            <div class="aee-aluno-card" onclick="AeeModule.verDetalhesAluno('${aluno.id}')">
                                <div class="aee-aluno-avatar" style="background: ${this.getCorCondicao(aluno.condicao.tipo)}20; color: ${this.getCorCondicao(aluno.condicao.tipo)};">
                                    <i class="fas ${this.getIconeCondicao(aluno.condicao.tipo)}"></i>
                                </div>
                                <div class="aee-aluno-info">
                                    <div class="aee-aluno-nome">${this.escapeHtml(aluno.nome)}</div>
                                    <div class="aee-aluno-detalhes">
                                        <span><i class="fas fa-id-card"></i> ${this.escapeHtml(aluno.matricula)}</span>
                                        <span><i class="fas fa-graduation-cap"></i> ${this.escapeHtml(aluno.turma || '-')}</span>
                                        ${aluno.curso ? `<span><i class="fas fa-book"></i> ${this.escapeHtml(aluno.curso)}</span>` : ''}
                                    </div>
                                    <div class="aee-aluno-condicao" style="background: ${this.getCorCondicao(aluno.condicao.tipo)}15; color: ${this.getCorCondicao(aluno.condicao.tipo)};">
                                        <i class="fas ${this.getIconeCondicao(aluno.condicao.tipo)}"></i>
                                        ${this.escapeHtml(aluno.condicao.label)}
                                    </div>
                                    <div class="aee-aluno-badges">
                                        ${badgeCadastro}
                                        ${badgeNotas}
                                    </div>
                                </div>
                                <div class="aee-aluno-arrow">
                                    <i class="fas fa-chevron-right"></i>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
                ${this.renderizarPaginacao('alunos')}
            ` : `
                <div class="aee-empty-state">
                    <i class="fas fa-user-slash"></i>
                    <h3>Nenhum aluno encontrado</h3>
                    <p>Tente ajustar os filtros ou verifique se há alunos cadastrados com necessidades de acessibilidade.</p>
                </div>
            `}
        `;

        setTimeout(() => this.aplicarEventosFiltros(), 50);
    },

    // ============================================================================
    // 🔥 VER RESPOSTAS DO ALUNO EM UMA PROVA
    // ============================================================================
    async verRespostasAluno(provaId, alunoId) {
        console.log('📝 AEE - Ver respostas:', { provaId, alunoId });

        try {
            const token = this.getToken();

            // Fecha modal anterior
            const antigo = document.getElementById('aeeModalRespostas');
            if (antigo) antigo.remove();

            this.mostrarToast('📄 Carregando respostas...', 'info');

            const response = await fetch(`/api/aee/respostas/${provaId}/${alunoId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Erro ao carregar respostas');

            const data = await response.json();
            if (!data.success) throw new Error(data.error || 'Erro ao carregar respostas');

            const { aluno, prova, resultado, questoes } = data;

            // Monta as questões
            let questoesHTML = '';
            questoes.forEach((q) => {
                const correta = q.correta;
                const classe = correta ? 'resposta-correta' : 'resposta-errada';
                const icone = correta ? 'fa-check-circle' : 'fa-times-circle';

                questoesHTML += `
                    <div class="resposta-questao ${classe}">
                        <div class="resposta-questao-header">
                            <div class="resposta-questao-numero">
                                <span class="resposta-questao-badge">Q${q.numero}</span>
                                <span class="resposta-questao-status">
                                    <i class="fas ${icone}"></i>
                                    ${correta ? 'Correta' : 'Incorreta'}
                                </span>
                            </div>
                        </div>

                        <div class="resposta-questao-pergunta">${this.escapeHtml(q.pergunta)}</div>

                        <div class="resposta-questao-opcoes">
                            ${q.opcoes.map(op => {
                                let classe = '';
                                let icone = '';

                                if (op.marcadaPeloAluno && op.correta) {
                                    classe = 'opcao-correta';
                                    icone = '<i class="fas fa-check-circle"></i> Marcada (Correta)';
                                } else if (op.marcadaPeloAluno && !op.correta) {
                                    classe = 'opcao-errada';
                                    icone = '<i class="fas fa-times-circle"></i> Marcada (Errada)';
                                } else if (op.correta) {
                                    classe = 'opcao-gabarito';
                                    icone = '<i class="fas fa-key"></i> Gabarito';
                                } else {
                                    classe = 'opcao-neutral';
                                }

                                return `
                                    <div class="resposta-opcao ${classe}">
                                        <span class="resposta-opcao-letra">${op.letra})</span>
                                        <span class="resposta-opcao-texto">${this.escapeHtml(op.texto)}</span>
                                        ${icone ? `<span class="resposta-opcao-tag">${icone}</span>` : ''}
                                    </div>
                                `;
                            }).join('')}
                        </div>

                        ${q.explicacao ? `
                            <div class="resposta-questao-explicacao">
                                <i class="fas fa-lightbulb"></i>
                                <strong>Explicação:</strong> ${this.escapeHtml(q.explicacao)}
                            </div>
                        ` : ''}
                    </div>
                `;
            });

            const notaExibida = resultado.notaLiberada && resultado.nota !== null
                ? resultado.nota.toFixed(1)
                : '—';

            const modalHtml = `
                <div class="aee-modal-backdrop" id="aeeModalRespostas" style="
                    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                    background: rgba(0,0,0,0.6); z-index: 10000;
                    display: flex; align-items: center; justify-content: center;
                    padding: 20px; box-sizing: border-box;
                ">
                    <div class="aee-modal" style="
                        background: white; border-radius: 20px; max-width: 900px; width: 100%;
                        max-height: 90vh; display: flex; flex-direction: column;
                        box-shadow: 0 20px 60px rgba(0,0,0,0.3); overflow: hidden;
                    ">
                        <div class="aee-modal-header" style="
                            background: linear-gradient(135deg, #6366f1, #8b5cf6);
                            color: white; padding: 20px 25px;
                            display: flex; justify-content: space-between; align-items: center;
                        ">
                            <div style="display: flex; align-items: center; gap: 15px;">
                                <div style="
                                    width: 48px; height: 48px; background: rgba(255,255,255,0.2);
                                    border-radius: 12px; display: flex; align-items: center; justify-content: center;
                                    font-size: 22px;
                                ">
                                    <i class="fas fa-clipboard-check"></i>
                                </div>
                                <div>
                                    <h3 style="margin: 0; font-size: 1.2rem; font-weight: 700;">
                                        Respostas do Aluno
                                    </h3>
                                    <p style="margin: 4px 0 0; opacity: 0.9; font-size: 0.85rem;">
                                        <i class="fas fa-user"></i> ${this.escapeHtml(aluno.nome)}
                                    </p>
                                </div>
                            </div>
                            <button onclick="document.getElementById('aeeModalRespostas').remove()" style="
                                background: rgba(255,255,255,0.2); border: none; color: white;
                                width: 36px; height: 36px; border-radius: 50%; cursor: pointer;
                                font-size: 20px; display: flex; align-items: center; justify-content: center;
                            ">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>

                        <div class="aee-modal-body" style="padding: 20px 25px; overflow-y: auto; flex: 1;">
                            <!-- Info da prova -->
                            <div style="
                                background: #f8fafc; border-radius: 12px; padding: 15px;
                                margin-bottom: 20px; border: 1px solid #e2e8f0;
                            ">
                                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; font-size: 0.9rem;">
                                    <div>
                                        <span style="color: #64748b; font-size: 0.75rem; display: block; text-transform: uppercase; font-weight: 600;">Prova</span>
                                        <span style="color: #1e293b; font-weight: 600;">${this.escapeHtml(prova.titulo)}</span>
                                    </div>
                                    <div>
                                        <span style="color: #64748b; font-size: 0.75rem; display: block; text-transform: uppercase; font-weight: 600;">Código</span>
                                        <span style="color: #1e293b; font-weight: 600;">${this.escapeHtml(prova.codigo || '-')}</span>
                                    </div>
                                    <div>
                                        <span style="color: #64748b; font-size: 0.75rem; display: block; text-transform: uppercase; font-weight: 600;">Turma</span>
                                        <span style="color: #1e293b; font-weight: 600;">${this.escapeHtml(aluno.turma || '-')}</span>
                                    </div>
                                    <div>
                                        <span style="color: #64748b; font-size: 0.75rem; display: block; text-transform: uppercase; font-weight: 600;">Realizada em</span>
                                        <span style="color: #1e293b; font-weight: 600;">${this.formatarData(resultado.data)}</span>
                                    </div>
                                </div>
                            </div>

                            <!-- Stats -->
                            <div style="
                                display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;
                                margin-bottom: 20px;
                            ">
                                <div style="
                                    background: ${resultado.notaLiberada ? (resultado.nota >= 7 ? '#d1fae5' : '#fee2e2') : '#f3f4f6'};
                                    border-radius: 12px; padding: 15px; text-align: center;
                                ">
                                    <div style="font-size: 26px; font-weight: 700; color: ${resultado.notaLiberada ? (resultado.nota >= 7 ? '#065f46' : '#991b1b') : '#6b7280'};">
                                        ${notaExibida}
                                    </div>
                                    <div style="font-size: 11px; color: ${resultado.notaLiberada ? (resultado.nota >= 7 ? '#065f46' : '#991b1b') : '#6b7280'}; text-transform: uppercase; font-weight: 600; margin-top: 4px;">
                                        Nota
                                    </div>
                                </div>

                                <div style="background: #dbeafe; border-radius: 12px; padding: 15px; text-align: center;">
                                    <div style="font-size: 26px; font-weight: 700; color: #1e40af;">
                                        ${resultado.acertos}/${resultado.total}
                                    </div>
                                    <div style="font-size: 11px; color: #1e40af; text-transform: uppercase; font-weight: 600; margin-top: 4px;">
                                        Acertos
                                    </div>
                                </div>

                                <div style="background: #fef3c7; border-radius: 12px; padding: 15px; text-align: center;">
                                    <div style="font-size: 26px; font-weight: 700; color: #92400e;">
                                        ${resultado.porcentagem}%
                                    </div>
                                    <div style="font-size: 11px; color: #92400e; text-transform: uppercase; font-weight: 600; margin-top: 4px;">
                                        Aproveitamento
                                    </div>
                                </div>

                                <div style="background: #e0e7ff; border-radius: 12px; padding: 15px; text-align: center;">
                                    <div style="font-size: 26px; font-weight: 700; color: #4338ca;">
                                        ${resultado.tempoGasto ? Math.round(resultado.tempoGasto / 60) + 'm' : '—'}
                                    </div>
                                    <div style="font-size: 11px; color: #4338ca; text-transform: uppercase; font-weight: 600; margin-top: 4px;">
                                        Tempo
                                    </div>
                                </div>
                            </div>

                            <!-- Legenda -->
                            <div style="
                                display: flex; gap: 20px; flex-wrap: wrap; justify-content: center;
                                padding: 12px; background: #f8fafc; border-radius: 10px;
                                margin-bottom: 20px; font-size: 0.8rem;
                            ">
                                <div style="display: flex; align-items: center; gap: 6px;">
                                    <div style="width: 14px; height: 14px; border-radius: 4px; background: #10b981;"></div>
                                    <span style="color: #065f46; font-weight: 600;">Marcada Correta</span>
                                </div>
                                <div style="display: flex; align-items: center; gap: 6px;">
                                    <div style="width: 14px; height: 14px; border-radius: 4px; background: #ef4444;"></div>
                                    <span style="color: #991b1b; font-weight: 600;">Marcada Errada</span>
                                </div>
                                <div style="display: flex; align-items: center; gap: 6px;">
                                    <div style="width: 14px; height: 14px; border-radius: 4px; background: #fbbf24;"></div>
                                    <span style="color: #92400e; font-weight: 600;">Gabarito</span>
                                </div>
                            </div>

                            <!-- Questões -->
                            <h4 style="margin: 0 0 15px; color: #1e293b; display: flex; align-items: center; gap: 8px;">
                                <i class="fas fa-list-ol" style="color: #6366f1;"></i>
                                Questões (${questoes.length})
                            </h4>

                            <div>${questoesHTML}</div>
                        </div>

                        <div class="aee-modal-footer" style="
                            padding: 15px 25px; border-top: 1px solid #e2e8f0;
                            display: flex; justify-content: flex-end; gap: 10px;
                            background: #f8fafc;
                        ">
                            <button onclick="document.getElementById('aeeModalRespostas').remove()" style="
                                padding: 10px 20px; background: #6b7280; color: white;
                                border: none; border-radius: 10px; font-weight: 600;
                                cursor: pointer; font-size: 0.9rem;
                            ">
                                <i class="fas fa-times"></i> Fechar
                            </button>
                        </div>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', modalHtml);

            setTimeout(() => {
                const backdrop = document.getElementById('aeeModalRespostas');
                if (backdrop) {
                    backdrop.addEventListener('click', (e) => {
                        if (e.target === backdrop) backdrop.remove();
                    });
                }
            }, 50);

        } catch (error) {
            console.error('❌ Erro ao ver respostas:', error);
            this.mostrarToast('❌ ' + error.message, 'error');
        }
    },

    aplicarEventosFiltros() {
        const busca = this.safeGet('aeeBusca');
        const condicao = this.safeGet('aeeFiltroCondicao');
        const turma = this.safeGet('aeeFiltroTurma');
        const curso = this.safeGet('aeeFiltroCurso');
        const periodo = this.safeGet('aeeFiltroPeriodo');
        const status = this.safeGet('aeeFiltroStatus');

        if (busca) {
            let timeout;
            busca.addEventListener('input', (e) => {
                clearTimeout(timeout);
                timeout = setTimeout(() => {
                    this.filtros.busca = e.target.value;
                    this.paginacao.alunos.paginaAtual = 1;
                    this.carregarAlunos();
                }, 400);
            });
        }

        const aplicar = (chave, el) => {
            if (el) el.addEventListener('change', (e) => {
                this.filtros[chave] = e.target.value;
                this.paginacao.alunos.paginaAtual = 1;
                this.carregarAlunos();
            });
        };

        aplicar('condicao', condicao);
        aplicar('turma', turma);
        aplicar('curso', curso);
        aplicar('periodo', periodo);
        aplicar('status', status);
    },

    limparFiltros() {
        this.filtros = { condicao: 'todos', turma: 'todas', curso: 'todos', periodo: 'todos', status: 'todos', busca: '' };
        this.paginacao.alunos.paginaAtual = 1;
        this.carregarAlunos();
    },

    // ============================================
    // 🔥 HISTÓRICO DE NOTAS (NOVA ABA)
    // ============================================
    async carregarNotas(pagina = null) {
        const pane = this.safeGet('aeePaneNotas');
        if (!pane) return;

        if (pagina !== null) this.paginacao.notas.paginaAtual = pagina;

        pane.innerHTML = `
            <div class="text-center py-5">
                <div class="aee-loading"></div>
                <p class="mt-3 text-muted">Carregando notas...</p>
            </div>
        `;

        try {
            const params = new URLSearchParams();
            if (this.filtrosNotas.busca) params.append('busca', this.filtrosNotas.busca);
            if (this.filtrosNotas.turma && this.filtrosNotas.turma !== 'todas') params.append('turma', this.filtrosNotas.turma);
            if (this.filtrosNotas.curso && this.filtrosNotas.curso !== 'todos') params.append('curso', this.filtrosNotas.curso);
            if (this.filtrosNotas.periodo && this.filtrosNotas.periodo !== 'todos') params.append('periodo', this.filtrosNotas.periodo);
            if (this.filtrosNotas.status && this.filtrosNotas.status !== 'todos') params.append('status', this.filtrosNotas.status);
            if (this.filtrosNotas.ordenacao) params.append('ordenacao', this.filtrosNotas.ordenacao);
            params.append('page', this.paginacao.notas.paginaAtual);
            params.append('limit', this.paginacao.notas.porPagina);

            const response = await fetch(`/api/aee/notas?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${this.getToken()}` }
            });
            const data = await response.json();

            if (!data.success) throw new Error(data.error || 'Erro ao carregar notas');

            this.notas = data.notas;
            this.paginacao.notas.total = data.total;
            this.paginacao.notas.totalPaginas = data.paginacao.pages;

            if (data.filtros) {
                this.filtrosDisponiveis.turmas = data.filtros.turmas || this.filtrosDisponiveis.turmas;
                this.filtrosDisponiveis.cursos = data.filtros.cursos || this.filtrosDisponiveis.cursos;
            }

            this.renderizarNotas(data);

        } catch (error) {
            console.error('❌ Erro ao carregar notas:', error);
            pane.innerHTML = `
                <div class="aee-error">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Erro ao carregar notas</h3>
                    <p>${error.message}</p>
                    <button class="aee-btn aee-btn-primary" onclick="AeeModule.carregarNotas()">
                        <i class="fas fa-sync-alt"></i> Tentar novamente
                    </button>
                </div>
            `;
        }
    },

    renderizarNotas(data) {
        const pane = this.safeGet('aeePaneNotas');
        if (!pane) return;

        const stats = data.estatisticas || {};

        pane.innerHTML = `
            <div class="aee-notas-header">
                <div class="aee-mini-stats-grid">
                    <div class="aee-mini-stat-box" style="border-left: 4px solid #6366f1;">
                        <div class="aee-mini-value">${stats.total || 0}</div>
                        <div class="aee-mini-label">Total de Notas</div>
                    </div>
                    <div class="aee-mini-stat-box" style="border-left: 4px solid #10b981;">
                        <div class="aee-mini-value" style="color: #10b981;">${stats.aprovados || 0}</div>
                        <div class="aee-mini-label">Aprovados</div>
                    </div>
                    <div class="aee-mini-stat-box" style="border-left: 4px solid #ef4444;">
                        <div class="aee-mini-value" style="color: #ef4444;">${stats.reprovados || 0}</div>
                        <div class="aee-mini-label">Reprovados</div>
                    </div>
                    <div class="aee-mini-stat-box" style="border-left: 4px solid #f59e0b;">
                        <div class="aee-mini-value" style="color: #f59e0b;">${stats.pendentes || 0}</div>
                        <div class="aee-mini-label">Pendentes</div>
                    </div>
                    <div class="aee-mini-stat-box" style="border-left: 4px solid #8b5cf6;">
                        <div class="aee-mini-value" style="color: #8b5cf6;">${stats.media || '0.0'}</div>
                        <div class="aee-mini-label">Média Geral</div>
                    </div>
                </div>
            </div>

            <div class="aee-filtros">
                <div class="aee-filtros-row">
                    <div class="aee-filtro-item aee-filtro-busca">
                        <i class="fas fa-search"></i>
                        <input type="text" id="aeeNotasBusca" placeholder="Buscar por aluno, prova..." value="${this.escapeHtml(this.filtrosNotas.busca)}">
                    </div>

                    <div class="aee-filtro-item">
                        <label>Turma</label>
                        <select id="aeeNotasTurma">
                            ${this.gerarOpcoesSelect(this.filtrosDisponiveis.turmas, this.filtrosNotas.turma, 'Todas')}
                        </select>
                    </div>

                    <div class="aee-filtro-item">
                        <label>Curso</label>
                        <select id="aeeNotasCurso">
                            ${this.gerarOpcoesSelect(this.filtrosDisponiveis.cursos, this.filtrosNotas.curso, 'Todos')}
                        </select>
                    </div>

                    <div class="aee-filtro-item">
                        <label>Período</label>
                        <select id="aeeNotasPeriodo">
                            ${this.gerarOpcoesSelect(['1', '2', '3', '4'], this.filtrosNotas.periodo, 'Todos')}
                        </select>
                    </div>

                    <div class="aee-filtro-item">
                        <label>Status</label>
                        <select id="aeeNotasStatus">
                            <option value="todos" ${this.filtrosNotas.status === 'todos' ? 'selected' : ''}>Todos</option>
                            <option value="aprovado" ${this.filtrosNotas.status === 'aprovado' ? 'selected' : ''}>✓ Aprovados</option>
                            <option value="reprovado" ${this.filtrosNotas.status === 'reprovado' ? 'selected' : ''}>✗ Reprovados</option>
                            <option value="pendente" ${this.filtrosNotas.status === 'pendente' ? 'selected' : ''}>⏳ Pendentes</option>
                        </select>
                    </div>

                    <div class="aee-filtro-item">
                        <label>Ordenar</label>
                        <select id="aeeNotasOrdenacao">
                            <option value="data_desc" ${this.filtrosNotas.ordenacao === 'data_desc' ? 'selected' : ''}>Mais recentes</option>
                            <option value="data_asc" ${this.filtrosNotas.ordenacao === 'data_asc' ? 'selected' : ''}>Mais antigos</option>
                            <option value="nota_desc" ${this.filtrosNotas.ordenacao === 'nota_desc' ? 'selected' : ''}>Maior nota</option>
                            <option value="nota_asc" ${this.filtrosNotas.ordenacao === 'nota_asc' ? 'selected' : ''}>Menor nota</option>
                            <option value="nome_asc" ${this.filtrosNotas.ordenacao === 'nome_asc' ? 'selected' : ''}>Aluno (A-Z)</option>
                        </select>
                    </div>

                    <button class="aee-btn aee-btn-outline" onclick="AeeModule.limparFiltrosNotas()" title="Limpar">
                        <i class="fas fa-eraser"></i>
                    </button>

                    <button class="aee-btn aee-btn-success" onclick="AeeModule.exportarNotasCSV()" title="Exportar CSV">
                        <i class="fas fa-file-csv"></i> CSV
                    </button>
                </div>
            </div>

            <div class="aee-contador">
                <i class="fas fa-clipboard-list"></i>
                <strong>${data.total}</strong> nota(s) encontrada(s)
            </div>

            ${data.notas.length > 0 ? `
                <div class="aee-table-wrapper">
                    <table class="aee-table">
                        <thead>
                            <tr>
                                <th>Aluno</th>
                                <th>Prova</th>
                                <th>Turma</th>
                                <th>Tipo</th>
                                <th>Nota</th>
                                <th>Data</th>
                                <th>Status</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.notas.map(n => `
                                <tr class="aee-nota-row ${n.status === 'pendente' ? 'aee-nota-pendente' : ''}">
                                    <td>
                                        <div class="aee-td-aluno">
                                            <div class="aee-td-avatar">${(n.alunoNome || '?').charAt(0).toUpperCase()}</div>
                                            <div>
                                                <strong>${this.escapeHtml(n.alunoNome)}</strong>
                                                <small>${this.escapeHtml(n.alunoMatricula || '')}</small>
                                            </div>
                                        </div>
                                    </td>
                                    <td>${this.escapeHtml(n.provaTitulo)}</td>
                                    <td>${this.escapeHtml(n.alunoTurma || '-')}</td>
                                    <td>
                                        <span class="aee-badge-tipo ${n.adaptada ? 'adaptada' : 'normal'}">
                                            ${n.adaptada ? '🎯 Adaptada' : '📝 Normal'}
                                        </span>
                                    </td>
                                    <td>
                                        <span class="aee-nota-valor ${n.notaLiberada ? (n.nota >= 7 ? 'nota-alta' : 'nota-baixa') : 'nota-pendente'}">
                                            ${n.notaLiberada && n.nota !== null ? n.nota.toFixed(1) : '—'}
                                        </span>
                                    </td>
                                    <td>${this.formatarData(n.data)}</td>
                                    <td>
                                        <span class="aee-status-badge aee-status-${n.status}">
                                            ${n.status === 'aprovado' ? '✓ Aprovado' : 
                                              n.status === 'reprovado' ? '✗ Reprovado' : 
                                              n.status === 'cancelada' ? '🚫 Cancelada' : '⏳ Pendente'}
                                        </span>
                                    </td>
                                    <td>
                                        <button class="aee-btn-icon" onclick="AeeModule.verDetalhesNota('${n.id}')" title="Ver detalhes">
                                            <i class="fas fa-eye"></i>
                                        </button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                ${this.renderizarPaginacao('notas')}
            ` : `
                <div class="aee-empty-state">
                    <i class="fas fa-clipboard-list"></i>
                    <h3>Nenhuma nota encontrada</h3>
                    <p>Não há notas registradas com os filtros atuais.</p>
                </div>
            `}
        `;

        setTimeout(() => this.aplicarEventosFiltrosNotas(), 50);
    },

    aplicarEventosFiltrosNotas() {
        const busca = this.safeGet('aeeNotasBusca');
        const turma = this.safeGet('aeeNotasTurma');
        const curso = this.safeGet('aeeNotasCurso');
        const periodo = this.safeGet('aeeNotasPeriodo');
        const status = this.safeGet('aeeNotasStatus');
        const ordenacao = this.safeGet('aeeNotasOrdenacao');

        if (busca) {
            let timeout;
            busca.addEventListener('input', (e) => {
                clearTimeout(timeout);
                timeout = setTimeout(() => {
                    this.filtrosNotas.busca = e.target.value;
                    this.paginacao.notas.paginaAtual = 1;
                    this.carregarNotas();
                }, 400);
            });
        }

        const aplicar = (chave, el) => {
            if (el) el.addEventListener('change', (e) => {
                this.filtrosNotas[chave] = e.target.value;
                this.paginacao.notas.paginaAtual = 1;
                this.carregarNotas();
            });
        };

        aplicar('turma', turma);
        aplicar('curso', curso);
        aplicar('periodo', periodo);
        aplicar('status', status);
        aplicar('ordenacao', ordenacao);
    },

    limparFiltrosNotas() {
        this.filtrosNotas = { busca: '', turma: 'todas', curso: 'todos', periodo: 'todos', status: 'todos', ordenacao: 'data_desc' };
        this.paginacao.notas.paginaAtual = 1;
        this.carregarNotas();
    },

    exportarNotasCSV() {
        if (!this.notas || this.notas.length === 0) {
            this.mostrarToast('⚠️ Nenhuma nota para exportar', 'warning');
            return;
        }

        const registros = this.notas;

        // ---------- Colunas ----------
        const colunas = [
            { label: 'Aluno', format: (n) => n.alunoNome || '' },
            { label: 'Matrícula', format: (n) => n.alunoMatricula || '' },
            { label: 'Turma', format: (n) => n.alunoTurma || '' },
            { label: 'Curso', format: (n) => n.alunoCurso || '' },
            { label: 'Prova', format: (n) => n.provaTitulo || '' },
            {
                label: 'Tipo de Prova',
                format: (n) => n.adaptada ? 'Adaptada' : 'Normal'
            },
            {
                label: 'Nota',
                format: (n) => (n.notaLiberada && n.nota !== null && n.nota !== undefined)
                    ? Number(n.nota).toFixed(1)
                    : '—'
            },
            {
                label: 'Data',
                format: (n) => this.formatarData(n.data)
            },
            {
                label: 'Status',
                format: (n) => {
                    const map = {
                        'aprovado': 'Aprovado',
                        'reprovado': 'Reprovado',
                        'cancelada': 'Cancelada',
                        'pendente': 'Pendente'
                    };
                    return map[n.status] || n.status || '';
                }
            },
            {
                label: 'Nota Liberada',
                format: (n) => n.notaLiberada ? 'Sim' : 'Não'
            }
        ];

        // ---------- Filtros aplicados ----------
        const filtros = [];
        if (this.filtrosNotas.busca) filtros.push({ label: 'Busca', valor: this.filtrosNotas.busca });
        if (this.filtrosNotas.turma && this.filtrosNotas.turma !== 'todas') filtros.push({ label: 'Turma', valor: this.filtrosNotas.turma });
        if (this.filtrosNotas.curso && this.filtrosNotas.curso !== 'todos') filtros.push({ label: 'Curso', valor: this.filtrosNotas.curso });
        if (this.filtrosNotas.periodo && this.filtrosNotas.periodo !== 'todos') filtros.push({ label: 'Período', valor: `${this.filtrosNotas.periodo}º` });
        if (this.filtrosNotas.status && this.filtrosNotas.status !== 'todos') filtros.push({ label: 'Status', valor: this.filtrosNotas.status });
        if (this.filtrosNotas.ordenacao) filtros.push({ label: 'Ordenação', valor: this.filtrosNotas.ordenacao });

        // ---------- Métricas ----------
        const aprovados = registros.filter(n => n.status === 'aprovado').length;
        const reprovados = registros.filter(n => n.status === 'reprovado').length;
        const pendentes = registros.filter(n => n.status === 'pendente').length;
        const liberadas = registros.filter(n => n.notaLiberada).length;
        const comNota = registros.filter(n => n.notaLiberada && n.nota !== null);
        const media = comNota.length > 0
            ? (comNota.reduce((acc, n) => acc + Number(n.nota), 0) / comNota.length).toFixed(2)
            : '—';

        const ok = this.gerarBaixarCSV({
            titulo: 'Histórico de Notas — AEE',
            subtitulo: `${registros.length} nota(s) no relatório`,
            setor: 'Setor Pedagógico — AEE',
            colunas,
            registros,
            filtros,
            metricas: {
                'Total de notas': registros.length,
                'Aprovados': aprovados,
                'Reprovados': reprovados,
                'Pendentes': pendentes,
                'Notas liberadas': liberadas,
                'Média geral': media
            },
            nomeArquivo: 'aee-historico-notas',
            observacoes: `${registros.length} nota(s) listada(s)`
        });

        if (ok) {
            this.mostrarToast(`✅ CSV exportado (${registros.length} nota(s))!`, 'success');
        }
    },

    // ============================================
    // 🔥 DETALHES DO ALUNO (com notas)
    // ============================================
    async verDetalhesAluno(id) {
        try {
            const response = await fetch(`/api/aee/alunos/${id}`, {
                headers: { 'Authorization': `Bearer ${this.getToken()}` }
            });
            const data = await response.json();

            if (!data.success) throw new Error(data.error);

            const a = data.aluno;

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
                                            ${a.acessibilidade.status === 'aprovada' ? '<i class="fas fa-check-circle"></i> Aprovada' : '<i class="fas fa-clock"></i> Pendente'}
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

                            ${a.estatisticas ? `
                                <div class="aee-modal-section">
                                    <h4><i class="fas fa-chart-line"></i> Estatísticas de Desempenho</h4>
                                    <div class="aee-modal-stats">
                                        <div class="aee-modal-stat">
                                            <div class="aee-modal-stat-value">${a.estatisticas.totalProvas}</div>
                                            <div class="aee-modal-stat-label">Provas</div>
                                        </div>
                                        <div class="aee-modal-stat">
                                            <div class="aee-modal-stat-value" style="color: #10b981;">${a.estatisticas.media}</div>
                                            <div class="aee-modal-stat-label">Média</div>
                                        </div>
                                        <div class="aee-modal-stat">
                                            <div class="aee-modal-stat-value" style="color: #f59e0b;">${a.estatisticas.aprovacoes}</div>
                                            <div class="aee-modal-stat-label">Aprovações</div>
                                        </div>
                                        <div class="aee-modal-stat">
                                            <div class="aee-modal-stat-value" style="color: #ef4444;">${a.estatisticas.reprovacoes}</div>
                                            <div class="aee-modal-stat-label">Reprovações</div>
                                        </div>
                                    </div>
                                </div>
                            ` : ''}

                            <div class="aee-modal-section">
                                <h4><i class="fas fa-file-alt"></i> Últimas Provas</h4>
                                ${a.provasRealizadas && a.provasRealizadas.length > 0 ? `
                                    <div class="aee-provas-list">
                                        ${a.provasRealizadas.map(p => `
                                            <div class="aee-prova-item">
                                                <div class="aee-prova-info">
                                                    <strong>${this.escapeHtml(p.provaTitulo || 'Sem título')}</strong>
                                                    <span>${p.adaptada ? '🎯 Adaptada' : '📝 Normal'} • ${this.formatarData(p.data)}</span>
                                                </div>
                                                <div class="aee-prova-nota ${p.notaLiberada ? (p.nota >= 7 ? 'nota-alta' : 'nota-baixa') : ''}">
                                                    ${p.notaLiberada && p.nota !== null ? p.nota.toFixed(1) : 'Pendente'}
                                                </div>
                                            </div>
                                        `).join('')}
                                    </div>
                                ` : '<p class="aee-empty">Nenhuma prova realizada ainda</p>'}
                            </div>
                        </div>

                        <div class="aee-modal-footer">
                            <button class="aee-btn aee-btn-outline" onclick="AeeModule.fecharModal()">
                                <i class="fas fa-times"></i> Fechar
                            </button>
                            <button class="aee-btn aee-btn-primary" onclick="AeeModule.verHistoricoCompletoAluno('${a.id}')">
                                <i class="fas fa-history"></i> Histórico Completo
                            </button>
                        </div>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', modalHtml);

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
            this.mostrarToast('Erro: ' + error.message, 'error');
        }
    },

    verHistoricoCompletoAluno(alunoId) {
        this.fecharModal();
        this.trocarTab('notas');
        setTimeout(() => {
            const buscaEl = this.safeGet('aeeNotasBusca');
            if (buscaEl) {
                // Buscar pelo ID - ajustar rota se necessário
                this.filtrosNotas.busca = '';
                this.carregarNotas();
            }
        }, 300);
    },

    fecharModal() {
        const modal = this.safeGet('aeeModalDetalhes');
        if (modal) modal.remove();
    },

    async verDetalhesNota(id) {
        try {
            const response = await fetch(`/api/aee/notas/${id}`, {
                headers: { 'Authorization': `Bearer ${this.getToken()}` }
            });
            const data = await response.json();

            if (!data.success) throw new Error(data.error);

            const n = data.nota;

            const antigo = this.safeGet('aeeModalNota');
            if (antigo) antigo.remove();

            const modalHtml = `
                <div class="aee-modal-backdrop" id="aeeModalNota">
                    <div class="aee-modal">
                        <div class="aee-modal-header" style="background: linear-gradient(135deg, #6366f1, #8b5cf6);">
                            <div class="aee-modal-header-content">
                                <div class="aee-modal-avatar">
                                    <i class="fas fa-clipboard-list"></i>
                                </div>
                                <div>
                                    <h3>Detalhes da Nota</h3>
                                    <p>${this.escapeHtml(n.provaTitulo)}</p>
                                </div>
                            </div>
                            <button class="aee-modal-close" onclick="AeeModule.fecharModalNota()">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>

                        <div class="aee-modal-body">
                            <div class="aee-modal-section">
                                <h4><i class="fas fa-user"></i> Aluno</h4>
                                <div class="aee-info-grid">
                                    <div class="aee-info-item aee-info-full">
                                        <span class="aee-info-label">Nome</span>
                                        <span class="aee-info-value"><strong>${this.escapeHtml(n.alunoNome)}</strong></span>
                                    </div>
                                    <div class="aee-info-item">
                                        <span class="aee-info-label">Matrícula</span>
                                        <span class="aee-info-value">${this.escapeHtml(n.alunoMatricula || '-')}</span>
                                    </div>
                                    <div class="aee-info-item">
                                        <span class="aee-info-label">Turma</span>
                                        <span class="aee-info-value">${this.escapeHtml(n.alunoTurma || '-')}</span>
                                    </div>
                                </div>
                            </div>

                            <div class="aee-modal-section">
                                <h4><i class="fas fa-file-alt"></i> Prova</h4>
                                <div class="aee-info-grid">
                                    <div class="aee-info-item aee-info-full">
                                        <span class="aee-info-label">Título</span>
                                        <span class="aee-info-value"><strong>${this.escapeHtml(n.provaTitulo)}</strong></span>
                                    </div>
                                    <div class="aee-info-item">
                                        <span class="aee-info-label">Tipo</span>
                                        <span class="aee-info-value">
                                            <span class="aee-badge-tipo ${n.adaptada ? 'adaptada' : 'normal'}">
                                                ${n.adaptada ? '🎯 Adaptada' : '📝 Normal'}
                                            </span>
                                        </span>
                                    </div>
                                    <div class="aee-info-item">
                                        <span class="aee-info-label">Data</span>
                                        <span class="aee-info-value">${this.formatarData(n.data)}</span>
                                    </div>
                                </div>
                            </div>

                            <div class="aee-modal-section">
                                <h4><i class="fas fa-chart-bar"></i> Resultado</h4>
                                <div class="aee-modal-stats">
                                    <div class="aee-modal-stat">
                                        <div class="aee-modal-stat-value ${n.notaLiberada ? (n.nota >= 7 ? 'nota-alta' : 'nota-baixa') : ''}">
                                            ${n.notaLiberada && n.nota !== null ? n.nota.toFixed(1) : '—'}
                                        </div>
                                        <div class="aee-modal-stat-label">Nota</div>
                                    </div>
                                    <div class="aee-modal-stat">
                                        <div class="aee-modal-stat-value">${n.acertos || 0}/${n.total || 0}</div>
                                        <div class="aee-modal-stat-label">Acertos</div>
                                    </div>
                                    <div class="aee-modal-stat">
                                        <div class="aee-modal-stat-value">${n.tempoGasto ? Math.round(n.tempoGasto / 60) + ' min' : '—'}</div>
                                        <div class="aee-modal-stat-label">Tempo</div>
                                    </div>
                                    <div class="aee-modal-stat">
                                        <div class="aee-modal-stat-value">
                                            <span class="aee-status-badge aee-status-${n.status}">
                                                ${n.status === 'aprovado' ? '✓' : n.status === 'reprovado' ? '✗' : '⏳'}
                                            </span>
                                        </div>
                                        <div class="aee-modal-stat-label">${n.status}</div>
                                    </div>
                                </div>
                            </div>

                            ${n.observacoes ? `
                                <div class="aee-modal-section">
                                    <h4><i class="fas fa-comment"></i> Observações</h4>
                                    <p style="background: #f8fafc; padding: 12px; border-radius: 8px; margin: 0;">
                                        ${this.escapeHtml(n.observacoes)}
                                    </p>
                                </div>
                            ` : ''}
                        </div>

                        <div class="aee-modal-footer">
                            <button class="aee-btn aee-btn-outline" onclick="AeeModule.fecharModalNota()">
                                <i class="fas fa-times"></i> Fechar
                            </button>
                        </div>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', modalHtml);

            setTimeout(() => {
                const backdrop = this.safeGet('aeeModalNota');
                if (backdrop) {
                    backdrop.addEventListener('click', (e) => {
                        if (e.target === backdrop) this.fecharModalNota();
                    });
                }
            }, 50);

        } catch (error) {
            console.error('❌ Erro ao carregar detalhes da nota:', error);
            this.mostrarToast('Erro: ' + error.message, 'error');
        }
    },

    fecharModalNota() {
        const modal = this.safeGet('aeeModalNota');
        if (modal) modal.remove();
    },

    // ============================================
    // 🔥 PROVAS (com filtros + impressão idêntica ao admin-simples)
    // ============================================
    async carregarProvas(pagina = null) {
        const pane = this.safeGet('aeePaneProvas');
        if (!pane) return;

        if (pagina !== null) this.paginacao.provas.paginaAtual = pagina;

        pane.innerHTML = `
            <div class="text-center py-5">
                <div class="aee-loading"></div>
                <p class="mt-3 text-muted">Carregando provas...</p>
            </div>
        `;

        try {
            const params = new URLSearchParams();
            if (this.filtrosProvas.busca) params.append('busca', this.filtrosProvas.busca);
            if (this.filtrosProvas.turma && this.filtrosProvas.turma !== 'todas') params.append('turma', this.filtrosProvas.turma);
            if (this.filtrosProvas.tipo && this.filtrosProvas.tipo !== 'todas') params.append('tipo', this.filtrosProvas.tipo);
            if (this.filtrosProvas.periodo && this.filtrosProvas.periodo !== 'todos') params.append('periodo', this.filtrosProvas.periodo);
            params.append('page', this.paginacao.provas.paginaAtual);
            params.append('limit', this.paginacao.provas.porPagina);

            const response = await fetch(`/api/aee/provas?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${this.getToken()}` }
            });
            const data = await response.json();

            if (!data.success) throw new Error(data.error || 'Erro ao carregar');

            this.provas = data.provas;
            this.paginacao.provas.total = data.total;
            this.paginacao.provas.totalPaginas = data.paginacao.pages;

            if (data.filtros) {
                this.filtrosDisponiveis.turmas = data.filtros.turmas || this.filtrosDisponiveis.turmas;
            }

            this.renderizarProvas(data);

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

    renderizarProvas(data) {
        const pane = this.safeGet('aeePaneProvas');
        if (!pane) return;

        pane.innerHTML = `
            <div class="aee-filtros">
                <div class="aee-filtros-row">
                    <div class="aee-filtro-item aee-filtro-busca">
                        <i class="fas fa-search"></i>
                        <input type="text" id="aeeProvasBusca" placeholder="Buscar por título, código, professor..." value="${this.escapeHtml(this.filtrosProvas.busca)}">
                    </div>
                    <div class="aee-filtro-item">
                        <label>Turma</label>
                        <select id="aeeProvasTurma">
                            ${this.gerarOpcoesSelect(this.filtrosDisponiveis.turmas, this.filtrosProvas.turma, 'Todas')}
                        </select>
                    </div>
                    <div class="aee-filtro-item">
                        <label>Tipo</label>
                        <select id="aeeProvasTipo">
                            <option value="todas" ${this.filtrosProvas.tipo === 'todas' ? 'selected' : ''}>Todas</option>
                            <option value="adaptada" ${this.filtrosProvas.tipo === 'adaptada' ? 'selected' : ''}>🎯 Adaptadas</option>
                            <option value="normal" ${this.filtrosProvas.tipo === 'normal' ? 'selected' : ''}>📝 Normais</option>
                        </select>
                    </div>
                    <div class="aee-filtro-item">
                        <label>Período</label>
                        <select id="aeeProvasPeriodo">
                            ${this.gerarOpcoesSelect(['1', '2', '3', '4'], this.filtrosProvas.periodo, 'Todos')}
                        </select>
                    </div>
                    <button class="aee-btn aee-btn-outline" onclick="AeeModule.limparFiltrosProvas()" title="Limpar">
                        <i class="fas fa-eraser"></i>
                    </button>
                </div>
            </div>

            <div class="aee-contador">
                <i class="fas fa-file-alt"></i>
                <strong>${data.total}</strong> prova(s) encontrada(s)
            </div>

            ${data.provas.length > 0 ? `
                <div class="aee-table-wrapper">
                    <table class="aee-table">
                        <thead>
                            <tr>
                                <th>Código</th>
                                <th>Título</th>
                                <th>Turma</th>
                                <th>Professor</th>
                                <th>Tipo</th>
                                <th>Questões</th>
                                <th>Data Limite</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.provas.map(p => `
                                <tr>
                                    <td><code class="aee-code">${this.escapeHtml(p.codigo || '-')}</code></td>
                                    <td><strong>${this.escapeHtml(p.titulo)}</strong></td>
                                    <td>${this.escapeHtml(p.turma?.nome || '-')}</td>
                                    <td>${this.escapeHtml(p.professor || '-')}</td>
                                    <td>
                                        <span class="aee-badge-tipo ${p.tipo === 'adaptada' ? 'adaptada' : 'normal'}">
                                            ${p.tipo === 'adaptada' ? '🎯 Adaptada' : '📝 Normal'}
                                        </span>
                                    </td>
                                    <td>${p.quantidadeQuestoes}</td>
                                    <td>${this.formatarData(p.dataLimite)}</td>
                                    <td>
                                        <div class="aee-td-actions">
                                            <button class="aee-btn-icon" onclick="AeeModule.visualizarProva('${p.id}')" title="Visualizar">
                                                <i class="fas fa-eye"></i>
                                            </button>
                                            <button class="aee-btn-icon aee-btn-print" onclick="AeeModule.baixarImprimirProva('${p.id}')" title="Imprimir">
                                                <i class="fas fa-print"></i>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                ${this.renderizarPaginacao('provas')}
            ` : `
                <div class="aee-empty-state">
                    <i class="fas fa-file-alt"></i>
                    <h3>Nenhuma prova encontrada</h3>
                    <p>Ajuste os filtros para encontrar provas.</p>
                </div>
            `}
        `;

        setTimeout(() => this.aplicarEventosFiltrosProvas(), 50);
    },

    aplicarEventosFiltrosProvas() {
        const busca = this.safeGet('aeeProvasBusca');
        const turma = this.safeGet('aeeProvasTurma');
        const tipo = this.safeGet('aeeProvasTipo');
        const periodo = this.safeGet('aeeProvasPeriodo');

        if (busca) {
            let timeout;
            busca.addEventListener('input', (e) => {
                clearTimeout(timeout);
                timeout = setTimeout(() => {
                    this.filtrosProvas.busca = e.target.value;
                    this.paginacao.provas.paginaAtual = 1;
                    this.carregarProvas();
                }, 400);
            });
        }

        const aplicar = (chave, el) => {
            if (el) el.addEventListener('change', (e) => {
                this.filtrosProvas[chave] = e.target.value;
                this.paginacao.provas.paginaAtual = 1;
                this.carregarProvas();
            });
        };

        aplicar('turma', turma);
        aplicar('tipo', tipo);
        aplicar('periodo', periodo);
    },

    limparFiltrosProvas() {
        this.filtrosProvas = { busca: '', turma: 'todas', tipo: 'todas', periodo: 'todos' };
        this.paginacao.provas.paginaAtual = 1;
        this.carregarProvas();
    },

    // ============================================================================
    // 🔥 VISUALIZAR PROVA (apenas visualização, SEM respostas corretas)
    // ============================================================================
    async visualizarProva(provaId) {
        console.log('👁️ AEE - Visualizando prova:', provaId);

        try {
            const token = this.getToken();

            // Fecha modais anteriores
            const antigo = document.getElementById('aeeModalVisualizarProva');
            if (antigo) antigo.remove();

            this.mostrarToast('📄 Carregando prova...', 'info');

            const response = await fetch(`/api/provas/${provaId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Erro ao carregar prova');

            const data = await response.json();
            if (!data.success) throw new Error(data.error || 'Erro ao carregar prova');

            const prova = data.prova;
            const questoes = data.questoes || [];

            const isAdaptada = prova.tipoProva === 'adaptada' || prova.adaptada === true || prova.tipo === 'adaptada';
            const letrasUsadas = isAdaptada ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D', 'E'];

            // 🔥 LIMPA PREFIXOS DUPLICADOS: A), a), A., A -, (A)
            const limparPrefixoOpcao = (texto, letra) => {
                if (!texto) return 'Opção não disponível';
                let textoLimpo = String(texto).trim();
                const letraUpper = letra.toUpperCase();

                const padroes = [
                    new RegExp(`^\\(${letraUpper}\\)\\s*`, 'i'),
                    new RegExp(`^${letraUpper}\\)\\s*`, 'i'),
                    new RegExp(`^${letraUpper}\\.\\s*`, 'i'),
                    new RegExp(`^${letraUpper}\\s*-\\s*`, 'i'),
                    new RegExp(`^${letraUpper}:\\s*`, 'i'),
                    new RegExp(`^${letraUpper}\\s+`, 'i'),
                ];

                for (const padrao of padroes) {
                    if (padrao.test(textoLimpo)) {
                        textoLimpo = textoLimpo.replace(padrao, '').trim();
                        break;
                    }
                }
                return textoLimpo || 'Opção não disponível';
            };

            // Monta HTML das questões (SEM respostas corretas)
            let questoesHTML = '';
            questoes.forEach((q, index) => {
                const opcoes = q.opcoes || [];
                const opcoesFormatadas = opcoes.map((opcao, optIndex) => {
                    const letra = letrasUsadas[optIndex];
                    const textoLimpo = limparPrefixoOpcao(opcao, letra);
                    return { letra, texto: textoLimpo };
                });

                questoesHTML += `
                    <div style="margin-bottom: 22px; page-break-inside: avoid; padding: 15px; background: #f8fafc; border-radius: 10px; border-left: 4px solid #6366f1;">
                        <div style="font-weight: bold; margin-bottom: 8px; padding-bottom: 5px; border-bottom: 1px solid #e2e8f0; color: #1e293b; display: flex; justify-content: space-between; align-items: center;">
                            <span>Questão ${index + 1}</span>
                            <span style="background: #e0e7ff; color: #4338ca; padding: 2px 10px; border-radius: 20px; font-size: 11px; font-weight: 600;">
                                ${q.dificuldade || 'Média'}
                            </span>
                        </div>
                        <div style="margin-bottom: 12px; line-height: 1.5; color: #1f2937;">
                            ${this.escapeHtml(q.pergunta || 'Pergunta não disponível')}
                        </div>
                        <div style="margin-left: 8px; background: white; padding: 12px; border-radius: 8px;">
                            ${opcoesFormatadas.map(op => `
                                <div style="display: flex; margin: 8px 0; padding: 6px 8px; border-radius: 6px;">
                                    <span style="font-weight: 600; min-width: 28px; color: #4338ca;">${op.letra})</span>
                                    <span style="color: #374151;">${this.escapeHtml(op.texto)}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            });

            const modalHtml = `
                <div class="aee-modal-backdrop" id="aeeModalVisualizarProva" style="
                    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                    background: rgba(0,0,0,0.6); z-index: 10000;
                    display: flex; align-items: center; justify-content: center;
                    padding: 20px; box-sizing: border-box;
                ">
                    <div class="aee-modal" style="
                        background: white; border-radius: 20px; max-width: 900px; width: 100%;
                        max-height: 90vh; display: flex; flex-direction: column;
                        box-shadow: 0 20px 60px rgba(0,0,0,0.3); overflow: hidden;
                    ">
                        <div class="aee-modal-header" style="
                            background: linear-gradient(135deg, #6366f1, #8b5cf6);
                            color: white; padding: 20px 25px;
                            display: flex; justify-content: space-between; align-items: center;
                        ">
                            <div style="display: flex; align-items: center; gap: 15px;">
                                <div style="
                                    width: 48px; height: 48px; background: rgba(255,255,255,0.2);
                                    border-radius: 12px; display: flex; align-items: center; justify-content: center;
                                    font-size: 22px;
                                ">
                                    <i class="fas fa-eye"></i>
                                </div>
                                <div>
                                    <h3 style="margin: 0; font-size: 1.2rem; font-weight: 700;">
                                        ${this.escapeHtml(prova.titulo)}
                                    </h3>
                                    <p style="margin: 4px 0 0; opacity: 0.9; font-size: 0.85rem;">
                                        <i class="fas fa-file-alt"></i>
                                        ${isAdaptada ? '🎯 Prova Adaptada' : '📝 Prova Normal'} •
                                        ${questoes.length} questões
                                    </p>
                                </div>
                            </div>
                            <button onclick="document.getElementById('aeeModalVisualizarProva').remove()" style="
                                background: rgba(255,255,255,0.2); border: none; color: white;
                                width: 36px; height: 36px; border-radius: 50%; cursor: pointer;
                                font-size: 20px; display: flex; align-items: center; justify-content: center;
                            ">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>

                        <div class="aee-modal-body" style="
                            padding: 20px 25px; overflow-y: auto; flex: 1;
                        ">
                            <div style="
                                background: #eff6ff; border-left: 4px solid #3b82f6;
                                padding: 12px 15px; border-radius: 8px; margin-bottom: 20px;
                                display: flex; align-items: center; gap: 10px;
                                font-size: 0.9rem; color: #1e40af;
                            ">
                                <i class="fas fa-info-circle" style="font-size: 1.2rem;"></i>
                                <span>
                                    <strong>Visualização apenas.</strong>
                                    As respostas corretas estão ocultas. Use o botão <strong>"Imprimir"</strong> para gerar o PDF.
                                </span>
                            </div>

                            <div style="
                                background: #f8fafc; border-radius: 12px; padding: 15px;
                                margin-bottom: 20px; border: 1px solid #e2e8f0;
                            ">
                                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; font-size: 0.9rem;">
                                    <div>
                                        <span style="color: #64748b; font-size: 0.75rem; display: block; text-transform: uppercase; font-weight: 600;">Código</span>
                                        <span style="color: #1e293b; font-weight: 600;">${this.escapeHtml(prova.codigo || '-')}</span>
                                    </div>
                                    <div>
                                        <span style="color: #64748b; font-size: 0.75rem; display: block; text-transform: uppercase; font-weight: 600;">Turma</span>
                                        <span style="color: #1e293b; font-weight: 600;">${this.escapeHtml(prova.turma?.nome || '-')}</span>
                                    </div>
                                    <div>
                                        <span style="color: #64748b; font-size: 0.75rem; display: block; text-transform: uppercase; font-weight: 600;">Disciplina</span>
                                        <span style="color: #1e293b; font-weight: 600;">${this.escapeHtml(prova.turma?.disciplina || '-')}</span>
                                    </div>
                                    <div>
                                        <span style="color: #64748b; font-size: 0.75rem; display: block; text-transform: uppercase; font-weight: 600;">Professor</span>
                                        <span style="color: #1e293b; font-weight: 600;">${this.escapeHtml(prova.professor?.nome || prova.professor || '-')}</span>
                                    </div>
                                    <div>
                                        <span style="color: #64748b; font-size: 0.75rem; display: block; text-transform: uppercase; font-weight: 600;">Data Limite</span>
                                        <span style="color: #1e293b; font-weight: 600;">${this.formatarData(prova.dataLimite)}</span>
                                    </div>
                                    <div>
                                        <span style="color: #64748b; font-size: 0.75rem; display: block; text-transform: uppercase; font-weight: 600;">Duração</span>
                                        <span style="color: #1e293b; font-weight: 600;">${prova.duracaoMinutos || '-'} min</span>
                                    </div>
                                </div>
                            </div>

                            <h4 style="margin: 0 0 15px; color: #1e293b; display: flex; align-items: center; gap: 8px;">
                                <i class="fas fa-list-ol" style="color: #6366f1;"></i>
                                Questões (${questoes.length})
                            </h4>

                            <div>
                                ${questoesHTML}
                            </div>
                        </div>

                        <div class="aee-modal-footer" style="
                            padding: 15px 25px; border-top: 1px solid #e2e8f0;
                            display: flex; justify-content: flex-end; gap: 10px;
                            background: #f8fafc;
                        ">
                            <button onclick="document.getElementById('aeeModalVisualizarProva').remove()" style="
                                padding: 10px 20px; background: #6b7280; color: white;
                                border: none; border-radius: 10px; font-weight: 600;
                                cursor: pointer; font-size: 0.9rem;
                            ">
                                <i class="fas fa-times"></i> Fechar
                            </button>
                            <button onclick="document.getElementById('aeeModalVisualizarProva').remove(); AeeModule.baixarImprimirProva('${provaId}')" style="
                                padding: 10px 20px; background: linear-gradient(135deg, #10b981, #059669);
                                color: white; border: none; border-radius: 10px; font-weight: 600;
                                cursor: pointer; font-size: 0.9rem;
                            ">
                                <i class="fas fa-print"></i> Imprimir Prova
                            </button>
                        </div>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', modalHtml);

            // Fecha ao clicar fora
            setTimeout(() => {
                const backdrop = document.getElementById('aeeModalVisualizarProva');
                if (backdrop) {
                    backdrop.addEventListener('click', (e) => {
                        if (e.target === backdrop) backdrop.remove();
                    });
                }
            }, 50);

        } catch (error) {
            console.error('❌ Erro ao visualizar prova:', error);
            this.mostrarToast('❌ ' + error.message, 'error');
        }
    },

    // ============================================================================
    // 🔥 BAIXAR / IMPRIMIR PROVA - Idêntico ao admin-simples (com fallback de QR Code)
    // ============================================================================
    async baixarImprimirProva(provaId) {
        console.log('🖨️ Baixando/Imprimindo prova:', provaId);

        try {
            const token = this.getToken();

            // Fecha modais anteriores
            this._fecharModaisImpressaoAEE();
            const modalVisualizar = document.getElementById('aeeModalVisualizarProva');
            if (modalVisualizar) modalVisualizar.remove();

            const IS_LOCALHOST = window.location.hostname === 'localhost' ||
                                window.location.hostname === '127.0.0.1';
            const IS_RENDER = window.location.hostname.includes('render.com') ||
                            window.location.hostname.includes('sistema-avaliativo');

            let API_BASE_URL;
            if (IS_LOCALHOST) {
                API_BASE_URL = 'http://localhost:3000/api';
                console.log('🔧 Modo: DESENVOLVIMENTO LOCAL');
            } else if (IS_RENDER) {
                API_BASE_URL = window.location.origin + '/api';
                console.log('🚀 Modo: PRODUÇÃO (Render)');
            } else {
                API_BASE_URL = '/api';
                console.log('⚙️ Modo: FALLBACK');
            }

            this.mostrarToast('📄 Preparando prova para impressão...', 'info');

            // Busca dados completos da prova
            const response = await fetch(`${API_BASE_URL}/provas/${provaId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Erro ao carregar dados da prova');

            const data = await response.json();
            if (!data.success) throw new Error(data.error || 'Erro ao carregar prova');

            const prova = data.prova;
            const questoes = data.questoes || [];

            // 🔥 QR Code: tenta gerar, mas SILENCIOSAMENTE continua se falhar
            let qrCodeDataUrl = '';
            try {
                const correcaoUrl = `${window.location.origin}/corrigir-prova.html?prova=${provaId}`;

                const qrResponse = await fetch(`${API_BASE_URL}/qrcode/gerar`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ url: correcaoUrl })
                });

                // 🔥 Verifica se a resposta é OK e se é JSON antes de tentar fazer parse
                if (qrResponse.ok) {
                    const contentType = qrResponse.headers.get('content-type');
                    if (contentType && contentType.includes('application/json')) {
                        const qrData = await qrResponse.json();
                        if (qrData.success && qrData.qrCode) {
                            qrCodeDataUrl = qrData.qrCode;
                            console.log('✅ QR Code gerado com sucesso');
                        }
                    }
                } else {
                    console.log(`ℹ️ Rota QR Code indisponível (${qrResponse.status}) - prova será impressa sem QR Code`);
                }
            } catch (qrError) {
                // 🔥 Silencioso - continua sem QR Code
                console.log('ℹ️ QR Code não disponível - imprimindo sem QR Code');
            }

            // Salva dados para uso posterior
            window.provaParaImpressao = { prova, questoes, qrCodeDataUrl, API_BASE_URL, token };

            // Carrega alunos da turma
            await this._carregarAlunosParaImpressao();

            // 🔥 Mostra o MESMO modal do admin-simples
            this._mostrarModalPerguntaAdaptacao();

        } catch (error) {
            console.error('❌ Erro ao preparar impressão:', error);
            this.mostrarToast(`❌ Erro: ${error.message}`, 'error');
        }
    },

    // ============================================================================
    // CARREGAR ALUNOS DA TURMA PARA IMPRESSÃO (com fallback)
    // ============================================================================
    async _carregarAlunosParaImpressao() {
        try {
            const { prova } = window.provaParaImpressao || {};
            if (!prova) {
                window.alunosDaTurma = [];
                return;
            }

            let turmaId = prova.turmaId || prova.turma?.id || prova.turma;
            if (!turmaId) {
                console.log('ℹ️ Sem turmaId - nenhum aluno será carregado');
                window.alunosDaTurma = [];
                return;
            }

            const token = this.getToken();

            // 🔥 Fallback 1: buscar via /api/turmas/:id
            try {
                const response = await fetch(`/api/turmas/${turmaId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (response.ok) {
                    const data = await response.json();
                    let alunosRaw = [];

                    if (data.success && data.turma && data.turma.alunos) alunosRaw = data.turma.alunos;
                    else if (data.turma && data.turma.alunos) alunosRaw = data.turma.alunos;
                    else if (data.alunos) alunosRaw = data.alunos;

                    if (alunosRaw.length > 0) {
                        const alunosUnicos = new Map();
                        for (const aluno of alunosRaw) {
                            const alunoId = aluno._id || aluno.id || aluno.alunoId;
                            if (alunoId && !alunosUnicos.has(alunoId.toString())) {
                                alunosUnicos.set(alunoId.toString(), {
                                    id: alunoId,
                                    nome: aluno.nome || aluno.alunoNome || 'Aluno',
                                    email: aluno.email || aluno.alunoEmail || '',
                                    matricula: aluno.matricula || ''
                                });
                            }
                        }

                        window.alunosDaTurma = Array.from(alunosUnicos.values());
                        console.log(`✅ ${window.alunosDaTurma.length} alunos carregados via /api/turmas`);
                        return;
                    }
                }
            } catch (e) {
                console.warn('⚠️ Erro em /api/turmas:', e.message);
            }

            // 🔥 Fallback 2: buscar via /api/aee/alunos filtrando por turma
            try {
                const turmaNome = prova.turma?.nome;
                if (turmaNome) {
                    const response = await fetch(`/api/aee/alunos?turma=${encodeURIComponent(turmaNome)}&limit=500`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (response.ok) {
                        const data = await response.json();
                        if (data.success && data.alunos) {
                            window.alunosDaTurma = data.alunos.map(a => ({
                                id: a.id,
                                nome: a.nome,
                                email: a.email,
                                matricula: a.matricula
                            }));
                            console.log(`✅ ${window.alunosDaTurma.length} alunos (fallback AEE)`);
                            return;
                        }
                    }
                }
            } catch (e) {
                console.warn('⚠️ Fallback AEE falhou:', e.message);
            }

            // Sem alunos
            window.alunosDaTurma = [];
            console.log('ℹ️ Nenhum aluno carregado - impressão será só da prova');

        } catch (error) {
            console.error('❌ Erro ao carregar alunos:', error);
            window.alunosDaTurma = [];
        }
    },
    // ============================================================================
    // MODAL: PERGUNTAR SE DESEJA ADAPTAR (idêntico ao admin-simples)
    // ============================================================================
    _mostrarModalPerguntaAdaptacao() {
        if (!window.provaParaImpressao || !window.provaParaImpressao.prova) {
            this.mostrarToast('❌ Dados da prova não encontrados.', 'error');
            return;
        }

        this._fecharModaisImpressaoAEE();

        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'aeeModalPerguntaAdaptacao';
        modal.style.cssText = `
            display: flex;
            position: fixed;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
            z-index: 10001;
            align-items: center;
            justify-content: center;
        `;

        const alunos = window.alunosDaTurma || [];
        const temAlunos = alunos.length > 0;

        let selectOptions = '<option value="">Selecione um aluno...</option>';
        if (temAlunos) {
            selectOptions += alunos.map(aluno => `
                <option value="${aluno.id}">
                    ${aluno.nome} ${aluno.matricula ? `(${aluno.matricula})` : ''}
                </option>
            `).join('');
        } else {
            selectOptions = '<option value="" disabled>Nenhum aluno encontrado</option>';
        }

        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px; width: 90%; background: white; border-radius: 24px; padding: 0; box-shadow: 0 20px 40px rgba(0,0,0,0.2);">
                <div class="modal-header" style="background: linear-gradient(135deg, #4f46e5, #7c3aed); color: white; padding: 20px 25px; border-radius: 24px 24px 0 0; display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin: 0; display: flex; align-items: center; gap: 10px;">
                        <i class="fas fa-print"></i> Imprimir Prova
                    </h3>
                    <button onclick="AeeModule._fecharModaisImpressaoAEE()" style="background: none; border: none; color: white; font-size: 28px; cursor: pointer;">&times;</button>
                </div>

                <div style="padding: 25px;">
                    <p style="color: #4b5563; margin-bottom: 20px; text-align: center; font-size: 1rem;">
                        Deseja adaptar esta prova para acessibilidade?
                    </p>

                    <div style="margin-bottom: 20px; padding: 15px; background: #f8fafc; border-radius: 16px;">
                        <label style="display: flex; align-items: center; gap: 12px; cursor: pointer; margin-bottom: 12px;">
                            <input type="radio" name="aeeTipoImpressao" value="individual" ${temAlunos ? 'checked' : 'disabled'} onchange="AeeModule._toggleOpcaoAlunosAEE()">
                            <span><strong>👤 Imprimir para um aluno específico</strong></span>
                        </label>

                        <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                            <input type="radio" name="aeeTipoImpressao" value="todos" ${temAlunos ? '' : 'checked disabled'} onchange="AeeModule._toggleOpcaoAlunosAEE()">
                            <span><strong>👥 Imprimir para todos os alunos da turma</strong></span>
                        </label>

                        <div id="aeeSelectAlunosContainer" style="margin-top: 15px; ${temAlunos ? 'display: block;' : 'display: none;'}">
                            <label style="display: block; margin-bottom: 8px; font-weight: 500;">
                                <i class="fas fa-user-graduate"></i> Selecione o aluno:
                            </label>
                            <select id="aeeSelectAlunoImpressao" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #ddd;">
                                ${selectOptions}
                            </select>
                        </div>

                        <div style="margin-top: 12px; padding: 10px; background: #e0f2fe; border-radius: 8px; font-size: 0.85rem;">
                            <i class="fas fa-info-circle"></i>
                            <span id="aeeInfoImpressao">${temAlunos ? 'Selecione um aluno ou imprima para todos.' : 'Nenhum aluno encontrado nesta turma.'}</span>
                        </div>
                    </div>

                    <div style="display: flex; gap: 15px;">
                        <button onclick="AeeModule._gerarImpressaoNormalAEE()" style="flex: 1; padding: 14px; background: #6b7280; color: white; border: none; border-radius: 12px; font-weight: 600; cursor: pointer;">
                            <i class="fas fa-times"></i> Não, imprimir normal
                        </button>
                        <button onclick="AeeModule._mostrarModalOpcoesAdaptacaoAEE()" style="flex: 1; padding: 14px; background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; border-radius: 12px; font-weight: 600; cursor: pointer;">
                            <i class="fas fa-universal-access"></i> Sim, adaptar
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
    },

    _toggleOpcaoAlunosAEE() {
        const tipoImpressao = document.querySelector('input[name="aeeTipoImpressao"]:checked')?.value;
        const selectContainer = document.getElementById('aeeSelectAlunosContainer');
        const infoSpan = document.getElementById('aeeInfoImpressao');

        if (tipoImpressao === 'individual') {
            if (selectContainer) selectContainer.style.display = 'block';
            if (infoSpan) infoSpan.innerHTML = 'Será gerada uma prova com QR Code específico para o aluno selecionado.';
        } else {
            if (selectContainer) selectContainer.style.display = 'none';
            if (infoSpan) infoSpan.innerHTML = 'Será gerado um documento único com todos os alunos da turma.';
        }
    },

    // ============================================================================
    // MODAL: OPÇÕES DE ADAPTAÇÃO
    // ============================================================================
    _mostrarModalOpcoesAdaptacaoAEE() {
        if (!window.provaParaImpressao || !window.provaParaImpressao.prova) {
            this.mostrarToast('❌ Dados da prova não encontrados.', 'error');
            return;
        }

        const modalPergunta = document.getElementById('aeeModalPerguntaAdaptacao');
        if (modalPergunta) modalPergunta.style.display = 'none';

        let modalAntigo = document.getElementById('aeeModalOpcoesAdaptacao');
        if (modalAntigo) modalAntigo.remove();

        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'aeeModalOpcoesAdaptacao';
        modal.style.cssText = `
            display: flex;
            position: fixed;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background-color: rgba(0, 0, 0, 0.5);
            z-index: 10002;
            align-items: center;
            justify-content: center;
        `;

        const { prova } = window.provaParaImpressao;
        const isAdaptada = prova?.tipoProva === 'adaptada' || prova?.adaptada === true || prova?.tipo === 'adaptada';

        modal.innerHTML = `
            <div class="modal-content" style="max-width: 580px; width: 90%; background: white; border-radius: 24px; padding: 0; max-height: 90vh; overflow-y: auto;">
                <div class="modal-header" style="background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 20px 25px; border-radius: 24px 24px 0 0; display: flex; justify-content: space-between; position: sticky; top: 0; z-index: 10;">
                    <h3 style="margin: 0;"><i class="fas fa-universal-access"></i> Opções de Adaptação</h3>
                    <button onclick="AeeModule._fecharModalOpcoesAdaptacaoAEE()" style="background: none; border: none; color: white; font-size: 28px; cursor: pointer;">&times;</button>
                </div>
                <div style="padding: 25px;">
                    ${isAdaptada ? `<div style="background: #dbeafe; padding: 10px; margin-bottom: 15px; border-radius: 8px;"><i class="fas fa-info-circle"></i> Prova originalmente adaptada - 3 alternativas</div>` : ''}

                    <div style="display: flex; flex-direction: column; gap: 15px;">
                        <div style="background: #f8fafc; padding: 15px; border-radius: 16px; border: 2px solid #e5e7eb;">
                            <label style="display: flex; align-items: center; gap: 12px; cursor: pointer; margin-bottom: 10px;">
                                <input type="checkbox" id="aeeOptFonteDinamica" style="width: 20px; height: 20px;">
                                <div>
                                    <strong style="font-size: 1rem;">🔍 Fonte Dinâmica</strong>
                                    <p style="margin: 5px 0 0; font-size: 0.85rem; color: #6b7280;">Amplie o tamanho da fonte conforme sua necessidade</p>
                                </div>
                            </label>
                            <div id="aeeSliderContainer" style="display: none; margin-top: 15px; padding-top: 10px; border-top: 1px solid #e5e7eb;">
                                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                                    <span style="font-size: 12px;">Normal (12pt)</span>
                                    <span style="font-size: 12px; font-weight: bold;" id="aeeTamanhoFonteAtual">12pt</span>
                                    <span style="font-size: 12px;">Máximo (48pt)</span>
                                </div>
                                <input type="range" id="aeeFonteSlider" min="12" max="48" step="1" value="12" style="width: 100%; margin: 10px 0;">
                                <div style="display: flex; justify-content: space-between; gap: 10px; margin-top: 10px;">
                                    <button type="button" onclick="AeeModule._ajustarFonteAEE(12)" style="flex: 1; padding: 6px; background: #e5e7eb; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">Normal</button>
                                    <button type="button" onclick="AeeModule._ajustarFonteAEE(18)" style="flex: 1; padding: 6px; background: #e5e7eb; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">Médio</button>
                                    <button type="button" onclick="AeeModule._ajustarFonteAEE(24)" style="flex: 1; padding: 6px; background: #e5e7eb; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">Grande</button>
                                    <button type="button" onclick="AeeModule._ajustarFonteAEE(36)" style="flex: 1; padding: 6px; background: #e5e7eb; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">Muito Grande</button>
                                    <button type="button" onclick="AeeModule._ajustarFonteAEE(48)" style="flex: 1; padding: 6px; background: #e5e7eb; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">Máximo</button>
                                </div>
                                <div style="margin-top: 10px; padding: 8px; background: #f1f5f9; border-radius: 8px; text-align: center; font-size: 12px; color: #475569;">
                                    <i class="fas fa-mouse-pointer"></i> <strong>Pré-visualização:</strong>
                                    <span id="aeePreviewFonte" style="font-size: 12px; display: inline-block; margin-left: 8px;">Texto exemplo</span>
                                </div>
                            </div>
                        </div>

                        <div style="background: #f8fafc; padding: 15px; border-radius: 16px; border: 2px solid #e5e7eb;">
                            <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                                <input type="checkbox" id="aeeOptCaixaAlta" style="width: 20px; height: 20px;">
                                <div>
                                    <strong style="font-size: 1rem;">🔠 CAIXA ALTA (Maiúsculas)</strong>
                                    <p style="margin: 5px 0 0; font-size: 0.85rem; color: #6b7280;">Converte todo o texto para letras maiúsculas</p>
                                </div>
                            </label>
                            <div style="margin-top: 10px; padding: 8px; background: #fff; border-radius: 8px; font-size: 12px; color: #64748b; border: 1px solid #e5e7eb;">
                                <i class="fas fa-eye"></i> Pré-visualização: <span id="aeePreviewCaixaAlta">Exemplo de texto em maiúsculas</span>
                            </div>
                        </div>

                        <div style="background: #f8fafc; padding: 15px; border-radius: 16px; border: 2px solid #e5e7eb;">
                            <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                                <input type="checkbox" id="aeeOptNegrito" style="width: 20px; height: 20px;">
                                <div>
                                    <strong style="font-size: 1rem;">🔤 Texto em Negrito</strong>
                                    <p style="margin: 5px 0 0; font-size: 0.85rem; color: #6b7280;">Aplicar negrito em todo o texto da prova</p>
                                </div>
                            </label>
                        </div>

                        <div style="background: #f8fafc; padding: 15px; border-radius: 16px; border: 2px solid #e5e7eb;">
                            <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                                <input type="checkbox" id="aeeOptAltoContraste" style="width: 20px; height: 20px;">
                                <div>
                                    <strong style="font-size: 1rem;">🎨 Alto Contraste</strong>
                                    <p style="margin: 5px 0 0; font-size: 0.85rem; color: #6b7280;">Fundo escuro com texto claro para melhor visualização</p>
                                </div>
                            </label>
                        </div>

                        <div style="background: #f8fafc; padding: 15px; border-radius: 16px; border: 2px solid #e5e7eb;">
                            <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                                <input type="checkbox" id="aeeOptLayoutSimplificado" style="width: 20px; height: 20px;">
                                <div>
                                    <strong style="font-size: 1rem;">📄 Layout Simplificado</strong>
                                    <p style="margin: 5px 0 0; font-size: 0.85rem; color: #6b7280;">Remover elementos decorativos, manter apenas o essencial</p>
                                </div>
                            </label>
                        </div>
                    </div>

                    <div style="margin-top: 20px; padding: 12px; background: #fef3c7; border-radius: 12px;">
                        <p style="margin: 0; font-size: 0.85rem;"><i class="fas fa-lightbulb"></i> <strong>Dica:</strong> Você pode combinar várias opções conforme a necessidade do aluno.</p>
                    </div>

                    <div style="display: flex; gap: 12px; margin-top: 25px;">
                        <button type="button" onclick="AeeModule._gerarImpressaoComOpcoesAEE()" style="flex: 1; padding: 14px; background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; border-radius: 12px; font-weight: 600; cursor: pointer;">Imprimir com Adaptações</button>
                        <button type="button" onclick="AeeModule._fecharModalOpcoesAdaptacaoAEE()" style="flex: 1; padding: 14px; background: #6b7280; color: white; border: none; border-radius: 12px; font-weight: 600; cursor: pointer;">Cancelar</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Eventos
        const fonteDinamicaCheckbox = document.getElementById('aeeOptFonteDinamica');
        const sliderContainer = document.getElementById('aeeSliderContainer');
        const fonteSlider = document.getElementById('aeeFonteSlider');
        const tamanhoAtual = document.getElementById('aeeTamanhoFonteAtual');
        const previewFonte = document.getElementById('aeePreviewFonte');
        const caixaAltaCheckbox = document.getElementById('aeeOptCaixaAlta');
        const previewCaixaAlta = document.getElementById('aeePreviewCaixaAlta');

        if (caixaAltaCheckbox && previewCaixaAlta) {
            caixaAltaCheckbox.addEventListener('change', function() {
                if (this.checked) {
                    previewCaixaAlta.style.textTransform = 'uppercase';
                    previewCaixaAlta.style.fontWeight = 'bold';
                    previewCaixaAlta.style.color = '#10b981';
                    previewCaixaAlta.innerHTML = 'EXEMPLO DE TEXTO EM MAIÚSCULAS';
                } else {
                    previewCaixaAlta.style.textTransform = 'none';
                    previewCaixaAlta.style.fontWeight = 'normal';
                    previewCaixaAlta.style.color = '#64748b';
                    previewCaixaAlta.innerHTML = 'Exemplo de texto em maiúsculas';
                }
            });
        }

        if (fonteDinamicaCheckbox) {
            fonteDinamicaCheckbox.addEventListener('change', function() {
                sliderContainer.style.display = this.checked ? 'block' : 'none';
            });
        }

        if (fonteSlider) {
            fonteSlider.addEventListener('input', function() {
                const tamanho = this.value;
                tamanhoAtual.textContent = tamanho + 'pt';
                previewFonte.style.fontSize = tamanho + 'pt';
                previewFonte.style.fontWeight = 'bold';
            });
            fonteSlider.dispatchEvent(new Event('input'));
        }
    },

    _ajustarFonteAEE(tamanho) {
        const slider = document.getElementById('aeeFonteSlider');
        const tamanhoAtual = document.getElementById('aeeTamanhoFonteAtual');
        const previewFonte = document.getElementById('aeePreviewFonte');

        if (slider) {
            slider.value = tamanho;
            tamanhoAtual.textContent = tamanho + 'pt';
            previewFonte.style.fontSize = tamanho + 'pt';

            const checkbox = document.getElementById('aeeOptFonteDinamica');
            if (checkbox && !checkbox.checked) {
                checkbox.checked = true;
                const sliderContainer = document.getElementById('aeeSliderContainer');
                if (sliderContainer) sliderContainer.style.display = 'block';
            }
        }
    },

    // ============================================================================
    // IMPRESSÃO NORMAL (com fallback se não houver alunos)
    // ============================================================================
    async _gerarImpressaoNormalAEE() {
        console.log('🖨️ Gerando impressão normal...');

        const { prova, questoes, qrCodeDataUrl } = window.provaParaImpressao || {};
        if (!prova) {
            this.mostrarToast('❌ Erro: dados da prova não encontrados', 'error');
            return;
        }

        const tipoImpressao = document.querySelector('input[name="aeeTipoImpressao"]:checked')?.value;
        const selectAluno = document.getElementById('aeeSelectAlunoImpressao');
        const alunoId = selectAluno?.value;
        const alunoNome = selectAluno?.options[selectAluno.selectedIndex]?.text.split('(')[0].trim();

        this._fecharModaisImpressaoAEE();

        // 🔥 Se não há alunos, imprime só a prova (sem QR Code de aluno)
        const alunos = window.alunosDaTurma || [];
        if (alunos.length === 0) {
            console.log('ℹ️ Sem alunos - imprimindo prova sem QR Code de aluno');
            await this._gerarHTMLImpressaoAEE(prova, questoes, qrCodeDataUrl, {}, null, null);
            return;
        }

        if (tipoImpressao === 'todos') {
            await this._gerarImpressaoTodosAlunosAEE(prova, questoes, qrCodeDataUrl, {}, alunos);
            return;
        }

        if (!alunoId) {
            this.mostrarToast('⚠️ Selecione um aluno ou escolha "todos"', 'info');
            this._mostrarModalPerguntaAdaptacao();
            return;
        }

        // Tenta buscar QR Code do aluno (silencioso se falhar)
        let qrCodeAlunoUrl = null;
        try {
            const token = this.getToken();
            const response = await fetch(`/api/aluno/qrcode/${alunoId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const contentType = response.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    const data = await response.json();
                    if (data.success && data.qrCode) {
                        qrCodeAlunoUrl = data.qrCode;
                        console.log('✅ QR Code do aluno obtido');
                    }
                }
            }
        } catch (error) {
            console.log('ℹ️ Sem QR Code do aluno');
        }

        await this._gerarHTMLImpressaoAEE(prova, questoes, qrCodeDataUrl, {}, qrCodeAlunoUrl, alunoNome);
    },

    // ============================================================================
    // IMPRESSÃO COM OPÇÕES
    // ============================================================================
    async _gerarImpressaoComOpcoesAEE() {
        console.log('🎨 Gerando impressão com opções...');

        const { prova, questoes, qrCodeDataUrl } = window.provaParaImpressao || {};
        if (!prova) {
            this.mostrarToast('❌ Dados da prova não encontrados', 'error');
            return;
        }

        const fonteDinamicaHabilitada = document.getElementById('aeeOptFonteDinamica')?.checked || false;
        const tamanhoFonte = fonteDinamicaHabilitada ? (document.getElementById('aeeFonteSlider')?.value || 12) : 12;

        const opcoes = {
            fonteAmpliada: fonteDinamicaHabilitada ? tamanhoFonte : false,
            fontePersonalizada: fonteDinamicaHabilitada ? tamanhoFonte : false,
            negrito: document.getElementById('aeeOptNegrito')?.checked || false,
            altoContraste: document.getElementById('aeeOptAltoContraste')?.checked || false,
            layoutSimplificado: document.getElementById('aeeOptLayoutSimplificado')?.checked || false,
            tamanhoFonte: parseInt(tamanhoFonte),
            caixaAlta: document.getElementById('aeeOptCaixaAlta')?.checked || false
        };

        const nenhumaOpcao = !opcoes.fonteAmpliada && !opcoes.negrito &&
                            !opcoes.altoContraste && !opcoes.layoutSimplificado && !opcoes.caixaAlta;

        if (nenhumaOpcao) {
            const confirmar = confirm('Nenhuma opção de adaptação foi selecionada.\n\nDeseja imprimir a prova normalmente?');
            if (confirmar) {
                this._fecharModalOpcoesAdaptacaoAEE();
                this._fecharModaisImpressaoAEE();
                await this._gerarImpressaoNormalAEE();
            }
            return;
        }

        const tipoImpressao = document.querySelector('input[name="aeeTipoImpressao"]:checked')?.value;
        const selectAluno = document.getElementById('aeeSelectAlunoImpressao');
        const alunoId = selectAluno?.value;
        const alunoNome = selectAluno?.options[selectAluno.selectedIndex]?.text.split('(')[0].trim();

        this._fecharModaisImpressaoAEE();

        if (tipoImpressao === 'todos') {
            const alunos = window.alunosDaTurma || [];
            if (alunos.length === 0) {
                this.mostrarToast('⚠️ Nenhum aluno encontrado', 'info');
                return;
            }
            await this._gerarImpressaoTodosAlunosAEE(prova, questoes, qrCodeDataUrl, opcoes, alunos);
            return;
        }

        if (!alunoId) {
            this.mostrarToast('⚠️ Selecione um aluno', 'info');
            this._mostrarModalPerguntaAdaptacao();
            return;
        }

        let qrCodeAlunoUrl = null;
        try {
            const token = this.getToken();
            const response = await fetch(`/api/aluno/qrcode/${alunoId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (data.success && data.qrCode) qrCodeAlunoUrl = data.qrCode;
        } catch (error) {
            console.warn('⚠️ Sem QR Code:', error.message);
        }

        await this._gerarHTMLImpressaoAEE(prova, questoes, qrCodeDataUrl, opcoes, qrCodeAlunoUrl, alunoNome);
    },

    // ============================================================================
    // IMPRESSÃO PARA TODOS OS ALUNOS
    // ============================================================================
    async _gerarImpressaoTodosAlunosAEE(prova, questoes, qrCodeDataUrl, opcoesAdaptacao, alunos) {
        this.mostrarToast(`🖨️ Gerando prova para ${alunos.length} aluno(s)...`, 'info');

        try {
            const token = this.getToken();

            const alunosComQRCode = await Promise.all(alunos.map(async (aluno) => {
                const alunoId = aluno.id || aluno._id;
                const alunoNome = aluno.nome || aluno.alunoNome || 'Aluno';
                let qrCodeAlunoUrl = '';

                try {
                    const response = await fetch(`/api/aluno/qrcode/${alunoId}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const data = await response.json();
                    if (data.success && data.qrCode) qrCodeAlunoUrl = data.qrCode;
                } catch (error) {
                    console.error(`❌ QR ${alunoNome}:`, error);
                }

                return { ...aluno, qrCodeDataUrl: qrCodeAlunoUrl, id: alunoId, nome: alunoNome };
            }));

            let htmlCompleto = '';
            for (let i = 0; i < alunosComQRCode.length; i++) {
                const aluno = alunosComQRCode[i];
                const htmlAluno = this._gerarHTMLProvaCompletaAEE(prova, questoes, qrCodeDataUrl, opcoesAdaptacao, aluno.qrCodeDataUrl, aluno.nome);
                htmlCompleto += htmlAluno;

                if (i < alunosComQRCode.length - 1) {
                    htmlCompleto += `<div style="page-break-before: always; break-before: page;"></div>`;
                }
            }

            const printWindow = window.open('', '_blank');
            printWindow.document.write(htmlCompleto);
            printWindow.document.close();

            printWindow.onload = function() {
                setTimeout(() => {
                    printWindow.print();
                    printWindow.onafterprint = function() {
                        printWindow.close();
                    };
                }, 500);
            };

            this.mostrarToast(`✅ Impressão preparada para ${alunosComQRCode.length} aluno(s)!`, 'success');

        } catch (error) {
            console.error('❌ Erro:', error);
            this.mostrarToast(`❌ Erro: ${error.message}`, 'error');
        }
    },

    // ============================================================================
    // GERAR HTML E IMPRIMIR
    // ============================================================================
    async _gerarHTMLImpressaoAEE(prova, questoes, qrCodeDataUrl, opcoesAdaptacao = {}, qrCodeAlunoUrl = null, alunoNome = null) {
        try {
            const printHTML = this._gerarHTMLProvaCompletaAEE(prova, questoes, qrCodeDataUrl, opcoesAdaptacao, qrCodeAlunoUrl, alunoNome);
            const printWindow = window.open('', '_blank');
            printWindow.document.write(printHTML);
            printWindow.document.close();
            printWindow.onload = () => {
                printWindow.print();
                printWindow.onafterprint = () => printWindow.close();
            };
            this.mostrarToast('✅ Impressão preparada!', 'success');
        } catch (error) {
            console.error('❌ Erro:', error);
            this.mostrarToast(`❌ Erro: ${error.message}`, 'error');
        }
    },

    // ============================================================================
    // 🔥 GERAR HTML COMPLETO DA PROVA (idêntico admin-simples)
    // ============================================================================
    _gerarHTMLProvaCompletaAEE(prova, questoes, qrCodeDataUrl, opcoesAdaptacao = {}, qrCodeAlunoUrl = null, alunoNome = null) {
        const provaTitulo = prova.titulo || 'Prova sem título';
        const logoIema = '/uploads/logo-iema.png';
        const dataFormatada = new Date().toLocaleDateString('pt-BR');

        const totalQuestoes = questoes.length;
        const turmaNome = prova.turma?.nome || 'Turma não especificada';
        const disciplina = prova.turma?.disciplina || 'Disciplina não especificada';
        const professorNome = prova.professor?.nome || prova.professor || 'Professor';
        const periodo = prova.periodo ? `${prova.periodo}º Período` : '1º Período';

        const isAdaptada = prova.tipoProva === 'adaptada' || prova.adaptada === true || prova.tipo === 'adaptada';
        const letrasUsadas = isAdaptada ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D', 'E'];

        // 🔥 LIMPA PREFIXOS DUPLICADOS: A), a), A., A -, (A), etc
        const limparPrefixoOpcao = (texto, letra) => {
            if (!texto) return 'Opção não disponível';
            let textoLimpo = String(texto).trim();
            const letraUpper = letra.toUpperCase();

            const padroes = [
                new RegExp(`^\\(${letraUpper}\\)\\s*`, 'i'),
                new RegExp(`^${letraUpper}\\)\\s*`, 'i'),
                new RegExp(`^${letraUpper}\\.\\s*`, 'i'),
                new RegExp(`^${letraUpper}\\s*-\\s*`, 'i'),
                new RegExp(`^${letraUpper}:\\s*`, 'i'),
                new RegExp(`^${letraUpper}\\s+`, 'i'),
            ];

            for (const padrao of padroes) {
                if (padrao.test(textoLimpo)) {
                    textoLimpo = textoLimpo.replace(padrao, '').trim();
                    break;
                }
            }
            return textoLimpo || 'Opção não disponível';
        };

        let adaptacoesTexto = '';
        const temAdaptacoes = opcoesAdaptacao.fonteAmpliada || opcoesAdaptacao.negrito ||
                            opcoesAdaptacao.altoContraste || opcoesAdaptacao.layoutSimplificado || opcoesAdaptacao.caixaAlta;

        if (temAdaptacoes) {
            const adaptacoesSelecionadas = [];
            if (opcoesAdaptacao.fonteAmpliada) adaptacoesSelecionadas.push('Fonte Ampliada');
            if (opcoesAdaptacao.negrito) adaptacoesSelecionadas.push('Texto em Negrito');
            if (opcoesAdaptacao.altoContraste) adaptacoesSelecionadas.push('Alto Contraste');
            if (opcoesAdaptacao.layoutSimplificado) adaptacoesSelecionadas.push('Layout Simplificado');
            if (opcoesAdaptacao.caixaAlta) adaptacoesSelecionadas.push('Caixa Alta');

            adaptacoesTexto = `
                <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 8px 12px; margin: 10px 0; border-radius: 8px;">
                    <p style="margin: 0; font-size: 0.85rem; color: #92400e;">
                        <i class="fas fa-universal-access"></i> <strong>Prova Adaptada</strong> - ${adaptacoesSelecionadas.join(', ')}.
                    </p>
                </div>
            `;
        }

        let questoesHTML = '';
        questoes.forEach((questao, index) => {
            const opcoes = questao.opcoes || [];
            const opcoesFormatadas = opcoes.map((opcao, optIndex) => {
                const letra = letrasUsadas[optIndex];
                const textoLimpo = limparPrefixoOpcao(opcao, letra);
                return { letra, texto: textoLimpo };
            });

            questoesHTML += `
                <div class="questao-print">
                    <div class="questao-numero">Questão ${index + 1} ${isAdaptada ? '(Prova Adaptada - 3 alternativas)' : ''}</div>
                    <div class="questao-texto"><strong>${questao.pergunta || 'Pergunta não disponível'}</strong></div>
                    <div class="opcoes-print">
                        ${opcoesFormatadas.map(op => `
                            <div class="opcao-linha">
                                <span class="opcao-letra">${op.letra})</span>
                                <span class="opcao-texto">${op.texto}</span>
                            </div>
                        `).join('')}
                    </div>
                    <div class="rascunho-area">
                        <small>Espaço para rascunho</small>
                        <div class="rascunho-linhas"></div>
                    </div>
                </div>
            `;
        });

        const gerarCartaoResposta = () => {
            const qrCodeArea = qrCodeDataUrl ? `
                <div style="text-align: center; margin-top: 10px; padding: 8px; background: #f9f9f9; border: 1px solid #ddd; border-radius: 8px; display: inline-block;">
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
                        <img src="${qrCodeDataUrl}" style="width: 85px; height: auto; border: 1px solid #ccc; border-radius: 8px;" alt="QR">
                        <div style="font-size: 9px; color: #666; text-align: center;">
                            <strong>📱 Correção Automática</strong><br>Escaneie este QR Code
                        </div>
                    </div>
                </div>
            ` : '';

            const qrCodeAlunoArea = qrCodeAlunoUrl ? `
                <div style="text-align: center; margin-top: 10px; padding: 8px; background: #f9f9f9; border: 1px solid #ddd; border-radius: 8px; display: inline-block;">
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
                        <img src="${qrCodeAlunoUrl}" style="width: 85px; height: auto; border: 1px solid #ccc; border-radius: 8px;" alt="QR Aluno">
                        <div style="font-size: 9px; color: #666; text-align: center;">
                            <strong>👤 Identificação</strong><br>${alunoNome || 'Aluno'}
                        </div>
                    </div>
                </div>
            ` : '';

            return `
                <div style="text-align: center;">
                    <div class="cartao-header" style="margin-bottom: 8px;">
                        <h4 style="margin: 0 0 5px 0; font-size: 11pt; font-weight: bold;">📝 CARTÃO-RESPOSTA</h4>
                        <div class="instrucoes-cartao" style="font-size: 8pt; color: #333; text-align: center; padding: 8px; background: #fef3c7; border-radius: 6px;">
                            <p style="margin: 0;"><strong>INSTRUÇÕES PARA PREENCHIMENTO</strong></p>
                            <p style="margin: 5px 0 0 0;">Use caneta esferográfica azul ou preta. Será anulada a questão com rasura ou mais de uma alternativa assinalada.</p>
                        </div>
                    </div>
                    <div class="cartao-resposta" style="position: relative; margin: 8px auto; border: 2px solid #000; padding: 15px 12px 12px 12px; background: #fff; display: inline-block; width: 85%; box-sizing: border-box; max-width: 650px;">
                        <div style="position: absolute; top: 5px; left: 5px; width: 25px; height: 25px; background: #000; z-index: 5;"></div>
                        <div style="position: absolute; top: 5px; right: 5px; width: 25px; height: 25px; background: #000; z-index: 5;"></div>
                        <div style="position: absolute; bottom: 5px; left: 5px; width: 25px; height: 25px; background: #000; z-index: 5;"></div>
                        <div style="position: absolute; bottom: 5px; right: 5px; width: 25px; height: 25px; background: #000; z-index: 5;"></div>
                        <table style="width: 100%; border-collapse: collapse; border: 1px solid #000;">
                            <thead><tr style="background: #e8e8e8;"><th style="border: 1px solid #000; padding: 6px 3px; text-align: center; font-weight: bold; font-size: 8pt; width: 35px;">Q</th>${letrasUsadas.map(letra => `<th style="border: 1px solid #000; padding: 6px 3px; text-align: center; font-weight: bold; font-size: 8pt; width: 35px;">${letra}</th>`).join('')}</tr></thead>
                            <tbody>${Array.from({ length: totalQuestoes }, (_, i) => `<tr><td style="border: 1px solid #000; padding: 5px 3px; text-align: center; font-weight: bold; font-size: 8pt;">${i + 1}</td>${letrasUsadas.map(() => `<td style="border: 1px solid #000; padding: 5px 3px; text-align: center;"><div style="width: 12px; height: 12px; border: 1.5px solid #000; border-radius: 50%; margin: 0 auto;"></div></td>`).join('')}</tr>`).join('')}</tbody>
                        </table>
                    </div>
                    <div style="display: flex; justify-content: center; align-items: center; gap: 40px; margin-top: 15px; flex-wrap: wrap;">${qrCodeArea}${qrCodeAlunoArea}</div>
                </div>
            `;
        };

        let cssAdaptacoes = '';

        if (opcoesAdaptacao.caixaAlta) {
            cssAdaptacoes += `
                body, .questao-texto, .opcao-linha, .instrucoes-cartao, .questao-numero,
                .cartao-header h4, .print-header h1, .print-prova-info h3, .label, .campo-label,
                .instrucoes-box h4, .info-label, .info-linha, .instrucoes-box li, .print-footer,
                .student-item, .campo-item, .cartao-resposta td, .cartao-resposta th,
                .rascunho-area small, .instrucoes-box ul, .instrucoes-box p,
                .student-item .label, .campo-item .campo-label, .info-linha .info-item,
                .print-prova-info .info-linha span, .questao-print, .opcoes-print,
                .opcao-linha .opcao-letra, .opcao-linha .opcao-texto, .print-header .student-row {
                    text-transform: uppercase !important;
                }
            `;
        }

        if (opcoesAdaptacao.fontePersonalizada && opcoesAdaptacao.tamanhoFonte) {
            const t = opcoesAdaptacao.tamanhoFonte;
            cssAdaptacoes += `
                body { font-size: ${t}pt !important; }
                .questao-texto { font-size: ${t}pt !important; }
                .opcao-linha { font-size: ${t - 2}pt !important; }
                .instrucoes-cartao { font-size: ${t - 5}pt !important; }
                .rascunho-area small { font-size: ${t - 5}pt !important; }
                .questao-numero { font-size: ${t - 2}pt !important; }
                .print-header h1 { font-size: ${t + 4}pt !important; }
                .print-prova-info h3 { font-size: ${t + 2}pt !important; }
                .campos-box .campo-label, .student-item .label { font-size: ${t - 2}pt !important; }
                .instrucoes-box li, .instrucoes-box h4, .info-linha, .info-item { font-size: ${t - 4}pt !important; }
                .cartao-resposta th, .cartao-resposta td { font-size: ${t - 4}pt !important; }
                .instrucoes-cartao p { font-size: ${t - 4}pt !important; }
                .print-footer { font-size: ${t - 4.5}pt !important; }
            `;
        } else if (opcoesAdaptacao.fonteAmpliada) {
            cssAdaptacoes += `
                body { font-size: 16pt !important; }
                .questao-texto { font-size: 16pt !important; }
                .opcao-linha { font-size: 14pt !important; }
                .instrucoes-cartao { font-size: 11pt !important; }
                .rascunho-area small { font-size: 10pt !important; }
                .questao-numero { font-size: 14pt !important; }
                .print-header h1 { font-size: 18pt !important; }
                .print-prova-info h3 { font-size: 16pt !important; }
                .campos-box .campo-label, .student-item .label { font-size: 12pt !important; }
                .instrucoes-box li, .instrucoes-box h4, .info-linha, .info-item { font-size: 11pt !important; }
            `;
        }

        if (opcoesAdaptacao.negrito) {
            cssAdaptacoes += `
                body, .questao-texto, .opcao-linha, .instrucoes-cartao, .questao-numero,
                .cartao-header h4, .print-header h1, .print-prova-info h3, .label, .campo-label,
                .instrucoes-box h4, .info-label, .info-linha, .instrucoes-box li, .print-footer {
                    font-weight: bold !important;
                }
            `;
        }

        if (opcoesAdaptacao.altoContraste) {
            cssAdaptacoes += `
                body { background: #000 !important; color: #fff !important; }
                .print-header, .campos-box, .instrucoes-box, .print-prova-info,
                .cartao-resposta, .questao-print, .rascunho-area, .info-linha {
                    background: #000 !important; color: #fff !important; border-color: #fff !important;
                }
                .underline, .campo-underline { border-bottom-color: #fff !important; }
                .rascunho-linhas { background: repeating-linear-gradient(transparent, transparent 16px, #fff 16px, #fff 18px) !important; }
            `;
        }

        if (opcoesAdaptacao.layoutSimplificado) {
            cssAdaptacoes += `
                .print-logo, .logo-iema { display: none !important; }
                .campos-box { border: 1px solid #000 !important; }
                .instrucoes-box { border: 1px solid #000 !important; background: #fefefe !important; }
                .print-header { border-bottom: 1px solid #000 !important; }
            `;
        }

        return `
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Prova - ${provaTitulo}</title>
                <style>
                    @media print {
                        body { margin: 0; padding: 0; }
                        .questao-print { page-break-inside: avoid; }
                        .cartao-resposta { page-break-inside: avoid; }
                        .questoes-container { page-break-before: always; margin-top: 0; }
                    }
                    body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.3; margin: 0; padding: 0.4in; background: white; color: black; }
                    .print-header { text-align: center; margin-bottom: 6px; padding-bottom: 6px; border-bottom: 2px solid #000; }
                    .print-logo { max-width: 999px; width: 100%; height: auto; display: block; margin: 0 auto 3px auto; }
                    .print-header h1 { font-size: 14pt; font-weight: bold; margin: 0 0 5px 0; }
                    .student-row { display: flex; justify-content: space-between; margin: 4px 0; gap: 15px; }
                    .student-item { flex: 1; display: flex; align-items: baseline; gap: 6px; }
                    .label { font-weight: bold; min-width: 65px; font-size: 10pt; }
                    .underline { border-bottom: 1px dotted #000; flex: 1; height: 16px; }
                    .campos-box { margin: 6px 0; border: 2px solid #000; padding: 5px 12px; display: flex; justify-content: space-between; gap: 20px; }
                    .campo-item { flex: 1; display: flex; align-items: baseline; gap: 6px; }
                    .campo-label { font-weight: bold; min-width: 35px; font-size: 10pt; }
                    .campo-underline { border-bottom: 1px dotted #000; flex: 1; height: 16px; }
                    .instrucoes-box { margin: 6px 0; border: 1px solid #ccc; padding: 8px 12px; background: #fefefe; border-radius: 4px; }
                    .instrucoes-box h4 { margin: 0 0 5px 0; font-size: 10pt; font-weight: bold; color: #4f46e5; text-align: center; }
                    .instrucoes-box ul { margin: 0; padding-left: 20px; }
                    .instrucoes-box li { margin-bottom: 3px; font-size: 8.5pt; line-height: 1.3; }
                    .print-prova-info { margin: 8px 0; padding: 5px 8px; border: 1px solid #ddd; background: #fafafa; }
                    .print-prova-info h3 { margin: 0 0 3px 0; font-size: 11pt; text-align: center; font-weight: bold; }
                    .info-linha { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; font-size: 8pt; border-top: 1px solid #eee; padding-top: 4px; margin-top: 4px; }
                    .questao-print { margin-bottom: 20px; }
                    .questao-numero { font-weight: bold; margin-bottom: 6px; border-bottom: 1px solid #ccc; padding-bottom: 3px; font-size: 10pt; }
                    .questao-texto { margin-bottom: 10px; margin-left: 8px; line-height: 1.4; font-size: 11pt; }
                    .opcao-linha { margin: 6px 0 6px 18px; display: flex; font-size: 10pt; }
                    .opcao-letra { min-width: 22px; font-weight: 500; }
                    .rascunho-area { margin-top: 8px; border-top: 1px dashed #ccc; padding-top: 5px; }
                    .rascunho-area small { font-size: 7pt; }
                    .rascunho-linhas { min-height: 35px; background: repeating-linear-gradient(transparent, transparent 16px, #eee 16px, #eee 18px); }
                    .print-footer { margin-top: 25px; text-align: center; font-size: 7.5pt; color: #666; border-top: 1px solid #ccc; padding-top: 8px; }
                    ${cssAdaptacoes}
                </style>
            </head>
            <body>
                <div class="print-header">
                    <img src="${logoIema}" class="print-logo" alt="IEMA" onerror="this.style.display='none'">
                    <h1>IEMA PLENO: SÃO LUÍS - CENTRO</h1>
                    <div class="student-row">
                        <div class="student-item"><span class="label">ESTUDANTE:</span><span class="underline"></span></div>
                    </div>
                    <div class="student-row">
                        <div class="student-item"><span class="label">CURSO:</span><span class="underline"></span></div>
                        <div class="student-item"><span class="label">TURMA:</span><span class="underline"></span></div>
                    </div>
                </div>
                <div class="campos-box">
                    <div class="campo-item"><span class="campo-label">Nota:</span><span class="campo-underline"></span></div>
                    <div class="campo-item"><span class="campo-label">Ass.:</span><span class="campo-underline"></span></div>
                    <div class="campo-item"><span class="campo-label">Data:</span><span class="campo-underline"></span></div>
                </div>
                <div class="instrucoes-box">
                    <h4>📋 INSTRUÇÕES GERAIS</h4>
                    <ul>
                        <li>Escreva seu nome de registro legível e não esqueça de assinar a lista de frequência.</li>
                        <li>Todas as anotações e cálculos devem ser feitos no caderno de prova.</li>
                        <li>Os celulares <strong>deverão ser desligados</strong> durante todo o período de realização da prova.</li>
                        <li>Cada questão contém apenas uma alternativa correta.</li>
                        <li>Leia e siga as instruções de preenchimento do cartão-resposta (GABARITO) abaixo.</li>
                    </ul>
                </div>
                ${adaptacoesTexto}
                <div class="print-prova-info">
                    <h3>${provaTitulo}</h3>
                    <div class="info-linha">
                        <span class="info-item">Período: ${periodo}</span>
                        <span class="info-item">Turma: ${turmaNome}</span>
                        <span class="info-item">Disciplina: ${disciplina}</span>
                        <span class="info-item">Professor: ${professorNome}</span>
                        <span class="info-item">Questões: ${totalQuestoes}</span>
                    </div>
                </div>
                ${gerarCartaoResposta()}
                <div class="questoes-container">${questoesHTML}</div>
                <div class="print-footer">
                    <p>EducaPleno - ${dataFormatada}</p>
                    <p>📱 Escaneie o QR Code para correção automática</p>
                    <p style="font-size: 6pt;">Aluno: ${alunoNome || '_________________'} | Turma: ${turmaNome} | Código: ${prova.codigo || 'N/A'}</p>
                </div>
                <div style="page-break-after: always;"></div>
            </body>
            </html>
        `;
    },

    // ============================================================================
    // FECHAR MODAIS DE IMPRESSÃO
    // ============================================================================
    _fecharModaisImpressaoAEE() {
        ['aeeModalPerguntaAdaptacao', 'aeeModalOpcoesAdaptacao'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.remove();
        });
    },

    _fecharModalOpcoesAdaptacaoAEE() {
        const modal = document.getElementById('aeeModalOpcoesAdaptacao');
        if (modal) modal.remove();
        const modalPergunta = document.getElementById('aeeModalPerguntaAdaptacao');
        if (modalPergunta) modalPergunta.style.display = 'flex';
    },

    _gerarHTMLProvaFallback(prova, questoes) {
        let questoesHtml = '';
        questoes.forEach((q, idx) => {
            questoesHtml += `
                <div style="margin-bottom: 22px;">
                    <div style="font-weight: bold; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-bottom: 8px;">
                        Questão ${idx + 1}
                    </div>
                    <div style="margin-bottom: 10px;">${q.pergunta}</div>
                    <div style="margin-left: 15px;">
                        ${(q.opcoes || []).map((op, i) => `
                            <div style="display: flex; margin: 6px 0;">
                                <span style="font-weight: 600; min-width: 24px;">${String.fromCharCode(65 + i)})</span>
                                <span>${op}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        });

        const html = `<!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>${this.escapeHtml(prova.titulo)}</title>
                <style>
                    @page { size: A4; margin: 15mm; }
                    body { font-family: 'Times New Roman', serif; font-size: 11pt; line-height: 1.4; }
                    .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
                    .btn-print { display: block; margin: 15px auto; padding: 10px 24px; background: #667eea; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; }
                    @media print { .btn-print { display: none; } }
                </style>
            </head>
            <body>
                <button class="btn-print" onclick="window.print()">🖨️ Imprimir</button>
                <div class="header">
                    <h1>IEMA PLENO: SÃO LUÍS - CENTRO</h1>
                    <h2>${this.escapeHtml(prova.titulo)}</h2>
                </div>
                ${questoesHtml}
            </body>
            </html>`;

        const win = window.open('', '_blank');
        win.document.write(html);
        win.document.close();
        win.onload = () => setTimeout(() => win.print(), 500);
    },

    // ============================================
    // PAGINAÇÃO GENÉRICA
    // ============================================
    renderizarPaginacao(tipo) {
        const p = this.paginacao[tipo];
        if (!p || p.totalPaginas <= 1) {
            return `<p class="text-muted text-end mt-3"><small>${p.total} registro(s)</small></p>`;
        }

        const { paginaAtual, totalPaginas, total } = p;
        const maxBotoes = 5;
        let inicio = Math.max(1, paginaAtual - Math.floor(maxBotoes / 2));
        let fim = Math.min(totalPaginas, inicio + maxBotoes - 1);

        if (fim - inicio + 1 < maxBotoes) {
            inicio = Math.max(1, fim - maxBotoes + 1);
        }

        let botoes = '';

        if (paginaAtual > 1) {
            botoes += `<button class="aee-page-btn" onclick="AeeModule.irParaPagina('${tipo}', 1)"><i class="fas fa-angle-double-left"></i></button>`;
            botoes += `<button class="aee-page-btn" onclick="AeeModule.irParaPagina('${tipo}', ${paginaAtual - 1})"><i class="fas fa-angle-left"></i></button>`;
        } else {
            botoes += `<button class="aee-page-btn" disabled><i class="fas fa-angle-double-left"></i></button>`;
            botoes += `<button class="aee-page-btn" disabled><i class="fas fa-angle-left"></i></button>`;
        }

        if (inicio > 1) botoes += `<span class="aee-page-ellipsis">…</span>`;

        for (let i = inicio; i <= fim; i++) {
            botoes += `<button class="aee-page-btn ${i === paginaAtual ? 'active' : ''}" onclick="AeeModule.irParaPagina('${tipo}', ${i})">${i}</button>`;
        }

        if (fim < totalPaginas) botoes += `<span class="aee-page-ellipsis">…</span>`;

        if (paginaAtual < totalPaginas) {
            botoes += `<button class="aee-page-btn" onclick="AeeModule.irParaPagina('${tipo}', ${paginaAtual + 1})"><i class="fas fa-angle-right"></i></button>`;
            botoes += `<button class="aee-page-btn" onclick="AeeModule.irParaPagina('${tipo}', ${totalPaginas})"><i class="fas fa-angle-double-right"></i></button>`;
        } else {
            botoes += `<button class="aee-page-btn" disabled><i class="fas fa-angle-right"></i></button>`;
            botoes += `<button class="aee-page-btn" disabled><i class="fas fa-angle-double-right"></i></button>`;
        }

        const de = (paginaAtual - 1) * p.porPagina + 1;
        const ate = Math.min(paginaAtual * p.porPagina, total);

        return `
            <div class="aee-paginacao">
                <small class="text-muted">
                    Mostrando <strong>${de}</strong>–<strong>${ate}</strong> de <strong>${total}</strong>
                </small>
                <div class="aee-paginacao-botoes">${botoes}</div>
            </div>
        `;
    },

    irParaPagina(tipo, pagina) {
        const metodos = {
            alunos: () => this.carregarAlunos(pagina),
            notas: () => this.carregarNotas(pagina),
            provas: () => this.carregarProvas(pagina)
        };
        if (metodos[tipo]) metodos[tipo]();
    },

    // ============================================================================
    // RELATÓRIOS — mesmo padrão do Setor Pedagógico
    // ============================================================================
    renderizarRelatorios() {
        const pane = this.safeGet('aeePaneRelatorios');
        if (!pane) return;

        pane.innerHTML = `
            <div class="aee-card">
                <div class="aee-card-header">
                    <h3><i class="fas fa-file-alt"></i> Gerar Relatório</h3>
                </div>
                <div class="aee-card-body">
                    <div class="aee-relatorio-filtros" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 15px; align-items: end;">
                        <div class="aee-filtro-item">
                            <label style="font-weight: 600; font-size: 13px; color: #374151;">Tipo de Relatório</label>
                            <select id="aeeTipoRelatorio" class="form-select">
                                <option value="geral">Geral (todos os alunos AEE)</option>
                                <option value="turma">Por Turma</option>
                                <option value="aluno">Por Aluno</option>
                            </select>
                        </div>

                        <div class="aee-filtro-item" id="aeeRelatorioTurmaDiv" style="display: none;">
                            <label style="font-weight: 600; font-size: 13px; color: #374151;">Turma</label>
                            <select id="aeeRelatorioTurma" class="form-select">
                                ${this.gerarOpcoesSelect(this.filtrosDisponiveis.turmas, '', 'Selecione...')}
                            </select>
                        </div>

                        <div class="aee-filtro-item" id="aeeRelatorioAlunoDiv" style="display: none;">
                            <label style="font-weight: 600; font-size: 13px; color: #374151;">Aluno</label>
                            <select id="aeeRelatorioAluno" class="form-select">
                                <option value="">Selecione...</option>
                            </select>
                        </div>

                        <div class="aee-filtro-item">
                            <label style="font-weight: 600; font-size: 13px; color: #374151;">Condição</label>
                            <select id="aeeRelatorioCondicao" class="form-select">
                                ${this.gerarOpcoesSelect(this.filtrosDisponiveis.condicoes, '', 'Todas')}
                            </select>
                        </div>

                        <div class="aee-filtro-item">
                            <label style="font-weight: 600; font-size: 13px; color: #374151;">Status</label>
                            <select id="aeeRelatorioStatus" class="form-select">
                                <option value="">Todos</option>
                                <option value="aprovada">Aprovada</option>
                                <option value="pendente">Pendente</option>
                            </select>
                        </div>

                        <div class="aee-filtro-item">
                            <label style="font-weight: 600; font-size: 13px; color: #374151;">Curso</label>
                            <select id="aeeRelatorioCurso" class="form-select">
                                ${this.gerarOpcoesSelect(this.filtrosDisponiveis.cursos, '', 'Todos')}
                            </select>
                        </div>

                        <div class="aee-filtro-item">
                            <label style="font-weight: 600; font-size: 13px; color: #374151;">Período</label>
                            <select id="aeeRelatorioPeriodo" class="form-select">
                                ${this.gerarOpcoesSelect(['1', '2', '3', '4'], '', 'Todos')}
                            </select>
                        </div>
                    </div>

                    <div class="aee-relatorio-botoes" style="margin-top: 20px; display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap;">
                        <button class="aee-btn aee-btn-primary" onclick="AeeModule.gerarRelatorio()">
                            <i class="fas fa-search"></i> Gerar
                        </button>
                        <button class="aee-btn aee-btn-success" onclick="AeeModule.exportarCSV()" id="aeeBtnExportarCSV" disabled>
                            <i class="fas fa-file-csv"></i> Exportar CSV
                        </button>
                        <button class="aee-btn aee-btn-danger" onclick="AeeModule.imprimirRelatorio()" id="aeeBtnImprimir" disabled>
                            <i class="fas fa-print"></i> Imprimir / PDF
                        </button>
                    </div>
                </div>
            </div>

            <div id="aeeResultadoRelatorio" class="aee-relatorio-resultado" style="margin-top: 20px;">
                <div class="aee-empty-state">
                    <i class="fas fa-chart-bar"></i>
                    <h3>Selecione os filtros e clique em Gerar</h3>
                    <p>O relatório será exibido aqui.</p>
                </div>
            </div>
        `;

        setTimeout(async () => {
            await this.popularSelectsRelatorio();
            this.aplicarEventosRelatorio();
        }, 50);
    },

    async popularSelectsRelatorio() {
        try {
            const response = await fetch('/api/aee/alunos?limit=1000', {
                headers: { 'Authorization': `Bearer ${this.getToken()}` }
            });
            const data = await response.json();

            if (data.success) {
                const selectAluno = this.safeGet('aeeRelatorioAluno');
                if (selectAluno) {
                    selectAluno.innerHTML = '<option value="">Selecione...</option>' +
                        data.alunos.map(a => `
                            <option value="${a.id}">${this.escapeHtml(a.nome)} — ${this.escapeHtml(a.turma || 'Sem turma')}</option>
                        `).join('');
                }

                if (data.filtros) {
                    this.filtrosDisponiveis.turmas = data.filtros.turmas || this.filtrosDisponiveis.turmas;
                    this.filtrosDisponiveis.cursos = data.filtros.cursos || this.filtrosDisponiveis.cursos;
                    this.filtrosDisponiveis.condicoes = data.filtros.condicoes || this.filtrosDisponiveis.condicoes;
                }
            }
        } catch (error) {
            console.warn('Erro ao popular selects:', error);
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

                const btnCSV = this.safeGet('aeeBtnExportarCSV');
                const btnPDF = this.safeGet('aeeBtnImprimir');
                if (btnCSV) btnCSV.disabled = true;
                if (btnPDF) btnPDF.disabled = true;
                this.relatorioAtual = null;
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
            const curso = this.safeGet('aeeRelatorioCurso')?.value || '';
            const periodo = this.safeGet('aeeRelatorioPeriodo')?.value || '';

            let url = '/api/aee/relatorio';
            const params = new URLSearchParams();

            if (tipo === 'turma' && turma) {
                url = `/api/aee/relatorio/turma/${encodeURIComponent(turma)}`;
            } else if (tipo === 'aluno' && alunoId) {
                url = `/api/aee/relatorio/aluno/${alunoId}`;
            } else {
                if (condicao && condicao !== 'todos') params.append('condicao', condicao);
                if (status) params.append('status', status);
                if (curso && curso !== 'todos') params.append('curso', curso);
                if (periodo && periodo !== 'todos') params.append('periodo', periodo);
                if (params.toString()) url += '?' + params.toString();
            }

            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${this.getToken()}` }
            });
            const data = await response.json();

            if (!data.success) throw new Error(data.error);

            this.relatorioAtual = data;
            this.relatorioTipo = tipo;

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

        // ---------- RELATÓRIO POR ALUNO ----------
        if (tipo === 'aluno' && data.aluno) {
            const a = data.aluno;

            container.innerHTML = `
                <div class="aee-card">
                    <div class="aee-card-header">
                        <h3><i class="fas fa-user"></i> ${this.escapeHtml(a.nome)}</h3>
                        <span class="aee-count-badge">${this.escapeHtml(a.turma || 'Sem turma')}</span>
                    </div>
                    <div class="aee-card-body">
                        <div class="aee-info-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                            <div class="aee-info-item">
                                <span class="aee-info-label" style="display: block; font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: 600;">Matrícula</span>
                                <span class="aee-info-value" style="font-size: 15px; font-weight: 600; color: #1e293b;">${this.escapeHtml(a.matricula || '-')}</span>
                            </div>
                            <div class="aee-info-item">
                                <span class="aee-info-label" style="display: block; font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: 600;">Email</span>
                                <span class="aee-info-value" style="font-size: 15px; color: #1e293b;">${this.escapeHtml(a.email || '-')}</span>
                            </div>
                            <div class="aee-info-item">
                                <span class="aee-info-label" style="display: block; font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: 600;">Condição</span>
                                <span class="aee-info-value" style="font-size: 15px; font-weight: 600; color: ${this.getCorCondicao(a.condicao.tipo)};">
                                    <i class="fas ${this.getIconeCondicao(a.condicao.tipo)}"></i> ${this.escapeHtml(a.condicao.label)}
                                </span>
                            </div>
                            <div class="aee-info-item">
                                <span class="aee-info-label" style="display: block; font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: 600;">Status</span>
                                <span class="aee-info-value aee-status-${a.status}" style="font-size: 15px; font-weight: 600;">
                                    ${a.status === 'aprovada' ? '✓ Aprovada' : '⏳ Pendente'}
                                </span>
                            </div>
                        </div>

                        ${data.provasRealizadas && data.provasRealizadas.length > 0 ? `
                            <h4 style="margin-top: 30px; display: flex; align-items: center; gap: 8px;">
                                <i class="fas fa-file-alt" style="color: #6366f1;"></i>
                                Provas Realizadas (${data.provasRealizadas.length})
                            </h4>
                            <div class="aee-table-responsive" style="margin-top: 10px; overflow-x: auto;">
                                <table class="aee-table" style="width: 100%; border-collapse: collapse;">
                                    <thead>
                                        <tr style="background: #6366f1; color: white;">
                                            <th style="padding: 10px; text-align: left; font-size: 12px;">Prova</th>
                                            <th style="padding: 10px; text-align: left; font-size: 12px;">Tipo</th>
                                            <th style="padding: 10px; text-align: center; font-size: 12px;">Nota</th>
                                            <th style="padding: 10px; text-align: center; font-size: 12px;">Data</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${data.provasRealizadas.map(p => `
                                            <tr style="border-bottom: 1px solid #e5e7eb;">
                                                <td style="padding: 10px;">${this.escapeHtml(p.provaTitulo || '-')}</td>
                                                <td style="padding: 10px;">${p.adaptada ? '🎯 Adaptada' : '📝 Normal'}</td>
                                                <td style="padding: 10px; text-align: center; font-weight: 700; color: ${p.nota >= 7 ? '#10b981' : p.nota !== null ? '#ef4444' : '#6b7280'};">
                                                    ${p.nota !== null ? Number(p.nota).toFixed(1) : '—'}
                                                </td>
                                                <td style="padding: 10px; text-align: center;">${this.formatarData(p.data)}</td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        ` : `
                            <p style="text-align: center; color: #94a3b8; margin-top: 20px;">
                                <i class="fas fa-info-circle"></i> Nenhuma prova realizada ainda.
                            </p>
                        `}
                    </div>
                </div>
            `;
            return;
        }

        // ---------- RELATÓRIO POR TURMA ----------
        if (tipo === 'turma' && data.alunos) {
            container.innerHTML = `
                <div class="aee-card">
                    <div class="aee-card-header">
                        <h3><i class="fas fa-school"></i> Turma: ${this.escapeHtml(data.turma)}</h3>
                        <span class="aee-count-badge">${data.total} aluno(s)</span>
                    </div>
                    <div class="aee-card-body">
                        <div class="aee-table-responsive" style="overflow-x: auto;">
                            <table class="aee-table" style="width: 100%; border-collapse: collapse;">
                                <thead>
                                    <tr style="background: #6366f1; color: white;">
                                        <th style="padding: 10px; text-align: left; font-size: 12px;">Nome</th>
                                        <th style="padding: 10px; text-align: left; font-size: 12px;">Matrícula</th>
                                        <th style="padding: 10px; text-align: left; font-size: 12px;">Condição</th>
                                        <th style="padding: 10px; text-align: center; font-size: 12px;">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${data.alunos.map(a => `
                                        <tr style="border-bottom: 1px solid #e5e7eb;">
                                            <td style="padding: 10px;"><strong>${this.escapeHtml(a.nome)}</strong></td>
                                            <td style="padding: 10px;">${this.escapeHtml(a.matricula || '-')}</td>
                                            <td style="padding: 10px;">
                                                <span style="background: ${this.getCorCondicao(a.condicaoTipo)}20; color: ${this.getCorCondicao(a.condicaoTipo)}; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 600;">
                                                    <i class="fas ${this.getIconeCondicao(a.condicaoTipo)}"></i> ${this.escapeHtml(a.condicao)}
                                                </span>
                                            </td>
                                            <td style="padding: 10px; text-align: center;">
                                                <span style="background: ${a.status === 'aprovada' ? '#d1fae5' : '#fef3c7'}; color: ${a.status === 'aprovada' ? '#065f46' : '#92400e'}; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;">
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

        // ---------- RELATÓRIO GERAL ----------
        const rel = data.relatorio;
        if (!rel) {
            container.innerHTML = '<div class="aee-empty-state">Nenhum dado disponível</div>';
            return;
        }

        container.innerHTML = `
            <div class="aee-relatorio-geral">
                <div class="aee-relatorio-stats" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 20px;">
                    <div class="aee-stat-mini" style="background: white; border-radius: 12px; padding: 20px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                        <div class="aee-stat-mini-value" style="font-size: 32px; font-weight: 700; color: #6366f1;">${rel.totalAlunos}</div>
                        <div class="aee-stat-mini-label" style="font-size: 13px; color: #64748b; margin-top: 5px;">Total de Alunos</div>
                    </div>
                    <div class="aee-stat-mini" style="background: white; border-radius: 12px; padding: 20px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.05); border-left: 4px solid #10b981;">
                        <div class="aee-stat-mini-value" style="font-size: 32px; font-weight: 700; color: #10b981;">${rel.totalAprovados}</div>
                        <div class="aee-stat-mini-label" style="font-size: 13px; color: #64748b; margin-top: 5px;">Aprovados</div>
                    </div>
                    <div class="aee-stat-mini" style="background: white; border-radius: 12px; padding: 20px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.05); border-left: 4px solid #f59e0b;">
                        <div class="aee-stat-mini-value" style="font-size: 32px; font-weight: 700; color: #f59e0b;">${rel.totalPendentes}</div>
                        <div class="aee-stat-mini-label" style="font-size: 13px; color: #64748b; margin-top: 5px;">Pendentes</div>
                    </div>
                </div>

                <div class="aee-card">
                    <div class="aee-card-header">
                        <h3><i class="fas fa-heart"></i> Distribuição por Condição</h3>
                    </div>
                    <div class="aee-card-body">
                        ${rel.porCondicao.map(c => `
                            <div class="aee-condicao-item" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #f1f5f9;">
                                <span style="font-size: 14px; color: #374151;">${this.escapeHtml(c.condicao)}</span>
                                <span class="aee-count-badge" style="background: #e0e7ff; color: #4338ca; padding: 4px 14px; border-radius: 20px; font-weight: 700; font-size: 13px;">${c.total}</span>
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
                            <div class="aee-table-responsive" style="overflow-x: auto;">
                                <table class="aee-table" style="width: 100%; border-collapse: collapse;">
                                    <thead>
                                        <tr style="background: #6366f1; color: white;">
                                            <th style="padding: 10px; text-align: left; font-size: 12px;">Nome</th>
                                            <th style="padding: 10px; text-align: left; font-size: 12px;">Matrícula</th>
                                            <th style="padding: 10px; text-align: left; font-size: 12px;">Condição</th>
                                            <th style="padding: 10px; text-align: center; font-size: 12px;">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${t.alunos.map(a => `
                                            <tr style="border-bottom: 1px solid #e5e7eb;">
                                                <td style="padding: 10px;">${this.escapeHtml(a.nome)}</td>
                                                <td style="padding: 10px;">${this.escapeHtml(a.matricula || '-')}</td>
                                                <td style="padding: 10px;">${this.escapeHtml(a.condicao)}</td>
                                                <td style="padding: 10px; text-align: center;">
                                                    <span style="background: ${a.status === 'aprovada' ? '#d1fae5' : '#fef3c7'}; color: ${a.status === 'aprovada' ? '#065f46' : '#92400e'}; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;">
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
            this.mostrarToast('⚠️ Gere um relatório primeiro', 'warning');
            return;
        }

        const data = this.relatorioAtual;
        const tipo = this.relatorioTipo;

        // ============================================
        // TÍTULO / SUBTÍTULO
        // ============================================
        let titulo = 'Relatório AEE';
        let subtitulo = '';

        if (tipo === 'aluno' && data.aluno) {
            titulo = 'Relatório Individual AEE';
            subtitulo = `${data.aluno.nome} — ${data.aluno.turma || 'Sem turma'}`;
        } else if (tipo === 'turma' && data.alunos) {
            titulo = 'Relatório AEE por Turma';
            subtitulo = `Turma: ${data.turma} — ${data.alunos.length} aluno(s)`;
        } else if (tipo === 'geral' && data.relatorio) {
            titulo = 'Relatório Geral AEE';
            subtitulo = `${data.relatorio.totalAlunos} aluno(s) AEE`;
        }

        // ============================================
        // FILTROS APLICADOS
        // ============================================
        const filtros = [];
        const condicao = this.safeGet('aeeRelatorioCondicao')?.value;
        const status = this.safeGet('aeeRelatorioStatus')?.value;
        const curso = this.safeGet('aeeRelatorioCurso')?.value;
        const periodo = this.safeGet('aeeRelatorioPeriodo')?.value;

        if (condicao && condicao !== 'todos') filtros.push({ label: 'Condição', valor: condicao });
        if (status) filtros.push({ label: 'Status', valor: status === 'aprovada' ? 'Aprovada' : 'Pendente' });
        if (curso && curso !== 'todos') filtros.push({ label: 'Curso', valor: curso });
        if (periodo && periodo !== 'todos') filtros.push({ label: 'Período', valor: `${periodo}º` });

        // ============================================
        // TIPO: ALUNO
        // ============================================
        if (tipo === 'aluno' && data.aluno) {
            const a = data.aluno;

            const colunas = [
                { label: 'Nome', format: () => a.nome || '' },
                { label: 'Matrícula', format: () => a.matricula || '' },
                { label: 'Email', format: () => a.email || '' },
                { label: 'Turma', format: () => a.turma || '' },
                { label: 'Curso', format: () => a.curso || '' },
                { label: 'Condição', format: () => a.condicao?.label || '' },
                { label: 'Detalhes', format: () => a.condicao?.detalhes || '' },
                {
                    label: 'Status AEE',
                    format: () => a.status === 'aprovada' ? 'Aprovada' : 'Pendente'
                },
                {
                    label: 'Data da Solicitação',
                    format: () => this.formatarData(a.dataSolicitacao)
                }
            ];

            const ok = this.gerarBaixarCSV({
                titulo,
                subtitulo,
                setor: 'Setor Pedagógico — AEE',
                colunas,
                registros: [a],
                filtros,
                metricas: {
                    'Total de provas realizadas': (data.provasRealizadas || []).length
                },
                nomeArquivo: `aee-aluno-${(a.nome || 'sem-nome').replace(/\s+/g, '-').toLowerCase()}`,
                observacoes: 'Relatório individual do aluno'
            });

            if (ok) this.mostrarToast('✅ CSV exportado!', 'success');
            return;
        }

        // ============================================
        // TIPO: TURMA
        // ============================================
        if (tipo === 'turma' && data.alunos) {
            const colunas = [
                { label: 'Turma', format: () => data.turma || '' },
                { label: 'Aluno', format: (a) => a.nome || '' },
                { label: 'Matrícula', format: (a) => a.matricula || '' },
                { label: 'Curso', format: (a) => a.curso || '' },
                { label: 'Condição', format: (a) => a.condicao || '' },
                {
                    label: 'Status AEE',
                    format: (a) => a.status === 'aprovada' ? 'Aprovada' : 'Pendente'
                }
            ];

            const ok = this.gerarBaixarCSV({
                titulo,
                subtitulo,
                setor: 'Setor Pedagógico — AEE',
                colunas,
                registros: data.alunos,
                filtros,
                metricas: {
                    'Total de alunos': data.alunos.length,
                    'Aprovados': data.alunos.filter(a => a.status === 'aprovada').length,
                    'Pendentes': data.alunos.filter(a => a.status !== 'aprovada').length
                },
                nomeArquivo: `aee-turma-${(data.turma || 'sem-turma').replace(/\s+/g, '-').toLowerCase()}`,
                observacoes: `${data.alunos.length} aluno(s) da turma ${data.turma}`
            });

            if (ok) this.mostrarToast(`✅ CSV exportado (${data.alunos.length} aluno(s))!`, 'success');
            return;
        }

        // ============================================
        // TIPO: GERAL
        // ============================================
        if (tipo === 'geral' && data.relatorio) {
            const rel = data.relatorio;

            // Achata os alunos por turma em linhas
            const linhas = [];
            rel.porTurma.forEach(t => {
                t.alunos.forEach(a => {
                    linhas.push({
                        turma: t.turma,
                        nome: a.nome,
                        matricula: a.matricula,
                        curso: a.curso,
                        condicao: a.condicao,
                        detalhes: a.detalhes,
                        status: a.status
                    });
                });
            });

            const colunas = [
                { label: 'Turma', format: (l) => l.turma || '' },
                { label: 'Aluno', format: (l) => l.nome || '' },
                { label: 'Matrícula', format: (l) => l.matricula || '' },
                { label: 'Curso', format: (l) => l.curso || '' },
                { label: 'Condição', format: (l) => l.condicao || '' },
                { label: 'Detalhes', format: (l) => l.detalhes || '' },
                {
                    label: 'Status AEE',
                    format: (l) => l.status === 'aprovada' ? 'Aprovada' : 'Pendente'
                }
            ];

            // Distribuição por condição (métricas extra)
            const metricas = {
                'Total de alunos': rel.totalAlunos,
                'Aprovados': rel.totalAprovados,
                'Pendentes': rel.totalPendentes,
                'Turmas envolvidas': rel.porTurma.length
            };
            (rel.porCondicao || []).forEach(c => {
                metricas[`Condição — ${c.condicao}`] = c.total;
            });

            const ok = this.gerarBaixarCSV({
                titulo,
                subtitulo,
                setor: 'Setor Pedagógico — AEE',
                colunas,
                registros: linhas,
                filtros,
                metricas,
                nomeArquivo: 'aee-relatorio-geral',
                observacoes: `${linhas.length} aluno(s) listado(s)`
            });

            if (ok) this.mostrarToast(`✅ CSV exportado (${linhas.length} aluno(s))!`, 'success');
            return;
        }

        this.mostrarToast('⚠️ Nenhum dado disponível para exportar', 'warning');
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

        const data = this.relatorioAtual;
        const tipo = this.relatorioTipo;
        const logoIema = '/uploads/logo-iema.png';
        const carimbo = '/icons/assinatura_gpeda.ico';
        const dataGeracao = new Date().toLocaleString('pt-BR');

        let titulo = 'RELATÓRIO AEE';
        let subtitulo = 'Atendimento Educacional Especializado';

        if (tipo === 'turma' && data.turma) {
            subtitulo = `Turma: ${data.turma} — ${data.total} aluno(s)`;
        } else if (tipo === 'aluno' && data.aluno) {
            subtitulo = `${data.aluno.nome} — ${data.aluno.turma || 'Sem turma'}`;
        } else if (tipo === 'geral' && data.relatorio) {
            subtitulo = `Relatório Geral — ${data.relatorio.totalAlunos} aluno(s) AEE`;
        }

        let corpoHTML = '';

        // ---------- POR ALUNO ----------
        if (tipo === 'aluno' && data.aluno) {
            const a = data.aluno;

            corpoHTML = `
                <div class="section-title">DADOS DO ALUNO</div>
                <table class="info-table">
                    <tr>
                        <td><strong>Nome:</strong></td>
                        <td>${this.escapeHtml(a.nome)}</td>
                        <td><strong>Matrícula:</strong></td>
                        <td>${this.escapeHtml(a.matricula || '-')}</td>
                    </tr>
                    <tr>
                        <td><strong>Turma:</strong></td>
                        <td>${this.escapeHtml(a.turma || '-')}</td>
                        <td><strong>Curso:</strong></td>
                        <td>${this.escapeHtml(a.curso || '-')}</td>
                    </tr>
                    <tr>
                        <td><strong>Email:</strong></td>
                        <td colspan="3">${this.escapeHtml(a.email || '-')}</td>
                    </tr>
                    <tr>
                        <td><strong>Condição:</strong></td>
                        <td colspan="3">${this.escapeHtml(a.condicao?.label || '-')}</td>
                    </tr>
                    <tr>
                        <td><strong>Status AEE:</strong></td>
                        <td colspan="3">
                            ${a.status === 'aprovada' ? '✅ Aprovada' : '⏳ Pendente'}
                        </td>
                    </tr>
                </table>

                ${data.provasRealizadas && data.provasRealizadas.length > 0 ? `
                    <div class="section-title" style="margin-top: 20px;">PROVAS REALIZADAS</div>
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Prova</th>
                                <th style="width: 100px; text-align: center;">Tipo</th>
                                <th style="width: 70px; text-align: center;">Nota</th>
                                <th style="width: 100px; text-align: center;">Data</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.provasRealizadas.map(p => `
                                <tr>
                                    <td>${this.escapeHtml(p.provaTitulo || '-')}</td>
                                    <td style="text-align: center;">${p.adaptada ? 'Adaptada' : 'Normal'}</td>
                                    <td style="text-align: center; font-weight: bold;">
                                        ${p.nota !== null && p.nota !== undefined ? Number(p.nota).toFixed(1) : '—'}
                                    </td>
                                    <td style="text-align: center;">${this.formatarData(p.data)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                ` : '<p style="text-align: center; color: #666; margin-top: 15px;">Nenhuma prova realizada.</p>'}
            `;
        }

        // ---------- POR TURMA ----------
        if (tipo === 'turma' && data.alunos) {
            corpoHTML = `
                <div class="section-title">ALUNOS AEE DA TURMA</div>
                <table class="data-table">
                    <thead>
                        <tr>
                            <th style="width: 40px;">#</th>
                            <th>Nome</th>
                            <th style="width: 100px;">Matrícula</th>
                            <th>Condição</th>
                            <th style="width: 90px; text-align: center;">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.alunos.map((a, i) => `
                            <tr>
                                <td style="text-align: center;">${i + 1}</td>
                                <td>${this.escapeHtml(a.nome)}</td>
                                <td>${this.escapeHtml(a.matricula || '-')}</td>
                                <td>${this.escapeHtml(a.condicao)}</td>
                                <td style="text-align: center;">
                                    ${a.status === 'aprovada' ? '✅ Aprovada' : '⏳ Pendente'}
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        }

        // ---------- GERAL ----------
        if (tipo === 'geral' && data.relatorio) {
            const rel = data.relatorio;

            corpoHTML = `
                <div class="stats-table">
                    <table>
                        <tr>
                            <td><strong>${rel.totalAlunos}</strong><br><span>Total</span></td>
                            <td><strong>${rel.totalAprovados}</strong><br><span>Aprovados</span></td>
                            <td><strong>${rel.totalPendentes}</strong><br><span>Pendentes</span></td>
                            <td><strong>${rel.porTurma.length}</strong><br><span>Turmas</span></td>
                        </tr>
                    </table>
                </div>

                <div class="section-title">DISTRIBUIÇÃO POR CONDIÇÃO</div>
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Condição</th>
                            <th style="width: 100px; text-align: center;">Qtd</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rel.porCondicao.map(c => `
                            <tr>
                                <td>${this.escapeHtml(c.condicao)}</td>
                                <td style="text-align: center; font-weight: bold;">${c.total}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>

                ${rel.porTurma.map(t => `
                    <div class="section-title" style="margin-top: 20px;">TURMA: ${this.escapeHtml(t.turma)} (${t.total})</div>
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th style="width: 40px;">#</th>
                                <th>Nome</th>
                                <th style="width: 100px;">Matrícula</th>
                                <th>Condição</th>
                                <th style="width: 90px; text-align: center;">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${t.alunos.map((a, i) => `
                                <tr>
                                    <td style="text-align: center;">${i + 1}</td>
                                    <td>${this.escapeHtml(a.nome)}</td>
                                    <td>${this.escapeHtml(a.matricula || '-')}</td>
                                    <td>${this.escapeHtml(a.condicao)}</td>
                                    <td style="text-align: center;">
                                        ${a.status === 'aprovada' ? '✅ Aprovada' : '⏳ Pendente'}
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                `).join('')}
            `;
        }

        const html = `<!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <title>${titulo}</title>
            <style>
                @page { size: A4 portrait; margin: 10mm 12mm; }
                * { box-sizing: border-box; margin: 0; padding: 0; }

                body {
                    font-family: 'Times New Roman', Times, serif;
                    font-size: 9pt;
                    line-height: 1.25;
                    color: #000;
                }

                .header {
                    text-align: center;
                    border-bottom: 1.5px solid #000;
                    padding-bottom: 5px;
                    margin-bottom: 8px;
                }
                .header img {
                    max-width: 100%;
                    max-height: 16mm;
                    object-fit: contain;
                    display: block;
                    margin: 0 auto 3px;
                }
                .header h1 {
                    font-size: 11pt;
                    text-transform: uppercase;
                    font-weight: bold;
                    letter-spacing: 0.5px;
                }
                .header p {
                    font-size: 8pt;
                    margin-top: 2px;
                    color: #333;
                }

                .titulo {
                    text-align: center;
                    font-size: 11pt;
                    font-weight: bold;
                    background: #e8e8e8;
                    padding: 4px 8px;
                    border: 1px solid #000;
                    margin: 8px 0 4px;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }
                .subtitulo {
                    text-align: center;
                    font-size: 9pt;
                    margin: 0 0 8px;
                    font-style: italic;
                }

                .section-title {
                    font-size: 8.5pt;
                    font-weight: bold;
                    background: #e8e8e8;
                    padding: 3px 8px;
                    border-left: 3px solid #000;
                    margin: 10px 0 5px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }

                .stats-table {
                    width: 100%;
                    margin: 8px 0 12px;
                    border: 1px solid #000;
                    border-collapse: collapse;
                }
                .stats-table td {
                    text-align: center;
                    padding: 6px 4px;
                    border-right: 1px solid #ccc;
                }
                .stats-table td:last-child { border-right: none; }
                .stats-table td strong {
                    font-size: 14pt;
                    font-weight: bold;
                    display: block;
                }
                .stats-table td span {
                    font-size: 7.5pt;
                    color: #333;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }

                .info-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 8.5pt;
                    margin-bottom: 10px;
                }
                .info-table td {
                    padding: 5px 8px;
                    border: 1px solid #ccc;
                }

                .data-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 8pt;
                    margin-bottom: 10px;
                }
                .data-table th {
                    background: #333;
                    color: white;
                    padding: 5px 6px;
                    text-align: left;
                    border: 1px solid #000;
                    font-size: 8pt;
                    text-transform: uppercase;
                    letter-spacing: 0.3px;
                    font-weight: bold;
                }
                .data-table td {
                    padding: 4px 6px;
                    border: 1px solid #ccc;
                    vertical-align: top;
                }
                .data-table tr:nth-child(even) { background: #f5f5f5; }

                .assinaturas {
                    display: flex;
                    justify-content: center;
                    margin-top: 30px;
                    gap: 30px;
                    page-break-inside: avoid;
                }
                .assinatura {
                    flex: 0 0 55%;
                    text-align: center;
                }
                .assinatura-container-relatorio {
                    position: relative;
                    border-bottom: 1px solid #000;
                    min-height: 15mm;
                    display: flex;
                    align-items: flex-end;
                    justify-content: center;
                    padding-bottom: 2px;
                }
                .carimbo-overlay {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    max-height: 14mm;
                    max-width: 55%;
                    object-fit: contain;
                    opacity: 0.85;
                    pointer-events: none;
                    z-index: 2;
                }
                .assinatura-linha {
                    padding-top: 3px;
                    font-size: 8pt;
                    margin-top: 2px;
                }

                .footer {
                    text-align: center;
                    margin-top: 15px;
                    padding-top: 5px;
                    border-top: 1px solid #000;
                    font-size: 7pt;
                    color: #333;
                }
                .footer p { margin: 1px 0; }

                .registro-info {
                    font-size: 8pt;
                    color: #333;
                    margin-top: 10px;
                    text-align: center;
                }

                .btn-print {
                    display: block;
                    margin: 15px auto;
                    padding: 10px 28px;
                    background: #333;
                    color: white;
                    border: none;
                    border-radius: 6px;
                    font-weight: bold;
                    cursor: pointer;
                    font-size: 13px;
                    font-family: Arial, sans-serif;
                }
                .btn-print:hover { background: #000; }

                @media print {
                    .no-print { display: none !important; }
                    body { padding: 0; }
                    .section-title { page-break-after: avoid; page-break-inside: avoid; }
                    table { page-break-inside: auto; }
                    tr { page-break-inside: avoid; page-break-after: auto; }
                }
            </style>
        </head>
        <body>
            <button class="btn-print no-print" onclick="window.print()">🖨️ Imprimir</button>

            <div class="header">
                <img src="${logoIema}" alt="IEMA" onerror="this.style.display='none'">
                <h1>IEMA PLENO: SÃO LUÍS - CENTRO</h1>
                <p>Sistema de Relatórios — Atendimento Educacional Especializado</p>
            </div>

            <div class="titulo">${titulo}</div>
            ${subtitulo ? `<div class="subtitulo">${this.escapeHtml(subtitulo)}</div>` : ''}

            ${corpoHTML}

            <div class="assinaturas">
                <div class="assinatura">
                    <div class="assinatura-container-relatorio">
                        <img class="carimbo-overlay" src="${carimbo}" alt="Carimbo" onerror="this.style.display='none'">
                    </div>
                    <div class="assinatura-linha">Assinatura do Setor Pedagógico</div>
                </div>
            </div>

            <div class="registro-info">
                Relatório gerado em <strong>${dataGeracao}</strong>
            </div>

            <div class="footer">
                <p>Documento gerado automaticamente pelo EducaPleno</p>
                <p>Setor: Pedagógico — AEE</p>
            </div>
        </body>
        </html>`;

        const win = window.open('', '_blank');
        win.document.write(html);
        win.document.close();
        win.onload = () => setTimeout(() => win.print(), 500);
    },

};

// ============================================================================
// FIM DO MÓDULO
// ============================================================================