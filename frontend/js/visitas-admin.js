// frontend/js/visitas-admin.js
// Módulo de Autorização de Visitas Técnicas - ADMIN

class VisitasAdmin {
    constructor() {
        this.token = localStorage.getItem('auth_token');
        this.currentUser = null;
        this.termos = [];
        this.termosFiltrados = [];
        this.paginaAtual = 1;
        this.itensPorPagina = 12;
        this.filtros = {
            status: 'todos',
            turma: 'todas',
            search: '',
            ordenacao: 'data_desc' 
    };

        this.viewMode = localStorage.getItem('visitas_view_mode') || 'grid';
        
        // Cache de dados
        this.turmas = [];
        this.cursos = [];
        this.alunos = [];
        this.professores = [];
        
        // 🔥 NOVO: Estado do formulário (múltipla seleção)
        this.formData = {
            alunosSelecionados: [],       // Array de IDs de alunos
            professoresSelecionados: [],  // Array de IDs de professores
            localizacao: null
        };
        
        // Assinatura
        this.assinatura = {
            canvas: null,
            ctx: null,
            desenhando: false,
            temAssinatura: false,
            lastX: 0,
            lastY: 0
        };
    }

    // ============================================
    // INICIALIZAÇÃO
    // ============================================
    async init() {
        console.log('🚀 Inicializando módulo de Visitas...');
        
        if (!this.token) {
            console.error('❌ Token não encontrado');
            return;
        }
        
        try {
            const userData = JSON.parse(localStorage.getItem('user_data') || '{}');
            this.currentUser = userData;
            
            // 🔥 Carregar configurações ANTES de renderizar
            await this.carregarConfiguracao();
            await this.carregarDados();
            this.renderizar();
            
            console.log('✅ Módulo de Visitas inicializado');
        } catch (error) {
            console.error('❌ Erro ao inicializar:', error);
            this.showToast('Erro ao carregar módulo de visitas', 'error');
        }
    }

    // ============================================
    // API REQUEST
    // ============================================
    async apiRequest(url, options = {}) {
        const response = await fetch(url, {
            ...options,
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Content-Type': 'application/json',
                ...options.headers
            }
        });
        
        const data = await response.json();
        
        if (!response.ok && (response.status === 401 || response.status === 403)) {
            localStorage.removeItem('auth_token');
            localStorage.removeItem('user_data');
            window.location.href = '/login.html';
            throw new Error('Sessão expirada');
        }
        
