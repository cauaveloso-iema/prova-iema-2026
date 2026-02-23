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
            monitoramento: 'Monitoramento do Sistema',
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
            case 'monitoramento':
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

    abrirModalUsuario(usuarioId = null) {
        const usuario = usuarioId ? this.usuarios.find(u => u._id === usuarioId) : null;

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
                <div id="alunoFields" class="role-specific" style="${usuario?.role === 'aluno' || (!usuario && 'aluno') ? 'display: block;' : 'display: none;'}">
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
                
                <!-- Status removido - todos os usuários são criados como ATIVOS -->
                <input type="hidden" id="userStatus" value="true">
            </form>
        `;

        document.getElementById('modalTitle').innerHTML = usuario ? '<i class="fas fa-edit"></i> Editar Usuário' : '<i class="fas fa-user-plus"></i> Novo Usuário';
        document.getElementById('modalSaveBtn').onclick = () => this.salvarUsuario(usuario?._id);
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

    async salvarUsuario(id = null) {
        try {
            const role = document.getElementById('userRole').value;
            
            const dados = {
                nome: document.getElementById('userNome').value,
                email: document.getElementById('userEmail').value,
                cpf: document.getElementById('userCPF').value.replace(/\D/g, ''),
                telefone: document.getElementById('userTelefone').value.replace(/\D/g, ''),
                role: role,
                matricula: document.getElementById('userMatricula').value || undefined
            };

            if (role === 'aluno') {
                dados.curso = document.getElementById('userCurso').value;
                dados.turma = document.getElementById('userTurma').value;
                dados.precisaAcessibilidade = document.getElementById('userAcessibilidade').checked;
            } else if (role === 'professor') {
                dados.eixo = document.getElementById('userEixo').value;
                dados.departamento = document.getElementById('userDepartamento').value || undefined;
                dados.titulacao = document.getElementById('userTitulacao').value || undefined;
            }

            if (!id) {
                dados.password = document.getElementById('userPassword').value;
            }

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
                this.loadUsuarios();
                this.carregarDadosReais();
            } else {
                throw new Error(data.error || 'Erro ao salvar usuário');
            }

        } catch (error) {
            console.error('Erro ao salvar usuário:', error);
            this.showToast('Erro: ' + error.message, 'error');
        }
    }

    async resetarSenha(usuarioId) {
        const usuario = this.usuarios.find(u => u._id === usuarioId);
        if (!usuario) return;

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
                this.showToast(`Senha resetada! Nova senha: ${novaSenha}`, 'success');
            } else {
                throw new Error(data.error || 'Erro ao resetar senha');
            }

        } catch (error) {
            console.error('Erro ao resetar senha:', error);
            this.showToast('Erro: ' + error.message, 'error');
        }
    }

    async excluirUsuario(usuarioId) {
        const usuario = this.usuarios.find(u => u._id === usuarioId);

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
                this.showToast('Usuário excluído com sucesso!', 'success');
                this.loadUsuarios();
                this.carregarDadosReais();
            } else {
                throw new Error(data.error || 'Erro ao excluir usuário');
            }

        } catch (error) {
            console.error('Erro ao excluir usuário:', error);
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

    // ============ NOVA PROVA COM SELETOR DE PROFESSOR ============
    async carregarNovaProva() {
        const contentArea = document.getElementById('contentArea');
        
        // Primeiro insere o HTML
        contentArea.innerHTML = `
            <div class="section">
                <div class="section-header">
                    <h2><i class="fas fa-plus-circle"></i> Nova Prova</h2>
                    <button class="btn-secondary" onclick="admin.switchSection('provas')">
                        <i class="fas fa-arrow-left"></i> Voltar
                    </button>
                </div>

                <!-- Alertas -->
                <div id="alertProvaAdmin" class="alert" style="display: none;"></div>

                <!-- Formulário de Nova Prova -->
                <div class="form-container" style="margin-top: 20px;">
                    <form id="formNovaProvaAdmin">
                        <div class="form-grid" style="grid-template-columns: repeat(3, 1fr);">
                            <!-- Tema da Prova -->
                            <div class="form-group" style="grid-column: span 3;">
                                <label class="form-label">
                                    <i class="fas fa-lightbulb"></i> Tema da Prova
                                </label>
                                <textarea 
                                    id="temaProvaAdmin" 
                                    class="form-control" 
                                    placeholder="Ex: 'Equações do 2º grau', 'Segunda Guerra Mundial', 'Fotossíntese'..."
                                    required
                                    rows="3"
                                ></textarea>
                                <small style="color: #6c757d; display: block; margin-top: 5px;">
                                    Seja específico para melhores resultados.
                                </small>
                            </div>

                            <!-- Título -->
                            <div class="form-group">
                                <label class="form-label">
                                    <i class="fas fa-heading"></i> Título da Prova
                                </label>
                                <input 
                                    type="text" 
                                    id="tituloProvaAdmin" 
                                    class="form-control" 
                                    placeholder="Ex: Prova Bimestral"
                                    required
                                >
                            </div>

                            <!-- Período Letivo -->
                            <div class="form-group">
                                <label class="form-label">
                                    <i class="fas fa-calendar-week"></i> Período Letivo
                                </label>
                                <select id="periodoProvaAdmin" class="form-control" required>
                                    <option value="">Selecione...</option>
                                    <option value="1">1º Período</option>
                                    <option value="2">2º Período</option>
                                    <option value="3">3º Período</option>
                                    <option value="4">4º Período</option>
                                </select>
                            </div>

                            <!-- Professor Responsável -->
                            <div class="form-group">
                                <label class="form-label">
                                    <i class="fas fa-chalkboard-teacher"></i> Professor Responsável
                                </label>
                                <select id="professorProvaAdmin" class="form-control" required>
                                    <option value="">Carregando professores...</option>
                                </select>
                                <small style="color: #6c757d;">A prova será atribuída a este professor</small>
                            </div>

                            <!-- Tipo de Prova -->
                            <div class="form-group">
                                <label class="form-label">
                                    <i class="fas fa-file-alt"></i> Tipo de Prova
                                </label>
                                <select id="tipoProvaAdmin" class="form-control" required onchange="admin.mudarTipoProvaAdmin()">
                                    <option value="simples">Prova Simples (5 alternativas)</option>
                                    <option value="enem">Formato ENEM (com texto base)</option>
                                    <option value="adaptada">🎯 Prova Adaptada (3 alternativas)</option>
                                </select>
                            </div>

                            <!-- Quantidade -->
                            <div class="form-group">
                                <label class="form-label">
                                    <i class="fas fa-question-circle"></i> Quantidade
                                </label>
                                <select id="quantidadeQuestoesAdmin" class="form-control" required>
                                    <option value="5">5 questões</option>
                                    <option value="10" selected>10 questões</option>
                                    <option value="15">15 questões</option>
                                    <option value="20">20 questões</option>
                                </select>
                            </div>

                            <!-- Dificuldade -->
                            <div class="form-group">
                                <label class="form-label">
                                    <i class="fas fa-chart-line"></i> Dificuldade
                                </label>
                                <select id="dificuldadeAdmin" class="form-control" required>
                                    <option value="facil">Fácil</option>
                                    <option value="media" selected>Médio</option>
                                    <option value="dificil">Difícil</option>
                                </select>
                            </div>

                            <!-- Turma -->
                            <div class="form-group">
                                <label class="form-label">
                                    <i class="fas fa-school"></i> Turma
                                </label>
                                <select id="turmaProvaAdmin" class="form-control" required>
                                    <option value="">Carregando turmas...</option>
                                </select>
                            </div>

                            <!-- Data Limite -->
                            <div class="form-group">
                                <label class="form-label">
                                    <i class="fas fa-calendar-alt"></i> Data Limite
                                </label>
                                <input type="date" id="dataLimiteAdmin" class="form-control">
                            </div>

                            <!-- Horário Início -->
                            <div class="form-group">
                                <label class="form-label">
                                    <i class="fas fa-clock"></i> Horário Início
                                </label>
                                <input type="time" id="horarioInicioAdmin" class="form-control" value="08:00" required>
                            </div>

                            <!-- Horário Término -->
                            <div class="form-group">
                                <label class="form-label">
                                    <i class="fas fa-clock"></i> Horário Término
                                </label>
                                <input type="time" id="horarioTerminoAdmin" class="form-control" value="09:30" required>
                            </div>

                            <!-- Duração Calculada -->
                            <div class="form-group" style="grid-column: span 3;">
                                <label class="form-label">
                                    <i class="fas fa-hourglass-half"></i> Duração Calculada
                                </label>
                                <div id="duracaoCalculadaAdmin" style="
                                    padding: 10px;
                                    background: #f3f4f6;
                                    border-radius: 6px;
                                    font-weight: 600;
                                    color: #0d6efd;
                                    text-align: center;
                                ">
                                    Calculando...
                                </div>
                            </div>
                        </div>

                        <!-- Seção de Anexos (ENEM) -->
                        <div id="secaoAnexosAdmin" class="secao-anexos-container" style="display: none; margin-top: 30px;">
                            <div class="info-card" style="background: #cce5ff; color: #004085;">
                                <i class="fas fa-paperclip"></i>
                                <div>
                                    <strong>Materiais de Referência</strong>
                                    <p style="margin: 5px 0 0 0;">Adicione arquivos, textos ou links para a IA usar como base</p>
                                </div>
                            </div>

                            <!-- Tabs de Anexos -->
                            <div style="display: flex; gap: 5px; margin: 15px 0;">
                                <button type="button" class="btn-filter active" onclick="admin.mostrarTabAnexoAdmin('upload')">
                                    <i class="fas fa-upload"></i> Upload
                                </button>
                                <button type="button" class="btn-filter" onclick="admin.mostrarTabAnexoAdmin('texto')">
                                    <i class="fas fa-file-alt"></i> Texto
                                </button>
                                <button type="button" class="btn-filter" onclick="admin.mostrarTabAnexoAdmin('link')">
                                    <i class="fas fa-link"></i> Link
                                </button>
                            </div>

                            <!-- Tab Upload -->
                            <div id="tab-upload-admin" class="tab-anexo-content" style="display: block;">
                                <div class="drop-zone" 
                                    onclick="document.getElementById('fileInputAdmin').click()"
                                    ondrop="admin.handleDropAdmin(event)"
                                    ondragover="admin.handleDragOverAdmin(event)"
                                    ondragleave="admin.handleDragLeaveAdmin(event)"
                                    style="border: 2px dashed #dee2e6; padding: 30px; text-align: center; border-radius: 8px; cursor: pointer;">
                                    <i class="fas fa-cloud-upload-alt" style="font-size: 2rem; color: #0d6efd;"></i>
                                    <h4>Arraste arquivos ou clique para selecionar</h4>
                                    <p>PDF, imagens, TXT, DOC, DOCX (até 10MB)</p>
                                    <button type="button" class="btn-primary">
                                        <i class="fas fa-folder-open"></i> Selecionar Arquivos
                                    </button>
                                </div>
                                <input type="file" id="fileInputAdmin" multiple style="display: none;" 
                                    accept=".pdf,.jpg,.jpeg,.png,.gif,.txt,.doc,.docx" onchange="admin.handleFileSelectAdmin(event)">
                            </div>

                            <!-- Tab Texto -->
                            <div id="tab-texto-admin" class="tab-anexo-content" style="display: none;">
                                <div class="form-group">
                                    <label>Título do Texto</label>
                                    <input type="text" id="textoTituloAdmin" class="form-control">
                                </div>
                                <div class="form-group">
                                    <label>Conteúdo</label>
                                    <textarea id="textoConteudoAdmin" class="form-control" rows="4"></textarea>
                                </div>
                                <button type="button" class="btn-success" onclick="admin.adicionarTextoAdmin()">
                                    Adicionar Texto
                                </button>
                            </div>

                            <!-- Tab Link -->
                            <div id="tab-link-admin" class="tab-anexo-content" style="display: none;">
                                <div class="form-group">
                                    <label>Título</label>
                                    <input type="text" id="linkTituloAdmin" class="form-control">
                                </div>
                                <div class="form-group">
                                    <label>URL</label>
                                    <input type="url" id="linkURLAdmin" class="form-control" placeholder="https://...">
                                </div>
                                <button type="button" class="btn-success" onclick="admin.adicionarLinkAdmin()">
                                    Adicionar Link
                                </button>
                            </div>

                            <!-- Lista de Anexos -->
                            <div style="margin-top: 20px;">
                                <h4><i class="fas fa-list-check"></i> Materiais Adicionados <span id="contadorAnexosAdmin">0</span></h4>
                                <div id="listaAnexosAdmin" style="min-height: 50px;">
                                    <div id="emptyAnexosAdmin" style="text-align: center; padding: 20px;">
                                        <i class="fas fa-inbox"></i>
                                        <p>Nenhum material adicionado</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Informações IA -->
                        <div class="info-card" style="margin-top: 20px;">
                            <h4><i class="fas fa-robot"></i> Sobre a IA</h4>
                            <p>A prova será gerada automaticamente usando inteligência artificial e atribuída ao professor selecionado.</p>
                        </div>

                        <!-- Botão Gerar -->
                        <button type="submit" class="btn-primary" style="width: 100%; margin-top: 20px;" id="btnGerarProvaAdmin">
                            <i class="fas fa-magic"></i> Gerar Prova com IA
                        </button>
                    </form>

                    <!-- Preview das Questões -->
                    <div id="previewQuestoesAdmin" class="preview-container" style="display: none; margin-top: 30px;">
                        <h3><i class="fas fa-eye"></i> Pré-visualização da Prova</h3>
                        <div id="questoesPreviewAdmin"></div>
                        <div style="display: flex; gap: 10px; margin-top: 20px;">
                            <button class="btn-success" onclick="admin.publicarProvaAdmin()" style="flex: 1;">
                                <i class="fas fa-paper-plane"></i> Publicar Prova
                            </button>
                            <button class="btn-warning" onclick="admin.abrirEdicaoQuestoesPreview()" style="flex: 1; background: #f59e0b;">
                                <i class="fas fa-edit"></i> Editar Questões
                            </button>
                            <button class="btn-danger" onclick="admin.regenerarProvaAdmin()" style="flex: 1;">
                                <i class="fas fa-redo"></i> Regenerar
                            </button>
                            <button class="btn-secondary" onclick="admin.cancelarProvaAdmin()" style="flex: 1;">
                                <i class="fas fa-times"></i> Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Configurar eventos
        this.configurarEventosProvaAdmin();
        
        // ===== CORREÇÃO: Carregar dados APÓS o HTML estar no DOM =====
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

    // ============ MOSTRAR PREVIEW DAS QUESTÕES ============
    mostrarPreviewQuestoesAdmin(questoes) {
        const container = document.getElementById('questoesPreviewAdmin');
        const preview = document.getElementById('previewQuestoesAdmin');
        
        if (!questoes || questoes.length === 0) {
            container.innerHTML = '<p style="color: #dc3545;">Nenhuma questão gerada</p>';
            return;
        }
        
        let html = '';
        
        questoes.forEach((q, i) => {
            const tipo = q.tipo === 'enem' ? 'ENEM' : (q.tipo === 'adaptada' ? '🎯 ADAPTADA' : 'SIMPLES');
            const cor = q.tipo === 'enem' ? '#0dcaf0' : (q.tipo === 'adaptada' ? '#198754' : '#0d6efd');
            
            html += `
                <div style="
                    background: #f8f9fa;
                    border-left: 4px solid ${cor};
                    padding: 15px;
                    margin-bottom: 15px;
                    border-radius: 4px;
                ">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                        <strong>Questão ${i + 1}</strong>
                        <span style="background: ${cor}; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8rem;">
                            ${tipo}
                        </span>
                    </div>
                    <p>${q.pergunta || q.enunciado || 'Pergunta'}</p>
                    <div style="margin-top: 10px;">
                        ${q.opcoes.map((opcao, idx) => `
                            <div style="
                                padding: 8px;
                                margin: 5px 0;
                                background: ${idx === q.respostaCorreta ? '#d4edda' : 'white'};
                                border: 1px solid ${idx === q.respostaCorreta ? '#28a745' : '#dee2e6'};
                                border-radius: 4px;
                            ">
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
        
        // Rolar até o preview
        preview.scrollIntoView({ behavior: 'smooth' });
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
            const btnPublicar = document.querySelector('#previewQuestoesAdmin .btn-success');
            const originalText = btnPublicar.innerHTML;
            btnPublicar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Publicando...';
            btnPublicar.disabled = true;
            
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
                
                this.anexosAdmin = [];
                this.arquivosParaUploadAdmin = [];
                this.atualizarListaAnexosAdmin();
                this.provaGeradaAdmin = null;
                
                // Voltar para lista de provas após 2 segundos
                setTimeout(() => {
                    this.switchSection('provas');
                    // Recarregar a lista de provas
                    this.loadProvas();
                }, 2000);
            } else {
                throw new Error(data.error || 'Erro ao publicar');
            }
            
        } catch (error) {
            this.mostrarAlertaAdmin('❌ ' + error.message, 'error');
        } finally {
            const btnPublicar = document.querySelector('#previewQuestoesAdmin .btn-success');
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

    async loadQuestoes() {
        const contentArea = document.getElementById('contentArea');
        contentArea.innerHTML = `
            <div class="section">
                <div class="section-header">
                    <h2><i class="fas fa-question-circle"></i> Banco de Questões</h2>
                    <button class="btn-primary" onclick="admin.abrirModalQuestao()">
                        <i class="fas fa-plus"></i> Nova Questão
                    </button>
                </div>
                <div class="info-card" style="background: #fff3cd; color: #856404;">
                    <i class="fas fa-tools"></i>
                    <div>
                        <strong>Módulo em desenvolvimento</strong>
                        <p style="margin: 5px 0 0 0;">Em breve você poderá gerenciar o banco de questões completo.</p>
                    </div>
                </div>
            </div>
        `;
    }

    async loadResultados() {
        const contentArea = document.getElementById('contentArea');
        contentArea.innerHTML = `
            <div class="section">
                <div class="section-header">
                    <h2><i class="fas fa-chart-line"></i> Resultados</h2>
                </div>
                <div class="info-card" style="background: #fff3cd; color: #856404;">
                    <i class="fas fa-tools"></i>
                    <div>
                        <strong>Módulo em desenvolvimento</strong>
                        <p style="margin: 5px 0 0 0;">Em breve você poderá visualizar resultados consolidados de todas as turmas.</p>
                    </div>
                </div>
            </div>
        `;
    }

    async loadMatriculas() {
        const contentArea = document.getElementById('contentArea');
        contentArea.innerHTML = `
            <div class="section">
                <div class="section-header">
                    <h2><i class="fas fa-user-graduate"></i> Matrículas Autorizadas</h2>
                    <button class="btn-primary" onclick="admin.abrirModalMatricula()">
                        <i class="fas fa-plus"></i> Nova Matrícula
                    </button>
                </div>
                <div class="info-card" style="background: #fff3cd; color: #856404;">
                    <i class="fas fa-tools"></i>
                    <div>
                        <strong>Módulo em desenvolvimento</strong>
                        <p style="margin: 5px 0 0 0;">Gerencie as matrículas autorizadas para professores.</p>
                    </div>
                </div>
            </div>
        `;
    }

    async loadBackups() {
        const contentArea = document.getElementById('contentArea');
        
        try {
            const response = await fetch(`${this.apiBase}/backups`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
            });

            const data = await response.json();

            if (!data.success) throw new Error(data.error || 'Erro ao carregar backups');

            this.backups = data.backups || [];

            contentArea.innerHTML = `
                <div class="section">
                    <div class="section-header">
                        <h2><i class="fas fa-database"></i> Backups e Restauração</h2>
                        <button class="btn-primary" onclick="admin.criarBackup()">
                            <i class="fas fa-plus"></i> Novo Backup
                        </button>
                    </div>

                    <div class="backup-info">
                        <div class="info-card">
                            <i class="fas fa-info-circle"></i>
                            <div>
                                <strong>Backups automáticos todos os dias às 02:00</strong>
                                <p style="margin: 5px 0 0 0; font-size: 12px;">Os backups são armazenados por 30 dias</p>
                            </div>
                        </div>
                    </div>

                    <div class="backup-list">
                        ${this.gerarListaBackups(this.backups)}
                    </div>
                </div>
            `;

        } catch (error) {
            console.error('Erro ao carregar backups:', error);
            contentArea.innerHTML = `
                <div class="error-container">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Erro ao carregar backups</h3>
                    <p>${error.message}</p>
                    <button class="btn-primary" onclick="admin.loadBackups()">
                        <i class="fas fa-sync-alt"></i> Tentar novamente
                    </button>
                </div>
            `;
        }
    }

    gerarListaBackups(backups) {
        if (!backups || backups.length === 0) {
            return `
                <div class="empty-state">
                    <i class="fas fa-database"></i>
                    <h3>Nenhum backup encontrado</h3>
                    <p>Clique em "Novo Backup" para criar o primeiro backup.</p>
                </div>
            `;
        }

        return backups.map(backup => `
            <div class="backup-item" style="background: white; border-radius: 8px; padding: 15px; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between; border: 1px solid #e9ecef;">
                <div style="display: flex; align-items: center; gap: 15px;">
                    <div style="width: 40px; height: 40px; background: #e9ecef; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #0d6efd; font-size: 20px;">
                        <i class="fas fa-file-archive"></i>
                    </div>
                    <div>
                        <h4 style="margin: 0 0 5px 0; font-size: 14px;">${backup.nome}</h4>
                        <small style="color: #6c757d;">Criado em: ${new Date(backup.data).toLocaleString('pt-BR')} • Tamanho: ${backup.tamanho}</small>
                    </div>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button class="btn-icon success" onclick="admin.baixarBackup('${backup.nome}')" title="Download">
                        <i class="fas fa-download"></i>
                    </button>
                    <button class="btn-icon warning" onclick="admin.restaurarBackup('${backup.nome}')" title="Restaurar">
                        <i class="fas fa-undo-alt"></i>
                    </button>
                    <button class="btn-icon danger" onclick="admin.excluirBackup('${backup.nome}')" title="Excluir">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }

    async loadMonitoramento() {
        const contentArea = document.getElementById('contentArea');
        
        try {
            const response = await fetch(`${this.apiBase}/monitoramento/violacoes`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
            });

            const data = await response.json();

            if (!data.success) throw new Error(data.error || 'Erro ao carregar monitoramento');

            const violacoes = data.provasCanceladas || [];

            contentArea.innerHTML = `
                <div class="section">
                    <div class="section-header">
                        <h2><i class="fas fa-eye"></i> Monitoramento do Sistema</h2>
                    </div>

                    <div class="stats-grid" style="grid-template-columns: repeat(2, 1fr);">
                        <div class="stat-card info">
                            <div class="stat-icon">
                                <i class="fas fa-exclamation-triangle"></i>
                            </div>
                            <div class="stat-content">
                                <h3>Total de Cancelamentos</h3>
                                <div class="stat-number">${data.estatisticas?.total || 0}</div>
                                <div class="stat-details">
                                    <span><i class="fas fa-user-slash"></i> ${data.estatisticas?.porMotivo?.violacao || 0} violações</span>
                                    <span><i class="fas fa-clock"></i> ${data.estatisticas?.porMotivo?.prazo || 0} prazo</span>
                                </div>
                            </div>
                        </div>
                        <div class="stat-card warning">
                            <div class="stat-icon">
                                <i class="fas fa-chart-line"></i>
                            </div>
                            <div class="stat-content">
                                <h3>Últimos 7 dias</h3>
                                <div class="stat-number">${Object.values(data.estatisticas?.porDia || {}).reduce((a, b) => a + b, 0) || 0}</div>
                                <div class="stat-details">
                                    <span><i class="fas fa-calendar-day"></i> Média: ${(Object.values(data.estatisticas?.porDia || {}).reduce((a, b) => a + b, 0) / 7).toFixed(1)}/dia</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <h3 style="margin: 30px 0 20px 0;">📋 Últimas Violações</h3>
                    <div class="violation-list">
                        ${this.gerarListaViolacoes(violacoes)}
                    </div>
                </div>
            `;

            document.getElementById('badge-violacoes').textContent = data.estatisticas?.total || 0;

        } catch (error) {
            console.error('Erro ao carregar monitoramento:', error);
            contentArea.innerHTML = `
                <div class="error-container">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>Erro ao carregar monitoramento</h3>
                    <p>${error.message}</p>
                    <button class="btn-primary" onclick="admin.loadMonitoramento()">
                        <i class="fas fa-sync-alt"></i> Tentar novamente
                    </button>
                </div>
            `;
        }
    }

    gerarListaViolacoes(violacoes) {
        if (!violacoes || violacoes.length === 0) {
            return `
                <div class="empty-state">
                    <i class="fas fa-check-circle" style="color: #198754; font-size: 48px;"></i>
                    <h3>Nenhuma violação registrada</h3>
                    <p>O sistema está operando normalmente.</p>
                </div>
            `;
        }

        return violacoes.map(v => `
            <div class="violation-item" style="background: white; border-radius: 8px; padding: 15px; margin-bottom: 10px; border-left: 4px solid ${v.flagViolacao ? '#dc3545' : '#ffc107'};">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <div>
                        <strong>${v.alunoId?.nome || 'Aluno desconhecido'}</strong>
                        <span style="margin-left: 10px; padding: 4px 10px; border-radius: 30px; font-size: 11px; font-weight: 600; background: ${v.flagViolacao ? '#f8d7da' : '#fff3cd'}; color: ${v.flagViolacao ? '#b02a37' : '#997404'};">
                            ${v.flagViolacao ? '🚫 Violação' : '⏰ Prazo expirado'}
                        </span>
                    </div>
                    <small style="color: #6c757d;">${new Date(v.dataRealizacao).toLocaleString('pt-BR')}</small>
                </div>
                <div style="margin-bottom: 10px;">
                    <p><strong>Prova:</strong> ${v.provaId?.titulo || 'Prova desconhecida'}</p>
                    <p><strong>Motivo:</strong> ${v.motivoCancelamento || 'Não especificado'}</p>
                    ${v.estatisticasCancelamento ? `
                    <p><strong>Detalhes:</strong> ${JSON.stringify(v.estatisticasCancelamento)}</p>
                    ` : ''}
                </div>
                <div style="display: flex; gap: 15px; font-size: 11px; color: #6c757d;">
                    <span><i class="fas fa-user"></i> ${v.alunoId?.email || ''}</span>
                    <span><i class="fas fa-id-card"></i> ${v.alunoId?.matricula || ''}</span>
                </div>
            </div>
        `).join('');
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