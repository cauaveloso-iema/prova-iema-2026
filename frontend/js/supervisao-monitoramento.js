// ============================================
// MONITORAMENTO SUPERVISÃO - CLASSE PRINCIPAL
// ============================================

class MonitoramentoSupervisao {
    constructor() {
        this.apiBase = '/api/supervisao';
        this.atendimentos = [];
        this.atendimentosFiltrados = [];
        this.paginaAtual = 1;
        this.itensPorPagina = 20;
        this.graficos = {};
        this.turmasDisponiveis = [];
        
    this.TIPO_LABELS = {
        'advertencia_verbal': 'Advertência Verbal',
        'advertencia_escrita': 'Advertência Escrita',
        'atendimento_aluno': 'Atendimento Aluno',
        'atendimento_responsavel': 'Atendimento Responsável',
        'atendimento_professor': 'Atendimento Professor',
        'suspensao': 'Suspensão',
        'encaminhamento': 'Encaminhamento',
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
        console.log('🛡️ Carregando Monitoramento Supervisão...');
        
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
            this.turmasDisponiveis = atendimentosData.turmasDisponiveis || [];
            
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
                <div style="width: 50px; height: 50px; border: 5px solid #f3f3f3; border-top: 5px solid #0ea5e9; border-radius: 50%; margin: 0 auto 20px; animation: spin 1s linear infinite;"></div>
                <p style="color: #6b7280;">Carregando dados de Supervisão...</p>
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
                <button onclick="monitoramentoSupervisao.carregar()" style="
                    background: #0ea5e9;
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
            <div class="supervisao-monitoramento">
                <div class="monitoring-header">
                    <div class="header-left">
                        <div class="header-icon">
                            <i class="fas fa-user-shield"></i>
                        </div>
                        <div class="header-text">
                            <h1>🛡️ Supervisão - Monitoramento</h1>
                            <p>Ocorrências, atendimentos e acompanhamento de supervisão</p>
                        </div>
                    </div>
                    
                    <div class="header-actions">
                        <button class="btn-refresh" onclick="monitoramentoSupervisao.atualizarDados()">
                            <i class="fas fa-sync-alt"></i> Atualizar
                        </button>
                        <button class="btn-export" onclick="monitoramentoSupervisao.exportarCSV()">
                            <i class="fas fa-download"></i> Exportar CSV
                        </button>
                    </div>
                </div>

                <div class="stats-grid">
                    <div class="stat-card primary" onclick="monitoramentoSupervisao.filtrarPorStatus('todos')">
                        <div class="stat-icon"><i class="fas fa-calendar-day"></i></div>
                        <div class="stat-content">
                            <span class="stat-label">Hoje</span>
                            <span class="stat-value">${stats.hoje || 0}</span>
                            <span class="stat-detail">ocorrências</span>
                        </div>
                    </div>

                    <div class="stat-card success" onclick="monitoramentoSupervisao.filtrarPorStatus('finalizado')">
                        <div class="stat-icon"><i class="fas fa-check-circle"></i></div>
                        <div class="stat-content">
                            <span class="stat-label">Finalizados</span>
                            <span class="stat-value">${stats.finalizadosHoje || 0}</span>
                            <span class="stat-detail">hoje</span>
                        </div>
                    </div>

                    <div class="stat-card warning" onclick="monitoramentoSupervisao.filtrarPorStatus('em_andamento')">
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
                                <option value="advertencia_verbal">Advertência Verbal</option>
                                <option value="advertencia_escrita">Advertência Escrita</option>
                                <option value="atendimento_aluno">Atendimento Aluno</option>
                                <option value="atendimento_responsavel">Atendimento Responsável</option>
                                <option value="atendimento_professor">Atendimento Professor</option>
                                <option value="suspensao">Suspensão</option>
                                <option value="encaminhamento">Encaminhamento</option>
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
                            <button class="btn-filter" onclick="monitoramentoSupervisao.aplicarFiltros()">
                                <i class="fas fa-filter"></i> Filtrar
                            </button>
                            <button class="btn-filter btn-clear" onclick="monitoramentoSupervisao.limparFiltros()">
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
                        <button class="btn-page" onclick="monitoramentoSupervisao.paginaAnterior()" id="btnAnterior" disabled>‹ Anterior</button>
                        <span class="page-info" id="pageInfo">Página 1 de 1</span>
                        <button class="btn-page" onclick="monitoramentoSupervisao.proximaPagina()" id="btnProxima" disabled>Próxima ›</button>
                    </div>
                </div>
            </div>

            <style>
                .supervisao-monitoramento { padding: 24px; max-width: 1400px; margin: 0 auto; }
                
                .monitoring-header {
                    background: linear-gradient(135deg, #0ea5e9 0%, #38bdf8 100%);
                    border-radius: 20px;
                    padding: 30px;
                    margin-bottom: 30px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    flex-wrap: wrap;
                    gap: 20px;
                    box-shadow: 0 10px 30px rgba(14, 165, 233, 0.3);
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
                .btn-export { background: white; color: #0ea5e9; }
                
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
                .stat-card.primary .stat-icon { background: linear-gradient(135deg, #0ea5e9, #0284c7); }
                .stat-card.success .stat-icon { background: linear-gradient(135deg, #10b981, #059669); }
                .stat-card.warning .stat-icon { background: linear-gradient(135deg, #f59e0b, #d97706); }
                .stat-card.info .stat-icon { background: linear-gradient(135deg, #3b82f6, #2563eb); }
                .stat-card:not([class*="primary"]):not([class*="success"]):not([class*="warning"]):not([class*="info"]) .stat-icon {
                    background: linear-gradient(135deg, #38bdf8, #0ea5e9);
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
                    background: #0ea5e9;
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
                    border-color: #0ea5e9;
                }
                .btn-filter {
                    padding: 10px 20px;
                    border: none;
                    border-radius: 12px;
                    font-size: 13px;
                    font-weight: 600;
                    cursor: pointer;
                    background: #0ea5e9;
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
                .data-table tr:hover td { background: #f0f9ff; }
                
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
                    background: #e0f2fe;
                    color: #0369a1;
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
                .btn-icon-sm:hover { background: #f3f4f6; color: #0ea5e9; }
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
                .btn-page:hover:not(:disabled) { background: #f9fafb; border-color: #0ea5e9; color: #0ea5e9; }
                
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
            <div class="reincidente-item" onclick="monitoramentoSupervisao.filtrarPorAluno('${a._id}')" style="cursor:pointer;">
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
                            <button class="btn-icon-sm" onclick="monitoramentoSupervisao.verDetalhes('${a.id}')" title="Ver detalhes">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button class="btn-icon-sm" onclick="monitoramentoSupervisao.editarAtendimento('${a.id}')" title="Editar">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-icon-sm danger" onclick="monitoramentoSupervisao.excluirAtendimento('${a.id}', '${a.alunoNome}')" title="Excluir">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    async editarAtendimento(atendimentoId) {
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`${this.apiBase}/atendimento/${atendimentoId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            const data = await response.json();
            if (!data.success) throw new Error(data.error);
            
            const a = data.atendimento;
            
            const formatarParaInput = (dataISO) => {
                if (!dataISO) return '';
                const d = new Date(dataISO);
                const ano = d.getFullYear();
                const mes = String(d.getMonth() + 1).padStart(2, '0');
                const dia = String(d.getDate()).padStart(2, '0');
                const horas = String(d.getHours()).padStart(2, '0');
                const minutos = String(d.getMinutes()).padStart(2, '0');
                return `${ano}-${mes}-${dia}T${horas}:${minutos}`;
            };
            
            const dataEntradaInput = formatarParaInput(a.entrada.dataHora);
            const dataSaidaInput = a.saida?.dataHora ? formatarParaInput(a.saida.dataHora) : '';
            
            const modalBody = document.getElementById('modalBody');
            modalBody.innerHTML = `
                <div style="padding: 20px; max-height: 80vh; overflow-y: auto;">
                    <div style="background: linear-gradient(135deg, #0ea5e9, #38bdf8); margin: -20px -20px 20px -20px; padding: 20px 25px; color: white;">
                        <div style="display: flex; align-items: center; gap: 15px;">
                            <div style="width: 50px; height: 50px; background: rgba(255,255,255,0.2); border-radius: 12px; display: flex; align-items: center; justify-content: center;">
                                <i class="fas fa-edit" style="font-size: 24px;"></i>
                            </div>
                            <div>
                                <h2 style="margin: 0; font-size: 1.3rem;">Editar Ocorrência</h2>
                                <p style="margin: 5px 0 0; opacity: 0.9;">${a.alunoNome} - ${a.alunoTurma}</p>
                            </div>
                        </div>
                    </div>
                    
                    <form id="formEditarAtendimento">
                        <div style="background: #f0f9ff; border-radius: 12px; padding: 15px; margin-bottom: 20px; border: 1px solid #bae6fd;">
                            <h4 style="margin: 0 0 10px; font-size: 0.9rem; color: #075985;">
                                <i class="fas fa-user-graduate"></i> Dados do Aluno
                            </h4>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                                <div>
                                    <div style="font-size: 11px; color: #64748b;">Nome</div>
                                    <div style="font-weight: 500;">${a.alunoNome}</div>
                                </div>
                                <div>
                                    <div style="font-size: 11px; color: #64748b;">Matrícula</div>
                                    <div>${a.alunoMatricula || '-'}</div>
                                </div>
                                <div>
                                    <div style="font-size: 11px; color: #64748b;">Turma</div>
                                    <div>${a.alunoTurma || '-'}</div>
                                </div>
                                <div>
                                    <div style="font-size: 11px; color: #64748b;">Tipo</div>
                                    <div><span class="tipo-badge">${a.tipoTarefaLabel}</span></div>
                                </div>
                            </div>
                        </div>
                        
                        <div style="background: #f8fafc; border-radius: 12px; padding: 15px; margin-bottom: 20px;">
                            <h4 style="margin: 0 0 10px; font-size: 0.9rem; color: #334155;">
                                <i class="fas fa-align-left"></i> Descrição
                            </h4>
                            <textarea id="editDescricao" rows="3" 
                                style="width: 100%; padding: 10px; border: 2px solid #e2e8f0; border-radius: 8px;">${a.entrada.descricao}</textarea>
                            
                            <div style="margin-top: 10px;">
                                <label style="font-size: 12px;">Observações</label>
                                <textarea id="editObservacoes" rows="2" 
                                    style="width: 100%; padding: 10px; border: 2px solid #e2e8f0; border-radius: 8px;">${a.entrada.observacoes || ''}</textarea>
                            </div>
                            
                            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-top: 10px;">
                                <div>
                                    <label style="font-size: 12px;">Gravidade</label>
                                    <select id="editGravidade" 
                                        style="width: 100%; padding: 10px; border: 2px solid #e2e8f0; border-radius: 8px;">
                                        <option value="baixa" ${a.entrada.gravidade === 'baixa' ? 'selected' : ''}>Baixa</option>
                                        <option value="media" ${a.entrada.gravidade === 'media' ? 'selected' : ''}>Média</option>
                                        <option value="alta" ${a.entrada.gravidade === 'alta' ? 'selected' : ''}>Alta</option>
                                        <option value="critica" ${a.entrada.gravidade === 'critica' ? 'selected' : ''}>Crítica</option>
                                    </select>
                                </div>
                                <div>
                                    <label style="font-size: 12px;">Prioridade</label>
                                    <select id="editPrioridade" 
                                        style="width: 100%; padding: 10px; border: 2px solid #e2e8f0; border-radius: 8px;">
                                        <option value="baixa" ${a.prioridade === 'baixa' ? 'selected' : ''}>Baixa</option>
                                        <option value="normal" ${a.prioridade === 'normal' ? 'selected' : ''}>Normal</option>
                                        <option value="alta" ${a.prioridade === 'alta' ? 'selected' : ''}>Alta</option>
                                        <option value="urgente" ${a.prioridade === 'urgente' ? 'selected' : ''}>Urgente</option>
                                    </select>
                                </div>
                                <div>
                                    <label style="font-size: 12px;">Data/Hora Entrada</label>
                                    <input type="datetime-local" id="editDataEntrada" value="${dataEntradaInput}"
                                        style="width: 100%; padding: 10px; border: 2px solid #e2e8f0; border-radius: 8px;">
                                </div>
                            </div>
                        </div>
                        
                        <div style="background: #f8fafc; border-radius: 12px; padding: 15px; margin-bottom: 20px;">
                            <h4 style="margin: 0 0 10px; font-size: 0.9rem; color: #334155;">
                                <i class="fas fa-flag-checkered"></i> Resultado
                            </h4>
                            
                            <div style="margin-bottom: 10px;">
                                <label style="font-size: 12px;">Status</label>
                                <select id="editStatus" onchange="monitoramentoSupervisao.toggleResultadoFields()"
                                    style="width: 100%; padding: 10px; border: 2px solid #e2e8f0; border-radius: 8px;">
                                    <option value="em_andamento" ${a.status === 'em_andamento' ? 'selected' : ''}>Em andamento</option>
                                    <option value="finalizado" ${a.status === 'finalizado' ? 'selected' : ''}>Finalizado</option>
                                </select>
                            </div>
                            
                            <div id="resultadoFields" style="${a.status === 'finalizado' ? 'display: block;' : 'display: none;'}">
                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                                    <div>
                                        <label style="font-size: 12px;">Resultado</label>
                                        <select id="editResultado" 
                                            style="width: 100%; padding: 10px; border: 2px solid #e2e8f0; border-radius: 8px;">
                                            <option value="resolvido" ${a.saida?.resultado === 'resolvido' ? 'selected' : ''}>Resolvido</option>
                                            <option value="em_acompanhamento" ${a.saida?.resultado === 'em_acompanhamento' ? 'selected' : ''}>Em Acompanhamento</option>
                                            <option value="reincidente" ${a.saida?.resultado === 'reincidente' ? 'selected' : ''}>Reincidente</option>
                                            <option value="encaminhado" ${a.saida?.resultado === 'encaminhado' ? 'selected' : ''}>Encaminhado</option>
                                            <option value="pendente" ${a.saida?.resultado === 'pendente' ? 'selected' : ''}>Pendente</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label style="font-size: 12px;">Data/Hora Saída</label>
                                        <input type="datetime-local" id="editDataSaida" value="${dataSaidaInput}"
                                            style="width: 100%; padding: 10px; border: 2px solid #e2e8f0; border-radius: 8px;">
                                    </div>
                                </div>
                                
                                <div style="margin-top: 10px;">
                                    <label style="font-size: 12px;">Observações Finais</label>
                                    <textarea id="editObservacoesFinais" rows="2"
                                        style="width: 100%; padding: 10px; border: 2px solid #e2e8f0; border-radius: 8px;">${a.saida?.observacoesFinais || ''}</textarea>
                                </div>
                            </div>
                        </div>
                        
                        <div style="background: #f1f5f9; border-radius: 12px; padding: 12px;">
                            <div style="display: flex; gap: 15px; font-size: 11px; color: #64748b;">
                                <span><i class="fas fa-user"></i> Registrado por: ${a.entrada.registradoPor || '-'}</span>
                                <span><i class="fas fa-calendar"></i> Criado em: ${new Date(a.createdAt).toLocaleString('pt-BR')}</span>
                            </div>
                        </div>
                    </form>
                </div>
            `;
            
            document.getElementById('modalTitle').innerHTML = '<i class="fas fa-edit"></i> Editar Ocorrência';
            document.getElementById('modalSaveBtn').onclick = () => this.salvarEdicaoAtendimento(atendimentoId);
            document.getElementById('modalSaveBtn').textContent = '💾 Salvar Alterações';
            document.getElementById('modalSaveBtn').style.display = 'inline-block';
            
            if (window.admin?.openModal) window.admin.openModal();
            
        } catch (error) {
            console.error('❌ Erro:', error);
            if (window.admin?.showToast) window.admin.showToast('❌ ' + error.message, 'error');
        }
    }

    toggleResultadoFields() {
        const status = document.getElementById('editStatus')?.value;
        const fields = document.getElementById('resultadoFields');
        if (fields) fields.style.display = status === 'finalizado' ? 'block' : 'none';
    }

    async salvarEdicaoAtendimento(atendimentoId) {
        try {
            const descricao = document.getElementById('editDescricao')?.value;
            const observacoes = document.getElementById('editObservacoes')?.value;
            const gravidade = document.getElementById('editGravidade')?.value;
            const prioridade = document.getElementById('editPrioridade')?.value;
            const status = document.getElementById('editStatus')?.value;
            
            if (!descricao) {
                if (window.admin?.showToast) window.admin.showToast('❌ A descrição é obrigatória', 'error');
                return;
            }
            
            const dados = { descricao, observacoes, gravidade, prioridade, status };
            
            if (status === 'finalizado') {
                const resultado = document.getElementById('editResultado')?.value;
                const observacoesFinais = document.getElementById('editObservacoesFinais')?.value;
                let dataSaida = document.getElementById('editDataSaida')?.value;
                
                if (!dataSaida) {
                    const agora = new Date();
                    const ano = agora.getFullYear();
                    const mes = String(agora.getMonth() + 1).padStart(2, '0');
                    const dia = String(agora.getDate()).padStart(2, '0');
                    const horas = String(agora.getHours()).padStart(2, '0');
                    const minutos = String(agora.getMinutes()).padStart(2, '0');
                    dataSaida = `${ano}-${mes}-${dia}T${horas}:${minutos}`;
                }
                
                dados.saida = {
                    resultado,
                    resultadoTexto: this.RESULTADO_LABELS[resultado] || resultado,
                    observacoesFinais,
                    dataHora: new Date(dataSaida).toISOString()
                };
            }
            
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`${this.apiBase}/atendimento/${atendimentoId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(dados)
            });
            
            const data = await response.json();
            
            if (data.success) {
                if (window.admin?.showToast) window.admin.showToast('✅ Ocorrência atualizada!', 'success');
                if (window.admin?.closeModal) window.admin.closeModal();
                await this.atualizarDados();
            } else {
                throw new Error(data.error || 'Erro ao salvar');
            }
            
        } catch (error) {
            console.error('❌ Erro:', error);
            if (window.admin?.showToast) window.admin.showToast('❌ ' + error.message, 'error');
        }
    }

    async verDetalhes(atendimentoId) {
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`${this.apiBase}/atendimento/${atendimentoId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            const data = await response.json();
            if (!data.success) throw new Error(data.error);
            
            const a = data.atendimento;
            const dataEntrada = a.entrada.dataHoraFormatada || new Date(a.entrada.dataHora).toLocaleString('pt-BR');
            const dataSaida = a.saida?.dataHoraFormatada || 
                (a.saida?.dataHora ? new Date(a.saida.dataHora).toLocaleString('pt-BR') : 'Aguardando finalização');
            
            const gravidadeLabel = this.GRAVIDADE_LABELS[a.entrada.gravidade] || a.entrada.gravidade;
            
            let detalhesHTML = '';
            const d = a.detalhes || {};
            
            if (a.tipoTarefa === 'advertencia_verbal' || a.tipoTarefa === 'advertencia_escrita') {
                if (d.testemunhas?.length > 0) {
                    detalhesHTML += `<div style="margin-bottom: 10px;"><strong>Testemunhas:</strong> ${d.testemunhas.join(', ')}</div>`;
                }
                if (d.descricaoOcorrido) {
                    detalhesHTML += `<div style="margin-bottom: 10px;"><strong>Descrição Detalhada:</strong> ${d.descricaoOcorrido}</div>`;
                }
            }
            
            if (a.tipoTarefa === 'atendimento_responsavel') {
                detalhesHTML += `
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                        ${d.nomeResponsavel ? `<div><strong>Responsável:</strong> ${d.nomeResponsavel}</div>` : ''}
                        ${d.parentescoResponsavel ? `<div><strong>Parentesco:</strong> ${d.parentescoResponsavel}</div>` : ''}
                        ${d.telefoneResponsavel ? `<div><strong>Telefone:</strong> ${d.telefoneResponsavel}</div>` : ''}
                        <div><strong>Compareceu:</strong> ${d.compareceu ? 'Sim' : 'Não'}</div>
                    </div>
                `;
            }
            
            if (a.tipoTarefa === 'atendimento_professor') {
                detalhesHTML += `
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                        ${d.nomeProfessor ? `<div><strong>Professor:</strong> ${d.nomeProfessor}</div>` : ''}
                        ${d.disciplina ? `<div><strong>Disciplina:</strong> ${d.disciplina}</div>` : ''}
                    </div>
                `;
            }
            
            if (a.tipoTarefa === 'suspensao') {
                detalhesHTML += `
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                        ${d.dataInicioSuspensao ? `<div><strong>Início:</strong> ${new Date(d.dataInicioSuspensao).toLocaleDateString('pt-BR')}</div>` : ''}
                        ${d.dataFimSuspensao ? `<div><strong>Fim:</strong> ${new Date(d.dataFimSuspensao).toLocaleDateString('pt-BR')}</div>` : ''}
                        ${d.diasSuspensao ? `<div><strong>Dias:</strong> ${d.diasSuspensao}</div>` : ''}
                    </div>
                `;
            }
            
            if (a.tipoTarefa === 'encaminhamento') {
                detalhesHTML += `
                    <div style="margin-bottom: 10px;">
                        ${d.encaminhadoPara ? `<div><strong>Encaminhado para:</strong> ${d.encaminhadoPara}</div>` : ''}
                        ${d.motivoEncaminhamento ? `<div style="margin-top:5px;"><strong>Motivo:</strong> ${d.motivoEncaminhamento}</div>` : ''}
                        ${d.agendadoPara ? `<div style="margin-top:5px;"><strong>Agendado:</strong> ${new Date(d.agendadoPara).toLocaleDateString('pt-BR')}</div>` : ''}
                    </div>
                `;
            }
            
            if (d.providenciasTomadas) {
                detalhesHTML += `<div style="margin-bottom: 10px; padding-top: 10px; border-top: 1px solid #e5e7eb;"><strong>Providências:</strong> ${d.providenciasTomadas}</div>`;
            }
            
            if (d.proximosPassos) {
                detalhesHTML += `<div style="margin-bottom: 10px;"><strong>Próximos Passos:</strong> ${d.proximosPassos}</div>`;
            }
            
            const modalBody = document.getElementById('modalBody');
            modalBody.innerHTML = `
                <div style="padding: 20px; max-height: 70vh; overflow-y: auto;">
                    <div style="text-align: center; margin-bottom: 20px;">
                        <div style="width: 80px; height: 80px; background: linear-gradient(135deg, #0ea5e9, #38bdf8); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto;">
                            <i class="fas fa-user-shield" style="font-size: 36px; color: white;"></i>
                        </div>
                        <h2 style="margin: 15px 0 5px;">${a.alunoNome}</h2>
                        <p style="color: #6b7280;">${a.alunoTurma} • ${a.alunoCurso || ''}</p>
                        <span class="tipo-badge" style="font-size: 12px; padding: 6px 14px;">${a.tipoTarefaLabel}</span>
                    </div>
                    
                    <div style="background: #f0f9ff; border-radius: 12px; padding: 15px; margin-bottom: 20px; border: 1px solid #bae6fd;">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                            <div style="text-align: center;">
                                <div style="font-size: 11px; color: #0369a1; margin-bottom: 4px;"><i class="fas fa-calendar-alt"></i> ENTRADA</div>
                                <div style="font-size: 13px; font-weight: 600; color: #0c4a6e;">${dataEntrada}</div>
                            </div>
                            <div style="text-align: center;">
                                <div style="font-size: 11px; color: #0369a1; margin-bottom: 4px;"><i class="fas fa-calendar-check"></i> SAÍDA</div>
                                <div style="font-size: 13px; font-weight: 600; color: ${a.saida ? '#10b981' : '#f59e0b'};">${dataSaida}</div>
                            </div>
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 10px; margin-bottom: 20px;">
                        <div style="flex: 1; text-align: center; padding: 10px; background: #f8fafc; border-radius: 10px;">
                            <div style="font-size: 11px; color: #64748b; margin-bottom: 5px;">GRAVIDADE</div>
                            <span class="gravidade-badge gravidade-${a.entrada.gravidade}">${gravidadeLabel}</span>
                        </div>
                        <div style="flex: 1; text-align: center; padding: 10px; background: #f8fafc; border-radius: 10px;">
                            <div style="font-size: 11px; color: #64748b; margin-bottom: 5px;">PRIORIDADE</div>
                            <span style="font-weight: 600; text-transform: capitalize;">${a.prioridade}</span>
                        </div>
                    </div>
                    
                    <div style="background: #f8fafc; border-radius: 12px; padding: 15px; margin-bottom: 15px; border: 1px solid #e5e7eb;">
                        <h4 style="margin: 0 0 10px; font-size: 0.95rem;"><i class="fas fa-align-left" style="color: #0ea5e9;"></i> Descrição</h4>
                        <p style="margin: 0; background: white; padding: 12px; border-radius: 8px;">${a.entrada.descricao}</p>
                        ${a.entrada.observacoes ? `<p style="margin: 10px 0 0; color: #6b7280;"><strong>Obs:</strong> ${a.entrada.observacoes}</p>` : ''}
                        <p style="margin: 10px 0 0; font-size: 12px; color: #6b7280;"><i class="fas fa-user"></i> Registrado por: ${a.entrada.registradoPor}</p>
                    </div>
                    
                    ${detalhesHTML ? `
                        <div style="background: #e0f2fe; border-radius: 12px; padding: 15px; margin-bottom: 15px; border: 1px solid #7dd3fc;">
                            <h4 style="margin: 0 0 10px; font-size: 0.95rem; color: #075985;"><i class="fas fa-info-circle"></i> Detalhes Específicos</h4>
                            <div style="font-size: 13px;">${detalhesHTML}</div>
                        </div>
                    ` : ''}
                    
                    ${a.saida ? `
                        <div style="background: #d1fae5; border-radius: 12px; padding: 15px; border: 1px solid #10b981;">
                            <h4 style="margin: 0 0 10px; font-size: 0.95rem; color: #065f46;"><i class="fas fa-flag-checkered"></i> Resultado</h4>
                            <p><strong>${a.saida.resultadoTexto || this.RESULTADO_LABELS[a.saida.resultado] || a.saida.resultado}</strong></p>
                            ${a.saida.observacoesFinais ? `<p style="margin: 10px 0 0;">${a.saida.observacoesFinais}</p>` : ''}
                            <p style="margin: 10px 0 0; font-size: 12px; color: #6b7280;"><i class="fas fa-user"></i> Registrado por: ${a.saida.registradoPor}</p>
                        </div>
                    ` : `
                        <div style="background: #fef3c7; border-radius: 12px; padding: 15px; border: 1px solid #f59e0b;">
                            <i class="fas fa-clock"></i> Atendimento em andamento
                        </div>
                    `}
                    
                    <div style="margin-top: 15px; font-size: 11px; color: #94a3b8; text-align: right;">
                        <i class="fas fa-fingerprint"></i> ID: ${a.id}
                    </div>
                </div>
            `;
            
            document.getElementById('modalTitle').innerHTML = '<i class="fas fa-info-circle"></i> Detalhes da Ocorrência';
            document.getElementById('modalSaveBtn').style.display = 'none';
            
            if (window.admin?.openModal) window.admin.openModal();
            
        } catch (error) {
            console.error('❌ Erro:', error);
            if (window.admin?.showToast) window.admin.showToast('❌ ' + error.message, 'error');
        }
    }

    async excluirAtendimento(atendimentoId, alunoNome) {
        const confirmar = await this.confirmar(
            '🗑️ Excluir Ocorrência',
            `Tem certeza que deseja excluir a ocorrência de <strong>${alunoNome}</strong>?<br><br>
            <span style="color: #dc3545;">⚠️ Esta ação não pode ser desfeita!</span>`
        );
        
        if (!confirmar) return;
        
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`${this.apiBase}/atendimento/${atendimentoId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            const data = await response.json();
            
            if (data.success) {
                if (window.admin?.showToast) window.admin.showToast('✅ Ocorrência excluída!', 'success');
                await this.atualizarDados();
            } else {
                throw new Error(data.error || 'Erro ao excluir');
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
            if (this.graficos.tipos) this.graficos.tipos.destroy();
            this.graficos.tipos = new Chart(ctxTipos, {
                type: 'bar',
                data: {
                    labels: this.dashboard.porTipo.map(t => t.label),
                    datasets: [{
                        label: 'Ocorrências',
                        data: this.dashboard.porTipo.map(t => t.count),
                        backgroundColor: ['#0ea5e9', '#0284c7', '#38bdf8', '#7dd3fc', '#bae6fd', '#e0f2fe', '#f0f9ff'],
                        borderRadius: 8
                    }]
                },
                options: { responsive: true, maintainAspectRatio: true, indexAxis: 'y', plugins: { legend: { display: false } } }
            });
        }
        
        const ctxGravidade = document.getElementById('chartGravidade')?.getContext('2d');
        if (ctxGravidade && this.dashboard?.porGravidade) {
            if (this.graficos.gravidade) this.graficos.gravidade.destroy();
            const gravidadeLabels = { baixa: 'Baixa', media: 'Média', alta: 'Alta', critica: 'Crítica' };
            const gravidadeColors = { baixa: '#10b981', media: '#f59e0b', alta: '#ef4444', critica: '#7f1d1d' };
            this.graficos.gravidade = new Chart(ctxGravidade, {
                type: 'doughnut',
                data: {
                    labels: this.dashboard.porGravidade.map(g => gravidadeLabels[g.gravidade] || g.gravidade),
                    datasets: [{
                        data: this.dashboard.porGravidade.map(g => g.count),
                        backgroundColor: this.dashboard.porGravidade.map(g => gravidadeColors[g.gravidade] || '#6b7280')
                    }]
                },
                options: { responsive: true, maintainAspectRatio: true }
            });
        }
        
        const ctxAtendimentos = document.getElementById('chartAtendimentos')?.getContext('2d');
        if (ctxAtendimentos && tendencias.ultimos7Dias) {
            if (this.graficos.atendimentos) this.graficos.atendimentos.destroy();
            this.graficos.atendimentos = new Chart(ctxAtendimentos, {
                type: 'line',
                data: {
                    labels: tendencias.ultimos7Dias.map(d => d.dia),
                    datasets: [{
                        label: 'Ocorrências',
                        data: tendencias.ultimos7Dias.map(d => d.atendimentos),
                        borderColor: '#0ea5e9',
                        backgroundColor: 'rgba(14, 165, 233, 0.1)',
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: { responsive: true, maintainAspectRatio: true }
            });
        }
        
        const ctxTurmas = document.getElementById('chartTurmas')?.getContext('2d');
        if (ctxTurmas && tendencias.porTurma) {
            if (this.graficos.turmas) this.graficos.turmas.destroy();
            this.graficos.turmas = new Chart(ctxTurmas, {
                type: 'bar',
                data: {
                    labels: tendencias.porTurma.map(t => t.turma),
                    datasets: [{
                        label: 'Ocorrências',
                        data: tendencias.porTurma.map(t => t.count),
                        backgroundColor: '#38bdf8',
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
        console.log('🔄 Atualizando dados de Supervisão...');
        
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
                this.turmasDisponiveis = atendimentosData.turmasDisponiveis || [];
                
                this.atualizarCards();
                this.inicializarGraficos();
                
                const reincList = document.getElementById('reincidentesList');
                if (reincList) reincList.innerHTML = this.renderAlunosReincidentes();
                
                this.renderizarTabelaAtendimentos();
                
                console.log('✅ Dados atualizados!');
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
        a.download = `supervisao-${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        
        if (window.admin?.showToast) window.admin.showToast('✅ CSV exportado!', 'success');
    }

    async confirmar(titulo, mensagem) {
        if (window.admin?.confirmar) {
            return await window.admin.confirmar(titulo, mensagem);
        } else {
            return await confirm(mensagem.replace(/<[^>]*>/g, ''));
        }
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
window.MonitoramentoSupervisao = MonitoramentoSupervisao;
window.monitoramentoSupervisao = null;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.monitoramentoSupervisao = new MonitoramentoSupervisao();
    });
} else {
    window.monitoramentoSupervisao = new MonitoramentoSupervisao();
}