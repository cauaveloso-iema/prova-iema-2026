// ============================================
// 🆕 ACOMPANHAMENTO DE TUTORIA
// Integração com o módulo Protagonismo
// ============================================

let __tutoriaDados = null;
let __tutoriaModal = null;
let __tutoriaFiltros = {
    turma: '',
    busca: '',
    area: ''
};

// ============================================
// ABRIR MODAL
// ============================================
async function abrirAcompanhamentoTutoria() {
    console.log('🎓 [Tutoria] Abrindo acompanhamento...');
    
    // Cria o modal se não existir
    if (!document.getElementById('modalAcompanhamentoTutoria')) {
        criarModalTutoria();
    }
    
    if (!__tutoriaModal) {
        __tutoriaModal = new bootstrap.Modal(document.getElementById('modalAcompanhamentoTutoria'));
    }
    
    __tutoriaModal.show();
    
    // Carrega os dados
    await carregarAcompanhamentoTutoria();
}

// ============================================
// CRIAR MODAL (HTML dinâmico)
// ============================================
function criarModalTutoria() {
    const modalHtml = `
        <div class="modal fade" id="modalAcompanhamentoTutoria" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-xl modal-dialog-scrollable">
                <div class="modal-content">
                    
                    <div class="modal-header modal-header-tutoria">
                        <div>
                            <h5 class="modal-title">
                                <i class="fas fa-chalkboard-teacher"></i>
                                Acompanhamento de Tutoria
                            </h5>
                            <small style="opacity: 0.9;">
                                Tutores e turmas do Protagonismo Estudantil
                            </small>
                        </div>
                        <button type="button" class="btn-close btn-close-white" 
                                data-bs-dismiss="modal" aria-label="Fechar"></button>
                    </div>
                    
                    <div class="modal-body modal-body-tutoria">
                        
                        <!-- FILTROS -->
                        <div class="modal-filtros-tutoria">
                            <h6 class="modal-filtros-titulo">
                                <i class="fas fa-filter"></i> Filtros
                            </h6>
                            
                            <div class="row g-3">
                                <div class="col-md-3">
                                    <label class="form-label form-label-visitas">
                                        <i class="fas fa-school"></i> Turma
                                    </label>
                                    <select id="filtroTutoriaTurma" 
                                            class="form-select form-select-sm" 
                                            onchange="filtrarAcompanhamentoTutoria()">
                                        <option value="">Todas as turmas</option>
                                    </select>
                                </div>
                                
                                <div class="col-md-3">
                                    <label class="form-label form-label-visitas">
                                        <i class="fas fa-book"></i> Área / Disciplina
                                    </label>
                                    <select id="filtroTutoriaArea" 
                                            class="form-select form-select-sm" 
                                            onchange="filtrarAcompanhamentoTutoria()">
                                        <option value="">Todas as áreas</option>
                                    </select>
                                </div>
                                
                                <div class="col-md-4">
                                    <label class="form-label form-label-visitas">
                                        <i class="fas fa-search"></i> Buscar
                                    </label>
                                    <input type="text" 
                                           id="filtroTutoriaBusca" 
                                           class="form-control form-control-sm" 
                                           placeholder="Nome do professor, curso..."
                                           oninput="debounceFiltroTutoria()">
                                </div>
                                
                                <div class="col-md-2 d-flex align-items-end">
                                    <button class="btn btn-sm btn-outline-secondary w-100" 
                                            onclick="limparFiltrosTutoria()" 
                                            title="Limpar filtros">
                                        <i class="fas fa-eraser"></i> Limpar
                                    </button>
                                </div>
                            </div>
                        </div>
                        
                        <!-- STATS -->
                        <div class="stats-tutoria" id="statsTutoria"></div>
                        
                        <!-- LISTA -->
                        <div id="listaAcompanhamentoTutoria">
                            <div class="tutoria-loading">
                                <div class="spinner-tutoria"></div>
                                <p style="color: #64748b; margin: 0;">Carregando tutores...</p>
                            </div>
                        </div>
                        
                    </div>
                    
                    <div class="modal-footer modal-footer-tutoria">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                            <i class="fas fa-times"></i> Fechar
                        </button>
                        <div class="d-flex gap-2">
                            <button type="button" class="btn btn-outline-primary" onclick="carregarAcompanhamentoTutoria()">
                                <i class="fas fa-sync-alt"></i> Recarregar
                            </button>
                            <button type="button" class="btn btn-primary" onclick="exportarPDFTutoria()">
                                <i class="fas fa-file-pdf"></i> Exportar PDF
                            </button>
                        </div>
                    </div>
                    
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

// ============================================
// CARREGAR DADOS DA API
// ============================================
async function carregarAcompanhamentoTutoria() {
    console.log('📥 [Tutoria] Carregando dados...');
    
    const token = localStorage.getItem('auth_token');
    if (!token) {
        mostrarErroTutoria('Sessão expirada. Faça login novamente.');
        return;
    }
    
    const container = document.getElementById('listaAcompanhamentoTutoria');
    if (container) {
        container.innerHTML = `
            <div class="tutoria-loading">
                <div class="spinner-tutoria"></div>
                <p style="color: #64748b; margin: 0;">Carregando tutores...</p>
            </div>
        `;
    }
    
    try {
        const response = await fetch('/api/protagonismo/tutores', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Erro ao carregar tutores');
        }
        
        __tutoriaDados = {
            tutores: data.tutores || [],
            porTurma: data.porTurma || {}
        };
        
        console.log(`✅ [Tutoria] ${__tutoriaDados.tutores.length} tutor(es) carregado(s)`);
        
        // Preenche os filtros
        preencherFiltrosTutoria();
        
        // Renderiza
        renderizarEstatisticasTutoria();
        renderizarListaTutoria();
        
    } catch (error) {
        console.error('❌ [Tutoria] Erro:', error);
        mostrarErroTutoria(error.message);
    }
}

// ============================================
// PREENCHER FILTROS
// ============================================
function preencherFiltrosTutoria() {
    if (!__tutoriaDados) return;
    
    // Turmas
    const selectTurma = document.getElementById('filtroTutoriaTurma');
    if (selectTurma) {
        const turmas = Object.keys(__tutoriaDados.porTurma || {}).sort();
        const valorAtual = selectTurma.value;
        
        selectTurma.innerHTML = '<option value="">Todas as turmas</option>';
        turmas.forEach(t => {
            selectTurma.innerHTML += `<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`;
        });
        
        if (valorAtual && turmas.includes(valorAtual)) {
            selectTurma.value = valorAtual;
        }
    }
    
    // Áreas
    const selectArea = document.getElementById('filtroTutoriaArea');
    if (selectArea) {
        const areas = [...new Set(__tutoriaDados.tutores.map(t => t.area).filter(Boolean))].sort();
        const valorAtual = selectArea.value;
        
        selectArea.innerHTML = '<option value="">Todas as áreas</option>';
        areas.forEach(a => {
            selectArea.innerHTML += `<option value="${escapeHTML(a)}">${escapeHTML(a)}</option>`;
        });
        
        if (valorAtual && areas.includes(valorAtual)) {
            selectArea.value = valorAtual;
        }
    }
}

// ============================================
// RENDERIZAR ESTATÍSTICAS
// ============================================
function renderizarEstatisticasTutoria() {
    const container = document.getElementById('statsTutoria');
    if (!container || !__tutoriaDados) return;
    
    const tutores = __tutoriaDados.tutores;
    const porTurma = __tutoriaDados.porTurma;
    
    const totalTutores = tutores.length;
    const totalTurmas = Object.keys(porTurma).length;
    const totalAreas = new Set(tutores.map(t => t.area).filter(Boolean)).size;
    const totalCursos = new Set(tutores.map(t => t.curso).filter(Boolean)).size;
    
    container.innerHTML = `
        <div class="stat-card-tutoria">
            <div class="stat-icon icon-total">
                <i class="fas fa-chalkboard-teacher"></i>
            </div>
            <div class="stat-info">
                <span class="stat-number">${totalTutores}</span>
                <span class="stat-label">Total de Tutores</span>
            </div>
        </div>
        
        <div class="stat-card-tutoria">
            <div class="stat-icon icon-turmas">
                <i class="fas fa-users"></i>
            </div>
            <div class="stat-info">
                <span class="stat-number">${totalTurmas}</span>
                <span class="stat-label">Turmas com Tutoria</span>
            </div>
        </div>
        
        <div class="stat-card-tutoria">
            <div class="stat-icon icon-areas">
                <i class="fas fa-book"></i>
            </div>
            <div class="stat-info">
                <span class="stat-number">${totalAreas}</span>
                <span class="stat-label">Áreas Diferentes</span>
            </div>
        </div>
        
        <div class="stat-card-tutoria">
            <div class="stat-icon icon-cursos">
                <i class="fas fa-graduation-cap"></i>
            </div>
            <div class="stat-info">
                <span class="stat-number">${totalCursos}</span>
                <span class="stat-label">Cursos Envolvidos</span>
            </div>
        </div>
    `;
}

// ============================================
// RENDERIZAR LISTA
// ============================================
function renderizarListaTutoria() {
    const container = document.getElementById('listaAcompanhamentoTutoria');
    if (!container || !__tutoriaDados) return;
    
    const { turma, area, busca } = __tutoriaFiltros;
    const buscaLower = (busca || '').toLowerCase().trim();
    
    // Filtra por turma
    let turmasParaMostrar = Object.keys(__tutoriaDados.porTurma || {});
    
    if (turma) {
        turmasParaMostrar = turmasParaMostrar.filter(t => t === turma);
    }
    
    // Aplica filtros de área e busca
    const turmasFiltradas = turmasParaMostrar.map(turmaNome => {
        const tutores = __tutoriaDados.porTurma[turmaNome] || [];
        
        const tutoresFiltrados = tutores.filter(tutor => {
            // Filtro por área
            if (area && tutor.area !== area) return false;
            
            // Filtro por busca
            if (buscaLower) {
                const textoBusca = [
                    tutor.nomeProfessor,
                    tutor.area,
                    tutor.curso,
                    tutor.observacoes
                ].filter(Boolean).join(' ').toLowerCase();
                
                if (!textoBusca.includes(buscaLower)) return false;
            }
            
            return true;
        });
        
        return {
            turma: turmaNome,
            tutores: tutoresFiltrados
        };
    }).filter(item => item.tutores.length > 0);
    
    // Se não há resultados
    if (turmasFiltradas.length === 0) {
        const temFiltros = turma || area || busca;
        
        container.innerHTML = `
            <div class="tutoria-vazio">
                <i class="fas fa-${temFiltros ? 'filter' : 'chalkboard-teacher'}"></i>
                <p>${temFiltros 
                    ? 'Nenhum tutor encontrado com os filtros aplicados.' 
                    : 'Nenhum tutor cadastrado ainda no Protagonismo.'}</p>
                ${temFiltros ? `
                    <button class="btn btn-sm btn-primary mt-3" onclick="limparFiltrosTutoria()">
                        <i class="fas fa-times"></i> Limpar filtros
                    </button>
                ` : ''}
            </div>
        `;
        return;
    }
    
    // Ordena turmas alfabeticamente
    turmasFiltradas.sort((a, b) => a.turma.localeCompare(b.turma));
    
    // Renderiza
    let html = '';
    
    turmasFiltradas.forEach(item => {
        const totalTutores = (__tutoriaDados.porTurma[item.turma] || []).length;
        const tutoresFiltrados = item.tutores.length;
        const isCompleta = totalTutores >= 2;
        
        let badgeClass = 'incompleta';
        let badgeTexto = `${totalTutores}/2 tutores`;
        
        if (isCompleta) {
            badgeClass = 'completa';
            badgeTexto = `✅ ${totalTutores}/2 tutores`;
        } else if (totalTutores === 1) {
            badgeClass = 'incompleta';
            badgeTexto = `⚠️ ${totalTutores}/2 tutores`;
        }
        
        html += `
            <div class="tutoria-turma-grupo">
                <div class="tutoria-turma-header">
                    <h5>
                        <i class="fas fa-users"></i>
                        Turma: ${escapeHTML(item.turma)}
                    </h5>
                    <span class="tutoria-turma-badge ${badgeClass}">
                        ${badgeTexto}
                        ${tutoresFiltrados !== totalTutores ? ` (${tutoresFiltrados} filtrado(s))` : ''}
                    </span>
                </div>
                
                <div class="tutores-turma-lista">
                    ${item.tutores.map(tutor => `
                        <div class="tutor-card-tutoria">
                            <div class="tutor-nome">
                                <i class="fas fa-user-tie"></i>
                                ${escapeHTML(tutor.nomeProfessor || 'Sem nome')}
                            </div>
                            
                            ${tutor.area ? `
                                <div class="tutor-detalhe">
                                    <i class="fas fa-book"></i>
                                    <span><strong>Área:</strong> ${escapeHTML(tutor.area)}</span>
                                </div>
                            ` : ''}
                            
                            ${tutor.curso ? `
                                <div class="tutor-detalhe">
                                    <i class="fas fa-graduation-cap"></i>
                                    <span><strong>Curso:</strong> ${escapeHTML(tutor.curso)}</span>
                                </div>
                            ` : ''}
                            
                            ${tutor.observacoes ? `
                                <div class="tutor-observacoes">
                                    <i class="fas fa-comment-dots"></i>
                                    ${escapeHTML(tutor.observacoes)}
                                </div>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    });
    
    // Resumo no topo
    const totalMostrado = turmasFiltradas.reduce((acc, t) => acc + t.tutores.length, 0);
    const temFiltros = turma || area || busca;
    
    let resumoHtml = '';
    if (temFiltros) {
        resumoHtml = `
            <div class="alert alert-info mb-3" style="border-radius: 10px; font-size: 13px; border-left: 4px solid #3b82f6;">
                <i class="fas fa-filter"></i>
                <strong>${totalMostrado}</strong> tutor(es) em <strong>${turmasFiltradas.length}</strong> turma(s) 
                correspondem aos filtros.
                <button class="btn btn-sm btn-outline-primary ms-2" onclick="limparFiltrosTutoria()">
                    <i class="fas fa-times"></i> Limpar
                </button>
            </div>
        `;
    }
    
    container.innerHTML = resumoHtml + html;
}

