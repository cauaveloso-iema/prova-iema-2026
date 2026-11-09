/* ============================================================================
   PORTAL DO AVALIADOR — frontend/eventos/js/avaliador.js
   v3 — Dark Mode, Drag & Drop e Teal Color
   ============================================================================ */

(function () {
    'use strict';

    const TOKEN_KEY = 'avaliador_token';
    const USER_KEY = 'avaliador_user';

    let token = localStorage.getItem(TOKEN_KEY);
    let user = {};
    try { user = JSON.parse(localStorage.getItem(USER_KEY) || '{}'); } catch { user = {}; }

    function setUser(u) { localStorage.setItem(USER_KEY, JSON.stringify(u || {})); }

    window.logout = function () {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        location.reload();
    };

    let ultimaLista = [];

    // ============================================================
    // DARK MODE
    // ============================================================
    window.toggleDarkMode = function() {
        document.body.classList.toggle('dark-mode');
        const isDark = document.body.classList.contains('dark-mode');
        localStorage.setItem('avaliador_dark_mode', isDark ? '1' : '0');
        const icon = document.getElementById('icon-dark-mode');
        if (icon) {
            icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
        }
    };
    // Verifica preferência salva
    if (localStorage.getItem('avaliador_dark_mode') === '1') {
        document.body.classList.add('dark-mode');
        setTimeout(() => {
            const icon = document.getElementById('icon-dark-mode');
            if (icon) icon.className = 'fas fa-sun';
        }, 100);
    }

    let __canvasAvaliador = {
        ctx: null, canvas: null, wrapper: null, placeholder: null, desenhando: false, temAssinatura: false, lastX: 0, lastY: 0
    };

    // ============================================================
    // ESTADO INICIAL
    // ============================================================
    function decidirTelaInicial() {
        if (!token || !user._id) {
            mostrarTela('auth');
            return;
        }
        if (user.isCoordenador) {
            mostrarTela('auth');
            return;
        }
        if (user.senhaTemporaria === true) {
            mostrarTela('trocar-senha');
            return;
        }
        mostrarTela('painel');
        document.getElementById('avaliador-nome').textContent = user.nomeCompleto || user.email || 'Avaliador';
        carregarAvaliacoes();
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
            if (data.avaliador.isCoordenador) throw new Error('Acesso negado. Esta conta é de coordenador.');

            token = data.token;
            user = data.avaliador;
            localStorage.setItem(TOKEN_KEY, token);
            setUser(user);

            if (user.senhaTemporaria === true || data.precisaTrocarSenha === true) {
                mostrarTela('trocar-senha');
            } else {
                mostrarTela('painel');
                document.getElementById('avaliador-nome').textContent = user.nomeCompleto || user.email;
                carregarAvaliacoes();
            }
        } catch (err) {
            document.getElementById('login-alert').innerHTML = `<div class="alert alert-danger p-2 small" style="border-radius:8px;">${err.message}</div>`;
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Acessar Painel';
        }
    });

    // ============================================================
    // CADASTRO
    // ============================================================
    document.getElementById('form-cadastro').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btn-cad');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Enviando...';
        try {
            const res = await fetch('/api/eventos/avaliadores/cadastro', {
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
            
            document.getElementById('cad-alert').innerHTML = `<div class="alert alert-success p-2 small" style="border-radius:8px;">${data.message}</div>`;
            document.getElementById('form-cadastro').reset();
        } catch (err) {
            document.getElementById('cad-alert').innerHTML = `<div class="alert alert-danger p-2 small" style="border-radius:8px;">${err.message}</div>`;
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
            0: { label: 'Muito curta', color: '#ef4444' }, 1: { label: 'Fraca', color: '#ef4444' },
            2: { label: 'Razoável', color: '#f59e0b' }, 3: { label: 'Boa', color: '#0ea5e9' },
            4: { label: 'Forte', color: '#10b981' }, 5: { label: 'Excelente', color: '#10b981' }
        };
        return { score, label: map[score].label, color: map[score].color };
    }
    const inputNovaSenha = document.getElementById('nova-senha');
    if (inputNovaSenha) {
        inputNovaSenha.addEventListener('input', () => {
            const info = avaliarForcaSenha(inputNovaSenha.value);
            const barra = document.getElementById('senha-forca-barra');
            const texto = document.getElementById('senha-forca-texto');
            if(barra && texto) {
                barra.style.width = (info.score / 5 * 100) + '%';
                barra.style.background = info.color;
                texto.textContent = info.label;
            }
        });
    }

    // ============================================================
    // TROCA OBRIGATÓRIA (1º Acesso)
    // ============================================================
    window.trocarSenhaPrimeiroAcesso = async function () {
        const nova = document.getElementById('nova-senha').value;
        const confirma = document.getElementById('confirma-senha').value;
        const btn = document.getElementById('btn-trocar-senha');

        if (!nova || nova.length < 6) return mostrarAlertaSenha('A senha deve ter no mínimo 6 caracteres.', 'error');
        if (nova !== confirma) return mostrarAlertaSenha('As senhas não coincidem.', 'error');

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Salvando...';
        try {
            const res = await fetch('/api/eventos/avaliadores/trocar-senha', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ novaSenha: nova })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erro ao alterar senha');

            user.senhaTemporaria = false;
            setUser(user);
            
            mostrarTela('painel');
            document.getElementById('avaliador-nome').textContent = user.nomeCompleto || user.email;
            carregarAvaliacoes();
        } catch (err) {
            mostrarAlertaSenha(err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-check"></i> Salvar e continuar';
        }
    };

    function mostrarAlertaSenha(msg, tipo) {
        const el = document.getElementById('senha-alert');
        if(!el) return;
        el.innerHTML = `<div class="alert alert-${tipo === 'error' ? 'danger' : 'success'} p-2 small" style="border-radius:8px;">${msg}</div>`;
    }

    // ============================================================
    // CARREGAR AVALIAÇÕES PENDENTES
    // ============================================================
    async function carregarAvaliacoes() {
        const container = document.getElementById('lista-avaliacoes');
        container.innerHTML = '<div class="coord-empty"><i class="fas fa-circle-notch fa-spin"></i> Buscando avaliações...</div>';

        try {
            const res = await fetch('/api/eventos/avaliacoes/minhas-avaliacoes', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erro ao carregar avaliações');

            const pendentes = data.pendentes || [];
            if (pendentes.length === 0) {
                container.innerHTML = '<div class="coord-empty"><i class="fas fa-check-circle" style="color:#10b981;"></i> Você não tem nenhuma avaliação pendente. Bom trabalho!</div>';
                return;
            }

            ultimaLista = pendentes;

            container.innerHTML = pendentes.map((p, idx) => {
                const qtd = (p.criteriosAvaliacao || []).length || (p.camposAvaliativos || []).length;
                const qtdAnexos = Object.keys(p.anexosParticipante || {}).length;
                const anexosInfo = qtdAnexos > 0
                    ? `<span style="color:#0f766e; font-weight:600;"><i class="fas fa-paperclip"></i> ${qtdAnexos} anexo(s)</span>`
                    : '<span style="color:#94a3b8;">sem anexos</span>';

                let modoBadge = '';
                if (p.modoDistribuicao === 'manual') {
                    modoBadge = '<span class="badge bg-warning text-dark ms-1" title="Atribuído manualmente"><i class="fas fa-hand-paper"></i> Manual</span>';
                } else if (p.atribuidoAMim) {
                    modoBadge = '<span class="badge bg-info text-dark ms-1" title="Sorteado para você"><i class="fas fa-dice"></i> Sorteado</span>';
                } else {
                    modoBadge = '<span class="badge bg-secondary ms-1" title="Modo automático"><i class="fas fa-dice"></i> Automático</span>';
                }

                return `
                    <div class="inscricao-card">
                        <div style="display:flex; justify-content:space-between; align-items:start; gap:12px; flex-wrap:wrap;">
                            <div style="flex:1;">
                                <h4>
                                    <i class="fas fa-calendar-alt" style="color:#0f766e;"></i> ${escapeHtml(p.eventoNome)}
                                    ${modoBadge}
                                </h4>
                                <div class="meta" style="margin-bottom:6px;">
                                    <i class="fas fa-user"></i> Participante: <strong>${escapeHtml(p.participante)}</strong> (Protocolo: ${escapeHtml(p.protocolo)})
                                </div>
                                <div class="meta">
                                    <i class="fas fa-clipboard-list"></i> ${qtd} critério(s) • ${anexosInfo} • <i class="fas fa-user-check"></i> ${p.avaliacoesJaFeitas || 0}/${p.numAvaliadores || 1} feitas
                                </div>
                            </div>
                            <button type="button" class="coord-btn coord-btn-primary btn-avaliar" data-idx="${idx}">
                                <i class="fas fa-edit"></i> Avaliar
                            </button>
                        </div>
                    </div>
                `;
            }).join('');

            container.querySelectorAll('.btn-avaliar').forEach(btn => {
                btn.addEventListener('click', () => {
                    const p = ultimaLista[parseInt(btn.dataset.idx, 10)];
                    if (p) abrirModalAvaliacao(p);
                });
            });

        } catch (err) {
            container.innerHTML = `<div class="alert alert-danger">Erro: ${escapeHtml(err.message)}</div>`;
        }
    }
    window.carregarAvaliacoes = carregarAvaliacoes;

    // ============================================================
    // MODAL DE AVALIAÇÃO
    // ============================================================
    function abrirModalAvaliacao(p) {
        const criterios = p.criteriosAvaliacao || [];
        const camposAvaliativos = p.camposAvaliativos || [];

        if (criterios.length === 0 && camposAvaliativos.length === 0) {
            alert('Este evento/modelo não possui critérios de avaliação cadastrados.');
            return;
        }

        // Anexos
        const anexos = p.anexosParticipante || {};
        const chavesAnexos = Object.keys(anexos);
        let blocoAnexos = '';
        if (chavesAnexos.length > 0) {
            blocoAnexos = `
                <div class="bloco-dados">
                    <div class="bloco-dados-header" style="background:#f0fdfa; color:#0f766e;">
                        <i class="fas fa-paperclip"></i> Documentos enviados (${chavesAnexos.length})
                    </div>
                    <div class="bloco-dados-body" style="display:flex; flex-direction:column; gap:8px;">
                        ${chavesAnexos.map(k => `
                            <div style="display:flex; justify-content:space-between; align-items:center; background:white; padding:8px 12px; border-radius:8px; border:1px solid #ccfbf1;">
                                <strong style="font-size:13px; color:#1e293b;">${escapeHtml(k)}</strong>
                                <a href="${escapeHtml(anexos[k])}" target="_blank" rel="noopener" class="coord-btn coord-btn-secondary coord-btn-sm" style="border-color:#ccfbf1; color:#0f766e;">
                                    <i class="fas fa-external-link-alt"></i> Abrir
                                </a>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        // Dados preenchidos
        const dados = p.dadosPreenchidos || {};
        const chavesDados = Object.keys(dados).filter(k => k !== '__assinaturas' && k !== '__nome');
        let blocoDados = '';

        if (chavesDados.length > 0) {
            const camposProfessor = [];
            const camposAluno = [];
            const camposResponsavel = [];

            const chavesResponsavel = [
                'nome do responsavel', 'naturalidade', 'estado civil',
                'endereco', 'rua', 'numero', 'nº', 'bairro', 'cep',
                'municipio', 'cidade', 'estado', 'uf',
                'relacao', 'qualidade', 'data'
            ];

            chavesDados.forEach(k => {
                const l = k.toLowerCase();
                const v = dados[k];
                if (v === '' || v === null || v === undefined) return;

                if (l.includes('_aluno_') || l.includes('estudante_') || l.includes('estudante[')) {
                    camposAluno.push({ label: k, valor: v });
                } else if (l.includes('respons') || chavesResponsavel.some(r => l.includes(r))) {
                    camposResponsavel.push({ label: k, valor: v });
                } else {
                    camposProfessor.push({ label: k, valor: v });
                }
            });

            const renderTabela = (titulo, icone, campos) => {
                if (!campos.length) return '';
                return `
                    <div class="mb-3">
                        <h6 style="color:#0f766e; font-size:13px; font-weight:700; margin-bottom:6px; border-bottom:2px solid #ccfbf1; padding-bottom:4px;">
                            <i class="fas ${icone}"></i> ${titulo} (${campos.length})
                        </h6>
                        <table class="tabela-detalhes">
                            ${campos.map(c => `
                                <tr>
                                    <td>${escapeHtml(c.label)}</td>
                                    <td>${escapeHtml(String(c.valor))}</td>
                                </tr>
                            `).join('')}
                        </table>
                    </div>
                `;
            };

            blocoDados = `
                <div class="bloco-dados">
                    <div class="bloco-dados-header">
                        <i class="fas fa-user-tie"></i> Dados preenchidos pelo participante
                    </div>
                    <div class="bloco-dados-body">
                        ${renderTabela('Dados do Professor / Projeto', 'fa-user-tie', camposProfessor)}
                        ${renderTabela('Dados do Aluno / Estudante', 'fa-user-graduate', camposAluno)}
                        ${renderTabela('Dados do Responsável', 'fa-user-shield', camposResponsavel)}
                    </div>
                </div>
            `;
        }

        // Assinatura do participante
        let blocoAssParticipante = '';
        if (p.assinaturaBase64) {
            blocoAssParticipante = `
                <div class="bloco-dados">
                    <div class="bloco-dados-header" style="background:#ecfdf5; color:#047857;">
                        <i class="fas fa-signature"></i> Assinatura do Participante
                    </div>
                    <div class="bloco-dados-body" style="text-align:center;">
                        <img src="${p.assinaturaBase64}" alt="Assinatura" style="max-height:100px; max-width:100%; border:1px solid #e2e8f0; border-radius:8px;">
                    </div>
                </div>
            `;
        }

        // Assinatura do avaliador
        const exigeAssinaturaAvaliador = p.exigeAssinaturaAvaliador === true;
        let blocoAssAvaliador = '';
        if (exigeAssinaturaAvaliador) {
            blocoAssAvaliador = `
                <div class="bloco-dados" style="border-color:#fcd34d;">
                    <div class="bloco-dados-header" style="background:#fffbeb; color:#92400e;">
                        <i class="fas fa-pen-fancy"></i> Sua Assinatura (Obrigatória)
                    </div>
                    <div class="bloco-dados-body">
                        <p style="font-size:12px; color:#92400e; margin:0 0 8px 0;">Desenhe sua assinatura no campo abaixo com o mouse ou o dedo.</p>
                        <div class="area-assinatura" id="canvasWrapperAvaliador" style="border-color:#fcd34d; background:#fffdf5;">
                            <canvas id="canvasAvaliador"></canvas>
                            <div id="placeholderAvaliador" class="placeholder">
                                <i class="fas fa-pen-fancy" style="font-size:24px; display:block; margin-bottom:4px;"></i>
                                Assine aqui
                            </div>
                        </div>
                        <button type="button" class="coord-btn coord-btn-secondary coord-btn-sm" style="margin-top:8px;" onclick="limparAssinaturaAvaliador()">
                            <i class="fas fa-eraser"></i> Limpar assinatura
                        </button>
                    </div>
                </div>
            `;
        }

        // Anexo do Avaliador (Drag & Drop)
        const blocoAnexoAvaliador = `
            <div class="bloco-dados">
                <div class="bloco-dados-header">
                    <i class="fas fa-cloud-upload-alt"></i> Anexar Documento (Opcional)
                </div>
                <div class="bloco-dados-body">
                    <div class="drag-drop-area" id="dragDropAvaliador">
                        <i class="fas fa-file-upload"></i>
                        <p style="margin:0; font-size:14px; color:var(--coord-text);"><strong>Clique aqui</strong> ou arraste um arquivo</p>
                        <p style="margin:4px 0 0; font-size:12px; color:var(--coord-muted);">PDF, Imagem ou Word (Max 5MB)</p>
                        <input type="file" id="inputAnexoAvaliador" style="display:none;">
                    </div>
                    <div id="previewAnexoAvaliador" style="display:none; margin-top:10px; padding:10px; background:#f1f5f9; border-radius:8px; font-size:13px; display:flex; align-items:center; justify-content:space-between;">
                        <span id="nomeAnexoAvaliador"><i class="fas fa-file-alt"></i> arquivo.pdf</span>
                        <button type="button" onclick="removerAnexoAvaliador()" class="btn btn-sm btn-outline-danger" style="padding:2px 8px; border-radius:6px;">Remover</button>
                    </div>
                </div>
            </div>
        `;

        // Critérios
        let camposHtml = '';
        let somaMaxima = 0;

        if (criterios.length > 0) {
            criterios.forEach(c => somaMaxima += parseFloat(c.notaMaxima) || 5);
            camposHtml = criterios.map((c, idx) => {
                const notaMax = parseFloat(c.notaMaxima) || 5;
                const descricaoHtml = c.descricao ? `<div style="font-size:12px; color:#64748b; margin-bottom:8px;">${escapeHtml(c.descricao)}</div>` : '';
                return `
                    <div class="criterio-item">
                        <label>
                            <span>${idx + 1}. ${escapeHtml(c.label)}</span>
                            <small style="color:#64748b; font-weight:400;">Máx: ${notaMax}</small>
                        </label>
                        ${descricaoHtml}
                        <input type="number" class="form-control nota-input" data-label="${escapeHtml(c.label)}" data-max="${notaMax}" min="0" max="${notaMax}" step="0.1" placeholder="0 a ${notaMax}">
                    </div>
                `;
            }).join('');
        } else {
            camposAvaliativos.forEach((c, idx) => {
                somaMaxima += 10;
                const valorPreenchido = dados[c.label] || '(Não preenchido)';
                camposHtml += `
                    <div class="criterio-item">
                        <label>
                            <span>${idx + 1}. ${escapeHtml(c.label)}</span>
                            <small style="color:#64748b; font-weight:400;">Máx: 10</small>
                        </label>
                        <div style="background:#f1f5f9; padding:8px 12px; border-radius:6px; margin-bottom:8px; font-size:13px; color:#334155;">
                            <strong>Resposta:</strong> ${escapeHtml(String(valorPreenchido))}
                        </div>
                        <input type="number" class="form-control nota-input" data-label="${escapeHtml(c.label)}" data-max="10" min="0" max="10" step="0.5" placeholder="0 a 10">
                    </div>
                `;
            });
        }

        // Info Distribuição
        const infoDistribuicao = `
            <div style="background:#f0fdfa; border:1px solid #ccfbf1; border-radius:8px; padding:12px; margin-bottom:16px; font-size:13px; color:#0f766e;">
                ${p.modoDistribuicao === 'manual'
                    ? '<i class="fas fa-hand-paper text-warning"></i> <strong>Manual:</strong> você foi atribuído a esta avaliação pelo coordenador.'
                    : (p.atribuidoAMim
                        ? '<i class="fas fa-dice text-info"></i> <strong>Sorteio:</strong> esta inscrição foi sorteada para você.'
                        : '<i class="fas fa-dice text-info"></i> <strong>Automático:</strong> esta inscrição está disponível.')}
                <br><i class="fas fa-chart-line text-success"></i> <strong>Média:</strong> ${p.calcularMedia ? 'Automática' : 'Desativada'}.
                <br><i class="fas fa-user-check text-primary"></i> <strong>Avaliações:</strong> ${p.avaliacoesJaFeitas || 0} de ${p.numAvaliadores || 1} já realizadas.
            </div>
        `;

        // HTML do Modal
        const htmlModal = `
            <div class="modal fade" id="modalAvaliacao" tabindex="-1" data-bs-backdrop="static">
                <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title"><i class="fas fa-edit"></i> Avaliando: ${escapeHtml(p.participante)}</h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="alert alert-secondary py-2 mb-3" style="font-size:13px; border-radius:8px;">
                                <strong>Evento:</strong> ${escapeHtml(p.eventoNome)}<br>
                                <strong>Protocolo:</strong> ${escapeHtml(p.protocolo)}
                            </div>

                            ${infoDistribuicao}
                            ${blocoAnexos}
                            ${blocoDados}
                            ${blocoAssParticipante}
                            ${blocoAssAvaliador}
                            ${blocoAnexoAvaliador}

                            ${p.informacoesDocumento ? `
                                <div class="alert alert-warning mb-3" style="font-size:13px;">
                                    <strong><i class="fas fa-info-circle"></i> Instruções</strong>
                                    <div style="margin-top:8px; white-space:pre-wrap; max-height:200px; overflow-y:auto;">${escapeHtml(p.informacoesDocumento)}</div>
                                </div>
                            ` : ''}

                            <h6 class="mb-3" style="font-weight:800; color:var(--coord-text); border-bottom:2px solid var(--coord-border); padding-bottom:8px;">
                                <i class="fas fa-star" style="color:#f59e0b;"></i> Critérios de Avaliação (${criterios.length || camposAvaliativos.length})
                                <small style="font-weight:400; color:#64748b; float:right;">Máx: ${somaMaxima} pts</small>
                            </h6>
                            ${camposHtml}

                            <div class="mt-4 mb-3">
                                <label class="form-label fw-bold">Parecer / Observações (Opcional)</label>
                                <textarea id="aval-parecer" class="form-control" rows="3" placeholder="Descreva sua avaliação..."></textarea>
                            </div>

                            <div class="mb-3">
                                <label class="form-label fw-bold">Nota Final (0 a 100) *</label>
                                <div style="display:flex; align-items:center; gap:12px;">
                                    <input type="number" id="aval-nota-final" class="form-control" readonly placeholder="Soma automática" style="background:#f8fafc; font-weight:800; font-size:20px; color:#0f172a; max-width:150px;">
                                    <span id="aval-nota-final-info" class="text-muted small" style="font-weight:600;"></span>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="coord-btn coord-btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                            <button type="button" class="coord-btn coord-btn-primary btn-salvar-avaliacao"
                                    data-evento-id="${escapeHtml(String(p.eventoId))}"
                                    data-inscricao-id="${escapeHtml(String(p.inscricaoId))}"
                                    data-exige-assinatura="${exigeAssinaturaAvaliador ? '1' : '0'}">
                                <i class="fas fa-save"></i> Salvar Avaliação
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const container = document.getElementById('modalAvaliacaoContainer');
        container.innerHTML = htmlModal;

        const modalEl = document.getElementById('modalAvaliacao');
        const modal = new bootstrap.Modal(modalEl);
        modal.show();

        // Drag and Drop Logic
        const dropArea = document.getElementById('dragDropAvaliador');
        const fileInput = document.getElementById('inputAnexoAvaliador');
        const preview = document.getElementById('previewAnexoAvaliador');
        const nomeAnexo = document.getElementById('nomeAnexoAvaliador');
        let arquivoAvaliador = null;

        if(dropArea && fileInput) {
            dropArea.addEventListener('click', () => fileInput.click());
            dropArea.addEventListener('dragover', (e) => { e.preventDefault(); dropArea.classList.add('dragover'); });
            dropArea.addEventListener('dragleave', () => dropArea.classList.remove('dragover'));
            dropArea.addEventListener('drop', (e) => {
                e.preventDefault(); dropArea.classList.remove('dragover');
                if(e.dataTransfer.files.length) {
                    fileInput.files = e.dataTransfer.files;
                    handleFile();
                }
            });
            fileInput.addEventListener('change', handleFile);

            function handleFile() {
                if(fileInput.files.length) {
                    arquivoAvaliador = fileInput.files[0];
                    nomeAnexo.innerHTML = `<i class="fas fa-check-circle" style="color:#10b981;"></i> ${arquivoAvaliador.name}`;
                    preview.style.display = 'flex';
                }
            }
            window.removerAnexoAvaliador = () => {
                arquivoAvaliador = null;
                fileInput.value = '';
                preview.style.display = 'none';
            };
        }

        // Soma automática
        const atualizarSoma = () => {
            let soma = 0;
            document.querySelectorAll('#modalAvaliacao .nota-input').forEach(inp => {
                const v = parseFloat(inp.value);
                if (!isNaN(v)) {
                    const max = parseFloat(inp.dataset.max) || 5;
                    soma += Math.min(v, max);
                }
            });
            const campoFinal = document.getElementById('aval-nota-final');
            if (campoFinal) campoFinal.value = soma > 0 ? soma.toFixed(1) : '';

            const info = document.getElementById('aval-nota-final-info');
            if (info) {
                info.textContent = soma > 0 ? `(${soma.toFixed(1)} de ${somaMaxima})` : '';
                info.style.color = soma > somaMaxima ? '#dc2626' : '#64748b';
            }
        };
        document.querySelectorAll('#modalAvaliacao .nota-input').forEach(inp => {
            inp.addEventListener('input', atualizarSoma);
            inp.addEventListener('change', atualizarSoma);
        });

        // Canvas
        if (exigeAssinaturaAvaliador) {
            modalEl.addEventListener('shown.bs.modal', () => { inicializarCanvasAvaliador(); });
            setTimeout(() => {
                if (!__canvasAvaliador.canvas || __canvasAvaliador.canvas.width === 0) inicializarCanvasAvaliador();
            }, 500);
        }

        // Salvar
        const btnSalvar = document.querySelector('#modalAvaliacao .btn-salvar-avaliacao');
        btnSalvar.addEventListener('click', () => {
            const notaFinal = parseFloat(document.getElementById('aval-nota-final').value);
            if (isNaN(notaFinal)) return alert('⚠️ Preencha os critérios para calcular a nota.');
            const parecer = (document.getElementById('aval-parecer')?.value || '').trim();
            const notas = {};
            document.querySelectorAll('#modalAvaliacao .nota-input').forEach(inp => {
                if (inp.value !== '' && inp.value !== null) {
                    const v = parseFloat(inp.value);
                    if (!isNaN(v)) notas[inp.dataset.label] = v;
                }
            });

            const precisaAssinar = btnSalvar.dataset.exigeAssinatura === '1';
            let assinaturaBase64 = null;
            if (precisaAssinar) {
                if (!__canvasAvaliador.temAssinatura || !__canvasAvaliador.canvas) {
                    return alert('⚠️ Você precisa assinar no campo antes de salvar.');
                }
                try { assinaturaBase64 = __canvasAvaliador.canvas.toDataURL('image/png'); }
                catch (e) { return alert('❌ Erro ao capturar assinatura.'); }
            }

            // Aqui você pode adicionar o arquivoAvaliador no FormData se o backend aceitar
            // Ex: const formData = new FormData(); formData.append('file', arquivoAvaliador);

            salvarAvaliacao(btnSalvar.dataset.eventoId, btnSalvar.dataset.inscricaoId, notas, parecer, notaFinal, assinaturaBase64);
        });
    }

    // ============================================================
    // CANVAS DE ASSINATURA
    // ============================================================
    function inicializarCanvasAvaliador(tentativa = 1) {
        const canvas = document.getElementById('canvasAvaliador');
        const wrapper = document.getElementById('canvasWrapperAvaliador');
        const placeholder = document.getElementById('placeholderAvaliador');
        if (!canvas || !wrapper) {
            if (tentativa < 20) return setTimeout(() => inicializarCanvasAvaliador(tentativa + 1), 100);
            return;
        }
        const rect = wrapper.getBoundingClientRect();
        if ((rect.width < 10 || rect.height < 10) && tentativa < 20) return setTimeout(() => inicializarCanvasAvaliador(tentativa + 1), 100);

        const dpr = window.devicePixelRatio || 1;
        const canvasNovo = canvas.cloneNode(true);
        canvas.parentNode.replaceChild(canvasNovo, canvas);

        canvasNovo.width = Math.floor(rect.width * dpr);
        canvasNovo.height = Math.floor(rect.height * dpr);
        canvasNovo.style.width = rect.width + 'px';
        canvasNovo.style.height = rect.height + 'px';

        const ctx = canvasNovo.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0f172a';
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, rect.width, rect.height);

        __canvasAvaliador = { ctx, canvas: canvasNovo, wrapper, placeholder, desenhando: false, temAssinatura: false, lastX: 0, lastY: 0 };

        const getPos = (e) => {
            const r = canvasNovo.getBoundingClientRect();
            let cx, cy;
            if (e.touches && e.touches.length > 0) { cx = e.touches[0].clientX; cy = e.touches[0].clientY; }
            else if (e.changedTouches && e.changedTouches.length > 0) { cx = e.changedTouches[0].clientX; cy = e.changedTouches[0].clientY; }
            else { cx = e.clientX; cy = e.clientY; }
            return { x: cx - r.left, y: cy - r.top };
        };

        const iniciar = (e) => {
            e.preventDefault(); __canvasAvaliador.desenhando = true; __canvasAvaliador.temAssinatura = true;
            if (placeholder) placeholder.style.opacity = '0';
            const p = getPos(e); __canvasAvaliador.lastX = p.x; __canvasAvaliador.lastY = p.y;
            ctx.beginPath(); ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2); ctx.fillStyle = '#0f172a'; ctx.fill();
        };
        const desenhar = (e) => {
            if (!__canvasAvaliador.desenhando) return; e.preventDefault();
            const p = getPos(e);
            ctx.beginPath(); ctx.moveTo(__canvasAvaliador.lastX, __canvasAvaliador.lastY); ctx.lineTo(p.x, p.y); ctx.stroke();
            __canvasAvaliador.lastX = p.x; __canvasAvaliador.lastY = p.y;
        };
        const parar = (e) => { if (e && e.preventDefault) e.preventDefault(); __canvasAvaliador.desenhando = false; };

        canvasNovo.addEventListener('touchstart', iniciar, { passive: false });
        canvasNovo.addEventListener('touchmove', desenhar, { passive: false });
        canvasNovo.addEventListener('touchend', parar, { passive: false });
        canvasNovo.addEventListener('touchcancel', parar, { passive: false });
        canvasNovo.addEventListener('mousedown', iniciar);
        canvasNovo.addEventListener('mousemove', desenhar);
        canvasNovo.addEventListener('mouseup', parar);
        canvasNovo.addEventListener('mouseleave', parar);
    }

    window.limparAssinaturaAvaliador = function () {
        if (!__canvasAvaliador.canvas || !__canvasAvaliador.ctx) return;
        const rect = __canvasAvaliador.canvas.getBoundingClientRect();
        __canvasAvaliador.ctx.clearRect(0, 0, rect.width, rect.height);
        __canvasAvaliador.ctx.fillStyle = '#ffffff';
        __canvasAvaliador.ctx.fillRect(0, 0, rect.width, rect.height);
        __canvasAvaliador.temAssinatura = false;
        if (__canvasAvaliador.placeholder) __canvasAvaliador.placeholder.style.opacity = '1';
    };

    // ============================================================
    // SALVAR AVALIAÇÃO
    // ============================================================
    async function salvarAvaliacao(eventoId, inscricaoId, notas, parecer, notaFinal, assinaturaAvaliadorBase64) {
        const btn = document.querySelector('#modalAvaliacao .btn-salvar-avaliacao');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Salvando...'; }

        try {
            const res = await fetch('/api/eventos/avaliacoes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ eventoId, inscricaoId, notas, parecer, notaFinal, assinaturaAvaliadorBase64 })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erro ao salvar avaliação');

            const modalEl = document.getElementById('modalAvaliacao');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
            
            setTimeout(() => {
                const c = document.getElementById('modalAvaliacaoContainer');
                if(c) c.innerHTML = '';
            }, 300);

            if (data.avaliacao?.notaFinalCalculada != null) {
                alert(`✅ Avaliação salva!\n\nSua nota: ${data.avaliacao.notaFinal}\n📊 Média parcial: ${data.avaliacao.notaFinalCalculada}`);
            } else {
                alert('✅ Avaliação salva com sucesso!');
            }
            carregarAvaliacoes();

        } catch (err) {
            alert('❌ ' + err.message);
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Salvar Avaliação'; }
        }
    }

    function escapeHtml(s) {
        if (s == null) return '';
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // START
    document.addEventListener('DOMContentLoaded', () => {
        decidirTelaInicial();
    });

})();