// ============================================
// MONITORAMENTO ASSISTENTE SOCIAL - CLASSE PRINCIPAL
// Tema: Violeta
// ============================================

class MonitoramentoAssistenteSocial {
    constructor() {
        this.apiBase = '/api/assistente-social';
        this.atendimentos = [];
        this.atendimentosFiltrados = [];
        this.paginaAtual = 1;
        this.itensPorPagina = 20;
        this.graficos = {};
        this.turmasDisponiveis = [];
        
        this.TIPO_LABELS = {
            'evasao_escolar': 'Evasão Escolar',
            'desinteresse_aprendizado': 'Desinteresse pelo Aprendizado',
            'problemas_disciplina': 'Problemas com Disciplina',
            'insubordinacao_limites': 'Insubordinação a Limites',
            'vulnerabilidade_drogas': 'Vulnerabilidade às Drogas',
            'atitudes_agressivas': 'Atitudes Agressivas/Violentas',
            'baixo_rendimento': 'Baixo Rendimento Escolar',
            'encaminhamento': 'Encaminhamento',
            'intervencao': 'Intervenção',
            'atendimento': 'Atendimento',
            'outros': 'Outros'
        };
        
        this.GRAVIDADE_LABELS = {
            'baixa': 'Baixa',
            'media': 'Média',
            'alta': 'Alta',
            'critica': 'Crítica'
        };
        
        this.RESULTADO_LABELS = {
            'resolvido': 'Resolvido',
            'em_acompanhamento': 'Em Acompanhamento',
            'reincidente': 'Reincidente',
            'encaminhado': 'Encaminhado',
            'pendente': 'Pendente'
        };
    }

    async carregar() {
        console.log('🤝 Carregando Monitoramento Assistente Social...');
        
        const contentArea = document.getElementById('contentArea');
        if (!contentArea) {
            console.error('❌ contentArea não encontrado');
            return;
        }
        
        contentArea.innerHTML = this.renderLoading();
        
        try {
            const [dashboardRes, atendimentosRes] = await Promise.all([
                fetch(`${this.apiBase}/dashboard`, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
                }),
                fetch(`${this.apiBase}/atendimentos?limit=100`, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
                })
            ]);
            
            const dashboardData = await dashboardRes.json();
            const atendimentosData = await atendimentosRes.json();
            
            if (!dashboardData.success) throw new Error(dashboardData.error);
            if (!atendimentosData.success) throw new Error(atendimentosData.error);
            
            this.dashboard = dashboardData;
            this.atendimentos = atendimentosData.atendimentos || [];
            this.atendimentosFiltrados = [...this.atendimentos];
            
