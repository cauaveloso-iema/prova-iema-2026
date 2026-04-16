// ============================================
// MONITORAMENTO ENFERMARIA - CLASSE PRINCIPAL
// ============================================

class MonitoramentoEnfermaria {
    constructor() {
        this.apiBase = '/api/enfermaria-monitoramento';
        this.atendimentos = [];
        this.atendimentosFiltrados = [];
        this.paginaAtual = 1;
        this.itensPorPagina = 20;
        this.graficos = {};
        this.turmasDisponiveis = [];
    }

    async carregar() {
        console.log('🏥 Carregando Monitoramento da Enfermaria...');
        
        const contentArea = document.getElementById('contentArea');
        
        // Mostrar loading
        contentArea.innerHTML = this.renderLoading();
        
        try {
            // Carregar dashboard e atendimentos em paralelo
            const [dashboardRes, atendimentosRes] = await Promise.all([
                fetch(`${this.apiBase}/dashboard`, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
                }),
                fetch(`${this.apiBase}/atendimentos?limit=50`, {
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
            
            // Renderizar interface
            contentArea.innerHTML = this.renderPrincipal();
            
            // Inicializar gráficos
            setTimeout(() => {
                this.inicializarGraficos();
                this.renderizarTabelaAtendimentos();
                this.configurarEventos();
            }, 100);
            
            // Atualizar a cada 30 segundos
            setInterval(() => this.atualizarDados(), 30000);
            
        } catch (error) {
            console.error('❌ Erro:', error);
            contentArea.innerHTML = this.renderErro(error.message);
        }
    }

    renderLoading() {
        return `
            <div style="text-align: center; padding: 60px; background: white; border-radius: 12px;">
                <div style="width: 50px; height: 50px; border: 5px solid #f3f3f3; border-top: 5px solid #0891b2; border-radius: 50%; margin: 0 auto 20px; animation: spin 1s linear infinite;"></div>
                <p style="color: #6b7280;">Carregando dados da Enfermaria...</p>
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
                <button onclick="monitoramentoEnfermaria.carregar()" style="
                    background: #0891b2;
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
        const tendencias = this.dashboard?.tendencias || {};
        
        return `
            <div class="enfermaria-monitoramento">
                <!-- HEADER -->
                <div class="monitoring-header">
                    <div class="header-left">
                        <div class="header-icon">
                            <i class="fas fa-hospital-user"></i>
                        </div>
                        <div class="header-text">
                            <h1>🏥 Enfermaria - Monitoramento</h1>
                            <p>Atendimentos realizados, queixas mais comuns e estatísticas</p>
                        </div>
                    </div>
                    
                    <div class="header-actions">
                        <button class="btn-refresh" onclick="monitoramentoEnfermaria.atualizarDados()">
                            <i class="fas fa-sync-alt"></i> Atualizar
                        </button>
                        <button class="btn-export" onclick="monitoramentoEnfermaria.exportarCSV()">
                            <i class="fas fa-download"></i> Exportar CSV
                        </button>
                    </div>
                </div>

                <!-- CARDS DE ESTATÍSTICAS -->
                <div class="stats-grid">
                    <div class="stat-card primary" onclick="monitoramentoEnfermaria.filtrarPorStatus('todos')">
                        <div class="stat-icon"><i class="fas fa-calendar-day"></i></div>
                        <div class="stat-content">
                            <span class="stat-label">Hoje</span>
                            <span class="stat-value">${stats.hoje || 0}</span>
                            <span class="stat-detail">atendimentos</span>
                        </div>
                    </div>

                    <div class="stat-card success" onclick="monitoramentoEnfermaria.filtrarPorStatus('finalizado')">
                        <div class="stat-icon"><i class="fas fa-check-circle"></i></div>
                        <div class="stat-content">
                            <span class="stat-label">Finalizados</span>
                            <span class="stat-value">${stats.finalizadosHoje || 0}</span>
                            <span class="stat-detail">hoje</span>
                        </div>
                    </div>

                    <div class="stat-card warning" onclick="monitoramentoEnfermaria.filtrarPorStatus('em_atendimento')">
                        <div class="stat-icon"><i class="fas fa-clock"></i></div>
                        <div class="stat-content">
                            <span class="stat-label">Em Andamento</span>
                            <span class="stat-value">${stats.emAndamento || 0}</span>
                            <span class="stat-detail">aguardando</span>
                        </div>
                    </div>

                    <div class="stat-card info" onclick="monitoramentoEnfermaria.filtrarPorPeriodo('semana')">
                        <div class="stat-icon"><i class="fas fa-calendar-week"></i></div>
                        <div class="stat-content">
                            <span class="stat-label">Esta Semana</span>
                            <span class="stat-value">${stats.semana || 0}</span>
                            <span class="stat-detail">atendimentos</span>
                        </div>
                    </div>

                    <div class="stat-card" onclick="monitoramentoEnfermaria.filtrarPorPeriodo('mes')">
                        <div class="stat-icon"><i class="fas fa-calendar-alt"></i></div>
                        <div class="stat-content">
                            <span class="stat-label">Este Mês</span>
                            <span class="stat-value">${stats.mes || 0}</span>
                            <span class="stat-detail">atendimentos</span>
                        </div>
                    </div>

                    <div class="stat-card">
                        <div class="stat-icon"><i class="fas fa-hourglass-half"></i></div>
                        <div class="stat-content">
                            <span class="stat-label">Tempo Médio</span>
                            <span class="stat-value">${stats.tempoMedioMinutos || 0}</span>
                            <span class="stat-detail">minutos</span>
                        </div>
                    </div>
                </div>

                <!-- GRÁFICOS -->
                <div class="charts-row">
                    <div class="chart-card">
                        <h3><i class="fas fa-chart-bar"></i> Atendimentos por Dia</h3>
                        <canvas id="chartAtendimentos"></canvas>
                    </div>
                    <div class="chart-card">
                        <h3><i class="fas fa-chart-pie"></i> Desfechos</h3>
                        <canvas id="chartDesfechos"></canvas>
                    </div>
                    <div class="chart-card">
                        <h3><i class="fas fa-chart-bar"></i> Por Turma</h3>
                        <canvas id="chartTurmas"></canvas>
                    </div>
                    <div class="chart-card">
                        <h3><i class="fas fa-chart-line"></i> Distribuição por Horário</h3>
                        <canvas id="chartHorario"></canvas>
                    </div>
                </div>

                <!-- QUEIXAS MAIS COMUNS -->
                <div class="queixas-card">
                    <h3><i class="fas fa-notes-medical"></i> Queixas Mais Comuns</h3>
                    <div class="queixas-list" id="queixasList">
                        ${this.renderQueixasComuns()}
                    </div>
                </div>

                <!-- FILTROS -->
                <div class="filters-card">
                    <div class="filters-header">
                        <div class="filters-title">
                            <i class="fas fa-sliders-h"></i>
                            <h3>Filtros</h3>
                        </div>
                        <span class="filters-badge" id="resultadosBadge">${this.atendimentosFiltrados.length} atendimentos</span>
                    </div>
                    
                    <div class="filters-grid">
                        <div class="filter-group">
                            <label><i class="fas fa-search"></i> Buscar</label>
                            <input type="text" id="buscaAtendimento" placeholder="Nome do aluno..." class="filter-input">
                        </div>
                        
                        <div class="filter-group">
                            <label><i class="fas fa-filter"></i> Status</label>
                            <select id="filtroStatus" class="filter-select">
                                <option value="todos">Todos</option>
                                <option value="em_atendimento">Em andamento</option>
                                <option value="finalizado">Finalizados</option>
                            </select>
                        </div>
                        
                        <div class="filter-group">
                            <label><i class="fas fa-flag-checkered"></i> Desfecho</label>
                            <select id="filtroDesfecho" class="filter-select">
                                <option value="todos">Todos</option>
                                <option value="retornou_sala">Retornou à Sala</option>
                                <option value="encaminhado_gestao">Encaminhado à Gestão</option>
                                <option value="liberado_responsavel">Liberado com Responsável</option>
                                <option value="liberado_coordenador">Liberado com Coordenador</option>
                                <option value="outros">Outros</option>
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
                            <button class="btn-filter" onclick="monitoramentoEnfermaria.aplicarFiltros()">
                                <i class="fas fa-filter"></i> Filtrar
                            </button>
                            <button class="btn-filter btn-clear" onclick="monitoramentoEnfermaria.limparFiltros()">
                                <i class="fas fa-eraser"></i> Limpar
                            </button>
                        </div>
                    </div>
                </div>

=                <!-- TABELA DE ATENDIMENTOS -->
                <div class="table-container">
                    <div class="table-header">
                        <h3><i class="fas fa-list"></i> Histórico de Atendimentos</h3>
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
                                    <th>Queixa</th>
                                    <th>Entrada</th>
                                    <th>Status</th>
                                    <th>Saída</th>
                                    <th>Desfecho</th>
                                    <th>Ações</th>
                                </tr>
                            </thead>
                            <tbody id="tabelaAtendimentosBody">
                                ${this.renderLinhasAtendimentos(this.atendimentosFiltrados.slice(0, this.itensPorPagina))}
                            </tbody>
                        </table>
                    </div>
                    
                    <!-- Paginação -->
                    <div class="pagination-container" id="paginacao">
                        <button class="btn-page" onclick="monitoramentoEnfermaria.paginaAnterior()" id="btnAnterior" disabled>‹ Anterior</button>
                        <span class="page-info" id="pageInfo">Página 1 de 1</span>
                        <button class="btn-page" onclick="monitoramentoEnfermaria.proximaPagina()" id="btnProxima" disabled>Próxima ›</button>
                    </div>
                </div>
            </div>

            <style>
                .enfermaria-monitoramento { padding: 24px; max-width: 1400px; margin: 0 auto; }
                
                .monitoring-header {
                    background: linear-gradient(135deg, #0891b2 0%, #06b6d4 100%);
                    border-radius: 20px;
                    padding: 30px;
                    margin-bottom: 30px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    flex-wrap: wrap;
                    gap: 20px;
                    box-shadow: 0 10px 30px rgba(8, 145, 178, 0.3);
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
                .btn-export { background: white; color: #0891b2; }
                
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
                .stat-card.primary .stat-icon { background: linear-gradient(135deg, #0891b2, #06b6d4); }
                .stat-card.success .stat-icon { background: linear-gradient(135deg, #10b981, #059669); }
                .stat-card.warning .stat-icon { background: linear-gradient(135deg, #f59e0b, #d97706); }
                .stat-card.info .stat-icon { background: linear-gradient(135deg, #3b82f6, #2563eb); }
                
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
                
                .queixas-card {
                    background: white;
                    border-radius: 16px;
                    padding: 20px;
                    margin-bottom: 30px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
                }
                .queixas-card h3 { margin: 0 0 15px; font-size: 16px; color: #374151; }
                .queixas-list { display: flex; flex-wrap: wrap; gap: 10px; }
                .queixa-item {
                    background: #f1f5f9;
                    padding: 8px 16px;
                    border-radius: 30px;
                    font-size: 13px;
                    color: #1e293b;
                }
                .queixa-count {
                    background: #0891b2;
                    color: white;
                    border-radius: 20px;
                    padding: 2px 8px;
                    margin-left: 8px;
                    font-size: 11px;
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
                .filters-badge {
                    background: #0891b2;
                    color: white;
                    padding: 4px 12px;
                    border-radius: 30px;
                    font-size: 12px;
                }
                .filters-grid {
                    display: grid;
                    grid-template-columns: 2fr 1fr 1fr 1fr auto;
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
                .btn-filter {
                    padding: 10px 20px;
                    border: none;
                    border-radius: 12px;
                    font-size: 13px;
                    font-weight: 600;
                    cursor: pointer;
                    background: #0891b2;
                    color: white;
                }
                .btn-filter.btn-clear { background: #6b7280; }
                
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
                .data-table {
                    width: 100%;
                    border-collapse: collapse;
                }
                .data-table th {
                    padding: 12px;
                    text-align: left;
                    font-size: 13px;
                    font-weight: 600;
                    color: #4b5563;
                    border-bottom: 2px solid #e5e7eb;
                }
                .data-table td {
                    padding: 12px;
                    border-bottom: 1px solid #e5e7eb;
                    font-size: 13px;
                }
                .data-table tr:hover td { background: #f9fafb; }
                
                .status-badge {
                    display: inline-block;
                    padding: 4px 10px;
                    border-radius: 30px;
                    font-size: 11px;
                    font-weight: 600;
                }
                .status-em_atendimento { background: #fef3c7; color: #92400e; }
                .status-finalizado { background: #d1fae5; color: #065f46; }
                
                .action-buttons { display: flex; gap: 5px; }
                .btn-icon-sm {
                    width: 30px; height: 30px;
                    border: none;
                    border-radius: 6px;
                    background: transparent;
                    cursor: pointer;
                }
                .btn-icon-sm:hover { background: #f3f4f6; }
                .btn-icon-sm.danger:hover { color: #dc2626; }
                
                .pagination-container {
                    display: flex;
                    justify-content: center;
                    gap: 15px;
                    margin-top: 20px;
                    padding-top: 20px;
                    border-top: 1px solid #e5e7eb;
                }
                .btn-page {
                    padding: 8px 20px;
                    border: 1px solid #e5e7eb;
                    background: white;
                    border-radius: 8px;
                    cursor: pointer;
                }
                .btn-page:disabled { opacity: 0.5; cursor: not-allowed; }
                
                @media (max-width: 1024px) {
                    .stats-grid { grid-template-columns: repeat(3, 1fr); }
                    .filters-grid { grid-template-columns: 1fr; }
                    .charts-row { grid-template-columns: 1fr; }
                }
                @media (max-width: 768px) {
                    .stats-grid { grid-template-columns: repeat(2, 1fr); }
                    .monitoring-header { flex-direction: column; align-items: flex-start; }
                }
            </style>
        `;
    }

    renderQueixasComuns() {
        const queixas = this.dashboard?.tendencias?.queixasComuns || [];
        
        if (queixas.length === 0) {
            return '<p style="color: #6b7280;">Nenhuma queixa registrada nos últimos 30 dias</p>';
        }
        
        return queixas.map(q => `
            <div class="queixa-item">
                <i class="fas fa-comment-medical"></i> ${q.queixa}
                <span class="queixa-count">${q.count} vezes</span>
            </div>
        `).join('');
    }

    renderLinhasAtendimentos(atendimentos) {
        if (!atendimentos || atendimentos.length === 0) {
            return `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 40px;">
                        <i class="fas fa-inbox" style="font-size: 48px; color: #d1d5db;"></i>
                        <p style="margin-top: 10px;">Nenhum atendimento encontrado</p>
                    </td>
                </tr>
            `;
        }
        
        return atendimentos.map(a => {
            // 🔥 USAR DATA FORMATADA DO BACKEND
            const dataEntradaFormatada = a.dataEntradaFormatada || (a.dataEntrada ? new Date(a.dataEntrada).toLocaleString('pt-BR') : 'N/A');
            const dataSaidaFormatada = a.saida?.dataHoraFormatada || (a.saida?.dataHora ? new Date(a.saida.dataHora).toLocaleString('pt-BR') : '-');
            
            const statusClass = a.status === 'em_atendimento' ? 'status-em_atendimento' : 'status-finalizado';
            const statusText = a.status === 'em_atendimento' ? 'Em andamento' : 'Finalizado';
            
            // 🔥 CORREÇÃO: Buscar o desfecho corretamente
            let desfechoText = '-';
            if (a.saida?.desfechoTexto) {
                desfechoText = a.saida.desfechoTexto;
            } else if (a.saida?.desfecho) {
                const desfechoMap = {
                    'retornou_sala': 'Retornou para Sala de Aula',
                    'encaminhado_gestao': 'Encaminhado para Gestão Geral',
                    'liberado_responsavel': 'Liberado com o Responsável',
                    'liberado_coordenador': `Liberado com Coordenador${a.saida?.coordenadorPatioNome ? ` (${a.saida.coordenadorPatioNome})` : ''}`,
                    'outros': `Outros: ${a.saida?.desfechoOutrosTexto || ''}`
                };
                desfechoText = desfechoMap[a.saida.desfecho] || a.saida.desfecho;
            } else if (a.status === 'em_atendimento') {
                desfechoText = 'Em andamento';
            }
            
            const queixaCurta = a.queixa ? (a.queixa.length > 50 ? a.queixa.substring(0, 50) + '...' : a.queixa) : '-';
            
            return `
                <tr>
                    <td>
                        <strong>${a.alunoNome || '-'}</strong>
                        <br><small style="color: #6b7280;">${a.alunoMatricula || ''}</small>
                    </td>
                    <td>${a.alunoTurma || '-'}</td>
                    <td title="${a.queixa || ''}">${queixaCurta}</td>
                    <td><strong>${dataEntradaFormatada}</strong></td>
                    <td>
                        <span class="status-badge ${statusClass}">
                            ${statusText}
                        </span>
                    </td>
                    <td><strong>${dataSaidaFormatada}</strong></td>
                    <td>${desfechoText}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn-icon-sm" onclick="monitoramentoEnfermaria.verDetalhes('${a.id}')" title="Ver detalhes">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button class="btn-icon-sm" onclick="monitoramentoEnfermaria.editarAtendimento('${a.id}')" title="Editar atendimento">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-icon-sm danger" onclick="monitoramentoEnfermaria.excluirAtendimento('${a.id}', '${a.alunoNome}')" title="Excluir">
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
            
            // 🔥 USAR DATAS FORMATADAS DO BACKEND PARA EXIBIÇÃO
            const dataEntradaExibicao = a.entrada.dataHoraFormatada || new Date(a.entrada.dataHora).toLocaleString('pt-BR');
            
            // 🔥 FORMATAR PARA O INPUT DATETIME-LOCAL (YYYY-MM-DDTHH:MM)
            const formatarParaInput = (dataISO) => {
                if (!dataISO) return '';
                const d = new Date(dataISO);
                // Ajustar para fuso horário local (Brasil)
                const ano = d.getFullYear();
                const mes = String(d.getMonth() + 1).padStart(2, '0');
                const dia = String(d.getDate()).padStart(2, '0');
                const horas = String(d.getHours()).padStart(2, '0');
                const minutos = String(d.getMinutes()).padStart(2, '0');
                return `${ano}-${mes}-${dia}T${horas}:${minutos}`;
            };
            
            const dataEntradaInput = formatarParaInput(a.entrada.dataHora);
            const dataSaidaInput = a.saida?.dataHora ? formatarParaInput(a.saida.dataHora) : '';
            
            // 🔥 TEXTO DO DESFECHO PARA EXIBIÇÃO
            const desfechoAtual = a.saida?.desfecho || '';
            const desfechoTexto = a.saida?.desfechoTexto || '';
            const coordenadorNome = a.saida?.coordenadorPatioNome || '';
            const desfechoOutrosTexto = a.saida?.desfechoOutrosTexto || '';
            
            const modalBody = document.getElementById('modalBody');
            modalBody.innerHTML = `
                <div style="padding: 20px; max-height: 80vh; overflow-y: auto;">
                    <!-- Cabeçalho -->
                    <div style="background: linear-gradient(135deg, #0891b2, #06b6d4); margin: -20px -20px 20px -20px; padding: 20px 25px; color: white;">
                        <div style="display: flex; align-items: center; gap: 15px;">
                            <div style="width: 50px; height: 50px; background: rgba(255,255,255,0.2); border-radius: 12px; display: flex; align-items: center; justify-content: center;">
                                <i class="fas fa-edit" style="font-size: 24px;"></i>
                            </div>
                            <div>
                                <h2 style="margin: 0; font-size: 1.3rem;">Editar Atendimento</h2>
                                <p style="margin: 5px 0 0; opacity: 0.9;">${a.alunoNome} - ${a.alunoTurma}</p>
                            </div>
                        </div>
                    </div>
                    
                    <form id="formEditarAtendimento">
                        <!-- SEÇÃO 1: DADOS DO ALUNO (APENAS LEITURA) -->
                        <div style="background: #f8fafc; border-radius: 12px; padding: 15px; margin-bottom: 20px;">
                            <h4 style="margin: 0 0 10px; font-size: 0.9rem; color: #334155;">
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
                                    <div style="font-size: 11px; color: #64748b;">Curso</div>
                                    <div>${a.alunoCurso || '-'}</div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- SEÇÃO 2: QUEIXA (EDITÁVEL) -->
                        <div style="background: #f8fafc; border-radius: 12px; padding: 15px; margin-bottom: 20px;">
                            <h4 style="margin: 0 0 10px; font-size: 0.9rem; color: #334155;">
                                <i class="fas fa-stethoscope"></i> Queixa / Motivo
                            </h4>
                            <textarea id="editQueixa" class="form-control" rows="3" 
                                style="width: 100%; padding: 10px; border: 2px solid #e2e8f0; border-radius: 8px;">${a.entrada.queixa}</textarea>
                            <div class="form-group" style="margin-top: 10px;">
                                <label style="font-size: 12px;">Observações da entrada</label>
                                <textarea id="editObservacoesEntrada" class="form-control" rows="2" 
                                    style="width: 100%; padding: 10px; border: 2px solid #e2e8f0; border-radius: 8px;">${a.entrada.observacoes || ''}</textarea>
                            </div>
                            <div class="form-group" style="margin-top: 10px;">
                                <label style="font-size: 12px;">Data/Hora da Entrada</label>
                                <input type="datetime-local" id="editDataEntrada" class="form-control" 
                                    value="${dataEntradaInput}"
                                    style="width: 100%; padding: 10px; border: 2px solid #e2e8f0; border-radius: 8px;">
                                <div class="input-hint" style="font-size: 11px; color: #6b7280; margin-top: 4px;">
                                    <i class="fas fa-info-circle"></i> Data e hora atuais: ${dataEntradaExibicao}
                                </div>
                            </div>
                        </div>
                        
                        <!-- SEÇÃO 3: DESFECHO (EDITÁVEL) -->
                        <div style="background: #f8fafc; border-radius: 12px; padding: 15px; margin-bottom: 20px;">
                            <h4 style="margin: 0 0 10px; font-size: 0.9rem; color: #334155;">
                                <i class="fas fa-flag-checkered"></i> Desfecho
                            </h4>
                            
                            <div class="form-group">
                                <label style="font-size: 12px;">Status</label>
                                <select id="editStatus" class="form-control" onchange="monitoramentoEnfermaria.toggleDesfechoFields()"
                                    style="width: 100%; padding: 10px; border: 2px solid #e2e8f0; border-radius: 8px;">
                                    <option value="em_atendimento" ${a.status === 'em_atendimento' ? 'selected' : ''}>Em andamento</option>
                                    <option value="finalizado" ${a.status === 'finalizado' ? 'selected' : ''}>Finalizado</option>
                                </select>
                            </div>
                            
                            <div id="desfechoFields" style="${a.status === 'finalizado' ? 'display: block;' : 'display: none;'}">
                                <div class="form-group">
                                    <label style="font-size: 12px;">Tipo de Desfecho</label>
                                    <select id="editDesfecho" class="form-control" onchange="monitoramentoEnfermaria.toggleOutrosDesfecho()"
                                        style="width: 100%; padding: 10px; border: 2px solid #e2e8f0; border-radius: 8px;">
                                        <option value="retornou_sala" ${desfechoAtual === 'retornou_sala' ? 'selected' : ''}>Retornou para Sala de Aula</option>
                                        <option value="encaminhado_gestao" ${desfechoAtual === 'encaminhado_gestao' ? 'selected' : ''}>Encaminhado para Gestão Geral</option>
                                        <option value="liberado_responsavel" ${desfechoAtual === 'liberado_responsavel' ? 'selected' : ''}>Liberado com o Responsável</option>
                                        <option value="liberado_coordenador" ${desfechoAtual === 'liberado_coordenador' ? 'selected' : ''}>Liberado com o Coordenador de Pátio</option>
                                        <option value="outros" ${desfechoAtual === 'outros' ? 'selected' : ''}>Outros</option>
                                    </select>
                                    ${desfechoAtual ? `<div class="input-hint" style="font-size: 11px; color: #6b7280; margin-top: 4px;">Desfecho atual: ${desfechoTexto}</div>` : ''}
                                </div>
                                
                                <div id="campoCoordenador" style="display: ${desfechoAtual === 'liberado_coordenador' ? 'block' : 'none'};">
                                    <div class="form-group">
                                        <label style="font-size: 12px;">Nome do Coordenador de Pátio</label>
                                        <input type="text" id="editCoordenadorNome" class="form-control" 
                                            value="${coordenadorNome}"
                                            style="width: 100%; padding: 10px; border: 2px solid #e2e8f0; border-radius: 8px;">
                                    </div>
                                </div>
                                
                                <div id="campoOutros" style="display: ${desfechoAtual === 'outros' ? 'block' : 'none'};">
                                    <div class="form-group">
                                        <label style="font-size: 12px;">Descreva o desfecho</label>
                                        <textarea id="editOutrosTexto" class="form-control" rows="2"
                                            style="width: 100%; padding: 10px; border: 2px solid #e2e8f0; border-radius: 8px;">${desfechoOutrosTexto}</textarea>
                                    </div>
                                </div>
                                
                                <div class="form-group">
                                    <label style="font-size: 12px;">Observações do desfecho</label>
                                    <textarea id="editObservacoesSaida" class="form-control" rows="2"
                                        style="width: 100%; padding: 10px; border: 2px solid #e2e8f0; border-radius: 8px;">${a.saida?.observacoes || ''}</textarea>
                                </div>
                                
                                <div class="form-group">
                                    <label style="font-size: 12px;">Data/Hora da Saída</label>
                                    <input type="datetime-local" id="editDataSaida" class="form-control" 
                                        value="${dataSaidaInput}"
                                        style="width: 100%; padding: 10px; border: 2px solid #e2e8f0; border-radius: 8px;">
                                    <div class="input-hint" style="font-size: 11px; color: #6b7280; margin-top: 4px;">
                                        <i class="fas fa-info-circle"></i> Deixe em branco para usar a data/hora atual
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- INFORMAÇÕES DO REGISTRO -->
                        <div style="background: #f1f5f9; border-radius: 12px; padding: 12px; margin-top: 10px;">
                            <div style="display: flex; gap: 15px; font-size: 11px; color: #64748b;">
                                <span><i class="fas fa-user"></i> Registrado por: ${a.entrada.registradoPor}</span>
                                <span><i class="fas fa-calendar"></i> Criado em: ${new Date(a.createdAt).toLocaleString('pt-BR')}</span>
                            </div>
                        </div>
                    </form>
                </div>
            `;
            
            document.getElementById('modalTitle').innerHTML = '<i class="fas fa-edit"></i> Editar Atendimento';
            document.getElementById('modalSaveBtn').onclick = () => this.salvarEdicaoAtendimento(atendimentoId);
            document.getElementById('modalSaveBtn').textContent = '💾 Salvar Alterações';
            
            if (window.admin && typeof window.admin.openModal === 'function') {
                window.admin.openModal();
            }
            
        } catch (error) {
            console.error('❌ Erro:', error);
            if (window.admin && typeof window.admin.showToast === 'function') {
                window.admin.showToast('❌ ' + error.message, 'error');
            }
        }
    }

    toggleDesfechoFields() {
        const status = document.getElementById('editStatus')?.value;
        const desfechoFields = document.getElementById('desfechoFields');
        if (desfechoFields) {
            desfechoFields.style.display = status === 'finalizado' ? 'block' : 'none';
        }
    }

    toggleOutrosDesfecho() {
        const desfecho = document.getElementById('editDesfecho')?.value;
        const campoCoordenador = document.getElementById('campoCoordenador');
        const campoOutros = document.getElementById('campoOutros');
        
        if (campoCoordenador) {
            campoCoordenador.style.display = desfecho === 'liberado_coordenador' ? 'block' : 'none';
        }
        if (campoOutros) {
            campoOutros.style.display = desfecho === 'outros' ? 'block' : 'none';
        }
    }

    async salvarEdicaoAtendimento(atendimentoId) {
        try {
            const queixa = document.getElementById('editQueixa')?.value;
            const observacoesEntrada = document.getElementById('editObservacoesEntrada')?.value;
            const dataEntrada = document.getElementById('editDataEntrada')?.value;
            const status = document.getElementById('editStatus')?.value;
            
            if (!queixa) {
                if (window.admin && typeof window.admin.showToast === 'function') {
                    window.admin.showToast('❌ A queixa é obrigatória', 'error');
                }
                return;
            }
            
            const dados = {
                queixa,
                observacoesEntrada,
                dataEntrada: dataEntrada ? new Date(dataEntrada).toISOString() : null,
                status
            };
            
            // Se finalizado, incluir dados do desfecho
            if (status === 'finalizado') {
                const desfecho = document.getElementById('editDesfecho')?.value;
                const coordenadorNome = document.getElementById('editCoordenadorNome')?.value;
                const outrosTexto = document.getElementById('editOutrosTexto')?.value;
                const observacoesSaida = document.getElementById('editObservacoesSaida')?.value;
                let dataSaida = document.getElementById('editDataSaida')?.value;
                
                // Se não informou data de saída, usar data/hora atual
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
                    desfecho,
                    coordenadorPatioNome: desfecho === 'liberado_coordenador' ? coordenadorNome : undefined,
                    desfechoOutrosTexto: desfecho === 'outros' ? outrosTexto : undefined,
                    observacoes: observacoesSaida,
                    dataHora: dataSaida ? new Date(dataSaida).toISOString() : new Date().toISOString()
                };
            }
            
            console.log('📤 Salvando edição:', dados);
            
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
                if (window.admin && typeof window.admin.showToast === 'function') {
                    window.admin.showToast('✅ Atendimento atualizado com sucesso!', 'success');
                }
                if (window.admin && typeof window.admin.closeModal === 'function') {
                    window.admin.closeModal();
                }
                await this.atualizarDados();
            } else {
                throw new Error(data.error || 'Erro ao salvar');
            }
            
        } catch (error) {
            console.error('❌ Erro:', error);
            if (window.admin && typeof window.admin.showToast === 'function') {
                window.admin.showToast('❌ ' + error.message, 'error');
            }
        }
    }

    inicializarGraficos() {
        const tendencias = this.dashboard?.tendencias || {};
        
        // Gráfico de Atendimentos por Dia
        const ctxAtendimentos = document.getElementById('chartAtendimentos')?.getContext('2d');
        if (ctxAtendimentos && tendencias.ultimos7Dias) {
            if (this.graficos.atendimentos) this.graficos.atendimentos.destroy();
            this.graficos.atendimentos = new Chart(ctxAtendimentos, {
                type: 'bar',
                data: {
                    labels: tendencias.ultimos7Dias.map(d => d.dia),
                    datasets: [{
                        label: 'Atendimentos',
                        data: tendencias.ultimos7Dias.map(d => d.atendimentos),
                        backgroundColor: '#0891b2',
                        borderRadius: 8
                    }]
                },
                options: { responsive: true, maintainAspectRatio: true }
            });
        }
        
        // Gráfico de Desfechos
        const ctxDesfechos = document.getElementById('chartDesfechos')?.getContext('2d');
        if (ctxDesfechos && this.dashboard?.desfechos) {
            if (this.graficos.desfechos) this.graficos.desfechos.destroy();
            this.graficos.desfechos = new Chart(ctxDesfechos, {
                type: 'pie',
                data: {
                    labels: this.dashboard.desfechos.map(d => d.label),
                    datasets: [{
                        data: this.dashboard.desfechos.map(d => d.count),
                        backgroundColor: ['#0891b2', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']
                    }]
                },
                options: { responsive: true, maintainAspectRatio: true }
            });
        }
        
        // Gráfico por Turma
        const ctxTurmas = document.getElementById('chartTurmas')?.getContext('2d');
        if (ctxTurmas && tendencias.porTurma) {
            if (this.graficos.turmas) this.graficos.turmas.destroy();
            this.graficos.turmas = new Chart(ctxTurmas, {
                type: 'bar',
                data: {
                    labels: tendencias.porTurma.map(t => t.turma),
                    datasets: [{
                        label: 'Atendimentos',
                        data: tendencias.porTurma.map(t => t.count),
                        backgroundColor: '#f59e0b',
                        borderRadius: 8
                    }]
                },
                options: { responsive: true, maintainAspectRatio: true, indexAxis: 'y' }
            });
        }
        
        // Gráfico de Distribuição por Horário
        const ctxHorario = document.getElementById('chartHorario')?.getContext('2d');
        if (ctxHorario && tendencias.distribuicaoHoraria) {
            if (this.graficos.horario) this.graficos.horario.destroy();
            const horas = Array.from({length: 24}, (_, i) => `${i}:00`);
            this.graficos.horario = new Chart(ctxHorario, {
                type: 'line',
                data: {
                    labels: horas,
                    datasets: [{
                        label: 'Atendimentos',
                        data: tendencias.distribuicaoHoraria,
                        borderColor: '#0891b2',
                        backgroundColor: 'rgba(8, 145, 178, 0.1)',
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: { responsive: true, maintainAspectRatio: true }
            });
        }
    }

    renderizarTabelaAtendimentos() {
        const inicio = (this.paginaAtual - 1) * this.itensPorPagina;
        const fim = inicio + this.itensPorPagina;
        const paginaAtendimentos = this.atendimentosFiltrados.slice(inicio, fim);
        
        const tbody = document.getElementById('tabelaAtendimentosBody');
        if (tbody) {
            tbody.innerHTML = this.renderLinhasAtendimentos(paginaAtendimentos);
        }
        
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
        if (btnProxima) btnProxima.disabled = this.paginaAtual === totalPaginas;
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
        const desfecho = document.getElementById('filtroDesfecho')?.value || 'todos';
        const turma = document.getElementById('filtroTurma')?.value || 'todas';
        
        this.atendimentosFiltrados = this.atendimentos.filter(a => {
            const matchBusca = busca === '' || a.alunoNome.toLowerCase().includes(busca);
            const matchStatus = status === 'todos' || a.status === status;
            const matchDesfecho = desfecho === 'todos' || a.saida?.desfecho === desfecho;
            const matchTurma = turma === 'todas' || a.alunoTurma === turma;
            return matchBusca && matchStatus && matchDesfecho && matchTurma;
        });
        
        this.paginaAtual = 1;
        this.renderizarTabelaAtendimentos();
        
        const badge = document.getElementById('resultadosBadge');
        if (badge) badge.textContent = `${this.atendimentosFiltrados.length} atendimentos`;
    }

    limparFiltros() {
        document.getElementById('buscaAtendimento').value = '';
        document.getElementById('filtroStatus').value = 'todos';
        document.getElementById('filtroDesfecho').value = 'todos';
        document.getElementById('filtroTurma').value = 'todas';
        this.atendimentosFiltrados = [...this.atendimentos];
        this.paginaAtual = 1;
        this.renderizarTabelaAtendimentos();
        
        const badge = document.getElementById('resultadosBadge');
        if (badge) badge.textContent = `${this.atendimentosFiltrados.length} atendimentos`;
    }

    async atualizarDados() {
        console.log('🔄 Atualizando dados...');
        
        const refreshBtn = document.querySelector('.btn-refresh i');
        if (refreshBtn) {
            refreshBtn.className = 'fas fa-spinner fa-spin';
        }
        
        try {
            const [dashboardRes, atendimentosRes] = await Promise.all([
                fetch(`${this.apiBase}/dashboard`, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
                }),
                fetch(`${this.apiBase}/atendimentos?limit=50`, {
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
                
                // Atualizar cards
                this.atualizarCards();
                
                // Atualizar gráficos
                this.inicializarGraficos();
                
                // Atualizar queixas
                const queixasList = document.getElementById('queixasList');
                if (queixasList) queixasList.innerHTML = this.renderQueixasComuns();
                
                // Atualizar tabela
                this.renderizarTabelaAtendimentos();
                
                console.log('✅ Dados atualizados!');
            }
        } catch (error) {
            console.error('❌ Erro ao atualizar:', error);
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
            cards[5].textContent = stats.tempoMedioMinutos || 0;
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
            
            // 🔥 USAR DATAS FORMATADAS DO BACKEND
            const dataEntrada = a.entrada.dataHoraFormatada || new Date(a.entrada.dataHora).toLocaleString('pt-BR');
            const dataSaida = a.saida?.dataHoraFormatada || (a.saida?.dataHora ? new Date(a.saida.dataHora).toLocaleString('pt-BR') : 'Aguardando finalização');
            
            const modalBody = document.getElementById('modalBody');
            modalBody.innerHTML = `
                <div style="padding: 20px; max-height: 70vh; overflow-y: auto;">
                    <div style="text-align: center; margin-bottom: 20px;">
                        <div style="width: 80px; height: 80px; background: linear-gradient(135deg, #0891b2, #06b6d4); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto;">
                            <i class="fas fa-notes-medical" style="font-size: 36px; color: white;"></i>
                        </div>
                        <h2 style="margin: 15px 0 5px;">${a.alunoNome}</h2>
                        <p style="color: #6b7280;">${a.alunoTurma} • ${a.alunoCurso || ''}</p>
                    </div>
                    
                    <!-- CARD DE DATAS E HORÁRIOS -->
                    <div style="background: #f0f9ff; border-radius: 12px; padding: 15px; margin-bottom: 20px; border: 1px solid #bae6fd;">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                            <div style="text-align: center;">
                                <div style="font-size: 11px; color: #0369a1; margin-bottom: 4px;">
                                    <i class="fas fa-calendar-alt"></i> DATA/HORA ENTRADA
                                </div>
                                <div style="font-size: 14px; font-weight: 600; color: #0c4a6e;">${dataEntrada}</div>
                            </div>
                            <div style="text-align: center;">
                                <div style="font-size: 11px; color: #0369a1; margin-bottom: 4px;">
                                    <i class="fas fa-calendar-check"></i> DATA/HORA SAÍDA
                                </div>
                                <div style="font-size: 14px; font-weight: 600; color: ${a.saida ? '#10b981' : '#f59e0b'};">${dataSaida}</div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- QUEIXA -->
                    <div style="background: #f8fafc; border-radius: 12px; padding: 15px; margin-bottom: 15px; border: 1px solid #e5e7eb;">
                        <h4 style="margin: 0 0 10px; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-stethoscope" style="color: #0891b2;"></i> Queixa
                        </h4>
                        <p style="margin: 0; background: white; padding: 12px; border-radius: 8px;">${a.entrada.queixa}</p>
                        ${a.entrada.observacoes ? `<p style="margin: 10px 0 0; color: #6b7280;"><strong>Obs:</strong> ${a.entrada.observacoes}</p>` : ''}
                        <p style="margin: 10px 0 0; font-size: 12px; color: #6b7280;">
                            <i class="fas fa-user"></i> Registrado por: ${a.entrada.registradoPor}
                        </p>
                    </div>
                    
                    <!-- DESFECHO -->
                    ${a.saida ? `
                        <div style="background: #d1fae5; border-radius: 12px; padding: 15px; border: 1px solid #10b981;">
                            <h4 style="margin: 0 0 10px; display: flex; align-items: center; gap: 8px;">
                                <i class="fas fa-flag-checkered" style="color: #10b981;"></i> Desfecho
                            </h4>
                            <p><strong>${a.saida.desfechoTexto}</strong></p>
                            ${a.saida.observacoes ? `<p style="margin: 10px 0 0;">${a.saida.observacoes}</p>` : ''}
                            <p style="margin: 10px 0 0; font-size: 12px; color: #6b7280;">
                                <i class="fas fa-user"></i> Registrado por: ${a.saida.registradoPor}
                            </p>
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
            
            document.getElementById('modalTitle').innerHTML = '<i class="fas fa-info-circle"></i> Detalhes do Atendimento';
            document.getElementById('modalSaveBtn').style.display = 'none';
            
            if (window.admin && typeof window.admin.openModal === 'function') {
                window.admin.openModal();
            }
            
        } catch (error) {
            console.error('❌ Erro:', error);
            if (window.admin && typeof window.admin.showToast === 'function') {
                window.admin.showToast('❌ ' + error.message, 'error');
            }
        }
    }

    async excluirAtendimento(atendimentoId, alunoNome) {
        const confirmar = await this.confirmar(
            '🗑️ Excluir Atendimento',
            `Tem certeza que deseja excluir o atendimento de <strong>${alunoNome}</strong>?<br><br>
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
                if (window.admin && typeof window.admin.showToast === 'function') {
                    window.admin.showToast('✅ Atendimento excluído!', 'success');
                }
                await this.atualizarDados();
            } else {
                throw new Error(data.error || 'Erro ao excluir');
            }
            
        } catch (error) {
            console.error('❌ Erro:', error);
            if (window.admin && typeof window.admin.showToast === 'function') {
                window.admin.showToast('❌ ' + error.message, 'error');
            }
        }
    }

    async exportarCSV() {
        if (!this.atendimentosFiltrados || this.atendimentosFiltrados.length === 0) {
            if (window.admin && typeof window.admin.showToast === 'function') {
                window.admin.showToast('❌ Nenhum dado para exportar', 'error');
            }
            return;
        }
        
        const headers = ['Aluno', 'Matrícula', 'Turma', 'Queixa', 'Data Entrada', 'Status', 'Desfecho', 'Data Saída'];
        const rows = this.atendimentosFiltrados.map(a => [
            a.alunoNome,
            a.alunoMatricula || '',
            a.alunoTurma || '',
            a.queixa.replace(/,/g, ';'),
            new Date(a.dataEntrada).toLocaleString('pt-BR'),
            a.status === 'em_atendimento' ? 'Em andamento' : 'Finalizado',
            a.saida?.desfechoTexto || '',
            a.saida?.dataHora ? new Date(a.saida.dataHora).toLocaleString('pt-BR') : ''
        ]);
        
        const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
        const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `enfermaria-${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        
        if (window.admin && typeof window.admin.showToast === 'function') {
            window.admin.showToast('✅ CSV exportado!', 'success');
        }
    }

    filtrarPorStatus(status) {
        const select = document.getElementById('filtroStatus');
        if (select) {
            select.value = status;
            this.aplicarFiltros();
        }
    }

    filtrarPorPeriodo(periodo) {
        // Implementar se necessário
        console.log('Filtrando por período:', periodo);
    }

    confirmar(titulo, mensagem) {
        return new Promise((resolve) => {
            if (window.admin && typeof window.admin.confirmar === 'function') {
                resolve(window.admin.confirmar(titulo, mensagem));
            } else {
                resolve(confirm(mensagem));
            }
        });
    }

    configurarEventos() {
        const buscaInput = document.getElementById('buscaAtendimento');
        if (buscaInput) {
            buscaInput.addEventListener('keyup', () => this.aplicarFiltros());
        }
        
        const statusSelect = document.getElementById('filtroStatus');
        if (statusSelect) {
            statusSelect.addEventListener('change', () => this.aplicarFiltros());
        }
        
        const desfechoSelect = document.getElementById('filtroDesfecho');
        if (desfechoSelect) {
            desfechoSelect.addEventListener('change', () => this.aplicarFiltros());
        }
        
        const turmaSelect = document.getElementById('filtroTurma');
        if (turmaSelect) {
            turmaSelect.addEventListener('change', () => this.aplicarFiltros());
        }
    }
}

// Inicializar globalmente
window.MonitoramentoEnfermaria = MonitoramentoEnfermaria;
window.monitoramentoEnfermaria = null;

// Aguardar carregamento do DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.monitoramentoEnfermaria = new MonitoramentoEnfermaria();
    });
} else {
    window.monitoramentoEnfermaria = new MonitoramentoEnfermaria();
}