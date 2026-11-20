/* ============================================================================
   inscricoes-admin.js — Painel de gestão de inscrições
   Carregado por: gerenciar.html
   ============================================================================ */
'use strict';

const API = {
    base: '/api/inscricoes',
    admin: '/api/inscricoes/admin',
    dashboard: '/api/inscricoes/admin/dashboard',
    config: '/api/inscricoes/admin/config',
    exportar: '/api/inscricoes/admin/exportar',
    opcoes: '/api/inscricoes/admin/opcoes',
    passkeys: '/api/inscricoes/passkeys/admin'
};

// ============================================================================
// HELPERS
// ============================================================================
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

function getToken() {
    return localStorage.getItem('auth_token')
        || sessionStorage.getItem('auth_token')
        || localStorage.getItem('token')
        || sessionStorage.getItem('token');
}

function getPerfil() {
    try {
        const token = getToken();
        if (!token || token.split('.').length !== 3) return null;
        const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        return { id: payload.id || payload._id, role: payload.role || '', nome: payload.nome || payload.name || '' };
    } catch (_) { return null; }
}

function normalizarRole(role) {
    if (!role) return '';
    return String(role).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
        .replace(/\s+/g, '_').replace(/-/g, '_').replace(/_geral$/i, '').replace(/^gestao_geral$/i, 'gestao');
}

function isAdmin() {
    const role = normalizarRole(getPerfil()?.role);
    return role === 'admin' || role === 'super_admin';
}

function escapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function api(url, options = {}) {
    const token = getToken();
    const headers = {
        ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...(options.headers || {})
    };
    const resp = await fetch(url, { ...options, headers, credentials: 'include' });

    if (resp.status === 401) {
        const data = await resp.clone().json().catch(() => ({}));
        if (data.precisaLogin || data.motivo === 'reset_global') {
            localStorage.removeItem('auth_token');
            localStorage.removeItem('token');
            sessionStorage.removeItem('auth_token');
            sessionStorage.removeItem('token');
            window.location.href = '/login.html?redirect=' + encodeURIComponent(window.location.pathname);
            throw new Error('Sessão encerrada.');
        }
    }
    if (resp.status === 403) {
        const data = await resp.clone().json().catch(() => ({}));
        const err = new Error(data.error || 'Seu perfil não tem permissão para executar esta ação.');
        err.status = 403; err.debug = data.debug || null;
        throw err;
    }
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || `Erro ${resp.status}`);
    return data;
}

function toast(msg, tipo = 'info', duracao = 4000) {
    const wrap = document.getElementById('adm-toast-wrap');
    if (!wrap) return;
    const el = document.createElement('div');
    el.className = `adm-toast adm-toast-${tipo}`;
    const icones = { info:'fa-circle-info', success:'fa-circle-check', error:'fa-circle-exclamation', warning:'fa-triangle-exclamation' };
    el.innerHTML = `<i class="fas ${icones[tipo] || icones.info}"></i><span>${escapeHtml(msg)}</span>`;
    wrap.appendChild(el);
    const remover = () => { el.classList.add('saindo'); setTimeout(() => el.remove(), 220); };
    setTimeout(remover, duracao);
    el.addEventListener('click', remover);
}

function loader(ativo, texto) {
    const el = document.getElementById('adm-loader');
    if (!el) return;
    if (texto) { const p = el.querySelector('p'); if (p) p.textContent = texto; }
    el.classList.toggle('ativo', !!ativo);
}

function fmtData(d) { if (!d) return '—'; const dt = new Date(d); return isNaN(dt) ? '—' : dt.toLocaleDateString('pt-BR'); }
function fmtDataHora(d) { if (!d) return '—'; const dt = new Date(d); return isNaN(dt) ? '—' : dt.toLocaleString('pt-BR'); }
function fmtBool(v) { return v ? 'Sim' : 'Não'; }

function badgeStatus(status) {
    const slug = String(status || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-');
    return `<span class="adm-badge adm-badge-${slug}">${escapeHtml(status)}</span>`;
}

function debounce(fn, delay = 350) {
    let t;
    return function (...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), delay); };
}

function confirmar({ titulo = 'Confirmar', mensagem = 'Tem certeza?', textoOk = 'Confirmar' } = {}) {
    return new Promise((resolve) => {
        const modal = document.getElementById('modal-confirmar');
        const tituloEl = document.getElementById('confirmar-titulo');
        const msgEl = document.getElementById('confirmar-mensagem');
        const btnOk = document.getElementById('btn-confirmar-ok');

        if (!modal) return resolve(window.confirm(mensagem));

        if (tituloEl) tituloEl.textContent = titulo;
        if (msgEl) msgEl.textContent = mensagem;
        if (btnOk) btnOk.innerHTML = `<i class="fas fa-check"></i> ${escapeHtml(textoOk)}`;

        modal.classList.add('aberto');

        const fechar = (valor) => {
            modal.classList.remove('aberto');
            btnOk.removeEventListener('click', onOk);
            modal.querySelectorAll('[data-fechar="modal-confirmar"]').forEach(b => b.removeEventListener('click', onCancel));
            resolve(valor);
        };
        const onOk = () => fechar(true);
        const onCancel = () => fechar(false);

        btnOk.addEventListener('click', onOk);
        modal.querySelectorAll('[data-fechar="modal-confirmar"]').forEach(b => b.addEventListener('click', onCancel));
    });
}

// ============================================================================
// ESTADO
// ============================================================================
const estado = {
    pagina: 1,
    limite: 20,
    totalPaginas: 1,
    total: 0,
    filtros: { busca:'', status:'', faixaRenda:'', cadUnico:'', deficiencia:'', biometria:'', anoLetivo:'', ordenar:'recentes' },
    opcoes: null,
    listaAtual: [],
    editandoId: null,
    perfil: null,

    // Estado Passkeys
    paginaPasskey: 1,
    limitePasskey: 20,
    totalPaginasPasskey: 1,
    totalPasskey: 0,
    filtrosPasskey: { busca: '', ativo: '' },
    listaPasskeys: []
};

// ============================================================================
// ESCONDE CONTROLES DE ADMIN
// ============================================================================
function esconderControlesAdmin() {
    if (isAdmin()) return; 

    document.querySelectorAll('.adm-tab').forEach(tab => {
        const alvo = (tab.dataset.tab || '').toLowerCase();
        const texto = (tab.textContent || '').toLowerCase();
        
        if (
            alvo === 'config' || alvo === 'configuracoes' || alvo === 'passkeys' || alvo === 'biometrias' ||
            texto.includes('configura') || texto.includes('biometria')
        ) {
            tab.style.display = 'none';
            tab.setAttribute('aria-hidden', 'true');
        }
    });

    ['#panel-config', '#panel-configuracoes', '#panel-passkeys', '#panel-biometrias'].forEach(sel => {
        const p = document.querySelector(sel);
        if (p) { 
            p.classList.remove('active', 'show'); 
            p.style.display = 'none'; 
            p.setAttribute('aria-hidden', 'true'); 
        }
    });

    const role = normalizarRole(getPerfil()?.role);
    const podeExportar = ['admin','super_admin','gestao'].includes(role);
    if (!podeExportar) {
        const btnExportar = document.getElementById('btn-exportar');
        if (btnExportar) { btnExportar.style.display = 'none'; btnExportar.setAttribute('aria-hidden', 'true'); }
    }
}