            // Busca turmas direto dos alunos
            try {
                const turmasRes = await fetch(`${this.apiBase}/turmas`, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
                });
                const turmasData = await turmasRes.json();
                this.turmasDisponiveis = turmasData.success 
                    ? turmasData.turmas 
                    : (atendimentosData.turmasDisponiveis || []);
            } catch (e) {
                this.turmasDisponiveis = atendimentosData.turmasDisponiveis || [];
            }
            
            contentArea.innerHTML = this.renderPrincipal();
            
            setTimeout(() => {
                this.inicializarGraficos();
                this.renderizarTabelaAtendimentos();
                this.configurarEventos();
            }, 100);
            
            if (this._interval) clearInterval(this._interval);
            this._interval = setInterval(() => this.atualizarDados(), 30000);
            
        } catch (error) {
            console.error('❌ Erro:', error);
            contentArea.innerHTML = this.renderErro(error.message);
        }
    }

    renderLoading() {
        return `
            <div style="text-align: center; padding: 60px; background: white; border-radius: 12px;">
                <div style="width: 50px; height: 50px; border: 5px solid #f3f3f3; border-top: 5px solid #8b5cf6; border-radius: 50%; margin: 0 auto 20px; animation: spin 1s linear infinite;"></div>
                <p style="color: #6b7280;">Carregando dados de Assistente Social...</p>
            </div>
            <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
        `;
    }

    renderErro(mensagem) {
        return `
            <div style="text-align: center; padding: 60px; background: white; border-radius: 12px;">
                <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #dc3545; margin-bottom: 20px;"></i>
                <h3 style="color: #721c24;">Erro ao carregar dados</h3>
                <p style="color: #6c757d;">${mensagem}</p>
                <button onclick="monitoramentoAssistenteSocial.carregar()" style="
                    background: #8b5cf6;
                    color: white;
                    border: none;
                    padding: 10px 30px;
                    border-radius: 8px;
                    cursor: pointer;
                    margin-top: 20px;
                ">
                    <i class="fas fa-sync-alt"></i> Tentar novamente
                </button>
            </div>
        `;
    }

    renderPrincipal() {
        const stats = this.dashboard?.metricas || {};
        
        return `
            <div class="assistente-social-monitoramento">
                <div class="monitoring-header">
                    <div class="header-left">
                        <div class="header-icon">
                            <i class="fas fa-hands-helping"></i>
                        </div>
                        <div class="header-text">
                            <h1>🤝 Assistente Social - Monitoramento</h1>
                            <p>Ocorrências, atendimentos e acompanhamento social</p>
                        </div>
                    </div>
                    
                    <div class="header-actions">
                        <button class="btn-refresh" onclick="monitoramentoAssistenteSocial.atualizarDados()">
                            <i class="fas fa-sync-alt"></i> Atualizar
                        </button>
                        <button class="btn-export" onclick="monitoramentoAssistenteSocial.exportarCSV()">
                            <i class="fas fa-download"></i> Exportar CSV
                        </button>
                    </div>
                </div>

                <div class="stats-grid">
                    <div class="stat-card primary" onclick="monitoramentoAssistenteSocial.filtrarPorStatus('todos')">
                        <div class="stat-icon"><i class="fas fa-calendar-day"></i></div>
                        <div class="stat-content">
                            <span class="stat-label">Hoje</span>
                            <span class="stat-value">${stats.hoje || 0}</span>
                            <span class="stat-detail">ocorrências</span>
                        </div>
                    </div>

                    <div class="stat-card success" onclick="monitoramentoAssistenteSocial.filtrarPorStatus('finalizado')">
                        <div class="stat-icon"><i class="fas fa-check-circle"></i></div>
                        <div class="stat-content">
                            <span class="stat-label">Finalizados</span>
                            <span class="stat-value">${stats.finalizadosHoje || 0}</span>
                            <span class="stat-detail">hoje</span>
                        </div>
                    </div>

                    <div class="stat-card warning" onclick="monitoramentoAssistenteSocial.filtrarPorStatus('em_andamento')">
                        <div class="stat-icon"><i class="fas fa-clock"></i></div>
                        <div class="stat-content">
                            <span class="stat-label">Em Andamento</span>
                            <span class="stat-value">${stats.emAndamento || 0}</span>
                            <span class="stat-detail">aguardando</span>
                        </div>
                    </div>

                    <div class="stat-card info">
                        <div class="stat-icon"><i class="fas fa-calendar-week"></i></div>
                        <div class="stat-content">
                            <span class="stat-label">Esta Semana</span>
                            <span class="stat-value">${stats.semana || 0}</span>
                            <span class="stat-detail">ocorrências</span>
                        </div>
                    </div>

                    <div class="stat-card">
                        <div class="stat-icon"><i class="fas fa-calendar-alt"></i></div>
                        <div class="stat-content">
                            <span class="stat-label">Este Mês</span>
                            <span class="stat-value">${stats.mes || 0}</span>
                            <span class="stat-detail">ocorrências</span>
                        </div>
                    </div>

                    <div class="stat-card">
                        <div class="stat-icon"><i class="fas fa-chart-line"></i></div>
                        <div class="stat-content">
                            <span class="stat-label">Total Geral</span>
                            <span class="stat-value">${stats.total || 0}</span>
                            <span class="stat-detail">registros</span>
                        </div>
                    </div>
                </div>

                <div class="charts-row">
                    <div class="chart-card">
                        <h3><i class="fas fa-chart-bar"></i> Por Tipo de Tarefa</h3>
                        <canvas id="chartTipos"></canvas>
                    </div>
                    <div class="chart-card">
                        <h3><i class="fas fa-chart-pie"></i> Por Gravidade</h3>
                        <canvas id="chartGravidade"></canvas>
                    </div>
                    <div class="chart-card">
                        <h3><i class="fas fa-chart-line"></i> Atendimentos por Dia</h3>
                        <canvas id="chartAtendimentos"></canvas>
                    </div>
                    <div class="chart-card">
                        <h3><i class="fas fa-chart-bar"></i> Por Turma</h3>
                        <canvas id="chartTurmas"></canvas>
                    </div>
                </div>

                <div class="reincidentes-card">
                    <h3><i class="fas fa-exclamation-triangle text-warning"></i> Alunos Reincidentes (2+ ocorrências)</h3>
                    <div class="reincidentes-list" id="reincidentesList">
                        ${this.renderAlunosReincidentes()}
                    </div>
                </div>

                <div class="filters-card">
                    <div class="filters-header">
                        <div class="filters-title">
                            <i class="fas fa-sliders-h"></i>
                            <h3>Filtros</h3>
                        </div>
                        <span class="filters-badge" id="resultadosBadge">${this.atendimentosFiltrados.length} registros</span>
                    </div>
                    
                    <div class="filters-grid">
                        <div class="filter-group">
                            <label><i class="fas fa-search"></i> Buscar Aluno</label>
                            <input type="text" id="buscaAtendimento" placeholder="Nome do aluno..." class="filter-input">
                        </div>
                        
                        <div class="filter-group">
                            <label><i class="fas fa-filter"></i> Status</label>
                            <select id="filtroStatus" class="filter-select">
                                <option value="todos">Todos</option>
                                <option value="em_andamento">Em andamento</option>
                                <option value="finalizado">Finalizados</option>
                            </select>
                        </div>
                        
                        <div class="filter-group">
                            <label><i class="fas fa-tasks"></i> Tipo de Tarefa</label>
                            <select id="filtroTipo" class="filter-select">
                                <option value="todos">Todos os tipos</option>
                                <option value="evasao_escolar">Evasão Escolar</option>
                                <option value="desinteresse_aprendizado">Desinteresse pelo Aprendizado</option>
                                <option value="problemas_disciplina">Problemas com Disciplina</option>
                                <option value="insubordinacao_limites">Insubordinação a Limites</option>
                                <option value="vulnerabilidade_drogas">Vulnerabilidade às Drogas</option>
                                <option value="atitudes_agressivas">Atitudes Agressivas/Violentas</option>
                                <option value="baixo_rendimento">Baixo Rendimento Escolar</option>
                                <option value="encaminhamento">Encaminhamento</option>
                                <option value="intervencao">Intervenção</option>
                                <option value="atendimento">Atendimento</option>
                                <option value="outros">Outros</option>
                            </select>
                        </div>
                        
                        <div class="filter-group">
                            <label><i class="fas fa-exclamation-circle"></i> Gravidade</label>
                            <select id="filtroGravidade" class="filter-select">
                                <option value="todas">Todas</option>
                                <option value="baixa">Baixa</option>
                                <option value="media">Média</option>
                                <option value="alta">Alta</option>
                                <option value="critica">Crítica</option>
                            </select>
                        </div>
                        
                        <div class="filter-group">
                            <label><i class="fas fa-school"></i> Turma</label>
                            <select id="filtroTurma" class="filter-select">
                                <option value="todas">Todas as turmas</option>
                                ${this.turmasDisponiveis.map(t => `<option value="${t}">${t}</option>`).join('')}
                            </select>
                        </div>
                        
                        <div class="filter-actions">
                            <button class="btn-filter" onclick="monitoramentoAssistenteSocial.aplicarFiltros()">
                                <i class="fas fa-filter"></i> Filtrar
                            </button>
                            <button class="btn-filter btn-clear" onclick="monitoramentoAssistenteSocial.limparFiltros()">
                                <i class="fas fa-eraser"></i> Limpar
                            </button>
                        </div>
                    </div>
                </div>

                <div class="table-container">
                    <div class="table-header">
                        <h3><i class="fas fa-list"></i> Histórico de Ocorrências</h3>
                        <div class="table-info">
                            <span id="itemsCounter">${this.atendimentosFiltrados.length} registros</span>
                        </div>
                    </div>
                    
                    <div class="table-responsive">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Aluno</th>
                                    <th>Turma</th>
                                    <th>Tipo</th>
                                    <th>Descrição</th>
                                    <th>Gravidade</th>
                                    <th>Entrada</th>
                                    <th>Status</th>
                                    <th>Resultado</th>
                                    <th>Ações</th>
                                </tr>
                            </thead>
                            <tbody id="tabelaAtendimentosBody">
                                ${this.renderLinhasAtendimentos(this.atendimentosFiltrados.slice(0, this.itensPorPagina))}
                            </tbody>
                        </table>
                    </div>
                    
                    <div class="pagination-container" id="paginacao">
                        <button class="btn-page" onclick="monitoramentoAssistenteSocial.paginaAnterior()" id="btnAnterior" disabled>‹ Anterior</button>
                        <span class="page-info" id="pageInfo">Página 1 de 1</span>
                        <button class="btn-page" onclick="monitoramentoAssistenteSocial.proximaPagina()" id="btnProxima" disabled>Próxima ›</button>
                    </div>
                </div>
            </div>

            <style>
                .assistente-social-monitoramento { padding: 24px; max-width: 1400px; margin: 0 auto; }
                
                .monitoring-header {
                    background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
                    border-radius: 20px;
                    padding: 30px;
                    margin-bottom: 30px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    flex-wrap: wrap;
                    gap: 20px;
                    box-shadow: 0 10px 30px rgba(139, 92, 246, 0.3);
                }
                
                .header-left { display: flex; align-items: center; gap: 20px; }
                .header-icon {
                    width: 70px; height: 70px;
                    background: rgba(255,255,255,0.15);
                    border-radius: 20px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 32px;
                    color: white;
                }
                .header-text h1 { color: white; font-size: 28px; font-weight: 600; margin: 0; }
                .header-text p { color: rgba(255,255,255,0.9); margin: 5px 0 0; }
                
                .btn-refresh, .btn-export {
                    padding: 12px 24px;
                    border-radius: 40px;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    border: none;
                }
                .btn-refresh { background: rgba(255,255,255,0.2); color: white; }
                .btn-export { background: white; color: #8b5cf6; }
                
                .stats-grid {
                    display: grid;
                    grid-template-columns: repeat(6, 1fr);
                    gap: 20px;
                    margin-bottom: 30px;
                }
                
                .stat-card {
                    background: white;
                    border-radius: 16px;
                    padding: 20px;
                    display: flex;
                    align-items: center;
                    gap: 20px;
                    cursor: pointer;
                    transition: all 0.3s;
                    border: 1px solid #e5e7eb;
                }
                .stat-card:hover { transform: translateY(-4px); box-shadow: 0 8px 16px rgba(0,0,0,0.1); }
                
                .stat-icon {
                    width: 60px; height: 60px;
                    border-radius: 16px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 24px;
                    color: white;
                }
                .stat-card.primary .stat-icon { background: linear-gradient(135deg, #8b5cf6, #7c3aed); }
                .stat-card.success .stat-icon { background: linear-gradient(135deg, #10b981, #059669); }
                .stat-card.warning .stat-icon { background: linear-gradient(135deg, #f59e0b, #d97706); }
                .stat-card.info .stat-icon { background: linear-gradient(135deg, #3b82f6, #2563eb); }
                .stat-card:not([class*="primary"]):not([class*="success"]):not([class*="warning"]):not([class*="info"]) .stat-icon {
                    background: linear-gradient(135deg, #a78bfa, #8b5cf6);
                }
                
                .stat-content { flex: 1; }
                .stat-label { font-size: 12px; color: #6b7280; }
                .stat-value { font-size: 28px; font-weight: 700; color: #1f2937; }
                .stat-detail { font-size: 11px; color: #9ca3af; }
                
                .charts-row {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 20px;
                    margin-bottom: 30px;
                }
                
                .chart-card {
                    background: white;
                    border-radius: 16px;
                    padding: 20px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
                }
                .chart-card h3 { margin: 0 0 15px; font-size: 16px; color: #374151; }
                .chart-card canvas { max-height: 250px; width: 100% !important; }
                
                .reincidentes-card {
                    background: white;
                    border-radius: 16px;
                    padding: 20px;
                    margin-bottom: 30px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
                }
                .reincidentes-card h3 { margin: 0 0 15px; font-size: 16px; color: #374151; }
                .reincidentes-list { display: flex; flex-wrap: wrap; gap: 10px; }
                .reincidente-item {
                    background: #fef3c7;
                    padding: 10px 16px;
                    border-radius: 12px;
                    font-size: 13px;
                    color: #92400e;
                    border: 1px solid #fcd34d;
                }
                .reincidente-count {
                    background: #dc2626;
                    color: white;
                    border-radius: 20px;
                    padding: 2px 10px;
                    margin-left: 8px;
                    font-size: 11px;
                    font-weight: 600;
                }
                
                .filters-card {
                    background: white;
                    border-radius: 16px;
                    padding: 20px;
                    margin-bottom: 30px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
                }
                .filters-header {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 20px;
                    padding-bottom: 15px;
                    border-bottom: 2px solid #f0f0f0;
                }
                .filters-title { display: flex; align-items: center; gap: 10px; }
                .filters-title h3 { margin: 0; font-size: 16px; color: #374151; }
                .filters-badge {
                    background: #8b5cf6;
                    color: white;
                    padding: 4px 12px;
                    border-radius: 30px;
                    font-size: 12px;
                }
                .filters-grid {
                    display: grid;
                    grid-template-columns: 2fr 1fr 1.5fr 1fr 1fr auto;
                    gap: 15px;
                }
                .filter-group label { font-size: 12px; font-weight: 600; color: #4b5563; display: block; margin-bottom: 5px; }
                .filter-input, .filter-select {
                    width: 100%;
                    padding: 10px 12px;
                    border: 2px solid #e5e7eb;
                    border-radius: 10px;
                    font-size: 14px;
                }
                .filter-input:focus, .filter-select:focus {
                    outline: none;
                    border-color: #8b5cf6;
                }
                .btn-filter {
                    padding: 10px 20px;
                    border: none;
                    border-radius: 12px;
                    font-size: 13px;
                    font-weight: 600;
                    cursor: pointer;
                    background: #8b5cf6;
                    color: white;
                    align-self: end;
                }
                .btn-filter.btn-clear { background: #6b7280; }
                .filter-actions { display: flex; gap: 8px; align-self: end; }
                
                .table-container {
                    background: white;
                    border-radius: 16px;
                    padding: 20px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
                }
                .table-header {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 15px;
                    padding-bottom: 15px;
                    border-bottom: 2px solid #f0f0f0;
                }
                .table-header h3 { margin: 0; font-size: 16px; color: #374151; }
                .data-table {
                    width: 100%;
                    border-collapse: collapse;
                }
                .data-table th {
                    padding: 12px;
                    text-align: left;
                    font-size: 12px;
                    font-weight: 600;
                    color: #4b5563;
                    border-bottom: 2px solid #e5e7eb;
                    background: #f9fafb;
                }
                .data-table td {
                    padding: 12px;
                    border-bottom: 1px solid #e5e7eb;
                    font-size: 13px;
                }
                .data-table tr:hover td { background: #f5f3ff; }
                
                .status-badge {
                    display: inline-block;
                    padding: 4px 10px;
                    border-radius: 30px;
                    font-size: 11px;
                    font-weight: 600;
                }
                .status-em_atendimento { background: #fef3c7; color: #92400e; }
                .status-finalizado { background: #d1fae5; color: #065f46; }
                
                .gravidade-badge {
                    display: inline-block;
                    padding: 3px 8px;
                    border-radius: 20px;
                    font-size: 10px;
                    font-weight: 600;
                    text-transform: uppercase;
                }
                .gravidade-baixa { background: #d1fae5; color: #065f46; }
                .gravidade-media { background: #fef3c7; color: #92400e; }
                .gravidade-alta { background: #fee2e2; color: #991b1b; }
                .gravidade-critica { background: #7f1d1d; color: white; }
                
                .tipo-badge {
                    display: inline-block;
                    padding: 3px 10px;
                    border-radius: 20px;
                    font-size: 10px;
                    font-weight: 600;
                    background: #ede9fe;
                    color: #5b21b6;
                }
                
                .action-buttons { display: flex; gap: 5px; }
                .btn-icon-sm {
                    width: 30px; height: 30px;
                    border: none;
                    border-radius: 6px;
                    background: transparent;
                    cursor: pointer;
                    color: #6b7280;
                }
                .btn-icon-sm:hover { background: #f3f4f6; color: #8b5cf6; }
                .btn-icon-sm.danger:hover { background: #fee2e2; color: #dc2626; }
                
                .pagination-container {
                    display: flex;
                    justify-content: center;
                    gap: 15px;
                    margin-top: 20px;
                    padding-top: 20px;
                    border-top: 1px solid #e5e7eb;
                    align-items: center;
                }
                .btn-page {
                    padding: 8px 20px;
                    border: 1px solid #e5e7eb;
                    background: white;
                    border-radius: 8px;
                    cursor: pointer;
                }
                .btn-page:disabled { opacity: 0.5; cursor: not-allowed; }
                .btn-page:hover:not(:disabled) { background: #f9fafb; border-color: #8b5cf6; color: #8b5cf6; }
                
                @media (max-width: 1024px) {
                    .stats-grid { grid-template-columns: repeat(3, 1fr); }
                    .filters-grid { grid-template-columns: 1fr 1fr; }
                    .charts-row { grid-template-columns: 1fr; }
                }
                @media (max-width: 768px) {
                    .stats-grid { grid-template-columns: repeat(2, 1fr); }
                    .monitoring-header { flex-direction: column; align-items: flex-start; }
                    .filters-grid { grid-template-columns: 1fr; }
                }
            </style>
        `;
    }

    renderAlunosReincidentes() {
        const reincidentes = this.dashboard?.tendencias?.alunosReincidentes || [];
        
        if (reincidentes.length === 0) {
            return '<p style="color: #6b7280;"><i class="fas fa-check-circle text-success"></i> Nenhum aluno reincidente nos últimos 30 dias</p>';
        }
        
        return reincidentes.map(a => `
            <div class="reincidente-item" onclick="monitoramentoAssistenteSocial.filtrarPorAluno('${a._id}')" style="cursor:pointer;">
                <i class="fas fa-user"></i> ${a.alunoNome}
                <small>(${a.alunoTurma || 'Sem turma'})</small>
                <span class="reincidente-count">${a.count} ocorrências</span>
            </div>
        `).join('');
    }

    renderLinhasAtendimentos(atendimentos) {
        if (!atendimentos || atendimentos.length === 0) {
            return `
                <tr>
                    <td colspan="9" style="text-align: center; padding: 40px;">
                        <i class="fas fa-inbox" style="font-size: 48px; color: #d1d5db;"></i>
                        <p style="margin-top: 10px;">Nenhuma ocorrência encontrada</p>
                    </td>
                </tr>
            `;
        }
        
        return atendimentos.map(a => {
            const dataEntradaFormatada = a.dataEntradaFormatada || 
                (a.dataEntrada ? new Date(a.dataEntrada).toLocaleString('pt-BR') : 'N/A');
            
            const statusClass = a.status === 'em_andamento' ? 'status-em_atendimento' : 'status-finalizado';
            const statusText = a.status === 'em_andamento' ? 'Em andamento' : 'Finalizado';
            
            const resultadoText = a.saida?.resultadoTexto || 
                (a.saida?.resultado ? this.RESULTADO_LABELS[a.saida.resultado] : '-');
            
            const descricaoCurta = a.descricao ? 
                (a.descricao.length > 40 ? a.descricao.substring(0, 40) + '...' : a.descricao) : '-';
            
            const tipoLabel = a.tipoTarefaLabel || this.TIPO_LABELS[a.tipoTarefa] || a.tipoTarefa;
            const gravidadeLabel = this.GRAVIDADE_LABELS[a.gravidade] || a.gravidade;
            
            return `
                <tr>
                    <td>
                        <strong>${a.alunoNome || '-'}</strong>
                        <br><small style="color: #6b7280;">${a.alunoMatricula || ''}</small>
                    </td>
                    <td>${a.alunoTurma || '-'}</td>
                    <td><span class="tipo-badge">${tipoLabel}</span></td>
                    <td title="${a.descricao || ''}">${descricaoCurta}</td>
                    <td><span class="gravidade-badge gravidade-${a.gravidade}">${gravidadeLabel}</span></td>
                    <td><strong>${dataEntradaFormatada}</strong></td>
                    <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                    <td>${resultadoText}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn-icon-sm" onclick="monitoramentoAssistenteSocial.verDetalhes('${a.id}')" title="Ver detalhes">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button class="btn-icon-sm" onclick="monitoramentoAssistenteSocial.editarAtendimento('${a.id}')" title="Editar">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-icon-sm danger" onclick="monitoramentoAssistenteSocial.excluirAtendimento('${a.id}', '${a.alunoNome}')" title="Excluir">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // ============================================
    // VER DETALHES
    // ============================================
    async verDetalhes(atendimentoId) {
        try {
            const response = await fetch(`${this.apiBase}/atendimento/${atendimentoId}`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
            });
            const data = await response.json();
            if (!data.success) throw new Error(data.error);
            
            const a = data.atendimento;
            const d = a.detalhes || {};
            
            let detalhesHTML = '';
            
            if (d.contextoFamiliar) detalhesHTML += `<div class="mb-2"><strong>Contexto Familiar:</strong> ${d.contextoFamiliar}</div>`;
            if (d.historicoAnterior) detalhesHTML += `<div class="mb-2"><strong>Histórico Anterior:</strong> ${d.historicoAnterior}</div>`;
            if (d.condicaoSocial) detalhesHTML += `<div class="mb-2"><strong>Condição Social:</strong> ${d.condicaoSocial}</div>`;
            if (d.encaminhadoPara) detalhesHTML += `<div class="mb-2"><strong>Encaminhado para:</strong> ${d.encaminhadoPara}</div>`;
            if (d.motivoEncaminhamento) detalhesHTML += `<div class="mb-2"><strong>Motivo:</strong> ${d.motivoEncaminhamento}</div>`;
            if (d.tipoIntervencao) detalhesHTML += `<div class="mb-2"><strong>Tipo de Intervenção:</strong> ${d.tipoIntervencao}</div>`;
            if (d.metodosUtilizados) detalhesHTML += `<div class="mb-2"><strong>Métodos:</strong> ${d.metodosUtilizados}</div>`;
            if (d.modalidadeAtendimento) detalhesHTML += `<div class="mb-2"><strong>Modalidade:</strong> ${d.modalidadeAtendimento}</div>`;
            if (d.participantesAtendimento?.length > 0) detalhesHTML += `<div class="mb-2"><strong>Participantes:</strong> ${d.participantesAtendimento.join(', ')}</div>`;
            if (d.duracaoSessao) detalhesHTML += `<div class="mb-2"><strong>Duração:</strong> ${d.duracaoSessao} min</div>`;
            if (d.tipoTarefaOutros) detalhesHTML += `<div class="mb-2"><strong>Especificação (Outros):</strong> ${d.tipoTarefaOutros}</div>`;
            if (d.providenciasTomadas) detalhesHTML += `<div class="mb-2"><strong>Providências:</strong> ${d.providenciasTomadas}</div>`;
            if (d.proximosPassos) detalhesHTML += `<div class="mb-2"><strong>Próximos Passos:</strong> ${d.proximosPassos}</div>`;
            
            const modalBody = document.getElementById('modalBody');
            modalBody.innerHTML = `
                <div style="padding: 20px; max-height: 70vh; overflow-y: auto;">
                    <div style="text-align: center; margin-bottom: 20px;">
                        <div style="width: 80px; height: 80px; background: linear-gradient(135deg, #8b5cf6, #7c3aed); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto;">
                            <i class="fas fa-hands-helping" style="font-size: 36px; color: white;"></i>
                        </div>
                        <h2 style="margin: 15px 0 5px;">${a.alunoNome}</h2>
                        <p style="color: #6b7280;">${a.alunoTurma} • ${a.alunoCurso || ''}</p>
                        <span class="tipo-badge" style="font-size: 12px; padding: 6px 14px;">${a.tipoTarefaLabel}</span>
                    </div>
                    
                    <div style="background: #f5f3ff; border-radius: 12px; padding: 15px; margin-bottom: 20px; border: 1px solid #ddd6fe;">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                            <div style="text-align: center;">
                                <div style="font-size: 11px; color: #6d28d9; margin-bottom: 4px;">ENTRADA</div>
                                <div style="font-size: 13px; font-weight: 600;">${a.entrada.dataHoraFormatada}</div>
                            </div>
                            <div style="text-align: center;">
                                <div style="font-size: 11px; color: #6d28d9; margin-bottom: 4px;">SAÍDA</div>
                                <div style="font-size: 13px; font-weight: 600;">${a.saida?.dataHoraFormatada || 'Em andamento'}</div>
                            </div>
                        </div>
                    </div>
                    
                    <div style="background: #f8fafc; border-radius: 12px; padding: 15px; margin-bottom: 15px;">
                        <h4 style="margin: 0 0 10px; font-size: 0.95rem;"><i class="fas fa-align-left" style="color: #8b5cf6;"></i> Descrição</h4>
                        <p style="margin: 0; background: white; padding: 12px; border-radius: 8px;">${a.entrada.descricao}</p>
                        ${a.entrada.observacoes ? `<p style="margin: 10px 0 0; color: #6b7280;"><strong>Obs:</strong> ${a.entrada.observacoes}</p>` : ''}
                    </div>
                    
                    ${detalhesHTML ? `
                        <div style="background: #ede9fe; border-radius: 12px; padding: 15px; margin-bottom: 15px; border: 1px solid #c4b5fd;">
                            <h4 style="margin: 0 0 10px; font-size: 0.95rem; color: #6d28d9;"><i class="fas fa-info-circle"></i> Detalhes</h4>
                            <div style="font-size: 13px;">${detalhesHTML}</div>
                        </div>
                    ` : ''}
                    
                    ${a.saida ? `
                        <div style="background: #d1fae5; border-radius: 12px; padding: 15px; border: 1px solid #10b981;">
                            <h4 style="margin: 0 0 10px; font-size: 0.95rem; color: #065f46;"><i class="fas fa-flag-checkered"></i> Resultado</h4>
                            <p><strong>${a.saida.resultadoTexto || this.RESULTADO_LABELS[a.saida.resultado] || a.saida.resultado}</strong></p>
                            ${a.saida.observacoesFinais ? `<p style="margin: 10px 0 0;">${a.saida.observacoesFinais}</p>` : ''}
                        </div>
                    ` : ''}
                </div>
            `;
            
            document.getElementById('modalTitle').innerHTML = '<i class="fas fa-info-circle"></i> Detalhes';
            document.getElementById('modalSaveBtn').style.display = 'none';
            
            if (window.admin?.openModal) window.admin.openModal();
            
        } catch (error) {
            console.error('❌ Erro:', error);
            if (window.admin?.showToast) window.admin.showToast('❌ ' + error.message, 'error');
        }
    }

    async editarAtendimento(atendimentoId) {
        alert('Função de edição será implementada em breve');
    }

    async excluirAtendimento(atendimentoId, alunoNome) {
        if (!confirm(`Excluir a ocorrência de ${alunoNome}?\n\nEsta ação não pode ser desfeita!`)) return;
        
        try {
            const response = await fetch(`${this.apiBase}/atendimento/${atendimentoId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
            });
            
            const data = await response.json();
            
            if (data.success) {
                if (window.admin?.showToast) window.admin.showToast('✅ Ocorrência excluída!', 'success');
                await this.atualizarDados();
            } else {
                throw new Error(data.error);
            }
        } catch (error) {
            console.error('❌ Erro:', error);
            if (window.admin?.showToast) window.admin.showToast('❌ ' + error.message, 'error');
        }
    }

    inicializarGraficos() {
        const tendencias = this.dashboard?.tendencias || {};
        
        const ctxTipos = document.getElementById('chartTipos')?.getContext('2d');
        if (ctxTipos && this.dashboard?.porTipo) {
            if (this.graficos.tipos) try { this.graficos.tipos.destroy(); } catch(e){}
            this.graficos.tipos = new Chart(ctxTipos, {
                type: 'bar',
                data: {
                    labels: this.dashboard.porTipo.map(t => t.label),
                    datasets: [{
                        label: 'Ocorrências',
                        data: this.dashboard.porTipo.map(t => t.count),
                        backgroundColor: ['#8b5cf6', '#7c3aed', '#6d28d9', '#5b21b6', '#a78bfa', '#c4b5fd', '#ddd6fe', '#ede9fe', '#f5f3ff', '#faf5ff', '#fdfcff'],
                        borderRadius: 8
                    }]
                },
                options: { responsive: true, maintainAspectRatio: true, indexAxis: 'y', plugins: { legend: { display: false } } }
            });
        }
        
        const ctxGravidade = document.getElementById('chartGravidade')?.getContext('2d');
        if (ctxGravidade && this.dashboard?.porGravidade) {
            if (this.graficos.gravidade) try { this.graficos.gravidade.destroy(); } catch(e){}
            const labels = { baixa: 'Baixa', media: 'Média', alta: 'Alta', critica: 'Crítica' };
            const colors = { baixa: '#10b981', media: '#f59e0b', alta: '#ef4444', critica: '#7f1d1d' };
            this.graficos.gravidade = new Chart(ctxGravidade, {
                type: 'doughnut',
                data: {
                    labels: this.dashboard.porGravidade.map(g => labels[g.gravidade] || g.gravidade),
                    datasets: [{
                        data: this.dashboard.porGravidade.map(g => g.count),
                        backgroundColor: this.dashboard.porGravidade.map(g => colors[g.gravidade] || '#6b7280')
                    }]
                },
                options: { responsive: true, maintainAspectRatio: true }
            });
        }
        
        const ctxAtendimentos = document.getElementById('chartAtendimentos')?.getContext('2d');
        if (ctxAtendimentos && tendencias.ultimos7Dias) {
            if (this.graficos.atendimentos) try { this.graficos.atendimentos.destroy(); } catch(e){}
            this.graficos.atendimentos = new Chart(ctxAtendimentos, {
                type: 'line',
                data: {
                    labels: tendencias.ultimos7Dias.map(d => d.dia),
                    datasets: [{
                        label: 'Ocorrências',
                        data: tendencias.ultimos7Dias.map(d => d.atendimentos),
                        borderColor: '#8b5cf6',
                        backgroundColor: 'rgba(139, 92, 246, 0.1)',
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: { responsive: true, maintainAspectRatio: true }
            });
        }
        
        const ctxTurmas = document.getElementById('chartTurmas')?.getContext('2d');
        if (ctxTurmas && tendencias.porTurma) {
            if (this.graficos.turmas) try { this.graficos.turmas.destroy(); } catch(e){}
            this.graficos.turmas = new Chart(ctxTurmas, {
                type: 'bar',
                data: {
                    labels: tendencias.porTurma.map(t => t.turma),
                    datasets: [{
                        label: 'Ocorrências',
                        data: tendencias.porTurma.map(t => t.count),
                        backgroundColor: '#a78bfa',
                        borderRadius: 8
                    }]
                },
                options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } } }
            });
        }
    }

    renderizarTabelaAtendimentos() {
        const inicio = (this.paginaAtual - 1) * this.itensPorPagina;
        const fim = inicio + this.itensPorPagina;
        const paginaAtendimentos = this.atendimentosFiltrados.slice(inicio, fim);
        
        const tbody = document.getElementById('tabelaAtendimentosBody');
        if (tbody) tbody.innerHTML = this.renderLinhasAtendimentos(paginaAtendimentos);
        
        this.atualizarPaginacao();
    }

    atualizarPaginacao() {
        const total = this.atendimentosFiltrados.length;
        const totalPaginas = Math.ceil(total / this.itensPorPagina);
        
        const btnAnterior = document.getElementById('btnAnterior');
        const btnProxima = document.getElementById('btnProxima');
        const pageInfo = document.getElementById('pageInfo');
        const itemsCounter = document.getElementById('itemsCounter');
        
        if (btnAnterior) btnAnterior.disabled = this.paginaAtual === 1;
        if (btnProxima) btnProxima.disabled = this.paginaAtual >= totalPaginas;
        if (pageInfo) pageInfo.textContent = `Página ${this.paginaAtual} de ${totalPaginas || 1}`;
        if (itemsCounter) itemsCounter.textContent = `${total} registros`;
    }

    paginaAnterior() {
        if (this.paginaAtual > 1) {
            this.paginaAtual--;
            this.renderizarTabelaAtendimentos();
        }
    }

    proximaPagina() {
        const totalPaginas = Math.ceil(this.atendimentosFiltrados.length / this.itensPorPagina);
        if (this.paginaAtual < totalPaginas) {
            this.paginaAtual++;
            this.renderizarTabelaAtendimentos();
        }
    }

    aplicarFiltros() {
        const busca = document.getElementById('buscaAtendimento')?.value.toLowerCase() || '';
        const status = document.getElementById('filtroStatus')?.value || 'todos';
        const tipo = document.getElementById('filtroTipo')?.value || 'todos';
        const gravidade = document.getElementById('filtroGravidade')?.value || 'todas';
        const turma = document.getElementById('filtroTurma')?.value || 'todas';
        
        this.atendimentosFiltrados = this.atendimentos.filter(a => {
            const matchBusca = busca === '' || a.alunoNome.toLowerCase().includes(busca);
            const matchStatus = status === 'todos' || a.status === status;
            const matchTipo = tipo === 'todos' || a.tipoTarefa === tipo;
            const matchGravidade = gravidade === 'todas' || a.gravidade === gravidade;
            const matchTurma = turma === 'todas' || a.alunoTurma === turma;
            return matchBusca && matchStatus && matchTipo && matchGravidade && matchTurma;
        });
        
        this.paginaAtual = 1;
        this.renderizarTabelaAtendimentos();
        
        const badge = document.getElementById('resultadosBadge');
        if (badge) badge.textContent = `${this.atendimentosFiltrados.length} registros`;
    }

    limparFiltros() {
        document.getElementById('buscaAtendimento').value = '';
        document.getElementById('filtroStatus').value = 'todos';
        document.getElementById('filtroTipo').value = 'todos';
        document.getElementById('filtroGravidade').value = 'todas';
        document.getElementById('filtroTurma').value = 'todas';
        this.atendimentosFiltrados = [...this.atendimentos];
        this.paginaAtual = 1;
        this.renderizarTabelaAtendimentos();
        
        const badge = document.getElementById('resultadosBadge');
        if (badge) badge.textContent = `${this.atendimentosFiltrados.length} registros`;
    }

    filtrarPorStatus(status) {
        const select = document.getElementById('filtroStatus');
        if (select) {
            select.value = status;
            this.aplicarFiltros();
        }
    }

    filtrarPorAluno(alunoId) {
        const aluno = this.atendimentos.find(a => a.alunoId === alunoId);
        if (aluno) {
            document.getElementById('buscaAtendimento').value = aluno.alunoNome;
            this.aplicarFiltros();
        }
    }

    async atualizarDados() {
        const refreshBtn = document.querySelector('.btn-refresh i');
        if (refreshBtn) refreshBtn.className = 'fas fa-spinner fa-spin';
        
        try {
            const [dashboardRes, atendimentosRes] = await Promise.all([
                fetch(`${this.apiBase}/dashboard`, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
                }),
                fetch(`${this.apiBase}/atendimentos?limit=100`, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
                })
            ]);
            
            const dashboardData = await dashboardRes.json();
            const atendimentosData = await atendimentosRes.json();
            
            if (dashboardData.success) {
                this.dashboard = dashboardData;
                this.atendimentos = atendimentosData.atendimentos || [];
                this.atendimentosFiltrados = [...this.atendimentos];
                
                // Busca turmas direto dos alunos
                try {
                    const turmasRes = await fetch(`${this.apiBase}/turmas`, {
                        headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
                    });
                    const turmasData = await turmasRes.json();
                    this.turmasDisponiveis = turmasData.success 
                        ? turmasData.turmas 
                        : (atendimentosData.turmasDisponiveis || []);
                } catch (e) {
                    this.turmasDisponiveis = atendimentosData.turmasDisponiveis || [];
                }
                
                this.atualizarCards();
                this.inicializarGraficos();
                
                // Recria o select de turma
                const selectTurma = document.getElementById('filtroTurma');
                if (selectTurma) {
                    const valorAtual = selectTurma.value;
                    selectTurma.innerHTML = '<option value="todas">Todas as turmas</option>' +
                        this.turmasDisponiveis.map(t => `<option value="${t}">${t}</option>`).join('');
                    if (this.turmasDisponiveis.includes(valorAtual)) {
                        selectTurma.value = valorAtual;
                    }
                }
                
                const reincList = document.getElementById('reincidentesList');
                if (reincList) reincList.innerHTML = this.renderAlunosReincidentes();
                
                this.renderizarTabelaAtendimentos();
            }
        } catch (error) {
            console.error('❌ Erro:', error);
        } finally {
            if (refreshBtn) {
                setTimeout(() => {
                    refreshBtn.className = 'fas fa-sync-alt';
                }, 500);
            }
        }
    }

    atualizarCards() {
        const stats = this.dashboard?.metricas || {};
        
        const cards = document.querySelectorAll('.stat-card .stat-value');
        if (cards.length >= 6) {
            cards[0].textContent = stats.hoje || 0;
            cards[1].textContent = stats.finalizadosHoje || 0;
            cards[2].textContent = stats.emAndamento || 0;
            cards[3].textContent = stats.semana || 0;
            cards[4].textContent = stats.mes || 0;
            cards[5].textContent = stats.total || 0;
        }
    }

    async exportarCSV() {
        if (!this.atendimentosFiltrados || this.atendimentosFiltrados.length === 0) {
            if (window.admin?.showToast) window.admin.showToast('❌ Nenhum dado para exportar', 'error');
            return;
        }
        
        const headers = ['Aluno', 'Matrícula', 'Turma', 'Tipo', 'Descrição', 'Gravidade', 'Prioridade', 'Data Entrada', 'Status', 'Resultado', 'Data Saída'];
        
        const rows = this.atendimentosFiltrados.map(a => [
            a.alunoNome,
            a.alunoMatricula || '',
            a.alunoTurma || '',
            a.tipoTarefaLabel || this.TIPO_LABELS[a.tipoTarefa] || '',
            `"${(a.descricao || '').replace(/"/g, '""')}"`,
            this.GRAVIDADE_LABELS[a.gravidade] || a.gravidade,
            a.prioridade || '',
            new Date(a.dataEntrada).toLocaleString('pt-BR'),
            a.status === 'em_andamento' ? 'Em andamento' : 'Finalizado',
            a.saida?.resultadoTexto || (a.saida?.resultado ? this.RESULTADO_LABELS[a.saida.resultado] : ''),
            a.saida?.dataHora ? new Date(a.saida.dataHora).toLocaleString('pt-BR') : ''
        ]);
        
        const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `assistente-social-${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        
        if (window.admin?.showToast) window.admin.showToast('✅ CSV exportado!', 'success');
    }

    configurarEventos() {
        const buscaInput = document.getElementById('buscaAtendimento');
        if (buscaInput) buscaInput.addEventListener('keyup', () => this.aplicarFiltros());
        
        ['filtroStatus', 'filtroTipo', 'filtroGravidade', 'filtroTurma'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', () => this.aplicarFiltros());
        });
    }

    destruir() {
        if (this._interval) {
            clearInterval(this._interval);
            this._interval = null;
        }
        Object.values(this.graficos).forEach(g => {
            if (g && typeof g.destroy === 'function') g.destroy();
        });
        this.graficos = {};
    }
}

// ============================================
// INICIALIZAÇÃO GLOBAL
// ============================================
window.MonitoramentoAssistenteSocial = MonitoramentoAssistenteSocial;
window.monitoramentoAssistenteSocial = null;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.monitoramentoAssistenteSocial = new MonitoramentoAssistenteSocial();
    });
} else {
    window.monitoramentoAssistenteSocial = new MonitoramentoAssistenteSocial();
}