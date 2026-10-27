// ============================================================================
// MÓDULO TABLETS - Frontend (SEM dependência de Bootstrap)
// ============================================================================
// Sistema de gerenciamento de tablets com assinatura via QR Code
// ============================================================================

// ========== ESTADO GLOBAL ==========
let tabletsToken = null;
let tabletsLista = [];
let tabletsSetores = [];
let tabletsResponsaveis = [];
let tabletsCurrentTablet = null;
let tabletsSessaoAtual = null;
let tabletsSessaoMonitorInterval = null;

const tabletAssinaturaState = {
    canvas: null,
    ctx: null,
    desenhando: false,
    temAssinatura: false,
    lastX: 0,
    lastY: 0
};

// ============================================================================
// HELPERS DE MODAL (sem Bootstrap)
// ============================================================================
function abrirModalTabletNativo(modalId) {
    const el = document.getElementById(modalId);
    if (!el) {
        console.warn(`[Tablets] Modal #${modalId} não encontrado`);
        return;
    }
    el.style.display = 'flex';
    el.classList.add('show');
    document.body.style.overflow = 'hidden';
}

function fecharModalTabletNativo(modalId) {
    const el = document.getElementById(modalId);
    if (!el) return;
    el.style.display = 'none';
    el.classList.remove('show');
    document.body.style.overflow = '';
}

// ============================================================================
// INICIALIZAÇÃO
// ============================================================================
function inicializarModuloTablets() {
    tabletsToken = localStorage.getItem('auth_token');
    
    if (!tabletsToken) {
        console.warn('[Tablets] Token não encontrado');
        return;
    }
    
    console.log('📱 [Tablets] Módulo inicializado');
    
    carregarSetoresTablets();
    carregarEstatisticasTablets();
    carregarTablets();
    
    configurarFiltrosTablets();
    configurarEventosTablets();
    
    // Se veio via ?assinatura-tablet=UUID
    const urlParams = new URLSearchParams(window.location.search);
    const sessaoAssinatura = urlParams.get('assinatura-tablet');
    if (sessaoAssinatura) {
        mostrarTelaAssinaturaTablet(sessaoAssinatura);
    }
}

// ============================================================================
// CARREGAR DADOS
// ============================================================================

async function carregarSetoresTablets() {
    try {
        const response = await fetch('/api/tablets/setores', {
            headers: { 'Authorization': `Bearer ${tabletsToken}` }
        });
        const data = await response.json();
        
        if (data.success && Array.isArray(data.setores)) {
            tabletsSetores = data.setores;
            
            const selectSetor = document.getElementById('tabletSetor');
            const filtroSetor = document.getElementById('filtroTabletSetor');
            
            if (selectSetor) {
                selectSetor.innerHTML = '<option value="">Selecione...</option>';
                data.setores.forEach(s => {
                    selectSetor.innerHTML += `<option value="${s.value}">${escapeHtmlTablet(s.label)}</option>`;
                });
            }
            
            if (filtroSetor) {
                filtroSetor.innerHTML = '<option value="todos">Todos os setores</option>';
                data.setores.forEach(s => {
                    filtroSetor.innerHTML += `<option value="${s.value}">${escapeHtmlTablet(s.label)}</option>`;
                });
            }
        }
    } catch (error) {
        console.error('[Tablets] Erro ao carregar setores:', error);
    }
}

async function carregarResponsaveisTablets(setor) {
    try {
        const response = await fetch(`/api/tablets/responsaveis/${encodeURIComponent(setor)}`, {
            headers: { 'Authorization': `Bearer ${tabletsToken}` }
        });
        const data = await response.json();
        
        if (data.success && Array.isArray(data.responsaveis)) {
            tabletsResponsaveis = data.responsaveis;
            
            const selectResp = document.getElementById('tabletResponsavel');
            if (selectResp) {
                selectResp.innerHTML = '<option value="">Selecione o responsável...</option>';
                data.responsaveis.forEach(r => {
                    const extra = r.matricula ? ` • ${r.matricula}` : '';
                    selectResp.innerHTML += `<option value="${r.id}">${escapeHtmlTablet(r.nome)}${extra}</option>`;
                });
                selectResp.disabled = false;
                selectResp.style.background = 'white';
            }
        }
    } catch (error) {
        console.error('[Tablets] Erro ao carregar responsáveis:', error);
    }
}

async function carregarEstatisticasTablets() {
    try {
        const response = await fetch('/api/tablets/estatisticas', {
            headers: { 'Authorization': `Bearer ${tabletsToken}` }
        });
        const data = await response.json();
        
        if (data.success && data.estatisticas) {
            const e = data.estatisticas;
            atualizarTexto('statTabletsTotal', e.total || 0);
            atualizarTexto('statTabletsPendentes', e.porStatus.pendente || 0);
            atualizarTexto('statTabletsEntregues', e.porStatus.entregue || 0);
            atualizarTexto('statTabletsAssinados', e.assinatura.comAssinatura || 0);
            atualizarTexto('statTabletsPercentualAssinado', `${e.assinatura.percentualAssinado || 0}%`);
        }
    } catch (error) {
        console.error('[Tablets] Erro ao carregar estatísticas:', error);
    }
}

async function carregarTablets() {
    const container = document.getElementById('listaTablets');
    if (!container) return;
    
    const filtros = obterFiltrosTablets();
    const params = new URLSearchParams(filtros);
    
    container.innerHTML = `
        <div style="text-align: center; padding: 30px;">
            <div style="width: 30px; height: 30px; border: 3px solid #e5e7eb; border-top-color: #8b5cf6; border-radius: 50%; animation: spinTablet 1s linear infinite; margin: 0 auto 10px;"></div>
            <p style="color: #6b7280; margin: 0;">Carregando tablets...</p>
        </div>`;
    
    try {
        const response = await fetch(`/api/tablets?${params.toString()}`, {
            headers: { 'Authorization': `Bearer ${tabletsToken}` }
        });
        const data = await response.json();
        
        if (data.success) {
            tabletsLista = data.tablets || [];
            renderizarListaTablets(tabletsLista);
            renderizarPaginacaoTablets(data.pagination);
            atualizarContadorTablets(data.total);
        } else {
            container.innerHTML = `<div style="padding: 20px; background: #fee2e2; color: #991b1b; border-radius: 8px;">Erro: ${data.error}</div>`;
        }
    } catch (error) {
        console.error('[Tablets] Erro:', error);
        container.innerHTML = `<div style="padding: 20px; background: #fee2e2; color: #991b1b; border-radius: 8px;">Erro ao carregar tablets</div>`;
    }
}

// ============================================================================
// FILTROS
// ============================================================================

function configurarFiltrosTablets() {
    const ids = ['filtroTabletBusca', 'filtroTabletSetor', 'filtroTabletStatus', 'filtroTabletAssinado', 'filtroTabletOrdenar'];
    
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        
        if (el.tagName === 'INPUT') {
            let timeout;
            el.addEventListener('input', () => {
                clearTimeout(timeout);
                timeout = setTimeout(carregarTablets, 300);
            });
        } else {
            el.addEventListener('change', carregarTablets);
        }
    });
}

function obterFiltrosTablets() {
    return {
        busca: document.getElementById('filtroTabletBusca')?.value || '',
        setor: document.getElementById('filtroTabletSetor')?.value || 'todos',
        status: document.getElementById('filtroTabletStatus')?.value || 'todos',
        assinado: document.getElementById('filtroTabletAssinado')?.value || '',
        ordenar: document.getElementById('filtroTabletOrdenar')?.value || 'recente',
        page: 1,
        limit: 20
    };
}

function limparFiltrosTablets() {
    ['filtroTabletBusca', 'filtroTabletAssinado'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    ['filtroTabletSetor', 'filtroTabletStatus'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = 'todos';
    });
    const ordenar = document.getElementById('filtroTabletOrdenar');
    if (ordenar) ordenar.value = 'recente';
    carregarTablets();
}

// ============================================================================
// RENDERIZAÇÃO
// ============================================================================

