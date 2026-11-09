/* ==========================================================================
   MINHAS INSCRIÇÕES — FRONTEND (professor)
   v3 — Modal corrigido (centralizado, header fixo, body com scroll interno)
   ========================================================================== */

const CHAVE_TOKEN = 'participante_eventos_token';
const CHAVE_USER = 'participante_eventos_user';

let inscricoesTodas = [];
let categoriaAtual = 'abertas';

function getToken() { return localStorage.getItem(CHAVE_TOKEN); }
function limparSessao() {
    localStorage.removeItem(CHAVE_TOKEN);
    localStorage.removeItem(CHAVE_USER);
}

function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

async function api(url) {
    const token = getToken();
    const headers = token ? { 'Authorization': 'Bearer ' + token } : {};
    const res = await fetch(url, { headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
    return data;
}

function fmtData(d) {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('pt-BR'); } catch { return '—'; }
}

function fmtDataHora(d) {
    if (!d) return '—';
    try { return new Date(d).toLocaleString('pt-BR'); } catch { return '—'; }
}

function atualizarBadges() {
    ['abertas', 'concluidas', 'encerradas'].forEach(cat => {
        const n = inscricoesTodas.filter(i => i.categoria === cat).length;
        document.querySelectorAll(`.minhas-tab[data-cat="${cat}"] .badge-count`).forEach(el => {
            el.textContent = n > 0 ? `(${n})` : '';
        });
    });
}

function renderizarLista() {
    const lista = inscricoesTodas.filter(i => i.categoria === categoriaAtual);
    const container = document.getElementById('lista-inscricoes');

    if (lista.length === 0) {
        container.innerHTML = `
            <div class="coord-empty">
                <i class="fas fa-inbox"></i>
                <p style="margin:0;">Nenhuma inscrição nesta categoria.</p>
            </div>
        `;
        return;
    }

    const badgePorStatus = {
        Pendente: 'ev-badge-warning',
        Confirmada: 'ev-badge-publicado',
        Cancelada: 'ev-badge-cancelado',
        Presente: 'ev-badge-publicado',
        Ausente: 'ev-badge-rascunho'
    };

    container.innerHTML = lista.map((i, idx) => {
        const ev = i.evento;
        const badgeCls = badgePorStatus[i.status] || 'ev-badge-rascunho';
        const idSeguro = escapeHtml(i._id);

        return `
            <div class="inscricao-card" data-inscricao-id="${idSeguro}" data-idx="${idx}">
                <div style="display: flex; justify-content: space-between; align-items: start; gap: 12px; flex-wrap: wrap;">
                    <div style="flex: 1;">
                        <h4>${escapeHtml(ev.titulo)}</h4>
                        <div class="meta">
                            ${ev.local ? `<i class="fas fa-map-marker-alt"></i> ${escapeHtml(ev.local)} • ` : ''}
                            Inscrições: ${fmtData(ev.dataInicioInscricao)} → ${fmtData(ev.dataFimInscricao)}
                            ${ev.dataInicioEvento ? ` • Evento: ${fmtData(ev.dataInicioEvento)}` : ''}
                        </div>
                    </div>
                    <span class="ev-badge ${badgeCls}">${escapeHtml(i.status)}</span>
                </div>

                <div style="margin-top: 10px; display: flex; gap: 16px; flex-wrap: wrap; align-items: center; font-size: 13px;">
                    <span>Protocolo: <span class="protocolo">${escapeHtml(i.protocolo)}</span></span>
                    <span style="color: var(--coord-muted);">Inscrito em ${fmtDataHora(i.createdAt)}</span>
                    ${i.temAssinatura ? '<span style="color: #16a34a; font-weight: 600;"><i class="fas fa-signature"></i> assinado</span>' : ''}
                </div>

                <div style="margin-top: 16px; display: flex; gap: 8px; flex-wrap: wrap;">
                    <button type="button" class="coord-btn coord-btn-primary coord-btn-sm btn-ver-detalhes">
                        <i class="fas fa-clipboard-list"></i> Ver detalhes
                    </button>
                    <a href="/eventos/inscricao.html?slug=${encodeURIComponent(ev.slug)}" class="coord-btn coord-btn-secondary coord-btn-sm">
                        <i class="fas fa-external-link-alt"></i> Ir para o evento
                    </a>
                </div>
            </div>
        `;
    }).join('');

    container.querySelectorAll('.btn-ver-detalhes').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const card = e.target.closest('.inscricao-card');
            const inscricaoId = card.dataset.inscricaoId;
            abrirDetalhesInscricao(inscricaoId);
        });
    });
}