// ============================================================================
// ABAS
// ============================================================================
function configurarAbas() {
    $$('.adm-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const alvo = tab.dataset.tab;
            $$('.adm-tab').forEach(t => t.classList.remove('active'));
            $$('.adm-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            const painel = document.getElementById(`panel-${alvo}`);
            if (painel) painel.classList.add('active');

            if (alvo === 'dashboard') carregarDashboard();
            if (alvo === 'inscricoes') carregarLista(1);
            if (alvo === 'passkeys') {
                if (!isAdmin()) { toast('Apenas administradores podem gerenciar biometrias.', 'warning'); return; }
                carregarPasskeys(1);
            }
            if (alvo === 'config') {
                if (!isAdmin()) { toast('Apenas administradores podem acessar as configurações.', 'warning'); return; }
                carregarConfig();
            }
        });
    });
}

// ============================================================================
// BOTÃO VOLTAR
// ============================================================================
function configurarBotaoVoltar() {
    const btn = document.getElementById('btn-voltar');
    if (!btn) return;
    btn.addEventListener('click', () => {
        const params = new URLSearchParams(window.location.search);
        const origem = params.get('origem');
        if (origem && origem.startsWith('/')) { window.location.href = origem; return; }
        if (window.history.length > 1) { window.history.back(); return; }
        window.location.href = '/gestao-geral.html';
    });
}

// ============================================================================
// DASHBOARD
// ============================================================================
async function carregarDashboard() {
    const idsNumeros = ['st-total', 'st-pendentes', 'st-analise', 'st-aprovadas', 'st-concluidas', 'st-canceladas', 'st-cadunico', 'st-deficiencia', 'hero-total', 'hero-pendentes', 'hero-aprovadas'];
    
    idsNumeros.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '<i class="fas fa-circle-notch fa-spin" style="font-size:0.8em; opacity:0.5;"></i>';
    });

    const elRenda = document.getElementById('grafico-renda');
    if (elRenda) elRenda.innerHTML = '<div class="adm-empty"><i class="fas fa-circle-notch fa-spin"></i> Carregando...</div>';
    
    const elBairros = document.getElementById('grafico-bairros');
    if (elBairros) elBairros.innerHTML = '<div class="adm-empty"><i class="fas fa-circle-notch fa-spin"></i> Carregando...</div>';

    const elUltimas = document.getElementById('ultimas-inscricoes');
    if (elUltimas) elUltimas.innerHTML = '<div class="adm-empty"><i class="fas fa-circle-notch fa-spin"></i> Carregando...</div>';

    try {
        const data = await api(API.dashboard);
        const r = data.resumo || {};

        const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v ?? 0; };
        set('st-total', r.total);
        set('st-pendentes', r.pendentes);
        set('st-analise', r.emAnalise);
        set('st-aprovadas', r.aprovadas);
        set('st-concluidas', r.concluidas);
        set('st-canceladas', r.canceladas);
        set('st-cadunico', r.comCadUnico);
        set('st-deficiencia', r.comDeficiencia);
        set('hero-total', r.total);
        set('hero-pendentes', r.pendentes);
        set('hero-aprovadas', r.aprovadas);

        const renda = data.porFaixaRenda || [];
        const maxRenda = Math.max(1, ...renda.map(x => x.total));
        if (elRenda) {
            elRenda.innerHTML = renda.length === 0
                ? '<div class="adm-empty"><i class="fas fa-chart-simple"></i> Sem dados ainda.</div>'
                : renda.map(x => `
                    <div class="adm-bar-row">
                        <div class="adm-bar-top"><span>${escapeHtml(x.faixa)}</span><span>${x.total}</span></div>
                        <div class="adm-bar-track"><div class="adm-bar-fill" style="width:${Math.round((x.total/maxRenda)*100)}%"></div></div>
                    </div>`).join('');
        }

        const bairros = data.porBairro || [];
        const maxB = Math.max(1, ...bairros.map(x => x.total));
        if (elBairros) {
            elBairros.innerHTML = bairros.length === 0
                ? '<div class="adm-empty"><i class="fas fa-location-dot"></i> Sem dados ainda.</div>'
                : bairros.map(x => `
                    <div class="adm-bar-row">
                        <div class="adm-bar-top"><span>${escapeHtml(x.bairro)}</span><span>${x.total}</span></div>
                        <div class="adm-bar-track"><div class="adm-bar-fill" style="width:${Math.round((x.total/maxB)*100)}%"></div></div>
                    </div>`).join('');
        }

        const ultimas = data.ultimas || [];
        if (elUltimas) {
            elUltimas.innerHTML = ultimas.length === 0
                ? '<div class="adm-empty"><i class="fas fa-inbox"></i> Nenhuma inscrição ainda.</div>'
                : ultimas.map(i => `
                    <div class="adm-list-item">
                        <div>
                            <h4>${escapeHtml(i.aluno?.nomeCompleto || '—')}</h4>
                            <p>
                                <span class="adm-proto">${escapeHtml(i.protocolo)}</span>
                                · Resp.: ${escapeHtml(i.responsavel?.nomeCompleto || '—')}
                                · ${fmtDataHora(i.createdAt)}
                            </p>
                        </div>
                        <div style="display:flex;gap:8px;align-items:center">
                            ${badgeStatus(i.status)}
                            <button class="adm-btn adm-btn-ghost adm-btn-sm adm-btn-icon"
                                    onclick="adm.verDetalhe('${i._id}')" title="Ver detalhes">
                                <i class="fas fa-eye"></i>
                            </button>
                        </div>
                    </div>`).join('');
        }
    } catch (err) {
        console.error('Erro no dashboard:', err);
        idsNumeros.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = '0';
        });
        if (elRenda) elRenda.innerHTML = '<div class="adm-empty" style="color:#dc2626;"><i class="fas fa-circle-exclamation"></i> Erro</div>';
        if (elBairros) elBairros.innerHTML = '<div class="adm-empty" style="color:#dc2626;"><i class="fas fa-circle-exclamation"></i> Erro</div>';
        if (elUltimas) elUltimas.innerHTML = '<div class="adm-empty" style="color:#dc2626;"><i class="fas fa-circle-exclamation"></i> Erro</div>';
        toast('Erro ao carregar dashboard: ' + err.message, 'error');
    }
}