function renderizarListaTablets(tablets) {
    const container = document.getElementById('listaTablets');
    if (!container) return;
    
    if (!tablets || tablets.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 50px 20px; color: #9ca3af;">
                <i class="fas fa-tablet-alt" style="font-size: 48px; margin-bottom: 15px; color: #d1d5db;"></i>
                <p style="margin: 0 0 15px;">Nenhum tablet encontrado</p>
                <button onclick="admin.abrirModalNovoTablet()" 
                        style="background: #8b5cf6; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer;">
                    <i class="fas fa-plus"></i> Cadastrar primeiro tablet
                </button>
            </div>`;
        return;
    }
    
    let html = `
        <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <thead>
                    <tr style="background: #f5f3ff; border-bottom: 2px solid #ddd6fe;">
                        <th style="padding: 10px; text-align: left; font-weight: 600; color: #5b21b6;">Número</th>
                        <th style="padding: 10px; text-align: left; font-weight: 600; color: #5b21b6;">Responsável</th>
                        <th style="padding: 10px; text-align: left; font-weight: 600; color: #5b21b6;">Setor</th>
                        <th style="padding: 10px; text-align: left; font-weight: 600; color: #5b21b6;">Status</th>
                        <th style="padding: 10px; text-align: left; font-weight: 600; color: #5b21b6;">Assinatura</th>
                        <th style="padding: 10px; text-align: left; font-weight: 600; color: #5b21b6;">Impressão</th>
                        <th style="padding: 10px; text-align: center; font-weight: 600; color: #5b21b6;">Ações</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    tablets.forEach(t => {
        html += renderizarLinhaTablet(t);
    });
    
    html += '</tbody></table></div>';
    container.innerHTML = html;
}

function renderizarLinhaTablet(t) {
    const statusBadge = {
        'pendente': '<span style="background: #fef3c7; color: #92400e; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;"><i class="fas fa-clock"></i> Pendente</span>',
        'entregue': '<span style="background: #d1fae5; color: #065f46; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;"><i class="fas fa-check"></i> Entregue</span>',
        'devolvido': '<span style="background: #e5e7eb; color: #374151; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;"><i class="fas fa-undo"></i> Devolvido</span>',
        'manutencao': '<span style="background: #dbeafe; color: #1e40af; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;"><i class="fas fa-wrench"></i> Manutenção</span>',
        'perdido': '<span style="background: #fee2e2; color: #991b1b; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;"><i class="fas fa-times"></i> Perdido</span>'
    }[t.status] || `<span style="background: #e5e7eb; padding: 3px 8px; border-radius: 12px; font-size: 11px;">${t.status}</span>`;
    
    const assinaturaBadge = t.termo.temAssinatura
        ? `<span style="background: #d1fae5; color: #065f46; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;" title="Assinado em ${t.termo.assinadaEm ? new Date(t.termo.assinadaEm).toLocaleString('pt-BR') : ''}">
             <i class="fas fa-signature"></i> Assinado
           </span>`
        : `<span style="background: #fef3c7; color: #92400e; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;"><i class="fas fa-exclamation"></i> Sem assinatura</span>`;
    
    const impressaoBadge = t.solicitouImpressao
        ? `<span style="background: #dbeafe; color: #1e40af; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;"><i class="fas fa-print"></i> ${t.totalImpressoes}x</span>`
        : `<span style="background: #f3f4f6; color: #6b7280; padding: 3px 8px; border-radius: 12px; font-size: 11px;"><i class="fas fa-print"></i> Não</span>`;
    
    return `
        <tr style="border-bottom: 1px solid #f3f4f6;" data-tablet-id="${t.id}">
            <td style="padding: 12px 10px;">
                <strong style="color: #7c3aed;">${escapeHtmlTablet(t.numero)}</strong>
                ${t.marca ? `<br><small style="color: #9ca3af; font-size: 11px;">${escapeHtmlTablet(t.marca)} ${escapeHtmlTablet(t.modelo)}</small>` : ''}
            </td>
            <td style="padding: 12px 10px;">
                <strong>${escapeHtmlTablet(t.responsavel.nome)}</strong>
                ${t.responsavel.matricula ? `<br><small style="color: #9ca3af; font-size: 11px;">${escapeHtmlTablet(t.responsavel.matricula)}</small>` : ''}
            </td>
            <td style="padding: 12px 10px;">
                <span style="background: #ede9fe; color: #5b21b6; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 600;">
                    ${escapeHtmlTablet(t.setorLabel)}
                </span>
            </td>
            <td style="padding: 12px 10px;">${statusBadge}</td>
            <td style="padding: 12px 10px;">${assinaturaBadge}</td>
            <td style="padding: 12px 10px;">${impressaoBadge}</td>
            <td style="padding: 12px 10px; text-align: center;">
                <div style="display: flex; gap: 4px; justify-content: center; flex-wrap: wrap;">
                    <button onclick="verTablet('${t.id}')" title="Ver detalhes"
                            style="background: #dbeafe; color: #1e40af; border: none; padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 12px;">
                        <i class="fas fa-eye"></i>
                    </button>
                    
                    ${!t.termo.temAssinatura ? `
                        <button onclick="gerarQRCodeTablet('${t.id}')" title="Gerar QR para assinatura"
                                style="background: #8b5cf6; color: white; border: none; padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 12px;">
                            <i class="fas fa-qrcode"></i> QR
                        </button>
                    ` : `
                        <button onclick="imprimirTermoTablet('${t.id}')" title="Imprimir termo"
                                style="background: #10b981; color: white; border: none; padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 12px;">
                            <i class="fas fa-print"></i>
                        </button>
                    `}
                    
                    ${t.status === 'entregue' ? `
                        <button onclick="devolverTablet('${t.id}')" title="Devolver"
                                style="background: #f59e0b; color: white; border: none; padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 12px;">
                            <i class="fas fa-undo"></i>
                        </button>
                    ` : ''}
                    
                    <button onclick="excluirTablet('${t.id}')" title="Excluir"
                            style="background: #ef4444; color: white; border: none; padding: 6px 10px; border-radius: 6px; cursor: pointer; font-size: 12px;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `;
}

function renderizarPaginacaoTablets(pagination) {
    const container = document.getElementById('paginacaoTablets');
    if (!container || !pagination) return;
    
    if (pagination.pages <= 1) {
        container.innerHTML = '';
        return;
    }
    
    let html = '<div style="display: flex; gap: 5px; align-items: center;">';
    const current = pagination.page;
    const total = pagination.pages;
    
    html += `<button onclick="mudarPaginaTablets(${current - 1})" ${current === 1 ? 'disabled' : ''}
                    style="padding: 6px 12px; border: 1px solid #e5e7eb; background: white; border-radius: 6px; cursor: ${current === 1 ? 'not-allowed' : 'pointer'}; ${current === 1 ? 'opacity: 0.5;' : ''}">
                <i class="fas fa-chevron-left"></i>
             </button>`;
    
    const inicio = Math.max(1, current - 2);
    const fim = Math.min(total, current + 2);
    
    for (let i = inicio; i <= fim; i++) {
        html += `<button onclick="mudarPaginaTablets(${i})"
                        style="padding: 6px 12px; border: 1px solid ${i === current ? '#8b5cf6' : '#e5e7eb'}; background: ${i === current ? '#8b5cf6' : 'white'}; color: ${i === current ? 'white' : '#374151'}; border-radius: 6px; cursor: pointer;">
                    ${i}
                 </button>`;
    }
    
    html += `<button onclick="mudarPaginaTablets(${current + 1})" ${current === total ? 'disabled' : ''}
                    style="padding: 6px 12px; border: 1px solid #e5e7eb; background: white; border-radius: 6px; cursor: ${current === total ? 'not-allowed' : 'pointer'}; ${current === total ? 'opacity: 0.5;' : ''}">
                <i class="fas fa-chevron-right"></i>
             </button>`;
    
    html += '</div>';
    container.innerHTML = html;
}

function mudarPaginaTablets(pagina) {
    const filtros = obterFiltrosTablets();
    filtros.page = pagina;
    const params = new URLSearchParams(filtros);
    
    fetch(`/api/tablets?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${tabletsToken}` }
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            renderizarListaTablets(data.tablets);
            renderizarPaginacaoTablets(data.pagination);
        }
    })
    .catch(err => console.error('[Tablets] Erro:', err));
}

function atualizarContadorTablets(total) {
    const el = document.getElementById('contadorTablets');
    if (el) el.textContent = total || 0;
}

// ============================================================================
// MODAL NOVO/EDITAR TABLET
// ============================================================================

function abrirModalNovoTablet() {
    const ids = ['tabletId', 'tabletNumero', 'tabletMarca', 'tabletModelo', 'tabletImei', 'tabletPatrimonio', 'tabletObservacoes'];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    
    const setor = document.getElementById('tabletSetor');
    if (setor) setor.value = '';
    
    const resp = document.getElementById('tabletResponsavel');
    if (resp) {
        resp.innerHTML = '<option value="">Selecione o setor primeiro...</option>';
        resp.disabled = true;
        resp.style.background = '#f9fafb';
    }
    
    const titulo = document.getElementById('modalNovoTabletTitulo');
    if (titulo) titulo.innerHTML = '<i class="fas fa-plus"></i> Novo Tablet';
    
    abrirModalTabletNativo('modalTablet');
}

function fecharModalTablet() {
    fecharModalTabletNativo('modalTablet');
}

// ============================================================================
// SALVAR
// ============================================================================

