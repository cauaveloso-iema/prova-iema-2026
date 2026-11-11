/* ============================================================================
   PAINEL ADMIN — EducaPleno Eventos
   frontend/eventos/js/eventos.js
   v6.7 — Correção: ReferenceError aplicarTemplate + guards + sync hero
   ============================================================================ */

const EV_API = {
    modelos: '/api/eventos/modelos',
    extrairIA: '/api/eventos/modelos/extrair-campos',
    eventos: '/api/eventos/eventos',
    dashboard: '/api/eventos/eventos/dashboard',
    inscricoes: '/api/eventos/inscricoes',
    avaliadores: '/api/eventos/avaliadores',
    avaliacoes: '/api/eventos/avaliacoes'
};

function getToken() {
    return (
        localStorage.getItem('auth_token') ||
        sessionStorage.getItem('auth_token') ||
        localStorage.getItem('token') ||
        sessionStorage.getItem('token')
    );
}

async function api(url, options = {}) {
    const token = getToken();
    const headers = {
        ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...(options.headers || {})
    };
    const res = await fetch(url, { ...options, headers, credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
    return data;
}

function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function debounce(fn, delay = 300) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

function uid() {
    return 'ev_' + Math.random().toString(36).slice(2, 9);
}

/* ============================================================================
   TOASTS
   ============================================================================ */
function garantirToastContainer() {
    let c = document.getElementById('evToastContainer');
    if (c) return c;
    c = document.createElement('div');
    c.id = 'evToastContainer';
    c.className = 'ev-toast-container';
    document.body.appendChild(c);
    return c;
}

function toast(mensagem, tipo = 'info', duracao = 4200) {
    const container = garantirToastContainer();
    const el = document.createElement('div');
    el.className = `ev-toast ev-toast-${tipo}`;

    const icones = {
        info: 'fa-circle-info',
        success: 'fa-circle-check',
        error: 'fa-circle-exclamation',
        warning: 'fa-triangle-exclamation'
    };

    el.innerHTML = `
        <i class="fas ${icones[tipo] || icones.info}"></i>
        <span>${escapeHtml(mensagem)}</span>
        <button type="button" class="ev-toast-close" aria-label="Fechar">
            <i class="fas fa-times"></i>
        </button>
    `;

    const remover = () => {
        el.classList.add('saindo');
        setTimeout(() => el.remove(), 220);
    };

    el.querySelector('.ev-toast-close').addEventListener('click', remover);
    container.appendChild(el);

    requestAnimationFrame(() => el.classList.add('entrando'));
    setTimeout(remover, duracao);
}

function mostrarAlerta(id, msg, tipo = 'info') {
    const el = document.getElementById(id);
    if (el) {
        el.innerHTML = `<div class="ev-alert ev-alert-${tipo}">${msg}</div>`;
        if (tipo !== 'error') setTimeout(() => { el.innerHTML = ''; }, 5000);
    }
    const map = { error: 'error', success: 'success', info: 'info' };
    toast(msg.replace(/<[^>]*>/g, ''), map[tipo] || 'info');
}

/* ============================================================================
   CONFIRM CUSTOMIZADO
   ============================================================================ */
function confirmar({ titulo = 'Confirmar', mensagem = 'Deseja continuar?', textoOk = 'Confirmar', tipo = 'danger' } = {}) {
    return new Promise((resolve) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'ev-confirm-overlay';
        wrapper.innerHTML = `
            <div class="ev-confirm-box" role="dialog" aria-modal="true">
                <div class="ev-confirm-header ev-confirm-${tipo}">
                    <i class="fas ${tipo === 'danger' ? 'fa-triangle-exclamation' : 'fa-circle-info'}"></i>
                    <h3>${escapeHtml(titulo)}</h3>
                </div>
                <div class="ev-confirm-body">${escapeHtml(mensagem)}</div>
                <div class="ev-confirm-actions">
                    <button type="button" class="ev-btn ev-btn-secondary" data-acao="cancelar">Cancelar</button>
                    <button type="button" class="ev-btn ev-btn-${tipo}" data-acao="ok">${escapeHtml(textoOk)}</button>
                </div>
            </div>
        `;
        document.body.appendChild(wrapper);
        requestAnimationFrame(() => wrapper.classList.add('entrando'));

        const fechar = (valor) => {
            wrapper.classList.add('saindo');
            setTimeout(() => { wrapper.remove(); resolve(valor); }, 200);
        };

        wrapper.querySelector('[data-acao="cancelar"]').addEventListener('click', () => fechar(false));
        wrapper.querySelector('[data-acao="ok"]').addEventListener('click', () => fechar(true));
        wrapper.addEventListener('click', (e) => { if (e.target === wrapper) fechar(false); });
        document.addEventListener('keydown', function esc(e) {
            if (e.key === 'Escape') { document.removeEventListener('keydown', esc); fechar(false); }
        });

        setTimeout(() => wrapper.querySelector('[data-acao="ok"]').focus(), 60);
    });
}

const TIPOS_ANEXO_ICON = {
    edital: 'fa-file-alt',
    formulario: 'fa-file-signature',
    termo_lgpd: 'fa-shield-alt',
    termo_imagem: 'fa-camera',
    outro: 'fa-paperclip',
    ficha_avaliacao: 'fa-star'
};
const TIPOS_ANEXO_COR = {
    edital: '#2563eb',
    formulario: '#8b5cf6',
    termo_lgpd: '#16a34a',
    termo_imagem: '#f59e0b',
    outro: '#6b7280',
    ficha_avaliacao: '#0891b2'
};
const TIPOS_ANEXO_LABEL = {
    edital: 'Edital',
    formulario: 'Formulário',
    termo_lgpd: 'Termo LGPD',
    termo_imagem: 'Termo de Imagem',
    outro: 'Outro',
    ficha_avaliacao: 'Ficha de Avaliação'
};

function labelDoAnexo(anexo) {
    if (anexo.labelCustom && anexo.labelCustom.trim()) return anexo.labelCustom.trim();
    return TIPOS_ANEXO_LABEL[anexo.tipo] || 'Anexo';
}

/* ============================================================================
   ESTADO GLOBAL
   ============================================================================ */
let anexosState = [];
let anexosExtrasState = [];
let categoriasState = [];
let modelosCache = [];
let inscEventoId = null;
let editandoModeloId = null;
let editandoEventoId = null;
let coordenadoresState = [];
let coordenadoresCache = [];

/* ============================================================================
   MODAL GENÉRICO
   ============================================================================ */
function abrirModalCustom({ titulo, html, botoes = [], largura = '640px' }) {
    let modalEl = document.getElementById('modalCustomEventos');
    if (modalEl) modalEl.remove();

    const botoesHtml = botoes.map((b, i) => `
        <button type="button" class="ev-btn ${b.classe || 'ev-btn-secondary'}" data-btn-idx="${i}">
            ${b.label}
        </button>
    `).join('');

    const htmlModal = `
        <div class="modal fade ev-modal" id="modalCustomEventos" tabindex="-1" data-bs-backdrop="static">
            <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable" style="max-width: ${largura};">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">${titulo}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
                    </div>
                    <div class="modal-body">${html}</div>
                    ${botoes.length ? `<div class="modal-footer">${botoesHtml}</div>` : ''}
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', htmlModal);
    modalEl = document.getElementById('modalCustomEventos');
    const modal = new bootstrap.Modal(modalEl);
    modal.show();

    modalEl.querySelectorAll('[data-btn-idx]').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = Number(btn.dataset.btnIdx);
            if (botoes[idx]?.onClick) botoes[idx].onClick(modal, modalEl);
        });
    });
    return modal;
}

/* ============================================================================
   ABAS
   ============================================================================ */
document.querySelectorAll('.ev-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const alvo = tab.dataset.tab;
        document.querySelectorAll('.ev-tab').forEach(t => {
            t.classList.remove('active');
            t.setAttribute('aria-selected', 'false');
        });
        document.querySelectorAll('.ev-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
        document.getElementById(`panel-${alvo}`).classList.add('active');

        if (alvo === 'dashboard') carregarDashboard();
        if (alvo === 'modelos') carregarModelos();
        if (alvo === 'eventos') {
            carregarModelosParaSelect();
            carregarCoordenadoresParaSelect();
            carregarEventos();
        }
        if (alvo === 'usuarios') carregarTodosUsuarios();
    });
});

/* ============================================================================
   DASHBOARD
   ============================================================================ */
async function carregarDashboard() {
    try {
        const data = await api(EV_API.dashboard);
        const r = data.resumo || {};
        const set = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val ?? 0;
        };
        set('stat-modelos', r.totalModelos);
        set('stat-eventos', r.totalEventos);
        set('stat-publicados', r.publicados);
        set('stat-rascunhos', r.rascunhos);
        set('stat-encerrados', r.encerrados);
        set('stat-inscricoes', r.totalInscricoes);

        // Sincroniza stats do hero
        set('heroStatModelos', r.totalModelos);
        set('heroStatEventos', r.totalEventos);
        set('heroStatInscricoes', r.totalInscricoes);

        const container = document.getElementById('ultimos-eventos');
        if (!container) return;
        if (!data.ultimosEventos || data.ultimosEventos.length === 0) {
            container.innerHTML = `<div class="ev-empty"><i class="fas fa-calendar-xmark"></i> Nenhum evento ainda.</div>`;
            return;
        }
        container.innerHTML = data.ultimosEventos.map(ev => `
            <div class="ev-list-item">
                <div class="ev-flex-1">
                    <h4>${escapeHtml(ev.titulo)}</h4>
                    <p>
                        <i class="fas fa-file-alt"></i>
                        ${escapeHtml(ev.modeloId?.nomeModelo || '—')}
                        <span class="ev-sep">•</span>
                        <i class="fas fa-calendar"></i>
                        ${new Date(ev.createdAt).toLocaleDateString('pt-BR')}
                    </p>
                </div>
                <span class="ev-badge ev-badge-${(ev.status || '').toLowerCase()}">${escapeHtml(ev.status)}</span>
            </div>
        `).join('');
    } catch (err) {
        console.error(err);
        toast('Erro ao carregar dashboard: ' + err.message, 'error');
    }
}

/* ============================================================================
   PRÉ-SELEÇÃO DE TIPOS (upload)
   ============================================================================ */
const elModeloAnexos = document.getElementById('modelo-anexos');
if (elModeloAnexos) {
    elModeloAnexos.addEventListener('change', () => {
        const files = elModeloAnexos.files;
        const container = document.getElementById('anexos-tipos-container');
        if (!container) return;
        container.innerHTML = '';
        if (files.length === 0) return;

        Array.from(files).forEach((f) => {
            const div = document.createElement('div');
            div.className = 'ev-campo-row';
            div.innerHTML = `
                <div class="ev-anexo-pre-info">
                    <i class="fas fa-paperclip"></i>
                    <span>${escapeHtml(f.name)}</span>
                    <small>(${(f.size/1024).toFixed(0)} KB)</small>
                </div>
                <select class="anexo-tipo-pre-select">
                    <option value="edital">Edital</option>
                    <option value="formulario" selected>Formulário</option>
                    <option value="termo_lgpd">Termo LGPD</option>
                    <option value="termo_imagem">Termo de Imagem</option>
                    <option value="ficha_avaliacao">Ficha de Avaliação</option>
                    <option value="outro">Outro</option>
                </select>
            `;
            container.appendChild(div);
        });
    });
}

/* ============================================================================
   SISTEMA DE COTAS
   ============================================================================ */
function configurarSistemaCotas() {
    const chkUsarCotas = document.getElementById('modelo-usar-cotas');
    const blocoCampos = document.getElementById('config-cotas-campos');

    if (chkUsarCotas && blocoCampos) {
        chkUsarCotas.onchange = null;
        chkUsarCotas.onchange = function () {
            blocoCampos.style.display = this.checked ? 'block' : 'none';
        };
        blocoCampos.style.display = chkUsarCotas.checked ? 'block' : 'none';
    }
}

/* ============================================================================
   SISTEMA DE CATEGORIAS
   ============================================================================ */
function renderCategoriasState() {
    const container = document.getElementById('lista-categorias-container');
    if (!container) return;

    if (categoriasState.length === 0) {
        container.innerHTML = '<p class="ev-hint" style="padding: 10px;">Nenhuma opção adicionada.</p>';
        return;
    }

    container.innerHTML = categoriasState.map((cat, idx) => `
        <div class="ev-campo-row" style="grid-template-columns: 1fr auto; margin-bottom: 8px; background: #fff; padding: 10px; border: 1px solid var(--ev-border); border-radius: 8px; display: flex; gap: 10px; align-items: center;">
            <input type="text" class="ev-input categoria-label" data-idx="${idx}" value="${escapeHtml(cat.label)}" placeholder="Ex: Nível 1" style="flex: 1; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px;">
            <button type="button" class="ev-btn ev-btn-danger ev-btn-sm btn-remover-categoria" data-idx="${idx}" title="Remover" style="padding: 8px 12px;">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `).join('');

    container.querySelectorAll('.categoria-label').forEach(inp => {
        inp.addEventListener('input', (e) => {
            categoriasState[Number(e.target.dataset.idx)].label = e.target.value;
        });
    });
    container.querySelectorAll('.btn-remover-categoria').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = Number(e.currentTarget.dataset.idx);
            categoriasState.splice(idx, 1);
            renderCategoriasState();
        });
    });
}

const btnAddCategoria = document.getElementById('btn-add-categoria');
if (btnAddCategoria) {
    btnAddCategoria.addEventListener('click', () => {
        categoriasState.push({ label: '' });
        renderCategoriasState();
    });
}

function configurarCategorias() {
    const chkUsar = document.getElementById('modelo-usar-categorias');
    const bloco = document.getElementById('config-categorias-campos');

    if (chkUsar && bloco) {
        chkUsar.onchange = null;
        chkUsar.onchange = function () {
            bloco.style.display = this.checked ? 'block' : 'none';
        };
        bloco.style.display = chkUsar.checked ? 'block' : 'none';
    }
}

/* ============================================================================
   EXTRAÇÃO POR IA
   ============================================================================ */
const btnExtrairIA = document.getElementById('btn-extrair-ia');
if (btnExtrairIA) {
    btnExtrairIA.addEventListener('click', async () => {
        const btn = btnExtrairIA;
        const status = document.getElementById('ia-status');
        const input = document.getElementById('modelo-anexos');
        const selectPre = document.querySelector('.anexo-tipo-pre-select');

        if (!input || !input.files || input.files.length === 0) {
            return mostrarAlerta('form-modelo-alert', 'Envie pelo menos um arquivo antes de continuar.', 'error');
        }

        const tipoSelecionado = selectPre ? selectPre.value : 'formulario';
        const isEdital = tipoSelecionado === 'edital';

        if (isEdital) {
            btn.innerHTML = '<i class="fas fa-check"></i> OK (Anexar Edital)';
        } else {
            btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Analisando...';
        }

        btn.disabled = true;
        if (status) status.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Processando...';

        try {
            const fd = new FormData();
            Array.from(input.files).forEach((f) => fd.append('anexos', f));

            if (isEdital) fd.append('forcar_edital', 'true');

            const data = await api(EV_API.extrairIA, { method: 'POST', body: fd });

            let arquivos = data.arquivos;
            if (!arquivos && Array.isArray(data.camposSugeridos)) {
                arquivos = [{
                    tipoAnexo: isEdital ? 'edital' : 'formulario',
                    nomeOriginal: (input.files[0] && input.files[0].name) || 'Arquivo',
                    arquivo: null,
                    campos: isEdital ? [] : data.camposSugeridos,
                    fonte: isEdital ? 'edital' : data.fonte
                }];
            }

            if (!arquivos || arquivos.length === 0) {
                if (status) status.innerHTML = '<i class="fas fa-circle-exclamation ev-ic-warning"></i> Nenhum campo detectado.';
                toast('Nenhum campo detectado.', 'warning');
                return;
            }

            arquivos.forEach(a => {
                if (a.tipoAnexo === 'edital') {
                    a.campos = [];
                    a.isAvaliativo = false;
                    a.repetivel = false;
                }

                anexosState.push({
                    tipo: a.tipoAnexo || 'outro',
                    labelCustom: '',
                    nomeOriginal: a.nomeOriginal || 'Arquivo',
                    arquivo: a.arquivo || null,
                    mimetype: a.mimetype || null,
                    tamanho: a.tamanho || 0,
                    campos: a.campos || [],
                    repetivel: !!a.repetivel,
                    labelGrupoRepetivel: a.labelGrupoRepetivel || '',
                    camposRepetiveis: a.camposRepetiveis || [],
                    quantidadePadrao: a.quantidadePadrao || 3,
                    maxRepeticoes: a.maxRepeticoes || 10,
                    exigeAssinatura: !!a.exigeAssinatura,
                    exibeModalLeitura: true,
                    tipoDadosTermo: 'auto',
                    solicitaAnexo: !!a.solicitaAnexo,
                    labelSolicitacaoAnexo: a.labelSolicitacaoAnexo || '',
                    anexoSolicitacaoObrigatorio: !!a.anexoSolicitacaoObrigatorio,
                    isAvaliativo: !!a.isAvaliativo,
                    numAvaliadores: a.numAvaliadores || 1,
                    modoDistribuicao: a.modoDistribuicao || 'aleatorio',
                    calcularMedia: a.calcularMedia !== false,
                    tipoMedia: a.tipoMedia || 'aritmetica',
                    exigeAssinaturaAvaliador: !!a.exigeAssinaturaAvaliador,
                    criteriosAvaliacao: a.criteriosAvaliacao || [],
                    informacoesDocumento: a.informacoesDocumento || '',
                    legendasNotas: a.legendasNotas || []
                });
            });

            if (isEdital) {
                if (status) status.innerHTML = '<i class="fas fa-check ev-ic-success"></i> Edital anexado com sucesso.';
                toast('Edital anexado!', 'success');
            } else {
                if (status) status.innerHTML = `<i class="fas fa-circle-check ev-ic-success"></i> ${data.mensagem || 'Extraído'} — ${arquivos.length} anexo(s).`;
                toast(`${arquivos.length} anexo(s) processado(s).`, 'success');
            }

            input.value = '';
            const tiposContainer = document.getElementById('anexos-tipos-container');
            if (tiposContainer) tiposContainer.innerHTML = '';
            renderAnexosState();

            setTimeout(() => {
                const anexosContainer = document.getElementById('anexos-container');
                const passo2 = document.querySelector('#panel-modelos .ev-card:nth-child(2)');
                if (anexosContainer && anexosContainer.children.length > 0) {
                    (passo2 || anexosContainer).scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }, 400);
        } catch (err) {
            if (status) status.innerHTML = `<i class="fas fa-circle-xmark ev-ic-danger"></i> ${escapeHtml(err.message)}`;
            mostrarAlerta('form-modelo-alert', `❌ ${err.message}`, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-robot"></i> Extrair Campos Automaticamente';
        }
    });
}

const anexosTiposContainer = document.getElementById('anexos-tipos-container');
if (anexosTiposContainer) {
    anexosTiposContainer.addEventListener('change', (e) => {
        if (e.target.classList.contains('anexo-tipo-pre-select')) {
            const btn = document.getElementById('btn-extrair-ia');
            if (!btn) return;
            if (e.target.value === 'edital') {
                btn.innerHTML = '<i class="fas fa-check"></i> OK (Anexar Edital)';
            } else {
                btn.innerHTML = '<i class="fas fa-robot"></i> Extrair Campos Automaticamente';
            }
        }
    });
}

/* ============================================================================
   ANEXOS EXTRAS
   ============================================================================ */
function renderAnexosExtrasState() {
    const container = document.getElementById('anexos-extras-container');
    if (!container) return;

    if (anexosExtrasState.length === 0) {
        container.innerHTML = '<p class="ev-hint" style="padding: 10px;">Nenhum anexo solicitado ainda.</p>';
        return;
    }

    container.innerHTML = anexosExtrasState.map((item, idx) => `
        <div class="ev-campo-row" style="grid-template-columns: 2fr 1fr auto; margin-bottom: 10px; background: #fff; padding: 12px; border: 1px solid var(--ev-border); border-radius: 8px; align-items: center; display: flex; gap: 10px;">
            <input type="text" class="ev-input anexo-extra-label" data-idx="${idx}" value="${escapeHtml(item.label)}" placeholder="Ex: Cópia do RG e CPF" style="flex: 2; padding: 8px; border: 1px solid #cbd5e1; border-radius: 6px; width: 100%;">
            <label class="ev-check-inline" style="cursor: pointer; display: flex; align-items: center; gap: 8px; font-size: 13px; flex: 1;">
                <input type="checkbox" class="anexo-extra-obrig" data-idx="${idx}" ${item.obrigatorio ? 'checked' : ''}> Obrigatório
            </label>
            <button type="button" class="ev-btn ev-btn-danger ev-btn-sm btn-remover-anexo-extra" data-idx="${idx}" title="Remover">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `).join('');

    container.querySelectorAll('.anexo-extra-label').forEach(inp => {
        inp.addEventListener('input', (e) => {
            anexosExtrasState[Number(e.target.dataset.idx)].label = e.target.value;
        });
    });
    container.querySelectorAll('.anexo-extra-obrig').forEach(cb => {
        cb.addEventListener('change', (e) => {
            anexosExtrasState[Number(e.target.dataset.idx)].obrigatorio = e.target.checked;
        });
    });
    container.querySelectorAll('.btn-remover-anexo-extra').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = Number(e.currentTarget.dataset.idx);
            anexosExtrasState.splice(idx, 1);
            renderAnexosExtrasState();
        });
    });
}

const btnAddAnexoExtra = document.getElementById('btn-add-anexo-extra');
if (btnAddAnexoExtra) {
    btnAddAnexoExtra.addEventListener('click', () => {
        anexosExtrasState.push({ label: '', obrigatorio: false });
        renderAnexosExtrasState();
    });
}

/* ============================================================================
   RENDERIZAR ANEXOS PADRÃO
   ============================================================================ */
function renderAnexosState() {
    const container = document.getElementById('anexos-container');
    const vazio = document.getElementById('anexos-vazio');
    if (!container) return;

    if (anexosState.length === 0) {
        container.innerHTML = '';
        if (vazio) vazio.style.display = 'block';
        return;
    }
    if (vazio) vazio.style.display = 'none';

    container.innerHTML = anexosState.map((anexo, idx) => renderAnexoCard(anexo, idx)).join('');
    bindEventosAnexos(container);
}

function renderAnexoCard(anexo, idx) {
    const icon = TIPOS_ANEXO_ICON[anexo.tipo] || 'fa-paperclip';
    const cor = TIPOS_ANEXO_COR[anexo.tipo] || '#6b7280';
    const label = labelDoAnexo(anexo);
    const ehEdital = anexo.tipo === 'edital';

    const fileInfo = anexo.arquivo
        ? `<a href="${escapeHtml(anexo.arquivo)}" target="_blank" class="ev-anexo-file-link">
               <i class="fas fa-file-arrow-down"></i> ${escapeHtml(anexo.nomeOriginal)}
           </a>`
        : `<span class="ev-anexo-file-empty">
               <i class="fas fa-file"></i> ${escapeHtml(anexo.nomeOriginal)} (sem arquivo)
           </span>`;

    const tipoSelect = `
        <select class="anexo-tipo-edit" data-anexo-idx="${idx}">
            <option value="edital" ${anexo.tipo === 'edital' ? 'selected' : ''}>Edital</option>
            <option value="formulario" ${anexo.tipo === 'formulario' ? 'selected' : ''}>Formulário</option>
            <option value="termo_lgpd" ${anexo.tipo === 'termo_lgpd' ? 'selected' : ''}>Termo LGPD</option>
            <option value="termo_imagem" ${anexo.tipo === 'termo_imagem' ? 'selected' : ''}>Termo de Imagem</option>
            <option value="ficha_avaliacao" ${anexo.tipo === 'ficha_avaliacao' ? 'selected' : ''}>Ficha de Avaliação</option>
            <option value="outro" ${anexo.tipo === 'outro' ? 'selected' : ''}>Outro</option>
        </select>
    `;

    const labelCustomInput = anexo.tipo === 'outro' ? `
        <div class="ev-anexo-custom-label">
            <label>Nome do documento:</label>
            <input type="text" class="anexo-label-custom" data-anexo-idx="${idx}"
                   value="${escapeHtml(anexo.labelCustom || '')}"
                   placeholder="Ex: Autorização de Uso de Imagem">
        </div>
    ` : '';

    if (ehEdital) {
        return `
            <div class="ev-anexo-card" style="border-left-color: ${cor};">
                <div class="ev-anexo-header">
                    <div class="ev-anexo-title">
                        <div class="ev-anexo-icon" style="background: ${cor}20; color: ${cor};">
                            <i class="fas ${icon}"></i>
                        </div>
                        <div class="ev-anexo-title-text">
                            <strong>${escapeHtml(label)}</strong>
                            ${tipoSelect}
                        </div>
                    </div>
                    <div class="ev-anexo-actions">
                        <button type="button" class="ev-btn ev-btn-danger ev-btn-sm" data-remover-anexo="${idx}" title="Remover anexo">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="ev-anexo-file">${fileInfo}</div>
                <p class="ev-hint ev-hint-edital">
                    <i class="fas fa-info-circle"></i> Editais são apenas anexados — não extraem campos.
                </p>
            </div>
        `;
    }

    const camposHtml = (anexo.campos || []).map((c, ci) => `
        <div class="ev-campo-row ev-campo-row-campos" data-anexo-idx="${idx}" data-campo-idx="${ci}">
            <input type="text" class="campo-label" value="${escapeHtml(c.label)}" placeholder="Nome do campo">
            <select class="campo-tipo">
                ${['text|Texto', 'date|Data', 'number|Número', 'email|E-mail', 'tel|Telefone',
                   'cpf|CPF', 'rg|RG', 'textarea|Texto Longo', 'select|Seleção']
                   .map(opt => {
                       const [v, l] = opt.split('|');
                       return `<option value="${v}" ${c.tipo === v ? 'selected' : ''}>${l}</option>`;
                   }).join('')}
            </select>
            <label class="ev-check-inline">
                <input type="checkbox" class="campo-obrigatorio" ${c.obrigatorio ? 'checked' : ''}> Obrigatório
            </label>
            <button type="button" class="ev-btn ev-btn-danger ev-btn-sm btn-remover-campo" title="Remover campo">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `).join('');

    const repetivel = !!anexo.repetivel;
    const camposRepetiveisHtml = (anexo.camposRepetiveis || []).map((c, ci) => `
        <div class="ev-campo-row campo-repetivel-row" data-anexo-idx="${idx}" data-campo-rep-idx="${ci}">
            <input type="text" class="campo-repetivel-label" value="${escapeHtml(c.label)}" placeholder="Nome do campo">
            <select class="campo-repetivel-tipo">
                ${['text|Texto', 'date|Data', 'number|Número', 'email|E-mail', 'tel|Telefone',
                   'cpf|CPF', 'rg|RG']
                   .map(opt => {
                       const [v, l] = opt.split('|');
                       return `<option value="${v}" ${c.tipo === v ? 'selected' : ''}>${l}</option>`;
                   }).join('')}
            </select>
            <label class="ev-check-inline">
                <input type="checkbox" class="campo-repetivel-obrig" ${c.obrigatorio ? 'checked' : ''}> Obrigatório
            </label>
            <button type="button" class="ev-btn ev-btn-danger ev-btn-sm btn-remover-campo-repetivel" title="Remover">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `).join('');

    const blocoRepetivel = `
        <div class="bloco-repetivel">
            <label class="ev-switch">
                <input type="checkbox" class="anexo-repetivel-toggle" data-anexo-idx="${idx}" ${repetivel ? 'checked' : ''}>
                <span>🔁 Campos repetíveis</span>
            </label>
            <div class="bloco-repetivel-conteudo" style="display: ${repetivel ? 'block' : 'none'};">
                <div class="ev-grid-3">
                    <div>
                        <label>Nome do grupo</label>
                        <input type="text" class="repetivel-label-grupo" data-anexo-idx="${idx}"
                               value="${escapeHtml(anexo.labelGrupoRepetivel || 'Estudante')}">
                    </div>
                    <div>
                        <label>Qtd padrão</label>
                        <input type="number" class="repetivel-qtd-padrao" data-anexo-idx="${idx}"
                               value="${anexo.quantidadePadrao || 3}" min="1">
                    </div>
                    <div>
                        <label>Máximo</label>
                        <input type="number" class="repetivel-max" data-anexo-idx="${idx}"
                               value="${anexo.maxRepeticoes || 10}" min="1">
                    </div>
                </div>
                <div class="campos-repetiveis-container">
                    ${camposRepetiveisHtml || '<p class="ev-hint">Nenhum campo repetível ainda.</p>'}
                </div>
                <button type="button" class="ev-btn ev-btn-secondary ev-btn-sm btn-add-campo-repetivel" data-anexo-idx="${idx}">
                    <i class="fas fa-plus"></i> Adicionar campo repetível
                </button>
            </div>
        </div>
    `;

    const exigeAssinatura = !!anexo.exigeAssinatura;
    const exibeModalLeitura = anexo.exibeModalLeitura !== false;
    const blocoAssinatura = `
        <div class="bloco-assinatura">
            <label class="ev-switch">
                <input type="checkbox" class="anexo-exige-assinatura" data-anexo-idx="${idx}" ${exigeAssinatura ? 'checked' : ''}>
                <span>✍️ Exige assinatura do participante</span>
            </label>
            <div class="bloco-modal-leitura" style="display: ${exigeAssinatura ? 'block' : 'none'};">
                <label class="ev-switch ev-switch-sm">
                    <input type="checkbox" class="anexo-exibe-modal-leitura" data-anexo-idx="${idx}" ${exibeModalLeitura ? 'checked' : ''}>
                    <span>📖 Ler o documento antes de assinar</span>
                </label>
                <div class="ev-mt-12">
                    <label class="ev-label-sm">De quem é este termo?</label>
                    <select class="anexo-tipo-dados" data-anexo-idx="${idx}">
                        <option value="auto" ${anexo.tipoDadosTermo === 'auto' ? 'selected' : ''}>🤖 Detectar automaticamente</option>
                        <option value="professor" ${anexo.tipoDadosTermo === 'professor' ? 'selected' : ''}>👨‍🏫 Forçar PROFESSOR</option>
                        <option value="estudante" ${anexo.tipoDadosTermo === 'estudante' ? 'selected' : ''}>🎓 Forçar ESTUDANTE</option>
                    </select>
                </div>
            </div>
        </div>
    `;

    const solicitaAnexo = !!anexo.solicitaAnexo;
    const anexoObrigatorio = !!anexo.anexoSolicitacaoObrigatorio;
    const blocoSolicitacaoAnexo = `
        <div class="bloco-solicitacao-anexo">
            <label class="ev-switch">
                <input type="checkbox" class="anexo-solicita-anexo" data-anexo-idx="${idx}" ${solicitaAnexo ? 'checked' : ''}>
                <span>📎 Solicitar anexo do participante</span>
            </label>
            <div class="bloco-solicitacao-anexo-conteudo" style="display: ${solicitaAnexo ? 'block' : 'none'};">
                <label class="ev-label-sm">Qual anexo deve ser enviado?</label>
                <input type="text" class="anexo-label-solicitacao" data-anexo-idx="${idx}"
                       value="${escapeHtml(anexo.labelSolicitacaoAnexo || '')}"
                       placeholder="Ex: Termo de Autorização">
                <label class="ev-switch ev-switch-sm ev-mt-12">
                    <input type="checkbox" class="anexo-solicitacao-obrigatoria" data-anexo-idx="${idx}" ${anexoObrigatorio ? 'checked' : ''}>
                    <span>⚠️ Anexo obrigatório</span>
                </label>
            </div>
        </div>
    `;

    const isAvaliativo = !!anexo.isAvaliativo;
    const numAvaliadores = anexo.numAvaliadores || 1;
    const modoDistribuicao = anexo.modoDistribuicao || 'aleatorio';
    const calcularMedia = anexo.calcularMedia !== false;
    const tipoMedia = anexo.tipoMedia || 'aritmetica';
    const exigeAssinaturaAvaliador = !!anexo.exigeAssinaturaAvaliador;

    const blocoAvaliacao = `
        <div class="bloco-avaliacao">
            <label class="ev-switch">
                <input type="checkbox" class="anexo-is-availiativo" data-anexo-idx="${idx}" ${isAvaliativo ? 'checked' : ''}>
                <span>⭐ Usar este anexo para avaliação</span>
            </label>
            <div class="bloco-avaliacao-conteudo" style="display: ${isAvaliativo ? 'block' : 'none'};">
                <div class="ev-grid-2">
                    <div>
                        <label>Quantos avaliadores por inscrição?</label>
                        <input type="number" class="anexo-num-avaliadores" data-anexo-idx="${idx}"
                               value="${numAvaliadores}" min="1" max="20">
                    </div>
                    <div>
                        <label>Como distribuir?</label>
                        <select class="anexo-modo-distribuicao" data-anexo-idx="${idx}">
                            <option value="aleatorio" ${modoDistribuicao === 'aleatorio' ? 'selected' : ''}>🎲 Aleatória — sorteio</option>
                            <option value="manual" ${modoDistribuicao === 'manual' ? 'selected' : ''}>✋ Manual — coordenador atribui</option>
                        </select>
                    </div>
                </div>

                <label class="ev-switch ev-switch-sm ev-mt-12">
                    <input type="checkbox" class="anexo-calcular-media" data-anexo-idx="${idx}" ${calcularMedia ? 'checked' : ''}>
                    <span>📊 Calcular média final automaticamente</span>
                </label>
                <div class="bloco-media-config" style="display: ${calcularMedia ? 'block' : 'none'};">
                    <label>Tipo de média</label>
                    <select class="anexo-tipo-media" data-anexo-idx="${idx}">
                        <option value="aritmetica" ${tipoMedia === 'aritmetica' ? 'selected' : ''}>Aritmética Simples</option>
                        <option value="ponderada" ${tipoMedia === 'ponderada' ? 'selected' : ''}>Ponderada (em breve)</option>
                    </select>
                </div>

                <label class="ev-switch ev-switch-sm ev-mt-12">
                    <input type="checkbox" class="anexo-exige-assinatura-avaliador" data-anexo-idx="${idx}" ${exigeAssinaturaAvaliador ? 'checked' : ''}>
                    <span>✍️ Exigir assinatura do avaliador</span>
                </label>
            </div>
        </div>
    `;

    const criterios = anexo.criteriosAvaliacao || [];
    const blocoCriterios = isAvaliativo ? `
        <div class="bloco-criterios">
            <div class="bloco-criterios-header">
                <strong>🎯 Critérios de Avaliação (${criterios.length})</strong>
                <button type="button" class="ev-btn ev-btn-primary ev-btn-sm" data-add-criterio="${idx}">
                    <i class="fas fa-plus"></i> Adicionar
                </button>
            </div>
            ${criterios.length === 0
                ? '<p class="ev-hint">Nenhum critério ainda.</p>'
                : criterios.map((c, ci) => `
                    <div class="criterio-item">
                        <div class="criterio-item-top">
                            <input type="text" class="criterio-label" data-criterio-anexo-idx="${idx}" data-criterio-idx="${ci}"
                                   value="${escapeHtml(c.label)}" placeholder="Nome do critério">
                            <input type="number" class="criterio-nota-max" data-criterio-anexo-idx="${idx}" data-criterio-idx="${ci}"
                                   value="${c.notaMaxima || 5}" min="0" placeholder="Nota máx" title="Nota máxima">
                            <button type="button" class="ev-btn ev-btn-danger ev-btn-sm btn-remover-criterio"
                                    data-criterio-anexo-idx="${idx}" data-criterio-idx="${ci}" title="Remover critério">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                        <textarea class="criterio-descricao" data-criterio-anexo-idx="${idx}" data-criterio-idx="${ci}"
                                  placeholder="Descrição (opcional)">${escapeHtml(c.descricao || '')}</textarea>
                    </div>
                `).join('')
            }
        </div>
    ` : '';

    return `
        <div class="ev-anexo-card" style="border-left-color: ${cor};">
            <div class="ev-anexo-header">
                <div class="ev-anexo-title">
                    <div class="ev-anexo-icon" style="background: ${cor}20; color: ${cor};">
                        <i class="fas ${icon}"></i>
                    </div>
                    <div class="ev-anexo-title-text">
                        <strong>${escapeHtml(label)}</strong>
                        ${tipoSelect}
                    </div>
                </div>
                <div class="ev-anexo-actions">
                    <button type="button" class="ev-btn ev-btn-secondary ev-btn-sm" data-add-campo="${idx}" title="Adicionar campo">
                        <i class="fas fa-plus"></i> Campo
                    </button>
                    <button type="button" class="ev-btn ev-btn-danger ev-btn-sm" data-remover-anexo="${idx}" title="Remover anexo">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>

            <div class="ev-anexo-file">${fileInfo}</div>
            ${labelCustomInput}

            <div class="ev-anexo-campos">
                ${camposHtml || '<p class="ev-hint">Nenhum campo simples. Clique em <strong>+ Campo</strong> para adicionar.</p>'}
            </div>

            ${blocoRepetivel}
            ${blocoAssinatura}
            ${blocoSolicitacaoAnexo}
            ${blocoAvaliacao}
            ${blocoCriterios}
        </div>
    `;
}

/* ============================================================================
   BIND: eventos dos anexos
   ============================================================================ */
function bindEventosAnexos(container) {
    container.querySelectorAll('.anexo-tipo-edit').forEach(sel => {
        sel.addEventListener('change', () => {
            const idx = Number(sel.dataset.anexoIdx);
            anexosState[idx].tipo = sel.value;
            if (sel.value !== 'outro') anexosState[idx].labelCustom = '';
            if (sel.value === 'edital') {
                anexosState[idx].campos = [];
                anexosState[idx].camposRepetiveis = [];
                anexosState[idx].repetivel = false;
                anexosState[idx].exigeAssinatura = false;
                anexosState[idx].isAvaliativo = false;
                anexosState[idx].criteriosAvaliacao = [];
                anexosState[idx].legendasNotas = [];
                anexosState[idx].informacoesDocumento = '';
            }
            renderAnexosState();
        });
    });

    container.querySelectorAll('.anexo-label-custom').forEach(inp => {
        inp.addEventListener('input', () => {
            anexosState[Number(inp.dataset.anexoIdx)].labelCustom = inp.value;
        });
    });

    container.querySelectorAll('[data-add-campo]').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = Number(btn.dataset.addCampo);
            anexosState[idx].campos = anexosState[idx].campos || [];
            anexosState[idx].campos.push({
                label: '', tipo: 'text', obrigatorio: false,
                opcoes: [], placeholder: '', ajuda: '', origemIA: false
            });
            renderAnexosState();
        });
    });

    container.querySelectorAll('[data-remover-anexo]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const idx = Number(btn.dataset.removerAnexo);
            const ok = await confirmar({
                titulo: 'Remover anexo',
                mensagem: 'Deseja realmente remover este anexo e todos os seus campos?',
                textoOk: 'Remover'
            });
            if (!ok) return;
            anexosState.splice(idx, 1);
            renderAnexosState();
        });
    });

    container.querySelectorAll('.btn-remover-campo').forEach(btn => {
        btn.addEventListener('click', () => {
            const row = btn.closest('.ev-campo-row');
            const aIdx = Number(row.dataset.anexoIdx);
            const cIdx = Number(row.dataset.campoIdx);
            anexosState[aIdx].campos.splice(cIdx, 1);
            renderAnexosState();
        });
    });

    container.querySelectorAll('.ev-campo-row:not(.campo-repetivel-row)').forEach(row => {
        const aIdx = Number(row.dataset.anexoIdx);
        const cIdx = Number(row.dataset.campoIdx);
        const labelInput = row.querySelector('.campo-label');
        const tipoSelect = row.querySelector('.campo-tipo');
        const obrigCheck = row.querySelector('.campo-obrigatorio');
        if (labelInput) labelInput.addEventListener('input', () => anexosState[aIdx].campos[cIdx].label = labelInput.value);
        if (tipoSelect) tipoSelect.addEventListener('change', () => anexosState[aIdx].campos[cIdx].tipo = tipoSelect.value);
        if (obrigCheck) obrigCheck.addEventListener('change', () => anexosState[aIdx].campos[cIdx].obrigatorio = obrigCheck.checked);
    });

    container.querySelectorAll('.anexo-repetivel-toggle').forEach(cb => {
        cb.addEventListener('change', () => {
            const idx = Number(cb.dataset.anexoIdx);
            anexosState[idx].repetivel = cb.checked;
            if (cb.checked) {
                if (!anexosState[idx].camposRepetiveis || anexosState[idx].camposRepetiveis.length === 0) {
                    anexosState[idx].camposRepetiveis = [{
                        label: 'Nome Completo', tipo: 'text', obrigatorio: true,
                        opcoes: [], placeholder: '', ajuda: '', origemIA: false
                    }];
                }
                if (!anexosState[idx].labelGrupoRepetivel) anexosState[idx].labelGrupoRepetivel = 'Estudante';
                if (!anexosState[idx].quantidadePadrao) anexosState[idx].quantidadePadrao = 3;
                if (!anexosState[idx].maxRepeticoes) anexosState[idx].maxRepeticoes = 10;
            }
            renderAnexosState();
        });
    });

    container.querySelectorAll('.repetivel-label-grupo').forEach(inp => inp.addEventListener('input', () => anexosState[Number(inp.dataset.anexoIdx)].labelGrupoRepetivel = inp.value));
    container.querySelectorAll('.repetivel-qtd-padrao').forEach(inp => inp.addEventListener('input', () => anexosState[Number(inp.dataset.anexoIdx)].quantidadePadrao = parseInt(inp.value) || 1));
    container.querySelectorAll('.repetivel-max').forEach(inp => inp.addEventListener('input', () => anexosState[Number(inp.dataset.anexoIdx)].maxRepeticoes = parseInt(inp.value) || 10));

    container.querySelectorAll('.btn-add-campo-repetivel').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = Number(btn.dataset.anexoIdx);
            anexosState[idx].camposRepetiveis = anexosState[idx].camposRepetiveis || [];
            anexosState[idx].camposRepetiveis.push({
                label: '', tipo: 'text', obrigatorio: false,
                opcoes: [], placeholder: '', ajuda: '', origemIA: false
            });
            renderAnexosState();
        });
    });

    container.querySelectorAll('.btn-remover-campo-repetivel').forEach(btn => {
        btn.addEventListener('click', () => {
            const row = btn.closest('.campo-repetivel-row');
            const aIdx = Number(row.dataset.anexoIdx);
            const cIdx = Number(row.dataset.campoRepIdx);
            anexosState[aIdx].camposRepetiveis.splice(cIdx, 1);
            renderAnexosState();
        });
    });

    container.querySelectorAll('.campo-repetivel-row').forEach(row => {
        const aIdx = Number(row.dataset.anexoIdx);
        const cIdx = Number(row.dataset.campoRepIdx);
        const labelInput = row.querySelector('.campo-repetivel-label');
        const tipoSelect = row.querySelector('.campo-repetivel-tipo');
        const obrigCheck = row.querySelector('.campo-repetivel-obrig');
        if (labelInput) labelInput.addEventListener('input', () => anexosState[aIdx].camposRepetiveis[cIdx].label = labelInput.value);
        if (tipoSelect) tipoSelect.addEventListener('change', () => anexosState[aIdx].camposRepetiveis[cIdx].tipo = tipoSelect.value);
        if (obrigCheck) obrigCheck.addEventListener('change', () => anexosState[aIdx].camposRepetiveis[cIdx].obrigatorio = obrigCheck.checked);
    });

    container.querySelectorAll('.anexo-exige-assinatura').forEach(cb => {
        cb.addEventListener('change', () => {
            anexosState[Number(cb.dataset.anexoIdx)].exigeAssinatura = cb.checked;
            renderAnexosState();
        });
    });

    container.querySelectorAll('.anexo-exibe-modal-leitura').forEach(cb => {
        cb.addEventListener('change', () => {
            anexosState[Number(cb.dataset.anexoIdx)].exibeModalLeitura = cb.checked;
        });
    });

    container.querySelectorAll('.anexo-tipo-dados').forEach(sel => {
        sel.addEventListener('change', () => {
            anexosState[Number(sel.dataset.anexoIdx)].tipoDadosTermo = sel.value;
        });
    });

    container.querySelectorAll('.anexo-solicita-anexo').forEach(cb => {
        cb.addEventListener('change', () => {
            const idx = Number(cb.dataset.anexoIdx);
            anexosState[idx].solicitaAnexo = cb.checked;
            if (cb.checked && !anexosState[idx].labelSolicitacaoAnexo) {
                anexosState[idx].labelSolicitacaoAnexo = labelDoAnexo(anexosState[idx]);
            }
            renderAnexosState();
        });
    });

    container.querySelectorAll('.anexo-label-solicitacao').forEach(inp => {
        inp.addEventListener('input', () => {
            anexosState[Number(inp.dataset.anexoIdx)].labelSolicitacaoAnexo = inp.value;
        });
    });

    container.querySelectorAll('.anexo-solicitacao-obrigatoria').forEach(cb => {
        cb.addEventListener('change', () => {
            anexosState[Number(cb.dataset.anexoIdx)].anexoSolicitacaoObrigatorio = cb.checked;
        });
    });

    container.querySelectorAll('.anexo-is-availiativo').forEach(cb => {
        cb.addEventListener('change', () => {
            const idx = Number(cb.dataset.anexoIdx);
            anexosState[idx].isAvaliativo = cb.checked;
            if (!anexosState[idx].criteriosAvaliacao) anexosState[idx].criteriosAvaliacao = [];
            renderAnexosState();
        });
    });

    container.querySelectorAll('.anexo-num-avaliadores').forEach(inp => {
        inp.addEventListener('input', () => {
            anexosState[Number(inp.dataset.anexoIdx)].numAvaliadores = parseInt(inp.value) || 1;
        });
    });

    container.querySelectorAll('.anexo-modo-distribuicao').forEach(sel => {
        sel.addEventListener('change', () => {
            anexosState[Number(sel.dataset.anexoIdx)].modoDistribuicao = sel.value;
            renderAnexosState();
        });
    });

    container.querySelectorAll('.anexo-calcular-media').forEach(cb => {
        cb.addEventListener('change', () => {
            anexosState[Number(cb.dataset.anexoIdx)].calcularMedia = cb.checked;
            renderAnexosState();
        });
    });

    container.querySelectorAll('.anexo-tipo-media').forEach(sel => {
        sel.addEventListener('change', () => {
            anexosState[Number(sel.dataset.anexoIdx)].tipoMedia = sel.value;
        });
    });

    container.querySelectorAll('.anexo-exige-assinatura-avaliador').forEach(cb => {
        cb.addEventListener('change', () => {
            anexosState[Number(cb.dataset.anexoIdx)].exigeAssinaturaAvaliador = cb.checked;
        });
    });

    container.querySelectorAll('.criterio-label').forEach(inp => {
        inp.addEventListener('input', () => {
            const idx = Number(inp.dataset.criterioAnexoIdx);
            const cIdx = Number(inp.dataset.criterioIdx);
            if (anexosState[idx].criteriosAvaliacao[cIdx]) {
                anexosState[idx].criteriosAvaliacao[cIdx].label = inp.value;
            }
        });
    });

    container.querySelectorAll('.criterio-descricao').forEach(inp => {
        inp.addEventListener('input', () => {
            const idx = Number(inp.dataset.criterioAnexoIdx);
            const cIdx = Number(inp.dataset.criterioIdx);
            if (anexosState[idx].criteriosAvaliacao[cIdx]) {
                anexosState[idx].criteriosAvaliacao[cIdx].descricao = inp.value;
            }
        });
    });

    container.querySelectorAll('.criterio-nota-max').forEach(inp => {
        inp.addEventListener('input', () => {
            const idx = Number(inp.dataset.criterioAnexoIdx);
            const cIdx = Number(inp.dataset.criterioIdx);
            if (anexosState[idx].criteriosAvaliacao[cIdx]) {
                anexosState[idx].criteriosAvaliacao[cIdx].notaMaxima = parseFloat(inp.value) || 5;
            }
        });
    });

    container.querySelectorAll('.btn-remover-criterio').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = Number(btn.dataset.criterioAnexoIdx);
            const cIdx = Number(btn.dataset.criterioIdx);
            anexosState[idx].criteriosAvaliacao.splice(cIdx, 1);
            renderAnexosState();
        });
    });

    container.querySelectorAll('[data-add-criterio]').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = Number(btn.dataset.addCriterio);
            if (!anexosState[idx].criteriosAvaliacao) anexosState[idx].criteriosAvaliacao = [];
            anexosState[idx].criteriosAvaliacao.push({
                label: '', descricao: '', notaMaxima: 5, obrigatorio: true, origemIA: false
            });
            renderAnexosState();
        });
    });
}

/* ============================================================================
   SALVAR MODELO
   ============================================================================ */
const btnSalvarModelo = document.getElementById('btn-salvar-modelo');
if (btnSalvarModelo) {
    btnSalvarModelo.addEventListener('click', async () => {
        const btn = btnSalvarModelo;
        const conteudoOriginal = btn.innerHTML;

        try {
            const nome = document.getElementById('modelo-nome').value.trim();
            const descricao = document.getElementById('modelo-descricao').value.trim();
            const requerAvaliacao = document.getElementById('modelo-requer-avaliacao')?.checked || false;
            const permiteMultiplasInscricoes = document.getElementById('modelo-permite-multiplas')?.checked || false;

            const usarSistemaCotas = !!document.getElementById('modelo-usar-cotas')?.checked;
            const publicoLaudoCotas = document.getElementById('modelo-publico-laudo')?.value || 'professor';
            const labelLaudoCotas = (document.getElementById('modelo-label-laudo')?.value || 'Laudo Médico').trim();
            const laudoCotasObrigatorio = document.getElementById('modelo-laudo-obrigatorio')?.checked !== false;

            const usarCategorias = !!document.getElementById('modelo-usar-categorias')?.checked;
            const labelCategorias = (document.getElementById('modelo-label-categorias')?.value || 'Categoria / Modalidade').trim();
            const categoriaObrigatoria = document.getElementById('modelo-categoria-obrigatoria')?.checked !== false;

            if (!nome) {
                document.getElementById('modelo-nome').focus();
                throw new Error('Nome do modelo é obrigatório');
            }
            if (anexosState.length === 0) throw new Error('Adicione pelo menos um anexo base');
            if (usarCategorias && categoriasState.filter(c => c.label.trim()).length === 0) {
                throw new Error('Adicione pelo menos uma categoria ou desmarque a opção.');
            }

            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Salvando...';

            const anexosExtrasLimpos = anexosExtrasState.filter(a => a.label && a.label.trim()).map(a => ({
                label: a.label.trim(),
                obrigatorio: !!a.obrigatorio
            }));

            const categoriasLimpas = categoriasState.filter(c => c.label && c.label.trim()).map(c => ({
                label: c.label.trim()
            }));

            const anexosLimpos = anexosState.map(a => {
                const ehEdital = a.tipo === 'edital';
                return {
                    tipo: a.tipo,
                    labelCustom: (a.labelCustom || '').trim(),
                    nomeOriginal: a.nomeOriginal,
                    arquivo: a.arquivo,
                    mimetype: a.mimetype,
                    tamanho: a.tamanho,
                    campos: ehEdital ? [] : (a.campos || [])
                        .filter(c => c.label && c.label.trim())
                        .map(c => ({
                            label: c.label.trim(),
                            tipo: c.tipo,
                            obrigatorio: !!c.obrigatorio,
                            opcoes: c.opcoes || [],
                            placeholder: c.placeholder || '',
                            ajuda: c.ajuda || '',
                            origemIA: !!c.origemIA
                        })),
                    repetivel: ehEdital ? false : !!a.repetivel,
                    labelGrupoRepetivel: ehEdital ? '' : (a.labelGrupoRepetivel || '').trim(),
                    camposRepetiveis: ehEdital ? [] : (a.camposRepetiveis || [])
                        .filter(c => c.label && c.label.trim())
                        .map(c => ({
                            label: c.label.trim(),
                            tipo: c.tipo,
                            obrigatorio: !!c.obrigatorio,
                            opcoes: c.opcoes || [],
                            placeholder: c.placeholder || '',
                            ajuda: c.ajuda || '',
                            origemIA: !!c.origemIA
                        })),
                    quantidadePadrao: ehEdital ? 1 : (parseInt(a.quantidadePadrao) || 1),
                    maxRepeticoes: ehEdital ? 10 : (parseInt(a.maxRepeticoes) || 10),
                    exigeAssinatura: ehEdital ? false : !!a.exigeAssinatura,
                    exibeModalLeitura: ehEdital ? false : (a.exibeModalLeitura !== false),
                    tipoDadosTermo: ehEdital ? 'auto' : (a.tipoDadosTermo || 'auto'),
                    solicitaAnexo: ehEdital ? false : !!a.solicitaAnexo,
                    labelSolicitacaoAnexo: ehEdital ? '' : (a.labelSolicitacaoAnexo || '').trim(),
                    anexoSolicitacaoObrigatorio: ehEdital ? false : !!a.anexoSolicitacaoObrigatorio,
                    isAvaliativo: ehEdital ? false : !!a.isAvaliativo,
                    numAvaliadores: ehEdital ? 1 : (parseInt(a.numAvaliadores) || 1),
                    modoDistribuicao: ehEdital ? 'aleatorio' : (a.modoDistribuicao || 'aleatorio'),
                    calcularMedia: ehEdital ? false : (a.calcularMedia !== false),
                    tipoMedia: ehEdital ? 'aritmetica' : (a.tipoMedia || 'aritmetica'),
                    exigeAssinaturaAvaliador: ehEdital ? false : !!a.exigeAssinaturaAvaliador,
                    criteriosAvaliacao: ehEdital ? [] : (a.criteriosAvaliacao || [])
                        .filter(c => c.label && c.label.trim())
                        .map(c => ({
                            label: c.label.trim(),
                            descricao: (c.descricao || '').trim(),
                            notaMaxima: parseFloat(c.notaMaxima) || 5,
                            obrigatorio: c.obrigatorio !== false,
                            origemIA: !!c.origemIA
                        })),
                    informacoesDocumento: ehEdital ? '' : (a.informacoesDocumento || ''),
                    legendasNotas: ehEdital ? [] : (a.legendasNotas || [])
                };
            });

            const fd = new FormData();
            fd.append('nomeModelo', nome);
            fd.append('descricao', descricao);
            fd.append('anexos', JSON.stringify(anexosLimpos));
            fd.append('anexosExtras', JSON.stringify(anexosExtrasLimpos));
            fd.append('requerAvaliacao', requerAvaliacao);
            fd.append('permiteMultiplasInscricoes', permiteMultiplasInscricoes);
            fd.append('usarSistemaCotas', usarSistemaCotas);
            fd.append('publicoLaudoCotas', publicoLaudoCotas);
            fd.append('labelLaudoCotas', labelLaudoCotas);
            fd.append('laudoCotasObrigatorio', laudoCotasObrigatorio);
            fd.append('usarCategorias', usarCategorias);
            fd.append('labelCategorias', labelCategorias);
            fd.append('categorias', JSON.stringify(categoriasLimpas));
            fd.append('categoriaObrigatoria', categoriaObrigatoria);

            if (editandoModeloId) {
                await api(`${EV_API.modelos}/${editandoModeloId}`, { method: 'PUT', body: fd });
                toast('Modelo atualizado com sucesso!', 'success');
            } else {
                await api(EV_API.modelos, { method: 'POST', body: fd });
                toast('Modelo criado com sucesso!', 'success');
            }

            editandoModeloId = null;
            document.getElementById('modelo-nome').value = '';
            document.getElementById('modelo-descricao').value = '';
            document.getElementById('modelo-anexos').value = '';
            document.getElementById('modelo-requer-avaliacao').checked = false;
            document.getElementById('modelo-permite-multiplas').checked = false;
            document.getElementById('modelo-usar-cotas').checked = false;
            document.getElementById('modelo-usar-categorias').checked = false;
            document.getElementById('config-cotas-campos').style.display = 'none';
            document.getElementById('config-categorias-campos').style.display = 'none';

            document.getElementById('anexos-tipos-container').innerHTML = '';
            document.getElementById('ia-status').textContent = '';

            const header = document.querySelector('#panel-modelos .ev-card h3');
            if (header) header.innerHTML = '<i class="fas fa-file-upload"></i> Passo 1 — Anexos e Extração Automática';

            anexosState = [];
            anexosExtrasState = [];
            categoriasState = [];
            renderAnexosState();
            renderAnexosExtrasState();
            renderCategoriasState();
            carregarModelos();
            carregarDashboard();
        } catch (err) {
            mostrarAlerta('form-modelo-alert', `❌ ${err.message}`, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = conteudoOriginal;
        }
    });
}

async function carregarModelos() {
    const c = document.getElementById('lista-modelos');
    if (!c) return;
    c.innerHTML = '<div class="ev-empty"><i class="fas fa-circle-notch fa-spin"></i> Carregando...</div>';
    try {
        const data = await api(EV_API.modelos);
        const modelos = data.modelos || [];
        if (modelos.length === 0) {
            c.innerHTML = '<div class="ev-empty"><i class="fas fa-inbox"></i> Nenhum modelo ainda.</div>';
            return;
        }

        c.innerHTML = modelos.map(m => {
            const anexosResumo = (m.anexos || []).map(a => {
                const lab = labelDoAnexo(a);
                const ehEdital = a.tipo === 'edital';
                if (ehEdital) return `${lab} (apenas anexo)`;
                const n = (a.campos || []).length;
                const rep = a.repetivel ? ` • 🔁 ${a.camposRepetiveis?.length || 0}` : '';
                const ass = a.exigeAssinatura ? ' • ✍️' : '';
                const anexoPart = a.solicitaAnexo ? ' • 📎' : '';
                const avaliacaoPart = a.isAvaliativo
                    ? ` • ⭐ ${a.numAvaliadores || 1} ${a.modoDistribuicao === 'manual' ? '✋' : '🎲'}${a.calcularMedia !== false ? ' 📊' : ''}`
                    : '';
                const criteriosPart = (a.criteriosAvaliacao?.length)
                    ? ` • 🎯 ${a.criteriosAvaliacao.length} crit.`
                    : '';
                return `${lab} (${n}${rep}${ass}${anexoPart}${avaliacaoPart}${criteriosPart})`;
            }).join(' • ');

            const tags = [
                m.requerAvaliacao ? '<span class="ev-tag ev-tag-primary">⭐ Requer avaliação</span>' : '',
                m.permiteMultiplasInscricoes ? '<span class="ev-tag ev-tag-success">🔁 Múltiplas inscrições</span>' : '',
                m.usarSistemaCotas ? '<span class="ev-tag ev-tag-info">👥 Sistema de cotas</span>' : '',
                m.usarCategorias ? '<span class="ev-tag ev-tag-info">🏷️ Categorias</span>' : ''
            ].filter(Boolean).join('');

            return `
                <div class="ev-list-item">
                    <div class="ev-flex-1-min">
                        <h4>${escapeHtml(m.nomeModelo)}</h4>
                        <p>${escapeHtml(m.descricao || 'Sem descrição')}</p>
                        <p class="ev-anexos-resumo">${escapeHtml(anexosResumo || 'sem anexos')}</p>
                        ${tags ? `<div class="ev-anexo-tags">${tags}</div>` : ''}
                    </div>
                    <div class="ev-actions">
                        <button class="ev-btn ev-btn-secondary ev-btn-sm" onclick="verModelo('${m._id}')" title="Ver detalhes">
                            <i class="fas fa-eye"></i> Ver
                        </button>
                        <button class="ev-btn ev-btn-primary ev-btn-sm" onclick="editarModelo('${m._id}')" title="Editar">
                            <i class="fas fa-edit"></i> Editar
                        </button>
                        <button class="ev-btn ev-btn-danger ev-btn-sm" onclick="removerModelo('${m._id}')" title="Remover">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    } catch (err) {
        c.innerHTML = `<div class="ev-alert ev-alert-error">${escapeHtml(err.message)}</div>`;
    }
}

