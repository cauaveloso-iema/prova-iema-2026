// js/protocolo-provas-module.js
// ============================================================================
// MÓDULO: PROTOCOLO DE PROVAS
// Registra o recebimento de provas dos professores
// ============================================================================

const ProtocoloProvasModule = (function() {
    'use strict';

    // ============ ESTADO ============
    const state = {
        professores: [],
        turmas: [],
        protocolos: [],
        relatorioAtual: null,
        editandoId: null,
        professorSelecionado: null,
        turmasAdicionadas: [], // [{ turma, quantidadeProvas, alunos: [] }]
        charts: { tipo: null, periodo: null, professor: null },
        paginacao: { pagina: 1, porPagina: 10, total: 0, totalPaginas: 0 },
        filtros: {
            mes: '',
            busca: '',
            tipoProva: '',
            periodo: ''
        },
        // Assinatura
        sessaoAssinatura: {
            sessaoId: null,
            assinaturaCapturada: null,
            qrCodeDataUrl: null,
            intervaloMonitoramento: null
        }
    };

    // ============ HELPERS ============
    function getToken() {
        return localStorage.getItem('auth_token');
    }

    function getDataLocalISO(dateObj) {
        const d = dateObj || new Date();
        return d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0');
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function gerarAvatarSVG(nome) {
        const inicial = (nome || '?').charAt(0).toUpperCase();
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80"><circle cx="40" cy="40" r="40" fill="#1e3c72"/><text x="40" y="40" font-family="Arial" font-size="36" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="central">${inicial}</text></svg>`;
        return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
    }

    function gerarUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // ============================================
    // 🚀 INICIALIZAÇÃO
    // ============================================
    async function init() {
        console.log('📋 Inicializando módulo de Protocolo de Provas...');

        const content = document.getElementById('content');
        if (!content) {
            console.error('❌ Container #content não encontrado');
            return;
        }

        content.innerHTML = `
            <div style="text-align: center; padding: 60px;">
                <div style="width: 50px; height: 50px; border: 5px solid #f3f3f3; border-top: 5px solid #1e3c72; border-radius: 50%; margin: 0 auto 20px; animation: spinProt 1s linear infinite;"></div>
                <p style="color: #6b7280;">Carregando Protocolo de Provas...</p>
            </div>
            <style>@keyframes spinProt { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
        `;

        await Promise.all([
            carregarProfessores(),
            carregarTurmas()
        ]);

        renderizarInterface();
        await carregarLista();
    }

    // ============================================
    // 📥 CARREGAR PROFESSORES
    // ============================================
    async function carregarProfessores() {
        try {
            const response = await fetch('/api/protocolo-provas/professores', {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            const data = await response.json();
            if (data.success) {
                state.professores = data.professores || [];
                console.log(`✅ ${state.professores.length} professores carregados`);
            }
        } catch (error) {
            console.error('❌ Erro ao carregar professores:', error);
        }
    }

    // ============================================
    // 📥 CARREGAR TURMAS
    // ============================================
    async function carregarTurmas() {
        try {
            const response = await fetch('/api/protocolo-provas/turmas', {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            const data = await response.json();
            if (data.success) {
                state.turmas = data.turmas || [];
                console.log(`✅ ${state.turmas.length} turmas carregadas`);
            }
        } catch (error) {
            console.error('❌ Erro ao carregar turmas:', error);
        }
    }

    // ============================================
    // 🎨 RENDERIZAR INTERFACE PRINCIPAL
    // ============================================
    function renderizarInterface() {
        const content = document.getElementById('content');
        if (!content) return;

        const hoje = getDataLocalISO();
        const mesAtual = new Date().toISOString().substring(0, 7);

        state.filtros.mes = mesAtual;

        content.innerHTML = `
            <div class="protocolo-provas-container">
                <!-- HEADER -->
                <div class="prot-header">
                    <div class="prot-header-left">
                        <div class="prot-header-icon">
                            <i class="fas fa-file-signature"></i>
                        </div>
                        <div class="prot-header-text">
                            <h1>Protocolo de Provas</h1>
                            <p>Registre o recebimento das provas dos professores</p>
                        </div>
                    </div>
                    <div class="prot-header-actions">
                        <button class="prot-btn-refresh" onclick="ProtocoloProvasModule.recarregar()">
                            <i class="fas fa-sync-alt"></i>
                        </button>
                    </div>
                </div>

                <!-- TABS CORRIGIDAS -->
                <ul class="nav nav-tabs mb-3" role="tablist" style="border-bottom: 2px solid #e5e7eb;">
                    <li class="nav-item">
                        <button class="nav-link active" id="prot-registrar-tab" data-bs-toggle="tab" data-bs-target="#prot-registrar" type="button" style="color: #1e3c72; font-weight: 600;">
                            <i class="fas fa-plus-circle"></i> Registrar
                        </button>
                    </li>
                    <li class="nav-item">
                        <button class="nav-link" id="prot-lista-tab" data-bs-toggle="tab" data-bs-target="#prot-lista" type="button" style="color: #4b5563; font-weight: 600;">
                            <i class="fas fa-list"></i> Protocolos
                            <span class="badge bg-primary ms-1" id="protBadgeTotal" style="color: white !important;">0</span>
                        </button>
                    </li>
                    <li class="nav-item">
                        <button class="nav-link" id="prot-dashboard-tab" data-bs-toggle="tab" data-bs-target="#prot-dashboard" type="button" style="color: #4b5563; font-weight: 600;">
                            <i class="fas fa-chart-line"></i> Dashboard
                        </button>
                    </li>
                </ul>

                <div class="tab-content">
                    <!-- ============================================ -->
                    <!-- TAB: REGISTRAR -->
                    <!-- ============================================ -->
                    <div class="tab-pane fade show active" id="prot-registrar">

                        <!-- ETAPA 1: PROFESSOR -->
                        <div class="prot-card" id="protCardProfessor">
                            <div class="prot-etapa-header">
                                <div class="prot-etapa-numero">1</div>
                                <div class="prot-etapa-titulo">
                                    <h5><i class="fas fa-user-tie me-2"></i> Selecionar Professor</h5>
                                    <small>Busque o professor que entregou as provas</small>
                                </div>
                            </div>

                            <div id="protProfessorSelecionado" class="prot-professor-box" style="display: none;"></div>

                            <div class="prot-search-box mt-3">
                                <i class="fas fa-search"></i>
                                <input type="text" id="protBuscaProfessor" placeholder="Buscar professor por nome, email ou matrícula..." autocomplete="off">
                            </div>

                            <div id="protListaProfessores" class="prot-professor-list mt-3">
                                <div class="text-center py-3">
                                    <div class="loading"></div>
                                    <p>Carregando professores...</p>
                                </div>
                            </div>
                        </div>

                        <!-- ETAPA 2: DADOS DO RECEBIMENTO -->
                        <div class="prot-card" id="protCardDados" style="display: none;">
                            <div class="prot-etapa-header">
                                <div class="prot-etapa-numero">2</div>
                                <div class="prot-etapa-titulo">
                                    <h5><i class="fas fa-calendar-alt me-2"></i> Dados do Recebimento</h5>
                                    <small>Informe data, tipo de prova e período</small>
                                </div>
                            </div>

                            <div class="row g-3 mt-3">
                                <div class="col-md-4">
                                    <label class="prot-label">Data do Recebimento <span class="text-danger">*</span></label>
                                    <input type="date" id="protDataRecebimento" class="form-control prot-input" value="${hoje}">
                                </div>
                                <div class="col-md-4">
                                    <label class="prot-label">Tipo de Prova <span class="text-danger">*</span></label>
                                    <select id="protTipoProva" class="form-select prot-input" onchange="ProtocoloProvasModule.onTipoProvaChange()">
                                        <option value="">Selecione...</option>
                                        <option value="AV1">AV1</option>
                                        <option value="AV2">AV2</option>
                                        <option value="AV3">AV3</option>
                                        <option value="AV4">AV4</option>
                                        <option value="2CHAMADA">2ª Chamada</option>
                                        <option value="RECUPERACAO">Recuperação</option>
                                        <option value="FINAL">Prova Final</option>
                                        <option value="OUTROS">Outros</option>
                                    </select>
                                </div>
                                <div class="col-md-4">
                                    <label class="prot-label">Período <span class="text-danger">*</span></label>
                                    <select id="protPeriodo" class="form-select prot-input">
                                        <option value="">Selecione...</option>
                                        <option value="1">1º Período</option>
                                        <option value="2">2º Período</option>
                                        <option value="3">3º Período</option>
                                        <option value="4">4º Período</option>
                                    </select>
                                </div>
                            </div>

                            <div class="mt-3" id="protTipoProvaOutrosDiv" style="display: none;">
                                <label class="prot-label">Especifique o Tipo de Prova <span class="text-danger">*</span></label>
                                <input type="text" id="protTipoProvaOutros" class="form-control prot-input" placeholder="Ex: Avaliação Prática, Trabalho...">
                            </div>
                        </div>

                        <!-- ETAPA 3: TURMAS -->
                        <div class="prot-card" id="protCardTurmas" style="display: none;">
                            <div class="prot-etapa-header">
                                <div class="prot-etapa-numero">3</div>
                                <div class="prot-etapa-titulo">
                                    <h5><i class="fas fa-users me-2"></i> Turmas e Alunos</h5>
                                    <small>Adicione as turmas e selecione os alunos que entregaram</small>
                                </div>
                            </div>

                            <div class="row g-3 mt-3 align-items-end">
                                <div class="col-md-4">
                                    <label class="prot-label">Turma <span class="text-danger">*</span></label>
                                    <select id="protSelectTurma" class="form-select prot-input">
                                        <option value="">Selecione a turma...</option>
                                        ${state.turmas.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('')}
                                    </select>
                                </div>
                                <div class="col-md-3">
                                    <label class="prot-label">Quantidade de Provas <span class="text-danger">*</span></label>
                                    <input type="number" id="protQuantidadeProvas" class="form-control prot-input" min="1" max="200" placeholder="Ex: 3">
                                </div>
                                <div class="col-md-5">
                                    <button class="btn btn-primary w-100" onclick="ProtocoloProvasModule.adicionarTurma()" id="protBtnAddTurma" style="background: #1e3c72; border: none; padding: 10px; border-radius: 10px;">
                                        <i class="fas fa-plus"></i> Adicionar Turma
                                    </button>
                                </div>
                            </div>

                            <!-- Lista de turmas adicionadas -->
                            <div id="protTurmasAdicionadas" class="mt-4"></div>
                        </div>

                        <!-- ETAPA 4: OBSERVAÇÕES E ASSINATURA -->
                        <div class="prot-card" id="protCardFinal" style="display: none;">
                            <div class="prot-etapa-header">
                                <div class="prot-etapa-numero">4</div>
                                <div class="prot-etapa-titulo">
                                    <h5><i class="fas fa-clipboard-check me-2"></i> Finalização</h5>
                                    <small>Observações e assinatura do professor</small>
                                </div>
                            </div>

                            <div class="mt-3">
                                <label class="prot-label">Observações</label>
                                <textarea id="protObservacoes" class="form-control prot-input" rows="3" placeholder="Informações adicionais..."></textarea>
                            </div>

                            <div class="mt-3">
                                <div class="prot-assinatura-box">
                                    <div class="form-check p-3" style="background: #f8fafc; border-radius: 10px; border: 2px solid #e2e8f0;">
                                        <input class="form-check-input" type="checkbox" id="protNecessitaAssinatura"
                                            onchange="ProtocoloProvasModule.toggleAssinatura()"
                                            style="width: 20px; height: 20px; margin-top: 2px;">
                                        <label class="form-check-label" for="protNecessitaAssinatura" style="margin-left: 8px; cursor: pointer;">
                                            <strong><i class="fas fa-signature"></i> Necessita de assinatura do professor</strong>
                                            <p style="margin: 5px 0 0; font-size: 13px; color: #64748b;">
                                                Marque para gerar um QR Code. O professor escaneia e assina no celular dele.
                                            </p>
                                        </label>
                                    </div>
                                    <div id="protBlocoAssinatura" style="display: none;"></div>
                                </div>
                            </div>

                            <div class="prot-resumo mt-4" id="protResumo"></div>

                            <div class="d-flex gap-2 mt-4 justify-content-end">
                                <button class="btn btn-secondary" onclick="ProtocoloProvasModule.resetarFormulario()" style="border-radius: 10px;">
                                    <i class="fas fa-times me-2"></i> Cancelar
                                </button>
                                <button class="btn btn-primary" onclick="ProtocoloProvasModule.registrarProtocolo()" id="protBtnRegistrar" style="background: #1e3c72; border: none; border-radius: 10px;">
                                    <i class="fas fa-save me-2"></i> Registrar Protocolo
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- ============================================ -->
                    <!-- TAB: LISTA -->
                    <!-- ============================================ -->
                    <div class="tab-pane fade" id="prot-lista">
                        <div class="prot-card mb-3">
                            <div class="prot-etapa-header" style="border-bottom: 1px solid #e5e7eb; padding-bottom: 15px;">
                                <h6 class="mb-0"><i class="fas fa-filter me-2"></i> Filtros</h6>
                            </div>
                            <div class="row g-3 mt-3">
                                <div class="col-md-2">
                                    <label class="prot-label">Mês</label>
                                    <input type="month" id="protFiltroMes" class="form-control prot-input" value="${mesAtual}">
                                </div>
                                <div class="col-md-3">
                                    <label class="prot-label">Buscar</label>
                                    <input type="text" id="protFiltroBusca" class="form-control prot-input" placeholder="Professor, código, turma...">
                                </div>
                                <div class="col-md-2">
                                    <label class="prot-label">Tipo</label>
                                    <select id="protFiltroTipo" class="form-select prot-input">
                                        <option value="">Todos</option>
                                        <option value="AV1">AV1</option>
                                        <option value="AV2">AV2</option>
                                        <option value="AV3">AV3</option>
                                        <option value="AV4">AV4</option>
                                        <option value="2CHAMADA">2ª Chamada</option>
                                        <option value="RECUPERACAO">Recuperação</option>
                                        <option value="FINAL">Final</option>
                                        <option value="OUTROS">Outros</option>
                                    </select>
                                </div>
                                <div class="col-md-2">
                                    <label class="prot-label">Período</label>
                                    <select id="protFiltroPeriodo" class="form-select prot-input">
                                        <option value="">Todos</option>
                                        <option value="1">1º</option>
                                        <option value="2">2º</option>
                                        <option value="3">3º</option>
                                        <option value="4">4º</option>
                                    </select>
                                </div>
                                <div class="col-md-3 d-flex align-items-end gap-2">
                                    <button class="btn btn-secondary flex-fill" onclick="ProtocoloProvasModule.limparFiltros()" style="border-radius: 10px;">
                                        <i class="fas fa-eraser"></i> Limpar
                                    </button>
                                    <button class="btn btn-primary flex-fill" onclick="ProtocoloProvasModule.carregarLista(1)" style="background: #1e3c72; border: none; border-radius: 10px;">
                                        <i class="fas fa-search"></i> Buscar
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div class="prot-card">
                            <div class="d-flex justify-content-between align-items-center mb-3">
                                <h6 class="mb-0"><i class="fas fa-list me-2"></i> Protocolos Registrados</h6>
                                <span class="badge bg-primary" id="protContadorLista" style="background: #1e3c72 !important;">0 registros</span>
                            </div>
                            <div id="protListaProtocolos">
                                <div class="text-center py-5">
                                    <div class="loading"></div>
                                    <p>Carregando protocolos...</p>
                                </div>
                            </div>
                            <div id="protPaginacao" class="mt-3"></div>
                        </div>
                    </div>

                    <!-- ============================================ -->
                    <!-- TAB: DASHBOARD -->
                    <!-- ============================================ -->
                    <div class="tab-pane fade" id="prot-dashboard">
                        <div class="prot-card mb-3">
                            <div class="row g-3 align-items-end">
                                <div class="col-md-4">
                                    <label class="prot-label">Mês de Referência</label>
                                    <input type="month" id="protDashboardMes" class="form-control prot-input" value="${mesAtual}">
                                </div>
                                <div class="col-md-3">
                                    <button class="btn btn-primary w-100" onclick="ProtocoloProvasModule.carregarDashboard()" style="background: #1e3c72; border: none; border-radius: 10px;">
                                        <i class="fas fa-sync-alt me-2"></i> Atualizar
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div class="row mb-4">
                            <div class="col-md-3 mb-3">
                                <div class="prot-metric-card" style="background: linear-gradient(135deg, #1e3c72, #2a5298);">
                                    <i class="fas fa-file-signature fa-2x mb-2"></i>
                                    <div class="prot-metric-value" id="protStatTotalMes">0</div>
                                    <div class="prot-metric-label">Protocolos no Mês</div>
                                </div>
                            </div>
                            <div class="col-md-3 mb-3">
                                <div class="prot-metric-card" style="background: linear-gradient(135deg, #10b981, #059669);">
                                    <i class="fas fa-file-alt fa-2x mb-2"></i>
                                    <div class="prot-metric-value" id="protStatProvasMes">0</div>
                                    <div class="prot-metric-label">Provas Recebidas</div>
                                </div>
                            </div>
                            <div class="col-md-3 mb-3">
                                <div class="prot-metric-card" style="background: linear-gradient(135deg, #f59e0b, #d97706);">
                                    <i class="fas fa-calendar-week fa-2x mb-2"></i>
                                    <div class="prot-metric-value" id="protStatSemana">0</div>
                                    <div class="prot-metric-label">Esta Semana</div>
                                </div>
                            </div>
                            <div class="col-md-3 mb-3">
                                <div class="prot-metric-card" style="background: linear-gradient(135deg, #8b5cf6, #7c3aed);">
                                    <i class="fas fa-database fa-2x mb-2"></i>
                                    <div class="prot-metric-value" id="protStatTotalGeral">0</div>
                                    <div class="prot-metric-label">Total Geral</div>
                                </div>
                            </div>
                        </div>

                        <div class="row">
                            <div class="col-md-6 mb-4">
                                <div class="prot-card h-100">
                                    <h6 class="mb-3"><i class="fas fa-chart-pie text-primary"></i> Por Tipo de Prova</h6>
                                    <canvas id="protChartTipo"></canvas>
                                </div>
                            </div>
                            <div class="col-md-6 mb-4">
                                <div class="prot-card h-100">
                                    <h6 class="mb-3"><i class="fas fa-chart-bar text-success"></i> Por Período</h6>
                                    <canvas id="protChartPeriodo"></canvas>
                                </div>
                            </div>
                        </div>

                        <div class="row">
                            <div class="col-md-6 mb-4">
                                <div class="prot-card h-100">
                                    <h6 class="mb-3"><i class="fas fa-trophy text-warning"></i> Top Professores</h6>
                                    <div id="protRankingProfessores" class="mt-3"></div>
                                </div>
                            </div>
                            <div class="col-md-6 mb-4">
                                <div class="prot-card h-100">
                                    <h6 class="mb-3"><i class="fas fa-school text-info"></i> Top Turmas</h6>
                                    <div id="protRankingTurmas" class="mt-3"></div>
                                </div>
                            </div>
                        </div>

                        <div class="prot-card">
                            <h6 class="mb-3"><i class="fas fa-history"></i> Últimos Protocolos</h6>
                            <div id="protUltimosProtocolos" class="mt-3"></div>
                        </div>
                    </div>
                </div>
            </div>

            <style>
                /* ========== ESTILOS DO MÓDULO ========== */
                .protocolo-provas-container { padding: 20px; max-width: 1400px; margin: 0 auto; }
                
                /* 🔥 CORREÇÃO DAS ABAS */
                .nav-tabs .nav-link { color: #4b5563 !important; border: none; border-bottom: 3px solid transparent; padding: 10px 15px; font-size: 14px; transition: all 0.2s; }
                .nav-tabs .nav-link:hover { color: #1e3c72 !important; background: #f8fafc; }
                .nav-tabs .nav-link.active { color: #1e3c72 !important; border-bottom: 3px solid #1e3c72; background: transparent; }
                
                .prot-header {
                    background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
                    border-radius: 20px;
                    padding: 25px 30px;
                    margin-bottom: 25px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    box-shadow: 0 10px 30px rgba(30, 60, 114, 0.3);
                }
                .prot-header-left { display: flex; align-items: center; gap: 20px; }
                .prot-header-icon {
                    width: 65px; height: 65px;
                    background: rgba(255,255,255,0.18);
                    border-radius: 18px;
                    display: flex; align-items: center; justify-content: center;
                    font-size: 28px; color: white;
                    backdrop-filter: blur(10px);
                }
                .prot-header-text h1 { color: white; font-size: 26px; font-weight: 700; margin: 0 0 4px; }
                .prot-header-text p { color: rgba(255,255,255,0.9); font-size: 14px; margin: 0; }
                .prot-btn-refresh {
                    background: rgba(255,255,255,0.15);
                    border: 1px solid rgba(255,255,255,0.3);
                    color: white;
                    padding: 12px;
                    border-radius: 50%;
                    cursor: pointer;
                    font-size: 16px;
                    width: 45px; height: 45px;
                    display: flex; align-items: center; justify-content: center;
                    transition: all 0.3s;
                }
                .prot-btn-refresh:hover { background: rgba(255,255,255,0.3); transform: rotate(180deg); }
                
                .prot-card {
                    background: white;
                    border-radius: 16px;
                    padding: 25px;
                    margin-bottom: 20px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
                    border: 1px solid #e5e7eb;
                }
                
                .prot-etapa-header {
                    display: flex;
                    align-items: center;
                    gap: 15px;
                    padding-bottom: 15px;
                    border-bottom: 2px solid #f1f5f9;
                }
                .prot-etapa-numero {
                    width: 40px; height: 40px;
                    background: linear-gradient(135deg, #1e3c72, #2a5298);
                    color: white;
                    border-radius: 50%;
                    display: flex; align-items: center; justify-content: center;
                    font-weight: 700; font-size: 18px;
                    flex-shrink: 0;
                }
                .prot-etapa-titulo h5 { margin: 0; font-size: 16px; font-weight: 700; color: #1e293b; }
                .prot-etapa-titulo small { color: #64748b; font-size: 13px; }
                
                .prot-label {
                    display: block;
                    font-weight: 600;
                    font-size: 13px;
                    color: #374151;
                    margin-bottom: 6px;
                }
                .prot-input {
                    border: 2px solid #e5e7eb !important;
                    border-radius: 10px !important;
                    padding: 10px 14px !important;
                    font-size: 14px !important;
                    transition: all 0.2s;
                }
                .prot-input:focus {
                    border-color: #1e3c72 !important;
                    box-shadow: 0 0 0 3px rgba(30,60,114,0.1) !important;
                    outline: none;
                }
                
                .prot-search-box {
                    position: relative;
                }
                .prot-search-box i {
                    position: absolute;
                    left: 15px; top: 50%;
                    transform: translateY(-50%);
                    color: #9ca3af;
                    font-size: 14px;
                }
                .prot-search-box input {
                    width: 100%;
                    padding: 12px 16px 12px 42px;
                    border: 2px solid #e5e7eb;
                    border-radius: 12px;
                    font-size: 14px;
                    outline: none;
                    transition: all 0.2s;
                }
                .prot-search-box input:focus {
                    border-color: #1e3c72;
                    box-shadow: 0 0 0 3px rgba(30,60,114,0.1);
                }
                
                .prot-professor-list {
                    max-height: 350px;
                    overflow-y: auto;
                }
                .prot-professor-item {
                    display: flex;
                    align-items: center;
                    gap: 14px;
                    padding: 14px 18px;
                    background: white;
                    border: 2px solid #e5e7eb;
                    border-radius: 12px;
                    margin-bottom: 8px;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .prot-professor-item:hover {
                    border-color: #c7d2fe;
                    background: #f8faff;
                    transform: translateX(4px);
                }
                .prot-professor-item.selected {
                    border-color: #1e3c72;
                    background: #eef2ff;
                }
                .prot-prof-avatar {
                    width: 48px; height: 48px;
                    border-radius: 12px;
                    background: linear-gradient(135deg, #1e3c72, #2a5298);
                    color: white;
                    display: flex; align-items: center; justify-content: center;
                    font-weight: 700; font-size: 18px;
                    flex-shrink: 0;
                }
                .prot-prof-info { flex: 1; min-width: 0; }
                .prot-prof-nome { font-weight: 700; color: #1e293b; font-size: 15px; margin-bottom: 4px; }
                .prot-prof-detalhes {
                    font-size: 12px; color: #64748b;
                    display: flex; flex-wrap: wrap; gap: 12px;
                }
                
                .prot-professor-box {
                    background: linear-gradient(135deg, #eef2ff, #e0e7ff);
                    border: 2px solid #1e3c72;
                    border-radius: 16px;
                    padding: 18px;
                    margin-bottom: 15px;
                }
                .prot-professor-box-content {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                }
                .prot-professor-box-avatar {
                    width: 60px; height: 60px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #1e3c72, #2a5298);
                    color: white;
                    display: flex; align-items: center; justify-content: center;
                    font-size: 24px; font-weight: 700;
                    flex-shrink: 0;
                }
                .prot-professor-box-info { flex: 1; }
                .prot-professor-box-info h5 { margin: 0 0 4px; color: #1e3c72; font-weight: 700; }
                .prot-professor-box-info p { margin: 0; font-size: 13px; color: #4b5563; }
                
                .prot-turma-item {
                    background: #f8fafc;
                    border: 2px solid #e5e7eb;
                    border-radius: 12px;
                    padding: 16px;
                    margin-bottom: 10px;
                }
                .prot-turma-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 12px;
                }
                .prot-turma-nome {
                    font-size: 16px;
                    font-weight: 700;
                    color: #1e3c72;
                }
                .prot-alunos-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
                    gap: 8px;
                    margin-top: 10px;
                }
                .prot-aluno-check {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 10px 12px;
                    background: white;
                    border: 2px solid #e5e7eb;
                    border-radius: 10px;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .prot-aluno-check:hover { border-color: #c7d2fe; background: #f8faff; }
                .prot-aluno-check.selected { border-color: #10b981; background: #ecfdf5; }
                .prot-aluno-check input { width: 18px; height: 18px; cursor: pointer; accent-color: #10b981; }
                .prot-aluno-check-info { flex: 1; min-width: 0; }
                .prot-aluno-check-nome {
                    font-weight: 600; font-size: 13px; color: #1e293b;
                    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                }
                .prot-aluno-check-mat { font-size: 11px; color: #64748b; }
                
                .prot-resumo {
                    background: linear-gradient(135deg, #f0fdf4, #dcfce7);
                    border: 2px solid #10b981;
                    border-radius: 16px;
                    padding: 20px;
                }
                .prot-resumo-titulo {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    margin-bottom: 15px;
                    font-size: 16px;
                    font-weight: 700;
                    color: #065f46;
                }
                .prot-resumo-item {
                    display: flex;
                    justify-content: space-between;
                    padding: 8px 0;
                    border-bottom: 1px solid #a7f3d0;
                    font-size: 14px;
                }
                .prot-resumo-item:last-child { border-bottom: none; font-weight: 700; font-size: 16px; }
                .prot-resumo-item strong { color: #065f46; }
                
                .prot-metric-card {
                    color: white;
                    border-radius: 16px;
                    padding: 20px;
                    text-align: center;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                    transition: transform 0.2s;
                }
                .prot-metric-card:hover { transform: translateY(-4px); }
                .prot-metric-value { font-size: 32px; font-weight: 800; line-height: 1; margin-bottom: 6px; }
                .prot-metric-label { font-size: 12px; opacity: 0.9; text-transform: uppercase; letter-spacing: 0.5px; }
                
                .prot-ranking-item {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 10px 12px;
                    background: #f8fafc;
                    border-radius: 10px;
                    margin-bottom: 8px;
                }
                .prot-ranking-pos {
                    width: 32px; height: 32px;
                    border-radius: 50%;
                    background: #e5e7eb;
                    display: flex; align-items: center; justify-content: center;
                    font-weight: 700; font-size: 13px;
                    flex-shrink: 0;
                }
                .prot-ranking-pos.gold { background: linear-gradient(135deg, #fbbf24, #f59e0b); color: white; }
                .prot-ranking-pos.silver { background: linear-gradient(135deg, #d1d5db, #9ca3af); color: white; }
                .prot-ranking-pos.bronze { background: linear-gradient(135deg, #d97706, #b45309); color: white; }
                .prot-ranking-info { flex: 1; min-width: 0; }
                .prot-ranking-nome {
                    font-weight: 600; font-size: 14px; color: #1e293b;
                    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                }
                .prot-ranking-detalhes { font-size: 11px; color: #64748b; }
                .prot-ranking-count {
                    background: #1e3c72;
                    color: white;
                    padding: 4px 12px;
                    border-radius: 20px;
                    font-weight: 700;
                    font-size: 13px;
                }
                
                .prot-status-badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 5px;
                    padding: 4px 10px;
                    border-radius: 20px;
                    font-size: 11px;
                    font-weight: 600;
                }
                .prot-status-badge.ass { background: #d1fae5; color: #065f46; }
                .prot-status-badge.sem { background: #f3f4f6; color: #6b7280; }
                .prot-status-badge.tipo { background: #dbeafe; color: #1e40af; }
                .prot-status-badge.periodo { background: #fef3c7; color: #92400e; }
                
                .prot-action-btn {
                    width: 34px; height: 34px;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    display: inline-flex; align-items: center; justify-content: center;
                    font-size: 13px;
                    transition: all 0.2s;
                    margin-right: 4px;
                }
                .prot-action-btn.view { background: #eff6ff; color: #2563eb; }
                .prot-action-btn.view:hover { background: #dbeafe; }
                .prot-action-btn.edit { background: #fef3c7; color: #d97706; }
                .prot-action-btn.edit:hover { background: #fde68a; }
                .prot-action-btn.print { background: #ecfdf5; color: #059669; }
                .prot-action-btn.print:hover { background: #d1fae5; }
                .prot-action-btn.delete { background: #fee2e2; color: #dc2626; }
                .prot-action-btn.delete:hover { background: #fecaca; }
                
                .prot-pagination {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding-top: 16px;
                    border-top: 1px solid #e5e7eb;
                    flex-wrap: wrap;
                    gap: 10px;
                }
                
                @media (max-width: 768px) {
                    .prot-header { flex-direction: column; text-align: center; }
                    .prot-alunos-grid { grid-template-columns: 1fr; }
                }
            </style>
        `;

        // Configurar eventos
        setTimeout(() => {
            configurarEventos();
            renderizarListaProfessores();
            verificarDadosParaHabilitarEtapas();
        }, 100);
    }

    // ============================================
    // 🎯 CONFIGURAR EVENTOS
    // ============================================
    function configurarEventos() {
        const busca = document.getElementById('protBuscaProfessor');
        if (busca) {
            busca.addEventListener('input', (e) => {
                filtrarProfessores(e.target.value);
            });
        }

        // 🔥 NOVO: OUVIR MUDANÇAS NA ETAPA 2 PARA LIBERAR A ETAPA 3
        ['protDataRecebimento', 'protTipoProva', 'protPeriodo'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', verificarEtapa2Completa);
                el.addEventListener('input', verificarEtapa2Completa);
            }
        });

        // Filtros da lista
        ['protFiltroMes', 'protFiltroTipo', 'protFiltroPeriodo'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', () => carregarLista(1));
        });

        const buscaLista = document.getElementById('protFiltroBusca');
        if (buscaLista) {
            let timeout;
            buscaLista.addEventListener('input', () => {
                clearTimeout(timeout);
                timeout = setTimeout(() => carregarLista(1), 500);
            });
        }
    }

    // ============================================
    // ✅ VERIFICAR SE ETAPA 2 ESTÁ COMPLETA
    // ============================================
    function verificarEtapa2Completa() {
        const data = document.getElementById('protDataRecebimento')?.value;
        const tipo = document.getElementById('protTipoProva')?.value;
        const tipoOutros = document.getElementById('protTipoProvaOutros')?.value || '';
        const periodo = document.getElementById('protPeriodo')?.value;

        let etapa2Ok = false;

        if (data && tipo && periodo) {
            if (tipo === 'OUTROS') {
                if (tipoOutros.trim() !== '') etapa2Ok = true;
            } else {
                etapa2Ok = true;
            }
        }

        const cardTurmas = document.getElementById('protCardTurmas');
        
        // Se etapa 2 estiver completa, mostra a etapa 3
        if (etapa2Ok && state.professorSelecionado) {
            if (cardTurmas && cardTurmas.style.display === 'none') {
                cardTurmas.style.display = 'block';
                // Rolar suavemente até a etapa 3
                setTimeout(() => {
                    cardTurmas.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 100);
            }
        } else {
            // Se apagar algum campo, esconde a etapa 3 e 4
            if (cardTurmas) cardTurmas.style.display = 'none';
            const cardFinal = document.getElementById('protCardFinal');
            if (cardFinal) cardFinal.style.display = 'none';
            
            // Remove as turmas adicionadas para não dar conflito
            state.turmasAdicionadas = [];
            renderizarTurmasAdicionadas();
            atualizarResumo();
        }
    }

    // ============================================
    // 👨‍🏫 RENDERIZAR LISTA DE PROFESSORES
    // ============================================
    function renderizarListaProfessores(lista) {
        const container = document.getElementById('protListaProfessores');
        if (!container) return;

        const professores = lista || state.professores;

        if (professores.length === 0) {
            container.innerHTML = `
                <div class="text-center py-4" style="color: #9ca3af;">
                    <i class="fas fa-user-slash" style="font-size: 32px; margin-bottom: 10px;"></i>
                    <p>Nenhum professor encontrado</p>
                </div>
            `;
            return;
        }

        container.innerHTML = professores.map(p => `
            <div class="prot-professor-item" data-id="${p.id}" onclick="ProtocoloProvasModule.selecionarProfessor('${p.id}')">
                <div class="prot-prof-avatar">${(p.nome || '?').charAt(0).toUpperCase()}</div>
                <div class="prot-prof-info">
                    <div class="prot-prof-nome">${escapeHtml(p.nome)}</div>
                    <div class="prot-prof-detalhes">
                        <span><i class="fas fa-envelope"></i> ${escapeHtml(p.email || 'Sem email')}</span>
                        ${p.matricula ? `<span><i class="fas fa-id-card"></i> ${escapeHtml(p.matricula)}</span>` : ''}
                        ${p.eixo ? `<span><i class="fas fa-sitemap"></i> ${escapeHtml(p.eixo)}</span>` : ''}
                    </div>
                </div>
                <i class="fas fa-chevron-right" style="color: #9ca3af;"></i>
            </div>
        `).join('');
    }

    // ============================================
    // 🔍 FILTRAR PROFESSORES
    // ============================================
    function filtrarProfessores(termo) {
        const termoLower = (termo || '').toLowerCase().trim();

        let filtrados = state.professores;
        if (termoLower) {
            filtrados = filtrados.filter(p =>
                (p.nome || '').toLowerCase().includes(termoLower) ||
                (p.email || '').toLowerCase().includes(termoLower) ||
                (p.matricula || '').toLowerCase().includes(termoLower)
            );
        }

        renderizarListaProfessores(filtrados);
    }

    // ============================================
    // ✅ SELECIONAR PROFESSOR
    // ============================================
    function selecionarProfessor(id) {
        const professor = state.professores.find(p => p.id === id);
        if (!professor) return;

        state.professorSelecionado = professor;

        // Renderizar box do professor
        const box = document.getElementById('protProfessorSelecionado');
        if (box) {
            box.style.display = 'block';
            box.innerHTML = `
                <div class="prot-professor-box-content">
                    <div class="prot-professor-box-avatar">
                        ${professor.fotoPerfil 
                            ? `<img src="${professor.fotoPerfil}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`
                            : (professor.nome || '?').charAt(0).toUpperCase()
                        }
                    </div>
                    <div class="prot-professor-box-info">
                        <h5>${escapeHtml(professor.nome)}</h5>
                        <p><i class="fas fa-envelope"></i> ${escapeHtml(professor.email || 'Sem email')}</p>
                        ${professor.matricula ? `<p><i class="fas fa-id-card"></i> Matrícula: ${escapeHtml(professor.matricula)}</p>` : ''}
                        ${professor.eixo ? `<p><i class="fas fa-sitemap"></i> Eixo: ${escapeHtml(professor.eixo)}</p>` : ''}
                    </div>
                    <button class="btn btn-sm btn-outline-danger" onclick="ProtocoloProvasModule.limparProfessor()" style="border-radius: 10px;">
                        <i class="fas fa-times"></i> Trocar
                    </button>
                </div>
            `;
        }

        // Esconder lista e busca
        const lista = document.getElementById('protListaProfessores');
        if (lista) lista.style.display = 'none';
        const buscaBox = document.querySelector('.prot-search-box');
        if (buscaBox) buscaBox.style.display = 'none';

        // Habilitar etapa 2
        verificarDadosParaHabilitarEtapas();
    }

    // ============================================
    // ❌ LIMPAR PROFESSOR
    // ============================================
    function limparProfessor() {
        state.professorSelecionado = null;

        const box = document.getElementById('protProfessorSelecionado');
        if (box) box.style.display = 'none';

        const lista = document.getElementById('protListaProfessores');
        if (lista) lista.style.display = 'block';

        const buscaBox = document.querySelector('.prot-search-box');
        if (buscaBox) buscaBox.style.display = 'block';

        const busca = document.getElementById('protBuscaProfessor');
        if (busca) busca.value = '';

        renderizarListaProfessores();

        // Esconder outras etapas
        const cardDados = document.getElementById('protCardDados');
        if (cardDados) cardDados.style.display = 'none';
        const cardTurmas = document.getElementById('protCardTurmas');
        if (cardTurmas) cardTurmas.style.display = 'none';
        const cardFinal = document.getElementById('protCardFinal');
        if (cardFinal) cardFinal.style.display = 'none';

        // Resetar dados
        state.turmasAdicionadas = [];
        state.editandoId = null;
    }

    // ============================================
    // ✅ HABILITAR ETAPAS
    // ============================================
    function verificarDadosParaHabilitarEtapas() {
        const cardDados = document.getElementById('protCardDados');
        if (cardDados && state.professorSelecionado) {
            cardDados.style.display = 'block';
        }
    }

    // ============================================
    // 🔄 ON TIPO PROVA CHANGE
    // ============================================
    function onTipoProvaChange() {
        const tipo = document.getElementById('protTipoProva')?.value;
        const div = document.getElementById('protTipoProvaOutrosDiv');
        if (div) {
            div.style.display = tipo === 'OUTROS' ? 'block' : 'none';
        }
        
        // 🔥 NOVO: Verifica se a etapa 2 foi concluída
        verificarEtapa2Completa();
    }

    // ============================================
    // ➕ ADICIONAR TURMA
    // ============================================
    async function adicionarTurma() {
        const turma = document.getElementById('protSelectTurma')?.value;
        const quantidade = parseInt(document.getElementById('protQuantidadeProvas')?.value);

        if (!turma) {
            showToast('⚠️ Selecione uma turma', 'warning');
            return;
        }

        if (!quantidade || quantidade < 1) {
            showToast('⚠️ Informe a quantidade de provas', 'warning');
            return;
        }

        // Verificar se turma já foi adicionada
        if (state.turmasAdicionadas.some(t => t.turma === turma)) {
            showToast('⚠️ Esta turma já foi adicionada', 'warning');
            return;
        }

        // Buscar alunos da turma
        try {
            showToast('🔄 Buscando alunos da turma...', 'info');

            const response = await fetch(`/api/protocolo-provas/alunos-por-turma?turma=${encodeURIComponent(turma)}`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Erro ao buscar alunos');
            }

            if (data.alunos.length === 0) {
                showToast('⚠️ Nenhum aluno encontrado nesta turma', 'warning');
                return;
            }

            if (quantidade > data.alunos.length) {
                showToast(`⚠️ A turma só tem ${data.alunos.length} aluno(s)`, 'warning');
                return;
            }

            // Adicionar à lista
            state.turmasAdicionadas.push({
                turma,
                quantidadeProvas: quantidade,
                alunosDisponiveis: data.alunos,
                alunosSelecionados: []
            });

            renderizarTurmasAdicionadas();
            verificarDadosParaHabilitarEtapas();

            // Mostrar etapa 3 e 4
            const cardTurmas = document.getElementById('protCardTurmas');
            if (cardTurmas) cardTurmas.style.display = 'block';
            const cardFinal = document.getElementById('protCardFinal');
            if (cardFinal) cardFinal.style.display = 'block';

            // Limpar campos
            document.getElementById('protSelectTurma').value = '';
            document.getElementById('protQuantidadeProvas').value = '';

            showToast(`✅ Turma ${turma} adicionada! Selecione os ${quantidade} aluno(s).`, 'success');

            // Scroll para a turma adicionada
            setTimeout(() => {
                const el = document.getElementById(`protTurma-${turma.replace(/\s/g, '_')}`);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 200);

        } catch (error) {
            console.error('❌ Erro:', error);
            showToast('❌ ' + error.message, 'error');
        }
    }

    // ============================================
    // 🎨 RENDERIZAR TURMAS ADICIONADAS
    // ============================================
    function renderizarTurmasAdicionadas() {
        const container = document.getElementById('protTurmasAdicionadas');
        if (!container) return;

        if (state.turmasAdicionadas.length === 0) {
            container.innerHTML = `
                <div class="text-center py-4" style="color: #9ca3af;">
                    <i class="fas fa-inbox" style="font-size: 32px; margin-bottom: 10px;"></i>
                    <p>Nenhuma turma adicionada ainda</p>
                </div>
            `;
            return;
        }

        container.innerHTML = state.turmasAdicionadas.map((t, index) => {
            const selecionados = t.alunosSelecionados.length;
            const completo = selecionados === t.quantidadeProvas;

            return `
                <div class="prot-turma-item" id="protTurma-${t.turma.replace(/\s/g, '_')}">
                    <div class="prot-turma-header">
                        <div>
                            <span class="prot-turma-nome">Turma ${escapeHtml(t.turma)}</span>
                            <span class="badge ${completo ? 'bg-success' : 'bg-warning text-dark'} ms-2">
                                ${selecionados}/${t.quantidadeProvas} alunos
                            </span>
                        </div>
                        <button class="btn btn-sm btn-outline-danger" onclick="ProtocoloProvasModule.removerTurma(${index})" style="border-radius: 8px;">
                            <i class="fas fa-trash"></i> Remover
                        </button>
                    </div>

                    <small class="text-muted d-block mb-2">
                        <i class="fas fa-info-circle"></i> 
                        Selecione exatamente <strong>${t.quantidadeProvas}</strong> aluno(s) que entregaram a prova
                    </small>

                    <div class="prot-alunos-grid">
                        ${t.alunosDisponiveis.map(aluno => {
                            const selecionado = t.alunosSelecionados.some(a => a.id === aluno.id);
                            return `
                                <div class="prot-aluno-check ${selecionado ? 'selected' : ''}" 
                                     onclick="ProtocoloProvasModule.toggleAluno('${t.turma.replace(/'/g, "\\'")}', '${aluno.id}')">
                                    <input type="checkbox" ${selecionado ? 'checked' : ''} onclick="event.stopPropagation(); ProtocoloProvasModule.toggleAluno('${t.turma.replace(/'/g, "\\'")}', '${aluno.id}')">
                                    <div class="prot-aluno-check-info">
                                        <div class="prot-aluno-check-nome">${escapeHtml(aluno.nome)}</div>
                                        <div class="prot-aluno-check-mat">${escapeHtml(aluno.matricula || 'Sem matrícula')}</div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        }).join('');

        atualizarResumo();
    }

    // ============================================
    // ✅ TOGGLE ALUNO
    // ============================================
    function toggleAluno(turma, alunoId) {
        const turmaObj = state.turmasAdicionadas.find(t => t.turma === turma);
        if (!turmaObj) return;

        const aluno = turmaObj.alunosDisponiveis.find(a => a.id === alunoId);
        if (!aluno) return;

        const idx = turmaObj.alunosSelecionados.findIndex(a => a.id === alunoId);

        if (idx >= 0) {
            // Remover
            turmaObj.alunosSelecionados.splice(idx, 1);
        } else {
            // Verificar limite
            if (turmaObj.alunosSelecionados.length >= turmaObj.quantidadeProvas) {
                showToast(`⚠️ Já foram selecionados ${turmaObj.quantidadeProvas} alunos. Remova um para adicionar outro.`, 'warning');
                return;
            }

            // Adicionar
            turmaObj.alunosSelecionados.push({
                id: aluno.id,
                nome: aluno.nome,
                matricula: aluno.matricula,
                curso: aluno.curso
            });
        }

        renderizarTurmasAdicionadas();
        atualizarResumo();
    }

    // ============================================
    // ❌ REMOVER TURMA
    // ============================================
    function removerTurma(index) {
        state.turmasAdicionadas.splice(index, 1);
        renderizarTurmasAdicionadas();
        atualizarResumo();

        if (state.turmasAdicionadas.length === 0) {
            const cardTurmas = document.getElementById('protCardTurmas');
            if (cardTurmas) cardTurmas.style.display = 'none';
            const cardFinal = document.getElementById('protCardFinal');
            if (cardFinal) cardFinal.style.display = 'none';
        }
    }

    // ============================================
    // 📊 ATUALIZAR RESUMO
    // ============================================
    function atualizarResumo() {
        const container = document.getElementById('protResumo');
        if (!container) return;

        const totalProvas = state.turmasAdicionadas.reduce((acc, t) => acc + t.quantidadeProvas, 0);
        const totalAlunosSelecionados = state.turmasAdicionadas.reduce((acc, t) => acc + t.alunosSelecionados.length, 0);
        const totalTurmas = state.turmasAdicionadas.length;

        const tudoCerto = state.turmasAdicionadas.every(t => t.alunosSelecionados.length === t.quantidadeProvas);

        container.innerHTML = `
            <div class="prot-resumo-titulo">
                <i class="fas fa-clipboard-check"></i>
                Resumo do Protocolo
            </div>
            <div class="prot-resumo-item">
                <span><i class="fas fa-user-tie"></i> Professor:</span>
                <strong>${state.professorSelecionado ? escapeHtml(state.professorSelecionado.nome) : '-'}</strong>
            </div>
            <div class="prot-resumo-item">
                <span><i class="fas fa-school"></i> Turmas:</span>
                <strong>${totalTurmas}</strong>
            </div>
            <div class="prot-resumo-item">
                <span><i class="fas fa-users"></i> Alunos selecionados:</span>
                <strong style="color: ${tudoCerto ? '#059669' : '#d97706'};">
                    ${totalAlunosSelecionados} / ${totalProvas}
                </strong>
            </div>
            <div class="prot-resumo-item">
                <span><i class="fas fa-file-alt"></i> Total de Provas:</span>
                <strong>${totalProvas}</strong>
            </div>
            ${!tudoCerto && totalTurmas > 0 ? `
                <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 10px 12px; border-radius: 8px; margin-top: 10px; font-size: 13px; color: #92400e;">
                    <i class="fas fa-exclamation-triangle"></i>
                    Selecione todos os alunos de todas as turmas antes de registrar.
                </div>
            ` : ''}
        `;
    }

    // ============================================
    // ✍️ TOGGLE ASSINATURA
    // ============================================
    async function toggleAssinatura() {
        const check = document.getElementById('protNecessitaAssinatura');
        const bloco = document.getElementById('protBlocoAssinatura');

        if (!check || !bloco) return;

        if (check.checked) {
            if (!state.professorSelecionado) {
                showToast('⚠️ Selecione um professor primeiro', 'warning');
                check.checked = false;
                return;
            }

            // Criar sessão de assinatura
            const sessaoId = gerarUUID();
            state.sessaoAssinatura.sessaoId = sessaoId;
            state.sessaoAssinatura.assinaturaCapturada = null;

            try {
                const snapshot = montarSnapshotProtocolo();

                const response = await fetch('/api/sessoes-assinatura', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${getToken()}`
                    },
                    body: JSON.stringify({
                        sessaoId,
                        tipo: 'protocolo_prova',
                        dadosAtendimento: snapshot
                    })
                });

                const data = await response.json();
                if (!data.success) throw new Error(data.error || 'Erro ao criar sessão');

                // Gerar QR Code
                const urlAssinatura = `${window.location.origin}/setor-pedagogico.html?assinatura=${sessaoId}`;

                try {
                    const qrResponse = await fetch('/api/qrcode/gerar', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${getToken()}`
                        },
                        body: JSON.stringify({ url: urlAssinatura })
                    });
                    const qrData = await qrResponse.json();
                    if (qrData.success && qrData.qrCode) {
                        state.sessaoAssinatura.qrCodeDataUrl = qrData.qrCode;
                    } else {
                        state.sessaoAssinatura.qrCodeDataUrl =
                            `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(urlAssinatura)}`;
                    }
                } catch (e) {
                    state.sessaoAssinatura.qrCodeDataUrl =
                        `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(urlAssinatura)}`;
                }

                abrirModalQRCode(urlAssinatura);
                iniciarMonitoramentoSessao(sessaoId);

                showToast('📱 QR Code gerado! Peça para o professor escanear.', 'info');

            } catch (error) {
                console.error('❌ Erro ao criar sessão:', error);
                showToast('❌ ' + error.message, 'error');
                check.checked = false;
                state.sessaoAssinatura.sessaoId = null;
            }
        } else {
            // Cancelar
            if (state.sessaoAssinatura.sessaoId) {
                try {
                    await fetch(`/api/sessoes-assinatura/${state.sessaoAssinatura.sessaoId}`, {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${getToken()}` }
                    });
                } catch (e) { console.warn(e); }
            }

            state.sessaoAssinatura.sessaoId = null;
            state.sessaoAssinatura.assinaturaCapturada = null;
            state.sessaoAssinatura.qrCodeDataUrl = null;

            if (state.sessaoAssinatura.intervaloMonitoramento) {
                clearInterval(state.sessaoAssinatura.intervaloMonitoramento);
                state.sessaoAssinatura.intervaloMonitoramento = null;
            }

            bloco.style.display = 'none';
            bloco.innerHTML = '';
            fecharModalQRCode();
        }
    }

    // ============================================
    // 📸 MONTAR SNAPSHOT PARA ASSINATURA
    // ============================================
    function montarSnapshotProtocolo() {
        const totalProvas = state.turmasAdicionadas.reduce((acc, t) => acc + t.quantidadeProvas, 0);

        const tiposLabel = {
            'AV1': 'AV1', 'AV2': 'AV2', 'AV3': 'AV3', 'AV4': 'AV4',
            '2CHAMADA': '2ª Chamada', 'RECUPERACAO': 'Recuperação',
            'FINAL': 'Prova Final', 'OUTROS': 'Outros'
        };

        const tipo = document.getElementById('protTipoProva')?.value;
        const tipoOutros = document.getElementById('protTipoProvaOutros')?.value || '';
        const periodo = document.getElementById('protPeriodo')?.value;
        const data = document.getElementById('protDataRecebimento')?.value;

        return {
            professorNome: state.professorSelecionado?.nome,
            professorEmail: state.professorSelecionado?.email,
            professorMatricula: state.professorSelecionado?.matricula,
            data: data,
            dataFormatada: data ? new Date(data + 'T12:00:00').toLocaleDateString('pt-BR') : '',
            tipoProva: tipo,
            tipoProvaLabel: tipo === 'OUTROS' && tipoOutros ? `OUTROS (${tipoOutros})` : (tiposLabel[tipo] || tipo),
            periodo: periodo,
            periodoFormatado: periodo ? `${periodo}º Período` : '',
            turmas: state.turmasAdicionadas.map(t => ({
                turma: t.turma,
                quantidadeProvas: t.quantidadeProvas,
                alunos: t.alunosSelecionados.map(a => a.nome)
            })),
            totalProvas: totalProvas
        };
    }

    // ============================================
    // 📱 ABRIR MODAL QR CODE
    // ============================================
    function abrirModalQRCode(urlAssinatura) {
        let modal = document.getElementById('protModalQRCode');
        if (modal) modal.remove();

        const qrUrl = state.sessaoAssinatura.qrCodeDataUrl;

        const modalHtml = `
            <div class="modal fade" id="protModalQRCode" tabindex="-1" data-bs-backdrop="static">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content" style="border-radius: 20px; border: none; overflow: hidden;">
                        <div class="modal-header" style="background: linear-gradient(135deg, #1e3c72, #2a5298); color: white; border: none; padding: 20px 25px;">
                            <h5 class="modal-title" style="display: flex; align-items: center; gap: 10px;">
                                <i class="fas fa-signature"></i> Aguardando Assinatura
                            </h5>
                            <button type="button" class="btn-close btn-close-white" onclick="ProtocoloProvasModule.fecharModalQRCode()"></button>
                        </div>
                        <div class="modal-body" style="padding: 30px; text-align: center;">
                            <div id="protModalQRStatus" style="margin-bottom: 20px;">
                                <div style="background: #fef3c7; border-radius: 12px; padding: 14px; display: flex; align-items: center; gap: 12px; text-align: left;">
                                    <div style="width: 40px; height: 40px; border-radius: 50%; border: 4px solid #f59e0b; border-top-color: transparent; animation: spinProt 1s linear infinite; flex-shrink: 0;"></div>
                                    <div>
                                        <strong style="color: #92400e;">Aguardando assinatura...</strong>
                                        <p style="margin: 3px 0 0; font-size: 13px; color: #78350f;">
                                            Peça para o professor escanear o QR Code
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <div style="background: white; border: 2px solid #e2e8f0; border-radius: 16px; padding: 20px; display: inline-block;">
                                <img src="${qrUrl}" alt="QR Code" style="width: 260px; height: 260px; display: block;">
                                <p style="margin: 12px 0 0; font-size: 13px; color: #64748b;">
                                    <i class="fas fa-mobile-alt"></i> Aponte a câmera do celular
                                </p>
                            </div>
                            <div style="margin-top: 20px; padding: 14px; background: #f0f9ff; border-radius: 12px; font-size: 13px; color: #0369a1; text-align: left;">
                                <div style="display: flex; gap: 8px;">
                                    <i class="fas fa-info-circle"></i>
                                    <span>O professor assina direto no celular dele. Assim que confirmar, você verá automaticamente.</span>
                                </div>
                            </div>
                            <div style="margin-top: 16px;">
                                <button onclick="ProtocoloProvasModule.copiarLinkAssinatura('${urlAssinatura}')" class="btn btn-sm btn-outline-secondary" style="border-radius: 10px;">
                                    <i class="fas fa-link"></i> Copiar link
                                </button>
                            </div>
                        </div>
                        <div class="modal-footer" style="border-top: 1px solid #e5e7eb; padding: 15px 25px; justify-content: space-between;">
                            <button type="button" class="btn btn-outline-secondary" onclick="ProtocoloProvasModule.fecharModalQRCode()" style="border-radius: 10px;">
                                <i class="fas fa-eye-slash"></i> Ocultar
                            </button>
                            <button type="button" class="btn btn-danger" onclick="ProtocoloProvasModule.cancelarSessaoAssinatura()" style="border-radius: 10px;">
                                <i class="fas fa-times"></i> Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        state.sessaoAssinatura.modalInstance = new bootstrap.Modal(document.getElementById('protModalQRCode'));
        state.sessaoAssinatura.modalInstance.show();
    }

    // ============================================
    // 🔒 FECHAR MODAL QR CODE
    // ============================================
    function fecharModalQRCode() {
        const modal = document.getElementById('protModalQRCode');
        if (modal) {
            const instance = bootstrap.Modal.getInstance(modal);
            if (instance) instance.hide();
            setTimeout(() => modal.remove(), 300);
        }
        state.sessaoAssinatura.modalInstance = null;
    }

    // ============================================
    // 📋 COPIAR LINK ASSINATURA
    // ============================================
    async function copiarLinkAssinatura(url) {
        try {
            await navigator.clipboard.writeText(url);
            showToast('✅ Link copiado!', 'success');
        } catch (e) {
            const textarea = document.createElement('textarea');
            textarea.value = url;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showToast('✅ Link copiado!', 'success');
        }
    }

    // ============================================
    // 👀 INICIAR MONITORAMENTO DE SESSÃO
    // ============================================
    function iniciarMonitoramentoSessao(sessaoId) {
        if (state.sessaoAssinatura.intervaloMonitoramento) {
            clearInterval(state.sessaoAssinatura.intervaloMonitoramento);
        }

        const intervalId = setInterval(async () => {
            try {
                const response = await fetch(`/api/sessoes-assinatura/${sessaoId}`, {
                    headers: { 'Authorization': `Bearer ${getToken()}` }
                });

                if (!response.ok) {
                    if (response.status === 404) {
                        clearInterval(intervalId);
                    }
                    return;
                }

                const data = await response.json();
                if (!data.success) return;

                if (data.sessao.status === 'assinado') {
                    state.sessaoAssinatura.assinaturaCapturada = data.sessao.assinaturaBase64;
                    clearInterval(intervalId);
                    state.sessaoAssinatura.intervaloMonitoramento = null;

                    // Fechar modal
                    fecharModalQRCode();

                    // Mostrar bloco de assinado
                    mostrarAssinaturaCapturada(data.sessao);

                    showToast(`✅ Assinatura capturada por ${data.sessao.assinadaPorNome}!`, 'success');
                }
            } catch (e) {
                console.warn('Erro no monitoramento:', e);
            }
        }, 3000);

        state.sessaoAssinatura.intervaloMonitoramento = intervalId;
    }

    // ============================================
    // ✅ MOSTRAR ASSINATURA CAPTURADA
    // ============================================
    function mostrarAssinaturaCapturada(sessao) {
        const bloco = document.getElementById('protBlocoAssinatura');
        if (!bloco) return;

        bloco.style.display = 'block';
        bloco.innerHTML = `
            <div style="margin-top: 10px; background: #f0fdf4; border: 2px solid #10b981; border-radius: 12px; padding: 14px;">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                    <i class="fas fa-check-circle" style="color: #10b981; font-size: 22px;"></i>
                    <div style="flex: 1;">
                        <strong style="color: #065f46;">✓ Assinatura capturada!</strong>
                        <p style="margin: 3px 0 0; font-size: 12px; color: #047857;">
                            Assinado por <strong>${escapeHtml(sessao.assinadaPorNome || '')}</strong>
                            ${sessao.assinadaEm ? ` em ${new Date(sessao.assinadaEm).toLocaleString('pt-BR')}` : ''}
                        </p>
                    </div>
                </div>
                <div style="background: white; border-radius: 8px; padding: 8px; text-align: center;">
                    <img src="${sessao.assinaturaBase64}" style="max-width: 100%; max-height: 100px;" alt="Assinatura">
                </div>
            </div>
        `;
    }

    // ============================================
    // ❌ CANCELAR SESSÃO
    // ============================================
    async function cancelarSessaoAssinatura() {
        if (state.sessaoAssinatura.sessaoId) {
            try {
                await fetch(`/api/sessoes-assinatura/${state.sessaoAssinatura.sessaoId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${getToken()}` }
                });
            } catch (e) { console.warn(e); }
        }

        if (state.sessaoAssinatura.intervaloMonitoramento) {
            clearInterval(state.sessaoAssinatura.intervaloMonitoramento);
            state.sessaoAssinatura.intervaloMonitoramento = null;
        }

        state.sessaoAssinatura.sessaoId = null;
        state.sessaoAssinatura.assinaturaCapturada = null;
        state.sessaoAssinatura.qrCodeDataUrl = null;

        const check = document.getElementById('protNecessitaAssinatura');
        if (check) check.checked = false;

        const bloco = document.getElementById('protBlocoAssinatura');
        if (bloco) {
            bloco.style.display = 'none';
            bloco.innerHTML = '';
        }

        fecharModalQRCode();
        showToast('Sessão cancelada', 'info');
    }

    // ============================================
    // 💾 REGISTRAR PROTOCOLO
    // ============================================
    async function registrarProtocolo() {
        if (!state.professorSelecionado) {
            showToast('⚠️ Selecione um professor', 'warning');
            return;
        }

        const data = document.getElementById('protDataRecebimento')?.value;
        const tipo = document.getElementById('protTipoProva')?.value;
        const tipoOutros = document.getElementById('protTipoProvaOutros')?.value || '';
        const periodo = document.getElementById('protPeriodo')?.value;
        const observacoes = document.getElementById('protObservacoes')?.value || '';
        const precisaAssinatura = document.getElementById('protNecessitaAssinatura')?.checked;

        // Validações
        if (!data) {
            showToast('⚠️ Informe a data do recebimento', 'warning');
            return;
        }
        if (!tipo) {
            showToast('⚠️ Selecione o tipo de prova', 'warning');
            return;
        }
        if (tipo === 'OUTROS' && !tipoOutros.trim()) {
            showToast('⚠️ Especifique o tipo de prova', 'warning');
            return;
        }
        if (!periodo) {
            showToast('⚠️ Selecione o período', 'warning');
            return;
        }
        if (state.turmasAdicionadas.length === 0) {
            showToast('⚠️ Adicione pelo menos uma turma', 'warning');
            return;
        }

        // Verificar se todos os alunos foram selecionados
        for (const t of state.turmasAdicionadas) {
            if (t.alunosSelecionados.length !== t.quantidadeProvas) {
                showToast(`⚠️ Selecione exatamente ${t.quantidadeProvas} aluno(s) da turma ${t.turma}`, 'warning');
                return;
            }
        }

        // Verificar assinatura
        if (precisaAssinatura && !state.sessaoAssinatura.assinaturaCapturada) {
            showToast('⚠️ Aguardando assinatura do professor', 'warning');
            return;
        }

        const btn = document.getElementById('protBtnRegistrar');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> Registrando...';
        }

        try {
            const body = {
                professorId: state.professorSelecionado.id,
                dataRecebimento: data,
                tipoProva: tipo,
                tipoProvaOutros: tipo === 'OUTROS' ? tipoOutros.trim() : null,
                periodo: parseInt(periodo),
                turmas: state.turmasAdicionadas.map(t => ({
                    turma: t.turma,
                    quantidadeProvas: t.quantidadeProvas,
                    alunos: t.alunosSelecionados.map(a => ({
                        id: a.id,
                        nome: a.nome,
                        matricula: a.matricula,
                        curso: a.curso
                    }))
                })),
                observacoes: observacoes.trim(),
                assinaturaBase64: state.sessaoAssinatura.assinaturaCapturada || null
            };

            const response = await fetch('/api/protocolo-provas/registrar', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getToken()}`
                },
                body: JSON.stringify(body)
            });

            const result = await response.json();

            if (response.status === 409) {
                showToast('⚠️ ' + (result.error || 'Protocolo duplicado'), 'warning');
                return;
            }

            if (!result.success) {
                throw new Error(result.error || 'Erro ao registrar');
            }

            // Limpar sessão de assinatura
            if (state.sessaoAssinatura.sessaoId) {
                try {
                    await fetch(`/api/sessoes-assinatura/${state.sessaoAssinatura.sessaoId}`, {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${getToken()}` }
                    });
                } catch (e) { console.warn(e); }
            }

            if (state.sessaoAssinatura.intervaloMonitoramento) {
                clearInterval(state.sessaoAssinatura.intervaloMonitoramento);
            }

            showToast('✅ ' + result.message, 'success');

            // Perguntar se quer imprimir
            const imprimir = confirm('Deseja IMPRIMIR o protocolo agora?');
            if (imprimir) {
                imprimirProtocolo(result.protocolo.id);
            }

            // Recarregar lista
            await carregarLista();

            // Resetar formulário
            resetarFormulario();

            // Mudar para a aba da lista
            const listaTab = document.getElementById('prot-lista-tab');
            if (listaTab) new bootstrap.Tab(listaTab).show();

        } catch (error) {
            console.error('❌ Erro:', error);
            showToast('❌ ' + error.message, 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-save me-2"></i> Registrar Protocolo';
            }
        }
    }

    // ============================================
    // 🔄 RESETAR FORMULÁRIO
    // ============================================
    function resetarFormulario() {
        state.professorSelecionado = null;
        state.turmasAdicionadas = [];
        state.editandoId = null;
        state.sessaoAssinatura.assinaturaCapturada = null;

        if (state.sessaoAssinatura.intervaloMonitoramento) {
            clearInterval(state.sessaoAssinatura.intervaloMonitoramento);
            state.sessaoAssinatura.intervaloMonitoramento = null;
        }

        // Resetar campos
        const hoje = getDataLocalISO();
        ['protDataRecebimento'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = hoje;
        });

        ['protTipoProva', 'protPeriodo', 'protTipoProvaOutros', 'protObservacoes', 'protSelectTurma', 'protQuantidadeProvas'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });

        const check = document.getElementById('protNecessitaAssinatura');
        if (check) check.checked = false;

        const divOutros = document.getElementById('protTipoProvaOutrosDiv');
        if (divOutros) divOutros.style.display = 'none';

        const blocoAssinatura = document.getElementById('protBlocoAssinatura');
        if (blocoAssinatura) {
            blocoAssinatura.style.display = 'none';
            blocoAssinatura.innerHTML = '';
        }

        // Esconder etapas
        ['protCardDados', 'protCardTurmas', 'protCardFinal'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });

        // Mostrar lista e busca
        const box = document.getElementById('protProfessorSelecionado');
        if (box) box.style.display = 'none';

        const lista = document.getElementById('protListaProfessores');
        if (lista) lista.style.display = 'block';

        const buscaBox = document.querySelector('.prot-search-box');
        if (buscaBox) buscaBox.style.display = 'block';

        const busca = document.getElementById('protBuscaProfessor');
        if (busca) busca.value = '';

        renderizarListaProfessores();
        renderizarTurmasAdicionadas();
    }

    // ============================================
    // 📋 CARREGAR LISTA DE PROTOCOLOS
    // ============================================
    async function carregarLista(pagina = 1) {
        const container = document.getElementById('protListaProtocolos');
        if (!container) return;

        container.innerHTML = `
            <div class="text-center py-5">
                <div class="loading"></div>
                <p>Carregando protocolos...</p>
            </div>
        `;

        try {
            const mes = document.getElementById('protFiltroMes')?.value || '';
            const busca = document.getElementById('protFiltroBusca')?.value || '';
            const tipoProva = document.getElementById('protFiltroTipo')?.value || '';
            const periodo = document.getElementById('protFiltroPeriodo')?.value || '';

            const params = new URLSearchParams();
            params.append('page', pagina);
            params.append('limit', state.paginacao.porPagina);

            if (mes) {
                const [ano, mesNum] = mes.split('-');
                const inicio = `${ano}-${mesNum}-01`;
                const ultimoDia = new Date(parseInt(ano), parseInt(mesNum), 0).getDate();
                const fim = `${ano}-${mesNum}-${String(ultimoDia).padStart(2, '0')}`;
                params.append('dataInicio', inicio);
                params.append('dataFim', fim);
            }
            if (busca) params.append('busca', busca);
            if (tipoProva) params.append('tipoProva', tipoProva);
            if (periodo) params.append('periodo', periodo);

            const response = await fetch(`/api/protocolo-provas/listar?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });

            const data = await response.json();

            if (!data.success) throw new Error(data.error || 'Erro ao carregar');

            state.protocolos = data.protocolos || [];
            state.paginacao = {
                pagina: data.pagination.page,
                porPagina: data.pagination.limit,
                total: data.pagination.total,
                totalPaginas: data.pagination.pages
            };

            renderizarListaProtocolos();

            const contador = document.getElementById('protContadorLista');
            if (contador) contador.textContent = `${data.pagination.total} registro(s)`;

            const badge = document.getElementById('protBadgeTotal');
            if (badge) badge.textContent = data.pagination.total;

            renderizarPaginacao();

        } catch (error) {
            console.error('❌ Erro:', error);
            container.innerHTML = `
                <div class="text-center py-5" style="color: #ef4444;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 32px; margin-bottom: 10px;"></i>
                    <p>Erro ao carregar: ${error.message}</p>
                    <button class="btn btn-sm btn-outline-primary" onclick="ProtocoloProvasModule.carregarLista(1)">
                        <i class="fas fa-sync-alt"></i> Tentar novamente
                    </button>
                </div>
            `;
        }
    }

    // ============================================
    // 🎨 RENDERIZAR LISTA
    // ============================================
    function renderizarListaProtocolos() {
        const container = document.getElementById('protListaProtocolos');
        if (!container) return;

        if (state.protocolos.length === 0) {
            container.innerHTML = `
                <div class="text-center py-5" style="color: #9ca3af;">
                    <i class="fas fa-inbox" style="font-size: 48px; margin-bottom: 15px;"></i>
                    <h5>Nenhum protocolo encontrado</h5>
                    <p>Registre o primeiro protocolo ou ajuste os filtros.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="table-responsive">
                <table class="table table-hover align-middle">
                    <thead style="background: #f8fafc;">
                        <tr>
                            <th>Código</th>
                            <th>Data</th>
                            <th>Professor</th>
                            <th>Tipo</th>
                            <th>Período</th>
                            <th>Turmas</th>
                            <th>Total</th>
                            <th>Assinatura</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${state.protocolos.map(p => `
                            <tr>
                                <td><code style="background: #f1f5f9; padding: 4px 8px; border-radius: 6px; font-size: 12px;">${escapeHtml(p.codigo)}</code></td>
                                <td>
                                    <strong>${p.dataFormatada}</strong>
                                    <br><small style="color: #64748b;">${p.diaSemana}</small>
                                </td>
                                <td>
                                    <strong>${escapeHtml(p.professorNome)}</strong>
                                    ${p.professorMatricula ? `<br><small style="color: #64748b;">Mat: ${escapeHtml(p.professorMatricula)}</small>` : ''}
                                </td>
                                <td><span class="prot-status-badge tipo">${escapeHtml(p.tipoProvaFormatado)}</span></td>
                                <td><span class="prot-status-badge periodo">${escapeHtml(p.periodoFormatado)}</span></td>
                                <td>
                                    <span style="font-size: 12px;">${escapeHtml(p.turmasResumo)}</span>
                                </td>
                                <td><span class="badge bg-primary">${p.totalProvas}</span></td>
                                <td>
                                    ${p.temAssinatura 
                                        ? '<span class="prot-status-badge ass"><i class="fas fa-signature"></i> Assinado</span>' 
                                        : '<span class="prot-status-badge sem">Sem</span>'
                                    }
                                </td>
                                <td>
                                    <div class="d-flex gap-1">
                                        <button class="prot-action-btn view" onclick="ProtocoloProvasModule.verProtocolo('${p.id}')" title="Ver">
                                            <i class="fas fa-eye"></i>
                                        </button>
                                        <button class="prot-action-btn print" onclick="ProtocoloProvasModule.imprimirProtocolo('${p.id}')" title="Imprimir">
                                            <i class="fas fa-print"></i>
                                        </button>
                                        <button class="prot-action-btn edit" onclick="ProtocoloProvasModule.editarProtocolo('${p.id}')" title="Editar">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        <button class="prot-action-btn delete" onclick="ProtocoloProvasModule.excluirProtocolo('${p.id}')" title="Excluir">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    // ============================================
    // 📄 RENDERIZAR PAGINAÇÃO
    // ============================================
    function renderizarPaginacao() {
        const container = document.getElementById('protPaginacao');
        if (!container) return;

        const { pagina, totalPaginas, total } = state.paginacao;

        if (totalPaginas <= 1) {
            container.innerHTML = `<small class="text-muted">${total} registro(s)</small>`;
            return;
        }

        let botoes = '';

        if (pagina > 1) {
            botoes += `<li class="page-item"><a class="page-link" href="#" onclick="event.preventDefault(); ProtocoloProvasModule.carregarLista(1)">«</a></li>`;
            botoes += `<li class="page-item"><a class="page-link" href="#" onclick="event.preventDefault(); ProtocoloProvasModule.carregarLista(${pagina - 1})">‹</a></li>`;
        }

        const inicio = Math.max(1, pagina - 2);
        const fim = Math.min(totalPaginas, inicio + 4);

        for (let i = inicio; i <= fim; i++) {
            botoes += `<li class="page-item ${i === pagina ? 'active' : ''}"><a class="page-link" href="#" onclick="event.preventDefault(); ProtocoloProvasModule.carregarLista(${i})">${i}</a></li>`;
        }

        if (pagina < totalPaginas) {
            botoes += `<li class="page-item"><a class="page-link" href="#" onclick="event.preventDefault(); ProtocoloProvasModule.carregarLista(${pagina + 1})">›</a></li>`;
            botoes += `<li class="page-item"><a class="page-link" href="#" onclick="event.preventDefault(); ProtocoloProvasModule.carregarLista(${totalPaginas})">»</a></li>`;
        }

        container.innerHTML = `
            <div class="prot-pagination">
                <small class="text-muted">Mostrando ${state.protocolos.length} de ${total} registro(s)</small>
                <nav><ul class="pagination pagination-sm mb-0">${botoes}</ul></nav>
            </div>
        `;
    }

    // ============================================
    // 👁️ VER PROTOCOLO
    // ============================================
    async function verProtocolo(id) {
        try {
            const response = await fetch(`/api/protocolo-provas/${id}`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            const data = await response.json();

            if (!data.success) throw new Error(data.error || 'Erro ao carregar');

            const p = data.protocolo;
            const turmas = p.turmas || [];

            let turmasHtml = '';
            turmas.forEach(t => {
                turmasHtml += `
                    <div style="background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px; margin-bottom: 10px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                            <strong style="color: #1e3c72; font-size: 15px;">
                                <i class="fas fa-school"></i> Turma ${escapeHtml(t.turma)}
                            </strong>
                            <span class="badge bg-primary" style="background: #1e3c72 !important;">${t.quantidadeProvas} prova(s)</span>
                        </div>
                        <div style="font-size: 13px; color: #4b5563;">
                            <strong>Alunos:</strong>
                            <ul style="margin: 6px 0 0 20px;">
                                ${(t.alunos || []).map(a => `
                                    <li>${escapeHtml(a.nome)} ${a.matricula ? `<span style="color: #9ca3af;">(${escapeHtml(a.matricula)})</span>` : ''}</li>
                                `).join('')}
                            </ul>
                        </div>
                    </div>
                `;
            });

            const modalBody = document.getElementById('modalBody');
            if (!modalBody) return;

            modalBody.innerHTML = `
                <div style="padding: 10px;">
                    <div style="text-align: center; margin-bottom: 20px;">
                        <div style="display: inline-block; background: linear-gradient(135deg, #1e3c72, #2a5298); color: white; padding: 8px 20px; border-radius: 20px; font-weight: 700; font-size: 18px;">
                            ${escapeHtml(p.codigo)}
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px;">
                        <div style="background: #f8fafc; padding: 14px; border-radius: 10px;">
                            <small style="color: #64748b; font-size: 11px; font-weight: 700; text-transform: uppercase;">Data</small>
                            <div style="font-weight: 600; color: #1e293b; margin-top: 3px;">${p.dataFormatada}</div>
                            <div style="font-size: 11px; color: #64748b;">${p.diaSemana}</div>
                        </div>
                        <div style="background: #f8fafc; padding: 14px; border-radius: 10px;">
                            <small style="color: #64748b; font-size: 11px; font-weight: 700; text-transform: uppercase;">Tipo de Prova</small>
                            <div style="font-weight: 600; color: #1e293b; margin-top: 3px;">${escapeHtml(p.tipoProvaFormatado)}</div>
                        </div>
                        <div style="background: #f8fafc; padding: 14px; border-radius: 10px;">
                            <small style="color: #64748b; font-size: 11px; font-weight: 700; text-transform: uppercase;">Período</small>
                            <div style="font-weight: 600; color: #1e293b; margin-top: 3px;">${escapeHtml(p.periodoFormatado)}</div>
                        </div>
                        <div style="background: #f8fafc; padding: 14px; border-radius: 10px;">
                            <small style="color: #64748b; font-size: 11px; font-weight: 700; text-transform: uppercase;">Total de Provas</small>
                            <div style="font-weight: 600; color: #1e293b; margin-top: 3px;">${p.totalProvas}</div>
                        </div>
                    </div>

                    <div style="background: #eef2ff; padding: 16px; border-radius: 12px; margin-bottom: 20px;">
                        <h6 style="margin: 0 0 10px; color: #1e3c72;">
                            <i class="fas fa-user-tie"></i> Professor
                        </h6>
                        <div style="font-weight: 700; color: #1e293b; margin-bottom: 4px;">${escapeHtml(p.professorNome)}</div>
                        ${p.professorEmail ? `<div style="font-size: 12px; color: #4b5563;"><i class="fas fa-envelope"></i> ${escapeHtml(p.professorEmail)}</div>` : ''}
                        ${p.professorMatricula ? `<div style="font-size: 12px; color: #4b5563;"><i class="fas fa-id-card"></i> ${escapeHtml(p.professorMatricula)}</div>` : ''}
                    </div>

                    <h6 style="margin: 0 0 12px; color: #1e3c72;">
                        <i class="fas fa-list"></i> Turmas e Alunos
                    </h6>
                    ${turmasHtml}

                    ${p.observacoes ? `
                        <div style="margin-top: 15px; background: #fef3c7; padding: 14px; border-radius: 10px; border-left: 4px solid #f59e0b;">
                            <strong style="color: #92400e;"><i class="fas fa-comment"></i> Observações:</strong>
                            <p style="margin: 6px 0 0; color: #78350f;">${escapeHtml(p.observacoes)}</p>
                        </div>
                    ` : ''}

                    ${p.temAssinatura ? `
                        <div style="margin-top: 15px; background: #f0fdf4; padding: 14px; border-radius: 10px; border: 1px solid #10b981;">
                            <strong style="color: #065f46;"><i class="fas fa-signature"></i> Assinatura do Professor:</strong>
                            <div style="text-align: center; background: white; border-radius: 8px; padding: 8px; margin-top: 8px;">
                                <img src="${p.assinaturaBase64}" style="max-width: 100%; max-height: 100px;" alt="Assinatura">
                            </div>
                        </div>
                    ` : ''}

                    <div style="margin-top: 15px; font-size: 11px; color: #9ca3af; text-align: center;">
                        <i class="fas fa-user-check"></i> Registrado por ${escapeHtml(p.registradoPorNome)} 
                        em ${new Date(p.createdAt).toLocaleString('pt-BR')}
                    </div>
                </div>
            `;

            // 🔥 CORREÇÃO: Abrir o modal via Bootstrap nativo
            const modalTitle = document.getElementById('modalTitle');
            if (modalTitle) {
                modalTitle.innerHTML = '<i class="fas fa-file-signature"></i> Detalhes do Protocolo';
            }

            // Esconde o botão de salvar (pois é apenas visualização)
            const modalSaveBtn = document.getElementById('modalSaveBtn');
            if (modalSaveBtn) modalSaveBtn.style.display = 'none';

            // Abre o modal
            const modalEl = document.getElementById('modal');
            if (modalEl) {
                let modalInstance = bootstrap.Modal.getInstance(modalEl);
                if (!modalInstance) {
                    modalInstance = new bootstrap.Modal(modalEl);
                }
                modalInstance.show();
            } else {
                console.error('❌ Elemento #modal não encontrado no HTML');
                showToast('❌ Erro ao abrir modal de visualização', 'error');
            }

        } catch (error) {
            console.error('❌ Erro:', error);
            showToast('❌ ' + error.message, 'error');
        }
    }

    // ============================================
    // 🖨️ IMPRIMIR PROTOCOLO
    // ============================================
    async function imprimirProtocolo(id) {
        try {
            const response = await fetch(`/api/protocolo-provas/${id}/imprimir`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            const data = await response.json();

            if (!data.success) throw new Error(data.error || 'Erro ao carregar');

            const p = data.protocolo;
            const logoIema = '/uploads/logo-iema.png';
            const carimbo = '/icons/assinatura_gpeda.ico';
            const dataGeracao = new Date().toLocaleString('pt-BR');

            let turmasHtml = '';

            (p.turmas || []).forEach(t => {
                turmasHtml += `
                    <tr>
                        <td style="text-align: center; font-weight: bold;">
                            ${escapeHtml(t.turma)}
                        </td>
                        <td style="text-align: center; font-weight: bold;">
                            ${t.quantidadeProvas}
                        </td>
                        <td>
                            ${(t.alunos || []).map((a, i) => `${i + 1}. ${escapeHtml(a.nome)}${a.matricula ? ` (${escapeHtml(a.matricula)})` : ''}`).join('<br>')}
                        </td>
                    </tr>
                `;
            });

            const assinaturaHTML = p.assinaturaBase64
                ? `<img class="assinatura-img" src="${p.assinaturaBase64}" alt="Assinatura">`
                : '';

            const html = `
                <!DOCTYPE html>
                <html lang="pt-BR">
                <head>
                    <meta charset="UTF-8">
                    <title>Protocolo ${p.codigo} - ${p.professorNome}</title>
                    <style>
                        /* Força a página A4 e margens compactas */
                        @page { size: A4 portrait; margin: 10mm; }
                        * { box-sizing: border-box; margin: 0; padding: 0; }
                        
                        /* Fonte geral bem menor para caber tudo e não esticar */
                        body { font-family: 'Times New Roman', Times, serif; font-size: 9pt; line-height: 1.3; color: #000; }

                        .header { text-align: center; border-bottom: 1.5px solid #000; padding-bottom: 6px; margin-bottom: 10px; }
                        .header img { max-width: 100%; max-height: 15mm; object-fit: contain; display: block; margin: 0 auto 4px; }
                        .header h1 { font-size: 11pt; text-transform: uppercase; font-weight: bold; margin: 0; }
                        .header p { font-size: 8pt; margin: 2px 0 0; }

                        .titulo {
                            text-align: center;
                            font-size: 11pt;
                            font-weight: bold;
                            background: #f0f0f0;
                            padding: 5px;
                            border: 1.5px solid #000;
                            margin: 10px 0;
                            text-transform: uppercase;
                        }

                        .codigo-box {
                            text-align: center;
                            margin: 8px 0 12px;
                            font-family: monospace;
                            font-size: 10pt;
                            background: #fafafa;
                            padding: 6px;
                            border: 1px dashed #666;
                        }

                        .section-title {
                            font-size: 9pt;
                            font-weight: bold;
                            background: #e8e8e8;
                            padding: 4px 8px;
                            border-left: 3px solid #1e3c72;
                            margin: 12px 0 6px;
                            text-transform: uppercase;
                        }

                        .info-grid {
                            display: grid;
                            grid-template-columns: 1fr 1fr;
                            gap: 4px 15px;
                            margin: 6px 0;
                            font-size: 9pt;
                        }
                        .info-item { padding: 3px 0; border-bottom: 1px dotted #999; }
                        .info-label { font-weight: bold; display: inline-block; min-width: 80px; }

                        table.dados {
                            width: 100%;
                            border-collapse: collapse;
                            margin: 6px 0;
                            font-size: 9pt;
                        }
                        table.dados th {
                            background: #333;
                            color: white;
                            padding: 5px;
                            text-align: center;
                            border: 1px solid #000;
                            font-size: 8pt;
                            text-transform: uppercase;
                        }
                        table.dados td {
                            border: 1px solid #999;
                            padding: 4px 6px;
                            vertical-align: top;
                        }
                        table.dados tr:nth-child(even) { background: #fafafa; }
                        table.dados tfoot td {
                            font-size: 9pt;
                            padding: 6px;
                        }

                        .observacoes {
                            background: #fef9e7;
                            padding: 8px;
                            border: 1px solid #f0c040;
                            margin: 10px 0;
                            font-size: 9pt;
                        }

                        .total-box {
                            background: #e8e8e8;
                            padding: 8px;
                            text-align: center;
                            font-size: 10pt;
                            font-weight: bold;
                            border: 1.5px solid #000;
                            margin: 12px 0;
                        }

                        .assinaturas {
                            display: flex;
                            justify-content: space-around;
                            margin-top: 25px;
                            gap: 20px;
                        }
                        .assinatura {
                            flex: 0 0 45%;
                            text-align: center;
                        }
                        .assinatura-container {
                            position: relative;
                            min-height: 15mm;
                            display: flex;
                            align-items: flex-end;
                            justify-content: center;
                        }
                        .assinatura-container::after {
                            content: '';
                            position: absolute;
                            bottom: 0; left: 0; right: 0;
                            border-bottom: 1px solid #000;
                        }
                        .assinatura-img {
                            max-height: 12mm;
                            max-width: 100%;
                            object-fit: contain;
                            position: relative;
                            z-index: 2;
                            margin-bottom: 1mm;
                        }
                        .carimbo-overlay {
                            position: absolute;
                            bottom: 1mm; left: 50%;
                            transform: translateX(-50%);
                            max-height: 12mm;
                            max-width: 40mm;
                            object-fit: contain;
                            opacity: 0.95;
                            pointer-events: none;
                            z-index: 1;
                        }
                        .assinatura-linha {
                            padding-top: 3px;
                            font-size: 8.5pt;
                            margin-top: 2px;
                        }

                        .footer {
                            margin-top: 20px;
                            text-align: center;
                            padding-top: 6px;
                            border-top: 1px solid #ccc;
                            font-size: 7.5pt;
                            color: #666;
                        }

                        .btn-print {
                            display: block;
                            margin: 15px auto;
                            padding: 10px 24px;
                            background: #1e3c72;
                            color: white;
                            border: none;
                            border-radius: 6px;
                            font-weight: bold;
                            cursor: pointer;
                            font-size: 12px;
                            font-family: Arial, sans-serif;
                        }
                        .btn-print:hover { background: #2a5298; }

                        @media print {
                            .no-print { display: none !important; }
                        }
                    </style>
                </head>
                <body>
                    <button class="btn-print no-print" onclick="window.print()">🖨️ Imprimir</button>

                    <div class="header">
                        <img src="${logoIema}" alt="IEMA" onerror="this.style.display='none'">
                        <h1>IEMA Pleno: São Luís - Centro</h1>
                        <p>Sistema de Controle de Provas — Setor Pedagógico</p>
                    </div>

                    <div class="titulo">📋 Protocolo de Recebimento de Provas</div>

                    <div class="codigo-box">
                        Código: <strong>${escapeHtml(p.codigo)}</strong>
                    </div>

                    <div class="section-title">📅 Dados do Recebimento</div>
                    <div class="info-grid">
                        <div class="info-item">
                            <span class="info-label">Data:</span> ${p.dataFormatada} (${p.diaSemana})
                        </div>
                        <div class="info-item">
                            <span class="info-label">Tipo:</span> ${escapeHtml(p.tipoProvaFormatado)}
                        </div>
                        <div class="info-item">
                            <span class="info-label">Período:</span> ${escapeHtml(p.periodoFormatado)}
                        </div>
                        <div class="info-item">
                            <span class="info-label">Registrado:</span> ${escapeHtml(p.registradoPorNome)}
                        </div>
                    </div>

                    <div class="section-title">👤 Professor Responsável</div>
                    <div class="info-grid">
                        <div class="info-item" style="grid-column: span 2;">
                            <span class="info-label">Nome:</span> ${escapeHtml(p.professorNome)}
                        </div>
                        <div class="info-item">
                            <span class="info-label">Matrícula:</span> ${escapeHtml(p.professorMatricula || '-')}
                        </div>
                        <div class="info-item">
                            <span class="info-label">E-mail:</span> ${escapeHtml(p.professorEmail || '-')}
                        </div>
                    </div>

                    <div class="section-title">📚 Turmas e Alunos (Provas Recebidas)</div>
                    <table class="dados">
                        <thead>
                            <tr>
                                <th style="width: 60px;">Turma</th>
                                <th style="width: 60px;">Qtd.</th>
                                <th>Alunos que entregaram</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${turmasHtml}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colspan="2" style="text-align: right; font-weight: bold; background: #e8e8e8; border-color: #000;">
                                    TOTAL GERAL:
                                </td>
                                <td style="font-weight: bold; background: #e8e8e8; border-color: #000;">
                                    ${p.totalAlunos} prova(s)
                                </td>
                            </tr>
                        </tfoot>
                    </table>

                    ${p.observacoes ? `
                        <div class="section-title">💬 Observações</div>
                        <div class="observacoes">
                            ${escapeHtml(p.observacoes).replace(/\n/g, '<br>')}
                        </div>
                    ` : ''}

                    <div class="assinaturas">
                        <div class="assinatura">
                            <div class="assinatura-container">
                                ${assinaturaHTML}
                            </div>
                            <div class="assinatura-linha">
                                <strong>${escapeHtml(p.professorNome)}</strong><br>
                                Professor Responsável
                            </div>
                        </div>
                        <div class="assinatura">
                            <div class="assinatura-container">
                                <img class="carimbo-overlay" src="${carimbo}" alt="Carimbo" onerror="this.style.display='none'">
                            </div>
                            <div class="assinatura-linha">
                                Setor Pedagógico
                            </div>
                        </div>
                    </div>

                    <div class="footer">
                        <p>Documento gerado em ${dataGeracao} — EducaPleno</p>
                    </div>
                </body>
                </html>
            `;

            const win = window.open('', '_blank');
            win.document.write(html);
            win.document.close();
            win.onload = () => setTimeout(() => win.print(), 500);

        } catch (error) {
            console.error('❌ Erro:', error);
            showToast('❌ ' + error.message, 'error');
        }
    }

    // ============================================
    // ✏️ EDITAR PROTOCOLO
    // ============================================
    async function editarProtocolo(id) {
        try {
            showToast('🔄 Carregando protocolo para edição...', 'info');

            const response = await fetch(`/api/protocolo-provas/${id}`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            const data = await response.json();

            if (!data.success) throw new Error(data.error || 'Erro ao carregar');

            const p = data.protocolo;

            // Mudar para aba registrar
            const registrarTab = document.getElementById('prot-registrar-tab');
            if (registrarTab) new bootstrap.Tab(registrarTab).show();

            // Resetar formulário
            resetarFormulario();

            // Setar estado de edição
            state.editandoId = id;

            // Selecionar professor
            const professor = state.professores.find(pr => pr.id === p.professorId.toString());
            if (professor) {
                state.professorSelecionado = professor;
                const box = document.getElementById('protProfessorSelecionado');
                if (box) {
                    box.style.display = 'block';
                    box.innerHTML = `
                        <div class="prot-professor-box-content">
                            <div class="prot-professor-box-avatar">
                                ${(professor.nome || '?').charAt(0).toUpperCase()}
                            </div>
                            <div class="prot-professor-box-info">
                                <h5>${escapeHtml(professor.nome)}</h5>
                                <p><i class="fas fa-envelope"></i> ${escapeHtml(professor.email || '')}</p>
                            </div>
                            <button class="btn btn-sm btn-outline-danger" onclick="ProtocoloProvasModule.limparProfessor()">
                                <i class="fas fa-times"></i> Trocar
                            </button>
                        </div>
                    `;
                }
                const lista = document.getElementById('protListaProfessores');
                if (lista) lista.style.display = 'none';
                const buscaBox = document.querySelector('.prot-search-box');
                if (buscaBox) buscaBox.style.display = 'none';
            }

            // Setar campos
            const dataRecebimento = p.dataRecebimento ? p.dataRecebimento.substring(0, 10) : '';
            document.getElementById('protDataRecebimento').value = dataRecebimento;
            document.getElementById('protTipoProva').value = p.tipoProva;
            document.getElementById('protPeriodo').value = p.periodo;
            document.getElementById('protObservacoes').value = p.observacoes || '';

            if (p.tipoProva === 'OUTROS') {
                document.getElementById('protTipoProvaOutros').value = p.tipoProvaOutros || '';
                document.getElementById('protTipoProvaOutrosDiv').style.display = 'block';
            }

            // Setar turmas
            state.turmasAdicionadas = (p.turmas || []).map(t => ({
                turma: t.turma,
                quantidadeProvas: t.quantidadeProvas,
                alunosDisponiveis: [], // Será carregado
                alunosSelecionados: (t.alunos || []).map(a => ({
                    id: a.alunoId?.toString() || a.alunoId,
                    nome: a.nome,
                    matricula: a.matricula,
                    curso: a.curso
                }))
            }));

            // Mostrar etapas
            document.getElementById('protCardDados').style.display = 'block';
            document.getElementById('protCardTurmas').style.display = 'block';
            document.getElementById('protCardFinal').style.display = 'block';

            renderizarTurmasAdicionadas();
            atualizarResumo();

            // Alterar botão
            const btn = document.getElementById('protBtnRegistrar');
            if (btn) {
                btn.innerHTML = '<i class="fas fa-save me-2"></i> Salvar Alterações';
                btn.onclick = () => salvarEdicao(id);
            }

            showToast('✅ Protocolo carregado para edição', 'success');

        } catch (error) {
            console.error('❌ Erro:', error);
            showToast('❌ ' + error.message, 'error');
        }
    }

    // ============================================
    // 💾 SALVAR EDIÇÃO
    // ============================================
    async function salvarEdicao(id) {
        if (!state.professorSelecionado) {
            showToast('⚠️ Selecione um professor', 'warning');
            return;
        }

        const data = document.getElementById('protDataRecebimento')?.value;
        const tipo = document.getElementById('protTipoProva')?.value;
        const tipoOutros = document.getElementById('protTipoProvaOutros')?.value || '';
        const periodo = document.getElementById('protPeriodo')?.value;
        const observacoes = document.getElementById('protObservacoes')?.value || '';

        // Validações
        if (!data || !tipo || !periodo) {
            showToast('⚠️ Preencha data, tipo e período', 'warning');
            return;
        }

        for (const t of state.turmasAdicionadas) {
            if (t.alunosSelecionados.length !== t.quantidadeProvas) {
                showToast(`⚠️ Selecione exatamente ${t.quantidadeProvas} aluno(s) da turma ${t.turma}`, 'warning');
                return;
            }
        }

        try {
            const body = {
                dataRecebimento: data,
                tipoProva: tipo,
                tipoProvaOutros: tipo === 'OUTROS' ? tipoOutros.trim() : null,
                periodo: parseInt(periodo),
                turmas: state.turmasAdicionadas.map(t => ({
                    turma: t.turma,
                    quantidadeProvas: t.quantidadeProvas,
                    alunos: t.alunosSelecionados.map(a => ({
                        id: a.id,
                        nome: a.nome,
                        matricula: a.matricula,
                        curso: a.curso
                    }))
                })),
                observacoes: observacoes.trim()
            };

            const response = await fetch(`/api/protocolo-provas/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getToken()}`
                },
                body: JSON.stringify(body)
            });

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Erro ao salvar');
            }

            showToast('✅ Protocolo atualizado!', 'success');

            await carregarLista();
            resetarFormulario();

            // Restaurar botão
            const btn = document.getElementById('protBtnRegistrar');
            if (btn) {
                btn.innerHTML = '<i class="fas fa-save me-2"></i> Registrar Protocolo';
                btn.onclick = () => registrarProtocolo();
            }

            const listaTab = document.getElementById('prot-lista-tab');
            if (listaTab) new bootstrap.Tab(listaTab).show();

        } catch (error) {
            console.error('❌ Erro:', error);
            showToast('❌ ' + error.message, 'error');
        }
    }
    // ============================================
    // 🗑️ EXCLUIR PROTOCOLO
    // ============================================
    async function excluirProtocolo(id) {
        // 🔥 CORREÇÃO: Usar Promise e window.confirm (que foi sobrescrito pelo dialog-helper)
        // Ou usar o modal do Bootstrap se preferir. Aqui usamos a Promise nativa.
        const confirmar = await new Promise((resolve) => {
            // Verifica se o confirm global foi sobrescrito e retorna uma Promise
            if (window.confirm.toString().includes('Promise')) {
                window.confirm('⚠️ Tem certeza que deseja EXCLUIR PERMANENTEMENTE este protocolo?\n\nEsta ação não pode ser desfeita!').then(resolve);
            } else {
                // Fallback para o confirm nativo (síncrono)
                resolve(window.confirm('⚠️ Tem certeza que deseja EXCLUIR PERMANENTEMENTE este protocolo?\n\nEsta ação não pode ser desfeita!'));
            }
        });

        if (!confirmar) return;

        try {
            showToast('🗑️ Excluindo protocolo...', 'info');

            const response = await fetch(`/api/protocolo-provas/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });

            const data = await response.json();

            if (data.success) {
                showToast('✅ ' + (data.message || 'Protocolo excluído!'), 'success');
                await carregarLista(); // Recarrega a lista após excluir
            } else {
                throw new Error(data.error || 'Erro ao excluir');
            }
        } catch (error) {
            console.error('❌ Erro:', error);
            showToast('❌ ' + error.message, 'error');
        }
    }

    // ============================================
    // 🧹 LIMPAR FILTROS
    // ============================================
    function limparFiltros() {
        const mesAtual = new Date().toISOString().substring(0, 7);
        document.getElementById('protFiltroMes').value = mesAtual;
        document.getElementById('protFiltroBusca').value = '';
        document.getElementById('protFiltroTipo').value = '';
        document.getElementById('protFiltroPeriodo').value = '';
        carregarLista(1);
    }

    // ============================================
    // 📊 CARREGAR DASHBOARD
    // ============================================
    async function carregarDashboard() {
        try {
            const mes = document.getElementById('protDashboardMes')?.value || new Date().toISOString().substring(0, 7);

            const response = await fetch(`/api/protocolo-provas/dashboard/resumo?mes=${mes}`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });

            const data = await response.json();

            if (!data.success) throw new Error(data.error);

            // Atualizar métricas
            document.getElementById('protStatTotalMes').textContent = data.resumo.totalMes || 0;
            document.getElementById('protStatProvasMes').textContent = data.resumo.totalProvasMes || 0;
            document.getElementById('protStatSemana').textContent = data.resumo.totalSemana || 0;
            document.getElementById('protStatTotalGeral').textContent = data.resumo.totalGeral || 0;

            // Gráfico por tipo
            renderizarGraficoTipo(data.porTipo);

            // Gráfico por período
            renderizarGraficoPeriodo(data.porPeriodo);

            // Ranking professores
            renderizarRanking('protRankingProfessores', data.porProfessor, 'professor');

            // Ranking turmas
            renderizarRanking('protRankingTurmas', data.porTurma, 'turma');

            // Últimos protocolos
            renderizarUltimos(data.ultimos);

        } catch (error) {
            console.error('❌ Erro no dashboard:', error);
        }
    }

    // ============================================
    // 📊 GRÁFICO POR TIPO
    // ============================================
    function renderizarGraficoTipo(dados) {
        const canvas = document.getElementById('protChartTipo');
        if (!canvas || !window.Chart) return;

        if (state.charts.tipo) {
            try { state.charts.tipo.destroy(); } catch(e) {}
        }

        const labels = (dados || []).map(d => d.tipo);
        const values = (dados || []).map(d => d.count);

        const cores = ['#1e3c72', '#2a5298', '#3b82f6', '#60a5fa', '#10b981', '#f59e0b', '#8b5cf6', '#64748b'];

        state.charts.tipo = new Chart(canvas.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: labels.length > 0 ? labels : ['Sem dados'],
                datasets: [{
                    data: values.length > 0 ? values : [1],
                    backgroundColor: cores.slice(0, Math.max(labels.length, 1)),
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                cutout: '60%',
                plugins: {
                    legend: { position: 'bottom', labels: { font: { size: 11 } } }
                }
            }
        });
    }

    // ============================================
    // 📊 GRÁFICO POR PERÍODO
    // ============================================
    function renderizarGraficoPeriodo(dados) {
        const canvas = document.getElementById('protChartPeriodo');
        if (!canvas || !window.Chart) return;

        if (state.charts.periodo) {
            try { state.charts.periodo.destroy(); } catch(e) {}
        }

        const labels = ['1º Período', '2º Período', '3º Período', '4º Período'];
        const values = [0, 0, 0, 0];

        (dados || []).forEach(d => {
            if (d.periodo >= 1 && d.periodo <= 4) {
                values[d.periodo - 1] = d.count;
            }
        });

        state.charts.periodo = new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Protocolos',
                    data: values,
                    backgroundColor: ['#1e3c72', '#2a5298', '#3b82f6', '#60a5fa'],
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 } } }
            }
        });
    }

    // ============================================
    // 🏆 RENDERIZAR RANKING
    // ============================================
    function renderizarRanking(containerId, dados, tipo) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (!dados || dados.length === 0) {
            container.innerHTML = `
                <div class="text-center py-4" style="color: #9ca3af;">
                    <i class="fas fa-chart-bar" style="font-size: 32px; margin-bottom: 10px;"></i>
                    <p>Nenhum dado disponível</p>
                </div>
            `;
            return;
        }

        container.innerHTML = dados.map((d, i) => {
            const posClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
            const medalha = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
            const nome = tipo === 'professor' ? d.nome : `Turma ${d.turma}`;

            return `
                <div class="prot-ranking-item">
                    <div class="prot-ranking-pos ${posClass}">${medalha || (i + 1)}</div>
                    <div class="prot-ranking-info">
                        <div class="prot-ranking-nome">${escapeHtml(nome)}</div>
                        <div class="prot-ranking-detalhes">${d.provas} provas</div>
                    </div>
                    <div class="prot-ranking-count">${d.count}</div>
                </div>
            `;
        }).join('');
    }

    // ============================================
    // 📋 RENDERIZAR ÚLTIMOS
    // ============================================
    function renderizarUltimos(dados) {
        const container = document.getElementById('protUltimosProtocolos');
        if (!container) return;

        if (!dados || dados.length === 0) {
            container.innerHTML = `
                <div class="text-center py-4" style="color: #9ca3af;">
                    <i class="fas fa-history" style="font-size: 32px; margin-bottom: 10px;"></i>
                    <p>Nenhum protocolo recente</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="table-responsive">
                <table class="table table-sm table-hover">
                    <thead>
                        <tr>
                            <th>Código</th>
                            <th>Professor</th>
                            <th>Data</th>
                            <th>Tipo</th>
                            <th>Período</th>
                            <th>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${dados.map(d => `
                            <tr>
                                <td><code style="font-size: 11px;">${escapeHtml(d.codigo)}</code></td>
                                <td>${escapeHtml(d.professorNome)}</td>
                                <td>${d.dataFormatada}</td>
                                <td><span class="badge bg-primary">${escapeHtml(d.tipoProva)}</span></td>
                                <td><span class="badge bg-info text-dark">${d.periodo}º</span></td>
                                <td><strong>${d.totalProvas}</strong></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    // ============================================
    // 🔄 RECARREGAR TUDO
    // ============================================
    async function recarregar() {
        showToast('🔄 Atualizando...', 'info');
        await Promise.all([
            carregarProfessores(),
            carregarTurmas()
        ]);
        await carregarLista();
        showToast('✅ Atualizado!', 'success');
    }

    // ============================================
    // 🔔 TOAST HELPER
    // ============================================
    function showToast(mensagem, tipo = 'info') {
        // Usar o toast do setor pedagógico se disponível
        if (window.setorPedagogico && typeof window.setorPedagogico.showToast === 'function') {
            window.setorPedagogico.showToast(mensagem, tipo);
            return;
        }

        // Fallback
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed; bottom: 20px; right: 20px;
            background: ${tipo === 'success' ? '#10b981' : tipo === 'error' ? '#ef4444' : tipo === 'warning' ? '#f59e0b' : '#3b82f6'};
            color: white; padding: 14px 20px; border-radius: 10px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 99999;
            font-size: 14px; font-weight: 500; max-width: 400px;
            animation: slideInProt 0.3s ease;
        `;
        toast.textContent = mensagem;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    // ============================================
    // 🌐 API PÚBLICA
    // ============================================
    return {
        init,
        recarregar,
        selecionarProfessor,
        limparProfessor,
        onTipoProvaChange,
        adicionarTurma,
        removerTurma,
        toggleAluno,
        toggleAssinatura,
        cancelarSessaoAssinatura,
        copiarLinkAssinatura,
        fecharModalQRCode,
        registrarProtocolo,
        resetarFormulario,
        carregarLista,
        verProtocolo,
        imprimirProtocolo,
        editarProtocolo,
        excluirProtocolo,
        limparFiltros,
        carregarDashboard
    };
})();

// Expor globalmente
window.ProtocoloProvasModule = ProtocoloProvasModule;