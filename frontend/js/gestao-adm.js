// ============================================================================
// PAINEL GESTÃO ADM - JAVASCRIPT
// Notificações no menu do avatar (padrão Enfermaria) + anti-ghost-click
// + badge com contador de não lidas
// ============================================================================

const HORARIOS_REFEICOES = {
    manha: '09:00',
    almoco: '12:00',
    tarde: '15:00'
};

class GestaoAdmPanel {
    constructor() {
        this.apiBase = '/api/cardapio';
        this.usuario = JSON.parse(localStorage.getItem('user_data') || '{}');
        this.cardapios = [];
        this.cardapiosFiltrados = [];
        this.editandoId = null;
        this._notifInterval = null;
        this._notifAbertaEm = 0;

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    async init() {
        const token = localStorage.getItem('auth_token');
        if (!token) {
            window.location.href = 'login.html';
            return;
        }

        if (!['gestao-adm', 'admin', 'super_admin'].includes(this.usuario.role)) {
            alert('Acesso negado. Este painel é exclusivo do perfil Gestão ADM.');
            window.location.href = 'login.html';
            return;
        }

        this.preencherDadosUsuario();
        this.iniciarRelogio();
        this.setupEventListeners();
        await this.carregarNotificacoes();
        await this.carregarCardapios();

        // 🔔 Polling do badge de notificações a cada 30s
        this._notifInterval = setInterval(() => this.carregarNotificacoes(), 30000);
    }

    preencherDadosUsuario() {
        const userName = document.getElementById('userName');
        const userRole = document.getElementById('userRole');
        const userAvatar = document.getElementById('userAvatar');
        const headerNome = document.getElementById('headerNomeUsuario');

        const nome = this.usuario.nome || 'Gestão ADM';
        if (userName) userName.textContent = nome;
        if (userRole) userRole.textContent = 'Gestão ADM';
        if (headerNome) headerNome.textContent = nome.split(' ')[0];

        if (userAvatar) {
            if (this.usuario.fotoPerfil) {
                userAvatar.innerHTML = `<img src="${this.usuario.fotoPerfil}" alt="Foto de perfil">`;
            } else {
                const iniciais = nome.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
                userAvatar.innerHTML = `<span>${iniciais}</span>`;
            }
        }

        const hora = new Date().getHours();
        const turnoEl = document.getElementById('headerTurno');
        const turnoIcone = document.getElementById('headerTurnoIcone');
        if (turnoEl && turnoIcone) {
            let turno = 'Matutino';
            let icone = 'fa-sun';
            let cor = 'text-warning';
            if (hora >= 12 && hora < 18) {
                turno = 'Vespertino';
                icone = 'fa-cloud-sun';
                cor = 'text-info';
            } else if (hora >= 18 || hora < 6) {
                turno = 'Noturno';
                icone = 'fa-moon';
                cor = 'text-primary';
            }
            turnoEl.textContent = turno;
            turnoIcone.className = `fas ${icone} ${cor} me-1`;
        }
    }

    iniciarRelogio() {
        const tempo = document.getElementById('relogioTempoReal');
        const data = document.getElementById('relogioData');
        const dataAtual = document.getElementById('dataAtual');

        const atualizar = () => {
            const agora = new Date();
            if (tempo) {
                tempo.textContent = `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}:${String(agora.getSeconds()).padStart(2, '0')}`;
            }
            if (data) {
                data.textContent = agora.toLocaleDateString('pt-BR', {
                    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
                });
            }
            if (dataAtual) dataAtual.textContent = agora.toLocaleDateString('pt-BR');
        };

        atualizar();
        setInterval(atualizar, 1000);
    }

    setupEventListeners() {
        document.addEventListener('click', (e) => {
            const userContainer = document.getElementById('userMenuContainer');
            const userDropdown = document.getElementById('userDropdown');
            const notifDropdown = document.getElementById('notificacoesDropdown');

            if (userContainer && userDropdown && !userContainer.contains(e.target)) {
                userDropdown.classList.remove('active');
            }

            if (notifDropdown && notifDropdown.classList.contains('active')) {
                if (!notifDropdown.contains(e.target) && !e.target.closest('[onclick*="abrirMenuNotificacoesSeguro"]')) {
                    notifDropdown.classList.remove('active');
                }
            }
        });
    }

    // ==========================================================================
    // 🔔 NOTIFICAÇÕES
    // ==========================================================================
    async carregarNotificacoes() {
        const token = localStorage.getItem('auth_token');
        if (!token) return;

        try {
            // 1) Contador de não lidas → atualiza os badges
            const countRes = await fetch('/api/notificacoes/nao-lidas/contador', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            let total = 0;
            if (countRes.ok) {
                const c = await countRes.json();
                total = c.count || 0;
            }
            this.atualizarBadges(total);

            // 2) Lista → renderiza o dropdown
            const res = await fetch('/api/notificacoes?limite=20', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();

            const lista = document.getElementById('notificacoesLista');
            if (!lista) return;

            if (!data.success || !data.notificacoes || data.notificacoes.length === 0) {
                lista.innerHTML = `
                    <div style="text-align:center;padding:30px 16px;color:#6c757d;">
                        <i class="fas fa-bell-slash" style="font-size:2rem;margin-bottom:10px;opacity:.5;"></i>
                        <p style="margin:0;">Nenhuma notificação</p>
                    </div>`;
                return;
            }

            lista.innerHTML = data.notificacoes.slice(0, 10).map(n => {
                const naoLida = !n.lida;
                const idSeguro = String(n._id || n.id || '').replace(/'/g, '');
                const linkSeguro = String(n.link || '').replace(/'/g, '&#39;').replace(/"/g, '&quot;');
                const temLink = linkSeguro && linkSeguro !== '#' && linkSeguro !== 'null' && linkSeguro !== 'undefined';

                return `
                    <div style="
                        padding:12px 16px;
                        border-bottom:1px solid #f3f4f6;
                        display:flex;
                        gap:10px;
                        align-items:flex-start;
                        cursor:pointer;
                        ${naoLida ? 'background:#f0fdfa;border-left:3px solid #0f766e;' : ''}
                    "
                    onmouseover="this.style.background='#f3f4f6'"
                    onmouseout="this.style.background='${naoLida ? '#f0fdfa' : 'transparent'}'"
                    onclick="abrirNotificacao('${idSeguro}', '${linkSeguro}')">
                        <div style="width:34px;height:34px;border-radius:8px;background:${n.cor || 'linear-gradient(135deg,#0f766e,#115e59)'};color:white;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                            <i class="fas ${n.icone || 'fa-bell'}"></i>
                        </div>
                        <div style="flex:1;min-width:0;">
                            <div style="font-size:13px;font-weight:600;color:#111827;">${this.escapeHtml(n.titulo || 'Notificação')}</div>
                            <div style="font-size:12px;color:#6b7280;margin-top:2px;">${this.escapeHtml(n.mensagem || '')}</div>
                            ${temLink ? '<div style="font-size:11px;color:#0f766e;margin-top:4px;"><i class="fas fa-external-link-alt"></i> Abrir</div>' : ''}
                        </div>
                    </div>`;
            }).join('');
        } catch (err) {
            console.warn('[notificações] erro:', err);
        }
    }

    async abrirNotificacao(id, link) {
        // 🛡️ ANTI-GHOST-CLICK: ignora cliques nos primeiros 400ms após abrir o dropdown
        const tempoDesdeAbertura = Date.now() - this._notifAbertaEm;
        if (tempoDesdeAbertura < 400) {
            console.log('🛡️ Clique ignorado (proteção anti-misclick — aguarde)');
            return;
        }

        const token = localStorage.getItem('auth_token');
        try {
            if (id) {
                await fetch(`/api/notificacoes/${id}/lida`, {
                    method: 'PUT',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
            }
            // Atualiza o badge
            const c = await fetch('/api/notificacoes/nao-lidas/contador', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (c.ok) {
                const d = await c.json();
                this.atualizarBadges(d.count || 0);
            }
            // Fecha dropdown
            const dd = document.getElementById('notificacoesDropdown');
            if (dd) dd.classList.remove('active');

            // Navega (se tiver link) ou recarrega
            if (link && link !== '#' && link !== 'null' && link !== 'undefined' && link !== '') {
                window.location.href = link;
            } else {
                this.carregarNotificacoes();
            }
        } catch (err) {
            console.error('[abrirNotificacao] erro:', err);
        }
    }

    atualizarBadges(count) {
        const menuBadge = document.getElementById('menuNotifBadge');
        const userBadge = document.getElementById('userNotificationBadge');

        // Badge do menu (número ao lado de "Notificações")
        if (menuBadge) {
            if (count > 0) {
                menuBadge.textContent = count > 99 ? '99+' : count;
                menuBadge.style.display = 'inline-flex';
            } else {
                menuBadge.style.display = 'none';
            }
        }

        // Badge do avatar (bolinha vermelha com número no canto da foto)
        if (userBadge) {
            if (count > 0) {
                userBadge.textContent = count > 99 ? '99+' : count;
                userBadge.classList.add('active');
                userBadge.style.display = 'inline-flex';
            } else {
                userBadge.textContent = '';
                userBadge.classList.remove('active');
                userBadge.style.display = 'none';
            }
        }
    }

    // ==========================================================================
    // 📅 CARDÁPIOS
    // ==========================================================================
    async carregarCardapios() {
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`${this.apiBase}/admin/listar`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const data = await response.json();
            if (!data.success) throw new Error(data.error || 'Erro ao carregar');

            this.cardapios = data.cardapios || [];
            this.cardapiosFiltrados = [...this.cardapios];
            this.atualizarStats();
            this.renderizarTabela();
        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    atualizarStats() {
        const total = this.cardapios.length;
        const elTotal = document.getElementById('metricTotal');
        if (elTotal) elTotal.textContent = total;

        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const cardapioHoje = this.cardapios.find(c => {
            const d = new Date(c.dataReferencia);
            d.setHours(0, 0, 0, 0);
            return d.getTime() === hoje.getTime();
        });

        const elHoje = document.getElementById('metricHoje');
        if (elHoje) {
            if (cardapioHoje) {
                elHoje.textContent = '✅ Cadastrado';
                elHoje.style.color = '#10b981';
            } else {
                elHoje.textContent = '⚠️ Ausente';
                elHoje.style.color = '#f59e0b';
            }
        }

        const diaSemana = hoje.getDay() === 0 ? 7 : hoje.getDay();
        const segunda = new Date(hoje);
        segunda.setDate(hoje.getDate() - diaSemana + 1);
        const sexta = new Date(segunda);
        sexta.setDate(segunda.getDate() + 4);
        sexta.setHours(23, 59, 59, 999);

        const naSemana = this.cardapios.filter(c => {
            const d = new Date(c.dataReferencia);
            return d >= segunda && d <= sexta;
        }).length;

        const elSemana = document.getElementById('metricSemana');
        if (elSemana) elSemana.textContent = naSemana;

        const elUltima = document.getElementById('metricUltima');
        if (elUltima) {
            if (total > 0) {
                const datas = this.cardapios.map(c => new Date(c.updatedAt || c.createdAt));
                const ultima = new Date(Math.max(...datas));
                elUltima.textContent = ultima.toLocaleDateString('pt-BR') + ' ' +
                    ultima.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            } else {
                elUltima.textContent = '—';
            }
        }
    }

    renderizarTabela() {
        const tbody = document.getElementById('tabelaBody');
        const badge = document.getElementById('badgeCount');
        if (!tbody) return;

        if (badge) badge.textContent = `${this.cardapiosFiltrados.length} registros`;

        if (this.cardapiosFiltrados.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center py-5 text-muted">
                        <i class="fas fa-utensils" style="font-size: 40px; color: #d1d5db; margin-bottom: 10px; display: block;"></i>
                        Nenhum cardápio cadastrado
                    </td>
                </tr>
            `;
            return;
        }

        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        tbody.innerHTML = this.cardapiosFiltrados.map(c => {
            const dataFormatada = new Date(c.dataReferencia).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
            const dataCardapio = new Date(c.dataReferencia);
            dataCardapio.setHours(0, 0, 0, 0);
            const isHoje = dataCardapio.getTime() === hoje.getTime();
            const id = c.id || c._id;

            return `
                <tr class="${isHoje ? 'hoje' : ''}">
                    <td>
                        <strong>${dataFormatada}</strong>
                        ${isHoje ? '<span class="hoje-badge">HOJE</span>' : ''}
                    </td>
                    <td><span class="semana-badge">${this.escapeHtml(c.semanaLabel)}</span></td>
                    <td>
                        <span class="refeicao-tabela-horario">${HORARIOS_REFEICOES.manha}</span>
                        ${this.escapeHtml(c.lancamentoManha)}
                    </td>
                    <td>
                        <span class="refeicao-tabela-horario">${HORARIOS_REFEICOES.almoco}</span>
                        ${this.escapeHtml(c.almoco)}
                    </td>
                    <td>
                        <span class="refeicao-tabela-horario">${HORARIOS_REFEICOES.tarde}</span>
                        ${this.escapeHtml(c.lancamentoTarde)}
                    </td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn-icon edit" onclick="gestaoAdm.editar('${id}')" title="Editar">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-icon delete" onclick="gestaoAdm.excluir('${id}')" title="Excluir">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    filtrarLocal() {
        const termo = (document.getElementById('filtroBusca')?.value || '').toLowerCase().trim();
        if (!termo) {
            this.cardapiosFiltrados = [...this.cardapios];
        } else {
            this.cardapiosFiltrados = this.cardapios.filter(c =>
                (c.lancamentoManha || '').toLowerCase().includes(termo) ||
                (c.almoco || '').toLowerCase().includes(termo) ||
                (c.lancamentoTarde || '').toLowerCase().includes(termo) ||
                (c.semanaLabel || '').toLowerCase().includes(termo)
            );
        }
        this.renderizarTabela();
    }

    async filtrarPorMes() {
        const mesAno = document.getElementById('filtroMes')?.value;
        if (!mesAno) {
            await this.carregarCardapios();
            return;
        }

        const [ano, mes] = mesAno.split('-');
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`${this.apiBase}/admin/listar?mes=${mes}&ano=${ano}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (data.success) {
                this.cardapiosFiltrados = data.cardapios || [];
                this.renderizarTabela();
            }
        } catch (error) {
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    limparFiltros() {
        const mesEl = document.getElementById('filtroMes');
        const buscaEl = document.getElementById('filtroBusca');
        if (mesEl) mesEl.value = '';
        if (buscaEl) buscaEl.value = '';
        this.cardapiosFiltrados = [...this.cardapios];
        this.renderizarTabela();
    }

    abrirModal(id = null) {
        this.editandoId = id;
        const cardapio = id ? this.cardapios.find(c => (c.id || c._id) === id) : null;

        const hoje = new Date().toISOString().split('T')[0];
        const dataInput = cardapio ? new Date(cardapio.dataReferencia).toISOString().split('T')[0] : hoje;
        const semanaAtual = cardapio?.semanaLabel || 'SEMANA 1';
        const info = cardapio?.informacoesNutricionais || {};

        const modalTitle = document.getElementById('modalTitle');
        if (modalTitle) {
            modalTitle.innerHTML = cardapio
                ? '<i class="fas fa-edit"></i> Editar Cardápio'
                : '<i class="fas fa-plus-circle"></i> Novo Cardápio';
        }

        const modalBody = document.getElementById('modalBody');
        if (modalBody) {
            modalBody.innerHTML = `
                <form id="formCardapio" onsubmit="event.preventDefault(); gestaoAdm.salvar();">
                    <div class="form-section">
                        <div class="form-section-title">
                            <i class="fas fa-calendar"></i> Data e Semana
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label><i class="fas fa-calendar-day"></i> Data <span class="required">*</span></label>
                                <input type="date" id="fieldData" class="form-control" value="${dataInput}" required>
                            </div>
                            <div class="form-group">
                                <label><i class="fas fa-tag"></i> Semana <span class="required">*</span></label>
                                <select id="fieldSemana" class="form-control" required>
                                    ${[1, 2, 3, 4, 5].map(n => `
                                        <option value="SEMANA ${n}" ${semanaAtual === `SEMANA ${n}` ? 'selected' : ''}>SEMANA ${n}</option>
                                    `).join('')}
                                </select>
                            </div>
                        </div>
                    </div>

                    <div class="form-section">
                        <div class="form-section-title">
                            <i class="fas fa-utensils"></i> Refeições do Dia
                        </div>
                        <div class="form-row three-cols">
                            <div class="form-group">
                                <label>
                                    <i class="fas fa-coffee" style="color:#3b82f6;"></i>
                                    Lanche da Manhã
                                    <span class="horario-badge">09:00</span>
                                    <span class="required">*</span>
                                </label>
                                <textarea id="fieldManha" class="form-control" placeholder="Ex: Café com leite e cuscuz" required>${cardapio?.lancamentoManha || ''}</textarea>
                            </div>
                            <div class="form-group">
                                <label>
                                    <i class="fas fa-drumstick-bite" style="color:#10b981;"></i>
                                    Almoço
                                    <span class="horario-badge">12:00</span>
                                    <span class="required">*</span>
                                </label>
                                <textarea id="fieldAlmoco" class="form-control" placeholder="Ex: Arroz, feijão, frango..." required>${cardapio?.almoco || ''}</textarea>
                            </div>
                            <div class="form-group">
                                <label>
                                    <i class="fas fa-cookie" style="color:#f59e0b;"></i>
                                    Lanche da Tarde
                                    <span class="horario-badge">15:00</span>
                                    <span class="required">*</span>
                                </label>
                                <textarea id="fieldTarde" class="form-control" placeholder="Ex: Vitamina de banana" required>${cardapio?.lancamentoTarde || ''}</textarea>
                            </div>
                        </div>
                    </div>

                    <div class="form-section">
                        <div class="form-section-title">
                            <i class="fas fa-chart-bar"></i> Informações Nutricionais (Opcional)
                        </div>
                        <div class="form-row four-cols">
                            <div class="form-group">
                                <label>Energia (kcal)</label>
                                <input type="text" id="nutEnergia" class="form-control" value="${info.energia || ''}" placeholder="1755.8">
                            </div>
                            <div class="form-group">
                                <label>PTN (g)</label>
                                <input type="text" id="nutPtn" class="form-control" value="${info.ptn || ''}" placeholder="70.40">
                            </div>
                            <div class="form-group">
                                <label>LPD (g)</label>
                                <input type="text" id="nutLpd" class="form-control" value="${info.lpd || ''}" placeholder="63.29">
                            </div>
                            <div class="form-group">
                                <label>CHO (g)</label>
                                <input type="text" id="nutCho" class="form-control" value="${info.cho || ''}" placeholder="231.6">
                            </div>
                            <div class="form-group">
                                <label>Fibra (g)</label>
                                <input type="text" id="nutFibra" class="form-control" value="${info.fibra || ''}" placeholder="16.05">
                            </div>
                            <div class="form-group">
                                <label>Cálcio (mg)</label>
                                <input type="text" id="nutCa" class="form-control" value="${info.ca || ''}" placeholder="767.5">
                            </div>
                            <div class="form-group">
                                <label>Ferro (mg)</label>
                                <input type="text" id="nutFe" class="form-control" value="${info.fe || ''}" placeholder="6.52">
                            </div>
                            <div class="form-group">
                                <label>Sódio (mg)</label>
                                <input type="text" id="nutNa" class="form-control" value="${info.na || ''}" placeholder="1287">
                            </div>
                        </div>
                    </div>
                </form>
            `;
        }

        const modalFooter = document.getElementById('modalFooter');
        if (modalFooter) {
            modalFooter.innerHTML = `
                <button class="btn-cancel" onclick="gestaoAdm.fecharModal()">Cancelar</button>
                <button class="btn-primary" onclick="gestaoAdm.salvar()">
                    <i class="fas fa-save"></i> ${cardapio ? 'Salvar Alterações' : 'Criar Cardápio'}
                </button>
            `;
        }

        const modal = document.getElementById('modal');
        if (modal) modal.style.display = 'flex';
    }

    fecharModal() {
        const modal = document.getElementById('modal');
        if (modal) modal.style.display = 'none';
        this.editandoId = null;
    }

    fecharConfirmModal() {
        const modal = document.getElementById('confirmModal');
        if (modal) modal.style.display = 'none';
    }

    async salvar() {
        const dados = {
            dataReferencia: document.getElementById('fieldData')?.value,
            semanaLabel: document.getElementById('fieldSemana')?.value,
            lancamentoManha: document.getElementById('fieldManha')?.value.trim(),
            almoco: document.getElementById('fieldAlmoco')?.value.trim(),
            lancamentoTarde: document.getElementById('fieldTarde')?.value.trim(),
            informacoesNutricionais: {
                energia: document.getElementById('nutEnergia')?.value.trim() || '',
                ptn: document.getElementById('nutPtn')?.value.trim() || '',
                lpd: document.getElementById('nutLpd')?.value.trim() || '',
                cho: document.getElementById('nutCho')?.value.trim() || '',
                fibra: document.getElementById('nutFibra')?.value.trim() || '',
                ca: document.getElementById('nutCa')?.value.trim() || '',
                fe: document.getElementById('nutFe')?.value.trim() || '',
                na: document.getElementById('nutNa')?.value.trim() || ''
            }
        };

        if (!dados.dataReferencia || !dados.lancamentoManha || !dados.almoco || !dados.lancamentoTarde) {
            this.showToast('⚠️ Preencha todos os campos obrigatórios', 'warning');
            return;
        }

        try {
            const token = localStorage.getItem('auth_token');
            const url = this.editandoId
                ? `${this.apiBase}/admin/${this.editandoId}`
                : `${this.apiBase}/admin`;
            const method = this.editandoId ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(dados)
            });

            const data = await response.json();

            if (data.success) {
                this.showToast('✅ Cardápio salvo com sucesso!', 'success');
                this.fecharModal();
                await this.carregarCardapios();
            } else {
                throw new Error(data.error || 'Erro ao salvar');
            }
        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    editar(id) {
        this.abrirModal(id);
    }

    async excluir(id) {
        const confirmar = await this.confirmar('Excluir Cardápio', 'Tem certeza que deseja excluir este cardápio?');
        if (!confirmar) return;

        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`${this.apiBase}/admin/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();

            if (data.success) {
                this.showToast('✅ Cardápio excluído!', 'success');
                await this.carregarCardapios();
            } else {
                throw new Error(data.error || 'Erro ao excluir');
            }
        } catch (error) {
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showToast(mensagem, tipo = 'info') {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const icones = { success: 'fa-check-circle', error: 'fa-times-circle', info: 'fa-info-circle', warning: 'fa-exclamation-triangle' };
        const toast = document.createElement('div');
        toast.className = `toast ${tipo}`;
        toast.innerHTML = `<i class="fas ${icones[tipo]}"></i><span>${mensagem}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }

    confirmar(titulo, mensagem) {
        return new Promise((resolve) => {
            const modal = document.getElementById('confirmModal');
            const titleEl = document.getElementById('confirmTitle');
            const msgEl = document.getElementById('confirmMessage');
            const btn = document.getElementById('confirmBtn');

            if (!modal || !titleEl || !msgEl || !btn) {
                resolve(window.confirm(mensagem));
                return;
            }

            titleEl.textContent = titulo;
            msgEl.innerHTML = `<p style="margin: 0; color: #4b5563;">${mensagem}</p>`;
            modal.style.display = 'flex';

            const handleConfirm = () => { cleanup(); resolve(true); };
            const handleCancel = () => { cleanup(); resolve(false); };
            const cleanup = () => {
                modal.style.display = 'none';
                btn.removeEventListener('click', handleConfirm);
                const cancelBtns = modal.querySelectorAll('.btn-secondary, .modal-close');
                cancelBtns.forEach(b => b.removeEventListener('click', handleCancel));
            };

            btn.addEventListener('click', handleConfirm);
            const cancelBtns = modal.querySelectorAll('.btn-secondary, .modal-close');
            cancelBtns.forEach(b => b.addEventListener('click', handleCancel));
        });
    }
}

// ============================================================================
// FUNÇÕES GLOBAIS
// ============================================================================

function toggleUserMenu(event) {
    if (event) event.stopPropagation();
    const dropdown = document.getElementById('userDropdown');
    const chevron = document.getElementById('userChevron');
    if (!dropdown) return;

    const estaAberto = dropdown.classList.toggle('active');
    if (chevron) chevron.style.transform = estaAberto ? 'rotate(180deg)' : 'rotate(0deg)';
}

/**
 * 🔔 Abre o dropdown de notificações (igual Enfermaria).
 * Marca o timestamp de abertura para a proteção anti-ghost-click.
 */
function abrirMenuNotificacoesSeguro(event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }

    // Fecha o menu do usuário
    const userDropdown = document.getElementById('userDropdown');
    const chevron = document.getElementById('userChevron');
    if (userDropdown) userDropdown.classList.remove('active');
    if (chevron) chevron.style.transform = 'rotate(0deg)';

    // Abre o dropdown de notificações
    const dd = document.getElementById('notificacoesDropdown');
    if (!dd) return;

    dd.classList.add('active');

    // 🔑 Marca o momento de abertura (anti-ghost-click)
    if (window.gestaoAdm) {
        window.gestaoAdm._notifAbertaEm = Date.now();
        window.gestaoAdm.carregarNotificacoes();
    }
}

function fecharNotificacoes() {
    const dropdown = document.getElementById('notificacoesDropdown');
    if (dropdown) dropdown.classList.remove('active');
}

function abrirNotificacao(id, link) {
    if (window.gestaoAdm) {
        window.gestaoAdm.abrirNotificacao(id, link);
    }
}

async function marcarTodasLidas() {
    try {
        const token = localStorage.getItem('auth_token');
        await fetch('/api/notificacoes/marcar-todas-lidas', {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (window.gestaoAdm) {
            window.gestaoAdm.atualizarBadges(0);
            window.gestaoAdm.carregarNotificacoes();
            window.gestaoAdm.showToast('✅ Todas marcadas como lidas', 'success');
        }
    } catch (err) { console.error(err); }
}

async function limparMinhasNotificacoes(event) {
    if (event) event.stopPropagation();
    try {
        const token = localStorage.getItem('auth_token');
        await fetch('/api/notificacoes/limpar-minhas', {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const lista = document.getElementById('notificacoesLista');
        if (lista) lista.innerHTML = '<div style="text-align:center;padding:30px 16px;color:#6c757d;"><i class="fas fa-inbox" style="font-size:2rem;margin-bottom:10px;display:block;"></i>Sem notificações</div>';
        if (window.gestaoAdm) {
            window.gestaoAdm.atualizarBadges(0);
            window.gestaoAdm.showToast('✅ Notificações limpas', 'success');
        }
    } catch (err) { console.error(err); }
}

function logout() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_data');
    window.location.href = 'login.html';
}

// ============================================================================
// BOOTSTRAP
// ============================================================================
const gestaoAdm = new GestaoAdmPanel();
window.gestaoAdm = gestaoAdm;
window.abrirNotificacao = abrirNotificacao;
window.abrirMenuNotificacoesSeguro = abrirMenuNotificacoesSeguro;
window.fecharNotificacoes = fecharNotificacoes;
window.marcarTodasLidas = marcarTodasLidas;
window.limparMinhasNotificacoes = limparMinhasNotificacoes;
window.toggleUserMenu = toggleUserMenu;
window.logout = logout;