async function verModelo(id) {
    try {
        const data = await api(`${EV_API.modelos}/${id}`);
        const m = data.modelo;

        const html = `
            <div class="ev-modal-sec">
                <h5><i class="fas fa-file-alt"></i> ${escapeHtml(m.nomeModelo)}</h5>
                <p class="ev-hint">${escapeHtml(m.descricao || 'Sem descrição')}</p>
            </div>

            ${m.requerAvaliacao ? '<p class="ev-alert ev-alert-info"><i class="fas fa-star"></i> Este modelo requer avaliação.</p>' : ''}
            ${m.permiteMultiplasInscricoes ? '<p class="ev-alert ev-alert-success"><i class="fas fa-rotate"></i> Este modelo permite múltiplas inscrições.</p>' : ''}
            ${m.usarSistemaCotas ? `
                <p class="ev-alert ev-alert-info">
                    <i class="fas fa-users"></i> Sistema de cotas ativo — laudo direcionado para:
                    <strong>${m.publicoLaudoCotas === 'professor' ? 'Professor/Participante' : m.publicoLaudoCotas === 'aluno' ? 'Cada aluno' : 'Ambos'}</strong>
                    ${m.laudoCotasObrigatorio ? ' (obrigatório)' : ' (opcional)'}
                </p>
            ` : ''}
            ${m.usarCategorias ? `
                <p class="ev-alert ev-alert-info">
                    <i class="fas fa-tags"></i> Categorias ativas — campo: <strong>${escapeHtml(m.labelCategorias || 'Categoria / Modalidade')}</strong>
                    ${m.categoriaObrigatoria ? ' (obrigatório)' : ' (opcional)'}
                </p>
            ` : ''}

            <hr>

            <h6><i class="fas fa-paperclip"></i> Anexos (${(m.anexos || []).length})</h6>
            ${(m.anexos || []).map(a => {
                const ehEdital = a.tipo === 'edital';
                return `
                <div class="ev-anexo-view">
                    <div class="ev-anexo-view-header">
                        <strong>${escapeHtml(labelDoAnexo(a))}</strong>
                        <span class="ev-hint">${escapeHtml(a.nomeOriginal || '')}</span>
                    </div>
                    ${ehEdital ? `
                        <p class="ev-hint ev-hint-edital">
                            <i class="fas fa-info-circle"></i> Edital — apenas anexado, sem campos.
                        </p>
                    ` : `
                        <div class="ev-anexo-view-tags">
                            ${a.exigeAssinatura ? '<span class="ev-tag ev-tag-warning">✍️ Assinatura</span>' : ''}
                            ${a.solicitaAnexo ? `<span class="ev-tag ev-tag-primary">📎 ${escapeHtml(a.labelSolicitacaoAnexo || 'Anexo')}${a.anexoSolicitacaoObrigatorio ? ' (obrigatório)' : ''}</span>` : ''}
                            ${a.isAvaliativo ? `
                                <span class="ev-tag ev-tag-info">
                                    ⭐ ${a.numAvaliadores || 1} avaliador(es)
                                    · ${a.modoDistribuicao === 'manual' ? '✋ manual' : '🎲 aleatório'}
                                    ${a.calcularMedia !== false ? ' · 📊 média' : ''}
                                </span>
                            ` : ''}
                        </div>
                        ${(a.campos || []).length ? `
                            <div class="ev-anexo-view-campos">
                                <strong>Campos (${a.campos.length}):</strong>
                                ${a.campos.map(c => `<span class="ev-chip">${escapeHtml(c.label)}${c.obrigatorio ? ' *' : ''}</span>`).join('')}
                            </div>
                        ` : ''}
                        ${(a.camposRepetiveis || []).length ? `
                            <div class="ev-anexo-view-campos">
                                <strong>Repetíveis (${escapeHtml(a.labelGrupoRepetivel || '')}):</strong>
                                ${a.camposRepetiveis.map(c => `<span class="ev-chip ev-chip-rep">${escapeHtml(c.label)}</span>`).join('')}
                            </div>
                        ` : ''}
                        ${(a.criteriosAvaliacao || []).length ? `
                            <div class="ev-anexo-view-criterios">
                                <strong>🎯 Critérios (${a.criteriosAvaliacao.length}):</strong>
                                <ul>
                                    ${a.criteriosAvaliacao.map(c => `
                                        <li><strong>${escapeHtml(c.label)}</strong> (máx. ${c.notaMaxima || 5})${c.descricao ? ' — ' + escapeHtml(c.descricao) : ''}</li>
                                    `).join('')}
                                </ul>
                            </div>
                        ` : ''}
                    `}
                </div>
                `;
            }).join('')}

            ${(m.anexosExtras || []).length ? `
                <hr>
                <h6><i class="fas fa-paperclip"></i> Anexos Solicitados (${m.anexosExtras.length})</h6>
                <ul class="ev-anexos-list">
                    ${m.anexosExtras.map(a => `
                        <li>
                            <strong>${escapeHtml(a.label)}</strong>
                            ${a.obrigatorio ? ' <span class="ev-tag ev-tag-warning">Obrigatório</span>' : ' <span class="ev-tag">Opcional</span>'}
                        </li>
                    `).join('')}
                </ul>
            ` : ''}

            ${(m.categorias || []).length > 0 ? `
                <hr>
                <h6><i class="fas fa-tags"></i> Categorias (${m.categorias.length})</h6>
                <ul class="ev-anexos-list">
                    ${m.categorias.map(c => `<li><strong>${escapeHtml(c.label)}</strong></li>`).join('')}
                </ul>
            ` : ''}
        `;

        abrirModalCustom({
            titulo: '<i class="fas fa-file-alt"></i> Detalhes do Modelo',
            html,
            botoes: [{ label: '<i class="fas fa-times"></i> Fechar', classe: 'ev-btn-secondary', onClick: (modal) => modal.hide() }],
            largura: '720px'
        });
    } catch (err) {
        toast('Erro ao carregar modelo: ' + err.message, 'error');
    }
}

