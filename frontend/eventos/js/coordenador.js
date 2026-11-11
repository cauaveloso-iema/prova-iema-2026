/* ============================================================
   Portal do Coordenador — EducaPleno
   v5.2 — Categorias na atribuição manual + filtro
   ============================================================ */

(function () {
    'use strict';

    const TOKEN_KEY = 'avaliador_token';
    const USER_KEY  = 'avaliador_user';

    function getToken() { return localStorage.getItem(TOKEN_KEY); }
    function getUser()  { try { return JSON.parse(localStorage.getItem(USER_KEY) || '{}'); } catch { return {}; } }
    function setUser(u) { localStorage.setItem(USER_KEY, JSON.stringify(u || {})); }

    window.logout = function () {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        location.reload();
    };

    let token = getToken();
    let user  = getUser();
    let eventos = [];
    let evAtual = null;
    let avaliadoresDoEvento = [];
    let relatorioData = [];
    let avaliadoresCadastradosCache = [];
    let buscaAvaliadorDebounce = null;

    // ---------------- API ----------------
    async function api(url, opt = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(opt.headers || {})
        };
        const res = await fetch(url, { ...opt, headers });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            const err = new Error(data.error || `Erro ${res.status}`);
            err.status = res.status;
            err.data = data;
            throw err;
        }
        return data;
    }

    function escapeHtml(s) {
        if (s == null) return '';
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function toast(mensagem, tipo = 'success') {
        const antigo = document.getElementById('coordToast');
        if (antigo) antigo.remove();
        const cores = { success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#0ea5e9' };
        const icons = { success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
        const el = document.createElement('div');
        el.id = 'coordToast';
        el.style.cssText = `position:fixed;top:20px;left:50%;transform:translateX(-50%);
            background:${cores[tipo]};color:#fff;padding:12px 22px;border-radius:12px;
            font-weight:700;font-size:14px;box-shadow:0 8px 24px rgba(0,0,0,.25);z-index:999999;
            display:flex;align-items:center;gap:10px;max-width:90vw;`;
        el.innerHTML = `<i class="fas ${icons[tipo]}"></i><span>${escapeHtml(mensagem)}</span>`;
        document.body.appendChild(el);
        setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 2800);
        setTimeout(() => el.remove(), 3200);
    }
    window.__coordToast = toast;

    function mostrarAlerta(id, msg, tipo = 'info') {
        const el = document.getElementById(id);
        if (!el) return;
        const cls = tipo === 'error' ? 'danger' : tipo;
        el.innerHTML = `<div class="coord-alert coord-alert-${cls}"><i class="fas fa-info-circle"></i><span>${escapeHtml(msg)}</span></div>`;
        if (tipo !== 'error') setTimeout(() => { el.innerHTML = ''; }, 5000);
    }
    window.__coordAlert = mostrarAlerta;

    // ============================================================
    // ESTADO INICIAL
    // ============================================================
    function decidirTelaInicial() {
        if (!token || !user._id || !user.isCoordenador) {
            mostrarTela('auth');
            return;
        }
        if (user.senhaTemporaria === true) {
            mostrarTela('trocar-senha');
            return;
        }
        mostrarTela('painel');
        document.getElementById('chip-nome').textContent = user.nomeCompleto || user.email || 'Coordenador';
        carregarEventos();
    }

    function mostrarTela(qual) {
        ['tela-auth', 'tela-trocar-senha', 'tela-painel'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        if (qual === 'auth') document.getElementById('tela-auth').style.display = 'flex';
        if (qual === 'trocar-senha') document.getElementById('tela-trocar-senha').style.display = 'flex';
        if (qual === 'painel') document.getElementById('tela-painel').style.display = 'block';
    }

    // ============================================================
    // TABS LOGIN / CADASTRO
    // ============================================================
    document.querySelectorAll('.auth-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.auth-tab').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
        });
    });

    // ============================================================
    // LOGIN
    // ============================================================
    document.getElementById('form-login').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btn-login');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Entrando...';

        try {
            const res = await fetch('/api/eventos/avaliadores/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: document.getElementById('login-email').value.trim(),
                    senha: document.getElementById('login-senha').value
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erro no login');
            if (!data.avaliador.isCoordenador) throw new Error('Acesso negado. Esta conta é de avaliador.');

            token = data.token;
            user  = data.avaliador;
            localStorage.setItem(TOKEN_KEY, token);
            setUser(user);

            if (user.senhaTemporaria === true || data.precisaTrocarSenha === true) {
                mostrarTela('trocar-senha');
            } else {
                mostrarTela('painel');
                document.getElementById('chip-nome').textContent = user.nomeCompleto || user.email;
                carregarEventos();
            }
        } catch (err) {
            mostrarAlerta('login-alert', err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Acessar Painel';
        }
    });

    // ============================================================
    // CADASTRO
    // ============================================================
    document.getElementById('form-cadastro-coord').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btn-cad');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Enviando...';
        try {
            const res = await fetch('/api/eventos/avaliadores/cadastro-coordenador', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nomeCompleto: document.getElementById('cad-nome').value.trim(),
                    email: document.getElementById('cad-email').value.trim(),
                    senha: document.getElementById('cad-senha').value
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erro no cadastro');

            mostrarAlerta('cad-alert', data.message || 'Cadastro enviado! Aguarde aprovação.', 'success');
            document.getElementById('form-cadastro-coord').reset();
        } catch (err) {
            mostrarAlerta('cad-alert', err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-paper-plane"></i> Solicitar Cadastro';
        }
    });

    // ============================================================
    // FORÇA DE SENHA
    // ============================================================
    function avaliarForcaSenha(s) {
        let score = 0;
        if (!s) return { score: 0, label: 'Digite uma senha', color: '#ef4444' };
        if (s.length >= 6) score++;
        if (s.length >= 10) score++;
        if (/[A-Z]/.test(s)) score++;
        if (/[0-9]/.test(s)) score++;
        if (/[^A-Za-z0-9]/.test(s)) score++;

        const map = {
            0: { label: 'Muito curta', color: '#ef4444' },
            1: { label: 'Fraca', color: '#ef4444' },
            2: { label: 'Razoável', color: '#f59e0b' },
            3: { label: 'Boa', color: '#0ea5e9' },
            4: { label: 'Forte', color: '#10b981' },
            5: { label: 'Excelente', color: '#10b981' }
        };
        return { score, label: map[score].label, color: map[score].color };
    }

    function bindForcaSenha(inputId, barraContainerId, textoId) {
        const input = document.getElementById(inputId);
        const barra = document.getElementById(barraContainerId);
        const texto = document.getElementById(textoId);
        if (!input || !barra || !texto) return;
        input.addEventListener('input', () => {
            const info = avaliarForcaSenha(input.value);
            barra.style.width = (info.score / 5 * 100) + '%';
            barra.style.background = info.color;
            texto.textContent = info.label;
        });
    }
    bindForcaSenha('nova-senha', 'senha-forca-barra', 'senha-forca-texto');

    // ============================================================
    // TROCA OBRIGATÓRIA DE SENHA
    // ============================================================
    window.trocarSenhaPrimeiroAcesso = async function () {
        const nova = document.getElementById('nova-senha').value;
        const confirma = document.getElementById('confirma-senha').value;
        const btn = document.getElementById('btn-trocar-senha');

        if (!nova || nova.length < 6) return mostrarAlerta('senha-alert', 'A senha deve ter no mínimo 6 caracteres.', 'error');
        if (nova !== confirma) return mostrarAlerta('senha-alert', 'As senhas não coincidem.', 'error');

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Salvando...';
        try {
            await api('/api/eventos/avaliadores/trocar-senha', {
                method: 'PUT',
                body: JSON.stringify({ novaSenha: nova })
            });
            user.senhaTemporaria = false;
            setUser(user);
            toast('Senha alterada com sucesso!', 'success');
            mostrarTela('painel');
            document.getElementById('chip-nome').textContent = user.nomeCompleto || user.email;
            carregarEventos();
        } catch (err) {
            mostrarAlerta('senha-alert', err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-check"></i> Salvar e continuar';
        }
    };

    // ============================================================
    // EVENTOS
    // ============================================================
    async function carregarEventos() {
        const container = document.getElementById('lista-eventos');
        container.innerHTML = '<div class="coord-empty"><i class="fas fa-circle-notch fa-spin"></i> Carregando...</div>';
        try {
            const data = await api('/api/eventos/eventos/coordenador-meus');
            eventos = data.eventos || [];

            document.getElementById('hero-eventos').textContent = eventos.length;
            let totalAv = 0, totalIns = 0;
            eventos.forEach(e => {
                totalAv += (e.coordenadores || []).length || 0;
                totalIns += e.totalParticipantes || 0;
            });
            document.getElementById('hero-avaliadores').textContent = totalAv;
            document.getElementById('hero-inscricoes').textContent = totalIns;

            if (eventos.length === 0) {
                container.innerHTML = '<div class="coord-empty"><i class="fas fa-calendar-xmark"></i> Nenhum evento vinculado.</div>';
                return;
            }

            container.innerHTML = eventos.map(e => `
                <div class="coord-event-item ${evAtual && evAtual._id === e._id ? 'active' : ''}"
                     onclick="selecionar('${e._id}')">
                    <h4>${escapeHtml(e.titulo)}</h4>
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
                        <small>${e.status || '—'}</small>
                        <span class="coord-chip ${e.status === 'Publicado' ? 'coord-chip-success' : 'coord-chip-warning'}">${escapeHtml(e.status || '—')}</span>
                    </div>
                </div>
            `).join('');
        } catch (err) {
            container.innerHTML = `<div class="coord-alert coord-alert-danger"><i class="fas fa-exclamation-triangle"></i><span>${escapeHtml(err.message)}</span></div>`;
        }
    }
    window.carregarEventos = carregarEventos;

    async function selecionar(id) {
        evAtual = eventos.find(e => e._id === id);
        if (!evAtual) return;

        document.getElementById('painel-vazio').style.display = 'none';
        document.getElementById('painel-evento').style.display = 'block';
        document.getElementById('ev-titulo').textContent = evAtual.titulo;
        document.getElementById('ev-descricao').textContent = evAtual.descricaoPublica || 'Sem descrição.';
        document.getElementById('ev-local').textContent = evAtual.local || '—';
        const ini = evAtual.dataInicioInscricao ? new Date(evAtual.dataInicioInscricao).toLocaleDateString('pt-BR') : '—';
        const fim = evAtual.dataFimInscricao ? new Date(evAtual.dataFimInscricao).toLocaleDateString('pt-BR') : '—';
        document.getElementById('ev-periodo').textContent = `${ini} → ${fim}`;
        document.getElementById('ev-status').innerHTML = `<i class="fas fa-circle"></i> ${escapeHtml(evAtual.status || '—')}`;
        document.getElementById('email-avaliador').value = '';
        document.getElementById('relatorio-area').innerHTML = '<div class="coord-empty">Clique em atualizar para carregar as estatísticas.</div>';

        document.querySelectorAll('.coord-event-item').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.coord-event-item').forEach(el => {
            if (el.getAttribute('onclick')?.includes(id)) el.classList.add('active');
        });

        avaliadoresCadastradosCache = [];
        const busca = document.getElementById('busca-avaliador-cadastrado');
        if (busca) busca.value = '';

        await carregarAvaliadores();
        await carregarAvaliadoresCadastrados();
        await carregarConfiguracaoAvaliacao();
        await carregarAtribuicaoManual();
    }
    window.selecionar = selecionar;

    // ============================================================
    // AVALIADORES JÁ VINCULADOS AO EVENTO
    // ============================================================
    async function carregarAvaliadores() {
        if (!evAtual) return;
        const container = document.getElementById('lista-avaliadores');
        container.innerHTML = '<li class="coord-empty"><i class="fas fa-circle-notch fa-spin"></i> Carregando...</li>';

        try {
            const data = await api(`/api/eventos/avaliadores/coordenador-lista?eventoId=${evAtual._id}`);
            const lista = data.avaliadores || [];
            avaliadoresDoEvento = lista.filter(a => a.status === 'Ativo');

            if (lista.length === 0) {
                container.innerHTML = '<li class="coord-empty"><i class="fas fa-users-slash"></i> Nenhum avaliador adicionado.</li>';
                return;
            }

            container.innerHTML = lista.map(a => {
                const iniciais = (a.nomeCompleto || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
                const statusChip = a.status === 'Pendente'
                    ? '<span class="coord-chip coord-chip-warning"><i class="fas fa-clock"></i> Pendente</span>'
                    : '<span class="coord-chip coord-chip-success"><i class="fas fa-check"></i> Ativo</span>';
                return `
                    <li class="coord-user-item">
                        <div class="coord-user-item-info">
                            <div class="coord-user-avatar">${escapeHtml(iniciais)}</div>
                            <div class="coord-user-info-text">
                                <strong>${escapeHtml(a.nomeCompleto)}</strong>
                                <small>${escapeHtml(a.email)}</small>
                                <div style="margin-top:4px;">${statusChip}</div>
                            </div>
                        </div>
                        <div class="coord-user-actions">
                            ${a.status === 'Pendente'
                                ? `<button class="coord-btn coord-btn-success coord-btn-sm" onclick="aprovarAvaliador('${a._id}')" title="Aprovar"><i class="fas fa-check"></i></button>`
                                : ''}
                            <button class="coord-btn coord-btn-outline coord-btn-sm" onclick="desvincularAvaliador('${a._id}')" title="Remover" style="border-color:#fecaca;color:#991b1b;">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </li>
                `;
            }).join('');
        } catch (err) {
            container.innerHTML = `<li class="coord-alert coord-alert-danger"><i class="fas fa-exclamation-triangle"></i><span>${escapeHtml(err.message)}</span></li>`;
        }
    }
    window.carregarAvaliadores = carregarAvaliadores;

    // ============================================================
    // AVALIADORES CADASTRADOS NO SISTEMA (busca global)
    // ============================================================
    async function carregarAvaliadoresCadastrados() {
        if (!evAtual) return;
        const container = document.getElementById('lista-avaliadores-cadastrados');
        if (!container) return;

        container.innerHTML = '<div class="coord-empty"><i class="fas fa-circle-notch fa-spin"></i> Buscando...</div>';

        try {
            const busca = (document.getElementById('busca-avaliador-cadastrado')?.value || '').trim();
            const params = new URLSearchParams();
            params.set('eventoId', evAtual._id);
            if (busca) params.set('busca', busca);

            const data = await api(`/api/eventos/avaliadores/coordenador-listar-cadastrados?${params.toString()}`);
            const disponiveis = data.avaliadores || [];

            avaliadoresCadastradosCache = disponiveis;

            if (disponiveis.length === 0) {
                container.innerHTML = `
                    <div class="coord-empty">
                        <i class="fas fa-search"></i>
                        ${busca
                            ? 'Nenhum avaliador encontrado com esse termo.'
                            : 'Nenhum avaliador cadastrado disponível para vincular.'}
                    </div>`;
                return;
            }

            container.innerHTML = disponiveis.map(u => {
                const iniciais = (u.nomeCompleto || '?')
                    .split(' ')
                    .map(n => n[0])
                    .slice(0, 2)
                    .join('')
                    .toUpperCase();

                const isPendente = u.status === 'Pendente';
                const badgeStatus = isPendente
                    ? '<span class="coord-chip coord-chip-warning" style="font-size:10px; padding:2px 6px; margin-left:6px;"><i class="fas fa-clock"></i> Pendente</span>'
                    : '<span class="coord-chip coord-chip-success" style="font-size:10px; padding:2px 6px; margin-left:6px;"><i class="fas fa-check"></i> Ativo</span>';

                const btnAprovar = isPendente
                    ? `<button type="button" class="coord-btn coord-btn-success coord-btn-sm" onclick="aprovarAvaliadorCadastrado('${u._id}', this)" title="Aprovar cadastro">
                        <i class="fas fa-check"></i>
                    </button>`
                    : '';

                return `
                    <li class="coord-user-item">
                        <div class="coord-user-item-info">
                            <div class="coord-user-avatar" style="background:linear-gradient(135deg,#0ea5e9,#0284c7);">
                                ${escapeHtml(iniciais)}
                            </div>
                            <div class="coord-user-info-text">
                                <strong>${escapeHtml(u.nomeCompleto)} ${badgeStatus}</strong>
                                <small>${escapeHtml(u.email)}</small>
                            </div>
                        </div>
                        <div class="coord-user-actions" style="display:flex; gap:6px;">
                            ${btnAprovar}
                            <button type="button"
                                    class="coord-btn coord-btn-primary coord-btn-sm"
                                    onclick="vincularAvaliadorCadastrado('${escapeHtml(u.email)}', this)"
                                    title="Vincular ao evento">
                                <i class="fas fa-link"></i> Vincular
                            </button>
                        </div>
                    </li>
                `;
            }).join('');
        } catch (err) {
            container.innerHTML = `
                <div class="coord-alert coord-alert-danger">
                    <i class="fas fa-exclamation-triangle"></i>
                    <span>${escapeHtml(err.message)}</span>
                </div>`;
        }
    }
    window.carregarAvaliadoresCadastrados = carregarAvaliadoresCadastrados;

    // ============================================================
    // APROVAR E VINCULAR direto da lista de busca
    // ============================================================
    async function aprovarAvaliadorCadastrado(avaliadorId, btnEl) {
        if (!evAtual || !evAtual._id) {
            return toast('Nenhum evento selecionado.', 'error');
        }

        const original = btnEl ? btnEl.innerHTML : null;
        if (btnEl) {
            btnEl.disabled = true;
            btnEl.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
        }

        try {
            const res = await api(`/api/eventos/avaliadores/coordenador-aprovar/${avaliadorId}`, { 
                method: 'PUT',
                body: JSON.stringify({ eventoId: evAtual._id })
            });
            
            toast(res.message || 'Avaliador aprovado e vinculado com sucesso!', 'success');
            
            await carregarAvaliadores();
            await carregarAvaliadoresCadastrados();
            await carregarAtribuicaoManual();
        } catch (err) {
            console.error('[ERRO] Falha ao aprovar:', err);
            toast(err.message, 'error');
            if (btnEl) {
                btnEl.disabled = false;
                btnEl.innerHTML = original;
            }
        }
    }
    window.aprovarAvaliadorCadastrado = aprovarAvaliadorCadastrado;

    // ============================================================
    // VINCULAR
    // ============================================================
    async function vincularAvaliadorCadastrado(email, btnEl) {
        if (!evAtual) return;
        const original = btnEl ? btnEl.innerHTML : null;
        if (btnEl) {
            btnEl.disabled = true;
            btnEl.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
        }
        try {
            const res = await api('/api/eventos/avaliadores/coordenador-vincular', {
                method: 'POST',
                body: JSON.stringify({ eventoId: evAtual._id, email })
            });
            toast(res.message || 'Avaliador vinculado!', 'success');
            await carregarAvaliadores();
            await carregarAvaliadoresCadastrados();
            await carregarAtribuicaoManual();
        } catch (err) {
            toast(err.message, 'error');
            if (btnEl) {
                btnEl.disabled = false;
                btnEl.innerHTML = original;
            }
        }
    }
    window.vincularAvaliadorCadastrado = vincularAvaliadorCadastrado;

    function bindBuscaAvaliador() {
        const input = document.getElementById('busca-avaliador-cadastrado');
        if (!input || input._bound) return;
        input._bound = true;
        input.addEventListener('input', () => {
            clearTimeout(buscaAvaliadorDebounce);
            buscaAvaliadorDebounce = setTimeout(() => carregarAvaliadoresCadastrados(), 400);
        });
    }

    async function vincularAvaliador() {
        const email = document.getElementById('email-avaliador').value.trim();
        if (!email) return toast('Digite o e-mail do avaliador.', 'warning');
        try {
            const res = await api('/api/eventos/avaliadores/coordenador-vincular', {
                method: 'POST',
                body: JSON.stringify({ eventoId: evAtual._id, email })
            });
            document.getElementById('email-avaliador').value = '';
            toast(res.message || 'Avaliador vinculado!', 'success');
            await carregarAvaliadores();
            await carregarAvaliadoresCadastrados();
            await carregarAtribuicaoManual();
        } catch (err) {
            toast(err.message, 'error');
        }
    }
    window.vincularAvaliador = vincularAvaliador;

    async function desvincularAvaliador(avaliadorId) {
        if (!confirm('Deseja remover este avaliador do evento?')) return;
        try {
            await api('/api/eventos/avaliadores/coordenador-desvincular', {
                method: 'POST',
                body: JSON.stringify({ eventoId: evAtual._id, avaliadorId })
            });
            toast('Avaliador removido.', 'success');
            await carregarAvaliadores();
            await carregarAvaliadoresCadastrados();
            await carregarAtribuicaoManual();
        } catch (err) {
            toast(err.message, 'error');
        }
    }
    window.desvincularAvaliador = desvincularAvaliador;

    async function aprovarAvaliador(avaliadorId) {
        if (!evAtual || !evAtual._id) {
            return toast('Nenhum evento selecionado.', 'error');
        }
        try {
            await api(`/api/eventos/avaliadores/coordenador-aprovar/${avaliadorId}`, { 
                method: 'PUT',
                body: JSON.stringify({ eventoId: evAtual._id })
            });
            toast('Avaliador aprovado!', 'success');
            await carregarAvaliadores();
            await carregarAvaliadoresCadastrados();
        } catch (err) {
            console.error('[ERRO] Falha ao aprovar:', err);
            toast(err.message, 'error');
        }
    }
    window.aprovarAvaliador = aprovarAvaliador;

    // ============================================================
    // CONFIGURAÇÃO DE AVALIAÇÃO
    // ============================================================
    async function carregarConfiguracaoAvaliacao() {
        if (!evAtual) return;
        const container = document.getElementById('config-avaliacao-area');
        container.innerHTML = '<div class="coord-empty"><i class="fas fa-circle-notch fa-spin"></i> Carregando...</div>';

        try {
            const data = await api(`/api/eventos/avaliacoes/configuracao/${evAtual._id}`);
            if (!data.temAnexoAvaliativo) {
                container.innerHTML = '<div class="coord-alert coord-alert-warning"><i class="fas fa-exclamation-triangle"></i><span>Este evento não tem anexo avaliativo no modelo.</span></div>';
                return;
            }
            const cfg = data.configuracao || {};

            container.innerHTML = `
                <div class="coord-config-grid">
                    <div class="coord-form-group" style="margin:0;">
                        <label>Avaliadores por inscrição</label>
                        <input type="number" min="1" max="20" id="cfg-num-avaliadores" value="${cfg.numAvaliadores || 1}">
                    </div>
                    <div class="coord-form-group" style="margin:0;">
                        <label>Modo de distribuição</label>
                        <select id="cfg-modo-distribuicao">
                            <option value="aleatorio" ${cfg.modoDistribuicao === 'aleatorio' ? 'selected' : ''}>🎲 Aleatório</option>
                            <option value="manual" ${cfg.modoDistribuicao === 'manual' ? 'selected' : ''}>✋ Manual</option>
                        </select>
                    </div>
                    <div class="coord-form-group" style="margin:0;">
                        <label>Tipo de média</label>
                        <select id="cfg-tipo-media" ${cfg.calcularMedia ? '' : 'disabled'}>
                            <option value="aritmetica" ${cfg.tipoMedia === 'aritmetica' ? 'selected' : ''}>Aritmética</option>
                            <option value="ponderada" ${cfg.tipoMedia === 'ponderada' ? 'selected' : ''}>Ponderada</option>
                        </select>
                    </div>
                </div>

                <label class="coord-switch">
                    <input type="checkbox" id="cfg-calcular-media" ${cfg.calcularMedia ? 'checked' : ''}>
                    📊 Calcular média final automaticamente
                </label>
                <label class="coord-switch">
                    <input type="checkbox" id="cfg-exige-assinatura-avaliador" ${cfg.exigeAssinaturaAvaliador ? 'checked' : ''}>
                    ✍️ Exigir assinatura do avaliador
                </label>

                ${cfg.sorteioExecutadoEm ? `
                    <div class="coord-alert coord-alert-info" style="margin-top:14px;">
                        <i class="fas fa-dice"></i>
                        <span>Sorteio executado em <strong>${new Date(cfg.sorteioExecutadoEm).toLocaleString('pt-BR')}</strong></span>
                    </div>
                ` : ''}

                <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px;">
                    <button class="coord-btn coord-btn-primary" onclick="salvarConfiguracaoAvaliacao()">
                        <i class="fas fa-save"></i> Salvar Configuração
                    </button>
                    <button class="coord-btn coord-btn-success" onclick="executarSorteio()">
                        <i class="fas fa-dice"></i> Sortear Avaliadores
                    </button>
                    ${cfg.sorteioExecutadoEm ? `
                        <button class="coord-btn coord-btn-secondary" onclick="limparSorteio()">
                            <i class="fas fa-undo"></i> Limpar Sorteio
                        </button>
                    ` : ''}
                </div>
            `;

            document.getElementById('cfg-calcular-media').addEventListener('change', (e) => {
                document.getElementById('cfg-tipo-media').disabled = !e.target.checked;
            });
        } catch (err) {
            container.innerHTML = `<div class="coord-alert coord-alert-danger"><i class="fas fa-exclamation-triangle"></i><span>${escapeHtml(err.message)}</span></div>`;
        }
    }
    window.carregarConfiguracaoAvaliacao = carregarConfiguracaoAvaliacao;

    async function salvarConfiguracaoAvaliacao() {
        if (!evAtual) return;
        const payload = {
            numAvaliadores: parseInt(document.getElementById('cfg-num-avaliadores').value) || 1,
            modoDistribuicao: document.getElementById('cfg-modo-distribuicao').value,
            calcularMedia: document.getElementById('cfg-calcular-media').checked,
            tipoMedia: document.getElementById('cfg-tipo-media').value,
            exigeAssinaturaAvaliador: document.getElementById('cfg-exige-assinatura-avaliador').checked
        };
        try {
            const resp = await api(`/api/eventos/avaliacoes/configuracao/${evAtual._id}`, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });
            toast(resp.mensagem || 'Configuração salva!', 'success');
            await carregarConfiguracaoAvaliacao();
            await carregarAtribuicaoManual();
        } catch (err) {
            toast(err.message, 'error');
        }
    }
    window.salvarConfiguracaoAvaliacao = salvarConfiguracaoAvaliacao;

    async function executarSorteio() {
        if (!evAtual) return;
        if (!confirm('Sortear avaliadores? As atribuições pendentes serão criadas automaticamente.')) return;
        try {
            const resp = await api(`/api/eventos/avaliacoes/sortear/${evAtual._id}`, { method: 'POST' });
            let msg = resp.mensagem || 'Sorteio realizado';
            if (resp.semSorteio > 0) msg += ` — ⚠️ ${resp.semSorteio} inscrição(ões) sem atribuição completa.`;
            toast(msg, resp.semSorteio > 0 ? 'warning' : 'success');
            await carregarConfiguracaoAvaliacao();
            await carregarAtribuicaoManual();
        } catch (err) {
            toast(err.message, 'error');
        }
    }
    window.executarSorteio = executarSorteio;

    async function limparSorteio() {
        if (!evAtual) return;
        if (!confirm('Remover TODAS as atribuições aleatórias pendentes?')) return;
        try {
            const resp = await api(`/api/eventos/avaliacoes/limpar-sorteio/${evAtual._id}`, { method: 'POST' });
            toast(resp.mensagem || 'Sorteio limpo.', 'success');
            await carregarConfiguracaoAvaliacao();
            await carregarAtribuicaoManual();
        } catch (err) {
            toast(err.message, 'error');
        }
    }
    window.limparSorteio = limparSorteio;

    // ============================================================
    // ATRIBUIÇÃO MANUAL
    // ============================================================
    async function carregarAtribuicaoManual() {
        if (!evAtual) return;
        const container = document.getElementById('atribuicao-manual-area');
        container.innerHTML = '<div class="coord-empty"><i class="fas fa-circle-notch fa-spin"></i> Carregando...</div>';

        try {
            const pendData = await api(`/api/eventos/avaliacoes/pendentes-coordenador/${evAtual._id}`);
            const pendentes = pendData.pendentes || [];
            const cfg = pendData.configuracao || {};

            const cardPai = container.closest('.coord-card');

            if (cfg.modoDistribuicao === 'aleatorio') {
                if (cardPai) cardPai.style.display = 'none';
                return;
            }
            if (cardPai) cardPai.style.display = 'block';

            if (avaliadoresDoEvento.length === 0) {
                try {
                    const avData = await api(`/api/eventos/avaliadores/coordenador-lista?eventoId=${evAtual._id}`);
                    avaliadoresDoEvento = (avData.avaliadores || []).filter(a => a.status === 'Ativo');
                } catch (_) {}
            }
            if (avaliadoresDoEvento.length === 0) {
                container.innerHTML = '<div class="coord-alert coord-alert-warning"><i class="fas fa-exclamation-triangle"></i><span>Nenhum avaliador ativo vinculado. Adicione na seção acima.</span></div>';
                return;
            }

            // Filtro de categorias
            const categoriasUnicas = [...new Set(pendentes.map(p => p.categoria).filter(Boolean))];
            let filtroHtml = '';
            if (categoriasUnicas.length > 0) {
                filtroHtml = `
                    <div style="margin-bottom:12px; display:flex; align-items:center; gap:10px;">
                        <label style="font-size:13px; font-weight:600; color:#334155;"><i class="fas fa-filter"></i> Filtrar por Categoria:</label>
                        <select id="filtro-categoria-atribuicao" class="coord-input" style="max-width:250px;" onchange="filtrarTabelaAtribuicao()">
                            <option value="">Todas as categorias</option>
                            ${categoriasUnicas.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
                        </select>
                    </div>
                `;
            }

            container.innerHTML = `
                <div class="coord-alert coord-alert-info">
                    <i class="fas fa-hand-paper"></i>
                    <span>Modo <strong>manual</strong>. O <strong>anexo avaliativo</strong> da inscrição (a ficha de critérios) será enviado ao avaliador.</span>
                </div>
                ${filtroHtml}
                ${pendentes.length === 0
                    ? '<div class="coord-empty"><i class="fas fa-inbox"></i> Nenhuma inscrição ainda.</div>'
                    : `<div id="container-tabela-atribuicao">${renderTabelaPendentes(pendentes, cfg)}</div>`}
            `;
            
            // Guarda os dados na window para o filtro funcionar sem recarregar da API
            window._pendentesData = pendentes;
            window._cfgData = cfg;

        } catch (err) {
            container.innerHTML = `<div class="coord-alert coord-alert-danger"><i class="fas fa-exclamation-triangle"></i><span>${escapeHtml(err.message)}</span></div>`;
        }
    }
    window.carregarAtribuicaoManual = carregarAtribuicaoManual;

    function filtrarTabelaAtribuicao() {
        const filtro = document.getElementById('filtro-categoria-atribuicao')?.value || '';
        const pendentes = window._pendentesData || [];
        const cfg = window._cfgData || {};
        
        const filtrados = filtro 
            ? pendentes.filter(p => p.categoria === filtro) 
            : pendentes;
            
        const containerTabela = document.getElementById('container-tabela-atribuicao');
        if (containerTabela) {
            if (filtrados.length > 0) {
                containerTabela.innerHTML = renderTabelaPendentes(filtrados, cfg);
            } else {
                containerTabela.innerHTML = '<div class="coord-empty" style="padding:20px;"><i class="fas fa-search"></i> Nenhuma inscrição nesta categoria.</div>';
            }
        }
    }
    window.filtrarTabelaAtribuicao = filtrarTabelaAtribuicao;

    function renderTabelaPendentes(pendentes, cfg) {
        return `
            <div style="overflow-x:auto;">
                <table class="coord-table">
                    <thead>
                        <tr>
                            <th>Participante</th>
                            <th>Protocolo</th>
                            <th style="text-align:center;">Concluídas</th>
                            <th style="text-align:center;">Faltam</th>
                            <th>Avaliadores</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${pendentes.map(p => renderLinhaAtribuicao(p, cfg)).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    function renderLinhaAtribuicao(p, cfg) {
        const idsAtribuidos = new Set((p.avaliadores || []).map(a => String(a.avaliadorId)));

        // Renderiza a Badge da Categoria, se existir
        const badgeCategoria = p.categoria
            ? `<div style="margin-top: 4px;">
                 <span class="coord-chip" style="background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd; font-size:11px; padding:2px 6px;">
                    <i class="fas fa-tags"></i> ${escapeHtml(p.categoria)}
                 </span>
               </div>`
            : '';

        const checkboxes = avaliadoresDoEvento.map(av => {
            const marcado = idsAtribuidos.has(String(av._id));
            return `
                <label style="display:inline-flex;align-items:center;gap:6px;font-size:12.5px;margin-right:12px;margin-bottom:4px;cursor:pointer;">
                    <input type="checkbox" class="check-avaliador-${p.inscricaoId}" value="${av._id}" ${marcado ? 'checked disabled' : ''}>
                    <span>${escapeHtml(av.nomeCompleto)}</span>
                    ${marcado ? '<i class="fas fa-check" style="color:#10b981;"></i>' : ''}
                </label>
            `;
        }).join('');

        const badges = (p.avaliadores || []).map(a => {
            const cls = a.status === 'Concluída' ? 'coord-badge-success' : 'coord-badge-warning';
            const ic = a.status === 'Concluída' ? 'fa-check-circle' : 'fa-clock';
            const atr = a.atribuicao === 'manual' ? '✋' : '🎲';
            return `
                <span class="coord-badge ${cls}">
                    <i class="fas ${ic}"></i>
                    ${escapeHtml(a.nome)}
                    ${a.status === 'Concluída' ? `(${a.nota})` : ' — pendente'}
                    <span style="opacity:.7;">${atr}</span>
                    ${a.status === 'Pendente' ? `
                        <button type="button" onclick="removerAtribuicao('${a.avaliacaoId}')"
                                style="background:none;border:none;color:inherit;cursor:pointer;padding:0;margin-left:2px;">
                            <i class="fas fa-times"></i>
                        </button>
                    ` : ''}
                </span>
            `;
        }).join(' ') || '<span class="coord-muted" style="font-size:12px;">Nenhum</span>';

        const faltamChip = p.faltamAtribuir > 0
            ? `<span class="coord-chip coord-chip-warning">${p.faltamAtribuir}</span>`
            : `<span class="coord-chip coord-chip-success"><i class="fas fa-check"></i> 0</span>`;

        const blocoAtribuir = p.faltamAtribuir > 0 && avaliadoresDoEvento.length > 0 ? `
            <details style="margin-top:6px;">
                <summary style="cursor:pointer;font-size:12px;color:var(--coord-primary);font-weight:700;">
                    <i class="fas fa-user-plus"></i> Atribuir manualmente
                </summary>
                <div style="margin-top:8px;padding:10px;background:#f8fafc;border-radius:8px;">
                    <div style="margin-bottom:8px; font-size:11px; color:#64748b;">
                        ${p.categoria ? `Selecione avaliadores capacitados para a categoria <strong>${escapeHtml(p.categoria)}</strong>.` : 'Selecione os avaliadores:'}
                    </div>
                    ${checkboxes}
                    <button type="button" class="coord-btn coord-btn-primary coord-btn-sm"
                            onclick="salvarAtribuicoesInscricao('${p.inscricaoId}')">
                        <i class="fas fa-save"></i> Salvar
                    </button>
                </div>
            </details>
        ` : (p.faltamAtribuir === 0 ? '<span class="coord-chip coord-chip-success" style="margin-top:4px;"><i class="fas fa-check"></i> Completo</span>' : '');

        return `
            <tr>
                <td>
                    <strong>${escapeHtml(p.participante)}</strong>
                    ${badgeCategoria}
                </td>
                <td><code>${escapeHtml(p.protocolo)}</code></td>
                <td style="text-align:center;">${p.concluidas}</td>
                <td style="text-align:center;">${faltamChip}</td>
                <td>
                    <div style="margin-bottom:6px;">${badges}</div>
                    ${blocoAtribuir}
                </td>
            </tr>
        `;
    }

    async function salvarAtribuicoesInscricao(inscricaoId) {
        if (!evAtual) return;
        const checkboxes = document.querySelectorAll(`.check-avaliador-${inscricaoId}:checked:not(:disabled)`);
        const avaliadoresIds = Array.from(checkboxes).map(cb => cb.value);
        if (avaliadoresIds.length === 0) return toast('Selecione pelo menos um avaliador.', 'warning');

        try {
            const resp = await api('/api/eventos/avaliacoes/atribuir-manual-lote', {
                method: 'POST',
                body: JSON.stringify({ eventoId: evAtual._id, inscricaoId, avaliadoresIds })
            });
            toast(resp.mensagem || 'Atribuições salvas!', 'success');
            await carregarAtribuicaoManual();
        } catch (err) {
            toast(err.message, 'error');
        }
    }
    window.salvarAtribuicoesInscricao = salvarAtribuicoesInscricao;

    async function removerAtribuicao(avaliacaoId) {
        if (!confirm('Remover esta atribuição?')) return;
        try {
            await api(`/api/eventos/avaliacoes/atribuir-manual/${avaliacaoId}`, { method: 'DELETE' });
            toast('Atribuição removida.', 'success');
            await carregarAtribuicaoManual();
        } catch (err) {
            toast(err.message, 'error');
        }
    }
    window.removerAtribuicao = removerAtribuicao;

    // ============================================================
    // RELATÓRIO
    // ============================================================
    async function atualizarRelatorio() {
        if (!evAtual) return;
        const container = document.getElementById('relatorio-area');
        container.innerHTML = '<div class="coord-empty"><i class="fas fa-circle-notch fa-spin"></i> Carregando estatísticas...</div>';

        try {
            const data = await api(`/api/eventos/avaliacoes/coordenador-relatorio/${evAtual._id}`);
            relatorioData = data.relatorio || [];
            const cfg = data.configuracao || {};

            if (relatorioData.length === 0) {
                container.innerHTML = '<div class="coord-empty"><i class="fas fa-chart-bar"></i><h3 style="font-size:15px;margin:8px 0 4px;">Nenhuma avaliação registrada</h3><p style="margin:0;">Assim que os avaliadores começarem, os dados aparecerão aqui.</p></div>';
                return;
            }

            const totalAvaliacoes = relatorioData.reduce((acc, r) => acc + r.notas.length, 0);
            const todasAsMedias = relatorioData.map(r => parseFloat(r.mediaFinal)).filter(n => !isNaN(n));
            const mediaGeral = todasAsMedias.length > 0 ? (todasAsMedias.reduce((a, b) => a + b, 0) / todasAsMedias.length).toFixed(2) : '—';
            const maiorNota = todasAsMedias.length > 0 ? Math.max(...todasAsMedias).toFixed(2) : '—';
            const menorNota = todasAsMedias.length > 0 ? Math.min(...todasAsMedias).toFixed(2) : '—';

            const modoInfo = cfg.modoDistribuicao === 'manual' ? '✋ Manual' : '🎲 Aleatório';
            const mediaInfo = cfg.calcularMedia !== false
                ? `📊 Média ${cfg.tipoMedia === 'ponderada' ? 'Ponderada' : 'Aritmética'}`
                : '📊 Média desativada';

            container.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:16px;">
                    <div class="coord-muted coord-small">
                        <i class="fas fa-info-circle"></i> ${cfg.numAvaliadores || 1} avaliador(es) • ${modoInfo} • ${mediaInfo}
                    </div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                        <input type="text" id="filtro-relatorio" class="coord-input" placeholder="🔍 Buscar participante..." style="width:220px;" oninput="filtrarRelatorio()">
                        <button class="coord-btn coord-btn-outline coord-btn-sm" onclick="exportarCSV()">
                            <i class="fas fa-file-csv"></i> CSV
                        </button>
                    </div>
                </div>

                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:20px;">
                    <div class="coord-kpi coord-kpi-primary"><div class="lbl">Média Geral</div><div class="num">${mediaGeral}</div></div>
                    <div class="coord-kpi coord-kpi-success"><div class="lbl">Maior Nota</div><div class="num">${maiorNota}</div></div>
                    <div class="coord-kpi coord-kpi-danger"><div class="lbl">Menor Nota</div><div class="num">${menorNota}</div></div>
                    <div class="coord-kpi coord-kpi-info"><div class="lbl">Avaliações</div><div class="num">${totalAvaliacoes}</div></div>
                </div>

                <div style="overflow-x:auto;">
                    <table class="coord-table" id="tabela-relatorio">
                        <thead>
                            <tr>
                                <th>Participante</th>
                                <th style="text-align:center;">Protocolo</th>
                                <th style="text-align:center;">Avaliadores</th>
                                <th style="text-align:center;">Média Final</th>
                                <th style="text-align:center;">Ações</th>
                            </tr>
                        </thead>
                        <tbody id="tbody-relatorio">
                            ${renderLinhasRelatorio(relatorioData)}
                        </tbody>
                    </table>
                </div>
            `;
        } catch (err) {
            container.innerHTML = `<div class="coord-alert coord-alert-danger"><i class="fas fa-exclamation-triangle"></i><span>${escapeHtml(err.message)}</span></div>`;
        }
    }
    window.atualizarRelatorio = atualizarRelatorio;

    function renderLinhasRelatorio(lista) {
        return lista.map(r => {
            const nome = r.inscricao?.participanteId?.nomeCompleto || '—';
            const protocolo = r.inscricao?.protocolo || '—';
            const media = r.mediaFinal;

            let badgeCls = 'coord-badge-neutral';
            if (media !== '—') {
                const n = parseFloat(media);
                if (n >= 70) badgeCls = 'coord-badge-success';
                else if (n >= 50) badgeCls = 'coord-badge-warning';
                else badgeCls = 'coord-badge-danger';
            }

            return `
                <tr class="linha-participante">
                    <td><strong>${escapeHtml(nome)}</strong></td>
                    <td style="text-align:center;"><code>${escapeHtml(protocolo)}</code></td>
                    <td style="text-align:center;"><span class="coord-badge coord-badge-info">${r.notas?.length || 0} feitas</span></td>
                    <td style="text-align:center;"><span class="coord-badge ${badgeCls}" style="font-size:13px;">${media !== '—' ? media : '—'}</span></td>
                    <td style="text-align:center;">
                        <button class="coord-btn coord-btn-outline coord-btn-sm" onclick="verDetalhesRelatorio('${escapeHtml(protocolo)}')">
                            <i class="fas fa-eye"></i> Detalhes
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function filtrarRelatorio() {
        const termo = document.getElementById('filtro-relatorio').value.toLowerCase();
        const filtrados = relatorioData.filter(r => {
            const nome = (r.inscricao?.participanteId?.nomeCompleto || '').toLowerCase();
            const prot = (r.inscricao?.protocolo || '').toLowerCase();
            return nome.includes(termo) || prot.includes(termo);
        });
        document.getElementById('tbody-relatorio').innerHTML = renderLinhasRelatorio(filtrados);
    }
    window.filtrarRelatorio = filtrarRelatorio;

    function verDetalhesRelatorio(protocolo) {
        const item = relatorioData.find(r => r.inscricao?.protocolo === protocolo);
        if (!item) return;

        const nome = item.inscricao?.participanteId?.nomeCompleto || '—';

        const avaliacoesHtml = item.notas.map(n => {
            const atrib = n.atribuicao === 'manual'
                ? '<span class="coord-badge coord-badge-warning" style="margin-left:6px;">✋ manual</span>'
                : '<span class="coord-badge coord-badge-info" style="margin-left:6px;">🎲 sorteado</span>';

            let notasDetalhadas = '';
            if (n.notas && Object.keys(n.notas).length > 0) {
                notasDetalhadas = `
                    <div style="margin-top:8px;padding:10px;background:#f8fafc;border-radius:8px;font-size:12.5px;">
                        <strong>Notas por critério:</strong>
                        <ul style="margin:6px 0 0;padding-left:18px;">
                            ${Object.entries(n.notas).map(([k, v]) => `<li>${escapeHtml(k)}: <strong>${v}</strong></li>`).join('')}
                        </ul>
                    </div>
                `;
            }

            return `
                <div style="margin-bottom:12px;border:1px solid var(--coord-border);border-radius:10px;overflow:hidden;">
                    <div style="padding:10px 14px;background:#f1f5f9;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">
                        <strong style="font-size:13.5px;"><i class="fas fa-user-tie" style="color:var(--coord-primary);"></i> ${escapeHtml(n.avaliador)}</strong>
                        <div>
                            <span class="coord-badge coord-badge-info">Nota: ${n.notaFinal}</span>
                            ${atrib}
                        </div>
                    </div>
                    <div style="padding:12px 14px;">
                        <div class="coord-muted coord-small" style="margin-bottom:6px;"><i class="fas fa-clock"></i> ${new Date(n.createdAt).toLocaleString('pt-BR')}</div>
                        ${n.parecer ? `<div style="margin-bottom:6px;"><strong>Parecer:</strong><br>${escapeHtml(n.parecer)}</div>` : '<div class="coord-muted coord-small" style="font-style:italic;margin-bottom:6px;">Sem parecer.</div>'}
                        ${notasDetalhadas}
                        ${n.assinaturaAvaliadorBase64 ? `
                            <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--coord-border);text-align:center;">
                                <div class="coord-muted coord-small" style="margin-bottom:4px;">Assinatura do Avaliador</div>
                                <img src="${n.assinaturaAvaliadorBase64}" style="max-height:80px;max-width:100%;">
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');

        const html = `
            <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--coord-border);padding-bottom:12px;margin-bottom:16px;flex-wrap:wrap;gap:10px;">
                <div>
                    <h4 style="margin:0;font-size:18px;">${escapeHtml(nome)}</h4>
                    <div class="coord-muted coord-small">Protocolo: <strong>${escapeHtml(protocolo)}</strong></div>
                </div>
                <div style="text-align:right;">
                    <div class="coord-muted coord-small">Média Final</div>
                    <div style="font-size:22px;font-weight:800;color:var(--coord-primary);">${item.mediaFinal}</div>
                </div>
            </div>
            <h6 style="margin:0 0 12px;"><i class="fas fa-clipboard-list"></i> Avaliações Recebidas (${item.notas.length})</h6>
            ${avaliacoesHtml}
        `;

        const antigo = document.getElementById('modal-detalhes-relatorio');
        if (antigo) antigo.remove();

        const div = document.createElement('div');
        div.id = 'modal-detalhes-relatorio';
        div.className = 'coord-modal-overlay';
        div.innerHTML = `
            <div class="coord-modal" style="max-width:720px;">
                <div class="coord-modal-header">
                    <h3><i class="fas fa-search"></i> Detalhes da Avaliação</h3>
                    <button class="coord-btn coord-btn-ghost" onclick="document.getElementById('modal-detalhes-relatorio').remove()"><i class="fas fa-times"></i></button>
                </div>
                <div class="coord-modal-body" style="max-height:70vh;overflow-y:auto;">${html}</div>
                <div class="coord-modal-footer">
                    <button class="coord-btn coord-btn-secondary" onclick="document.getElementById('modal-detalhes-relatorio').remove()">Fechar</button>
                </div>
            </div>
        `;
        document.body.appendChild(div);
    }
    window.verDetalhesRelatorio = verDetalhesRelatorio;

    function exportarCSV() {
        if (!relatorioData || relatorioData.length === 0) {
            toast('Nenhum dado para exportar.', 'warning');
            return;
        }
        const headers = ['Participante', 'Protocolo', 'Avaliador', 'Nota Final', 'Parecer', 'Data'];
        const rows = [];
        relatorioData.forEach(r => {
            const nome = r.inscricao?.participanteId?.nomeCompleto || '';
            const prot = r.inscricao?.protocolo || '';
            r.notas.forEach(n => {
                rows.push([
                    `"${nome}"`,
                    `"${prot}"`,
                    `"${n.avaliador}"`,
                    n.notaFinal,
                    `"${(n.parecer || '').replace(/"/g, '""')}"`,
                    `"${new Date(n.createdAt).toLocaleString('pt-BR')}"`
                ]);
            });
        });
        const csv = '\uFEFF' + headers.join(';') + '\n' + rows.map(e => e.join(';')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `relatorio_${evAtual.slug || 'evento'}.csv`;
        link.click();
    }
    window.exportarCSV = exportarCSV;

    // ============================================================
    // INICIALIZAÇÃO
    // ============================================================
    document.addEventListener('DOMContentLoaded', () => {
        user = getUser();
        decidirTelaInicial();
        bindBuscaAvaliador();
    });

})();