async function salvarTablet() {
    const id = document.getElementById('tabletId')?.value;
    const setorSelect = document.getElementById('tabletSetor');
    
    const dados = {
        numero: document.getElementById('tabletNumero')?.value?.trim(),
        marca: document.getElementById('tabletMarca')?.value?.trim(),
        modelo: document.getElementById('tabletModelo')?.value?.trim(),
        imei: document.getElementById('tabletImei')?.value?.trim(),
        patrimonio: document.getElementById('tabletPatrimonio')?.value?.trim(),
        setor: setorSelect?.value,
        setorLabel: tabletsSetores.find(s => s.value === setorSelect?.value)?.label || '',
        responsavelId: document.getElementById('tabletResponsavel')?.value,
        observacoes: document.getElementById('tabletObservacoes')?.value?.trim()
    };
    
    if (!dados.numero) {
        mostrarToastTablet('Número do tablet é obrigatório', 'error');
        return;
    }
    if (!dados.setor) {
        mostrarToastTablet('Selecione o setor', 'error');
        return;
    }
    if (!dados.responsavelId) {
        mostrarToastTablet('Selecione o responsável', 'error');
        return;
    }
    
    const btn = document.getElementById('btnSalvarTablet');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
    
    try {
        const url = id ? `/api/tablets/${id}` : '/api/tablets';
        const method = id ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${tabletsToken}`
            },
            body: JSON.stringify(dados)
        });
        
        const data = await response.json();
        
        if (data.success) {
            fecharModalTablet();
            mostrarToastTablet(`✅ ${data.message}`, 'success');
            carregarTablets();
            carregarEstatisticasTablets();
        } else {
            mostrarToastTablet('❌ ' + (data.error || 'Erro ao salvar'), 'error');
        }
    } catch (error) {
        console.error('[Tablets] Erro ao salvar:', error);
        mostrarToastTablet('Erro ao salvar tablet', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save"></i> Salvar';
    }
}

// ============================================================================
// VER TABLET
// ============================================================================

async function verTablet(id) {
    try {
        const response = await fetch(`/api/tablets/${id}`, {
            headers: { 'Authorization': `Bearer ${tabletsToken}` }
        });
        const data = await response.json();
        
        if (!data.success) {
            mostrarToastTablet('Erro ao carregar tablet', 'error');
            return;
        }
        
        const t = data.tablet;
        tabletsCurrentTablet = t;
        
        const statusBadge = {
            'pendente': '<span style="background: #fef3c7; color: #92400e; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 600;">Pendente</span>',
            'entregue': '<span style="background: #d1fae5; color: #065f46; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 600;">Entregue</span>',
            'devolvido': '<span style="background: #e5e7eb; color: #374151; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 600;">Devolvido</span>',
            'manutencao': '<span style="background: #dbeafe; color: #1e40af; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 600;">Manutenção</span>',
            'perdido': '<span style="background: #fee2e2; color: #991b1b; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 600;">Perdido</span>'
        }[t.status] || t.status;
        
        const assinaturaHtml = t.termo.temAssinatura
            ? `<div style="background: #f0fdf4; padding: 15px; border-radius: 10px; border-left: 4px solid #10b981;">
                 <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                     <i class="fas fa-check-circle" style="color: #10b981; font-size: 22px;"></i>
                     <div>
                         <strong style="color: #065f46;">Assinatura registrada</strong>
                         <p style="margin: 3px 0 0; font-size: 13px; color: #047857;">
                             Por ${escapeHtmlTablet(t.termo.assinadaPorNome || '-')}
                             ${t.termo.assinadaEm ? ` em ${new Date(t.termo.assinadaEm).toLocaleString('pt-BR')}` : ''}
                         </p>
                     </div>
                 </div>
                 ${t.termo.assinaturaBase64 ? `
                     <div style="background: white; padding: 10px; border-radius: 8px; text-align: center;">
                         <img src="${t.termo.assinaturaBase64}" style="max-width: 100%; max-height: 80px;" alt="Assinatura">
                     </div>
                 ` : ''}
               </div>`
            : `<div style="background: #fef3c7; padding: 15px; border-radius: 10px; border-left: 4px solid #f59e0b;">
                 <i class="fas fa-exclamation-triangle" style="color: #d97706;"></i>
                 <strong style="color: #92400e; margin-left: 8px;">Aguardando assinatura</strong>
                 <p style="margin: 4px 0 0; font-size: 13px; color: #78350f;">
                     Gere o QR Code para o responsável assinar o termo de entrega.
                 </p>
               </div>`;
        
        const conteudo = document.getElementById('conteudoVerTablet');
        conteudo.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                <div>
                    <label style="color: #6b7280; font-size: 12px; display: block; margin-bottom: 4px;">Número</label>
                    <div><strong style="font-size: 16px; color: #7c3aed;">${escapeHtmlTablet(t.numero)}</strong></div>
                </div>
                <div>
                    <label style="color: #6b7280; font-size: 12px; display: block; margin-bottom: 4px;">Status</label>
                    <div>${statusBadge}</div>
                </div>
                <div>
                    <label style="color: #6b7280; font-size: 12px; display: block; margin-bottom: 4px;">Marca/Modelo</label>
                    <div>${escapeHtmlTablet(t.marca || '-')} ${escapeHtmlTablet(t.modelo || '')}</div>
                </div>
                <div>
                    <label style="color: #6b7280; font-size: 12px; display: block; margin-bottom: 4px;">IMEI</label>
                    <div>${escapeHtmlTablet(t.imei || '-')}</div>
                </div>
                <div>
                    <label style="color: #6b7280; font-size: 12px; display: block; margin-bottom: 4px;">Patrimônio</label>
                    <div>${escapeHtmlTablet(t.patrimonio || '-')}</div>
                </div>
                <div>
                    <label style="color: #6b7280; font-size: 12px; display: block; margin-bottom: 4px;">Setor</label>
                    <div><strong>${escapeHtmlTablet(t.setorLabel)}</strong></div>
                </div>
                
                <div style="grid-column: 1 / -1; border-top: 1px solid #e5e7eb; padding-top: 15px; margin-top: 5px;">
                    <h6 style="color: #7c3aed; margin: 0 0 12px;"><i class="fas fa-user"></i> Responsável</h6>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                        <div>
                            <label style="color: #6b7280; font-size: 12px; display: block; margin-bottom: 4px;">Nome</label>
                            <div><strong>${escapeHtmlTablet(t.responsavel.nome)}</strong></div>
                        </div>
                        <div>
                            <label style="color: #6b7280; font-size: 12px; display: block; margin-bottom: 4px;">Email</label>
                            <div>${escapeHtmlTablet(t.responsavel.email || '-')}</div>
                        </div>
                        <div>
                            <label style="color: #6b7280; font-size: 12px; display: block; margin-bottom: 4px;">Matrícula</label>
                            <div>${escapeHtmlTablet(t.responsavel.matricula || '-')}</div>
                        </div>
                        <div>
                            <label style="color: #6b7280; font-size: 12px; display: block; margin-bottom: 4px;">Cargo/Departamento</label>
                            <div>${escapeHtmlTablet(t.responsavel.cargo || t.responsavel.role || '-')}</div>
                        </div>
                    </div>
                </div>
                
                <div style="grid-column: 1 / -1; border-top: 1px solid #e5e7eb; padding-top: 15px; margin-top: 5px;">
                    <h6 style="color: #7c3aed; margin: 0 0 12px;"><i class="fas fa-signature"></i> Termo de Entrega</h6>
                    ${assinaturaHtml}
                </div>
                
                ${t.observacoes ? `
                    <div style="grid-column: 1 / -1; border-top: 1px solid #e5e7eb; padding-top: 15px; margin-top: 5px;">
                        <label style="color: #6b7280; font-size: 12px; display: block; margin-bottom: 6px;">Observações</label>
                        <div style="background: #f9fafb; padding: 12px; border-radius: 8px; font-size: 13px;">
                            ${escapeHtmlTablet(t.observacoes)}
                        </div>
                    </div>
                ` : ''}
                
                <div style="grid-column: 1 / -1; border-top: 1px solid #e5e7eb; padding-top: 15px; margin-top: 5px;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                        <div>
                            <label style="color: #6b7280; font-size: 12px; display: block; margin-bottom: 4px;">Registrado por</label>
                            <div>${escapeHtmlTablet(t.registradoPorNome)}</div>
                        </div>
                        <div>
                            <label style="color: #6b7280; font-size: 12px; display: block; margin-bottom: 4px;">Data de Registro</label>
                            <div>${t.createdAt ? new Date(t.createdAt).toLocaleString('pt-BR') : '-'}</div>
                        </div>
                        ${t.dataEntrega ? `
                            <div>
                                <label style="color: #6b7280; font-size: 12px; display: block; margin-bottom: 4px;">Data de Entrega</label>
                                <div>${new Date(t.dataEntrega).toLocaleString('pt-BR')}</div>
                            </div>
                        ` : ''}
                        ${t.dataDevolucao ? `
                            <div>
                                <label style="color: #6b7280; font-size: 12px; display: block; margin-bottom: 4px;">Data de Devolução</label>
                                <div>${new Date(t.dataDevolucao).toLocaleString('pt-BR')}</div>
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>`;
        
        const footer = document.getElementById('footerVerTablet');
        footer.innerHTML = `
            <button onclick="fecharModalVerTablet()" 
                    style="padding: 10px 20px; background: #f3f4f6; color: #374151; border: 1px solid #e5e7eb; border-radius: 8px; cursor: pointer; font-weight: 600;">
                <i class="fas fa-times"></i> Fechar
            </button>
            ${!t.termo.temAssinatura ? `
                <button onclick="fecharModalVerTablet(); gerarQRCodeTablet('${t.id}')" 
                        style="padding: 10px 20px; background: #8b5cf6; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">
                    <i class="fas fa-qrcode"></i> Gerar QR Code
                </button>
            ` : `
                <button onclick="imprimirTermoTablet('${t.id}')" 
                        style="padding: 10px 20px; background: #10b981; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">
                    <i class="fas fa-print"></i> Imprimir Termo
                </button>
            `}
            <button onclick="fecharModalVerTablet(); abrirEdicaoTablet('${t.id}')" 
                    style="padding: 10px 20px; background: #f59e0b; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">
                <i class="fas fa-edit"></i> Editar
            </button>`;
        
        abrirModalTabletNativo('modalVerTablet');
        
    } catch (error) {
        console.error('[Tablets] Erro ao ver:', error);
        mostrarToastTablet('Erro ao carregar detalhes', 'error');
    }
}

function fecharModalVerTablet() {
    fecharModalTabletNativo('modalVerTablet');
}

// ============================================================================
// EDITAR
// ============================================================================

async function abrirEdicaoTablet(id) {
    try {
        const response = await fetch(`/api/tablets/${id}`, {
            headers: { 'Authorization': `Bearer ${tabletsToken}` }
        });
        const data = await response.json();
        
        if (!data.success) {
            mostrarToastTablet('Erro ao carregar', 'error');
            return;
        }
        
        const t = data.tablet;
        
        document.getElementById('tabletId').value = t.id;
        document.getElementById('tabletNumero').value = t.numero;
        document.getElementById('tabletMarca').value = t.marca || '';
        document.getElementById('tabletModelo').value = t.modelo || '';
        document.getElementById('tabletImei').value = t.imei || '';
        document.getElementById('tabletPatrimonio').value = t.patrimonio || '';
        document.getElementById('tabletObservacoes').value = t.observacoes || '';
        document.getElementById('tabletSetor').value = t.setor;
        
        await carregarResponsaveisTablets(t.setor);
        
        setTimeout(() => {
            const resp = document.getElementById('tabletResponsavel');
            if (resp) resp.value = t.responsavel.id;
        }, 300);
        
        const titulo = document.getElementById('modalNovoTabletTitulo');
        if (titulo) titulo.innerHTML = '<i class="fas fa-edit"></i> Editar Tablet';
        
        abrirModalTabletNativo('modalTablet');
        
    } catch (error) {
        console.error('[Tablets] Erro ao editar:', error);
    }
}

// ============================================================================
// QR CODE
// ============================================================================

async function gerarQRCodeTablet(id) {
    try {
        const response = await fetch(`/api/tablets/${id}/reenviar-qrcode`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${tabletsToken}` }
        });
        const data = await response.json();
        
        if (!data.success) {
            mostrarToastTablet('❌ ' + (data.error || 'Erro'), 'error');
            return;
        }
        
        tabletsSessaoAtual = data.sessaoId;
        
        const tabletRes = await fetch(`/api/tablets/${id}`, {
            headers: { 'Authorization': `Bearer ${tabletsToken}` }
        });
        const tabletData = await tabletRes.json();
        
        if (!tabletData.success) {
            mostrarToastTablet('Erro ao carregar tablet', 'error');
            return;
        }
        
        const tablet = tabletData.tablet;
        const urlAssinatura = `${window.location.origin}/admin.html?assinatura-tablet=${data.sessaoId}`;
        
        let qrUrl;
        try {
            const qrRes = await fetch('/api/qrcode/gerar', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${tabletsToken}`
                },
                body: JSON.stringify({ url: urlAssinatura })
            });
            const qrData = await qrRes.json();
            if (qrData.success && qrData.qrCode) {
                qrUrl = qrData.qrCode;
            }
        } catch (e) {
            console.warn('Fallback QR');
        }
        
        if (!qrUrl) {
            qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(urlAssinatura)}`;
        }
        
        abrirModalQRTablet(tablet, qrUrl, urlAssinatura, data.expiraEm);
        iniciarMonitoramentoTablet(data.sessaoId);
        
    } catch (error) {
        console.error('[Tablets] Erro ao gerar QR:', error);
        mostrarToastTablet('Erro ao gerar QR Code', 'error');
    }
}

