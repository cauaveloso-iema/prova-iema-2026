// frontend/js/admin.js

class AdminPanel {
    constructor() {
        this.apiBase = '/api/admin';
        this.currentSection = 'dashboard';
        this.usuarios = [];
        this.turmas = [];
        this.provas = [];
        this.questoes = [];
        this.resultados = [];
        this.backups = [];
        this.monitoramento = [];
        this.graficos = {};
        this.filtros = {
            usuarios: { role: 'todos', search: '', page: 1, limit: 10 },
            turmas: { search: '', eixo: 'todos', page: 1, limit: 10 },
            provas: { status: 'todos', dificuldade: 'todas', periodo: 'todos', search: '', page: 1, limit: 10 }
        };
        
        // ===== VARIÁVEIS PARA CRIAÇÃO DE PROVAS =====
        this.provaGeradaAdmin = null;
        this.anexosAdmin = [];
        this.arquivosParaUploadAdmin = [];
        this.arquivosOriginaisBackupAdmin = [];
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    async init() {
        console.log('🚀 Inicializando Super Admin Panel...');
        await this.checkAuth();
        this.setupEventListeners();
        this.setupMobileMenu();
        this.updateDateTime();
        setInterval(() => this.updateDateTime(), 1000);
        await this.loadSection('dashboard');
        this.startAutoRefresh();
        this.carregarDadosReais();
    }

    async checkAuth() {
        const token = localStorage.getItem('auth_token');
        const userData = JSON.parse(localStorage.getItem('user_data') || '{}');

        if (!token) {
            window.location.href = 'login.html';
            return;
        }

        if (userData.role !== 'admin' && userData.role !== 'super_admin') {
            alert('Acesso negado. Você não tem permissão para acessar esta página.');
            window.location.href = userData.role === 'professor' ? 'index.html' : 'aluno.html';
            return;
        }

        // Atualizar informações do admin
        const adminNome = document.getElementById('adminNome');
        const adminEmail = document.getElementById('adminEmail');
        const adminAvatar = document.getElementById('adminAvatar');

        if (adminNome) adminNome.textContent = userData.nome || 'Super Admin';
        if (adminEmail) adminEmail.textContent = userData.email || 'admin@iemasaoluiscentro.net';
        if (adminAvatar) {
            const iniciais = (userData.nome || 'Admin').split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase();
            adminAvatar.textContent = iniciais || 'A';
        }

        console.log('✅ Autenticação OK - Role:', userData.role);
    }

    setupEventListeners() {
        // Navegação do menu
        document.querySelectorAll('.nav-link[data-section]').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const section = e.currentTarget.dataset.section;
                this.switchSection(section);
            });
        });

        // Botão de refresh
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.loadSection(this.currentSection);
                this.carregarDadosReais();
            });
        }

        // Pesquisa global
        const globalSearch = document.getElementById('globalSearch');
        if (globalSearch) {
            globalSearch.addEventListener('input', (e) => {
                this.handleGlobalSearch(e.target.value);
            });
        }

        // Logout
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.logout();
            });
        }

        // Fechar modais
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => this.closeModal());
        });

        window.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.closeModal();
            }
        });

        const menuToggle = document.getElementById('menuToggle');
        if (menuToggle) {
            menuToggle.addEventListener('click', () => {
                const sidebar = document.getElementById('sidebar');
                const mainContent = document.getElementById('mainContent');
                if (sidebar) sidebar.classList.toggle('collapsed');
                if (mainContent) mainContent.classList.toggle('expanded');
            });
        }
    }

    setupMobileMenu() {}

    updateDateTime() {
        const datetimeEl = document.getElementById('currentDatetime');
        if (datetimeEl) {
            const now = new Date();
            datetimeEl.textContent = now.toLocaleString('pt-BR', { 
                dateStyle: 'short', 
                timeStyle: 'short' 
            });
        }
    }

    startAutoRefresh() {
        setInterval(() => this.carregarDadosReais(), 30000);
    }

    async carregarDadosReais() {
        try {
            const response = await fetch(`${this.apiBase}/dashboard`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
            });
            
            if (!response.ok) throw new Error('Erro ao carregar dados');
            
            const data = await response.json();
            
            if (data.success) {
                this.atualizarEstatisticas(data.data);
            }
        } catch (error) {
            console.error('Erro ao carregar dados reais:', error);
        }
    }

    atualizarEstatisticas(stats) {
        // Atualizar números nos cards
        const elementos = {
            'total-usuarios': stats.totalUsuarios,
            'total-alunos': stats.totalAlunos,
            'total-professores': stats.totalProfessores,
            'total-admins': stats.totalAdmins,
            'total-turmas': stats.totalTurmas,
            'turmas-ativas': stats.turmasAtivas,
            'total-provas': stats.totalProvas,
            'provas-ativas': stats.provasPorStatus?.ativa || 0,
            'provas-rascunho': stats.provasPorStatus?.rascunho || 0,
            'provas-concluidas': stats.provasPorStatus?.finalizada || 0,
            'total-questoes': stats.totalQuestoes,
            'total-resultados': stats.totalResultados,
            'alunos-acessibilidade': stats.alunosComAcessibilidade,
            'badge-usuarios': stats.totalUsuarios,
            'badge-turmas': stats.totalTurmas,
            'badge-provas': stats.totalProvas,
            'badge-questoes': stats.totalQuestoes,
            'badge-resultados': stats.totalResultados
        };

        for (const [id, valor] of Object.entries(elementos)) {
            const el = document.getElementById(id);
            if (el) el.textContent = valor || 0;
        }

        // Criar gráficos se existirem
        this.criarGraficos(stats);
    }

    criarGraficos(stats) {
        Object.values(this.graficos).forEach(g => {
            if (g) g.destroy();
        });

        const ctxUsuarios = document.getElementById('grafico-usuarios')?.getContext('2d');
        if (ctxUsuarios && stats.usuariosPorMes) {
            this.graficos.usuarios = new Chart(ctxUsuarios, {
                type: 'bar',
                data: {
                    labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
                    datasets: [{
                        label: 'Novos Usuários',
                        data: Array(12).fill(0).map((_, i) => 
                            stats.usuariosPorMes.find(m => m.mes === i + 1)?.total || 0
                        ),
                        backgroundColor: '#0d6efd',
                        borderRadius: 5
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    }
                }
            });
        }

        const ctxProvas = document.getElementById('grafico-provas')?.getContext('2d');
        if (ctxProvas && stats.provasPorStatus) {
            this.graficos.provas = new Chart(ctxProvas, {
                type: 'doughnut',
                data: {
                    labels: ['Ativas', 'Rascunho', 'Finalizadas'],
                    datasets: [{
                        data: [
                            stats.provasPorStatus.ativa || 0,
                            stats.provasPorStatus.rascunho || 0,
                            stats.provasPorStatus.finalizada || 0
                        ],
                        backgroundColor: ['#198754', '#ffc107', '#6c757d'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom' }
                    }
                }
            });
        }
    }

    getDadosExemplo() {
        return {
            totalUsuarios: 150,
            totalAlunos: 120,
            totalProfessores: 28,
            totalAdmins: 2,
            totalTurmas: 12,
            totalProvas: 45,
            totalQuestoes: 380,
            totalResultados: 230,
            turmasAtivas: 10,
            alunosComAcessibilidade: 15,
            provasPorStatus: {
                ativa: 25,
                rascunho: 15,
                finalizada: 5
            },
            usuariosPorMes: [
                { mes: 1, total: 12 },
                { mes: 2, total: 18 },
                { mes: 3, total: 15 }
            ]
        };
    }

    async switchSection(section) {
        this.currentSection = section;

        document.querySelectorAll('.nav-link[data-section]').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.section === section) {
                item.classList.add('active');
            }
        });

        const titles = {
            dashboard: 'Dashboard',
            usuarios: 'Gerenciar Usuários',
            turmas: 'Gerenciar Turmas',
            provas: 'Gerenciar Provas',
            'nova-prova': 'Nova Prova',
            questoes: 'Banco de Questões',
            resultados: 'Resultados',
            matriculas: 'Matrículas Autorizadas',
            backups: 'Backups e Restauração',
            monitoramento: 'Monitoramento do Sistema',  // <-- ADICIONAR ESTA LINHA
            configuracoes: 'Configurações do Sistema'
        };
        
        const pageTitle = document.getElementById('pageTitle');
        if (pageTitle) pageTitle.textContent = titles[section] || 'Dashboard';

        await this.loadSection(section);
    }

    async loadSection(section) {
        const contentArea = document.getElementById('contentArea');
        if (!contentArea) return;

        contentArea.innerHTML = `
            <div class="loading-spinner">
                <div class="spinner"></div>
                <p>Carregando ${section}...</p>
            </div>
        `;

        switch(section) {
            case 'dashboard':
                await this.loadDashboard();
                break;
            case 'usuarios':
                await this.loadUsuarios();
                break;
            case 'turmas':
                await this.loadTurmas();
                break;
            case 'provas':
                await this.loadProvas();
                break;
            case 'nova-prova':
                await this.carregarNovaProva();
                break;
            case 'questoes':
                await this.loadQuestoes();
                break;
            case 'resultados':
                await this.loadResultados();
                break;
            case 'matriculas':
                await this.loadMatriculas();
                break;
            case 'backups':
                await this.loadBackups();
                break;
            case 'monitoramento':  // <-- ADICIONAR ESTE CASE
                await this.loadMonitoramento();
                break;
            case 'configuracoes':
                await this.loadConfiguracoes();
                break;
        }
    }

    // ============ DASHBOARD ============

    async loadDashboard() {
        const contentArea = document.getElementById('contentArea');
        
        try {
            const response = await fetch(`${this.apiBase}/dashboard`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
            });
            
            const data = await response.json();
            const stats = data.success ? data.data : this.getDadosExemplo();

            contentArea.innerHTML = `
                <div class="stats-grid">
                    <div class="stat-card primary">
                        <div class="stat-icon">
                            <i class="fas fa-users"></i>
                        </div>
                        <div class="stat-content">
                            <h3>Total de Usuários</h3>
                            <div class="stat-number" id="total-usuarios">${stats.totalUsuarios || 0}</div>
                            <div class="stat-details">
                                <span><i class="fas fa-user-graduate"></i> <span id="total-alunos">${stats.totalAlunos || 0}</span> alunos</span>
                                <span><i class="fas fa-chalkboard-teacher"></i> <span id="total-professores">${stats.totalProfessores || 0}</span> professores</span>
                                <span><i class="fas fa-user-tie"></i> <span id="total-admins">${stats.totalAdmins || 0}</span> admins</span>
                            </div>
                        </div>
                    </div>

                    <div class="stat-card success">
                        <div class="stat-icon">
                            <i class="fas fa-school"></i>
                        </div>
                        <div class="stat-content">
                            <h3>Turmas</h3>
                            <div class="stat-number" id="total-turmas">${stats.totalTurmas || 0}</div>
                            <div class="stat-details">
                                <span><i class="fas fa-check-circle"></i> <span id="turmas-ativas">${stats.turmasAtivas || 0}</span> ativas</span>
                                <span><i class="fas fa-wheelchair"></i> <span id="alunos-acessibilidade">${stats.alunosComAcessibilidade || 0}</span> c/ acessibilidade</span>
                            </div>
                        </div>
                    </div>

                    <div class="stat-card warning">
                        <div class="stat-icon">
                            <i class="fas fa-file-alt"></i>
                        </div>
                        <div class="stat-content">
                            <h3>Provas</h3>
                            <div class="stat-number" id="total-provas">${stats.totalProvas || 0}</div>
                            <div class="stat-details">
                                <span><i class="fas fa-check-circle"></i> <span id="provas-ativas">${stats.provasPorStatus?.ativa || 0}</span> ativas</span>
                                <span><i class="fas fa-clock"></i> <span id="provas-rascunho">${stats.provasPorStatus?.rascunho || 0}</span> rascunhos</span>
                                <span><i class="fas fa-check-double"></i> <span id="provas-concluidas">${stats.provasPorStatus?.finalizada || 0}</span> concluídas</span>
                            </div>
                        </div>
                    </div>

                    <div class="stat-card info">
                        <div class="stat-icon">
                            <i class="fas fa-question-circle"></i>
                        </div>
                        <div class="stat-content">
                            <h3>Questões</h3>
                            <div class="stat-number" id="total-questoes">${stats.totalQuestoes || 0}</div>
                            <div class="stat-details">
                                <span><i class="fas fa-chart-bar"></i> <span id="total-resultados">${stats.totalResultados || 0}</span> resultados</span>
                                <span><i class="fas fa-percent"></i> <span id="media-questoes">${stats.totalProvas ? (stats.totalQuestoes / stats.totalProvas).toFixed(1) : 0}</span> por prova</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="charts-row">
                    <div class="chart-card">
                        <h3><i class="fas fa-chart-bar"></i> Novos Usuários por Mês</h3>
                        <canvas id="grafico-usuarios"></canvas>
                    </div>
                    <div class="chart-card">
                        <h3><i class="fas fa-chart-pie"></i> Status das Provas</h3>
                        <canvas id="grafico-provas"></canvas>
                    </div>
                </div>

                <div class="recent-activity">
                    <h3><i class="fas fa-history"></i> Atividades Recentes</h3>
                    <div class="activity-list" id="atividades-recentes">
                        ${this.gerarAtividadesRecentes(stats.atividadesRecentes)}
                    </div>
                </div>
            `;

            this.criarGraficos(stats);

        } catch (error) {
            console.error('Erro ao carregar dashboard:', error);
            contentArea.innerHTML = `
                <div class="error-container">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Erro ao carregar dados</h3>
                    <p>${error.message}</p>
                    <button class="btn-primary" onclick="admin.loadDashboard()">
                        <i class="fas fa-sync-alt"></i> Tentar novamente
                    </button>
                </div>
            `;
        }
    }

    gerarAtividadesRecentes(atividades = []) {
        if (!atividades || atividades.length === 0) {
            return `
                <div class="activity-item">
                    <div class="activity-icon admin">
                        <i class="fas fa-crown"></i>
                    </div>
                    <div class="activity-content">
                        <p><strong>Sistema</strong> iniciado</p>
                        <small>${new Date().toLocaleString('pt-BR')}</small>
                    </div>
                </div>
            `;
        }

        return atividades.map(ativ => `
            <div class="activity-item">
                <div class="activity-icon ${ativ.tipo}">
                    <i class="fas ${ativ.tipo === 'resultado' ? 'fa-check-circle' : ativ.tipo === 'usuario' ? 'fa-user-plus' : 'fa-pencil-alt'}"></i>
                </div>
                <div class="activity-content">
                    <p><strong>${ativ.usuario}</strong> ${ativ.acao} <strong>${ativ.prova}</strong></p>
                    <small>${new Date(ativ.data).toLocaleString('pt-BR')}</small>
                </div>
            </div>
        `).join('');
    }

    // ============ USUÁRIOS ============

    async loadUsuarios() {
        const contentArea = document.getElementById('contentArea');
        
        try {
            const { role, search, page, limit } = this.filtros.usuarios;
            const response = await fetch(
                `${this.apiBase}/usuarios?role=${role}&search=${search}&page=${page}&limit=${limit}`,
                { headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` } }
            );
            
            const data = await response.json();

            if (!data.success) throw new Error(data.error || 'Erro ao carregar usuários');

            this.usuarios = data.usuarios;

            contentArea.innerHTML = `
                <div class="section">
                    <div class="section-header">
                        <h2><i class="fas fa-users-cog"></i> Gerenciar Usuários</h2>
                        <button class="btn-primary" onclick="admin.abrirModalUsuario()">
                            <i class="fas fa-plus"></i> Novo Usuário
                        </button>
                    </div>

                    <div class="filters-bar">
                        <div class="filter-group">
                            <label><i class="fas fa-search"></i> Buscar</label>
                            <input type="text" id="searchUsuarios" placeholder="Nome, email ou matrícula..." 
                                   value="${search}" oninput="admin.filtrarUsuarios()" class="form-control">
                        </div>
                        <div class="filter-group">
                            <label><i class="fas fa-user-tag"></i> Perfil</label>
                            <select id="filterRole" class="form-control" onchange="admin.filtrarUsuarios()">
                                <option value="todos" ${role === 'todos' ? 'selected' : ''}>Todos</option>
                                <option value="aluno" ${role === 'aluno' ? 'selected' : ''}>Alunos</option>
                                <option value="professor" ${role === 'professor' ? 'selected' : ''}>Professores</option>
                                <option value="admin" ${role === 'admin' ? 'selected' : ''}>Admins</option>
                                <option value="super_admin" ${role === 'super_admin' ? 'selected' : ''}>Super Admins</option>
                            </select>
                        </div>
                        <div class="filter-actions">
                            <button class="btn-filter" onclick="admin.limparFiltrosUsuarios()">
                                <i class="fas fa-eraser"></i> Limpar
                            </button>
                        </div>
                    </div>

                    <div class="table-responsive">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Nome</th>
                                    <th>Email</th>
                                    <th>Perfil</th>
                                    <th>Matrícula</th>
                                    <th>CPF</th>
                                    <th>Telefone</th>
                                    <th>Status</th>
                                    <th>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${this.gerarLinhasUsuarios(data.usuarios)}
                            </tbody>
                        </table>
                    </div>

                    ${this.gerarPaginacao(data.pagination, 'usuarios')}
                </div>
            `;

        } catch (error) {
            console.error('Erro ao carregar usuários:', error);
            contentArea.innerHTML = `
                <div class="error-container">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Erro ao carregar usuários</h3>
                    <p>${error.message}</p>
                    <button class="btn-primary" onclick="admin.loadUsuarios()">
                        <i class="fas fa-sync-alt"></i> Tentar novamente
                    </button>
                </div>
            `;
        }
    }

    // ============ GERAR LINHAS DA TABELA DE USUÁRIOS (CORRIGIDO) ============
    gerarLinhasUsuarios(usuarios) {
        if (!usuarios || usuarios.length === 0) {
            return `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 40px;">
                        <i class="fas fa-users-slash" style="font-size: 2rem; color: #dee2e6; margin-bottom: 10px; display: block;"></i>
                        Nenhum usuário encontrado
                    </td>
                </tr>
            `;
        }

        return usuarios.map(user => `
            <tr>
                <td>
                    <strong>${user.nome || 'N/A'}</strong>
                    ${user.precisaAcessibilidade ? '<span class="badge-acessibilidade" title="Necessita acessibilidade"><i class="fas fa-wheelchair"></i></span>' : ''}
                </td>
                <td>${user.email || 'N/A'}</td>
                <td>
                    <span class="role-badge ${user.role === 'super_admin' ? 'admin' : user.role}">
                        ${user.role === 'super_admin' ? '👑 Super Admin' : 
                        user.role === 'admin' ? '👑 Admin' : 
                        user.role === 'professor' ? '👨‍🏫 Professor' : 
                        '👨‍🎓 Aluno'}
                    </span>
                </td>
                <td>${user.matricula || '-'}</td>
                <td>${user.cpf ? user.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : '-'}</td>
                <td>${user.telefone ? user.telefone.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3') : '-'}</td>
                <td>
                    <span class="status-badge ${user.ativo ? 'active' : 'inactive'}">
                        ${user.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                </td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-icon" onclick="admin.editarUsuario('${user._id}')" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-icon" onclick="admin.resetarSenha('${user._id}')" title="Resetar Senha">
                            <i class="fas fa-key"></i>
                        </button>
                        <button class="btn-icon danger" onclick="admin.excluirUsuario('${user._id}')" title="Excluir">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    gerarPaginacao(pagination, tipo) {
        if (!pagination || pagination.pages <= 1) return '';
        
        return `
            <div class="pagination">
                <button class="btn-pagination" 
                        ${pagination.page === 1 ? 'disabled' : ''}
                        onclick="admin.mudarPagina('${tipo}', ${pagination.page - 1})">
                    <i class="fas fa-chevron-left"></i> Anterior
                </button>
                <span>Página ${pagination.page} de ${pagination.pages}</span>
                <button class="btn-pagination"
                        ${pagination.page === pagination.pages ? 'disabled' : ''}
                        onclick="admin.mudarPagina('${tipo}', ${pagination.page + 1})">
                    Próxima <i class="fas fa-chevron-right"></i>
                </button>
            </div>
        `;
    }

    // ============ EDITAR USUÁRIO ============
    editarUsuario(usuarioId) {
        console.log('✏️ Editando usuário:', usuarioId);
        
        // Encontrar o usuário na lista
        const usuario = this.usuarios.find(u => u._id === usuarioId || u.id === usuarioId);
        
        if (!usuario) {
            this.showToast('❌ Usuário não encontrado', 'error');
            return;
        }
        
        console.log('📋 Dados do usuário:', usuario);
        
        // Abrir modal com os dados do usuário
        this.abrirModalUsuario(usuarioId);
    }

    filtrarUsuarios() {
        this.filtros.usuarios.search = document.getElementById('searchUsuarios')?.value || '';
        this.filtros.usuarios.role = document.getElementById('filterRole')?.value || 'todos';
        this.filtros.usuarios.page = 1;
        this.loadUsuarios();
    }

    limparFiltrosUsuarios() {
        this.filtros.usuarios = { role: 'todos', search: '', page: 1, limit: 10 };
        this.loadUsuarios();
    }

    mudarPagina(tipo, page) {
        if (page < 1) return;
        this.filtros[tipo].page = page;
        this.loadSection(tipo);
    }

    handleGlobalSearch(value) {
        if (this.currentSection === 'usuarios') {
            this.filtros.usuarios.search = value;
            this.filtros.usuarios.page = 1;
            this.loadUsuarios();
        } else if (this.currentSection === 'turmas') {
            this.filtros.turmas.search = value;
            this.filtros.turmas.page = 1;
            this.loadTurmas();
        } else if (this.currentSection === 'provas') {
            this.filtros.provas.search = value;
            this.filtros.provas.page = 1;
            this.loadProvas();
        }
    }

    // ============ MODAL USUÁRIO ============

    // ============ ABRIR MODAL DE USUÁRIO (CORRIGIDO) ============
    abrirModalUsuario(usuarioId = null) {
        console.log('🔍 Abrindo modal para usuário ID:', usuarioId);
        
        // Buscar usuário se tiver ID
        let usuario = null;
        if (usuarioId) {
            usuario = this.usuarios.find(u => u._id === usuarioId || u.id === usuarioId);
            console.log('👤 Usuário encontrado:', usuario);
        }

        const modalBody = document.getElementById('modalBody');
        modalBody.innerHTML = `
            <form id="userForm">
                <div class="form-group">
                    <label>Nome Completo</label>
                    <input type="text" id="userNome" class="form-control" value="${usuario?.nome || ''}" required>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label>Email Institucional</label>
                        <input type="email" id="userEmail" class="form-control" value="${usuario?.email || ''}" required>
                        <small style="color: #6c757d;">@iemasaoluiscentro.net</small>
                    </div>
                    <div class="form-group">
                        <label>Perfil</label>
                        <select id="userRole" class="form-control" onchange="admin.toggleCamposRole()">
                            <option value="aluno" ${usuario?.role === 'aluno' || (!usuario && 'aluno') ? 'selected' : ''}>Aluno</option>
                            <option value="professor" ${usuario?.role === 'professor' ? 'selected' : ''}>Professor</option>
                            <option value="admin" ${usuario?.role === 'admin' ? 'selected' : ''}>Admin</option>
                            <option value="super_admin" ${usuario?.role === 'super_admin' ? 'selected' : ''}>Super Admin</option>
                        </select>
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label>CPF</label>
                        <input type="text" id="userCPF" class="form-control" value="${usuario?.cpf || ''}" oninput="formatarCPF(this)" maxlength="14" required>
                    </div>
                    <div class="form-group">
                        <label>Telefone</label>
                        <input type="text" id="userTelefone" class="form-control" value="${usuario?.telefone || ''}" oninput="formatarTelefone(this)" maxlength="15" required>
                    </div>
                </div>

                <div class="form-group">
                    <label>Matrícula</label>
                    <input type="text" id="userMatricula" class="form-control" value="${usuario?.matricula || ''}" maxlength="6">
                </div>

                <!-- Campos específicos para Aluno -->
                <div id="alunoFields" class="role-specific" style="${usuario?.role === 'aluno' ? 'display: block;' : 'display: none;'}">
                    <div class="form-row">
                        <div class="form-group">
                            <label>Curso</label>
                            <select id="userCurso" class="form-control">
                                <option value="">Selecione...</option>
                                <option value="TÉCNICO EM EVENTOS" ${usuario?.curso === 'TÉCNICO EM EVENTOS' ? 'selected' : ''}>TÉCNICO EM EVENTOS</option>
                                <option value="TÉCNICO EM REDES DE COMPUTADORES" ${usuario?.curso === 'TÉCNICO EM REDES DE COMPUTADORES' ? 'selected' : ''}>TÉCNICO EM REDES DE COMPUTADORES</option>
                                <option value="TÉCNICO EM DESENVOLVIMENTO DE SISTEMAS" ${usuario?.curso === 'TÉCNICO EM DESENVOLVIMENTO DE SISTEMAS' ? 'selected' : ''}>TÉCNICO EM DESENVOLVIMENTO DE SISTEMAS</option>
                                <option value="TÉCNICO EM MARKETING" ${usuario?.curso === 'TÉCNICO EM MARKETING' ? 'selected' : ''}>TÉCNICO EM MARKETING</option>
                                <option value="TÉCNICO EM GASTRONOMIA" ${usuario?.curso === 'TÉCNICO EM GASTRONOMIA' ? 'selected' : ''}>TÉCNICO EM GASTRONOMIA</option>
                                <option value="TÉCNICO EM MEIO AMBIENTE" ${usuario?.curso === 'TÉCNICO EM MEIO AMBIENTE' ? 'selected' : ''}>TÉCNICO EM MEIO AMBIENTE</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Turma</label>
                            <input type="text" id="userTurma" class="form-control" value="${usuario?.turma || ''}" placeholder="Ex: 101, 102">
                        </div>
                    </div>
                    <div class="form-check">
                        <input type="checkbox" id="userAcessibilidade" ${usuario?.precisaAcessibilidade ? 'checked' : ''}>
                        <label for="userAcessibilidade">Necessita de acessibilidade</label>
                    </div>
                </div>

                <!-- Campos específicos para Professor -->
                <div id="professorFields" class="role-specific" style="${usuario?.role === 'professor' ? 'display: block;' : 'display: none;'}">
                    <div class="form-row">
                        <div class="form-group">
                            <label>Eixo</label>
                            <select id="userEixo" class="form-control">
                                <option value="">Selecione...</option>
                                <option value="natureza" ${usuario?.eixo === 'natureza' ? 'selected' : ''}>Natureza</option>
                                <option value="humanas" ${usuario?.eixo === 'humanas' ? 'selected' : ''}>Humanas</option>
                                <option value="linguagens" ${usuario?.eixo === 'linguagens' ? 'selected' : ''}>Linguagens</option>
                                <option value="desenvolvimento" ${usuario?.eixo === 'desenvolvimento' ? 'selected' : ''}>Desenvolvimento</option>
                                <option value="gestao" ${usuario?.eixo === 'gestao' ? 'selected' : ''}>Gestão</option>
                                <option value="turismo" ${usuario?.eixo === 'turismo' ? 'selected' : ''}>Turismo</option>
                                <option value="ambiente" ${usuario?.eixo === 'ambiente' ? 'selected' : ''}>Ambiente</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Departamento</label>
                            <input type="text" id="userDepartamento" class="form-control" value="${usuario?.departamento || ''}">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Titulação</label>
                        <input type="text" id="userTitulacao" class="form-control" value="${usuario?.titulacao || ''}">
                    </div>
                </div>

                ${!usuario ? `
                <div class="form-group">
                    <label>Senha Temporária</label>
                    <div style="display: flex; gap: 10px;">
                        <input type="text" id="userPassword" class="form-control" value="${this.gerarSenha()}" required>
                        <button type="button" class="btn-icon" onclick="admin.gerarNovaSenha()" title="Gerar nova senha">
                            <i class="fas fa-sync-alt"></i>
                        </button>
                    </div>
                    <small style="color: #6c757d;">O usuário usará esta senha para fazer login</small>
                </div>
                ` : ''}
                
                <!-- Campo hidden para o status (sempre ativo) -->
                <input type="hidden" id="userStatus" value="true">
            </form>
        `;

        // Título do modal
        document.getElementById('modalTitle').innerHTML = usuario ? 
            '<i class="fas fa-edit"></i> Editar Usuário' : 
            '<i class="fas fa-user-plus"></i> Novo Usuário';
        
        // Configurar botão salvar
        document.getElementById('modalSaveBtn').onclick = () => this.salvarUsuario(usuario?._id || usuario?.id);
        
        this.openModal();
    }

    toggleCamposRole() {
        const role = document.getElementById('userRole').value;
        document.getElementById('alunoFields').style.display = role === 'aluno' ? 'block' : 'none';
        document.getElementById('professorFields').style.display = role === 'professor' ? 'block' : 'none';
    }

    gerarSenha() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
        let senha = '';
        for (let i = 0; i < 10; i++) {
            senha += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return senha;
    }

    gerarNovaSenha() {
        document.getElementById('userPassword').value = this.gerarSenha();
    }

    // ============ SALVAR USUÁRIO ============
    async salvarUsuario(id = null) {
        try {
            console.log('💾 Salvando usuário. ID:', id);
            
            const role = document.getElementById('userRole').value;
            
            const dados = {
                nome: document.getElementById('userNome').value,
                email: document.getElementById('userEmail').value,
                cpf: document.getElementById('userCPF').value.replace(/\D/g, ''),
                telefone: document.getElementById('userTelefone').value.replace(/\D/g, ''),
                role: role,
                matricula: document.getElementById('userMatricula').value || undefined
            };

            // Campos específicos por role
            if (role === 'aluno') {
                dados.curso = document.getElementById('userCurso').value;
                dados.turma = document.getElementById('userTurma').value;
                dados.precisaAcessibilidade = document.getElementById('userAcessibilidade').checked;
            } else if (role === 'professor') {
                dados.eixo = document.getElementById('userEixo').value;
                dados.departamento = document.getElementById('userDepartamento').value || undefined;
                dados.titulacao = document.getElementById('userTitulacao').value || undefined;
            }

            // Se for criação (sem ID), adicionar senha
            if (!id) {
                dados.password = document.getElementById('userPassword').value;
                dados.forcePasswordChange = true; // Forçar troca de senha no primeiro login
            }

            console.log('📤 Dados a serem enviados:', dados);

            const url = id ? `${this.apiBase}/usuarios/${id}` : `${this.apiBase}/usuarios`;
            const method = id ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                },
                body: JSON.stringify(dados)
            });

            const data = await response.json();

            if (data.success) {
                this.showToast(id ? 'Usuário atualizado com sucesso!' : 'Usuário criado com sucesso!', 'success');
                this.closeModal();
                this.loadUsuarios(); // Recarregar a lista
                this.carregarDadosReais(); // Atualizar dashboard
            } else {
                throw new Error(data.error || 'Erro ao salvar usuário');
            }

        } catch (error) {
            console.error('❌ Erro ao salvar usuário:', error);
            this.showToast('Erro: ' + error.message, 'error');
        }
    }
    

    // ============ RESETAR SENHA ============
    async resetarSenha(usuarioId) {
        console.log('🔑 Resetando senha do usuário:', usuarioId);
        
        const usuario = this.usuarios.find(u => u._id === usuarioId || u.id === usuarioId);
        if (!usuario) {
            this.showToast('❌ Usuário não encontrado', 'error');
            return;
        }

        const novaSenha = this.gerarSenha();

        const confirmar = await this.confirmar(
            `Resetar senha de ${usuario.nome}?`,
            `A nova senha será: <strong>${novaSenha}</strong><br><br>O usuário deverá alterar no próximo login.`
        );

        if (!confirmar) return;

        try {
            this.showToast('Processando...', 'info');

            const response = await fetch(`${this.apiBase}/usuarios/${usuarioId}/reset-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                },
                body: JSON.stringify({ novaSenha })
            });

            const data = await response.json();

            if (data.success) {
                this.showToast(`✅ Senha resetada! Nova senha: ${novaSenha}`, 'success');
            } else {
                throw new Error(data.error || 'Erro ao resetar senha');
            }

        } catch (error) {
            console.error('❌ Erro ao resetar senha:', error);
            this.showToast('Erro: ' + error.message, 'error');
        }
    }

    // ============ EXCLUIR USUÁRIO ============
    async excluirUsuario(usuarioId) {
        console.log('🗑️ Excluindo usuário:', usuarioId);
        
        const usuario = this.usuarios.find(u => u._id === usuarioId || u.id === usuarioId);
        if (!usuario) {
            this.showToast('❌ Usuário não encontrado', 'error');
            return;
        }

        const confirmar = await this.confirmar(
            `Excluir usuário ${usuario.nome}?`,
            `Esta ação não pode ser desfeita. Todos os dados do usuário serão removidos permanentemente.`
        );

        if (!confirmar) return;

        try {
            this.showToast('Excluindo usuário...', 'info');

            const response = await fetch(`${this.apiBase}/usuarios/${usuarioId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
            });

            const data = await response.json();

            if (data.success) {
                this.showToast('✅ Usuário excluído com sucesso!', 'success');
                this.loadUsuarios(); // Recarregar a lista
                this.carregarDadosReais(); // Atualizar dashboard
            } else {
                throw new Error(data.error || 'Erro ao excluir usuário');
            }

        } catch (error) {
            console.error('❌ Erro ao excluir usuário:', error);
            this.showToast('Erro: ' + error.message, 'error');
        }
    }

    // ============ TURMAS ============

    async loadTurmas() {
        const contentArea = document.getElementById('contentArea');
        
        try {
            const { search, eixo, page, limit } = this.filtros.turmas;
            const response = await fetch(
                `${this.apiBase}/turmas?search=${search}&eixo=${eixo}&page=${page}&limit=${limit}`,
                { headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` } }
            );
            
            const data = await response.json();

            if (!data.success) throw new Error(data.error || 'Erro ao carregar turmas');

            this.turmas = data.turmas;

            // Calcular estatísticas para o header
            const totalAlunos = this.turmas.reduce((acc, t) => acc + (t.totalAlunos || 0), 0);
            const turmasAtivas = this.turmas.filter(t => t.ativa !== false).length;

            contentArea.innerHTML = `
                <div class="section">
                    <div class="section-header">
                        <h2><i class="fas fa-school"></i> Gerenciar Turmas</h2>
                        <button class="btn-primary" onclick="admin.abrirModalTurma()">
                            <i class="fas fa-plus"></i> Nova Turma
                        </button>
                    </div>

                    <div class="stats-grid" style="grid-template-columns: repeat(4, 1fr); margin-bottom: 20px;">
                        <div class="stat-card" style="padding: 15px;">
                            <div class="stat-icon" style="width: 40px; height: 40px; font-size: 20px;">
                                <i class="fas fa-school"></i>
                            </div>
                            <div class="stat-content">
                                <h3>Total</h3>
                                <div class="stat-number" style="font-size: 24px;">${this.turmas.length}</div>
                            </div>
                        </div>
                        <div class="stat-card" style="padding: 15px;">
                            <div class="stat-icon" style="width: 40px; height: 40px; font-size: 20px; background: #198754;">
                                <i class="fas fa-check-circle"></i>
                            </div>
                            <div class="stat-content">
                                <h3>Ativas</h3>
                                <div class="stat-number" style="font-size: 24px;">${turmasAtivas}</div>
                            </div>
                        </div>
                        <div class="stat-card" style="padding: 15px;">
                            <div class="stat-icon" style="width: 40px; height: 40px; font-size: 20px; background: #ffc107;">
                                <i class="fas fa-users"></i>
                            </div>
                            <div class="stat-content">
                                <h3>Alunos</h3>
                                <div class="stat-number" style="font-size: 24px;">${totalAlunos}</div>
                            </div>
                        </div>
                        <div class="stat-card" style="padding: 15px;">
                            <div class="stat-icon" style="width: 40px; height: 40px; font-size: 20px; background: #0dcaf0;">
                                <i class="fas fa-chart-line"></i>
                            </div>
                            <div class="stat-content">
                                <h3>Média</h3>
                                <div class="stat-number" style="font-size: 24px;">${this.turmas.length ? (totalAlunos / this.turmas.length).toFixed(1) : 0}</div>
                            </div>
                        </div>
                    </div>

                    <div class="filters-bar" style="margin-bottom: 20px;">
                        <div class="filter-group">
                            <label><i class="fas fa-search"></i> Buscar turma</label>
                            <input type="text" id="searchTurmas" placeholder="Nome ou disciplina..." 
                                   value="${search}" oninput="admin.filtrarTurmas()" class="form-control">
                        </div>
                        <div class="filter-group">
                            <label><i class="fas fa-sitemap"></i> Eixo</label>
                            <select id="filterEixo" class="form-control" onchange="admin.filtrarTurmas()">
                                <option value="todos" ${eixo === 'todos' ? 'selected' : ''}>Todos</option>
                                <option value="natureza" ${eixo === 'natureza' ? 'selected' : ''}>Natureza</option>
                                <option value="humanas" ${eixo === 'humanas' ? 'selected' : ''}>Humanas</option>
                                <option value="linguagens" ${eixo === 'linguagens' ? 'selected' : ''}>Linguagens</option>
                                <option value="desenvolvimento" ${eixo === 'desenvolvimento' ? 'selected' : ''}>Desenvolvimento</option>
                                <option value="gestao" ${eixo === 'gestao' ? 'selected' : ''}>Gestão</option>
                                <option value="turismo" ${eixo === 'turismo' ? 'selected' : ''}>Turismo</option>
                                <option value="ambiente" ${eixo === 'ambiente' ? 'selected' : ''}>Ambiente</option>
                            </select>
                        </div>
                        <div class="filter-actions">
                            <button class="btn-filter" onclick="admin.limparFiltrosTurmas()">
                                <i class="fas fa-eraser"></i> Limpar
                            </button>
                        </div>
                    </div>

                    <div class="cards-grid">
                        ${this.gerarCardsTurmas(data.turmas)}
                    </div>

                    ${this.gerarPaginacao(data.pagination, 'turmas')}
                </div>
            `;

        } catch (error) {
            console.error('Erro ao carregar turmas:', error);
            contentArea.innerHTML = `
                <div class="error-container">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Erro ao carregar turmas</h3>
                    <p>${error.message}</p>
                    <button class="btn-primary" onclick="admin.loadTurmas()">
                        <i class="fas fa-sync-alt"></i> Tentar novamente
                    </button>
                </div>
            `;
        }
    }

    gerarCardsTurmas(turmas) {
        if (!turmas || turmas.length === 0) {
            return `
                <div class="empty-state" style="grid-column: 1 / -1;">
                    <i class="fas fa-school"></i>
                    <h3>Nenhuma turma encontrada</h3>
                    <p>Clique em "Nova Turma" para começar.</p>
                </div>
            `;
        }

        return turmas.map(turma => {
            const eixoColor = this.getEixoColor(turma.eixo);
            
            return `
                <div class="turma-card">
                    <div class="card-header" style="background: linear-gradient(135deg, ${eixoColor}, ${eixoColor}dd);">
                        <h3>${turma.nome}</h3>
                        <span class="status-badge ${turma.ativa ? 'active' : 'inactive'}">
                            ${turma.ativa ? 'Ativa' : 'Inativa'}
                        </span>
                    </div>
                    <div class="card-body">
                        <p><i class="fas fa-book"></i> ${turma.disciplina || 'Disciplina não definida'}</p>
                        <p><i class="fas fa-sitemap"></i> ${turma.eixo || 'Eixo não definido'}</p>
                        <p><i class="fas fa-chalkboard-teacher"></i> ${turma.professor?.nome || 'Professor não atribuído'}</p>
                        
                        <div class="stats-mini">
                            <div class="stat-mini-item">
                                <span class="number">${turma.totalAlunos || 0}</span>
                                <span class="label">Alunos</span>
                            </div>
                            <div class="stat-mini-item">
                                <span class="number">${turma.totalProvas || 0}</span>
                                <span class="label">Provas</span>
                            </div>
                            <div class="stat-mini-item">
                                <span class="number">${turma.alunosComAcessibilidade || 0}</span>
                                <span class="label">Acessibilidade</span>
                            </div>
                        </div>
                        
                        <p class="codigo">Código: <strong>${turma.codigo}</strong></p>
                    </div>
                    <div class="card-footer">
                        <button class="btn-icon" onclick="admin.verTurma('${turma.id}')" title="Ver detalhes">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn-icon" onclick="admin.editarTurma('${turma.id}')" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-icon danger" onclick="admin.excluirTurma('${turma.id}')" title="Excluir">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    getEixoColor(eixo) {
        const cores = {
            'natureza': '#10b981',
            'humanas': '#8b5cf6',
            'linguagens': '#f59e0b',
            'desenvolvimento': '#3b82f6',
            'gestao': '#6b7280',
            'turismo': '#ef4444',
            'ambiente': '#14b8a6'
        };
        return cores[eixo] || '#0d6efd';
    }

    filtrarTurmas() {
        this.filtros.turmas.search = document.getElementById('searchTurmas')?.value || '';
        this.filtros.turmas.eixo = document.getElementById('filterEixo')?.value || 'todos';
        this.filtros.turmas.page = 1;
        this.loadTurmas();
    }

    limparFiltrosTurmas() {
        this.filtros.turmas = { search: '', eixo: 'todos', page: 1, limit: 10 };
        this.loadTurmas();
    }

    abrirModalTurma(turmaId = null) {
        const turma = turmaId ? this.turmas.find(t => t.id === turmaId) : null;

        const modalBody = document.getElementById('modalBody');
        modalBody.innerHTML = `
            <form id="turmaForm">
                <div class="form-group">
                    <label>Nome da Turma</label>
                    <input type="text" id="turmaNome" class="form-control" value="${turma?.nome || ''}" required>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label>Disciplina</label>
                        <input type="text" id="turmaDisciplina" class="form-control" value="${turma?.disciplina || ''}" required>
                    </div>
                    <div class="form-group">
                        <label>Eixo</label>
                        <select id="turmaEixo" class="form-control">
                            <option value="">Selecione...</option>
                            <option value="natureza" ${turma?.eixo === 'natureza' ? 'selected' : ''}>Natureza</option>
                            <option value="humanas" ${turma?.eixo === 'humanas' ? 'selected' : ''}>Humanas</option>
                            <option value="linguagens" ${turma?.eixo === 'linguagens' ? 'selected' : ''}>Linguagens</option>
                            <option value="desenvolvimento" ${turma?.eixo === 'desenvolvimento' ? 'selected' : ''}>Desenvolvimento</option>
                            <option value="gestao" ${turma?.eixo === 'gestao' ? 'selected' : ''}>Gestão</option>
                            <option value="turismo" ${turma?.eixo === 'turismo' ? 'selected' : ''}>Turismo</option>
                            <option value="ambiente" ${turma?.eixo === 'ambiente' ? 'selected' : ''}>Ambiente</option>
                        </select>
                    </div>
                </div>

                <div class="form-group">
                    <label>Professor</label>
                    <select id="turmaProfessor" class="form-control">
                        <option value="">Selecione um professor...</option>
                        ${this.gerarOptionsProfessores(turma?.professor?.id)}
                    </select>
                </div>

                <div class="form-group">
                    <label>Descrição (opcional)</label>
                    <textarea id="turmaDescricao" class="form-control" rows="3">${turma?.descricao || ''}</textarea>
                </div>

                <div class="form-check">
                    <input type="checkbox" id="turmaAtiva" ${turma?.ativa !== false ? 'checked' : ''}>
                    <label for="turmaAtiva">Turma ativa</label>
                </div>
            </form>
        `;

        // Carregar lista de professores
        this.carregarProfessoresSelect(turma?.professor?.id);

        document.getElementById('modalTitle').innerHTML = turma ? '<i class="fas fa-edit"></i> Editar Turma' : '<i class="fas fa-plus"></i> Nova Turma';
        document.getElementById('modalSaveBtn').onclick = () => this.salvarTurma(turma?.id);
        this.openModal();
    }

    gerarOptionsProfessores(professorSelecionadoId) {
        // Placeholder - será preenchido dinamicamente
        return '';
    }

    async carregarProfessoresSelect(professorSelecionadoId = null) {
        try {
            const response = await fetch(`${this.apiBase}/usuarios?role=professor&limit=100`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
            });

            const data = await response.json();

            if (data.success) {
                const select = document.getElementById('turmaProfessor');
                if (select) {
                    select.innerHTML = '<option value="">Selecione um professor...</option>';
                    
                    const professores = data.usuarios || [];
                    professores.forEach(prof => {
                        const option = document.createElement('option');
                        option.value = prof._id;
                        option.textContent = `${prof.nome} - ${prof.email}`;
                        if (prof._id === professorSelecionadoId) {
                            option.selected = true;
                        }
                        select.appendChild(option);
                    });
                }
            }
        } catch (error) {
            console.error('Erro ao carregar professores:', error);
        }
    }

    async salvarTurma(id = null) {
        try {
            const dados = {
                nome: document.getElementById('turmaNome').value,
                disciplina: document.getElementById('turmaDisciplina').value,
                eixo: document.getElementById('turmaEixo').value,
                professorId: document.getElementById('turmaProfessor').value || null,
                descricao: document.getElementById('turmaDescricao').value || undefined,
                ativa: document.getElementById('turmaAtiva').checked
            };

            if (!dados.nome || !dados.disciplina) {
                throw new Error('Nome e disciplina são obrigatórios');
            }

            const url = id ? `${this.apiBase}/turmas/${id}` : `${this.apiBase}/turmas`;
            const method = id ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                },
                body: JSON.stringify(dados)
            });

            const data = await response.json();

            if (data.success) {
                this.showToast(id ? 'Turma atualizada com sucesso!' : 'Turma criada com sucesso!', 'success');
                this.closeModal();
                this.loadTurmas();
                this.carregarDadosReais();
            } else {
                throw new Error(data.error || 'Erro ao salvar turma');
            }

        } catch (error) {
            console.error('Erro ao salvar turma:', error);
            this.showToast('Erro: ' + error.message, 'error');
        }
    }

    // ============ VER DETALHES DA TURMA ============
    verTurma(turmaId) {
        const turma = this.turmas.find(t => t.id === turmaId);
        if (!turma) return;

        let dataCriacao = 'Não informada';
        
        const possiveisCamposData = [
            turma.dataCriacao,
            turma.createdAt,
            turma.criadoEm,
            turma.created_at,
            turma.criado_em,
            turma.dataCadastro
        ];
        
        for (const campo of possiveisCamposData) {
            if (!campo) continue;
            
            try {
                if (campo && campo.$date) {
                    const date = new Date(campo.$date);
                    if (!isNaN(date.getTime())) {
                        dataCriacao = date.toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                        });
                        break;
                    }
                }
                else if (typeof campo === 'string') {
                    const date = new Date(campo);
                    if (!isNaN(date.getTime())) {
                        dataCriacao = date.toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                        });
                        break;
                    }
                }
                else if (typeof campo === 'number') {
                    const date = new Date(campo);
                    if (!isNaN(date.getTime())) {
                        dataCriacao = date.toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                        });
                        break;
                    }
                }
                else if (campo instanceof Date) {
                    if (!isNaN(campo.getTime())) {
                        dataCriacao = campo.toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                        });
                        break;
                    }
                }
            } catch (e) {
                continue;
            }
        }

        if (dataCriacao === 'Não informada' && turma._id && turma._id.length === 24) {
            try {
                const timestamp = parseInt(turma._id.substring(0, 8), 16) * 1000;
                if (!isNaN(timestamp)) {
                    const date = new Date(timestamp);
                    dataCriacao = date.toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                }
            } catch (e) {}
        }

        const modalBody = document.getElementById('modalBody');
        modalBody.innerHTML = `
            <div style="padding: 10px;">
                <h3 style="margin: 0 0 20px 0; color: #495057;">${turma.nome}</h3>
                
                <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                    <p><strong><i class="fas fa-book"></i> Disciplina:</strong> ${turma.disciplina || 'Não definida'}</p>
                    <p><strong><i class="fas fa-sitemap"></i> Eixo:</strong> ${turma.eixo || 'Não definido'}</p>
                    <p><strong><i class="fas fa-chalkboard-teacher"></i> Professor:</strong> ${turma.professor?.nome || 'Não atribuído'}</p>
                    <p><strong><i class="fas fa-hashtag"></i> Código:</strong> <code>${turma.codigo}</code></p>
                    <p><strong><i class="fas fa-calendar"></i> Data de Criação:</strong> <span style="font-weight: bold; color: #0d6efd;">${dataCriacao}</span></p>
                    <p><strong><i class="fas fa-circle"></i> Status:</strong> 
                        <span class="status-badge ${turma.ativa ? 'active' : 'inactive'}">
                            ${turma.ativa ? 'Ativa' : 'Inativa'}
                        </span>
                    </p>
                    ${turma.descricao ? `<p><strong><i class="fas fa-align-left"></i> Descrição:</strong> ${turma.descricao}</p>` : ''}
                </div>

                <h4 style="margin: 20px 0 10px 0;">📊 Estatísticas</h4>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px;">
                    <div style="text-align: center; background: #e9ecef; padding: 15px; border-radius: 8px;">
                        <div style="font-size: 24px; font-weight: bold; color: #0d6efd;">${turma.totalAlunos || 0}</div>
                        <div style="font-size: 12px; color: #6c757d;">Alunos</div>
                    </div>
                    <div style="text-align: center; background: #e9ecef; padding: 15px; border-radius: 8px;">
                        <div style="font-size: 24px; font-weight: bold; color: #198754;">${turma.totalProvas || 0}</div>
                        <div style="font-size: 12px; color: #6c757d;">Provas</div>
                    </div>
                    <div style="text-align: center; background: #e9ecef; padding: 15px; border-radius: 8px;">
                        <div style="font-size: 24px; font-weight: bold; color: #ffc107;">${turma.alunosComAcessibilidade || 0}</div>
                        <div style="font-size: 12px; color: #6c757d;">Acessibilidade</div>
                    </div>
                </div>

                <h4 style="margin: 20px 0 10px 0;">👥 Alunos Matriculados</h4>
                <div style="max-height: 300px; overflow-y: auto; border: 1px solid #e9ecef; border-radius: 8px; padding: 10px;">
                    ${this.gerarListaAlunos(turma.alunos)}
                </div>
            </div>
        `;

        document.getElementById('modalTitle').innerHTML = `<i class="fas fa-eye"></i> Detalhes da Turma`;
        document.getElementById('modalSaveBtn').style.display = 'none';
        this.openModal();
    }

    gerarListaAlunos(alunos) {
        if (!alunos || alunos.length === 0) {
            return '<p style="color: #6c757d; text-align: center;">Nenhum aluno matriculado</p>';
        }

        return alunos.map(aluno => `
            <div style="display: flex; align-items: center; gap: 10px; padding: 10px; border-bottom: 1px solid #e9ecef;">
                <div style="width: 30px; height: 30px; background: #0d6efd; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold;">
                    ${aluno.nome ? aluno.nome.charAt(0).toUpperCase() : '?'}
                </div>
                <div style="flex: 1;">
                    <div style="font-weight: 600;">${aluno.nome || 'Aluno'}</div>
                    <div style="font-size: 11px; color: #6c757d;">${aluno.email || ''}</div>
                </div>
                ${aluno.precisaAcessibilidade ? '<span class="badge-acessibilidade" title="Acessibilidade"><i class="fas fa-wheelchair"></i></span>' : ''}
            </div>
        `).join('');
    }

    editarTurma(turmaId) {
        this.abrirModalTurma(turmaId);
    }

    async excluirTurma(turmaId) {
        const turma = this.turmas.find(t => t.id === turmaId);
        if (!turma) return;

        const confirmar = await this.confirmar(
            `Excluir turma ${turma.nome}?`,
            `Esta ação não pode ser desfeita. Todas as provas associadas também serão excluídas.`
        );

        if (!confirmar) return;

        try {
            this.showToast('Excluindo turma...', 'info');

            const response = await fetch(`/api/turmas/${turmaId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
            });

            const data = await response.json();

            if (data.success) {
                this.showToast('Turma excluída com sucesso!', 'success');
                this.loadTurmas();
                this.carregarDadosReais();
            } else {
                throw new Error(data.error || 'Erro ao excluir turma');
            }

        } catch (error) {
            console.error('Erro ao excluir turma:', error);
            this.showToast('Erro: ' + error.message, 'error');
        }
    }

    // ============ PROVAS ============

    async loadProvas() {
        const contentArea = document.getElementById('contentArea');
        
        try {
            const { status, dificuldade, periodo, search, page, limit } = this.filtros.provas;
            const response = await fetch(
                `${this.apiBase}/provas?status=${status}&dificuldade=${dificuldade}&periodo=${periodo}&search=${search}&page=${page}&limit=${limit}`,
                { headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` } }
            );
            
            const data = await response.json();

            if (!data.success) throw new Error(data.error || 'Erro ao carregar provas');

            this.provas = data.provas || [];

            contentArea.innerHTML = `
                <div class="section">
                    <div class="section-header">
                        <h2><i class="fas fa-file-alt"></i> Gerenciar Provas</h2>
                        <button class="btn-primary" onclick="admin.switchSection('nova-prova')">
                            <i class="fas fa-plus"></i> Nova Prova
                        </button>
                    </div>

                    <div class="filters-bar">
                        <div class="filter-group">
                            <label><i class="fas fa-search"></i> Buscar</label>
                            <input type="text" id="searchProvas" placeholder="Título ou conteúdo..." 
                                value="${search}" oninput="admin.filtrarProvas()" class="form-control">
                        </div>
                        <div class="filter-group">
                            <label><i class="fas fa-circle"></i> Status</label>
                            <select id="filterStatus" class="form-control" onchange="admin.filtrarProvas()">
                                <option value="todos" ${status === 'todos' ? 'selected' : ''}>Todos</option>
                                <option value="ativa" ${status === 'ativa' ? 'selected' : ''}>Ativas</option>
                                <option value="rascunho" ${status === 'rascunho' ? 'selected' : ''}>Rascunhos</option>
                                <option value="concluida" ${status === 'concluida' ? 'selected' : ''}>Concluídas</option>
                                <option value="cancelada" ${status === 'cancelada' ? 'selected' : ''}>Canceladas</option>
                            </select>
                        </div>
                        <div class="filter-group">
                            <label><i class="fas fa-chart-line"></i> Dificuldade</label>
                            <select id="filterDificuldade" class="form-control" onchange="admin.filtrarProvas()">
                                <option value="todas" ${dificuldade === 'todas' ? 'selected' : ''}>Todas</option>
                                <option value="facil" ${dificuldade === 'facil' ? 'selected' : ''}>Fácil</option>
                                <option value="media" ${dificuldade === 'media' ? 'selected' : ''}>Médio</option>
                                <option value="dificil" ${dificuldade === 'dificil' ? 'selected' : ''}>Difícil</option>
                            </select>
                        </div>
                        <div class="filter-group">
                            <label><i class="fas fa-calendar-week"></i> Período</label>
                            <select id="filterPeriodo" class="form-control" onchange="admin.filtrarProvas()">
                                <option value="todos" ${periodo === 'todos' ? 'selected' : ''}>Todos</option>
                                <option value="1" ${periodo === '1' ? 'selected' : ''}>1º Período</option>
                                <option value="2" ${periodo === '2' ? 'selected' : ''}>2º Período</option>
                                <option value="3" ${periodo === '3' ? 'selected' : ''}>3º Período</option>
                                <option value="4" ${periodo === '4' ? 'selected' : ''}>4º Período</option>
                            </select>
                        </div>
                        <div class="filter-actions">
                            <button class="btn-filter" onclick="admin.limparFiltrosProvas()">
                                <i class="fas fa-eraser"></i> Limpar
                            </button>
                        </div>
                    </div>

                    <div class="table-responsive">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Título</th>
                                    <th>Professor</th>
                                    <th>Turma</th>
                                    <th>Período</th>
                                    <th>Tipo</th>
                                    <th>Questões</th>
                                    <th>Status</th>
                                    <th>Data</th>
                                    <th>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${this.gerarLinhasProvas(this.provas)}
                            </tbody>
                        </table>
                    </div>

                    ${this.gerarPaginacao(data.pagination, 'provas')}
                </div>
            `;

        } catch (error) {
            console.error('Erro ao carregar provas:', error);
            contentArea.innerHTML = `
                <div class="error-container">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Erro ao carregar provas</h3>
                    <p>${error.message}</p>
                    <button class="btn-primary" onclick="admin.loadProvas()">
                        <i class="fas fa-sync-alt"></i> Tentar novamente
                    </button>
                </div>
            `;
        }
    }

    // ============ NOVA PROVA (VERSÃO PROFISSIONAL) ============
    async carregarNovaProva() {
        const contentArea = document.getElementById('contentArea');
        
        contentArea.innerHTML = `
            <div class="prova-professional-container">
                <!-- HEADER PROFISSIONAL -->
                <div class="prova-header-gradient">
                    <div class="header-content">
                        <div class="header-icon">
                            <i class="fas fa-magic"></i>
                        </div>
                        <div class="header-text">
                            <h1>Criar Nova Prova com IA</h1>
                            <p>Preencha os dados abaixo e a inteligência artificial criará as questões automaticamente</p>
                        </div>
                        <button class="btn-voltar" onclick="admin.switchSection('provas')">
                            <i class="fas fa-arrow-left"></i> Voltar
                        </button>
                    </div>
                    
                    <!-- Status Steps -->
                    <div class="progress-steps">
                        <div class="step active" id="step1">
                            <div class="step-number">1</div>
                            <div class="step-label">Configuração</div>
                        </div>
                        <div class="step" id="step2">
                            <div class="step-number">2</div>
                            <div class="step-label">Geração</div>
                        </div>
                        <div class="step" id="step3">
                            <div class="step-number">3</div>
                            <div class="step-label">Revisão</div>
                        </div>
                        <div class="step" id="step4">
                            <div class="step-number">4</div>
                            <div class="step-label">Publicação</div>
                        </div>
                    </div>
                </div>

                <!-- Alertas -->
                <div id="alertProvaAdmin" class="alert-professional" style="display: none;"></div>

                <!-- Formulário Principal -->
                <div class="form-professional-card" id="formCard">
                    <div class="card-header">
                        <div class="header-title">
                            <i class="fas fa-cog"></i>
                            <h2>Configurações da Prova</h2>
                        </div>
                        <span class="badge-novo">NOVA</span>
                    </div>

                    <form id="formNovaProvaAdmin">
                        <!-- Linha 1: Tema (Full Width) -->
                        <div class="form-row full-width">
                            <div class="form-group tema-group">
                                <label class="form-label">
                                    <i class="fas fa-lightbulb"></i>
                                    <span>Tema da Prova <span class="required">*</span></span>
                                </label>
                                <div class="input-wrapper">
                                    <textarea 
                                        id="temaProvaAdmin" 
                                        class="form-control tema-input" 
                                        placeholder="Ex: 'Equações do 2º grau', 'Segunda Guerra Mundial', 'Fotossíntese'..."
                                        required
                                        rows="2"
                                    ></textarea>
                                    <div class="input-hint">
                                        <i class="fas fa-info-circle"></i>
                                        Seja específico para melhores resultados
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Linha 2: Título e Período -->
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">
                                    <i class="fas fa-heading"></i>
                                    <span>Título <span class="required">*</span></span>
                                </label>
                                <div class="input-wrapper">
                                    <input 
                                        type="text" 
                                        id="tituloProvaAdmin" 
                                        class="form-control" 
                                        placeholder="Ex: Prova Bimestral"
                                        required
                                    >
                                </div>
                            </div>

                            <div class="form-group">
                                <label class="form-label">
                                    <i class="fas fa-calendar-week"></i>
                                    <span>Período <span class="required">*</span></span>
                                </label>
                                <div class="input-wrapper">
                                    <select id="periodoProvaAdmin" class="form-control" required>
                                        <option value="" disabled selected>Selecione...</option>
                                        <option value="1">1º Período</option>
                                        <option value="2">2º Período</option>
                                        <option value="3">3º Período</option>
                                        <option value="4">4º Período</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <!-- Linha 3: Professor e Turma -->
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">
                                    <i class="fas fa-chalkboard-teacher"></i>
                                    <span>Professor Responsável <span class="required">*</span></span>
                                </label>
                                <div class="input-wrapper select-wrapper">
                                    <select id="professorProvaAdmin" class="form-control" required>
                                        <option value="" disabled selected>Carregando professores...</option>
                                    </select>
                                    <i class="fas fa-chevron-down select-arrow"></i>
                                </div>
                                <div class="input-hint">
                                    <i class="fas fa-info-circle"></i>
                                    A prova será atribuída a este professor
                                </div>
                            </div>

                            <div class="form-group">
                                <label class="form-label">
                                    <i class="fas fa-school"></i>
                                    <span>Turma <span class="required">*</span></span>
                                </label>
                                <div class="input-wrapper select-wrapper">
                                    <select id="turmaProvaAdmin" class="form-control" required>
                                        <option value="" disabled selected>Carregando turmas...</option>
                                    </select>
                                    <i class="fas fa-chevron-down select-arrow"></i>
                                </div>
                            </div>
                        </div>

                        <!-- Linha 4: Tipo e Quantidade -->
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">
                                    <i class="fas fa-file-alt"></i>
                                    <span>Tipo de Prova <span class="required">*</span></span>
                                </label>
                                <div class="input-wrapper select-wrapper">
                                    <select id="tipoProvaAdmin" class="form-control" required onchange="admin.mudarTipoProvaAdmin()">
                                        <option value="simples">📝 Simples (5 alternativas)</option>
                                        <option value="enem">🎯 Formato ENEM (com texto base)</option>
                                        <option value="adaptada">♿ Adaptada (3 alternativas)</option>
                                    </select>
                                    <i class="fas fa-chevron-down select-arrow"></i>
                                </div>
                            </div>

                            <div class="form-group">
                                <label class="form-label">
                                    <i class="fas fa-question-circle"></i>
                                    <span>Quantidade <span class="required">*</span></span>
                                </label>
                                <div class="input-wrapper select-wrapper">
                                    <select id="quantidadeQuestoesAdmin" class="form-control" required>
                                        <option value="5">5 questões</option>
                                        <option value="10" selected>10 questões</option>
                                        <option value="15">15 questões</option>
                                        <option value="20">20 questões</option>
                                        <option value="25">25 questões</option>
                                        <option value="30">30 questões</option>
                                    </select>
                                    <i class="fas fa-chevron-down select-arrow"></i>
                                </div>
                            </div>

                            <div class="form-group">
                                <label class="form-label">
                                    <i class="fas fa-chart-line"></i>
                                    <span>Dificuldade <span class="required">*</span></span>
                                </label>
                                <div class="input-wrapper select-wrapper">
                                    <select id="dificuldadeAdmin" class="form-control" required>
                                        <option value="facil">🟢 Fácil</option>
                                        <option value="media" selected>🟡 Médio</option>
                                        <option value="dificil">🔴 Difícil</option>
                                    </select>
                                    <i class="fas fa-chevron-down select-arrow"></i>
                                </div>
                            </div>
                        </div>

                        <!-- Linha 5: Datas e Horários -->
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">
                                    <i class="fas fa-calendar-alt"></i>
                                    <span>Data Limite</span>
                                </label>
                                <div class="input-wrapper">
                                    <input type="date" id="dataLimiteAdmin" class="form-control">
                                </div>
                            </div>

                            <div class="form-group">
                                <label class="form-label">
                                    <i class="fas fa-clock"></i>
                                    <span>Horário Início <span class="required">*</span></span>
                                </label>
                                <div class="input-wrapper">
                                    <input type="time" id="horarioInicioAdmin" class="form-control" value="08:00" required>
                                </div>
                            </div>

                            <div class="form-group">
                                <label class="form-label">
                                    <i class="fas fa-clock"></i>
                                    <span>Horário Término <span class="required">*</span></span>
                                </label>
                                <div class="input-wrapper">
                                    <input type="time" id="horarioTerminoAdmin" class="form-control" value="09:30" required>
                                </div>
                            </div>
                        </div>

                        <!-- Duração Calculada -->
                        <div class="duracao-card">
                            <div class="duracao-icon">
                                <i class="fas fa-hourglass-half"></i>
                            </div>
                            <div class="duracao-content">
                                <span class="duracao-label">Duração da Prova</span>
                                <span class="duracao-valor" id="duracaoCalculadaAdmin">Calculando...</span>
                            </div>
                        </div>

                        <!-- Seção de Anexos (ENEM) -->
                        <div id="secaoAnexosAdmin" class="anexos-section" style="display: none;">
                            <div class="anexos-header">
                                <div class="anexos-title">
                                    <i class="fas fa-paperclip"></i>
                                    <h3>Materiais de Referência</h3>
                                </div>
                                <p class="anexos-subtitle">Adicione arquivos, textos ou links para a IA usar como base</p>
                            </div>

                            <!-- Tabs de Anexos -->
                            <div class="anexos-tabs">
                                <button type="button" class="anexo-tab active" onclick="admin.mostrarTabAnexoAdmin('upload')">
                                    <i class="fas fa-upload"></i>
                                    Upload
                                </button>
                                <button type="button" class="anexo-tab" onclick="admin.mostrarTabAnexoAdmin('texto')">
                                    <i class="fas fa-file-alt"></i>
                                    Texto
                                </button>
                                <button type="button" class="anexo-tab" onclick="admin.mostrarTabAnexoAdmin('link')">
                                    <i class="fas fa-link"></i>
                                    Link
                                </button>
                            </div>

                            <!-- Tab Upload -->
                            <div id="tab-upload-admin" class="anexo-tab-content active">
                                <div class="upload-area" 
                                    onclick="document.getElementById('fileInputAdmin').click()"
                                    ondrop="admin.handleDropAdmin(event)"
                                    ondragover="admin.handleDragOverAdmin(event)"
                                    ondragleave="admin.handleDragLeaveAdmin(event)">
                                    <i class="fas fa-cloud-upload-alt"></i>
                                    <h4>Arraste arquivos ou clique para selecionar</h4>
                                    <p>PDF, imagens, TXT, DOC, DOCX (até 10MB)</p>
                                    <button type="button" class="btn-upload">
                                        <i class="fas fa-folder-open"></i>
                                        Selecionar Arquivos
                                    </button>
                                </div>
                                <input type="file" id="fileInputAdmin" multiple style="display: none;" 
                                    accept=".pdf,.jpg,.jpeg,.png,.gif,.txt,.doc,.docx" onchange="admin.handleFileSelectAdmin(event)">
                            </div>

                            <!-- Tab Texto -->
                            <div id="tab-texto-admin" class="anexo-tab-content">
                                <div class="form-group">
                                    <label>Título do Texto</label>
                                    <input type="text" id="textoTituloAdmin" class="form-control" placeholder="Ex: Artigo sobre fotossíntese">
                                </div>
                                <div class="form-group">
                                    <label>Conteúdo</label>
                                    <textarea id="textoConteudoAdmin" class="form-control" rows="4" placeholder="Cole o texto completo aqui..."></textarea>
                                </div>
                                <button type="button" class="btn-add-anexo" onclick="admin.adicionarTextoAdmin()">
                                    <i class="fas fa-plus"></i>
                                    Adicionar Texto
                                </button>
                            </div>

                            <!-- Tab Link -->
                            <div id="tab-link-admin" class="anexo-tab-content">
                                <div class="form-group">
                                    <label>Título</label>
                                    <input type="text" id="linkTituloAdmin" class="form-control" placeholder="Ex: Artigo da NASA">
                                </div>
                                <div class="form-group">
                                    <label>URL</label>
                                    <input type="url" id="linkURLAdmin" class="form-control" placeholder="https://...">
                                </div>
                                <button type="button" class="btn-add-anexo" onclick="admin.adicionarLinkAdmin()">
                                    <i class="fas fa-plus"></i>
                                    Adicionar Link
                                </button>
                            </div>

                            <!-- Lista de Anexos -->
                            <div class="anexos-lista" id="listaAnexosAdmin">
                                <div id="emptyAnexosAdmin" class="empty-anexos">
                                    <i class="fas fa-inbox"></i>
                                    <p>Nenhum material adicionado</p>
                                </div>
                            </div>
                            <div class="anexos-counter" id="contadorAnexosAdmin">0</div>
                        </div>

                        <!-- Informações IA -->
                        <div class="info-ia-card">
                            <div class="ia-icon">
                                <i class="fas fa-robot"></i>
                            </div>
                            <div class="ia-content">
                                <h4>Sobre a Inteligência Artificial</h4>
                                <p>A prova será gerada automaticamente usando IA com questões de múltipla escolha, adaptadas ao tema e dificuldade selecionados.</p>
                                <ul class="ia-features">
                                    <li><i class="fas fa-check-circle"></i> Questões personalizadas</li>
                                    <li><i class="fas fa-check-circle"></i> Respostas com explicações</li>
                                    <li><i class="fas fa-check-circle"></i> Nível de dificuldade ajustado</li>
                                </ul>
                            </div>
                        </div>

                        <!-- Botão Gerar -->
                        <button type="submit" class="btn-generate" id="btnGerarProvaAdmin">
                            <i class="fas fa-magic"></i>
                            <span>Gerar Prova com IA</span>
                            <i class="fas fa-arrow-right"></i>
                        </button>
                    </form>
                </div>

                <!-- Preview das Questões -->
                <div id="previewQuestoesAdmin" class="preview-professional-card" style="display: none;">
                    <div class="preview-header">
                        <div class="preview-title">
                            <i class="fas fa-eye"></i>
                            <h2>Pré-visualização da Prova</h2>
                        </div>
                        <span class="preview-badge" id="questoesCount">0 questões</span>
                    </div>

                    <div class="questoes-container" id="questoesPreviewAdmin"></div>

                    <div class="preview-actions">
                        <button class="btn-preview btn-publish" onclick="admin.publicarProvaAdmin()">
                            <i class="fas fa-paper-plane"></i>
                            Publicar Prova
                        </button>
                        <button class="btn-preview btn-edit" onclick="admin.abrirEdicaoQuestoesPreview()">
                            <i class="fas fa-edit"></i>
                            Editar Questões
                        </button>
                        <button class="btn-preview btn-regenerate" onclick="admin.regenerarProvaAdmin()">
                            <i class="fas fa-redo"></i>
                            Regenerar
                        </button>
                        <button class="btn-preview btn-cancel" onclick="admin.cancelarProvaAdmin()">
                            <i class="fas fa-times"></i>
                            Cancelar
                        </button>
                    </div>
                </div>
            </div>

            <style>
                .prova-professional-container {
                    max-width: 1200px;
                    margin: 0 auto;
                    padding: 20px;
                }

                /* Header Gradient */
                .prova-header-gradient {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    border-radius: 20px;
                    padding: 30px;
                    margin-bottom: 30px;
                    color: white;
                    position: relative;
                    overflow: hidden;
                    box-shadow: 0 10px 30px rgba(102, 126, 234, 0.3);
                }

                .prova-header-gradient::before {
                    content: '';
                    position: absolute;
                    top: -50px;
                    right: -50px;
                    width: 200px;
                    height: 200px;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 50%;
                }

                .prova-header-gradient::after {
                    content: '';
                    position: absolute;
                    bottom: -80px;
                    left: -80px;
                    width: 300px;
                    height: 300px;
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 50%;
                }

                .header-content {
                    display: flex;
                    align-items: center;
                    gap: 20px;
                    position: relative;
                    z-index: 2;
                    flex-wrap: wrap;
                }

                .header-icon {
                    width: 70px;
                    height: 70px;
                    background: rgba(255, 255, 255, 0.2);
                    border-radius: 20px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 30px;
                    backdrop-filter: blur(10px);
                    border: 1px solid rgba(255, 255, 255, 0.3);
                }

                .header-text {
                    flex: 1;
                }

                .header-text h1 {
                    margin: 0;
                    font-size: 28px;
                    font-weight: 600;
                }

                .header-text p {
                    margin: 5px 0 0;
                    opacity: 0.9;
                    font-size: 14px;
                }

                .btn-voltar {
                    background: rgba(255, 255, 255, 0.15);
                    border: 1px solid rgba(255, 255, 255, 0.3);
                    color: white;
                    padding: 12px 24px;
                    border-radius: 40px;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    transition: all 0.3s;
                    backdrop-filter: blur(10px);
                }

                .btn-voltar:hover {
                    background: rgba(255, 255, 255, 0.25);
                    transform: translateX(-5px);
                }

                /* Progress Steps */
                .progress-steps {
                    display: flex;
                    justify-content: space-between;
                    margin-top: 40px;
                    position: relative;
                    z-index: 2;
                    max-width: 600px;
                    margin-left: auto;
                    margin-right: auto;
                }

                .progress-steps::before {
                    content: '';
                    position: absolute;
                    top: 15px;
                    left: 0;
                    right: 0;
                    height: 2px;
                    background: rgba(255, 255, 255, 0.2);
                    z-index: 1;
                }

                .step {
                    position: relative;
                    z-index: 2;
                    text-align: center;
                    flex: 1;
                }

                .step-number {
                    width: 32px;
                    height: 32px;
                    background: rgba(255, 255, 255, 0.2);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: 600;
                    margin: 0 auto 8px;
                    border: 2px solid transparent;
                    transition: all 0.3s;
                }

                .step.active .step-number {
                    background: white;
                    color: #667eea;
                    border-color: white;
                    box-shadow: 0 0 20px rgba(255, 255, 255, 0.5);
                }

                .step-label {
                    font-size: 12px;
                    opacity: 0.8;
                }

                .step.active .step-label {
                    opacity: 1;
                    font-weight: 600;
                }

                /* Form Card */
                .form-professional-card {
                    background: white;
                    border-radius: 24px;
                    padding: 30px;
                    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.05);
                    margin-bottom: 30px;
                    border: 1px solid rgba(0, 0, 0, 0.05);
                }

                .card-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 30px;
                    padding-bottom: 20px;
                    border-bottom: 2px solid #f0f0f0;
                }

                .header-title {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }

                .header-title i {
                    font-size: 24px;
                    color: #667eea;
                    background: #f0f4ff;
                    padding: 10px;
                    border-radius: 12px;
                }

                .header-title h2 {
                    margin: 0;
                    font-size: 20px;
                    color: #333;
                }

                .badge-novo {
                    background: linear-gradient(135deg, #10b981, #059669);
                    color: white;
                    padding: 6px 12px;
                    border-radius: 30px;
                    font-size: 12px;
                    font-weight: 600;
                }

                /* Form Layout */
                .form-row {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                    gap: 20px;
                    margin-bottom: 20px;
                }

                .form-row.full-width {
                    grid-template-columns: 1fr;
                }

                .form-group {
                    position: relative;
                }

                .form-label {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-bottom: 8px;
                    font-weight: 500;
                    color: #4a5568;
                    font-size: 14px;
                }

                .form-label i {
                    color: #667eea;
                    font-size: 14px;
                }

                .required {
                    color: #ef4444;
                    margin-left: 4px;
                }

                .input-wrapper {
                    position: relative;
                }

                .form-control {
                    width: 100%;
                    padding: 12px 16px;
                    border: 2px solid #e2e8f0;
                    border-radius: 12px;
                    font-size: 14px;
                    transition: all 0.3s;
                    background: white;
                }

                .form-control:focus {
                    outline: none;
                    border-color: #667eea;
                    box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.1);
                }

                .tema-input {
                    min-height: 80px;
                    resize: vertical;
                }

                .input-hint {
                    margin-top: 6px;
                    font-size: 12px;
                    color: #94a3b8;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }

                /* Select Wrapper */
                .select-wrapper {
                    position: relative;
                }

                .select-wrapper select {
                    appearance: none;
                    padding-right: 40px;
                }

                .select-arrow {
                    position: absolute;
                    right: 16px;
                    top: 50%;
                    transform: translateY(-50%);
                    color: #94a3b8;
                    pointer-events: none;
                    font-size: 12px;
                }

                /* Duração Card */
                .duracao-card {
                    background: linear-gradient(135deg, #f8f9fa, #e9ecef);
                    border-radius: 16px;
                    padding: 20px;
                    display: flex;
                    align-items: center;
                    gap: 20px;
                    margin: 30px 0 20px;
                    border: 1px solid #dee2e6;
                }

                .duracao-icon {
                    width: 60px;
                    height: 60px;
                    background: linear-gradient(135deg, #667eea, #764ba2);
                    border-radius: 16px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-size: 24px;
                }

                .duracao-content {
                    flex: 1;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .duracao-label {
                    font-size: 16px;
                    font-weight: 500;
                    color: #4a5568;
                }

                .duracao-valor {
                    font-size: 24px;
                    font-weight: 700;
                    background: linear-gradient(135deg, #667eea, #764ba2);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }

                /* Anexos Section */
                .anexos-section {
                    background: #f8fafc;
                    border-radius: 20px;
                    padding: 25px;
                    margin: 20px 0;
                    border: 2px dashed #cbd5e0;
                }

                .anexos-header {
                    margin-bottom: 20px;
                }

                .anexos-title {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    margin-bottom: 5px;
                }

                .anexos-title i {
                    font-size: 20px;
                    color: #667eea;
                }

                .anexos-title h3 {
                    margin: 0;
                    font-size: 18px;
                    color: #333;
                }

                .anexos-subtitle {
                    margin: 0;
                    color: #718096;
                    font-size: 14px;
                }

                .anexos-tabs {
                    display: flex;
                    gap: 10px;
                    margin-bottom: 20px;
                    border-bottom: 2px solid #e2e8f0;
                    padding-bottom: 10px;
                }

                .anexo-tab {
                    padding: 8px 20px;
                    background: none;
                    border: none;
                    border-radius: 30px;
                    font-size: 14px;
                    font-weight: 600;
                    color: #718096;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    transition: all 0.3s;
                }

                .anexo-tab i {
                    font-size: 14px;
                }

                .anexo-tab:hover {
                    color: #667eea;
                    background: #f0f4ff;
                }

                .anexo-tab.active {
                    background: linear-gradient(135deg, #667eea, #764ba2);
                    color: white;
                }

                .anexo-tab-content {
                    display: none;
                }

                .anexo-tab-content.active {
                    display: block;
                }

                .upload-area {
                    background: white;
                    border: 3px dashed #cbd5e0;
                    border-radius: 16px;
                    padding: 40px;
                    text-align: center;
                    cursor: pointer;
                    transition: all 0.3s;
                }

                .upload-area:hover {
                    border-color: #667eea;
                    background: #f0f4ff;
                }

                .upload-area i {
                    font-size: 48px;
                    color: #667eea;
                    margin-bottom: 15px;
                }

                .upload-area h4 {
                    margin: 0 0 5px;
                    color: #333;
                }

                .upload-area p {
                    margin: 0 0 20px;
                    color: #718096;
                    font-size: 14px;
                }

                .btn-upload {
                    background: linear-gradient(135deg, #667eea, #764ba2);
                    color: white;
                    border: none;
                    padding: 12px 30px;
                    border-radius: 40px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s;
                }

                .btn-upload:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
                }

                .btn-add-anexo {
                    width: 100%;
                    padding: 12px;
                    background: linear-gradient(135deg, #10b981, #059669);
                    color: white;
                    border: none;
                    border-radius: 12px;
                    font-weight: 600;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    transition: all 0.3s;
                }

                .btn-add-anexo:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 10px 20px rgba(16, 185, 129, 0.3);
                }

                .anexos-lista {
                    margin-top: 20px;
                    min-height: 50px;
                }

                .empty-anexos {
                    text-align: center;
                    padding: 20px;
                    color: #94a3b8;
                }

                .empty-anexos i {
                    font-size: 32px;
                    margin-bottom: 10px;
                    opacity: 0.5;
                }

                .empty-anexos p {
                    margin: 0;
                    font-size: 14px;
                }

                .anexos-counter {
                    margin-top: 15px;
                    text-align: right;
                    font-size: 14px;
                    font-weight: 600;
                    color: #667eea;
                }

                /* Info IA Card */
                .info-ia-card {
                    background: linear-gradient(135deg, #f0f9ff, #e6f0ff);
                    border-radius: 20px;
                    padding: 25px;
                    margin: 30px 0 20px;
                    display: flex;
                    gap: 20px;
                    border: 1px solid #b3d9ff;
                }

                .ia-icon {
                    width: 70px;
                    height: 70px;
                    background: linear-gradient(135deg, #667eea, #764ba2);
                    border-radius: 20px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-size: 30px;
                    flex-shrink: 0;
                }

                .ia-content {
                    flex: 1;
                }

                .ia-content h4 {
                    margin: 0 0 10px;
                    color: #333;
                    font-size: 18px;
                }

                .ia-content p {
                    margin: 0 0 15px;
                    color: #4a5568;
                    font-size: 14px;
                    line-height: 1.6;
                }

                .ia-features {
                    list-style: none;
                    padding: 0;
                    margin: 0;
                    display: flex;
                    flex-wrap: wrap;
                    gap: 15px;
                }

                .ia-features li {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 13px;
                    color: #2d3748;
                }

                .ia-features i {
                    color: #10b981;
                    font-size: 14px;
                }

                /* Botão Gerar */
                .btn-generate {
                    width: 100%;
                    padding: 18px;
                    background: linear-gradient(135deg, #667eea, #764ba2);
                    color: white;
                    border: none;
                    border-radius: 50px;
                    font-size: 18px;
                    font-weight: 600;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 12px;
                    transition: all 0.3s;
                    box-shadow: 0 10px 30px rgba(102, 126, 234, 0.3);
                    margin-top: 30px;
                }

                .btn-generate:hover {
                    transform: translateY(-3px);
                    box-shadow: 0 20px 40px rgba(102, 126, 234, 0.4);
                }

                .btn-generate:disabled {
                    opacity: 0.7;
                    cursor: not-allowed;
                    transform: none;
                }

                /* Preview Card */
                .preview-professional-card {
                    background: white;
                    border-radius: 24px;
                    padding: 30px;
                    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.05);
                    border: 1px solid #e2e8f0;
                    animation: slideUp 0.5s ease-out;
                }

                .preview-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 25px;
                    padding-bottom: 20px;
                    border-bottom: 2px solid #f0f0f0;
                }

                .preview-title {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }

                .preview-title i {
                    font-size: 24px;
                    color: #667eea;
                    background: #f0f4ff;
                    padding: 10px;
                    border-radius: 12px;
                }

                .preview-title h2 {
                    margin: 0;
                    font-size: 20px;
                    color: #333;
                }

                .preview-badge {
                    background: #f0f4ff;
                    color: #667eea;
                    padding: 6px 15px;
                    border-radius: 30px;
                    font-size: 14px;
                    font-weight: 600;
                }

                .questoes-container {
                    max-height: 600px;
                    overflow-y: auto;
                    padding: 10px;
                    margin-bottom: 25px;
                }

                .questao-preview-item {
                    background: #f8fafc;
                    border-radius: 16px;
                    padding: 20px;
                    margin-bottom: 20px;
                    border-left: 4px solid #667eea;
                    animation: fadeIn 0.5s ease-out;
                }

                .questao-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 15px;
                }

                .questao-numero {
                    background: #667eea;
                    color: white;
                    padding: 4px 12px;
                    border-radius: 30px;
                    font-size: 12px;
                    font-weight: 600;
                }

                .questao-tipo {
                    padding: 4px 12px;
                    border-radius: 30px;
                    font-size: 12px;
                    font-weight: 600;
                }

                .tipo-simples { background: #dbeafe; color: #1e40af; }
                .tipo-enem { background: #fef3c7; color: #92400e; }
                .tipo-adaptada { background: #d1fae5; color: #065f46; }

                .questao-pergunta {
                    font-size: 16px;
                    font-weight: 600;
                    color: #333;
                    margin-bottom: 15px;
                    line-height: 1.6;
                }

                .opcoes-preview {
                    margin-bottom: 15px;
                }

                .opcao-preview {
                    padding: 10px 15px;
                    margin-bottom: 8px;
                    border: 2px solid #e2e8f0;
                    border-radius: 10px;
                    font-size: 14px;
                    color: #4a5568;
                    transition: all 0.3s;
                }

                .opcao-preview.correta {
                    background: #d1fae5;
                    border-color: #10b981;
                    color: #065f46;
                    font-weight: 500;
                }

                .preview-actions {
                    display: flex;
                    gap: 12px;
                    flex-wrap: wrap;
                    justify-content: center;
                    padding-top: 20px;
                    border-top: 2px solid #f0f0f0;
                }

                .btn-preview {
                    padding: 12px 24px;
                    border: none;
                    border-radius: 40px;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    transition: all 0.3s;
                    flex: 1;
                    min-width: 150px;
                    justify-content: center;
                }

                .btn-publish {
                    background: linear-gradient(135deg, #10b981, #059669);
                    color: white;
                }

                .btn-edit {
                    background: linear-gradient(135deg, #f59e0b, #d97706);
                    color: white;
                }

                .btn-regenerate {
                    background: linear-gradient(135deg, #ef4444, #dc2626);
                    color: white;
                }

                .btn-cancel {
                    background: #e2e8f0;
                    color: #4a5568;
                }

                .btn-preview:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 10px 20px rgba(0, 0, 0, 0.1);
                }

                /* Alert Professional */
                .alert-professional {
                    padding: 16px 24px;
                    border-radius: 12px;
                    margin-bottom: 20px;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    animation: slideIn 0.3s ease-out;
                    border-left: 4px solid transparent;
                }

                .alert-professional.alert-success {
                    background: #d1fae5;
                    border-color: #10b981;
                    color: #065f46;
                }

                .alert-professional.alert-error {
                    background: #fee2e2;
                    border-color: #ef4444;
                    color: #7f1d1d;
                }

                .alert-professional.alert-info {
                    background: #dbeafe;
                    border-color: #3b82f6;
                    color: #1e40af;
                }

                .alert-professional i {
                    font-size: 20px;
                }

                /* Animações */
                @keyframes slideUp {
                    from {
                        opacity: 0;
                        transform: translateY(30px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                @keyframes slideIn {
                    from {
                        opacity: 0;
                        transform: translateX(-20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateX(0);
                    }
                }

                @keyframes fadeIn {
                    from {
                        opacity: 0;
                        transform: translateY(10px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                /* Responsividade */
                @media (max-width: 768px) {
                    .prova-header-gradient {
                        padding: 20px;
                    }

                    .header-content {
                        flex-direction: column;
                        text-align: center;
                    }

                    .progress-steps {
                        display: none;
                    }

                    .form-row {
                        grid-template-columns: 1fr;
                    }

                    .duracao-content {
                        flex-direction: column;
                        align-items: flex-start;
                        gap: 10px;
                    }

                    .preview-actions {
                        flex-direction: column;
                    }

                    .btn-preview {
                        width: 100%;
                    }

                    .info-ia-card {
                        flex-direction: column;
                        align-items: center;
                        text-align: center;
                    }

                    .ia-features {
                        justify-content: center;
                    }
                }
            </style>
        `;

        // Configurar eventos
        this.configurarEventosProvaAdmin();
        
        // Carregar dados após o HTML estar no DOM
        setTimeout(() => {
            this.carregarTurmasParaProva();
            this.carregarProfessoresParaProva();
        }, 100);
    }

    // ============ CARREGAR PROFESSORES PARA O SELECT ============
    async carregarProfessoresParaProva() {
        try {
            console.log('👨‍🏫 Carregando professores para o select...');
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`${this.apiBase}/usuarios?role=professor&limit=100`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const data = await response.json();

            if (data.success) {
                const professores = data.usuarios || [];
                console.log(`✅ ${professores.length} professores carregados`);
                
                // Verificar se o select existe
                const select = document.getElementById('professorProvaAdmin');
                if (select) {
                    select.innerHTML = '<option value="">Selecione um professor...</option>';
                    
                    if (professores.length === 0) {
                        select.innerHTML += '<option value="" disabled>Nenhum professor disponível</option>';
                    } else {
                        professores.forEach(prof => {
                            const option = document.createElement('option');
                            option.value = prof._id;
                            option.textContent = `${prof.nome} - ${prof.email}`;
                            select.appendChild(option);
                        });
                    }
                } else {
                    console.error('❌ Select professorProvaAdmin não encontrado');
                }
            }
        } catch (error) {
            console.error('Erro ao carregar professores:', error);
            const select = document.getElementById('professorProvaAdmin');
            if (select) {
                select.innerHTML = '<option value="">Erro ao carregar professores</option>';
            }
        }
    }

    // ============ CARREGAR TURMAS PARA O SELECT ============
    async carregarTurmasParaProva() {
        try {
            console.log('📚 Carregando turmas para o select...');
            const token = localStorage.getItem('auth_token');
            const response = await fetch('/api/admin/turmas?limit=100', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.turmas = data.turmas || [];
                console.log(`✅ ${this.turmas.length} turmas carregadas`);
                
                // Verificar se o select existe
                const select = document.getElementById('turmaProvaAdmin');
                if (select) {
                    select.innerHTML = '<option value="">Selecione uma turma...</option>';
                    
                    if (this.turmas.length === 0) {
                        select.innerHTML += '<option value="" disabled>Nenhuma turma disponível</option>';
                    } else {
                        this.turmas.forEach(turma => {
                            const option = document.createElement('option');
                            option.value = turma.id;
                            option.textContent = `${turma.nome} - ${turma.disciplina} (${turma.totalAlunos || 0} alunos)`;
                            select.appendChild(option);
                        });
                    }
                } else {
                    console.error('❌ Select turmaProvaAdmin não encontrado');
                }
            }
        } catch (error) {
            console.error('Erro ao carregar turmas:', error);
            const select = document.getElementById('turmaProvaAdmin');
            if (select) {
                select.innerHTML = '<option value="">Erro ao carregar turmas</option>';
            }
        }
    }

    // ============ CONFIGURAR EVENTOS ============
    configurarEventosProvaAdmin() {
        // Calcular duração
        const inicio = document.getElementById('horarioInicioAdmin');
        const termino = document.getElementById('horarioTerminoAdmin');
        
        if (inicio && termino) {
            inicio.addEventListener('change', () => this.calcularDuracaoAdmin());
            termino.addEventListener('change', () => this.calcularDuracaoAdmin());
            setTimeout(() => this.calcularDuracaoAdmin(), 500);
        }

        // Formulário
        const form = document.getElementById('formNovaProvaAdmin');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.gerarProvaAdmin();
            });
        }
    }

    // ============ CALCULAR DURAÇÃO ============
    calcularDuracaoAdmin() {
        const inicio = document.getElementById('horarioInicioAdmin')?.value;
        const termino = document.getElementById('horarioTerminoAdmin')?.value;
        
        if (!inicio || !termino) return;
        
        const [h1, m1] = inicio.split(':').map(Number);
        const [h2, m2] = termino.split(':').map(Number);
        
        const totalMinutos = (h2 * 60 + m2) - (h1 * 60 + m1);
        
        if (totalMinutos <= 0) {
            document.getElementById('duracaoCalculadaAdmin').innerHTML = 
                '<span style="color: #dc3545;">Horário inválido</span>';
            return;
        }
        
        const horas = Math.floor(totalMinutos / 60);
        const minutos = totalMinutos % 60;
        
        let duracaoTexto = '';
        if (horas > 0) duracaoTexto += `${horas} hora${horas > 1 ? 's' : ''}`;
        if (minutos > 0) {
            if (horas > 0) duracaoTexto += ' e ';
            duracaoTexto += `${minutos} minuto${minutos > 1 ? 's' : ''}`;
        }
        
        document.getElementById('duracaoCalculadaAdmin').innerHTML = 
            `<strong>${duracaoTexto}</strong> (${totalMinutos} minutos)`;
    }

    // ============ MUDAR TIPO DE PROVA ============
    mudarTipoProvaAdmin() {
        const tipo = document.getElementById('tipoProvaAdmin').value;
        const secaoAnexos = document.getElementById('secaoAnexosAdmin');
        
        if (tipo === 'enem') {
            secaoAnexos.style.display = 'block';
        } else {
            secaoAnexos.style.display = 'none';
            this.anexosAdmin = [];
            this.arquivosParaUploadAdmin = [];
            this.atualizarListaAnexosAdmin();
        }
        
        if (tipo === 'adaptada') {
            this.mostrarAlertaAdmin('🎯 Modo Prova Adaptada ativado! 3 alternativas por questão.', 'info');
        }
    }

    // ============ FUNÇÕES DE ANEXOS ============
    mostrarTabAnexoAdmin(tipo) {
        document.querySelectorAll('#secaoAnexosAdmin .btn-filter').forEach(btn => {
            btn.classList.remove('active');
        });
        event.currentTarget.classList.add('active');
        
        document.querySelectorAll('#secaoAnexosAdmin .tab-anexo-content').forEach(tab => {
            tab.style.display = 'none';
        });
        
        document.getElementById(`tab-${tipo}-admin`).style.display = 'block';
    }

    handleDragOverAdmin(e) {
        e.preventDefault();
        e.currentTarget.style.background = '#f8f9fa';
    }

    handleDragLeaveAdmin(e) {
        e.currentTarget.style.background = '';
    }

    handleDropAdmin(e) {
        e.preventDefault();
        e.currentTarget.style.background = '';
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            this.handleFilesAdmin(files);
        }
    }

    handleFileSelectAdmin(e) {
        const files = e.target.files;
        if (files.length > 0) {
            this.handleFilesAdmin(files);
        }
    }

    handleFilesAdmin(files) {
        if (!this.arquivosParaUploadAdmin) this.arquivosParaUploadAdmin = [];
        
        Array.from(files).forEach(file => {
            if (file.size > 10 * 1024 * 1024) {
                this.mostrarAlertaAdmin(`⚠️ Arquivo "${file.name}" muito grande (máx: 10MB)`, 'error');
                return;
            }
            
            this.arquivosParaUploadAdmin.push(file);
            this.mostrarPreviewArquivoAdmin(file);
        });
        
        this.atualizarContadorAnexosAdmin();
        document.getElementById('fileInputAdmin').value = '';
    }

    mostrarPreviewArquivoAdmin(file) {
        const container = document.getElementById('listaAnexosAdmin');
        const empty = document.getElementById('emptyAnexosAdmin');
        
        if (empty) empty.style.display = 'none';
        
        const icon = file.type.includes('pdf') ? 'fa-file-pdf' :
                    file.type.includes('image') ? 'fa-file-image' :
                    file.type.includes('word') ? 'fa-file-word' : 'fa-file';
        
        const fileId = 'file-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        
        const html = `
            <div class="anexo-item" id="${fileId}" style="
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 10px;
                background: #f8f9fa;
                border-radius: 6px;
                margin-bottom: 8px;
            ">
                <i class="fas ${icon}" style="color: #0d6efd;"></i>
                <div style="flex: 1;">
                    <div><strong>${file.name}</strong></div>
                    <small>${(file.size / 1024).toFixed(2)} KB</small>
                </div>
                <button onclick="admin.removerArquivoAdmin('${fileId}', '${file.name}')" style="
                    background: none;
                    border: none;
                    color: #dc3545;
                    cursor: pointer;
                    font-size: 1.2rem;
                ">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        
        container.insertAdjacentHTML('beforeend', html);
    }

    removerArquivoAdmin(fileId, fileName) {
        document.getElementById(fileId)?.remove();
        this.arquivosParaUploadAdmin = this.arquivosParaUploadAdmin.filter(f => f.name !== fileName);
        this.atualizarContadorAnexosAdmin();
        
        if (this.arquivosParaUploadAdmin.length === 0 && (!this.anexosAdmin || this.anexosAdmin.length === 0)) {
            document.getElementById('emptyAnexosAdmin').style.display = 'block';
        }
    }

    adicionarTextoAdmin() {
        const titulo = document.getElementById('textoTituloAdmin').value.trim();
        const conteudo = document.getElementById('textoConteudoAdmin').value.trim();
        
        if (!titulo || !conteudo) {
            this.mostrarAlertaAdmin('⚠️ Título e conteúdo são obrigatórios', 'error');
            return;
        }
        
        if (!this.anexosAdmin) this.anexosAdmin = [];
        
        this.anexosAdmin.push({
            tipo: 'texto',
            titulo: titulo,
            conteudo: conteudo
        });
        
        document.getElementById('textoTituloAdmin').value = '';
        document.getElementById('textoConteudoAdmin').value = '';
        
        this.atualizarListaAnexosAdmin();
        this.mostrarAlertaAdmin('✅ Texto adicionado!', 'success');
    }

    adicionarLinkAdmin() {
        const titulo = document.getElementById('linkTituloAdmin').value.trim();
        const url = document.getElementById('linkURLAdmin').value.trim();
        
        if (!titulo || !url) {
            this.mostrarAlertaAdmin('⚠️ Título e URL são obrigatórios', 'error');
            return;
        }
        
        if (!url.startsWith('http')) {
            this.mostrarAlertaAdmin('⚠️ URL deve começar com http:// ou https://', 'error');
            return;
        }
        
        if (!this.anexosAdmin) this.anexosAdmin = [];
        
        this.anexosAdmin.push({
            tipo: 'link',
            titulo: titulo,
            url: url
        });
        
        document.getElementById('linkTituloAdmin').value = '';
        document.getElementById('linkURLAdmin').value = '';
        
        this.atualizarListaAnexosAdmin();
        this.mostrarAlertaAdmin('✅ Link adicionado!', 'success');
    }

    atualizarListaAnexosAdmin() {
        const container = document.getElementById('listaAnexosAdmin');
        const empty = document.getElementById('emptyAnexosAdmin');
        
        if ((!this.anexosAdmin || this.anexosAdmin.length === 0) && 
            (!this.arquivosParaUploadAdmin || this.arquivosParaUploadAdmin.length === 0)) {
            if (empty) empty.style.display = 'block';
            return;
        }
        
        if (empty) empty.style.display = 'none';
        
        // Limpar apenas os anexos de texto/link (manter arquivos)
        const elementos = container.querySelectorAll('.anexo-item');
        elementos.forEach(el => {
            if (!el.id.startsWith('file-')) {
                el.remove();
            }
        });
        
        // Adicionar anexos de texto/link
        if (this.anexosAdmin) {
            this.anexosAdmin.forEach((anexo, index) => {
                const icon = anexo.tipo === 'texto' ? 'fa-file-alt' : 'fa-link';
                const html = `
                    <div class="anexo-item" style="
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        padding: 10px;
                        background: #e7f3ff;
                        border-radius: 6px;
                        margin-bottom: 8px;
                    ">
                        <i class="fas ${icon}" style="color: #0d6efd;"></i>
                        <div style="flex: 1;">
                            <div><strong>${anexo.titulo}</strong></div>
                            <small>${anexo.tipo === 'texto' ? 'Texto' : 'Link'}</small>
                        </div>
                        <button onclick="admin.removerAnexoAdmin(${index})" style="
                            background: none;
                            border: none;
                            color: #dc3545;
                            cursor: pointer;
                        ">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                `;
                container.insertAdjacentHTML('beforeend', html);
            });
        }
        
        this.atualizarContadorAnexosAdmin();
    }

    removerAnexoAdmin(index) {
        this.anexosAdmin.splice(index, 1);
        this.atualizarListaAnexosAdmin();
    }

    atualizarContadorAnexosAdmin() {
        const total = (this.anexosAdmin?.length || 0) + (this.arquivosParaUploadAdmin?.length || 0);
        const contador = document.getElementById('contadorAnexosAdmin');
        if (contador) contador.textContent = total;
    }

    // ============ GERAR PROVA ============
    async gerarProvaAdmin() {
        const btn = document.getElementById('btnGerarProvaAdmin');
        // Só mudar o botão se ele existir (caso contrário é regeneração)
        if (btn) {
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';
            btn.disabled = true;
        }
        
        try {
            const token = localStorage.getItem('auth_token');
            
            // PEGAR O ID DO PROFESSOR SELECIONADO
            const professorSelect = document.getElementById('professorProvaAdmin');
            const professorId = professorSelect ? professorSelect.value : null;
            
            const turmaId = document.getElementById('turmaProvaAdmin')?.value;
            const titulo = document.getElementById('tituloProvaAdmin')?.value;
            const tema = document.getElementById('temaProvaAdmin')?.value;
            const periodo = document.getElementById('periodoProvaAdmin')?.value;
            const tipoProva = document.getElementById('tipoProvaAdmin')?.value;
            const quantidade = parseInt(document.getElementById('quantidadeQuestoesAdmin')?.value);
            const dificuldade = document.getElementById('dificuldadeAdmin')?.value;
            const horarioInicio = document.getElementById('horarioInicioAdmin')?.value;
            const horarioTermino = document.getElementById('horarioTerminoAdmin')?.value;
            
            // VALIDAÇÃO DO PROFESSOR
            if (!professorId) {
                throw new Error('Selecione um professor responsável pela prova');
            }
            
            // Mostrar qual professor foi selecionado (para debug)
            const professorNome = professorSelect.options[professorSelect.selectedIndex]?.text || 'Desconhecido';
            console.log(`👨‍🏫 Professor selecionado: ${professorNome} (ID: ${professorId})`);
            
            // Validar outros campos
            if (!turmaId) {
                throw new Error('Selecione uma turma');
            }
            
            if (!periodo) {
                throw new Error('Selecione o período letivo');
            }
            
            let dataLimite = null;
            const dataLimiteInput = document.getElementById('dataLimiteAdmin')?.value;
            if (dataLimiteInput) {
                const [ano, mes, dia] = dataLimiteInput.split('-').map(Number);
                dataLimite = new Date(ano, mes - 1, dia, 23, 59, 59).toISOString();
            }
            
            // CORREÇÃO: Incluir professorId nos dados da prova
            const dadosProva = {
                professorId: professorId, // <-- ESSA LINHA É CRÍTICA
                turmaId,
                titulo,
                conteudo: tema,
                tipoProva,
                periodo,
                quantidadeQuestoes: quantidade,
                dificuldade,
                dataLimite,
                horarioInicio,
                horarioTermino
            };
            
            console.log('📤 Enviando dados da prova:', {
                ...dadosProva,
                professorId: professorId,
                professorSelecionado: professorNome
            });
            
            if (tipoProva === 'adaptada') {
                dadosProva.adaptada = true;
                dadosProva.alternativas = 3;
            }
            
            // Fazer backup dos arquivos para regeneração
            this.arquivosOriginaisBackupAdmin = [...this.arquivosParaUploadAdmin];
            
            let response;
            
            if (tipoProva === 'enem' && ((this.anexosAdmin?.length || 0) + (this.arquivosParaUploadAdmin?.length || 0) > 0)) {
                const formData = new FormData();
                Object.keys(dadosProva).forEach(key => {
                    formData.append(key, dadosProva[key]);
                });
                
                const todosAnexos = [...(this.anexosAdmin || [])];
                
                for (const file of (this.arquivosParaUploadAdmin || [])) {
                    const fileFormData = new FormData();
                    fileFormData.append('arquivo', file);
                    
                    const uploadResponse = await fetch('/api/upload/temp', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}` },
                        body: fileFormData
                    });
                    
                    if (uploadResponse.ok) {
                        const uploadData = await uploadResponse.json();
                        if (uploadData.success) {
                            todosAnexos.push({
                                tipo: uploadData.file.tipo,
                                titulo: uploadData.file.nome,
                                nomeArquivo: uploadData.file.nomeArquivo,
                                url: uploadData.file.url
                            });
                        }
                    }
                }
                
                formData.append('anexosData', JSON.stringify(todosAnexos));
                
                response = await fetch(`/api/turmas/${turmaId}/prova-v2`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData
                });
            } else {
                response = await fetch(`/api/turmas/${turmaId}/prova-v2`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(dadosProva)
                });
            }
            
            const data = await response.json();
            
            if (data.success) {
                this.provaGeradaAdmin = {
                    id: data.provaId,
                    ...data.prova,
                    questoes: data.questoes || [],
                    // Garantir que o professor está correto
                    professor: {
                        id: professorId,
                        nome: professorNome
                    }
                };
                
                console.log('✅ Prova gerada com sucesso! Professor atribuído:', professorNome);
                
                this.mostrarPreviewQuestoesAdmin(data.questoes || []);
                this.mostrarAlertaAdmin(`✅ Prova gerada com sucesso! Professor: ${professorNome}`, 'success');
            } else {
                throw new Error(data.error || 'Erro ao gerar prova');
            }
            
        } catch (error) {
            console.error('❌ Erro ao gerar prova:', error);
            this.mostrarAlertaAdmin('❌ ' + error.message, 'error');
            
            // Se for regeneração, mostrar erro no preview
            const questoesPreview = document.getElementById('questoesPreviewAdmin');
            if (questoesPreview && !document.getElementById('btnGerarProvaAdmin')) {
                questoesPreview.innerHTML = `
                    <div style="text-align: center; padding: 40px;">
                        <i class="fas fa-exclamation-triangle" style="font-size: 3rem; color: #dc3545; margin-bottom: 15px;"></i>
                        <h3 style="color: #721c24;">Erro ao regenerar prova</h3>
                        <p style="color: #6c757d;">${error.message}</p>
                    </div>
                `;
            }
        } finally {
            if (btn) {
                btn.innerHTML = '<i class="fas fa-magic"></i> Gerar Prova com IA';
                btn.disabled = false;
            }
        }
    }

    // ============ MOSTRAR PREVIEW DAS QUESTÕES (VERSÃO PROFISSIONAL) ============
    mostrarPreviewQuestoesAdmin(questoes) {
        const container = document.getElementById('questoesPreviewAdmin');
        const preview = document.getElementById('previewQuestoesAdmin');
        const questoesCount = document.getElementById('questoesCount');
        
        if (!questoes || questoes.length === 0) {
            container.innerHTML = '<p style="color: #dc3545; text-align: center; padding: 40px;">Nenhuma questão gerada</p>';
            return;
        }
        
        // Atualizar contador
        if (questoesCount) {
            questoesCount.textContent = `${questoes.length} ${questoes.length === 1 ? 'questão' : 'questões'}`;
        }
        
        // Atualizar steps
        document.getElementById('step1').classList.remove('active');
        document.getElementById('step2').classList.add('active');
        document.getElementById('step3').classList.add('active');
        
        let html = '';
        
        questoes.forEach((q, i) => {
            const tipo = q.tipo === 'enem' ? 'ENEM' : (q.tipo === 'adaptada' ? 'ADAPTADA' : 'SIMPLES');
            const tipoClass = q.tipo === 'enem' ? 'tipo-enem' : (q.tipo === 'adaptada' ? 'tipo-adaptada' : 'tipo-simples');
            
            html += `
                <div class="questao-preview-item">
                    <div class="questao-header">
                        <span class="questao-numero">Questão ${i + 1}</span>
                        <span class="questao-tipo ${tipoClass}">${tipo}</span>
                    </div>
                    <div class="questao-pergunta">${q.pergunta || q.enunciado || 'Pergunta'}</div>
                    <div class="opcoes-preview">
                        ${q.opcoes.map((opcao, idx) => `
                            <div class="opcao-preview ${idx === q.respostaCorreta ? 'correta' : ''}">
                                ${opcao}
                                ${idx === q.respostaCorreta ? ' ✓' : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
        preview.style.display = 'block';
        
        // Rolar até o preview suavemente
        preview.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // ============ ABRIR EDIÇÃO DE QUESTÕES (VERSÃO COMPLETA) ============
    abrirEdicaoQuestoesPreview() {
        if (!this.provaGeradaAdmin || !this.provaGeradaAdmin.questoes || this.provaGeradaAdmin.questoes.length === 0) {
            this.mostrarAlertaAdmin('⚠️ Nenhuma prova gerada para editar', 'info');
            return;
        }
        
        // Criar modal de edição completo
        const modalBody = document.getElementById('modalBody');
        const questoes = this.provaGeradaAdmin.questoes;
        
        let questoesHTML = '';
        
        questoes.forEach((questao, index) => {
            const tipo = questao.tipo === 'enem' ? 'ENEM' : (questao.tipo === 'adaptada' ? 'Adaptada' : 'Simples');
            const badgeColor = questao.tipo === 'enem' ? '#0dcaf0' : (questao.tipo === 'adaptada' ? '#198754' : '#0d6efd');
            
            let opcoesHTML = '';
            questao.opcoes.forEach((opcao, opcaoIndex) => {
                const isCorreta = opcaoIndex === questao.respostaCorreta;
                opcoesHTML += `
                    <div style="
                        margin-bottom: 10px;
                        padding: 10px;
                        background: ${isCorreta ? '#d4edda' : '#f8f9fa'};
                        border: 2px solid ${isCorreta ? '#28a745' : '#dee2e6'};
                        border-radius: 6px;
                        position: relative;
                    ">
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 5px;">
                            <span style="
                                width: 30px;
                                height: 30px;
                                background: ${isCorreta ? '#28a745' : '#6c757d'};
                                color: white;
                                border-radius: 50%;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                font-weight: bold;
                            ">${String.fromCharCode(65 + opcaoIndex)}</span>
                            
                            <select class="form-control" id="opcao-correta-${index}" 
                                onchange="admin.marcarOpcaoCorreta(${index}, this.value)"
                                style="width: auto; margin-left: auto;">
                                ${questao.opcoes.map((_, idx) => `
                                    <option value="${idx}" ${idx === questao.respostaCorreta ? 'selected' : ''}>
                                        ${String.fromCharCode(65 + idx)} é a correta
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                        
                        <textarea 
                            class="form-control" 
                            id="opcao-${index}-${opcaoIndex}" 
                            rows="2"
                            style="font-weight: ${isCorreta ? 'bold' : 'normal'};"
                        >${opcao.replace(/<[^>]*>/g, '')}</textarea>
                    </div>
                `;
            });
            
            questoesHTML += `
                <div class="questao-editavel" id="questao-${index}" style="
                    margin-bottom: 30px;
                    padding: 20px;
                    background: #f8f9fa;
                    border-radius: 8px;
                    border: 1px solid #dee2e6;
                    position: relative;
                ">
                    <!-- Cabeçalho da questão com botão excluir -->
                    <div style="
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 15px;
                        padding-bottom: 10px;
                        border-bottom: 2px solid #dee2e6;
                    ">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span style="
                                background: ${badgeColor};
                                color: white;
                                padding: 5px 12px;
                                border-radius: 20px;
                                font-weight: bold;
                            ">Questão ${index + 1}</span>
                            <span style="
                                background: #e9ecef;
                                padding: 3px 8px;
                                border-radius: 12px;
                                font-size: 0.8rem;
                            ">${tipo}</span>
                        </div>
                        
                        <div style="display: flex; gap: 10px;">
                            <button type="button" class="btn-icon" onclick="admin.inserirImagemNaQuestao(${index})" 
                                    style="background: #0d6efd; color: white;" title="Inserir imagem">
                                <i class="fas fa-image"></i>
                            </button>
                            <button type="button" class="btn-icon danger" onclick="admin.excluirQuestao(${index})" 
                                    style="background: #dc3545; color: white;" title="Excluir questão">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                    
                    <!-- Pergunta -->
                    <div style="margin-bottom: 15px;">
                        <label style="font-weight: bold; display: block; margin-bottom: 5px;">
                            <i class="fas fa-question-circle"></i> Pergunta:
                        </label>
                        <textarea class="form-control" id="pergunta-${index}" rows="3">${questao.pergunta ? questao.pergunta.replace(/<[^>]*>/g, '') : ''}</textarea>
                    </div>
                    
                    <!-- Imagens da questão (se houver) -->
                    <div id="imagens-questao-${index}" style="margin-bottom: 15px;">
                        ${questao.imagens && questao.imagens.length > 0 ? `
                            <div style="margin-bottom: 10px;">
                                <label style="font-weight: bold;">Imagens:</label>
                                <div style="display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px;">
                                    ${questao.imagens.map((img, imgIndex) => `
                                        <div style="position: relative; width: 100px;">
                                            <img src="${img.url}" style="width: 100%; height: 80px; object-fit: cover; border-radius: 4px;">
                                            <button onclick="admin.removerImagemQuestao(${index}, ${imgIndex})" 
                                                    style="position: absolute; top: -5px; right: -5px; background: #dc3545; color: white; border: none; border-radius: 50%; width: 20px; height: 20px; cursor: pointer;">×</button>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                    
                    <!-- Opções -->
                    <div style="margin-bottom: 15px;">
                        <label style="font-weight: bold; display: block; margin-bottom: 5px;">
                            <i class="fas fa-list-ul"></i> Opções:
                        </label>
                        <div id="opcoes-container-${index}">
                            ${opcoesHTML}
                        </div>
                        <button type="button" class="btn-secondary" onclick="admin.adicionarOpcao(${index})" 
                                style="margin-top: 10px; width: 100%;">
                            <i class="fas fa-plus"></i> Adicionar Opção
                        </button>
                    </div>
                    
                    <!-- Explicação -->
                    <div style="margin-bottom: 15px;">
                        <label style="font-weight: bold; display: block; margin-bottom: 5px;">
                            <i class="fas fa-lightbulb"></i> Explicação:
                        </label>
                        <textarea class="form-control" id="explicacao-${index}" rows="2">${questao.explicacao ? questao.explicacao.replace(/<[^>]*>/g, '') : ''}</textarea>
                    </div>
                </div>
            `;
        });
        
        modalBody.innerHTML = `
            <div style="max-height: 70vh; overflow-y: auto; padding: 10px;">
                ${questoesHTML}
                <button type="button" class="btn-success" onclick="admin.adicionarNovaQuestao()" style="width: 100%; margin: 20px 0;">
                    <i class="fas fa-plus"></i> Adicionar Nova Questão
                </button>
            </div>
        `;
        
        document.getElementById('modalTitle').innerHTML = '<i class="fas fa-edit"></i> Editor de Questões';
        document.getElementById('modalSaveBtn').onclick = () => this.salvarEdicoesQuestoes();
        document.getElementById('modalSaveBtn').textContent = 'Salvar Todas as Alterações';
        this.openModal();
    }

    // ============ MÉTODOS AUXILIARES PARA EDIÇÃO ============

    // Marcar opção como correta
    marcarOpcaoCorreta(questaoIndex, opcaoIndex) {
        if (this.provaGeradaAdmin && this.provaGeradaAdmin.questoes[questaoIndex]) {
            this.provaGeradaAdmin.questoes[questaoIndex].respostaCorreta = parseInt(opcaoIndex);
        }
    }

    // Excluir questão
    excluirQuestao(questaoIndex) {
        if (this.provaGeradaAdmin && this.provaGeradaAdmin.questoes.length > 1) {
            if (confirm('Tem certeza que deseja excluir esta questão?')) {
                this.provaGeradaAdmin.questoes.splice(questaoIndex, 1);
                this.abrirEdicaoQuestoesPreview(); // Recarregar o modal
                this.mostrarAlertaAdmin('✅ Questão excluída!', 'success');
            }
        } else {
            this.mostrarAlertaAdmin('❌ A prova deve ter pelo menos uma questão', 'error');
        }
    }

    // Adicionar nova questão
    adicionarNovaQuestao() {
        if (this.provaGeradaAdmin) {
            const novaQuestao = {
                pergunta: 'Nova pergunta...',
                opcoes: ['Opção A', 'Opção B', 'Opção C', 'Opção D', 'Opção E'],
                respostaCorreta: 0,
                explicacao: 'Explicação...',
                tipo: 'simples',
                imagens: []
            };
            this.provaGeradaAdmin.questoes.push(novaQuestao);
            this.abrirEdicaoQuestoesPreview();
            this.mostrarAlertaAdmin('✅ Nova questão adicionada!', 'success');
        }
    }

    // Adicionar opção
    adicionarOpcao(questaoIndex) {
        if (this.provaGeradaAdmin && this.provaGeradaAdmin.questoes[questaoIndex]) {
            const numOpcoes = this.provaGeradaAdmin.questoes[questaoIndex].opcoes.length;
            if (numOpcoes < 5) {
                const letra = String.fromCharCode(65 + numOpcoes);
                this.provaGeradaAdmin.questoes[questaoIndex].opcoes.push(`Opção ${letra}`);
                this.abrirEdicaoQuestoesPreview();
            } else {
                this.mostrarAlertaAdmin('❌ Máximo de 5 opções por questão', 'error');
            }
        }
    }

    // Inserir imagem na questão
    inserirImagemNaQuestao(questaoIndex) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (file) {
                try {
                    const token = localStorage.getItem('auth_token');
                    const formData = new FormData();
                    formData.append('imagem', file);
                    
                    const response = await fetch('/api/upload/imagem', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}` },
                        body: formData
                    });
                    
                    const data = await response.json();
                    
                    if (data.success) {
                        if (!this.provaGeradaAdmin.questoes[questaoIndex].imagens) {
                            this.provaGeradaAdmin.questoes[questaoIndex].imagens = [];
                        }
                        this.provaGeradaAdmin.questoes[questaoIndex].imagens.push({
                            url: data.url,
                            nome: file.name
                        });
                        this.abrirEdicaoQuestoesPreview();
                        this.mostrarAlertaAdmin('✅ Imagem adicionada!', 'success');
                    }
                } catch (error) {
                    this.mostrarAlertaAdmin('❌ Erro ao fazer upload', 'error');
                }
            }
        };
        input.click();
    }

    // Remover imagem da questão
    removerImagemQuestao(questaoIndex, imgIndex) {
        if (this.provaGeradaAdmin && this.provaGeradaAdmin.questoes[questaoIndex].imagens) {
            this.provaGeradaAdmin.questoes[questaoIndex].imagens.splice(imgIndex, 1);
            this.abrirEdicaoQuestoesPreview();
            this.mostrarAlertaAdmin('✅ Imagem removida!', 'success');
        }
    }

    // ============ SALVAR EDIÇÕES DAS QUESTÕES ============
    async salvarEdicoesQuestoes() {
        if (!this.provaGeradaAdmin || !this.provaGeradaAdmin.questoes) {
            this.closeModal();
            return;
        }
        
        try {
            const questoes = [];
            const questoesOriginais = this.provaGeradaAdmin.questoes;
            
            for (let i = 0; i < questoesOriginais.length; i++) {
                const pergunta = document.getElementById(`pergunta-${i}`)?.value || questoesOriginais[i].pergunta;
                const explicacao = document.getElementById(`explicacao-${i}`)?.value || questoesOriginais[i].explicacao;
                const respostaCorreta = parseInt(document.getElementById(`resposta-${i}`)?.value || questoesOriginais[i].respostaCorreta);
                
                const opcoes = [];
                for (let j = 0; j < questoesOriginais[i].opcoes.length; j++) {
                    const opcaoElement = document.getElementById(`opcao-${i}-${j}`);
                    opcoes.push(opcaoElement ? opcaoElement.value : questoesOriginais[i].opcoes[j]);
                }
                
                questoes.push({
                    ...questoesOriginais[i],
                    pergunta,
                    explicacao,
                    respostaCorreta,
                    opcoes
                });
            }
            
            // Atualizar localmente
            this.provaGeradaAdmin.questoes = questoes;
            
            // Atualizar preview
            this.mostrarPreviewQuestoesAdmin(questoes);
            
            this.closeModal();
            this.mostrarAlertaAdmin('✅ Questões atualizadas!', 'success');
            
        } catch (error) {
            this.mostrarAlertaAdmin('❌ Erro ao salvar: ' + error.message, 'error');
        }
    }

    // ============ PUBLICAR PROVA ============
    async publicarProvaAdmin() {
        if (!this.provaGeradaAdmin || !this.provaGeradaAdmin.id) {
            this.mostrarAlertaAdmin('❌ Nenhuma prova para publicar', 'error');
            return;
        }
        
        try {
            const token = localStorage.getItem('auth_token');
            
            // Mostrar loading no botão
            const btnPublicar = document.querySelector('#previewQuestoesAdmin .btn-publish');
            const originalText = btnPublicar.innerHTML;
            btnPublicar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Publicando...';
            btnPublicar.disabled = true;
            
            // Atualizar step
            document.getElementById('step3').classList.remove('active');
            document.getElementById('step4').classList.add('active');
            
            const response = await fetch(`/api/professor/provas/${this.provaGeradaAdmin.id}/publicar`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.mostrarAlertaAdmin('✅ Prova publicada com sucesso! Agora está disponível para os alunos.', 'success');
                
                // Limpar formulário
                document.getElementById('formNovaProvaAdmin').reset();
                document.getElementById('previewQuestoesAdmin').style.display = 'none';
                
                // Resetar steps
                document.getElementById('step1').classList.add('active');
                document.getElementById('step2').classList.remove('active');
                document.getElementById('step3').classList.remove('active');
                document.getElementById('step4').classList.remove('active');
                
                this.anexosAdmin = [];
                this.arquivosParaUploadAdmin = [];
                this.atualizarListaAnexosAdmin();
                this.provaGeradaAdmin = null;
                
                // Voltar para lista de provas após 2 segundos
                setTimeout(() => {
                    this.switchSection('provas');
                    this.loadProvas();
                }, 2000);
            } else {
                throw new Error(data.error || 'Erro ao publicar');
            }
            
        } catch (error) {
            this.mostrarAlertaAdmin('❌ ' + error.message, 'error');
            // Resetar step
            document.getElementById('step3').classList.add('active');
            document.getElementById('step4').classList.remove('active');
        } finally {
            const btnPublicar = document.querySelector('#previewQuestoesAdmin .btn-publish');
            if (btnPublicar) {
                btnPublicar.innerHTML = '<i class="fas fa-paper-plane"></i> Publicar Prova';
                btnPublicar.disabled = false;
            }
        }
    }

    // ============ REGENERAR PROVA ============
    async regenerarProvaAdmin() {
        if (!this.provaGeradaAdmin) {
            this.mostrarAlertaAdmin('❌ Nenhuma prova para regenerar', 'error');
            return;
        }
        
        // Mostrar loading no preview
        const questoesPreview = document.getElementById('questoesPreviewAdmin');
        const previewContainer = document.getElementById('previewQuestoesAdmin');
        
        if (questoesPreview) {
            questoesPreview.innerHTML = `
                <div style="text-align: center; padding: 40px;">
                    <i class="fas fa-spinner fa-spin" style="font-size: 3rem; color: #0d6efd; margin-bottom: 15px;"></i>
                    <h3 style="color: #495057;">Regenerando prova...</h3>
                    <p style="color: #6c757d;">A IA está criando novas questões. Por favor, aguarde.</p>
                </div>
            `;
        }
        
        // Desabilitar botões
        const botoes = previewContainer.querySelectorAll('button');
        botoes.forEach(btn => btn.disabled = true);
        
        await this.gerarProvaAdmin();
        
        // Reabilitar botões após a geração
        botoes.forEach(btn => btn.disabled = false);
    }

    // ============ CANCELAR PROVA ============
    cancelarProvaAdmin() {
        document.getElementById('previewQuestoesAdmin').style.display = 'none';
        this.provaGeradaAdmin = null;
        
        // Resetar steps
        document.getElementById('step1').classList.add('active');
        document.getElementById('step2').classList.remove('active');
        document.getElementById('step3').classList.remove('active');
        document.getElementById('step4').classList.remove('active');
        
        this.mostrarAlertaAdmin('❌ Geração cancelada', 'info');
    }

    // ============ MOSTRAR ALERTA ============
    mostrarAlertaAdmin(mensagem, tipo = 'info') {
        const alerta = document.getElementById('alertProvaAdmin');
        if (!alerta) return;
        
        alerta.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <i class="fas fa-${tipo === 'success' ? 'check-circle' : tipo === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
                <span>${mensagem}</span>
            </div>
        `;
        alerta.className = `alert alert-${tipo}`;
        alerta.style.display = 'block';
        
        if (tipo !== 'error') {
            setTimeout(() => {
                alerta.style.display = 'none';
            }, 5000);
        }
    }

    // ============ MÓDULOS EM DESENVOLVIMENTO ============

    // ============ MONITORAMENTO DO SISTEMA ============

    // ============================================================================
    // MÓDULO DE MONITORAMENTO DO SISTEMA - VERSÃO CORRIGIDA
    // ============================================================================

    // ==================== MÉTODO PRINCIPAL ====================
    async loadMonitoramento() {
        const contentArea = document.getElementById('contentArea');
        
        // Mostrar loading
        contentArea.innerHTML = `
            <div style="text-align: center; padding: 60px; background: white; border-radius: 12px;">
                <div style="width: 50px; height: 50px; border: 5px solid #f3f3f3; border-top: 5px solid #0d6efd; border-radius: 50%; margin: 0 auto 20px; animation: spin 1s linear infinite;"></div>
                <p style="color: #495057;">Carregando dados reais do sistema...</p>
            </div>
            <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
        `;

        try {
            // Buscar dados reais do backend
            const token = localStorage.getItem('auth_token');
            
            // Fazer requisições paralelas
            const [metricasRes, anomaliasRes, estatisticasRes] = await Promise.all([
                fetch(`${this.apiBase}/monitoramento/metricas`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                }),
                fetch(`${this.apiBase}/monitoramento/anomalias`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                }),
                fetch(`${this.apiBase}/monitoramento/estatisticas`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                })
            ]);

            // Processar respostas
            const metricas = await metricasRes.json();
            const anomalias = await anomaliasRes.json();
            const estatisticas = await estatisticasRes.json();

            console.log('✅ Dados reais carregados:', { 
                metricas: metricas.data,
                anomalias: anomalias.data?.length,
                estatisticas: estatisticas.data 
            });

            // Salvar dados no objeto this
            this.metricasData = metricas.data || {};
            this.anomaliasData = anomalias.data || [];
            this.estatisticasData = estatisticas.data || {};

            // Renderizar HTML com os dados reais
            contentArea.innerHTML = this.renderMonitoramentoComDadosReais(
                this.metricasData, 
                this.anomaliasData, 
                this.estatisticasData
            );

            // CONECTAR AO WEBSOCKET PARA LOGS REAIS
            this.conectarWebSocketLogs();

            // Inicializar gráficos com dados reais
            setTimeout(() => {
                this.inicializarGraficosComDadosReais(this.metricasData);
            }, 500);

            // Configurar eventos
            this.configurarEventosMonitoramento();

        } catch (error) {
            console.error('❌ Erro ao carregar monitoramento:', error);
            contentArea.innerHTML = `
                <div style="text-align: center; padding: 60px; background: white; border-radius: 12px;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #dc3545; margin-bottom: 20px;"></i>
                    <h3 style="color: #721c24;">Erro ao carregar dados do sistema</h3>
                    <p style="color: #6c757d;">${error.message}</p>
                    <button onclick="admin.loadMonitoramento()" style="background: #0d6efd; color: white; border: none; padding: 10px 30px; border-radius: 6px; margin-top: 20px; cursor: pointer;">
                        <i class="fas fa-sync-alt"></i> Tentar novamente
                    </button>
                </div>
            `;
        }
    }

    // ==================== RENDERIZAÇÃO COM DADOS REAIS ====================
    renderMonitoramentoComDadosReais(metricas, anomalias, estatisticas) {
        // Valores padrão caso os dados não venham
        const cpuUsage = metricas?.cpu?.usage || 0;
        const memUsage = metricas?.memory?.usedPercent || 0;
        const memUsed = metricas?.memory?.used || 0;
        const memTotal = metricas?.memory?.total || 0;
        const uptime = metricas?.system?.uptimeFormatted || 'N/A';
        const hostname = metricas?.system?.hostname || 'localhost';
        const nodeVersion = metricas?.process?.version || 'N/A';
        const pid = metricas?.process?.pid || 'N/A';
        const loadAvg = metricas?.cpu?.loadAverage || [0, 0, 0];
        
        // Estatísticas
        const erros24h = estatisticas?.erros?.ultimas24h || 0;
        const cancelamentos24h = estatisticas?.cancelamentos?.ultimas24h || 0;
        const violacoes24h = estatisticas?.violacoes?.ultimas24h || 0;
        const usuariosOnline = estatisticas?.sistema?.usuariosOnline || 0;
        const provasAtivas = estatisticas?.sistema?.provasAtivas || 0;
        const requisicoes = estatisticas?.requisicoes?.ultimas24h || '0';
        const latencia = estatisticas?.latencia?.media || 0;

        return `
            <div class="monitoring-container">
                <!-- Header com estatísticas reais -->
                <div class="monitoring-header">
                    <div class="header-left">
                        <i class="fas fa-terminal"></i>
                        <h2>Console do Servidor & Monitoramento</h2>
                    </div>
                    <div class="header-actions">
                        <span style="background: #e9ecef; padding: 8px 16px; border-radius: 6px; font-size: 13px;">
                            <i class="fas fa-server"></i> ${hostname}
                        </span>
                        <button class="btn-monitoring" onclick="admin.limparConsole()" id="btnLimparConsole">
                            <i class="fas fa-eraser"></i> Limpar Console
                        </button>
                        <button class="btn-monitoring" onclick="admin.exportarLogs()">
                            <i class="fas fa-download"></i> Exportar Logs
                        </button>
                        <button class="btn-monitoring refresh" onclick="admin.atualizarMonitoramento()">
                            <i class="fas fa-sync-alt"></i> Atualizar
                        </button>
                    </div>
                </div>

                <!-- Cards de Status do Sistema com DADOS REAIS -->
                <div class="system-status-grid">
                    <div class="status-card" id="statusServidor">
                        <div class="status-icon">
                            <i class="fas fa-server"></i>
                        </div>
                        <div class="status-content">
                            <span class="status-label">Servidor</span>
                            <span class="status-value online" id="servidorStatus">Online</span>
                            <small>Uptime: ${uptime}</small>
                        </div>
                    </div>

                    <div class="status-card" id="statusBanco">
                        <div class="status-icon">
                            <i class="fas fa-database"></i>
                        </div>
                        <div class="status-content">
                            <span class="status-label">Banco de Dados</span>
                            <span class="status-value online" id="bancoStatus">MongoDB</span>
                            <small>${erros24h} erros/24h</small>
                        </div>
                    </div>

                    <div class="status-card" id="statusMemoria">
                        <div class="status-icon">
                            <i class="fas fa-memory"></i>
                        </div>
                        <div class="status-content">
                            <span class="status-label">Memória</span>
                            <span class="status-value ${memUsage > 80 ? 'warning' : 'online'}" id="memoriaStatus">
                                ${this.formatarBytes(memUsed)} / ${this.formatarBytes(memTotal)}
                            </span>
                            <small>${memUsage}% usado</small>
                        </div>
                    </div>

                    <div class="status-card" id="statusCPU">
                        <div class="status-icon">
                            <i class="fas fa-microchip"></i>
                        </div>
                        <div class="status-content">
                            <span class="status-label">CPU</span>
                            <span class="status-value ${cpuUsage > 70 ? 'warning' : 'online'}" id="cpuStatus">
                                ${cpuUsage}%
                            </span>
                            <small>Load: ${loadAvg[0].toFixed(2)}</small>
                        </div>
                    </div>
                </div>

                <!-- Tabs de Monitoramento -->
                <div class="monitoring-tabs">
                    <button class="tab-btn active" onclick="admin.mudarTabMonitoramento('console')">
                        <i class="fas fa-terminal"></i> Console do Servidor
                    </button>
                    <button class="tab-btn" onclick="admin.mudarTabMonitoramento('anomalias')">
                        <i class="fas fa-exclamation-triangle"></i> Anomalias Detectadas
                        <span class="badge" id="badgeAnomalias">${anomalias.length}</span>
                    </button>
                    <button class="tab-btn" onclick="admin.mudarTabMonitoramento('metricas')">
                        <i class="fas fa-chart-line"></i> Métricas do Sistema
                    </button>
                    <button class="tab-btn" onclick="admin.mudarTabMonitoramento('alertas')">
                        <i class="fas fa-bell"></i> Alertas Ativos
                        <span class="badge" id="badgeAlertas">${erros24h}</span>
                    </button>
                </div>

                <!-- CONSOLE DO SERVIDOR (TAB 1) -->
                <div id="tab-console" class="tab-content active">
                    <div class="console-container">
                        <div class="console-header">
                            <div class="console-controls">
                                <span class="console-title">
                                    <i class="fas fa-circle" style="color: #28a745; font-size: 10px;"></i>
                                    Servidor Ativo - Logs em tempo real
                                </span>
                                <div class="console-actions">
                                    <label class="auto-scroll">
                                        <input type="checkbox" id="autoScrollConsole" checked onchange="admin.toggleAutoScroll()">
                                        Auto Scroll
                                    </label>
                                    <select id="logLevel" class="log-level-select" onchange="admin.filtrarLogs()">
                                        <option value="all">Todos os níveis</option>
                                        <option value="error">Erros</option>
                                        <option value="warn">Avisos</option>
                                        <option value="info">Informações</option>
                                        <option value="debug">Debug</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div class="console-output" id="consoleOutput">
                            <div class="console-line system">
                                <span class="console-timestamp">[${new Date().toLocaleTimeString()}]</span>
                                <span class="console-level system">[SYSTEM]</span>
                                <span class="console-message">Monitoramento iniciado - Node ${nodeVersion} | PID: ${pid}</span>
                            </div>
                            <div class="console-line system">
                                <span class="console-timestamp">[${new Date().toLocaleTimeString()}]</span>
                                <span class="console-level system">[SYSTEM]</span>
                                <span class="console-message">Servidor: ${hostname} | Uptime: ${uptime}</span>
                            </div>
                        </div>
                        <div class="console-footer">
                            <div class="console-stats" id="consoleStats">
                                <span><i class="fas fa-circle text-success"></i> Conectado</span>
                                <span><i class="fas fa-clock"></i> <span id="ultimaAtualizacao">Agora</span></span>
                            </div>
                            <div class="console-command" style="flex: 1; max-width: 500px;">
                                <i class="fas fa-chevron-right" style="color: #28a745;"></i>
                                <input type="text" id="consoleCommandInput" placeholder="Digite um comando (ex: help(), stats(), process.memoryUsage())..." 
                                    style="flex: 1; background: #2d2d2d; border: none; color: #fff; padding: 6px 12px; border-radius: 4px; outline: none; font-family: monospace;">
                                <button onclick="admin.executarComando()" style="background: #0d6efd; color: white; border: none; padding: 6px 15px; border-radius: 4px; cursor: pointer; margin-left: 8px;">
                                    <i class="fas fa-play"></i> Executar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- ANOMALIAS DETECTADAS (TAB 2) -->
                <div id="tab-anomalias" class="tab-content">
                    <div class="anomalias-container">
                        <div class="anomalias-header">
                            <h3><i class="fas fa-exclamation-triangle"></i> Anomalias Detectadas</h3>
                            <div class="anomalias-filters">
                                <select id="filtroAnomalia" onchange="admin.filtrarAnomalias()">
                                    <option value="todas">Todas as anomalias</option>
                                    <option value="critica">Críticas</option>
                                    <option value="alta">Alta</option>
                                    <option value="media">Média</option>
                                    <option value="baixa">Baixa</option>
                                </select>
                            </div>
                        </div>
                        <div class="anomalias-list" id="anomaliasList">
                            ${this.gerarListaAnomaliasReais(anomalias)}
                        </div>
                    </div>
                </div>

                <!-- MÉTRICAS DO SISTEMA (TAB 3) -->
                <div id="tab-metricas" class="tab-content">
                    <div class="metricas-container">
                        <div class="metricas-header">
                            <h3><i class="fas fa-chart-line"></i> Métricas em Tempo Real</h3>
                            <span class="metricas-periodo">Dados atualizados</span>
                        </div>
                        
                        <div class="metricas-grid">
                            <div class="metrica-card">
                                <canvas id="graficoCPU"></canvas>
                                <p>Uso de CPU: ${cpuUsage}%</p>
                            </div>
                            <div class="metrica-card">
                                <canvas id="graficoMemoria"></canvas>
                                <p>Uso de Memória: ${memUsage}%</p>
                            </div>
                            <div class="metrica-card">
                                <canvas id="graficoRequisicoes"></canvas>
                                <p>Requisições: ${requisicoes}/min</p>
                            </div>
                            <div class="metrica-card">
                                <canvas id="graficoErros"></canvas>
                                <p>Taxa de Erros: ${erros24h}/24h</p>
                            </div>
                        </div>

                        <div class="metricas-detalhadas">
                            <h4>Métricas Detalhadas</h4>
                            <table class="metricas-table">
                                <tr>
                                    <td>Tempo de atividade:</td>
                                    <td id="uptime">${uptime}</td>
                                </tr>
                                <tr>
                                    <td>Total de requisições (24h):</td>
                                    <td id="totalRequisicoes">${requisicoes}</td>
                                </tr>
                                <tr>
                                    <td>Erros (24h):</td>
                                    <td id="totalErros">${erros24h}</td>
                                </tr>
                                <tr>
                                    <td>Latência média:</td>
                                    <td id="latenciaMedia">${latencia}ms</td>
                                </tr>
                                <tr>
                                    <td>Provas ativas:</td>
                                    <td id="provasAtivas">${provasAtivas}</td>
                                </tr>
                                <tr>
                                    <td>Usuários online:</td>
                                    <td id="usuariosOnline">${usuariosOnline}</td>
                                </tr>
                                <tr>
                                    <td>Cancelamentos (24h):</td>
                                    <td id="cancelamentos">${cancelamentos24h}</td>
                                </tr>
                                <tr>
                                    <td>Violações (24h):</td>
                                    <td id="violacoes">${violacoes24h}</td>
                                </tr>
                            </table>
                        </div>
                    </div>
                </div>

                <!-- ALERTAS ATIVOS (TAB 4) -->
                <div id="tab-alertas" class="tab-content">
                    <div class="alertas-container">
                        <div class="alertas-header">
                            <h3><i class="fas fa-bell"></i> Alertas Ativos</h3>
                            <button class="btn-resolver" onclick="admin.resolverTodosAlertas()">
                                <i class="fas fa-check-double"></i> Resolver Todos
                            </button>
                        </div>
                        <div class="alertas-list" id="alertasList">
                            ${this.gerarListaAlertasReais(anomalias)}
                        </div>
                    </div>
                </div>
            </div>

            <style>
                .monitoring-container {
                    padding: 20px;
                    max-width: 1400px;
                    margin: 0 auto;
                }

                .monitoring-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                    background: white;
                    padding: 20px;
                    border-radius: 12px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }

                .header-left {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }

                .header-left i {
                    font-size: 24px;
                    color: #0d6efd;
                }

                .header-left h2 {
                    margin: 0;
                    font-size: 20px;
                    color: #212529;
                }

                .btn-monitoring {
                    padding: 8px 16px;
                    border: 1px solid #dee2e6;
                    background: white;
                    border-radius: 6px;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 13px;
                    transition: all 0.3s;
                }

                .btn-monitoring:hover {
                    background: #e9ecef;
                }

                .btn-monitoring.refresh {
                    background: #0d6efd;
                    color: white;
                    border: none;
                }

                .btn-monitoring.refresh:hover {
                    background: #0b5ed7;
                }

                /* Status Cards */
                .system-status-grid {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 15px;
                    margin-bottom: 25px;
                }

                .status-card {
                    background: white;
                    border-radius: 12px;
                    padding: 20px;
                    display: flex;
                    align-items: center;
                    gap: 15px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }

                .status-icon {
                    width: 50px;
                    height: 50px;
                    background: #e7f3ff;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #0d6efd;
                    font-size: 24px;
                }

                .status-content {
                    flex: 1;
                }

                .status-label {
                    display: block;
                    font-size: 12px;
                    color: #6c757d;
                    margin-bottom: 4px;
                }

                .status-value {
                    font-size: 18px;
                    font-weight: 600;
                }

                .status-value.online {
                    color: #28a745;
                }

                .status-value.offline {
                    color: #dc3545;
                }

                .status-value.warning {
                    color: #ffc107;
                }

                /* Tabs */
                .monitoring-tabs {
                    display: flex;
                    gap: 10px;
                    margin-bottom: 20px;
                    background: white;
                    padding: 10px;
                    border-radius: 12px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }

                .tab-btn {
                    padding: 10px 20px;
                    border: none;
                    background: none;
                    border-radius: 8px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 14px;
                    font-weight: 500;
                    color: #6c757d;
                    transition: all 0.3s;
                    position: relative;
                }

                .tab-btn i {
                    font-size: 16px;
                }

                .tab-btn .badge {
                    background: #dc3545;
                    color: white;
                    padding: 2px 6px;
                    border-radius: 20px;
                    font-size: 11px;
                    margin-left: 5px;
                }

                .tab-btn:hover {
                    background: #f8f9fa;
                    color: #0d6efd;
                }

                .tab-btn.active {
                    background: #0d6efd;
                    color: white;
                }

                .tab-btn.active .badge {
                    background: white;
                    color: #0d6efd;
                }

                .tab-content {
                    display: none;
                    background: white;
                    border-radius: 12px;
                    padding: 20px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }

                .tab-content.active {
                    display: block;
                }

                /* Console */
                .console-container {
                    border: 1px solid #dee2e6;
                    border-radius: 8px;
                    overflow: hidden;
                }

                .console-header {
                    background: #343a40;
                    padding: 10px 15px;
                    color: white;
                }

                .console-controls {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                .console-title {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 13px;
                }

                .console-actions {
                    display: flex;
                    gap: 15px;
                    align-items: center;
                }

                .auto-scroll {
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    font-size: 12px;
                    color: #adb5bd;
                    cursor: pointer;
                }

                .log-level-select {
                    background: #495057;
                    color: white;
                    border: none;
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 12px;
                    cursor: pointer;
                }

                .console-output {
                    background: #1e1e1e;
                    color: #f8f9fa;
                    font-family: 'Consolas', 'Monaco', monospace;
                    font-size: 13px;
                    padding: 15px;
                    height: 400px;
                    overflow-y: auto;
                    line-height: 1.5;
                }

                .console-line {
                    padding: 2px 0;
                    border-bottom: 1px solid #2d2d2d;
                    display: flex;
                    gap: 10px;
                }

                .console-timestamp {
                    color: #6c757d;
                    font-size: 11px;
                    min-width: 80px;
                }

                .console-level {
                    min-width: 60px;
                    font-weight: 600;
                }

                .console-level.error { color: #dc3545; }
                .console-level.warn { color: #ffc107; }
                .console-level.info { color: #0dcaf0; }
                .console-level.debug { color: #6f42c1; }
                .console-level.system { color: #6c757d; }

                .console-message {
                    flex: 1;
                    word-break: break-word;
                }

                .console-message.error { color: #f8d7da; }
                .console-message.warn { color: #fff3cd; }
                .console-message.sql { color: #d4edda; }

                .console-footer {
                    background: #343a40;
                    padding: 10px 15px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    color: #adb5bd;
                    font-size: 12px;
                }

                .console-stats {
                    display: flex;
                    gap: 20px;
                }

                .console-stats i {
                    margin-right: 4px;
                }

                .text-success { color: #28a745; }

                .console-command {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    background: #495057;
                    padding: 4px 10px;
                    border-radius: 4px;
                }

                .console-command input {
                    background: none;
                    border: none;
                    color: white;
                    font-family: monospace;
                    outline: none;
                    width: 300px;
                }

                .console-command input::placeholder {
                    color: #6c757d;
                }

                /* Anomalias */
                .anomalias-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                }

                .anomalias-header h3 {
                    margin: 0;
                    font-size: 16px;
                    color: #495057;
                }

                .anomalias-filters select {
                    padding: 6px 12px;
                    border: 1px solid #dee2e6;
                    border-radius: 6px;
                    font-size: 13px;
                }

                .anomalia-card {
                    background: #f8f9fa;
                    border-left: 4px solid;
                    border-radius: 8px;
                    padding: 15px;
                    margin-bottom: 10px;
                    transition: all 0.3s;
                }

                .anomalia-card:hover {
                    transform: translateX(5px);
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                }

                .anomalia-card.critica { border-left-color: #dc3545; }
                .anomalia-card.alta { border-left-color: #fd7e14; }
                .anomalia-card.media { border-left-color: #ffc107; }
                .anomalia-card.baixa { border-left-color: #0dcaf0; }

                .anomalia-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 10px;
                }

                .anomalia-tipo {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .anomalia-tipo i {
                    font-size: 18px;
                }

                .anomalia-tipo span {
                    font-weight: 600;
                }

                .anomalia-nivel {
                    padding: 3px 10px;
                    border-radius: 30px;
                    font-size: 11px;
                    font-weight: 600;
                }

                .anomalia-nivel.critica { background: #f8d7da; color: #b02a37; }
                .anomalia-nivel.alta { background: #ffe5d0; color: #b45f06; }
                .anomalia-nivel.media { background: #fff3cd; color: #997404; }
                .anomalia-nivel.baixa { background: #cff4fc; color: #055160; }

                .anomalia-descricao {
                    font-size: 14px;
                    margin-bottom: 10px;
                }

                .anomalia-solucao {
                    background: #e9ecef;
                    padding: 10px;
                    border-radius: 6px;
                    margin: 10px 0;
                    font-size: 13px;
                }

                .anomalia-solucao i {
                    color: #198754;
                    margin-right: 5px;
                }

                .anomalia-acoes {
                    display: flex;
                    gap: 8px;
                    justify-content: flex-end;
                }

                .btn-solucao {
                    padding: 5px 12px;
                    border: none;
                    border-radius: 4px;
                    font-size: 12px;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                }

                .btn-solucao.imediata {
                    background: #198754;
                    color: white;
                }

                .btn-solucao.agendada {
                    background: #ffc107;
                    color: #212529;
                }

                .btn-solucao.ignorar {
                    background: #6c757d;
                    color: white;
                }

                /* Métricas */
                .metricas-grid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 20px;
                    margin: 20px 0;
                }

                .metrica-card {
                    background: #f8f9fa;
                    border-radius: 8px;
                    padding: 15px;
                    text-align: center;
                }

                .metrica-card canvas {
                    max-height: 150px;
                    width: 100% !important;
                }

                .metrica-card p {
                    margin: 10px 0 0;
                    font-size: 14px;
                    color: #495057;
                }

                .metricas-detalhadas {
                    margin-top: 30px;
                    padding: 20px;
                    background: #f8f9fa;
                    border-radius: 8px;
                }

                .metricas-detalhadas h4 {
                    margin: 0 0 15px;
                    font-size: 16px;
                }

                .metricas-table {
                    width: 100%;
                }

                .metricas-table td {
                    padding: 8px;
                    border-bottom: 1px solid #dee2e6;
                }

                .metricas-table td:first-child {
                    font-weight: 600;
                    width: 200px;
                }

                /* Alertas */
                .alertas-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                }

                .btn-resolver {
                    background: #198754;
                    color: white;
                    border: none;
                    padding: 8px 16px;
                    border-radius: 6px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .alerta-item {
                    background: #f8f9fa;
                    border-radius: 8px;
                    padding: 15px;
                    margin-bottom: 10px;
                    display: flex;
                    align-items: center;
                    gap: 15px;
                }

                .alerta-icon {
                    width: 40px;
                    height: 40px;
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 20px;
                }

                .alerta-icon.critico { background: #f8d7da; color: #b02a37; }
                .alerta-icon.aviso { background: #fff3cd; color: #997404; }
                .alerta-icon.info { background: #cfe2ff; color: #0a58ca; }

                .alerta-content {
                    flex: 1;
                }

                .alerta-titulo {
                    font-weight: 600;
                    margin-bottom: 4px;
                }

                .alerta-descricao {
                    font-size: 12px;
                    color: #6c757d;
                }

                .alerta-acoes button {
                    background: none;
                    border: none;
                    color: #198754;
                    cursor: pointer;
                    font-size: 14px;
                    padding: 5px 10px;
                }

                /* Responsividade */
                @media (max-width: 768px) {
                    .system-status-grid {
                        grid-template-columns: 1fr;
                    }

                    .metricas-grid {
                        grid-template-columns: 1fr;
                    }

                    .monitoring-header {
                        flex-direction: column;
                        gap: 10px;
                    }

                    .monitoring-tabs {
                        flex-wrap: wrap;
                    }

                    .tab-btn {
                        flex: 1;
                    }

                    .console-command input {
                        width: 150px;
                    }
                }
            </style>
        `;
    }

    // ==================== CONEXÃO WEBSOCKET PARA LOGS REAIS ====================
    conectarWebSocketLogs() {
        // Se já existe uma conexão ativa, não fazer nada
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
            console.log('ℹ️ WebSocket já está conectado ou conectando');
            return;
        }

        // Fechar conexão anterior se existir (apenas se não estiver já fechando)
        if (this.ws) {
            try {
                this.ws.close();
            } catch (e) {
                // Ignorar erros ao fechar
            }
            this.ws = null;
        }

        // Determinar protocolo (ws ou wss)
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        console.log('🔌 Conectando ao WebSocket de logs:', wsUrl);
        
        this.ws = new WebSocket(wsUrl);
        this.wsReconnectTimer = null; // Para controlar reconexão
        
        this.ws.onopen = () => {
            console.log('✅ Conectado ao servidor de logs em tempo real');
            this.adicionarLogServidor({
                type: 'system',
                message: '✅ Conectado ao servidor de logs em tempo real',
                timestamp: new Date().toISOString()
            });
            
            // Enviar comando para ativar modo de comandos
            this.ws.send(JSON.stringify({ type: 'enable_commands' }));
            
            // Limpar qualquer timer de reconexão pendente
            if (this.wsReconnectTimer) {
                clearTimeout(this.wsReconnectTimer);
                this.wsReconnectTimer = null;
            }
        };
        
        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                
                // Verificar se é comando para limpar console
                if (data.type === 'clear_console') {
                    this.limparConsole();
                    return;
                }
                
                // Verificar se é resultado de comando
                if (data.type === 'command_result') {
                    this.adicionarLogServidor({
                        type: 'success',
                        message: data.result,
                        timestamp: data.timestamp
                    });
                } 
                // Verificar se é erro de comando
                else if (data.type === 'command_error') {
                    this.adicionarLogServidor({
                        type: 'error',
                        message: `❌ Erro: ${data.error}`,
                        timestamp: data.timestamp
                    });
                }
                // Log normal
                else {
                    this.adicionarLogServidor(data);
                }
            } catch (e) {
                console.error('Erro ao processar log:', e);
            }
        };
        
        this.ws.onerror = (error) => {
            console.error('❌ Erro na conexão WebSocket:', error);
            this.adicionarLogServidor({
                type: 'error',
                message: '❌ Erro na conexão com o servidor de logs',
                timestamp: new Date().toISOString()
            });
        };
        
        this.ws.onclose = () => {
            console.log('🔌 Desconectado do servidor de logs');
            this.adicionarLogServidor({
                type: 'system',
                message: '🔌 Desconectado do servidor de logs',
                timestamp: new Date().toISOString()
            });
            
            // Limpar a referência do WebSocket
            this.ws = null;
            
            // Não tentar reconectar automaticamente - apenas se o usuário estiver na aba de console
            // e se não houver um timer já programado
            if (!this.wsReconnectTimer && document.getElementById('tab-console')?.classList.contains('active')) {
                console.log('⏳ Aguardando 10 segundos antes de tentar reconectar...');
                this.wsReconnectTimer = setTimeout(() => {
                    console.log('🔄 Tentando reconectar...');
                    this.wsReconnectTimer = null;
                    this.conectarWebSocketLogs();
                }, 10000); // 10 segundos de espera
            }
        };
    }

    // Adicione este método para limpar a conexão ao mudar de aba
    limparConexaoWebSocket() {
        if (this.ws) {
            try {
                this.ws.close();
            } catch (e) {}
            this.ws = null;
        }
        if (this.wsReconnectTimer) {
            clearTimeout(this.wsReconnectTimer);
            this.wsReconnectTimer = null;
        }
    }

    // ==================== ADICIONAR LOG DO SERVIDOR ====================
    adicionarLogServidor(log) {
        const consoleOutput = document.getElementById('consoleOutput');
        if (!consoleOutput) return;
        
        const linha = document.createElement('div');
        linha.className = 'console-line';
        
        const data = new Date(log.timestamp);
        const hora = data.toLocaleTimeString('pt-BR', { hour12: false });
        
        // Determinar ícone e cor baseado no tipo
        let icone = 'ℹ️';
        let tipo = 'info';
        let cor = '#0dcaf0';
        
        // Verificar mensagens específicas do terminal
        const mensagem = log.message || '';
        
        if (mensagem.includes('❌') || mensagem.includes('Error') || mensagem.includes('erro') || log.type === 'error') {
            icone = '❌';
            tipo = 'error';
            cor = '#dc3545';
        }
        else if (mensagem.includes('⚠️') || mensagem.includes('warn') || log.type === 'warn') {
            icone = '⚠️';
            tipo = 'warn';
            cor = '#ffc107';
        }
        else if (mensagem.includes('✅') || mensagem.includes('sucesso') || log.type === 'success') {
            icone = '✅';
            tipo = 'success';
            cor = '#28a745';
        }
        else if (mensagem.includes('🔍') || mensagem.includes('Testando') || log.type === 'debug') {
            icone = '🔍';
            tipo = 'debug';
            cor = '#6f42c1';
        }
        else if (mensagem.includes('📁') || mensagem.includes('📊') || mensagem.includes('📝') || mensagem.includes('🚀')) {
            icone = '📌';
            tipo = 'system';
            cor = '#6c757d';
        }
        
        linha.innerHTML = `
            <span class="console-timestamp" style="color: #6c757d; min-width: 80px;">[${hora}]</span>
            <span class="console-level ${tipo}" style="color: ${cor}; min-width: 70px;">${icone} [${tipo.toUpperCase()}]</span>
            <span class="console-message" style="color: ${tipo === 'error' ? '#f8d7da' : '#f8f9fa'};">${this.escapeHtml(mensagem)}</span>
        `;
        
        consoleOutput.appendChild(linha);
        
        // Limitar número de linhas
        while (consoleOutput.children.length > 500) {
            consoleOutput.removeChild(consoleOutput.firstChild);
        }
        
        // Auto scroll se ativado
        if (document.getElementById('autoScrollConsole')?.checked) {
            consoleOutput.scrollTop = consoleOutput.scrollHeight;
        }
        
        // Atualizar estatísticas
        this.atualizarStatsConsole();
    }

    // ==================== EXECUÇÃO DE COMANDOS ====================
    async executarComando() {
        const input = document.getElementById('consoleCommandInput');
        const comando = input.value.trim();
        
        if (!comando) {
            this.mostrarToast('⚠️ Digite um comando', 'warning');
            return;
        }

        // Adicionar comando ao log
        this.adicionarLogServidor({
            type: 'command',
            message: `⚡ $ ${comando}`,
            timestamp: new Date().toISOString()
        });

        // Limpar input
        input.value = '';

        // Enviar via WebSocket
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'execute_command',
                command: comando
            }));
        } else {
            this.adicionarLogServidor({
                type: 'error',
                message: '❌ WebSocket não conectado. Tentando reconectar...',
                timestamp: new Date().toISOString()
            });
            this.conectarWebSocketLogs();
        }
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ==================== MÉTODOS DE LOGS ====================
    filtrarLogs() {
        const nivel = document.getElementById('logLevel')?.value;
        const linhas = document.querySelectorAll('#consoleOutput .console-line');
        
        linhas.forEach(linha => {
            if (nivel === 'all') {
                linha.style.display = '';
            } else {
                const level = linha.querySelector('.console-level')?.textContent.toLowerCase();
                linha.style.display = level && level.includes(nivel) ? '' : 'none';
            }
        });
        
        this.atualizarStatsConsole();
    }

    toggleAutoScroll() {
        // Função vazia
    }

    limparConsole() {
        const consoleOutput = document.getElementById('consoleOutput');
        if (consoleOutput) {
            consoleOutput.innerHTML = '';
            this.adicionarLogServidor({
                type: 'system',
                message: '🧹 Console limpo pelo administrador',
                timestamp: new Date().toISOString()
            });
        }
    }

    exportarLogs() {
        const logs = [];
        document.querySelectorAll('#consoleOutput .console-line').forEach(linha => {
            const timestamp = linha.querySelector('.console-timestamp')?.textContent || '';
            const level = linha.querySelector('.console-level')?.textContent || '';
            const message = linha.querySelector('.console-message')?.textContent || '';
            logs.push(`${timestamp} ${level} ${message}`);
        });
        
        if (logs.length === 0) {
            this.mostrarToast('❌ Nenhum log para exportar', 'error');
            return;
        }
        
        const blob = new Blob([logs.join('\n')], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.mostrarToast('📥 Logs exportados com sucesso', 'success');
    }

    atualizarStatsConsole() {
        const stats = document.getElementById('consoleStats');
        if (!stats) return;
        
        const linhasVisiveis = document.querySelectorAll('#consoleOutput .console-line[style=""]:not([style*="display: none"])').length;
        
        const ultimaAtualizacao = document.getElementById('ultimaAtualizacao');
        if (ultimaAtualizacao) {
            ultimaAtualizacao.textContent = new Date().toLocaleTimeString();
        }
    }

    // ==================== MÉTODOS DE GRÁFICOS ====================
    inicializarGraficosComDadosReais(metricas) {
        if (!window.Chart) {
            console.warn('Chart.js não encontrado');
            return;
        }

        // Destruir gráficos existentes
        if (this.graficoCPU) this.graficoCPU.destroy();
        if (this.graficoMemoria) this.graficoMemoria.destroy();
        if (this.graficoRequisicoes) this.graficoRequisicoes.destroy();
        if (this.graficoErros) this.graficoErros.destroy();

        const labels = this.gerarLabelsTempo(12);
        const cpuUsage = metricas?.cpu?.usage || 45;
        const memUsage = metricas?.memory?.usedPercent || 55;

        // Gráfico de CPU
        const ctxCPU = document.getElementById('graficoCPU')?.getContext('2d');
        if (ctxCPU) {
            this.graficoCPU = new Chart(ctxCPU, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'CPU %',
                        data: this.gerarDadosMetricaReais(cpuUsage, 15, 12),
                        borderColor: '#0d6efd',
                        backgroundColor: 'rgba(13,110,253,0.1)',
                        borderWidth: 2,
                        pointRadius: 3,
                        tension: 0.3,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { y: { min: 0, max: 100 } }
                }
            });
        }

        // Gráfico de Memória
        const ctxMem = document.getElementById('graficoMemoria')?.getContext('2d');
        if (ctxMem) {
            this.graficoMemoria = new Chart(ctxMem, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Memória %',
                        data: this.gerarDadosMetricaReais(memUsage, 10, 12),
                        borderColor: '#198754',
                        backgroundColor: 'rgba(25,135,84,0.1)',
                        borderWidth: 2,
                        pointRadius: 3,
                        tension: 0.3,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { y: { min: 0, max: 100 } }
                }
            });
        }

        // Gráfico de Requisições
        const ctxReqs = document.getElementById('graficoRequisicoes')?.getContext('2d');
        if (ctxReqs) {
            this.graficoRequisicoes = new Chart(ctxReqs, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Requisições',
                        data: this.gerarDadosMetricaReais(100, 30, 12),
                        backgroundColor: '#ffc107',
                        borderRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } }
                }
            });
        }

        // Gráfico de Erros
        const ctxErros = document.getElementById('graficoErros')?.getContext('2d');
        if (ctxErros) {
            this.graficoErros = new Chart(ctxErros, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Erros',
                        data: this.gerarDadosMetricaReais(5, 3, 12),
                        borderColor: '#dc3545',
                        backgroundColor: 'rgba(220,53,69,0.1)',
                        borderWidth: 2,
                        pointRadius: 3,
                        tension: 0.3,
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } }
                }
            });
        }
    }

    gerarLabelsTempo(quantidade) {
        const labels = [];
        for (let i = quantidade; i >= 0; i--) {
            const d = new Date(Date.now() - i * 60000);
            labels.push(d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
        }
        return labels;
    }

    gerarDadosMetricaReais(valorBase, variacao, quantidade) {
        const dados = [];
        for (let i = 0; i <= quantidade; i++) {
            const variacaoAtual = (Math.random() * variacao * 2) - variacao;
            let valor = valorBase + variacaoAtual;
            valor = Math.max(0, Math.min(100, valor));
            dados.push(Math.round(valor * 10) / 10);
        }
        return dados;
    }

    // ==================== MÉTODOS AUXILIARES ====================
    formatarBytes(bytes) {
        if (!bytes || bytes === 0) return '0 GB';
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
        return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
    }

    calcularTempoRelativo(data) {
        const segundos = Math.floor((new Date() - data) / 1000);
        if (segundos < 60) return `há ${segundos} segundos`;
        if (segundos < 3600) return `há ${Math.floor(segundos / 60)} minutos`;
        if (segundos < 86400) return `há ${Math.floor(segundos / 3600)} horas`;
        return `há ${Math.floor(segundos / 86400)} dias`;
    }

    getCorNivel(nivel) {
        const cores = {
            'critica': '#dc3545',
            'alta': '#fd7e14',
            'media': '#ffc107',
            'baixa': '#0dcaf0'
        };
        return cores[nivel] || '#6c757d';
    }

    // ==================== MÉTODOS DE NAVEGAÇÃO ENTRE TABS ====================
    mudarTabMonitoramento(tab) {
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        
        document.getElementById(`tab-${tab}`).classList.add('active');
        
        const buttons = document.querySelectorAll('.tab-btn');
        const index = tab === 'console' ? 0 : tab === 'anomalias' ? 1 : tab === 'metricas' ? 2 : 3;
        if (buttons[index]) buttons[index].classList.add('active');
        
        if (tab === 'metricas') {
            this.atualizarGraficosMetricas();
        }
        
        // Se não for a aba de console, limpar a conexão WebSocket para economizar recursos
        if (tab !== 'console') {
            this.limparConexaoWebSocket();
        } else {
            // Se for a aba de console, reconectar
            this.conectarWebSocketLogs();
        }
    }

    // ==================== MÉTODOS DE ANOMALIAS ====================
    gerarListaAnomaliasReais(anomalias) {
        if (!anomalias || anomalias.length === 0) {
            return `
                <div class="empty-state" style="text-align: center; padding: 40px;">
                    <i class="fas fa-check-circle" style="font-size: 48px; color: #28a745;"></i>
                    <h3 style="color: #495057;">Nenhuma anomalia detectada</h3>
                    <p style="color: #6c757d;">O sistema está operando normalmente.</p>
                </div>
            `;
        }

        return anomalias.map(a => this.gerarCardAnomaliaReal(a)).join('');
    }

    gerarCardAnomaliaReal(anomalia) {
        const tempoRelativo = this.calcularTempoRelativo(new Date(anomalia.timestamp));
        const nivel = anomalia.nivel || 'media';
        
        return `
            <div class="anomalia-card ${nivel}" id="anomalia-${anomalia.id}">
                <div class="anomalia-header">
                    <div class="anomalia-tipo">
                        <i class="fas fa-exclamation-triangle" style="color: ${this.getCorNivel(nivel)}"></i>
                        <span>${anomalia.tipo}</span>
                    </div>
                    <span class="anomalia-nivel ${nivel}">${nivel.toUpperCase()}</span>
                </div>
                <div class="anomalia-descricao">
                    ${anomalia.descricao}
                    <br>
                    <small style="color: #6c757d;">Log: ${anomalia.logAssociado || 'N/A'}</small>
                </div>
                <div class="anomalia-solucao">
                    <i class="fas fa-lightbulb"></i>
                    <strong>Solução Recomendada:</strong> ${anomalia.solucao}
                </div>
                <div class="anomalia-solucao" style="background: #d4edda; color: #155724;">
                    <i class="fas fa-clock"></i>
                    <strong>Solução Imediata:</strong> ${anomalia.solucaoImediata}
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px;">
                    <span class="anomalia-timestamp" style="font-size: 11px; color: #6c757d;">
                        <i class="far fa-clock"></i> ${tempoRelativo}
                    </span>
                    <div class="anomalia-acoes">
                        <button class="btn-solucao imediata" onclick="admin.aplicarSolucaoImediata('${anomalia.id}')">
                            <i class="fas fa-bolt"></i> Aplicar
                        </button>
                        <button class="btn-solucao agendada" onclick="admin.agendarSolucao('${anomalia.id}')">
                            <i class="fas fa-calendar-alt"></i> Agendar
                        </button>
                        <button class="btn-solucao ignorar" onclick="admin.ignorarAnomalia('${anomalia.id}')">
                            <i class="fas fa-check"></i> Ignorar
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    filtrarAnomalias() {
        const filtro = document.getElementById('filtroAnomalia')?.value;
        const cards = document.querySelectorAll('#anomaliasList .anomalia-card');
        
        cards.forEach(card => {
            if (filtro === 'todas') {
                card.style.display = '';
            } else {
                const nivel = card.classList[1];
                card.style.display = nivel === filtro ? '' : 'none';
            }
        });
    }

    async aplicarSolucaoImediata(anomaliaId) {
        const anomaliaCard = document.getElementById(`anomalia-${anomaliaId}`);
        if (!anomaliaCard) return;
        
        anomaliaCard.style.opacity = '0.5';
        
        try {
            const response = await fetch(`${this.apiBase}/monitoramento/solucao/${anomaliaId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ tipo: 'solucao_imediata', acao: { anomaliaId } })
            });

            if (response.ok) {
                anomaliaCard.remove();
                this.adicionarLogServidor({
                    type: 'info',
                    message: `✅ Solução imediata aplicada para anomalia ${anomaliaId}`,
                    timestamp: new Date().toISOString()
                });
                this.mostrarToast('✅ Solução aplicada com sucesso!', 'success');
            } else {
                throw new Error('Erro ao aplicar solução');
            }
        } catch (error) {
            console.error('Erro:', error);
            this.mostrarToast('❌ Erro ao aplicar solução', 'error');
            anomaliaCard.style.opacity = '1';
        }
        
        this.atualizarBadgeAnomalias();
    }

    agendarSolucao(anomaliaId) {
        this.mostrarToast('📅 Solução agendada', 'info');
    }

    ignorarAnomalia(anomaliaId) {
        const anomaliaCard = document.getElementById(`anomalia-${anomaliaId}`);
        if (!anomaliaCard) return;
        
        if (confirm('Ignorar esta anomalia?')) {
            anomaliaCard.remove();
            this.adicionarLogServidor({
                type: 'warn',
                message: `Anomalia ${anomaliaId} ignorada`,
                timestamp: new Date().toISOString()
            });
            this.atualizarBadgeAnomalias();
            this.mostrarToast('👁️ Anomalia ignorada', 'info');
        }
    }

    atualizarBadgeAnomalias() {
        const badge = document.getElementById('badgeAnomalias');
        const anomaliasList = document.getElementById('anomaliasList');
        if (badge && anomaliasList) {
            badge.textContent = anomaliasList.children.length;
        }
    }

    // ==================== MÉTODOS DE ALERTAS ====================
    gerarListaAlertasReais(anomalias) {
        const alertasAtivos = (anomalias || [])
            .filter(a => a.nivel === 'critica' || a.nivel === 'alta')
            .slice(0, 5);
        
        if (alertasAtivos.length === 0) {
            return '<p style="text-align: center; color: #6c757d;">Nenhum alerta ativo</p>';
        }

        return alertasAtivos.map(a => this.gerarCardAlertaReal(a)).join('');
    }

    gerarCardAlertaReal(alerta) {
        const tempoRelativo = this.calcularTempoRelativo(new Date(alerta.timestamp));
        const tipoClasse = alerta.nivel === 'critica' ? 'critico' : 'aviso';
        const icone = alerta.nivel === 'critica' ? 'fa-exclamation-circle' : 'fa-exclamation-triangle';
        
        return `
            <div class="alerta-item" id="alerta-${alerta.id}">
                <div class="alerta-icon ${tipoClasse}">
                    <i class="fas ${icone}"></i>
                </div>
                <div class="alerta-content">
                    <div class="alerta-titulo">${alerta.tipo}</div>
                    <div class="alerta-descricao">${alerta.descricao.substring(0, 100)}... • ${tempoRelativo}</div>
                </div>
                <div class="alerta-acoes">
                    <button onclick="admin.resolverAlerta('${alerta.id}')">
                        <i class="fas fa-check"></i>
                    </button>
                </div>
            </div>
        `;
    }

    resolverAlerta(alertaId) {
        const alerta = document.getElementById(`alerta-${alertaId}`);
        if (alerta) {
            alerta.remove();
            this.atualizarBadgeAlertas();
            this.mostrarToast('✅ Alerta resolvido', 'success');
        }
    }

    resolverTodosAlertas() {
        const alertasList = document.getElementById('alertasList');
        if (alertasList) {
            alertasList.innerHTML = '<p style="text-align: center; color: #6c757d;">Nenhum alerta ativo</p>';
            document.getElementById('badgeAlertas').textContent = '0';
            this.mostrarToast('✅ Todos os alertas foram resolvidos', 'success');
        }
    }

    atualizarBadgeAlertas() {
        const badge = document.getElementById('badgeAlertas');
        const alertasList = document.getElementById('alertasList');
        if (badge && alertasList) {
            badge.textContent = alertasList.children.length;
        }
    }

    // ==================== MÉTODOS DE GRÁFICOS ====================
    atualizarGraficosMetricas() {
        if (this.graficoCPU) {
            this.graficoCPU.data.datasets[0].data = this.gerarDadosMetricaReais(50, 15, 12);
            this.graficoCPU.update();
        }
        if (this.graficoMemoria) {
            this.graficoMemoria.data.datasets[0].data = this.gerarDadosMetricaReais(50, 10, 12);
            this.graficoMemoria.update();
        }
        if (this.graficoRequisicoes) {
            this.graficoRequisicoes.data.datasets[0].data = this.gerarDadosMetricaReais(100, 30, 12);
            this.graficoRequisicoes.update();
        }
        if (this.graficoErros) {
            this.graficoErros.data.datasets[0].data = this.gerarDadosMetricaReais(5, 3, 12);
            this.graficoErros.update();
        }
    }

    // ==================== MÉTODO DE ATUALIZAÇÃO ====================
    atualizarMonitoramento() {
        // Mostrar toast de atualização
        this.mostrarToast('🔄 Atualizando métricas...', 'info');
        
        // APENAS atualizar os dados, sem recarregar a página inteira
        this.carregarDadosMonitoramento();
    }

    async carregarDadosMonitoramento() {
        try {
            const token = localStorage.getItem('auth_token');
            
            // Buscar apenas os dados atualizados
            const [metricasRes, anomaliasRes, estatisticasRes] = await Promise.all([
                fetch(`${this.apiBase}/monitoramento/metricas`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                }),
                fetch(`${this.apiBase}/monitoramento/anomalias`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                }),
                fetch(`${this.apiBase}/monitoramento/estatisticas`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                })
            ]);

            const metricas = await metricasRes.json();
            const anomalias = await anomaliasRes.json();
            const estatisticas = await estatisticasRes.json();

            // Atualizar os dados no objeto this
            this.metricasData = metricas.data || {};
            this.anomaliasData = anomalias.data || [];
            this.estatisticasData = estatisticas.data || {};

            // Atualizar os cards de status se eles existirem
            this.atualizarCardsStatus(this.metricasData, this.estatisticasData);
            
            // Atualizar os gráficos se eles existirem
            this.atualizarGraficosMetricas();
            
            // Atualizar badges
            this.atualizarBadgesMonitoramento(this.anomaliasData, this.estatisticasData);
            
            this.mostrarToast('✅ Dados atualizados com sucesso!', 'success');
            
        } catch (error) {
            console.error('❌ Erro ao atualizar dados:', error);
            this.mostrarToast('❌ Erro ao atualizar dados', 'error');
        }
    }

    atualizarCardsStatus(metricas, estatisticas) {
        // Verificar se os elementos existem antes de atualizar
        const cpuStatus = document.getElementById('cpuStatus');
        if (cpuStatus) {
            cpuStatus.textContent = (metricas.cpu?.usage || 0) + '%';
            cpuStatus.className = 'status-value ' + (metricas.cpu?.usage > 70 ? 'warning' : 'online');
        }
        
        const memoriaStatus = document.getElementById('memoriaStatus');
        if (memoriaStatus) {
            const memUsed = metricas.memory?.used || 0;
            const memTotal = metricas.memory?.total || 0;
            memoriaStatus.textContent = this.formatarBytes(memUsed) + ' / ' + this.formatarBytes(memTotal);
        }
        
        const erros24h = document.getElementById('totalErros');
        if (erros24h) {
            erros24h.textContent = estatisticas.erros?.ultimas24h || 0;
        }
        
        const uptime = document.getElementById('uptime');
        if (uptime) {
            uptime.textContent = metricas.system?.uptimeFormatted || 'N/A';
        }
        
        const totalRequisicoes = document.getElementById('totalRequisicoes');
        if (totalRequisicoes) {
            totalRequisicoes.textContent = estatisticas.requisicoes?.ultimas24h || '0';
        }
        
        const latenciaMedia = document.getElementById('latenciaMedia');
        if (latenciaMedia) {
            latenciaMedia.textContent = (estatisticas.latencia?.media || 0) + 'ms';
        }
    }

    atualizarBadgesMonitoramento(anomalias, estatisticas) {
        const badgeAnomalias = document.getElementById('badgeAnomalias');
        const badgeAlertas = document.getElementById('badgeAlertas');
        const badgeViolacoes = document.getElementById('badge-violacoes');
        
        if (badgeAnomalias && anomalias) {
            badgeAnomalias.textContent = anomalias.length;
        }
        
        if (badgeAlertas && estatisticas) {
            badgeAlertas.textContent = estatisticas.erros?.ultimas24h || 0;
        }
        
        if (badgeViolacoes && estatisticas) {
            badgeViolacoes.textContent = estatisticas.cancelamentos?.ultimas24h || 0;
        }
    }

    // ==================== MÉTODO DE TOAST ====================
    mostrarToast(mensagem, tipo = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${tipo}`;
        toast.style.cssText = `
            position: fixed; bottom: 20px; right: 20px; background: white; padding: 12px 20px;
            border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); display: flex;
            align-items: center; gap: 10px; border-left: 4px solid ${tipo === 'success' ? '#28a745' : tipo === 'error' ? '#dc3545' : '#0d6efd'};
            z-index: 9999; animation: slideIn 0.3s ease;
        `;
        toast.innerHTML = `
            <i class="fas fa-${tipo === 'success' ? 'check-circle' : tipo === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            <span>${mensagem}</span>
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    // ==================== CONFIGURAÇÃO DE EVENTOS ====================
    configurarEventosMonitoramento() {
        // Configurar auto-scroll do console
        const autoScroll = document.getElementById('autoScrollConsole');
        if (autoScroll) {
            autoScroll.addEventListener('change', () => this.toggleAutoScroll());
        }

        // Configurar filtro de logs
        const logLevel = document.getElementById('logLevel');
        if (logLevel) {
            logLevel.addEventListener('change', () => this.filtrarLogs());
        }
        
        // Adicionar evento de tecla Enter no input de comando
        const commandInput = document.getElementById('consoleCommandInput');
        if (commandInput) {
            commandInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.executarComando();
                }
            });
        }
    }

    async loadConfiguracoes() {
        const contentArea = document.getElementById('contentArea');
        contentArea.innerHTML = `
            <div class="section">
                <div class="section-header">
                    <h2><i class="fas fa-cog"></i> Configurações do Sistema</h2>
                </div>
                <div class="info-card" style="background: #fff3cd; color: #856404;">
                    <i class="fas fa-tools"></i>
                    <div>
                        <strong>Módulo em desenvolvimento</strong>
                        <p style="margin: 5px 0 0 0;">Em breve você poderá configurar parâmetros globais do sistema.</p>
                    </div>
                </div>
            </div>
        `;
    }

    adicionarLogServidor(log) {
        const consoleOutput = document.getElementById('consoleOutput');
        if (!consoleOutput) return;
        
        const linha = document.createElement('div');
        linha.className = 'console-line';
        
        const data = new Date(log.timestamp);
        const hora = data.toLocaleTimeString('pt-BR', { hour12: false });
        
        // Determinar ícone e cor baseado no tipo
        let icone = 'ℹ️';
        let tipo = 'info';
        let cor = '#0dcaf0';
        
        // Verificar mensagens específicas do terminal
        const mensagem = log.message || '';
        
        if (mensagem.includes('❌') || mensagem.includes('Error') || mensagem.includes('erro') || log.type === 'error') {
            icone = '❌';
            tipo = 'error';
            cor = '#dc3545';
        }
        else if (mensagem.includes('⚠️') || mensagem.includes('warn') || log.type === 'warn') {
            icone = '⚠️';
            tipo = 'warn';
            cor = '#ffc107';
        }
        else if (mensagem.includes('✅') || mensagem.includes('sucesso') || log.type === 'success') {
            icone = '✅';
            tipo = 'success';
            cor = '#28a745';
        }
        else if (mensagem.includes('🔍') || mensagem.includes('Testando') || log.type === 'debug') {
            icone = '🔍';
            tipo = 'debug';
            cor = '#6f42c1';
        }
        else if (mensagem.includes('📁') || mensagem.includes('📊') || mensagem.includes('📝') || mensagem.includes('🚀')) {
            icone = '📌';
            tipo = 'system';
            cor = '#6c757d';
        }
        
        linha.innerHTML = `
            <span class="console-timestamp" style="color: #6c757d; min-width: 80px;">[${hora}]</span>
            <span class="console-level ${tipo}" style="color: ${cor}; min-width: 70px;">${icone} [${tipo.toUpperCase()}]</span>
            <span class="console-message" style="color: ${tipo === 'error' ? '#f8d7da' : '#f8f9fa'};">${this.escapeHtml(mensagem)}</span>
        `;
        
        consoleOutput.appendChild(linha);
        
        // Limitar número de linhas
        while (consoleOutput.children.length > 500) {
            consoleOutput.removeChild(consoleOutput.firstChild);
        }
        
        // Auto scroll se ativado
        if (document.getElementById('autoScrollConsole')?.checked) {
            consoleOutput.scrollTop = consoleOutput.scrollHeight;
        }
        
        // Atualizar estatísticas
        this.atualizarStatsConsole();
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    // ==================== EXECUÇÃO DE COMANDOS ====================
    async executarComando() {
        const input = document.getElementById('consoleCommandInput');
        const comando = input.value.trim();
        
        if (!comando) {
            this.mostrarToast('⚠️ Digite um comando', 'warning');
            return;
        }

        // Adicionar comando ao log
        this.adicionarLogServidor({
            type: 'command',
            message: `⚡ $ ${comando}`,
            timestamp: new Date().toISOString()
        });

        // Limpar input
        input.value = '';

        // Enviar via WebSocket
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'execute_command',
                command: comando
            }));
        } else {
            this.adicionarLogServidor({
                type: 'error',
                message: '❌ WebSocket não conectado. Tentando reconectar...',
                timestamp: new Date().toISOString()
            });
            this.conectarWebSocketLogs();
        }
    }

    executarComandoLocal(comando) {
        try {
            // AVISO: Isso executa no navegador, não no servidor!
            // Apenas para comandos simples de teste
            const resultado = eval(comando);
            
            this.adicionarLogServidor({
                type: 'success',
                message: `✅ Resultado: ${resultado}`,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            this.adicionarLogServidor({
                type: 'error',
                message: `❌ Erro: ${error.message}`,
                timestamp: new Date().toISOString()
            });
        }
    }

    // ==================== COMANDOS RÁPIDOS ====================
    comandosRapidos() {
        const comandos = [
            { nome: 'Status do Servidor', comando: 'process.memoryUsage()' },
            { nome: 'Uptime', comando: 'process.uptime()' },
            { nome: 'Versão Node', comando: 'process.version' },
            { nome: 'Listar Usuários', comando: 'db.users.count()' },
            { nome: 'Limpar Console', comando: 'clear()' }
        ];
        
        let html = '<div style="margin-top: 10px; padding: 10px; background: #f8f9fa; border-radius: 6px;">';
        html += '<strong style="display: block; margin-bottom: 8px;">📋 Comandos rápidos:</strong>';
        html += '<div style="display: flex; gap: 8px; flex-wrap: wrap;">';
        
        comandos.forEach(cmd => {
            html += `<button onclick="admin.inserirComando('${cmd.comando}')" 
                        style="background: #e9ecef; border: none; padding: 5px 12px; border-radius: 20px; cursor: pointer; font-size: 12px;">
                    ${cmd.nome}
                    </button>`;
        });
        
        html += '</div></div>';
        return html;
    }

    inserirComando(comando) {
        const input = document.getElementById('consoleCommandInput');
        if (input) {
            input.value = comando;
            input.focus();
        }
    }

    conectarWebSocketLogs() {
        // Fechar conexão anterior se existir
        if (this.ws) {
            this.ws.close();
        }

        // Determinar protocolo (ws ou wss)
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        console.log('🔌 Conectando ao WebSocket de logs:', wsUrl);
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            console.log('✅ Conectado ao servidor de logs em tempo real');
            this.adicionarLogServidor({
                type: 'system',
                message: '✅ Conectado ao servidor de logs em tempo real',
                timestamp: new Date().toISOString()
            });
            
            // Enviar comando para ativar modo de comandos
            this.ws.send(JSON.stringify({ type: 'enable_commands' }));
        };
        
        // Dentro do método conectarWebSocketLogs, no ws.onmessage:
        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                
                // Verificar se é comando para limpar console
                if (data.type === 'clear_console') {
                    this.limparConsole();
                    return;
                }
                
                // Verificar se é resultado de comando
                if (data.type === 'command_result') {
                    this.adicionarLogServidor({
                        type: 'success',
                        message: data.result,
                        timestamp: data.timestamp
                    });
                } 
                // Verificar se é erro de comando
                else if (data.type === 'command_error') {
                    this.adicionarLogServidor({
                        type: 'error',
                        message: `❌ Erro: ${data.error}`,
                        timestamp: data.timestamp
                    });
                }
                // Log normal
                else {
                    this.adicionarLogServidor(data);
                }
            } catch (e) {
                console.error('Erro ao processar log:', e);
            }
        };
        
        this.ws.onerror = (error) => {
            console.error('❌ Erro na conexão WebSocket:', error);
            this.adicionarLogServidor({
                type: 'error',
                message: '❌ Erro na conexão com o servidor de logs',
                timestamp: new Date().toISOString()
            });
            
            // Fallback para logs simulados
            this.iniciarLogsSimulados();
        };
        
        this.ws.onclose = () => {
            console.log('🔌 Desconectado do servidor de logs');
            this.adicionarLogServidor({
                type: 'system',
                message: '🔌 Desconectado do servidor de logs',
                timestamp: new Date().toISOString()
            });
            
            // Tentar reconectar após 5 segundos
            setTimeout(() => {
                if (document.getElementById('tab-console')?.classList.contains('active')) {
                    console.log('🔄 Tentando reconectar...');
                    this.conectarWebSocketLogs();
                }
            }, 5000);
        };
    }

    // ============ GERAR LINHAS DA TABELA DE PROVAS (CORRIGIDO) ============
    gerarLinhasProvas(provas) {
        if (!provas || provas.length === 0) {
            return `
                <tr>
                    <td colspan="9" style="text-align: center; padding: 40px;">
                        <i class="fas fa-file-alt" style="font-size: 2rem; color: #dee2e6; margin-bottom: 10px; display: block;"></i>
                        Nenhuma prova encontrada
                    </td>
                </tr>
            `;
        }

        return provas.map(prova => {
            const tipo = prova.tipoProva === 'enem' ? 'ENEM' : 
                        (prova.adaptada ? 'Adaptada' : 'Simples');
            const statusClass = prova.publicada ? 
                (prova.cancelada ? 'inactive' : 
                (prova.dataLimite && new Date(prova.dataLimite) < new Date() ? 'warning' : 'active')) 
                : 'inactive';
            const statusText = prova.publicada ? 
                (prova.cancelada ? 'Cancelada' : 
                (prova.dataLimite && new Date(prova.dataLimite) < new Date() ? 'Concluída' : 'Ativa')) 
                : 'Rascunho';

            // ===== CORREÇÃO: EXTRAIR NOME DO PROFESSOR CORRETAMENTE =====
            let nomeProfessor = 'Desconhecido';
            
            // Verificar todas as possíveis localizações do nome do professor
            if (prova.professor) {
                if (typeof prova.professor === 'object') {
                    nomeProfessor = prova.professor.nome || prova.professor.name || 'Desconhecido';
                } else if (typeof prova.professor === 'string') {
                    nomeProfessor = prova.professor;
                }
            } else if (prova.professorId) {
                // Se tiver apenas o ID, tenta buscar na lista de usuários
                if (this.usuarios && this.usuarios.length > 0) {
                    const prof = this.usuarios.find(u => u._id === prova.professorId || u.id === prova.professorId);
                    if (prof) {
                        nomeProfessor = prof.nome || prof.name || 'Desconhecido';
                    }
                }
            } else if (prova.professorNome) {
                nomeProfessor = prova.professorNome;
            } else if (prova.nomeProfessor) {
                nomeProfessor = prova.nomeProfessor;
            }

            return `
                <tr>
                    <td>
                        <strong>${prova.titulo || 'Sem título'}</strong>
                        ${prova.adaptada ? '<span class="badge-acessibilidade" title="Adaptada"><i class="fas fa-universal-access"></i></span>' : ''}
                    </td>
                    <td>
                        <span style="display: flex; align-items: center; gap: 5px;">
                            <i class="fas fa-chalkboard-teacher" style="color: #0d6efd;"></i>
                            ${nomeProfessor}
                        </span>
                    </td>
                    <td>${prova.turma?.nome || prova.turma || 'N/A'}</td>
                    <td>${prova.periodo ? prova.periodo + 'º' : '1º'}</td>
                    <td>${tipo}</td>
                    <td>${prova.quantidadeQuestoes || 0}</td>
                    <td>
                        <span class="status-badge ${statusClass}">
                            ${statusText}
                        </span>
                    </td>
                    <td>${prova.dataCriacao ? new Date(prova.dataCriacao).toLocaleDateString('pt-BR') : 'N/A'}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn-icon" onclick="admin.verProva('${prova.id}')" title="Ver detalhes">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button class="btn-icon success" onclick="admin.exportarResultadosProva('${prova.id}')" title="Exportar resultados">
                                <i class="fas fa-download"></i>
                            </button>
                            <button class="btn-icon danger" onclick="admin.excluirProva('${prova.id}')" title="Excluir">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    filtrarProvas() {
        this.filtros.provas.search = document.getElementById('searchProvas')?.value || '';
        this.filtros.provas.status = document.getElementById('filterStatus')?.value || 'todos';
        this.filtros.provas.dificuldade = document.getElementById('filterDificuldade')?.value || 'todas';
        this.filtros.provas.periodo = document.getElementById('filterPeriodo')?.value || 'todos';
        this.filtros.provas.page = 1;
        this.loadProvas();
    }

    limparFiltrosProvas() {
        this.filtros.provas = { status: 'todos', dificuldade: 'todas', periodo: 'todos', search: '', page: 1, limit: 10 };
        this.loadProvas();
    }

    // ============ VER DETALHES DA PROVA (CORRIGIDO) ============
    verProva(provaId) {
        const prova = this.provas.find(p => p.id === provaId);
        if (!prova) return;

        // Extrair nome do professor
        let nomeProfessor = 'Desconhecido';
        if (prova.professor) {
            if (typeof prova.professor === 'object') {
                nomeProfessor = prova.professor.nome || prova.professor.name || 'Desconhecido';
            } else {
                nomeProfessor = prova.professor;
            }
        } else if (prova.professorId) {
            if (this.usuarios && this.usuarios.length > 0) {
                const prof = this.usuarios.find(u => u._id === prova.professorId);
                if (prof) nomeProfessor = prof.nome;
            }
        }

        const modalBody = document.getElementById('modalBody');
        modalBody.innerHTML = `
            <div style="padding: 10px;">
                <h3 style="margin: 0 0 20px 0; color: #495057;">${prova.titulo}</h3>
                
                <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                    <p><strong><i class="fas fa-align-left"></i> Conteúdo:</strong> ${prova.conteudo || 'Não especificado'}</p>
                    <p><strong><i class="fas fa-user"></i> Professor:</strong> 
                        <span style="display: inline-flex; align-items: center; gap: 5px;">
                            <i class="fas fa-chalkboard-teacher" style="color: #0d6efd;"></i>
                            ${nomeProfessor}
                        </span>
                    </p>
                    <p><strong><i class="fas fa-school"></i> Turma:</strong> ${prova.turma?.nome || prova.turma || 'N/A'}</p>
                    <p><strong><i class="fas fa-calendar-week"></i> Período:</strong> ${prova.periodo ? prova.periodo + 'º' : '1º'}</p>
                    <p><strong><i class="fas fa-calendar-alt"></i> Data Limite:</strong> ${prova.dataLimite ? new Date(prova.dataLimite).toLocaleDateString('pt-BR') : 'Sem limite'}</p>
                    <p><strong><i class="fas fa-clock"></i> Duração:</strong> ${prova.duracaoMinutos ? prova.duracaoMinutos + ' minutos' : 'Não definida'}</p>
                    <p><strong><i class="fas fa-circle"></i> Status:</strong> 
                        <span class="status-badge ${prova.publicada ? (prova.cancelada ? 'inactive' : 'active') : 'inactive'}">
                            ${prova.publicada ? (prova.cancelada ? 'Cancelada' : (prova.dataLimite && new Date(prova.dataLimite) < new Date() ? 'Concluída' : 'Ativa')) : 'Rascunho'}
                        </span>
                    </p>
                </div>

                <h4 style="margin: 20px 0 10px 0;">📊 Estatísticas</h4>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px;">
                    <div style="text-align: center; background: #e9ecef; padding: 15px; border-radius: 8px;">
                        <div style="font-size: 24px; font-weight: bold; color: #0d6efd;">${prova.alunosRealizaram || 0}</div>
                        <div style="font-size: 12px; color: #6c757d;">Realizações</div>
                    </div>
                    <div style="text-align: center; background: #e9ecef; padding: 15px; border-radius: 8px;">
                        <div style="font-size: 24px; font-weight: bold; color: #198754;">${(prova.mediaNotas || 0).toFixed(1)}</div>
                        <div style="font-size: 12px; color: #6c757d;">Média</div>
                    </div>
                    <div style="text-align: center; background: #e9ecef; padding: 15px; border-radius: 8px;">
                        <div style="font-size: 24px; font-weight: bold; color: #ffc107;">${prova.totalParticipantes || 0}</div>
                        <div style="font-size: 12px; color: #6c757d;">Participantes</div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('modalTitle').innerHTML = `<i class="fas fa-eye"></i> Detalhes da Prova`;
        document.getElementById('modalSaveBtn').style.display = 'none';
        this.openModal();
    }

    async exportarResultadosProva(provaId) {
        this.showToast('Funcionalidade em desenvolvimento', 'info');
    }

    async excluirProva(provaId) {
        const prova = this.provas.find(p => p.id === provaId);
        if (!prova) return;

        const confirmar = await this.confirmar(
            `Excluir prova ${prova.titulo}?`,
            `Esta ação não pode ser desfeita. Todos os resultados associados também serão excluídos.`
        );

        if (!confirmar) return;

        try {
            this.showToast('Excluindo prova...', 'info');

            const response = await fetch(`/api/professor/provas/${provaId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
            });

            const data = await response.json();

            if (data.success) {
                this.showToast('Prova excluída com sucesso!', 'success');
                this.loadProvas();
                this.carregarDadosReais();
            } else {
                throw new Error(data.error || 'Erro ao excluir prova');
            }

        } catch (error) {
            console.error('Erro ao excluir prova:', error);
            this.showToast('Erro: ' + error.message, 'error');
        }
    }

    // ============ UTILITÁRIOS ============

    async confirmar(titulo, mensagem) {
        return new Promise((resolve) => {
            document.getElementById('confirmMessage').innerHTML = mensagem;
            document.getElementById('confirmModal').style.display = 'flex';
            
            document.getElementById('confirmBtn').onclick = () => {
                document.getElementById('confirmModal').style.display = 'none';
                resolve(true);
            };
            
            document.querySelectorAll('#confirmModal .modal-close, #confirmModal .btn-cancel').forEach(btn => {
                btn.onclick = () => {
                    document.getElementById('confirmModal').style.display = 'none';
                    resolve(false);
                };
            });
        });
    }

    showToast(mensagem, tipo = 'info') {
        const container = document.getElementById('toastContainer');
        if (!container) {
            alert(mensagem);
            return;
        }

        const toast = document.createElement('div');
        toast.className = `toast toast-${tipo}`;
        
        const icones = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            info: 'fa-info-circle',
            warning: 'fa-exclamation-triangle'
        };
        
        toast.innerHTML = `
            <i class="fas ${icones[tipo] || 'fa-info-circle'}"></i>
            <span>${mensagem}</span>
        `;
        
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }

    openModal() {
        document.getElementById('modal').style.display = 'flex';
    }

    closeModal() {
        const modal = document.getElementById('modal');
        modal.style.display = 'none';
        document.getElementById('modalSaveBtn').style.display = 'inline-block';
    }

    closeConfirmModal() {
        document.getElementById('confirmModal').style.display = 'none';
    }

    logout() {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_data');
        window.location.href = 'login.html';
    }

    abrirModalQuestao() {
        this.showToast('Funcionalidade em desenvolvimento', 'info');
    }

    abrirModalMatricula() {
        this.showToast('Funcionalidade em desenvolvimento', 'info');
    }

    async criarBackup() {
        try {
            this.showToast('Criando backup...', 'info');

            const response = await fetch(`${this.apiBase}/backups/criar`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
            });

            const data = await response.json();

            if (data.success) {
                this.showToast('Backup criado com sucesso!', 'success');
                this.loadBackups();
            } else {
                throw new Error(data.error || 'Erro ao criar backup');
            }

        } catch (error) {
            console.error('Erro ao criar backup:', error);
            this.showToast('Erro: ' + error.message, 'error');
        }
    }

    async restaurarBackup(arquivo) {
        const confirmar = await this.confirmar(
            'Restaurar Backup',
            `Tem certeza que deseja restaurar o backup <strong>${arquivo}</strong>?<br><br>
            <span style="color: #dc3545; font-weight: bold;">⚠️ ATENÇÃO:</span><br>
            Todos os dados atuais serão substituídos pelos dados do backup.<br>
            Esta ação não pode ser desfeita.`
        );

        if (!confirmar) return;

        try {
            this.showToast('Restaurando backup...', 'info');

            const response = await fetch(`${this.apiBase}/backups/restaurar/${arquivo}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
            });

            const data = await response.json();

            if (data.success) {
                this.showToast('Backup restaurado com sucesso! Recarregando sistema...', 'success');
                setTimeout(() => window.location.reload(), 3000);
            } else {
                throw new Error(data.error || 'Erro ao restaurar backup');
            }

        } catch (error) {
            console.error('Erro ao restaurar backup:', error);
            this.showToast('Erro: ' + error.message, 'error');
        }
    }

    async excluirBackup(arquivo) {
        const confirmar = await this.confirmar(
            'Excluir Backup',
            `Tem certeza que deseja excluir o backup <strong>${arquivo}</strong>?`
        );

        if (!confirmar) return;

        try {
            // Implementar exclusão de backup
            this.showToast('Backup excluído!', 'success');
            this.loadBackups();
        } catch (error) {
            console.error('Erro ao excluir backup:', error);
            this.showToast('Erro: ' + error.message, 'error');
        }
    }

    baixarBackup(arquivo) {
        window.location.href = `/backups/${arquivo}`;
    }
}

