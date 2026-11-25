// ============================================================================
// 2chamada-pedagogico.js
// 2ª CHAMADA — SETOR PEDAGÓGICO (com RASCUNHO AUTOMÁTICO integrado)
//
// COMO USAR
// 1) Carregue este arquivo DEPOIS do script que define a classe principal
//    (a que tem this.token, this.showToast, this.escapeHtml, etc.):
//        <script src="/js/2chamada-pedagogico.js"></script>
//
// 2) Logo após a definição da classe principal, instale os métodos:
//        instalarSegundaChamadaPedagogico(SetorPedagogico);   // nome da SUA classe
//    (se a instância `window.setorPedagogico` já existir, instala nela também)
//
// 3) REMOVA da classe principal os métodos antigos que estão neste arquivo
//    (ou deixe: os daqui sobrescrevem os da classe ao instalar).
//
// O construtor da classe principal deve continuar tendo:
//    this.estadoSegundaChamada, this.paginacao2Chamada, this.charts2Chamada,
//    this.autocomplete2Chamada, this.relatorio2Chamada, this.assinaturaSegundaChamada
// ============================================================================

class Segunda2ChamadaPedagogico {

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
                            <!-- 🆕 Título com indicador de rascunho -->
                            <h5 class="d-flex align-items-center flex-wrap gap-2">
                                <span><i class="fas fa-redo"></i> Registrar 2ª Chamada</span>
                                <span id="indicadorRascunho2Chamada"
                                      style="display:none;align-items:center;gap:5px;font-size:11px;font-weight:600;
                                             color:#065f46;background:#d1fae5;border:1px solid #10b981;
                                             padding:3px 10px;border-radius:20px;"></span>
                            </h5>

                            <div class="row">
                                <div class="col-md-4 mb-3">
                                    <label class="form-label">Data da Falta (Início) <span class="text-danger">*</span></label>
                                    <input type="date" id="segundaChamadaPeriodoFaltaInicio" class="form-control" required>
                                    <small class="text-muted">Primeiro dia da falta</small>
                                </div>
                                <div class="col-md-4 mb-3">
                                    <label class="form-label">Data da Falta (Fim)</label>
                                    <input type="date" id="segundaChamadaPeriodoFaltaFim" class="form-control">
                                    <small class="text-muted">Deixe vazio se for 1 dia só</small>
                                </div>
                                <div class="col-md-4 mb-3">
                                    <label class="form-label">Data do Registro <span class="text-danger">*</span></label>
                                    <input type="date" id="segundaChamadaData" class="form-control" required>
                                    <small class="text-muted">Quando está sendo registrado</small>
                                </div>
                            </div>

                            <div class="mb-3" id="campoSegundaChamadaTipoProva">
                                <label class="form-label">Tipo de Prova Perdida <span class="text-danger">*</span></label>
                                <div class="tipos-tarefa-grid">
                                    <div class="tipo-card" data-prova="AV1" onclick="setorPedagogico.selecionarTipoProvaPerdida('AV1')">
                                        <i class="fas fa-file-alt"></i><span>AV1</span>
                                    </div>
                                    <div class="tipo-card" data-prova="AV2" onclick="setorPedagogico.selecionarTipoProvaPerdida('AV2')">
                                        <i class="fas fa-file-alt"></i><span>AV2</span>
                                    </div>
                                    <div class="tipo-card" data-prova="AV3" onclick="setorPedagogico.selecionarTipoProvaPerdida('AV3')">
                                        <i class="fas fa-file-alt"></i><span>AV3</span>
                                    </div>
                                    <div class="tipo-card" data-prova="AV4" onclick="setorPedagogico.selecionarTipoProvaPerdida('AV4')">
                                        <i class="fas fa-file-alt"></i><span>AV4</span>
                                    </div>
                                    <div class="tipo-card" data-prova="Recuperação" onclick="setorPedagogico.selecionarTipoProvaPerdida('Recuperação')">
                                        <i class="fas fa-redo"></i><span>Recuperação</span>
                                    </div>
                                    <div class="tipo-card" data-prova="Outros" onclick="setorPedagogico.selecionarTipoProvaPerdida('Outros')">
                                        <i class="fas fa-ellipsis-h"></i><span>Outros</span>
                                    </div>
                                </div>
                                <input type="hidden" id="segundaChamadaTipoProvaPerdida">
                            </div>

                            <div id="campoSegundaChamadaTipoProvaOutros" style="display: none;">
                                <div class="mb-3">
                                    <label class="form-label">Especifique o Tipo de Prova <span class="text-danger">*</span></label>
                                    <input type="text" id="segundaChamadaTipoProvaOutros" class="form-control" placeholder="Ex: Avaliação Prática, Trabalho...">
                                </div>
                            </div>

                            <!-- PERÍODO DA PROVA -->
                            <div class="mb-3" id="campoSegundaChamadaPeriodo">
                                <label class="form-label">Período da Prova <span class="text-danger">*</span></label>
                                <div class="tipos-tarefa-grid">
                                    <div class="tipo-card" data-periodo="1º Período" onclick="setorPedagogico.selecionarPeriodoProva('1º Período')">
                                        <i class="fas fa-1"></i><span>1º Período</span>
                                    </div>
                                    <div class="tipo-card" data-periodo="2º Período" onclick="setorPedagogico.selecionarPeriodoProva('2º Período')">
                                        <i class="fas fa-2"></i><span>2º Período</span>
                                    </div>
                                    <div class="tipo-card" data-periodo="3º Período" onclick="setorPedagogico.selecionarPeriodoProva('3º Período')">
                                        <i class="fas fa-3"></i><span>3º Período</span>
                                    </div>
                                    <div class="tipo-card" data-periodo="4º Período" onclick="setorPedagogico.selecionarPeriodoProva('4º Período')">
                                        <i class="fas fa-4"></i><span>4º Período</span>
                                    </div>
                                </div>
                                <input type="hidden" id="segundaChamadaPeriodoProva">
                            </div>

                            <div class="row">
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
                                            <label class="form-label">CPF <span class="text-danger">*</span></label>
                                            <input type="text" id="segundaChamadaResponsavelCPF" class="form-control" placeholder="000.000.000-00" maxlength="14" oninput="setorPedagogico.formatarCPF(this)" required>
                                        </div>
                                        <div class="col-md-3 mb-3">
                                            <label class="form-label">Telefone</label>
                                            <input type="text" id="segundaChamadaResponsavelTelefone" class="form-control" placeholder="(00) 00000-0000" maxlength="15" oninput="setorPedagogico.formatarTelefone(this)">
                                        </div>
                                    </div>

                                    <div class="assinatura-wrapper">
                                        <div class="form-check p-3" style="background: #f8fafc; border-radius: 10px; border: 2px solid #e2e8f0;">
                                            <input class="form-check-input" type="checkbox"
                                                id="segundaChamadaNecessitaAssinatura"
                                                onchange="setorPedagogico.toggleNecessitaAssinatura('segundaChamada')"
                                                style="width: 20px; height: 20px; margin-top: 2px;">
                                            <label class="form-check-label" for="segundaChamadaNecessitaAssinatura" style="margin-left: 8px; cursor: pointer;">
                                                <strong><i class="fas fa-signature"></i> Necessita de assinatura do responsável</strong>
                                                <p style="margin: 5px 0 0; font-size: 13px; color: #64748b;">
                                                    Marque para gerar um QR Code. O responsável escaneia e assina no celular dele.
                                                </p>
                                            </label>
                                        </div>

                                        <div id="segundaChamadaBlocoAssinaturaInfo" style="display: none;"></div>
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
                        <div class="row g-3 mb-4">
                            <div class="col-md-3">
                                <div class="metric-card">
                                    <i class="fas fa-calendar-day fa-2x text-primary mb-2"></i>
                                    <div class="metric-value" id="SegundaChamadaTotalHoje">0</div>
                                    <div class="metric-label">Hoje</div>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="metric-card">
                                    <i class="fas fa-calendar-week fa-2x text-success mb-2"></i>
                                    <div class="metric-value" id="SegundaChamadaTotalSemana">0</div>
                                    <div class="metric-label">Esta Semana</div>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="metric-card">
                                    <i class="fas fa-calendar-alt fa-2x text-info mb-2"></i>
                                    <div class="metric-value" id="SegundaChamadaTotalMes">0</div>
                                    <div class="metric-label">Este Mês</div>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="metric-card">
                                    <i class="fas fa-chart-line fa-2x text-warning mb-2"></i>
                                    <div class="metric-value" id="SegundaChamadaTotalGeral">0</div>
                                    <div class="metric-label">Total Geral</div>
                                </div>
                            </div>
                        </div>
                        <div class="row g-3">
                            <div class="col-md-6">
                                <div class="card h-100">
                                    <div class="card-body">
                                        <h6 class="card-title">
                                            <i class="fas fa-chart-pie text-primary"></i> Por Motivo
                                        </h6>
                                        <div style="height: 280px; position: relative;">
                                            <canvas id="SegundaChamadaChartMotivos"></canvas>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="card h-100">
                                    <div class="card-body">
                                        <h6 class="card-title">
                                            <i class="fas fa-chart-bar text-success"></i> Registros por Dia
                                        </h6>
                                        <div style="height: 280px; position: relative;">
                                            <canvas id="SegundaChamadaChartAtrasos"></canvas>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="card h-100">
                                    <div class="card-body">
                                        <h6 class="card-title">
                                            <i class="fas fa-users text-info"></i> Por Turma
                                        </h6>
                                        <div style="height: 280px; position: relative;">
                                            <canvas id="SegundaChamadaChartTurmas"></canvas>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="card h-100">
                                    <div class="card-body">
                                        <h6 class="card-title">
                                            <i class="fas fa-exclamation-triangle text-warning"></i>
                                            Alunos Reincidentes (3+ registros)
                                        </h6>
                                        <div id="SegundaChamadaAlunosReincidentes" class="mt-3">
                                            <div class="text-center py-3">
                                                <div class="loading-spinner"></div>
                                                <p class="text-muted mb-0">Carregando...</p>
                                            </div>
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
                                <div class="col-md-3">
                                    <label class="form-label">Filtrar por</label>
                                    <select id="SegundaChamadaFiltroPorData" class="form-select">
                                        <option value="falta" selected>📆 Período da Falta</option>
                                        <option value="registro">📝 Data do Registro</option>
                                    </select>
                                </div>
                                <div class="col-md-3">
                                    <label class="form-label">Tipo de Prova Perdida</label>
                                    <select id="SegundaChamadaFiltroTipoProva" class="form-select">
                                        <option value="todos">Todos os tipos</option>
                                        <option value="AV1">AV1</option>
                                        <option value="AV2">AV2</option>
                                        <option value="AV3">AV3</option>
                                        <option value="AV4">AV4</option>
                                        <option value="Recuperação">Recuperação</option>
                                        <option value="Outros">Outros</option>
                                    </select>
                                </div>
                                <div class="col-md-3">
                                    <label class="form-label">Período da Prova</label>
                                    <select id="SegundaChamadaFiltroPeriodoProva" class="form-select">
                                        <option value="todos">Todos os períodos</option>
                                        <option value="1º Período">1º Período</option>
                                        <option value="2º Período">2º Período</option>
                                        <option value="3º Período">3º Período</option>
                                        <option value="4º Período">4º Período</option>
                                    </select>
                                </div>
                                <div class="col-md-2">
                                    <label class="form-label">&nbsp;</label>
                                    <button class="btn btn-primary w-100" onclick="setorPedagogico.carregarRelatorioSegundaChamada()">
                                        <i class="fas fa-search"></i> Buscar
                                    </button>
                                </div>
                                <div class="col-md-2">
                                    <label class="form-label">&nbsp;</label>
                                    <div class="btn-group w-100">
                                        <button class="btn btn-success" onclick="setorPedagogico.exportarCSVSegundaChamada()" id="btnExportarCSVSegundaChamada" disabled>
                                            <i class="fas fa-file-csv"></i> CSV
                                        </button>
                                        <button class="btn btn-danger" onclick="setorPedagogico.exportarPDF2Chamada()" id="btnExportarPDFSegundaChamada" disabled>
                                            <i class="fas fa-print"></i> PDF
                                        </button>
                                    </div>
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
                                <select id="filtroListaSegundaChamadaTipoProva" class="form-select form-select-sm">
                                    <option value="">Todos os tipos</option>
                                    <option value="AV1">AV1</option>
                                    <option value="AV2">AV2</option>
                                    <option value="AV3">AV3</option>
                                    <option value="AV4">AV4</option>
                                    <option value="Recuperação">Recuperação</option>
                                    <option value="Outros">Outros</option>
                                </select>
                            </div>
                            <div class="col-md-2">
                                <select id="filtroListaSegundaChamadaPeriodoProva" class="form-select form-select-sm">
                                    <option value="">Todos os períodos</option>
                                    <option value="1º Período">1º Período</option>
                                    <option value="2º Período">2º Período</option>
                                    <option value="3º Período">3º Período</option>
                                    <option value="4º Período">4º Período</option>
                                </select>
                            </div>
                            <div class="col-md-1">
                                <input type="date" id="filtroListaSegundaChamadaDataInicio" class="form-control form-control-sm">
                            </div>
                            <div class="col-md-1">
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
            if (dataEl) dataEl.value = getDataLocalISO();

            this.estadoSegundaChamada = {
                currentAluno: null,
                motivoSelecionado: null,
                modoAtual: 'automatico',
                alunosPorTurma: [],
                scanner: null,
                scannerAtivo: false,
                sessaoAssinaturaId: null,
                assinaturaCapturada: null,
                monitoramentoInterval: null,
                qrCodeDataUrl: null
            };

            this.configurarEventosSegundaChamada();

            // 🆕 RASCUNHO: auto-save + banner de restauração
            this.vincularAutoSaveRascunho2Chamada();
            const rascunho2Ch = this.obterRascunho2Chamada();
            if (rascunho2Ch) this.mostrarBannerRascunho2Chamada(rascunho2Ch);