// ============================================
// FILTRAR
// ============================================
function filtrarAcompanhamentoTutoria() {
    __tutoriaFiltros.turma = document.getElementById('filtroTutoriaTurma')?.value || '';
    __tutoriaFiltros.area = document.getElementById('filtroTutoriaArea')?.value || '';
    __tutoriaFiltros.busca = document.getElementById('filtroTutoriaBusca')?.value || '';
    
    renderizarListaTutoria();
}

// ============================================
// DEBOUNCE BUSCA
// ============================================
let __tutoriaDebounceTimer = null;
function debounceFiltroTutoria() {
    clearTimeout(__tutoriaDebounceTimer);
    __tutoriaDebounceTimer = setTimeout(() => {
        filtrarAcompanhamentoTutoria();
    }, 400);
}

// ============================================
// LIMPAR FILTROS
// ============================================
function limparFiltrosTutoria() {
    const filtroTurma = document.getElementById('filtroTutoriaTurma');
    const filtroArea = document.getElementById('filtroTutoriaArea');
    const filtroBusca = document.getElementById('filtroTutoriaBusca');
    
    if (filtroTurma) filtroTurma.value = '';
    if (filtroArea) filtroArea.value = '';
    if (filtroBusca) filtroBusca.value = '';
    
    __tutoriaFiltros = { turma: '', area: '', busca: '' };
    
    renderizarListaTutoria();
}

