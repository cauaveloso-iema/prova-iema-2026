// js/protagonismo-acolhimento.js
// ============================================================
// ACOLHIMENTO — PAINEL PROTAGONISMO
// Gerencia configuração, listagem e aprovação de acolhedores
// ============================================================

(function () {
    'use strict';

    const $ = (id) => document.getElementById(id);

    function getToken() {
        return localStorage.getItem('auth_token');
    }

    function escapeHtml(str) {
        if (typeof str !== 'string') return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function setText(id, v) {
        const el = $(id);
        if (el) el.textContent = v;
    }

    function toast(msg, tipo) {
        if (typeof window.mostrarToast === 'function') {
            window.mostrarToast(msg, tipo || 'info');
        } else {
            console.log('[Acolhimento]', msg);
        }
    }

    // ============================================
    // CONFIGURAÇÃO (COM PRAZOS)
    // ============================================
    async function carregarConfigAcolhimento() {
        const token = getToken();
        if (!token) return;

        try {
            const res = await fetch('/api/protagonismo/configuracao', {
                headers: { Authorization: `Bearer ${token}` }
            }).then(r => r.json());

            if (res.success && res.configuracao) {
                const c = res.configuracao;

                // Aba Acolhimento
                const chk = $('configAcolhimento');
                if (chk) chk.checked = c.acolhimentoAberto === true;

                const aviso = $('configAvisoAcolhimento');
                if (aviso) aviso.value = c.avisoAcolhimento || '';

                // 🆕 Preenche as datas (input type="datetime-local")
                if ($('configDataAberturaAcolhimento')) {
                    $('configDataAberturaAcolhimento').value = c.dataAberturaAcolhimento 
                        ? new Date(c.dataAberturaAcolhimento).toISOString().slice(0, 16) 
                        : '';
                }
                if ($('configDataFechamentoAcolhimento')) {
                    $('configDataFechamentoAcolhimento').value = c.dataFechamentoAcolhimento 
                        ? new Date(c.dataFechamentoAcolhimento).toISOString().slice(0, 16) 
                        : '';
                }

                // Aba Configurações (se existir os campos lá também)
                const chkTab = $('configAcolhimentoTab');
                if (chkTab) chkTab.checked = c.acolhimentoAberto === true;

                const avisoTab = $('configAvisoAcolhimentoTab');
                if (avisoTab) avisoTab.value = c.avisoAcolhimento || '';
            }
        } catch (e) {
            console.warn('[Acolhimento] Erro ao carregar configuração:', e);
        }
    }

    async function salvarConfigAcolhimento() {
        const token = getToken();
        if (!token) return;

        const aberto = $('configAcolhimento')?.checked
            ?? $('configAcolhimentoTab')?.checked
            ?? false;

        const aviso = $('configAvisoAcolhimento')?.value
            || $('configAvisoAcolhimentoTab')?.value
            || '';

        // 🆕 Captura as datas (se vazias, envia null)
        const dataAbertura = $('configDataAberturaAcolhimento')?.value || null;
        const dataFechamento = $('configDataFechamentoAcolhimento')?.value || null;

        const dados = {
            acolhimentoAberto: aberto,
            avisoAcolhimento: aviso,
            dataAberturaAcolhimento: dataAbertura,
            dataFechamentoAcolhimento: dataFechamento
        };

        try {
            const res = await fetch('/api/protagonismo/configuracao', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(dados)
            }).then(r => r.json());

            if (res.success) {
                toast('Configuração do acolhimento salva!', 'success');
                atualizarBadgeStatus('statusAcolhimento', aberto);
                await carregarEstatisticasAcolhimento();
            } else {
                toast('Erro: ' + (res.error || 'Falha ao salvar'), 'error');
            }
        } catch (e) {
            console.error(e);
            toast('Erro ao salvar configuração', 'error');
        }
    }

    // ============================================
    // ESTATÍSTICAS
    // ============================================
    async function carregarEstatisticasAcolhimento() {
        const token = getToken();
        if (!token) return;

        try {
            const res = await fetch('/api/acolhimento/estatisticas', {
                headers: { Authorization: `Bearer ${token}` }
            }).then(r => r.json());

            if (!res.success || !res.estatisticas) return;

            const e = res.estatisticas;

            setText('acTotal', e.total || 0);
            setText('acPendentes', e.pendentes || 0);
            setText('acAprovados', e.aprovados || 0);
            setText('acRejeitados', e.rejeitados || 0);

            // Card do dashboard
            setText('totalAcolhedores', e.total || 0);

            // Badge da aba
            const badge = $('badgeAcolhedoresPendentes');
            if (badge) {
                if (e.pendentes > 0) {
                    badge.textContent = e.pendentes;
                    badge.style.display = 'inline-block';
                } else {
                    badge.style.display = 'none';
                }
            }
        } catch (e) {
            console.warn('[Acolhimento] Erro ao carregar estatísticas:', e);
        }
    }

    function atualizarBadgeStatus(id, ativo) {
        const el = $(id);
        if (!el) return;
        if (ativo) {
            el.textContent = 'Aberto';
            el.className = 'status-badge active';
        } else {
            el.textContent = 'Fechado';
            el.className = 'status-badge inactive';
        }
    }

    // ============================================
    // LISTAGEM
    // ============================================
    async function carregarListaAcolhedores() {
        const token = getToken();
        const tbody = $('tabelaAcolhedores');
        if (!token || !tbody) return;

        const status = $('filtroStatusAcolhedor')?.value || '';
        const busca = $('filtroBuscaAcolhedor')?.value || '';

        const params = new URLSearchParams();
        if (status) params.append('status', status);
        if (busca) params.append('busca', busca);

        tbody.innerHTML = '<tr><td colspan="7" class="text-center py-3"><div class="loading-spinner"></div></td></tr>';

        try {
            const res = await fetch(`/api/acolhimento?${params.toString()}`, {
                headers: { Authorization: `Bearer ${token}` }
            }).then(r => r.json());

            if (!res.success || !res.acolhedores || res.acolhedores.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-3">Nenhum acolhedor encontrado</td></tr>';
                return;
            }

            tbody.innerHTML = res.acolhedores.map(a => {
                const cor = a.status === 'aprovado' ? 'success'
                    : a.status === 'pendente' ? 'warning'
                    : a.status === 'rejeitado' ? 'danger'
                    : 'secondary';

                const acoes = [];
                if (a.status === 'pendente') {
                    acoes.push(`<button class="btn-sm btn-success" onclick="aprovarAcolhedor('${a.id}')" title="Aprovar"><i class="fas fa-check"></i></button>`);
                    acoes.push(`<button class="btn-sm btn-danger" onclick="rejeitarAcolhedor('${a.id}')" title="Rejeitar"><i class="fas fa-times"></i></button>`);
                }
                acoes.push(`<button class="btn-sm btn-info" onclick="verDetalhesAcolhedor('${a.id}')" title="Detalhes"><i class="fas fa-eye"></i></button>`);
                acoes.push(`<button class="btn-sm btn-danger" onclick="excluirAcolhedor('${a.id}', '${escapeHtml(a.nomeCompleto)}')" title="Excluir"><i class="fas fa-trash"></i></button>`);

                return `
                    <tr>
                        <td><strong>${escapeHtml(a.nomeCompleto)}</strong></td>
                        <td>${escapeHtml(a.turma || '-')}</td>
                        <td>${escapeHtml(a.curso || '-')}</td>
                        <td>${a.telefone ? escapeHtml(a.telefone) : '-'}</td>
                        <td><span class="badge bg-${cor}">${escapeHtml(a.statusLabel || a.status)}</span></td>
                        <td>${a.createdAt ? new Date(a.createdAt).toLocaleString('pt-BR') : '-'}</td>
                        <td>${acoes.join(' ')}</td>
                    </tr>
                `;
            }).join('');
        } catch (e) {
            console.error('[Acolhimento] Erro ao carregar lista:', e);
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger py-3">Erro ao carregar</td></tr>';
        }
    }

    // ============================================
    // AÇÕES
    // ============================================
    async function aprovarAcolhedor(id) {
        if (!await confirm('Aprovar esta inscrição de acolhedor?')) return;
        const token = getToken();
        if (!token) return;

        try {
            const res = await fetch(`/api/acolhimento/${id}/aprovar`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            }).then(r => r.json());

            if (res.success) {
                toast('Acolhedor aprovado!', 'success');
                await carregarListaAcolhedores();
                await carregarEstatisticasAcolhimento();
            } else {
                toast('Erro: ' + (res.error || 'Falha'), 'error');
            }
        } catch (e) {
            console.error(e);
            toast('Erro ao aprovar', 'error');
        }
    }

    async function rejeitarAcolhedor(id) {
        const motivo = prompt('Motivo da rejeição (opcional):') || '';
        const token = getToken();
        if (!token) return;

        try {
            const res = await fetch(`/api/acolhimento/${id}/rejeitar`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ motivo })
            }).then(r => r.json());

            if (res.success) {
                toast('Acolhedor rejeitado.', 'warning');
                await carregarListaAcolhedores();
                await carregarEstatisticasAcolhimento();
            } else {
                toast('Erro: ' + (res.error || 'Falha'), 'error');
            }
        } catch (e) {
            console.error(e);
            toast('Erro ao rejeitar', 'error');
        }
    }

    async function verDetalhesAcolhedor(id) {
        const token = getToken();
        if (!token) return;

        try {
            const res = await fetch(`/api/acolhimento/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            }).then(r => r.json());

            if (!res.success || !res.acolhedor) {
                toast('Acolhedor não encontrado', 'error');
                return;
            }

            const a = res.acolhedor;
            const conteudo = $('modalDetalhesAcolhedorConteudo');
            if (!conteudo) return;

            const disp = (a.disponibilidade || []).join(', ') || '-';

            conteudo.innerHTML = `
                <p><strong>Nome:</strong> ${escapeHtml(a.nomeCompleto)}</p>
                <p><strong>Data Nasc.:</strong> ${a.dataNascimento ? new Date(a.dataNascimento).toLocaleDateString('pt-BR') : '-'}</p>
                <p><strong>Turma:</strong> ${escapeHtml(a.turma || '-')}</p>
                <p><strong>Curso:</strong> ${escapeHtml(a.curso || '-')}</p>
                <p><strong>Matrícula:</strong> ${escapeHtml(a.matricula || '-')}</p>
                <p><strong>E-mail:</strong> ${escapeHtml(a.email || '-')}</p>
                <p><strong>Telefone:</strong> ${escapeHtml(a.telefone || '-')}</p>
                <p><strong>WhatsApp:</strong> ${escapeHtml(a.whatsapp || '-')}</p>
                ${a.menorDeIdade ? `
                    <hr>
                    <p><strong>Responsável:</strong> ${escapeHtml(a.responsavelNome || '-')}</p>
                    <p><strong>Tel. Responsável:</strong> ${escapeHtml(a.responsavelTelefone || '-')}</p>
                    <p><strong>Parentesco:</strong> ${escapeHtml(a.responsavelParentesco || '-')}</p>
                ` : ''}
                <p><strong>Disponibilidade:</strong> ${escapeHtml(disp)}</p>
                <p><strong>Por que quer ser acolhedor:</strong> ${escapeHtml(a.porqueSerAcolhedor || '-')}</p>
                <hr>
                <p><strong>Assinatura do aluno:</strong></p>
                ${a.assinatura?.aluno
                    ? `<img src="${a.assinatura.aluno}" style="max-width:100%; border:1px solid #ddd; border-radius:8px;">`
                    : '<span class="text-muted">Não assinada</span>'}
                ${a.assinatura?.responsavel
                    ? `<p class="mt-3"><strong>Assinatura do responsável:</strong></p>
                       <img src="${a.assinatura.responsavel}" style="max-width:100%; border:1px solid #ddd; border-radius:8px;">`
                    : ''}
            `;

            const modalEl = $('modalDetalhesAcolhedor');
            if (modalEl && typeof bootstrap !== 'undefined' && bootstrap.Modal) {
                bootstrap.Modal.getOrCreateInstance(modalEl).show();
            }
        } catch (e) {
            console.error(e);
            toast('Erro ao carregar detalhes', 'error');
        }
    }

    async function excluirAcolhedor(id, nome) {
        if (!await confirm(`Excluir a inscrição de "${nome}"?`)) return;
        const token = getToken();
        if (!token) return;

        try {
            const res = await fetch(`/api/acolhimento/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            }).then(r => r.json());

            if (res.success) {
                toast('Acolhedor excluído!', 'success');
                await carregarListaAcolhedores();
                await carregarEstatisticasAcolhimento();
            } else {
                toast('Erro: ' + (res.error || 'Falha'), 'error');
            }
        } catch (e) {
            console.error(e);
            toast('Erro ao excluir', 'error');
        }
    }

    // ============================================
    // EVENTOS
    // ============================================
    function bindEventos() {
        // Aba Acolhimento
        const aba = $('aba-acolhimento');
        if (aba) {
            aba.addEventListener('shown.bs.tab', () => {
                carregarConfigAcolhimento();
                carregarEstatisticasAcolhimento();
                carregarListaAcolhedores();
            });
        }

        // Botão salvar config (aba Acolhimento)
        const btnSalvar = $('btnSalvarConfigAcolhimento');
        if (btnSalvar) btnSalvar.addEventListener('click', salvarConfigAcolhimento);

        // Filtros
        const filtroStatus = $('filtroStatusAcolhedor');
        if (filtroStatus) filtroStatus.addEventListener('change', carregarListaAcolhedores);

        const filtroBusca = $('filtroBuscaAcolhedor');
        if (filtroBusca) {
            filtroBusca.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    carregarListaAcolhedores();
                }
            });
        }

        // Também recarrega quando a aba Configurações for aberta
        const abaConfig = $('aba-config');
        if (abaConfig) {
            abaConfig.addEventListener('shown.bs.tab', () => {
                carregarConfigAcolhimento();
            });
        }
    }

    // ============================================
    // EXPOR FUNÇÕES GLOBAIS (usadas nos botões inline)
    // ============================================
    window.aprovarAcolhedor = aprovarAcolhedor;
    window.rejeitarAcolhedor = rejeitarAcolhedor;
    window.verDetalhesAcolhedor = verDetalhesAcolhedor;
    window.excluirAcolhedor = excluirAcolhedor;
    window.salvarConfigAcolhimento = salvarConfigAcolhimento;

    // Init
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindEventos);
    } else {
        bindEventos();
    }
})();