async function abrirDetalhesInscricao(inscricaoId) {
    let inscricao = inscricoesTodas.find(i => String(i._id) === String(inscricaoId));

    if (!inscricao) {
        alert('Inscrição não encontrada.');
        return;
    }

    // Tenta buscar dados completos (com assinatura e anexos) se o backend tiver rota dedicada
    try {
        const data = await api(`/api/eventos/publico/minhas-inscricoes/${inscricaoId}`);
        if (data.success && data.inscricao) {
            inscricao = data.inscricao;
        }
    } catch (_) {}

    renderizarModalDetalhes(inscricao);
}

function renderizarModalDetalhes(inscricao) {
    const ev = inscricao.evento || {};
    const dados = inscricao.dadosPreenchidos || {};
    const anexos = inscricao.anexosParticipante || {};
    const assinatura = inscricao.assinaturaBase64 || null;

    const antigo = document.getElementById('modalDetalhesInner');
    if (antigo) antigo.remove();

    const grupos = { projeto: [], aluno: [], responsavel: [], outros: [] };

    const chavesResponsavel = [
        'nome do responsavel', 'responsavel', 'nome responsavel',
        'naturalidade', 'estado civil',
        'endereco (rua/avenida)', 'endereco (av/rua)', 'endereco', 'rua',
        'numero', 'nº', 'bairro', 'cep', 'municipio', 'municipio de', 'cidade',
        'estado', 'uf',
        'relacao (pai, mae ou representante legal)', '(pai, mae ou representante legal)',
        'qualidade (pai, mae ou representante legal)', 'data'
    ];

    const normKey = (k) => String(k || '')
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .trim();

    Object.entries(dados).forEach(([k, v]) => {
        if (k === '__assinaturas') return;
        if (v == null || String(v).trim() === '') return;

        const kn = normKey(k);

        if (kn.includes('titulo do projeto') || kn.includes('descricao do projeto') || kn === 'titulo' || kn === 'descricao') {
            grupos.projeto.push({ label: k, valor: v });
            return;
        }

        if (/_aluno_\d+$/.test(kn) || /^estudante\[\d+\]\./.test(kn)) {
            grupos.aluno.push({ label: k, valor: v });
            return;
        }

        if (chavesResponsavel.some(r => kn === r || kn.includes(r))) {
            grupos.responsavel.push({ label: k, valor: v });
            return;
        }

        grupos.outros.push({ label: k, valor: v });
    });

    const renderGrupo = (titulo, icone, itens) => {
        if (itens.length === 0) return '';
        return `
            <div class="detalhes-section">
                <h6><i class="fas ${icone}"></i> ${titulo}</h6>
                <table class="detalhes-tabela">
                    ${itens.map(it => `
                        <tr>
                            <td>${escapeHtml(it.label)}</td>
                            <td>${escapeHtml(String(it.valor))}</td>
                        </tr>
                    `).join('')}
                </table>
            </div>
        `;
    };

    const assinaturaHtml = assinatura
        ? `
            <div class="detalhes-section">
                <h6><i class="fas fa-signature"></i> Assinatura</h6>
                <div class="detalhes-assinatura">
                    <img src="${assinatura}" alt="Assinatura">
                </div>
            </div>
        `
        : '';

    const anexosArr = Object.entries(anexos);
    const anexosHtml = anexosArr.length
        ? `
            <div class="detalhes-section">
                <h6><i class="fas fa-paperclip"></i> Anexos enviados</h6>
                <ul class="detalhes-anexos">
                    ${anexosArr.map(([chave, url]) => `
                        <li>
                            <span>${escapeHtml(chave)}</span>
                            <a href="${escapeHtml(url)}" target="_blank" rel="noopener">
                                <i class="fas fa-external-link-alt"></i> Abrir
                            </a>
                        </li>
                    `).join('')}
                </ul>
            </div>
        `
        : '';

    const badgePorStatus = {
        Pendente: 'ev-badge-warning',
        Confirmada: 'ev-badge-publicado',
        Cancelada: 'ev-badge-cancelado',
        Presente: 'ev-badge-publicado',
        Ausente: 'ev-badge-rascunho'
    };
    const badgeCls = badgePorStatus[inscricao.status] || 'ev-badge-rascunho';

    // ESTRUTURA DO MODAL AJUSTADA
    const modalHtml = `
        <div id="modalDetalhesInner" class="modal fade" tabindex="-1">
            <div class="modal-dialog modal-lg modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            <i class="fas fa-clipboard-list"></i> Detalhes da Inscrição
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    
                    <div class="modal-body">
                        <div class="detalhes-section">
                            <h6><i class="fas fa-calendar-check"></i> Evento</h6>
                            <table class="detalhes-tabela">
                                <tr><td>Evento</td><td>${escapeHtml(ev.titulo || '—')}</td></tr>
                                <tr><td>Local</td><td>${escapeHtml(ev.local || '—')}</td></tr>
                                <tr><td>Inscrições</td><td>${fmtData(ev.dataInicioInscricao)} → ${fmtData(ev.dataFimInscricao)}</td></tr>
                                ${ev.dataInicioEvento ? `<tr><td>Evento</td><td>${fmtData(ev.dataInicioEvento)}${ev.dataFimEvento ? ' → ' + fmtData(ev.dataFimEvento) : ''}</td></tr>` : ''}
                            </table>
                        </div>

                        <div class="detalhes-section">
                            <h6><i class="fas fa-info-circle"></i> Inscrição</h6>
                            <table class="detalhes-tabela">
                                <tr><td>Protocolo</td><td><span class="protocolo">${escapeHtml(inscricao.protocolo || '—')}</span></td></tr>
                                <tr><td>Status</td><td><span class="ev-badge ${badgeCls}">${escapeHtml(inscricao.status || '—')}</span></td></tr>
                                <tr><td>Data da Inscrição</td><td>${fmtDataHora(inscricao.createdAt)}</td></tr>
                            </table>
                        </div>

                        ${renderGrupo('Dados do Projeto', 'fa-clipboard-list', grupos.projeto)}
                        ${renderGrupo('Dados do Professor / Participante', 'fa-user-tie', grupos.outros)}
                        ${renderGrupo('Dados do Aluno / Estudante', 'fa-user-graduate', grupos.aluno)}
                        ${renderGrupo('Dados do Responsável', 'fa-user-shield', grupos.responsavel)}

                        ${assinaturaHtml}
                        ${anexosHtml}

                        ${inscricao.observacoesAdmin ? `
                            <div class="detalhes-section">
                                <h6><i class="fas fa-sticky-note"></i> Observações do Organizador</h6>
                                <p style="font-size: 13px; color: #334155; margin: 0; white-space: pre-wrap;">${escapeHtml(inscricao.observacoesAdmin)}</p>
                            </div>
                        ` : ''}

                        <div style="background:#e0f2fe; border: 1px solid #bae6fd; border-radius: 8px; padding: 12px 16px; font-size: 13px; color: #0369a1; margin-top: 24px;">
                            <i class="fas fa-lock"></i> Estes são os dados registrados na sua inscrição.
                            Para qualquer correção, entre em contato com o organizador do evento.
                        </div>
                    </div>
                    
                    <div class="modal-footer">
                        <button type="button" class="coord-btn coord-btn-secondary" data-bs-dismiss="modal">
                            <i class="fas fa-times"></i> Fechar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('modalDetalhes').innerHTML = modalHtml;

    const modalEl = document.getElementById('modalDetalhesInner');
    const modal = new bootstrap.Modal(modalEl);
    modal.show();

    modalEl.addEventListener('hidden.bs.modal', () => {
        document.getElementById('modalDetalhes').innerHTML = '';
    });
}

async function carregar() {
    const token = getToken();
    if (!token) {
        window.location.href = '/eventos/inscricao.html';
        return;
    }

    const user = JSON.parse(localStorage.getItem(CHAVE_USER) || '{}');
    document.getElementById('perfil-nome').textContent = user.nomeCompleto || 'Professor';

    try {
        const data = await api('/api/eventos/publico/minhas-inscricoes');
        inscricoesTodas = data.inscricoes || [];
        atualizarBadges();
        renderizarLista();
    } catch (err) {
        document.getElementById('lista-inscricoes').innerHTML = `
            <div class="coord-alert coord-alert-danger" style="display:flex; gap:10px; padding: 16px; border-radius: 8px; background: #fef2f2; color: #991b1b;">
                <i class="fas fa-exclamation-triangle" style="margin-top:2px;"></i> 
                <span>${escapeHtml(err.message)}</span>
            </div>
        `;
    }
}

document.querySelectorAll('.minhas-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.minhas-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        categoriaAtual = tab.dataset.cat;
        renderizarLista();
    });
});

document.getElementById('btn-sair').addEventListener('click', () => {
    limparSessao();
    window.location.href = '/eventos/inscricao.html';
});

document.addEventListener('DOMContentLoaded', carregar);