// ============================================
// MOSTRAR ERRO
// ============================================
function mostrarErroTutoria(mensagem) {
    const container = document.getElementById('listaAcompanhamentoTutoria');
    if (!container) return;
    
    container.innerHTML = `
        <div class="alert alert-danger" style="border-radius: 12px; border-left: 4px solid #ef4444;">
            <div style="display: flex; align-items: center; gap: 12px;">
                <i class="fas fa-exclamation-triangle" style="font-size: 24px;"></i>
                <div style="flex: 1;">
                    <strong>Erro ao carregar tutoria</strong>
                    <p style="margin: 3px 0 0; font-size: 13px;">${escapeHTML(mensagem)}</p>
                </div>
                <button class="btn btn-sm btn-danger" onclick="carregarAcompanhamentoTutoria()">
                    <i class="fas fa-redo"></i> Tentar novamente
                </button>
            </div>
        </div>
    `;
}

// ============================================
// EXPORTAR PDF
// ============================================
// ============================================
// EXPORTAR PDF - TUTORIA (CORRIGIDO)
// ============================================
async function exportarPDFTutoria() {
    if (!__tutoriaDados || !__tutoriaDados.tutores || __tutoriaDados.tutores.length === 0) {
        if (typeof notificar === 'function') {
            notificar('⚠️ Nenhum tutor para exportar', 'warning');
        } else {
            alert('Nenhum tutor para exportar');
        }
        return;
    }
    
    try {
        if (typeof notificar === 'function') {
            notificar('Gerando PDF...', 'info');
        }
        
        const { turma, area, busca } = __tutoriaFiltros;
        const buscaLower = (busca || '').toLowerCase().trim();
        
        // Filtra os dados
        const turmasParaExportar = Object.keys(__tutoriaDados.porTurma || {})
            .filter(t => !turma || t === turma)
            .map(turmaNome => {
                const tutores = __tutoriaDados.porTurma[turmaNome] || [];
                const filtrados = tutores.filter(tutor => {
                    if (area && tutor.area !== area) return false;
                    if (buscaLower) {
                        const texto = [tutor.nomeProfessor, tutor.area, tutor.curso, tutor.observacoes]
                            .filter(Boolean).join(' ').toLowerCase();
                        if (!texto.includes(buscaLower)) return false;
                    }
                    return true;
                });
                return { turma: turmaNome, tutores: filtrados };
            })
            .filter(item => item.tutores.length > 0)
            .sort((a, b) => a.turma.localeCompare(b.turma));
        
        if (turmasParaExportar.length === 0) {
            if (typeof notificar === 'function') {
                notificar('⚠️ Nenhum tutor corresponde aos filtros', 'warning');
            }
            return;
        }
        
        const totalTutores = turmasParaExportar.reduce((acc, t) => acc + t.tutores.length, 0);
        const dataGeracao = new Date().toLocaleString('pt-BR');
        
        // Stats
        const statsHTML = `
            <div class="stats">
                <div class="stat">
                    <div class="stat-value">${totalTutores}</div>
                    <div class="stat-label">Total de Tutores</div>
                </div>
                <div class="stat">
                    <div class="stat-value">${turmasParaExportar.length}</div>
                    <div class="stat-label">Turmas</div>
                </div>
                <div class="stat">
                    <div class="stat-value">${new Set(turmasParaExportar.flatMap(t => t.tutores.map(tt => tt.area)).filter(Boolean)).size}</div>
                    <div class="stat-label">Áreas</div>
                </div>
            </div>
        `;
        
        // Tabela por turma
        let tabelaHTML = turmasParaExportar.map(item => `
            <div class="section-title">🏫 Turma: ${escapeHTML(item.turma)} (${item.tutores.length}/2 tutores)</div>
            <table>
                <thead>
                    <tr>
                        <th>Professor</th>
                        <th style="width:150px;">Área/Disciplina</th>
                        <th style="width:150px;">Curso</th>
                        <th>Observações</th>
                    </tr>
                </thead>
                <tbody>
                    ${item.tutores.map(tutor => `
                        <tr>
                            <td><strong>${escapeHTML(tutor.nomeProfessor || '')}</strong></td>
                            <td>${escapeHTML(tutor.area || '-')}</td>
                            <td>${escapeHTML(tutor.curso || '-')}</td>
                            <td>${escapeHTML(tutor.observacoes || '-')}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `).join('');
        
        const filtrosAplicados = [];
        if (turma) filtrosAplicados.push(`Turma: ${turma}`);
        if (area) filtrosAplicados.push(`Área: ${area}`);
        if (busca) filtrosAplicados.push(`Busca: "${busca}"`);
        
        const subtitulo = filtrosAplicados.length > 0 
            ? `Filtros: ${filtrosAplicados.join(' • ')}`
            : `${totalTutores} tutor(es) em ${turmasParaExportar.length} turma(s)`;
        
        // Monta HTML
        const logo = '/uploads/logo-iema.png';
        const carimbo = '/icons/assinatura_gestao.ico';  // ✅ CORRIGIDO
        
        const html = `<!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <title>Acompanhamento de Tutoria</title>
            <style>
                @page { size: A4 portrait; margin: 8mm; }
                * { box-sizing: border-box; margin: 0; padding: 0; }
                body { font-family: 'Times New Roman', Times, serif; font-size: 9.5pt; line-height: 1.25; color: #000; }
                
                .header { text-align: center; border-bottom: 1.5px double #000; padding-bottom: 4px; margin-bottom: 6px; }
                .header img { max-width: 100%; max-height: 14mm; object-fit: contain; display: block; margin: 0 auto 2px; }
                .header h1 { font-size: 10pt; text-transform: uppercase; font-weight: bold; margin: 2px 0 0; }
                .header p { font-size: 8pt; margin: 1px 0 0; }
                
                .titulo { text-align: center; font-size: 11pt; font-weight: bold; background: #fed7aa; padding: 4px 8px; border: 1.5px solid #000; margin: 6px 0 3px; text-transform: uppercase; letter-spacing: 0.5px; }
                .subtitulo { text-align: center; font-size: 9pt; margin: 0 0 6px; font-style: italic; }
                
                .stats { display: flex; gap: 8px; margin: 6px 0 8px; padding: 6px 8px; background: #fff7ed; border-radius: 5px; border: 1px solid #fdba74; }
                .stat { text-align: center; flex: 1; border-right: 1px solid #fdba74; }
                .stat:last-child { border-right: none; }
                .stat-value { font-size: 13pt; font-weight: bold; color: #ea580c; line-height: 1; }
                .stat-label { font-size: 7.5pt; color: #666; margin-top: 2px; }
                
                .section-title { font-size: 9pt; font-weight: bold; background: #e8e8e8; padding: 2px 6px; border-left: 3px solid #f97316; margin: 6px 0 3px; }
                
                table { width: 100%; border-collapse: collapse; font-size: 8.5pt; margin-bottom: 6px; }
                th { background: #f97316; color: white; padding: 4px 5px; text-align: left; border: 1px solid #ea580c; font-size: 8pt; }
                td { padding: 3px 5px; border: 1px solid #ddd; vertical-align: top; }
                tr:nth-child(even) { background: #fff7ed; }
                
                .assinaturas { display: flex; justify-content: center; margin-top: 25px; gap: 30px; }
                .assinatura { flex: 0 0 60%; text-align: center; }
                .assinatura-container-relatorio { position: relative; border-bottom: 1px solid #000; min-height: 14mm; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 2px; }
                .carimbo-overlay { max-height: 13mm; max-width: 55%; object-fit: contain; opacity: 0.85; }
                .assinatura-linha { padding-top: 3px; font-size: 8pt; margin-top: 2px; }
                
                .footer { text-align: center; margin-top: 8px; padding-top: 3px; border-top: 1px solid #ccc; font-size: 6.5pt; color: #666; }
                .footer p { margin: 1px 0; }
                .registro-info { font-size: 7.5pt; color: #666; margin-top: 6px; text-align: center; }
                
                .btn-print { display: block; margin: 10px auto; padding: 8px 20px; background: #f97316; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 12px; font-family: Arial, sans-serif; }
                
                @media print { .no-print { display: none !important; } body { padding: 0; } }
            </style>
        </head>
        <body>
            <button class="btn-print no-print" onclick="window.print()">🖨️ Imprimir</button>
            
            <div class="header">
                <img src="${logo}" alt="IEMA" onerror="this.style.display='none'">
                <h1>IEMA Pleno: São Luís - Centro</h1>
                <p>Sistema de Atendimentos — Gestão Geral</p>
            </div>
            
            <div class="titulo">🎓 Acompanhamento de Tutoria</div>
            <div class="subtitulo">${subtitulo}</div>
            
            ${statsHTML}
            ${tabelaHTML}
            
            <div class="assinaturas">
                <div class="assinatura">
                    <div class="assinatura-container-relatorio">
                        <img class="carimbo-overlay" src="${carimbo}" alt="Carimbo" onerror="this.style.display='none'">
                    </div>
                    <div class="assinatura-linha">Coordenação / Gestão Geral</div>
                </div>
            </div>
            
            <div class="registro-info">Relatório gerado em <strong>${dataGeracao}</strong></div>
            
            <div class="footer">
                <p>Documento gerado automaticamente pelo EducaPleno</p>
                <p>Setor: Gestão Geral • Protagonismo Estudantil</p>
            </div>
        </body>
        </html>`;
        
        const win = window.open('', '_blank');
        win.document.write(html);
        win.document.close();
        win.onload = () => setTimeout(() => win.print(), 500);
        
    } catch (error) {
        console.error('❌ Erro ao gerar PDF:', error);
        if (typeof notificar === 'function') {
            notificar('❌ Erro ao gerar PDF', 'error');
        }
    }
}

// ============================================
// EXPORTAR GLOBAIS
// ============================================
window.abrirAcompanhamentoTutoria = abrirAcompanhamentoTutoria;
window.carregarAcompanhamentoTutoria = carregarAcompanhamentoTutoria;
window.filtrarAcompanhamentoTutoria = filtrarAcompanhamentoTutoria;
window.debounceFiltroTutoria = debounceFiltroTutoria;
window.limparFiltrosTutoria = limparFiltrosTutoria;
window.exportarPDFTutoria = exportarPDFTutoria;

console.log('✅ [acompanhamento-tutoria.js] Carregado');