        return data;
    }

    // ============================================
    // CARREGAR DADOS
    // ============================================
    async carregarDados() {
        try {
            const [turmasRes, cursosRes, professoresRes] = await Promise.all([
                this.apiRequest('/api/setor-pedagogico/visitas/turmas'),
                this.apiRequest('/api/setor-pedagogico/visitas/cursos'),
                this.apiRequest('/api/setor-pedagogico/visitas/professores')
            ]);
            
            if (turmasRes.success) {
                // Normalizar: aceitar string ou objeto
                this.turmas = (turmasRes.turmas || []).map(t => 
                    typeof t === 'string' ? { id: t, nome: t } : t
                );
            }
            
            if (cursosRes.success) this.cursos = cursosRes.cursos || [];
            if (professoresRes.success) this.professores = professoresRes.professores || [];
            
            console.log(`✅ Dados carregados: ${this.turmas.length} turmas, ${this.cursos.length} cursos, ${this.professores.length} professores`);
            
            await this.carregarTermos();
        } catch (error) {
            console.error('❌ Erro ao carregar dados:', error);
            throw error;
        }
    }

    async carregarTermos() {
        try {
            const params = new URLSearchParams({
                page: this.paginaAtual,
                limit: this.itensPorPagina,
                status: this.filtros.status,
                turma: this.filtros.turma,
                search: this.filtros.search
            });
            
            const response = await this.apiRequest(`/api/setor-pedagogico/visitas/termos?${params}`);
            
            if (response.success) {
                this.termos = response.termos || [];
                this.termosFiltrados = [...this.termos];
                this.paginacao = response.paginacao;
                this.estatisticas = response.estatisticas;
            }
        } catch (error) {
            console.error('❌ Erro ao carregar termos:', error);
        }
    }

    // ============================================
    // RENDERIZAÇÃO PRINCIPAL
    // ============================================
    renderizar() {
        const container = document.getElementById('aba-visitas-content');
        if (!container) {
            console.warn('⚠️ Container de visitas não encontrado');
            return;
        }
        
        const stats = this.estatisticas || { total: 0, pendentes: 0, autorizados: 0, recusados: 0 };
        
        container.innerHTML = `
            <div class="visitas-container">
                <!-- HEADER -->
                <div class="visitas-header">
                    <div class="header-left">
                        <div class="header-icon">
                            <i class="fas fa-map-marked-alt"></i>
                        </div>
                        <div class="header-text">
                            <h1>Autorização de Visitas</h1>
                            <p>Gerencie termos de visita técnica e autorizações</p>
                        </div>
                    </div>
                    <div class="header-actions" style="flex-wrap: wrap;">
                        <!-- 🔥 NOVO: BOTÃO QR CODE -->
                        <button class="btn-header" onclick="visitasAdmin.abrirQRCodePublico()" 
                                style="background: #3b82f6; color: white;" 
                                title="Gerar QR Code para os responsáveis">
                            <i class="fas fa-qrcode"></i>
                            <span>QR Code</span>
                        </button>
                        
                        <!-- 🔥 NOVO: BOTÃO COPIAR LINK -->
                        <button class="btn-header" onclick="visitasAdmin.copiarLinkPublico()" 
                                style="background: #8b5cf6; color: white;" 
                                title="Copiar link da página pública">
                            <i class="fas fa-link"></i>
                            <span>Copiar Link</span>
                        </button>
                        
                        <!-- 🔥 NOVO: BOTÃO ABRIR PÁGINA PÚBLICA -->
                        <button class="btn-header" onclick="visitasAdmin.abrirPaginaPublica()" 
                                style="background: #10b981; color: white;" 
                                title="Abrir página pública em nova aba">
                            <i class="fas fa-external-link-alt"></i>
                            <span>Ver Página</span>
                        </button>

                        <button class="btn-header" onclick="visitasAdmin.imprimirTodosTermos()" 
                                style="background: #dc2626; color: white;" 
                                title="Imprimir todos os termos filtrados">
                            <i class="fas fa-print"></i>
                            <span>Imprimir Todos</span>
                        </button>
                        
                        <button class="btn-header btn-refresh" onclick="visitasAdmin.atualizar()" title="Atualizar">
                            <i class="fas fa-sync-alt"></i>
                        </button>
                        <button class="btn-header btn-primary" onclick="visitasAdmin.abrirModalNovoTermo()">
                            <i class="fas fa-plus-circle"></i>
                            <span>Novo Termo</span>
                        </button>
                    </div>
                </div>

                <!-- PAINEL DE CONFIGURAÇÕES DA PÁGINA PÚBLICA -->
                <div style="background: linear-gradient(135deg, #f0f9ff, #e0f2fe); border-radius: 16px; padding: 20px; margin-bottom: 25px; border: 2px solid #bae6fd;">
                    <div style="display: flex; align-items: center; gap: 15px; flex-wrap: wrap;">
                        <div style="width: 50px; height: 50px; background: linear-gradient(135deg, #3b82f6, #2563eb); border-radius: 12px; display: flex; align-items: center; justify-content: center; color: white; font-size: 24px; flex-shrink: 0;">
                            <i class="fas fa-globe"></i>
                        </div>
                        <div style="flex: 1; min-width: 250px;">
                            <h3 style="margin: 0 0 4px; font-size: 16px; color: #1e40af;">
                                📱 Página Pública para Responsáveis
                            </h3>
                            <p style="margin: 0; font-size: 13px; color: #1e40af; opacity: 0.8;">
                                Os responsáveis acessam o link abaixo para autorizar a participação dos alunos
                            </p>
                        </div>
                        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                            <label style="display: flex; align-items: center; gap: 8px; padding: 8px 14px; background: white; border-radius: 30px; cursor: pointer; font-size: 13px; font-weight: 600; border: 2px solid #e5e7eb;">
                                <input type="checkbox" id="toggleVisitasPublicas" 
                                    ${this.configuracao?.visitasAbertas ? 'checked' : ''}
                                    onchange="visitasAdmin.toggleVisitasPublicas(this.checked)"
                                    style="width: 18px; height: 18px; accent-color: #10b981; cursor: pointer;">
                                <span style="color: #374151;">
                                    ${this.configuracao?.visitasAbertas ? '🟢 Autorizações Abertas' : '🔴 Autorizações Fechadas'}
                                </span>
                            </label>
                        </div>
                    </div>
                    
                    <!-- Link visível -->
                    <div style="margin-top: 15px; padding: 12px; background: white; border-radius: 10px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                        <i class="fas fa-link" style="color: #3b82f6;"></i>
                        <input type="text" readonly id="linkPublicoInputVisitas" 
                            value="${window.location.origin}/visitas-publico.html"
                            style="flex: 1; padding: 8px 12px; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 13px; font-family: monospace; min-width: 250px;">
                        <button onclick="visitasAdmin.copiarLinkPublico()" 
                                class="btn-filter" 
                                style="padding: 8px 16px;">
                            <i class="fas fa-copy"></i> Copiar
                        </button>
                    </div>
                </div>

                <!-- ESTATÍSTICAS -->
                <div class="visitas-stats-grid">
                    <div class="visita-stat-card primary" onclick="visitasAdmin.filtrarPorStatus('todos')">
                        <div class="stat-icon"><i class="fas fa-file-alt"></i></div>
                        <div class="stat-content">
                            <span class="stat-label">Total de Termos</span>
                            <span class="stat-value">${stats.total || 0}</span>
                            <span class="stat-detail">Clique para ver todos</span>
                        </div>
                    </div>
                    <div class="visita-stat-card warning" onclick="visitasAdmin.filtrarPorStatus('pendente')">
                        <div class="stat-icon"><i class="fas fa-clock"></i></div>
                        <div class="stat-content">
                            <span class="stat-label">Pendentes</span>
                            <span class="stat-value">${stats.pendentes || 0}</span>
                            <span class="stat-detail">Aguardando responsável</span>
                        </div>
                    </div>
                    <div class="visita-stat-card success" onclick="visitasAdmin.filtrarPorStatus('autorizado')">
                        <div class="stat-icon"><i class="fas fa-check-circle"></i></div>
                        <div class="stat-content">
                            <span class="stat-label">Autorizados</span>
                            <span class="stat-value">${stats.autorizados || 0}</span>
                            <span class="stat-detail">Prontos para uso</span>
                        </div>
                    </div>
                    <div class="visita-stat-card danger" onclick="visitasAdmin.filtrarPorStatus('recusado')">
                        <div class="stat-icon"><i class="fas fa-times-circle"></i></div>
                        <div class="stat-content">
                            <span class="stat-label">Recusados</span>
                            <span class="stat-value">${stats.recusados || 0}</span>
                            <span class="stat-detail">Não autorizados</span>
                        </div>
                    </div>
                </div>

                <!-- ============================================
                    ABAS DE STATUS + FILTROS
                    ============================================ -->
                <div class="visitas-filters-card">
                    
                    <!-- 🔥 ABAS DE STATUS (organização rápida) -->
                    <div class="status-tabs" style="display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap; padding-bottom: 15px; border-bottom: 2px solid #f0f0f0;">
                        <button class="status-tab ${this.filtros.status === 'todos' ? 'active' : ''}" 
                                onclick="visitasAdmin.filtrarPorStatus('todos')">
                            <i class="fas fa-list"></i>
                            Todos
                            <span class="tab-count">${stats.total || 0}</span>
                        </button>
                        <button class="status-tab warning ${this.filtros.status === 'pendente' ? 'active' : ''}" 
                                onclick="visitasAdmin.filtrarPorStatus('pendente')">
                            <i class="fas fa-clock"></i>
                            Pendentes
                            <span class="tab-count">${stats.pendentes || 0}</span>
                        </button>
                        <button class="status-tab info ${this.filtros.status === 'parcialmente_autorizado' ? 'active' : ''}" 
                                onclick="visitasAdmin.filtrarPorStatus('parcialmente_autorizado')">
                            <i class="fas fa-adjust"></i>
                            Parciais
                            <span class="tab-count">${stats.parcialmente_autorizado || 0}</span>
                        </button>
                        <button class="status-tab success ${this.filtros.status === 'autorizado' ? 'active' : ''}" 
                                onclick="visitasAdmin.filtrarPorStatus('autorizado')">
                            <i class="fas fa-check-circle"></i>
                            Autorizados
                            <span class="tab-count">${stats.autorizados || 0}</span>
                        </button>
                        <button class="status-tab danger ${this.filtros.status === 'recusado' ? 'active' : ''}" 
                                onclick="visitasAdmin.filtrarPorStatus('recusado')">
                            <i class="fas fa-times-circle"></i>
                            Recusados
                            <span class="tab-count">${stats.recusados || 0}</span>
                        </button>
                        
                        <!-- Espaçador -->
                        <div style="flex: 1;"></div>
                        
                        <!-- Visualização: Grid / Lista -->
                        <div class="view-toggle" style="display: flex; gap: 4px; background: #f3f4f6; padding: 4px; border-radius: 10px;">
                            <button class="view-btn ${this.viewMode !== 'list' ? 'active' : ''}" 
                                    onclick="visitasAdmin.mudarViewMode('grid')" title="Grade">
                                <i class="fas fa-th"></i>
                            </button>
                            <button class="view-btn ${this.viewMode === 'list' ? 'active' : ''}" 
                                    onclick="visitasAdmin.mudarViewMode('list')" title="Lista">
                                <i class="fas fa-list"></i>
                            </button>
                        </div>
                    </div>
                    
                    <div class="visitas-filters-header">
                        <div class="visitas-filters-title">
                            <i class="fas fa-sliders-h"></i>
                            <h3>Filtros Avançados</h3>
                        </div>
                        <span class="visitas-filters-badge">${this.termosFiltrados.length} resultado(s)</span>
                    </div>
                    
                    <div class="visitas-filters-grid">
                        <div class="visita-filter-group">
                            <label><i class="fas fa-search"></i> Buscar</label>
                            <div class="visita-input-wrapper">
                                <input type="text" id="buscaTermo" placeholder="Aluno, código, professor..." 
                                    value="${this.filtros.search}">
                                <i class="fas fa-search visita-input-icon"></i>
                            </div>
                        </div>
                        <div class="visita-filter-group">
                            <label><i class="fas fa-school"></i> Turma</label>
                            <select id="filtroTurma" class="visita-filter-select" onchange="visitasAdmin.filtrarPorTurma(this.value)">
                                <option value="todas">Todas as turmas</option>
                                ${this.turmas.map(t => {
                                    const nome = typeof t === 'string' ? t : t.nome;
                                    return `<option value="${nome}" ${this.filtros.turma === nome ? 'selected' : ''}>${nome}</option>`;
                                }).join('')}
                            </select>
                        </div>
                        <div class="visita-filter-group">
                            <label><i class="fas fa-sort"></i> Ordenar</label>
                            <select id="filtroOrdenacao" class="visita-filter-select" onchange="visitasAdmin.ordenarTermos(this.value)">
                                <option value="data_desc" ${this.filtros.ordenacao === 'data_desc' ? 'selected' : ''}>📅 Mais recentes</option>
                                <option value="data_asc" ${this.filtros.ordenacao === 'data_asc' ? 'selected' : ''}>📅 Mais antigos</option>
                                <option value="dataVisita_asc" ${this.filtros.ordenacao === 'dataVisita_asc' ? 'selected' : ''}>🎯 Visita mais próxima</option>
                                <option value="nome_asc" ${this.filtros.ordenacao === 'nome_asc' ? 'selected' : ''}>🔤 Aluno (A-Z)</option>
                                <option value="codigo_asc" ${this.filtros.ordenacao === 'codigo_asc' ? 'selected' : ''}>🔢 Código</option>
                            </select>
                        </div>
                        <div class="visita-filter-actions">
                            <button class="btn-filter" onclick="visitasAdmin.aplicarFiltros()">
                                <i class="fas fa-filter"></i> Aplicar
                            </button>
                            <button class="btn-filter btn-clear" onclick="visitasAdmin.limparFiltros()">
                                <i class="fas fa-eraser"></i> Limpar
                            </button>
                        </div>
                    </div>
                </div>

                <!-- LISTA DE TERMOS -->
                <div id="listaTermos">
                    ${this.renderizarListaTermos()}
                </div>

                <!-- PAGINAÇÃO -->
                ${this.paginacao && this.paginacao.pages > 1 ? this.renderizarPaginacao() : ''}
            </div>
        `;
        
        // Configurar busca
        const buscaInput = document.getElementById('buscaTermo');
        if (buscaInput) {
            let timeout;
            buscaInput.addEventListener('input', (e) => {
                clearTimeout(timeout);
                timeout = setTimeout(() => {
                    this.filtros.search = e.target.value;
                    this.paginaAtual = 1;
                    this.carregarTermos().then(() => this.renderizar());
                }, 500);
            });
        }
    }

    renderizarListaTermos() {
        if (!this.termosFiltrados || this.termosFiltrados.length === 0) {
            return `
                <div class="visitas-empty-state">
                    <i class="fas fa-map-marked-alt"></i>
                    <h3>Nenhum termo encontrado</h3>
                    <p>${this.filtros.status !== 'todos' || this.filtros.search || this.filtros.turma !== 'todas'
                        ? 'Tente ajustar os filtros acima'
                        : 'Crie o primeiro termo de visita clicando em "Novo Termo"'}</p>
                    ${this.filtros.status !== 'todos' || this.filtros.search || this.filtros.turma !== 'todas' 
                        ? `<button class="btn-filter" onclick="visitasAdmin.limparFiltros()" style="margin-top: 15px;">
                            <i class="fas fa-eraser"></i> Limpar Filtros
                        </button>`
                        : ''}
                </div>
            `;
        }
        
        const modo = this.viewMode || 'grid';
        
        if (modo === 'list') {
            return `
                <div class="termos-lista-view">
                    ${this.termosFiltrados.map(termo => this.renderizarLinhaTermo(termo)).join('')}
                </div>
            `;
        }
        
        // Modo GRID (padrão)
        return `
            <div class="termos-lista">
                ${this.termosFiltrados.map(termo => this.renderizarCardTermo(termo)).join('')}
            </div>
        `;
    }

    // ============================================
    // 📋 RENDERIZAR LINHA (MODO LISTA)
    // ============================================
    renderizarLinhaTermo(termo) {
        const status = termo.status || 'pendente';
        const dataVisita = termo.dataVisita 
            ? new Date(termo.dataVisita).toLocaleDateString('pt-BR') 
            : 'N/A';
        
        const statusLabel = {
            'pendente': '⏳ Pendente',
            'parcialmente_autorizado': '🔶 Parcial',
            'autorizado': '✅ Autorizado',
            'recusado': '❌ Recusado'
        }[status] || status;
        
        const badgeAlunos = termo.totalAlunos > 1 
            ? `<span style="background: #e0e7ff; color: #3730a3; padding: 2px 8px; border-radius: 20px; font-size: 10px; margin-left: 6px;">+${termo.totalAlunos - 1}</span>`
            : '';
        
        const badgeProf = termo.totalProfessores > 1
            ? `<span style="background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 20px; font-size: 10px; margin-left: 6px;">+${termo.totalProfessores - 1}</span>`
            : '';
        
        return `
            <div class="termo-linha" onclick="visitasAdmin.verDetalhes('${termo._id}')" style="cursor: pointer;">
                <div class="termo-linha-status" data-status="${status}"></div>
                
                <div class="termo-linha-codigo">
                    <span style="font-family: monospace; font-size: 12px; background: #f3f4f6; padding: 4px 10px; border-radius: 6px;">
                        ${termo.codigo}
                    </span>
                </div>
                
                <div class="termo-linha-aluno">
                    <strong>${this.escapeHtml(termo.alunoNome || 'Aluno')}</strong>
                    ${badgeAlunos}
                    <div style="font-size: 11px; color: #6b7280; margin-top: 2px;">
                        <i class="fas fa-school"></i> ${this.escapeHtml(termo.alunoTurma || 'N/A')}
                        ${termo.alunoCurso ? ` • <i class="fas fa-book"></i> ${this.escapeHtml(termo.alunoCurso)}` : ''}
                    </div>
                </div>
                
                <div class="termo-linha-atividade">
                    <div style="font-size: 13px; color: #374151;">
                        <i class="fas fa-clipboard-list" style="color: #667eea;"></i>
                        ${this.escapeHtml(termo.atividade || 'N/A')}
                    </div>
                </div>
                
                <div class="termo-linha-professor">
                    <span style="font-size: 12px; color: #4b5563;">
                        <i class="fas fa-chalkboard-teacher" style="color: #f59e0b;"></i>
                        ${this.escapeHtml(termo.professorNome || 'N/A')}
                        ${badgeProf}
                    </span>
                </div>
                
                <div class="termo-linha-data">
                    <span style="font-size: 12px; color: #6b7280;">
                        <i class="fas fa-calendar-alt"></i> ${dataVisita}
                    </span>
                </div>
                
                <div class="termo-linha-status-badge">
                    <span class="termo-status-badge ${status}">${statusLabel}</span>
                </div>
                
                <div class="termo-linha-acoes" onclick="event.stopPropagation()">
                    <button class="termo-card-action" onclick="visitasAdmin.verDetalhes('${termo._id}')" title="Ver">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="termo-card-action" onclick="visitasAdmin.editarTermo('${termo._id}')" title="Editar">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="termo-card-action" onclick="visitasAdmin.imprimirTermo('${termo._id}')" title="Imprimir">
                        <i class="fas fa-print"></i>
                    </button>
                    <button class="termo-card-action danger" onclick="visitasAdmin.excluirTermo('${termo._id}')" title="Excluir">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }

    // ============================================
    // 🎨 MUDAR VIEW MODE (grid/list)
    // ============================================
    mudarViewMode(mode) {
        this.viewMode = mode;
        localStorage.setItem('visitas_view_mode', mode);
        
        // Re-renderizar apenas a lista
        const container = document.getElementById('listaTermos');
        if (container) {
            container.innerHTML = this.renderizarListaTermos();
        }
        
        // Atualizar botões
        document.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector(`.view-btn[onclick*="'${mode}'"]`)?.classList.add('active');
    }

    // ============================================
    // 🔤 ORDENAR TERMOS
    // ============================================
    ordenarTermos(ordenacao) {
        this.filtros.ordenacao = ordenacao;
        
        switch(ordenacao) {
            case 'data_desc':
                this.termosFiltrados.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                break;
            case 'data_asc':
                this.termosFiltrados.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
                break;
            case 'dataVisita_asc':
                this.termosFiltrados.sort((a, b) => new Date(a.dataVisita) - new Date(b.dataVisita));
                break;
            case 'nome_asc':
                this.termosFiltrados.sort((a, b) => (a.alunoNome || '').localeCompare(b.alunoNome || ''));
                break;
            case 'codigo_asc':
                this.termosFiltrados.sort((a, b) => (a.codigo || '').localeCompare(b.codigo || ''));
                break;
        }
        
        this.renderizarListaTermos();
        const container = document.getElementById('listaTermos');
        if (container) {
            container.innerHTML = this.renderizarListaTermos();
        }
    }

    renderizarCardTermo(termo) {
        const status = termo.status || 'pendente';
        const dataVisita = termo.dataVisita 
            ? new Date(termo.dataVisita).toLocaleDateString('pt-BR') 
            : 'Não definida';
        
        const statusLabel = {
            'pendente': '⏳ Pendente',
            'parcialmente_autorizado': '🔶 Parcial',
            'autorizado': '✅ Autorizado',
            'recusado': '❌ Recusado'
        }[status] || status;
        
        // 🔥 Indicadores de múltiplos
        const badgeMultiplosAlunos = termo.totalAlunos > 1 
            ? `<span style="background: rgba(255,255,255,0.3); padding: 2px 8px; border-radius: 30px; font-size: 10px; margin-left: 6px;">+${termo.totalAlunos - 1} aluno(s)</span>`
            : '';
        
        const badgeMultiplosProf = termo.totalProfessores > 1
            ? `<span style="background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 30px; font-size: 10px; margin-left: 6px;">+${termo.totalProfessores - 1} prof.</span>`
            : '';
        
        // Progresso de autorizações
        const progresso = termo.totalResponsaveis > 0
            ? `<div style="font-size: 11px; color: #6b7280; margin-top: 8px;">
                <i class="fas fa-check-circle" style="color: #10b981;"></i>
                ${termo.responsaveisAutorizados} de ${termo.totalResponsaveis} responsável(is) autorizou(aram)
            </div>`
            : '';
        
        return `
            <div class="termo-card">
                <div class="termo-card-header ${status}">
                    <h3 style="display: flex; align-items: center; flex-wrap: wrap; gap: 4px;">
                        ${this.escapeHtml(termo.alunoNome || 'Aluno')}
                        ${badgeMultiplosAlunos}
                    </h3>
                    <span class="termo-card-codigo">${termo.codigo}</span>
                </div>
                <div class="termo-card-body">
                    <div class="termo-info-row">
                        <i class="fas fa-school"></i>
                        <span><strong>Turma:</strong> ${this.escapeHtml(termo.alunoTurma || 'N/A')}</span>
                    </div>
                    <div class="termo-info-row">
                        <i class="fas fa-book"></i>
                        <span><strong>Curso:</strong> ${this.escapeHtml(termo.alunoCurso || 'N/A')}</span>
                    </div>
                    <div class="termo-info-row">
                        <i class="fas fa-map-marker-alt"></i>
                        <span><strong>Local:</strong> ${this.escapeHtml(termo.local || 'N/A')}</span>
                    </div>
                    <div class="termo-info-row">
                        <i class="fas fa-calendar-alt"></i>
                        <span><strong>Data:</strong> ${dataVisita}</span>
                    </div>
                    <div class="termo-info-row">
                        <i class="fas fa-chalkboard-teacher"></i>
                        <span><strong>Professor:</strong> ${this.escapeHtml(termo.professorNome || 'N/A')}</span>
                        ${badgeMultiplosProf}
                    </div>
                    ${progresso}
                    <div style="margin-top: 10px;">
                        <span class="termo-status-badge ${status}">${statusLabel}</span>
                    </div>
                </div>
                <div class="termo-card-actions">
                    <button class="termo-card-action" onclick="visitasAdmin.verDetalhes('${termo._id}')">
                        <i class="fas fa-eye"></i> Ver
                    </button>
                    <button class="termo-card-action" onclick="visitasAdmin.editarTermo('${termo._id}')">
                        <i class="fas fa-edit"></i> Editar
                    </button>
                    <button class="termo-card-action" onclick="visitasAdmin.imprimirTermo('${termo._id}')">
                        <i class="fas fa-print"></i> Imprimir
                    </button>
                    <button class="termo-card-action danger" onclick="visitasAdmin.excluirTermo('${termo._id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }

    renderizarPaginacao() {
        const { page, pages } = this.paginacao;
        let botoes = '';
        
        const inicio = Math.max(1, page - 2);
        const fim = Math.min(pages, page + 2);
        
        if (inicio > 1) {
            botoes += `<button class="btn-filter" onclick="visitasAdmin.irParaPagina(1)">1</button>`;
            if (inicio > 2) botoes += `<span style="padding: 0 8px;">...</span>`;
        }
        
        for (let i = inicio; i <= fim; i++) {
            botoes += `<button class="btn-filter ${i === page ? '' : 'btn-clear'}" onclick="visitasAdmin.irParaPagina(${i})">${i}</button>`;
        }
        
        if (fim < pages) {
            if (fim < pages - 1) botoes += `<span style="padding: 0 8px;">...</span>`;
            botoes += `<button class="btn-filter" onclick="visitasAdmin.irParaPagina(${pages})">${pages}</button>`;
        }
        
        return `
            <div style="display: flex; justify-content: center; gap: 8px; margin-top: 20px; flex-wrap: wrap;">
                ${botoes}
            </div>
        `;
    }

    irParaPagina(pagina) {
        this.paginaAtual = pagina;
        this.carregarTermos().then(() => this.renderizar());
    }

    // ============================================
    // FILTROS
    // ============================================
    filtrarPorStatus(status) {
        this.filtros.status = status;
        this.paginaAtual = 1;
        this.carregarTermos().then(() => this.renderizar());
    }

    filtrarPorTurma(turma) {
        this.filtros.turma = turma;
        this.paginaAtual = 1;
        this.carregarTermos().then(() => this.renderizar());
    }

    aplicarFiltros() {
        this.paginaAtual = 1;
        this.carregarTermos().then(() => this.renderizar());
    }

    limparFiltros() {
        this.filtros = { status: 'todos', turma: 'todas', search: '' };
        this.paginaAtual = 1;
        this.carregarTermos().then(() => this.renderizar());
    }

    async atualizar() {
        this.showToast('🔄 Atualizando...', 'info');
        await this.carregarDados();
        this.renderizar();
        this.showToast('✅ Atualizado!', 'success');
    }

    // ============================================
    // MODAL NOVO TERMO
    // ============================================
    async abrirModalNovoTermo(termoId = null) {
        const modalBody = document.getElementById('modalBody');
        const modalTitle = document.getElementById('modalTitle');
        const modalSaveBtn = document.getElementById('modalSaveBtn');
        
        if (!modalBody) return;
        
        let termo = null;
        if (termoId) {
            const response = await this.apiRequest(`/api/setor-pedagogico/visitas/termos/${termoId}`);
            if (response.success) termo = response.termo;
        }
        
        modalTitle.innerHTML = termoId 
            ? '<i class="fas fa-edit"></i> Editar Termo de Visita'
            : '<i class="fas fa-plus-circle"></i> Novo Termo de Visita';
        
        modalBody.innerHTML = this.renderizarFormularioTermo(termo);
        
        // Configurar eventos
        this.configurarFormularioTermo(termo);
        
        modalSaveBtn.innerHTML = termoId ? '💾 Salvar Alterações' : '✏️ Criar Termo';
        modalSaveBtn.onclick = () => this.salvarTermo(termoId);
        modalSaveBtn.style.display = 'inline-block';
        
        this.openModal();
    }

    renderizarFormularioTermo(termo = null) {
        // 🔥 Restaurar estado se for edição
        if (termo) {
            this.formData.alunosSelecionados = (termo.alunos || []).map(a => 
                (a.alunoId?._id || a.alunoId || '').toString()
            );
            this.formData.professoresSelecionados = (termo.professores || []).map(p => 
                (p.professorId?._id || p.professorId || '').toString()
            );
            this.formData.localizacao = termo.localizacao || null;
        } else {
            this.formData.alunosSelecionados = [];
            this.formData.professoresSelecionados = [];
            this.formData.localizacao = null;
        }
        
        return `
            <div class="visita-modal-body">
                <!-- HEADER DO MODAL -->
                <div class="visita-modal-header-custom">
                    <div class="header-icon">
                        <i class="fas fa-map-marked-alt"></i>
                    </div>
                    <div>
                        <h2>${termo ? '✏️ Editar Termo' : '➕ Novo Termo de Visita'}</h2>
                        <p style="margin: 5px 0 0; opacity: 0.9; font-size: 0.85rem;">
                            ${termo ? `Código: ${termo.codigo}` : 'Preencha os dados para criar o termo'}
                        </p>
                    </div>
                </div>

                <form id="formTermoVisita">

                    <!-- ============================================ -->
                    <!-- SEÇÃO 1: ALUNOS (MÚLTIPLOS) -->
                    <!-- ============================================ -->
                    <div class="visita-form-section">
                        <div class="visita-form-section-title">
                            <i class="fas fa-user-graduate"></i>
                            <span>Alunos Participantes</span>
                            <span id="contadorAlunos" style="margin-left: auto; font-size: 12px; background: #e0e7ff; color: #3730a3; padding: 3px 10px; border-radius: 20px;">
                                ${this.formData.alunosSelecionados.length} selecionado(s)
                            </span>
                        </div>

                        <!-- Filtros de busca -->
                        <div class="visita-form-row">
                            <div class="visita-form-group">
                                <label><i class="fas fa-school"></i> Turma <span class="required">*</span></label>
                                <select id="formTurma" class="form-input" onchange="visitasAdmin.buscarAlunos()">
                                    <option value="">Selecione a turma</option>
                                    ${this.turmas.map(t => {
                                        const nomeTurma = typeof t === 'string' ? t : t.nome;
                                        const selected = termo?.turmaPrincipal === nomeTurma ? 'selected' : '';
                                        return `<option value="${nomeTurma}" ${selected}>${nomeTurma}</option>`;
                                    }).join('')}
                                </select>
                            </div>
                            <div class="visita-form-group">
                                <label><i class="fas fa-book"></i> Curso</label>
                                <select id="formCurso" class="form-input" onchange="visitasAdmin.buscarAlunos()">
                                    <option value="">Todos os cursos</option>
                                    ${this.cursos.map(c => {
                                        const selected = termo?.cursoPrincipal === c ? 'selected' : '';
                                        return `<option value="${c}" ${selected}>${c}</option>`;
                                    }).join('')}
                                </select>
                            </div>
                        </div>

                        <!-- Busca por nome -->
                        <div class="visita-form-row">
                            <div class="visita-form-group full-width">
                                <label><i class="fas fa-search"></i> Buscar Aluno</label>
                                <input type="text" id="formBuscaAluno" class="form-input" 
                                    placeholder="Digite para filtrar os alunos..." 
                                    autocomplete="off">
                            </div>
                        </div>

                        <!-- Botões de ação em massa -->
                        <div style="display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap;">
                            <button type="button" class="btn-filter" onclick="visitasAdmin.selecionarTodosAlunos()" style="padding: 6px 14px; font-size: 12px;">
                                <i class="fas fa-check-double"></i> Selecionar Todos
                            </button>
                            <button type="button" class="btn-filter btn-clear" onclick="visitasAdmin.limparSelecaoAlunos()" style="padding: 6px 14px; font-size: 12px;">
                                <i class="fas fa-times"></i> Limpar Seleção
                            </button>
                            <span style="margin-left: auto; font-size: 12px; color: #6b7280; align-self: center;">
                                <i class="fas fa-info-circle"></i> Marque os alunos participantes
                            </span>
                        </div>

                        <!-- Lista de alunos -->
                        <div id="listaAlunosSelecao" style="max-height: 300px; overflow-y: auto; border: 2px solid #e5e7eb; border-radius: 12px; background: white;">
                            ${this.renderizarListaAlunosSelecao(termo)}
                        </div>

                        <input type="hidden" id="formAlunosIDs" value='${JSON.stringify(this.formData.alunosSelecionados)}'>
                    </div>

                    <!-- ============================================ -->
                    <!-- SEÇÃO 2: ATIVIDADE E PERÍODO -->
                    <!-- ============================================ -->
                    <div class="visita-form-section">
                        <div class="visita-form-section-title">
                            <i class="fas fa-tasks"></i>
                            <span>Detalhes da Atividade</span>
                        </div>

                        <div class="visita-form-row">
                            <div class="visita-form-group full-width">
                                <label><i class="fas fa-clipboard-list"></i> Atividade <span class="required">*</span></label>
                                <input type="text" id="formAtividade" class="form-input" 
                                    placeholder="Ex: Visita Técnica ao Porto do Itaqui"
                                    value="${termo?.atividade || ''}">
                            </div>
                        </div>

                        <div class="visita-form-row">
                            <div class="visita-form-group">
                                <label><i class="fas fa-calendar-week"></i> Período <span class="required">*</span></label>
                                <select id="formPeriodo" class="form-input">
                                    <option value="">Selecione</option>
                                    <option value="1º Período" ${termo?.periodo === '1º Período' ? 'selected' : ''}>1º Período</option>
                                    <option value="2º Período" ${termo?.periodo === '2º Período' ? 'selected' : ''}>2º Período</option>
                                    <option value="3º Período" ${termo?.periodo === '3º Período' ? 'selected' : ''}>3º Período</option>
                                    <option value="Matutino" ${termo?.periodo === 'Matutino' ? 'selected' : ''}>Matutino</option>
                                    <option value="Vespertino" ${termo?.periodo === 'Vespertino' ? 'selected' : ''}>Vespertino</option>
                                    <option value="Noturno" ${termo?.periodo === 'Noturno' ? 'selected' : ''}>Noturno</option>
                                </select>
                            </div>
                            <div class="visita-form-group">
                                <label><i class="fas fa-clock"></i> Horário <span class="required">*</span></label>
                                <input type="text" id="formHorario" class="form-input" 
                                    placeholder="Ex: 14:00 às 17:00"
                                    value="${termo?.horario || ''}">
                            </div>
                        </div>

                        <div class="visita-form-row">
                            <div class="visita-form-group">
                                <label><i class="fas fa-calendar-day"></i> Data da Visita <span class="required">*</span></label>
                                <input type="date" id="formDataVisita" class="form-input" 
                                    value="${termo?.dataVisita ? new Date(termo.dataVisita).toISOString().split('T')[0] : ''}">
                            </div>
                            <div class="visita-form-group">
                                <label><i class="fas fa-city"></i> Cidade</label>
                                <input type="text" id="formCidade" class="form-input" 
                                    placeholder="São Luís"
                                    value="${termo?.cidade || 'São Luís'}">
                            </div>
                        </div>
                    </div>

                    <!-- ============================================ -->
                    <!-- SEÇÃO 3: PROFESSORES (MÚLTIPLOS) -->
                    <!-- ============================================ -->
                    <div class="visita-form-section">
                        <div class="visita-form-section-title">
                            <i class="fas fa-chalkboard-teacher"></i>
                            <span>Professores Coordenadores</span>
                            <span id="contadorProfessores" style="margin-left: auto; font-size: 12px; background: #fef3c7; color: #92400e; padding: 3px 10px; border-radius: 20px;">
                                ${this.formData.professoresSelecionados.length} selecionado(s)
                            </span>
                        </div>

                        <!-- Select para adicionar professor -->
                        <div class="visita-form-row">
                            <div class="visita-form-group full-width">
                                <label><i class="fas fa-user-plus"></i> Adicionar Professor</label>
                                <div style="display: flex; gap: 8px;">
                                    <select id="formProfessorSelect" class="form-input" style="flex: 1;">
                                        <option value="">Selecione um professor...</option>
                                        ${this.professores.map(p => `
                                            <option value="${p.id}">${this.escapeHtml(p.nome)} ${p.matricula ? `- ${p.matricula}` : ''}</option>
                                        `).join('')}
                                    </select>
                                    <button type="button" class="btn-filter" onclick="visitasAdmin.adicionarProfessor()" style="white-space: nowrap;">
                                        <i class="fas fa-plus"></i> Adicionar
                                    </button>
                                </div>
                            </div>
                        </div>

                        <!-- Lista de professores selecionados (chips) -->
                        <div style="margin-bottom: 12px;">
                            <label style="display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 8px;">
                                <i class="fas fa-users"></i> Professores Selecionados:
                            </label>
                            <div id="listaProfessoresChips">
                                ${this.renderizarChipsProfessores()}
                            </div>
                        </div>

                        <input type="hidden" id="formProfessoresIDs" value='${JSON.stringify(this.formData.professoresSelecionados)}'>
                    </div>

                    <!-- ============================================ -->
                    <!-- SEÇÃO 4: LOCAL DA VISITA -->
                    <!-- ============================================ -->
                    <div class="visita-form-section">
                        <div class="visita-form-section-title">
                            <i class="fas fa-map-marker-alt"></i>
                            <span>Local da Visita</span>
                        </div>

                        <div class="visita-form-row">
                            <div class="visita-form-group full-width">
                                <label><i class="fas fa-map-pin"></i> Nome do Local <span class="required">*</span></label>
                                <div class="localizacao-wrapper">
                                    <input type="text" id="formLocal" class="form-input" 
                                        placeholder="Ex: Porto do Itaqui"
                                        value="${termo?.local || ''}"
                                        autocomplete="off">
                                    <div id="sugestoesLocal" class="localizacao-sugestoes"></div>
                                </div>
                                <small style="color: #6b7280; font-size: 12px; margin-top: 4px; display: block;">
                                    <i class="fas fa-info-circle"></i> Digite o nome do local e selecione uma sugestão
                                </small>
                            </div>
                        </div>

                        <div id="localizacaoSelecionada" style="display: ${termo?.localizacao?.enderecoCompleto ? 'block' : 'none'};">
                            ${termo?.localizacao?.enderecoCompleto ? `
                                <div class="localizacao-selecionada">
                                    <i class="fas fa-map-marked-alt"></i>
                                    <div>
                                        <strong>Endereço:</strong><br>
                                        <small>${termo.localizacao.enderecoCompleto}</small>
                                    </div>
                                </div>
                            ` : ''}
                        </div>

                        <input type="hidden" id="formLocalizacaoJSON" value='${JSON.stringify(termo?.localizacao || {})}'>
                    </div>

                    <!-- ============================================ -->
                    <!-- SEÇÃO 5: ASSINATURA DO GESTOR (OPCIONAL) -->
                    <!-- ============================================ -->
                    <div class="visita-form-section">
                        <div class="visita-form-section-title">
                            <i class="fas fa-signature"></i>
                            <span>Assinatura do Gestor (opcional)</span>
                        </div>
                        <div class="assinatura-wrapper">
                            <div class="assinatura-container">
                                <canvas id="assinaturaGestorCanvas" class="assinatura-canvas"></canvas>
                                <div class="assinatura-placeholder" id="assinaturaGestorPlaceholder">
                                    <i class="fas fa-pen-fancy" style="font-size: 20px;"></i>
                                    <span>Assine aqui</span>
                                </div>
                            </div>
                            <div class="assinatura-actions">
                                <button type="button" class="btn-filter btn-clear" onclick="visitasAdmin.limparAssinaturaGestor()">
                                    <i class="fas fa-eraser"></i> Limpar
                                </button>
                            </div>
                        </div>
                    </div>
                </form>
            </div>
        `;
    }

    // ============================================
    // 🎓 RENDERIZAR LISTA DE ALUNOS PARA SELEÇÃO
    // ============================================
    renderizarListaAlunosSelecao(termo = null) {
        if (!this.alunos || this.alunos.length === 0) {
            return `
                <div style="padding: 30px; text-align: center; color: #9ca3af;">
                    <i class="fas fa-search" style="font-size: 32px; margin-bottom: 10px; display: block;"></i>
                    <p style="margin: 0;">Selecione uma turma para carregar os alunos</p>
                </div>
            `;
        }
        
        return this.alunos.map(aluno => {
            const selecionado = this.formData.alunosSelecionados.includes(aluno.id.toString());
            const iniciais = (aluno.nome || 'A').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
            
            return `
                <div class="aluno-selecao-item ${selecionado ? 'selecionado' : ''}" 
                    data-aluno-id="${aluno.id}"
                    onclick="visitasAdmin.toggleAluno('${aluno.id}')"
                    style="
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        padding: 12px 16px;
                        border-bottom: 1px solid #f3f4f6;
                        cursor: pointer;
                        transition: all 0.2s;
                        ${selecionado ? 'background: #eef2ff; border-left: 4px solid #4f46e5;' : ''}
                    "
                    onmouseover="this.style.background='${selecionado ? '#e0e7ff' : '#f9fafb'}'"
                    onmouseout="this.style.background='${selecionado ? '#eef2ff' : 'white'}'">
                    
                    <input type="checkbox" ${selecionado ? 'checked' : ''} 
                        onclick="event.stopPropagation(); visitasAdmin.toggleAluno('${aluno.id}')"
                        style="width: 20px; height: 20px; cursor: pointer; accent-color: #4f46e5; flex-shrink: 0;">
                    
                    <div style="width: 40px; height: 40px; background: linear-gradient(135deg, #4f46e5, #7c3aed); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; font-size: 14px; flex-shrink: 0;">
                        ${iniciais}
                    </div>
                    
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: 600; color: #1f2937; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${this.escapeHtml(aluno.nome)}
                        </div>
                        <div style="font-size: 11px; color: #6b7280; margin-top: 2px;">
                            <i class="fas fa-id-card"></i> ${aluno.matricula || 'Sem matrícula'}
                            ${aluno.curso ? ` • <i class="fas fa-book"></i> ${aluno.curso}` : ''}
                        </div>
                    </div>
                    
                    ${selecionado ? '<i class="fas fa-check-circle" style="color: #10b981; font-size: 20px; flex-shrink: 0;"></i>' : ''}
                </div>
            `;
        }).join('');
    }

    // ============================================
    // ✅ TOGGLE ALUNO (marcar/desmarcar)
    // ============================================
    toggleAluno(alunoId) {
        alunoId = alunoId.toString();
        const idx = this.formData.alunosSelecionados.indexOf(alunoId);
        
        if (idx >= 0) {
            this.formData.alunosSelecionados.splice(idx, 1);
        } else {
            this.formData.alunosSelecionados.push(alunoId);
        }
        
        this.atualizarListaAlunosSelecao();
    }

    // ============================================
    // ✅ SELECIONAR TODOS OS ALUNOS
    // ============================================
    selecionarTodosAlunos() {
        this.formData.alunosSelecionados = this.alunos.map(a => a.id.toString());
        this.atualizarListaAlunosSelecao();
        this.showToast(`✅ ${this.alunos.length} aluno(s) selecionado(s)`, 'success');
    }

    // ============================================
    // ❌ LIMPAR SELEÇÃO DE ALUNOS
    // ============================================
    limparSelecaoAlunos() {
        this.formData.alunosSelecionados = [];
        this.atualizarListaAlunosSelecao();
    }

    // ============================================
    // 🔄 ATUALIZAR LISTA E CONTADOR DE ALUNOS
    // ============================================
    atualizarListaAlunosSelecao() {
        // Atualizar lista
        const container = document.getElementById('listaAlunosSelecao');
        if (container) {
            container.innerHTML = this.renderizarListaAlunosSelecao();
        }
        
        // Atualizar contador
        const contador = document.getElementById('contadorAlunos');
        if (contador) {
            contador.textContent = `${this.formData.alunosSelecionados.length} selecionado(s)`;
        }
        
        // Atualizar hidden input
        const hidden = document.getElementById('formAlunosIDs');
        if (hidden) {
            hidden.value = JSON.stringify(this.formData.alunosSelecionados);
        }
    }

    // ============================================
    // 👨‍🏫 ADICIONAR PROFESSOR À LISTA
    // ============================================
    adicionarProfessor() {
        const select = document.getElementById('formProfessorSelect');
        if (!select) return;
        
        const professorId = select.value;
        if (!professorId) {
            this.showToast('⚠️ Selecione um professor', 'warning');
            return;
        }
        
        if (this.formData.professoresSelecionados.includes(professorId)) {
            this.showToast('⚠️ Este professor já foi adicionado', 'warning');
            return;
        }
        
        this.formData.professoresSelecionados.push(professorId);
        
        // Resetar select
        select.value = '';
        
        // Atualizar UI
        this.atualizarChipsProfessores();
        
        const professor = this.professores.find(p => p.id === professorId);
        this.showToast(`✅ ${professor?.nome || 'Professor'} adicionado`, 'success');
    }

    // ============================================
    // 🗑️ REMOVER PROFESSOR DA LISTA
    // ============================================
    removerProfessor(professorId) {
        const idx = this.formData.professoresSelecionados.indexOf(professorId);
        if (idx >= 0) {
            this.formData.professoresSelecionados.splice(idx, 1);
            this.atualizarChipsProfessores();
        }
    }

    // ============================================
    // 🎨 RENDERIZAR CHIPS DE PROFESSORES
    // ============================================
    renderizarChipsProfessores() {
        if (this.formData.professoresSelecionados.length === 0) {
            return `
                <div style="padding: 15px; text-align: center; color: #9ca3af; font-size: 13px; background: #f9fafb; border: 2px dashed #e5e7eb; border-radius: 10px;">
                    <i class="fas fa-user-slash" style="margin-right: 6px;"></i>
                    Nenhum professor selecionado
                </div>
            `;
        }
        
        return `
            <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                ${this.formData.professoresSelecionados.map(id => {
                    const p = this.professores.find(prof => prof.id === id);
                    if (!p) return '';
                    
                    return `
                        <div style="display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px; background: linear-gradient(135deg, #667eea, #764ba2); color: white; border-radius: 30px; font-size: 13px; font-weight: 500;">
                            <i class="fas fa-chalkboard-teacher"></i>
                            <span>${this.escapeHtml(p.nome)}</span>
                            <button type="button" 
                                    onclick="visitasAdmin.removerProfessor('${id}')"
                                    style="background: rgba(255,255,255,0.25); border: none; color: white; width: 20px; height: 20px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 10px;">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    // ============================================
    // 🔄 ATUALIZAR CHIPS E CONTADOR DE PROFESSORES
    // ============================================
    atualizarChipsProfessores() {
        const container = document.getElementById('listaProfessoresChips');
        if (container) {
            container.innerHTML = this.renderizarChipsProfessores();
        }
        
        const contador = document.getElementById('contadorProfessores');
        if (contador) {
            contador.textContent = `${this.formData.professoresSelecionados.length} selecionado(s)`;
        }
        
        const hidden = document.getElementById('formProfessoresIDs');
        if (hidden) {
            hidden.value = JSON.stringify(this.formData.professoresSelecionados);
        }
    }

    configurarFormularioTermo(termo) {
        // Busca de local com debounce
        const inputLocal = document.getElementById('formLocal');
        if (inputLocal) {
            let timeout;
            inputLocal.addEventListener('input', (e) => {
                clearTimeout(timeout);
                const query = e.target.value.trim();
                
                if (query.length < 3) {
                    document.getElementById('sugestoesLocal')?.classList.remove('active');
                    return;
                }
                
                timeout = setTimeout(() => this.buscarLocalizacao(query), 600);
            });
            
            inputLocal.addEventListener('blur', () => {
                setTimeout(() => {
                    document.getElementById('sugestoesLocal')?.classList.remove('active');
                }, 200);
            });
        }
        
        // Busca de alunos com debounce
        const inputBuscaAluno = document.getElementById('formBuscaAluno');
        if (inputBuscaAluno) {
            let timeout;
            inputBuscaAluno.addEventListener('input', (e) => {
                clearTimeout(timeout);
                timeout = setTimeout(() => this.buscarAlunos(), 300);
            });
        }
        
        // Inicializar assinatura
        setTimeout(() => this.inicializarAssinaturaGestor(), 200);
        
        // Se for edição, carregar alunos da turma
        if (termo?.turmaPrincipal) {
            setTimeout(() => this.buscarAlunos(), 300);
        }
    }

    // ============================================
    // BUSCAR LOCALIZAÇÃO
    // ============================================
    async buscarLocalizacao(query) {
        try {
            const response = await this.apiRequest(`/api/setor-pedagogico/visitas/buscar-localizacao?query=${encodeURIComponent(query)}`);
            
            const container = document.getElementById('sugestoesLocal');
            if (!container) return;
            
            if (response.success && response.resultados.length > 0) {
                container.innerHTML = response.resultados.map((r, i) => `
                    <div class="localizacao-sugestao-item" onclick='visitasAdmin.selecionarLocalizacao(${JSON.stringify(r).replace(/'/g, "&#39;")})'>
                        <div class="nome">${this.escapeHtml(r.nome)}</div>
                        <div class="endereco">${this.escapeHtml(r.enderecoCompleto)}</div>
                    </div>
                `).join('');
                container.classList.add('active');
            } else {
                container.innerHTML = '<div style="padding: 16px; text-align: center; color: #9ca3af; font-size: 13px;">Nenhum local encontrado</div>';
                container.classList.add('active');
            }
        } catch (error) {
            console.error('❌ Erro ao buscar localização:', error);
        }
    }

    selecionarLocalizacao(local) {
        const inputLocal = document.getElementById('formLocal');
        if (inputLocal) inputLocal.value = local.nome;
        
        document.getElementById('sugestoesLocal').classList.remove('active');
        
        // Salvar dados da localização
        this.formData.localizacao = local;
        document.getElementById('formLocalizacaoJSON').value = JSON.stringify(local);
        
        // Mostrar localização selecionada
        const infoDiv = document.getElementById('localizacaoSelecionada');
        infoDiv.style.display = 'block';
        infoDiv.innerHTML = `
            <div class="localizacao-selecionada">
                <i class="fas fa-map-marked-alt"></i>
                <div>
                    <strong>Endereço:</strong><br>
                    <small>${local.enderecoCompleto}</small>
                </div>
            </div>
        `;
    }

    // ============================================
    // BUSCAR ALUNOS
    // ============================================
    async buscarAlunos() {
        const turma = document.getElementById('formTurma')?.value;
        const curso = document.getElementById('formCurso')?.value;
        const busca = document.getElementById('formBuscaAluno')?.value?.toLowerCase() || '';
        
        if (!turma && !curso) {
            this.alunos = [];
            this.atualizarListaAlunosSelecao();
            return;
        }
        
        try {
            const params = new URLSearchParams();
            if (turma) params.append('turma', turma);
            if (curso) params.append('curso', curso);
            
            const response = await this.apiRequest(`/api/setor-pedagogico/visitas/alunos-por-turma?${params}`);
            
            if (response.success) {
                let alunos = response.alunos || [];
                
                // Filtrar por nome se tiver busca
                if (busca) {
                    alunos = alunos.filter(a => 
                        (a.nome || '').toLowerCase().includes(busca)
                    );
                }
                
                this.alunos = alunos;
                this.atualizarListaAlunosSelecao();
            }
        } catch (error) {
            console.error('❌ Erro ao buscar alunos:', error);
        }
    }

    selecionarAluno(alunoId) {
        // Buscar dados completos do aluno
        const buscarAluno = async () => {
            try {
                const turma = document.getElementById('formTurma')?.value;
                const curso = document.getElementById('formCurso')?.value;
                
                const params = new URLSearchParams();
                if (turma) params.append('turma', turma);
                if (curso) params.append('curso', curso);
                
                const response = await this.apiRequest(`/api/setor-pedagogico/visitas/alunos-por-turma?${params}`);
                const aluno = response.alunos.find(a => a.id === alunoId);
                
                if (aluno) {
                    this.formData.alunoId = aluno.id;
                    this.formData.alunoNome = aluno.nome;
                    this.formData.alunoMatricula = aluno.matricula;
                    this.formData.alunoTurma = aluno.turma;
                    this.formData.alunoCurso = aluno.curso;
                    
                    document.getElementById('formAlunoId').value = aluno.id;
                    document.getElementById('formBuscaAluno').value = aluno.nome;
                    document.getElementById('listaAlunosSugestoes').innerHTML = '';
                    
                    const infoDiv = document.getElementById('alunoSelecionadoInfo');
                    infoDiv.style.display = 'block';
                    infoDiv.innerHTML = `
                        <div class="localizacao-selecionada">
                            <i class="fas fa-check-circle"></i>
                            <div>
                                <strong>${this.escapeHtml(aluno.nome)}</strong><br>
                                <small>Matrícula: ${aluno.matricula || 'N/A'} • Turma: ${aluno.turma || 'N/A'}</small>
                            </div>
                        </div>
                    `;
                }
            } catch (error) {
                console.error('❌ Erro:', error);
            }
        };
        
        buscarAluno();
    }

    // ============================================
    // ASSINATURA DO GESTOR
    // ============================================
    inicializarAssinaturaGestor() {
        const canvas = document.getElementById('assinaturaGestorCanvas');
        if (!canvas) return;
        if (canvas.dataset.init === 'true') return;
        canvas.dataset.init = 'true';
        
        const container = canvas.parentElement;
        const placeholder = document.getElementById('assinaturaGestorPlaceholder');
        
        const ajustarCanvas = () => {
            const rect = canvas.getBoundingClientRect();
            if (rect.width === 0) {
                setTimeout(ajustarCanvas, 200);
                return;
            }
            const dpr = window.devicePixelRatio || 1;
            canvas.width = rect.width * dpr;
            canvas.height = 150 * dpr;
            canvas.style.height = '150px';
            const ctx = canvas.getContext('2d');
            ctx.scale(dpr, dpr);
            ctx.lineWidth = 2.5;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.strokeStyle = '#667eea';
            this.assinatura.canvas = canvas;
            this.assinatura.ctx = ctx;
        };
        
        ajustarCanvas();
        
        const getPos = (e) => {
            const rect = canvas.getBoundingClientRect();
            let clientX, clientY;
            if (e.touches) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else {
                clientX = e.clientX;
                clientY = e.clientY;
            }
            return { x: clientX - rect.left, y: clientY - rect.top };
        };
        
        const iniciar = (e) => {
            e.preventDefault();
            this.assinatura.desenhando = true;
            const pos = getPos(e);
            this.assinatura.lastX = pos.x;
            this.assinatura.lastY = pos.y;
            this.assinatura.temAssinatura = true;
            if (container) container.classList.add('ativa');
            if (placeholder) placeholder.classList.add('escondido');
        };
        
        const desenhar = (e) => {
            if (!this.assinatura.desenhando) return;
            e.preventDefault();
            const pos = getPos(e);
            this.assinatura.ctx.beginPath();
            this.assinatura.ctx.moveTo(this.assinatura.lastX, this.assinatura.lastY);
            this.assinatura.ctx.lineTo(pos.x, pos.y);
            this.assinatura.ctx.stroke();
            this.assinatura.lastX = pos.x;
            this.assinatura.lastY = pos.y;
        };
        
        const parar = (e) => {
            if (e && e.preventDefault) e.preventDefault();
            this.assinatura.desenhando = false;
            if (container) container.classList.remove('ativa');
        };
        
        canvas.addEventListener('mousedown', iniciar);
        canvas.addEventListener('mousemove', desenhar);
        canvas.addEventListener('mouseup', parar);
        canvas.addEventListener('mouseleave', () => {
            if (this.assinatura.desenhando) parar();
        });
        canvas.addEventListener('touchstart', iniciar, { passive: false });
        canvas.addEventListener('touchmove', desenhar, { passive: false });
        canvas.addEventListener('touchend', parar, { passive: false });
    }

    limparAssinaturaGestor() {
        if (!this.assinatura.canvas || !this.assinatura.ctx) return;
        const rect = this.assinatura.canvas.getBoundingClientRect();
        this.assinatura.ctx.clearRect(0, 0, rect.width, rect.height);
        this.assinatura.temAssinatura = false;
        const placeholder = document.getElementById('assinaturaGestorPlaceholder');
        if (placeholder) placeholder.classList.remove('escondido');
    }

    // ============================================
    // SALVAR TERMO
    // ============================================
    async salvarTermo(termoId = null) {
        try {
            // 🔥 Coletar alunos selecionados
            const alunosIDs = this.formData.alunosSelecionados;
            const professoresIDs = this.formData.professoresSelecionados;
            
            const atividade = document.getElementById('formAtividade')?.value;
            const periodo = document.getElementById('formPeriodo')?.value;
            const horario = document.getElementById('formHorario')?.value;
            const local = document.getElementById('formLocal')?.value;
            const dataVisita = document.getElementById('formDataVisita')?.value;
            const cidade = document.getElementById('formCidade')?.value;
            const localizacaoJSON = document.getElementById('formLocalizacaoJSON')?.value;
            
            // ============ VALIDAÇÕES ============
            if (alunosIDs.length === 0) {
                return this.showToast('❌ Selecione pelo menos 1 aluno', 'error');
            }
            if (professoresIDs.length === 0) {
                return this.showToast('❌ Selecione pelo menos 1 professor', 'error');
            }
            if (!atividade) return this.showToast('❌ Informe a atividade', 'error');
            if (!periodo) return this.showToast('❌ Selecione o período', 'error');
            if (!horario) return this.showToast('❌ Informe o horário', 'error');
            if (!local) return this.showToast('❌ Informe o local', 'error');
            if (!dataVisita) return this.showToast('❌ Informe a data', 'error');
            
            let localizacao = {};
            try {
                localizacao = JSON.parse(localizacaoJSON || '{}');
            } catch (e) {}
            
            const dados = {
                alunos: alunosIDs,           // ← Array
                professores: professoresIDs, // ← Array
                atividade,
                periodo,
                horario,
                local,
                localizacao,
                dataVisita,
                cidade: cidade || 'São Luís'
            };
            
            const url = termoId 
                ? `/api/setor-pedagogico/visitas/termos/${termoId}`
                : '/api/setor-pedagogico/visitas/termos';
            
            const method = termoId ? 'PUT' : 'POST';
            
            this.showToast('💾 Salvando...', 'info');
            
            const response = await this.apiRequest(url, {
                method,
                body: JSON.stringify(dados)
            });
            
            if (response.success) {
                this.showToast(`✅ Termo ${termoId ? 'atualizado' : 'criado'}!`, 'success');
                
                // Adicionar assinatura do gestor se tiver
                if (this.assinatura.temAssinatura) {
                    const assinaturaBase64 = this.assinatura.canvas.toDataURL('image/png');
                    const novoTermoId = termoId || response.termo._id;
                    
                    await this.apiRequest(`/api/setor-pedagogico/visitas/termos/${novoTermoId}/assinar-gestor`, {
                        method: 'POST',
                        body: JSON.stringify({ assinaturaBase64 })
                    });
                }
                
                this.closeModal();
                
                // Resetar formulário
                this.formData = {
                    alunosSelecionados: [],
                    professoresSelecionados: [],
                    localizacao: null
                };
                
                await this.carregarTermos();
                this.renderizar();
            } else {
                throw new Error(response.error || 'Erro ao salvar');
            }
        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    // ============================================
    // AÇÕES
    // ============================================
    async verDetalhes(termoId) {
        try {
            const response = await this.apiRequest(`/api/setor-pedagogico/visitas/termos/${termoId}`);
            if (!response.success) throw new Error('Termo não encontrado');
            
            const t = response.termo;
            const dataVisita = t.dataVisita 
                ? new Date(t.dataVisita).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
                : 'N/A';
            
            document.getElementById('modalTitle').innerHTML = `<i class="fas fa-eye"></i> ${t.codigo}`;
            
            document.getElementById('modalBody').innerHTML = `
                <div style="padding: 10px;">
                    
                    <!-- STATUS -->
                    <div style="text-align: center; margin-bottom: 20px;">
                        <span class="termo-status-badge ${t.status}" style="font-size: 14px; padding: 8px 20px;">
                            ${t.status === 'pendente' ? '⏳ PENDENTE' : 
                            t.status === 'autorizado' ? '✅ AUTORIZADO' : 
                            t.status === 'parcialmente_autorizado' ? '🔶 PARCIALMENTE AUTORIZADO' :
                            '❌ RECUSADO'}
                        </span>
                    </div>
                    
                    <!-- ATIVIDADE -->
                    <div style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 15px; border-radius: 12px; margin-bottom: 20px;">
                        <div style="font-size: 11px; opacity: 0.85;">ATIVIDADE</div>
                        <div style="font-size: 16px; font-weight: 600;">${this.escapeHtml(t.atividade)}</div>
                    </div>
                    
                    <!-- ALUNOS -->
                    <div style="background: #f8fafc; border-radius: 12px; padding: 15px; margin-bottom: 15px; border: 1px solid #e2e8f0;">
                        <h4 style="margin: 0 0 12px; font-size: 15px; color: #1e293b; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-user-graduate" style="color: #4f46e5;"></i>
                            Alunos Participantes
                            <span style="background: #4f46e5; color: white; padding: 2px 10px; border-radius: 20px; font-size: 11px; margin-left: auto;">
                                ${t.alunos?.length || 0}
                            </span>
                        </h4>
                        <div style="display: flex; flex-direction: column; gap: 8px;">
                            ${(t.alunos || []).map(a => `
                                <div style="display: flex; align-items: center; gap: 10px; padding: 10px; background: white; border-radius: 8px; border-left: 3px solid #4f46e5;">
                                    <div style="width: 36px; height: 36px; background: linear-gradient(135deg, #4f46e5, #7c3aed); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; font-size: 13px; flex-shrink: 0;">
                                        ${(a.nome || 'A').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                                    </div>
                                    <div style="flex: 1; min-width: 0;">
                                        <div style="font-weight: 600; color: #1f2937; font-size: 13px;">${this.escapeHtml(a.nome)}</div>
                                        <div style="font-size: 11px; color: #6b7280;">
                                            <i class="fas fa-id-card"></i> ${a.matricula || 'Sem matrícula'}
                                            ${a.turma ? ` • <i class="fas fa-school"></i> ${a.turma}` : ''}
                                            ${a.curso ? ` • <i class="fas fa-book"></i> ${a.curso}` : ''}
                                        </div>
                                    </div>
                                </div>
                            `).join('') || '<p style="text-align: center; color: #9ca3af;">Nenhum aluno</p>'}
                        </div>
                    </div>
                    
                    <!-- PROFESSORES -->
                    <div style="background: #fef3c7; border-radius: 12px; padding: 15px; margin-bottom: 15px; border: 1px solid #fde68a;">
                        <h4 style="margin: 0 0 12px; font-size: 15px; color: #92400e; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-chalkboard-teacher"></i>
                            Professores Coordenadores
                            <span style="background: #d97706; color: white; padding: 2px 10px; border-radius: 20px; font-size: 11px; margin-left: auto;">
                                ${t.professores?.length || 0}
                            </span>
                        </h4>
                        <div style="display: flex; flex-direction: column; gap: 8px;">
                            ${(t.professores || []).map(p => `
                                <div style="display: flex; align-items: center; gap: 10px; padding: 10px; background: white; border-radius: 8px; border-left: 3px solid #f59e0b;">
                                    <i class="fas fa-user-tie" style="color: #d97706; font-size: 20px; width: 36px; text-align: center;"></i>
                                    <div style="flex: 1;">
                                        <div style="font-weight: 600; color: #1f2937; font-size: 13px;">${this.escapeHtml(p.nome)}</div>
                                        <div style="font-size: 11px; color: #6b7280;">
                                            ${p.matricula ? `<i class="fas fa-id-card"></i> ${p.matricula}` : ''}
                                            ${p.eixo ? ` • ${p.eixo}` : ''}
                                        </div>
                                    </div>
                                </div>
                            `).join('') || '<p style="text-align: center; color: #9ca3af;">Nenhum professor</p>'}
                        </div>
                    </div>
                    
                    <!-- DETALHES -->
                    <div style="background: #f8fafc; border-radius: 12px; padding: 15px; margin-bottom: 15px; border: 1px solid #e2e8f0;">
                        <h4 style="margin: 0 0 12px; font-size: 15px; color: #1e293b;">
                            <i class="fas fa-info-circle"></i> Detalhes
                        </h4>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px;">
                            <div><strong>Data:</strong> ${dataVisita}</div>
                            <div><strong>Horário:</strong> ${t.horario || 'N/A'}</div>
                            <div><strong>Período:</strong> ${t.periodo || 'N/A'}</div>
                            <div><strong>Cidade:</strong> ${t.cidade || 'N/A'}</div>
                            <div style="grid-column: span 2;"><strong>Local:</strong> ${this.escapeHtml(t.local || 'N/A')}</div>
                            ${t.localizacao?.enderecoCompleto ? `
                                <div style="grid-column: span 2;">
                                    <strong>Endereço:</strong><br>
                                    <small style="color: #6b7280;">${this.escapeHtml(t.localizacao.enderecoCompleto)}</small>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                    
                    <!-- RESPONSÁVEIS (AUTORIZAÇÕES) -->
                    ${t.responsaveis && t.responsaveis.length > 0 ? `
                        <div style="background: #f0fdf4; border-radius: 12px; padding: 15px; margin-bottom: 15px; border: 1px solid #bbf7d0;">
                            <h4 style="margin: 0 0 12px; font-size: 15px; color: #065f46; display: flex; align-items: center; gap: 8px;">
                                <i class="fas fa-user-check"></i>
                                Autorizações dos Responsáveis
                                <span style="background: #10b981; color: white; padding: 2px 10px; border-radius: 20px; font-size: 11px; margin-left: auto;">
                                    ${t.responsaveisAutorizados || 0}/${t.responsaveis.length}
                                </span>
                            </h4>
                            <div style="display: flex; flex-direction: column; gap: 8px;">
                                ${t.responsaveis.map(r => `
                                    <div style="display: flex; align-items: center; gap: 10px; padding: 10px; background: white; border-radius: 8px; border-left: 3px solid ${
                                        r.status === 'autorizado' ? '#10b981' : 
                                        r.status === 'recusado' ? '#ef4444' : '#f59e0b'
                                    };">
                                        <div style="flex: 1;">
                                            <div style="font-weight: 600; font-size: 13px; color: #1f2937;">
                                                ${this.escapeHtml(r.alunoNome || 'Aluno')}
                                            </div>
                                            <div style="font-size: 11px; color: #6b7280;">
                                                ${r.nome ? `Resp: ${this.escapeHtml(r.nome)}` : 'Aguardando responsável'}
                                            </div>
                                        </div>
                                        <span style="padding: 3px 10px; border-radius: 20px; font-size: 10px; font-weight: 600; ${
                                            r.status === 'autorizado' ? 'background: #d1fae5; color: #065f46;' :
                                            r.status === 'recusado' ? 'background: #fee2e2; color: #991b1b;' :
                                            'background: #fef3c7; color: #92400e;'
                                        }">
                                            ${r.status === 'autorizado' ? '✅ AUTORIZADO' :
                                            r.status === 'recusado' ? '❌ RECUSADO' : '⏳ PENDENTE'}
                                        </span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                    
                    <!-- BOTÃO IMPRIMIR -->
                    <div style="text-align: center; margin-top: 20px;">
                        <button class="btn-filter" onclick="visitasAdmin.imprimirTermo('${t._id}')">
                            <i class="fas fa-print"></i> Imprimir Termo
                        </button>
                    </div>
                </div>
            `;
            
            document.getElementById('modalSaveBtn').style.display = 'none';
            this.openModal();
        } catch (error) {
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    editarTermo(termoId) {
        this.abrirModalNovoTermo(termoId);
    }

    async excluirTermo(termoId) {
        const confirmar = await this.confirmar(
            'Excluir Termo',
            'Tem certeza que deseja excluir este termo? Esta ação não pode ser desfeita.'
        );
        
        if (!confirmar) return;
        
        try {
            const response = await this.apiRequest(`/api/setor-pedagogico/visitas/termos/${termoId}`, {
                method: 'DELETE'
            });
            
            if (response.success) {
                this.showToast('✅ Termo excluído!', 'success');
                await this.carregarTermos();
                this.renderizar();
            } else {
                throw new Error(response.error);
            }
        } catch (error) {
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    // ============================================
    // 🖨️ IMPRIMIR TERMO OFICIAL (mesmo endpoint do público)
    // ============================================
    async imprimirTermo(termoId) {
        try {
            // 🔥 Se o termo ainda não foi autorizado, avisar
            const termoResponse = await this.apiRequest(`/api/setor-pedagogico/visitas/termos/${termoId}`);
            const termo = termoResponse.termo;
            
            if (!termo) {
                throw new Error('Termo não encontrado');
            }
            
            // Verificar se tem pelo menos 1 autorização
            const autorizados = (termo.responsaveis || []).filter(r => r.status === 'autorizado');
            
            if (autorizados.length === 0) {
                const confirmar = await this.confirmar(
                    '⚠️ Termo sem autorização',
                    'Este termo ainda não foi autorizado por nenhum responsável. Deseja imprimir mesmo assim (sem assinatura do responsável)?'
                );
                
                if (!confirmar) return;
            }
            
            this.showToast('📄 Gerando termo...', 'info');
            
            // 🔥 Usar o MESMO endpoint público (garante mesmo layout)
            const response = await fetch(`/api/visitas-publico/termo-oficial/${termoId}`);
            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.error || 'Erro ao gerar termo');
            }
            
            const win = window.open('', '_blank');
            win.document.write(data.html);
            win.document.close();
            
            win.onload = () => {
                setTimeout(() => {
                    win.print();
                }, 800);
            };
            
        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    // ============================================
    // 🖨️ IMPRIMIR TODOS OS TERMOS (EM LOTE)
    // ============================================
    async imprimirTodosTermos() {
        try {
            if (!this.termosFiltrados || this.termosFiltrados.length === 0) {
                this.showToast('⚠️ Nenhum termo para imprimir', 'warning');
                return;
            }
            
            const total = this.termosFiltrados.length;
            
            // 🔥 Aviso para muitos termos
            if (total > 50) {
                const continuar = await this.confirmar(
                    '⚠️ Muitos Termos',
                    `${total} termos serão gerados. Isso pode demorar um pouco.\n\nDeseja continuar?`
                );
                if (!continuar) return;
            }
            
            const filtrosAtivos = this.filtros.status !== 'todos' 
                || this.filtros.turma !== 'todas' 
                || this.filtros.search;
            
            const mensagem = filtrosAtivos
                ? `Deseja imprimir os ${total} termo(s) FILTRADO(S)?\n\nFiltros ativos:\n• Status: ${this.filtros.status}\n• Turma: ${this.filtros.turma}\n• Busca: ${this.filtros.search || 'nenhuma'}`
                : `Deseja imprimir TODOS os ${total} termo(s)?`;
            
            const confirmar = await this.confirmar('🖨️ Impressão em Lote', mensagem);
            if (!confirmar) return;
            
            this.showToast(`📄 Gerando ${total} termo(s)... Aguarde`, 'info');
            
            const ids = this.termosFiltrados.map(t => t._id);
            
            // 🔥 Chamar endpoint em lote
            const response = await this.apiRequest('/api/visitas-publico/termos-oficiais-lote', {
                method: 'POST',
                body: JSON.stringify({ 
                    termoIds: ids,
                    incluirSemAutorizacao: true
                })
            });
            
            if (!response.success) {
                // Fallback: buscar termo por termo
                console.warn('⚠️ Endpoint em lote falhou, usando fallback...');
                return this.imprimirTermosFallback(ids);
            }
            
            // 🔥 Abrir janela com o HTML pronto
            const win = window.open('', '_blank');
            win.document.write(response.html);
            win.document.close();
            
            win.onload = () => {
                setTimeout(() => {
                    win.focus();
                    win.print();
                }, 1200);
            };
            
            const aviso = response.ignorados > 0 
                ? ` (${response.ignorados} ignorado(s) sem autorização)`
                : '';
            
            this.showToast(`✅ ${response.total} termo(s) gerado(s)${aviso}!`, 'success');
            
        } catch (error) {
            console.error('❌ Erro ao imprimir termos:', error);
            this.showToast('❌ Erro ao imprimir: ' + error.message, 'error');
        }
    }

    // ============================================
    // 🔄 FALLBACK: IMPRIMIR TERMOS UM POR UM
    // ============================================
    async imprimirTermosFallback(ids) {
        try {
            this.showToast(`📄 Carregando ${ids.length} termo(s)...`, 'info');
            
            // 🔥 Buscar todos os termos em paralelo
            const respostas = await Promise.all(
                ids.map(id => 
                    fetch(`/api/visitas-publico/termo-oficial/${id}`)
                        .then(r => r.json())
                        .catch(() => null)
                )
            );
            
            // Filtrar apenas sucessos
            const termosValidos = respostas.filter(r => r && r.success && r.html);
            
            if (termosValidos.length === 0) {
                throw new Error('Nenhum termo pôde ser gerado');
            }
            
            // 🔥 Montar HTML único com todos os termos + quebras de página
            const htmlsComQuebra = termosValidos.map((r, index) => {
                // Extrair apenas o conteúdo do <body>
                const bodyMatch = r.html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
                const conteudo = bodyMatch ? bodyMatch[1] : r.html;
                
                return `
                    <div style="page-break-after: always; ${index === termosValidos.length - 1 ? 'page-break-after: auto;' : ''}">
                        ${conteudo}
                    </div>
                `;
            }).join('');
            
            // 🔥 Extrair o <head> do primeiro termo (CSS)
            const headMatch = termosValidos[0].html.match(/<head[^>]*>([\s\S]*)<\/head>/i);
            const head = headMatch ? headMatch[1] : '';
            
            // 🔥 HTML final
            const htmlFinal = `
                <!DOCTYPE html>
                <html lang="pt-BR">
                <head>
                    <meta charset="UTF-8">
                    <title>Termos de Visita - Impressão em Lote</title>
                    ${head}
                    <style>
                        /* 🔥 Garantir quebra de página entre termos */
                        .termo-print {
                            page-break-after: always;
                            page-break-inside: avoid;
                        }
                        .termo-print:last-child {
                            page-break-after: auto;
                        }
                        
                        @media print {
                            body { margin: 0; padding: 0; }
                            .termo-print { page-break-after: always; }
                            .termo-print:last-child { page-break-after: auto; }
                        }
                    </style>
                </head>
                <body>
                    ${termosValidos.map((r, index) => {
                        const bodyMatch = r.html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
                        const conteudo = bodyMatch ? bodyMatch[1] : r.html;
                        
                        return `
                            <div class="termo-print">
                                ${conteudo}
                            </div>
                        `;
                    }).join('')}
                </body>
                </html>
            `;
            
            // 🔥 Abrir janela e imprimir
            const win = window.open('', '_blank');
            win.document.write(htmlFinal);
            win.document.close();
            
            win.onload = () => {
                setTimeout(() => {
                    win.focus();
                    win.print();
                }, 1000);
            };
            
            this.showToast(`✅ ${termosValidos.length} termo(s) pronto(s) para impressão!`, 'success');
            
        } catch (error) {
            console.error('❌ Erro no fallback:', error);
            this.showToast('❌ Erro ao gerar termos: ' + error.message, 'error');
        }
    }

    gerarHTMLImpressao(t) {
        const dataVisita = new Date(t.dataVisita).toLocaleDateString('pt-BR', {
            day: '2-digit', month: 'long', year: 'numeric'
        });
        
        return `
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <title>Termo de Visita - ${t.codigo}</title>
                <style>
                    @page { size: A4 portrait; margin: 15mm; }
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; line-height: 1.6; padding: 15mm; }
                    
                    .header { text-align: center; border-bottom: 3px double #000; padding-bottom: 15px; margin-bottom: 30px; }
                    .header h1 { font-size: 14pt; text-transform: uppercase; margin-bottom: 5px; }
                    .header h2 { font-size: 12pt; font-weight: normal; }
                    .header img { max-height: 60px; margin-bottom: 10px; }
                    
                    .titulo { text-align: center; font-size: 16pt; font-weight: bold; text-transform: uppercase; margin: 30px 0; padding: 15px; background: #f0f0f0; border: 2px solid #000; }
                    
                    .conteudo { text-align: justify; font-size: 12pt; line-height: 2; margin: 30px 0; }
                    .conteudo strong { text-decoration: underline; }
                    
                    .destaque { background: #f9f9f9; padding: 3px 8px; border-bottom: 1px solid #333; font-weight: bold; }
                    
                    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 20px 0; padding: 15px; background: #f8f8f8; border: 1px solid #ccc; }
                    .info-item { font-size: 11pt; }
                    .info-item strong { display: block; font-size: 9pt; color: #666; text-transform: uppercase; margin-bottom: 3px; }
                    
                    .cidade-data { text-align: right; margin: 40px 0 30px; font-size: 12pt; }
                    
                    .assinaturas { display: flex; justify-content: space-between; gap: 40px; margin-top: 60px; }
                    .assinatura { flex: 1; text-align: center; }
                    .assinatura-linha { border-top: 1px solid #000; padding-top: 8px; font-size: 11pt; margin-top: 60px; }
                    .assinatura-img { max-height: 60px; max-width: 200px; }
                    
                    .rodape { position: fixed; bottom: 10mm; left: 15mm; right: 15mm; text-align: center; font-size: 8pt; color: #666; border-top: 1px solid #ccc; padding-top: 5px; }
                    
                    @media print { .no-print { display: none; } }
                </style>
            </head>
            <body>
                <div class="header">
                    <img src="/uploads/logo-iema.png" alt="IEMA" onerror="this.style.display='none'">
                    <h1>IEMA Pleno: São Luís - Centro</h1>
                    <h2>Sistema de Autorização de Visitas Técnicas</h2>
                </div>
                
                <div class="titulo">Termo de Autorização de Visita Técnica</div>
                
                <div style="text-align: center; margin-bottom: 20px; font-size: 10pt; color: #666;">
                    Código: <strong>${t.codigo}</strong>
                </div>
                
                <div class="conteudo">
                    <p>Eu, <span class="destaque">${t.responsavel?.nome || '_______________________________________'}</span>, 
                    portador(a) do RG nº <span class="destaque">${t.responsavel?.rg || '_________________'}</span> e 
                    CPF nº <span class="destaque">${t.responsavel?.cpf || '___.___.___-__'}</span>, 
                    responsável legal pelo(a) aluno(a) <span class="destaque">${t.alunoNome}</span>, 
                    matriculado(a) no curso <span class="destaque">${t.alunoCurso || 'N/A'}</span> 
                    na turma <span class="destaque">${t.alunoTurma || 'N/A'}</span>,</p>
                    
                    <p style="margin-top: 20px;">
                        <strong>AUTORIZO</strong> a participação do(a) referido(a) aluno(a) na atividade 
                        <span class="destaque">${t.atividade}</span>, 
                        a ser realizada no dia <span class="destaque">${dataVisita}</span>, 
                        no período <span class="destaque">${t.periodo}</span>, 
                        no horário <span class="destaque">${t.horario}</span>, 
                        no local <span class="destaque">${t.local}</span>,
                        sob coordenação do(a) professor(a) <span class="destaque">${t.professorNome}</span>.
                    </p>
                    
                    ${t.localizacao?.enderecoCompleto ? `
                        <p style="margin-top: 15px; font-size: 10pt; color: #555;">
                            <strong>Endereço:</strong> ${t.localizacao.enderecoCompleto}
                        </p>
                    ` : ''}
                    
                    <p style="margin-top: 20px;">
                        Declaro estar ciente das normas e responsabilidades referentes a esta atividade, 
                        bem como das medidas de segurança adotadas pela instituição.
                    </p>
                </div>
                
                <div class="cidade-data">
                    ${t.cidade || 'São Luís'} - MA, ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                </div>
                
                <div class="assinaturas">
                    <div class="assinatura">
                        ${t.responsavel?.assinaturaBase64 ? `<img src="${t.responsavel.assinaturaBase64}" class="assinatura-img">` : ''}
                        <div class="assinatura-linha">
                            <strong>${t.responsavel?.nome || 'Responsável Legal'}</strong><br>
                            <small>Responsável pelo Aluno</small>
                        </div>
                    </div>
                    <div class="assinatura">
                        ${t.assinaturaGestor?.base64 ? `<img src="${t.assinaturaGestor.base64}" class="assinatura-img">` : ''}
                        <div class="assinatura-linha">
                            <strong>${t.assinaturaGestor?.nome || 'Gestor Pedagógico'}</strong><br>
                            <small>Gestor Pedagógico</small>
                        </div>
                    </div>
                </div>
                
                <div class="rodape">
                    Documento gerado em ${new Date().toLocaleString('pt-BR')} - EducaPleno
                </div>
            </body>
            </html>
        `;
    }

    // ============================================
    // UTILITÁRIOS
    // ============================================
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showToast(mensagem, tipo = 'info') {
        if (typeof window.setorPedagogico !== 'undefined' && window.setorPedagogico.showToast) {
            window.setorPedagogico.showToast(mensagem, tipo);
        } else {
            console.log(`[${tipo}] ${mensagem}`);
        }
    }

    confirmar(titulo, mensagem) {
        return new Promise((resolve) => {
            if (typeof window.setorPedagogico !== 'undefined' && window.setorPedagogico.confirmarAcao) {
                window.setorPedagogico.confirmarAcao(mensagem).then(resolve);
            } else {
                resolve(window.confirm(mensagem));
            }
        });
    }

    // ============================================
    // 🔗 COPIAR LINK PÚBLICO
    // ============================================
    async copiarLinkPublico() {
        const link = `${window.location.origin}/visitas-publico.html`;
        
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(link);
            } else {
                // Fallback para HTTP ou navegadores antigos
                const textarea = document.createElement('textarea');
                textarea.value = link;
                textarea.style.position = 'fixed';
                textarea.style.left = '-999999px';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
            }
            
            this.showToast('✅ Link copiado para a área de transferência!', 'success');
        } catch (error) {
            console.error('Erro ao copiar:', error);
            // Mostrar link para copiar manualmente
            prompt('Copie o link abaixo:', link);
        }
    }

    // ============================================
    // 🌐 ABRIR PÁGINA PÚBLICA EM NOVA ABA
    // ============================================
    abrirPaginaPublica() {
        const url = `${window.location.origin}/visitas-publico.html`;
        window.open(url, '_blank');
    }

    // ============================================
    // 📱 ABRIR MODAL DE QR CODE
    // ============================================
    abrirQRCodePublico() {
        const url = `${window.location.origin}/visitas-publico.html`;
        const modalBody = document.getElementById('modalBody');
        const modalTitle = document.getElementById('modalTitle');
        const modalSaveBtn = document.getElementById('modalSaveBtn');
        
        modalTitle.innerHTML = '<i class="fas fa-qrcode"></i> QR Code - Página Pública';
        
        modalBody.innerHTML = `
            <div style="padding: 20px; text-align: center;">
                <p style="color: #6b7280; margin-bottom: 20px; font-size: 14px;">
                    <i class="fas fa-mobile-alt"></i> 
                    Peça para os responsáveis escanearem este QR Code para autorizar a visita
                </p>
                
                <div id="qrCodeContainerVisitas" style="
                    background: white;
                    padding: 25px;
                    border-radius: 20px;
                    border: 3px solid #3b82f6;
                    display: inline-block;
                    margin-bottom: 20px;
                    box-shadow: 0 10px 30px rgba(59, 130, 246, 0.2);
                ">
                    <div id="qrCodeLoadingVisitas" style="
                        width: 280px; height: 280px;
                        display: flex; align-items: center; justify-content: center;
                        flex-direction: column;
                        color: #9ca3af;
                    ">
                        <i class="fas fa-spinner fa-spin" style="font-size: 48px; color: #3b82f6; margin-bottom: 15px;"></i>
                        <p style="font-size: 13px;">Gerando QR Code...</p>
                    </div>
                    <img id="qrCodeImgVisitas" src="" alt="QR Code" 
                        style="width: 280px; height: 280px; display: none; border-radius: 12px;">
                </div>
                
                <div style="
                    background: #f3f4f6;
                    border-radius: 12px;
                    padding: 12px 16px;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    max-width: 500px;
                    margin: 0 auto 20px;
                    font-size: 12px;
                    word-break: break-all;
                ">
                    <i class="fas fa-link" style="color: #3b82f6; flex-shrink: 0;"></i>
                    <span id="qrCodeUrlTextoVisitas" style="color: #4b5563; flex: 1; text-align: left; font-family: monospace;">
                        ${url}
                    </span>
                </div>
                
                <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                    <button class="btn-filter" onclick="visitasAdmin.baixarQRCode()" style="padding: 10px 20px;">
                        <i class="fas fa-download"></i> Baixar QR Code
                    </button>
                    <button class="btn-filter" onclick="visitasAdmin.imprimirQRCode()" 
                            style="padding: 10px 20px; background: #8b5cf6;">
                        <i class="fas fa-print"></i> Imprimir
                    </button>
                    <button class="btn-filter btn-clear" onclick="visitasAdmin.copiarLinkPublico()" style="padding: 10px 20px;">
                        <i class="fas fa-copy"></i> Copiar Link
                    </button>
                </div>
            </div>
        `;
        
        modalSaveBtn.style.display = 'none';
        this.openModal();
        
        // Gerar QR Code
        this.gerarQRCode(url);
    }

    // ============================================
    // 📱 GERAR QR CODE (via API interna)
    // ============================================
    async gerarQRCode(url) {
        try {
            const QRCodeLib = window.QRCode || (typeof QRCode !== 'undefined' ? QRCode : null);
            
            // Tentar usar biblioteca local se disponível
            if (QRCodeLib && typeof QRCodeLib.toDataURL === 'function') {
                const dataUrl = await QRCodeLib.toDataURL(url, {
                    errorCorrectionLevel: 'H',
                    margin: 1,
                    width: 400,
                    color: { dark: '#1e40af', light: '#ffffff' }
                });
                this.mostrarQRCode(dataUrl);
                return;
            }
            
            // Fallback: usar API externa
            const apiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(url)}&color=1e40af&bgcolor=ffffff`;
            
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                this.mostrarQRCode(img.src);
            };
            img.onerror = () => {
                // Último fallback: usar a URL direta
                this.mostrarQRCode(apiUrl);
            };
            img.src = apiUrl;
            
        } catch (error) {
            console.error('Erro ao gerar QR Code:', error);
            document.getElementById('qrCodeLoadingVisitas').innerHTML = `
                <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #ef4444; margin-bottom: 15px;"></i>
                <p style="color: #ef4444; font-size: 13px;">Erro ao gerar QR Code</p>
            `;
        }
    }

    mostrarQRCode(dataUrl) {
        const loading = document.getElementById('qrCodeLoadingVisitas');
        const img = document.getElementById('qrCodeImgVisitas');
        
        if (loading) loading.style.display = 'none';
        if (img) {
            img.src = dataUrl;
            img.style.display = 'block';
            img.setAttribute('data-qrcode-url', dataUrl);
        }
    }

    // ============================================
    // 💾 BAIXAR QR CODE COMO IMAGEM
    // ============================================
    baixarQRCode() {
        const img = document.getElementById('qrCodeImgVisitas');
        if (!img || !img.src) {
            this.showToast('❌ QR Code não está pronto', 'error');
            return;
        }
        
        const link = document.createElement('a');
        link.download = `qrcode-visitas-${new Date().toISOString().split('T')[0]}.png`;
        link.href = img.src;
        link.click();
        
        this.showToast('✅ QR Code baixado!', 'success');
    }

    // ============================================
    // 🖨️ IMPRIMIR QR CODE
    // ============================================
    imprimirQRCode() {
        const img = document.getElementById('qrCodeImgVisitas');
        if (!img || !img.src) {
            this.showToast('❌ QR Code não está pronto', 'error');
            return;
        }
        
        const url = `${window.location.origin}/visitas-publico.html`;
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>QR Code - Autorização de Visitas</title>
                <style>
                    @page { size: A4; margin: 20mm; }
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body {
                        font-family: Arial, sans-serif;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        min-height: 100vh;
                        padding: 40px;
                        text-align: center;
                    }
                    .container {
                        border: 3px solid #1e40af;
                        border-radius: 20px;
                        padding: 40px;
                        max-width: 500px;
                        width: 100%;
                        background: #f0f9ff;
                    }
                    h1 {
                        color: #1e40af;
                        font-size: 22px;
                        margin-bottom: 10px;
                    }
                    h2 {
                        color: #3b82f6;
                        font-size: 16px;
                        font-weight: normal;
                        margin-bottom: 25px;
                    }
                    img {
                        width: 300px;
                        height: 300px;
                        border: 2px solid #e5e7eb;
                        border-radius: 15px;
                        padding: 15px;
                        background: white;
                        margin: 20px 0;
                    }
                    .url {
                        background: white;
                        padding: 12px;
                        border-radius: 8px;
                        font-family: monospace;
                        font-size: 11px;
                        color: #4b5563;
                        word-break: break-all;
                        margin-top: 15px;
                        border: 1px solid #e5e7eb;
                    }
                    .instrucoes {
                        background: #fef3c7;
                        border-left: 4px solid #f59e0b;
                        padding: 15px;
                        border-radius: 8px;
                        margin-top: 20px;
                        text-align: left;
                        font-size: 13px;
                        color: #92400e;
                    }
                    .instrucoes strong { color: #78350f; }
                    .instrucoes ol { margin: 8px 0 0 20px; }
                    .instrucoes li { margin-bottom: 4px; }
                    @media print {
                        body { padding: 0; }
                        .container { border: 2px solid #1e40af; }
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>📱 Autorização de Visitas</h1>
                    <h2>Escaneie o QR Code para autorizar</h2>
                    
                    <img src="${img.src}" alt="QR Code">
                    
                    <div class="url">${url}</div>
                    
                    <div class="instrucoes">
                        <strong>📋 Como usar:</strong>
                        <ol>
                            <li>Abra a câmera do seu celular</li>
                            <li>Aponte para o QR Code</li>
                            <li>Toque no link que aparecer</li>
                            <li>Autorize a participação do aluno</li>
                        </ol>
                    </div>
                </div>
            </body>
            </html>
        `;
        
        const win = window.open('', '_blank');
        win.document.write(html);
        win.document.close();
        win.onload = () => setTimeout(() => win.print(), 500);
    }

    // ============================================
    // 🔄 TOGGLE VISITAS ABERTAS (Config da página pública)
    // ============================================
    async toggleVisitasPublicas(abertas) {
        try {
            const response = await this.apiRequest('/api/setor-pedagogico/visitas/configuracao', {
                method: 'PUT',
                body: JSON.stringify({ visitasAbertas: abertas })
            });
            
            if (response.success) {
                this.configuracao = response.configuracao;
                this.showToast(
                    abertas ? '✅ Autorizações ABERTAS para os responsáveis' : '🔒 Autorizações FECHADAS',
                    'success'
                );
                
                // Atualizar label
                const label = document.querySelector('label:has(#toggleVisitasPublicas) span');
                if (label) {
                    label.textContent = abertas ? '🟢 Autorizações Abertas' : '🔴 Autorizações Fechadas';
                }
            }
        } catch (error) {
            console.error('Erro:', error);
            this.showToast('❌ Erro ao atualizar configuração', 'error');
            // Reverter checkbox
            document.getElementById('toggleVisitasPublicas').checked = !abertas;
        }
    }

    // ============================================
    // 📥 CARREGAR CONFIGURAÇÃO
    // ============================================
    async carregarConfiguracao() {
        try {
            const response = await this.apiRequest('/api/setor-pedagogico/visitas/configuracao');
            if (response.success) {
                this.configuracao = response.configuracao;
            }
        } catch (error) {
            console.error('Erro ao carregar config:', error);
        }
    }

    // ============================================
    // UTILITÁRIOS — USANDO API DO BOOTSTRAP
    // ============================================
    openModal() {
        const modalEl = document.getElementById('modal');
        if (!modalEl) {
            console.error('❌ Modal #modal não encontrado');
            return;
        }
        
        // Garantir que o modal não fique com display:flex quando fechado
        modalEl.style.display = '';
        
        // Usar API do Bootstrap corretamente
        let modal = bootstrap.Modal.getInstance(modalEl);
        if (!modal) {
            modal = new bootstrap.Modal(modalEl, {
                backdrop: true,
                keyboard: true,
                focus: true
            });
        }
        modal.show();
    }

    closeModal() {
        const modalEl = document.getElementById('modal');
        if (!modalEl) return;
        
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) {
            modal.hide();
        } else {
            // Fallback se não houver instância
            modalEl.style.display = 'none';
            modalEl.classList.remove('show');
        }
        
        // Limpar backdrop órfão (caso exista)
        setTimeout(() => {
            document.querySelectorAll('.modal-backdrop').forEach(b => {
                if (!document.querySelector('.modal.show')) {
                    b.remove();
                }
            });
            document.body.classList.remove('modal-open');
            document.body.style.removeProperty('overflow');
            document.body.style.removeProperty('padding-right');
        }, 300);
    }
}

// ============================================
// INSTANCIAÇÃO GLOBAL
// ============================================
const visitasAdmin = new VisitasAdmin();
window.visitasAdmin = visitasAdmin;

console.log('✅ visitas-admin.js carregado');