async function editarModelo(id) {
    try {
        const data = await api(`${EV_API.modelos}/${id}`);
        const m = data.modelo;

        document.getElementById('modelo-nome').value = m.nomeModelo || '';
        document.getElementById('modelo-descricao').value = m.descricao || '';
        document.getElementById('modelo-requer-avaliacao').checked = !!m.requerAvaliacao;
        const chkMultiplas = document.getElementById('modelo-permite-multiplas');
        if (chkMultiplas) chkMultiplas.checked = !!m.permiteMultiplasInscricoes;

        const chkUsarCotas = document.getElementById('modelo-usar-cotas');
        if (chkUsarCotas) {
            chkUsarCotas.checked = !!m.usarSistemaCotas;
            chkUsarCotas.dispatchEvent(new Event('change'));
        }

        if (m.usarSistemaCotas) {
            setTimeout(() => {
                const sel = document.getElementById('modelo-publico-laudo');
                const label = document.getElementById('modelo-label-laudo');
                const obrig = document.getElementById('modelo-laudo-obrigatorio');
                if (sel) sel.value = m.publicoLaudoCotas || 'professor';
                if (label) label.value = m.labelLaudoCotas || 'Laudo Médico';
                if (obrig) obrig.checked = m.laudoCotasObrigatorio !== false;
            }, 50);
        }

        const chkUsarCategorias = document.getElementById('modelo-usar-categorias');
        if (chkUsarCategorias) {
            chkUsarCategorias.checked = !!m.usarCategorias;
            chkUsarCategorias.dispatchEvent(new Event('change'));
        }

        if (m.usarCategorias) {
            setTimeout(() => {
                const labelCat = document.getElementById('modelo-label-categorias');
                const obrigCat = document.getElementById('modelo-categoria-obrigatoria');
                if (labelCat) labelCat.value = m.labelCategorias || 'Categoria / Modalidade';
                if (obrigCat) obrigCat.checked = m.categoriaObrigatoria !== false;

                categoriasState = (m.categorias || []).map(c => ({ label: c.label }));
                renderCategoriasState();
            }, 50);
        } else {
            categoriasState = [];
            renderCategoriasState();
        }

        const header = document.querySelector('#panel-modelos .ev-card h3');
        if (header) header.innerHTML = '<i class="fas fa-edit"></i> Editando Modelo';

        anexosState = (m.anexos || []).map(a => ({
            tipo: a.tipo,
            labelCustom: a.labelCustom || '',
            nomeOriginal: a.nomeOriginal,
            arquivo: a.arquivo,
            mimetype: a.mimetype,
            tamanho: a.tamanho,
            campos: a.campos || [],
            repetivel: !!a.repetivel,
            labelGrupoRepetivel: a.labelGrupoRepetivel || '',
            camposRepetiveis: a.camposRepetiveis || [],
            quantidadePadrao: a.quantidadePadrao || 1,
            maxRepeticoes: a.maxRepeticoes || 10,
            exigeAssinatura: !!a.exigeAssinatura,
            exibeModalLeitura: a.exibeModalLeitura !== false,
            tipoDadosTermo: a.tipoDadosTermo || 'auto',
            solicitaAnexo: !!a.solicitaAnexo,
            labelSolicitacaoAnexo: a.labelSolicitacaoAnexo || '',
            anexoSolicitacaoObrigatorio: !!a.anexoSolicitacaoObrigatorio,
            isAvaliativo: !!a.isAvaliativo,
            numAvaliadores: a.numAvaliadores || 1,
            modoDistribuicao: a.modoDistribuicao || 'aleatorio',
            calcularMedia: a.calcularMedia !== false,
            tipoMedia: a.tipoMedia || 'aritmetica',
            exigeAssinaturaAvaliador: !!a.exigeAssinaturaAvaliador,
            criteriosAvaliacao: (a.criteriosAvaliacao || []).map(c => ({
                label: c.label,
                descricao: c.descricao || '',
                notaMaxima: c.notaMaxima || 5,
                obrigatorio: c.obrigatorio !== false,
                origemIA: !!c.origemIA
            })),
            informacoesDocumento: a.informacoesDocumento || '',
            legendasNotas: a.legendasNotas || []
        }));

        anexosExtrasState = (m.anexosExtras || []).map(a => ({
            label: a.label || '',
            obrigatorio: !!a.obrigatorio
        }));

        renderAnexosState();
        renderAnexosExtrasState();

        editandoModeloId = id;
        document.getElementById('panel-modelos').scrollIntoView({ behavior: 'smooth' });
        toast('Modelo carregado para edição.', 'info');
    } catch (err) {
        toast('Erro ao carregar modelo: ' + err.message, 'error');
    }
}