// ============================================================================
// LISTA DE INSCRIÇÕES
// ============================================================================
async function carregarLista(pagina = 1) {
    const tbody = document.getElementById('tbody-inscricoes');
    if (!tbody) return;

    estado.pagina = pagina;
    tbody.innerHTML = `<tr><td colspan="11"><div class="adm-empty"><i class="fas fa-circle-notch fa-spin"></i> Carregando...</div></td></tr>`;

    try {
        const params = new URLSearchParams();
        params.set('pagina', estado.pagina);
        params.set('limite', estado.limite);
        Object.entries(estado.filtros).forEach(([k, v]) => { if (v) params.set(k, v); });

        const data = await api(`${API.admin}?${params.toString()}`);
        const lista = data.inscricoes || [];
        const pag = data.paginacao || {};

        estado.listaAtual = lista;
        estado.totalPaginas = pag.totalPaginas || 1;
        estado.total = pag.total || 0;

        if (lista.length === 0) {
            tbody.innerHTML = `<tr><td colspan="11"><div class="adm-empty"><i class="fas fa-user-slash"></i> Nenhuma inscrição encontrada.</div></td></tr>`;
            renderPaginacao();
            return;
        }

        const podeExcluir = isAdmin();

        tbody.innerHTML = lista.map(i => `
            <tr>
                <td><span class="adm-proto">${escapeHtml(i.protocolo)}</span></td>
                <td>
                    <span class="adm-cell-strong">${escapeHtml(i.aluno)}</span>
                    <span class="adm-cell-sub">${escapeHtml(i.cpfMascarado)}</span>
                </td>
                <td>
                    <span class="adm-cell-strong">${escapeHtml(i.responsavel)}</span>
                    <span class="adm-cell-sub">${escapeHtml(i.responsavelTelefone)}</span>
                </td>
                <td><span class="adm-cell-strong">${escapeHtml(i.telefoneMascarado)}</span></td>
                <td>
                    <span class="adm-cell-strong">${escapeHtml(i.bairro || '—')}</span>
                    <span class="adm-cell-sub">${escapeHtml(i.cidade || '')}</span>
                </td>
                <td><span class="adm-cell-sub" style="margin:0">${escapeHtml(i.faixaRenda || '—')}</span></td>
                <td>
                    <span class="adm-tag ${i.cadUnico ? 'adm-tag-yes' : ''}">${i.cadUnico ? 'Sim' : 'Não'}</span>
                    ${i.deficiencia ? '<span class="adm-tag adm-tag-yes" title="Possui deficiência"><i class="fas fa-universal-access"></i></span>' : ''}
                </td>
                <td>
                    ${i.biometria
                        ? `<span class="adm-tag adm-tag-yes" title="Biometria capturada"><i class="fas fa-fingerprint"></i></span>`
                        : '<span class="adm-cell-sub" style="margin:0">—</span>'}
                </td>
                <td>${badgeStatus(i.status)}</td>
                <td><span class="adm-cell-sub" style="margin:0">${fmtData(i.createdAt)}</span></td>
                <td>
                    <div class="adm-row-actions">
                        <button class="adm-btn adm-btn-ghost adm-btn-sm adm-btn-icon" onclick="adm.verDetalhe('${i._id}')" title="Ver detalhes">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="adm-btn adm-btn-ghost adm-btn-sm adm-btn-icon" onclick="adm.editar('${i._id}')" title="Editar">
                            <i class="fas fa-pen"></i>
                        </button>
                        ${podeExcluir ? `
                            <button class="adm-btn adm-btn-ghost adm-btn-sm adm-btn-icon" onclick="adm.excluir('${i._id}', '${escapeHtml(i.protocolo)}')" title="Excluir">
                                <i class="fas fa-trash" style="color:#dc2626"></i>
                            </button>` : ''}
                    </div>
                </td>
            </tr>`).join('');

        renderPaginacao();
    } catch (err) {
        console.error(err);
        tbody.innerHTML = `<tr><td colspan="11"><div class="adm-empty"><i class="fas fa-circle-exclamation"></i> ${escapeHtml(err.message)}</div></td></tr>`;
    }
}