function abrirModalQRTablet(tablet, qrUrl, urlAssinatura, expiraEm) {
    const elNumero = document.getElementById('qrTabletNumero');
    const elResp = document.getElementById('qrTabletResponsavel');
    const elSetor = document.getElementById('qrTabletSetor');
    const elImg = document.getElementById('qrTabletImagem');
    const elLink = document.getElementById('qrTabletLink');
    const elExpira = document.getElementById('qrTabletExpira');
    
    if (elNumero) elNumero.textContent = tablet.numero;
    if (elResp) elResp.textContent = tablet.responsavel.nome;
    if (elSetor) elSetor.textContent = tablet.setorLabel;
    if (elImg) elImg.src = qrUrl;
    if (elLink) elLink.value = urlAssinatura;
    
    if (elExpira) {
        const expiraFormatado = expiraEm ? new Date(expiraEm).toLocaleTimeString('pt-BR') : '';
        elExpira.textContent = expiraFormatado ? `Expira às ${expiraFormatado}` : '';
    }
    
    abrirModalTabletNativo('modalQRTablet');
}

function fecharModalQRTablet() {
    fecharModalTabletNativo('modalQRTablet');
}

function copiarLinkTablet() {
    const input = document.getElementById('qrTabletLink');
    if (!input) return;
    
    navigator.clipboard.writeText(input.value).then(() => {
        mostrarToastTablet('✅ Link copiado!', 'success');
    }).catch(() => {
        input.select();
        document.execCommand('copy');
        mostrarToastTablet('✅ Link copiado!', 'success');
    });
}

function cancelarSessaoTablet() {
    if (tabletsSessaoAtual) {
        fetch(`/api/sessoes-assinatura/${tabletsSessaoAtual}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${tabletsToken}` }
        }).catch(e => console.warn(e));
    }
    pararMonitoramentoTablet();
    fecharModalQRTablet();
    mostrarToastTablet('Sessão cancelada', 'info');
}

function iniciarMonitoramentoTablet(sessaoId) {
    pararMonitoramentoTablet();
    
    tabletsSessaoMonitorInterval = setInterval(async () => {
        try {
            const response = await fetch(`/api/sessoes-assinatura/${sessaoId}`);
            if (!response.ok) return;
            
            const data = await response.json();
            if (!data.success) return;
            
            if (data.sessao.status === 'assinado') {
                pararMonitoramentoTablet();
                fecharModalQRTablet();
                mostrarToastTablet('✅ Assinatura capturada com sucesso!', 'success');
                carregarTablets();
                carregarEstatisticasTablets();
            } else if (data.sessao.status === 'cancelado') {
                pararMonitoramentoTablet();
                fecharModalQRTablet();
                mostrarToastTablet('Sessão cancelada', 'info');
            }
        } catch (e) {
            console.warn('[Tablets] Erro no monitoramento:', e);
        }
    }, 3000);
}

function pararMonitoramentoTablet() {
    if (tabletsSessaoMonitorInterval) {
        clearInterval(tabletsSessaoMonitorInterval);
        tabletsSessaoMonitorInterval = null;
    }
}

// ============================================================================
// IMPRESSÃO
// ============================================================================