async function removerModelo(id) {
    const ok = await confirmar({
        titulo: 'Remover modelo',
        mensagem: 'Deseja realmente remover este modelo? Eventos vinculados podem ser afetados.',
        textoOk: 'Remover'
    });
    if (!ok) return;
    try {
        await api(`${EV_API.modelos}/${id}`, { method: 'DELETE' });
        toast('Modelo removido.', 'success');
        carregarModelos();
        carregarDashboard();
    } catch (err) {
        toast('Erro ao remover: ' + err.message, 'error');
    }
}

/* ============================================================================
   EVENTOS
   ============================================================================ */
async function carregarModelosParaSelect() {
    const select = document.getElementById('evento-modelo');
    if (!select) return;
    try {
        const data = await api(EV_API.modelos);
        modelosCache = data.modelos || [];
        select.innerHTML = '<option value="">Selecione...</option>';
        modelosCache.forEach(m => {
            const o = document.createElement('option');
            o.value = m._id;
            const flags = (m.requerAvaliacao ? ' ⭐' : '') + (m.permiteMultiplasInscricoes ? ' 🔁' : '') + (m.usarSistemaCotas ? ' 👥' : '') + (m.usarCategorias ? ' 🏷️' : '');
            o.textContent = m.nomeModelo + flags;
            select.appendChild(o);
        });
    } catch (_) {
        select.innerHTML = '<option value="">Erro ao carregar modelos.</option>';
    }
}