function renderPaginacao() {
    const el = document.getElementById('paginacao');
    if (!el) return;
    const { pagina, totalPaginas, total } = estado;
    if (total === 0) { el.innerHTML = ''; return; }

    const inicio = (pagina - 1) * estado.limite + 1;
    const fim = Math.min(pagina * estado.limite, total);

    const botoes = [];
    botoes.push(`<button class="adm-page-btn" ${pagina === 1 ? 'disabled' : ''} data-pagina="${pagina-1}"><i class="fas fa-chevron-left"></i></button>`);
    const janela = 2;
    for (let p = 1; p <= totalPaginas; p++) {
        if (p === 1 || p === totalPaginas || (p >= pagina - janela && p <= pagina + janela)) {
            botoes.push(`<button class="adm-page-btn ${p === pagina ? 'ativo' : ''}" data-pagina="${p}">${p}</button>`);
        } else if (p === pagina - janela - 1 || p === pagina + janela + 1) {
            botoes.push('<span style="align-self:center;color:#94a3b8">…</span>');
        }
    }
    botoes.push(`<button class="adm-page-btn" ${pagina === totalPaginas ? 'disabled' : ''} data-pagina="${pagina+1}"><i class="fas fa-chevron-right"></i></button>`);

    el.innerHTML = `
        <div class="adm-pagination-info">Exibindo <strong>${inicio}–${fim}</strong> de <strong>${total}</strong> inscrição(ões)</div>
        <div class="adm-pagination-btns">${botoes.join('')}</div>`;

    el.querySelectorAll('[data-pagina]').forEach(btn => {
        btn.addEventListener('click', () => {
            const p = Number(btn.dataset.pagina);
            if (p < 1 || p > totalPaginas || p === pagina) return;
            carregarLista(p);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    });
}

// ============================================================================
// DETALHE DA INSCRIÇÃO
// ============================================================================
function blocoDetalhe(titulo, icone, itens) {
    const validos = itens.filter(([,v]) => v !== '' && v !== null && v !== undefined && v !== '—');
    return `
        <div class="adm-det-bloco">
            <h4><i class="fas ${icone}"></i> ${titulo}</h4>
            <div class="adm-det-grid">
                ${validos.length === 0
                    ? '<div class="adm-det-item"><strong>Sem informações.</strong></div>'
                    : validos.map(([k,v]) => `
                        <div class="adm-det-item"><span>${escapeHtml(k)}</span><strong>${escapeHtml(String(v))}</strong></div>`).join('')}
            </div>
        </div>`;
}

async function verDetalhe(id) {
    try {
        loader(true, 'Carregando inscrição...');
        const data = await api(`${API.admin}/${id}`);
        const i = data.inscricao;
        const f = data.formatado || {};

        const a = i.aluno || {};
        const r = i.responsavel || {};
        const e = i.endereco || {};
        const c = i.composicaoFamiliar || {};
        const cm = i.condicaoMoradia || {};
        const rf = i.rendaFamiliar || {};
        const ia = i.informacoesAdicionais || {};
        const lg = i.lgpd || {};
        const bio = i.biometria || {};

        const iniciais = (a.nomeCompleto || '?').split(' ').map(n => n[0]).slice(0,2).join('').toUpperCase();

        const html = `
            <div class="adm-det-head">
                <div class="adm-det-avatar">${escapeHtml(iniciais)}</div>
                <div style="flex:1;min-width:180px">
                    <h2>${escapeHtml(a.nomeCompleto || '—')}</h2>
                    <p>
                        <span class="adm-proto">${escapeHtml(i.protocolo)}</span>
                        · ${escapeHtml(String(i.anoLetivo))} · ${escapeHtml(i.serie || '')}
                        · ${badgeStatus(i.status)}
                    </p>
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                    <button class="adm-btn adm-btn-ghost adm-btn-sm" onclick="adm.editar('${i._id}')">
                        <i class="fas fa-pen"></i> Editar
                    </button>
                </div>
            </div>

            ${blocoDetalhe('Aluno', 'fa-user-graduate', [
                ['Nome completo', a.nomeCompleto], ['Data de nascimento', fmtData(a.dataNascimento)],
                ['CPF', f.cpfAluno || a.cpf], ['Sexo', a.sexo], ['RG', a.rg], ['E-mail', a.email],
                ['Telefone', f.telefoneAluno || a.telefone], ['Possui CadÚnico', fmtBool(a.temCadUnico)], ['NIS', a.nis]
            ])}

            ${blocoDetalhe('Responsável', 'fa-user-tie', [
                ['Nome completo', r.nomeCompleto], ['Grau de parentesco', r.grauParentesco],
                ['Data de nascimento', fmtData(r.dataNascimento)], ['CPF', f.cpfResponsavel || r.cpf],
                ['Sexo', r.sexo], ['RG', r.rg], ['E-mail', r.email],
                ['Telefone', f.telefoneResponsavel || r.telefone], ['Possui CadÚnico', fmtBool(r.temCadUnico)], ['NIS', r.nis]
            ])}

            ${blocoDetalhe('Endereço', 'fa-location-dot', [
                ['CEP', f.cep || e.cep], ['Logradouro', e.logradouro], ['Número', e.numero],
                ['Complemento', e.complemento], ['Bairro', e.bairro], ['Cidade', e.cidade], ['UF', e.estado]
            ])}

            ${blocoDetalhe('Composição familiar', 'fa-people-roof', [
                ['Pessoas na residência', c.pessoasResidem], ['Graus de parentesco', (c.grausParentesco || []).join(', ')],
                ['Dependentes menores', c.dependentesMenores], ['Escolaridade do pai', c.escolaridadePai],
                ['Escolaridade da mãe', c.escolaridadeMae], ['Ocupação do pai', c.ocupacaoPai], ['Ocupação da mãe', c.ocupacaoMae]
            ])}

            ${blocoDetalhe('Condição de moradia', 'fa-house-chimney', [
                ['Água encanada', fmtBool(cm.aguaEncanada)], ['Energia elétrica', fmtBool(cm.energiaEletrica)],
                ['Esgoto sanitário', fmtBool(cm.esgotoSanitario)], ['Internet banda larga', fmtBool(cm.internetBandaLarga)]
            ])}

            ${blocoDetalhe('Renda familiar', 'fa-coins', [
                ['Faixa de renda', rf.faixaRenda], ['Programas sociais', (rf.programasSociais || []).join(', ')], ['Outro programa', rf.programaOutro]
            ])}

            ${blocoDetalhe('Informações adicionais', 'fa-circle-info', [
                ['Possui deficiência', fmtBool(ia.possuiDeficiencia)], ['Qual deficiência', ia.deficienciaQual], ['Acesso a dispositivos', fmtBool(ia.acessoDispositivos)]
            ])}

            ${bio && bio.aceito ? `
                <div class="adm-det-bloco">
                    <h4><i class="fas fa-fingerprint"></i> Biometria</h4>
                    <div class="adm-det-grid">
                        <div class="adm-det-item"><span>Consentimento</span><strong>Sim</strong></div>
                        <div class="adm-det-item"><span>Capturada em</span><strong>${fmtDataHora(bio.capturadoEm)}</strong></div>
                        <div class="adm-det-item"><span>Algoritmo</span><strong>${escapeHtml(bio.algoritmo || '—')}</strong></div>
                        <div class="adm-det-item"><span>Credencial (ID)</span><strong>${escapeHtml(bio.credentialId || '—')}</strong></div>
                        <div class="adm-det-item"><span>Armazenamento</span><strong>Criptografado (AES-GCM + RSA-OAEP)</strong></div>
                    </div>
                </div>` : ''}

            ${blocoDetalhe('LGPD e auditoria', 'fa-shield-halved', [
                ['Consentimento aceito', fmtBool(lg.aceito)], ['Aceito em', fmtDataHora(lg.aceitoEm)],
                ['Versão do termo', lg.versaoTermo], ['IP de origem', lg.ip], ['Origem do cadastro', i.origem],
                ['Criado em', fmtDataHora(i.createdAt)], ['Atualizado em', fmtDataHora(i.updatedAt)]
            ])}

            ${i.observacoesAdmin ? `
                <div class="adm-det-bloco">
                    <h4><i class="fas fa-note-sticky"></i> Observações administrativas</h4>
                    <div class="adm-det-item"><strong>${escapeHtml(i.observacoesAdmin)}</strong></div>
                </div>` : ''}

            <div class="adm-det-bloco">
                <h4><i class="fas fa-clock-rotate-left"></i> Histórico de status</h4>
                ${(i.historico || []).length === 0
                    ? '<div class="adm-empty">Sem histórico.</div>'
                    : `<ul class="adm-timeline">
                        ${i.historico.map(h => `
                            <li><strong>${escapeHtml(h.status)}</strong>
                                ${fmtDataHora(h.em)}${h.por ? ' · por ' + escapeHtml(h.por) : ''}
                                ${h.observacao ? '<br>' + escapeHtml(h.observacao) : ''}
                            </li>`).join('')}
                    </ul>`}
            </div>`;

        const conteudo = document.getElementById('detalhe-conteudo');
        if (conteudo) conteudo.innerHTML = html;
        abrirModal('modal-detalhe');
    } catch (err) {
        toast('Erro ao carregar inscrição: ' + err.message, 'error');
    } finally {
        loader(false);
    }
}

// ============================================================================
// EDIÇÃO DA INSCRIÇÃO
// ============================================================================
const CAMPOS_EDICAO = [
    { grupo:'aluno', campo:'nomeCompleto', label:'Nome do aluno', tipo:'text' },
    { grupo:'aluno', campo:'cpf', label:'CPF do aluno', tipo:'text' },
    { grupo:'aluno', campo:'dataNascimento', label:'Nascimento do aluno', tipo:'date' },
    { grupo:'aluno', campo:'telefone', label:'Telefone do aluno', tipo:'text' },
    { grupo:'aluno', campo:'email', label:'E-mail do aluno', tipo:'text' },
    { grupo:'aluno', campo:'sexo', label:'Sexo do aluno', tipo:'select', opcoes:['Masculino','Feminino','Outro','Prefiro não informar'] },
    { grupo:'aluno', campo:'rg', label:'RG do aluno', tipo:'text' },
    { grupo:'aluno', campo:'temCadUnico', label:'Aluno possui CadÚnico', tipo:'bool' },
    { grupo:'aluno', campo:'nis', label:'NIS do aluno', tipo:'text' },
    { grupo:'responsavel', campo:'nomeCompleto', label:'Nome do responsável', tipo:'text' },
    { grupo:'responsavel', campo:'cpf', label:'CPF do responsável', tipo:'text' },
    { grupo:'responsavel', campo:'telefone', label:'Telefone do responsável', tipo:'text' },
    { grupo:'responsavel', campo:'email', label:'E-mail do responsável', tipo:'text' },
    { grupo:'responsavel', campo:'grauParentesco', label:'Grau de parentesco', tipo:'select', opcoes:['Mãe','Pai','Avó/Avô','Tia/Tio','Irmã/Irmão','Tutor(a) legal','Outro'] },
    { grupo:'endereco', campo:'cep', label:'CEP', tipo:'text' },
    { grupo:'endereco', campo:'logradouro', label:'Logradouro', tipo:'text' },
    { grupo:'endereco', campo:'numero', label:'Número', tipo:'text' },
    { grupo:'endereco', campo:'complemento', label:'Complemento', tipo:'text' },
    { grupo:'endereco', campo:'bairro', label:'Bairro', tipo:'text' },
    { grupo:'endereco', campo:'cidade', label:'Cidade', tipo:'text' },
    { grupo:'endereco', campo:'estado', label:'UF', tipo:'text' },
    { grupo:'composicaoFamiliar', campo:'pessoasResidem', label:'Pessoas na residência', tipo:'number' },
    { grupo:'composicaoFamiliar', campo:'dependentesMenores', label:'Dependentes menores', tipo:'number' },
    { grupo:'composicaoFamiliar', campo:'escolaridadePai', label:'Escolaridade do pai', tipo:'select', opcoesDinamicas:'escolaridades' },
    { grupo:'composicaoFamiliar', campo:'escolaridadeMae', label:'Escolaridade da mãe', tipo:'select', opcoesDinamicas:'escolaridades' },
    { grupo:'composicaoFamiliar', campo:'ocupacaoPai', label:'Ocupação do pai', tipo:'text' },
    { grupo:'composicaoFamiliar', campo:'ocupacaoMae', label:'Ocupação da mãe', tipo:'text' },
    { grupo:'rendaFamiliar', campo:'faixaRenda', label:'Faixa de renda', tipo:'select', opcoesDinamicas:'faixasRenda' },
    { grupo:'rendaFamiliar', campo:'programaOutro', label:'Outro programa social', tipo:'text' },
    { grupo:'informacoesAdicionais', campo:'possuiDeficiencia', label:'Possui deficiência', tipo:'bool' },
    { grupo:'informacoesAdicionais', campo:'deficienciaQual', label:'Qual deficiência', tipo:'textarea' },
    { grupo:'informacoesAdicionais', campo:'acessoDispositivos', label:'Acesso a dispositivos', tipo:'bool' }
];

function valorParaInput(v, tipo) {
    if (tipo === 'date') {
        if (!v) return '';
        const d = new Date(v);
        if (isNaN(d)) return '';
        return d.toISOString().slice(0, 10);
    }
    if (tipo === 'bool') return v ? 'true' : 'false';
    return v == null ? '' : String(v);
}

async function editar(id) {
    try {
        loader(true, 'Carregando inscrição...');
        const data = await api(`${API.admin}/${id}`);
        const i = data.inscricao;
        estado.editandoId = id;

        const camposHtml = CAMPOS_EDICAO.map(c => {
            const valor = (i[c.grupo] || {})[c.campo];
            const inputId = `edit-${c.grupo}-${c.campo}`;
            let input = '';
            if (c.tipo === 'bool') {
                input = `<select id="${inputId}"><option value="true" ${valor ? 'selected' : ''}>Sim</option><option value="false" ${!valor ? 'selected' : ''}>Não</option></select>`;
            } else if (c.tipo === 'select') {
                const opcoes = c.opcoes || (estado.opcoes && estado.opcoes[c.opcoesDinamicas]) || [];
                input = `<select id="${inputId}"><option value="">Selecione...</option>${opcoes.map(o => `<option value="${escapeHtml(o)}" ${valor === o ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('')}</select>`;
            } else if (c.tipo === 'textarea') {
                input = `<textarea id="${inputId}" rows="2">${escapeHtml(valor || '')}</textarea>`;
            } else if (c.tipo === 'number') {
                input = `<input type="number" id="${inputId}" value="${escapeHtml(valorParaInput(valor,'number'))}" min="0">`;
            } else if (c.tipo === 'date') {
                input = `<input type="date" id="${inputId}" value="${escapeHtml(valorParaInput(valor,'date'))}">`;
            } else {
                input = `<input type="text" id="${inputId}" value="${escapeHtml(valorParaInput(valor,'text'))}">`;
            }
            return `<div class="adm-field" data-grupo="${c.grupo}" data-campo="${c.campo}"><label for="${inputId}">${escapeHtml(c.label)}</label>${input}</div>`;
        }).join('');

        const html = `
            <div class="adm-det-head" style="padding-bottom:12px;margin-bottom:14px">
                <div class="adm-det-avatar">${escapeHtml((i.aluno?.nomeCompleto || '?').split(' ').map(n => n[0]).slice(0,2).join('').toUpperCase())}</div>
                <div><h2 style="font-size:15px">${escapeHtml(i.aluno?.nomeCompleto || '—')}</h2><p><span class="adm-proto">${escapeHtml(i.protocolo)}</span></p></div>
            </div>
            <div class="adm-grid-2" style="margin-bottom:14px">
                <div class="adm-field">
                    <label for="edit-status">Status</label>
                    <select id="edit-status">
                        ${['Pendente','Em análise','Aprovada','Concluída','Cancelada'].map(s => `<option value="${s}" ${i.status === s ? 'selected' : ''}>${s}</option>`).join('')}
                    </select>
                </div>
                <div class="adm-field">
                    <label for="edit-obs">Observações administrativas</label>
                    <textarea id="edit-obs" rows="2">${escapeHtml(i.observacoesAdmin || '')}</textarea>
                </div>
            </div>
            <h4 style="margin:6px 0 12px;font-size:12.5px;text-transform:uppercase;letter-spacing:.05em;color:#0f766e">
                <i class="fas fa-pen-to-square"></i> Dados da inscrição
            </h4>
            <div class="adm-grid-3">${camposHtml}</div>`;

        const conteudo = document.getElementById('editar-conteudo');
        if (conteudo) conteudo.innerHTML = html;
        abrirModal('modal-editar');
    } catch (err) {
        toast('Erro ao carregar inscrição: ' + err.message, 'error');
    } finally {
        loader(false);
    }
}

async function salvarEdicao() {
    if (!estado.editandoId) return;
    const btn = document.getElementById('btn-salvar-edicao');
    const original = btn ? btn.innerHTML : '';
    try {
        const status = document.getElementById('edit-status').value;
        const observacoesAdmin = document.getElementById('edit-obs').value;

        const dados = {};
        document.querySelectorAll('#editar-conteudo [data-grupo]').forEach(el => {
            const grupo = el.dataset.grupo;
            const campo = el.dataset.campo;
            const input = el.querySelector('input, select, textarea');
            if (!input) return;
            if (!dados[grupo]) dados[grupo] = {};
            const spec = CAMPOS_EDICAO.find(c => c.grupo === grupo && c.campo === campo);
            const tipo = spec ? spec.tipo : 'text';
            if (tipo === 'bool') dados[grupo][campo] = input.value === 'true';
            else if (tipo === 'number') dados[grupo][campo] = input.value === '' ? 0 : Number(input.value);
            else dados[grupo][campo] = input.value.trim();
        });

        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Salvando...'; }

        await api(`${API.admin}/${estado.editandoId}`, {
            method: 'PUT',
            body: JSON.stringify({ status, observacoesAdmin, dados })
        });

        toast('Inscrição atualizada com sucesso!', 'success');
        fecharModal('modal-editar');
        carregarLista(estado.pagina);
        carregarDashboard();
    } catch (err) {
        toast('Erro ao salvar: ' + err.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = original; }
    }
}

// ============================================================================
// EXCLUIR INSCRIÇÃO
// ============================================================================
async function excluir(id, protocolo) {
    if (!isAdmin()) { toast('Apenas administradores podem excluir inscrições.', 'warning'); return; }
    const ok = await confirmar({
        titulo: 'Excluir inscrição',
        mensagem: `Deseja realmente excluir a inscrição ${protocolo}? Esta ação é irreversível.`,
        textoOk: 'Excluir permanentemente'
    });
    if (!ok) return;
    try {
        loader(true, 'Excluindo...');
        await api(`${API.admin}/${id}`, { method: 'DELETE' });
        toast('Inscrição excluída.', 'success');
        carregarLista(estado.pagina);
        carregarDashboard();
    } catch (err) {
        toast('Erro ao excluir: ' + err.message, 'error');
    } finally {
        loader(false);
    }
}

// ============================================================================
// EXPORTAR CSV
// ============================================================================
async function exportarCSV() {
    const role = normalizarRole(getPerfil()?.role);
    if (!['admin','super_admin','gestao'].includes(role)) {
        toast('Seu perfil não tem permissão para exportar os dados completos.', 'warning');
        return;
    }
    const btn = document.getElementById('btn-exportar');
    const original = btn ? btn.innerHTML : '';
    try {
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Gerando...'; }
        const params = new URLSearchParams();
        if (estado.filtros.status) params.set('status', estado.filtros.status);
        if (estado.filtros.anoLetivo) params.set('anoLetivo', estado.filtros.anoLetivo);
        const token = getToken();
        const resp = await fetch(`${API.exportar}?${params.toString()}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        if (!resp.ok) { const data = await resp.json().catch(() => ({})); throw new Error(data.error || 'Não foi possível exportar.'); }
        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `inscricoes-${new Date().toISOString().slice(0,10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast('Exportação concluída!', 'success');
    } catch (err) {
        toast('Erro ao exportar: ' + err.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = original; }
    }
}

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================
async function carregarConfig() {
    try {
        const data = await api(API.config);
        const c = data.config;

        const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
        set('c-ano', c.anoLetivo);
        set('c-serie', c.serie);
        set('c-vagas', c.vagas);
        set('c-titulo', c.titulo);
        set('c-subtitulo', c.subtitulo);
        set('c-objetivo', c.objetivo);
        set('c-inicio', toDatetimeLocal(c.dataInicio));
        set('c-fim', toDatetimeLocal(c.dataFim));
        set('c-mensagem', c.mensagemEncerrado);
        set('c-versao', c.versaoTermo);

        const chk = (id, v) => { const el = document.getElementById(id); if (el) el.checked = !!v; };
        chk('c-ativo', c.ativo);
        chk('c-bloquear', c.bloquearDuplicadas);
        chk('c-consulta', c.permiteConsultaPublica);
        chk('c-biometria', c.solicitarBiometria);

        const ano = document.getElementById('hero-ano');
        if (ano) ano.textContent = `Ano letivo ${c.anoLetivo}`;
        const periodo = document.getElementById('hero-periodo');
        if (periodo) periodo.textContent = `${fmtData(c.dataInicio)} a ${fmtData(c.dataFim)}`;
        const chip = document.getElementById('hero-status-chip');
        if (chip) {
            if (data.aberto) { chip.className = 'adm-chip ok'; chip.innerHTML = '<i class="fas fa-circle-check"></i> Inscrições abertas'; }
            else             { chip.className = 'adm-chip off'; chip.innerHTML = '<i class="fas fa-lock"></i> Inscrições encerradas'; }
        }
    } catch (err) {
        if (!isAdmin()) {
            const ano = document.getElementById('hero-ano'); if (ano) ano.textContent = 'Ano letivo 2026';
            const periodo = document.getElementById('hero-periodo'); if (periodo) periodo.textContent = '19/11/2026 a 19/01/2027';
            const chip = document.getElementById('hero-status-chip');
            if (chip) { chip.className = 'adm-chip ok'; chip.innerHTML = '<i class="fas fa-circle-check"></i> Inscrições abertas'; }
            return;
        }
        toast('Erro ao carregar configuração: ' + err.message, 'error');
    }
}

function toDatetimeLocal(valor) {
    if (!valor) return '';
    const d = new Date(valor);
    if (isNaN(d)) return '';
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function salvarConfig(e) {
    e.preventDefault();
    if (!isAdmin()) { toast('Apenas administradores podem alterar a configuração.', 'warning'); return; }
    const btn = document.getElementById('btn-salvar-config');
    const original = btn ? btn.innerHTML : '';
    try {
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Salvando...'; }

        const payload = {
            anoLetivo: Number(document.getElementById('c-ano').value) || undefined,
            serie: document.getElementById('c-serie').value,
            vagas: Number(document.getElementById('c-vagas').value) || 0,
            titulo: document.getElementById('c-titulo').value,
            subtitulo: document.getElementById('c-subtitulo').value,
            objetivo: document.getElementById('c-objetivo').value,
            dataInicio: document.getElementById('c-inicio').value,
            dataFim: document.getElementById('c-fim').value,
            mensagemEncerrado: document.getElementById('c-mensagem').value,
            versaoTermo: document.getElementById('c-versao').value,
            ativo: document.getElementById('c-ativo').checked,
            bloquearDuplicadas: document.getElementById('c-bloquear').checked,
            permiteConsultaPublica: document.getElementById('c-consulta').checked,
            solicitarBiometria: document.getElementById('c-biometria').checked
        };

        await api(API.config, { method:'PUT', body: JSON.stringify(payload) });
        toast('Configuração salva com sucesso!', 'success');
        carregarConfig();
    } catch (err) {
        toast('Erro ao salvar: ' + err.message, 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = original; }
    }
}

// ============================================================================
// GESTÃO DE PASSKEYS / BIOMETRIAS
// ============================================================================
async function carregarPasskeys(pagina = 1) {
    if (!isAdmin()) return; 

    const tbody = document.getElementById('tbody-passkeys');
    if (!tbody) return;

    estado.paginaPasskey = pagina;
    tbody.innerHTML = `<tr><td colspan="7"><div class="adm-empty"><i class="fas fa-circle-notch fa-spin"></i> Carregando...</div></td></tr>`;

    try {
        const params = new URLSearchParams();
        params.set('pagina', estado.paginaPasskey);
        params.set('limite', estado.limitePasskey);
        if (estado.filtrosPasskey.busca) params.set('busca', estado.filtrosPasskey.busca);
        if (estado.filtrosPasskey.ativo) params.set('ativo', estado.filtrosPasskey.ativo);

        const data = await api(`${API.passkeys}?${params.toString()}`);
        const lista = data.passkeys || [];
        const pag = data.paginacao || {};

        estado.totalPaginasPasskey = pag.totalPaginas || 1;
        estado.totalPasskey = pag.total || 0;
        estado.listaPasskeys = lista; 

        if (lista.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7"><div class="adm-empty"><i class="fas fa-fingerprint"></i> Nenhuma biometria encontrada com os filtros atuais.</div></td></tr>`;
            renderPaginacaoPasskeys();
            return;
        }

        tbody.innerHTML = lista.map(p => {
            const dtCadastro = p.createdAt ? new Date(p.createdAt).toLocaleDateString('pt-BR') : '—';
            const dtUso = p.ultimoUsoEm ? new Date(p.ultimoUsoEm).toLocaleString('pt-BR') : 'Nunca';
            
            const badgeStatus = p.ativo 
                ? '<span class="adm-badge adm-badge-aprovada">Ativa</span>' 
                : '<span class="adm-badge adm-badge-cancelada">Revogada</span>';

            const alunoVinculado = p.alunoNome 
                ? `<span class="adm-cell-strong">${escapeHtml(p.alunoNome)}</span>` 
                : '<span class="adm-cell-sub" style="margin:0;font-style:italic;color:#ef4444;">Não vinculado</span>';

            return `
                <tr style="${!p.ativo ? 'opacity:0.6;' : ''}">
                    <td><span class="adm-cell-strong">${escapeHtml(p.responsavelNome)}</span></td>
                    <td>${alunoVinculado}</td>
                    <td><code style="font-size:11px; background:#f3f4f6; padding:2px 6px; border-radius:4px;" title="${escapeHtml(p.credentialId)}">${escapeHtml(p.credentialId.substring(0, 15))}...</code></td>
                    <td>${badgeStatus}</td>
                    <td><span class="adm-cell-sub" style="margin:0">${dtCadastro}</span></td>
                    <td><span class="adm-cell-sub" style="margin:0">${dtUso}</span></td>
                    <td>
                        <div class="adm-row-actions">
                            <button class="adm-btn adm-btn-ghost adm-btn-sm adm-btn-icon" onclick="adm.verDetalhePasskey('${p._id}')" title="Visualizar">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button class="adm-btn adm-btn-ghost adm-btn-sm adm-btn-icon" onclick="adm.editarPasskey('${p._id}')" title="Editar Nome">
                                <i class="fas fa-pen"></i>
                            </button>
                            ${p.ativo ? `
                                <button class="adm-btn adm-btn-ghost adm-btn-sm adm-btn-icon" onclick="adm.revogarPasskey('${p._id}', '${escapeHtml(p.responsavelNome)}')" title="Revogar">
                                    <i class="fas fa-ban" style="color:#dc2626"></i>
                                </button>
                            ` : `
                                <button class="adm-btn adm-btn-ghost adm-btn-sm adm-btn-icon" onclick="adm.reativarPasskey('${p._id}')" title="Reativar">
                                    <i class="fas fa-rotate-left" style="color:#10b981"></i>
                                </button>
                            `}
                        </div>
                    </td>
                </tr>`;
        }).join('');

        renderPaginacaoPasskeys();
    } catch (err) {
        console.error(err);
        tbody.innerHTML = `<tr><td colspan="7"><div class="adm-empty"><i class="fas fa-circle-exclamation"></i> ${escapeHtml(err.message)}</div></td></tr>`;
    }
}

function renderPaginacaoPasskeys() {
    const el = document.getElementById('paginacao-passkeys');
    if (!el) return;
    const { paginaPasskey, totalPaginasPasskey, totalPasskey } = estado;
    if (totalPasskey === 0) { el.innerHTML = ''; return; }

    const inicio = (paginaPasskey - 1) * estado.limitePasskey + 1;
    const fim = Math.min(paginaPasskey * estado.limitePasskey, totalPasskey);

    const botoes = [];
    botoes.push(`<button class="adm-page-btn" ${paginaPasskey === 1 ? 'disabled' : ''} data-pagina="${paginaPasskey-1}"><i class="fas fa-chevron-left"></i></button>`);
    const janela = 2;
    for (let p = 1; p <= totalPaginasPasskey; p++) {
        if (p === 1 || p === totalPaginasPasskey || (p >= paginaPasskey - janela && p <= paginaPasskey + janela)) {
            botoes.push(`<button class="adm-page-btn ${p === paginaPasskey ? 'ativo' : ''}" data-pagina="${p}">${p}</button>`);
        } else if (p === paginaPasskey - janela - 1 || p === paginaPasskey + janela + 1) {
            botoes.push('<span style="align-self:center;color:#94a3b8">…</span>');
        }
    }
    botoes.push(`<button class="adm-page-btn" ${paginaPasskey === totalPaginasPasskey ? 'disabled' : ''} data-pagina="${paginaPasskey+1}"><i class="fas fa-chevron-right"></i></button>`);

    el.innerHTML = `
        <div class="adm-pagination-info">Exibindo <strong>${inicio}–${fim}</strong> de <strong>${totalPasskey}</strong> biometria(s)</div>
        <div class="adm-pagination-btns">${botoes.join('')}</div>`;

    el.querySelectorAll('[data-pagina]').forEach(btn => {
        btn.addEventListener('click', () => {
            const p = Number(btn.dataset.pagina);
            if (p < 1 || p > totalPaginasPasskey || p === paginaPasskey) return;
            carregarPasskeys(p);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    });
}

function configurarFiltrosPasskeys() {
    const recarregar = debounce(() => {
        estado.filtrosPasskey.busca = (document.getElementById('f-busca-passkey')?.value || '').trim();
        estado.filtrosPasskey.ativo = document.getElementById('f-status-passkey')?.value || '';
        carregarPasskeys(1);
    }, 400);

    const busca = document.getElementById('f-busca-passkey');
    if (busca) busca.addEventListener('input', recarregar);

    const status = document.getElementById('f-status-passkey');
    if (status) status.addEventListener('change', recarregar);
}

function verDetalhePasskey(id) {
    const p = estado.listaPasskeys.find(x => x._id === id);
    if (!p) return;

    const modal = document.getElementById('modal-passkey');
    const conteudo = document.getElementById('passkey-conteudo');
    
    conteudo.innerHTML = `
        <div class="adm-det-bloco">
            <h4><i class="fas fa-fingerprint"></i> Credencial WebAuthn</h4>
            <div class="adm-det-grid">
                <div class="adm-det-item"><span>Responsável</span><strong>${escapeHtml(p.responsavelNome)}</strong></div>
                <div class="adm-det-item"><span>Aluno Vinculado</span><strong>${p.alunoNome ? escapeHtml(p.alunoNome) : 'Não vinculado'}</strong></div>
                <div class="adm-det-item"><span>ID da Credencial</span><strong style="word-break:break-all;font-size:12px">${escapeHtml(p.credentialId)}</strong></div>
                <div class="adm-det-item"><span>Status</span><strong>${p.ativo ? 'Ativa' : 'Revogada'}</strong></div>
                <div class="adm-det-item"><span>Data do Cadastro</span><strong>${p.createdAt ? fmtDataHora(p.createdAt) : '—'}</strong></div>
                <div class="adm-det-item"><span>Último Uso</span><strong>${p.ultimoUsoEm ? fmtDataHora(p.ultimoUsoEm) : 'Nunca usado'}</strong></div>
                <div class="adm-det-item"><span>Transportes</span><strong>${(p.transports || []).join(', ') || 'Não informado'}</strong></div>
            </div>
        </div>
    `;
    abrirModal('modal-passkey');
}

async function editarPasskey(id) {
    const p = estado.listaPasskeys.find(x => x._id === id);
    if (!p) return;

    const novoNome = prompt("Digite o novo nome do responsável:", p.responsavelNome);
    if (novoNome === null || novoNome.trim() === '' || novoNome === p.responsavelNome) return;

    try {
        loader(true, 'Salvando...');
        await api(`${API.passkeys}/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ responsavelNome: novoNome.trim() })
        });
        toast('Nome do responsável atualizado!', 'success');
        carregarPasskeys(estado.paginaPasskey);
    } catch (err) {
        toast('Erro ao editar: ' + err.message, 'error');
    } finally {
        loader(false);
    }
}

async function revogarPasskey(id, nome) {
    if (!isAdmin()) { toast('Apenas administradores podem revogar biometrias.', 'warning'); return; }
    const ok = await confirmar({
        titulo: 'Revogar Biometria',
        mensagem: `Tem certeza que deseja revogar a biometria de ${nome}? O responsável não poderá mais autenticar usando esta passkey.`,
        textoOk: 'Revogar'
    });
    if (!ok) return;

    try {
        loader(true, 'Revogando...');
        await api(`${API.passkeys}/${id}`, { method: 'DELETE' });
        toast('Biometria revogada com sucesso.', 'success');
        carregarPasskeys(estado.paginaPasskey);
    } catch (err) {
        toast('Erro ao revogar: ' + err.message, 'error');
    } finally {
        loader(false);
    }
}

async function reativarPasskey(id) {
    if (!isAdmin()) { toast('Apenas administradores podem reativar biometrias.', 'warning'); return; }
    const ok = await confirmar({
        titulo: 'Reativar Biometria',
        mensagem: 'Deseja reativar esta biometria? O responsável voltará a poder autenticar.',
        textoOk: 'Reativar'
    });
    if (!ok) return;

    try {
        loader(true, 'Reativando...');
        await api(`${API.passkeys}/${id}/reativar`, { method: 'PUT' });
        toast('Biometria reativada com sucesso.', 'success');
        carregarPasskeys(estado.paginaPasskey);
    } catch (err) {
        toast('Erro ao reativar: ' + err.message, 'error');
    } finally {
        loader(false);
    }
}

// ============================================================================
// MODAIS
// ============================================================================
function abrirModal(id) {
    const el = document.getElementById(id);
    if (el) { el.classList.add('aberto'); document.body.style.overflow = 'hidden'; }
}
function fecharModal(id) {
    const el = document.getElementById(id);
    if (el) { el.classList.remove('aberto'); document.body.style.overflow = ''; }
}
function configurarModais() {
    $$('[data-fechar]').forEach(btn => btn.addEventListener('click', () => fecharModal(btn.dataset.fechar)));
    $$('.adm-modal').forEach(modal => modal.addEventListener('click', e => { if (e.target === modal) fecharModal(modal.id); }));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') $$('.adm-modal.aberto').forEach(m => fecharModal(m.id)); });
    const btnSalvar = document.getElementById('btn-salvar-edicao');
    if (btnSalvar) btnSalvar.addEventListener('click', salvarEdicao);
}

// ============================================================================
// FILTROS (INSCRIÇÕES)
// ============================================================================
function lerFiltros() {
    estado.filtros = {
        busca: (document.getElementById('f-busca')?.value || '').trim(),
        status: document.getElementById('f-status')?.value || '',
        faixaRenda: document.getElementById('f-renda')?.value || '',
        cadUnico: document.getElementById('f-cadunico')?.value || '',
        deficiencia: document.getElementById('f-deficiencia')?.value || '',
        biometria: document.getElementById('f-biometria')?.value || '',
        anoLetivo: document.getElementById('f-ano')?.value || '',
        ordenar: document.getElementById('f-ordenar')?.value || 'recentes'
    };
}

function configurarFiltros() {
    const recarregar = debounce(() => { lerFiltros(); carregarLista(1); }, 400);
    ['f-busca','f-status','f-renda','f-cadunico','f-deficiencia','f-biometria','f-ano','f-ordenar'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', recarregar);
    });
    const busca = document.getElementById('f-busca');
    if (busca) busca.addEventListener('input', recarregar);

    const limpar = document.getElementById('btn-limpar-filtros');
    if (limpar) limpar.addEventListener('click', () => {
        ['f-busca','f-status','f-renda','f-cadunico','f-deficiencia','f-biometria','f-ano','f-ordenar'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = el.tagName === 'SELECT' ? (el.options[0]?.value || '') : '';
        });
        lerFiltros();
        carregarLista(1);
    });

    const atualizar = document.getElementById('btn-atualizar');
    if (atualizar) atualizar.addEventListener('click', () => carregarLista(estado.pagina));

    const exportar = document.getElementById('btn-exportar');
    if (exportar) exportar.addEventListener('click', exportarCSV);
}

// ============================================================================
// INIT
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
    esconderControlesAdmin();
    configurarAbas();
    configurarBotaoVoltar();
    configurarModais();
    configurarFiltros();
    configurarFiltrosPasskeys();

    const form = document.getElementById('config-form'); 
    const formConfig = document.getElementById('form-config') || form;
    if (formConfig) formConfig.addEventListener('submit', salvarConfig);

    carregarConfig(); 
    carregarDashboard();
});

window.adm = {
    verDetalhe, editar, excluir,
    carregarPasskeys,
    revogarPasskey,
    reativarPasskey,
    verDetalhePasskey,
    editarPasskey,
    irParaInscricoes: () => {
        const tab = document.querySelector('.adm-tab[data-tab="inscricoes"]');
        if (tab) tab.click();
    }
};