async function imprimirTermoTablet(id) {
    try {
        const response = await fetch(`/api/tablets/${id}`, {
            headers: { 'Authorization': `Bearer ${tabletsToken}` }
        });
        const data = await response.json();
        
        if (!data.success) {
            mostrarToastTablet('Erro ao carregar tablet', 'error');
            return;
        }
        
        const t = data.tablet;
        
        if (!t.termo.temAssinatura) {
            mostrarToastTablet('⚠️ O tablet precisa estar assinado antes de imprimir', 'warning');
            return;
        }
        
        fetch(`/api/tablets/${id}/imprimir`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${tabletsToken}` }
        }).catch(err => console.warn(err));
        
        const html = gerarHTMLTermoTablet(t);
        
        const win = window.open('', '_blank');
        win.document.write(html);
        win.document.close();
        win.onload = () => setTimeout(() => win.print(), 500);
        
    } catch (error) {
        console.error('[Tablets] Erro ao imprimir:', error);
        mostrarToastTablet('Erro ao gerar termo', 'error');
    }
}

function gerarHTMLTermoTablet(t) {
    const logo = '/uploads/logo-iema.png';
    const dataGeracao = new Date().toLocaleString('pt-BR');
    const dataAssinatura = t.termo?.assinadaEm 
        ? new Date(t.termo.assinadaEm).toLocaleString('pt-BR') 
        : '-';
    const dataEntrega = t.dataEntrega 
        ? new Date(t.dataEntrega).toLocaleDateString('pt-BR') 
        : new Date().toLocaleDateString('pt-BR');

    const statusInfo = {
        'pendente':   { label: 'PENDENTE',   cor: '#d97706' },
        'entregue':   { label: 'ENTREGUE',   cor: '#059669' },
        'devolvido':  { label: 'DEVOLVIDO',  cor: '#4b5563' },
        'manutencao': { label: 'MANUTENÇÃO', cor: '#2563eb' },
        'perdido':    { label: 'PERDIDO',    cor: '#dc2626' }
    }[t.status] || { label: (t.status || 'N/A').toUpperCase(), cor: '#4b5563' };

    const temAssinatura = t.termo?.temAssinatura === true;

    return `<!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <title>Termo - Tablet ${escapeHtmlTablet(t.numero)}</title>
        <style>
            /* 🔥 CONFIGURAÇÃO A4 - TRAVA ABSOLUTA */
            @page {
                size: A4 portrait;
                margin: 12mm;
            }

            * {
                box-sizing: border-box;
                margin: 0;
                padding: 0;
                -webkit-text-size-adjust: none !important;
                text-size-adjust: none !important;
            }

            /* 🔥 TRAVA TUDO EM PIXELS (não usa pt, não amplia) */
            html {
                font-size: 13px !important;
                zoom: 1 !important;
            }

            body {
                font-family: Arial, Helvetica, sans-serif !important;
                font-size: 13px !important;
                line-height: 1.35 !important;
                color: #000 !important;
                background: #fff !important;
                padding: 0 !important;
                margin: 0 !important;
                font-weight: normal !important;
                text-transform: none !important;
                letter-spacing: normal !important;
                zoom: 1 !important;
            }

            p, span, div, td, th, li, ul, ol, label, strong, b, i, em, small {
                font-size: 13px !important;
                font-family: Arial, Helvetica, sans-serif !important;
                text-transform: none !important;
                letter-spacing: normal !important;
            }

            /* ===== HEADER ===== */
            .header {
                text-align: center;
                border-bottom: 2px solid #000;
                padding-bottom: 6px;
                margin-bottom: 10px;
            }
            .header img {
                max-width: 100%;
                max-height: 18mm;
                display: block;
                margin: 0 auto 4px;
            }
            .header h1 {
                font-size: 14px !important;
                font-weight: bold;
                margin: 3px 0 0;
                text-transform: uppercase;
            }
            .header p {
                font-size: 11px !important;
                margin: 2px 0 0;
                color: #333;
            }

            /* ===== TÍTULO ===== */
            .titulo {
                text-align: center;
                font-size: 15px !important;
                font-weight: bold;
                background: #ede9fe;
                padding: 6px;
                border: 2px solid #000;
                margin: 10px 0 10px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            /* ===== STATUS BANNER ===== */
            .status-banner {
                text-align: center;
                padding: 8px 12px;
                margin-bottom: 12px;
                border-radius: 5px;
                border: 2px solid ${statusInfo.cor};
                background: ${statusInfo.cor}12;
                font-size: 13px !important;
                font-weight: bold;
                color: ${statusInfo.cor};
                text-transform: uppercase;
            }
            .status-banner .badge-assinatura {
                display: inline-block;
                margin-left: 12px;
                padding: 2px 8px;
                border-radius: 20px;
                background: ${temAssinatura ? '#d1fae5' : '#fef3c7'};
                color: ${temAssinatura ? '#065f46' : '#92400e'};
                font-size: 11px !important;
                font-weight: 600;
                text-transform: none;
            }

            /* ===== SEÇÕES ===== */
            .section-title {
                font-size: 12px !important;
                font-weight: bold;
                background: #e5e7eb;
                padding: 4px 8px;
                border-left: 4px solid #8b5cf6;
                margin: 10px 0 6px;
                text-transform: uppercase;
            }

            /* ===== TABELA ===== */
            .info-table {
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 10px;
            }
            .info-table td {
                padding: 4px 6px;
                border: 1px solid #999;
                font-size: 12px !important;
            }
            .info-table td.label {
                background: #f5f3ff;
                font-weight: bold;
                width: 30%;
            }
            .info-table td .status-tag {
                display: inline-block;
                padding: 1px 6px;
                border-radius: 3px;
                background: ${statusInfo.cor};
                color: #fff;
                font-weight: bold;
                font-size: 11px !important;
            }

            /* ===== CLÁUSULAS ===== */
            .clausulas {
                text-align: justify;
                margin: 8px 0;
            }
            .clausulas p {
                margin-bottom: 6px;
                font-size: 12px !important;
            }
            .clausulas ul {
                margin-bottom: 6px;
                margin-left: 18px;
            }
            .clausulas li {
                margin-bottom: 2px;
                font-size: 12px !important;
            }

            /* ===== DATA LOCAL ===== */
            .data-local {
                text-align: right;
                margin: 20px 0 10px;
                font-size: 12px !important;
            }

            /* ===== ASSINATURAS ===== */
            .assinaturas {
                display: flex;
                justify-content: space-around;
                margin-top: 30px;
                gap: 30px;
                page-break-inside: avoid;
            }
            .assinatura {
                flex: 0 0 42%;
                text-align: center;
            }
            .assinatura-container {
                min-height: 20mm;
                display: flex;
                align-items: flex-end;
                justify-content: center;
            }
            .assinatura-img {
                max-height: 14mm;
                max-width: 100%;
                object-fit: contain;
                margin-bottom: 3px;
            }
            .assinatura-linha {
                border-top: 1px solid #000;
                padding-top: 5px;
                margin-top: 2px;
                font-size: 11px !important;
            }

            /* ===== OBS ===== */
            .obs-box {
                background: #f9fafb;
                border: 1px solid #d1d5db;
                border-radius: 3px;
                padding: 6px 8px;
                font-size: 12px !important;
                margin-bottom: 10px;
            }

            /* ===== FOOTER ===== */
            .footer {
                text-align: center;
                margin-top: 15px;
                padding-top: 6px;
                border-top: 1px solid #ccc;
                font-size: 10px !important;
                color: #555;
            }

            /* ===== BOTÃO ===== */
            .btn-print {
                display: block;
                margin: 10px auto;
                padding: 8px 22px;
                background: #8b5cf6;
                color: white;
                border: none;
                border-radius: 5px;
                font-weight: bold;
                cursor: pointer;
                font-size: 13px !important;
                font-family: Arial, sans-serif !important;
            }
            .btn-print:hover { background: #7c3aed; }

            @media print {
                .no-print { display: none !important; }
                html, body {
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                }
            }
        </style>
    </head>
    <body>
        <button class="btn-print no-print" onclick="window.print()">🖨️ Imprimir</button>

        <!-- HEADER -->
        <div class="header">
            <img src="${logo}" alt="IEMA" onerror="this.style.display='none'">
            <h1>IEMA Pleno: São Luís - Centro</h1>
            <p>Sistema de Gestão de Tablets</p>
        </div>

        <!-- TÍTULO -->
        <div class="titulo">📱 Termo de Entrega de Tablet</div>

        <!-- STATUS -->
        <div class="status-banner">
            Status: ${statusInfo.label}
            <span class="badge-assinatura">
                ${temAssinatura ? '✅ Assinado' : '⚠️ Sem Assinatura'}
            </span>
        </div>

        <!-- IDENTIFICAÇÃO -->
        <div class="section-title">📋 Identificação do Equipamento</div>
        <table class="info-table">
            <tr>
                <td class="label">Número do Tablet:</td>
                <td><strong>${escapeHtmlTablet(t.numero)}</strong></td>
            </tr>
            ${t.marca ? `<tr><td class="label">Marca:</td><td>${escapeHtmlTablet(t.marca)}</td></tr>` : ''}
            ${t.modelo ? `<tr><td class="label">Modelo:</td><td>${escapeHtmlTablet(t.modelo)}</td></tr>` : ''}
            ${t.imei ? `<tr><td class="label">IMEI:</td><td>${escapeHtmlTablet(t.imei)}</td></tr>` : ''}
            ${t.patrimonio ? `<tr><td class="label">Patrimônio:</td><td>${escapeHtmlTablet(t.patrimonio)}</td></tr>` : ''}
            <tr>
                <td class="label">Setor:</td>
                <td>${escapeHtmlTablet(t.setorLabel || t.setor)}</td>
            </tr>
            <tr>
                <td class="label">Status:</td>
                <td><span class="status-tag">${statusInfo.label}</span></td>
            </tr>
            <tr>
                <td class="label">Data de Entrega:</td>
                <td>${dataEntrega}</td>
            </tr>
            <tr>
                <td class="label">Assinatura:</td>
                <td>${temAssinatura ? '✅ Registrada' : '⚠️ Pendente'}</td>
            </tr>
        </table>

        <!-- RESPONSÁVEL -->
        <div class="section-title">👤 Responsável pelo Recebimento</div>
        <table class="info-table">
            <tr>
                <td class="label">Nome:</td>
                <td><strong>${escapeHtmlTablet(t.responsavel.nome)}</strong></td>
            </tr>
            ${t.responsavel.matricula ? `<tr><td class="label">Matrícula:</td><td>${escapeHtmlTablet(t.responsavel.matricula)}</td></tr>` : ''}
            ${t.responsavel.email ? `<tr><td class="label">Email:</td><td>${escapeHtmlTablet(t.responsavel.email)}</td></tr>` : ''}
            ${t.responsavel.cargo ? `<tr><td class="label">Cargo:</td><td>${escapeHtmlTablet(t.responsavel.cargo)}</td></tr>` : ''}
        </table>

        <!-- OBSERVAÇÕES -->
        ${t.observacoes ? `
            <div class="section-title">💬 Observações</div>
            <div class="obs-box">${escapeHtmlTablet(t.observacoes).replace(/\n/g, '<br>')}</div>
        ` : ''}

        <!-- CLÁUSULAS -->
        <div class="section-title">📜 Termos e Condições</div>
        <div class="clausulas">
            <p><strong>1. OBJETO</strong> — O presente termo tem por objeto a entrega, em regime de comodato, do tablet descrito acima ao responsável identificado, para uso exclusivo em atividades pedagógicas e administrativas do IEMA Pleno São Luís - Centro.</p>
            <p><strong>2. RESPONSABILIDADES DO RECEBEDOR</strong> — O recebedor se compromete a:</p>
            <ul>
                <li>Zelar pela integridade física do equipamento;</li>
                <li>Utilizar o tablet exclusivamente para fins educacionais e institucionais;</li>
                <li>Comunicar imediatamente qualquer dano, defeito ou extravio;</li>
                <li>Devolver o equipamento quando solicitado ou ao término das atividades;</li>
                <li>Não realizar empréstimos do equipamento a terceiros sem autorização;</li>
                <li>Manter o equipamento em local seguro quando não estiver em uso.</li>
            </ul>
            <p><strong>3. DO EQUIPAMENTO</strong> — O tablet é de propriedade do IEMA Pleno São Luís - Centro, sendo cedido em regime de comodato, não podendo ser vendido, transferido ou alienado sob qualquer forma.</p>
            <p><strong>4. RESPONSABILIDADE POR DANOS</strong> — Em caso de dano, perda ou roubo, o recebedor deverá comunicar imediatamente à gestão, ficando responsável pelas providências cabíveis conforme regulamento interno.</p>
            <p><strong>5. DEVOLUÇÃO</strong> — O equipamento deverá ser devolvido nas mesmas condições em que foi recebido, salvo desgaste natural pelo uso, quando solicitado pela instituição.</p>
            <p><strong>6. VIGÊNCIA</strong> — Este termo entra em vigor na data da assinatura e permanece válido enquanto o equipamento estiver sob a responsabilidade do recebedor.</p>
        </div>

        <!-- DATA -->
        <div class="data-local">São Luís - MA, ${dataEntrega}</div>

        <!-- ASSINATURAS -->
        <div class="assinaturas">
            <div class="assinatura">
                <div class="assinatura-container">
                    ${t.termo?.assinaturaBase64 
                        ? `<img class="assinatura-img" src="${t.termo.assinaturaBase64}" alt="Assinatura">` 
                        : ''}
                </div>
                <div class="assinatura-linha">
                    <strong>${escapeHtmlTablet(t.termo?.assinadaPorNome || t.responsavel.nome)}</strong><br>
                    Recebedor
                    ${t.termo?.assinadaEm 
                        ? `<br><small style="font-size: 10px !important;">Assinado em ${dataAssinatura}</small>` 
                        : ''}
                </div>
            </div>
            <div class="assinatura">
                <div class="assinatura-container"></div>
                <div class="assinatura-linha">
                    <strong>${escapeHtmlTablet(t.registradoPorNome || 'Administração')}</strong><br>
                    Entregador / Administração
                </div>
            </div>
        </div>

        <!-- FOOTER -->
        <div class="footer">
            <p>Documento gerado em <strong>${dataGeracao}</strong> pelo EducaPleno</p>
            <p>Este termo é de uso institucional e possui validade legal</p>
        </div>
    </body>
    </html>`;
}

// ============================================================================
// DEVOLVER / EXCLUIR
// ============================================================================

async function devolverTablet(id) {
    const confirmar = confirm('Confirmar devolução do tablet?');
    if (!confirmar) return;
    
    const motivo = prompt('Motivo da devolução (opcional):', '');
    
    try {
        const response = await fetch(`/api/tablets/${id}/devolver`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${tabletsToken}`
            },
            body: JSON.stringify({ motivo: motivo || '' })
        });
        const data = await response.json();
        
        if (data.success) {
            mostrarToastTablet('✅ Tablet devolvido!', 'success');
            carregarTablets();
            carregarEstatisticasTablets();
        } else {
            mostrarToastTablet('❌ ' + data.error, 'error');
        }
    } catch (error) {
        mostrarToastTablet('Erro ao devolver', 'error');
    }
}