async function carregarCoordenadoresParaSelect() {
    const select = document.getElementById('evento-coordenadores-select');
    if (!select) return;

    try {
        const data = await api(`${EV_API.avaliadores}/coordenadores-lista`);
        coordenadoresCache = data.coordenadores || [];

        if (coordenadoresCache.length === 0) {
            select.innerHTML = '<option value="">Nenhum coordenador aprovado ainda.</option>';
            return;
        }

        select.innerHTML = '<option value="">Selecione um coordenador...</option>' +
            coordenadoresCache.map(c =>
                `<option value="${escapeHtml(c.email)}">${escapeHtml(c.nomeCompleto)} (${escapeHtml(c.email)})</option>`
            ).join('');
    } catch (err) {
        select.innerHTML = '<option value="">Erro ao carregar coordenadores.</option>';
    }
}

function renderCoordenadoresTags() {
    const container = document.getElementById('coordenadores-tags');
    if (!container) return;

    if (coordenadoresState.length === 0) {
        container.innerHTML = '<span class="ev-hint">Nenhum coordenador adicionado.</span>';
        return;
    }

    container.innerHTML = coordenadoresState.map(email => {
        const coord = coordenadoresCache.find(c => c.email === email);
        const nome = coord ? coord.nomeCompleto : email;
        return `
            <span class="ev-coord-tag">
                <i class="fas fa-user-tie"></i>
                ${escapeHtml(nome)}
                <button type="button" onclick="removerCoordenador('${escapeHtml(email)}')" title="Remover">
                    <i class="fas fa-times"></i>
                </button>
            </span>
        `;
    }).join('');
}

function adicionarCoordenador() {
    const select = document.getElementById('evento-coordenadores-select');
    if (!select) return;
    const email = select.value;
    if (!email) return toast('Selecione um coordenador na lista.', 'warning');
    if (coordenadoresState.includes(email)) return toast('Este coordenador já foi adicionado.', 'warning');
    coordenadoresState.push(email);
    select.value = '';
    renderCoordenadoresTags();
}

function removerCoordenador(email) {
    coordenadoresState = coordenadoresState.filter(e => e !== email);
    renderCoordenadoresTags();
}