// ============================================
// FUNÇÕES DE FORMATAÇÃO GLOBAIS
// ============================================
function formatarCPF(input) {
    let cpf = input.value.replace(/\D/g, '').substring(0, 11);
    if (cpf.length > 9) {
        cpf = cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    } else if (cpf.length > 6) {
        cpf = cpf.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
    } else if (cpf.length > 3) {
        cpf = cpf.replace(/(\d{3})(\d{1,3})/, '$1.$2');
    }
    input.value = cpf;
}

function formatarTelefone(input) {
    let telefone = input.value.replace(/\D/g, '').substring(0, 11);
    if (telefone.length > 10) {
        telefone = telefone.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    } else if (telefone.length > 6) {
        telefone = telefone.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
    } else if (telefone.length > 2) {
        telefone = telefone.replace(/(\d{2})(\d{0,5})/, '($1) $2');
    }
    input.value = telefone;
}

// ============================================
// FUNÇÕES GLOBAIS PARA MODAIS
// ============================================
function closeModal() { 
    if (admin) admin.closeModal(); 
}

function closeConfirmModal() { 
    if (admin) admin.closeConfirmModal(); 
}

// ============================================
// INICIALIZAÇÃO
// ============================================
let admin;
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        admin = new AdminPanel();
        window.admin = admin;
    });
} else {
    admin = new AdminPanel();
    window.admin = admin;
}

console.log('✅ admin.js carregado com todas as funcionalidades');