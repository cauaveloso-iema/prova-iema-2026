// js/setor-pedagogico.js
// ============================================================================
// CLASSE PRINCIPAL - SETOR PEDAGÓGICO
// ============================================================================

class SetorPedagogico {
    constructor() {
        this.token = localStorage.getItem('auth_token');
        this.currentUser = null;
        this.notificacoes = [];
        this.arquivoSelecionadoSetor = null;
        this.temPermissao2Chamada = false;
        this.temPermissaoSubstituicao = false;
        
        this.estadoSegundaChamada = {
            currentAluno: null,
            motivoSelecionado: null,
            modoAtual: 'automatico',
            alunosPorTurma: [],
            scanner: null,
            scannerAtivo: false
        };
        
        this.assinaturaSegundaChamada = {
            canvas: null, ctx: null, desenhando: false,
            temAssinatura: false, lastX: 0, lastY: 0
        };
        
        this.relatorio2Chamada = null;
        
        this.autocomplete2Chamada = {
            alunos: [], filtrados: [], indice: -1,
            carregado: false, carregando: false
        };
        
        this.charts2Chamada = { motivos: null, atrasos: null, turmas: null };

        this.substituicaoState = {
            professores: [],
            turmas: [],
            substituicoes: [],
            relatorioAtual: null,
            editandoId: null,
            substituicaoParaImprimir: null,
            charts: { motivos: null, horarios: null, dias: null, turmas: null },
            formData: {
                professorAusente: null,
                professorSubstituto: null,
                turma: '',
                data: '',
                horario: null,
                motivo: '',
                motivoDetalhes: '',
                observacoes: '',
                substitutoAusente: false,
                substitutoAusenteMotivo: '',
                substitutoAusenteObservacoes: ''
            }
        };
        
        this.init();
    }
    
    async init() {
        console.log('🚀 Inicializando Setor Pedagógico...');
        
        if (!this.token) {
            window.location.href = '/login.html';
            return;
        }
        
        await this.loadUser();
        await this.carregarFotoPerfil();
        await this.carregarNotificacoes();
        await this.verificarPermissoesEspeciais();
        
        this.loadDashboard();
        this.setupNavigation();
        
        setInterval(() => this.carregarNotificacoes(), 30000);
    }
    
    async loadUser() {
        try {
            const userData = JSON.parse(localStorage.getItem('user_data') || '{}');
            if (userData.nome) {
                this.currentUser = userData;
                document.getElementById('userName').textContent = userData.nome;
            }
            
            const data = await this.apiRequest('/api/auth/me');
            if (data.success) {
                this.currentUser = data.user;
                document.getElementById('userName').textContent = this.currentUser.nome;
                localStorage.setItem('user_data', JSON.stringify(this.currentUser));
                
                if (this.currentUser.role !== 'setor_pedagogico' && this.currentUser.role !== 'admin' && this.currentUser.role !== 'super_admin') {
                    window.location.href = '/login.html';
                }
            }
        } catch (error) {
            console.error('Erro ao carregar usuário:', error);
        }
    }
    