const formEvento = document.getElementById('form-evento');
if (formEvento) {
    formEvento.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btn-salvar-evento');
        const conteudoOriginal = btn.innerHTML;

        try {
            const payload = {
                titulo: document.getElementById('evento-titulo').value.trim(),
                modeloId: document.getElementById('evento-modelo').value,
                descricaoPublica: document.getElementById('evento-descricao').value.trim(),
                local: document.getElementById('evento-local').value.trim(),
                publicoAlvo: document.getElementById('evento-publico').value.trim(),
                vagas: document.getElementById('evento-vagas').value || null,
                dataInicioInscricao: document.getElementById('evento-data-inicio-inscricao').value,
                dataFimInscricao: document.getElementById('evento-data-fim-inscricao').value,
                dataInicioEvento: document.getElementById('evento-data-inicio').value || null,
                dataFimEvento: document.getElementById('evento-data-fim').value || null,
                status: document.getElementById('evento-status').value,
                coordenadoresEmails: coordenadoresState
            };

            if (!payload.titulo) throw new Error('Título é obrigatório');
            if (!payload.modeloId) throw new Error('Selecione um modelo');
            if (!payload.dataInicioInscricao || !payload.dataFimInscricao) throw new Error('Datas obrigatórias');

            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Salvando...';

            if (editandoEventoId) {
                await api(`${EV_API.eventos}/${editandoEventoId}`, { method: 'PUT', body: JSON.stringify(payload) });
                toast('Evento atualizado!', 'success');
            } else {
                await api(EV_API.eventos, { method: 'POST', body: JSON.stringify(payload) });
                toast('Evento criado!', 'success');
            }

            editandoEventoId = null;
            document.getElementById('form-evento').reset();
            coordenadoresState = [];
            renderCoordenadoresTags();

            const header = document.querySelector('#panel-eventos .ev-card h3');
            if (header) header.innerHTML = '<i class="fas fa-plus-circle"></i> Novo Evento';
            btn.innerHTML = '<i class="fas fa-save"></i> Criar Evento';

            carregarEventos();
            carregarDashboard();
        } catch (err) {
            mostrarAlerta('form-evento-alert', `❌ ${err.message}`, 'error');
        } finally {
            btn.disabled = false;
            if (btn.innerHTML.includes('fa-spinner') || btn.innerHTML.includes('fa-circle-notch')) {
                btn.innerHTML = conteudoOriginal;
            }
        }
    });
}