async function excluirTablet(id) {
    const tablet = tabletsLista.find(t => t.id === id);
    if (!tablet) {
        mostrarToastTablet('❌ Tablet não encontrado', 'error');
        return;
    }
    
    const temAssinatura = tablet.termo?.temAssinatura === true;
    
    // ==========================================
    // 🔥 FLUXO 1: SEM assinatura → confirmação simples
    // ==========================================
    if (!temAssinatura) {
        const confirmar1 = confirm(`⚠️ Tem certeza que deseja EXCLUIR o tablet ${tablet.numero}?`);
        if (!confirmar1) return;
        
        const confirmar2 = confirm('⚠️ ÚLTIMA CONFIRMAÇÃO!\n\nEsta ação não pode ser desfeita.');
        if (!confirmar2) return;
        
        try {
            const response = await fetch(`/api/tablets/${id}`, {
                method: 'DELETE',
                headers: { 
                    'Authorization': `Bearer ${tabletsToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({})
            });
            const data = await response.json();
            
            if (data.success) {
                mostrarToastTablet('✅ Tablet excluído!', 'success');
                carregarTablets();
                carregarEstatisticasTablets();
            } else {
                mostrarToastTablet('❌ ' + data.error, 'error');
            }
        } catch (error) {
            mostrarToastTablet('Erro ao excluir', 'error');
        }
        return;
    }
    
    // ==========================================
    // 🔥 FLUXO 2: COM assinatura → exige digitar "EXCLUIR"
    // ==========================================
    abrirModalExclusaoForçada(tablet);
}

// ==========================================
// MODAL DE EXCLUSÃO FORÇADA (para tablets assinados)
// ==========================================
function abrirModalExclusaoForçada(tablet) {
    // Remove modal anterior se existir
    const anterior = document.getElementById('modalExclusaoTablet');
    if (anterior) anterior.remove();
    
    const dataAssinatura = tablet.termo?.assinadaEm 
        ? new Date(tablet.termo.assinadaEm).toLocaleString('pt-BR')
        : '-';
    
    const modalHtml = `
        <div class="modal" id="modalExclusaoTablet" style="display: flex;">
            <div class="modal-content" style="max-width: 520px;">
                <div class="modal-header" style="background: linear-gradient(135deg, #dc2626, #991b1b); color: white;">
                    <h2 style="margin: 0; font-size: 18px; display: flex; align-items: center; gap: 10px;">
                        <i class="fas fa-exclamation-triangle"></i>
                        Exclusão Forçada
                    </h2>
                    <button class="modal-close" onclick="fecharModalExclusaoTablet()" style="color: white;">&times;</button>
                </div>
                
                <div class="modal-body">
                    <div style="background: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                        <div style="display: flex; align-items: start; gap: 12px;">
                            <i class="fas fa-shield-alt" style="color: #dc2626; font-size: 24px; margin-top: 2px;"></i>
                            <div>
                                <strong style="color: #991b1b; font-size: 15px;">⚠️ ATENÇÃO!</strong>
                                <p style="margin: 6px 0 0; font-size: 13px; color: #7f1d1d; line-height: 1.5;">
                                    Este tablet <strong>já possui assinatura registrada</strong> por 
                                    <strong>${escapeHtmlTablet(tablet.termo?.assinadaPorNome || '-')}</strong> 
                                    em ${dataAssinatura}.
                                </p>
                            </div>
                        </div>
                    </div>
                    
                    <div style="background: #f9fafb; border-radius: 10px; padding: 15px; margin-bottom: 20px;">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px;">
                            <div>
                                <span style="color: #6b7280;">Tablet:</span>
                                <strong style="display: block; color: #1f2937;">${escapeHtmlTablet(tablet.numero)}</strong>
                            </div>
                            <div>
                                <span style="color: #6b7280;">Responsável:</span>
                                <strong style="display: block; color: #1f2937;">${escapeHtmlTablet(tablet.responsavel.nome)}</strong>
                            </div>
                            <div>
                                <span style="color: #6b7280;">Setor:</span>
                                <strong style="display: block; color: #1f2937;">${escapeHtmlTablet(tablet.setorLabel)}</strong>
                            </div>
                            <div>
                                <span style="color: #6b7280;">Status:</span>
                                <strong style="display: block; color: #1f2937;">${escapeHtmlTablet((tablet.status || '').toUpperCase())}</strong>
                            </div>
                        </div>
                    </div>
                    
                    <div style="background: #fef3c7; border: 1px solid #fbbf24; border-radius: 10px; padding: 15px; margin-bottom: 20px;">
                        <p style="margin: 0; font-size: 13px; color: #78350f; line-height: 1.5;">
                            <strong>📋 Ao excluir este tablet:</strong><br>
                            • A assinatura registrada será <strong>PERDIDA</strong><br>
                            • O termo não poderá mais ser impresso<br>
                            • O histórico será removido permanentemente<br>
                            • Esta ação <strong>NÃO PODE SER DESFEITA</strong>
                        </p>
                    </div>
                    
                    <div style="background: white; border: 2px solid #fecaca; border-radius: 10px; padding: 15px;">
                        <label style="display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 8px;">
                            🔒 Para confirmar, digite a palavra abaixo:
                        </label>
                        <div style="text-align: center; margin-bottom: 12px;">
                            <code style="background: #fee2e2; color: #991b1b; padding: 6px 16px; border-radius: 6px; font-size: 16px; font-weight: bold; letter-spacing: 3px;">
                                EXCLUIR
                            </code>
                        </div>
                        <input 
                            type="text" 
                            id="inputConfirmacaoExclusao" 
                            placeholder="Digite EXCLUIR em maiúsculas"
                            autocomplete="off"
                            style="width: 100%; padding: 12px; border: 2px solid #e5e7eb; border-radius: 8px; font-size: 15px; text-align: center; text-transform: uppercase; letter-spacing: 2px; font-weight: 600;"
                            oninput="validarConfirmacaoExclusao(this.value)"
                        >
                        <p id="erroConfirmacaoExclusao" style="margin: 8px 0 0; font-size: 12px; color: #dc2626; display: none;">
                            ❌ Palavra incorreta. Digite exatamente <strong>EXCLUIR</strong>
                        </p>
                    </div>
                </div>
                
                <div class="modal-footer">
                    <button class="btn-cancel" onclick="fecharModalExclusaoTablet()">
                        <i class="fas fa-times"></i> Cancelar
                    </button>
                    <button 
                        class="btn-danger" 
                        id="btnConfirmarExclusaoForcada"
                        onclick="confirmarExclusaoForcada('${tablet.id}')"
                        disabled
                        style="background: #dc2626; opacity: 0.5; cursor: not-allowed;"
                    >
                        <i class="fas fa-trash"></i> Excluir Permanentemente
                    </button>
                </div>
            </div>
        </div>
        
        <style>
            #modalExclusaoTablet {
                position: fixed;
                top: 0; left: 0;
                width: 100%; height: 100%;
                background: rgba(0,0,0,0.7);
                z-index: 999999;
                align-items: center;
                justify-content: center;
                padding: 20px;
                box-sizing: border-box;
            }
            #modalExclusaoTablet .modal-content {
                background: white;
                border-radius: 16px;
                width: 100%;
                box-shadow: 0 25px 50px rgba(0,0,0,0.4);
                animation: fadeInExclusao 0.3s ease;
            }
            #modalExclusaoTablet .modal-header {
                padding: 18px 20px;
                border-radius: 16px 16px 0 0;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            #modalExclusaoTablet .modal-body {
                padding: 20px;
                max-height: 60vh;
                overflow-y: auto;
            }
            #modalExclusaoTablet .modal-footer {
                padding: 15px 20px;
                border-top: 1px solid #e5e7eb;
                display: flex;
                gap: 10px;
                justify-content: flex-end;
                background: #f9fafb;
                border-radius: 0 0 16px 16px;
            }
            #modalExclusaoTablet .modal-close {
                background: none;
                border: none;
                font-size: 28px;
                cursor: pointer;
                line-height: 1;
            }
            #modalExclusaoTablet .btn-cancel {
                padding: 10px 20px;
                background: #6b7280;
                color: white;
                border: none;
                border-radius: 8px;
                font-weight: 600;
                cursor: pointer;
                font-size: 13px;
            }
            #modalExclusaoTablet .btn-danger {
                padding: 10px 20px;
                background: #dc2626;
                color: white;
                border: none;
                border-radius: 8px;
                font-weight: 600;
                cursor: pointer;
                font-size: 13px;
                display: flex;
                align-items: center;
                gap: 6px;
                transition: all 0.2s;
            }
            #modalExclusaoTablet .btn-danger:not(:disabled):hover {
                background: #b91c1c;
                transform: translateY(-1px);
            }
            @keyframes fadeInExclusao {
                from { opacity: 0; transform: scale(0.95); }
                to { opacity: 1; transform: scale(1); }
            }
        </style>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Foco no input
    setTimeout(() => {
        document.getElementById('inputConfirmacaoExclusao')?.focus();
    }, 150);
}