            await this.carregarTurmasSegundaChamada();

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
         'filtroListaSegundaChamadaTipoProva',
         'filtroListaSegundaChamadaPeriodoProva',
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
        if (!id) { this.mostrarNotificacao('QR Code inválido', 'error'); return; }
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
            this.mostrarNotificacao('Erro ao buscar aluno', 'error');
        }
    }

    exibirAlunoSegundaChamada(data) {
        const aluno = data.aluno;

        const foto = document.getElementById('alunoFotoSegundaChamada');
        if (foto) {
            foto.onerror = null;
            foto.src = aluno.fotoPerfil || this.gerarAvatarSVG(aluno.nome);
            foto.onerror = () => { foto.onerror = null; foto.src = this.gerarAvatarSVG(aluno.nome); };
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

        // 🆕 Se estiver restaurando rascunho, NÃO limpa os campos
        if (this._rascunho2ChRestaurando) return;

        document.getElementById('segundaChamadaMotivoSelecionado').value = '';
        this.estadoSegundaChamada.motivoSelecionado = null;
        document.querySelectorAll('#formSegundaChamada .tipo-card').forEach(c => c.classList.remove('selected'));

        [
            'segundaChamadaData',
            'segundaChamadaHorario',
            'segundaChamadaMotivoOutros',
            'segundaChamadaResponsavelNome',
            'segundaChamadaResponsavelCPF',
            'segundaChamadaResponsavelTelefone',
            'segundaChamadaObservacoes',
            'segundaChamadaPeriodoFaltaInicio',
            'segundaChamadaPeriodoFaltaFim',
            'segundaChamadaTipoProvaPerdida',
            'segundaChamadaTipoProvaOutros',
            'segundaChamadaPeriodoProva'
        ].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });

        const campoOutros = document.getElementById('campoSegundaChamadaOutros');
        if (campoOutros) campoOutros.style.display = 'none';

        document.querySelectorAll('#campoSegundaChamadaTipoProva .tipo-card').forEach(c => c.classList.remove('selected'));
        document.querySelectorAll('#campoSegundaChamadaPeriodo .tipo-card').forEach(c => c.classList.remove('selected'));

        const campoProvaOutros = document.getElementById('campoSegundaChamadaTipoProvaOutros');
        if (campoProvaOutros) campoProvaOutros.style.display = 'none';

        const dataEl = document.getElementById('segundaChamadaData');
        if (dataEl) dataEl.value = getDataLocalISO();

        const checkAssinatura = document.getElementById('segundaChamadaNecessitaAssinatura');
        if (checkAssinatura) checkAssinatura.checked = false;

        const blocoAssinatura = document.getElementById('segundaChamadaBlocoAssinaturaInfo');
        if (blocoAssinatura) {
            blocoAssinatura.style.display = 'none';
            blocoAssinatura.innerHTML = '';
        }

        const sessaoAnterior = this.estadoSegundaChamada?.sessaoAssinaturaId;
        if (sessaoAnterior) {
            fetch(`/api/sessoes-assinatura/${sessaoAnterior}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${this.token}` }
            }).catch(e => console.warn(e));
        }

        this.pararMonitoramentoSessao('segundaChamada');
        this.fecharModalAssinatura();

        if (this.estadoSegundaChamada) {
            this.estadoSegundaChamada.sessaoAssinaturaId = null;
            this.estadoSegundaChamada.assinaturaCapturada = null;
            this.estadoSegundaChamada.qrCodeDataUrl = null;
            this.estadoSegundaChamada.monitoramentoInterval = null;
        }

        setTimeout(() => {
            formEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    }

    selecionarMotivoSegundaChamada(motivo) {
        this.estadoSegundaChamada.motivoSelecionado = motivo;
        const el = document.getElementById('segundaChamadaMotivoSelecionado');
        if (el) el.value = motivo;

        document.querySelectorAll('#formSegundaChamada .tipo-card[data-tipo]').forEach(c => c.classList.remove('selected'));
        const card = document.querySelector(`#formSegundaChamada .tipo-card[data-tipo="${motivo}"]`);
        if (card) card.classList.add('selected');

        const campoOutros = document.getElementById('campoSegundaChamadaOutros');
        if (campoOutros) campoOutros.style.display = motivo === 'outros' ? 'block' : 'none';
    }

    selecionarTipoProvaPerdida(tipo) {
        const input = document.getElementById('segundaChamadaTipoProvaPerdida');
        if (input) input.value = tipo;

        document.querySelectorAll('#campoSegundaChamadaTipoProva .tipo-card').forEach(c => c.classList.remove('selected'));
        const card = document.querySelector(`#campoSegundaChamadaTipoProva .tipo-card[data-prova="${tipo}"]`);
        if (card) card.classList.add('selected');

        const campoOutros = document.getElementById('campoSegundaChamadaTipoProvaOutros');
        if (campoOutros) campoOutros.style.display = tipo === 'Outros' ? 'block' : 'none';
    }

    // Período da Prova
    selecionarPeriodoProva(periodo) {
        const input = document.getElementById('segundaChamadaPeriodoProva');
        if (input) input.value = periodo;

        document.querySelectorAll('#campoSegundaChamadaPeriodo .tipo-card').forEach(c => c.classList.remove('selected'));
        const card = document.querySelector(`#campoSegundaChamadaPeriodo .tipo-card[data-periodo="${periodo}"]`);
        if (card) card.classList.add('selected');
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

    validarCPFCliente(cpf) {
        if (!cpf || typeof cpf !== 'string') {
            return { valido: false, erro: 'CPF não informado' };
        }

        const cpfLimpo = cpf.replace(/\D/g, '');

        if (cpfLimpo.length !== 11) {
            return { valido: false, erro: 'CPF deve conter 11 dígitos' };
        }

        if (/^(\d)\1{10}$/.test(cpfLimpo)) {
            return { valido: false, erro: 'CPF inválido (dígitos repetidos)' };
        }

        let soma = 0;
        for (let i = 0; i < 9; i++) {
            soma += parseInt(cpfLimpo.charAt(i)) * (10 - i);
        }
        let resto = (soma * 10) % 11;
        if (resto === 10 || resto === 11) resto = 0;
        if (resto !== parseInt(cpfLimpo.charAt(9))) {
            return { valido: false, erro: 'CPF inválido (1º dígito verificador)' };
        }

        soma = 0;
        for (let i = 0; i < 10; i++) {
            soma += parseInt(cpfLimpo.charAt(i)) * (11 - i);
        }
        resto = (soma * 10) % 11;
        if (resto === 10 || resto === 11) resto = 0;
        if (resto !== parseInt(cpfLimpo.charAt(10))) {
            return { valido: false, erro: 'CPF inválido (2º dígito verificador)' };
        }

        return { valido: true, cpfLimpo };
    }

    async registrarSegundaChamada() {
        const est = this.estadoSegundaChamada;

        if (!est.motivoSelecionado) {
            this.showToast('Selecione o motivo', 'error');
            return;
        }

        const data = document.getElementById('segundaChamadaData')?.value;
        if (!data) {
            this.showToast('Preencha a data do registro', 'error');
            return;
        }

        const periodoFaltaInicio = document.getElementById('segundaChamadaPeriodoFaltaInicio')?.value || '';
        const periodoFaltaFim = document.getElementById('segundaChamadaPeriodoFaltaFim')?.value || '';

        if (!periodoFaltaInicio) {
            this.showToast('Informe a data da falta (início)', 'error');
            return;
        }
        if (periodoFaltaFim && periodoFaltaFim < periodoFaltaInicio) {
            this.showToast('Data final não pode ser anterior à data inicial', 'error');
            return;
        }

        const tipoProvaPerdida = document.getElementById('segundaChamadaTipoProvaPerdida')?.value || '';
        const tipoProvaPerdidaOutros = document.getElementById('segundaChamadaTipoProvaOutros')?.value || '';
        const periodoProva = document.getElementById('segundaChamadaPeriodoProva')?.value || '';

        if (!tipoProvaPerdida) {
            this.showToast('⚠️ Informe o tipo de prova perdida', 'error');
            return;
        }
        if (tipoProvaPerdida === 'Outros' && !tipoProvaPerdidaOutros.trim()) {
            this.showToast('⚠️ Especifique o tipo de prova perdida', 'error');
            return;
        }

        if (!periodoProva) {
            this.showToast('⚠️ Informe o período da prova (1º, 2º, 3º ou 4º Período)', 'error');
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

        const responsavelCPF = document.getElementById('segundaChamadaResponsavelCPF')?.value || '';

        if (!responsavelCPF || responsavelCPF.trim() === '') {
            this.showToast('⚠️ CPF do responsável é obrigatório!\n\nPreencha o CPF antes de registrar.', 'error');
            document.getElementById('segundaChamadaResponsavelCPF')?.focus();
            return;
        }

        const validacaoCPF = this.validarCPFCliente(responsavelCPF);
        if (!validacaoCPF.valido) {
            this.showToast(`⚠️ CPF inválido!\n\n${validacaoCPF.erro}`, 'error');
            document.getElementById('segundaChamadaResponsavelCPF')?.focus();
            return;
        }

        const precisaAssinatura = document.getElementById('segundaChamadaNecessitaAssinatura')?.checked || false;
        const assinaturaBase64 = est.assinaturaCapturada || '';

        if (precisaAssinatura && !assinaturaBase64) {
            this.showToast('⚠️ Aguardando assinatura! O responsável ainda não assinou o QR Code.', 'warning');
            this.reabrirModalAssinatura('segundaChamada');
            return;
        }

        const btn = document.querySelector('#formSegundaChamada .btn-primary-custom');
        if (btn) btn.disabled = true;

        try {
            const body = {
                tipo: 'segunda_chamada',
                alunoId: est.currentAluno.id,
                data,
                periodoFaltaInicio: periodoFaltaInicio || undefined,
                periodoFaltaFim: periodoFaltaFim || periodoFaltaInicio,
                tipoProvaPerdida: tipoProvaPerdida,
                tipoProvaPerdidaOutros: tipoProvaPerdida === 'Outros' ? tipoProvaPerdidaOutros.trim() : undefined,
                periodoProva: periodoProva,
                horarioEntrada: document.getElementById('segundaChamadaHorario')?.value || '08:00',
                horarioSaida: document.getElementById('segundaChamadaHorario')?.value || '08:00',
                responsavelNome: document.getElementById('segundaChamadaResponsavelNome')?.value || '',
                responsavelCPF: responsavelCPF,
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

            if (r.status === 409 || (d.error && d.error.includes('Já existe'))) {
                let msg = '⚠️ Registro duplicado detectado!\n\n';
                msg += d.error || 'Já existe um registro com os mesmos dados.';
                if (d.duplicado) {
                    msg += `\n\n📌 Registrado por: ${d.duplicado.registradoPor || 'N/D'}`;
                    msg += `\n📅 Data: ${d.duplicado.data ? new Date(d.duplicado.data).toLocaleDateString('pt-BR') : 'N/D'}`;
                    msg += `\n👤 CPF: ${d.duplicado.responsavelCPF || 'N/D'}`;
                }
                this.showToast(msg, 'error');
                if (btn) btn.disabled = false;
                return;
            }

            if (!d.success) {
                this.showToast('❌ ' + (d.error || 'Erro'), 'error');
                return;
            }

            // 🆕 Registrado com sucesso → rascunho não é mais necessário
            this.limparRascunho2Chamada();

            console.log('✅ 2ª Chamada registrada:', d.autorizacao.id);

            const sessaoId = est.sessaoAssinaturaId;
            if (sessaoId) {
                try {
                    await fetch(`/api/sessoes-assinatura/${sessaoId}`, {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${this.token}` }
                    });
                    console.log('✅ Sessão de assinatura removida');
                } catch (e) {
                    console.warn('Erro ao remover sessão:', e);
                }
            }

            this.pararMonitoramentoSessao('segundaChamada');
            this.fecharModalAssinatura();

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
                    periodoFaltaInicio,
                    periodoFaltaFim: periodoFaltaFim || periodoFaltaInicio,
                    motivo: motivosMap[est.motivoSelecionado] || 'outros',
                    motivoOutros: document.getElementById('segundaChamadaMotivoOutros')?.value || '',
                    responsavelNome: document.getElementById('segundaChamadaResponsavelNome')?.value || '',
                    responsavelCPF: responsavelCPF,
                    responsavelTelefone: document.getElementById('segundaChamadaResponsavelTelefone')?.value || '',
                    observacoes: `Gerada automaticamente a partir de 2ª Chamada (${tipoProvaPerdida} - ${periodoProva}) | ${document.getElementById('segundaChamadaObservacoes')?.value || ''}`.trim(),
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
                    console.log('✅ Justificativa automática criada:', justD.autorizacao.id);
                }
            } catch (e) {
                console.warn('⚠️ Erro ao criar justificativa:', e);
            }

            let msg = `✅ ${d.message}`;
            if (justificativaCriada) msg += ' — Justificativa criada automaticamente!';
            this.showToast(msg, 'success');

            const imprimir = await this.confirmarAcao('Deseja IMPRIMIR agora?');
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

        const sessaoId = this.estadoSegundaChamada.sessaoAssinaturaId;
        if (sessaoId) {
            fetch(`/api/sessoes-assinatura/${sessaoId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${this.token}` }
            }).catch(e => console.warn(e));
        }

        this.pararMonitoramentoSessao('segundaChamada');
        this.fecharModalAssinatura();

        this.estadoSegundaChamada.currentAluno = null;
        this.estadoSegundaChamada.motivoSelecionado = null;
        this.estadoSegundaChamada.sessaoAssinaturaId = null;
        this.estadoSegundaChamada.assinaturaCapturada = null;
        this.estadoSegundaChamada.qrCodeDataUrl = null;
        this.limparAssinatura('segundaChamada');

        // 🆕 Cancelou / concluiu → descarta rascunho
        this.limparRascunho2Chamada();
    }

    reiniciarScannerSegundaChamada() {
        setTimeout(() => {
            if (!this.estadoSegundaChamada.scannerAtivo && this.estadoSegundaChamada.modoAtual === 'automatico') {
                this.iniciarScannerSegundaChamada();
            }
        }, 1000);
    }

    // ============================================================================
    // 🆕 RASCUNHO DA 2ª CHAMADA (auto-save / restaurar)
    // ============================================================================
    get RASCUNHO_2CH_VERSAO() { return 1; }
    get RASCUNHO_2CH_INTERVALO() { return 700; }
    get RASCUNHO_2CH_VALIDADE_MS() { return 7 * 24 * 60 * 60 * 1000; } // 7 dias

    _chaveRascunho2Chamada() {
        let uid = 'anon';
        try {
            const u = JSON.parse(localStorage.getItem('user_data') || '{}');
            uid = u.id || u._id || u.email || u.nome || 'anon';
        } catch (e) {}
        return `pedagogico_rascunho_segunda_chamada_${uid}`;
    }

    coletarDadosRascunho2Chamada() {
        const est = this.estadoSegundaChamada || {};
        const val = (id) => document.getElementById(id)?.value || '';
        const a = est.currentAluno;

        return {
            versao: this.RASCUNHO_2CH_VERSAO,
            salvoEm: Date.now(),
            aluno: a ? {
                id: a.id || a._id,
                nome: a.nome,
                matricula: a.matricula,
                turma: a.turma,
                curso: a.curso,
                fotoPerfil: a.fotoPerfil
            } : null,
            periodoFaltaInicio: val('segundaChamadaPeriodoFaltaInicio'),
            periodoFaltaFim: val('segundaChamadaPeriodoFaltaFim'),
            data: val('segundaChamadaData'),
            tipoProvaPerdida: val('segundaChamadaTipoProvaPerdida'),
            tipoProvaOutros: val('segundaChamadaTipoProvaOutros'),
            periodoProva: val('segundaChamadaPeriodoProva'),
            horario: val('segundaChamadaHorario'),
            motivo: est.motivoSelecionado || val('segundaChamadaMotivoSelecionado'),
            motivoOutros: val('segundaChamadaMotivoOutros'),
            responsavelNome: val('segundaChamadaResponsavelNome'),
            responsavelCPF: val('segundaChamadaResponsavelCPF'),
            responsavelTelefone: val('segundaChamadaResponsavelTelefone'),
            observacoes: val('segundaChamadaObservacoes'),
            precisaAssinatura: document.getElementById('segundaChamadaNecessitaAssinatura')?.checked || false,
            assinaturaBase64: est.assinaturaCapturada || null
        };
    }

    salvarRascunho2ChamadaAgora() {
        if (this._rascunho2ChRestaurando) return;
        try {
            // Sem aluno = sem formulário ativo: NÃO mexe no rascunho existente
            // (assim um F5 antes de restaurar não apaga o que estava salvo)
            if (!this.estadoSegundaChamada?.currentAluno) return;

            const dados = this.coletarDadosRascunho2Chamada();
            localStorage.setItem(this._chaveRascunho2Chamada(), JSON.stringify(dados));
            this.atualizarIndicadorRascunho2Chamada(true, dados.salvoEm);
        } catch (e) {
            console.warn('[RASCUNHO 2ª CHAMADA]', e);
            // Se estourar a cota por causa da assinatura, salva sem ela
            try {
                const dados = this.coletarDadosRascunho2Chamada();
                dados.assinaturaBase64 = null;
                localStorage.setItem(this._chaveRascunho2Chamada(), JSON.stringify(dados));
            } catch (e2) {}
        }
    }

    agendarSalvarRascunho2Chamada() {
        if (this._rascunho2ChRestaurando) return;
        clearTimeout(this._rascunho2ChTimer);
        this._rascunho2ChTimer = setTimeout(() => this.salvarRascunho2ChamadaAgora(), this.RASCUNHO_2CH_INTERVALO);
    }

    limparRascunho2Chamada() {
        try { localStorage.removeItem(this._chaveRascunho2Chamada()); } catch (e) {}
        clearTimeout(this._rascunho2ChTimer);
        this.atualizarIndicadorRascunho2Chamada(false);
        this.fecharBannerRascunho2Chamada();
    }

    obterRascunho2Chamada() {
        try {
            const raw = localStorage.getItem(this._chaveRascunho2Chamada());
            if (!raw) return null;
            const d = JSON.parse(raw);
            if (!d || d.versao !== this.RASCUNHO_2CH_VERSAO) return null;
            if (Date.now() - (d.salvoEm || 0) > this.RASCUNHO_2CH_VALIDADE_MS) {
                localStorage.removeItem(this._chaveRascunho2Chamada());
                return null;
            }
            return d;
        } catch (e) { return null; }
    }

    atualizarIndicadorRascunho2Chamada(ativo, timestamp) {
        const el = document.getElementById('indicadorRascunho2Chamada');
        if (!el) return;
        if (ativo && timestamp) {
            const hora = new Date(timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            el.innerHTML = `<i class="fas fa-save"></i> Rascunho salvo às ${hora}`;
            el.style.display = 'inline-flex';
        } else {
            el.style.display = 'none';
        }
    }

    vincularAutoSaveRascunho2Chamada() {
        const form = document.getElementById('formSegundaChamada');
        if (form) {
            const handler = () => this.agendarSalvarRascunho2Chamada();
            form.addEventListener('input', handler, true);
            form.addEventListener('change', handler, true);
            // cards (tipo de prova, período, motivo) usam onclick
            form.addEventListener('click', (e) => {
                if (e.target.closest('.tipo-card')) this.agendarSalvarRascunho2Chamada();
            });
        }

        // Listeners globais só uma vez (a tela pode ser recarregada várias vezes)
        if (!this._rascunho2ChGlobais) {
            this._rascunho2ChGlobais = true;
            window.addEventListener('beforeunload', () => this.salvarRascunho2ChamadaAgora());
            window.addEventListener('pagehide', () => this.salvarRascunho2ChamadaAgora());
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'hidden') this.salvarRascunho2ChamadaAgora();
            });
        }
    }

    // ---------------- BANNER ----------------
    mostrarBannerRascunho2Chamada(dados) {
        this.fecharBannerRascunho2Chamada();
        if (!dados) return;

        const hora = new Date(dados.salvoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const data = new Date(dados.salvoEm).toLocaleDateString('pt-BR');
        const nome = dados.aluno?.nome || 'Aluno não definido';
        const turma = dados.aluno?.turma ? ` • ${dados.aluno.turma}` : '';
        const prova = dados.tipoProvaPerdida
            ? `${dados.tipoProvaPerdida}${dados.periodoProva ? ' - ' + dados.periodoProva : ''}`
            : 'Prova não definida';

        const banner = document.createElement('div');
        banner.id = 'bannerRascunho2Chamada';
        banner.style.cssText = `
            position: fixed; top: 70px; left: 50%; transform: translateX(-50%);
            z-index: 99998; max-width: 640px; width: calc(100% - 32px);
            background: linear-gradient(135deg, #1e3c72, #2a5298);
            color: #fff; border-radius: 14px; padding: 14px 16px;
            box-shadow: 0 10px 30px rgba(30,60,114,.45);
            display: flex; align-items: center; gap: 14px;
            animation: slideDownBanner2Ch .35s ease;
        `;
        banner.innerHTML = `
            <div style="font-size:28px;flex-shrink:0;">📝</div>
            <div style="flex:1;min-width:0;">
                <div style="font-weight:700;font-size:14px;margin-bottom:2px;">Você tem uma 2ª Chamada em andamento</div>
                <div style="font-size:12.5px;opacity:.92;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                    <strong>${this.escapeHtml(nome)}</strong>${this.escapeHtml(turma)} • ${this.escapeHtml(prova)}
                </div>
                <div style="font-size:11px;opacity:.8;margin-top:3px;">Salvo em ${data} às ${hora}</div>
            </div>
            <div style="display:flex;gap:8px;flex-shrink:0;">
                <button id="btnRestaurarRascunho2Ch" style="background:#fff;color:#1e3c72;border:none;border-radius:9px;padding:9px 14px;font-weight:700;font-size:12.5px;cursor:pointer;display:flex;align-items:center;gap:6px;white-space:nowrap;">
                    <i class="fas fa-undo"></i> Restaurar
                </button>
                <button id="btnDescartarRascunho2Ch" title="Descartar" style="background:rgba(255,255,255,.18);color:#fff;border:none;border-radius:9px;padding:9px 11px;font-size:12.5px;cursor:pointer;">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        document.body.appendChild(banner);

        if (!document.getElementById('styleBannerRascunho2Ch')) {
            const st = document.createElement('style');
            st.id = 'styleBannerRascunho2Ch';
            st.textContent = `@keyframes slideDownBanner2Ch{from{opacity:0;transform:translate(-50%,-15px)}to{opacity:1;transform:translate(-50%,0)}}`;
            document.head.appendChild(st);
        }

        document.getElementById('btnRestaurarRascunho2Ch')?.addEventListener('click', () => this.restaurarRascunho2Chamada());
        document.getElementById('btnDescartarRascunho2Ch')?.addEventListener('click', async () => {
            if (await this.confirmarAcao('Descartar esta 2ª Chamada em andamento? Os dados serão perdidos.')) {
                this.limparRascunho2Chamada();
                this.showToast('Rascunho descartado.', 'info');
            }
        });
    }

    fecharBannerRascunho2Chamada() {
        document.getElementById('bannerRascunho2Chamada')?.remove();
    }

    // ---------------- RESTAURAR ----------------
    async restaurarRascunho2Chamada() {
        const dados = this.obterRascunho2Chamada();
        if (!dados) { this.fecharBannerRascunho2Chamada(); return; }

        const est = this.estadoSegundaChamada;
        this._rascunho2ChRestaurando = true;
        this.fecharBannerRascunho2Chamada();

        try {
            if (!dados.aluno?.id) {
                this.showToast('Rascunho sem aluno definido. Recomece a seleção.', 'warning');
                return;
            }

            // 1) Garante a aba "Registrar"
            const aba = document.getElementById('segundaChamada-registrar-tab');
            if (aba) { try { new bootstrap.Tab(aba).show(); } catch (e) { aba.click(); } }

            // 2) Tenta recarregar o aluno do servidor (se tiver internet)
            if (navigator.onLine) {
                await this.buscarAlunoSegundaChamada(dados.aluno.id);
            }

            // 2b) Sem internet / falhou → usa os dados do aluno guardados no rascunho
            if (!est.currentAluno) {
                await this.pararScannerSegundaChamada();
                est.currentAluno = { ...dados.aluno };
                this.exibirAlunoSegundaChamada({ aluno: est.currentAluno });
                this.mostrarFormSegundaChamada(); // não limpa: _rascunho2ChRestaurando = true
            }

            // 3) Campos simples
            const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
            set('segundaChamadaPeriodoFaltaInicio', dados.periodoFaltaInicio);
            set('segundaChamadaPeriodoFaltaFim', dados.periodoFaltaFim);
            set('segundaChamadaData', dados.data || getDataLocalISO());
            set('segundaChamadaHorario', dados.horario);
            set('segundaChamadaResponsavelNome', dados.responsavelNome);
            set('segundaChamadaResponsavelCPF', dados.responsavelCPF);
            set('segundaChamadaResponsavelTelefone', dados.responsavelTelefone);
            set('segundaChamadaObservacoes', dados.observacoes);

            // 4) Cards (tipo de prova, período, motivo)
            if (dados.tipoProvaPerdida) {
                this.selecionarTipoProvaPerdida(dados.tipoProvaPerdida);
                set('segundaChamadaTipoProvaOutros', dados.tipoProvaOutros);
            }
            if (dados.periodoProva) this.selecionarPeriodoProva(dados.periodoProva);
            if (dados.motivo) {
                this.selecionarMotivoSegundaChamada(dados.motivo);
                set('segundaChamadaMotivoOutros', dados.motivoOutros);
            }

            // 5) Assinatura
            const check = document.getElementById('segundaChamadaNecessitaAssinatura');
            if (dados.assinaturaBase64) {
                est.assinaturaCapturada = dados.assinaturaBase64;
                if (check) check.checked = true;
                this.atualizarStatusAssinado('segundaChamada', {
                    assinaturaBase64: dados.assinaturaBase64,
                    assinadaPorNome: 'Responsável',
                    assinadaEm: new Date(dados.salvoEm).toISOString()
                });
            } else if (dados.precisaAssinatura) {
                // A sessão/QR anterior não existe mais → precisa marcar de novo
                if (check) check.checked = false;
                this.showToast('Marque novamente "Necessita de assinatura" para gerar um novo QR Code.', 'info');
            }

            this.atualizarIndicadorRascunho2Chamada(true, dados.salvoEm);
            this.showToast('📝 2ª Chamada restaurada! Continue de onde parou.', 'success');

            setTimeout(() => {
                document.getElementById('formSegundaChamada')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 350);

        } catch (e) {
            console.error('[RASCUNHO 2ª CHAMADA] Erro ao restaurar:', e);
            this.showToast('Não foi possível restaurar completamente.', 'warning');
        } finally {
            this._rascunho2ChRestaurando = false;
            this.agendarSalvarRascunho2Chamada();
        }
    }

    // ============================================
    // LISTA DE 2ªS CHAMADAS
    // ============================================
    async carregarListaSegundaChamada(pagina = null) {
        const container = document.getElementById('listaSegundaChamada');
        if (!container) return;

        if (pagina === null) pagina = this.paginacao2Chamada.paginaAtual;
        this.paginacao2Chamada.paginaAtual = pagina;

        const alunoNome = document.getElementById('filtroListaSegundaChamadaAluno')?.value || '';
        const turma = document.getElementById('filtroListaSegundaChamadaTurma')?.value || '';
        const motivo = document.getElementById('filtroListaSegundaChamadaMotivo')?.value || '';
        const tipoProvaPerdida = document.getElementById('filtroListaSegundaChamadaTipoProva')?.value || '';
        const periodoProvaFiltro = document.getElementById('filtroListaSegundaChamadaPeriodoProva')?.value || '';
        const dataInicio = document.getElementById('filtroListaSegundaChamadaDataInicio')?.value || '';
        const dataFim = document.getElementById('filtroListaSegundaChamadaDataFim')?.value || '';

        let dataInicioFinal = dataInicio;
        let dataFimFinal = dataFim;

        if (dataInicio && !dataFim) dataFimFinal = dataInicio;
        if (dataFim && !dataInicio) dataInicioFinal = dataFim;

        const limit = this.paginacao2Chamada.porPagina;
        let url = `/api/gestao-geral/autorizacao/listar?tipo=segunda_chamada&limit=${limit}&page=${pagina}`;
        if (alunoNome) url += `&alunoNome=${encodeURIComponent(alunoNome)}`;
        if (turma) url += `&turma=${encodeURIComponent(turma)}`;
        if (motivo) url += `&motivo=${encodeURIComponent(motivo)}`;
        if (tipoProvaPerdida) url += `&tipoProvaPerdida=${encodeURIComponent(tipoProvaPerdida)}`;
        if (periodoProvaFiltro && periodoProvaFiltro !== 'todos') {
            url += `&periodoProva=${encodeURIComponent(periodoProvaFiltro)}`;
        }
        if (dataInicioFinal) url += `&dataInicio=${dataInicioFinal}`;
        if (dataFimFinal) url += `&dataFim=${dataFimFinal}`;
        url += `&filtrarPorPeriodoFalta=true`;

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

                this.paginacao2Chamada.totalRegistros = 0;
                this.paginacao2Chamada.totalPaginas = 0;
                return;
            }

            this.paginacao2Chamada.totalRegistros = d.total || 0;
            this.paginacao2Chamada.totalPaginas = d.totalPages || 1;

            container.innerHTML = `
                <div class="table-responsive">
                    <table class="table table-hover">
                        <thead>
                            <tr>
                                <th>Data Registro</th>
                                <th>Período da Falta</th>
                                <th>Tipo de Prova</th>
                                <th>Período</th>
                                <th>Aluno</th>
                                <th>Turma</th>
                                <th>Horário</th>
                                <th>Motivo</th>
                                <th>Responsável</th>
                                <th>Assinatura</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${d.autorizacoes.map(a => `
                                <tr>
                                    <td>${a.dataFormatada}</td>
                                    <td><strong style="color: #1e3c72;">${a.periodoFaltaFormatado || '-'}</strong></td>
                                    <td><span class="badge bg-warning text-dark">${this.escapeHtml(a.tipoProvaPerdidaFormatado || a.tipoProvaPerdida || '-')}</span></td>
                                    <td><span class="badge bg-primary">${this.escapeHtml(a.periodoProvaFormatado || a.periodoProva || '-')}</span></td>
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
                                        <div class="d-flex gap-1">
                                            <button class="btn btn-sm btn-info" onclick="setorPedagogico.verDetalhesSegundaChamada('${a.id}')" title="Ver detalhes">
                                                <i class="fas fa-eye"></i>
                                            </button>
                                            <button class="btn btn-sm btn-primary" onclick="setorPedagogico.imprimirSegundaChamada('${a.id}')" title="Imprimir">
                                                <i class="fas fa-print"></i>
                                            </button>
                                            <button class="btn btn-sm btn-warning" onclick="setorPedagogico.abrirEditarSegundaChamada('${a.id}')" title="Editar">
                                                <i class="fas fa-edit"></i>
                                            </button>
                                            <button class="btn btn-sm btn-danger" onclick="setorPedagogico.excluirSegundaChamada('${a.id}')" title="Excluir">
                                                <i class="fas fa-trash"></i>
                                            </button>
                                        </div>
                                    </td>
                                </tr>`).join('')}
                        </tbody>
                    </table>
                </div>
                ${this.renderizarPaginacao2Chamada()}
            `;
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

    // ============================================
    // 🔍 VER DETALHES DA 2ª CHAMADA
    // ============================================
    async verDetalhesSegundaChamada(id) {
        if (!id) return;

        try {
            const r = await fetch(`/api/gestao-geral/autorizacao/${id}`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            const d = await r.json();

            if (!d.success || !d.autorizacao) {
                this.showToast('Erro ao carregar os detalhes do registro', 'error');
                return;
            }

            const a = d.autorizacao;
            const old = document.getElementById('modalVer2Chamada');
            if (old) old.remove();

            let assinaturaHTML = '';
            if (a.assinaturaBase64) {
                assinaturaHTML = `
                    <div style="margin-top: 20px;">
                        <label style="font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px; display: block; margin-bottom: 8px;">
                            <i class="fas fa-signature"></i> Assinatura do Responsável
                        </label>
                        <div style="background: #f0fdf4; border: 2px solid #10b981; border-radius: 12px; padding: 12px; text-align: center;">
                            <img src="${a.assinaturaBase64}"
                                 alt="Assinatura"
                                 style="max-width: 100%; max-height: 130px; object-fit: contain;">
                            ${a.assinadaPorNome ? `<p style="margin: 8px 0 0; font-size: 12px; color: #065f46;"><strong>Assinado por:</strong> ${this.escapeHtml(a.assinadaPorNome)}</p>` : ''}
                            ${a.assinadaEm ? `<p style="margin: 2px 0 0; font-size: 11px; color: #065f46;">${new Date(a.assinadaEm).toLocaleString('pt-BR')}</p>` : ''}
                        </div>
                    </div>
                `;
            } else if (a.precisaAssinatura) {
                assinaturaHTML = `
                    <div style="margin-top: 20px;">
                        <label style="font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px; display: block; margin-bottom: 8px;">
                            <i class="fas fa-signature"></i> Assinatura do Responsável
                        </label>
                        <div style="background: #fef3c7; border: 2px dashed #f59e0b; border-radius: 12px; padding: 14px; text-align: center; color: #92400e;">
                            <i class="fas fa-clock"></i> Aguardando assinatura via QR Code
                        </div>
                    </div>
                `;
            }

            const temResponsavel = a.responsavelNome || a.responsavelCPF || a.responsavelTelefone;
            const responsavelHTML = temResponsavel ? `
                <div style="margin-top: 20px;">
                    <label style="font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px; display: block; margin-bottom: 8px;">
                        <i class="fas fa-user-shield"></i> Dados do Responsável
                    </label>
                    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px;">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                            <div>
                                <div style="font-size: 11px; color: #94a3b8;">Nome</div>
                                <div style="font-weight: 600; color: #1e293b;">${this.escapeHtml(a.responsavelNome || '-')}</div>
                            </div>
                            <div>
                                <div style="font-size: 11px; color: #94a3b8;">CPF</div>
                                <div style="font-weight: 600; color: #1e293b;">${this.escapeHtml(a.responsavelCPF || '-')}</div>
                            </div>
                            <div>
                                <div style="font-size: 11px; color: #94a3b8;">Telefone</div>
                                <div style="font-weight: 600; color: #1e293b;">${this.escapeHtml(a.responsavelTelefone || '-')}</div>
                            </div>
                        </div>
                    </div>
                </div>
            ` : '';

            const modalHtml = `
                <div class="modal fade" id="modalVer2Chamada" tabindex="-1">
                    <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
                        <div class="modal-content" style="border-radius: 16px; border: none; overflow: hidden;">

                            <div class="modal-header" style="background: linear-gradient(135deg, #1e3c72, #2a5298); color: white; border: none; padding: 20px 25px;">
                                <h5 class="modal-title" style="display: flex; align-items: center; gap: 10px;">
                                    <i class="fas fa-file-signature"></i> Detalhes da 2ª Chamada
                                </h5>
                                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                            </div>

                            <div class="modal-body" style="padding: 25px; background: #f8fafc;">

                                <div style="display: flex; align-items: center; gap: 12px; padding: 14px; background: white; border-radius: 12px; border-left: 4px solid #1e3c72; margin-bottom: 20px;">
                                    <img src="${a.alunoFoto || this.gerarAvatarSVG(a.alunoNome)}"
                                         style="width: 56px; height: 56px; border-radius: 50%; object-fit: cover; border: 2px solid #e2e8f0;"
                                         alt="">
                                    <div style="flex: 1;">
                                        <h5 style="margin: 0; color: #1e3c72; font-weight: 700;">${this.escapeHtml(a.alunoNome || '-')}</h5>
                                        <p style="margin: 3px 0 0; font-size: 13px; color: #64748b;">
                                            <i class="fas fa-id-card"></i> ${this.escapeHtml(a.alunoMatricula || 'Sem matrícula')}
                                            • <i class="fas fa-graduation-cap"></i> ${this.escapeHtml(a.alunoTurma || '-')}
                                        </p>
                                    </div>
                                </div>

                                <div class="row g-3" style="margin-bottom: 8px;">
                                    <div class="col-md-6">
                                        <div style="background: white; border-radius: 10px; padding: 14px; border: 1px solid #e2e8f0;">
                                            <div style="font-size: 11px; color: #94a3b8; text-transform: uppercase; font-weight: 700;">Data do Registro</div>
                                            <div style="font-size: 15px; font-weight: 600; color: #1e293b;">${a.dataFormatada || '-'}</div>
                                        </div>
                                    </div>
                                    <div class="col-md-6">
                                        <div style="background: white; border-radius: 10px; padding: 14px; border: 1px solid #e2e8f0;">
                                            <div style="font-size: 11px; color: #94a3b8; text-transform: uppercase; font-weight: 700;">Registrado por</div>
                                            <div style="font-size: 15px; font-weight: 600; color: #1e293b;">${this.escapeHtml(a.registradoPorNome || a.registradoPor || '-')}</div>
                                        </div>
                                    </div>
                                    <div class="col-md-6">
                                        <div style="background: white; border-radius: 10px; padding: 14px; border: 1px solid #e2e8f0;">
                                            <div style="font-size: 11px; color: #94a3b8; text-transform: uppercase; font-weight: 700;">Período da Falta</div>
                                            <div style="font-size: 15px; font-weight: 600; color: #1e3c72;">${this.escapeHtml(a.periodoFaltaFormatado || '-')}</div>
                                        </div>
                                    </div>
                                    <div class="col-md-6">
                                        <div style="background: white; border-radius: 10px; padding: 14px; border: 1px solid #e2e8f0;">
                                            <div style="font-size: 11px; color: #94a3b8; text-transform: uppercase; font-weight: 700;">Motivo</div>
                                            <div style="font-size: 14px; font-weight: 600; color: #7c3aed;">${this.escapeHtml(a.motivoLabel || '-')}</div>
                                        </div>
                                    </div>
                                    <div class="col-md-6">
                                        <div style="background: white; border-radius: 10px; padding: 14px; border: 1px solid #e2e8f0;">
                                            <div style="font-size: 11px; color: #94a3b8; text-transform: uppercase; font-weight: 700;">Tipo de Prova Perdida</div>
                                            <div style="font-size: 15px; font-weight: 600; color: #d97706;">${this.escapeHtml(a.tipoProvaPerdidaFormatado || a.tipoProvaPerdida || '-')}</div>
                                        </div>
                                    </div>
                                    <div class="col-md-6">
                                        <div style="background: white; border-radius: 10px; padding: 14px; border: 1px solid #e2e8f0;">
                                            <div style="font-size: 11px; color: #94a3b8; text-transform: uppercase; font-weight: 700;">Período da Prova</div>
                                            <div style="font-size: 15px; font-weight: 600; color: #0284c7;">${this.escapeHtml(a.periodoProvaFormatado || a.periodoProva || '-')}</div>
                                        </div>
                                    </div>
                                </div>

                                ${a.observacoes ? `
                                    <div style="margin-top: 16px;">
                                        <label style="font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px; display: block; margin-bottom: 8px;">
                                            <i class="fas fa-comment"></i> Observações
                                        </label>
                                        <div style="background: white; border-radius: 10px; padding: 14px; border: 1px solid #e2e8f0; font-size: 13px; color: #475569; white-space: pre-line;">
                                            ${this.escapeHtml(a.observacoes)}
                                        </div>
                                    </div>
                                ` : ''}

                                ${responsavelHTML}
                                ${assinaturaHTML}

                            </div>

                            <div class="modal-footer" style="background: white; border-top: 1px solid #e2e8f0; padding: 15px 25px;">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal" style="border-radius: 8px;">
                                    <i class="fas fa-times"></i> Fechar
                                </button>
                                <button type="button" class="btn btn-primary" onclick="setorPedagogico.imprimirSegundaChamada('${a.id}')" style="border-radius: 8px;">
                                    <i class="fas fa-print"></i> Imprimir
                                </button>
                                <button type="button" class="btn btn-warning" onclick="bootstrap.Modal.getInstance(document.getElementById('modalVer2Chamada')).hide(); setTimeout(() => setorPedagogico.abrirEditarSegundaChamada('${a.id}'), 300);" style="border-radius: 8px;">
                                    <i class="fas fa-edit"></i> Editar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', modalHtml);
            new bootstrap.Modal(document.getElementById('modalVer2Chamada')).show();

        } catch (error) {
            console.error('Erro ao ver detalhes da 2ª Chamada:', error);
            this.showToast('Erro ao carregar os detalhes', 'error');
        }
    }

    renderizarPaginacao2Chamada() {
        const { paginaAtual, totalPaginas, totalRegistros } = this.paginacao2Chamada;

        if (totalPaginas <= 1) {
            return `<p class="text-muted text-end mt-2"><small>${totalRegistros} registro(s) encontrado(s)</small></p>`;
        }

        const maxBotoes = 5;
        let inicio = Math.max(1, paginaAtual - Math.floor(maxBotoes / 2));
        let fim = Math.min(totalPaginas, inicio + maxBotoes - 1);

        if (fim - inicio + 1 < maxBotoes) {
            inicio = Math.max(1, fim - maxBotoes + 1);
        }

        let botoes = '';

        if (paginaAtual > 1) {
            botoes += `
                <li class="page-item">
                    <a class="page-link" href="#" onclick="event.preventDefault(); setorPedagogico.carregarListaSegundaChamada(1)" title="Primeira página">
                        <i class="fas fa-angle-double-left"></i>
                    </a>
                </li>`;
        } else {
            botoes += `<li class="page-item disabled"><span class="page-link"><i class="fas fa-angle-double-left"></i></span></li>`;
        }

        if (paginaAtual > 1) {
            botoes += `
                <li class="page-item">
                    <a class="page-link" href="#" onclick="event.preventDefault(); setorPedagogico.carregarListaSegundaChamada(${paginaAtual - 1})" title="Página anterior">
                        <i class="fas fa-angle-left"></i>
                    </a>
                </li>`;
        } else {
            botoes += `<li class="page-item disabled"><span class="page-link"><i class="fas fa-angle-left"></i></span></li>`;
        }

        if (inicio > 1) {
            botoes += `<li class="page-item disabled"><span class="page-link">…</span></li>`;
        }

        for (let i = inicio; i <= fim; i++) {
            if (i === paginaAtual) {
                botoes += `<li class="page-item active"><span class="page-link">${i}</span></li>`;
            } else {
                botoes += `
                    <li class="page-item">
                        <a class="page-link" href="#" onclick="event.preventDefault(); setorPedagogico.carregarListaSegundaChamada(${i})">${i}</a>
                    </li>`;
            }
        }

        if (fim < totalPaginas) {
            botoes += `<li class="page-item disabled"><span class="page-link">…</span></li>`;
        }

        if (paginaAtual < totalPaginas) {
            botoes += `
                <li class="page-item">
                    <a class="page-link" href="#" onclick="event.preventDefault(); setorPedagogico.carregarListaSegundaChamada(${paginaAtual + 1})" title="Próxima página">
                        <i class="fas fa-angle-right"></i>
                    </a>
                </li>`;
        } else {
            botoes += `<li class="page-item disabled"><span class="page-link"><i class="fas fa-angle-right"></i></span></li>`;
        }

        if (paginaAtual < totalPaginas) {
            botoes += `
                <li class="page-item">
                    <a class="page-link" href="#" onclick="event.preventDefault(); setorPedagogico.carregarListaSegundaChamada(${totalPaginas})" title="Última página">
                        <i class="fas fa-angle-double-right"></i>
                    </a>
                </li>`;
        } else {
            botoes += `<li class="page-item disabled"><span class="page-link"><i class="fas fa-angle-double-right"></i></span></li>`;
        }

        const de = (paginaAtual - 1) * this.paginacao2Chamada.porPagina + 1;
        const ate = Math.min(paginaAtual * this.paginacao2Chamada.porPagina, totalRegistros);

        return `
            <div class="paginacao-2chamada" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-top: 16px; padding-top: 12px; border-top: 1px solid #e5e7eb;">
                <small class="text-muted">
                    Mostrando <strong>${de}</strong>–<strong>${ate}</strong> de <strong>${totalRegistros}</strong> registros
                </small>
                <nav aria-label="Paginação">
                    <ul class="pagination pagination-sm mb-0" style="gap: 2px;">
                        ${botoes}
                    </ul>
                </nav>
            </div>
        `;
    }

    // ============================================================================
    // SISTEMA DE SESSÃO DE ASSINATURA COM QR CODE
    // ============================================================================
    gerarUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    async toggleNecessitaAssinatura(modulo) {
        const P = this.getPrefixo(modulo);
        const check = document.getElementById(`${P}NecessitaAssinatura`);

        if (!check) return;

        if (check.checked) {
            const snapshot = this.montarSnapshotAtendimento(modulo);

            if (!snapshot.alunoId) {
                this.showToast('⚠️ Selecione um aluno antes de marcar a assinatura', 'warning');
                check.checked = false;
                return;
            }

            const sessaoId = this.gerarUUID();
            this.estadoSegundaChamada.sessaoAssinaturaId = sessaoId;
            this.estadoSegundaChamada.assinaturaCapturada = null;

            try {
                const response = await fetch('/api/sessoes-assinatura', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.token}`
                    },
                    body: JSON.stringify({
                        sessaoId,
                        tipo: 'segunda_chamada',
                        dadosAtendimento: snapshot
                    })
                });

                const data = await response.json();
                if (!data.success) throw new Error(data.error || 'Erro ao criar sessão');

                console.log('✅ Sessão criada:', sessaoId);

                const urlAssinatura = `${window.location.origin}/setor-pedagogico.html?assinatura=${sessaoId}`;

                try {
                    const qrResponse = await fetch('/api/qrcode/gerar', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${this.token}`
                        },
                        body: JSON.stringify({ url: urlAssinatura })
                    });
                    const qrData = await qrResponse.json();

                    if (qrData.success && qrData.qrCode) {
                        this.estadoSegundaChamada.qrCodeDataUrl = qrData.qrCode;
                    } else {
                        this.estadoSegundaChamada.qrCodeDataUrl =
                            `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(urlAssinatura)}`;
                    }
                } catch (e) {
                    console.warn('Erro ao gerar QR Code, usando fallback:', e);
                    this.estadoSegundaChamada.qrCodeDataUrl =
                        `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(urlAssinatura)}`;
                }

                this.abrirModalAssinatura(modulo, urlAssinatura);
                this.iniciarMonitoramentoSessao(modulo, sessaoId);

                this.showToast('📱 QR Code gerado! Peça para o responsável escanear.', 'info');

            } catch (e) {
                console.error('Erro ao criar sessão:', e);
                this.showToast('❌ Erro ao criar sessão de assinatura', 'error');
                check.checked = false;
                this.estadoSegundaChamada.sessaoAssinaturaId = null;
            }
        } else {
            const sessaoId = this.estadoSegundaChamada.sessaoAssinaturaId;
            if (sessaoId) {
                try {
                    await fetch(`/api/sessoes-assinatura/${sessaoId}`, {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${this.token}` }
                    });
                } catch (e) { console.warn(e); }
            }

            this.estadoSegundaChamada.sessaoAssinaturaId = null;
            this.estadoSegundaChamada.assinaturaCapturada = null;
            this.estadoSegundaChamada.qrCodeDataUrl = null;
            this.pararMonitoramentoSessao(modulo);
            this.fecharModalAssinatura();
        }
    }

    montarSnapshotAtendimento(modulo) {
        const est = this.estadoSegundaChamada;
        const aluno = est.currentAluno || {};

        const motivosLabel = {
            'problemas_pessoais': 'Problemas Pessoais',
            'problemas_saude': 'Problemas de Saúde',
            'viagem': 'Viagem',
            'outros': 'Outros'
        };

        const periodoIni = document.getElementById('segundaChamadaPeriodoFaltaInicio')?.value || '';
        const periodoFim = document.getElementById('segundaChamadaPeriodoFaltaFim')?.value || '';

        let periodoFormatado = '';
        if (periodoIni) {
            const ini = new Date(periodoIni + 'T12:00:00');
            const fim = periodoFim ? new Date(periodoFim + 'T12:00:00') : ini;
            const fmt = d => d.toLocaleDateString('pt-BR');
            periodoFormatado = ini.getTime() === fim.getTime() ? fmt(ini) : `${fmt(ini)} a ${fmt(fim)}`;
        }

        const tipoProva = document.getElementById('segundaChamadaTipoProvaPerdida')?.value || '';
        const tipoProvaOutros = document.getElementById('segundaChamadaTipoProvaOutros')?.value || '';
        const periodoProva = document.getElementById('segundaChamadaPeriodoProva')?.value || '';

        return {
            alunoId: aluno.id,
            alunoNome: aluno.nome,
            alunoMatricula: aluno.matricula,
            alunoTurma: aluno.turma,
            alunoCurso: aluno.curso,
            alunoFoto: aluno.fotoPerfil,
            motivo: est.motivoSelecionado,
            motivoLabel: motivosLabel[est.motivoSelecionado] || est.motivoSelecionado,
            periodoFaltaInicio: periodoIni || null,
            periodoFaltaFim: periodoFim || periodoIni || null,
            periodoFaltaFormatado: periodoFormatado,
            tipoProvaPerdida: tipoProva,
            tipoProvaPerdidaFormatado: tipoProva === 'Outros' && tipoProvaOutros
                ? `Outros (${tipoProvaOutros})`
                : tipoProva,
            periodoProva: periodoProva || null,
            responsavelNome: document.getElementById('segundaChamadaResponsavelNome')?.value || '',
            responsavelCPF: document.getElementById('segundaChamadaResponsavelCPF')?.value || '',
            observacoes: document.getElementById('segundaChamadaObservacoes')?.value || '',
            data: document.getElementById('segundaChamadaData')?.value || ''
        };
    }

    abrirModalAssinatura(modulo, urlAssinatura) {
        const antigo = document.getElementById('modalAssinaturaQR');
        if (antigo) antigo.remove();

        const qrUrl = this.estadoSegundaChamada.qrCodeDataUrl ||
            `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(urlAssinatura)}`;

        const modalHtml = `
            <div class="modal fade" id="modalAssinaturaQR" tabindex="-1" data-bs-backdrop="static" data-bs-keyboard="false">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content" style="border-radius: 20px; border: none; overflow: hidden;">
                        <div class="modal-header" style="background: linear-gradient(135deg, #1e3c72, #2a5298); color: white; border: none; padding: 20px 25px;">
                            <h5 class="modal-title" style="display: flex; align-items: center; gap: 10px;">
                                <i class="fas fa-signature"></i>
                                Aguardando Assinatura
                            </h5>
                            <button type="button" class="btn-close btn-close-white" onclick="setorPedagogico.fecharModalAssinatura()"></button>
                        </div>

                        <div class="modal-body" style="padding: 30px; text-align: center;">

                            <!-- ÁREA DO QR CODE -->
                            <div id="pedagogicoQrView">
                                <div id="modalAssinaturaStatus" style="margin-bottom: 20px;">
                                    <div style="background: #fef3c7; border-radius: 12px; padding: 14px; display: flex; align-items: center; gap: 12px; text-align: left;">
                                        <div style="width: 40px; height: 40px; border-radius: 50%; border: 4px solid #f59e0b; border-top-color: transparent; animation: spin 1s linear infinite; flex-shrink: 0;"></div>
                                        <div>
                                            <strong style="color: #92400e;">Aguardando assinatura...</strong>
                                            <p style="margin: 3px 0 0; font-size: 13px; color: #78350f;">
                                                Peça para o responsável escanear o QR Code abaixo
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div style="background: white; border: 2px solid #e2e8f0; border-radius: 16px; padding: 20px; display: inline-block;">
                                    <img src="${qrUrl}"
                                        alt="QR Code para assinatura"
                                        style="width: 260px; height: 260px; display: block;"
                                        id="qrCodeImage">
                                    <p style="margin: 12px 0 0; font-size: 13px; color: #64748b;">
                                        <i class="fas fa-mobile-alt"></i>
                                        Aponte a câmera do celular
                                    </p>
                                </div>

                                <div style="margin-top: 20px; padding: 14px; background: #f0f9ff; border-radius: 12px; font-size: 13px; color: #0369a1; text-align: left;">
                                    <div style="display: flex; gap: 8px; margin-bottom: 6px;">
                                        <i class="fas fa-info-circle"></i>
                                        <span><strong>O responsável assina direto no celular dele</strong>, sem sair da tela. Assim que ele confirmar, você verá aqui automaticamente.</span>
                                    </div>
                                    <div style="display: flex; gap: 8px;">
                                        <i class="fas fa-clock"></i>
                                        <span>Sessão válida por <strong>30 minutos</strong>.</span>
                                    </div>
                                </div>

                                <div style="margin-top: 16px;">
                                    <button onclick="setorPedagogico.copiarLinkAssinatura('${urlAssinatura}')"
                                            class="btn btn-sm btn-outline-secondary"
                                            style="border-radius: 10px; padding: 8px 16px; font-size: 13px;">
                                        <i class="fas fa-link"></i> Copiar link de assinatura
                                    </button>
                                </div>

                                <!-- LINK PARA ASSINAR AQUI -->
                                <div style="margin-top: 14px; padding-top: 14px; border-top: 1px dashed #cbd5e1;">
                                    <p style="margin: 0 0 8px; font-size: 12px; color: #64748b;">
                                        Não consegue escanear?
                                    </p>
                                    <button type="button"
                                            onclick="setorPedagogico.mostrarCanvasAssinaturaInline('${modulo}')"
                                            style="background: transparent; border: none; color: #2a5298; font-weight: 600; font-size: 14px; cursor: pointer; text-decoration: underline; padding: 6px 10px; border-radius: 8px;">
                                        <i class="fas fa-pen-fancy"></i> Assinar aqui mesmo
                                    </button>
                                </div>
                            </div>

                            <!-- ÁREA DO CANVAS INLINE -->
                            <div id="pedagogicoCanvasView" style="display: none;">
                                <div style="background: #f0f9ff; border-radius: 12px; padding: 14px; margin-bottom: 16px; text-align: left;">
                                    <div style="display: flex; gap: 8px;">
                                        <i class="fas fa-info-circle" style="color: #0369a1;"></i>
                                        <span style="font-size: 13px; color: #0369a1;">
                                            Peça para o responsável assinar no espaço abaixo com o dedo ou mouse.
                                        </span>
                                    </div>
                                </div>

                                <div id="pedagogicoModalCanvasWrapper"
                                     style="position: relative; background: white; border: 3px dashed #cbd5e0; border-radius: 16px; overflow: hidden; height: 260px; margin-bottom: 14px; touch-action: none;">
                                    <canvas id="pedagogicoModalCanvas" style="width: 100%; height: 100%; display: block;"></canvas>
                                    <div id="pedagogicoModalPlaceholder"
                                         style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: #94a3b8; pointer-events: none; width: 100%;">
                                        <i class="fas fa-pen-fancy" style="font-size: 28px; display: block; margin-bottom: 5px;"></i>
                                        <span style="font-size: 13px;">Assine aqui</span>
                                    </div>
                                </div>

                                <div style="display: flex; gap: 10px;">
                                    <button type="button"
                                            onclick="setorPedagogico.limparCanvasInline()"
                                            style="flex: 1; padding: 12px; background: #f1f5f9; color: #475569; border: none; border-radius: 10px; font-weight: 600; font-size: 14px; cursor: pointer;">
                                        <i class="fas fa-eraser"></i> Limpar
                                    </button>
                                    <button type="button"
                                            id="pedagogicoBtnConfirmarInline"
                                            onclick="setorPedagogico.salvarAssinaturaInline('${modulo}')"
                                            disabled
                                            style="flex: 2; padding: 12px; background: #cbd5e0; color: white; border: none; border-radius: 10px; font-weight: 600; font-size: 14px; cursor: not-allowed;">
                                        <i class="fas fa-check"></i> Confirmar Assinatura
                                    </button>
                                </div>

                                <div style="margin-top: 14px;">
                                    <button type="button"
                                            onclick="setorPedagogico.voltarParaQRCode()"
                                            style="background: transparent; border: none; color: #64748b; font-size: 13px; cursor: pointer; text-decoration: underline;">
                                        <i class="fas fa-arrow-left"></i> Voltar para o QR Code
                                    </button>
                                </div>
                            </div>

                        </div>

                        <div class="modal-footer" style="border-top: 1px solid #e5e7eb; padding: 15px 25px; justify-content: space-between;">
                            <button type="button" class="btn btn-outline-secondary" onclick="setorPedagogico.fecharModalAssinatura()" style="border-radius: 10px;">
                                <i class="fas fa-eye-slash"></i> Ocultar
                            </button>
                            <button type="button" class="btn btn-danger" onclick="setorPedagogico.cancelarSessaoAssinatura()" style="border-radius: 10px;">
                                <i class="fas fa-times"></i> Cancelar Assinatura
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <style>
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes fadeInCanvas { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
            </style>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        this.modalAssinaturaInstance = new bootstrap.Modal(document.getElementById('modalAssinaturaQR'));
        this.modalAssinaturaInstance.show();

        setTimeout(() => {
            const img = document.getElementById('qrCodeImage');
            if (img && window.innerWidth < 500) {
                img.style.width = '200px';
                img.style.height = '200px';
            }
        }, 200);
    }

    // ============================================================================
    // CANVAS INLINE - 2ª CHAMADA
    // ============================================================================
    mostrarCanvasAssinaturaInline(modulo) {
        const qrView = document.getElementById('pedagogicoQrView');
        const canvasView = document.getElementById('pedagogicoCanvasView');
        if (!qrView || !canvasView) return;

        qrView.style.display = 'none';
        canvasView.style.display = 'block';

        setTimeout(() => this.inicializarCanvasInlinePedagogico(), 50);
    }

    voltarParaQRCode() {
        const qrView = document.getElementById('pedagogicoQrView');
        const canvasView = document.getElementById('pedagogicoCanvasView');
        if (!qrView || !canvasView) return;

        canvasView.style.display = 'none';
        qrView.style.display = 'block';
    }

    inicializarCanvasInlinePedagogico() {
        const canvas = document.getElementById('pedagogicoModalCanvas');
        const wrapper = document.getElementById('pedagogicoModalCanvasWrapper');
        const placeholder = document.getElementById('pedagogicoModalPlaceholder');
        if (!canvas || !wrapper) return;

        if (!this._inlineCanvasPedagogico) {
            this._inlineCanvasPedagogico = {
                ctx: null, canvas: null, wrapper: null, placeholder: null,
                desenhando: false, temAssinatura: false, lastX: 0, lastY: 0, inicializado: false
            };
        }

        const state = this._inlineCanvasPedagogico;
        state.canvas = canvas;
        state.wrapper = wrapper;
        state.placeholder = placeholder;
        state.desenhando = false;
        state.temAssinatura = false;

        const rect = wrapper.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
            setTimeout(() => this.inicializarCanvasInlinePedagogico(), 100);
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
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#2a5298';
        state.ctx = ctx;

        const btn = document.getElementById('pedagogicoBtnConfirmarInline');
        if (btn) {
            btn.disabled = true;
            btn.style.background = '#cbd5e0';
            btn.style.cursor = 'not-allowed';
        }

        if (placeholder) placeholder.style.opacity = '1';
        if (wrapper) {
            wrapper.style.borderColor = '#cbd5e0';
            wrapper.style.borderStyle = 'dashed';
        }

        if (state.inicializado) return;
        state.inicializado = true;

        const getPos = (e) => {
            const rect = canvas.getBoundingClientRect();
            let cx, cy;
            if (e.touches?.length > 0) { cx = e.touches[0].clientX; cy = e.touches[0].clientY; }
            else if (e.changedTouches?.length > 0) { cx = e.changedTouches[0].clientX; cy = e.changedTouches[0].clientY; }
            else { cx = e.clientX; cy = e.clientY; }
            return { x: cx - rect.left, y: cy - rect.top };
        };

        const iniciar = (e) => {
            e.preventDefault();
            state.desenhando = true;
            state.temAssinatura = true;
            const p = getPos(e);
            state.lastX = p.x;
            state.lastY = p.y;
            if (wrapper) {
                wrapper.style.borderColor = '#2a5298';
                wrapper.style.borderStyle = 'solid';
            }
            if (placeholder) placeholder.style.opacity = '0';

            if (btn) {
                btn.disabled = false;
                btn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
                btn.style.cursor = 'pointer';
            }
        };

        const desenhar = (e) => {
            if (!state.desenhando) return;
            e.preventDefault();
            const p = getPos(e);
            state.ctx.beginPath();
            state.ctx.moveTo(state.lastX, state.lastY);
            state.ctx.lineTo(p.x, p.y);
            state.ctx.stroke();
            state.lastX = p.x;
            state.lastY = p.y;
        };

        const parar = (e) => {
            if (e?.preventDefault) e.preventDefault();
            state.desenhando = false;
        };

        canvas.addEventListener('touchstart', iniciar, { passive: false });
        canvas.addEventListener('touchmove', desenhar, { passive: false });
        canvas.addEventListener('touchend', parar, { passive: false });
        canvas.addEventListener('touchcancel', parar, { passive: false });
        canvas.addEventListener('mousedown', iniciar);
        canvas.addEventListener('mousemove', desenhar);
        canvas.addEventListener('mouseup', parar);
        canvas.addEventListener('mouseleave', () => { if (state.desenhando) parar(); });
    }

    limparCanvasInline() {
        const state = this._inlineCanvasPedagogico;
        if (!state || !state.canvas || !state.ctx) return;

        const rect = state.canvas.getBoundingClientRect();
        state.ctx.clearRect(0, 0, rect.width, rect.height);
        state.temAssinatura = false;

        if (state.placeholder) state.placeholder.style.opacity = '1';
        if (state.wrapper) {
            state.wrapper.style.borderColor = '#cbd5e0';
            state.wrapper.style.borderStyle = 'dashed';
        }

        const btn = document.getElementById('pedagogicoBtnConfirmarInline');
        if (btn) {
            btn.disabled = true;
            btn.style.background = '#cbd5e0';
            btn.style.cursor = 'not-allowed';
        }
    }

    async salvarAssinaturaInline(modulo) {
        const state = this._inlineCanvasPedagogico;
        if (!state || !state.temAssinatura || !state.canvas) {
            this.showToast('⚠️ Assine antes de confirmar', 'warning');
            return;
        }

        const sessaoId = this.estadoSegundaChamada.sessaoAssinaturaId;
        if (!sessaoId) {
            this.showToast('⚠️ Sessão não encontrada', 'error');
            return;
        }

        const btn = document.getElementById('pedagogicoBtnConfirmarInline');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
        }

        try {
            const base64 = state.canvas.toDataURL('image/png');

            const response = await fetch(`/api/sessoes-assinatura/${sessaoId}/assinar`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    assinaturaBase64: base64,
                    assinanteNome: 'Responsável'
                })
            });

            const data = await response.json();
            if (!data.success) throw new Error(data.error || 'Erro ao salvar');

            this.estadoSegundaChamada.assinaturaCapturada = base64;

            const canvasView = document.getElementById('pedagogicoCanvasView');
            if (canvasView) {
                const agora = new Date().toLocaleString('pt-BR');
                canvasView.innerHTML = `
                    <div style="animation: fadeInCanvas 0.3s ease;">
                        <div style="background: linear-gradient(135deg, #10b981, #059669); border-radius: 14px; padding: 16px 20px; margin-bottom: 16px; display: flex; align-items: center; gap: 14px; color: white; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.3);">
                            <div style="width: 44px; height: 44px; border-radius: 50%; background: rgba(255,255,255,0.25); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                <i class="fas fa-check" style="font-size: 22px;"></i>
                            </div>
                            <div style="flex: 1; text-align: left;">
                                <h4 style="margin: 0 0 2px; font-size: 16px; font-weight: 700;">Assinatura Registrada!</h4>
                                <p style="margin: 0; font-size: 13px; opacity: 0.95;">Confirmada em ${agora}</p>
                            </div>
                        </div>
                        <div style="text-align: left; margin-bottom: 10px;">
                            <span style="font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;"><i class="fas fa-signature"></i> Assinatura capturada</span>
                        </div>
                        <div style="position: relative; background: #f0fdf4; border: 3px solid #10b981; border-radius: 16px; overflow: hidden; height: 220px; display: flex; align-items: center; justify-content: center; padding: 12px; box-sizing: border-box; box-shadow: inset 0 2px 8px rgba(16, 185, 129, 0.08);">
                            <img src="${base64}" alt="Assinatura" style="max-width: 100%; max-height: 100%; object-fit: contain; display: block;">
                            <div style="position: absolute; top: 10px; right: 10px; background: #10b981; color: white; padding: 4px 10px; border-radius: 20px; font-size: 10px; font-weight: 700; display: flex; align-items: center; gap: 4px; box-shadow: 0 2px 8px rgba(16, 185, 129, 0.4);">
                                <i class="fas fa-lock" style="font-size: 9px;"></i> VERIFICADA
                            </div>
                        </div>
                        <div style="display: flex; gap: 10px; margin-top: 16px;">
                            <button type="button" onclick="setorPedagogico.refazerAssinatura('${modulo}')" style="flex: 1; padding: 12px; background: #fef3c7; color: #92400e; border: 2px solid #f59e0b; border-radius: 10px; font-weight: 600; font-size: 13px; cursor: pointer;">
                                <i class="fas fa-redo"></i> Refazer
                            </button>
                            <button type="button" onclick="setorPedagogico.fecharModalAssinatura()" style="flex: 2; padding: 12px; background: linear-gradient(135deg, #1e3c72, #2a5298); color: white; border: none; border-radius: 10px; font-weight: 600; font-size: 13px; cursor: pointer;">
                                <i class="fas fa-check-circle"></i> Concluir
                            </button>
                        </div>
                    </div>
                `;
            }

            this.pararMonitoramentoSessao(modulo);

            this.atualizarStatusAssinado(modulo, {
                assinaturaBase64: base64,
                assinadaPorNome: 'Responsável',
                assinadaEm: new Date().toISOString()
            });

            this.showToast('✅ Assinatura registrada com sucesso!', 'success');

        } catch (e) {
            console.error('Erro:', e);
            this.showToast('❌ ' + e.message, 'error');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-check"></i> Confirmar Assinatura';
            }
        }
    }

    fecharModalAssinatura() {
        if (this.modalAssinaturaInstance) {
            this.modalAssinaturaInstance.hide();
        }
        const modalEl = document.getElementById('modalAssinaturaQR');
        if (modalEl) setTimeout(() => modalEl.remove(), 300);

        // Se já foi assinado, mostra o bloco verde. Senão, o amarelo.
        if (this.estadoSegundaChamada?.assinaturaCapturada) {
            this.atualizarStatusAssinado('segundaChamada', {
                assinaturaBase64: this.estadoSegundaChamada.assinaturaCapturada,
                assinadaPorNome: 'Responsável',
                assinadaEm: new Date().toISOString()
            });
        } else {
            this.mostrarBlocoCompactoAssinatura();
        }
    }

    mostrarBlocoCompactoAssinatura() {
        const P = 'segundaChamada';
        let bloco = document.getElementById(`${P}BlocoAssinaturaInfo`);

        if (!bloco) {
            bloco = document.createElement('div');
            bloco.id = `${P}BlocoAssinaturaInfo`;
            const check = document.getElementById(`${P}NecessitaAssinatura`);
            if (check) {
                check.parentElement.insertAdjacentElement('afterend', bloco);
            }
        }

        bloco.style.display = 'block';
        bloco.innerHTML = `
            <div class="alert alert-warning" style="font-size: 13px; border-radius: 10px; border-left: 4px solid #f59e0b; margin-top: 10px;">
                <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                    <i class="fas fa-clock"></i>
                    <div style="flex: 1;">
                        <strong>Aguardando assinatura...</strong>
                        <p style="margin: 3px 0 0; font-size: 12px;">O responsável precisa escanear o QR Code</p>
                    </div>
                    <button type="button" class="btn btn-sm btn-warning"
                            onclick="setorPedagogico.reabrirModalAssinatura('segundaChamada')"
                            style="border-radius: 8px;">
                        <i class="fas fa-qrcode"></i> Mostrar QR
                    </button>
                </div>
            </div>
        `;
    }

    reabrirModalAssinatura(modulo) {
        const sessaoId = this.estadoSegundaChamada.sessaoAssinaturaId;
        if (!sessaoId) {
            this.showToast('⚠️ Nenhuma sessão ativa', 'warning');
            return;
        }
        const urlAssinatura = `${window.location.origin}/setor-pedagogico.html?assinatura=${sessaoId}`;
        this.abrirModalAssinatura(modulo, urlAssinatura);
    }

    async copiarLinkAssinatura(url) {
        try {
            await navigator.clipboard.writeText(url);
            this.showToast('✅ Link copiado!', 'success');
        } catch (e) {
            const textarea = document.createElement('textarea');
            textarea.value = url;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            this.showToast('✅ Link copiado!', 'success');
        }
    }

    iniciarMonitoramentoSessao(modulo, sessaoId) {
        this.pararMonitoramentoSessao(modulo);

        console.log('👀 Monitorando sessão:', sessaoId);

        const intervalId = setInterval(async () => {
            try {
                const response = await fetch(`/api/sessoes-assinatura/${sessaoId}`, {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });

                if (!response.ok) {
                    if (response.status === 404) {
                        console.warn('Sessão expirou ou foi removida');
                        this.pararMonitoramentoSessao(modulo);
                    }
                    return;
                }

                const data = await response.json();
                if (!data.success) return;

                if (data.sessao.status === 'assinado') {
                    console.log('✅ Assinatura capturada!');

                    this.estadoSegundaChamada.assinaturaCapturada = data.sessao.assinaturaBase64;
                    this.atualizarStatusAssinado(modulo, data.sessao);
                    this.pararMonitoramentoSessao(modulo);

                    if (this.modalAssinaturaInstance) {
                        this.modalAssinaturaInstance.hide();
                    }
                    const modalEl = document.getElementById('modalAssinaturaQR');
                    if (modalEl) setTimeout(() => modalEl.remove(), 300);

                    this.showToast(`✅ Assinatura capturada por ${data.sessao.assinadaPorNome}!`, 'success');

                } else if (data.sessao.status === 'cancelado') {
                    console.log('Sessão cancelada');
                    this.pararMonitoramentoSessao(modulo);
                }
            } catch (e) {
                console.warn('Erro no monitoramento:', e);
            }
        }, 3000);

        this.estadoSegundaChamada.monitoramentoInterval = intervalId;
    }

    pararMonitoramentoSessao(modulo) {
        const id = this.estadoSegundaChamada?.monitoramentoInterval;
        if (id) {
            clearInterval(id);
            this.estadoSegundaChamada.monitoramentoInterval = null;
        }
    }

    atualizarStatusAssinado(modulo, sessao) {
        const P = 'segundaChamada';
        let bloco = document.getElementById(`${P}BlocoAssinaturaInfo`);

        if (!bloco) {
            bloco = document.createElement('div');
            bloco.id = `${P}BlocoAssinaturaInfo`;
            const check = document.getElementById(`${P}NecessitaAssinatura`);
            if (check) {
                check.parentElement.insertAdjacentElement('afterend', bloco);
            }
        }

        bloco.style.display = 'block';
        bloco.innerHTML = `
            <div style="margin-top: 10px; background: #f0fdf4; border: 2px solid #10b981; border-radius: 12px; padding: 14px;">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                    <i class="fas fa-check-circle" style="color: #10b981; font-size: 22px;"></i>
                    <div style="flex: 1;">
                        <strong style="color: #065f46;">✓ Assinatura capturada!</strong>
                        <p style="margin: 3px 0 0; font-size: 12px; color: #047857;">
                            Assinado por <strong>${this.escapeHtml(sessao.assinadaPorNome || '')}</strong>
                            ${sessao.assinadaEm ? ` em ${new Date(sessao.assinadaEm).toLocaleString('pt-BR')}` : ''}
                        </p>
                    </div>
                </div>
                <div style="background: white; border-radius: 8px; padding: 8px; text-align: center;">
                    <img src="${sessao.assinaturaBase64}"
                        style="max-width: 100%; max-height: 100px;"
                        alt="Assinatura">
                </div>
                <button type="button"
                        onclick="setorPedagogico.refazerAssinatura('segundaChamada')"
                        class="btn btn-sm btn-outline-danger w-100 mt-2"
                        style="border-radius: 8px;">
                    <i class="fas fa-redo"></i> Refazer Assinatura
                </button>
            </div>
        `;

        // 🆕 Assinatura mudou → salva rascunho
        this.agendarSalvarRascunho2Chamada();
    }

    async cancelarSessaoAssinatura() {
        const confirmar = await this.confirmarAcao('Cancelar a assinatura? O responsável não poderá mais assinar este atendimento.');
        if (!confirmar) return;

        const sessaoId = this.estadoSegundaChamada.sessaoAssinaturaId;
        if (sessaoId) {
            try {
                await fetch(`/api/sessoes-assinatura/${sessaoId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
            } catch (e) { console.warn(e); }
        }

        this.pararMonitoramentoSessao('segundaChamada');
        this.fecharModalAssinatura();

        this.estadoSegundaChamada.sessaoAssinaturaId = null;
        this.estadoSegundaChamada.assinaturaCapturada = null;
        this.estadoSegundaChamada.qrCodeDataUrl = null;

        const check = document.getElementById('segundaChamadaNecessitaAssinatura');
        if (check) check.checked = false;

        const bloco = document.getElementById('segundaChamadaBlocoAssinaturaInfo');
        if (bloco) bloco.style.display = 'none';

        this.agendarSalvarRascunho2Chamada(); // 🆕

        this.showToast('Sessão cancelada', 'info');
    }

    async refazerAssinatura(modulo) {
        const confirmar = await this.confirmarAcao('Refazer a assinatura? A atual será descartada.');
        if (!confirmar) return;

        const sessaoId = this.estadoSegundaChamada.sessaoAssinaturaId;
        if (sessaoId) {
            try {
                await fetch(`/api/sessoes-assinatura/${sessaoId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
            } catch (e) { console.warn(e); }
        }

        this.pararMonitoramentoSessao(modulo);
        this.estadoSegundaChamada.sessaoAssinaturaId = null;
        this.estadoSegundaChamada.assinaturaCapturada = null;
        this.estadoSegundaChamada.qrCodeDataUrl = null;

        const bloco = document.getElementById('segundaChamadaBlocoAssinaturaInfo');
        if (bloco) bloco.style.display = 'none';

        const check = document.getElementById('segundaChamadaNecessitaAssinatura');
        if (check) {
            check.checked = false;
            check.checked = true;
            await this.toggleNecessitaAssinatura(modulo);
        }
    }

    verificarModoAssinatura() {
        const params = new URLSearchParams(window.location.search);
        const sessaoId = params.get('assinatura');

        if (!sessaoId) return false;

        console.log('📱 Modo assinatura detectado:', sessaoId);
        this.mostrarTelaAssinatura(sessaoId);
        return true;
    }

    async mostrarTelaAssinatura(sessaoId) {
        document.querySelectorAll('.sidebar, .mobile-menu-btn, .page-header, #bottomNavSp, .sidebar-overlay-sp').forEach(el => {
            if (el) el.style.display = 'none';
        });

        const content = document.getElementById('content');
        if (!content) return;

        content.innerHTML = `
            <div style="min-height: 100vh; background: #f0f4f8; padding: 20px; display: flex; flex-direction: column; align-items: center;">
                <div style="max-width: 600px; width: 100%;">
                    <div style="background: linear-gradient(135deg, #1e3c72, #2a5298); color: white; padding: 18px 24px; border-radius: 16px 16px 0 0; text-align: center;">
                        <h1 style="font-size: 20px; margin: 0; display: flex; align-items: center; justify-content: center; gap: 10px;">
                            <i class="fas fa-signature"></i> Assinatura Digital
                        </h1>
                    </div>

                    <div id="telaAssinaturaInfo" style="background: white; padding: 20px; border-left: 4px solid #1e3c72;">
                        <div style="text-align: center; padding: 40px;">
                            <div style="width: 40px; height: 40px; border: 4px solid #e2e8f0; border-top-color: #1e3c72; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 15px;"></div>
                            <p style="color: #64748b; margin: 0;">Carregando atendimento...</p>
                        </div>
                    </div>

                    <div id="telaAssinaturaArea" style="background: white; padding: 20px; display: none; border-radius: 0 0 16px 16px;">
                        <div id="canvasWrapper" style="position: relative; background: white; border: 3px dashed #cbd5e0; border-radius: 16px; overflow: hidden; height: 300px; margin-bottom: 16px;">
                            <canvas id="canvasAssinatura" style="width: 100%; height: 100%; display: block; touch-action: none;"></canvas>
                            <div id="placeholder" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: #94a3b8; pointer-events: none;">
                                <i class="fas fa-pen-fancy" style="font-size: 48px; display: block; margin-bottom: 10px;"></i>
                                <span style="font-size: 15px;">Assine aqui com o dedo</span>
                            </div>
                        </div>

                        <div style="display: flex; gap: 12px;">
                            <button onclick="setorPedagogico.limparAssinaturaTela()"
                                    style="flex: 1; padding: 16px; background: #f1f5f9; color: #475569; border: none; border-radius: 12px; font-weight: 600; font-size: 15px;">
                                <i class="fas fa-eraser"></i> Limpar
                            </button>
                            <button id="btnSalvarAssinatura" onclick="setorPedagogico.salvarAssinaturaTela()" disabled
                                    style="flex: 2; padding: 16px; background: #cbd5e0; color: white; border: none; border-radius: 12px; font-weight: 600; font-size: 15px; cursor: not-allowed;">
                                <i class="fas fa-check"></i> Confirmar Assinatura
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <style>
                @keyframes spin { to { transform: rotate(360deg); } }
            </style>
        `;

        try {
            // Rota pública: sem header Authorization
            const response = await fetch(`/api/sessoes-assinatura/${sessaoId}`);
            const data = await response.json();

            if (!data.success) {
                document.getElementById('telaAssinaturaInfo').innerHTML = `
                    <div style="text-align: center; padding: 40px 20px;">
                        <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #ef4444; margin-bottom: 15px; display: block;"></i>
                        <h3 style="color: #ef4444; margin: 0 0 10px;">Sessão inválida ou expirada</h3>
                        <p style="color: #64748b; margin: 0;">Esta sessão de assinatura não existe mais ou expirou (30 min).</p>
                        <button onclick="window.location.href='/setor-pedagogico.html'"
                                style="margin-top: 20px; padding: 12px 24px; background: #1e3c72; color: white; border: none; border-radius: 10px; font-weight: 600; cursor: pointer;">
                            <i class="fas fa-arrow-left"></i> Voltar
                        </button>
                    </div>
                `;
                return;
            }

            if (data.sessao.status === 'assinado') {
                document.getElementById('telaAssinaturaInfo').innerHTML = `
                    <div style="text-align: center; padding: 40px 20px;">
                        <i class="fas fa-check-circle" style="font-size: 48px; color: #10b981; margin-bottom: 15px; display: block;"></i>
                        <h3 style="color: #10b981; margin: 0 0 10px;">Esta sessão já foi assinada</h3>
                        <p style="color: #64748b; margin: 0;">Assinada por ${this.escapeHtml(data.sessao.assinadaPorNome || '')}</p>
                        <button onclick="window.location.href='/setor-pedagogico.html'"
                                style="margin-top: 20px; padding: 12px 24px; background: #1e3c72; color: white; border: none; border-radius: 10px; font-weight: 600; cursor: pointer;">
                            <i class="fas fa-arrow-left"></i> Voltar
                        </button>
                    </div>
                `;
                return;
            }

            const d = data.sessao.dadosAtendimento || {};

            const tipoLabel = {
                'autorizacao': 'Autorização',
                'justificativa': 'Justificativa',
                'segunda_chamada': '2ª Chamada',
                'protocolo_prova': 'Protocolo de Provas'
            }[data.sessao.tipo] || data.sessao.tipo;

            let infoHtml = '';

            if (data.sessao.tipo === 'protocolo_prova') {
                infoHtml = `
                    <div style="margin-top: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                        <div style="grid-column: 1 / -1;">
                            <span style="font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 700; display: block; margin-bottom: 3px;">Professor</span>
                            <span style="font-size: 15px; color: #1e293b; font-weight: 600;">${this.escapeHtml(d.professorNome || '-')}</span>
                        </div>
                        <div>
                            <span style="font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 700; display: block; margin-bottom: 3px;">Data</span>
                            <span style="font-size: 14px; color: #1e293b; font-weight: 500;">${this.escapeHtml(d.dataFormatada || '-')}</span>
                        </div>
                        <div>
                            <span style="font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 700; display: block; margin-bottom: 3px;">Tipo / Período</span>
                            <span style="font-size: 14px; color: #1e293b; font-weight: 500;">${this.escapeHtml(d.tipoProvaLabel || '-')} • ${this.escapeHtml(d.periodoFormatado || '-')}</span>
                        </div>
                        <div style="grid-column: 1 / -1;">
                            <span style="font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 700; display: block; margin-bottom: 3px;">Turmas / Quantidade</span>
                            <span style="font-size: 14px; color: #1e293b; font-weight: 500;">
                                ${(d.turmas || []).map(t => `Turma ${t.turma} (${t.quantidadeProvas} provas)`).join(', ')}
                            </span>
                        </div>
                    </div>
                `;
            } else {
                infoHtml = `
                    <div style="margin-top: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                        <div>
                            <span style="font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 700; display: block; margin-bottom: 3px;">Aluno</span>
                            <span style="font-size: 14px; color: #1e293b; font-weight: 500;">${this.escapeHtml(d.alunoNome || '-')}</span>
                        </div>
                        <div>
                            <span style="font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 700; display: block; margin-bottom: 3px;">Turma</span>
                            <span style="font-size: 14px; color: #1e293b; font-weight: 500;">${this.escapeHtml(d.alunoTurma || '-')}</span>
                        </div>
                        <div>
                            <span style="font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 700; display: block; margin-bottom: 3px;">Motivo</span>
                            <span style="font-size: 14px; color: #1e293b; font-weight: 500;">${this.escapeHtml(d.motivoLabel || '-')}</span>
                        </div>
                        ${d.periodoFaltaFormatado ? `
                            <div>
                                <span style="font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 700; display: block; margin-bottom: 3px;">Período da Falta</span>
                                <span style="font-size: 14px; color: #1e293b; font-weight: 500;">${this.escapeHtml(d.periodoFaltaFormatado)}</span>
                            </div>
                        ` : ''}
                        ${d.tipoProvaPerdidaFormatado ? `
                            <div>
                                <span style="font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 700; display: block; margin-bottom: 3px;">Tipo de Prova</span>
                                <span style="font-size: 14px; color: #1e293b; font-weight: 500;">${this.escapeHtml(d.tipoProvaPerdidaFormatado)}</span>
                            </div>
                        ` : ''}
                        ${d.periodoProva ? `
                            <div>
                                <span style="font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 700; display: block; margin-bottom: 3px;">Período da Prova</span>
                                <span style="font-size: 14px; color: #1e293b; font-weight: 500;">${this.escapeHtml(d.periodoProva)}</span>
                            </div>
                        ` : ''}
                        ${d.responsavelNome ? `
                            <div style="grid-column: 1 / -1;">
                                <span style="font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 700; display: block; margin-bottom: 3px;">Responsável</span>
                                <span style="font-size: 14px; color: #1e293b; font-weight: 500;">${this.escapeHtml(d.responsavelNome)}</span>
                            </div>
                        ` : ''}
                    </div>
                `;
            }

            document.getElementById('telaAssinaturaInfo').innerHTML = `
                <div style="border-left: 4px solid #1e3c72; padding-left: 14px;">
                    <h2 style="margin: 0 0 4px; font-size: 18px; color: #1e3c72;">${tipoLabel}</h2>
                    <p style="margin: 0; color: #64748b; font-size: 13px;">Confirme os dados e assine abaixo</p>
                </div>
                ${infoHtml}
            `;

            document.getElementById('telaAssinaturaArea').style.display = 'block';

            this.sessaoAssinaturaModo = sessaoId;
            this.sessaoAssinaturaAtual = data.sessao;

            this.inicializarCanvasTela();

        } catch (e) {
            console.error('Erro ao carregar sessão:', e);
            document.getElementById('telaAssinaturaInfo').innerHTML = `
                <div style="text-align: center; padding: 40px 20px;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #ef4444; margin-bottom: 15px; display: block;"></i>
                    <h3 style="color: #ef4444; margin: 0 0 10px;">Erro ao carregar</h3>
                    <p style="color: #64748b; margin: 0;">${e.message}</p>
                </div>
            `;
        }
    }

    inicializarCanvasTela() {
        const canvas = document.getElementById('canvasAssinatura');
        const wrapper = document.getElementById('canvasWrapper');
        const placeholder = document.getElementById('placeholder');
        if (!canvas || !wrapper) return;

        this.telaCanvas = canvas;
        this.telaWrapper = wrapper;
        this.telaPlaceholder = placeholder;
        this.telaTemAssinatura = false;
        this.telaDesenhando = false;

        const ajustar = () => {
            const rect = wrapper.getBoundingClientRect();
            if (rect.width === 0) { setTimeout(ajustar, 200); return; }
            const dpr = window.devicePixelRatio || 1;
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            canvas.style.width = rect.width + 'px';
            canvas.style.height = rect.height + 'px';
            const ctx = canvas.getContext('2d');
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.scale(dpr, dpr);
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.strokeStyle = '#1e3c72';
            this.telaCtx = ctx;
        };
        ajustar();

        const getPos = (e) => {
            const rect = canvas.getBoundingClientRect();
            let cx, cy;
            if (e.touches?.length > 0) { cx = e.touches[0].clientX; cy = e.touches[0].clientY; }
            else if (e.changedTouches?.length > 0) { cx = e.changedTouches[0].clientX; cy = e.changedTouches[0].clientY; }
            else { cx = e.clientX; cy = e.clientY; }
            return { x: cx - rect.left, y: cy - rect.top };
        };

        const iniciar = (e) => {
            e.preventDefault();
            this.telaDesenhando = true;
            this.telaTemAssinatura = true;
            const p = getPos(e);
            this.telaLastX = p.x;
            this.telaLastY = p.y;
            wrapper.style.borderColor = '#1e3c72';
            wrapper.style.borderStyle = 'solid';
            placeholder.style.opacity = '0';

            const btn = document.getElementById('btnSalvarAssinatura');
            if (btn) {
                btn.disabled = false;
                btn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
                btn.style.cursor = 'pointer';
            }
        };

        const desenhar = (e) => {
            if (!this.telaDesenhando) return;
            e.preventDefault();
            const p = getPos(e);
            this.telaCtx.beginPath();
            this.telaCtx.moveTo(this.telaLastX, this.telaLastY);
            this.telaCtx.lineTo(p.x, p.y);
            this.telaCtx.stroke();
            this.telaLastX = p.x;
            this.telaLastY = p.y;
        };

        const parar = (e) => {
            if (e?.preventDefault) e.preventDefault();
            this.telaDesenhando = false;
        };

        canvas.addEventListener('touchstart', iniciar, { passive: false });
        canvas.addEventListener('touchmove', desenhar, { passive: false });
        canvas.addEventListener('touchend', parar, { passive: false });
        canvas.addEventListener('touchcancel', parar, { passive: false });
        canvas.addEventListener('mousedown', iniciar);
        canvas.addEventListener('mousemove', desenhar);
        canvas.addEventListener('mouseup', parar);
        canvas.addEventListener('mouseleave', () => { if (this.telaDesenhando) parar(); });
    }

    limparAssinaturaTela() {
        if (!this.telaCtx || !this.telaCanvas) return;
        const rect = this.telaCanvas.getBoundingClientRect();
        this.telaCtx.clearRect(0, 0, rect.width, rect.height);
        this.telaTemAssinatura = false;
        if (this.telaPlaceholder) this.telaPlaceholder.style.opacity = '1';
        if (this.telaWrapper) {
            this.telaWrapper.style.borderColor = '#cbd5e0';
            this.telaWrapper.style.borderStyle = 'dashed';
        }
        const btn = document.getElementById('btnSalvarAssinatura');
        if (btn) {
            btn.disabled = true;
            btn.style.background = '#cbd5e0';
            btn.style.cursor = 'not-allowed';
        }
    }

    async salvarAssinaturaTela() {
        if (!this.telaTemAssinatura || !this.sessaoAssinaturaModo) return;

        const btn = document.getElementById('btnSalvarAssinatura');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
        }

        try {
            const base64 = this.telaCanvas.toDataURL('image/png');

            const response = await fetch(`/api/sessoes-assinatura/${this.sessaoAssinaturaModo}/assinar`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ assinaturaBase64: base64 })
            });

            const data = await response.json();
            if (!data.success) throw new Error(data.error || 'Erro ao salvar');

            document.getElementById('telaAssinaturaInfo').innerHTML = `
                <div style="text-align: center; padding: 60px 20px;">
                    <i class="fas fa-check-circle" style="font-size: 64px; color: #10b981; margin-bottom: 20px; display: block;"></i>
                    <h2 style="color: #10b981; margin: 0 0 10px; font-size: 22px;">Assinatura Confirmada!</h2>
                    <p style="color: #64748b; margin: 0; font-size: 15px;">
                        A assinatura foi registrada com sucesso.<br>
                        Você já pode fechar esta janela.
                    </p>
                    <button onclick="window.close()"
                            style="margin-top: 25px; padding: 14px 28px; background: #1e3c72; color: white; border: none; border-radius: 10px; font-weight: 600; cursor: pointer; font-size: 15px;">
                        <i class="fas fa-times"></i> Fechar
                    </button>
                </div>
            `;
            document.getElementById('telaAssinaturaArea').style.display = 'none';

        } catch (e) {
            console.error('Erro ao salvar assinatura:', e);
            this.showToast('❌ ' + e.message, 'error');

            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-check"></i> Confirmar Assinatura';
            }
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
                    try { this.charts2Chamada.motivos.destroy(); } catch (e) {}
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
                    try { this.charts2Chamada.atrasos.destroy(); } catch (e) {}
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
                    try { this.charts2Chamada.turmas.destroy(); } catch (e) {}
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

        const btnCSV = document.getElementById('btnExportarCSVSegundaChamada');
        const btnPDF = document.getElementById('btnExportarPDFSegundaChamada');
        if (btnCSV) btnCSV.disabled = true;
        if (btnPDF) btnPDF.disabled = true;
        this.relatorio2Chamada = null;

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
        const tipoProvaPerdida = document.getElementById('SegundaChamadaFiltroTipoProva')?.value || '';

        const filtroPor = document.getElementById('SegundaChamadaFiltroPorData')?.value || 'falta';
        const filtrarPorPeriodoFalta = filtroPor === 'falta' ? 'true' : 'false';

        let url = '';
        if (tipo === 'geral') {
            url = `/api/gestao-geral/autorizacao/relatorio/geral?tipo=segunda_chamada&`;
            if (dataInicio) url += `dataInicio=${dataInicio}&`;
            if (dataFim) url += `dataFim=${dataFim}&`;
            if (tipoProvaPerdida && tipoProvaPerdida !== 'todos') url += `tipoProvaPerdida=${encodeURIComponent(tipoProvaPerdida)}&`;
            url += `filtrarPorPeriodoFalta=${filtrarPorPeriodoFalta}&`;
        } else if (tipo === 'turma') {
            const turma = document.getElementById('SegundaChamadaFiltroTurma')?.value;
            if (!turma) { this.mostrarNotificacao('Selecione uma turma', 'error'); return; }
            url = `/api/gestao-geral/autorizacao/relatorio/turma/${encodeURIComponent(turma)}?tipo=segunda_chamada&`;
            if (dataInicio) url += `dataInicio=${dataInicio}&`;
            if (dataFim) url += `dataFim=${dataFim}&`;
            if (tipoProvaPerdida && tipoProvaPerdida !== 'todos') url += `tipoProvaPerdida=${encodeURIComponent(tipoProvaPerdida)}&`;
            url += `filtrarPorPeriodoFalta=${filtrarPorPeriodoFalta}&`;
        } else if (tipo === 'aluno') {
            const alunoId = document.getElementById('SegundaChamadaFiltroAluno')?.value;
            if (!alunoId) { this.mostrarNotificacao('Selecione um aluno', 'error'); return; }
            url = `/api/gestao-geral/autorizacao/relatorio/aluno/${alunoId}?tipo=segunda_chamada&`;
            if (dataInicio) url += `dataInicio=${dataInicio}&`;
            if (dataFim) url += `dataFim=${dataFim}&`;
            if (tipoProvaPerdida && tipoProvaPerdida !== 'todos') url += `tipoProvaPerdida=${encodeURIComponent(tipoProvaPerdida)}&`;
            url += `filtrarPorPeriodoFalta=${filtrarPorPeriodoFalta}&`;
        }

        console.log('🔍 URL do relatório:', url);

        try {
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const data = await response.json();
            if (data.success) {
                this.relatorio2Chamada = data;
                this.exibirRelatorioSegundaChamada(data, tipo);

                const btnCSV = document.getElementById('btnExportarCSVSegundaChamada');
                const btnPDF = document.getElementById('btnExportarPDFSegundaChamada');
                if (btnCSV) btnCSV.disabled = false;
                if (btnPDF) btnPDF.disabled = false;

                const total = data.totalRegistros || data.estatisticas?.totalRegistros || 0;
                if (total === 0) {
                    this.mostrarNotificacao('⚠️ Nenhum registro encontrado. Verifique as datas e filtros.', 'warning');
                }
            } else {
                alert('Erro ao carregar relatório: ' + (data.error || ''));
            }
        } catch (error) {
            console.error('Erro:', error);
            this.mostrarNotificacao('Erro ao carregar relatório', 'error');
        }
    }

    exportarPDF2Chamada() {
        const data = this.relatorio2Chamada;
        if (!data) {
            this.mostrarNotificacao('⚠️ Gere um relatório primeiro. Clique em BUSCAR.', 'error');
            return;
        }

        const html = this.gerarHTMLRelatorio2Chamada(data);

        const win = window.open('', '_blank');
        win.document.write(html);
        win.document.close();
        win.onload = () => setTimeout(() => win.print(), 500);
    }

    gerarHTMLRelatorio2Chamada(data) {
        const tipo = data.aluno ? 'aluno' : (data.turma ? 'turma' : 'geral');
        const logoIema = '/uploads/logo-iema.png';
        const carimbo = '/icons/assinatura_gpeda.ico';
        const dataGeracao = new Date().toLocaleString('pt-BR');

        let assinaturaDigital = null;
        if (tipo === 'aluno' && Array.isArray(data.registros)) {
            const comAssinatura = data.registros.find(a => a.assinaturaBase64);
            if (comAssinatura) assinaturaDigital = comAssinatura.assinaturaBase64;
        }
        if (!assinaturaDigital) {
            const lista = data.registros || [];
            const comAssinatura = lista.find(a => a.assinaturaBase64);
            if (comAssinatura) assinaturaDigital = comAssinatura.assinaturaBase64;
        }

        let titulo = 'RELATÓRIO DE 2ª CHAMADA';
        let subtitulo = '';
        if (tipo === 'turma') {
            subtitulo = `Turma: ${data.turma || ''}`;
        } else if (tipo === 'aluno') {
            subtitulo = `${data.aluno?.nome || ''} — ${data.aluno?.turma || ''}`;
        } else {
            subtitulo = 'Relatório Geral';
        }

        let statsHTML = '';
        if (tipo === 'geral') {
            statsHTML = `
                <table class="stats-table">
                    <tr>
                        <td><strong>${data.totalRegistros || 0}</strong><br><span>Total</span></td>
                        <td><strong>${(data.porMotivo || []).length}</strong><br><span>Motivos</span></td>
                        <td><strong>${(data.porTurma || []).length}</strong><br><span>Turmas</span></td>
                    </tr>
                </table>`;
        } else if (tipo === 'turma') {
            statsHTML = `
                <table class="stats-table">
                    <tr>
                        <td><strong>${data.estatisticas?.totalRegistros || 0}</strong><br><span>Total</span></td>
                        <td><strong>${data.estatisticas?.totalAlunos || (data.porAluno || []).length}</strong><br><span>Alunos</span></td>
                    </tr>
                </table>`;
        } else {
            statsHTML = `
                <table class="stats-table">
                    <tr>
                        <td><strong>${data.estatisticas?.totalRegistros || 0}</strong><br><span>Total</span></td>
                        <td><strong>${(data.porMotivo || []).length}</strong><br><span>Motivos</span></td>
                    </tr>
                </table>`;
        }

        let tabelaHTML = '';

        if (tipo === 'geral') {
            const porMotivo = Array.isArray(data.porMotivo) ? data.porMotivo : [];
            const porTurma = Array.isArray(data.porTurma) ? data.porTurma : [];
            const registros = Array.isArray(data.registros) ? data.registros : [];

            tabelaHTML = `
                <div class="section-title">DISTRIBUIÇÃO POR MOTIVO</div>
                <table>
                    <thead><tr><th>Motivo</th><th style="width:80px;text-align:center;">Qtd</th></tr></thead>
                    <tbody>
                        ${porMotivo.map(m => `
                            <tr>
                                <td>${this.escapeHtml(m.label || '')}</td>
                                <td style="text-align:center;">${m.count || 0}</td>
                            </tr>`).join('') || '<tr><td colspan="2" style="text-align:center;">Nenhum dado</td></tr>'}
                    </tbody>
                </table>

                ${(data.porTipoProva || []).length > 0 ? `
                    <div class="section-title">DISTRIBUIÇÃO POR TIPO DE PROVA PERDIDA</div>
                    <table>
                        <thead><tr><th>Tipo de Prova</th><th style="width:80px;text-align:center;">Qtd</th></tr></thead>
                        <tbody>
                            ${(data.porTipoProva || []).map(t => `
                                <tr>
                                    <td>${this.escapeHtml(t.tipoProva || t.label || '')}</td>
                                    <td style="text-align:center;">${t.count || 0}</td>
                                </tr>`).join('')}
                        </tbody>
                    </table>
                ` : ''}

                ${(data.porPeriodoProva || []).length > 0 ? `
                    <div class="section-title">DISTRIBUIÇÃO POR PERÍODO DA PROVA</div>
                    <table>
                        <thead><tr><th>Período</th><th style="width:80px;text-align:center;">Qtd</th></tr></thead>
                        <tbody>
                            ${(data.porPeriodoProva || []).map(p => `
                                <tr>
                                    <td>${this.escapeHtml(p.periodoProva || p.label || '')}</td>
                                    <td style="text-align:center;">${p.count || 0}</td>
                                </tr>`).join('')}
                        </tbody>
                    </table>
                ` : ''}

                <div class="section-title">DISTRIBUIÇÃO POR TURMA</div>
                <table>
                    <thead><tr><th>Turma</th><th style="width:70px;text-align:center;">Total</th><th style="width:70px;text-align:center;">Alunos</th></tr></thead>
                    <tbody>
                        ${porTurma.map(t => `
                            <tr>
                                <td>${this.escapeHtml(t.turma || '')}</td>
                                <td style="text-align:center;">${t.total || 0}</td>
                                <td style="text-align:center;">${t.totalAlunos || 0}</td>
                            </tr>`).join('') || '<tr><td colspan="3" style="text-align:center;">Nenhum dado</td></tr>'}
                    </tbody>
                </table>

                <div class="section-title">ÚLTIMOS REGISTROS</div>
                <table>
                    <thead>
                        <tr>
                            <th>Data Registro</th>
                            <th>Período da Falta</th>
                            <th>Tipo de Prova</th>
                            <th>Período</th>
                            <th>Aluno</th>
                            <th>Turma</th>
                            <th>Motivo</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${registros.slice(0, 40).map(a => `
                            <tr>
                                <td>${a.dataFormatada || '-'}</td>
                                <td><strong>${a.periodoFaltaFormatado || '-'}</strong></td>
                                <td>${a.tipoProvaPerdidaFormatado || a.tipoProvaPerdida || '-'}</td>
                                <td>${a.periodoProvaFormatado || a.periodoProva || '-'}</td>
                                <td>${this.escapeHtml(a.alunoNome || '')}</td>
                                <td>${this.escapeHtml(a.alunoTurma || '')}</td>
                                <td>${this.escapeHtml(a.motivoLabel || '')}</td>
                            </tr>`).join('') || '<tr><td colspan="7" style="text-align:center;">Nenhum registro</td></tr>'}
                    </tbody>
                </table>
            `;
        } else if (tipo === 'turma') {
            const porAluno = Array.isArray(data.porAluno) ? data.porAluno : [];
            const registros = Array.isArray(data.registros) ? data.registros : [];

            tabelaHTML = `
                <div class="section-title">REGISTROS POR ALUNO</div>
                <table>
                    <thead><tr><th>Aluno</th><th>Matrícula</th><th style="width:70px;text-align:center;">Total</th></tr></thead>
                    <tbody>
                        ${porAluno.map(a => `
                            <tr>
                                <td>${this.escapeHtml(a.alunoNome || '')}</td>
                                <td>${this.escapeHtml(a.alunoMatricula || '-')}</td>
                                <td style="text-align:center;">${a.total || 0}</td>
                            </tr>`).join('') || '<tr><td colspan="3" style="text-align:center;">Nenhum dado</td></tr>'}
                    </tbody>
                </table>

                ${registros.length > 0 ? `
                    <div class="section-title">ÚLTIMOS REGISTROS</div>
                    <table>
                        <thead>
                            <tr>
                                <th>Data Registro</th>
                                <th>Período da Falta</th>
                                <th>Tipo de Prova</th>
                                <th>Período</th>
                                <th>Aluno</th>
                                <th>Motivo</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${registros.slice(0, 40).map(a => `
                                <tr>
                                    <td>${a.dataFormatada || '-'}</td>
                                    <td><strong>${a.periodoFaltaFormatado || '-'}</strong></td>
                                    <td>${a.tipoProvaPerdidaFormatado || a.tipoProvaPerdida || '-'}</td>
                                    <td>${a.periodoProvaFormatado || a.periodoProva || '-'}</td>
                                    <td>${this.escapeHtml(a.alunoNome || '')}</td>
                                    <td>${this.escapeHtml(a.motivoLabel || '')}</td>
                                </tr>`).join('')}
                        </tbody>
                    </table>
                ` : ''}
            `;
        } else {
            const registros = Array.isArray(data.registros) ? data.registros : [];

            tabelaHTML = `
                <div class="section-title">HISTÓRICO DE REGISTROS</div>
                <table>
                    <thead>
                        <tr>
                            <th>Data Registro</th>
                            <th>Período da Falta</th>
                            <th>Tipo de Prova</th>
                            <th>Período</th>
                            <th>Motivo</th>
                            <th>Observações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${registros.map(a => `
                            <tr>
                                <td>${a.dataFormatada || '-'}</td>
                                <td><strong>${a.periodoFaltaFormatado || '-'}</strong></td>
                                <td>${a.tipoProvaPerdidaFormatado || a.tipoProvaPerdida || '-'}</td>
                                <td>${a.periodoProvaFormatado || a.periodoProva || '-'}</td>
                                <td>${this.escapeHtml(a.motivoLabel || '')}</td>
                                <td>${this.escapeHtml((a.observacoes || '').substring(0, 100))}</td>
                            </tr>`).join('') || '<tr><td colspan="6" style="text-align:center;">Nenhum registro</td></tr>'}
                    </tbody>
                </table>
            `;
        }

        return `<!DOCTYPE html>
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
                    color: #000;
                }
                .stats-table td span {
                    font-size: 7.5pt;
                    color: #333;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
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

                table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 7.5pt;
                    margin-bottom: 10px;
                }
                th {
                    background: #333;
                    color: white;
                    padding: 4px 5px;
                    text-align: left;
                    border: 1px solid #000;
                    font-size: 7.5pt;
                    text-transform: uppercase;
                    letter-spacing: 0.3px;
                    font-weight: bold;
                }
                td {
                    padding: 3px 5px;
                    border: 1px solid #ccc;
                    vertical-align: top;
                }
                tr:nth-child(even) { background: #f5f5f5; }

                .assinaturas {
                    display: flex;
                    justify-content: center;
                    margin-top: 25px;
                    gap: 30px;
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
                .assinatura-img {
                    max-height: 13mm;
                    max-width: 100%;
                    object-fit: contain;
                    position: relative;
                    z-index: 1;
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
                    .section-title {
                        page-break-after: avoid;
                        page-break-inside: avoid;
                    }
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
                <p>Sistema de Registros — Setor Pedagógico</p>
            </div>

            <div class="titulo">${titulo}</div>
            ${subtitulo ? `<div class="subtitulo">${this.escapeHtml(subtitulo)}</div>` : ''}

            ${statsHTML}
            ${tabelaHTML}

            <div class="assinaturas">
                <div class="assinatura">
                    <div class="assinatura-container-relatorio">
                        ${assinaturaDigital ? `<img class="assinatura-img" src="${assinaturaDigital}" alt="Assinatura">` : ''}
                        <img class="carimbo-overlay" src="${carimbo}" alt="Carimbo" onerror="this.style.display='none'">
                    </div>
                    <div class="assinatura-linha">Assinatura do Responsável / Setor Pedagógico</div>
                </div>
            </div>

            <div class="registro-info">
                Relatório gerado em <strong>${dataGeracao}</strong>
            </div>

            <div class="footer">
                <p>Documento gerado automaticamente pelo EducaPleno</p>
                <p>Setor: Pedagógico — 2ª Chamada</p>
            </div>
        </body>
        </html>`;
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
                    ${(data.porTipoProva || []).length > 0 ? `
                        <h6 class="mt-4">Por Tipo de Prova Perdida</h6>
                        <div class="row">${(data.porTipoProva || []).map(t => `
                            <div class="col-md-4 mb-2">
                                <div class="p-2" style="background:#fef3c7;border-radius:8px;">
                                    <strong>${this.escapeHtml(t.tipoProva || t.label)}</strong>: ${t.count}
                                </div>
                            </div>`).join('')}</div>
                    ` : ''}
                    ${(data.porPeriodoProva || []).length > 0 ? `
                        <h6 class="mt-4">Por Período da Prova</h6>
                        <div class="row">${(data.porPeriodoProva || []).map(p => `
                            <div class="col-md-3 mb-2">
                                <div class="p-2" style="background:#eef2ff;border-radius:8px;">
                                    <strong>${this.escapeHtml(p.periodoProva || p.label)}</strong>: ${p.count}
                                </div>
                            </div>`).join('')}</div>
                    ` : ''}
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
                            <thead>
                                <tr>
                                    <th>Data Registro</th>
                                    <th>Período da Falta</th>
                                    <th>Tipo de Prova</th>
                                    <th>Período</th>
                                    <th>Motivo</th>
                                    <th>Observações</th>
                                </tr>
                            </thead>
                            <tbody>${(data.registros || []).map(a => `
                                <tr>
                                    <td>${a.dataFormatada}</td>
                                    <td><strong>${a.periodoFaltaFormatado || '-'}</strong></td>
                                    <td>${this.escapeHtml(a.tipoProvaPerdidaFormatado || a.tipoProvaPerdida || '-')}</td>
                                    <td>${this.escapeHtml(a.periodoProvaFormatado || a.periodoProva || '-')}</td>
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
        if (!data) {
            this.showToast('⚠️ Gere um relatório primeiro', 'error');
            return;
        }

        const registros = data.registros || [];
        if (registros.length === 0) {
            this.showToast('⚠️ Nenhum registro para exportar', 'error');
            return;
        }

        const tipo = data.aluno ? 'aluno' : (data.turma ? 'turma' : 'geral');

        let titulo = 'Relatório de 2ª Chamada';
        let subtitulo = '';
        if (tipo === 'turma') {
            titulo = 'Relatório de 2ª Chamada por Turma';
            subtitulo = `Turma: ${data.turma || ''}`;
        } else if (tipo === 'aluno') {
            titulo = 'Relatório Individual — 2ª Chamada';
            subtitulo = `${data.aluno?.nome || ''} — ${data.aluno?.turma || ''}`;
        } else {
            subtitulo = 'Visão consolidada';
        }

        const colunas = [
            {
                label: 'Data do Registro',
                format: (a) => a.dataFormatada
                    || (a.data ? new Date(a.data).toLocaleDateString('pt-BR') : '')
            },
            {
                label: 'Data de Cadastro',
                format: (a) => a.createdAt
                    ? new Date(a.createdAt).toLocaleString('pt-BR')
                    : ''
            },
            { label: 'Período da Falta', format: (a) => a.periodoFaltaFormatado || '' },
            { label: 'Tipo de Prova Perdida', format: (a) => a.tipoProvaPerdidaFormatado || a.tipoProvaPerdida || '' },
            { label: 'Período da Prova', format: (a) => a.periodoProvaFormatado || a.periodoProva || '' },
            { label: 'Aluno', format: (a) => a.alunoNome || '' },
            { label: 'Matrícula', format: (a) => a.alunoMatricula || '' },
            { label: 'Turma', format: (a) => a.alunoTurma || data.turma || '' },
            { label: 'Horário', format: (a) => a.horarioEntrada || '' },
            { label: 'Motivo', format: (a) => a.motivoLabel || '' },
            { label: 'Observações', format: (a) => a.observacoes || '' },
            { label: 'Responsável', format: (a) => a.responsavelNome || '' },
            { label: 'CPF Responsável', format: (a) => a.responsavelCPF || '' },
            { label: 'Telefone Responsável', format: (a) => a.responsavelTelefone || '' },
            { label: 'Assinatura', format: (a) => a.assinaturaBase64 ? 'Sim' : 'Não' }
        ];

        const filtros = [];
        const dI = document.getElementById('SegundaChamadaDataInicio')?.value;
        const dF = document.getElementById('SegundaChamadaDataFim')?.value;
        const tipoProva = document.getElementById('SegundaChamadaFiltroTipoProva')?.value;
        const periodoProva = document.getElementById('SegundaChamadaFiltroPeriodoProva')?.value;

        if (dI) filtros.push({ label: 'Data inicial', valor: dI });
        if (dF) filtros.push({ label: 'Data final', valor: dF });
        if (tipoProva && tipoProva !== 'todos') {
            filtros.push({ label: 'Tipo de Prova', valor: tipoProva });
        }
        if (periodoProva && periodoProva !== 'todos') {
            filtros.push({ label: 'Período da Prova', valor: periodoProva });
        }
        if (data.turma) filtros.push({ label: 'Turma', valor: data.turma });
        if (data.aluno?.nome) filtros.push({ label: 'Aluno', valor: data.aluno.nome });

        const metricas = {};
        if (tipo === 'geral') {
            metricas['Total de 2ªs chamadas'] = data.totalRegistros || 0;
            metricas['Motivos diferentes'] = (data.porMotivo || []).length;
            metricas['Turmas envolvidas'] = (data.porTurma || []).length;
        } else if (tipo === 'turma') {
            metricas['Total de 2ªs chamadas'] = data.estatisticas?.totalRegistros || 0;
            metricas['Alunos envolvidos'] = data.estatisticas?.totalAlunos
                || (data.porAluno || []).length;
        } else if (tipo === 'aluno') {
            metricas['Total de 2ªs chamadas'] = data.estatisticas?.totalRegistros || 0;
            metricas['Motivos diferentes'] = (data.porMotivo || []).length;
        }

        const ok = this.gerarBaixarCSV({
            titulo,
            subtitulo,
            setor: 'Setor Pedagógico',
            colunas,
            registros,
            filtros,
            metricas,
            nomeArquivo: `relatorio-2chamada-${tipo}`,
            observacoes: `${registros.length} registro(s) de 2ª chamada`
        });

        if (ok) {
            this.showToast(`✅ CSV exportado (${registros.length} registro(s))!`, 'success');
        }
    }

    async imprimirSegundaChamada(id) {
        try {
            const r = await fetch(`/api/gestao-geral/autorizacao/${id}`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const d = await r.json();
            if (!d.success) { this.mostrarNotificacao('Erro ao carregar', 'error'); return; }

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
            this.mostrarNotificacao('Erro ao imprimir', 'error');
        }
    }

    gerarHTMLImpressaoSegundaChamada(a, qrCodeUrl) {
        const logo = '/uploads/logo-iema.png';
        const carimbo = '/icons/assinatura_gpeda.ico';
        const dataGeracao = new Date().toLocaleString('pt-BR');

        const entrada = new Date(a.data);
        const dataExt = entrada.toLocaleDateString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric'
        });
        const horaExt = entrada.toLocaleTimeString('pt-BR', {
            hour: '2-digit', minute: '2-digit'
        });

        let detalheMotivo = '';
        if (a.motivo === 'outros' && a.motivoOutros) {
            detalheMotivo = ` <strong>(Especificação: ${this.escapeHtml(a.motivoOutros)})</strong>`;
        }

        let periodoFaltaHTML = '';
        if (a.periodoFaltaInicio) {
            const ini = new Date(a.periodoFaltaInicio);
            const fim = a.periodoFaltaFim ? new Date(a.periodoFaltaFim) : ini;
            const iniFmt = ini.toLocaleDateString('pt-BR');
            const fimFmt = fim.toLocaleDateString('pt-BR');
            const texto = iniFmt === fimFmt ? iniFmt : `${iniFmt} a ${fimFmt}`;

            periodoFaltaHTML = `
                <div class="section-title">📆 Período da Falta Justificada</div>
                <div class="motivo-box" style="background: #dbeafe; border-color: #1e3c72;">
                    <p style="margin: 0; font-size: 11pt; text-align: center;">
                        <strong>${texto}</strong>
                    </p>
                </div>
            `;
        }

        let tipoProvaHTML = '';
        if (a.tipoProvaPerdida) {
            const textoProva = a.tipoProvaPerdida === 'Outros' && a.tipoProvaPerdidaOutros
                ? `Outros (${this.escapeHtml(a.tipoProvaPerdidaOutros)})`
                : this.escapeHtml(a.tipoProvaPerdida);

            tipoProvaHTML = `
                <div class="section-title">📝 Tipo de Prova Perdida</div>
                <div class="motivo-box" style="background: #fef3c7; border-color: #f59e0b;">
                    <p style="margin: 0; font-size: 11pt; text-align: center;">
                        <strong>${textoProva}</strong>
                    </p>
                </div>
            `;
        }

        let periodoProvaHTML = '';
        if (a.periodoProva) {
            periodoProvaHTML = `
                <div class="section-title">📚 Período da Prova</div>
                <div class="motivo-box" style="background: #eef2ff; border-color: #1e3c72;">
                    <p style="margin: 0; font-size: 11pt; text-align: center;">
                        <strong>${this.escapeHtml(a.periodoProva)}</strong>
                    </p>
                </div>
            `;
        }

        const assinaturaHTML = a.assinaturaBase64
            ? `<img class="assinatura-img" src="${a.assinaturaBase64}" alt="Assinatura">`
            : '';

        const temResponsavel = a.responsavelNome || a.responsavelCPF || a.responsavelTelefone;
        const responsavelHTML = temResponsavel ? `
            <div class="section-title">👤 Responsável</div>
            <div class="detalhes-compactos">
                ${a.responsavelNome ? `<span class="det-item"><strong>Nome:</strong> ${this.escapeHtml(a.responsavelNome)}</span>` : ''}
                ${a.responsavelCPF ? `<span class="det-item"><strong>CPF:</strong> ${this.escapeHtml(a.responsavelCPF)}</span>` : ''}
                ${a.responsavelTelefone ? `<span class="det-item"><strong>Telefone:</strong> ${this.escapeHtml(a.responsavelTelefone)}</span>` : ''}
            </div>
        ` : '';

        const horariosHTML = a.horarioEntrada ? `
            <div class="info-grid">
                <div class="info-item">
                    <span class="info-label">Entrada:</span>
                    <span class="info-value">${a.horarioEntrada}</span>
                </div>
            </div>` : '';

        return `<!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <title>2ª Chamada - ${this.escapeHtml(a.alunoNome)}</title>
            <style>
                @page { size: A4 portrait; margin: 8mm; }
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body {
                    font-family: 'Times New Roman', Times, serif;
                    font-size: 9.5pt;
                    line-height: 1.25;
                    color: #000;
                }

                .header {
                    text-align: center;
                    border-bottom: 1.5px double #000;
                    padding-bottom: 4px;
                    margin-bottom: 6px;
                }
                .header img {
                    max-width: 100%;
                    max-height: 14mm;
                    object-fit: contain;
                    display: block;
                    margin: 0 auto 2px;
                }
                .header h1 {
                    font-size: 10pt;
                    text-transform: uppercase;
                    font-weight: bold;
                    margin: 2px 0 0;
                }
                .header p {
                    font-size: 8pt;
                    margin: 1px 0 0;
                }

                .titulo {
                    text-align: center;
                    font-size: 11pt;
                    font-weight: bold;
                    background: #eef2ff;
                    padding: 4px 8px;
                    border: 1.5px solid #000;
                    margin: 6px 0 3px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }

                .aluno-box {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 5px 8px;
                    background: #eef2ff;
                    border: 1px solid #c7d2fe;
                    border-radius: 5px;
                    margin-bottom: 6px;
                }
                .aluno-foto {
                    width: 38px;
                    height: 38px;
                    border-radius: 50%;
                    object-fit: cover;
                    border: 1.5px solid #1e3c72;
                    flex-shrink: 0;
                }
                .aluno-info { flex: 1; }
                .aluno-nome {
                    font-size: 10pt;
                    font-weight: bold;
                    color: #1e3c72;
                    margin-bottom: 1px;
                }
                .aluno-detalhes {
                    font-size: 8pt;
                    color: #374151;
                }

                .section-title {
                    font-size: 9pt;
                    font-weight: bold;
                    background: #e8e8e8;
                    padding: 2px 6px;
                    border-left: 3px solid #1e3c72;
                    margin: 5px 0 3px;
                }

                .info-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr 1fr;
                    gap: 3px 12px;
                    margin: 3px 0 5px;
                    font-size: 8.5pt;
                }
                .info-item { display: flex; gap: 4px; }
                .info-label { font-weight: bold; white-space: nowrap; }
                .info-value { flex: 1; }

                .detalhes-compactos {
                    background: #f9fafb;
                    border: 1px solid #e5e7eb;
                    border-radius: 4px;
                    padding: 4px 6px;
                    font-size: 8pt;
                    line-height: 1.35;
                }
                .det-item {
                    display: inline-block;
                    margin-right: 10px;
                    margin-bottom: 2px;
                }

                .motivo-box {
                    background: #f5f5f5;
                    border: 1px solid #000;
                    padding: 5px 8px;
                    margin: 5px 0;
                    border-radius: 4px;
                }
                .motivo-box strong { font-size: 9pt; }
                .motivo-box p { margin: 3px 0 0; font-size: 9.5pt; font-weight: bold; }

                .descricao-box {
                    background: #f9fafb;
                    border: 1px solid #e5e7eb;
                    border-radius: 4px;
                    padding: 5px 8px;
                    font-size: 8.5pt;
                    line-height: 1.3;
                    min-height: 30px;
                    max-height: 80px;
                    overflow: hidden;
                    word-wrap: break-word;
                }

                .assinaturas {
                    display: flex;
                    justify-content: space-around;
                    margin-top: 25px;
                    gap: 20px;
                }
                .assinatura {
                    flex: 0 0 42%;
                    text-align: center;
                }

                .assinatura-container-relatorio {
                    position: relative;
                    min-height: 18mm;
                    display: flex;
                    align-items: flex-end;
                    justify-content: center;
                    padding-bottom: 0;
                }

                .assinatura-container-relatorio::after {
                    content: '';
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    border-bottom: 1px solid #000;
                }

                .assinatura-img {
                    max-height: 14mm;
                    max-width: 100%;
                    object-fit: contain;
                    position: relative;
                    z-index: 2;
                    margin-bottom: 1mm;
                }

                .carimbo-overlay {
                    position: absolute;
                    bottom: 1mm;
                    left: 50%;
                    transform: translateX(-50%);
                    max-height: 15mm;
                    max-width: 45mm;
                    object-fit: contain;
                    opacity: 0.95;
                    pointer-events: none;
                    z-index: 1;
                }

                .assinatura-linha {
                    padding-top: 3px;
                    font-size: 8pt;
                    margin-top: 2px;
                }

                .qr-code {
                    text-align: center;
                    margin-top: 6px;
                }
                .qr-code img {
                    width: 25mm;
                    height: 25mm;
                    border: 1.5px solid #000;
                    padding: 2px;
                    display: block;
                    margin: 0 auto;
                }
                .qr-code p {
                    font-size: 8pt;
                    margin: 3px 0 0 0;
                    color: #444;
                    font-weight: bold;
                }

                .footer {
                    text-align: center;
                    margin-top: 5px;
                    padding-top: 3px;
                    border-top: 1px solid #ccc;
                    font-size: 6.5pt;
                    color: #666;
                }
                .footer p { margin: 1px 0; }

                .btn-print {
                    display: block;
                    margin: 10px auto;
                    padding: 8px 20px;
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
                    body { padding: 0; }
                    .footer { page-break-after: avoid; }
                }
            </style>
        </head>
        <body>
            <button class="btn-print no-print" onclick="window.print()">🖨️ Imprimir</button>

            <div class="header">
                <img src="${logo}" alt="IEMA" onerror="this.style.display='none'">
                <h1>IEMA Pleno: São Luís - Centro</h1>
                <p>Sistema de Atendimentos — Setor Pedagógico</p>
            </div>

            <div class="titulo">📋 2ª CHAMADA</div>

            <div class="aluno-box">
                <img class="aluno-foto" src="${this.gerarAvatarSVG(a.alunoNome)}"
                    alt="${this.escapeHtml(a.alunoNome)}"
                    onerror="this.onerror=null; this.src='${this.gerarAvatarSVG(a.alunoNome)}'">
                <div class="aluno-info">
                    <div class="aluno-nome">${this.escapeHtml(a.alunoNome)}</div>
                    <div class="aluno-detalhes">
                        <strong>Matrícula:</strong> ${this.escapeHtml(a.alunoMatricula || 'Não informada')} •
                        <strong>Turma:</strong> ${this.escapeHtml(a.alunoTurma || '-')}
                        ${a.alunoCurso ? ` • <strong>Curso:</strong> ${this.escapeHtml(a.alunoCurso)}` : ''}
                    </div>
                </div>
            </div>

            ${periodoFaltaHTML}
            ${tipoProvaHTML}
            ${periodoProvaHTML}

            <div class="section-title">📌 Dados do Registro</div>
            <div class="info-grid">
                <div class="info-item">
                    <span class="info-label">Data:</span>
                    <span class="info-value">${dataExt}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Hora:</span>
                    <span class="info-value">${horaExt}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Registrado por:</span>
                    <span class="info-value">${this.escapeHtml(a.registradoPorNome || a.registradoPor || '-')}</span>
                </div>
            </div>
            ${horariosHTML}

            <div class="motivo-box">
                <strong>📌 Motivo:</strong>
                <p>☑ ${this.escapeHtml(a.motivoLabel || a.motivo || '-')}${detalheMotivo}</p>
            </div>

            ${responsavelHTML}

            ${a.observacoes ? `
                <div class="section-title">💬 Observações</div>
                <div class="descricao-box" style="min-height: 20px; max-height: 60px;">
                    ${this.escapeHtml(a.observacoes).replace(/\n/g, '<br>')}
                </div>
            ` : ''}

            <div class="assinaturas">
                <div class="assinatura">
                    <div class="assinatura-container-relatorio">
                        ${assinaturaHTML}
                    </div>
                    <div class="assinatura-linha">Assinatura do Responsável</div>
                </div>
                <div class="assinatura">
                    <div class="assinatura-container-relatorio">
                        <img class="carimbo-overlay" src="${carimbo}" alt="Carimbo" onerror="this.style.display='none'">
                    </div>
                    <div class="assinatura-linha">Setor Pedagógico</div>
                </div>
            </div>

            ${qrCodeUrl ? `
                <div class="qr-code">
                    <img src="${qrCodeUrl}" alt="QR Code">
                    <p>Identificação do Aluno</p>
                </div>
            ` : ''}

            <div class="footer">
                <p>Documento gerado em <strong>${dataGeracao}</strong> — EducaPleno — Setor Pedagógico</p>
            </div>
        </body>
        </html>`;
    }

    async excluirSegundaChamada(id) {
        const confirmar = await this.confirmarAcao('Tem certeza que deseja EXCLUIR este registro de 2ª Chamada?\n\nEsta ação não pode ser desfeita.');
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

            let periodoInicioInput = '';
            let periodoFimInput = '';
            if (a.periodoFaltaInicio) {
                periodoInicioInput = getDataLocalISO(new Date(a.periodoFaltaInicio));
            }
            if (a.periodoFaltaFim) {
                periodoFimInput = getDataLocalISO(new Date(a.periodoFaltaFim));
            }

            let dataRegistroInput = '';
            if (a.data) {
                dataRegistroInput = getDataLocalISO(new Date(a.data));
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
                                    <div class="col-md-4 mb-3">
                                        <label class="form-label">Data da Falta (Início) <span class="text-danger">*</span></label>
                                        <input type="date" id="edit2ChamadaPeriodoFaltaInicio" class="form-control" value="${periodoInicioInput}" required>
                                    </div>
                                    <div class="col-md-4 mb-3">
                                        <label class="form-label">Data da Falta (Fim)</label>
                                        <input type="date" id="edit2ChamadaPeriodoFaltaFim" class="form-control" value="${periodoFimInput}">
                                        <small class="text-muted">Deixe vazio se for 1 dia só</small>
                                    </div>
                                    <div class="col-md-4 mb-3">
                                        <label class="form-label">Data do Registro</label>
                                        <input type="date" id="edit2ChamadaData" class="form-control" value="${dataRegistroInput}" disabled>
                                        <small class="text-muted">Data em que foi cadastrado</small>
                                    </div>
                                </div>

                                <div class="mb-3">
                                    <label class="form-label">Tipo de Prova Perdida <span class="text-danger">*</span></label>
                                    <select id="edit2ChamadaTipoProva" class="form-select" onchange="setorPedagogico.toggleEdit2ChamadaTipoProvaOutros()">
                                        <option value="">Selecione...</option>
                                        <option value="AV1" ${a.tipoProvaPerdida === 'AV1' ? 'selected' : ''}>AV1</option>
                                        <option value="AV2" ${a.tipoProvaPerdida === 'AV2' ? 'selected' : ''}>AV2</option>
                                        <option value="AV3" ${a.tipoProvaPerdida === 'AV3' ? 'selected' : ''}>AV3</option>
                                        <option value="AV4" ${a.tipoProvaPerdida === 'AV4' ? 'selected' : ''}>AV4</option>
                                        <option value="Recuperação" ${a.tipoProvaPerdida === 'Recuperação' ? 'selected' : ''}>Recuperação</option>
                                        <option value="Outros" ${a.tipoProvaPerdida === 'Outros' ? 'selected' : ''}>Outros</option>
                                    </select>
                                </div>
                                <div id="edit2ChamadaCampoTipoProvaOutros" style="display: ${a.tipoProvaPerdida === 'Outros' ? 'block' : 'none'};">
                                    <div class="mb-3">
                                        <label class="form-label">Especifique o Tipo de Prova</label>
                                        <input type="text" id="edit2ChamadaTipoProvaOutros" class="form-control" value="${this.escapeHtml(a.tipoProvaPerdidaOutros || '')}">
                                    </div>
                                </div>

                                <!-- PERÍODO DA PROVA -->
                                <div class="mb-3">
                                    <label class="form-label">Período da Prova <span class="text-danger">*</span></label>
                                    <select id="edit2ChamadaPeriodoProva" class="form-select">
                                        <option value="">Selecione...</option>
                                        <option value="1º Período" ${a.periodoProva === '1º Período' ? 'selected' : ''}>1º Período</option>
                                        <option value="2º Período" ${a.periodoProva === '2º Período' ? 'selected' : ''}>2º Período</option>
                                        <option value="3º Período" ${a.periodoProva === '3º Período' ? 'selected' : ''}>3º Período</option>
                                        <option value="4º Período" ${a.periodoProva === '4º Período' ? 'selected' : ''}>4º Período</option>
                                    </select>
                                </div>

                                <div class="row">
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
                                                <input type="text" id="edit2ChamadaResponsavelCPF" class="form-control" value="${this.escapeHtml(a.responsavelCPF || '')}" maxlength="14" oninput="setorPedagogico.formatarCPF(this)">
                                            </div>
                                            <div class="col-md-3 mb-3">
                                                <label class="form-label">Telefone</label>
                                                <input type="text" id="edit2ChamadaResponsavelTelefone" class="form-control" value="${this.escapeHtml(a.responsavelTelefone || '')}" maxlength="15" oninput="setorPedagogico.formatarTelefone(this)">
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

    toggleEdit2ChamadaTipoProvaOutros() {
        const tipo = document.getElementById('edit2ChamadaTipoProva')?.value;
        const campo = document.getElementById('edit2ChamadaCampoTipoProvaOutros');
        if (campo) campo.style.display = tipo === 'Outros' ? 'block' : 'none';
    }

    async salvarEdicaoSegundaChamada() {
        const id = document.getElementById('edit2ChamadaId')?.value;
        const horario = document.getElementById('edit2ChamadaHorario')?.value || '';
        const motivo = document.getElementById('edit2ChamadaMotivo')?.value;
        const motivoOutros = document.getElementById('edit2ChamadaMotivoOutros')?.value || '';
        const tipoProvaPerdida = document.getElementById('edit2ChamadaTipoProva')?.value || '';
        const tipoProvaPerdidaOutros = document.getElementById('edit2ChamadaTipoProvaOutros')?.value || '';
        const periodoProva = document.getElementById('edit2ChamadaPeriodoProva')?.value || '';
        const responsavelNome = document.getElementById('edit2ChamadaResponsavelNome')?.value || '';
        const responsavelCPF = document.getElementById('edit2ChamadaResponsavelCPF')?.value || '';
        const responsavelTelefone = document.getElementById('edit2ChamadaResponsavelTelefone')?.value || '';
        const observacoes = document.getElementById('edit2ChamadaObservacoes')?.value || '';

        const periodoFaltaInicio = document.getElementById('edit2ChamadaPeriodoFaltaInicio')?.value || '';
        const periodoFaltaFim = document.getElementById('edit2ChamadaPeriodoFaltaFim')?.value || '';

        if (!motivo) {
            this.showToast('Preencha o motivo', 'warning');
            return;
        }

        if (!tipoProvaPerdida) {
            this.showToast('Informe o tipo de prova perdida', 'warning');
            return;
        }

        if (tipoProvaPerdida === 'Outros' && !tipoProvaPerdidaOutros.trim()) {
            this.showToast('Especifique o tipo de prova perdida', 'warning');
            return;
        }

        if (!periodoProva) {
            this.showToast('Informe o período da prova (1º, 2º, 3º ou 4º Período)', 'warning');
            return;
        }

        if (!periodoFaltaInicio) {
            this.showToast('Informe a data da falta (início)', 'warning');
            return;
        }

        if (periodoFaltaFim && periodoFaltaFim < periodoFaltaInicio) {
            this.showToast('Data final não pode ser anterior à data inicial', 'warning');
            return;
        }

        if (motivo === 'outros' && !motivoOutros.trim()) {
            this.showToast('Especifique o motivo "Outros"', 'warning');
            return;
        }

        if (responsavelCPF) {
            const validacaoCPF = this.validarCPFCliente(responsavelCPF);
            if (!validacaoCPF.valido) {
                this.showToast(`⚠️ CPF inválido!\n\n${validacaoCPF.erro}`, 'error');
                return;
            }
        } else {
            this.showToast('⚠️ CPF do responsável é obrigatório!', 'error');
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
                    horarioEntrada: horario,
                    horarioSaida: horario,
                    motivo,
                    motivoOutros,
                    tipoProvaPerdida,
                    tipoProvaPerdidaOutros,
                    periodoProva,
                    responsavelNome,
                    responsavelCPF,
                    responsavelTelefone,
                    observacoes,
                    periodoFaltaInicio,
                    periodoFaltaFim: periodoFaltaFim || periodoFaltaInicio
                })
            });
            const result = await response.json();

            if (response.status === 409 || (result.error && result.error.includes('Já existe'))) {
                let msg = '⚠️ Registro duplicado detectado!\n\n';
                msg += result.error || 'Já existe outro registro com os mesmos dados.';
                this.showToast(msg, 'error');
                return;
            }

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
    // 🔧 MÉTODOS AUXILIARES DE PREFIXO
    // ============================================================================
    getPrefixo(modulo) {
        const prefixos = {
            'autorizacao': 'autorizacao',
            'justificativa': 'justificativa',
            'segundaChamada': 'segundaChamada'
        };
        return prefixos[modulo] || modulo;
    }

    getPrefixoInput(modulo) {
        const prefixos = {
            'autorizacao': 'autorizacao',
            'justificativa': 'justificativa',
            'segundaChamada': 'segundaChamada'
        };
        return prefixos[modulo] || modulo;
    }

    getCfg(modulo) {
        const cfgs = {
            'autorizacao': { tipo: 'autorizacao', nomeAmigavel: 'Autorização' },
            'justificativa': { tipo: 'justificativa', nomeAmigavel: 'Justificativa' },
            'segundaChamada': { tipo: 'segunda_chamada', nomeAmigavel: '2ª Chamada' }
        };
        return cfgs[modulo] || { tipo: modulo, nomeAmigavel: modulo };
    }

    getTipoModulo(modulo) {
        const mapa = {
            'autorizacao': 'autorizacao',
            'justificativa': 'justificativa',
            'segundaChamada': 'segunda_chamada'
        };
        return mapa[modulo] || modulo;
    }
}

// ============================================================================
// INSTALADOR: copia todos os métodos (e getters) para a classe principal
// ============================================================================
(function () {
    function instalar(Alvo) {
        if (!Alvo) {
            console.warn('[2chamada-pedagogico] Classe alvo não informada.');
            return;
        }
        const destino = typeof Alvo === 'function' ? Alvo.prototype : Alvo;
        const fonte = Segunda2ChamadaPedagogico.prototype;

        Object.getOwnPropertyNames(fonte).forEach((nome) => {
            if (nome === 'constructor') return;
            Object.defineProperty(destino, nome, Object.getOwnPropertyDescriptor(fonte, nome));
        });
        console.log('✅ 2chamada-pedagogico instalado em', destino.constructor?.name || 'objeto');
    }

    window.instalarSegundaChamadaPedagogico = instalar;

    // Se a instância global já existir, instala nela automaticamente
    document.addEventListener('DOMContentLoaded', () => {
        if (window.setorPedagogico && !window.setorPedagogico.__2chInstalado) {
            instalar(Object.getPrototypeOf(window.setorPedagogico));
            window.setorPedagogico.__2chInstalado = true;
        }
    });
})();