async function carregarEventos() {
    const c = document.getElementById('lista-eventos');
    if (!c) return;
    c.innerHTML = '<div class="ev-empty"><i class="fas fa-circle-notch fa-spin"></i> Carregando...</div>';
    try {
        const data = await api(EV_API.eventos);
        const eventos = data.eventos || [];
        if (eventos.length === 0) {
            c.innerHTML = '<div class="ev-empty"><i class="fas fa-calendar-xmark"></i> Nenhum evento ainda.</div>';
            return;
        }

        c.innerHTML = eventos.map(ev => `
            <div class="ev-list-item">
                <div class="ev-flex-1-min">
                    <h4>
                        ${escapeHtml(ev.titulo)}
                        ${ev.permiteMultiplasInscricoes ? '<span class="ev-tag ev-tag-success ev-ml-6">🔁</span>' : ''}
                    </h4>
                    <p>
                        <i class="fas fa-file-alt"></i> ${escapeHtml(ev.modeloId?.nomeModelo || '—')}
                        <span class="ev-sep">•</span>
                        <code>${escapeHtml(ev.slug)}</code>
                        <span class="ev-sep">•</span>
                        <i class="fas fa-users"></i> ${ev.totalParticipantes || 0}${ev.vagas ? '/' + ev.vagas : ''}
                    </p>
                    <p class="ev-dates">
                        <i class="fas fa-calendar"></i>
                        ${new Date(ev.dataInicioInscricao).toLocaleString('pt-BR')}
                        →
                        ${new Date(ev.dataFimInscricao).toLocaleString('pt-BR')}
                    </p>
                </div>
                <span class="ev-badge ev-badge-${(ev.status || '').toLowerCase()}">${escapeHtml(ev.status)}</span>
                <div class="ev-actions">
                    <button class="ev-btn ev-btn-secondary ev-btn-sm" onclick="verEvento('${ev._id}')" title="Ver">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="ev-btn ev-btn-primary ev-btn-sm" onclick="editarEvento('${ev._id}')" title="Editar">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="ev-btn ev-btn-secondary ev-btn-sm"
                            onclick="verInscricoes('${ev._id}', '${escapeHtml(ev.titulo).replace(/'/g, "\\'")}', '${ev.slug}')"
                            title="Ver inscrições">
                        <i class="fas fa-users"></i>
                    </button>
                    <button class="ev-btn ev-btn-danger ev-btn-sm" onclick="removerEvento('${ev._id}')" title="Remover">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
    } catch (err) {
        c.innerHTML = `<div class="ev-alert ev-alert-error">${escapeHtml(err.message)}</div>`;
    }
}

async function verEvento(id) {
    try {
        const data = await api(`${EV_API.eventos}/${id}`);
        const ev = data.evento;

        let configAvHtml = '';
        try {
            const cfgData = await api(`${EV_API.avaliacoes}/configuracao/${ev._id}`);
            if (cfgData.temAnexoAvaliativo) {
                const c = cfgData.configuracao || {};
                configAvHtml = `
                    <div class="ev-config-av">
                        <h6><i class="fas fa-gear"></i> Configuração de Avaliação do Evento</h6>
                        <div class="ev-grid-2">
                            <div class="ev-form-group ev-mb-0">
                                <label>Avaliadores por inscrição</label>
                                <input type="number" min="1" max="20" id="adm-cfg-num" value="${c.numAvaliadores || 1}">
                            </div>
                            <div class="ev-form-group ev-mb-0">
                                <label>Modo de distribuição</label>
                                <select id="adm-cfg-modo">
                                    <option value="aleatorio" ${c.modoDistribuicao === 'aleatorio' ? 'selected' : ''}>🎲 Aleatório</option>
                                    <option value="manual" ${c.modoDistribuicao === 'manual' ? 'selected' : ''}>✋ Manual</option>
                                </select>
                            </div>
                        </div>
                        <div class="ev-grid-2 ev-mt-12">
                            <div class="ev-form-group ev-mb-0">
                                <label>Tipo de média</label>
                                <select id="adm-cfg-tipo-media">
                                    <option value="aritmetica" ${c.tipoMedia === 'aritmetica' ? 'selected' : ''}>Aritmética</option>
                                    <option value="ponderada" ${c.tipoMedia === 'ponderada' ? 'selected' : ''}>Ponderada</option>
                                </select>
                            </div>
                            <div class="ev-form-group ev-mb-0">
                                <label class="ev-label-hidden">&nbsp;</label>
                                <label class="ev-switch ev-switch-sm ev-m-0">
                                    <input type="checkbox" id="adm-cfg-media" ${c.calcularMedia ? 'checked' : ''}>
                                    <span>📊 Calcular média</span>
                                </label>
                            </div>
                        </div>
                        <label class="ev-switch ev-switch-sm ev-mt-12">
                            <input type="checkbox" id="adm-cfg-assinatura" ${c.exigeAssinaturaAvaliador ? 'checked' : ''}>
                            <span>✍️ Exige assinatura do avaliador</span>
                        </label>
                        ${c.sorteioExecutadoEm ? `<p class="ev-hint ev-mt-8"><i class="fas fa-dice"></i> Sorteio executado em ${new Date(c.sorteioExecutadoEm).toLocaleString('pt-BR')}</p>` : ''}
                        <div class="ev-actions ev-mt-14">
                            <button class="ev-btn ev-btn-primary ev-btn-sm" onclick="salvarConfigAdmin('${ev._id}')">
                                <i class="fas fa-save"></i> Salvar Config
                            </button>
                            ${c.modoDistribuicao === 'aleatorio' ? `
                                <button class="ev-btn ev-btn-success ev-btn-sm" onclick="sortearAdmin('${ev._id}')">
                                    <i class="fas fa-dice"></i> Sortear Avaliadores
                                </button>
                                ${c.sorteioExecutadoEm ? `
                                    <button class="ev-btn ev-btn-danger ev-btn-sm" onclick="limparSorteioAdmin('${ev._id}')">
                                        <i class="fas fa-rotate-left"></i> Limpar Sorteio
                                    </button>
                                ` : ''}
                            ` : ''}
                        </div>
                    </div>
                `;
            }
        } catch (_) {
            console.warn('Sem permissão para ver configurações de avaliação (403).');
        }

        const coordenadoresHtml = (ev.coordenadores && ev.coordenadores.length > 0)
            ? ev.coordenadores.map(c => `
                <div class="ev-coord-view">
                    <i class="fas fa-user-tie"></i>
                    <strong>${escapeHtml(c.nomeCompleto || 'Sem nome')}</strong>
                    <span class="ev-hint">${escapeHtml(c.email)}</span>
                </div>
            `).join('')
            : '<p class="ev-hint">Nenhum coordenador vinculado.</p>';

        const html = `
            <div class="ev-modal-sec">
                <h5><i class="fas fa-calendar-day"></i> ${escapeHtml(ev.titulo)}</h5>
                <p class="ev-hint ev-justify">${escapeHtml(ev.descricaoPublica || '')}</p>
            </div>

            <table class="ev-detail-table">
                <tr><td>Modelo</td><td>${escapeHtml(ev.modeloId?.nomeModelo || '—')}${ev.modeloId?.requerAvaliacao ? ' ⭐' : ''}</td></tr>
                <tr><td>Slug</td><td><code>${escapeHtml(ev.slug)}</code></td></tr>
                <tr><td>Local</td><td>${escapeHtml(ev.local || '—')}</td></tr>
                <tr><td>Público-alvo</td><td>${escapeHtml(ev.publicoAlvo || '—')}</td></tr>
                <tr><td>Vagas</td><td>${ev.vagas || 'Ilimitado'}</td></tr>
                <tr><td>Múltiplas inscrições</td><td>${ev.permiteMultiplasInscricoes ? '🔁 Sim' : 'Não (inscrição única)'}</td></tr>
                <tr><td>Inscrições</td><td>${new Date(ev.dataInicioInscricao).toLocaleString('pt-BR')} → ${new Date(ev.dataFimInscricao).toLocaleString('pt-BR')}</td></tr>
                ${ev.dataInicioEvento ? `<tr><td>Evento</td><td>${new Date(ev.dataInicioEvento).toLocaleString('pt-BR')}${ev.dataFimEvento ? ' → ' + new Date(ev.dataFimEvento).toLocaleString('pt-BR') : ''}</td></tr>` : ''}
                <tr><td>Status</td><td><span class="ev-badge ev-badge-${(ev.status || '').toLowerCase()}">${escapeHtml(ev.status)}</span></td></tr>
                <tr><td>Criado por</td><td>${escapeHtml(ev.criadoPor?.nome || ev.criadoPor?.nomeCompleto || '—')}</td></tr>
            </table>

            ${configAvHtml}

            <div class="ev-modal-sec ev-mt-20">
                <h6><i class="fas fa-user-tie"></i> Coordenadores do Evento</h6>
                ${coordenadoresHtml}
            </div>
        `;

        abrirModalCustom({
            titulo: '<i class="fas fa-calendar-day"></i> Detalhes do Evento',
            html,
            botoes: [
                { label: '<i class="fas fa-external-link-alt"></i> Abrir link público', classe: 'ev-btn-secondary', onClick: () => { window.open(`/eventos/inscricao.html?slug=${ev.slug}`, '_blank'); } },
                { label: '<i class="fas fa-times"></i> Fechar', classe: 'ev-btn-primary', onClick: (modal) => modal.hide() }
            ],
            largura: '820px'
        });
    } catch (err) {
        toast('Erro ao carregar evento: ' + err.message, 'error');
    }
}

async function salvarConfigAdmin(eventoId) {
    try {
        const payload = {
            numAvaliadores: parseInt(document.getElementById('adm-cfg-num').value) || 1,
            modoDistribuicao: document.getElementById('adm-cfg-modo').value,
            calcularMedia: document.getElementById('adm-cfg-media').checked,
            tipoMedia: document.getElementById('adm-cfg-tipo-media').value,
            exigeAssinaturaAvaliador: document.getElementById('adm-cfg-assinatura').checked
        };
        await api(`${EV_API.avaliacoes}/configuracao/${eventoId}`, {
            method: 'PUT',
            body: JSON.stringify(payload)
        });
        toast('Configuração salva!', 'success');
        verEvento(eventoId);
    } catch (e) {
        toast('Erro ao salvar configuração: ' + e.message, 'error');
    }
}
window.salvarConfigAdmin = salvarConfigAdmin;

async function sortearAdmin(eventoId) {
    const ok = await confirmar({
        titulo: 'Sortear avaliadores',
        mensagem: 'Deseja executar o sorteio? As atribuições pendentes serão criadas automaticamente.',
        textoOk: 'Sortear',
        tipo: 'primary'
    });
    if (!ok) return;
    try {
        const resp = await api(`${EV_API.avaliacoes}/sortear/${eventoId}`, { method: 'POST' });
        let msg = resp.mensagem || 'Sorteio realizado';
        if (resp.semSorteio > 0) {
            toast(`${msg} — ⚠️ ${resp.semSorteio} inscrição(ões) sem atribuição completa.`, 'warning');
        } else {
            toast(msg, 'success');
        }
        verEvento(eventoId);
    } catch (e) {
        toast('Erro ao sortear: ' + e.message, 'error');
    }
}
window.sortearAdmin = sortearAdmin;

async function limparSorteioAdmin(eventoId) {
    const ok = await confirmar({
        titulo: 'Limpar sorteio',
        mensagem: 'Remover TODAS as atribuições aleatórias pendentes?',
        textoOk: 'Limpar'
    });
    if (!ok) return;
    try {
        const resp = await api(`${EV_API.avaliacoes}/limpar-sorteio/${eventoId}`, { method: 'POST' });
        toast(resp.mensagem || 'Sorteio limpo.', 'success');
        verEvento(eventoId);
    } catch (e) {
        toast('Erro ao limpar sorteio: ' + e.message, 'error');
    }
}
window.limparSorteioAdmin = limparSorteioAdmin;

async function editarEvento(id) {
    try {
        const data = await api(`${EV_API.eventos}/${id}`);
        const ev = data.evento;

        document.getElementById('evento-titulo').value = ev.titulo || '';
        document.getElementById('evento-descricao').value = ev.descricaoPublica || '';
        document.getElementById('evento-local').value = ev.local || '';
        document.getElementById('evento-publico').value = ev.publicoAlvo || '';
        document.getElementById('evento-vagas').value = ev.vagas || '';
        document.getElementById('evento-data-inicio-inscricao').value = toDatetimeLocal(ev.dataInicioInscricao);
        document.getElementById('evento-data-fim-inscricao').value = toDatetimeLocal(ev.dataFimInscricao);
        document.getElementById('evento-data-inicio').value = toDatetimeLocal(ev.dataInicioEvento);
        document.getElementById('evento-data-fim').value = toDatetimeLocal(ev.dataFimEvento);
        document.getElementById('evento-status').value = ev.status || 'Rascunho';

        await carregarCoordenadoresParaSelect();
        coordenadoresState = (ev.coordenadores || []).map(c => c.email).filter(Boolean);
        renderCoordenadoresTags();

        await carregarModelosParaSelect();
        document.getElementById('evento-modelo').value = ev.modeloId?._id || ev.modeloId;

        const header = document.querySelector('#panel-eventos .ev-card h3');
        if (header) header.innerHTML = '<i class="fas fa-edit"></i> Editando Evento';
        document.getElementById('btn-salvar-evento').innerHTML = '<i class="fas fa-save"></i> Salvar Alterações';

        editandoEventoId = id;
        document.getElementById('panel-eventos').scrollIntoView({ behavior: 'smooth' });
        toast('Evento carregado para edição.', 'info');
    } catch (err) {
        toast('Erro ao carregar evento: ' + err.message, 'error');
    }
}

function toDatetimeLocal(dateInput) {
    if (!dateInput) return '';
    const d = new Date(dateInput);
    if (isNaN(d)) return '';
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function removerEvento(id) {
    const ok = await confirmar({
        titulo: 'Remover evento',
        mensagem: 'Remover este evento e TODAS as inscrições vinculadas? Esta ação não pode ser desfeita.',
        textoOk: 'Remover tudo'
    });
    if (!ok) return;
    try {
        await api(`${EV_API.eventos}/${id}`, { method: 'DELETE' });
        toast('Evento removido.', 'success');
        carregarEventos();
        carregarDashboard();
    } catch (err) {
        toast('Erro ao remover: ' + err.message, 'error');
    }
}

/* ============================================================================
   INSCRIÇÕES
   ============================================================================ */
async function verInscricoes(eventoId, titulo, slug) {
    inscEventoId = eventoId;
    const elTitulo = document.getElementById('insc-evento-titulo');
    if (elTitulo) elTitulo.textContent = titulo;

    const link = `${location.origin}/eventos/inscricao.html?slug=${encodeURIComponent(slug)}`;
    const a = document.getElementById('link-publico');
    if (a) {
        a.href = link;
        a.textContent = link;
    }

    const btnCopiar = document.getElementById('btn-copiar-link');
    if (btnCopiar) {
        btnCopiar.onclick = () => {
            navigator.clipboard.writeText(link)
                .then(() => toast('Link copiado!', 'success'))
                .catch(() => toast('Não foi possível copiar.', 'error'));
        };
    }

    document.querySelectorAll('.ev-panel').forEach(p => p.classList.remove('active'));
    const painel = document.getElementById('panel-inscricoes');
    if (painel) painel.classList.add('active');
    carregarInscricoes();
}

const btnVoltarEventos = document.getElementById('btn-voltar-eventos');
if (btnVoltarEventos) {
    btnVoltarEventos.addEventListener('click', () => {
        document.getElementById('panel-inscricoes')?.classList.remove('active');
        document.getElementById('panel-eventos')?.classList.add('active');
        document.querySelectorAll('.ev-tab').forEach(t => t.classList.remove('active'));
        const t = document.querySelector('.ev-tab[data-tab="eventos"]');
        if (t) t.classList.add('active');
    });
}

async function carregarInscricoes() {
    const c = document.getElementById('lista-inscricoes');
    if (!c) return;
    c.innerHTML = '<div class="ev-empty"><i class="fas fa-circle-notch fa-spin"></i> Carregando...</div>';
    try {
        const data = await api(`${EV_API.inscricoes}?eventoId=${inscEventoId}`);
        const lista = data.inscricoes || [];
        if (lista.length === 0) {
            c.innerHTML = '<div class="ev-empty"><i class="fas fa-users-slash"></i> Nenhuma inscrição ainda.</div>';
            return;
        }

        c.innerHTML = lista.map(i => {
            const dados = i.dadosPreenchidos || {};
            const linhas = Object.entries(dados)
                .filter(([k]) => k !== '__assinaturas')
                .map(([k, v]) => `<strong>${escapeHtml(k.replace(/\[(\d+)\]/g, ' [$1]'))}:</strong> ${escapeHtml(v)}`)
                .join(' • ');

            return `
                <div class="ev-list-item ev-list-item-top">
                    <div class="ev-flex-1-min">
                        <h4>${escapeHtml(i.participante?.nomeCompleto || '—')}</h4>
                        <p>Protocolo: <code>${escapeHtml(i.protocolo)}</code></p>
                        <p class="ev-inscricao-dados">${linhas || '<em>sem dados</em>'}</p>
                        <p class="ev-inscricao-data">${new Date(i.createdAt).toLocaleString('pt-BR')}</p>
                    </div>
                    <span class="ev-badge ev-badge-${(i.status || '').toLowerCase()}">${escapeHtml(i.status)}</span>
                    <div class="ev-actions">
                        <button class="ev-btn ev-btn-secondary ev-btn-sm" onclick="verInscricaoDetalhe('${i._id}')" title="Ver detalhes">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="ev-btn ev-btn-primary ev-btn-sm" onclick="editarInscricao('${i._id}')" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="ev-btn ev-btn-danger ev-btn-sm" onclick="removerInscricao('${i._id}')" title="Remover">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    } catch (err) {
        c.innerHTML = `<div class="ev-alert ev-alert-error">${escapeHtml(err.message)}</div>`;
    }
}

async function verInscricaoDetalhe(id) {
    try {
        const data = await api(`${EV_API.inscricoes}/${id}`);
        const i = data.inscricao;

        const dadosHtml = Object.entries(i.dadosPreenchidos || {})
            .filter(([k]) => k !== '__assinaturas')
            .map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`)
            .join('') || '<tr><td colspan="2" class="ev-hint">Sem dados</td></tr>';

        const assinaturaHtml = i.assinaturaBase64
            ? `<div class="ev-modal-sec ev-mt-16">
                   <strong><i class="fas fa-signature"></i> Assinatura</strong>
                   <div class="ev-signature-box">
                       <img src="${i.assinaturaBase64}" alt="Assinatura">
                   </div>
               </div>`
            : '';

        const anexosArr = Object.entries(i.anexosParticipante || {});
        const anexosHtml = anexosArr.length
            ? `<div class="ev-modal-sec ev-mt-16">
                   <strong><i class="fas fa-paperclip"></i> Anexos enviados pelo participante:</strong>
                   <ul class="ev-anexos-list">
                       ${anexosArr.map(([chave, url]) => `
                           <li>
                               <strong>${escapeHtml(chave)}:</strong>
                               <a href="${escapeHtml(url)}" target="_blank">
                                   <i class="fas fa-external-link-alt"></i> Abrir arquivo
                               </a>
                           </li>
                       `).join('')}
                   </ul>
               </div>`
            : '';

        const html = `
            <div class="ev-modal-sec">
                <h5>${escapeHtml(i.participante?.nomeCompleto || '—')}</h5>
                <p>
                    Protocolo: <code>${escapeHtml(i.protocolo)}</code>
                    <span class="ev-badge ev-badge-${(i.status || '').toLowerCase()} ev-ml-8">${escapeHtml(i.status)}</span>
                </p>
            </div>
            <hr>
            <h6><i class="fas fa-clipboard-list"></i> Dados preenchidos</h6>
            <table class="ev-detail-table">${dadosHtml}</table>
            ${assinaturaHtml}
            ${anexosHtml}
            ${i.observacoesAdmin ? `
                <div class="ev-modal-sec ev-mt-16">
                    <strong>Observações:</strong>
                    <p>${escapeHtml(i.observacoesAdmin)}</p>
                </div>
            ` : ''}
        `;

        abrirModalCustom({
            titulo: '<i class="fas fa-clipboard-list"></i> Detalhes da Inscrição',
            html,
            botoes: [{ label: '<i class="fas fa-times"></i> Fechar', classe: 'ev-btn-secondary', onClick: (modal) => modal.hide() }],
            largura: '720px'
        });
    } catch (err) {
        toast('Erro ao carregar inscrição: ' + err.message, 'error');
    }
}

async function editarInscricao(id) {
    try {
        const data = await api(`${EV_API.inscricoes}/${id}`);
        const i = data.inscricao;

        const camposEdicao = Object.entries(i.dadosPreenchidos || {})
            .filter(([k]) => k !== '__assinaturas')
            .map(([k, v]) => `
                <div class="ev-form-group">
                    <label>${escapeHtml(k)}</label>
                    <input type="text" class="edit-insc-campo" data-key="${escapeHtml(k)}" value="${escapeHtml(v)}">
                </div>
            `).join('');

        const html = `
            <div class="ev-modal-sec">
                <h5>${escapeHtml(i.participante?.nomeCompleto || '—')}</h5>
                <p class="ev-hint">Protocolo: ${escapeHtml(i.protocolo)}</p>
            </div>

            <div class="ev-form-group">
                <label>Status</label>
                <select id="edit-insc-status">
                    ${['Pendente', 'Confirmada', 'Cancelada', 'Presente', 'Ausente'].map(s =>
                        `<option value="${s}" ${i.status === s ? 'selected' : ''}>${s}</option>`
                    ).join('')}
                </select>
            </div>

            <h6 class="ev-mt-18"><i class="fas fa-clipboard-list"></i> Dados preenchidos</h6>
            ${camposEdicao}

            <div class="ev-form-group">
                <label>Observações do admin</label>
                <textarea id="edit-insc-obs" rows="3">${escapeHtml(i.observacoesAdmin || '')}</textarea>
            </div>
        `;

        abrirModalCustom({
            titulo: '<i class="fas fa-edit"></i> Editar Inscrição',
            html,
            botoes: [
                { label: '<i class="fas fa-times"></i> Cancelar', classe: 'ev-btn-secondary', onClick: (modal) => modal.hide() },
                {
                    label: '<i class="fas fa-save"></i> Salvar',
                    classe: 'ev-btn-primary',
                    onClick: async (modal, modalEl) => {
                        try {
                            const status = modalEl.querySelector('#edit-insc-status').value;
                            const observacoesAdmin = modalEl.querySelector('#edit-insc-obs').value;
                            const dadosPreenchidos = {};
                            modalEl.querySelectorAll('.edit-insc-campo').forEach(inp => {
                                dadosPreenchidos[inp.dataset.key] = inp.value;
                            });
                            await api(`${EV_API.inscricoes}/${id}`, {
                                method: 'PUT',
                                body: JSON.stringify({ status, observacoesAdmin, dadosPreenchidos })
                            });
                            toast('Inscrição atualizada!', 'success');
                            modal.hide();
                            carregarInscricoes();
                        } catch (err) {
                            toast('Erro ao salvar: ' + err.message, 'error');
                        }
                    }
                }
            ],
            largura: '720px'
        });
    } catch (err) {
        toast('Erro ao carregar inscrição: ' + err.message, 'error');
    }
}

async function removerInscricao(id) {
    const ok = await confirmar({
        titulo: 'Remover inscrição',
        mensagem: 'Deseja realmente remover esta inscrição?',
        textoOk: 'Remover'
    });
    if (!ok) return;
    try {
        await api(`${EV_API.inscricoes}/${id}`, { method: 'DELETE' });
        toast('Inscrição removida.', 'success');
        carregarInscricoes();
    } catch (err) {
        toast('Erro ao remover: ' + err.message, 'error');
    }
}

/* ============================================================================
   GESTÃO DE USUÁRIOS
   ============================================================================ */
const usuariosState = {
    lista: [],
    filtro: { busca: '', status: '', tipo: '' }
};

async function criarUsuarioAdmin() {
    const nomeCompleto = document.getElementById('user-nome').value.trim();
    const email = document.getElementById('user-email').value.trim();
    const senha = document.getElementById('user-senha').value;
    const isCoordenador = document.getElementById('user-tipo').value === 'true';

    if (!nomeCompleto || !email || !senha) {
        return mostrarAlerta('form-usuario-alert', 'Preencha todos os campos.', 'error');
    }
    if (senha.length < 6) {
        return mostrarAlerta('form-usuario-alert', 'A senha deve ter no mínimo 6 caracteres.', 'error');
    }

    try {
        await api(`${EV_API.avaliadores}/admin-criar`, {
            method: 'POST',
            body: JSON.stringify({ nomeCompleto, email, senha, isCoordenador })
        });
        toast('Usuário criado com sucesso!', 'success');
        document.getElementById('user-nome').value = '';
        document.getElementById('user-email').value = '';
        document.getElementById('user-senha').value = '';
        carregarTodosUsuarios();
        carregarCoordenadoresParaSelect();
    } catch (err) {
        mostrarAlerta('form-usuario-alert', `❌ ${err.message}`, 'error');
    }
}

const debounceUsuarios = debounce(() => {
    usuariosState.filtro.busca = document.getElementById('filtro-usuarios-busca')?.value || '';
    carregarTodosUsuarios();
}, 320);

function aplicarFiltrosUsuarios() {
    usuariosState.filtro.status = document.getElementById('filtro-usuarios-status')?.value || '';
    usuariosState.filtro.tipo = document.getElementById('filtro-usuarios-tipo')?.value || '';
    carregarTodosUsuarios();
}

function limparFiltrosUsuarios() {
    const busca = document.getElementById('filtro-usuarios-busca');
    const status = document.getElementById('filtro-usuarios-status');
    const tipo = document.getElementById('filtro-usuarios-tipo');
    if (busca) busca.value = '';
    if (status) status.value = '';
    if (tipo) tipo.value = '';
    usuariosState.filtro = { busca: '', status: '', tipo: '' };
    carregarTodosUsuarios();
}

let _eventosCacheUsr = null;

function montarOpcoesEventosDisponiveis(eventosVinculados) {
    if (!_eventosCacheUsr) return '';
    const ids = new Set((eventosVinculados || []).map(e => String(e._id || e)));
    return _eventosCacheUsr
        .filter(e => !ids.has(String(e._id)))
        .map(e => `<option value="${e._id}">${escapeHtml(e.titulo)}</option>`)
        .join('');
}

async function carregarTodosUsuarios() {
    const container = document.getElementById('lista-todos-avaliadores');
    if (!container) return;
    container.innerHTML = '<div class="ev-empty"><i class="fas fa-circle-notch fa-spin"></i> Carregando...</div>';

    try {
        try {
            const evData = await api(EV_API.eventos);
            _eventosCacheUsr = evData.eventos || [];
            setTimeout(() => { _eventosCacheUsr = null; }, 30000);
        } catch (_) {
            _eventosCacheUsr = _eventosCacheUsr || [];
        }

        const params = new URLSearchParams();
        if (usuariosState.filtro.busca) params.set('busca', usuariosState.filtro.busca);
        if (usuariosState.filtro.status) params.set('status', usuariosState.filtro.status);
        if (usuariosState.filtro.tipo) params.set('tipo', usuariosState.filtro.tipo);

        const url = `${EV_API.eventos}/admin/usuarios${params.toString() ? '?' + params.toString() : ''}`;
        const data = await api(url);
        const usuarios = data.usuarios || [];
        usuariosState.lista = usuarios;

        const stats = data.estatisticas || {};
        const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v ?? 0; };
        setTxt('usr-total', stats.total);
        setTxt('usr-pendentes', stats.pendentes);
        setTxt('usr-ativos', stats.ativos);
        setTxt('usr-coords', stats.coordenadores);
        setTxt('usr-filtrados', usuarios.length);

        if (usuarios.length === 0) {
            container.innerHTML = `
                <div class="ev-empty">
                    <i class="fas fa-user-slash"></i>
                    Nenhum usuário encontrado com os filtros atuais.
                    <button class="ev-btn ev-btn-secondary ev-btn-sm ev-mt-10" onclick="limparFiltrosUsuarios()">
                        <i class="fas fa-eraser"></i> Limpar filtros
                    </button>
                </div>`;
            return;
        }

        container.innerHTML = usuarios.map(u => {
            const eventos = u.eventos || [];
            const badgesVinculados = eventos.length > 0
                ? eventos.map(ev => `
                    <span class="ev-user-ev-tag">
                        <i class="fas fa-link"></i> ${escapeHtml(ev.titulo)}
                        <button type="button" onclick="desvincularAvaliadorAdmin('${u._id}', '${ev._id}')" title="Desvincular">
                            <i class="fas fa-times"></i>
                        </button>
                    </span>`).join('')
                : '<span class="ev-hint">Nenhum evento vinculado</span>';

            const statusCor = u.status === 'Ativo' ? 'ev-tag-success'
                : u.status === 'Pendente' ? 'ev-tag-warning'
                : u.status === 'Bloqueado' ? 'ev-tag-danger' : '';

            const iniciais = (u.nomeCompleto || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
            const opcoesEventos = montarOpcoesEventosDisponiveis(eventos);

            return `
                <div class="ev-user-card" data-uid="${u._id}">
                    <div class="ev-user-card-header">
                        <div class="ev-user-avatar">${escapeHtml(iniciais)}</div>
                        <div class="ev-user-card-info">
                            <h4>
                                ${escapeHtml(u.nomeCompleto)}
                                ${u.isCoordenador
                                    ? '<span class="ev-tag ev-tag-primary">Coordenador</span>'
                                    : '<span class="ev-tag">Avaliador</span>'}
                                <span class="ev-tag ${statusCor}">${escapeHtml(u.status || '—')}</span>
                            </h4>
                            <p class="ev-hint"><i class="fas fa-envelope"></i> ${escapeHtml(u.email)}</p>
                        </div>
                        <div class="ev-user-card-actions">
                            <button class="ev-btn ev-btn-secondary ev-btn-sm" onclick="verUsuarioAdmin('${u._id}')" title="Ver detalhes">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button class="ev-btn ev-btn-primary ev-btn-sm" onclick="editarUsuarioAdmin('${u._id}')" title="Editar">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="ev-btn ev-btn-warning ev-btn-sm" onclick="resetarSenhaAdmin('${u._id}')" title="Resetar senha">
                                <i class="fas fa-key"></i>
                            </button>
                            ${u.status === 'Pendente'
                                ? `<button class="ev-btn ev-btn-success ev-btn-sm" onclick="aprovarUsuarioAdmin('${u._id}')" title="Aprovar">
                                       <i class="fas fa-check"></i>
                                   </button>`
                                : ''}
                            <button class="ev-btn ev-btn-danger ev-btn-sm" onclick="removerUsuarioAdmin('${u._id}')" title="Excluir">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>

                    <div class="ev-user-card-body">
                        <div class="ev-user-card-label">
                            <i class="fas fa-calendar-check"></i>
                            Eventos vinculados (${eventos.length})
                        </div>
                        <div class="ev-user-card-tags">${badgesVinculados}</div>

                        <div class="ev-user-link-row">
                            <select id="select-ev-${u._id}" class="ev-input">
                                <option value="">Vincular a um novo evento...</option>
                                ${opcoesEventos}
                            </select>
                            <button class="ev-btn ev-btn-secondary ev-btn-sm" onclick="vincularAvaliadorAdmin('${u._id}', '${escapeHtml(u.email)}')">
                                <i class="fas fa-link"></i> Vincular
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (err) {
        container.innerHTML = `<div class="ev-alert ev-alert-error">${escapeHtml(err.message)}</div>`;
    }
}

async function verUsuarioAdmin(id) {
    try {
        const data = await api(`${EV_API.eventos}/admin/usuarios/${id}`);
        const u = data.usuario;
        const st = u.estatisticas || {};
        const eventos = u.eventos || [];

        const html = `
            <div class="ev-user-modal-header">
                <div class="ev-user-avatar">${escapeHtml((u.nomeCompleto || '?').split(' ').map(n => n[0]).slice(0,2).join('').toUpperCase())}</div>
                <div>
                    <h5 class="ev-user-modal-nome">${escapeHtml(u.nomeCompleto)}</h5>
                    <p class="ev-hint ev-user-modal-email">
                        <i class="fas fa-envelope"></i> ${escapeHtml(u.email)}
                    </p>
                </div>
            </div>

            <div class="ev-grid-2 ev-mt-16">
                <div class="ev-stat"><h3>Avaliações</h3><div class="ev-stat-value">${st.totalAvaliacoes || 0}</div></div>
                <div class="ev-stat"><h3>Pendentes</h3><div class="ev-stat-value">${st.totalAtribuicoesPendentes || 0}</div></div>
            </div>

            <table class="ev-detail-table ev-mt-18">
                <tr><td>Tipo</td><td>${u.isCoordenador ? '👨‍🏫 Coordenador' : '🧑‍💻 Avaliador'}</td></tr>
                <tr><td>Status</td><td><span class="ev-tag">${escapeHtml(u.status)}</span></td></tr>
                <tr><td>Criado em</td><td>${u.createdAt ? new Date(u.createdAt).toLocaleString('pt-BR') : '—'}</td></tr>
                ${u.ultimoLogin ? `<tr><td>Último login</td><td>${new Date(u.ultimoLogin).toLocaleString('pt-BR')}</td></tr>` : ''}
            </table>

            <h6 class="ev-mt-20"><i class="fas fa-calendar-check"></i> Eventos vinculados (${eventos.length})</h6>
            ${eventos.length === 0
                ? '<p class="ev-hint">Nenhum evento vinculado.</p>'
                : `<ul class="ev-anexos-list">
                     ${eventos.map(ev => `
                         <li>
                             <strong>${escapeHtml(ev.titulo)}</strong>
                             <span class="ev-tag">${escapeHtml(ev.status || '—')}</span>
                         </li>`).join('')}
                   </ul>`}
        `;

        abrirModalCustom({
            titulo: '<i class="fas fa-user"></i> Detalhes do Usuário',
            html,
            botoes: [
                { label: '<i class="fas fa-edit"></i> Editar', classe: 'ev-btn-primary', onClick: (modal) => { modal.hide(); editarUsuarioAdmin(id); } },
                { label: '<i class="fas fa-times"></i> Fechar', classe: 'ev-btn-secondary', onClick: (modal) => modal.hide() }
            ],
            largura: '680px'
        });
    } catch (err) {
        toast('Erro ao carregar usuário: ' + err.message, 'error');
    }
}

async function editarUsuarioAdmin(id) {
    try {
        const data = await api(`${EV_API.eventos}/admin/usuarios/${id}`);
        const u = data.usuario;

        const html = `
            <div class="ev-form-group">
                <label>Nome completo *</label>
                <input type="text" id="edit-usr-nome" value="${escapeHtml(u.nomeCompleto)}">
            </div>
            <div class="ev-form-group">
                <label>E-mail *</label>
                <input type="email" id="edit-usr-email" value="${escapeHtml(u.email)}">
            </div>
            <div class="ev-form-grid-2">
                <div class="ev-form-group">
                    <label>Tipo</label>
                    <select id="edit-usr-tipo">
                        <option value="false" ${!u.isCoordenador ? 'selected' : ''}>Avaliador</option>
                        <option value="true" ${u.isCoordenador ? 'selected' : ''}>Coordenador</option>
                    </select>
                </div>
                <div class="ev-form-group">
                    <label>Status</label>
                    <select id="edit-usr-status">
                        ${['Pendente','Ativo','Inativo','Bloqueado'].map(s =>
                            `<option value="${s}" ${u.status === s ? 'selected' : ''}>${s}</option>`
                        ).join('')}
                    </select>
                </div>
            </div>
        `;

        abrirModalCustom({
            titulo: '<i class="fas fa-edit"></i> Editar Usuário',
            html,
            botoes: [
                { label: '<i class="fas fa-times"></i> Cancelar', classe: 'ev-btn-secondary', onClick: (modal) => modal.hide() },
                {
                    label: '<i class="fas fa-save"></i> Salvar',
                    classe: 'ev-btn-primary',
                    onClick: async (modal, modalEl) => {
                        try {
                            const payload = {
                                nomeCompleto: modalEl.querySelector('#edit-usr-nome').value.trim(),
                                email: modalEl.querySelector('#edit-usr-email').value.trim(),
                                isCoordenador: modalEl.querySelector('#edit-usr-tipo').value === 'true',
                                status: modalEl.querySelector('#edit-usr-status').value
                            };
                            if (!payload.nomeCompleto) throw new Error('Nome é obrigatório');
                            if (!payload.email) throw new Error('E-mail é obrigatório');

                            await api(`${EV_API.eventos}/admin/usuarios/${id}`, {
                                method: 'PUT',
                                body: JSON.stringify(payload)
                            });
                            toast('Usuário atualizado!', 'success');
                            modal.hide();
                            carregarTodosUsuarios();
                            carregarCoordenadoresParaSelect();
                        } catch (err) {
                            toast('Erro: ' + err.message, 'error');
                        }
                    }
                }
            ],
            largura: '560px'
        });
    } catch (err) {
        toast('Erro ao carregar usuário: ' + err.message, 'error');
    }
}

async function resetarSenhaAdmin(id) {
    const ok = await confirmar({
        titulo: 'Resetar senha',
        mensagem: 'Deseja gerar uma nova senha temporária para este usuário? Ele precisará trocá-la no próximo acesso.',
        textoOk: 'Resetar'
    });
    if (!ok) return;

    try {
        const data = await api(`${EV_API.eventos}/admin/usuarios/${id}/resetar-senha`, {
            method: 'PUT',
            body: JSON.stringify({})
        });

        const senha = data.novaSenha;
        const html = `
            <div class="ev-modal-sec ev-text-center">
                <i class="fas fa-key ev-senha-icone"></i>
                <h5>Nova senha gerada</h5>
                <p class="ev-hint">Repasse ao usuário por um canal seguro. Ele deverá trocá-la no próximo acesso.</p>
                <div class="ev-senha-revelada" id="senha-box">
                    <code>${escapeHtml(senha)}</code>
                </div>
            </div>
        `;

        abrirModalCustom({
            titulo: '<i class="fas fa-key"></i> Senha Resetada',
            html,
            botoes: [
                {
                    label: '<i class="fas fa-copy"></i> Copiar senha',
                    classe: 'ev-btn-secondary',
                    onClick: () => {
                        navigator.clipboard.writeText(senha)
                            .then(() => toast('Senha copiada!', 'success'))
                            .catch(() => toast('Não foi possível copiar.', 'error'));
                    }
                },
                { label: '<i class="fas fa-check"></i> Fechar', classe: 'ev-btn-primary', onClick: (modal) => modal.hide() }
            ],
            largura: '480px'
        });
    } catch (err) {
        toast('Erro ao resetar senha: ' + err.message, 'error');
    }
}

async function removerUsuarioAdmin(id) {
    const ok = await confirmar({
        titulo: 'Excluir usuário',
        mensagem: 'Esta ação é irreversível. Todas as avaliações e vínculos com eventos serão removidos. Deseja continuar?',
        textoOk: 'Excluir permanentemente'
    });
    if (!ok) return;

    try {
        const data = await api(`${EV_API.eventos}/admin/usuarios/${id}`, { method: 'DELETE' });
        toast(data.mensagem || 'Usuário removido.', 'success');
        carregarTodosUsuarios();
        carregarCoordenadoresParaSelect();
    } catch (err) {
        toast('Erro ao remover: ' + err.message, 'error');
    }
}

async function aprovarUsuarioAdmin(id) {
    try {
        await api(`${EV_API.avaliadores}/${id}/aprovar`, { method: 'PUT' });
        toast('Usuário aprovado!', 'success');
        carregarTodosUsuarios();
        carregarCoordenadoresParaSelect();
    } catch (err) {
        toast('Erro ao aprovar: ' + err.message, 'error');
    }
}

async function vincularAvaliadorAdmin(avaliadorId, email) {
    const select = document.getElementById(`select-ev-${avaliadorId}`);
    if (!select) return;
    const eventoId = select.value;
    if (!eventoId) return toast('Selecione um evento.', 'warning');

    try {
        const data = await api(`${EV_API.avaliadores}/vincular`, {
            method: 'POST',
            body: JSON.stringify({ eventoId, email })
        });
        toast(data.message || 'Avaliador vinculado!', 'success');
        await carregarTodosUsuarios();
    } catch (err) {
        toast('Erro ao vincular: ' + err.message, 'error');
    }
}

async function desvincularAvaliadorAdmin(avaliadorId, eventoId) {
    const ok = await confirmar({
        titulo: 'Desvincular avaliador',
        mensagem: 'Deseja desvincular este avaliador do evento?',
        textoOk: 'Desvincular'
    });
    if (!ok) return;

    try {
        const data = await api(`${EV_API.avaliadores}/desvincular`, {
            method: 'POST',
            body: JSON.stringify({ eventoId, avaliadorId })
        });
        toast(data.message || 'Avaliador desvinculado.', 'success');
        await carregarTodosUsuarios();
    } catch (err) {
        toast('Erro ao desvincular: ' + err.message, 'error');
    }
}

/* ============================================================================
   EXPOSIÇÃO GLOBAL (para onclick inline no HTML)
   ============================================================================ */
(function exporGlobais() {
    const mapa = {
        criarUsuarioAdmin,
        carregarTodosUsuarios,
        verUsuarioAdmin,
        editarUsuarioAdmin,
        resetarSenhaAdmin,
        removerUsuarioAdmin,
        aprovarUsuarioAdmin,
        limparFiltrosUsuarios,
        aplicarFiltrosUsuarios,
        vincularAvaliadorAdmin,
        desvincularAvaliadorAdmin,
        adicionarCoordenador,
        removerCoordenador,
        verModelo,
        editarModelo,
        removerModelo,
        verEvento,
        editarEvento,
        removerEvento,
        verInscricoes,
        verInscricaoDetalhe,
        editarInscricao,
        removerInscricao,
        salvarConfigAdmin,
        sortearAdmin,
        limparSorteioAdmin
    };

    Object.entries(mapa).forEach(([nome, fn]) => {
        if (typeof fn === 'function') {
            window[nome] = fn;
        } else {
            console.warn(`[eventos.js] Função "${nome}" não encontrada ou não é função — não foi exposta globalmente.`);
        }
    });
})();

/* ============================================================================
   INIT
   ============================================================================ */
document.addEventListener('DOMContentLoaded', () => {
    if (!getToken()) {
        window.location.href = '/login.html?redirect=' + encodeURIComponent('/eventos/eventos.html');
        return;
    }
    renderCoordenadoresTags();
    configurarSistemaCotas();
    configurarCategorias();
    renderAnexosExtrasState();
    renderCategoriasState();

    const buscaUsr = document.getElementById('filtro-usuarios-busca');
    if (buscaUsr) buscaUsr.addEventListener('input', debounceUsuarios);

    ['filtro-usuarios-status', 'filtro-usuarios-tipo'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', aplicarFiltrosUsuarios);
    });

    carregarDashboard();
});