// ==========================================
// VALIDAR CONFIRMAÇÃO EM TEMPO REAL
// ==========================================
function validarConfirmacaoExclusao(valor) {
    const btn = document.getElementById('btnConfirmarExclusaoForcada');
    const erro = document.getElementById('erroConfirmacaoExclusao');
    
    if (valor === 'EXCLUIR') {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
        if (erro) erro.style.display = 'none';
    } else {
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
        if (erro && valor.length > 0) erro.style.display = 'block';
        else if (erro) erro.style.display = 'none';
    }
}

// ==========================================
// CONFIRMAR EXCLUSÃO FORÇADA (CHAMA O BACKEND)
// ==========================================
async function confirmarExclusaoForcada(id) {
    const input = document.getElementById('inputConfirmacaoExclusao');
    if (!input || input.value !== 'EXCLUIR') {
        mostrarToastTablet('❌ Digite EXCLUIR para confirmar', 'error');
        return;
    }
    
    const btn = document.getElementById('btnConfirmarExclusaoForcada');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Excluindo...';
    
    try {
        const response = await fetch(`/api/tablets/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${tabletsToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ confirmacao: 'CONFIRMAR' })
        });
        
        const data = await response.json();
        
        if (data.success) {
            fecharModalExclusaoTablet();
            mostrarToastTablet('✅ Tablet excluído permanentemente!', 'success');
            carregarTablets();
            carregarEstatisticasTablets();
        } else {
            throw new Error(data.error || 'Erro ao excluir');
        }
        
    } catch (error) {
        console.error('[Tablets] Erro ao excluir:', error);
        mostrarToastTablet('❌ ' + error.message, 'error');
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
        btn.innerHTML = '<i class="fas fa-trash"></i> Excluir Permanentemente';
    }
}

// ==========================================
// FECHAR MODAL
// ==========================================
function fecharModalExclusaoTablet() {
    const modal = document.getElementById('modalExclusaoTablet');
    if (modal) {
        modal.style.animation = 'fadeOut 0.2s ease';
        setTimeout(() => modal.remove(), 200);
    }
}

// ============================================================================
// TELA PÚBLICA DE ASSINATURA (via QR Code)
// ============================================================================

async function mostrarTelaAssinaturaTablet(sessaoId) {
    document.body.innerHTML = '';
    document.body.style.background = '#f0f4f8';
    
    const container = document.createElement('div');
    container.id = 'telaAssinaturaTablet';
    document.body.appendChild(container);
    
    container.innerHTML = `
        <div style="min-height: 100vh; padding: 15px; display: flex; flex-direction: column; box-sizing: border-box;">
            <div style="max-width: 800px; width: 100%; margin: 0 auto; display: flex; flex-direction: column; flex: 1; min-height: 0;">
                
                <div style="background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white; padding: 15px 20px; border-radius: 16px 16px 0 0; text-align: center;">
                    <h1 style="font-size: 18px; margin: 0;">
                        <i class="fas fa-signature"></i> Assinatura do Termo
                    </h1>
                    <p style="margin: 5px 0 0; font-size: 13px; opacity: 0.9;">Termo de Entrega de Tablet</p>
                </div>
                
                <div id="telaTabletInfo" style="background: white; padding: 20px; border-left: 4px solid #8b5cf6; flex-shrink: 0; max-height: 45vh; overflow-y: auto;">
                    <div style="text-align: center; padding: 30px;">
                        <div style="width: 30px; height: 30px; border: 3px solid #e5e7eb; border-top-color: #8b5cf6; border-radius: 50%; animation: spinTablet 1s linear infinite; margin: 0 auto 15px;"></div>
                        <p style="color: #64748b; margin: 0;">Carregando informações...</p>
                    </div>
                </div>
                
                <div id="telaTabletArea" style="background: white; padding: 15px; display: none; border-radius: 0 0 16px 16px; flex: 1; flex-direction: column; min-height: 0;">
                    <div id="tabletCanvasWrapper" style="position: relative; background: white; border: 3px dashed #cbd5e0; border-radius: 16px; overflow: hidden; flex: 1; min-height: 150px; margin-bottom: 12px; touch-action: none;">
                        <canvas id="tabletCanvasAssinatura" style="width: 100%; height: 100%; display: block;"></canvas>
                        <div id="tabletPlaceholder" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: #94a3b8; pointer-events: none; width: 100%;">
                            <i class="fas fa-pen-fancy" style="font-size: 32px; display: block; margin-bottom: 8px;"></i>
                            <span style="font-size: 14px;">Assine aqui com o dedo</span>
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 10px; flex-shrink: 0;">
                        <button onclick="limparAssinaturaTabletTela()" 
                                style="flex: 1; padding: 12px; background: #f1f5f9; color: #475569; border: none; border-radius: 12px; font-weight: 600; font-size: 14px; cursor: pointer;">
                            <i class="fas fa-eraser"></i> Limpar
                        </button>
                        <button id="btnSalvarAssinaturaTablet" onclick="salvarAssinaturaTabletTela()" disabled
                                style="flex: 2; padding: 12px; background: #cbd5e0; color: white; border: none; border-radius: 12px; font-weight: 600; font-size: 14px; cursor: not-allowed;">
                            <i class="fas fa-check"></i> Confirmar Assinatura
                        </button>
                    </div>
                </div>
            </div>
        </div>
        <style>@keyframes spinTablet { to { transform: rotate(360deg); } }</style>
    `;
    
    try {
        const response = await fetch(`/api/sessoes-assinatura/${sessaoId}`);
        const data = await response.json();
        
        if (!data.success) {
            document.getElementById('telaTabletInfo').innerHTML = `
                <div style="text-align: center; padding: 40px 20px;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #ef4444; margin-bottom: 15px; display: block;"></i>
                    <h3 style="color: #ef4444; margin: 0 0 10px;">Sessão inválida ou expirada</h3>
                    <p style="color: #64748b; margin: 0;">${data.error || 'Esta sessão não existe mais ou expirou.'}</p>
                </div>
            `;
            return;
        }
        
        if (data.sessao.status === 'assinado') {
            document.getElementById('telaTabletInfo').innerHTML = `
                <div style="text-align: center; padding: 40px 20px;">
                    <i class="fas fa-check-circle" style="font-size: 48px; color: #10b981; margin-bottom: 15px; display: block;"></i>
                    <h3 style="color: #10b981; margin: 0 0 10px;">Já foi assinado</h3>
                    <p style="color: #64748b; margin: 0;">Assinado por ${escapeHtmlTablet(data.sessao.assinadaPorNome || '')}</p>
                </div>
            `;
            return;
        }
        
        const d = data.sessao.dadosAtendimento || {};
        
        document.getElementById('telaTabletInfo').innerHTML = `
            <div style="border-left: 4px solid #8b5cf6; padding-left: 12px; margin-bottom: 15px;">
                <h2 style="margin: 0 0 4px; font-size: 17px; color: #5b21b6;">Termo de Entrega</h2>
                <p style="margin: 0; color: #64748b; font-size: 13px;">Confirme os dados e assine abaixo</p>
            </div>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 15px;">
                <div>
                    <span style="font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 700; display: block; margin-bottom: 3px;">Tablet</span>
                    <span style="font-size: 14px; color: #1e293b; font-weight: 600;">${escapeHtmlTablet(d.numero || '-')}</span>
                </div>
                <div>
                    <span style="font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 700; display: block; margin-bottom: 3px;">Setor</span>
                    <span style="font-size: 14px; color: #1e293b; font-weight: 600;">${escapeHtmlTablet(d.setorLabel || '-')}</span>
                </div>
                <div style="grid-column: 1 / -1;">
                    <span style="font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 700; display: block; margin-bottom: 3px;">Responsável</span>
                    <span style="font-size: 14px; color: #1e293b; font-weight: 600;">${escapeHtmlTablet(d.responsavelNome || '-')}</span>
                    ${d.responsavelMatricula ? `<small style="color: #64748b; font-size: 12px;"> • ${escapeHtmlTablet(d.responsavelMatricula)}</small>` : ''}
                </div>
            </div>
            
            <div style="background: #fef3c7; border: 1px solid #fbbf24; border-radius: 10px; padding: 12px; font-size: 13px; color: #78350f; line-height: 1.5;">
                <p style="margin: 0 0 6px;"><strong>📋 Ao assinar, você confirma que:</strong></p>
                <ul style="margin: 0; padding-left: 20px;">
                    <li>Recebeu o tablet descrito acima em perfeitas condições</li>
                    <li>Compromete-se a zelar pelo equipamento</li>
                    <li>Utilizará apenas para fins institucionais</li>
                    <li>Devolverá quando solicitado</li>
                </ul>
            </div>
        `;
        
        document.getElementById('telaTabletArea').style.display = 'flex';
        setTimeout(() => inicializarCanvasTabletTela(sessaoId), 100);
        
    } catch (e) {
        document.getElementById('telaTabletInfo').innerHTML = `
            <div style="text-align: center; padding: 40px 20px;">
                <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #ef4444; margin-bottom: 15px; display: block;"></i>
                <h3 style="color: #ef4444; margin: 0 0 10px;">Erro ao carregar</h3>
                <p style="color: #64748b; margin: 0;">${e.message}</p>
            </div>
        `;
    }
}

let tabletTelaSessaoId = null;

function inicializarCanvasTabletTela(sessaoId) {
    tabletTelaSessaoId = sessaoId;
    
    const canvas = document.getElementById('tabletCanvasAssinatura');
    const wrapper = document.getElementById('tabletCanvasWrapper');
    const placeholder = document.getElementById('tabletPlaceholder');
    
    if (!canvas || !wrapper) return;
    
    tabletAssinaturaState.canvas = canvas;
    tabletAssinaturaState.temAssinatura = false;
    tabletAssinaturaState.desenhando = false;
    
    const ajustar = () => {
        const rect = wrapper.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
            setTimeout(ajustar, 200);
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
        ctx.strokeStyle = '#8b5cf6';
        
        tabletAssinaturaState.ctx = ctx;
    };
    
    ajustar();
    window.addEventListener('resize', ajustar);
    
    const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        let cx, cy;
        if (e.touches && e.touches.length > 0) {
            cx = e.touches[0].clientX;
            cy = e.touches[0].clientY;
        } else if (e.changedTouches && e.changedTouches.length > 0) {
            cx = e.changedTouches[0].clientX;
            cy = e.changedTouches[0].clientY;
        } else {
            cx = e.clientX;
            cy = e.clientY;
        }
        return { x: cx - rect.left, y: cy - rect.top };
    };
    
    const iniciar = (e) => {
        e.preventDefault();
        tabletAssinaturaState.desenhando = true;
        tabletAssinaturaState.temAssinatura = true;
        const p = getPos(e);
        tabletAssinaturaState.lastX = p.x;
        tabletAssinaturaState.lastY = p.y;
        wrapper.style.borderColor = '#8b5cf6';
        wrapper.style.borderStyle = 'solid';
        if (placeholder) placeholder.style.opacity = '0';
        
        const btn = document.getElementById('btnSalvarAssinaturaTablet');
        if (btn) {
            btn.disabled = false;
            btn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
            btn.style.cursor = 'pointer';
        }
    };
    
    const desenhar = (e) => {
        if (!tabletAssinaturaState.desenhando) return;
        e.preventDefault();
        const p = getPos(e);
        tabletAssinaturaState.ctx.beginPath();
        tabletAssinaturaState.ctx.moveTo(tabletAssinaturaState.lastX, tabletAssinaturaState.lastY);
        tabletAssinaturaState.ctx.lineTo(p.x, p.y);
        tabletAssinaturaState.ctx.stroke();
        tabletAssinaturaState.lastX = p.x;
        tabletAssinaturaState.lastY = p.y;
    };
    
    const parar = (e) => {
        if (e && e.preventDefault) e.preventDefault();
        tabletAssinaturaState.desenhando = false;
    };
    
    canvas.addEventListener('touchstart', iniciar, { passive: false });
    canvas.addEventListener('touchmove', desenhar, { passive: false });
    canvas.addEventListener('touchend', parar, { passive: false });
    canvas.addEventListener('touchcancel', parar, { passive: false });
    canvas.addEventListener('mousedown', iniciar);
    canvas.addEventListener('mousemove', desenhar);
    canvas.addEventListener('mouseup', parar);
    canvas.addEventListener('mouseleave', () => {
        if (tabletAssinaturaState.desenhando) parar();
    });
}

function limparAssinaturaTabletTela() {
    const { canvas, ctx } = tabletAssinaturaState;
    if (!canvas || !ctx) return;
    
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    tabletAssinaturaState.temAssinatura = false;
    
    const placeholder = document.getElementById('tabletPlaceholder');
    if (placeholder) placeholder.style.opacity = '1';
    
    const wrapper = document.getElementById('tabletCanvasWrapper');
    if (wrapper) {
        wrapper.style.borderColor = '#cbd5e0';
        wrapper.style.borderStyle = 'dashed';
    }
    
    const btn = document.getElementById('btnSalvarAssinaturaTablet');
    if (btn) {
        btn.disabled = true;
        btn.style.background = '#cbd5e0';
        btn.style.cursor = 'not-allowed';
    }
}

async function salvarAssinaturaTabletTela() {
    if (!tabletAssinaturaState.temAssinatura || !tabletTelaSessaoId) return;
    
    const btn = document.getElementById('btnSalvarAssinaturaTablet');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
    
    try {
        const base64 = tabletAssinaturaState.canvas.toDataURL('image/png');
        
        const response = await fetch(`/api/sessoes-assinatura/${tabletTelaSessaoId}/assinar`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                assinaturaBase64: base64,
                assinanteNome: 'Responsável'
            })
        });
        
        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Erro ao salvar');
        
        document.getElementById('telaTabletInfo').innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 30px; text-align: center; width: 100%;">
                <i class="fas fa-check-circle" style="font-size: 60px; color: #10b981; margin-bottom: 20px;"></i>
                <h2 style="color: #10b981; margin: 0 0 10px; font-size: 22px;">Assinatura Confirmada!</h2>
                <p style="color: #64748b; margin: 0 0 25px; font-size: 14px; line-height: 1.5;">
                    Sua assinatura foi registrada com sucesso.<br>
                    Você já pode fechar esta janela.
                </p>
                <button onclick="window.close()" 
                        style="padding: 12px 30px; background: #8b5cf6; color: white; border: none; border-radius: 10px; font-weight: 600; cursor: pointer; font-size: 14px;">
                    <i class="fas fa-times"></i> Fechar
                </button>
            </div>
        `;
        
        document.getElementById('telaTabletArea').style.display = 'none';
        const telaInfo = document.getElementById('telaTabletInfo');
        telaInfo.style.flex = '1';
        telaInfo.style.display = 'flex';
        telaInfo.style.alignItems = 'center';
        telaInfo.style.justifyContent = 'center';
        telaInfo.style.maxHeight = 'none';
        telaInfo.style.borderLeft = 'none';
        telaInfo.style.borderRadius = '0 0 16px 16px';
        
    } catch (e) {
        console.error('Erro ao salvar assinatura:', e);
        alert('❌ ' + e.message);
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check"></i> Confirmar Assinatura';
    }
}

// ============================================================================
// UTILITÁRIOS
// ============================================================================

function escapeHtmlTablet(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function atualizarTexto(id, valor) {
    const el = document.getElementById(id);
    if (el) el.textContent = valor;
}

function mostrarToastTablet(mensagem, tipo = 'info') {
    const cores = {
        success: '#10b981',
        error: '#ef4444',
        warning: '#f59e0b',
        info: '#8b5cf6'
    };
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-times-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };
    
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed; bottom: 20px; right: 20px;
        background: ${cores[tipo] || cores.info}; color: white;
        padding: 14px 20px; border-radius: 10px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.2);
        z-index: 999999;
        font-size: 14px; font-weight: 600;
        display: flex; align-items: center; gap: 10px;
        max-width: 400px;
        animation: slideInTablet 0.3s ease-out;
    `;
    toast.innerHTML = `<i class="fas ${icons[tipo] || icons.info}"></i> ${escapeHtmlTablet(mensagem)}`;
    
    if (!document.getElementById('toastTabletStyle')) {
        const style = document.createElement('style');
        style.id = 'toastTabletStyle';
        style.textContent = `
            @keyframes slideInTablet {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOutTablet {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
            @keyframes spinTablet { to { transform: rotate(360deg); } }
        `;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOutTablet 0.3s ease-in';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function configurarEventosTablets() {
    const selectSetor = document.getElementById('tabletSetor');
    if (selectSetor) {
        selectSetor.addEventListener('change', async (e) => {
            const setor = e.target.value;
            if (setor) {
                await carregarResponsaveisTablets(setor);
            } else {
                const selectResp = document.getElementById('tabletResponsavel');
                if (selectResp) {
                    selectResp.innerHTML = '<option value="">Selecione o setor primeiro...</option>';
                    selectResp.disabled = true;
                    selectResp.style.background = '#f9fafb';
                }
            }
        });
    }
}

// ============================================================================
// EXPORTS GLOBAIS
// ============================================================================
window.inicializarModuloTablets = inicializarModuloTablets;
window.abrirModalNovoTablet = abrirModalNovoTablet;
window.fecharModalTablet = fecharModalTablet;
window.salvarTablet = salvarTablet;
window.verTablet = verTablet;
window.fecharModalVerTablet = fecharModalVerTablet;
window.abrirEdicaoTablet = abrirEdicaoTablet;
window.gerarQRCodeTablet = gerarQRCodeTablet;
window.fecharModalQRTablet = fecharModalQRTablet;
window.copiarLinkTablet = copiarLinkTablet;
window.cancelarSessaoTablet = cancelarSessaoTablet;
window.pararMonitoramentoTablet = pararMonitoramentoTablet;
window.imprimirTermoTablet = imprimirTermoTablet;
window.devolverTablet = devolverTablet;
window.excluirTablet = excluirTablet;
window.limparFiltrosTablets = limparFiltrosTablets;
window.mudarPaginaTablets = mudarPaginaTablets;
window.carregarTablets = carregarTablets;
window.limparAssinaturaTabletTela = limparAssinaturaTabletTela;
window.salvarAssinaturaTabletTela = salvarAssinaturaTabletTela;
window.mostrarTelaAssinaturaTablet = mostrarTelaAssinaturaTablet;

// ============================================================================
// 🔥 ANEXAR AO OBJETO ADMIN (RETRY até o admin existir)
// ============================================================================
function anexarAoAdmin() {
    // Se ainda não existe, tentar de novo
    if (typeof window.admin === 'undefined' || window.admin === null) {
        setTimeout(anexarAoAdmin, 300);
        return;
    }
    
    const metodos = {
        abrirModalNovoTablet,
        fecharModalTablet,
        salvarTablet,
        verTablet,
        fecharModalVerTablet,
        abrirEdicaoTablet,
        gerarQRCodeTablet,
        fecharModalQRTablet,
        copiarLinkTablet,
        cancelarSessaoTablet,
        pararMonitoramentoTablet,
        imprimirTermoTablet,
        devolverTablet,
        excluirTablet,
        limparFiltrosTablets,
        mudarPaginaTablets,
        limparAssinaturaTabletTela,
        salvarAssinaturaTabletTela,
        inicializarModuloTablets,
        carregarTablets
    };
    
    // Adiciona todos, SEM sobrescrever renderTabletsSection (que já existe na classe)
    Object.entries(metodos).forEach(([nome, fn]) => {
        window.admin[nome] = fn;
    });
}

// 🔥 Tentar anexar imediatamente e depois continuamente até funcionar
setTimeout(anexarAoAdmin, 100);