    async verificarPermissoesEspeciais() {
        try {
            if (!this.token) return;
            
            const response = await fetch('/api/admin/permissoes-modulos/verificar/segunda_chamada_setor_pedagogico', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            
            const data = await response.json();
            
            if (data.success && data.temPermissao) {
                const navItem = document.getElementById('navSegundaChamada');
                if (navItem) navItem.style.display = 'flex';
                const menuMobile = document.getElementById('menuItemSegundaChamada');
                if (menuMobile) menuMobile.style.display = 'flex';
                this.temPermissao2Chamada = true;
            } else {
                this.temPermissao2Chamada = false;
            }

            const responseSub = await fetch('/api/admin/permissoes-modulos/verificar/substituicao_professores_setor_pedagogico', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            
            const dataSub = await responseSub.json();
            
            if (dataSub.success && dataSub.temPermissao) {
                const navItem = document.getElementById('navSubstituicaoProfessores');
                if (navItem) navItem.style.display = 'flex';
                const menuMobile = document.getElementById('menuItemSubstituicaoProfessores');
                if (menuMobile) menuMobile.style.display = 'flex';
                this.temPermissaoSubstituicao = true;
            } else {
                this.temPermissaoSubstituicao = false;
            }
        } catch (error) {
            console.error('❌ Erro ao verificar permissões:', error);
            this.temPermissao2Chamada = false;
            this.temPermissaoSubstituicao = false;
        }
    }
    
    async carregarFotoPerfil() {
        try {
            const data = await this.apiRequest('/api/perfil/me');
            if (data.success && data.perfil && data.perfil.fotoPerfil) {
                const avatarDiv = document.getElementById('userAvatar');
                if (avatarDiv) {
                    avatarDiv.innerHTML = `<img src="${data.perfil.fotoPerfil}" alt="Foto de perfil">`;
                }
            }
        } catch (error) {
            console.error('❌ Erro ao carregar foto:', error);
        }
    }
    
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
    
    showToast(mensagem, tipo = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast-notification ${tipo}`;
        toast.innerHTML = `
            <i class="fas ${tipo === 'success' ? 'fa-check-circle' : tipo === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
            <span>${mensagem}</span>
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }
    
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    safeSetText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }
    
    gerarAvatarSVG(nome) {
        const inicial = (nome || '?').charAt(0).toUpperCase();
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80"><circle cx="40" cy="40" r="40" fill="#f59e0b"/><text x="40" y="40" font-family="Arial" font-size="36" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="central">${inicial}</text></svg>`;
        return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
    }
    
    setupNavigation() {
        document.querySelectorAll('.nav-link[data-section]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const section = link.getAttribute('data-section');
                this.navigateTo(section);
                if (window.innerWidth < 768) {
                    document.getElementById('sidebar').classList.remove('mobile-open');
                }
            });
        });
        
        document.getElementById('mobileMenuBtn').addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('mobile-open');
        });
        
        document.getElementById('logoutBtn').addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.removeItem('auth_token');
            localStorage.removeItem('user_data');
            window.location.href = '/login.html';
        });
    }
    
    navigateTo(section) {
        if (section === 'segunda-chamada' && !this.temPermissao2Chamada) {
            this.showToast('❌ Você não tem permissão para acessar 2ª Chamada', 'error');
            return;
        }
        if (section === 'substituicao-professores' && !this.temPermissaoSubstituicao) {
            this.showToast('❌ Você não tem permissão para acessar Substituição de Professores', 'error');
            return;
        }
        
        document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));
        document.querySelector(`[data-section="${section}"]`)?.classList.add('active');
        
        const titles = {
            dashboard: 'Dashboard - Setor Pedagógico',
            alunos: 'Alunos com Necessidades Especiais (AEE)',
            provas: 'Provas Publicadas',
            relatorios: 'Relatórios',
            'segunda-chamada': '🔄 2ª Chamada',
            'substituicao-professores': '🔄 Substituição de Professores'
        };
        const icons = {
            dashboard: 'fa-chart-line', alunos: 'fa-users',
            provas: 'fa-file-alt', relatorios: 'fa-chart-bar',
            'segunda-chamada': 'fa-redo',
            'substituicao-professores': 'fa-people-arrows'
        };
        
        const pageTitle = document.getElementById('pageTitle');
        if (pageTitle) {
            pageTitle.innerHTML = `<i class="fas ${icons[section] || 'fa-chart-line'} me-2"></i> ${titles[section] || 'Dashboard'}`;
        }
        
        if (section === 'dashboard') this.loadDashboard();
        else if (section === 'alunos') this.loadAlunos();
        else if (section === 'provas') this.loadProvas();
        else if (section === 'relatorios') this.loadRelatorios();
        else if (section === 'segunda-chamada') this.loadSegundaChamada();
        else if (section === 'substituicao-professores') this.loadSubstituicaoProfessores();
    }
    
    // ============ DASHBOARD ============
    async loadDashboard() {
        const content = document.getElementById('content');
        content.innerHTML = '<div class="text-center py-5"><div class="loading"></div><p class="mt-3 text-muted">Carregando dashboard...</p></div>';
        
        try {
            const data = await this.apiRequest('/api/setor-pedagogico/dashboard');
            if (data.success) {
                const d = data.dashboard;
                content.innerHTML = `
                    <div class="row g-4 mb-4">
                        <div class="col-md-6 col-xl-3">
                            <div class="card stat-card"><div class="card-body p-4">
                                <div class="d-flex justify-content-between align-items-center">
                                    <div><small class="opacity-75">Total de Alunos</small><div class="stat-value mt-2">${d.totalAlunos}</div></div>
                                    <i class="fas fa-users"></i>
                                </div>
                            </div></div>
                        </div>
                        <div class="col-md-6 col-xl-3">
                            <div class="card stat-card stat-card-warning"><div class="card-body p-4">
                                <div class="d-flex justify-content-between align-items-center">
                                    <div><small class="opacity-75">Alunos AEE</small><div class="stat-value mt-2">${d.totalAlunosComAcessibilidade}</div></div>
                                    <i class="fas fa-hand-holding-heart"></i>
                                </div>
                            </div></div>
                        </div>
                        <div class="col-md-6 col-xl-3">
                            <div class="card stat-card stat-card-success"><div class="card-body p-4">
                                <div class="d-flex justify-content-between align-items-center">
                                    <div><small class="opacity-75">Taxa Acessibilidade</small><div class="stat-value mt-2">${d.taxaAcessibilidade}%</div></div>
                                    <i class="fas fa-chart-line"></i>
                                </div>
                            </div></div>
                        </div>
                        <div class="col-md-6 col-xl-3">
                            <div class="card stat-card stat-card-info"><div class="card-body p-4">
                                <div class="d-flex justify-content-between align-items-center">
                                    <div><small class="opacity-75">Total de Provas</small><div class="stat-value mt-2">${d.totalProvas}</div></div>
                                    <i class="fas fa-file-alt"></i>
                                </div>
                            </div></div>
                        </div>
                    </div>
                    
                    <div class="row g-4">
                        <div class="col-lg-6">
                            <div class="card h-100">
                                <div class="card-header bg-white border-0 pt-4 px-4">
                                    <h5 class="mb-0 fw-bold"><i class="fas fa-chart-pie me-2 text-primary"></i> Distribuição por Condição</h5>
                                </div>
                                <div class="card-body px-4 pb-4">
                                    <div id="condicoesChart" class="mb-4"></div>
                                    <div class="table-responsive">
                                        <table class="table table-sm">
                                            <thead class="table-light"><tr><th>Condição</th><th>Quantidade</th><th>%</th></tr></thead>
                                            <tbody>
                                                ${d.distribuicaoCondicoes.map(c => `
                                                    <tr><td>${c.label}</td><td><strong>${c.count}</strong></td><td>${((c.count / d.totalAlunosComAcessibilidade) * 100).toFixed(1)}%</td></tr>
                                                `).join('')}
                                                ${d.distribuicaoCondicoes.length === 0 ? '<tr><td colspan="3" class="text-center text-muted">Nenhum dado disponível</td></tr>' : ''}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="col-lg-6">
                            <div class="card h-100">
                                <div class="card-header bg-white border-0 pt-4 px-4">
                                    <h5 class="mb-0 fw-bold"><i class="fas fa-bolt me-2 text-warning"></i> Ações Rápidas</h5>
                                </div>
                                <div class="card-body px-4 pb-4">
                                    <div class="d-grid gap-3">
                                        <button class="btn btn-outline-primary py-3" onclick="setorPedagogico.navigateTo('alunos')">
                                            <i class="fas fa-users me-2"></i> Listar Alunos AEE <i class="fas fa-arrow-right ms-2"></i>
                                        </button>
                                        <button class="btn btn-outline-success py-3" onclick="setorPedagogico.navigateTo('provas')">
                                            <i class="fas fa-file-alt me-2"></i> Visualizar Provas <i class="fas fa-arrow-right ms-2"></i>
                                        </button>
                                        <button class="btn btn-outline-warning py-3" onclick="setorPedagogico.navigateTo('relatorios')">
                                            <i class="fas fa-chart-bar me-2"></i> Gerar Relatório <i class="fas fa-arrow-right ms-2"></i>
                                        </button>
                                        ${this.temPermissao2Chamada ? `
                                        <button class="btn btn-outline-info py-3" onclick="setorPedagogico.navigateTo('segunda-chamada')">
                                            <i class="fas fa-redo me-2"></i> Registrar 2ª Chamada <i class="fas fa-arrow-right ms-2"></i>
                                        </button>
                                        ` : ''}
                                        ${this.temPermissaoSubstituicao ? `
                                        <button class="btn btn-outline-danger py-3" onclick="setorPedagogico.navigateTo('substituicao-professores')">
                                            <i class="fas fa-people-arrows me-2"></i> Substituição de Professores <i class="fas fa-arrow-right ms-2"></i>
                                        </button>
                                        ` : ''}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                
                if (d.distribuicaoCondicoes.length > 0) this.drawSimpleChart(d.distribuicaoCondicoes);
            }
        } catch (error) {
            console.error('Erro ao carregar dashboard:', error);
            content.innerHTML = '<div class="alert alert-danger">Erro ao carregar dashboard</div>';
        }
    }
    
    drawSimpleChart(data) {
        const container = document.getElementById('condicoesChart');
        if (!container) return;
        const total = data.reduce((sum, d) => sum + d.count, 0);
        container.innerHTML = data.map(d => `
            <div class="mb-3">
                <div class="d-flex justify-content-between mb-1">
                    <span class="fw-medium">${d.label}</span>
                    <span class="text-muted">${((d.count / total) * 100).toFixed(0)}%</span>
                </div>
                <div class="progress"><div class="progress-bar" style="width: ${(d.count / total) * 100}%"></div></div>
            </div>
        `).join('');
    }
    
    // ============ ALUNOS AEE ============
    async loadAlunos() {
        const content = document.getElementById('content');
        content.innerHTML = '<div class="text-center py-5"><div class="loading"></div><p class="mt-3 text-muted">Carregando alunos...</p></div>';
        
        try {
            const data = await this.apiRequest('/api/setor-pedagogico/alunos-acessibilidade');
            if (data.success) {
                content.innerHTML = `
                    <div class="filtros-card">
                        <div class="row g-3 align-items-end">
                            <div class="col-md-3">
                                <label class="fw-semibold mb-2">Condição</label>
                                <select class="form-select" id="filtroCondicao">
                                    <option value="todos">Todas</option>
                                    ${data.filtros.condicoes.map(c => `<option value="${c.valor}">${c.label}</option>`).join('')}
                                </select>
                            </div>
                            <div class="col-md-3">
                                <label class="fw-semibold mb-2">Turma</label>
                                <select class="form-select" id="filtroTurma">
                                    <option value="">Todas</option>
                                    ${data.filtros.turmas.map(t => `<option value="${t.id}">${t.nome}</option>`).join('')}
                                </select>
                            </div>
                            <div class="col-md-3">
                                <label class="fw-semibold mb-2">Curso</label>
                                <select class="form-select" id="filtroCurso">
                                    <option value="">Todos</option>
                                    ${data.filtros.cursos.map(c => `<option value="${c}">${c}</option>`).join('')}
                                </select>
                            </div>
                            <div class="col-md-3">
                                <div class="d-flex gap-2">
                                    <button class="btn btn-primary flex-grow-1" onclick="setorPedagogico.aplicarFiltrosAlunos()">
                                        <i class="fas fa-search me-2"></i> Filtrar
                                    </button>
                                    <button class="btn btn-outline-secondary" onclick="setorPedagogico.limparFiltrosAlunos()">
                                        <i class="fas fa-eraser"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="table-container">
                        <div class="table-header d-flex justify-content-between align-items-center">
                            <h5 class="mb-0 fw-bold"><i class="fas fa-users me-2 text-primary"></i> Alunos com Necessidades Especiais</h5>
                            <span class="badge bg-primary px-3 py-2">${data.total} alunos</span>
                        </div>
                        <div class="table-responsive">
                            <table class="table table-hover">
                                <thead>
                                    <tr><th>Nome</th><th>Matrícula</th><th>Turma</th><th>Curso</th><th>Condição</th><th>Status</th><th>Ações</th></tr>
                                </thead>
                                <tbody>
                                    ${data.alunos.map(aluno => `
                                        <tr>
                                            <td><strong>${aluno.nome}</strong></td>
                                            <td>${aluno.matricula}</td>
                                            <td>${aluno.turma || '-'}</td>
                                            <td>${aluno.curso || '-'}</td>
                                            <td>
                                                <span class="badge-acessibilidade">
                                                    <i class="fas fa-heart me-1"></i> ${aluno.condicao.label}
                                                    ${aluno.condicao.descricao ? `<br><small>${aluno.condicao.descricao}</small>` : ''}
                                                </span>
                                            </td>
                                            <td>
                                                <span class="badge-status ${aluno.status === 'aprovada' ? 'aprovada' : 'pendente'}">
                                                    ${aluno.status === 'aprovada' ? '✓ Aprovada' : '⏳ Pendente'}
                                                </span>
                                            </td>
                                            <td>
                                                <button class="btn btn-sm btn-outline-primary" onclick="setorPedagogico.verDetalhesAluno('${aluno.id}')">
                                                    <i class="fas fa-eye me-1"></i> Ver
                                                </button>
                                            </td>
                                        </tr>
                                    `).join('')}
                                    ${data.alunos.length === 0 ? '<tr><td colspan="7" class="text-center text-muted py-5">Nenhum aluno encontrado</td></tr>' : ''}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
                window.alunosData = data;
            }
        } catch (error) {
            console.error('Erro ao carregar alunos:', error);
            content.innerHTML = '<div class="alert alert-danger">Erro ao carregar alunos</div>';
        }
    }
    
    async verDetalhesAluno(alunoId) {
        try {
            const data = await this.apiRequest(`/api/setor-pedagogico/aluno/${alunoId}`);
            if (data.success) {
                const a = data.aluno;
                const modalHtml = `
                    <div class="row g-4">
                        <div class="col-md-6">
                            <div class="bg-light rounded-3 p-4 h-100">
                                <h6 class="fw-bold mb-3"><i class="fas fa-user-graduate me-2 text-primary"></i> Dados Pessoais</h6>
                                <hr class="my-2">
                                <p class="mb-2"><strong>Nome:</strong> ${a.nome}</p>
                                <p class="mb-2"><strong>Email:</strong> ${a.email}</p>
                                <p class="mb-2"><strong>Matrícula:</strong> ${a.matricula || 'Não informada'}</p>
                                <p class="mb-2"><strong>Turma:</strong> ${a.turma || '-'}</p>
                                <p class="mb-0"><strong>Curso:</strong> ${a.curso || '-'}</p>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <div class="bg-light rounded-3 p-4 h-100">
                                <h6 class="fw-bold mb-3"><i class="fas fa-hand-holding-heart me-2 text-warning"></i> Acessibilidade</h6>
                                <hr class="my-2">
                                <p class="mb-2"><strong>Condição:</strong> ${a.acessibilidade.condicao.label}</p>
                                ${a.acessibilidade.condicao.detalhes ? `<p class="mb-2"><strong>Detalhes:</strong> ${a.acessibilidade.condicao.detalhes}</p>` : ''}
                                <p class="mb-2"><strong>Data Solicitação:</strong> ${new Date(a.acessibilidade.dataSolicitacao).toLocaleDateString('pt-BR')}</p>
                                <p class="mb-0"><strong>Status:</strong> <span class="badge ${a.acessibilidade.status === 'aprovada' ? 'bg-success' : 'bg-warning'}">${a.acessibilidade.status === 'aprovada' ? 'Aprovada' : 'Pendente'}</span></p>
                            </div>
                        </div>
                        <div class="col-12">
                            <div class="bg-light rounded-3 p-4">
                                <h6 class="fw-bold mb-3"><i class="fas fa-file-alt me-2 text-success"></i> Últimas Provas Realizadas</h6>
                                <hr class="my-2">
                                ${a.provasRealizadas.length > 0 ? `
                                    <div class="list-group">
                                        ${a.provasRealizadas.map(p => `
                                            <div class="list-group-item d-flex justify-content-between align-items-center">
                                                <div>
                                                    <strong>${p.provaTitulo}</strong><br>
                                                    <small class="text-muted">${p.adaptada ? 'Adaptada' : 'Normal'}</small>
                                                </div>
                                                <span class="badge ${p.notaLiberada ? 'bg-success' : 'bg-secondary'}">
                                                    ${p.notaLiberada ? `Nota: ${p.nota}` : 'Aguardando'}
                                                </span>
                                            </div>
                                        `).join('')}
                                    </div>
                                ` : '<p class="text-muted text-center py-3">Nenhuma prova realizada ainda</p>'}
                            </div>
                        </div>
                    </div>
                `;
                const modal = new bootstrap.Modal(document.getElementById('provaModal'));
                document.getElementById('provaModalBody').innerHTML = modalHtml;
                document.getElementById('provaModal').querySelector('.modal-title').innerHTML = `<i class="fas fa-user-circle me-2"></i> Detalhes: ${a.nome}`;
                document.getElementById('printProvaBtn').style.display = 'none';
                modal.show();
            }
        } catch (error) {
            console.error('Erro ao carregar detalhes:', error);
            alert('Erro ao carregar detalhes do aluno');
        }
    }
    
    // ============ PROVAS ============
    async loadProvas() {
        const content = document.getElementById('content');
        content.innerHTML = '<div class="text-center py-5"><div class="loading"></div><p class="mt-3 text-muted">Carregando provas...</p></div>';
        
        try {
            const data = await this.apiRequest('/api/setor-pedagogico/provas');
            if (data.success) {
                content.innerHTML = `
                    <div class="filtros-card">
                        <div class="row g-3 align-items-end">
                            <div class="col-md-3">
                                <label class="fw-semibold mb-2">Tipo de Prova</label>
                                <select class="form-select" id="filtroTipoProva">
                                    <option value="">Todos</option>
                                    <option value="adaptada">Adaptadas (3 alternativas)</option>
                                    <option value="normal">Normais (5 alternativas)</option>
                                </select>
                            </div>
                            <div class="col-md-3">
                                <label class="fw-semibold mb-2">Turma</label>
                                <select class="form-select" id="filtroTurmaProva">
                                    <option value="">Todas</option>
                                    ${data.filtros.turmas.map(t => `<option value="${t.id}">${t.nome}</option>`).join('')}
                                </select>
                            </div>
                            <div class="col-md-3">
                                <label class="fw-semibold mb-2">Status</label>
                                <select class="form-select" id="filtroStatusProva">
                                    <option value="">Todos</option>
                                    <option value="ativa">Ativas</option>
                                    <option value="encerrada">Encerradas</option>
                                </select>
                            </div>
                            <div class="col-md-3">
                                <div class="d-flex gap-2">
                                    <button class="btn btn-primary flex-grow-1" onclick="setorPedagogico.aplicarFiltrosProvas()">
                                        <i class="fas fa-search me-2"></i> Filtrar
                                    </button>
                                    <button class="btn btn-outline-secondary" onclick="setorPedagogico.limparFiltrosProvas()">
                                        <i class="fas fa-eraser"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="table-container">
                        <div class="table-header d-flex justify-content-between align-items-center">
                            <h5 class="mb-0 fw-bold"><i class="fas fa-file-alt me-2 text-primary"></i> Provas Publicadas</h5>
                            <div>
                                <button class="btn btn-sm btn-outline-primary" onclick="setorPedagogico.carregarProvas()">
                                    <i class="fas fa-sync-alt me-1"></i> Atualizar
                                </button>
                            </div>
                        </div>
                        <div class="table-responsive">
                            <table class="table table-hover">
                                <thead>
                                    <tr><th>Código</th><th>Título</th><th>Tipo</th><th>Turma</th><th>Professor</th><th>Questões</th><th>Data Limite</th><th>Ações</th></tr>
                                </thead>
                                <tbody>
                                    ${data.provas.map(prova => `
                                        <tr>
                                            <td><code class="bg-light px-2 py-1 rounded">${prova.codigo}</code></td>
                                            <td><strong>${prova.titulo}</strong></td>
                                            <td>
                                                <span class="badge ${prova.tipo === 'adaptada' ? 'bg-warning' : 'bg-info'} px-3 py-2">
                                                    ${prova.tipo === 'adaptada' ? '🎯 Adaptada' : '📝 Normal'}
                                                </span>
                                            </td>
                                            <td>${prova.turma?.nome || '-'}</td>
                                            <td>${prova.professor}</td>
                                            <td><span class="fw-bold">${prova.quantidadeQuestoes}</span></td>
                                            <td>${prova.dataLimite ? new Date(prova.dataLimite).toLocaleDateString('pt-BR') : '-'}</td>
                                            <td>
                                                <div class="d-flex gap-2">
                                                    <button class="btn btn-sm btn-outline-info" onclick="setorPedagogico.visualizarProva('${prova.id}')">
                                                        <i class="fas fa-eye"></i>
                                                    </button>
                                                    <button class="btn btn-sm btn-print" onclick="setorPedagogico.imprimirProva('${prova.id}', '${prova.titulo}')">
                                                        <i class="fas fa-print"></i>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    `).join('')}
                                    ${data.provas.length === 0 ? '<tr><td colspan="8" class="text-center text-muted py-5">Nenhuma prova encontrada</td></tr>' : ''}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
                window.provasData = data;
            }
        } catch (error) {
            console.error('Erro ao carregar provas:', error);
            content.innerHTML = '<div class="alert alert-danger">Erro ao carregar provas</div>';
        }
    }
    
    async visualizarProva(provaId) {
        try {
            const data = await this.apiRequest(`/api/setor-pedagogico/provas/${provaId}/visualizar`);
            if (data.success) {
                const p = data.prova;
                let questoesHtml = '';
                p.questoes.forEach((q, index) => {
                    questoesHtml += `
                        <div class="questao-item">
                            <div class="questao-pergunta"><span class="badge bg-primary me-2">${index + 1}</span> ${q.pergunta}</div>
                            <ul class="opcoes-list">${q.opcoes.map(opcao => `<li>${opcao}</li>`).join('')}</ul>
                            <div class="mt-2 text-muted small bg-light p-2 rounded">
                                <i class="fas fa-lightbulb text-warning me-1"></i> ${q.explicacao}
                            </div>
                        </div>
                    `;
                });
                
                const modalHtml = `
                    <div class="prova-preview">
                        <div class="text-center mb-5">
                            <h1 class="fw-bold" style="background: linear-gradient(135deg, #667eea, #764ba2); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">${p.titulo}</h1>
                            <div class="row mt-4">
                                <div class="col-md-3"><div class="border rounded p-2"><small class="text-muted">Código</small><div><strong>${p.codigo}</strong></div></div></div>
                                <div class="col-md-3"><div class="border rounded p-2"><small class="text-muted">Turma</small><div><strong>${p.turma?.nome || '-'}</strong></div></div></div>
                                <div class="col-md-3"><div class="border rounded p-2"><small class="text-muted">Professor</small><div><strong>${p.professor}</strong></div></div></div>
                                <div class="col-md-3"><div class="border rounded p-2"><small class="text-muted">Duração</small><div><strong>${p.duracaoMinutos} min</strong></div></div></div>
                            </div>
                            <hr class="my-4">
                        </div>
                        <div class="questoes">${questoesHtml}</div>
                        <div class="text-center mt-5"><hr><p class="text-muted small">Documento gerado pelo EducaPleno - Setor Pedagógico</p></div>
                    </div>
                `;
                
                const modal = new bootstrap.Modal(document.getElementById('provaModal'));
                document.getElementById('provaModalBody').innerHTML = modalHtml;
                document.getElementById('provaModal').querySelector('.modal-title').innerHTML = `<i class="fas fa-file-alt me-2"></i> ${p.titulo}`;
                document.getElementById('printProvaBtn').style.display = 'block';
                document.getElementById('printProvaBtn').onclick = () => this.imprimirProva(provaId, p.titulo);
                modal.show();
            }
        } catch (error) {
            console.error('Erro ao visualizar prova:', error);
            this.showToast('Erro ao carregar prova para visualização', 'error');
        }
    }
        // ============ IMPRESSÃO COM ADAPTAÇÃO ============
    async imprimirProva(provaId, titulo) {
        try {
            const token = localStorage.getItem('auth_token');
            const IS_LOCALHOST = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            const IS_RENDER = window.location.hostname.includes('render.com') || window.location.hostname.includes('sistema-avaliativo');
            let API_BASE_URL;
            if (IS_LOCALHOST) API_BASE_URL = 'http://localhost:3000/api';
            else if (IS_RENDER) API_BASE_URL = window.location.origin + '/api';
            else API_BASE_URL = '/api';
            
            this.showToast('📄 Preparando prova para impressão...', 'info');
            
            const response = await fetch(`${API_BASE_URL}/provas/${provaId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Erro ao carregar dados da prova');
            const data = await response.json();
            if (!data.success) throw new Error(data.error || 'Erro ao carregar prova');
            
            const prova = data.prova;
            const questoes = data.questoes || [];
            
            let turmaId = null;
            if (prova.turmaId) turmaId = prova.turmaId;
            else if (prova.turma && prova.turma.id) turmaId = prova.turma.id;
            else if (prova.turma && prova.turma._id) turmaId = prova.turma._id;
            else if (prova.turma && typeof prova.turma === 'string') turmaId = prova.turma;
            
            window.alunosDaTurma = [];
            
            if (turmaId) {
                try {
                    let alunosRaw = [];
                    try {
                        const alunosRes = await fetch(`${API_BASE_URL}/turmas/${turmaId}/alunos`, { headers: { 'Authorization': `Bearer ${token}` } });
                        const alunosData = await alunosRes.json();
                        if (alunosData.success && alunosData.alunos) alunosRaw = alunosData.alunos;
                        else if (alunosData.alunos) alunosRaw = alunosData.alunos;
                    } catch (e) { console.log('⚠️ Rota /alunos falhou:', e.message); }
                    
                    if (alunosRaw.length === 0) {
                        try {
                            const turmaRes = await fetch(`${API_BASE_URL}/turmas/${turmaId}`, { headers: { 'Authorization': `Bearer ${token}` } });
                            const turmaData = await turmaRes.json();
                            if (turmaData.success && turmaData.turma && turmaData.turma.alunos) alunosRaw = turmaData.turma.alunos;
                            else if (turmaData.turma && turmaData.turma.alunos) alunosRaw = turmaData.turma.alunos;
                            else if (turmaData.alunos) alunosRaw = turmaData.alunos;
                        } catch (e) { console.log('⚠️ Rota principal falhou:', e.message); }
                    }
                    
                    if (alunosRaw.length === 0 && prova.turma && prova.turma.alunos) alunosRaw = prova.turma.alunos;
                    
                    if (alunosRaw.length > 0) {
                        const alunosUnicos = new Map();
                        for (const aluno of alunosRaw) {
                            const alunoId = aluno._id || aluno.id || aluno.alunoId;
                            const alunoNome = aluno.nome || aluno.alunoNome || aluno.name || 'Aluno';
                            if (alunoId && !alunosUnicos.has(alunoId.toString())) {
                                alunosUnicos.set(alunoId.toString(), {
                                    id: alunoId, _id: alunoId, nome: alunoNome,
                                    email: aluno.email || aluno.alunoEmail || '',
                                    matricula: aluno.matricula || ''
                                });
                            }
                        }
                        window.alunosDaTurma = Array.from(alunosUnicos.values());
                    }
                } catch (error) {
                    console.error('❌ Erro ao carregar turma:', error);
                    window.alunosDaTurma = [];
                }
            }
            
            let qrCodeDataUrl = '';
            try {
                const correcaoUrl = `${window.location.origin}/corrigir-prova.html?prova=${provaId}`;
                const qrResponse = await fetch(`${API_BASE_URL}/qrcode/gerar`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: correcaoUrl })
                });
                const qrData = await qrResponse.json();
                if (qrData.success && qrData.qrCode) qrCodeDataUrl = qrData.qrCode;
            } catch (qrError) { console.error('❌ Erro ao buscar QR Code:', qrError); }
            
            window.provaParaImpressao = { prova, questoes, qrCodeDataUrl, API_BASE_URL, token };
            this.mostrarModalPerguntaAdaptacao();
        } catch (error) {
            console.error('❌ Erro ao preparar impressão:', error);
            this.showToast(`❌ Erro: ${error.message}`, 'error');
        }
    }

    mostrarModalPerguntaAdaptacao() {
        if (!window.provaParaImpressao || !window.provaParaImpressao.prova) {
            this.showToast('❌ Dados da prova não encontrados.', 'error');
            return;
        }
        
        this.closeAllModals();
        
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'modalPerguntaAdaptacao';
        modal.style.cssText = 'display:flex;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:10001;align-items:center;justify-content:center;';
        
        const alunos = window.alunosDaTurma || [];
        const temAlunos = alunos.length > 0;
        
        let selectOptions = '<option value="">Selecione um aluno...</option>';
        if (temAlunos) {
            selectOptions += alunos.map(aluno => `
                <option value="${aluno.id || aluno._id}">
                    ${aluno.nome || aluno.alunoNome || 'Aluno'} ${aluno.matricula ? `(${aluno.matricula})` : ''}
                </option>
            `).join('');
        } else {
            selectOptions = '<option value="" disabled>Nenhum aluno encontrado nesta turma</option>';
        }
        
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px; width: 90%; background: white; border-radius: 24px; padding: 0; margin: auto; box-shadow: 0 20px 40px rgba(0,0,0,0.2); max-height: 90vh; overflow-y: auto;">
                <div class="modal-header" style="background: linear-gradient(135deg, #4f46e5, #7c3aed); color: white; padding: 20px 25px; border-radius: 24px 24px 0 0; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 10;">
                    <h3 style="margin: 0; display: flex; align-items: center; gap: 10px;"><i class="fas fa-print"></i> Imprimir Prova</h3>
                    <button onclick="setorPedagogico.fecharModalAdaptacao('modalPerguntaAdaptacao')" style="background: none; border: none; color: white; font-size: 28px; cursor: pointer; line-height: 1;">&times;</button>
                </div>
                <div style="padding: 25px;">
                    <p style="color: #4b5563; margin-bottom: 20px; text-align: center; font-size: 1rem;">Deseja adaptar esta prova para acessibilidade?</p>
                    
                    <div style="margin-bottom: 20px; padding: 15px; background: #f8fafc; border-radius: 16px;">
                        <label style="display: flex; align-items: center; gap: 12px; cursor: pointer; margin-bottom: 12px;">
                            <input type="radio" name="tipoImpressao" value="individual" ${temAlunos ? 'checked' : 'disabled'} onchange="setorPedagogico.toggleOpcaoAlunos()">
                            <span><strong>👤 Imprimir para um aluno específico</strong></span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                            <input type="radio" name="tipoImpressao" value="todos" ${temAlunos ? '' : 'checked disabled'} onchange="setorPedagogico.toggleOpcaoAlunos()">
                            <span><strong>👥 Imprimir para todos os alunos da turma</strong></span>
                        </label>
                        <div id="selectAlunosContainer" style="margin-top: 15px; ${temAlunos ? 'display: block;' : 'display: none;'}">
                            <label style="display: block; margin-bottom: 8px; font-weight: 500;"><i class="fas fa-user-graduate"></i> Selecione o aluno:</label>
                            <select id="selectAlunoImpressao" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #ddd;">${selectOptions}</select>
                        </div>
                        <div style="margin-top: 12px; padding: 10px; background: #e0f2fe; border-radius: 8px; font-size: 0.85rem;">
                            <i class="fas fa-info-circle"></i> <span id="infoImpressao">${temAlunos ? `Selecione um aluno ou imprima para todos (${alunos.length} alunos).` : 'Nenhum aluno encontrado nesta turma.'}</span>
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 15px;">
                        <button onclick="setorPedagogico.fecharModalAdaptacao('modalPerguntaAdaptacao'); setorPedagogico.gerarImpressaoNormal()" style="flex: 1; padding: 14px; background: #6b7280; color: white; border: none; border-radius: 12px; font-weight: 600; cursor: pointer;"><i class="fas fa-times"></i> Não, imprimir normal</button>
                        <button onclick="setorPedagogico.fecharModalAdaptacao('modalPerguntaAdaptacao'); setorPedagogico.mostrarModalOpcoesAdaptacao()" style="flex: 1; padding: 14px; background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; border-radius: 12px; font-weight: 600; cursor: pointer;"><i class="fas fa-universal-access"></i> Sim, adaptar</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    toggleOpcaoAlunos() {
        const tipoImpressao = document.querySelector('input[name="tipoImpressao"]:checked')?.value;
        const selectContainer = document.getElementById('selectAlunosContainer');
        const infoSpan = document.getElementById('infoImpressao');
        const alunos = window.alunosDaTurma || [];
        
        if (tipoImpressao === 'individual') {
            if (selectContainer) selectContainer.style.display = 'block';
            if (infoSpan) infoSpan.innerHTML = `Será gerada uma prova com QR Code específico para o aluno selecionado. (${alunos.length} alunos disponíveis)`;
        } else {
            if (selectContainer) selectContainer.style.display = 'none';
            if (infoSpan) infoSpan.innerHTML = `Será gerado um documento único com todos os ${alunos.length} alunos da turma.`;
        }
    }

    mostrarModalOpcoesAdaptacao() {
        if (!window.provaParaImpressao || !window.provaParaImpressao.prova) {
            this.showToast('❌ Dados da prova não encontrados.', 'error');
            return;
        }
        
        const modalPergunta = document.getElementById('modalPerguntaAdaptacao');
        if (modalPergunta) modalPergunta.style.display = 'none';
        
        let modalOpcoes = document.getElementById('modalOpcoesAdaptacao');
        if (modalOpcoes) modalOpcoes.remove();
        
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'modalOpcoesAdaptacao';
        modal.style.cssText = 'display:flex;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:10002;align-items:center;justify-content:center;';
        
        const { prova } = window.provaParaImpressao;
        const isAdaptada = prova?.tipoProva === 'adaptada' || prova?.adaptada === true;
        
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 550px; width: 90%; background: white; border-radius: 24px; padding: 0; margin: auto; box-shadow: 0 20px 40px rgba(0,0,0,0.2); max-height: 90vh; overflow-y: auto; display: flex; flex-direction: column;">
                <div class="modal-header" style="background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 20px 25px; border-radius: 24px 24px 0 0; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 10;">
                    <h3 style="margin: 0; display: flex; align-items: center; gap: 10px;"><i class="fas fa-universal-access"></i> Opções de Adaptação</h3>
                    <button onclick="setorPedagogico.fecharModalAdaptacao('modalOpcoesAdaptacao')" style="background: none; border: none; color: white; font-size: 28px; cursor: pointer;">&times;</button>
                </div>
                <div style="padding: 25px; overflow-y: auto; flex: 1;">
                    <p style="color: #4b5563; margin-bottom: 20px;">Selecione as adaptações desejadas para a impressão:</p>
                    ${isAdaptada ? `<div style="background: #dbeafe; padding: 10px; margin-bottom: 15px; border-radius: 8px;"><i class="fas fa-info-circle"></i> Prova originalmente adaptada - 3 alternativas</div>` : ''}
                    
                    <div style="display: flex; flex-direction: column; gap: 15px;">
                        <div style="background: #f8fafc; padding: 15px; border-radius: 16px; border: 2px solid #e5e7eb;">
                            <label style="display: flex; align-items: center; gap: 12px; cursor: pointer; margin-bottom: 10px;">
                                <input type="checkbox" id="optFonteDinamica" style="width: 20px; height: 20px;">
                                <div>
                                    <strong style="font-size: 1rem;">🔍 Fonte Dinâmica</strong>
                                    <p style="margin: 5px 0 0; font-size: 0.85rem; color: #6b7280;">Amplie o tamanho da fonte conforme sua necessidade</p>
                                </div>
                            </label>
                            <div id="sliderContainer" style="display: none; margin-top: 15px; padding-top: 10px; border-top: 1px solid #e5e7eb;">
                                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                                    <span style="font-size: 12px;">Normal (12pt)</span>
                                    <span style="font-size: 12px; font-weight: bold;" id="tamanhoFonteAtual">12pt</span>
                                    <span style="font-size: 12px;">Máximo (48pt)</span>
                                </div>
                                <input type="range" id="fonteSlider" min="12" max="48" step="1" value="12" style="width: 100%; margin: 10px 0;">
                                <div style="display: flex; justify-content: space-between; gap: 10px; margin-top: 10px; flex-wrap: wrap;">
                                    <button type="button" onclick="setorPedagogico.ajustarFonteRapido(12)" style="flex: 1; padding: 6px; background: #e5e7eb; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">Normal</button>
                                    <button type="button" onclick="setorPedagogico.ajustarFonteRapido(18)" style="flex: 1; padding: 6px; background: #e5e7eb; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">Médio</button>
                                    <button type="button" onclick="setorPedagogico.ajustarFonteRapido(24)" style="flex: 1; padding: 6px; background: #e5e7eb; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">Grande</button>
                                    <button type="button" onclick="setorPedagogico.ajustarFonteRapido(36)" style="flex: 1; padding: 6px; background: #e5e7eb; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">Muito Grande</button>
                                    <button type="button" onclick="setorPedagogico.ajustarFonteRapido(48)" style="flex: 1; padding: 6px; background: #e5e7eb; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">Máximo</button>
                                </div>
                                <div style="margin-top: 10px; padding: 8px; background: #f1f5f9; border-radius: 8px; text-align: center; font-size: 12px; color: #475569;">
                                    <i class="fas fa-mouse-pointer"></i> <strong>Pré-visualização:</strong>
                                    <span id="previewFonte" style="font-size: 12px; display: inline-block; margin-left: 8px;">Texto exemplo</span>
                                </div>
                            </div>
                        </div>
                        
                        <div style="background: #f8fafc; padding: 15px; border-radius: 16px; border: 2px solid #e5e7eb;">
                            <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                                <input type="checkbox" id="optNegrito" style="width: 20px; height: 20px;">
                                <div><strong style="font-size: 1rem;">🔤 Texto em Negrito</strong><p style="margin: 5px 0 0; font-size: 0.85rem; color: #6b7280;">Aplicar negrito em todo o texto da prova</p></div>
                            </label>
                        </div>
                        
                        <div style="background: #f8fafc; padding: 15px; border-radius: 16px; border: 2px solid #e5e7eb;">
                            <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                                <input type="checkbox" id="optAltoContraste" style="width: 20px; height: 20px;">
                                <div><strong style="font-size: 1rem;">🎨 Alto Contraste</strong><p style="margin: 5px 0 0; font-size: 0.85rem; color: #6b7280;">Fundo escuro com texto claro para melhor visualização</p></div>
                            </label>
                        </div>
                        
                        <div style="background: #f8fafc; padding: 15px; border-radius: 16px; border: 2px solid #e5e7eb;">
                            <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                                <input type="checkbox" id="optLayoutSimplificado" style="width: 20px; height: 20px;">
                                <div><strong style="font-size: 1rem;">📄 Layout Simplificado</strong><p style="margin: 5px 0 0; font-size: 0.85rem; color: #6b7280;">Remover elementos decorativos, manter apenas o essencial</p></div>
                            </label>
                        </div>
                        
                        <div style="background: #f8fafc; padding: 15px; border-radius: 16px; border: 2px solid #e5e7eb;">
                            <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                                <input type="checkbox" id="optCaixaAlta" style="width: 20px; height: 20px;">
                                <div>
                                    <strong style="font-size: 1rem;">🔠 CAIXA ALTA (Maiúsculas)</strong>
                                    <p style="margin: 5px 0 0; font-size: 0.85rem; color: #6b7280;">Converte todo o texto para letras maiúsculas</p>
                                </div>
                            </label>
                            <div id="caixaAltaPreview" style="margin-top: 10px; padding: 8px; background: #fff; border-radius: 8px; font-size: 12px; color: #64748b; border: 1px solid #e5e7eb;">
                                <i class="fas fa-eye"></i> Pré-visualização: <span id="previewCaixaAlta">Exemplo de texto em maiúsculas</span>
                            </div>
                        </div>
                    </div>
                    
                    <div style="margin-top: 20px; padding: 12px; background: #fef3c7; border-radius: 12px;">
                        <p style="margin: 0; font-size: 0.85rem;"><i class="fas fa-lightbulb"></i> <strong>Dica:</strong> Você pode combinar várias opções conforme a necessidade do aluno.</p>
                    </div>
                    
                    <div style="display: flex; gap: 12px; margin-top: 25px; margin-bottom: 10px;">
                        <button onclick="setorPedagogico.fecharModalAdaptacao('modalOpcoesAdaptacao'); setorPedagogico.gerarImpressaoComOpcoes()" style="flex: 1; padding: 14px; background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; border-radius: 12px; font-weight: 600; cursor: pointer;"><i class="fas fa-print"></i> Imprimir com Adaptações</button>
                        <button onclick="setorPedagogico.fecharModalAdaptacao('modalOpcoesAdaptacao')" style="flex: 1; padding: 14px; background: #6b7280; color: white; border: none; border-radius: 12px; font-weight: 600; cursor: pointer;">Cancelar</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        setTimeout(() => {
            const fonteDinamicaCheckbox = document.getElementById('optFonteDinamica');
            const sliderContainer = document.getElementById('sliderContainer');
            const fonteSlider = document.getElementById('fonteSlider');
            const tamanhoAtual = document.getElementById('tamanhoFonteAtual');
            const previewFonte = document.getElementById('previewFonte');
            const caixaAltaCheckbox = document.getElementById('optCaixaAlta');
            const previewCaixaAlta = document.getElementById('previewCaixaAlta');

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
                    if (sliderContainer) sliderContainer.style.display = this.checked ? 'block' : 'none';
                });
            }
            if (fonteSlider) {
                fonteSlider.addEventListener('input', function() {
                    const tamanho = this.value;
                    if (tamanhoAtual) tamanhoAtual.textContent = tamanho + 'pt';
                    if (previewFonte) {
                        previewFonte.style.fontSize = tamanho + 'pt';
                        previewFonte.style.fontWeight = 'bold';
                    }
                });
                fonteSlider.dispatchEvent(new Event('input'));
            }
        }, 100);
    }

    ajustarFonteRapido(tamanho) {
        const slider = document.getElementById('fonteSlider');
        const tamanhoAtual = document.getElementById('tamanhoFonteAtual');
        const previewFonte = document.getElementById('previewFonte');
        
        if (slider) {
            slider.value = tamanho;
            if (tamanhoAtual) tamanhoAtual.textContent = tamanho + 'pt';
            if (previewFonte) previewFonte.style.fontSize = tamanho + 'pt';
            const checkbox = document.getElementById('optFonteDinamica');
            if (checkbox && !checkbox.checked) {
                checkbox.checked = true;
                const sliderContainer = document.getElementById('sliderContainer');
                if (sliderContainer) sliderContainer.style.display = 'block';
            }
        }
    }

    fecharModalAdaptacao(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.style.display = 'none';
    }

    async gerarImpressaoNormal() {
        const { prova, questoes, qrCodeDataUrl } = window.provaParaImpressao || {};
        if (!prova) { this.showToast('❌ Erro: dados da prova não encontrados', 'error'); return; }
        
        const tipoImpressao = document.querySelector('input[name="tipoImpressao"]:checked')?.value;
        const selectAluno = document.getElementById('selectAlunoImpressao');
        const alunoId = selectAluno?.value;
        const alunoNome = selectAluno?.options[selectAluno.selectedIndex]?.text.split('(')[0].trim();
        
        this.fecharModalAdaptacao('modalPerguntaAdaptacao');
        
        if (tipoImpressao === 'todos') {
            const alunos = window.alunosDaTurma || [];
            if (alunos.length === 0) { this.showToast('⚠️ Nenhum aluno encontrado', 'info'); return; }
            await this.gerarImpressaoTodosAlunos(prova, questoes, qrCodeDataUrl, {}, alunos);
            return;
        }
        
        if (!alunoId) { this.showToast('⚠️ Selecione um aluno', 'info'); this.mostrarModalPerguntaAdaptacao(); return; }
        
        let qrCodeAlunoUrl = null;
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`/api/aluno/qrcode/${alunoId}`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
            });
            const data = await response.json();
            if (data.success && data.qrCode) qrCodeAlunoUrl = data.qrCode;
            else this.showToast('⚠️ QR Code do aluno não encontrado.', 'warning');
        } catch (error) {
            console.error('❌ Erro ao buscar QR Code do aluno:', error);
            this.showToast('❌ Erro ao buscar QR Code do aluno', 'error');
        }
        
        await this.gerarHTMLImpressao(prova, questoes, qrCodeDataUrl, {}, qrCodeAlunoUrl, alunoNome);
    }

    async gerarImpressaoComOpcoes() {
        const { prova, questoes, qrCodeDataUrl } = window.provaParaImpressao || {};
        if (!prova) { this.showToast('❌ Erro: dados da prova não encontrados', 'error'); return; }
        
        const fonteDinamicaHabilitada = document.getElementById('optFonteDinamica')?.checked || false;
        const tamanhoFonte = fonteDinamicaHabilitada ? (document.getElementById('fonteSlider')?.value || 12) : 12;
        
        const opcoes = {
            fonteAmpliada: fonteDinamicaHabilitada ? tamanhoFonte : false,
            fontePersonalizada: fonteDinamicaHabilitada ? tamanhoFonte : false,
            negrito: document.getElementById('optNegrito')?.checked || false,
            altoContraste: document.getElementById('optAltoContraste')?.checked || false,
            layoutSimplificado: document.getElementById('optLayoutSimplificado')?.checked || false,
            tamanhoFonte: parseInt(tamanhoFonte),
            caixaAlta: document.getElementById('optCaixaAlta')?.checked || false
        };
        
        const nenhumaOpcao = !opcoes.fontePersonalizada && !opcoes.negrito && !opcoes.altoContraste && !opcoes.layoutSimplificado && !opcoes.caixaAlta;
        if (nenhumaOpcao) {
            const confirmar = await confirm('Nenhuma opção selecionada. Imprimir normalmente?');
            if (confirmar) {
                this.fecharModalAdaptacao('modalOpcoesAdaptacao');
                await this.gerarImpressaoNormal();
            }
            return;
        }
        
        const tipoImpressao = document.querySelector('input[name="tipoImpressao"]:checked')?.value;
        const selectAluno = document.getElementById('selectAlunoImpressao');
        const alunoId = selectAluno?.value;
        const alunoNome = selectAluno?.options[selectAluno.selectedIndex]?.text.split('(')[0].trim();
        
        this.fecharModalAdaptacao('modalOpcoesAdaptacao');
        this.fecharModalAdaptacao('modalPerguntaAdaptacao');
        
        if (tipoImpressao === 'todos') {
            const alunos = window.alunosDaTurma || [];
            if (alunos.length === 0) { this.showToast('⚠️ Nenhum aluno encontrado', 'info'); return; }
            await this.gerarImpressaoTodosAlunos(prova, questoes, qrCodeDataUrl, opcoes, alunos);
            return;
        }
        
        if (!alunoId) { this.showToast('⚠️ Selecione um aluno', 'info'); this.mostrarModalPerguntaAdaptacao(); return; }
        
        let qrCodeAlunoUrl = null;
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`/api/aluno/qrcode/${alunoId}`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
            });
            const data = await response.json();
            if (data.success && data.qrCode) qrCodeAlunoUrl = data.qrCode;
            else this.showToast('⚠️ QR Code do aluno não encontrado.', 'warning');
        } catch (error) {
            console.error('❌ Erro ao buscar QR Code do aluno:', error);
            this.showToast('❌ Erro ao buscar QR Code do aluno', 'error');
        }
        
        await this.gerarHTMLImpressao(prova, questoes, qrCodeDataUrl, opcoes, qrCodeAlunoUrl, alunoNome);
    }

    async gerarImpressaoTodosAlunos(prova, questoes, qrCodeDataUrl, opcoesAdaptacao, alunos) {
        this.showToast(`🖨️ Gerando prova para ${alunos.length} aluno(s)...`, 'info');
        try {
            const token = localStorage.getItem('auth_token');
            const alunosComQRCode = await Promise.all(alunos.map(async (aluno) => {
                const alunoId = aluno._id || aluno.id;
                const alunoNome = aluno.nome || aluno.alunoNome || 'Aluno';
                let qrCodeAlunoUrl = '';
                try {
                    const response = await fetch(`/api/aluno/qrcode/${alunoId}`, {
                        method: 'GET',
                        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
                    });
                    const data = await response.json();
                    if (data.success && data.qrCode) qrCodeAlunoUrl = data.qrCode;
                } catch (error) {
                    console.error(`❌ Erro ao buscar QR Code para ${alunoNome}:`, error);
                }
                return { ...aluno, qrCodeDataUrl: qrCodeAlunoUrl, id: alunoId, nome: alunoNome };
            }));
            
            let htmlCompleto = '';
            for (let i = 0; i < alunosComQRCode.length; i++) {
                const aluno = alunosComQRCode[i];
                window.alunoSelecionadoNome = aluno.nome;
                const htmlAluno = this.gerarHTMLProvaCompleta(prova, questoes, qrCodeDataUrl, opcoesAdaptacao, aluno.qrCodeDataUrl, aluno.nome);
                htmlCompleto += htmlAluno;
                if (i < alunosComQRCode.length - 1) htmlCompleto += `<div style="page-break-before: always;"></div>`;
            }
            
            const printWindow = window.open('', '_blank');
            printWindow.document.write(htmlCompleto);
            printWindow.document.close();
            printWindow.onload = () => { printWindow.print(); printWindow.onafterprint = () => printWindow.close(); };
            this.showToast(`✅ Impressão preparada para ${alunosComQRCode.length} aluno(s)!`, 'success');
        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast(`❌ Erro: ${error.message}`, 'error');
        }
    }

    gerarHTMLProvaCompleta(prova, questoes, qrCodeDataUrl, opcoesAdaptacao = {}, qrCodeAlunoUrl = null, alunoNome = null) {
        const provaTitulo = prova.titulo || 'Prova sem título';
        const logoIema = '/uploads/logo-iema.png';
        const dataAtual = new Date();
        const dataFormatada = dataAtual.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const totalQuestoes = questoes.length;
        const turmaNome = prova.turma?.nome || 'Turma não especificada';
        const disciplina = prova.turma?.disciplina || 'Disciplina não especificada';
        const professorNome = prova.professor?.nome || 'Professor';
        const periodo = prova.periodo ? `${prova.periodo}º Período` : '1º Período';
        const isAdaptada = prova.tipoProva === 'adaptada' || prova.adaptada === true;
        const letrasUsadas = isAdaptada ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D', 'E'];
        
        let adaptacoesTexto = '';
        const temAdaptacoes = opcoesAdaptacao.fonteAmpliada || opcoesAdaptacao.negrito || opcoesAdaptacao.altoContraste || opcoesAdaptacao.layoutSimplificado || opcoesAdaptacao.fontePersonalizada || opcoesAdaptacao.caixaAlta;
        if (temAdaptacoes) {
            const adaptacoesSelecionadas = [];
            if (opcoesAdaptacao.fontePersonalizada && opcoesAdaptacao.tamanhoFonte) adaptacoesSelecionadas.push(`Fonte Dinâmica (${opcoesAdaptacao.tamanhoFonte}pt)`);
            else if (opcoesAdaptacao.fonteAmpliada) adaptacoesSelecionadas.push('Fonte Ampliada');
            if (opcoesAdaptacao.negrito) adaptacoesSelecionadas.push('Texto em Negrito');
            if (opcoesAdaptacao.altoContraste) adaptacoesSelecionadas.push('Alto Contraste');
            if (opcoesAdaptacao.layoutSimplificado) adaptacoesSelecionadas.push('Layout Simplificado');
            if (opcoesAdaptacao.caixaAlta) adaptacoesSelecionadas.push('Caixa Alta');
            adaptacoesTexto = `<div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 8px 12px; margin: 10px 0; border-radius: 8px;"><p style="margin: 0; font-size: 0.85rem; color: #92400e;"><i class="fas fa-universal-access"></i> <strong>Prova Adaptada</strong> - Esta impressão inclui: ${adaptacoesSelecionadas.join(', ')}.</p></div>`;
        }
        
        let questoesHTML = '';
        questoes.forEach((questao, index) => {
            const opcoes = questao.opcoes || [];
            const opcoesFormatadas = opcoes.map((opcao, optIndex) => {
                const letra = letrasUsadas[optIndex];
                let opcaoLimpa = opcao || 'Opção não disponível';
                if (opcaoLimpa.startsWith(`${letra})`) || opcaoLimpa.startsWith(`${letra}.`)) opcaoLimpa = opcaoLimpa.substring(2).trim();
                return { letra, texto: opcaoLimpa };
            });
            questoesHTML += `
                <div class="questao-print">
                    <div class="questao-numero">Questão ${index + 1} ${isAdaptada ? '(Prova Adaptada - 3 alternativas)' : ''}</div>
                    <div class="questao-texto"><strong>${questao.pergunta || 'Pergunta não disponível'}</strong></div>
                    <div class="opcoes-print">${opcoesFormatadas.map(op => `<div class="opcao-linha"><span class="opcao-letra">${op.letra})</span><span class="opcao-texto">${op.texto}</span></div>`).join('')}</div>
                    <div class="rascunho-area"><small>Espaço para rascunho</small><div class="rascunho-linhas"></div></div>
                </div>
            `;
        });
        
        const gerarCartaoResposta = () => {
            const qrCodeArea = qrCodeDataUrl ? `
                <div style="text-align: center; margin-top: 10px; padding: 8px; background: #f9f9f9; border: 1px solid #ddd; border-radius: 8px; display: inline-block; width: auto;">
                    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;">
                        <img src="${qrCodeDataUrl}" style="width: 85px; height: auto; border: 1px solid #ccc; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);" alt="QR Code">
                        <div style="font-size: 9px; color: #666; text-align: center;">
                            <strong>📱 Correção Automática</strong><br>
                            Escaneie este QR Code
                        </div>
                    </div>
                </div>
            ` : '';
            
            let qrCodeAlunoArea = '';
            if (qrCodeAlunoUrl) {
                qrCodeAlunoArea = `
                    <div style="text-align: center; margin-top: 10px; padding: 8px; background: #f9f9f9; border: 1px solid #ddd; border-radius: 8px; display: inline-block; width: auto;">
                        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;">
                            <img src="${qrCodeAlunoUrl}" style="width: 85px; height: auto; border: 1px solid #ccc; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);" alt="QR Code do Aluno">
                            <div style="font-size: 9px; color: #666; text-align: center;">
                                <strong>👤 Identificação do Aluno</strong><br>
                                ${alunoNome || 'Aluno'}
                            </div>
                        </div>
                    </div>
                `;
            }
            
            return `
                <div style="text-align: center;">
                    <div class="cartao-header" style="margin-bottom: 8px;">
                        <h4 style="margin: 0 0 5px 0; font-size: 11pt; font-weight: bold; text-align: center;">📝 CARTÃO-RESPOSTA</h4>
                        <div class="instrucoes-cartao" style="font-size: 8pt; color: #333; text-align: center; padding: 8px; background: #fef3c7; border-radius: 6px;">
                            <p style="margin: 0;"><strong>INSTRUÇÕES PARA PREENCHIMENTO DO CARTÃO-RESPOSTA</strong></p>
                            <p style="margin: 5px 0 0 0;">Ao marcar a alternativa correta no cartão-resposta (Gabarito), use caneta esferográfica de tinta azul ou preta. Será anulada a questão que contiver rasura ou, ainda, a que apresentar mais de uma alternativa assinalada no cartão-resposta (Gabarito).</p>
                        </div>
                    </div>
                    <div class="cartao-resposta" style="position: relative; margin: 8px auto; border: 2px solid #000; padding: 15px 12px 12px 12px; background: #fff; display: inline-block; width: 85%; box-sizing: border-box; max-width: 650px;">
                        <div style="position: absolute; top: 5px; left: 5px; width: 25px; height: 25px; background: #000 !important; border: 1px solid #000 !important; z-index: 5; print-color-adjust: exact;"></div>
                        <div style="position: absolute; top: 5px; right: 5px; width: 25px; height: 25px; background: #000 !important; border: 1px solid #000 !important; z-index: 5; print-color-adjust: exact;"></div>
                        <div style="position: absolute; bottom: 5px; left: 5px; width: 25px; height: 25px; background: #000 !important; border: 1px solid #000 !important; z-index: 5; print-color-adjust: exact;"></div>
                        <div style="position: absolute; bottom: 5px; right: 5px; width: 25px; height: 25px; background: #000 !important; border: 1px solid #000 !important; z-index: 5; print-color-adjust: exact;"></div>
                        <table style="width: 100%; border-collapse: collapse; border: 1px solid #000;">
                            <thead><tr style="background: #e8e8e8;"><th style="border: 1px solid #000; padding: 6px 3px; text-align: center; font-weight: bold; font-size: 8pt; width: 35px;">Q</th>${letrasUsadas.map(letra => `<th style="border: 1px solid #000; padding: 6px 3px; text-align: center; font-weight: bold; font-size: 8pt; width: 35px;">${letra}</th>`).join('')} </tr></thead>
                            <tbody>${Array.from({ length: totalQuestoes }, (_, i) => ` <tr><td style="border: 1px solid #000; padding: 5px 3px; text-align: center; font-weight: bold; font-size: 8pt;">${i + 1}</td>${letrasUsadas.map(() => `<td style="border: 1px solid #000; padding: 5px 3px; text-align: center;"><div style="width: 12px; height: 12px; border: 1.5px solid #000; border-radius: 50%; margin: 0 auto;"></div></td>`).join('')}</tr>`).join('')}</tbody>
                        </table>
                    </div>
                    <div style="display: flex; justify-content: center; align-items: center; gap: 40px; margin-top: 15px; flex-wrap: wrap;">${qrCodeArea}${qrCodeAlunoArea}</div>
                </div>
            `;
        };
        
        let cssAdaptacoes = '';
        if (opcoesAdaptacao.caixaAlta) {
            cssAdaptacoes += `body, .questao-texto, .opcao-linha, .instrucoes-cartao, .questao-numero, .cartao-header h4, .print-header h1, .print-prova-info h3, .label, .campo-label, .instrucoes-box h4, .info-label, .info-linha, .instrucoes-box li, .print-footer, .student-item, .campo-item, .cartao-resposta td, .cartao-resposta th, .rascunho-area small, .instrucoes-box ul, .instrucoes-box p, .student-item .label, .campo-item .campo-label, .info-linha .info-item, .print-prova-info .info-linha span, .questao-print, .opcoes-print, .opcao-linha .opcao-letra, .opcao-linha .opcao-texto, .print-header .student-row { text-transform: uppercase !important; }`;
        }
        if (opcoesAdaptacao.fontePersonalizada && opcoesAdaptacao.tamanhoFonte) {
            const t = opcoesAdaptacao.tamanhoFonte;
            cssAdaptacoes += `body{font-size:${t}pt!important}.questao-texto{font-size:${t}pt!important}.opcao-linha{font-size:${t-2}pt!important}.instrucoes-cartao{font-size:${t-5}pt!important}.rascunho-area small{font-size:${t-5}pt!important}.questao-numero{font-size:${t-2}pt!important}.print-header h1{font-size:${t+4}pt!important}.print-prova-info h3{font-size:${t+2}pt!important}.campos-box .campo-label,.student-item .label{font-size:${t-2}pt!important}.instrucoes-box li,.instrucoes-box h4,.info-linha,.info-item{font-size:${t-4}pt!important}.cartao-resposta th,.cartao-resposta td{font-size:${t-4}pt!important}.instrucoes-cartao p{font-size:${t-4}pt!important}.print-footer{font-size:${t-4.5}pt!important}`;
        } else if (opcoesAdaptacao.fonteAmpliada) {
            cssAdaptacoes += `body{font-size:16pt!important}.questao-texto{font-size:16pt!important}.opcao-linha{font-size:14pt!important}.instrucoes-cartao{font-size:11pt!important}.rascunho-area small{font-size:10pt!important}.questao-numero{font-size:14pt!important}.print-header h1{font-size:18pt!important}.print-prova-info h3{font-size:16pt!important}.campos-box .campo-label,.student-item .label{font-size:12pt!important}.instrucoes-box li,.instrucoes-box h4,.info-linha,.info-item{font-size:11pt!important}`;
        }
        if (opcoesAdaptacao.negrito) cssAdaptacoes += `body,.questao-texto,.opcao-linha,.instrucoes-cartao,.questao-numero,.cartao-header h4,.print-header h1,.print-prova-info h3,.label,.campo-label,.instrucoes-box h4,.info-label,.info-linha,.instrucoes-box li,.print-footer{font-weight:bold!important}`;
        if (opcoesAdaptacao.altoContraste) cssAdaptacoes += `body{background:#000!important;color:#fff!important}.print-header,.campos-box,.instrucoes-box,.print-prova-info,.cartao-resposta,.questao-print,.rascunho-area,.info-linha{background:#000!important;color:#fff!important;border-color:#fff!important}.underline,.campo-underline{border-bottom-color:#fff!important}.rascunho-linhas{background:repeating-linear-gradient(transparent,transparent 16px,#fff 16px,#fff 18px)!important}`;
        if (opcoesAdaptacao.layoutSimplificado) cssAdaptacoes += `.print-logo,.logo-iema{display:none!important}.campos-box{border:1px solid #000!important}.instrucoes-box{border:1px solid #000!important;background:#fefefe!important}.print-header{border-bottom:1px solid #000!important}`;
        
        return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Prova - ${provaTitulo}</title><style>@media print{body{margin:0;padding:0}.questao-print{page-break-inside:avoid}.cartao-resposta{page-break-inside:avoid}.questoes-container{page-break-before:always;margin-top:0}}body{font-family:'Times New Roman',Times,serif;font-size:12pt;line-height:1.3;margin:0;padding:0.4in;background:white;color:black;position:relative}.print-header{text-align:center;margin-bottom:6px;padding-bottom:6px;border-bottom:2px solid #000}.print-logo{max-width:999px;width:100%;height:auto;display:block;margin:0 auto 3px auto}.print-header h1{font-size:14pt;font-weight:bold;margin:0 0 5px 0}.student-row{display:flex;justify-content:space-between;margin:4px 0;gap:15px}.student-item{flex:1;display:flex;align-items:baseline;gap:6px}.label{font-weight:bold;min-width:65px;font-size:10pt}.underline{border-bottom:1px dotted #000;flex:1;height:16px}.campos-box{margin:6px 0;border:2px solid #000;padding:5px 12px;display:flex;justify-content:space-between;gap:20px}.campo-item{flex:1;display:flex;align-items:baseline;gap:6px}.campo-label{font-weight:bold;min-width:35px;font-size:10pt}.campo-underline{border-bottom:1px dotted #000;flex:1;height:16px}.instrucoes-box{margin:6px 0;border:1px solid #ccc;padding:8px 12px;background:#fefefe;border-radius:4px}.instrucoes-box h4{margin:0 0 5px 0;font-size:10pt;font-weight:bold;color:#4f46e5;text-align:center}.instrucoes-box ul{margin:0;padding-left:20px}.instrucoes-box li{margin-bottom:3px;font-size:8.5pt;line-height:1.3}.print-prova-info{margin:8px 0;padding:5px 8px;border:1px solid #ddd;background:#fafafa}.print-prova-info h3{margin:0 0 3px 0;font-size:11pt;text-align:center;font-weight:bold}.info-linha{display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;font-size:8pt;border-top:1px solid #eee;padding-top:4px;margin-top:4px}.info-item{display:inline-flex;gap:4px}.questoes-container{page-break-before:always;margin-top:0}.questao-print{margin-bottom:20px}.questao-numero{font-weight:bold;margin-bottom:6px;border-bottom:1px solid #ccc;padding-bottom:3px;font-size:10pt}.questao-texto{margin-bottom:10px;margin-left:8px;line-height:1.4;font-size:11pt}.opcao-linha{margin:6px 0 6px 18px;display:flex;font-size:10pt}.opcao-letra{min-width:22px;font-weight:500}.rascunho-area{margin-top:8px;border-top:1px dashed #ccc;padding-top:5px}.rascunho-area small{font-size:7pt}.rascunho-linhas{min-height:35px;background:repeating-linear-gradient(transparent,transparent 16px,#eee 16px,#eee 18px)}.print-footer{margin-top:25px;text-align:center;font-size:7.5pt;color:#666;border-top:1px solid #ccc;padding-top:8px}${cssAdaptacoes}</style></head><body><div class="print-header"><img src="${logoIema}" class="print-logo" alt="IEMA" onerror="this.style.display='none'"><h1>IEMA PLENO: SÃO LUÍS - CENTRO</h1><div class="student-row"><div class="student-item"><span class="label">ESTUDANTE:</span><span class="underline"></span></div></div><div class="student-row"><div class="student-item"><span class="label">CURSO:</span><span class="underline"></span></div><div class="student-item"><span class="label">TURMA:</span><span class="underline"></span></div></div></div><div class="campos-box"><div class="campo-item"><span class="campo-label">Nota:</span><span class="campo-underline"></span></div><div class="campo-item"><span class="campo-label">Ass.:</span><span class="campo-underline"></span></div><div class="campo-item"><span class="campo-label">Data:</span><span class="campo-underline"></span></div></div><div class="instrucoes-box"><h4>📋 INSTRUÇÕES GERAIS</h4><ul><li>Escreva seu nome de registro legível e não esqueça de assinar a lista de frequência.</li><li>Todas as anotações e cálculos devem ser feitos no caderno de prova.</li><li>Os celulares <strong>deverão ser desligados</strong> durante todo o período de realização da prova.</li><li>Cada questão contém apenas uma alternativa correta.</li><li>Leia e siga as instruções de preenchimento do cartão-resposta (GABARITO) abaixo.</li></ul></div>${adaptacoesTexto}<div class="print-prova-info"><h3>${provaTitulo}</h3><div class="info-linha"><span class="info-item">Período: ${periodo}</span><span class="info-item">Turma: ${turmaNome}</span><span class="info-item">Disciplina: ${disciplina}</span><span class="info-item">Professor: ${professorNome}</span><span class="info-item">Questões: ${totalQuestoes}</span></div></div>${gerarCartaoResposta()}<div class="questoes-container">${questoesHTML}</div><div class="print-footer"><p>EducaPleno - ${dataFormatada}</p><p>📱 Escaneie o QR Code para correção automática</p><p style="font-size: 6pt;">Aluno: ${alunoNome || '_________________'} | Turma: ${turmaNome} | Código: ${prova.codigo || 'N/A'}</p></div><div style="page-break-after: always;"></div></body></html>`;
    }

    async gerarHTMLImpressao(prova, questoes, qrCodeDataUrl, opcoesAdaptacao = {}, qrCodeAlunoUrl = null, alunoNome = null) {
        try {
            const printHTML = this.gerarHTMLProvaCompleta(prova, questoes, qrCodeDataUrl, opcoesAdaptacao, qrCodeAlunoUrl, alunoNome);
            const printWindow = window.open('', '_blank');
            printWindow.document.write(printHTML);
            printWindow.document.close();
            printWindow.onload = () => { printWindow.print(); printWindow.onafterprint = () => printWindow.close(); };
            this.showToast('✅ Impressão preparada!', 'success');
        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast(`❌ Erro: ${error.message}`, 'error');
        }
    }

    closeAllModals() {
        ['modal', 'confirmModal', 'modalPerguntaAdaptacao', 'modalOpcoesAdaptacao'].forEach(id => {
            const modal = document.getElementById(id);
            if (modal) modal.style.display = 'none';
        });
    }
        // ============================================================================
    // 🔥 2ª CHAMADA
    // ============================================================================
    
    async loadSegundaChamada() {
        const content = document.getElementById('content');
        
        if (!this.temPermissao2Chamada) {
            content.innerHTML = `
                <div class="alert alert-warning m-4">
                    <i class="fas fa-lock"></i>
                    <strong>Acesso Restrito</strong>
                    <p>Você não tem permissão para acessar este módulo.</p>
                </div>
            `;
            return;
        }
        
        content.innerHTML = `
            <div class="segunda-chamada-container">
                <div class="card mb-3">
                    <div class="card-body">
                        <div class="modo-selector">
                            <button class="modo-btn active" id="modoAutomaticoSegundaChamadaBtn">
                                <i class="fas fa-qrcode"></i> Automático (QR Code)
                            </button>
                            <button class="modo-btn" id="modoManualSegundaChamadaBtn">
                                <i class="fas fa-users"></i> Manual (Selecionar Aluno)
                            </button>
                        </div>
                    </div>
                </div>

                <ul class="nav nav-tabs mb-3" role="tablist">
                    <li class="nav-item">
                        <button class="nav-link active" id="segundaChamada-registrar-tab" data-bs-toggle="tab" data-bs-target="#segundaChamada-registrar" type="button">
                            <i class="fas fa-plus-circle"></i> Registrar
                        </button>
                    </li>
                    <li class="nav-item">
                        <button class="nav-link" id="segundaChamada-dashboard-tab" data-bs-toggle="tab" data-bs-target="#segundaChamada-dashboard" type="button">
                            <i class="fas fa-chart-line"></i> Dashboard
                        </button>
                    </li>
                    <li class="nav-item">
                        <button class="nav-link" id="segundaChamada-relatorios-tab" data-bs-toggle="tab" data-bs-target="#segundaChamada-relatorios" type="button">
                            <i class="fas fa-file-alt"></i> Relatórios
                        </button>
                    </li>
                </ul>

                <div class="tab-content">
                    <div class="tab-pane fade show active" id="segundaChamada-registrar">
                        <div id="modoAutomaticoSegundaChamada">
                            <div class="card">
                                <div class="card-body">
                                    <h5 class="card-title"><i class="fas fa-qrcode me-2"></i> Escanear QR Code do Aluno</h5>
                                    <div id="qr-reader-segunda-chamada" class="qr-scanner-container"></div>
                                    <div class="text-center mt-2">
                                        <small class="text-muted">Aponte a câmera para o QR Code do aluno</small>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div id="modoManualSegundaChamada" style="display: none;">
                            <div class="card">
                                <div class="card-body">
                                    <h5 class="card-title"><i class="fas fa-users me-2"></i> Selecionar Aluno por Turma</h5>
                                    <p class="text-muted mb-3"><i class="fas fa-info-circle"></i> Selecione uma turma e clique no aluno.</p>
                                    <div class="row g-3 mb-3">
                                        <div class="col-md-6">
                                            <label class="form-label">Turma</label>
                                            <select id="filtroTurmaManualSegundaChamada" class="form-select">
                                                <option value="">Selecione uma turma...</option>
                                            </select>
                                        </div>
                                        <div class="col-md-6">
                                            <label class="form-label">Buscar Aluno</label>
                                            <input type="text" id="filtroBuscaManualSegundaChamada" class="form-control" placeholder="Digite o nome do aluno...">
                                        </div>
                                    </div>
                                    <div id="listaAlunosManualSegundaChamada" class="mt-3">
                                        <div class="text-center py-3">
                                            <div class="loading-spinner"></div>
                                            <p>Selecione uma turma para ver os alunos</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div id="alunoInfoSegundaChamada" style="display: none;">
                            <div class="aluno-card">
                                <div class="d-flex flex-wrap align-items-center">
                                    <img id="alunoFotoSegundaChamada" class="aluno-foto" src="" alt="Foto">
                                    <div class="info-aluno">
                                        <h3 id="alunoNomeSegundaChamada" class="mb-1">-</h3>
                                        <p class="mb-1 text-muted"><i class="fas fa-id-card me-1"></i> Matrícula: <span id="alunoMatriculaSegundaChamada">-</span></p>
                                        <p class="mb-1 text-muted"><i class="fas fa-graduation-cap me-1"></i> Turma: <span id="alunoTurmaSegundaChamada">-</span></p>
                                        <p class="mb-0 text-muted"><i class="fas fa-book me-1"></i> Curso: <span id="alunoCursoSegundaChamada">-</span></p>
                                    </div>
                                </div>
                                <div id="historicoSegundaChamadaAluno" class="mt-3"></div>
                            </div>
                        </div>

                        <div id="formSegundaChamada" class="form-container" style="display: none;">
                            <h5><i class="fas fa-redo"></i> Registrar 2ª Chamada</h5>

                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label class="form-label">Data da 2ª Chamada <span class="text-danger">*</span></label>
                                    <input type="date" id="segundaChamadaData" class="form-control" required>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label class="form-label">Horário (opcional)</label>
                                    <input type="time" id="segundaChamadaHorario" class="form-control">
                                </div>
                            </div>

                            <div class="mb-3">
                                <label class="form-label">Motivo da 2ª Chamada <span class="text-danger">*</span></label>
                                <div class="tipos-tarefa-grid">
                                    <div class="tipo-card" data-tipo="problemas_pessoais" onclick="setorPedagogico.selecionarMotivoSegundaChamada('problemas_pessoais')">
                                        <i class="fas fa-user"></i><span>Problemas Pessoais</span>
                                    </div>
                                    <div class="tipo-card" data-tipo="problemas_saude" onclick="setorPedagogico.selecionarMotivoSegundaChamada('problemas_saude')">
                                        <i class="fas fa-heartbeat"></i><span>Problemas de Saúde</span>
                                    </div>
                                    <div class="tipo-card" data-tipo="viagem" onclick="setorPedagogico.selecionarMotivoSegundaChamada('viagem')">
                                        <i class="fas fa-plane"></i><span>Viagem</span>
                                    </div>
                                    <div class="tipo-card" data-tipo="outros" onclick="setorPedagogico.selecionarMotivoSegundaChamada('outros')">
                                        <i class="fas fa-ellipsis-h"></i><span>Outros</span>
                                    </div>
                                </div>
                                <input type="hidden" id="segundaChamadaMotivoSelecionado">
                            </div>

                            <div id="campoSegundaChamadaOutros" style="display: none;">
                                <div class="mb-3">
                                    <label class="form-label">Especifique o Motivo <span class="text-danger">*</span></label>
                                    <input type="text" id="segundaChamadaMotivoOutros" class="form-control" placeholder="Descreva o motivo...">
                                </div>
                            </div>

                            <div class="card mb-3" style="background: #f8fafc; border: 1px solid #e2e8f0;">
                                <div class="card-body">
                                    <h6 style="margin-bottom: 15px; color: #1e3c72;">
                                        <i class="fas fa-user-shield"></i> Dados do Responsável
                                    </h6>
                                    <div class="row">
                                        <div class="col-md-6 mb-3">
                                            <label class="form-label">Nome do Responsável</label>
                                            <input type="text" id="segundaChamadaResponsavelNome" class="form-control" placeholder="Nome completo do responsável">
                                        </div>
                                        <div class="col-md-3 mb-3">
                                            <label class="form-label">CPF</label>
                                            <input type="text" id="segundaChamadaResponsavelCPF" class="form-control" placeholder="000.000.000-00" maxlength="14" oninput="setorPedagogico.formatarCPF(this)">
                                        </div>
                                        <div class="col-md-3 mb-3">
                                            <label class="form-label">Telefone</label>
                                            <input type="text" id="segundaChamadaResponsavelTelefone" class="form-control" placeholder="(00) 00000-0000" maxlength="15" oninput="setorPedagogico.formatarTelefone(this)">
                                        </div>
                                    </div>

                                    <div class="assinatura-wrapper">
                                        <label class="form-label">
                                            <i class="fas fa-signature"></i> Assinatura do Responsável
                                            <small class="text-muted">(assine com o dedo ou mouse)</small>
                                        </label>
                                        <div class="assinatura-container">
                                            <canvas id="segundaChamadaAssinaturaCanvas" class="assinatura-canvas"></canvas>
                                            <div class="assinatura-placeholder" id="segundaChamadaAssinaturaPlaceholder">
                                                <i class="fas fa-pen-fancy"></i>
                                                <span>Assine aqui</span>
                                            </div>
                                        </div>
                                        <div class="assinatura-actions">
                                            <button type="button" class="btn btn-sm btn-outline-danger" onclick="setorPedagogico.limparAssinatura('segundaChamada')">
                                                <i class="fas fa-eraser"></i> Limpar
                                            </button>
                                        </div>
                                        <input type="hidden" id="segundaChamadaAssinaturaBase64" value="">
                                    </div>
                                </div>
                            </div>

                            <div class="mb-3">
                                <label class="form-label">Observações</label>
                                <textarea id="segundaChamadaObservacoes" class="form-control" rows="3" placeholder="Informações complementares..."></textarea>
                            </div>

                            <div class="aviso-integracao">
                                <i class="fas fa-info-circle"></i>
                                <div>
                                    <strong>Justificativa automática</strong>
                                    Toda 2ª Chamada gera automaticamente uma <strong>Justificativa de Falta</strong> para o aluno.
                                </div>
                            </div>

                            <div class="d-flex gap-2">
                                <button class="btn-primary-custom" onclick="setorPedagogico.registrarSegundaChamada()">
                                    <i class="fas fa-check-circle me-2"></i> Registrar 2ª Chamada
                                </button>
                                <button class="btn-secondary-custom" onclick="setorPedagogico.limparTelaSegundaChamada()">
                                    <i class="fas fa-times me-2"></i> Cancelar
                                </button>
                            </div>
                        </div>
                    </div>

                    <div class="tab-pane fade" id="segundaChamada-dashboard">
                        <div class="row mb-4">
                            <div class="col-md-3 mb-3">
                                <div class="metric-card">
                                    <i class="fas fa-calendar-day fa-2x text-primary mb-2"></i>
                                    <div class="metric-value" id="SegundaChamadaTotalHoje">0</div>
                                    <div class="metric-label">Hoje</div>
                                </div>
                            </div>
                            <div class="col-md-3 mb-3">
                                <div class="metric-card">
                                    <i class="fas fa-calendar-week fa-2x text-success mb-2"></i>
                                    <div class="metric-value" id="SegundaChamadaTotalSemana">0</div>
                                    <div class="metric-label">Esta Semana</div>
                                </div>
                            </div>
                            <div class="col-md-3 mb-3">
                                <div class="metric-card">
                                    <i class="fas fa-calendar-alt fa-2x text-info mb-2"></i>
                                    <div class="metric-value" id="SegundaChamadaTotalMes">0</div>
                                    <div class="metric-label">Este Mês</div>
                                </div>
                            </div>
                            <div class="col-md-3 mb-3">
                                <div class="metric-card">
                                    <i class="fas fa-chart-line fa-2x text-warning mb-2"></i>
                                    <div class="metric-value" id="SegundaChamadaTotalGeral">0</div>
                                    <div class="metric-label">Total Geral</div>
                                </div>
                            </div>
                        </div>
                        <div class="row">
                            <div class="col-md-6 mb-4">
                                <div class="card h-100">
                                    <div class="card-body">
                                        <h6 class="card-title"><i class="fas fa-chart-pie"></i> Por Motivo</h6>
                                        <canvas id="SegundaChamadaChartMotivos"></canvas>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-6 mb-4">
                                <div class="card h-100">
                                    <div class="card-body">
                                        <h6 class="card-title"><i class="fas fa-chart-bar"></i> Registros por Dia</h6>
                                        <canvas id="SegundaChamadaChartAtrasos"></canvas>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-6 mb-4">
                                <div class="card h-100">
                                    <div class="card-body">
                                        <h6 class="card-title"><i class="fas fa-users"></i> Por Turma</h6>
                                        <canvas id="SegundaChamadaChartTurmas"></canvas>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-6 mb-4">
                                <div class="card h-100">
                                    <div class="card-body">
                                        <h6 class="card-title">
                                            <i class="fas fa-exclamation-triangle text-warning"></i> 
                                            Alunos Reincidentes (3+ registros)
                                        </h6>
                                        <div id="SegundaChamadaAlunosReincidentes" class="mt-3">
                                            <div class="text-center py-3">Carregando...</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="tab-pane fade" id="segundaChamada-relatorios">
                        <div class="relatorio-filtros">
                            <div class="row g-3">
                                <div class="col-md-4">
                                    <label class="form-label">Tipo de Relatório</label>
                                    <select id="SegundaChamadaTipoRelatorio" class="form-select">
                                        <option value="geral">Geral</option>
                                        <option value="turma">Por Turma</option>
                                        <option value="aluno">Por Aluno</option>
                                    </select>
                                </div>
                                <div class="col-md-4" id="SegundaChamadaFiltroTurmaDiv" style="display: none;">
                                    <label class="form-label">Turma</label>
                                    <select id="SegundaChamadaFiltroTurma" class="form-select">
                                        <option value="">Selecione...</option>
                                    </select>
                                </div>
                                <div class="col-md-4" id="SegundaChamadaFiltroAlunoDiv" style="display: none;">
                                    <label class="form-label">Aluno</label>
                                    <div class="autocomplete-aluno-wrapper">
                                        <input type="text" id="SegundaChamadaBuscaAlunoRelatorio" class="form-control" 
                                               placeholder="Digite o nome do aluno..." autocomplete="off">
                                        <input type="hidden" id="SegundaChamadaFiltroAluno" value="">
                                        <div id="SegundaChamadaAutocompleteAlunoList" class="autocomplete-aluno-list" style="display: none;"></div>
                                    </div>
                                    <small class="text-muted mt-1 d-block" id="SegundaChamadaAlunoSelecionadoInfo"></small>
                                </div>
                                <div class="col-md-3">
                                    <label class="form-label">Data Início</label>
                                    <input type="date" id="SegundaChamadaDataInicio" class="form-control">
                                </div>
                                <div class="col-md-3">
                                    <label class="form-label">Data Fim</label>
                                    <input type="date" id="SegundaChamadaDataFim" class="form-control">
                                </div>
                                <div class="col-md-2">
                                    <label class="form-label">&nbsp;</label>
                                    <button class="btn btn-primary w-100" onclick="setorPedagogico.carregarRelatorioSegundaChamada()">
                                        <i class="fas fa-search"></i> Buscar
                                    </button>
                                </div>
                                <div class="col-md-2">
                                    <label class="form-label">&nbsp;</label>
                                    <button class="btn btn-success w-100" onclick="setorPedagogico.exportarCSVSegundaChamada()">
                                        <i class="fas fa-file-csv"></i> CSV
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div id="SegundaChamadaResultadoRelatorio" class="mt-4">
                            <div class="text-center py-5">
                                <i class="fas fa-chart-line fa-3x text-muted mb-3"></i>
                                <p class="text-muted">Selecione os filtros e clique em Buscar</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="card mt-4">
                    <div class="card-header d-flex justify-content-between align-items-center">
                        <h5 class="mb-0"><i class="fas fa-history"></i> 2ªs Chamadas Registradas</h5>
                        <button class="btn btn-sm btn-outline-light" onclick="setorPedagogico.carregarListaSegundaChamada()">
                            <i class="fas fa-sync-alt"></i> Atualizar
                        </button>
                    </div>
                    <div class="card-body">
                        <div class="row g-2 mb-3">
                            <div class="col-md-3">
                                <input type="text" id="filtroListaSegundaChamadaAluno" class="form-control form-control-sm" placeholder="Buscar por aluno...">
                            </div>
                            <div class="col-md-2">
                                <select id="filtroListaSegundaChamadaTurma" class="form-select form-select-sm">
                                    <option value="">Todas as turmas</option>
                                </select>
                            </div>
                            <div class="col-md-2">
                                <select id="filtroListaSegundaChamadaMotivo" class="form-select form-select-sm">
                                    <option value="">Todos os motivos</option>
                                </select>
                            </div>
                            <div class="col-md-2">
                                <input type="date" id="filtroListaSegundaChamadaDataInicio" class="form-control form-control-sm">
                            </div>
                            <div class="col-md-2">
                                <input type="date" id="filtroListaSegundaChamadaDataFim" class="form-control form-control-sm">
                            </div>
                            <div class="col-md-1">
                                <button class="btn btn-primary btn-sm w-100" onclick="setorPedagogico.carregarListaSegundaChamada()">
                                    <i class="fas fa-filter"></i>
                                </button>
                            </div>
                        </div>
                        <div id="listaSegundaChamada">
                            <div class="text-center py-3">
                                <div class="loading-spinner"></div>
                                <p>Carregando registros...</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        setTimeout(async () => {
            const dataEl = document.getElementById('segundaChamadaData');
            if (dataEl) dataEl.value = new Date().toISOString().split('T')[0];
            
            this.estadoSegundaChamada = {
                currentAluno: null, motivoSelecionado: null,
                modoAtual: 'automatico', alunosPorTurma: [],
                scanner: null, scannerAtivo: false
            };
            
            this.configurarEventosSegundaChamada();
            await this.carregarTurmasSegundaChamada();
            
            setTimeout(() => this.inicializarAssinaturaSegundaChamada(), 300);
            setTimeout(() => {
                if (this.estadoSegundaChamada.modoAtual === 'automatico') {
                    this.iniciarScannerSegundaChamada();
                }
            }, 500);
            
            await this.carregarListaSegundaChamada();
            
            const dashTab = document.getElementById('segundaChamada-dashboard-tab');
            if (dashTab) {
                dashTab.addEventListener('shown.bs.tab', () => {
                    this.carregarDashboardSegundaChamada();
                });
            }
            
            const relTab = document.getElementById('segundaChamada-relatorios-tab');
            if (relTab) {
                relTab.addEventListener('shown.bs.tab', () => {
                    this.carregarTurmasFiltroSegundaChamada();
                    this.configurarEventosRelatorioSegundaChamada();
                });
            }
        }, 100);
    }
    
    configurarEventosSegundaChamada() {
        document.getElementById('modoAutomaticoSegundaChamadaBtn').onclick = () => this.setModoSegundaChamada('automatico');
        document.getElementById('modoManualSegundaChamadaBtn').onclick = () => this.setModoSegundaChamada('manual');
        document.getElementById('filtroTurmaManualSegundaChamada').onchange = () => this.carregarAlunosTurmaSegundaChamada();
        document.getElementById('filtroBuscaManualSegundaChamada').oninput = () => this.filtrarAlunosManualSegundaChamada();
        
        const filtroAluno = document.getElementById('filtroListaSegundaChamadaAluno');
        if (filtroAluno) {
            let timeout;
            filtroAluno.oninput = () => {
                clearTimeout(timeout);
                timeout = setTimeout(() => this.carregarListaSegundaChamada(), 500);
            };
        }
        
        ['filtroListaSegundaChamadaTurma', 'filtroListaSegundaChamadaMotivo', 
         'filtroListaSegundaChamadaDataInicio', 'filtroListaSegundaChamadaDataFim'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.onchange = () => this.carregarListaSegundaChamada();
        });
        
        const selectMotivo = document.getElementById('filtroListaSegundaChamadaMotivo');
        if (selectMotivo && selectMotivo.options.length <= 1) {
            const motivos = [
                { valor: 'problemas_pessoais', label: 'Problemas Pessoais' },
                { valor: 'problemas_saude', label: 'Problemas de Saúde' },
                { valor: 'viagem', label: 'Viagem' },
                { valor: 'outros', label: 'Outros' }
            ];
            motivos.forEach(m => {
                selectMotivo.innerHTML += `<option value="${m.valor}">${m.label}</option>`;
            });
        }
    }
    
    configurarEventosRelatorioSegundaChamada() {
        const selectTipo = document.getElementById('SegundaChamadaTipoRelatorio');
        if (selectTipo && !selectTipo.dataset.listenerAttached) {
            selectTipo.dataset.listenerAttached = 'true';
            selectTipo.onchange = () => this.toggleRelatorioFiltrosSegundaChamada();
        }
        this.inicializarAutocompleteSegundaChamada();
    }
    
    async setModoSegundaChamada(modo) {
        const est = this.estadoSegundaChamada;
        est.modoAtual = modo;
        
        const infoEl = document.getElementById('alunoInfoSegundaChamada');
        const formEl = document.getElementById('formSegundaChamada');
        if (infoEl) infoEl.style.display = 'none';
        if (formEl) formEl.style.display = 'none';
        est.currentAluno = null;
        
        if (modo === 'automatico') {
            document.getElementById('modoAutomaticoSegundaChamadaBtn')?.classList.add('active');
            document.getElementById('modoManualSegundaChamadaBtn')?.classList.remove('active');
            document.getElementById('modoAutomaticoSegundaChamada').style.display = 'block';
            document.getElementById('modoManualSegundaChamada').style.display = 'none';
            await this.iniciarScannerSegundaChamada();
        } else {
            document.getElementById('modoManualSegundaChamadaBtn')?.classList.add('active');
            document.getElementById('modoAutomaticoSegundaChamadaBtn')?.classList.remove('active');
            document.getElementById('modoAutomaticoSegundaChamada').style.display = 'none';
            document.getElementById('modoManualSegundaChamada').style.display = 'block';
            await this.pararScannerSegundaChamada();
            const turma = document.getElementById('filtroTurmaManualSegundaChamada')?.value;
            if (turma) await this.carregarAlunosTurmaSegundaChamada();
        }
    }
    
    async iniciarScannerSegundaChamada() {
        const est = this.estadoSegundaChamada;
        const container = document.getElementById('qr-reader-segunda-chamada');
        if (!container) return;
        if (est.scannerAtivo) return;
        
        container.innerHTML = '<div id="qr-reader-segunda-chamada-new" style="width: 100%;"></div>';
        
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            container.innerHTML = `
                <div class="alert alert-warning m-3" style="border-radius: 12px;">
                    <i class="fas fa-video-slash" style="font-size: 32px; display: block; margin-bottom: 10px;"></i>
                    <strong>Câmera não disponível</strong><br>
                    Use o <strong>Modo Manual</strong>.
                    <button class="btn btn-sm btn-primary mt-3" onclick="setorPedagogico.setModoSegundaChamada('manual')" style="border-radius: 30px;">
                        <i class="fas fa-users"></i> Modo Manual
                    </button>
                </div>`;
            return;
        }
        
        try {
            est.scanner = new Html5Qrcode("qr-reader-segunda-chamada-new");
            const config = { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 };
            await est.scanner.start({ facingMode: "environment" }, config,
                (text) => this.onScanSuccessSegundaChamada(text), () => {});
            est.scannerAtivo = true;
        } catch (err) {
            console.error('❌ Erro scanner 2ª Chamada:', err);
            let msg = 'Não foi possível acessar a câmera.';
            if (err.message?.includes('NotFoundError')) msg = 'Nenhuma câmera encontrada.';
            else if (err.message?.includes('NotAllowedError')) msg = 'Permissão negada.';
            
            container.innerHTML = `
                <div class="alert alert-warning m-3" style="border-radius: 12px;">
                    <i class="fas fa-video-slash" style="font-size: 32px; display: block; margin-bottom: 10px;"></i>
                    <strong>Câmera indisponível</strong><br>
                    <span style="font-size: 13px;">${msg}</span>
                    <button class="btn btn-sm btn-primary mt-3" onclick="setorPedagogico.setModoSegundaChamada('manual')" style="border-radius: 30px;">
                        <i class="fas fa-users"></i> Modo Manual
                    </button>
                </div>`;
            est.scannerAtivo = false;
            est.scanner = null;
        }
    }
    
    async pararScannerSegundaChamada() {
        const est = this.estadoSegundaChamada;
        if (est.scanner && est.scannerAtivo) {
            try { await est.scanner.stop(); } catch (e) {}
        }
        est.scannerAtivo = false;
        est.scanner = null;
    }
    
    async onScanSuccessSegundaChamada(text) {
        const id = this.extrairAlunoId(text);
        if (!id) { alert('QR Code inválido'); return; }
        await this.pararScannerSegundaChamada();
        await this.buscarAlunoSegundaChamada(id);
    }
    
    extrairAlunoId(decodedText) {
        if (!decodedText || typeof decodedText !== 'string') return null;
        if (decodedText.match(/^[a-f0-9]{24}$/i)) return decodedText;
        const matchAluno = decodedText.match(/[?&]aluno=([a-f0-9]{24})/i);
        if (matchAluno) return matchAluno[1];
        const matchId = decodedText.match(/[?&]id=([a-f0-9]{24})/i);
        if (matchId) return matchId[1];
        return null;
    }
    
    async carregarTurmasSegundaChamada() {
        try {
            const r = await fetch('/api/gestao-geral/autorizacao/turmas', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const d = await r.json();
            if (d.success) {
                const s = document.getElementById('filtroTurmaManualSegundaChamada');
                if (s) {
                    s.innerHTML = '<option value="">Selecione uma turma...</option>';
                    d.turmas.forEach(t => {
                        s.innerHTML += `<option value="${this.escapeHtml(t)}">${this.escapeHtml(t)}</option>`;
                    });
                }
            }
        } catch (e) { console.error(e); }
    }
    
    async carregarAlunosTurmaSegundaChamada() {
        const est = this.estadoSegundaChamada;
        const turma = document.getElementById('filtroTurmaManualSegundaChamada')?.value;
        const lista = document.getElementById('listaAlunosManualSegundaChamada');
        
        if (!turma) {
            if (lista) lista.innerHTML = '<div class="text-center py-3">Selecione uma turma</div>';
            return;
        }
        if (lista) lista.innerHTML = '<div class="text-center py-3"><div class="loading-spinner"></div><p>Carregando...</p></div>';
        
        try {
            const r = await fetch(`/api/gestao-geral/autorizacao/alunos-por-turma?turma=${encodeURIComponent(turma)}`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const d = await r.json();
            if (d.success) {
                est.alunosPorTurma = d.alunos;
                this.filtrarAlunosManualSegundaChamada();
            }
        } catch (e) { console.error(e); }
    }
    
    filtrarAlunosManualSegundaChamada() {
        const est = this.estadoSegundaChamada;
        const busca = (document.getElementById('filtroBuscaManualSegundaChamada')?.value || '').toLowerCase();
        let filtrados = est.alunosPorTurma;
        if (busca) filtrados = filtrados.filter(a => (a.nome || '').toLowerCase().includes(busca));
        filtrados.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
        
        const c = document.getElementById('listaAlunosManualSegundaChamada');
        if (!c) return;
        if (filtrados.length === 0) {
            c.innerHTML = '<div class="text-center text-muted py-3">Nenhum aluno encontrado</div>';
            return;
        }
        c.innerHTML = '<div class="list-group">' + filtrados.map(a => `
            <div class="list-group-item list-group-item-action d-flex justify-content-between align-items-center" 
                 data-aluno-id="${a.id}" data-aluno-nome="${this.escapeHtml(a.nome)}" style="cursor:pointer;">
                <div>
                    <strong>${this.escapeHtml(a.nome)}</strong><br>
                    <small class="text-muted">${this.escapeHtml(a.matricula || 'Sem matrícula')} • ${this.escapeHtml(a.curso || '')}</small>
                </div>
                <i class="fas fa-hand-pointer fa-2x text-primary"></i>
            </div>
        `).join('') + '</div>';
        
        c.querySelectorAll('.list-group-item').forEach(item => {
            item.addEventListener('click', () => {
                this.selecionarAlunoSegundaChamada(item.dataset.alunoId, item.dataset.alunoNome, item);
            });
        });
    }
    
    async selecionarAlunoSegundaChamada(alunoId, alunoNome, itemEl) {
        if (itemEl) {
            itemEl.style.background = '#dbeafe';
            itemEl.style.borderColor = '#1e3c72';
            itemEl.style.pointerEvents = 'none';
            itemEl.innerHTML = `
                <div><strong>${this.escapeHtml(alunoNome)}</strong><br><small style="color: #1e3c72;">Processando...</small></div>
                <i class="fas fa-spinner fa-spin fa-2x" style="color: #1e3c72;"></i>`;
        }
        try { await this.buscarAlunoSegundaChamada(alunoId); } catch (e) { console.error(e); }
    }
    
    async buscarAlunoSegundaChamada(alunoId) {
        const est = this.estadoSegundaChamada;
        try {
            await this.pararScannerSegundaChamada();
            const r = await fetch(`/api/gestao-geral/autorizacao/aluno/${alunoId}`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const d = await r.json();
            
            if (d.success && d.aluno) {
                est.currentAluno = d.aluno;
                this.exibirAlunoSegundaChamada(d);
                this.mostrarFormSegundaChamada();
            } else {
                alert(d.error || 'Aluno não encontrado');
                if (est.modoAtual === 'automatico') this.reiniciarScannerSegundaChamada();
                else this.carregarAlunosTurmaSegundaChamada();
            }
        } catch (e) {
            console.error(e);
            alert('Erro ao buscar aluno');
        }
    }
    
    exibirAlunoSegundaChamada(data) {
        const aluno = data.aluno;
        
        const foto = document.getElementById('alunoFotoSegundaChamada');
        if (foto) {
            foto.onerror = null;
            foto.src = aluno.fotoPerfil || this.gerarAvatarSVG(aluno.nome);
            foto.onerror = function() { this.onerror = null; this.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4MCIgaGVpZ2h0PSI4MCIgdmlld0JveD0iMCAwIDgwIDgwIj48Y2lyY2xlIGN4PSI0MCIgY3k9IjQwIiByPSI0MCIgZmlsbD0iIzFlM2M3MiIvPjx0ZXh0IHg9IjQwIiB5PSI0MCIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjM2IiBmb250LXdlaWdodD0iYm9sZCIgZmlsbD0id2hpdGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGRvbWluYW50LWJhc2VsaW5lPSJjZW50cmFsIj7wn5GlPC90ZXh0Pjwvc3ZnPg=='; };
        }
        
        this.safeSetText('alunoNomeSegundaChamada', aluno.nome || '-');
        this.safeSetText('alunoMatriculaSegundaChamada', aluno.matricula || 'Não informada');
        this.safeSetText('alunoTurmaSegundaChamada', aluno.turma || 'Não informada');
        this.safeSetText('alunoCursoSegundaChamada', aluno.curso || 'Não informado');
        
        const hist = document.getElementById('historicoSegundaChamadaAluno');
        if (hist) {
            if (data.ultimasAutorizacoes?.length > 0) {
                hist.innerHTML = `
                    <h6 class="text-muted mt-3 mb-2"><i class="fas fa-history"></i> Últimos Registros</h6>
                    ${data.ultimasAutorizacoes.map(h => `
                        <div class="p-2 mb-2" style="background: #f8fafc; border-radius: 8px; font-size: 13px;">
                            <strong>${this.escapeHtml(h.motivoLabel)}</strong>
                            <br><small class="text-muted">${new Date(h.data).toLocaleDateString('pt-BR')}</small>
                        </div>`).join('')}`;
            } else { hist.innerHTML = ''; }
        }
        
        const infoEl = document.getElementById('alunoInfoSegundaChamada');
        if (infoEl) {
            infoEl.style.display = 'block';
            infoEl.scrollIntoView({ behavior: 'smooth' });
        }
    }
    
    mostrarFormSegundaChamada() {
        const formEl = document.getElementById('formSegundaChamada');
        if (formEl) formEl.style.display = 'block';
        
        document.getElementById('segundaChamadaMotivoSelecionado').value = '';
        this.estadoSegundaChamada.motivoSelecionado = null;
        document.querySelectorAll('#formSegundaChamada .tipo-card').forEach(c => c.classList.remove('selected'));
        
        ['segundaChamadaData', 'segundaChamadaHorario', 'segundaChamadaMotivoOutros',
         'segundaChamadaResponsavelNome', 'segundaChamadaResponsavelCPF',
         'segundaChamadaResponsavelTelefone', 'segundaChamadaObservacoes'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        
        const campoOutros = document.getElementById('campoSegundaChamadaOutros');
        if (campoOutros) campoOutros.style.display = 'none';
        
        const dataEl = document.getElementById('segundaChamadaData');
        if (dataEl) dataEl.value = new Date().toISOString().split('T')[0];
        
        this.limparAssinatura('segundaChamada');
        setTimeout(() => this.inicializarAssinaturaSegundaChamada(), 200);
    }
    
    selecionarMotivoSegundaChamada(motivo) {
        this.estadoSegundaChamada.motivoSelecionado = motivo;
        const el = document.getElementById('segundaChamadaMotivoSelecionado');
        if (el) el.value = motivo;
        
        document.querySelectorAll('#formSegundaChamada .tipo-card').forEach(c => c.classList.remove('selected'));
        const card = document.querySelector(`#formSegundaChamada .tipo-card[data-tipo="${motivo}"]`);
        if (card) card.classList.add('selected');
        
        const campoOutros = document.getElementById('campoSegundaChamadaOutros');
        if (campoOutros) campoOutros.style.display = motivo === 'outros' ? 'block' : 'none';
    }
    
    inicializarAssinaturaSegundaChamada() {
        const canvas = document.getElementById('segundaChamadaAssinaturaCanvas');
        if (!canvas) return;
        if (canvas.dataset.assinaturaInit === 'true') return;
        canvas.dataset.assinaturaInit = 'true';

        const state = this.assinaturaSegundaChamada;
        const container = canvas.parentElement;
        const placeholder = document.getElementById('segundaChamadaAssinaturaPlaceholder');

        const ajustarCanvas = () => {
            const rect = canvas.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) {
                setTimeout(ajustarCanvas, 300);
                return;
            }
            const dpr = window.devicePixelRatio || 1;
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            canvas.style.width = rect.width + 'px';
            canvas.style.height = rect.height + 'px';
            const ctx = canvas.getContext('2d');
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.scale(dpr, dpr);
            ctx.lineWidth = 2.5;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.strokeStyle = '#1e3c72';
            state.ctx = ctx;
        };
        ajustarCanvas();
        state.canvas = canvas;

        const getPos = (e) => {
            const rect = canvas.getBoundingClientRect();
            let clientX, clientY;
            if (e.touches && e.touches.length > 0) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else if (e.changedTouches && e.changedTouches.length > 0) {
                clientX = e.changedTouches[0].clientX;
                clientY = e.changedTouches[0].clientY;
            } else {
                clientX = e.clientX;
                clientY = e.clientY;
            }
            return { x: clientX - rect.left, y: clientY - rect.top };
        };

        const iniciar = (e) => {
            e.preventDefault();
            state.desenhando = true;
            const pos = getPos(e);
            state.lastX = pos.x;
            state.lastY = pos.y;
            state.temAssinatura = true;
            if (container) container.classList.add('ativa');
            if (placeholder) placeholder.classList.add('escondido');
        };

        const desenhar = (e) => {
            if (!state.desenhando) return;
            e.preventDefault();
            const pos = getPos(e);
            state.ctx.beginPath();
            state.ctx.moveTo(state.lastX, state.lastY);
            state.ctx.lineTo(pos.x, pos.y);
            state.ctx.stroke();
            state.lastX = pos.x;
            state.lastY = pos.y;
        };

        const parar = (e) => {
            if (e && e.preventDefault) e.preventDefault();
            state.desenhando = false;
            if (container) container.classList.remove('ativa');
            this.salvarAssinaturaBase64('segundaChamada');
        };

        canvas.addEventListener('touchstart', iniciar, { passive: false });
        canvas.addEventListener('touchmove', desenhar, { passive: false });
        canvas.addEventListener('touchend', parar, { passive: false });
        canvas.addEventListener('touchcancel', parar, { passive: false });
        canvas.addEventListener('mousedown', iniciar);
        canvas.addEventListener('mousemove', desenhar);
        canvas.addEventListener('mouseup', parar);
        canvas.addEventListener('mouseleave', () => {
            if (state.desenhando) parar();
        });
    }

    limparAssinatura(modulo) {
        const state = this.assinaturaSegundaChamada;
        if (!state || !state.canvas || !state.ctx) return;
        const rect = state.canvas.getBoundingClientRect();
        state.ctx.clearRect(0, 0, rect.width, rect.height);
        state.temAssinatura = false;
        const placeholder = document.getElementById('segundaChamadaAssinaturaPlaceholder');
        if (placeholder) placeholder.classList.remove('escondido');
        const hidden = document.getElementById('segundaChamadaAssinaturaBase64');
        if (hidden) hidden.value = '';
    }

    salvarAssinaturaBase64(modulo) {
        const state = this.assinaturaSegundaChamada;
        if (!state.canvas || !state.temAssinatura) return;
        try {
            const dataURL = state.canvas.toDataURL('image/png');
            const hidden = document.getElementById('segundaChamadaAssinaturaBase64');
            if (hidden) hidden.value = dataURL;
        } catch (e) {
            console.warn('Erro ao salvar assinatura:', e);
        }
    }

    obterAssinaturaBase64() {
        const state = this.assinaturaSegundaChamada;
        if (!state || !state.temAssinatura) return '';
        try {
            return state.canvas.toDataURL('image/png');
        } catch (e) {
            return '';
        }
    }
    
    formatarCPF(input) {
        let v = input.value.replace(/\D/g, '').slice(0, 11);
        if (v.length > 9) v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
        else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
        else if (v.length > 3) v = v.replace(/(\d{3})(\d{1,3})/, '$1.$2');
        input.value = v;
    }
    
    formatarTelefone(input) {
        let v = input.value.replace(/\D/g, '').slice(0, 11);
        if (v.length > 10) v = v.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
        else if (v.length > 6) v = v.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
        else if (v.length > 2) v = v.replace(/(\d{2})(\d{0,5})/, '($1) $2');
        input.value = v;
    }
    
    async registrarSegundaChamada() {
        const est = this.estadoSegundaChamada;
        
        if (!est.motivoSelecionado) { 
            this.showToast('Selecione o motivo', 'error'); 
            return; 
        }
        
        const data = document.getElementById('segundaChamadaData')?.value;
        if (!data) { 
            this.showToast('Preencha a data', 'error'); 
            return; 
        }
        
        if (est.motivoSelecionado === 'outros') {
            const motivoOutros = document.getElementById('segundaChamadaMotivoOutros')?.value.trim();
            if (!motivoOutros) { 
                this.showToast('Especifique o motivo', 'error'); 
                return; 
            }
        }
        
        if (!est.currentAluno) { 
            this.showToast('Nenhum aluno selecionado', 'error'); 
            return; 
        }
        
        const assinaturaBase64 = this.obterAssinaturaBase64();
        if (!assinaturaBase64) {
            const confirmar = await confirm('⚠️ Nenhuma assinatura foi capturada. Deseja continuar mesmo assim?');
            if (!confirmar) return;
        }
        
        const btn = document.querySelector('#formSegundaChamada .btn-primary-custom');
        if (btn) btn.disabled = true;
        
        try {
            const body = {
                tipo: 'segunda_chamada',
                alunoId: est.currentAluno.id,
                data,
                horarioEntrada: document.getElementById('segundaChamadaHorario')?.value || '08:00',
                horarioSaida: document.getElementById('segundaChamadaHorario')?.value || '08:00',
                responsavelNome: document.getElementById('segundaChamadaResponsavelNome')?.value || '',
                responsavelCPF: document.getElementById('segundaChamadaResponsavelCPF')?.value || '',
                responsavelTelefone: document.getElementById('segundaChamadaResponsavelTelefone')?.value || '',
                motivo: est.motivoSelecionado,
                motivoOutros: document.getElementById('segundaChamadaMotivoOutros')?.value || '',
                observacoes: document.getElementById('segundaChamadaObservacoes')?.value || '',
                assinaturaBase64: assinaturaBase64
            };
            
            const r = await fetch('/api/gestao-geral/autorizacao/registrar', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json', 
                    'Authorization': `Bearer ${this.token}` 
                },
                body: JSON.stringify(body)
            });
            const d = await r.json();
            
            if (!d.success) {
                this.showToast('❌ ' + (d.error || 'Erro'), 'error');
                return;
            }
            
            console.log('✅ 2ª Chamada registrada:', d.autorizacao.id);
            
            const motivosMap = {
                'problemas_pessoais': 'problemas_pessoais',
                'problemas_saude': 'problemas_saude',
                'viagem': 'viagem',
                'outros': 'outros'
            };
            
            let justificativaCriada = false;
            try {
                const justBody = {
                    tipo: 'justificativa',
                    alunoId: est.currentAluno.id,
                    data,
                    motivo: motivosMap[est.motivoSelecionado] || 'outros',
                    motivoOutros: document.getElementById('segundaChamadaMotivoOutros')?.value || '',
                    responsavelNome: document.getElementById('segundaChamadaResponsavelNome')?.value || '',
                    responsavelCPF: document.getElementById('segundaChamadaResponsavelCPF')?.value || '',
                    responsavelTelefone: document.getElementById('segundaChamadaResponsavelTelefone')?.value || '',
                    observacoes: `Gerada automaticamente a partir de 2ª Chamada | ${document.getElementById('segundaChamadaObservacoes')?.value || ''}`.trim(),
                    origemTipo: 'segunda_chamada',
                    origemId: d.autorizacao.id,
                    assinaturaBase64: assinaturaBase64
                };
                
                const justR = await fetch('/api/gestao-geral/autorizacao/registrar', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json', 
                        'Authorization': `Bearer ${this.token}` 
                    },
                    body: JSON.stringify(justBody)
                });
                const justD = await justR.json();
                if (justD.success) {
                    justificativaCriada = true;
                }
            } catch (e) {
                console.warn('⚠️ Erro ao criar justificativa:', e);
            }
            
            let msg = `✅ ${d.message}`;
            if (justificativaCriada) msg += ' — Justificativa criada automaticamente!';
            this.showToast(msg, 'success');
            
            const imprimir = await confirm('Deseja IMPRIMIR agora?');
            if (imprimir) {
                this.imprimirSegundaChamada(d.autorizacao.id);
            }
            
            this.limparTelaSegundaChamada();
            await this.carregarListaSegundaChamada();
            
            if (est.modoAtual === 'automatico') this.reiniciarScannerSegundaChamada();
            
        } catch (e) {
            console.error(e);
            this.showToast('Erro ao registrar', 'error');
        } finally { 
            if (btn) btn.disabled = false; 
        }
    }
    
    limparTelaSegundaChamada() {
        const infoEl = document.getElementById('alunoInfoSegundaChamada');
        const formEl = document.getElementById('formSegundaChamada');
        if (infoEl) infoEl.style.display = 'none';
        if (formEl) formEl.style.display = 'none';
        this.estadoSegundaChamada.currentAluno = null;
        this.estadoSegundaChamada.motivoSelecionado = null;
        this.limparAssinatura('segundaChamada');
    }
    
    reiniciarScannerSegundaChamada() {
        setTimeout(() => {
            if (!this.estadoSegundaChamada.scannerAtivo && this.estadoSegundaChamada.modoAtual === 'automatico') {
                this.iniciarScannerSegundaChamada();
            }
        }, 1000);
    }
        async carregarListaSegundaChamada() {
        const container = document.getElementById('listaSegundaChamada');
        if (!container) return;
        
        const alunoNome = document.getElementById('filtroListaSegundaChamadaAluno')?.value || '';
        const turma = document.getElementById('filtroListaSegundaChamadaTurma')?.value || '';
        const motivo = document.getElementById('filtroListaSegundaChamadaMotivo')?.value || '';
        const dataInicio = document.getElementById('filtroListaSegundaChamadaDataInicio')?.value || '';
        const dataFim = document.getElementById('filtroListaSegundaChamadaDataFim')?.value || '';
        
        let url = `/api/gestao-geral/autorizacao/listar?tipo=segunda_chamada&limit=50`;
        if (alunoNome) url += `&alunoNome=${encodeURIComponent(alunoNome)}`;
        if (turma) url += `&turma=${encodeURIComponent(turma)}`;
        if (motivo) url += `&motivo=${encodeURIComponent(motivo)}`;
        if (dataInicio) url += `&dataInicio=${dataInicio}`;
        if (dataFim) url += `&dataFim=${dataFim}`;
        
        container.innerHTML = `<div class="text-center py-3"><div class="loading-spinner"></div><p>Carregando registros...</p></div>`;
        
        try {
            const selectTurma = document.getElementById('filtroListaSegundaChamadaTurma');
            if (selectTurma && selectTurma.options.length <= 1) {
                try {
                    const tr = await fetch('/api/gestao-geral/autorizacao/turmas', {
                        headers: { 'Authorization': `Bearer ${this.token}` }
                    });
                    const td = await tr.json();
                    if (td.success) {
                        td.turmas.forEach(t => {
                            selectTurma.innerHTML += `<option value="${this.escapeHtml(t)}">${this.escapeHtml(t)}</option>`;
                        });
                    }
                } catch (e) { console.warn(e); }
            }
            
            const r = await fetch(url, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const d = await r.json();
            
            if (!d.success || !d.autorizacoes || d.autorizacoes.length === 0) {
                container.innerHTML = `<p class="text-muted text-center py-3">
                    <i class="fas fa-inbox" style="font-size: 32px; color: #cbd5e1; display: block; margin-bottom: 10px;"></i>
                    Nenhum registro de 2ª chamada encontrado.
                </p>`;
                return;
            }
            
            container.innerHTML = `
                <div class="table-responsive">
                    <table class="table table-hover">
                        <thead>
                            <tr>
                                <th>Data</th><th>Aluno</th><th>Turma</th><th>Horário</th>
                                <th>Motivo</th><th>Responsável</th><th>Assinatura</th><th>Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${d.autorizacoes.map(a => `
                                <tr>
                                    <td>${a.dataFormatada}</td>
                                    <td><strong>${this.escapeHtml(a.alunoNome)}</strong></td>
                                    <td>${this.escapeHtml(a.alunoTurma)}</td>
                                    <td>${a.horarioEntrada || '-'}</td>
                                    <td><span class="badge bg-info text-dark">${this.escapeHtml(a.motivoLabel)}</span></td>
                                    <td>
                                        ${a.responsavelNome ? `
                                            <div style="font-size:12px;">
                                                <strong>${this.escapeHtml(a.responsavelNome)}</strong>
                                                ${a.responsavelCPF ? `<br><small>CPF: ${this.escapeHtml(a.responsavelCPF)}</small>` : ''}
                                                ${a.responsavelTelefone ? `<br><small>Tel: ${this.escapeHtml(a.responsavelTelefone)}</small>` : ''}
                                            </div>` : '-'}
                                    </td>
                                    <td>
                                        ${a.temAssinatura 
                                            ? '<span class="badge bg-success"><i class="fas fa-signature"></i> Assinado</span>' 
                                            : '<span class="badge bg-secondary">Sem</span>'}
                                    </td>
                                    <td>
                                        <button class="btn btn-sm btn-primary" onclick="setorPedagogico.imprimirSegundaChamada('${a.id}')" title="Imprimir">
                                            <i class="fas fa-print"></i>
                                        </button>
                                        <button class="btn btn-sm btn-warning" onclick="setorPedagogico.abrirEditarSegundaChamada('${a.id}')" title="Editar">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        <button class="btn btn-sm btn-danger" onclick="setorPedagogico.excluirSegundaChamada('${a.id}')" title="Excluir">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </td>
                                </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
                <p class="text-muted text-end mt-2"><small>${d.total} registro(s) encontrado(s)</small></p>`;
        } catch (e) {
            console.error('❌ Erro ao carregar 2ª Chamada:', e);
            container.innerHTML = `
                <div class="text-center py-3">
                    <p class="text-danger"><i class="fas fa-exclamation-triangle"></i> Erro ao carregar.</p>
                    <button class="btn btn-sm btn-outline-primary" onclick="setorPedagogico.carregarListaSegundaChamada()">
                        <i class="fas fa-sync-alt"></i> Tentar novamente
                    </button>
                </div>`;
        }
    }
    
    async carregarDashboardSegundaChamada() {
        console.log('📊 Carregando dashboard 2ª Chamada...');
        try {
            const r = await fetch('/api/gestao-geral/autorizacao/dashboard?tipo=segunda_chamada', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const data = await r.json();
            if (!data.success) {
                console.error('Erro no dashboard:', data.error);
                return;
            }
            
            this.safeSetText('SegundaChamadaTotalHoje', data.metricas?.hoje ?? 0);
            this.safeSetText('SegundaChamadaTotalSemana', data.metricas?.semana ?? 0);
            this.safeSetText('SegundaChamadaTotalMes', data.metricas?.mes ?? 0);
            this.safeSetText('SegundaChamadaTotalGeral', data.metricas?.total ?? 0);
            
            const ctxMotivos = document.getElementById('SegundaChamadaChartMotivos');
            if (ctxMotivos && data.porMotivo) {
                if (this.charts2Chamada.motivos) {
                    try { this.charts2Chamada.motivos.destroy(); } catch(e){}
                }
                this.charts2Chamada.motivos = new Chart(ctxMotivos.getContext('2d'), {
                    type: 'doughnut',
                    data: {
                        labels: data.porMotivo.map(m => m.label),
                        datasets: [{
                            data: data.porMotivo.map(m => m.count),
                            backgroundColor: ['#1e3c72', '#2a5298', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe']
                        }]
                    },
                    options: { responsive: true, maintainAspectRatio: true }
                });
            }
            
            const ctxAtrasos = document.getElementById('SegundaChamadaChartAtrasos');
            if (ctxAtrasos && data.tendencias?.ultimos7Dias) {
                if (this.charts2Chamada.atrasos) {
                    try { this.charts2Chamada.atrasos.destroy(); } catch(e){}
                }
                this.charts2Chamada.atrasos = new Chart(ctxAtrasos.getContext('2d'), {
                    type: 'line',
                    data: {
                        labels: data.tendencias.ultimos7Dias.map(d => d.dia),
                        datasets: [{
                            label: 'Registros',
                            data: data.tendencias.ultimos7Dias.map(d => d.atrasos),
                            borderColor: '#1e3c72',
                            backgroundColor: 'rgba(30, 60, 114, 0.1)',
                            fill: true,
                            tension: 0.4
                        }]
                    },
                    options: { responsive: true, maintainAspectRatio: true }
                });
            }
            
            const ctxTurmas = document.getElementById('SegundaChamadaChartTurmas');
            if (ctxTurmas && data.tendencias?.porTurma) {
                if (this.charts2Chamada.turmas) {
                    try { this.charts2Chamada.turmas.destroy(); } catch(e){}
                }
                this.charts2Chamada.turmas = new Chart(ctxTurmas.getContext('2d'), {
                    type: 'bar',
                    data: {
                        labels: data.tendencias.porTurma.map(t => t.turma),
                        datasets: [{
                            label: 'Registros',
                            data: data.tendencias.porTurma.map(t => t.count),
                            backgroundColor: '#2a5298',
                            borderRadius: 8
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: true,
                        plugins: { legend: { display: false } }
                    }
                });
            }
            
            const reinc = document.getElementById('SegundaChamadaAlunosReincidentes');
            if (reinc) {
                const lista = data.tendencias?.alunosReincidentes || [];
                if (lista.length > 0) {
                    reinc.innerHTML = `
                        <div class="table-responsive">
                            <table class="table table-sm">
                                <thead><tr><th>Aluno</th><th>Turma</th><th>Registros</th></tr></thead>
                                <tbody>${lista.map(a => `
                                    <tr>
                                        <td><strong>${this.escapeHtml(a.alunoNome || '')}</strong></td>
                                        <td>${this.escapeHtml(a.alunoTurma || '-')}</td>
                                        <td><span class="badge bg-danger">${a.count || 0}</span></td>
                                    </tr>`).join('')}
                                </tbody>
                            </table>
                        </div>`;
                } else {
                    reinc.innerHTML = `<p class="text-muted text-center py-3">
                        <i class="fas fa-check-circle text-success"></i> Nenhum aluno reincidente
                    </p>`;
                }
            }
            
            console.log('✅ Dashboard 2ª Chamada carregado');
        } catch (error) {
            console.error('Erro no dashboard 2ª Chamada:', error);
        }
    }
    
    toggleRelatorioFiltrosSegundaChamada() {
        const tipo = document.getElementById('SegundaChamadaTipoRelatorio')?.value;
        if (!tipo) return;
        
        const divTurma = document.getElementById('SegundaChamadaFiltroTurmaDiv');
        const divAluno = document.getElementById('SegundaChamadaFiltroAlunoDiv');
        
        if (divTurma) divTurma.style.display = tipo === 'turma' ? 'block' : 'none';
        if (divAluno) divAluno.style.display = tipo === 'aluno' ? 'block' : 'none';
        
        if (tipo === 'turma') this.carregarTurmasFiltroSegundaChamada();
        if (tipo === 'aluno') {
            this.inicializarAutocompleteSegundaChamada();
            setTimeout(() => document.getElementById('SegundaChamadaBuscaAlunoRelatorio')?.focus(), 100);
            if (!this.autocomplete2Chamada.carregado) {
                this.carregarAlunosParaRelatorioSegundaChamada();
            }
        }
    }
    
    async carregarTurmasFiltroSegundaChamada() {
        const select = document.getElementById('SegundaChamadaFiltroTurma');
        if (!select || select.options.length > 1) return;
        
        try {
            const r = await fetch('/api/gestao-geral/autorizacao/turmas', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const d = await r.json();
            if (d.success) {
                select.innerHTML = '<option value="">Selecione...</option>';
                d.turmas.forEach(t => {
                    select.innerHTML += `<option value="${this.escapeHtml(t)}">${this.escapeHtml(t)}</option>`;
                });
            }
        } catch (e) { console.warn(e); }
    }
    
    inicializarAutocompleteSegundaChamada() {
        const input = document.getElementById('SegundaChamadaBuscaAlunoRelatorio');
        const listEl = document.getElementById('SegundaChamadaAutocompleteAlunoList');
        const hiddenInput = document.getElementById('SegundaChamadaFiltroAluno');
        
        if (!input || !listEl || !hiddenInput) return;
        if (input.dataset.autocompleteInit === 'true') {
            if (!this.autocomplete2Chamada.carregado) {
                this.carregarAlunosParaRelatorioSegundaChamada();
            }
            return;
        }
        input.dataset.autocompleteInit = 'true';
        
        input.addEventListener('input', (e) => {
            const termo = e.target.value.trim();
            hiddenInput.value = '';
            const infoEl = document.getElementById('SegundaChamadaAlunoSelecionadoInfo');
            if (infoEl) infoEl.textContent = '';
            if (termo.length < 1) { listEl.style.display = 'none'; return; }
            this.filtrarAlunosAutocompleteSegundaChamada(termo);
        });
        
        input.addEventListener('focus', () => {
            const termo = input.value.trim();
            if (termo.length >= 1) this.filtrarAlunosAutocompleteSegundaChamada(termo);
            else if (!this.autocomplete2Chamada.carregado) this.carregarAlunosParaRelatorioSegundaChamada();
        });
        
        input.addEventListener('keydown', (e) => {
            const state = this.autocomplete2Chamada;
            if (listEl.style.display === 'none') return;
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                state.indice = Math.min(state.indice + 1, state.filtrados.length - 1);
                this.destacarItemAutocompleteSegundaChamada();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                state.indice = Math.max(state.indice - 1, -1);
                this.destacarItemAutocompleteSegundaChamada();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (state.indice >= 0 && state.filtrados[state.indice]) {
                    this.selecionarAlunoAutocompleteSegundaChamada(state.filtrados[state.indice]);
                }
            } else if (e.key === 'Escape') {
                listEl.style.display = 'none';
            }
        });
        
        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !listEl.contains(e.target)) {
                listEl.style.display = 'none';
            }
        });
        
        if (!this.autocomplete2Chamada.carregado) {
            this.carregarAlunosParaRelatorioSegundaChamada();
        }
    }
    
    async carregarAlunosParaRelatorioSegundaChamada() {
        const state = this.autocomplete2Chamada;
        if (state.carregado && state.alunos.length > 0) return;
        if (state.carregando) return;
        state.carregando = true;
        
        const inputBusca = document.getElementById('SegundaChamadaBuscaAlunoRelatorio');
        if (inputBusca && !inputBusca.dataset.carregado) {
            inputBusca.placeholder = 'Carregando alunos...';
        }
        
        try {
            const turmasRes = await fetch('/api/gestao-geral/autorizacao/turmas', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const turmasData = await turmasRes.json();
            if (!turmasData.success) {
                state.carregando = false;
                return;
            }
            
            const todosAlunos = [];
            for (const turma of turmasData.turmas) {
                try {
                    const res = await fetch(
                        `/api/gestao-geral/autorizacao/alunos-por-turma?turma=${encodeURIComponent(turma)}`,
                        { headers: { 'Authorization': `Bearer ${this.token}` } }
                    );
                    const data = await res.json();
                    if (data.success && data.alunos) {
                        data.alunos.forEach(a => todosAlunos.push({
                            id: a.id, nome: a.nome,
                            matricula: a.matricula || '',
                            turma: a.turma || turma,
                            curso: a.curso || ''
                        }));
                    }
                } catch (e) { console.warn('Erro turma:', turma, e); }
            }
            
            todosAlunos.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
            state.alunos = todosAlunos;
            state.carregado = true;
            
            if (inputBusca) {
                inputBusca.placeholder = 'Digite o nome do aluno...';
                inputBusca.dataset.carregado = 'true';
            }
        } catch (error) {
            console.error('Erro ao carregar alunos:', error);
        } finally {
            state.carregando = false;
        }
    }
    
    filtrarAlunosAutocompleteSegundaChamada(termo) {
        const listEl = document.getElementById('SegundaChamadaAutocompleteAlunoList');
        const state = this.autocomplete2Chamada;
        if (!listEl) return;
        
        if (!state.carregado) {
            listEl.innerHTML = `<div class="autocomplete-aluno-loading">Carregando...</div>`;
            listEl.style.display = 'block';
            this.carregarAlunosParaRelatorioSegundaChamada().then(() => {
                if (state.carregado) this.filtrarAlunosAutocompleteSegundaChamada(termo);
            });
            return;
        }
        
        const termoLower = termo.toLowerCase();
        state.filtrados = state.alunos.filter(a =>
            (a.nome || '').toLowerCase().includes(termoLower) ||
            (a.matricula || '').toLowerCase().includes(termoLower)
        ).slice(0, 10);
        
        state.indice = -1;
        
        if (state.filtrados.length === 0) {
            listEl.innerHTML = `<div class="autocomplete-aluno-empty">Nenhum aluno encontrado</div>`;
            listEl.style.display = 'block';
            return;
        }
        
        listEl.innerHTML = state.filtrados.map((aluno, index) => {
            const nomeDestacado = this.destacarTermo(aluno.nome, termo);
            const matricula = aluno.matricula ? `<span class="aluno-matricula">${this.escapeHtml(aluno.matricula)}</span>` : '';
            return `
                <div class="autocomplete-aluno-item" data-index="${index}">
                    <div class="aluno-nome">${nomeDestacado}</div>
                    <div class="aluno-info">
                        <span class="aluno-turma">${this.escapeHtml(aluno.turma || 'Sem turma')}</span>
                        ${matricula}
                    </div>
                </div>`;
        }).join('');
        
        listEl.querySelectorAll('.autocomplete-aluno-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const index = parseInt(item.getAttribute('data-index'));
                if (state.filtrados[index]) {
                    this.selecionarAlunoAutocompleteSegundaChamada(state.filtrados[index]);
                }
            });
            item.addEventListener('mouseenter', () => {
                state.indice = parseInt(item.getAttribute('data-index'));
                this.destacarItemAutocompleteSegundaChamada();
            });
        });
        
        listEl.style.display = 'block';
    }
    
    destacarTermo(texto, termo) {
        if (!texto) return '';
        if (!termo) return this.escapeHtml(texto);
        const regex = new RegExp(`(${termo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return this.escapeHtml(texto).replace(regex, '<mark>$1</mark>');
    }
    
    destacarItemAutocompleteSegundaChamada() {
        const listEl = document.getElementById('SegundaChamadaAutocompleteAlunoList');
        const state = this.autocomplete2Chamada;
        if (!listEl) return;
        
        listEl.querySelectorAll('.autocomplete-aluno-item').forEach((item, i) => {
            if (i === state.indice) {
                item.classList.add('selected');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('selected');
            }
        });
    }
    
    selecionarAlunoAutocompleteSegundaChamada(aluno) {
        if (!aluno) return;
        const input = document.getElementById('SegundaChamadaBuscaAlunoRelatorio');
        const hiddenInput = document.getElementById('SegundaChamadaFiltroAluno');
        const listEl = document.getElementById('SegundaChamadaAutocompleteAlunoList');
        const infoEl = document.getElementById('SegundaChamadaAlunoSelecionadoInfo');
        
        if (input) input.value = aluno.nome;
        if (hiddenInput) hiddenInput.value = aluno.id;
        if (listEl) listEl.style.display = 'none';
        if (infoEl) {
            const mat = aluno.matricula ? ` • ${aluno.matricula}` : '';
            infoEl.innerHTML = `✅ <strong>${this.escapeHtml(aluno.nome)}</strong>${mat} — Turma ${this.escapeHtml(aluno.turma || '-')}`;
            infoEl.style.color = '#1e3c72';
        }
    }
    
    async carregarRelatorioSegundaChamada() {
        const tipo = document.getElementById('SegundaChamadaTipoRelatorio')?.value || 'geral';
        const dataInicio = document.getElementById('SegundaChamadaDataInicio')?.value || '';
        const dataFim = document.getElementById('SegundaChamadaDataFim')?.value || '';
        
        let url = '';
        if (tipo === 'geral') {
            url = `/api/gestao-geral/autorizacao/relatorio/geral?tipo=segunda_chamada&`;
            if (dataInicio) url += `dataInicio=${dataInicio}&`;
            if (dataFim) url += `dataFim=${dataFim}&`;
        } else if (tipo === 'turma') {
            const turma = document.getElementById('SegundaChamadaFiltroTurma')?.value;
            if (!turma) { alert('Selecione uma turma'); return; }
            url = `/api/gestao-geral/autorizacao/relatorio/turma/${encodeURIComponent(turma)}?tipo=segunda_chamada&`;
            if (dataInicio) url += `dataInicio=${dataInicio}&`;
            if (dataFim) url += `dataFim=${dataFim}&`;
        } else if (tipo === 'aluno') {
            const alunoId = document.getElementById('SegundaChamadaFiltroAluno')?.value;
            if (!alunoId) { alert('Selecione um aluno'); return; }
            url = `/api/gestao-geral/autorizacao/relatorio/aluno/${alunoId}?tipo=segunda_chamada&`;
            if (dataInicio) url += `dataInicio=${dataInicio}&`;
            if (dataFim) url += `dataFim=${dataFim}&`;
        }
        
        try {
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const data = await response.json();
            if (data.success) {
                this.relatorio2Chamada = data;
                this.exibirRelatorioSegundaChamada(data, tipo);
            } else {
                alert('Erro ao carregar relatório: ' + (data.error || ''));
            }
        } catch (error) {
            console.error('Erro:', error);
            alert('Erro ao carregar relatório');
        }
    }
    
    exibirRelatorioSegundaChamada(data, tipo) {
        const container = document.getElementById('SegundaChamadaResultadoRelatorio');
        if (!container) return;
        
        if (tipo === 'geral') {
            container.innerHTML = `
                <div class="card"><div class="card-body">
                    <h5><i class="fas fa-chart-bar"></i> Relatório Geral - 2ª Chamada</h5>
                    <p>Total: <strong>${data.totalRegistros || 0}</strong></p>
                    <h6 class="mt-4">Por Motivo</h6>
                    <div class="row">${(data.porMotivo || []).map(m => `
                        <div class="col-md-4 mb-2">
                            <div class="p-2" style="background:#dbeafe;border-radius:8px;">
                                <strong>${this.escapeHtml(m.label)}</strong>: ${m.count}
                            </div>
                        </div>`).join('')}</div>
                    <h6 class="mt-4">Por Turma</h6>
                    <div class="table-responsive">
                        <table class="table table-sm">
                            <thead><tr><th>Turma</th><th>Total</th><th>Alunos</th></tr></thead>
                            <tbody>${(data.porTurma || []).map(t => `
                                <tr><td>${this.escapeHtml(t.turma)}</td><td>${t.total}</td><td>${t.totalAlunos}</td></tr>`).join('')}
                            </tbody>
                        </table>
                    </div>
                </div></div>`;
        } else if (tipo === 'turma') {
            container.innerHTML = `
                <div class="card"><div class="card-body">
                    <h5>Relatório da Turma: ${this.escapeHtml(data.turma || '')}</h5>
                    <p>Total: <strong>${data.estatisticas?.totalRegistros || 0}</strong></p>
                    <h6 class="mt-4">Por Aluno</h6>
                    <div class="table-responsive">
                        <table class="table table-sm">
                            <thead><tr><th>Aluno</th><th>Matrícula</th><th>Total</th></tr></thead>
                            <tbody>${(data.porAluno || []).map(a => `
                                <tr>
                                    <td>${this.escapeHtml(a.alunoNome)}</td>
                                    <td>${this.escapeHtml(a.alunoMatricula || '-')}</td>
                                    <td><span class="badge bg-primary">${a.total}</span></td>
                                </tr>`).join('')}
                            </tbody>
                        </table>
                    </div>
                </div></div>`;
        } else if (tipo === 'aluno') {
            container.innerHTML = `
                <div class="card"><div class="card-body">
                    <h5>Relatório: ${this.escapeHtml(data.aluno?.nome || '')}</h5>
                    <p>Turma: ${this.escapeHtml(data.aluno?.turma || 'N/A')} | Matrícula: ${this.escapeHtml(data.aluno?.matricula || 'N/A')}</p>
                    <p>Total: <strong>${data.estatisticas?.totalRegistros || 0}</strong></p>
                    <h6 class="mt-4">Histórico</h6>
                    <div class="table-responsive">
                        <table class="table table-sm">
                            <thead><tr><th>Data</th><th>Motivo</th><th>Observações</th></tr></thead>
                            <tbody>${(data.registros || []).map(a => `
                                <tr>
                                    <td>${a.dataFormatada}</td>
                                    <td>${this.escapeHtml(a.motivoLabel)}</td>
                                    <td>${this.escapeHtml((a.observacoes || '').substring(0, 100))}</td>
                                </tr>`).join('')}
                            </tbody>
                        </table>
                    </div>
                </div></div>`;
        }
    }
    
    exportarCSVSegundaChamada() {
        const data = this.relatorio2Chamada;
        if (!data) { alert('Nenhum relatório carregado'); return; }
        
        const registros = data.registros || [];
        if (registros.length === 0) { alert('Nenhum dado para exportar'); return; }
        
        let csv = "Data,Aluno,Matrícula,Turma,Motivo,Observações,Responsável\n";
        registros.forEach(a => {
            csv += [
                a.dataFormatada || '',
                `"${(a.alunoNome || '').replace(/"/g, '""')}"`,
                `"${(a.alunoMatricula || '').replace(/"/g, '""')}"`,
                `"${(a.alunoTurma || data.turma || data.aluno?.turma || '').replace(/"/g, '""')}"`,
                `"${(a.motivoLabel || '').replace(/"/g, '""')}"`,
                `"${(a.observacoes || '').replace(/"/g, '""')}"`,
                `"${(a.responsavelNome || '').replace(/"/g, '""')}"`
            ].join(',') + '\n';
        });
        
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `segunda-chamada-${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
    }
    
    async imprimirSegundaChamada(id) {
        try {
            const r = await fetch(`/api/gestao-geral/autorizacao/${id}`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const d = await r.json();
            if (!d.success) { alert('Erro ao carregar'); return; }
            
            const a = d.autorizacao;
            let qr = '';
            try {
                const qrR = await fetch(`/api/aluno/qrcode/${a.alunoId}`, {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                const qrD = await qrR.json();
                if (qrD.success && qrD.qrCode) qr = qrD.qrCode;
            } catch (e) { console.warn('Sem QR Code'); }
            
            const win = window.open('', '_blank');
            win.document.write(this.gerarHTMLImpressaoSegundaChamada(a, qr));
            win.document.close();
            win.onload = () => setTimeout(() => win.print(), 500);
        } catch (e) {
            console.error(e);
            alert('Erro ao imprimir');
        }
    }
    
    gerarHTMLImpressaoSegundaChamada(a, qrCodeUrl) {
        const logo = '/uploads/logo-iema.png';
        const carimbo = '/icons/assinatura_gestao.ico';
        const dataExt = new Date(a.data).toLocaleDateString('pt-BR', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
        
        let detalheMotivo = '';
        if (a.motivo === 'outros' && a.motivoOutros) {
            detalheMotivo = ` <strong>(Especificação: ${a.motivoOutros})</strong>`;
        }
        
        const assinaturaHTML = a.assinaturaBase64 
            ? `<div class="assinatura-digital"><img src="${a.assinaturaBase64}" alt="Assinatura"></div>`
            : '<div class="assinatura-vazia">_____________________________________</div>';
        
        const carimboHTML = `
            <div class="carimbo-gestao">
                <img src="${carimbo}" alt="Carimbo Gestão Geral">
            </div>`;
        
        return `<!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <title>2ª Chamada - ${a.alunoNome}</title>
            <style>
                @page { size: A4 landscape; margin: 0; }
                * { box-sizing: border-box; margin: 0; padding: 0; }
                html, body { width: 297mm; height: 210mm; font-family: 'Times New Roman', Times, serif; background: #f0f0f0; }
                .folha-metade { width: 148.5mm; height: 210mm; padding: 8mm 10mm; background: white; position: relative; margin: 0; page-break-after: always; overflow: hidden; font-size: 9pt; line-height: 1.3; }
                @media print { html, body { width: 297mm; height: 210mm; background: white; } .folha-metade { width: 148.5mm; height: 210mm; padding: 8mm 10mm; page-break-after: always; } .btn-print { display: none !important; } }
                .header { text-align: center; border-bottom: 2px double #000; padding-bottom: 5px; margin-bottom: 6px; }
                .header img { max-width: 100%; height: auto; max-height: 22mm; object-fit: contain; }
                .header h1 { font-size: 9pt; margin: 3px 0 0 0; text-transform: uppercase; font-weight: bold; }
                .titulo { text-align: center; font-size: 11pt; font-weight: bold; text-transform: uppercase; margin: 6px 0; background: #e8e8e8; padding: 5px; border: 1.5px solid #000; letter-spacing: 1px; }
                .info-section { border: 1px solid #000; padding: 6px 8px; margin-bottom: 6px; }
                .info-row { display: flex; margin-bottom: 4px; gap: 10px; align-items: baseline; }
                .info-row:last-child { margin-bottom: 0; }
                .info-item { flex: 1; display: flex; align-items: baseline; gap: 4px; min-width: 0; }
                .label { font-weight: bold; font-size: 8pt; white-space: nowrap; }
                .underline { border-bottom: 1px dotted #000; flex: 1; height: 14px; min-height: 14px; font-size: 9pt; padding: 0 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                .motivo-box { background: #f5f5f5; border: 1px solid #000; padding: 6px 8px; margin: 6px 0; }
                .motivo-box h3 { margin: 0 0 3px 0; font-size: 9pt; text-transform: uppercase; }
                .motivo-box p { margin: 0; font-size: 9pt; font-weight: bold; }
                .responsavel-box { background: #eef3fb; border: 1px solid #000; padding: 6px 8px; margin: 6px 0; font-size: 8.5pt; }
                .responsavel-box h3 { margin: 0 0 3px 0; font-size: 9pt; text-transform: uppercase; }
                .responsavel-box p { margin: 2px 0; font-size: 8.5pt; }
                .observacoes { border: 1px solid #000; padding: 6px 8px; min-height: 18mm; margin: 6px 0; font-size: 8.5pt; }
                .observacoes strong { display: block; margin-bottom: 3px; font-size: 9pt; }
                .assinaturas { display: flex; justify-content: space-around; margin-top: 4mm; gap: 8mm; }
                .assinatura { text-align: center; flex: 1; font-size: 8pt; }
                .assinatura-digital { border-bottom: 1px solid #000; min-height: 15mm; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 2px; }
                .assinatura-digital img { max-height: 14mm; max-width: 100%; object-fit: contain; }
                .assinatura-vazia { border-bottom: 1px solid #000; min-height: 15mm; display: flex; align-items: flex-end; justify-content: center; color: #999; font-size: 8pt; padding-bottom: 2px; }
                .assinatura-linha { padding-top: 3px; font-size: 8pt; }
                .carimbo-gestao {
                    border-bottom: 1px solid #000; min-height: 15mm;
                    display: flex; align-items: flex-end; justify-content: center;
                    padding-bottom: 2px;
                }
                .carimbo-gestao img {
                    max-height: 14mm; max-width: 100%; object-fit: contain; opacity: 0.9;
                }
                .qr-code { text-align: center; margin-top: 4px; }
                .qr-code img { width: 18mm; height: 18mm; border: 1px solid #000; padding: 1px; }
                .qr-code p { font-size: 7pt; margin: 2px 0 0 0; }
                .footer { text-align: center; margin-top: 5px; padding-top: 4px; border-top: 1px solid #000; font-size: 7pt; color: #444; }
                .footer p { margin: 1px 0; }
                .btn-print { display: block; margin: 15px auto; padding: 10px 30px; background: #4f46e5; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 14px; font-family: Arial, sans-serif; }
                .btn-print:hover { background: #4338ca; }
                .linha-corte { position: fixed; left: 148.5mm; top: 0; width: 0; height: 210mm; border-left: 1px dashed #999; pointer-events: none; }
                @media print { .linha-corte { display: none; } }
            </style>
        </head>
        <body>
            <button class="btn-print no-print" onclick="window.print()">🖨️ Imprimir</button>
            <div class="linha-corte"></div>
            <div class="folha-metade">
                <div class="header">
                    <img src="${logo}" alt="IEMA" onerror="this.style.display='none'">
                    <h1>IEMA PLENO: SÃO LUÍS - CENTRO</h1>
                </div>
                <div class="titulo">📋 2ª CHAMADA</div>
                <div class="info-section">
                    <div class="info-row">
                        <div class="info-item">
                            <span class="label">Estudante:</span>
                            <span class="underline">${a.alunoNome || ''}</span>
                        </div>
                    </div>
                    <div class="info-row">
                        <div class="info-item">
                            <span class="label">Matrícula:</span>
                            <span class="underline">${a.alunoMatricula || ''}</span>
                        </div>
                        <div class="info-item">
                            <span class="label">Turma:</span>
                            <span class="underline">${a.alunoTurma || ''}</span>
                        </div>
                    </div>
                    <div class="info-row">
                        <div class="info-item">
                            <span class="label">Curso:</span>
                            <span class="underline">${a.alunoCurso || ''}</span>
                        </div>
                    </div>
                    <div class="info-row">
                        <div class="info-item">
                            <span class="label">Data:</span>
                            <span class="underline">${dataExt}</span>
                        </div>
                    </div>
                    ${a.horarioEntrada ? `
                        <div class="info-row">
                            <div class="info-item">
                                <span class="label">Horário:</span>
                                <span class="underline">${a.horarioEntrada}</span>
                            </div>
                        </div>` : ''}
                </div>
                <div class="motivo-box">
                    <h3>📌 Motivo:</h3>
                    <p>☑ ${a.motivoLabel}${detalheMotivo}</p>
                </div>
                ${(a.responsavelNome || a.responsavelCPF || a.responsavelTelefone) ? `
                    <div class="responsavel-box">
                        <h3>👤 Responsável:</h3>
                        ${a.responsavelNome ? `<p><strong>Nome:</strong> ${a.responsavelNome}</p>` : ''}
                        ${a.responsavelCPF ? `<p><strong>CPF:</strong> ${a.responsavelCPF}</p>` : ''}
                        ${a.responsavelTelefone ? `<p><strong>Telefone:</strong> ${a.responsavelTelefone}</p>` : ''}
                    </div>` : ''}
                <div class="observacoes">
                    <strong>📝 Observações:</strong>
                    ${a.observacoes || '___________________________________________________________________'}
                </div>
                <div class="assinaturas">
                    <div class="assinatura">
                        ${assinaturaHTML}
                        <div class="assinatura-linha">Assinatura do Responsável</div>
                    </div>
                    <div class="assinatura">
                        ${carimboHTML}
                        <div class="assinatura-linha">Coordenação / Gestão Geral</div>
                    </div>
                </div>
                ${qrCodeUrl ? `
                    <div class="qr-code">
                        <img src="${qrCodeUrl}" alt="QR Code">
                        <p>Identificação do Aluno</p>
                    </div>` : ''}
                <div class="footer">
                    <p>Gerado em ${new Date().toLocaleString('pt-BR')} por ${a.registradoPorNome || 'Setor Pedagógico'}</p>
                    <p>EducaPleno</p>
                </div>
            </div>
        </body>
        </html>`;
    }
    
    async excluirSegundaChamada(id) {
        const confirmar = await confirm('Tem certeza que deseja EXCLUIR este registro de 2ª Chamada?\n\nEsta ação não pode ser desfeita.');
        if (!confirmar) return;
        
        try {
            const r = await fetch(`/api/gestao-geral/autorizacao/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const d = await r.json();
            if (d.success) {
                this.showToast('✅ Excluído com sucesso!', 'success');
                this.carregarListaSegundaChamada();
            } else {
                this.showToast('❌ ' + (d.error || 'Erro'), 'error');
            }
        } catch (e) {
            console.error(e);
            this.showToast('Erro ao excluir', 'error');
        }
    }

    async abrirEditarSegundaChamada(id) {
        if (!id) return;
        
        try {
            const r = await fetch(`/api/gestao-geral/autorizacao/${id}`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const d = await r.json();
            
            if (!d.success || !d.autorizacao) {
                this.showToast('Erro ao carregar registro', 'error');
                return;
            }
            
            const a = d.autorizacao;
            const old = document.getElementById('modalEditar2Chamada');
            if (old) old.remove();
            
            const motivos = [
                { valor: 'problemas_pessoais', label: 'Problemas Pessoais' },
                { valor: 'problemas_saude', label: 'Problemas de Saúde' },
                { valor: 'viagem', label: 'Viagem' },
                { valor: 'outros', label: 'Outros' }
            ];
            
            const motivosOptions = motivos.map(m => 
                `<option value="${m.valor}" ${a.motivo === m.valor ? 'selected' : ''}>${m.label}</option>`
            ).join('');
            
            let dataInput = '';
            if (a.data) {
                const dObj = new Date(a.data);
                dataInput = dObj.toISOString().split('T')[0];
            }
            
            const modalHtml = `
                <div class="modal fade" id="modalEditar2Chamada" tabindex="-1">
                    <div class="modal-dialog modal-lg modal-dialog-scrollable">
                        <div class="modal-content">
                            <div class="modal-header" style="background: linear-gradient(135deg, #1e3c72, #2a5298); color: white;">
                                <h5 class="modal-title">
                                    <i class="fas fa-edit"></i> Editar 2ª Chamada
                                </h5>
                                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                <input type="hidden" id="edit2ChamadaId" value="${a.id}">
                                
                                <div style="display: flex; align-items: center; gap: 12px; padding: 12px; background: #eef2ff; border-radius: 10px; margin-bottom: 16px;">
                                    <img src="${a.alunoFoto || this.gerarAvatarSVG(a.alunoNome)}" style="width: 50px; height: 50px; border-radius: 50%;" alt="">
                                    <div style="flex: 1;">
                                        <h5 style="margin: 0; color: #1e3c72;">${this.escapeHtml(a.alunoNome)}</h5>
                                        <small style="color: #6b7280;">
                                            <i class="fas fa-id-card"></i> ${this.escapeHtml(a.alunoMatricula || '-')} • 
                                            <i class="fas fa-graduation-cap"></i> ${this.escapeHtml(a.alunoTurma || '-')}
                                        </small>
                                    </div>
                                </div>
                                
                                <div class="row">
                                    <div class="col-md-6 mb-3">
                                        <label class="form-label">Data <span class="text-danger">*</span></label>
                                        <input type="date" id="edit2ChamadaData" class="form-control" value="${dataInput}">
                                    </div>
                                    <div class="col-md-6 mb-3">
                                        <label class="form-label">Horário</label>
                                        <input type="time" id="edit2ChamadaHorario" class="form-control" value="${a.horarioEntrada || ''}">
                                    </div>
                                </div>
                                
                                <div class="mb-3">
                                    <label class="form-label">Motivo <span class="text-danger">*</span></label>
                                    <select id="edit2ChamadaMotivo" class="form-select" onchange="setorPedagogico.toggleEdit2ChamadaOutros()">
                                        ${motivosOptions}
                                    </select>
                                </div>
                                
                                <div id="edit2ChamadaCampoOutros" style="display: ${a.motivo === 'outros' ? 'block' : 'none'};">
                                    <div class="mb-3">
                                        <label class="form-label">Especifique o Motivo</label>
                                        <input type="text" id="edit2ChamadaMotivoOutros" class="form-control" value="${this.escapeHtml(a.motivoOutros || '')}">
                                    </div>
                                </div>
                                
                                <div class="card mb-3" style="background: #f8fafc; border: 1px solid #e2e8f0;">
                                    <div class="card-body">
                                        <h6 style="margin-bottom: 15px; color: #1e3c72;">
                                            <i class="fas fa-user-shield"></i> Dados do Responsável
                                        </h6>
                                        <div class="row">
                                            <div class="col-md-6 mb-3">
                                                <label class="form-label">Nome do Responsável</label>
                                                <input type="text" id="edit2ChamadaResponsavelNome" class="form-control" value="${this.escapeHtml(a.responsavelNome || '')}">
                                            </div>
                                            <div class="col-md-3 mb-3">
                                                <label class="form-label">CPF</label>
                                                <input type="text" id="edit2ChamadaResponsavelCPF" class="form-control" value="${this.escapeHtml(a.responsavelCPF || '')}" maxlength="14">
                                            </div>
                                            <div class="col-md-3 mb-3">
                                                <label class="form-label">Telefone</label>
                                                <input type="text" id="edit2ChamadaResponsavelTelefone" class="form-control" value="${this.escapeHtml(a.responsavelTelefone || '')}" maxlength="15">
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="mb-3">
                                    <label class="form-label">Observações</label>
                                    <textarea id="edit2ChamadaObservacoes" class="form-control" rows="3">${this.escapeHtml(a.observacoes || '')}</textarea>
                                </div>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                                    <i class="fas fa-times"></i> Cancelar
                                </button>
                                <button type="button" class="btn btn-primary" onclick="setorPedagogico.salvarEdicaoSegundaChamada()">
                                    <i class="fas fa-save"></i> Salvar Alterações
                                </button>
                            </div>
                        </div>
                    </div>
                </div>`;
            
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            new bootstrap.Modal(document.getElementById('modalEditar2Chamada')).show();
        } catch (error) {
            console.error('Erro:', error);
            this.showToast('Erro ao carregar registro para edição', 'error');
        }
    }

    toggleEdit2ChamadaOutros() {
        const motivo = document.getElementById('edit2ChamadaMotivo')?.value;
        const campo = document.getElementById('edit2ChamadaCampoOutros');
        if (campo) campo.style.display = motivo === 'outros' ? 'block' : 'none';
    }

    async salvarEdicaoSegundaChamada() {
        const id = document.getElementById('edit2ChamadaId')?.value;
        const data = document.getElementById('edit2ChamadaData')?.value;
        const horario = document.getElementById('edit2ChamadaHorario')?.value || '';
        const motivo = document.getElementById('edit2ChamadaMotivo')?.value;
        const motivoOutros = document.getElementById('edit2ChamadaMotivoOutros')?.value || '';
        const responsavelNome = document.getElementById('edit2ChamadaResponsavelNome')?.value || '';
        const responsavelCPF = document.getElementById('edit2ChamadaResponsavelCPF')?.value || '';
        const responsavelTelefone = document.getElementById('edit2ChamadaResponsavelTelefone')?.value || '';
        const observacoes = document.getElementById('edit2ChamadaObservacoes')?.value || '';
        
        if (!data || !motivo) {
            this.showToast('Preencha os campos obrigatórios', 'warning');
            return;
        }
        
        if (motivo === 'outros' && !motivoOutros.trim()) {
            this.showToast('Especifique o motivo "Outros"', 'warning');
            return;
        }
        
        try {
            const response = await fetch(`/api/gestao-geral/autorizacao/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({
                    data,
                    horarioEntrada: horario,
                    horarioSaida: horario,
                    motivo,
                    motivoOutros,
                    responsavelNome,
                    responsavelCPF,
                    responsavelTelefone,
                    observacoes
                })
            });
            const result = await response.json();
            
            if (result.success) {
                const modal = bootstrap.Modal.getInstance(document.getElementById('modalEditar2Chamada'));
                if (modal) modal.hide();
                
                this.showToast('✅ Registro atualizado com sucesso!', 'success');
                await this.carregarListaSegundaChamada();
                await this.carregarDashboardSegundaChamada();
            } else {
                this.showToast('❌ ' + (result.error || 'Erro ao salvar'), 'error');
            }
        } catch (error) {
            console.error('Erro:', error);
            this.showToast('Erro ao salvar alterações', 'error');
        }
    }
    
    // ============================================================================
    // 🔥 SUBSTITUIÇÃO DE PROFESSORES - PARTE 1 (LOAD + ESTRUTURA)
    // ============================================================================

    async loadSubstituicaoProfessores() {
        const content = document.getElementById('content');
        
        if (!this.temPermissaoSubstituicao) {
            content.innerHTML = `
                <div class="alert alert-warning m-4">
                    <i class="fas fa-lock"></i>
                    <strong>Acesso Restrito</strong>
                    <p>Você não tem permissão para acessar este módulo.</p>
                </div>
            `;
            return;
        }
        
        content.innerHTML = `
            <div class="substituicao-professores-container">
                <ul class="nav nav-tabs mb-3" role="tablist">
                    <li class="nav-item">
                        <button class="nav-link active" id="sp-registrar-tab" data-bs-toggle="tab" data-bs-target="#sp-registrar" type="button">
                            <i class="fas fa-plus-circle"></i> Registrar
                        </button>
                    </li>
                    <li class="nav-item">
                        <button class="nav-link" id="sp-lista-tab" data-bs-toggle="tab" data-bs-target="#sp-lista" type="button">
                            <i class="fas fa-list"></i> Substituições
                            <span class="badge bg-danger ms-1" id="badgeTotalSubstituicoes">0</span>
                        </button>
                    </li>
                    <li class="nav-item">
                        <button class="nav-link" id="sp-dashboard-tab" data-bs-toggle="tab" data-bs-target="#sp-dashboard" type="button">
                            <i class="fas fa-chart-line"></i> Dashboard
                        </button>
                    </li>
                    <li class="nav-item">
                        <button class="nav-link" id="sp-relatorios-tab" data-bs-toggle="tab" data-bs-target="#sp-relatorios" type="button">
                            <i class="fas fa-file-alt"></i> Relatórios
                        </button>
                    </li>
                </ul>

                <div class="tab-content">
                    <div class="tab-pane fade show active" id="sp-registrar">
                        <div class="card mb-3" id="cardProfessorAusente">
                            <div class="card-body">
                                <div class="etapa-header">
                                    <div class="etapa-numero">1</div>
                                    <div class="etapa-titulo">
                                        <h5><i class="fas fa-user-slash me-2"></i> Professor Ausente</h5>
                                        <small class="text-muted">Selecione o professor que estará ausente</small>
                                    </div>
                                </div>
                                <div class="search-box mt-3">
                                    <i class="fas fa-search"></i>
                                    <input type="text" id="buscaProfessorAusente" placeholder="Buscar professor por nome, email ou matrícula...">
                                </div>
                                <div class="professor-list mt-3" id="listaProfessoresAusentes">
                                    <div class="text-center py-3"><div class="loading"></div><p>Carregando professores...</p></div>
                                </div>
                            </div>
                        </div>

                        <div class="card mb-3" id="cardProfessorSubstituto" style="display: none;">
                            <div class="card-body">
                                <div class="etapa-header">
                                    <div class="etapa-numero">2</div>
                                    <div class="etapa-titulo">
                                        <h5><i class="fas fa-user-check me-2"></i> Professor Substituto</h5>
                                        <small class="text-muted">Selecione quem irá substituir</small>
                                    </div>
                                </div>
                                <div class="search-box mt-3">
                                    <i class="fas fa-search"></i>
                                    <input type="text" id="buscaProfessorSubstituto" placeholder="Buscar professor substituto...">
                                </div>
                                <div class="professor-list mt-3" id="listaProfessoresSubstitutos">
                                    <div class="text-center py-3"><div class="loading"></div><p>Carregando professores...</p></div>
                                </div>

                                <!-- ⭐ Checkbox "Não há substituto" ABAIXO da lista -->
                                <div class="mt-3">
                                    <div style="background: #fef2f2; border: 2px solid #fecaca; border-radius: 12px; padding: 15px;">
                                        <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                                            <input type="checkbox" id="checkSemSubstituto" 
                                                onchange="setorPedagogico.toggleSemSubstituto()" 
                                                style="width: 22px; height: 22px; accent-color: #dc2626; cursor: pointer;">
                                            <div>
                                                <strong style="font-size: 1rem; color: #dc2626;">
                                                    <i class="fas fa-user-slash"></i> Não há substituto disponível
                                                </strong>
                                                <p style="margin: 5px 0 0; font-size: 0.85rem; color: #991b1b;">
                                                    Marque esta opção quando ninguém puder substituir o professor ausente
                                                </p>
                                            </div>
                                        </label>
                                        
                                        <div id="camposSemSubstituto" style="display: none; margin-top: 15px; padding-top: 15px; border-top: 1px solid #fecaca;">
                                            <div class="mb-3">
                                                <label class="form-label" style="color: #991b1b; font-weight: 600;">
                                                    <i class="fas fa-exclamation-circle"></i> Motivo da Ausência do Substituto
                                                </label>
                                                <select id="selectMotivoSemSubstituto" class="form-select" style="border-color: #fecaca;">
                                                    <option value="">Selecione o motivo...</option>
                                                    <option value="falta_substituto">Falta do Substituto</option>
                                                    <option value="atestado_substituto">Atestado Médico</option>
                                                    <option value="emergencia">Emergência</option>
                                                    <option value="conflito_horario">Conflito de Horário</option>
                                                    <option value="outros">Outros</option>
                                                </select>
                                            </div>
                                            <div class="mb-0">
                                                <label class="form-label" style="color: #991b1b; font-weight: 600;">
                                                    <i class="fas fa-comment"></i> Observações
                                                </label>
                                                <textarea id="inputObservacoesSemSubstituto" class="form-control" rows="2" 
                                                        placeholder="Informações adicionais sobre a ausência do substituto..." 
                                                        style="border-color: #fecaca;"></textarea>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="card mb-3" id="cardDetalhes" style="display: none;">
                            <div class="card-body">
                                <div class="etapa-header">
                                    <div class="etapa-numero">3</div>
                                    <div class="etapa-titulo">
                                        <h5><i class="fas fa-clipboard-list me-2"></i> Detalhes da Substituição</h5>
                                        <small class="text-muted">Informe os dados da aula</small>
                                    </div>
                                </div>

                                <div class="resumo-professores mt-3">
                                    <div class="resumo-professor">
                                        <div class="resumo-role">AUSENTE</div>
                                        <div class="resumo-nome" id="resumoProfessorAusente">-</div>
                                    </div>
                                    <div class="resumo-arrow"><i class="fas fa-arrow-right"></i></div>
                                    <div class="resumo-professor">
                                        <div class="resumo-role">SUBSTITUTO</div>
                                        <div class="resumo-nome" id="resumoProfessorSubstituto">-</div>
                                    </div>
                                </div>

                                <div class="row g-3 mt-3">
                                    <div class="col-md-6">
                                        <label class="form-label">Turma <span class="text-danger">*</span></label>
                                        <select id="selectTurmaSubstituicao" class="form-select">
                                            <option value="">Selecione a turma...</option>
                                        </select>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label">Data <span class="text-danger">*</span></label>
                                        <input type="date" id="inputDataSubstituicao" class="form-control">
                                    </div>
                                </div>

                                <div class="mt-3">
                                    <label class="form-label">Horário da Aula <span class="text-danger">*</span></label>
                                    <div class="horarios-grid" id="horariosGridSubstituicao">
                                        ${[1,2,3,4,5,6,7,8,9].map(n => `
                                            <div class="horario-card" data-horario="${n}" onclick="setorPedagogico.selecionarHorarioSubstituicao(${n})">
                                                <div class="horario-numero">${n}º</div>
                                                <div class="horario-label">Horário</div>
                                            </div>
                                        `).join('')}
                                    </div>
                                    <input type="hidden" id="inputHorarioSubstituicao" value="">
                                </div>

                                <div id="blocoMotivoSubstituicao">
                                    <div class="mt-3">
                                        <label class="form-label">Motivo <span class="text-danger">*</span></label>
                                        <select id="selectMotivoSubstituicao" class="form-select" onchange="setorPedagogico.atualizarMotivoDetalhesSubstituicao()">
                                            <option value="">Selecione o motivo...</option>
                                            <option value="falta_professor">Falta do Professor</option>
                                            <option value="licenca_medica">Licença Médica</option>
                                            <option value="licenca_maternidade_paternidade">Licença Maternidade/Paternidade</option>
                                            <option value="capacitacao_formacao">Capacitação/Formação</option>
                                            <option value="reuniao_externa">Reunião Externa</option>
                                            <option value="problema_pessoal">Problema Pessoal</option>
                                            <option value="atestado">Atestado</option>
                                            <option value="outros">Outros</option>
                                        </select>
                                    </div>

                                    <div class="mt-3" id="grupoMotivoDetalhesSubstituicao" style="display: none;">
                                        <label class="form-label">Especifique o Motivo</label>
                                        <input type="text" id="inputMotivoDetalhesSubstituicao" class="form-control" placeholder="Descreva o motivo...">
                                    </div>
                                </div>

                                <div class="mt-3">
                                    <label class="form-label">Observações</label>
                                    <textarea id="inputObservacoesSubstituicao" class="form-control" rows="3" placeholder="Informações adicionais (opcional)..."></textarea>
                                </div>

                                <div class="info-preenchimento mt-3">
                                    <i class="fas fa-clock"></i>
                                    <div>
                                        <strong>Horário do Preenchimento:</strong>
                                        <span id="horarioPreenchimentoSubstituicao"></span>
                                    </div>
                                </div>

                                <div class="d-flex gap-2 mt-4 justify-content-end">
                                    <button class="btn btn-secondary" onclick="setorPedagogico.resetarFormularioSubstituicao()">
                                        <i class="fas fa-times me-2"></i> Cancelar
                                    </button>
                                    <button class="btn btn-primary" onclick="setorPedagogico.registrarSubstituicao()" id="btnRegistrarSubstituicao">
                                        <i class="fas fa-save me-2"></i> Registrar Substituição
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="tab-pane fade" id="sp-lista">
                        <div class="card mb-3">
                            <div class="card-body">
                                <h6 class="card-title"><i class="fas fa-filter me-2"></i> Filtros</h6>
                                <div class="row g-3">
                                    <div class="col-md-3">
                                        <label class="form-label">Mês de Referência</label>
                                        <input type="month" id="filtroMesSubstituicao" class="form-control">
                                    </div>
                                    <div class="col-md-3">
                                        <label class="form-label">Buscar</label>
                                        <input type="text" id="filtroBuscaSubstituicao" class="form-control" placeholder="Nome ou turma...">
                                    </div>
                                    <div class="col-md-2">
                                        <label class="form-label">Turma</label>
                                        <select id="filtroTurmaSubstituicao" class="form-select"><option value="">Todas</option></select>
                                    </div>
                                    <div class="col-md-2">
                                        <label class="form-label">Motivo</label>
                                        <select id="filtroMotivoSubstituicao" class="form-select">
                                            <option value="">Todos</option>
                                            <option value="falta_professor">Falta</option>
                                            <option value="licenca_medica">Licença Médica</option>
                                            <option value="licenca_maternidade_paternidade">Lic. Mat/Pater</option>
                                            <option value="capacitacao_formacao">Capacitação</option>
                                            <option value="reuniao_externa">Reunião</option>
                                            <option value="problema_pessoal">Pessoal</option>
                                            <option value="atestado">Atestado</option>
                                            <option value="outros">Outros</option>
                                        </select>
                                    </div>
                                    <div class="col-md-2 d-flex align-items-end gap-2">
                                        <button class="btn btn-secondary flex-fill" onclick="setorPedagogico.limparFiltrosSubstituicao()">
                                            <i class="fas fa-eraser"></i>
                                        </button>
                                        <button class="btn btn-primary flex-fill" onclick="setorPedagogico.carregarListaSubstituicoes()">
                                            <i class="fas fa-search"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="card">
                            <div class="card-body">
                                <div class="d-flex justify-content-between align-items-center mb-3">
                                    <h6 class="card-title mb-0"><i class="fas fa-list me-2"></i> Substituições Registradas</h6>
                                    <span class="badge bg-primary" id="contadorListaSubstituicoes">0 registros</span>
                                </div>
                                <div id="listaSubstituicoes"></div>
                            </div>
                        </div>
                    </div>

                    <div class="tab-pane fade" id="sp-dashboard">
                        <div class="card mb-3">
                            <div class="card-body">
                                <div class="row g-3 align-items-end">
                                    <div class="col-md-4">
                                        <label class="form-label">Mês de Referência</label>
                                        <input type="month" id="dashboardMesSubstituicao" class="form-control">
                                    </div>
                                    <div class="col-md-3">
                                        <button class="btn btn-primary w-100" onclick="setorPedagogico.carregarDashboardSubstituicoes()">
                                            <i class="fas fa-sync-alt me-2"></i> Atualizar
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="row mb-4">
                            <div class="col-md-3 mb-3">
                                <div class="metric-card">
                                    <i class="fas fa-people-arrows fa-2x text-primary mb-2"></i>
                                    <div class="metric-value" id="spStatTotalMes">0</div>
                                    <div class="metric-label">Substituições no Mês</div>
                                </div>
                            </div>
                            <div class="col-md-3 mb-3">
                                <div class="metric-card">
                                    <i class="fas fa-user-slash fa-2x text-warning mb-2"></i>
                                    <div class="metric-value" id="spStatProfessoresAusentes">0</div>
                                    <div class="metric-label">Professores Ausentes</div>
                                </div>
                            </div>
                            <div class="col-md-3 mb-3">
                                <div class="metric-card">
                                    <i class="fas fa-user-check fa-2x text-success mb-2"></i>
                                    <div class="metric-value" id="spStatProfessoresSubstitutos">0</div>
                                    <div class="metric-label">Substitutos</div>
                                </div>
                            </div>
                            <div class="col-md-3 mb-3">
                                <div class="metric-card" style="border-left: 4px solid #dc2626;">
                                    <i class="fas fa-user-times fa-2x text-danger mb-2"></i>
                                    <div class="metric-value" id="spStatSubstitutosAusentes">0</div>
                                    <div class="metric-label">Substitutos Ausentes</div>
                                </div>
                            </div>
                        </div>
                        <div class="row">
                            <div class="col-md-6 mb-4">
                                <div class="card h-100"><div class="card-body">
                                    <h6 class="card-title"><i class="fas fa-chart-pie"></i> Por Motivo</h6>
                                    <canvas id="spChartMotivos"></canvas>
                                </div></div>
                            </div>
                            <div class="col-md-6 mb-4">
                                <div class="card h-100"><div class="card-body">
                                    <h6 class="card-title"><i class="fas fa-chart-bar"></i> Por Horário</h6>
                                    <canvas id="spChartHorarios"></canvas>
                                </div></div>
                            </div>
                            <div class="col-md-6 mb-4">
                                <div class="card h-100"><div class="card-body">
                                    <h6 class="card-title"><i class="fas fa-chart-line"></i> Por Dia</h6>
                                    <canvas id="spChartDias"></canvas>
                                </div></div>
                            </div>
                            <div class="col-md-6 mb-4">
                                <div class="card h-100"><div class="card-body">
                                    <h6 class="card-title"><i class="fas fa-school"></i> Por Turma</h6>
                                    <canvas id="spChartTurmas"></canvas>
                                </div></div>
                            </div>
                        </div>
                        <div class="row">
                            <div class="col-md-6 mb-4">
                                <div class="card h-100"><div class="card-body">
                                    <h6 class="card-title"><i class="fas fa-trophy"></i> Mais Ausentes</h6>
                                    <div id="spRankingAusentes" class="ranking-list mt-3"></div>
                                </div></div>
                            </div>
                            <div class="col-md-6 mb-4">
                                <div class="card h-100"><div class="card-body">
                                    <h6 class="card-title"><i class="fas fa-medal"></i> Mais Substituíram</h6>
                                    <div id="spRankingSubstitutos" class="ranking-list mt-3"></div>
                                </div></div>
                            </div>
                        </div>
                        <div class="card">
                            <div class="card-body">
                                <h6 class="card-title"><i class="fas fa-history"></i> Últimas Substituições</h6>
                                <div id="spUltimasSubstituicoes" class="mt-3"></div>
                            </div>
                        </div>
                    </div>

                    <div class="tab-pane fade" id="sp-relatorios">
                        <div class="card mb-3">
                            <div class="card-body">
                                <h6 class="card-title"><i class="fas fa-file-alt me-2"></i> Gerar Relatório</h6>
                                <div class="row g-3">
                                    <div class="col-md-3">
                                        <label class="form-label">Mês</label>
                                        <input type="month" id="relatorioMesSubstituicao" class="form-control">
                                    </div>
                                    <div class="col-md-3">
                                        <label class="form-label">Data Início</label>
                                        <input type="date" id="relatorioDataInicioSubstituicao" class="form-control">
                                    </div>
                                    <div class="col-md-3">
                                        <label class="form-label">Data Fim</label>
                                        <input type="date" id="relatorioDataFimSubstituicao" class="form-control">
                                    </div>
                                    <div class="col-md-3">
                                        <label class="form-label">Turma</label>
                                        <select id="relatorioTurmaSubstituicao" class="form-select"><option value="">Todas</option></select>
                                    </div>
                                    <div class="col-md-3">
                                        <label class="form-label">Motivo</label>
                                        <select id="relatorioMotivoSubstituicao" class="form-select">
                                            <option value="">Todos</option>
                                            <option value="falta_professor">Falta</option>
                                            <option value="licenca_medica">Licença Médica</option>
                                            <option value="licenca_maternidade_paternidade">Lic. Mat/Pater</option>
                                            <option value="capacitacao_formacao">Capacitação</option>
                                            <option value="reuniao_externa">Reunião</option>
                                            <option value="problema_pessoal">Pessoal</option>
                                            <option value="atestado">Atestado</option>
                                            <option value="outros">Outros</option>
                                        </select>
                                    </div>
                                    <div class="col-md-3">
                                        <label class="form-label">Substituto Ausente</label>
                                        <select id="relatorioSubstitutoAusenteSubstituicao" class="form-select">
                                            <option value="">Todos</option>
                                            <option value="false">Apenas com substituto</option>
                                            <option value="true">Apenas substituto ausente</option>
                                        </select>
                                    </div>
                                    <div class="col-md-3">
                                        <label class="form-label">&nbsp;</label>
                                        <button class="btn btn-primary w-100" onclick="setorPedagogico.gerarRelatorioSubstituicoes()">
                                            <i class="fas fa-search me-2"></i> Gerar
                                        </button>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label">&nbsp;</label>
                                        <div class="btn-group w-100">
                                            <button class="btn btn-success" onclick="setorPedagogico.exportarCSVSubstituicoes()" id="btnExportarCSVSubstituicao" disabled>
                                                <i class="fas fa-file-csv me-1"></i> CSV
                                            </button>
                                            <button class="btn btn-danger" onclick="setorPedagogico.imprimirRelatorioSubstituicoes()" id="btnImprimirRelatorioSubstituicao" disabled>
                                                <i class="fas fa-print me-1"></i> PDF
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div id="resultadoRelatorioSubstituicoes">
                            <div class="text-center py-5">
                                <i class="fas fa-chart-line fa-3x text-muted mb-3"></i>
                                <p class="text-muted">Selecione os filtros e clique em Gerar</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        setTimeout(async () => {
            const hoje = new Date().toISOString().split('T')[0];
            const mesAtual = new Date().toISOString().substring(0, 7);
            
            const inputData = document.getElementById('inputDataSubstituicao');
            if (inputData) {
                inputData.value = hoje;
                this.substituicaoState.formData.data = hoje;
            }
            
            ['filtroMesSubstituicao', 'dashboardMesSubstituicao', 'relatorioMesSubstituicao'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = mesAtual;
            });
            
            await this.carregarProfessoresSubstituicao();
            await this.carregarTurmasSubstituicao();
            await this.carregarListaSubstituicoes();
            await this.carregarDashboardSubstituicoes();
            
            const buscaAusente = document.getElementById('buscaProfessorAusente');
            if (buscaAusente) {
                buscaAusente.addEventListener('input', (e) => {
                    this.filtrarProfessoresSubstituicao(e.target.value, 'listaProfessoresAusentes', 'ausente');
                });
            }
            
            const buscaSubstituto = document.getElementById('buscaProfessorSubstituto');
            if (buscaSubstituto) {
                buscaSubstituto.addEventListener('input', (e) => {
                    this.filtrarProfessoresSubstituicao(e.target.value, 'listaProfessoresSubstitutos', 'substituto');
                });
            }
            
            const selectTurma = document.getElementById('selectTurmaSubstituicao');
            if (selectTurma) {
                selectTurma.addEventListener('change', (e) => {
                    this.substituicaoState.formData.turma = e.target.value;
                });
            }
            
            const inputDataSub = document.getElementById('inputDataSubstituicao');
            if (inputDataSub) {
                inputDataSub.addEventListener('change', (e) => {
                    this.substituicaoState.formData.data = e.target.value;
                });
            }
            
            const selectMotivo = document.getElementById('selectMotivoSubstituicao');
            if (selectMotivo) {
                selectMotivo.addEventListener('change', (e) => {
                    this.substituicaoState.formData.motivo = e.target.value;
                });
            }
            
            const inputMotivoDet = document.getElementById('inputMotivoDetalhesSubstituicao');
            if (inputMotivoDet) {
                inputMotivoDet.addEventListener('input', (e) => {
                    this.substituicaoState.formData.motivoDetalhes = e.target.value;
                });
            }
            
            const inputObs = document.getElementById('inputObservacoesSubstituicao');
            if (inputObs) {
                inputObs.addEventListener('input', (e) => {
                    this.substituicaoState.formData.observacoes = e.target.value;
                });
            }
            
            this.atualizarHorarioPreenchimentoSubstituicao();
            setInterval(() => this.atualizarHorarioPreenchimentoSubstituicao(), 1000);
            
            document.getElementById('sp-dashboard-tab')?.addEventListener('shown.bs.tab', () => {
                this.carregarDashboardSubstituicoes();
            });
        }, 200);
    }
        // ============================================================================
    // 🔥 SUBSTITUIÇÃO DE PROFESSORES - PARTE 2 (PROFESSORES + TURMAS + HORÁRIO)
    // ============================================================================

    async carregarProfessoresSubstituicao() {
        try {
            const response = await fetch('/api/substituicao-professor/professores', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const data = await response.json();
            
            if (data.success) {
                this.substituicaoState.professores = data.professores;
                this.renderizarListaProfessoresSubstituicao(this.substituicaoState.professores, 'listaProfessoresAusentes', 'ausente');
                this.renderizarListaProfessoresSubstituicao(this.substituicaoState.professores, 'listaProfessoresSubstitutos', 'substituto');
            }
        } catch (error) {
            console.error('Erro ao carregar professores:', error);
        }
    }
    
    renderizarListaProfessoresSubstituicao(lista, containerId, tipo) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        if (lista.length === 0) {
            container.innerHTML = `<div class="empty-state"><i class="fas fa-user-slash"></i><p>Nenhum professor encontrado</p></div>`;
            return;
        }
        
        container.innerHTML = lista.map(p => `
            <div class="professor-item" data-id="${p.id}" data-tipo="${tipo}" 
                 onclick="setorPedagogico.selecionarProfessorSubstituicao('${p.id}', '${tipo}')">
                <div class="professor-avatar">${(p.nome || '?').charAt(0).toUpperCase()}</div>
                <div class="professor-info">
                    <div class="professor-nome">${this.escapeHtml(p.nome)}</div>
                    <div class="professor-detalhes">
                        <span><i class="fas fa-envelope"></i> ${this.escapeHtml(p.email || 'Sem email')}</span>
                        <span><i class="fas fa-phone"></i> ${p.telefone || 'N/A'}</span>
                        <span><i class="fas fa-sitemap"></i> ${this.escapeHtml(p.eixo || 'Sem eixo')}</span>
                    </div>
                </div>
            </div>
        `).join('');
    }
    
    filtrarProfessoresSubstituicao(termo, containerId, tipo) {
        const termoLower = (termo || '').toLowerCase();
        let filtrados = this.substituicaoState.professores;
        
        if (termoLower) {
            filtrados = filtrados.filter(p =>
                (p.nome || '').toLowerCase().includes(termoLower) ||
                (p.email || '').toLowerCase().includes(termoLower) ||
                (p.matricula || '').toLowerCase().includes(termoLower)
            );
        }
        
        if (tipo === 'substituto' && this.substituicaoState.formData.professorAusente) {
            filtrados = filtrados.filter(p => p.id !== this.substituicaoState.formData.professorAusente.id);
        }
        
        this.renderizarListaProfessoresSubstituicao(filtrados, containerId, tipo);
    }

    toggleSemSubstituto() {
        const check = document.getElementById('checkSemSubstituto');
        const campos = document.getElementById('camposSemSubstituto');
        const blocoMotivo = document.getElementById('blocoMotivoSubstituicao');
        
        if (check && campos) {
            if (check.checked) {
                campos.style.display = 'block';
                campos.style.opacity = '0';
                setTimeout(() => { 
                    campos.style.transition = 'opacity 0.3s'; 
                    campos.style.opacity = '1'; 
                }, 10);
                
                // ⭐ Esconder o bloco de motivo (não houve substituição)
                if (blocoMotivo) blocoMotivo.style.display = 'none';
                const selectMotivo = document.getElementById('selectMotivoSubstituicao');
                if (selectMotivo) selectMotivo.value = '';
                const grupoDet = document.getElementById('grupoMotivoDetalhesSubstituicao');
                if (grupoDet) grupoDet.style.display = 'none';
                const inputDet = document.getElementById('inputMotivoDetalhesSubstituicao');
                if (inputDet) inputDet.value = '';
                
                // Limpar substituto selecionado
                this.substituicaoState.formData.professorSubstituto = null;
                document.querySelectorAll('#listaProfessoresSubstitutos .professor-item')
                    .forEach(el => el.classList.remove('selected'));
                
                document.getElementById('cardDetalhes').style.display = 'block';
                this.atualizarResumoSubstituicao();
                
                setTimeout(() => {
                    document.getElementById('cardDetalhes').scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 100);
            } else {
                campos.style.display = 'none';
                const selectMotivoSemSub = document.getElementById('selectMotivoSemSubstituto');
                const inputObsSemSub = document.getElementById('inputObservacoesSemSubstituto');
                if (selectMotivoSemSub) selectMotivoSemSub.value = '';
                if (inputObsSemSub) inputObsSemSub.value = '';
                
                // ⭐ Reexibir o bloco de motivo
                if (blocoMotivo) blocoMotivo.style.display = 'block';
                
                if (!this.substituicaoState.formData.professorSubstituto) {
                    document.getElementById('cardDetalhes').style.display = 'none';
                }
                
                this.atualizarResumoSubstituicao();
            }
        }
    }
    
    selecionarProfessorSubstituicao(id, tipo) {
        const professor = this.substituicaoState.professores.find(p => p.id === id);
        if (!professor) return;
        
        if (tipo === 'ausente') {
            // ... (mesma lógica de antes)
            this.substituicaoState.formData.professorAusente = professor;
            document.querySelectorAll('#listaProfessoresAusentes .professor-item').forEach(el => {
                el.classList.toggle('selected', el.dataset.id === id);
            });
            
            // Resetar substituto e checkbox
            this.substituicaoState.formData.professorSubstituto = null;
            const checkSemSub = document.getElementById('checkSemSubstituto');
            if (checkSemSub) checkSemSub.checked = false;
            const camposSemSub = document.getElementById('camposSemSubstituto');
            if (camposSemSub) camposSemSub.style.display = 'none';
            
            document.querySelectorAll('#listaProfessoresSubstitutos .professor-item').forEach(el => {
                el.classList.remove('selected');
            });
            
            document.getElementById('cardDetalhes').style.display = 'none';
            document.getElementById('cardProfessorSubstituto').style.display = 'block';
            this.atualizarResumoSubstituicao();
            
            const busca = document.getElementById('buscaProfessorSubstituto')?.value || '';
            this.filtrarProfessoresSubstituicao(busca, 'listaProfessoresSubstitutos', 'substituto');
            document.getElementById('cardProfessorSubstituto').scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
            // ⭐ Se selecionar um substituto, desmarcar "sem substituto"
            const checkSemSub = document.getElementById('checkSemSubstituto');
            if (checkSemSub && checkSemSub.checked) {
                checkSemSub.checked = false;
                const camposSemSub = document.getElementById('camposSemSubstituto');
                if (camposSemSub) camposSemSub.style.display = 'none';
                const selectMotivo = document.getElementById('selectMotivoSemSubstituto');
                if (selectMotivo) selectMotivo.value = '';
                const inputObs = document.getElementById('inputObservacoesSemSubstituto');
                if (inputObs) inputObs.value = '';
            }
            
            if (this.substituicaoState.formData.professorAusente && this.substituicaoState.formData.professorAusente.id === id) {
                this.showToast('O substituto deve ser diferente do ausente', 'warning');
                return;
            }
            
            this.substituicaoState.formData.professorSubstituto = professor;
            document.querySelectorAll('#listaProfessoresSubstitutos .professor-item').forEach(el => {
                el.classList.toggle('selected', el.dataset.id === id);
            });
            
            document.getElementById('cardDetalhes').style.display = 'block';
            this.atualizarResumoSubstituicao();
            document.getElementById('cardDetalhes').scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
    
    atualizarResumoSubstituicao() {
        const ausente = document.getElementById('resumoProfessorAusente');
        const substituto = document.getElementById('resumoProfessorSubstituto');
        if (ausente) ausente.textContent = this.substituicaoState.formData.professorAusente?.nome || '-';
        if (substituto) substituto.textContent = this.substituicaoState.formData.professorSubstituto?.nome || '-';
    }
    
    async carregarTurmasSubstituicao() {
        try {
            const response = await fetch('/api/substituicao-professor/turmas', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const data = await response.json();
            
            if (data.success) {
                this.substituicaoState.turmas = data.turmas;
                const options = this.substituicaoState.turmas.map(t => `<option value="${this.escapeHtml(t)}">${this.escapeHtml(t)}</option>`).join('');
                
                const selectTurma = document.getElementById('selectTurmaSubstituicao');
                if (selectTurma) selectTurma.innerHTML = '<option value="">Selecione a turma...</option>' + options;
                
                const filtroTurma = document.getElementById('filtroTurmaSubstituicao');
                if (filtroTurma) filtroTurma.innerHTML = '<option value="">Todas as turmas</option>' + options;
                
                const relTurma = document.getElementById('relatorioTurmaSubstituicao');
                if (relTurma) relTurma.innerHTML = '<option value="">Todas as turmas</option>' + options;
            }
        } catch (error) {
            console.error('Erro ao carregar turmas:', error);
        }
    }
    
    selecionarHorarioSubstituicao(horario) {
        this.substituicaoState.formData.horario = horario;
        const input = document.getElementById('inputHorarioSubstituicao');
        if (input) input.value = horario;
        
        document.querySelectorAll('#horariosGridSubstituicao .horario-card').forEach(card => {
            card.classList.toggle('selected', parseInt(card.dataset.horario) === horario);
        });
    }
    
    atualizarMotivoDetalhesSubstituicao() {
        const motivo = document.getElementById('selectMotivoSubstituicao')?.value;
        const grupo = document.getElementById('grupoMotivoDetalhesSubstituicao');
        
        if (motivo === 'outros') {
            grupo?.style.setProperty('display', 'block');
        } else {
            grupo?.style.setProperty('display', 'none');
            const input = document.getElementById('inputMotivoDetalhesSubstituicao');
            if (input) input.value = '';
        }
    }
    
    toggleSubstitutoAusente() {
        const check = document.getElementById('checkSubstitutoAusente');
        const campos = document.getElementById('camposSubstitutoAusente');
        
        if (check && campos) {
            if (check.checked) {
                campos.style.display = 'block';
                campos.style.opacity = '0';
                setTimeout(() => { 
                    campos.style.transition = 'opacity 0.3s'; 
                    campos.style.opacity = '1'; 
                }, 10);
            } else {
                campos.style.display = 'none';
                const selectMotivo = document.getElementById('selectMotivoSubstitutoAusente');
                const inputObs = document.getElementById('inputObservacoesSubstitutoAusente');
                if (selectMotivo) selectMotivo.value = '';
                if (inputObs) inputObs.value = '';
            }
        }
    }
    
    atualizarHorarioPreenchimentoSubstituicao() {
        const el = document.getElementById('horarioPreenchimentoSubstituicao');
        if (el) {
            el.textContent = new Date().toLocaleString('pt-BR', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            });
        }
    }
    
    async registrarSubstituicao() {
        const formData = this.substituicaoState.formData;
        
        const inputData = document.getElementById('inputDataSubstituicao');
        const valorData = inputData?.value || formData.data || '';
        
        const selectTurma = document.getElementById('selectTurmaSubstituicao');
        const valorTurma = selectTurma?.value || formData.turma || '';
        
        const inputHorario = document.getElementById('inputHorarioSubstituicao');
        const valorHorario = inputHorario?.value ? parseInt(inputHorario.value) : formData.horario;
        
        const selectMotivo = document.getElementById('selectMotivoSubstituicao');
        const valorMotivo = selectMotivo?.value || formData.motivo || '';
        
        const inputDetalhes = document.getElementById('inputMotivoDetalhesSubstituicao');
        const valorDetalhes = inputDetalhes?.value || formData.motivoDetalhes || '';
        
        const inputObs = document.getElementById('inputObservacoesSubstituicao');
        const valorObs = inputObs?.value || formData.observacoes || '';
        
        const semSubstituto = document.getElementById('checkSemSubstituto')?.checked || false;
        const substitutoAusenteMotivo = semSubstituto 
            ? (document.getElementById('selectMotivoSemSubstituto')?.value || '') 
            : '';
        const substitutoAusenteObservacoes = semSubstituto 
            ? (document.getElementById('inputObservacoesSemSubstituto')?.value || '') 
            : '';
        
        this.substituicaoState.formData.data = valorData;
        this.substituicaoState.formData.turma = valorTurma;
        this.substituicaoState.formData.horario = valorHorario;
        this.substituicaoState.formData.motivo = valorMotivo;
        this.substituicaoState.formData.motivoDetalhes = valorDetalhes;
        this.substituicaoState.formData.observacoes = valorObs;
        
        // Validações básicas
        if (!formData.professorAusente) { this.showToast('⚠️ Selecione o professor ausente', 'warning'); return; }
        
        if (!semSubstituto && !formData.professorSubstituto) { 
            this.showToast('⚠️ Selecione o professor substituto ou marque "Não há substituto disponível"', 'warning'); 
            return; 
        }
        
        if (semSubstituto && !substitutoAusenteMotivo) {
            this.showToast('⚠️ Selecione o motivo da ausência do substituto', 'warning');
            return;
        }
        
        if (!valorTurma) { this.showToast('⚠️ Selecione a turma', 'warning'); return; }
        if (!valorData) { this.showToast('⚠️ Informe a data', 'warning'); return; }
        if (!valorHorario) { this.showToast('⚠️ Selecione o horário', 'warning'); return; }
        
        // ⭐ Só valida motivo se NÃO for sem substituto
        if (!semSubstituto) {
            if (!valorMotivo) { this.showToast('⚠️ Selecione o motivo', 'warning'); return; }
            if (valorMotivo === 'outros' && !valorDetalhes) {
                this.showToast('⚠️ Especifique o motivo', 'warning');
                return;
            }
        }
        
        const btn = document.getElementById('btnRegistrarSubstituicao');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> Registrando...';
        }
        
        try {
            const response = await fetch('/api/substituicao-professor/registrar', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    professorAusenteId: formData.professorAusente.id,
                    professorSubstitutoId: semSubstituto ? null : formData.professorSubstituto.id,
                    turma: valorTurma,
                    horario: valorHorario,
                    data: valorData,
                    motivo: semSubstituto ? 'sem_substituto' : valorMotivo,
                    motivoDetalhes: semSubstituto ? '' : valorDetalhes,
                    observacoes: valorObs,
                    substitutoAusente: semSubstituto,
                    substitutoAusenteMotivo,
                    substitutoAusenteObservacoes
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.showToast('✅ Substituição registrada!', 'success');
                this.resetarFormularioSubstituicao();
                await this.carregarListaSubstituicoes();
                await this.carregarDashboardSubstituicoes();
                
                const listaTab = document.getElementById('sp-lista-tab');
                if (listaTab) new bootstrap.Tab(listaTab).show();
            } else {
                throw new Error(data.error || 'Erro ao registrar');
            }
        } catch (error) {
            console.error('Erro:', error);
            this.showToast(error.message, 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-save me-2"></i> Registrar Substituição';
            }
        }
    }
    
    resetarFormularioSubstituicao() {
        const hoje = new Date().toISOString().split('T')[0];
        this.substituicaoState.formData = {
            professorAusente: null,
            professorSubstituto: null,
            turma: '',
            data: hoje,
            horario: null,
            motivo: '',
            motivoDetalhes: '',
            observacoes: '',
            substitutoAusente: false,
            substitutoAusenteMotivo: '',
            substitutoAusenteObservacoes: ''
        };
        
        const inputData = document.getElementById('inputDataSubstituicao');
        if (inputData) inputData.value = hoje;
        
        const selectTurma = document.getElementById('selectTurmaSubstituicao');
        if (selectTurma) selectTurma.value = '';
        
        const selectMotivo = document.getElementById('selectMotivoSubstituicao');
        if (selectMotivo) selectMotivo.value = '';
        
        const inputDetalhes = document.getElementById('inputMotivoDetalhesSubstituicao');
        if (inputDetalhes) inputDetalhes.value = '';
        
        const inputObs = document.getElementById('inputObservacoesSubstituicao');
        if (inputObs) inputObs.value = '';
        
        const inputHorario = document.getElementById('inputHorarioSubstituicao');
        if (inputHorario) inputHorario.value = '';
        
        // Resetar "sem substituto"
        const checkSemSub = document.getElementById('checkSemSubstituto');
        if (checkSemSub) checkSemSub.checked = false;
        
        const camposSemSub = document.getElementById('camposSemSubstituto');
        if (camposSemSub) camposSemSub.style.display = 'none';
        
        const selectMotivoSemSub = document.getElementById('selectMotivoSemSubstituto');
        if (selectMotivoSemSub) selectMotivoSemSub.value = '';
        
        const inputObsSemSub = document.getElementById('inputObservacoesSemSubstituto');
        if (inputObsSemSub) inputObsSemSub.value = '';
        
        // ⭐ Reexibir bloco de motivo
        const blocoMotivo = document.getElementById('blocoMotivoSubstituicao');
        if (blocoMotivo) blocoMotivo.style.display = 'block';
        
        const grupoDet = document.getElementById('grupoMotivoDetalhesSubstituicao');
        if (grupoDet) grupoDet.style.display = 'none';
        
        document.querySelectorAll('.professor-item').forEach(el => el.classList.remove('selected'));
        document.querySelectorAll('.horario-card').forEach(el => el.classList.remove('selected'));
        
        const cardSub = document.getElementById('cardProfessorSubstituto');
        if (cardSub) cardSub.style.display = 'none';
        
        const cardDet = document.getElementById('cardDetalhes');
        if (cardDet) cardDet.style.display = 'none';
        
        const buscaAusente = document.getElementById('buscaProfessorAusente');
        if (buscaAusente) buscaAusente.value = '';
        
        const buscaSubstituto = document.getElementById('buscaProfessorSubstituto');
        if (buscaSubstituto) buscaSubstituto.value = '';
        
        this.renderizarListaProfessoresSubstituicao(this.substituicaoState.professores, 'listaProfessoresAusentes', 'ausente');
        this.renderizarListaProfessoresSubstituicao(this.substituicaoState.professores, 'listaProfessoresSubstitutos', 'substituto');
        
        this.atualizarResumoSubstituicao();
    }
    
    async carregarListaSubstituicoes() {
        const container = document.getElementById('listaSubstituicoes');
        if (!container) return;
        
        container.innerHTML = '<div class="text-center py-3"><div class="loading"></div><p>Carregando...</p></div>';
        
        try {
            const params = new URLSearchParams();
            const mes = document.getElementById('filtroMesSubstituicao')?.value;
            const busca = document.getElementById('filtroBuscaSubstituicao')?.value;
            const turma = document.getElementById('filtroTurmaSubstituicao')?.value;
            const motivo = document.getElementById('filtroMotivoSubstituicao')?.value;
            
            if (mes) params.append('mes', mes);
            if (busca) params.append('busca', busca);
            if (turma) params.append('turma', turma);
            if (motivo) params.append('motivo', motivo);
            
            const response = await fetch(`/api/substituicao-professor/listar?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const data = await response.json();
            
            if (data.success) {
                this.substituicaoState.substituicoes = data.substituicoes;
                this.renderizarListaSubstituicoes(data.substituicoes);
                
                const contador = document.getElementById('contadorListaSubstituicoes');
                if (contador) contador.textContent = `${data.total} registro${data.total !== 1 ? 's' : ''}`;
                
                const badge = document.getElementById('badgeTotalSubstituicoes');
                if (badge) badge.textContent = data.total;
            }
        } catch (error) {
            console.error('Erro:', error);
            container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Erro ao carregar</p></div>';
        }
    }
    
    renderizarListaSubstituicoes(lista) {
        const container = document.getElementById('listaSubstituicoes');
        if (!container) return;
        
        if (lista.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-inbox"></i>
                    <h4>Nenhuma substituição encontrada</h4>
                    <p>Registre a primeira substituição ou ajuste os filtros.</p>
                </div>
            `;
            return;
        }
        
        const MOTIVOS_LABELS = {
            'falta_professor': 'Falta do Professor',
            'licenca_medica': 'Licença Médica',
            'licenca_maternidade_paternidade': 'Licença Mat/Pater',
            'capacitacao_formacao': 'Capacitação/Formação',
            'reuniao_externa': 'Reunião Externa',
            'problema_pessoal': 'Problema Pessoal',
            'atestado': 'Atestado',
            'outros': 'Outros'
        };
        
        const MOTIVOS_CORES = {
            'falta_professor': '#ef4444',
            'licenca_medica': '#f59e0b',
            'licenca_maternidade_paternidade': '#8b5cf6',
            'capacitacao_formacao': '#3b82f6',
            'reuniao_externa': '#10b981',
            'problema_pessoal': '#f97316',
            'atestado': '#6b7280',
            'outros': '#64748b'
        };
        
        container.innerHTML = `
            <div class="table-responsive">
                <table class="table table-hover">
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>Horário</th>
                            <th>Professor Ausente</th>
                            <th>Professor Substituto</th>
                            <th>Turma</th>
                            <th>Motivo</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${lista.map(s => {
                            // ⭐ NOVO: Badge de substituto ausente
                            const badgeSubstitutoAusente = s.substitutoAusente 
                                ? `<span class="badge-custom" style="background: #fee2e2; color: #dc2626; margin-left: 5px;">
                                      <i class="fas fa-user-slash"></i> Substituto Ausente
                                   </span>` 
                                : '';
                            
                            return `
                            <tr ${s.substitutoAusente ? 'style="background: #fef2f2;"' : ''}>
                                <td>
                                    <strong>${s.dataFormatada}</strong>
                                    <br><small style="color:#6b7280;">${s.diaSemana}</small>
                                </td>
                                <td><span class="badge-custom badge-primary">${s.horario}º</span></td>
                                <td>
                                    <strong>${this.escapeHtml(s.professorAusente.nome)}</strong>
                                    <br><small style="color:#6b7280;">${this.escapeHtml(s.professorAusente.eixo || '')}</small>
                                </td>
                                <td>
                                    <strong>${this.escapeHtml(s.professorSubstituto.nome)}</strong>
                                    ${badgeSubstitutoAusente}
                                    <br><small style="color:#6b7280;">${this.escapeHtml(s.professorSubstituto.eixo || '')}</small>
                                </td>
                                <td><span class="badge-custom badge-gray">${this.escapeHtml(s.turma)}</span></td>
                                <td>
                                    <span class="badge-custom" style="background:${MOTIVOS_CORES[s.motivo]}20; color:${MOTIVOS_CORES[s.motivo]};">
                                        ${MOTIVOS_LABELS[s.motivo] || s.motivo}
                                    </span>
                                </td>
                                <td>
                                    <div class="action-buttons">
                                        <button class="btn-action btn-view" onclick="setorPedagogico.verDetalhesSubstituicao('${s.id}')" title="Ver">
                                            <i class="fas fa-eye"></i>
                                        </button>
                                        <button class="btn-action btn-edit" onclick="setorPedagogico.abrirEdicaoSubstituicao('${s.id}')" title="Editar">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        <button class="btn-action btn-print" onclick="setorPedagogico.imprimirSubstituicao('${s.id}')" title="Imprimir">
                                            <i class="fas fa-print"></i>
                                        </button>
                                        <button class="btn-action btn-delete" onclick="setorPedagogico.excluirSubstituicao('${s.id}')" title="Excluir">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }
    
    limparFiltrosSubstituicao() {
        const mes = document.getElementById('filtroMesSubstituicao');
        if (mes) mes.value = new Date().toISOString().substring(0, 7);
        
        const busca = document.getElementById('filtroBuscaSubstituicao');
        if (busca) busca.value = '';
        
        const turma = document.getElementById('filtroTurmaSubstituicao');
        if (turma) turma.value = '';
        
        const motivo = document.getElementById('filtroMotivoSubstituicao');
        if (motivo) motivo.value = '';
        
        this.carregarListaSubstituicoes();
    }
    
    async verDetalhesSubstituicao(id) {
        try {
            const response = await fetch(`/api/substituicao-professor/${id}`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const data = await response.json();
            
            if (!data.success) { this.showToast('Não encontrada', 'error'); return; }
            
            const s = data.substituicao;
            this.substituicaoState.substituicaoParaImprimir = s;
            
            const MOTIVOS_LABELS = {
                'falta_professor': 'Falta do Professor',
                'licenca_medica': 'Licença Médica',
                'licenca_maternidade_paternidade': 'Licença Maternidade/Paternidade',
                'capacitacao_formacao': 'Capacitação/Formação',
                'reuniao_externa': 'Reunião Externa',
                'problema_pessoal': 'Problema Pessoal',
                'atestado': 'Atestado',
                'outros': 'Outros'
            };
            
            const SUBSTITUTO_MOTIVOS = {
                'falta_substituto': 'Falta do Substituto',
                'atestado_substituto': 'Atestado Médico',
                'emergencia': 'Emergência',
                'conflito_horario': 'Conflito de Horário',
                'outros': 'Outros'
            };
            
            // ⭐ NOVO: Bloco de alerta para substituto ausente
            const alertaSubstitutoAusente = s.substitutoAusente ? `
                <div style="background: #fef2f2; border: 2px solid #fecaca; padding: 15px; border-radius: 12px; margin-top: 20px;">
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                        <i class="fas fa-user-slash" style="color: #dc2626; font-size: 20px;"></i>
                        <strong style="color: #dc2626; font-size: 1.05rem;">Atenção: Professor Substituto Ausente</strong>
                    </div>
                    ${s.substitutoAusenteMotivo ? `<p style="margin: 5px 0; color: #991b1b;"><strong>Motivo:</strong> ${SUBSTITUTO_MOTIVOS[s.substitutoAusenteMotivo] || s.substitutoAusenteMotivo}</p>` : ''}
                    ${s.substitutoAusenteObservacoes ? `<p style="margin: 5px 0; color: #991b1b;"><strong>Obs:</strong> ${this.escapeHtml(s.substitutoAusenteObservacoes)}</p>` : ''}
                </div>
            ` : '';
            
            const modalHtml = `
                <div class="modal fade" id="modalDetalhesSp" tabindex="-1">
                    <div class="modal-dialog modal-lg">
                        <div class="modal-content">
                            <div class="modal-header" style="background: linear-gradient(135deg, #1e3c72, #2a5298); color: white;">
                                <h5 class="modal-title"><i class="fas fa-eye me-2"></i> Detalhes da Substituição</h5>
                                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                <div style="display: grid; grid-template-columns: 1fr auto 1fr; gap: 15px; align-items: center; background: #f0f4ff; padding: 20px; border-radius: 12px;">
                                    <div style="text-align: center;">
                                        <div style="font-size: 12px; color: #6b7280; margin-bottom: 8px;">AUSENTE</div>
                                        <div style="font-weight: 700; font-size: 16px;">${this.escapeHtml(s.professorAusenteNome)}</div>
                                        <div style="font-size: 12px; color: #6b7280; margin-top: 5px;">${this.escapeHtml(s.professorAusenteEmail || '')}</div>
                                    </div>
                                    <div style="font-size: 24px; color: #1e3c72;"><i class="fas fa-arrow-right"></i></div>
                                    <div style="text-align: center;">
                                        <div style="font-size: 12px; color: #6b7280; margin-bottom: 8px;">SUBSTITUTO</div>
                                        <div style="font-weight: 700; font-size: 16px;">${this.escapeHtml(s.professorSubstitutoNome)}</div>
                                        <div style="font-size: 12px; color: #6b7280; margin-top: 5px;">${this.escapeHtml(s.professorSubstitutoEmail || '')}</div>
                                    </div>
                                </div>
                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 20px;">
                                    <div><strong>Turma:</strong> ${this.escapeHtml(s.turma)}</div>
                                    <div><strong>Horário:</strong> ${s.horario}º Horário</div>
                                    <div><strong>Data:</strong> ${new Date(s.data + 'T12:00:00').toLocaleDateString('pt-BR')} (${s.diaSemana})</div>
                                    <div><strong>Motivo:</strong> ${MOTIVOS_LABELS[s.motivo] || s.motivo}</div>
                                </div>
                                ${s.observacoes ? `<div style="margin-top: 15px; background: #f9fafb; padding: 15px; border-radius: 10px;"><strong>Observações:</strong><br>${this.escapeHtml(s.observacoes)}</div>` : ''}
                                ${alertaSubstitutoAusente}
                                <div style="background: #f0fdf4; padding: 15px; border-radius: 10px; margin-top: 20px; font-size: 13px;">
                                    <i class="fas fa-user-check" style="color: #10b981;"></i>
                                    Registrado por <strong>${this.escapeHtml(s.registradoPorNome)}</strong> em ${new Date(s.registradoEm).toLocaleString('pt-BR')}
                                </div>
                            </div>
                            <div class="modal-footer">
                                <button class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>
                                <button class="btn btn-primary" onclick="setorPedagogico.imprimirSubstituicaoAtual()">
                                    <i class="fas fa-print me-2"></i> Imprimir
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            const oldModal = document.getElementById('modalDetalhesSp');
            if (oldModal) oldModal.remove();
            
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            new bootstrap.Modal(document.getElementById('modalDetalhesSp')).show();
        } catch (error) {
            console.error('Erro:', error);
            this.showToast('Erro ao carregar detalhes', 'error');
        }
    }
    
    async abrirEdicaoSubstituicao(id) {
        try {
            const response = await fetch(`/api/substituicao-professor/${id}`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const data = await response.json();
            
            if (!data.success) return;
            
            const s = data.substituicao;
            this.substituicaoState.editandoId = id;
            
            const turmasOptions = this.substituicaoState.turmas.map(t => 
                `<option value="${this.escapeHtml(t)}" ${t === s.turma ? 'selected' : ''}>${this.escapeHtml(t)}</option>`
            ).join('');
            
            const MOTIVOS_LABELS = {
                'falta_professor': 'Falta do Professor',
                'licenca_medica': 'Licença Médica',
                'licenca_maternidade_paternidade': 'Licença Maternidade/Paternidade',
                'capacitacao_formacao': 'Capacitação/Formação',
                'reuniao_externa': 'Reunião Externa',
                'problema_pessoal': 'Problema Pessoal',
                'atestado': 'Atestado',
                'outros': 'Outros'
            };
            
            const motivosOptions = Object.entries(MOTIVOS_LABELS).map(([key, label]) =>
                `<option value="${key}" ${s.motivo === key ? 'selected' : ''}>${label}</option>`
            ).join('');
            
            let horariosHTML = '';
            for (let i = 1; i <= 9; i++) {
                horariosHTML += `
                    <div class="horario-card ${s.horario === i ? 'selected' : ''}" 
                         data-horario="${i}" onclick="setorPedagogico.selecionarHorarioEdicaoSubstituicao(${i})">
                        <div class="horario-numero">${i}º</div>
                        <div class="horario-label">Horário</div>
                    </div>
                `;
            }
            
            const SUBSTITUTO_MOTIVOS = {
                'falta_substituto': 'Falta do Substituto',
                'atestado_substituto': 'Atestado Médico',
                'emergencia': 'Emergência',
                'conflito_horario': 'Conflito de Horário',
                'outros': 'Outros'
            };
            
            const substitutoMotivosOptions = Object.entries(SUBSTITUTO_MOTIVOS).map(([key, label]) =>
                `<option value="${key}" ${s.substitutoAusenteMotivo === key ? 'selected' : ''}>${label}</option>`
            ).join('');
            
            const modalHtml = `
                <div class="modal fade" id="modalEditarSp" tabindex="-1">
                    <div class="modal-dialog modal-lg">
                        <div class="modal-content">
                            <div class="modal-header" style="background: linear-gradient(135deg, #f59e0b, #d97706); color: white;">
                                <h5 class="modal-title"><i class="fas fa-edit me-2"></i> Editar Substituição</h5>
                                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                <div class="row g-3">
                                    <div class="col-md-6">
                                        <label class="form-label">Turma</label>
                                        <select id="editTurmaSp" class="form-select">${turmasOptions}</select>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label">Data</label>
                                        <input type="date" id="editDataSp" class="form-control" value="${s.data}">
                                    </div>
                                </div>
                                <div class="mt-3">
                                    <label class="form-label">Horário</label>
                                    <div class="horarios-grid" id="editHorariosSp">${horariosHTML}</div>
                                    <input type="hidden" id="editHorarioSp" value="${s.horario}">
                                </div>
                                <div class="row g-3 mt-3">
                                    <div class="col-md-6">
                                        <label class="form-label">Motivo</label>
                                        <select id="editMotivoSp" class="form-select">${motivosOptions}</select>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label">Detalhes</label>
                                        <input type="text" id="editMotivoDetalhesSp" class="form-control" value="${this.escapeHtml(s.motivoDetalhes || '')}">
                                    </div>
                                </div>
                                
                                <!-- ⭐ NOVO: Checkbox de substituto ausente na edição -->
                                <div class="mt-3">
                                    <div style="background: #fef2f2; border: 2px solid #fecaca; border-radius: 12px; padding: 15px;">
                                        <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                                            <input type="checkbox" id="editSubstitutoAusente" 
                                                   ${s.substitutoAusente ? 'checked' : ''}
                                                   onchange="document.getElementById('editCamposSubstitutoAusente').style.display = this.checked ? 'block' : 'none'"
                                                   style="width: 22px; height: 22px; accent-color: #dc2626;">
                                            <div>
                                                <strong style="color: #dc2626;">
                                                    <i class="fas fa-user-slash"></i> Professor substituto ausente
                                                </strong>
                                                <p style="margin: 5px 0 0; font-size: 0.85rem; color: #991b1b;">
                                                    Marque se o substituto também não compareceu
                                                </p>
                                            </div>
                                        </label>
                                        <div id="editCamposSubstitutoAusente" style="display: ${s.substitutoAusente ? 'block' : 'none'}; margin-top: 15px; padding-top: 15px; border-top: 1px solid #fecaca;">
                                            <div class="mb-2">
                                                <label class="form-label" style="color: #991b1b;">Motivo da Ausência</label>
                                                <select id="editMotivoSubstitutoAusente" class="form-select" style="border-color: #fecaca;">
                                                    <option value="">Selecione...</option>
                                                    ${substitutoMotivosOptions}
                                                </select>
                                            </div>
                                            <div>
                                                <label class="form-label" style="color: #991b1b;">Observações</label>
                                                <textarea id="editObsSubstitutoAusente" class="form-control" rows="2" style="border-color: #fecaca;">${this.escapeHtml(s.substitutoAusenteObservacoes || '')}</textarea>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="mt-3">
                                    <label class="form-label">Observações</label>
                                    <textarea id="editObservacoesSp" class="form-control" rows="3">${this.escapeHtml(s.observacoes || '')}</textarea>
                                </div>
                            </div>
                            <div class="modal-footer">
                                <button class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                                <button class="btn btn-primary" onclick="setorPedagogico.salvarEdicaoSubstituicao()">
                                    <i class="fas fa-save me-2"></i> Salvar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            const oldModal = document.getElementById('modalEditarSp');
            if (oldModal) oldModal.remove();
            
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            new bootstrap.Modal(document.getElementById('modalEditarSp')).show();
        } catch (error) {
            console.error('Erro:', error);
        }
    }
    
    selecionarHorarioEdicaoSubstituicao(horario) {
        const input = document.getElementById('editHorarioSp');
        if (input) input.value = horario;
        document.querySelectorAll('#editHorariosSp .horario-card').forEach(card => {
            card.classList.toggle('selected', parseInt(card.dataset.horario) === horario);
        });
    }
    
    async salvarEdicaoSubstituicao() {
        if (!this.substituicaoState.editandoId) return;
        
        const substitutoAusente = document.getElementById('editSubstitutoAusente')?.checked || false;
        const substitutoAusenteMotivo = substitutoAusente 
            ? (document.getElementById('editMotivoSubstitutoAusente')?.value || '') 
            : '';
        const substitutoAusenteObservacoes = substitutoAusente 
            ? (document.getElementById('editObsSubstitutoAusente')?.value || '') 
            : '';
        
        if (substitutoAusente && !substitutoAusenteMotivo) {
            this.showToast('⚠️ Selecione o motivo da ausência do substituto', 'warning');
            return;
        }
        
        const dados = {
            turma: document.getElementById('editTurmaSp').value,
            data: document.getElementById('editDataSp').value,
            horario: parseInt(document.getElementById('editHorarioSp').value),
            motivo: document.getElementById('editMotivoSp').value,
            motivoDetalhes: document.getElementById('editMotivoDetalhesSp').value,
            observacoes: document.getElementById('editObservacoesSp').value,
            substitutoAusente,
            substitutoAusenteMotivo,
            substitutoAusenteObservacoes
        };
        
        try {
            const response = await fetch(`/api/substituicao-professor/${this.substituicaoState.editandoId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(dados)
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.showToast('✅ Atualizada!', 'success');
                bootstrap.Modal.getInstance(document.getElementById('modalEditarSp'))?.hide();
                await this.carregarListaSubstituicoes();
                await this.carregarDashboardSubstituicoes();
            }
        } catch (error) {
            this.showToast('Erro ao atualizar', 'error');
        }
    }
    
    async excluirSubstituicao(id) {
        const confirmar = await confirm('⚠️ Tem certeza que deseja excluir?\n\nEsta ação não pode ser desfeita.');
        if (!confirmar) return;
        
        try {
            const response = await fetch(`/api/substituicao-professor/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.showToast('✅ Excluída!', 'success');
                await this.carregarListaSubstituicoes();
                await this.carregarDashboardSubstituicoes();
            }
        } catch (error) {
            this.showToast('Erro ao excluir', 'error');
        }
    }
    
    async imprimirSubstituicao(id) {
        try {
            const response = await fetch(`/api/substituicao-professor/${id}`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const data = await response.json();
            if (data.success) this.gerarImpressaoSubstituicao(data.substituicao);
        } catch (error) {
            this.showToast('Erro ao imprimir', 'error');
        }
    }
    
    imprimirSubstituicaoAtual() {
        if (this.substituicaoState.substituicaoParaImprimir) {
            this.gerarImpressaoSubstituicao(this.substituicaoState.substituicaoParaImprimir);
        }
    }
    
    gerarImpressaoSubstituicao(s) {
        const MOTIVOS_LABELS = {
            'falta_professor': 'Falta do Professor',
            'licenca_medica': 'Licença Médica',
            'licenca_maternidade_paternidade': 'Licença Maternidade/Paternidade',
            'capacitacao_formacao': 'Capacitação/Formação',
            'reuniao_externa': 'Reunião Externa',
            'problema_pessoal': 'Problema Pessoal',
            'atestado': 'Atestado',
            'outros': 'Outros'
        };
        
        const SUBSTITUTO_MOTIVOS = {
            'falta_substituto': 'Falta do Substituto',
            'atestado_substituto': 'Atestado Médico',
            'emergencia': 'Emergência',
            'conflito_horario': 'Conflito de Horário',
            'outros': 'Outros'
        };
        
        const dataExt = new Date(s.data + 'T12:00:00').toLocaleDateString('pt-BR', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
        
        // ⭐ NOVO: Bloco de alerta de substituto ausente no documento impresso
        const alertaSubstitutoAusenteImpressao = s.substitutoAusente ? `
            <div style="margin-top: 15px; padding: 12px; background: #fef2f2; border: 2px solid #fecaca; border-radius: 8px;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                    <span style="font-size: 16pt; color: #dc2626;">⚠️</span>
                    <strong style="color: #dc2626; font-size: 11pt; text-transform: uppercase;">ATENÇÃO: Professor Substituto Ausente</strong>
                </div>
                ${s.substitutoAusenteMotivo ? `<p style="margin: 4px 0; color: #991b1b; font-size: 10pt;"><strong>Motivo:</strong> ${SUBSTITUTO_MOTIVOS[s.substitutoAusenteMotivo] || s.substitutoAusenteMotivo}</p>` : ''}
                ${s.substitutoAusenteObservacoes ? `<p style="margin: 4px 0; color: #991b1b; font-size: 10pt;"><strong>Observações:</strong> ${s.substitutoAusenteObservacoes}</p>` : ''}
            </div>
        ` : '';
        
        const html = `
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <title>Substituição - ${s.professorAusenteNome}</title>
                <style>
                    @page { size: A4 portrait; margin: 15mm; }
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body { font-family: 'Times New Roman', serif; font-size: 11pt; line-height: 1.5; }
                    .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
                    .header h1 { font-size: 14pt; text-transform: uppercase; }
                    .titulo { text-align: center; font-size: 14pt; font-weight: bold; background: #f0f0f0; padding: 10px; border: 2px solid #000; margin: 20px 0; }
                    .section-title { font-size: 11pt; font-weight: bold; background: #e8e8e8; padding: 5px 10px; border-left: 4px solid #1e3c72; margin: 15px 0 10px; }
                    .professores-box { display: flex; align-items: center; gap: 20px; border: 1px solid #000; padding: 15px; margin: 15px 0; }
                    .professor { flex: 1; text-align: center; }
                    .professor-role { font-size: 9pt; text-transform: uppercase; color: #666; margin-bottom: 5px; }
                    .professor-nome { font-size: 12pt; font-weight: bold; }
                    .professor-detalhes { font-size: 10pt; color: #444; margin-top: 3px; }
                    .arrow { font-size: 20pt; color: #1e3c72; }
                    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 15px 0; }
                    .info-item { border-bottom: 1px dotted #666; padding: 5px 0; }
                    .info-label { font-weight: bold; font-size: 10pt; }
                    .info-value { font-size: 11pt; }
                    .observacoes { border: 1px solid #000; padding: 10px; min-height: 60px; margin-top: 10px; }
                    .assinaturas { display: flex; justify-content: space-around; margin-top: 50px; gap: 40px; }
                    .assinatura { flex: 1; text-align: center; }
                    .assinatura-linha { border-top: 1px solid #000; padding-top: 5px; font-size: 10pt; }
                    .footer { text-align: center; margin-top: 30px; padding-top: 10px; border-top: 1px solid #ccc; font-size: 8pt; color: #666; }
                    .registro-info { font-size: 9pt; color: #666; margin-top: 20px; text-align: center; }
                    .btn-print { display: block; margin: 20px auto; padding: 12px 30px; background: #1e3c72; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 14px; }
                    @media print { .no-print { display: none; } }
                </style>
            </head>
            <body>
                <button class="btn-print no-print" onclick="window.print()">🖨️ Imprimir</button>
                <div class="header">
                    <h1>IEMA Pleno: São Luís - Centro</h1>
                    <h2 style="font-weight: normal; font-size: 12pt; margin-top: 5px;">Sistema de Substituição de Professores</h2>
                </div>
                <div class="titulo">📋 Registro de Substituição</div>
                <div class="section-title">👥 Professores Envolvidos</div>
                <div class="professores-box">
                    <div class="professor">
                        <div class="professor-role">Professor Ausente</div>
                        <div class="professor-nome">${s.professorAusenteNome}</div>
                        <div class="professor-detalhes">${s.professorAusenteEmail || ''}<br>${s.professorAusenteEixo || ''}</div>
                    </div>
                    <div class="arrow">➜</div>
                    <div class="professor">
                        <div class="professor-role">Professor Substituto</div>
                        <div class="professor-nome">${s.professorSubstitutoNome}</div>
                        <div class="professor-detalhes">${s.professorSubstitutoEmail || ''}<br>${s.professorSubstitutoEixo || ''}</div>
                    </div>
                </div>
                ${alertaSubstitutoAusenteImpressao}
                <div class="section-title">📚 Informações da Aula</div>
                <div class="info-grid">
                    <div class="info-item"><div class="info-label">Turma:</div><div class="info-value">${s.turma}</div></div>
                    <div class="info-item"><div class="info-label">Horário:</div><div class="info-value">${s.horario}º Horário</div></div>
                    <div class="info-item"><div class="info-label">Data:</div><div class="info-value">${dataExt}</div></div>
                    <div class="info-item"><div class="info-label">Dia da Semana:</div><div class="info-value">${s.diaSemana}</div></div>
                </div>
                <div class="section-title">📝 Motivo</div>
                <div class="info-item"><div class="info-value"><strong>${MOTIVOS_LABELS[s.motivo] || s.motivo}</strong></div></div>
                ${s.motivoDetalhes ? `<div style="margin-top:10px; font-size:10pt;"><strong>Detalhes:</strong> ${s.motivoDetalhes}</div>` : ''}
                ${s.observacoes ? `
                    <div class="section-title">💬 Observações</div>
                    <div class="observacoes">${s.observacoes.replace(/\n/g, '<br>')}</div>
                ` : ''}
                <div class="assinaturas">
                    <div class="assinatura"><div class="assinatura-linha">Professor Substituto</div></div>
                    <div class="assinatura"><div class="assinatura-linha">Coordenação / Setor Pedagógico</div></div>
                </div>
                <div class="registro-info">
                    Registrado por <strong>${s.registradoPorNome}</strong> em ${new Date(s.registradoEm).toLocaleString('pt-BR')}
                </div>
                <div class="footer">
                    <p>Documento gerado automaticamente pelo EducaPleno</p>
                </div>
            </body>
            </html>
        `;
        
        const win = window.open('', '_blank');
        win.document.write(html);
        win.document.close();
        win.onload = () => setTimeout(() => win.print(), 500);
    }
    
    async carregarDashboardSubstituicoes() {
        try {
            const mes = document.getElementById('dashboardMesSubstituicao')?.value || new Date().toISOString().substring(0, 7);
            
            const response = await fetch(`/api/substituicao-professor/dashboard/resumo?mes=${mes}`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const data = await response.json();
            
            if (!data.success) return;
            
            const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
            setVal('spStatTotalMes', data.resumo.totalMes || 0);
            setVal('spStatProfessoresAusentes', data.professoresMaisAusentes.length || 0);
            setVal('spStatProfessoresSubstitutos', data.professoresMaisSubstituiram.length || 0);
            setVal('spStatSubstitutosAusentes', data.resumo.totalSubstitutosAusentes || 0);
            
            this.renderizarGraficosSubstituicoes(data, mes);
            this.renderizarRankingsSubstituicoes(data);
            this.renderizarUltimasSubstituicoes(data.ultimasSubstituicoes);
        } catch (error) {
            console.error('Erro no dashboard:', error);
        }
    }
    
    renderizarGraficosSubstituicoes(data, mes) {
        const MOTIVOS_CORES = {
            'falta_professor': '#ef4444',
            'licenca_medica': '#f59e0b',
            'licenca_maternidade_paternidade': '#8b5cf6',
            'capacitacao_formacao': '#3b82f6',
            'reuniao_externa': '#10b981',
            'problema_pessoal': '#f97316',
            'atestado': '#6b7280',
            'outros': '#64748b'
        };
        
        const ctxMotivos = document.getElementById('spChartMotivos');
        if (ctxMotivos) {
            if (this.substituicaoState.charts.motivos) this.substituicaoState.charts.motivos.destroy();
            this.substituicaoState.charts.motivos = new Chart(ctxMotivos.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: data.porMotivo.map(d => d.label),
                    datasets: [{
                        data: data.porMotivo.map(d => d.count),
                        backgroundColor: data.porMotivo.map(d => MOTIVOS_CORES[d.motivo] || '#64748b')
                    }]
                },
                options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom' } } }
            });
        }
        
        const ctxHorarios = document.getElementById('spChartHorarios');
        if (ctxHorarios) {
            if (this.substituicaoState.charts.horarios) this.substituicaoState.charts.horarios.destroy();
            const horarios = [];
            for (let i = 1; i <= 9; i++) {
                const enc = data.porHorario.find(d => d.horario === i);
                horarios.push(enc ? enc.count : 0);
            }
            this.substituicaoState.charts.horarios = new Chart(ctxHorarios.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: ['1º', '2º', '3º', '4º', '5º', '6º', '7º', '8º', '9º'],
                    datasets: [{ label: 'Substituições', data: horarios, backgroundColor: '#1e3c72', borderRadius: 8 }]
                },
                options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } } }
            });
        }
        
        const ctxDias = document.getElementById('spChartDias');
        if (ctxDias) {
            if (this.substituicaoState.charts.dias) this.substituicaoState.charts.dias.destroy();
            const [ano, mesNum] = mes.split('-').map(Number);
            const ultimoDia = new Date(ano, mesNum, 0).getDate();
            const labels = [], valores = [];
            for (let i = 1; i <= ultimoDia; i++) {
                labels.push(i);
                const diaStr = `${mes}-${String(i).padStart(2, '0')}`;
                const enc = data.substituicoesPorDia.find(d => d.data === diaStr);
                valores.push(enc ? enc.count : 0);
            }
            this.substituicaoState.charts.dias = new Chart(ctxDias.getContext('2d'), {
                type: 'line',
                data: {
                    labels,
                    datasets: [{
                        label: 'Substituições', data: valores,
                        borderColor: '#1e3c72', backgroundColor: 'rgba(30, 60, 114, 0.1)',
                        fill: true, tension: 0.4
                    }]
                },
                options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } } }
            });
        }
        
        const ctxTurmas = document.getElementById('spChartTurmas');
        if (ctxTurmas) {
            if (this.substituicaoState.charts.turmas) this.substituicaoState.charts.turmas.destroy();
            this.substituicaoState.charts.turmas = new Chart(ctxTurmas.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: data.porTurma.map(d => d.turma),
                    datasets: [{ label: 'Substituições', data: data.porTurma.map(d => d.count), backgroundColor: '#8b5cf6', borderRadius: 8 }]
                },
                options: { responsive: true, maintainAspectRatio: true, indexAxis: 'y', plugins: { legend: { display: false } } }
            });
        }
    }
    
    renderizarRankingsSubstituicoes(data) {
        const render = (containerId, dados) => {
            const container = document.getElementById(containerId);
            if (!container) return;
            
            if (dados.length === 0) {
                container.innerHTML = '<p style="text-align:center;color:#6b7280;">Nenhum dado</p>';
                return;
            }
            
            container.innerHTML = dados.map((p, i) => {
                const posClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
                return `
                    <div class="ranking-item">
                        <div class="ranking-position ${posClass}">${i + 1}</div>
                        <div class="ranking-info">
                            <div class="ranking-nome">${this.escapeHtml(p.nome)}</div>
                            <div class="ranking-detalhes">${this.escapeHtml(p.eixo || 'Sem eixo')}</div>
                        </div>
                        <div class="ranking-count">${p.count}</div>
                    </div>
                `;
            }).join('');
        };
        
        render('spRankingAusentes', data.professoresMaisAusentes);
        render('spRankingSubstitutos', data.professoresMaisSubstituiram);
    }
    
    renderizarUltimasSubstituicoes(lista) {
        const container = document.getElementById('spUltimasSubstituicoes');
        if (!container) return;
        
        if (lista.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:#6b7280;">Nenhuma substituição recente</p>';
            return;
        }
        
        container.innerHTML = `
            <div class="table-responsive">
                <table class="table table-hover">
                    <thead>
                        <tr><th>Data</th><th>Horário</th><th>Ausente</th><th>Substituto</th><th>Turma</th></tr>
                    </thead>
                    <tbody>
                        ${lista.map(s => `
                            <tr>
                                <td>${new Date(s.data + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                                <td>${s.horario}º</td>
                                <td>${this.escapeHtml(s.professorAusenteNome)}</td>
                                <td>${this.escapeHtml(s.professorSubstitutoNome)}</td>
                                <td>${this.escapeHtml(s.turma)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }
    
    async gerarRelatorioSubstituicoes() {
        const container = document.getElementById('resultadoRelatorioSubstituicoes');
        if (!container) return;
        
        container.innerHTML = '<div class="text-center py-5"><div class="loading"></div><p>Gerando relatório...</p></div>';
        
        try {
            const params = new URLSearchParams();
            const mes = document.getElementById('relatorioMesSubstituicao')?.value;
            const dataInicio = document.getElementById('relatorioDataInicioSubstituicao')?.value;
            const dataFim = document.getElementById('relatorioDataFimSubstituicao')?.value;
            const turma = document.getElementById('relatorioTurmaSubstituicao')?.value;
            const motivo = document.getElementById('relatorioMotivoSubstituicao')?.value;
            const substitutoAusente = document.getElementById('relatorioSubstitutoAusenteSubstituicao')?.value;
            
            if (mes) params.append('mes', mes);
            if (dataInicio) params.append('dataInicio', dataInicio);
            if (dataFim) params.append('dataFim', dataFim);
            if (turma) params.append('turma', turma);
            if (motivo) params.append('motivo', motivo);
            if (substitutoAusente !== undefined && substitutoAusente !== '') params.append('substitutoAusente', substitutoAusente);
            
            const response = await fetch(`/api/substituicao-professor/relatorio/gerar?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const data = await response.json();
            
            if (!data.success) throw new Error(data.error);
            
            this.substituicaoState.relatorioAtual = data;
            
            const btnCSV = document.getElementById('btnExportarCSVSubstituicao');
            if (btnCSV) btnCSV.disabled = false;
            const btnPDF = document.getElementById('btnImprimirRelatorioSubstituicao');
            if (btnPDF) btnPDF.disabled = false;
            
            let html = `
                <div class="card">
                    <div class="card-body">
                        <h6><i class="fas fa-chart-bar me-2"></i> Resultado do Relatório</h6>
                        <div class="metric-card" style="margin: 15px 0;">
                            <div class="metric-value">${data.total}</div>
                            <div class="metric-label">Total de Substituições</div>
                        </div>
            `;
            
            if (Object.keys(data.estatisticas.porMotivo).length > 0) {
                html += `<h6 style="margin-top:20px;">Por Motivo</h6><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">`;
                Object.entries(data.estatisticas.porMotivo).forEach(([k, v]) => {
                    html += `<span class="badge-custom badge-gray" style="padding:8px 14px;">${k}: <strong>${v}</strong></span>`;
                });
                html += `</div>`;
            }
            
            if (Object.keys(data.estatisticas.porTurma).length > 0) {
                html += `<h6 style="margin-top:20px;">Por Turma</h6><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">`;
                Object.entries(data.estatisticas.porTurma).forEach(([k, v]) => {
                    html += `<span class="badge-custom badge-primary" style="padding:8px 14px;">${k}: <strong>${v}</strong></span>`;
                });
                html += `</div>`;
            }
            
            if (data.substituicoes.length > 0) {
                html += `
                    <h6 style="margin-top:20px;">Detalhamento</h6>
                    <div class="table-responsive" style="margin-top:10px;">
                        <table class="table table-hover">
                            <thead>
                                <tr>
                                    <th>Data</th><th>Horário</th><th>Ausente</th>
                                    <th>Substituto</th><th>Turma</th><th>Motivo</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${data.substituicoes.map(s => `
                                    <tr ${s.substitutoAusente ? 'style="background: #fef2f2;"' : ''}>
                                        <td>${s.dataFormatada}</td>
                                        <td>${s.horario}º</td>
                                        <td>${this.escapeHtml(s.professorAusenteNome)}</td>
                                        <td>
                                            ${this.escapeHtml(s.professorSubstitutoNome)}
                                            ${s.substitutoAusente ? '<br><span class="badge bg-danger" style="font-size:10px;">Substituto Ausente</span>' : ''}
                                        </td>
                                        <td>${this.escapeHtml(s.turma)}</td>
                                        <td>${this.escapeHtml(s.motivoLabel)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
            }
            
            html += `</div></div>`;
            container.innerHTML = html;
            
        } catch (error) {
            console.error(error);
            container.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h4>Erro</h4><p>${error.message}</p></div>`;
        }
    }
    
    exportarCSVSubstituicoes() {
        const data = this.substituicaoState.relatorioAtual;
        if (!data || data.substituicoes.length === 0) {
            this.showToast('Gere um relatório primeiro', 'warning');
            return;
        }
        
        let csv = 'Data,Horário,Professor Ausente,Professor Substituto,Substituto Ausente,Turma,Motivo,Observações\n';
        
        data.substituicoes.forEach(s => {
            csv += [
                `"${s.dataFormatada}"`,
                `${s.horario}º`,
                `"${(s.professorAusenteNome || '').replace(/"/g, '""')}"`,
                `"${(s.professorSubstitutoNome || '').replace(/"/g, '""')}"`,
                `"${s.substitutoAusente ? 'SIM' : 'NÃO'}"`,
                `"${(s.turma || '').replace(/"/g, '""')}"`,
                `"${(s.motivoLabel || '').replace(/"/g, '""')}"`,
                `"${(s.observacoes || '').replace(/"/g, '""')}"`
            ].join(',') + '\n';
        });
        
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `substituicoes_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
        
        this.showToast('✅ CSV exportado!', 'success');
    }
    
    imprimirRelatorioSubstituicoes() {
        const data = this.substituicaoState.relatorioAtual;
        if (!data || data.substituicoes.length === 0) {
            this.showToast('Gere um relatório primeiro', 'warning');
            return;
        }
        
        const html = `
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <title>Relatório de Substituições</title>
                <style>
                    @page { size: A4 landscape; margin: 10mm; }
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body { font-family: Arial, sans-serif; font-size: 10pt; }
                    .header { text-align: center; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 2px solid #1e3c72; }
                    .header h1 { font-size: 16pt; color: #1e3c72; }
                    .header h2 { font-size: 12pt; font-weight: normal; margin-top: 5px; }
                    .stats { display: flex; gap: 20px; margin-bottom: 20px; padding: 15px; background: #f0f4ff; border-radius: 8px; }
                    .stat { text-align: center; flex: 1; }
                    .stat-value { font-size: 24pt; font-weight: bold; color: #1e3c72; }
                    .stat-label { font-size: 9pt; color: #666; }
                    table { width: 100%; border-collapse: collapse; font-size: 9pt; }
                    th { background: #1e3c72; color: white; padding: 8px; text-align: left; }
                    td { padding: 6px 8px; border-bottom: 1px solid #ddd; }
                    tr:nth-child(even) { background: #f9fafb; }
                    .badge-ausente { background: #fee2e2; color: #dc2626; padding: 2px 6px; border-radius: 4px; font-size: 8pt; font-weight: bold; }
                    .footer { margin-top: 20px; text-align: center; font-size: 8pt; color: #666; }
                    .btn-print { display: block; margin: 20px auto; padding: 12px 30px; background: #1e3c72; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; }
                    @media print { .no-print { display: none; } }
                </style>
            </head>
            <body>
                <button class="btn-print no-print" onclick="window.print()">🖨️ Imprimir</button>
                <div class="header">
                    <h1>IEMA Pleno: São Luís - Centro</h1>
                    <h2>Relatório de Substituições de Professores</h2>
                    <p style="font-size: 9pt; margin-top: 5px;">Gerado em ${new Date().toLocaleString('pt-BR')}</p>
                </div>
                <div class="stats">
                    <div class="stat"><div class="stat-value">${data.total}</div><div class="stat-label">Total</div></div>
                    <div class="stat"><div class="stat-value">${Object.keys(data.estatisticas.porTurma).length}</div><div class="stat-label">Turmas</div></div>
                    <div class="stat"><div class="stat-value">${Object.keys(data.estatisticas.porProfessor).length}</div><div class="stat-label">Professores</div></div>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>Data</th><th>Horário</th><th>Professor Ausente</th>
                            <th>Professor Substituto</th><th>Turma</th><th>Motivo</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.substituicoes.map(s => `
                            <tr>
                                <td>${s.dataFormatada}</td>
                                <td>${s.horario}º</td>
                                <td>${this.escapeHtml(s.professorAusenteNome)}</td>
                                <td>
                                    ${this.escapeHtml(s.professorSubstitutoNome)}
                                    ${s.substitutoAusente ? '<br><span class="badge-ausente">⚠️ Substituto Ausente</span>' : ''}
                                </td>
                                <td>${this.escapeHtml(s.turma)}</td>
                                <td>${this.escapeHtml(s.motivoLabel)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <div class="footer">
                    <p>EducaPleno - Setor Pedagógico</p>
                </div>
            </body>
            </html>
        `;
        
        const win = window.open('', '_blank');
        win.document.write(html);
        win.document.close();
        win.onload = () => setTimeout(() => win.print(), 500);
    }
    
    // ============ NOTIFICAÇÕES ============
    async carregarNotificacoes() {
        try {
            const countResponse = await fetch('/api/notificacoes/nao-lidas/contador', { headers: { 'Authorization': `Bearer ${this.token}` } });
            if (countResponse.ok) {
                const countData = await countResponse.json();
                this.atualizarBadgesNotificacoes(countData.count || 0);
            }
            const response = await fetch('/api/notificacoes?limite=20', { headers: { 'Authorization': `Bearer ${this.token}` } });
            const data = await response.json();
            if (data.success) {
                this.notificacoes = data.notificacoes || [];
                this.renderizarNotificacoes();
            }
        } catch (error) {
            console.error('Erro ao carregar notificações:', error);
        }
    }
    
    atualizarBadgesNotificacoes(total) {
        const badge = document.getElementById('notificacaoBadge');
        if (badge) {
            if (total > 0) {
                badge.textContent = total > 99 ? '99+' : total;
                badge.style.display = 'inline';
            } else {
                badge.style.display = 'none';
            }
        }
    }
    
    renderizarNotificacoes() {
        const list = document.getElementById('notificacoesList');
        if (!list) return;
        if (!this.notificacoes || this.notificacoes.length === 0) {
            list.innerHTML = `<div class="empty-notificacoes"><i class="fas fa-bell-slash"></i><p>Nenhuma notificação</p></div>`;
            return;
        }
        let html = '';
        this.notificacoes.slice(0, 10).forEach(notif => {
            const data = new Date(notif.createdAt);
            const agora = new Date();
            const diffMin = Math.floor((agora - data) / 60000);
            let tempoTexto = diffMin < 1 ? 'agora mesmo' : diffMin < 60 ? `há ${diffMin} min` : diffMin < 1440 ? `há ${Math.floor(diffMin / 60)} h` : `há ${Math.floor(diffMin / 1440)} d`;
            const naoLida = !notif.lida ? 'nao-lida' : '';
            html += `<div class="notificacao-item ${naoLida}" data-id="${notif._id}" onclick="setorPedagogico.verNotificacao('${notif._id}')"><div class="notificacao-titulo"><span class="notificacao-icone" style="background: ${notif.cor || '#3498db'}20; color: ${notif.cor || '#3498db'};"><i class="fas ${notif.icone || 'fa-bell'}"></i></span>${notif.titulo || 'Notificação'}</div><div class="notificacao-mensagem">${notif.mensagem || ''}</div><div class="notificacao-tempo"><i class="far fa-clock"></i> ${tempoTexto}</div><div class="notificacao-actions"><button onclick="event.stopPropagation(); setorPedagogico.marcarLida('${notif._id}')" title="Marcar como lida"><i class="fas fa-check"></i></button><button class="delete" onclick="event.stopPropagation(); setorPedagogico.excluirNotificacao('${notif._id}')" title="Excluir"><i class="fas fa-trash"></i></button></div></div>`;
        });
        list.innerHTML = html;
    }
    
    abrirPainelNotificacoes() {
        const panel = document.getElementById('notificacoesPanel');
        if (panel) {
            panel.classList.toggle('active');
            this.carregarNotificacoes();
        }
    }
    
    fecharPainelNotificacoes() {
        const panel = document.getElementById('notificacoesPanel');
        if (panel) panel.classList.remove('active');
    }
    
    async marcarLida(id) {
        try {
            const response = await fetch(`/api/notificacoes/${id}/lida`, { method: 'PUT', headers: { 'Authorization': `Bearer ${this.token}` } });
            const data = await response.json();
            if (data.success) await this.carregarNotificacoes();
        } catch (error) { console.error('Erro ao marcar como lida:', error); }
    }
    
    async marcarTodasLidas() {
        try {
            const response = await fetch('/api/notificacoes/marcar-todas-lidas', { method: 'PUT', headers: { 'Authorization': `Bearer ${this.token}` } });
            const data = await response.json();
            if (data.success) {
                await this.carregarNotificacoes();
                this.showToast('✅ Todas notificações marcadas como lidas', 'success');
            }
        } catch (error) { console.error('Erro ao marcar todas como lidas:', error); }
    }
    
    async excluirNotificacao(id) {
        try {
            const response = await fetch(`/api/notificacoes/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${this.token}` } });
            const data = await response.json();
            if (data.success) {
                await this.carregarNotificacoes();
                this.showToast('✅ Notificação excluída', 'success');
            }
        } catch (error) { console.error('Erro ao excluir notificação:', error); }
    }
    
    async verNotificacao(id) {
        await this.marcarLida(id);
        const notif = this.notificacoes.find(n => n._id === id);
        if (notif && notif.link) window.location.href = notif.link;
    }

    // ============ ADAPTAÇÃO DE DOCUMENTOS ============
    async abrirModalUploadAdaptarDocumento() {
        let modal = document.getElementById('modalAdaptacaoDocumento');
        if (!modal) {
            modal = document.createElement('div');
            modal.className = 'modal';
            modal.id = 'modalAdaptacaoDocumento';
            document.body.appendChild(modal);
        }
        
        modal.innerHTML = `
            <div class="modal-dialog modal-dialog-centered" style="max-width: 600px; margin: auto;">
                <div class="modal-content" style="border-radius: 24px; overflow: hidden; max-height: 85vh; display: flex; flex-direction: column;">
                    <div class="modal-header" style="background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white; padding: 20px 25px; border: none; flex-shrink: 0;">
                        <h5 class="modal-title fw-bold" style="display: flex; align-items: center; gap: 10px;">
                            <i class="fas fa-universal-access"></i> Adaptar Documento
                        </h5>
                        <button type="button" class="btn-close btn-close-white" onclick="setorPedagogico.fecharModalAdaptacaoDocumento()"></button>
                    </div>
                    
                    <div style="flex: 1; overflow-y: auto; padding: 25px;">
                        <div class="upload-area" 
                            onclick="document.getElementById('fileInputAdaptarSetor').click()"
                            ondrop="setorPedagogico.handleDropAdaptar(event)"
                            ondragover="setorPedagogico.handleDragOverAdaptar(event)"
                            style="background: #f8fafc; border: 3px dashed #cbd5e0; border-radius: 16px; padding: 40px; text-align: center; cursor: pointer; transition: all 0.3s;">
                            <i class="fas fa-cloud-upload-alt" style="font-size: 48px; color: #8b5cf6; margin-bottom: 15px;"></i>
                            <h4 style="margin: 0 0 5px;">Arraste ou clique para enviar</h4>
                            <p style="margin: 0; color: #718096;">PDF, DOCX, DOC (até 10MB)</p>
                            <p style="margin-top: 10px; font-size: 12px; color: #f59e0b;">
                                <i class="fas fa-info-circle"></i> Mantém 100% da formatação original
                            </p>
                        </div>
                        <input type="file" id="fileInputAdaptarSetor" style="display: none;" accept=".pdf,.docx,.doc" onchange="setorPedagogico.handleFileSelectAdaptar(event)">
                        
                        <div id="previewArquivoSetor" style="display: none; margin-top: 20px; padding: 15px; background: #f1f5f9; border-radius: 12px;">
                            <div style="display: flex; align-items: center; gap: 15px;">
                                <i id="fileIconSetor" class="fas fa-file-word" style="font-size: 40px; color: #2b5797;"></i>
                                <div style="flex: 1;">
                                    <div><strong id="nomeArquivoSetor">-</strong></div>
                                    <div><small id="tamanhoArquivoSetor">-</small></div>
                                </div>
                                <button onclick="setorPedagogico.removerArquivoAdaptar()" style="background: #fee2e2; border: none; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; color: #dc2626;">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        </div>
                        
                        <div id="opcoesAdaptacaoSetor" style="display: none; margin-top: 20px;">
                            <div style="background: #f8fafc; border-radius: 16px; padding: 20px; border: 2px solid #e5e7eb;">
                                <h3 style="margin: 0 0 15px; display: flex; align-items: center; gap: 8px;">
                                    <i class="fas fa-universal-access" style="color: #10b981;"></i>
                                    Opções de Acessibilidade
                                </h3>
                                
                                <div style="display: flex; flex-direction: column; gap: 15px;">
                                    <div style="background: #f1f5f9; padding: 15px; border-radius: 12px;">
                                        <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                                            <input type="checkbox" id="optFonteAmpliadaSetor" onchange="setorPedagogico.toggleSliderFonte()" style="width: 18px; height: 18px;">
                                            <div>
                                                <strong style="font-size: 1rem;">🔍 Fonte Ampliada</strong>
                                                <p style="margin: 5px 0 0; font-size: 0.85rem; color: #6b7280;">Aumenta o tamanho da fonte</p>
                                            </div>
                                        </label>
                                        <div id="sliderFonteSetor" style="display: none; margin-top: 15px; padding-top: 10px; border-top: 1px solid #e5e7eb;">
                                            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                                                <span>Normal (12pt)</span>
                                                <span id="fonteValueSetor">18pt</span>
                                                <span>Grande (24pt)</span>
                                            </div>
                                            <input type="range" id="fonteSliderSetor" min="12" max="24" step="1" value="18" style="width: 100%;">
                                        </div>
                                    </div>
                                    
                                    <div style="background: #f1f5f9; padding: 15px; border-radius: 12px;">
                                        <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                                            <input type="checkbox" id="optCaixaAltaSetor" style="width: 18px; height: 18px;">
                                            <div>
                                                <strong style="font-size: 1rem;">🔠 CAIXA ALTA (Maiúsculas)</strong>
                                                <p style="margin: 5px 0 0; font-size: 0.85rem; color: #6b7280;">Converte todo o texto para maiúsculas</p>
                                            </div>
                                        </label>
                                    </div>
                                    
                                    <div style="background: #f1f5f9; padding: 15px; border-radius: 12px;">
                                        <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                                            <input type="checkbox" id="optNegritoSetor" style="width: 18px; height: 18px;">
                                            <div>
                                                <strong style="font-size: 1rem;">🔤 Negrito</strong>
                                                <p style="margin: 5px 0 0; font-size: 0.85rem; color: #6b7280;">Deixa o texto em negrito</p>
                                            </div>
                                        </label>
                                    </div>
                                    
                                    <div style="background: #f1f5f9; padding: 15px; border-radius: 12px;">
                                        <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                                            <input type="checkbox" id="optAltoContrasteSetor" style="width: 18px; height: 18px;">
                                            <div>
                                                <strong style="font-size: 1rem;">🎨 Alto Contraste</strong>
                                                <p style="margin: 5px 0 0; font-size: 0.85rem; color: #6b7280;">Fundo escuro com texto claro</p>
                                            </div>
                                        </label>
                                    </div>
                                    
                                    <div style="background: #f1f5f9; padding: 15px; border-radius: 12px;">
                                        <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                                            <input type="checkbox" id="optFonteDislexiaSetor" style="width: 18px; height: 18px;">
                                            <div>
                                                <strong style="font-size: 1rem;">📖 Fonte para Dislexia</strong>
                                                <p style="margin: 5px 0 0; font-size: 0.85rem; color: #6b7280;">Utiliza fonte OpenDyslexic</p>
                                            </div>
                                        </label>
                                    </div>
                                </div>
                                
                                <div style="margin-top: 20px; padding: 12px; background: #fef3c7; border-radius: 12px;">
                                    <p style="margin: 0; font-size: 0.85rem;">
                                        <i class="fas fa-lightbulb"></i> 
                                        <strong>Processado pelo Google Docs!</strong> Mantém 100% da formatação original.
                                    </p>
                                </div>
                            </div>
                        </div>
                        
                        <div id="processandoMsgSetor" style="display: none; margin-top: 20px; padding: 15px; background: #e6f7ff; border-radius: 12px; text-align: center;">
                            <i class="fas fa-spinner fa-spin" style="font-size: 20px; color: #1890ff;"></i>
                            <span style="margin-left: 10px;">Processando documento no Google Docs...</span>
                            <div style="font-size: 12px; color: #666; margin-top: 8px;">Isso pode levar alguns segundos</div>
                        </div>
                    </div>
                    
                    <div class="modal-footer" style="padding: 15px 20px; border-top: 1px solid #dee2e6; display: flex; justify-content: flex-end; gap: 10px; flex-shrink: 0;">
                        <button type="button" class="btn btn-secondary" onclick="setorPedagogico.fecharModalAdaptacaoDocumento()" style="border-radius: 12px; padding: 10px 20px;">Cancelar</button>
                        <button type="button" class="btn btn-primary" id="btnAplicarAdaptacoesSetor" onclick="setorPedagogico.aplicarAdaptacoesComGoogle()" style="border-radius: 12px; padding: 10px 20px; background: linear-gradient(135deg, #8b5cf6, #7c3aed);">
                            <i class="fas fa-magic"></i> Aplicar Adaptações
                        </button>
                    </div>
                </div>
            </div>
            
            <style>
                .upload-area:hover { background: #f0f9ff !important; border-color: #8b5cf6 !important; }
                #modalAdaptacaoDocumento { background-color: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10001; }
            </style>
        `;
        
        this.arquivoSelecionadoSetor = null;
        
        const fonteCheckbox = document.getElementById('optFonteAmpliadaSetor');
        const slider = document.getElementById('fonteSliderSetor');
        const fonteValue = document.getElementById('fonteValueSetor');
        
        if (fonteCheckbox) {
            fonteCheckbox.addEventListener('change', () => {
                const sliderDiv = document.getElementById('sliderFonteSetor');
                if (sliderDiv) sliderDiv.style.display = fonteCheckbox.checked ? 'block' : 'none';
            });
        }
        
        if (slider) {
            slider.addEventListener('input', () => {
                if (fonteValue) fonteValue.textContent = slider.value + 'pt';
            });
        }
        
        modal.style.display = 'flex';
    }

    fecharModalAdaptacaoDocumento() {
        const modal = document.getElementById('modalAdaptacaoDocumento');
        if (modal) modal.style.display = 'none';
        this.arquivoSelecionadoSetor = null;
    }

    handleDropAdaptar(e) {
        e.preventDefault();
        const area = e.currentTarget;
        area.style.background = '';
        area.style.borderColor = '#cbd5e0';
        const files = e.dataTransfer.files;
        if (files.length > 0) this.processarArquivoAdaptar(files[0]);
    }

    handleDragOverAdaptar(e) {
        e.preventDefault();
        const area = e.currentTarget;
        area.style.background = '#f0f9ff';
        area.style.borderColor = '#8b5cf6';
    }

    handleFileSelectAdaptar(e) {
        const files = e.target.files;
        if (files.length > 0) this.processarArquivoAdaptar(files[0]);
    }

    processarArquivoAdaptar(file) {
        const extensoes = ['pdf', 'docx', 'doc'];
        const ext = file.name.split('.').pop().toLowerCase();
        
        if (!extensoes.includes(ext)) {
            this.showToast('❌ Tipo de arquivo não suportado', 'error');
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            this.showToast('❌ Arquivo muito grande. Máximo 10MB.', 'error');
            return;
        }
        
        this.arquivoSelecionadoSetor = file;
        
        const fileIcon = document.getElementById('fileIconSetor');
        if (fileIcon) {
            if (ext === 'pdf') {
                fileIcon.className = 'fas fa-file-pdf';
                fileIcon.style.color = '#dc2626';
            } else {
                fileIcon.className = 'fas fa-file-word';
                fileIcon.style.color = '#2b5797';
            }
        }
        
        document.getElementById('previewArquivoSetor').style.display = 'block';
        document.getElementById('nomeArquivoSetor').textContent = file.name;
        document.getElementById('tamanhoArquivoSetor').textContent = `${(file.size / 1024).toFixed(2)} KB`;
        document.getElementById('opcoesAdaptacaoSetor').style.display = 'block';
    }

    removerArquivoAdaptar() {
        this.arquivoSelecionadoSetor = null;
        document.getElementById('previewArquivoSetor').style.display = 'none';
        document.getElementById('opcoesAdaptacaoSetor').style.display = 'none';
        document.getElementById('fileInputAdaptarSetor').value = '';
    }

    toggleSliderFonte() {
        const slider = document.getElementById('sliderFonteSetor');
        if (slider) {
            slider.style.display = document.getElementById('optFonteAmpliadaSetor').checked ? 'block' : 'none';
        }
    }

    async aplicarAdaptacoesComGoogle() {
        if (!this.arquivoSelecionadoSetor) {
            this.showToast('❌ Nenhum arquivo selecionado', 'error');
            return;
        }
        
        const opcoes = {
            caixa_alta: document.getElementById('optCaixaAltaSetor')?.checked || false,
            negrito: document.getElementById('optNegritoSetor')?.checked || false,
            alto_contraste: document.getElementById('optAltoContrasteSetor')?.checked || false,
            fonte_dislexia: document.getElementById('optFonteDislexiaSetor')?.checked || false,
            tamanho_fonte: document.getElementById('optFonteAmpliadaSetor')?.checked 
                ? parseInt(document.getElementById('fonteSliderSetor')?.value) || 18 
                : 12
        };
        
        const nenhumaOpcao = !opcoes.caixa_alta && !opcoes.negrito && 
                            !opcoes.alto_contraste && !opcoes.fonte_dislexia && 
                            opcoes.tamanho_fonte === 12;
        
        if (nenhumaOpcao) {
            const confirmar = await confirm('Nenhuma opção de acessibilidade foi selecionada. Deseja apenas converter o documento?');
            if (!confirmar) return;
        }
        
        const processandoDiv = document.getElementById('processandoMsgSetor');
        const btnSalvar = document.getElementById('btnAplicarAdaptacoesSetor');
        
        if (processandoDiv) processandoDiv.style.display = 'block';
        if (btnSalvar) {
            btnSalvar.disabled = true;
            btnSalvar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';
        }
        
        try {
            const token = localStorage.getItem('auth_token');
            const formData = new FormData();
            formData.append('arquivo', this.arquivoSelecionadoSetor);
            formData.append('opcoes', JSON.stringify(opcoes));
            
            const response = await fetch('/api/adaptar-documento', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });
            
            const data = await response.json();
            
            if (data.success) {
                const byteCharacters = atob(data.pdf);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: 'application/pdf' });
                const url = URL.createObjectURL(blob);
                
                const novaJanela = window.open(url, '_blank');
                if (novaJanela) {
                    novaJanela.onload = () => setTimeout(() => novaJanela.print(), 1000);
                    this.fecharModalAdaptacaoDocumento();
                    this.showToast('✅ Documento adaptado! Aguardando impressão...', 'success');
                } else {
                    this.showToast('⚠️ Permita pop-ups para abrir o documento', 'warning');
                }
            } else {
                throw new Error(data.error || 'Erro ao processar documento');
            }
        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('❌ ' + error.message, 'error');
        } finally {
            if (processandoDiv) processandoDiv.style.display = 'none';
            if (btnSalvar) {
                btnSalvar.disabled = false;
                btnSalvar.innerHTML = '<i class="fas fa-magic"></i> Aplicar Adaptações';
            }
        }
    }
    
    // ============ RELATÓRIOS ============
    async loadRelatorios() {
        const content = document.getElementById('content');
        content.innerHTML = '<div class="text-center py-5"><div class="loading"></div><p class="mt-3 text-muted">Carregando relatórios...</p></div>';
        
        try {
            const data = await this.apiRequest('/api/setor-pedagogico/relatorio/acessibilidade');
            if (data.success) {
                const r = data.relatorio;
                content.innerHTML = `
                    <div class="filtros-card">
                        <h5 class="fw-bold mb-3"><i class="fas fa-chart-bar me-2 text-primary"></i> Gerar Relatório de Alunos com Acessibilidade</h5>
                        <div class="row g-3">
                            <div class="col-md-3">
                                <label class="fw-semibold mb-2">Condição</label>
                                <select class="form-select" id="relatorioCondicao">
                                    <option value="">Todas</option>
                                    ${this.obterListaCondicoes().map(c => `<option value="${c.valor}">${c.label}</option>`).join('')}
                                </select>
                            </div>
                            <div class="col-md-3">
                                <label class="fw-semibold mb-2">Turma</label>
                                <input type="text" class="form-control" id="relatorioTurma" placeholder="Nome da turma">
                            </div>
                            <div class="col-md-3">
                                <label class="fw-semibold mb-2">Curso</label>
                                <input type="text" class="form-control" id="relatorioCurso" placeholder="Nome do curso">
                            </div>
                            <div class="col-md-3 d-flex align-items-end">
                                <button class="btn btn-primary w-100" onclick="setorPedagogico.gerarRelatorioFiltrado()">
                                    <i class="fas fa-chart-bar me-2"></i> Gerar Relatório
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <div class="row g-4 mt-2">
                        <div class="col-md-6">
                            <div class="card h-100">
                                <div class="card-header bg-white border-0 pt-4 px-4">
                                    <h5 class="mb-0 fw-bold"><i class="fas fa-chart-pie me-2 text-primary"></i> Resumo Geral</h5>
                                </div>
                                <div class="card-body px-4 pb-4">
                                    <p><strong>Data de geração:</strong> ${new Date(r.dataGeracao).toLocaleString('pt-BR')}</p>
                                    <p><strong>Total de alunos com acessibilidade:</strong> <span class="fw-bold fs-4 text-primary">${r.totalAlunos}</span></p>
                                    <hr>
                                    <h6 class="fw-bold">Distribuição por Condição:</h6>
                                    <ul class="list-unstyled">
                                        ${r.porCondicao.map(c => `<li class="mb-2"><span class="badge-acessibilidade me-2">${c.condicao}</span> ${c.total} aluno(s)</li>`).join('')}
                                    </ul>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <div class="card h-100">
                                <div class="card-header bg-white border-0 pt-4 px-4">
                                    <h5 class="mb-0 fw-bold"><i class="fas fa-download me-2 text-success"></i> Exportar</h5>
                                </div>
                                <div class="card-body px-4 pb-4">
                                    <div class="d-grid gap-3">
                                        <button class="btn btn-print py-3" onclick="setorPedagogico.imprimirRelatorioAtual()">
                                            <i class="fas fa-print me-2"></i> Imprimir Relatório
                                        </button>
                                        <button class="btn btn-outline-primary py-3" onclick="setorPedagogico.exportarRelatorioCSV()">
                                            <i class="fas fa-file-csv me-2"></i> Exportar para CSV
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="table-container mt-4">
                        <div class="table-header">
                            <h5 class="mb-0 fw-bold"><i class="fas fa-users me-2 text-primary"></i> Alunos por Turma</h5>
                        </div>
                        ${r.porTurma.map(turma => `
                            <div class="mt-4 px-4 pb-4">
                                <h6 class="fw-bold mb-3"><i class="fas fa-school me-2 text-warning"></i> ${turma.turma} <span class="badge bg-primary ms-2">${turma.total} alunos</span></h6>
                                <div class="table-responsive">
                                    <table class="table table-sm">
                                        <thead class="table-light"><tr><th>Nome</th><th>Matrícula</th><th>Condição</th><th>Detalhes</th></tr></thead>
                                        <tbody>
                                            ${turma.alunos.map(a => `<tr><td>${a.nome}</td><td>${a.matricula || '-'}</td><td>${a.condicao}</td><td>${a.detalhes || '-'}</td></tr>`).join('')}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        `).join('')}
                        ${r.porTurma.length === 0 ? '<div class="text-center text-muted py-5">Nenhum dado disponível</div>' : ''}
                    </div>
                `;
                window.relatorioData = r;
            }
        } catch (error) {
            console.error('Erro ao carregar relatórios:', error);
            content.innerHTML = '<div class="alert alert-danger">Erro ao carregar relatórios</div>';
        }
    }
    
    async gerarRelatorioFiltrado() {
        const condicao = document.getElementById('relatorioCondicao')?.value || '';
        const turma = document.getElementById('relatorioTurma')?.value || '';
        const curso = document.getElementById('relatorioCurso')?.value || '';
        let url = '/api/setor-pedagogico/relatorio/acessibilidade?';
        if (condicao) url += `condicao=${condicao}&`;
        if (turma) url += `turma=${turma}&`;
        if (curso) url += `curso=${curso}&`;
        try {
            const data = await this.apiRequest(url);
            if (data.success) {
                window.relatorioData = data.relatorio;
                alert(`✅ Relatório gerado com ${data.relatorio.totalAlunos} alunos`);
                this.loadRelatorios();
            }
        } catch (error) {
            console.error('Erro:', error);
            alert('Erro ao gerar relatório filtrado');
        }
    }
    
    imprimirRelatorioAtual() {
        if (!window.relatorioData) { alert('Nenhum relatório carregado'); return; }
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`<!DOCTYPE html><html><head><title>Relatório Acessibilidade - EducaPleno</title><style>body{font-family:Arial,sans-serif;padding:40px}h1{color:#4f46e5}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background-color:#f3f4f6}.header{text-align:center;margin-bottom:30px}@media print{body{padding:20px}}</style></head><body><div class="header"><h1>Relatório de Alunos com Necessidades Especiais</h1><p>Setor Pedagógico - EducaPleno</p><p>Data: ${new Date().toLocaleString('pt-BR')}</p></div><h3>Resumo Geral</h3><p><strong>Total de alunos:</strong> ${window.relatorioData.totalAlunos}</p><p><strong>Distribuição por condição:</strong></p><ul>${window.relatorioData.porCondicao.map(c => `<li>${c.condicao}: ${c.total}</li>`).join('')}</ul><h3>Alunos por Turma</h3>${window.relatorioData.porTurma.map(turma => `<h4>${turma.turma} (${turma.total} alunos)</h4><table><thead><tr><th>Nome</th><th>Matrícula</th><th>Condição</th><th>Detalhes</th></tr></thead><tbody>${turma.alunos.map(a => `<tr><td>${a.nome}</td><td>${a.matricula || '-'}</td><td>${a.condicao}</td><td>${a.detalhes || '-'}</td></tr>`).join('')}</tbody></table>`).join('')}<div class="footer"><p><small>Documento gerado pelo EducaPleno</small></p></div></body></html>`);
        printWindow.document.close();
        printWindow.print();
    }
    
    exportarRelatorioCSV() {
        if (!window.relatorioData) { alert('Nenhum relatório carregado'); return; }
        let csv = "Turma,Nome,Matrícula,Condição,Detalhes\n";
        window.relatorioData.porTurma.forEach(turma => {
            turma.alunos.forEach(aluno => {
                csv += `"${turma.turma}","${aluno.nome}","${aluno.matricula || ''}","${aluno.condicao}","${aluno.detalhes || ''}"\n`;
            });
        });
        const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `relatorio_acessibilidade_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    
    obterListaCondicoes() {
        return [
            { valor: 'visual', label: 'Deficiência Visual' },
            { valor: 'auditiva', label: 'Deficiência Auditiva' },
            { valor: 'motora', label: 'Deficiência Motora' },
            { valor: 'intelectual', label: 'Deficiência Intelectual' },
            { valor: 'dislexia', label: 'Dislexia' },
            { valor: 'tdah', label: 'TDAH' },
            { valor: 'outra', label: 'Outra Condição' }
        ];
    }
    
    aplicarFiltrosAlunos() { this.loadAlunos(); }
    limparFiltrosAlunos() {
        if (document.getElementById('filtroCondicao')) document.getElementById('filtroCondicao').value = 'todos';
        if (document.getElementById('filtroTurma')) document.getElementById('filtroTurma').value = '';
        if (document.getElementById('filtroCurso')) document.getElementById('filtroCurso').value = '';
        this.loadAlunos();
    }
    aplicarFiltrosProvas() { this.loadProvas(); }
    limparFiltrosProvas() {
        if (document.getElementById('filtroTipoProva')) document.getElementById('filtroTipoProva').value = '';
        if (document.getElementById('filtroTurmaProva')) document.getElementById('filtroTurmaProva').value = '';
        if (document.getElementById('filtroStatusProva')) document.getElementById('filtroStatusProva').value = '';
        this.loadProvas();
    }
    carregarProvas() { this.loadProvas(); }
}

// ============================================================================
// INSTANCIAÇÃO GLOBAL
// ============================================================================
const setorPedagogico = new SetorPedagogico();
window.setorPedagogico = setorPedagogico;